"""Accounts v4 (SECURITY-AUDIT.md "v4"): the [accounts-v4] block at the end of supabase/schema.sql, attacked and exercised.

  A-1/A-2  2FA: management permissions and the user's own rows need an aal2 session once the account has a verified TOTP
           factor; billing.require_mfa_admin (owner only) holds management back for accounts without one — never the owner
  A-3      settings: turnstile_site_key / require_mfa_admin / idle_minutes(_admin) / min_age validated; who may change them
  A-4      offensive words: normalisation + token matching (shared cases with the browser: fixtures/textguard_cases.py),
           profile trigger, sign-up username, text_ok, admin list (owner / full admin only), removals survive a re-run
  A-5      age consent copied into profiles at sign-up, not writable by the user
  A-6      delete_my_account: every table that references the user (FK sweep) deleted or anonymised, payment records kept
           without the account, owner refused, live subscription refused, confirmation / fresh sign-in / aal2 / files left;
           admin_delete_user (owner / full admin, never the owner, staff only by the owner); dashboard deletes anonymise too
  plus: supabase/accounts_v4.sql = the block verbatim, applied twice on an install from before v4; hardening sweep.
"""
import os, sys, json, re, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fixtures'))
import pg
from textguard_cases import OFFENSIVE, CLEAN

D = pg.Db('acctv4', assistant=True)
check, as_, sql = D.check, D.as_, D.sql
lit = lambda s: "'" + str(s).replace("'", "''") + "'"
ck = lambda label, cond, info='': check(label, ('yes ' if cond else 'no ') + str(info), lambda o: o.startswith('yes'))

def asc(uid, s, aal='aal1', amr_age=0, amr=True):
    """As an authenticated user WITH JWT claims (aal, amr = a password sign-in amr_age seconds ago)."""
    c = {'sub': uid, 'role': 'authenticated', 'aal': aal}
    if amr: c['amr'] = [{'method': 'password', 'timestamp': int(time.time()) - amr_age}]
    pre = f"set role authenticated; set request.jwt.claim.sub='{uid}'; set request.jwt.claims={lit(json.dumps(c))};"
    o = pg.psql(D.name, pre + s); e = pg.errs(o)
    return e[0] if e else (o.splitlines()[-1] if o else '')

O = '00000000-0000-0000-0000-0000000000f0'    # owner
A = '00000000-0000-0000-0000-0000000000a0'    # full admin
A2 = '00000000-0000-0000-0000-0000000000a2'   # second full admin (require_mfa_admin)
S = '00000000-0000-0000-0000-0000000000a5'    # custom role: settings only
U1 = '00000000-0000-0000-0000-0000000000d1'   # deletes their account (rows everywhere)
U2 = '00000000-0000-0000-0000-0000000000d2'   # bystander
U3 = '00000000-0000-0000-0000-0000000000d3'   # live subscription
U4 = '00000000-0000-0000-0000-0000000000d4'   # 2FA
U5 = '00000000-0000-0000-0000-0000000000d5'   # deleted by an admin
U6 = '00000000-0000-0000-0000-0000000000d6'   # deleted from the dashboard
U7 = '00000000-0000-0000-0000-0000000000d7'   # confirms with מחק
D.section('accounts')
for uid, mail, un in [(O, 'o@x', 'owner'), (A, 'a@x', 'adminA'), (A2, 'a2@x', 'adminB'), (S, 's@x', 'setter'), (U1, 'u1@x', 'userone'),
                      (U2, 'u2@x', 'usertwo'), (U3, 'u3@x', 'userthree'), (U4, 'u4@x', 'userfour'), (U5, 'u5@x', 'userfive'),
                      (U6, 'u6@x', 'usersix'), (U7, 'u7@x', 'userseven')]:
    D.user(uid, mail, un)
as_(O, "select public.owner_set_role_password('RolePass#2026')")
as_(O, f"select public.admin_set_role('{A}','admin','RolePass#2026')"); as_(O, f"select public.admin_set_role('{A2}','admin','RolePass#2026')")
as_(O, "select public.owner_save_role('setter','Settings',array['settings'])")
check('fixture: roles', as_(O, f"select public.admin_set_role('{S}','setter','RolePass#2026')"), 'ok')

