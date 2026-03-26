import { describe, expect, it } from "vitest";

import { TemplateRegistry } from "../src/core/TemplateRegistry";

type EventHandler = (...args: unknown[]) => unknown;

class FakeEmitter {
	private readonly handlers = new Map<string, Map<object, EventHandler>>();
	private nextRefId = 0;

	on(name: string, callback: EventHandler): object {
		const eventHandlers = this.handlers.get(name) ?? new Map<object, EventHandler>();
		const ref = { id: this.nextRefId += 1 };
		eventHandlers.set(ref, callback);
		this.handlers.set(name, eventHandlers);
		return ref;
	}

	offref(ref: object): void {
		for (const eventHandlers of this.handlers.values()) {
			eventHandlers.delete(ref);
		}
	}

	trigger(name: string, ...args: unknown[]): void {
		const eventHandlers = this.handlers.get(name);
		if (!eventHandlers) {
			return;
		}

		for (const handler of eventHandlers.values()) {
			handler(...args);
		}
	}
}

interface FakeFile {
	path: string;
	basename: string;
	extension: string;
}

interface FakeFolder {
	path: string;
	children: Array<FakeFile | FakeFolder>;
}

interface RegistryHarness {
	app: {
		vault: FakeVault;
		metadataCache: FakeMetadataCache;
	};
	templateFolder: FakeFolder;
	filesByPath: Map<string, FakeFile>;
	contentByPath: Map<string, string>;
	cacheByPath: Map<string, Record<string, unknown> | null>;
}

class FakeVault extends FakeEmitter {
	constructor(
		private readonly templateFolder: FakeFolder,
		private readonly filesByPath: Map<string, FakeFile>,
		private readonly contentByPath: Map<string, string>
	) {
		super();
	}

	getAbstractFileByPath(path: string): FakeFile | FakeFolder | null {
		if (path === this.templateFolder.path) {
			return this.templateFolder;
		}

		return this.filesByPath.get(path) ?? null;
	}

	async cachedRead(file: FakeFile): Promise<string> {
		const content = this.contentByPath.get(file.path);
		if (content === undefined) {
			throw new Error(`No content for ${file.path}`);
		}

		return content;
	}
}

class FakeMetadataCache extends FakeEmitter {
	constructor(
		private readonly cacheByPath: Map<string, Record<string, unknown> | null>
	) {
		super();
	}

	getFileCache(file: FakeFile): { frontmatter?: Record<string, unknown> } | null {
		const frontmatter = this.cacheByPath.get(file.path);
		return frontmatter ? { frontmatter } : null;
	}
}

