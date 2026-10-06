// Security v3 (SECURITY-AUDIT.md), the Functions / Pages-config side:
//  * functions/_middleware.js hides repo files on a NORMALISED path: percent-encoded (once/twice), duplicate slashes,
//    backslashes, ./.. segments, trailing dots, any case, *.md at any depth, .git*, .claude/; undecodable paths refused
//  * _routes.json routes the common case variants through the middleware, never a catch-all
//  * _headers: only /ai/worker.js runs without the page CSP (an unknown /ai/... URL = SPA fallback = a page)
//  * functions/api/assistant.js: the site-wide ceiling ('site_limit') → 503 busy, the conversation sent to the model is
//    capped at 12 000 characters (oldest turns dropped, still starts and ends with the user)
import { REPO } from './repo.mjs';
import fs from 'node:fs';
const mw = await import(REPO + '/functions/_middleware.js');
const as = await import(REPO + '/functions/api/assistant.js');

let ok = 0; const bad = [];
const check = (label, cond, info = '') => { if (cond) ok++; else bad.push(label); console.log(cond ? '  ok  ' : '  FAIL', label.padEnd(64), String(info).slice(0, 120)); };

console.log('== middleware: hidden paths after normalisation');
const M = async raw => {
  let passed = false;
  const r = await mw.onRequest({ request: new Request('https://chord-room.pages.dev' + raw), next: async () => { passed = true; return new Response('static', { status: 200 }); } });
  return { status: r.status, passed, csp: r.headers.get('content-security-policy') };
};
for (const p of ['/supabase%2Fschema.sql', '/supabase%2fschema.sql', '/%73upabase/schema.sql', '/%2573upabase/schema.sql',
                 '//supabase/schema.sql', '///tools//tests/lib.py', '/Supabase/schema.sql', '/SUPABASE/email/confirm-signup',
                 '/tools%2Ftests%2FREADME.md', '/tools%5Ctests%5Clib.py', '/assets/..%2f..%2fsupabase/schema.sql',
                 '/assets/%2e%2e/CLAUDE.md', '/CLAUDE.md.', '/CLAUDE.md%20', '/Claude.MD', '/docs/notes.md', '/tools/ai-worker/package.json',
                 '/.gitattributes', '/.GITIGNORE', '/.git/HEAD', '/.claude/settings.json', '/functions%2Fapi%2Fpay%2Fwebhook.js',
                 '/%E0%A4%A', '/supabase/x%00.sql']) {
  const r = await M(p);
  check(`${p} → 404, not passed to the static server`, r.status === 404 && !r.passed && r.csp === "default-src 'none'; frame-ancestors 'none'", `${r.status} ${r.passed}`);
}
for (const p of ['/api/deezer/chart/0/tracks', '/api/assistant', '/api/pay/webhook', '/api/deezer/search', '/index.html', '/assets/app.js']) {
  const r = await M(p);
  check(`${p} → passes through`, r.status === 200 && r.passed, `${r.status} ${r.passed}`);
}
check('normPath decodes twice + resolves ..', mw.normPath('/a/%252e%252e/supabase%2Fx') === '/supabase/x', mw.normPath('/a/%252e%252e/supabase%2Fx'));
check('normPath refuses bad escapes', mw.normPath('/%E0%A4%A') === null);

console.log('== _routes.json');
const routes = JSON.parse(fs.readFileSync(REPO + '/_routes.json', 'utf8'));
const inc = routes.include;
check('case variants routed through the middleware', ['/Supabase/*', '/SUPABASE/*', '/Tools/*', '/TOOLS/*', '/*.MD', '/.claude/*'].every(x => inc.includes(x)), inc.join(' '));
check('no catch-all (every request would cost a Function call)', !inc.some(x => x === '/*' || x === '/**' || x.startsWith('//')), inc.join(' '));
check('≤ 100 rules (Cloudflare limit)', inc.length + routes.exclude.length <= 100, inc.length);
check('every rule starts with /', inc.every(x => x.startsWith('/')));

