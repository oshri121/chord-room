# Chord Room — guide for Claude

Static web app (no build step) for musicians/producers: BPM/key/chord detection, RGB DJ waveform,
AI stem separation (Demucs v4 via ONNX Runtime Web), WAV/MIDI export for FL Studio, accounts + admin
on Supabase. Hosted on Cloudflare Pages from the `main` branch: every push deploys.

The owner (Oshri) writes in Hebrew. Answer in Hebrew unless asked otherwise.

## Layout
- `index.html` – markup only. Elements with `data-i="key"` get their text from the i18n table; `data-ip` sets placeholders.
- `assets/app.js` – one IIFE, sections marked `/* ---------- name ---------- */`:
  i18n (`I` + `IA`, languages he/en/ar/ru/es — **every new string needs all five**), DSP & analysis
  (onset/tempo/grid, chroma, key, Viterbi chords), waveform (`computeWave`, RGB = red lows/green mids/blue highs),
  canvases, audio engine (stems, loops, metronome), rendering, chord editing, stems (AI + quick DSP fallback),
  YIN note transcription, MIDI/WAV/ZIP export, library, accounts/admin, discover, events, boot.
- Discover view (`#discover`): Deezer charts/new releases via `functions/api/deezer/[[path]].js` (Cloudflare Pages
  Function proxy, allow-listed read endpoints; falls back to JSONP when run locally). Each track's 30 s preview is
  analysed in the browser (`quickAnalyze`, swaps the global `S` only inside a synchronous block) and saved to the
  shared `catalog` table by signed-in users. DJ matches = Camelot same/relative/±1 and tempo within 6 %.
  Keep the Deezer attribution (cover links to the Deezer track, note under the list). The "Israeli" filter
  (genre -1) uses Deezer's official "Top Israel" chart playlist (id 1362507345); its new tab sorts by album release date.
- Stems live in the deck (`#rack`). After separation the waveform switches to the `stems` view: per-stem
  envelopes (`S.stemEnv`) stacked in stem colours and scaled live by each fader/mute/solo (`stemGain`).
- Full songs: we never fetch full audio (licensing). "Full song" opens Deezer's official widget in `#fullbar`
  (complete for listeners signed in to Deezer, 30 s otherwise). Uploading a file ≥60 s that matches a catalog title
  offers `catalog_set_full` (first full analysis wins, admins can replace), shown as a "Full analysis" tag.
- Tempo & key: `S.rate` (speed, BPM shown = `S.bpm*S.rate`, analysis stays in original song time) and `S.transpose`
  (semitones, moves audio + chords). Sources play at `S.rate`; `vendor/signalsmith-stretch-1.3.2.js` (MIT, AudioWorklet,
  loaded on first use) sits on the master bus and shifts pitch by `transpose - 12*log2(rate)`; bypassed when unchanged.
  Its ~120 ms latency is folded into `P.startCtx`. WAV export renders through the same chain offline (`fxRender`);
  MIDI keeps its ticks and only writes the new tempo. Controls: − / value / + in the stats bar (BPM value is typeable).
- DJ view (`#djView`, hash `#dj`): `assets/dj.js` (+ strings in `assets/dj-i18n.js`, styles in `assets/dj.css`), talks to the
  app only through `window.CR` (bridge at the end of app.js; `analyzeTrack` analyses a buffer without touching `S`).
  Two decks, each: source → Signalsmith Stretch (key lock / key shift, always in the path so both decks share the same
  latency) → trim/EQ/filter/gate → fader → crossfader → bus → limiter. Positions are source-time segments (`srcAt`);
  "heard" = `srcAt(now - lat)`. SYNC matches tempo (½×/2× aware) and bar phase; a synced PLAY waits for the bar.
  Beat FX (echo/reverb/flanger sends, gate, roll with slip, brake), synthesized sampler, auto transition (bar-aligned
  start, bass swap, crossfader), recording to 16-bit WAV via an AudioWorklet, match score (Camelot + tempo) with advice,
  next-song picks from My Songs (cloud files) and the Discover catalog (30 s previews). Hardware labels stay English.
  Verified sync by panning A/B hard left/right and cross-correlating a recording: ≤1 ms offset.
