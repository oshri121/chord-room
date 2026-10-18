-- =====================================================================ס
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
  -- a live paid subscription gets its points only from payment events, never from here
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
