import { ItemView, Notice, Setting, type WorkspaceLeaf } from "obsidian";

import { getTaskNameFromLink } from "../core/taskUtils";
import type { IronflowTask } from "../types";
import type IronflowPlugin from "../main";

type DependencyField = "ironflow-depends-on" | "ironflow-next-tasks";

/**
 * Side panel for editing one workflow task's properties.
 */
export class TaskPropertyPanel extends ItemView {
	static readonly VIEW_TYPE = "ironflow-task-properties";

	private currentTask: IronflowTask | null = null;
	private pendingUpdates: Record<string, unknown> = {};
	private pendingSaveTimer: ReturnType<typeof setTimeout> | null = null;
	private renderGeneration = 0;
	private readonly plugin: IronflowPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: IronflowPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	/**
	 * Obsidian view id.
	 */
	getViewType(): string {
		return TaskPropertyPanel.VIEW_TYPE;
	}

	/**
	 * Human-readable view name.
	 */
	getDisplayText(): string {
		return "Ironflow Task Properties";
	}

	/**
	 * Obsidian icon id for the view.
	 */
	getIcon(): string {
		return "list-checks";
	}

	/**
	 * Render the initial empty state.
	 */
	async onOpen(): Promise<void> {
		this.renderEmptyState();
	}

	/**
	 * Reset panel state and pending work.
	 */
	async onClose(): Promise<void> {
		if (this.pendingSaveTimer) {
			clearTimeout(this.pendingSaveTimer);
			this.pendingSaveTimer = null;
		}

		this.pendingUpdates = {};
		this.currentTask = null;
		this.containerEl.empty();
	}

	/**
	 * Return the task currently shown in the panel.
	 */
	getCurrentTask(): IronflowTask | null {
		return this.currentTask;
	}

	/**
	 * Return whether the panel is currently showing the provided file.
	 */
	isViewingTask(filePath: string): boolean {
		return this.currentTask?.filePath === filePath;
	}

	/**
	 * Reload the current task from disk and re-render the panel.
	 * Skips re-rendering when the frontmatter has not changed (e.g.,
	 * after the panel's own writes trigger a metadata cache event).
	 */
	async refreshCurrentTask(): Promise<void> {
		if (!this.currentTask || !this.plugin.taskManager) {
			return;
		}

		const refreshedTask = await this.plugin.taskManager.getTask(this.currentTask.filePath);
		if (!refreshedTask) {
			this.currentTask = null;
			this.renderEmptyState();
			return;
		}

		if (
			JSON.stringify(refreshedTask.frontmatter) ===
			JSON.stringify(this.currentTask.frontmatter)
		) {
			return;
		}

		await this.loadTask(refreshedTask);
	}

	/**
	 * Load a task into the panel and render all editable fields.
	 */
	async loadTask(task: IronflowTask): Promise<void> {
		const thisGeneration = ++this.renderGeneration;
		this.currentTask = task;
		this.pendingUpdates = {};
		if (this.pendingSaveTimer) {
			clearTimeout(this.pendingSaveTimer);
			this.pendingSaveTimer = null;
		}

		this.containerEl.empty();
		this.containerEl.addClass("ironflow-task-panel");
		this.containerEl.createDiv({ cls: "ironflow-task-name" }).setText(task.name);
		await this.renderCoreFields(task);
		if (this.renderGeneration !== thisGeneration) return;
		await this.renderDependencySection(task, "ironflow-depends-on", "Depends on");
		if (this.renderGeneration !== thisGeneration) return;
		await this.renderDependencySection(task, "ironflow-next-tasks", "Next tasks");
		if (this.renderGeneration !== thisGeneration) return;
		this.containerEl.createEl("hr", { cls: "ironflow-divider" });
		await this.renderTemplateFields(task);
	}

	/**
	 * Schedule a debounced agent profile update.
	 */
	updateAgentProfile(value: string): void {
		this.scheduleFrontmatterUpdate({
			"ironflow-agent-profile": value,
		});
	}

	/**
	 * Schedule a debounced template field update.
	 */
	updateTemplateField(key: string, value: unknown): void {
		this.scheduleFrontmatterUpdate({
			[key]: value,
		});
	}

