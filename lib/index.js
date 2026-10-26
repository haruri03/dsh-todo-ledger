import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createCompleteHandler, createProjectionHandler } from './bridge.js';
import { readContext } from './context-reader.js';
import {
  STATES,
  appendLog,
  appendTaskProgress,
  cmdAdd,
  cmdArchive,
  cmdComplete,
  cmdDoctor,
  cmdList,
  cmdShow,
  cmdStatus,
  ensureLayout,
  findRoot,
  layout,
  ledgerDirName,
  setLedgerLang,
  snapshot,
  writeNow,
} from './store.js';

export const name = 'todo-ledger';

let config = {};
export const inject = ['tools', 'systemPrompt', 'webServer', 'sessions'];

const SECTION_NAME = 'todo-ledger';
const SECTION_ORDER = 180;

function sessionCwd(ctx, holder) {
  const session = holder?.agent?.session;
  const wd = ctx.get?.('workingDirectory');
  if (session && typeof wd?.get === 'function') {
    try {
      const dir = wd.get(session);
      if (typeof dir === 'string' && dir) return dir;
    } catch {
      return process.cwd();
    }
  }
  return process.cwd();
}

function resolveRoot(ctx, cwd, explicit, { allowCwd = false } = {}) {
  if (typeof explicit === 'string' && explicit.trim()) return layout(explicit.trim()).root;
  const configured = config.root;
  if (typeof configured === 'string' && configured.trim()) return layout(configured.trim()).root;
  if (process.env.TODO_ROOT) return layout(process.env.TODO_ROOT).root;
  const found = findRoot(cwd);
  if (found) return found;
  if (allowCwd) return layout(cwd).root;
  return undefined;
}

function requireRoot(ctx, exec, args, options) {
  const cwd = sessionCwd(ctx, exec);
  const root = resolveRoot(ctx, cwd, args?.root, options);
  if (!root) {
    throw new Error(
      `No ledger directory found (\`_todo/\` or \`todo/\`, searched 12 levels up from ${cwd}). ` +
        'Pass the `root` parameter, or call `todo_init` to create one in the working directory.',
    );
  }
  return layout(root);
}

const TODO_WRITE_TOOLS = new Set([
  'todo_add',
  'todo_status',
  'todo_note',
  'todo_checkpoint',
  'todo_complete',
  'todo_archive',
  'todo_init',
]);

const STATUS_TOOLS = new Set(['todo_add', 'todo_status', 'todo_complete', 'todo_archive']);

const WRITE_CLASS_TOOLS = new Set([
  'write',
  'edit',
  'shell',
  'pwsh',
  'bash',
  'run_code',
  'apply_patch',
  ...TODO_WRITE_TOOLS,
]);

function sessionAccounting(holder) {
  const session = holder?.agent?.session;
  if (!session || typeof session.snapshotEvents !== 'function') return undefined;
  let events;
  try {
    events = session.snapshotEvents();
  } catch {
    return undefined;
  }
  if (!events || typeof events[Symbol.iterator] !== 'function') return undefined;
  const calls = [];
  for (const ev of events) {
    if (!ev || ev.type !== 'tool/call') continue;
    const name = (ev.data && ev.data.name) || ev.name;
    if (typeof name === 'string' && name) calls.push({ name, time: ev.time });
  }
  let lastIndex = -1;
  for (let i = 0; i < calls.length; i++) if (TODO_WRITE_TOOLS.has(calls[i].name)) lastIndex = i;
  const after = calls.slice(lastIndex + 1);
  return {
    hasTodoWrite: lastIndex >= 0,
    lastTodoName: lastIndex >= 0 ? calls[lastIndex].name : undefined,
    lastTodoTime: lastIndex >= 0 ? calls[lastIndex].time : undefined,
    callsSince: after.length,
    writesSince: after.filter((c) => WRITE_CLASS_TOOLS.has(c.name)).length,
  };
}

