"""Shell-based custom node utilities for ComfyUI."""

from __future__ import annotations

import subprocess
from typing import List, Tuple


class ShellCodeNode:
    """Execute a /bin/bash script with STRING input and return its output."""

    CATEGORY = "utils/code"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "LIST", "STRING", "BOOLEAN")
    RETURN_NAMES = ("stdout", "stdout_lines", "stderr", "ok")
    OUTPUT_IS_LIST = (False, True, False, False)
    INPUT_IS_LIST = False

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "script": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "cat",
                        "placeholder": "bash script to execute",
                    },
                ),
                "stdin_text": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "placeholder": "text piped to stdin",
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
        stdin_text: str,
        split_lines: bool = True,
        strip_empty: bool = True,
    ) -> Tuple[str, List[str], str, bool]:
        """Execute *script* with *stdin_text* and return stdout/lines/stderr/ok."""

        try:
            bash_path = shutil.which("bash")
            if not bash_path:
                raise FileNotFoundError("bash executable not found in PATH")
            proc = subprocess.run(
                [bash_path, "-lc", script],
                input=stdin_text,
                capture_output=True,
                text=True,
                check=False,
            )
            stdout = proc.stdout or ""
            stderr = proc.stderr or ""
            ok = proc.returncode == 0
        except Exception as exc:  # pragma: no cover - defensive fallback
            stdout = ""
            stderr = f"{type(exc).__name__}: {exc}"
            ok = False

        if split_lines:
            stdout_lines = stdout.splitlines()
            if strip_empty:
                stdout_lines = [line for line in stdout_lines if line.strip()]
        else:
            stdout_lines = []

        return stdout, stdout_lines, stderr, ok

