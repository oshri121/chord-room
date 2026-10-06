// Accounts v4 (SECURITY-AUDIT.md "v4"), the Functions / Pages-config side:
//  * functions/_middleware.js: per-client API limits kept in the Cache API (best effort; the WAF rule is the real wall):
//    /api/assistant 20/min, /api/deezer/* 120/min, other /api/* 60/min, /api/pay/webhook never limited; 429 + Retry-After;
//    the counter key holds a hash, never the raw IP; each client and each minute counts separately; a broken cache never
//    blocks the API; bodies over 300 KB → 413 before any Function runs
//  * _headers: Cloudflare Turnstile allowed in script-src + frame-src/child-src only (nothing else widened)
import { REPO } from './repo.mjs';
import fs from 'node:fs';
const mw = await import(REPO + '/functions/_middleware.js');

let ok = 0; const bad = [];
const check = (label, cond, info = '') => { if (cond) ok++; else bad.push(label); console.log(cond ? '  ok  ' : '  FAIL', label.padEnd(64), String(info).slice(0, 120)); };

// an in-memory stand-in for the Workers Cache API (caches.open → match/put)
const store = new Map(); let opens = 0, broken = false;
globalThis.caches = { async open(name) { opens++; if (broken) throw new Error('cache down');
  return { async match(req) { const v = store.get(name + ' ' + req.url); return v ? new Response(v) : undefined; },
           async put(req, res) { store.set(name + ' ' + req.url, await res.text()); } }; } };
let clock = Date.UTC(2026, 9, 6, 12, 0, 5);
const realNow = Date.now; Date.now = () => clock;

let fnCalls = 0;
const call = async (path, { ip = '203.0.113.7', method = 'GET', len, waitUntil } = {}) => {
  const headers = { 'cf-connecting-ip': ip }; if (len != null) headers['content-length'] = String(len);
  const ctx = { request: new Request('https://chord-room.pages.dev' + path, { method, headers }), next: async () => { fnCalls++; return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); } };
  if (waitUntil) ctx.waitUntil = waitUntil;
  return mw.onRequest(ctx);
};
const many = async (n, path, o) => { const st = []; for (let i = 0; i < n; i++) st.push((await call(path, o)).status); return st; };

console.log('== /api/assistant: 20 per minute per client');
let st = await many(20, '/api/assistant', { method: 'POST' });
check('first 20 requests pass', st.every(s => s === 200), st.join(','));
let r = await call('/api/assistant', { method: 'POST' });
check('21st → 429', r.status === 429, r.status);
check('Retry-After = seconds left in the minute', +r.headers.get('retry-after') === 55, r.headers.get('retry-after'));
check('429 carries the API security headers + no-store', r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('cache-control') === 'no-store');
check('429 body is JSON {"error":"rate"}', (await r.text()) === '{"error":"rate"}');
r = await call('/api/assistant', { method: 'POST', ip: '198.51.100.9' });
check('another client is not affected', r.status === 200, r.status);
clock += 60000;
r = await call('/api/assistant', { method: 'POST' });
check('next minute → allowed again', r.status === 200, r.status);

console.log('== /api/deezer: 120 per minute, other /api: 60');
st = await many(120, '/api/deezer/chart/0/tracks', { ip: '192.0.2.1' });
check('120 Deezer requests pass', st.every(s => s === 200));
check('121st → 429', (await call('/api/deezer/chart/0/tracks', { ip: '192.0.2.1' })).status === 429);
st = await many(60, '/api/other', { ip: '192.0.2.2' });
check('60 other API requests pass', st.every(s => s === 200));
check('61st → 429', (await call('/api/other', { ip: '192.0.2.2' })).status === 429);
check('Deezer and the rest count separately', (await call('/api/other', { ip: '192.0.2.1' })).status === 200);

console.log('== /api/pay/webhook: never limited, body capped');
fnCalls = 0;
st = await many(150, '/api/pay/webhook', { method: 'POST', ip: '192.0.2.50' });
check('150 webhook deliveries from one IP all reach the Function', st.every(s => s === 200) && fnCalls === 150, fnCalls);
r = await call('/api/pay/webhook', { method: 'POST', len: 400 * 1024 });
check('webhook body over 300 KB → 413 before the Function', r.status === 413);
r = await call('/api/assistant', { method: 'POST', len: 301 * 1024, ip: '192.0.2.60' });
check('any API body over 300 KB → 413', r.status === 413);

console.log('== privacy + robustness');
check('no raw IP in any counter key', [...store.keys()].every(k => !/203\.0\.113|198\.51\.100|192\.0\.2/.test(k)), [...store.keys()][0]);
check('keys are per limit + hashed client + minute', [...store.keys()].every(k => /^cr-ratelimit https:\/\/chord-room\.pages\.dev\/__rl\/(as|dz|api)\/[0-9a-f]{24}\/\d+$/.test(k)), [...store.keys()][0]);
let waited = 0;
r = await call('/api/x', { ip: '192.0.2.70', waitUntil: p => { waited++; return p; } });
check('the counter write goes through waitUntil when available', r.status === 200 && waited === 1, waited);
broken = true;
st = await many(80, '/api/assistant', { method: 'POST', ip: '192.0.2.80' });
check('cache unavailable → the API keeps answering (no limit)', st.every(s => s === 200));
broken = false;
r = await call('/api/assistant', { method: 'POST', ip: '' });
check('no client IP header → not limited (local / tests)', r.status === 200);
fnCalls = 0;
r = await call('/index.html', { ip: '192.0.2.90' });
check('non-API paths are not touched by the limiter', r.status === 200 && fnCalls === 1);
check('hidden repo files still 404 first', (await call('/supabase/accounts_v4.sql')).status === 404);
const hid = await call('/SECURITY-AUDIT.md');
check('SECURITY-AUDIT.md stays hidden', hid.status === 404);

console.log('== _headers: Turnstile origin only where it is needed');
const H = fs.readFileSync(REPO + '/_headers', 'utf8');
const csp = (H.match(/^\s+Content-Security-Policy: (.*)$/m) || [, ''])[1];
const dir = n => (csp.match(new RegExp('(?:^|; )' + n + ' ([^;]*)')) || [, ''])[1];
check('script-src has challenges.cloudflare.com', dir('script-src').split(' ').includes('https://challenges.cloudflare.com'));
check('frame-src has challenges.cloudflare.com', dir('frame-src').split(' ').includes('https://challenges.cloudflare.com'));
check('child-src has challenges.cloudflare.com', dir('child-src').split(' ').includes('https://challenges.cloudflare.com'));
check('connect/img/style/font not widened for it', ['connect-src', 'img-src', 'style-src', 'style-src-elem', 'font-src', 'media-src'].every(d => !dir(d).includes('cloudflare')));
check("no 'unsafe-inline' / 'unsafe-eval' in script-src", !/unsafe-inline|'unsafe-eval'/.test(dir('script-src')));
check('index.html loads acct.js + acct.css with ?v=', /assets\/acct\.js\?v=\d+/.test(fs.readFileSync(REPO + '/index.html', 'utf8')) && /assets\/acct\.css\?v=\d+/.test(fs.readFileSync(REPO + '/index.html', 'utf8')));
check('supabase/accounts_v4.sql is hidden by the middleware rules', mw.isHidden('/supabase/accounts_v4.sql'));

Date.now = realNow;
console.log(`\naccounts_v4: ${ok} ok, ${bad.length} failed` + (bad.length ? ' → ' + JSON.stringify(bad) : ''));
process.exit(bad.length ? 1 : 0);
