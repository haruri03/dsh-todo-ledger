# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-10-25

Progressive context disclosure: an agent now reads a short index first and pulls one log entry or one
task body only when it needs the detail, instead of carrying the whole ledger in every request. The
scaffold language is now the caller's choice instead of being fixed to English: a ledger keeps that
choice, both written forms are read, and both READMEs diagram how the plugin works.

### Added

- **`todo_context`, a read-only context tool** with five actions: `overview` (counts, stale
  accounting, checkpoint age, recent entry ids), `log` (one entry by id), `logs` (a bounded page of
  entry summaries), `checkpoint` (the current `now.md` plus its age), and `task` (an optional single
  section of a task file). Every call returns an envelope carrying a ledger `revision`, a `coverage`
  marker and a `hint` naming the exact next call, so a caller never has to guess or over-read.
- **`todo-context`, a standalone read-only CLI** (`bin/todo-context.mjs`, installed as the
  `todo-context` bin). It exposes the same envelope as JSON (`--json`) or as compact text, resolves the
  ledger from the working directory, and exits `0` ready / `2` usage / `3` absent / `4` not found.
- Log entries now carry a stable id: `appendLog` writes `- <timestamp> [#N] <text>`, and `logEntry` /
  `logs` address entries by `L<N>`. Entries written before this release stay readable and keep a
  positional reference.
- `store.js` gained pure read paths (`readState`, `ledgerPresent`, `discover`) so a read never creates
  directories or touches the ledger.
- **`language` parameter on `todo_init` and `todo_add`** — `en` (default) or `zh`. The ledger records
  the choice in `context/language`, and later writes reuse it without asking again.
- **Mechanism diagrams in the README** — Mermaid graphs for the data flow between the host, the
  plugin and the ledger files, the task state machine, the progressive-disclosure read path, and the
  language selection. Both `README.md` and `README_zh.md` carry the same four diagrams.

### Changed

- **The prompt section and the snapshot describe the new reading order** — start with `overview`, then
  fetch a single `log` or `task` section — and distinguish "no ledger here" from "empty ledger".
- The injected snapshot no longer grows with the log: it shows the ledger revision, the staleness
  accounting and the last three entry summaries with their ids, then points at `todo_list` /
  `todo_show` / `todo_context` for anything deeper.
- Snapshot cost is bounded by a character budget that trims the body first and always keeps the
  closing hint, so a long ledger cannot crowd out the model's actual task.

### Fixed

- A missing `_todo/` directory is reported as `**no** _todo/` instead of reading like an empty ledger,
  which previously invited an unnecessary `todo_init`.

### Compatibility

- The scaffold ships in two written forms — task section headings, the task-detail link label, the
  archived delivery-record field labels, and the `context/` files are written from one table in
  `lib/format.js`, in English or Chinese. English stays the default, so a caller outside a
  Chinese-speaking locale gets an English ledger.
- Both forms are read through the same alias table, so a ledger written from either template —
  including one created by a version that wrote English only — reads and updates normally. File bodies
  stay free-form: an agent or the owner may write a goal, a note or a delivery record in any language,
  and nothing rewrites it.

## [0.3.1] - 2026-10-24

A follow-up on the floating window: its surface now matches the host's own floating panels, and the
status colours are the ones the panel has always used.

### Fixed

- **The window surface no longer reads as a lighter grey than everything around it.** It used
  `--dsw-alias-bg-overlay`, which resolves to a mid grey in the dark theme. It now takes the raised
  layer the host's own floating panels use: `--dsw-alias-bg-layer-1`, a `--dsw-alias-border-l2`
  border, a 14px radius and the same two-layer shadow.

### Changed

- **Status colours are the previous palette again** — blue in progress, slate to do, violet awaiting
  review, red blocked. Only the accept action and error text use the host state tokens.
- Count chips and task rows stay on `--dsw-alias-bg-layer-2` with a `--dsw-alias-border-l1` border,
  and section titles, slugs and the footer use `--dsw-alias-label-secondary`.

### Added

- A storefront icon (`assets/icon-180.png`, rendered from `assets/icon.svg`) and `screenshots.json`
  declaring the sidebar and floating-window captures.
