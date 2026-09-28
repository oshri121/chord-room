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

-- admin: activate / extend / cancel a plan (until a payment provider is connected)
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
