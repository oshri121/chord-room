// Shared helpers for the PayPal Functions (no route: this file exports no onRequest handler).
// Configuration = Cloudflare Pages environment variables (Settings → Environment variables), never the repo:
//   PAYPAL_ENV            'live' or 'sandbox' (default sandbox)
//   PAYPAL_CLIENT_ID      REST app client id
//   PAYPAL_CLIENT_SECRET  REST app secret            (encrypt)
//   PAYPAL_WEBHOOK_ID     id of the webhook that points at /api/pay/paypal
//   PAYPAL_RELAY_SECRET   shared with the database (private.settings 'paypal_relay_secret')   (encrypt)
// See PAYMENTS.md.
export const SUPABASE_URL = 'https://ydyocusfrghsokjsectw.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_L7IuhkaBoV5BZNuX7ixmjw_3F3KdKdI';

export const ppEnv = env => (String((env && env.PAYPAL_ENV) || '').toLowerCase() === 'live' ? 'live' : 'sandbox');
export const ppBase = env => (ppEnv(env) === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com');
export const sbUrl = env => String((env && env.SUPABASE_URL) || SUPABASE_URL).replace(/\/+$/, '');
export const sbKey = env => String((env && (env.SUPABASE_ANON_KEY || env.SUPABASE_KEY)) || SUPABASE_KEY);

export const json = (obj, status) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

export async function withTimeout(ms, fn) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { return await fn(ac.signal); } finally { clearTimeout(t); }
}

// OAuth access token (client credentials), cached per isolate until a minute before it expires
let TOK = null;
export async function ppToken(env) {
  const id = env && env.PAYPAL_CLIENT_ID, secret = env && env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('not configured');
  const key = ppEnv(env) + ':' + id;
  if (TOK && TOK.key === key && TOK.exp > Date.now()) return TOK.token;
  const r = await withTimeout(10000, signal => fetch(`${ppBase(env)}/v1/oauth2/token`, {
    method: 'POST', signal,
    headers: { authorization: 'Basic ' + btoa(`${id}:${secret}`), 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: 'grant_type=client_credentials'
  }));
  if (!r.ok) throw new Error('paypal auth ' + r.status);
  const o = await r.json();
  if (!o || typeof o.access_token !== 'string') throw new Error('paypal auth');
  TOK = { key, token: o.access_token, exp: Date.now() + Math.max(0, (+o.expires_in || 0) - 60) * 1000 };
  return TOK.token;
}

export async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function readCapped(request, max) {
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