- Install-from-npm instructions in both READMEs, plus the npm version badge.

## [0.3.0] - 2026-10-24

The release that gives the ledger a window of its own, and keeps every view on the session you are
actually looking at.

### Added

- **Floating ledger window.** A `Todo` control under the composer opens a frame-wide window with the
  same sections and sign-off action as the sidebar panel. Drag its header to move it, drag the
  bottom-right grip to resize it (240×180 minimum, clamped to the viewport), and the box is restored
  the next time it opens. Only the task list scrolls, so the counts row and the footer stay put however
  long the queue gets.
- **Collapsible status groups.** Click a group header to fold it. Clicking a status count expands that
  group and aligns its header to the top of the list, which keeps a long queue navigable without
  dragging the chat page behind the window.
- **The window follows the session in front.** Switching sessions re-targets an open floating window
  to the new session's workspace instead of leaving it on the session that opened it.

### Changed

- The floating window starts at its status counts: the duplicate plugin name and in-body collapse from
  the previous iteration are gone, because its own header already names the panel.
- The composer control reads as a plain dock item (`Todo`, the book icon, dock font and hover
  treatment) rather than a filled chip.

### Fixed

- The sidebar panel kept showing the previous ledger after switching to a session in another
  workspace: the tab registration froze the session injected when it was created. It now reads the
  session the slot dispatches, keeps one resource and one request per session, and re-reads when the
  window comes back into focus.

## [0.2.0] - 2026-10-24

The release that turns the ledger from a prompt-only capability into something you can watch and
sign off without leaving the conversation.

### Added

- **Sidebar ledger panel.** A read-only tab in the right sidebar shows the ledger of the current
  session's working directory: `doing`, `todo`, `review` and `blocked` sections with counts, a
  colour per state, and a fixed order so the shape of the queue reads at a glance. It opens from the
  sidebar guide capsule and polls only while visible.
- **Sign a review task off from the panel.** Each task under `review` carries an accept action; it
  archives through the same path as `todo_complete` and records the click as both evidence and
  sign-off (`accepted from the ledger panel at <ISO timestamp>`). Only `review` tasks can be accepted
  this way; other states are refused with an inline error.
- **Host routes for the panel:** `GET /todo-ledger/projection?sessionId=…` returns the ledger
  projection, and `GET /todo-ledger/complete?slug=…&sessionId=…` performs the single side-effecting
  call. Both are registered as `prefix` routes and dispatched as `GET`, which is what the host's
  plugin route layer supports.
- **Dependencies between tasks.** `todo_add` now accepts `depends_on` and `blocker_cause`; a task
  whose predecessors are not yet finished is created as `blocked` with the dependency recorded, and
  is created directly as `todo` when they already are. Unknown, dropped, self-referential and
  circular predecessors are rejected.
- **Automatic unblocking on formal completion.** Completing a predecessor through `todo_complete` (or
  the panel) promotes its dependents to `todo` once *all* predecessors are formally completed. A
  `review` state, a dropped archive, or a manual blocker never unblocks anything, and hand-edited
  state cannot fake it.

### Changed

- The prompt section's hand-edit ban now names the three tool-owned surfaces explicitly — the status
  lines in `todo.md`, the `tasks.md` index, and a task file's frontmatter — and points at
  `todo_doctor` when they disagree, instead of the earlier catch-all wording.
- `README.md` and `README_zh.md` gained a sidebar panel section covering the opt-in entry point,
  section ordering, visible-only polling, what acceptance records, and the restart/refresh boundary.

### Fixed

- Registering the ledger no longer takes the session down when one of its parts fails; the feature
  degrades instead, and the failing file and line are named.
- The prompt section no longer breaks session startup when a ledger file contains a `{{`-like
  literal (such as another plugin's macro shell); such braces are rendered inert.
- Agent-written ledger content that would corrupt the state machine is flagged for rewrite instead
  of being written silently.
- The accept call no longer fails with `HTTP 405`: the client sends `GET` with query parameters, and
  the handler acts on whichever carrier holds the slug.

## [0.1.0]

First release: the resident prompt section, the eleven `todo_*` tools, the ledger file format
(`_todo/` preferred, legacy `todo/` supported), and the `context/` retention files.