D.section('FK sweep: nothing that references a user can block deleting it')
fks = sql("""select string_agg(c.conrelid::regclass || '.' || a.attname || ':' || c.confdeltype::text, ' ' order by 1)
             from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
            where c.contype = 'f' and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)""")
print('   ', fks)
ck('every FK to auth.users / profiles is CASCADE or SET NULL', all(x.split(':')[-1] in ('c', 'n') for x in fks.split()), fks)
for t in ['profiles', 'songs', 'downloads', 'credit_ledger', 'activity', 'charged_songs', 'assistant_usage', 'pay_events', 'catalog', 'account_deletions']:
    ck(f'{t} is covered by the sweep', 'public.' + t + '.' in fks or t + '.' in fks, t)

D.section('[A-6] delete_my_account: a user with rows everywhere')
# U1's data: songs, download log, activity, points (spend + a payment), charged song, assistant usage, catalog rows,
# a webhook event with personal data, a play-log row, files, a referral with U2, an admin audit line mentioning U1
as_(U1, "insert into public.songs(user_id,name,data,file_path) values (auth.uid(),'my song','{\"bpm\":120}','" + U1 + "/s1.mp3')")
as_(U1, "insert into public.downloads(user_id,song_name) values (auth.uid(),'my song')")
as_(U1, "select public.log_activity('view','tool')")
as_(U1, "select public.spend_credits_n('song',1,'x')")
sql(f"select private.pay_grant('{U1}', 60, 'sub:777', 'basic', false)")
as_(U1, "select public.spend_song('k1',null)")
as_(U1, "select public.assistant_use()")
sql(f"insert into public.catalog(id,ext_id,title,artist,analyzed_by,full_by,is_full) values ('dz:99',99,'T','A','{U1}','{U1}',true)")
sql("""insert into public.pay_events(key,event,user_id,payload) values ('k:u1','subscription_created','""" + U1 + """',
       '{"meta":{"custom_data":{"user_id":\"""" + U1 + """\"}},"data":{"type":"subscriptions","id":"777","attributes":{"user_email":"u1@x","user_name":"User One","card_last_four":"4242","status":"active"}}}')""")
sql(f"insert into private.catalog_play_log(cid,who,slot) values ('dz:99','{U1}',1)")
sql(f"insert into storage.objects(bucket_id,name,metadata) values ('uploads','{U1}/s1.mp3','{{\"size\":\"10\"}}'),('avatars','{U1}/avatar.jpg','{{\"size\":\"10\"}}')")
code = as_(U1, "select public.my_referral()->>'code'")
check('fixture: U2 joins with U1 code', as_(U2, f"select public.claim_referral('{code}')->>'ok'"), 'true')
sql(f"insert into public.activity(user_id,action,detail) values ('{U2}','adm_credits','by {U1}: grant 5')")
check('fixture: U1 has 2 payment-or-other ledger kinds', sql(f"select count(distinct reason) >= 3 from public.credit_ledger where user_id='{U1}'"), 't')

check('anon → refused', as_(None, "select public.delete_my_account('DELETE')"), 'permission denied')
check('wrong confirmation → confirm', asc(U1, "select public.delete_my_account('nope')->>'why'"), 'confirm')
check('no amr claim → reauth', asc(U1, "select public.delete_my_account('userone')->>'why'", amr=False), 'reauth')
check('sign-in 1 hour ago → reauth', asc(U1, "select public.delete_my_account('userone')->>'why'", amr_age=3600), 'reauth')
r = asc(U1, "select public.delete_my_account('userone')")
check('files still in storage → files_left (2)', r, lambda o: '"files_left"' in o and '"n": 2' in o)
check('user removes own files (Storage API = RLS delete)', asc(U1, "delete from storage.objects where (storage.foldername(name))[1] = auth.uid()::text returning 1") , '1')
check('the account still exists after the refusals', sql(f"select count(*) from auth.users where id='{U1}'"), '1')
check('typed DELETE (any case) is accepted', asc(U1, "select public.delete_my_account('  Delete ')->>'ok'"), 'true')
D.section('[A-6] … what is left of U1')
check('auth.users row gone', sql(f"select count(*) from auth.users where id='{U1}'"), '0')
for t, col in [('profiles', 'id'), ('songs', 'user_id'), ('downloads', 'user_id'), ('activity', 'user_id'), ('charged_songs', 'user_id'), ('assistant_usage', 'user_id')]:
    check(f'{t}: no rows of U1', sql(f"select count(*) from public.{t} where {col}='{U1}'"), '0')
