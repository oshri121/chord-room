#!/usr/bin/env python3
"""One-time PayPal setup for Chord Room (run it yourself in a terminal; the secret never leaves your machine).

    python3 tools/paypal/setup.py            # sandbox (testing)
    python3 tools/paypal/setup.py --live     # real payments

It asks for the REST app's Client ID and Secret (or reads PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET), then, idempotently:
  1. finds or creates the product "Chord Room subscription";
  2. for every paid plan in the site's settings (price in ILS, monthly) finds or creates a PayPal billing plan;
  3. finds or creates the webhook https://chord-room.com/api/pay/paypal with the events the site handles;
and prints what to paste where (admin Billing → PayPal plan ID, Cloudflare variables, Supabase relay secret).
Standard library only (Python 3.8+). See PAYMENTS.md.
"""
import base64, getpass, json, os, secrets, sys, urllib.error, urllib.request

SUPABASE_URL = 'https://ydyocusfrghsokjsectw.supabase.co'
SUPABASE_KEY = 'sb_publishable_L7IuhkaBoV5BZNuX7ixmjw_3F3KdKdI'       # public key (same as config.js)
SITE = os.environ.get('CR_SITE', 'https://chord-room.com').rstrip('/')
PRODUCT_NAME = 'Chord Room subscription'
EVENTS = ['BILLING.SUBSCRIPTION.ACTIVATED', 'BILLING.SUBSCRIPTION.UPDATED', 'BILLING.SUBSCRIPTION.RE-ACTIVATED',
          'BILLING.SUBSCRIPTION.CANCELLED', 'BILLING.SUBSCRIPTION.SUSPENDED', 'BILLING.SUBSCRIPTION.EXPIRED',
          'BILLING.SUBSCRIPTION.PAYMENT.FAILED', 'PAYMENT.SALE.COMPLETED', 'PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED']
DEFAULT_PLANS = [{'id': 'basic', 'price': 29}, {'id': 'pro', 'price': 59}, {'id': 'studio', 'price': 99}]

LIVE = '--live' in sys.argv
API = 'https://api-m.paypal.com' if LIVE else 'https://api-m.sandbox.paypal.com'


def http(method, url, body=None, headers=None):
    data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        txt = e.read().decode(errors='replace')
        sys.exit(f'\n✗ {method} {url} → {e.code}\n{txt[:800]}')


