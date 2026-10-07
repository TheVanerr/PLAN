// Küçük, çok projeli JSON deposu.
//   GET    /v1/:project/:collection        -> { items: [{ id, data, updated }] }
//   PUT    /v1/:project/:collection/:id    -> gövde JSON nesnesi, kaydeder/günceller
//   DELETE /v1/:project/:collection/:id
//   GET    /health                          -> kimlik doğrulamasız durum kontrolü
// Tüm /v1 istekleri "Authorization: Bearer <API_TOKEN>" ister.

const NAME = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 256 * 1024;

function cors(env, req) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : allowed[0],
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

function sameToken(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(req, env) {
    const h = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'health') return json({ ok: true }, 200, h);
    if (parts[0] !== 'v1' || parts.length < 3 || parts.length > 4) return json({ error: 'not_found' }, 404, h);

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!sameToken(token, env.API_TOKEN)) return json({ error: 'unauthorized' }, 401, h);

    const [, project, collection, id] = parts;
    if (![project, collection, id ?? 'x'].every(s => NAME.test(s))) return json({ error: 'bad_name' }, 400, h);

    try {
      if (!id && req.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, data, updated FROM docs WHERE project = ?1 AND collection = ?2 ORDER BY id'
        ).bind(project, collection).all();
        return json({ items: results.map(r => ({ id: r.id, data: JSON.parse(r.data), updated: r.updated })) }, 200, h);
      }
      if (id && req.method === 'PUT') {
        const text = await req.text();
        if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413, h);
        let data;
        try { data = JSON.parse(text); } catch { return json({ error: 'bad_json' }, 400, h); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'bad_json' }, 400, h);
        const updated = Date.now();
        await env.DB.prepare(
          `INSERT INTO docs (project, collection, id, data, updated) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(project, collection, id) DO UPDATE SET data = excluded.data, updated = excluded.updated`
        ).bind(project, collection, id, JSON.stringify(data), updated).run();
        return json({ ok: true, updated }, 200, h);
      }
      if (id && req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM docs WHERE project = ?1 AND collection = ?2 AND id = ?3').bind(project, collection, id).run();
        return json({ ok: true }, 200, h);
      }
      return json({ error: 'method_not_allowed' }, 405, h);
    } catch (e) {
      return json({ error: 'server_error' }, 500, h);
    }
  },
};
