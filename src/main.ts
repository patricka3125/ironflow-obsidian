import { Notice, Plugin, type CachedMetadata, type TFile } from "obsidian";
import { getAPI, type LocalRestApiPublicApi } from "obsidian-local-rest-api";

import { CanvasWriter } from "./core/CanvasWriter";
import { TaskManager } from "./core/TaskManager";
import { TemplateRegistry } from "./core/TemplateRegistry";
import { isRecord } from "./core/vaultUtils";
import {
	getWorkflowNameFromCanvasPath,
	getWorkflowNameFromTaskPath,
} from "./core/workflowPaths";
import { WorkflowManager } from "./core/WorkflowManager";
import { IronflowSettingsTab } from "./settings/SettingsTab";
import { DEFAULT_SETTINGS, type IronflowSettings } from "./types";
import { RemoveTaskModal } from "./views/RemoveTaskModal";
import { TaskPropertyPanel } from "./views/TaskPropertyPanel";
import { WorkflowCommandModal } from "./views/WorkflowCommandModal";

const TEMPLATER_PLUGIN_ID = "templater-obsidian";
const LOCAL_REST_API_PLUGIN_ID = "obsidian-local-rest-api";
type RegisteredLocalRestApi = LocalRestApiPublicApi & {
	unregister?: () => void;
};

/**
 * Main plugin entry point for Ironflow.
 */
export default class IronflowPlugin extends Plugin {
	private api: RegisteredLocalRestApi | null = null;
	settings: IronflowSettings = { ...DEFAULT_SETTINGS };
	templateRegistry: TemplateRegistry | null = null;
	canvasWriter: CanvasWriter | null = null;
	taskManager: TaskManager | null = null;
	workflowManager: WorkflowManager | null = null;

	/**
	 * Load plugin resources and register integrations.
	 */
	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new IronflowSettingsTab(this.app, this));
		this.templateRegistry = new TemplateRegistry(
			this.app,
			this.settings.templateFolder
		);
		await this.templateRegistry.initialize();
		this.canvasWriter = new CanvasWriter(this.app, this.settings);
		this.taskManager = new TaskManager(
			this.app,
			this.templateRegistry,
			this.settings
		);
		this.workflowManager = new WorkflowManager(
			this.app,
			this.taskManager,
			this.canvasWriter,
			this.settings
		);
		this.registerView(TaskPropertyPanel.VIEW_TYPE, (leaf) => {
			return new TaskPropertyPanel(leaf, this);
		});
		this.registerCommands();
		this.registerTaskPanelEvents();
		this.addRibbonIcon("list-checks", "Ironflow: Open Task Properties", () => {
			void this.openTaskPropertyPanel();
		});

		this.ensureTemplaterIsEnabled();
		this.tryRegisterRoutes();

		this.registerEvent(
			this.app.workspace.on(
				"obsidian-local-rest-api:loaded",
				this.tryRegisterRoutes.bind(this)
			)
		);
	}

	/**
	 * Tear down plugin-managed resources.
	 */
	onunload(): void {
		this.workflowManager = null;
		this.taskManager = null;
		this.canvasWriter = null;
		this.templateRegistry?.dispose();
		this.templateRegistry = null;
		this.api?.unregister?.();
		this.api = null;
	}

	/**
	 * Persist plugin settings to disk.
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Reveal the task property panel, creating it when necessary.
	 */
	async openTaskPropertyPanel(): Promise<TaskPropertyPanel> {
		let leaf =
			this.app.workspace.getLeavesOfType(TaskPropertyPanel.VIEW_TYPE)[0] ??
			this.app.workspace.getRightLeaf(false);
		await leaf.setViewState({
			type: TaskPropertyPanel.VIEW_TYPE,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
		return leaf.view as TaskPropertyPanel;
	}

	/**
	 * Return the current active workflow name when a workflow canvas is focused.
	 */
	getActiveWorkflowName(): string | null {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return null;
		}

		return getWorkflowNameFromCanvasPath(
			this.settings.workflowFolder,
			activeFile.path
		);
	}

	/**
	 * Load a workflow task into the task property panel when appropriate.
	 */
	async handleWorkflowTaskFileOpen(file: TFile | null): Promise<void> {
		if (!file || !this.taskManager || !this.isWorkflowTaskFile(file.path)) {
			return;
		}

		const task = await this.taskManager.getTask(file.path);
		if (!task) {
			return;
		}

		const panel = await this.openTaskPropertyPanel();
		await panel.loadTask(task);
	}

	/**
	 * Refresh the task panel when the active task file changes on disk.
	 */
	async handleWorkflowTaskMetadataChanged(
		file: TFile,
		_cache: CachedMetadata
	): Promise<void> {
		const panel =
			this.app.workspace.getLeavesOfType(TaskPropertyPanel.VIEW_TYPE)[0]?.view ??
			null;
		if (
			!(panel instanceof TaskPropertyPanel) ||
			!panel.isViewingTask(file.path)
		) {
			return;
		}

		await panel.refreshCurrentTask();
	}

	private async loadSettings(): Promise<void> {
		const loadedSettings = await this.loadData();
		this.settings = {
			...DEFAULT_SETTINGS,
			...(isRecord(loadedSettings) ? loadedSettings : {}),
		};
	}

	private ensureTemplaterIsEnabled(): void {
		if (!this.app.plugins.enabledPlugins.has(TEMPLATER_PLUGIN_ID)) {
			new Notice(
				"Ironflow requires the Templater plugin to be enabled for workflow templates."
			);
		}
	}

	private tryRegisterRoutes(): void {
		if (!this.app.plugins.enabledPlugins.has(LOCAL_REST_API_PLUGIN_ID)) {
			return;
		}

		this.api?.unregister?.();
		this.api = getAPI(this.app, this.manifest) as RegisteredLocalRestApi;
		this.api.addRoute("/ironflow/status/").get((_request, response) => {
			response.status(200).json({
				ok: true,
				plugin: this.manifest.id,
				version: this.manifest.version,
			});
		});
	}

	private registerCommands(): void {
		this.addCommand({
			id: "create-workflow",
			name: "New Workflow",
			callback: () => {
				new WorkflowCommandModal(this.app, this, "create-workflow").open();
			},
		});
		this.addCommand({
			id: "add-task",
			name: "Add Task",
			callback: () => {
				new WorkflowCommandModal(this.app, this, "add-task").open();
			},
		});
		this.addCommand({
			id: "remove-task",
			name: "Remove Task",
			callback: () => {
				new RemoveTaskModal(this.app, this).open();
			},
		});
		this.addCommand({
			id: "open-task-panel",
			name: "Open Task Properties",
			callback: async () => {
				await this.openTaskPropertyPanel();
			},
		});
	}

	private registerTaskPanelEvents(): void {
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				void this.handleWorkflowTaskFileOpen(file);
			})
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file, _data, cache) => {
				void this.handleWorkflowTaskMetadataChanged(file, cache);
			})
		);
	}

	private isWorkflowTaskFile(path: string): boolean {
		return getWorkflowNameFromTaskPath(this.settings.workflowFolder, path) !== null;
	}
}

declare module "obsidian" {
	interface App {
		plugins: {
			enabledPlugins: Set<string>;
		};
	}

	interface Workspace {
		on(
			name: "obsidian-local-rest-api:loaded",
			callback: () => void,
			ctx?: unknown
		): EventRef;
	}

	interface MetadataCache {
		on(
			name: "changed",
			callback: (file: TFile, data: string, cache: CachedMetadata) => void,
			ctx?: unknown
		): EventRef;
	}
}
