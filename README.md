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

## Installation

Clone this repository directly into `ComfyUI/custom_nodes` or install it via
ComfyUI Manager once published. During installation ComfyUI automatically
executes `pip install -r requirements.txt` for each custom node, so declaring
dependencies in that file is all that is required for normal setups.

### Testing inside Docker

If you run ComfyUI inside a Docker container you can manually trigger the same
dependency install step with:

```bash
docker exec -it <comfy_container_name> bash -lc \
  "cd /opt/ComfyUI/custom_nodes/code-nodes && pip install -r requirements.txt"
```

Replace `/opt/ComfyUI` with the root of your ComfyUI checkout if it differs.
Running that command ensures the requirements resolve exactly the way ComfyUI
Manager would during a fresh install.

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
| `input_slots`| INT     | Optional (default `5`, max `12`). Controls how many `input*` widgets are visible. |
| `split_lines`| BOOLEAN | Optional (default `True`).                             |
| `strip_empty`| BOOLEAN | Optional (default `True`).                             |

Outputs `(result, result_lines, stdout, stderr, ok)` where:

- `result` comes from the `result` (or `result_text`) variable inside the script.
- `result_lines` can be directly assigned inside the script, otherwise it will
  be auto-populated from `result` when splitting is enabled.
- `stdout` captures anything printed by the script.
- `stderr` contains the formatted traceback if an exception occurs.
- `ok` is `True` when the script executes without raising.

Inside the Python script you always get:

- `input1` … `input12` (up to the configured slot count): each is either a `list[str]` (when `split_lines=True`)
  or a raw string when line splitting is disabled. Every input also exposes
  `_text` and `_lines` variants (e.g., `input3_text`, `input3_lines`) so you
  can work with whichever format you prefer regardless of the checkbox state.
- `inputs`: ordered collection of all *active* inputs (count comes from the
  `Input Slots` control). `inputs[n]` mirrors `input{n+1}` and respects
  `split_lines`, while `inputs_text`/`inputs_lines` provide string-or-list
  versions regardless of the toggle.
- `input_text`/`lines`: convenient aliases for `input1_text` and
  `input1_lines`.
- `result`/`result_lines`: start empty; assign to them when you want to emit
  values. If you only populate `result`, the node will automatically split it
  into `result_lines` (respecting the `split_lines`/`strip_empty` settings).
  Manually assigned `result_lines` are returned exactly as provided (after
  optional whitespace stripping) and are never truncated.

Both nodes are intentionally minimal wrappers over standard interpreters and do
**not** provide sandboxing. Only run them on systems you control and never
expose them to untrusted input.
