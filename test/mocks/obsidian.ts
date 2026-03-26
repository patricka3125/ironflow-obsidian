export interface EventRef {
	id: number;
	name: string;
	callback: (...args: unknown[]) => unknown;
}

export class Events {
	private readonly handlers = new Map<string, Map<number, EventRef>>();
	private nextEventId = 0;

	on(name: string, callback: (...args: unknown[]) => unknown): EventRef {
		const ref: EventRef = {
			id: this.nextEventId += 1,
			name,
			callback,
		};
		const eventHandlers = this.handlers.get(name) ?? new Map<number, EventRef>();
		eventHandlers.set(ref.id, ref);
		this.handlers.set(name, eventHandlers);
		return ref;
	}

	offref(ref: EventRef): void {
		this.handlers.get(ref.name)?.delete(ref.id);
	}

	trigger(name: string, ...args: unknown[]): void {
		const eventHandlers = this.handlers.get(name);
		if (!eventHandlers) {
			return;
		}

		for (const handler of eventHandlers.values()) {
			handler.callback(...args);
		}
	}
}

export class MockElement {
	tag: string;
	text = "";
	children: MockElement[] = [];
	classes = new Set<string>();
	attributes: Record<string, string> = {};
	value = "";
	clickHandler: (() => unknown) | null = null;

	constructor(tag = "div") {
		this.tag = tag;
	}

	empty(): void {
		this.text = "";
		this.children = [];
	}

	createDiv(): MockElement {
		const child = new MockElement("div");
		this.children.push(child);
		return child;
	}

	createEl(tag: string, options?: { text?: string }): MockElement {
		const child = new MockElement(tag);
		if (options?.text) {
			child.text = options.text;
		}
		this.children.push(child);
		return child;
	}

	setText(text: string): this {
		this.text = text;
		return this;
	}

	addClass(...classes: string[]): this {
		for (const className of classes) {
			this.classes.add(className);
		}
		return this;
	}

	removeClass(...classes: string[]): this {
		for (const className of classes) {
			this.classes.delete(className);
		}
		return this;
	}

	get textContent(): string {
		return `${this.text}${this.children.map((child) => child.textContent).join("")}`;
	}

	click(): void {
		this.clickHandler?.();
	}
}

export class Notice {
	static notices: string[] = [];
	message: string;

	constructor(message: string) {
		this.message = message;
		Notice.notices.push(message);
	}

	static reset(): void {
		Notice.notices = [];
	}
}

export class Component {
	private readonly registeredEvents: Array<{ emitter: Events; ref: EventRef }> = [];

	registerEvent(ref: EventRef): void {
		// Most tests use app.workspace/app.metadataCache/app.vault emitters,
		// so we retain the ref for parity but do not auto-dispose from here.
		this.registeredEvents.push({ emitter: new Events(), ref });
	}
}

export class App {
	vault: Events & Record<string, unknown>;
	metadataCache: Events & Record<string, unknown>;
	workspace: Workspace;
	plugins: { enabledPlugins: Set<string> };

	constructor() {
		this.vault = new Events() as Events & Record<string, unknown>;
		this.metadataCache = new Events() as Events & Record<string, unknown>;
		this.workspace = new Workspace(this);
		this.plugins = {
			enabledPlugins: new Set<string>(),
		};
	}
}

export class View extends Component {
	app: App;
	leaf: WorkspaceLeaf;
	containerEl: MockElement;

	constructor(leaf: WorkspaceLeaf) {
		super();
		this.leaf = leaf;
		this.app = leaf.workspace.app;
		this.containerEl = leaf.containerEl;
	}
}

export class ItemView extends View {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}
}

export class Modal extends Component {
	app: App;
	containerEl: MockElement;
	contentEl: MockElement;
	modalEl: MockElement;
	titleEl: MockElement;
	isOpen = false;

	constructor(app: App) {
		super();
		this.app = app;
		this.containerEl = new MockElement("modal");
		this.contentEl = this.containerEl.createDiv();
		this.modalEl = this.contentEl;
		this.titleEl = this.contentEl.createDiv();
	}

