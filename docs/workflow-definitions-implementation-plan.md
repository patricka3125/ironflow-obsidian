# Ironflow Plugin — Workflow Definitions Implementation Plan

This document defines the multi-phase implementation plan for the Workflow Definitions feature. Each phase contains tasks that depend only on tasks completed in prior phases. Within a phase, tasks may be worked in any order.

**Reference**: [Workflow Definitions Design](./workflow-definitions-design.md)

---

## Phase 1: Project Scaffolding & Foundation

All tasks in this phase have zero dependencies on other Ironflow code. They establish the project structure, build configuration, and shared types that every subsequent phase builds on.

### Task 1.1: Restructure Project to `src/` Layout

Create the `src/` directory hierarchy and move the existing `main.ts` entry point.

**Work**:
- Create directory structure: `src/`, `src/core/`, `src/views/`, `src/api/`, `src/settings/`
- Move `main.ts` → `src/main.ts`
- Verify the old `main.ts` at the project root is removed

**Acceptance Criteria**:
- [ ] `src/main.ts` exists and contains the plugin entry point
- [ ] `src/core/`, `src/views/`, `src/api/`, `src/settings/` directories exist
- [ ] No source `.ts` files remain at the project root

### Task 1.2: Update Build Configuration

Update `esbuild.config.mjs` and `tsconfig.json` to reflect the new source layout and enable strict TypeScript.

**Work**:
- `esbuild.config.mjs`: Change `entryPoints` from `["main.ts"]` to `["src/main.ts"]`
- `tsconfig.json`: Enable `"strict": true`, remove redundant individual strict flags (`noImplicitAny`, `strictNullChecks`), update `include` to `["src/**/*.ts"]`

**Acceptance Criteria**:
- [ ] `npm run build` compiles successfully and outputs `main.js` at the project root
- [ ] `npm run dev` starts esbuild in watch mode without errors
- [ ] `tsc --noEmit` passes with no type errors
- [ ] `strict` mode is enabled (verified by the compiler catching a deliberate `any` usage)

### Task 1.3: Update Dependencies

Update outdated packages and add any new required dependencies.

**Work**:
- Update `typescript` to latest stable (5.x)
- Update `@types/node` to match the Node.js version in `.tool-versions` (18.x)
- Update `esbuild` to latest stable
- Verify `obsidian` and `obsidian-local-rest-api` are at latest
- Run `npm install` and ensure clean build

**Acceptance Criteria**:
- [ ] All dependencies are on current stable versions
- [ ] `npm run build` succeeds with no deprecation warnings from build tooling
- [ ] `package-lock.json` is updated and committed

### Task 1.4: Update Plugin Metadata

Update `manifest.json` and `package.json` to reflect the Ironflow plugin identity.

**Work**:
- `manifest.json`: Update `id` to `ironflow-local-rest-api`, update `name`, `description`, `author` fields
- `package.json`: Update `name`, `description`, `author` fields to match

**Acceptance Criteria**:
- [ ] `manifest.json` has correct Ironflow plugin identity
- [ ] `package.json` metadata matches `manifest.json`
- [ ] Plugin loads in Obsidian with the correct name displayed

### Task 1.5: Define Shared Types

Create `src/types.ts` with all shared interfaces used across the plugin.

**Work**:
- Define `IronflowSettings` interface
- Define `IronflowTaskFrontmatter` interface
- Define `IronflowTask` interface
- Define `IronflowWorkflow` interface
- Define `TemplateSchema` and `TemplateField` interfaces
- Define default settings constants

**Acceptance Criteria**:
- [ ] All interfaces documented in the design doc Section 6.2 (`types.ts`) are defined
- [ ] File compiles with no type errors under strict mode
- [ ] All interface fields have explicit types (no `any`)

### Task 1.6: Create Frontmatter Utility Module

Create `src/core/frontmatter.ts` with functions to read and write YAML frontmatter in markdown files.

**Work**:
- Implement `parseFrontmatter(content: string): Record<string, unknown>` — extracts and parses the YAML block between `---` delimiters
- Implement `updateFrontmatter(content: string, updates: Record<string, unknown>): string` — modifies frontmatter fields while preserving the rest of the file content exactly
- Handle edge cases: missing frontmatter, empty frontmatter, array values, nested values

