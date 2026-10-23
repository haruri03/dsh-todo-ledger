# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
