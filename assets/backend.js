/*
 * Backend: accounts, profiles, song library, site settings and admin.
 * Runs on Supabase (Auth + Postgres + Storage). Schema: supabase/schema.sql.
 * If config.js has no Supabase keys, the site still works as a local-only tool.
 */
(function () {
  const cfg = window.CHORDROOM_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const sb = enabled ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  const USERNAME_RE = /^[A-Za-z0-9_.-]{3,24}$/;
  const fail = (code, message) => { const e = new Error(message || code); e.code = code; throw e; };
  // Supabase Auth error → a short code the app turns into a translated message (app.js authErr)
  function mapAuthError(err) {
    const m = String(err && err.message || err || ''), c = String(err && err.code || '');
    if (/invalid login credentials/i.test(m) || c === 'invalid_credentials') return fail('login', m);
    if (/email not confirmed/i.test(m) || c === 'email_not_confirmed') return fail('confirm', m);
    if (/signups? not allowed|signup is disabled/i.test(m) || c === 'signup_disabled') return fail('closed', m);
    if (/token has expired|token.*invalid|otp.*(expired|invalid)|invalid.*otp/i.test(m) || /^otp_/.test(c)) return fail('otp', m);
    if (/should be different from the old/i.test(m) || c === 'same_password') return fail('same', m);
    if (/weak|pwned|leaked|easy to guess/i.test(m) || c === 'weak_password') return fail('weak', m);
    if (/password should be at least/i.test(m)) return fail('short', m);
    if (/already (been )?registered|user already exists/i.test(m) || c === 'user_already_exists' || c === 'email_exists') return fail('exists', m);
    if (/rate limit|too many|only request this after|security purposes/i.test(m) || c === 'over_email_send_rate_limit' || c === 'over_request_rate_limit' || (err && err.status === 429)) {
      const e = new Error(m); e.code = 'rate'; const sec = /after (\d+) seconds?/i.exec(m); e.wait = sec ? +sec[1] : 0; throw e;
    }
    if (/invalid format|validate email|email address.*invalid|invalid email/i.test(m) || c === 'email_address_invalid' || c === 'validation_failed') return fail('email', m);
    if (/profiles_username_key|username.*(taken|exists)|duplicate key/i.test(m)) return fail('taken', m);
    if (/captcha/i.test(m) || /^captcha/.test(c)) return fail('captcha', m);                       /* acct: Turnstile */
    if (/mfa|aal2|factor/i.test(m) || /^mfa_/.test(c)) return fail(/code|challenge|verif/i.test(m) ? 'otp' : 'mfa', m);   /* acct */
    if (/failed to fetch|network|load failed/i.test(m)) return fail('network', m);
    return fail('generic', m);
  }
  const redirect = () => location.origin + location.pathname;

  /* acct (accounts v4): Turnstile token for Supabase Auth (assets/acct.js sets B.captcha when a site key is configured;
     undefined = no CAPTCHA), the session's 2FA level from the JWT, retries with backoff for 429/503 */
  const cap = async action => { try { return B.captcha ? (await B.captcha(action)) || undefined : undefined; } catch (e) { return undefined; } };
  function claims(tok) {
    try { const p = String(tok || '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4))))) || {}; }
    catch (e) { return {}; }
  }
  // a session whose user has a verified TOTP factor but did not pass it yet (aal1) → not signed in for the app
  function mfaState(session) {
    if (!session || !session.user) return null;
    const f = (session.user.factors || []).filter(x => x && x.status === 'verified');
    return { aal: claims(session.access_token).aal || 'aal1', factors: f, need: f.length > 0 && claims(session.access_token).aal !== 'aal2' };
  }
  async function backoff(fn, tries) {
    for (let i = 0; ; i++) {
      const r = await fn();
      const st = r && r.error && (r.error.status || r.error.statusCode);
      if (!(st == 429 || st == 503) || i >= (tries || 3)) return r;
      await new Promise(ok => setTimeout(ok, Math.min(8000, 500 * 2 ** i) + Math.random() * 250));
    }
  }
  const mfaEvent = () => { try { document.dispatchEvent(new CustomEvent('cr-mfa', { detail: { pending: !!B.mfaPending } })); } catch (e) {} };

  const B = {
    enabled,
    client: sb,
    user: null,
    USERNAME_RE,
    captcha: null,        /* acct: async (action) → Turnstile token | undefined (set by assets/acct.js) */
    mfaPending: null,     /* acct: {user, factors} while a 2FA sign-in waits for its code */
    _reauth: false,

    async init(onChange) {
      if (!enabled) return;
      // acct: a 2FA account whose session has not passed the TOTP step yet stays "signed out" for the app until
      // mfaSignInVerify (the event 'cr-mfa' opens the code dialog). A re-authentication in the delete-account dialog
      // (B._reauth) keeps the user while it asks for the code. Decided from the session alone (no auth calls here).
      const gate = (event, session) => {
        const st = mfaState(session);
        if (st && st.need && !(B._reauth && B.user && B.user.id === session.user.id)) {
          const was = B.mfaPending; B.mfaPending = { user: session.user, factors: st.factors }; B.user = null;
          onChange('MFA_REQUIRED', null); if (!was) setTimeout(mfaEvent, 0); return;
        }
        B.mfaPending = null; B.user = session ? session.user : null;
        onChange(event, B.user);
      };
      B._gate = gate;
      sb.auth.onAuthStateChange(gate);
      const { data } = await sb.auth.getSession();
      gate('INITIAL', data.session || null);
    },

    async usernameFree(username) {
      const { data, error } = await sb.rpc('username_available', { u: username });
      if (error) return true;
      return !!data;
    },
    // terms = { version, at } — copied into profiles.terms_version / terms_at by handle_new_user (supabase/auth_consent.sql)
    async signUp({ username, email, password, terms, age }) {
      if (!USERNAME_RE.test(username)) fail('user');
      if (password.length < 8) fail('short');
      if (!(await B.usernameFree(username))) fail('taken');
      const meta = { username };
      if (terms && terms.version) { meta.terms_version = String(terms.version).slice(0, 20); meta.terms_at = terms.at || new Date().toISOString(); }
      // acct: the age checkbox → profiles.age_confirmed_at / age_min (handle_new_user, schema.sql [A-5])
      if (age && age.ok) { meta.age_ok = true; meta.age_at = age.at || new Date().toISOString(); meta.age_min = Math.max(13, Math.min(21, parseInt(age.min, 10) || 16)); }
      const captchaToken = await cap('signup');
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: redirect(), captchaToken } });
      if (error) mapAuthError(error);
      // with "Confirm email" on, an address that already has a confirmed account comes back as a user without identities
      if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) fail('exists');
      return { needsConfirm: !data.session };
    },
    // the 6-digit code from the confirmation email → signed in (fires SIGNED_IN)
    async verifySignup(email, token) {
      const { error } = await sb.auth.verifyOtp({ email, token: String(token).trim(), type: 'signup' });
      if (error) mapAuthError(error);
    },
    async resendSignup(email) {
      const captchaToken = await cap('resend');
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect(), captchaToken } });
      if (error) mapAuthError(error);
    },
    // password reset by code: the same email carries a code ({{ .Token }}) and the old link ({{ .ConfirmationURL }})
    async sendRecoveryCode(email) { return B.sendReset(email); },
    async verifyRecovery(email, token) {
      const { error } = await sb.auth.verifyOtp({ email, token: String(token).trim(), type: 'recovery' });
      if (error) mapAuthError(error);
    },
    async signIn({ email, password }) {
      const captchaToken = await cap('signin');
      const { data, error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
      if (error) mapAuthError(error);
      // acct: the account has 2FA → the TOTP step follows (the 'cr-mfa' event opens it; the auth dialog closes)
      const st = mfaState(data && data.session);
      if (st && st.need) { B.mfaPending = { user: data.session.user, factors: st.factors }; B.user = null; setTimeout(mfaEvent, 0); fail('mfa'); }   // the dialog ignores a second event
    },
    // acct: this browser only (the account menu); signOutAll ends every session of the account (all devices)
    async signOut() { B.mfaPending = null; await sb.auth.signOut({ scope: 'local' }); },
    async signOutAll() { B.mfaPending = null; const { error } = await sb.auth.signOut({ scope: 'global' }); if (error) { await sb.auth.signOut({ scope: 'local' }); throw error; } },
    async sendReset(email) {
      const captchaToken = await cap('reset');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect(), captchaToken });
      if (error) mapAuthError(error);
    },
    async setPassword(password) {
      if (password.length < 8) fail('short');
      const { error } = await sb.auth.updateUser({ password });
      if (error) mapAuthError(error);
    },
    async changePassword(current, next) {
      if (next.length < 8) fail('short');
      await B.checkPassword(current);
      await B.setPassword(next);
    },
    // acct: is this the account's password? Checked on a throwaway client, so this session (and its 2FA level) stays as it is
    async checkPassword(pw) {
      const tmp = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'cr-pwcheck' } });
      const captchaToken = await cap('reauth');
      const { error } = await tmp.auth.signInWithPassword({ email: B.user.email, password: pw, options: { captchaToken } });
      if (error) { if (/invalid login credentials/i.test(error.message || '') || error.code === 'invalid_credentials') fail('curpass'); mapAuthError(error); }
      try { await tmp.auth.signOut({ scope: 'local' }); } catch (e) {}
    },
    // acct: sign in again as the same account (fresh JWT amr, needed by delete_my_account). A 2FA account is aal1 after
    // this until mfaVerify; B._reauth keeps the app signed in meanwhile, reauthDone() ends that grace.
    async reauthPassword(pw) {
      B._reauth = true;
      const captchaToken = await cap('reauth');
      const { error } = await sb.auth.signInWithPassword({ email: B.user.email, password: pw, options: { captchaToken } });
      if (error) { B._reauth = false; if (/invalid login credentials/i.test(error.message || '') || error.code === 'invalid_credentials') fail('curpass'); mapAuthError(error); }
    },
    // the same with a 6-digit code by e-mail (password forgotten). The Supabase "Magic Link" template must show {{ .Token }}.
    async sendReauthCode() {
      const captchaToken = await cap('otp');
      const { error } = await sb.auth.signInWithOtp({ email: B.user.email, options: { shouldCreateUser: false, captchaToken } });
      if (error) mapAuthError(error);
    },
    async verifyReauthCode(code) {
      B._reauth = true;
      const { error } = await sb.auth.verifyOtp({ email: B.user.email, token: String(code).trim(), type: 'email' });
      if (error) { B._reauth = false; mapAuthError(error); }
    },
    reauthDone() {
      if (!B._reauth) return; B._reauth = false;
      if (B._gate) sb.auth.getSession().then(r => B._gate('REAUTH', (r.data && r.data.session) || null)).catch(() => {});
    },
    async changeEmail(email) {
      const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: location.origin + location.pathname });
      if (error) mapAuthError(error);
    },

    async getProfile() {
      const { data, error } = await sb.from('profiles').select('*').eq('id', B.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async updateProfile(patch) {
      if (patch.username !== undefined) {
        if (!USERNAME_RE.test(patch.username)) fail('user');
      }
      const { data, error } = await sb.from('profiles').update(patch).eq('id', B.user.id).select().maybeSingle();
      if (error) {
        if (/duplicate key|profiles_username_key/.test(error.message)) fail('taken');
        if (/^offensive/.test(error.message || '')) { const e = new Error('offensive'); e.code = 'offensive'; e.field = String(error.details || ''); throw e; }   /* acct */
        throw error;
      }
      return data;
    },
    async touch() {
      await sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', B.user.id);
    },
    async uploadAvatar(blob) {
      // one fixed file per user (the storage quota counts files); ?v= busts caches after a change
      const path = `${B.user.id}/avatar.jpg`;
      const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
    },
    async bumpSeps() { await sb.rpc('bump_seps'); },

    // points (credits) and plans: balances change only inside Postgres (supabase/schema.sql)
    // pay_* = the automatic subscription (written only by the payment webhook). Falls back to the older columns
    // while the payments part of schema.sql hasn't been run yet.
    async credits() {
      const base = 'credits,plan,plan_until,last_refill';
      let { data, error } = await sb.from('profiles').select(base + ',pay_status,pay_portal,pay_renews').eq('id', B.user.id).maybeSingle();
      if (error && /42703|does not exist/i.test((error.code || '') + ' ' + (error.message || ''))) {
        ({ data, error } = await sb.from('profiles').select(base).eq('id', B.user.id).maybeSingle());
      }
      if (error) throw error;
      return data || { credits: 0, plan: 'free', plan_until: null, last_refill: null };
    },
    async refillCredits() {
      const { data, error } = await sb.rpc('refill_credits');
      if (error) throw error;
      return data;
    },
    // the server decides the price from site_config.billing.costs[kind]; returns { balance, id }
    async spendCredits(kind, ref) {
      const { data, error } = await sb.rpc('spend_credits', { p_kind: kind, p_ref: ref == null ? null : String(ref).slice(0, 250) });
      if (error) { if (/insufficient_credits/.test(error.message || '')) fail('insufficient', error.message); throw error; }
      return data || { balance: null, id: null };
    },
    // points v2 (schema.sql "Points v2"): qty units of a kind, priced on the server with the plan discount
    // → { balance, id, charged, unit, qty, discount, free }
    async spendN(kind, qty, ref) {
      const { data, error } = await sb.rpc('spend_credits_n', { p_kind: kind, p_qty: qty, p_ref: ref == null ? null : String(ref).slice(0, 250) });
      if (error) { if (/insufficient_credits/.test(error.message || '')) fail('insufficient', error.message); throw error; }
      return data || { balance: null, id: null, charged: 0 };
    },
    // what it would cost now → { unit, qty, discount, total, balance, free, plan }
    async quote(kind, qty) {
      const { data, error } = await sb.rpc('price_quote', { p_kind: kind, p_qty: qty });
      if (error) throw error;
      return data;
    },
    // give back qty units of a batch charge (own row, ≤ 30 min) → { balance, refunded, left }
    async refundN(id, qty) {
      const { data, error } = await sb.rpc('refund_credits_n', { p_id: id, p_qty: qty });
      if (error) throw error;
      return data;
    },
    // the 'song' price once per song per account → spendN's answer + { already }
    async spendSong(key, ref) {
      const { data, error } = await sb.rpc('spend_song', { p_song_key: key, p_ref: ref == null ? null : String(ref).slice(0, 250) });
      if (error) { if (/insufficient_credits/.test(error.message || '')) fail('insufficient', error.message); throw error; }
      return data || { balance: null, id: null, charged: 0 };
    },
    // which of these song keys this account already paid for
    async chargedSongs(keys) {
      keys = [...new Set((keys || []).filter(k => /^[A-Za-z0-9._-]{1,80}$/.test(k)))].slice(0, 500);
      if (!keys.length) return [];
      const { data, error } = await sb.from('charged_songs').select('song_key').eq('user_id', B.user.id).eq('kind', 'song').in('song_key', keys);
      if (error) throw error;
      return (data || []).map(r => r.song_key);
    },
    // give back a separation charge that failed or was cancelled (own charge, within 20 minutes, once)
    async refundCredits(id) {
      const { data, error } = await sb.rpc('refund_credits', { p_id: id });
      if (error) throw error;
      return data;
    },
    // activity log: the user's own actions (written only through log_activity); admins read everyone's
    async logActivity(action, detail) {
      if (!B.user) return;
      const { error } = await sb.rpc('log_activity', { p_action: action, p_detail: detail == null ? null : String(detail).slice(0, 300) });
      if (error) throw error;
    },
    async adminActivity(uid, limit = 300) {
      let q = sb.from('activity').select('id,user_id,action,detail,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (uid) q = q.eq('user_id', uid);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    // invite a friend: my code + stats ({code, invited, earned}); claim = the new user joined through a code
    async myReferral() {
      const { data, error } = await sb.rpc('my_referral');
      if (error) throw error;
      return data;
    },
    async claimReferral(code) {
      const { data, error } = await sb.rpc('claim_referral', { p_code: String(code || '').slice(0, 20) });
      if (error) throw error;
      return data || { ok: false };
    },
    async ledger(limit = 30) {
      let { data, error } = await sb.from('credit_ledger').select('id,delta,balance,reason,ref,created_at,kind,qty').eq('user_id', B.user.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (error && /42703|does not exist/i.test((error.code || '') + ' ' + (error.message || '')))   // points v2 not installed yet
        ({ data, error } = await sb.from('credit_ledger').select('id,delta,balance,reason,ref,created_at').eq('user_id', B.user.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit));
      if (error) throw error;
      return data;
    },

    async listSongs() {
      const { data, error } = await sb.from('songs').select('name,data,updated_at,file_path,file_size,file_type,genre').eq('user_id', B.user.id).order('updated_at', { ascending: false });
      if (error) throw error;
      return data.map(r => ({ ...r.data, file_path: r.file_path || null, file_size: r.file_size, file_type: r.file_type, genre: r.genre || r.data.genre || '' }));
    },
    async saveSong(item) {
      const row = { user_id: B.user.id, name: item.name, data: item, updated_at: new Date().toISOString(),
        bpm: item.bpm ? Math.round(item.bpm * 100) / 100 : null, key_pc: item.key ? item.key.pc : null, key_mode: item.key ? item.key.mode : null,
        duration: item.dur ? Math.round(item.dur * 100) / 100 : null };
      if (item.file_path) { row.file_path = item.file_path; row.file_size = item.file_size || null; row.file_type = item.file_type || null; }
      if (item.genre !== undefined) row.genre = item.genre || '';
      const { error } = await sb.from('songs').upsert(row, { onConflict: 'user_id,name' });
      if (error) throw error;
    },
    async deleteSong(name) {
      const { data } = await sb.from('songs').select('file_path').eq('user_id', B.user.id).eq('name', name).maybeSingle();
      const { error } = await sb.from('songs').delete().eq('user_id', B.user.id).eq('name', name);
      if (error) throw error;
      if (data && data.file_path) await sb.storage.from('uploads').remove([data.file_path]);
    },
    // the original audio file of an uploaded song, kept in the user's private folder
    async uploadSongFile(file, key) {
      const ext = (String(file.name || '').match(/\.([a-z0-9]{1,5})$/i) || [, 'mp3'])[1].toLowerCase();
      const path = `${B.user.id}/${key}.${ext}`;
      const { error } = await sb.storage.from('uploads').upload(path, file, { upsert: true, contentType: file.type || 'audio/mpeg' });
      if (error) throw error;
      return { file_path: path, file_size: file.size, file_type: file.type || 'audio/mpeg' };
    },
    async songFileUrl(path) {
      const { data, error } = await sb.storage.from('uploads').createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    async logDownload(entry) {
      await sb.from('downloads').insert({ user_id: B.user.id, song_name: String(entry.song_name || '').slice(0, 300), files: entry.files || [], size: entry.size || null });
    },
    async adminSongs(userId) {
      let q = sb.from('songs').select('user_id,name,genre,bpm,key_pc,key_mode,duration,file_path,file_size,file_type,created_at,updated_at').order('updated_at', { ascending: false }).limit(2000);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async adminDownloads(userId) {
      let q = sb.from('downloads').select('user_id,song_name,files,size,created_at').order('created_at', { ascending: false }).limit(2000);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },

    async getConfig() {
      const { data } = await sb.from('site_config').select('*').eq('id', 1).maybeSingle();
      return data || {};
    },
    async saveConfig(c) {
      const row = { id: 1, title: c.title, announce: c.announce, lang: c.lang, ai: c.ai, dl: c.dl, require_login: c.require_login, allow_signup: c.allow_signup, updated_at: new Date().toISOString() };
      if (c.billing !== undefined && c.billing !== null) row.billing = c.billing;
      const { error } = await sb.from('site_config').upsert(row);
      if (error) throw error;
    },
    onConfig(cb) {
      return sb.channel('site_config').on('postgres_changes', { event: '*', schema: 'public', table: 'site_config' }, p => cb(p.new || {})).subscribe();
    },

    // shared catalog of analysed songs (Discover page)
    async catalogGet(ids) {
      if (!ids.length) return [];
      const { data, error } = await sb.from('catalog').select('*').in('id', ids);
      if (error) throw error;
      return data;
    },
    async catalogList(order, limit) {
      const { data, error } = await sb.from('catalog').select('*').not('bpm', 'is', null).order(order, { ascending: false }).limit(limit || 50);
      if (error) throw error;
      return data;
    },
    async catalogAdd(row) {
      const { error } = await sb.from('catalog').insert(row);
      if (error && !/duplicate key/.test(error.message)) throw error;
    },
    async catalogPlay(id) { await sb.rpc('catalog_play', { cid: id }); },
    async catalogSetFull(id, a) {
      const { data, error } = await sb.rpc('catalog_set_full', { cid: id, p_bpm: a.bpm, p_pc: a.pc, p_mode: a.mode, p_chords: a.chords });
      if (error) throw error;
      return !!data;
    },

    async adminUsers() {
      const { data, error } = await sb.from('profiles').select('*').order('last_seen', { ascending: false });
      if (error) throw error;
      return data;
    },
    // roles: only the owner changes them; a management role needs the roles password → 'ok' | 'bad_password' | 'locked' | 'no_role_password'
    async adminSetRole(id, role, password) {
      const { data, error } = await sb.rpc('admin_set_role', { target: id, new_role: role, p_password: password || null });
      if (error) throw error;
      return data || 'ok';
    },
    async myAccess() { const { data, error } = await sb.rpc('my_access'); if (error) throw error; return data; },
    async roles() { const { data, error } = await sb.from('roles').select('id,name,perms').order('created_at'); if (error) throw error; return data; },
    async ownerSaveRole(id, name, perms) { const { error } = await sb.rpc('owner_save_role', { p_id: id, p_name: name, p_perms: perms }); if (error) throw error; },
    async ownerDeleteRole(id) { const { error } = await sb.rpc('owner_delete_role', { p_id: id }); if (error) throw error; },
    async ownerRolePasswordSet() { const { data, error } = await sb.rpc('owner_role_password_set'); if (error) throw error; return !!data; },
    async ownerSetRolePassword(newPw, oldPw) {
      const { data, error } = await sb.rpc('owner_set_role_password', { p_new: newPw, p_old: oldPw || null });
      if (error) throw error;
      return data || 'ok';
    },
    async adminSetBlocked(id, blocked) { const { error } = await sb.rpc('admin_set_blocked', { target: id, is_blocked: blocked }); if (error) throw error; },
    async adminGrantCredits(id, amount, note) {
      const { data, error } = await sb.rpc('admin_grant_credits', { target: id, p_amount: amount, p_note: note || null });
      if (error) throw error;
      return data;
    },
    async adminSetPlan(id, plan, months) {
      const { error } = await sb.rpc('admin_set_plan', { target: id, p_plan: plan, p_months: months || 1 });
      if (error) throw error;
    },
    async adminLedger(userId, limit = 50) {
      let q = sb.from('credit_ledger').select('id,user_id,delta,balance,reason,ref,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
      if (userId) q = q.eq('user_id', userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    // webhook deliveries from the payment provider (admins only, enforced by RLS)
    async adminPayEvents(limit = 20) {
      const { data, error } = await sb.from('pay_events').select('id,key,event,user_id,test,result,created_at').order('id', { ascending: false }).limit(limit);
      if (error) throw error;
      return data;
    },

    // the assistant (assets/assistant.js → functions/api/assistant.js) sends the session's access token; the Function
    // checks it with Supabase Auth and spends one message of the daily quota (supabase/assistant.sql)
    async accessToken() {
      if (!sb) return null;
      let { data } = await sb.auth.getSession();
      let s = data && data.session;
      if (s && s.expires_at && s.expires_at * 1000 < Date.now() + 60000) {
        try { const r = await sb.auth.refreshSession(); if (r.data && r.data.session) s = r.data.session; } catch (e) {}
      }
      return s ? s.access_token : null;
    },
    // today's messages left without spending one: {ok, left, limit} (left/limit null = unlimited)
    async assistantStatus() {
      const { data, error } = await sb.rpc('assistant_status');
      if (error) throw error;
      return data;
    },

    /* ---------- acct: two-factor authentication (Supabase Auth MFA, TOTP) ---------- */
    // [{id, name, status: 'verified'|'unverified', created_at}]
    async mfaFactors() {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) throw error;
      return ((data && data.all) || []).filter(f => f.factor_type === 'totp').map(f => ({ id: f.id, name: f.friendly_name || '', status: f.status, created_at: f.created_at }));
    },
    // a new authenticator → {id, qr (data:image/svg+xml…), secret, uri}; left-over unverified factors are removed first
    async mfaEnroll(name) {
      try { for (const f of await B.mfaFactors()) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id }); } catch (e) {}
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: String(name || 'Chord Room').slice(0, 40) + ' ' + Date.now().toString(36) });
      if (error) mapAuthError(error);
      return { id: data.id, qr: data.totp && data.totp.qr_code, secret: data.totp && data.totp.secret, uri: data.totp && data.totp.uri };
    },
    // the 6-digit code from the app → the session becomes aal2 (also used to finish enrolment and after a re-authentication)
    async mfaVerify(factorId, code) {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: String(code).trim() });
      if (error) { const e = new Error(error.message); e.code = /invalid|expired|code/i.test(error.message || '') ? 'otp' : 'generic'; throw e; }
      B.reauthDone();
    },
    async mfaUnenroll(factorId) {
      const { error } = await sb.auth.mfa.unenroll({ factorId });
      if (error) mapAuthError(error);
      try { await sb.auth.refreshSession(); } catch (e) {}
    },
    mfaPendingInfo() { return B.mfaPending ? { email: B.mfaPending.user.email || '', factors: B.mfaPending.factors.length } : null; },
    // the sign-in's second step (B.mfaPending): verify → SIGNED_IN for the app
    async mfaSignInVerify(code) {
      const p = B.mfaPending; if (!p || !p.factors.length) fail('mfa');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: p.factors[0].id, code: String(code).trim() });
      if (error) { const e = new Error(error.message); e.code = /invalid|expired|code/i.test(error.message || '') ? 'otp' : 'generic'; throw e; }
      const { data } = await sb.auth.getSession(); if (B._gate) B._gate('SIGNED_IN', data.session || null);
    },
    async mfaAbort() { B.mfaPending = null; try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} },

    /* ---------- acct: delete an account (schema.sql [A-6]) ---------- */
    // remove every file of <bucket>/<uid>/ through the Storage API (SQL deletes on storage.objects are refused by Supabase)
    async removeFolder(bucket, uid, onFile) {
      for (let round = 0; round < 60; round++) {
        const { data, error } = await backoff(() => sb.storage.from(bucket).list(uid, { limit: 1000 }));
        if (error) throw error;
        const names = (data || []).filter(x => x && x.name && x.id !== null && !/[\\/]/.test(x.name)).map(x => `${uid}/${x.name}`);
        if (!names.length) return;
        for (let i = 0; i < names.length; i += 100) {
          const { error: e2 } = await backoff(() => sb.storage.from(bucket).remove(names.slice(i, i + 100)));
          if (e2) throw e2;
          if (onFile) onFile(Math.min(names.length, i + 100));
        }
      }
    },
    // → {ok:true} | {ok:false, why: owner|subscription|confirm|reauth|mfa|files_left|not_found}
    async deleteMyAccount(confirm, onStep) {
      const uid = B.user.id;
      if (onStep) onStep('files');
      await B.removeFolder('uploads', uid); await B.removeFolder('avatars', uid);
      if (onStep) onStep('account');
      const { data, error } = await sb.rpc('delete_my_account', { p_confirm: String(confirm || '').slice(0, 80) });
      if (error) throw error;
      if (data && data.ok) { B._reauth = false; B.mfaPending = null; try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {} }
      return data || { ok: false, why: 'generic' };
    },
    // owner / full admin: another account → {ok} | {ok:false, why: self|owner|staff|subscription|confirm|files_left|not_found}
    async adminDeleteUser(target, confirm) {
      await B.removeFolder('uploads', target); await B.removeFolder('avatars', target);
      const { data, error } = await sb.rpc('admin_delete_user', { target, p_confirm: String(confirm || '').slice(0, 80) });
      if (error) throw error;
      return data || { ok: false, why: 'generic' };
    },

    /* ---------- acct: offensive words (schema.sql [A-4]) ---------- */
    // may this text be shown to others? (null = the check is not installed yet)
    async textOk(text) {
      const { data, error } = await backoff(() => sb.rpc('text_ok', { p_text: String(text || '').slice(0, 2000) }));
      if (error) { if (/does not exist|could not find|schema cache|PGRST20/i.test(error.message || '')) return null; throw error; }
      return data !== false;
    },
    async blockedWords() { const { data, error } = await sb.rpc('admin_blocked_words'); if (error) throw error; return data || []; },
    async blockedWordSet(word, mode, on) {
      const { data, error } = await sb.rpc('admin_blocked_word_set', { p_word: String(word || '').slice(0, 80), p_mode: mode || 'word', p_on: on !== false });
      if (error) throw error;
      return data || { ok: false };
    }
  };

  // tests inject a mock backend — honoured only on localhost (an element with id="__MOCK_BACKEND" also shows up on window)
  const mock = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && window.__MOCK_BACKEND;
  window.Backend = mock && typeof mock === 'object' && !(mock instanceof Node) ? mock : B;
})();
