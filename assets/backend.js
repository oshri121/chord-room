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
  function mapAuthError(err) {
    const m = String(err && err.message || err || '');
    if (/invalid login credentials/i.test(m)) return fail('login', m);
    if (/email not confirmed/i.test(m)) return fail('confirm', m);
    if (/signups not allowed|signup is disabled/i.test(m)) return fail('closed', m);
    if (/password should be at least/i.test(m)) return fail('short', m);
    if (/profiles_username_key|username.*(taken|exists)|duplicate key/i.test(m)) return fail('taken', m);
    return fail('generic', m);
  }

  const B = {
    enabled,
    client: sb,
    user: null,
    USERNAME_RE,

    async init(onChange) {
      if (!enabled) return;
      sb.auth.onAuthStateChange((event, session) => {
        B.user = session ? session.user : null;
        onChange(event, B.user);
      });
      const { data } = await sb.auth.getSession();
      B.user = data.session ? data.session.user : null;
      onChange('INITIAL', B.user);
    },

    async usernameFree(username) {
      const { data, error } = await sb.rpc('username_available', { u: username });
      if (error) return true;
      return !!data;
    },
    async signUp({ username, email, password }) {
      if (!USERNAME_RE.test(username)) fail('user');
      if (password.length < 8) fail('short');
      if (!(await B.usernameFree(username))) fail('taken');
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { username }, emailRedirectTo: location.origin + location.pathname }
      });
      if (error) mapAuthError(error);
      return { needsConfirm: !data.session };
    },
    async signIn({ email, password }) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) mapAuthError(error);
    },
    async signOut() { await sb.auth.signOut(); },
    async sendReset(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) mapAuthError(error);
    },
    async setPassword(password) {
      if (password.length < 8) fail('short');
      const { error } = await sb.auth.updateUser({ password });
      if (error) mapAuthError(error);
    },
    async changePassword(current, next) {
      if (next.length < 8) fail('short');
      const { error: e1 } = await sb.auth.signInWithPassword({ email: B.user.email, password: current });
      if (e1) fail('curpass');
      await B.setPassword(next);
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
      if (error) { if (/duplicate key|profiles_username_key/.test(error.message)) fail('taken'); throw error; }
      return data;
    },
    async touch() {
      await sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', B.user.id);
    },
    async uploadAvatar(blob) {
      const path = `${B.user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      return sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    },
    async bumpSeps() { await sb.rpc('bump_seps'); },

    async listSongs() {
      const { data, error } = await sb.from('songs').select('name,data,updated_at').eq('user_id', B.user.id).order('updated_at', { ascending: false });
      if (error) throw error;
      return data.map(r => r.data);
    },
    async saveSong(item) {
      const { error } = await sb.from('songs').upsert({ user_id: B.user.id, name: item.name, data: item, updated_at: new Date().toISOString() }, { onConflict: 'user_id,name' });
      if (error) throw error;
    },
    async deleteSong(name) {
      const { error } = await sb.from('songs').delete().eq('user_id', B.user.id).eq('name', name);
      if (error) throw error;
    },

    async getConfig() {
      const { data } = await sb.from('site_config').select('*').eq('id', 1).maybeSingle();
      return data || {};
    },
    async saveConfig(c) {
      const row = { id: 1, title: c.title, announce: c.announce, lang: c.lang, ai: c.ai, dl: c.dl, require_login: c.require_login, allow_signup: c.allow_signup, updated_at: new Date().toISOString() };
      const { error } = await sb.from('site_config').upsert(row);
      if (error) throw error;
    },
    onConfig(cb) {
      return sb.channel('site_config').on('postgres_changes', { event: '*', schema: 'public', table: 'site_config' }, p => cb(p.new || {})).subscribe();
    },

    async adminUsers() {
      const { data, error } = await sb.from('profiles').select('*').order('last_seen', { ascending: false });
      if (error) throw error;
      return data;
    },
    async adminSetRole(id, role) { const { error } = await sb.rpc('admin_set_role', { target: id, new_role: role }); if (error) throw error; },
    async adminSetBlocked(id, blocked) { const { error } = await sb.rpc('admin_set_blocked', { target: id, is_blocked: blocked }); if (error) throw error; }
  };

  window.Backend = window.__MOCK_BACKEND || B;
})();
