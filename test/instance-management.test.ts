import { describe, expect, it, vi } from "vitest";

import { CanvasWriter } from "../src/core/CanvasWriter";
import { parseFrontmatter, stripFrontmatter, updateFrontmatter } from "../src/core/frontmatter";
import { InstanceManager } from "../src/core/InstanceManager";
import { TaskManager } from "../src/core/TaskManager";
import { WorkflowManager } from "../src/core/WorkflowManager";
import type { IronflowSettings, TemplateSchema } from "../src/types";
import { FakeVault } from "./mocks/fakeVault";

describe("Instance management", () => {
	it("creates an instance with populated frontmatter, template bodies, and initial statuses", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedTemplates(app.vault);

		const instanceManager = createInstanceManager(
			app,
			settings,
			createTemplateRegistryStub([
				{
					name: "Development Execution",
					filePath: "Templates/Development Execution.md",
					fields: [
						{ key: "plan-path", defaultValue: "" },
						{ key: "references", defaultValue: "" },
					],
				},
				{
					name: "Review Execution",
					filePath: "Templates/Review Execution.md",
					fields: [{ key: "references", defaultValue: "" }],
				},
			])
		);

		const workflowInstance = await instanceManager.createInstance(
			"alpha",
			{
				"Develop Phase 1": {
					"plan-path": "Projects/alpha/plan.md",
					references: "src/main.ts, docs/architecture.md",
				},
				"Review Phase 1": {
					references: "src/main.ts",
				},
			},
			"sprint-1"
		);

		expect(workflowInstance.instanceId).toBe("sprint-1");
		expect(workflowInstance.workflowName).toBe("alpha");
		expect(workflowInstance.instancePath).toBe(
			"Workflows/alpha/instances/sprint-1"
		);
		expect(workflowInstance.tasks.map((task) => task.name)).toEqual([
			"Develop Phase 1",
			"Review Phase 1",
		]);

		expect(app.vault.getFolderByPath("Workflows/alpha/instances")).not.toBeNull();
		expect(
			app.vault.getFolderByPath("Workflows/alpha/instances/sprint-1")
		).not.toBeNull();
		expect(
			app.vault.getFileByPath(
				"Workflows/alpha/instances/sprint-1/Develop Phase 1.md"
			)
		).not.toBeNull();
		expect(
			app.vault.getFileByPath(
				"Workflows/alpha/instances/sprint-1/Review Phase 1.md"
			)
		).not.toBeNull();

		const developContent = await readFileContent(
			app.vault,
			"Workflows/alpha/instances/sprint-1/Develop Phase 1.md"
		);
		const developmentTemplateBody = stripFrontmatter(
			await readFileContent(app.vault, "Templates/Development Execution.md")
		);
		const developFrontmatter = parseFrontmatter(developContent);
		expect(developFrontmatter).toEqual(
			expect.objectContaining({
				"ironflow-template": "Development Execution",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": [],
				"ironflow-next-tasks": ["[[Review Phase 1]]"],
				"ironflow-instance-id": "sprint-1",
				"ironflow-status": "open",
				"plan-path": "Projects/alpha/plan.md",
				references: "src/main.ts, docs/architecture.md",
			})
		);
		expect(stripFrontmatter(developContent)).toBe(developmentTemplateBody);

		const reviewContent = await readFileContent(
			app.vault,
			"Workflows/alpha/instances/sprint-1/Review Phase 1.md"
		);
		const reviewTemplateBody = stripFrontmatter(
			await readFileContent(app.vault, "Templates/Review Execution.md")
		);
		const reviewFrontmatter = parseFrontmatter(reviewContent);
		expect(reviewFrontmatter).toEqual(
			expect.objectContaining({
				"ironflow-template": "Review Execution",
				"ironflow-workflow": "alpha",
				"ironflow-agent-profile": "",
				"ironflow-depends-on": ["[[Develop Phase 1]]"],
				"ironflow-next-tasks": [],
				"ironflow-instance-id": "sprint-1",
				"ironflow-status": "pending",
				references: "src/main.ts",
			})
		);
		expect(stripFrontmatter(reviewContent)).toBe(reviewTemplateBody);
	});

	it("filters managed ironflow fields from user overrides and preserves extra fields", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedTemplates(app.vault);
		const instanceManager = createInstanceManager(
			app,
			settings,
			createTemplateRegistryStub([
				{
					name: "Development Execution",
					filePath: "Templates/Development Execution.md",
					fields: [],
				},
				{
					name: "Review Execution",
					filePath: "Templates/Review Execution.md",
					fields: [],
				},
			])
		);

		await instanceManager.createInstance(
			"alpha",
			{
				"Develop Phase 1": {
					"plan-path": "Projects/alpha/plan.md",
					references: "src/main.ts",
					"ironflow-status": "done",
					notes: "extra context",
				},
				"Review Phase 1": {
					references: "src/main.ts",
					"ironflow-instance-id": "override-me",
				},
			},
			"sprint-1"
		);

		const developFrontmatter = parseFrontmatter(
			await readFileContent(
				app.vault,
				"Workflows/alpha/instances/sprint-1/Develop Phase 1.md"
			)
		);
		const reviewFrontmatter = parseFrontmatter(
			await readFileContent(
				app.vault,
				"Workflows/alpha/instances/sprint-1/Review Phase 1.md"
			)
		);

		expect(developFrontmatter["ironflow-status"]).toBe("open");
		expect(developFrontmatter.notes).toBe("extra context");
		expect(reviewFrontmatter["ironflow-instance-id"]).toBe("sprint-1");
	});

	it("generates a run-style instance id when no instance name is provided", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedTemplates(app.vault);
		const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);

		try {
			const instanceManager = createInstanceManager(
				app,
				settings,
				createTemplateRegistryStub([
					{
						name: "Development Execution",
						filePath: "Templates/Development Execution.md",
						fields: [],
					},
					{
						name: "Review Execution",
						filePath: "Templates/Review Execution.md",
						fields: [],
					},
				])
			);

			const workflowInstance = await instanceManager.createInstance("alpha", {
				"Develop Phase 1": {
					"plan-path": "Projects/alpha/plan.md",
					references: "src/main.ts",
				},
				"Review Phase 1": {
					references: "src/main.ts",
				},
			});

			expect(workflowInstance.instanceId).toMatch(/^run-[0-9a-f]{4}$/);
			expect(
				app.vault.getFolderByPath(
					`Workflows/alpha/instances/${workflowInstance.instanceId}`
				)
			).not.toBeNull();
		} finally {
			randomSpy.mockRestore();
		}
	});

	it("creates multiple instances for the same workflow when ids differ", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedTemplates(app.vault);
		const instanceManager = createInstanceManager(
			app,
			settings,
			createTemplateRegistryStub([
				{
					name: "Development Execution",
					filePath: "Templates/Development Execution.md",
					fields: [],
				},
				{
					name: "Review Execution",
					filePath: "Templates/Review Execution.md",
					fields: [],
				},
			])
		);

		await instanceManager.createInstance("alpha", {
			"Develop Phase 1": {
				"plan-path": "Projects/alpha/plan.md",
				references: "src/main.ts",
			},
			"Review Phase 1": {
				references: "src/main.ts",
			},
		}, "sprint-1");
		await instanceManager.createInstance("alpha", {
			"Develop Phase 1": {
				"plan-path": "Projects/alpha/plan-2.md",
				references: "docs/architecture.md",
			},
			"Review Phase 1": {
				references: "docs/architecture.md",
			},
		}, "sprint-2");

		expect(
			app.vault.getFolderByPath("Workflows/alpha/instances/sprint-1")
		).not.toBeNull();
		expect(
			app.vault.getFolderByPath("Workflows/alpha/instances/sprint-2")
		).not.toBeNull();
	});

	it("creates an instance folder note with the expected frontmatter and Dataview query", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedTemplates(app.vault);
		const instanceManager = createInstanceManager(
			app,
			settings,
			createTemplateRegistryStub([
				{
					name: "Development Execution",
					filePath: "Templates/Development Execution.md",
					fields: [],
				},
				{
					name: "Review Execution",
					filePath: "Templates/Review Execution.md",
					fields: [],
				},
			])
		);
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-29T12:00:00.000Z"));

		try {
			const instance = await instanceManager.createInstance(
				"alpha",
				{
					"Develop Phase 1": {
						"plan-path": "Projects/alpha/plan.md",
						references: "src/main.ts",
					},
					"Review Phase 1": {
						references: "src/main.ts",
					},
				},
				"sprint-1"
			);

			const folderNote = await instanceManager.createInstanceFolderNote(instance);
			const folderNoteContent = await readFileContent(
				app.vault,
				"Workflows/alpha/instances/sprint-1/sprint-1.md"
			);

			expect(folderNote.path).toBe("Workflows/alpha/instances/sprint-1/sprint-1.md");
			expect(parseFrontmatter(folderNoteContent)).toEqual({
				"ironflow-type": "instance-base",
				"ironflow-workflow": "alpha",
				"ironflow-instance-id": "sprint-1",
			});
			expect(folderNoteContent).toContain("# sprint-1");
			expect(folderNoteContent).toContain("**Workflow:** [[alpha]]");
			expect(folderNoteContent).toContain("**Created:** 2026-03-29");
			expect(folderNoteContent).toContain(
				'TABLE ironflow-status AS "Status", ironflow-template AS "Template", ironflow-agent-profile AS "Agent", ironflow-depends-on AS "Depends On", ironflow-next-tasks AS "Next Tasks"'
			);
			expect(folderNoteContent).toContain(
				'FROM "Workflows/alpha/instances/sprint-1"'
			);
			expect(folderNoteContent).toContain(
				'WHERE ironflow-instance-id AND file.name != "sprint-1"'
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it("throws when the workflow does not exist", async () => {
		const app = createFakeApp();
		const instanceManager = createInstanceManager(
			app,
			createSettings(),
			createTemplateRegistryStub([])
		);

		await expect(instanceManager.createInstance("missing", {})).rejects.toThrow(
			/does not exist/
		);
	});

	it("throws when the workflow has no tasks", async () => {
		const app = createFakeApp();
		app.vault.ensureFolder("Workflows");
		app.vault.ensureFolder("Workflows/alpha");
		app.vault.writeFile(
			"Workflows/alpha.canvas",
			`${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`
		);
		const instanceManager = createInstanceManager(
			app,
			createSettings(),
			createTemplateRegistryStub([])
		);

		await expect(instanceManager.createInstance("alpha", {})).rejects.toThrow(
			/has no tasks/
		);
	});

	it("throws when the instance directory already exists", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedTemplates(app.vault);
		app.vault.ensureFolder("Workflows/alpha/instances");
		app.vault.ensureFolder("Workflows/alpha/instances/sprint-1");

		const instanceManager = createInstanceManager(
			app,
			settings,
			createTemplateRegistryStub([
				{
					name: "Development Execution",
					filePath: "Templates/Development Execution.md",
					fields: [],
				},
				{
					name: "Review Execution",
					filePath: "Templates/Review Execution.md",
					fields: [],
				},
			])
		);

		await expect(
			instanceManager.createInstance(
				"alpha",
				{
					"Develop Phase 1": {
						"plan-path": "Projects/alpha/plan.md",
						references: "src/main.ts",
					},
					"Review Phase 1": {
						references: "src/main.ts",
					},
				},
				"sprint-1"
			)
		).rejects.toThrow(/already exists/);
	});

	it("throws when required template-specific field values are missing", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedTemplates(app.vault);
		const instanceManager = createInstanceManager(
			app,
			settings,
			createTemplateRegistryStub([
				{
					name: "Development Execution",
					filePath: "Templates/Development Execution.md",
					fields: [],
				},
				{
					name: "Review Execution",
					filePath: "Templates/Review Execution.md",
					fields: [],
				},
			])
		);

		await expect(
			instanceManager.createInstance("alpha", {
				"Develop Phase 1": {
					"plan-path": "Projects/alpha/plan.md",
				},
				"Review Phase 1": {
					references: "src/main.ts",
				},
			})
		).rejects.toThrow(/Develop Phase 1.*references/);
	});

	it("throws when a task references a template that is not in the registry", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		seedTemplates(app.vault);
		const instanceManager = createInstanceManager(
			app,
			settings,
			createTemplateRegistryStub([
				{
					name: "Development Execution",
					filePath: "Templates/Development Execution.md",
					fields: [],
				},
			])
		);

		await expect(
			instanceManager.createInstance("alpha", {
				"Develop Phase 1": {
					"plan-path": "Projects/alpha/plan.md",
					references: "src/main.ts",
				},
				"Review Phase 1": {
					references: "src/main.ts",
				},
			})
		).rejects.toThrow(/Review Execution.*Review Phase 1.*not found/);
	});

	it("throws when a template is registered but its file is missing from the vault", async () => {
		const app = createFakeApp();
		const settings = createSettings();
		seedWorkflowDefinition(app.vault, "alpha");
		const instanceManager = createInstanceManager(
			app,
			settings,
			createTemplateRegistryStub([
				{
					name: "Development Execution",
					filePath: "Templates/Development Execution.md",
					fields: [],
				},
				{
					name: "Review Execution",
					filePath: "Templates/Review Execution.md",
					fields: [],
				},
			])
		);

		await expect(
			instanceManager.createInstance("alpha", {
				"Develop Phase 1": {
					"plan-path": "Projects/alpha/plan.md",
					references: "src/main.ts",
				},
				"Review Phase 1": {
					references: "src/main.ts",
				},
			})
		).rejects.toThrow(/Template file "Templates\/Development Execution\.md" was not found/);
	});
});

