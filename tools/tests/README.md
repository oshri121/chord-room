# Chord Room — test suite

Everything a fresh container needs to test the site lives here. One command:

```
tools/tests/run_all.sh              # node + sql + ui, summary table, exit code = number of failed tests
tools/tests/run_all.sh --ui -k auth # only UI tests whose name contains "auth"
tools/tests/run_all.sh --sql --node # no browser
tools/tests/run_all.sh --slow       # everything + slow/ (AI stem separation on CPU + the Extended matrix, ≈ 10–12 min extra)
python3 tools/tests/ui/test_gate.py # a single test, verbose (each test is a plain script)
```

Requirements (all preinstalled in the usual container): Python 3.10+ with `playwright` (Chromium at
`PLAYWRIGHT_BROWSERS_PATH`; if missing: `python3 -m playwright install chromium`), `numpy`, `mutagen`
(optional, Serato tag check), Node 18+, PostgreSQL 14+ server binaries (`apt-get install -y postgresql-16`),
`ffmpeg` (optional, MP3 fixture in the cue test). `run_all.sh` pip-installs the missing Python packages.

Whole suite ≈ 8 min on a quiet 2-CPU box (up to 15 min when other browsers compete for the CPU; `--slow` adds ≈ 10–12 min) (the UI tests are dominated by audio analysis in headless Chromium);
node + sql take 20 s. `-j 2` runs UI tests two at a time when the machine has the cores.

Logs go to `/tmp/chordroom-tests/<test>.log`, screenshots to `/tmp/chordroom-shots/<test>/`
(`CR_LOGS`, `CR_SHOTS`). `CR_REPO=/path/to/worktree` tests another checkout. `CR_HEADED=1` shows the browser.

`tools/` (this folder included) is hidden on the live site: `functions/_middleware.js` answers 404 for `/tools/*`,
and `_routes.json` routes `/tools/*` through it — `node/functions.test.mjs` asserts both.

## Layout

```
lib.py            shared UI helpers (server, browser contexts, mock injection, sign-in, checker) — read its docstring
i18n_static.py    static i18n checks (all five languages per table, every literal t('key') / data-i defined); `python3 i18n_static.py <repo>`
run_all.sh        the runner
fixtures/         p0/p1/p2.mp3 (30 s previews, 1.1 MB) · gen_edm.py (synthesises a 90 s EDM track with a known structure)
                  · gen_media.py (4 s tagged MP3/WAV/FLAC/OGG/M4A/MP4/AIFF + cover PNG for the Converter test; needs ffmpeg for all but WAV)
                  · gen_club.py (195 s, 128 BPM club track with a known 7-section arrangement, 44.1 kHz WAV, for the Extended test; truth())
                  · gen_styles.py (house / pop / mizrahi (live timing) / hiphop / vocal1 / pickup songs with known beats, sections, sung
                    phrases and the vocals alone — the Extended quality audit)
                  · gen_chords.py (≈ 30 band-style songs with known beats / key / chord per beat, + "+hard" mixes; cached in $TMP/cr-chords-<hash>)
extq.py           Extended render metrics (clicks at joins, beat continuity, level steps, vocal cuts, bleed, ending) from the WAV + plan
chordscore.py     chord benchmark scoring (MIREX majmin per beat, 20 ms frames, change F1, key, bar lines, spelling)
                  · gen_evil.py (hostile file names + an MP3 whose ID3 tags are XSS payloads, for the security test)
mock/             mockb.js (mock backend) · auth_ext.js (e-mail codes, recovery) · evil.js (every field is an XSS payload)
                  · audiotap.js (init script: records what reaches AudioContext.destination + what the tool shows each frame)
ui/test_*.py      Playwright tests (Python, sync API)
slow/test_*.py    same style, opt-in with --slow (real Demucs model in the browser)
sql/              setup_pg.sh (private Postgres cluster) · pg.py (stub Supabase + load schema) · test_*.py
node/             *.test.mjs — Cloudflare Pages Functions run in Node with a stubbed fetch
```

## How a UI test works

`lib.main` starts a local stand-in for Cloudflare Pages on a free port and launches Chromium:

