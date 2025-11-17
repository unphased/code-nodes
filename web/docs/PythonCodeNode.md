# Python Code

Run inline Python scripts directly inside ComfyUI. The node exposes a rich set of helpers so you can treat your inputs as either raw text or line lists and emit both `result` and `result_lines` outputs.

## Inputs

- **script** – The Python source. Use `result` / `result_lines` to emit values and `print()` for `stdout`.
- **input1 … input20** – Multiline STRING inputs. Each field automatically appears as you type into the previous one (up to twenty total). Every input also provides `_text` and `_lines` suffix helpers inside the script regardless of the `split_lines` toggle.
- **load_from_file** – When enabled, the script text box becomes read-only and mirrors the file on disk.
- **script_filename** – Relative path inside this extension (or absolute path) to load/save when `load_from_file` is used.
- **split_lines** / **strip_empty** – Control how `input*` data and auto-generated `result_lines` behave.

## Outputs

- **result** – Whatever you assign to `result` (or `result_text`) inside the script.
- **result_lines** – A newline-delimited string assembled from the `result_lines` list you manage inside the script. When you leave it empty, the node auto-fills it by stringifying each element of a list/tuple `result` or by splitting the `result` text (respecting the `split_lines` toggle).
- **stdout** – Captures anything printed during execution.
- **stderr** – Formatted traceback when an exception occurs.
- **ok** – Boolean flag indicating success/failure.

## Helpers Available in the Script

- `inputs`, `inputs_text`, `inputs_lines` – Ordered collections of the active inputs in list-or-string form.
- `input_text` / `lines` – Aliases for the first input (`input1`).
- `script_path` – Absolute path of the file used when loading from disk (empty otherwise).
- `stdout` capture – Anything printed inside the script shows up in the node’s `stdout` output.

## File Workflow

1. Toggle **Load code from file** and set `script_filename` to a path under `custom_nodes/code-nodes/` (absolute paths are also accepted but must stay within that folder).
2. Click **Reload File** to pull the latest version of the file into the node for quick previewing.
3. Use **Save File** to push edits back to disk. If the target file already exists you will be shown a unified diff and asked to confirm the overwrite.

The node reads/writes files through the bundled backend endpoint so no additional setup is required. Reload ComfyUI after updating this extension to pick up documentation changes.
