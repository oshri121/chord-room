"""Security + behaviour of supabase/schema.sql (RLS, grants, validation triggers, security-definer RPCs): accounts and
the owner, table privileges, profiles columns/avatars/usernames, songs + downloads, catalog + rate limits, billing
validation, storage policies + quotas, roles table, points (spend/refund/concurrent double-spend/admin grants),
activity log, referrals, roles password lockout, Lemon Squeezy webhook (HMAC, replay, plan mapping), function
hardening sweep. Ported from the original audit harness (171 checks)."""
import os, sys, json, subprocess, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg
from pg import now

db = 'secdb'
D = pg.Db(db, assistant=False)
SECRET = 'test-secret-1234567890-abc'
check, as_, sql = D.check, D.as_, D.sql

O = '00000000-0000-0000-0000-0000000000f0'  # owner (first account)
A = '00000000-0000-0000-0000-0000000000a0'  # full admin
M = '00000000-0000-0000-0000-0000000000b0'  # custom role: users + catalog
K = '00000000-0000-0000-0000-0000000000c0'  # custom role: credits
U1 = '00000000-0000-0000-0000-0000000000d1'
U2 = '00000000-0000-0000-0000-0000000000d2'
U3 = '00000000-0000-0000-0000-0000000000d3'  # email not confirmed
X = '00000000-0000-0000-0000-0000000000e0'   # blocked
AV = 'https://ydyocusfrghsokjsectw.supabase.co/storage/v1/object/public/avatars/'

D.section('accounts')
for uid, mail, un in [(O, 'owner@x', 'owner'), (A, 'a@x', 'adminA'), (M, 'm@x', 'moder'), (K, 'k@x', 'kred'),
                      (U1, 'u1@x', 'userone'), (U2, 'u2@x', 'usertwo'), (U3, 'u3@x', 'userthree'), (X, 'x@x', 'blocky')]:
    D.user(uid, mail, un)
sql(f"update auth.users set email_confirmed_at = null where id = '{U3}'")
check('first account is owner+admin', sql(f"select owner||' '||role from public.profiles where id='{O}'"), 'true admin')
check('second account is plain user', sql(f"select owner||' '||role from public.profiles where id='{A}'"), 'false user')
check('signup credits (20) + ledger row', sql(f"select credits||' '||(select count(*) from public.credit_ledger where user_id='{U1}' and reason='signup') from public.profiles where id='{U1}'"), '20 1')
check('owner sets roles password', as_(O, "select public.owner_set_role_password('RolePass#2026')"), 'ok')
check('owner makes A admin (password)', as_(O, f"select public.admin_set_role('{A}','admin','RolePass#2026')"), 'ok')
as_(O, "select public.owner_save_role('moderator','Moderator',array['users','catalog'])")
as_(O, "select public.owner_save_role('cashier','Cashier',array['credits'])")
check('owner gives M moderator', as_(O, f"select public.admin_set_role('{M}','moderator','RolePass#2026')"), 'ok')
check('owner gives K cashier', as_(O, f"select public.admin_set_role('{K}','cashier','RolePass#2026')"), 'ok')
check('A blocks X', as_(A, f"select public.admin_set_blocked('{X}',true)"), lambda o: 'ERROR' not in o)
check('audit: adm_role row written with actor', sql(f"select detail from public.activity where user_id='{M}' and action='adm_role'"), f'by {O}')
check('audit: adm_block row', sql(f"select detail from public.activity where user_id='{X}' and action='adm_block'"), f'by {A}: blocked')

D.section('table privileges')
check('anon TRUNCATE profiles', as_(None, 'truncate public.profiles'), 'permission denied')
check('user TRUNCATE catalog', as_(U1, 'truncate public.catalog'), 'permission denied')
check('anon insert songs', as_(None, "insert into public.songs(user_id,name,data) values (null,'x','{}')"), 'permission denied')
check('user insert profile', as_(U1, "insert into public.profiles(id) values (gen_random_uuid())"), 'permission denied')
check('user delete own profile', as_(U1, "delete from public.profiles where id=auth.uid()"), 'permission denied')
check('user update download log', as_(U1, "update public.downloads set size=1"), 'permission denied')
check('user insert ledger', as_(U1, f"insert into public.credit_ledger(user_id,delta,balance,reason) values ('{U1}',999,999,'grant')"), 'permission denied')
check('user insert activity', as_(U1, f"insert into public.activity(user_id,action) values ('{U1}','x')"), 'permission denied')
check('user read private.settings', as_(U1, "select * from private.settings"), 'permission denied')
check('user call private.pay_grant', as_(U1, f"select private.pay_grant('{U1}',999,'x','x',false)"), 'permission denied')
check('anon bump_seps', as_(None, "select public.bump_seps()"), 'permission denied')
check('user call trigger fn handle_new_user', as_(U1, "select public.handle_new_user()"), 'permission denied')

