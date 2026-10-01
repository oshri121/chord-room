-- Chord Room — points v2: run ONCE in the Supabase SQL editor (New query → paste this whole file → Run).
-- Safe to run again. It needs the current supabase/schema.sql to be installed already (it is a copy of the
-- "Points v2" block of schema.sql + the updated [S-9] settings guard + the updated assistant price list), so you
-- do NOT have to re-run schema.sql or assistant.sql. What it does:
--   * new cost kinds in site_config.billing.costs (song 1, usb 1, mashup 3, extended 3, convert 1; sep 5 / stems 2 kept)
--     and a discount per plan (basic 0 %, pro 10 %, studio 25 %) — values you already set are kept;
--   * new RPCs spend_credits_n / price_quote / spend_song / refund_credits_n, table charged_songs (read-only for users);
--   * spend_credits(kind, ref) and refund_credits(id) keep working for the old callers.

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

-- ---------------------------------------------------------------------
-- [S-9] settings guard, updated for points v2 (any cost kind 0…100, plan discount 0…90 %) — same as in schema.sql
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Roomy (assistant.sql): the price list it reads now has every kind + plan discounts — same as in assistant.sql
-- ---------------------------------------------------------------------
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
