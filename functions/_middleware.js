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

export async function onRequest({ request, next }) {
  const path = new URL(request.url).pathname;
  if (isHidden(path)) return notFound();
  let res;
  try { res = await next(); }
  catch (e) { return new Response('Server error', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...API_HEADERS } }); }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(API_HEADERS)) out.headers.set(k, v);
  return out;
}
