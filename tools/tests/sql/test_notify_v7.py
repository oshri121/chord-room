"""Owner SMS alerts (supabase/schema.sql block [notify-v7] = supabase/notify_v7.sql, owner guide NOTIFY.md): every event lands in
private.notify_log with a category and a state; level per category (0 off, 1 summary, 2 now, 3 now even at night), quiet hours,
caps; pg_net is stubbed here (net.http_post records the call, net._http_response holds the answers) so the signed payload the
Cloudflare Function checks is verified byte for byte; owner-only RPCs; the anon edge RPC (HMAC, stale, throttle); the hourly tick
(delivery check + retry, anomalies, summary); nothing here can break the action that caused it."""
import os, sys, json, hmac, hashlib, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg

D = pg.Db('notifydb', assistant=True)
check, as_, sql = D.check, D.as_, D.sql
V7 = os.path.join(pg.REPO, 'supabase', 'notify_v7.sql')
Z = lambda w: (lambda o: o.strip() == w)

O = '00000000-0000-0000-0000-0000000000f0'   # owner (first account)
A = '00000000-0000-0000-0000-0000000000a0'   # admin
U = '00000000-0000-0000-0000-0000000000d1'   # plain user
for uid, mail, un in [(O, 'o@x', 'owner'), (A, 'a@x', 'adminA'), (U, 'u1@x', 'userone')]:
    D.user(uid, mail, un)
sql(f"update public.profiles set role='admin' where id='{A}'")

D.section('files')
sch = open(pg.SCHEMA, encoding='utf-8').read(); v7 = open(V7, encoding='utf-8').read()
b = sch.index('-- [notify-v7:begin]'); e = sch.index('-- [notify-v7:end]') + len('-- [notify-v7:end]')
check('notify_v7.sql = the [notify-v7] block of schema.sql', str(sch[b:e].strip() == v7.strip()), 'True')
# login v8 comes after it: it only adds its own objects (supabase/login_v8.sql)
check('it is the last block of schema.sql (only [login-v8] after it)', str(sch[e:].strip() == '' or (sch[e:].strip().startswith('-- [login-v8:begin]') and sch.rstrip().endswith('-- [login-v8:end]'))), 'True')
for i in range(2):
    check(f'notify_v7.sql runs again ({i + 1})', str(pg.errs(D.file(V7))), '[]')

# pg_net stub: records every request; answers are written by the test into net._http_response
sql("""create schema if not exists net;
create table if not exists net.calls (id bigserial primary key, url text, body jsonb, headers jsonb);
create table if not exists net._http_response (id bigint primary key, status_code int);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $$ insert into net.calls (url, body, headers) values (url, body, headers) returning id $$;""")
SECRET = sql("select value from private.settings where key='notify_secret'")
check('a 64-hex secret was created', SECRET, lambda o: len(o) == 64 and all(c in '0123456789abcdef' for c in o))

def last(cat=None):
    w = f"where cat='{cat}'" if cat else ''
    return sql(f"select state || ' | ' || msg from private.notify_log {w} order by id desc limit 1")
def calls(): return int(sql("select count(*) from net.calls"))
def save(u, p): return as_(u, f"select public.owner_notify_save($j${json.dumps(p)}$j$)")
BASE = {'on': True, 'quiet': {'on': False}, 'digest': {'on': False, 'hour': 9}, 'cap_day': 25, 'cap_hour': 8}

D.section('owner only')
check('owner reads the status', as_(O, "select public.owner_notify_status()->'ready'"), lambda o: '"net": true' in o and '"secret": true' in o)
check('admin cannot', as_(A, "select public.owner_notify_status()"), 'not allowed')
check('user cannot', as_(U, "select public.owner_notify_status()"), 'not allowed')
check('anon cannot', as_(None, "select public.owner_notify_status()"), 'denied')
check('admin cannot save', save(A, BASE), 'not allowed')
check('admin cannot send', as_(A, "select public.owner_notify_send('test')"), 'not allowed')
check('user cannot read the log', as_(U, "select count(*) from private.notify_log"), 'denied')
check('user cannot call private.notify', as_(U, "select private.notify('test','x',true)"), 'denied')
check('bad level refused', save(O, {**BASE, 'cats': {'pay': 7}}), 'bad prefs: cats.pay')
check('unknown category refused', save(O, {**BASE, 'cats': {'hack': 2}}), 'bad prefs: cats.hack')
check('a non-https / other path url refused', save(O, {**BASE, 'url': 'http://evil.example/x'}), 'bad prefs: url')
check('owner sets another site address', save(O, {**BASE, 'url': 'https://example.pages.dev/api/notify'}), lambda o: 'example.pages.dev' in o)
check('… a later save without url keeps it', save(O, BASE), lambda o: 'example.pages.dev' in o)
save(O, {**BASE, 'url': 'https://chord-room.com/api/notify'})
check('owner saves', save(O, BASE), lambda o: '"cap_day": 25' in o)
check('caps clamped (cap_day ≤ 60)', save(O, {**BASE, 'cap_day': 999}), lambda o: '"cap_day": 60' in o)
save(O, BASE)
check('saving is logged (adm_notify)', sql(f"select count(*) from public.activity where action='adm_notify' and user_id='{O}'"), Z('6'))

