// Cloudflare Pages Functions, run in Node with a stubbed fetch:
//  * functions/api/deezer/[[path]].js  — read-only proxy: allow-list, parameter validation, methods
//  * functions/api/pay/webhook.js      — Lemon Squeezy webhook forwarder: method, signature shape, body limits, UTF-8
//  * functions/_middleware.js          — hides repo files (supabase/, tools/, *.md …) and adds the API headers
import { REPO } from './repo.mjs';
const dz = await import(REPO + '/functions/api/deezer/[[path]].js');
const wh = await import(REPO + '/functions/api/pay/webhook.js');
const mw = await import(REPO + '/functions/_middleware.js');

let ok = 0; const bad = [];
const check = (label, cond, info = '') => { if (cond) ok++; else bad.push(label); console.log(cond ? '  ok  ' : '  FAIL', label.padEnd(60), String(info).slice(0, 120)); };

const calls = [];
globalThis.fetch = async (u, o) => { calls.push(String(u)); if (String(u).includes('rest/v1')) return new Response(JSON.stringify('ok'), { status: 200 }); return new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } }); };

console.log('== deezer proxy');
const D = async (path, qs = '', m = 'GET') => { calls.length = 0; const r = await dz.onRequest({ params: { path: path.split('/') }, request: new Request('https://x.dev/api/deezer/' + path + qs, { method: m }) }); return [r.status, calls[0] || '-']; };
for (const [p, q, m, st, up] of [
  ['chart/0/tracks', '?limit=50', 'GET', 200, 'https://api.deezer.com/chart/0/tracks?limit=50'],
  ['track/123', '', 'GET', 200, 'https://api.deezer.com/track/123'],
  ['track/123', '?limit=5&x=1&q=a', 'GET', 200, 'https://api.deezer.com/track/123?limit=5&q=a'],
  ['search/artist', '?q=%D7%A2&limit=5', 'GET', 200, 'https://api.deezer.com/search/artist?limit=5&q=%D7%A2'],
  ['search', '', 'GET', 400, '-'],
  ['user/1/flow', '', 'GET', 404, '-'],
  ['track/1/../../user', '', 'GET', 404, '-'],
  ['chart/0/tracks', '?limit=abc', 'GET', 400, '-'],
  ['chart/0/tracks', '?limit=9999', 'GET', 200, 'https://api.deezer.com/chart/0/tracks?limit=100'],
  ['chart/0/tracks', '?limit=99999', 'GET', 400, '-'],
  ['track/1', '', 'POST', 405, '-'],
  ['track/1', '', 'HEAD', 200, 'https://api.deezer.com/track/1']]) {
  const [s, u] = await D(p, q, m);
  check(`${m} ${p}${q} → ${st}`, s === st && u === up, `${s} ${u}`);
}

console.log('== pay webhook');
const W = async init => { const r = await wh.onRequest({ request: new Request('https://x.dev/api/pay/webhook', init), env: {} }); return r.status + ' ' + (await r.text()); };
const sig = 'a'.repeat(64);
check('GET → 405', (await W({ method: 'GET' })).startsWith('405'));
check('no signature → 401', (await W({ method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).startsWith('401'));
check('signed JSON → 200 ok (forwarded to pay_webhook RPC)', (await W({ method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json', 'x-signature': sig } })) === '200 ok' && calls.some(u => u.endsWith('/rest/v1/rpc/pay_webhook')));
check('text/plain → 400', (await W({ method: 'POST', body: '{}', headers: { 'content-type': 'text/plain', 'x-signature': sig } })).startsWith('400'));
const big = new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new Uint8Array(10000)); c.close(); } });
check('400 KB stream without content-length → 413', (await W({ method: 'POST', body: big, duplex: 'half', headers: { 'content-type': 'application/json', 'x-signature': sig } })).startsWith('413'));
check('content-length 300000 → 413', (await W({ method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-signature': sig, 'content-length': '300000' } })).startsWith('413'));
check('invalid UTF-8 → 400', (await W({ method: 'POST', body: new Uint8Array([0xff, 0xfe]), headers: { 'content-type': 'application/json', 'x-signature': sig } })).startsWith('400'));

console.log('== middleware (hidden repo files + API headers)');
const M = async p => { const r = await mw.onRequest({ request: new Request('https://x.dev' + p), next: async () => new Response('fn', { status: 200, headers: { 'content-type': 'application/json' } }) }); return r; };
for (const p of ['/supabase/schema.sql', '/tools/README.md', '/tools/tests/lib.py', '/tools/tests/fixtures/p0.mp3', '/CLAUDE.md', '/PAYMENTS.md', '/README.md', '/EMAIL.md', '/ASSISTANT.md', '/.gitignore', '/functions/api/pay/webhook.js', '/.git/config', '/Tools/x']) {
  const r = await M(p); check(`${p} → 404`, r.status === 404 && r.headers.get('x-content-type-options') === 'nosniff');
}
const api = await M('/api/deezer/track/1');
check('/api/* passes through with API headers', api.status === 200 && api.headers.get('content-security-policy') === "default-src 'none'; frame-ancestors 'none'" && api.headers.get('x-frame-options') === 'DENY');
const routes = JSON.parse(await import('node:fs').then(fs => fs.readFileSync(REPO + '/_routes.json', 'utf8')));
check('_routes.json routes /tools/* + /supabase/* through the middleware', ['/tools/*', '/supabase/*', '/functions/*', '/api/*'].every(x => routes.include.includes(x)), routes.include.join(' '));

console.log(`\n${ok} ok, ${bad.length} failed`, bad);
process.exit(bad.length ? 1 : 0);
