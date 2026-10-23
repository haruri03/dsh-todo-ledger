import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(root, '../client.js'), 'utf8');
const slotEntries = [];
const tabTypes = [];
const registeredDictionaries = new Map();
const listeners = new Set();
let activeLocale = 'en';
let moduleDefinition;
let fetchCalls = 0;
let intervalCalls = 0;

const React = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children };
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect(effect) {
    return effect();
  },
  useCallback(callback) {
    return callback;
  },
  useMemo(factory) {
    return factory();
  },
  useRef(initial) {
    return { current: initial };
  },
};

const locale = {
  register(namespace, id, dictionary) {
    const key = `${namespace}:${id}`;
    registeredDictionaries.set(key, dictionary);
    return () => registeredDictionaries.delete(key);
  },
  bind(namespace) {
    return (key) => registeredDictionaries.get(`${namespace}:${activeLocale}`)?.[key] ?? key;
  },
  getSnapshot() {
    return { active: activeLocale, revision: 0 };
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const services = {
  locale,
  sidebarRightTabs: {
    register(definition) {
      tabTypes.push(definition);
      return () => {};
    },
  },
};

const saved = new Map();
const browserEvents = new Map();
const storage = {
  getItem(key) {
    return saved.get(key) ?? null;
  },
  setItem(key, value) {
    saved.set(key, value);
  },
};

runInNewContext(source, {
  window: {
    __ModuleLoader__: {
      load(definition) {
        moduleDefinition = definition;
      },
    },
    localStorage: storage,
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(name, callback) {
      const entries = browserEvents.get(name) ?? new Set();
      entries.add(callback);
      browserEvents.set(name, entries);
    },
    removeEventListener(name, callback) {
      browserEvents.get(name)?.delete(callback);
    },
  },
  document: { documentElement: { lang: 'en' }, visibilityState: 'visible' },
  fetch: async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        kind: 'bound',
        root: '/repo',
        counts: { doing: 1, todo: 2 },
        tasks: [
          { slug: 'alpha', title: 'Alpha', status: 'doing' },
          { slug: 'beta', title: 'Beta', status: 'todo' },
          { slug: 'gamma', title: 'Gamma', status: 'todo' },
        ],
      }),
    };
  },
  setInterval: () => {
    intervalCalls += 1;
    return intervalCalls;
  },
  clearInterval() {},
  AbortController,
  URLSearchParams,
});

assert.ok(moduleDefinition, 'client module did not register');
const plugin = moduleDefinition.factory((name) => {
  assert.equal(name, 'react');
  return React;
});

plugin.apply({
  inject(_names, callback) {
    return callback({
      get(name) {
        return services[name];
      },
      effect(effect) {
        return effect();
      },
    });
  },
  slots: {
    inject(_name, callback) {
      return callback();
    },
    register(options, component) {
      slotEntries.push({ options, component });
      return () => {};
    },
  },
});

const composerEntry = slotEntries.find((entry) => entry.options.name === 'conversation.composer.dock');
const overlayEntry = slotEntries.find((entry) => entry.options.name === 'shell.overlay');
const sidebarEntry = slotEntries.find((entry) => entry.options.name === 'sidebar.right.pane.tab');

assert.ok(sidebarEntry, 'existing sidebar panel registration was removed');
sidebarEntry.component({ sessionId: 'session-test' });
sidebarEntry.component({ sessionId: 'session-test' });
assert.equal(fetchCalls, 1, 'panels for the same session duplicated the initial ledger request');
assert.equal(intervalCalls, 1, 'panels for the same session duplicated the polling timer');
sidebarEntry.component({ sessionId: 'session-other' });
assert.equal(fetchCalls, 2, 'different sessions did not receive isolated ledger requests');
assert.equal(intervalCalls, 2, 'different sessions did not receive isolated polling timers');
assert.equal(sidebarEntry.options.inject, undefined, 'the panel must read the slot-provided sessionId instead of freezing an injected copy');
await new Promise((resolve) => setTimeout(resolve, 0));
const wakeListeners = [...(browserEvents.get('focus') ?? [])];
assert.ok(wakeListeners.length > 0, 'no focus listener re-reads the ledger after the window comes back');
const beforeWake = fetchCalls;
for (const listener of wakeListeners) listener();
assert.ok(fetchCalls > beforeWake, 'returning focus did not re-read the ledger for the session now in front');
const tabType = tabTypes.find((definition) => definition.id === 'dsh-todo-ledger:ledger');
assert.ok(tabType, 'existing sidebar tab type was removed');
assert.equal(typeof tabType.icon, 'function', 'sidebar tab type registered no icon, so the tab and its launcher entry fall back to a generic glyph');
assert.ok(tabType.icon(), 'sidebar tab icon function produced nothing');
assert.ok(registeredDictionaries.has('todo-ledger-panel:en'), 'English host-locale dictionary was not registered');
assert.ok(registeredDictionaries.has('todo-ledger-panel:zh'), 'Chinese host-locale dictionary was not registered');
assert.ok(composerEntry, 'composer dock launcher was not registered');
assert.ok(overlayEntry, 'root floating overlay was not registered');

