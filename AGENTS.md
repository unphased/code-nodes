# Global expectations

- Always follow the instructions from `~/GLOBAL_AGENTS.md` in addition to this file.
- Please create a commit with an appropriate summary (capture every change) after
  each batch of work. Prefer a single `git commit -am "message" && git push`
  call so the log stays tidy.

# Project snapshot

This repo hosts two ComfyUI custom nodes (Shell Code + Python Code) plus a small
front-end helper that manages their widgets. The Python node supports dynamic
input slots and an optional “load script from file” workflow. Keep that workflow
intact; refer to the source for deeper details when you need them.
