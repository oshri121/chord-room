-- =====================================================================
-- Referral v6 (this block = the LAST block of supabase/schema.sql, for a one-time run in the SQL editor)
-- [referral-v6:begin]
-- =====================================================================
-- Invite a friend, new rule (owner's decision, 2026-10). Run it ONCE in the Supabase SQL editor AFTER
-- security_v5.sql (it redefines claim_referral / my_referral from [V5-3]/[V5-6] and pay_webhook_paypal from [paypal]).
-- Idempotent: safe to run again. Re-run this file after re-running security_v5.sql, paypal.sql or schema.sql's earlier
-- blocks, otherwise the old "both get points at sign-up" claim_referral comes back.
--
-- [R6-1] The invited friend gets NO referral bonus: only the normal sign-up gift every new account gets
--        (billing.signup). claim_referral(code) keeps every check of [S-12]/[V5-6] (3-day window, confirmed e-mail,
--        self / mutual invite, canonical e-mail, 365-day memory, 2FA need_aal) and now only RECORDS the relation
--        (private.referrals, state 'pending') → {ok:true, pending:true, points:0, balance, inviter_paid:false}.
-- [R6-2] The inviter gets billing.referral points (still capped by billing.referral_max per 30 days) ONLY when the
--        friend's FIRST real plan payment arrives (PayPal PAYMENT.SALE.COMPLETED with an amount > 0, handled in
--        pay_webhook_paypal; also for sales that arrived before ACTIVATED and are granted there). Once per friend, ever:
--        the relation leaves 'pending' for good ('rewarded', or 'capped' / 'skipped' with 0 points). Sandbox sales follow
--        the webhook's rule (only admin accounts count). Ledger: reason 'referral', ref 'ref:inviter:<friend uid>'.
-- [R6-3] A full refund / reversal of THAT sale takes the inviter's reward back (once, never below 0 — like
--        pay_take_back): ledger ref 'ref:inviter:<friend uid> refund', state 'taken_back'.
-- [R6-4] One claim per (inviter, network) ever, and at most 3 claims per network in 30 days across all inviters
--        → {ok:false, why:'device'}. The network = the client IP from PostgREST's request headers (cf-connecting-ip,
--        else the first x-forwarded-for value; IPv6 cut to its /64), kept only as a salted SHA-256
--        (private.referral_ips, salt 'referral_ip_salt' in private.settings), purged after ~400 days. No usable
--        header (SQL editor, tests) → the network rule is skipped.
-- [R6-5] my_referral() → {code, invited, joined, paid, pending, earned}: joined = accounts that signed up through the
--        link, paid = friends whose first payment rewarded you (or hit the cap), earned = net referral points.
-- Past referrals keep their points; nothing is retroactive (accounts that joined before v6 have no private.referrals
-- row, so their payments reward no one again).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [R6-1] who invited whom, until the friend's first payment (no API access at all)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists private.referrals (
  friend     uuid primary key references public.profiles(id) on delete cascade,
  inviter    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  state      text not null default 'pending' check (state in ('pending', 'rewarded', 'capped', 'skipped', 'taken_back')),
  sale_key   text,
  points     integer not null default 0,
  done_at    timestamptz
);
create index if not exists referrals_inviter_idx on private.referrals (inviter, state);
alter table private.referrals enable row level security;
revoke all on private.referrals from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [R6-4] networks that already claimed an invite: a salted hash of the IP only, kept ~400 days
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into private.settings (key, value) values ('referral_ip_salt', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;
create table if not exists private.referral_ips (
  ip_key  text not null check (ip_key ~ '^[0-9a-f]{64}$'),
  inviter uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (ip_key, inviter)
);
create index if not exists referral_ips_at_idx on private.referral_ips (ip_key, at desc);
alter table private.referral_ips enable row level security;
revoke all on private.referral_ips from public, anon, authenticated;

-- the caller's network as a salted hash, or null when the request carries no usable client IP
create or replace function private.request_ip_key() returns text
language plpgsql stable set search_path = public, extensions as $$
declare h json; v text; a inet;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then return null; end;
  if h is null or json_typeof(h) <> 'object' then return null; end if;
  v := btrim(coalesce(nullif(btrim(h->>'cf-connecting-ip'), ''), split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)));
  if v = '' or length(v) > 64 or v !~ '^[0-9A-Fa-f:.]+$' then return null; end if;
  begin a := v::inet; exception when others then return null; end;
  -- one IPv6 customer usually owns a whole /64: count it as one network
  if family(a) = 6 then a := network(set_masklen(a, 64)); end if;
  return encode(extensions.digest(convert_to(coalesce((select value from private.settings where key = 'referral_ip_salt'), '')
                                             || ':ip:' || host(a), 'UTF8'), 'sha256'), 'hex');
