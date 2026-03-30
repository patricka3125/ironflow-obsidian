# Ironflow Plugin — Workflow Instance Creation UI Design

## 1. Overview

This document covers the design for the **Workflow Instance Creation UI** — the user-facing interface for triggering active workflow instance creation directly from the canvas view. It builds on the core instance creation system described in [active-workflow-instances-design.md](active-workflow-instances-design.md) and the workflow definitions system described in [workflow-definitions-design.md](workflow-definitions-design.md).

### 1.1 Goals

- Add a canvas toolbar button to trigger instance creation from workflow canvases
- Validate that all required template-specific frontmatter fields are populated before allowing creation
- Provide a side panel for entering an optional instance name and confirming creation
- Generate a folder note ("instance base") with a Dataview table summarizing instance tasks
- Navigate to the instance folder note after successful creation
- Check for Dataview plugin availability and notify if missing

### 1.2 Non-Goals (Future Phases)

- Instance listing, deletion, or lifecycle management UI
- Status transitions or execution orchestration
- Canvas file generation for instances
- Remembering previously entered field values across sessions
- Editing template-specific field values during instance creation (values come from definition tasks)
- REST API endpoints for instance management

### 1.3 Key Concepts

| Concept | Description |
|---------|-------------|
| **Canvas Toolbar Button** | A play icon button injected into the canvas controls area, visible only on workflow canvases. Triggers the instance creation flow. |
| **Frontmatter Validation** | Pre-creation check ensuring all template-specific fields on all definition tasks have non-empty values. |
| **Create Instance Panel** | A side panel (`ItemView`) with an optional instance name field and a confirm button. |
| **Instance Folder Note** | A markdown file matching the instance directory name, containing Dataview queries that render a task table. Serves as the "base" view for an instance. |

### 1.4 Prerequisites

This feature depends on completed work from the Active Workflow Instances design:

- `InstanceManager.createInstance()` — core creation logic (implemented)
- Instance path utilities in `workflowPaths.ts` (implemented)
- Instance types in `types.ts` (implemented)
- `instances/` exclusion from definition task listing (implemented)

---

## 2. Research Findings

### 2.1 Canvas Toolbar Extension

The Obsidian Canvas view does not expose a public API for adding toolbar buttons. However, multiple community plugins (Advanced Canvas, Canvas MindMap, Canvas Filter) successfully inject buttons using internal APIs. The pattern is well-established and has been stable across Obsidian updates for 2+ years.

**Internal API access pattern:**

```typescript
// The canvas view exposes an internal `canvas` object
const canvasView = this.app.workspace.getActiveViewOfType(ItemView);
if (canvasView?.getViewType() !== "canvas") return;

// @ts-ignore — canvas is not in public type definitions
const canvas = (canvasView as any).canvas;

// The quickSettingsButton (gear icon) parent is the controls container
const controlsContainer = canvas.quickSettingsButton?.parentElement;
```

**DOM structure of the canvas controls:**

```
div.canvas-controls                (toolbar container, top-right)
  div                              (control group — zoom buttons)
    button.clickable-icon          (zoom in, zoom out, zoom to fit)
  div                              (control group — undo/redo)
    button.clickable-icon          (undo, redo)
  div                              (control group — settings)
    button.clickable-icon          (quickSettingsButton / gear icon)
```

**Key considerations:**

- The button must be re-injected each time a canvas view opens or becomes active. This is handled by listening for `layout-change` and `active-leaf-change` workspace events.
- An `id` attribute on the injected element prevents duplicate buttons on re-injection.
- The `setIcon()` and `setTooltip()` Obsidian utilities apply standard icon and tooltip styling.
- Since this relies on an undocumented internal API, a command palette fallback (`Ironflow: Create Instance`) ensures the feature remains accessible if Obsidian changes the canvas DOM structure.

**Risk assessment:** Medium. The internal Canvas object structure has been stable since canvas was introduced, and the pattern is validated by many published plugins. However, there is no API stability guarantee. The command palette fallback mitigates this risk entirely.

### 2.2 Folder Notes

A folder note is a markdown file that serves as the "index" for a folder. The **Inside-Folder** convention (`FolderName/FolderName.md`) is the most widely used default across the Obsidian ecosystem.

For instance directories, the folder note would live at:
```
instances/<instanceId>/<instanceId>.md
```

