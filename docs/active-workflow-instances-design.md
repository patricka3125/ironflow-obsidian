# Ironflow Plugin — Active Workflow Instances Feature Design

## 1. Overview

This document covers the design for **Active Workflow Instances** — the ability to create a live, executable copy of a workflow definition. An instance contains task files with populated frontmatter and rendered template bodies, ready for agent execution.

This feature builds on the existing Workflow Definitions system described in [workflow-definitions-design.md](workflow-definitions-design.md).

### 1.1 Goals

- Create active workflow instances from existing workflow definitions
- Populate all task-specific frontmatter fields at instance creation time
- Track per-task status via an `ironflow-status` frontmatter field
- Leverage Templater's "trigger on new file creation" to render task bodies automatically
- Provide a core library entrypoint for programmatic instance creation

### 1.2 Non-Goals (Future Phases)

- Instance listing, deletion, or lifecycle management
- UI modals or commands for instance creation (UX layer)
- Canvas file generation for instances
- CAO session dispatching from instances
- Status transitions or execution orchestration
- REST API endpoints for instance management

### 1.3 Key Concepts

| Concept | Description |
|---------|-------------|
| **Workflow Definition** | A reusable blueprint consisting of a `.canvas` file and a folder of task templates. Never mutated by instance creation. |
| **Task Template** | A markdown file in the definition folder with Ironflow frontmatter and template-specific fields. Contains no rendered body. |
| **Workflow Instance** | A rendered copy of a workflow definition, created under an `instances/` subdirectory with a generated or user-provided ID. |
| **Instance Task** | A markdown file in the instance directory with populated frontmatter, an `ironflow-status` field, and a Templater-rendered body. |

---

## 2. Directory & File Structure

### 2.1 Layout

Instances are stored under a fixed `instances/` subdirectory within the workflow's task folder:

```
<vault>/
└── Workflows/                                  # Configurable root folder
    ├── Test-Workflow.canvas                     # Workflow definition (unchanged)
    └── Test-Workflow/                           # Workflow task folder
        ├── Develop Phase 1.md                   # Definition task template
        ├── Review Phase 1.md                    # Definition task template
        └── instances/                           # Fixed subdirectory for all instances
            ├── run-a3f8/                        # Auto-generated instance
            │   ├── Develop Phase 1.md           # Instance task (rendered)
            │   └── Review Phase 1.md            # Instance task (rendered)
            └── sprint-1/                        # User-named instance
                ├── Develop Phase 1.md
                └── Review Phase 1.md
```

### 2.2 Instance Naming

Instance directories are named using one of two strategies:

1. **User-provided name**: Any valid folder name supplied by the caller (e.g., `sprint-1`, `hotfix-auth`).
2. **Auto-generated fallback**: `run-<hex>` where `<hex>` is 4 random hexadecimal characters (e.g., `run-a3f8`). Collisions are checked before creation.

### 2.3 Impact on Existing Code

The `instances/` subdirectory must be excluded from definition-level task listing. Currently, `TaskManager.getWorkflowTasks()` uses `listMarkdownFiles()` which recursively traverses all subdirectories. After this change, it must skip the `instances/` subtree so that instance task files are not returned as definition tasks.

---

## 3. Data Model

### 3.1 New Types

```typescript
/**
 * Status of a task within a workflow instance.
 */
export type WorkflowInstanceTaskStatus =
    | "open"
    | "pending"
    | "in-progress"
    | "done";

/**
 * An active workflow instance created from a workflow definition.
 */
export interface WorkflowInstance {
    instanceId: string;
    workflowName: string;
    instancePath: string;
    tasks: IronflowTask[];
}
```

### 3.2 Updated Frontmatter Schema

Instance task files extend the existing `IronflowTaskFrontmatter` with two additional managed fields:

| Field | Type | Description |
|-------|------|-------------|
| `ironflow-instance-id` | `string` | The instance directory name (e.g., `run-a3f8` or `sprint-1`) |
| `ironflow-status` | `WorkflowInstanceTaskStatus` | Task status, set automatically at creation time |

These fields are **only present on instance task files**, not on definition task templates.

The `IronflowTaskFrontmatter` interface gains optional instance fields:

