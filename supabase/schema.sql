-- Chord Room database schema for Supabase.
-- Run it once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run again: it uses "if not exists" / "or replace" where it can.

-- ───────────── profiles ─────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique check (username ~ '^[A-Za-z0-9_.-]{3,24}$'),
  email        text,
  display_name text default '',
  bio          text default '' check (char_length(bio) <= 280),
  avatar_url   text default '',
  lang         text default 'he' check (lang in ('he','en','ar','ru','es')),
  role         text not null default 'user' check (role in ('user','admin')),
  blocked      boolean not null default false,
  songs        integer not null default 0,
  seps         integer not null default 0,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not blocked);
$$;

drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Users may only change these columns on their own row. role, blocked, songs, seps and email
-- are changed by the functions and triggers below, never directly by the browser.
revoke update on public.profiles from authenticated, anon;
grant update (username, display_name, bio, avatar_url, lang, last_seen) on public.profiles to authenticated;

-- New account → profile row. The very first account becomes the admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := nullif(new.raw_user_meta_data->>'username', '');
  first_user boolean := not exists (select 1 from public.profiles);
begin
  if wanted is not null and (wanted !~ '^[A-Za-z0-9_.-]{3,24}$' or exists (select 1 from public.profiles where lower(username) = lower(wanted))) then
    wanted := null;
  end if;
  insert into public.profiles (id, username, email, display_name, role)
  values (new.id, wanted, new.email, coalesce(wanted, ''), case when first_user then 'admin' else 'user' end);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when a user confirms a new email.
create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_user_email();

create or replace function public.username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(u));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

create or replace function public.bump_seps() returns void
language sql security definer set search_path = public as $$
  update public.profiles set seps = seps + 1 where id = auth.uid();
$$;
grant execute on function public.bump_seps() to authenticated;

create or replace function public.admin_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if target = auth.uid() then raise exception 'cannot change your own role'; end if;
  if new_role not in ('user','admin') then raise exception 'bad role'; end if;
  update public.profiles set role = new_role where id = target;
end $$;
grant execute on function public.admin_set_role(uuid, text) to authenticated;

create or replace function public.admin_set_blocked(target uuid, is_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if target = auth.uid() then raise exception 'cannot block yourself'; end if;
  update public.profiles set blocked = is_blocked where id = target;
end $$;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;

-- ───────────── songs (each user's private library) ─────────────
create table if not exists public.songs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.songs enable row level security;

drop policy if exists "songs: own" on public.songs;
create policy "songs: own" on public.songs
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and not exists (select 1 from public.profiles where id = auth.uid() and blocked));

create or replace function public.count_songs() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles set songs = (select count(*) from public.songs where user_id = uid) where id = uid;
  return null;
end $$;
drop trigger if exists songs_count on public.songs;
create trigger songs_count after insert or delete on public.songs
  for each row execute function public.count_songs();

-- ───────────── site settings (one row) ─────────────
create table if not exists public.site_config (
  id            integer primary key default 1 check (id = 1),
  title         text default '',
  announce      text default '',
  lang          text default 'he',
  ai            boolean not null default true,
  dl            boolean not null default true,
  require_login boolean not null default false,
  allow_signup  boolean not null default true,
  updated_at    timestamptz not null default now()
);
insert into public.site_config (id) values (1) on conflict (id) do nothing;
alter table public.site_config enable row level security;

drop policy if exists "config: everyone reads" on public.site_config;
create policy "config: everyone reads" on public.site_config for select using (true);
drop policy if exists "config: admins write" on public.site_config;
create policy "config: admins write" on public.site_config for all using (public.is_admin()) with check (public.is_admin());

-- Live updates of settings (announcement banner etc.)
do $$ begin
  alter publication supabase_realtime add table public.site_config;
exception when others then null; end $$;

-- ───────────── avatars (public images, each user writes their own folder) ─────────────
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "avatars: own upload" on storage.objects;
create policy "avatars: own upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: own delete" on storage.objects;
create policy "avatars: own delete" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────── make someone admin by hand (optional) ─────────────
-- update public.profiles set role = 'admin' where email = 'you@example.com';

-- ───────────── catalog: shared song analyses (key, BPM, chords) for the Discover page ─────────────
-- Only metadata is stored, never audio. Rows come from analysing Deezer's 30-second previews.
create table if not exists public.catalog (
  id          text primary key check (id ~ '^dz:[0-9]{1,15}$'),
  source      text not null default 'deezer',
  ext_id      bigint not null,
  title       text not null check (char_length(title) <= 300),
  artist      text not null check (char_length(artist) <= 300),
  album       text default '' check (char_length(album) <= 300),
  cover       text default '' check (char_length(cover) <= 500),
  link        text default '' check (char_length(link) <= 500),
  release_date date,
  duration    integer,
  bpm         numeric(6,2) check (bpm between 30 and 300),
  key_pc      smallint check (key_pc between 0 and 11),
  key_mode    smallint check (key_mode in (0,1)),
  chords      jsonb not null default '[]'::jsonb,
  plays       integer not null default 0,
  analyzed_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists catalog_plays_idx on public.catalog (plays desc);
create index if not exists catalog_created_idx on public.catalog (created_at desc);
alter table public.catalog enable row level security;

drop policy if exists "catalog: everyone reads" on public.catalog;
create policy "catalog: everyone reads" on public.catalog for select using (true);
drop policy if exists "catalog: members add" on public.catalog;
create policy "catalog: members add" on public.catalog for insert to authenticated
  with check (analyzed_by = auth.uid() and not exists (select 1 from public.profiles where id = auth.uid() and blocked));
drop policy if exists "catalog: admins edit" on public.catalog;
create policy "catalog: admins edit" on public.catalog for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "catalog: admins delete" on public.catalog;
create policy "catalog: admins delete" on public.catalog for delete using (public.is_admin());
revoke update on public.catalog from anon;

create or replace function public.catalog_play(cid text) returns void
language sql security definer set search_path = public as $$
  update public.catalog set plays = plays + 1 where id = cid;
$$;
grant execute on function public.catalog_play(text) to anon, authenticated;

-- ───────────── full-song analyses: members who upload the full song improve the catalog entry ─────────────
alter table public.catalog add column if not exists is_full boolean not null default false;
alter table public.catalog add column if not exists full_by uuid references auth.users(id) on delete set null;
alter table public.catalog add column if not exists full_at timestamptz;

create or replace function public.catalog_set_full(cid text, p_bpm numeric, p_pc smallint, p_mode smallint, p_chords jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and blocked) then
    raise exception 'not allowed';
  end if;
  if p_bpm is null or p_bpm < 30 or p_bpm > 300 or p_pc not between 0 and 11 or p_mode not in (0,1)
     or jsonb_typeof(p_chords) <> 'array' or jsonb_array_length(p_chords) > 16 then
    raise exception 'bad analysis';
  end if;
  -- the first full analysis wins; admins can always replace it
  update public.catalog
     set bpm = p_bpm, key_pc = p_pc, key_mode = p_mode, chords = p_chords,
         is_full = true, full_by = auth.uid(), full_at = now()
   where id = cid and (not is_full or public.is_admin());
  get diagnostics n = row_count;
  return n > 0;
end $$;
grant execute on function public.catalog_set_full(text, numeric, smallint, smallint, jsonb) to authenticated;

-- ───────────── uploaded song files: stored per user, readable by the owner and by admins ─────────────
alter table public.songs add column if not exists file_path text;
alter table public.songs add column if not exists file_size bigint;
alter table public.songs add column if not exists file_type text;
alter table public.songs add column if not exists genre text default '';
alter table public.songs add column if not exists bpm numeric(6,2);
alter table public.songs add column if not exists key_pc smallint;
alter table public.songs add column if not exists key_mode smallint;
alter table public.songs add column if not exists duration numeric(8,2);
alter table public.songs add column if not exists created_at timestamptz not null default now();

drop policy if exists "songs: admins read" on public.songs;
create policy "songs: admins read" on public.songs for select using (public.is_admin());

-- fill the new columns for songs saved before they existed (the analysis is already in `data`)
update public.songs set
  bpm      = coalesce(bpm, nullif(data->>'bpm','')::numeric),
  key_pc   = coalesce(key_pc, nullif(data->'key'->>'pc','')::smallint),
  key_mode = coalesce(key_mode, case data->'key'->>'mode' when 'true' then 1 when 'false' then 0 else nullif(data->'key'->>'mode','')::smallint end),
  duration = coalesce(duration, nullif(data->>'dur','')::numeric)
where bpm is null or key_pc is null or duration is null;

insert into storage.buckets (id, name, public, file_size_limit)
  values ('uploads', 'uploads', false, 52428800)
  on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "uploads: own read" on storage.objects;
create policy "uploads: own read" on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
drop policy if exists "uploads: own write" on storage.objects;
create policy "uploads: own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text
              and not exists (select 1 from public.profiles where id = auth.uid() and blocked));
drop policy if exists "uploads: own update" on storage.objects;
create policy "uploads: own update" on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "uploads: own delete" on storage.objects;
create policy "uploads: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ───────────── download log: what each user exported ─────────────
create table if not exists public.downloads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  song_name  text not null check (char_length(song_name) <= 300),
  files      jsonb not null default '[]'::jsonb,
  size       bigint,
  created_at timestamptz not null default now()
);
create index if not exists downloads_user_idx on public.downloads (user_id, created_at desc);
alter table public.downloads enable row level security;
drop policy if exists "downloads: own insert" on public.downloads;
create policy "downloads: own insert" on public.downloads for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "downloads: own or admin read" on public.downloads;
create policy "downloads: own or admin read" on public.downloads for select using (user_id = auth.uid() or public.is_admin());

-- ───────────── points (credits) and monthly plans ─────────────
-- AI stem separation and stem downloads cost points. Paying members get a monthly refill.
-- Balances and plans change ONLY through the security definer functions below; the browser has no
-- column grant on credits/plan/plan_until/last_refill and no write access to credit_ledger.
alter table public.profiles add column if not exists credits     integer not null default 0;
alter table public.profiles add column if not exists plan        text    not null default 'free';
alter table public.profiles add column if not exists plan_until  timestamptz;
alter table public.profiles add column if not exists last_refill timestamptz;
revoke update (credits, plan, plan_until, last_refill) on public.profiles from authenticated, anon, public;

-- billing settings (admin edits them in the admin panel; everyone can read them)
alter table public.site_config add column if not exists billing jsonb not null default
  '{"on":true,"signup":20,"costs":{"sep":5,"stems":2},"currency":"ILS","contact":"",
    "plans":[{"id":"basic","price":29,"points":60,"link":""},
             {"id":"pro","price":59,"points":150,"link":"","best":true},
             {"id":"studio","price":99,"points":400,"link":""}]}'::jsonb;
update public.site_config set billing = default
  where id = 1 and (billing is null or jsonb_typeof(billing) <> 'object' or billing = '{}'::jsonb);

