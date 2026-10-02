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
  **Points v2** (schema.sql block "Points v2" `[points-v2:begin…end]`, before the hardening blocks; the same block + the updated [S-9]
  guard + Roomy's price list = `supabase/points_v2.sql`, run once by the owner): kinds = keys of `billing.costs` (0…100 points/unit,
  0 = free): `song` 1 (analysing an UPLOADED song in Tool/DJ/Crate, once per song per account), `sep` 5, `stems` 2, `usb` 1/song (Crate
  folder exports: "USB for Pioneer" AND the renamed-copies ZIP — both carry cues + tags), `mashup` 3 / `extended` 3 (export), `convert` 1/file. `billing.plans[].discount` 0…90 % (pro 10, studio 25) while
  `plan_until > now()`; price = ceil(unit·qty·(100−d)/100). RPCs: `spend_credits_n(kind,qty 1…500,ref)` → {balance,id,charged,unit,qty,
  discount,free} (ledger row reason 'spend', `kind/qty` columns, ref "kind ×qty ref"; admins/owner/billing off/0 price → no row),
  `spend_credits(kind,ref)` = qty 1 wrapper, `price_quote(kind,qty)`, `spend_song(key)` (table `charged_songs`, read-only own rows;
  already paid → charged 0), `refund_credits_n(id,qty)` (own v2 row ≤3 h — long Converter batches, not sep/song/stems, `refunded` tracked on the row, sum of
  partial refunds = what was paid, caps 20 refunds + 1000 units a day so a failed 300-song folder fits). The guard clamps costs 0…100 / discount 0…90 and accepts any
  `^[a-z][a-z_]{1,23}$` kind. App (`/* ---------- points v2 */` after `refund()`): `priceOf/unitPrice/priceChip` (client estimate, same
  formula), `payForN(kind,qty)` → ONE dialog `#ptsDlg` (calc, plan line, balance before→after, short → "Only the first K" / "Buy points",
  "don't ask again up to N points" per kind in `chordroom.payok.v1`), `chargeN`, `refundN(pay,k)`, `payN` (ask+charge; journals the charge in localStorage `chordroom.payjobs.v1` + holds a Web Lock
  `crpay:<id>` while it runs → every caller ends with `settleN(pay,failed)`; `progressN(pay,done)` = delivered units; `payJobsCheck` on
  `cr-user` refunds jobs whose page died — lock not held anywhere — minus delivered units),
  `paySongs([{name,size}])` → {ok, commit(item)} (asks once for the songs not in charged_songs, `commit` = spend_song AFTER the
  analysis worked), `songKey(name,size)`. Bridge: `CR.price/priceChip/payN/refundN/settleN/progressN/paySongs/songKey/refreshPoints`, event `cr-prices`
  (chips re-render). Wiring: Tool `loadFile` + DJ `loadFile` (new files only; My Songs/demo/previews free), Crate `approve()` before the
  queue (rows not approved → 'pause') + commit per row, Crate USB + renamed ZIP = `payN('usb',rows)` (busy before asking: no double charge) + refund unreadable rows / failed ZIP (CSV/XML/
  NML/M3U8 free), Mashup/Extended export = `payN(kind,1)` before rendering, refund on failure, the same mix/render again in the
  session is free (`PAID`), Converter batch = `payN('convert',n)` + refund failed/cancelled files (Images free). Pricing table, plan
  card discounts, About tiles/FAQ: `assets/pages.js` (SV strings) from `billing`; admin settings: `#bCosts` (one field per kind) +
  plan `discount`. Points v2 SQL missing → new kinds free, sep/stems via the old RPC. Tests: `sql/test_points_v2.py`, `ui/test_points.py`.
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
- Converter (`#convertView`, hash `#convert`, nav "המרה", gated): `assets/convert.js/css` (strings inside), talks only through
  `window.CR` (`CR.loudness` = `measureLoudness`, `CR.analyzeTrack`, `CR.zip`, `CR.saveBlob`, `CR.log`). Batch audio/video → MP3
  (lamejs via `window.MP3`), WAV 16/24-bit (own writer, LIST INFO + `id3 ` chunk), FLAC / OGG-Vorbis / M4A-AAC (ffmpeg.wasm).
  Decode: `decodeAudioData` first; video containers, AIFF/WMA/… and anything the browser rejects go through ffmpeg
  (`-f wav pcm_f32le` + `-f ffmetadata`). ffmpeg.wasm = `vendor/ffmpeg/ffmpeg-core-0.12.10.js` (unmodified UMD glue, GPL, see
  `vendor/ffmpeg/LICENSE.txt`) + `ffmpeg-core-0.12.10.wasm.bin` (the 32 MB wasm gzipped to 10 MB for the 25 MB Pages limit;
  inflated with `DecompressionStream` and passed as `wasmBinary`), driven by our classic worker `assets/ffmpeg-worker.js`
  (`load` / `run` messages; a cancel terminates the worker and the next job reloads from the kept gz bytes). Loaded lazily with
  a progress bar; `_headers` caches `/vendor/ffmpeg/*` immutable; the CSP needed no change (`'self'` + `'wasm-unsafe-eval'`).
  libopus crashes in this build → OGG is Vorbis (`-q:a` 3–8 ≈ 112–256 kbps). Processing: trim silence (−50 dBFS), mono/stereo,
  resample through an OfflineAudioContext, −14 LUFS normalise with a −1 dBFS ceiling, linear fades. Tags: own readers (ID3v2
  in MP3/WAV/AIFF incl. APIC, Vorbis comments + PICTURE in FLAC/OGG, iTunes ilst in MP4/M4A/MOV, ID3v1 fallback) → written as
  ID3v2.3 (MP3, WAV `id3 ` chunk), `-metadata` + attached_pic / `METADATA_BLOCK_PICTURE` (ffmpeg targets), `tmpo` for M4A BPM;
  "BPM & key into tags" = `CR.analyzeTrack` → TBPM/TKEY (off by default). "Images" tab = canvas resize/convert of cover art
  (500/1000/1500 px square centre-crop or original; jpg/png/webp). Options in localStorage `chordroom.convert.v1`; up to 50
  files, 300 MB each. Activity `convert` ("<n> files → <fmt>"). Test: `tools/tests/ui/test_convert.py` (fixtures from
  `tools/tests/fixtures/gen_media.py`, system ffmpeg + mutagen when present).
