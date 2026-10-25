import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findRoot, LEDGER_DIRS, STATES } from './store.js';
import { detailPattern } from './format.js';

const ORDER = ['doing', 'todo', 'review', 'blocked'];
const INDEX_LINE = new RegExp(`^-\\s*\\[(todo|doing|blocked|review)\\]\\s*\\*\\*([a-z0-9-]+)\\*\\*\\s*—\\s*(.*?)(?:\\s*→\\s*\\[${detailPattern()}\\]\\((.*?)\\))?\\s*$`);
const QUEUE_LINE = /^-\s*\[(todo|doing|blocked|review)\]\s*([a-z0-9-]+)\s*$/;

function rows(text, pattern, map) {
  const result = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('- [')) continue;
    const match = line.match(pattern);
    if (!match) return null;
    result.push(map(match));
  }
  return result;
}

function detailStatus(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const status = match?.[1].match(/^status:\s*["']?(todo|doing|blocked|review)["']?\s*$/m)?.[1];
  return status;
}

export function readProjection(cwd) {
  const directory = resolve(cwd);
  const root = findRoot(directory);
  if (!root) return { kind: 'absent', cwd: directory };
  const dir = LEDGER_DIRS.find((name) => existsSync(join(root, name, 'tasks.md')));
  const base = join(root, dir);
  const indexPath = join(base, 'tasks.md');
  const queuePath = join(base, 'todo.md');
  try {
    const indexed = rows(readFileSync(indexPath, 'utf8'), INDEX_LINE, (m) => ({ status: m[1], slug: m[2], title: m[3], link: m[4] || `tasks/${m[2]}.md` }));
    const queued = rows(readFileSync(queuePath, 'utf8'), QUEUE_LINE, (m) => ({ status: m[1], slug: m[2] }));
    if (!indexed || !queued || indexed.length !== queued.length) return { kind: 'inconsistent', cwd: directory, root };
    const queue = new Map(queued.map(({ slug, status }) => [slug, status]));
    if (queue.size !== queued.length || new Set(indexed.map(({ slug }) => slug)).size !== indexed.length) return { kind: 'inconsistent', cwd: directory, root };
    for (const item of indexed) {
      if (!STATES.includes(item.status) || queue.get(item.slug) !== item.status) return { kind: 'inconsistent', cwd: directory, root };
      if (detailStatus(readFileSync(join(base, 'tasks', `${item.slug}.md`), 'utf8')) !== item.status) return { kind: 'inconsistent', cwd: directory, root };
    }
    const tasks = indexed.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.slug.localeCompare(b.slug));
    const counts = Object.fromEntries(ORDER.map((state) => [state, tasks.filter((task) => task.status === state).length]));
    return { kind: 'ready', cwd: directory, root, dir, tasks, counts };
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'inconsistent', cwd: directory, root };
    return { kind: 'error', cwd: directory, root, message: String(error?.message || error) };
  }
}
