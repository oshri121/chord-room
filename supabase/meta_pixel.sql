-- Chord Room — allow the Meta Pixel id in site_config.analytics (run once in the Supabase SQL editor; safe to run again).
-- Same change as in schema.sql / growth_v4.sql (private.guard_growth): key 'meta' = digits only (Events Manager → Datasets).
do $$
declare src text;
  k_old text := $q$if k not in ('ga4', 'clarity', 'gsc') then$q$;
  k_new text := $q$if k not in ('ga4', 'clarity', 'meta', 'gsc') then$q$;
  g_line text := $q$raise exception 'bad analytics: gsc (verification token)' using errcode = '22023'; end if;$q$;
  m_line text := $q$
    if coalesce(new.analytics->>'meta', '') !~ '^([0-9]{10,20})?$' then raise exception 'bad analytics: meta (Meta Pixel dataset id)' using errcode = '22023'; end if;$q$;
begin
  src := pg_get_functiondef('private.guard_growth()'::regprocedure);
  if position(k_new in src) > 0 then return; end if;                  -- already patched
  if position(k_old in src) = 0 or position(g_line in src) = 0 then
    raise warning 'meta_pixel.sql: private.guard_growth not in the expected shape - NOT patched'; return;
  end if;
  src := replace(src, k_old, k_new);
  src := replace(src, g_line, g_line || m_line);
  execute src;
end $$;