**Folder note plugins** (e.g., Folder Notes by LostPaul) add UX where clicking a folder in the file explorer opens its eponymous note. These plugins are **not a hard dependency** — the folder note is a regular markdown file regardless. Users who install a folder notes plugin get enhanced navigation, but the feature works without one.

> **Note to users:** For the best experience, consider installing a folder notes plugin (e.g., [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes)) so that clicking an instance folder in the file explorer opens the instance base directly.

### 2.3 Dataview Integration

[Dataview](https://github.com/blacksmithgu/obsidian-dataview) is the most widely installed Obsidian community plugin. It indexes markdown files and their YAML frontmatter, providing a SQL-like query language (DQL) for building live tables.

**Embedding pattern:** A Dataview query is written as a fenced code block with `dataview` as the language. The plugin has zero runtime dependency on Dataview — it simply writes the code block as markdown text. When Obsidian renders the note with Dataview installed, the code block is replaced with a live table.

**Example query for an instance folder note:**

````markdown
```dataview
TABLE ironflow-status AS "Status", ironflow-template AS "Template", ironflow-agent-profile AS "Agent", ironflow-depends-on AS "Depends On", ironflow-next-tasks AS "Next Tasks"
FROM "Workflows/MyWorkflow/instances/run-a3f8"
WHERE ironflow-instance-id AND file.name != "run-a3f8"
SORT file.name ASC
```
````

**Key behaviors:**

- `FROM "<path>"` selects all files in the specified folder and subfolders.
- Frontmatter fields with hyphens (e.g., `ironflow-status`) work directly as DQL field names.
- `WHERE file.name != "<instanceId>"` excludes the folder note itself from the table.
- `AS "Header"` renames columns in the rendered table.
- Dataview provides implicit fields like `file.name`, `file.link`, `file.ctime`.

**Graceful degradation:** If the user does not have Dataview installed, the raw query text is displayed. This is still informative — the user can see what columns would be shown and install Dataview to activate the table.

**Alternatives considered:**

| Alternative | Why not used |
|-------------|-------------|
| Obsidian Bases (native `.base` files) | Requires separate `.base` files, not embeddable in markdown. Not suitable for folder notes. |
| Static markdown table | Loses live-updating benefit. Would require a refresh command to keep in sync. |
| DB Folder plugin | Heavier dependency, less flexible query language. |

---

## 3. User Journey

### 3.1 Create an Instance from Canvas

1. User opens a workflow canvas (e.g., `Workflows/Test-Workflow.canvas`).
2. A play icon button appears in the canvas toolbar (top-right, alongside zoom/undo controls).
3. User clicks the play button.
4. **Validation runs:** The plugin loads the workflow definition and checks that all template-specific frontmatter fields on every task have non-empty values.
   - **If validation fails:** A `Notice` displays listing the tasks and fields that are missing values. The flow stops. The user must populate those fields via the Task Property Panel before retrying.
   - **If validation passes:** The Create Instance Panel opens in the right sidebar.
5. The panel displays:
   - Workflow name (read-only heading)
   - Instance name input (optional, placeholder shows auto-generated format `run-<hex>`)
   - "Create Instance" confirm button
6. User optionally enters an instance name and clicks "Create Instance".
7. The plugin:
   a. Calls `InstanceManager.createInstance()` with field values extracted from definition task frontmatter.
   b. Creates the instance folder note with Dataview table.
   c. Shows a `Notice` confirming creation (e.g., "Instance 'sprint-1' created for Test-Workflow").
   d. If Dataview is not enabled, shows an additional `Notice`: "Install the Dataview plugin for a live task table in the instance base note."
   e. Opens the instance folder note in a new tab and navigates to it.
8. User sees the instance folder note with a Dataview table listing all instance tasks and their statuses.

### 3.2 Validation Failure Example

```
Notice: "Cannot create instance for 'Test-Workflow'. The following tasks
have empty required fields:

  Develop Phase 1: plan-path, references
  Review Phase 1: phase

Populate these fields in the Task Property Panel before creating an instance."
```

### 3.3 Non-Workflow Canvas

When the user opens a canvas that is not in the configured workflow folder, the play button does not appear. No other UI elements are affected.

---

## 4. Architecture

### 4.1 Module Structure (New & Modified)

```
src/
├── main.ts                            # Modified — canvas button injection, Dataview check, new command
├── core/
│   ├── InstanceManager.ts             # Modified — folder note creation, field extraction helper
│   └── instanceValidation.ts          # New — pre-creation frontmatter validation
├── views/
│   ├── CreateInstancePanel.ts         # New — side panel for instance creation confirmation
│   └── canvasToolbar.ts               # New — canvas button injection logic
```

### 4.2 Data Flow

```
User opens workflow canvas
    │
    ▼
canvasToolbar.ts: CanvasToolbarManager
  ├─ Listens: workspace "active-leaf-change" and "layout-change"
  ├─ Early check: is active view type "canvas"?
  │     ├─ No → removeButton() → done
  │     └─ Yes → tryInjectButton(canvasView)
  │           ├─ Checks: file path matches workflow folder
  │           └─ Injects: play icon button into .canvas-controls
    │
    ▼ (user clicks button)
    │
main.ts: handleCreateInstanceClick()
  ├─ Loads workflow via WorkflowManager.getWorkflow()
  ├─ Calls validateWorkflowReadiness(workflow) — pure function
  │     ├─ For each task: extracts template-specific fields (non-ironflow-* keys)
  │     ├─ Checks each field value is non-empty
  │     └─ Returns: { valid: true } OR { valid: false, errors: [...] }
    │
    ├─ (invalid) → Notice with error details → STOP
    │
    ▼ (valid)
    │
CreateInstancePanel: open and render
  ├─ Displays: workflow name, instance name input, confirm button
  └─ On confirm: orchestrates creation
    │
    ▼
InstanceManager.createInstance()
  ├─ Uses field values from definition task frontmatter
  ├─ Creates instance directory and task files
  └─ Returns WorkflowInstance
    │
    ▼
InstanceManager.createInstanceFolderNote()
  ├─ Builds markdown with Dataview TABLE query
  ├─ Creates <instanceId>/<instanceId>.md
  └─ Returns TFile
    │
    ▼
Navigate to folder note in new tab
  ├─ workspace.getLeaf(true).openFile(folderNote)
  └─ Show success Notice
```

### 4.3 Component Details

#### 4.3.1 `canvasToolbar.ts` — Canvas Button Injection

Responsible for injecting and managing the play button on workflow canvases.

```typescript
export class CanvasToolbarManager {
    private buttonId = "ironflow-create-instance-button";

    constructor(
        private readonly app: App,
        private readonly settings: IronflowSettings,
        private readonly onCreateInstanceClick: (workflowName: string) => void
    ) {}

    /**
     * Register workspace event listeners for button injection.
     */
    register(plugin: Plugin): void

    /**
     * Attempt to inject the play button on a canvas view that has
     * already been confirmed as type "canvas". Checks whether the
     * canvas is a workflow canvas and whether the controls container
     * is accessible before injecting.
     */
    private tryInjectButton(canvasView: View): void

    /**
     * Remove the button from the DOM if present.
     */
    private removeButton(): void
}
```

**Injection logic:**

Event handlers perform an early view-type check before calling into injection logic:

```typescript
// active-leaf-change provides the leaf directly
workspace.on("active-leaf-change", (leaf) => {
    if (leaf?.view?.getViewType() !== "canvas") {
        this.removeButton();
        return;
    }
    this.tryInjectButton(leaf.view);
});

// layout-change does not provide a leaf — fetch the active view
workspace.on("layout-change", () => {
    const view = this.app.workspace.getActiveViewOfType(ItemView);
    if (view?.getViewType() !== "canvas") {
        this.removeButton();
        return;
    }
    this.tryInjectButton(view);
});
```

Inside `tryInjectButton(canvasView)`:

1. Get the canvas file path from `(canvasView as any).file?.path`.
2. Run through `getWorkflowNameFromCanvasPath()`. If null (not a workflow canvas), call `removeButton()` and return.
3. Access `(canvasView as any).canvas.quickSettingsButton?.parentElement`.
4. If the controls container exists and no button with `this.buttonId` is present, create and append the button.
5. The button's click handler calls `this.onCreateInstanceClick(workflowName)`.

**Button styling:**

```typescript
const button = document.createElement("div");
button.id = this.buttonId;
button.className = "clickable-icon";
setIcon(button, "play");
setTooltip(button, "Create Workflow Instance");
```

**Cleanup:** In `removeButton()`, query `document.getElementById(this.buttonId)` and remove if present. In `onunload()`, remove button and deregister events.

#### 4.3.2 `instanceValidation.ts` — Pre-Creation Validation

Pure validation logic that checks whether a workflow's definition tasks have all template-specific fields populated.

```typescript
export interface ValidationError {
    taskName: string;
    missingFields: string[];
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Check that all template-specific frontmatter fields on every task
 * in the workflow have non-empty values.
 *
 * Template-specific fields are identified as all frontmatter keys
 * that do not start with "ironflow-".
 */
export function validateWorkflowReadiness(
    workflow: IronflowWorkflow
): ValidationResult
```

**Validation rules:**

For each task in the workflow:
1. Extract all frontmatter keys that do not start with `"ironflow-"` — these are template-specific fields.
2. For each template-specific field, check the value is non-empty:
   - Strings: `value !== undefined && value !== null && String(value).trim() !== ""`
   - Arrays: `value !== undefined && value !== null && Array.isArray(value) && value.length > 0`
   - Other types: `value !== undefined && value !== null`
3. If any field is empty, add to the error list for that task.

If no errors are found across all tasks, return `{ valid: true, errors: [] }`.

**Note:** This function is pure (no side effects, no Vault access) and operates on the already-loaded `IronflowWorkflow` object. This makes it straightforward to unit test.

**Relationship to existing code:** `InstanceManager.ts` already has a private `validateTaskFieldValues()` method and a private `isManagedIronflowField()` helper. The existing validation checks that fields are **present** in the caller-provided `fieldValues` map. The new `validateWorkflowReadiness()` checks that fields already **have non-empty values** in the definition task frontmatter. Both use the same `ironflow-*` prefix check to identify managed vs. template-specific fields. The implementation should reuse `isManagedIronflowField()` (promoted to an exported utility) rather than duplicating the prefix logic.

#### 4.3.3 `CreateInstancePanel.ts` — Side Panel

An `ItemView` for confirming instance creation. Similar in structure to the existing `TaskPropertyPanel`.

```typescript
export class CreateInstancePanel extends ItemView {
    static VIEW_TYPE = "ironflow-create-instance";

    private workflowName: string | null = null;
    private instanceNameValue = "";

    getViewType(): string { return CreateInstancePanel.VIEW_TYPE; }
    getDisplayText(): string { return "Create Workflow Instance"; }
    getIcon(): string { return "play"; }

    async onOpen(): Promise<void>
    // Render empty state: "Click the play button on a workflow canvas to start."

    /**
     * Load a validated workflow and render the creation form.
     */
    async loadWorkflow(workflowName: string): Promise<void>
    // 1. Store workflowName
    // 2. Clear panel content
    // 3. Render:
    //    - Heading: "Create Instance"
    //    - Workflow name (read-only display)
    //    - Instance name Setting with text input
    //      (placeholder: "run-xxxx (auto-generated)")
    //    - "Create Instance" button (CTA style)
    // 4. Button click handler calls this.handleCreate()

    private async handleCreate(): Promise<void>
    // 1. Disable the button to prevent double-clicks
    // 2. Resolve instance name (user input or auto-generated)
    // 3. Extract field values from definition task frontmatter
    // 4. Call InstanceManager.createInstance()
    // 5. Call InstanceManager.createInstanceFolderNote()
    // 6. Show success Notice
    // 7. Check Dataview availability, show Notice if missing
    // 8. Open folder note in new tab
    // 9. Reset the panel to empty state

    async onClose(): Promise<void>
    // Cleanup
}
```

**Panel layout:**

```
┌──────────────────────────────────┐
│  Create Instance                 │
│                                  │
│  Workflow: Test-Workflow          │
│                                  │
│  Instance name                   │
│  ┌──────────────────────────┐    │
│  │ run-xxxx (auto-generated)│    │
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │    Create Instance       │    │
│  └──────────────────────────┘    │
│                                  │
└──────────────────────────────────┘
```

**Field value extraction:** When the user clicks confirm, the panel extracts template-specific field values directly from the definition task frontmatter (already validated as non-empty). This builds the `fieldValues` argument for `InstanceManager.createInstance()`.

The extraction logic reuses the existing `isManagedIronflowField()` helper already defined in `InstanceManager.ts` (which checks `key.startsWith("ironflow-")`). To make it available to the panel, this helper should be promoted from a module-private function to an exported utility — either from `InstanceManager.ts` or moved to `taskUtils.ts` alongside other frontmatter helpers.

```typescript
// Builds the fieldValues map by extracting non-ironflow-* fields per task.
// Uses the existing isManagedIronflowField() helper.
function extractFieldValues(
    workflow: IronflowWorkflow
): Record<string, Record<string, unknown>> {
    const fieldValues: Record<string, Record<string, unknown>> = {};
    for (const task of workflow.tasks) {
        fieldValues[task.name] = getUserFieldValues(task.frontmatter);
    }
    return fieldValues;
}
```

**Note:** `getUserFieldValues()` and `isManagedIronflowField()` already exist as private functions in `InstanceManager.ts`. Rather than duplicating this logic, the implementation should export these helpers (or move them to a shared utility module like `taskUtils.ts`) so both `InstanceManager` and `CreateInstancePanel` can use them.

#### 4.3.4 `InstanceManager` — Folder Note Creation (Extension)

Add a method to the existing `InstanceManager` class for creating the instance folder note.

```typescript
/**
 * Create a folder note for an instance with embedded Dataview queries.
 */
async createInstanceFolderNote(
    instance: WorkflowInstance
): Promise<TFile>
```

**Folder note content template:**

````markdown
---
ironflow-type: "instance-base"
ironflow-workflow: "{workflowName}"
ironflow-instance-id: "{instanceId}"
---

# {instanceId}

**Workflow:** [[{workflowName}]]
**Created:** {YYYY-MM-DD}

## Tasks

```dataview
TABLE ironflow-status AS "Status", ironflow-template AS "Template", ironflow-agent-profile AS "Agent", ironflow-depends-on AS "Depends On", ironflow-next-tasks AS "Next Tasks"
FROM "{instancePath}"
WHERE ironflow-instance-id AND file.name != "{instanceId}"
SORT file.name ASC
```
````

**Folder note path:** `<instancePath>/<instanceId>.md`

For example: `Workflows/Test-Workflow/instances/run-a3f8/run-a3f8.md`

**Frontmatter on the folder note:** The folder note itself has `ironflow-type: "instance-base"` to distinguish it from instance task files. This allows future features (instance listing, cleanup) to identify folder notes programmatically.

---

## 5. Modifications to Existing Code

### 5.1 `main.ts` — Plugin Entry Point

**New registrations in `onload()`:**

1. **Register `CreateInstancePanel` view** — alongside the existing `TaskPropertyPanel` registration.
2. **Initialize `CanvasToolbarManager`** — with a callback that triggers validation and panel opening.
3. **Register `create-instance` command** — command palette fallback that performs the same flow as the canvas button.

```typescript
// In onload():

// Register the create instance panel view
this.registerView(CreateInstancePanel.VIEW_TYPE, (leaf) => {
    return new CreateInstancePanel(leaf, this);
});

// Initialize canvas toolbar manager
this.canvasToolbarManager = new CanvasToolbarManager(
    this.app,
    this.settings,
    (workflowName) => void this.handleCreateInstanceClick(workflowName)
);
this.canvasToolbarManager.register(this);

// Register create-instance command (fallback for canvas button)
this.addCommand({
    id: "create-instance",
    name: "Create Instance",
    callback: () => {
        const workflowName = this.getActiveWorkflowName();
        if (!workflowName) {
            new Notice("Open a workflow canvas before creating an instance.");
            return;
        }
        void this.handleCreateInstanceClick(workflowName);
    },
});

```

**New methods on `IronflowPlugin`:**

```typescript
/**
 * Handle the create instance button click or command invocation.
 * Validates the workflow and opens the creation panel.
 */
async handleCreateInstanceClick(workflowName: string): Promise<void> {
    const workflow = await this.workflowManager?.getWorkflow(workflowName);
    if (!workflow) {
        new Notice(`Workflow "${workflowName}" not found.`);
        return;
    }

    const result = validateWorkflowReadiness(workflow);
    if (!result.valid) {
        this.showValidationErrorNotice(workflowName, result.errors);
        return;
    }

    const panel = await this.openCreateInstancePanel();
    await panel.loadWorkflow(workflowName);
}

/**
 * Reveal the create instance panel, creating it when necessary.
 */
async openCreateInstancePanel(): Promise<CreateInstancePanel> {
    let leaf =
        this.app.workspace.getLeavesOfType(CreateInstancePanel.VIEW_TYPE)[0] ??
        this.app.workspace.getRightLeaf(false);
    await leaf.setViewState({
        type: CreateInstancePanel.VIEW_TYPE,
        active: true,
    });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view as CreateInstancePanel;
}

/**
 * Format and display a validation error notice.
 */
private showValidationErrorNotice(
    workflowName: string,
    errors: ValidationError[]
): void {
    const lines = errors.map(
        (e) => `  ${e.taskName}: ${e.missingFields.join(", ")}`
    );
    new Notice(
        `Cannot create instance for "${workflowName}". ` +
        `The following tasks have empty required fields:\n\n` +
        `${lines.join("\n")}\n\n` +
        `Populate these fields in the Task Property Panel before creating an instance.`,
        0  // persistent until dismissed
    );
}

/**
 * Check whether the Dataview plugin is enabled.
 */
private isDataviewEnabled(): boolean {
    return this.app.plugins.enabledPlugins.has("dataview");
}
```

**Note:** Unlike the Templater check (`ensureTemplaterIsEnabled()` which runs at plugin load and shows a persistent notice), the Dataview check is called at instance creation time — Dataview is recommended, not required. See section 6.1.

**New property on `IronflowPlugin`:**

```typescript
canvasToolbarManager: CanvasToolbarManager | null = null;
```

**Cleanup in `onunload()`:**

```typescript
this.canvasToolbarManager = null;
```

### 5.2 `InstanceManager.ts` — Folder Note Method

Add the `createInstanceFolderNote()` method as described in section 4.3.4. This method is called by the `CreateInstancePanel` after `createInstance()` succeeds.

### 5.3 Canvas Internal API Type Handling

The `layout-change` and `active-leaf-change` workspace events used by `CanvasToolbarManager` are already part of the official Obsidian type definitions — no module augmentation is needed for these.

For the canvas-specific internal properties (`(view as any).canvas`, `canvas.quickSettingsButton`, etc.), use `as any` casts at the point of use, consistent with the established community pattern. Do not attempt to fully type the internal Canvas API — it is undocumented and subject to change.

### 5.4 `styles.css` — Create Instance Panel Styles

Add styles for the `CreateInstancePanel` view to `styles.css`, following the conventions established by the existing `TaskPropertyPanel` styles.

**Pattern:** Each Ironflow side panel follows a three-layer CSS structure:

1. **Leaf content reset** — A `workspace-leaf-content[data-type="…"] .view-content` rule that zeroes out the default padding so the panel container controls its own layout.
2. **Panel container** — An `.ironflow-*-panel` class on `containerEl` that adds padding and enables vertical scrolling.
3. **Semantic child classes** — Purpose-specific classes for headings, empty states, sections, etc.

The `CreateInstancePanel` reuses the existing `.ironflow-empty-state` class (shared with `TaskPropertyPanel`) and introduces panel-specific rules:

```css
/* --- Side panel: CreateInstancePanel --- */

.workspace-leaf-content[data-type="ironflow-create-instance"] .view-content {
    padding: 0;
}

.ironflow-create-instance-panel {
    padding: var(--size-4-3);
    overflow-y: auto;
}

.ironflow-create-instance-panel h3 {
    font-size: var(--font-ui-large);
    font-weight: var(--font-semibold);
    color: var(--text-normal);
    padding: var(--size-4-1) 0 var(--size-4-3);
    line-height: var(--line-height-tight);
}
```

**CSS classes used by the panel implementation:**

| Class | Element | Purpose |
|-------|---------|---------|
| `.ironflow-create-instance-panel` | `containerEl` | Panel padding and scroll |
| `.ironflow-create-instance-panel h3` | Workflow name heading | Typography matching `.ironflow-task-name` |
| `.ironflow-empty-state` | Empty-state message div | Shared with `TaskPropertyPanel` — centered, faint text |

**Canvas toolbar button:** The injected play button uses the standard Obsidian `.clickable-icon` class and is appended inside the native `.canvas-controls` container. It inherits the canvas toolbar's own layout, spacing, and hover styles. No custom CSS is needed for the button itself.

**Design decisions:**

- The `h3` heading style mirrors `.ironflow-task-name` but targets the element directly within the panel scope rather than introducing another named class. This keeps the panel's DOM simpler since it only has one heading.
- The leaf content padding reset follows the same pattern as `TaskPropertyPanel` to give the panel full control over its internal layout.
- Obsidian CSS custom properties (`--size-*`, `--font-*`, `--text-*`, `--line-height-*`) are used throughout for theme compatibility.

---

## 6. Plugin Dependency Checks

### 6.1 Dataview Check

Dataview is a **recommended** dependency, not a hard requirement. The check is performed at instance creation time (not plugin load), since Dataview only affects the folder note rendering.

```typescript
private isDataviewEnabled(): boolean {
    return this.app.plugins.enabledPlugins.has("dataview");
}
```

When creating an instance, if Dataview is not enabled:

```typescript
if (!this.isDataviewEnabled()) {
    new Notice(
        "Install the Dataview plugin for a live task table in the instance base note.",
        8000
    );
}
```

### 6.2 Existing Dependency Checks

The existing Templater check in `ensureTemplaterIsEnabled()` remains unchanged. Templater is a **hard** dependency — instance task bodies cannot be rendered without it.

---

## 7. Error Handling

| Scenario | Behavior |
|----------|----------|
| Canvas button clicked on non-workflow canvas | Button is not shown (scoped injection). If somehow triggered, `getActiveWorkflowName()` returns null and a Notice is shown. |
| Workflow not found | Notice: "Workflow 'X' not found." |
| Template-specific fields empty | Notice with detailed list of tasks and missing fields. Instance creation blocked. |
| Instance name collision | `InstanceManager.createInstance()` throws. Notice: "Instance 'X' already exists for workflow 'Y'." |
| Template not found for a task | `InstanceManager.createInstance()` throws. Notice with error message. |
| Vault write failure | Caught at the creation step. Notice with error message. Partially created files remain for manual cleanup. |
| Dataview not installed | Non-blocking notice at creation time. Folder note created with raw query text. |
| Canvas internal API changed | Button injection silently fails (null checks on `quickSettingsButton` and `parentElement`). Command palette fallback remains functional. |

---

## 8. Acceptance Criteria

### 8.1 Canvas Toolbar Button

- [ ] A play icon button appears in the canvas toolbar when viewing a workflow canvas (file path matches `<workflowFolder>/<name>.canvas`).
- [ ] The button does not appear on non-workflow canvases or non-canvas views.
- [ ] The button is removed when navigating away from a workflow canvas.
- [ ] The button is re-injected when switching between workflow canvases.
- [ ] Clicking the button triggers the validation and panel flow.
- [ ] If the canvas DOM structure is unavailable (null checks fail), no error is thrown and the command palette fallback works.

### 8.2 Command Palette Fallback

- [ ] An `Ironflow: Create Instance` command is registered.
- [ ] The command is functional when a workflow canvas is the active view.
- [ ] The command shows a Notice if no workflow canvas is active.

### 8.3 Frontmatter Validation

- [ ] Validation checks all template-specific fields (non-`ironflow-*` keys) on every definition task.
- [ ] Empty strings, null, undefined, and absent fields are treated as empty.
- [ ] Validation errors produce a Notice listing each task and its missing fields.
- [ ] Validation passes when all template-specific fields have non-empty values.
- [ ] Validation is a pure function with unit tests covering: all fields populated (pass), some fields empty (fail), multiple tasks with different missing fields (fail), workflow with no template-specific fields (pass).

### 8.4 Create Instance Panel

- [ ] The panel opens in the right sidebar when validation passes.
- [ ] The panel displays the workflow name as a read-only heading.
- [ ] The panel has a text input for an optional instance name with placeholder text.
- [ ] The panel has a "Create Instance" confirm button.
- [ ] The confirm button is disabled during creation to prevent double-clicks.
- [ ] After successful creation, the panel resets to its empty state.
- [ ] The panel shows an empty state message when no workflow is loaded.

### 8.5 Instance Creation

- [ ] Clicking confirm calls `InstanceManager.createInstance()` with field values extracted from definition task frontmatter.
- [ ] When instance name is provided, it is used as the instance directory name.
- [ ] When instance name is left blank, an auto-generated `run-<hex>` ID is used.
- [ ] A success Notice is shown after creation.
- [ ] On error, a Notice is shown with the error message and the panel remains open.

### 8.6 Instance Folder Note

- [ ] A folder note is created at `<instancePath>/<instanceId>.md`.
- [ ] The folder note has frontmatter with `ironflow-type: "instance-base"`, `ironflow-workflow`, and `ironflow-instance-id`.
- [ ] The folder note contains a Dataview TABLE query scoped to the instance directory.
- [ ] The TABLE query includes columns: Status, Template, Agent, Depends On, Next Tasks.
- [ ] The TABLE query excludes the folder note itself via `file.name != "<instanceId>"`.
- [ ] The folder note includes the workflow name as an internal link and the creation date.

### 8.7 Post-Creation Navigation

- [ ] After creation, the instance folder note is opened in a new tab.
- [ ] The new tab is focused (navigated to).

### 8.8 Dataview Check

- [ ] If Dataview is not enabled at instance creation time, a Notice is shown recommending installation.
- [ ] The instance is still created successfully regardless of Dataview availability.
- [ ] The folder note is created with the raw Dataview query text (graceful degradation).

### 8.9 Plugin Lifecycle

- [ ] `CreateInstancePanel` is registered in `onload()` and detached in `onunload()`.
- [ ] `CanvasToolbarManager` is initialized in `onload()` and cleaned up in `onunload()`.
- [ ] The injected canvas button is removed when the plugin is disabled.
- [ ] No resource leaks: all event listeners are registered via `registerEvent()` or `register()`.

### 8.10 Styles

- [ ] `styles.css` includes a leaf content padding reset for `data-type="ironflow-create-instance"`.
- [ ] `.ironflow-create-instance-panel` provides padding and vertical scroll, matching the `.ironflow-task-panel` layout.
- [ ] `.ironflow-create-instance-panel h3` styles the workflow name heading with typography consistent with `.ironflow-task-name`.
- [ ] All rules use Obsidian CSS custom properties (`--size-*`, `--font-*`, `--text-*`, `--line-height-*`) for theme compatibility.
- [ ] The existing `.ironflow-empty-state` class is reused without duplication.
- [ ] The canvas toolbar button requires no custom CSS (inherits `.clickable-icon` and `.canvas-controls` styles).

### 8.11 Unit Tests

- [ ] `validateWorkflowReadiness()`: all fields populated returns valid.
- [ ] `validateWorkflowReadiness()`: empty string field returns invalid with correct task and field name.
- [ ] `validateWorkflowReadiness()`: null/undefined field returns invalid.
- [ ] `validateWorkflowReadiness()`: multiple tasks with different missing fields returns all errors.
- [ ] `validateWorkflowReadiness()`: task with only ironflow-* fields (no template fields) returns valid.
- [ ] `extractFieldValues()`: correctly extracts non-ironflow-* fields per task.
- [ ] `createInstanceFolderNote()`: creates file at correct path with expected content.
- [ ] `createInstanceFolderNote()`: folder note frontmatter contains correct type, workflow, and instance ID.
- [ ] Integration: end-to-end flow from validation through instance creation to folder note creation.

---

## 9. Directory Structure (After Implementation)

```
<vault>/
└── Workflows/
    ├── Test-Workflow.canvas                     # Workflow definition (unchanged)
    └── Test-Workflow/
        ├── Develop Phase 1.md                   # Definition task template
        ├── Review Phase 1.md                    # Definition task template
        └── instances/
            └── sprint-1/                        # Created by this feature
                ├── sprint-1.md                  # Instance folder note (base)
                ├── Develop Phase 1.md           # Instance task (rendered)
                └── Review Phase 1.md            # Instance task (rendered)
```

---

## 10. Future Considerations

These are intentionally out of scope but influence design choices made here:

1. **Instance listing view**: The `ironflow-type: "instance-base"` frontmatter on folder notes enables future queries like `FROM "Workflows" WHERE ironflow-type = "instance-base"` to list all instances across all workflows.

2. **Instance deletion**: The folder note at `<instanceId>/<instanceId>.md` serves as a clear anchor. A future "Delete Instance" command can find and remove the entire instance directory.

3. **Status dashboard**: The Dataview query pattern established in the folder note can be reused for a global dashboard showing all active instances and their task statuses.

4. **Canvas generation for instances**: If future phases add canvas files for instances, the folder note can link to the instance canvas alongside the Dataview table.

5. **Folder notes plugin integration**: If a folder notes plugin is detected, the plugin could offer to configure the folder note settings automatically. For now, this is left as a user recommendation in documentation.
