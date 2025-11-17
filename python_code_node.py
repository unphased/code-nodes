"""Python-based custom node utilities for ComfyUI."""

from __future__ import annotations

import difflib
import io
import traceback
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:  # pragma: no cover - ComfyUI runtime provides these modules
    from aiohttp import web
    from server import PromptServer
except Exception:  # pragma: no cover - tests may run without ComfyUI
    web = None
    PromptServer = None


def _stringify_result_element(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        parts = [_stringify_result_element(item) for item in value]
        return ", ".join(parts)
    return str(value)


class PythonCodeNode:
    """Execute Python code with helpers for working with ComfyUI strings."""

    CATEGORY = "utils/code"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("result", "result_lines", "stdout", "stderr", "ok")
    OUTPUT_IS_LIST = (False, False, False, False, False)
    INPUT_IS_LIST = False
    MAX_INPUT_SLOTS = 20
    DEFAULT_INPUT_SLOTS = 1
    EXTENSION_ROOT = Path(__file__).resolve().parent

    @classmethod
    def INPUT_TYPES(cls):
        def multiline_str(name: str):
            index = int(name.replace("input", ""))
            alias = "inputs[0]" if index == 1 else f"inputs[{index - 1}]"
            alias_hint = " (also input_text/lines)" if index == 1 else ""
            placeholder = f"{name} ↔ {alias}{alias_hint}; string/list depends on split_lines"
            return {
                "multiline": True,
                "default": "",
                "placeholder": placeholder,
            }

        optional_inputs: Dict[str, Tuple[str, Dict[str, Any]]] = {}
        for slot in range(2, cls.MAX_INPUT_SLOTS + 1):
            optional_inputs[f"input{slot}"] = ("STRING", multiline_str(f"input{slot}"))
        optional_inputs["load_from_file"] = ("BOOLEAN", {"default": False})
        optional_inputs["script_filename"] = (
            "STRING",
            {
                "default": "",
                "multiline": False,
                "placeholder": "Relative to this extension (e.g., scripts/example.py)",
            },
        )
        optional_inputs["split_lines"] = ("BOOLEAN", {"default": True})
        optional_inputs["strip_empty"] = ("BOOLEAN", {"default": True})
        optional_inputs["delimiter"] = (
            "STRING",
            {
                "default": "",
                "multiline": False,
                "placeholder": "Optional custom delimiter (comma, pipe, etc.)",
            },
        )
        optional_inputs["input_slots"] = (
            "INT",
            {
                "default": cls.DEFAULT_INPUT_SLOTS,
                "min": 1,
                "max": cls.MAX_INPUT_SLOTS,
                "step": 1,
                "display": "number",
            },
        )

        return {
            "required": {
                "script": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "result = input1",
                        "placeholder": "Set result/result_lines; access raw data via inputs[*]. Additional inputs appear automatically as you type.",
                    },
                ),
                "input1": ("STRING", multiline_str("input1")),
            },
            "optional": optional_inputs,
        }

    def run(
        self,
        script: str,
        input1: str = "",
        input2: str = "",
        input3: str = "",
        input4: str = "",
        input5: str = "",
        input6: str = "",
        input7: str = "",
        input8: str = "",
        input9: str = "",
        input10: str = "",
        input11: str = "",
        input12: str = "",
        input13: str = "",
        input14: str = "",
        input15: str = "",
        input16: str = "",
        input17: str = "",
        input18: str = "",
        input19: str = "",
        input20: str = "",
        load_from_file: bool = False,
        script_filename: str = "",
        input_slots: int = DEFAULT_INPUT_SLOTS,
        split_lines: bool = True,
        strip_empty: bool = True,
        delimiter: str = "",
    ) -> Tuple[str, List[str], str, str, bool]:
        """Execute *script* and expose helpers for returning data to ComfyUI."""

        stdout_buffer = io.StringIO()
        stderr = ""
        ok = True
        result_text = ""
        result_lines_list: List[str] = []
        result_value: Any = None
        raw_inputs = [
            input1,
            input2,
            input3,
            input4,
            input5,
            input6,
            input7,
            input8,
            input9,
            input10,
            input11,
            input12,
            input13,
            input14,
            input15,
            input16,
            input17,
            input18,
            input19,
            input20,
        ]
        normalized_inputs: List[str] = [str(value or "") for value in raw_inputs[: self.MAX_INPUT_SLOTS]]
        input_line_sets: List[List[str]] = [text.splitlines() for text in normalized_inputs]
        delimiter_value = str(delimiter or "")
        use_delimiter = bool(delimiter_value)

        def split_text(value: str) -> List[str]:
            parts = [value]
            if use_delimiter and delimiter_value:
                new_parts: List[str] = []
                for chunk in parts:
                    new_parts.extend(chunk.split(delimiter_value))
                parts = new_parts
            if split_lines:
                new_parts = []
                for chunk in parts:
                    new_parts.extend(chunk.splitlines())
                parts = new_parts
            return parts

        split_inputs: List[List[str]] = [split_text(text) for text in normalized_inputs]

        script_source = script
        script_path_display = ""
        if load_from_file:
            filename = (script_filename or "").strip()
            if not filename:
                return (
                    "",
                    [],
                    "",
                    "load_from_file is enabled but no script_filename was provided.",
                    False,
                )
            script_path = Path(filename)
            if not script_path.is_absolute():
                script_path = (self.EXTENSION_ROOT / script_path).resolve()
            else:
                script_path = script_path.resolve()
            script_path_display = str(script_path)
            try:
                script_source = script_path.read_text(encoding="utf-8")
            except Exception as exc:  # pragma: no cover - relies on filesystem state
                return (
                    "",
                    [],
                    "",
                    f"Failed to load script from '{filename}': {exc}",
                    False,
                )

        try:
            requested_slots = int(input_slots)
        except (TypeError, ValueError):
            requested_slots = self.DEFAULT_INPUT_SLOTS
        active_inputs = max(1, min(self.MAX_INPUT_SLOTS, requested_slots))
        primary_input = normalized_inputs[0]
        primary_lines = input_line_sets[0]
        split_mode = split_lines or use_delimiter
        inputs_payload = split_inputs[:active_inputs] if split_mode else normalized_inputs[:active_inputs]
        local_ns: Dict[str, Any] = {
            "input_text": primary_input,
            "lines": primary_lines,
            "result": "",
            "result_lines": [],
            "inputs": inputs_payload,
            "inputs_text": normalized_inputs[:active_inputs],
            "inputs_lines": input_line_sets[:active_inputs],
            "active_inputs": active_inputs,
            "input_slots": active_inputs,
            "script_path": script_path_display,
            "delimiter": delimiter_value,
        }

        for index, text_value in enumerate(normalized_inputs, start=1):
            lines = input_line_sets[index - 1]
            local_ns[f"input{index}_text"] = text_value
            local_ns[f"input{index}_lines"] = lines
            local_ns[f"input{index}"] = split_inputs[index - 1] if split_mode else text_value

        try:
            local_ns.setdefault("__builtins__", __builtins__)
            with redirect_stdout(stdout_buffer):
                exec(script_source, local_ns, local_ns)
            result_value = local_ns.get("result", None)
            if result_value is None and "result_text" in local_ns:
                result_value = local_ns.get("result_text")
            result_text = "" if result_value is None else str(result_value)
            result_lines_value = local_ns.get("result_lines", None)
            if result_lines_value is None:
                result_lines_list = []
            elif isinstance(result_lines_value, list):
                result_lines_list = result_lines_value
            else:
                result_lines_list = list(result_lines_value)
        except Exception:  # pragma: no cover - safety against runtime errors
            ok = False
            result_text = ""
            result_lines_list = []
            stderr = traceback.format_exc()
            result_value = None

        stdout = stdout_buffer.getvalue()

        if not result_lines_list and isinstance(result_value, (list, tuple)):
            result_lines_list = [_stringify_result_element(item) for item in result_value]
        elif split_lines:
            auto_lines = result_text.splitlines()
            if strip_empty:
                auto_lines = [line for line in auto_lines if line.strip()]
            if not result_lines_list:
                result_lines_list = auto_lines

        result_lines_list = [str(line) for line in result_lines_list]
        if strip_empty:
            result_lines_list = [line for line in result_lines_list if line.strip()]
        result_lines_text = "\n".join(result_lines_list)

        return result_text, result_lines_text, stdout, stderr, ok


