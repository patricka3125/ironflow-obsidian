import { describe, expect, it } from "vitest";

import { CanvasWriter } from "../src/core/CanvasWriter";
import { parseFrontmatter, updateFrontmatter } from "../src/core/frontmatter";
import { TaskManager } from "../src/core/TaskManager";
import { getTaskNameFromLink } from "../src/core/taskUtils";
import { WorkflowManager } from "../src/core/WorkflowManager";
import type { TemplateSchema } from "../src/types";

type FakeAbstractFile = FakeFile | FakeFolder;

interface FakeFile {
	path: string;
	basename: string;
	extension: string;
	stat: Record<string, never>;
}

interface FakeFolder {
	path: string;
	children: FakeAbstractFile[];
}

class FakeVault {
	private readonly files = new Map<string, FakeFile>();
	private readonly folders = new Map<string, FakeFolder>();
	private readonly contents = new Map<string, string>();

	constructor() {
		this.folders.set("", { path: "", children: [] });
	}

	getAbstractFileByPath(path: string): FakeAbstractFile | null {
		return this.files.get(path) ?? this.folders.get(path) ?? null;
	}

	getFileByPath(path: string): FakeFile | null {
		return this.files.get(path) ?? null;
	}

	getFolderByPath(path: string): FakeFolder | null {
		return this.folders.get(path) ?? null;
	}

	async create(path: string, data: string): Promise<FakeFile> {
		if (this.getAbstractFileByPath(path)) {
			throw new Error(`Path "${path}" already exists.`);
		}

		const parent = this.getRequiredParentFolder(path);
		const file = createFile(path);
		parent.children.push(file);
		this.files.set(path, file);
		this.contents.set(path, data);
		return file;
	}

	async createFolder(path: string): Promise<FakeFolder> {
		if (this.folders.has(path)) {
			throw new Error(`Folder "${path}" already exists.`);
		}

		const parent = this.getRequiredParentFolder(path);
		const folder = createFolder(path);
		parent.children.push(folder);
		this.folders.set(path, folder);
		return folder;
	}

	async read(file: FakeFile): Promise<string> {
		return this.readContent(file.path);
	}

	async cachedRead(file: FakeFile): Promise<string> {
		return this.readContent(file.path);
	}

	async modify(file: FakeFile, data: string): Promise<void> {
		if (!this.files.has(file.path)) {
			throw new Error(`File "${file.path}" does not exist.`);
		}

		this.contents.set(file.path, data);
	}

	async delete(file: FakeAbstractFile, force = false): Promise<void> {
		if (isFakeFolder(file)) {
			if (file.children.length > 0 && !force) {
				throw new Error(`Folder "${file.path}" is not empty.`);
			}

			for (const child of [...file.children]) {
				await this.delete(child, true);
			}
			this.detachFromParent(file.path);
			this.folders.delete(file.path);
			return;
		}

		this.detachFromParent(file.path);
		this.files.delete(file.path);
		this.contents.delete(file.path);
	}

	writeFile(path: string, data: string): FakeFile {
		const parent = this.ensureParentFolders(path);
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

	ensureFolder(path: string): FakeFolder {
		if (path === "") {
			return this.folders.get("") as FakeFolder;
		}

		const existing = this.folders.get(path);
		if (existing) {
			return existing;
		}

		const parent = this.ensureParentFolders(path);
		const folder = createFolder(path);
		parent.children.push(folder);
		this.folders.set(path, folder);
		return folder;
	}

	private getRequiredParentFolder(path: string): FakeFolder {
		const parentPath = getParentPath(path);
		const parent = this.folders.get(parentPath);
		if (!parent) {
			throw new Error(`Parent folder "${parentPath}" does not exist.`);
		}

		return parent;
	}

	private ensureParentFolders(path: string): FakeFolder {
		const parentPath = getParentPath(path);
		if (parentPath === "") {
			return this.folders.get("") as FakeFolder;
		}

		const segments = parentPath.split("/");
		let currentPath = "";
		let currentFolder = this.folders.get("") as FakeFolder;
		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const nextFolder = this.folders.get(currentPath);
			if (nextFolder) {
				currentFolder = nextFolder;
				continue;
			}

			const createdFolder = createFolder(currentPath);
			currentFolder.children.push(createdFolder);
			this.folders.set(currentPath, createdFolder);
			currentFolder = createdFolder;
		}

		return currentFolder;
	}

	private detachFromParent(path: string): void {
		const parent = this.folders.get(getParentPath(path));
		if (!parent) {
			return;
		}

		parent.children = parent.children.filter((child) => child.path !== path);
	}

	private readContent(path: string): string {
		const content = this.contents.get(path);
		if (content === undefined) {
			throw new Error(`No content found for "${path}".`);
		}

		return content;
	}
}