* serves the repo with the headers from `_headers` → the **real strict CSP** applies (no inline scripts, so the
  mock backend is injected as an external `<script src="/__test/mock.js">` before `config.js`);
* `/api/deezer/*` answers with fake chart tracks (`srv.tracks`), previews point at `*.dzcdn.net` and are served
  from `fixtures/p{0,1,2}.mp3` by the context's routes; `POST /api/assistant` is a fake Roomy stream with the same
  NDJSON wire format as the real Function (scenario chosen by keywords in the message: QUOTA, SLOW, CFG, NET, LONG,
  CUT, LAST); `/__test/last` returns the last assistant request for assertions;
* every other host is aborted (Google Fonts get an empty stylesheet), so tests never leave the machine.

```python
import lib
@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=True)          # or accounts=False, or mock=lib.mock_js(EXTRA_JS)
    pg.goto(srv.url('#tool')); lib.wait_booted(pg)
    lib.sign_up(pg, 'oshri', 'o@x.com')                # 'oshri' = admin in the mock
    t.check('label', condition, info)                  # t.eq(label, got, want), t.section(), t.shot(pg, name)
```

The script exits 1 when a check failed, the test raised, or the page logged an uncaught error / `console.error`
(`t.page_errors()` runs at the end; `t.allow_errors = [regex]` for expected ones). `t.known(label, cond, info)`
reports a **known app issue** without failing (prints `KNOWN`, or `FIXED?` once it passes) — use it for real bugs
that the builders have not fixed yet, so the suite stays green and the report still shows them.

### Conventions

* **Accounts.** `#discover`, `#dj`, `#crate`, `#mashup`, `#convert` and `#extended` need an account; `#tool` is open to guests with the demo song
  (upload / My songs / export / separation open the auth dialog). The demo is analysed the first time the tool is shown,
  not at boot: a test that lands on the home page and needs the song must open `#tool` (or call `lib.wait_tool_song`
  after navigating there). Either sign in through the mock
  backend (`mock=True`, `lib.sign_up/sign_in/sign_out`) or run in local mode with `accounts=False`, which stubs
  `vendor/supabase.js` so `Backend.enabled` is false and there is no gate. Never both.
* **Mock backend.** `mock/mockb.js` implements `window.__MOCK_BACKEND` (honoured by `assets/backend.js` only on
  127.0.0.1/localhost): in-memory users/profiles/songs/catalog/activity, `dana@example.com / password1` pre-seeded,
  neutral defaults for referrals/access/assistant, and points with the real v2 rules (every account starts with 50 points; `__mock.setCredits(n[,uid])`, `__mock.setPlan(id,days[,uid])`, `__mock.ledger`; prices from `cfg.billing` or the defaults; admins free). A normal (non-admin) account now sees the points dialog when it uploads/exports — sign up as `oshri` (admin) when a test isn't about points. Override what you exercise with
  `lib.mock_js(extra_js)`; `lib.auth_mock()` adds e-mail-code sign-up + recovery. `mock/evil.js` is the hostile
  backend for the security test. When the app gains a Backend method, add a default to `mockb.js`.
* **Languages / RTL / dark.** Pass `lang='he'|'en'|'ar'|'ru'|'es'` and `theme='light'|'dark'` to `lib.page` (saved
  in localStorage before load); check `document.documentElement.dir` for he/ar and `lib.scroll_width(pg) == width`
  at 375 px. `lib.page_luma(pg, sel)` checks the dark background actually turned dark.
* **CSP.** Add `init=lib.CSP_INIT` to a context and assert `lib.csp_violations(pg) == []` at the end.
* **Waiting.** Use `lib.poll(pg, js, timeout)` / `lib.wait_booted` / `lib.wait_tool_song` instead of sleeps where
  possible. Reloading while the boot-time demo analysis runs can stall headless Chromium for 10–30 s: use
  `lib.reload(pg)` (waits for `#busy` first).
* **Every new string in the app needs all five languages** — a test that checks a label in `he` should also flip
  `#lang` once (see `test_legal_home.py`).

## SQL tests

