"""Security v5 (server audit 2026-10, round 5): the [security-v5] block of supabase/schema.sql (only [referral-v6] follows it)
(= supabase/security_v5.sql, checked verbatim, applied twice on a full install and on an install from before v5),
each rule attacked the way the audit found it.

  V5-1 refund caps per kind → tested in test_points_v2 ("daily refund caps"), only the table privileges here
  V5-2 storage quota: an overwrite no longer skips the quota; the replaced object is left out of the count and the
       incoming file is reserved at the bucket's maximum size
  V5-3 2FA: an aal1 session of an account with a verified TOTP factor gets 'mfa_required' (42501) from the definer
       RPCs that spend / refund / read / post for the user, a quiet no-op from log_activity / refill_credits /
       bump_seps; new catalog rows need aal_ok(); accounts without a factor are not affected
  V5-4 admins delete stored files only of plain users (staff only for the owner), never the owner's, never with a live
       subscription; 2FA-aware
  V5-5 billing fields that create points (signup, referral, referral_max, plan points) → owner / full admin only;
       every site_config change by a signed-in user logged as 'adm_config' (cannot be forged through log_activity)
  V5-6 referrals: one claim per canonical e-mail (lower case, +tag, gmail dots), also across deleted accounts;
       only a salted hash is kept
  V5-7 assistant_use() blocked for aal1 2FA sessions by a trigger that survives re-running assistant.sql
  V5-8 catalog.analyzed_by / full_by not readable by the API roles (every other column is)
"""
import os, sys, json, re, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg

D = pg.Db('secv5', assistant=True)      # schema.sql ×3, assistant.sql ×2, then security_v5.sql ×2 (see pg.py)
check, as_, sql = D.check, D.as_, D.sql
lit = lambda s: "'" + str(s).replace("'", "''") + "'"
V5 = pg.SECURITY_V5

def pre(uid, aal):
    c = {'sub': uid, 'role': 'authenticated', 'aal': aal, 'amr': [{'method': 'password', 'timestamp': int(time.time())}]}
    return f"set role authenticated; set request.jwt.claim.sub='{uid}'; set request.jwt.claims={lit(json.dumps(c))};"

def asc(uid, s, aal='aal1'):
    """As an authenticated user WITH JWT claims (aal1 = password only, aal2 = passed 2FA)."""
    o = pg.psql(D.name, pre(uid, aal) + s); e = pg.errs(o)
    return e[0] if e else (o.splitlines()[-1] if o else '')

def state(uid, call, aal='aal1'):
    """SQLSTATE + message of `perform <call>` (or 'no error')."""
    o = pg.psql(D.name, pre(uid, aal) + f"do $do$ begin perform {call}; raise notice 'STATE=none'; exception when others then raise notice 'STATE=% %', sqlstate, sqlerrm; end $do$;")
    m = re.search(r'STATE=([^\n]*)', o)
    return m.group(1) if m else o

O = '00000000-0000-0000-0000-0000000000f0'    # owner (first account)
A = '00000000-0000-0000-0000-0000000000a0'    # full admin
A2 = '00000000-0000-0000-0000-0000000000a2'   # second full admin (staff; 2FA later)
S = '00000000-0000-0000-0000-0000000000a5'    # custom role: settings only
M = '00000000-0000-0000-0000-0000000000a6'    # custom role: catalog (staff)
U1 = '00000000-0000-0000-0000-0000000000d1'
U2 = '00000000-0000-0000-0000-0000000000d2'
U3 = '00000000-0000-0000-0000-0000000000d3'   # has 2FA
U4 = '00000000-0000-0000-0000-0000000000d4'   # live subscription
I1 = '00000000-0000-0000-0000-0000000000c1'   # inviter  Mike.Levi@gmail.com
J1 = '00000000-0000-0000-0000-0000000000c2'   # mikelevi+2@googlemail.com (the inviter's own inbox)
J2 = '00000000-0000-0000-0000-0000000000c3'   # fan@x.com
J3 = '00000000-0000-0000-0000-0000000000c4'   # Fan+second@X.com (= fan@x.com)
J4 = '00000000-0000-0000-0000-0000000000c5'   # fan@x.com again, after J2 deleted the account
J5 = '00000000-0000-0000-0000-0000000000c6'   # f.an@x.com (dots count outside gmail)

