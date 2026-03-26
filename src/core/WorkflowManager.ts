import type { App, TAbstractFile, TFile, TFolder } from "obsidian";
import type { CanvasData, CanvasFileData } from "obsidian/canvas";

import type { CanvasWriter } from "./CanvasWriter";
import type { TaskManager } from "./TaskManager";
import { getTaskNameFromLink } from "./taskUtils";
import { isCanvasFile, readCanvasData } from "./vaultUtils";
import {
	getWorkflowCanvasPath,
	getWorkflowRootPath,
	getWorkflowTaskFolderPath,
	getWorkflowTaskPath,
} from "./workflowPaths";
import type {
	IronflowSettings,
	IronflowTask,
	IronflowWorkflow,
} from "../types";

const DEFAULT_NODE_HEIGHT = 300;
const DEFAULT_NODE_WIDTH = 400;
const NODE_HORIZONTAL_GAP = 100;

/**
 * Workflow-level CRUD operations for canvas files and task folders.
 */
export class WorkflowManager {
	constructor(
		private readonly app: App,
		private readonly taskManager: TaskManager,
		private readonly canvasWriter: CanvasWriter,
		private readonly settings: IronflowSettings
	) {}

	/**
	 * Create a new workflow definition.
	 */
	async createWorkflow(name: string): Promise<IronflowWorkflow> {
		const rootFolderPath = getWorkflowRootPath(this.settings.workflowFolder);
		await ensureFolderExists(this.app, rootFolderPath);

		const taskFolderPath = getWorkflowTaskFolderPath(
			this.settings.workflowFolder,
			name
		);
		const canvasPath = getWorkflowCanvasPath(this.settings.workflowFolder, name);

		if (this.app.vault.getAbstractFileByPath(taskFolderPath)) {
			throw new Error(`Workflow "${name}" already exists.`);
		}
		if (this.app.vault.getAbstractFileByPath(canvasPath)) {
			throw new Error(`Workflow "${name}" already exists.`);
		}

		await this.app.vault.createFolder(taskFolderPath);
		await this.app.vault.create(
			canvasPath,
			`${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`
		);

		return {
			name,
			canvasPath,
			taskFolderPath,
			tasks: [],
		};
	}

	/**
	 * Read one workflow definition from the vault.
	 */
	async getWorkflow(name: string): Promise<IronflowWorkflow | null> {
		const canvasPath = getWorkflowCanvasPath(this.settings.workflowFolder, name);
		const taskFolderPath = getWorkflowTaskFolderPath(
			this.settings.workflowFolder,
			name
		);
		const canvasFile = this.app.vault.getFileByPath(canvasPath);
		const taskFolder = this.app.vault.getFolderByPath(taskFolderPath);
		if (!canvasFile || !taskFolder) {
			return null;
		}

		const canvasData = await readCanvasData(this.app, canvasFile);
		const fileNodeIds = new Map<string, string>();
		for (const node of canvasData.nodes) {
			if (node.type === "file" && typeof node.file === "string") {
				fileNodeIds.set(node.file, node.id);
			}
		}

		const tasks = await this.taskManager.getWorkflowTasks(name);
		const workflowTasks = tasks.map((task) => ({
			...task,
			canvasNodeId: fileNodeIds.get(task.filePath) ?? null,
		}));

		return {
			name,
			canvasPath,
			taskFolderPath,
			tasks: workflowTasks,
		};
	}

	/**
	 * List all workflows under the configured workflow root.
	 */
	async listWorkflows(): Promise<IronflowWorkflow[]> {
		const workflowRoot = this.app.vault.getFolderByPath(
			getWorkflowRootPath(this.settings.workflowFolder)
		);
		if (!workflowRoot) {
			return [];
		}

		const canvasFiles = workflowRoot.children
			.filter(isCanvasFile)
			.sort((left, right) => left.path.localeCompare(right.path));
		const workflows = await Promise.all(
			canvasFiles.map((file) => this.getWorkflow(file.basename))
		);
		return workflows.filter(
			(workflow): workflow is IronflowWorkflow => workflow !== null
		);
	}

	/**
	 * Create a task and add its node to the workflow canvas.
	 */
	async addTaskToWorkflow(
		workflowName: string,
		taskName: string,
		templateName: string,
		position?: { x: number; y: number }
	): Promise<IronflowTask> {
		const workflow = await this.getWorkflow(workflowName);
		if (!workflow) {
			throw new Error(`Workflow "${workflowName}" does not exist.`);
		}

		if (workflow.tasks.some((task) => task.name === taskName)) {
			throw new Error(
				`Task "${taskName}" already exists in workflow "${workflowName}".`
			);
		}

		const task = await this.taskManager.createTask(
			workflowName,
			taskName,
			templateName
		);
		const canvasFile = this.app.vault.getFileByPath(workflow.canvasPath);
		if (!canvasFile) {
			throw new Error(`Workflow canvas "${workflow.canvasPath}" was not found.`);
		}

		const canvasData = await readCanvasData(this.app, canvasFile);
		const nextPosition =
			position ?? getNextNodePosition(canvasData.nodes.filter(isFileNode));
		const nextNode: CanvasFileData = {
			id: createCanvasNodeId(),
			type: "file",
			file: task.filePath,
			x: nextPosition.x,
			y: nextPosition.y,
			width: DEFAULT_NODE_WIDTH,
			height: DEFAULT_NODE_HEIGHT,
		};

		const nextCanvasData: CanvasData = {
			...canvasData,
			nodes: [...canvasData.nodes, nextNode],
		};
		await this.app.vault.modify(
			canvasFile,
			`${JSON.stringify(nextCanvasData, null, 2)}\n`
		);

		return {
			...task,
			canvasNodeId: nextNode.id,
		};
	}