check('ledger: non-payment rows deleted', sql(f"select count(*) from public.credit_ledger where user_id='{U1}'"), '0')
h = sql(f"select private.subject_hash('{U1}')")
check('subject hash = 64 hex chars', h, lambda o: re.fullmatch(r'[0-9a-f]{64}', o) is not None)
check('ledger: the payment row is kept, anonymised', sql(f"select count(*)||' '||bool_and(user_id is null) from public.credit_ledger where subject_hash='{h}' and reason='payment'"), '1 true')
check('pay_events: kept, user_id null + hash', sql(f"select (user_id is null)::text||' '||(subject_hash='{h}')::text from public.pay_events where key='k:u1'"), 'true true')
pl = sql("select payload::text from public.pay_events where key='k:u1'")
ck('pay_events payload: no email / name / card / custom user id', not any(x in pl for x in ['u1@x', 'User One', '4242', U1]), pl[:200])
ck('pay_events payload: business fields kept', '"status": "active"' in pl and '"777"' in pl)
check('catalog row kept, analyzed_by/full_by null', sql("select (analyzed_by is null and full_by is null)::text from public.catalog where id='dz:99'"), 'true')
check('play log rows of U1 deleted', sql(f"select count(*) from private.catalog_play_log where who='{U1}'"), '0')
check("U2's referral ref no longer holds U1's id", sql(f"select count(*) from public.credit_ledger where ref like '%{U1}%'"), '0')
check("…but is still recognisable as a referral", sql(f"select count(*) from public.credit_ledger where user_id='{U2}' and ref like 'ref:joined:x%'"), '1')
check("admin audit details no longer hold U1's id", sql(f"select count(*) from public.activity where detail like '%{U1}%'"), '0')
check('U2 untouched', sql(f"select count(*) from public.profiles where id='{U2}'"), '1')
check('account_deletions: one row, self, had_payments, no actor', sql(f"select how||' '||had_payments||' '||coalesce(actor::text,'-') from public.account_deletions where subject_hash='{h}'"), 'self true -')
check('account_deletions holds no email/username', sql("select count(*) from public.account_deletions where subject_hash like '%@%'"), '0')
check('a user cannot read account_deletions', as_(U2, "select count(*) from public.account_deletions"), '0')
check('activity admins can', as_(A, "select count(*) >= 1 from public.account_deletions"), 't')
check('Hebrew confirmation מחק works', asc(U7, "select public.delete_my_account('מחק')->>'ok'"), 'true')

D.section('[A-6] refusals: owner, live subscription, 2FA')
check('owner → owner', asc(O, "select public.delete_my_account('DELETE')->>'why'"), 'owner')
sql(f"update public.profiles set pay_sub_id='sub9', pay_status='active' where id='{U3}'")
check('live subscription (active) → subscription', asc(U3, "select public.delete_my_account('DELETE')->>'why'"), 'subscription')
for st in ['on_trial', 'past_due', 'paused']:
    sql(f"update public.profiles set pay_status='{st}' where id='{U3}'")
    check(f'…{st} too', asc(U3, "select public.delete_my_account('DELETE')->>'why'"), 'subscription')
sql(f"update public.profiles set pay_status='cancelled' where id='{U3}'")
check('cancelled subscription → can delete', asc(U3, "select public.delete_my_account('userthree')->>'ok'"), 'true')
sql(f"insert into auth.mfa_factors(user_id,status) values ('{U4}','verified')")
check('2FA account at aal1 → mfa', asc(U4, "select public.delete_my_account('DELETE')->>'why'"), 'mfa')
check('…at aal2 → deleted', asc(U4, "select public.delete_my_account('DELETE')->>'ok'", aal='aal2'), 'true')
check('…its factors went with it', sql(f"select count(*) from auth.mfa_factors where user_id='{U4}'"), '0')

