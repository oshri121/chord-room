"""Sign in with the username (supabase/schema.sql block [login-v8] = supabase/login_v8.sql): public.login_email(user, password)
gives the account's e-mail ONLY with the right password (bcrypt like auth.users), any case / a leading '@'; wrong password,
unknown name, bad input and accounts without a password all answer 'no' without the e-mail; 5 wrong tries per account in
15 min → 'locked' (even with the right password; a success clears the count), 20 per network → 'busy' (other networks
unaffected), 300 site-wide → 'busy'; rows older than a day are purged; a locked staff account and the site-wide ceiling
raise owner alerts (notify v7); the failure table is closed to the API roles; anon allow-list = + login_email."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg

D = pg.Db('logindb', assistant=True)
check, as_, sql = D.check, D.as_, D.sql
V8 = os.path.join(pg.REPO, 'supabase', 'login_v8.sql')
Z = lambda w: (lambda o: o.strip() == w)
lit = lambda s: "'" + str(s).replace("'", "''") + "'"

O = '00000000-0000-0000-0000-0000000000f0'   # owner (first account)
A = '00000000-0000-0000-0000-0000000000a0'   # admin
U = '00000000-0000-0000-0000-0000000000d1'   # plain user
N = '00000000-0000-0000-0000-0000000000d2'   # no password (code / SMS only)
for uid, mail, un in [(O, 'o@x.com', 'owner'), (A, 'a@x.com', 'adminA'), (U, 'dana@x.com', 'Dana_Beats'), (N, 'nopw@x.com', 'nopass')]:
    D.user(uid, mail, un)
sql(f"update public.profiles set role='admin' where id='{A}'")
for uid, pw in [(O, 'Owner-Pass1'), (A, 'Admin-Pass1'), (U, 'Dana-Pass1')]:
    sql(f"update auth.users set encrypted_password = extensions.crypt({lit(pw)}, extensions.gen_salt('bf', 4)) where id='{uid}'")

def login(user, pw, ip=None):
    pre = f"set request.headers={lit(json.dumps({'cf-connecting-ip': ip}))};" if ip else ''
    return as_(None, pre + f"select public.login_email({lit(user) if user is not None else 'null'}, {lit(pw) if pw is not None else 'null'})")
fails = lambda where='true': sql(f"select count(*) from private.login_fail where {where}")
reset = lambda: sql("delete from private.login_fail")

D.section('files')
sch = open(pg.SCHEMA, encoding='utf-8').read(); v8 = open(V8, encoding='utf-8').read()
b = sch.index('-- [login-v8:begin]'); e = sch.index('-- [login-v8:end]') + len('-- [login-v8:end]')
check('login_v8.sql = the [login-v8] block of schema.sql', str(sch[b:e].strip() == v8.strip()), 'True')
check('it is the last block of schema.sql', str(sch[e:].strip() == ''), 'True')
check('…right after [notify-v7]', str(sch[:b].rstrip().endswith('-- [notify-v7:end]')), 'True')
for i in range(2):
    check(f'login_v8.sql runs again ({i + 1})', str(pg.errs(D.file(V8))), '[]')

D.section('the e-mail only with the right password')
check('username + right password → the e-mail', login('Dana_Beats', 'Dana-Pass1'), lambda o: '"ok": true' in o and '"email": "dana@x.com"' in o)
check('any case + a leading @ + spaces', login('  @dana_beats ', 'Dana-Pass1'), lambda o: '"email": "dana@x.com"' in o)
check('wrong password → no, no e-mail', login('dana_beats', 'Dana-Pass2'), lambda o: '"why": "no"' in o and '@' not in o)
check('unknown username → no (same answer)', login('ghost_user', 'Dana-Pass1'), lambda o: '"why": "no"' in o and '@' not in o)
check('account without a password → no', login('nopass', ''), lambda o: '"why": "no"' in o)
check('…nor with any text', login('nopass', 'x'), lambda o: '"why": "no"' in o and '@' not in o)
check('an e-mail is not a username', login('dana@x.com', 'Dana-Pass1'), lambda o: '"why": "no"' in o)
check('null password → no', login('dana_beats', None), lambda o: '"why": "no"' in o)
check('null user → no', login(None, 'Dana-Pass1'), lambda o: '"why": "no"' in o)
check('a 201-char password is refused before bcrypt', login('dana_beats', 'x' * 201), lambda o: '"why": "no"' in o)
check('SQL-ish input is just a bad name', login("x' or '1'='1", 'Dana-Pass1'), lambda o: '"why": "no"' in o)
check('bad input is not counted', fails(), Z('3'))   # wrong password, ghost_user, nopass+x
check('signed-in callers may use it too', as_(U, "select public.login_email('adminA', 'Admin-Pass1')->>'email'"), Z('a@x.com'))

D.section('per account: 5 wrong tries → locked')
reset()
for i in range(4): login('dana_beats', f'wrong-{i}')
check('4 wrong, then right → ok', login('dana_beats', 'Dana-Pass1'), lambda o: '"ok": true' in o)
check('…and the success cleared the count', fails(f"uid='{U}'"), Z('0'))
for i in range(5): login('dana_beats', f'wrong-{i}')
check('after 5 wrong → locked', login('dana_beats', 'wrong-x'), lambda o: '"why": "locked"' in o)
check('locked even with the right password', login('dana_beats', 'Dana-Pass1'), lambda o: '"why": "locked"' in o and '@' not in o)
check('a locked try is not counted again', fails(f"uid='{U}'"), Z('5'))
check('other accounts are not locked', login('adminA', 'Admin-Pass1'), lambda o: '"ok": true' in o)
sql(f"update private.login_fail set at = now() - interval '16 minutes' where uid='{U}'")
check('15 minutes later → open again', login('dana_beats', 'Dana-Pass1'), lambda o: '"ok": true' in o)

D.section('per network and site-wide')
reset()
for i in range(20): login(f'ghost{i:02d}', 'x', ip='203.0.113.7')
check('20 failures from one network', fails("ip_key is not null"), Z('20'))
check('… → busy for that network (right password too)', login('dana_beats', 'Dana-Pass1', ip='203.0.113.7'), lambda o: '"why": "busy"' in o)
check('another network is fine', login('dana_beats', 'Dana-Pass1', ip='198.51.100.9'), lambda o: '"ok": true' in o)
check('the IP is stored only as a salted hash', sql("select count(*) from private.login_fail where ip_key !~ '^[0-9a-f]{64}$' or ip_key like '%203.0%'"), Z('0'))
reset()
sql("insert into private.login_fail (at) select now() from generate_series(1, 300)")
check('300 failures site-wide → busy for everyone', login('dana_beats', 'Dana-Pass1', ip='198.51.100.10'), lambda o: '"why": "busy"' in o)
sql("update private.login_fail set at = now() - interval '2 days'")
check('rows older than a day are purged on the next call', login('dana_beats', 'Dana-Pass1') + ' ' + fails(), lambda o: '"ok": true' in o and o.endswith(' 0'))

D.section('owner alerts (notify v7)')
reset()
alerts = lambda: sql("select count(*) from private.notify_log where cat='security' and msg like '%שם משתמש ננעלה%'")
for i in range(6): login('dana_beats', f'wrong-{i}')
check('a plain user locked → no alert', alerts(), Z('0'))
for i in range(6): login('adminA', f'wrong-{i}')
check('a staff account locked → one security alert', alerts(), Z('1'))
check('…naming the account, not its e-mail', sql("select msg from private.notify_log where cat='security' order by id desc limit 1"), lambda o: 'adminA' in o and '@' not in o)
reset()
sql("insert into private.login_fail (at) select now() from generate_series(1, 299)")
login('ghost_x', 'x')
check('site-wide ceiling reached → one anomaly alert', sql("select count(*) from private.notify_log where cat='anomaly' and msg like '%שם משתמש%'"), Z('1'))
reset()

D.section('privileges')
check('anon cannot read the failures', as_(None, "select count(*) from private.login_fail"), 'denied')
check('a user cannot read the failures', as_(U, "select count(*) from private.login_fail"), 'denied')
check('a user cannot delete the failures', as_(U, "delete from private.login_fail"), 'denied')
check('login_email pins search_path', sql("select count(*) from pg_proc where proname='login_email' and prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')"), Z('1'))
check('anon-callable definer fns = allow-list (+ login_email)',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      Z('catalog_play,is_admin,login_email,notify_edge,pay_webhook,pay_webhook_paypal,reviews_public,username_available'))
check('schema.sql re-run keeps it working', str(pg.errs(D.file(pg.SCHEMA))) + ' ' + login('dana_beats', 'Dana-Pass1'), lambda o: o.startswith('[]') and '"ok": true' in o)

D.finish()
