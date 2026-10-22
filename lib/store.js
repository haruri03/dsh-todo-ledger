import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const STATES = ['todo', 'doing', 'blocked', 'review'];

export const LEDGER_DIRS = ['_todo', 'todo'];

export function ledgerDirName(root) {
  for (const name of LEDGER_DIRS) if (existsSync(join(root, name))) return name;
  return LEDGER_DIRS[0];
}

export function findRoot(startDir, maxDepth = 12) {
  let dir = resolve(startDir);
  for (let i = 0; i < maxDepth; i++) {
    for (const name of LEDGER_DIRS) if (existsSync(join(dir, name, 'tasks.md'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export function layout(root) {
  const base = join(root, ledgerDirName(resolve(root)));
  return {
    root: resolve(root),
    base,
    dir: ledgerDirName(resolve(root)),
    queue: join(base, 'todo.md'),
    index: join(base, 'tasks.md'),
    tasks: join(base, 'tasks'),
    archived: join(base, 'archived'),
    context: join(base, 'context'),
    now: join(base, 'context', 'now.md'),
    log: join(base, 'context', 'log.md'),
  };
}

const QUEUE_HEAD =
  '# Queue\n\n> Maintained by the `todo` CLI / dsh-todo-ledger; never edit by hand. Only work in progress is referenced here; details live in `tasks.md`.\n\n';
const INDEX_HEAD =
  '# Task index\n\n> Maintained by the `todo` CLI / dsh-todo-ledger; never edit by hand. A closed task leaves this table and moves to `archived/`.\n\nStates: `todo` / `doing` / `blocked` / `review` (`review` = finished, awaiting the owner sign-off)\n\n';
const NOW_HEAD =
  '# Current context\n\n> `todo_checkpoint` overwrites this file; `todo_note` only appends to `context/log.md`. Written for the next session, or for yourself after compaction.\n\n';

export function ensureLayout(L, { scaffold = false } = {}) {
  for (const dir of [L.base, L.tasks, L.archived, L.context]) mkdirSync(dir, { recursive: true });
  if (!existsSync(L.index)) writeFileSync(L.index, INDEX_HEAD, 'utf8');
  if (!existsSync(L.queue)) writeFileSync(L.queue, QUEUE_HEAD, 'utf8');
  if (!existsSync(L.now)) writeFileSync(L.now, `${NOW_HEAD}## Current goal\n\n(nothing written yet — call todo_checkpoint)\n`, 'utf8');
  if (!existsSync(L.log)) writeFileSync(L.log, '# Context log\n\n', 'utf8');
  if (scaffold && !existsSync(join(L.base, 'AGENTS.md'))) {
    writeFileSync(
      join(L.base, 'AGENTS.md'),
      [
        `# ${L.dir}/AGENTS.md`,
        '',
        'Task ledger. The only write path is the `todo` CLI or the dsh-todo-ledger tools; never edit the status lines in `todo.md` / `tasks.md` / `tasks/*.md` by hand, or the index desyncs.',
        '',
        '```',
        'node <external-todo-cli>/todo.js <cmd> --root <repo-root>',
        '```',
        '',
        'States: `todo` / `doing` / `blocked` / `review`. There is no `done`; `review` = finished, awaiting the owner sign-off.',
        '',
        'Closure: `todo complete <slug> --evidence "..." --signoff "<owner words>"`; without the sign-off quote a task cannot close.',
        '',
        '`context/now.md` holds the current goal / progress / next step; `context/log.md` is an append-only log.',
        '',
      ].join('\n'),
      'utf8',
    );
  }
}

function readFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const meta = {};
  let body = text;
  if (m) {
    body = text.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([a-z_-]+):\s*(.*)$/i);
      if (!kv) continue;
      let val = kv[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else {
        val = val.replace(/^["']|["']$/g, '');
      }
      meta[kv[1]] = val;
    }
  }
  return { meta, body };
}

function renderFrontmatter(meta) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(meta)) {
    if (Array.isArray(v)) lines.push(`${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`);
    else lines.push(`${k}: ${JSON.stringify(String(v ?? ''))}`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

function parseIndex(text) {
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^-\s*\[(todo|doing|blocked|review)\]\s*\*\*([a-z0-9-]+)\*\*\s*—\s*(.*?)(?:\s*→\s*\[详情\]\((.*?)\))?\s*$/);
    if (m) items.push({ status: m[1], slug: m[2], title: m[3], link: m[4] || `tasks/${m[2]}.md` });
  }
  return items;
}

function renderIndex(items) {
  const sorted = [...items].sort((a, b) => STATES.indexOf(a.status) - STATES.indexOf(b.status) || a.slug.localeCompare(b.slug));
  const lines = INDEX_HEAD.trimEnd().split('\n').concat(['']);
  for (const it of sorted) lines.push(`- [${it.status}] **${it.slug}** — ${it.title} → [详情](${it.link})`);
  if (!sorted.length) lines.push('_(no tasks)_');
  lines.push('');
  return lines.join('\n');
}

function parseQueue(text) {
  const refs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^-\s*\[(todo|doing|blocked|review)\]\s*([a-z0-9-]+)\s*$/);
    if (m) refs.push({ status: m[1], slug: m[2] });
  }
  return refs;
}

function renderQueue(refs) {
  const lines = QUEUE_HEAD.trimEnd().split('\n').concat(['']);
  for (const r of refs) lines.push(`- [${r.status}] ${r.slug}`);
  if (!refs.length) lines.push('_(queue empty)_');
  lines.push('');
  return lines.join('\n');
}

export function loadState(L) {
  ensureLayout(L);
  return {
    indexItems: parseIndex(readFileSync(L.index, 'utf8')),
    queueRefs: parseQueue(readFileSync(L.queue, 'utf8')),
  };
}

function saveState(L, { indexItems, queueRefs }) {
  writeFileSync(L.index, renderIndex(indexItems), 'utf8');
  writeFileSync(L.queue, renderQueue(queueRefs), 'utf8');
}

const taskPath = (L, slug, where = 'tasks') => join(L[where], `${slug}.md`);

export function readTask(L, slug) {
  const p = taskPath(L, slug);
  if (!existsSync(p)) return null;
  return { path: p, ...readFrontmatter(readFileSync(p, 'utf8')) };
}

function template(slug, title, status, files) {
  return (
    renderFrontmatter({ slug, title, status, updated: new Date().toISOString().slice(0, 10), files }) +
    `# ${title}

## 目标

（一句话说清做完是什么样）

## 子项

- [ ] 

## 验收标准

- 

## 进度

（当前到哪一步，带数字）

## 阻塞

（无 / 卡在哪）

## 相关文件

${files.length ? files.map((f) => `- \`${f}\``).join('\n') : '- '}
`
  );
}

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function appendLog(L, line) {
  ensureLayout(L);
  const text = readFileSync(L.log, 'utf8');
  const next = `${text.trimEnd()}\n- ${stamp()} ${line}\n`;
  writeFileSync(L.log, next, 'utf8');
}

export function readLogTail(L, count = 8) {
  if (!existsSync(L.log)) return '';
  const lines = readFileSync(L.log, 'utf8').split(/\r?\n/).filter((l) => l.startsWith('- '));
  return lines.slice(-count).join('\n');
}

export function readNow(L) {
  if (!existsSync(L.now)) return '';
  return readFileSync(L.now, 'utf8').trim();
}

export function writeNow(L, body) {
  ensureLayout(L);
  writeFileSync(L.now, `${NOW_HEAD}${body.trim()}\n`, 'utf8');
}

export function cmdAdd(L, { slug, title, status = 'todo', files = [] }) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('slug must be kebab-case, e.g. rebuild-store');
  if (!STATES.includes(status)) throw new Error(`Invalid state: ${status}`);
  ensureLayout(L);
  if (existsSync(taskPath(L, slug))) throw new Error(`Task already exists: ${slug}`);
  const t = title || slug;
  writeFileSync(taskPath(L, slug), template(slug, t, status, files), 'utf8');
  const { indexItems, queueRefs } = loadState(L);
  indexItems.push({ status, slug, title: t, link: `tasks/${slug}.md` });
  queueRefs.push({ status, slug });
  saveState(L, { indexItems, queueRefs });
  appendLog(L, `todo_add ${slug} [${status}] — ${t}`);
  return `added ${slug} [${status}] → ${L.dir}/tasks/${slug}.md`;
}

export function cmdList(L, { status } = {}) {
  const { indexItems } = loadState(L);
  const rows = status ? indexItems.filter((i) => i.status === status) : indexItems;
  if (!rows.length) return '(none)';
  return rows.map((r) => `[${r.status}] ${r.slug} — ${r.title}`).join('\n');
}

export function cmdShow(L, slug) {
  const t = readTask(L, slug);
  if (!t) throw new Error(`Task not found: ${slug}`);
  return readFileSync(t.path, 'utf8');
}

export function cmdStatus(L, { slug, state }) {
  if (!STATES.includes(state)) throw new Error(`State must be one of ${STATES.join(' / ')}`);
  const t = readTask(L, slug);
  if (!t) throw new Error(`Task not found: ${slug}`);
  t.meta.status = state;
  t.meta.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(t.path, renderFrontmatter(t.meta) + t.body, 'utf8');
  const { indexItems, queueRefs } = loadState(L);
  const idx = indexItems.find((i) => i.slug === slug);
  if (idx) idx.status = state;
  else indexItems.push({ status: state, slug, title: t.meta.title || slug, link: `tasks/${slug}.md` });
  const q = queueRefs.find((r) => r.slug === slug);
  if (q) q.status = state;
  else queueRefs.push({ status: state, slug });
  saveState(L, { indexItems, queueRefs });
  appendLog(L, `todo_status ${slug} → ${state}`);
  return `${slug} → ${state}`;
}

function finalize(L, args, { conclusion }) {
  const t = readTask(L, args.slug);
  if (!t) throw new Error(`Task not found: ${args.slug}`);
  if (!args.evidence) throw new Error('Missing evidence (acceptance proof)');
  if (!args.signoff) throw new Error('Missing signoff (the owner words confirming closure)');
  const today = new Date().toISOString().slice(0, 10);
  const record = `\n## 交付记录

- 完成日期：${today}
- 结论：${conclusion}
- 交付物：
${(args.files || []).map((f) => `  - \`${f}\``).join('\n') || '  - (not registered)'}
- 验收证据：${args.evidence}
- 签收：${args.signoff}
- 遗留：${args.legacy || 'none'}
`;
  t.meta.status = 'archived';
  t.meta.archived = today;
  t.meta.updated = today;
  const dest = taskPath(L, args.slug, 'archived');
  writeFileSync(dest, renderFrontmatter(t.meta) + t.body.trimEnd() + '\n' + record, 'utf8');
  unlinkSync(t.path);
  const { indexItems, queueRefs } = loadState(L);
  saveState(L, {
    indexItems: indexItems.filter((i) => i.slug !== args.slug),
    queueRefs: queueRefs.filter((r) => r.slug !== args.slug),
  });
  appendLog(L, `${args.slug} archived — ${conclusion}`);
  return `archived ${args.slug} → todo/archived/${args.slug}.md`;
}

export const cmdComplete = (L, args) => finalize(L, args, { conclusion: 'completed' });
export const cmdArchive = (L, args) => {
  if (!args.reason) throw new Error('archive requires reason (why the task is dropped)');
  return finalize(L, args, { conclusion: `dropped: ${args.reason}` });
};

export function cmdDoctor(L) {
  ensureLayout(L);
  const errors = [];
  const warns = [];
  const { indexItems, queueRefs } = loadState(L);
  const onDisk = readdirSync(L.tasks).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
  const inIndex = indexItems.map((i) => i.slug);
  for (const s of onDisk) if (!inIndex.includes(s)) errors.push(`tasks/${s}.md exists on disk but is not registered in tasks.md`);
  for (const s of inIndex) if (!onDisk.includes(s)) errors.push(`tasks.md registers ${s} but tasks/${s}.md does not exist`);
  const seen = new Set();
  for (const it of indexItems) {
    if (seen.has(it.slug)) errors.push(`duplicate registration in tasks.md: ${it.slug}`);
    seen.add(it.slug);
    if (!STATES.includes(it.status)) errors.push(`invalid state: ${it.slug} = ${it.status}`);
  }
  for (const r of queueRefs) if (!inIndex.includes(r.slug)) errors.push(`todo.md references ${r.slug}, which is not in tasks.md`);
  const archivedFiles = readdirSync(L.archived).filter((f) => f.endsWith('.md'));
  for (const f of archivedFiles) {
    const text = readFileSync(join(L.archived, f), 'utf8');
    if (!/## 交付记录/.test(text)) errors.push(`archived/${f} has no \`## 交付记录\` section`);
    if (!/签收：/.test(text)) errors.push(`archived/${f} delivery record has no \`签收：\` sign-off quote`);
  }
  for (const s of onDisk) {
    const t = readTask(L, s);
    if (t && t.meta.status === 'review') warns.push(`${s} is in review, awaiting the owner sign-off`);
  }
  if (!existsSync(L.now)) warns.push('context/now.md does not exist (todo_checkpoint has not run yet)');
  const okLine = `OK  tasks=${onDisk.length} archived=${archivedFiles.length} queue=${queueRefs.length}, no errors`;
  return { errors, warns, okLine };
}

