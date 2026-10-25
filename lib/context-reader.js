import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  STATES,
  checkpointInfo,
  discover,
  findRoot,
  layout,
  ledgerPresent,
  logDirectory,
  logEntry,
  overview,
  readState,
  readTask,
  taskDirectory,
} from './store.js'
import {
  ACTIONS,
  COVERAGE,
  EXIT_CODES,
  STATUS,
  byteLength,
  clampText,
  decodeCursor,
  encodeCursor,
  failEnvelope,
  makeEnvelope,
  revisionOf,
  validateSelectors,
} from './context-contract.js'

const DEFAULT_LIMIT = 10
const DEFAULT_LOG_LIMIT = 5
const DEFAULT_MAX_BYTES = 4000

export function exitCodeFor(status) {
  return EXIT_CODES[status] ?? 1
}

function clamp(value, maxBytes) {
  return clampText(value, maxBytes).text
}

function locate(root, cwd) {
  const startDir = cwd || process.cwd()
  if (root) {
    const L = layout(root)
    return ledgerPresent(L) ? { L } : { absent: L }
  }
  const found = discover(startDir)
  if (found?.layout) return found.present ? { L: found.layout } : { absent: found.layout }
  const foundRoot = findRoot(startDir)
  return { absent: foundRoot ? layout(foundRoot) : { root: startDir, dir: startDir } }
}

function absentEnvelope(action, absent) {
  return failEnvelope(
    action,
    absent?.root || absent?.dir,
    STATUS.absent,
    'no ledger found: expected _todo/ or todo/ above the given path',
    {
      hint: 'pass --root <path-to-ledger-root> or run this from inside the project that holds _todo/',
    },
  )
}

function invalidEnvelope(action, root, errors) {
  return failEnvelope(action, root, STATUS.invalid, 'invalid request', {
    diagnostics: errors,
    hint: 'run --help for the accepted parameters of each action',
  })
}

function pageRows(rows, params) {
  const limit = params.limit ?? DEFAULT_LIMIT
  const decoded = decodeCursor(params.cursor)
  const offset = decoded ? decoded.o : 0
  const window = rows.slice(offset, offset + limit)
  const nextOffset = offset + window.length
  return {
    rows: window,
    total: rows.length,
    offset,
    nextCursor: nextOffset < rows.length ? nextOffset : undefined,
    omits: nextOffset < rows.length,
  }
}

function readArchiveTask(L, slug, maxBytes) {
  const path = join(L.archived, `${slug}.md`)
  if (!existsSync(path)) return undefined
  const text = readFileSync(path, 'utf8')
  const clipped = clampText(text, maxBytes)
  return {
    slug,
    archived: true,
    path,
    bytes: byteLength(text),
    body: clipped.text,
    truncated: clipped.truncated,
  }
}

function actOverview(L, action, params) {
  const data = overview(L)
  return makeEnvelope({
    action,
    root: L.root,
    revision: revisionOf(L),
    status: STATUS.ready,
    coverage: COVERAGE.partial,
    data,
    hint: 'narrow next: --action tasks, --action task --slug <slug>, --action logs, --action log --id <n>',
  })
}

function actTasks(L, action, params) {
  const rows = taskDirectory(L, { status: params.status })
  const page = pageRows(rows, params)
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_BYTES
  return makeEnvelope({
    action,
    root: L.root,
    revision: revisionOf(L),
    status: STATUS.ready,
    coverage: page.omits ? COVERAGE.partial : COVERAGE.complete,
    data: {
      total: page.total,
      shown: page.rows.length,
      offset: page.offset,
      tasks: page.rows.map((row) => ({
        slug: row.slug,
        status: row.status,
        title: clamp(row.title, maxBytes),
        staleDays: row.staleDays,
        dependsOn: row.dependsOn,
        progress: row.progress ? clamp(row.progress, maxBytes) : undefined,
        blocker: row.blocker ? clamp(row.blocker, maxBytes) : undefined,
      })),
    },
    cursor: page.nextCursor !== undefined ? encodeCursor(revisionOf(L), page.nextCursor) : undefined,
    hint: page.omits
      ? 'more rows exist: pass --cursor from this envelope, or filter with --status'
      : 'full text for one task: --action task --slug <slug>',
  })
}

