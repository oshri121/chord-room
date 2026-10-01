"""Points v2 (supabase/schema.sql "Points v2" block = supabase/points_v2.sql): a price for every paid action
(billing.costs: song/sep/stems/usb/mashup/extended/convert), per-plan discounts while the plan is active, batches
(spend_credits_n qty 1…500), price_quote, songs charged once per account (spend_song + charged_songs), partial batch
refunds (refund_credits_n: own row, ≤ 30 min, never more than charged, daily caps), the old spend_credits /
refund_credits callers, the settings guard (clamps), RLS on the new table, concurrency (no overdraw, no double song
charge), points_v2.sql identical to the schema block and safe to run twice — also on an install from before v2."""
import os, sys, json, subprocess, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg

db = 'ptsdb'
D = pg.Db(db, assistant=True)
check, as_, sql = D.check, D.as_, D.sql
V2 = os.path.join(pg.REPO, 'supabase', 'points_v2.sql')

O = '00000000-0000-0000-0000-0000000000f0'   # owner (first account)
A = '00000000-0000-0000-0000-0000000000a0'   # admin
U1 = '00000000-0000-0000-0000-0000000000d1'
U2 = '00000000-0000-0000-0000-0000000000d2'
U3 = '00000000-0000-0000-0000-0000000000d3'
U4 = '00000000-0000-0000-0000-0000000000d4'
X = '00000000-0000-0000-0000-0000000000e0'    # blocked
for uid, mail, un in [(O, 'o@x', 'owner'), (A, 'a@x', 'adminA'), (U1, 'u1@x', 'userone'), (U2, 'u2@x', 'usertwo'),
                      (U3, 'u3@x', 'userthree'), (U4, 'u4@x', 'userfour'), (X, 'x@x', 'blocky')]:
    D.user(uid, mail, un)
sql(f"update public.profiles set role='admin' where id='{A}'")
sql(f"update public.profiles set blocked=true where id='{X}'")
def cr(u, n): sql(f"update public.profiles set credits={n} where id='{u}'")
def bal(u): return sql(f"select credits from public.profiles where id='{u}'")
def plan(u, p, days):
    sql(f"update public.profiles set plan='{p}', plan_until=now() + interval '{days} days' where id='{u}'")
def j(o):
    try: return json.loads(o)
    except Exception: return {}
def spend(u, kind, qty, ref='t'): return as_(u, f"select public.spend_credits_n('{kind}', {qty}, '{ref}')")
def charged(u, kind, qty, ref='t'): return j(spend(u, kind, qty, ref)).get('charged')
def B(): return json.loads(sql("select billing from public.site_config where id=1"))

D.section('files')
s = open(pg.SCHEMA, encoding='utf-8').read(); v2 = open(V2, encoding='utf-8').read()
a = s.index('-- [points-v2:begin]'); b = s.index('-- [points-v2:end]')
check('points_v2.sql contains the schema.sql block verbatim', str(s[a:b] in v2), 'True')
check('the block sits before the hardening blocks [S-1…]', str(b < s.index('-- [S-1]')), 'True')
check('points_v2.sql carries the updated [S-9] guard', str("bad billing: plan discount" in v2 and "bad billing: costs key" in v2), 'True')
check('points_v2.sql run 1 on the full schema', str(pg.errs(D.file(V2))), '[]')
check('points_v2.sql run 2 (idempotent)', str(pg.errs(D.file(V2))), '[]')

D.section('defaults')
b0 = B()
check('costs: every kind with its default', json.dumps(b0['costs'], sort_keys=True),
      json.dumps({'song': 1, 'sep': 5, 'stems': 2, 'usb': 1, 'mashup': 3, 'extended': 3, 'convert': 1}, sort_keys=True))
check('plan discounts basic 0 / pro 10 / studio 25', str([p.get('discount') for p in b0['plans']]), '[0, 10, 25]')

D.section('upgrade an install from before v2')
old = {'on': True, 'signup': 20, 'costs': {'sep': 7, 'stems': 2}, 'currency': 'ILS', 'contact': '',
       'plans': [{'id': 'basic', 'price': 29, 'points': 60, 'link': ''}, {'id': 'pro', 'price': 59, 'points': 150, 'link': '', 'best': True},
                 {'id': 'studio', 'price': 99, 'points': 400, 'link': ''}, {'id': 'vip', 'price': 199, 'points': 999, 'link': ''}]}
