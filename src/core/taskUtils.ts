import type {
	IronflowTask,
	IronflowTaskFrontmatter,
	WorkflowInstanceTaskStatus,
} from "../types";

/**
 * Parse one markdown file into an Ironflow task object.
 */
export function buildIronflowTask(
	filePath: string,
	frontmatter: Record<string, unknown>,
	canvasNodeId: string | null = null
): IronflowTask {
	return {
		name: getTaskNameFromPath(filePath),
		filePath,
		frontmatter: normalizeIronflowTaskFrontmatter(frontmatter),
		canvasNodeId,
	};
}

/**
 * Normalize a raw frontmatter object into the Ironflow task schema.
 */
export function normalizeIronflowTaskFrontmatter(
	frontmatter: Record<string, unknown>
): IronflowTaskFrontmatter {
	return {
		...frontmatter,
		"ironflow-template": toStringValue(frontmatter["ironflow-template"]),
		"ironflow-workflow": toStringValue(frontmatter["ironflow-workflow"]),
		"ironflow-agent-profile": toStringValue(
			frontmatter["ironflow-agent-profile"]
		),
		"ironflow-depends-on": toStringArray(frontmatter["ironflow-depends-on"]),
		"ironflow-next-tasks": toStringArray(frontmatter["ironflow-next-tasks"]),
		...(frontmatter["ironflow-instance-id"] !== undefined && {
			"ironflow-instance-id": toStringValue(
				frontmatter["ironflow-instance-id"]
			),
		}),
		...(frontmatter["ironflow-status"] !== undefined && {
			"ironflow-status": toInstanceStatus(frontmatter["ironflow-status"]),
		}),
	};
}

/**
 * Extract a task name from an Obsidian wikilink.
 */
export function getTaskNameFromLink(link: string): string | null {
	const match = link.match(/^\[\[([\s\S]+)\]\]$/);
	if (!match) {
		return null;
	}

	const rawTarget = match[1].split("|")[0]?.split("#")[0]?.trim() ?? "";
	if (rawTarget.length === 0) {
		return null;
	}

	return rawTarget.split("/").at(-1)?.replace(/\.md$/, "") ?? rawTarget;
}

/**
 * Return the task name for a markdown file path.
 */
export function getTaskNameFromPath(filePath: string): string {
	return filePath.split("/").at(-1)?.replace(/\.md$/, "") ?? filePath;
}

function toStringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function toStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((entry): entry is string => typeof entry === "string");
}

function toInstanceStatus(value: unknown): WorkflowInstanceTaskStatus {
	return value === "open" ||
		value === "pending" ||
		value === "in-progress" ||
		value === "done"
		? value
		: "pending";
}
