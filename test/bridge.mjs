import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProjectionHandler, projectionBody } from '../lib/bridge.js';

const fixture = mkdtempSync(join(tmpdir(), 'todo-bridge-'));
try {
  const base = join(fixture, '_todo');
  mkdirSync(join(base, 'tasks'), { recursive: true });
  writeFileSync(join(base, 'tasks.md'), '# Tasks\n\n- [doing] **live** — Live work → [详情](tasks/live.md)\n- [todo] **next** — Next work → [详情](tasks/next.md)\n');
  writeFileSync(join(base, 'todo.md'), '# Queue\n\n- [doing] live\n- [todo] next\n');
  for (const [slug, status] of [['live', 'doing'], ['next', 'todo']]) {
    writeFileSync(join(base, 'tasks', `${slug}.md`), `---\nslug: "${slug}"\nstatus: "${status}"\n---\n\n## Progress\n`);
  }

  assert.equal(projectionBody().kind, 'unbound');
  assert.equal(projectionBody(undefined, 'sessionId=unknown').kind, 'unbound');

  const ready = projectionBody(undefined, `cwd=${encodeURIComponent(fixture)}`);
  assert.equal(ready.kind, 'ready');
  assert.deepEqual(ready.counts, { doing: 1, todo: 1, review: 0, blocked: 0 });
  assert.deepEqual(ready.tasks.map(({ slug }) => slug), ['live', 'next']);

  const sessions = { list: () => [{ id: 'session-1', header: { cwd: fixture } }] };
  assert.equal(projectionBody(sessions, 'sessionId=session-1').kind, 'ready');
  assert.equal(projectionBody(sessions, 'sessionId=session-2').kind, 'unbound');
  assert.equal(projectionBody(sessions, '').kind, 'unbound');
  assert.equal(projectionBody(sessions, 'sessionId=').kind, 'unbound');
  const coldSessions = { list: () => [] };
  assert.equal(projectionBody(coldSessions, 'sessionId=session-1').kind, 'unbound');
  coldSessions.list = sessions.list;
  assert.equal(projectionBody(coldSessions, 'sessionId=session-1').kind, 'ready');

  const empty = mkdtempSync(join(tmpdir(), 'todo-bridge-empty-'));
  try {
    assert.equal(projectionBody(undefined, `cwd=${encodeURIComponent(empty)}`).kind, 'absent');
    assert.equal(existsSync(join(empty, '_todo')), false);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }

  const handler = createProjectionHandler({ sessions });
  const captured = { status: 0, page: '' };
  handler(
    { url: `/todo-ledger/projection?sessionId=session-1` },
    { writeHead(status) { captured.status = status; }, end(page) { captured.page = page; } },
  );
  assert.equal(captured.status, 200);
  assert.equal(JSON.parse(captured.page).kind, 'ready');

  const broken = { status: 0, page: '' };
  handler(undefined, { writeHead(status) { broken.status = status; }, end(page) { broken.page = page; } });
  assert.equal(broken.status, 200);
  assert.equal(JSON.parse(broken.page).kind, 'unbound');

  const orphan = { status: 0, page: '' };
  createProjectionHandler()(
    { url: '/todo-ledger/projection' },
    { writeHead(status) { orphan.status = status; }, end(page) { orphan.page = page; } },
  );
  assert.equal(JSON.parse(orphan.page).kind, 'unbound');

  let closed = false;
  createProjectionHandler()({ url: '/todo-ledger/projection' }, { writeHead() { throw new Error('closed'); }, end() {} });
  assert.equal(closed, false);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
console.log('bridge: ok');
