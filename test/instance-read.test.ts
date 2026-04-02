import { describe, expect, it } from "vitest";

import { CanvasWriter } from "../src/core/CanvasWriter";
import { InstanceManager } from "../src/core/InstanceManager";
import { TaskManager } from "../src/core/TaskManager";
import { WorkflowManager } from "../src/core/WorkflowManager";
import { updateFrontmatter } from "../src/core/frontmatter";
import type { IronflowSettings } from "../src/types";
import { FakeVault } from "./mocks/fakeVault";

describe("Instance read methods", () => {
	it("returns instance tasks sorted by file path with parsed frontmatter", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedInstanceTask(app.vault, "alpha", "run-a1b2", "Review Phase 1", {
			"ironflow-template": "Review Execution",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "reviewer",
			"ironflow-depends-on": ["[[Develop Phase 1]]"],
			"ironflow-next-tasks": [],
			"ironflow-instance-id": "run-a1b2",
			"ironflow-status": "pending",
			references: "src/main.ts",
		}, "## Review\n\nInspect the implementation.\n");
		seedInstanceTask(app.vault, "alpha", "run-a1b2", "Develop Phase 1", {
			"ironflow-template": "Development Execution",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "developer",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": ["[[Review Phase 1]]"],
			"ironflow-instance-id": "run-a1b2",
			"ironflow-status": "open",
			"plan-path": "Projects/alpha/plan.md",
			references: "src/main.ts",
		}, "## Develop\n\nShip the feature.\n");

		const instanceManager = createInstanceManager(app, settings);

		const tasks = await instanceManager.getInstanceTasks("alpha", "run-a1b2");

		expect(tasks.map((task) => task.filePath)).toEqual([
			"Workflows/alpha/instances/run-a1b2/Develop Phase 1.md",
			"Workflows/alpha/instances/run-a1b2/Review Phase 1.md",
		]);
		expect(tasks).toEqual([
			{
				name: "Develop Phase 1",
				filePath: "Workflows/alpha/instances/run-a1b2/Develop Phase 1.md",
				canvasNodeId: null,
				frontmatter: {
					"ironflow-template": "Development Execution",
					"ironflow-workflow": "alpha",
					"ironflow-agent-profile": "developer",
					"ironflow-depends-on": [],
					"ironflow-next-tasks": ["[[Review Phase 1]]"],
					"ironflow-instance-id": "run-a1b2",
					"ironflow-status": "open",
					"plan-path": "Projects/alpha/plan.md",
					references: "src/main.ts",
				},
			},
			{
				name: "Review Phase 1",
				filePath: "Workflows/alpha/instances/run-a1b2/Review Phase 1.md",
				canvasNodeId: null,
				frontmatter: {
					"ironflow-template": "Review Execution",
					"ironflow-workflow": "alpha",
					"ironflow-agent-profile": "reviewer",
					"ironflow-depends-on": ["[[Develop Phase 1]]"],
					"ironflow-next-tasks": [],
					"ironflow-instance-id": "run-a1b2",
					"ironflow-status": "pending",
					references: "src/main.ts",
				},
			},
		]);
	});

	it("returns an empty array for an existing instance folder with no task files", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		app.vault.ensureFolder("Workflows/alpha/instances/empty-run");

		const instanceManager = createInstanceManager(app, settings);

		await expect(
			instanceManager.getInstanceTasks("alpha", "empty-run")
		).resolves.toEqual([]);
	});

	it("throws when the workflow folder does not exist", async () => {
		const app = createFakeApp();
		const instanceManager = createInstanceManager(app, createSettings());

		await expect(
			instanceManager.getInstanceTasks("missing", "run-a1b2")
		).rejects.toThrow('Workflow "missing" not found.');
	});

	it("throws when the instance folder does not exist", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		const instanceManager = createInstanceManager(app, settings);

		await expect(
			instanceManager.getInstanceTasks("alpha", "missing-run")
		).rejects.toThrow('Instance "missing-run" not found for workflow "alpha".');
	});

	it("returns a single task with stripped body and preserved custom fields", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		const taskBody = "## Instructions\n\nRun the linter on all changed files.\n";
		seedInstanceTask(app.vault, "alpha", "run-a1b2", "Lint Code", {
			"ironflow-template": "Development Execution",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "developer",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": ["[[Review Phase 1]]"],
			"ironflow-instance-id": "run-a1b2",
			"ironflow-status": "in-progress",
			"plan-path": "Projects/alpha/plan.md",
			references: "src/main.ts, src/core/InstanceManager.ts",
			priority: "high",
			estimate: 3,
			reviewers: ["alice", "bob"],
		}, taskBody);

		const instanceManager = createInstanceManager(app, settings);

		const result = await instanceManager.getInstanceTask(
			"alpha",
			"run-a1b2",
			"Lint Code"
		);

		expect(result).toEqual({
			task: {
				name: "Lint Code",
				filePath: "Workflows/alpha/instances/run-a1b2/Lint Code.md",
				canvasNodeId: null,
				frontmatter: {
					"ironflow-template": "Development Execution",
					"ironflow-workflow": "alpha",
					"ironflow-agent-profile": "developer",
					"ironflow-depends-on": [],
					"ironflow-next-tasks": ["[[Review Phase 1]]"],
					"ironflow-instance-id": "run-a1b2",
					"ironflow-status": "in-progress",
					"plan-path": "Projects/alpha/plan.md",
					references: "src/main.ts, src/core/InstanceManager.ts",
					priority: "high",
					estimate: 3,
					reviewers: ["alice", "bob"],
				},
			},
			body: taskBody,
		});
	});

	it("returns null when the task file does not exist", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		app.vault.ensureFolder("Workflows/alpha/instances/run-a1b2");

		const instanceManager = createInstanceManager(app, settings);

		await expect(
			instanceManager.getInstanceTask("alpha", "run-a1b2", "missing-task")
		).resolves.toBeNull();
	});

	it("throws when the workflow folder does not exist for a single task request", async () => {
		const app = createFakeApp();
		const instanceManager = createInstanceManager(app, createSettings());

		await expect(
			instanceManager.getInstanceTask("missing", "run-a1b2", "some-task")
		).rejects.toThrow('Workflow "missing" not found.');
	});

	it("throws when the instance folder does not exist for a single task request", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		const instanceManager = createInstanceManager(app, settings);

		await expect(
			instanceManager.getInstanceTask("alpha", "missing-run", "some-task")
		).rejects.toThrow('Instance "missing-run" not found for workflow "alpha".');
	});
});

