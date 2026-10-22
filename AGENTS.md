# dsh-todo-ledger/AGENTS.md

Self-contained plugin repository that turns a todo ledger into a host-level capability: an always-on prompt section + native tools + `context/` retention. This directory references nothing above it.

## Ownership

In scope: the prompt-section rules and snapshot injection, the 11 `todo_*` tools, the ledger file format, the turn-end auto-log.
Out of scope: the external todo CLI implementation; both share one Markdown format, so a format change must be verified for external compatibility.

## Layout

```
package.json            bundle declaration
cordis.patch.yml        one insert: todo-ledger -> ./lib/index.js (root is configurable)
lib/index.js            prompt section + tool registration + turn-stopping log
lib/store.js            ledger read/write: queue, index, task detail, archive, context
README.md / README_zh.md  tool table, snapshot rules, install and verification (English / Chinese)
test/smoke.mjs          host-free smoke test (not published)
```

## Data layout (written into the consuming repo)

The directory name prefers `_todo/`; a repo that already has `todo/` keeps that name. Only one of the two is recognized:

```
_todo/todo.md            queue
_todo/tasks.md           index
_todo/tasks/<slug>.md    detail (progress / blocker / related files)
_todo/archived/          closure and delivery records
_todo/context/now.md     current goal (todo_checkpoint)
_todo/context/log.md     append-only log
```

## Verification

```powershell
node test/smoke.mjs
```

- Covers: the 11 tool schemas, the prompt-section snapshot, the full lifecycle, and refusal to close a task without signoff.
- The interop check against the external todo CLI needs `TODO_CLI` pointing at its script; it is skipped when unset.

## Red lines

- State changes go through the tools only; never hand-edit the status lines in `todo.md` / `tasks.md`.
- A closure always carries `evidence` and `signoff`; do not relax it.
- Changing the prompt section or the snapshot format means updating the README and the test in the same change.
- No personal information and no machine-absolute paths; examples use `<repo-root>`.
- Format-critical literals stay Chinese on purpose (task section headings, the task-detail link label, and archived delivery-record labels) because the external todo CLI parses the same files.

## Scope of the English strings

Everything that reaches the model or the user is English: the prompt section, tool names, descriptions and parameter docs, tool output, errors, and the snapshot. Ledger scaffolding that the external CLI also reads keeps its original literals; `context/` scaffolding is this plugin's own and is English.