D.section('[A-6] admin_delete_user')
check('plain user → not allowed', as_(U2, f"select public.admin_delete_user('{U5}','DELETE')"), 'not allowed')
check("'settings' role → not allowed", as_(S, f"select public.admin_delete_user('{U5}','DELETE')"), 'not allowed')
check('admin: the owner → owner', as_(A, f"select public.admin_delete_user('{O}','DELETE')->>'why'"), 'owner')
check('admin: itself → self', as_(A, f"select public.admin_delete_user('{A}','DELETE')->>'why'"), 'self')
check('admin: a staff account → staff (owner only)', as_(A, f"select public.admin_delete_user('{S}','DELETE')->>'why'"), 'staff')
check('admin: wrong confirmation → confirm', as_(A, f"select public.admin_delete_user('{U5}','userone')->>'why'"), 'confirm')
sql(f"insert into storage.objects(bucket_id,name) values ('avatars','{U5}/avatar.jpg'),('uploads','{U5}/a.mp3')")
check('admin: target still has files → files_left', as_(A, f"select public.admin_delete_user('{U5}','userfive')->>'why'"), 'files_left')
check("admin can remove the target's avatar (new policy)", as_(A, f"delete from storage.objects where bucket_id='avatars' and name='{U5}/avatar.jpg' returning 1"), '1')
check("admin can remove the target's uploads (existing policy)", as_(A, f"delete from storage.objects where bucket_id='uploads' and name='{U5}/a.mp3' returning 1"), '1')
check('a user cannot remove another avatar', as_(U2, f"delete from storage.objects where bucket_id='avatars' returning 1"), lambda o: o.strip() == '')
check('admin deletes U5 (typed username)', as_(A, f"select public.admin_delete_user('{U5}','userfive')->>'ok'"), 'true')
h5 = sql(f"select private.subject_hash('{U5}')")
check('account_deletions: admin + actor', sql(f"select how||' '||actor from public.account_deletions where subject_hash='{h5}'"), f'admin {A}')
check('audit row for the acting admin, no raw id of the target', sql(f"select count(*) from public.activity where user_id='{A}' and action='adm_delete_user' and detail not like '%{U5}%'"), '1')
sql(f"update public.profiles set pay_sub_id='s2', pay_status='active' where id='{U2}'")
check('admin: live subscription → subscription', as_(A, f"select public.admin_delete_user('{U2}','DELETE')->>'why'"), 'subscription')
sql(f"update public.profiles set pay_sub_id=null, pay_status=null where id='{U2}'")
check('the owner can delete a staff account', as_(O, f"select public.admin_delete_user('{S}','setter')->>'ok'"), 'true')
D.user(S, 's@x', 'setter'); as_(O, f"select public.admin_set_role('{S}','setter','RolePass#2026')")

D.section('[A-6] dashboard delete (Auth admin API) anonymises too')
sql(f"select private.pay_grant('{U6}', 60, 'sub:888', 'basic', false)")
sql(f"delete from auth.users where id='{U6}'")
h6 = sql(f"select private.subject_hash('{U6}')")
check('payment kept, anonymised', sql(f"select count(*) from public.credit_ledger where subject_hash='{h6}' and user_id is null"), '1')
check('account_deletions: dashboard', sql(f"select how from public.account_deletions where subject_hash='{h6}'"), 'dashboard')

