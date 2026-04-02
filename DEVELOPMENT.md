# Ironflow Plugin — Development Guide

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+, see `.tool-versions`)
- [Git](https://git-scm.com/)
- [Obsidian](https://obsidian.md/) (v0.15.0+)

## Required Obsidian Plugins

These must be installed and enabled in your development vault:

- [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) — provides the REST API framework that Ironflow extends
- [Templater](https://github.com/SilentVoid13/Templater) — required dependency for template discovery and rendering

Optional but recommended:

- [Hot-Reload](https://github.com/pjeby/hot-reload) — automatically reloads the plugin when `main.js` changes, eliminating manual toggle cycles

## Initial Setup

### 1. Clone the repository

```bash
git clone https://github.com/patricka3125/ironflow-obsidian.git
cd ironflow-obsidian
```

### 2. Install dependencies

```bash
npm install
```

### 3. Link the plugin into your development vault

Create a symlink from the project directory into your vault's plugins folder:

```bash
# Linux / macOS
ln -s /path/to/ironflow-obsidian /path/to/dev-vault/.obsidian/plugins/ironflow-obsidian

# Windows (run as Administrator)
mklink /D "C:\path\to\dev-vault\.obsidian\plugins\ironflow-obsidian" "C:\path\to\ironflow-obsidian"
```

### 4. Enable the plugin

1. Open your development vault in Obsidian
2. Go to **Settings → Community plugins**
3. Turn on **Community plugins** if not already enabled
4. Find **Ironflow** under **Installed plugins** and toggle it on

## Development Workflow

### Build and watch for changes

```bash
npm run dev
```

This starts esbuild in watch mode. It continuously compiles `src/main.ts` → `main.js` whenever you save a source file.

### Production build

```bash
npm run build
```

Runs the TypeScript compiler for type checking (`tsc --noEmit`), then bundles with esbuild in production mode (no source maps, tree-shaking enabled).

### Type checking only

```bash
npx tsc --noEmit --skipLibCheck
```

Runs the TypeScript compiler without emitting output. Useful for CI or quick validation.

### Regenerating API schema types

The REST API contract is defined in `src/api/openapi.yaml`. TypeScript types for
that contract are generated into `src/api/schema.d.ts` via `openapi-typescript`.

To regenerate the API types after changing the OpenAPI spec, run:

```bash
npm run generate:api-types
```

`src/api/schema.d.ts` is a generated artifact and is gitignored, so regenerate it
locally whenever you update `src/api/openapi.yaml`.

## End-to-End API Tests

The `test/e2e/` directory contains a pytest suite that exercises the Ironflow
REST API against a running Obsidian instance. These tests are separate from the
unit tests in `test/` and require a live vault with the Local REST API and
Ironflow plugins enabled.

### Prerequisites

- Python 3.10+
- A running Obsidian vault with:
  - **Local REST API** plugin enabled and an API key configured
  - **Ironflow** plugin enabled with at least one active workflow instance

### Setup

```bash
# Create a virtual environment (one-time)
python -m venv test/e2e/.venv
source test/e2e/.venv/bin/activate   # Linux / macOS
# test\e2e\.venv\Scripts\activate    # Windows

# Install dependencies
pip install -r test/e2e/requirements.txt
```

Create a `.env` file from the example and fill in your API key:

```bash
cp test/e2e/.env.example test/e2e/.env
# Edit test/e2e/.env and set OBSIDIAN_API_KEY
```

The `.env` file is gitignored and will not be committed.

### Running

```bash
# Run all e2e tests
pytest test/e2e/ -v

# Run a specific test class
pytest test/e2e/test_instance_tasks_api.py::TestListInstanceTasks -v
```

If `OBSIDIAN_API_KEY` is not set, the tests are automatically skipped.

### Test data

The tests expect the following data in the vault:

| Item | Value |
|------|-------|
| Workflow | `Code Development` |
| Instance | `run-9e79` |
| Tasks | `Develop Phase 1`, `Review Phase 1` |

Adjust the constants at the top of `test_instance_tasks_api.py` if your vault
uses different names.

## Reloading Changes

After esbuild recompiles `main.js`, you need to reload the plugin in Obsidian:

**With Hot-Reload plugin (recommended)**:
- Changes are detected and reloaded automatically. No action needed.

**Without Hot-Reload**:
1. Open **Settings → Community plugins**
2. Toggle Ironflow **off**, then **on** again

**After modifying `manifest.json`**:
- You must fully restart Obsidian (Hot-Reload does not detect manifest changes)

## Debugging

### Developer Tools

Open the Obsidian developer console:
- **macOS**: `Cmd + Option + I`
- **Windows/Linux**: `Ctrl + Shift + I`

Use `console.log()` in your plugin code — output appears in the developer console. You can also set breakpoints in the Sources tab by navigating to your plugin's `main.js`.

### Useful console commands

```javascript
// Inspect the plugin instance
app.plugins.plugins["ironflow-obsidian"]

// Check if Templater is available
app.plugins.getPlugin("templater-obsidian")

// Check if Local REST API is available
app.plugins.enabledPlugins.has("obsidian-local-rest-api")

// List all files in a folder
app.vault.getAbstractFileByPath("Workflows")

// Read a file's cached metadata (frontmatter)
app.metadataCache.getCache("Workflows/my-workflow/task.md")
```

## Testing the REST API

With the Local REST API plugin enabled, endpoints are available at `https://localhost:27124` (default). The API requires an API key, configurable in the Local REST API settings.

```bash
# List workflows
curl -k -H "Authorization: Bearer YOUR_API_KEY" \
  https://localhost:27124/ironflow/workflows/

# Get a specific workflow
curl -k -H "Authorization: Bearer YOUR_API_KEY" \
  https://localhost:27124/ironflow/workflows/my-workflow

# List available templates
curl -k -H "Authorization: Bearer YOUR_API_KEY" \
  https://localhost:27124/ironflow/templates/
```

The `-k` flag is needed because the Local REST API uses a self-signed certificate by default.

## Project Structure

```
ironflow-obsidian/
├── src/                        # Source code
│   ├── main.ts                 # Plugin entry point
│   ├── types.ts                # Shared interfaces
│   ├── core/                   # Core business logic
│   │   ├── WorkflowManager.ts
│   │   ├── TaskManager.ts
│   │   ├── TemplateRegistry.ts
│   │   ├── CanvasWriter.ts
│   │   └── frontmatter.ts
│   ├── views/                  # UI components
│   │   ├── TaskPropertyPanel.ts
│   │   └── WorkflowCommandModal.ts
│   ├── api/                    # REST API routes
│   │   └── routes.ts
│   └── settings/               # Plugin settings
│       └── SettingsTab.ts
├── main.js                     # Compiled output (generated, do not edit)
├── manifest.json               # Plugin metadata
├── styles.css                  # Plugin styles
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── docs/                       # Design and planning documents
    ├── workflow-definitions-design.md
    └── workflow-definitions-implementation-plan.md
```

## Development Vault Setup

To test the full workflow feature, your development vault should have:

1. **A Templates folder** with at least one Templater template containing frontmatter fields. Example (`Templates/Sample Task.md`):

    ```markdown
    ---
    target-branch: ""
    provider: ""
    ---
    Task content here with optional Templater expressions.
    ```

2. **Templater configured** to use the Templates folder:
   - Settings → Templater → Template folder location → `Templates`

3. **Local REST API configured** with an API key for testing endpoints.

## Release

A release consists of three files attached to a GitHub release tag:

| File | Required | Notes |
|------|----------|-------|
| `main.js` | Yes | Compiled plugin (generated by `npm run build`) |
| `manifest.json` | Yes | Plugin metadata — version must match the Git tag |
| `styles.css` | Optional | Plugin styling |

The version in `manifest.json` must follow semver (`x.y.z`) and match the Git tag exactly.

To bump the version:

```bash
npm version patch  # or minor, or major
```

This runs the `version` script in `package.json`, which updates `manifest.json` and `versions.json` automatically.
