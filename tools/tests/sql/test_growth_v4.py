"""Growth v4 — the [growth-v4] block at the end of supabase/schema.sql (= supabase/growth_v4.sql, checked verbatim and
applied twice on an install from before it):

  G-1 site_config.analytics {ga4, clarity, gsc}: formats validated, only the owner / a full admin may change them (a
      'settings' role must not re-point Clarity recordings to its own project), a settings role's normal upsert still
      saves; site_config.experiments validated (ids, 2–4 variants, conversion action, note), settings role may edit
  G-2 ab_results(exp, conversion, days): per-variant assigned / converted from activity 'ab_assign', first assignment
      per member, conversions only AFTER the assignment, conversion from the experiment config, 'activity' perm only
  G-3 reviews: real members only (confirmed + used the site), one per account, ≤ 400 chars, no links, offensive-word
      filter (private.is_offensive when it exists, else the minimal built-in list), ≤ 5 saves a day, every save back
      to 'pending', RLS (own row only, no direct writes, anon nothing), reviews_public() = approved only with initials
      unless the member opted in, aggregate count/avg, blocked authors disappear, moderation by the 'catalog' perm
"""
import os, sys, re, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg

D = pg.Db('growthv4')
check, as_, sql = D.check, D.as_, D.sql
def ok(label, cond, info=''): return check(label, 'yes' if cond else 'no | ' + str(info), 'yes')

O = '00000000-0000-0000-0000-0000000000f0'   # owner (first account)
A = '00000000-0000-0000-0000-0000000000a0'   # full admin
S = '00000000-0000-0000-0000-0000000000a5'   # custom role: settings only
M = '00000000-0000-0000-0000-0000000000a6'   # custom role: catalog (content moderation)
V = '00000000-0000-0000-0000-0000000000a7'   # custom role: activity (reads the log → A/B results)
U1 = '00000000-0000-0000-0000-0000000000d1'
U2 = '00000000-0000-0000-0000-0000000000d2'
U3 = '00000000-0000-0000-0000-0000000000d3'  # email not confirmed
U4 = '00000000-0000-0000-0000-0000000000d4'
X = '00000000-0000-0000-0000-0000000000e1'   # blocked later

D.section('accounts + roles')
for uid, mail, un in [(O, 'o@x', 'owner'), (A, 'a@x', 'adminA'), (S, 's@x', 'setter'), (M, 'm@x', 'moder'), (V, 'v@x', 'viewer'),
                      (U1, 'u1@x', 'userone'), (U2, 'u2@x', 'usertwo'), (U3, 'u3@x', 'userthree'), (U4, 'u4@x', 'userfour'), (X, 'x@x', 'baduser')]:
    D.user(uid, mail, un)
sql(f"update auth.users set email_confirmed_at = null where id = '{U3}'")
sql(f"update public.profiles set display_name = 'Dana Levi' where id = '{U1}'")
sql(f"update public.profiles set display_name = '' where id = '{U2}'")
as_(O, "select public.owner_set_role_password('RolePass#2026')")
as_(O, f"select public.admin_set_role('{A}','admin','RolePass#2026')")
as_(O, "select public.owner_save_role('setter','Settings',array['settings'])")
as_(O, "select public.owner_save_role('moder','Moderator',array['catalog'])")
as_(O, "select public.owner_save_role('viewer','Viewer',array['activity'])")
for u, r in [(S, 'setter'), (M, 'moder'), (V, 'viewer')]:
    check(f'owner gives {r}', as_(O, f"select public.admin_set_role('{u}','{r}','RolePass#2026')"), 'ok')

D.section('[G-1] analytics ids: owner / full admin only, formats validated')
check('defaults: analytics {} and experiments []', sql("select analytics::text||' '||experiments::text from public.site_config where id=1"), '{} []')
check('owner sets GA4 + Clarity + GSC', as_(O, """update public.site_config set analytics='{"ga4":"G-AB12CD34EF","clarity":"k3x9pq2abc","gsc":"aBcD_eFgH-1234567890xyz"}' where id=1 returning 'ok'"""), 'ok')
check('anon reads the ids (the page needs them)', as_(None, "select analytics->>'ga4' from public.site_config where id=1"), 'G-AB12CD34EF')
check('full admin may change them', as_(A, """update public.site_config set analytics='{"ga4":"G-ZZZZ1111","clarity":"k3x9pq2abc"}' where id=1 returning 'ok'"""), 'ok')
check("'settings' role may NOT change analytics ids", as_(S, """update public.site_config set analytics='{"clarity":"evil123456"}' where id=1 returning 'ok'"""), 'only the owner or a full admin')
check('…and the value is unchanged', sql("select analytics->>'clarity' from public.site_config where id=1"), 'k3x9pq2abc')
check("'settings' role: the app's upsert of the other settings still saves",
      as_(S, "insert into public.site_config(id,title,announce,lang,ai,dl,require_login,allow_signup) values (1,'T2','','he',true,true,false,true) on conflict (id) do update set title=excluded.title returning title"), 'T2')
