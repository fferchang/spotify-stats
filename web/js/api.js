// Cliente de la API local. Cancela peticiones viejas cuando cambiás de vista.

const inflight = new Map();

async function request(path, { method = 'GET', body, signal, group } = {}) {
  if (group) {
    inflight.get(group)?.abort();
  }
  let ctl = null;
  if (!signal && group) {
    ctl = new AbortController();
    inflight.set(group, ctl);
    signal = ctl.signal;
  }

  const opts = { method, signal, headers: {} };
  if (body !== undefined) {
    if (body instanceof ArrayBuffer || body instanceof Blob) {
      opts.body = body;
      opts.headers['Content-Type'] = 'application/octet-stream';
    } else {
      opts.body = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
    }
  }

  let res;
  try {
    res = await fetch(path, opts);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('No pude hablar con el servidor local. ¿Sigue corriendo run.py?');
  } finally {
    if (ctl && inflight.get(group) === ctl) inflight.delete(group);
  }

  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo JSON */ }

  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

const qs = (params) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
};

export const api = {
  bootstrap: () => request('/api/bootstrap'),

  overview: (p) => request(`/api/overview${qs(p)}`, { group: 'view' }),
  top: (p) => request(`/api/top${qs(p)}`, { group: 'view' }),
  timeline: (p) => request(`/api/timeline${qs(p)}`, { group: 'tl' }),
  patterns: (p) => request(`/api/patterns${qs(p)}`, { group: 'view' }),
  calendar: (p) => request(`/api/calendar${qs(p)}`, { group: 'cal' }),
  records: (p) => request(`/api/records${qs(p)}`, { group: 'rec' }),
  discoveries: (p) => request(`/api/discoveries${qs(p)}`, { group: 'disc' }),
  genres: (p) => request(`/api/genres${qs(p)}`, { group: 'view' }),
  detail: (p) => request(`/api/detail${qs(p)}`, { group: 'detail' }),
  history: (p) => request(`/api/history${qs(p)}`, { group: 'view' }),
  years: () => request('/api/years', { group: 'view' }),

  meta: (kind, keys) => request('/api/meta', { method: 'POST', body: { kind, keys } }),

  config: () => request('/api/config'),
  saveConfig: (patch) => request('/api/config', { method: 'POST', body: patch }),

  importPath: (path) => request('/api/import/path', { method: 'POST', body: { path } }),
  importUpload: (name, buf, final) =>
    request(`/api/import/upload${qs({ name, final: final ? 1 : '' })}`, { method: 'POST', body: buf }),
  importFinish: () => request('/api/import/finish', { method: 'POST', body: {} }),
  reset: () => request('/api/reset', { method: 'POST', body: { confirm: 'BORRAR' } }),

  spotifyTest: () => request('/api/spotify/test', { method: 'POST', body: {} }),
  spotifyLogout: () => request('/api/spotify/logout', { method: 'POST', body: {} }),

  enrichStatus: () => request('/api/enrich/status'),
  enrichStart: (full = true) => request('/api/enrich/start', { method: 'POST', body: { full } }),
  enrichStop: () => request('/api/enrich/stop', { method: 'POST', body: {} }),
};
