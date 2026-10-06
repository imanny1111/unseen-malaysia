// Public visitor counter backed by D1.
// GET  /api/visitors -> { count }
// POST /api/visitors -> increments once and returns { count }
// The browser only POSTs on its first visit (see public/js/app.js).

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequestGet({ env }) {
  const row = await env.DB.prepare('SELECT value FROM counters WHERE name = ?').bind('visitors').first();
  return json({ count: row ? row.value : 0 });
}

export async function onRequestPost({ request, env }) {
  // Only accept requests coming from our own pages.
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: 'forbidden' }, 403);

  const row = await env.DB.prepare(
    `INSERT INTO counters (name, value) VALUES ('visitors', 1)
     ON CONFLICT(name) DO UPDATE SET value = value + 1
     RETURNING value`
  ).first();
  return json({ count: row.value });
}
