#!/usr/bin/env node
import { readContext, EXIT_CODES } from '../lib/context-reader.js'

const FLAGS = {
  '--action': 'action',
  '-a': 'action',
  '--root': 'root',
  '--cwd': 'cwd',
  '--slug': 'slug',
  '--id': 'id',
  '--section': 'section',
  '--status': 'status',
  '--limit': 'limit',
  '--cursor': 'cursor',
  '--max-bytes': 'maxBytes',
  '--archive': 'archive',
}

const NUMERIC = new Set(['limit', 'maxBytes'])

function usage() {
  return [
    'usage: todo-context [--action overview|tasks|task|checkpoint|logs|log] [options]',
    '',
    'reads the todo ledger through one bounded JSON envelope; nothing is written.',
    '',
    'options:',
    '  -a, --action <name>   overview (default) | tasks | task | checkpoint | logs | log',
    '      --root <dir>      ledger repo root, default: nearest root above --cwd',
    '      --cwd <dir>       directory to start the root search from',
    '      --slug <slug>     required for --action task',
    '      --section <name>  task body section: goal | subtasks | acceptance | progress | blocker',
    '      --archive         with --action task, read the archived record instead',
    '      --id <ref>        required for --action log: #3 or L12',
    '      --status <state>  with --action tasks: todo | doing | blocked | review',
    '      --limit <n>       with --action tasks|logs, 1..200',
    '      --cursor <token>  continue a previous page',
    '      --max-bytes <n>   per-field text budget, 200..32768',
    '      --json            print the raw envelope instead of the text view',
    '  -h, --help            show this message',
    '',
    'exit codes: ready 0, absent 0, invalid 2, inconsistent 1, error 1',
  ].join('\n')
}

function parseArgs(argv) {
  const params = {}
  let json = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') return { help: true }
    if (arg === '--json') {
      json = true
      continue
    }
    const eq = arg.indexOf('=')
    const name = eq > -1 ? arg.slice(0, eq) : arg
    const key = FLAGS[name]
    if (!key) return { error: 'unknown option: ' + name }
    let value = eq > -1 ? arg.slice(eq + 1) : argv[i + 1]
    if (eq === -1) i += 1
    if (value === undefined) return { error: 'missing value for ' + name }
    if (key === 'archive') {
      params.archive = value === '' || value === 'true' || value === '1'
      continue
    }
    params[key] = NUMERIC.has(key) ? Number(value) : value
  }
  return { params, json }
}

function line(label, value) {
  if (value === undefined || value === null || value === '') return undefined
  return label + ': ' + value
}

function list(rows, render) {
  if (!Array.isArray(rows) || !rows.length) return '(none)'
  return rows.map(render).join('\n')
}

function textView(envelope) {
  const out = []
  const head = (envelope.status || 'unknown') + ' · ' + (envelope.action || '-')
  out.push(head + (envelope.root ? ' · ' + envelope.root : ''))
  if (envelope.coverage) out.push(line('coverage', envelope.coverage))
  const data = envelope.data || {}
  if (envelope.action === 'overview') {
    out.push(line('tasks', data.tasks ? JSON.stringify(data.tasks) : undefined))
    out.push(line('log entries', data.log?.total))
    out.push(line('checkpoint', data.checkpoint?.age))
    out.push(line('next', data.next))
  } else if (envelope.action === 'tasks') {
    out.push(line('total', data.total))
    out.push(
      list(data.tasks, (t) => '- [' + t.status + '] ' + t.slug + (t.title ? ' — ' + t.title : '') + (t.updated ? ' (' + t.updated + ')' : '')),
    )
  } else if (envelope.action === 'task') {
    out.push(line('slug', data.slug))
    out.push(line('status', data.status))
    out.push(line('title', data.title))
    out.push(line('updated', data.updated))
    if (data.section) out.push('section ' + data.section + ':\n' + (data.text || '(empty)'))
    else if (data.text) out.push('\n' + data.text)
    out.push(line('path', data.path))
  } else if (envelope.action === 'checkpoint') {
    out.push(line('path', data.path))
    out.push(line('age', data.age))
    out.push(line('goal', data.goal))
    out.push(line('next', data.next))
  } else if (envelope.action === 'logs') {
    out.push(line('total', data.total))
    out.push(list(data.entries, (e) => (e.ref || '?') + '  ' + (e.time || '') + '  ' + (e.summary || '')))
  } else if (envelope.action === 'log') {
    out.push(line('ref', data.ref))
    out.push(line('time', data.time))
    out.push(line('bytes', data.bytes))
    if (data.text) out.push('\n' + data.text)
  }
  if (envelope.cursor) out.push(line('cursor', envelope.cursor))
  if (Array.isArray(envelope.diagnostics) && envelope.diagnostics.length) {
    out.push('diagnostics:\n' + envelope.diagnostics.map((d) => '- ' + d).join('\n'))
  }
  if (envelope.hint) out.push(line('hint', envelope.hint))
  return out.filter(Boolean).join('\n')
}

function main(argv) {
  const parsed = parseArgs(argv)
  if (parsed.help) {
    process.stdout.write(usage() + '\n')
    return 0
  }
  if (parsed.error) {
    process.stderr.write(parsed.error + '\n\n' + usage() + '\n')
    return EXIT_CODES.invalid
  }
  const envelope = readContext(parsed.params)
  if (parsed.json) process.stdout.write(JSON.stringify(envelope, null, 2) + '\n')
  else process.stdout.write(textView(envelope) + '\n')
  return EXIT_CODES[envelope.status] ?? EXIT_CODES.error
}

process.exitCode = main(process.argv.slice(2))
