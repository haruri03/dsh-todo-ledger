import { statSync } from 'node:fs'

export const STATUS = Object.freeze({
  ready: 'ready',
  absent: 'absent',
  invalid: 'invalid',
  inconsistent: 'inconsistent',
  error: 'error',
})

export const COVERAGE = Object.freeze({ complete: 'complete', partial: 'partial' })

export const ACTIONS = Object.freeze(['overview', 'tasks', 'task', 'checkpoint', 'logs', 'log'])

export const EXIT_CODES = Object.freeze({ ready: 0, absent: 0, invalid: 2, inconsistent: 1, error: 1 })

const LIMIT_MIN = 1
const LIMIT_MAX = 200
const BYTES_MIN = 200
const BYTES_MAX = 32768

export function byteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8')
}

export function byteLengthOf(value) {
  try {
    return byteLength(JSON.stringify(value))
  } catch {
    return 0
  }
}

export function clampText(value, maxBytes) {
  const text = String(value ?? '')
  if (byteLength(text) <= maxBytes) return { text, truncated: false }
  const chars = Array.from(text)
  let lo = 0
  let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (byteLength(chars.slice(0, mid).join('')) <= Math.max(0, maxBytes - 3)) lo = mid
    else hi = mid - 1
  }
  return { text: chars.slice(0, lo).join('') + '…', truncated: true }
}

function stamp(path) {
  try {
    return String(Math.round(statSync(path).mtimeMs))
  } catch {
    return '0'
  }
}

export function revisionOf(L) {
  return [stamp(L.index), stamp(L.tasks), stamp(L.log), stamp(L.now)].join('.')
}

export function encodeCursor(revision, offset) {
  return Buffer.from(JSON.stringify({ r: revision, o: offset }), 'utf8').toString('base64url')
}

export function decodeCursor(cursor) {
  if (!cursor) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'))
    if (!parsed || typeof parsed.r !== 'string' || !Number.isInteger(parsed.o) || parsed.o < 0) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function makeEnvelope(fields) {
  const out = {
    status: fields.status ?? STATUS.ready,
    action: fields.action,
    root: fields.root,
    revision: fields.revision,
  }
  if (fields.coverage) out.coverage = fields.coverage
  if (fields.data !== undefined) out.data = fields.data
  if (fields.cursor) out.cursor = fields.cursor
  if (fields.hint) out.hint = fields.hint
  const diagnostics = Array.isArray(fields.diagnostics) ? fields.diagnostics.filter(Boolean) : []
  if (diagnostics.length) out.diagnostics = diagnostics
  return out
}

export function failEnvelope(action, root, status, message, extra = {}) {
  return makeEnvelope({
    action,
    root,
    status,
    revision: extra.revision,
    data: extra.data,
    diagnostics: [message].concat(extra.diagnostics ?? []),
    hint: extra.hint,
  })
}

export function validateSelectors(params) {
  const errors = []
  const action = params.action
  if (!ACTIONS.includes(action)) {
    errors.push('action must be one of: ' + ACTIONS.join(', '))
    return errors
  }
  if (params.slug !== undefined && action !== 'task') errors.push('slug is only valid with action=tasks|task? No: slug is only valid with action=task')
  if (action === 'task' && !params.slug) errors.push('slug is required for action=task')
  if (params.id !== undefined && action !== 'log') errors.push('id is only valid with action=log')
  if (action === 'log' && !params.id) errors.push('id is required for action=log')
  if (params.status !== undefined && action !== 'tasks') errors.push('status is only valid with action=tasks')
  if (params.section !== undefined && action !== 'task') errors.push('section is only valid with action=task')
  if (params.archive !== undefined && action !== 'task') errors.push('archive is only valid with action=task')
  if (params.cursor !== undefined && action !== 'tasks' && action !== 'logs') errors.push('cursor is only valid with action=tasks|logs')
  if (params.limit !== undefined && action !== 'tasks' && action !== 'logs') errors.push('limit is only valid with action=tasks|logs')
  if (params.limit !== undefined && (!Number.isInteger(params.limit) || params.limit < LIMIT_MIN || params.limit > LIMIT_MAX)) {
    errors.push('limit must be an integer between ' + LIMIT_MIN + ' and ' + LIMIT_MAX)
  }
  if (params.maxBytes !== undefined && (!Number.isInteger(params.maxBytes) || params.maxBytes < BYTES_MIN || params.maxBytes > BYTES_MAX)) {
    errors.push('maxBytes must be an integer between ' + BYTES_MIN + ' and ' + BYTES_MAX)
  }
  return errors
}