D.section('[A-4] offensive words: shared cases (same list as the browser)')
bad_miss = [s for s in OFFENSIVE if sql(f"select private.is_offensive({lit(s)})") != 't']
ck(f'all {len(OFFENSIVE)} offensive cases flagged', not bad_miss, bad_miss)
fp = [s for s in CLEAN if sql(f"select private.is_offensive({lit(s)})") != 'f']
ck(f'no false positive on {len(CLEAN)} common words', not fp, fp)
js = open(os.path.join(pg.REPO, 'assets', 'acct.js'), encoding='utf-8').read()
m = re.search(r'const BASE = \[(.*?)\n  \];', js, re.S)
jsbase = sorted(re.findall(r"\['([^']+)','(word|hword|prefix|part|phrase)'\]", m.group(1))) if m else []
seed = open(pg.SCHEMA, encoding='utf-8').read().split('[accounts-v4:begin]')[1].split('perform private.bw_put(e[1]')[0]
sqlbase = sorted(set(re.findall(r"\['([^']+)','(word|hword|prefix|part|phrase)','[a-z]{2}'\]", seed)))
ck('the browser list (acct.js BASE) = the SQL seed', jsbase and sorted(set(jsbase)) == sqlbase, f'{len(jsbase)} vs {len(sqlbase)}')
check('every seed entry is stored', sql("select count(*) from private.blocked_words where seeded"), lambda o: int(o) >= len(sqlbase) - 2)

D.section('[A-4] profiles trigger, sign-up, text_ok')
check('offensive username refused (offensive / username)', asc(U2, "update public.profiles set username='sh1t_lord' where id=auth.uid()"), lambda o: 'offensive' in o)
o = pg.psql(D.name, f"set role authenticated; set request.jwt.claim.sub='{U2}'; do $$ declare d text; begin update public.profiles set username='sh1t_lord' where id=auth.uid(); exception when others then get stacked diagnostics d = pg_exception_detail; raise notice 'DETAIL=%', d; end $$;")
ck('…the error carries the field in DETAIL', 'DETAIL=username' in o, o.replace('\n', ' ')[:160])
check('offensive display name refused', asc(U2, "update public.profiles set display_name='כוס אמק' where id=auth.uid()"), 'offensive')
check('offensive bio refused', asc(U2, "update public.profiles set bio='I am a b1tch' where id=auth.uid()"), 'offensive')
check('normal profile text saved', asc(U2, "update public.profiles set display_name='Dana Beats', bio='Scunthorpe DJ, cocktails & bass' where id=auth.uid() returning 'ok'"), 'ok')
sql("set session_replication_role = replica")
sql(f"alter table public.profiles disable trigger profiles_text_guard; update public.profiles set display_name='shit' where id='{U2}'; alter table public.profiles enable trigger profiles_text_guard")
check('a legacy offensive name does not block other edits', asc(U2, "update public.profiles set bio='hello' where id=auth.uid() returning 'ok'"), 'ok')
sql(f"update public.profiles set display_name='Dana' where id='{U2}'")
sql(f"insert into auth.users(id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e1','e1@x','{{\"username\":\"fuck_you\"}}')")
check('sign-up with an offensive username → account created without it', sql("select coalesce(username,'NULL')||'|'||display_name||'|' from public.profiles where id='00000000-0000-0000-0000-0000000000e1'"), 'NULL||')
check('username_available (anon): offensive → false', as_(None, "select public.username_available('Sh1t')"), 'f')
check('username_available (anon): free normal name → true', as_(None, "select public.username_available('brand_new_dj')"), 't')
check('text_ok (signed in): offensive → false', as_(U2, "select public.text_ok('you b1tch')"), 'f')
check('text_ok: clean → true', as_(U2, "select public.text_ok('Scunthorpe')"), 't')
check('text_ok: anon → permission denied', as_(None, "select public.text_ok('x')"), 'permission denied')
check('private.is_offensive not callable by users', as_(U2, "select private.is_offensive('x')"), 'permission denied')
check('blocked_words not readable by users', as_(U2, "select count(*) from private.blocked_words"), 'permission denied')