D.section('accounts + roles')
for uid, mail, un in [(O, 'o@x', 'owner'), (A, 'a@x', 'adminA'), (A2, 'a2@x', 'adminB'), (S, 's@x', 'setter'), (M, 'm@x', 'moder'),
                      (U1, 'u1@x', 'userone'), (U2, 'u2@x', 'usertwo'), (U3, 'u3@x', 'userthree'), (U4, 'u4@x', 'userfour'),
                      (I1, 'Mike.Levi@gmail.com', 'mikelevi'), (J1, 'mikelevi+2@googlemail.com', 'mikealias'),
                      (J2, 'fan@x.com', 'fanone'), (J3, 'Fan+second@X.com', 'fantwo'), (J5, 'f.an@x.com', 'fandot')]:
    D.user(uid, mail, un)
as_(O, "select public.owner_set_role_password('RolePass#2026')")
as_(O, f"select public.admin_set_role('{A}','admin','RolePass#2026')"); as_(O, f"select public.admin_set_role('{A2}','admin','RolePass#2026')")
as_(O, "select public.owner_save_role('setter','Settings',array['settings'])")
as_(O, "select public.owner_save_role('moder','Moderator',array['catalog'])")
check('fixture: settings role', as_(O, f"select public.admin_set_role('{S}','setter','RolePass#2026')"), 'ok')
check('fixture: catalog role', as_(O, f"select public.admin_set_role('{M}','moder','RolePass#2026')"), 'ok')
sql(f"update public.profiles set pay_sub_id='sub4', pay_status='active' where id='{U4}'")
b0 = json.loads(sql("select billing from public.site_config where id=1"))
def set_billing(**kw):
    b = json.loads(json.dumps(b0)); b.update(kw)
    sql(f"update public.site_config set billing=$j${json.dumps(b)}$j$ where id=1")

D.section('supabase/security_v5.sql = a block of schema.sql (only [referral-v6] + [notify-v7] + [login-v8] after it), verbatim')
src = open(pg.SCHEMA, encoding='utf-8').read()
v5 = open(V5, encoding='utf-8').read()
m = re.search(r'\n(-- =+\n-- Security v5 .*?-- \[security-v5:end\]\n-- =+\n)', src, re.S)
check('schema.sql has the [security-v5] block', 'found' if m else 'missing', 'found')
# only the later [referral-v6] block may follow it
later = re.sub(r'(?s)-- =+\n-- Referral v6 .*?-- \[referral-v6:end\]\n-- =+\n', '', src[m.end():]) if m else src
later = re.sub(r'(?s)-- \[notify-v7:begin\].*?-- \[notify-v7:end\]', '', later)   # notify v7 adds only its own objects
later = re.sub(r'(?s)-- \[login-v8:begin\].*?-- \[login-v8:end\]', '', later)   # login v8 (username sign-in) adds only its own objects
check('the block is the last thing in schema.sql (only [referral-v6] + [notify-v7] + [login-v8] after it)', 'yes' if m and later.strip() == '' else 'no', 'yes')
check('…after [paypal]', 'yes' if m and src.index('[paypal:end]') < m.start() else 'no', 'yes')
check('security_v5.sql = header comment + the block', 'yes' if m and v5.endswith(m.group(1)) and all(l.startswith('--') or not l.strip() for l in v5[:v5.index(m.group(1))].splitlines()) else 'no', 'yes')
blk = m.group(1) if m else ''
check('no dynamic SQL built from input (every execute starts with constant text)',
      'ok' if all(re.search(r"\bexecute\s+('|\$f\$)", l) for l in blk.splitlines() if re.search(r'\bexecute\s+(?!function\b|on\b)', l) and not l.strip().startswith('--')) else 'bad', 'ok')
check('security_v5.sql run 3 on the full install (idempotent)', str(pg.errs(D.file(V5))), '[]')
check('…and referral_v6.sql after it again (the owner re-runs v6 after v5)', str(pg.errs(D.file(pg.REFERRAL_V6))), '[]')

