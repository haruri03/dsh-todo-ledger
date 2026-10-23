import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdAdd, cmdArchive, cmdComplete, cmdDoctor, cmdStatus, layout, readTask } from '../lib/store.js';

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'todo-dependency-'));
  try { fn(layout(root)); } finally { rmSync(root, { recursive: true, force: true }); }
}

function registered(L, slug) {
  const index = readFileSync(L.index, 'utf8');
  const queue = readFileSync(L.queue, 'utf8');
  return { index: index.match(new RegExp(`^- \\[([^\\]]+)\\] \\*\\*${slug}\\*\\*`, 'm'))?.[1], queue: queue.match(new RegExp(`^- \\[([^\\]]+)\\] ${slug}$`, 'm'))?.[1] };
}

const closure = (slug) => ({ slug, evidence: 'Acceptance verified', signoff: 'Owner approved' });

test('optional dependency metadata round-trips without changing legacy task format', () => fixture((L) => {
  cmdAdd(L, { slug: 'first', title: 'First' });
  cmdAdd(L, { slug: 'dependent', title: 'Dependent', status: 'blocked', depends_on: ['first'], blocker_cause: 'dependency' });
  const dependent = readTask(L, 'dependent');
  assert.deepEqual(dependent.meta.depends_on, ['first']);
  assert.equal(dependent.meta.blocker_cause, 'dependency');
  assert.equal(readTask(L, 'first').meta.depends_on, undefined);
  assert.equal(readTask(L, 'first').meta.blocker_cause, undefined);
  assert.deepEqual(cmdDoctor(L).errors, []);
}));

test('rejects invalid, absent, dropped, self and cyclic predecessor references without partial task creation', () => fixture((L) => {
  cmdAdd(L, { slug: 'root', title: 'Root' });
  cmdAdd(L, { slug: 'dropped', title: 'Dropped', status: 'review' });
  cmdArchive(L, { ...closure('dropped'), reason: 'No longer needed' });
  for (const predecessor of ['BAD', 'missing', 'dropped', 'self']) {
    assert.throws(() => cmdAdd(L, { slug: 'self', title: 'Self', status: 'blocked', depends_on: [predecessor], blocker_cause: 'dependency' }));
    assert.equal(readTask(L, 'self'), null);
  }
  assert.throws(() => cmdAdd(L, { slug: 'bad-cause', title: 'Bad cause', status: 'blocked', depends_on: ['root'], blocker_cause: 'other' }));
  assert.throws(() => cmdAdd(L, { slug: 'no-cause', title: 'No cause', status: 'blocked', depends_on: ['root'] }));
  assert.throws(() => cmdAdd(L, { slug: 'no-predecessor', title: 'No predecessor', status: 'blocked', blocker_cause: 'dependency' }));
  assert.throws(() => cmdAdd(L, { slug: 'duplicate', title: 'Duplicate', status: 'blocked', depends_on: ['root', 'root'], blocker_cause: 'dependency' }));
  cmdAdd(L, { slug: 'child', title: 'Child', status: 'blocked', depends_on: ['root'], blocker_cause: 'dependency' });
  assert.throws(() => cmdAdd(L, { slug: 'root', title: 'Root', status: 'blocked', depends_on: ['child'], blocker_cause: 'dependency' }));
}));

test('a new dependency-only task starts ready when every predecessor is already formally completed', () => fixture((L) => {
  cmdAdd(L, { slug: 'source', title: 'Source', status: 'review' });
  cmdComplete(L, closure('source'));
  cmdAdd(L, { slug: 'dependent', title: 'Dependent', status: 'blocked', depends_on: ['source'], blocker_cause: 'dependency' });
  assert.equal(readTask(L, 'dependent').meta.status, 'todo');
  assert.deepEqual(registered(L, 'dependent'), { index: 'todo', queue: 'todo' });
  assert.deepEqual(cmdDoctor(L).errors, []);
}));

