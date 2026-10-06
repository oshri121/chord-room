"""Security v3 (server-side audit, SECURITY-AUDIT.md): the [S-17]…[S-22] block at the end of supabase/schema.sql and the
assistant.sql changes, each attacked the way the audit found it, plus supabase/security_v3.sql = those two parts verbatim,
applied twice on an install from before v3.

  S-17 anonymous catalog_play on ids that are not in the catalog wrote one private log row per call (disk fill)
  S-18 activity log: 400/hour forever → also 1500/day per member
  S-19 My Songs `data`: 5000 × 2 MB per account → 50 MB per account in total; download log also 1500/day
  S-20 catalog: 400 new rows/hour per member → also 1500/day; a new row's Deezer link is always its own track
  S-21 spend_song with a 0 price stored a row per call for any key → free rows capped at 3000/day
  S-22 a 'settings' custom role could re-point checkout links / variant ids (revenue redirect) → owner/full admin only;
       and the 'settings' role could not save through the app's upsert at all (no INSERT policy) → fixed
  S-23 no sign-up gift for accounts without an email (Supabase anonymous sessions)
  assistant: unconfirmed / anonymous sessions refused; site-wide daily ceiling billing.assistant_site_daily
"""
import os, sys, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg

D = pg.Db('secv3', assistant=True)
check, as_, sql = D.check, D.as_, D.sql

O = '00000000-0000-0000-0000-0000000000f0'   # owner (first account)
A = '00000000-0000-0000-0000-0000000000a0'   # full admin
S = '00000000-0000-0000-0000-0000000000a5'   # custom role: settings only
U1 = '00000000-0000-0000-0000-0000000000d1'
U2 = '00000000-0000-0000-0000-0000000000d2'
U3 = '00000000-0000-0000-0000-0000000000d3'  # email not confirmed
AN = '00000000-0000-0000-0000-0000000000d4'  # like a Supabase anonymous session: no email, never confirmed

D.section('accounts')
for uid, mail, un in [(O, 'o@x', 'owner'), (A, 'a@x', 'adminA'), (S, 's@x', 'setter'), (U1, 'u1@x', 'userone'),
                      (U2, 'u2@x', 'usertwo'), (U3, 'u3@x', 'userthree')]:
    D.user(uid, mail, un)
sql(f"insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values ('{AN}',null,'{{}}',null)")
sql(f"update auth.users set email_confirmed_at = null where id = '{U3}'")
as_(O, "select public.owner_set_role_password('RolePass#2026')")
as_(O, f"select public.admin_set_role('{A}','admin','RolePass#2026')")
as_(O, "select public.owner_save_role('setter','Settings',array['settings'])")
check('owner gives S the settings role', as_(O, f"select public.admin_set_role('{S}','setter','RolePass#2026')"), 'ok')

D.section('[S-17] catalog_play: anonymous log rows only for real catalog ids')
for i in range(40):
    as_(None, f"select public.catalog_play('dz:{700000 + i}')")
check('40 anon calls on missing ids → 0 log rows', sql("select count(*) from private.catalog_play_log"), '0')
sql("insert into public.catalog(id,ext_id,title,artist) values ('dz:42',42,'T','A')")
as_(None, "select public.catalog_play('dz:42')"); as_(None, "select public.catalog_play('dz:42')")
check('existing id still counts once per hour for anon', sql("select plays||' '||(select count(*) from private.catalog_play_log) from public.catalog where id='dz:42'"), '1 1')
as_(U1, "select public.catalog_play('dz:42')")
check('member still counts', sql("select plays from public.catalog where id='dz:42'"), '2')

D.section('[S-18] activity: 1500 rows per member per day')
sql(f"insert into public.activity(user_id,action,created_at) select '{U1}','visit',now() - interval '2 hours' from generate_series(1,1499)")
as_(U1, "select public.log_activity('view','tool')")
check('row 1500 is written', sql(f"select count(*) from public.activity where user_id='{U1}'"), '1500')
as_(U1, "select public.log_activity('view','tool')")
check('row 1501 is skipped (no error)', sql(f"select count(*) from public.activity where user_id='{U1}'"), '1500')
check('other members unaffected', as_(U2, "select public.log_activity('view','x')") + sql(f"select count(*) from public.activity where user_id='{U2}'"), '1')
check('assistant_use still answers when the log is full', as_(U1, "select public.assistant_use()->>'ok'"), 'true')

