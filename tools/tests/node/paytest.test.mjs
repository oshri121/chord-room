// [R6-6] PayPal sandbox test accounts, the Function side (functions/api/pay/paypal-subscribe.js):
//  * PAYPAL_ENV sandbox: only the owner, admins and accounts with pay_test_until in the future get an approve link;
//    everyone else → 403 {error:'sandbox_tester'} (the webhook would ignore their fake payment anyway)
//  * the profile query falls back to role/owner when the pay_test_until column isn't installed yet
//  * PAYPAL_ENV live: unchanged (no role/tester columns requested, anyone signed in may subscribe)
import { REPO } from './repo.mjs';
const fn = await import(REPO + '/functions/api/pay/paypal-subscribe.js');

let ok = 0; const bad = [];
const check = (label, cond, info = '') => { if (cond) ok++; else bad.push(label); console.log(cond ? '  ok  ' : '  FAIL', label.padEnd(64), String(info).slice(0, 140)); };

let prof = {}, noCol = false; const urls = [];
globalThis.fetch = async (u, o = {}) => {
  u = String(u); urls.push(u);
  if (u.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: '00000000-0000-0000-0000-0000000000d1', email: 't@x.com' }), { status: 200 });
  if (u.includes('/rest/v1/site_config')) return new Response(JSON.stringify([{ billing: { plans: [{ id: 'pro', variant: 'P-PRO0000000001' }] } }]), { status: 200 });
  if (u.includes('/rest/v1/profiles')) {
    if (noCol && u.includes('pay_test_until')) return new Response('{"code":"42703"}', { status: 400 });
    return new Response(JSON.stringify([prof]), { status: 200 });
  }
  if (u.includes('/v1/oauth2/token')) return new Response(JSON.stringify({ access_token: 'A', expires_in: 3000 }), { status: 200 });
  if (u.includes('/v1/billing/subscriptions')) return new Response(JSON.stringify({ links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=X' }] }), { status: 201 });
  return new Response('{}', { status: 404 });
};
const ENV = { PAYPAL_ENV: 'sandbox', PAYPAL_CLIENT_ID: 'c', PAYPAL_CLIENT_SECRET: 's' };
const go = async (p, env = ENV) => {
  prof = p; urls.length = 0;
  const r = await fn.onRequest({ env, request: new Request('https://chord-room.com/api/pay/paypal-subscribe', { method: 'POST',
    headers: { authorization: 'Bearer ' + 'x'.repeat(40), 'content-type': 'application/json' }, body: '{"plan":"pro"}' }) });
  return [r.status, await r.json().catch(() => ({}))];
};
const future = new Date(Date.now() + 3 * 864e5).toISOString(), past = new Date(Date.now() - 60e3).toISOString();

let [st, o] = await go({ role: 'user', owner: false, pay_test_until: null });
check('sandbox, plain member → 403 sandbox_tester', st === 403 && o.error === 'sandbox_tester', st + ' ' + o.error);
check('…PayPal never called', !urls.some(u => u.includes('paypal.com')));
[st, o] = await go({ role: 'user', owner: false, pay_test_until: past });
check('sandbox, expired tester → 403', st === 403 && o.error === 'sandbox_tester', st);
[st, o] = await go({ role: 'user', owner: false, pay_test_until: future });
check('sandbox, tester → approve link', st === 200 && /sandbox\.paypal\.com/.test(o.url || ''), st);
[st, o] = await go({ role: 'admin', owner: false });
check('sandbox, admin → approve link', st === 200, st);
[st, o] = await go({ role: 'user', owner: true });
check('sandbox, owner → approve link', st === 200, st);
noCol = true;
[st, o] = await go({ role: 'admin', owner: false });
check('column not installed yet → falls back, admin still ok', st === 200, st);
[st, o] = await go({ role: 'user', owner: false });
check('…plain member still refused', st === 403, st);
noCol = false;
[st, o] = await go({ role: 'user', owner: false, pay_test_until: null }, { ...ENV, PAYPAL_ENV: 'live' });
check('live: a plain member subscribes as before', st === 200, st);
check('…live asks only the old columns', urls.some(u => u.includes('select=pay_status,pay_provider,blocked') && !u.includes('role')));

console.log(`\n${ok} ok, ${bad.length} failed`, bad.length ? '→ ' + JSON.stringify(bad) : '');
process.exitCode = bad.length ? 1 : 0;
