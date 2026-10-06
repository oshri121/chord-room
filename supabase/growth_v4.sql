-- Chord Room — growth v4 (analytics ids, Search Console token, A/B experiments, user reviews). Run it ONCE in the
-- Supabase dashboard: SQL Editor → New query → paste this whole file → Run. Safe to run again (idempotent).
-- Run it AFTER schema.sql (and the other one-time files) are installed.
--
-- This file = the "Growth v4" block at the end of supabase/schema.sql ([growth-v4:begin…end]), verbatim.
-- tools/tests/sql/test_growth_v4.py checks that they match and that this file applies twice on an older install.

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