`sql/setup_pg.sh start` creates a private cluster in `$CR_PG` (default `/var/tmp/chordroom-pg`, Unix socket only,
runs as `postgres` when you are root) and `pg.Db('name')` gives a fresh database with a stub of the Supabase
platform (`auth.users`, `auth.uid()`, `storage.*`, roles, pgcrypto) plus `supabase/schema.sql` loaded three times
(idempotence is a check). `Db.as_(uid, sql)` runs as an authenticated user (`None` = anon). Signed webhook bodies
use `pg.sign(body, secret)`. `run_all.sh` starts the cluster when an sql test is selected and stops it afterwards
unless `--keep-pg`.

## Node tests

`node/*.test.mjs` import the Functions from the repo (`CR_REPO`), replace `globalThis.fetch` and call
`onRequest*` directly. Each prints `N ok, M failed` and exits non-zero on failure.

## What each test covers

| test | covers |
|---|---|
| node/assistant_fn | `functions/api/assistant.js`: method/body limits, Origin check, auth via Supabase token, quota RPC outcomes → HTTP codes, NDJSON streaming reassembled across chunk splits, system prompt contents (site facts, prices, no links, injection-proof), cancel propagates to Anthropic, logs never contain keys (65 checks) |
| node/functions | Deezer proxy allow-list/params/methods; pay webhook method/signature/body limits/UTF-8; middleware hides `supabase/`, `tools/`, `*.md`, `.git`, and adds API headers; `_routes.json` (34) |
| sql/test_schema_security | `schema.sql` RLS/grants/validation/RPCs: owner & roles password, table privileges, profile columns and avatar URLs, songs/downloads, catalog + rate limits, billing validation, storage quotas, points (spend/refund/concurrent double-spend/admin grants), activity audit, referrals, roles-password lockout, Lemon Squeezy webhook (HMAC, replay, plan mapping), definer-function hardening sweep (174) |
| sql/test_points_v2 | points v2 (`supabase/points_v2.sql` = the schema.sql block, checked verbatim, run twice + on an install from before v2: old prices kept, new kinds + discounts added): every kind's price, plan discounts (pro −10 %, studio −25 %, ceil rounding, expired plan / no end date → none), a 0 price / billing off / admin / owner → free with no ledger row, insufficient, qty 0/501/null, bad kind, blocked, anon, ref cleaned; concurrency (two spends can't overdraw; the same song twice at once → one charge); `spend_song` once per account; RLS on `charged_songs` + ledger; partial refunds at the paid price (sum = charge), over-refund, other user, > 30 min, sep/song rows refused, 20/day + 100 units/day caps, sep refunds keep their own cap; settings guard clamps costs 0…100 / discount 0…90; Roomy price list (109) |
| sql/test_security_v3 | the `[security-v3]` block ([S-17…S-23]) + assistant.sql changes, each attacked as found in `SECURITY-AUDIT.md`: anon play-log fill, activity/download/catalog daily caps, 50 MB My Songs cap (upsert/update still fine), catalog link = own track, free `charged_songs` cap, checkout links/variants owner-only (settings role saves prices through the upsert), no sign-up gift without email, assistant confirmed-only + site-wide ceiling, webhook edge cases (unsigned/oversized/non-JSON/case), definer/private/RLS sweep; `security_v3.sql` = block + assistant.sql verbatim, applied twice on a pre-v3 install (92) |
| node/security_v3 | middleware hides repo files on a normalised path (encoded once/twice, `//`, `\`, `..`, trailing dot, case, `*.md` anywhere, `.git*`, `.claude/`, bad escapes), `_routes.json` case variants without a catch-all, only `/ai/worker.js` skips the CSP, page header set, assistant `site_limit` → 503 busy and the 12 000-char conversation cap (47) |
| sql/test_assistant_sql | `assistant.sql`: daily/burst quota per plan, admin unlimited, blocked/off, table privileges, admin-settable limits with validation, idempotent re-runs (49) |
| ui/test_smoke | local mode boots under CSP, demo analysed, every nav tab and hash opens its view, Discover lists the mock chart, zero CSP violations |
| ui/test_gate | routing + sign-in gate: home = About (no demo analysis at boot), the tool opens for guests with the demo + banner (key agrees with the title, export CTA), Discover/DJ/Crate gated, pricing/legal open, upload/My songs/export/separation/gate buttons open the auth dialog, sign-in opens the gated view and keeps the song, sign-out gates again, unknown hash → home + notice, per-view title, skip link; sign-up from home → tool + first hint; header + gate + guest tool layout in light/dark × he/en/ar × 375/1440 px |
| ui/test_header_fit | shell.js compaction: "כניסה"/"הרשמה"/"העלאת שיר" keep a visible label at 375/1024/1280/1440 px in all five languages (signed out + in), tabs use short names before the drawer, no drawer at 1024 (he/en/ar/es), no horizontal scroll |
| ui/test_seo | `<head>` title/description (Hebrew), canonical, OG/Twitter tags, og.png 1200×630 < 200 KB, PNG icons + apple-touch-icon, manifest JSON (192/512/maskable), robots.txt + sitemap.xml served, middleware/_routes leave them alone |
| ui/test_auth_signup | sign-up dialog: username availability, validation, strength, caps-lock, eye, terms consent (LEGAL.version sent), 6-digit code (wrong, resend cooldown, paste), welcome, header state; confirmation-off path; terms version in admin details; en/ar-dark dialogs |
| ui/test_auth_signin | sign-in: keyboard, errors, focus trap, Esc focus return, forgot-password by code, unconfirmed account → code step with auto-resend, reset-link flow, sign-up closed by admin |
| ui/test_auth_mobile | 375 px touch in he/en/ar: header, full-width auth sheet through all steps, terms page, TOC, nav drawer; no horizontal scroll anywhere |
| ui/test_legal_home | home content (Crate mentioned, no Camelot codes), terms/privacy in 5 languages, TOC keeps the hash, pricing footer, dark theme really dark |
| ui/test_welcome | first-visit language picker (suggested from the browser locale, focused, remembered, skipped under webdriver) at 1300/375 px |
| ui/test_per_user | Crate rows stored per account, tool song shown only to its account, activity logged and listed in the admin Activity tab |
| ui/test_roles | admin panel: owner tabs, custom role creation, roles password required/wrong/right, moderator sees only its tab and no role/block actions |
| ui/test_referral | `?ref=` stored → claimed once after sign-up → chip/box/card update; pricing card in en and ar-dark |
| ui/test_discover_player | Discover list + attribution, bottom player: play/next/pause/resume/volume saved/mute/prev (restart vs previous)/stop, 375 px, hidden when leaving |
| ui/test_crate_cues | synthetic EDM track (`fixtures/gen_edm.py`): BPM 128 and all six cues on the true bars; overview play/seek, grid moves shift cues, flag drag snaps to bars; rekordbox XML, Traktor NML, Serato GEOB in the ZIP MP3; reload keeps rows. Two **known issues** reported via `t.known` (see below) |
| ui/test_security | hostile backend + poisoned localStorage under the real CSP through every flow (home, pricing, tool + Signalsmith + MP3 export, AI separation start, Discover, DJ demo, Crate, account + all admin tabs): nothing executes, no injected markup, no request to the attacker host, zero CSP violations, each flow still works · hostile Deezer chart JSON (javascript: covers/links, attacker-host previews, non-numeric ids) · uploaded files with payload / formula / CR-LF / `CON` / dots / bidi-override names and payload ID3 tags through tool + My songs, Crate (CSV formula cells, renamed + USB ZIP entry names, M3U8 one line per field and = ZIP entries), Converter (tags, ZIP names), Mashup, DJ, Extended · payload hash / `?ref=` · javascript: contact on the legal pages · poisoned Mashup/Extended/Converter/voice/translit/a11y/pay-job settings |
| ui/test_bughunt | cross-screen sweep: every view (home, tool, discover, dj, crate, mashup, convert, extended, pricing, terms, privacy, a11y statement) × he/en/ar/ru/es × 1440/1024/375 (ru/es: 1440/375), light/dark alternating, signed in (admin) + overlays (account, admin tabs + user details, Roomy, a11y panel, drawer) + signed out (gate, guest tool, auth sign-in/forgot/sign-up): no console error / unhandled rejection / CSP violation, no horizontal scroll, no raw i18n key / `{placeholder}` / undefined / NaN, no English leftovers in he/ar/ru, FABs don't overlap each other or the bottom bars; static i18n completeness; focus into / trapped in / back from My songs, account, admin, DJ song picker; heap + DOM nodes + listeners bounded over 5 tool and DJ loads. `CR_BUGHUNT_LANGS=he,ar` limits languages, `CR_BUGHUNT_SHOTS=dir` saves a screenshot of every failing state (≈ 6 min) |
| ui/test_assistant_ui | Roomy panel: a11y + placement vs the a11y button (RTL/LTR), gate, suggestions per view, streaming + stop, request format and ctx, safe markdown, error states + retry, 2000-char cap, history rules, per-user sessionStorage, 5 languages, dark, lift above Discover player / Deezer bar, 375 px sheet + focus trap, teaser once, zero CSP violations |
| slow/test_extended_matrix | Extended on every `gen_styles` song + the club fixture × DJ / Club Extended (quick stems), each export measured by `extq.py` against the truth: no click at joins, beats continue (≤ 2 ms, live ≤ 12 ms), body level steps ≤ 1.5 LU, no sung line cut (DJ preset), bleed ≤ −12 dB, ending on the bar line; prints the table quoted in `REVIEW-EXTENDED.md` (≈ 8 min) |
| slow/test_separation | `ai/worker.js?v=2` with the real model on 12 s of p0.mp3: init → 'p'/'blk'/'done' protocol, blocks cover the input without gaps, stems finite and additive (sum = mix within 2 %), energy spread over drums/bass/other/vocals; in the app: 'sep' charged before the run, cancel refunds, chip back to the balance. Not an old-vs-new comparison (the pre-streaming worker is not in the repo) |
| ui/test_convert | Converter: gate, every fixture (tagged MP3/WAV/FLAC/OGG/M4A/MP4/AIFF from `fixtures/gen_media.py`) → MP3 with tags + cover kept (m4a/mp4/aiff through ffmpeg.wasm, loaded lazily), WAV 24-bit/48 k/mono + normalise/trim/fades verified from the header, FLAC/OGG/M4A targets with cover + BPM/key (mutagen), unique names, ZIP, cancel, options remembered, activity logged, Images tab (500 px JPG, WebP), he/ar/ru/es × dark × 375 px, zero CSP violations (110) |
| ui/test_extended | Extended generator on `fixtures/gen_club.py` (quick DSP stems): gate; BPM 128, key as a name, intro/verse/build/drop/break/drop/outro on the true bars (±1), Phrase lock ≥ 90 %, Groove ≥ 60 %; settings change the plan live, relabel (chip popover, Esc returns focus), drag a boundary (snaps to bars), reset; 96 preset × style × length plans valid + filtered/percussion renders; DJ intro = 16 bars of drums in kick + hats → full kit stages on 8-bar lines, loop seam ≥ 0.8 with a second phrase, outro ends on a downbeat hit + one-beat tail; generate: the first minute plays before the full render, which then takes over without stopping; exported WAV: duration, kicks at block starts (≤ 5 ms), no vocal energy in the DJ intro, unmodified blocks bit-identical, `extq.py`: no click at joins, beats continue (≤ 2 ms), level steps ≤ 1.5 LU, repeats keep their loudness, intro → original within 1.5 LU, ending on the bar line with a tail, in-app quality ≥ 85; MP3 320 (mutagen: duration, TBPM/TKEY, Serato Markers2, title), WAV 24/48; activity; preview: joins navigator (4 bars before → 4 after, J), quality details, volume saved, A/B at the mapped spot + T, loop block, hover tooltip; AI upgrade with a stubbed `CR.separateBuffer`; hide frees quick stems + render; he/ar RTL, dark, 375 px (preview controls inside the console), zero CSP violations; a sung pop song (`gen_styles` 'pop', Club Extended): whole repeated phrases, no sung line cut (truth), no click, bleed ≤ −12 dB, ends on the bar; a drifting live track: BPM refitted, every bar line ≤ 40 ms from the true downbeat (≈ 190 s) |
| ui/test_points | points v2 with the mock backend (same rules as the SQL): Crate 3 new songs → one dialog "3 songs × 1 = 3 points · balance 10 → 7", charged per song after its analysis, the same files again free, ledger labels; USB for Pioneer chip + one charge per folder; Pro −10 % (45 → 41) dialog line; short of points → "Only the first 1" ZIP / "Buy points" → #pricing; "don't ask again"; Tool upload once per song, DJ loads (paid song free, new one 1 point); Converter batch with a broken file refunded; Mashup/Extended export charged once (same mix/render again free); admin free; admin settings (cost per kind + plan discount) → saved → chips; billing off; generated pricing table (plan columns, Free rows, 5 languages, card discount lines); he/ar dark 375 px dialog, focus trap, Esc, zero CSP violations (102) |
| ui/test_griddrag | grid drag (FL Studio style) on `fixtures/gen_edm.py`: tool "Drag" toggle (aria-pressed, hint, undo/reset group), Ctrl+drag N px = N·win/width s at two zooms (playhead put), arrows ±1/±10 ms (one undo step), snap to the kick ≤ 2 ms + magnet, Ctrl = free, double click = downbeat, hot cue rides along, chords = detectChords on the new grid + sheet redrawn, bar-handle tempo stretch with bar 1 fixed, Ctrl+Z/Ctrl+Shift+Z, reset = detected, normal drag still scrubs, Shift+drag shortcut, reload keeps it, 5 languages + he/ar RTL, dark 375 px touch (CDP); Mashup (synthetic click songs): drag A two bars → align +2 and the WAV puts A's downbeats on B's bars (≤ 1 ms), Ctrl = free + lock off, undo, ±beat button; grid mode fixes A's 90 ms-late grid by snapping to its click (export on B's bars again), B grid drag moves B's bars (A follows), arrows, kept per pair after reload, he/ar dark; Crate Shift+drag = whole beats + cues, Ctrl = free; zero CSP violations |
| ui/test_assistant_md | `ROOMY._render` against 33 hostile markdown inputs: only allowed elements/attributes/hrefs, nothing executes, fast on pathological input |
| ui/test_chords | chord benchmark with ground truth (`fixtures/gen_chords.py`, 14 songs; `CR_CHORDS_FULL=1` ≈ 36): sheet labels after a real upload → majmin per beat ≥ 0.95 (each song ≥ 0.85), frame accuracy, change F1 + no early/late bias, key exact, bar lines, spelling; transpose/capo move every label, chord editor (beat + block); playback (`mock/audiotap.js`): the highlighted cell and "now" chord follow the HEARD audio (±40 ms, ≥ 95 % of beats) at 100 %, with tempo + key changed (Signalsmith latency = 120 ms from a click track) and with ~0.6 s output latency; `CR.analyzeTrack` = the tool (≈ 5 min) |

### Known app issues the suite reports (not failures)

`grep KNOWN /tmp/chordroom-tests/*.log` after a run. Currently (`test_crate_cues`):

1. **Beat grid locks onto off-beat hats.** With the synthetic track's off-beat closed hats at about −20 dB relative
   to the kick (`gen_edm.make(hat_gain=0.075)`), `CR.analyzeTrack` puts the grid half a beat off (phase 0.53) and
   every cue lands 0.69 s late. At −28 dB it is right. `fitGrid` scores `env + 2·lowEnv`; the broadband hat onsets
   outweigh the kick+bass on the beat.
2. ~~Music starting at 0:00 → cues one bar late.~~ Fixed: the onset envelope's frame time now includes the ~15 ms lag of
   the flux peak (`ENV_LAG` in app.js), so a first beat at 0.000 s is no longer estimated at −0.015 s and bar 1 is kept.
   `test_crate_cues` asserts it as a normal check now.

## Adding a test

1. Copy the closest `ui/test_*.py`, keep the module docstring (it is the spec), name it `test_<feature>.py`.
2. Prefer one browser context per scenario (`ctx.close()` between), assert with `t.check/t.eq`, screenshot the
   interesting states with `t.shot`.
3. Extend `mock/mockb.js` when the app calls a new Backend method (a neutral default), override per test.
4. Run it alone, then `run_all.sh -k <name>`, then the whole suite before handing over. Keep a test under ~3 min.
5. SQL: `sql/test_<x>.py` with `pg.Db(...)`; node: `node/<x>.test.mjs` printing `N ok, M failed`.
