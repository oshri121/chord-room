"""Referral v6 (owner's decision 2026-10): the [referral-v6] block = the LAST block of supabase/schema.sql
(= supabase/referral_v6.sql, checked verbatim, run after security_v5.sql the way the owner runs it — see pg.py).

  R6-1 claim_referral only records the pending relation (private.referrals): no points for the friend (only the normal
       sign-up gift) and none for the inviter; every [V5-6] check stays
  R6-2 the inviter gets billing.referral (capped by billing.referral_max per 30 days) on the friend's FIRST real PayPal
       payment (PAYMENT.SALE.COMPLETED, amount > 0; also a sale granted late on ACTIVATED); once per friend, ever;
       sandbox sales only for admin accounts (the webhook's rule); sign-ups from before v6 reward no one again
  R6-3 a full refund / reversal of that sale takes the reward back (once, never below 0)
  R6-4 one claim per (inviter, network) ever + 3 claims per network in 30 days → why 'device'; only a salted hash of
       the IP (cf-connecting-ip, else the first x-forwarded-for value; IPv6 /64); no header → rule skipped
  R6-5 my_referral → {code, invited, joined, paid, pending, earned}
"""
import os, sys, json, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pg

D = pg.Db('refv6', assistant=True)      # schema.sql ×3, assistant.sql ×2, security_v5.sql ×2, referral_v6.sql ×2
check, as_, sql = D.check, D.as_, D.sql
lit = lambda s: "'" + str(s).replace("'", "''") + "'"
V6 = pg.REFERRAL_V6
RELAY = 'relay-secret-for-tests-0123456789'

O = '00000000-0000-0000-0000-0000000006f0'    # owner (first account)
I = '00000000-0000-0000-0000-000000000610'    # inviter
I2 = '00000000-0000-0000-0000-000000000611'   # a second inviter
F = ['00000000-0000-0000-0000-0000000006%02d' % (0x20 + k) for k in range(10)]   # friends F[0]…F[9]
L = '00000000-0000-0000-0000-000000000640'    # joined before v6 (old rule: referred_by set, already rewarded)
N = '00000000-0000-0000-0000-000000000650'    # a new member without an invite (compare the sign-up gift)

D.section('accounts')
D.user(O, 'o@x', 'owner'); D.user(I, 'inviter@x.com', 'inviter'); D.user(I2, 'inviter2@x.com', 'invitertwo')
for k, uid in enumerate(F): D.user(uid, f'friend{k}@y.com', f'friend{k}')
D.user(L, 'legacy@y.com', 'legacyone'); D.user(N, 'plain@y.com', 'plainone')
b0 = json.loads(sql("select billing from public.site_config where id=1"))
b = json.loads(json.dumps(b0)); b.update(referral=15, referral_max=2, on=True)
for p in b.get('plans', []):
    if p.get('id') == 'basic': p['variant'] = 'P-BASIC0000001'
sql(f"update public.site_config set billing=$j${json.dumps(b)}$j$ where id=1")
check('fixture: basic plan has a PayPal plan id', sql("select private.pp_plan_of('P-BASIC0000001')"), 'basic')
sql(f"insert into private.settings(key,value) values ('paypal_relay_secret','{RELAY}') on conflict (key) do update set value=excluded.value")
bal = lambda uid: sql(f"select credits from public.profiles where id='{uid}'")
GIFT = bal(N)

D.section('supabase/referral_v6.sql = the last block of schema.sql, verbatim')
src = open(pg.SCHEMA, encoding='utf-8').read()
v6 = open(V6, encoding='utf-8').read()
m = re.search(r'\n(-- =+\n-- Referral v6 .*?-- \[referral-v6:end\]\n-- =+\n)', src, re.S)
check('schema.sql has the [referral-v6] block', 'found' if m else 'missing', 'found')
# notify v7 (owner SMS alerts) comes after it: it only adds its own objects, nothing of v6 is redefined
src_nv7 = re.sub(r'(?s)\n*-- \[notify-v7:begin\].*?-- \[notify-v7:end\]\n*$', '\n', src)
check('the block is the LAST thing in schema.sql (only [notify-v7] after it)', 'yes' if m and src_nv7.endswith(m.group(1)) else 'no', 'yes')
check('…after [security-v5]', 'yes' if m and src.index('[security-v5:end]') < m.start() else 'no', 'yes')
check('referral_v6.sql = the block', 'yes' if m and v6.endswith(m.group(1)) and all(l.startswith('--') or not l.strip() for l in v6[:v6.index(m.group(1))].splitlines()) else 'no', 'yes')
check('referral_v6.sql run 3 (idempotent)', str(pg.errs(D.file(V6))), '[]')
blk = m.group(1) if m else ''
check('no dynamic SQL in the block', 'ok' if not re.search(r'\bexecute\s+(?!function\b|on\b)', '\n'.join(l for l in blk.splitlines() if not l.strip().startswith('--'))) else 'bad', 'ok')

