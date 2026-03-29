---
design-path: docs/active-workflow-instances-design.md
---

# Active Workflow Instances — Implementation Plan

## Phase 1: Foundation — Types and Utilities

Status: Complete (2026-03-29)

### Phase Goal

Establish the new type definitions and pure utility functions that all subsequent phases depend on. No existing behavior is modified.

### Phase Acceptance Criteria

- `WorkflowInstanceTaskStatus` type and `WorkflowInstance` interface are exported from `src/types.ts`.
- Instance path helper functions are exported from `src/core/workflowPaths.ts` and covered by unit tests.
- An instance ID generation function exists with a `run-<hex>` format and is covered by unit tests.

### Tasks

#### Task 1.1: Add instance types to `types.ts`

**Description**: Add the `WorkflowInstanceTaskStatus` type alias and `WorkflowInstance` interface to `src/types.ts`. Add optional `ironflow-instance-id` and `ironflow-status` fields to the existing `IronflowTaskFrontmatter` interface.

**Acceptance Criteria**:
- `WorkflowInstanceTaskStatus` is a union type of `"open" | "pending" | "in-progress" | "done"`.
- `WorkflowInstance` has fields: `instanceId: string`, `workflowName: string`, `instancePath: string`, `tasks: IronflowTask[]`.
- `IronflowTaskFrontmatter` includes optional `"ironflow-instance-id"?: string` and `"ironflow-status"?: WorkflowInstanceTaskStatus`.
- All new types are exported.
- Existing type usages compile without errors (`npm run build` passes).

#### Task 1.2: Add instance path utilities to `workflowPaths.ts`

**Description**: Add the `INSTANCES_FOLDER_NAME` constant and three new path-building functions to `src/core/workflowPaths.ts`: `getInstancesFolderPath()`, `getInstancePath()`, and `getInstanceTaskPath()`. Add unit tests for each function.

**Acceptance Criteria**:
- `INSTANCES_FOLDER_NAME` is exported as `"instances"`.
- `getInstancesFolderPath("Workflows", "my-wf")` returns `"Workflows/my-wf/instances"`.
- `getInstancePath("Workflows", "my-wf", "run-a3f8")` returns `"Workflows/my-wf/instances/run-a3f8"`.
- `getInstanceTaskPath("Workflows", "my-wf", "run-a3f8", "task-a")` returns `"Workflows/my-wf/instances/run-a3f8/task-a.md"`.
- Unit tests verify each function with at least one representative input.

#### Task 1.3: Add instance ID generation utility

**Description**: Create a `generateInstanceId()` function that produces IDs in the format `run-<hex>` where `<hex>` is 4 random hexadecimal characters. This can live in `src/core/instanceUtils.ts` or alongside the `InstanceManager` module. Add unit tests.

**Acceptance Criteria**:
- `generateInstanceId()` returns a string matching the pattern `/^run-[0-9a-f]{4}$/`.
- Unit test verifies the format across multiple invocations.
- Unit test verifies that the function produces varying output (not constant).

---

## Phase 2: Existing Code Compatibility

Status: Complete (2026-03-29)

### Phase Goal

Update existing modules so that definition-level operations correctly exclude instance files from the `instances/` subdirectory, and frontmatter normalization handles the new optional instance fields. No new features are added — this phase protects existing behavior.

### Phase Acceptance Criteria

- `TaskManager.getWorkflowTasks()` does not return task files that reside under an `instances/` subdirectory.
- `normalizeIronflowTaskFrontmatter()` correctly normalizes `ironflow-instance-id` and `ironflow-status` when present, and omits them when absent.
- All existing tests continue to pass.
- New regression and unit tests cover the modified behavior.

### Tasks

#### Task 2.1: Update `listMarkdownFiles()` and `TaskManager.getWorkflowTasks()` to exclude instance files

**Description**: Modify `listMarkdownFiles()` in `src/core/vaultUtils.ts` to accept an optional `excludeFolderNames: Set<string>` parameter. When a subfolder's name is in the exclusion set, it and all its descendants are skipped. Then update `TaskManager.getWorkflowTasks()` in `src/core/TaskManager.ts` to pass `new Set([INSTANCES_FOLDER_NAME])` to `listMarkdownFiles()`. Add tests for both changes.

**Acceptance Criteria**:
- `listMarkdownFiles(folder)` with no exclusion set behaves identically to the current implementation (backward compatible).
- `listMarkdownFiles(folder, new Set(["instances"]))` skips any child folder named `"instances"` and all files within it.
- `TaskManager.getWorkflowTasks()` does not return markdown files located under `<workflowFolder>/<workflowName>/instances/`.
- A regression test creates files both inside and outside the `instances/` subdirectory and verifies only non-instance files are returned.
- All existing workflow management tests continue to pass.

#### Task 2.2: Update `normalizeIronflowTaskFrontmatter()` for instance fields

**Description**: Modify `normalizeIronflowTaskFrontmatter()` in `src/core/taskUtils.ts` to conditionally include `ironflow-instance-id` (normalized via `toStringValue()`) and `ironflow-status` (normalized via a new `toInstanceStatus()` helper) when those keys are present in the input. When absent, the fields should not appear in the output. Add the `toInstanceStatus()` helper function. Add unit tests.