D.section('[V5-3] 2FA: definer RPCs refuse an aal1 session of a 2FA account')
sql(f"insert into auth.mfa_factors(user_id,status) values ('{U3}','verified')")
sql("insert into public.catalog(id,ext_id,title,artist) values ('dz:900',900,'T','A')")
for call in ["public.spend_credits_n('usb',1,'x')", "public.spend_credits('sep','x')", "public.spend_song('k1')",
             "public.price_quote('usb',1)", "public.refund_credits(1)", "public.refund_credits_n(1,1)", "public.my_referral()",
             "public.claim_referral('abcdef12')", "public.my_pay_portal()", "public.review_submit(5,'great')", "public.review_delete()",
             "public.catalog_set_full('dz:900',120,0::smallint,1::smallint,'[0,5,7]')", "public.assistant_use()", "public.assistant_status()"]:
    check(f'aal1: {call.split("(")[0][7:]} → 42501 mfa_required', state(U3, call), '42501 mfa_required')
check('aal1 without claims at all (old session) → mfa_required too', as_(U3, "select public.spend_credits_n('usb',1,'x')"), 'mfa_required')
check('nothing was charged', sql(f"select credits||' '||(select count(*) from public.credit_ledger where user_id='{U3}' and reason='spend') from public.profiles where id='{U3}'"), '20 0')
n_act = sql(f"select count(*) from public.activity where user_id='{U3}'")
check('aal1: log_activity → quiet no-op (no error)', asc(U3, "select public.log_activity('view','tool')"), lambda o: 'ERROR' not in o)
check('…no row written', sql(f"select count(*) from public.activity where user_id='{U3}'"), n_act)
check('aal1: refill_credits → null (no balance shown)', asc(U3, "select coalesce(public.refill_credits()::text,'null')"), 'null')
seps = sql(f"select seps from public.profiles where id='{U3}'")
check('aal1: bump_seps → quiet no-op', asc(U3, "select public.bump_seps()") + sql(f"select seps from public.profiles where id='{U3}'"), seps)
check('aal1: new catalog row refused (restrictive policy)', asc(U3, "insert into public.catalog(id,ext_id,title,artist,chords) values ('dz:901',901,'T','A','[]')"), 'row-level security')
print('  the same account at aal2')
check('aal2: spend_credits_n works', asc(U3, "select public.spend_credits_n('usb',1,'x')->>'charged'", aal='aal2'), '1')
check('aal2: price_quote', asc(U3, "select public.price_quote('usb',2)->>'total'", aal='aal2'), '2')
check('aal2: my_referral gives a code', asc(U3, "select public.my_referral()->>'code'", aal='aal2'), lambda o: re.fullmatch(r'[0-9a-f]{8}', o) is not None)
check('aal2: claim_referral answers (bad_code)', asc(U3, "select public.claim_referral('zzzzzz99')->>'why'", aal='aal2'), 'bad_code')
check('aal2: my_pay_portal answers', asc(U3, "select coalesce(public.my_pay_portal(),'none')", aal='aal2'), 'none')
check('aal2: review_submit answers (not_eligible)', asc(U3, "select public.review_submit(5,'great')->>'error'", aal='aal2'), 'not_eligible')
check('aal2: log_activity writes', asc(U3, "select public.log_activity('view','tool')", aal='aal2') + sql(f"select count(*) from public.activity where user_id='{U3}'"), str(int(n_act) + 1))
check('aal2: refill_credits gives the balance', asc(U3, "select public.refill_credits()", aal='aal2'), '19')
check('aal2: catalog row added', asc(U3, "insert into public.catalog(id,ext_id,title,artist,chords) values ('dz:901',901,'T','A','[]') returning id", aal='aal2'), 'dz:901')
check('aal2: catalog_set_full', asc(U3, "select public.catalog_set_full('dz:900',120,0::smallint,1::smallint,'[0,5,7]')", aal='aal2'), 't')
check('aal2: assistant_use', asc(U3, "select public.assistant_use()->>'ok'", aal='aal2'), 'true')
check('aal2: assistant_status', asc(U3, "select public.assistant_status()->>'ok'", aal='aal2'), 'true')
print('  accounts without a factor are not affected')
check('no factor, aal1: spend', as_(U1, "select public.spend_credits_n('usb',1,'x')->>'charged'"), '1')
check('no factor, aal1: log_activity writes', as_(U1, "select public.log_activity('view','x')") + sql(f"select count(*) from public.activity where user_id='{U1}' and action='view'"), '1')
check('no factor, aal1: catalog row', as_(U1, "insert into public.catalog(id,ext_id,title,artist,chords) values ('dz:902',902,'T','A','[]') returning id"), 'dz:902')
check('no factor, aal1: assistant_use', as_(U1, "select public.assistant_use()->>'ok'"), 'true')
check('an unverified factor changes nothing', sql(f"insert into auth.mfa_factors(user_id,status) values ('{U2}','unverified')") + as_(U2, "select public.price_quote('usb',1)->>'total'"), '1')
print('  static: every RPC in the list carries the check')
for fn in ['spend_credits_n', 'price_quote', 'spend_song', 'refund_credits', 'refund_credits_n', 'my_pay_portal', 'my_referral',
           'claim_referral', 'catalog_set_full', 'review_submit', 'review_delete', 'assistant_status']:
    check(f'{fn} calls private.need_aal()', sql(f"select bool_and(prosrc like '%private.need_aal()%') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='{fn}'"), 't')

