import { Notice, Plugin } from "obsidian";
import { getAPI, type LocalRestApiPublicApi } from "obsidian-local-rest-api";

import { TemplateRegistry } from "./core/TemplateRegistry";
import { IronflowSettingsTab } from "./settings/SettingsTab";
import { DEFAULT_SETTINGS, type IronflowSettings } from "./types";

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
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
}
