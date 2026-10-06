// Mock backend for the security tests: every field another user / an admin / a third party could write holds an
// XSS payload. window.__fired lists payloads that EXECUTED; the test also scans the DOM for injected markup.
(() => {
  window.__fired = [];
  window.__xss = t => { window.__fired.push(t); };
  const P = t => `<img src=x onerror="__xss('${t}')">`;
  const Q = t => `x"><img src=x onerror="__xss('${t}')">`;   // attribute break-out
  const now = () => new Date().toISOString();
  const fail = c => { const e = new Error(c); e.code = c; throw e; };
  const users = [], profiles = [], songs = [];
  const evilBilling = {
    on: true, signup: Q('billing.signup'), currency: 'ILS', contact: "javascript:__xss('billing.contact')", referral: 10,
    costs: { sep: Q('billing.cost.sep'), stems: 3 },
    plans: [{ id: 'pro', price: 29, points: 300, link: '' }, { id: Q('plan.id'), price: Q('plan.price'), points: Q('plan.points'), link: "javascript:__xss('plan.link')" }]
  };
  let cfg = { id: 1, title: P('cfg.title'), announce: P('cfg.announce'), lang: 'he', ai: true, dl: true, require_login: false, allow_signup: true, billing: evilBilling };
  cfg.analytics = { ga4: "G-1234'><img src=x onerror=\"__xss('ga4')\">", clarity: "javascript:__xss('clarity')", gsc: Q('gsc') };   // growth
  cfg.experiments = [{ id: 'home_cta', on: true, variants: ['a', Q('exp.variant')], conversion: P('exp.conv'), note: P('exp.note') }, { id: Q('exp.id'), on: true, variants: ['a', 'b'] }];
  let cb = null, cur = null;
  const cat = [];
  for (let i = 0; i < 3; i++) cat.push({ id: 'dz:' + (1000 + i), ext_id: 1000 + i, title: P('cat.title' + i), artist: P('cat.artist' + i), album: P('cat.album'),
    cover: i === 0 ? 'https://evil.example/pixel.gif?who=admin' : i === 1 ? "javascript:__xss('cat.cover')" : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    link: "javascript:__xss('cat.link')", release_date: '2026-01-01', duration: 30, bpm: 120, key_pc: 9, key_mode: 1, chords: [P('cat.chord'), 0, 5], plays: 5 - i, is_full: false, created_at: now() });
  cat.push({ id: 'dz:2000', ext_id: 2000, title: P('cat.only'), artist: P('cat.only.artist'), cover: 'https://evil.example/x.png', link: 'https://evil.example/', bpm: 122, key_pc: 0, key_mode: 0, chords: [], plays: 9, created_at: now() });
  window.__cat = cat;
  const B = {
    enabled: true, user: null, USERNAME_RE: /^[A-Za-z0-9_.-]{3,24}$/,
    async init(on) { cb = on; on('INITIAL', null); },
    async usernameFree() { return true; },
    async signUp({ username, email, password }) { const u = { id: 'u' + (users.length + 1), email, password, created_at: now() }; users.push(u);
      profiles.push({ id: u.id, username, email, display_name: username, bio: '', avatar_url: '', lang: 'he', role: 'user', blocked: false, songs: 0, seps: 0, created_at: now(), last_seen: now() });
      cur = u; B.user = u; cb('SIGNED_IN', u); return { needsConfirm: false }; },
    async signIn({ email, password }) { const u = users.find(x => x.email === email && x.password === password); if (!u) fail('login'); cur = u; B.user = u; cb('SIGNED_IN', u); },
    async signOut() { cur = null; B.user = null; cb('SIGNED_OUT', null); },
    async sendReset() {}, async setPassword() {}, async changePassword() {}, async changeEmail() {},
    async getProfile() { return { ...profiles.find(p => p.id === cur.id) }; },
    async updateProfile(patch) { const p = profiles.find(p => p.id === cur.id); Object.assign(p, patch); return { ...p }; },
    async touch() {}, async bumpSeps() {},
    async uploadAvatar() { return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#c33"/></svg>'); },
    async credits() { return { credits: 50, plan: 'free', plan_until: null, last_refill: null, pay_status: null, pay_portal: "javascript:__xss('pay_portal')" }; },
    async refillCredits() { return 0; },
    async spendCredits() { return { balance: 40, id: 1 }; }, async refundCredits() { return true; },
    async logActivity() {},
    async adminActivity() { return [{ id: 1, user_id: 'u0', action: 'visit', detail: P('act.detail'), created_at: now() }, { id: 2, user_id: 'u0', action: Q('act.action'), detail: 'x', created_at: now() }]; },
    async myReferral() { return { code: Q('ref.code'), invited: Q('ref.invited'), earned: 2 }; },
    async claimReferral() { return { ok: false }; },
    async ledger() { return [{ id: 1, delta: 5, balance: 50, reason: 'grant', ref: P('ledger.ref'), created_at: now() }, { id: 2, delta: 5, balance: 45, reason: 'payment', ref: 'ls:sub:1 ' + P('ledger.pay'), created_at: now() }]; },
    async adminLedger() { return B.ledger(); },
    async listSongs() { return songs.filter(s => s.user_id === cur.id).map(s => s.data); },
    async saveSong(item) { const i = songs.findIndex(s => s.user_id === cur.id && s.name === item.name); if (i >= 0) songs[i].data = item; else songs.push({ user_id: cur.id, name: item.name, data: item }); },
    async deleteSong() {},
    async uploadSongFile(file, key) { const p = cur.id + '/' + key + '.mp3'; return { file_path: p, file_size: file.size, file_type: file.type || 'audio/mpeg' }; },
    async songFileUrl() { return null; }, async logDownload() {},
    async adminSongs() { return [{ user_id: 'u0', name: P('song.name'), genre: P('song.genre'), bpm: 120, key_pc: 2, key_mode: 0, duration: 200, file_path: null, file_size: 1234567, file_type: 'audio/mpeg', created_at: now() }]; },
    async adminDownloads() { return [{ user_id: 'u0', song_name: P('dl.song'), files: ['a'], size: 1000, created_at: now() }]; },
    async getConfig() { return { ...cfg }; }, async saveConfig(c) { cfg = { ...cfg, ...c }; }, onConfig() {},
    async catalogGet(ids) { return cat.filter(c => ids.includes(c.id)); },
    async catalogList(o, l) { return [...cat].slice(0, l); },
    async catalogAdd() {}, async catalogSetFull() { return false; }, async catalogPlay() {},
    async adminUsers() { return profiles.map(p => ({ ...p })); },
    async adminSetRole() { return 'ok'; }, async adminSetBlocked() {},
    async myAccess() { const p = profiles.find(p => p.id === cur.id); return { owner: !!p.owner, panel: p.role !== 'user', perms: p.role === 'admin' ? ['users', 'block', 'credits', 'songs', 'activity', 'settings', 'payments', 'catalog'] : [] }; },
    async roles() { return [{ id: 'mod', name: P('role.name'), perms: ['users'] }]; },
    async ownerSaveRole() {}, async ownerDeleteRole() {}, async ownerRolePasswordSet() { return true; }, async ownerSetRolePassword() { return 'ok'; },
    async adminGrantCredits() { return 1; }, async adminSetPlan() {},
    async adminPayEvents() { return [{ id: 1, key: 'k', event: P('pay.event'), user_id: 'u0', test: true, result: P('pay.result'), created_at: now() }]; },
    // acct (accounts v4): hostile 2FA factors / enrolment data / blocked words / delete answers
    async mfaFactors() { return [{ id: Q('mfa.id'), name: P('mfa.name'), status: 'verified', created_at: Q('mfa.created') }]; },
    async mfaEnroll() { return { id: Q('mfa.enroll.id'), qr: "javascript:__xss('mfa.qr')", secret: P('mfa.secret'), uri: "javascript:__xss('mfa.uri')" }; },
    async mfaVerify() { fail('otp'); }, async mfaUnenroll() {},
    async blockedWords() { return [{ word: P('word'), mode: Q('word.mode'), lang: 'en', seeded: false }]; },
    async blockedWordSet() { return { ok: false, why: P('word.why') }; },
    async textOk() { return true; },
    async deleteMyAccount() { return { ok: false, why: P('delete.why') }; },
    async adminDeleteUser() { return { ok: false, why: Q('admdel.why') }; },
    async reauthPassword() {}, async checkPassword() {}, reauthDone() {},
    // growth: hostile analytics ids / experiments / reviews (never reach a URL, the DOM as markup, or a script)
    async saveGrowth() {}, async abResults() { return { experiment: 'home_cta', conversion: P('ab.conv'), variants: [{ variant: P('ab.variant'), assigned: Q('ab.n'), converted: 1, rate: Q('ab.rate') }] }; },
    async reviewsPublic() { return { count: 6, avg: Q('rev.avg'), items: [{ name: P('rev.name'), rating: 5, body: P('rev.body'), featured: true, lang: Q('rev.lang') }, { name: Q('rev.name2'), rating: Q('rev.rating'), body: Q('rev.body2'), featured: false }] }; },
    async myReview() { return { rating: Q('rev.my'), body: P('rev.mybody'), show_name: true, status: P('rev.status') }; },
    async reviewSubmit() { return { ok: false, error: P('rev.err') }; }, async reviewDelete() {},
    async adminReviews() { return [{ id: Q('rev.id'), rating: 4, body: P('rev.abody'), show_name: false, lang: P('rev.alang'), status: P('rev.astatus'), featured: false, username: P('rev.user'), display_name: P('rev.dname') }]; },
    async adminReviewSet() { return 'ok'; }
  };
  evilBilling.turnstile_site_key = Q('turnstile.key'); evilBilling.idle_minutes = Q('idle'); evilBilling.min_age = Q('min_age');
  window.__MOCK_BACKEND = B;
  users.push({ id: 'uo', email: 'owner@example.com', password: 'password1', created_at: now() });
  profiles.push({ id: 'uo', username: 'oshri', email: 'owner@example.com', display_name: 'Oshri', bio: '', avatar_url: '', lang: 'he', role: 'admin', owner: true, blocked: false, songs: 0, seps: 0, credits: 10, created_at: now(), last_seen: now() });
  users.push({ id: 'u0', email: 'eve@example.com', password: 'password1', created_at: now() });
  profiles.push({ id: 'u0', username: 'eve_x', email: Q('email') + '@x.com', display_name: P('display_name'), bio: P('bio'), avatar_url: 'https://evil.example/track.gif?admin-ip', lang: 'en', role: 'user', blocked: false,
    songs: Q('songs.count'), seps: Q('seps.count'), credits: Q('credits.count'), plan: Q('plan'), created_at: now(), last_seen: now() });
  profiles.push({ id: 'u9', username: 'mal', email: 'm@x.com', display_name: 'Mal', bio: '', avatar_url: "javascript:__xss('avatar')", lang: 'en', role: 'mod', blocked: false, songs: 1, seps: 0, created_at: now(), last_seen: now() });
})();
