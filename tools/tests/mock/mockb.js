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
  const me = () => { const p = profiles.find(p => p.id === cur.id); if (p && p.credits == null) { p.credits = 50; p.plan = p.plan || 'free'; } return p; };
  const ledger = [], charged = new Set(), reviews = [];
  const DEF_COSTS = { song: 1, sep: 5, stems: 2, usb: 1, mashup: 3, extended: 3, convert: 1 }, DEF_DISC = { basic: 0, pro: 10, studio: 25 };
  function price(p, kind, qty) {
    const b = cfg.billing || {}, costs = { ...DEF_COSTS, ...(b.costs || {}) };
    if (!(kind in costs)) fail('bad kind'); if (!(qty >= 1 && qty <= 500)) fail('bad qty');
    const unit = Math.max(0, Math.min(100, parseInt(costs[kind], 10) || 0));
    const active = p.plan && p.plan !== 'free' && p.plan_until && Date.parse(p.plan_until) > Date.now();
    const pl = (b.plans || []).find(x => x.id === p.plan), d = !active ? 0 : Math.max(0, Math.min(90, parseInt(pl ? pl.discount : DEF_DISC[p.plan], 10) || 0));
    return { unit, qty, discount: d, total: Math.ceil(unit * qty * (100 - d) / 100), free: b.on === false || p.role === 'admin' || !!p.owner };
  }
  function row(p, delta, reason, ref, kind, qty) {
    const r = { id: ledger.length + 1, user_id: p.id, delta, balance: p.credits, reason, ref, kind, qty, refunded: 0, created_at: now() }; ledger.push(r); return r;
  }
  const B = {
    enabled: true, user: null, USERNAME_RE: /^[A-Za-z0-9_.-]{3,24}$/,
    async init(on) { cb = on; window.__cb = on; on('INITIAL', null); },
    async usernameFree(u) { return !profiles.some(p => p.username.toLowerCase() === String(u).toLowerCase()); },
    async signUp({ username, email, password, terms }) {
      if (!B.USERNAME_RE.test(username)) fail('user'); if (password.length < 8) fail('short');
      if (profiles.some(p => p.username === username)) fail('taken'); if (users.some(u => u.email === email)) fail('exists');
      const u = { id: 'u' + (users.length + 1), email, password, created_at: now() }; users.push(u);
      profiles.push({ id: u.id, username, email, display_name: username, bio: '', avatar_url: '', lang: 'he', role: username === 'oshri' ? 'admin' : 'user',
        blocked: false, songs: 0, seps: 0, credits: 50, plan: 'free', plan_until: null, created_at: now(), last_seen: now(), terms_version: terms && terms.version, terms_at: terms && terms.at });
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
    // points & plans (same rules as schema.sql "Points v2"): every account starts with 50 points (window.__mock.setCredits),
    // prices from cfg.billing (or the defaults), plan discount while plan_until is in the future, admins free.
    async credits() { const p = me(); return { credits: p.credits, plan: p.plan || 'free', plan_until: p.plan_until || null, last_refill: null }; },
    async refillCredits() { return me().credits; },
    async ledger(n) { return ledger.filter(r => r.user_id === cur.id).slice().reverse().slice(0, n || 30); },
    async spendCredits(kind, ref) { return B.spendN(kind, 1, ref); },
    async refundCredits(id) {   // refund_credits(id): own 'sep' row, once → new balance
      const p = me(), r = ledger.find(x => x.id === id && x.user_id === cur.id && x.reason === 'spend' && x.kind === 'sep');
      if (!r) fail('not refundable'); if (ledger.some(x => x.ref === 'refund:' + id)) return p.credits;
      p.credits -= r.delta; row(p, -r.delta, 'refund', 'refund:' + id, 'sep', 1); return p.credits; },
    async quote(kind, qty) { const p = me(), q = price(p, kind, qty); return { ...q, total: q.free ? 0 : q.total, balance: p.credits, plan: p.plan || 'free' }; },
    async spendN(kind, qty, ref) {
      const p = me(), q = price(p, kind, qty);
      if (q.free || q.total <= 0) return { balance: p.credits, id: null, charged: 0, unit: q.unit, qty, discount: q.discount, free: true };
      if (p.credits < q.total) fail('insufficient');
      p.credits -= q.total; const r = row(p, -q.total, 'spend', `${kind} ×${qty}${ref ? ' ' + ref : ''}`, kind, qty);
      return { balance: p.credits, id: r.id, charged: q.total, unit: q.unit, qty, discount: q.discount, free: false }; },
    async refundN(id, qty) {
      const p = me(), r = ledger.find(x => x.id === id && x.user_id === cur.id && x.reason === 'spend' && x.qty && !['sep', 'song', 'stems'].includes(x.kind));
      if (!r) fail('not refundable'); if (!(qty >= 1) || r.refunded + qty > r.qty) fail('over refund');
      const amt = Math.floor(-r.delta * (r.refunded + qty) / r.qty) - Math.floor(-r.delta * r.refunded / r.qty);
      r.refunded += qty; if (amt > 0) { p.credits += amt; row(p, amt, 'refund', `refundn:${id}:${qty}`, r.kind, qty); }
      return { balance: p.credits, refunded: amt, left: r.qty - r.refunded }; },
    async spendSong(key, ref) {
      const p = me(), k = cur.id + '|' + key;
      if (charged.has(k)) return { balance: p.credits, id: null, charged: 0, qty: 1, already: true, free: true };
      const r = await B.spendN('song', 1, ref || key); charged.add(k); return { ...r, already: false }; },
    async chargedSongs(keys) { return (keys || []).filter(k => charged.has(cur.id + '|' + k)); },
    async myReferral() { return { code: 'abc12345', invited: 0, earned: 0 }; }, async claimReferral() { return { ok: false }; },
    async logActivity(a, d) { (window.__log = window.__log || []).push({ user_id: B.user && B.user.id, action: a, detail: d, created_at: now() }); },
    async adminActivity(uid) { return (window.__log || []).filter(x => !uid || x.user_id === uid).slice().reverse(); },
    async adminPayEvents() { return []; },
    async myAccess() { const p = cur && me(); const admin = p && p.role === 'admin';
      return { owner: !!(p && p.owner), role: p ? p.role : 'user', panel: !!admin, perms: admin ? ['users', 'block', 'credits', 'songs', 'activity', 'settings', 'payments', 'catalog'] : [] }; },
    // growth ([growth-v4]): analytics ids / experiments, A/B results from the activity log, reviews (same rules, simplified)
    async saveGrowth(p) { const m = cur && me(); if (!m || m.role !== 'admin') fail('denied'); if (p.analytics) cfg = { ...cfg, analytics: p.analytics }; if (p.experiments) cfg = { ...cfg, experiments: p.experiments }; },
    async abResults(exp, conv) {
      const log = window.__log || [], e = (cfg.experiments || []).find(x => x.id === exp), c = conv || (e && e.conversion) || null, first = {};
      log.forEach((r, i) => { if (r.action === 'ab_assign' && String(r.detail).split(':')[0] === exp && !(r.user_id in first)) first[r.user_id] = { v: String(r.detail).split(':')[1], i }; });
      const by = {};
      for (const [u, a] of Object.entries(first)) { const o = by[a.v] = by[a.v] || { variant: a.v, assigned: 0, converted: 0 }; o.assigned++; if (c && log.some((r, j) => j > a.i && r.user_id === u && r.action === c)) o.converted++; }
      return { experiment: exp, conversion: c, days: 90, variants: Object.values(by).sort((a, b) => a.variant < b.variant ? -1 : 1).map(o => ({ ...o, rate: o.assigned ? Math.round(o.converted * 1000 / o.assigned) / 10 : 0 })) };
    },
    async reviewsPublic(limit) {
      const ok = reviews.filter(r => r.status === 'approved'), avg = ok.length ? Math.round(ok.reduce((a, r) => a + r.rating, 0) / ok.length * 100) / 100 : 0;
      const items = ok.slice().sort((a, b) => (b.featured - a.featured) || (b.created_at > a.created_at ? 1 : -1)).slice(0, limit || 12).map(r => {
        const p = profiles.find(x => x.id === r.user_id) || {}, n = (p.display_name || '').trim() || p.username || '?';
        return { name: r.show_name ? n.slice(0, 40) : n[0].toUpperCase() + '.', rating: r.rating, body: r.body, featured: r.featured, lang: r.lang, created_at: r.created_at }; });
      return { count: ok.length, avg, items };
    },
    async myReview() { const r = cur && reviews.find(x => x.user_id === cur.id); return r ? { rating: r.rating, body: r.body, show_name: r.show_name, status: r.status, featured: r.featured, updated_at: r.updated_at } : null; },
    async reviewSubmit({ rating, body, showName, lang }) {
      if (!cur) return { ok: false, error: 'auth' };
      const used = (window.__log || []).some(r => r.user_id === cur.id && /^(export|separate|mashup_export|extended_export|crate_export|convert)$/.test(r.action)) || (window.__dls || []).some(d => d.user_id === cur.id);
      if (!used) return { ok: false, error: 'not_eligible' };
      if (!(rating >= 1 && rating <= 5)) return { ok: false, error: 'bad_rating' };
      body = String(body || '').replace(/[\u0000-\u001f]+/g, ' ').trim();
      if (body.length > 400) return { ok: false, error: 'too_long' };
      if (/https?:\/\/|www\.|[a-z0-9-]+\.(com|net|org|io|co|il|ru|me|ly)(\/|\s|$)/i.test(body)) return { ok: false, error: 'links' };
      if (/(^|[\s.,!?])(shit|fuck|מניאק|זונה)($|[\s.,!?])/i.test(body)) return { ok: false, error: 'offensive' };
      let r = reviews.find(x => x.user_id === cur.id);
      if (!r) { r = { id: reviews.length + 1, user_id: cur.id, created_at: now(), edits: 0 }; reviews.push(r); }
      if (r.edits >= 5) return { ok: false, error: 'rate' };
      Object.assign(r, { rating, body, show_name: !!showName, lang: lang || null, status: 'pending', featured: false, updated_at: now() }); r.edits++;
      return { ok: true, status: 'pending' };
    },
    async reviewDelete() { const i = reviews.findIndex(x => cur && x.user_id === cur.id); if (i >= 0) reviews.splice(i, 1); },
    async adminReviews(status) { return reviews.filter(r => !status || r.status === status).map(r => { const p = profiles.find(x => x.id === r.user_id) || {}; return { ...r, username: p.username, display_name: p.display_name }; }); },
    async adminReviewSet(id, status, featured) { const r = reviews.find(x => x.id === id); if (!r) return 'missing'; r.status = status; r.featured = status === 'approved' && !!featured; return 'ok'; },
    // assistant
    async accessToken() { return B.user ? 'tok-' + B.user.id : null; },
    async assistantStatus() { return window.__rmStatus || { ok: true, left: 30, limit: 30 }; }
  };
  window.__MOCK_BACKEND = B; window.__mock = { users, profiles, songs, ledger, charged, reviews, get cfg() { return cfg; }, setCfg(c) { cfg = { ...cfg, ...c }; },
    setCredits(n, uid) { const p = profiles.find(x => x.id === (uid || (cur && cur.id))); if (p) p.credits = n; },
    setPlan(plan, days, uid) { const p = profiles.find(x => x.id === (uid || (cur && cur.id))); if (p) { p.plan = plan; p.plan_until = plan === 'free' ? null : new Date(Date.now() + days * 864e5).toISOString(); } } };
  users.push({ id: 'u0', email: 'dana@example.com', password: 'password1', created_at: now() });
  profiles.push({ id: 'u0', username: 'dana_beats', email: 'dana@example.com', display_name: 'Dana', bio: '', avatar_url: '', lang: 'en', role: 'user', blocked: false, songs: 3, seps: 1, credits: 50, plan: 'free', plan_until: null, created_at: now(), last_seen: now() });
})();
