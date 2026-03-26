import { Modal, Notice, Setting, type TFile } from "obsidian";

import {
	getWorkflowNameFromCanvasPath,
} from "../core/workflowPaths";
import type IronflowPlugin from "../main";

export type WorkflowCommandModalMode = "create-workflow" | "add-task";

/**
 * Modal used for workflow creation and task creation commands.
 */
export class WorkflowCommandModal extends Modal {
	private nameValue = "";
	private selectedTemplateName = "";
	private readonly mode: WorkflowCommandModalMode;
	private readonly plugin: IronflowPlugin;
	private readonly activeWorkflowName: string | null;

	constructor(
		app: IronflowPlugin["app"],
		plugin: IronflowPlugin,
		mode: WorkflowCommandModalMode
	) {
		super(app);
		this.plugin = plugin;
		this.mode = mode;
		this.activeWorkflowName = inferActiveWorkflowName(
			this.app.workspace.getActiveFile(),
			this.plugin.settings.workflowFolder
		);
		this.selectedTemplateName =
			this.plugin.templateRegistry?.getTemplates()[0]?.name ?? "";
	}

	/**
	 * Render the modal form.
	 */
	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.titleEl.setText(
			this.mode === "create-workflow" ? "New Workflow" : "Add Task"
		);

		new Setting(this.contentEl)
			.setName(this.mode === "create-workflow" ? "Workflow name" : "Task name")
			.addText((text) =>
				text.setValue(this.nameValue).onChange((value) => {
					this.nameValue = value;
				})
			);

		if (this.mode === "add-task") {
			new Setting(this.contentEl)
				.setName("Workflow")
				.setDesc(this.activeWorkflowName ?? "Open a workflow canvas to select one.");

			new Setting(this.contentEl)
				.setName("Template")
				.addDropdown((dropdown) => {
					for (const template of this.plugin.templateRegistry?.getTemplates() ?? []) {
						dropdown.addOption(template.name, template.name);
					}

					if (this.selectedTemplateName) {
						dropdown.setValue(this.selectedTemplateName);
					}

					dropdown.onChange((value) => {
						this.selectedTemplateName = value;
					});
				});
		}

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(this.mode === "create-workflow" ? "Create" : "Add")
				.setCta()
				.onClick(() => {
					void this.submit();
				})
		);
	}

	/**
	 * Update the name field value.
	 */
	setNameValue(value: string): void {
		this.nameValue = value;
	}

	/**
	 * Update the selected template value.
	 */
	setSelectedTemplateName(value: string): void {
		this.selectedTemplateName = value;
	}

	/**
	 * Return the inferred active workflow name.
	 */
	getActiveWorkflowName(): string | null {
		return this.activeWorkflowName;
	}

	/**
	 * Validate and execute the modal action.
	 */
	async submit(): Promise<boolean> {
		const trimmedName = this.nameValue.trim();
		if (!trimmedName) {
			new Notice("Enter a name before submitting.");
			return false;
		}

		if (this.mode === "create-workflow") {
			return this.createWorkflow(trimmedName);
		}

		return this.addTask(trimmedName);
	}

	private async createWorkflow(name: string): Promise<boolean> {
		if (!this.plugin.workflowManager) {
			new Notice("Ironflow workflow services are not available.");
			return false;
		}

		const existingWorkflow = await this.plugin.workflowManager.getWorkflow(name);
		if (existingWorkflow) {
			new Notice(`Workflow "${name}" already exists.`);
			return false;
		}

		const workflow = await this.plugin.workflowManager.createWorkflow(name);
		const canvasFile = this.app.vault.getFileByPath(workflow.canvasPath);
		if (canvasFile) {
			await this.app.workspace.getLeaf(true).openFile(canvasFile);
		}

		this.close();
		return true;
	}

	private async addTask(taskName: string): Promise<boolean> {
		if (!this.plugin.workflowManager) {
			new Notice("Ironflow workflow services are not available.");
			return false;
		}

		if (!this.activeWorkflowName) {
			new Notice("Open a workflow canvas before adding a task.");
			return false;
		}

		if (!this.selectedTemplateName) {
			new Notice("Select a template before adding a task.");
			return false;
		}

		const workflow = await this.plugin.workflowManager.getWorkflow(
			this.activeWorkflowName
		);
		if (!workflow) {
			new Notice(`Workflow "${this.activeWorkflowName}" was not found.`);
			return false;
		}

		if (workflow.tasks.some((task) => task.name === taskName)) {
			new Notice(
				`Task "${taskName}" already exists in workflow "${this.activeWorkflowName}".`
			);
			return false;
		}

		await this.plugin.workflowManager.addTaskToWorkflow(
			this.activeWorkflowName,
			taskName,
			this.selectedTemplateName
		);
		this.close();
		return true;
	}
}

function inferActiveWorkflowName(
	activeFile: TFile | null,
	workflowFolder: string
): string | null {
	if (!activeFile) {
		return null;
	}

	return getWorkflowNameFromCanvasPath(workflowFolder, activeFile.path);
}