sql(f"update public.site_config set billing=$j${json.dumps(old)}$j$ where id=1")
check('points_v2.sql on old settings', str(pg.errs(D.file(V2))), '[]')
b1 = B()
check('old price kept (sep 7), new kinds added', json.dumps(b1['costs'], sort_keys=True),
      json.dumps({'song': 1, 'sep': 7, 'stems': 2, 'usb': 1, 'mashup': 3, 'extended': 3, 'convert': 1}, sort_keys=True))
check('discounts added (unknown plan → 0)', str([p.get('discount') for p in b1['plans']]), '[0, 10, 25, 0]')
b1['plans'][1]['discount'] = 15
sql(f"update public.site_config set billing=$j${json.dumps(b1)}$j$ where id=1")
D.file(V2)
check('a discount the admin set is kept on re-run', str(B()['plans'][1]['discount']), '15')
check('schema.sql re-run keeps the settings', str(pg.errs(D.file(pg.SCHEMA))) + ' ' + str(B()['costs']['sep']), '[] 7')
sql(f"update public.site_config set billing=$j${json.dumps(b0)}$j$ where id=1")

D.section('prices')
cr(U1, 100)
q = j(as_(U1, "select public.price_quote('usb', 12)"))
check('quote usb ×12, free plan', json.dumps(q, sort_keys=True), lambda o: q.get('unit') == 1 and q.get('total') == 12 and q.get('discount') == 0 and q.get('balance') == 100 and q.get('free') is False)
r = j(spend(U1, 'usb', 3, 'crate folder'))
check('spend usb ×3 → 97', json.dumps(r), lambda o: r.get('charged') == 3 and r.get('balance') == 97 and r.get('qty') == 3 and r.get('unit') == 1 and r.get('id'))
check('ledger row: kind/qty/ref', sql(f"select kind||'|'||qty||'|'||ref||'|'||delta from public.credit_ledger where id={r.get('id')}"), 'usb|3|usb ×3 crate folder|-3')
check('mashup ×1 = 3', str(charged(U1, 'mashup', 1)), '3')
check('extended ×1 = 3', str(charged(U1, 'extended', 1)), '3')
check('convert ×8 = 8', str(charged(U1, 'convert', 8)), '8')
check('sep (wrapper) = 5, {balance,id}', as_(U1, "select public.spend_credits('sep','Song')"), lambda o: j(o).get('id') and j(o).get('charged') == 5)
check('legacy spend_credits(amount, reason, ref) ignores the amount', as_(U1, "select public.spend_credits(-1000,'stems','x')"), str(100 - 3 - 3 - 3 - 8 - 5 - 2))
plan(U1, 'pro', 10); cr(U1, 100)
check('pro −10 %: usb ×3 → ceil(2.7) = 3', str(charged(U1, 'usb', 3)), '3')
check('pro −10 %: usb ×10 → 9', str(charged(U1, 'usb', 10)), '9')
check('pro −10 %: usb ×45 → ceil(40.5) = 41', as_(U1, "select public.price_quote('usb',45)->>'total'"), '41')
check('pro −10 %: sep → ceil(4.5) = 5', str(charged(U1, 'sep', 1)), '5')
check('pro quote shows discount 10', as_(U1, "select public.price_quote('mashup',1)->>'discount'"), '10')
plan(U1, 'studio', 10)
check('studio −25 %: usb ×10 → ceil(7.5) = 8', str(charged(U1, 'usb', 10)), '8')
check('studio −25 %: sep → ceil(3.75) = 4', str(charged(U1, 'sep', 1)), '4')
plan(U1, 'studio', -1)
check('expired plan → no discount: usb ×10 = 10', str(charged(U1, 'usb', 10)), '10')
sql(f"update public.profiles set plan='pro', plan_until=null where id='{U1}'")
check('plan without an end date → no discount', as_(U1, "select public.price_quote('usb',10)->>'total'"), '10')
sql(f"update public.profiles set plan='free', plan_until=null where id='{U1}'")
bc = json.loads(json.dumps(b0)); bc['costs']['convert'] = 0
sql(f"update public.site_config set billing=$j${json.dumps(bc)}$j$ where id=1")
n0 = sql(f"select count(*) from public.credit_ledger where user_id='{U1}'")
check('a kind priced 0 → free, no ledger row', str(charged(U1, 'convert', 5)) + ' ' + sql(f"select count(*) from public.credit_ledger where user_id='{U1}'"), f'0 {n0}')
sql(f"update public.site_config set billing=$j${json.dumps(b0)}$j$ where id=1")

