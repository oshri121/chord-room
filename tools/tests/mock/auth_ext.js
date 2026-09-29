// Auth extensions for the mock backend (load after mockb.js): e-mail confirmation with 6-digit codes, resend,
// recovery by code, username check with latency. Knobs (set before this script runs, via lib.mock_js(pre=...)):
//   window.__confirm = true (default) → sign-up needs the code 123456 (after a resend: 222222); false → signed in at once
// Recovery code: 654321. Setting the password "password1" on reset fails with 'same'.
(() => {
  const B = window.__MOCK_BACKEND, M = window.__mock;
  const fail = (c, w) => { const e = new Error(c); e.code = c; if (w) e.wait = w; throw e; };
  window.__confirm = window.__confirm ?? true; window.__resends = 0; window.__codes = {};
  const unconf = new Set();
  const cred = {};
  B.credits = async () => ({ credits: cred[B.user.id] ?? 20, plan: 'free', plan_until: null, last_refill: null });
  B.usernameFree = async u => { await new Promise(r => setTimeout(r, 150)); return !M.profiles.some(p => p.username.toLowerCase() === u.toLowerCase()); };
  const origUp = B.signUp;
  B.signUp = async a => {
    window.__signupArgs = JSON.parse(JSON.stringify(a));
    if (M.users.some(u => u.email === a.email)) fail('exists');
    if (!window.__confirm) return origUp(a);
    if (!B.USERNAME_RE.test(a.username)) fail('user'); if (a.password.length < 8) fail('short');
    const u = { id: 'u' + (M.users.length + 1), email: a.email, password: a.password, created_at: new Date().toISOString() }; M.users.push(u); unconf.add(u.email);
    M.profiles.push({ id: u.id, username: a.username, email: a.email, display_name: a.username, bio: '', avatar_url: '', lang: 'he', role: 'user', blocked: false, songs: 0, seps: 0,
      created_at: u.created_at, last_seen: u.created_at, terms_version: a.terms && a.terms.version, terms_at: a.terms && a.terms.at });
    window.__codes[a.email] = '123456'; return { needsConfirm: true };
  };
  B.verifySignup = async (email, tok) => { await new Promise(r => setTimeout(r, 200)); if (window.__codes[email] !== tok) fail('otp'); unconf.delete(email); const u = M.users.find(x => x.email === email); await B.signIn({ email, password: u.password }); };
  B.resendSignup = async email => { window.__resends++; window.__codes[email] = '222222'; };
  const origIn = B.signIn;
  B.signIn = async a => { if (unconf.has(a.email)) { const u = M.users.find(x => x.email === a.email && x.password === a.password); if (u) fail('confirm'); } return origIn(a); };
  B.sendRecoveryCode = async email => { window.__rec = email; };
  B.verifyRecovery = async (email, tok) => { if (tok !== '654321') fail('otp'); const u = M.users.find(x => x.email === email); await origIn({ email, password: u.password }); window.__cb('PASSWORD_RECOVERY', u); };
  const origSet = B.setPassword; B.setPassword = async p => { if (p === 'password1') fail('same'); return origSet(p); };
})();
