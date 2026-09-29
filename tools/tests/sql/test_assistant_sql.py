"""supabase/assistant.sql on top of schema.sql: assistant_use()/assistant_status() quota RPCs (daily limit per plan,
burst limit, admins unlimited, blocked/off), assistant_usage table privileges + RLS, admin-settable limits with
validation in site_config.billing, idempotent re-runs of both files."""
import os, sys, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg

D = pg.Db('asstdb', assistant=True)
check, as_, sql = D.check, D.as_, D.sql
O='00000000-0000-0000-0000-0000000000f0'; A='00000000-0000-0000-0000-0000000000a0'; U1='00000000-0000-0000-0000-0000000000d1'
U2='00000000-0000-0000-0000-0000000000d2'; P='00000000-0000-0000-0000-0000000000c1'; X='00000000-0000-0000-0000-0000000000e0'
M='00000000-0000-0000-0000-0000000000b0'
for uid, mail, un in [(O,'o@x','owner'),(A,'a@x','adminA'),(M,'m@x','moder'),(U1,'u1@x','userone'),(U2,'u2@x','usertwo'),(P,'p@x','payer'),(X,'x@x','blocky')]:
    D.user(uid, mail, un)
sql(f"update public.profiles set role='admin' where id='{A}'")
sql(f"update public.profiles set blocked=true where id='{X}'")
sql(f"update public.profiles set plan='pro', plan_until=now()+interval '10 days' where id='{P}'")
as_(O, "select public.owner_save_role('moderator','Moderator',array['activity'])")
sql(f"update public.profiles set role='moderator' where id='{M}'")

D.section('basics')
check('anon assistant_use refused', as_(None, 'select public.assistant_use()'), 'permission denied')
check('anon assistant_status refused', as_(None, 'select public.assistant_status()'), 'permission denied')
r = as_(U1, 'select public.assistant_use()'); j = json.loads(r)
check('user first use ok, left 29 of 30', r, lambda o: j['ok'] and j['left']==29 and j['limit']==30)
check('returns plan + credits', r, lambda o: j['me']=={'plan':'free','credits':20})
check('returns public prices (no links)', r, lambda o: j['billing']['costs']=={'sep':5,'stems':2} and len(j['billing']['plans'])==3 and 'link' not in json.dumps(j['billing']) and j['billing']['currency']=='ILS')
check('status shows 29 left', as_(U1, 'select public.assistant_status()'), lambda o: json.loads(o)=={'ok':True,'left':29,'limit':30})
check('activity row "assistant" without detail', sql(f"select count(*)||':'||coalesce(max(detail),'NULL') from public.activity where user_id='{U1}' and action='assistant'"), '1:NULL')

D.section('direct table access')
check('user insert usage', as_(U1, f"insert into public.assistant_usage(user_id,day,count) values ('{U1}','2020-01-01',0)"), 'permission denied')
check('user update own usage', as_(U1, "update public.assistant_usage set count=0"), 'permission denied')
check('user delete own usage', as_(U1, "delete from public.assistant_usage"), 'permission denied')
check('anon select usage', as_(None, "select * from public.assistant_usage"), 'permission denied')
check('user sees own row only', as_(U1, "select count(*) from public.assistant_usage"), '1')
as_(U2, 'select public.assistant_use()')
check('user does not see others', as_(U1, f"select count(*) from public.assistant_usage where user_id='{U2}'"), '0')
check('activity-perm moderator sees all', as_(M, "select count(*) from public.assistant_usage"), '2')
check('user calls private.assistant_limit', as_(U1, "select private.assistant_today()"), 'permission denied')

