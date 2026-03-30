import { isManagedIronflowField } from "./taskUtils";
import type { IronflowWorkflow } from "../types";

/**
 * One workflow task with missing template-specific field values.
 */
export interface ValidationError {
	taskName: string;
	missingFields: string[];
}

/**
 * The result of validating a workflow before instance creation.
 */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

/**
 * Check that all template-specific frontmatter fields in a workflow are populated.
 */
export function validateWorkflowReadiness(
	workflow: IronflowWorkflow
): ValidationResult {
	const errors = workflow.tasks
		.map((task) => {
			const missingFields = Object.entries(task.frontmatter)
				.filter(([key]) => !isManagedIronflowField(key))
				.filter(([, value]) => isEmptyTemplateFieldValue(value))
				.map(([key]) => key);

			return missingFields.length > 0
				? {
						taskName: task.name,
						missingFields,
					}
				: null;
		})
		.filter((error): error is ValidationError => error !== null);

	return {
		valid: errors.length === 0,
		errors,
	};
}

function isEmptyTemplateFieldValue(value: unknown): boolean {
	if (value === undefined || value === null) {
		return true;
	}

	if (typeof value === "string") {
		return value.trim().length === 0;
	}

	if (Array.isArray(value)) {
		return value.length === 0;
	}

	return false;
}
