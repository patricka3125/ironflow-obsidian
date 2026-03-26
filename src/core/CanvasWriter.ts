import type { App, TAbstractFile, TFile, TFolder } from "obsidian";
import type { CanvasData, CanvasEdgeData } from "obsidian/canvas";

import { parseFrontmatter } from "./frontmatter";
import { buildIronflowTask, getTaskNameFromLink } from "./taskUtils";
import { listMarkdownFiles, parseCanvasData } from "./vaultUtils";
import {
	getWorkflowCanvasPath,
	getWorkflowTaskFolderPath,
} from "./workflowPaths";
import type { IronflowSettings, IronflowTask } from "../types";

const IRONFLOW_EDGE_PREFIX = "ironflow-edge-";

/**
 * Sync Ironflow dependency edges into workflow canvas files.
 */
export class CanvasWriter {
	constructor(
		private readonly app: App,
		private readonly settings: IronflowSettings
	) {}

	/**
	 * Compute canvas edges for a set of tasks and node ids.
	 */
	computeEdges(
		tasks: IronflowTask[],
		nodeMap: Map<string, string>
	): CanvasEdgeData[] {
		const tasksByName = new Map(tasks.map((task) => [task.name, task]));
		const edges = new Map<string, CanvasEdgeData>();

		for (const task of tasks) {
			const fromNodeId = nodeMap.get(task.filePath);
			if (!fromNodeId) {
				continue;
			}

			for (const nextTaskLink of task.frontmatter["ironflow-next-tasks"]) {
				const nextTaskName = getTaskNameFromLink(nextTaskLink);
				if (!nextTaskName) {
					continue;
				}

				const nextTask = tasksByName.get(nextTaskName);
				if (!nextTask) {
					continue;
				}

				const toNodeId = nodeMap.get(nextTask.filePath);
				if (!toNodeId) {
					continue;
				}

				const edgeId = `${IRONFLOW_EDGE_PREFIX}${fromNodeId}-${toNodeId}`;
				edges.set(edgeId, {
					id: edgeId,
					fromNode: fromNodeId,
					toNode: toNodeId,
					fromSide: "right",
					toSide: "left",
					toEnd: "arrow",
				});
			}
		}

		return Array.from(edges.values()).sort((left, right) =>
			left.id.localeCompare(right.id)
		);
	}

	/**
	 * Replace Ironflow-managed edges in one workflow canvas file.
	 */
	async syncEdges(workflowName: string): Promise<void> {
		const canvasPath = getWorkflowCanvasPath(
			this.settings.workflowFolder,
			workflowName
		);
		const canvasFile = this.app.vault.getFileByPath(canvasPath);
		if (!canvasFile) {
			throw new Error(`Workflow canvas "${canvasPath}" was not found.`);
		}

		const canvasContent = await this.app.vault.read(canvasFile);
		const canvasData = parseCanvasData(canvasContent, canvasPath);
		const tasks = await this.readWorkflowTasks(workflowName);
		const nodeMap = new Map<string, string>();

		for (const node of canvasData.nodes) {
			if (node.type === "file" && typeof node.file === "string") {
				nodeMap.set(node.file, node.id);
			}
		}

		const userEdges = canvasData.edges.filter(
			(edge) => !edge.id.startsWith(IRONFLOW_EDGE_PREFIX)
		);
		const ironflowEdges = this.computeEdges(tasks, nodeMap);
		const nextCanvasData: CanvasData = {
			...canvasData,
			edges: [...userEdges, ...ironflowEdges],
		};

		await this.app.vault.modify(
			canvasFile,
			`${JSON.stringify(nextCanvasData, null, 2)}\n`
		);
	}

	private async readWorkflowTasks(workflowName: string): Promise<IronflowTask[]> {
		const workflowFolder = this.app.vault.getFolderByPath(
			getWorkflowTaskFolderPath(this.settings.workflowFolder, workflowName)
		);
		if (!workflowFolder) {
			return [];
		}

		const taskFiles = listMarkdownFiles(workflowFolder).sort((left, right) =>
			left.path.localeCompare(right.path)
		);
		return Promise.all(
			taskFiles.map(async (file) => {
				const content = await this.app.vault.read(file);
				return buildIronflowTask(file.path, parseFrontmatter(content));
			})
		);
	}
}
