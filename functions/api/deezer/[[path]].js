// Cloudflare Pages Function: a small read-only proxy to Deezer's public API.
// The browser cannot call api.deezer.com directly (no CORS), so the Discover page goes through here.
// Only a few read endpoints are allowed, and responses are cached at the edge for 15 minutes.
// Security: GET/HEAD only, the path is rebuilt from an anchored allow-list (numeric ids only), only the
// limit/index/q parameters are forwarded (validated), no client headers or cookies are forwarded, the host is
// fixed (no SSRF), and upstream errors never reach the client in detail. No CORS headers: same-origin use only.
const ALLOW = /^(chart\/\d{1,15}\/tracks|editorial\/\d{1,15}\/releases|album\/\d{1,15}(\/tracks)?|playlist\/\d{1,15}\/tracks|track\/\d{1,15}|search(?:\/artist)?)$/;

const json = (body, status, extra) => new Response(body, {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...(extra || {}) }
});

export async function onRequest({ params, request }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json('{"error":"method"}', 405, { allow: 'GET, HEAD' });
  const path = [].concat(params.path || []).join('/');
  if (path.length > 80 || !ALLOW.test(path)) return json('{"error":"not found"}', 404);
  const src = new URL(request.url);
  const q = new URLSearchParams();
  for (const k of ['limit', 'index']) {
    const v = src.searchParams.get(k);
    if (v != null) { if (!/^\d{1,4}$/.test(v)) return json('{"error":"bad parameter"}', 400); q.set(k, String(Math.min(+v, k === 'limit' ? 100 : 2000))); }
  }
  if (src.searchParams.has('q')) q.set('q', src.searchParams.get('q').slice(0, 200));
  if (/^search/.test(path) && !q.get('q')) return json('{"error":"missing q"}', 400);
  let upstream;
  try {
    upstream = await fetch(`https://api.deezer.com/${path}${q.toString() ? '?' + q : ''}`, {
      headers: { accept: 'application/json' }, redirect: 'error', cf: { cacheTtl: 900, cacheEverything: true }
    });
  } catch (e) {
    return json('{"error":"upstream"}', 502, { 'cache-control': 'no-store' });
  }
  if (!upstream.ok) return json('{"error":"upstream"}', upstream.status === 404 ? 404 : 502, { 'cache-control': 'no-store' });
  return json(request.method === 'HEAD' ? null : upstream.body, 200, { 'cache-control': 'public, max-age=900' });
}