**Acceptance Criteria**:
- When `ironflow-instance-id` is present in the input, the output includes it as a string.
- When `ironflow-status` is present with a valid status value, the output includes it as a `WorkflowInstanceTaskStatus`.
- When `ironflow-status` is present with an invalid value, it falls back to `"pending"`.
- When neither field is present (definition task files), the output does not contain `ironflow-instance-id` or `ironflow-status` keys.
- Unit tests cover: valid instance fields present, invalid status value, fields absent.

---

## Phase 3: Instance Creation

Status: Complete (2026-03-29)

### Phase Goal

Implement the `InstanceManager` class with the `createInstance()` method as the core entrypoint for creating active workflow instances. This is the primary deliverable of the feature.

### Phase Acceptance Criteria

- `InstanceManager.createInstance()` creates an instance directory under `<workflowFolder>/<workflowName>/instances/<instanceId>/`.
- One task file is created per definition task, with fully populated frontmatter and template body.
- `ironflow-status` is set to `"open"` for tasks with no dependencies and `"pending"` for tasks with dependencies.
- `ironflow-instance-id` is set on all instance task files.
- Field validation rejects missing template-specific fields.
- Error cases (missing workflow, duplicate instance, missing template) throw descriptive errors.
- All behavior is covered by unit tests using the existing `FakeVault` mock.

### Tasks

#### Task 3.1: Implement `InstanceManager` class

**Description**: Create `src/core/InstanceManager.ts` with the `InstanceManager` class. Implement `createInstance(workflowName, fieldValues, instanceName?)` following the algorithm in design §4.2. The method should:
1. Load the workflow definition via `WorkflowManager.getWorkflow()`.
2. Resolve or generate the instance ID.
3. Validate the instance does not already exist.
4. Create the `instances/` and instance directories.
5. For each definition task: validate field values, look up the source template body via `TemplateRegistry`, compute status, build frontmatter + body content, create the file.
6. Return a `WorkflowInstance` object.

Include the field validation logic described in design §4.3: extract template-specific field keys (non-`ironflow-*` keys) from definition task frontmatter, verify all are provided in `fieldValues[taskName]`, and throw with a descriptive error listing missing fields if not.

**Acceptance Criteria**:
- `createInstance()` with valid inputs creates the expected directory structure and task files.
- Each instance task file contains: all ironflow fields from the definition, user-provided field values, `ironflow-instance-id`, `ironflow-status`, and the source template body.
- Status is `"open"` when `ironflow-depends-on` is empty, `"pending"` otherwise.
- User-provided `instanceName` is used as the directory name.
- When `instanceName` is omitted, a `run-<hex>` ID is generated.
- Throws when: workflow not found, workflow has no tasks, instance already exists, template not found for a task, required fields missing.
- The method uses `stripFrontmatter()` to extract the template body and `updateFrontmatter()` to build the final file content (reuse existing utilities).

#### Task 3.2: Write unit tests for `InstanceManager`

**Description**: Create `test/instance-management.test.ts` with comprehensive tests for `InstanceManager.createInstance()`. Use the existing `FakeVault` mock and `createTemplateRegistryStub` pattern from `test/workflow-management.test.ts`.

**Acceptance Criteria**:

Happy-path tests:
- Creates instance directory at the correct path under `instances/`.
- Creates one markdown file per definition task in the instance directory.
- Instance task frontmatter includes all definition fields merged with user-provided values.
- `ironflow-instance-id` matches the instance directory name.
- Tasks with empty `ironflow-depends-on` have `ironflow-status: "open"`.
- Tasks with non-empty `ironflow-depends-on` have `ironflow-status: "pending"`.
- Instance task files contain the source template body (raw content after frontmatter).
- User-provided instance name is used as directory name.
- Auto-generated instance ID matches `/^run-[0-9a-f]{4}$/`.

Error-path tests:
- Throws when workflow does not exist.
- Throws when workflow has no tasks.
- Throws when instance directory already exists.
- Throws when required template-specific fields are missing from `fieldValues`.
- Throws when a task references a template not found in the registry.

---

## Phase 4: Plugin Integration

Note: Before Phase 4 is considered complete, update task-path recognition so instance task files under `instances/<instanceId>/` are treated as workflow task files where appropriate. Today `getWorkflowNameFromTaskPath()` only matches definition task paths with a single segment after the workflow name, which is insufficient for instance file paths.

### Phase Goal

Wire `InstanceManager` into the plugin lifecycle so it is available for programmatic use by commands, REST API routes, or other future features.

### Phase Acceptance Criteria

- `InstanceManager` is instantiated during plugin `onload()` and accessible as a property on the plugin instance.
- The plugin builds and loads successfully with `InstanceManager` initialized.
- No new commands or UI elements are added (UX is out of scope).

### Tasks

#### Task 4.1: Initialize `InstanceManager` in plugin lifecycle

**Description**: In `src/main.ts`, instantiate `InstanceManager` alongside the existing managers (`WorkflowManager`, `TaskManager`, `TemplateRegistry`, `CanvasWriter`) during `onload()`. Expose it as a public property on the `IronflowPlugin` class.

**Acceptance Criteria**:
- `IronflowPlugin` has a public `instanceManager: InstanceManager` property.
- `InstanceManager` is constructed with the `app`, `workflowManager`, `templateRegistry`, and `settings` dependencies.
- `npm run build` succeeds.
- All existing tests pass.
