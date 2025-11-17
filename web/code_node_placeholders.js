import { app } from "../../scripts/app.js";

const MAX_INPUTS = 20;
const DEFAULT_INPUTS = 1;
const INPUT_NAMES = Array.from({ length: MAX_INPUTS }, (_, i) => `input${i + 1}`);
const CONFIG_SYMBOL = Symbol("codeNodesPlaceholderConfigured");
const SPLIT_SYMBOL = Symbol("codeNodesSplitWatcher");
const COUNT_SYMBOL = Symbol("codeNodesInputCount");
const RESIZE_SYMBOL = Symbol("codeNodesResizeWatcher");
const MENU_SYMBOL = Symbol("codeNodesMenuHook");
const LOAD_TOGGLE_SYMBOL = Symbol("codeNodesFileToggleWatcher");
const FILE_WIDGET_SYMBOL = Symbol("codeNodesFileWidgetWatcher");
const FILE_STATE_SYMBOL = Symbol("codeNodesFileState");
const RELOAD_WIDGET_SYMBOL = Symbol("codeNodesReloadButton");
const SAVE_WIDGET_SYMBOL = Symbol("codeNodesSaveButton");
const INPUT_WATCH_SYMBOL = Symbol("codeNodesInputWatchers");
const MIN_WIDTH = 420;
const MIN_HEIGHT = 260;
const LOAD_WIDGET_NAME = "load_from_file";
const FILE_WIDGET_NAME = "script_filename";
const SCRIPT_WIDGET_NAME = "script";
const STYLE_ELEMENT_ID = "code-nodes-script-style";
const SAVE_ENDPOINT = "/code-nodes/script";

function ensureStyles() {
	if (document.getElementById(STYLE_ELEMENT_ID)) {
		return;
	}
	const style = document.createElement("style");
	style.id = STYLE_ELEMENT_ID;
	style.textContent = `
.code-nodes-script-readonly {
	background-color: var(--comfy-input-bg-disabled, rgba(0, 0, 0, 0.05));
}
.code-nodes-action-button {
	display: inline-flex !important;
	width: calc(50% - 6px) !important;
	margin: 2px 6px 2px 0 !important;
	padding: 0 !important;
}
.code-nodes-action-button.code-nodes-action-button--right {
	margin-right: 0 !important;
}
.code-nodes-action-button[data-single="true"] {
	width: calc(100% - 6px) !important;
	margin-right: 0 !important;
}
`.trim();
	document.head.appendChild(style);
}

ensureStyles();

function styleButtonElement(widget, className) {
	if (!widget) {
		return;
	}
	let attempts = 0;
	const apply = () => {
		const el = widget.element;
		if (!el && attempts < 5) {
			attempts += 1;
			requestAnimationFrame(apply);
			return;
		}
		if (el) {
			el.classList.add("code-nodes-action-button");
			if (className) {
				el.classList.add(className);
			}
		}
	};
	apply();
}

function markButtonSingle(widget, single) {
	const el = widget?.element;
	if (!el) {
		return;
	}
	el.dataset.single = single ? "true" : "false";
}

async function postJSON(url, body) {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(text || `HTTP ${response.status}`);
	}
	return response.json();
}

function findWidget(node, name) {
	if (!node?.widgets) {
		return undefined;
	}
	return node.widgets.find((widget) => widget?.name === name);
}

function getSplitLinesValue(node) {
	const splitWidget = findWidget(node, "split_lines");
	if (!splitWidget) {
		return true;
	}
	return !!splitWidget.value;
}

function getLoadFromFileValue(node) {
	const widget = findWidget(node, LOAD_WIDGET_NAME);
	if (!widget) {
		return false;
	}
	return !!widget.value;
}

function getFileWidget(node) {
	return findWidget(node, FILE_WIDGET_NAME);
}

function getScriptWidget(node) {
	return findWidget(node, SCRIPT_WIDGET_NAME);
}

function getReloadWidget(node) {
	return node[RELOAD_WIDGET_SYMBOL];
}

function getSaveWidget(node) {
	return node[SAVE_WIDGET_SYMBOL];
}