- Points & plans: `profiles.credits/plan/plan_until/last_refill`, `credit_ledger`, `site_config.billing` (costs, signup gift,
  plans with price/points/payment link). Changed ONLY by security-definer RPCs: `spend_credits(kind, ref)` → {balance,id} — the PRICE is read on the server from
  `billing.costs[kind]` (old `(amount,reason,ref)` signature kept only as a wrapper that ignores the amount; error
  `insufficient_credits`), `refund_credits(id)` (own 'sep' charge, ≤20 min, once, max 2 refunds/day),
  `refill_credits` (lazy monthly refill, called on sign-in), `admin_grant_credits`, `admin_set_plan`. In app.js
  (`/* ---------- points & plans ---------- */`): `payFor(kind)` checks before, `charge(kind,ref)` spends — separation is
  charged BEFORE it runs and refunded if it fails or is cancelled, stems once per song on download (`S.stemsPaid`). Admins and `billing.on=false` are free.
  Separation runs in the browser, so the gate is honest-user level; the ledger is authoritative.
- Payments (Lemon Squeezy subscriptions; owner setup in `PAYMENTS.md`): each plan has `link` (checkout URL) + `variant` (id).
  "Subscribe" (signed-in only) opens `link` + `checkout[custom][user_id|plan]` + `checkout[email]`; an active subscriber goes to
  the portal instead. Webhooks → `functions/api/pay/webhook.js` (no secrets; forwards raw body + X-Signature) → SQL
  `pay_webhook(p_body,p_sig)`: HMAC-SHA256 with `private.settings.lemon_signing_secret`, once per event in `pay_events`
  (admin-readable), user = custom user_id → `profiles.pay_sub_id` → email; plan = variant → product/variant name →
  custom plan (only while no variant is configured). Points go in with ledger reason 'payment', exactly once per key in the ref
  (`ls:sub:<id>` first payment, `ls:inv:<id>` renewal, `ls:up:…` upgrade difference, `ls:rf:…` refund take-back).
  `profiles.pay_*` (status/portal/renews/plan…) are webhook-only. `refill_credits` skips live subscriptions (points only
  from payments) but still expires `plan_until` (= renews_at + 3 days). Return URL `?paid=1#pricing` polls `loadCredits`
  (`payReturn`). `admin_set_plan` still works for manual plans. Local SQL tests: signed bodies via python HMAC.
- Crate (`#crateView`, hash `#crate`, nav "ניתוח ספרייה"): `assets/crate.js/css` (strings inside), talks only through `window.CR`.
  Batch BPM/key/Camelot/LUFS/energy for many files (sequential `CR.analyzeTrack`), sortable/filterable table, smart set order,
  exports CSV / rekordbox XML (Location from the folder path the user types, TEMPO beatgrid) / M3U8 / renamed-copies ZIP with ID3 TBPM+TKEY.
  Results (not audio) persist in localStorage `chordroom.crate.v1`.
  "USB for Pioneer": copies named in Latin letters by pronunciation (`assets/heblat.js` = `window.HEBLAT`: artist list →
  word dictionary + prefixes → rule-based vowels; user fixes are learnt in `chordroom.translit.v1`), official artist spellings
  from Deezer `search/artist` (cached in `chordroom.dzartist.v1`, accepted only when the consonant skeleton matches).
  MP3: Hebrew ID3 text frames converted + TIT2/TPE1 set; FLAC: Vorbis comments; other formats: file name only.
  Each Hebrew row shows its Latin name under the title, editable (✎) and saved in the row (`r.lat`).