D.section('[S-19] My Songs: 50 MB of analyses per account')
# ~1.4 MB stored per row (random base64 barely compresses), written as the owner role → no guard; 38 rows ≈ 53 MB
sql(f"""insert into public.songs(user_id,name,data)
        select '{U1}', 'big'||g, jsonb_build_object('x', (select string_agg(encode(extensions.gen_random_bytes(1024),'base64'),'') from generate_series(1,1400) where g > 0))
          from generate_series(1,38) g""")
check('fixture: > 50 MB stored for U1', sql(f"select sum(pg_column_size(data)) > 52428800 from public.songs where user_id='{U1}'"), 't')
check('a new song over the cap is refused', as_(U1, "insert into public.songs(user_id,name,data) values (auth.uid(),'new one','{\"bpm\":120}')"), 'song storage full')
for i in range(1, 39):     # drop big rows until the account is just under the cap
    if sql(f"select sum(pg_column_size(data)) < 50000000 from public.songs where user_id='{U1}'") == 't': break
    sql(f"delete from public.songs where user_id='{U1}' and name='big{i}'")
check('under the cap again → saved', as_(U1, "insert into public.songs(user_id,name,data) values (auth.uid(),'new one','{\"bpm\":120}') returning 'ok'"), 'ok')
sql(f"insert into public.songs(user_id,name,data) select '{U1}','pad',jsonb_build_object('x',(select string_agg(encode(extensions.gen_random_bytes(1024),'base64'),'') from generate_series(1,4000)))")
check('fixture: back over the cap', sql(f"select sum(pg_column_size(data)) > 52428800 from public.songs where user_id='{U1}'"), 't')
check('upsert replacing a big row with a small one is fine', as_(U1, "insert into public.songs(user_id,name,data) values (auth.uid(),'pad','{\"bpm\":1}') on conflict (user_id,name) do update set data=excluded.data returning 'ok'"), 'ok')
check('…and updating a small row in place too', as_(U1, "update public.songs set data='{\"bpm\":2}' where user_id=auth.uid() and name='new one' returning 'ok'"), 'ok')
check('another account is not affected', as_(U2, "insert into public.songs(user_id,name,data) values (auth.uid(),'mine','{}') returning 'ok'"), 'ok')
check('per-row limit (2 MB) still applies', as_(U2, "insert into public.songs(user_id,name,data) values (auth.uid(),'huge',jsonb_build_object('x',repeat('a',2100000)))"), 'too large')
sql(f"delete from public.songs where user_id='{U1}'")
print('  download log')
sql(f"insert into public.downloads(user_id,song_name,created_at) select '{U1}','s',now() - interval '3 hours' from generate_series(1,1499)")
check('download 1500 of the day ok', as_(U1, "insert into public.downloads(user_id,song_name) values (auth.uid(),'x') returning 'ok'"), 'ok')
check('download 1501 → rate limit', as_(U1, "insert into public.downloads(user_id,song_name) values (auth.uid(),'x')"), 'rate limit')
check('hourly limit still 300', sql(f"insert into public.downloads(user_id,song_name) select '{U2}','s' from generate_series(1,300)") + as_(U2, "insert into public.downloads(user_id,song_name) values (auth.uid(),'x')"), 'rate limit')

D.section('[S-20] catalog: 1500 new rows per member per day, link = own track')
row = lambda i, link: f"insert into public.catalog(id,ext_id,title,artist,link,chords) values ('dz:{i}',{i},'T','A','{link}','[0,5]') returning link"
check('link of another track → rewritten to the row id', as_(U1, row(5001, 'https://www.deezer.com/track/999')), 'https://www.deezer.com/track/5001')
check('own link with locale kept', as_(U1, row(5002, 'https://www.deezer.com/fr/track/5002')), 'https://www.deezer.com/fr/track/5002')
check('non-Deezer link still refused', as_(U1, row(5003, 'https://evil.example/track/5003')), 'bad link')
sql(f"insert into public.catalog(id,ext_id,title,artist,analyzed_by,created_at) select 'dz:'||(100000+g),100000+g,'T','A','{U2}',now() - interval '2 hours' from generate_series(1,1500) g")
check('member at 1500 today → rate limit', as_(U2, row(5004, '')), 'rate limit')
check('another member can still add', as_(U1, row(5005, '')), lambda o: 'ERROR' not in o)
check('moderator edits keep working (update path)', as_(A, "update public.catalog set title='Fixed' where id='dz:5001' returning title"), 'Fixed')