describe("TemplateRegistry", () => {
	it("discovers markdown templates with frontmatter on initialize", async () => {
		const harness = createRegistryHarness();
		const registry = new TemplateRegistry(
			harness.app as never,
			harness.templateFolder.path
		);

		await registry.initialize();

		expect(registry.getTemplates()).toEqual([
			{
				name: "Nested Template",
				filePath: "Templates/nested/Nested Template.md",
				fields: [{ key: "nested", defaultValue: true }],
			},
			{
				name: "Review Cycle Prompt",
				filePath: "Templates/Review Cycle Prompt.md",
				fields: [
					{ key: "current-branch", defaultValue: "" },
					{ key: "target-branch", defaultValue: "" },
					{ key: "provider", defaultValue: "claude_code" },
				],
			},
		]);
	});

	it("returns one template and its field schema by name", async () => {
		const harness = createRegistryHarness();
		const registry = new TemplateRegistry(
			harness.app as never,
			harness.templateFolder.path
		);

		await registry.initialize();

		expect(registry.getTemplate("Review Cycle Prompt")).toEqual({
			name: "Review Cycle Prompt",
			filePath: "Templates/Review Cycle Prompt.md",
			fields: [
				{ key: "current-branch", defaultValue: "" },
				{ key: "target-branch", defaultValue: "" },
				{ key: "provider", defaultValue: "claude_code" },
			],
		});
		expect(registry.getFieldSchema("Review Cycle Prompt")).toEqual([
			{ key: "current-branch", defaultValue: "" },
			{ key: "target-branch", defaultValue: "" },
			{ key: "provider", defaultValue: "claude_code" },
		]);
	});

	it("falls back to reading the file when metadata cache is unavailable", async () => {
		const harness = createRegistryHarness();
		harness.cacheByPath.set("Templates/Review Cycle Prompt.md", null);
		const registry = new TemplateRegistry(
			harness.app as never,
			harness.templateFolder.path
		);

		await registry.initialize();

		expect(registry.getFieldSchema("Review Cycle Prompt")).toEqual([
			{ key: "current-branch", defaultValue: "" },
			{ key: "target-branch", defaultValue: "" },
			{ key: "provider", defaultValue: "claude_code" },
		]);
	});

	it("updates the registry for create, delete, rename, and metadata change events", async () => {
		const harness = createRegistryHarness();
		const registry = new TemplateRegistry(
			harness.app as never,
			harness.templateFolder.path
		);

		await registry.initialize();

		const addedTemplate = addTemplateFile(
			harness,
			"Templates/New Template.md",
			`---
alpha: "one"
beta: 2
---
Body`,
			{
				alpha: "one",
				beta: 2,
			}
		);
		harness.app.vault.trigger("create", addedTemplate);
		await flushPromises();
		expect(registry.getFieldSchema("New Template")).toEqual([
			{ key: "alpha", defaultValue: "one" },
			{ key: "beta", defaultValue: 2 },
		]);

		harness.cacheByPath.set("Templates/New Template.md", {
			alpha: "updated",
		});
		harness.app.metadataCache.trigger(
			"changed",
			addedTemplate,
			"",
			{ frontmatter: { alpha: "updated" } }
		);
		await flushPromises();
		expect(registry.getFieldSchema("New Template")).toEqual([
			{ key: "alpha", defaultValue: "updated" },
		]);

		renameTemplateFile(
			harness,
			addedTemplate,
			"Templates/Renamed Template.md"
		);
		harness.app.vault.trigger(
			"rename",
			addedTemplate,
			"Templates/New Template.md"
		);
		await flushPromises();
		expect(registry.getTemplate("New Template")).toBeNull();
		expect(registry.getFieldSchema("Renamed Template")).toEqual([
			{ key: "alpha", defaultValue: "updated" },
		]);

		removeTemplateFile(harness, addedTemplate.path);
		harness.app.vault.trigger("delete", addedTemplate);
		expect(registry.getTemplate("Renamed Template")).toBeNull();
	});

	it("gracefully handles an empty or missing template folder", async () => {
		const harness = createRegistryHarness();
		const missingFolderRegistry = new TemplateRegistry(
			harness.app as never,
			"Missing"
		);
		const emptyFolder = createFolder("EmptyTemplates", []);
		const emptyFolderRegistry = new TemplateRegistry(
			{
				...harness.app,
				vault: new FakeVault(
					emptyFolder,
					new Map<string, FakeFile>(),
					new Map<string, string>()
				),
			} as never,
			emptyFolder.path
		);

		await expect(missingFolderRegistry.initialize()).resolves.toBeUndefined();
		await expect(emptyFolderRegistry.initialize()).resolves.toBeUndefined();
		expect(missingFolderRegistry.getTemplates()).toEqual([]);
		expect(emptyFolderRegistry.getTemplates()).toEqual([]);
	});

	it("ignores markdown files without frontmatter", async () => {
		const harness = createRegistryHarness();
		const registry = new TemplateRegistry(
			harness.app as never,
			harness.templateFolder.path
		);

		await registry.initialize();

		expect(registry.getTemplate("Notes")).toBeNull();
	});
});

