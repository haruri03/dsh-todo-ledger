import { readProjection } from './projection.js';

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
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const cwd = list[index]?.header?.cwd;
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
