import { App, MockElement, Plugin } from "obsidian";
import { describe, expect, it } from "vitest";

import { CanvasToolbarManager } from "../src/views/canvasToolbar";

describe("CanvasToolbarManager", () => {
	it("injects a create-instance button on workflow canvases and invokes the callback", () => {
		const app = new App();
		const plugin = new Plugin(app, { id: "ironflow" });
		const clickedWorkflowNames: string[] = [];
		const manager = new CanvasToolbarManager(
			app,
			createSettings(),
			(workflowName) => {
				clickedWorkflowNames.push(workflowName);
			}
		);
		const { leaf, controlsContainer } = createCanvasLeaf(
			app,
			"Workflows/alpha.canvas"
		);

		manager.register(plugin);
		app.workspace.trigger("active-leaf-change", leaf);

		const button = controlsContainer.querySelector(
			"#ironflow-create-instance-button"
		);
		expect(button).not.toBeNull();
		expect(button?.className).toBe("clickable-icon");
		expect(button?.attributes["data-icon"]).toBe("play");
		expect(button?.attributes["aria-label"]).toBe("Create Workflow Instance");

		button?.click();
		expect(clickedWorkflowNames).toEqual(["alpha"]);
	});

	it("prevents duplicate buttons when the same workflow canvas is revisited", () => {
		const app = new App();
		const plugin = new Plugin(app, { id: "ironflow" });
		const manager = new CanvasToolbarManager(app, createSettings(), () => {});
		const { leaf, controlsContainer } = createCanvasLeaf(
			app,
			"Workflows/alpha.canvas"
		);

		manager.register(plugin);
		app.workspace.trigger("active-leaf-change", leaf);
		app.workspace.trigger("active-leaf-change", leaf);

		expect(
			controlsContainer.children.filter(
				(child) => child.id === "ironflow-create-instance-button"
			)
		).toHaveLength(1);
	});

	it("removes the button when the active leaf is not a canvas", () => {
		const app = new App();
		const plugin = new Plugin(app, { id: "ironflow" });
		const manager = new CanvasToolbarManager(app, createSettings(), () => {});
		const { leaf, controlsContainer } = createCanvasLeaf(
			app,
			"Workflows/alpha.canvas"
		);
		const markdownLeaf = app.workspace.getLeaf(true);
		markdownLeaf.view = {
			getViewType(): string {
				return "markdown";
			},
		} as never;

		manager.register(plugin);
		app.workspace.trigger("active-leaf-change", leaf);
		expect(
			controlsContainer.querySelector("#ironflow-create-instance-button")
		).not.toBeNull();

		app.workspace.trigger("active-leaf-change", markdownLeaf);
		expect(
			controlsContainer.querySelector("#ironflow-create-instance-button")
		).toBeNull();
	});

	it("removes the button when layout changes to a non-workflow canvas", () => {
		const app = new App();
		const plugin = new Plugin(app, { id: "ironflow" });
		const manager = new CanvasToolbarManager(app, createSettings(), () => {});
		const workflowCanvas = createCanvasLeaf(app, "Workflows/alpha.canvas");
		const nonWorkflowCanvas = createCanvasLeaf(app, "Notes/alpha.canvas");

		manager.register(plugin);
		app.workspace.activeLeaf = workflowCanvas.leaf;
		app.workspace.trigger("layout-change");
		expect(
			workflowCanvas.controlsContainer.querySelector(
				"#ironflow-create-instance-button"
			)
		).not.toBeNull();

		app.workspace.activeLeaf = nonWorkflowCanvas.leaf;
		app.workspace.trigger("layout-change");
		expect(
			workflowCanvas.controlsContainer.querySelector(
				"#ironflow-create-instance-button"
			)
		).toBeNull();
		expect(
			nonWorkflowCanvas.controlsContainer.querySelector(
				"#ironflow-create-instance-button"
			)
		).toBeNull();
	});

	it("fails silently when the canvas controls container is unavailable", () => {
		const app = new App();
		const plugin = new Plugin(app, { id: "ironflow" });
		const manager = new CanvasToolbarManager(app, createSettings(), () => {});
		const leaf = app.workspace.getLeaf(true);
		leaf.view = {
			getViewType(): string {
				return "canvas";
			},
			file: {
				path: "Workflows/alpha.canvas",
			},
			canvas: {},
		} as never;

		manager.register(plugin);

		expect(() => {
			app.workspace.trigger("active-leaf-change", leaf);
			app.workspace.activeLeaf = leaf;
			app.workspace.trigger("layout-change");
		}).not.toThrow();
	});
});

function createSettings(): { workflowFolder: string; templateFolder: string } {
	return {
		workflowFolder: "Workflows",
		templateFolder: "Templates",
	};
}

function createCanvasLeaf(
	app: App,
	path: string
): { leaf: ReturnType<App["workspace"]["getLeaf"]>; controlsContainer: MockElement } {
	const leaf = app.workspace.getLeaf(true);
	const controlsContainer = new MockElement("div");
	const quickSettingsButton = new MockElement("button");
	controlsContainer.appendChild(quickSettingsButton);
	leaf.view = {
		getViewType(): string {
			return "canvas";
		},
		file: {
			path,
		},
		canvas: {
			quickSettingsButton,
		},
	} as never;
	return { leaf, controlsContainer };
}