D.section('[A-4] admin list: owner / full admin only; removals survive a re-run')
check('plain user → not allowed', as_(U2, "select public.admin_blocked_words()"), 'not allowed')
check("'settings' role → not allowed", as_(S, "select public.admin_blocked_word_set('banana','word',true)"), 'not allowed')
check('admin reads the list', as_(A, "select jsonb_array_length(public.admin_blocked_words()) > 100"), 't')
check('admin adds a word', as_(A, "select public.admin_blocked_word_set('Banana','word',true)->>'word'"), 'banana')
check('…now refused in text', sql("select private.is_offensive('my BANANA split')"), 't')
check('…logged as adm_words', sql(f"select count(*) from public.activity where user_id='{A}' and action='adm_words'"), '1')
check('admin removes it again', as_(A, "select public.admin_blocked_word_set('banana','word',false)->>'ok'") + sql("select private.is_offensive('banana')"), 'truef')
check('admin removes a built-in word', as_(A, "select public.admin_blocked_word_set('shit',null,false)->>'ok'") + sql("select private.is_offensive('shit')"), 'truef')
check('bad input → ok:false', as_(A, "select public.admin_blocked_word_set('!',null,true)->>'why'"), 'bad')
check('bad mode → ok:false', as_(A, "select public.admin_blocked_word_set('apple','regex',true)->>'why'"), 'bad')
check('accounts_v4.sql re-run', str(pg.errs(D.file(os.path.join(pg.REPO, 'supabase', 'accounts_v4.sql')))), '[]')
check('…the removed built-in word stays removed', sql("select private.is_offensive('shit')"), 'f')
as_(A, "select public.admin_blocked_word_set('shit','word',true)")
check('…and comes back when re-added', sql("select private.is_offensive('shit')"), 't')
check('a phrase is stored as a phrase', as_(A, "select public.admin_blocked_word_set('bad  guy','word',true)->>'word'") + sql("select mode from private.blocked_words where word='bad guy'"), 'bad guyphrase')

D.section('[A-1/A-2] 2FA: management and own rows need aal2 once enrolled')
check('admin without 2FA: has_perm at aal1', asc(A, "select public.has_perm('users')"), 't')
sql(f"insert into auth.mfa_factors(user_id,status) values ('{A}','unverified')")
check('an unverified factor changes nothing', asc(A, "select public.has_perm('users')"), 't')
sql(f"insert into auth.mfa_factors(user_id,status) values ('{A}','verified')")
check('verified factor + aal1 → no has_perm', asc(A, "select public.has_perm('users')"), 'f')
check('… no is_admin', asc(A, "select public.is_admin()"), 'f')
check('… my_access: perms empty, mfa.held', asc(A, "select (public.my_access()->'perms')::text||' '||(public.my_access()->'mfa'->>'held')"), '[] true')
check('… admin RPCs refused', asc(A, f"select public.admin_grant_credits('{U2}',5,'x')"), 'not allowed')
check('… own profile hidden (restrictive policy)', asc(A, "select count(*) from public.profiles where id=auth.uid()"), '0')
check('… own songs: insert refused', asc(A, "insert into public.songs(user_id,name,data) values (auth.uid(),'s','{}')"), 'row-level security')
check('… own avatar upload refused', asc(A, f"insert into storage.objects(bucket_id,name) values ('avatars','{A}/avatar.jpg')"), 'row-level security')
check('aal2 → has_perm back', asc(A, "select public.has_perm('users')", aal='aal2'), 't')
check('aal2 → own profile visible', asc(A, "select count(*) from public.profiles where id=auth.uid()", aal='aal2'), '1')
check('aal2 → my_access full', asc(A, "select jsonb_array_length(public.my_access()->'perms')||' '||(public.my_access()->'mfa'->>'enrolled')", aal='aal2'), '8 true')
check('users without 2FA are unaffected at aal1', asc(U2, "select count(*) from public.profiles where id=auth.uid()"), '1')
check('aal_ok for anon is true (anon policies unaffected)', as_(None, "select count(*) >= 0 from public.catalog"), 't')

