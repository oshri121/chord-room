// Accounts v4, assets/backend.js against a fake Supabase client (the UI tests use the mock backend, which replaces this
// file): Turnstile tokens reach every Auth call that needs one, a 2FA session at aal1 is held back from the app
// (MFA_REQUIRED + 'cr-mfa') until the code is verified, re-authentication keeps the user, sign-out scopes, the delete
// flow (Storage list/remove in chunks with backoff on 429, then the RPC, then a local sign-out), error mapping.
import { REPO } from './repo.mjs';
import fs from 'node:fs';
import vm from 'node:vm';

let ok = 0; const bad = [];
const check = (label, cond, info = '') => { if (cond) ok++; else bad.push(label); console.log(cond ? '  ok  ' : '  FAIL', label.padEnd(64), String(info).slice(0, 140)); };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = c => `x.${b64(c)}.y`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fake() {
  const F = { calls: [], subs: [], session: null, files: {}, rateOnce: 0, clients: 0, rpcResult: { ok: true } };
  const user = (factors) => ({ id: 'u1', email: 'u1@x', factors });
  const sess = (aal, factors) => ({ access_token: jwt({ sub: 'u1', aal }), user: user(factors) });
  const emit = (ev, s) => F.subs.forEach(cb => cb(ev, s));
  F.sess = sess; F.emit = emit;
  F.client = () => {
    F.clients++;
    const self = {
      auth: {
        onAuthStateChange(cb) { F.subs.push(cb); },
        async getSession() { return { data: { session: F.session } }; },
        async signInWithPassword(a) { F.calls.push(['signInWithPassword', a]); if (a.password !== 'pw') return { data: {}, error: { message: 'Invalid login credentials', code: 'invalid_credentials' } };
          if (a.options && a.options.captchaToken === 'BAD') return { data: {}, error: { message: 'captcha protection: request disallowed (captcha verification process failed)', status: 400 } };
          if (self.__tmp) return { data: { session: sess('aal1', []) }, error: null };
          F.session = sess('aal1', F.factors || []); emit('SIGNED_IN', F.session); return { data: { session: F.session }, error: null }; },
        async signUp(a) { F.calls.push(['signUp', a]); return { data: { user: { identities: [{}] }, session: null }, error: null }; },
        async resend(a) { F.calls.push(['resend', a]); return { error: null }; },
        async resetPasswordForEmail(e, o) { F.calls.push(['reset', o]); return { error: null }; },
        async signInWithOtp(a) { F.calls.push(['otp', a]); return { error: null }; },
        async verifyOtp(a) { F.calls.push(['verifyOtp', a]); F.session = sess('aal1', F.factors || []); emit('SIGNED_IN', F.session); return { error: null }; },
        async signOut(o) { F.calls.push(['signOut', o, self.__tmp ? 'tmp' : 'main']); if (!self.__tmp) { F.session = null; emit('SIGNED_OUT', null); } return { error: null }; },
        async updateUser(a) { F.calls.push(['updateUser', a]); return { error: null }; },
        async refreshSession() { return { data: { session: F.session } }; },
        mfa: {
          async challengeAndVerify(a) { F.calls.push(['verify', a]); if (a.code !== '123456') return { error: { message: 'Invalid TOTP code entered' } };
            F.session = sess('aal2', F.factors || []); emit('MFA_CHALLENGE_VERIFIED', F.session); return { error: null }; },
          async listFactors() { return { data: { all: (F.factors || []).map(f => ({ ...f, factor_type: 'totp' })) }, error: null }; },
          async enroll(a) { F.calls.push(['enroll', a]); return { data: { id: 'f9', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC', uri: 'otpauth://x' } }, error: null }; },
          async unenroll(a) { F.calls.push(['unenroll', a]); return { error: null }; }
        }
      },
      storage: { from: bucket => ({
        async list(prefix, o) { F.calls.push(['list', bucket, prefix, o]); if (F.rateOnce > 0) { F.rateOnce--; return { data: null, error: { statusCode: '429', status: 429, message: 'rate' } }; }
          return { data: (F.files[bucket] || []).slice(0, o.limit).map(n => ({ id: 'id-' + n, name: n })), error: null }; },
        async remove(paths) { F.calls.push(['remove', bucket, paths.length]); F.files[bucket] = (F.files[bucket] || []).filter(n => !paths.includes(prefixOf(paths[0]) + n)); return { data: [], error: null }; }
      }) },
      async rpc(name, args) { F.calls.push(['rpc', name, args]); return { data: name === 'delete_my_account' ? F.rpcResult : true, error: null }; }
    };
    return self;
  };
  const prefixOf = p => p.slice(0, p.indexOf('/') + 1);
  return F;
}

async function load(F) {
  const events = [];
  const win = { CHORDROOM_CONFIG: { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k' }, location: { hostname: 'chord-room.pages.dev', origin: 'https://chord-room.pages.dev', pathname: '/' } };
  let first = true;
  win.supabase = { createClient: () => { const c = F.client(); if (!first) c.__tmp = true; first = false; return c; } };
  const ctx = { window: win, location: win.location, document: { dispatchEvent: e => events.push(e.type) }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    setTimeout, clearTimeout, console, atob: s => Buffer.from(s, 'base64').toString('binary'), escape, decodeURIComponent, Node: class {}, Date, Math, JSON, Promise };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(REPO + '/assets/backend.js', 'utf8'), ctx);
  return { B: win.Backend, events };
}

console.log('== a 2FA session at aal1 is not "signed in" for the app');
let F = fake(); F.factors = [{ id: 'f1', status: 'verified' }]; F.session = F.sess('aal1', F.factors);
let { B, events } = await load(F);
const seen = []; await B.init((ev, u) => seen.push([ev, u && u.id]));
await sleep(5);
check('INITIAL with aal1 + verified factor → MFA_REQUIRED, no user', seen.at(-1)[0] === 'MFA_REQUIRED' && seen.at(-1)[1] == null && B.user === null, JSON.stringify(seen));
check("'cr-mfa' event dispatched", events.includes('cr-mfa'), events.join(','));
check('mfaPendingInfo has the email', B.mfaPendingInfo() && B.mfaPendingInfo().email === 'u1@x');
let err = null; try { await B.mfaSignInVerify('000000'); } catch (e) { err = e; }
check('wrong code → otp, still pending', err && err.code === 'otp' && B.user === null);
await B.mfaSignInVerify('123456');
check('right code → SIGNED_IN for the app', B.user && B.user.id === 'u1' && seen.some(x => x[0] === 'SIGNED_IN' && x[1] === 'u1') && !B.mfaPending, JSON.stringify(seen.slice(-2)));

console.log('== sign-in with 2FA, Turnstile tokens');
F = fake(); F.factors = [{ id: 'f1', status: 'verified' }];
({ B, events } = await load(F)); seen.length = 0; await B.init((ev, u) => seen.push([ev, u && u.id]));
B.captcha = async a => 'tok-' + a;
err = null; try { await B.signIn({ email: 'u1@x', password: 'pw' }); } catch (e) { err = e; }
check('signIn of a 2FA account → error code mfa', err && err.code === 'mfa', err && err.code);
check('…the token went with the password grant', F.calls.find(c => c[0] === 'signInWithPassword')[1].options.captchaToken === 'tok-signin');
await sleep(5);
check('…app not signed in, cr-mfa fired', B.user === null && events.filter(e => e === 'cr-mfa').length >= 1);
await B.signUp({ username: 'abc', email: 'a@x', password: 'password9', terms: { version: '2026-10-06' }, age: { ok: true, min: 18 } }).catch(() => {});
const su = F.calls.find(c => c[0] === 'signUp');
check('signUp: captchaToken + age metadata', su && su[1].options.captchaToken === 'tok-signup' && su[1].options.data.age_ok === true && su[1].options.data.age_min === 18, JSON.stringify(su && su[1].options));
await B.sendReset('a@x'); await B.resendSignup('a@x');
check('reset + resend carry tokens', F.calls.find(c => c[0] === 'reset')[1].captchaToken === 'tok-reset' && F.calls.find(c => c[0] === 'resend')[1].options.captchaToken === 'tok-resend');
B.captcha = async () => 'BAD';
err = null; try { await B.signIn({ email: 'u1@x', password: 'pw' }); } catch (e) { err = e; }
check('a refused captcha maps to code captcha', err && err.code === 'captcha', err && err.code);
B.captcha = null;
err = null; try { await B.signIn({ email: 'u1@x', password: 'nope' }); } catch (e) { err = e; }
check('wrong password → login', err && err.code === 'login');

console.log('== re-authentication keeps the user; sign-out scopes');
F = fake(); F.factors = [{ id: 'f1', status: 'verified' }]; F.session = F.sess('aal2', F.factors);
({ B, events } = await load(F)); seen.length = 0; await B.init((ev, u) => seen.push([ev, u && u.id]));
check('aal2 session → signed in', B.user && B.user.id === 'u1');
await B.reauthPassword('pw');
check('re-auth (aal1 again) keeps the app signed in', B.user && B.user.id === 'u1' && !seen.some(x => x[0] === 'MFA_REQUIRED'));
await B.mfaVerify('f1', '123456');
check('the code restores aal2, still signed in', B.user && B.user.id === 'u1' && !B._reauth);
await B.reauthPassword('pw'); B.reauthDone(); await sleep(10);
check('re-auth abandoned → held back again (code dialog)', B.user === null && seen.at(-1)[0] === 'MFA_REQUIRED');
err = null; F.session = F.sess('aal2', F.factors); F.emit('TOKEN_REFRESHED', F.session);
try { await B.reauthPassword('wrong'); } catch (e) { err = e; }
check('wrong password on re-auth → curpass, no grace left', err && err.code === 'curpass' && !B._reauth);
const before = F.clients; await B.checkPassword('pw');
check('checkPassword uses a throwaway client and leaves this session alone', F.clients === before + 1 && F.session && JSON.parse(Buffer.from(F.session.access_token.split('.')[1], 'base64url')).aal === 'aal2');
await B.signOut();
check('signOut → local scope', F.calls.filter(c => c[0] === 'signOut' && c[2] === 'main').at(-1)[1].scope === 'local');
await B.signOutAll();
check('signOutAll → global scope', F.calls.filter(c => c[0] === 'signOut' && c[2] === 'main').at(-1)[1].scope === 'global');

console.log('== delete: files through the Storage API, then the RPC');
F = fake(); F.session = F.sess('aal1', []);
F.files.uploads = Array.from({ length: 250 }, (_, i) => `s${i}.mp3`); F.files.avatars = ['avatar.jpg']; F.rateOnce = 1;
({ B, events } = await load(F)); await B.init(() => {});
const steps = [];
let r = await B.deleteMyAccount('DELETE', s => steps.push(s));
const rm = F.calls.filter(c => c[0] === 'remove');
check('uploads removed in chunks of 100 (3 calls) + the avatar', rm.filter(c => c[1] === 'uploads').length === 3 && rm.some(c => c[1] === 'avatars'), JSON.stringify(rm));
check('a 429 on list is retried (backoff)', F.calls.filter(c => c[0] === 'list' && c[1] === 'uploads').length >= 3);
check('every file gone before the RPC', (F.files.uploads || []).length === 0 && (F.files.avatars || []).length === 0);
const rpc = F.calls.find(c => c[0] === 'rpc' && c[1] === 'delete_my_account');
check('RPC delete_my_account(p_confirm)', rpc && rpc[2].p_confirm === 'DELETE');
check('ok → local sign-out', r.ok && F.calls.filter(c => c[0] === 'signOut').at(-1)[1].scope === 'local');
check('progress steps files → account', steps.join(',') === 'files,account');
F = fake(); F.session = F.sess('aal1', []); F.rpcResult = { ok: false, why: 'subscription' };
({ B } = await load(F)); await B.init(() => {});
r = await B.deleteMyAccount('DELETE');
check('a refusal is returned, no sign-out', r.ok === false && r.why === 'subscription' && !F.calls.some(c => c[0] === 'signOut'));
r = await B.adminDeleteUser('u7', 'userseven');
check('admin delete: target folders listed, RPC with target', F.calls.some(c => c[0] === 'list' && c[2] === 'u7') && F.calls.some(c => c[0] === 'rpc' && c[1] === 'admin_delete_user' && c[2].target === 'u7'));
const enr = await B.mfaEnroll('oshri');
check('mfaEnroll → id, qr (data:), secret', enr.id === 'f9' && enr.qr.startsWith('data:image/svg+xml') && enr.secret === 'ABC');

console.log(`\nbackend_v4: ${ok} ok, ${bad.length} failed` + (bad.length ? ' → ' + JSON.stringify(bad) : ''));
process.exit(bad.length ? 1 : 0);
