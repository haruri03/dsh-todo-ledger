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
assert.equal(registered.length, 2, 'apply must register the projection route and the complete route');
assert.deepEqual(
  registered.map((definition) => definition.path).sort(),
  ['/todo-ledger/complete', '/todo-ledger/projection'],
);
for (const definition of registered) {
  assert.equal(definition.kind, 'prefix');
  assert.equal(typeof definition.handler, 'function');
}
const projection = registered.find((definition) => definition.path === '/todo-ledger/projection');
const complete = registered.find((definition) => definition.path === '/todo-ledger/complete');

const captured = { status: 0, page: '' };
projection.handler(
  { url: '/todo-ledger/projection' },
  { writeHead(status) { captured.status = status; }, end(page) { captured.page = page; } },
);
assert.equal(captured.status, 200);
assert.equal(JSON.parse(captured.page).kind, 'unbound');

const refused = { status: 0, page: '' };
complete.handler(
  { method: 'GET', url: '/todo-ledger/complete' },
  { writeHead(status) { refused.status = status; }, end(page) { refused.page = page; } },
);
assert.equal(refused.status, 405);
assert.equal(JSON.parse(refused.page).kind, 'invalid');

console.log('route: ok');
