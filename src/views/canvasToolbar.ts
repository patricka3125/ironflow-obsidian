import {
	ItemView,
	type App,
	type Plugin,
	setIcon,
	setTooltip,
	type View,
	type WorkspaceLeaf,
} from "obsidian";

import { getWorkflowNameFromCanvasPath } from "../core/workflowPaths";
import type { IronflowSettings } from "../types";

type ToolbarContainer = {
	appendChild?: (child: ToolbarButtonElement) => unknown;
	createEl?: (tag: string, options?: { text?: string }) => ToolbarButtonElement;
	querySelector?: (selector: string) => ToolbarButtonElement | null;
	children?: ToolbarButtonElement[];
};

type ToolbarButtonElement = {
	attributes?: Record<string, string>;
	className?: string;
	clickHandler?: (() => unknown) | null;
	id?: string;
	parentElement?: ToolbarContainer | null;
	remove?: () => void;
	addEventListener?: (name: string, callback: () => unknown) => void;
};

/**
 * Manage the create-instance toolbar button for workflow canvas views.
 */
export class CanvasToolbarManager {
	private readonly buttonId = "ironflow-create-instance-button";
	private currentButton: ToolbarButtonElement | null = null;

	constructor(
		private readonly app: App,
		private readonly settings: IronflowSettings,
		private readonly onCreateInstanceClick: (workflowName: string) => void
	) {}

	/**
	 * Register workspace listeners that inject or remove the canvas toolbar button.
	 */
	register(plugin: Plugin): void {
		plugin.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
				if (leaf?.view?.getViewType() !== "canvas") {
					this.removeButton();
					return;
				}

				this.tryInjectButton(leaf.view);
			})
		);

		plugin.registerEvent(
			this.app.workspace.on("layout-change", () => {
				const view = this.app.workspace.getActiveViewOfType(ItemView);
				if (view?.getViewType() !== "canvas") {
					this.removeButton();
					return;
				}

				this.tryInjectButton(view);
			})
		);
	}

	private tryInjectButton(canvasView: View): void {
		const canvasPath = (canvasView as any).file?.path;
		const workflowName =
			typeof canvasPath === "string"
				? getWorkflowNameFromCanvasPath(this.settings.workflowFolder, canvasPath)
				: null;
		if (!workflowName) {
			this.removeButton();
			return;
		}

		const controlsContainer = (canvasView as any).canvas?.quickSettingsButton
			?.parentElement as ToolbarContainer | null | undefined;
		if (!controlsContainer) {
			return;
		}

		const existingButton = this.findButton(controlsContainer);
		if (existingButton) {
			this.currentButton = existingButton;
			return;
		}

		this.removeButton();

		const button = this.createButtonElement(controlsContainer);
		if (!button) {
			return;
		}

		button.id = this.buttonId;
		button.className = "clickable-icon";
		setIcon(button as never, "play");
		setTooltip(button as never, "Create Workflow Instance");
		this.bindClickHandler(button, () => this.onCreateInstanceClick(workflowName));
		this.currentButton = button;
	}

	private removeButton(): void {
		this.currentButton?.remove?.();
		this.currentButton = null;
	}

	private createButtonElement(
		controlsContainer: ToolbarContainer
	): ToolbarButtonElement | null {
		if (typeof controlsContainer.createEl === "function") {
			return controlsContainer.createEl("div");
		}

		if (typeof document === "undefined") {
			return null;
		}

		const button = document.createElement("div") as unknown as ToolbarButtonElement;
		controlsContainer.appendChild?.(button);
		return button;
	}

	private findButton(
		controlsContainer: ToolbarContainer
	): ToolbarButtonElement | null {
		if (typeof controlsContainer.querySelector === "function") {
			return controlsContainer.querySelector(`#${this.buttonId}`);
		}

		return (
			controlsContainer.children?.find(
				(child) => child.id === this.buttonId
			) ?? null
		);
	}

	private bindClickHandler(
		button: ToolbarButtonElement,
		callback: () => void
	): void {
		if (typeof button.addEventListener === "function") {
			button.addEventListener("click", callback);
			return;
		}

		button.clickHandler = callback;
	}
}
