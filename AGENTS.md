please create a commit with an appropriate summary message (it can be a paragraph long! capture everything the change
does!) after every change that is made.

I prefer you to just make one call to do this, with git commit -am. 

# Agents Guide

This repository ships two custom nodes for ComfyUI (Shell Code and Python
Code). When iterating on either node keep the following constraints in mind so
other agents can modify the project confidently.

## Python Code node

- Supports up to 20 `input*` widgets. The `input_slots` control (plus the helper
  menu entry **Apply Input Count**) shows/hides those widgets and resizes the
  node. Do not remove this dynamic behaviour.
- The widgets expose both `input*_text` and `input*_lines` helpers. The script
  editor placeholder text must continue to explain how `split_lines` affects the
  data type (string vs. list of strings) so users know what shows up in their
  variables.
- Users can now toggle **Load code from file**. When enabled:
  - The new `script_filename` widget appears (hidden otherwise).
  - The inline script area becomes read-only and mirrors the file contents.
  - The `script_path` variable (absolute path) is exposed to the executing
    script, while the inline editor is purely for preview.
  - The helper adds both an in-node **Reload File** button and a context-menu
    entry **Reload Script Preview** to refetch the file through the
    `/extensions/{extension}/...` static server.
- The backend reads scripts relative to the extension directory by default, but
  it also accepts absolute paths. Any failure to read the file must surface as a
  `stderr` message with `ok=False`.

## Front-end helper (`web/code_node_placeholders.js`)

- Owns every UI enhancement: placeholder text, `split_lines` watchers, node
  resizing, input count menu entry, and script-file preview logic.
- Uses a small stylesheet injected at runtime for read-only styling. Keep new
  rules inside the helper so installations do not rely on extra bundling steps.
- Fetches file previews via relative URLs derived from `import.meta.url`. Any
  new asset must stay within the same extension directory to avoid CORS issues.
- The **Reload File** button is implemented as a LiteGraph button widget; keep it
  hidden unless `load_from_file` is enabled.

## Documentation

- Update `README.md` whenever behaviour changes (inputs, helper variables,
  frontend workflow, etc.).
- Keep this `agents.md` file in sync with architectural changes so future agents
  can ramp up quickly.