D.section('burst + daily limit')
outs = [json.loads(as_(U1, 'select public.assistant_use()')) for _ in range(8)]
check('8/min burst → 8th call slow', json.dumps(outs[-1]), lambda o: outs[6]['ok'] and outs[7]=={'ok':False,'why':'slow'})
check('slow call did not count', as_(U1, 'select public.assistant_status()'), '"left": 22')
sql(f"update public.assistant_usage set burst_at = now() - interval '2 minutes' where user_id='{U1}'")
sql(f"update public.assistant_usage set count = 29 where user_id='{U1}'")
check('30th message ok, left 0', as_(U1, 'select public.assistant_use()'), '"left": 0')
check('31st → limit', as_(U1, 'select public.assistant_use()'), lambda o: json.loads(o)=={'ok':False,'why':'limit','left':0,'limit':30})
check('count stays 30', sql(f"select count from public.assistant_usage where user_id='{U1}'"), '30')
check('yesterday does not count', (sql(f"update public.assistant_usage set day = day - 1 where user_id='{U1}'"), as_(U1, 'select public.assistant_use()'))[1], '"left": 29')

D.section('plans, admins, blocked, off')
r=json.loads(as_(P, 'select public.assistant_use()'))
check('paid plan → 150/day', json.dumps(r), lambda o: r['limit']==150 and r['left']==149)
sql(f"update public.profiles set plan_until=now()-interval '1 day' where id='{P}'")
check('expired plan → back to 30', as_(P, 'select public.assistant_use()'), '"limit": 30')
r=json.loads(as_(A, 'select public.assistant_use()'))
check('admin unlimited (left/limit null)', json.dumps(r), lambda o: r['ok'] and r['left'] is None and r['limit'] is None)
check('owner unlimited', as_(O, 'select public.assistant_use()'), lambda o: json.loads(o)['limit'] is None)
check('custom role (moderator) has normal limit', as_(M, 'select public.assistant_use()'), '"limit": 30')
check('blocked refused', as_(X, 'select public.assistant_use()'), '"why": "blocked"')
check('blocked status refused', as_(X, 'select public.assistant_status()'), '"why": "blocked"')
check('blocked usage not counted', sql(f"select count(*) from public.assistant_usage where user_id='{X}'"), '0')
sql(f"update public.profiles set role='admin', blocked=true where id='{A}'")
check('blocked admin refused', as_(A, 'select public.assistant_use()'), '"why": "blocked"')
sql(f"update public.profiles set blocked=false where id='{A}'")
check('admin sets limits via billing', as_(A, """update public.site_config set billing = billing || '{"assistant_daily": 5, "assistant_daily_plan": 50}' where id=1 returning 'ok'"""), 'ok')
check('new limit applies (5)', as_(U2, 'select public.assistant_use()'), lambda o: json.loads(o)['limit']==5 and json.loads(o)['left']==3)
check('bad assistant_daily refused', as_(A, """update public.site_config set billing = billing || '{"assistant_daily": -3}' where id=1"""), 'bad billing: assistant_daily')
check('bad assistant_daily_plan refused', as_(A, """update public.site_config set billing = billing || '{"assistant_daily_plan": "lots"}' where id=1"""), 'bad billing: assistant_daily_plan')
check('bad assistant flag refused', as_(A, """update public.site_config set billing = billing || '{"assistant": "no"}' where id=1"""), 'bad billing: assistant')
check('plain user cannot change billing', as_(U1, """update public.site_config set billing = billing || '{"assistant_daily": 9999}' where id=1 returning 'x'"""), lambda o: 'x' not in o)
check('assistant off (admin)', as_(A, """update public.site_config set billing = billing || '{"assistant": false}' where id=1 returning 'ok'"""), 'ok')
check('off → user refused', as_(U2, 'select public.assistant_use()'), '"why": "off"')
check('off → status says off', as_(U2, 'select public.assistant_status()'), '"why": "off"')
check('off → admin still allowed', as_(A, 'select public.assistant_use()'), '"ok": true')
sql("""update public.site_config set billing = billing - 'assistant' - 'assistant_daily' - 'assistant_daily_plan' where id=1""")
check('defaults again (30)', as_(U2, 'select public.assistant_use()'), '"limit": 30')
check('schema.sql re-run after assistant.sql: errors', str(pg.errs(D.file(pg.SCHEMA))), '[]')
check('assistant.sql re-run: errors', str(pg.errs(D.file(pg.ASSISTANT))), '[]')
check('usage survives re-run', as_(U2, 'select public.assistant_status()'), '"left": ')
D.finish()