D.section('[V5-7] assistant: the trigger survives re-running assistant.sql')
check('trigger on assistant_usage present', sql("select count(*) from pg_trigger where tgname='assistant_usage_aal' and not tgisinternal"), '1')
check('assistant.sql re-run', str(pg.errs(D.file(pg.ASSISTANT))), '[]')
check('…trigger still there', sql("select count(*) from pg_trigger where tgname='assistant_usage_aal'"), '1')
check('…aal1 2FA session still refused by assistant_use', as_(U3, "select public.assistant_use()"), 'mfa_required')
check('…aal2 still fine', asc(U3, "select public.assistant_use()->>'ok'", aal='aal2'), 'true')
check('…plain member still fine', as_(U2, "select public.assistant_use()->>'ok'"), 'true')
check('security_v5.sql re-run after it (assistant_status gets its check back)', str(pg.errs(D.file(V5))) + ' ' + state(U3, 'public.assistant_status()'), '[] 42501 mfa_required')
check('…and referral_v6.sql after it (the owner re-runs v6 after v5: claim_referral / my_referral are v6)', str(pg.errs(D.file(pg.REFERRAL_V6))), '[]')

D.section('[V5-2] storage quota: overwrites are counted')
put = lambda u, name, size, bucket='uploads': as_(u, f"insert into storage.objects(bucket_id,name,metadata) values ('{bucket}','{name}','{{\"size\":{size}}}') returning 'stored'")
ups = lambda u, name, size, bucket='uploads': as_(u, f"insert into storage.objects(bucket_id,name,metadata) values ('{bucket}','{name}','{{\"size\":{size}}}') on conflict (bucket_id,name) do update set metadata=excluded.metadata returning 'stored'")
used = lambda u: sql(f"select coalesce(sum((metadata->>'size')::bigint),0) from storage.objects where bucket_id='uploads' and name like '{u}/%'")
check('storage_room is VOLATILE (counts see uploads committed while waiting for the lock)', sql("select provolatile from pg_proc where proname='storage_room'"), 'v')
set_billing(max_files=2000, storage_mb=60)
sql(f"insert into storage.objects(bucket_id,name,metadata) select 'uploads','{U1}/x'||g||'.mp3','{{\"size\":1000}}' from generate_series(1,3) g")
print('  the attack: tiny files re-uploaded with x-upsert at 50 MB each')
check('overwrite 1: 2 KB others + 50 MB reserve ≤ 60 MB → stored', ups(U1, f'{U1}/x1.mp3', 52428800), 'stored')
check('overwrite 2: 50 MB already used → refused (was: any overwrite allowed)', ups(U1, f'{U1}/x2.mp3', 52428800), 'row-level security')
check('a plain UPDATE of the metadata → refused too', as_(U1, f"update storage.objects set metadata='{{\"size\":52428800}}' where bucket_id='uploads' and name='{U1}/x3.mp3' returning 'stored'"), 'row-level security')
check('stored bytes stay ≈ 50 MB', used(U1), str(52428800 + 2000))
check('replacing the big file itself is fine (it is left out of the count)', ups(U1, f'{U1}/x1.mp3', 40000000), 'stored')
check('a new file on top → refused', put(U1, f'{U1}/x4.mp3', 1000), 'row-level security')
print('  a quota smaller than one file: one file may go over (old rule)')
set_billing(max_files=2000, storage_mb=1)
check('empty folder: first file stored', put(U2, f'{U2}/a.mp3', 2000000), 'stored')
check('second file refused', put(U2, f'{U2}/b.mp3', 1000), 'row-level security')
check('replacing the only file is fine', ups(U2, f'{U2}/a.mp3', 3000000), 'stored')
set_billing(max_files=2, storage_mb=5120)
check('max_files 2: replacing a file, then a 2nd file', ups(U2, f'{U2}/a.mp3', 1000) + ' ' + put(U2, f'{U2}/b.mp3', 1000), 'stored stored')
check('max_files: a 3rd file refused', put(U2, f'{U2}/c.mp3', 1000), 'row-level security')
check('admin exempt from the quota', put(A, f'{A}/big.mp3', 10**9), 'stored')
check("another user's folder still refused", ups(U2, f'{U1}/x1.mp3', 1), 'row-level security')
sql(f"update public.site_config set billing=$j${json.dumps(b0)}$j$ where id=1")
sql(f"delete from storage.objects where name like '{U1}/%' or name like '{U2}/%' or name like '{A}/%'")

