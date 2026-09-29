-- Chord Room assistant ("Roomy" / רומי): daily message quota.
-- Run AFTER schema.sql, in the Supabase dashboard: SQL Editor → New query → paste → Run. Safe to run again.
--
-- The Pages Function functions/api/assistant.js calls public.assistant_use() with the user's own access token before
-- every answer. It counts messages per user per day (Israel time), refuses blocked users and returns the public price
-- list so the assistant never invents prices. Nothing here stores message text: the activity log only gets
-- the action name 'assistant' (no detail).
--
-- Settings (site_config.billing, all optional — admin panel "Save" keeps them):
--   assistant             true/false      false = assistant off for everyone except admins (default true)
--   assistant_daily       0…100000        messages per day for free accounts (default 30)
--   assistant_daily_plan  0…100000        messages per day while a paid plan is active (default 150)
-- e.g.  update public.site_config set billing = billing || '{"assistant_daily": 20, "assistant_daily_plan": 200}' where id = 1;
-- Admins and the owner are unlimited (only a burst limit of 30 per minute; everyone else 8 per minute).

create table if not exists public.assistant_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  count    integer not null default 0 check (count >= 0),
  burst_at timestamptz,
  burst    integer not null default 0,
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated, public;
grant select on public.assistant_usage to authenticated;             -- own rows / activity admins, through RLS below
drop policy if exists "assistant_usage: own or activity" on public.assistant_usage;
create policy "assistant_usage: own or activity" on public.assistant_usage for select to authenticated
  using (user_id = auth.uid() or public.has_perm('activity'));

create or replace function private.assistant_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Jerusalem')::date $$;
revoke all on function private.assistant_today() from public, anon, authenticated;

-- today's limit for the signed-in user: null = unlimited (admins/owner), 0 = none
create or replace function private.assistant_limit(me public.profiles, b jsonb) returns integer
language plpgsql stable set search_path = public as $$
declare lim integer;
begin
  if me.owner or (me.role = 'admin' and not me.blocked) then return null; end if;
  if me.plan is not null and me.plan <> 'free' and me.plan_until is not null and me.plan_until > now() then
    lim := coalesce(public.safe_int(b->>'assistant_daily_plan'), 150);
  else
    lim := coalesce(public.safe_int(b->>'assistant_daily'), 30);
  end if;
  return greatest(0, least(lim, 100000));
end $$;
revoke all on function private.assistant_limit(public.profiles, jsonb) from public, anon, authenticated;

-- the public price list (same values everyone can read in site_config.billing), without links/ids of the store
create or replace function private.assistant_prices(b jsonb) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'on', case when jsonb_typeof(b->'on') = 'boolean' then b->'on' end,
    'currency', b->'currency',
    'signup', b->'signup', 'referral', b->'referral',
    'costs', case when jsonb_typeof(b->'costs') = 'object' then jsonb_build_object('sep', b->'costs'->'sep', 'stems', b->'costs'->'stems') end,
    'plans', (select jsonb_agg(jsonb_build_object('id', p->>'id', 'price', p->'price', 'points', p->'points'))
                from jsonb_array_elements(case when jsonb_typeof(b->'plans') = 'array' then b->'plans' else '[]'::jsonb end) p
               where jsonb_typeof(p) = 'object')));
$$;
revoke all on function private.assistant_prices(jsonb) from public, anon, authenticated;

-- spend one message. {ok:true, left, limit, me:{plan,credits}, billing} or {ok:false, why: auth|blocked|off|limit|slow}
create or replace function public.assistant_use() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.profiles; b jsonb; lim integer; d date := private.assistant_today();
        r public.assistant_usage; cap integer; nb integer; nat timestamptz;