**Acceptance Criteria**:
- [ ] `parseFrontmatter` correctly parses YAML from a markdown string with frontmatter
- [ ] `parseFrontmatter` returns an empty object for files without frontmatter
- [ ] `updateFrontmatter` modifies only the specified fields, leaving all other frontmatter fields and body content unchanged
- [ ] `updateFrontmatter` correctly handles array values (e.g., `ironflow-depends-on: ["[[task-a]]"]`)
- [ ] No trailing whitespace or formatting changes are introduced outside the frontmatter block

### Task 1.7: Scaffold Plugin Entry Point and Settings

Rewrite `src/main.ts` as the Ironflow plugin shell with settings loading, and create `src/settings/SettingsTab.ts`.

**Work**:
- `src/main.ts`: Extend `Plugin`, implement `onload()`/`onunload()`, load/save settings, add settings tab, verify Templater dependency on load, register REST API when obsidian-local-rest-api is available
- `src/settings/SettingsTab.ts`: Implement `IronflowSettingsTab` with `workflowFolder` and `templateFolder` text inputs
- Show `Notice` if Templater is not enabled

**Acceptance Criteria**:
- [ ] Plugin loads in Obsidian without errors
- [ ] Settings tab appears under plugin settings with two configurable fields
- [ ] Changing settings persists across Obsidian restarts
- [ ] A notice is shown if Templater plugin is not enabled
- [ ] Plugin gracefully handles obsidian-local-rest-api being absent (no crash, REST routes skipped)

---

## Phase 2: Template Discovery

Depends on **Phase 1** (types, frontmatter utility, plugin shell, settings). This phase implements the ability to discover and parse Templater templates from the vault.

### Task 2.1: Implement TemplateRegistry

Create `src/core/TemplateRegistry.ts` that scans the configured template folder, extracts frontmatter field schemas, and watches for changes.

**Work**:
- Implement `initialize()`: scan the template folder, parse each `.md` file's frontmatter via `MetadataCache`, build `TemplateSchema` entries
- Implement `getTemplates()`, `getTemplate(name)`, `getFieldSchema(name)`
- Register vault event listeners (`create`, `delete`, `rename`) and metadata cache listener (`changed`) to keep the registry in sync when templates are added, removed, or modified
- Filter out non-template files (if any heuristic is needed, e.g., only files with frontmatter)

**Acceptance Criteria**:
- [ ] On plugin load, `TemplateRegistry` discovers all `.md` files in the configured template folder
- [ ] `getTemplates()` returns a `TemplateSchema[]` with correct `name`, `filePath`, and `fields` for each template
- [ ] `getFieldSchema("Review Cycle Prompt")` returns `[{key: "current-branch", ...}, {key: "target-branch", ...}, {key: "provider", ...}]`
- [ ] Adding a new template file to the folder is detected and the registry updates without plugin restart
- [ ] Deleting a template file removes it from the registry
- [ ] Modifying a template's frontmatter updates the cached field schema

### Task 2.2: Integrate TemplateRegistry into Plugin Lifecycle

Wire `TemplateRegistry` into `src/main.ts` so it initializes on plugin load.

**Work**:
- Instantiate `TemplateRegistry` in `onload()` after settings are loaded
- Call `templateRegistry.initialize()` during plugin startup
- Store as a plugin instance property for use by other modules in later phases

**Acceptance Criteria**:
- [ ] `TemplateRegistry` initializes successfully on plugin load
- [ ] Templates are available immediately after plugin load completes
- [ ] No errors when the template folder is empty or doesn't exist (graceful degradation)

---

## Phase 3: Workflow & Task Management

Depends on **Phase 2** (TemplateRegistry must be functional). This phase implements the core data layer for creating, reading, updating, and deleting workflows and tasks, and for syncing dependency edges to canvas files.

### Task 3.1: Implement CanvasWriter

Create `src/core/CanvasWriter.ts` that computes dependency edges from task frontmatter and writes them to `.canvas` JSON files.

**Work**:
- Implement `computeEdges(tasks, nodeMap)`: pure function that takes tasks with their `ironflow-next-tasks` frontmatter and a file-to-nodeId map, returns `CanvasEdgeData[]`
- Implement `syncEdges(workflowName)`: reads the `.canvas` file, reads all task files, calls `computeEdges()`, replaces Ironflow-managed edges (prefix `ironflow-edge-`) while preserving user-drawn edges, writes back
- Edge ID convention: `ironflow-edge-${fromNodeId}-${toNodeId}`
- Edge rendering: `fromSide: "right"`, `toSide: "left"`, `toEnd: "arrow"`

