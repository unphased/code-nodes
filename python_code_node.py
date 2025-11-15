"""Python-based custom node utilities for ComfyUI."""

from __future__ import annotations

import io
import traceback
from contextlib import redirect_stdout
from typing import Any, Dict, List, Tuple


class PythonCodeNode:
    """Execute Python code with helpers for working with ComfyUI strings."""

    CATEGORY = "utils/code"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "LIST", "STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("result", "result_lines", "stdout", "stderr", "ok")
    OUTPUT_IS_LIST = (False, True, False, False, False)
    INPUT_IS_LIST = False

    @classmethod
    def INPUT_TYPES(cls):
        multiline_str = {
            "multiline": True,
            "default": "",
            "placeholder": "text exposed as input",
        }
        return {
            "required": {
                "script": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "result = input1",
                        "placeholder": "Python code; set `result` or `result_lines`",
                    },
                ),
                "input1": ("STRING", multiline_str),
            },
            "optional": {
                "input2": ("STRING", multiline_str),
                "input3": ("STRING", multiline_str),
                "input4": ("STRING", multiline_str),
                "input5": ("STRING", multiline_str),
                "split_lines": ("BOOLEAN", {"default": True}),
                "strip_empty": ("BOOLEAN", {"default": True}),
            },
        }

    def run(
        self,
        script: str,
        input1: str = "",
        input2: str = "",
        input3: str = "",
        input4: str = "",
        input5: str = "",
        split_lines: bool = True,
        strip_empty: bool = True,
    ) -> Tuple[str, List[str], str, str, bool]:
        """Execute *script* and expose helpers for returning data to ComfyUI."""

        stdout_buffer = io.StringIO()
        stderr = ""
        ok = True
        result_text = ""
        result_lines: List[str]
        inputs = [input1, input2, input3, input4, input5]
        normalized_inputs: List[str] = []
        for value in inputs:
            if value is None:
                normalized_inputs.append("")
            else:
                normalized_inputs.append(str(value))
        primary_input = normalized_inputs[0]
        primary_lines = primary_input.splitlines()
        local_ns: Dict[str, Any] = {
            "input_text": primary_input,
            "lines": primary_lines,
            "result": primary_input,
            "result_lines": primary_lines,
        }

        for index, text_value in enumerate(normalized_inputs, start=1):
            lines = text_value.splitlines()
            local_ns[f"input{index}_text"] = text_value
            local_ns[f"input{index}_lines"] = lines
            local_ns[f"input{index}"] = lines if split_lines else text_value

        try:
            with redirect_stdout(stdout_buffer):
                exec(script, {}, local_ns)
            result_value = local_ns.get("result", "")
            result_text = "" if result_value is None else str(result_value)
            result_lines = local_ns.get("result_lines", [])
            if not isinstance(result_lines, list):
                result_lines = list(result_lines)
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

