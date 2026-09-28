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

## Rules of thumb
- Keep it build-free: plain scripts, no bundler for the app itself.
- Cache busting: bump the `?v=` query on the `<script>`/`<link>` tags in `index.html` when changing `assets/*`.
- RTL: the page flips for he/ar, but the timeline (canvases, times, BPM, keys, sizes, emails) stays LTR —
  wrap such values with `ltr()` / `dir="ltr"` and check Hebrew + Arabic after UI changes.
- Never commit secrets. `config.js` holds only the public publishable key.
- Test locally: `python3 -m http.server 8000`. The page opens with a generated demo song, so analysis can be checked without files.
