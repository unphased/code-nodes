"""Python-based custom node utilities for ComfyUI."""

from __future__ import annotations

import io
import traceback
from contextlib import redirect_stdout
from pathlib import Path
from typing import Any, Dict, List, Tuple


class PythonCodeNode:
    """Execute Python code with helpers for working with ComfyUI strings."""

    CATEGORY = "utils/code"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "LIST", "STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("result", "result_lines", "stdout", "stderr", "ok")
    OUTPUT_IS_LIST = (False, True, False, False, False)
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

        optional_inputs = {
            "input_slots": (
                "INT",
                {
                    "default": cls.DEFAULT_INPUT_SLOTS,
                    "min": 1,
                    "max": cls.MAX_INPUT_SLOTS,
                    "step": 1,
                    "display": "number",
                },
            )
        }
        for slot in range(2, cls.MAX_INPUT_SLOTS + 1):
            optional_inputs[f"input{slot}"] = ("STRING", multiline_str(f"input{slot}"))
        optional_inputs.update(
            {
                "load_from_file": ("BOOLEAN", {"default": False}),
                "script_filename": (
                    "STRING",
                    {
                        "default": "",
                        "multiline": False,
                        "placeholder": "Relative to this extension (e.g., scripts/example.py)",
                    },
                ),
                "split_lines": ("BOOLEAN", {"default": True}),
                "strip_empty": ("BOOLEAN", {"default": True}),
            }
        )

        return {
            "required": {
                "script": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "result = input1",
                        "placeholder": "Set result/result_lines; access raw data via inputs[*] (configure Input Count & split_lines below).",
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
    ) -> Tuple[str, List[str], str, str, bool]:
        """Execute *script* and expose helpers for returning data to ComfyUI."""

        stdout_buffer = io.StringIO()
        stderr = ""
        ok = True
        result_text = ""
        result_lines: List[str]
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
        inputs_payload = input_line_sets[:active_inputs] if split_lines else normalized_inputs[:active_inputs]
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
        }

        for index, text_value in enumerate(normalized_inputs, start=1):
            lines = input_line_sets[index - 1]
            local_ns[f"input{index}_text"] = text_value
            local_ns[f"input{index}_lines"] = lines
            local_ns[f"input{index}"] = lines if split_lines else text_value

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
                result_lines = []
            elif isinstance(result_lines_value, list):
                result_lines = result_lines_value
            else:
                result_lines = list(result_lines_value)
        except Exception:  # pragma: no cover - safety against runtime errors
            ok = False
            result_text = ""
            result_lines = []
            stderr = traceback.format_exc()

        stdout = stdout_buffer.getvalue()

        if split_lines:
            auto_lines = result_text.splitlines()
            if strip_empty:
                auto_lines = [line for line in auto_lines if line.strip()]
            if not result_lines:
                result_lines = auto_lines

        result_lines = [str(line) for line in result_lines]
        if strip_empty:
            result_lines = [line for line in result_lines if line.strip()]

        return result_text, result_lines, stdout, stderr, ok
