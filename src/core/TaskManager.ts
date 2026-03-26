import type { App, TAbstractFile, TFile, TFolder } from "obsidian";

import { parseFrontmatter, updateFrontmatter } from "./frontmatter";
import type { TemplateRegistry } from "./TemplateRegistry";
import {
	buildIronflowTask,
} from "./taskUtils";
import { isFolder, isMarkdownFile, listMarkdownFiles } from "./vaultUtils";
import {
	getWorkflowTaskFolderPath,
	getWorkflowTaskPath,
} from "./workflowPaths";
import type {
	IronflowSettings,
	IronflowTask,
	IronflowTaskFrontmatter,
} from "../types";

/**
 * CRUD operations for workflow task template markdown files.
 */
export class TaskManager {
	constructor(
		private readonly app: App,
		private readonly templateRegistry: TemplateRegistry,
		private readonly settings: IronflowSettings
	) {}

	/**
	 * Create a task markdown file from a registered template.
	 */
	async createTask(
		workflowName: string,
		taskName: string,
		templateName: string
	): Promise<IronflowTask> {
		const template = this.templateRegistry.getTemplate(templateName);
		if (!template) {
			throw new Error(`Template "${templateName}" was not found.`);
		}

		const templateFile = this.app.vault.getFileByPath(template.filePath);
		if (!templateFile) {
			throw new Error(`Template file "${template.filePath}" was not found.`);
		}

		const workflowFolderPath = getWorkflowTaskFolderPath(
			this.settings.workflowFolder,
			workflowName
		);
		const workflowFolder = this.app.vault.getFolderByPath(workflowFolderPath);
		if (!workflowFolder) {
			throw new Error(`Workflow "${workflowName}" does not exist.`);
		}

		const taskPath = getWorkflowTaskPath(
			this.settings.workflowFolder,
			workflowName,
			taskName
		);
		if (this.app.vault.getAbstractFileByPath(taskPath)) {
			throw new Error(
				`Task "${taskName}" already exists in workflow "${workflowName}".`
			);
		}

		const templateContent = await this.app.vault.read(templateFile);
		const templateFrontmatter = parseFrontmatter(templateContent);
		const taskContent = updateFrontmatter("", {
			"ironflow-template": templateName,
			"ironflow-workflow": workflowName,
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": [],
			...removeManagedIronflowFields(templateFrontmatter),
		});

		await this.app.vault.create(taskPath, taskContent);

		const createdTask = await this.getTask(taskPath);
		if (!createdTask) {
			throw new Error(`Task "${taskName}" could not be read after creation.`);
		}

		return createdTask;
	}

	/**
	 * Read one task markdown file from the vault.
	 */
	async getTask(filePath: string): Promise<IronflowTask | null> {
		const file = this.app.vault.getFileByPath(filePath);
		if (!file) {
			return null;
		}

		const content = await this.app.vault.read(file);
		const frontmatter = parseFrontmatter(content);
		return buildIronflowTask(file.path, frontmatter);
	}

	/**
	 * Update selected frontmatter keys on a task file.
	 */
	async updateTaskFrontmatter(
		filePath: string,
		updates: Partial<IronflowTaskFrontmatter>
	): Promise<void> {
		const file = this.app.vault.getFileByPath(filePath);
		if (!file) {
			throw new Error(`Task file "${filePath}" was not found.`);
		}

		const content = await this.app.vault.read(file);
		const nextContent = updateFrontmatter(content, updates as Record<string, unknown>);
		await this.app.vault.modify(file, nextContent);
	}

	/**
	 * Delete one task file from the vault.
	 */
	async deleteTask(filePath: string): Promise<void> {
		const file = this.app.vault.getFileByPath(filePath);
		if (!file) {
			throw new Error(`Task file "${filePath}" was not found.`);
		}

		await this.app.vault.delete(file);
	}

	/**
	 * Return all markdown task files in one workflow folder.
	 */
	async getWorkflowTasks(workflowName: string): Promise<IronflowTask[]> {
		const workflowFolder = this.app.vault.getFolderByPath(
			getWorkflowTaskFolderPath(this.settings.workflowFolder, workflowName)
		);
		if (!workflowFolder) {
			return [];
		}

		const taskFiles = listMarkdownFiles(workflowFolder).sort((left, right) =>
			left.path.localeCompare(right.path)
		);
		const tasks = await Promise.all(
			taskFiles.map(async (file) => {
				const content = await this.app.vault.read(file);
				return buildIronflowTask(file.path, parseFrontmatter(content));
			})
		);

		return tasks;
	}

}

function removeManagedIronflowFields(
	frontmatter: Record<string, unknown>
): Record<string, unknown> {
	const sanitizedFrontmatter = { ...frontmatter };
	delete sanitizedFrontmatter["ironflow-template"];
	delete sanitizedFrontmatter["ironflow-workflow"];
	delete sanitizedFrontmatter["ironflow-agent-profile"];
	delete sanitizedFrontmatter["ironflow-depends-on"];
	delete sanitizedFrontmatter["ironflow-next-tasks"];
	return sanitizedFrontmatter;
}
