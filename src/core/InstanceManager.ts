import type { App, TFile } from "obsidian";

import { stripFrontmatter, updateFrontmatter } from "./frontmatter";
import { generateInstanceId } from "./instanceUtils";
import type { TemplateRegistry } from "./TemplateRegistry";
import { buildIronflowTask } from "./taskUtils";
import type { WorkflowManager } from "./WorkflowManager";
import {
	getInstancePath,
	getInstanceTaskPath,
	getInstancesFolderPath,
} from "./workflowPaths";
import type {
	IronflowSettings,
	IronflowTask,
	WorkflowInstance,
	WorkflowInstanceTaskStatus,
} from "../types";

/**
 * Create active workflow instances from workflow definitions.
 */
export class InstanceManager {
	constructor(
		private readonly app: App,
		private readonly workflowManager: WorkflowManager,
		private readonly templateRegistry: TemplateRegistry,
		private readonly settings: IronflowSettings
	) {}

	/**
	 * Create an active workflow instance from a workflow definition.
	 */
	async createInstance(
		workflowName: string,
		fieldValues: Record<string, Record<string, unknown>>,
		instanceName?: string
	): Promise<WorkflowInstance> {
		const workflow = await this.workflowManager.getWorkflow(workflowName);
		if (!workflow) {
			throw new Error(`Workflow "${workflowName}" does not exist.`);
		}
		if (workflow.tasks.length === 0) {
			throw new Error(`Workflow "${workflowName}" has no tasks.`);
		}

		const instanceId = instanceName ?? generateInstanceId();
		const instancePath = getInstancePath(
			this.settings.workflowFolder,
			workflowName,
			instanceId
		);
		if (this.app.vault.getAbstractFileByPath(instancePath)) {
			throw new Error(
				`Instance "${instanceId}" already exists for workflow "${workflowName}".`
			);
		}

		await this.ensureInstancesFolderExists(workflowName);
		await this.app.vault.createFolder(instancePath);

		// Instance creation is not atomic. If a later task fails, any files already
		// created in the instance directory are left in place for explicit cleanup.
		const tasks: IronflowTask[] = [];
		for (const task of workflow.tasks) {
			const taskFieldValues = fieldValues[task.name] ?? {};
			this.validateTaskFieldValues(task.name, task.frontmatter, taskFieldValues);

			const templateBody = await this.readTemplateBody(
				task.frontmatter["ironflow-template"],
				task.name
			);
			const instanceTaskPath = getInstanceTaskPath(
				this.settings.workflowFolder,
				workflowName,
				instanceId,
				task.name
			);
			const instanceStatus = getInitialTaskStatus(task);
			const completeFrontmatter = {
				...task.frontmatter,
				...getUserFieldValues(taskFieldValues),
				"ironflow-instance-id": instanceId,
				"ironflow-status": instanceStatus,
			};
			const instanceContent = `${updateFrontmatter("", completeFrontmatter)}${templateBody}`;

			await this.app.vault.create(instanceTaskPath, instanceContent);
			tasks.push(buildIronflowTask(instanceTaskPath, completeFrontmatter));
		}

		return {
			instanceId,
			workflowName,
			instancePath,
			tasks,
		};
	}

	private async ensureInstancesFolderExists(workflowName: string): Promise<void> {
		const instancesFolderPath = getInstancesFolderPath(
			this.settings.workflowFolder,
			workflowName
		);
		if (this.app.vault.getFolderByPath(instancesFolderPath)) {
			return;
		}

		await this.app.vault.createFolder(instancesFolderPath);
	}

	private async readTemplateBody(
		templateName: string,
		taskName: string
	): Promise<string> {
		const template = this.templateRegistry.getTemplate(templateName);
		if (!template) {
			throw new Error(
				`Template "${templateName}" for task "${taskName}" was not found.`
			);
		}

		const templateFile = this.app.vault.getFileByPath(template.filePath);
		if (!templateFile) {
			throw new Error(`Template file "${template.filePath}" was not found.`);
		}

		return stripFrontmatter(await this.app.vault.read(templateFile as TFile));
	}

	private validateTaskFieldValues(
		taskName: string,
		frontmatter: Record<string, unknown>,
		taskFieldValues: Record<string, unknown>
	): void {
		const missingFields = Object.keys(frontmatter).filter(
			(key) =>
				!isManagedIronflowField(key) &&
				!Object.prototype.hasOwnProperty.call(taskFieldValues, key)
		);
		if (missingFields.length === 0) {
			return;
		}

		throw new Error(
			`Task "${taskName}" is missing required field values: ${missingFields.join(", ")}.`
		);
	}
}

function isManagedIronflowField(key: string): boolean {
	return key.startsWith("ironflow-");
}

function getUserFieldValues(
	fieldValues: Record<string, unknown>
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(fieldValues).filter(([key]) => !isManagedIronflowField(key))
	);
}

function getInitialTaskStatus(task: IronflowTask): WorkflowInstanceTaskStatus {
	return task.frontmatter["ironflow-depends-on"].length === 0 ? "open" : "pending";
}
