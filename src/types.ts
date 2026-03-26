/**
 * Plugin settings for Ironflow.
 */
export interface IronflowSettings {
	workflowFolder: string;
	templateFolder: string;
}

/**
 * Frontmatter stored on Ironflow task template files.
 */
export interface IronflowTaskFrontmatter {
	"ironflow-template": string;
	"ironflow-workflow": string;
	"ironflow-agent-profile": string;
	"ironflow-depends-on": string[];
	"ironflow-next-tasks": string[];
	[key: string]: unknown;
}

/**
 * A task template that belongs to a workflow definition.
 */
export interface IronflowTask {
	name: string;
	filePath: string;
	frontmatter: IronflowTaskFrontmatter;
	canvasNodeId: string | null;
}

/**
 * A workflow definition stored as a canvas file and task folder.
 */
export interface IronflowWorkflow {
	name: string;
	canvasPath: string;
	taskFolderPath: string;
	tasks: IronflowTask[];
}

/**
 * A discovered Templater template schema.
 */
export interface TemplateSchema {
	name: string;
	filePath: string;
	fields: TemplateField[];
}

/**
 * A single frontmatter field exposed by a template.
 */
export interface TemplateField {
	key: string;
	defaultValue: unknown;
}

/**
 * Default plugin settings.
 */
export const DEFAULT_SETTINGS: IronflowSettings = {
	workflowFolder: "Workflows",
	templateFolder: "Templates",
};
