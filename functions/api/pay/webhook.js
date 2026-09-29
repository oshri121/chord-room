// Cloudflare Pages Function: Lemon Squeezy webhook → Supabase.
// Lemon Squeezy POSTs signed events here (https://chord-room.pages.dev/api/pay/webhook). This file holds NO secret:
// it forwards the raw body and the X-Signature header to the database function public.pay_webhook, which checks the
// HMAC-SHA256 signature with the signing secret stored only in the database (private.settings) and then activates
// the plan / adds the points exactly once. See PAYMENTS.md.
//
// The URL and publishable key are the same PUBLIC values as config.js (they can only do what the database rules allow).
// They can be overridden with the Pages environment variables SUPABASE_URL / SUPABASE_ANON_KEY.
const SUPABASE_URL = 'https://ydyocusfrghsokjsectw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_L7IuhkaBoV5BZNuX7ixmjw_3F3KdKdI';
const MAX_BODY = 256 * 1024;

const text = (body, status) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

async function readCapped(request, max) {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch (e) {} return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0; for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  const url = String((env && env.SUPABASE_URL) || SUPABASE_URL).replace(/\/+$/, '');
  const key = String((env && env.SUPABASE_ANON_KEY) || SUPABASE_ANON_KEY);
  if (+(request.headers.get('content-length') || 0) > MAX_BODY) return text('too large', 413);
  const sig = (request.headers.get('x-signature') || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return text('bad signature', 401);

  if (!/json/i.test(request.headers.get('content-type') || '')) return text('bad request', 400);

  // the signature covers the exact bytes, so read them raw and refuse anything that isn't valid UTF-8.
  // Read as a stream with a cap, so a body without content-length can't make us buffer megabytes.
  const buf = await readCapped(request, MAX_BODY);
  if (!buf) return text('too large', 413);
  let body;
  try { body = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return text('bad body', 400); }

  const headers = { 'content-type': 'application/json', apikey: key };
  if (/^eyJ/.test(key)) headers.authorization = `Bearer ${key}`;   // legacy JWT anon key; new sb_publishable_ keys go in apikey only
  let res, out;
  try {
    res = await fetch(`${url}/rest/v1/rpc/pay_webhook`, { method: 'POST', headers, body: JSON.stringify({ p_body: body, p_sig: sig }) });
    out = await res.text();
  } catch (e) {
    console.log('pay webhook: database unreachable');
    return text('upstream error', 502);                          // Lemon Squeezy retries
  }
  if (res.ok) {
    let r = out; try { r = JSON.parse(out); } catch (e) {}
    console.log('pay webhook:', String(request.headers.get('x-event-name') || 'unknown').replace(/[^\w.:-]/g, '').slice(0, 60), '→', String(r).slice(0, 120));
    return text('ok', 200);
  }
  let msg = ''; try { msg = String(JSON.parse(out).message || ''); } catch (e) {}
  console.log('pay webhook failed:', res.status, msg.slice(0, 80));
  if (/bad signature/.test(msg)) return text('bad signature', 401);
  if (/bad json|bad body/.test(msg)) return text('bad request', 400);
  return text('not ready', 500);                                  // 'not configured', function missing, DB error → retry later
}