def claim(uid, code, headers=None):
    pre = f"set request.headers={lit(json.dumps(headers))};" if headers is not None else ''
    o = pg.psql(D.name, f"set role authenticated; set request.jwt.claim.sub='{uid}';" + pre + f"select public.claim_referral({lit(code)})")
    e = pg.errs(o)
    return e[0] if e else (o.splitlines()[-1] if o else '')

D.section('[R6-1] claim records a pending invite, no points for anyone')
code = as_(I, "select public.my_referral()->>'code'")
check("fixture: inviter's code", code, lambda o: re.fullmatch(r'[0-9a-f]{8}', o) is not None)
i0 = bal(I)
r = claim(F[0], code, {'cf-connecting-ip': '203.0.113.5'})
check('claim → ok, pending, 0 points', r, lambda o: '"ok": true' in o and '"pending": true' in o and '"points": 0' in o and '"inviter_paid": false' in o)
check('the friend has only the normal sign-up gift', bal(F[0]), GIFT)
check('the inviter got nothing yet', bal(I), i0)
check('no referral ledger rows', sql("select count(*) from public.credit_ledger where reason='referral'"), '0')
check('relation recorded: pending', sql(f"select inviter||' '||state from private.referrals where friend='{F[0]}'"), f'{I} pending')
check('referred_by set (the old checks keep working)', sql(f"select referred_by from public.profiles where id='{F[0]}'"), I)
check('claim twice → already', claim(F[0], code), 'already')
check('self → self', claim(I, code), 'self')
check('users cannot read private.referrals', as_(F[0], "select count(*) from private.referrals"), 'permission denied')
check('users cannot read private.referral_ips', as_(F[0], "select count(*) from private.referral_ips"), 'permission denied')

D.section('[R6-4] one claim per (inviter, network); 3 per network in 30 days')
check('same inviter, same IP (cf-connecting-ip) → device', claim(F[1], code, {'cf-connecting-ip': '203.0.113.5'}), 'device')
check('…nothing recorded for that account', sql(f"select coalesce(referred_by::text,'none')||' '||(select count(*) from private.referrals where friend='{F[1]}') from public.profiles where id='{F[1]}'"), 'none 0')
check('same IP through x-forwarded-for (first value) → device', claim(F[1], code, {'x-forwarded-for': '203.0.113.5, 10.0.0.1'}), 'device')
check('another network → ok', claim(F[1], code, {'cf-connecting-ip': '198.51.100.20'}), '"ok": true')
check('IPv6 → ok', claim(F[2], code, {'cf-connecting-ip': '2001:db8:1:2::5'}), '"ok": true')
check('another address in the same IPv6 /64 → device', claim(F[3], code, {'cf-connecting-ip': '2001:db8:1:2:ffff::9'}), 'device')
check('the first IP for ANOTHER inviter → ok', claim(F[3], as_(I2, "select public.my_referral()->>'code'"), {'cf-connecting-ip': '203.0.113.5'}), '"ok": true')
ik = sql("set request.headers='{\"cf-connecting-ip\":\"192.0.2.77\"}'; select private.request_ip_key()").splitlines()[-1]
check('request_ip_key = 64 hex chars', ik, lambda o: re.fullmatch(r'[0-9a-f]{64}', o) is not None)
sql(f"insert into private.referral_ips(ip_key,inviter) values ('{ik}','{O}'),('{ik}','{I2}'),('{ik}','{L}')")
check('a network with 3 claims in 30 days → device (any inviter)', claim(F[4], code, {'cf-connecting-ip': '192.0.2.77'}), 'device')
sql(f"update private.referral_ips set at = now() - interval '31 days' where ip_key='{ik}'")
check('…those 3 older than 30 days → ok', claim(F[4], code, {'cf-connecting-ip': '192.0.2.77'}), '"ok": true')
check('no header at all → network rule skipped', claim(F[5], code), '"ok": true')
check('a garbage header → skipped, not an error', claim(F[6], code, {'cf-connecting-ip': "1.2.3.4'; drop table x;--"}), '"ok": true')
check('stored: hashes only (64 hex), no raw address', sql("select bool_and(ip_key ~ '^[0-9a-f]{64}$') from private.referral_ips")
      + ' ' + sql("select count(*) from private.referral_ips where ip_key like '%203.0%' or ip_key like '%2001%'"), 't 0')
