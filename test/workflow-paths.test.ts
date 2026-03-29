import { describe, expect, it } from "vitest";

import {
	INSTANCES_FOLDER_NAME,
	getInstancePath,
	getInstanceTaskPath,
	getInstancesFolderPath,
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
});