check('…analytics kept by that upsert', sql("select analytics->>'ga4' from public.site_config where id=1"), 'G-ZZZZ1111')
check('plain member cannot write (RLS: 0 rows)', as_(U1, """update public.site_config set analytics='{}' where id=1""") + sql("select analytics->>'ga4' from public.site_config where id=1"), 'G-ZZZZ1111')
for label, val, want in [('Universal Analytics id refused', '{"ga4":"UA-12345-1"}', 'bad analytics: ga4'),
                         ('markup in GA4 refused', '{"ga4":"G-<script>"}', 'bad analytics: ga4'),
                         ('lower-case GA4 refused', '{"ga4":"g-abc12345"}', 'bad analytics: ga4'),
                         ('Clarity with capitals refused', '{"clarity":"ABCDEFG"}', 'bad analytics: clarity'),
                         ('Clarity too short refused', '{"clarity":"abc"}', 'bad analytics: clarity'),
                         ('GSC with spaces / quotes refused', '{"gsc":"abc def\\" onload=x"}', 'bad analytics: gsc'),
                         ('unknown key refused', '{"fbpixel":"123"}', 'unknown key'),
                         ('non-string value refused', '{"ga4":123}', 'bad analytics'),
                         ('array refused', '[]', 'bad analytics')]:
    check(label, as_(O, f"update public.site_config set analytics='{val}' where id=1 returning 'ok'"), want)
check('empty strings = off (allowed)', as_(O, """update public.site_config set analytics='{"ga4":"","clarity":"","gsc":""}' where id=1 returning 'ok'"""), 'ok')

D.section('[G-1] experiments: settings role, validated')
good = '[{"id":"home_cta","on":true,"variants":["a","b"],"conversion":"song_upload","note":"hero button text"}]'
check("'settings' role saves an experiment", as_(S, f"update public.site_config set experiments='{good}' where id=1 returning 'ok'"), 'ok')
for label, val, want in [('bad id', '[{"id":"Home CTA","variants":["a","b"]}]', 'bad experiments: id'),
                         ('duplicate id', '[{"id":"x1","variants":["a","b"]},{"id":"x1","variants":["a","b"]}]', 'bad experiments: id'),
                         ('one variant', '[{"id":"x1","variants":["a"]}]', 'variants'),
                         ('five variants', '[{"id":"x1","variants":["a","b","c","d","e"]}]', 'variants'),
                         ('duplicate variant', '[{"id":"x1","variants":["a","a"]}]', 'variant name'),
                         ('variant with markup', '[{"id":"x1","variants":["a","<b>"]}]', 'variant name'),
                         ('bad conversion', '[{"id":"x1","variants":["a","b"],"conversion":"drop table"}]', 'conversion'),
                         ('note with markup', '[{"id":"x1","variants":["a","b"],"note":"<img src=x>"}]', 'note'),
                         ('on not boolean', '[{"id":"x1","variants":["a","b"],"on":"yes"}]', 'bad experiments: on'),
                         ('unknown key', '[{"id":"x1","variants":["a","b"],"weights":[1,2]}]', 'unknown key'),
                         ('11 experiments', '[' + ','.join('{"id":"e%d","variants":["a","b"]}' % i for i in range(11)) + ']', 'bad experiments')]:
    check(f'experiments: {label} refused', as_(S, f"update public.site_config set experiments='{val}' where id=1 returning 'ok'"), want)
check('plain member cannot change experiments', as_(U1, "update public.site_config set experiments='[]' where id=1") + sql("select jsonb_array_length(experiments) from public.site_config where id=1"), '1')

