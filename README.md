# ComfyUI Code Nodes

This repository provides two lightweight execution helpers for ComfyUI graphs:

- **Shell Code** – run arbitrary `/bin/bash` scripts with STRING input and capture
the stdout as both text and (optionally) a LIST of lines.
- **Python Code** – run inline Python snippets that operate on a provided string
and expose structured results, captured stdout, and error information.

## Repository layout

```
custom_nodes/
  comfy_code_nodes/
    __init__.py          # exports both node classes
    shell_code_node.py   # Shell Code node implementation
    python_code_node.py  # Python Code node implementation
requirements.txt         # empty placeholder (no deps)
```

Clone this repository directly into `ComfyUI/custom_nodes` or install it via
ComfyUI Manager once published.

## Node overview

### Shell Code

| Input        | Type    | Notes                                      |
| ------------ | ------- | ------------------------------------------ |
| `script`     | STRING  | Multiline bash script, default `cat`.       |
| `stdin_text` | STRING  | Text piped to stdin.                        |
| `split_lines`| BOOLEAN | Optional (default `True`).                  |
| `strip_empty`| BOOLEAN | Optional (default `True`).                  |

Outputs `(stdout, stdout_lines, stderr, ok)` where `stdout_lines` is marked as a
LIST output to allow wiring into other nodes.

### Python Code

| Input        | Type    | Notes                                                  |
| ------------ | ------- | ------------------------------------------------------ |
| `script`     | STRING  | Python code executed with `input_text` in scope.       |
| `input_text` | STRING  | Text value available to the script.                    |
| `split_lines`| BOOLEAN | Optional (default `True`).                             |
| `strip_empty`| BOOLEAN | Optional (default `True`).                             |

Outputs `(result, result_lines, stdout, stderr, ok)` where:

- `result` comes from the `result` (or `result_text`) variable inside the script.
- `result_lines` can be directly assigned inside the script, otherwise it will
  be auto-populated from `result` when splitting is enabled.
- `stdout` captures anything printed by the script.
- `stderr` contains the formatted traceback if an exception occurs.
- `ok` is `True` when the script executes without raising.

Both nodes are intentionally minimal wrappers over standard interpreters and do
**not** provide sandboxing. Only run them on systems you control and never
expose them to untrusted input.