function createFakeApp(): { vault: FakeVault } {
	return {
		vault: new FakeVault(),
	};
}

function createSettings(): IronflowSettings {
	return {
		workflowFolder: "Workflows",
		templateFolder: "Templates",
	};
}

function createInstanceManager(
	app: { vault: FakeVault },
	settings: IronflowSettings,
	templateRegistry: { getTemplate(name: string): TemplateSchema | null }
): InstanceManager {
	const taskManager = new TaskManager(
		app as never,
		createTemplateRegistryStub([]) as never,
		settings
	);
	const canvasWriter = new CanvasWriter(app as never, settings);
	const workflowManager = new WorkflowManager(
		app as never,
		taskManager,
		canvasWriter,
		settings
	);

	return new InstanceManager(
		app as never,
		workflowManager,
		templateRegistry as never,
		settings
	);
}

function createTemplateRegistryStub(templates: TemplateSchema[]): {
	getTemplate(name: string): TemplateSchema | null;
} {
	return {
		getTemplate(name: string): TemplateSchema | null {
			return templates.find((template) => template.name === name) ?? null;
		},
	};
}

function seedWorkflowDefinition(vault: FakeVault, workflowName: string): void {
	vault.writeFile(
		`Workflows/${workflowName}.canvas`,
		`${JSON.stringify({ nodes: [], edges: [] }, null, 2)}\n`
	);
	vault.writeFile(
		`Workflows/${workflowName}/Develop Phase 1.md`,
		updateFrontmatter("", {
			"ironflow-template": "Development Execution",
			"ironflow-workflow": workflowName,
			"ironflow-agent-profile": "",
			"ironflow-depends-on": [],
			"ironflow-next-tasks": ["[[Review Phase 1]]"],
			"plan-path": "",
			references: "",
		})
	);
	vault.writeFile(
		`Workflows/${workflowName}/Review Phase 1.md`,
		updateFrontmatter("", {
			"ironflow-template": "Review Execution",
			"ironflow-workflow": workflowName,
			"ironflow-agent-profile": "",
			"ironflow-depends-on": ["[[Develop Phase 1]]"],
			"ironflow-next-tasks": [],
			references: "",
		})
	);
}

function seedTemplates(vault: FakeVault): void {
	vault.writeFile(
		"Templates/Development Execution.md",
		updateFrontmatter("# Development Execution\n\nUse `tp.frontmatter[\"plan-path\"]`.\n", {
			"plan-path": "",
			references: "",
		})
	);
	vault.writeFile(
		"Templates/Review Execution.md",
		updateFrontmatter("# Review Execution\n\nReview `tp.frontmatter[\"references\"]`.\n", {
			references: "",
		})
	);
}

async function readFileContent(vault: FakeVault, path: string): Promise<string> {
	const file = vault.getFileByPath(path);
	if (!file) {
		throw new Error(`Missing file "${path}".`);
	}

	return vault.read(file);
}
