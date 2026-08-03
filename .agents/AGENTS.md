# Token & Performance Optimization Rules

## Excluded & Heavy Directory Rules
- NEVER search, list, or read files inside heavy dependency/build directories (`node_modules/`, `venv/`, `.venv/`, `dist/`, `build/`, `__pycache__`, `.git/`, `coverage/`).
- Do NOT read large binary, minified, or lock files (`package-lock.json`, `yarn.lock`, bundle outputs) entirely. Only inspect relevant sections if explicitly required.

## Context & Response Efficiency
- Keep context lean by targeting only specific files and exact line numbers needed for the task.
- Avoid dumping full files when small snippets or localized edits are sufficient.
- Use ripgrep/grep search targeted to source code directories (`frontend/src/`, `backend/`, `api/`) rather than scanning root recursively.
