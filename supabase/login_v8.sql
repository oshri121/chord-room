-- [login-v8:begin]
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Sign in with the username OR the e-mail (login v8). Run once in the Supabase SQL editor after notify_v7.sql
-- (safe to run again; it only adds its own objects, nothing earlier is redefined).
--
-- Supabase Auth signs in with an e-mail address. When the sign-in box holds a username, the browser first asks
-- public.login_email(p_user, p_password) for that account's e-mail. The answer carries the e-mail ONLY when the
-- password is the account's password (bcrypt in auth.users.encrypted_password), so nobody learns someone else's
-- e-mail from a username. Then the browser signs in with that e-mail as before: Turnstile, Supabase's own limits,
-- 2FA and the "confirm your e-mail" step are unchanged. Accounts without a password (code / SMS only) answer 'no'.
-- Because this RPC can test a password, wrong tries are capped (rows in private.login_fail, kept one day):
--   5 per account in 15 minutes  → 'locked' (only the username route; signing in with the e-mail still works),
--   20 per network in 15 minutes → 'busy'   (network = salted IP hash, private.request_ip_key() from [R6-4]),
--   300 site-wide in 15 minutes  → 'busy'.
-- A staff account locked by wrong tries and the site-wide ceiling raise an owner alert (notify v7, when present).
-- Answers: {ok:true, email} | {ok:false, why:'no'|'locked'|'busy'}; an unknown username = a wrong password ('no').
-- ═════════════════════════════════════════════════════════════════════════════════════════════

create table if not exists private.login_fail (
  at     timestamptz not null default now(),
  uid    uuid,
  ip_key text
);
create index if not exists login_fail_at_idx on private.login_fail (at);
create index if not exists login_fail_uid_idx on private.login_fail (uid, at) where uid is not null;
create index if not exists login_fail_ip_idx on private.login_fail (ip_key, at) where ip_key is not null;
alter table private.login_fail enable row level security;
revoke all on private.login_fail from public, anon, authenticated;

create or replace function public.login_email(p_user text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(btrim(coalesce(p_user, ''))); ik text; v_uid uuid; staff boolean; mail text; h text; n int;
begin
  if left(u, 1) = '@' then u := substr(u, 2); end if;
  if u !~ '^[a-z0-9_.-]{3,24}$' or p_password is null or length(p_password) not between 1 and 200 then
    return jsonb_build_object('ok', false, 'why', 'no');
  end if;
  delete from private.login_fail where at < now() - interval '1 day';
  ik := private.request_ip_key();
  if (select count(*) from private.login_fail where at > now() - interval '15 minutes') >= 300
     or (ik is not null and (select count(*) from private.login_fail f where f.ip_key = ik and f.at > now() - interval '15 minutes') >= 20) then
    return jsonb_build_object('ok', false, 'why', 'busy');
  end if;
  select p.id, (p.role <> 'user' or p.owner) into v_uid, staff from public.profiles p where lower(p.username) = u;
  if v_uid is not null and (select count(*) from private.login_fail f where f.uid = v_uid and f.at > now() - interval '15 minutes') >= 5 then
    return jsonb_build_object('ok', false, 'why', 'locked');
  end if;
  if v_uid is not null then
    select a.email, a.encrypted_password into mail, h from auth.users a where a.id = v_uid;
    if coalesce(mail, '') <> '' and coalesce(h, '') <> '' and extensions.crypt(p_password, h) = h then
      delete from private.login_fail f where f.uid = v_uid;
      return jsonb_build_object('ok', true, 'email', mail);
    end if;
  end if;
  insert into private.login_fail (uid, ip_key) values (v_uid, ik);
  -- owner alerts (notify v7); never in the way of the answer
  begin
    if v_uid is not null and staff
       and (select count(*) from private.login_fail f where f.uid = v_uid and f.at > now() - interval '15 minutes') = 5 then
      perform private.notify('security', 'כניסה עם שם משתמש ננעלה ל-15 דקות אחרי 5 סיסמאות שגויות: ' || private.notify_who(v_uid));
    end if;
    select count(*) into n from private.login_fail where at > now() - interval '15 minutes';
    if n >= 300 and private.notify_once('login_busy') then
      perform private.notify('anomaly', 'הרבה ניסיונות כניסה שגויים עם שם משתמש: ' || n || ' ב-15 דקות — הכניסה בשם משתמש נעצרה זמנית (באימייל עדיין עובדת)');
    end if;
  exception when others then null;
  end;
  return jsonb_build_object('ok', false, 'why', 'no');
end $$;
revoke all on function public.login_email(text, text) from public;
grant execute on function public.login_email(text, text) to anon, authenticated;
-- [login-v8:end]
