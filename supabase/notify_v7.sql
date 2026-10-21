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
  if new.action not in ('adm_role', 'adm_owner', 'adm_delete_user', 'adm_block', 'adm_credits', 'adm_plan', 'adm_words', 'adm_config', 'sign_in') then return null; end if;
  who := private.notify_who(new.user_id);
  actor := substring(d from '^by ([0-9a-f-]{36})');
  if actor is not null then d := private.notify_who(actor::uuid) || substring(d from 40); end if;
  case new.action
    when 'adm_role' then perform private.notify('security', 'שינוי תפקיד ל-' || who || ': ' || d);
    when 'adm_owner' then perform private.notify('security', 'שינוי בעלות בחשבון ' || who || ': ' || d);
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