**Acceptance Criteria**:
- [ ] `computeEdges()` produces correct edges for a set of tasks with known dependencies
- [ ] `computeEdges()` returns an empty array when no tasks have dependencies
- [ ] `syncEdges()` writes valid JSON Canvas format to the `.canvas` file
- [ ] Existing non-Ironflow edges in the canvas (edges without `ironflow-edge-` prefix) are preserved after sync
- [ ] Running `syncEdges()` twice with the same data produces identical output (idempotent)
- [ ] Removing a dependency from frontmatter and re-syncing removes the corresponding edge

### Task 3.2: Implement TaskManager

Create `src/core/TaskManager.ts` for CRUD operations on task template markdown files.

**Work**:
- Implement `createTask(workflowName, taskName, templateName)`:
  - Read the source template file content
  - Prepend Ironflow-managed frontmatter fields (`ironflow-template`, `ironflow-workflow`, `ironflow-agent-profile`, `ironflow-depends-on`, `ironflow-next-tasks`)
  - Merge with template's existing frontmatter defaults
  - Write to `Workflows/<workflowName>/<taskName>.md`
- Implement `getTask(filePath)`: read file, parse frontmatter, return `IronflowTask`
- Implement `updateTaskFrontmatter(filePath, updates)`: use frontmatter utility to update specific fields
- Implement `deleteTask(filePath)`: delete the file via vault API
- Implement `getWorkflowTasks(workflowName)`: list all `.md` files in the workflow folder, return as `IronflowTask[]`

**Acceptance Criteria**:
- [ ] `createTask()` creates a markdown file at the correct path with merged Ironflow + template frontmatter
- [ ] Created task file contains the source template's body content (including Templater expressions)
- [ ] `ironflow-depends-on` and `ironflow-next-tasks` initialize as empty arrays
- [ ] `getTask()` returns a correctly typed `IronflowTask` with all frontmatter fields parsed
- [ ] `updateTaskFrontmatter()` modifies only the specified fields without altering other fields or body content
- [ ] `deleteTask()` removes the file from the vault
- [ ] `getWorkflowTasks()` returns all tasks in the workflow folder, excluding non-markdown files

### Task 3.3: Implement WorkflowManager

Create `src/core/WorkflowManager.ts` that orchestrates workflow-level operations using `TaskManager` and `CanvasWriter`.

**Work**:
- Implement `createWorkflow(name)`:
  - Create folder `Workflows/<name>/` via vault API
  - Create `Workflows/<name>.canvas` with `{"nodes":[],"edges":[]}`
  - Return `IronflowWorkflow` object
- Implement `getWorkflow(name)`:
  - Read and parse the `.canvas` JSON
  - Read all tasks via `TaskManager.getWorkflowTasks()`
  - Cross-reference canvas file nodes with task files to populate `canvasNodeId` on each task
  - Return structured `IronflowWorkflow`
- Implement `listWorkflows()`: scan workflow folder for `.canvas` files, call `getWorkflow()` for each
- Implement `addTaskToWorkflow(workflowName, taskName, templateName, position?)`:
  - Create task via `TaskManager.createTask()`
  - Read canvas JSON, add a `file` node pointing to the new task, write back
  - Auto-position: if no position given, place to the right of the rightmost node with 100px gap
  - Default node dimensions: `width: 400, height: 300`
- Implement `removeTaskFromWorkflow(workflowName, taskName)`:
  - Remove the node and all connected Ironflow edges from canvas JSON
  - Remove dependency references from sibling tasks' frontmatter (both `ironflow-depends-on` and `ironflow-next-tasks`)
  - Delete task file via `TaskManager.deleteTask()`
- Implement `deleteWorkflow(name)`: delete `.canvas` file and task folder recursively