begin
  if uid is null then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  select * into me from public.profiles where id = uid;
  if not found then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  if me.blocked and not me.owner then return jsonb_build_object('ok', false, 'why', 'blocked'); end if;
  select coalesce(billing, '{}'::jsonb) into b from public.site_config where id = 1;
  b := coalesce(b, '{}'::jsonb);
  lim := private.assistant_limit(me, b);
  if lim is not null and jsonb_typeof(b->'assistant') = 'boolean' and not (b->>'assistant')::boolean then
    return jsonb_build_object('ok', false, 'why', 'off');
  end if;

  insert into public.assistant_usage (user_id, day) values (uid, d) on conflict do nothing;
  select * into r from public.assistant_usage where user_id = uid and day = d for update;
  cap := case when lim is null then 30 else 8 end;                    -- messages per minute
  if r.burst_at is not null and r.burst_at > now() - interval '1 minute' then
    if r.burst >= cap then return jsonb_build_object('ok', false, 'why', 'slow'); end if;
    nb := r.burst + 1; nat := r.burst_at;
  else
    nb := 1; nat := now();
  end if;
  if lim is not null and r.count >= lim then
    return jsonb_build_object('ok', false, 'why', 'limit', 'left', 0, 'limit', lim);
  end if;
  update public.assistant_usage set count = count + 1, burst = nb, burst_at = nat where user_id = uid and day = d;
  perform public.log_activity('assistant', '');                        -- no message content (privacy)
  if random() < 0.01 then delete from public.assistant_usage where day < d - 60; end if;
  return jsonb_build_object('ok', true,
    'left', case when lim is null then null else lim - r.count - 1 end, 'limit', lim,
    'me', jsonb_build_object('plan', coalesce(me.plan, 'free'), 'credits', coalesce(me.credits, 0)),
    'billing', private.assistant_prices(b));
end $$;
revoke execute on function public.assistant_use() from public, anon;
grant execute on function public.assistant_use() to authenticated;

-- read-only: {ok, left, limit} (left/limit null = unlimited), or {ok:false, why} — for the chat's "messages left" hint
create or replace function public.assistant_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.profiles; b jsonb; lim integer; used integer;
begin
  if uid is null then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  select * into me from public.profiles where id = uid;
  if not found then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  if me.blocked and not me.owner then return jsonb_build_object('ok', false, 'why', 'blocked'); end if;
  select coalesce(billing, '{}'::jsonb) into b from public.site_config where id = 1;
  b := coalesce(b, '{}'::jsonb);
  lim := private.assistant_limit(me, b);
  if lim is not null and jsonb_typeof(b->'assistant') = 'boolean' and not (b->>'assistant')::boolean then
    return jsonb_build_object('ok', false, 'why', 'off');
  end if;
  select u.count into used from public.assistant_usage u where u.user_id = uid and u.day = private.assistant_today();
  return jsonb_build_object('ok', true, 'left', case when lim is null then null else greatest(0, lim - coalesce(used, 0)) end, 'limit', lim);
end $$;
revoke execute on function public.assistant_status() from public, anon;
grant execute on function public.assistant_status() to authenticated;

-- the assistant settings inside billing must be sane (the main guard in schema.sql checks the rest)
create or replace function private.guard_config_assistant() returns trigger
language plpgsql set search_path = public as $$
declare b jsonb := new.billing;
begin
  if current_user not in ('anon', 'authenticated') or b is null or jsonb_typeof(b) <> 'object' then return new; end if;
  if b ? 'assistant' and jsonb_typeof(b->'assistant') <> 'boolean' then raise exception 'bad billing: assistant' using errcode = '22023'; end if;
  if b ? 'assistant_daily' and coalesce(public.safe_int(b->>'assistant_daily'), -1) not between 0 and 100000 then
    raise exception 'bad billing: assistant_daily' using errcode = '22023';
  end if;
  if b ? 'assistant_daily_plan' and coalesce(public.safe_int(b->>'assistant_daily_plan'), -1) not between 0 and 100000 then
    raise exception 'bad billing: assistant_daily_plan' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.guard_config_assistant() from public, anon, authenticated;
drop trigger if exists site_config_guard_assistant on public.site_config;
create trigger site_config_guard_assistant before insert or update on public.site_config
  for each row execute function private.guard_config_assistant();
