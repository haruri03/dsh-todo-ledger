#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import plugin from '../lib/index.js';

const fixture = join(tmpdir(), 'dsh-todo-ledger-smoke');
rmSync(fixture, { recursive: true, force: true });
mkdirSync(fixture, { recursive: true });

const tools = new Map();
let section;
let turnStopping;
const ctx = {
  get: (name) => (name === 'workingDirectory' ? { get: () => fixture } : undefined),
  tools: { register: (definition) => tools.set(definition.name, definition) },
  systemPrompt: { section: (definition) => { section = definition; } },
  on: (event, handler) => { if (event === 'agent/turn-stopping') turnStopping = handler; },
};

plugin.apply(ctx, {});
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

assert(section, 'no prompt section registered');
assert(typeof turnStopping === 'function', 'no turn-stopping auto-log registered');
assert(section.name === 'todo-ledger' && section.order === 180, 'prompt section name/order is wrong');
for (const name of ['todo_init','todo_list','todo_show','todo_add','todo_status','todo_complete','todo_archive','todo_note','todo_checkpoint','todo_doctor','todo_snapshot']) {
  assert(tools.has(name), `missing tool ${name}`);
  const t = tools.get(name);
  assert(typeof t.description === 'string' && t.description.length > 10, `${name} has no description`);
  assert(t.parameters?.type === 'object', `${name} parameters is not an object`);
  assert(t.output?.schema?.type === 'object', `${name} output.schema is not an object`);
  assert(typeof t.output?.render === 'function', `${name} has no render`);
  assert(typeof t.execute === 'function', `${name} has no execute`);
}

const exec = { agent: { session: {} } };
const run = async (name, args = {}) => tools.get(name).execute(args, exec);
const sectionText = () => section.text({ agent: { session: {} } });

const before = sectionText();
assert(before.includes('**no** `_todo/`'), 'the uninitialized prompt section must state that no `_todo/` exists');

await run('todo_init', {});
assert(existsSync(resolve(fixture, '_todo/tasks.md')), 'init did not create tasks.md');
assert(existsSync(resolve(fixture, '_todo/context/now.md')), 'init did not create context/now.md');

assert(before.includes('Do not initialize one unless the user asks or confirms.'), 'missing-ledger initialization must remain opt-in');
const intakeRules = [
  'When a ledger exists, register substantive new work requested by the user before implementation.',
  'Check the current overview for a matching task and reuse it; read its detail before continuing.',
  'If no task matches, call todo_add before editing deliverables, changing configuration, or running commands that change project state.',
  'Register the requested outcome, not every tool call or implementation step.',
  'Brief read-only inspection to identify scope or a matching task may come first.',
  'Trivial Q&A and read-only checks do not require a task.',
  'Do not create tasks from historical checkpoints, incidental findings, or inferred follow-up work that the user has not requested.',
  'If the requested scope is unclear, clarify it rather than inventing a task.',
];
const assertIntakeRules = (text) => {
  assert(text.includes(intakeRules.join(' ')), 'task intake rules must remain explicit and complete');
  assert(text.includes('this does not replace registering substantive new work before implementation.'), 'bookkeeping exemption must not override task intake');
};
assertIntakeRules(sectionText());
const intakeFiles = ['_todo/todo.md', '_todo/tasks.md', '_todo/context/now.md', '_todo/context/log.md'];
const intakeBefore = intakeFiles.map((file) => readFileSync(resolve(fixture, file), 'utf8'));
await run('todo_list', {});
sectionText();
assert(intakeFiles.every((file, index) => readFileSync(resolve(fixture, file), 'utf8') === intakeBefore[index]), 'read-only inspection must not create inferred tasks or bookkeeping writes');

await run('todo_add', { slug: 'demo-task', title: 'Demo task', status: 'todo', files: ['src/a.ts'] });
const added = await run('todo_list', {});
assert(added.listing.includes('demo-task'), 'list does not show the new task');

