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
  -- a live paid subscription gets its points only from payment events (pay_webhook below), never from here
  if me.pay_sub_id is not null and coalesce(me.pay_status, '') not in ('expired', 'unpaid') then
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
      if coalesce(p->>'variant', '') !~ '^(\d{1,12})?$' then raise exception 'bad billing: plan variant' using errcode = '22023'; end if;
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
      if k not in ('ga4', 'clarity', 'gsc') then raise exception 'bad analytics: unknown key %', k using errcode = '22023'; end if;
      if jsonb_typeof(new.analytics->k) <> 'string' then raise exception 'bad analytics: %', k using errcode = '22023'; end if;
    end loop;
    if coalesce(new.analytics->>'ga4', '') !~ '^(G-[A-Z0-9]{4,16})?$' then raise exception 'bad analytics: ga4 (G-XXXXXXXXXX)' using errcode = '22023'; end if;
    if coalesce(new.analytics->>'clarity', '') !~ '^([a-z0-9]{6,16})?$' then raise exception 'bad analytics: clarity (project id)' using errcode = '22023'; end if;
    if coalesce(new.analytics->>'gsc', '') !~ '^([A-Za-z0-9_-]{10,100})?$' then raise exception 'bad analytics: gsc (verification token)' using errcode = '22023'; end if;
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
