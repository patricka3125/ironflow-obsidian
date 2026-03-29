import type { App, TAbstractFile, TFile, TFolder } from "obsidian";
import type { CanvasData } from "obsidian/canvas";

/**
 * Type guard for markdown files.
 */
export function isMarkdownFile(file: TAbstractFile | null): file is TFile {
	return file !== null && "extension" in file && file.extension === "md";
}

/**
 * Type guard for canvas files.
 */
export function isCanvasFile(file: TAbstractFile | null): file is TFile {
	return file !== null && "extension" in file && file.extension === "canvas";
}

/**
 * Type guard for folders.
 */
export function isFolder(file: TAbstractFile | null): file is TFolder {
	return file !== null && "children" in file;
}

/**
 * Type guard for plain objects.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively list markdown files under one folder.
 */
export function listMarkdownFiles(
	folder: TFolder,
	excludeFolderNames?: Set<string>
): TFile[] {
	const markdownFiles: TFile[] = [];

	for (const child of folder.children) {
		if (isFolder(child)) {
			if (excludeFolderNames?.has(child.name)) {
				continue;
			}

			markdownFiles.push(...listMarkdownFiles(child, excludeFolderNames));
			continue;
		}

		if (isMarkdownFile(child)) {
			markdownFiles.push(child);
		}
	}

	return markdownFiles;
}

/**
 * Parse a canvas file's raw JSON content.
 */
export function parseCanvasData(content: string, filePath: string): CanvasData {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (error) {
		console.error(`Ironflow failed to parse canvas JSON for "${filePath}".`, error);
		throw new Error(`Canvas file "${filePath}" contains invalid JSON.`);
	}

	if (
		typeof parsed !== "object" ||
		parsed === null ||
		!Array.isArray((parsed as CanvasData).nodes) ||
		!Array.isArray((parsed as CanvasData).edges)
	) {
		throw new Error(`Canvas file "${filePath}" is not valid canvas data.`);
	}

	return parsed as CanvasData;
}

/**
 * Read and parse one canvas file from the vault.
 */
export async function readCanvasData(app: App, file: TFile): Promise<CanvasData> {
	return parseCanvasData(await app.vault.read(file), file.path);
}
