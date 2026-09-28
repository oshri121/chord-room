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
