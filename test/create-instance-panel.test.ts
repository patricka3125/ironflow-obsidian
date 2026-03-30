import { beforeEach, describe, expect, it } from "vitest";

import { App, Notice, WorkspaceLeaf } from "obsidian";

import type { WorkflowInstance } from "../src/types";
import { CreateInstancePanel } from "../src/views/CreateInstancePanel";
import {
	createFakeFile,
	FakeMetadataCache,
	FakeVault,
	type FakeFile,
} from "./mocks/fakeVault";

describe("CreateInstancePanel", () => {
	beforeEach(() => {
		(Notice as unknown as { reset(): void }).reset();
	});

	it("renders the empty state on open", async () => {
		const panel = createPanel();

		await panel.onOpen();

		expect(panel.containerEl.textContent).toContain(
			"Click the play button on a workflow canvas to start."
		);
		expect(
			(
				panel.containerEl.children[0] as unknown as
					| { classes: Set<string> }
					| undefined
			)?.classes.has("ironflow-empty-state")
		).toBe(true);
	});

	it("shows a notice and keeps the empty state when workflowManager is unavailable", async () => {
		const panel = createPanel({
			workflowManager: null,
		});

		await panel.loadWorkflow("alpha");

		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			"Workflow manager is unavailable."
		);
		expect(panel.containerEl.textContent).toContain(
			"Click the play button on a workflow canvas to start."
		);
	});

	it("shows a notice and keeps the empty state when the workflow does not exist", async () => {
		const panel = createPanel({
			workflowManager: {
				async getWorkflow(): Promise<null> {
					return null;
				},
			},
		});

		await panel.loadWorkflow("missing");

		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			'Workflow "missing" not found.'
		);
		expect(panel.containerEl.textContent).toContain(
			"Click the play button on a workflow canvas to start."
		);
	});

	it("loads a workflow and renders the create-instance form", async () => {
		const workflow = createWorkflow();
		const panel = createPanel({
			workflowManager: {
				async getWorkflow(): Promise<typeof workflow> {
					return workflow;
				},
			},
		});

		await panel.loadWorkflow("alpha");

		expect(panel.containerEl.textContent).toContain("alpha");
		expect(panel.containerEl.textContent).toContain("Workflow");
		expect(panel.containerEl.textContent).toContain("Instance name");
		expect(panel.containerEl.textContent).toContain("Create Instance");
		expect((panel as any).instanceNameInput.inputEl.attributes.placeholder).toBe(
			"run-xxxx (auto-generated)"
		);
	});

	it("creates an instance, shows notices, opens the folder note, and resets", async () => {
		const app = createFakeApp();
		const workflow = createWorkflow();
		const createInstanceCalls: unknown[][] = [];
		const folderNote = createFakeFile(
			"Workflows/alpha/instances/sprint-1/sprint-1.md"
		);
		const createInstanceDeferred = createDeferred<WorkflowInstance>();
		const panel = createPanel(
			{
				app,
				workflowManager: {
					async getWorkflow(): Promise<typeof workflow> {
						return workflow;
					},
				},
				instanceManager: {
					async createInstance(...args: unknown[]): Promise<WorkflowInstance> {
						createInstanceCalls.push(args);
						return createInstanceDeferred.promise;
					},
					async createInstanceFolderNote(fileInstance: WorkflowInstance): Promise<FakeFile> {
						expect(fileInstance.instanceId).toBe("sprint-1");
						return folderNote;
					},
				},
			}
		);

		await panel.loadWorkflow("alpha");
		(panel as any).instanceNameInput.triggerChange("sprint-1");
		(panel as any).createButton.click();

		expect((panel as any).createButton.disabled).toBe(true);

		createInstanceDeferred.resolve({
			instanceId: "sprint-1",
			workflowName: "alpha",
			instancePath: "Workflows/alpha/instances/sprint-1",
			tasks: [],
		});
		await flushAsyncWork();

		expect(createInstanceCalls).toEqual([
			[
				"alpha",
				{
					"Task A": {
						"plan-path": "docs/plan.md",
						references: "src/main.ts",
					},
					"Task B": {
						phase: "1",
					},
				},
				"sprint-1",
			],
		]);
		expect((Notice as unknown as { notices: string[] }).notices).toEqual(
			expect.arrayContaining([
				"Instance 'sprint-1' created for alpha",
				"Install the Dataview plugin for a live task table in the instance base note.",
			])
		);
		expect(app.workspace.activeFile?.path).toBe(folderNote.path);
		expect(panel.containerEl.textContent).toContain(
			"Click the play button on a workflow canvas to start."
		);
	});

	it("passes undefined as the instance name when the field is blank", async () => {
		const app = createFakeApp();
		app.plugins.enabledPlugins.add("dataview");
		const workflow = createWorkflow();
		const createInstanceCalls: unknown[][] = [];
		const panel = createPanel(
			{
				app,
				workflowManager: {
					async getWorkflow(): Promise<typeof workflow> {
						return workflow;
					},
				},
				instanceManager: {
					async createInstance(...args: unknown[]): Promise<WorkflowInstance> {
						createInstanceCalls.push(args);
						return {
							instanceId: "run-a3f8",
							workflowName: "alpha",
							instancePath: "Workflows/alpha/instances/run-a3f8",
							tasks: [],
						};
					},
					async createInstanceFolderNote(): Promise<FakeFile> {
						return createFakeFile(
							"Workflows/alpha/instances/run-a3f8/run-a3f8.md"
						);
					},
				},
			}
		);

		await panel.loadWorkflow("alpha");
		(panel as any).createButton.click();
		await flushAsyncWork();

		expect(createInstanceCalls[0]?.[2]).toBeUndefined();
		expect((Notice as unknown as { notices: string[] }).notices).not.toContain(
			"Install the Dataview plugin for a live task table in the instance base note."
		);
	});

	it("shows an error notice, re-enables the button, and keeps the form on failure", async () => {
		const workflow = createWorkflow();
		const panel = createPanel({
			workflowManager: {
				async getWorkflow(): Promise<typeof workflow> {
					return workflow;
				},
			},
			instanceManager: {
				async createInstance(): Promise<WorkflowInstance> {
					throw new Error("Creation failed.");
				},
				async createInstanceFolderNote(): Promise<FakeFile> {
					throw new Error("Should not be called.");
				},
			},
		});

		await panel.loadWorkflow("alpha");
		(panel as any).createButton.click();
		await flushAsyncWork();

		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			"Creation failed."
		);
		expect((panel as any).createButton.disabled).toBe(false);
		expect(panel.containerEl.textContent).toContain("alpha");
		expect(panel.containerEl.textContent).toContain("Create Instance");
	});

	it("shows a notice when instanceManager is unavailable at create time", async () => {
		const workflow = createWorkflow();
		const panel = createPanel({
			workflowManager: {
				async getWorkflow(): Promise<typeof workflow> {
					return workflow;
				},
			},
			instanceManager: null,
		});

		await panel.loadWorkflow("alpha");
		(panel as any).createButton.click();
		await flushAsyncWork();

		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			"Instance creation is unavailable."
		);
		expect(panel.containerEl.textContent).toContain("Create Instance");
	});

	it("shows a generic error message when creation throws a non-Error value", async () => {
		const workflow = createWorkflow();
		const panel = createPanel({
			workflowManager: {
				async getWorkflow(): Promise<typeof workflow> {
					return workflow;
				},
			},
			instanceManager: {
				async createInstance(): Promise<WorkflowInstance> {
					throw "boom";
				},
				async createInstanceFolderNote(): Promise<FakeFile> {
					throw new Error("Should not be called.");
				},
			},
		});

		await panel.loadWorkflow("alpha");
		(panel as any).createButton.click();
		await flushAsyncWork();

		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			"Failed to create the workflow instance."
		);
		expect((panel as any).createButton.disabled).toBe(false);
	});
});

