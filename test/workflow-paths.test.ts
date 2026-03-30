import { describe, expect, it } from "vitest";

import {
	INSTANCES_FOLDER_NAME,
	getInstancePath,
	getInstanceTaskPath,
	getInstancesFolderPath,
	isInstancePath,
} from "../src/core/workflowPaths";

describe("workflow instance paths", () => {
	it("exports the fixed instances folder name", () => {
		expect(INSTANCES_FOLDER_NAME).toBe("instances");
	});

	it("builds a workflow instances folder path", () => {
		expect(getInstancesFolderPath("Workflows", "my-wf")).toBe(
			"Workflows/my-wf/instances"
		);
	});

	it("builds instance paths under multi-segment workflow roots", () => {
		expect(getInstancesFolderPath("Projects/Workflows/Active", "my-wf")).toBe(
			"Projects/Workflows/Active/my-wf/instances"
		);
	});

	it("builds a workflow instance directory path", () => {
		expect(getInstancePath("Workflows", "my-wf", "run-a3f8")).toBe(
			"Workflows/my-wf/instances/run-a3f8"
		);
	});

	it("builds a workflow instance task file path", () => {
		expect(
			getInstanceTaskPath("Workflows", "my-wf", "run-a3f8", "task-a")
		).toBe("Workflows/my-wf/instances/run-a3f8/task-a.md");
	});

	it("passes through raw path segments without validation", () => {
		expect(
			getInstanceTaskPath("Workflows", "alpha", "../escape", "nested/task")
		).toBe("Workflows/alpha/instances/../escape/nested/task.md");
	});

	it("detects paths under a workflow instances directory", () => {
		expect(isInstancePath("Workflows", "Workflows/alpha/task-a.md")).toBe(false);
		expect(
			isInstancePath(
				"Workflows",
				"Workflows/alpha/instances/run-a3f8/task-a.md"
			)
		).toBe(true);
		expect(
			isInstancePath("Workflows", "Workflows/alpha/instances/run-a3f8.md")
		).toBe(true);
		expect(isInstancePath("Workflows", "Notes/run-a3f8.md")).toBe(false);
		expect(isInstancePath("Workflows", "Workflows/alpha/instances")).toBe(true);
	});
});
