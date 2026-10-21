// Shared helpers for the owner SMS alerts (no route: this file exports no onRequest handler). See NOTIFY.md.
// Edge events (rate limits, probes for hidden files, forged payment webhooks) go to the database first
// (public.notify_edge, HMAC with NOTIFY_SECRET), so the owner's levels, quiet hours and caps apply to them too.
import { sbUrl, sbKey, hmacHex, withTimeout } from './pay/paypal-lib.js';

export const EDGE_KINDS = ['rate', 'probe', 'paysig', 'relay'];
const SLOT = 10 * 60;   // seconds: at most one report per kind per data centre every 10 minutes (the database throttles again: 30 min)

// → true when this call should report (first hit of the kind in this slot). Best effort: no cache → report.
export async function edgeFirst(origin, kind, now = Date.now()) {
  if (!globalThis.caches || typeof caches.open !== 'function') return true;
  try {
    const cache = await caches.open('cr-notify');
    const key = new Request(`${origin}/__nt/${kind}/${Math.floor(now / 1000 / SLOT)}`);
    if (await cache.match(key)) return false;
    await cache.put(key, new Response('1', { headers: { 'cache-control': `max-age=${SLOT + 5}` } }));
    return true;
  } catch (e) { return true; }
}

// report one edge event; never throws, never delays the response (callers pass it to waitUntil)
export async function edgeNote(env, request, kind, path) {
  try {
    if (!env || !env.NOTIFY_SECRET || !EDGE_KINDS.includes(kind)) return 'off';
    const origin = new URL(request.url).origin;
    if (!(await edgeFirst(origin, kind))) return 'throttled';
    const body = JSON.stringify({ t: Math.floor(Date.now() / 1000), kind, n: 1, path: String(path || '').replace(/[^A-Za-z0-9/._%-]/g, '').slice(0, 80) });
    const sig = await hmacHex(String(env.NOTIFY_SECRET), body);
    const key = sbKey(env), headers = { 'content-type': 'application/json', apikey: key };
    if (/^eyJ/.test(key)) headers.authorization = `Bearer ${key}`;
    const r = await withTimeout(8000, signal => fetch(`${sbUrl(env)}/rest/v1/rpc/notify_edge`, {
      method: 'POST', signal, headers, body: JSON.stringify({ p_body: body, p_sig: sig }) }));
    return r.ok ? 'sent' : 'fail ' + r.status;
  } catch (e) { return 'error'; }
}

// constant-time compare of two hex strings
export function sameHex(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || !/^[0-9a-f]+$/.test(a)) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// the owner's phone numbers (E.164), from NOTIFY_TO only — never from the request or the database
export const phones = env => String((env && env.NOTIFY_TO) || '').split(',').map(s => s.trim()).filter(s => /^\+[1-9][0-9]{7,14}$/.test(s)).slice(0, 3);

// send one SMS through Twilio → { ok, status, sid? }
export async function twilioSend(env, to, text) {
  const sid = String(env.TWILIO_ACCOUNT_SID || '').trim(), tok = String(env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(env.TWILIO_FROM || '').trim(), ms = String(env.TWILIO_MESSAGING_SID || '').trim();
  if (!/^AC[0-9a-f]{32}$/i.test(sid) || !tok || (!from && !ms)) return { ok: false, status: 0, error: 'not configured' };
  const form = new URLSearchParams({ To: to, Body: text });
  if (ms) form.set('MessagingServiceSid', ms); else form.set('From', from);
  const r = await withTimeout(10000, signal => fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', signal,
    headers: { authorization: 'Basic ' + btoa(`${sid}:${tok}`), 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString() }));
  let o = null; try { o = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, sid: o && o.sid, error: !r.ok ? String((o && (o.message || o.code)) || r.status).slice(0, 120) : undefined };
}