	open(): void {
		this.isOpen = true;
		const openHandler = (this as unknown as { onOpen?: () => Promise<void> | void })
			.onOpen;
		void openHandler?.call(this);
	}

	close(): void {
		this.isOpen = false;
		const closeHandler = (this as unknown as { onClose?: () => Promise<void> | void })
			.onClose;
		void closeHandler?.call(this);
	}
}

export class SettingTab extends Component {
	app: App;
	containerEl: MockElement;

	constructor(app: App) {
		super();
		this.app = app;
		this.containerEl = new MockElement("settings");
	}
}

export class PluginSettingTab extends SettingTab {
	plugin: Plugin;

	constructor(app: App, plugin: Plugin) {
		super(app);
		this.plugin = plugin;
	}
}

export interface Command {
	id: string;
	name: string;
	callback?: () => Promise<unknown> | unknown;
}

export class Plugin extends Component {
	app: App;
	manifest: { id: string; name?: string; version?: string };
	commands: Command[] = [];
	settingTabs: PluginSettingTab[] = [];
	ribbonIcons: Array<{ icon: string; title: string; callback: () => unknown }> = [];
	viewCreators = new Map<string, (leaf: WorkspaceLeaf) => View>();
	private persistedData: unknown = null;

	constructor(app: App, manifest: { id: string; name?: string; version?: string }) {
		super();
		this.app = app;
		this.manifest = manifest;
	}

	addRibbonIcon(
		icon: string,
		title: string,
		callback: () => unknown
	): MockElement {
		this.ribbonIcons.push({ icon, title, callback });
		const element = new MockElement("button");
		element.clickHandler = callback;
		return element;
	}

	addCommand(command: Command): Command {
		this.commands.push(command);
		return command;
	}

	addSettingTab(settingTab: PluginSettingTab): void {
		this.settingTabs.push(settingTab);
	}

	registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => View): void {
		this.viewCreators.set(type, viewCreator);
		this.app.workspace.viewCreators.set(type, viewCreator);
	}

	async loadData(): Promise<unknown> {
		return this.persistedData;
	}

	async saveData(data: unknown): Promise<void> {
		this.persistedData = data;
	}
}

export interface ViewState {
	type: string;
	active?: boolean;
	state?: Record<string, unknown>;
}

export class WorkspaceLeaf {
	workspace: Workspace;
	containerEl = new MockElement("leaf");
	view: View | null = null;
	private viewState: ViewState = { type: "empty" };
	file: { path: string; basename?: string; extension?: string } | null = null;

	constructor(workspace: Workspace) {
		this.workspace = workspace;
	}

	async openFile(
		file: { path: string; basename?: string; extension?: string }
	): Promise<void> {
		this.file = file;
		this.workspace.activeFile = file;
		this.workspace.activeLeaf = this;
		this.viewState = {
			...this.viewState,
			state: {
				...(this.viewState.state ?? {}),
				file: file.path,
			},
		};
		this.workspace.trigger("file-open", file);
	}

	getViewState(): ViewState {
		return this.viewState;
	}

	async setViewState(viewState: ViewState): Promise<void> {
		this.viewState = viewState;
		const viewCreator = this.workspace.viewCreators.get(viewState.type);
		if (viewCreator) {
			this.view = viewCreator(this);
			const openHandler = (this.view as unknown as {
				onOpen?: () => Promise<void> | void;
			}).onOpen;
			await openHandler?.call(this.view);
		}
	}
}

export class Workspace extends Events {
	app: App;
	activeLeaf: WorkspaceLeaf | null = null;
	activeFile: { path: string; basename?: string; extension?: string } | null = null;
	leaves: WorkspaceLeaf[] = [];
	viewCreators = new Map<string, (leaf: WorkspaceLeaf) => View>();
	revealedLeaves: WorkspaceLeaf[] = [];

	constructor(app: App) {
		super();
		this.app = app;
	}

	getActiveFile(): { path: string; basename?: string; extension?: string } | null {
		return this.activeFile;
	}