console.log('== _headers: CSP exemption only for the AI worker script');
const rules = []; let cur = null;
for (const line of fs.readFileSync(REPO + '/_headers', 'utf8').split('\n')) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) { cur = { pat: line.trim(), lines: [] }; rules.push(cur); } else cur.lines.push(line.trim());
}
const detaches = rules.filter(r => r.lines.some(l => /^!\s*content-security-policy$/i.test(l))).map(r => r.pat);
check('only /ai/worker.js detaches the CSP', detaches.length === 1 && detaches[0] === '/ai/worker.js', detaches.join(' '));
const root = rules.find(r => r.pat === '/*');
const hdr = n => (root.lines.find(l => l.toLowerCase().startsWith(n + ':')) || '').slice(n.length + 1).trim();
const scriptSrc = (hdr('content-security-policy').match(/script-src ([^;]*)/) || [, ''])[1];
// deliberate remote hosts: Deezer's API for the Discover JSONP fallback (allow-listed read endpoints, validated data),
// Cloudflare Turnstile (accounts v4: bot check on the auth forms, loaded only when a site key is configured) and,
// growth, the two analytics tags (loaded by assets/consent.js only after cookie consent and only with admin-set ids)
check("page CSP script-src: no 'unsafe-eval' / 'unsafe-inline' / remote hosts except api.deezer.com + challenges.cloudflare.com + GA4 + Clarity", scriptSrc === "'self' 'wasm-unsafe-eval' blob: https://api.deezer.com https://challenges.cloudflare.com https://www.googletagmanager.com https://*.clarity.ms", scriptSrc);
check("page CSP: frame-ancestors 'none', object-src 'none', base-uri 'none'", ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"].every(x => hdr('content-security-policy').includes(x)));
check('HSTS ≥ 1 year', /max-age=(\d+)/.test(hdr('strict-transport-security')) && +hdr('strict-transport-security').match(/max-age=(\d+)/)[1] >= 31536000);
check('Permissions-Policy: mic only for self, camera/geolocation/payment off', /microphone=\(self\)/.test(hdr('permissions-policy')) && /camera=\(\)/.test(hdr('permissions-policy')) && /geolocation=\(\)/.test(hdr('permissions-policy')) && /payment=\(\)/.test(hdr('permissions-policy')));
check('COOP same-origin, nosniff, XFO DENY, Referrer-Policy', hdr('cross-origin-opener-policy') === 'same-origin' && hdr('x-content-type-options') === 'nosniff' && hdr('x-frame-options') === 'DENY' && hdr('referrer-policy') === 'strict-origin-when-cross-origin');

console.log('== assistant: site ceiling + conversation size cap');
const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.sigsigsigsig';
let quota = { ok: true, left: 5, limit: 30, me: { plan: 'free', credits: 1 }, billing: {} }, lastBody = null;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: 200 });
  if (url.endsWith('/rest/v1/rpc/assistant_use')) return new Response(JSON.stringify(quota), { status: 200 });
  if (url === 'https://api.anthropic.com/v1/messages') {
    lastBody = JSON.parse(init.body);
    const sse = ['{"type":"message_delta","delta":{"stop_reason":"end_turn"}}', '{"type":"message_stop"}'].map(d => `data: ${d}\n\n`).join('');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }
  throw new Error('unexpected ' + url);
};
const post = body => as.onRequestPost({ request: new Request('https://chord-room.pages.dev/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(body) }), env: { ANTHROPIC_API_KEY: 'sk-ant-TESTKEY-1' } });
quota = { ok: false, why: 'site_limit' };
let r = await post({ messages: [{ role: 'user', content: 'hi' }] });
check('site_limit → 503 busy + retry-after, model not called', r.status === 503 && (await r.json()).error === 'busy' && r.headers.get('retry-after') === '3600' && lastBody === null);
quota = { ok: true, left: 5, limit: 30, me: { plan: 'free', credits: 1 }, billing: {} };
// 15 × 1990 ASCII chars ≈ 30 KB: under the 32 KB body limit (Hebrew is 2 bytes/char, so the body limit bites first there)
const long = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: (i % 2 ? 'a' : 'b').repeat(1990) + ' #' + i }));
r = await post({ messages: long }); await r.text();
const msgs = lastBody.messages, total = msgs.reduce((n, m) => n + m.content.length, 0);
check('15 × 2000 chars → ≤ 12 000 chars reach the model', r.status === 200 && total <= 12000, `${msgs.length} msgs, ${total} chars`);
check('…starts with a user turn and keeps the newest (last) message', msgs[0].role === 'user' && msgs[msgs.length - 1].content.endsWith('#14'), msgs.map(m => m.role[0]).join(''));
check('…turns still alternate', msgs.every((m, i) => i === 0 || m.role !== msgs[i - 1].role));
r = await post({ messages: [{ role: 'user', content: 'short question' }] }); await r.text();
check('short conversation untouched', lastBody.messages.length === 1 && lastBody.messages[0].content === 'short question');

console.log(`\n${ok} ok, ${bad.length} failed`, bad);
process.exit(bad.length ? 1 : 0);
