import { Modal, Notice, Setting, type TFile } from "obsidian";

import { getWorkflowNameFromCanvasPath } from "../core/workflowPaths";
import type IronflowPlugin from "../main";

/**
 * Modal for removing a task from the active workflow.
 */
export class RemoveTaskModal extends Modal {
	private selectedTaskName = "";
	private readonly plugin: IronflowPlugin;
	private readonly activeWorkflowName: string | null;

	constructor(app: IronflowPlugin["app"], plugin: IronflowPlugin) {
		super(app);
		this.plugin = plugin;
		this.activeWorkflowName = inferActiveWorkflowName(
			this.app.workspace.getActiveFile(),
			this.plugin.settings.workflowFolder
		);
	}

	/**
	 * Render the modal form.
	 */
	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.modalEl.addClass("ironflow-modal");
		this.titleEl.setText("Remove Task");

		if (!this.activeWorkflowName) {
			this.contentEl
				.createDiv({ cls: "ironflow-empty-hint" })
				.setText("Open a workflow canvas before removing a task.");
			return;
		}

		const workflow = await this.plugin.workflowManager?.getWorkflow(
			this.activeWorkflowName
		);
		if (!workflow || workflow.tasks.length === 0) {
			this.contentEl
				.createDiv({ cls: "ironflow-empty-hint" })
				.setText("This workflow has no tasks to remove.");
			return;
		}

		this.selectedTaskName = workflow.tasks[0]?.name ?? "";

		new Setting(this.contentEl)
			.setName("Workflow")
			.setDesc(this.activeWorkflowName);

		new Setting(this.contentEl)
			.setName("Task")
			.addDropdown((dropdown) => {
				for (const task of workflow.tasks) {
					dropdown.addOption(task.name, task.name);
				}

				if (this.selectedTaskName) {
					dropdown.setValue(this.selectedTaskName);
				}

				dropdown.onChange((value) => {
					this.selectedTaskName = value;
				});
			});

		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText("Remove")
				.setWarning()
				.onClick(() => {
					void this.submit();
				})
		);
	}

	/**
	 * Return the inferred active workflow name.
	 */
	getActiveWorkflowName(): string | null {
		return this.activeWorkflowName;
	}

	/**
	 * Return the currently selected task name.
	 */
	getSelectedTaskName(): string {
		return this.selectedTaskName;
	}

	/**
	 * Update the selected task name.
	 */
	setSelectedTaskName(value: string): void {
		this.selectedTaskName = value;
	}

	/**
	 * Validate and execute the removal.
	 */
	async submit(): Promise<boolean> {
		try {
			if (!this.plugin.workflowManager) {
				new Notice("Ironflow workflow services are not available.");
				return false;
			}

			if (!this.activeWorkflowName) {
				new Notice("Open a workflow canvas before removing a task.");
				return false;
			}

			if (!this.selectedTaskName) {
				new Notice("Select a task to remove.");
				return false;
			}

			await this.plugin.workflowManager.removeTaskFromWorkflow(
				this.activeWorkflowName,
				this.selectedTaskName
			);
			new Notice(
				`Task "${this.selectedTaskName}" removed from "${this.activeWorkflowName}".`
			);
			this.close();
			return true;
		} catch (error) {
			new Notice(
				`Failed to remove task: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
			return false;
		}
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