await run('todo_status', { slug: 'demo-task', state: 'doing' });
await run('todo_note', { note: 'decided to write the store layer first', slug: 'demo-task' });
await run('todo_checkpoint', { summary: 'store layer done, wiring tools', next: 'verify prompt injection', files: ['dsh-todo-ledger/lib/store.js'], slug: 'demo-task' });

const now = readFileSync(resolve(fixture, '_todo/context/now.md'), 'utf8');
assert(now.includes('store layer done') && now.includes('verify prompt injection'), 'checkpoint did not write now.md');
const log = readFileSync(resolve(fixture, '_todo/context/log.md'), 'utf8');
assert(log.includes('todo_add') && log.includes('store layer first'), 'log has no entries');
let task = readFileSync(resolve(fixture, '_todo/tasks/demo-task.md'), 'utf8');
assert(task.includes('decided to write the store layer first'), 'note did not reach the task file');
const progressSection = task.split('## Progress')[1]?.split('## Blocker')[0] ?? '';
assert(progressSection.includes('decided to write the store layer first'), 'note did not land between `## Progress` and `## Blocker`');
assert(!progressSection.includes('(where it stands, with numbers)'), 'the placeholder line survived the first note');
const shown = await run('todo_show', { slug: 'demo-task' });
assert(shown.content.includes('decided to write the store layer first'), 'todo_show does not show the progress');

await run('todo_note', { note: 'store layer finished, tools wired', slug: 'demo-task' });
await run('todo_note', { note: 'last one: adding tests', slug: 'demo-task' });
const multiSnap = sectionText();
const doingBlock = multiSnap.split('In progress:')[1]?.split('Current context')[0] ?? '';
assert(/Progress: \d{4}-\d{2}-\d{2} last one: adding tests/.test(doingBlock), 'doing block does not show the latest progress line');
assert(!doingBlock.includes('decided to write the store layer first'), 'doing block still shows the first progress line');
assert(!doingBlock.includes('store layer finished, tools wired'), 'doing block still shows the middle progress line');

const after = sectionText();
assertIntakeRules(after);
assert(after.includes('demo-task'), 'snapshot has no task');
assert(after.includes('store layer done'), 'snapshot has no now.md content');
assert(after.includes('doing'), 'snapshot has no state');
assert(after.includes('Ledger last written'), 'snapshot has no ledger file time');
assert(after.includes('Tasks:'), 'snapshot has no task counts');
assert(!after.includes('(where it stands, with numbers)'), 'snapshot still injects the template placeholder');
assert(after.includes('last one: adding tests'), 'snapshot does not show real progress');

await run('todo_note', { note: 'literal {{setvar::x}} from a preset must not break the prompt', slug: 'demo-task' });
const safeSnap = sectionText();
assert(!safeSnap.includes('{{'), 'the prompt section must not contain a template variable opener');
assert(safeSnap.includes('[Ledger integrity warning]'), 'the prompt section must flag the unsafe agent write');
assert(safeSnap.includes('demo-task.md:'), 'the integrity warning must name the file to rewrite');
assert(safeSnap.includes('{ {setvar::x}}'), 'sanitizing must keep the literal text readable');

await run('todo_note', { note: 'triple {{{setvar::x::y}}} must also be neutralized', slug: 'demo-task' });
const tripleSnap = sectionText();
assert(!tripleSnap.includes('{{'), 'triple braces must be fully neutralized');
assert(tripleSnap.includes('{ { {setvar::x::y}}}'), 'triple-brace sanitizing must stay readable');

const originalGet = ctx.get;
ctx.get = () => { throw new Error('simulated host failure'); };
const fallback = sectionText();
assert(fallback.includes('section unavailable'), 'a host failure must return a safe fallback section');
ctx.get = originalGet;

