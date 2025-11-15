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
const MIN_WIDTH = 420;
const MIN_HEIGHT = 260;
const LOAD_WIDGET_NAME = "load_from_file";
const FILE_WIDGET_NAME = "script_filename";
const SCRIPT_WIDGET_NAME = "script";
const EXTENSION_BASE_URL = (() => {
	try {
		return new URL("../", import.meta.url);
	} catch (err) {
		console.warn("[code nodes] Unable to determine extension base URL", err);
		return null;
	}
})();
const STYLE_ELEMENT_ID = "code-nodes-script-style";

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
`.trim();
	document.head.appendChild(style);
}

ensureStyles();

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

function describeInputPlaceholder(name, index, splitEnabled, activeCount) {
	if (index >= activeCount) {
		return `${name} is inactive. Increase Input Count to expose it.`;
	}
	const alias = index === 0 ? "`inputs[0]`/`input_text`" : `inputs[${index}]`;
	const helper = splitEnabled ? `${name}_text` : `${name}_lines`;
	const descriptor = splitEnabled ? "list[str]" : "string";
	const extra = index === 0 ? (splitEnabled ? " (`lines` shares this data)" : " (`input_text` shares this data)") : "";
	const helperNote = splitEnabled ? `${helper} gives the raw string.` : `${helper} lists the split lines.`;
	return `${name} → ${descriptor} via ${alias}${extra}; ${helperNote}`;
}

function normalizeFilename(value) {
	return (value || "").trim().replace(/^\/+/, "");
}

function buildScriptURL(filename) {
	if (!EXTENSION_BASE_URL) {
		return null;
	}
	const normalized = normalizeFilename(filename);
	if (!normalized) {
		return null;
	}
	try {
		const url = new URL(normalized, EXTENSION_BASE_URL);
		if (!url.pathname.startsWith(EXTENSION_BASE_URL.pathname)) {
			throw new Error("Resolved path escapes extension directory");
		}
		return url.toString();
	} catch (err) {
		console.warn("[code nodes] Unable to resolve script URL", err);
		return null;
	}
}

function updatePythonPlaceholders(node) {
	const splitEnabled = getSplitLinesValue(node);
	const activeInputs = getActiveInputCount(node);
	const scriptWidget = getScriptWidget(node);
	if (scriptWidget?.inputEl) {
			const message = splitEnabled
				? "Set result/result_lines. Active inputs arrive as list[str]; use inputs[*] or input*_text for raw strings. Increase Input Count to expose up to 20 slots."
				: "Set result/result_lines. Active inputs arrive as strings; use inputs[*] or input*_lines for split lists. Increase Input Count to expose up to 20 slots.";
		scriptWidget.inputEl.placeholder = message;
	}

	INPUT_NAMES.forEach((name, index) => {
		const widget = findWidget(node, name);
		if (widget?.inputEl) {
			widget.inputEl.placeholder = describeInputPlaceholder(name, index, splitEnabled, activeInputs);
		}
	});
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
	const shouldLoad = getLoadFromFileValue(node);

	toggleWidgetVisibility(filenameWidget, shouldLoad);
	toggleWidgetVisibility(reloadWidget, shouldLoad);
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

	const url = buildScriptURL(filename);
	if (!url) {
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

	fetch(url, { cache: "no-cache" })
		.then((response) => {
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			return response.text();
		})
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
			console.warn(`[code nodes] Failed to load script '${filename}'`, error);
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
	const activeInputs = getActiveInputCount(node);
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

function ensureReloadButton(node, reloadFn) {
	if (node[RELOAD_WIDGET_SYMBOL] || typeof node.addWidget !== "function") {
		return node[RELOAD_WIDGET_SYMBOL];
	}
	const widget = node.addWidget("button", "Reload File", () => reloadFn(), null, {
		serialize: false,
	});
	widget.name = "reload_script_button";
	widget.description = "Reloads script preview from disk.";
	toggleWidgetVisibility(widget, false);
	node[RELOAD_WIDGET_SYMBOL] = widget;
	return widget;
}
		return r;
	};
	node[MENU_SYMBOL] = true;
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
