// Cloudflare Pages middleware. It runs ONLY for the paths listed in /_routes.json (the API and the repo files
// below), so ordinary page and asset requests never invoke a Function.
//  1. The site is deployed from the repo root, so owner docs and sources would be public files. They are not
//     secret (no keys live in the repo), but they are not part of the site either: answer 404.
//     The test runs on a NORMALISED path (percent-decoding repeated, backslashes, duplicate slashes and ./.. segments
//     resolved, case-insensitive), so /supabase%2Fschema.sql, //supabase/x, /Tools/x or /assets/..%2fCLAUDE.md
//     can't reach a file the static server would decode to the same name. Undecodable paths are refused too.
//  2. _headers does not apply to Function responses, so the API gets its security headers here.
//  3. growth: the public page paths (/pricing, /terms, /privacy, /accessibility, /licenses, /tool, /about — _redirects
//     rewrites them to index.html) get their own <title>, description, canonical and Open Graph tags, so link previews
//     (WhatsApp, Facebook, X: they don't run JS) and search engines see the right page. The page keeps the static headers
//     from _headers; if a response ever arrives without them, PAGE_HEADERS (a copy of the `/*` block, checked by
//     tools/tests/node/growth.test.mjs) is applied instead.
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

/* ---------- growth: per-page meta for the public paths (Hebrew first, like index.html) ---------- */
export const PAGE_META = {
  '/pricing': ['מחירים ונקודות · Chord Room', 'מה חינם ומה עולה נקודות, המסלולים החודשיים וההנחות — הכול במקום אחד.'],
  '/terms': ['תנאי שימוש · Chord Room', 'תנאי השימוש של Chord Room: חשבון, נקודות ומנויים, התוכן שלכם ושימוש מותר.'],
  '/privacy': ['מדיניות פרטיות · Chord Room', 'איזה מידע Chord Room אוסף, למה, איפה הוא נשמר, עוגיות וסטטיסטיקה בהסכמה, והזכויות שלכם.'],
  '/accessibility': ['הצהרת נגישות · Chord Room', 'הצהרת הנגישות של Chord Room לפי ת"י 5568: התאמות, חלופות, מגבלות ידועות ופנייה לרכז/ת הנגישות.'],
  '/licenses': ['רישיונות וקרדיטים · Chord Room', 'הגופנים, הספריות, המודלים ומקורות הנתונים של צד שלישי ב־Chord Room, והרישיון של כל אחד.'],
  '/tool': ['הכלי · Chord Room', 'מעלים שיר ומקבלים BPM, סולם, אקורדים וצורת גל RGB, משנים קצב וסולם ומפרידים ערוצים ב־AI — בדפדפן.'],
  '/about': null   // = the home page: index.html as it is, canonical '/'
};
export const PAGE_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob: https://api.deezer.com https://challenges.cloudflare.com https://www.googletagmanager.com https://*.clarity.ms; style-src 'self' 'unsafe-inline'; style-src-elem 'self'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https://ydyocusfrghsokjsectw.supabase.co https://*.dzcdn.net https://*.google-analytics.com https://www.googletagmanager.com https://*.clarity.ms https://c.bing.com; media-src 'self' blob: data: https://*.dzcdn.net https://ydyocusfrghsokjsectw.supabase.co; connect-src 'self' blob: data: https://ydyocusfrghsokjsectw.supabase.co wss://ydyocusfrghsokjsectw.supabase.co https://*.dzcdn.net https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.clarity.ms https://c.bing.com; worker-src 'self' blob:; child-src 'self' blob: https://widget.deezer.com https://www.deezer.com https://challenges.cloudflare.com; frame-src https://widget.deezer.com https://www.deezer.com https://challenges.cloudflare.com; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'permissions-policy': 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), hid=(), midi=(), display-capture=(), magnetometer=(), gyroscope=(), accelerometer=(), browsing-topics=()',
  'x-permitted-cross-domain-policies': 'none'
};
export const pagePath = raw => { const p = String(raw || '').toLowerCase().replace(/\/+$/, ''); return Object.prototype.hasOwnProperty.call(PAGE_META, p) ? p : null; };
const attr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// rewrite the <head> of index.html for one page path (string replace: the tags are written one per line in index.html)
export function pageHead(html, p) {
  const m = PAGE_META[p], co = (/<link rel="canonical" href="(https:\/\/[^/"]+)\/?"/.exec(html) || [, 'https://chord-room.pages.dev'])[1];
  const url = co + (m ? p : '/');
  const set = (re, v) => { html = html.replace(re, (all, a, b) => a + v + b); };
  set(/(<link rel="canonical" href=")[^"]*(")/, url);
  set(/(<meta property="og:url" content=")[^"]*(")/, url);
  if (!m) return html;
  const [title, desc] = m.map(attr);
  set(/(<title>)[^<]*(<\/title>)/, title);
  set(/(<meta name="description" content=")[^"]*(")/, desc);
  set(/(<meta property="og:title" content=")[^"]*(")/, title);
  set(/(<meta property="og:description" content=")[^"]*(")/, desc);
  set(/(<meta name="twitter:title" content=")[^"]*(")/, title);
  set(/(<meta name="twitter:description" content=")[^"]*(")/, desc);
  return html;
}
async function pageResponse(res, p) {
  if (!res || res.status !== 200 || !/text\/html/i.test(res.headers.get('content-type') || '')) return res;
  const html = pageHead(await res.text(), p);
  const headers = new Headers(res.headers);
  headers.delete('content-length'); headers.delete('etag');
  if (!headers.has('content-security-policy')) for (const [k, v] of Object.entries(PAGE_HEADERS)) headers.set(k, v);
  return new Response(html, { status: 200, headers });
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
  const pp = pagePath(path);
  if (pp) { try { return await pageResponse(res, pp); } catch (e) { return res; } }   /* growth: page paths keep the page headers */
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(API_HEADERS)) out.headers.set(k, v);
  return out;
}