end $$;
revoke all on function private.request_ip_key() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [R6-1] claim_referral: body as in [V5-6] + the network rule; records the relation, gives no points
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_referral(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; inv public.profiles; joined timestamptz; conf timestamptz;
        my_mail text; inv_mail text; mk text; ik text;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  perform private.need_aal();
  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.blocked then return jsonb_build_object('ok', false, 'why', 'not_allowed'); end if;
  if me.referred_by is not null then return jsonb_build_object('ok', false, 'why', 'already'); end if;
  select u.created_at, u.email_confirmed_at, u.email into joined, conf, my_mail from auth.users u where u.id = me.id;
  if joined is null or joined < now() - interval '3 days' then return jsonb_build_object('ok', false, 'why', 'too_late'); end if;
  if conf is null then return jsonb_build_object('ok', false, 'why', 'not_confirmed'); end if;
  if p_code is null or btrim(p_code) !~ '^[a-z0-9]{6,12}$' then return jsonb_build_object('ok', false, 'why', 'bad_code'); end if;
  select * into inv from public.profiles where ref_code = btrim(p_code) for update;
  if not found or inv.blocked then return jsonb_build_object('ok', false, 'why', 'bad_code'); end if;
  if inv.id = me.id or inv.referred_by = me.id then return jsonb_build_object('ok', false, 'why', 'self'); end if;
  -- the same inbox as the inviter (me+1@…, m.e@gmail.com …)
  select u.email into inv_mail from auth.users u where u.id = inv.id;
  if private.email_canon(my_mail) is not null and private.email_canon(my_mail) = private.email_canon(inv_mail) then
    return jsonb_build_object('ok', false, 'why', 'self');
  end if;
  -- this inbox already joined through an invite (another alias, or a deleted account)
  mk := private.email_key(my_mail);
  if mk is null then return jsonb_build_object('ok', false, 'why', 'not_confirmed'); end if;
  if exists (select 1 from private.referral_claims where email_key = mk and at > now() - interval '365 days') then
    return jsonb_build_object('ok', false, 'why', 'already');
  end if;
  -- [R6-4] this network already joined through this inviter's link, or claimed 3 invites in 30 days
  ik := private.request_ip_key();
  if ik is not null then
    if exists (select 1 from private.referral_ips where ip_key = ik and inviter = inv.id)
       or (select count(*) from private.referral_ips where ip_key = ik and at > now() - interval '30 days') >= 3 then
      return jsonb_build_object('ok', false, 'why', 'device');
    end if;
    insert into private.referral_ips (ip_key, inviter, at) values (ik, inv.id, now()) on conflict do nothing;
  end if;
  insert into private.referral_claims (email_key, at) values (mk, now())
    on conflict (email_key) do update set at = excluded.at;
  if random() < 0.01 then
    delete from private.referral_claims where at < now() - interval '400 days';
    delete from private.referral_ips where at < now() - interval '400 days';
  end if;

  update public.profiles set referred_by = inv.id where id = me.id;
  insert into private.referrals (friend, inviter) values (me.id, inv.id) on conflict (friend) do nothing;
  return jsonb_build_object('ok', true, 'pending', true, 'points', 0, 'balance', me.credits, 'inviter_paid', false);
end $$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [R6-5] my_referral: body as in [V5-3] + joined / paid / pending
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.my_referral() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; code text; n integer; pts integer; np integer; nw integer;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  perform private.need_aal();
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'not allowed'; end if;
  code := me.ref_code;
  while code is null loop
    code := substr(md5(random()::text || clock_timestamp()::text || me.id::text), 1, 8);
    if code !~ '[a-f]' or exists (select 1 from public.profiles where ref_code = code) then code := null; end if;
  end loop;
  if me.ref_code is null then update public.profiles set ref_code = code where id = me.id; end if;
  select count(*) into n from public.profiles where referred_by = me.id;
  select count(*) filter (where state in ('rewarded', 'capped')), count(*) filter (where state = 'pending')
    into np, nw from private.referrals where inviter = me.id;
  select coalesce(sum(delta), 0) into pts from public.credit_ledger where user_id = me.id and reason = 'referral' and ref like 'ref:inviter:%';
  return jsonb_build_object('code', code, 'invited', n, 'joined', n, 'paid', np, 'pending', nw, 'earned', pts);
end $$;
revoke execute on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [R6-2] the inviter's reward on the friend's first plan payment. Returns points added (null = no pending invite).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.ref_reward(p_friend uuid, p_sale text, p_test boolean) returns integer
language plpgsql set search_path = public as $$
declare rr private.referrals; inv public.profiles; b jsonb; pts integer; cap integer; recent integer; st text := 'rewarded';
begin
  select * into rr from private.referrals where friend = p_friend for update;
  if not found or rr.state <> 'pending' then return null; end if;
  select * into inv from public.profiles where id = rr.inviter for update;
  select billing into b from public.site_config where id = 1;
  pts := least(1000, greatest(0, coalesce(public.safe_int(b->>'referral'), 10)));
  cap := greatest(0, coalesce(public.safe_int(b->>'referral_max'), 20));
  if inv.id is null or inv.blocked then
    st := 'skipped'; pts := 0;
  elsif exists (select 1 from public.credit_ledger where user_id = inv.id and reason = 'referral'
                 and split_part(ref, ' ', 1) = 'ref:inviter:' || p_friend) then
    st := 'skipped'; pts := 0;                              -- already rewarded for this friend (old rule)
  else
    select count(*) into recent from public.credit_ledger
     where user_id = inv.id and reason = 'referral' and delta > 0 and ref like 'ref:inviter:%'
       and created_at > now() - interval '30 days';
    if pts = 0 or recent >= cap then st := 'capped'; pts := 0; end if;
  end if;
  if pts > 0 then
    update public.profiles set credits = credits + pts where id = inv.id;
    insert into public.credit_ledger (user_id, delta, balance, reason, ref)
      values (inv.id, pts, inv.credits + pts, 'referral',
              left('ref:inviter:' || p_friend || case when p_test then ' (test)' else '' end, 300));
  end if;
  update private.referrals set state = st, sale_key = left(p_sale, 200), points = pts, done_at = now() where friend = p_friend;
  return pts;
end $$;

-- [R6-3] a full refund / reversal of the sale that rewarded the inviter: take the reward back, once, never below 0
create or replace function private.ref_take_back(p_friend uuid, p_sale text, p_test boolean) returns integer
language plpgsql set search_path = public as $$
declare rr private.referrals; cur integer; nxt integer;
begin
  select * into rr from private.referrals where friend = p_friend and state = 'rewarded' and sale_key = left(p_sale, 200) for update;
  if not found then return null; end if;
  select credits into cur from public.profiles where id = rr.inviter for update;
  if cur is null then return null; end if;
  nxt := greatest(0, cur - rr.points);
  update public.profiles set credits = nxt where id = rr.inviter;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (rr.inviter, nxt - cur, nxt, 'referral',
            left('ref:inviter:' || p_friend || ' refund' || case when p_test then ' (test)' else '' end, 300));
  update private.referrals set state = 'taken_back', done_at = now() where friend = p_friend;
  return cur - nxt;
end $$;
revoke all on function private.ref_reward(uuid, text, boolean), private.ref_take_back(uuid, text, boolean)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [R6-2] [R6-3] pay_webhook_paypal: body as in [paypal] + the inviter's reward / take-back
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.pay_webhook_paypal(p_body text, p_env text, p_sig text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  secret text; j jsonb; r jsonb; ev text; eid_pp text; is_test boolean; eid bigint;
  subid text; cid text; v_email text; uid uuid; ids uuid[]; me public.profiles;
  st text; pl text; nxt timestamptz; res text; got integer; sid text; amt numeric; paid numeric; ev2 record; portal text;
  rg integer; tot text;
begin
  select value into secret from private.settings where key = 'paypal_relay_secret';
  if coalesce(btrim(secret), '') = '' then raise exception 'not configured'; end if;
  if p_body is null or length(p_body) > 262144 then raise exception 'bad body'; end if;
  if p_env is null or p_env not in ('live', 'sandbox') then raise exception 'bad body'; end if;
  if coalesce(btrim(p_sig), '') = '' then raise exception 'bad signature'; end if;
  if extensions.digest(encode(extensions.hmac(convert_to(p_env || E'\n' || p_body, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex'), 'sha256')
     <> extensions.digest(lower(btrim(p_sig)), 'sha256') then
    raise exception 'bad signature';
  end if;
  begin j := p_body::jsonb; exception when others then raise exception 'bad json'; end;
  if jsonb_typeof(j) <> 'object' then raise exception 'bad json'; end if;

  r := case when jsonb_typeof(j->'resource') = 'object' then j->'resource' else '{}'::jsonb end;
  ev := coalesce(j->>'event_type', ''); eid_pp := coalesce(j->>'id', '');
  is_test := p_env = 'sandbox';
  if eid_pp = '' then raise exception 'bad json'; end if;

  -- exactly once per PayPal event (redeliveries keep the event id)
  insert into public.pay_events (key, event, test, payload)
    values (left('pp:' || eid_pp || case when is_test then ':test' else '' end, 300), left(ev, 80), is_test, j)
    on conflict (key) do nothing returning id into eid;
  if eid is null then return 'duplicate'; end if;

  if ev like 'BILLING.SUBSCRIPTION.%' then
    subid := nullif(r->>'id', ''); cid := r->>'custom_id'; v_email := r->'subscriber'->>'email_address';
  elsif ev like 'PAYMENT.SALE.%' then
    subid := nullif(r->>'billing_agreement_id', ''); cid := r->>'custom';
    -- a refund/reversal may not carry the subscription: find it from the sale we recorded
    sid := coalesce(nullif(r->>'sale_id', ''), r->>'id');
    if subid is null and ev <> 'PAYMENT.SALE.COMPLETED' and sid is not null then
      select e.payload->'resource'->>'billing_agreement_id', e.user_id into subid, uid from public.pay_events e
       where e.event = 'PAYMENT.SALE.COMPLETED' and e.payload->'resource'->>'id' = sid order by e.id desc limit 1;
    end if;
  else
    update public.pay_events set result = 'ignored' where id = eid;
    return 'ignored';
  end if;

  -- which user: our id (set by our own Function) → the subscription we already know → a confirmed, unique email
  if uid is null and coalesce(cid, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into uid from public.profiles where id = cid::uuid;
  end if;
  if uid is null and subid is not null then
    select id into uid from public.profiles where pay_sub_id = subid limit 1;
  end if;
  if uid is null and coalesce(btrim(v_email), '') <> '' then
    select array_agg(u.id) into ids from auth.users u join public.profiles p on p.id = u.id
     where lower(u.email) = lower(btrim(v_email)) and u.email_confirmed_at is not null;
    if coalesce(array_length(ids, 1), 0) = 1 then uid := ids[1]; end if;
  end if;
  if uid is null then
    update public.pay_events set result = 'no user' where id = eid;
    return 'no user';
  end if;
  select * into me from public.profiles where id = uid for update;
  update public.pay_events set user_id = uid where id = eid;
  if is_test and me.role <> 'admin' then
    update public.pay_events set result = 'test mode: ignored (only admin accounts can test)' where id = eid;
    return 'test ignored';
  end if;
  portal := case when is_test then 'https://www.sandbox.paypal.com/myaccount/autopay/' else 'https://www.paypal.com/myaccount/autopay/' end;

  if ev like 'BILLING.SUBSCRIPTION.%' then
    st := case upper(coalesce(r->>'status', ''))
            when 'ACTIVE' then 'active' when 'SUSPENDED' then 'paused' when 'CANCELLED' then 'cancelled'
            when 'EXPIRED' then 'expired' else '' end;
    if ev = 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' then st := 'past_due'; end if;
    if st = '' then
      res := 'ignored: status ' || coalesce(r->>'status', '?');
    elsif me.pay_sub_id is not null and me.pay_sub_id <> subid and st <> 'active' then
      res := 'ignored: older subscription';
    else
      pl := coalesce(private.pp_plan_of(r->>'plan_id'), case when me.pay_sub_id = subid then me.pay_plan end);
      nxt := private.pay_ts(r->'billing_info'->>'next_billing_time');
      update public.profiles set pay_provider = 'paypal', pay_sub_id = subid,
             pay_customer_id = coalesce(nullif(r->'subscriber'->>'payer_id', ''), pay_customer_id),
             pay_portal = portal, pay_status = st, pay_renews = coalesce(nxt, pay_renews),
             pay_plan = case when pay_sub_id is distinct from subid then pl else coalesce(pl, pay_plan) end
       where id = uid;
      res := st;
      if st = 'active' then
        if pl is null then
          res := 'active, unknown plan (put the PayPal plan id in Billing)';
        else
          update public.profiles set plan = pl,
                 plan_until = greatest(coalesce(nxt, now() + interval '1 month'), coalesce(plan_until, now()), now()) + interval '3 days'
           where id = uid;
          res := 'active, plan ' || pl;
          -- payments that arrived before the subscription was known: grant them now
          for ev2 in select e.id, e.payload->'resource' as s from public.pay_events e
                      where e.event = 'PAYMENT.SALE.COMPLETED' and e.test = is_test
                        and e.payload->'resource'->>'billing_agreement_id' = subid
                        and (e.result = 'no user' or e.result like 'paid, plan not known%') order by e.id loop
            got := private.pay_grant(uid, public.plan_points(pl), 'pp:sale:' || (ev2.s->>'id'), pl, is_test);
            update public.pay_events set user_id = uid, result = 'paid, plan ' || pl || ', +' || got || ' (late)' where id = ev2.id;
            res := res || ', late payment +' || got;
            -- [R6-2] the friend's first real payment rewards the inviter
            tot := ev2.s->'amount'->>'total';
            if (case when coalesce(tot, '') ~ '^[0-9]{1,9}(\.[0-9]{1,4})?$' then tot::numeric else 0 end) > 0 then
              rg := private.ref_reward(uid, 'pp:sale:' || (ev2.s->>'id'), is_test);
              if rg is not null then res := res || ', referral +' || rg; end if;
            end if;
          end loop;
        end if;
      elsif st = 'expired' then
        update public.profiles set plan = 'free', plan_until = null where id = uid;
      end if;                                               -- cancelled / paused / past_due: the plan runs until plan_until
    end if;

  elsif ev = 'PAYMENT.SALE.COMPLETED' then
    if lower(coalesce(r->>'state', '')) <> 'completed' then
      res := 'not completed: ' || coalesce(r->>'state', '?');
    elsif subid is null then
      res := 'ignored: not a subscription payment';
    elsif me.pay_sub_id is not null and me.pay_sub_id <> subid then
      res := 'paid, plan not known yet (other subscription on the account)';
    else
      pl := case when me.pay_sub_id = subid then me.pay_plan end;
      if pl is null then
        res := 'paid, plan not known yet (ACTIVATED will grant)';
      else
        got := private.pay_grant(uid, public.plan_points(pl), 'pp:sale:' || (r->>'id'), pl, is_test);
        res := 'paid, plan ' || pl || ', +' || got;
        update public.profiles set plan = pl,
               pay_status = case when pay_status is null or pay_status in ('past_due', 'expired') then 'active' else pay_status end,
               plan_until = greatest(coalesce(plan_until, now()), now() + interval '1 month 3 days')
         where id = uid;
        -- [R6-2] the friend's first real payment rewards the inviter
        tot := r->'amount'->>'total';
        if (case when coalesce(tot, '') ~ '^[0-9]{1,9}(\.[0-9]{1,4})?$' then tot::numeric else 0 end) > 0 then
          rg := private.ref_reward(uid, 'pp:sale:' || (r->>'id'), is_test);
          if rg is not null then res := res || ', referral +' || rg; end if;
        end if;
      end if;
    end if;

  elsif ev in ('PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED') then
    select nullif(e.payload->'resource'->'amount'->>'total', '')::numeric into paid from public.pay_events e
     where e.event = 'PAYMENT.SALE.COMPLETED' and e.payload->'resource'->>'id' = sid order by e.id desc limit 1;
    amt := abs(nullif(coalesce(r->'amount'->>'total', r->'amount'->>'value', ''), '')::numeric);
    if ev = 'PAYMENT.SALE.REVERSED' or (paid is not null and amt is not null and amt >= paid) then
      got := private.pay_take_back(uid, 'pp:sale:' || sid, is_test);
      res := case when got is null then 'refunded, nothing was granted' else 'refunded, -' || got end;
      -- [R6-3] the inviter's reward for this sale goes back too
      rg := private.ref_take_back(uid, 'pp:sale:' || sid, is_test);
      if rg is not null then res := res || ', referral -' || rg; end if;
    else
      res := 'partial refund, points kept';
    end if;

  else
    res := 'ignored';
  end if;

  res := left(coalesce(res, 'ok'), 300);
  update public.pay_events set result = res where id = eid;
  return res;
end $$;
revoke execute on function public.pay_webhook_paypal(text, text, text) from public;
grant execute on function public.pay_webhook_paypal(text, text, text) to anon, authenticated;
-- =====================================================================
-- [referral-v6:end]
-- =====================================================================