D.section('[S-21] spend_song: free rows capped')
b0 = json.loads(sql("select billing from public.site_config where id=1"))
def set_billing(**kw):
    b = json.loads(json.dumps(b0)); b.update(kw)
    sql(f"update public.site_config set billing=$j${json.dumps(b)}$j$ where id=1")
set_billing(costs={**b0['costs'], 'song': 0})
check('price 0 → free, row stored', as_(U1, "select (public.spend_song('k1')->>'charged')") + sql(f"select count(*) from public.charged_songs where user_id='{U1}'"), lambda o: o.startswith('0') and o.endswith('1'))
sql(f"insert into public.charged_songs(user_id,song_key) select '{U1}','f'||g from generate_series(1,3000) g")
check('free + 3000 today → answer ok, no new row', as_(U1, "select public.spend_song('k2')->>'free'") + ' ' + sql(f"select count(*) from public.charged_songs where user_id='{U1}'"), 'true 3001')
set_billing(costs={**b0['costs'], 'song': 1})
check('paid song is always recorded (bounded by points)', as_(U1, "select public.spend_song('k3')->>'charged'") + ' ' + sql(f"select count(*) from public.charged_songs where user_id='{U1}' and song_key='k3'"), '1 1')
check('paid again → already, no second charge', as_(U1, "select public.spend_song('k3')->>'already'"), 'true')
sql(f"update public.site_config set billing=$j${json.dumps(b0)}$j$ where id=1")

D.section('[S-22] payment routing fields: owner / full admin only')
plans = b0['plans']
def save(u, plans_, upsert=True, **kw):
    b = json.loads(sql("select billing from public.site_config where id=1")); b['plans'] = plans_; b.update(kw)
    j = json.dumps(b)
    if upsert:
        return as_(u, f"insert into public.site_config(id,title,announce,billing) values (1,'Chord Room','',$j${j}$j$) on conflict (id) do update set title=excluded.title, announce=excluded.announce, billing=excluded.billing returning 'saved'")
    return as_(u, f"update public.site_config set billing=$j${j}$j$ where id=1 returning 'saved'")
P = lambda **chg: [dict(p, **chg.get(p['id'], {})) for p in plans]
check('owner sets checkout links + variants', save(O, P(basic={'link': 'https://store.lemonsqueezy.com/buy/aaa', 'variant': '101'}, pro={'link': 'https://store.lemonsqueezy.com/buy/bbb', 'variant': '102'})), 'saved')
cur = json.loads(sql("select billing from public.site_config where id=1"))['plans']
check("settings role saves through the app's upsert (was: RLS error)", save(S, [dict(p) for p in cur], costs={**b0['costs'], 'sep': 6}), 'saved')
check('…the price change landed', sql("select billing->'costs'->>'sep' from public.site_config"), '6')
check('settings role changes prices/points/discount', save(S, [dict(p, price=p.get('price', 0) + 1, points=p['points'] + 5, discount=5) for p in cur]), 'saved')
cur = json.loads(sql("select billing from public.site_config where id=1"))['plans']
evil = [dict(p) for p in cur]; evil[0]['link'] = 'https://evil.example/checkout'
check('settings role re-points a checkout link → refused', save(S, evil), 'only the owner or a full admin')
check('…also with a plain UPDATE', save(S, evil, upsert=False), 'only the owner or a full admin')
ev2 = [dict(p) for p in cur]; ev2[1]['variant'] = '999'
check('settings role changes a variant id → refused', save(S, ev2), 'only the owner or a full admin')
ev3 = [dict(p) for p in cur]; ev3[2]['link'] = 'https://evil.example/s'
check('settings role adds a link to a plan without one → refused', save(S, ev3), 'only the owner or a full admin')
ev4 = [p for p in cur if p['id'] != 'basic']
check('settings role removes a plan that has a link → refused', save(S, ev4), 'only the owner or a full admin')
check('plans reordered (same links) is fine', save(S, list(reversed(cur))), 'saved')
check('stored link unchanged', sql("select p->>'link' from public.site_config c, jsonb_array_elements(c.billing->'plans') p where p->>'id'='basic'"), 'https://store.lemonsqueezy.com/buy/aaa')
check('full admin may change links', save(A, evil), 'saved')
check('plain user still cannot write site_config', save(U1, cur), 'row-level security')
check('anon cannot write site_config', save(None, cur), 'permission denied')