D.section('profiles')
for col, v in [('role', "'admin'"), ('owner', 'true'), ('blocked', 'false'), ('credits', '9999'), ('plan', "'studio'"),
               ('plan_until', 'now()'), ('pay_status', "'active'"), ('pay_portal', "'x'"), ('referred_by', f"'{U2}'"),
               ('ref_code', "'aaaaaaaa'"), ('email', "'o@x'"), ('seps', '0'), ('songs', '0')]:
    check(f'user update {col}', as_(U1, f"update public.profiles set {col}={v} where id=auth.uid()"), 'permission denied')
check('display_name ok', as_(U1, "update public.profiles set display_name='Uno' where id=auth.uid() returning display_name"), 'Uno')
check('display_name 200 chars', as_(U1, f"update public.profiles set display_name='{'x'*200}' where id=auth.uid()"), 'bad display_name')
check('avatar on attacker host', as_(U1, "update public.profiles set avatar_url='https://evil.example/p.gif' where id=auth.uid()"), 'bad avatar_url')
check('avatar javascript:', as_(U1, "update public.profiles set avatar_url='javascript:alert(1)' where id=auth.uid()"), 'bad avatar_url')
check("avatar in someone else's folder", as_(U1, f"update public.profiles set avatar_url='{AV}{U2}/a.jpg' where id=auth.uid()"), 'bad avatar_url')
check('own avatar ok', as_(U1, f"update public.profiles set avatar_url='{AV}{U1}/avatar-1.jpg' where id=auth.uid() returning 'ok'"), 'ok')
check('own avatar with ?v= cache-buster', as_(U1, f"update public.profiles set avatar_url='{AV}{U1}/avatar.jpg?v=1727000000000' where id=auth.uid() returning 'ok'"), 'ok')
check('avatar with other query', as_(U1, f"update public.profiles set avatar_url='{AV}{U1}/avatar.jpg?x=<svg>' where id=auth.uid()"), 'bad avatar_url')
check('avatar ../ escape', as_(U1, f"update public.profiles set avatar_url='{AV}{U1}/../{U2}/a.jpg' where id=auth.uid()"), 'bad avatar_url')
check('remove avatar ok', as_(U1, "update public.profiles set avatar_url='' where id=auth.uid() returning 'ok'"), 'ok')
check('forged last_seen → now()', as_(U1, "update public.profiles set last_seen='2099-01-01' where id=auth.uid() returning (last_seen < now() + interval '1 minute')"), 't')
check('username differing only in case', as_(U2, "update public.profiles set username='UserOne' where id=auth.uid()"), 'duplicate key')
check('username change ok', as_(U2, "update public.profiles set username='user_two' where id=auth.uid() returning username"), 'user_two')
check('user sees only own profile', as_(U1, "select count(*) from public.profiles"), '1')
check('anon sees no profiles', as_(None, "select count(*) from public.profiles"), '0')
check('owner sees all profiles', as_(O, "select count(*) from public.profiles"), '8')
check('moderator (users perm) sees all', as_(M, "select count(*) from public.profiles"), '8')
check('username_available still works for anon', as_(None, "select public.username_available('free_name')"), 't')

