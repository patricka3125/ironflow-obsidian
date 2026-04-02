# REST API: GET Routes for Instance Tasks — Design

## 1. Overview

Add read-only REST API endpoints that expose task data for active workflow instances.
These routes extend the `obsidian-local-rest-api` plugin and are scoped to
**instance-level** task retrieval — listing tasks under a running instance and
fetching full task content by name.

**GitHub Issue:** #3 (scoped subset)

### Scope Note: OpenAPI Schema as Source of Truth

The OpenAPI 3.0.3 specification in Section 3 defines the canonical schema for all
request parameters, response bodies, and error shapes. To prevent drift between the
spec and the TypeScript implementation, the spec must be extracted to a standalone
YAML file and used to **generate** TypeScript types via
[openapi-typescript](https://openapi-ts.dev/). The generated types replace the
hand-written interfaces currently in `src/api/routes.ts` (`ErrorResponse`,
`InstanceTaskSummary`, `InstanceTaskDetail`). This ensures a single source of truth
and enables downstream consumers to build type-safe API clients via
[openapi-fetch](https://openapi-ts.dev/openapi-fetch/).

Phase 4 (below) covers this integration.

## 2. Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ironflow/workflows/:name/instances/:instance/tasks/` | List all tasks for an active workflow instance |
| `GET` | `/ironflow/workflows/:name/instances/:instance/tasks/:taskName` | Get a single task with full frontmatter and markdown body |

### URL Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `:name` | Workflow definition name | `review-cycle` |
| `:instance` | Instance ID (the directory name under `instances/`) | `run-a1b2` |
| `:taskName` | Task file basename (without `.md` extension) | `lint-code` |

## 3. OpenAPI Specification

```yaml
openapi: 3.0.3
info:
  title: Ironflow Instance Tasks API
  version: 0.1.0
  description: >
    Read-only endpoints for retrieving task data from active workflow instances
    managed by the ironflow-obsidian plugin. Served via obsidian-local-rest-api.

servers:
  - url: https://127.0.0.1:27124
    description: Local Obsidian REST API server

security:
  - bearerAuth: []

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      description: API key from obsidian-local-rest-api settings

  schemas:
    IronflowTaskFrontmatter:
      type: object
      description: >
        Full frontmatter of a task file. Includes both ironflow-managed fields
        and user-defined template fields.
      properties:
        ironflow-template:
          type: string
          description: Name of the Templater template this task was created from.
          example: code-review
        ironflow-workflow:
          type: string
          description: Name of the parent workflow definition.
          example: review-cycle
        ironflow-agent-profile:
          type: string
          description: Agent profile assigned to this task.
          example: developer
        ironflow-depends-on:
          type: array
          items:
            type: string
          description: Wikilinks to tasks that must complete before this one.
          example: ["[[setup-env]]"]
        ironflow-next-tasks:
          type: array
          items:
            type: string
          description: Wikilinks to tasks unblocked when this one completes.
          example: ["[[submit-pr]]"]
        ironflow-instance-id:
          type: string
          description: Instance ID this task belongs to.
          example: run-a1b2
        ironflow-status:
          type: string
          enum: [open, pending, in-progress, done]
          description: Current execution status of this task.
          example: open
      additionalProperties:
        description: User-defined template fields (any type).
      required:
        - ironflow-template
        - ironflow-workflow
        - ironflow-agent-profile
        - ironflow-depends-on
        - ironflow-next-tasks
        - ironflow-instance-id
        - ironflow-status

    InstanceTaskSummary:
      type: object
      description: A task within a workflow instance, with full frontmatter.
      properties:
        name:
          type: string
          description: Task name (file basename without extension).
          example: lint-code
        filePath:
          type: string
          description: Vault-relative path to the task file.
          example: Workflows/review-cycle/instances/run-a1b2/lint-code.md
        frontmatter:
          $ref: "#/components/schemas/IronflowTaskFrontmatter"
      required:
        - name
        - filePath
        - frontmatter

    InstanceTaskDetail:
      type: object
      description: >
        Full task data including frontmatter and the raw markdown body content.
      properties:
        name:
          type: string
          description: Task name (file basename without extension).
          example: lint-code
        filePath:
          type: string
          description: Vault-relative path to the task file.
          example: Workflows/review-cycle/instances/run-a1b2/lint-code.md
        frontmatter:
          $ref: "#/components/schemas/IronflowTaskFrontmatter"
        body:
          type: string
          description: >
            Markdown content of the task file with frontmatter stripped.
          example: "## Instructions\n\nRun the linter on all changed files..."
      required:
        - name
        - filePath
        - frontmatter
        - body

    ErrorResponse:
      type: object
      properties:
        error:
          type: string
          description: Human-readable error message.
          example: "Workflow \"foo\" not found."
      required:
        - error

paths:
  /ironflow/workflows/{name}/instances/{instance}/tasks/:
    get:
      summary: List all tasks in a workflow instance
      operationId: listInstanceTasks
      parameters:
        - name: name
          in: path
          required: true
          schema:
            type: string
          description: Workflow definition name.
        - name: instance
          in: path
          required: true
          schema:
            type: string
          description: Instance ID.
      responses:
        "200":
          description: Array of tasks with frontmatter.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/InstanceTaskSummary"
        "404":
          description: Workflow or instance not found.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "500":
          description: Internal error.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"

  /ironflow/workflows/{name}/instances/{instance}/tasks/{taskName}:
    get:
      summary: Get a single task with full content
      operationId: getInstanceTask
      parameters:
        - name: name
          in: path
          required: true
          schema:
            type: string
          description: Workflow definition name.
        - name: instance
          in: path
          required: true
          schema:
            type: string
          description: Instance ID.
        - name: taskName
          in: path
          required: true
          schema:
            type: string
          description: Task name (file basename without extension).
      responses:
        "200":
          description: Full task data with frontmatter and body.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/InstanceTaskDetail"
        "404":
          description: Workflow, instance, or task not found.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
        "500":
          description: Internal error.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ErrorResponse"
```

## 4. Example Responses

### List tasks

```
GET /ironflow/workflows/review-cycle/instances/run-a1b2/tasks/
```

```json
[
  {
    "name": "setup-env",
    "filePath": "Workflows/review-cycle/instances/run-a1b2/setup-env.md",
    "frontmatter": {
      "ironflow-template": "env-setup",
      "ironflow-workflow": "review-cycle",
      "ironflow-agent-profile": "infra",
      "ironflow-depends-on": [],
      "ironflow-next-tasks": ["[[lint-code]]"],
      "ironflow-instance-id": "run-a1b2",
      "ironflow-status": "done"
    }
  },
  {
    "name": "lint-code",
    "filePath": "Workflows/review-cycle/instances/run-a1b2/lint-code.md",
    "frontmatter": {
      "ironflow-template": "code-review",
      "ironflow-workflow": "review-cycle",
      "ironflow-agent-profile": "developer",
      "ironflow-depends-on": ["[[setup-env]]"],
      "ironflow-next-tasks": ["[[submit-pr]]"],
      "ironflow-instance-id": "run-a1b2",
      "ironflow-status": "open",
      "repo-url": "https://github.com/org/repo"
    }
  }
]
```

### Single task

```
GET /ironflow/workflows/review-cycle/instances/run-a1b2/tasks/lint-code
```

```json
{
  "name": "lint-code",
  "filePath": "Workflows/review-cycle/instances/run-a1b2/lint-code.md",
  "frontmatter": {
    "ironflow-template": "code-review",
    "ironflow-workflow": "review-cycle",
    "ironflow-agent-profile": "developer",
    "ironflow-depends-on": ["[[setup-env]]"],
    "ironflow-next-tasks": ["[[submit-pr]]"],
    "ironflow-instance-id": "run-a1b2",
    "ironflow-status": "open",
    "repo-url": "https://github.com/org/repo"
  },
  "body": "## Instructions\n\nRun the linter on all changed files and report any violations.\n\n## Acceptance Criteria\n\n- [ ] No lint errors\n- [ ] All warnings addressed or documented\n"
}
```

## 5. Error Responses

| Condition | Status | `error` message |
|-----------|--------|-----------------|
| Workflow folder doesn't exist | 404 | `Workflow "{name}" not found.` |
| Instance folder doesn't exist | 404 | `Instance "{instance}" not found for workflow "{name}".` |
| Task file doesn't exist | 404 | `Task "{taskName}" not found in instance "{instance}".` |
| Unexpected failure | 500 | Original error message |

## 6. Implementation

### 6.1 Core Layer — `InstanceManager` Read Methods

`InstanceManager` currently only supports creation. Add two read methods:

```typescript
async getInstanceTasks(
  workflowName: string,
  instanceId: string
): Promise<IronflowTask[]>
```

- Resolves the instance directory via `getInstancePath()`
- Returns `[]` → caller (route handler) converts to 404 when the folder itself doesn't exist
- Actually: throw or return null to distinguish "folder missing" from "folder exists but empty"
- Uses `listMarkdownFiles()` to enumerate `.md` files, then parses each with `parseFrontmatter()` + `buildIronflowTask()`

```typescript
async getInstanceTask(
  workflowName: string,
  instanceId: string,
  taskName: string
): Promise<{ task: IronflowTask; body: string } | null>
```

- Resolves via `getInstanceTaskPath()`
- Returns the parsed `IronflowTask` **plus** the stripped body (`stripFrontmatter()`)
- Returns `null` when the file doesn't exist

These methods reuse existing utilities with no new parsing logic.

### 6.2 API Layer — `src/api/routes.ts`

New file with a single export:

```typescript
export function registerRoutes(
  api: LocalRestApiPublicApi,
  instanceManager: InstanceManager,
  settings: IronflowSettings
): void
```

Registers both GET handlers. Each handler:
1. Extracts params from `request.params`
2. Calls the corresponding `InstanceManager` method
3. Maps the result to the response schema (JSON serialization of `InstanceTaskSummary[]` or `InstanceTaskDetail`)
4. Returns 404/500 with `ErrorResponse` on failure

### 6.3 Integration — `src/main.ts`

`tryRegisterRoutes()` calls `registerRoutes()` after the existing `/ironflow/status/` route, passing `this.api`, `this.instanceManager`, and `this.settings`.

No changes to unload — `api.unregister()` already removes all routes registered via `addRoute()`.

### 6.4 Mock Updates — `test/mocks/obsidian-local-rest-api.ts`

Expand the mock `addRoute()` to support capturing registered handlers with params, so route tests can invoke them with fake `request`/`response` objects.

## 7. Files Changed

| File | Change |
|------|--------|
| `src/core/InstanceManager.ts` | Add `getInstanceTasks()`, `getInstanceTask()` |
| `src/api/routes.ts` | **New** — `registerRoutes()` with two GET handlers |
| `src/main.ts` | Call `registerRoutes()` from `tryRegisterRoutes()` |
| `test/mocks/obsidian-local-rest-api.ts` | Expand mock to capture handlers and support params |
| `test/instance-read.test.ts` | **New** — tests for `getInstanceTasks`, `getInstanceTask` |
| `test/api-routes.test.ts` | **New** — tests for route handlers (status codes, shapes) |
| `src/api/openapi.yaml` | **New** — standalone OpenAPI 3.0.3 spec (source of truth) |
| `src/api/schema.d.ts` | **Generated** — TypeScript types from the OpenAPI spec |
| `package.json` | Add `openapi-typescript` dev dep and `generate:api-types` script |

## 8. Testing Strategy

### Core tests (`test/instance-read.test.ts`)

Using `FakeVault` with pre-populated instance task files:

- `getInstanceTasks` returns all tasks sorted by path
- `getInstanceTasks` returns empty / throws for nonexistent instance folder
- `getInstanceTask` returns task + body for existing file
- `getInstanceTask` returns null for missing file
- Frontmatter parsing preserves custom template fields

### Route tests (`test/api-routes.test.ts`)

Using mock request/response objects against registered handlers:

- 200 with correct JSON shape for valid list request
- 200 with body content for valid single-task request
- 404 with `ErrorResponse` for missing workflow / instance / task
- 500 with `ErrorResponse` when `InstanceManager` throws

## 9. Implementation Plan

### Phase 1: Core Layer — Instance Read Methods

**Goal:** Add read capabilities to `InstanceManager` so that instance task data can be retrieved programmatically. This phase produces the core building blocks that the API layer depends on.

**Phase Acceptance Criteria:**

- `InstanceManager` exposes `getInstanceTasks()` and `getInstanceTask()` public methods.
- Both methods compile cleanly (`npm run build` produces no new type errors).
- Existing tests continue to pass (`npm test`).

#### Task 1.1: Implement `getInstanceTasks()` on `InstanceManager`

**Description:**
Add a public async method `getInstanceTasks(workflowName: string, instanceId: string)` to `src/core/InstanceManager.ts`. The method resolves the instance directory path via `getInstancePath()`, verifies the folder exists using `app.vault.getFolderByPath()`, and enumerates all `.md` files with `listMarkdownFiles()`. Each file is read, parsed with `parseFrontmatter()`, and mapped to an `IronflowTask` via `buildIronflowTask()`. Results are sorted by file path for deterministic ordering.

When the workflow task folder does not exist, throw an error (`Workflow "{name}" not found.`). When the instance folder does not exist, throw an error (`Instance "{instance}" not found for workflow "{name}".`). An instance folder that exists but contains zero markdown files returns an empty array.

**Acceptance Criteria:**

- Method signature: `async getInstanceTasks(workflowName: string, instanceId: string): Promise<IronflowTask[]>`.
- Returns all `.md` files in the instance directory as `IronflowTask[]`, sorted by `filePath`.
- Throws with a descriptive message when the workflow folder does not exist.
- Throws with a descriptive message when the instance folder does not exist.
- Returns `[]` for an instance folder that exists but has no task files.
- Does not break any existing `InstanceManager` behavior.

#### Task 1.2: Implement `getInstanceTask()` on `InstanceManager`

**Description:**
Add a public async method `getInstanceTask(workflowName: string, instanceId: string, taskName: string)` to `src/core/InstanceManager.ts`. The method resolves the file path via `getInstanceTaskPath()`, reads the file content, and returns an object containing both the parsed `IronflowTask` (via `buildIronflowTask()` + `parseFrontmatter()`) and the markdown body (via `stripFrontmatter()`). Returns `null` when the file does not exist.

**Acceptance Criteria:**

- Method signature: `async getInstanceTask(workflowName: string, instanceId: string, taskName: string): Promise<{ task: IronflowTask; body: string } | null>`.
- Returns `{ task, body }` where `task` has fully parsed frontmatter (including custom fields) and `body` is the markdown content with frontmatter stripped.
- Returns `null` when the task file does not exist (no throw).
- Does not break any existing `InstanceManager` behavior.

---

### Phase 2: Core Tests, Route Handlers, and Test Infrastructure

**Depends on:** Phase 1 (read methods exist on `InstanceManager`).

**Goal:** Validate the core read methods with unit tests, create the route handler module, and prepare the test mock so route-level tests can be written in Phase 3. All three tasks are independent of each other.

**Phase Acceptance Criteria:**

- Core read methods have comprehensive unit test coverage.
- `src/api/routes.ts` exists with a `registerRoutes()` export that registers both GET endpoints.
- The `obsidian-local-rest-api` test mock supports capturing and invoking route handlers with params.
- `npm test` and `npm run build` pass.

#### Task 2.1: Write unit tests for core read methods

**Description:**
Create `test/instance-read.test.ts` following the existing test patterns in `test/instance-management.test.ts`. Use `FakeVault` to pre-populate an instance directory with task files containing frontmatter and body content. Test both `getInstanceTasks()` and `getInstanceTask()` against this seeded data. Reuse the existing `seedWorkflowDefinition()` pattern and `createInstanceManager()` helper from `instance-management.test.ts` (duplicate/adapt the helpers as needed since tests are self-contained).

**Acceptance Criteria:**

- Test file: `test/instance-read.test.ts`.
- Tests cover: `getInstanceTasks()` returns all tasks with correct frontmatter, sorted by path.
- Tests cover: `getInstanceTasks()` returns `[]` for an empty instance folder.
- Tests cover: `getInstanceTasks()` throws for a nonexistent workflow folder.
- Tests cover: `getInstanceTasks()` throws for a nonexistent instance folder.
- Tests cover: `getInstanceTask()` returns `{ task, body }` with correct frontmatter and stripped body.
- Tests cover: `getInstanceTask()` preserves custom (non-ironflow) frontmatter fields.
- Tests cover: `getInstanceTask()` returns `null` for a nonexistent task file.
- All new tests pass.

#### Task 2.2: Expand `obsidian-local-rest-api` test mock

**Description:**
Update `test/mocks/obsidian-local-rest-api.ts` so that `addRoute()` captures registered handlers keyed by path and HTTP method, and exposes a way for tests to invoke a handler with mock `request` and `response` objects. The mock `request` must support `params` (e.g., `{ name: "...", instance: "...", taskName: "..." }`). The mock `response` must support chained `.status(code).json(data)` calls and expose the recorded status code and JSON body for assertions. This enables route handler tests in Phase 3 without needing a real HTTP server.

**Acceptance Criteria:**

- `addRoute(path)` returns an object with `.get(handler)` (and extensible to `.post()`, etc. later).
- Handlers registered via `.get()` are stored and retrievable by path.
- A test utility function or method allows invoking a stored handler with a mock `{ params }` request and a mock response.
- The mock response captures the status code and JSON body for assertion.
- Existing tests that import from this mock continue to pass without changes.

#### Task 2.3: Create `src/api/routes.ts` with route handlers

**Description:**
Create a new file `src/api/routes.ts` exporting a `registerRoutes()` function. This function takes the REST API object, the `InstanceManager`, and `IronflowSettings`, then registers two GET routes:

1. `GET /ironflow/workflows/:name/instances/:instance/tasks/` — Calls `instanceManager.getInstanceTasks()`, maps each `IronflowTask` to the `InstanceTaskSummary` shape (`{ name, filePath, frontmatter }`), and responds with a JSON array. Catches errors and returns 404 or 500 as appropriate.

2. `GET /ironflow/workflows/:name/instances/:instance/tasks/:taskName` — Calls `instanceManager.getInstanceTask()`, maps the result to the `InstanceTaskDetail` shape (`{ name, filePath, frontmatter, body }`), and responds with JSON. Returns 404 if the result is `null`. Catches errors and returns 500.

Error classification: errors whose message matches the 404 patterns from Section 5 (`"not found"`) produce a 404 response. All other errors produce 500.

**Acceptance Criteria:**

- File: `src/api/routes.ts`.
- Exports: `registerRoutes(api: LocalRestApiPublicApi, instanceManager: InstanceManager, settings: IronflowSettings): void`.
- Route 1 registers at `/ironflow/workflows/:name/instances/:instance/tasks/` and responds with `InstanceTaskSummary[]`.
- Route 2 registers at `/ironflow/workflows/:name/instances/:instance/tasks/:taskName` and responds with `InstanceTaskDetail`.
- 404 responses use the `ErrorResponse` shape (`{ error: "..." }`) with messages matching Section 5.
- 500 responses use the `ErrorResponse` shape with the original error message.
- No side effects on import — route registration only occurs when `registerRoutes()` is called.
- Compiles cleanly with `npm run build`.

---

### Phase 3: Integration, Route Tests, and Verification

**Depends on:** Phase 2 (routes module exists, mock supports handler invocation, core tests pass).

**Goal:** Wire the route handlers into the plugin lifecycle, validate the HTTP layer with tests, and confirm the entire project builds and passes all tests.

**Phase Acceptance Criteria:**

- Routes are registered when the plugin loads and `obsidian-local-rest-api` is present.
- Route handler tests validate correct JSON shapes, status codes, and error handling.
- `npm run build` succeeds with no type errors.
- `npm test` passes with all new and existing tests green.

#### Task 3.1: Wire `registerRoutes()` into `main.ts`

**Description:**
Update `tryRegisterRoutes()` in `src/main.ts` to call `registerRoutes(this.api, this.instanceManager, this.settings)` after the existing `/ironflow/status/` route registration. Import `registerRoutes` from `./api/routes`. No changes to `onunload` are needed since `api.unregister()` already removes all routes added via `addRoute()`.

Verify that `this.instanceManager` is initialized before `tryRegisterRoutes()` is called — confirm this is already the case from the existing `onload()` ordering.

**Acceptance Criteria:**

- `src/main.ts` imports `registerRoutes` from `./api/routes`.
- `tryRegisterRoutes()` calls `registerRoutes()` with the API object, instance manager, and settings.
- The call occurs after the existing `/ironflow/status/` registration.
- `registerRoutes()` is only called when `obsidian-local-rest-api` is enabled (existing guard unchanged).
- No changes to plugin unload behavior.

#### Task 3.2: Write route handler tests

**Description:**
Create `test/api-routes.test.ts` that tests the registered route handlers end-to-end using the expanded mock from Task 2.2. Seed a `FakeVault` with instance data, construct an `InstanceManager`, call `registerRoutes()` with the mock API, then invoke handlers via the mock with various params.

**Acceptance Criteria:**

- Test file: `test/api-routes.test.ts`.
- Tests cover: list endpoint returns 200 with a JSON array matching `InstanceTaskSummary[]` schema (each element has `name`, `filePath`, `frontmatter` with all required keys).
- Tests cover: list endpoint returns 200 with `[]` for an instance with no tasks.
- Tests cover: list endpoint returns 404 with `ErrorResponse` for nonexistent workflow.
- Tests cover: list endpoint returns 404 with `ErrorResponse` for nonexistent instance.
- Tests cover: single-task endpoint returns 200 with JSON matching `InstanceTaskDetail` schema (`name`, `filePath`, `frontmatter`, `body`).
- Tests cover: single-task endpoint returns 200 with `body` containing the expected markdown content (frontmatter stripped).
- Tests cover: single-task endpoint returns 404 with `ErrorResponse` for nonexistent task.
- Tests cover: both endpoints return 500 with `ErrorResponse` when an unexpected error occurs.
- All tests pass.

#### Task 3.3: Full build and test verification

**Description:**
Run `npm run build` and `npm test` to confirm the entire project compiles and all tests (existing + new) pass. This is a validation step, not a code change. If either command fails, resolve the issues before considering this phase complete.

**Acceptance Criteria:**

- `npm run build` exits with code 0 and produces no new TypeScript errors.
- `npm test` exits with code 0 and all test suites pass.
- No regressions in existing test suites.

---

### Phase 4: OpenAPI Schema Integration via openapi-typescript

**Depends on:** Phase 3 (routes, tests, and build all passing).

**Goal:** Make the OpenAPI 3.0.3 specification the single source of truth for API
types. Extract the spec to a standalone YAML file, generate TypeScript types from it
using `openapi-typescript`, and refactor the route handlers to use the generated
types instead of the hand-written interfaces. This eliminates spec-to-code drift and
enables downstream consumers to build type-safe API clients via `openapi-fetch`.

**Background — openapi-typescript workflow:**

The [openapi-ts](https://openapi-ts.dev/) ecosystem provides:

- **`openapi-typescript`** — CLI/library that reads an OpenAPI 3.0/3.1 YAML or JSON
  spec and emits a `.d.ts` file containing zero-runtime TypeScript types for all
  `paths`, `components.schemas`, `operations`, parameters, and responses.
- **`openapi-fetch`** — A 6 KB type-safe fetch wrapper that consumes the generated
  `paths` type. API consumers call `client.GET("/ironflow/...")` and get full
  autocomplete and compile-time checking of URL params, query params, request bodies,
  and response shapes — with no manual generics.

The workflow is:

```
openapi.yaml  ──(npx openapi-typescript)──▶  schema.d.ts  ──(import)──▶  routes.ts / client code
```

**Phase Acceptance Criteria:**

- A standalone `src/api/openapi.yaml` file contains the full OpenAPI 3.0.3 spec.
- `openapi-typescript` is a dev dependency and an `npm run generate:api-types` script
  produces `src/api/schema.d.ts`.
- The hand-written interfaces in `src/api/routes.ts` (`ErrorResponse`,
  `InstanceTaskSummary`, `InstanceTaskDetail`) are removed and replaced with imports
  from the generated `schema.d.ts`.
- Route handler behavior is unchanged — all existing tests pass.
- `npm run build` and `npm test` pass.

#### Task 4.1: Extract OpenAPI spec to standalone YAML file

**Description:**
Move the OpenAPI 3.0.3 specification currently embedded in Section 3 of this design
doc into a standalone file at `src/api/openapi.yaml`. The YAML content is identical
to Section 3 with no modifications. This file becomes the canonical, machine-readable
API contract.

**Acceptance Criteria:**

- File: `src/api/openapi.yaml`.
- Content matches the OpenAPI spec from Section 3 of this document exactly.
- The file is valid OpenAPI 3.0.3 (parseable by standard tools).

#### Task 4.2: Add `openapi-typescript` and type generation script

**Description:**
Install `openapi-typescript` as a dev dependency. Add an npm script
`generate:api-types` to `package.json` that runs:

```bash
npx openapi-typescript src/api/openapi.yaml -o src/api/schema.d.ts
```

This generates a `schema.d.ts` file exporting `paths` (keyed by endpoint path and
HTTP method, containing parameter/response types) and `components` (containing the
`schemas` namespace with `IronflowTaskFrontmatter`, `InstanceTaskSummary`,
`InstanceTaskDetail`, and `ErrorResponse`).

Add `src/api/schema.d.ts` to `.gitignore` since it is a generated artifact, or
alternatively commit it and add a `--check` CI step to verify it stays in sync.
Document the chosen approach in `DEVELOPMENT.md`.

**Acceptance Criteria:**

- `openapi-typescript` is listed in `devDependencies` in `package.json`.
- `npm run generate:api-types` produces `src/api/schema.d.ts` without errors.
- The generated file exports `paths` and `components` types derived from the spec.
- `components["schemas"]["InstanceTaskSummary"]`, `components["schemas"]["InstanceTaskDetail"]`,
  `components["schemas"]["ErrorResponse"]`, and
  `components["schemas"]["IronflowTaskFrontmatter"]` are all present in the generated
  output.
- The project's approach to generated-file handling (gitignored vs committed + CI
  check) is documented.

#### Task 4.3: Refactor `src/api/routes.ts` to use generated types

**Description:**
Remove the hand-written `ErrorResponse`, `InstanceTaskSummary`, and
`InstanceTaskDetail` interfaces from `src/api/routes.ts`. Replace them with type
aliases or direct imports from the generated `src/api/schema.d.ts`:

```typescript
import type { components } from "./schema";

type ErrorResponse = components["schemas"]["ErrorResponse"];
type InstanceTaskSummary = components["schemas"]["InstanceTaskSummary"];
type InstanceTaskDetail = components["schemas"]["InstanceTaskDetail"];
```

Update `sendJson()` and the mapper functions to use these types. The runtime behavior
of all route handlers must remain identical — this is a types-only refactor.

**Acceptance Criteria:**

- No hand-written API response interfaces remain in `src/api/routes.ts`.
- All response types are derived from the generated schema.
- `sendJson()`, `toInstanceTaskSummary()`, and `toInstanceTaskDetail()` compile
  against the generated types without `as` casts or `any`.
- All existing tests in `test/api-routes.test.ts` and `test/instance-read.test.ts`
  continue to pass without modification.
- `npm run build` succeeds with no new type errors.

#### Task 4.4: Build, test, and sync verification

**Description:**
Run the full verification suite to confirm the refactor is correct and the generated
types stay in sync with the spec:

1. `npm run generate:api-types` — regenerate types from the spec.
2. `npm run build` — confirm the project compiles against the generated types.
3. `npm test` — confirm all tests pass.
4. Modify a field name in `src/api/openapi.yaml`, regenerate, and verify that
   `npm run build` produces a type error in `routes.ts` — confirming the spec is
   truly the source of truth. Revert the modification.

**Acceptance Criteria:**

- `npm run generate:api-types` exits with code 0.
- `npm run build` exits with code 0.
- `npm test` exits with code 0 and all test suites pass.
- A deliberate spec change causes a compile error, proving type safety.
- No regressions in existing test suites.
