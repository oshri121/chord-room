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