function clampInputCount(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) {
		return DEFAULT_INPUTS;
	}
	return Math.min(MAX_INPUTS, Math.max(1, Math.round(numeric)));
}

function getInputCountWidget(node) {
	return findWidget(node, "input_slots");
}

function getActiveInputCount(node) {
	const widget = getInputCountWidget(node);
	if (!widget) {
		return DEFAULT_INPUTS;
	}
	return clampInputCount(widget.value);
}

function computeAutoInputCount(node) {
	let lastWithContent = -1;
	INPUT_NAMES.forEach((name, index) => {
		const widget = findWidget(node, name);
		if (!widget) {
			return;
		}
		const value = widget.value == null ? "" : String(widget.value);
		if (value.trim()) {
			lastWithContent = index;
		}
	});
	const desired = lastWithContent + 2; // show next empty slot
	return Math.max(1, Math.min(MAX_INPUTS, desired));
}

function describeInputPlaceholder(name, index, splitEnabled, activeCount) {
	if (index >= activeCount) {
		return `${name} auto-appears once the previous input has content.`;
	}
	const alias = index === 0 ? "`inputs[0]`/`input_text`" : `inputs[${index}]`;
	const helper = splitEnabled ? `${name}_text` : `${name}_lines`;
	const descriptor = splitEnabled ? "list[str]" : "string";
	const extra = index === 0 ? (splitEnabled ? " (`lines` shares this data)" : " (`input_text` shares this data)") : "";
	const helperNote = splitEnabled ? `${helper} gives the raw string.` : `${helper} lists the split lines.`;
	return `${name} → ${descriptor} via ${alias}${extra}; ${helperNote}`;
}

function normalizeFilename(value) {
	if (typeof value !== "string") {
		return "";
	}
	return value.trim().replace(/^\/+/, "");
}

async function fetchScriptContents(filename) {
	const url = `${SAVE_ENDPOINT}?path=${encodeURIComponent(filename)}`;
	const response = await fetch(url);
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(text || `HTTP ${response.status}`);
	}
	const data = await response.json();
	if (!data?.ok) {
		throw new Error(data?.message || "Failed to load script.");
	}
	return data.contents || "";
}

function updatePythonPlaceholders(node) {
	const splitEnabled = getSplitLinesValue(node);
	const activeInputs = getActiveInputCount(node);
	const scriptWidget = getScriptWidget(node);
	if (scriptWidget?.inputEl) {
			const message = splitEnabled
				? "Set result/result_lines. Active inputs arrive as list[str]; use inputs[*] or input*_text for raw strings. Up to 20 slots appear automatically."
				: "Set result/result_lines. Active inputs arrive as strings; use inputs[*] or input*_lines for split lists. Up to 20 slots appear automatically.";
		scriptWidget.inputEl.placeholder = message;
	}

	INPUT_NAMES.forEach((name, index) => {
		const widget = findWidget(node, name);
		if (widget?.inputEl) {
			widget.inputEl.placeholder = describeInputPlaceholder(name, index, splitEnabled, activeInputs);
		}
	});
}

async function saveScriptToFile(node, { force = false } = {}) {
	const scriptWidget = getScriptWidget(node);
	const filenameWidget = getFileWidget(node);
	if (!scriptWidget) {
		return;
	}
	const filename = normalizeFilename(filenameWidget?.value || "");
	if (!filename) {
		window.alert("Enter a script filename before saving.");
		return;
	}
	const payload = {
		path: filename,
		contents: scriptWidget.value || "",
		force,
	};
	let result;
	try {
		result = await postJSON(SAVE_ENDPOINT, payload);
	} catch (error) {
		console.warn("[code nodes] Failed to save script", error);
		window.alert(`Failed to save script:\n${error?.message || error}`);
		return;
	}
	if (result?.requires_confirmation && !force) {
		const diffText = result.diff || "(no diff available)";
		const confirmMessage = `File already exists: ${filename}\n\n${diffText}\n\nOverwrite file?`;
		if (window.confirm(confirmMessage)) {
			await saveScriptToFile(node, { force: true });
		}
		return;
	}
	if (!result?.ok) {
		const msg = result?.message || "Unknown error";
		window.alert(`Failed to save script:\n${msg}`);
		return;
	}
	const successMessage = result.message || `Saved ${filename}`;
	console.info("[code nodes]", successMessage);
}