D.section('[S-23] no sign-up gift without an email (anonymous sessions)')
check('anonymous-style account: 0 points, ledger row written', sql(f"select credits||' '||(select count(*)||':'||sum(delta) from public.credit_ledger where user_id='{AN}' and reason='signup') from public.profiles where id='{AN}'"), '0 1:0')
check('normal account still gets the gift', sql(f"select credits > 0 from public.profiles where id='{U2}'"), 't')

D.section('assistant: confirmed accounts only + site-wide ceiling')
check('unconfirmed email → auth', as_(U3, "select public.assistant_use()->>'why'"), 'auth')
check('anonymous-style session (no email) → auth', as_(AN, "select public.assistant_use()->>'why'"), 'auth')
check('assistant_status agrees', as_(AN, "select public.assistant_status()->>'why'"), 'auth')
check('confirmed user ok', as_(U2, "select public.assistant_use()->>'ok'"), 'true')
sql("delete from private.assistant_site")
b = json.loads(sql("select billing from public.site_config where id=1")); b['assistant_site_daily'] = 2
sql(f"update public.site_config set billing=$j${json.dumps(b)}$j$ where id=1")
check('site message 1', as_(U1, "select public.assistant_use()->>'ok'"), 'true')
check('site message 2', as_(U2, "select public.assistant_use()->>'ok'"), 'true')
check('site message 3 → site_limit', as_(U2, "select public.assistant_use()->>'why'"), 'site_limit')
check('…and the user quota was not spent by the refusal', sql(f"select count from public.assistant_usage where user_id='{U2}' and day = private.assistant_today()"), '2')
check('admin is never refused by the site cap', as_(A, "select public.assistant_use()->>'ok'"), 'true')
check('owner too', as_(O, "select public.assistant_use()->>'ok'"), 'true')
check('admins are not counted', sql("select count from private.assistant_site"), '2')
b['assistant_site_daily'] = 0; sql(f"update public.site_config set billing=$j${json.dumps(b)}$j$ where id=1")
check('0 = no site cap', as_(U2, "select public.assistant_use()->>'ok'"), 'true')
b.pop('assistant_site_daily'); sql(f"update public.site_config set billing=$j${json.dumps(b)}$j$ where id=1")
def admin_save(v):
    bb = json.loads(sql("select billing from public.site_config where id=1")); bb['assistant_site_daily'] = v
    return as_(A, f"update public.site_config set billing=$j${json.dumps(bb)}$j$ where id=1 returning 'saved'")
check('admin sets assistant_site_daily = -1 → refused', admin_save(-1), 'bad billing: assistant_site_daily')
check('admin sets 2000000 → refused', admin_save(2000000), 'bad billing: assistant_site_daily')
check('admin sets 500 → saved', admin_save(500), 'saved')
check('private.assistant_site not readable by users', as_(U1, "select count(*) from private.assistant_site"), 'permission denied')

D.section('pay_webhook edge cases (re-verified)')
SECRET = 'v3-secret-0123456789abcdef'
check('not configured → refuses before anything', as_(None, "select public.pay_webhook('{}', 'aa')"), 'not configured')
sql(f"insert into private.settings(key,value) values ('lemon_signing_secret','{SECRET}') on conflict (key) do update set value=excluded.value")
hook = lambda body, sig=None: as_(None, f"select public.pay_webhook($B7x${body}$B7x$, '{pg.sign(body, SECRET) if sig is None else sig}')")
check('signed but not JSON → bad json (no event row)', hook('not json at all') + ' ' + sql("select count(*) from public.pay_events"), lambda o: 'bad json' in o)
check('signed JSON array → bad json', hook('[1,2,3]'), 'bad json')
check('270 KB body → bad body (before any HMAC work)', as_(None, "select public.pay_webhook(repeat('z', 270000), repeat('a', 64))"), 'bad body')
ok_body = json.dumps({'meta': {'event_name': 'order_created'}, 'data': {'type': 'orders', 'id': '1', 'attributes': {'updated_at': pg.now()}}})
check('uppercase hex signature accepted (no user → recorded, nothing granted)', hook(ok_body, pg.sign(ok_body, SECRET).upper()), 'no user')
check('same delivery again → duplicate', hook(ok_body), 'duplicate')
check('signature of a different body → bad signature', hook(ok_body.replace('order_created', 'order_refunded'), pg.sign(ok_body, SECRET)), 'bad signature')
check('empty signature → bad signature', hook(ok_body, ''), 'bad signature')
check('no events recorded for refused deliveries', sql("select count(*) from public.pay_events"), '1')

