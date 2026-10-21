// Owner SMS alerts (NOTIFY.md), the Cloudflare side:
//  * functions/api/notify.js: only requests signed by the database (HMAC of t\nid\nmsg with NOTIFY_SECRET), fresh (≤ 15 min),
//    sent once per id (a failed send can be retried), to NOTIFY_TO only, through Twilio (form body, Basic auth)
//  * functions/api/notify-lib.js + _middleware.js + api/pay/paypal.js: edge events (probe / rate / paysig / relay) reported to
//    the database RPC notify_edge, signed, in the background (waitUntil), throttled per kind; nothing without NOTIFY_SECRET
import { REPO } from './repo.mjs';
import crypto from 'node:crypto';
const fn = await import(REPO + '/functions/api/notify.js');
const lib = await import(REPO + '/functions/api/notify-lib.js');
const mw = await import(REPO + '/functions/_middleware.js');
const pp = await import(REPO + '/functions/api/pay/paypal.js');

let ok = 0; const bad = [];
const check = (label, cond, info = '') => { if (cond) ok++; else bad.push(label); console.log(cond ? '  ok  ' : '  FAIL', label.padEnd(64), String(info).slice(0, 140)); };

const store = new Map();
globalThis.caches = { async open(name) {
  return { async match(req) { const v = store.get(name + ' ' + req.url); return v ? new Response(v) : undefined; },
           async put(req, res) { store.set(name + ' ' + req.url, await res.text()); } }; } };
let twilioOk = true; const calls = [];
globalThis.fetch = async (u, o = {}) => {
  calls.push({ url: String(u), o });
  if (String(u).startsWith('https://api.twilio.com/')) return new Response(JSON.stringify(twilioOk ? { sid: 'SM1' } : { message: 'bad' }), { status: twilioOk ? 201 : 400 });
  return new Response('"ok"', { status: 200 });
};
const SECRET = 'a'.repeat(64);
const ENV = { NOTIFY_SECRET: SECRET, NOTIFY_TO: '+972501234567', TWILIO_ACCOUNT_SID: 'AC' + '0'.repeat(32), TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: 'ChordRoom' };
const sign = (t, id, msg, s = SECRET) => crypto.createHmac('sha256', s).update(t + '\n' + id + '\n' + msg).digest('hex');
const post = async (body, sig, env = ENV, method = 'POST') => {
  calls.length = 0;
  const r = await fn.onRequest({ env, request: new Request('https://chord-room.com/api/notify', { method, headers: { 'content-type': 'application/json', 'x-cr-sig': sig }, body: method === 'POST' ? JSON.stringify(body) : undefined }) });
  return [r.status, calls.filter(c => c.url.startsWith('https://api.twilio.com/'))];
};
const now = () => String(Math.floor(Date.now() / 1000));

console.log('== /api/notify');
let t = now(), msg = 'תשלום התקבל: 29.00 ILS · @dana';
let [st, tw] = await post({ t, id: '1', msg }, sign(t, '1', msg));
check('signed → 200', st === 200, st);
check('one Twilio call', tw.length === 1, tw.length);
const form = tw[0] && new URLSearchParams(tw[0].o.body);
check('To = NOTIFY_TO, From, Body = msg', form && form.get('To') === '+972501234567' && form.get('From') === 'ChordRoom' && form.get('Body') === msg, form && form.toString().slice(0, 80));
check('Basic auth with the account sid', tw[0] && tw[0].o.headers.authorization === 'Basic ' + btoa(ENV.TWILIO_ACCOUNT_SID + ':tok'));
check('to the Messages endpoint of that account', tw[0] && tw[0].url === `https://api.twilio.com/2010-04-01/Accounts/${ENV.TWILIO_ACCOUNT_SID}/Messages.json`);
[st, tw] = await post({ t, id: '1', msg }, sign(t, '1', msg));
check('the same id again → 200, not sent twice', st === 200 && tw.length === 0, st + ' ' + tw.length);
[st, tw] = await post({ t, id: '2', msg: msg + '!' }, sign(t, '2', msg));
check('message changed after signing → 401', st === 401 && !tw.length, st);
[st, tw] = await post({ t, id: '3', msg }, sign(t, '3', msg, 'b'.repeat(64)));
check('signed with another secret → 401', st === 401 && !tw.length, st);
const old = String(+t - 3600);
[st, tw] = await post({ t: old, id: '4', msg }, sign(old, '4', msg));
check('an hour old → 401 (stale)', st === 401 && !tw.length, st);
[st] = await post({ t, id: '5', msg }, 'zz');
check('no / malformed signature → 401', st === 401, st);
[st] = await post({ t, id: 'x', msg }, sign(t, 'x', msg));
check('bad id → 400', st === 400, st);
[st] = await post({ t, id: '6', msg: 'x'.repeat(401) }, sign(t, '6', 'x'.repeat(401)));
check('message over 400 chars → 400', st === 400, st);
[st] = await post({}, '', ENV, 'GET');
check('GET → 405', st === 405, st);
[st] = await post({ t, id: '7', msg }, sign(t, '7', msg), { ...ENV, NOTIFY_SECRET: '' });
check('no NOTIFY_SECRET → 503', st === 503, st);
[st, tw] = await post({ t, id: '8', msg, to: '+15550001111' }, sign(t, '8', msg), { ...ENV, NOTIFY_TO: '' });
check('no NOTIFY_TO → 503 (a number in the request is ignored)', st === 503 && !tw.length, st);
[st, tw] = await post({ t, id: '9', msg }, sign(t, '9', msg), { ...ENV, NOTIFY_TO: '+972501234567, +972521111111,evil,+1' });
check('up to 3 valid numbers, junk ignored', st === 200 && tw.length === 2, tw.length);
twilioOk = false;
[st, tw] = await post({ t, id: '10', msg }, sign(t, '10', msg));
check('Twilio refuses → 502 (the database retries)', st === 502 && tw.length === 1, st);
twilioOk = true;
[st, tw] = await post({ t, id: '10', msg }, sign(t, '10', msg));
check('… the retry goes out (a failed id is not marked sent)', st === 200 && tw.length === 1, st + ' ' + tw.length);
[st, tw] = await post({ t, id: '11', msg }, sign(t, '11', msg), { ...ENV, TWILIO_FROM: '', TWILIO_MESSAGING_SID: 'MG1' });
check('Messaging Service instead of From', st === 200 && new URLSearchParams(tw[0].o.body).get('MessagingServiceSid') === 'MG1');
check('phones(): only E.164', JSON.stringify(lib.phones({ NOTIFY_TO: '0501234567,+972501234567,+97250123456789012' })) === '["+972501234567"]');
check('sameHex: constant-time equality', lib.sameHex('ab', 'ab') && !lib.sameHex('ab', 'ac') && !lib.sameHex('ab', 'abc') && !lib.sameHex('', ''));

