import { readProjection } from './projection.js';

function sessionCwd(sessions, sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
  try {
    for (const session of sessions?.list?.() ?? []) {
      if (String(session?.id ?? session?.sessionId ?? '') !== sessionId) continue;
      const cwd = session?.header?.cwd;
      if (typeof cwd === 'string' && cwd.length > 0) return cwd;
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
