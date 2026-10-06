-- Chord Room — accounts v4 (launch checklist: delete account, two-factor authentication, offensive-word filter,
-- Turnstile / idle sign-out / minimum-age settings, age consent). Run it ONCE in the Supabase dashboard:
-- SQL Editor → New query → paste this whole file → Run. Safe to run again (idempotent).
-- Run it AFTER schema.sql, points_v2.sql, assistant.sql and security_v3.sql are installed.
--
-- This file = the "Accounts v4" block at the end of supabase/schema.sql ([accounts-v4:begin…end]), verbatim.
-- tools/tests/sql/test_accounts_v4.py checks that both copies match and that this file applies twice cleanly.
-- Owner steps (Supabase MFA + Bot protection, Cloudflare Turnstile + WAF rule, admin settings): SECURITY-AUDIT.md "v4".

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
