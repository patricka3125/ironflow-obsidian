import {
	App,
	type CachedMetadata,
	type EventRef,
	Notice,
	type TAbstractFile,
	type TFile,
} from "obsidian";

import { parseFrontmatter } from "./frontmatter";
import {
	isFolder,
	isMarkdownFile,
	isRecord,
	listMarkdownFiles,
} from "./vaultUtils";
import type { TemplateField, TemplateSchema } from "../types";

/**
 * Discovers Templater templates and keeps their frontmatter field schemas in sync.
 */
export class TemplateRegistry {
	private readonly eventRegistrations: Array<{
		emitter: { offref(ref: EventRef): void };
		ref: EventRef;
	}> = [];
	private readonly templates = new Map<string, TemplateSchema>();
	private readonly templateNamesByPath = new Map<string, string>();
	private watchersRegistered = false;

	constructor(
		private readonly app: App,
		private readonly templateFolder: string
	) {}

	/**
	 * Scan the template folder and start watching for changes.
	 */
	async initialize(): Promise<void> {
		await this.rebuildTemplates();

		if (this.watchersRegistered) {
			return;
		}

		this.registerWatcher(
			this.app.vault,
			this.app.vault.on("create", (file) => {
				void this.handleCreate(file);
			})
		);
		this.registerWatcher(
			this.app.vault,
			this.app.vault.on("delete", (file) => {
				this.handleDelete(file);
			})
		);
		this.registerWatcher(
			this.app.vault,
			this.app.vault.on("rename", (file, oldPath) => {
				void this.handleRename(file, oldPath);
			})
		);
		this.registerWatcher(
			this.app.metadataCache,
			this.app.metadataCache.on("changed", (file, _data, cache) => {
				void this.handleMetadataChanged(file, cache);
			})
		);

		this.watchersRegistered = true;
	}

	/**
	 * Remove registered event listeners.
	 */
	dispose(): void {
		for (const registration of this.eventRegistrations) {
			registration.emitter.offref(registration.ref);
		}

		this.eventRegistrations.length = 0;
		this.templates.clear();
		this.templateNamesByPath.clear();
		this.watchersRegistered = false;
	}

	/**
	 * Return the discovered templates sorted by name.
	 */
	getTemplates(): TemplateSchema[] {
		return Array.from(this.templates.values())
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((template) => cloneTemplateSchema(template));
	}

	/**
	 * Return one template schema by its display name.
	 */
	getTemplate(name: string): TemplateSchema | null {
		const template = this.templates.get(name);
		return template ? cloneTemplateSchema(template) : null;
	}

	/**
	 * Return the frontmatter field schema for one template.
	 */
	getFieldSchema(name: string): TemplateField[] {
		const template = this.templates.get(name);
		return template ? template.fields.map(cloneTemplateField) : [];
	}

	private registerWatcher(
		emitter: { offref(ref: EventRef): void },
		ref: EventRef
	): void {
		this.eventRegistrations.push({ emitter, ref });
	}

	private async rebuildTemplates(): Promise<void> {
		this.templates.clear();
		this.templateNamesByPath.clear();

		const templateRoot = this.app.vault.getAbstractFileByPath(this.templateFolder);
		if (!isFolder(templateRoot)) {
			return;
		}

		const templateFiles = listMarkdownFiles(templateRoot);
		for (const file of templateFiles) {
			const schema = await this.buildTemplateSchema(file);
			if (schema) {
				this.storeTemplate(schema);
			}
		}
	}

	private async handleCreate(file: TAbstractFile): Promise<void> {
		if (!isMarkdownFile(file) || !this.isTemplatePath(file.path)) {
			return;
		}

		await this.refreshTemplate(file);
	}

	private handleDelete(file: TAbstractFile): void {
		this.removeTemplateByPath(file.path);
	}

	private async handleRename(
		file: TAbstractFile,
		oldPath: string
	): Promise<void> {
		this.removeTemplateByPath(oldPath);

		if (!isMarkdownFile(file) || !this.isTemplatePath(file.path)) {
			return;
		}

		await this.refreshTemplate(file);
	}

	private async handleMetadataChanged(
		file: TFile,
		cache: CachedMetadata
	): Promise<void> {
		if (!this.isTemplatePath(file.path)) {
			return;
		}

		await this.refreshTemplate(file, cache);
	}

	private async refreshTemplate(
		file: TFile,
		cache?: CachedMetadata
	): Promise<void> {
		try {
			const schema = await this.buildTemplateSchema(file, cache);
			if (schema) {
				this.storeTemplate(schema);
				return;
			}

			this.removeTemplateByPath(file.path);
		} catch (error) {
			this.reportRefreshError(file.path, error);
		}
	}

	private async buildTemplateSchema(
		file: TFile,
		cache?: CachedMetadata
	): Promise<TemplateSchema | null> {
		const cachedMetadata = cache ?? this.app.metadataCache.getFileCache(file) ?? null;
		const frontmatter = await this.readFrontmatter(file, cachedMetadata);
		if (!frontmatter || Object.keys(frontmatter).length === 0) {
			return null;
		}

		return {
			name: file.basename,
			filePath: file.path,
			fields: Object.entries(frontmatter).map(([key, defaultValue]) => ({
				key,
				defaultValue,
			})),
		};
	}

	private async readFrontmatter(
		file: TFile,
		cache: CachedMetadata | null
	): Promise<Record<string, unknown> | null> {
		if (cache?.frontmatter && isRecord(cache.frontmatter)) {
			const { position: _position, ...userFields } = cache.frontmatter;
			return Object.keys(userFields).length > 0 ? deepCloneRecord(userFields) : null;
		}

		const content = await this.app.vault.cachedRead(file);
		const parsedFrontmatter = parseFrontmatter(content);
		return Object.keys(parsedFrontmatter).length > 0 ? parsedFrontmatter : null;
	}

	private storeTemplate(schema: TemplateSchema): void {
		const previousTemplateName = this.templateNamesByPath.get(schema.filePath);
		if (previousTemplateName && previousTemplateName !== schema.name) {
			this.templates.delete(previousTemplateName);
		}

		this.templates.set(schema.name, cloneTemplateSchema(schema));
		this.templateNamesByPath.set(schema.filePath, schema.name);
	}

	private removeTemplateByPath(path: string): void {
		const templateName = this.templateNamesByPath.get(path);
		if (!templateName) {
			return;
		}

		this.templateNamesByPath.delete(path);
		this.templates.delete(templateName);
	}

	private isTemplatePath(path: string): boolean {
		return (
			path === this.templateFolder ||
			path.startsWith(`${this.templateFolder}/`)
		);
	}

	private reportRefreshError(path: string, error: unknown): void {
		console.error(`Ironflow failed to refresh template registry for ${path}.`, error);
		new Notice(
			"Ironflow failed to refresh template metadata. Check the developer console for details."
		);
	}
}

function cloneTemplateSchema(template: TemplateSchema): TemplateSchema {
	return {
		name: template.name,
		filePath: template.filePath,
		fields: template.fields.map(cloneTemplateField),
	};
}

function cloneTemplateField(field: TemplateField): TemplateField {
	return {
		key: field.key,
		defaultValue: deepCloneValue(field.defaultValue),
	};
}

function deepCloneRecord(value: Record<string, unknown>): Record<string, unknown> {
	return deepCloneValue(value) as Record<string, unknown>;
}

function deepCloneValue<T>(value: T): T {
	if (typeof structuredClone === "function") {
		return structuredClone(value);
	}

	return JSON.parse(JSON.stringify(value)) as T;
}