	/**
	 * Remove a task from the workflow and clean related references.
	 */
	async removeTaskFromWorkflow(
		workflowName: string,
		taskName: string
	): Promise<void> {
		const workflow = await this.getWorkflow(workflowName);
		if (!workflow) {
			throw new Error(`Workflow "${workflowName}" does not exist.`);
		}

		const taskToRemove = workflow.tasks.find((task) => task.name === taskName);
		if (!taskToRemove) {
			throw new Error(
				`Task "${taskName}" was not found in workflow "${workflowName}".`
			);
		}

		const canvasFile = this.app.vault.getFileByPath(workflow.canvasPath);
		if (!canvasFile) {
			throw new Error(`Workflow canvas "${workflow.canvasPath}" was not found.`);
		}

		const canvasData = await readCanvasData(this.app, canvasFile);
		const nextNodes = canvasData.nodes.filter(
			(node) => !(node.type === "file" && node.file === taskToRemove.filePath)
		);
		const nodeIdToRemove = taskToRemove.canvasNodeId;
		const nextEdges = nodeIdToRemove
			? canvasData.edges.filter(
					(edge) =>
						edge.fromNode !== nodeIdToRemove && edge.toNode !== nodeIdToRemove
			  )
			: canvasData.edges;

		for (const siblingTask of workflow.tasks) {
			if (siblingTask.filePath === taskToRemove.filePath) {
				continue;
			}

			const originalDependsOn = siblingTask.frontmatter["ironflow-depends-on"];
			const originalNextTasks = siblingTask.frontmatter["ironflow-next-tasks"];
			const dependsOn = siblingTask.frontmatter["ironflow-depends-on"].filter(
				(link) => getTaskNameFromLink(link) !== taskToRemove.name
			);
			const nextTasks = siblingTask.frontmatter["ironflow-next-tasks"].filter(
				(link) => getTaskNameFromLink(link) !== taskToRemove.name
			);
			const dependenciesChanged =
				dependsOn.length !== originalDependsOn.length ||
				nextTasks.length !== originalNextTasks.length;
			if (!dependenciesChanged) {
				continue;
			}

			await this.taskManager.updateTaskFrontmatter(siblingTask.filePath, {
				"ironflow-depends-on": dependsOn,
				"ironflow-next-tasks": nextTasks,
			});
		}

		await this.app.vault.modify(
			canvasFile,
			`${JSON.stringify({ ...canvasData, nodes: nextNodes, edges: nextEdges }, null, 2)}\n`
		);
		await this.taskManager.deleteTask(taskToRemove.filePath);
	}

	/**
	 * Delete a workflow canvas file and its task folder.
	 */
	async deleteWorkflow(name: string): Promise<void> {
		const canvasFile = this.app.vault.getFileByPath(
			getWorkflowCanvasPath(this.settings.workflowFolder, name)
		);
		const taskFolder = this.app.vault.getFolderByPath(
			getWorkflowTaskFolderPath(this.settings.workflowFolder, name)
		);
		if (!canvasFile || !taskFolder) {
			throw new Error(`Workflow "${name}" does not exist.`);
		}

		await this.app.vault.delete(canvasFile);
		await this.app.vault.delete(taskFolder, true);
	}
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	if (app.vault.getFolderByPath(folderPath)) {
		return;
	}

	const segments = folderPath.split("/").filter((segment) => segment.length > 0);
	let currentPath = "";
	for (const segment of segments) {
		currentPath = currentPath ? `${currentPath}/${segment}` : segment;
		if (!app.vault.getFolderByPath(currentPath)) {
			await app.vault.createFolder(currentPath);
		}
	}
}

function getNextNodePosition(
	nodes: CanvasFileData[]
): { x: number; y: number } {
	if (nodes.length === 0) {
		return { x: 0, y: 0 };
	}

	const rightmostNode = nodes.reduce((currentRightmost, node) =>
		node.x + node.width > currentRightmost.x + currentRightmost.width
			? node
			: currentRightmost
	);
	return {
		x: rightmostNode.x + rightmostNode.width + NODE_HORIZONTAL_GAP,
		y: rightmostNode.y,
	};
}

function createCanvasNodeId(): string {
	return Math.random().toString(16).slice(2, 18).padEnd(16, "0");
}

function isFileNode(node: CanvasData["nodes"][number]): node is CanvasFileData {
	return node.type === "file";
}