- Extended generator (`#extendedView`, hash `#extended`, nav "אקסטנדד", gated): `assets/extended.js/css` (strings inside, heuristics
  documented in the file header), talks only through `window.CR` (+ `CUES._features`/`CUES.detect(buf,grid,features)`, `CR.chromaOf`,
  `CRATE.tagMp3`). An EDIT of the song itself: nothing composed, vocals/melody/tempo unchanged, every block = original audio or some stems.
  Load (file / My Songs / `CR.toolSong()`; decoded at the file's own rate so unmodified blocks stay bit-identical) → analysis checklist
  (analyzeTrack, quick DSP stems by default, "Upgrade to AI stems" = `CR.separateBuffer` 'sep' flow) → per-bar features → sections on a
  4-bar phrase lattice (Intro/Verse/Pre-Chorus/Build/Drop/Break/Chorus/Bridge/Outro, colours = cue colours) + Groove confidence + Phrase
  lock; the user relabels (chip/canvas popover) and drags boundaries (snap to bars). `makePlan` (presets DJ/Club/Radio/Performance, +30…+2 min
  or custom, intro/outro 16/32/64 bars × Drums/Drums+bass/Full/Filtered/Percussion/Original): DJ intro loop from stems (a mixable original
  intro counts), the whole original in order, phrase repeats (16/8/4 bars) of drops/breaks to reach the length, DJ outro mirrored; every block
  says where it came from. `renderAudio` = OfflineAudioContext, whole-sample starts, contiguous blocks merged, 20 ms equal-power joins
  ending on the downbeat, stem gains + Biquad sweeps, Signalsmith only for drifting grids (live drift: beat phase tracked per 2 bars by DP +
  unwrapped, its linear part refits the BPM, the rest = per-bar offsets; kept only if the hits fit better). Tracks > 15 min are refused (memory).
  Preview A/B on the render (T switches at the mapped spot, L loops the selected block); export MP3 320 (+ Serato cues intro/drop/outro) / WAV 16/24 at 44.1/48 kHz,
  "Artist - Title (Extended Mix)", activity `extended_export`. Settings in `chordroom.extended.v1:<uid|guest>`; hide frees quick stems + render.
  Test: `tools/tests/ui/test_extended.py` (fixture `tools/tests/fixtures/gen_club.py`).
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
  client stops selecting `pay_portal`) and then the "Security v3" block `[security-v3:begin…end]` = [S-17…S-23] (server audit
  2026-10, `SECURITY-AUDIT.md`): anon `catalog_play` only for existing ids, per-day caps (activity 1500, downloads 1500, catalog
  adds 1500, free `charged_songs` rows 3000), My Songs `data` ≤ 50 MB per account, a new catalog row's link = its own track,
  plans[].link/variant only owner/full admin (+ INSERT policy so a 'settings' role can save via upsert), no sign-up gift
  without an email. `supabase/security_v3.sql` = that block + `assistant.sql` verbatim (owner runs it once; the test checks
  it). assistant.sql: confirmed email required, site-wide ceiling `billing.assistant_site_daily` (default 3000, 0 = off) →
  `why:'site_limit'` → the Function answers 503 busy; the Function also trims the conversation to 12 000 chars.
  `_middleware.js` matches hidden paths on a normalised path (decoded, `//`, `\`, `..`, case) and `_routes.json` carries case
  variants; only `/ai/worker.js` (not `/ai/*`) skips the page CSP. Tests: `sql/test_security_v3.py`, `node/security_v3.test.mjs`. `_headers` = strict CSP (no inline scripts: `assets/early.js`), frame-ancestors none,
  HSTS, cache rules; `functions/_middleware.js` + `_routes.json` hide repo files (supabase/, tools/, *.md) and add API headers.
  A new external origin must be added to the CSP. Mock backend only on localhost. Tests: `/var/tmp/crpay-pg/t/sec.py` (SQL),
  scratchpad `sec/sec_test.py` (XSS payloads + CSP).
- Keys are shown as key names (Am, F#m, Db) everywhere; Camelot is only used internally for matching (the word does not appear in UI copy).
  Non-diatonic chord roots are spelled on the flat side (`chordFlat`). Onset frame times carry `ENV_LAG` (+15 ms); the LUFS highpass Q is in dB (−6.02).
- Chords (`/* chords */`): `computeChroma` (tuning-corrected) → `detectKey` → `chordPass()` (beat-synchronous `spanChroma`, 24 triads + N.C.,
  inversion-tolerant bass, Viterbi with a bar-position prior, pushed changes moved to the bar; `refineKey` = key from the chords; weights `CHP`)
  in every path (tool, `analyzeTrack`, `quickAnalyze`, `regrid`); playhead/sheet/now-next draw `heard()` (getOutputTimestamp), scheduling keeps
  `now()`. Benchmark with ground truth: `tools/tests/ui/test_chords.py` (`fixtures/gen_chords.py`).
- SEO/sharing: `<head>` OG/Twitter/canonical point at `https://chord-room.pages.dev` (change with a custom domain), `assets/og.png`
  (1200×630, regenerate with PIL if the brand changes), PNG icons + `apple-touch-icon.png`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`.
  Pricing shows ≈ USD next to ₪ for non-Hebrew languages from `billing.usd_rate` (admin settings, default 3.7); plans without an
  https checkout link render "coming soon" / "contact us" instead of a live CTA.
- Last song: the tool reopens the last loaded song after a reload (IndexedDB `chordroom`/`kv`: `audio` = blob+name, `state` = the lib
  item from `saveLib`; play position in localStorage `chordroom.lastpos`). `rememberSong(blob,info)` is called by every loader.
- Grid drag (`/* griddrag */` in app.js, block before boot): toggle `#gEdit` ("Drag", aria-pressed) next to ◀ ▶ 1 / ÷2 ×2, or Alt/Shift held
  while dragging the zoom canvas: drag = move the grid (`S.offset`, audio stays put), the grabbed line snaps to a hit within 20 ms
  (`onsetNear(buf,t,tol)` = strongest rise of the 1 ms peak envelope, also `CR.onsetNear`; magnet drawn; Ctrl/⌘ = free); in grid mode a
  drag on a bar-number tab (or Alt+Shift) stretches the tempo with bar 1 (`S.beats[S.down]`) fixed; double click/tap on a line = `S.down`;
  arrows ±1 ms / Shift ±10 ms when the toggle is on or focused; Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) undo/redo every grid edit (the old grid
  buttons too, `gdPush`); `#gdX` undo/redo/reset (`S.gridDet` = detected grid, set in `analyze`). While dragging, chords/edits/downbeat and
  hot cues on a grid line ride along by beat index (`gdApply`); on release chords are re-detected (`gdCommit`, user edits kept) + `saveLibSoon`.
  Mashup: "Grid" toggle (`#mxGrid`): drag on a lane = move that song's own grid (preview while dragging, applied on release: `gridShift`
  moves offset/down, A's vocal entry and B's cues ride along, B's bar renumbering keeps `align`), saved per pair (`pair.grid`); each lane
  draws its own bar lines, the A↔B downbeat lock is highlighted (`#mxLock`); A drag: bars / Shift beats / Ctrl⌘ or Alt free; `M.undo/redo`
  (Ctrl+Z). Crate overview: Shift/Alt+drag = grid + cues by whole beats (Ctrl/⌘ free) via `shiftGrid`. Test: `tools/tests/ui/test_griddrag.py`.
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
- Sign-in gate: #discover, #dj, #crate, #mashup, #convert, #extended need an account; signed out they show `#gateView` (`renderGate`,
  class `signgate`, strings IGATE) with sign-up / sign-in; home, pricing, terms, privacy stay open. `#tool` is open to guests with the
  demo song + a slim banner (`#guestBar`, `renderGuestBar`); upload / My songs / export / separation ask for an account. The demo (or
  the last song) is analysed by `ensureSong()` the first time the tool is shown, never at boot on the home page; a newer `analyze()`
  supersedes a running one (`ANG`). Separation: model download (free) → `sepConfirm` (price, balance, estimate, "don't ask again" in
  `chordroom.sepok`) → `charge`. `showView` sets `document.title` per view and moves focus to the view's h1; unknown hashes → home + toast. Upload/drag-drop/`loadFile`
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