check('salt kept in private.settings', sql("select length(value) from private.settings where key='referral_ip_salt'"), '64')

D.section('[R6-5] my_referral')
r = json.loads(as_(I, "select public.my_referral()"))
check('joined / invited = 6, paid 0, pending 6, earned 0', f"{r.get('invited')} {r.get('joined')} {r.get('paid')} {r.get('pending')} {r.get('earned')}", '6 6 0 6 0')

D.section('[R6-2] the inviter is paid on the first real payment')
n = [0]
def hook(event, res, env='live'):
    n[0] += 1
    body = json.dumps({'id': f'WH-{n[0]:04d}', 'event_type': event, 'resource': res})
    sig = pg.sign(env + '\n' + body, RELAY)
    return as_(None, f"select public.pay_webhook_paypal($B7x${body}$B7x$, '{env}', '{sig}')")
def activate(uid, sub, env='live'):
    return hook('BILLING.SUBSCRIPTION.ACTIVATED', {'id': sub, 'custom_id': uid, 'status': 'ACTIVE', 'plan_id': 'P-BASIC0000001',
                'billing_info': {'next_billing_time': pg.now(30)}, 'subscriber': {'payer_id': 'PAYER' + sub[-4:]}}, env)
def sale(uid, sub, sale_id, total='29.00', env='live'):
    return hook('PAYMENT.SALE.COMPLETED', {'id': sale_id, 'state': 'completed', 'billing_agreement_id': sub, 'custom': uid,
                'amount': {'total': total, 'currency': 'ILS'}}, env)
check('bad relay signature still refused', as_(None, "select public.pay_webhook_paypal('{}','live','00')"), 'bad signature')
check('F0 subscribes', activate(F[0], 'I-SUB00000F0'), 'active, plan basic')
i0 = bal(I); f0 = bal(F[0])
check('F0 first sale → plan points + referral +15', sale(F[0], 'I-SUB00000F0', 'SALE-F0-1'), lambda o: '+60' in o and 'referral +15' in o)
check('inviter +15', bal(I), str(int(i0) + 15))
check('the friend gets only the plan points (no referral row)', bal(F[0]) + ' ' + sql(f"select count(*) from public.credit_ledger where user_id='{F[0]}' and reason='referral'"), f'{int(f0) + 60} 0')
check("ledger: reason 'referral', ref 'ref:inviter:<friend>'", sql(f"select delta||' '||ref from public.credit_ledger where user_id='{I}' and reason='referral'"), f'15 ref:inviter:{F[0]}')
check('relation → rewarded, sale recorded', sql(f"select state||' '||sale_key||' '||points from private.referrals where friend='{F[0]}'"), 'rewarded pp:sale:SALE-F0-1 15')
check('F0 second sale → no referral again (once per friend)', sale(F[0], 'I-SUB00000F0', 'SALE-F0-2'), lambda o: '+60' in o and 'referral' not in o)
check('…inviter unchanged', bal(I), str(int(i0) + 15))

print('  a sale that arrives before ACTIVATED is rewarded when ACTIVATED grants it')
check('F1 sale first → plan not known yet', sale(F[1], 'I-SUB00000F1', 'SALE-F1-1'), 'plan not known yet')
check('…no reward yet', bal(I), str(int(i0) + 15))
check('F1 ACTIVATED → late payment + referral +15', activate(F[1], 'I-SUB00000F1'), lambda o: 'late payment +60' in o and 'referral +15' in o)
check('inviter +30 in all', bal(I), str(int(i0) + 30))

print('  a zero sale / sandbox for a normal member do not count')
activate(F[2], 'I-SUB00000F2')
check('F2 sale of 0.00 → no reward', sale(F[2], 'I-SUB00000F2', 'SALE-F2-0', total='0.00'), lambda o: 'referral' not in o)
check('…still pending', sql(f"select state from private.referrals where friend='{F[2]}'"), 'pending')
check('F2 sandbox sale (not an admin) → test ignored', sale(F[2], 'I-SUB00000F2', 'SALE-F2-T', env='sandbox'), 'test ignored')
check('…still pending', sql(f"select state from private.referrals where friend='{F[2]}'"), 'pending')

print('  the cap: billing.referral_max per 30 days')
check('F2 real sale → cap reached (2 already) → referral +0', sale(F[2], 'I-SUB00000F2', 'SALE-F2-1'), 'referral +0')
check('…inviter unchanged, relation capped (never paid later)', bal(I) + ' ' + sql(f"select state from private.referrals where friend='{F[2]}'"), f'{int(i0) + 30} capped')
check('F2 next sale → nothing', sale(F[2], 'I-SUB00000F2', 'SALE-F2-2'), lambda o: 'referral' not in o)