D.section('[V5-4] admins delete files only of plain users')
for u in [O, A, A2, M, U1, U2, U4]:
    sql(f"insert into storage.objects(bucket_id,name,metadata) values ('uploads','{u}/w.mp3','{{\"size\":10}}'),('avatars','{u}/avatar.jpg','{{\"size\":10}}')")
dl = lambda who, u, bucket='uploads', aal=None: (asc(who, f"delete from storage.objects where bucket_id='{bucket}' and name='{u}/{'w.mp3' if bucket == 'uploads' else 'avatar.jpg'}' returning 1", aal=aal)
                                                 if aal else as_(who, f"delete from storage.objects where bucket_id='{bucket}' and name='{u}/{'w.mp3' if bucket == 'uploads' else 'avatar.jpg'}' returning 1"))
left = lambda u, bucket='uploads': sql(f"select count(*) from storage.objects where bucket_id='{bucket}' and name like '{u}/%'")
check("full admin: the owner's upload → kept", dl(A, O) + '|' + left(O), '|1')
check("full admin: the owner's avatar → kept", dl(A, O, 'avatars') + '|' + left(O, 'avatars'), '|1')
check("full admin: another full admin's files → kept", dl(A, A2) + dl(A, A2, 'avatars') + '|' + left(A2) + left(A2, 'avatars'), '|11')
check("full admin: a custom-role staff member's file → kept", dl(A, M) + '|' + left(M), '|1')
check('full admin: a user with a live subscription → kept', dl(A, U4) + dl(A, U4, 'avatars') + '|' + left(U4) + left(U4, 'avatars'), '|11')
check("full admin: a plain user's upload → deleted", dl(A, U1) + '|' + left(U1), '1|0')
check("full admin: a plain user's avatar → deleted", dl(A, U1, 'avatars') + '|' + left(U1, 'avatars'), '1|0')
check('own files: still through the own-folder rule', dl(A, A) + dl(A, A, 'avatars'), '11')
check('storage_may_wipe(own folder) is false (no admin path for oneself)', as_(A, f"select public.storage_may_wipe('{A}')"), 'f')
check('owner: a staff member → deleted', dl(O, M) + dl(O, A2) + '|' + left(M) + left(A2), '11|00')
check('owner: a live subscription → kept', dl(O, U4) + '|' + left(U4), '|1')
check("'settings' role: a user's file → kept", dl(S, U2) + '|' + left(U2), '|1')
check("plain user: another user's file → kept", dl(U1, U2) + dl(U1, U2, 'avatars') + '|' + left(U2) + left(U2, 'avatars'), '|11')
check('storage_may_wipe: not a uuid → false', as_(A, "select public.storage_may_wipe('../x')"), 'f')
check('storage_may_wipe: anon → permission denied', as_(None, "select public.storage_may_wipe('x')"), 'permission denied')
sql(f"insert into auth.mfa_factors(user_id,status) values ('{A2}','verified')")
check('full admin with 2FA at aal1 → kept', dl(A2, U2, aal='aal1') + '|' + left(U2), '|1')
check('…at aal2 → deleted', dl(A2, U2, aal='aal2') + '|' + left(U2), '1|0')
sql("delete from storage.objects")