describe("Phase 3 services", () => {
	it("parses task names from supported wikilink formats", () => {
		expect(getTaskNameFromLink("[[task-a]]")).toBe("task-a");
		expect(getTaskNameFromLink("[[folder/task-a|Display]]")).toBe("task-a");
		expect(getTaskNameFromLink("[[task-a#Heading]]")).toBe("task-a");
		expect(getTaskNameFromLink("[[]]")).toBeNull();
		expect(getTaskNameFromLink("task-a")).toBeNull();
	});

	it("creates, reads, updates, lists, and deletes workflow task files", async () => {
		const app = createFakeApp();
		const settings = {
			workflowFolder: "Workflows",
			templateFolder: "Templates",
		};
		app.vault.ensureFolder("Templates");
		app.vault.ensureFolder("Workflows");
		app.vault.ensureFolder("Workflows/alpha");
		app.vault.writeFile(
			"Templates/Review Cycle Prompt.md",
			`---
current-branch: "feature/auth"
target-branch: "main"
provider: "claude_code"
---
Line 1
<% tp.file.title %>
Line 3`
		);
		app.vault.writeFile("Workflows/alpha/notes.txt", "ignore me");

		const taskManager = new TaskManager(
			app as never,
			createTemplateRegistryStub([
				{
					name: "Review Cycle Prompt",
					filePath: "Templates/Review Cycle Prompt.md",
					fields: [
						{ key: "current-branch", defaultValue: "feature/auth" },
						{ key: "target-branch", defaultValue: "main" },
						{ key: "provider", defaultValue: "claude_code" },
					],
				},
			]) as never,
			settings
		);

		const createdTask = await taskManager.createTask(
			"alpha",
			"build-feature",
			"Review Cycle Prompt"
		);
		expect(createdTask.filePath).toBe("Workflows/alpha/build-feature.md");
		expect(
			parseFrontmatter(await readFileContent(app.vault, createdTask.filePath))
		).toEqual(
			expect.objectContaining({
				"ironflow-template": "Review Cycle Prompt",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": [],
				"current-branch": "feature/auth",
				"target-branch": "main",
				provider: "claude_code",
			})
		);
		expect(await readFileContent(app.vault, createdTask.filePath)).toContain(
			"<% tp.file.title %>"
		);

		await taskManager.updateTaskFrontmatter(createdTask.filePath, {
			"ironflow-agent-profile": "developer",
			provider: "openai",
		});
		const updatedTask = await taskManager.getTask(createdTask.filePath);
		expect(updatedTask?.frontmatter["ironflow-agent-profile"]).toBe("developer");
		expect(updatedTask?.frontmatter.provider).toBe("openai");

		const workflowTasks = await taskManager.getWorkflowTasks("alpha");
		expect(workflowTasks.map((task) => task.name)).toEqual(["build-feature"]);

		await taskManager.deleteTask(createdTask.filePath);
		expect(await taskManager.getTask(createdTask.filePath)).toBeNull();
	});

	it("computes and syncs ironflow edges while preserving user edges", async () => {
		const app = createFakeApp();
		const settings = {
			workflowFolder: "Workflows",
			templateFolder: "Templates",
		};
		app.vault.ensureFolder("Workflows");
		app.vault.ensureFolder("Workflows/alpha");
		app.vault.writeFile(
			"Workflows/alpha/task-a.md",
			updateFrontmatter("# A", {
				"ironflow-template": "Review",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": ["[[task-b]]"],
			})
		);
		app.vault.writeFile(
			"Workflows/alpha/task-b.md",
			updateFrontmatter("# B", {
				"ironflow-template": "Review",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": ["[[task-a]]"],
				"ironflow-next-tasks": [],
			})
		);
		app.vault.writeFile(
			"Workflows/alpha.canvas",
			`${JSON.stringify(
				{
					nodes: [
						{
							id: "node-a",
							type: "file",
							file: "Workflows/alpha/task-a.md",
							x: 0,
							y: 0,
							width: 400,
							height: 300,
						},
						{
							id: "node-b",
							type: "file",
							file: "Workflows/alpha/task-b.md",
							x: 500,
							y: 0,
							width: 400,
							height: 300,
						},
					],
					edges: [
						{
							id: "user-edge",
							fromNode: "node-a",
							toNode: "node-b",
							fromSide: "bottom",
							toSide: "top",
						},
					],
				},
				null,
				2
			)}\n`
		);

		const canvasWriter = new CanvasWriter(app as never, settings);
		expect(
			canvasWriter.computeEdges(
				[
					{
						name: "task-a",
						filePath: "Workflows/alpha/task-a.md",
						canvasNodeId: null,
						frontmatter: {
							"ironflow-template": "Review",
							"ironflow-workflow": "alpha",
							"ironflow-agent-profile": "",
							"ironflow-depends-on": [],
							"ironflow-next-tasks": ["[[task-b]]"],
						},
					},
					{
						name: "task-b",
						filePath: "Workflows/alpha/task-b.md",
						canvasNodeId: null,
						frontmatter: {
							"ironflow-template": "Review",
							"ironflow-workflow": "alpha",
							"ironflow-agent-profile": "",
							"ironflow-depends-on": [],
							"ironflow-next-tasks": [],
						},
					},
				],
				new Map([
					["Workflows/alpha/task-a.md", "node-a"],
					["Workflows/alpha/task-b.md", "node-b"],
				])
			)
		).toEqual([
			{
				id: "ironflow-edge-node-a-node-b",
				fromNode: "node-a",
				toNode: "node-b",
				fromSide: "right",
				toSide: "left",
				toEnd: "arrow",
			},
		]);

		await canvasWriter.syncEdges("alpha");
		const syncedOnce = JSON.parse(
			await readFileContent(app.vault, "Workflows/alpha.canvas")
		);
		expect(syncedOnce.edges).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: "user-edge" }),
				expect.objectContaining({ id: "ironflow-edge-node-a-node-b" }),
			])
		);

		await canvasWriter.syncEdges("alpha");
		const syncedTwice = await readFileContent(app.vault, "Workflows/alpha.canvas");
		expect(syncedTwice).toBe(`${JSON.stringify(syncedOnce, null, 2)}\n`);

		const taskAFile = app.vault.getFileByPath("Workflows/alpha/task-a.md") as never;
		await app.vault.modify(
			taskAFile,
			updateFrontmatter(await app.vault.read(taskAFile), {
				"ironflow-next-tasks": [],
			})
		);
		await canvasWriter.syncEdges("alpha");
		const syncedWithoutDependency = JSON.parse(
			await readFileContent(app.vault, "Workflows/alpha.canvas")
		);
		expect(syncedWithoutDependency.edges).toEqual([
			expect.objectContaining({ id: "user-edge" }),
		]);
	});

	it("throws a descriptive error when a canvas file contains invalid JSON", async () => {
		const app = createFakeApp();
		const settings = {
			workflowFolder: "Workflows",
			templateFolder: "Templates",
		};
		app.vault.ensureFolder("Workflows");
		app.vault.ensureFolder("Workflows/alpha");
		app.vault.writeFile("Workflows/alpha.canvas", "{ invalid json");

		const canvasWriter = new CanvasWriter(app as never, settings);
		await expect(canvasWriter.syncEdges("alpha")).rejects.toThrow(
			/contains invalid JSON/
		);
	});

	it("manages workflow creation, task nodes, collisions, cleanup, and deletion", async () => {
		const app = createFakeApp();
		const settings = {
			workflowFolder: "Workflows",
			templateFolder: "Templates",
		};
		app.vault.ensureFolder("Templates");
		app.vault.writeFile(
			"Templates/Template A.md",
			updateFrontmatter("Template A body", {
				prompt: "alpha",
			})
		);
		app.vault.writeFile(
			"Templates/Template B.md",
			updateFrontmatter("Template B body", {
				prompt: "beta",
			})
		);

		const templateRegistry = createTemplateRegistryStub([
			{
				name: "Template A",
				filePath: "Templates/Template A.md",
				fields: [{ key: "prompt", defaultValue: "alpha" }],
			},
			{
				name: "Template B",
				filePath: "Templates/Template B.md",
				fields: [{ key: "prompt", defaultValue: "beta" }],
			},
		]);
		const taskManager = new TaskManager(
			app as never,
			templateRegistry as never,
			settings
		);
		const canvasWriter = new CanvasWriter(app as never, settings);
		const workflowManager = new WorkflowManager(
			app as never,
			taskManager,
			canvasWriter,
			settings
		);

		const workflow = await workflowManager.createWorkflow("alpha");
		expect(workflow).toEqual({
			name: "alpha",
			canvasPath: "Workflows/alpha.canvas",
			taskFolderPath: "Workflows/alpha",
			tasks: [],
		});
		await expect(workflowManager.createWorkflow("alpha")).rejects.toThrow(
			/already exists/
		);

		const firstTask = await workflowManager.addTaskToWorkflow(
			"alpha",
			"task-a",
			"Template A",
			{ x: 10, y: 20 }
		);
		const secondTask = await workflowManager.addTaskToWorkflow(
			"alpha",
			"task-b",
			"Template B"
		);
		await expect(
			workflowManager.addTaskToWorkflow("alpha", "task-a", "Template A")
		).rejects.toThrow(/already exists/);

		const loadedWorkflow = await workflowManager.getWorkflow("alpha");
		expect(loadedWorkflow?.tasks.map((task) => task.name)).toEqual([
			"task-a",
			"task-b",
		]);
		expect(firstTask.canvasNodeId).not.toBeNull();
		expect(secondTask.canvasNodeId).not.toBeNull();

		const canvasData = JSON.parse(
			await readFileContent(app.vault, "Workflows/alpha.canvas")
		);
		const firstNode = canvasData.nodes.find(
			(node: { file: string }) => node.file === "Workflows/alpha/task-a.md"
		);
		const secondNode = canvasData.nodes.find(
			(node: { file: string }) => node.file === "Workflows/alpha/task-b.md"
		);
		expect(firstNode).toEqual(
			expect.objectContaining({ x: 10, y: 20, width: 400, height: 300 })
		);
		expect(secondNode).toEqual(
			expect.objectContaining({ x: 510, y: 20, width: 400, height: 300 })
		);

		await taskManager.updateTaskFrontmatter("Workflows/alpha/task-a.md", {
			"ironflow-next-tasks": ["[[task-b]]"],
		});
		await taskManager.updateTaskFrontmatter("Workflows/alpha/task-b.md", {
			"ironflow-depends-on": ["[[task-a]]"],
		});
		await canvasWriter.syncEdges("alpha");
		await workflowManager.removeTaskFromWorkflow("alpha", "task-b");

		expect(app.vault.getFileByPath("Workflows/alpha/task-b.md")).toBeNull();
		const taskAFrontmatter = parseFrontmatter(
			await readFileContent(app.vault, "Workflows/alpha/task-a.md")
		);
		expect(taskAFrontmatter["ironflow-next-tasks"]).toEqual([]);

		const canvasAfterRemoval = JSON.parse(
			await readFileContent(app.vault, "Workflows/alpha.canvas")
		);
		expect(canvasAfterRemoval.nodes).toHaveLength(1);
		expect(canvasAfterRemoval.edges).toEqual([]);

		const workflows = await workflowManager.listWorkflows();
		expect(workflows.map((entry) => entry.name)).toEqual(["alpha"]);

		await workflowManager.deleteWorkflow("alpha");
		expect(app.vault.getFileByPath("Workflows/alpha.canvas")).toBeNull();
		expect(app.vault.getFolderByPath("Workflows/alpha")).toBeNull();
	});

	it("creates nested workflow roots when the workflow folder has multiple segments", async () => {
		const app = createFakeApp();
		app.vault.ensureFolder("Projects");
		const settings = {
			workflowFolder: "Projects/Workflows/Active",
			templateFolder: "Templates",
		};
		const taskManager = new TaskManager(
			app as never,
			createTemplateRegistryStub([]) as never,
			settings
		);
		const canvasWriter = new CanvasWriter(app as never, settings);
		const workflowManager = new WorkflowManager(
			app as never,
			taskManager,
			canvasWriter,
			settings
		);

		await workflowManager.createWorkflow("alpha");

		expect(app.vault.getFolderByPath("Projects/Workflows")).not.toBeNull();
		expect(app.vault.getFolderByPath("Projects/Workflows/Active")).not.toBeNull();
		expect(
			app.vault.getFolderByPath("Projects/Workflows/Active/alpha")
		).not.toBeNull();
		expect(
			app.vault.getFileByPath("Projects/Workflows/Active/alpha.canvas")
		).not.toBeNull();
	});
});

function createFakeApp(): { vault: FakeVault } {
	return {
		vault: new FakeVault(),
	};
}

function createTemplateRegistryStub(templates: TemplateSchema[]): {
	getTemplate(name: string): TemplateSchema | null;
} {
	return {
		getTemplate(name: string): TemplateSchema | null {
			return templates.find((template) => template.name === name) ?? null;
		},
	};
}

async function readFileContent(vault: FakeVault, path: string): Promise<string> {
	const file = vault.getFileByPath(path);
	if (!file) {
		throw new Error(`Missing file "${path}".`);
	}

	return vault.read(file);
}

function createFile(path: string): FakeFile {
	return {
		path,
		basename: getBasename(path),
		extension: path.split(".").at(-1) ?? "",
		stat: {},
	};
}

function createFolder(path: string): FakeFolder {
	return {
		path,
		children: [],
	};
}

function getParentPath(path: string): string {
	return path.split("/").slice(0, -1).join("/");
}

function getBasename(path: string): string {
	return path.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? path;
}

function isFakeFolder(file: FakeAbstractFile): file is FakeFolder {
	return "children" in file;
}
