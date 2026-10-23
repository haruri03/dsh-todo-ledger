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

function template(slug, title, status, files, dependency = {}) {
  return (
    renderFrontmatter({ slug, title, status, updated: new Date().toISOString().slice(0, 10), files, ...dependency }) +
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

const validSlug = (slug) => typeof slug === 'string' && /^[a-z0-9-]+$/.test(slug);

function archivedOutcome(L, slug) {
  const path = taskPath(L, slug, 'archived');
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  return /^- 结论：completed\s*$/m.test(text) && /^- 签收：\S.*$/m.test(text) && /^- 验收证据：\S.*$/m.test(text) ? 'completed' : 'dropped';
}

function validateDependency(L, slug, dependsOn, cause) {
  if (cause !== undefined && !['dependency', 'manual'].includes(cause)) throw new Error(`Invalid blocker cause: ${cause}`);
  if (dependsOn === undefined) {
    if (cause === 'dependency') throw new Error('A dependency blocker requires at least one predecessor');
    return cause === undefined ? {} : { blocker_cause: cause };
  }
  if (!Array.isArray(dependsOn) || !dependsOn.length || dependsOn.some((s) => !validSlug(s)) || new Set(dependsOn).size !== dependsOn.length) throw new Error('Invalid predecessor list');
  if (cause === undefined) throw new Error('Predecessors require an explicit blocker cause');
  if (dependsOn.includes(slug)) throw new Error(`Self-dependency: ${slug}`);
  for (const predecessor of dependsOn) {
    if (archivedOutcome(L, predecessor) === 'dropped') throw new Error(`Dropped predecessor: ${predecessor}`);
    if (!readTask(L, predecessor) && archivedOutcome(L, predecessor) !== 'completed') throw new Error(`Unknown predecessor: ${predecessor}`);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(node) {
    if (visiting.has(node)) throw new Error(`Dependency cycle: ${node}`);
    if (visited.has(node)) return;
    visiting.add(node);
    for (const predecessor of node === slug ? dependsOn : readTask(L, node)?.meta.depends_on || []) visit(predecessor);
    visiting.delete(node);
    visited.add(node);
  }
  visit(slug);
  return { depends_on: dependsOn, blocker_cause: cause };
}

export function cmdAdd(L, { slug, title, status = 'todo', files = [], depends_on, blocker_cause }) {
  if (!validSlug(slug)) throw new Error('slug must be kebab-case, e.g. rebuild-store');
  if (!STATES.includes(status)) throw new Error(`Invalid state: ${status}`);
  ensureLayout(L);
  if (existsSync(taskPath(L, slug)) || existsSync(taskPath(L, slug, 'archived'))) throw new Error(`Task already exists: ${slug}`);
  const dependency = validateDependency(L, slug, depends_on, blocker_cause);
  const satisfied = status === 'blocked' && blocker_cause === 'dependency' && Array.isArray(depends_on) && depends_on.every((predecessor) => archivedOutcome(L, predecessor) === 'completed');
  const state = satisfied ? 'todo' : status;
  const t = title || slug;
  writeFileSync(taskPath(L, slug), template(slug, t, state, files, dependency), 'utf8');
  const { indexItems, queueRefs } = loadState(L);
  indexItems.push({ status: state, slug, title: t, link: `tasks/${slug}.md` });
  queueRefs.push({ status: state, slug });
  saveState(L, { indexItems, queueRefs });
  appendLog(L, `todo_add ${slug} [${state}] — ${t}`);
  return `added ${slug} [${state}] → ${L.dir}/tasks/${slug}.md`;
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
  if (state === 'blocked' && t.meta.status !== 'blocked' && t.meta.blocker_cause === 'dependency') t.meta.blocker_cause = 'manual';
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

function reconcileCompletion(L, slug) {
  const { indexItems, queueRefs } = loadState(L);
  const nextIndex = indexItems.filter((item) => item.slug !== slug);
  const nextQueue = queueRefs.filter((item) => item.slug !== slug);
  let changed = nextIndex.length !== indexItems.length || nextQueue.length !== queueRefs.length;
  const transitions = [];
  for (const item of nextIndex) {
    const task = readTask(L, item.slug);
    if (!task) continue;
    const predecessors = task.meta.depends_on;
    const eligible = task.meta.blocker_cause === 'dependency' && Array.isArray(predecessors) && predecessors.length > 0 && predecessors.includes(slug) && predecessors.every((predecessor) => archivedOutcome(L, predecessor) === 'completed');
    if (eligible && task.meta.status === 'blocked') {
      task.meta.status = 'todo';
      task.meta.updated = new Date().toISOString().slice(0, 10);
      writeFileSync(task.path, renderFrontmatter(task.meta) + task.body, 'utf8');
      transitions.push(item.slug);
    }
    if (eligible && task.meta.status === 'todo') {
      if (item.status !== 'todo') { item.status = 'todo'; changed = true; }
      const queue = nextQueue.find((entry) => entry.slug === item.slug);
      if (queue && queue.status !== 'todo') { queue.status = 'todo'; changed = true; }
      if (!queue) { nextQueue.push({ slug: item.slug, status: 'todo' }); changed = true; }
    }
  }
  if (changed) saveState(L, { indexItems: nextIndex, queueRefs: nextQueue });
  for (const dependent of transitions) {
    const marker = `todo_dependency ${dependent} → todo`;
    if (!readFileSync(L.log, 'utf8').includes(marker)) appendLog(L, marker);
  }
}

function finalize(L, args, { conclusion }) {
  if (!args.evidence) throw new Error('Missing evidence (acceptance proof)');
  if (!args.signoff) throw new Error('Missing signoff (the owner words confirming closure)');
  const t = readTask(L, args.slug);
  if (!t) {
    if (conclusion === 'completed' && archivedOutcome(L, args.slug) === 'completed') {
      reconcileCompletion(L, args.slug);
      return `archived ${args.slug} → todo/archived/${args.slug}.md`;
    }
    throw new Error(`Task not found: ${args.slug}`);
  }
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
  if (existsSync(dest)) {
    if (conclusion !== 'completed' || archivedOutcome(L, args.slug) !== 'completed') throw new Error(`Conflicting archive: ${args.slug}`);
  } else writeFileSync(dest, renderFrontmatter(t.meta) + t.body.trimEnd() + '\n' + record, 'utf8');
  unlinkSync(t.path);
  if (conclusion === 'completed') reconcileCompletion(L, args.slug);
  else {
    const { indexItems, queueRefs } = loadState(L);
    saveState(L, { indexItems: indexItems.filter((i) => i.slug !== args.slug), queueRefs: queueRefs.filter((r) => r.slug !== args.slug) });
  }
  const marker = `${args.slug} archived — ${conclusion}`;
  if (!readFileSync(L.log, 'utf8').includes(marker)) appendLog(L, marker);
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
  const queued = new Set();
  for (const r of queueRefs) {
    if (queued.has(r.slug)) errors.push(`duplicate queue entry: ${r.slug}`);
    queued.add(r.slug);
    if (!inIndex.includes(r.slug)) errors.push(`todo.md references ${r.slug}, which is not in tasks.md`);
    const item = indexItems.find((i) => i.slug === r.slug);
    if (item && item.status !== r.status) errors.push(`status mismatch for ${r.slug}: tasks.md=${item.status}, todo.md=${r.status}`);
  }
  for (const item of indexItems) {
    if (!queued.has(item.slug)) errors.push(`tasks.md registers ${item.slug} but todo.md does not`);
    const task = readTask(L, item.slug);
    if (task && task.meta.status !== item.status) errors.push(`status mismatch for ${item.slug}: tasks.md=${item.status}, detail=${task.meta.status}`);
    if (!task || task.meta.depends_on === undefined) continue;
    try { validateDependency(L, item.slug, task.meta.depends_on, task.meta.blocker_cause); }
    catch (error) { errors.push(`${item.slug}: ${error.message}`); }
    if (task.meta.status === 'blocked' && task.meta.blocker_cause === 'dependency' && Array.isArray(task.meta.depends_on) && task.meta.depends_on.length && task.meta.depends_on.every((s) => archivedOutcome(L, s) === 'completed')) errors.push(`${item.slug} has completed predecessors but remains dependency-blocked`);
  }
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