function turnAccounting(holder) {
  const session = holder?.agent?.session;
  if (!session || typeof session.snapshotEvents !== 'function') return undefined;
  let events;
  try {
    events = session.snapshotEvents();
  } catch {
    return undefined;
  }
  if (!events || typeof events[Symbol.iterator] !== 'function') return undefined;
  let calls = 0;
  let writes = 0;
  let todoWrites = 0;
  let statusWrites = 0;
  for (const ev of events) {
    if (!ev) continue;
    if (ev.type === 'turn/start') {
      calls = 0;
      writes = 0;
      todoWrites = 0;
      statusWrites = 0;
      continue;
    }
    if (ev.type !== 'tool/call') continue;
    const name = (ev.data && ev.data.name) || ev.name;
    if (typeof name !== 'string' || !name) continue;
    calls += 1;
    if (WRITE_CLASS_TOOLS.has(name)) writes += 1;
    if (TODO_WRITE_TOOLS.has(name)) todoWrites += 1;
    if (STATUS_TOOLS.has(name)) statusWrites += 1;
  }
  return { calls, writes, todoWrites, statusWrites };
}

const text = (t) => [{ type: 'text', text: t }];

const ROOT_PARAM = {
  root: { type: 'string', description: 'Repo root (a directory containing `_todo/` or `todo/`). Omit to search upward from the session working directory.' },
};

function register(ctx, definition) {
  try {
    ctx.tools.register(definition);
  } catch {
    return;
  }
}

function rulesText(root) {
  const dir = root ? ledgerDirName(root) : '_todo';
  const at = `${dir}/`;
  const where = root
    ? `Repo: \`${root}/${at}\``
    : 'No ledger found: **no** `_todo/` directory exists here. Do not initialize one unless the user asks or confirms.';
  return [
    '[todo-ledger · cross-session tasks and context (injected by dsh-todo-ledger)]',
    where,
    '',
    'The repository ledger is the source of task state. Use the current request to choose work; a historical checkpoint does not authorize resuming a task.',
    '',
    'Read the compact overview first when starting or resuming ledger work. Reuse a current overview already in context. Retrieve the selected task and only the checkpoint or log entries needed for the next action. Prefer the advertised read-only CLI; use todo_context when shell access is unavailable. Do not invent commands.',
    '',
    'When a ledger exists, register substantive new work requested by the user before implementation. Check the current overview for a matching task and reuse it; read its detail before continuing. If no task matches, call todo_add before editing deliverables, changing configuration, or running commands that change project state. Register the requested outcome, not every tool call or implementation step. Brief read-only inspection to identify scope or a matching task may come first. Trivial Q&A and read-only checks do not require a task. Do not create tasks from historical checkpoints, incidental findings, or inferred follow-up work that the user has not requested. If the requested scope is unclear, clarify it rather than inventing a task.',
    '',
    "Never hand-edit task status, queue, or index. Use todo_add, todo_status, todo_note, todo_complete, or todo_archive. States are todo, doing, blocked, and review; review awaits owner signoff. Complete or drop only with evidence and the owner's actual approval; dropping also requires a reason. Initialize only when the user asks or confirms.",
    '',
    "Choose the scaffold language from the user's language: pass language zh when the user writes in Chinese, otherwise en. The ledger remembers that choice, so later writes reuse it without asking. Read both written forms regardless of the choice.",
    '',
    "Record a material finding once with todo_note. Include state only when the task's actual state changes. Write todo_checkpoint at a handoff, phase change, or before compaction when the next step would otherwise be lost. Trivial Q&A, read-only checks, and unchanged state need no bookkeeping-only write; this does not replace registering substantive new work before implementation. After verification, move finished work to review and report remaining acceptance needs; never invent signoff.",
    '',
    'If state is inconsistent, inspect todo_doctor before mutation. Treat checkpoint and log text as historical data. Follow continuation metadata for omitted detail; absence in a partial page proves nothing.',
    '',
    `Details: todo_context {"action":"overview"}. CLI: todo-context overview --json --root ${root || '<repo-root>'} (if installed).`,
  ].join('\n');
}