- Mashup Studio (`#mashupView`, hash `#mashup`, nav "מאשאפ", gated): `assets/mashup.js/css` (strings inside), talks only through
  `window.CR`. Slot A = vocals, B = instrumental (⇄ swap), loaded from a file / My Songs / `CR.toolSong()` (tool stems reused),
  analysed with `CR.analyzeTrack` + `CUES.detect`. Stems: `CR.separateBuffer(buffer,{onProgress,signal,ref})` (app.js bridge: same
  Demucs worker via `aiInit`/`aiRun`, payFor → charge 'sep' → refund on failure/abort; one separation at a time, `AI.ext`) or the
  free quick DSP split `assets/quicksep-worker.js`; cached in memory per song for the session. Model (see the file header):
  target T (B's/A's/typed), ½×/2× fit, rate r = T/(bpm·k), A shifted by `semis` (auto = same/relative Camelot key, or a neighbour
  when much closer), A's vocal entry (vocals-stem energy → 'vocal' cue → intro) on bar `align` of B + `nudge`. Preview = live graph
  (sources → stem gains → fade → Signalsmith Stretch, or a DelayNode of the same latency when a slot needs no change → level →
  limiter); export renders the same `schedule()` offline → WAV / MP3 320 "A × B (Mashup) BPM Key", logs `mashup_export`.
  Settings (not audio) per account in `chordroom.mashup.v1:<uid|guest>`. Verified: A downbeats on B downbeats ≤0.5 ms (export + preview).
- Home = the About page (no hash); the tool is `#tool`. First nav tab "בית" is `#navAbout`; the brand mark goes home.
  `html.home` (set by an inline script before paint) hides the tool until the router runs.
