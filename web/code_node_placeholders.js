import { app } from "../../scripts/app.js";

const MAX_INPUTS = 20;
const DEFAULT_INPUTS = 1;
const INPUT_NAMES = Array.from({ length: MAX_INPUTS }, (_, i) => `input${i + 1}`);
const CONFIG_SYMBOL = Symbol("codeNodesPlaceholderConfigured");
const SPLIT_SYMBOL = Symbol("codeNodesSplitWatcher");
const COUNT_SYMBOL = Symbol("codeNodesInputCount");
const RESIZE_SYMBOL = Symbol("codeNodesResizeWatcher");
const MENU_SYMBOL = Symbol("codeNodesMenuHook");
const MIN_WIDTH = 420;
const MIN_HEIGHT = 260;

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

function updatePythonPlaceholders(node) {
	const splitEnabled = getSplitLinesValue(node);
	const activeInputs = getActiveInputCount(node);
	const scriptWidget = findWidget(node, "script");
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

function toggleWidgetVisibility(widget, shouldShow) {
	if (!widget) {
		return;
	}

	const element = widget.element || widget.inputEl;
	if (element) {
		element.hidden = !shouldShow;
		element.style.display = shouldShow ? "" : "none";
	}

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

function hookMenu(node, refreshFn) {
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
		return r;
	};
	node[MENU_SYMBOL] = true;
}

function applyPlaceholderEnhancements(node) {
	const refresh = (options = {}) => {
		ensureScriptSizing(node);
		updatePythonPlaceholders(node);
		updateInputVisibility(node);
		if (options.forceSize) {
			recomputeNodeSize(node);
		}
	};

	const softRefresh = () => refresh();
	hookSplitLinesToggle(node, softRefresh);
	hookInputCountWidget(node, softRefresh);
	hookConfigure(node, softRefresh);
	hookResize(node, softRefresh);
	hookMenu(node, () => refresh({ forceSize: true }));
	requestAnimationFrame(() => refresh({ forceSize: true }));
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