D.section('function hardening sweep (new functions included)')
check('every SECURITY DEFINER fn pins search_path',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))"), '0')
check('anon-callable definer fns = allow-list',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      lambda o: o.strip() == 'catalog_play,is_admin,pay_webhook,username_available')
check('no private.* function executable by API roles',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))"), '0')
check('API roles have no USAGE on schema private', sql("select has_schema_privilege('anon','private','usage') or has_schema_privilege('authenticated','private','usage')"), 'f')
check('no table in public without RLS', sql("select coalesce(string_agg(c.relname, ','), 'none') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity"), 'none')
check('no TRUNCATE for API roles on any public table', sql("select count(*) from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')"), '0')

D.section('supabase/security_v3.sql = the schema block + assistant.sql, verbatim')
src = open(pg.SCHEMA, encoding='utf-8').read()
v3 = open(os.path.join(pg.REPO, 'supabase', 'security_v3.sql'), encoding='utf-8').read()
asql = open(pg.ASSISTANT, encoding='utf-8').read()
m = re.search(r'\n(-- =+\n-- Security v3 .*?-- \[security-v3:end\]\n-- =+\n)', src, re.S)
check('schema.sql has the [security-v3] block', 'found' if m else 'missing', 'found')
# acct: only later blocks ([accounts-v4]) may follow it
later = re.sub(r'(?s)-- =+\n-- Accounts v4 .*?-- \[accounts-v4:end\]\n-- =+\n', '', src[m.end():]) if m else src
check('the block is the LAST thing in schema.sql (only later blocks after it)', 'last' if m and later.strip() == '' else 'not last', lambda o: o == 'last')
check('security_v3.sql contains the block verbatim', 'yes' if m and m.group(1) in v3 else 'no', 'yes')
check('security_v3.sql ends with assistant.sql verbatim', 'yes' if v3.endswith(asql) else 'no', 'yes')

D.section('security_v3.sql on an install from before v3 (run twice)')
old = src[:m.start() + 1] if m else src
tmp = '/tmp/chordroom_schema_pre_v3.sql'
open(tmp, 'w', encoding='utf-8').write(old)
pg.psql('postgres', 'drop database if exists secv3old'); pg.psql('postgres', 'create database secv3old')
pg.psql('secv3old', sql=pg.STUB)
check('pre-v3 schema loads', str(pg.errs(pg.psql('secv3old', f=tmp))), '[]')
check('pre-v3 assistant.sql (current file) loads', str(pg.errs(pg.psql('secv3old', f=pg.ASSISTANT))), '[]')
V3 = os.path.join(pg.REPO, 'supabase', 'security_v3.sql')
check('security_v3.sql run 1', str(pg.errs(pg.psql('secv3old', f=V3))), '[]')
check('security_v3.sql run 2 (idempotent)', str(pg.errs(pg.psql('secv3old', f=V3))), '[]')
pg.psql('secv3old', f"insert into auth.users(id,email) values ('{O}','o@x')")
o = pg.psql('secv3old', "set role anon; select public.catalog_play('dz:123456789'); reset role; select count(*) from private.catalog_play_log;")
check('after v3: anon play-log fill closed', o.strip().splitlines()[-1] if o.strip() else o, '0')
check('after v3: settings INSERT policy present', pg.psql('secv3old', "select count(*) from pg_policies where tablename='site_config' and policyname='config: perm settings insert'"), '1')
check('after v3: pay guard trigger present', pg.psql('secv3old', "select count(*) from pg_trigger where tgname='site_config_guard_pay'"), '1')
pg.psql('postgres', 'drop database if exists secv3old')

D.finish()