D.section('events → log → SMS')
n0 = calls()
as_(A, "select public.log_activity('sign_in', null)")
check('admin sign-in → staff_login, sent now', last('staff_login'), lambda o: o.startswith('sent |') and 'adminA' in o)
check('… one request to /api/notify', str(calls() - n0), '1')
c = json.loads(sql("select json_build_object('url', url, 'body', body, 'headers', headers) from net.calls order by id desc limit 1"))
check('… to the default url', c['url'], 'https://chord-room.com/api/notify')
msg = c['body']['msg']
want = hmac.new(SECRET.encode(), (c['body']['t'] + '\n' + c['body']['id'] + '\n' + msg).encode('utf-8'), hashlib.sha256).hexdigest()
check('… x-cr-sig = HMAC(secret, t\\nid\\nmsg) (what functions/api/notify.js checks)', str(c['headers'].get('x-cr-sig') == want), 'True')
check('… t is now', str(abs(int(c['body']['t']) - time.time()) < 120), 'True')
n0 = calls(); as_(U, "select public.log_activity('sign_in', null)")
check('a plain user signing in → nothing', str(calls() - n0) + ' ' + last('staff_login'), lambda o: o.startswith('0 ') and 'userone' not in o)
check('a new account → signup, summary only', last('signup'), lambda o: o.startswith('digest |') and 'userone' in o)

def pay(key, ev, res, uid=U, amount='29.00', test=False):
    sql(f"""insert into public.pay_events (key, event, user_id, test, result, payload) values ('{key}', '{ev}', {f"'{uid}'" if uid else 'null'}, {str(test).lower()}, null,
        '{{"resource": {{"amount": {{"total": "{amount}", "currency": "ILS"}}}}}}'::jsonb)""")
    sql(f"update public.pay_events set result = $r${res}$r$ where key = '{key}'")
pay('pp:1', 'PAYMENT.SALE.COMPLETED', 'paid, plan pro, +150')
check('payment → pay, sent, with the amount', last('pay'), lambda o: o.startswith('sent |') and '29.00 ILS' in o and 'userone' in o)
pay('pp:2', 'BILLING.SUBSCRIPTION.ACTIVATED', 'active, plan pro')
check('subscription activated', last('pay'), lambda o: 'מנוי פעיל' in o)
pay('pp:3', 'BILLING.SUBSCRIPTION.CANCELLED', 'cancelled')
check('subscription cancelled', last('pay'), lambda o: 'מנוי בוטל' in o)
pay('pp:4', 'PAYMENT.SALE.REFUNDED', 'refunded, -150')
check('refund → refund (level 3)', sql("select lvl || ' ' || state from private.notify_log where cat='refund' order by id desc limit 1"), Z('3 sent'))
pay('pp:5', 'PAYMENT.SALE.COMPLETED', 'no user', uid=None)
check('unmatched payment → payissue', last('payissue'), lambda o: o.startswith('sent |'))
pay('pp:6', 'PAYMENT.SALE.COMPLETED', 'paid, plan pro, +150', test=True)
check('sandbox payment is marked', last('pay'), lambda o: '[בדיקה]' in o)
n0 = int(sql("select count(*) from private.notify_log"))
pay('pp:7', 'PAYMENT.SALE.COMPLETED', 'duplicate')
check('a duplicate delivery → no alert', sql("select count(*) from private.notify_log"), Z(str(n0)))

