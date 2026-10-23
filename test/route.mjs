import assert from 'node:assert/strict';

const mod = await import('../lib/index.js');

assert.deepEqual(
  [...mod.inject].sort(),
  ['sessions', 'systemPrompt', 'tools', 'webServer'],
  'the plugin must inject webServer and sessions, otherwise the projection route is never registered',
);

const registered = [];
const ctx = {
  systemPrompt: { section() {} },
  tools: { define() {} },
  effect(fn) {
    const dispose = fn();
    return typeof dispose === 'function' ? dispose : () => {};
  },
  on() {},
  get() {
    throw new Error('ctx.get must not be used for injected services');
  },
  webServer: { register(definition) { registered.push(definition); } },
  sessions: { list: () => [] },
};

mod.apply(ctx, {});
assert.equal(registered.length, 1, 'apply must register exactly one web route');
assert.equal(registered[0].kind, 'prefix');
assert.equal(registered[0].path, '/todo-ledger/projection');
assert.equal(typeof registered[0].handler, 'function');

const captured = { status: 0, page: '' };
registered[0].handler(
  { url: '/todo-ledger/projection' },
  { writeHead(status) { captured.status = status; }, end(page) { captured.page = page; } },
);
assert.equal(captured.status, 200);
assert.equal(JSON.parse(captured.page).kind, 'unbound');

console.log('route: ok');
