import { describe, expect, it } from "vitest";

import { registerRoutes } from "../src/api/routes";
import type { InstanceManager } from "../src/core/InstanceManager";
import type { IronflowTask } from "../src/types";
import {
	getAPI,
	type MockRouteRequest,
} from "./mocks/obsidian-local-rest-api";

describe("API routes", () => {
	it("returns task summaries for an instance task list request", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTasks(): Promise<IronflowTask[]> {
				return [
					createTask("Develop Phase 1", {
						"ironflow-template": "Development Execution",
						"ironflow-workflow": "alpha",
						"ironflow-agent-profile": "developer",
						"ironflow-depends-on": [],
						"ironflow-next-tasks": ["[[Review Phase 1]]"],
						"ironflow-instance-id": "run-a1b2",
						"ironflow-status": "open",
						references: "src/main.ts",
					}),
				];
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/",
			"get",
			createRequest({ name: "alpha", instance: "run-a1b2" })
		);

		expect(response.statusCode).toBe(200);
		expect(response.jsonBody).toEqual([
			{
				name: "Develop Phase 1",
				filePath: "Workflows/alpha/instances/run-a1b2/Develop Phase 1.md",
				frontmatter: {
					"ironflow-template": "Development Execution",
					"ironflow-workflow": "alpha",
					"ironflow-agent-profile": "developer",
					"ironflow-depends-on": [],
					"ironflow-next-tasks": ["[[Review Phase 1]]"],
					"ironflow-instance-id": "run-a1b2",
					"ironflow-status": "open",
					references: "src/main.ts",
				},
			},
		]);
	});

	it("returns an empty array for a list request when the instance has no tasks", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTasks(): Promise<IronflowTask[]> {
				return [];
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/",
			"get",
			createRequest({ name: "alpha", instance: "run-empty" })
		);

		expect(response.statusCode).toBe(200);
		expect(response.jsonBody).toEqual([]);
	});

	it("returns task detail for a single task request", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTask() {
				return {
					task: createTask("Lint Code", {
						"ironflow-template": "Development Execution",
						"ironflow-workflow": "alpha",
						"ironflow-agent-profile": "developer",
						"ironflow-depends-on": [],
						"ironflow-next-tasks": ["[[Review Phase 1]]"],
						"ironflow-instance-id": "run-a1b2",
						"ironflow-status": "in-progress",
						priority: "high",
					}),
					body: "## Instructions\n\nRun the linter.\n",
				};
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/:taskName",
			"get",
			createRequest({
				name: "alpha",
				instance: "run-a1b2",
				taskName: "Lint Code",
			})
		);

		expect(response.statusCode).toBe(200);
		expect(response.jsonBody).toEqual({
			name: "Lint Code",
			filePath: "Workflows/alpha/instances/run-a1b2/Lint Code.md",
			frontmatter: {
				"ironflow-template": "Development Execution",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "developer",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": ["[[Review Phase 1]]"],
				"ironflow-instance-id": "run-a1b2",
				"ironflow-status": "in-progress",
				priority: "high",
			},
			body: "## Instructions\n\nRun the linter.\n",
		});
	});

	it("returns a 404 for list requests when the workflow is missing", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTasks(): Promise<IronflowTask[]> {
				throw new Error('Workflow "missing" not found.');
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/",
			"get",
			createRequest({ name: "missing", instance: "run-a1b2" })
		);

		expect(response.statusCode).toBe(404);
		expect(response.jsonBody).toEqual({
			error: 'Workflow "missing" not found.',
		});
	});

	it("returns a 404 for list requests when the instance is missing", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTasks(): Promise<IronflowTask[]> {
				throw new Error('Instance "missing-run" not found for workflow "alpha".');
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/",
			"get",
			createRequest({ name: "alpha", instance: "missing-run" })
		);

		expect(response.statusCode).toBe(404);
		expect(response.jsonBody).toEqual({
			error: 'Instance "missing-run" not found for workflow "alpha".',
		});
	});

	it("returns a 404 for detail requests when the task is missing", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTask() {
				return null;
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/:taskName",
			"get",
			createRequest({
				name: "alpha",
				instance: "run-a1b2",
				taskName: "missing-task",
			})
		);

		expect(response.statusCode).toBe(404);
		expect(response.jsonBody).toEqual({
			error: 'Task "missing-task" not found in instance "run-a1b2".',
		});
	});

	it("returns a 404 for detail requests when the manager throws a not found error", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTask() {
				throw new Error('Instance "missing-run" not found for workflow "alpha".');
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/:taskName",
			"get",
			createRequest({
				name: "alpha",
				instance: "missing-run",
				taskName: "task-a",
			})
		);

		expect(response.statusCode).toBe(404);
		expect(response.jsonBody).toEqual({
			error: 'Instance "missing-run" not found for workflow "alpha".',
		});
	});

	it("returns a 500 for unexpected handler failures", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTasks(): Promise<IronflowTask[]> {
				throw new Error("Vault read failed.");
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/",
			"get",
			createRequest({ name: "alpha", instance: "run-a1b2" })
		);

		expect(response.statusCode).toBe(500);
		expect(response.jsonBody).toEqual({
			error: "Vault read failed.",
		});
	});

	it("returns a 500 for unexpected single-task handler failures", async () => {
		const api = getAPI();
		const instanceManager = createInstanceManagerStub({
			async getInstanceTask() {
				throw new Error("Task body parse failed.");
			},
		});

		registerRoutes(
			api as unknown as Parameters<typeof registerRoutes>[0],
			instanceManager
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/:taskName",
			"get",
			createRequest({
				name: "alpha",
				instance: "run-a1b2",
				taskName: "Lint Code",
			})
		);

		expect(response.statusCode).toBe(500);
		expect(response.jsonBody).toEqual({
			error: "Task body parse failed.",
		});
	});
});

function createRequest(params: Record<string, string>): Partial<MockRouteRequest> {
	return { params };
}

function createInstanceManagerStub(
	methods: Partial<Pick<InstanceManager, "getInstanceTasks" | "getInstanceTask">>
): InstanceManager {
	return {
		async getInstanceTasks(): Promise<IronflowTask[]> {
			return [];
		},
		async getInstanceTask() {
			return null;
		},
		...methods,
	} as InstanceManager;
}

function createTask(
	name: string,
	frontmatter: IronflowTask["frontmatter"]
): IronflowTask {
	return {
		name,
		filePath: `Workflows/alpha/instances/run-a1b2/${name}.md`,
		frontmatter,
		canvasNodeId: null,
	};
}
