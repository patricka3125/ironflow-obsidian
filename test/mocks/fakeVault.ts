import { Events } from "obsidian";

export type FakeAbstractFile = FakeFile | FakeFolder;

export interface FakeFile {
	path: string;
	basename: string;
	extension: string;
	stat: Record<string, never>;
}

export interface FakeFolder {
	path: string;
	name: string;
	children: FakeAbstractFile[];
}

/**
 * Shared in-memory vault for unit tests.
 */
export class FakeVault extends Events {
	private readonly files = new Map<string, FakeFile>();
	private readonly folders = new Map<string, FakeFolder>();
	private readonly contents = new Map<string, string>();

	constructor() {
		super();
		this.folders.set("", { path: "", name: "", children: [] });
	}

	getAbstractFileByPath(path: string): FakeAbstractFile | null {
		return this.files.get(path) ?? this.folders.get(path) ?? null;
	}

	getFileByPath(path: string): FakeFile | null {
		return this.files.get(path) ?? null;
	}

	getFolderByPath(path: string): FakeFolder | null {
		return this.folders.get(path) ?? null;
	}

	async create(path: string, data: string): Promise<FakeFile> {
		if (this.getAbstractFileByPath(path)) {
			throw new Error(`Path "${path}" already exists.`);
		}

		const parent = this.getRequiredParentFolder(path);
		const file = createFakeFile(path);
		parent.children.push(file);
		this.files.set(path, file);
		this.contents.set(path, data);
		this.trigger("create", file);
		return file;
	}

	async createFolder(path: string): Promise<FakeFolder> {
		if (this.folders.has(path)) {
			throw new Error(`Folder "${path}" already exists.`);
		}

		const parent = this.getRequiredParentFolder(path);
		const folder = createFakeFolder(path);
		parent.children.push(folder);
		this.folders.set(path, folder);
		this.trigger("create", folder);
		return folder;
	}

	async read(file: FakeFile): Promise<string> {
		return this.readContent(file.path);
	}

	async cachedRead(file: FakeFile): Promise<string> {
		return this.readContent(file.path);
	}

	async modify(file: FakeFile, data: string): Promise<void> {
		if (!this.files.has(file.path)) {
			throw new Error(`File "${file.path}" does not exist.`);
		}

		this.contents.set(file.path, data);
		this.trigger("modify", file);
	}

	async delete(file: FakeAbstractFile, force = false): Promise<void> {
		if (isFakeFolder(file)) {
			if (file.children.length > 0 && !force) {
				throw new Error(`Folder "${file.path}" is not empty.`);
			}

			for (const child of [...file.children]) {
				await this.delete(child, true);
			}
			this.detachFromParent(file.path);
			this.folders.delete(file.path);
			this.trigger("delete", file);
			return;
		}

		this.detachFromParent(file.path);
		this.files.delete(file.path);
		this.contents.delete(file.path);
		this.trigger("delete", file);
	}

	writeFile(path: string, data: string): FakeFile {
		const parent = this.ensureParentFolders(path);
		const existing = this.files.get(path);
		if (existing) {
			this.contents.set(path, data);
			return existing;
		}

		const file = createFakeFile(path);
		parent.children.push(file);
		this.files.set(path, file);
		this.contents.set(path, data);
		return file;
	}

	ensureFolder(path: string): FakeFolder {
		if (path === "") {
			return this.folders.get("") as FakeFolder;
		}

		const existing = this.folders.get(path);
		if (existing) {
			return existing;
		}

		const parent = this.ensureParentFolders(path);
		const folder = createFakeFolder(path);
		parent.children.push(folder);
		this.folders.set(path, folder);
		return folder;
	}

	private getRequiredParentFolder(path: string): FakeFolder {
		const parentPath = getParentPath(path);
		const parent = this.folders.get(parentPath);
		if (!parent) {
			throw new Error(`Parent folder "${parentPath}" does not exist.`);
		}

		return parent;
	}

	private ensureParentFolders(path: string): FakeFolder {
		const parentPath = getParentPath(path);
		if (parentPath === "") {
			return this.folders.get("") as FakeFolder;
		}

		const segments = parentPath.split("/");
		let currentPath = "";
		let currentFolder = this.folders.get("") as FakeFolder;
		for (const segment of segments) {
			currentPath = currentPath ? `${currentPath}/${segment}` : segment;
			const nextFolder = this.folders.get(currentPath);
			if (nextFolder) {
				currentFolder = nextFolder;
				continue;
			}

			const createdFolder = createFakeFolder(currentPath);
			currentFolder.children.push(createdFolder);
			this.folders.set(currentPath, createdFolder);
			currentFolder = createdFolder;
		}

		return currentFolder;
	}

	private detachFromParent(path: string): void {
		const parent = this.folders.get(getParentPath(path));
		if (!parent) {
			return;
		}

		parent.children = parent.children.filter((child) => child.path !== path);
	}

	private readContent(path: string): string {
		const content = this.contents.get(path);
		if (content === undefined) {
			throw new Error(`No content found for "${path}".`);
		}

		return content;
	}
}

/**
 * Shared metadata cache for unit tests.
 */
export class FakeMetadataCache extends Events {
	private readonly frontmatterByPath = new Map<string, Record<string, unknown> | null>();

	setFrontmatter(path: string, frontmatter: Record<string, unknown> | null): void {
		this.frontmatterByPath.set(path, frontmatter);
	}

	getFileCache(file: FakeFile): { frontmatter?: Record<string, unknown> } | null {
		const frontmatter = this.frontmatterByPath.get(file.path);
		return frontmatter ? { frontmatter } : null;
	}
}

export function createFakeFile(path: string): FakeFile {
	return {
		path,
		basename: path.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? path,
		extension: path.split(".").at(-1) ?? "",
		stat: {},
	};
}

export function createFakeFolder(path: string): FakeFolder {
	return {
		path,
		name: path.split("/").at(-1) ?? path,
		children: [],
	};
}

export function getParentPath(path: string): string {
	return path.split("/").slice(0, -1).join("/");
}

export function isFakeFolder(file: FakeAbstractFile): file is FakeFolder {
	return "children" in file;
}
