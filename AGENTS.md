# AGENTS.md

## Purpose

This repository contains the `ironflow-obsidian` plugin: an Obsidian plugin for defining and managing workflow/task graphs inside a vault.

## Project Structure

```text
ironflow-obsidian/
├── .claude/                 # Local assistant/project metadata
├── docs/                    # Design notes, implementation plans, and supporting docs
├── node_modules/            # Installed dependencies; generated, do not edit
├── src/                     # TypeScript source for the plugin
│   ├── api/                 # API-related source; currently reserved/minimal
│   ├── core/                # Core workflow, task, canvas, and frontmatter logic
│   ├── settings/            # Obsidian settings UI and settings-related code
│   ├── views/               # Modal and panel UI for plugin interactions
│   ├── main.ts              # Plugin entry point
│   └── types.ts             # Shared project types/interfaces
├── test/                    # Vitest unit tests and test-only utilities
│   └── mocks/               # Obsidian and vault mocks used by tests
├── DEVELOPMENT.md           # Developer workflow and local setup guide
├── README.md                # User-facing overview, setup, and usage
├── esbuild.config.mjs       # Bundling/watch configuration
├── main.js                  # Generated plugin bundle; do not edit directly
├── manifest.json            # Obsidian plugin manifest
├── package.json             # Project metadata and npm scripts
├── styles.css               # Plugin styles
├── tsconfig.json            # Main TypeScript configuration
├── tsconfig.test.json       # TypeScript config used for test type-checking
├── version-bump.mjs         # Release/version helper script
├── versions.json            # Obsidian compatibility/version metadata
└── vitest.config.ts         # Vitest config and test-time module aliasing
```

## Development Instructions

- Use Node.js 18+.
- Install dependencies with `npm install`.
- Run `npm run dev` for watch mode; this rebuilds `src/main.ts` into `main.js`.
- Run `npm run build` before shipping changes; it performs a TypeScript check and production bundle.
- Run `npm test` before finalizing changes; it type-checks against `tsconfig.test.json` and runs Vitest.
- Do not hand-edit `main.js`; it is generated output.
- For manual plugin testing, symlink this repo into an Obsidian vault under `.obsidian/plugins/ironflow-obsidian` and reload the plugin after rebuilding.
- If you change `manifest.json`, restart Obsidian rather than relying on hot reload.

## Development Conventions

- Keep business logic in [`src/core`](./src/core) and keep view-layer code in [`src/views`](./src/views).
- Prefer extending existing utilities such as frontmatter, task, vault, and workflow helpers instead of duplicating parsing or path logic.
- Treat Obsidian APIs and plugin integrations as boundaries; isolate them so core logic remains testable.
- Preserve generated/user-authored workflow content carefully, especially frontmatter, canvas edges, and task markdown bodies.

## Unit Test Guidelines

- Put unit tests in `test/*.test.ts`.
- Follow the current Vitest style: `describe`/`it` with explicit behavior-focused test names.
- Use the existing mocks from [`test/mocks`](./test/mocks) instead of importing real Obsidian runtime modules in tests.
- Rely on the Vitest aliases in `vitest.config.ts`; imports of `obsidian` and `obsidian-local-rest-api` are already redirected to test mocks.
- Use `FakeVault` for filesystem-style workflow/task tests rather than touching the real vault or local filesystem.
- Prefer focused tests around `src/core` behavior: frontmatter parsing, task/workflow mutations, path handling, and canvas edge synchronization.
- When adding behavior that mutates markdown/frontmatter, test both the parsed data and the preserved body content.
- When adding workflow graph behavior, cover idempotence and preservation of user-managed data where applicable.
- Keep tests deterministic and synchronous where possible; only use async when the production API requires it.
