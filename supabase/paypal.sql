-- Chord Room — PayPal subscriptions (run ONCE in the Supabase SQL editor, after schema.sql / growth_v4.sql).
-- This file = the "PayPal" block at the end of supabase/schema.sql ([paypal:begin…end]), verbatim. Safe to run again.
-- Owner steps: PAYMENTS.md.
--
-- [paypal:begin]
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- PayPal subscriptions (replaces Lemon Squeezy; its pay_webhook stays in place, unused).
--  · Checkout: the browser asks /api/pay/paypal-subscribe (Cloudflare Function, signed-in user) which creates the
--    subscription at PayPal with custom_id = the user's id and the plan's PayPal plan id (billing.plans[].variant = 'P-…'),
--    and returns PayPal's approve link.
--  · Webhook: PayPal → /api/pay/paypal (Function). The Function verifies the event with PayPal's
--    verify-webhook-signature API, then signs  env || '\n' || body  with HMAC-SHA256 and the relay secret it shares with
--    this database, and calls pay_webhook_paypal below. The relay secret lives in Cloudflare (PAYPAL_RELAY_SECRET) and here:
--      insert into private.settings (key, value) values ('paypal_relay_secret', 'YOUR-SECRET')
--        on conflict (key) do update set value = excluded.value;
--  · Points: one grant per completed sale (ledger ref 'ls:pp:sale:<sale id>'), taken back on a full refund/reversal.
--    Sandbox events count only for admin accounts (same rule as Lemon Squeezy test mode).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- plans[].variant may now hold a PayPal plan id (P-…) as well as a Lemon Squeezy variant number
do $$
declare src text;
  old_s text := $q$!~ '^(\d{1,12})?$' then raise exception 'bad billing: plan variant'$q$;
  new_s text := $q$!~ '^(\d{1,12}|P-[A-Z0-9]{10,40})?$' then raise exception 'bad billing: plan variant'$q$;
begin
  src := pg_get_functiondef('private.guard_config()'::regprocedure);
  if position(new_s in src) > 0 then return; end if;                  -- already patched
  if position(old_s in src) = 0 then
    raise warning 'paypal.sql: plan variant check not found in private.guard_config - NOT patched, check the function by hand';
    return;
  end if;
  execute replace(src, old_s, new_s);
end $$;

-- the plan whose PayPal plan id is p_plan_id (exact match only)
create or replace function private.pp_plan_of(p_plan_id text) returns text
language sql stable set search_path = public as $$
  select p->>'id' from public.site_config c,
         jsonb_array_elements(case when jsonb_typeof(c.billing->'plans') = 'array' then c.billing->'plans' else '[]'::jsonb end) p
   where c.id = 1 and coalesce(btrim(p_plan_id), '') <> '' and btrim(coalesce(p->>'variant', '')) = btrim(p_plan_id)
     and coalesce(p->>'id', '') not in ('', 'free')
   limit 1
$$;
revoke all on function private.pp_plan_of(text) from public, anon, authenticated;

create or replace function public.pay_webhook_paypal(p_body text, p_env text, p_sig text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  secret text; j jsonb; r jsonb; ev text; eid_pp text; is_test boolean; eid bigint;
  subid text; cid text; v_email text; uid uuid; ids uuid[]; me public.profiles;
  st text; pl text; nxt timestamptz; res text; got integer; sid text; amt numeric; paid numeric; ev2 record; portal text;
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
                        and (e.result = 'no user' or e.result like 'paid, plan not known%') loop
            got := private.pay_grant(uid, public.plan_points(pl), 'pp:sale:' || (ev2.s->>'id'), pl, is_test);
            update public.pay_events set user_id = uid, result = 'paid, plan ' || pl || ', +' || got || ' (late)' where id = ev2.id;
            res := res || ', late payment +' || got;
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
      end if;
    end if;

  elsif ev in ('PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED') then
    select nullif(e.payload->'resource'->'amount'->>'total', '')::numeric into paid from public.pay_events e
     where e.event = 'PAYMENT.SALE.COMPLETED' and e.payload->'resource'->>'id' = sid order by e.id desc limit 1;
    amt := abs(nullif(coalesce(r->'amount'->>'total', r->'amount'->>'value', ''), '')::numeric);
    if ev = 'PAYMENT.SALE.REVERSED' or (paid is not null and amt is not null and amt >= paid) then
      got := private.pay_take_back(uid, 'pp:sale:' || sid, is_test);
      res := case when got is null then 'refunded, nothing was granted' else 'refunded, -' || got end;
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
-- [paypal:end]