q1 = "select count(*) from private.notify_log where cat='security' and msg like 'תפקיד שונה ישירות%'"
q2 = "select count(*) from private.notify_log where cat='security' and msg like 'שינוי תפקיד%'"
a1, a2 = int(sql(q1)), int(sql(q2))
sql(f"update public.profiles set role='user' where id='{A}'"); sql(f"update public.profiles set role='admin' where id='{A}'")
check('role changed directly in the database → security (×2)', str(int(sql(q1)) - a1), '2')
check('… and the audit row (adm_role) too', str(int(sql(q2)) - a2), '2')
as_(O, "select 1"); sql(f"insert into public.activity (user_id, action, detail) values ('{U}', 'adm_credits', 'by {O}: grant 50 → 70')")
check('points granted → admin, actor shown by name', last('admin'), lambda o: 'ל-userone: owner' in o and O not in o)
sql(f"insert into public.activity (user_id, action, detail) values ('{O}', 'adm_config', 'by {O}: billing[plans]')")
check('plans changed → security', last('security'), lambda o: 'הגדרות האתר שונו' in o)
sql(f"insert into public.reviews (user_id, rating, body) values ('{U}', 5, 'great')")
check('new review → review, summary only', last('review'), lambda o: o.startswith('digest |'))
for i in range(3): sql("insert into private.role_pw_fail default values")
check('3 wrong role passwords → security', last('security'), lambda o: 'סיסמת התפקידים' in o and ' 3 ' in o)
sql("delete from private.role_pw_fail")
sql(f"insert into auth.mfa_factors (user_id, status) values ('{A}', 'unverified')")
sql(f"update auth.mfa_factors set status='verified' where user_id='{A}'")
check('2FA turned on for staff → admin', last('admin'), lambda o: 'הופעל' in o)
sql(f"delete from auth.mfa_factors where user_id='{A}'")
check('2FA removed from staff → security', last('security'), lambda o: 'הוסר' in o and 'adminA' in o)
sql(f"update auth.users set email='new@x' where id='{A}'")
check('staff e-mail changed → security', last('security'), lambda o: 'כתובת המייל' in o)
n0 = int(sql("select count(*) from private.notify_log")); sql(f"update auth.users set email='u1b@x' where id='{U}'")
check('a plain user changing e-mail → nothing', sql("select count(*) from private.notify_log"), Z(str(n0)))
sql("insert into public.account_deletions (how, subject_hash) values ('dashboard', repeat('a', 64))")
check('deleted from the dashboard → security', last('security'), lambda o: 'Supabase' in o)

D.section('levels, quiet hours, caps')
save(O, {**BASE, 'cats': {'pay': 0}})
pay('pp:8', 'PAYMENT.SALE.COMPLETED', 'paid, plan pro, +150')
check('level 0 → logged only (off)', last('pay'), lambda o: o.startswith('off |'))
save(O, {**BASE, 'cats': {'pay': 1}})
pay('pp:9', 'PAYMENT.SALE.COMPLETED', 'paid, plan pro, +150')
check('level 1 → summary', last('pay'), lambda o: o.startswith('digest |'))
h = int(sql("select extract(hour from now() at time zone 'Asia/Jerusalem')::int"))
save(O, {**BASE, 'quiet': {'on': True, 'from': h, 'to': (h + 1) % 24}})
pay('pp:10', 'PAYMENT.SALE.COMPLETED', 'paid, plan pro, +150')
check('quiet hours: level 2 held', last('pay'), lambda o: o.startswith('quiet |'))
pay('pp:11', 'PAYMENT.SALE.REFUNDED', 'refunded, -150')
check('quiet hours: level 3 still sent', last('refund'), lambda o: o.startswith('sent |'))
save(O, {**BASE, 'cap_hour': 1})
pay('pp:12', 'PAYMENT.SALE.COMPLETED', 'paid, plan pro, +150')
check('hourly cap reached → capped', last('pay'), lambda o: o.startswith('capped |'))
pay('pp:13', 'PAYMENT.SALE.REFUNDED', 'refunded, -150')
check('level 3 skips the hourly cap', last('refund'), lambda o: o.startswith('sent |'))
save(O, {**BASE, 'cap_day': 1})
pay('pp:14', 'PAYMENT.SALE.REFUNDED', 'refunded, -150')
check('the daily cap holds level 3 too', last('refund'), lambda o: o.startswith('capped |'))
save(O, {**BASE, 'on': False})
pay('pp:15', 'PAYMENT.SALE.COMPLETED', 'paid, plan pro, +150')
check('master switch off → summary only', last('pay'), lambda o: o.startswith('digest |'))
save(O, BASE)
sql("update private.settings set value='{not json' where key='notify_prefs'")
check('broken prefs → defaults, still works', sql("select private.notify('pay','x')") + ' ' + last('pay'), lambda o: '| x' in o)
save(O, BASE)