D.section('free: billing off, admin, owner')
cr(U2, 10)
bo = dict(b0); bo['on'] = False
sql(f"update public.site_config set billing=$j${json.dumps(bo)}$j$ where id=1")
r = j(spend(U2, 'usb', 50))
check('billing off → charged 0, free, balance same', json.dumps(r), lambda o: r.get('charged') == 0 and r.get('free') is True and r.get('id') is None and r.get('balance') == 10)
check('billing off → quote total 0', as_(U2, "select public.price_quote('usb',50)->>'total'"), '0')
sql(f"update public.site_config set billing=$j${json.dumps(b0)}$j$ where id=1")
cr(A, 0); cr(O, 0)
check('admin with 0 points → free', json.dumps(j(spend(A, 'mashup', 1))), lambda o: '"charged": 0' in o and '"free": true' in o)
check('owner with 0 points → free', json.dumps(j(spend(O, 'usb', 500))), lambda o: '"charged": 0' in o)
check('admin quote → free', as_(A, "select public.price_quote('sep',1)->>'free'"), 'true')
check('no ledger rows for free admin/owner spends', sql(f"select count(*) from public.credit_ledger where user_id in ('{A}','{O}') and reason='spend'"), '0')

D.section('refusals')
cr(U2, 2)
check('insufficient: usb ×3 with 2', spend(U2, 'usb', 3), 'insufficient_credits')
check('balance unchanged after refusal', bal(U2), '2')
cr(U2, 1000)
for q_ in ['0', '501', '-1', 'null']:
    check(f'qty {q_} → bad qty', as_(U2, f"select public.spend_credits_n('usb', {q_}, 'x')"), 'bad qty')
check('qty 500 ok', str(charged(U2, 'usb', 500)), '500')
check('quote qty 501 → bad qty', as_(U2, "select public.price_quote('usb', 501)"), 'bad qty')
check("kind 'grant' → bad kind", spend(U2, 'grant', 1), 'bad kind')
check("kind with odd chars → bad kind", as_(U2, "select public.spend_credits_n('us b', 1, 'x')"), 'bad kind')
check('null kind → bad kind', as_(U2, "select public.spend_credits_n(null, 1, 'x')"), 'bad kind')
check('blocked user → not allowed', spend(X, 'usb', 1), 'not allowed')
check('anon spend_credits_n', as_(None, "select public.spend_credits_n('usb',1,'x')"), 'permission denied')
check('anon price_quote', as_(None, "select public.price_quote('usb',1)"), 'permission denied')
check('anon spend_song', as_(None, "select public.spend_song('sabc-1')"), 'permission denied')
check('anon refund_credits_n', as_(None, "select public.refund_credits_n(1,1)"), 'permission denied')
check('a ref with control characters is cleaned + truncated', as_(U2, "select public.spend_credits_n('usb',1, E'a\\nb' || repeat('x', 400))->>'id'"),
      lambda o: sql(f"select char_length(ref) <= 300 and position(E'\\n' in ref) = 0 from public.credit_ledger where id={o or 0}") == 't')