-- every change of a balance, newest first per user
create table if not exists public.credit_ledger (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  delta      integer not null,
  balance    integer not null,
  reason     text not null check (reason in ('signup','spend','grant','refill','plan','refund')),
  ref        text check (char_length(ref) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
alter table public.credit_ledger enable row level security;
revoke insert, update, delete, truncate on public.credit_ledger from authenticated, anon, public;
grant select on public.credit_ledger to authenticated;
revoke all on sequence public.credit_ledger_id_seq from authenticated, anon, public;
drop policy if exists "ledger: own or admin read" on public.credit_ledger;
create policy "ledger: own or admin read" on public.credit_ledger
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- integer from a jsonb text value, null when it isn't a plain whole number (a bad setting must never break sign-ups)
create or replace function public.safe_int(v text) returns integer
language sql immutable set search_path = public as $$
  select case when v ~ '^\s*-?\d{1,7}\s*$' then btrim(v)::int end;
$$;

-- points of a plan id from site_config.billing.plans (null = unknown plan)
create or replace function public.plan_points(p_plan text) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0, coalesce(public.safe_int(p->>'points'), 0))
    from public.site_config c, jsonb_array_elements(coalesce(c.billing->'plans', '[]'::jsonb)) p
   where c.id = 1 and p->>'id' = p_plan
   limit 1;
$$;
revoke execute on function public.plan_points(text) from public, anon, authenticated;

-- signup bonus for every new profile (the ledger row is written even when the bonus is 0,
-- so the backfill below never pays twice)
create or replace function public.handle_signup_credits() returns trigger
language plpgsql security definer set search_path = public as $$
declare bonus integer;
begin
  select greatest(0, coalesce(public.safe_int(billing->>'signup'), 0)) into bonus from public.site_config where id = 1;
  bonus := coalesce(bonus, 0);
  update public.profiles set credits = credits + bonus where id = new.id;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (new.id, bonus, new.credits + bonus, 'signup', null);
  return null;
end $$;
revoke execute on function public.handle_signup_credits() from public, anon, authenticated;
drop trigger if exists on_profile_created_credits on public.profiles;
create trigger on_profile_created_credits after insert on public.profiles
  for each row execute function public.handle_signup_credits();

-- one-time backfill: accounts that existed before points get the signup bonus once
do $$
declare r record; bonus integer;
begin
  select greatest(0, coalesce(public.safe_int(billing->>'signup'), 0)) into bonus from public.site_config where id = 1;
  bonus := coalesce(bonus, 0);
  for r in select p.id from public.profiles p
            where not exists (select 1 from public.credit_ledger l where l.user_id = p.id)
            for update loop
    update public.profiles set credits = credits + bonus where id = r.id;
    insert into public.credit_ledger (user_id, delta, balance, reason)
      select r.id, bonus, credits, 'signup' from public.profiles where id = r.id;
  end loop;
end $$;

-- spend points for a paid action. The PRICE COMES FROM THE SERVER (site_config.billing.costs), never from
-- the browser. Returns {"balance": n, "id": ledger id or null when free}. Raises 'insufficient_credits'.
-- Admins and billing.on=false → free.
create or replace function public.spend_credits(p_kind text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; b jsonb; cost integer; lid bigint;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_kind is null or p_kind not in ('sep', 'stems') then raise exception 'bad kind'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.blocked then raise exception 'not allowed'; end if;
  select billing into b from public.site_config where id = 1;
  cost := public.safe_int(b->'costs'->>p_kind);
  if cost is null or cost < 1 then cost := case p_kind when 'sep' then 5 else 2 end; end if;   -- broken setting → default price
  if not coalesce((b->>'on')::boolean, true) or me.role = 'admin' then
    return jsonb_build_object('balance', me.credits, 'id', null);
  end if;
  if me.credits < cost then raise exception 'insufficient_credits'; end if;
  update public.profiles set credits = credits - cost where id = me.id;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (me.id, -cost, me.credits - cost, 'spend', left(p_kind || coalesce(':' || nullif(btrim(p_ref), ''), ''), 300))
    returning id into lid;
  return jsonb_build_object('balance', me.credits - cost, 'id', lid);
end $$;
revoke execute on function public.spend_credits(text, text) from public, anon;
grant execute on function public.spend_credits(text, text) to authenticated;

-- old signature, kept only so browser tabs still running the previous app.js keep paying.
-- The amount the browser sends is IGNORED; the price comes from the server like above.
create or replace function public.spend_credits(p_amount integer, p_reason text, p_ref text default null)
returns integer language plpgsql security definer set search_path = public as $$
begin
  return (public.spend_credits(p_reason, p_ref)->>'balance')::integer;
end $$;
revoke execute on function public.spend_credits(integer, text, text) from public, anon;
grant execute on function public.spend_credits(integer, text, text) to authenticated;

-- give back the points of a separation that failed or was cancelled: own charge only, within 20 minutes, once
create or replace function public.refund_credits(p_id bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare me public.profiles; row public.credit_ledger;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = auth.uid() for update;       -- serialises refunds per user
  if not found then raise exception 'not allowed'; end if;
  select * into row from public.credit_ledger
   where id = p_id and user_id = me.id and reason = 'spend' and delta < 0
     and ref like 'sep%' and created_at > now() - interval '20 minutes';
  if not found then raise exception 'not refundable'; end if;
  if exists (select 1 from public.credit_ledger where user_id = me.id and reason = 'refund' and ref = 'refund:' || p_id) then
    return me.credits;
  end if;
  -- separation runs in the browser, so cap refunds to keep "refund after success" from making it free
  if (select count(*) from public.credit_ledger where user_id = me.id and reason = 'refund'
        and created_at > now() - interval '1 day') >= 2 then
    raise exception 'refund limit';
  end if;
  update public.profiles set credits = credits - row.delta where id = me.id;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (me.id, -row.delta, me.credits - row.delta, 'refund', 'refund:' || p_id);
  return me.credits - row.delta;
end $$;
revoke execute on function public.refund_credits(bigint) from public, anon;
grant execute on function public.refund_credits(bigint) to authenticated;

-- lazy monthly refill, called by the app after sign-in. Returns the balance.
create or replace function public.refill_credits() returns integer
language plpgsql security definer set search_path = public as $$
declare me public.profiles; pts integer;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
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

-- admin: add (or remove, with a negative amount) points. The balance never drops below 0.
create or replace function public.admin_grant_credits(target uuid, p_amount integer, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare cur integer; nxt integer;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'bad amount'; end if;
  select credits into cur from public.profiles where id = target for update;
  if not found then raise exception 'no such user'; end if;
  nxt := greatest(0, cur + p_amount);
  update public.profiles set credits = nxt where id = target;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (target, nxt - cur, nxt, 'grant', left(nullif(btrim(p_note), ''), 300));
  return nxt;
end $$;
revoke execute on function public.admin_grant_credits(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_credits(uuid, integer, text) to authenticated;

-- admin: activate / extend / cancel a plan by hand (paid subscriptions are handled by pay_webhook below)
create or replace function public.admin_set_plan(target uuid, p_plan text, p_months integer default 1)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; pts integer;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = target for update;
  if not found then raise exception 'no such user'; end if;
  if p_plan = 'free' then
    update public.profiles set plan = 'free', plan_until = null where id = target;
    return;
  end if;
  pts := public.plan_points(p_plan);
  if pts is null then raise exception 'bad plan'; end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'bad months'; end if;
  update public.profiles
     set plan = p_plan,
         plan_until = greatest(now(), coalesce(me.plan_until, now())) + make_interval(months => p_months)
   where id = target;
  if (me.plan is distinct from p_plan or me.last_refill is null or me.last_refill <= now() - interval '1 month') then
    update public.profiles set credits = credits + pts, last_refill = now() where id = target;
    insert into public.credit_ledger (user_id, delta, balance, reason, ref)
      values (target, pts, me.credits + pts, 'plan', p_plan || ' x' || p_months);
  end if;
end $$;
revoke execute on function public.admin_set_plan(uuid, text, integer) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, integer) to authenticated;

-- ───────────── automatic payments (Lemon Squeezy subscriptions) ─────────────
-- Checkout happens on Lemon Squeezy (link per plan in site_config.billing.plans[].link, with the user id in
-- checkout[custom][user_id]). Lemon Squeezy then POSTs signed webhooks to /api/pay/webhook (Cloudflare Pages
-- Function), which forwards the raw body + X-Signature header to public.pay_webhook below. That function checks
-- the HMAC with a secret only the database knows, records the event once (pay_events) and activates the plan /
-- grants the points. The signing secret is stored OUTSIDE the repo, once, in the SQL editor:
--   insert into private.settings (key, value) values ('lemon_signing_secret', 'YOUR-SECRET')
--     on conflict (key) do update set value = excluded.value;
create extension if not exists pgcrypto with schema extensions;

-- settings that must never reach the browser (the API does not expose this schema and nobody but the owner can use it)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
revoke all on private.settings from public, anon, authenticated;
alter table private.settings enable row level security;   -- no policies: only the owner (and security-definer functions) can read it

-- subscription state per user (written only by pay_webhook; not in the column grant, so the browser can't change it)
alter table public.profiles add column if not exists pay_provider    text;
alter table public.profiles add column if not exists pay_sub_id      text;
alter table public.profiles add column if not exists pay_customer_id text;
alter table public.profiles add column if not exists pay_portal      text;   -- customer portal link (manage / cancel)
alter table public.profiles add column if not exists pay_status      text;   -- active / on_trial / past_due / paused / cancelled / expired / unpaid
alter table public.profiles add column if not exists pay_renews      timestamptz;
alter table public.profiles add column if not exists pay_plan        text;   -- plan id of the subscription
revoke update (pay_provider, pay_sub_id, pay_customer_id, pay_portal, pay_status, pay_renews, pay_plan)
  on public.profiles from authenticated, anon, public;
create index if not exists profiles_pay_sub_idx on public.profiles (pay_sub_id) where pay_sub_id is not null;

-- ledger: payments get their own reason
alter table public.credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger add constraint credit_ledger_reason_check
  check (reason in ('signup','spend','grant','refill','plan','refund','payment'));

-- every webhook delivery, once (key = event + object id + version). Admins can read; nobody writes directly.
create table if not exists public.pay_events (
  id         bigserial primary key,
  key        text unique not null,
  event      text,
  user_id    uuid references auth.users(id) on delete set null,
  test       boolean not null default false,
  result     text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pay_events_created_idx on public.pay_events (created_at desc);
alter table public.pay_events enable row level security;
revoke all on public.pay_events from anon, public;
revoke insert, update, delete, truncate on public.pay_events from authenticated;
grant select on public.pay_events to authenticated;
revoke all on sequence public.pay_events_id_seq from authenticated, anon, public;
drop policy if exists "pay_events: admin read" on public.pay_events;
create policy "pay_events: admin read" on public.pay_events for select to authenticated using (public.is_admin());

-- helpers (private schema = not callable through the API)
create or replace function private.pay_ts(v text) returns timestamptz
language plpgsql immutable as $$
begin
  return nullif(btrim(v), '')::timestamptz;
exception when others then return null;
end $$;

-- plan id for a Lemon Squeezy object: 1) the plan whose "variant" is the variant id, 2) a plan id found in the
-- product/variant name, 3) the plan the checkout link asked for, ONLY while no plan has a variant id configured
-- (the buyer can edit that link, so with variants configured it would let a cheap variant claim a bigger plan)
create or replace function private.pay_plan_of(a jsonb, cd jsonb) returns text
language plpgsql stable set search_path = public as $$
declare plans jsonb; r text; nm text; vid text;
begin
  select c.billing->'plans' into plans from public.site_config c where c.id = 1;
  if plans is null or jsonb_typeof(plans) <> 'array' then plans := '[]'::jsonb; end if;
  vid := btrim(coalesce(a->>'variant_id', a->'first_order_item'->>'variant_id', ''));
  if vid <> '' then
    select p->>'id' into r from jsonb_array_elements(plans) p
     where btrim(coalesce(p->>'variant', '')) = vid and coalesce(p->>'id', '') not in ('', 'free') limit 1;
    if r is not null then return r; end if;
  end if;
  nm := lower(concat_ws(' ', a->>'variant_name', a->>'product_name',
                        a->'first_order_item'->>'variant_name', a->'first_order_item'->>'product_name'));
  if btrim(nm) <> '' then
    select p->>'id' into r from jsonb_array_elements(plans) p
     where coalesce(p->>'id', '') not in ('', 'free') and position(lower(p->>'id') in nm) > 0
     order by length(p->>'id') desc limit 1;
    if r is not null then return r; end if;
  end if;
  if not exists (select 1 from jsonb_array_elements(plans) p where btrim(coalesce(p->>'variant', '')) <> '') then
    select p->>'id' into r from jsonb_array_elements(plans) p
     where p->>'id' = cd->>'plan' and p->>'id' <> 'free' limit 1;
  end if;
  return r;
end $$;

-- add points for one payment, exactly once per key (ledger ref starts with 'ls:<key>'). Returns points added.
create or replace function private.pay_grant(p_uid uuid, p_pts integer, p_key text, p_label text, p_test boolean)
returns integer language plpgsql set search_path = public as $$
declare cur integer;
begin
  if p_pts is null or p_pts <= 0 then return 0; end if;
  if exists (select 1 from public.credit_ledger where user_id = p_uid and reason = 'payment'
              and split_part(ref, ' ', 1) = 'ls:' || p_key) then return 0; end if;
  update public.profiles set credits = credits + p_pts where id = p_uid returning credits into cur;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (p_uid, p_pts, cur, 'payment',
            left('ls:' || p_key || ' ' || coalesce(p_label, '') || case when p_test then ' (test)' else '' end, 300));
  return p_pts;
end $$;

-- take back the points of a refunded payment, once, never below 0. Returns points removed (null = nothing was granted).
create or replace function private.pay_take_back(p_uid uuid, p_key text, p_test boolean)
returns integer language plpgsql set search_path = public as $$
declare g integer; cur integer; nxt integer;
begin
  select delta into g from public.credit_ledger where user_id = p_uid and reason = 'payment' and delta > 0
     and split_part(ref, ' ', 1) = 'ls:' || p_key order by id limit 1;
  if g is null then return null; end if;
  if exists (select 1 from public.credit_ledger where user_id = p_uid and reason = 'payment'
              and split_part(ref, ' ', 1) = 'ls:rf:' || p_key) then return 0; end if;
  select credits into cur from public.profiles where id = p_uid;
  nxt := greatest(0, cur - g);
  update public.profiles set credits = nxt where id = p_uid;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (p_uid, nxt - cur, nxt, 'payment',
            left('ls:rf:' || p_key || ' refund' || case when p_test then ' (test)' else '' end, 300));
  return cur - nxt;
end $$;
revoke all on function private.pay_ts(text), private.pay_plan_of(jsonb, jsonb),
  private.pay_grant(uuid, integer, text, text, boolean), private.pay_take_back(uuid, text, boolean)
  from public, anon, authenticated;

-- the webhook. Callable by anyone, but does nothing unless the body is signed with the secret.
create or replace function public.pay_webhook(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  secret text; j jsonb; m jsonb; d jsonb; a jsonb; cd jsonb;
  ev text; typ text; obj text; subid text; test boolean; k text; eid bigint;
  uid uuid; n integer; ids uuid[]; me public.profiles;
  st text; br text; pl text; plkey text; renews timestamptz; ends timestamptz; res text; got integer;
begin
  select value into secret from private.settings where key = 'lemon_signing_secret';
  if coalesce(btrim(secret), '') = '' then raise exception 'not configured'; end if;
  if p_body is null or length(p_body) > 262144 then raise exception 'bad body'; end if;
  if coalesce(btrim(p_sig), '') = '' then raise exception 'bad signature'; end if;
  -- compare digests of both sides so the comparison time doesn't depend on how much of the signature matches
  if extensions.digest(encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex'), 'sha256')
     <> extensions.digest(lower(btrim(p_sig)), 'sha256') then
    raise exception 'bad signature';
  end if;
  begin j := p_body::jsonb; exception when others then raise exception 'bad json'; end;
  if jsonb_typeof(j) <> 'object' then raise exception 'bad json'; end if;

  m := case when jsonb_typeof(j->'meta') = 'object' then j->'meta' else '{}'::jsonb end;
  d := case when jsonb_typeof(j->'data') = 'object' then j->'data' else '{}'::jsonb end;
  a := case when jsonb_typeof(d->'attributes') = 'object' then d->'attributes' else '{}'::jsonb end;
  cd := case when jsonb_typeof(m->'custom_data') = 'object' then m->'custom_data' else '{}'::jsonb end;
  ev := coalesce(m->>'event_name', ''); typ := coalesce(d->>'type', ''); obj := coalesce(d->>'id', '');
  test := lower(coalesce(m->>'test_mode', a->>'test_mode', 'false')) = 'true';

  -- exactly once per delivery of the same change
  k := ev || ':' || obj || ':' ||
       case when typ = 'subscription-invoices' then coalesce(a->>'status', '') else coalesce(a->>'updated_at', a->>'status', '') end ||
       case when test then ':test' else '' end;
  insert into public.pay_events (key, event, test, payload)
    values (left(k, 300), left(ev, 80), test, j #- '{data,attributes,urls}')     -- portal links are private, don't keep them
    on conflict (key) do nothing returning id into eid;
  if eid is null then return 'duplicate'; end if;

  -- which subscription
  subid := case typ when 'subscriptions' then nullif(obj, '') when 'subscription-invoices' then nullif(a->>'subscription_id', '') end;
  if typ = 'orders' and obj <> '' then
    select e.payload->'data'->>'id' into subid from public.pay_events e
     where e.payload->'data'->>'type' = 'subscriptions' and e.payload->'data'->'attributes'->>'order_id' = obj
     order by e.id desc limit 1;
  end if;

  -- which user: our id from the checkout link → the subscription we already know → the buyer's email
  if coalesce(cd->>'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into uid from public.profiles where id = (cd->>'user_id')::uuid;
  end if;
  if uid is null and subid is not null then
    select id into uid from public.profiles where pay_sub_id = subid limit 1;
  end if;
  if uid is null and coalesce(btrim(a->>'user_email'), '') <> '' then
    select array_agg(u.id) into ids from auth.users u join public.profiles p on p.id = u.id
     where lower(u.email) = lower(btrim(a->>'user_email'));
    if coalesce(array_length(ids, 1), 0) = 1 then uid := ids[1]; end if;
  end if;
  if uid is null then
    update public.pay_events set result = 'no user' where id = eid;
    return 'no user';
  end if;
  select * into me from public.profiles where id = uid for update;     -- one payment at a time per user
  update public.pay_events set user_id = uid where id = eid;
  -- test-mode checkouts accept fake cards: they only count for admin accounts (the owner testing), never for users
  if test and me.role <> 'admin' then
    update public.pay_events set result = 'test mode: ignored (only admin accounts can test)' where id = eid;
    return 'test ignored';
  end if;

  if typ = 'subscriptions' and ev like 'subscription_%' then
    st := case when ev = 'subscription_expired' then 'expired' else coalesce(a->>'status', '') end;
    renews := private.pay_ts(a->>'renews_at'); ends := private.pay_ts(a->>'ends_at');
    pl := coalesce(private.pay_plan_of(a, cd), case when me.pay_sub_id = subid then me.pay_plan end);
    if me.pay_sub_id is not null and me.pay_sub_id <> subid and st not in ('active', 'on_trial') then
      res := 'ignored: older subscription';                 -- the user has a newer subscription; don't let the old one end it
    else
      update public.profiles set pay_provider = 'lemonsqueezy', pay_sub_id = subid,
             pay_customer_id = coalesce(nullif(a->>'customer_id', ''), pay_customer_id),
             pay_portal = coalesce(nullif(a->'urls'->>'customer_portal', ''), pay_portal),
             pay_status = nullif(st, ''), pay_renews = coalesce(renews, pay_renews),
             pay_plan = case when pay_sub_id is distinct from subid then pl else coalesce(pl, pay_plan) end
       where id = uid;
      res := st;
      if st in ('active', 'on_trial') then
        if pl is null then
          res := st || ', unknown plan (set the variant id in Billing)';
        else
          update public.profiles set plan = pl,
                 plan_until = greatest(coalesce(renews, now() + interval '1 month'), now()) + interval '3 days'
           where id = uid;
          res := st || ', plan ' || pl;
          if ev = 'subscription_created' and st = 'active' then
            -- first payment (the initial invoice may have granted it already → 0)
            got := private.pay_grant(uid, public.plan_points(pl), 'sub:' || subid, pl, test);
            res := res || ', +' || got;
          elsif st = 'active' and me.pay_sub_id = subid and me.plan <> 'free' and me.plan <> pl
                and coalesce(public.plan_points(pl), 0) > coalesce(public.plan_points(me.plan), 0) then
            -- upgrade: the difference, once per plan per billing period
            plkey := regexp_replace(pl, '\s', '_', 'g');
            got := private.pay_grant(uid, public.plan_points(pl) - coalesce(public.plan_points(me.plan), 0),
                     'up:' || subid || ':' || plkey || ':' || to_char(coalesce(renews, now()), 'YYYYMMDD'), pl || ' upgrade', test);
            res := res || ', upgrade +' || got;
          end if;
        end if;
      elsif st = 'cancelled' then
        -- paid until ends_at, then free
        if ends is not null and ends > now() then
          update public.profiles set plan = case when plan = 'free' and pl is not null then pl else plan end,
                 plan_until = ends where id = uid;
        elsif ends is not null then
          update public.profiles set plan = 'free', plan_until = null where id = uid;
        end if;
      elsif st in ('expired', 'unpaid') then
        update public.profiles set plan = 'free', plan_until = null where id = uid;
      end if;                                               -- past_due / paused: keep the plan until plan_until
    end if;

  elsif typ = 'subscription-invoices' then
    st := coalesce(a->>'status', ''); br := coalesce(a->>'billing_reason', '');
    pl := case when me.pay_sub_id = subid then me.pay_plan end;
    if pl is null then pl := private.pay_plan_of(a, cd); end if;
    if ev in ('subscription_payment_success', 'subscription_payment_recovered') then
      if st <> 'paid' then
        res := 'not paid: ' || st;
      elsif br not in ('initial', 'renewal') then
        res := 'paid (' || br || '), no points';
      elsif pl is null then
        res := 'paid, plan not known yet (subscription_created will grant)';
      else
        got := private.pay_grant(uid, public.plan_points(pl),
                 case when br = 'initial' then 'sub:' || subid else 'inv:' || obj end, pl, test);
        res := br || ', plan ' || pl || ', +' || got;
        if me.pay_sub_id is null or me.pay_sub_id = subid then   -- paid → the plan is on for at least another month
          update public.profiles set plan = pl, pay_provider = 'lemonsqueezy', pay_sub_id = subid,
                 pay_plan = coalesce(pay_plan, pl),
                 pay_status = case when pay_status is null or pay_status in ('past_due', 'unpaid', 'expired') then 'active' else pay_status end,
                 plan_until = greatest(coalesce(plan_until, now()), now() + interval '1 month 3 days')
           where id = uid;
        end if;
      end if;
    elsif ev = 'subscription_payment_refunded' then
      if st = 'refunded' or (lower(coalesce(a->>'refunded', '')) = 'true' and st <> 'partial_refund') then
        got := private.pay_take_back(uid, case when br = 'initial' then 'sub:' || subid else 'inv:' || obj end, test);
        res := case when got is null then 'refunded, nothing was granted' else 'refunded, -' || got end;
      else
        res := 'partial refund, points kept';
      end if;
    else
      res := 'ignored';                                     -- payment_failed etc.: subscription_updated brings the status
    end if;

  elsif typ = 'orders' then
    if ev <> 'order_refunded' then
      res := 'ignored';
    elsif subid is null then
      res := 'ignored: not a subscription order';
    elsif coalesce(a->>'status', '') = 'refunded' then
      got := private.pay_take_back(uid, 'sub:' || subid, test);
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
revoke execute on function public.pay_webhook(text, text) from public;
grant execute on function public.pay_webhook(text, text) to anon, authenticated;

-- =====================================================================
-- Invite a friend. Each user has a short code (profiles.ref_code, made on first request). A new account that
-- signed up through a link ?ref=<code> calls claim_referral once, within 3 days of signing up: the new user AND the
-- inviter each get billing.referral points (default 10). An inviter is rewarded at most billing.referral_max times
-- (default 20) per 30 days, so fake sign-ups can't farm points. Ledger reason 'referral', ref
-- 'ref:joined:<inviter id>' (new user) / 'ref:inviter:<new user id>' (inviter) — each new user is credited once.
-- =====================================================================
alter table public.profiles add column if not exists ref_code    text;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
create unique index if not exists profiles_ref_code_idx on public.profiles (ref_code) where ref_code is not null;
revoke update (ref_code, referred_by) on public.profiles from authenticated, anon, public;

alter table public.credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger add constraint credit_ledger_reason_check
  check (reason in ('signup','spend','grant','refill','plan','refund','payment','referral'));

-- my invite code (created on first call) + how many friends joined and the points it earned
create or replace function public.my_referral() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; code text; n integer; pts integer;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'not allowed'; end if;
  code := me.ref_code;
  while code is null loop
    code := substr(md5(random()::text || clock_timestamp()::text || me.id::text), 1, 8);
    if code !~ '[a-f]' or exists (select 1 from public.profiles where ref_code = code) then code := null; end if;
  end loop;
  if me.ref_code is null then update public.profiles set ref_code = code where id = me.id; end if;
  select count(*) into n from public.profiles where referred_by = me.id;
  select coalesce(sum(delta), 0) into pts from public.credit_ledger where user_id = me.id and reason = 'referral' and ref like 'ref:inviter:%';
  return jsonb_build_object('code', code, 'invited', n, 'earned', pts);
end $$;
revoke execute on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

-- the signed-in (new) user joined through p_code. Returns {ok, points, balance} or {ok:false, why}.
create or replace function public.claim_referral(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; inv public.profiles; b jsonb; pts integer; cap integer; joined timestamptz; recent integer; paid boolean := false;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.blocked then return jsonb_build_object('ok', false, 'why', 'not_allowed'); end if;
  if me.referred_by is not null then return jsonb_build_object('ok', false, 'why', 'already'); end if;
  select created_at into joined from auth.users where id = me.id;
  if joined is null or joined < now() - interval '3 days' then return jsonb_build_object('ok', false, 'why', 'too_late'); end if;
  if p_code is null or btrim(p_code) !~ '^[a-z0-9]{6,12}$' then return jsonb_build_object('ok', false, 'why', 'bad_code'); end if;
  select * into inv from public.profiles where ref_code = btrim(p_code) for update;
  if not found or inv.blocked then return jsonb_build_object('ok', false, 'why', 'bad_code'); end if;
  if inv.id = me.id then return jsonb_build_object('ok', false, 'why', 'self'); end if;

  select billing into b from public.site_config where id = 1;
  pts := least(1000, greatest(0, coalesce(public.safe_int(b->>'referral'), 10)));
  cap := greatest(0, coalesce(public.safe_int(b->>'referral_max'), 20));
  update public.profiles set referred_by = inv.id where id = me.id;
  if pts > 0 then
    update public.profiles set credits = credits + pts where id = me.id;
    insert into public.credit_ledger (user_id, delta, balance, reason, ref)
      values (me.id, pts, me.credits + pts, 'referral', 'ref:joined:' || inv.id);
    select count(*) into recent from public.credit_ledger
     where user_id = inv.id and reason = 'referral' and ref like 'ref:inviter:%' and created_at > now() - interval '30 days';
    if recent < cap then
      update public.profiles set credits = credits + pts where id = inv.id;
      insert into public.credit_ledger (user_id, delta, balance, reason, ref)
        values (inv.id, pts, inv.credits + pts, 'referral', 'ref:inviter:' || me.id);
      paid := true;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'points', pts, 'balance', me.credits + pts, 'inviter_paid', paid);
end $$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- =====================================================================
-- Activity log (admin panel → "Activity"): what signed-in users do on the site (views, uploads, separations,
-- exports, DJ loads…). Written ONLY through log_activity (allow-listed name format, max 400 rows per user per hour,
-- detail ≤ 300 chars); only admins can read it. Rows older than 180 days are removed now and then.
-- =====================================================================
create table if not exists public.activity (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null check (action ~ '^[a-z_]{2,40}$'),
  detail     text check (char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists activity_user_idx on public.activity (user_id, created_at desc);
create index if not exists activity_time_idx on public.activity (created_at desc);
alter table public.activity enable row level security;
revoke all on public.activity from anon, authenticated, public;
grant select on public.activity to authenticated;
revoke all on sequence public.activity_id_seq from anon, authenticated, public;
drop policy if exists "activity: admin read" on public.activity;
create policy "activity: admin read" on public.activity for select to authenticated using (public.is_admin());

create or replace function public.log_activity(p_action text, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_action is null or p_action !~ '^[a-z_]{2,40}$' then return; end if;
  if (select count(*) from public.activity where user_id = uid and created_at > now() - interval '1 hour') >= 400 then return; end if;
  insert into public.activity (user_id, action, detail) values (uid, p_action, nullif(left(btrim(coalesce(p_detail, '')), 300), ''));
  if random() < 0.005 then delete from public.activity where created_at < now() - interval '180 days'; end if;
end $$;
revoke execute on function public.log_activity(text, text) from public, anon;
grant execute on function public.log_activity(text, text) to authenticated;

-- =====================================================================
-- Owner & roles.
-- * The OWNER (profiles.owner) is the site's first account. Nobody can change its role or block it, and only the
--   owner hands out management access.
-- * Giving someone a management role needs the ROLES PASSWORD, which only the owner sets (bcrypt hash in
--   private.settings 'role_password'; 5 wrong tries → locked for 15 minutes). Taking a role away needs no password.
-- * Roles: 'user' (no access), 'admin' (everything except roles), and custom roles the owner creates with a set of
--   permissions: users (see users) · block (block users) · credits (points & plans) · songs (all songs + files) ·
--   activity (activity log) · settings (site & billing settings) · payments (payment events) · catalog (Discover).
-- =====================================================================
alter table public.profiles add column if not exists owner boolean not null default false;
create unique index if not exists profiles_one_owner on public.profiles (owner) where owner;
revoke update (owner, role, blocked) on public.profiles from authenticated, anon, public;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role ~ '^[a-z][a-z0-9_]{1,23}$');

-- the owner = the first account (the site owner's own address wins if it has an account)
update public.profiles set owner = true, role = 'admin', blocked = false
 where not exists (select 1 from public.profiles where owner)
   and id = coalesce((select id from public.profiles where lower(email) = 'oshri1006@gmail.com' order by created_at limit 1),
                     (select id from public.profiles order by created_at, id limit 1));

-- new accounts: the very first one is the owner
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := nullif(new.raw_user_meta_data->>'username', '');
  first_user boolean := not exists (select 1 from public.profiles);
begin
  if wanted is not null and (wanted !~ '^[A-Za-z0-9_.-]{3,24}$' or exists (select 1 from public.profiles where lower(username) = lower(wanted))) then
    wanted := null;
  end if;
  insert into public.profiles (id, username, email, display_name, role, owner)
  values (new.id, wanted, new.email, coalesce(wanted, ''), case when first_user then 'admin' else 'user' end, first_user);
  return new;
end $$;

create table if not exists public.roles (
  id         text primary key check (id ~ '^[a-z][a-z0-9_]{1,23}$'),
  name       text not null check (char_length(name) between 1 and 40),
  perms      text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.roles enable row level security;
revoke all on public.roles from anon, authenticated, public;
grant select on public.roles to authenticated;
drop policy if exists "roles: read" on public.roles;
create policy "roles: read" on public.roles for select to authenticated using (true);

create or replace function public.all_perms() returns text[] language sql immutable as $$
  select array['users','block','credits','songs','activity','settings','payments','catalog']::text[];
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and owner);
$$;
-- 'admin' (and the owner) have every permission; custom roles have their list
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles pr left join public.roles r on r.id = pr.role
                  where pr.id = auth.uid() and (pr.owner or (not pr.blocked and (pr.role = 'admin' or p = any(coalesce(r.perms, '{}'))))));
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (owner or (role = 'admin' and not blocked)));
$$;
-- what the signed-in user may do (the admin panel shows only these parts)
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('owner', pr.owner, 'role', pr.role,
    'perms', to_jsonb(case when pr.owner or (pr.role = 'admin' and not pr.blocked) then public.all_perms()
                           when pr.blocked then '{}'::text[] else coalesce(r.perms, '{}') end))
    from public.profiles pr left join public.roles r on r.id = pr.role where pr.id = auth.uid();
$$;
revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- custom-role holders see what their permissions cover (policies add up, so admins keep their old access)
drop policy if exists "profiles: perm users" on public.profiles;
create policy "profiles: perm users" on public.profiles for select to authenticated using (public.has_perm('users'));
drop policy if exists "songs: perm songs" on public.songs;
create policy "songs: perm songs" on public.songs for select to authenticated using (public.has_perm('songs'));
drop policy if exists "uploads: perm songs read" on storage.objects;
create policy "uploads: perm songs read" on storage.objects for select to authenticated using (bucket_id = 'uploads' and public.has_perm('songs'));
drop policy if exists "downloads: perm users" on public.downloads;
create policy "downloads: perm users" on public.downloads for select to authenticated using (public.has_perm('users'));
drop policy if exists "ledger: perm credits" on public.credit_ledger;
create policy "ledger: perm credits" on public.credit_ledger for select to authenticated using (public.has_perm('credits'));
drop policy if exists "pay_events: perm payments" on public.pay_events;
create policy "pay_events: perm payments" on public.pay_events for select to authenticated using (public.has_perm('payments'));
drop policy if exists "activity: perm activity" on public.activity;
create policy "activity: perm activity" on public.activity for select to authenticated using (public.has_perm('activity'));
drop policy if exists "config: perm settings" on public.site_config;
create policy "config: perm settings" on public.site_config for update to authenticated using (public.has_perm('settings')) with check (public.has_perm('settings'));
drop policy if exists "catalog: perm catalog edit" on public.catalog;
create policy "catalog: perm catalog edit" on public.catalog for update to authenticated using (public.has_perm('catalog')) with check (public.has_perm('catalog'));
drop policy if exists "catalog: perm catalog delete" on public.catalog;
create policy "catalog: perm catalog delete" on public.catalog for delete to authenticated using (public.has_perm('catalog'));

-- points & plans by hand: 'credits' permission
create or replace function public.admin_grant_credits(target uuid, p_amount integer, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare cur integer; nxt integer;
begin
  if not public.has_perm('credits') then raise exception 'not allowed'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'bad amount'; end if;
  select credits into cur from public.profiles where id = target for update;
  if not found then raise exception 'no such user'; end if;
  nxt := greatest(0, cur + p_amount);
  update public.profiles set credits = nxt where id = target;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (target, nxt - cur, nxt, 'grant', left(nullif(btrim(p_note), ''), 300));
  return nxt;
end $$;
do $$ declare src text; begin
  -- admin_set_plan keeps its body; only the permission check changes
  select pg_get_functiondef('public.admin_set_plan(uuid, text, integer)'::regprocedure) into src;
  if position('public.is_admin()' in src) > 0 then execute replace(src, 'public.is_admin()', 'public.has_perm(''credits'')'); end if;
exception when others then null; end $$;

-- blocking: 'block' permission; the owner can never be blocked, and only the owner can block people with a role
create or replace function public.admin_set_blocked(target uuid, is_blocked boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  if not public.has_perm('block') then raise exception 'not allowed'; end if;
  if target = auth.uid() then raise exception 'cannot block yourself'; end if;
  select * into t from public.profiles where id = target;
  if not found then raise exception 'no such user'; end if;
  if t.owner then raise exception 'owner'; end if;
  if t.role <> 'user' and not public.is_owner() then raise exception 'not allowed'; end if;
  update public.profiles set blocked = is_blocked where id = target;
end $$;

-- roles password (owner only)
create table if not exists private.role_pw_fail (at timestamptz not null default now());
revoke all on private.role_pw_fail from public, anon, authenticated;
create or replace function private.role_pw_ok(p text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select value into h from private.settings where key = 'role_password';
  if h is null then raise exception 'no_role_password'; end if;
  if (select count(*) from private.role_pw_fail where at > now() - interval '15 minutes') >= 5 then raise exception 'locked'; end if;
  if p is not null and extensions.crypt(p, h) = h then delete from private.role_pw_fail; return true; end if;
  insert into private.role_pw_fail default values;
  return false;
end $$;
revoke execute on function private.role_pw_ok(text) from public, anon, authenticated;

create or replace function public.owner_role_password_set() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  return exists (select 1 from private.settings where key = 'role_password');
end $$;
-- returns 'ok' | 'short' | 'bad_password' | 'locked' (a wrong password must not raise: the failed try has to stay counted)
drop function if exists public.owner_set_role_password(text, text);
create or replace function public.owner_set_role_password(p_new text, p_old text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if p_new is null or char_length(p_new) < 8 or char_length(p_new) > 200 then return 'short'; end if;
  if exists (select 1 from private.settings where key = 'role_password') then
    if (select count(*) from private.role_pw_fail where at > now() - interval '15 minutes') >= 5 then return 'locked'; end if;
    if not private.role_pw_ok(p_old) then return 'bad_password'; end if;
  end if;
  insert into private.settings (key, value) values ('role_password', extensions.crypt(p_new, extensions.gen_salt('bf', 10)))
    on conflict (key) do update set value = excluded.value;
  return 'ok';
end $$;

-- roles: owner only, and a management role needs the roles password
-- returns 'ok' | 'bad_password' | 'locked' | 'no_role_password'
drop function if exists public.admin_set_role(uuid, text);
drop function if exists public.admin_set_role(uuid, text, text);
create or replace function public.admin_set_role(target uuid, new_role text, p_password text default null) returns text
language plpgsql security definer set search_path = public as $$
declare t public.profiles;
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if target = auth.uid() then raise exception 'cannot change your own role'; end if;
  select * into t from public.profiles where id = target for update;
  if not found then raise exception 'no such user'; end if;
  if t.owner then raise exception 'owner'; end if;
  if new_role is null or (new_role not in ('user','admin') and not exists (select 1 from public.roles where id = new_role)) then raise exception 'bad role'; end if;
  if new_role <> 'user' then
    if not exists (select 1 from private.settings where key = 'role_password') then return 'no_role_password'; end if;
    if (select count(*) from private.role_pw_fail where at > now() - interval '15 minutes') >= 5 then return 'locked'; end if;
    if not private.role_pw_ok(p_password) then return 'bad_password'; end if;
  end if;
  update public.profiles set role = new_role where id = target;
  return 'ok';
end $$;
create or replace function public.owner_save_role(p_id text, p_name text, p_perms text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  if p_id is null or p_id !~ '^[a-z][a-z0-9_]{1,23}$' or p_id in ('user','admin','owner') then raise exception 'bad role'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then raise exception 'bad name'; end if;
  if exists (select 1 from unnest(coalesce(p_perms, '{}')) x where x <> all(public.all_perms())) then raise exception 'bad perms'; end if;
  insert into public.roles (id, name, perms) values (p_id, btrim(p_name), coalesce(p_perms, '{}'))
    on conflict (id) do update set name = excluded.name, perms = excluded.perms;
end $$;
create or replace function public.owner_delete_role(p_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'not allowed'; end if;
  update public.profiles set role = 'user' where role = p_id and not owner;
  delete from public.roles where id = p_id;
end $$;
do $$ declare f text; begin
  foreach f in array array['owner_role_password_set()','owner_set_role_password(text, text)','admin_set_role(uuid, text, text)',
                           'owner_save_role(text, text, text[])','owner_delete_role(text)','admin_set_blocked(uuid, boolean)',
                           'admin_grant_credits(uuid, integer, text)','has_perm(text)','is_owner()'] loop
    execute 'revoke execute on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;

-- =====================================================================
-- Terms consent (was supabase/auth_consent.sql)
-- =====================================================================
-- Chord Room — consent to the Terms of Use / Privacy Policy, stored with every new account.
-- Run AFTER supabase/schema.sql (Supabase → SQL Editor → New query → paste → Run). Safe to run again.
-- IMPORTANT: schema.sql also defines public.handle_new_user(). Whenever schema.sql is re-run, run this file
-- again afterwards, otherwise new sign-ups stop recording which terms version they accepted.
--
-- The sign-up form sends options.data = { username, terms_version: 'YYYY-MM-DD', terms_at: ISO time }
-- (assets/backend.js signUp). The trigger copies them into profiles once, when the account is created.
-- user_metadata can later be changed by the user, profiles.terms_* cannot: they are NOT granted for update.

alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists terms_at timestamptz;
alter table public.profiles drop constraint if exists profiles_terms_version_check;
alter table public.profiles add constraint profiles_terms_version_check
  check (terms_version is null or terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');
-- the browser may only update the columns granted in schema.sql; make sure these two never are
revoke update (terms_version, terms_at) on public.profiles from authenticated, anon, public;

-- new accounts: the very first one is the owner (same as schema.sql "Owner & roles") + the accepted terms
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := nullif(new.raw_user_meta_data->>'username', '');
  first_user boolean := not exists (select 1 from public.profiles);
  tv text := nullif(left(coalesce(new.raw_user_meta_data->>'terms_version', ''), 10), '');
  ta timestamptz;
begin
  if wanted is not null and (wanted !~ '^[A-Za-z0-9_.-]{3,24}$' or exists (select 1 from public.profiles where lower(username) = lower(wanted))) then
    wanted := null;
  end if;
  if tv is not null and tv !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then tv := null; end if;
  if tv is not null then
    begin
      ta := (new.raw_user_meta_data->>'terms_at')::timestamptz;
    exception when others then
      ta := null;
    end;
    -- the client clock is not trusted: outside a small window around the sign-up, use the server time
    if ta is null or ta > now() + interval '10 minutes' or ta < now() - interval '1 day' then ta := now(); end if;
  end if;
  insert into public.profiles (id, username, email, display_name, role, owner, terms_version, terms_at)
  values (new.id, wanted, new.email, coalesce(wanted, ''), case when first_user then 'admin' else 'user' end, first_user, tv, ta);
  return new;
end $$;

-- the trigger itself is created in schema.sql (on_auth_user_created); recreate it here too so this file works on its own
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Points v2 (the same block is in supabase/points_v2.sql for a one-time run in the SQL editor)
-- [points-v2:begin]
-- =====================================================================
-- A price for every paid action, per-plan discounts, batches (qty), partial refunds, songs charged once.
-- Kinds = keys of site_config.billing.costs (points per unit, admin-editable 0…100; 0 = free):
--   song 1      analysing an uploaded song (Tool / DJ / Crate), once per song per account (charged_songs)
--   sep 5       AI stem separation (refund_credits: own charge, ≤ 20 min, once, 2 refunds a day)
--   stems 2     downloading separated stems, once per song (the app remembers it per song)
--   usb 1       per song in a Crate folder export: "USB for Pioneer" (Latin names + cues + tags) or the renamed-copies ZIP (cues + tags)
--   mashup 3    Mashup Studio export · extended 3  Extended export · convert 1  per file in a Converter batch
-- Discount: billing.plans[].discount (0…90 %) while the user's plan is active (plan <> 'free' and plan_until > now();
-- a live subscription keeps plan_until = renews_at + 3 days). price = ceil(unit × qty × (100 − discount) / 100).
-- Free (charged 0, no ledger row): billing.on = false, admins and the owner, or a 0 price.
-- Every function here is idempotent to re-run; stored settings keep their values (only missing keys are added).

alter table public.site_config alter column billing set default
  '{"on":true,"signup":20,"costs":{"song":1,"sep":5,"stems":2,"usb":1,"mashup":3,"extended":3,"convert":1},"currency":"ILS","contact":"",
    "plans":[{"id":"basic","price":29,"points":60,"link":"","discount":0},
             {"id":"pro","price":59,"points":150,"link":"","best":true,"discount":10},
             {"id":"studio","price":99,"points":400,"link":"","discount":25}]}'::jsonb;
-- new cost kinds: added with their default price, existing prices are kept
update public.site_config
   set billing = jsonb_set(billing, '{costs}',
         '{"song":1,"sep":5,"stems":2,"usb":1,"mashup":3,"extended":3,"convert":1}'::jsonb
         || case when jsonb_typeof(billing->'costs') = 'object' then billing->'costs' else '{}'::jsonb end)
 where id = 1 and jsonb_typeof(billing) = 'object'
   and not (case when jsonb_typeof(billing->'costs') = 'object' then billing->'costs' else '{}'::jsonb end
            ?& array['song','sep','stems','usb','mashup','extended','convert']);
-- plan discounts: basic 0, pro 10, studio 25, any other plan 0 (only where a plan has none yet)
update public.site_config
   set billing = jsonb_set(billing, '{plans}', (
         select jsonb_agg(case when jsonb_typeof(p) = 'object' and not (p ? 'discount')
                               then p || jsonb_build_object('discount', case p->>'id' when 'pro' then 10 when 'studio' then 25 else 0 end)
                               else p end order by o)
           from jsonb_array_elements(billing->'plans') with ordinality x(p, o)))
 where id = 1 and jsonb_typeof(billing->'plans') = 'array' and jsonb_array_length(billing->'plans') > 0
   and exists (select 1 from jsonb_array_elements(billing->'plans') p where jsonb_typeof(p) = 'object' and not (p ? 'discount'));

-- charge rows remember what they were for: kind, how many units, how many of them were refunded
alter table public.credit_ledger add column if not exists kind text;
alter table public.credit_ledger add column if not exists qty integer;
alter table public.credit_ledger add column if not exists refunded integer not null default 0;
alter table public.credit_ledger drop constraint if exists credit_ledger_qty_check;
alter table public.credit_ledger add constraint credit_ledger_qty_check
  check ((qty is null or qty between 1 and 500) and refunded >= 0 and (qty is null or refunded <= qty));
alter table public.credit_ledger drop constraint if exists credit_ledger_kind_check;
alter table public.credit_ledger add constraint credit_ledger_kind_check check (kind is null or kind ~ '^[a-z][a-z_]{1,23}$');
create index if not exists credit_ledger_refund_idx on public.credit_ledger (user_id, created_at desc) where reason = 'refund';

-- songs a user already paid the 'song' price for (any module). Written only by spend_song (security definer).
create table if not exists public.charged_songs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  song_key   text not null check (song_key ~ '^[A-Za-z0-9._-]{1,80}$'),
  kind       text not null default 'song' check (kind ~ '^[a-z][a-z_]{1,23}$'),
  ledger_id  bigint,
  created_at timestamptz not null default now(),
  primary key (user_id, song_key, kind)
);
alter table public.charged_songs enable row level security;
revoke all on public.charged_songs from public, anon, authenticated;
grant select on public.charged_songs to authenticated;
drop policy if exists "charged_songs: own read" on public.charged_songs;
create policy "charged_songs: own read" on public.charged_songs
  for select to authenticated using (user_id = auth.uid() or public.has_perm('credits'));

-- unit price of a kind; null = not a kind. A kind is a key of billing.costs (or one of the built-in kinds while the
-- settings don't have it yet). A broken stored value falls back to the built-in price; always clamped to 0…100.
create or replace function private.cost_of(b jsonb, p_kind text) returns integer
language sql immutable set search_path = public as $$
  select case
    when p_kind is null or p_kind !~ '^[a-z][a-z_]{1,23}$' then null
    when not (coalesce(case when jsonb_typeof(b->'costs') = 'object' then b->'costs' end, '{}'::jsonb) ? p_kind)
         and p_kind not in ('song','sep','stems','usb','mashup','extended','convert') then null
    else greatest(0, least(100, coalesce(public.safe_int(b->'costs'->>p_kind),
           case p_kind when 'sep' then 5 when 'stems' then 2 when 'mashup' then 3 when 'extended' then 3 else 1 end)))
  end;
$$;
revoke all on function private.cost_of(jsonb, text) from public, anon, authenticated;

-- the discount (percent) of the user's ACTIVE plan, 0 when none
create or replace function private.plan_discount(me public.profiles, b jsonb) returns integer
language sql stable set search_path = public as $$
  select case when me.plan is null or me.plan = 'free' or me.plan_until is null or me.plan_until <= now() then 0
    else coalesce((select greatest(0, least(90, coalesce(public.safe_int(p->>'discount'), 0)))
                     from jsonb_array_elements(case when jsonb_typeof(b->'plans') = 'array' then b->'plans' else '[]'::jsonb end) p
                    where jsonb_typeof(p) = 'object' and p->>'id' = me.plan limit 1), 0) end;
$$;
revoke all on function private.plan_discount(public.profiles, jsonb) from public, anon, authenticated;

create or replace function private.price_of(p_unit integer, p_qty integer, p_disc integer) returns integer
language sql immutable as $$ select ceil(p_unit::numeric * p_qty * (100 - p_disc) / 100)::integer $$;
revoke all on function private.price_of(integer, integer, integer) from public, anon, authenticated;

-- spend points for p_qty units of a paid action. The PRICE COMES FROM THE SERVER. Atomic per user (row lock).
-- → {balance, id (ledger row, null when free), charged, unit, qty, discount, free}. Raises 'insufficient_credits'.
create or replace function public.spend_credits_n(p_kind text, p_qty integer, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; b jsonb; unit integer; disc integer; price integer; lid bigint;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 500 then raise exception 'bad qty'; end if;
  select coalesce(billing, '{}'::jsonb) into b from public.site_config where id = 1;
  b := coalesce(b, '{}'::jsonb);
  unit := private.cost_of(b, p_kind);
  if unit is null then raise exception 'bad kind'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.blocked then raise exception 'not allowed'; end if;
  disc := private.plan_discount(me, b);
  price := private.price_of(unit, p_qty, disc);
  if b->'on' = 'false'::jsonb or me.role = 'admin' or me.owner or price <= 0 then
    return jsonb_build_object('balance', me.credits, 'id', null, 'charged', 0, 'unit', unit, 'qty', p_qty, 'discount', disc, 'free', true);
  end if;
  if me.credits < price then raise exception 'insufficient_credits'; end if;
  update public.profiles set credits = credits - price where id = me.id;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref, kind, qty)
    values (me.id, -price, me.credits - price, 'spend',
            left(p_kind || ' ×' || p_qty || coalesce(' ' || nullif(btrim(regexp_replace(p_ref, '[[:cntrl:]]', ' ', 'g')), ''), ''), 300), p_kind, p_qty)
    returning id into lid;
  return jsonb_build_object('balance', me.credits - price, 'id', lid, 'charged', price, 'unit', unit, 'qty', p_qty, 'discount', disc, 'free', false);
end $$;
revoke execute on function public.spend_credits_n(text, integer, text) from public, anon;
grant execute on function public.spend_credits_n(text, integer, text) to authenticated;

-- one unit (existing callers: 'sep', 'stems'). Same answer shape as before ({balance, id}) plus the v2 fields.
create or replace function public.spend_credits(p_kind text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.spend_credits_n(p_kind, 1, p_ref);
end $$;
revoke execute on function public.spend_credits(text, text) from public, anon;
grant execute on function public.spend_credits(text, text) to authenticated;

-- what an action would cost this user now (read-only, for the confirmation dialog)
create or replace function public.price_quote(p_kind text, p_qty integer default 1)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles; b jsonb; unit integer; disc integer; free boolean;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 500 then raise exception 'bad qty'; end if;
  select coalesce(billing, '{}'::jsonb) into b from public.site_config where id = 1;
  b := coalesce(b, '{}'::jsonb);
  unit := private.cost_of(b, p_kind);
  if unit is null then raise exception 'bad kind'; end if;
  select * into me from public.profiles where id = auth.uid();
  if not found or me.blocked then raise exception 'not allowed'; end if;
  disc := private.plan_discount(me, b);
  free := b->'on' = 'false'::jsonb or me.role = 'admin' or me.owner;
  return jsonb_build_object('unit', unit, 'qty', p_qty, 'discount', disc,
    'total', case when free then 0 else private.price_of(unit, p_qty, disc) end, 'balance', me.credits, 'free', free, 'plan', me.plan);
end $$;
revoke execute on function public.price_quote(text, integer) from public, anon;
grant execute on function public.price_quote(text, integer) to authenticated;

-- analysing an uploaded song: the 'song' price once per (user, song key). → spend_credits_n's answer + already
create or replace function public.spend_song(p_song_key text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; r jsonb;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_song_key is null or p_song_key !~ '^[A-Za-z0-9._-]{1,80}$' then raise exception 'bad key'; end if;
  select * into me from public.profiles where id = auth.uid() for update;        -- serialises per user (no double charge)
  if not found or me.blocked then raise exception 'not allowed'; end if;
  if exists (select 1 from public.charged_songs where user_id = me.id and song_key = p_song_key and kind = 'song') then
    return jsonb_build_object('balance', me.credits, 'id', null, 'charged', 0, 'qty', 1, 'already', true, 'free', true);
  end if;
  r := public.spend_credits_n('song', 1, coalesce(nullif(btrim(p_ref), ''), p_song_key));
  insert into public.charged_songs (user_id, song_key, kind, ledger_id)
    values (me.id, p_song_key, 'song', nullif(r->>'id', '')::bigint) on conflict do nothing;
  return r || jsonb_build_object('already', false);
end $$;
revoke execute on function public.spend_song(text, text) from public, anon;
grant execute on function public.spend_song(text, text) to authenticated;

-- give back p_qty units of a batch charge that failed (Crate USB / renamed-copies rows, Converter files, a failed export,
-- a page that died mid-batch): own row from spend_credits_n, ≤ 3 hours old (a 50-file video batch in the Converter can
-- take that long), never more units than were charged (refunded is tracked on the row), at the price that was paid (the
-- sum of all partial refunds of a row = what it cost). Not for 'sep' (refund_credits), 'song' or 'stems' (the app never
-- refunds those). Caps: 20 refunds and 1000 refunded units a day (a failed 300-song Crate folder must fit). → {balance, refunded (points), left (units still refundable)}
create or replace function public.refund_credits_n(p_id bigint, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.credit_ledger; amt integer; calls integer; units integer;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 500 then raise exception 'bad qty'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'not allowed'; end if;
  select * into r from public.credit_ledger
   where id = p_id and user_id = me.id and reason = 'spend' and delta < 0 and qty is not null
     and kind is not null and kind not in ('sep', 'song', 'stems') and created_at > now() - interval '3 hours'
   for update;
  if not found then raise exception 'not refundable'; end if;
  if r.refunded + p_qty > r.qty then raise exception 'over refund'; end if;
  select count(*), coalesce(sum(qty), 0) into calls, units from public.credit_ledger
   where user_id = me.id and reason = 'refund' and ref like 'refundn:%' and created_at > now() - interval '1 day';
  if calls >= 20 or units + p_qty > 1000 then raise exception 'refund limit'; end if;
  amt := floor(-r.delta::numeric * (r.refunded + p_qty) / r.qty)::integer - floor(-r.delta::numeric * r.refunded / r.qty)::integer;
  update public.credit_ledger set refunded = refunded + p_qty where id = r.id;
  if amt > 0 then
    update public.profiles set credits = credits + amt where id = me.id;
    insert into public.credit_ledger (user_id, delta, balance, reason, ref, kind, qty)
      values (me.id, amt, me.credits + amt, 'refund', 'refundn:' || p_id || ':' || p_qty, r.kind, p_qty);
  end if;
  return jsonb_build_object('balance', me.credits + greatest(amt, 0), 'refunded', greatest(amt, 0), 'left', r.qty - r.refunded - p_qty);
end $$;
revoke execute on function public.refund_credits_n(bigint, integer) from public, anon;
grant execute on function public.refund_credits_n(bigint, integer) to authenticated;

-- separation refund (unchanged rules: own 'sep' charge, ≤ 20 min, once, 2 a day) — now matched by kind, and the daily
-- cap counts only separation refunds (batch refunds above have their own caps)
create or replace function public.refund_credits(p_id bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare me public.profiles; row public.credit_ledger;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = auth.uid() for update;       -- serialises refunds per user
  if not found then raise exception 'not allowed'; end if;
  select * into row from public.credit_ledger
   where id = p_id and user_id = me.id and reason = 'spend' and delta < 0
     and (kind = 'sep' or (kind is null and ref like 'sep%')) and created_at > now() - interval '20 minutes';
  if not found then raise exception 'not refundable'; end if;
  if exists (select 1 from public.credit_ledger where user_id = me.id and reason = 'refund' and ref = 'refund:' || p_id) then
    return me.credits;
  end if;
  -- separation runs in the browser, so cap refunds to keep "refund after success" from making it free
  if (select count(*) from public.credit_ledger where user_id = me.id and reason = 'refund' and ref like 'refund:%'
        and created_at > now() - interval '1 day') >= 2 then
    raise exception 'refund limit';
  end if;
  update public.credit_ledger set refunded = coalesce(qty, 1) where id = row.id and qty is not null;
  update public.profiles set credits = credits - row.delta where id = me.id;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref, kind, qty)
    values (me.id, -row.delta, me.credits - row.delta, 'refund', 'refund:' || p_id, 'sep', 1);
  return me.credits - row.delta;
end $$;
revoke execute on function public.refund_credits(bigint) from public, anon;
grant execute on function public.refund_credits(bigint) to authenticated;
-- =====================================================================
-- [points-v2:end]
-- =====================================================================

-- =====================================================================
-- Security hardening (was supabase/security.sql) — keep it LAST: it tightens what the blocks above create.
-- =====================================================================
-- Chord Room: security hardening. Run it in the Supabase SQL editor AFTER schema.sql (and again after every
-- re-run of schema.sql, because schema.sql redefines some of the functions patched here). Safe to run many times.
--
-- Every block starts with [S-n] and the issue it closes. Nothing here stores or prints a secret.
-- Checks that apply only to the browser run when current_user is 'anon' / 'authenticated' (a direct REST call);
-- the security-definer RPCs and the SQL editor run as the owner and are not affected by those triggers.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-1] Table privileges. Supabase's default privileges give anon/authenticated ALL on every new table,
-- including TRUNCATE (not covered by RLS), REFERENCES and TRIGGER, and anon INSERT/DELETE on tables it never writes.
-- RLS already blocks most of it; this removes the privileges themselves (defence in depth).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['profiles','songs','site_config','catalog','downloads','credit_ledger','pay_events','activity','roles'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke truncate, references, trigger on public.%I from anon, authenticated, public', t);
      execute format('revoke insert, update, delete on public.%I from anon', t);   -- anon writes only through RPCs
    end if;
  end loop;
end $$;
-- the browser never inserts/deletes profiles (the auth trigger does), never edits the download log or the audit tables
revoke insert, delete on public.profiles from authenticated;
revoke update, delete on public.downloads from authenticated;
revoke insert, update, delete on public.credit_ledger, public.pay_events, public.activity, public.roles from authenticated;
-- future tables created by this role: no TRUNCATE/REFERENCES/TRIGGER for the API roles
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- [S-2] Functions that only make sense for a signed-in user are not callable by anon (they were, through PUBLIC).
revoke execute on function public.bump_seps() from public, anon;
grant execute on function public.bump_seps() to authenticated;
revoke execute on function public.catalog_set_full(text, numeric, smallint, smallint, jsonb) from public, anon;
grant execute on function public.catalog_set_full(text, numeric, smallint, smallint, jsonb) to authenticated;
-- trigger / helper functions: never RPCs
revoke execute on function public.handle_new_user(), public.handle_user_email(), public.count_songs(),
  public.handle_signup_credits() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-3] profiles: values the browser may write are validated.
--  * avatar_url could be ANY string (tracking pixel on the admin panel, someone else's picture, javascript: …)
--    → only '' or a public URL of the user's OWN folder in this project's avatars bucket.
--  * display_name / bio had no real limits (display_name unbounded) → length + no control characters.
--  * last_seen could be forged (admin panel "last seen") → always the server's now().
--  * usernames were unique only case-sensitively ('Admin' next to 'admin') → case-insensitive unique index.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;   -- RPCs / triggers / SQL editor
  if new.display_name is distinct from old.display_name then
    new.display_name := btrim(regexp_replace(coalesce(new.display_name, ''), '[[:cntrl:]]', '', 'g'));
    if char_length(new.display_name) > 60 then raise exception 'bad display_name' using errcode = '22023'; end if;
  end if;
  if new.bio is distinct from old.bio then
    new.bio := regexp_replace(coalesce(new.bio, ''), '[\x01-\x09\x0b-\x1f\x7f]', '', 'g');
  end if;
  if new.avatar_url is distinct from old.avatar_url and coalesce(new.avatar_url, '') <> '' then
    -- the project URL is public (config.js); change it here if the project ever moves
    if new.avatar_url !~ ('^https://ydyocusfrghsokjsectw\.supabase\.co/storage/v1/object/public/avatars/'
                          || old.id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}(\?v=[0-9]{1,15})?$') then
      raise exception 'bad avatar_url' using errcode = '22023';
    end if;
  end if;
  if new.last_seen is distinct from old.last_seen then new.last_seen := now(); end if;
  return new;
end $$;
revoke all on function private.guard_profile() from public, anon, authenticated;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile();

do $$ begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'profiles_username_lower_key') then
    if exists (select lower(username) from public.profiles where username is not null group by 1 having count(*) > 1) then
      raise warning 'security.sql: two usernames differ only in case; rename one and run this file again';
    else
      create unique index profiles_username_lower_key on public.profiles (lower(username));
    end if;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-4] songs: the library row is validated.
--  * file_path could point into ANOTHER user's folder (the admin "details → download all" then fetched the
--    victim's file under the attacker's name) → must be '<own uid>/<file name>'.
--  * name / genre / data had no size limits (a single row could hold hundreds of MB) → limits + max rows per user.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_song() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.name is null or char_length(new.name) not between 1 and 300 then raise exception 'bad song name' using errcode = '22023'; end if;
  if char_length(coalesce(new.genre, '')) > 80 then raise exception 'bad genre' using errcode = '22023'; end if;
  if new.file_path is not null and new.file_path !~ ('^' || new.user_id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$') then
    raise exception 'bad file_path' using errcode = '22023';
  end if;
  if new.file_type is not null and (char_length(new.file_type) > 100 or new.file_type !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$') then
    raise exception 'bad file_type' using errcode = '22023';
  end if;
  if new.file_size is not null and new.file_size not between 0 and 52428800 then raise exception 'bad file_size' using errcode = '22023'; end if;
  if octet_length(new.data::text) > 2000000 then raise exception 'song data too large' using errcode = '22023'; end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if (select count(*) from public.songs where user_id = new.user_id) >= 5000 then
      raise exception 'too many songs' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_song() from public, anon, authenticated;
drop trigger if exists songs_guard on public.songs;
create trigger songs_guard before insert or update on public.songs
  for each row execute function private.guard_song();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-5] downloads (export log): unbounded rows/sizes and forgeable created_at; blocked users kept writing.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_download() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and blocked) then raise exception 'not allowed'; end if;
  new.created_at := now();
  if jsonb_typeof(new.files) <> 'array' or jsonb_array_length(new.files) > 100 or octet_length(new.files::text) > 8000 then
    raise exception 'bad files' using errcode = '22023';
  end if;
  if new.size is not null and new.size not between 0 and 21474836480 then raise exception 'bad size' using errcode = '22023'; end if;
  if (select count(*) from public.downloads where user_id = new.user_id and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'rate limit' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.guard_download() from public, anon, authenticated;
drop trigger if exists downloads_guard on public.downloads;
create trigger downloads_guard before insert on public.downloads
  for each row execute function private.guard_download();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-6] catalog (shared Discover data, shown to every visitor). Any member could insert rows with
--  plays = 2e9 (top of "popular"), is_full = true (fake "Full analysis", blocks real ones), a cover URL on their
--  own server (IP tracking of every visitor), a non-Deezer link, backdated created_at, and a chords array of any
--  size/shape. Now: counters/flags are forced, cover/link must be Deezer URLs, chords = small int arrays,
--  text has no control characters, and inserts are rate limited per member.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create index if not exists catalog_by_idx on public.catalog (analyzed_by, created_at desc);
create index if not exists catalog_full_by_idx on public.catalog (full_by, full_at desc);

create or replace function public.catalog_chords_ok(c jsonb, maxn integer) returns boolean
language sql immutable set search_path = public as $$
  select c is not null and jsonb_typeof(c) = 'array' and jsonb_array_length(c) <= maxn
     and not exists (select 1 from jsonb_array_elements(c) e
                      where jsonb_typeof(e) <> 'number' or e::text !~ '^-?\d{1,2}$' or e::text::int not between -1 and 23);
$$;
revoke execute on function public.catalog_chords_ok(jsonb, integer) from public, anon;
grant execute on function public.catalog_chords_ok(jsonb, integer) to authenticated;

-- rows the signed-in member added in the last hour (definer: works even when analyzed_by is not readable, see [S-16])
create or replace function public.catalog_my_recent_adds() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.catalog where analyzed_by = auth.uid() and created_at > now() - interval '1 hour';
$$;
revoke execute on function public.catalog_my_recent_adds() from public, anon;
grant execute on function public.catalog_my_recent_adds() to authenticated;

create or replace function private.guard_catalog() returns trigger
language plpgsql set search_path = public as $$
declare cl text := '[[:cntrl:]]';
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.source := 'deezer'; new.ext_id := substr(new.id, 4)::bigint;
    new.plays := 0; new.is_full := false; new.full_by := null; new.full_at := null;
    new.created_at := now(); new.analyzed_by := auth.uid();
    if public.catalog_my_recent_adds() >= 400 then
      raise exception 'rate limit' using errcode = '22023';
    end if;
  end if;
  new.title := btrim(regexp_replace(new.title, cl, '', 'g'));
  new.artist := btrim(regexp_replace(new.artist, cl, '', 'g'));
  new.album := btrim(regexp_replace(coalesce(new.album, ''), cl, '', 'g'));
  if new.title = '' or new.artist = '' then raise exception 'bad title' using errcode = '22023'; end if;
  if coalesce(new.cover, '') <> '' and new.cover !~ '^https://([a-z0-9-]+\.)*dzcdn\.net/[A-Za-z0-9/._-]{1,255}$'
                                    and new.cover !~ '^https://api\.deezer\.com/(album|artist|playlist)/[0-9]{1,15}/image$' then
    raise exception 'bad cover' using errcode = '22023';
  end if;
  if coalesce(new.link, '') <> '' and new.link !~ '^https://www\.deezer\.com/([a-z]{2}/)?track/[0-9]{1,15}$' then
    raise exception 'bad link' using errcode = '22023';
  end if;
  if not public.catalog_chords_ok(new.chords, 16) then
    raise exception 'bad chords' using errcode = '22023';
  end if;
  if new.duration is not null and new.duration not between 0 and 36000 then raise exception 'bad duration' using errcode = '22023'; end if;
  if new.release_date is not null and new.release_date not between date '1900-01-01' and (now() + interval '2 years')::date then
    new.release_date := null;
  end if;
  return new;
end $$;
revoke all on function private.guard_catalog() from public, anon, authenticated;
drop trigger if exists catalog_guard on public.catalog;
create trigger catalog_guard before insert or update on public.catalog
  for each row execute function private.guard_catalog();

-- [S-7] catalog_set_full: chords elements were not checked (any JSON, any size), there was no rate limit (one member
-- could mark every chart track as "full" with junk, and the first one wins forever), and only full admins could
-- replace a bad one. Now: int chords, 20 per member per day, holders of the 'catalog' permission can replace.
create or replace function public.catalog_set_full(cid text, p_bpm numeric, p_pc smallint, p_mode smallint, p_chords jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer; mod boolean;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and blocked) then
    raise exception 'not allowed';
  end if;
  if p_bpm is null or p_bpm < 30 or p_bpm > 300 or p_pc is null or p_pc not between 0 and 11 or p_mode is null or p_mode not in (0,1)
     or not public.catalog_chords_ok(p_chords, 16) then
    raise exception 'bad analysis';
  end if;
  mod := public.has_perm('catalog');
  if not mod and (select count(*) from public.catalog where full_by = auth.uid() and full_at > now() - interval '1 day') >= 20 then
    raise exception 'rate limit';
  end if;
  -- the first full analysis wins; catalog moderators (and admins) can always replace it
  update public.catalog
     set bpm = p_bpm, key_pc = p_pc, key_mode = p_mode, chords = p_chords,
         is_full = true, full_by = auth.uid(), full_at = now()
   where id = cid and (not is_full or mod);
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.catalog_set_full(text, numeric, smallint, smallint, jsonb) from public, anon;
grant execute on function public.catalog_set_full(text, numeric, smallint, smallint, jsonb) to authenticated;

-- [S-8] catalog_play: anyone (even without an account) could call it in a loop and push any track to the top of
-- "popular". Now: a member counts once per track per day, visitors without an account once per track per hour in total.
create table if not exists private.catalog_play_log (
  cid  text not null,
  who  text not null,
  slot bigint not null,
  primary key (cid, who, slot)
);
revoke all on private.catalog_play_log from public, anon, authenticated;
create or replace function public.catalog_play(cid text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n integer;
begin
  if cid is null or cid !~ '^dz:[0-9]{1,15}$' then return; end if;
  insert into private.catalog_play_log (cid, who, slot)
    values (cid, coalesce(uid::text, 'anon'),
            case when uid is null then floor(extract(epoch from now()) / 3600) else floor(extract(epoch from now()) / 86400) end)
    on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update public.catalog set plays = plays + 1 where id = cid; end if;
  if random() < 0.002 then
    delete from private.catalog_play_log where slot < floor(extract(epoch from now()) / 86400) - 2
                                            and slot < floor(extract(epoch from now()) / 3600) - 48;
  end if;
end $$;
revoke execute on function public.catalog_play(text) from public;
grant execute on function public.catalog_play(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-9] site_config: settings holders ('settings' permission, not only full admins) could store values the whole
-- site then uses: billing.contact = 'javascript:…' (app.js contactAction() assigns it to location.href → stored XSS
-- on every user → session theft of the owner = privilege escalation), plan links to any site, absurd point values.
-- Now the fields are validated when they change (also for admins; the SQL editor is not affected).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_config() returns trigger
language plpgsql set search_path = public as $$
declare b jsonb; p jsonb; ids text[] := '{}'; v text;
  url_re text := '^https://[^[:space:][:cntrl:]<>"''`\\]{3,}$';
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if char_length(coalesce(new.title, '')) > 80 or char_length(coalesce(new.announce, '')) > 1000 then
    raise exception 'bad config: text too long' using errcode = '22023';
  end if;
  if coalesce(new.lang, 'he') not in ('he','en','ar','ru','es') then raise exception 'bad config: lang' using errcode = '22023'; end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.billing is not distinct from old.billing then return new; end if;
  b := new.billing;
  if b is null or jsonb_typeof(b) <> 'object' then raise exception 'bad billing' using errcode = '22023'; end if;
  if b ? 'on' and jsonb_typeof(b->'on') <> 'boolean' then raise exception 'bad billing: on' using errcode = '22023'; end if;
  if b ? 'signup' and coalesce(public.safe_int(b->>'signup'), -1) not between 0 and 10000 then raise exception 'bad billing: signup' using errcode = '22023'; end if;
  if b ? 'referral' and coalesce(public.safe_int(b->>'referral'), -1) not between 0 and 1000 then raise exception 'bad billing: referral' using errcode = '22023'; end if;
  if b ? 'referral_max' and coalesce(public.safe_int(b->>'referral_max'), -1) not between 0 and 10000 then raise exception 'bad billing: referral_max' using errcode = '22023'; end if;
  if b ? 'storage_mb' and coalesce(public.safe_int(b->>'storage_mb'), -1) not between 0 and 1000000 then raise exception 'bad billing: storage_mb' using errcode = '22023'; end if;
  if b ? 'max_files' and coalesce(public.safe_int(b->>'max_files'), -1) not between 0 and 1000000 then raise exception 'bad billing: max_files' using errcode = '22023'; end if;
  if b ? 'costs' then
    if jsonb_typeof(b->'costs') <> 'object' then raise exception 'bad billing: costs' using errcode = '22023'; end if;
    -- points v2: any kind name, a whole number, clamped to 0…100 (0 = free)
    if (select count(*) from jsonb_object_keys(b->'costs')) > 30 then raise exception 'bad billing: costs' using errcode = '22023'; end if;
    for v in select jsonb_object_keys(b->'costs') loop
      if v !~ '^[a-z][a-z_]{1,23}$' then raise exception 'bad billing: costs key' using errcode = '22023'; end if;
      if public.safe_int(b->'costs'->>v) is null then raise exception 'bad billing: costs.%', v using errcode = '22023'; end if;
      new.billing := jsonb_set(new.billing, array['costs', v], to_jsonb(greatest(0, least(100, public.safe_int(b->'costs'->>v)))));
    end loop;
  end if;
  if coalesce(b->>'currency', '') !~ '^([A-Z]{3})?$' then raise exception 'bad billing: currency' using errcode = '22023'; end if;
  -- contact: an email, an https:// link or plain text ("WhatsApp: 050…"); never a script/data/plain-http/
  -- protocol-relative URL (the app puts it in location.href). Browsers ignore whitespace/control characters
  -- inside a scheme ("java\tscript:"), so the check runs on the text with those removed.
  v := btrim(coalesce(b->>'contact', ''));
  if char_length(v) > 200 then raise exception 'bad billing: contact too long' using errcode = '22023'; end if;
  v := lower(regexp_replace(v, '[[:space:][:cntrl:]]', '', 'g'));
  if v ~ '^(javascript|vbscript|data|blob|file|filesystem|about|http):' or v ~ '^[/\\]' or v ~ '[<>"`]' then
    raise exception 'bad billing: contact (an email address, an https:// link or plain text)' using errcode = '22023';
  end if;
  if b ? 'plans' then
    if jsonb_typeof(b->'plans') <> 'array' or jsonb_array_length(b->'plans') > 12 then raise exception 'bad billing: plans' using errcode = '22023'; end if;
    for p in select * from jsonb_array_elements(b->'plans') loop
      if jsonb_typeof(p) <> 'object' or coalesce(p->>'id', '') !~ '^[a-z][a-z0-9_]{1,23}$' or p->>'id' = 'free' or (p->>'id') = any(ids) then
        raise exception 'bad billing: plan id' using errcode = '22023';
      end if;
      ids := ids || (p->>'id');
      if coalesce(public.safe_int(p->>'points'), -1) not between 0 and 1000000 then raise exception 'bad billing: plan points' using errcode = '22023'; end if;
      if coalesce(p->>'price', '0') !~ '^\d{1,6}(\.\d{1,12})?$' then raise exception 'bad billing: plan price' using errcode = '22023'; end if;
      if coalesce(p->>'link', '') <> '' and (p->>'link' !~ url_re or char_length(p->>'link') > 500) then raise exception 'bad billing: plan link (https://)' using errcode = '22023'; end if;
      if coalesce(p->>'variant', '') !~ '^(\d{1,12}|P-[A-Z0-9]{10,40})?$' then raise exception 'bad billing: plan variant' using errcode = '22023'; end if;
      if p ? 'discount' and public.safe_int(p->>'discount') is null then raise exception 'bad billing: plan discount' using errcode = '22023'; end if;
    end loop;
    -- points v2: plan discount clamped to 0…90 %
    if jsonb_array_length(b->'plans') > 0 then
      new.billing := jsonb_set(new.billing, '{plans}', (select jsonb_agg(case when x.q ? 'discount'
          then jsonb_set(x.q, '{discount}', to_jsonb(greatest(0, least(90, public.safe_int(x.q->>'discount'))))) else x.q end order by x.o)
        from jsonb_array_elements(b->'plans') with ordinality x(q, o)));
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_config() from public, anon, authenticated;
drop trigger if exists site_config_guard on public.site_config;
create trigger site_config_guard before insert or update on public.site_config
  for each row execute function private.guard_config();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-10] storage.
--  * avatars had NO size or type limit (free file hosting of any size, HTML/SVG served from the project domain)
--    → 2 MB, jpeg/png/webp only. uploads accepted any content type → audio/video types only.
--  * "avatars: public read" let anyone LIST the whole bucket = every user's id. A public bucket does not need a
--    SELECT policy for its public URLs, so listing is now limited to the user's own folder (upsert still works).
--  * no quota on uploads (50 MB × unlimited files per account) → per-user files / MB limit
--    (site_config.billing.max_files / storage_mb, defaults 2000 files / 5120 MB; avatars 30 files), admins exempt.
--  * names with '.' / '..' segments, backslashes or control characters are refused; blocked users can't upload avatars.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
update storage.buckets set public = true, file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'avatars';
update storage.buckets set public = false, file_size_limit = 52428800,
       allowed_mime_types = array['audio/*','video/mp4','video/webm','video/ogg','video/quicktime','video/x-matroska',
                                  'application/ogg','application/octet-stream'] where id = 'uploads';

-- may the signed-in user add an object called p_name to p_bucket? (their own folder, clean name, within quota)
create or replace function public.storage_room(p_bucket text, p_name text) returns boolean
language plpgsql stable security definer set search_path = public, storage as $$
declare uid uuid := auth.uid(); n bigint; bytes bigint; b jsonb; maxn bigint; maxb bigint;
begin
  if uid is null or p_bucket is null or p_name is null then return false; end if;
  if p_name ~ '(^|/)\.{1,2}(/|$)' or p_name ~ '[\\[:cntrl:]]' or p_name ~ '//' or char_length(p_name) > 400 then return false; end if;
  if (storage.foldername(p_name))[1] is distinct from uid::text then return false; end if;
  if exists (select 1 from public.profiles where id = uid and blocked) then return false; end if;
  if public.is_admin() then return true; end if;
  if exists (select 1 from storage.objects where bucket_id = p_bucket and name = p_name) then return true; end if;   -- overwrite
  select billing into b from public.site_config where id = 1;
  if p_bucket = 'avatars' then maxn := 30; maxb := 20::bigint * 1048576;
  else
    maxn := coalesce(public.safe_int(b->>'max_files'), 2000);
    maxb := coalesce(public.safe_int(b->>'storage_mb'), 5120)::bigint * 1048576;
  end if;
  select count(*), coalesce(sum(case when metadata->>'size' ~ '^\d{1,15}$' then (metadata->>'size')::bigint else 0 end), 0)
    into n, bytes from storage.objects
   where bucket_id = p_bucket and (storage.foldername(name))[1] = uid::text;
  return n < maxn and bytes < maxb;
end $$;
revoke execute on function public.storage_room(text, text) from public, anon;
grant execute on function public.storage_room(text, text) to authenticated;

drop policy if exists "avatars: public read" on storage.objects;
drop policy if exists "avatars: own read" on storage.objects;
create policy "avatars: own read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars: own upload" on storage.objects;
create policy "avatars: own upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.storage_room(bucket_id, name));
drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.storage_room(bucket_id, name));
drop policy if exists "uploads: own write" on storage.objects;
create policy "uploads: own write" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text and public.storage_room(bucket_id, name));
drop policy if exists "uploads: own update" on storage.objects;
create policy "uploads: own update" on storage.objects for update to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text and public.storage_room(bucket_id, name));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-11] roles: every signed-in user could read all custom roles and their permissions.
-- Now: admins, holders of 'users' (they see role names in the users list) and a user's own role.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists "roles: read" on public.roles;
create policy "roles: read" on public.roles for select to authenticated
  using (public.is_admin() or public.has_perm('users')
         or id = (select pr.role from public.profiles pr where pr.id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-12] Referrals: two fresh accounts could invite EACH OTHER (both sides paid twice), and an account whose email
-- was never confirmed could claim. Now both are refused. (Logic otherwise unchanged from schema.sql.)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.claim_referral(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; inv public.profiles; b jsonb; pts integer; cap integer; joined timestamptz; conf timestamptz;
        recent integer; paid boolean := false;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.blocked then return jsonb_build_object('ok', false, 'why', 'not_allowed'); end if;
  if me.referred_by is not null then return jsonb_build_object('ok', false, 'why', 'already'); end if;
  select u.created_at, u.email_confirmed_at into joined, conf from auth.users u where u.id = me.id;
  if joined is null or joined < now() - interval '3 days' then return jsonb_build_object('ok', false, 'why', 'too_late'); end if;
  if conf is null then return jsonb_build_object('ok', false, 'why', 'not_confirmed'); end if;
  if p_code is null or btrim(p_code) !~ '^[a-z0-9]{6,12}$' then return jsonb_build_object('ok', false, 'why', 'bad_code'); end if;
  select * into inv from public.profiles where ref_code = btrim(p_code) for update;
  if not found or inv.blocked then return jsonb_build_object('ok', false, 'why', 'bad_code'); end if;
  if inv.id = me.id or inv.referred_by = me.id then return jsonb_build_object('ok', false, 'why', 'self'); end if;

  select billing into b from public.site_config where id = 1;
  pts := least(1000, greatest(0, coalesce(public.safe_int(b->>'referral'), 10)));
  cap := greatest(0, coalesce(public.safe_int(b->>'referral_max'), 20));
  update public.profiles set referred_by = inv.id where id = me.id;
  if pts > 0 then
    update public.profiles set credits = credits + pts where id = me.id;
    insert into public.credit_ledger (user_id, delta, balance, reason, ref)
      values (me.id, pts, me.credits + pts, 'referral', 'ref:joined:' || inv.id);
    select count(*) into recent from public.credit_ledger
     where user_id = inv.id and reason = 'referral' and ref like 'ref:inviter:%' and created_at > now() - interval '30 days';
    if recent < cap then
      update public.profiles set credits = credits + pts where id = inv.id;
      insert into public.credit_ledger (user_id, delta, balance, reason, ref)
        values (inv.id, pts, inv.credits + pts, 'referral', 'ref:inviter:' || me.id);
      paid := true;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'points', pts, 'balance', me.credits + pts, 'inviter_paid', paid);
end $$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-13] Points by hand: a custom role with the 'credits' permission could grant ITSELF unlimited points or a paid
-- plan (full admins are free anyway). Now only the owner may target their own account. Bodies otherwise as in schema.sql.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.admin_grant_credits(target uuid, p_amount integer, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare cur integer; nxt integer;
begin
  if not public.has_perm('credits') then raise exception 'not allowed'; end if;
  if target = auth.uid() and not public.is_owner() then raise exception 'not allowed'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'bad amount'; end if;
  select credits into cur from public.profiles where id = target for update;
  if not found then raise exception 'no such user'; end if;
  nxt := greatest(0, cur + p_amount);
  update public.profiles set credits = nxt where id = target;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (target, nxt - cur, nxt, 'grant', left(nullif(btrim(p_note), ''), 300));
  return nxt;
end $$;
revoke execute on function public.admin_grant_credits(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_credits(uuid, integer, text) to authenticated;

create or replace function public.admin_set_plan(target uuid, p_plan text, p_months integer default 1)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; pts integer;
begin
  if not public.has_perm('credits') then raise exception 'not allowed'; end if;
  if target = auth.uid() and not public.is_owner() then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = target for update;
  if not found then raise exception 'no such user'; end if;
  if p_plan = 'free' then
    update public.profiles set plan = 'free', plan_until = null where id = target;
    return;
  end if;
  pts := public.plan_points(p_plan);
  if pts is null then raise exception 'bad plan'; end if;
  if p_months is null or p_months < 1 or p_months > 36 then raise exception 'bad months'; end if;
  update public.profiles
     set plan = p_plan,
         plan_until = greatest(now(), coalesce(me.plan_until, now())) + make_interval(months => p_months)
   where id = target;
  if (me.plan is distinct from p_plan or me.last_refill is null or me.last_refill <= now() - interval '1 month') then
    update public.profiles set credits = credits + pts, last_refill = now() where id = target;
    insert into public.credit_ledger (user_id, delta, balance, reason, ref)
      values (target, pts, me.credits + pts, 'plan', p_plan || ' x' || p_months);
  end if;
end $$;
revoke execute on function public.admin_set_plan(uuid, text, integer) from public, anon;
grant execute on function public.admin_set_plan(uuid, text, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-14] Audit trail: there was no record of WHO changed a role, blocked someone, granted points or set a plan.
-- These are written to the activity log (admin-readable) as adm_* actions, with the acting account in the detail.
-- log_activity now refuses adm_* names, so users can't forge audit rows.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.audit_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor text := coalesce(auth.uid()::text, 'system');
begin
  if new.role is distinct from old.role then
    insert into public.activity (user_id, action, detail) values (new.id, 'adm_role', left('by ' || actor || ': ' || old.role || ' → ' || new.role, 300));
  end if;
  if new.blocked is distinct from old.blocked then
    insert into public.activity (user_id, action, detail) values (new.id, 'adm_block', left('by ' || actor || ': ' || case when new.blocked then 'blocked' else 'unblocked' end, 300));
  end if;
  if new.owner is distinct from old.owner then
    insert into public.activity (user_id, action, detail) values (new.id, 'adm_owner', left('by ' || actor || ': owner=' || new.owner, 300));
  end if;
  if (new.plan is distinct from old.plan or new.plan_until is distinct from old.plan_until)
     and auth.uid() is not null and auth.uid() <> new.id then
    insert into public.activity (user_id, action, detail)
      values (new.id, 'adm_plan', left('by ' || actor || ': ' || coalesce(new.plan, '-') || ' until ' || coalesce(to_char(new.plan_until, 'YYYY-MM-DD'), '-'), 300));
  end if;
  return null;
end $$;
revoke all on function private.audit_profile() from public, anon, authenticated;
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after update of role, blocked, owner, plan, plan_until on public.profiles
  for each row execute function private.audit_profile();

create or replace function private.audit_ledger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.reason in ('grant', 'plan') then
    insert into public.activity (user_id, action, detail)
      values (new.user_id, 'adm_credits', left('by ' || coalesce(auth.uid()::text, 'system') || ': ' || new.reason || ' '
                                               || new.delta || ' → ' || new.balance || coalesce(' · ' || new.ref, ''), 300));
  end if;
  return null;
end $$;
revoke all on function private.audit_ledger() from public, anon, authenticated;
drop trigger if exists credit_ledger_audit on public.credit_ledger;
create trigger credit_ledger_audit after insert on public.credit_ledger
  for each row execute function private.audit_ledger();

create or replace function public.log_activity(p_action text, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_action is null or p_action !~ '^[a-z_]{2,40}$' or p_action like 'adm\_%' then return; end if;
  if (select count(*) from public.activity where user_id = uid and created_at > now() - interval '1 hour') >= 400 then return; end if;
  insert into public.activity (user_id, action, detail)
    values (uid, p_action, nullif(left(btrim(regexp_replace(coalesce(p_detail, ''), '[[:cntrl:]]', ' ', 'g')), 300), ''));
  if random() < 0.005 then delete from public.activity where created_at < now() - interval '180 days'; end if;
end $$;
revoke execute on function public.log_activity(text, text) from public, anon;
grant execute on function public.log_activity(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-15] Payments.
--  a) Plan from the product/variant NAME was a substring match and applied even when variant ids are configured:
--     any other subscription in the same Lemon Squeezy store whose name merely contains a plan id ("Producer pack"
--     contains "pro") activated that plan with its points. Now names are used only while NO variant id is configured,
--     and only as whole words.
--  b) The last-resort match by the buyer's email accepted unconfirmed accounts: with email confirmation off, someone
--     could register a buyer's address first and collect their subscription. Now only confirmed emails match.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.pay_plan_of(a jsonb, cd jsonb) returns text
language plpgsql stable set search_path = public as $$
declare plans jsonb; r text; nm text; vid text;
begin
  select c.billing->'plans' into plans from public.site_config c where c.id = 1;
  if plans is null or jsonb_typeof(plans) <> 'array' then plans := '[]'::jsonb; end if;
  vid := btrim(coalesce(a->>'variant_id', a->'first_order_item'->>'variant_id', ''));
  if vid <> '' then
    select p->>'id' into r from jsonb_array_elements(plans) p
     where btrim(coalesce(p->>'variant', '')) = vid and coalesce(p->>'id', '') not in ('', 'free') limit 1;
    if r is not null then return r; end if;
  end if;
  -- variant ids configured → only an exact variant id counts (names and the editable checkout hint are ignored)
  if exists (select 1 from jsonb_array_elements(plans) p where btrim(coalesce(p->>'variant', '')) <> '') then return null; end if;
  nm := lower(concat_ws(' ', a->>'variant_name', a->>'product_name',
                        a->'first_order_item'->>'variant_name', a->'first_order_item'->>'product_name'));
  if btrim(nm) <> '' then
    select p->>'id' into r from jsonb_array_elements(plans) p
     where coalesce(p->>'id', '') ~ '^[a-z][a-z0-9_]{1,23}$' and p->>'id' <> 'free'
       and nm ~ ('\m' || lower(p->>'id') || '\M')
     order by length(p->>'id') desc limit 1;
    if r is not null then return r; end if;
  end if;
  select p->>'id' into r from jsonb_array_elements(plans) p
   where p->>'id' = cd->>'plan' and p->>'id' <> 'free' limit 1;
  return r;
end $$;
revoke all on function private.pay_plan_of(jsonb, jsonb) from public, anon, authenticated;

do $$
declare src text;
  old_s text := 'where lower(u.email) = lower(btrim(a->>''user_email''));';
  new_s text := 'where lower(u.email) = lower(btrim(a->>''user_email'')) and u.email_confirmed_at is not null;';
begin
  src := pg_get_functiondef('public.pay_webhook(text, text)'::regprocedure);
  if position(new_s in src) > 0 then return; end if;                  -- already patched
  if position(old_s in src) = 0 then
    raise warning 'security.sql [S-15b]: pay_webhook email match not found - NOT patched, check the function by hand';
    return;
  end if;
  execute replace(src, old_s, new_s);                                 -- create or replace keeps owner and grants
end $$;
revoke execute on function public.pay_webhook(text, text) from public;
grant execute on function public.pay_webhook(text, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-16] Phase 2 — run ONLY after the browser code stops selecting these columns with select('*')
-- (see the audit report: backend.js getProfile/adminUsers/catalogGet/catalogList). Until then these lines would
-- break the site, so they are commented out.
--  * profiles.pay_portal is a signed Lemon Squeezy customer-portal link (manage/cancel the subscription); anyone with
--    the 'users' permission can read everybody's. Serve it to its owner through my_pay_portal() instead.
--  * catalog.analyzed_by / full_by publish which account analysed which song to every visitor.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.my_pay_portal() returns text
language sql stable security definer set search_path = public as $$
  select pay_portal from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_pay_portal() from public, anon;
grant execute on function public.my_pay_portal() to authenticated;
-- (a column can only be hidden when the table-level SELECT is replaced by a column list)
-- do $$ declare cols text; begin
--   select string_agg(quote_ident(column_name), ', ') into cols from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles' and column_name <> 'pay_portal';
--   execute 'revoke select on public.profiles from anon, authenticated';
--   execute 'grant select (' || cols || ') on public.profiles to authenticated';
-- end $$;
-- revoke select on public.catalog from anon, authenticated;
-- grant select (id, source, ext_id, title, artist, album, cover, link, release_date, duration, bpm, key_pc, key_mode,
--               chords, plays, created_at, is_full, full_at) on public.catalog to anon, authenticated;

-- =====================================================================
-- Security v3 (this block + supabase/assistant.sql = supabase/security_v3.sql, for a one-time run in the SQL editor)
-- [security-v3:begin]
-- =====================================================================
-- Server-side audit 2026-10 (SECURITY-AUDIT.md). Mostly storage/cost exhaustion: tables a visitor or a member could
-- grow without bound (on Supabase a full disk makes the whole project read-only), plus payment-link routing.
-- Idempotent; re-run it after schema.sql like the blocks above.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-17] catalog_play: an ANONYMOUS visitor could insert one private.catalog_play_log row per call for any
-- 'dz:<15 digits>' id, also ids that are not in the catalog (10^15 of them) → millions of rows per hour, kept 2 days.
-- Now only ids that exist in the catalog are counted (bounded by catalog size × 1 per hour).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.catalog_play(cid text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n integer;
begin
  if cid is null or cid !~ '^dz:[0-9]{1,15}$' then return; end if;
  if not exists (select 1 from public.catalog where id = cid) then return; end if;
  insert into private.catalog_play_log (cid, who, slot)
    values (cid, coalesce(uid::text, 'anon'),
            case when uid is null then floor(extract(epoch from now()) / 3600) else floor(extract(epoch from now()) / 86400) end)
    on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update public.catalog set plays = plays + 1 where id = cid; end if;
  if random() < 0.002 then
    delete from private.catalog_play_log where slot < floor(extract(epoch from now()) / 86400) - 2
                                            and slot < floor(extract(epoch from now()) / 3600) - 48;
  end if;
end $$;
revoke execute on function public.catalog_play(text) from public;
grant execute on function public.catalog_play(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-18] Activity log: 400 rows per hour per member, kept 180 days = up to 1.7 million rows (≈ 400 MB) from ONE
-- account. Now also at most 1500 rows per member per day (normal use is a few dozen); over the cap it is skipped.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.log_activity(p_action text, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_action is null or p_action !~ '^[a-z_]{2,40}$' or p_action like 'adm\_%' then return; end if;
  if (select count(*) from public.activity where user_id = uid and created_at > now() - interval '1 hour') >= 400 then return; end if;
  if (select count(*) from public.activity where user_id = uid and created_at > now() - interval '1 day') >= 1500 then return; end if;
  insert into public.activity (user_id, action, detail)
    values (uid, p_action, nullif(left(btrim(regexp_replace(coalesce(p_detail, ''), '[[:cntrl:]]', ' ', 'g')), 300), ''));
  if random() < 0.005 then delete from public.activity where created_at < now() - interval '180 days'; end if;
end $$;
revoke execute on function public.log_activity(text, text) from public, anon;
grant execute on function public.log_activity(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-19] My Songs rows and the download log: 5000 songs × 2 MB of `data` = 10 GB per account; the download log
-- 300 rows/hour forever. Now the analyses of one account are capped at 50 MB in total (a real song is a few KB), and
-- the download log at 1500 rows per account per day. (Bodies otherwise as in [S-4] / [S-5].)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_song() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.name is null or char_length(new.name) not between 1 and 300 then raise exception 'bad song name' using errcode = '22023'; end if;
  if char_length(coalesce(new.genre, '')) > 80 then raise exception 'bad genre' using errcode = '22023'; end if;
  if new.file_path is not null and new.file_path !~ ('^' || new.user_id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$') then
    raise exception 'bad file_path' using errcode = '22023';
  end if;
  if new.file_type is not null and (char_length(new.file_type) > 100 or new.file_type !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$') then
    raise exception 'bad file_type' using errcode = '22023';
  end if;
  if new.file_size is not null and new.file_size not between 0 and 52428800 then raise exception 'bad file_size' using errcode = '22023'; end if;
  if octet_length(new.data::text) > 2000000 then raise exception 'song data too large' using errcode = '22023'; end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if (select count(*) from public.songs where user_id = new.user_id) >= 5000 then
      raise exception 'too many songs' using errcode = '22023';
    end if;
  end if;
  -- the other rows of this account (an upsert replaces the row with the same name) + this one
  if (select coalesce(sum(pg_column_size(s.data)), 0) from public.songs s
       where s.user_id = new.user_id and s.id <> new.id and s.name <> new.name) + pg_column_size(new.data) > 52428800 then
    raise exception 'song storage full' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.guard_song() from public, anon, authenticated;

create or replace function private.guard_download() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and blocked) then raise exception 'not allowed'; end if;
  new.created_at := now();
  if jsonb_typeof(new.files) <> 'array' or jsonb_array_length(new.files) > 100 or octet_length(new.files::text) > 8000 then
    raise exception 'bad files' using errcode = '22023';
  end if;
  if new.size is not null and new.size not between 0 and 21474836480 then raise exception 'bad size' using errcode = '22023'; end if;
  if (select count(*) from public.downloads where user_id = new.user_id and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'rate limit' using errcode = '22023';
  end if;
  if (select count(*) from public.downloads where user_id = new.user_id and created_at > now() - interval '1 day') >= 1500 then
    raise exception 'rate limit' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.guard_download() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-20] Catalog (shown to every visitor): 400 new rows per hour per member = 9600 invented tracks a day (any title,
-- wrong key/BPM) in the "new" list; the Deezer link did not have to be the row's own track.
-- Now also 1500 new rows per member per day, and a new row's link always points at its own track id.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.catalog_my_adds_today() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.catalog where analyzed_by = auth.uid() and created_at > now() - interval '1 day';
$$;
revoke execute on function public.catalog_my_adds_today() from public, anon;
grant execute on function public.catalog_my_adds_today() to authenticated;

create or replace function private.guard_catalog() returns trigger
language plpgsql set search_path = public as $$
declare cl text := '[[:cntrl:]]';
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.source := 'deezer'; new.ext_id := substr(new.id, 4)::bigint;
    new.plays := 0; new.is_full := false; new.full_by := null; new.full_at := null;
    new.created_at := now(); new.analyzed_by := auth.uid();
    if public.catalog_my_recent_adds() >= 400 or public.catalog_my_adds_today() >= 1500 then
      raise exception 'rate limit' using errcode = '22023';
    end if;
  end if;
  new.title := btrim(regexp_replace(new.title, cl, '', 'g'));
  new.artist := btrim(regexp_replace(new.artist, cl, '', 'g'));
  new.album := btrim(regexp_replace(coalesce(new.album, ''), cl, '', 'g'));
  if new.title = '' or new.artist = '' then raise exception 'bad title' using errcode = '22023'; end if;
  if coalesce(new.cover, '') <> '' and new.cover !~ '^https://([a-z0-9-]+\.)*dzcdn\.net/[A-Za-z0-9/._-]{1,255}$'
                                    and new.cover !~ '^https://api\.deezer\.com/(album|artist|playlist)/[0-9]{1,15}/image$' then
    raise exception 'bad cover' using errcode = '22023';
  end if;
  if coalesce(new.link, '') <> '' and new.link !~ '^https://www\.deezer\.com/([a-z]{2}/)?track/[0-9]{1,15}$' then
    raise exception 'bad link' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and coalesce(new.link, '') <> '' and substring(new.link from '([0-9]+)$')::bigint <> new.ext_id then
    new.link := 'https://www.deezer.com/track/' || new.ext_id;      -- the row's own track, never another one
  end if;
  if not public.catalog_chords_ok(new.chords, 16) then
    raise exception 'bad chords' using errcode = '22023';
  end if;
  if new.duration is not null and new.duration not between 0 and 36000 then raise exception 'bad duration' using errcode = '22023'; end if;
  if new.release_date is not null and new.release_date not between date '1900-01-01' and (now() + interval '2 years')::date then
    new.release_date := null;
  end if;
  return new;
end $$;
revoke all on function private.guard_catalog() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-21] spend_song while the 'song' price is 0 (or billing is off) charges nothing but still stored one
-- charged_songs row per call, for any key the browser sends → unbounded rows. Free rows are now capped at 3000 per
-- account per day (paid rows are bounded by the points). Body otherwise as in points v2.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.spend_song(p_song_key text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; r jsonb;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_song_key is null or p_song_key !~ '^[A-Za-z0-9._-]{1,80}$' then raise exception 'bad key'; end if;
  select * into me from public.profiles where id = auth.uid() for update;        -- serialises per user (no double charge)
  if not found or me.blocked then raise exception 'not allowed'; end if;
  if exists (select 1 from public.charged_songs where user_id = me.id and song_key = p_song_key and kind = 'song') then
    return jsonb_build_object('balance', me.credits, 'id', null, 'charged', 0, 'qty', 1, 'already', true, 'free', true);
  end if;
  r := public.spend_credits_n('song', 1, coalesce(nullif(btrim(p_ref), ''), p_song_key));
  if r->>'id' is not null or (select count(*) from public.charged_songs where user_id = me.id
                                and created_at > now() - interval '1 day') < 3000 then
    insert into public.charged_songs (user_id, song_key, kind, ledger_id)
      values (me.id, p_song_key, 'song', nullif(r->>'id', '')::bigint) on conflict do nothing;
  end if;
  return r || jsonb_build_object('already', false);
end $$;
revoke execute on function public.spend_song(text, text) from public, anon;
grant execute on function public.spend_song(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-22] Payment routing: a custom role with only the 'settings' permission could point every plan's checkout link
-- at its own store (or change the Lemon Squeezy variant ids), i.e. redirect the site's revenue. Now plans[].link and
-- plans[].variant change only for the owner and full admins; prices, points and discounts stay editable by 'settings'.
-- Also: 'settings' holders could not save at all through the app's upsert (no INSERT policy) → policy added below.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_config_pay() returns trigger
language plpgsql set search_path = public as $$
declare ob jsonb; o jsonb; n jsonb;
begin
  -- owner/full admins may; everyone without 'settings' is refused by RLS anyway (after this BEFORE trigger)
  if current_user not in ('anon', 'authenticated') or public.is_admin() or not public.has_perm('settings') then return new; end if;
  -- an upsert fires the INSERT trigger first: compare with the stored row then
  if tg_op = 'UPDATE' then ob := old.billing; else select c.billing into ob from public.site_config c where c.id = new.id; end if;
  if new.billing is not distinct from ob then return new; end if;
  select coalesce(jsonb_agg(jsonb_build_array(p->>'id', coalesce(p->>'link', ''), coalesce(p->>'variant', '')) order by p->>'id'), '[]'::jsonb)
    into o from jsonb_array_elements(case when jsonb_typeof(ob->'plans') = 'array' then ob->'plans' else '[]'::jsonb end) p
   where jsonb_typeof(p) = 'object' and (coalesce(p->>'link', '') <> '' or coalesce(p->>'variant', '') <> '');
  select coalesce(jsonb_agg(jsonb_build_array(p->>'id', coalesce(p->>'link', ''), coalesce(p->>'variant', '')) order by p->>'id'), '[]'::jsonb)
    into n from jsonb_array_elements(case when jsonb_typeof(new.billing->'plans') = 'array' then new.billing->'plans' else '[]'::jsonb end) p
   where jsonb_typeof(p) = 'object' and (coalesce(p->>'link', '') <> '' or coalesce(p->>'variant', '') <> '');
  if o is distinct from n then
    raise exception 'bad billing: only the owner or a full admin can change checkout links and variant ids' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_config_pay() from public, anon, authenticated;
drop trigger if exists site_config_guard_pay on public.site_config;
create trigger site_config_guard_pay before insert or update on public.site_config
  for each row execute function private.guard_config_pay();
-- the admin panel saves with an upsert (INSERT … ON CONFLICT DO UPDATE), which also needs an INSERT policy: without it
-- a 'settings' role could never save anything ("new row violates row-level security policy"). The table holds one row (id = 1).
drop policy if exists "config: perm settings insert" on public.site_config;
create policy "config: perm settings insert" on public.site_config for insert to authenticated with check (public.has_perm('settings'));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [S-23] Supabase "anonymous sign-ins" (Authentication → Sign In / Providers) create real `authenticated` sessions with no
-- email and no confirmation. If that switch is ever turned on, every anonymous session would get the sign-up gift →
-- unlimited free points by reloading. The gift now needs an email address (the ledger row is still written, with 0).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_signup_credits() returns trigger
language plpgsql security definer set search_path = public as $$
declare bonus integer;
begin
  select greatest(0, coalesce(public.safe_int(billing->>'signup'), 0)) into bonus from public.site_config where id = 1;
  bonus := case when coalesce(btrim(new.email), '') = '' then 0 else coalesce(bonus, 0) end;
  update public.profiles set credits = credits + bonus where id = new.id;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref)
    values (new.id, bonus, new.credits + bonus, 'signup', null);
  return null;
end $$;
revoke execute on function public.handle_signup_credits() from public, anon, authenticated;
-- =====================================================================
-- [security-v3:end]
-- =====================================================================

-- =====================================================================
-- Accounts v4 (this block = supabase/accounts_v4.sql, for a one-time run in the SQL editor)
-- [accounts-v4:begin]
-- =====================================================================
-- Launch checklist 2026-10 (SECURITY-AUDIT.md "v4"): delete my account + admin delete (personal data erased, payment
-- records kept without the account), two-factor authentication (Supabase Auth MFA / TOTP) enforced for management and
-- for the user's own rows, an offensive-word filter for profile text, settings for Turnstile / idle sign-out / minimum
-- age, and the age consent stored with new accounts. Idempotent; keep it after [security-v3].
-- No dynamic SQL is built from user input anywhere below (the only `execute format(...)` loops over constant table names).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [A-1] Two-factor authentication (Supabase Auth MFA). The session's assurance level is the `aal` claim of the JWT
-- ('aal1' = password/code only, 'aal2' = a TOTP code was verified too). A user who HAS a verified factor but whose
-- session is still aal1 (a stolen password) gets no management permission and no access to their own rows ([A-2]).
-- billing.require_mfa_admin = true (owner only) also takes management permissions away from accounts WITHOUT a
-- factor — except the owner, who is never locked out (the admin panel shows a banner instead). If the owner loses the
-- authenticator: Supabase dashboard → Authentication → Users → the user → remove the MFA factor.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.jwt_claims() returns jsonb
language plpgsql stable set search_path = public as $$
declare c jsonb;
begin
  begin c := auth.jwt(); exception when others then c := null; end;
  if c is null then
    begin c := nullif(current_setting('request.jwt.claims', true), '')::jsonb; exception when others then c := null; end;
  end if;
  return case when jsonb_typeof(c) = 'object' then c else '{}'::jsonb end;
end $$;

create or replace function private.jwt_aal() returns text
language sql stable set search_path = public as $$ select coalesce(private.jwt_claims()->>'aal', '') $$;

create or replace function private.mfa_enrolled(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_uid is null or to_regclass('auth.mfa_factors') is null then return false; end if;
  return exists (select 1 from auth.mfa_factors f where f.user_id = p_uid and f.status::text = 'verified');
end $$;

-- may the signed-in account use its management permissions in this session?
create or replace function private.mfa_ok() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); req boolean;
begin
  if uid is null then return false; end if;
  if private.jwt_aal() = 'aal2' then return true; end if;
  if private.mfa_enrolled(uid) then return false; end if;          -- has 2FA, but this session did not pass it
  select coalesce(c.billing->'require_mfa_admin' = 'true'::jsonb, false) into req from public.site_config c where c.id = 1;
  if not coalesce(req, false) then return true; end if;
  return exists (select 1 from public.profiles where id = uid and owner);   -- the owner is never locked out
end $$;

-- row access for the user's own data: true unless the user has 2FA and this session has not passed it
create or replace function public.aal_ok() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or private.jwt_aal() = 'aal2' then return true; end if;
  return not private.mfa_enrolled(auth.uid());
end $$;

-- management checks now include the session's 2FA state (bodies otherwise as in "Owner & roles")
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles pr left join public.roles r on r.id = pr.role
                  where pr.id = auth.uid() and (pr.owner or (not pr.blocked and (pr.role = 'admin' or p = any(coalesce(r.perms, '{}'))))))
         and private.mfa_ok();
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (owner or (role = 'admin' and not blocked)))
         and private.mfa_ok();
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and owner) and private.mfa_ok();
$$;
-- what the signed-in user may do + the 2FA state (the admin panel shows a banner when management is held back)
create or replace function public.my_access() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr public.profiles; perms text[]; ok boolean; req boolean;
begin
  select * into pr from public.profiles where id = auth.uid();
  if not found then return null; end if;
  ok := private.mfa_ok();
  select coalesce(c.billing->'require_mfa_admin' = 'true'::jsonb, false) into req from public.site_config c where c.id = 1;
  perms := case when pr.owner or (pr.role = 'admin' and not pr.blocked) then public.all_perms()
                when pr.blocked then '{}'::text[]
                else coalesce((select r.perms from public.roles r where r.id = pr.role), '{}'::text[]) end;
  return jsonb_build_object('owner', pr.owner, 'role', pr.role,
    'perms', to_jsonb(case when ok then perms else '{}'::text[] end),
    'mfa', jsonb_build_object('enrolled', private.mfa_enrolled(pr.id), 'aal', nullif(private.jwt_aal(), ''),
                              'required', coalesce(req, false), 'ok', ok, 'held', not ok and cardinality(perms) > 0));
end $$;
revoke all on function private.jwt_claims(), private.jwt_aal(), private.mfa_enrolled(uuid), private.mfa_ok()
  from public, anon, authenticated;
revoke execute on function public.aal_ok(), public.my_access() from public, anon;
grant execute on function public.aal_ok(), public.my_access() to authenticated;
revoke execute on function public.has_perm(text), public.is_owner() from public, anon;
grant execute on function public.has_perm(text), public.is_owner() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [A-2] A user with 2FA reaches their own rows (profile, songs, files, ledger, logs) only from an aal2 session.
-- RESTRICTIVE policies: they narrow every other policy; accounts without a factor are not affected.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['profiles','songs','downloads','credit_ledger','activity','charged_songs','assistant_usage'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'mfa: aal2 when enrolled', t);
      execute format('create policy %I on public.%I as restrictive for all to authenticated using ((select public.aal_ok())) with check ((select public.aal_ok()))',
                     'mfa: aal2 when enrolled', t);
    end if;
  end loop;
end $$;
drop policy if exists "mfa: aal2 when enrolled" on storage.objects;
create policy "mfa: aal2 when enrolled" on storage.objects as restrictive for all to authenticated
  using (bucket_id not in ('uploads', 'avatars') or (select public.aal_ok()))
  with check (bucket_id not in ('uploads', 'avatars') or (select public.aal_ok()));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [A-3] New settings in site_config.billing (public, read by the app; admin panel → Settings → Security):
--   turnstile_site_key  ''|'0x…'   Cloudflare Turnstile on sign-up / sign-in / password reset (the SECRET goes in Supabase
--                                  Auth → Bot and Abuse Protection, never here). Owner / full admin only.
--   require_mfa_admin   boolean    management needs 2FA (owner only; the owner keeps working without it)
--   idle_minutes        5…525600   sign out after this long without activity (default 10080 = 7 days)
--   idle_minutes_admin  5…525600   the same for accounts with admin-panel access (default 60)
--   min_age             13…21      the age the sign-up checkbox asks for (default 16; the legal texts say 16)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_config_v4() returns trigger
language plpgsql set search_path = public as $$
declare b jsonb := new.billing; ob jsonb; k text;
begin
  if current_user not in ('anon', 'authenticated') or b is null or jsonb_typeof(b) <> 'object' then return new; end if;
  if b ? 'turnstile_site_key' and (jsonb_typeof(b->'turnstile_site_key') <> 'string'
                                   or b->>'turnstile_site_key' !~ '^([0-9]x[A-Za-z0-9_-]{10,80})?$') then
    raise exception 'bad billing: turnstile_site_key' using errcode = '22023';
  end if;
  if b ? 'require_mfa_admin' and jsonb_typeof(b->'require_mfa_admin') <> 'boolean' then
    raise exception 'bad billing: require_mfa_admin' using errcode = '22023';
  end if;
  if b ? 'idle_minutes' and coalesce(public.safe_int(b->>'idle_minutes'), -1) not between 5 and 525600 then
    raise exception 'bad billing: idle_minutes (5…525600)' using errcode = '22023';
  end if;
  if b ? 'idle_minutes_admin' and coalesce(public.safe_int(b->>'idle_minutes_admin'), -1) not between 5 and 525600 then
    raise exception 'bad billing: idle_minutes_admin (5…525600)' using errcode = '22023';
  end if;
  if b ? 'min_age' and coalesce(public.safe_int(b->>'min_age'), -1) not between 13 and 21 then
    raise exception 'bad billing: min_age (13…21)' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then ob := old.billing; else select c.billing into ob from public.site_config c where c.id = new.id; end if;
  ob := coalesce(ob, '{}'::jsonb);
  if (b->'require_mfa_admin') is distinct from (ob->'require_mfa_admin') and not public.is_owner() then
    raise exception 'bad billing: only the owner can change require_mfa_admin' using errcode = '42501';
  end if;
  foreach k in array array['turnstile_site_key', 'idle_minutes', 'idle_minutes_admin', 'min_age'] loop
    if (b->k) is distinct from (ob->k) and not public.is_admin() then
      raise exception 'bad billing: only the owner or a full admin can change %', k using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.guard_config_v4() from public, anon, authenticated;
drop trigger if exists site_config_guard_v4 on public.site_config;
create trigger site_config_guard_v4 before insert or update on public.site_config
  for each row execute function private.guard_config_v4();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [A-4] Offensive words in text other people see (username, display name, bio). Shared helper for any future free
-- text (reviews…): private.is_offensive(text) in SQL, CR.offensive(text) / window.TEXTGUARD in the browser (same rules,
-- same built-in list: assets/acct.js). Matching works on TOKENS, never on raw substrings (no "Scunthorpe" problem):
--   normalise: lower case, Hebrew niqqud / geresh removed, final letters ךםןףץ → כמנפצ, Arabic diacritics + tatweel removed
--   and أإآٱ→ا ة→ه ى→ي ؤ→و ئ→ي, ё→е, Latin accents removed, leetspeak (0→o 1→i 3→e 4→a 5→s 7→t 8→b 9→g; @ $ ! | + before a
--   letter → a s i i t); tokens = runs of one script's letters (anything else separates); runs of ≥ 3 single letters are
--   joined ("f.u.c.k"); a run of 3+ equal letters counts as 2 ("fuuuck" → "fuuck"), and such a stretched token is also
--   compared with every repeat collapsed when the entry is ≥ 4 letters ("fuck"; but "Niger" never becomes "nigger").
--   modes: word = a whole token · hword = a whole token, also after 1–2 Hebrew prefix letters (ו ה ש ב ל כ; not מ: מזונות) ·
--          prefix = a token that starts with it · part = anywhere in the text with the separators removed (only for
--          entries that are never part of a normal word) · phrase = consecutive tokens (entries with a space).
-- The list lives in private.blocked_words (owner / full admins add or remove words in the admin panel; a removed built-in
-- word stays removed when this block is re-run). Enforced by a trigger on profiles (error 'offensive', detail = the field).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists private.blocked_words (
  word       text primary key check (char_length(word) between 2 and 60),   -- normalised form (see txt_key)
  w1         text not null,                                                  -- with every repeated letter collapsed
  mode       text not null default 'word' check (mode in ('word', 'hword', 'prefix', 'part', 'phrase')),
  lang       text not null default '' check (lang ~ '^[a-z]{0,2}$'),
  seeded     boolean not null default false,
  removed    boolean not null default false,
  created_at timestamptz not null default now()
);
revoke all on private.blocked_words from public, anon, authenticated;

create or replace function private.txt_norm(p text) returns text
language plpgsql immutable set search_path = public as $$
declare s text := left(lower(coalesce(p, '')), 4000);
begin
  s := regexp_replace(s, '[֑-ֽֿ-ׇ׳״]', '', 'g');        -- niqqud, cantillation, geresh
  s := translate(s, 'ךםןףץ', 'כמנפצ');
  s := regexp_replace(s, '[ً-ٰٟـ]', '', 'g');                     -- Arabic harakat, tatweel
  s := translate(s, 'أإآٱةىؤئ', 'ااااهيوي');
  s := translate(s, 'ё', 'е');
  s := translate(s, 'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ', 'aaaaaaeeeeiiiiooooouuuuncyy');
  s := translate(s, '01345789', 'oieastbg');
  s := regexp_replace(s, '@(?=[a-z])', 'a', 'g');
  s := regexp_replace(s, '\$(?=[a-z])', 's', 'g');
  s := regexp_replace(s, '[!|](?=[a-z])', 'i', 'g');
  s := regexp_replace(s, '\+(?=[a-z])', 't', 'g');
  return s;
end $$;
create or replace function private.txt_tokens(p text) returns text[]
language sql immutable set search_path = public as $$
  select coalesce(array_agg(m[1]), '{}'::text[])
    from regexp_matches(private.txt_norm(p), '([a-z]+|[א-ת]+|[ء-ي]+|[а-я]+)', 'g') m;
$$;
create or replace function private.txt_r2(x text) returns text
language sql immutable set search_path = public as $$ select regexp_replace(coalesce(x, ''), '(.)\1{2,}', '\1\1', 'g') $$;
create or replace function private.txt_r1(x text) returns text
language sql immutable set search_path = public as $$ select regexp_replace(coalesce(x, ''), '(.)\1+', '\1', 'g') $$;
-- the stored form of a list entry: its tokens (3+ repeats → 2), joined by one space
create or replace function private.txt_key(p text) returns text
language sql immutable set search_path = public as $$
  select coalesce(string_agg(private.txt_r2(t), ' ' order by o), '') from unnest(private.txt_tokens(p)) with ordinality u(t, o);
$$;

create or replace function private.is_offensive(p text) returns boolean
language plpgsql stable set search_path = public as $$
declare toks text[]; extra text[] := '{}'; run text := ''; runn integer := 0; tk text; c2 text; c1 text; line text;
begin
  if p is null or btrim(p) = '' then return false; end if;
  toks := private.txt_tokens(p);
  if coalesce(array_length(toks, 1), 0) = 0 then return false; end if;
  foreach tk in array toks loop                                   -- "f.u.c.k" / "s h i t" → one more token
    if char_length(tk) = 1 then run := run || tk; runn := runn + 1;
    else
      if runn >= 3 then extra := extra || run; end if;
      run := ''; runn := 0;
    end if;
  end loop;
  if runn >= 3 then extra := extra || run; end if;
  c2 := private.txt_r2(array_to_string(toks || extra, ''));
  c1 := private.txt_r1(c2);
  line := ' ' || (select string_agg(private.txt_r2(t), ' ' order by o) from unnest(toks) with ordinality u(t, o)) || ' ';
  return exists (
    -- s = the token was stretched (a run of 3+ equal letters): only then is it also compared with every repeat collapsed
    with tk as (select private.txt_r2(t) a, private.txt_r1(t) b, private.txt_r2(t) <> t s from unnest(toks || extra) t)
    select 1 from private.blocked_words w
     where not w.removed and (
           (w.mode in ('word', 'hword') and exists (select 1 from tk where tk.a = w.word or (tk.s and char_length(w.w1) >= 4 and tk.b = w.w1)))
        or (w.mode = 'hword' and exists (select 1 from tk, generate_series(1, 2) k
                                          where char_length(tk.a) - k >= 3 and substr(tk.a, 1, k) ~ '^[והשבלכ]+$'
                                            and (substr(tk.a, k + 1) = w.word
                                                 or (tk.s and char_length(w.w1) >= 4 and private.txt_r1(substr(tk.a, k + 1)) = w.w1))))
        or (w.mode = 'prefix' and exists (select 1 from tk where left(tk.a, char_length(w.word)) = w.word
                                                              or (tk.s and char_length(w.w1) >= 4 and left(tk.b, char_length(w.w1)) = w.w1)))
        or (w.mode = 'part' and (position(w.word in c2) > 0 or (w.word = w.w1 and position(w.w1 in c1) > 0)))
        or (w.mode = 'phrase' and position(' ' || w.word || ' ' in line) > 0)));
end $$;

-- add one entry (normalised); 'phrase' when it has more than one token. → the stored key ('' = nothing to store)
create or replace function private.bw_put(p_raw text, p_mode text, p_lang text, p_seeded boolean) returns text
language plpgsql set search_path = public as $$
declare k text := private.txt_key(p_raw); m text := coalesce(nullif(p_mode, ''), 'word');
begin
  if char_length(k) not between 2 and 60 then return ''; end if;
  if position(' ' in k) > 0 then m := 'phrase'; elsif m = 'phrase' then m := 'word'; end if;
  if m not in ('word', 'hword', 'prefix', 'part', 'phrase') then m := 'word'; end if;
  if p_seeded then
    insert into private.blocked_words (word, w1, mode, lang, seeded) values (k, private.txt_r1(k), m, coalesce(p_lang, ''), true)
      on conflict (word) do nothing;                          -- an admin's removal / mode change is kept
  else
    insert into private.blocked_words (word, w1, mode, lang, seeded, removed) values (k, private.txt_r1(k), m, coalesce(p_lang, ''), false, false)
      on conflict (word) do update set mode = excluded.mode, removed = false;
  end if;
  return k;
end $$;

-- the built-in list (the same entries as BASE in assets/acct.js; tools/tests check both)
do $$ declare e text[]; begin
  foreach e slice 1 in array array[
    -- English
    ['shit','word','en'],['shits','word','en'],['shitty','word','en'],['shithead','word','en'],['bullshit','word','en'],
    ['bitch','word','en'],['bitches','word','en'],['bastard','word','en'],['bastards','word','en'],['asshole','word','en'],
    ['assholes','word','en'],['cunt','word','en'],['cunts','word','en'],['twat','word','en'],['wanker','word','en'],
    ['whore','word','en'],['whores','word','en'],['slut','word','en'],['sluts','word','en'],['fag','word','en'],
    ['fags','word','en'],['faggot','word','en'],['faggots','word','en'],['retard','word','en'],['retards','word','en'],
    ['retarded','word','en'],['kike','word','en'],['kikes','word','en'],['spic','word','en'],['spics','word','en'],
    ['chink','word','en'],['chinks','word','en'],['gook','word','en'],['wetback','word','en'],['tranny','word','en'],
    ['dickhead','word','en'],['kys','word','en'],['rapist','word','en'],['nigger','word','en'],['niggers','word','en'],
    ['nigga','word','en'],['niggas','word','en'],['niggaz','word','en'],['fuck','part','en'],
    ['kill yourself','phrase','en'],['heil hitler','phrase','en'],['sieg heil','phrase','en'],['white power','phrase','en'],
    -- Hebrew (+ common Latin transliterations)
    ['זונה','hword','he'],['זונות','hword','he'],['שרמוטה','hword','he'],['שרמוטות','hword','he'],['שרמוט','hword','he'],
    ['הזדיין','hword','he'],['תזדיין','hword','he'],['תזדייני','hword','he'],['תזדיינו','hword','he'],['מזדיין','hword','he'],
    ['מזדיינת','hword','he'],['מזדיינים','hword','he'],['זיון','word','he'],['זין','word','he'],['כוסאמק','word','he'],
    ['כוסעמק','word','he'],['כוסומו','word','he'],['כוס אמק','phrase','he'],['כוס עמק','phrase','he'],
    ['כוס אמא שלך','phrase','he'],['ערבוש','hword','he'],['ערבושים','hword','he'],['כושי','hword','he'],['כושים','hword','he'],
    ['כושית','hword','he'],['קוקסינל','hword','he'],['מניאק','hword','he'],['מניאקים','hword','he'],['חרא','hword','he'],
    ['מוות לערבים','phrase','he'],['מוות ליהודים','phrase','he'],
    ['sharmuta','word','he'],['sharmouta','word','he'],['sharmota','word','he'],['kusemek','word','he'],['kusemak','word','he'],
    ['kusomo','word','he'],['manyak','word','he'],['ben zona','phrase','he'],['kus emak','phrase','he'],
    -- Arabic
    ['شرموطه','word','ar'],['شرموط','word','ar'],['شراميط','word','ar'],['قحبه','word','ar'],['قحاب','word','ar'],
    ['عاهره','word','ar'],['منيوك','word','ar'],['منيك','word','ar'],['متناك','word','ar'],['كسمك','word','ar'],
    ['كس','word','ar'],['زب','word','ar'],['خول','word','ar'],['كس امك','phrase','ar'],['ابن الكلب','phrase','ar'],
    ['ابن القحبه','phrase','ar'],
    -- Russian
    ['пизд','prefix','ru'],['хуй','prefix','ru'],['хуе','prefix','ru'],['хуя','prefix','ru'],['бляд','prefix','ru'],
    ['блят','prefix','ru'],['бля','word','ru'],['ебан','prefix','ru'],['ебат','prefix','ru'],['ебал','prefix','ru'],
    ['ебл','prefix','ru'],['ебу','prefix','ru'],['нахуй','word','ru'],['похуй','word','ru'],['охуеть','word','ru'],
    ['охуел','word','ru'],['заебал','word','ru'],['заебись','word','ru'],['отъебись','word','ru'],['мудак','prefix','ru'],
    ['мудил','prefix','ru'],['пидор','prefix','ru'],['пидар','prefix','ru'],['шлюх','prefix','ru'],['залуп','prefix','ru'],
    ['гандон','prefix','ru'],['сука','word','ru'],['суки','word','ru'],['сучка','word','ru'],
    -- Spanish
    ['puta','word','es'],['putas','word','es'],['puto','word','es'],['putos','word','es'],['mierda','word','es'],
    ['cabron','word','es'],['cabrona','word','es'],['cabrones','word','es'],['pendejo','word','es'],['pendeja','word','es'],
    ['pendejos','word','es'],['gilipollas','word','es'],['maricon','word','es'],['maricones','word','es'],['joder','word','es'],
    ['culero','word','es'],['verga','word','es'],['chinga','word','es'],['chingada','word','es'],['chingado','word','es'],
    ['chingar','word','es'],['chingate','word','es']
  ] loop
    perform private.bw_put(e[1], e[2], e[3], true);
  end loop;
end $$;

-- for the browser: may this text be shown to others? (signed-in users; sign-up uses username_available below)
create or replace function public.text_ok(p_text text) returns boolean
language sql stable security definer set search_path = public as $$
  select not private.is_offensive(left(coalesce(p_text, ''), 2000));
$$;
revoke execute on function public.text_ok(text) from public, anon;
grant execute on function public.text_ok(text) to authenticated;
-- sign-up: an offensive username is "not available" (anon may call this one already)
create or replace function public.username_available(u text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(u)) and not private.is_offensive(u);
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- admin panel: the list (owner / full admin)
create or replace function public.admin_blocked_words() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('word', word, 'mode', mode, 'lang', lang, 'seeded', seeded) order by lang, word)
                     from private.blocked_words where not removed), '[]'::jsonb);
end $$;
-- add (p_on = true) or remove (false) one entry → {ok, word} | {ok:false, why:'bad'}
create or replace function public.admin_blocked_word_set(p_word text, p_mode text default 'word', p_on boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if p_word is null or char_length(p_word) > 80 or (p_on and coalesce(p_mode, 'word') not in ('word', 'hword', 'prefix', 'part', 'phrase')) then
    return jsonb_build_object('ok', false, 'why', 'bad');
  end if;
  k := private.txt_key(p_word);
  if char_length(k) not between 2 and 60 then return jsonb_build_object('ok', false, 'why', 'bad'); end if;
  if p_on then
    perform private.bw_put(p_word, p_mode, '', false);
  else
    update private.blocked_words set removed = true where word = k;
  end if;
  insert into public.activity (user_id, action, detail)
    values (auth.uid(), 'adm_words', left(case when p_on then '+ ' else '- ' end || k, 300));
  return jsonb_build_object('ok', true, 'word', k);
end $$;
revoke all on function private.txt_norm(text), private.txt_tokens(text), private.txt_r2(text), private.txt_r1(text),
  private.txt_key(text), private.is_offensive(text), private.bw_put(text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.admin_blocked_words(), public.admin_blocked_word_set(text, text, boolean) from public, anon;
grant execute on function public.admin_blocked_words(), public.admin_blocked_word_set(text, text, boolean) to authenticated;

-- profiles: username / display name / bio checked on every insert and change (also for writes by the API roles'
-- definer functions; the SQL editor too) → error 'offensive' with the field name in the detail
create or replace function private.guard_profile_text() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.username is not null and (tg_op = 'INSERT' or new.username is distinct from old.username) and private.is_offensive(new.username) then
    raise exception 'offensive' using errcode = '22023', detail = 'username';
  end if;
  if coalesce(new.display_name, '') <> '' and (tg_op = 'INSERT' or new.display_name is distinct from old.display_name)
     and private.is_offensive(new.display_name) then
    raise exception 'offensive' using errcode = '22023', detail = 'display_name';
  end if;
  if coalesce(new.bio, '') <> '' and (tg_op = 'INSERT' or new.bio is distinct from old.bio) and private.is_offensive(new.bio) then
    raise exception 'offensive' using errcode = '22023', detail = 'bio';
  end if;
  return new;
end $$;
revoke all on function private.guard_profile_text() from public, anon, authenticated;
drop trigger if exists profiles_text_guard on public.profiles;
create trigger profiles_text_guard before insert or update of username, display_name, bio on public.profiles
  for each row execute function private.guard_profile_text();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [A-5] Age consent: the sign-up form sends options.data.age_ok / age_at / age_min (the checkbox "I am N or older",
-- N = billing.min_age, default 16). Copied once into profiles.age_confirmed_at / age_min (not writable by the browser).
-- handle_new_user = the "Terms consent" version + the age + an offensive username dropped (the account is created
-- without a username instead of failing).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists age_confirmed_at timestamptz;
alter table public.profiles add column if not exists age_min smallint;
alter table public.profiles drop constraint if exists profiles_age_min_check;
alter table public.profiles add constraint profiles_age_min_check check (age_min is null or age_min between 13 and 21);
revoke update (age_confirmed_at, age_min) on public.profiles from authenticated, anon, public;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  wanted text := nullif(new.raw_user_meta_data->>'username', '');
  first_user boolean := not exists (select 1 from public.profiles);
  tv text := nullif(left(coalesce(new.raw_user_meta_data->>'terms_version', ''), 10), '');
  ta timestamptz; aa timestamptz; am smallint;
begin
  if wanted is not null and (wanted !~ '^[A-Za-z0-9_.-]{3,24}$' or exists (select 1 from public.profiles where lower(username) = lower(wanted))
                             or private.is_offensive(wanted)) then
    wanted := null;
  end if;
  if tv is not null and tv !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then tv := null; end if;
  if tv is not null then
    begin ta := (new.raw_user_meta_data->>'terms_at')::timestamptz; exception when others then ta := null; end;
    -- the client clock is not trusted: outside a small window around the sign-up, use the server time
    if ta is null or ta > now() + interval '10 minutes' or ta < now() - interval '1 day' then ta := now(); end if;
  end if;
  if lower(coalesce(new.raw_user_meta_data->>'age_ok', '')) = 'true' then
    begin aa := (new.raw_user_meta_data->>'age_at')::timestamptz; exception when others then aa := null; end;
    if aa is null or aa > now() + interval '10 minutes' or aa < now() - interval '1 day' then aa := now(); end if;
    am := case when coalesce(new.raw_user_meta_data->>'age_min', '') ~ '^\d{2}$'
                    and (new.raw_user_meta_data->>'age_min')::int between 13 and 21
               then (new.raw_user_meta_data->>'age_min')::smallint else 16 end;
  end if;
  insert into public.profiles (id, username, email, display_name, role, owner, terms_version, terms_at, age_confirmed_at, age_min)
  values (new.id, wanted, new.email, coalesce(wanted, ''), case when first_user then 'admin' else 'user' end, first_user, tv, ta, aa, am);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [A-6] Deleting an account (account panel → "Delete account"; admin panel → user → "Delete user").
-- The browser first removes the user's files through the Storage API (Supabase refuses direct SQL deletes on
-- storage.objects): uploads/<uid>/* and avatars/<uid>/*. Then delete_my_account / admin_delete_user check everything and
-- delete the auth.users row; a BEFORE DELETE trigger on auth.users (also for deletes from the Supabase dashboard) does the
-- rest in the same transaction:
--   * deleted by the foreign keys (ON DELETE CASCADE): profile, My Songs, download log, activity log, points ledger rows
--     that are not payments, charged_songs, assistant usage, 2FA factors and sessions (Supabase Auth);
--   * anonymised: payment ledger rows (reason 'payment') and payment webhook events are KEPT for accounting/tax (7 years),
--     with user_id = null and subject_hash = sha256(secret salt : uid) instead (the buyer's name/email/card brand/last 4
--     are cut out of the stored webhook payloads); Discover catalog rows the user analysed lose analyzed_by/full_by;
--     the user's id in other users' ledger refs (referrals) and in admin audit details is replaced by "x<hash12>";
--   * private.catalog_play_log rows of the user are deleted;
--   * one row in public.account_deletions: when, how (self/admin/dashboard), subject_hash, acting admin — nothing else.
-- Refused: the OWNER (hand ownership over first), a live subscription (active / on_trial / past_due / paused: cancel it
-- in the Lemon Squeezy portal first), a wrong confirmation, a session that did not sign in again in the last 15 minutes
-- (password or e-mail code: JWT amr), a 2FA account whose session is not aal2, and files still in storage.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.credit_ledger alter column user_id drop not null;
alter table public.credit_ledger add column if not exists subject_hash text;
alter table public.pay_events add column if not exists subject_hash text;
insert into private.settings (key, value) values ('account_hash_salt', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

create table if not exists public.account_deletions (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  how          text not null check (how in ('self', 'admin', 'dashboard')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  actor        uuid references auth.users(id) on delete set null,
  had_payments boolean not null default false
);
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from public, anon, authenticated;
grant select on public.account_deletions to authenticated;
revoke all on sequence public.account_deletions_id_seq from public, anon, authenticated;
drop policy if exists "account_deletions: perm activity" on public.account_deletions;
create policy "account_deletions: perm activity" on public.account_deletions for select to authenticated using (public.has_perm('activity'));

create or replace function private.subject_hash(p_uid uuid) returns text
language sql stable set search_path = public, extensions as $$
  select encode(extensions.digest(convert_to(coalesce((select value from private.settings where key = 'account_hash_salt'), '')
                                             || ':' || p_uid::text, 'UTF8'), 'sha256'), 'hex');
$$;

create or replace function private.forget_user(p_uid uuid, p_how text, p_actor uuid) returns text
language plpgsql security definer set search_path = public as $$
declare h text := private.subject_hash(p_uid); x text := 'x' || left(private.subject_hash(p_uid), 12); paid boolean;
begin
  paid := exists (select 1 from public.credit_ledger where user_id = p_uid and reason = 'payment');
  update public.credit_ledger set user_id = null, subject_hash = h where user_id = p_uid and reason = 'payment';
  update public.pay_events
     set user_id = null, subject_hash = h,
         payload = case when jsonb_typeof(payload) = 'object' then payload
                     #- '{data,attributes,user_name}' #- '{data,attributes,user_email}' #- '{data,attributes,customer_email}'
                     #- '{data,attributes,card_brand}' #- '{data,attributes,card_last_four}'
                     #- '{data,attributes,first_order_item,user_email}' #- '{meta,custom_data,user_id}' #- '{meta,custom_data,email}'
                   else payload end
   where user_id = p_uid or payload->'meta'->'custom_data'->>'user_id' = p_uid::text;
  update public.credit_ledger set ref = replace(ref, p_uid::text, x)
   where ref like '%' || p_uid::text || '%' and user_id is distinct from p_uid;
  update public.activity set detail = replace(detail, p_uid::text, x)
   where detail like '%' || p_uid::text || '%' and user_id <> p_uid;
  delete from private.catalog_play_log where who = p_uid::text;
  insert into public.account_deletions (how, subject_hash, actor, had_payments)
    values (case when p_how in ('self', 'admin') then p_how else 'dashboard' end, h,
            case when p_actor is not null and p_actor <> p_uid and exists (select 1 from auth.users where id = p_actor) then p_actor end, paid);
  return h;
end $$;

create or replace function private.on_auth_user_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare how text := nullif(current_setting('chordroom.delete_how', true), ''); actor text := nullif(current_setting('chordroom.delete_actor', true), '');
begin
  perform private.forget_user(old.id, coalesce(how, 'dashboard'),
                              case when actor ~ '^[0-9a-f-]{36}$' then actor::uuid end);
  return old;
end $$;
drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted before delete on auth.users
  for each row execute function private.on_auth_user_delete();

-- the typed confirmation: the username, or "DELETE" in one of the site's languages
create or replace function private.confirm_ok(p text, p_username text) returns boolean
language sql immutable set search_path = public as $$
  select lower(btrim(coalesce(p, ''))) in ('delete', 'מחק', 'حذف', 'удалить', 'eliminar')
      or (coalesce(p_username, '') <> '' and lower(btrim(coalesce(p, ''))) = lower(p_username));
$$;
-- signed in again (password / e-mail code / recovery) in the last p_sec seconds — from the JWT's amr claim
create or replace function private.recent_auth(p_sec integer) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(private.jwt_claims()->'amr') = 'array'
                                                         then private.jwt_claims()->'amr' else '[]'::jsonb end) e
                  where e->>'method' in ('password', 'otp', 'magiclink', 'recovery', 'email/signup', 'email_change', 'invite')
                    and coalesce(e->>'timestamp', '') ~ '^\d{1,12}$'
                    and (e->>'timestamp')::bigint >= extract(epoch from now())::bigint - p_sec);
$$;
create or replace function private.files_left(p_uid uuid) returns integer
language sql stable set search_path = public, storage as $$
  select count(*)::int from storage.objects where bucket_id in ('uploads', 'avatars') and (storage.foldername(name))[1] = p_uid::text;
$$;
create or replace function private.sub_live(me public.profiles) returns boolean
language sql stable set search_path = public as $$
  select me.pay_sub_id is not null and coalesce(me.pay_status, '') in ('active', 'on_trial', 'past_due', 'paused');
$$;

-- → {ok:true} | {ok:false, why: not_found|owner|subscription|confirm|reauth|mfa|files_left (+n)}
create or replace function public.delete_my_account(p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.profiles; n integer;
begin
  if uid is null then raise exception 'not allowed'; end if;
  select * into me from public.profiles where id = uid for update;
  if not found then return jsonb_build_object('ok', false, 'why', 'not_found'); end if;
  if me.owner then return jsonb_build_object('ok', false, 'why', 'owner'); end if;
  if private.sub_live(me) then return jsonb_build_object('ok', false, 'why', 'subscription'); end if;
  if not private.confirm_ok(p_confirm, me.username) then return jsonb_build_object('ok', false, 'why', 'confirm'); end if;
  if not private.recent_auth(900) then return jsonb_build_object('ok', false, 'why', 'reauth'); end if;
  if private.mfa_enrolled(uid) and private.jwt_aal() <> 'aal2' then return jsonb_build_object('ok', false, 'why', 'mfa'); end if;
  n := private.files_left(uid);
  if n > 0 then return jsonb_build_object('ok', false, 'why', 'files_left', 'n', n); end if;
  perform set_config('chordroom.delete_how', 'self', true);
  perform set_config('chordroom.delete_actor', '', true);
  delete from auth.users where id = uid;
  return jsonb_build_object('ok', true);
end $$;

-- owner / full admin deletes another account (never the owner; only the owner deletes staff accounts)
-- → {ok:true} | {ok:false, why: self|not_found|owner|staff|subscription|confirm|files_left (+n)}
create or replace function public.admin_delete_user(target uuid, p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.profiles; n integer;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  if target is null or target = auth.uid() then return jsonb_build_object('ok', false, 'why', 'self'); end if;
  select * into t from public.profiles where id = target for update;
  if not found then return jsonb_build_object('ok', false, 'why', 'not_found'); end if;
  if t.owner then return jsonb_build_object('ok', false, 'why', 'owner'); end if;
  if t.role <> 'user' and not public.is_owner() then return jsonb_build_object('ok', false, 'why', 'staff'); end if;
  if private.sub_live(t) then return jsonb_build_object('ok', false, 'why', 'subscription'); end if;
  if not private.confirm_ok(p_confirm, t.username) then return jsonb_build_object('ok', false, 'why', 'confirm'); end if;
  n := private.files_left(target);
  if n > 0 then return jsonb_build_object('ok', false, 'why', 'files_left', 'n', n); end if;
  perform set_config('chordroom.delete_how', 'admin', true);
  perform set_config('chordroom.delete_actor', auth.uid()::text, true);
  delete from auth.users where id = target;
  insert into public.activity (user_id, action, detail)
    values (auth.uid(), 'adm_delete_user', left('by ' || auth.uid()::text || ': x' || left(private.subject_hash(target), 12), 300));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function private.subject_hash(uuid), private.forget_user(uuid, text, uuid), private.on_auth_user_delete(),
  private.confirm_ok(text, text), private.recent_auth(integer), private.files_left(uuid), private.sub_live(public.profiles)
  from public, anon, authenticated;
revoke execute on function public.delete_my_account(text), public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.delete_my_account(text), public.admin_delete_user(uuid, text) to authenticated;

-- the owner / full admins clear another account's avatar folder before deleting it (uploads: already allowed)
drop policy if exists "avatars: admin read" on storage.objects;
create policy "avatars: admin read" on storage.objects for select to authenticated using (bucket_id = 'avatars' and public.is_admin());
drop policy if exists "avatars: admin delete" on storage.objects;
create policy "avatars: admin delete" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and public.is_admin());
-- =====================================================================
-- [accounts-v4:end]
-- =====================================================================

-- =====================================================================
-- Growth v4 (this block = supabase/growth_v4.sql, for a one-time run in the SQL editor)
-- [growth-v4:begin]
-- =====================================================================
-- Launch checklist 2026-10: analytics ids (GA4 / Microsoft Clarity — the browser loads them ONLY after cookie consent),
-- the Google Search Console verification token, A/B experiments (assets/ab.js) + an admin results RPC, and real user
-- reviews (assets/reviews.js) with moderation. Idempotent; keep it after the security blocks.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [G-1] site_config.analytics = {ga4:'G-XXXX', clarity:'abcdefghij', gsc:'<google-site-verification token>'} and
-- site_config.experiments = [{id, on, variants[2..4], conversion, note}]. Everyone reads them (the page needs them).
-- ANALYTICS ids can be changed only by the owner or a full admin: a 'settings' role pointing Clarity at its own
-- project would receive the session recordings of every visitor. Experiments: anyone with the 'settings' permission.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.site_config add column if not exists analytics jsonb not null default '{}'::jsonb;
alter table public.site_config add column if not exists experiments jsonb not null default '[]'::jsonb;

create or replace function private.guard_growth() returns trigger
language plpgsql set search_path = public as $$
declare oa jsonb; oe jsonb; k text; e jsonb; ids text[] := '{}'; vs text[]; v text;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    -- an upsert fires the INSERT trigger first; its ON CONFLICT update then fires the UPDATE trigger with the real change
    if exists (select 1 from public.site_config c where c.id = new.id) then return new; end if;
    oa := '{}'::jsonb; oe := '[]'::jsonb;
  else
    oa := old.analytics; oe := old.experiments;
  end if;
  if new.analytics is distinct from oa then
    if not public.is_admin() then
      raise exception 'bad analytics: only the owner or a full admin can change analytics ids' using errcode = '42501';
    end if;
    if new.analytics is null or jsonb_typeof(new.analytics) <> 'object' then raise exception 'bad analytics' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(new.analytics) loop
      if k not in ('ga4', 'clarity', 'meta', 'gsc') then raise exception 'bad analytics: unknown key %', k using errcode = '22023'; end if;
      if jsonb_typeof(new.analytics->k) <> 'string' then raise exception 'bad analytics: %', k using errcode = '22023'; end if;
    end loop;
    if coalesce(new.analytics->>'ga4', '') !~ '^(G-[A-Z0-9]{4,16})?$' then raise exception 'bad analytics: ga4 (G-XXXXXXXXXX)' using errcode = '22023'; end if;
    if coalesce(new.analytics->>'clarity', '') !~ '^([a-z0-9]{6,16})?$' then raise exception 'bad analytics: clarity (project id)' using errcode = '22023'; end if;
    if coalesce(new.analytics->>'gsc', '') !~ '^([A-Za-z0-9_-]{10,100})?$' then raise exception 'bad analytics: gsc (verification token)' using errcode = '22023'; end if;
    if coalesce(new.analytics->>'meta', '') !~ '^([0-9]{10,20})?$' then raise exception 'bad analytics: meta (Meta Pixel dataset id)' using errcode = '22023'; end if;
  end if;
  if new.experiments is distinct from oe then
    if new.experiments is null or jsonb_typeof(new.experiments) <> 'array' or jsonb_array_length(new.experiments) > 10 then
      raise exception 'bad experiments' using errcode = '22023';
    end if;
    for e in select * from jsonb_array_elements(new.experiments) loop
      if jsonb_typeof(e) <> 'object' then raise exception 'bad experiments: item' using errcode = '22023'; end if;
      for k in select jsonb_object_keys(e) loop
        if k not in ('id', 'on', 'variants', 'conversion', 'note') then raise exception 'bad experiments: unknown key %', k using errcode = '22023'; end if;
      end loop;
      if coalesce(e->>'id', '') !~ '^[a-z][a-z0-9_]{1,31}$' or (e->>'id') = any(ids) then raise exception 'bad experiments: id' using errcode = '22023'; end if;
      ids := ids || (e->>'id');
      if e ? 'on' and jsonb_typeof(e->'on') <> 'boolean' then raise exception 'bad experiments: on' using errcode = '22023'; end if;
      if jsonb_typeof(e->'variants') is distinct from 'array' or jsonb_array_length(e->'variants') not between 2 and 4 then
        raise exception 'bad experiments: variants (2-4)' using errcode = '22023';
      end if;
      vs := '{}';
      for v in select jsonb_array_elements_text(e->'variants') loop
        if v !~ '^[a-z0-9_]{1,16}$' or v = any(vs) then raise exception 'bad experiments: variant name' using errcode = '22023'; end if;
        vs := vs || v;
      end loop;
      if coalesce(e->>'conversion', '') !~ '^([a-z_]{2,40})?$' then raise exception 'bad experiments: conversion (an activity action)' using errcode = '22023'; end if;
      if char_length(coalesce(e->>'note', '')) > 120 or coalesce(e->>'note', '') ~ '[<>]' then raise exception 'bad experiments: note' using errcode = '22023'; end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function private.guard_growth() from public, anon, authenticated;
drop trigger if exists site_config_guard_growth on public.site_config;
create trigger site_config_guard_growth before insert or update on public.site_config
  for each row execute function private.guard_growth();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [G-2] A/B results (admin panel → Growth). assets/ab.js logs one activity row 'ab_assign' = '<experiment>:<variant>'
-- per signed-in member; a conversion = a later activity row with the experiment's conversion action.
-- Only for the 'activity' permission (the same people who can read the log itself).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create index if not exists activity_action_idx on public.activity (action, created_at desc);

create or replace function public.ab_results(p_exp text, p_conversion text default null, p_days integer default 90) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare conv text; days integer := greatest(1, least(365, coalesce(p_days, 90))); out jsonb;
begin
  if not public.has_perm('activity') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_exp is null or p_exp !~ '^[a-z][a-z0-9_]{1,31}$' then raise exception 'bad experiment' using errcode = '22023'; end if;
  conv := nullif(btrim(coalesce(p_conversion, '')), '');
  if conv is null then
    select nullif(e->>'conversion', '') into conv from public.site_config c, jsonb_array_elements(c.experiments) e
     where c.id = 1 and e->>'id' = p_exp limit 1;
  end if;
  if conv is not null and conv !~ '^[a-z_]{2,40}$' then raise exception 'bad conversion' using errcode = '22023'; end if;
  with a as (
    select distinct on (user_id) user_id, split_part(detail, ':', 2) as variant, created_at
      from public.activity
     where action = 'ab_assign' and split_part(detail, ':', 1) = p_exp and created_at > now() - make_interval(days => days)
     order by user_id, created_at
  ), r as (
    select a.variant, count(*) as assigned,
           count(*) filter (where conv is not null and exists (select 1 from public.activity x
                              where x.user_id = a.user_id and x.action = conv and x.created_at >= a.created_at)) as converted
      from a group by a.variant
  )
  select coalesce(jsonb_agg(jsonb_build_object('variant', variant, 'assigned', assigned, 'converted', converted,
                                               'rate', case when assigned > 0 then round(converted::numeric * 100 / assigned, 1) else 0 end)
                            order by variant), '[]'::jsonb)
    into out from r;
  return jsonb_build_object('experiment', p_exp, 'conversion', conv, 'days', days, 'variants', out);
end $$;
revoke execute on function public.ab_results(text, text, integer) from public, anon;
grant execute on function public.ab_results(text, text, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [G-3] Reviews: REAL members only (signed in, confirmed email, at least one export / separation / conversion or a
-- logged download), one per account, ≤ 400 characters, no links, offensive-word filter, ≤ 5 saves a day. Every save
-- goes back to 'pending'; only approved reviews are public, through reviews_public() (display name only when the member
-- opted in, otherwise initials; never ids or emails). Moderation (approve / hide / feature) = the 'catalog' permission.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id           bigserial primary key,
  user_id      uuid not null unique references auth.users(id) on delete cascade,
  rating       smallint not null check (rating between 1 and 5),
  body         text not null default '' check (char_length(body) <= 400),
  show_name    boolean not null default false,
  lang         text check (lang is null or lang ~ '^[a-z]{2}$'),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  featured     boolean not null default false,
  edits        smallint not null default 0,
  edit_day     date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid
);
create index if not exists reviews_status_idx on public.reviews (status, featured desc, created_at desc);
alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated, public;
grant select on public.reviews to authenticated;
revoke all on sequence public.reviews_id_seq from anon, authenticated, public;
drop policy if exists "reviews: own read" on public.reviews;
create policy "reviews: own read" on public.reviews for select to authenticated using (user_id = auth.uid());

-- minimal offensive-word check. TO BE REPLACED by private.is_offensive(text) from the account-safety work (agent A):
-- review_submit uses that function automatically as soon as it exists.
create or replace function private.growth_offensive(t text) returns boolean
language sql immutable set search_path = public as $$
  select lower(coalesce(t, '')) ~ ('(^|[[:space:][:punct:]])(' ||
    'fuck|fucking|fucker|motherfucker|shit|bitch|cunt|asshole|dickhead|nigger|nigga|faggot|retard|whore|slut|' ||
    'זונה|שרמוטה|מניאק|כוסאמק|כוס אמק|כוסעמק|בן זונה|מזדיין|' ||
    'شرموطة|منيوك|كس امك|عرص|' ||
    'хуй|пизда|блядь|бляд|сука|ебать|пидор|' ||
    'puta|mierda|pendejo|cabrón|cabron|gilipollas|maricón|maricon' ||
    ')($|[[:space:][:punct:]])');
$$;
revoke all on function private.growth_offensive(text) from public, anon, authenticated;

create or replace function public.review_submit(p_rating integer, p_body text, p_show_name boolean default false, p_lang text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); txt text; bad boolean := false; r public.reviews;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  if exists (select 1 from public.profiles where id = uid and blocked) then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;
  if not exists (select 1 from auth.users where id = uid and email_confirmed_at is not null and coalesce(btrim(email), '') <> '') then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
  -- "after using the site": at least one export / separation / conversion, or a logged download
  if not exists (select 1 from public.activity where user_id = uid and action in ('export', 'separate', 'mashup_export', 'extended_export', 'crate_export', 'convert'))
     and not exists (select 1 from public.downloads where user_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then return jsonb_build_object('ok', false, 'error', 'bad_rating'); end if;
  txt := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]+', ' ', 'g'));
  if char_length(txt) > 400 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if txt ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|co|il|ru|me|ly)(/|[[:space:]]|$))' then return jsonb_build_object('ok', false, 'error', 'links'); end if;
  if to_regprocedure('private.is_offensive(text)') is not null then
    execute 'select private.is_offensive($1)' into bad using txt;
  else
    bad := private.growth_offensive(txt);
  end if;
  if coalesce(bad, false) then return jsonb_build_object('ok', false, 'error', 'offensive'); end if;
  select * into r from public.reviews where user_id = uid;
  if found and r.edit_day = current_date and r.edits >= 5 then return jsonb_build_object('ok', false, 'error', 'rate'); end if;
  insert into public.reviews (user_id, rating, body, show_name, lang, status, featured, edits, edit_day)
    values (uid, p_rating, txt, coalesce(p_show_name, false), case when p_lang ~ '^(he|en|ar|ru|es)$' then p_lang end, 'pending', false, 1, current_date)
  on conflict (user_id) do update
    set rating = excluded.rating, body = excluded.body, show_name = excluded.show_name, lang = excluded.lang,
        status = 'pending', featured = false, moderated_at = null, moderated_by = null, updated_at = now(),
        edits = case when public.reviews.edit_day = current_date then public.reviews.edits + 1 else 1 end, edit_day = current_date;
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;
revoke execute on function public.review_submit(integer, text, boolean, text) from public, anon;
grant execute on function public.review_submit(integer, text, boolean, text) to authenticated;

create or replace function public.review_delete() returns void
language sql security definer set search_path = public as $$
  delete from public.reviews where user_id = auth.uid();
$$;
revoke execute on function public.review_delete() from public, anon;
grant execute on function public.review_delete() to authenticated;

-- the public list (home page): approved only, featured first; name = display name if the member opted in, else initials
create or replace function public.reviews_public(p_limit integer default 12) returns jsonb
language sql stable security definer set search_path = public as $$
  with ok as (
    select r.*, p.display_name, p.username from public.reviews r join public.profiles p on p.id = r.user_id
     where r.status = 'approved' and not coalesce(p.blocked, false)
  )
  select jsonb_build_object(
    'count', (select count(*) from ok),
    'avg', (select coalesce(round(avg(rating)::numeric, 2), 0) from ok),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'name', case when x.show_name then left(coalesce(nullif(btrim(x.display_name), ''), x.username, ''), 40)
                     else upper(left(coalesce(nullif(btrim(x.display_name), ''), x.username, '?'), 1)) || '.' end,
        'rating', x.rating, 'body', x.body, 'featured', x.featured, 'lang', x.lang, 'created_at', x.created_at)
        order by x.featured desc, x.created_at desc)
      from (select * from ok order by featured desc, created_at desc limit greatest(1, least(50, coalesce(p_limit, 12)))) x), '[]'::jsonb));
$$;
revoke execute on function public.reviews_public(integer) from public;
grant execute on function public.reviews_public(integer) to anon, authenticated;

create or replace function public.admin_reviews(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.has_perm('catalog') then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'rating', r.rating, 'body', r.body, 'show_name', r.show_name, 'lang', r.lang,
           'status', r.status, 'featured', r.featured, 'created_at', r.created_at, 'updated_at', r.updated_at,
           'username', p.username, 'display_name', p.display_name)
           order by (r.status = 'pending') desc, r.updated_at desc), '[]'::jsonb)
    into out
    from (select * from public.reviews where p_status is null or status = p_status order by updated_at desc limit 500) r
    join public.profiles p on p.id = r.user_id;
  return out;
end $$;
revoke execute on function public.admin_reviews(text) from public, anon;
grant execute on function public.admin_reviews(text) to authenticated;

create or replace function public.admin_review_set(p_id bigint, p_status text, p_featured boolean default false) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('catalog') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_status is null or p_status not in ('pending', 'approved', 'hidden') then raise exception 'bad status' using errcode = '22023'; end if;
  update public.reviews set status = p_status, featured = (p_status = 'approved' and coalesce(p_featured, false)),
         moderated_at = now(), moderated_by = auth.uid()
   where id = p_id;
  if not found then return 'missing'; end if;
  return 'ok';
end $$;
revoke execute on function public.admin_review_set(bigint, text, boolean) from public, anon;
grant execute on function public.admin_review_set(bigint, text, boolean) to authenticated;
-- =====================================================================
-- [growth-v4:end]
-- =====================================================================

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

-- =====================================================================
-- Security v5 (this block = the LAST block of supabase/schema.sql, for a one-time run in the SQL editor)
-- [security-v5:begin]
-- =====================================================================
-- Server audit 2026-10, round 5. Run it ONCE in the Supabase SQL editor on top of everything already installed
-- (schema.sql incl. points v2, security v3, accounts v4, growth v4, paypal, and assistant.sql). Idempotent: safe to
-- run again. It redefines functions from earlier blocks, so it must stay LAST: re-run this file after re-running
-- schema.sql's earlier blocks, points_v2.sql, accounts_v4.sql, growth_v4.sql or assistant.sql.
--
-- PREREQUISITE for [V5-8]: the deployed assets/backend.js must read the catalog with an explicit column list
-- (catalogGet / catalogList without select('*')). Deploy that first, otherwise Discover stops loading.
--
-- [V5-1] Batch / export refunds (refund_credits_n) gave points back for work the user had already received: any
--        own charge ≤ 3 h, 20 calls / 1000 units a day, and a call that refunded 0 points did not count. Now:
--        single exports ('mashup', 'extended') = the whole row once, ≤ 30 minutes, 2 a day; batches ('usb',
--        'convert', future kinds) ≤ 3 h, 4 refund calls per kind a day, and only ONE "large" refund per kind a day
--        (cumulative units of a row > max(5, 25 % of the row): a cancelled Converter batch or a failed USB/ZIP export
--        still gets its points back once a day); 1000 units a day overall. Every call is counted (private.refund_calls),
--        also when it gives back 0 points. Larger or repeated refunds: staff via admin_grant_credits.
-- [V5-2] Storage quota bypass: storage_room() returned true for ANY overwrite before the quota check, so 1999 tiny
--        files re-uploaded with x-upsert at 50 MB each skipped the MB quota. Now the object being replaced is left out
--        of the count and the incoming file is reserved at the bucket's maximum size (the policy cannot see its real
--        size); a per-user advisory lock cuts down parallel-upload races.
-- [V5-3] 2FA bypass through SECURITY DEFINER RPCs: they skip RLS, so the restrictive aal_ok() policies did not
--        protect them. An aal1 session (password / e-mail code only) of an account WITH a verified TOTP factor now gets
--        'mfa_required' (42501) from every RPC that spends, refunds, reads or posts for the user (spend_credits_n /
--        spend_credits, spend_song, refund_credits(_n), price_quote, my_referral, claim_referral, review_submit /
--        review_delete, my_pay_portal, catalog_set_full, the assistant quota), and a quiet no-op from the ones the app may
--        fire around sign-in (log_activity, refill_credits, bump_seps). Accounts without a factor are not affected
--        (same rule as aal_ok()). New catalog rows also need aal_ok() (restrictive INSERT policy).
-- [V5-4] A full admin who is not the owner could wipe the owner's and other staff members' stored files through
--        the Storage API (the admin side of the delete policies was just is_admin()). Now an admin may delete files
--        only in the folder of a plain user ('user' role; staff only for the owner), never the owner, never their own
--        account through the admin path, and never an account with a live subscription — the same rules as
--        admin_delete_user.
-- [V5-5] A 'settings' role could mint points through billing values (signup gift, referral reward / cap, plan points)
--        and route them to itself. Those fields now change only for the owner and full admins; costs, discounts and
--        billing.on stay with 'settings'. Every change of site_config is logged to activity as 'adm_config' (actor +
--        changed keys; log_activity refuses user-written adm_* names, so these rows cannot be forged).
-- [V5-6] Referral farming with e-mail aliases (me+1@gmail.com, m.e@gmail.com …) and delete/re-sign-up cycles. The
--        e-mail is canonicalised (lower case, '+tag' removed, dots removed for gmail.com/googlemail.com); a claim is
--        refused ('self') when it matches the inviter's address, and ('already') when that canonical address already
--        claimed an invite in the last 365 days — also from a deleted account (private.referral_claims keeps only a
--        salted SHA-256 of the canonical address, no account id, purged after ~400 days).
-- [V5-7] (same as V5-3, the second report: the assistant Function only checks /auth/v1/user and then assistant_use())
--        assistant_use() is defined in assistant.sql; a trigger on public.assistant_usage makes it raise 'mfa_required'
--        for an aal1 session of a 2FA account even after assistant.sql is re-run.
-- [V5-8] catalog.analyzed_by / full_by told every visitor which account analysed / uploaded which song. The API roles
--        now read every catalog column EXCEPT those two (the catalog half of the old [S-16]); the server-side code
--        (guards, rate limits, account deletion) still uses them as before.
-- No dynamic SQL is built from user input anywhere below (the only `execute` statements use constant text and
-- column names read from the catalog).

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-3] helper: raise 'mfa_required' for a session that has not passed 2FA on an account that has a factor
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.need_aal() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.aal_ok() then raise exception 'mfa_required' using errcode = '42501'; end if;
end $$;
revoke all on function private.need_aal() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-3] points RPCs (bodies as in points v2 / [S-21], plus the 2FA check)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.spend_credits_n(p_kind text, p_qty integer, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; b jsonb; unit integer; disc integer; price integer; lid bigint;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  perform private.need_aal();
  if p_qty is null or p_qty < 1 or p_qty > 500 then raise exception 'bad qty'; end if;
  select coalesce(billing, '{}'::jsonb) into b from public.site_config where id = 1;
  b := coalesce(b, '{}'::jsonb);
  unit := private.cost_of(b, p_kind);
  if unit is null then raise exception 'bad kind'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.blocked then raise exception 'not allowed'; end if;
  disc := private.plan_discount(me, b);
  price := private.price_of(unit, p_qty, disc);
  if b->'on' = 'false'::jsonb or me.role = 'admin' or me.owner or price <= 0 then
    return jsonb_build_object('balance', me.credits, 'id', null, 'charged', 0, 'unit', unit, 'qty', p_qty, 'discount', disc, 'free', true);
  end if;
  if me.credits < price then raise exception 'insufficient_credits'; end if;
  update public.profiles set credits = credits - price where id = me.id;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref, kind, qty)
    values (me.id, -price, me.credits - price, 'spend',
            left(p_kind || ' ×' || p_qty || coalesce(' ' || nullif(btrim(regexp_replace(p_ref, '[[:cntrl:]]', ' ', 'g')), ''), ''), 300), p_kind, p_qty)
    returning id into lid;
  return jsonb_build_object('balance', me.credits - price, 'id', lid, 'charged', price, 'unit', unit, 'qty', p_qty, 'discount', disc, 'free', false);
end $$;
revoke execute on function public.spend_credits_n(text, integer, text) from public, anon;
grant execute on function public.spend_credits_n(text, integer, text) to authenticated;

create or replace function public.price_quote(p_kind text, p_qty integer default 1)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles; b jsonb; unit integer; disc integer; free boolean;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  perform private.need_aal();
  if p_qty is null or p_qty < 1 or p_qty > 500 then raise exception 'bad qty'; end if;
  select coalesce(billing, '{}'::jsonb) into b from public.site_config where id = 1;
  b := coalesce(b, '{}'::jsonb);
  unit := private.cost_of(b, p_kind);
  if unit is null then raise exception 'bad kind'; end if;
  select * into me from public.profiles where id = auth.uid();
  if not found or me.blocked then raise exception 'not allowed'; end if;
  disc := private.plan_discount(me, b);
  free := b->'on' = 'false'::jsonb or me.role = 'admin' or me.owner;
  return jsonb_build_object('unit', unit, 'qty', p_qty, 'discount', disc,
    'total', case when free then 0 else private.price_of(unit, p_qty, disc) end, 'balance', me.credits, 'free', free, 'plan', me.plan);
end $$;
revoke execute on function public.price_quote(text, integer) from public, anon;
grant execute on function public.price_quote(text, integer) to authenticated;

create or replace function public.spend_song(p_song_key text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; r jsonb;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  perform private.need_aal();
  if p_song_key is null or p_song_key !~ '^[A-Za-z0-9._-]{1,80}$' then raise exception 'bad key'; end if;
  select * into me from public.profiles where id = auth.uid() for update;        -- serialises per user (no double charge)
  if not found or me.blocked then raise exception 'not allowed'; end if;
  if exists (select 1 from public.charged_songs where user_id = me.id and song_key = p_song_key and kind = 'song') then
    return jsonb_build_object('balance', me.credits, 'id', null, 'charged', 0, 'qty', 1, 'already', true, 'free', true);
  end if;
  r := public.spend_credits_n('song', 1, coalesce(nullif(btrim(p_ref), ''), p_song_key));
  if r->>'id' is not null or (select count(*) from public.charged_songs where user_id = me.id
                                and created_at > now() - interval '1 day') < 3000 then
    insert into public.charged_songs (user_id, song_key, kind, ledger_id)
      values (me.id, p_song_key, 'song', nullif(r->>'id', '')::bigint) on conflict do nothing;
  end if;
  return r || jsonb_build_object('already', false);
end $$;
revoke execute on function public.spend_song(text, text) from public, anon;
grant execute on function public.spend_song(text, text) to authenticated;

-- separation refund: rules unchanged (own 'sep' charge, ≤ 20 min, once, 2 a day) + the 2FA check
create or replace function public.refund_credits(p_id bigint) returns integer
language plpgsql security definer set search_path = public as $$
declare me public.profiles; row public.credit_ledger;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  perform private.need_aal();
  select * into me from public.profiles where id = auth.uid() for update;       -- serialises refunds per user
  if not found then raise exception 'not allowed'; end if;
  select * into row from public.credit_ledger
   where id = p_id and user_id = me.id and reason = 'spend' and delta < 0
     and (kind = 'sep' or (kind is null and ref like 'sep%')) and created_at > now() - interval '20 minutes';
  if not found then raise exception 'not refundable'; end if;
  if exists (select 1 from public.credit_ledger where user_id = me.id and reason = 'refund' and ref = 'refund:' || p_id) then
    return me.credits;
  end if;
  if (select count(*) from public.credit_ledger where user_id = me.id and reason = 'refund' and ref like 'refund:%'
        and created_at > now() - interval '1 day') >= 2 then
    raise exception 'refund limit';
  end if;
  update public.credit_ledger set refunded = coalesce(qty, 1) where id = row.id and qty is not null;
  update public.profiles set credits = credits - row.delta where id = me.id;
  insert into public.credit_ledger (user_id, delta, balance, reason, ref, kind, qty)
    values (me.id, -row.delta, me.credits - row.delta, 'refund', 'refund:' || p_id, 'sep', 1);
  return me.credits - row.delta;
end $$;
revoke execute on function public.refund_credits(bigint) from public, anon;
grant execute on function public.refund_credits(bigint) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-1] refund_credits_n: per-kind caps; every call is counted (also when it gives back 0 points)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists private.refund_calls (
  id        bigserial primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  ledger_id bigint,
  kind      text,
  qty       integer not null,
  big       boolean not null default false,
  at        timestamptz not null default now()
);
create index if not exists refund_calls_user_idx on private.refund_calls (user_id, at desc);
revoke all on private.refund_calls from public, anon, authenticated;
revoke all on sequence private.refund_calls_id_seq from public, anon, authenticated;

-- → {balance, refunded (points), left (units still refundable)}. Errors: 'not refundable', 'over refund', 'refund limit'.
create or replace function public.refund_credits_n(p_id bigint, p_qty integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles; r public.credit_ledger; amt integer; single boolean; thr integer; big boolean;
        n_kind integer; n_big integer; units integer;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  perform private.need_aal();
  if p_qty is null or p_qty < 1 or p_qty > 500 then raise exception 'bad qty'; end if;
  select * into me from public.profiles where id = auth.uid() for update;           -- serialises refunds per user
  if not found then raise exception 'not allowed'; end if;
  select * into r from public.credit_ledger
   where id = p_id and user_id = me.id and reason = 'spend' and delta < 0 and qty is not null
     and kind is not null and kind not in ('sep', 'song', 'stems') and created_at > now() - interval '3 hours'
   for update;
  if not found then raise exception 'not refundable'; end if;
  if r.refunded + p_qty > r.qty then raise exception 'over refund'; end if;
  single := r.kind in ('mashup', 'extended');
  if single then
    -- one export = one refund of the whole row, soon after the charge, 2 a day across the single-export kinds
    if r.refunded > 0 or p_qty <> r.qty or r.created_at <= now() - interval '30 minutes' then raise exception 'not refundable'; end if;
    if (select count(*) from private.refund_calls where user_id = me.id and kind in ('mashup', 'extended')
          and at > now() - interval '1 day') >= 2 then
      raise exception 'refund limit';
    end if;
    big := true;
  else
    -- batches: a few small refunds per kind a day, and one large one (cancelled batch / failed folder export)
    thr := greatest(5, ceil(r.qty / 4.0)::integer);
    big := r.refunded + p_qty > thr;
    select count(*), count(*) filter (where c.big) into n_kind, n_big from private.refund_calls c
     where c.user_id = me.id and c.kind = r.kind and c.at > now() - interval '1 day';
    if n_kind >= 4 or (big and n_big >= 1) then raise exception 'refund limit'; end if;
  end if;
  select coalesce(sum(qty), 0) into units from private.refund_calls where user_id = me.id and at > now() - interval '1 day';
  if units + p_qty > 1000 then raise exception 'refund limit'; end if;
  insert into private.refund_calls (user_id, ledger_id, kind, qty, big) values (me.id, r.id, r.kind, p_qty, big);
  if random() < 0.01 then delete from private.refund_calls where at < now() - interval '7 days'; end if;

  amt := floor(-r.delta::numeric * (r.refunded + p_qty) / r.qty)::integer - floor(-r.delta::numeric * r.refunded / r.qty)::integer;
  update public.credit_ledger set refunded = refunded + p_qty where id = r.id;
  if amt > 0 then
    update public.profiles set credits = credits + amt where id = me.id;
    insert into public.credit_ledger (user_id, delta, balance, reason, ref, kind, qty)
      values (me.id, amt, me.credits + amt, 'refund', 'refundn:' || p_id || ':' || p_qty, r.kind, p_qty);
  end if;
  return jsonb_build_object('balance', me.credits + greatest(amt, 0), 'refunded', greatest(amt, 0), 'left', r.qty - r.refunded - p_qty);
end $$;
revoke execute on function public.refund_credits_n(bigint, integer) from public, anon;
grant execute on function public.refund_credits_n(bigint, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-3] functions the app may call around sign-in: quiet no-op for an aal1 session of a 2FA account
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- body as in [S-18]
create or replace function public.log_activity(p_action text, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or p_action is null or p_action !~ '^[a-z_]{2,40}$' or p_action like 'adm\_%' then return; end if;
  if not public.aal_ok() then return; end if;
  if (select count(*) from public.activity where user_id = uid and created_at > now() - interval '1 hour') >= 400 then return; end if;
  if (select count(*) from public.activity where user_id = uid and created_at > now() - interval '1 day') >= 1500 then return; end if;
  insert into public.activity (user_id, action, detail)
    values (uid, p_action, nullif(left(btrim(regexp_replace(coalesce(p_detail, ''), '[[:cntrl:]]', ' ', 'g')), 300), ''));
  if random() < 0.005 then delete from public.activity where created_at < now() - interval '180 days'; end if;
end $$;
revoke execute on function public.log_activity(text, text) from public, anon;
grant execute on function public.log_activity(text, text) to authenticated;

-- body as in the points block; an aal1 session of a 2FA account gets null (no refill, no balance)
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

create or replace function public.bump_seps() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.aal_ok() then return; end if;
  update public.profiles set seps = seps + 1 where id = auth.uid();
end $$;
revoke execute on function public.bump_seps() from public, anon;
grant execute on function public.bump_seps() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-3] account data RPCs (bodies as before, plus the 2FA check)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.my_pay_portal() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;
  perform private.need_aal();
  return (select pay_portal from public.profiles where id = auth.uid());
end $$;
revoke execute on function public.my_pay_portal() from public, anon;
grant execute on function public.my_pay_portal() to authenticated;

create or replace function public.my_referral() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; code text; n integer; pts integer;
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
  select coalesce(sum(delta), 0) into pts from public.credit_ledger where user_id = me.id and reason = 'referral' and ref like 'ref:inviter:%';
  return jsonb_build_object('code', code, 'invited', n, 'earned', pts);
end $$;
revoke execute on function public.my_referral() from public, anon;
grant execute on function public.my_referral() to authenticated;

-- body as in [S-7] + the 2FA check
create or replace function public.catalog_set_full(cid text, p_bpm numeric, p_pc smallint, p_mode smallint, p_chords jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer; mod boolean;
begin
  if auth.uid() is null or exists (select 1 from public.profiles where id = auth.uid() and blocked) then
    raise exception 'not allowed';
  end if;
  perform private.need_aal();
  if p_bpm is null or p_bpm < 30 or p_bpm > 300 or p_pc is null or p_pc not between 0 and 11 or p_mode is null or p_mode not in (0,1)
     or not public.catalog_chords_ok(p_chords, 16) then
    raise exception 'bad analysis';
  end if;
  mod := public.has_perm('catalog');
  if not mod and (select count(*) from public.catalog where full_by = auth.uid() and full_at > now() - interval '1 day') >= 20 then
    raise exception 'rate limit';
  end if;
  update public.catalog
     set bpm = p_bpm, key_pc = p_pc, key_mode = p_mode, chords = p_chords,
         is_full = true, full_by = auth.uid(), full_at = now()
   where id = cid and (not is_full or mod);
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.catalog_set_full(text, numeric, smallint, smallint, jsonb) from public, anon;
grant execute on function public.catalog_set_full(text, numeric, smallint, smallint, jsonb) to authenticated;

-- new Discover rows: only from a session that passed 2FA when the account has it
drop policy if exists "mfa: aal2 when enrolled (insert)" on public.catalog;
create policy "mfa: aal2 when enrolled (insert)" on public.catalog as restrictive for insert to authenticated
  with check ((select public.aal_ok()));

-- reviews (bodies as in [G-3] + the 2FA check)
create or replace function public.review_submit(p_rating integer, p_body text, p_show_name boolean default false, p_lang text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); txt text; bad boolean := false; r public.reviews;
begin
  if uid is null then return jsonb_build_object('ok', false, 'error', 'auth'); end if;
  perform private.need_aal();
  if exists (select 1 from public.profiles where id = uid and blocked) then return jsonb_build_object('ok', false, 'error', 'blocked'); end if;
  if not exists (select 1 from auth.users where id = uid and email_confirmed_at is not null and coalesce(btrim(email), '') <> '') then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
  if not exists (select 1 from public.activity where user_id = uid and action in ('export', 'separate', 'mashup_export', 'extended_export', 'crate_export', 'convert'))
     and not exists (select 1 from public.downloads where user_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;
  if p_rating is null or p_rating not between 1 and 5 then return jsonb_build_object('ok', false, 'error', 'bad_rating'); end if;
  txt := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]+', ' ', 'g'));
  if char_length(txt) > 400 then return jsonb_build_object('ok', false, 'error', 'too_long'); end if;
  if txt ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|co|il|ru|me|ly)(/|[[:space:]]|$))' then return jsonb_build_object('ok', false, 'error', 'links'); end if;
  if to_regprocedure('private.is_offensive(text)') is not null then
    execute 'select private.is_offensive($1)' into bad using txt;
  else
    bad := private.growth_offensive(txt);
  end if;
  if coalesce(bad, false) then return jsonb_build_object('ok', false, 'error', 'offensive'); end if;
  select * into r from public.reviews where user_id = uid;
  if found and r.edit_day = current_date and r.edits >= 5 then return jsonb_build_object('ok', false, 'error', 'rate'); end if;
  insert into public.reviews (user_id, rating, body, show_name, lang, status, featured, edits, edit_day)
    values (uid, p_rating, txt, coalesce(p_show_name, false), case when p_lang ~ '^(he|en|ar|ru|es)$' then p_lang end, 'pending', false, 1, current_date)
  on conflict (user_id) do update
    set rating = excluded.rating, body = excluded.body, show_name = excluded.show_name, lang = excluded.lang,
        status = 'pending', featured = false, moderated_at = null, moderated_by = null, updated_at = now(),
        edits = case when public.reviews.edit_day = current_date then public.reviews.edits + 1 else 1 end, edit_day = current_date;
  return jsonb_build_object('ok', true, 'status', 'pending');
end $$;
revoke execute on function public.review_submit(integer, text, boolean, text) from public, anon;
grant execute on function public.review_submit(integer, text, boolean, text) to authenticated;

create or replace function public.review_delete() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform private.need_aal();
  delete from public.reviews where user_id = auth.uid();
end $$;
revoke execute on function public.review_delete() from public, anon;
grant execute on function public.review_delete() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-7] the assistant (assistant.sql): assistant_use() writes public.assistant_usage on every message, so a trigger
-- there stops an aal1 session of a 2FA account even when assistant.sql is re-run later. assistant_status() (read-only)
-- gets the check too while it exists. Both parts are skipped until assistant.sql has been run.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_aal_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform private.need_aal();
  return new;
end $$;
revoke all on function private.guard_aal_row() from public, anon, authenticated;
do $do$ begin
  if to_regclass('public.assistant_usage') is not null then
    execute 'drop trigger if exists assistant_usage_aal on public.assistant_usage';
    execute 'create trigger assistant_usage_aal before insert or update on public.assistant_usage for each row execute function private.guard_aal_row()';
  end if;
  if to_regprocedure('public.assistant_status()') is not null and to_regprocedure('private.assistant_limit(public.profiles, jsonb)') is not null then
    execute $f$
create or replace function public.assistant_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.profiles; b jsonb; lim integer; used integer;
begin
  if uid is null then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  perform private.need_aal();
  select * into me from public.profiles where id = uid;
  if not found then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  if me.blocked and not me.owner then return jsonb_build_object('ok', false, 'why', 'blocked'); end if;
  if not me.owner and not exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null) then
    return jsonb_build_object('ok', false, 'why', 'auth');
  end if;
  select coalesce(billing, '{}'::jsonb) into b from public.site_config where id = 1;
  b := coalesce(b, '{}'::jsonb);
  lim := private.assistant_limit(me, b);
  if lim is not null and jsonb_typeof(b->'assistant') = 'boolean' and not (b->>'assistant')::boolean then
    return jsonb_build_object('ok', false, 'why', 'off');
  end if;
  select u.count into used from public.assistant_usage u where u.user_id = uid and u.day = private.assistant_today();
  return jsonb_build_object('ok', true, 'left', case when lim is null then null else greatest(0, lim - coalesce(used, 0)) end, 'limit', lim);
end $$
$f$;
    execute 'revoke execute on function public.assistant_status() from public, anon';
    execute 'grant execute on function public.assistant_status() to authenticated';
  end if;
end $do$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-2] storage quota: overwrites are counted, the incoming file is reserved at the bucket maximum
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- may the signed-in user add (or replace) an object called p_name in p_bucket? (own folder, clean name, within quota)
-- VOLATILE on purpose: after waiting for the per-user lock, the counts see uploads that committed in the meantime.
create or replace function public.storage_room(p_bucket text, p_name text) returns boolean
language plpgsql volatile security definer set search_path = public, storage as $$
declare uid uuid := auth.uid(); n bigint; bytes bigint; b jsonb; maxn bigint; maxb bigint; lim bigint;
begin
  if uid is null or p_bucket is null or p_name is null then return false; end if;
  if p_name ~ '(^|/)\.{1,2}(/|$)' or p_name ~ '[\\[:cntrl:]]' or p_name ~ '//' or char_length(p_name) > 400 then return false; end if;
  if (storage.foldername(p_name))[1] is distinct from uid::text then return false; end if;
  if exists (select 1 from public.profiles where id = uid and blocked) then return false; end if;
  if public.is_admin() then return true; end if;
  perform pg_advisory_xact_lock(hashtext('chordroom:storage_room'), hashtext(uid::text || ':' || p_bucket));
  select billing into b from public.site_config where id = 1;
  if p_bucket = 'avatars' then maxn := 30; maxb := 20::bigint * 1048576;
  else
    maxn := coalesce(public.safe_int(b->>'max_files'), 2000);
    maxb := coalesce(public.safe_int(b->>'storage_mb'), 5120)::bigint * 1048576;
  end if;
  -- the largest file the bucket accepts = what this upload may add (the policy can't see the real size)
  select nullif(bk.file_size_limit, 0) into lim from storage.buckets bk where bk.id = p_bucket;
  lim := coalesce(lim, case when p_bucket = 'avatars' then 2097152 else 52428800 end);
  -- everything in the folder except the object being replaced
  select count(*), coalesce(sum(case when metadata->>'size' ~ '^\d{1,15}$' then (metadata->>'size')::bigint else 0 end), 0)
    into n, bytes from storage.objects
   where bucket_id = p_bucket and (storage.foldername(name))[1] = uid::text and name <> p_name;
  -- a quota smaller than one file: at most one file over (the old rule)
  return n < maxn and (bytes + lim <= maxb or (maxb < lim and bytes < maxb));
end $$;
revoke execute on function public.storage_room(text, text) from public, anon;
grant execute on function public.storage_room(text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-4] admins delete stored files only in folders admin_delete_user could delete
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- p_folder = the first path segment (the account id). True only for the owner / full admins (is_admin, 2FA-aware),
-- for another account that is not the owner, not staff (unless the caller is the owner), without a live subscription.
create or replace function public.storage_may_wipe(p_folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or p_folder is null or p_folder !~ '^[0-9a-fA-F-]{36}$' or lower(p_folder) = auth.uid()::text then return false; end if;
  if not public.is_admin() then return false; end if;
  return exists (select 1 from public.profiles p
                  where p.id::text = lower(p_folder) and not p.owner and (p.role = 'user' or public.is_owner())
                    and not private.sub_live(p));
end $$;
revoke execute on function public.storage_may_wipe(text) from public, anon;
grant execute on function public.storage_may_wipe(text) to authenticated;

drop policy if exists "uploads: own delete" on storage.objects;
create policy "uploads: own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and ((storage.foldername(name))[1] = auth.uid()::text
                                    or public.storage_may_wipe((storage.foldername(name))[1])));
drop policy if exists "avatars: admin delete" on storage.objects;
create policy "avatars: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.storage_may_wipe((storage.foldername(name))[1]));

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-5] billing fields that create points: owner / full admins only; every site_config change is logged
-- ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function private.guard_config_points() returns trigger
language plpgsql set search_path = public as $$
declare ob jsonb; nb jsonb := new.billing; k text; bad text;
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then return new; end if;
  -- an upsert on the existing row fires this INSERT trigger with the column defaults for the fields it does not send;
  -- the row that is really stored is checked by the UPDATE trigger that follows (ON CONFLICT DO UPDATE), so skip here
  if tg_op = 'INSERT' and exists (select 1 from public.site_config c where c.id = new.id) then return new; end if;
  if tg_op = 'UPDATE' then ob := old.billing; else ob := '{}'::jsonb; end if;
  ob := case when jsonb_typeof(ob) = 'object' then ob else '{}'::jsonb end;
  nb := case when jsonb_typeof(nb) = 'object' then nb else '{}'::jsonb end;
  if nb is not distinct from ob then return new; end if;
  -- compared as the server uses them (missing = the default: signup 0, referral 10, referral_max 20), because the admin
  -- panel always sends these fields, filled with the defaults when the stored settings don't have them
  foreach k in array array['signup', 'referral', 'referral_max'] loop
    if coalesce(public.safe_int(nb->>k), case k when 'referral' then 10 when 'referral_max' then 20 else 0 end)
       is distinct from coalesce(public.safe_int(ob->>k), case k when 'referral' then 10 when 'referral_max' then 20 else 0 end) then
      raise exception 'bad billing: only the owner or a full admin can change %', k using errcode = '42501';
    end if;
  end loop;
  -- plan points, matched by plan id (a new plan counts as 0 before)
  select string_agg(np.p->>'id', ', ') into bad
    from jsonb_array_elements(case when jsonb_typeof(nb->'plans') = 'array' then nb->'plans' else '[]'::jsonb end) np(p)
   where jsonb_typeof(np.p) = 'object'
     and coalesce(public.safe_int(np.p->>'points'), 0) is distinct from coalesce((
           select public.safe_int(op.p->>'points')
             from jsonb_array_elements(case when jsonb_typeof(ob->'plans') = 'array' then ob->'plans' else '[]'::jsonb end) op(p)
            where jsonb_typeof(op.p) = 'object' and op.p->>'id' = np.p->>'id' limit 1), 0);
  if bad is not null then
    raise exception 'bad billing: only the owner or a full admin can change plan points (%)', bad using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_config_points() from public, anon, authenticated;
drop trigger if exists site_config_guard_v5 on public.site_config;
create trigger site_config_guard_v5 before insert or update on public.site_config
  for each row execute function private.guard_config_points();

-- who changed which settings (admin panel → Activity). Not for SQL-editor / service changes (no signed-in user).
create or replace function private.audit_config() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); o jsonb; n jsonb; cols text; keys text;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then return null; end if;
  n := to_jsonb(new) - 'updated_at';
  o := case when tg_op = 'UPDATE' then to_jsonb(old) - 'updated_at' else '{}'::jsonb end;
  select string_agg(k, ',' order by k) into cols from jsonb_object_keys(n) k where k <> 'billing' and (n->k) is distinct from (o->k);
  select string_agg(k, ',' order by k) into keys from (
      select jsonb_object_keys(case when jsonb_typeof(n->'billing') = 'object' then n->'billing' else '{}'::jsonb end) k
      union select jsonb_object_keys(case when jsonb_typeof(o->'billing') = 'object' then o->'billing' else '{}'::jsonb end)) x
   where (n->'billing'->k) is distinct from (o->'billing'->k);
  if cols is null and keys is null then return null; end if;
  insert into public.activity (user_id, action, detail)
    values (uid, 'adm_config', left('by ' || uid::text || ': ' || concat_ws(' ', cols, 'billing[' || keys || ']'), 300));
  return null;
end $$;
revoke all on function private.audit_config() from public, anon, authenticated;
drop trigger if exists site_config_audit on public.site_config;
create trigger site_config_audit after insert or update on public.site_config
  for each row execute function private.audit_config();

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-6] referrals: one claim per canonical e-mail address (aliases and re-sign-ups included)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
insert into private.settings (key, value) values ('account_hash_salt', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

-- lower case, '+tag' removed; gmail.com / googlemail.com: dots removed too (all of them reach the same inbox)
create or replace function private.email_canon(p text) returns text
language plpgsql immutable set search_path = public as $$
declare e text := lower(btrim(coalesce(p, ''))); l text; d text;
begin
  if e !~ '^[^@]+@[^@]+$' then return nullif(e, ''); end if;
  l := split_part(e, '@', 1); d := split_part(e, '@', 2);
  if position('+' in l) > 1 then l := split_part(l, '+', 1); end if;
  if d in ('gmail.com', 'googlemail.com') then l := replace(l, '.', ''); d := 'gmail.com'; end if;
  return l || '@' || d;
end $$;
create or replace function private.email_key(p text) returns text
language sql stable set search_path = public, extensions as $$
  select case when private.email_canon(p) is null then null else
    encode(extensions.digest(convert_to(coalesce((select value from private.settings where key = 'account_hash_salt'), '')
                                        || ':email:' || private.email_canon(p), 'UTF8'), 'sha256'), 'hex') end;
$$;
revoke all on function private.email_canon(text), private.email_key(text) from public, anon, authenticated;

-- canonical addresses that already claimed an invite: a salted hash only (no account id), kept ~400 days
create table if not exists private.referral_claims (
  email_key text primary key check (email_key ~ '^[0-9a-f]{64}$'),
  at        timestamptz not null default now()
);
revoke all on private.referral_claims from public, anon, authenticated;
insert into private.referral_claims (email_key, at)
  select k, now() from (select distinct private.email_key(u.email) k from public.profiles p join auth.users u on u.id = p.id
                         where p.referred_by is not null and coalesce(btrim(u.email), '') <> '') x
   where k is not null
  on conflict (email_key) do nothing;

-- body as in [S-12] + the 2FA check + the canonical e-mail checks
create or replace function public.claim_referral(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; inv public.profiles; b jsonb; pts integer; cap integer; joined timestamptz; conf timestamptz;
        recent integer; paid boolean := false; my_mail text; inv_mail text; mk text;
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
  insert into private.referral_claims (email_key, at) values (mk, now())
    on conflict (email_key) do update set at = excluded.at;
  if random() < 0.01 then delete from private.referral_claims where at < now() - interval '400 days'; end if;

  select billing into b from public.site_config where id = 1;
  pts := least(1000, greatest(0, coalesce(public.safe_int(b->>'referral'), 10)));
  cap := greatest(0, coalesce(public.safe_int(b->>'referral_max'), 20));
  update public.profiles set referred_by = inv.id where id = me.id;
  if pts > 0 then
    update public.profiles set credits = credits + pts where id = me.id;
    insert into public.credit_ledger (user_id, delta, balance, reason, ref)
      values (me.id, pts, me.credits + pts, 'referral', 'ref:joined:' || inv.id);
    select count(*) into recent from public.credit_ledger
     where user_id = inv.id and reason = 'referral' and ref like 'ref:inviter:%' and created_at > now() - interval '30 days';
    if recent < cap then
      update public.profiles set credits = credits + pts where id = inv.id;
      insert into public.credit_ledger (user_id, delta, balance, reason, ref)
        values (inv.id, pts, inv.credits + pts, 'referral', 'ref:inviter:' || me.id);
      paid := true;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'points', pts, 'balance', me.credits + pts, 'inviter_paid', paid);
end $$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [V5-8] catalog: every column readable EXCEPT analyzed_by / full_by (needs the explicit column list in backend.js)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
do $do$ declare cols text; begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols from information_schema.columns
   where table_schema = 'public' and table_name = 'catalog' and column_name not in ('analyzed_by', 'full_by');
  execute 'revoke select on public.catalog from anon, authenticated, public';
  execute 'grant select (' || cols || ') on public.catalog to anon, authenticated';
end $do$;
-- =====================================================================
-- [security-v5:end]
-- =====================================================================

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
-- [R6-6] sandbox test accounts: a PayPal SANDBOX payment (fake money) activates a plan + points only for admins, the owner,
-- and accounts the OWNER marked as testers for a limited time (profiles.pay_test_until, ≤ 30 days; admin panel → user →
-- "PayPal Sandbox test account"). Everyone else's sandbox events stay 'test mode: ignored'. Sandbox payments never reward
-- an inviter (referral points are real points). /api/pay/paypal-subscribe refuses non-testers while PAYPAL_ENV=sandbox.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists pay_test_until timestamptz;
revoke update (pay_test_until) on public.profiles from authenticated, anon, public;

create or replace function public.owner_set_pay_tester(p_target uuid, p_days integer) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare until timestamptz;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  perform private.need_aal();
  if p_days is null or p_days < 0 or p_days > 30 then raise exception 'bad days'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then raise exception 'no user'; end if;
  until := case when p_days = 0 then null else now() + make_interval(days => p_days) end;
  update public.profiles set pay_test_until = until where id = p_target;
  insert into public.activity (user_id, action, detail)
    values (p_target, 'adm_tester', left('by ' || auth.uid()::text || ': ' || case when until is null then 'sandbox tester off'
                                          else 'sandbox tester until ' || to_char(until, 'YYYY-MM-DD') end, 300));
  return until;
end $$;
revoke execute on function public.owner_set_pay_tester(uuid, integer) from public, anon;
grant execute on function public.owner_set_pay_tester(uuid, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- [R6-2] [R6-3] pay_webhook_paypal: body as in [paypal] + the inviter's reward / take-back + [R6-6] sandbox testers
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
  if is_test and not (me.role = 'admin' or me.owner or coalesce(me.pay_test_until > now(), false)) then
    update public.pay_events set result = 'test mode: ignored (only admins and sandbox test accounts can test)' where id = eid;
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
            if (case when coalesce(tot, '') ~ '^[0-9]{1,9}(\.[0-9]{1,4})?$' then tot::numeric else 0 end) > 0 and not is_test then
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
        if (case when coalesce(tot, '') ~ '^[0-9]{1,9}(\.[0-9]{1,4})?$' then tot::numeric else 0 end) > 0 and not is_test then
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

-- [notify-v7:begin]
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Owner SMS alerts (notify v7). Owner guide: NOTIFY.md. Run once in the Supabase SQL editor after referral_v6.sql
-- (safe to run again; it only adds its own objects and triggers, nothing earlier is redefined).
--
-- Everything that happens on the site that the owner should know about goes into ONE log, private.notify_log:
--   payments / subscriptions (pay_events), admin actions (activity adm_*), staff sign-ins, role-password failures,
--   2FA removed or a password / e-mail changed on a staff account, role changes made directly in the database,
--   sign-ups, account deletions, new reviews, edge events from Cloudflare (rate limits, probes for hidden files, forged
--   payment webhooks — public.notify_edge, HMAC-signed), and hourly anomaly checks (sign-up waves, one account
--   hammering the site, many refunds, the assistant near its site-wide ceiling).
-- Each category has a level (owner panel → "Alerts"): 0 off (log only), 1 daily summary, 2 SMS now (held during quiet
-- hours, sent in the morning summary), 3 SMS now even at night. Caps per hour / day keep the SMS bill bounded
-- (level 3 skips the hourly cap; a hard ceiling of 60 a day always holds); held alerts are counted in the summary.
-- Sending: pg_net (Supabase extension) POSTs {t,id,msg} + x-cr-sig = HMAC-SHA256(secret, t\nid\nmsg) to the Cloudflare
-- Function /api/notify, which sends the SMS through Twilio. The phone number and the Twilio keys live ONLY in Cloudflare
-- (NOTIFY_TO, TWILIO_*): nobody, not even a full admin, can redirect the alerts from the site. Without pg_net the log
-- still fills (state 'nonet') and the panel shows it. pg_cron (if enabled) runs private.notify_tick() every hour:
-- delivery check + one retry, anomaly checks, the daily summary; without pg_cron the tick runs lazily on the next event.
-- Only the owner reads the log or changes the settings (owner_notify_* RPCs, 2FA-aware is_owner()).
-- ═════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists private.notify_log (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  cat     text not null check (cat ~ '^[a-z_]{2,20}$'),
  lvl     smallint not null default 1,
  msg     text not null check (char_length(msg) <= 400),
  state   text not null default 'new',    -- new | sent | ok | fail | off | digest | quiet | capped | nonet
  req     bigint,                         -- pg_net request id
  tries   smallint not null default 0,
  sent_at timestamptz
);
create index if not exists notify_log_at_idx on private.notify_log (at desc);
revoke all on private.notify_log from public, anon, authenticated;
revoke all on sequence private.notify_log_id_seq from public, anon, authenticated;

-- the shared secret with the Cloudflare Function (NOTIFY_SECRET there); created once, the owner copies it from the SQL editor
insert into private.settings (key, value) values ('notify_secret', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

-- default levels per category (the owner's choices in private.settings 'notify_prefs' win)
create or replace function private.notify_defaults() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'on', true,
    'cats', jsonb_build_object(
      'pay', 2,        -- payment received, new subscription, subscription ended
      'payfail', 2,    -- a subscription payment failed
      'refund', 3,     -- PayPal refund / reversal (points taken back)
      'payissue', 3,   -- a payment that could not be matched to an account / unknown plan
      'security', 3,   -- role changes, owner flag, 2FA removed / password or e-mail changed on staff, role password attacks
      'staff_login', 2,-- an admin / staff account (or the owner) signed in
      'admin', 2,      -- points granted, plans set, users blocked / deleted, settings changed, word list
      'signup', 1,     -- new account
      'review', 1,     -- a new review waits for approval
      'delete', 1,     -- an account deleted itself
      'edge', 2,       -- Cloudflare: rate limits hit, forged payment webhooks, relay secret mismatch
      'probe', 1,      -- Cloudflare: requests for hidden repo files (bots scan every site for /.git etc.: summary by default)
      'anomaly', 2,    -- hourly checks: sign-up waves, one account hammering the site, many refunds, assistant near its ceiling
      'test', 3),
    'quiet', jsonb_build_object('on', true, 'from', 23, 'to', 7),
    'digest', jsonb_build_object('on', true, 'hour', 9),
    'cap_day', 25, 'cap_hour', 8,
    'url', 'https://chord-room.com/api/notify');
$$;

create or replace function private.notify_prefs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d jsonb := private.notify_defaults(); p jsonb;
begin
  begin p := (select value::jsonb from private.settings where key = 'notify_prefs'); exception when others then p := null; end;
  if p is null or jsonb_typeof(p) <> 'object' then return d; end if;
  return d || p || jsonb_build_object('cats', (d->'cats') || coalesce(case when jsonb_typeof(p->'cats') = 'object' then p->'cats' end, '{}'::jsonb));
end $$;

create or replace function private.notify_il() returns timestamp language sql stable as $$ select now() at time zone 'Asia/Jerusalem' $$;

-- a username for an account id (never the e-mail: SMS bodies are kept by the SMS provider; no '@': it flips in Hebrew text)
create or replace function private.notify_who(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select username from public.profiles where id = p), case when p is null then 'system' else 'user ' || left(p::text, 8) end);
$$;
create or replace function private.notify_clean(s text) returns text language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(s, ''), '[[:cntrl:]‎‏‪-‮⁦-⁩]+', ' ', 'g')), 380);
$$;

-- hand one log row to pg_net (→ /api/notify → SMS). Returns the request id or null.
create or replace function private.notify_post(p_id bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare r private.notify_log; p jsonb := private.notify_prefs(); secret text; t text; rid bigint; url text;
begin
  select * into r from private.notify_log where id = p_id;
  if not found then return null; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    update private.notify_log set state = 'nonet' where id = p_id; return null;
  end if;
  secret := (select value from private.settings where key = 'notify_secret');
  url := coalesce(p->>'url', '');
  if coalesce(secret, '') = '' or url !~ '^https://[a-z0-9.-]+(:[0-9]+)?/api/notify$' then
    update private.notify_log set state = 'nonet' where id = p_id; return null;
  end if;
  t := floor(extract(epoch from now()))::bigint::text;
  execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := $3, timeout_milliseconds := 8000)'
    into rid
    using url, jsonb_build_object('t', t, 'id', r.id::text, 'msg', r.msg),
          jsonb_build_object('content-type', 'application/json',
            'x-cr-sig', encode(extensions.hmac(convert_to(t || E'\n' || r.id::text || E'\n' || r.msg, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex'));
  update private.notify_log set state = 'sent', req = rid, tries = tries + 1, sent_at = now() where id = p_id;
  return rid;
exception when others then
  update private.notify_log set state = 'nonet' where id = p_id;
  return null;
end $$;

-- the one entry point: log an event and decide (level, quiet hours, caps) whether it goes out now
create or replace function private.notify(p_cat text, p_msg text, p_force boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare p jsonb := private.notify_prefs(); lvl int; st text; il timestamp := private.notify_il(); h int; qf int; qt int;
        quiet boolean := false; nid bigint; today int; hour int;
begin
  lvl := coalesce((p->'cats'->>p_cat)::int, 1);
  if p_force then lvl := 3; end if;
  lvl := greatest(0, least(3, lvl));
  if not p_force and (p->'on') = 'false'::jsonb then lvl := least(lvl, 1); end if;   -- master switch off: summary only
  h := extract(hour from il)::int;
  if coalesce((p->'quiet'->>'on')::boolean, false) then
    qf := coalesce((p->'quiet'->>'from')::int, 23); qt := coalesce((p->'quiet'->>'to')::int, 7);
    quiet := case when qf = qt then false when qf < qt then h >= qf and h < qt else h >= qf or h < qt end;
  end if;
  st := case lvl when 0 then 'off' when 1 then 'digest' else 'new' end;
  if st = 'new' and quiet and lvl < 3 then st := 'quiet'; end if;
  if st = 'new' then
    select count(*) filter (where (sent_at at time zone 'Asia/Jerusalem')::date = il::date),
           count(*) filter (where sent_at > now() - interval '1 hour')
      into today, hour from private.notify_log where state in ('sent', 'ok', 'fail') and sent_at > now() - interval '25 hours';
    if today >= 60 or (not p_force and (today >= coalesce((p->>'cap_day')::int, 25) or (lvl < 3 and hour >= coalesce((p->>'cap_hour')::int, 8)))) then
      st := 'capped';
    end if;
  end if;
  insert into private.notify_log (cat, lvl, msg, state) values (p_cat, lvl, coalesce(nullif(private.notify_clean(p_msg), ''), '-'), st)
    returning id into nid;
  if st = 'new' then perform private.notify_post(nid); end if;
  -- no pg_cron: run the hourly work lazily (at most once an hour)
  if to_regclass('cron.job') is null and coalesce((select value from private.settings where key = 'notify_tick'), '') < to_char(now() - interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS') then
    perform private.notify_tick();
  end if;
  return nid;
exception when others then
  return null;   -- an alert must never break the action that caused it
end $$;
revoke all on function private.notify_defaults(), private.notify_prefs(), private.notify_il(), private.notify_who(uuid),
  private.notify_clean(text), private.notify_post(bigint), private.notify(text, text, boolean) from public, anon, authenticated;

-- ── the daily summary ─────────────────────────────────────────────────────────────────────────
create or replace function private.notify_digest_text(p_since timestamptz) returns text
language plpgsql stable security definer set search_path = public as $$
declare s text := 'סיכום Chord Room';
        n_sign int; n_act int; n_pay int; amt numeric; n_sub int; n_end int; n_sep int; n_exp int; n_spent int; n_rev int;
        n_held int; n_fail int; n_edge int; n_sec int;
begin
  select count(*) into n_sign from public.profiles where created_at > p_since;
  select count(distinct user_id) into n_act from public.activity where created_at > p_since;
  select count(*), coalesce(sum(case when coalesce(payload->'resource'->'amount'->>'total', '') ~ '^[0-9]{1,9}(\.[0-9]{1,4})?$'
                                     then (payload->'resource'->'amount'->>'total')::numeric end), 0)
    into n_pay, amt from public.pay_events where created_at > p_since and not test and event = 'PAYMENT.SALE.COMPLETED' and result like 'paid%';
  select count(*) filter (where result like 'active%'), count(*) filter (where result in ('cancelled', 'expired', 'paused'))
    into n_sub, n_end from public.pay_events where created_at > p_since and not test and event like 'BILLING.SUBSCRIPTION.%';
  select count(*) filter (where action = 'separate'), count(*) filter (where action in ('export', 'mashup_export', 'extended_export', 'crate_export', 'convert'))
    into n_sep, n_exp from public.activity where created_at > p_since;
  select coalesce(-sum(delta), 0) into n_spent from public.credit_ledger where created_at > p_since and reason = 'spend';
  select count(*) into n_rev from public.reviews where status = 'pending';
  select count(*) filter (where state in ('quiet', 'capped')), count(*) filter (where state in ('fail', 'nonet')),
         count(*) filter (where cat in ('edge', 'probe')), count(*) filter (where cat in ('security', 'payissue', 'anomaly'))
    into n_held, n_fail, n_edge, n_sec from private.notify_log where at > p_since and cat not in ('digest', 'test');
  s := s || E'\nנרשמו ' || n_sign || ' · פעילים ' || n_act
         || E'\nתשלומים ' || n_pay || ' (' || trim(to_char(amt, 'FM999999990.##')) || ' ש"ח) · מנויים חדשים ' || n_sub || ' · הסתיימו ' || n_end
         || E'\nהפרדות ' || n_sep || ' · הורדות ' || n_exp || ' · נקודות שנוצלו ' || n_spent;
  if n_rev > 0 then s := s || E'\nביקורות ממתינות ' || n_rev; end if;
  if n_sec > 0 or n_edge > 0 then s := s || E'\nאבטחה ' || n_sec || ' · Cloudflare ' || n_edge; end if;
  if n_held > 0 then s := s || E'\nהתראות שלא נשלחו (לילה/תקרה) ' || n_held; end if;
  if n_fail > 0 then s := s || E'\nשליחות שנכשלו ' || n_fail; end if;
  return left(s, 380);
end $$;

-- ── hourly work: delivery check + retry, anomaly checks, the daily summary ─────────────────────
create or replace function private.notify_once(p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
begin   -- true the first time p_kind is seen today (Israel time); remembered in private.settings
  if exists (select 1 from private.settings where key = 'notify_once:' || p_kind and value = to_char(private.notify_il(), 'YYYY-MM-DD')) then return false; end if;
  insert into private.settings (key, value) values ('notify_once:' || p_kind, to_char(private.notify_il(), 'YYYY-MM-DD'))
    on conflict (key) do update set value = excluded.value;
  return true;
end $$;

create or replace function private.notify_tick() returns text
language plpgsql security definer set search_path = public as $$
declare p jsonb := private.notify_prefs(); il timestamp := private.notify_il(); r record; n int; since timestamptz; out text := '';
        lim int; used int;
begin
  insert into private.settings (key, value) values ('notify_tick', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'))
    on conflict (key) do update set value = excluded.value;
  -- 1) deliveries: pg_net keeps responses for a while in net._http_response
  if to_regclass('net._http_response') is not null then
    for r in select id, req, tries from private.notify_log where state = 'sent' and req is not null and sent_at > now() - interval '2 days' loop
      execute 'select status_code from net._http_response where id = $1' into n using r.req;
      if n is null then continue; end if;
      if n between 200 and 299 then update private.notify_log set state = 'ok' where id = r.id;
      elsif r.tries < 2 then perform private.notify_post(r.id);
      else update private.notify_log set state = 'fail' where id = r.id; end if;
    end loop;
  end if;
  -- 2) anomalies (each at most once a day)
  select count(*) into n from public.profiles where created_at > now() - interval '1 hour';
  if n >= 30 and private.notify_once('signups') then perform private.notify('anomaly', 'גל הרשמות חריג: ' || n || ' חשבונות חדשים בשעה האחרונה (בוטים?)'); out := out || 'signups '; end if;
  for r in select user_id, count(*) c from public.activity where created_at > now() - interval '1 hour' and action not like 'adm\_%'
            group by user_id having count(*) >= 300 order by 2 desc limit 1 loop
    if private.notify_once('busy:' || r.user_id) then perform private.notify('anomaly', 'חשבון פעיל בצורה חריגה: ' || private.notify_who(r.user_id) || ' · ' || r.c || ' פעולות בשעה'); out := out || 'busy '; end if;
  end loop;
  select count(*) into n from public.credit_ledger where reason = 'refund' and created_at > now() - interval '1 day';
  if n >= 20 and private.notify_once('refunds') then perform private.notify('anomaly', 'הרבה החזרי נקודות היום: ' || n || ' (לבדוק שהכלים עובדים)'); out := out || 'refunds '; end if;
  if to_regclass('public.assistant_usage') is not null then
    begin
      select coalesce((billing->>'assistant_site_daily')::int, 3000) into lim from public.site_config where id = 1;
      execute 'select coalesce(sum(n), 0)::int from public.assistant_usage where day = current_date' into used;
      if lim > 0 and used >= lim * 0.8 and private.notify_once('assistant') then
        perform private.notify('anomaly', 'רומי קרוב לתקרה היומית: ' || used || ' מתוך ' || lim || ' הודעות'); out := out || 'assistant ';
      end if;
    exception when others then null; end;
  end if;
  -- 3) the daily summary at the chosen hour (Israel time)
  if coalesce((p->'digest'->>'on')::boolean, true) and extract(hour from il)::int = coalesce((p->'digest'->>'hour')::int, 9)
     and private.notify_once('digest') then
    since := coalesce((select max(at) from private.notify_log where cat = 'digest'), now() - interval '1 day');
    perform private.notify('digest', private.notify_digest_text(greatest(since, now() - interval '2 days')), true);
    out := out || 'digest ';
  end if;
  -- 4) the log keeps 90 days
  delete from private.notify_log where at < now() - interval '90 days';
  return nullif(btrim(out), '');
exception when others then
  return 'error';
end $$;
revoke all on function private.notify_digest_text(timestamptz), private.notify_once(text), private.notify_tick() from public, anon, authenticated;

-- ── event hooks (triggers). Every hook is wrapped: an alert never blocks the action. ─────────────
create or replace function private.notify_on_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare d text := coalesce(new.detail, ''); who text; actor text; pr public.profiles;
begin
  if new.action not in ('adm_tester', 'adm_role', 'adm_owner', 'adm_delete_user', 'adm_block', 'adm_credits', 'adm_plan', 'adm_words', 'adm_config', 'sign_in') then return null; end if;
  who := private.notify_who(new.user_id);
  actor := substring(d from '^by ([0-9a-f-]{36})');
  if actor is not null then d := private.notify_who(actor::uuid) || substring(d from 40); end if;
  case new.action
    when 'adm_role' then perform private.notify('security', 'שינוי תפקיד ל-' || who || ': ' || d);
    when 'adm_owner' then perform private.notify('security', 'שינוי בעלות בחשבון ' || who || ': ' || d);
    when 'adm_tester' then perform private.notify('security', 'חשבון בדיקה ל-PayPal Sandbox: ' || who || ': ' || d);
    when 'adm_delete_user' then perform private.notify('security', 'משתמש נמחק ע"י ' || d);
    when 'adm_block' then perform private.notify('admin', 'חסימה/שחרור ' || who || ': ' || d);
    when 'adm_credits' then perform private.notify('admin', 'נקודות ל-' || who || ': ' || d);
    when 'adm_plan' then perform private.notify('admin', 'מסלול ל-' || who || ': ' || d);
    when 'adm_words' then perform private.notify('admin', 'רשימת מילים פוגעניות: ' || d || ' (' || who || ')');
    when 'adm_config' then
      -- payment links / plans / points changes are security relevant (redirected revenue, free points)
      perform private.notify(case when d ~ '(plans|signup|referral|turnstile|require_mfa|storage)' then 'security' else 'admin' end, 'הגדרות האתר שונו: ' || d);
    when 'sign_in' then
      select * into pr from public.profiles where id = new.user_id;
      if found and (pr.owner or pr.role <> 'user') then
        perform private.notify('staff_login', 'כניסה לחשבון ניהול: ' || who || case when pr.owner then ' (בעלים)' else ' (' || pr.role || ')' end);
      end if;
    else null;
  end case;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notify_activity on public.activity;
create trigger notify_activity after insert on public.activity for each row execute function private.notify_on_activity();

create or replace function private.notify_on_pay() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev text := coalesce(new.event, ''); res text := coalesce(new.result, ''); who text := private.notify_who(new.user_id);
        amt text; cur text; tag text := case when new.test then ' [בדיקה]' else '' end;
begin
  if new.result is null or (tg_op = 'UPDATE' and new.result is not distinct from old.result) then return null; end if;
  if res in ('duplicate') or res like 'test%' or res like 'ignored%' then return null; end if;
  amt := new.payload->'resource'->'amount'->>'total';
  cur := coalesce(new.payload->'resource'->'amount'->>'currency', '');
  if res = 'no user' or res like '%unknown plan%' or res like 'paid, plan not known%' then
    perform private.notify('payissue', 'תשלום שלא שויך לחשבון (' || ev || ') — לבדוק בפאנל, אירועי תשלום' || tag);
  elsif ev = 'PAYMENT.SALE.COMPLETED' then
    perform private.notify('pay', 'תשלום התקבל: ' || coalesce(amt || ' ' || cur, '') || ' · ' || who || ' · ' || res || tag);
  elsif ev in ('PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED') then
    perform private.notify('refund', 'החזר כספי/ביטול חיוב ב-PayPal: ' || coalesce(amt || ' ' || cur, '') || ' · ' || who || ' · ' || res || tag);
  elsif ev = 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' then
    perform private.notify('payfail', 'חיוב מנוי נכשל: ' || who || tag);
  elsif ev like 'BILLING.SUBSCRIPTION.%' then
    perform private.notify('pay', case when res like 'active%' then 'מנוי פעיל: ' when res = 'cancelled' then 'מנוי בוטל: '
                                       when res = 'expired' then 'מנוי הסתיים: ' when res = 'paused' then 'מנוי הושהה: ' else 'מנוי: ' end
                                  || who || ' · ' || res || tag);
  else
    perform private.notify('pay', 'אירוע תשלום ' || ev || ': ' || who || ' · ' || res || tag);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notify_pay on public.pay_events;
create trigger notify_pay after insert or update of result on public.pay_events for each row execute function private.notify_on_pay();

create or replace function private.notify_on_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify('signup', 'נרשם/ה: ' || coalesce(new.username, '?'));
  elsif auth.uid() is null and (new.role is distinct from old.role or new.owner is distinct from old.owner) then
    -- a change made directly in the database (SQL editor / dashboard), not through the site
    perform private.notify('security', 'תפקיד שונה ישירות במסד הנתונים: ' || coalesce(new.username, '?') || ' ' || coalesce(old.role, '') || ' → ' || coalesce(new.role, '')
                                     || case when new.owner is distinct from old.owner then ' · בעלים=' || new.owner else '' end);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notify_profile on public.profiles;
create trigger notify_profile after insert or update of role, owner on public.profiles for each row execute function private.notify_on_profile();

create or replace function private.notify_on_misc() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if tg_table_name = 'account_deletions' then
    if new.how = 'self' then perform private.notify('delete', 'חשבון נמחק ע"י המשתמש' || case when new.had_payments then ' (היו לו תשלומים)' else '' end);
    elsif new.how = 'dashboard' then perform private.notify('security', 'חשבון נמחק ישירות מלוח Supabase'); end if;
  elsif tg_table_name = 'reviews' then
    perform private.notify('review', 'ביקורת חדשה (' || new.rating || '/5) מחכה לאישור');
  elsif tg_table_name = 'role_pw_fail' then
    select count(*) into n from private.role_pw_fail where at > now() - interval '15 minutes';
    if n in (3, 5) then perform private.notify('security', 'סיסמת התפקידים הוקלדה שגוי ' || n || ' פעמים ב-15 דקות' || case when n >= 5 then ' — ננעל ל-15 דקות' else '' end); end if;
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists notify_deletion on public.account_deletions;
create trigger notify_deletion after insert on public.account_deletions for each row execute function private.notify_on_misc();
drop trigger if exists notify_review on public.reviews;
create trigger notify_review after insert on public.reviews for each row execute function private.notify_on_misc();
drop trigger if exists notify_role_pw on private.role_pw_fail;
create trigger notify_role_pw after insert on private.role_pw_fail for each row execute function private.notify_on_misc();

-- staff accounts (owner / admin / custom role): 2FA removed, password or e-mail changed (also from the Supabase dashboard)
create or replace function private.notify_is_staff(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = p and (owner or role <> 'user'));
$$;
create or replace function private.notify_on_auth() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb;
begin
  if tg_table_name = 'users' then
    if not private.notify_is_staff(new.id) then return null; end if;
    o := to_jsonb(old); n := to_jsonb(new);
    if (o->>'encrypted_password') is distinct from (n->>'encrypted_password') then
      perform private.notify('security', 'הסיסמה שונתה בחשבון ניהול: ' || private.notify_who(new.id));
    end if;
    if (o->>'email') is distinct from (n->>'email') or (o->>'email_change') is distinct from (n->>'email_change') and coalesce(n->>'email_change', '') <> '' then
      perform private.notify('security', 'בקשה/שינוי של כתובת המייל בחשבון ניהול: ' || private.notify_who(new.id));
    end if;
    if (o->>'phone') is distinct from (n->>'phone') then
      perform private.notify('security', 'מספר הטלפון שונה בחשבון ניהול: ' || private.notify_who(new.id));
    end if;
  elsif tg_table_name = 'mfa_factors' then
    if tg_op = 'DELETE' then
      if old.status = 'verified' and private.notify_is_staff(old.user_id) then
        perform private.notify('security', 'אימות דו-שלבי הוסר מחשבון ניהול: ' || private.notify_who(old.user_id));
      end if;
      return null;
    end if;
    if new.status = 'verified' and old.status is distinct from 'verified' and private.notify_is_staff(new.user_id) then
      perform private.notify('admin', 'אימות דו-שלבי הופעל בחשבון ניהול: ' || private.notify_who(new.user_id));
    end if;
  end if;
  return null;
exception when others then return null;
end $$;
revoke all on function private.notify_on_activity(), private.notify_on_pay(), private.notify_on_profile(), private.notify_on_misc(),
  private.notify_is_staff(uuid), private.notify_on_auth() from public, anon, authenticated;
drop trigger if exists cr_notify_auth_user on auth.users;
create trigger cr_notify_auth_user after update on auth.users for each row execute function private.notify_on_auth();
do $$ begin
  if to_regclass('auth.mfa_factors') is not null then
    execute 'drop trigger if exists cr_notify_mfa on auth.mfa_factors';
    execute 'create trigger cr_notify_mfa after update or delete on auth.mfa_factors for each row execute function private.notify_on_auth()';
  end if;
end $$;

-- ── edge events from Cloudflare (functions/_middleware.js, functions/api/pay/paypal.js) ──────────
-- anon RPC, HMAC-checked with the same secret: body = {"t":<epoch s>,"kind":"rate|probe|paysig|relay","n":<count>,"path":"…"}
create or replace function public.notify_edge(p_body text, p_sig text) returns text
language plpgsql security definer set search_path = public as $$
declare secret text := (select value from private.settings where key = 'notify_secret'); b jsonb; k text; n int; pth text; t bigint;
begin
  if coalesce(secret, '') = '' or p_body is null or p_sig is null or length(p_body) > 2000 or p_sig !~ '^[0-9a-f]{64}$' then return 'bad'; end if;
  if encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'), 'hex') <> p_sig then return 'bad'; end if;
  begin b := p_body::jsonb; exception when others then return 'bad'; end;
  t := case when coalesce(b->>'t', '') ~ '^[0-9]{9,11}$' then (b->>'t')::bigint end;
  if t is null or abs(extract(epoch from now()) - t) > 600 then return 'stale'; end if;
  k := b->>'kind'; n := case when coalesce(b->>'n', '') ~ '^[0-9]{1,7}$' then (b->>'n')::int else 1 end;
  pth := left(regexp_replace(coalesce(b->>'path', ''), '[^A-Za-z0-9/._%-]', '', 'g'), 80);
  if k not in ('rate', 'probe', 'paysig', 'relay') then return 'bad'; end if;
  -- at most one edge alert per kind every 30 minutes (Cloudflare already throttles; this holds even if it doesn't)
  if exists (select 1 from private.notify_log where cat in ('edge', 'probe') and msg like '[' || k || ']%' and at > now() - interval '30 minutes') then return 'throttled'; end if;
  perform private.notify(case when k = 'probe' then 'probe' else 'edge' end, '[' || k || '] ' || case k
      when 'rate' then 'הגבלת קצב הופעלה ' || n || ' פעמים (מישהו מציף את ה-API) ' || pth
      when 'probe' then 'ניסיונות לגשת לקבצים מוסתרים: ' || n || ' · ' || pth
      when 'paysig' then 'הודעות תשלום מזויפות נדחו: ' || n
      else 'הסוד בין Cloudflare למסד לא תואם — תשלומים לא נקלטים!' end);
  return 'ok';
end $$;
revoke all on function public.notify_edge(text, text) from public;
grant execute on function public.notify_edge(text, text) to anon, authenticated;

-- ── owner panel RPCs (admin panel → "Alerts", assets/notify.js) ───────────────────────────────
create or replace function public.owner_notify_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare il timestamp := private.notify_il();
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'prefs', private.notify_prefs(),
    'ready', jsonb_build_object(
      'net', to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null,
      'cron', to_regclass('cron.job') is not null,
      'secret', exists (select 1 from private.settings where key = 'notify_secret' and value <> '')),
    'today', jsonb_build_object(
      'sent', (select count(*) from private.notify_log where state in ('sent', 'ok', 'fail') and (sent_at at time zone 'Asia/Jerusalem')::date = il::date),
      'ok', (select count(*) from private.notify_log where state = 'ok' and (sent_at at time zone 'Asia/Jerusalem')::date = il::date),
      'held', (select count(*) from private.notify_log where state in ('quiet', 'capped') and (at at time zone 'Asia/Jerusalem')::date = il::date)),
    'last_ok', (select max(sent_at) from private.notify_log where state = 'ok'),
    'last_fail', (select max(sent_at) from private.notify_log where state in ('fail', 'nonet')),
    'log', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', at, 'cat', cat, 'lvl', lvl, 'msg', msg, 'state', state) order by id desc)
                       from (select * from private.notify_log order by id desc limit 80) x), '[]'::jsonb));
end $$;

create or replace function public.owner_notify_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := private.notify_defaults(); c jsonb := '{}'::jsonb; k text; v jsonb; o jsonb;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  perform private.need_aal();
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'bad prefs'; end if;
  if jsonb_typeof(p->'cats') = 'object' then
    for k, v in select * from jsonb_each(p->'cats') loop
      if d->'cats' ? k and jsonb_typeof(v) = 'number' and (v::text)::numeric in (0, 1, 2, 3) then c := c || jsonb_build_object(k, (v::text)::int);
      else raise exception 'bad prefs: cats.%', k; end if;
    end loop;
  end if;
  o := jsonb_build_object(
    'on', coalesce((p->>'on')::boolean, true),
    'cats', c,
    'quiet', jsonb_build_object('on', coalesce((p->'quiet'->>'on')::boolean, true),
                                'from', least(23, greatest(0, coalesce((p->'quiet'->>'from')::int, 23))),
                                'to', least(23, greatest(0, coalesce((p->'quiet'->>'to')::int, 7)))),
    'digest', jsonb_build_object('on', coalesce((p->'digest'->>'on')::boolean, true),
                                 'hour', least(23, greatest(0, coalesce((p->'digest'->>'hour')::int, 9)))),
    'cap_day', least(60, greatest(1, coalesce((p->>'cap_day')::int, 25))),
    'cap_hour', least(30, greatest(1, coalesce((p->>'cap_hour')::int, 8))));
  if coalesce(p->>'url', '') <> '' then
    if (p->>'url') !~ '^https://[a-z0-9.-]+(:[0-9]+)?/api/notify$' then raise exception 'bad prefs: url'; end if;
    o := o || jsonb_build_object('url', p->>'url');
  else
    o := o || jsonb_build_object('url', private.notify_prefs()->>'url');   -- the panel doesn't send it: keep the current one
  end if;
  insert into private.settings (key, value) values ('notify_prefs', o::text) on conflict (key) do update set value = excluded.value;
  insert into public.activity (user_id, action, detail) values (auth.uid(), 'adm_notify', 'alerts settings saved');
  return private.notify_prefs();
end $$;

-- 'test' = one SMS now (skips quiet hours and the hourly cap), 'digest' = the summary now
create or replace function public.owner_notify_send(p_what text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nid bigint; r private.notify_log;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  perform private.need_aal();
  if (select count(*) from private.notify_log l where l.cat in ('test', 'digest') and l.at > now() - interval '1 hour') >= 6 then raise exception 'too many'; end if;
  if p_what = 'test' then nid := private.notify('test', 'בדיקה: התראות Chord Room מגיעות לטלפון ✓', true);
  elsif p_what = 'digest' then nid := private.notify('digest', private.notify_digest_text(now() - interval '1 day'), true);
  else raise exception 'bad what'; end if;
  select * into r from private.notify_log l where l.id = nid;
  return jsonb_build_object('id', nid, 'state', r.state, 'msg', r.msg);
end $$;
revoke all on function public.owner_notify_status(), public.owner_notify_save(jsonb), public.owner_notify_send(text) from public, anon;
grant execute on function public.owner_notify_status(), public.owner_notify_save(jsonb), public.owner_notify_send(text) to authenticated;

-- hourly job (pg_cron, when the extension is enabled: Database → Extensions → pg_cron). Re-running replaces it.
do $$ begin
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'cr-notify-hourly') then perform cron.unschedule('cr-notify-hourly'); end if;
    perform cron.schedule('cr-notify-hourly', '3 * * * *', 'select private.notify_tick()');
  end if;
exception when others then raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
-- [notify-v7:end]