**Acceptance Criteria**:
- [ ] `createWorkflow()` creates both the `.canvas` file and task folder
- [ ] The created `.canvas` file contains valid JSON Canvas with empty nodes/edges arrays
- [ ] `getWorkflow()` returns a complete workflow object with tasks and their canvas node IDs
- [ ] `listWorkflows()` returns all workflows in the configured folder
- [ ] `addTaskToWorkflow()` creates the task file and adds a file node to the canvas
- [ ] Auto-positioning places new nodes to the right of existing nodes without overlap
- [ ] `removeTaskFromWorkflow()` cleans up the canvas node, edges, sibling dependency references, and task file
- [ ] `deleteWorkflow()` removes the canvas file and entire task folder
- [ ] Workflow name collisions are detected and rejected with an error
- [ ] Task name collisions within a workflow are detected and rejected with an error

### Task 3.4: Integrate Core Services into Plugin Lifecycle

Wire `CanvasWriter`, `TaskManager`, and `WorkflowManager` into `src/main.ts`.

**Work**:
- Instantiate all three services in `onload()` after `TemplateRegistry` initialization
- Store as plugin instance properties
- Ensure correct initialization order: `TemplateRegistry` → `CanvasWriter` → `TaskManager` → `WorkflowManager`

**Acceptance Criteria**:
- [ ] All core services initialize without errors on plugin load
- [ ] Services are accessible from the plugin instance for use by views and API routes
- [ ] Plugin unload cleanly tears down all services (no lingering event listeners)

---

## Phase 4: UI Views & Commands

Depends on **Phase 3** (WorkflowManager, TaskManager, CanvasWriter, TemplateRegistry must be functional). This phase implements the user-facing components: modals, side panel, command palette commands, and event listeners.

### Task 4.1: Implement WorkflowCommandModal

Create `src/views/WorkflowCommandModal.ts` with two modal modes: create-workflow and add-task.

**Work**:
- **Create Workflow mode**:
  - Single text input for workflow name
  - Validation: non-empty, no name collision (check via `WorkflowManager`)
  - On submit: call `WorkflowManager.createWorkflow()`, open the created canvas file
- **Add Task mode**:
  - Text input for task name
  - Dropdown for template selection (populated from `TemplateRegistry.getTemplates()`)
  - Auto-detect active workflow from the currently open canvas file
  - Validation: non-empty task name, no name collision within the workflow
  - On submit: call `WorkflowManager.addTaskToWorkflow()`

**Acceptance Criteria**:
- [ ] Create Workflow modal opens via command palette, accepts a name, and creates the workflow
- [ ] After workflow creation, the new canvas file opens in the workspace
- [ ] Add Task modal opens via command palette, shows available templates in a dropdown
- [ ] Add Task modal auto-selects the workflow from the currently active canvas
- [ ] Add Task modal shows an error if no workflow canvas is active
- [ ] Name collision is caught before submission and displays a user-facing error message
- [ ] Empty name input is rejected with a validation message

### Task 4.2: Implement TaskPropertyPanel

Create `src/views/TaskPropertyPanel.ts` as an `ItemView` side panel for editing task frontmatter.

**Work**:
- Register view type `ironflow-task-properties`
- Implement `onOpen()`: render empty state message ("Select a task node on a canvas to edit its properties")
- Implement `loadTask(task)`:
  - Clear and rebuild panel content
  - Render read-only field: source template name
  - Render text input: agent profile
  - Render dependency multi-select: `ironflow-depends-on` (populated from sibling tasks)
  - Render dependency multi-select: `ironflow-next-tasks` (populated from sibling tasks)
  - Render dynamic template-specific fields (one `Setting` per frontmatter key from the template schema)
- On field change:
  - Call `TaskManager.updateTaskFrontmatter()` with debouncing (500ms)
  - For dependency field changes: also update the reciprocal field on the linked task, then call `CanvasWriter.syncEdges()`
- Implement `onClose()`: cleanup references

**Acceptance Criteria**:
- [ ] Panel registers and appears in the right sidebar when activated
- [ ] Empty state message displays when no task is selected
- [ ] Selecting a task file in a canvas populates the panel with correct field values
- [ ] Source template name is displayed and not editable
- [ ] Agent profile text input saves to frontmatter on change
- [ ] Dependency dropdowns list all sibling tasks in the workflow (excluding the current task)
- [ ] Adding a dependency updates both the current task's and the linked task's frontmatter reciprocally
- [ ] Removing a dependency cleans up both sides of the relationship
- [ ] Dependency changes trigger canvas edge sync (arrows appear/disappear in the canvas)
- [ ] Template-specific fields render with correct initial values and save on change
- [ ] Rapid typing does not cause excessive file writes (debounce working)

