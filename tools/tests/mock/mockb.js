// Mock backend for the UI tests (window.__MOCK_BACKEND, honoured by assets/backend.js only on localhost/127.0.0.1).
// Served as an external script (/__test/mock.js) so it works under the real CSP (no inline scripts).
// In-memory users/profiles/songs; window.__mock exposes them to tests. A second account is pre-seeded:
//   dana@example.com / password1  (username dana_beats, plain user, profile language en)
// Signing up with the username "oshri" makes an admin (like the first real account).
// Per-test additions go AFTER this file (lib.mock_js(extra)) and may override any method.
(() => {
  const users = [], profiles = [], songs = [];
  let cfg = { id: 1, title: '', announce: '', lang: 'he', ai: true, dl: true, require_login: false, allow_signup: true };
  let cb = null, cur = null;
  const fail = c => { const e = new Error(c); e.code = c; throw e; };
  const now = () => new Date().toISOString();
  const me = () => profiles.find(p => p.id === cur.id);
  const B = {
    enabled: true, user: null, USERNAME_RE: /^[A-Za-z0-9_.-]{3,24}$/,
    async init(on) { cb = on; window.__cb = on; on('INITIAL', null); },
    async usernameFree(u) { return !profiles.some(p => p.username.toLowerCase() === String(u).toLowerCase()); },
    async signUp({ username, email, password, terms }) {
      if (!B.USERNAME_RE.test(username)) fail('user'); if (password.length < 8) fail('short');
      if (profiles.some(p => p.username === username)) fail('taken'); if (users.some(u => u.email === email)) fail('exists');
      const u = { id: 'u' + (users.length + 1), email, password, created_at: now() }; users.push(u);
      profiles.push({ id: u.id, username, email, display_name: username, bio: '', avatar_url: '', lang: 'he', role: username === 'oshri' ? 'admin' : 'user',
        blocked: false, songs: 0, seps: 0, created_at: now(), last_seen: now(), terms_version: terms && terms.version, terms_at: terms && terms.at });
      cur = u; B.user = u; cb('SIGNED_IN', u); return { needsConfirm: false };
    },
    async signIn({ email, password }) { const u = users.find(x => x.email === email && x.password === password); if (!u) fail('login'); cur = u; B.user = u; cb('SIGNED_IN', u); },
    async signOut() { cur = null; B.user = null; cb('SIGNED_OUT', null); },
    async sendReset() {}, async setPassword(p) { if (p.length < 8) fail('short'); cur.password = p; },
    async changePassword(c, n) { if (cur.password !== c) fail('curpass'); if (n.length < 8) fail('short'); cur.password = n; },
    async changeEmail() {},
    async getProfile() { return { ...me() }; },
    async updateProfile(patch) { if (patch.username !== undefined && !B.USERNAME_RE.test(patch.username)) fail('user'); const p = me(); Object.assign(p, patch); return { ...p }; },
    async touch() { me().last_seen = now(); },
    async uploadAvatar() { return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#c33"/></svg>'); },
    async bumpSeps() { me().seps++; },
    async listSongs() { return songs.filter(s => s.user_id === cur.id).map(s => s.data); },
    async saveSong(item) { const i = songs.findIndex(s => s.user_id === cur.id && s.name === item.name); if (i >= 0) songs[i].data = item; else songs.push({ user_id: cur.id, name: item.name, data: item }); me().songs = songs.filter(s => s.user_id === cur.id).length; },
    async deleteSong(name) { const i = songs.findIndex(s => s.user_id === cur.id && s.name === name); if (i >= 0) songs.splice(i, 1); },
    async getConfig() { return { ...cfg }; }, async saveConfig(c) { cfg = { ...cfg, ...c }; }, onConfig() {},
    async catalogGet(ids) { return (window.__cat || []).filter(c => ids.includes(c.id)); },
    async catalogList(o, l) { return [...(window.__cat || [])].sort((a, b) => o === 'plays' ? b.plays - a.plays : (b.created_at > a.created_at ? 1 : -1)).slice(0, l); },
    async catalogAdd(r) { (window.__cat = window.__cat || []).push({ ...r, plays: 0, created_at: now() }); },
    async catalogSetFull(id, a) { const c = (window.__cat || []).find(x => x.id === id); if (!c || c.is_full) return false; Object.assign(c, { bpm: a.bpm, key_pc: a.pc, key_mode: a.mode, chords: a.chords, is_full: true }); return true; },
    async catalogPlay(id) { const c = (window.__cat || []).find(x => x.id === id); if (c) c.plays++; },
    async uploadSongFile(file, key) { const p = cur.id + '/' + key + '.mp3'; window.__files = window.__files || {}; window.__files[p] = URL.createObjectURL(file); return { file_path: p, file_size: file.size, file_type: file.type || 'audio/mpeg' }; },
    async songFileUrl(p) { return (window.__files || {})[p]; },
    async logDownload(e) { (window.__dls = window.__dls || []).push({ ...e, user_id: cur.id, created_at: now() }); },
    async adminSongs(uid) { return songs.filter(x => !uid || x.user_id === uid).map(x => ({ user_id: x.user_id, name: x.name, genre: x.data.genre || '', bpm: x.data.bpm, key_pc: x.data.key && x.data.key.pc, key_mode: x.data.key && x.data.key.mode, duration: x.data.dur, file_path: x.data.file_path || null, file_size: x.data.file_size || null, file_type: x.data.file_type, created_at: now() })); },
    async adminDownloads(uid) { return (window.__dls || []).filter(x => !uid || x.user_id === uid); },
    async adminUsers() { return profiles.map(p => ({ ...p })); },
    async adminSetRole(id, r) { profiles.find(p => p.id === id).role = r; return 'ok'; },
    async adminSetBlocked(id, b) { profiles.find(p => p.id === id).blocked = b; },
    // points & plans, referrals, activity, access — neutral defaults (tests override what they exercise)
    async credits() { return { credits: 50, plan: 'free', plan_until: null, last_refill: null }; },
    async refillCredits() { return 0; }, async ledger() { return []; },
    async spendCredits() { return { balance: 45, id: 1 }; }, async refundCredits() { return 50; },   // refund_credits(id) → new balance
    async myReferral() { return { code: 'abc12345', invited: 0, earned: 0 }; }, async claimReferral() { return { ok: false }; },
    async logActivity(a, d) { (window.__log = window.__log || []).push({ user_id: B.user && B.user.id, action: a, detail: d, created_at: now() }); },
    async adminActivity(uid) { return (window.__log || []).filter(x => !uid || x.user_id === uid).slice().reverse(); },
    async adminPayEvents() { return []; },
    async myAccess() { const p = cur && me(); const admin = p && p.role === 'admin';
      return { owner: !!(p && p.owner), role: p ? p.role : 'user', panel: !!admin, perms: admin ? ['users', 'block', 'credits', 'songs', 'activity', 'settings', 'payments', 'catalog'] : [] }; },
    // assistant
    async accessToken() { return B.user ? 'tok-' + B.user.id : null; },
    async assistantStatus() { return window.__rmStatus || { ok: true, left: 30, limit: 30 }; }
  };
  window.__MOCK_BACKEND = B; window.__mock = { users, profiles, songs, get cfg() { return cfg; } };
  users.push({ id: 'u0', email: 'dana@example.com', password: 'password1', created_at: now() });
  profiles.push({ id: 'u0', username: 'dana_beats', email: 'dana@example.com', display_name: 'Dana', bio: '', avatar_url: '', lang: 'en', role: 'user', blocked: false, songs: 3, seps: 1, created_at: now(), last_seen: now() });
})();