D.section('[A-3] settings: validation and who may change what')
setb = lambda who, kv, aal='aal1': asc(who, f"update public.site_config set billing = billing || {lit(json.dumps(kv))}::jsonb where id=1 returning 'ok'", aal=aal)
check('require_mfa_admin not boolean → refused', setb(O, {'require_mfa_admin': 'yes'}), 'bad billing: require_mfa_admin')
check('full admin cannot turn on require_mfa_admin', setb(A2, {'require_mfa_admin': True}), 'only the owner')
check("'settings' role cannot either", setb(S, {'require_mfa_admin': True}), 'only the owner')
check('idle_minutes 4 → refused', setb(O, {'idle_minutes': 4}), 'idle_minutes')
check('idle_minutes_admin 600000 → refused', setb(O, {'idle_minutes_admin': 600000}), 'idle_minutes_admin')
check('min_age 12 → refused', setb(O, {'min_age': 12}), 'min_age')
check('turnstile key javascript: → refused', setb(O, {'turnstile_site_key': 'javascript:alert(1)'}), 'turnstile_site_key')
check('owner sets valid values', setb(O, {'idle_minutes': 10080, 'idle_minutes_admin': 30, 'min_age': 16, 'turnstile_site_key': '0x4AAAAAAABkMYinukE8nzY'}), 'ok')
check('full admin may change the idle limits', setb(A2, {'idle_minutes': 1440}), 'ok')
check("'settings' role may NOT change the Turnstile key", setb(S, {'turnstile_site_key': '0x4AAAAAAAEVILKEYxxxxxx'}), 'only the owner or a full admin')
check("'settings' role may NOT change idle limits", setb(S, {'idle_minutes_admin': 600}), 'only the owner or a full admin')
check("'settings' role still saves prices (new keys untouched)", asc(S, "update public.site_config set billing = jsonb_set(billing,'{costs,sep}','6') where id=1 returning 'ok'"), 'ok')
check('empty Turnstile key = off is valid', setb(O, {'turnstile_site_key': ''}), 'ok')

D.section('[A-1] require_mfa_admin: owner never locked out')
check('owner turns it on (no 2FA itself)', setb(O, {'require_mfa_admin': True}), 'ok')
check('full admin without 2FA → no has_perm', asc(A2, "select public.has_perm('users')"), 'f')
check('… my_access says required + held', asc(A2, "select (public.my_access()->'mfa'->>'required')||' '||(public.my_access()->'mfa'->>'held')"), 'true true')
check('owner without 2FA keeps every permission', asc(O, "select public.has_perm('users') and public.is_owner() and public.is_admin()"), 't')
check('… my_access: 8 perms, mfa.ok', asc(O, "select jsonb_array_length(public.my_access()->'perms')||' '||(public.my_access()->'mfa'->>'ok')"), '8 true')
check('admin with 2FA at aal2 still works', asc(A, "select public.has_perm('users')", aal='aal2'), 't')
check('plain users keep their own data', asc(U2, "select count(*) from public.profiles where id=auth.uid()"), '1')
check('owner turns it off again', setb(O, {'require_mfa_admin': False}), 'ok')
check('full admin without 2FA works again', asc(A2, "select public.has_perm('users')"), 't')

D.section('[A-5] age consent')
sql("""insert into auth.users(id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e2','e2@x',
       '{"username":"agedone","age_ok":true,"age_at":"2001-01-01T00:00:00Z","age_min":"16"}')""")
check('age_confirmed_at set (server time when the client time is off), age_min 16',
      sql("select (age_confirmed_at > now() - interval '1 minute')::text||' '||age_min from public.profiles where id='00000000-0000-0000-0000-0000000000e2'"), 'true 16')
sql("""insert into auth.users(id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e3','e3@x','{"username":"noage"}')""")
check('no age consent → null', sql("select coalesce(age_confirmed_at::text,'null') from public.profiles where id='00000000-0000-0000-0000-0000000000e3'"), 'null')
check('the user cannot set age_confirmed_at', as_('00000000-0000-0000-0000-0000000000e3', "update public.profiles set age_confirmed_at=now() where id=auth.uid()"), 'permission denied')

