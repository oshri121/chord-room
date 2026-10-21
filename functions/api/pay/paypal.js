// Cloudflare Pages Function: PayPal webhook → Supabase.
// PayPal POSTs events here (https://chord-room.com/api/pay/paypal). We ask PayPal to verify the event
// (POST /v1/notifications/verify-webhook-signature with PAYPAL_WEBHOOK_ID, the raw body passed through unchanged),
// then sign  env + '\n' + body  with PAYPAL_RELAY_SECRET and hand it to public.pay_webhook_paypal, which checks that
// HMAC with the same secret (private.settings) and activates the plan / adds the points exactly once. See PAYMENTS.md.
import { ppEnv, ppBase, ppToken, sbUrl, sbKey, hmacHex, readCapped, withTimeout } from './paypal-lib.js';
import { edgeNote } from '../notify-lib.js';   // notify v7: forged webhooks / relay secret mismatch → owner alert (NOTIFY.md)

const MAX_BODY = 256 * 1024;
const text = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const H = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const note = kind => { try { if (env && env.NOTIFY_SECRET && typeof ctx.waitUntil === 'function') ctx.waitUntil(edgeNote(env, request, kind, '/api/pay/paypal')); } catch (e) {} };
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  if (!env || !env.PAYPAL_WEBHOOK_ID || !env.PAYPAL_RELAY_SECRET || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    console.log('paypal webhook: not configured');
    return text('not configured', 500);                              // PayPal retries for a few days
  }
  if (+(request.headers.get('content-length') || 0) > MAX_BODY) return text('too large', 413);
  const hv = H.map(h => (request.headers.get(h) || '').trim());
  if (hv.some(v => !v || v.length > 2000)) { note('paysig'); return text('bad signature', 401); }
  // cheap checks first, so a forged request never costs a PayPal API call (PayPal itself always sends these shapes)
  const cu = /^https:\/\/api(-m)?\.(sandbox\.)?paypal\.com\//i.exec(hv[1]);
  if (!cu) { note('paysig'); return text('bad signature', 401); }
  if (!!cu[2] !== (ppEnv(env) === 'sandbox')) { note('paysig'); return text('bad signature', 401); }           // sandbox cert on live (or the other way)
  if (hv[0] !== 'SHA256withRSA') { note('paysig'); return text('bad signature', 401); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hv[2])) { note('paysig'); return text('bad signature', 401); }
  if (!/^[A-Za-z0-9+/]{40,1900}={0,2}$/.test(hv[3])) { note('paysig'); return text('bad signature', 401); }
  // transmission time: a wide window (PayPal retries for days), only nonsense / far-off times are refused
  const tt = Date.parse(hv[4]), now = Date.now();
  if (!isFinite(tt) || tt > now + 3600e3 || tt < now - 30 * 86400e3) { note('paysig'); return text('bad signature', 401); }

  const buf = await readCapped(request, MAX_BODY);
  if (!buf) return text('too large', 413);
  let body, ev0;
  try { body = new TextDecoder('utf-8', { fatal: true }).decode(buf); ev0 = JSON.parse(body); } catch (e) { return text('bad body', 400); }
  // an event object (any event_type is accepted after verification: refusing new types would make PayPal retry)
  if (!ev0 || typeof ev0 !== 'object' || Array.isArray(ev0) || !/^WH-[A-Za-z0-9-]{4,80}$/.test(String(ev0.id || '')) ||
      typeof ev0.event_type !== 'string' || !ev0.event_type) return text('bad body', 400);

  // 1) PayPal says the event is genuine (the event goes in as the exact bytes we received: re-serialising can break it)
  try {
    const tok = await ppToken(env);
    const vb = '{"auth_algo":' + JSON.stringify(hv[0]) + ',"cert_url":' + JSON.stringify(hv[1]) +
      ',"transmission_id":' + JSON.stringify(hv[2]) + ',"transmission_sig":' + JSON.stringify(hv[3]) +
      ',"transmission_time":' + JSON.stringify(hv[4]) + ',"webhook_id":' + JSON.stringify(String(env.PAYPAL_WEBHOOK_ID)) +
      ',"webhook_event":' + body + '}';
    const r = await withTimeout(10000, signal => fetch(`${ppBase(env)}/v1/notifications/verify-webhook-signature`, {
      method: 'POST', signal, headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: vb }));
    if (!r.ok) { console.log('paypal webhook: verify call failed', r.status); return text('verify unavailable', 502); }
    const v = await r.json();
    if (!v || v.verification_status !== 'SUCCESS') { console.log('paypal webhook: verification', v && v.verification_status); { note('paysig'); return text('bad signature', 401); } }
  } catch (e) {
    console.log('paypal webhook: verify unreachable', String(e && e.message || e).slice(0, 80));
    return text('verify unavailable', 502);
  }

  // 2) relay to the database, signed with the secret only it and this Function know
  const penv = ppEnv(env);
  const sig = await hmacHex(String(env.PAYPAL_RELAY_SECRET), penv + '\n' + body);
  const key = sbKey(env);
  const headers = { 'content-type': 'application/json', apikey: key };
  if (/^eyJ/.test(key)) headers.authorization = `Bearer ${key}`;
  let res, out;
  try {
    res = await withTimeout(15000, signal => fetch(`${sbUrl(env)}/rest/v1/rpc/pay_webhook_paypal`, {
      method: 'POST', signal, headers, body: JSON.stringify({ p_body: body, p_env: penv, p_sig: sig }) }));
    out = await res.text();
  } catch (e) {
    console.log('paypal webhook: database unreachable');
    return text('upstream error', 502);
  }
  if (res.ok) {
    let r = out; try { r = JSON.parse(out); } catch (e) {}
    let ev = ''; try { ev = String(JSON.parse(body).event_type || ''); } catch (e) {}
    console.log('paypal webhook:', ev.replace(/[^\w.:-]/g, '').slice(0, 60), '→', String(r).slice(0, 120));
    return text('ok', 200);
  }
  let msg = ''; try { msg = String(JSON.parse(out).message || ''); } catch (e) {}
  console.log('paypal webhook failed:', res.status, msg.slice(0, 80));
  if (/bad signature/.test(msg)) { note('relay'); return text('relay secret mismatch', 500); }   // Cloudflare and the DB disagree → retry after fixing
  if (/bad json|bad body/.test(msg)) return text('bad request', 400);
  return text('not ready', 500);
}