D.section('songs / downloads')
check('save own song', as_(U1, "insert into public.songs(user_id,name,data,file_path) values (auth.uid(),'Song A','{\"bpm\":120}', auth.uid()||'/s1abc-6.mp3') returning 'ok'"), 'ok')
check("file_path in victim's folder", as_(U1, f"insert into public.songs(user_id,name,data,file_path) values (auth.uid(),'B','{{}}','{U2}/s1-1.mp3')"), 'bad file_path')
check('file_path traversal', as_(U1, "insert into public.songs(user_id,name,data,file_path) values (auth.uid(),'B','{}',auth.uid()||'/../x.mp3')"), 'bad file_path')
check('song data 3 MB', as_(U1, "insert into public.songs(user_id,name,data) values (auth.uid(),'Big',jsonb_build_object('x',repeat('a',3000000)))"), 'too large')
check('song for another user', as_(U1, f"insert into public.songs(user_id,name,data) values ('{U2}','Z','{{}}')"), 'row-level security')
check('upsert own song', as_(U1, "insert into public.songs(user_id,name,data) values (auth.uid(),'Song A','{\"bpm\":121}') on conflict (user_id,name) do update set data=excluded.data returning 'ok'"), 'ok')
check("U2 can't read U1 songs", as_(U2, "select count(*) from public.songs"), '0')
check('admin reads all songs', as_(A, "select count(*) from public.songs"), '1')
check('blocked user saves song', as_(X, "insert into public.songs(user_id,name,data) values (auth.uid(),'S','{}')"), 'row-level security')
check('log download', as_(U1, "insert into public.downloads(user_id,song_name,files,created_at) values (auth.uid(),'Song A','[\"wav\"]','2000-01-01') returning (created_at > now() - interval '1 minute')"), 't')
check('download with 500 files', as_(U1, "insert into public.downloads(user_id,song_name,files) values (auth.uid(),'x',(select jsonb_agg(g) from generate_series(1,500) g))"), 'bad files')
check('blocked user logs download', as_(X, "insert into public.downloads(user_id,song_name) values (auth.uid(),'x')"), 'not allowed')
check("U2 can't read U1 downloads", as_(U2, "select count(*) from public.downloads"), '0')

D.section('catalog')
row = lambda i, **k: "insert into public.catalog(id,ext_id,title,artist,cover,link,bpm,key_pc,key_mode,chords{extra}) values ('dz:{i}',{i},'T{i}','Art','{cover}','{link}',120,0,1,'{ch}'{extv}) returning plays||' '||is_full||' '||(analyzed_by=auth.uid())".format(
    i=i, cover=k.get('cover', f'https://e-cdns-images.dzcdn.net/images/cover/ab12/250x250-000000-80-0-0.jpg'),
    link=k.get('link', f'https://www.deezer.com/track/{i}'), ch=k.get('ch', '[0,5,7,9]'),
    extra=k.get('extra', ''), extv=k.get('extv', ''))
check('member adds analysis', as_(U1, row(1)), '0 false t')
check('forced plays/is_full/analyzed_by', as_(U1, row(2, extra=',plays,is_full,analyzed_by,created_at', extv=f",2000000000,true,'{U2}','2000-01-01'")), '0 false t')
check('cover on attacker host', as_(U1, row(3, cover='https://evil.example/pixel.gif')), 'bad cover')
check('javascript: link', as_(U1, row(4, link='javascript:alert(1)')), 'bad link')
check('chords are strings', as_(U1, row(5, ch='["<img src=x onerror=alert(1)>"]')), 'bad chords')
check('chords 500 items', as_(U1, row(6, ch=json.dumps(list(range(12)) * 50))), 'bad chords')
check('title with control chars stripped', as_(U1, "insert into public.catalog(id,ext_id,title,artist,chords) values ('dz:7',7,E'Ti\\u0007tle','A','[]') returning title"), 'Title')
check('anon adds analysis', as_(None, row(8)), 'permission denied')
check('blocked user adds analysis', as_(X, row(9)), 'row-level security')
check('member edits catalog row', as_(U2, "update public.catalog set title='hacked' where id='dz:1' returning 1"), lambda o: 'hacked' not in sql("select title from public.catalog where id='dz:1'"))
check('moderator edits catalog row', as_(M, "update public.catalog set title='Fixed' where id='dz:1' returning title"), 'Fixed')
check('moderator sets bad cover', as_(M, "update public.catalog set cover='https://evil.example/x.png' where id='dz:1'"), 'bad cover')
check('anon reads catalog', as_(None, "select count(*) from public.catalog"), '3')
print('  catalog_set_full')
check('bad chords (object)', as_(U2, "select public.catalog_set_full('dz:1',120,0::smallint,1::smallint,'[{\"a\":1}]')"), 'bad analysis')
check('first full analysis', as_(U2, "select public.catalog_set_full('dz:1',121,2::smallint,1::smallint,'[0,5,7]')"), 't')
check('second member cannot overwrite', as_(U1, "select public.catalog_set_full('dz:1',99,3::smallint,0::smallint,'[1]')"), 'f')
check('moderator can replace', as_(M, "select public.catalog_set_full('dz:1',122,2::smallint,1::smallint,'[0,5,7,9]')"), 't')
check('anon catalog_set_full', as_(None, "select public.catalog_set_full('dz:1',99,3::smallint,0::smallint,'[1]')"), 'permission denied')
sql("insert into public.catalog(id,ext_id,title,artist) select 'dz:'||g, g, 'T','A' from generate_series(100,130) g")
out = as_(U1, "select string_agg(public.catalog_set_full('dz:'||g,120,0::smallint,1::smallint,'[0]')::text, ',') from generate_series(100,125) g")
check('full-analysis rate limit (20/day)', out, 'rate limit')
print('  catalog_play')
for _ in range(5): as_(None, "select public.catalog_play('dz:2')")
check('anon ×5 counts once', sql("select plays from public.catalog where id='dz:2'"), '1')
for _ in range(5): as_(U1, "select public.catalog_play('dz:2')")
as_(U2, "select public.catalog_play('dz:2')")
check('U1 ×5 once, U2 once', sql("select plays from public.catalog where id='dz:2'"), '3')

