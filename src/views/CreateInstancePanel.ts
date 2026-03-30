import {
	ButtonComponent,
	ItemView,
	Notice,
	Setting,
	type TextComponent,
	type WorkspaceLeaf,
} from "obsidian";

import { getUserFieldValues } from "../core/taskUtils";
import type { IronflowWorkflow } from "../types";
import type IronflowPlugin from "../main";

const DATAVIEW_NOTICE =
	"Install the Dataview plugin for a live task table in the instance base note.";

/**
 * Side panel for confirming workflow instance creation.
 */
export class CreateInstancePanel extends ItemView {
	static readonly VIEW_TYPE = "ironflow-create-instance";

	private workflow: IronflowWorkflow | null = null;
	private workflowName: string | null = null;
	private instanceNameValue = "";
	private instanceNameInput: TextComponent | null = null;
	private createButton: ButtonComponent | null = null;
	private readonly plugin: IronflowPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: IronflowPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	/**
	 * Obsidian view id.
	 */
	getViewType(): string {
		return CreateInstancePanel.VIEW_TYPE;
	}

	/**
	 * Human-readable view name.
	 */
	getDisplayText(): string {
		return "Create Workflow Instance";
	}

	/**
	 * Obsidian icon id for the view.
	 */
	getIcon(): string {
		return "play";
	}

	/**
	 * Render the initial empty state.
	 */
	async onOpen(): Promise<void> {
		this.renderEmptyState();
	}

	/**
	 * Reset panel state and clear rendered content.
	 */
	async onClose(): Promise<void> {
		this.workflow = null;
		this.workflowName = null;
		this.instanceNameValue = "";
		this.instanceNameInput = null;
		this.createButton = null;
		this.containerEl.empty();
	}

	/**
	 * Load one workflow into the panel and render the creation form.
	 */
	async loadWorkflow(workflowName: string): Promise<void> {
		if (!this.plugin.workflowManager) {
			new Notice("Workflow manager is unavailable.");
			this.renderEmptyState();
			return;
		}

		const workflow = await this.plugin.workflowManager.getWorkflow(workflowName);
		if (!workflow) {
			new Notice(`Workflow "${workflowName}" not found.`);
			this.renderEmptyState();
			return;
		}

		this.workflow = workflow;
		this.workflowName = workflow.name;
		this.instanceNameValue = "";
		this.renderForm();
	}

	private renderEmptyState(): void {
		this.workflow = null;
		this.workflowName = null;
		this.instanceNameValue = "";
		this.instanceNameInput = null;
		this.createButton = null;
		this.containerEl.empty();
		this.containerEl.addClass("ironflow-create-instance-panel");
		this.containerEl
			.createDiv({ cls: "ironflow-empty-state" })
			.setText("Click the play button on a workflow canvas to start.");
	}

	private renderForm(): void {
		if (!this.workflow) {
			this.renderEmptyState();
			return;
		}

		this.instanceNameInput = null;
		this.createButton = null;
		this.containerEl.empty();
		this.containerEl.addClass("ironflow-create-instance-panel");
		this.containerEl.createEl("h3", { text: this.workflow.name });

		new Setting(this.containerEl)
			.setName("Workflow")
			.setDesc(this.workflow.name);

		new Setting(this.containerEl)
			.setName("Instance name")
			.addText((text) => {
				this.instanceNameInput = text;
				text
					.setPlaceholder("run-xxxx (auto-generated)")
					.setValue(this.instanceNameValue)
					.onChange((value) => {
						this.instanceNameValue = value;
					});
			});

		new Setting(this.containerEl).addButton((button) => {
			this.createButton = button;
			button
				.setButtonText("Create Instance")
				.setCta()
				.onClick(() => {
					void this.handleCreate();
				});
		});
	}

	private async handleCreate(): Promise<void> {
		if (!this.workflow || !this.plugin.instanceManager) {
			new Notice("Instance creation is unavailable.");
			return;
		}

		this.createButton?.setDisabled(true);
		try {
			const instance = await this.plugin.instanceManager.createInstance(
				this.workflow.name,
				extractFieldValues(this.workflow),
				this.getRequestedInstanceName()
			);
			const folderNote =
				await this.plugin.instanceManager.createInstanceFolderNote(instance);

			new Notice(`Instance '${instance.instanceId}' created for ${this.workflow.name}`);
			if (!this.plugin.isDataviewEnabled()) {
				new Notice(DATAVIEW_NOTICE);
			}

			await this.app.workspace.getLeaf(true).openFile(folderNote);
			this.renderEmptyState();
		} catch (error) {
			new Notice(
				error instanceof Error
					? error.message
					: "Failed to create the workflow instance."
			);
			this.createButton?.setDisabled(false);
		}
	}

	private getRequestedInstanceName(): string | undefined {
		const trimmedName = this.instanceNameValue.trim();
		return trimmedName.length > 0 ? trimmedName : undefined;
	}
}

function extractFieldValues(
	workflow: IronflowWorkflow
): Record<string, Record<string, unknown>> {
	return Object.fromEntries(
		workflow.tasks.map((task) => [task.name, getUserFieldValues(task.frontmatter)])
	);
}
