// Cloudflare Pages Function: a small read-only proxy to Deezer's public API.
// The browser cannot call api.deezer.com directly (no CORS), so the Discover page goes through here.
// Only a few read endpoints are allowed, and responses are cached at the edge for 15 minutes.
const ALLOW = /^(chart\/\d+\/tracks|editorial\/\d+\/releases|album\/\d+(\/tracks)?|playlist\/\d+\/tracks|track\/\d+|search(?:\/artist)?)$/;

export async function onRequestGet({ params, request }) {
  const path = [].concat(params.path || []).join('/');
  if (!ALLOW.test(path)) return new Response('Not found', { status: 404 });
  const src = new URL(request.url);
  const q = new URLSearchParams();
  for (const k of ['limit', 'index', 'q']) if (src.searchParams.has(k)) q.set(k, src.searchParams.get(k).slice(0, 200));
  const upstream = await fetch(`https://api.deezer.com/${path}?${q}`, { cf: { cacheTtl: 900, cacheEverything: true } });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=900' }
  });
}