```typescript
export interface IronflowTaskFrontmatter {
    "ironflow-template": string;
    "ironflow-workflow": string;
    "ironflow-agent-profile": string;
    "ironflow-depends-on": string[];
    "ironflow-next-tasks": string[];
    "ironflow-instance-id"?: string;
    "ironflow-status"?: WorkflowInstanceTaskStatus;
    [key: string]: unknown;
}
```

### 3.3 Instance Task Frontmatter Example

Given the `Test-Workflow` definition with task `Develop Phase 1` (template: `Development Execution`), an instance task file would contain:

```yaml
---
# Ironflow-managed fields (copied from definition task)
ironflow-template: "Development Execution"
ironflow-workflow: "Test-Workflow"
ironflow-agent-profile: ""
ironflow-depends-on: []
ironflow-next-tasks:
  - "[[Review Phase 1]]"

# Instance-specific fields (auto-populated)
ironflow-instance-id: "run-a3f8"
ironflow-status: "open"

# Template-specific fields (user-provided values)
plan-path: "Projects/my-project/plan.md"
references: "src/main.ts, docs/architecture.md"
phase: "1"
---

# Development Execution

Use the execution plan at `Projects/my-project/plan.md` as the source of truth.
Reference sources: `src/main.ts, docs/architecture.md`
...
```

Note: The template body below the frontmatter is copied from the source Templater template file (e.g., `Templates/Development Execution.md`). Templater's "trigger on new file creation" setting renders `tp.*` expressions against the populated frontmatter values.

### 3.4 Status Assignment Rules

At instance creation time, each task's status is computed from its dependencies:

| Condition | Assigned Status |
|-----------|----------------|
| `ironflow-depends-on` is empty | `open` |
| `ironflow-depends-on` has one or more entries | `pending` |

Status transitions beyond creation (`open` → `in-progress`, `pending` → `open`, etc.) are out of scope for this design.

---

## 4. Core Entrypoint

### 4.1 Module: `InstanceManager`

A new module at `src/core/InstanceManager.ts` encapsulates instance creation logic.

```typescript
export class InstanceManager {
    constructor(
        private readonly app: App,
        private readonly workflowManager: WorkflowManager,
        private readonly templateRegistry: TemplateRegistry,
        private readonly settings: IronflowSettings
    ) {}

    /**
     * Create an active workflow instance from a workflow definition.
     *
     * @param workflowName - Name of the workflow definition to instantiate.
     * @param fieldValues  - Per-task template field overrides. Keys are task names,
     *                       values are objects mapping field names to values.
     * @param instanceName - Optional human-readable instance name. Falls back to
     *                       auto-generated `run-<hex>` if omitted.
     * @returns The created workflow instance.
     */
    async createInstance(
        workflowName: string,
        fieldValues: Record<string, Record<string, unknown>>,
        instanceName?: string
    ): Promise<WorkflowInstance>
}
```

### 4.2 Creation Algorithm

```
createInstance(workflowName, fieldValues, instanceName?):

1. Load the workflow definition:
   workflow = workflowManager.getWorkflow(workflowName)
   if workflow is null → throw "Workflow not found"
   if workflow.tasks is empty → throw "Workflow has no tasks"

2. Resolve instance ID:
   instanceId = instanceName ?? generateInstanceId()
   // generateInstanceId() produces "run-" + 4 random hex chars

3. Validate instance does not already exist:
   instancePath = getInstancePath(workflowFolder, workflowName, instanceId)
   if folder exists at instancePath → throw "Instance already exists"

4. Ensure the instances/ subdirectory exists:
   instancesFolderPath = getInstancesFolderPath(workflowFolder, workflowName)
   create folder if it does not exist

5. Create the instance directory:
   create folder at instancePath

6. For each task in workflow.tasks:
   a. Read the definition task's frontmatter (already loaded from step 1)

   b. Look up the source Templater template:
      templateName = task.frontmatter["ironflow-template"]
      template = templateRegistry.getTemplate(templateName)
      if template is null → throw "Template not found for task"
      templateFile = vault.getFileByPath(template.filePath)
      templateContent = vault.read(templateFile)
      templateBody = stripFrontmatter(templateContent)

   c. Merge user-provided field values:
      taskFieldValues = fieldValues[task.name] ?? {}
      Validate all template-specific fields are provided (see §4.3)

   d. Compute ironflow-status:
      status = task.frontmatter["ironflow-depends-on"].length === 0
             ? "open" : "pending"

   e. Build the complete frontmatter:
      {
        ...task.frontmatter,          // all definition fields
        ...taskFieldValues,            // user overrides for template fields
        "ironflow-instance-id": instanceId,
        "ironflow-status": status,
      }

   f. Build file content:
      content = updateFrontmatter(templateBody, completeFrontmatter)
      // This places frontmatter block before the template body

   g. Create the instance task file:
      taskPath = getInstanceTaskPath(workflowFolder, workflowName,
                                     instanceId, task.name)
      vault.create(taskPath, content)
      // Templater auto-renders tp.* expressions on file creation

7. Return WorkflowInstance:
   {
     instanceId,
     workflowName,
     instancePath,
     tasks: [...created task objects]
   }
```

