import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completeBody, createCompleteHandler } from '../lib/bridge.js';

const fixture = mkdtempSync(join(tmpdir(), 'todo-accept-'));
try {
  const base = join(fixture, '_todo');
  mkdirSync(join(base, 'tasks'), { recursive: true });
  mkdirSync(join(base, 'archived'), { recursive: true });
  writeFileSync(
    join(base, 'tasks.md'),
    '# Tasks\n\n- [review] **ship** — Ship it → [详情](tasks/ship.md)\n- [todo] **later** — Later work → [详情](tasks/later.md)\n',
  );
  writeFileSync(join(base, 'todo.md'), '# Queue\n\n- [review] ship\n- [todo] later\n');
  for (const [slug, status, files] of [
    ['ship', 'review', ['lib/ship.js']],
    ['later', 'todo', []],
  ]) {
    const front = [`---`, `slug: "${slug}"`, `status: "${status}"`];
    if (files.length > 0) front.push(`files: [${files.map((file) => JSON.stringify(file)).join(', ')}]`);
    front.push('---', '', '## Progress', '');
    writeFileSync(join(base, 'tasks', `${slug}.md`), front.join('\n'));
  }

  assert.deepEqual(completeBody(undefined, { slug: 'ship' }), { ok: false, kind: 'unbound' });
  assert.equal(completeBody(undefined, { cwd: fixture, slug: '../etc' }).kind, 'invalid');
  assert.equal(completeBody(undefined, { cwd: fixture, slug: 'nope' }).kind, 'missing');

  const refused = completeBody(undefined, { cwd: fixture, slug: 'later' });
  assert.equal(refused.ok, false);
  assert.equal(refused.kind, 'not-review');
  assert.equal(existsSync(join(base, 'tasks', 'later.md')), true);

  const done = completeBody(undefined, { cwd: fixture, slug: 'ship' });
  assert.equal(done.ok, true);
  assert.equal(done.kind, 'completed');
  assert.equal(existsSync(join(base, 'tasks', 'ship.md')), false);
  const archived = readFileSync(join(base, 'archived', 'ship.md'), 'utf8');
  assert.match(archived, /## 交付记录/);
  assert.match(archived, /签收：accepted from the ledger panel at/);
  assert.match(archived, /`lib\/ship\.js`/);

  const queue = readFileSync(join(base, 'todo.md'), 'utf8');
  assert.equal(queue.includes('ship'), false);
  assert.equal(queue.includes('later'), true);

  const again = completeBody(undefined, { cwd: fixture, slug: 'ship' });
  assert.equal(again.ok, false);

  const calls = [];
  const handler = createCompleteHandler({});
  const response = () => {
    const record = { status: 0, body: '' };
    calls.push(record);
    return {
      writeHead(status) {
        record.status = status;
      },
      end(page) {
        record.body = page;
      },
    };
  };
  handler({ method: 'GET', url: '/todo-ledger/complete' }, response());
  assert.equal(calls[0].status, 400);
  assert.equal(JSON.parse(calls[0].body).kind, 'invalid');

  let handlers = {};
  const request = {
    method: 'GET',
    url: `/todo-ledger/complete?slug=later&cwd=${encodeURIComponent(fixture)}`,
    on(event, listener) {
      handlers[event] = listener;
      return request;
    },
  };
  handler(request, response());
  handlers.end();
  assert.equal(calls[1].status, 400);
  assert.equal(JSON.parse(calls[1].body).kind, 'not-review');

  handlers = {};
  const bad = {
    method: 'POST',
    url: '/todo-ledger/complete',
    on(event, listener) {
      handlers[event] = listener;
      return bad;
    },
  };
  handler(bad, response());
  handlers.data(Buffer.from('{not json'));
  handlers.end();
  assert.equal(calls[2].status, 400);
  assert.equal(JSON.parse(calls[2].body).kind, 'invalid');

  console.log('accept: ok');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