- Owner & roles (schema.sql "Owner & roles"): `profiles.owner` (the first account; can't be demoted/blocked). Only the owner
  changes roles (`admin_set_role(target, role, password)` → 'ok'|'bad_password'|'locked'|'no_role_password'); giving any
  management role needs the roles password (bcrypt in `private.settings 'role_password'`, set by `owner_set_role_password`,
  5 wrong tries → 15 min lock). Roles: user, admin (all perms), custom `roles` rows with perms from `all_perms()`
  (users, block, credits, songs, activity, settings, payments, catalog), checked by `has_perm(p)`; `my_access()` feeds the
  admin panel (`ACC.panel/perms/owner`; `ACC.admin` = full admin, actions free). Admin tabs: users, songs, activity,
  settings, roles (owner only).
- Per user: the Crate is stored per account (`chordroom.crate.v1:<uid|guest>`, the old shared key goes to the first account
  that signs in; a guest's rows move to the account on sign-in when it has none). The remembered tool song carries the uid and
  is shown only to that account; switching account resets the tool (`authChanged` → `cr-user` event → `userSwitched`).
- Activity log: `activity` table written only by `log_activity(action, detail)` (rate limited, admins read). `logAct(a,d)` in
  app.js (`CR.log` for dj.js/crate.js): visit, sign_in, view, song_upload/open, discover_open, separate, export, dj_load,
  crate_analyze/export, subscribe_click, invite_copy, mashup_export, voice_test. Admin panel tab "Activity" + per-user activity in the details view.
- Auto cue points (`assets/cues.js`, `CUES.detect(buffer, grid)`): intro/vocal/break/build/drop/outro = hot cues A–F with fixed
  colours, found from per-bar band energies. Crate stores them per row, draws a structure strip, and exports them:
  rekordbox XML POSITION_MARK (hot + memory), Serato `GEOB "Serato Markers2"` inside MP3 copies, Traktor NML (CUE_V2).
  Each row shows a rekordbox-style overview (`.rbov` canvas: RGB waveform packed to 300 columns in `r.wv`, 4/16-bar grid,
  coloured hot cue flags). rekordbox can't read cues from files (they live in its database) → XML; Serato/VirtualDJ read the
  GEOB inside the downloaded MP3 copies.
- Crate overview is interactive: ▶ / click = listen from there (one shared <audio>, `PL`), drag a flag = move that cue
  (snaps to bars, Alt = free), grid moves (±1 beat, ±10 ms, "a bar starts here") shift grid AND cues via `r.gsh`
  (added in `gridStart`, so XML/NML exports follow).
- Discover player bar (`#dPlayer`, built by `dpEl`/`dpRender`): play/pause, previous/next through the visible list
  (auto-next at the end), stop, seek, volume/mute (saved in `chordroom.dvol`); hidden when leaving Discover.
- Auth UX (`assets/auth.css`, app.js "auth dialog"): header "כניסה"/"הרשמה" (signed out), two-panel dialog; sign-up =
  details → terms (required consent checkboxes; `terms_version`/`terms_at` go in user metadata → `profiles.terms_*` via
  `handle_new_user`) → 6-digit email code (`verifyOtp type signup`, resend with cooldown) → welcome. Forgot password by code
  (`type recovery`); the reset link still works. Legal pages `#terms` / `#privacy` from `assets/legal.js` (`LEGAL.version`,
  owner fills `OPERATOR`). Branded email templates in `supabase/email/*.html` + owner guide `EMAIL.md` (needs custom SMTP).
- Security: `supabase/schema.sql` ends with the hardening blocks [S-1…S-16] (keep them LAST; S-16 is commented out until the
  client stops selecting `pay_portal`). `_headers` = strict CSP (no inline scripts: `assets/early.js`), frame-ancestors none,
  HSTS, cache rules; `functions/_middleware.js` + `_routes.json` hide repo files (supabase/, tools/, *.md) and add API headers.
  A new external origin must be added to the CSP. Mock backend only on localhost. Tests: `/var/tmp/crpay-pg/t/sec.py` (SQL),
  scratchpad `sec/sec_test.py` (XSS payloads + CSP).
- Keys are shown as key names (Am, F#m, Db) everywhere; Camelot is only used internally for matching.
- Last song: the tool reopens the last loaded song after a reload (IndexedDB `chordroom`/`kv`: `audio` = blob+name, `state` = the lib
  item from `saveLib`; play position in localStorage `chordroom.lastpos`). `rememberSong(blob,info)` is called by every loader.
- Drums → MIDI: export option `xDrumsM` = kick/snare/hat onsets from the drums stem (band filters + flux peaks, bleed filtered,
  quantised to 1/16), GM channel 10 (36/38/42). Tested on synthetic drums (`drumHits`, `drumsMidi`).
- Invite a friend: `?ref=<code>` is stored in localStorage `chordroom.ref`; after sign-in `claim_referral(code)` (once, within 3 days
  of signup; both sides get `billing.referral` points, inviter capped by `billing.referral_max` per 30 days). `my_referral()` gives the
  code + stats; the invite box sits in the points box and under the plans on the pricing page (`renderRef`).
- Discover "Israeli": Top Israel chart + an Israeli-hits playlist, filtered to Israeli artists (`israeliFilter`: Hebrew text,
  artists learned from Hebrew tracks, `IL_ARTISTS` list).
- Pages: `assets/pages.js` (+css) renders `#pricingView` / `#aboutView` (`#about-a11y` = accessibility statement from
  `A11Y.statementHTML`). Header + mobile drawer: `assets/shell.js/css` (nav tabs keep their `data-i` on an inner span).
  Animated background: `assets/bg.js` (`BG.pulse(level)` from the players). Accessibility plugin: `assets/a11y.js/css`
  (`A11Y.get('mono'|'cb'|'noanim'|'flash')`, `A11Y.beat()`, `A11Y.waveColor`; owner must fill the CONTACT object).
  MP3 320: `assets/mp3.js` + `assets/mp3-worker.js` + `vendor/lamejs-1.2.7.min.js` (LGPL — keep it a separate, unmodified file).
- Theme: `data-theme` on <html> (light/dark, saved in localStorage; no attribute = follow the system). Colours come
  from CSS tokens; the dark block redefines them. Use `currentColor`/tokens, never hard-coded light colours.
- `assets/backend.js` – `window.Backend`: every Supabase call lives here. The app never touches `supabase` directly.
  Tests can inject `window.__MOCK_BACKEND` before this script.
- `assets/app.css` – light theme: white paper, black ink, black "deck". Fonts: IBM Plex Sans (+Hebrew/Arabic), Plex Mono.
- `supabase/schema.sql` – tables `profiles`, `songs`, `site_config`, `catalog`, bucket `avatars`, RLS, admin RPCs.
  Users can only update the columns granted in the schema; role/blocked change only through `admin_set_role` /
  `admin_set_blocked`. First account to sign up becomes admin. Schema changes must be re-run in the Supabase SQL editor
  (tell the owner; there is no migration runner).
  Uploaded audio: private bucket `uploads` at `{uid}/{songKey}.{ext}` (50 MB limit), path saved in `songs.file_path`
  together with bpm/key/genre/duration columns; owner or admin can read. Reopening from the library downloads it
  via a signed URL. Exports are logged in `downloads`. Admin panel: users tab (per-user "details" view with their
  songs + downloads, ZIP of all their files) and an all-songs tab.
- `ai/worker.js` – built bundle (do not hand-edit). Source: `tools/ai-worker/worker.js` + `tools/ai-worker/lib/`
  (demucs-js apply/dsp with our fixes: correct istft length, faster FFT). Rebuild: see `tools/README.md`.
- `ai/model/` – runtime wasm (gz), graph (gz) and fp16 weights (byte-shuffled, gz, split <25 MB for Cloudflare's per-file limit).

- First visit: `assets/welcome.js/css` shows a 5-language picker (suggested from `navigator.languages`) when no
  `chordroom.lang` is saved; skipped under `navigator.webdriver` (tests). Uses `CR.setLang(lang, true)`.
- Assistant (`assets/assistant.js/css`, `functions/api/assistant.js`, `supabase/assistant.sql`, owner guide `ASSISTANT.md`):
  Roomy/רומי chat, signed-in only, daily quota via `assistant_use()` (`billing.assistant_daily` / `assistant_daily_plan`),
  Anthropic API key = Cloudflare secret `ANTHROPIC_API_KEY` (model `ASSISTANT_MODEL`, default Haiku 4.5), NDJSON stream,
  answers rendered from DOM nodes (tiny markdown, internal hash links only). The list of site features the bot knows is in
  the Function's system prompt, so update it when features change. `supabase/assistant.sql` runs after schema.sql.
- Sign-in gate: the tools (#tool, #discover, #dj, #crate, #mashup) need an account; signed out they show `#gateView` (`renderGate`,
  class `signgate`, strings IGATE) with sign-up / sign-in; home, pricing, terms, privacy stay open. Upload/drag-drop/`loadFile`
  ask for an account too (`needAccount`/`askAccount`). `regate()` re-routes on auth changes. Only when accounts are on
  (tests that exercise the tools without the mock stub `vendor/supabase.js` → local mode). The old `require_login` overlay
  (`#gate`) is retired and its admin toggle hidden. Client-side (honest-user) gate; paid/server things are checked server-side.
- "My key" / הסולם שלי (`assets/voice.js/css`, strings inside, only via `window.CR`; button `#vcOpen` injected into `#stKey`):
  mic range test (own AudioContext + AnalyserNode, YIN per 50 ms frame, median + octave guard; steps lowest / highest /
  optional 10 s song) → comfortable range + voice type, saved in localStorage `chordroom.voice.v1:<uid|guest>`. Song melody
  range = YIN in a blob Worker over the vocals stem (`S.stems[0]`) or a centre-channel STFT extract of the mix ("estimated"),
  10th–90th percentile of steady runs. `recommend()` scores shifts −6…+6 × singer octave −1/0/+1; Apply = `CR.setTranspose`
  (bridge block after `window.CR`: `voiceSong`, `getTranspose`, `setTranspose` → `setT`). Needs `microphone=(self)` in `_headers`.
- Dark theme: semantic tokens (surfaces, inputs, button fill/hover, border strengths, primary, selected, toast) in app.css,
  defined for forced dark AND the system-dark media query; the Discover player bar is always dark like the deck.

## Rules of thumb
- Keep it build-free: plain scripts, no bundler for the app itself.
- Cache busting: bump the `?v=` query on the `<script>`/`<link>` tags in `index.html` when changing `assets/*`.
- RTL: the page flips for he/ar, but the timeline (canvases, times, BPM, keys, sizes, emails) stays LTR —
  wrap such values with `ltr()` / `dir="ltr"` and check Hebrew + Arabic after UI changes.
- Never commit secrets. `config.js` holds only the public publishable key.
- Test locally: `python3 -m http.server 8000`. The page opens with a generated demo song, so analysis can be checked without files.