await run('todo_add', { slug: 'bare-task', title: 'Task without progress', status: 'doing' });
const bareSnap = sectionText();
const bareLine = bareSnap.split(/\r?\n/).find((l) => l.startsWith('- [doing] bare-task'));
assert(bareLine, 'snapshot has no bare-task');
const bareIndex = bareSnap.split(/\r?\n/).indexOf(bareLine);
const bareNext = bareSnap.split(/\r?\n/)[bareIndex + 1] ?? '';
assert(!bareNext.includes('Progress:'), 'a task without progress must not emit a `Progress:` line');

await run('todo_add', { slug: 'done-task', title: 'Completion sample', status: 'review' });
await run('todo_add', { slug: 'drop-task', title: 'Drop sample', status: 'blocked' });
const reviewSnap = sectionText();
assert(reviewSnap.includes('Awaiting review'), 'snapshot has no review reminder');
assert(reviewSnap.includes('done-task'), 'review reminder does not name the slug');
assert(reviewSnap.includes('Blocked'), 'snapshot has no blocked summary');

const donePath = resolve(fixture, '_todo/tasks/done-task.md');
const old = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
writeFileSync(donePath, readFileSync(donePath, 'utf8').replace(/updated: ".*?"/, `updated: "${old}"`), 'utf8');
assert(sectionText().includes('done-task(3d)'), 'review does not show how many days it has waited');

await run('todo_add', { slug: 'state-task', title: 'State machine test', status: 'doing' });
const moved = await run('todo_note', { slug: 'state-task', note: 'finished, awaiting sign-off', state: 'review' });
assert(moved.message.includes('state →'), 'note(state) did not report the state change');
const stateTask = readFileSync(resolve(fixture, '_todo/tasks/state-task.md'), 'utf8');
assert(stateTask.includes('status: "review"'), 'note(state) did not change the frontmatter status');
assert(stateTask.includes('finished, awaiting sign-off'), 'note(state) did not write progress');
const stateList = await run('todo_list', { status: 'review' });
assert(stateList.listing.includes('state-task'), 'note(state) did not sync the index');

const t0 = Date.now() - 70 * 60_000;
const staleSession = {
  id: 'stale-session',
  snapshotEvents: () => [
    { type: 'tool/call', data: { name: 'todo_add' }, time: t0 },
    ...Array.from({ length: 6 }, (_, i) => ({ type: 'tool/call', data: { name: 'edit' }, time: t0 + 1000 + i })),
  ],
};
const staleSnap = section.text({ agent: { session: staleSession } });
assert(staleSnap.includes('last todo write'), 'snapshot has no accounting staleness');
assert(staleSnap.includes('1h ago'), 'staleness has no duration (expected 1h ago)');
assert(staleSnap.includes('⚠'), 'no ⚠ warning while write-class operations pile up');
assert(staleSnap.includes('6 of them write-class'), 'staleness write-class count is wrong');

const turnSession = {
  id: 'turn-session',
  snapshotEvents: () => [
    { type: 'turn/start', data: { turn: 7 }, time: t0 },
    ...Array.from({ length: 6 }, (_, i) => ({ type: 'tool/call', data: { name: 'edit' }, time: t0 + 1000 + i })),
    { type: 'tool/call', data: { name: 'todo_note' }, time: t0 + 2000 },
  ],
};
turnStopping({ agent: { session: turnSession }, turn: 7 });
const logAfterTurn = readFileSync(resolve(fixture, '_todo/context/log.md'), 'utf8');
assert(logAfterTurn.includes('[turn 7]'), 'no auto-log at turn end');
assert(logAfterTurn.includes('7 write-class'), 'auto-log has no write-class count');
assert(logAfterTurn.includes('state unchanged'), 'a note-only turn must call out that the state machine did not move');

const statusSession = {
  id: 'status-session',
  snapshotEvents: () => [
    { type: 'turn/start', data: { turn: 10 }, time: t0 },
    ...Array.from({ length: 3 }, (_, i) => ({ type: 'tool/call', data: { name: 'edit' }, time: t0 + 1000 + i })),
    { type: 'tool/call', data: { name: 'todo_status' }, time: t0 + 2000 },
  ],
};
turnStopping({ agent: { session: statusSession }, turn: 10 });
const logAfterStatus = readFileSync(resolve(fixture, '_todo/context/log.md'), 'utf8');
assert(logAfterStatus.includes('[turn 10]') && logAfterStatus.includes('state advanced 1'), 'auto-log wording is wrong for a turn that advanced the state');