function setScriptReadOnly(scriptWidget, shouldReadOnly) {
	if (!scriptWidget?.inputEl) {
		return;
	}
	scriptWidget.inputEl.readOnly = shouldReadOnly;
	scriptWidget.inputEl.classList.toggle("code-nodes-script-readonly", shouldReadOnly);
	scriptWidget.inputEl.style.opacity = shouldReadOnly ? "0.85" : "";
}

function updateScriptFileState(node, forceReload = false) {
	const scriptWidget = getScriptWidget(node);
	const filenameWidget = getFileWidget(node);
	const reloadWidget = getReloadWidget(node);
	const saveWidget = getSaveWidget(node);
	const shouldLoad = getLoadFromFileValue(node);

	toggleWidgetVisibility(filenameWidget, true);
	toggleWidgetVisibility(reloadWidget, shouldLoad);
	toggleWidgetVisibility(saveWidget, true);
	const loadShown = shouldLoad && reloadWidget && !reloadWidget.hidden;
	markButtonSingle(reloadWidget, !loadShown);
	markButtonSingle(saveWidget, !loadShown);
	setScriptReadOnly(scriptWidget, shouldLoad);

	if (!shouldLoad || !scriptWidget) {
		const state = node[FILE_STATE_SYMBOL];
		if (state) {
			const bump = Number.isFinite(state.token) ? state.token + 1 : 1;
			node[FILE_STATE_SYMBOL] = { token: bump, lastPath: state.lastPath ?? null };
		}
		return;
	}

	const filename = normalizeFilename(filenameWidget?.value || "");
	if (!filename) {
		return;
	}

	const state = node[FILE_STATE_SYMBOL] || { token: 0, lastPath: null };
	if (!forceReload && state.lastPath === filename && scriptWidget.value) {
		return;
	}

	const requestToken = state.token + 1;
	node[FILE_STATE_SYMBOL] = { token: requestToken, lastPath: state.lastPath };
	const loadingEl = scriptWidget.inputEl;
	if (loadingEl) {
		loadingEl.dataset.loadingScript = "true";
	}

	fetchScriptContents(filename)
		.then((text) => {
			const currentState = node[FILE_STATE_SYMBOL];
			if (!currentState || currentState.token !== requestToken) {
				return;
			}
			scriptWidget.value = text;
			if (scriptWidget.inputEl) {
				scriptWidget.inputEl.value = text;
				scriptWidget.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
				scriptWidget.inputEl.scrollTop = 0;
			}
			node[FILE_STATE_SYMBOL] = { token: requestToken, lastPath: filename };
		})
		.catch((error) => {
			const message = `Failed to load script '${filename}': ${error?.message || error}`;
			console.warn("[code nodes]", message);
			scriptWidget.value = message;
			if (scriptWidget.inputEl) {
				scriptWidget.inputEl.value = message;
				scriptWidget.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
			}
		})
		.finally(() => {
			const el = scriptWidget.inputEl;
			if (el) {
				delete el.dataset.loadingScript;
			}
		});
}

function toggleWidgetVisibility(widget, shouldShow) {
	if (!widget) {
		return;
	}

	const element = widget.element || widget.inputEl;
	if (element) {
		element.hidden = !shouldShow;
		element.style.display = shouldShow ? "" : "none";
	}
	widget.hidden = !shouldShow;

	widget.options ||= {};
	if (!widget.__codeHeightFns) {
		if (!widget.__codeOptionsCloned) {
			widget.options = { ...widget.options };
			widget.__codeOptionsCloned = true;
		}
		widget.__codeHeightFns = {
			min: widget.options.getMinHeight,
			max: widget.options.getMaxHeight,
			height: widget.options.getHeight,
		};
	}

	if (shouldShow) {
		const { min, max, height } = widget.__codeHeightFns;
		widget.options.getMinHeight = min;
		widget.options.getMaxHeight = max;
		widget.options.getHeight = height;
	} else {
		widget.options.getMinHeight = () => 0;
		widget.options.getMaxHeight = () => 0;
		widget.options.getHeight = () => 0;
	}
}

