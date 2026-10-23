# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