### Task 4.3: Register Commands and Event Listeners

Wire commands and workspace events into `src/main.ts`.

**Work**:
- Register commands:
  - `ironflow:create-workflow` → opens WorkflowCommandModal in create mode
  - `ironflow:add-task` → opens WorkflowCommandModal in add-task mode
  - `ironflow:open-task-panel` → reveals the TaskPropertyPanel
- Register view: `TaskPropertyPanel.VIEW_TYPE` with factory function
- Register event listeners:
  - `file-open`: when the opened file is under the configured workflow folder, load it into `TaskPropertyPanel`. Detect this by checking the file path prefix.
  - `metadataCache.changed`: when a task file's frontmatter changes externally (e.g., edited in the markdown editor), refresh the side panel if that task is currently loaded
- Add ribbon icon for quick access to "Ironflow: Open Task Properties"

**Acceptance Criteria**:
- [ ] All three commands appear in the command palette and function correctly
- [ ] `TaskPropertyPanel` opens when its command is invoked
- [ ] Clicking a task node in a canvas automatically loads it in the side panel
- [ ] Clicking a non-task file (outside workflow folder) does not trigger panel loading
- [ ] Editing a task file's frontmatter in the markdown editor refreshes the side panel in real time
- [ ] Ribbon icon opens the task property panel
- [ ] All event listeners are properly unregistered on plugin unload

---

## Phase 5: REST API

Depends on **Phase 3** (core services must be functional). This phase is independent of Phase 4 — it can be implemented concurrently with the UI if desired.

### Task 5.1: Implement REST API Route Handlers

Create `src/api/routes.ts` with all Ironflow REST endpoints.

**Work**:
- Implement `registerRoutes(api, workflowManager, taskManager, templateRegistry)`:
  - `GET /ironflow/workflows/` — list all workflows with name, canvas path, task count
  - `GET /ironflow/workflows/:name` — get full workflow with tasks and dependency graph
  - `GET /ironflow/workflows/:name/tasks/` — list all tasks in a workflow
  - `GET /ironflow/workflows/:name/tasks/:taskName` — get single task with full frontmatter
  - `GET /ironflow/templates/` — list all discovered templates with field schemas
- Error handling: 404 for missing workflows/tasks, 500 for internal errors with descriptive messages
- Response format: consistent JSON structure across all endpoints

**Acceptance Criteria**:
- [ ] `GET /ironflow/workflows/` returns `{ workflows: [...] }` with correct data for all workflows
- [ ] `GET /ironflow/workflows/:name` returns the full workflow object including tasks and dependency relationships
- [ ] `GET /ironflow/workflows/:name` returns 404 for non-existent workflow
- [ ] `GET /ironflow/workflows/:name/tasks/` returns `{ tasks: [...] }` for a valid workflow
- [ ] `GET /ironflow/workflows/:name/tasks/:taskName` returns complete task with all frontmatter fields
- [ ] `GET /ironflow/workflows/:name/tasks/:taskName` returns 404 for non-existent task
- [ ] `GET /ironflow/templates/` returns `{ templates: [...] }` with field schemas for each template
- [ ] All endpoints return valid JSON with correct `Content-Type` headers
- [ ] All endpoints handle errors gracefully (no unhandled promise rejections, no stack traces in responses)

### Task 5.2: Integrate REST API into Plugin Lifecycle

Wire route registration into `src/main.ts`.

**Work**:
- Call `registerRoutes()` in the existing REST API setup block (where `obsidian-local-rest-api` is detected)
- Pass all required service instances to `registerRoutes()`
- Ensure `api.unregister()` in `onunload()` removes all Ironflow routes

**Acceptance Criteria**:
- [ ] Routes are registered when obsidian-local-rest-api is enabled
- [ ] Routes are not registered (and no error occurs) when obsidian-local-rest-api is absent
- [ ] All routes are accessible via `curl` or HTTP client at `https://localhost:27124/ironflow/*`
- [ ] Plugin unload cleanly removes all routes (verified by 404 after unload)

---

## Phase 6: Integration Testing & Error Handling