console.log('== edge events');
const waits = [];
const mwCall = async (path, env, ip = '203.0.113.9', method = 'GET') => {
  calls.length = 0; waits.length = 0;
  const ctx = { env, request: new Request('https://chord-room.com' + path, { method, headers: { 'cf-connecting-ip': ip } }), waitUntil: p => waits.push(p),
    next: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) };
  const r = await mw.onRequest(ctx); await Promise.all(waits);
  return [r.status, calls.filter(c => c.url.includes('/rest/v1/rpc/notify_edge'))];
};
store.clear();
let [s1, e1] = await mwCall('/supabase/schema.sql', ENV);
check('probe for a hidden file → 404 + reported', s1 === 404 && e1.length === 1, s1 + ' ' + e1.length);
const eb = e1[0] && JSON.parse(e1[0].o.body), inner = eb && JSON.parse(eb.p_body);
check('… signed body {t,kind,n,path} → notify_edge', inner && inner.kind === 'probe' && inner.path === '/supabase/schema.sql' && eb.p_sig === crypto.createHmac('sha256', SECRET).update(eb.p_body).digest('hex'));
[s1, e1] = await mwCall('/.git/config', ENV);
check('a second probe in the same 10 minutes → not reported again', s1 === 404 && e1.length === 0, e1.length);
[s1, e1] = await mwCall('/tools/x', { NOTIFY_SECRET: '' });
check('no NOTIFY_SECRET → nothing reported', s1 === 404 && e1.length === 0);
store.clear();
let last;
for (let i = 0; i < 61; i++) last = await mwCall('/api/pay/paypal-subscribe', ENV, '198.51.100.77', 'POST');
check('the 61st API call → 429 + reported (rate)', last[0] === 429 && last[1].length === 1 && JSON.parse(JSON.parse(last[1][0].o.body).p_body).kind === 'rate', last[0]);
store.clear(); calls.length = 0; waits.length = 0;
const pr = await pp.onRequest({ env: { ...ENV, PAYPAL_WEBHOOK_ID: 'W', PAYPAL_RELAY_SECRET: 'r', PAYPAL_CLIENT_ID: 'c', PAYPAL_CLIENT_SECRET: 's' }, waitUntil: p => waits.push(p),
  request: new Request('https://chord-room.com/api/pay/paypal', { method: 'POST', body: '{}' }) });
await Promise.all(waits);
const pe = calls.filter(c => c.url.includes('/rest/v1/rpc/notify_edge'));
check('a forged PayPal webhook → 401 + reported (paysig)', pr.status === 401 && pe.length === 1 && JSON.parse(JSON.parse(pe[0].o.body).p_body).kind === 'paysig', pr.status);

console.log(`\n${ok} ok, ${bad.length} failed`, bad.length ? '→ ' + JSON.stringify(bad) : '');
process.exitCode = bad.length ? 1 : 0;
