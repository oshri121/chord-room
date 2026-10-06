// Cloudflare Pages middleware. It runs ONLY for the paths listed in /_routes.json (the API and the repo files
// below), so ordinary page and asset requests never invoke a Function.
//  1. The site is deployed from the repo root, so owner docs and sources would be public files. They are not
//     secret (no keys live in the repo), but they are not part of the site either: answer 404.
//     The test runs on a NORMALISED path (percent-decoding repeated, backslashes, duplicate slashes and ./.. segments
//     resolved, case-insensitive), so /supabase%2Fschema.sql, //supabase/x, /Tools/x or /assets/..%2fCLAUDE.md
//     can't reach a file the static server would decode to the same name. Undecodable paths are refused too.
//  2. _headers does not apply to Function responses, so the API gets its security headers here.
const HIDDEN = /^\/(?:supabase|tools|functions|\.git|\.claude)(?:\/|$)|^\/(?:[^\/]*\/)*[^\/]*\.md$|^\/\.git[a-z]*$|^\/_routes\.json$/i;

const API_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains'
};

// the path the static file server could end up serving (null = can't be decoded → refuse)
export function normPath(raw) {
  let p = String(raw || '/');
  for (let i = 0; i < 4 && /%[0-9a-f]{2}/i.test(p); i++) {
    try { p = decodeURIComponent(p); } catch (e) { return null; }
  }
  if (/[\u0000-\u001f\u007f]/.test(p)) return null;
  const out = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg.replace(/[.\s]+$/, ''));               // "CLAUDE.md." / "CLAUDE.md " → "CLAUDE.md"
  }
  return '/' + out.join('/');
}

export const isHidden = raw => { const p = normPath(raw); return p === null || HIDDEN.test(p) || HIDDEN.test(String(raw || '')); };

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...API_HEADERS } });

/* acct (accounts v4): per-client request limits for the API, best effort. Cloudflare Pages can't declare the Workers
   rate-limiting binding from the repo (no wrangler.toml for this project; adding one would move every binding/variable
   out of the dashboard), so this keeps a small counter per client IP and minute in the Cache API (per data centre, not
   atomic). The real wall is the WAF rate-limiting rule in SECURITY-AUDIT.md "v4". /api/pay/webhook is never limited
   (Lemon Squeezy retries; only its body size is capped). Over the limit → 429 + Retry-After (the browser backs off). */
export const LIMITS = [
  { re: /^\/api\/pay\/webhook\/?$/i, name: null, max: 0, win: 0 },            // exempt
  { re: /^\/api\/assistant(?:\/|$)/i, name: 'as', max: 20, win: 60 },
  { re: /^\/api\/deezer\//i, name: 'dz', max: 120, win: 60 },
  { re: /^\/api\//i, name: 'api', max: 60, win: 60 }
];
export const MAX_API_BODY = 300 * 1024;
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
const tooMany = (sec) => new Response('{"error":"rate"}', { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(Math.max(1, sec)), ...API_HEADERS } });
// → a 429 Response, or null (allowed / not limited / no cache available)
export async function rateLimit(request, path, waitUntil, now = Date.now()) {
  const rule = LIMITS.find(r => r.re.test(path));
  if (!rule || !rule.name) return null;
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!ip || !globalThis.caches || typeof caches.open !== 'function') return null;
  try {
    const cache = await caches.open('cr-ratelimit');
    const slot = Math.floor(now / 1000 / rule.win);
    const key = new Request(`${new URL(request.url).origin}/__rl/${rule.name}/${await sha(ip + '|' + rule.name)}/${slot}`);
    const hit = await cache.match(key);
    const n = hit ? (parseInt(await hit.text(), 10) || 0) : 0;
    if (n >= rule.max) return tooMany((slot + 1) * rule.win - Math.floor(now / 1000));
    const put = cache.put(key, new Response(String(n + 1), { headers: { 'cache-control': `max-age=${rule.win + 5}` } }));
    if (waitUntil) waitUntil(put); else await put;
  } catch (e) { /* the limiter never takes the API down */ }
  return null;
}

export async function onRequest(ctx) {
  const { request, next } = ctx;
  const path = new URL(request.url).pathname;
  if (isHidden(path)) return notFound();
  if (/^\/api\//i.test(path)) {                                                       /* acct */
    if (+(request.headers.get('content-length') || 0) > MAX_API_BODY) {
      return new Response('{"error":"too large"}', { status: 413, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...API_HEADERS } });
    }
    const limited = await rateLimit(request, path, typeof ctx.waitUntil === 'function' ? p => ctx.waitUntil(p) : null);
    if (limited) return limited;
  }
  let res;
  try { res = await next(); }
  catch (e) { return new Response('Server error', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...API_HEADERS } }); }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(API_HEADERS)) out.headers.set(k, v);
  return out;
}
