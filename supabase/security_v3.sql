-- Chord Room — security v3 (server-side audit, see SECURITY-AUDIT.md). Run it ONCE in the Supabase dashboard:
-- SQL Editor → New query → paste this whole file → Run. Safe to run again (idempotent).
-- Run it AFTER schema.sql / points_v2.sql / assistant.sql are already installed (it only tightens what they create).
--
-- Part 1 = the "Security v3" block at the end of supabase/schema.sql ([S-17]…[S-23]), verbatim.
-- Part 2 = supabase/assistant.sql, verbatim (new: confirmed email required, site-wide daily ceiling
--          billing.assistant_site_daily, default 3000 messages/day). It also creates the assistant tables if they are missing.
-- tools/tests/sql/test_security_v3.py checks that both parts match their sources exactly.

-- ═════════════ part 1: schema.sql [security-v3] ═════════════
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

-- ═════════════ part 2: assistant.sql ═════════════
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
--   assistant_site_daily  0…1000000     messages per day for the WHOLE SITE (all non-admin accounts together; default
--                                       3000; 0 = no site cap). A cost ceiling: many fake accounts can't multiply the bill.
-- Admins and the owner are unlimited (only a burst limit of 30 per minute; everyone else 8 per minute).
-- Accounts whose email is not confirmed (and Supabase "anonymous" sessions, which have no email) get no answers.

-- site-wide counter per day (private: not reachable through the API)
create schema if not exists private;
create table if not exists private.assistant_site (day date primary key, count integer not null default 0);
revoke all on private.assistant_site from public, anon, authenticated;

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
    -- every cost kind (points v2: song, sep, stems, usb, mashup, extended, convert, …), whole numbers only
    'costs', case when jsonb_typeof(b->'costs') = 'object' then (select jsonb_object_agg(k, v) from jsonb_each(b->'costs') e(k, v)
                                                                  where k ~ '^[a-z][a-z_]{1,23}$' and jsonb_typeof(v) = 'number') end,
    'plans', (select jsonb_agg(jsonb_build_object('id', p->>'id', 'price', p->'price', 'points', p->'points', 'discount', p->'discount'))
                from jsonb_array_elements(case when jsonb_typeof(b->'plans') = 'array' then b->'plans' else '[]'::jsonb end) p
               where jsonb_typeof(p) = 'object')));
$$;
revoke all on function private.assistant_prices(jsonb) from public, anon, authenticated;

-- spend one message. {ok:true, left, limit, me:{plan,credits}, billing} or {ok:false, why: auth|blocked|off|limit|slow|site_limit}
create or replace function public.assistant_use() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); me public.profiles; b jsonb; lim integer; d date := private.assistant_today();
        r public.assistant_usage; cap integer; nb integer; nat timestamptz; site integer; used integer;
begin
  if uid is null then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  select * into me from public.profiles where id = uid;
  if not found then return jsonb_build_object('ok', false, 'why', 'auth'); end if;
  if me.blocked and not me.owner then return jsonb_build_object('ok', false, 'why', 'blocked'); end if;
  -- confirmed email only (an anonymous Supabase session or an unconfirmed sign-up must not cost API money)
  if not me.owner and not exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null) then
    return jsonb_build_object('ok', false, 'why', 'auth');
  end if;
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
  -- the site-wide ceiling (admins/owner are not counted and never refused)
  if lim is not null then
    site := greatest(0, least(1000000, coalesce(public.safe_int(b->>'assistant_site_daily'), 3000)));
    insert into private.assistant_site (day) values (d) on conflict do nothing;
    select count into used from private.assistant_site where day = d for update;
    if site > 0 and used >= site then return jsonb_build_object('ok', false, 'why', 'site_limit'); end if;
    update private.assistant_site set count = count + 1 where day = d;
    if random() < 0.01 then delete from private.assistant_site where day < d - 60; end if;
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
  if b ? 'assistant_site_daily' and coalesce(public.safe_int(b->>'assistant_site_daily'), -1) not between 0 and 1000000 then
    raise exception 'bad billing: assistant_site_daily' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.guard_config_assistant() from public, anon, authenticated;
drop trigger if exists site_config_guard_assistant on public.site_config;
create trigger site_config_guard_assistant before insert or update on public.site_config
  for each row execute function private.guard_config_assistant();