def _resolve_script_destination(filename: str) -> Path:
    sanitized = (filename or "").strip()
    if not sanitized:
        raise ValueError("script filename is required")
    candidate = Path(sanitized)
    if not candidate.is_absolute():
        candidate = (PythonCodeNode.EXTENSION_ROOT / candidate).resolve()
    else:
        candidate = candidate.resolve()
    try:
        candidate.relative_to(PythonCodeNode.EXTENSION_ROOT)
    except ValueError as exc:
        raise ValueError("script_filename must remain inside the code-nodes directory") from exc
    return candidate


def _json_reply(ok: bool, message: str = "", status: int = 200, **extra):
    payload: Dict[str, Any] = {"ok": ok, "message": message}
    payload.update(extra)
    return web.json_response(payload, status=status)


def register_routes() -> None:
    if not (web and PromptServer and getattr(PromptServer, "instance", None)):
        return
    server = PromptServer.instance
    if getattr(server, "_code_nodes_routes", False):  # type: ignore[attr-defined]
        return

    @server.routes.get("/code-nodes/script")
    async def load_script(request):
        path_value = request.rel_url.query.get("path", "")
        try:
            destination = _resolve_script_destination(path_value)
        except ValueError as exc:
            return _json_reply(False, str(exc), status=400)

        if not destination.exists():
            return _json_reply(False, "File not found.", status=404)

        try:
            contents = destination.read_text(encoding="utf-8")
        except Exception as exc:  # pragma: no cover - filesystem
            return _json_reply(False, f"Failed to read file: {exc}", status=500)

        return _json_reply(True, "Loaded script.", path=str(destination), contents=contents)

    @server.routes.post("/code-nodes/script")
    async def save_script(request):
        try:
            data = await request.json()
        except Exception:
            return _json_reply(False, "Invalid JSON payload", status=400)

        path_value = data.get("path", "")
        contents = data.get("contents", "")
        force = bool(data.get("force"))
        try:
            destination = _resolve_script_destination(path_value)
        except ValueError as exc:
            return _json_reply(False, str(exc), status=400)

        if not isinstance(contents, str):
            return _json_reply(False, "contents must be a string", status=400)

        destination.parent.mkdir(parents=True, exist_ok=True)
        exists = destination.exists()
        text_before = ""
        if exists:
            text_before = destination.read_text(encoding="utf-8")
            if text_before == contents:
                return _json_reply(True, "File already up to date.", path=str(destination))
            if not force:
                diff_lines = difflib.unified_diff(
                    text_before.splitlines(),
                    contents.splitlines(),
                    fromfile=str(destination),
                    tofile="pending changes",
                    lineterm="",
                )
                diff_text = "\n".join(diff_lines).strip()
                if not diff_text:
                    diff_text = "(no textual diff available)"
                return _json_reply(
                    False,
                    "File exists and differs.",
                    requires_confirmation=True,
                    diff=diff_text,
                )

        destination.write_text(contents, encoding="utf-8")
        return _json_reply(True, "Script saved.", path=str(destination))

    server._code_nodes_routes = True  # type: ignore[attr-defined]


register_routes()
