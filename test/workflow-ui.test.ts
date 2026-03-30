import { beforeEach, describe, expect, it, vi } from "vitest";

import { App, Notice, WorkspaceLeaf } from "obsidian";

import { updateFrontmatter } from "../src/core/frontmatter";
import {
	getWorkflowNameFromCanvasPath,
	getWorkflowNameFromTaskPath,
} from "../src/core/workflowPaths";
import IronflowPlugin from "../src/main";
import type { IronflowTask, TemplateSchema } from "../src/types";
import { RemoveTaskModal } from "../src/views/RemoveTaskModal";
import { TaskPropertyPanel } from "../src/views/TaskPropertyPanel";
import { WorkflowCommandModal } from "../src/views/WorkflowCommandModal";
import {
	createFakeFile,
	FakeMetadataCache,
	FakeVault,
	type FakeFile,
} from "./mocks/fakeVault";
import { CreateInstancePanel } from "../src/views/CreateInstancePanel";

describe("Workflow UI", () => {
	beforeEach(() => {
		(Notice as unknown as { reset(): void }).reset();
		vi.useRealTimers();
	});

	it("submits the create-workflow modal and opens the new canvas", async () => {
		const app = createFakeApp();
		const openedFiles: string[] = [];
		const modal = new WorkflowCommandModal(
			app as never,
			{
				app,
				settings: {
					workflowFolder: "Workflows",
					templateFolder: "Templates",
				},
				templateRegistry: {
					getTemplates(): TemplateSchema[] {
						return [];
					},
				},
				workflowManager: {
					async getWorkflow(): Promise<null> {
						return null;
					},
					async createWorkflow(name: string) {
						app.vault.ensureFolder("Workflows");
						app.vault.ensureFolder(`Workflows/${name}`);
						app.vault.writeFile(`Workflows/${name}.canvas`, "{}");
						return {
							name,
							canvasPath: `Workflows/${name}.canvas`,
							taskFolderPath: `Workflows/${name}`,
							tasks: [],
						};
					},
				},
			} as never,
			"create-workflow"
		);

		const leaf = app.workspace.getLeaf(true);
		leaf.openFile = async (file: FakeFile) => {
			openedFiles.push(file.path);
		};

		modal.setNameValue("alpha");
		expect(await modal.submit()).toBe(true);
		expect(openedFiles.length === 0 ? app.workspace.activeFile?.path : openedFiles[0]).toBe(
			"Workflows/alpha.canvas"
		);
	});

	it("requires an active workflow canvas before the add-task modal submits", async () => {
		const app = createFakeApp();
		const modal = new WorkflowCommandModal(
			app as never,
			{
				app,
				settings: {
					workflowFolder: "Workflows",
					templateFolder: "Templates",
				},
				templateRegistry: {
					getTemplates(): TemplateSchema[] {
						return [{ name: "Review", filePath: "Templates/Review.md", fields: [] }];
					},
				},
				workflowManager: {
					async getWorkflow(): Promise<null> {
						return null;
					},
				},
			} as never,
			"add-task"
		);

		modal.setNameValue("task-a");
		modal.setSelectedTemplateName("Review");
		expect(await modal.submit()).toBe(false);
		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			"Open a workflow canvas before adding a task."
		);
	});

	it("submits the add-task modal when an active workflow canvas is open", async () => {
		const app = createFakeApp();
		const addedTasks: Array<{
			workflowName: string;
			taskName: string;
			templateName: string;
		}> = [];
		app.workspace.activeFile = createFakeFile("Workflows/alpha.canvas") as never;
		const modal = new WorkflowCommandModal(
			app as never,
			{
				app,
				settings: {
					workflowFolder: "Workflows",
					templateFolder: "Templates",
				},
				templateRegistry: {
					getTemplates(): TemplateSchema[] {
						return [{ name: "Review", filePath: "Templates/Review.md", fields: [] }];
					},
				},
				workflowManager: {
					async getWorkflow(): Promise<{ tasks: IronflowTask[] }> {
						return { tasks: [] } as { tasks: IronflowTask[] };
					},
					async addTaskToWorkflow(
						workflowName: string,
						taskName: string,
						templateName: string
					): Promise<void> {
						addedTasks.push({ workflowName, taskName, templateName });
					},
				},
			} as never,
			"add-task"
		);

		modal.setNameValue("task-a");
		modal.setSelectedTemplateName("Review");
		expect(await modal.submit()).toBe(true);
		expect(addedTasks).toEqual([
			{
				workflowName: "alpha",
				taskName: "task-a",
				templateName: "Review",
			},
		]);
	});

	it("removes a task via the remove-task modal", async () => {
		const app = createFakeApp();
		const removedTasks: Array<{ workflowName: string; taskName: string }> = [];
		app.workspace.activeFile = createFakeFile("Workflows/alpha.canvas") as never;
		const modal = new RemoveTaskModal(app as never, {
			app,
			settings: {
				workflowFolder: "Workflows",
				templateFolder: "Templates",
			},
			workflowManager: {
				async getWorkflow(): Promise<{
					tasks: Array<{ name: string }>;
				}> {
					return {
						tasks: [{ name: "task-a" }, { name: "task-b" }],
					};
				},
				async removeTaskFromWorkflow(
					workflowName: string,
					taskName: string
				): Promise<void> {
					removedTasks.push({ workflowName, taskName });
				},
			},
		} as never);

		await modal.onOpen();
		modal.setSelectedTaskName("task-b");
		expect(await modal.submit()).toBe(true);
		expect(removedTasks).toEqual([
			{ workflowName: "alpha", taskName: "task-b" },
		]);
		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			'Task "task-b" removed from "alpha".'
		);
	});

	it("requires an active workflow canvas before the remove-task modal submits", async () => {
		const app = createFakeApp();
		const modal = new RemoveTaskModal(app as never, {
			app,
			settings: {
				workflowFolder: "Workflows",
				templateFolder: "Templates",
			},
			workflowManager: {},
		} as never);

		expect(await modal.submit()).toBe(false);
		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			"Open a workflow canvas before removing a task."
		);
	});

	it("renders the task panel, debounces text updates, and syncs dependencies", async () => {
		vi.useFakeTimers();
		const app = createFakeApp();
		const taskA = createTask("alpha", "task-a", {
			"ironflow-template": "Review",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": [],
			provider: "claude_code",
		});
		const taskB = createTask("alpha", "task-b", {
			"ironflow-template": "Review",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": [],
			provider: "claude_code",
		});
		const updates: Array<{ path: string; updates: Record<string, unknown> }> = [];
		const panel = new TaskPropertyPanel(
			new (WorkspaceLeaf as unknown as { new (...args: unknown[]): WorkspaceLeaf })(
				app.workspace
			) as never,
			{
				app,
				settings: {
					workflowFolder: "Workflows",
					templateFolder: "Templates",
				},
				templateRegistry: {
					getFieldSchema(): TemplateSchema["fields"] {
						return [{ key: "provider", defaultValue: "claude_code" }];
					},
				},
				taskManager: {
					async getWorkflowTasks(): Promise<IronflowTask[]> {
						return [taskA, taskB];
					},
					async getTask(path: string): Promise<IronflowTask | null> {
						return path === taskA.filePath ? taskA : taskB;
					},
					async updateTaskFrontmatter(
						path: string,
						nextUpdates: Record<string, unknown>
					): Promise<void> {
						updates.push({ path, updates: nextUpdates });
						if (path === taskA.filePath) {
							taskA.frontmatter = { ...taskA.frontmatter, ...nextUpdates };
						} else {
							taskB.frontmatter = { ...taskB.frontmatter, ...nextUpdates };
						}
					},
				},
				canvasWriter: {
					async syncEdges(): Promise<void> {
						updates.push({ path: "canvas", updates: { synced: true } });
					},
				},
			} as never
		);

		await panel.onOpen();
		expect(panel.containerEl.textContent).toContain(
			"Select a task node on a canvas to edit its properties"
		);

		await panel.loadTask(taskA);
		expect(panel.containerEl.textContent).toContain("Source template");
		expect(panel.containerEl.textContent).toContain("task-b");

		panel.updateAgentProfile("developer");
		vi.advanceTimersByTime(500);
		await vi.runAllTimersAsync();
		expect(updates).toContainEqual({
			path: taskA.filePath,
			updates: { "ironflow-agent-profile": "developer" },
		});

		await panel.addDependency("ironflow-next-tasks", "task-b");
		expect(updates).toContainEqual({
			path: taskA.filePath,
			updates: { "ironflow-next-tasks": ["[[task-b]]"] },
		});
		expect(updates).toContainEqual({
			path: taskB.filePath,
			updates: { "ironflow-depends-on": ["[[task-a]]"] },
		});
		expect(updates).toContainEqual({
			path: "canvas",
			updates: { synced: true },
		});
	});

	it("removes dependencies reciprocally and syncs the canvas", async () => {
		const app = createFakeApp();
		const taskA = createTask("alpha", "task-a", {
			"ironflow-template": "Review",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": ["[[task-b]]"],
			provider: "claude_code",
		});
		const taskB = createTask("alpha", "task-b", {
			"ironflow-template": "Review",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": ["[[task-a]]"],
			"ironflow-next-tasks": [],
			provider: "claude_code",
		});
		const updates: Array<{ path: string; updates: Record<string, unknown> }> = [];
		const panel = new TaskPropertyPanel(
			new (WorkspaceLeaf as unknown as { new (...args: unknown[]): WorkspaceLeaf })(
				app.workspace
			) as never,
			{
				app,
				settings: {
					workflowFolder: "Workflows",
					templateFolder: "Templates",
				},
				templateRegistry: {
					getFieldSchema(): TemplateSchema["fields"] {
						return [];
					},
				},
				taskManager: {
					async getWorkflowTasks(): Promise<IronflowTask[]> {
						return [taskA, taskB];
					},
					async getTask(path: string): Promise<IronflowTask | null> {
						return path === taskA.filePath ? taskA : taskB;
					},
					async updateTaskFrontmatter(
						path: string,
						nextUpdates: Record<string, unknown>
					): Promise<void> {
						updates.push({ path, updates: nextUpdates });
						if (path === taskA.filePath) {
							taskA.frontmatter = { ...taskA.frontmatter, ...nextUpdates };
						} else {
							taskB.frontmatter = { ...taskB.frontmatter, ...nextUpdates };
						}
					},
				},
				canvasWriter: {
					async syncEdges(): Promise<void> {
						updates.push({ path: "canvas", updates: { synced: true } });
					},
				},
			} as never
		);

		await panel.loadTask(taskA);
		await panel.removeDependency("ironflow-next-tasks", "task-b");

		expect(updates).toContainEqual({
			path: taskA.filePath,
			updates: { "ironflow-next-tasks": [] },
		});
		expect(updates).toContainEqual({
			path: taskB.filePath,
			updates: { "ironflow-depends-on": [] },
		});
		expect(updates).toContainEqual({
			path: "canvas",
			updates: { synced: true },
		});
	});

	it("registers commands, ribbon action, and task panel events in the plugin lifecycle", async () => {
		const app = createFakeApp();
		app.plugins.enabledPlugins.add("templater-obsidian");
		app.plugins.enabledPlugins.add("obsidian-local-rest-api");
		app.vault.ensureFolder("Templates");
		app.vault.ensureFolder("Workflows");
		app.vault.ensureFolder("Workflows/alpha");
		app.vault.writeFile(
			"Workflows/alpha.canvas",
			`${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`
		);
		const templateFile = app.vault.writeFile(
			"Templates/Review.md",
			updateFrontmatter("Review body", { provider: "claude_code" })
		);
		const taskFile = app.vault.writeFile(
			"Workflows/alpha/task-a.md",
			updateFrontmatter("Task body", {
				"ironflow-template": "Review",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": [],
				provider: "claude_code",
			})
		);
		app.metadataCache.setFrontmatter(templateFile.path, { provider: "claude_code" });

		const plugin = new IronflowPlugin(app as never, {
			id: "ironflow-obsidian",
			version: "1.0.0",
			name: "Ironflow",
		} as never);
		await plugin.onload();
		expect(plugin.instanceManager).not.toBeNull();
		expect(plugin.canvasToolbarManager).not.toBeNull();

		expect((plugin as never as { commands: Array<{ id: string }> }).commands.map((command) => command.id)).toEqual([
			"create-workflow",
			"add-task",
			"remove-task",
			"open-task-panel",
			"create-instance",
		]);
		expect((plugin as never as { ribbonIcons: unknown[] }).ribbonIcons).toHaveLength(1);

		await (plugin as never as {
			commands: Array<{ callback?: () => Promise<unknown> | unknown }>;
		}).commands[3]?.callback?.();
		const panelLeaf = app.workspace.getLeavesOfType(TaskPropertyPanel.VIEW_TYPE)[0];
		expect(panelLeaf?.view).toBeInstanceOf(TaskPropertyPanel);

		app.workspace.activeFile = createFakeFile("Workflows/alpha.canvas") as never;
		await plugin.handleCreateInstanceClick("alpha");
		const createInstanceLeaf =
			app.workspace.getLeavesOfType(CreateInstancePanel.VIEW_TYPE)[0];
		expect(createInstanceLeaf?.view).toBeInstanceOf(CreateInstancePanel);
		expect(
			(createInstanceLeaf?.view as CreateInstancePanel).containerEl.textContent
		).toContain("alpha");

		await plugin.handleWorkflowTaskFileOpen(taskFile as never);
		const panel = panelLeaf?.view as TaskPropertyPanel;
		expect(panel.getCurrentTask()?.filePath).toBe(taskFile.path);

		const instanceTaskFile = app.vault.writeFile(
			"Workflows/alpha/instances/run-a3f8/task-b.md",
			updateFrontmatter("Instance body", {
				"ironflow-template": "Review",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": [],
				"ironflow-instance-id": "run-a3f8",
				"ironflow-status": "open",
				provider: "claude_code",
			})
		);
		await plugin.handleWorkflowTaskFileOpen(instanceTaskFile as never);
		expect(
			app.workspace
				.getLeavesOfType(TaskPropertyPanel.VIEW_TYPE)
				.map((leaf: { view: TaskPropertyPanel }) => leaf.view.getCurrentTask()?.filePath)
		).not.toContain(instanceTaskFile.path);

		const instanceFolderNote = app.vault.writeFile(
			"Workflows/alpha/instances/run-a3f8.md",
			updateFrontmatter("Instance note", {
				"ironflow-type": "instance-base",
				"ironflow-workflow": "alpha",
				"ironflow-instance-id": "run-a3f8",
			})
		);
		await plugin.handleWorkflowTaskFileOpen(instanceFolderNote as never);
		expect(
			app.workspace
				.getLeavesOfType(TaskPropertyPanel.VIEW_TYPE)
				.map((leaf: { view: TaskPropertyPanel }) => leaf.view.getCurrentTask()?.filePath)
		).not.toContain(instanceFolderNote.path);

		const outsideFile = app.vault.writeFile("Notes.md", "# outside");
		app.workspace.trigger("file-open", outsideFile);
		await Promise.resolve();
		expect(panel.getCurrentTask()?.filePath).toBe(taskFile.path);

		await app.vault.modify(
			taskFile,
			updateFrontmatter(await app.vault.read(taskFile), {
				"ironflow-agent-profile": "reviewer",
			})
		);
		await plugin.handleWorkflowTaskMetadataChanged(taskFile as never, {
			frontmatter: {
				"ironflow-template": "Review",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "reviewer",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": [],
				provider: "claude_code",
			},
		} as never);
		expect(
			app.workspace
				.getLeavesOfType(TaskPropertyPanel.VIEW_TYPE)
				.some(
					(leaf: { view: TaskPropertyPanel }) =>
						leaf.view.getCurrentTask()?.filePath === taskFile.path &&
						leaf.view.getCurrentTask()?.frontmatter["ironflow-agent-profile"] ===
							"reviewer"
				)
		).toBe(true);

		plugin.onunload();
		expect(plugin.canvasToolbarManager).toBeNull();
	});

	it("shows a notice when the create-instance command runs without an active workflow canvas", async () => {
		const app = createFakeApp();
		app.plugins.enabledPlugins.add("templater-obsidian");
		const plugin = new IronflowPlugin(app as never, {
			id: "ironflow-obsidian",
			version: "1.0.0",
			name: "Ironflow",
		} as never);

		await plugin.onload();
		await (
			plugin as never as {
				commands: Array<{ id: string; callback?: () => Promise<unknown> | unknown }>;
			}
		).commands.find((command) => command.id === "create-instance")?.callback?.();

		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			"Open a workflow canvas before creating an instance."
		);
	});

	it("shows a persistent validation notice when a workflow has empty required fields", async () => {
		const app = createFakeApp();
		app.plugins.enabledPlugins.add("templater-obsidian");
		app.vault.ensureFolder("Templates");
		app.vault.ensureFolder("Workflows");
		app.vault.ensureFolder("Workflows/alpha");
		const templateFile = app.vault.writeFile(
			"Templates/Review.md",
			updateFrontmatter("Review body", { references: "" })
		);
		app.vault.writeFile(
			"Workflows/alpha.canvas",
			`${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`
		);
		app.vault.writeFile(
			"Workflows/alpha/task-a.md",
			updateFrontmatter("Task body", {
				"ironflow-template": "Review",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": [],
				references: "",
			})
		);
		app.metadataCache.setFrontmatter(templateFile.path, { references: "" });

		const plugin = new IronflowPlugin(app as never, {
			id: "ironflow-obsidian",
			version: "1.0.0",
			name: "Ironflow",
		} as never);

		await plugin.onload();
		await plugin.handleCreateInstanceClick("alpha");

		expect((Notice as unknown as { notices: string[] }).notices).toEqual(
			expect.arrayContaining([
				expect.stringContaining('Cannot create instance for "alpha".'),
			])
		);
		expect(
			(Notice as unknown as {
				events: Array<{ message: string; timeout?: number }>;
			}).events
		).toContainEqual(
			expect.objectContaining({
				message: expect.stringContaining("task-a: references"),
				timeout: 0,
			})
		);
		expect(app.workspace.getLeavesOfType(CreateInstancePanel.VIEW_TYPE)).toHaveLength(0);
	});

	it("shows a notice when create-instance is requested for a workflow that does not exist", async () => {
		const app = createFakeApp();
		app.plugins.enabledPlugins.add("templater-obsidian");
		const plugin = new IronflowPlugin(app as never, {
			id: "ironflow-obsidian",
			version: "1.0.0",
			name: "Ironflow",
		} as never);

		await plugin.onload();
		await plugin.handleCreateInstanceClick("nonexistent");

		expect((Notice as unknown as { notices: string[] }).notices).toContain(
			'Workflow "nonexistent" not found.'
		);
		expect(app.workspace.getLeavesOfType(CreateInstancePanel.VIEW_TYPE)).toHaveLength(0);
	});

	it("parses workflow names from canvas and task paths", () => {
		expect(getWorkflowNameFromCanvasPath("Workflows", "Workflows/alpha.canvas")).toBe(
			"alpha"
		);
		expect(
			getWorkflowNameFromCanvasPath("Workflows", "Workflows/nested/alpha.canvas")
		).toBeNull();
		expect(getWorkflowNameFromCanvasPath("Workflows", "Workflows/alpha.md")).toBeNull();

		expect(getWorkflowNameFromTaskPath("Workflows", "Workflows/alpha/task-a.md")).toBe(
			"alpha"
		);
		expect(
			getWorkflowNameFromTaskPath(
				"Workflows",
				"Workflows/alpha/instances/run-a3f8/task-a.md"
			)
		).toBe("alpha");
		expect(
			getWorkflowNameFromTaskPath(
				"Workflows",
				"Workflows/alpha/instances/task-a.md"
			)
		).toBeNull();
		expect(
			getWorkflowNameFromTaskPath(
				"Workflows",
				"Workflows/alpha/nested/task-a.md"
			)
		).toBeNull();
		expect(
			getWorkflowNameFromTaskPath(
				"Workflows",
				"Workflows/alpha/other/run-a3f8/task-a.md"
			)
		).toBeNull();
		expect(getWorkflowNameFromTaskPath("Workflows", "Workflows/alpha.canvas")).toBeNull();
	});
});

function createFakeApp(): any {
	const app = new App() as any;
	app.vault = new FakeVault();
	app.metadataCache = new FakeMetadataCache();
	return app;
}

function createTask(
	workflowName: string,
	taskName: string,
	frontmatter: IronflowTask["frontmatter"]
): IronflowTask {
	return {
		name: taskName,
		filePath: `Workflows/${workflowName}/${taskName}.md`,
		canvasNodeId: null,
		frontmatter,
	};
}