	/**
	 * Add one dependency link and its reciprocal link.
	 */
	async addDependency(
		field: DependencyField,
		linkedTaskName: string
	): Promise<void> {
		if (!this.currentTask || !this.plugin.taskManager || !this.plugin.canvasWriter) {
			return;
		}

		const currentLinks = this.currentTask.frontmatter[field];
		const nextLinks = addUniqueLink(currentLinks, linkedTaskName);
		if (nextLinks.length === currentLinks.length) {
			return;
		}

		await this.plugin.taskManager.updateTaskFrontmatter(this.currentTask.filePath, {
			[field]: nextLinks,
		});
		await this.updateReciprocalDependency(field, linkedTaskName, true);
		await this.plugin.canvasWriter.syncEdges(
			this.currentTask.frontmatter["ironflow-workflow"]
		);
		await this.refreshCurrentTask();
	}

	/**
	 * Remove one dependency link and its reciprocal link.
	 */
	async removeDependency(
		field: DependencyField,
		linkedTaskName: string
	): Promise<void> {
		if (!this.currentTask || !this.plugin.taskManager || !this.plugin.canvasWriter) {
			return;
		}

		const currentLinks = this.currentTask.frontmatter[field];
		const nextLinks = currentLinks.filter(
			(link) => getTaskNameFromLink(link) !== linkedTaskName
		);
		if (nextLinks.length === currentLinks.length) {
			return;
		}

		await this.plugin.taskManager.updateTaskFrontmatter(this.currentTask.filePath, {
			[field]: nextLinks,
		});
		await this.updateReciprocalDependency(field, linkedTaskName, false);
		await this.plugin.canvasWriter.syncEdges(
			this.currentTask.frontmatter["ironflow-workflow"]
		);
		await this.refreshCurrentTask();
	}

	private renderEmptyState(): void {
		this.containerEl.empty();
		this.containerEl.addClass("ironflow-task-panel");
		this.containerEl
			.createDiv({ cls: "ironflow-empty-state" })
			.setText("Select a task node on a canvas to edit its properties");
	}

	private async renderCoreFields(task: IronflowTask): Promise<void> {
		new Setting(this.containerEl)
			.setName("Source template")
			.setDesc(task.frontmatter["ironflow-template"]);

		new Setting(this.containerEl)
			.setName("Agent profile")
			.addText((text) =>
				text
					.setValue(task.frontmatter["ironflow-agent-profile"])
					.onChange((value) => {
						this.updateAgentProfile(value);
					})
			);
	}

	private async renderDependencySection(
		task: IronflowTask,
		field: DependencyField,
		label: string
	): Promise<void> {
		const siblingTasks = await this.getSiblingTasks(task);
		const linkedTaskNames = task.frontmatter[field]
			.map((link) => getTaskNameFromLink(link))
			.filter((name): name is string => Boolean(name));

		this.containerEl.createDiv({ cls: "ironflow-section-label" }).setText(label);
		if (linkedTaskNames.length === 0) {
			this.containerEl
				.createDiv({ cls: "ironflow-empty-hint" })
				.setText(`No ${label.toLowerCase()} configured.`);
		}

		for (const linkedTaskName of linkedTaskNames) {
			new Setting(this.containerEl)
				.setClass("ironflow-dependency-row")
				.setName(linkedTaskName)
				.addButton((button) =>
					button.setButtonText("Remove").onClick(() => {
						void this.removeDependency(field, linkedTaskName);
					})
				);
		}

		let selectedTaskName =
			siblingTasks.find((candidate) => !linkedTaskNames.includes(candidate.name))?.name ??
			"";
		new Setting(this.containerEl)
			.setClass("ironflow-dependency-add")
			.setName(`Add ${label.toLowerCase()}`)
			.addDropdown((dropdown) => {
				for (const siblingTask of siblingTasks) {
					if (linkedTaskNames.includes(siblingTask.name)) {
						continue;
					}

					dropdown.addOption(siblingTask.name, siblingTask.name);
				}

				if (selectedTaskName) {
					dropdown.setValue(selectedTaskName);
				}

				dropdown.onChange((value) => {
					selectedTaskName = value;
				});
			})
			.addButton((button) =>
				button.setButtonText("Add").onClick(() => {
					if (!selectedTaskName) {
						new Notice("Select a task before adding a dependency.");
						return;
					}

					void this.addDependency(field, selectedTaskName);
				})
			);
	}