def main():
    print(f'PayPal setup — {"LIVE (real money)" if LIVE else "SANDBOX (testing)"}\n')
    cid = os.environ.get('PAYPAL_CLIENT_ID') or input('Client ID: ').strip()
    sec = os.environ.get('PAYPAL_CLIENT_SECRET') or getpass.getpass('Secret (hidden): ').strip()
    if not cid or not sec:
        sys.exit('Client ID and Secret are required.')

    tok = http('POST', API + '/v1/oauth2/token', b'grant_type=client_credentials', {
        'Authorization': 'Basic ' + base64.b64encode(f'{cid}:{sec}'.encode()).decode(),
        'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'})['access_token']
    H = {'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json', 'Accept': 'application/json'}

    # the plans and prices the site shows (admin settings), or the built-in defaults
    plans = DEFAULT_PLANS
    try:
        rows = http('GET', SUPABASE_URL + '/rest/v1/site_config?id=eq.1&select=billing', headers={'apikey': SUPABASE_KEY, 'Accept': 'application/json'})
        bp = (rows[0].get('billing') or {}).get('plans') if rows else None
        if isinstance(bp, list) and bp:
            plans = [p for p in bp if isinstance(p, dict) and p.get('id') and p.get('id') != 'free' and float(p.get('price') or 0) > 0]
    except Exception:
        pass
    print('Plans:', ', '.join(f"{p['id']} {p['price']} ILS" for p in plans))

    # 1) product
    prods = http('GET', API + '/v1/catalogs/products?page_size=20&total_required=true', headers=H).get('products', [])
    prod = next((p for p in prods if p.get('name') == PRODUCT_NAME), None)
    if not prod:
        prod = http('POST', API + '/v1/catalogs/products', {'name': PRODUCT_NAME, 'type': 'SERVICE', 'category': 'SOFTWARE',
                                                            'description': 'Chord Room monthly plan', 'home_url': SITE}, H)
        print('✓ product created', prod['id'])
    else:
        print('✓ product exists', prod['id'])

    # 2) billing plans (one per site plan + price; a price change makes a new PayPal plan)
    have = http('GET', API + f"/v1/billing/plans?product_id={prod['id']}&page_size=20", headers=H).get('plans', [])
    out = []
    for p in plans:
        price = ('%.2f' % float(p['price'])).rstrip('0').rstrip('.')
        name = f"Chord Room {p['id']} {price} ILS"
        pl = next((x for x in have if x.get('name') == name and x.get('status') == 'ACTIVE'), None)
        if not pl:
            pl = http('POST', API + '/v1/billing/plans', {
                'product_id': prod['id'], 'name': name, 'status': 'ACTIVE',
                'description': f"Chord Room {p['id']} — monthly",
                'billing_cycles': [{'frequency': {'interval_unit': 'MONTH', 'interval_count': 1}, 'tenure_type': 'REGULAR',
                                    'sequence': 1, 'total_cycles': 0,
                                    'pricing_scheme': {'fixed_price': {'value': price, 'currency_code': 'ILS'}}}],
                'payment_preferences': {'auto_bill_outstanding': True, 'payment_failure_threshold': 2}}, H)
            print(f"✓ plan created  {p['id']:8} {pl['id']}")
        else:
            print(f"✓ plan exists   {p['id']:8} {pl['id']}")
        out.append((p['id'], pl['id']))

    # 3) webhook
    url = SITE + '/api/pay/paypal'
    hooks = http('GET', API + '/v1/notifications/webhooks', headers=H).get('webhooks', [])
    wh = next((w for w in hooks if w.get('url') == url), None)
    if not wh:
        wh = http('POST', API + '/v1/notifications/webhooks', {'url': url, 'event_types': [{'name': e} for e in EVENTS]}, H)
        print('✓ webhook created', wh['id'])
    else:
        missing = sorted(set(EVENTS) - {e.get('name') for e in wh.get('event_types', [])})
        if missing:
            http('PATCH', API + f"/v1/notifications/webhooks/{wh['id']}",
                 [{'op': 'replace', 'path': '/event_types', 'value': [{'name': e} for e in EVENTS]}], H)
            print('✓ webhook updated (events added)', wh['id'])
        else:
            print('✓ webhook exists', wh['id'])

    relay = secrets.token_urlsafe(32)
    print('\n' + '=' * 70)
    print('1) Site → ניהול → נקודות ותשלומים → "מזהה תוכנית PayPal" for each plan:')
    for pid, ppid in out:
        print(f'     {pid:8} {ppid}')
    print('\n2) Cloudflare Pages → chord-room → Settings → Variables and Secrets (Production):')
    print(f"     PAYPAL_ENV            {'live' if LIVE else 'sandbox'}")
    print(f'     PAYPAL_CLIENT_ID      {cid}')
    print('     PAYPAL_CLIENT_SECRET  (the secret you typed above)          → type: Secret')
    print(f"     PAYPAL_WEBHOOK_ID     {wh['id']}")
    print(f'     PAYPAL_RELAY_SECRET   {relay}   → type: Secret')
    print('\n3) Supabase → SQL Editor (the SAME relay secret):')
    print(f"     insert into private.settings (key, value) values ('paypal_relay_secret', '{relay}') "
          "on conflict (key) do update set value = excluded.value;")
    print('\n(If you already set a relay secret earlier, you may keep the old one — it just has to match in both places.)')
    print('=' * 70)


if __name__ == '__main__':
    main()
