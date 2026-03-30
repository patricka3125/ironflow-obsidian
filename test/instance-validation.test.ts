import { describe, expect, it } from "vitest";

import { validateWorkflowReadiness } from "../src/core/instanceValidation";
import type { IronflowTask, IronflowTaskFrontmatter, IronflowWorkflow } from "../src/types";

describe("validateWorkflowReadiness", () => {
	it("returns valid when all template-specific fields are populated", () => {
		expect(
			validateWorkflowReadiness(
				createWorkflow([
					createTask("task-a", {
						references: "src/main.ts",
						"plan-path": "docs/plan.md",
					}),
				])
			)
		).toEqual({
			valid: true,
			errors: [],
		});
	});

	it("returns one error when a task has an empty string field", () => {
		expect(
			validateWorkflowReadiness(
				createWorkflow([
					createTask("task-a", {
						references: "",
					}),
				])
			)
		).toEqual({
			valid: false,
			errors: [{ taskName: "task-a", missingFields: ["references"] }],
		});
	});

	it("treats null template-specific field values as empty", () => {
		expect(
			validateWorkflowReadiness(
				createWorkflow([
					createTask("task-a", {
						references: null,
					}),
				])
			)
		).toEqual({
			valid: false,
			errors: [{ taskName: "task-a", missingFields: ["references"] }],
		});
	});

	it("treats undefined template-specific field values as empty", () => {
		expect(
			validateWorkflowReadiness(
				createWorkflow([
					createTask("task-a", {
						references: undefined,
					}),
				])
			)
		).toEqual({
			valid: false,
			errors: [{ taskName: "task-a", missingFields: ["references"] }],
		});
	});

	it("treats whitespace-only template-specific fields as empty", () => {
		expect(
			validateWorkflowReadiness(
				createWorkflow([
					createTask("task-a", {
						references: "   ",
					}),
				])
			)
		).toEqual({
			valid: false,
			errors: [{ taskName: "task-a", missingFields: ["references"] }],
		});
	});

	it("returns all tasks with missing template-specific fields", () => {
		expect(
			validateWorkflowReadiness(
				createWorkflow([
					createTask("task-a", {
						references: "",
						"plan-path": "docs/plan.md",
					}),
					createTask("task-b", {
						references: "src/main.ts",
						phase: null,
					}),
				])
			)
		).toEqual({
			valid: false,
			errors: [
				{ taskName: "task-a", missingFields: ["references"] },
				{ taskName: "task-b", missingFields: ["phase"] },
			],
		});
	});

	it("ignores tasks that only contain ironflow-managed fields", () => {
		expect(
			validateWorkflowReadiness(createWorkflow([createTask("task-a", {})]))
		).toEqual({
			valid: true,
			errors: [],
		});
	});

	it("returns valid for workflows with no tasks", () => {
		expect(
			validateWorkflowReadiness(createWorkflow([]))
		).toEqual({
			valid: true,
			errors: [],
		});
	});
});

function createWorkflow(tasks: IronflowTask[]): IronflowWorkflow {
	return {
		name: "alpha",
		canvasPath: "Workflows/alpha.canvas",
		taskFolderPath: "Workflows/alpha",
		tasks,
	};
}

function createTask(
	taskName: string,
	templateFields: Record<string, unknown>
): IronflowTask {
	return {
		name: taskName,
		filePath: `Workflows/alpha/${taskName}.md`,
		canvasNodeId: null,
		frontmatter: {
			"ironflow-template": "Execution",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": [],
			...templateFields,
		} satisfies IronflowTaskFrontmatter,
	};
}