D.section('[G-2] ab_results')
# U1 a (converts after), U2 b (converted BEFORE assignment → not counted), U4 b (converts), O a (no conversion); U1 re-assigned b later (first wins)
sql(f"""insert into public.activity(user_id,action,detail,created_at) values
  ('{U1}','ab_assign','home_cta:a', now()-interval '5 days'), ('{U1}','song_upload','x.mp3', now()-interval '4 days'),
  ('{U1}','ab_assign','home_cta:b', now()-interval '3 days'),
  ('{U2}','song_upload','y.mp3', now()-interval '6 days'), ('{U2}','ab_assign','home_cta:b', now()-interval '5 days'),
  ('{U4}','ab_assign','home_cta:b', now()-interval '2 days'), ('{U4}','song_upload','z.mp3', now()-interval '1 days'),
  ('{O}','ab_assign','home_cta:a', now()-interval '1 days'),
  ('{U3}','ab_assign','home_cta:a', now()-interval '200 days'),
  ('{U3}','ab_assign','other_exp:a', now()-interval '1 days')""")
r = as_(V, "select public.ab_results('home_cta')::text")
check('conversion taken from the experiment config', r, '"conversion": "song_upload"')
check('variant a: 2 assigned (first assignment per member), 1 converted', r, '{"rate": 50.0, "variant": "a", "assigned": 2, "converted": 1}')
check('variant b: 2 assigned, 1 converted (conversion before assignment ignored)', r, '{"rate": 50.0, "variant": "b", "assigned": 2, "converted": 1}')
ok('older than the window excluded (90 days)', 'assigned": 3' not in r, r)
check('explicit conversion action', as_(V, "select public.ab_results('home_cta','sign_in',30)->'variants'->0->>'converted'"), '0')
check('365-day window includes the old row', as_(V, "select public.ab_results('home_cta',null,1000)->'variants'->0->>'assigned'"), '3')
check('full admin may read', as_(A, "select public.ab_results('home_cta')->>'experiment'"), 'home_cta')
check('plain member refused', as_(U1, "select public.ab_results('home_cta')"), 'not allowed')
check("'settings' role without 'activity' refused", as_(S, "select public.ab_results('home_cta')"), 'not allowed')
check('anon cannot execute', as_(None, "select public.ab_results('home_cta')"), 'permission denied')
check('bad experiment name refused', as_(V, "select public.ab_results('x'' or 1=1')"), 'bad experiment')
check('bad conversion refused', as_(V, "select public.ab_results('home_cta','x;drop')"), 'bad conversion')

D.section('[G-3] reviews: eligibility')
R = lambda u, rating=5, body='Great tool for practising', show='false', lang='en': as_(u, f"select public.review_submit({rating}, $q${body}$q$, {show}, '{lang}')::text")
sql(f"delete from public.activity where user_id in ('{U1}','{U2}','{U4}')")
check('anon cannot call review_submit', as_(None, "select public.review_submit(5,'x')"), 'permission denied')
check('member who never exported → not_eligible', R(U1), '"error": "not_eligible"')
sql(f"insert into public.activity(user_id,action,detail) values ('{U1}','export','song.wav'),('{U2}','separate','s'),('{U3}','export','x')")
sql(f"insert into public.downloads(user_id,song_name) values ('{U4}','zip')")
check('unconfirmed email → not_eligible (even after an export)', R(U3), '"error": "not_eligible"')
check('after an export → saved as pending', R(U1, 5, 'אחלה כלי, האקורדים מדויקים', 'true', 'he'), '"status": "pending"')
check('a download also counts as use', R(U4, 4, 'Solid stems'), '"ok": true')

D.section('[G-3] reviews: validation, filter, limits')
check('rating 0 refused', R(U2, 0), 'bad_rating')
check('rating 6 refused', R(U2, 6), 'bad_rating')
check('401 characters refused', R(U2, 4, 'a' * 401), 'too_long')
check('400 characters fine', R(U2, 4, 'b' * 400), '"ok": true')
check('link refused (https)', R(U2, 4, 'see https://spam.example now'), 'links')
check('link refused (www.)', R(U2, 4, 'visit www.spam.biz'), 'links')
check('bare domain refused', R(U2, 4, 'go to cheapstems.com today'), 'links')
check('English profanity refused', R(U2, 1, 'this is shit'), 'offensive')
check('Hebrew insult refused', R(U2, 1, 'אתה מניאק'), 'offensive')
check('Russian profanity refused', R(U2, 1, 'полная хуй'), 'offensive')
check('Spanish profanity refused', R(U2, 1, 'una mierda'), 'offensive')
check('innocent words containing a bad one are fine ("Scunthorpe", "shitake"-free)', R(U2, 4, 'Classic Scunthorpe problem avoided'), '"ok": true')
check('control characters cleaned', R(U2, 4, 'line1' + chr(1) + 'line2') + sql(f"select body from public.reviews where user_id='{U2}'"), 'line1 line2')
for i in range(2):
    R(U2, 4, f'edit {i}')