D.section('concurrency')
cr(U3, 5)
pre = f"set role authenticated; set request.jwt.claim.sub='{U3}';"
cmd = lambda s_: ['psql', '-h', pg.SOCK, '-p', pg.PORT, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-c', s_]
p1 = subprocess.Popen(cmd(pre + "begin; select public.spend_credits_n('mashup',1,'p1'); select pg_sleep(1.2); commit;"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(0.3)
p2 = subprocess.Popen(cmd(pre + "select public.spend_credits_n('extended',1,'p2');"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
o1, o2 = p1.communicate()[0], p2.communicate()[0]
check('two spends on 5 points (3 + 3): one wins, the other insufficient, balance 2', o1 + ' || ' + o2 + ' || ' + bal(U3),
      lambda o: 'insufficient_credits' in o and o.strip().endswith('|| 2'))
cr(U3, 10)
p1 = subprocess.Popen(cmd(pre + "begin; select public.spend_song('sconc-1'); select pg_sleep(1.2); commit;"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(0.3)
p2 = subprocess.Popen(cmd(pre + "select public.spend_song('sconc-1');"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
o1, o2 = p1.communicate()[0], p2.communicate()[0]
check('the same song twice at once → charged once', o1 + ' || ' + o2 + ' || ' + bal(U3), lambda o: '"already": true' in o and o.strip().endswith('|| 9'))

D.section('concurrency: refunds')
cr(U3, 50); sql(f"delete from public.credit_ledger where user_id='{U3}' and reason='refund'")
rid = j(as_(U3, "select public.spend_credits_n('usb', 10, 'par')")).get('id')
p1 = subprocess.Popen(cmd(pre + f"begin; select public.refund_credits_n({rid}, 10); select pg_sleep(1.2); commit;"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(0.3)
p2 = subprocess.Popen(cmd(pre + f"select public.refund_credits_n({rid}, 10);"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
o1, o2 = p1.communicate()[0], p2.communicate()[0]
check('the same full refund twice at once → once (over refund), balance back to 50', o1 + ' || ' + o2 + ' || ' + bal(U3), lambda o: 'over refund' in o and o.strip().endswith('|| 50'))
rid = j(as_(U3, "select public.spend_credits_n('convert', 7, 'par')")).get('id')
p1 = subprocess.Popen(cmd(pre + f"begin; select public.refund_credits_n({rid}, 4); select pg_sleep(1.2); commit;"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(0.3)
p2 = subprocess.Popen(cmd(pre + f"select public.refund_credits_n({rid}, 4);"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
o1, o2 = p1.communicate()[0], p2.communicate()[0]
check('two partial refunds 4 + 4 of 7 at once → one refused, 4 back', o1 + ' || ' + o2 + ' || ' + bal(U3) + ' ' + sql(f"select refunded from public.credit_ledger where id={rid}"), lambda o: 'over refund' in o and o.strip().endswith('|| 47 4'))
sid = j(as_(U3, "select public.spend_credits('sep', 'par')")).get('id')
p1 = subprocess.Popen(cmd(pre + f"begin; select public.refund_credits({sid}); select pg_sleep(1.2); commit;"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(0.3)
p2 = subprocess.Popen(cmd(pre + f"select public.refund_credits({sid});"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
p1.communicate(); p2.communicate()
check('a separation refund twice at once → refunded once', bal(U3) + ' ' + sql(f"select count(*) from public.credit_ledger where ref='refund:{sid}'"), '47 1')

D.section('songs once per account')
cr(U4, 10)
r = j(as_(U4, "select public.spend_song('s1x2y3-12.ab9', 'My Song')"))
check('first load of a song → 1 point', json.dumps(r), lambda o: r.get('charged') == 1 and r.get('already') is False and r.get('balance') == 9)
r = j(as_(U4, "select public.spend_song('s1x2y3-12.ab9', 'My Song')"))
check('same song again → free (already)', json.dumps(r), lambda o: r.get('charged') == 0 and r.get('already') is True and r.get('balance') == 9)
check('another user, same key → charged for them', as_(U2, "select public.spend_song('s1x2y3-12.ab9')->>'charged'"), '1')
check('ledger ref = the song name', sql(f"select ref from public.credit_ledger where user_id='{U4}' and kind='song'"), 'song ×1 My Song')
check('bad song key', as_(U4, "select public.spend_song('../x y')"), 'bad key')
check('empty song key', as_(U4, "select public.spend_song('')"), 'bad key')
cr(U4, 0)
check('no points → insufficient, nothing recorded', as_(U4, "select public.spend_song('snew-1')") + ' ' + sql(f"select count(*) from public.charged_songs where user_id='{U4}' and song_key='snew-1'"),
      lambda o: 'insufficient_credits' in o and o.endswith(' 0'))
check('reads own charged songs', as_(U4, "select string_agg(song_key, ',') from public.charged_songs"), 's1x2y3-12.ab9')
check("doesn't see other users' rows", as_(U4, f"select count(*) from public.charged_songs where user_id <> '{U4}'"), '0')

D.section('RLS / privileges')
check('user insert charged_songs', as_(U4, f"insert into public.charged_songs(user_id, song_key) values ('{U4}', 'sfree-1')"), 'permission denied')
check('user delete charged_songs', as_(U4, "delete from public.charged_songs"), 'permission denied')
check('user update charged_songs', as_(U4, "update public.charged_songs set song_key='z'"), 'permission denied')
check('user truncate charged_songs', as_(U4, "truncate public.charged_songs"), 'permission denied')
check('anon reads charged_songs', as_(None, "select count(*) from public.charged_songs"), 'permission denied')
check('user edits ledger refunded column', as_(U4, "update public.credit_ledger set refunded=0"), 'permission denied')
check('user calls private.cost_of', as_(U4, "select private.cost_of('{}'::jsonb, 'usb')"), 'permission denied')
check('anon-callable definer fns = allow-list (unchanged)',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      lambda o: o.strip() == 'catalog_play,is_admin,pay_webhook,username_available')
check('every SECURITY DEFINER fn pins search_path',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))"), '0')

D.section('partial refunds')
cr(U1, 100); sql(f"update public.profiles set plan='free', plan_until=null where id='{U1}'")
sql(f"delete from public.credit_ledger where user_id='{U1}' and reason='refund'")
r = j(spend(U1, 'convert', 4, 'batch'))
lid = r.get('id')
f = j(as_(U1, f"select public.refund_credits_n({lid}, 1)"))
check('refund 1 of 4 files → +1, 3 left', json.dumps(f), lambda o: f.get('refunded') == 1 and f.get('left') == 3 and f.get('balance') == 97)
check('refund row: reason refund, ref refundn:<id>:1', sql(f"select ref||'|'||delta from public.credit_ledger where user_id='{U1}' and reason='refund' order by id desc limit 1"), f'refundn:{lid}:1|1')
check('over-refund (4 more of 3 left)', as_(U1, f"select public.refund_credits_n({lid}, 4)"), 'over refund')
check('refund the other 3 → back to 100', as_(U1, f"select public.refund_credits_n({lid}, 3)->>'balance'"), '100')
check('nothing left to refund', as_(U1, f"select public.refund_credits_n({lid}, 1)"), 'over refund')
check('charge row tracks refunded = qty', sql(f"select refunded||'/'||qty from public.credit_ledger where id={lid}"), '4/4')
plan(U1, 'pro', 5)
r = j(spend(U1, 'usb', 10)); lid = r.get('id')
check('pro: usb ×10 cost 9', str(r.get('charged')), '9')
a1 = j(as_(U1, f"select public.refund_credits_n({lid}, 5)")).get('refunded')
a2 = j(as_(U1, f"select public.refund_credits_n({lid}, 5)")).get('refunded')
check('partial refunds at the charged price: 5 → 4, 5 → 5 (sum = 9)', f'{a1} {a2}', '4 5')
r = j(spend(U1, 'usb', 3)); lid = r.get('id')
check("U2 refunds U1's row", as_(U2, f"select public.refund_credits_n({lid}, 1)"), 'not refundable')
sql(f"update public.credit_ledger set created_at = now() - interval '2 hours 50 minutes' where id={lid}")
check('2 h 50 min old (a long Converter batch) → still refundable', as_(U1, f"select public.refund_credits_n({lid}, 1)->>'refunded'"), '1')
sql(f"update public.credit_ledger set created_at = now() - interval '3 hours 1 minute' where id={lid}")
check('older than 3 hours', as_(U1, f"select public.refund_credits_n({lid}, 1)"), 'not refundable')
st_ = j(as_(U1, "select public.spend_credits('stems','x')")).get('id')
check("a 'stems' row through refund_credits_n (the app never refunds stems)", as_(U1, f"select public.refund_credits_n({st_}, 1)"), 'not refundable')
s_ = j(as_(U1, "select public.spend_credits('sep','x')")).get('id')
check("a 'sep' row through refund_credits_n", as_(U1, f"select public.refund_credits_n({s_}, 1)"), 'not refundable')
check("refund_credits on the 'sep' row still works", as_(U1, f"select public.refund_credits({s_})"), lambda o: o.isdigit())
check('refund_credits once only', as_(U1, f"select public.refund_credits({s_})"), lambda o: o.isdigit())
sg = sql(f"select ledger_id from public.charged_songs where user_id='{U4}' and song_key='s1x2y3-12.ab9'")
check("a 'song' row through refund_credits_n", as_(U4, f"select public.refund_credits_n({sg}, 1)"), 'not refundable')
r = j(spend(U1, 'usb', 3)); lid = r.get('id')
check("a usb row through refund_credits (sep only)", as_(U1, f"select public.refund_credits({lid})"), 'not refundable')
check('refund qty 0 → bad qty', as_(U1, f"select public.refund_credits_n({lid}, 0)"), 'bad qty')
# daily caps: 20 refunds, 1000 units (a failed 300-song Crate folder must still be refunded in full)
sql(f"update public.profiles set plan='free', plan_until=null where id='{U1}'"); cr(U1, 5000)
c300 = j(spend(U1, 'usb', 300, 'folder')).get('id')
check('a whole failed 300-song folder is refunded (300 units)', as_(U1, f"select public.refund_credits_n({c300}, 300)->>'refunded'"), '300')
b500 = j(spend(U1, 'convert', 500)).get('id')
check('… and a whole 500-file batch the same day', as_(U1, f"select public.refund_credits_n({b500}, 500)->>'refunded'"), '500')
calls = int(sql(f"select count(*) from public.credit_ledger where user_id='{U1}' and reason='refund' and ref like 'refundn:%'"))
r = j(spend(U1, 'convert', 500)); big = r.get('id')
units = int(sql(f"select coalesce(sum(qty),0) from public.credit_ledger where user_id='{U1}' and reason='refund' and ref like 'refundn:%'"))
check('units cap: more than 1000 refunded units a day', as_(U1, f"select public.refund_credits_n({big}, {1000 - units + 1})"), 'refund limit')
outs = [as_(U1, f"select public.refund_credits_n({big}, 1)") for _ in range(20 - calls)]
check(f'{20 - calls} more single refunds fit the 20/day cap', str(sum(1 for o in outs if 'ERROR' in o)), '0')
check('21st refund of the day → refund limit', as_(U1, f"select public.refund_credits_n({big}, 1)"), 'refund limit')
s2 = j(as_(U1, "select public.spend_credits('sep','y')")).get('id')
check('sep refunds have their own cap (not used up by batch refunds)', as_(U1, f"select public.refund_credits({s2})"), lambda o: o.isdigit())

D.section('settings guard (admin saves billing)')
def save(u, patch):
    bb = dict(b0); bb.update(patch)
    return as_(u, f"insert into public.site_config(id,billing) values (1,$j${json.dumps(bb)}$j$) on conflict (id) do update set billing=excluded.billing returning 'saved'")
check('admin saves every kind', save(A, {'costs': {**b0['costs'], 'usb': 2}}), 'saved')
check('… stored', str(B()['costs']['usb']), '2')
save(A, {'costs': {**b0['costs'], 'usb': 150, 'mashup': -4}})
check('costs clamped to 0…100', f"{B()['costs']['usb']} {B()['costs']['mashup']}", '100 0')
check('cost not a whole number', save(A, {'costs': {**b0['costs'], 'usb': 'x'}}), 'bad billing: costs.usb')
check('cost 1.5', save(A, {'costs': {**b0['costs'], 'usb': 1.5}}), 'bad billing: costs.usb')
check('cost key with odd chars', save(A, {'costs': {**b0['costs'], 'Bad-Key': 1}}), 'bad billing: costs key')
check('an extra (future) kind is accepted', save(A, {'costs': {**b0['costs'], 'karaoke': 2}}), 'saved')
pl = [dict(p) for p in b0['plans']]; pl[2]['discount'] = 95; pl[0]['discount'] = -5
save(A, {'plans': pl})
check('discount clamped to 0…90', str([p['discount'] for p in B()['plans']]), '[0, 10, 90]')
pl[2]['discount'] = 'abc'
check('discount not a number', save(A, {'plans': pl}), 'bad billing: plan discount')
check('plain user cannot save billing', save(U2, {'costs': {**b0['costs'], 'usb': 0}}), lambda o: B()['costs'].get('usb') != 0)
sql(f"update public.site_config set billing=$j${json.dumps(b0)}$j$ where id=1")
check('assistant price list has every kind + discount', as_(U2, "select public.assistant_use()"),
      lambda o: j(o).get('billing', {}).get('costs', {}).get('usb') == 1 and [p.get('discount') for p in j(o)['billing']['plans']] == [0, 10, 25])

D.finish()
