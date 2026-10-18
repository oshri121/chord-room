// Cloudflare Pages Function: a small read-only proxy to Deezer's public API.
// The browser cannot call api.deezer.com directly (no CORS), so the Discover page goes through here.
// Only a few read endpoints are allowed, and good responses are cached at the edge for 15 minutes (Deezer error bodies never).
// Security: GET/HEAD only, the path is rebuilt from an anchored allow-list (numeric ids only), only the
// limit/index/q parameters are forwarded (validated), no client headers or cookies are forwarded, the host is
// fixed (no SSRF), and upstream errors never reach the client in detail. No CORS headers: same-origin use only.
const ALLOW = /^(chart\/\d{1,15}\/tracks|editorial\/\d{1,15}\/releases|album\/\d{1,15}(\/tracks)?|playlist\/\d{1,15}\/tracks|track\/\d{1,15}|search(?:\/artist)?)$/;

const json = (body, status, extra) => new Response(body, {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', ...(extra || {}) }
});

export async function onRequest(ctx) {
  const { params, request } = ctx;
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
  const up = `https://api.deezer.com/${path}${q.toString() ? '?' + q : ''}`;
  // edge cache via the Cache API (not cf.cacheEverything): only bodies that passed the error check below are stored
  // (search answers are not stored at the edge: random q values would only fill the cache)
  const isSearch = /^search/.test(path), cc = isSearch ? 'private, max-age=300' : 'public, max-age=900';
  const cache = !isSearch && typeof caches !== 'undefined' && caches.default ? caches.default : null, ckey = new Request(up, { method: 'GET' });
  if (cache) { try { const hit = await cache.match(ckey); if (hit) return json(request.method === 'HEAD' ? null : hit.body, 200, { 'cache-control': 'public, max-age=900', 'x-upstream': 'cache' }); } catch (e) {} }
  let upstream;
  try {
    upstream = await fetch(up, {
      headers: { accept: 'application/json', 'accept-language': 'en', 'user-agent': 'Mozilla/5.0 (compatible; ChordRoom/1.0; +https://chord-room.com)' },
      redirect: 'follow'
    });
  } catch (e) {
    return json('{"error":"upstream"}', 502, { 'cache-control': 'no-store', 'x-upstream': 'fetch-failed' });
  }
  // only Deezer's own API host may answer (a redirect elsewhere is refused); the status is exposed for diagnosis only
  if (new URL(upstream.url || 'https://api.deezer.com/').hostname !== 'api.deezer.com') return json('{"error":"upstream"}', 502, { 'cache-control': 'no-store', 'x-upstream': 'redirected' });
  if (!upstream.ok) return json('{"error":"upstream"}', upstream.status === 404 ? 404 : 502, { 'cache-control': 'no-store', 'x-upstream': String(upstream.status) });
  // Deezer sends some errors (e.g. "Quota limit exceeded", code 4) with HTTP 200: never pass them on or cache them
  let txt;
  try { txt = await upstream.text(); } catch (e) { return json('{"error":"upstream"}', 502, { 'cache-control': 'no-store', 'x-upstream': 'read-failed' }); }
  let d = null; try { d = JSON.parse(txt); } catch (e) {}
  if (!d || typeof d !== 'object' || d.error) return json('{"error":"upstream"}', 502, { 'cache-control': 'no-store', 'x-upstream': d && d.error ? 'deezer-error' : 'bad-json' });
  if (cache) { try { const put = cache.put(ckey, json(txt, 200, { 'cache-control': 'public, max-age=900' })); if (ctx.waitUntil) ctx.waitUntil(put.catch(() => {})); else put.catch(() => {}); } catch (e) {} }
  return json(request.method === 'HEAD' ? null : txt, 200, { 'cache-control': cc });
}