check('6th save of the day refused', R(U2, 4, 'one more'), '"error": "rate"')
sql(f"update public.reviews set edit_day = current_date - 1 where user_id='{U2}'")
check('next day: allowed again', R(U2, 3, 'Next day edit'), '"ok": true')
check('one row per account', sql(f"select count(*) from public.reviews where user_id='{U2}'"), '1')
print('  agent A\'s private.is_offensive is used when it exists')
# merge: schema.sql now carries [accounts-v4] (the real private.is_offensive(p text)) before this block. Park it under
# another name for the stub check (same OID, nothing is dropped) and put it back afterwards.
had_a = sql("select to_regprocedure('private.is_offensive(text)') is not null") == 't'
if had_a:
    sql("alter function private.is_offensive(text) rename to is_offensive_parked")
sql("create or replace function private.is_offensive(t text) returns boolean language sql immutable as $$ select t ilike '%banana%' $$")
check('private.is_offensive(text) takes over', R(U2, 3, 'I love banana bread'), 'offensive')
check('…and the built-in list is no longer consulted', R(U2, 3, 'this is shit'), '"ok": true')
sql("drop function private.is_offensive(text)")
if had_a:
    sql("alter function private.is_offensive_parked(text) rename to is_offensive")
    sql("select private.bw_put('zzgrowthword', 'word', 'en', false)")      # an admin-added word exists only in A's list
    check("with [accounts-v4] installed: its admin word list applies to reviews", R(U2, 3, 'a zzgrowthword here'), 'offensive')
R(U2, 3, 'Back to normal words')

D.section('[G-3] reviews: RLS')
check('anon cannot read the table', as_(None, "select count(*) from public.reviews"), 'permission denied')
check('member sees only their own row', as_(U1, "select count(*)||':'||min(rating) from public.reviews"), '1:5')
check('member cannot insert directly', as_(U1, f"insert into public.reviews(user_id,rating,status) values ('{U3}',5,'approved')"), 'permission denied')
check('member cannot approve their own review', as_(U1, "update public.reviews set status='approved' where user_id=auth.uid()"), 'permission denied')
check('member cannot delete rows directly', as_(U1, "delete from public.reviews"), 'permission denied')
check('nothing public while pending', as_(None, "select public.reviews_public()::text"), '"count": 0')