function updateInputVisibility(node) {
	const countWidget = getInputCountWidget(node);
	const autoCount = computeAutoInputCount(node);
	if (countWidget) {
		countWidget.value = autoCount;
		toggleWidgetVisibility(countWidget, false);
	}
	const activeInputs = autoCount;
	INPUT_NAMES.forEach((name, index) => {
		const widget = findWidget(node, name);
		toggleWidgetVisibility(widget, index < activeInputs);
	});

	node.graph?.setDirtyCanvas(true, true);
}

function ensureScriptSizing(node) {
	const scriptWidget = findWidget(node, "script");
	if (!scriptWidget?.inputEl) {
		return;
	}

	scriptWidget.options ||= {};
	scriptWidget.options.getMinHeight = () => MIN_HEIGHT;
	scriptWidget.options.getMaxHeight = () => undefined;
	scriptWidget.options.getHeight = () => {
		const nodeHeight = node.size?.[1] ?? MIN_HEIGHT;
		const allocation = Math.max(160, (getActiveInputCount(node) - 1) * 70 + 140);
		return Math.max(MIN_HEIGHT, nodeHeight - allocation);
	};
}

function recomputeNodeSize(node) {
	if (!node?.computeSize) {
		return;
	}
	const current = Array.isArray(node.size) ? node.size.slice() : undefined;
	const next = node.computeSize(current);
	next[0] = Math.max(next[0], MIN_WIDTH);
	next[1] = Math.max(next[1], MIN_HEIGHT);
	node.size = next;
	node.graph?.setDirtyCanvas(true, true);
}

function hookSplitLinesToggle(node, updateFn) {
	const splitWidget = findWidget(node, "split_lines");
	if (!splitWidget || splitWidget[SPLIT_SYMBOL]) {
		return;
	}

	const originalCallback = splitWidget.callback;
	splitWidget.callback = function (...args) {
		const result = originalCallback?.apply(this, args);
		updateFn();
		return result;
	};
	splitWidget[SPLIT_SYMBOL] = true;
}

function hookInputCountWidget(node, updateFn) {
	const countWidget = getInputCountWidget(node);
	if (!countWidget || countWidget[COUNT_SYMBOL]) {
		return;
	}

	const originalCallback = countWidget.callback;
	countWidget.callback = function (value) {
		const normalized = clampInputCount(value);
		if (normalized !== value) {
			countWidget.value = normalized;
		}
		const result = originalCallback?.call(this, normalized);
		updateFn();
		return result;
	};
	countWidget.value = clampInputCount(countWidget.value);
	countWidget[COUNT_SYMBOL] = true;
}

function hookInputValueWatchers(node, updateFn) {
	node[INPUT_WATCH_SYMBOL] ||= new Set();
	const watchers = node[INPUT_WATCH_SYMBOL];
	INPUT_NAMES.forEach((name) => {
		const widget = findWidget(node, name);
		if (!widget || watchers.has(widget)) {
			return;
		}
		const originalCallback = widget.callback;
		widget.callback = function (...args) {
			const result = originalCallback?.apply(this, args);
			updateFn();
			return result;
		};
		if (widget.inputEl) {
			widget.inputEl.addEventListener("input", updateFn);
		} else {
			requestAnimationFrame(() => {
				widget.inputEl?.addEventListener("input", updateFn);
			});
		}
		watchers.add(widget);
	});
}

function hookLoadFromFileWidget(node, updateFn) {
	const widget = findWidget(node, LOAD_WIDGET_NAME);
	if (!widget || widget[LOAD_TOGGLE_SYMBOL]) {
		return;
	}
	const originalCallback = widget.callback;
	widget.callback = function (...args) {
		const result = originalCallback?.apply(this, args);
		updateFn();
		return result;
	};
	widget[LOAD_TOGGLE_SYMBOL] = true;
}