### 4.3 Field Validation

All template-specific frontmatter fields must be provided in `fieldValues` for each task. Template-specific fields are identified by excluding the managed `ironflow-*` keys from the definition task's frontmatter.

For each task:
1. Extract template-specific field keys from the definition task frontmatter (all keys not prefixed with `ironflow-`).
2. Check that `fieldValues[taskName]` contains entries for all of these keys.
3. If any required field is missing, throw an error listing the missing fields and the task name.

Dependency-related fields (`ironflow-depends-on`, `ironflow-next-tasks`) are copied from the definition as-is and are not subject to user overrides. The `ironflow-agent-profile` field is also copied from the definition.

---

## 5. Path Utilities

### 5.1 New Functions in `workflowPaths.ts`

```typescript
/** Fixed subdirectory name for workflow instances. */
export const INSTANCES_FOLDER_NAME = "instances";

/**
 * Build the vault path for a workflow's instances directory.
 * e.g., "Workflows/Test-Workflow/instances"
 */
export function getInstancesFolderPath(
    workflowFolder: string,
    workflowName: string
): string {
    return `${getWorkflowTaskFolderPath(workflowFolder, workflowName)}/${INSTANCES_FOLDER_NAME}`;
}

/**
 * Build the vault path for a specific instance directory.
 * e.g., "Workflows/Test-Workflow/instances/run-a3f8"
 */
export function getInstancePath(
    workflowFolder: string,
    workflowName: string,
    instanceId: string
): string {
    return `${getInstancesFolderPath(workflowFolder, workflowName)}/${instanceId}`;
}

/**
 * Build the vault path for a task file within an instance.
 * e.g., "Workflows/Test-Workflow/instances/run-a3f8/Develop Phase 1.md"
 */
export function getInstanceTaskPath(
    workflowFolder: string,
    workflowName: string,
    instanceId: string,
    taskName: string
): string {
    return `${getInstancePath(workflowFolder, workflowName, instanceId)}/${taskName}.md`;
}
```

---

## 6. Modifications to Existing Code

### 6.1 `vaultUtils.ts` — Filter `instances/` from Task Listing

Update `listMarkdownFiles()` to accept an optional set of folder names to exclude:

```typescript
export function listMarkdownFiles(
    folder: TFolder,
    excludeFolderNames?: Set<string>
): TFile[] {
    const markdownFiles: TFile[] = [];

    for (const child of folder.children) {
        if (isFolder(child)) {
            if (excludeFolderNames?.has(child.name)) {
                continue;
            }
            markdownFiles.push(...listMarkdownFiles(child, excludeFolderNames));
            continue;
        }

        if (isMarkdownFile(child)) {
            markdownFiles.push(child);
        }
    }

    return markdownFiles;
}
```

### 6.2 `TaskManager.getWorkflowTasks()` — Pass Exclusion Filter

```typescript
async getWorkflowTasks(workflowName: string): Promise<IronflowTask[]> {
    // ... existing folder lookup ...

    const taskFiles = listMarkdownFiles(
        workflowFolder,
        new Set([INSTANCES_FOLDER_NAME])
    ).sort(/* ... */);

    // ... rest unchanged ...
}
```

### 6.3 `types.ts` — Add Instance Types

Add `WorkflowInstanceTaskStatus` type and `WorkflowInstance` interface as described in §3.1. Add optional `ironflow-instance-id` and `ironflow-status` to `IronflowTaskFrontmatter` as described in §3.2.