D.section('hardening sweep')
check('every SECURITY DEFINER fn pins search_path',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))"), '0')
check('anon-callable definer fns = allow-list (unchanged)',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      lambda o: o.strip() == 'catalog_play,is_admin,pay_webhook,username_available')
check('no private.* function executable by API roles',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))"), '0')
check('no table in public without RLS', sql("select coalesce(string_agg(c.relname, ','), 'none') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"), 'none')
check('account_deletions: no write for API roles', as_(A, "insert into public.account_deletions(how,subject_hash) values ('self',repeat('a',64))"), 'permission denied')
blk = open(pg.SCHEMA, encoding='utf-8').read().split('[accounts-v4:begin]')[1]
check('no dynamic SQL built from input in the block (execute only with format %I over constants)',
      'ok' if all("format('" in l for l in blk.splitlines() if re.search(r'\bexecute\s+(?!function\b|on\b)', l) and not l.strip().startswith('--')) else 'bad', 'ok')

D.section('supabase/accounts_v4.sql = the schema block, verbatim; applies twice on a pre-v4 install')
src = open(pg.SCHEMA, encoding='utf-8').read()
v4 = open(os.path.join(pg.REPO, 'supabase', 'accounts_v4.sql'), encoding='utf-8').read()
m = re.search(r'\n(-- =+\n-- Accounts v4 .*?-- \[accounts-v4:end\]\n-- =+\n)', src, re.S)
check('schema.sql has the [accounts-v4] block', 'found' if m else 'missing', 'found')
check('the block is the LAST thing in schema.sql', 'last' if m and src[m.end():].strip() == '' else 'not last', lambda o: o == 'last')
check('…after [security-v3]', 'yes' if m and src.index('[security-v3:end]') < m.start() else 'no', 'yes')
check('accounts_v4.sql contains the block verbatim', 'yes' if m and m.group(1) in v4 else 'no', 'yes')
check('accounts_v4.sql = header comment + the block', 'yes' if m and v4.endswith(m.group(1)) and all(l.startswith('--') or not l.strip() for l in v4[:v4.index(m.group(1))].splitlines()) else 'no', 'yes')
old = src[:m.start() + 1] if m else src
tmp = '/tmp/chordroom_schema_pre_v4.sql'
open(tmp, 'w', encoding='utf-8').write(old)
pg.psql('postgres', 'drop database if exists acctv4old'); pg.psql('postgres', 'create database acctv4old')
pg.psql('acctv4old', sql=pg.STUB)
check('pre-v4 schema loads', str(pg.errs(pg.psql('acctv4old', f=tmp))), '[]')
check('assistant.sql loads', str(pg.errs(pg.psql('acctv4old', f=pg.ASSISTANT))), '[]')
pg.psql('acctv4old', f"insert into auth.users(id,email,raw_user_meta_data) values ('{O}','o@x','{{\"username\":\"owner\"}}')")
pg.psql('acctv4old', f"insert into auth.users(id,email,raw_user_meta_data) values ('{U2}','u2@x','{{\"username\":\"usertwo\"}}')")
pg.psql('acctv4old', f"update public.profiles set display_name='shit' where id='{U2}'")   # legacy row, before the filter existed
V4 = os.path.join(pg.REPO, 'supabase', 'accounts_v4.sql')
check('accounts_v4.sql run 1', str(pg.errs(pg.psql('acctv4old', f=V4))), '[]')
check('accounts_v4.sql run 2 (idempotent)', str(pg.errs(pg.psql('acctv4old', f=V4))), '[]')
check('after v4: delete function + trigger present', pg.psql('acctv4old', "select count(*) from pg_trigger where tgname='on_auth_user_deleted'") + pg.psql('acctv4old', "select count(*) from pg_proc where proname='delete_my_account'"), '11')
check('after v4: restrictive 2FA policy on assistant_usage too', pg.psql('acctv4old', "select count(*) from pg_policies where tablename='assistant_usage' and policyname='mfa: aal2 when enrolled' and permissive='RESTRICTIVE'"), '1')
check('after v4: the legacy offensive row is still there (no rewrite)', pg.psql('acctv4old', f"select display_name from public.profiles where id='{U2}'"), 'shit')
check('after v4: the seed is installed once', pg.psql('acctv4old', "select count(*) = count(distinct word) and count(*) > 100 from private.blocked_words"), 't')
pg.psql('postgres', 'drop database if exists acctv4old')

D.finish()