Depends on **Phase 4 and Phase 5** (all components must be implemented). This phase validates the complete user journey end-to-end and hardens error handling.

### Task 6.1: End-to-End User Journey Validation

Manually test the complete workflow definition lifecycle in Obsidian.

**Work**:
- Test the full happy path:
  1. Create a workflow via command palette
  2. Add 3+ tasks from different templates
  3. Configure task properties (agent profile, template-specific fields)
  4. Set up dependency chain (A → B → C) via the side panel
  5. Verify canvas shows correct arrows
  6. Verify all data via REST API endpoints
  7. Remove a task and verify cleanup (edges, sibling references, file)
  8. Delete the workflow and verify complete cleanup
- Test with the existing vault templates (Review Cycle Prompt, Templater Demo)

**Acceptance Criteria**:
- [ ] Workflow creation produces correct `.canvas` file and task folder
- [ ] Tasks are created with correct merged frontmatter (Ironflow + template fields)
- [ ] Side panel correctly loads and saves all field types
- [ ] Dependency changes produce correct arrows in the canvas
- [ ] Reciprocal dependency updates work (adding A → B updates both A and B)
- [ ] Task removal cleans up all references in sibling tasks and canvas
- [ ] Workflow deletion removes all files and folders
- [ ] REST API returns correct data at every stage
- [ ] No console errors during the entire workflow

### Task 6.2: Error Handling Hardening

Verify and implement graceful handling for all documented error scenarios.

**Work**:
- Test and fix each scenario from the design doc Section 10 (Error Handling):
  - Templater plugin not installed → notice shown, functionality disabled
  - obsidian-local-rest-api absent → REST routes skipped silently
  - Workflow name collision → notice with clear message
  - Task name collision → notice with clear message
  - Canvas file missing/corrupt → try/catch with notice
  - Missing workflow folder → graceful creation or error
- Add try/catch wrapping around all vault file operations
- Add user-facing `Notice` messages for recoverable errors
- Ensure no unhandled promise rejections across all async code paths

**Acceptance Criteria**:
- [ ] Each error scenario from the design doc is handled gracefully with a user-facing message
- [ ] No unhandled promise rejections in any error path
- [ ] Corrupt `.canvas` JSON (manually broken) shows a notice instead of crashing
- [ ] Plugin operates in degraded mode when optional dependencies are missing (REST API without obsidian-local-rest-api)
- [ ] All `Notice` messages are actionable (tell the user what to do, not just what went wrong)

### Task 6.3: Edge Case Handling

Test and fix edge cases not covered by the happy path.

**Work**:
- Task/workflow names with special characters (spaces, unicode, periods)
- Empty workflows (no tasks)
- Workflows with tasks but no dependencies
- Templates with no frontmatter
- Templates with complex frontmatter (nested objects, arrays)
- Rapid successive operations (create task, immediately edit, immediately add dependency)
- Canvas files that contain non-Ironflow nodes/edges alongside Ironflow content
- External modifications: user manually edits `.canvas` JSON or task frontmatter while plugin is running

**Acceptance Criteria**:
- [ ] Special characters in names are handled (sanitized or supported consistently)
- [ ] Empty workflows and dependency-free tasks work without errors
- [ ] Templates without frontmatter are handled (task created with Ironflow fields only)
- [ ] Non-Ironflow canvas content is preserved through all operations
- [ ] External file modifications are detected and reflected in the UI via event listeners
- [ ] No race conditions from rapid successive operations (debouncing works correctly)

---

## Phase Summary

| Phase | Description | Depends On | Deliverable |
|-------|-------------|------------|-------------|
| **1** | Project Scaffolding & Foundation | None | Compiling plugin with types, utilities, settings, and strict TypeScript |
| **2** | Template Discovery | Phase 1 | TemplateRegistry discovers and watches Templater templates |
| **3** | Workflow & Task Management | Phase 2 | Full CRUD for workflows and tasks, canvas edge sync |
| **4** | UI Views & Commands | Phase 3 | Side panel, modals, commands, event listeners |
| **5** | REST API | Phase 3 | All Ironflow HTTP endpoints functional |
| **6** | Integration Testing & Error Handling | Phase 4, 5 | Validated end-to-end, hardened error handling |

**Note**: Phases 4 and 5 are independent of each other (both depend only on Phase 3) and can be implemented concurrently.