function actTask(L, action, params) {
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_BYTES
  if (params.archive) {
    const archived = readArchiveTask(L, params.slug, maxBytes)
    if (!archived) {
      return failEnvelope(action, L.root, STATUS.absent, `archived task not found: ${params.slug}`, {
        hint: 'list active tasks with --action tasks',
      })
    }
    return makeEnvelope({
      action,
      root: L.root,
      revision: revisionOf(L),
      status: STATUS.ready,
      coverage: archived.truncated ? COVERAGE.partial : COVERAGE.complete,
      data: archived,
      hint: 'raise --max-bytes for more of the file, or read it directly',
    })
  }
  const task = readTask(L, params.slug)
  if (!task) {
    return failEnvelope(action, L.root, STATUS.absent, `task not found: ${params.slug}`, {
      hint: 'list active slugs with --action tasks',
    })
  }
  const body = String(task.body ?? '')
  const section = params.section ? sectionOf(body, params.section) : body
  if (section === undefined) {
    return failEnvelope(action, L.root, STATUS.absent, `section not found: ${params.section}`, {
      hint: 'sections are the ## headings of the task file',
    })
  }
  const clipped = clampText(section, maxBytes)
  return makeEnvelope({
    action,
    root: L.root,
    revision: revisionOf(L),
    status: STATUS.ready,
    coverage: clipped.truncated ? COVERAGE.partial : COVERAGE.complete,
    data: {
      slug: params.slug,
      title: task.meta?.title,
      status: task.meta?.status,
      updated: task.meta?.updated,
      dependsOn: task.meta?.depends_on,
      blockerCause: task.meta?.blocker_cause,
      path: task.path,
      section: params.section,
      bytes: byteLength(section),
      body: clipped.text,
      truncated: clipped.truncated,
    },
    hint: clipped.truncated
      ? 'raise --max-bytes, or pass --section <heading> to read one section'
      : 'read the file directly if you need the untouched text',
  })
}

function sectionOf(body, heading) {
  const lines = body.split('\n')
  const wanted = String(heading).trim().toLowerCase()
  let active = false
  const out = []
  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match) {
      if (active) break
      active = match[1].toLowerCase() === wanted
      continue
    }
    if (active) out.push(line)
  }
  if (!active && out.length === 0) {
    const found = lines.some((line) => {
      const match = /^##\s+(.+?)\s*$/.exec(line)
      return Boolean(match) && match[1].toLowerCase() === wanted
    })
    if (!found) return undefined
  }
  return out.join('\n').trim()
}

function actCheckpoint(L, action, params) {
  const info = checkpointInfo(L, { maxChars: params.maxBytes ?? DEFAULT_MAX_BYTES })
  if (!info) {
    return failEnvelope(action, L.root, STATUS.absent, 'context/now.md does not exist yet', {
      hint: 'run todo_checkpoint to write the current goal and next step',
    })
  }
  return makeEnvelope({
    action,
    root: L.root,
    revision: revisionOf(L),
    status: STATUS.ready,
    coverage: COVERAGE.partial,
    data: info,
    hint: 'full file: context/now.md inside the ledger directory',
  })
}

function actLogs(L, action, params) {
  const limit = params.limit ?? DEFAULT_LOG_LIMIT
  const decoded = decodeCursor(params.cursor)
  const before = decoded ? decoded.o : undefined
  const directory = logDirectory(L, { limit, before, maxChars: params.maxBytes ?? 240 })
  const nextBefore = directory.cursor
  return makeEnvelope({
    action,
    root: L.root,
    revision: revisionOf(L),
    status: STATUS.ready,
    coverage: nextBefore !== undefined ? COVERAGE.partial : COVERAGE.complete,
    data: {
      path: L.log,
      total: directory.total,
      shown: directory.rows.length,
      entries: directory.rows.map((row) => ({
        ref: row.ref,
        id: row.id,
        legacy: row.legacy,
        time: row.time,
        chars: row.chars,
        summary: row.summary,
      })),
    },
    cursor: nextBefore !== undefined ? encodeCursor(revisionOf(L), nextBefore) : undefined,
    hint: 'full text of one entry: --action log --id <n>',
  })
}

function actLog(L, action, params) {
  const found = logEntry(L, params.id)
  if (!found) {
    return failEnvelope(action, L.root, STATUS.absent, `log entry not found: ${params.id}`, {
      hint: 'list entry ids with --action logs',
    })
  }
  const clipped = clampText(found.text, params.maxBytes ?? 32768)
  return makeEnvelope({
    action,
    root: L.root,
    revision: revisionOf(L),
    status: STATUS.ready,
    coverage: clipped.truncated ? COVERAGE.partial : COVERAGE.complete,
    data: {
      ref: found.ref,
      id: found.id,
      legacy: found.legacy,
      time: found.time,
      path: L.log,
      bytes: byteLength(found.text),
      text: clipped.text,
      truncated: clipped.truncated,
    },
    hint: 'list neighbouring entries with --action logs',
  })
}

const HANDLERS = {
  overview: actOverview,
  tasks: actTasks,
  task: actTask,
  checkpoint: actCheckpoint,
  logs: actLogs,
  log: actLog,
}

export function readContext(params) {
  const request = { ...(params || {}) }
  const action = request.action === undefined ? 'overview' : String(request.action).toLowerCase()
  request.action = action
  const errors = validateSelectors(request)
  if (errors.length) {
    return invalidEnvelope(action, request.root, errors)
  }
  const located = locate(request.root, request.cwd)
  if (located.absent) {
    return absentEnvelope(action, located.absent)
  }
  const L = located.L
  const handler = HANDLERS[action]
  if (!handler) {
    return invalidEnvelope(action, L.root, [`unknown action: ${action}, expected one of ${ACTIONS.join(', ')}`])
  }
  try {
    return handler(L, action, request)
  } catch (error) {
    return failEnvelope(action, L.root, STATUS.error, String(error?.message || error), {
      hint: 'the ledger may be mid-write; retry, or run todo_doctor to check consistency',
    })
  }
}

export function dispatch(request) {
  return readContext(request)
}

export { STATES, EXIT_CODES }