### 6.4 `taskUtils.ts` — Update `normalizeIronflowTaskFrontmatter()`

Add normalization for the two new optional fields:

```typescript
export function normalizeIronflowTaskFrontmatter(
    frontmatter: Record<string, unknown>
): IronflowTaskFrontmatter {
    return {
        ...frontmatter,
        "ironflow-template": toStringValue(frontmatter["ironflow-template"]),
        "ironflow-workflow": toStringValue(frontmatter["ironflow-workflow"]),
        "ironflow-agent-profile": toStringValue(frontmatter["ironflow-agent-profile"]),
        "ironflow-depends-on": toStringArray(frontmatter["ironflow-depends-on"]),
        "ironflow-next-tasks": toStringArray(frontmatter["ironflow-next-tasks"]),
        // Instance fields (optional — undefined when absent)
        ...(frontmatter["ironflow-instance-id"] !== undefined && {
            "ironflow-instance-id": toStringValue(frontmatter["ironflow-instance-id"]),
        }),
        ...(frontmatter["ironflow-status"] !== undefined && {
            "ironflow-status": toInstanceStatus(frontmatter["ironflow-status"]),
        }),
    };
}
```

---

## 7. Templater Integration

### 7.1 Rendering Timing

Instance creation relies on the Templater plugin setting **"Trigger Templater on new file creation"** being enabled. The rendering flow is:

```
1. InstanceManager builds file content:
   frontmatter (fully populated) + template body (raw tp.* expressions)
        │
2. vault.create(path, content)
        │
3. Templater intercepts the file creation event
        │
4. Templater evaluates tp.* expressions in the body:
   - tp.frontmatter["plan-path"] → reads populated value from step 1
   - tp.frontmatter["phase"] → reads populated value from step 1
        │
5. Templater writes the rendered body back to the file
        │
6. Final file: populated frontmatter + rendered body
```

### 7.2 Sequencing Constraint

The frontmatter **must** be fully populated before `vault.create()` is called, because Templater reads frontmatter values during rendering. If frontmatter were empty or partially filled, `tp.frontmatter[...]` expressions would resolve to `null` or empty strings.

This is already the pattern used by `TaskManager.createTask()` — build the complete content string, then create the file in a single call.

### 7.3 Template Body Source

The template body is sourced from the **original Templater template file** (e.g., `Templates/Development Execution.md`), not from the definition task file. Definition task files typically have no body — they only store frontmatter configuration.

The template is looked up via the `ironflow-template` field on the definition task's frontmatter, then resolved through the `TemplateRegistry`.

---

## 8. Verification

### 8.1 Unit Tests

Using the existing `FakeVault` mock infrastructure in `test/mocks/fakeVault.ts`:

**Instance creation tests:**
- Creates instance directory under `instances/`
- Creates one task file per definition task
- Instance task frontmatter contains all definition fields + user-provided values
- Instance task frontmatter contains `ironflow-instance-id` matching the instance directory name
- Tasks with no dependencies get `ironflow-status: "open"`
- Tasks with dependencies get `ironflow-status: "pending"`
- Instance task files include the source template body
- Auto-generated instance IDs follow the `run-<hex>` format
- User-provided instance names are used as the directory name

**Validation tests:**
- Throws when workflow does not exist
- Throws when workflow has no tasks
- Throws when instance directory already exists
- Throws when required template fields are missing from `fieldValues`
- Throws when a task's source template is not found in the registry

**Existing code regression tests:**
- `getWorkflowTasks()` does not return files from `instances/` subdirectory
- Existing workflow definition CRUD operations are unaffected

### 8.2 Manual Verification

1. Open the development vault with the `Test-Workflow` definition
2. Invoke `InstanceManager.createInstance("Test-Workflow", fieldValues, "test-run")` (via command or test harness)
3. Verify directory created at `Workflows/Test-Workflow/instances/test-run/`
4. Verify `Develop Phase 1.md` and `Review Phase 1.md` exist in the instance directory
5. Verify frontmatter contains `ironflow-instance-id: "test-run"` and correct `ironflow-status` values
6. Verify template body is rendered by Templater (no remaining `tp.*` expressions)
7. Verify `Ironflow: Add Task` and task property panel still work correctly with the definition (no instance file contamination)
