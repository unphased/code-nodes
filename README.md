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
| `load_from_file` | BOOLEAN | Optional (default `False`). When enabled the script is loaded from disk and the inline editor becomes read-only. |
| `script_filename` | STRING | Optional (hidden unless `load_from_file=True`). Relative path (inside this extension directory) to the script that should be executed. |
| `split_lines`| BOOLEAN | Optional (default `True`).                             |
| `strip_empty`| BOOLEAN | Optional (default `True`).                             |
| `delimiter`  | STRING  | Optional custom delimiter for splitting inputs. Leave blank to rely solely on newline parsing. |

Outputs `(result, result_lines, stdout, stderr, ok)` where:

- `result` comes from the `result` (or `result_text`) variable inside the script.
- `result_lines` is returned as a newline-delimited string, assembled from the
  `result_lines` list you manage inside the script. If you leave the list empty,
  the node auto-populates it either by splitting `result` (when `split_lines`
  is enabled) or by formatting each element of a list/tuple result so that
  nested lists become comma-delimited strings (e.g., `['a', 'b'] → "a, b"`).
  Treat `result_lines` inside Python as a list; the node converts it to text
  when emitting.
- `stdout` captures anything printed by the script.
- `stderr` contains the formatted traceback if an exception occurs.
- `ok` is `True` when the script executes without raising.

Inside the Python script you always get:

- `input1` … `input20` (up to the configured slot count): each is either a `list[str]` (when `split_lines=True`)
  or a raw string when line splitting is disabled. Every input also exposes
  `_text` and `_lines` variants (e.g., `input3_text`, `input3_lines`) so you
  can work with whichever format you prefer regardless of the checkbox state.
- `inputs`: ordered collection of all *active* inputs. New `input*` widgets
  appear automatically as you type, up to 20 total. `inputs[n]` mirrors
  `input{n+1}` and becomes a `list[str]` whenever either the `delimiter`
  field is populated or `split_lines=True`. Otherwise it remains a string.
  `inputs_text`/`inputs_lines` provide string-or-list versions regardless of
  the toggle (newline splitting drives the `_lines` variants).
- `input_text`/`lines`: convenient aliases for `input1_text` and
  `input1_lines`.
- `script_path`: absolute filesystem path of the file used when `load_from_file`
  is enabled, otherwise an empty string.
- `delimiter`: the currently configured delimiter string (blank when unused).
- `result`/`result_lines`: start empty; assign to them when you want to emit
  values. Inside your script, treat `result_lines` as a list of strings. If you
  only populate `result`, the node will automatically either convert each item
  of a list/tuple result into its own comma-delimited line or split the string output into
  lines (respecting the `split_lines`/`strip_empty` settings). Before returning,
  the node converts the list to a newline-delimited string for the
  `result_lines` output socket.

Additional `input*` widgets appear automatically as you fill in the last visible
field, up to twenty total, so you never have to manage an explicit “Input Count”.

#### Loading scripts from files

Toggle **Load code from file** when you want to keep the main script in a real
editor on disk. When the toggle is enabled:

- The script textbox becomes read-only so it mirrors whatever is on disk.
- The `script_filename` widget (always visible) lets you type a path relative to
  the `code-nodes` extension directory. For safety, the built-in saver only
  writes inside that directory.
- The helper fetches the file over ComfyUI's `/extensions/...` static server so
  the code preview inside the node keeps up with the file contents. Use the
  dedicated **Reload File** button (or the node's right-click menu →
  **Reload Script Preview**) after editing the file to pull in the latest
  version.
- Need to push changes back to disk? Click **Save File** next to the reload
  button. If the target file already exists you'll get a unified diff in a
  confirmation dialog before the node overwrites it.
- During execution the node reads the same file directly from the filesystem so
  you can keep iterating in your own editor without copy/paste loops.

Both nodes are intentionally minimal wrappers over standard interpreters and do
**not** provide sandboxing. Only run them on systems you control and never
expose them to untrusted input.
