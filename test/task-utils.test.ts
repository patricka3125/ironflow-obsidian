import { describe, expect, it } from "vitest";

import {
	getUserFieldValues,
	isManagedIronflowField,
	normalizeIronflowTaskFrontmatter,
} from "../src/core/taskUtils";
import { listMarkdownFiles } from "../src/core/vaultUtils";
import { FakeVault } from "./mocks/fakeVault";

describe("normalizeIronflowTaskFrontmatter", () => {
	it("preserves a string instance ID and valid status values", () => {
		for (const status of ["open", "pending", "in-progress", "done"] as const) {
			expect(
				normalizeIronflowTaskFrontmatter({
					"ironflow-template": "Execution",
					"ironflow-workflow": "alpha",
					"ironflow-agent-profile": "",
					"ironflow-depends-on": [],
					"ironflow-next-tasks": ["[[review]]"],
					"ironflow-instance-id": "run-a3f8",
					"ironflow-status": status,
				})
			).toEqual({
				"ironflow-template": "Execution",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": ["[[review]]"],
				"ironflow-instance-id": "run-a3f8",
				"ironflow-status": status,
			});
		}
	});

	it("normalizes non-string instance IDs to an empty string", () => {
		expect(
			normalizeIronflowTaskFrontmatter({
				"ironflow-template": "Execution",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": ["[[review]]"],
				"ironflow-instance-id": 1234,
				"ironflow-status": "in-progress",
			})
		).toEqual({
			"ironflow-template": "Execution",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": ["[[review]]"],
			"ironflow-instance-id": "",
			"ironflow-status": "in-progress",
		});
	});

	it("falls back to pending for invalid instance status values", () => {
		expect(
			normalizeIronflowTaskFrontmatter({
				"ironflow-template": "Execution",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": [],
				"ironflow-status": "blocked",
			})
		).toEqual({
			"ironflow-template": "Execution",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": [],
			"ironflow-status": "pending",
		});
	});

	it("falls back to pending for null instance status values", () => {
		expect(
			normalizeIronflowTaskFrontmatter({
				"ironflow-template": "Execution",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": [],
				"ironflow-status": null,
			})
		).toEqual({
			"ironflow-template": "Execution",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": [],
			"ironflow-status": "pending",
		});
	});

	it("omits optional instance fields when they are absent", () => {
		const normalizedFrontmatter = normalizeIronflowTaskFrontmatter({
			"ironflow-template": "Execution",
			"ironflow-workflow": "alpha",
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": [],
		});

		expect(normalizedFrontmatter).not.toHaveProperty("ironflow-instance-id");
		expect(normalizedFrontmatter).not.toHaveProperty("ironflow-status");
	});
});

describe("isManagedIronflowField", () => {
	it("returns true only for ironflow-prefixed keys", () => {
		expect(isManagedIronflowField("ironflow-template")).toBe(true);
		expect(isManagedIronflowField("ironflow-status")).toBe(true);
		expect(isManagedIronflowField("ironflow-")).toBe(true);
		expect(isManagedIronflowField("references")).toBe(false);
		expect(isManagedIronflowField("IRONFLOW-template")).toBe(false);
		expect(isManagedIronflowField("")).toBe(false);
		expect(isManagedIronflowField("ironflow")).toBe(false);
	});
});

describe("getUserFieldValues", () => {
	it("filters out ironflow-managed keys and preserves user-defined values", () => {
		expect(
			getUserFieldValues({
				"ironflow-template": "Execution",
				"ironflow-status": "open",
				references: "src/main.ts",
				notes: "extra context",
			})
		).toEqual({
			references: "src/main.ts",
			notes: "extra context",
		});
	});

	it("returns an empty object for empty input and all-managed keys", () => {
		expect(getUserFieldValues({})).toEqual({});
		expect(
			getUserFieldValues({
				"ironflow-template": "Execution",
				"ironflow-status": "open",
			})
		).toEqual({});
	});

	it("preserves non-ironflow keys even when their values are empty", () => {
		expect(
			getUserFieldValues({
				references: "",
			})
		).toEqual({
			references: "",
		});
	});
});

describe("listMarkdownFiles", () => {
	it("preserves existing recursive behavior when no exclusions are provided", () => {
		const vault = new FakeVault();
		vault.writeFile("Workflows/alpha/task-a.md", "# A");
		vault.writeFile("Workflows/alpha/nested/task-b.md", "# B");
		vault.writeFile("Workflows/alpha/notes.txt", "ignore");

		const workflowFolder = vault.getFolderByPath("Workflows/alpha");
		expect(workflowFolder).not.toBeNull();

		expect(
			listMarkdownFiles(workflowFolder as never).map((file) => file.path)
		).toEqual([
			"Workflows/alpha/task-a.md",
			"Workflows/alpha/nested/task-b.md",
		]);
	});

	it("skips excluded folders and all of their descendants", () => {
		const vault = new FakeVault();
		vault.writeFile("Workflows/alpha/task-a.md", "# A");
		vault.writeFile("Workflows/alpha/instances/run-a3f8/task-b.md", "# B");
		vault.writeFile("Workflows/alpha/instances/run-a3f8/deep/task-c.md", "# C");

		const workflowFolder = vault.getFolderByPath("Workflows/alpha");
		expect(workflowFolder).not.toBeNull();

		expect(
			listMarkdownFiles(
				workflowFolder as never,
				new Set(["instances"])
			).map((file) => file.path)
		).toEqual(["Workflows/alpha/task-a.md"]);
	});

	it("supports excluding multiple folder names at once", () => {
		const vault = new FakeVault();
		vault.writeFile("Workflows/alpha/task-a.md", "# A");
		vault.writeFile("Workflows/alpha/instances/run-a3f8/task-b.md", "# B");
		vault.writeFile("Workflows/alpha/archive/task-c.md", "# C");

		const workflowFolder = vault.getFolderByPath("Workflows/alpha");
		expect(workflowFolder).not.toBeNull();

		expect(
			listMarkdownFiles(
				workflowFolder as never,
				new Set(["instances", "archive"])
			).map((file) => file.path)
		).toEqual(["Workflows/alpha/task-a.md"]);
	});
});
