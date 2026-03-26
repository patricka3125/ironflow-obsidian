import { App, PluginSettingTab, Setting } from "obsidian";

import type IronflowPlugin from "../main";

/**
 * Plugin settings UI for configuring workflow and template locations.
 */
export class IronflowSettingsTab extends PluginSettingTab {
	private readonly plugin: IronflowPlugin;

	constructor(app: App, plugin: IronflowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Workflow folder")
			.setDesc("Folder where workflow definitions are stored")
			.addText((text) =>
				text
					.setPlaceholder("Workflows")
					.setValue(this.plugin.settings.workflowFolder)
					.onChange(async (value) => {
						this.plugin.settings.workflowFolder = value.trim() || "Workflows";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Template folder")
			.setDesc("Folder containing Templater templates")
			.addText((text) =>
				text
					.setPlaceholder("Templates")
					.setValue(this.plugin.settings.templateFolder)
					.onChange(async (value) => {
						this.plugin.settings.templateFolder = value.trim() || "Templates";
						await this.plugin.saveSettings();
					})
			);
	}
}