D.section('site_config / billing')
B0 = sql("select billing from public.site_config where id=1")
def save_billing(u, patch):
    b = json.loads(B0); b.update(patch)
    return as_(u, f"insert into public.site_config(id,title,announce,billing) values (1,'Chord Room','hi',$j${json.dumps(b)}$j$) on conflict (id) do update set title=excluded.title, announce=excluded.announce, billing=excluded.billing returning 'saved'")
check('admin saves billing (client upsert)', save_billing(A, {'contact': 'owner@example.com', 'signup': 25}), 'saved')
check('contact javascript:', save_billing(A, {'contact': 'javascript:alert(document.cookie)'}), 'bad billing: contact')
check('contact java\\tscript: obfuscated', save_billing(A, {'contact': ' JaVa\tScRiPt:alert(1)'}), 'bad billing: contact')
check('contact data:', save_billing(A, {'contact': 'data:text/html,<script>alert(1)</script>'}), 'bad billing: contact')
check('contact //evil (open redirect)', save_billing(A, {'contact': '//evil.example'}), 'bad billing: contact')
check('contact plain text with colon ok', save_billing(A, {'contact': 'WhatsApp: 050-1234567'}), 'saved')
check('contact https ok', save_billing(A, {'contact': 'https://wa.me/972501234567'}), 'saved')
plans = json.loads(B0)['plans']
bp = [dict(p) for p in plans]; bp[0]['link'] = 'javascript:alert(1)'
check('plan link javascript:', save_billing(A, {'plans': bp}), 'bad billing: plan link')
bp = [dict(p) for p in plans]; bp[1]['points'] = 10**9
check('plan points 1e9', save_billing(A, {'plans': bp}), 'bad billing: plan points')
check('signup gift 1e6', save_billing(A, {'signup': 1000000}), 'bad billing: signup')
check('user updates site_config', as_(U1, "update public.site_config set announce='pwned' where id=1 returning 1"), lambda o: 'pwned' not in sql('select announce from public.site_config'))
check('moderator (no settings perm) updates', as_(M, "update public.site_config set announce='pwned' where id=1 returning 1"), lambda o: 'pwned' not in sql('select announce from public.site_config'))
check('anon reads site_config', as_(None, "select count(*) from public.site_config"), '1')

D.section('storage')
def put(u, bucket, name, size=1000):
    return as_(u, f"insert into storage.objects(bucket_id,name,metadata) values ('{bucket}','{name}','{{\"size\":{size}}}') returning 'stored'")