	private async renderTemplateFields(task: IronflowTask): Promise<void> {
		const templateName = task.frontmatter["ironflow-template"];
		const fieldSchema = this.plugin.templateRegistry?.getFieldSchema(templateName) ?? [];
		if (fieldSchema.length > 0) {
			this.containerEl
				.createDiv({ cls: "ironflow-section-label" })
				.setText("Template fields");
		}
		for (const field of fieldSchema) {
			const rawValue = task.frontmatter[field.key] ?? field.defaultValue;
			const currentValue = rawValue === null || rawValue === undefined ? "" : rawValue;
			if (typeof currentValue === "string" && !currentValue.includes("\n")) {
				new Setting(this.containerEl)
					.setName(field.key)
					.addText((text) =>
						text.setValue(currentValue).onChange((value) => {
							this.updateTemplateField(field.key, value);
						})
					);
				continue;
			}

			const serializedValue =
				typeof currentValue === "string"
					? currentValue
					: JSON.stringify(currentValue, null, 2);
			new Setting(this.containerEl)
				.setName(field.key)
				.addTextArea((textArea) =>
					textArea.setValue(serializedValue).onChange((value) => {
						const nextValue = parseFieldInput(currentValue, value);
						if (nextValue === undefined) {
							new Notice(`Invalid JSON value for "${field.key}".`);
							return;
						}

						this.updateTemplateField(field.key, nextValue);
					})
				);
		}
	}

	private scheduleFrontmatterUpdate(updates: Record<string, unknown>): void {
		if (!this.currentTask || !this.plugin.taskManager) {
			return;
		}

		this.pendingUpdates = {
			...this.pendingUpdates,
			...updates,
		};
		if (this.pendingSaveTimer) {
			clearTimeout(this.pendingSaveTimer);
		}

		this.pendingSaveTimer = setTimeout(() => {
			void this.flushPendingUpdates();
		}, 500);
	}

	private async flushPendingUpdates(): Promise<void> {
		if (
			!this.currentTask ||
			!this.plugin.taskManager ||
			Object.keys(this.pendingUpdates).length === 0
		) {
			return;
		}

		const updates = this.pendingUpdates;
		this.pendingUpdates = {};
		this.pendingSaveTimer = null;
		await this.plugin.taskManager.updateTaskFrontmatter(
			this.currentTask.filePath,
			updates
		);
		this.currentTask = {
			...this.currentTask,
			frontmatter: { ...this.currentTask.frontmatter, ...updates },
		};
	}

	private async getSiblingTasks(task: IronflowTask): Promise<IronflowTask[]> {
		const workflowName = task.frontmatter["ironflow-workflow"];
		return (
			(await this.plugin.taskManager?.getWorkflowTasks(workflowName)) ?? []
		).filter((candidate) => candidate.filePath !== task.filePath);
	}

	private async updateReciprocalDependency(
		field: DependencyField,
		linkedTaskName: string,
		shouldAdd: boolean
	): Promise<void> {
		if (!this.currentTask || !this.plugin.taskManager) {
			return;
		}

		const siblingTasks = await this.getSiblingTasks(this.currentTask);
		const linkedTask = siblingTasks.find((task) => task.name === linkedTaskName);
		if (!linkedTask) {
			return;
		}

		const reciprocalField: DependencyField =
			field === "ironflow-depends-on"
				? "ironflow-next-tasks"
				: "ironflow-depends-on";
		const currentLinks = linkedTask.frontmatter[reciprocalField];
		const nextLinks = shouldAdd
			? addUniqueLink(currentLinks, this.currentTask.name)
			: currentLinks.filter(
					(link) => getTaskNameFromLink(link) !== this.currentTask?.name
			  );
		if (nextLinks.length === currentLinks.length) {
			return;
		}

		await this.plugin.taskManager.updateTaskFrontmatter(linkedTask.filePath, {
			[reciprocalField]: nextLinks,
		});
	}
}

function addUniqueLink(links: string[], taskName: string): string[] {
	if (links.some((link) => getTaskNameFromLink(link) === taskName)) {
		return links;
	}

	return [...links, `[[${taskName}]]`];
}

function parseFieldInput(originalValue: unknown, value: string): unknown | undefined {
	if (typeof originalValue === "string") {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}