function createFakeApp(): { vault: FakeVault } {
	return {
		vault: new FakeVault(),
	};
}

function createSettings(): IronflowSettings {
	return {
		workflowFolder: "Workflows",
		templateFolder: "Templates",
	};
}

function createInstanceManager(
	app: { vault: FakeVault },
	settings: IronflowSettings
): InstanceManager {
	const taskManager = new TaskManager(
		app as never,
		createTemplateRegistryStub() as never,
		settings
	);
	const canvasWriter = new CanvasWriter(app as never, settings);
	const workflowManager = new WorkflowManager(
		app as never,
		taskManager,
		canvasWriter,
		settings
	);

	return new InstanceManager(
		app as never,
		workflowManager,
		createTemplateRegistryStub() as never,
		settings
	);
}

function createTemplateRegistryStub(): { getTemplate(): null } {
	return {
		getTemplate(): null {
			return null;
		},
	};
}

function seedWorkflowDefinition(vault: FakeVault, workflowName: string): void {
	vault.writeFile(
		`Workflows/${workflowName}.canvas`,
		`${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`
	);
	vault.writeFile(
		`Workflows/${workflowName}/Develop Phase 1.md`,
		updateFrontmatter("", {
			"ironflow-template": "Development Execution",
			"ironflow-workflow": workflowName,
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": ["[[Review Phase 1]]"],
			"plan-path": "",
			references: "",
		})
	);
}

function seedInstanceTask(
	vault: FakeVault,
	workflowName: string,
	instanceId: string,
	taskName: string,
	frontmatter: Record<string, unknown>,
	body: string
): void {
	vault.writeFile(
		`Workflows/${workflowName}/instances/${instanceId}/${taskName}.md`,
		`${updateFrontmatter("", frontmatter)}${body}`
	);
}
