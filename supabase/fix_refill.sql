-- Fix 2026-10: points came back by themselves for accounts whose PayPal subscription ended (expired / unpaid).
-- Run once in the Supabase SQL editor (safe to run again). The same body is in schema.sql [security-v5] and security_v5.sql.
create or replace function public.refill_credits() returns integer
language plpgsql security definer set search_path = public as $$
declare me public.profiles; pts integer;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if not public.aal_ok() then return null; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'not allowed'; end if;
  if me.blocked or me.plan = 'free' then return me.credits; end if;
  if me.plan_until is null or me.plan_until <= now() then
    update public.profiles set plan = 'free', plan_until = null where id = me.id;   -- expired; points stay
    return me.credits;
  end if;
  -- an account with a PayPal subscription (live OR ended: expired / unpaid / cancelled) gets plan points only from
  -- payment events, never from here: an ended subscription keeps its plan until plan_until, and last_refill is never set by
  -- payments, so this used to hand out a free month of points (bug 2026-10: "points come back by themselves")
  if me.pay_sub_id is not null or coalesce(me.pay_provider, '') <> '' then
    return me.credits;
  end if;
  if me.last_refill is null or me.last_refill <= now() - interval '1 month' then
    pts := public.plan_points(me.plan);
    if coalesce(pts, 0) > 0 then
      update public.profiles set credits = credits + pts, last_refill = now() where id = me.id;
      insert into public.credit_ledger (user_id, delta, balance, reason, ref)
        values (me.id, pts, me.credits + pts, 'refill', me.plan);
      return me.credits + pts;
    end if;
  end if;
  return me.credits;
end $$;
revoke execute on function public.refill_credits() from public, anon;
grant execute on function public.refill_credits() to authenticated;
