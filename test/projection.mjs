import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProjection } from '../lib/projection.js';

const fixture = mkdtempSync(join(tmpdir(), 'todo-ledger-projection-'));
try {
  const cwd = join(fixture, 'nested');
  mkdirSync(cwd);
  assert.equal(readProjection(cwd).kind, 'absent');
  assert.equal(existsSync(join(fixture, '_todo')), false);

  const base = join(fixture, '_todo');
  mkdirSync(join(base, 'tasks'), { recursive: true });
  writeFileSync(join(base, 'tasks.md'), '# Tasks\n\n- [review] **review-task** — Awaiting signoff → [详情](tasks/review-task.md)\n- [doing] **active-task** — Current work → [详情](tasks/active-task.md)\n- [todo] **next-task** — Next work → [详情](tasks/next-task.md)\n- [blocked] **blocked-task** — Waiting → [详情](tasks/blocked-task.md)\n');
  assert.equal(readProjection(cwd).kind, 'inconsistent');
  assert.equal(existsSync(join(base, 'todo.md')), false);

  writeFileSync(join(base, 'todo.md'), '# Queue\n\n- [review] review-task\n- [doing] active-task\n- [todo] next-task\n- [blocked] blocked-task\n');
  for (const [slug, status] of [['review-task', '"review"'], ['active-task', 'doing'], ['next-task', 'todo'], ['blocked-task', 'blocked']]) {
    writeFileSync(join(base, 'tasks', `${slug}.md`), `---\nslug: ${slug}\nstatus: ${status}\ntitle: ${slug}\n---\n\n## Progress\n`);
  }
  const snapshot = readProjection(cwd);
  assert.equal(snapshot.kind, 'ready');
  assert.equal(snapshot.root, fixture);
  assert.deepEqual(snapshot.tasks.map(({ slug }) => slug), ['active-task', 'next-task', 'review-task', 'blocked-task']);
  assert.deepEqual(snapshot.counts, { doing: 1, todo: 1, review: 1, blocked: 1 });

  writeFileSync(join(base, 'todo.md'), '# Queue\n- [todo] active-task\n');
  assert.equal(readProjection(cwd).kind, 'inconsistent');
  assert.equal(existsSync(join(base, 'context')), false);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log('projection: ok');