function hookFilenameWidget(node, updateFn) {
	const widget = getFileWidget(node);
	if (!widget || widget[FILE_WIDGET_SYMBOL]) {
		return;
	}
	const originalCallback = widget.callback;
	widget.callback = function (...args) {
		const result = originalCallback?.apply(this, args);
		updateFn();
		return result;
	};
	widget[FILE_WIDGET_SYMBOL] = true;
}

function hookResize(node, updateFn) {
	if (node[RESIZE_SYMBOL]) {
		return;
	}

	const originalResize = node.onResize;
	node.onResize = function (...args) {
		const result = originalResize?.apply(this, args);
		updateFn();
		return result;
	};
	node[RESIZE_SYMBOL] = true;
}

function hookConfigure(node, updateFn) {
	if (node[CONFIG_SYMBOL]) {
		return;
	}

	const originalConfigure = node.onConfigure;
	node.onConfigure = function (...args) {
		const result = originalConfigure?.apply(this, args);
		requestAnimationFrame(updateFn);
		return result;
	};
	node[CONFIG_SYMBOL] = true;
}

function hookMenu(node, refreshFn, reloadFn) {
	if (node[MENU_SYMBOL]) {
		return;
	}
	const originalMenu = node.getExtraMenuOptions;
	node.getExtraMenuOptions = function (_, options) {
		const r = originalMenu?.apply(this, arguments);
		const target = options ?? [];
		target.push({
			content: "Apply Input Count",
			callback: () => {
				refreshFn();
			},
		});
		if (getLoadFromFileValue(node)) {
			target.push({
				content: "Reload Script Preview",
				callback: () => reloadFn(),
			});
		}
		return r;
	};
	node[MENU_SYMBOL] = true;
}

function ensureReloadButton(node, reloadFn) {
	if (node[RELOAD_WIDGET_SYMBOL] || typeof node.addWidget !== "function") {
		return node[RELOAD_WIDGET_SYMBOL];
	}
	const widget = node.addWidget("button", "Reload File", null, () => reloadFn(), {
		serialize: false,
	});
	widget.description = "Reloads script preview from disk.";
	toggleWidgetVisibility(widget, false);
	node[RELOAD_WIDGET_SYMBOL] = widget;
	styleButtonElement(widget, "");
	return widget;
}

function ensureSaveButton(node, saveFn) {
	if (node[SAVE_WIDGET_SYMBOL] || typeof node.addWidget !== "function") {
		return node[SAVE_WIDGET_SYMBOL];
	}
	const widget = node.addWidget("button", "Save File", null, () => saveFn(), {
		serialize: false,
	});
	widget.description = "Writes the current script to the chosen file.";
	toggleWidgetVisibility(widget, false);
	node[SAVE_WIDGET_SYMBOL] = widget;
	styleButtonElement(widget, "code-nodes-action-button--right");
	return widget;
}

function applyPlaceholderEnhancements(node) {
	const refresh = (options = {}) => {
		ensureScriptSizing(node);
		updatePythonPlaceholders(node);
		updateInputVisibility(node);
		updateScriptFileState(node, options.reloadScript);
		if (options.forceSize) {
			recomputeNodeSize(node);
		}
	};

	const softRefresh = () => refresh();
	const reloadScript = () => refresh({ reloadScript: true });
	ensureReloadButton(node, reloadScript);
	ensureSaveButton(node, () => saveScriptToFile(node));
	hookInputValueWatchers(node, softRefresh);
	hookSplitLinesToggle(node, softRefresh);
	hookInputCountWidget(node, softRefresh);
	hookLoadFromFileWidget(node, reloadScript);
	hookFilenameWidget(node, reloadScript);
	hookConfigure(node, softRefresh);
	hookResize(node, softRefresh);
	hookMenu(node, () => refresh({ forceSize: true }), reloadScript);
	requestAnimationFrame(() => refresh({ forceSize: true, reloadScript: true }));
}

app.registerExtension({
	name: "codeNodes.placeholders",
	nodeCreated(node) {
		if (node?.comfyClass !== "PythonCodeNode") {
			return;
		}
		applyPlaceholderEnhancements(node);
	},
});
