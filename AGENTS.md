# dsh-todo-ledger/AGENTS.md

Self-contained plugin repository that turns a todo ledger into a host-level capability: an always-on prompt section + native tools + `context/` retention. This directory references nothing above it.

## Ownership

In scope: the prompt-section rules and snapshot injection, the 12 `todo_*` tools, the read-only context CLI (`todo-context`), the ledger file format, the turn-end auto-log.
Out of scope: the external todo CLI implementation; both share one Markdown format, so a format change must be verified for external compatibility. The bundled `todo-context` CLI only reads the ledger that this plugin writes.

## Layout

```
package.json            bundle declaration
cordis.patch.yml        one insert: todo-ledger -> ./lib/index.js (root is configurable)
lib/index.js            prompt section + tool registration + turn-stopping log
lib/store.js            ledger read/write: queue, index, task detail, archive, context
lib/context-contract.js envelope contract constants shared by the tool and the CLI
lib/context-reader.js   read-only context reader: dispatch() over overview/log/checkpoint/task/logs
lib/context-cli.js      argument parsing and text/JSON rendering for the CLI
bin/todo-context.mjs    `todo-context` executable that wraps lib/context-cli.js
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
node bin/todo-context.mjs --action overview
```

- Covers: the 12 tool schemas, the prompt-section snapshot, the full lifecycle, and refusal to close a task without signoff.
- The CLI check is a read-only smoke run: it must print a `ready` envelope and exit 0. `--json` returns the same envelope the `todo_context` tool returns.
- The interop check against the external todo CLI needs `TODO_CLI` pointing at its script; it is skipped when unset.

## Red lines

- The ledger markdown is never hand-edited: the status lines in `todo.md`, the `tasks.md` index, and a task file's frontmatter are owned by the tools, and every state change goes through `todo_add` / `todo_status` / `todo_complete` / `todo_archive` so all three stay in sync.
- A closure always carries `evidence` and `signoff`; do not relax it.
- Changing the prompt section or the snapshot format means updating the README and the test in the same change.
- No personal information and no machine-absolute paths; examples use `<repo-root>`.
- Ledger templates ship in English and Chinese; the calling agent chooses one per ledger through the `language` parameter, and the plugin writes the chosen form and reads both. The labels of the chosen form are canonical for that ledger: adding or renaming one means updating that table in `lib/format.js`, the prompt section, the snapshot, and `test/smoke.mjs` in the same change.

## Language of the tool text and the scaffold

Everything that reaches the model or the user stays English: the prompt section, tool names, descriptions and parameter docs, tool output, errors, and the snapshot.

The ledger scaffold ships in two written forms, English and Chinese: the task section headings, the task-detail link label, the archived delivery-record field labels, and the `context/` files.

The calling agent picks one for a ledger through the `language` parameter, the plugin writes that form from then on, and the ledger remembers it; English is the default, so a caller outside a Chinese-speaking locale gets an English ledger.

Both written forms are read through the single table in `lib/format.js`, so a ledger written from either template — including one created by a version that wrote English only — keeps working.

Content an agent writes inside those sections is free-form and may be in any language; the plugin neither rewrites it nor requires a particular language.
