# Ironflow Plugin — Workflow Definitions Feature Design

## 1. Overview

Ironflow is an Obsidian plugin that extends the [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api) to turn Obsidian into an agent orchestration hub. This document covers the design for **Phase 1: Workflow Definitions** — the ability to define reusable, multi-task workflows that integrate with [Templater](https://github.com/SilentVoid13/Templater) templates and [CLI Agent Orchestrator (CAO)](https://github.com/awslabs/cli-agent-orchestrator) agent profiles.

### 1.1 Goals

- Define reusable workflows consisting of multiple task templates
- Visualize workflows as Obsidian Canvas files with dependency arrows
- Derive tasks from existing Templater templates with editable frontmatter fields
- Provide a side panel for configuring task properties and dependencies
- Expose workflow definitions via REST API for external tooling (deferred — see implementation plan Phase 5)

### 1.2 Non-Goals (Future Phases)

- Workflow execution / triggering (instance creation with random ID)
- Runtime task status tracking
- CAO session management from within the plugin
- Agent profile auto-discovery from CAO file system
- API endpoints for triggering or managing workflow instances

### 1.3 Key Concepts

| Concept | Description |
|---------|-------------|
| **Workflow Definition** | A reusable blueprint consisting of a `.canvas` file and a folder of task templates. Never mutated by execution. |
| **Task Template** | A markdown file derived from a Templater template. Contains Ironflow-specific frontmatter (agent profile, dependencies) plus template-specific fields. |
| **Workflow Instance** | (Future) A rendered copy of a workflow definition, created at trigger time with a generated ID. Contains executed task files with runtime state. |

---

## 2. Research Findings

### 2.1 Obsidian Plugin Development

Obsidian plugins are developed in TypeScript and bundled with esbuild. The core APIs used by this plugin:

| API | Usage |
|-----|-------|
| `Plugin` | Base class for plugin lifecycle (`onload`, `onunload`) |
| `ItemView` | Custom side panel views registered in the workspace |
| `Modal` | Popup dialogs for user input (workflow/task creation) |
| `Setting` | UI component for building settings forms and property editors |
| `MetadataCache` | Access to parsed frontmatter from markdown files |
| `Vault` | File system operations (`read`, `modify`, `create`, `delete`) |
| `WorkspaceLeaf` | Manages view panels in the workspace |
| `file-open` event | Fired when user focuses a file node in a canvas (public API, v1.1.1+) |

### 2.2 Obsidian Canvas

Canvas files (`.canvas`) use the [JSON Canvas](https://jsoncanvas.org/spec/1.0/) open specification. The format is:

```json
{
  "nodes": [
    {
      "id": "unique-id",
      "type": "file",
      "file": "path/to/note.md",
      "x": 0, "y": 0,
      "width": 400, "height": 300
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "fromNode": "node-a",
      "toNode": "node-b",
      "fromSide": "right",
      "toSide": "left",
      "toEnd": "arrow"
    }
  ]
}
```

**Node types**: `text`, `file`, `link`, `group`. Ironflow tasks use `file` nodes pointing to task template markdown files.

**Edge properties**: `id`, `fromNode`, `toNode`, `fromSide` (optional: `top`/`right`/`bottom`/`left`), `toSide` (optional), `fromEnd` (default `none`), `toEnd` (default `arrow`), `color` (optional), `label` (optional).

**Canvas API status**: The JSON Canvas file format and type definitions (`obsidian/canvas`) are fully public. However, the runtime Canvas API (node selection, edge creation, live rendering) is entirely **undocumented and internal**. Community plugins that extend canvas behavior use monkey-patching via `monkey-around`, which is fragile and can break across Obsidian updates.

**Design decision**: This plugin does **not** monkey-patch the canvas runtime. The canvas is treated as a read-only visualization layer. All task configuration is done through the side panel, and the plugin writes edges to the `.canvas` JSON file directly via `app.vault.modify()`. When the user opens/reloads the canvas, Obsidian renders the arrows from the file.

Official TypeScript types are available at [`obsidian-api/canvas.d.ts`](https://github.com/obsidianmd/obsidian-api/blob/master/canvas.d.ts) and imported as:
```typescript
import { CanvasData, AllCanvasNodeData, CanvasEdgeData } from "obsidian/canvas";
```

### 2.3 Templater Integration

[Templater](https://github.com/SilentVoid13/Templater) is a hard dependency. The plugin uses Templater to:

1. **Discover templates**: Scan the configured template folder for `.md` files
2. **Extract field schemas**: Parse frontmatter to determine what fields a template expects
3. **Render task files**: Invoke Templater programmatically to execute `tp.*` expressions when creating task template copies

Example Templater template with frontmatter parameters:
```yaml
---
current-branch:
target-branch:
provider: ""
---
<%*
const fm = tp.frontmatter ?? {};
const currentBranch = fm["current-branch"] ?? "";
// ... template logic using frontmatter values
%>
```

Templater can be accessed programmatically within an Obsidian plugin via:
```typescript
const templater = this.app.plugins.getPlugin("templater-obsidian");
```

The plugin's internal API exposes methods for creating notes from templates and triggering template rendering on existing files.

### 2.4 obsidian-local-rest-api Extension

The existing codebase is a plugin extension for [obsidian-local-rest-api](https://github.com/coddingtonbear/obsidian-local-rest-api). It registers custom Express-style routes:

```typescript
const api = getAPI(this.app, this.manifest);
api.addRoute("/my-route/").get((request, response) => {
    response.status(200).json({ data: "..." });
});
```

On plugin unload, `api.unregister()` removes all registered routes. This pattern is used for all Ironflow REST API endpoints.

### 2.5 CLI Agent Orchestrator (CAO)

CAO manages AI agent sessions via a REST API at `localhost:9889`. Key concepts relevant to Ironflow:

**Agent profiles** are markdown files with YAML frontmatter:
```yaml
---
name: developer
description: Developer Agent in a multi-agent system
provider: claude_code
mcpServers:
  cao-mcp-server:
    type: stdio
    command: uvx
    args: [...]
---
# System prompt content...
```

Required fields: `name`, `description`. Optional: `provider`, `mcpServers`, `tools`, `model`.

**CAO API** (relevant endpoints for future phases):
- `POST /sessions` — create session with `provider` + `agent_profile`
- `POST /terminals/{id}/input` — send input to agent terminal
- `GET /terminals/{id}/output` — get agent output
- Terminal statuses: `idle`, `processing`, `completed`, `waiting_user_answer`, `error`

For Phase 1, the agent profile field on task templates is a plain text string (no validation against CAO). Future phases will use the CAO API to execute workflows.

---

## 3. Tech Stack

| Tool | Purpose |
|------|---------|
| **TypeScript** | Primary language (required by Obsidian plugin API) |
| **esbuild** | Bundler (already configured in project) |
| **npm** | Package manager |
| **obsidian** | Plugin API — `Plugin`, `ItemView`, `Modal`, `Setting`, `MetadataCache`, `Vault` |
| **obsidian/canvas** | JSON Canvas type definitions for `.canvas` file I/O |
| **obsidian-local-rest-api** | REST API extension framework |
| **templater-obsidian** | Hard dependency — template discovery, rendering, frontmatter extraction |

**Not needed**: React (Obsidian's built-in `Setting`/`ItemView` components are sufficient), `monkey-around` (no canvas runtime patching), any CSS framework (use `styles.css` with Obsidian CSS variables).

---

## 4. Development Conventions

### 4.1 TypeScript Configuration

Enable full strict mode in `tsconfig.json`. The current config has `noImplicitAny` and `strictNullChecks` individually, but the new codebase should use `"strict": true` which enables all strict checks (`noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `noImplicitThis`, `alwaysStrict`). This is important for the frontmatter parsing layer where values are frequently `unknown` or `undefined`.

Update the include path and module target to reflect the `src/` restructure:

```json
{
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES6",
    "allowJs": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"]
  },
  "include": ["src/**/*.ts"]
}
```

### 4.2 Project Restructure

The current `main.ts` sits at the project root. All source code moves to `src/`, with `src/main.ts` as the new entry point. The esbuild config must be updated accordingly:

```javascript
// esbuild.config.mjs — change entryPoints
entryPoints: ["src/main.ts"],
```

The output remains `main.js` at the project root (Obsidian expects this).

### 4.3 Package Manager

**npm** — no change from current setup. Bun offers no meaningful benefit here since:
- Bundling is handled by esbuild (not Bun's bundler)
- Runtime is Obsidian's Electron process (not Bun's runtime)
- The Obsidian plugin ecosystem standardizes on npm
- `package-lock.json` is already present

### 4.4 No Additional UI Frameworks

Obsidian's built-in UI primitives are sufficient for all views in this plugin:
- `Setting` — form fields (text inputs, dropdowns, toggles, text areas)
- `ItemView` — side panel lifecycle and container
- `Modal` — popup dialogs for user input
- `Notice` — toast notifications

Adding React or any other UI framework would increase bundle size, add build complexity, and conflict with Obsidian's DOM management. Not needed.

### 4.5 Frontmatter Manipulation

Obsidian's `MetadataCache` provides **read-only** access to parsed frontmatter. Writing frontmatter requires raw string manipulation:

1. Read the file content via `app.vault.read(file)`
2. Extract the YAML block between the opening and closing `---` delimiters
3. Parse the YAML string into an object (use a lightweight YAML library or manual parsing)
4. Modify the object
5. Serialize back to YAML
6. Replace the original frontmatter block in the file content
7. Write back via `app.vault.modify(file, newContent)`

A small utility module (`src/core/frontmatter.ts`) encapsulates this logic. It must:
- Preserve non-frontmatter content exactly (template body, Templater expressions)
- Handle edge cases: missing frontmatter, empty frontmatter, non-string values (arrays, numbers)
- Not introduce trailing whitespace or formatting changes outside the frontmatter block

### 4.6 Dependency Updates

The current `package.json` has outdated dependencies (TypeScript 4.7, `@types/node` 16). These should be updated at implementation time to current stable versions. This is an implementation task, not an architectural concern, but noted here for completeness.

---

## 5. File & Data Model

### 4.1 Directory Structure

```
<vault>/
└── Workflows/                              # Configurable root folder
    ├── my-workflow.canvas                  # Workflow definition (visual layout + edges)
    └── my-workflow/                        # Task templates for this workflow
        ├── build-feature.md                # Ironflow task template
        ├── review-code.md                  # Ironflow task template
        └── run-tests.md                    # Ironflow task template
```

A workflow definition consists of:
1. A `.canvas` file — visual layout of task nodes and dependency edges
2. A sibling directory with the same name — contains the task template markdown files

### 4.2 Task Template Frontmatter Schema

Every task template contains Ironflow-managed frontmatter fields prefixed with `ironflow-`, plus fields inherited from the source Templater template:

```yaml
---
# Ironflow-managed fields
ironflow-template: "Review Cycle Prompt"     # Source Templater template name
ironflow-workflow: "my-workflow"              # Parent workflow name
ironflow-agent-profile: "developer"          # CAO agent profile (free text)
ironflow-depends-on:                         # Internal links to upstream tasks
  - "[[build-feature]]"
ironflow-next-tasks:                         # Internal links to downstream tasks
  - "[[run-tests]]"

# Template-specific fields (from source Templater template)
current-branch: "feature/auth"
target-branch: "main"
provider: "claude_code"
---

# Template body content (may include Templater expressions)
<%*
const fm = tp.frontmatter ?? {};
// ...
%>
```

### 4.3 Canvas Data Model

The `.canvas` file uses standard JSON Canvas format. Ironflow tasks are `file` type nodes:

```json
{
  "nodes": [
    {
      "id": "abc123",
      "type": "file",
      "file": "Workflows/my-workflow/build-feature.md",
      "x": 0,
      "y": 0,
      "width": 400,
      "height": 300
    },
    {
      "id": "def456",
      "type": "file",
      "file": "Workflows/my-workflow/review-code.md",
      "x": 500,
      "y": 0,
      "width": 400,
      "height": 300
    }
  ],
  "edges": [
    {
      "id": "edge-001",
      "fromNode": "abc123",
      "toNode": "def456",
      "fromSide": "right",
      "toSide": "left",
      "toEnd": "arrow"
    }
  ]
}
```

Edges are computed from task frontmatter (`ironflow-next-tasks` / `ironflow-depends-on`) and written to the canvas file by the `CanvasWriter` module. The direction convention is: an edge from A → B means "A must complete before B" (A is upstream of B).

### 4.4 Plugin Settings

```typescript
interface IronflowSettings {
    workflowFolder: string;     // Default: "Workflows"
    templateFolder: string;     // Default: "Templates" (should match Templater config)
}
```

---

## 6. Architecture

### 6.1 Module Structure

```
src/
├── main.ts                        # Plugin entry, lifecycle, route registration
├── types.ts                       # Shared interfaces (IronflowTask, IronflowWorkflow, etc.)
│
├── core/
│   ├── WorkflowManager.ts         # CRUD for workflow definitions (.canvas + task folder)
│   ├── TaskManager.ts             # CRUD for task templates (markdown files)
│   ├── TemplateRegistry.ts        # Discovers & parses Templater templates
│   └── CanvasWriter.ts            # Computes edges from frontmatter, writes .canvas JSON
│
├── views/
│   ├── TaskPropertyPanel.ts       # Side panel (ItemView) for editing task frontmatter
│   └── WorkflowCommandModal.ts    # Modal for creating workflows / adding tasks
│
├── api/
│   └── routes.ts                  # REST API route definitions
│
└── settings/
    └── SettingsTab.ts             # Plugin settings tab
```

### 6.2 Module Responsibilities

#### `main.ts` — Plugin Entry Point

Extends `Plugin`. Responsible for:
- Registering the side panel view (`TaskPropertyPanel`)
- Registering commands (create workflow, add task)
- Initializing core managers (`WorkflowManager`, `TaskManager`, `TemplateRegistry`)
- Registering REST API routes via `obsidian-local-rest-api`
- Listening for `file-open` events to update the side panel when a canvas file node is selected
- Verifying Templater plugin is enabled on load

```typescript
export default class IronflowPlugin extends Plugin {
    api: LocalRestApiPublicApi;
    workflowManager: WorkflowManager;
    taskManager: TaskManager;
    templateRegistry: TemplateRegistry;
    settings: IronflowSettings;

    async onload() {
        // Load settings
        // Verify Templater dependency
        // Initialize core managers
        // Register views, commands, events
        // Register REST API routes
    }

    onunload() {
        this.api?.unregister();
    }
}
```

#### `types.ts` — Shared Interfaces

```typescript
export interface IronflowSettings {
    workflowFolder: string;
    templateFolder: string;
}

export interface IronflowTaskFrontmatter {
    "ironflow-template": string;
    "ironflow-workflow": string;
    "ironflow-agent-profile": string;
    "ironflow-depends-on": string[];
    "ironflow-next-tasks": string[];
    [key: string]: unknown;  // Template-specific fields
}

export interface IronflowTask {
    name: string;
    filePath: string;
    frontmatter: IronflowTaskFrontmatter;
    canvasNodeId: string | null;
}

export interface IronflowWorkflow {
    name: string;
    canvasPath: string;
    taskFolderPath: string;
    tasks: IronflowTask[];
}

export interface TemplateSchema {
    name: string;
    filePath: string;
    fields: TemplateField[];
}

export interface TemplateField {
    key: string;
    defaultValue: unknown;
}
```

#### `core/TemplateRegistry.ts` — Template Discovery

Scans the template folder on plugin load and watches for changes. Extracts the frontmatter field schema from each template.

```typescript
export class TemplateRegistry {
    private templates: Map<string, TemplateSchema> = new Map();

    constructor(private app: App, private templateFolder: string) {}

    async initialize(): Promise<void>
    // Scan templateFolder, parse frontmatter from each .md file,
    // build TemplateSchema entries. Register file watchers for changes.

    getTemplates(): TemplateSchema[]
    // Return all discovered templates

    getTemplate(name: string): TemplateSchema | null
    // Return a specific template's schema

    getFieldSchema(name: string): TemplateField[]
    // Return the frontmatter fields a template expects
}
```

**Implementation notes**:
- Use `app.vault.getAbstractFileByPath()` to access the template folder
- Use `app.metadataCache.getFileCache()` to read frontmatter without parsing YAML manually
- Listen to `app.metadataCache.on("changed")` and `app.vault.on("create"/"delete")` to keep the registry in sync

#### `core/TaskManager.ts` — Task Template CRUD

Creates, reads, updates, and deletes task template markdown files.

```typescript
export class TaskManager {
    constructor(
        private app: App,
        private templateRegistry: TemplateRegistry,
        private settings: IronflowSettings
    ) {}

    async createTask(
        workflowName: string,
        taskName: string,
        templateName: string
    ): Promise<IronflowTask>
    // 1. Get template schema from TemplateRegistry
    // 2. Create markdown file at Workflows/<workflowName>/<taskName>.md
    // 3. Populate with Ironflow frontmatter + template frontmatter defaults
    // 4. Copy template body content (including Templater expressions)
    // 5. Return the created task

    async getTask(filePath: string): Promise<IronflowTask | null>
    // Read file, parse frontmatter, return structured task

    async updateTaskFrontmatter(
        filePath: string,
        updates: Partial<IronflowTaskFrontmatter>
    ): Promise<void>
    // Read file, update frontmatter fields, write back

    async deleteTask(filePath: string): Promise<void>
    // Delete the task file

    async getWorkflowTasks(workflowName: string): Promise<IronflowTask[]>
    // List all tasks in Workflows/<workflowName>/
}
```

**Implementation notes**:
- Use `app.vault.create()` for new files, `app.vault.modify()` for updates
- Frontmatter manipulation: read the raw file content, parse the YAML frontmatter block (between `---` delimiters), modify the YAML object, serialize back, and replace the frontmatter block in the file content
- When creating a task, the `ironflow-depends-on` and `ironflow-next-tasks` fields initialize as empty arrays

#### `core/WorkflowManager.ts` — Workflow Definition CRUD

Manages workflows as `.canvas` + task folder pairs.

```typescript
export class WorkflowManager {
    constructor(
        private app: App,
        private taskManager: TaskManager,
        private canvasWriter: CanvasWriter,
        private settings: IronflowSettings
    ) {}

    async createWorkflow(name: string): Promise<IronflowWorkflow>
    // 1. Create Workflows/<name>/ folder
    // 2. Create Workflows/<name>.canvas with empty nodes/edges
    // 3. Return workflow object

    async getWorkflow(name: string): Promise<IronflowWorkflow | null>
    // 1. Read .canvas file, parse JSON
    // 2. Read all task files in the workflow folder
    // 3. Cross-reference canvas nodes with task files
    // 4. Return structured workflow

    async listWorkflows(): Promise<IronflowWorkflow[]>
    // Scan workflow folder for .canvas files, build workflow objects

    async addTaskToWorkflow(
        workflowName: string,
        taskName: string,
        templateName: string,
        position?: { x: number; y: number }
    ): Promise<IronflowTask>
    // 1. Create task via TaskManager
    // 2. Add file node to .canvas JSON
    // 3. Return the task

    async removeTaskFromWorkflow(
        workflowName: string,
        taskName: string
    ): Promise<void>
    // 1. Remove node and connected edges from .canvas JSON
    // 2. Delete task file via TaskManager

    async deleteWorkflow(name: string): Promise<void>
    // Delete .canvas file and task folder recursively
}
```

**Implementation notes**:
- Auto-generate node IDs using a random hex string (e.g., 16 chars)
- Default node position: if no position given, place to the right of the rightmost existing node with some padding
- Default node dimensions: `width: 400, height: 300` (adjustable later)

#### `core/CanvasWriter.ts` — Frontmatter-to-Canvas Edge Sync

Reads all tasks' dependency frontmatter and computes the correct edge set for the `.canvas` file.

```typescript
export class CanvasWriter {
    constructor(private app: App, private settings: IronflowSettings) {}

    async syncEdges(workflowName: string): Promise<void>
    // 1. Read the .canvas JSON
    // 2. Read all task files in the workflow folder
    // 3. Build a map: task file path → canvas node ID
    // 4. For each task, read ironflow-next-tasks
    // 5. Compute expected edges from dependency relationships
    // 6. Replace the edges array in the canvas JSON (preserve non-Ironflow edges)
    // 7. Write back via app.vault.modify()

    computeEdges(
        tasks: IronflowTask[],
        nodeMap: Map<string, string>  // filePath → nodeId
    ): CanvasEdgeData[]
    // Pure function: given tasks and their node IDs, produce edge data
    // Edge convention: fromNode = upstream task, toNode = downstream task
    // fromSide: "right", toSide: "left", toEnd: "arrow"
}
```

**Implementation notes**:
- Edge IDs should be deterministic (e.g., `ironflow-edge-${fromNodeId}-${toNodeId}`) so that repeated syncs don't create duplicate edges
- Preserve any edges in the canvas that don't match the `ironflow-edge-` prefix (user may draw their own non-Ironflow annotations)
- Call `syncEdges()` after every dependency change in the side panel

#### `views/TaskPropertyPanel.ts` — Side Panel

An `ItemView` that displays editable properties for the currently selected task template.

```typescript
export class TaskPropertyPanel extends ItemView {
    static VIEW_TYPE = "ironflow-task-properties";

    private currentTask: IronflowTask | null = null;

    getViewType(): string { return TaskPropertyPanel.VIEW_TYPE; }
    getDisplayText(): string { return "Ironflow Task Properties"; }
    getIcon(): string { return "list-checks"; }

    async onOpen(): Promise<void>
    // Render empty state: "Select a task node on a canvas to edit its properties"

    async loadTask(task: IronflowTask): Promise<void>
    // 1. Store task reference
    // 2. Clear panel content
    // 3. Render fields using Obsidian Setting components:
    //    - Source template (read-only text)
    //    - Agent profile (text input)
    //    - Dependencies: ironflow-depends-on (dropdown/multi-select of sibling tasks)
    //    - Dependencies: ironflow-next-tasks (dropdown/multi-select of sibling tasks)
    //    - Divider
    //    - Template-specific fields (dynamic, one Setting per frontmatter key)
    // 4. Each field change triggers:
    //    a. TaskManager.updateTaskFrontmatter()
    //    b. CanvasWriter.syncEdges() (if dependency fields changed)

    async onClose(): Promise<void>
    // Cleanup
}
```

**Implementation notes**:
- The panel is activated by listening to the `file-open` workspace event in `main.ts`. When a file is opened that lives under the workflow folder, load it into the panel.
- Dependency dropdowns are populated by reading sibling task files in the same workflow folder.
- Use `Setting` components for each field:
  - `.addText()` for string fields
  - `.addDropdown()` for enumerated fields
  - `.addTextArea()` for multi-line content
- Debounce saves (e.g., 500ms) to avoid excessive file writes on rapid typing.

#### `views/WorkflowCommandModal.ts` — Creation Modals

Obsidian `Modal` subclass for creating workflows and adding tasks.

**Create Workflow modal**:
- Single text input for workflow name
- On confirm: calls `WorkflowManager.createWorkflow()`

**Add Task modal**:
- Text input for task name
- Dropdown for template selection (populated from `TemplateRegistry`)
- On confirm: calls `WorkflowManager.addTaskToWorkflow()`
- Pre-selects the current active workflow if a canvas is open

#### `api/routes.ts` — REST API Endpoints (Deferred)

> **Note**: This module is deferred to a future phase. The design below is retained for reference when implementation begins. A `/ironflow/status/` health-check route is already wired up in `main.ts` as a proof of the integration pattern.

All routes are prefixed with `/ironflow/`.

```
GET  /ironflow/workflows
GET  /ironflow/workflows/:name
GET  /ironflow/workflows/:name/tasks
GET  /ironflow/workflows/:name/tasks/:taskName
GET  /ironflow/templates
```

```typescript
export function registerRoutes(
    api: LocalRestApiPublicApi,
    workflowManager: WorkflowManager,
    taskManager: TaskManager,
    templateRegistry: TemplateRegistry
): void {

    // GET /ironflow/workflows
    // Returns: { workflows: [{ name, canvasPath, taskCount }] }
    api.addRoute("/ironflow/workflows/").get(async (req, res) => {
        const workflows = await workflowManager.listWorkflows();
        res.status(200).json({
            workflows: workflows.map(w => ({
                name: w.name,
                canvasPath: w.canvasPath,
                taskCount: w.tasks.length
            }))
        });
    });

    // GET /ironflow/workflows/:name
    // Returns: Full workflow with tasks and computed dependency graph
    api.addRoute("/ironflow/workflows/:name").get(async (req, res) => {
        const workflow = await workflowManager.getWorkflow(req.params.name);
        if (!workflow) return res.status(404).json({ error: "Workflow not found" });
        res.status(200).json(workflow);
    });

    // GET /ironflow/workflows/:name/tasks
    // Returns: { tasks: IronflowTask[] }
    api.addRoute("/ironflow/workflows/:name/tasks/").get(async (req, res) => {
        const tasks = await taskManager.getWorkflowTasks(req.params.name);
        res.status(200).json({ tasks });
    });

    // GET /ironflow/workflows/:name/tasks/:taskName
    // Returns: Single task with full frontmatter
    api.addRoute("/ironflow/workflows/:name/tasks/:taskName").get(async (req, res) => {
        const { name, taskName } = req.params;
        const filePath = `${workflowFolder}/${name}/${taskName}.md`;
        const task = await taskManager.getTask(filePath);
        if (!task) return res.status(404).json({ error: "Task not found" });
        res.status(200).json(task);
    });

    // GET /ironflow/templates
    // Returns: { templates: TemplateSchema[] }
    api.addRoute("/ironflow/templates/").get(async (req, res) => {
        res.status(200).json({
            templates: templateRegistry.getTemplates()
        });
    });
}
```

#### `settings/SettingsTab.ts` — Plugin Settings

```typescript
export class IronflowSettingsTab extends PluginSettingTab {
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName("Workflow folder")
            .setDesc("Folder where workflow definitions are stored")
            .addText(text => text
                .setValue(this.plugin.settings.workflowFolder)
                .onChange(async (value) => {
                    this.plugin.settings.workflowFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName("Template folder")
            .setDesc("Folder containing Templater templates (should match Templater config)")
            .addText(text => text
                .setValue(this.plugin.settings.templateFolder)
                .onChange(async (value) => {
                    this.plugin.settings.templateFolder = value;
                    await this.plugin.saveSettings();
                }));
    }
}
```

---

## 7. User Journey

### 7.1 Create a Workflow

1. Open command palette → **"Ironflow: New Workflow"**
2. Enter workflow name (e.g., "feature-development")
3. Plugin creates:
   - `Workflows/feature-development.canvas` (empty canvas)
   - `Workflows/feature-development/` (empty folder)
4. Canvas file opens automatically

### 7.2 Add Tasks to a Workflow

1. With a workflow canvas open, command palette → **"Ironflow: Add Task"**
2. Modal shows:
   - Task name input
   - Template dropdown (e.g., "Review Cycle Prompt", "Templater Demo")
3. On confirm:
   - Task file created at `Workflows/feature-development/build-feature.md` with Ironflow + template frontmatter
   - File node added to the canvas JSON
   - Canvas refreshes to show the new node

### 7.3 Configure a Task

1. Click a task file node on the canvas
2. The `file-open` event fires → side panel loads the task
3. Side panel displays:
   - **Source template**: "Review Cycle Prompt" (read-only)
   - **Agent profile**: text input → e.g., "developer"
   - **Depends on**: multi-select dropdown of sibling tasks
   - **Next tasks**: multi-select dropdown of sibling tasks
   - **--- Template Fields ---**
   - **current-branch**: text input
   - **target-branch**: text input
   - **provider**: text input
4. Editing a dependency field triggers:
   - Frontmatter update on the task file
   - Reciprocal update on the linked task (if A depends on B, B's `ironflow-next-tasks` gets A)
   - `CanvasWriter.syncEdges()` updates the `.canvas` file with correct arrows

### 7.4 Review Workflow

Open the `.canvas` file in Obsidian. Task nodes are displayed as file cards, dependency arrows show execution order. The layout is manually arrangeable via standard canvas drag-and-drop.

### 7.5 Query via REST API

```bash
# List all workflows
curl http://localhost:27124/ironflow/workflows/

# Get workflow with full task details and dependency graph
curl http://localhost:27124/ironflow/workflows/feature-development

# Get available templates
curl http://localhost:27124/ironflow/templates/
```

---

## 8. Data Flow Diagram

```
                    ┌─────────────────────┐
                    │   Templater Plugin   │
                    │  (Template Source)    │
                    └──────────┬──────────┘
                               │ reads templates
                               ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────────────┐
│  Command      │───▶│  TemplateRegistry   │    │   REST API Routes    │
│  Palette      │    │  (discovers fields) │    │   /ironflow/*        │
└──────┬───────┘    └──────────┬──────────┘    └──────────┬───────────┘
       │                       │                          │
       │ user actions          │ schema                   │ reads
       ▼                       ▼                          ▼
┌──────────────┐    ┌─────────────────────┐    ┌──────────────────────┐
│  Workflow     │───▶│   TaskManager       │◀──│  TaskPropertyPanel   │
│  CommandModal │    │ (creates/updates MD)│    │  (side panel UI)     │
└──────────────┘    └──────────┬──────────┘    └──────────┬───────────┘
                               │                          │
                               │ file changes             │ dep changes
                               ▼                          ▼
                    ┌─────────────────────┐    ┌──────────────────────┐
                    │  WorkflowManager    │    │   CanvasWriter       │
                    │ (.canvas + folder)  │◀───│  (edges from FM)     │
                    └──────────┬──────────┘    └──────────────────────┘
                               │
                               │ writes
                               ▼
                    ┌─────────────────────┐
                    │   .canvas file       │
                    │   (JSON Canvas)      │
                    │   + task .md files   │
                    └─────────────────────┘
```

---

## 9. Commands & Events

### 9.1 Registered Commands

| Command ID | Label | Action |
|------------|-------|--------|
| `ironflow:create-workflow` | Ironflow: New Workflow | Opens WorkflowCommandModal in create-workflow mode |
| `ironflow:add-task` | Ironflow: Add Task | Opens WorkflowCommandModal in add-task mode (infers active workflow from open canvas) |
| `ironflow:open-task-panel` | Ironflow: Open Task Properties | Reveals the TaskPropertyPanel side panel |

### 9.2 Event Listeners

| Event | Source | Handler |
|-------|--------|---------|
| `file-open` | Workspace | When opened file is under a workflow folder, load it into TaskPropertyPanel |
| `changed` | MetadataCache | When a task template's frontmatter changes (external edit), refresh the side panel if that task is loaded |
| `create` / `delete` | Vault | When files change in the template folder, refresh TemplateRegistry |

---

## 10. Error Handling

| Scenario | Behavior |
|----------|----------|
| Templater plugin not installed/enabled | Show notice on plugin load: "Ironflow requires the Templater plugin. Please install and enable it." Disable Ironflow functionality. |
| obsidian-local-rest-api not installed/enabled | Plugin loads but skips REST API route registration. Core functionality (workflow/task management) still works. |
| Workflow name collision | Reject creation with notice: "A workflow named 'X' already exists." |
| Task name collision within workflow | Reject creation with notice: "A task named 'X' already exists in workflow 'Y'." |
| Canvas file missing for workflow | `getWorkflow()` returns null. REST API returns 404. |
| Circular dependencies | Not validated in Phase 1. Future phases should add cycle detection when executing workflows. |
| Corrupt `.canvas` JSON | Wrap all canvas reads in try/catch. Show notice on parse failure. |

---

## 11. Future Considerations

These are intentionally out of scope for Phase 1 but influence the current design:

1. **Workflow Instances**: Triggered via `POST /ironflow/workflows/:name/run`. Creates `Workflows/<name>-<id>/` with rendered task copies. Each task gets `ironflow-status` and `ironflow-instance-id` frontmatter.

2. **CAO Integration**: Instance tasks dispatched to CAO sessions via `POST /sessions`. Status synced from `GET /terminals/:id` output.

3. **Instance Monitoring**: A view showing all active workflow instances with real-time task status.

4. **Circular Dependency Detection**: Validate the dependency graph is a DAG before allowing workflow trigger.

5. **Canvas Visual Enhancements**: If Obsidian ever publishes a Canvas plugin API, enhance task nodes with status badges, agent profile icons, and progress indicators.