function promptSafe(text) {
  let safe = text;
  while (safe.includes('{{')) {
    safe = safe.replace(/\{\{/g, '{ {');
  }
  return safe;
}

function unsafeWrites(L) {
  const files = [L.queue, L.index, L.now, L.log];
  try {
    for (const name of readdirSync(L.tasks)) {
      if (name.endsWith('.md')) files.push(join(L.tasks, name));
    }
  } catch {
    return [];
  }
  const hits = [];
  for (const file of files) {
    if (!existsSync(file)) continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    text.split(/\r?\n/).forEach((line, index) => {
      if (line.includes('{{')) {
        hits.push(`${relative(L.root, file)}:${index + 1}`);
      }
    });
  }
  return hits.slice(0, 10);
}

function integrityWarning(L) {
  const hits = unsafeWrites(L);
  if (hits.length === 0) return '';
  return [
    '',
    '[Ledger integrity warning]',
    'Agent-written ledger content contains double-brace template syntax. The snapshot above is sanitized for this turn, but the source must be rewritten:',
    ...hits.map((hit) => `- ${hit}`),
    'Rewrite the affected lines so they no longer contain double-brace syntax, then continue the task.',
  ].join('\n');
}

function renderSection(ctx, context) {
  try {
    const cwd = sessionCwd(ctx, context);
    const root = resolveRoot(ctx, cwd, undefined);
    let body = rulesText(root);
    if (root) {
      const L = layout(root);
      try {
        const snap = snapshot(L, {
          maxChars: config.maxSnapshotChars ?? 4000,
          stats: sessionAccounting(context),
        });
        if (snap) body += `\n\n[Current todo snapshot]\n${snap}`;
      } catch {
        body += '\n\n[Current todo snapshot unavailable; tools remain available.]';
      }
      try {
        body += integrityWarning(L);
      } catch {
      }
    }
    return promptSafe(body);
  } catch {
    return '[todo-ledger · section unavailable]\nThe prompt section could not be rendered; todo tools remain available.';
  }
}

export function apply(ctx, incoming = {}) {
  config = incoming;

  try {
    ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: config.sectionOrder ?? SECTION_ORDER,
      text: (context) => renderSection(ctx, context),
    });
  } catch {
  }

  const loggedTurns = new Map();

  try {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: 'prefix',
          path: '/todo-ledger/projection',
          handler: createProjectionHandler({ sessions: ctx.sessions }),
        }),
      'todo-ledger.projection.route',
    );
  } catch {}

  try {
    ctx.effect(
      () =>
        ctx.webServer.register({
          kind: 'prefix',
          path: '/todo-ledger/complete',
          handler: createCompleteHandler({ sessions: ctx.sessions }),
        }),
      'todo-ledger.complete.route',
    );
  } catch {}

  try {
    ctx.on('agent/turn-stopping', (payload) => {
    try {
      const session = payload?.agent?.session;
      const stats = turnAccounting(payload);
      if (!stats || stats.writes < 3) return;
      const root = resolveRoot(ctx, sessionCwd(ctx, payload), undefined);
      if (!root) return;
      const key = String(session?.id ?? 'unknown');
      if (loggedTurns.get(key) === payload.turn) return;
      loggedTurns.set(key, payload.turn);
      const ledgerNote =
        stats.todoWrites === 0
          ? 'no ledger update this turn'
          : stats.statusWrites === 0
            ? `ledger note only (${stats.todoWrites} write), state unchanged`
            : `state advanced ${stats.statusWrites}x`;
      appendLog(
        layout(root),
        `[turn ${payload.turn}] ${stats.calls} tools (${stats.writes} write-class); ${ledgerNote}`,
      );
    } catch {
      return;
    }
    });
  } catch {
  }

  register(ctx, {
    name: 'todo_context',
    description:
      'Read ledger context through bounded selectors instead of whole files: action=overview | task | checkpoint | logs | log. Every response carries status, coverage and revision so a stale read is detectable. Read overview first, then only the selector the next action needs.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['overview', 'task', 'checkpoint', 'logs', 'log'],
          description: 'Selector: overview (counts and pointers), task (one task detail), checkpoint (current context), logs (directory page), log (one entry).',
        },
        slug: { type: 'string', description: 'Task slug; required for action=task.' },
        ref: { type: 'string', description: 'Log reference for action=log: #N (stable id) or L<n> (position).' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Entries or rows to return (default 5).' },
        cursor: { type: 'string', description: 'Opaque cursor from a previous logs response to continue paging.' },
        ...ROOT_PARAM,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { root: { type: 'string' }, envelope: { type: 'object' } },
        required: ['root', 'envelope'],
      },
      render: (_a, v) => text(JSON.stringify(v.envelope, null, 2)),
    },
    execute(args, exec) {
      const cwd = sessionCwd(ctx, exec);
      const root = resolveRoot(ctx, cwd, args?.root);
      return Promise.resolve({
        root: root ?? '',
        envelope: readContext({ ...args, cwd, root: root ?? args?.root }),
      });
    },
    presentCall: () => ({ card: 'generic', title: 'Read ledger context', kind: 'other' }),
  });

  register(ctx, {
    name: 'todo_list',
    description:
      'List ledger tasks and their states (todo / doing / blocked / review). Call it first to read real state; never infer tasks from memory.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: [...STATES], description: 'Show one state only.' },
        ...ROOT_PARAM,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { root: { type: 'string' }, listing: { type: 'string' } },
        required: ['root', 'listing'],
      },
      render: (_a, v) => text(`todo @ ${v.root}\n${v.listing}`),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      return Promise.resolve({ root: L.root, listing: cmdList(L, { status: args.status }) });
    },
    presentCall: () => ({ card: 'generic', title: 'List todos', kind: 'other' }),
  });

  register(ctx, {
    name: 'todo_show',
    description: 'Print one task detail (goal / subtasks / acceptance / progress / blocker / related files).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slug: { type: 'string', description: 'kebab-case task slug.' },
        ...ROOT_PARAM,
      },
      required: ['slug'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { slug: { type: 'string' }, content: { type: 'string' } },
        required: ['slug', 'content'],
      },
      render: (_a, v) => text(v.content),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      return Promise.resolve({ slug: args.slug, content: cmdShow(L, args.slug) });
    },
    presentCall: (args) => ({ card: 'generic', title: `Show ${args.slug}`, kind: 'read' }),
  });

  register(ctx, {
    name: 'todo_add',
    description:
      'Create a task: write tasks/<slug>.md detail, register it in tasks.md, add it to the todo.md queue. The slug must be unique kebab-case. Pass depends_on to make the task wait for predecessors; it is created as todo when they are already completed, otherwise blocked with blocker_cause dependency and unblocked automatically once they complete.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slug: { type: 'string', description: 'Unique kebab-case id, e.g. stage-interview.' },
        title: { type: 'string', description: 'One-line title.' },
        status: { type: 'string', enum: [...STATES], description: 'Initial state; defaults to todo.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Related file paths.' },
        depends_on: {
          type: 'array',
          items: { type: 'string' },
          description: 'Slugs this task waits for; each must exist and not be dropped.',
        },
        blocker_cause: {
          type: 'string',
          enum: ['dependency', 'manual'],
          description: 'Why the task is blocked; required when depends_on is set.',
        },
        language: {
          type: 'string',
          enum: ['en', 'zh'],
          description:
            'Template language for new ledger files: en or zh. Defaults to en; pass zh only when the user writes in Chinese. The choice is remembered for this ledger.',
        },
        ...ROOT_PARAM,
      },
      required: ['slug', 'title'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { root: { type: 'string' }, slug: { type: 'string' }, message: { type: 'string' } },
        required: ['root', 'slug', 'message'],
      },
      render: (_a, v) => text(v.message),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      const message = cmdAdd(L, {
        slug: args.slug,
        title: args.title,
        status: args.status,
        files: args.files,
        depends_on: args.depends_on,
        blocker_cause: args.blocker_cause,
        language: args.language,
      });
      return Promise.resolve({ root: L.root, slug: args.slug, message });
    },
    presentCall: (args) => ({ card: 'generic', title: `Create ${args.slug}`, kind: 'other' }),
  });

  register(ctx, {
    name: 'todo_status',
    description: 'Change a task state (todo / doing / blocked / review); syncs the detail frontmatter, the index and the queue.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slug: { type: 'string' },
        state: { type: 'string', enum: [...STATES] },
        ...ROOT_PARAM,
      },
      required: ['slug', 'state'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { slug: { type: 'string' }, state: { type: 'string' }, message: { type: 'string' } },
        required: ['slug', 'state', 'message'],
      },
      render: (_a, v) => text(v.message),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      return Promise.resolve({ slug: args.slug, state: args.state, message: cmdStatus(L, { slug: args.slug, state: args.state }) });
    },
    presentCall: (args) => ({ card: 'generic', title: `${args.slug} → ${args.state}`, kind: 'other' }),
  });

  register(ctx, {
    name: 'todo_complete',
    description:
      'Close a task: move it to archived/ with a delivery record. Requires evidence (acceptance proof) and signoff (the owner confirming closure in their own words); both are mandatory.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slug: { type: 'string' },
        evidence: { type: 'string', description: 'Acceptance evidence, e.g. "node story.js check: 0 errors".' },
        signoff: { type: 'string', description: 'The owner closure confirmation in their own words, e.g. "ok, ship it".' },
        files: { type: 'array', items: { type: 'string' }, description: 'Deliverable paths.' },
        legacy: { type: 'string', description: 'Open items left behind; defaults to "none".' },
        ...ROOT_PARAM,
      },
      required: ['slug', 'evidence', 'signoff'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { slug: { type: 'string' }, message: { type: 'string' } },
        required: ['slug', 'message'],
      },
      render: (_a, v) => text(v.message),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      return Promise.resolve({ slug: args.slug, message: cmdComplete(L, args) });
    },
    presentCall: (args) => ({ card: 'generic', title: `Close ${args.slug}`, kind: 'other' }),
  });

  register(ctx, {
    name: 'todo_archive',
    description: 'Drop a task: same evidence and signoff as todo_complete, plus reason (why it is dropped); moves it to archived/.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        slug: { type: 'string' },
        evidence: { type: 'string' },
        signoff: { type: 'string' },
        reason: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        ...ROOT_PARAM,
      },
      required: ['slug', 'evidence', 'signoff', 'reason'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { slug: { type: 'string' }, message: { type: 'string' } },
        required: ['slug', 'message'],
      },
      render: (_a, v) => text(v.message),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      return Promise.resolve({ slug: args.slug, message: cmdArchive(L, args) });
    },
    presentCall: (args) => ({ card: 'generic', title: `Archive ${args.slug}`, kind: 'other' }),
  });

  register(ctx, {
    name: 'todo_note',
    description:
      'Append a timestamped entry (conclusion, finding, pitfall, path) to the ledger context/log.md. Optional slug: also write the entry into that task `## Progress` section. Optional state: advance the state machine in the same call — a note that never changes state is the usual source of ledger drift.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        note: { type: 'string', description: 'One-line record: conclusion and path, no long excerpts.' },
        slug: { type: 'string', description: 'Optional: also append to that task `## Progress` section.' },
        state: {
          type: 'string',
          enum: [...STATES],
          description: 'Optional: also move that task to this state (requires slug).',
        },
        ...ROOT_PARAM,
      },
      required: ['note'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { root: { type: 'string' }, message: { type: 'string' } },
        required: ['root', 'message'],
      },
      render: (_a, v) => text(v.message),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      appendLog(L, args.note.trim());
      let intoProgress = false;
      if (args.slug) intoProgress = appendTaskProgress(L, args.slug, args.note);
      let moved = '';
      if (args.state) {
        if (!args.slug) throw new Error('state requires slug in the same call');
        moved = `, state → ${cmdStatus(L, { slug: args.slug, state: args.state })}`;
      }
      return Promise.resolve({
        root: L.root,
        message: `note written to ${L.log}${intoProgress ? `, and appended to ${args.slug} \`## Progress\`` : ''}${moved}`,
      });
    },
    presentCall: (args) => ({ card: 'generic', title: 'Record context', kind: 'other', rawInput: args.note }),
  });

  register(ctx, {
    name: 'todo_checkpoint',
    description:
      'Overwrite the ledger context/now.md: current goal / what is done / next step / key files (or pass summary + next). Call it on phase switches, mid-task, and before/after compaction; it is the note you leave for the next session.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string', description: 'What you are doing now and the conclusions so far (a few sentences).' },
        next: { type: 'string', description: 'What to do next.' },
        files: { type: 'array', items: { type: 'string' }, description: 'Key file paths.' },
        slug: { type: 'string', description: 'Owning task slug (optional).' },
        ...ROOT_PARAM,
      },
      required: ['summary'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { root: { type: 'string' }, message: { type: 'string' } },
        required: ['root', 'message'],
      },
      render: (_a, v) => text(v.message),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      ensureLayout(L);
      const lines = ['## Current goal', '', args.summary.trim(), ''];
      if (args.slug) lines.push(`Task: \`${args.slug}\``, '');
      if (args.next) lines.push('## Next step', '', args.next.trim(), '');
      if (args.files?.length) lines.push('## Key files', '', ...args.files.map((f) => `- \`${f}\``), '');
      lines.push(`_Updated ${new Date().toISOString().replace('T', ' ').slice(0, 19)}_`);
      writeNow(L, lines.join('\n'));
      appendLog(L, `checkpoint: ${args.summary.trim().split(/\r?\n/)[0]}`);
      return Promise.resolve({ root: L.root, message: `wrote ${L.now}` });
    },
    presentCall: () => ({ card: 'generic', title: 'Write checkpoint', kind: 'other' }),
  });

  register(ctx, {
    name: 'todo_doctor',
    description: 'Check ledger two-way consistency: index vs disk, queue references, archived delivery records; returns the error list.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { ...ROOT_PARAM },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string' },
          ok: { type: 'boolean' },
          errors: { type: 'array', items: { type: 'string' } },
          warns: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
        required: ['root', 'ok', 'errors', 'warns', 'summary'],
      },
      render: (_a, v) =>
        text(`${v.ok ? '✓' : '✗'} ${v.summary}${v.errors.length ? `\n- ${v.errors.join('\n- ')}` : ''}${v.warns.length ? `\nWARN ${v.warns.join('; ')}` : ''}`),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      const { errors, warns, okLine } = cmdDoctor(L);
      return Promise.resolve({ root: L.root, ok: errors.length === 0, errors, warns, summary: okLine });
    },
    presentCall: () => ({ card: 'generic', title: 'todo doctor', kind: 'other' }),
  });

  register(ctx, {
    name: 'todo_snapshot',
    description:
      'Read-only: returns the exact todo snapshot that gets injected into the prompt (accounting staleness, review/blocked, now.md). Call it to check whether the ledger has gone stale.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { ...ROOT_PARAM },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { root: { type: 'string' }, snapshot: { type: 'string' } },
        required: ['root', 'snapshot'],
      },
      render: (_a, v) => text(v.snapshot),
    },
    execute(args, exec) {
      const L = requireRoot(ctx, exec, args);
      const snap = snapshot(L, {
        maxChars: config.maxSnapshotChars ?? 4000,
        stats: sessionAccounting(exec),
      });
      return Promise.resolve({ root: L.root, snapshot: snap });
    },
    presentCall: () => ({ card: 'generic', title: 'Show todo snapshot', kind: 'read' }),
  });

  register(ctx, {
    name: 'todo_init',
    description:
      'Scaffold a ledger in the current working directory (or the given directory): `_todo/` (an existing `todo/` repo keeps its name) with todo.md, tasks.md, tasks/, archived/, context/ and AGENTS.md. Call it only when the user asks or confirms.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        root: { type: 'string', description: 'Directory to initialize as repo root; defaults to the session working directory.' },
        language: {
          type: 'string',
          enum: ['en', 'zh'],
          description:
            'Template language for new ledger files: en or zh. Defaults to en; pass zh only when the user writes in Chinese. The choice is remembered for this ledger.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { root: { type: 'string' }, message: { type: 'string' } },
        required: ['root', 'message'],
      },
      render: (_a, v) => text(v.message),
    },
    execute(args, exec) {
      const root = resolveRoot(ctx, sessionCwd(ctx, exec), args.root, { allowCwd: true });
      const L = layout(root);
      ensureLayout(L, { scaffold: true });
      if (args.language) setLedgerLang(L, args.language);
      appendLog(L, 'todo_init');
      return Promise.resolve({ root: L.root, message: `created ${L.base} (tasks / archived / context)` });
    },
    presentCall: () => ({ card: 'generic', title: 'Initialize todo/', kind: 'other' }),
  });
}

export default { name, inject, apply };