	getLeavesOfType(type: string): WorkspaceLeaf[] {
		return this.leaves.filter((leaf) => leaf.getViewState().type === type);
	}

	getRightLeaf(_split: boolean): WorkspaceLeaf {
		const leaf = new WorkspaceLeaf(this);
		this.leaves.push(leaf);
		return leaf;
	}

	getLeaf(_newLeaf?: boolean | string): WorkspaceLeaf {
		const leaf = new WorkspaceLeaf(this);
		this.leaves.push(leaf);
		return leaf;
	}

	revealLeaf(leaf: WorkspaceLeaf): void {
		this.revealedLeaves.push(leaf);
	}
}

class BaseValueComponent<TValue> {
	inputEl = new MockElement("input");
	protected value: TValue;
	protected changeHandler: ((value: TValue) => unknown) | null = null;
	protected disabled = false;

	constructor(initialValue: TValue) {
		this.value = initialValue;
	}

	setValue(value: TValue): this {
		this.value = value;
		this.inputEl.value = String(value ?? "");
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		return this;
	}

	onChange(callback: (value: TValue) => unknown): this {
		this.changeHandler = callback;
		return this;
	}

	triggerChange(value: TValue): void {
		this.value = value;
		this.inputEl.value = String(value ?? "");
		this.changeHandler?.(value);
	}
}

export class TextComponent extends BaseValueComponent<string> {
	setPlaceholder(_placeholder: string): this {
		return this;
	}
}

export class TextAreaComponent extends BaseValueComponent<string> {
	setPlaceholder(_placeholder: string): this {
		return this;
	}
}

export class DropdownComponent extends BaseValueComponent<string> {
	options = new Map<string, string>();

	constructor() {
		super("");
	}

	addOption(value: string, label: string): this {
		this.options.set(value, label);
		this.inputEl.text = `${this.inputEl.text}${label}`;
		return this;
	}
}

export class ButtonComponent {
	buttonEl = new MockElement("button");
	private clickHandler: (() => unknown) | null = null;

	setButtonText(text: string): this {
		this.buttonEl.text = text;
		return this;
	}

	setCta(): this {
		return this;
	}

	onClick(callback: () => unknown): this {
		this.clickHandler = callback;
		this.buttonEl.clickHandler = callback;
		return this;
	}

	click(): void {
		this.clickHandler?.();
	}
}

export class Setting {
	settingEl: MockElement;
	name = "";
	desc = "";
	textComponent: TextComponent | null = null;
	textAreaComponent: TextAreaComponent | null = null;
	dropdownComponent: DropdownComponent | null = null;
	buttonComponents: ButtonComponent[] = [];

	constructor(containerEl: MockElement) {
		this.settingEl = containerEl.createDiv();
	}

	setName(name: string): this {
		this.name = name;
		this.settingEl.createDiv().setText(name);
		return this;
	}

	setClass(cls: string): this {
		this.settingEl.addClass(cls);
		return this;
	}

	setDesc(desc: string): this {
		this.desc = desc;
		this.settingEl.createDiv().setText(desc);
		return this;
	}

	addText(callback: (component: TextComponent) => unknown): this {
		this.textComponent = new TextComponent("");
		this.settingEl.children.push(this.textComponent.inputEl);
		callback(this.textComponent);
		return this;
	}

	addTextArea(callback: (component: TextAreaComponent) => unknown): this {
		this.textAreaComponent = new TextAreaComponent("");
		this.settingEl.children.push(this.textAreaComponent.inputEl);
		callback(this.textAreaComponent);
		return this;
	}

	addDropdown(callback: (component: DropdownComponent) => unknown): this {
		this.dropdownComponent = new DropdownComponent();
		this.settingEl.children.push(this.dropdownComponent.inputEl);
		callback(this.dropdownComponent);
		return this;
	}

	addButton(callback: (component: ButtonComponent) => unknown): this {
		const button = new ButtonComponent();
		this.buttonComponents.push(button);
		this.settingEl.children.push(button.buttonEl);
		callback(button);
		return this;
	}
}