test('only formal completion of every predecessor releases explicit dependency-only blockers', () => fixture((L) => {
  cmdAdd(L, { slug: 'alpha', title: 'Alpha', status: 'review' });
  cmdAdd(L, { slug: 'beta', title: 'Beta', status: 'review' });
  cmdAdd(L, { slug: 'dependent', title: 'Dependent', status: 'blocked', depends_on: ['alpha', 'beta'], blocker_cause: 'dependency' });
  cmdAdd(L, { slug: 'manual', title: 'Manual', status: 'blocked', depends_on: ['alpha'], blocker_cause: 'manual' });
  cmdAdd(L, { slug: 'unknown', title: 'Unknown', status: 'blocked' });
  assert.throws(() => cmdComplete(L, { slug: 'alpha', evidence: 'Acceptance verified' }), /signoff/);
  assert.equal(readTask(L, 'dependent').meta.status, 'blocked');
  cmdComplete(L, closure('alpha'));
  assert.equal(readTask(L, 'dependent').meta.status, 'blocked');
  assert.equal(readTask(L, 'manual').meta.status, 'blocked');
  cmdComplete(L, closure('beta'));
  assert.equal(readTask(L, 'dependent').meta.status, 'todo');
  assert.deepEqual(registered(L, 'dependent'), { index: 'todo', queue: 'todo' });
  assert.equal(readTask(L, 'manual').meta.status, 'blocked');
  assert.equal(readTask(L, 'unknown').meta.status, 'blocked');
  assert.deepEqual(cmdDoctor(L).errors, []);
}));

test('a manual transition back to blocked overrides dependency-only provenance', () => fixture((L) => {
  cmdAdd(L, { slug: 'source', title: 'Source', status: 'review' });
  cmdAdd(L, { slug: 'dependent', title: 'Dependent', status: 'blocked', depends_on: ['source'], blocker_cause: 'dependency' });
  cmdStatus(L, { slug: 'dependent', state: 'doing' });
  cmdStatus(L, { slug: 'dependent', state: 'blocked' });
  cmdComplete(L, closure('source'));
  assert.equal(readTask(L, 'dependent').meta.status, 'blocked');
  assert.equal(readTask(L, 'dependent').meta.blocker_cause, 'manual');
}));

test('review and dropped archive cannot satisfy dependencies', () => fixture((L) => {
  cmdAdd(L, { slug: 'reviewed', title: 'Reviewed', status: 'review' });
  cmdAdd(L, { slug: 'dependent', title: 'Dependent', status: 'blocked', depends_on: ['reviewed'], blocker_cause: 'dependency' });
  assert.equal(readTask(L, 'dependent').meta.status, 'blocked');
  cmdArchive(L, { ...closure('reviewed'), reason: 'Canceled' });
  assert.equal(readTask(L, 'dependent').meta.status, 'blocked');
  assert(cmdDoctor(L).errors.some((error) => error.includes('reviewed')));
}));

test('repeated completion repairs interrupted index, queue and dependent updates without duplicate transition logs', () => fixture((L) => {
  cmdAdd(L, { slug: 'source', title: 'Source', status: 'review' });
  cmdAdd(L, { slug: 'dependent', title: 'Dependent', status: 'blocked', depends_on: ['source'], blocker_cause: 'dependency' });
  cmdComplete(L, closure('source'));
  const before = readFileSync(L.log, 'utf8');
  const detail = readTask(L, 'dependent');
  detail.meta.status = 'blocked';
  writeFileSync(detail.path, readFileSync(detail.path, 'utf8').replace('status: "todo"', 'status: "blocked"'));
  writeFileSync(L.index, readFileSync(L.index, 'utf8').replace('[-', '[-').replace('[todo] **dependent**', '[blocked] **dependent**'));
  writeFileSync(L.queue, readFileSync(L.queue, 'utf8').replace('[todo] dependent', '[blocked] dependent'));
  assert(cmdDoctor(L).errors.some((error) => error.includes('dependent')));
  cmdComplete(L, closure('source'));
  assert.equal(readTask(L, 'dependent').meta.status, 'todo');
  assert.deepEqual(registered(L, 'dependent'), { index: 'todo', queue: 'todo' });
  assert.equal(readFileSync(L.log, 'utf8'), before);
  assert.deepEqual(cmdDoctor(L).errors, []);
}));