D.section('[V5-5] billing fields that create points: owner / full admin only')
setb = lambda who, kv: as_(who, f"update public.site_config set billing = billing || {lit(json.dumps(kv))}::jsonb where id=1 returning 'ok'")
plans = b0['plans']
check("'settings' role: signup gift → refused", setb(S, {'signup': b0.get('signup', 0) + 5}), 'only the owner or a full admin can change signup')
check("'settings' role: referral reward → refused", setb(S, {'referral': 50}), 'only the owner or a full admin can change referral')
check("'settings' role: referral_max → refused", setb(S, {'referral_max': 999}), 'can change referral_max')
check("'settings' role: referral = the default 10 the panel always sends → saved", setb(S, {'referral': 10, 'referral_max': 20}), 'ok')
check("'settings' role: plan points → refused", setb(S, {'plans': [dict(p, points=p['points'] + 1) if p['id'] == 'basic' else p for p in plans]}), 'plan points (basic)')
check("'settings' role: a new plan with points → refused", setb(S, {'plans': plans + [{'id': 'vip', 'price': 199, 'points': 50, 'link': ''}]}), 'plan points (vip)')
check("'settings' role: a new plan with 0 points → saved", setb(S, {'plans': plans + [{'id': 'vip', 'price': 199, 'points': 0, 'link': ''}]}), 'ok')
check("'settings' role: prices, discounts, billing.on → saved", setb(S, {'costs': {**b0['costs'], 'sep': 6}, 'on': False, 'plans': [dict(p, price=p.get('price', 0) + 1, discount=5) for p in plans]}), 'ok')
check('…stored', sql("select (billing->'costs'->>'sep')||' '||(billing->>'on') from public.site_config where id=1"), '6 false')
up = lambda who, b: as_(who, f"insert into public.site_config(id,title,announce,billing) values (1,'Chord Room','',$j${json.dumps(b)}$j$) on conflict (id) do update set billing=excluded.billing returning 'saved'")
cur = json.loads(sql("select billing from public.site_config where id=1"))
check("'settings' role: the app's upsert with a price change → saved", up(S, dict(cur, costs={**cur['costs'], 'sep': 7})), 'saved')
check("'settings' role: the app's upsert with a signup change → refused", up(S, dict(cur, signup=999)), 'only the owner or a full admin can change signup')
check('full admin changes the signup gift', setb(A, {'signup': 30}), 'ok')
check('owner changes plan points', setb(O, {'plans': [dict(p, points=p['points'] + 10) for p in plans]}), 'ok')
sql(f"update public.site_config set billing=$j${json.dumps(b0)}$j$ where id=1")
print('  audit: adm_config')
nS = sql(f"select count(*) from public.activity where user_id='{S}' and action='adm_config'")
check('a settings change is logged with the actor and the changed keys',
      as_(S, "update public.site_config set billing = jsonb_set(billing,'{costs,sep}','8') where id=1 returning 'ok'")
      + ' ' + sql(f"select detail from public.activity where user_id='{S}' and action='adm_config' order by id desc limit 1"), f'ok by {S}: billing[costs]')
check('a column change too', as_(S, "update public.site_config set announce='Hello' where id=1 returning 'ok'")
      + ' ' + sql(f"select detail from public.activity where user_id='{S}' and action='adm_config' order by id desc limit 1"), f'ok by {S}: announce')
check('a refused change leaves no audit row', setb(S, {'signup': 1}) + ' ' + sql(f"select count(*) from public.activity where user_id='{S}' and action='adm_config'"),
      lambda o: 'only the owner' in o and o.endswith(' ' + str(int(nS) + 2)))
nAll = sql("select count(*) from public.activity where action='adm_config'")
sql("update public.site_config set announce='from the SQL editor' where id=1")
check('SQL editor / service changes are not logged (no signed-in user)', sql("select count(*) from public.activity where action='adm_config'"), nAll)
as_(U1, "select public.log_activity('adm_config','by someone: billing[signup]')")
check('log_activity cannot forge adm_* rows', sql(f"select count(*) from public.activity where user_id='{U1}' and action like 'adm%'"), '0')
sql(f"update public.site_config set billing=$j${json.dumps(b0)}$j$, announce='' where id=1")

D.section('[V5-6] referrals: one claim per canonical e-mail address')
for e, want in [('M.E+x@GMail.com', 'me@gmail.com'), ('a.b+c@googlemail.com', 'ab@gmail.com'), ('a.b+c@x.com', 'a.b@x.com'),
                ('  Fan@X.com ', 'fan@x.com'), ('+tag@x.com', '+tag@x.com'), ('no-at-sign', 'no-at-sign'), ('', 'NULL')]:
    check(f'email_canon({e!r}) = {want}', sql(f"select coalesce(private.email_canon({lit(e)}),'NULL')"), want)