function createRegistryHarness(): RegistryHarness {
	const filesByPath = new Map<string, FakeFile>();
	const contentByPath = new Map<string, string>();
	const cacheByPath = new Map<string, Record<string, unknown> | null>();
	const nestedFolder = createFolder("Templates/nested", []);
	const templateFolder = createFolder("Templates", [nestedFolder]);
	const reviewTemplate = addTemplateFile(
		{ templateFolder, filesByPath, contentByPath, cacheByPath },
		"Templates/Review Cycle Prompt.md",
		`---
current-branch: ""
target-branch: ""
provider: "claude_code"
---
Review body`,
		{
			"current-branch": "",
			"target-branch": "",
			provider: "claude_code",
		}
	);
	const nestedTemplate = addTemplateFile(
		{ templateFolder, filesByPath, contentByPath, cacheByPath },
		"Templates/nested/Nested Template.md",
		`---
nested: true
---
Nested body`,
		{ nested: true }
	);
	addTemplateFile(
		{ templateFolder, filesByPath, contentByPath, cacheByPath },
		"Templates/Notes.md",
		"# no frontmatter",
		null
	);

	void reviewTemplate;
	void nestedTemplate;

	return {
		app: {
			vault: new FakeVault(templateFolder, filesByPath, contentByPath),
			metadataCache: new FakeMetadataCache(cacheByPath),
		},
		templateFolder,
		filesByPath,
		contentByPath,
		cacheByPath,
	};
}

function addTemplateFile(
	harness: Pick<
		RegistryHarness,
		"templateFolder" | "filesByPath" | "contentByPath" | "cacheByPath"
	> | {
		templateFolder: FakeFolder;
		filesByPath: Map<string, FakeFile>;
		contentByPath: Map<string, string>;
		cacheByPath: Map<string, Record<string, unknown> | null>;
	},
	path: string,
	content: string,
	frontmatter: Record<string, unknown> | null
): FakeFile {
	const file = createFile(path);
	harness.filesByPath.set(path, file);
	harness.contentByPath.set(path, content);
	harness.cacheByPath.set(path, frontmatter);
	insertFileIntoTree(harness.templateFolder, file);
	return file;
}

function removeTemplateFile(harness: RegistryHarness, path: string): void {
	harness.filesByPath.delete(path);
	harness.contentByPath.delete(path);
	harness.cacheByPath.delete(path);
	removeFileFromTree(harness.templateFolder, path);
}

function renameTemplateFile(
	harness: RegistryHarness,
	file: FakeFile,
	newPath: string
): void {
	const oldPath = file.path;
	harness.filesByPath.delete(oldPath);
	const content = harness.contentByPath.get(oldPath) ?? "";
	const cache = harness.cacheByPath.get(oldPath) ?? null;
	harness.contentByPath.delete(oldPath);
	harness.cacheByPath.delete(oldPath);
	removeFileFromTree(harness.templateFolder, oldPath);

	file.path = newPath;
	file.basename = getBasename(newPath);
	file.extension = getExtension(newPath);

	harness.filesByPath.set(newPath, file);
	harness.contentByPath.set(newPath, content);
	harness.cacheByPath.set(newPath, cache);
	insertFileIntoTree(harness.templateFolder, file);
}

function createFolder(path: string, children: Array<FakeFile | FakeFolder>): FakeFolder {
	return {
		path,
		children,
	};
}

function createFile(path: string): FakeFile {
	return {
		path,
		basename: getBasename(path),
		extension: getExtension(path),
	};
}

function getBasename(path: string): string {
	return path.split("/").at(-1)?.replace(/\.md$/, "") ?? path;
}

function getExtension(path: string): string {
	return path.split(".").at(-1) ?? "";
}

function insertFileIntoTree(root: FakeFolder, file: FakeFile): void {
	const parentPath = file.path.split("/").slice(0, -1).join("/");
	const parent = findFolder(root, parentPath);
	if (!parent) {
		throw new Error(`Missing parent folder for ${file.path}`);
	}

	parent.children.push(file);
}

function removeFileFromTree(root: FakeFolder, path: string): void {
	const parentPath = path.split("/").slice(0, -1).join("/");
	const parent = findFolder(root, parentPath);
	if (!parent) {
		return;
	}

	parent.children = parent.children.filter((child) => child.path !== path);
}

function findFolder(root: FakeFolder, path: string): FakeFolder | null {
	if (root.path === path) {
		return root;
	}

	for (const child of root.children) {
		if ("children" in child) {
			const match = findFolder(child, path);
			if (match) {
				return match;
			}
		}
	}

	return null;
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
}
