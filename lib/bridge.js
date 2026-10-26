import { readProjection } from './projection.js';
import { cmdComplete, findRoot, layout, readTask } from './store.js';

function sessionCwd(sessions, sessionId) {
  try {
    const list = sessions?.list?.() ?? [];
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      for (const session of list) {
        if (String(session?.id ?? session?.sessionId ?? '') !== sessionId) continue;
        const cwd = session?.header?.cwd;
        if (typeof cwd === 'string' && cwd.length > 0) return cwd;
      }
      return undefined;
    }

  } catch {
    return undefined;
  }
  return undefined;
}

export function projectionBody(sessions, search) {
  try {
    const params = new URLSearchParams(search ?? '');
    const explicit = params.get('cwd');
    const cwd = explicit && explicit.length > 0 ? explicit : sessionCwd(sessions, params.get('sessionId'));
    if (!cwd) return { kind: 'unbound' };
    return readProjection(cwd);
  } catch (error) {
    return { kind: 'error', message: String(error?.message ?? error) };
  }
}

export function completeBody(sessions, payload) {
  try {
    const slug = String(payload?.slug ?? '').trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return { ok: false, kind: 'invalid', message: 'invalid task slug' };
    const explicit = typeof payload?.cwd === 'string' && payload.cwd.length > 0 ? payload.cwd : undefined;
    const cwd = explicit ?? sessionCwd(sessions, payload?.sessionId);
    if (!cwd) return { ok: false, kind: 'unbound' };
    const root = findRoot(cwd);
    if (!root) return { ok: false, kind: 'absent', message: 'no ledger in this directory' };
    const L = layout(root);
    const task = readTask(L, slug);
    if (!task) return { ok: false, kind: 'missing', message: `no such task: ${slug}` };
    if (task.meta.status !== 'review') {
      return { ok: false, kind: 'not-review', message: `only a task awaiting review can be accepted (current: ${task.meta.status})` };
    }
    const stamp = new Date().toISOString();
    const signoff = typeof payload?.signoff === 'string' && payload.signoff.trim().length > 0
      ? payload.signoff.trim()
      : `accepted from the ledger panel at ${stamp}`;
    const evidence = typeof payload?.evidence === 'string' && payload.evidence.trim().length > 0
      ? payload.evidence.trim()
      : `owner accepted the task from the ledger panel at ${stamp}`;
    const files = Array.isArray(task.meta.files) ? task.meta.files.filter((file) => typeof file === 'string') : [];
    const result = cmdComplete(L, { slug, evidence, signoff, files });
    return { ok: true, kind: 'completed', slug, result };
  } catch (error) {
    return { ok: false, kind: 'error', message: String(error?.message ?? error) };
  }
}

function readJsonBody(req, done) {
  const chunks = [];
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    try {
      const text = Buffer.concat(chunks).toString('utf8');
      done(text.length > 0 ? JSON.parse(text) : {});
    } catch (error) {
      done(undefined, error);
    }
  };
  try {
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', finish);
    req.on('error', (error) => done(undefined, error));
  } catch (error) {
    done(undefined, error);
  }
}

export function createCompleteHandler({ sessions } = {}) {
  return (req, res) => {
    const answer = (status, body) => {
      try {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
      } catch {}
    };
    const reply = (payload, error) => {
      if (error) {
        answer(400, { ok: false, kind: 'invalid', message: String(error?.message ?? error) });
        return;
      }
      let query = {};
      try {
        const raw = typeof req?.url === 'string' ? req.url : '/';
        query = Object.fromEntries(new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''));
      } catch {}
      const merged = { ...query, ...(payload ?? {}) };
      const body = completeBody(sessions, merged);
      answer(body.ok === true ? 200 : body.kind === 'error' ? 500 : 400, body);
    };
    try {
      readJsonBody(req, reply);
    } catch (error) {
      reply(undefined, error);
    }
  };
}

export function createProjectionHandler({ sessions } = {}) {
  return (req, res) => {
    let body;
    try {
      const raw = typeof req?.url === 'string' ? req.url : '/';
      const search = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
      body = projectionBody(sessions, search);
    } catch (error) {
      body = { kind: 'error', message: String(error?.message ?? error) };
    }
    try {
      res.writeHead(body.kind === 'error' ? 500 : 200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    } catch {
      return;
    }
  };
}