function createPanel(overrides: Partial<Record<string, unknown>> = {}): CreateInstancePanel {
	const app = (overrides.app as ReturnType<typeof createFakeApp> | undefined) ?? createFakeApp();
	const plugin = {
		app,
		workflowManager: overrides.workflowManager ?? null,
		instanceManager: overrides.instanceManager ?? null,
		...overrides,
	};

	return new CreateInstancePanel(
		new (WorkspaceLeaf as unknown as { new (...args: unknown[]): WorkspaceLeaf })(
			app.workspace
		) as never,
		plugin as never
	);
}

function createFakeApp(): any {
	const app = new App() as any;
	app.vault = new FakeVault();
	app.metadataCache = new FakeMetadataCache();
	return app;
}

function createWorkflow() {
	return {
		name: "alpha",
		canvasPath: "Workflows/alpha.canvas",
		taskFolderPath: "Workflows/alpha",
		tasks: [
			{
				name: "Task A",
				filePath: "Workflows/alpha/Task A.md",
				canvasNodeId: null,
				frontmatter: {
					"ironflow-template": "Development Execution",
					"ironflow-workflow": "alpha",
					"ironflow-agent-profile": "",
					"ironflow-depends-on": [],
					"ironflow-next-tasks": [],
					"plan-path": "docs/plan.md",
					references: "src/main.ts",
				},
			},
			{
				name: "Task B",
				filePath: "Workflows/alpha/Task B.md",
				canvasNodeId: null,
				frontmatter: {
					"ironflow-template": "Review Execution",
					"ironflow-workflow": "alpha",
					"ironflow-agent-profile": "",
					"ironflow-depends-on": ["[[Task A]]"],
					"ironflow-next-tasks": [],
					phase: "1",
				},
			},
		],
	};
}

function createDeferred<TValue>() {
	let resolve!: (value: TValue) => void;
	const promise = new Promise<TValue>((resolvePromise) => {
		resolve = resolvePromise;
	});

	return { promise, resolve };
}

async function flushAsyncWork(): Promise<void> {
	for (let index = 0; index < 10; index += 1) {
		await Promise.resolve();
	}
}