check('email_key = 64 hex chars, same for aliases', sql("select private.email_key('m.e+1@gmail.com') = private.email_key('ME@googlemail.com') and private.email_key('x@y.z') ~ '^[0-9a-f]{64}$'"), 't')
code = as_(I1, "select public.my_referral()->>'code'")
check("fixture: inviter's code", code, lambda o: re.fullmatch(r'[0-9a-f]{8}', o) is not None)
check("the inviter's own inbox (gmail alias: dots, +tag, googlemail) → self", as_(J1, f"select public.claim_referral('{code}')->>'why'"), 'self')
check('a real new member → ok', as_(J2, f"select public.claim_referral('{code}')->>'ok'"), 'true')
check('the same inbox with +tag and capitals → already', as_(J3, f"select public.claim_referral('{code}')->>'why'"), 'already')
check('…not linked, no points', sql(f"select coalesce(referred_by::text,'none')||' '||credits from public.profiles where id='{J3}'"), 'none ' + sql(f"select credits from public.profiles where id='{J5}'"))
check('dots count outside gmail (f.an@x.com is another inbox) → ok', as_(J5, f"select public.claim_referral('{code}')->>'ok'"), 'true')
check('referral_claims: one salted hash per claim, no account id', sql("select count(*)||' '||string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='private' and table_name='referral_claims'")
      + ' ' + sql("select count(*) from private.referral_claims"), '2 at,email_key 2')
check('referral_claims not readable by users', as_(J2, "select count(*) from private.referral_claims"), 'permission denied')
sql(f"delete from auth.users where id='{J2}'")
D.user(J4, 'fan@x.com', 'fanagain')
check('delete the account and sign up again with the same address → already', as_(J4, f"select public.claim_referral('{code}')->>'why'"), 'already')
sql("update private.referral_claims set at = now() - interval '366 days' where email_key = private.email_key('fan@x.com')")
check('…a claim older than 365 days no longer counts', as_(J4, f"select public.claim_referral('{code}')->>'ok'"), 'true')
# [referral-v6]: a claim gives no points to anyone; the inviter is paid only on the friend's first payment (test_referral_v6)
check('no referral points at sign-up (inviter or friends)', sql(f"select count(*) from public.credit_ledger where reason='referral' and user_id in ('{I1}','{J2}','{J4}','{J5}')"), '0')
check('pending invites recorded for J5, J4 only (J2 left with its account)', sql(f"select string_agg(friend::text, ',' order by friend) from private.referrals where inviter='{I1}'"), f'{J5},{J4}' if J5 < J4 else f'{J4},{J5}')

D.section('[V5-8] catalog: analyzed_by / full_by hidden from the API roles')
hidden = lambda role: sql(f"select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='catalog' and not has_column_privilege('{role}', 'public.catalog', column_name, 'select')")
check('anon: every column readable except analyzed_by, full_by', hidden('anon'), 'analyzed_by,full_by')
check('authenticated: the same', hidden('authenticated'), 'analyzed_by,full_by')
check('no table-wide SELECT left', sql("select has_table_privilege('anon','public.catalog','select') or has_table_privilege('authenticated','public.catalog','select')"), 'f')
check('anon select analyzed_by → permission denied', as_(None, "select analyzed_by from public.catalog limit 1"), 'permission denied')
check('member select full_by → permission denied', as_(U1, "select full_by from public.catalog limit 1"), 'permission denied')
check("select * → permission denied (backend.js lists its columns)", as_(None, "select * from public.catalog limit 1"), 'permission denied')
check('the columns Discover reads still work', as_(None, "select count(*) from (select id,ext_id,title,artist,cover,link,bpm,key_pc,key_mode,chords,plays,is_full,created_at from public.catalog) x"), lambda o: o.isdigit() and int(o) >= 3)
check('member insert RETURNING analyzed_by → permission denied', as_(U1, "insert into public.catalog(id,ext_id,title,artist,chords) values ('dz:903',903,'T','A','[]') returning analyzed_by"), 'permission denied')
check('…RETURNING id still works, analyzed_by recorded server-side', as_(U1, "insert into public.catalog(id,ext_id,title,artist,chords) values ('dz:903',903,'T','A','[]') returning id")
      + ' ' + sql(f"select analyzed_by = '{U1}' from public.catalog where id='dz:903'"), 'dz:903 t')
