import { beforeEach, describe, expect, it, vi } from "vitest";

import { App, Events, Notice, WorkspaceLeaf } from "obsidian";

import { updateFrontmatter } from "../src/core/frontmatter";
import IronflowPlugin from "../src/main";
import type { IronflowTask, TemplateSchema } from "../src/types";
import { TaskPropertyPanel } from "../src/views/TaskPropertyPanel";
import { WorkflowCommandModal } from "../src/views/WorkflowCommandModal";

interface FakeFile {
	path: string;
	basename: string;
	extension: string;
}

interface FakeFolder {
	path: string;
	children: Array<FakeFile | FakeFolder>;
}

class FakeVault extends Events {
	private readonly files = new Map<string, FakeFile>();
	private readonly folders = new Map<string, FakeFolder>();
	private readonly contents = new Map<string, string>();

	constructor() {
		super();
		this.folders.set("", { path: "", children: [] });
	}

	getAbstractFileByPath(path: string): FakeFile | FakeFolder | null {
		return this.files.get(path) ?? this.folders.get(path) ?? null;
	}

	getFileByPath(path: string): FakeFile | null {
		return this.files.get(path) ?? null;
	}

	getFolderByPath(path: string): FakeFolder | null {
		return this.folders.get(path) ?? null;
	}

	async create(path: string, data: string): Promise<FakeFile> {
		const file = this.writeFile(path, data);
		this.trigger("create", file);
		return file;
	}

	async createFolder(path: string): Promise<FakeFolder> {
		const folder = this.ensureFolder(path);
		this.trigger("create", folder);
		return folder;
	}

	async read(file: FakeFile): Promise<string> {
		const content = this.contents.get(file.path);
		if (content === undefined) {
			throw new Error(`No content for "${file.path}".`);
		}

		return content;
	}

	async cachedRead(file: FakeFile): Promise<string> {
		return this.read(file);
	}

	async modify(file: FakeFile, data: string): Promise<void> {
		this.contents.set(file.path, data);
		this.trigger("modify", file);
	}

	async delete(file: FakeFile | FakeFolder, force = false): Promise<void> {
		if ("children" in file) {
			if (file.children.length > 0 && !force) {
				throw new Error(`Folder "${file.path}" is not empty.`);
			}

			for (const child of [...file.children]) {
				await this.delete(child as FakeFile | FakeFolder, true);
			}
			this.detachFromParent(file.path);
			this.folders.delete(file.path);
			this.trigger("delete", file);
			return;
		}

		this.detachFromParent(file.path);
		this.files.delete(file.path);
		this.contents.delete(file.path);
		this.trigger("delete", file);
	}

	ensureFolder(path: string): FakeFolder {
		if (path === "") {
			return this.folders.get("") as FakeFolder;
		}

		const existing = this.folders.get(path);
		if (existing) {
			return existing;
		}

		const parent = this.ensureFolder(getParentPath(path));
		const folder: FakeFolder = { path, children: [] };
		parent.children.push(folder);
		this.folders.set(path, folder);
		return folder;
	}

	writeFile(path: string, data: string): FakeFile {
		const parent = this.ensureFolder(getParentPath(path));
		const existing = this.files.get(path);
		if (existing) {
			this.contents.set(path, data);
			return existing;
		}

		const file = createFile(path);
		parent.children.push(file);
		this.files.set(path, file);
		this.contents.set(path, data);
		return file;
	}

	private detachFromParent(path: string): void {
		const parent = this.folders.get(getParentPath(path));
		if (!parent) {
			return;
		}

		parent.children = parent.children.filter((child) => child.path !== path);
	}
}

class FakeMetadataCache extends Events {
	private readonly frontmatterByPath = new Map<string, Record<string, unknown> | null>();

	setFrontmatter(path: string, frontmatter: Record<string, unknown> | null): void {
		this.frontmatterByPath.set(path, frontmatter);
	}

	getFileCache(file: FakeFile): { frontmatter?: Record<string, unknown> } | null {
		const frontmatter = this.frontmatterByPath.get(file.path);
		return frontmatter ? { frontmatter } : null;
	}
}

describe("Phase 4 UI", () => {
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

	it("registers commands, ribbon action, and task panel events in the plugin lifecycle", async () => {
		const app = createFakeApp();
		app.plugins.enabledPlugins.add("templater-obsidian");
		app.plugins.enabledPlugins.add("obsidian-local-rest-api");
		app.vault.ensureFolder("Templates");
		app.vault.ensureFolder("Workflows");
		app.vault.ensureFolder("Workflows/alpha");
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
			id: "ironflow-local-rest-api",
			version: "1.0.0",
			name: "Ironflow",
		} as never);
		await plugin.onload();

		expect((plugin as never as { commands: Array<{ id: string }> }).commands.map((command) => command.id)).toEqual([
			"create-workflow",
			"add-task",
			"open-task-panel",
		]);
		expect((plugin as never as { ribbonIcons: unknown[] }).ribbonIcons).toHaveLength(1);

		await (plugin as never as {
			commands: Array<{ callback?: () => Promise<unknown> | unknown }>;
		}).commands[2]?.callback?.();
		const panelLeaf = app.workspace.getLeavesOfType(TaskPropertyPanel.VIEW_TYPE)[0];
		expect(panelLeaf?.view).toBeInstanceOf(TaskPropertyPanel);

		await plugin.handleWorkflowTaskFileOpen(taskFile as never);
		const panel = panelLeaf?.view as TaskPropertyPanel;
		expect(panel.getCurrentTask()?.filePath).toBe(taskFile.path);

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
		expect(panel.getCurrentTask()?.frontmatter["ironflow-agent-profile"]).toBe(
			"reviewer"
		);
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

function createFile(path: string): FakeFile {
	return {
		path,
		basename: path.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? path,
		extension: path.split(".").at(-1) ?? "",
	};
}

function getParentPath(path: string): string {
	return path.split("/").slice(0, -1).join("/");
}