print('  members from before v6 (already rewarded under the old rule) reward no one again')
sql(f"update public.profiles set referred_by='{I}' where id='{L}'")
activate(L, 'I-SUB0000LEG')
check('legacy member pays → no referral', sale(L, 'I-SUB0000LEG', 'SALE-L-1'), lambda o: '+60' in o and 'referral' not in o)
check('a member without an invite pays → no referral', (activate(N, 'I-SUB0000NNN'), sale(N, 'I-SUB0000NNN', 'SALE-N-1'))[1], lambda o: 'referral' not in o)

D.section('[R6-3] a full refund / reversal takes the reward back')
i1 = int(bal(I))
check('partial refund of F0 first sale → points kept, reward kept', hook('PAYMENT.SALE.REFUNDED', {'id': 'RF-1', 'sale_id': 'SALE-F0-1', 'amount': {'total': '10.00'}}), 'partial refund')
check('…inviter unchanged', bal(I), str(i1))
check('full refund of F0 first sale → referral -15', hook('PAYMENT.SALE.REFUNDED', {'id': 'RF-2', 'sale_id': 'SALE-F0-1', 'amount': {'total': '29.00'}}), 'referral -15')
check('inviter -15', bal(I), str(i1 - 15))
check("ledger: 'ref:inviter:<friend> refund' −15", sql(f"select delta||' '||ref from public.credit_ledger where user_id='{I}' and reason='referral' and delta < 0"), f'-15 ref:inviter:{F[0]} refund')
check('relation → taken_back', sql(f"select state from private.referrals where friend='{F[0]}'"), 'taken_back')
check('the same refund again (new event id) → nothing more', hook('PAYMENT.SALE.REVERSED', {'id': 'RF-3', 'sale_id': 'SALE-F0-1', 'amount': {'total': '29.00'}}), lambda o: 'referral' not in o)
check('…inviter unchanged', bal(I), str(i1 - 15))
check("refund of F0's SECOND sale → no referral change", hook('PAYMENT.SALE.REFUNDED', {'id': 'RF-4', 'sale_id': 'SALE-F0-2', 'amount': {'total': '29.00'}}), lambda o: 'referral' not in o)
sql(f"update public.profiles set credits = 5 where id='{I}'")
check('reversal of F1 sale with only 5 points left → referral -5 (never below 0)', hook('PAYMENT.SALE.REVERSED', {'id': 'RF-5', 'sale_id': 'SALE-F1-1', 'amount': {'total': '29.00'}}), 'referral -5')
check('inviter at 0', bal(I), '0')
check('a refund of the capped F2 sale → nothing to take back', hook('PAYMENT.SALE.REFUNDED', {'id': 'RF-6', 'sale_id': 'SALE-F2-1', 'amount': {'total': '29.00'}}), lambda o: 'referral' not in o)

D.section('[R6-5] my_referral after payments')
r = json.loads(as_(I, "select public.my_referral()"))
check('invited 7 (incl. the legacy member), paid 1 (F2 capped; F0/F1 taken back), pending 3, earned net 10',
      f"{r.get('invited')} {r.get('paid')} {r.get('pending')} {r.get('earned')}", '7 1 3 10')

D.section('hardening sweep')
for fn in ['claim_referral', 'my_referral']:
    check(f'{fn} calls private.need_aal()', sql(f"select bool_and(prosrc like '%private.need_aal()%') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='{fn}'"), 't')
check('every SECURITY DEFINER fn pins search_path',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prosecdef and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))"), '0')
check('anon-callable definer fns = allow-list (unchanged)',
      sql("select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')"),
      lambda o: o.strip() == 'catalog_play,is_admin,notify_edge,pay_webhook,pay_webhook_paypal,reviews_public,username_available')
check('no private.* function executable by API roles',
      sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))"), '0')
check('private.referrals / referral_ips: no privileges for API roles',
      sql("select count(*) from information_schema.role_table_grants where table_schema='private' and table_name in ('referrals','referral_ips') and grantee in ('anon','authenticated','PUBLIC')"), '0')
check('anon cannot call claim_referral', as_(None, f"select public.claim_referral('{code}')"), 'permission denied')
check('deleting a friend removes its relation (cascade)', sql(f"delete from auth.users where id='{F[6]}'") + sql(f"select count(*) from private.referrals where friend='{F[6]}'"), '0')
check('schema.sql re-run keeps v6 (it is the last block)', str(pg.errs(D.file(pg.SCHEMA))) + ' ' + claim(F[8], code, {'cf-connecting-ip': '198.51.100.123'}), lambda o: o.startswith('[]') and '"pending": true' in o)

D.finish()
