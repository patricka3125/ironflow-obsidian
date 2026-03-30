# Ironflow User Guide: Workflow Schemas and Instances

This guide walks through defining workflow schemas (workflow definitions) and creating active workflow instances from them.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Part 1: Defining a Workflow Schema](#part-1-defining-a-workflow-schema)
  - [Creating a Workflow](#creating-a-workflow)
  - [Setting Up Templater Templates](#setting-up-templater-templates)
  - [Adding Tasks to a Workflow](#adding-tasks-to-a-workflow)
  - [Configuring Task Properties](#configuring-task-properties)
  - [Setting Up Dependencies](#setting-up-dependencies)
  - [Understanding the Canvas Visualization](#understanding-the-canvas-visualization)
- [Part 2: Creating Workflow Instances](#part-2-creating-workflow-instances)
  - [Preparing a Schema for Instantiation](#preparing-a-schema-for-instantiation)
  - [Creating an Instance from the Canvas](#creating-an-instance-from-the-canvas)
  - [Creating an Instance via the Command Palette](#creating-an-instance-via-the-command-palette)
  - [The Instance Folder Note](#the-instance-folder-note)
  - [Understanding Instance Task Statuses](#understanding-instance-task-statuses)
- [File Structure Reference](#file-structure-reference)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before using Ironflow's workflow features, ensure the following plugins are installed and enabled in your vault:

| Plugin | Required? | Purpose |
|--------|-----------|---------|
| [Templater](https://github.com/SilentVoid13/Templater) | **Yes** | Source templates for workflow tasks. Ironflow will not load without it. |
| [Dataview](https://github.com/blacksmithgu/obsidian-dataview) | Recommended | Renders live task tables in instance folder notes. Without it, the raw query text is displayed instead. |
| [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes) | Optional | Clicking an instance folder in the file explorer opens its summary note directly. |

Additionally, enable Templater's **"Trigger Templater on new file creation"** setting. This allows Templater to automatically render `tp.*` expressions in instance task files when they are created.

---

## Configuration

Open **Settings > Community plugins > Ironflow** to configure two folder paths:

| Setting | Default | Description |
|---------|---------|-------------|
| **Workflow folder** | `Workflows` | Root folder where all workflow definitions and instances are stored. |
| **Template folder** | `Templates` | Folder containing your Templater templates. Should match the folder configured in Templater's own settings. |

Both folders are created automatically if they don't exist when you create your first workflow or template.

---

## Part 1: Defining a Workflow Schema

A **workflow schema** (also called a **workflow definition**) is a reusable blueprint for a multi-step process. It consists of two parts:

1. A **canvas file** (`.canvas`) that visually lays out tasks and their dependency arrows
2. A **task folder** containing markdown task template files with frontmatter configuration

Workflow schemas are never modified by instance creation. They serve as templates you can instantiate repeatedly.

### Creating a Workflow

1. Open the command palette (`Ctrl+P` / `Cmd+P`).
2. Run **"Ironflow: New Workflow"**.
3. Enter a name for the workflow (e.g., `feature-development`) and click **Create**.

Ironflow creates:
- `Workflows/feature-development.canvas` — an empty canvas file
- `Workflows/feature-development/` — an empty task folder

The canvas file opens automatically so you can start adding tasks.

**Naming rules:** Workflow names must be unique within the workflow folder. The name is used as both the canvas filename and the task folder name, so it must be a valid folder/file name.

### Setting Up Templater Templates

Before adding tasks to a workflow, you need Templater templates that define the fields and body content for each task type. Templates live in your configured template folder (default: `Templates/`).

A Templater template is a regular markdown file with frontmatter fields that serve as configurable parameters:

```markdown
---
plan-path: ""
references: ""
phase: ""
---

# Development Execution

Use the execution plan at `<% tp.frontmatter["plan-path"] %>` as the source of truth.
Reference sources: `<% tp.frontmatter["references"] %>`
Current phase: <% tp.frontmatter["phase"] %>
```

**Key points about templates:**

- Every frontmatter key in the template becomes a configurable field on any workflow task derived from it.
- The template body can contain Templater expressions (`tp.*`) that reference frontmatter values. These expressions are rendered when a workflow instance is created.
- You can have as many or as few frontmatter fields as needed. A template with no frontmatter fields is also valid.
- Templates are discovered automatically by Ironflow on plugin load and when files change in the template folder.

### Adding Tasks to a Workflow

With a workflow canvas open:

1. Open the command palette.
2. Run **"Ironflow: Add Task"**.
3. In the modal that appears:
   - Enter a **task name** (e.g., `Develop Phase 1`)
   - Select a **source template** from the dropdown (e.g., `Development Execution`)
4. Click **Add**.

Ironflow creates a task file at `Workflows/feature-development/Develop Phase 1.md` and adds it as a file node on the canvas. The node is automatically positioned to the right of existing nodes.

Repeat this for each task in the workflow. For example, a development workflow might have:
- `Develop Phase 1` (from template `Development Execution`)
- `Review Phase 1` (from template `Review Cycle Prompt`)
- `Deploy` (from template `Deployment Checklist`)

**What goes into the task file:**

When a task is created, Ironflow generates a markdown file with merged frontmatter:

```yaml
---
# Ironflow-managed fields (auto-populated)
ironflow-template: "Development Execution"
ironflow-workflow: "feature-development"
ironflow-agent-profile: ""
ironflow-depends-on: []
ironflow-next-tasks: []

# Template-specific fields (from the source template, initially empty/default)
plan-path: ""
references: ""
phase: ""
---
```

The Ironflow-managed fields (prefixed with `ironflow-`) track the task's role in the workflow. The template-specific fields are the configurable parameters you'll fill in before creating an instance.

### Configuring Task Properties

Click a task node on the canvas to open the **Ironflow Task Properties** panel in the right sidebar. You can also open it via the command palette with **"Ironflow: Open Task Properties"** or by clicking the Ironflow icon in the ribbon.

The panel shows the following editable fields:

| Section | Fields | Description |
|---------|--------|-------------|
| **Source Template** | (read-only) | The Templater template this task was derived from. |
| **Agent Profile** | Text input | An optional identifier for a CAO agent profile to execute this task (e.g., `developer`, `reviewer`). Free text — not validated. |
| **Depends On** | Multi-select dropdown | Upstream tasks that must complete before this task can start. |
| **Next Tasks** | Multi-select dropdown | Downstream tasks that should start after this task completes. |
| **Template Fields** | Dynamic inputs | One input per frontmatter field from the source template. |

**Editing template fields:**

Fill in the template-specific fields with the values you want for this workflow. For example:
- `plan-path`: `Projects/my-project/plan.md`
- `references`: `src/main.ts, docs/architecture.md`
- `phase`: `1`

All changes are saved automatically with a short debounce (500ms), so you don't need to click a save button.

### Setting Up Dependencies

Dependencies define the execution order of tasks. To create a chain like `Develop Phase 1 → Review Phase 1 → Deploy`:

1. Click the `Develop Phase 1` node on the canvas.
2. In the Task Properties panel, find the **Next Tasks** section.
3. Select `Review Phase 1` from the dropdown and click **Add**.
4. Click the `Review Phase 1` node.
5. Add `Deploy` as its next task.

**Reciprocal updates:** When you add `Review Phase 1` as a next task of `Develop Phase 1`, Ironflow automatically adds `Develop Phase 1` to `Review Phase 1`'s "Depends On" list. You don't need to set both sides manually.

**Canvas edge sync:** After every dependency change, Ironflow updates the `.canvas` file to draw arrows between the connected tasks. The arrows reflect the dependency direction: an arrow from A to B means "A must complete before B can start."

**Removing dependencies:** To remove a dependency, clear the corresponding entry from either the "Depends On" or "Next Tasks" dropdown. The reciprocal link on the other task is removed automatically.

### Understanding the Canvas Visualization

The workflow canvas is a visual representation of your workflow schema:

- **Task nodes** are file cards pointing to the task markdown files in the workflow folder.
- **Dependency arrows** are drawn automatically from upstream tasks to downstream tasks based on frontmatter.
- **Layout** is fully manual — drag nodes to arrange them however you prefer. Ironflow does not auto-layout existing nodes.

The canvas is treated as a **read-only visualization layer** by the plugin. All task editing happens through the Task Properties side panel, not by editing the canvas directly. You can, however, add your own annotations (text nodes, groups, manual edges) to the canvas — Ironflow preserves any edges and nodes it doesn't manage.

---

## Part 2: Creating Workflow Instances

A **workflow instance** is a live, executable copy of a workflow schema. It contains task files with fully populated frontmatter values and rendered template bodies, ready for use.

Instances are stored under an `instances/` subdirectory within the workflow's task folder. The original workflow schema is never modified.

### Preparing a Schema for Instantiation

Before creating an instance, **all template-specific fields on every task must have non-empty values**. Ironflow validates this before allowing instance creation.

To prepare:

1. Open the workflow canvas.
2. Click each task node and fill in all template-specific fields in the Task Properties panel.
3. Ensure no field is left blank, null, or empty.

**What counts as "empty":**
- Empty strings or whitespace-only strings
- Null or undefined values
- Empty arrays (`[]`)

If you attempt to create an instance with empty fields, Ironflow shows a notice listing exactly which tasks and fields need attention:

```
Cannot create instance for "feature-development". The following tasks
have empty required fields:

  Develop Phase 1: plan-path, references
  Review Phase 1: phase

Populate these fields in the Task Property Panel before creating an instance.
```

### Creating an Instance from the Canvas

This is the primary way to create instances:

1. Open a workflow canvas (e.g., `Workflows/feature-development.canvas`).
2. Look for the **play button** (▶) in the canvas toolbar area (top-right, alongside the zoom and undo controls).
   - This button only appears on workflow canvases. It won't show on regular, non-workflow canvases.
3. Click the play button.
4. If validation passes, the **Create Instance** panel opens in the right sidebar.
5. The panel shows:
   - **Workflow name** (read-only)
   - **Instance name** — an optional text input. Leave blank for an auto-generated name like `run-a3f8`.
   - **Create Instance** button
6. Optionally enter a descriptive instance name (e.g., `sprint-1`, `hotfix-auth`).
7. Click **Create Instance**.

After creation:
- A success notice confirms the instance was created.
- If Dataview is not installed, an additional notice recommends installing it.
- The instance's folder note opens in a new tab.

### Creating an Instance via the Command Palette

As a fallback (or if you prefer keyboard-driven workflows):

1. Open the workflow canvas you want to instantiate.
2. Open the command palette (`Ctrl+P` / `Cmd+P`).
3. Run **"Ironflow: Create Instance"**.

This triggers the same validation and panel flow as the canvas play button.

### The Instance Folder Note

After creating an instance, Ironflow generates a **folder note** — a summary markdown file that serves as the entry point for the instance.

The folder note is located at:
```
Workflows/<workflow-name>/instances/<instance-id>/<instance-id>.md
```

For example: `Workflows/feature-development/instances/sprint-1/sprint-1.md`

**Contents of the folder note:**

```markdown
---
ironflow-type: "instance-base"
ironflow-workflow: "feature-development"
ironflow-instance-id: "sprint-1"
---

# sprint-1

**Workflow:** [[feature-development]]
**Created:** 2026-03-29

## Tasks

(Dataview table showing all instance tasks)
```

If you have the **Dataview** plugin installed, the Tasks section renders as a live table with columns for:

| Column | Description |
|--------|-------------|
| **Status** | Current task status (`open`, `pending`, `in-progress`, `done`) |
| **Template** | The source Templater template name |
| **Agent** | The CAO agent profile assigned to the task |
| **Depends On** | Links to upstream tasks |
| **Next Tasks** | Links to downstream tasks |

The table updates automatically as you modify task files within the instance.

If Dataview is not installed, the raw query text is displayed. You can still navigate to individual task files manually.

**Tip:** Install the [Folder Notes](https://github.com/LostPaul/obsidian-folder-notes) plugin so that clicking an instance folder in the file explorer opens this summary note directly.

### Understanding Instance Task Statuses

Each task in a workflow instance is assigned an initial status based on its dependencies:

| Condition | Initial Status | Meaning |
|-----------|---------------|---------|
| Task has **no** upstream dependencies | `open` | Ready to start immediately. |
| Task has **one or more** upstream dependencies | `pending` | Waiting for upstream tasks to complete. |

The full set of statuses is:

| Status | Description |
|--------|-------------|
| `open` | Task is ready to be worked on. |
| `pending` | Task is waiting for upstream dependencies. |
| `in-progress` | Task is actively being worked on. |
| `done` | Task is complete. |

Initial status assignment is automatic. Transitioning between statuses (e.g., marking a task `done`) is done by editing the `ironflow-status` field in the task file's frontmatter.

---

## File Structure Reference

After creating a workflow schema with two tasks and one instance, the file structure looks like this:

```
Workflows/                                      # Workflow root (configurable)
├── feature-development.canvas                  # Workflow schema canvas
└── feature-development/                        # Schema task folder
    ├── Develop Phase 1.md                      # Definition task (template fields)
    ├── Review Phase 1.md                       # Definition task (template fields)
    └── instances/                              # All instances for this workflow
        └── sprint-1/                           # One instance
            ├── sprint-1.md                     # Folder note (Dataview summary)
            ├── Develop Phase 1.md              # Instance task (rendered)
            └── Review Phase 1.md              # Instance task (rendered)
```

**Key distinctions:**

| File | Purpose | Editable? |
|------|---------|-----------|
| `feature-development.canvas` | Visual layout and dependency arrows for the schema | Positions are editable via drag-and-drop; edges are managed by Ironflow |
| `feature-development/Develop Phase 1.md` | Schema task with configurable fields and dependencies | Yes — via the Task Properties panel |
| `instances/sprint-1/sprint-1.md` | Instance summary with Dataview table | Can be edited, but content is generated at creation |
| `instances/sprint-1/Develop Phase 1.md` | Live instance task with rendered template body | Yes — this is the working document |

**Instance task frontmatter** includes everything from the definition task plus two additional fields:

```yaml
---
ironflow-template: "Development Execution"
ironflow-workflow: "feature-development"
ironflow-agent-profile: "developer"
ironflow-depends-on: []
ironflow-next-tasks:
  - "[[Review Phase 1]]"
ironflow-instance-id: "sprint-1"              # Marks this as an instance task
ironflow-status: "open"                        # Computed from dependencies
plan-path: "Projects/my-project/plan.md"       # Populated from schema
references: "src/main.ts, docs/architecture.md"
phase: "1"
---

# Development Execution                        # Rendered template body
Use the execution plan at `Projects/my-project/plan.md` as the source of truth.
...
```

---

## Troubleshooting

### "Ironflow requires the Templater plugin"

Ironflow shows this notice on plugin load if Templater is not installed or enabled. Install Templater from Community plugins and enable it, then reload Ironflow.

### Play button doesn't appear on the canvas

- Verify you're viewing a workflow canvas (a `.canvas` file inside the configured workflow folder, e.g., `Workflows/my-workflow.canvas`).
- Non-workflow canvases (canvases outside the workflow folder, or canvases that don't have a matching task folder) won't show the button.
- The button relies on internal Obsidian canvas APIs. If a future Obsidian update breaks the button, use the **"Ironflow: Create Instance"** command from the command palette as a fallback.

### Validation fails with empty fields

All template-specific fields (non-`ironflow-*` keys) must have values before creating an instance. Click each task node listed in the error notice and fill in the missing fields in the Task Properties panel.

### Instance name collision

If you try to create an instance with a name that already exists (e.g., `sprint-1` already exists under `instances/`), Ironflow shows an error. Choose a different name or leave the field blank for an auto-generated name.

### Dataview table shows raw query text

Install the [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin and enable it. The Dataview code block in the folder note will then render as a live table. No changes to the folder note are needed.

### Template body not rendered (tp.* expressions visible)

Ensure Templater's **"Trigger Templater on new file creation"** setting is enabled. This allows Templater to automatically process `tp.*` expressions when instance task files are created. Without this setting, the raw template expressions will appear in the instance task files instead of rendered values.

### Task Properties panel doesn't load

- Click directly on a task **file node** on the canvas (not a text node, group, or edge).
- The file must be inside a workflow's task folder. Files outside the workflow folder won't trigger the panel.
- Try running **"Ironflow: Open Task Properties"** from the command palette to force the panel open.
