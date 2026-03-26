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
	if (!workflowName || remainingSegments.length !== 1) {
		return null;
	}

	return workflowName;
}