check('own avatar upload', put(U1, 'avatars', f'{U1}/avatar-1.jpg'), 'stored')
check("upload into another user's folder", put(U1, 'avatars', f'{U2}/avatar-1.jpg'), 'row-level security')
check('path with ..', put(U1, 'uploads', f'{U1}/../{U2}/x.mp3'), 'row-level security')
check('anon upload', put(None, 'avatars', 'x/y.jpg'), 'row-level security')
check('blocked user avatar', put(X, 'avatars', f'{X}/a.jpg'), 'row-level security')
check('anon lists avatars bucket', as_(None, "select count(*) from storage.objects where bucket_id='avatars'"), '0')
put(U2, 'avatars', f'{U2}/avatar-9.jpg')
check('U2 lists avatars → only own', as_(U2, "select count(*) from storage.objects where bucket_id='avatars'"), '1')
check('own song upload', put(U1, 'uploads', f'{U1}/s1abc-6.mp3', 5_000_000), 'stored')
check("U2 reads U1's file", as_(U2, "select count(*) from storage.objects where bucket_id='uploads'"), '0')
check("admin reads U1's file", as_(A, "select count(*) from storage.objects where bucket_id='uploads'"), '1')
check("storage_room on someone else's name", as_(U2, f"select public.storage_room('uploads','{U1}/s1abc-6.mp3')"), 'f')
bq = json.loads(B0); bq.update({'max_files': 2, 'storage_mb': 8})
sql(f"update public.site_config set billing=$j${json.dumps(bq)}$j$ where id=1")
check('2nd file within quota', put(U1, 'uploads', f'{U1}/s2.mp3', 1_000_000), 'stored')
check('3rd file over max_files', put(U1, 'uploads', f'{U1}/s3.mp3'), 'row-level security')
check('overwrite existing at quota (upsert)', as_(U1, f"insert into storage.objects(bucket_id,name,metadata) values ('uploads','{U1}/s2.mp3','{{\"size\":5}}') on conflict (bucket_id,name) do update set metadata=excluded.metadata returning 'stored'"), 'stored')
bq.update({'max_files': 100, 'storage_mb': 4})
sql(f"update public.site_config set billing=$j${json.dumps(bq)}$j$ where id=1")
check('over storage_mb', put(U1, 'uploads', f'{U1}/s4.mp3'), 'row-level security')
check('admin exempt from quota', put(A, 'uploads', f'{A}/big.mp3', 10**9), 'stored')
sql(f"update public.site_config set billing=$j${B0}$j$ where id=1")
check('buckets: limits + mime types', sql("select string_agg(id||':'||file_size_limit||':'||array_length(allowed_mime_types,1), ' ' order by id) from storage.buckets"), 'avatars:2097152:3 uploads:52428800:8')

D.section('roles table')
check('plain user reads roles', as_(U1, "select count(*) from public.roles"), '0')
check('moderator reads (users perm)', as_(M, "select count(*) from public.roles"), '2')
check('cashier reads own role only', as_(K, "select string_agg(id, ',') from public.roles"), 'cashier')
check('owner reads roles', as_(O, "select count(*) from public.roles"), '2')