const launcher = composerEntry.component({ sessionId: 'session-test' });
const visit = (node, predicate) => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = visit(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  if (typeof node.type === 'function' && node.type.name === 'BookIcon') return visit(node.type(node.props), predicate);
  return visit(node.children, predicate);
};

const launchButton = visit(launcher, (node) => node.props?.['data-todo-ledger-launcher'] === '');
assert.ok(launchButton, 'composer launcher button was not rendered');
assert.equal(launchButton.props.type, 'button');
assert.ok(launchButton.props['aria-label'], 'composer launcher has no accessible name');
assert.ok(visit(launcher, (node) => node.type === 'svg'), 'launcher does not render the shared book icon');
assert.equal(overlayEntry.component(), null, 'floating panel should start closed');
launchButton.props.onClick();
let overlay = overlayEntry.component();
assert.ok(overlay, 'launcher did not open the floating panel');
assert.equal(overlay.props.style.pointerEvents, 'none', 'overlay background blocks the page');
const section = visit(overlay, (node) => node.type === 'section');
assert.equal(section.props.style.pointerEvents, 'auto');
assert.match(section.props.style.background, /--dsw-alias-bg-overlay/, 'floating surface must follow the host overlay theme');
assert.match(section.props.style.color, /--dsw-alias-label-primary/, 'floating title and close control must contrast with the surface');
assert.equal((source.match(/#[0-9a-f]{3,8}\b/gi) ?? []).length, 0, 'the panel must not hard-code colours; every surface, border and state colour comes from a host theme token');
assert.match(source, /doing: 'var\(--dsw-alias-brand-primary\)'/, 'the in-progress tone must use the brand token');
assert.match(source, /todo: 'var\(--dsw-alias-state-idle-primary\)'/, 'the to-do tone must use the idle state token');
assert.match(source, /review: 'var\(--dsw-alias-state-warn-primary\)'/, 'the review tone must use the warning state token');
assert.match(source, /blocked: 'var\(--dsw-alias-state-error-primary\)'/, 'the blocked tone must use the error state token');
assert.match(source, /accept: 'var\(--dsw-alias-state-success-primary\)'/, 'the accept action must use the success state token');
assert.match(source, /item: \{[^}]*background: 'var\(--dsw-alias-bg-layer-2\)'/, 'task rows must sit on the host nested surface token');
assert.match(source, /chip: \{[^}]*border: '1px solid var\(--dsw-alias-border-l1\)'/, 'count chips must use the host subtle border token');
assert.match(source, /sectionTitle: \{[^}]*color: 'var\(--dsw-alias-label-secondary\)'/, 'section titles must use the host secondary label token');
assert.equal(launchButton.props.style.background, 'transparent', 'composer launcher must sit flat in the dock, not as a filled chip');
assert.equal(launchButton.props.style.border, 0, 'composer launcher must not draw a border around itself');
assert.equal(launchButton.props.style.color, 'var(--dsw-alias-label-secondary)', 'idle launcher must use the dock secondary label colour');
assert.equal(launchButton.props.style.opacity, 0.8, 'idle launcher must sit at the dock text opacity so it does not out-shine its neighbours');
assert.equal(launchButton.props.style.fontSize, '13px', 'composer launcher must match the dock item font size');
assert.ok(launchButton.props.onMouseEnter && launchButton.props.onMouseLeave, 'composer launcher has no hover highlight');
const panel = visit(overlay, (node) => node.type?.name === 'Panel');
assert.equal(panel.props.sessionId, 'session-test', 'floating panel lost the exact launching session');
composerEntry.component({ sessionId: 'session-moved' });
assert.equal(visit(overlayEntry.component(), (node) => node.type?.name === 'Panel').props.sessionId, 'session-moved', 'the open floating window must follow the session now in front instead of the session that launched it');
const scrollRegions = source.match(/overflowY: 'auto'/g) ?? [];
assert.equal(scrollRegions.length, 1, 'exactly one region may scroll, otherwise the counts row and refresh bar scroll away with a long task list');
assert.match(source, /overflowY: 'auto'[^}]*overscrollBehavior: 'contain'/, 'scrolling the task list must not chain into the page behind the window');
assert.match(source, /body: \{[^}]*flex: '1 1 auto'[^}]*overflowY: 'auto'/, 'the task list must absorb the leftover window height');
assert.equal((source.match(/overflow: 'auto'/g) ?? []).length, 0, 'the window frame and its wrapper must not scroll; only the task list does');
assert.equal(visit(overlay, (node) => node.type === 'section').props.style.overflow, 'hidden', 'the window frame itself must clip, not scroll');
assert.match(source, /'data-todo-ledger-chip': status,[\s\S]{0,400}?onClick: \(\) => jumpToSection\(status\)/, 'the status badge must be a clickable jump control');
assert.match(source, /jumpToSection = \(status\) =>/, 'no jump handler exists for the status badges');
assert.match(source, /scrollTop \+= header\.getBoundingClientRect\(\)\.top - scroller\.getBoundingClientRect\(\)\.top/, 'the jump must align the section header with the top of the list without scrolling the page');
assert.match(source, /requestAnimationFrame\(scroll\)/, 'the jump must wait for a collapsed section to re-expand before measuring');
assert.match(source, /'data-todo-ledger-section-header': status,[\s\S]{0,500}?aria-expanded/, 'each section header needs an expanded state for screen readers');
assert.match(source, /'data-todo-ledger-section-header': status,[\s\S]{0,600}?onClick: \(\) => onToggle\(status\)/, 'section headers are not collapsible');
assert.match(source, /collapsed === true\s*\?\s*null\s*:\s*h\(\s*'ul'/, 'a collapsed section must drop its task list');
const handle = visit(overlay, (node) => node.props?.role === 'button');
assert.ok(handle?.props.onPointerDown && handle.props.onKeyDown, 'drag handle is not mouse and keyboard operable');
handle.props.onPointerDown({ button: 0, pointerId: 7, clientX: 100, clientY: 100, preventDefault() {} });
for (const listener of browserEvents.get('pointermove') ?? []) listener({ pointerId: 7, clientX: 4000, clientY: -4000 });
for (const listener of browserEvents.get('pointerup') ?? []) listener({ pointerId: 7 });
const layoutKey = 'dsh-todo-ledger:floating-layout';
const dragged = JSON.parse(saved.get(layoutKey));
assert.equal(dragged.x, 908, 'dragged x coordinate was not clamped to the viewport');
assert.equal(dragged.y, 12, 'dragged y coordinate was not clamped to the viewport');
assert.deepEqual(Object.keys(dragged).sort(), ['height', 'width', 'x', 'y'], 'storage must persist the whole window box');
assert.equal(dragged.width, 360, 'dragging must not change the window width');
overlay = overlayEntry.component();
assert.equal(visit(overlay, (node) => node.type === 'section').props.style.left, 908, 'stored position was not restored');
const resizeHandle = visit(overlay, (node) => node.props?.['data-todo-ledger-resize'] === '');
assert.ok(resizeHandle, 'floating window has no resize grip');
assert.equal(resizeHandle.props.style.cursor, 'nwse-resize', 'resize grip must show the corner resize cursor');
assert.ok(resizeHandle.props['aria-label'], 'resize grip has no accessible name');
resizeHandle.props.onPointerDown({ button: 0, pointerId: 9, clientX: 0, clientY: 0, preventDefault() {} });
for (const listener of browserEvents.get('pointermove') ?? []) listener({ pointerId: 9, clientX: 400, clientY: 120 });
for (const listener of browserEvents.get('pointerup') ?? []) listener({ pointerId: 9 });
const resized = JSON.parse(saved.get(layoutKey));
assert.equal(resized.width, 760, 'resize grip did not grow the window width');
assert.equal(resized.height, 540, 'resize grip did not grow the window height');
assert.equal(resized.x, 508, 'growing past the right edge must pull the window back inside the viewport');
overlay = overlayEntry.component();
const resizedSection = visit(overlay, (node) => node.type === 'section').props.style;
assert.equal(resizedSection.width, 760, 'stored width was not restored');
assert.equal(resizedSection.height, 540, 'stored height was not restored');
assert.equal(resizedSection.left, 508, 'resized position was not restored');
const staleClose = visit(overlay, (node) => node.props?.title === 'Close')?.props.onClick;
assert.ok(staleClose, 'floating panel close control is missing');
const fetchedBeforeLauncher = fetchCalls;
const otherLauncher = composerEntry.component({ sessionId: 'session-other' });
visit(otherLauncher, (node) => node.props?.['data-todo-ledger-launcher'] === '').props.onClick();
staleClose();
assert.equal(visit(overlayEntry.component(), (node) => node.type?.name === 'Panel').props.sessionId, 'session-other', 'stale close dismissed the newly targeted session');
assert.equal(fetchCalls, fetchedBeforeLauncher, 'launcher should not make a request until the panel renders');

console.log('✓ floating panel Client slot, locale and interaction contract passed');