D.section('owner: test SMS and summary now')
check('test SMS → sent (level 3)', as_(O, "select public.owner_notify_send('test')"), lambda o: '"state": "sent"' in o)
r = as_(O, "select public.owner_notify_send('digest')")
check('summary now → sent, with the numbers', r, lambda o: '"state": "sent"' in o and 'סיכום' in o and 'תשלומים' in o)
check('bad kind refused', as_(O, "select public.owner_notify_send('x')"), 'bad what')
for i in range(5): as_(O, "select public.owner_notify_send('test')")
check('at most 6 an hour (SMS bill)', as_(O, "select public.owner_notify_send('test')"), 'too many')
check('status: today + log', as_(O, "select (public.owner_notify_status()->'today'->>'sent')::int > 0 and jsonb_array_length(public.owner_notify_status()->'log') > 10"), Z('t'))

D.section('edge events (anon RPC, HMAC)')
def edge(body, sig=None):
    s = sig or hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
    return as_(None, f"select public.notify_edge($b${body}$b$, '{s}')")
now = int(time.time())
check('forged signature → bad', edge(json.dumps({'t': now, 'kind': 'probe', 'n': 3}), '0' * 64), Z('bad'))
check('unknown kind → bad', edge(json.dumps({'t': now, 'kind': 'nope'})), Z('bad'))
check('old timestamp → stale', edge(json.dumps({'t': now - 3600, 'kind': 'probe'})), Z('stale'))
check('signed probe → ok', edge(json.dumps({'t': now, 'kind': 'probe', 'n': 4, 'path': '/supabase/schema.sql<script>'})), Z('ok'))
check('… logged as probe (summary by default), path cleaned', last('probe'), lambda o: o.startswith('digest |') and '[probe]' in o and '/supabase/schema.sql' in o and '<' not in o)
check('the same kind again within 30 min → throttled', edge(json.dumps({'t': now, 'kind': 'probe', 'n': 9})), Z('throttled'))
check('another kind → ok', edge(json.dumps({'t': now, 'kind': 'relay'})), Z('ok'))
check('… relay mismatch = edge (sent now, or held by today\'s cap used up above)', last('edge'), lambda o: o.split(' |')[0] in ('sent', 'capped') and '[relay]' in o)
check('anon-callable definer fns = allow-list (+ notify_edge)',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      Z('catalog_play,is_admin,login_email,notify_edge,pay_webhook,pay_webhook_paypal,reviews_public,username_available'))

D.section('hourly tick: deliveries, anomalies')
sql("insert into net._http_response (id, status_code) select req, 200 from private.notify_log where state='sent' and cat='staff_login' on conflict do nothing")
sql("insert into net._http_response (id, status_code) select req, 500 from private.notify_log where state='sent' and cat='payissue' on conflict do nothing")
sql("select private.notify_tick()")
check('200 → ok', sql("select state from private.notify_log where cat='staff_login' order by id limit 1"), Z('ok'))
check('500 → retried once (new request)', sql("select state || ' ' || tries from private.notify_log where cat='payissue' order by id limit 1"), Z('sent 2'))
sql("insert into net._http_response (id, status_code) select req, 500 from private.notify_log where cat='payissue' on conflict (id) do update set status_code=500")
sql("select private.notify_tick()")
check('still failing → fail', sql("select state from private.notify_log where cat='payissue' order by id limit 1"), Z('fail'))
for i in range(30): D.user(f'00000000-0000-0000-0000-0000000001{i:02d}', f'w{i}@x', f'wave{i:02d}x')
sql("select private.notify_tick()")
check('30 sign-ups in an hour → anomaly', last('anomaly'), lambda o: 'גל הרשמות' in o)
sql("select private.notify_tick()")
check('… only once a day', sql("select count(*) from private.notify_log where cat='anomaly' and msg like 'גל הרשמות%'"), Z('1'))
check('the tick never throws', sql("select coalesce(private.notify_tick(), 'none')"), lambda o: 'ERROR' not in o)

D.section('without pg_net')
sql("delete from private.notify_log where state in ('sent', 'ok', 'fail')")   # today's cap is used up by the tests above
sql("drop function net.http_post(text, jsonb, jsonb, jsonb, integer)")
as_(A, "select public.log_activity('sign_in', null)")
check('no pg_net → nonet (still in the log)', last('staff_login'), lambda o: o.startswith('nonet |'))
check('status shows net=false', as_(O, "select public.owner_notify_status()->'ready'->>'net'"), Z('false'))
check('the action itself still worked', sql(f"select count(*) from public.activity where user_id='{A}' and action='sign_in'"), Z('2'))

D.finish()