D.section('points')
check('spend sep', as_(U1, "select public.spend_credits('sep','Song A')->>'balance'"), '15')
lid = sql(f"select id from public.credit_ledger where user_id='{U1}' and reason='spend' order by id desc limit 1")
check('refund own sep', as_(U1, f"select public.refund_credits({lid})"), '20')
check('refund same charge again (no double)', as_(U1, f"select public.refund_credits({lid})"), '20')
check('U2 refunds U1 charge', as_(U2, f"select public.refund_credits({lid})"), 'not refundable')
check('legacy spend ignores amount', as_(U1, "select public.spend_credits(-1000,'sep',null)"), '15')
check('bad kind', as_(U1, "select public.spend_credits('grant','x')"), 'bad kind')
check('blocked user spends', as_(X, "select public.spend_credits('sep','x')"), 'not allowed')
# concurrent double-spend: U2 has 20, cost 5*... make balance exactly 5 then spend twice in parallel
sql(f"update public.profiles set credits=5 where id='{U2}'")
pre = f"set role authenticated; set request.jwt.claim.sub='{U2}';"
cmd = lambda s: ['psql', '-h', pg.SOCK, '-p', pg.PORT, '-U', 'postgres', '-d', db, '-X', '-q', '-A', '-t', '-c', s]
p1 = subprocess.Popen(cmd(pre + "begin; select public.spend_credits('sep','p1'); select pg_sleep(1.5); commit;"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
time.sleep(0.3)
p2 = subprocess.Popen(cmd(pre + "select public.spend_credits('sep','p2');"), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
o1, o2 = p1.communicate()[0], p2.communicate()[0]
check('concurrent double-spend: one wins, one insufficient', o1 + ' || ' + o2 + ' || ' + sql(f"select credits from public.profiles where id='{U2}'"),
      lambda o: 'insufficient_credits' in o and o.strip().endswith('|| 0'))
sql(f"update public.profiles set credits=20 where id='{U2}'")
print('  admin grants')
check('cashier grants U1 +50', as_(K, f"select public.admin_grant_credits('{U1}',50,'promo')"), '65')
check('cashier grants himself', as_(K, f"select public.admin_grant_credits('{K}',1000,'me')"), 'not allowed')
check('cashier sets own plan', as_(K, f"select public.admin_set_plan('{K}','studio',12)"), 'not allowed')
check('cashier sets U1 plan', as_(K, f"select public.admin_set_plan('{U1}','basic',1)"), lambda o: 'ERROR' not in o)
check('owner grants himself', as_(O, f"select public.admin_grant_credits('{O}',5,'test')"), '25')
check('moderator grants (no perm)', as_(M, f"select public.admin_grant_credits('{U1}',5,'x')"), 'not allowed')
check('plain user grants', as_(U1, f"select public.admin_grant_credits('{U1}',5,'x')"), 'not allowed')
check('audit: grant by cashier logged', sql(f"select detail from public.activity where user_id='{U1}' and action='adm_credits' order by id limit 1"), f'by {K}: grant 50')
check('audit: plan set by cashier logged', sql(f"select detail from public.activity where user_id='{U1}' and action='adm_plan' order by id limit 1"), f'by {K}: basic')
check('user reads own ledger only', as_(U2, "select count(distinct user_id) from public.credit_ledger"), '1')
check('cashier reads all ledgers', as_(K, "select count(distinct user_id) > 1 from public.credit_ledger"), 't')

D.section('activity log')
check('log normal action', as_(U1, "select public.log_activity('visit','home')") + sql(f"select count(*) from public.activity where user_id='{U1}' and action='visit'"), '1')
as_(U1, "select public.log_activity('adm_role','by owner: user → admin')")
check('forged adm_* audit row ignored', sql(f"select count(*) from public.activity where user_id='{U1}' and action='adm_role'"), '0')
check('user reads activity', as_(U1, "select count(*) from public.activity"), '0')
check('admin reads activity', as_(A, "select count(*) > 0 from public.activity"), 't')

D.section('referrals')
code1 = as_(U1, "select public.my_referral()->>'code'")
code2 = as_(U2, "select public.my_referral()->>'code'")
check('U2 joins through U1', as_(U2, f"select public.claim_referral('{code1}')->>'ok'"), 'true')
check('U1 joins through U2 (mutual)', as_(U1, f"select public.claim_referral('{code2}')->>'why'"), 'self')
check('self referral', as_(M, f"select public.claim_referral('{as_(M, 'select public.my_referral()->>' + chr(39) + 'code' + chr(39))}')->>'why'"), 'self')
check('unconfirmed email claims', as_(U3, f"select public.claim_referral('{code1}')->>'why'"), 'not_confirmed')
check('blocked user claims', as_(X, f"select public.claim_referral('{code1}')->>'why'"), 'not_allowed')
check('claim twice', as_(U2, f"select public.claim_referral('{code1}')->>'why'"), 'already')

D.section('roles password lockout')
for i in range(5): as_(O, f"select public.admin_set_role('{U3}','admin','bad{i}')")
check('after 5 wrong → locked (even with the right one)', as_(O, f"select public.admin_set_role('{U3}','admin','RolePass#2026')"), 'locked')
check('admin (not owner) sets roles', as_(A, f"select public.admin_set_role('{U3}','admin','RolePass#2026')"), 'not allowed')
check('admin blocks owner', as_(A, f"select public.admin_set_blocked('{O}',true)"), 'owner')
check('admin blocks another admin', as_(A, f"select public.admin_set_blocked('{M}',true)"), 'not allowed')
sql("delete from private.role_pw_fail")

D.section('payments webhook')
sql(f"insert into private.settings(key,value) values ('lemon_signing_secret','{SECRET}') on conflict (key) do update set value=excluded.value")
bp = [dict(p) for p in plans]; bp[0]['variant'] = '101'; bp[1]['variant'] = '102'; bp[2]['variant'] = '103'
sql(f"update public.site_config set billing = jsonb_set(billing,'{{plans}}',$j${json.dumps(bp)}$j$) where id=1")
def ev(event, sid, variant, user=None, email='nobody@x', vname='Default', pname='Chord Room', test=False, plan=None):
    cd = {}
    if user: cd['user_id'] = user
    if plan: cd['plan'] = plan
    return json.dumps({'meta': {'event_name': event, 'test_mode': test, 'custom_data': cd or None},
        'data': {'type': 'subscriptions', 'id': str(sid), 'attributes': {'customer_id': 1, 'order_id': 5000 + sid, 'variant_id': variant,
        'product_name': pname, 'variant_name': vname, 'user_email': email, 'status': 'active', 'renews_at': now(30), 'updated_at': now(),
        'test_mode': test, 'urls': {'customer_portal': 'https://x.lemonsqueezy.com/billing?sig=1'}}}})
def hook(body, sig=None):
    sig = pg.sign(body, SECRET) if sig is None else sig
    return as_(None, f"select public.pay_webhook($B7x${body}$B7x$, '{sig}')")
body = ev('subscription_created', 1, 101, user=U1)
check('forged signature', hook(body, pg.sign(body, 'wrong')), 'bad signature')
check('valid signed event → plan + points', hook(body) + ' | ' + sql(f"select plan from public.profiles where id='{U1}'"), lambda o: '+60' in o and o.endswith('basic'))
check('replay of the same delivery', hook(body), 'duplicate')
check('test-mode event for a normal user', hook(ev('subscription_created', 2, 103, user=U2, test=True)), 'test ignored')
sql(f"update auth.users set email='buyer@x' where id='{U3}'")
check('email-only match, account unconfirmed', hook(ev('subscription_created', 3, 103, email='buyer@x')), 'no user')
check('email-only match, confirmed', hook(ev('subscription_created', 4, 102, email='U2@X')), 'plan pro')
check('other product "Producer pack" (variants set)', hook(ev('subscription_created', 5, 999, user=M, pname='Producer pack', vname='Monthly')), 'unknown plan')
nov = [dict((k, v) for k, v in p.items() if k != 'variant') for p in plans]
sql(f"update public.site_config set billing = jsonb_set(billing,'{{plans}}',$j${json.dumps(nov)}$j$) where id=1")
check('"Producer pack" without variants: no substring match', hook(ev('subscription_created', 6, 998, user=M, pname='Producer pack', vname='Monthly')), 'unknown plan')
check('"Pro monthly" without variants: whole word', hook(ev('subscription_created', 7, 997, user=K, vname='Pro monthly')), 'plan pro')
check('pay_events: user cannot read', as_(U1, "select count(*) from public.pay_events"), '0')
check('pay_events: owner reads', as_(O, "select count(*) > 0 from public.pay_events"), 't')
check('pay_events: moderator (no payments perm)', as_(M, "select count(*) from public.pay_events"), '0')
check('portal link not kept in payload', sql("select count(*) from public.pay_events where payload::text like '%customer_portal%'"), '0')
check('my_pay_portal returns own link', as_(U1, "select public.my_pay_portal()"), 'lemonsqueezy')
cr = sql(f"select credits from public.profiles where id='{U1}'"); sql(f"update public.profiles set last_refill = now() - interval '2 months' where id='{U1}'")
check('refill with live sub gives nothing', as_(U1, "select public.refill_credits()"), cr)

D.section('function hardening sweep')
check('every SECURITY DEFINER fn pins search_path',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))"), '0')
check('anon-callable definer fns = allow-list',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      lambda o: o.strip() == 'catalog_play,is_admin,pay_webhook,username_available')

D.finish()
