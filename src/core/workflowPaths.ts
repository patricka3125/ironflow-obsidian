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
