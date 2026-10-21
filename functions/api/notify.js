// Cloudflare Pages Function: owner SMS alerts (supabase/notify_v7.sql → here → Twilio → the owner's phone). See NOTIFY.md.
// The database (pg_net) POSTs {"t":"<epoch s>","id":"<log id>","msg":"…"} with x-cr-sig = HMAC-SHA256(NOTIFY_SECRET, t\nid\nmsg).
// Refused: anything not signed with the shared secret, older than 15 minutes, or already sent (same id, per data centre).
// The phone number comes ONLY from NOTIFY_TO here, so nobody can redirect the alerts from the site or the database.
// Env (Cloudflare Pages → Settings → Variables and Secrets):
//   NOTIFY_SECRET         = private.settings 'notify_secret' (encrypt)
//   NOTIFY_TO             the owner's phone, E.164 (+9725…); up to 3, comma separated
//   TWILIO_ACCOUNT_SID    AC…
//   TWILIO_AUTH_TOKEN     (encrypt)
//   TWILIO_FROM           the Twilio number (+1…) or an alphanumeric sender ("ChordRoom"), or instead:
//   TWILIO_MESSAGING_SID  MG… (a Twilio Messaging Service)
import { readCapped, json, hmacHex } from './pay/paypal-lib.js';
import { sameHex, phones, twilioSend } from './notify-lib.js';

const MAX_BODY = 4096;

// an id already delivered (per data centre): a replayed request never sends twice. Marked only after a successful send,
// so the database's retry of a failed one still goes out.
async function seen(origin, id, mark) {
  if (!globalThis.caches || typeof caches.open !== 'function') return false;
  try {
    const cache = await caches.open('cr-notify'), key = new Request(`${origin}/__ns/${id}`);
    if (mark) { await cache.put(key, new Response('1', { headers: { 'cache-control': 'max-age=86400' } })); return true; }
    return !!(await cache.match(key));
  } catch (e) { return false; }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env || !env.NOTIFY_SECRET) return json({ error: 'not configured' }, 503);
  if (+(request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'too large' }, 413);
  const sig = String(request.headers.get('x-cr-sig') || '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sig)) return json({ error: 'bad signature' }, 401);
  const buf = await readCapped(request, MAX_BODY);
  if (!buf) return json({ error: 'too large' }, 413);
  let o;
  try { o = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf)); } catch (e) { return json({ error: 'bad body' }, 400); }
  const t = String(o && o.t || ''), id = String(o && o.id || ''), msg = typeof (o && o.msg) === 'string' ? o.msg : '';
  if (!/^[0-9]{9,11}$/.test(t) || !/^[0-9]{1,18}$/.test(id) || !msg || msg.length > 400) return json({ error: 'bad body' }, 400);
  if (!sameHex(sig, await hmacHex(String(env.NOTIFY_SECRET).trim(), t + '\n' + id + '\n' + msg))) return json({ error: 'bad signature' }, 401);
  if (Math.abs(Date.now() / 1000 - +t) > 900) return json({ error: 'stale' }, 401);
  const to = phones(env);
  if (!to.length) return json({ error: 'no phone (NOTIFY_TO)' }, 503);
  const origin = new URL(request.url).origin;
  if (await seen(origin, id)) return json({ ok: true, duplicate: true }, 200);
  const res = [];
  for (const p of to) {
    try { res.push(await twilioSend(env, p, msg)); } catch (e) { res.push({ ok: false, status: 0, error: 'unreachable' }); }
  }
  const ok = res.some(r => r.ok);
  if (ok) await seen(origin, id, true);
  if (!ok) console.log('notify: sms failed', res.map(r => r.status + ' ' + (r.error || '')).join('; ').slice(0, 200));
  return json({ ok, sent: res.filter(r => r.ok).length }, ok ? 200 : 502);   // 502 → the database retries once
}