function lastRealLine(body, heading, maxChars = 80) {
  const m = body.match(new RegExp('## ' + heading + '\\s*\\n+([\\s\\S]*?)(?=\\n## |$)'));
  if (!m) return '';
  const lines = m[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[（(].*[）)]$/.test(l));
  const raw = lines.length ? lines[lines.length - 1] : '';
  const line = raw.replace(/^[-*]\s*/, '');
  return line.length > maxChars ? line.slice(0, maxChars) + '…' : line;
}

export function appendTaskProgress(L, slug, note) {
  const task = readTask(L, slug);
  if (!task) return false;
  const text = readFileSync(task.path, 'utf8');
  const line = '- ' + new Date().toISOString().slice(0, 10) + ' ' + String(note).trim();
  const heading = /^## 进度\s*$/m;
  const match = heading.exec(text);
  let next;
  if (!match) {
    next = text.trimEnd() + '\n\n## 进度\n\n' + line + '\n';
  } else {
    const start = match.index + match[0].length;
    const rest = text.slice(start);
    const found = rest.search(/^## /m);
    const end = found < 0 ? text.length : start + found;
    const section = text
      .slice(start, end)
      .split(/\r?\n/)
      .filter((l) => !/^\s*[（(].*[）)]\s*$/.test(l))
      .join('\n')
      .replace(/\s+$/, '');
    next = text.slice(0, start) + (section ? section + '\n' : '\n') + line + '\n\n' + text.slice(end);
  }
  writeFileSync(task.path, next, 'utf8');
  return true;
}

function daysSince(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return undefined;
  const then = Date.parse(isoDate.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(then)) return undefined;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

function humanAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours + 'h ago';
  return Math.round(hours / 24) + 'd ago';
}

export function snapshot(L, { maxChars = 4000, stats } = {}) {
  if (!existsSync(L.index)) return '';
  const { indexItems, queueRefs } = loadState(L);
  let ledgerTime;
  try {
    ledgerTime = Math.max(
      statSync(L.log).mtimeMs,
      statSync(L.index).mtimeMs,
      statSync(L.now).mtimeMs,
    );
  } catch {
    ledgerTime = undefined;
  }
  const parts = ['Root: ' + L.root];
  if (ledgerTime) parts.push('Ledger last written: ' + humanAge(Date.now() - ledgerTime) + ` (${L.dir}/context/log.md)`);

  if (stats) {
    const head = stats.hasTodoWrite
      ? 'Accounting: the last todo write this session was `' + stats.lastTodoName + '` (' + humanAge(Date.now() - stats.lastTodoTime) + '); since then ' + stats.callsSince + ' tool calls, ' + stats.writesSince + ' of them write-class.'
      : 'Accounting: no ledger write this session yet (no todo_add / todo_status / todo_note / todo_checkpoint).';
    parts.push('\n' + head);
    if (stats.writesSince >= 3) {
      parts.push('⚠ ' + stats.writesSince + ' write-class operations since the last ledger write: run todo_note / todo_checkpoint before doing more work.');
    }
  }

  const count = (state) => indexItems.filter((i) => i.status === state).length;
  parts.push(
    '\nTasks: ' + indexItems.length + ' (todo ' + count('todo') + ' / doing ' + count('doing') +
      ' / blocked ' + count('blocked') + ' / review ' + count('review') + '); read the full queue with todo_list.',
  );

  const review = indexItems.filter((i) => i.status === 'review');
  const blocked = indexItems.filter((i) => i.status === 'blocked');
  if (review.length) {
    const reviewTags = review.slice(0, 6).map((i) => {
      const t = readTask(L, i.slug);
      const days = daysSince(t?.meta?.updated);
      return i.slug + (days ? '(' + days + 'd)' : '');
    });
    parts.push('\nAwaiting review (' + review.length + '): ' + reviewTags.join(', ') + (review.length > 6 ? '…' : '') + ' (close with todo_complete plus the owner sign-off quote)');
  }
  if (blocked.length) {
    parts.push('Blocked (' + blocked.length + '): ' + blocked.slice(0, 6).map((i) => i.slug).join(', ') + (blocked.length > 6 ? '…' : ''));
  }

  const doing = indexItems.filter((i) => i.status === 'doing');
  if (doing.length) {
    const rows = [];
    for (const it of doing.slice(0, 6)) {
      const t = readTask(L, it.slug);
      const progress = lastRealLine(t?.body || '', '进度');
      const block = lastRealLine(t?.body || '', '阻塞');
      const staleDays = daysSince(t?.meta?.updated);
      rows.push(
        '- [doing] ' + it.slug + ' — ' + it.title +
          (staleDays !== undefined && staleDays >= 2 ? ' (state unchanged for ' + staleDays + 'd)' : '') +
          (progress ? '\n  Progress: ' + progress : '') +
          (block ? '\n  Blocker: ' + block : ''),
      );
    }
    parts.push('\nIn progress:\n' + rows.join('\n'));
  }

  const now = readNow(L);
  if (now) {
    const clean = now
      .replace(/^# Current context\n*/, '')
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith('>'))
      .join('\n')
      .trim();
    if (clean) parts.push(`\nCurrent context (${L.dir}/context/now.md):\n` + clean);
  }
  const tail = readLogTail(L, 6);
  if (tail) parts.push(`\nRecent log (last 6 entries of ${L.dir}/context/log.md):\n` + tail);

  let text = parts.join('\n');
  if (text.length > maxChars) text = text.slice(0, maxChars) + '\n…(snapshot truncated; read the full ledger with todo_list / todo_show)';
  return text;
}