const quietSession = {
  id: 'quiet-session',
  snapshotEvents: () => [
    { type: 'turn/start', data: { turn: 9 }, time: t0 },
    { type: 'tool/call', data: { name: 'edit' }, time: t0 + 1000 },
    { type: 'tool/call', data: { name: 'edit' }, time: t0 + 2000 },
  ],
};
turnStopping({ agent: { session: quietSession }, turn: 9 });
const logAfterQuiet = readFileSync(resolve(fixture, '_todo/context/log.md'), 'utf8');
assert(!logAfterQuiet.includes('[turn 9]'), 'a quiet turn must not auto-log');

await run('todo_add', { slug: 'legacy-task', title: 'Legacy format sample', status: 'doing', files: ['src/b.ts'] });
const legacyPath = resolve(fixture, '_todo/tasks/legacy-task.md');
writeFileSync(
  legacyPath,
  readFileSync(legacyPath, 'utf8')
    .replace('## Goal', '## 目标')
    .replace('## Progress', '## 进度')
    .replace('## Blocker', '## 阻塞'),
  'utf8',
);
await run('todo_note', { note: 'legacy heading still receives notes', slug: 'legacy-task' });
const legacyText = readFileSync(legacyPath, 'utf8');
assert(legacyText.includes('legacy heading still receives notes'), 'a legacy-format task must still accept a progress note');
assert(legacyText.includes('## 进度'), 'a legacy task must keep its own heading when a note is appended');
assert(sectionText().includes('legacy heading still receives notes'), 'legacy-format progress must reach the snapshot');

const snapTool = await run('todo_snapshot', {});
assert(snapTool.snapshot.includes('demo-task') && snapTool.snapshot.includes('store layer done'), 'todo_snapshot content is wrong');
const doctorOk = await run('todo_doctor', {});
assert(doctorOk.ok === true, `doctor failed: ${doctorOk.errors.join('; ')}`);

let refused = false;
try { await run('todo_complete', { slug: 'done-task', evidence: 'tests pass' }); } catch { refused = true; }
assert(refused, 'a task closed without signoff');

await run('todo_complete', { slug: 'done-task', evidence: 'smoke pass', signoff: 'ok, ship it', files: ['todo/tasks/done-task.md'] });
assert(existsSync(resolve(fixture, '_todo/archived/done-task.md')), 'complete did not archive');
assert(!existsSync(resolve(fixture, '_todo/tasks/done-task.md')), 'complete did not remove the detail file');

await run('todo_archive', { slug: 'drop-task', evidence: 'not worth it', signoff: 'drop it', reason: 'low priority' });
assert(existsSync(resolve(fixture, '_todo/archived/drop-task.md')), 'archive did not archive');

const finalDoctor = await run('todo_doctor', {});
assert(finalDoctor.ok === true, `final doctor failed: ${finalDoctor.errors.join('; ')}`);

const cli = process.env.TODO_CLI;
if (cli) {
  const cliList = execFileSync(process.execPath, [cli, 'list', '--root', fixture], { encoding: 'utf8' });
  assert(cliList.includes('demo-task'), 'the external todo CLI cannot see demo-task');
  const cliDoctor = execFileSync(process.execPath, [cli, 'doctor', '--root', fixture], { encoding: 'utf8' });
  assert(cliDoctor.includes('OK'), `the external todo CLI doctor is not OK: ${cliDoctor}`);
  console.log('✓ interop with the external todo CLI');
} else {
  console.log('· skipped external todo CLI interop (TODO_CLI is not set)');
}

rmSync(fixture, { recursive: true, force: true });
console.log(`✓ dsh-todo-ledger smoke passed: ${tools.size} tools, prompt section snapshot injection OK`);