check('catalog_set_full still records full_by', as_(U1, "select public.catalog_set_full('dz:903',121,0::smallint,1::smallint,'[0]')") + ' ' + sql(f"select full_by = '{U1}' from public.catalog where id='dz:903'"), 't t')
check("'catalog' moderator still edits", as_(M, "update public.catalog set title='Fixed' where id='dz:903' returning title"), 'Fixed')
check('schema.sql re-run keeps them hidden', str(pg.errs(D.file(pg.SCHEMA))) + ' ' + hidden('anon'), '[] analyzed_by,full_by')

D.section('hardening sweep')
check('every SECURITY DEFINER fn pins search_path',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))"), '0')
check('anon-callable definer fns = allow-list (unchanged)',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      lambda o: o.strip() == 'catalog_play,is_admin,login_email,notify_edge,pay_webhook,pay_webhook_paypal,reviews_public,username_available')
check('no private.* function executable by API roles',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))"), '0')
check('private.refund_calls / referral_claims / referrals / referral_ips: no privileges for API roles',
      sql("select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in ('refund_calls','referral_claims','referrals','referral_ips') and grantee in ('anon','authenticated','PUBLIC')"), '0')
check('no table in public without RLS', sql("select coalesce(string_agg(c.relname, ','), 'none') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"), 'none')
check('refund_calls cascades with the account (nothing blocks deleting a user)',
      sql("select confdeltype from pg_constraint where conrelid='private.refund_calls'::regclass and contype='f'"), 'c')

D.section('security_v5.sql on an install from before v5 (run twice)')
old = src[:m.start() + 1] if m else src
tmp = '/tmp/chordroom_schema_pre_v5.sql'
open(tmp, 'w', encoding='utf-8').write(old)
pg.psql('postgres', 'drop database if exists secv5old'); pg.psql('postgres', 'create database secv5old')
pg.psql('secv5old', sql=pg.STUB)
check('pre-v5 schema loads', str(pg.errs(pg.psql('secv5old', f=tmp))), '[]')
check('assistant.sql loads', str(pg.errs(pg.psql('secv5old', f=pg.ASSISTANT))), '[]')
for uid, mail, un in [(O, 'o@x', 'owner'), (U2, 'u2@x', 'usertwo'), (U3, 'U.3+old@gmail.com', 'userthree')]:
    pg.psql('secv5old', f"insert into auth.users(id,email,raw_user_meta_data) values ('{uid}','{mail}','{{\"username\":\"{un}\"}}')"); time.sleep(0.01)
pg.psql('secv5old', f"update public.profiles set referred_by='{U2}' where id='{U3}'")
check('pre-v5: anon may read analyzed_by', pg.psql('secv5old', "select has_column_privilege('anon','public.catalog','analyzed_by','select')"), 't')
check('security_v5.sql run 1', str(pg.errs(pg.psql('secv5old', f=V5))), '[]')
check('security_v5.sql run 2 (idempotent)', str(pg.errs(pg.psql('secv5old', f=V5))), '[]')
check('after v5: earlier referral claims backfilled (canonical hash)', pg.psql('secv5old', "select count(*)||' '||bool_and(email_key = private.email_key('u3@gmail.com')) from private.referral_claims"), '1 true')
check('after v5: analyzed_by hidden', pg.psql('secv5old', "select has_column_privilege('anon','public.catalog','analyzed_by','select')"), 'f')
check('after v5: guard + audit triggers on site_config', pg.psql('secv5old', "select count(*) from pg_trigger where tgname in ('site_config_guard_v5','site_config_audit')"), '2')
check('after v5: assistant_usage trigger (assistant.sql ran first)', pg.psql('secv5old', "select count(*) from pg_trigger where tgname='assistant_usage_aal'"), '1')
check('after v5: the delete policies use storage_may_wipe', pg.psql('secv5old', "select count(*) from pg_policies where schemaname='storage' and policyname in ('uploads: own delete','avatars: admin delete') and qual like '%storage_may_wipe%'"), '2')
check('schema.sql over it again still loads', str(pg.errs(pg.psql('secv5old', f=pg.SCHEMA))), '[]')
pg.psql('postgres', 'drop database if exists secv5old')

D.finish()
