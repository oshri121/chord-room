// Cloudflare Pages middleware. It runs ONLY for the paths listed in /_routes.json (the API and the repo files
// below), so ordinary page and asset requests never invoke a Function.
//  1. The site is deployed from the repo root, so owner docs and sources would be public files. They are not
//     secret (no keys live in the repo), but they are not part of the site either: answer 404.
//  2. _headers does not apply to Function responses, so the API gets its security headers here.
const HIDDEN = /^\/(?:supabase|tools|functions|\.git)(?:\/|$)|^\/[^\/]*\.md$|^\/\.gitignore$/i;

const API_HEADERS = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains'
};

export async function onRequest({ request, next }) {
  const path = new URL(request.url).pathname;
  if (HIDDEN.test(path)) {
    return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...API_HEADERS } });
  }
  let res;
  try { res = await next(); }
  catch (e) { return new Response('Server error', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...API_HEADERS } }); }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(API_HEADERS)) out.headers.set(k, v);
  return out;
}
