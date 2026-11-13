const API = window.API || {};

API.tokens = {
  get() { return localStorage.getItem('le_token'); },
  set(t) { localStorage.setItem('le_token', t); },
  clear() { localStorage.removeItem('le_token'); },
};

API.usuario = () => {
  try {
    const u = localStorage.getItem('le_user');
    return u ? JSON.parse(u) : null;
  } catch (_e) { return null; }
};

API.guardarSesion = (user, token) => {
  localStorage.setItem('le_user', JSON.stringify(user));
  API.tokens.set(token);
};

API.cerrarSesion = () => { API.tokens.clear(); localStorage.removeItem('le_user'); };

async function pedir(method, path, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = API.tokens.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload = null;
  let isForm = false;

  if (body instanceof FormData) {
    isForm = true;
    payload = body;
  } else if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(path, { method, headers, body: payload });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : {}; } catch (_e) { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error((data && data.message) || `Error HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

API.get = (path, opts) => pedir('GET', path, undefined, opts);
API.post = (path, body, opts) => pedir('POST', path, body, opts);
API.put = (path, body, opts) => pedir('PUT', path, body, opts);
API.del = (path, opts) => pedir('DELETE', path, undefined, opts);

API.toast = (mensaje, tipo = 'info') => {
  const t = document.createElement('div');
  t.className = `toast ${tipo === 'ok' ? 'ok' : (tipo === 'err' ? 'err' : '')}`;
  t.textContent = mensaje;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
};

API.esc = (s) => {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
};

API.fecha = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

API.numero = (n) => (Number(n) ?? 0).toLocaleString('es-ES');

API.precio = (n) => `$${Number(n).toFixed(2)}`;

API.media = (filepath) => {
  if (!filepath) return null;
  let p = String(filepath).replace(/\\/g, '/');
  const m = p.match(/(?:^|.*?\/)uploads\/(.*)$/i);
  if (m) p = m[1];
  return '/media/' + p.replace(/^[A-Za-z]:\//, '').replace(/^\/+/, '');
};

API.thumb = (filepath) => {
  const med = API.media(filepath);
  if (!med) return null;
  const base = med.split('/').pop().replace(/\.[^.]+$/, '');
  return base ? `/media/thumbs/${base}.jpg` : null;
};

API.PH = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270">' +
  '<rect width="100%" height="100%" fill="#1c1c28"/>' +
  '<text x="50%" y="50%" fill="#a09fb0" font-family="sans-serif" font-size="22" text-anchor="middle" dominant-baseline="middle">LUTA · DANÇA</text>' +
  '</svg>'
);

API.http = pedir;
window.API = API;