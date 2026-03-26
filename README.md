# Ironflow — Workflow Definitions for Obsidian

Ironflow is an Obsidian plugin that turns your vault into a workflow orchestration hub. Define reusable, multi-task workflows as Canvas files, derive tasks from Templater templates, configure dependencies and agent profiles, and visualize the full dependency graph with arrows.

## Prerequisites

- [Obsidian](https://obsidian.md/) v0.15.0+
- [Templater](https://github.com/SilentVoid13/Templater) plugin (required)
- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin (optional — for future REST API features)

## Installation

```bash
git clone https://github.com/patricka3125/ironflow-local-rest-api.git
cd ironflow-local-rest-api
npm install
npm run build
```

Link into your vault:

```bash
ln -s /path/to/ironflow-local-rest-api /path/to/your-vault/.obsidian/plugins/ironflow-local-rest-api
```

Then in Obsidian: **Settings > Community plugins > enable Ironflow Local REST API**.

## Setup

1. Install and enable the **Templater** plugin in your vault.
2. Create a `Templates/` folder with at least one `.md` file that has frontmatter fields:

    ```markdown
    ---
    target-branch: ""
    provider: "claude_code"
    ---
    Template content here.
    ```

3. Set Templater's template folder location to `Templates` in its settings.
4. Optionally configure Ironflow's **Workflow folder** and **Template folder** in Settings > Ironflow Local REST API (defaults: `Workflows` and `Templates`).

## Quickstart

### 1. Create a workflow

- Open the command palette (`Ctrl+P` / `Cmd+P`)
- Run **"Ironflow: New Workflow"**
- Enter a name (e.g., `review-cycle`) and click **Create**
- The canvas file opens automatically and a `Workflows/review-cycle/` folder is created

### 2. Add tasks

With the workflow canvas still open:

- Open the command palette
- Run **"Ironflow: Add Task"**
- Enter a task name (e.g., `build-feature`), select a template, click **Add**
- Repeat for more tasks (e.g., `code-review`, `deploy`)

Each task appears as a node on the canvas, auto-positioned to the right of existing nodes.

### 3. Configure task properties

- Click a task node on the canvas — the **Ironflow Task Properties** panel opens in the right sidebar
- Edit the **Agent profile** (e.g., `developer`)
- Edit any **Template fields** (e.g., `target-branch`, `provider`)
- Changes are saved automatically with debouncing

### 4. Set up dependencies

To create `build-feature -> code-review -> deploy`:

- Click the `build-feature` node
- Under **Next tasks**, select `code-review` from the dropdown and click **Add**
- An arrow appears on the canvas from `build-feature` to `code-review`
- The reciprocal link (`code-review` depends on `build-feature`) is set automatically
- Click `code-review` and add `deploy` as its next task

### 5. Verify

- The canvas shows directional arrows representing the dependency chain
- Clicking any task node loads its properties in the side panel
- Opening a task `.md` file shows the merged frontmatter with all Ironflow and template fields
- Editing frontmatter in the markdown editor refreshes the side panel in real time

## Commands

| Command | Description |
|---------|-------------|
| **Ironflow: New Workflow** | Create a new workflow definition (canvas + task folder) |
| **Ironflow: Add Task** | Add a task to the active workflow from a template |
| **Ironflow: Open Task Properties** | Open the task property side panel |

The ribbon sidebar also has an Ironflow icon for quick access to the task properties panel.

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for build instructions, project structure, and development workflow.

## License

[MIT](./LICENSE)
