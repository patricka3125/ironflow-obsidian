/** Fixed subdirectory name for workflow instances. */
export const INSTANCES_FOLDER_NAME = "instances";

/**
 * Build the vault path for a workflow root folder.
 */
export function getWorkflowRootPath(workflowFolder: string): string {
	return workflowFolder;
}

/**
 * Build the vault path for one workflow's task folder.
 */
export function getWorkflowTaskFolderPath(
	workflowFolder: string,
	workflowName: string
): string {
	return `${workflowFolder}/${workflowName}`;
}

/**
 * Build the vault path for one workflow canvas file.
 */
export function getWorkflowCanvasPath(
	workflowFolder: string,
	workflowName: string
): string {
	return `${workflowFolder}/${workflowName}.canvas`;
}

/**
 * Build the vault path for one task markdown file.
 */
export function getWorkflowTaskPath(
	workflowFolder: string,
	workflowName: string,
	taskName: string
): string {
	return `${getWorkflowTaskFolderPath(workflowFolder, workflowName)}/${taskName}.md`;
}

/**
 * Build the vault path for a workflow's instances directory.
 */
export function getInstancesFolderPath(
	workflowFolder: string,
	workflowName: string
): string {
	return `${getWorkflowTaskFolderPath(workflowFolder, workflowName)}/${INSTANCES_FOLDER_NAME}`;
}

/**
 * Build the vault path for a specific workflow instance directory.
 */
export function getInstancePath(
	workflowFolder: string,
	workflowName: string,
	instanceId: string
): string {
	return `${getInstancesFolderPath(workflowFolder, workflowName)}/${instanceId}`;
}

/**
 * Build the vault path for one task markdown file within an instance.
 */
export function getInstanceTaskPath(
	workflowFolder: string,
	workflowName: string,
	instanceId: string,
	taskName: string
): string {
	return `${getInstancePath(workflowFolder, workflowName, instanceId)}/${taskName}.md`;
}

/**
 * Return the final path segment without its file extension.
 */
export function getPathBaseName(path: string): string {
	const fileName = path.split("/").at(-1) ?? path;
	return fileName.replace(/\.[^.]+$/, "");
}

/**
 * Return the workflow name for a workflow canvas path.
 */
export function getWorkflowNameFromCanvasPath(
	workflowFolder: string,
	path: string
): string | null {
	const prefix = `${workflowFolder}/`;
	if (!path.startsWith(prefix) || !path.endsWith(".canvas")) {
		return null;
	}

	const relativePath = path.slice(prefix.length);
	if (relativePath.includes("/")) {
		return null;
	}

	return getPathBaseName(relativePath);
}

/**
 * Return the workflow name for a workflow task path.
 */
export function getWorkflowNameFromTaskPath(
	workflowFolder: string,
	path: string
): string | null {
	const prefix = `${workflowFolder}/`;
	if (!path.startsWith(prefix) || !path.endsWith(".md")) {
		return null;
	}

	const relativePath = path.slice(prefix.length);
	const [workflowName, ...remainingSegments] = relativePath.split("/");
	if (!workflowName) {
		return null;
	}

	if (remainingSegments.length === 1) {
		return workflowName;
	}

	if (
		remainingSegments.length === 3 &&
		remainingSegments[0] === INSTANCES_FOLDER_NAME
	) {
		return workflowName;
	}

	return null;
}

/**
 * Return whether a path belongs to a workflow instance under the instances directory.
 */
export function isInstancePath(workflowFolder: string, path: string): boolean {
	const prefix = `${workflowFolder}/`;
	if (!path.startsWith(prefix)) {
		return false;
	}

	const relativePath = path.slice(prefix.length);
	const segments = relativePath.split("/");

	return segments.length >= 2 && segments[1] === INSTANCES_FOLDER_NAME;
}