D.section('[G-3] reviews: moderation + public list')
check('plain member cannot list for moderation', as_(U1, "select public.admin_reviews()"), 'not allowed')
check("'settings' role cannot moderate", as_(S, "select public.admin_reviews()"), 'not allowed')
lst = as_(M, "select public.admin_reviews()::text")
ok("'catalog' moderator lists all reviews (pending first)", lst.count('"status": "pending"') == 3, lst[:200])
ok('moderation list never carries emails', '@' not in lst, '')
id1 = sql(f"select id from public.reviews where user_id='{U1}'"); id2 = sql(f"select id from public.reviews where user_id='{U2}'"); id4 = sql(f"select id from public.reviews where user_id='{U4}'")
check('moderator approves + features U1', as_(M, f"select public.admin_review_set({id1},'approved',true)"), 'ok')
check('full admin approves U4', as_(A, f"select public.admin_review_set({id4},'approved',false)"), 'ok')
check('hidden can never be featured', as_(M, f"select public.admin_review_set({id2},'hidden',true)") + sql(f"select featured from public.reviews where id={id2}"), 'okf')
check('bad status refused', as_(M, f"select public.admin_review_set({id2},'deleted')"), 'bad status')
check('missing id → missing', as_(M, "select public.admin_review_set(999999,'approved')"), 'missing')
check('plain member cannot moderate', as_(U2, f"select public.admin_review_set({id2},'approved',true)"), 'not allowed')
pub = as_(None, "select public.reviews_public()::text")
check('anon sees exactly the 2 approved reviews', pub, '"count": 2')
check('aggregate average (5 + 4) / 2', pub, '"avg": 4.50')
ok('featured first', re.search(r'"items": \[\{[^}]*"featured": true', pub) is not None, pub[:160])
ok('opted-in name shown', '"name": "Dana Levi"' in pub, pub[:200])
ok('no opt-in → initials only', '"name": "U."' in pub and 'userfour' not in pub, pub[:300])
ok('no ids / emails / usernames in the public list', not any(x in pub for x in ['user_id', '@x', U1, 'usertwo']), '')
ok('hidden review not public', 'Back to normal' not in pub, '')
print('  an edit after approval goes back to pending')
check('U1 edits the approved review', R(U1, 2, 'Changed my mind a bit'), '"status": "pending"')
check('…no longer public and no longer featured', as_(None, "select public.reviews_public()->>'count'") + sql(f"select featured from public.reviews where id={id1}"), '1f')
as_(M, f"select public.admin_review_set({id1},'approved',false)")
sql(f"update public.profiles set blocked = true where id='{U4}'")
check('a blocked author disappears from the public list', as_(None, "select public.reviews_public()->>'count'"), '1')
check('blocked member cannot submit', R(U4, 5, 'hi'), 'blocked')
sql(f"update public.profiles set blocked = false where id='{U4}'")
check('limit is clamped (p_limit 0 → 1 item)', as_(None, "select jsonb_array_length(public.reviews_public(0)->'items')"), '1')
check('review_delete removes only my own review', as_(U1, "select public.review_delete()") + sql(f"select count(*) from public.reviews where user_id='{U1}'") + sql("select count(*) from public.reviews"), '02')
check('deleting the account removes the review (cascade)', sql(f"delete from auth.users where id='{U2}'") + sql("select count(*) from public.reviews"), '1')

D.section('hardening sweep (new objects)')
check('every SECURITY DEFINER fn pins search_path',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))"), '0')
check('new anon-callable definer fn = reviews_public only',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      lambda o: o.strip() == 'catalog_play,is_admin,pay_webhook,reviews_public,username_available')
check('private.guard_growth / growth_offensive not executable by API roles',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('guard_growth','growth_offensive') and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))"), '0')
check('reviews has RLS', sql("select relrowsecurity from pg_class where relname='reviews'"), 't')

D.section('supabase/growth_v4.sql = the schema block, verbatim; applied twice on an older install')
schema = open(pg.SCHEMA, encoding='utf-8').read()
g4 = open(os.path.join(pg.REPO, 'supabase', 'growth_v4.sql'), encoding='utf-8').read()
m = re.search(r'(-- =+\n-- Growth v4[^\n]*\n-- \[growth-v4:begin\].*?-- \[growth-v4:end\]\n-- =+\n)', schema, re.S)
check('block found in schema.sql', 'yes' if m else 'no', 'yes')
check('growth_v4.sql ends with the block verbatim', 'yes' if m and g4.endswith(m.group(1)) else 'no', 'yes')
check('the block is the last thing in schema.sql', 'yes' if m and schema.endswith(m.group(1)) else 'no', 'yes')
old = schema[:m.start()] if m else schema
tmp = tempfile.NamedTemporaryFile('w', suffix='.sql', delete=False, encoding='utf-8'); tmp.write(old); tmp.close()
pg.psql('postgres', 'drop database if exists growthold'); pg.psql('postgres', 'create database growthold')
pg.psql('growthold', pg.STUB)
check('pre-v4 schema loads', str(pg.errs(pg.psql('growthold', f=tmp.name))), '[]')
pg.psql('growthold', f"insert into auth.users(id,email) values ('{O}','o@x')")
pg.psql('growthold', "update public.site_config set title='kept' where id=1")
G4 = os.path.join(pg.REPO, 'supabase', 'growth_v4.sql')
check('growth_v4.sql run 1', str(pg.errs(pg.psql('growthold', f=G4))), '[]')
check('growth_v4.sql run 2 (idempotent)', str(pg.errs(pg.psql('growthold', f=G4))), '[]')
check('existing settings kept, new columns defaulted', pg.psql('growthold', "select title||' '||analytics::text||' '||experiments::text from public.site_config where id=1"), 'kept {} []')
check('schema.sql over it again still loads', str(pg.errs(pg.psql('growthold', f=pg.SCHEMA))), '[]')
os.unlink(tmp.name)
pg.psql('postgres', 'drop database if exists growthold')

D.finish()
