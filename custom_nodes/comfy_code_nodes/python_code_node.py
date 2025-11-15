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
        return {
            "required": {
                "script": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "result = input_text",
                        "placeholder": "Python code; set `result` or `result_lines`",
                    },
                ),
                "input_text": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "placeholder": "text exposed as input_text",
                    },
                ),
            },
            "optional": {
                "split_lines": ("BOOLEAN", {"default": True}),
                "strip_empty": ("BOOLEAN", {"default": True}),
            },
        }

    def run(
        self,
        script: str,
        input_text: str,
        split_lines: bool = True,
        strip_empty: bool = True,
    ) -> Tuple[str, List[str], str, str, bool]:
        """Execute *script* and expose helpers for returning data to ComfyUI."""

        stdout_buffer = io.StringIO()
        stderr = ""
        ok = True
        result_text = ""
        result_lines: List[str]
        local_ns: Dict[str, Any] = {
            "input_text": input_text,
            "lines": input_text.splitlines(),
            "result": input_text,
            "result_lines": input_text.splitlines(),
        }

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
        else:
            if not isinstance(result_lines, list):
                result_lines = []

        result_lines = [str(line) for line in result_lines]
        if strip_empty:
            result_lines = [line for line in result_lines if line.strip()]

        return result_text, result_lines, stdout, stderr, ok

