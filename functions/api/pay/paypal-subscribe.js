// Cloudflare Pages Function: start a PayPal subscription for the signed-in user.
// POST {plan:'pro'} with Authorization: Bearer <Supabase access token>  →  {url: PayPal approve link}
// The PayPal plan id comes from site_config.billing.plans[].variant (P-…), never from the browser, and custom_id is
// the user id checked with Supabase Auth, so the webhook (pay_webhook_paypal) knows whose account to fill.
import { ppBase, ppToken, sbUrl, sbKey, json, withTimeout } from './paypal-lib.js';

const PLAN_RE = /^P-[A-Z0-9]{10,40}$/;
const LIVE = ['active', 'on_trial', 'past_due', 'paused'];
// upstream failures answer 424, not 502: Cloudflare swaps a 502 for its own HTML page and the browser loses the error code
const FAIL = 424;

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { allow: 'POST' } });
  if (!env || !env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return json({ error: 'not_configured' }, 503);
  const m = /^Bearer\s+([\w.-]{20,4096})$/.exec(request.headers.get('authorization') || '');
  if (!m) return json({ error: 'auth' }, 401);
  const token = m[1], url = sbUrl(env), key = sbKey(env);
  let planId = '';
  try { const b = await request.json(); planId = String((b && b.plan) || ''); } catch (e) {}
  if (!/^[a-z][a-z0-9_]{1,23}$/.test(planId) || planId === 'free') return json({ error: 'bad_plan' }, 400);

  const sb = (path) => withTimeout(8000, signal => fetch(`${url}${path}`, { signal, headers: { apikey: key, authorization: `Bearer ${token}`, accept: 'application/json' } }));
  let user, plan, prof;
  try {
    const r = await sb('/auth/v1/user');
    if (r.status === 401 || r.status === 403) return json({ error: 'auth' }, 401);
    if (!r.ok) return json({ error: 'auth_unavailable' }, FAIL);
    user = await r.json();
    if (!user || typeof user.id !== 'string' || !user.id) return json({ error: 'auth' }, 401);
    const [rc, rp] = await Promise.all([
      sb('/rest/v1/site_config?id=eq.1&select=billing'),
      sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=pay_status,pay_provider,blocked`)
    ]);
    if (!rc.ok || !rp.ok) return json({ error: 'db_unavailable' }, FAIL);
    const cfg = (await rc.json())[0];
    prof = (await rp.json())[0] || {};
    const plans = cfg && cfg.billing && Array.isArray(cfg.billing.plans) ? cfg.billing.plans : [];
    plan = plans.find(p => p && p.id === planId);
  } catch (e) { return json({ error: 'db_unavailable' }, FAIL); }
  if (!plan || !PLAN_RE.test(String(plan.variant || ''))) return json({ error: 'bad_plan' }, 400);
  if (prof.blocked) return json({ error: 'blocked' }, 403);
  if (LIVE.includes(prof.pay_status)) return json({ error: 'have_sub' }, 409);

  const origin = new URL(request.url).origin;
  const body = {
    plan_id: plan.variant,
    custom_id: user.id,
    application_context: {
      brand_name: 'Chord Room', shipping_preference: 'NO_SHIPPING', user_action: 'SUBSCRIBE_NOW',
      return_url: `${origin}/?paid=1#pricing`, cancel_url: `${origin}/#pricing`
    }
  };
  if (typeof user.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) && user.email.length <= 254) body.subscriber = { email_address: user.email };
  let tok;
  try { tok = await ppToken(env); }
  catch (e) { console.log('paypal subscribe: auth', String(e && e.message || e).slice(0, 80)); return json({ error: 'paypal_auth' }, FAIL); }
  try {
    const r = await withTimeout(15000, signal => fetch(`${ppBase(env)}/v1/billing/subscriptions`, {
      method: 'POST', signal,
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json', accept: 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(body)
    }));
    const o = await r.json().catch(() => null);
    if (!r.ok || !o) { console.log('paypal subscribe: create failed', r.status, String(o && (o.name || o.message) || '').slice(0, 80)); return json({ error: 'paypal' }, FAIL); }
    const link = (o.links || []).find(l => l && l.rel === 'approve');
    if (!link || !/^https:\/\/www\.(sandbox\.)?paypal\.com\//.test(link.href || '')) return json({ error: 'paypal' }, FAIL);
    return json({ url: link.href }, 200);
  } catch (e) {
    console.log('paypal subscribe: unreachable', String(e && e.message || e).slice(0, 80));
    return json({ error: 'paypal' }, FAIL);
  }
}
