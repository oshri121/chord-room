# Chord Room — music-domain review

Lens: a working DJ (rekordbox / Serato / Traktor, CDJ + DJM habits), a producer in FL Studio, a singer, and a music
teacher. Everything below was measured on the current `main` (commit `bff698a`) with synthetic tracks whose tempo,
downbeat, key and chord-per-beat are known, run through the *real* app in headless Chromium (local mode), plus a
reference LUFS meter (pyloudnorm, ITU-R BS.1770-4). Nothing in the app was changed.

Harness (scratchpad `review_f/`): `gen_band.py` (band-style tracks: pad + bass + drums, known progression, options for
lead-in, hat level, swing, half-time, off-beat bass, 3/4, tempo ramps, 7ths/sus/dim/slash chords),
`run_acc.py` (tool analysis → BPM / downbeat / key / chords), `run_lufs.py` (app vs BS.1770),
`run_cues.py` (gen_edm matrix → cue placement), `run_export.py` (Crate + tool exports), `run_dj.py` (SYNC), `run_drums.py`
(real Demucs run → drums / bass MIDI). Each analysis takes ≈ 2 s for a 40 s track, so the suites are cheap to re-run.

---

## 1. Accuracy results

### 1.1 Tempo (43 synthetic tracks, 70–175 BPM)

| condition | result |
|---|---|
| 84–156 BPM, any pattern (four-on-floor, rock, swing 33 %, shuffle 50 %, no drums, lead-in 0 / 0.25 / 0.5 / 2 s) | **exact** (±0.00 %) in 31/31 |
| 70, 72, 78, 80 BPM | reported **×2** (140 / 144 / 156 / 160) |
| 160, 168, 174, 175 BPM | reported **÷2** (80 / 84 / 87 / 87.5) |
| 150 BPM half-time ("trap 75") — kick on 1, snare on 3, 8th hats | **100 BPM** (a 2:3 alias; neither 75 nor 150) |
| off-beat bass house (bass on the "and", −20 dB hats) | exact BPM, but with a loud bass (`bass_level 0.4`) the grid sits **½ beat off** (phase 230 ms of 484), chords 76 % |
| tempo ramp 120→126 over 24 bars | 121.0 constant (expected: no tempo map) — chords still 96 % |
| tempo ramp 100→112 | 109.6 constant, downbeat −0.39 beat at the start |

The usable window is **84–156 BPM**; outside it the prior in `estimateTempo` (log-normal around 118 BPM, σ 0.55 oct)
folds the answer. rekordbox's default range is 78–165 and shows 80 BPM hip-hop as 80. The ½× answer for DnB matches
rekordbox's default, the ×2 for 70–80 BPM ballads/hip-hop does not, and the 3:2 alias on half-time trap is simply
wrong for a DJ (cannot be fixed by the ×2/÷2 button either).

### 1.2 Beat phase and downbeat

* **Constant −15 ms bias**: in every 4/4 case the grid is 11–17 ms *early* (mean −14.8 ms, 36 tracks). Cue points,
  rekordbox `TEMPO Inizio`, Traktor grid, Serato cues and the MIDI export all inherit it (cue "Drop" written at 45.485 s
  for a true 45.500 s). Source: `envTime()` places the onset frame at `f·OH + ON/2 − OH/2`; the flux peak sits ≈ 330
  samples later. A one-line correction (+15 ms, or `ON/2 + OH/4`) removes it.
* Downbeat: correct (−0.03 beat) in every case where the tempo octave was right. With the ÷2 answer (160+ BPM) the
  bar starts on the true beat 3 (−1.04 beats) in 2 of 3 cases, so chords come out 52–55 % there.
* The two known cue issues (README): reproduced with numbers (`run_cues.py`, gen_edm 128 BPM):

| hats (peak vs kick) | lead-in | grid phase (beat) | first downbeat | cue error |
|---|---|---|---|---|
| −28 dB (0.03) | 0.5 s | 0.03 | 0.485 s (true 0.500) | −0.01 bar (the −15 ms) |
| −28 dB | **0 s** | 0.97 | **1.861 s (true 0.000)** | **+0.99 bar**, build +4.99 |
| −28 dB | 1.3 s | 0.74 | 1.286 s (true 1.300) | −0.01 bar |
| −20.5 dB (0.075) and louder | 0.5 s | **0.53** | 1.188 s | +0.37 bar (= 1.5 beats) |
| −20.5 dB | 1.3 s | 0.24 | 1.051 s | −0.13 bar |

  The lead-0 bug is the −15 ms bias in disguise: the true first beat at 0.000 is estimated at −0.015, `buildBeats`
  starts at `mod(offset, T)` = 0.454 s, so the first bar is lost and `CUES.detect` (`k0 = −floor(fd/B)`) does not add
  a pickup bar for a downbeat that is only 15 ms before 0. The loud-hat bug is `genv = env + 2·lowEnv`: gen_edm's kick
  is a pure sine sweep with almost no broadband flux, so the hats own `env`. With the band generator (kick with more
  transient, snare on 2/4) hats at −14 dB did *not* move the grid, but **off-beat bass did** (see 1.1) — the same
  weighting locks onto whatever low-band event is strongest, and in tech-house that is the off-beat bass.

### 1.3 Key (35 tracks)

| progression type | exact | relative maj/min | wrong |
|---|---|---|---|
| major I–V–vi–IV, I–vi–IV–V (6 keys in the key suite + every major track of the tempo suites, 26 tracks) | 26 | 0 | 0 |
| minor with a major V (i–iv–V–i, i–VII–VI–V) | 6 | 0 | 0 |
| minor i–VI–III–VII (Am F C G — the most common pop/EDM minor loop), 5 keys | **0** | **5** | 0 |
| ii–V–I (Dm G C), 3 keys | 0 | 0 | **3** (reported the **dominant**: C major → G major) |

For DJs the relative confusion is harmless (same Camelot number), for a singer/teacher "C major" on an A-minor song is
wrong. `refineKey` only flips when the relative chord is ≥1.2× more frequent than the tonic; in Am–F–C–G they are
equal. A cheap, strong cue is missing: **the chord on bar 1 of each 4-bar phrase** (and the first/last chord) is the
tonic far more often than not. The ii–V–I miss is the harmonic content of the pad (5th harmonics push toward the
dominant); weighting the bass chroma more in `detectKey` (currently 0.5) or using the phrase-start rule fixes it.

### 1.4 Chords (beat-level accuracy vs the true progression)

| case | triad accuracy | note |
|---|---|---|
| triads, 1 chord/bar, four-on-floor bass (25 tracks) | **100 %** | |
| ½-bar changes, 2-bar changes | 100 % / 100 % | |
| kick-on-1-and-3 "rock" bass (bass only on beats 1 & 3) | 88–98 % | the change is placed one beat early/late at boundaries |
| swing / shuffle | 95 % / 89 % | same boundary effect |
| 7ths (Cmaj7 Dm7 G7) | 100 % as triads, 0 % as written | vocabulary = 24 triads + N.C. |
| sus4 / dim | Gsus4 → G, Bdim → Bm | |
| **slash chords** (C/E, G/B, Am, F/A) | **25 %** | C/E → Em, G/B → Bm, F/A → Am; key flips to A minor |
| 3/4 waltz (140 BPM, 96 BPM) | 94 % / 100 % per beat, **bars wrong** | meter is hard-wired to 4/4 |

Boundary errors: `detectChords` averages chroma frames from `beat+0.15` to `beat+T+0.05` with an 8192-sample (371 ms)
window, so the last frames already contain the next chord's downbeat bass. Inversions: `+0.25·bv[root]` rewards the
chord whose root is the bass note, so any inversion is read as a different chord. Both are S-size fixes.

### 1.5 Loudness (LUFS) — a real bug

| signal | app | BS.1770 ref | diff |
|---|---|---|---|
| 997 Hz sine −18 dBFS | −18.24 | −18.04 | −0.2 |
| 8 kHz sine −18 dBFS | −14.70 | −14.70 | 0.0 |
| **60 Hz sine −18 dBFS** | **−17.24** | **−21.62** | **+4.4** |
| white / pink noise | −13.95 / −26.56 | −13.93 / −27.01 | 0.0 / +0.4 |
| real previews p0 / p1 / p2 | −13.26 / −14.51 / −25.16 | −14.10 / −17.19 / −26.96 | **+0.8 / +2.7 / +1.8** |
| synthetic band tracks (36) | | | **+1.7 … +2.5** |

`measureLoudness` builds the K-weighting with `hp.Q.value = 0.5`, but in Web Audio the Q of `highpass`/`lowpass`
biquads is **in dB**, so 0.5 means Q ≈ 1.06 (a small resonance at 38 Hz, no roll-off) instead of the standard
Q = 0.5003 (−6.02 dB). Every bass-heavy track reads 1–3 LU too loud, which also skews the Crate's energy 1–10, the
DJ auto-gain (`−9 − lufs`) and any future reference-mastering feature. Fix (S): `hp.Q.value = 20*log10(0.5003) = −6.02`,
or implement the two BS.1770 biquads by hand (coefficients are published for 48 kHz and derivable for any rate).
Peak is sample peak, not true peak (fine, but label it "peak", not "dBTP").

### 1.6 Stems → MIDI (real Demucs run, 20 s synthetic band track, `run_drums.py`)

* Bass line MIDI: 16/16 notes with the right pitch class and octave (C2/G2/A1/F2), onsets −10 ms.
* Drums MIDI: kick 16/16, 0 extras. **Snare 16 true + 16 false** (fires on every beat: kick bleed in the 200–2600 Hz
  band passes the `q > 0.65` exception). **Hats 16 detected of 64, and those 16 are the snares** (hat band picks the
  snare noise; the real hats at −14 dB are below the p90 gate). The bleed filter works by time coincidence; a per-hit
  band-ratio test (low vs mid vs high energy of that hit) would be far more robust. Synthetic drums are harsh, but
  the failure mode (snare on kicks, hats = snares) is the one FL users will notice first.
* Chords MIDI: valid format 1, PPQ 480, tempo, 4/4, key signature (G = 1 sharp, minor flag right), markers per chord.
  **But events start at tick 466 (0.485 s), not on bar 1** — in FL Studio every chord block sits 14 ticks before beat 2
  of bar 1 and the user has to nudge everything. The WAVs start at 0 too, so they *do* line up with each other, just
  not with FL's bar grid. See export fix E1.

### 1.7 DJ SYNC / key lock (headless, `run_dj.py`)

Demo A 124 BPM + demo B 126 BPM: SYNC picks rate 0.9841 (k = 1), the synced PLAY waits for the bar, both decks read
the same bar phase (0.0 ms on the shared timeline; the owner's audio cross-correlation ≤ 1 ms is the real proof).
Moving A's tempo fader to −8 % moves B to the same 114.08 BPM (follower follows the master). Key lock semitones
= −12·log2(rate) (1.44 st at −8 %) — correct. Findings: the follower's `rate` is not clamped to its ±8 % range
(B ran at −9.5 % with the fader pinned; a CDJ caps at the range) and `d.tempo` is not updated on follow (only matters
for `cycleRange`). The demo hint declares C major for a track whose loop is Am–F–C–G ("Am" in `DEMOS`).

---

## 2. Export defects (what a real DJ / producer hits) and fixes

Validated files: rekordbox XML (Windows + macOS paths), Traktor NML, CSV, renamed ZIP, USB ZIP (MP3 with pre-existing
Serato tags + Hebrew ID3, FLAC), tool ZIP (WAV + MIDI). Structurally everything parses (ElementTree, mutagen, mido,
`wave`), so these are behavioural defects, not format errors.

| # | defect | who hits it | fix | effort |
|---|---|---|---|---|
| E1 | Tool ZIP: MIDI and WAV start at file time 0, first downbeat at 0.485 s → nothing is on FL's bar grid ("drop at bar 1, they line up" is true only relative to each other) | FL producers | Offer "start at first downbeat" (default on): trim all WAV/MP3 exports to the first downbeat (or pad to a whole bar) and shift MIDI by the same amount; write the offset into info.txt; add section markers (intro/drop…) as MIDI markers | S |
| E2 | Serato: an MP3 that Serato has ever touched carries `Serato Markers_` (v1), `Serato BeatGrid`, `Serato Autotags`. Chord Room keeps them and only replaces `Markers2`. Serato DJ Pro prefers `Markers_` for hot cues 1–5 → the new Intro/Vocal/Break/Build/Drop cues are ignored, only Outro shows; the stale BeatGrid/Autotags keep the old grid and BPM | Serato DJs (most second-hand files) | Also write a `Serato Markers_` with the same first 5 cues (documented layout, we already emit an empty-marker template in the test), write a `Serato BeatGrid` (1 terminal marker: first-beat position + BPM), drop `Serato Autotags` (or write BPM there) | S |
| E3 | Serato MP3 timing: Serato's own decoder offset (Mixxx applies 0 / 26 ms depending on the encoder) plus our −15 ms bias → cues can land ≈ 40 ms off in Serato | Serato DJs | Fix the 15 ms bias; apply Mixxx's `guessTimingOffsetMillis` heuristic (LAME tag present → 0, else 26 ms) | S |
| E4 | FLAC: cues never written (Serato reads `SERATO_MARKERS_V2` as a Vorbis comment) and in the renamed ZIP FLAC gets no BPM/KEY at all (only the USB flow tags FLAC); M4A/WAV/AIFF never get anything | DJs with lossless libraries | Write `BPM`, `INITIALKEY`, `SERATO_MARKERS_V2` (base64 of the same payload) in FLAC for both flows; AIFF has ID3 (`ID3 ` chunk) — same `tagMp3` code | S–M |
| E5 | rekordbox XML: single `TEMPO`, hot cues 0–5 only, no loops, `Comments` overwritten with the key name, `BitRate/SampleRate = 0`, no `Genre` | rekordbox DJs | Fine for import; add the intro→drop as a 8/16/32-bar memory loop (`Type="4"` with `End`) and keep `Comments` for the energy ("Energy 7") which is what Mixed In Key users expect | S |
| E6 | `TBPM` is `Math.round(bpm)` → 127.5 becomes 128 while the XML/NML carry 127.50; rekordbox re-analyses anyway but Serato shows the tag | all | write one decimal when the BPM is not integer | S |
| E7 | USB ZIP replaces an existing Hebrew `TIT2`/`TPE1` with the *file-name* parse in Latin ("שיר בדיקה" → "Serato Tagged") instead of transliterating the tag text | Pioneer USB users | transliterate the tag's own title/artist when present, use the file name only as a fallback | S |
| E8 | Traktor: `MUSICAL_KEY VALUE` uses 0–11 major / 12–23 minor chromatic from C (the commonly documented order) — verify once in Traktor with a known key, and Traktor's `INFO KEY` prefers Open Key text (`8d`) when the user's preference is Open Key | Traktor DJs | verify; optionally write both | S |
| E9 | Exports are always 4/4 (`Metro="4/4"`, drums quantised to 1/16 of a 4/4 bar) and constant tempo; no tempo map for ramps | live-band recordings, teachers | see feature F6 (meter) and L-size tempo map | M/L |

What is *right* and worth keeping: rekordbox `Battito`/`Inizio` arithmetic, `Tonality` spelling table, `file://localhost/C:/…` and `/Users/…` locations, Traktor `DIR="/:Users/:…/:"`, `VOLUME="C:"` / "Macintosh HD", `CUE_V2 TYPE 4` AutoGrid, Serato colour palette values, ID3 v2.3/v2.4 frame preservation, MIDI key-signature table, CSV formula-injection guard.

---

## 3. DJ mixer vs hardware

* EQ: shelves at **220 Hz / 1 kHz peaking / 3.6 kHz**, kill −60 dB, boost +6. A DJM is 70 Hz / 1 kHz / 13 kHz, −26 dB
  (−∞ in isolator mode). HI kill here removes everything above 3.6 kHz (vocal presence goes with it) and LOW kill
  takes low-mids up to ~300 Hz. Suggest 100 Hz / 1 kHz / 10 kHz, cut −26 dB with an "isolator" option for −∞. (S)
* No headphone cue / split cue. Without PFL a browser mixer is a practice toy; Chrome supports
  `AudioContext.setSinkId` (or `MediaStreamDestination` → second `<audio sinkId>`), so a second output device for cue is
  feasible. (M)
* No MIDI controller. Web MIDI + a DDJ-FLX4/400 map (jog, play/cue, tempo, EQ, faders, pads) turns it into something a
  bedroom DJ would actually use; the app already has every function these buttons need. (M)
* SYNC beyond the range is not capped; a follower can exceed ±8 % silently. (S)
* Quantize is always on for hot cues/loops (fine), pitch bend exists, slip/roll/brake exist — good parity for a browser.

---

## 4. Music-theory outputs

* Key names: spelled per key signature (F/Bb/Eb/Ab/Db/Gb majors and their relatives → flats) — correct.
* **Chord spelling follows the key's side only**: in C major the borrowed bVII shows as **A♯** (should be B♭), in G major
  bIII shows A♯; teachers and singers will notice. Rule: spell non-diatonic roots on the flat side (Db Eb Ab Bb) unless
  the key has ≥ 4 sharps, and F#/C#/G# as sharps unless ≥ 3 flats. (S)
* Vocabulary: 24 triads. No 7ths (the ii–V–I of every jazz/pop lesson shows as Dm G C), no sus, no dim, no inversions
  (1.4). Adding maj7/min7/dom7 + inversion-aware bass scoring is the single biggest win for the teacher/producer lens. (M)
* Modes: only major/minor profiles. Israeli repertoire is full of harmonic minor and Hijaz / Phrygian-dominant
  (Mizrahi, Greek-influenced pop): an E-Hijaz song will be reported as A minor or F major. Add harmonic-minor and
  Hijaz (Phrygian dominant) profiles to `detectKey`, display as "E Hijaz / E harmonic minor". (M)
* Meter: 4/4 only. "ירושלים של זהב" is in 3/4; 6/8 is common in Mizrahi ballads. Bars, downbeat, cue phrases and
  exports are wrong for them even though BPM and per-beat chords are right (1.4). A 3/4 vs 4/4 (and 6/8) test on the
  bar-energy autocorrelation is cheap; the sheet/exports need a `meter` field. (M)

---

## 5. Feature ideas, ranked (value × feasibility in a browser app)

Effort: S < 1 day, M 2–5 days, L > 1 week. "Pay" = who would pay for it in Israel.

| rank | idea | pay | effort | why |
|---|---|---|---|---|
| 1 | **Accuracy bundle**: LUFS filter Q, −15 ms grid bias, BPM window 78–165 + a range selector (58–123 / 78–165 / 88–185 like rekordbox), phrase-start tonic rule for minor keys, low-band phase from the kick band only when it is periodic (off-beat bass), chord-window trimming, inversion-aware bass | everyone | S–M | every other feature stands on these numbers; all are testable with the harness |
| 2 | **FL-ready export**: bar-1 = first downbeat, section markers, drum one-shots (kick/snare/hat samples cut from the drums stem at the detected hits), bar-aligned loops per section (drum loop / bass loop / top loop, named `Am 124 drop-loop.wav`) | producers | M | "steal the groove" is what producers do with stems; FL drag-and-drop works with plain files |
| 3 | **Karaoke / practice mode for singers**: instrumental stem + "My key" shift + lyrics (LRCLIB is a free, CORS-friendly lyrics API — one CSP origin) + live pitch line against the transcribed melody | singers, teachers | M | Israel's karaoke/sing-along culture; everything except lyrics already exists in the codebase |
| 4 | **Web MIDI controller + headphone cue** for the DJ view (DDJ-FLX4/400 map, `setSinkId` for PFL) | DJs learning / practising | M | turns the DJ view from demo into a practice rig; FLX4 is the most sold beginner controller in Israel |
| 5 | **Serato/FLAC/AIFF tag completeness** (E2–E4, E6) | DJs | S | cheap, and today the Serato path silently fails on used files |
| 6 | **Chord vocabulary + meter + Hijaz** (7ths, sus, dim, slash; 3/4 & 6/8; harmonic minor / Hijaz keys), printable lead sheet (print CSS, chords over bar lines, capo/transposed for Bb/Eb instruments) | teachers, singers | M | the teaching use-case is where accuracy is read note by note; Hijaz/6/8 is a local differentiator no global tool offers |
| 7 | **DJ edit maker**: extend intro/outro by N bars from the drums stem, "drop-only" edit, radio edit, all bar-aligned; export WAV/MP3 with cues | DJs | M | the most requested manual job in DJ prep; Mashup Studio already has the timeline/stretch plumbing |
| 8 | **Speed trainer & section loops** for practice: A/B loop with count-in, +2 % per pass, metronome accents, loop the chord grid (tool already has loops, rate, metronome) | teachers, students | S | classic Transcribe!/Amazing Slow Downer features; mostly UI |
| 9 | **Shareable read-only analysis page / set card** (`#s/<id>`): chords + key + BPM + cues, and a set list card (key/BPM/energy) as an image for WhatsApp | teachers → students, DJs → promoters | S–M | `songs`/`catalog` tables already hold the data; sharing is the growth loop |
| 10 | **Reference-track comparison** for producers: LUFS-I / LRA / true peak / spectrum tilt / stereo width of my mix vs a reference (needs 1 first) | producers | M | every FL user checks against a reference; browser-side is fine |
| 11 | Set energy curve + mix-in/mix-out suggestions per pair (use cues: play A to its outro, start B at its intro/break; "phrase-aligned 16-bar overlap") in the Crate | DJs | S | data exists (cues, energy, Camelot) |
| 12 | Camelot display toggle (per user) and Open Key | DJs | S | DJs talk in 8A; keep names as default |
| 13 | Vocal chops / acapella library: phrases from the vocals stem with key+BPM in the name; harmony generator (3rd/5th) | producers, singers | M/L | |
| 14 | Tempo map (beat tracking with drift) for live recordings, exported as multiple `TEMPO` nodes / MIDI tempo changes | teachers, bands | L | |
| 15 | Ableton `.als` (gzipped XML) project export with stems + MIDI at the right tempo | producers on Live | L | FL has no open format; Live does |

---

## 6. Top defects (shortest list)

1. LUFS K-weighting highpass Q in dB → +1…+3 LU on real music (1.5).
2. −15 ms grid bias → lead-0 songs lose bar 1, all cues/grids 15 ms early (1.2).
3. Tempo folded outside 84–156 BPM; half-time 150 → 100 (1.1).
4. ~~Minor keys with i–VI–III–VII reported as the relative major (0/5); ii–V–I reported as the dominant (1.3).~~ Fixed (§7: key from the chords).
5. ~~Slash chords misread (25 %)~~, ~~A♯ for B♭~~ — fixed (§7, `chordFlat`); 7ths still shown as triads (1.4, 4).
6. Serato cues ignored on files that already have `Serato Markers_` (E2).
7. MIDI/WAV export not on FL's bar grid (E1).
8. Drums MIDI: snare on every beat, hats = snares on the synthetic test (1.6).
9. Off-beat bass / loud off-beat hats pull the grid half a beat (1.1, 1.2).
10. No PFL / no MIDI controller in the DJ view (3).

---

## 7. Chords and the chord display during playback — fixed (2026-10-02)

Owner's report: "while the song plays, the chords it shows are not right for singing / playing along".

**Benchmark** (`tools/tests/fixtures/gen_chords.py` + `tools/tests/chordscore.py`, run by `tools/tests/ui/test_chords.py`): 29 songs
with known beats, key and chord per beat — piano with inharmonic partials and voice-led inversions, strummed guitar, pads, a bass
with approach notes / walking lines / slash basses, drums, a vocal-like lead with passing tones, suspensions and anticipations, room
reverb, ±6 ms human timing; 70–150 BPM, 12 keys (sharp and flat, major and minor), changes per bar / 2 beats / 2 bars, 7ths, 9ths,
sus, dim, a borrowed bVII, a pickup, chords pushed an 8th early, a 4 % tempo drift, −42 / +28 cents tuning, 3/4, a modulation; plus
a "+hard" tier (vocal 2.2×, bass 1.8×, 2.5× reverb, some through MP3 96 kbps). Score = MIREX majmin per true beat (7ths count as
their triad, sus/dim excluded), 20 ms frame accuracy vs the *sounding* chords, change F1 (±1 beat), key, bar lines, spelling.
Real previews (p0–p3 + a 75 s FMA song) were used as a "no one-beat flicker" check (no ground truth exists for them).

| (browser, real upload path) | before | after |
|---|---|---|
| majmin per beat, 29 songs | **0.960** (worst 0.688) | **0.999** (worst 0.969) |
| majmin per beat, hard tier (12) | 0.897 (worst 0.688) | 0.994 (worst 0.953) |
| slash chords C–G/B–Am–Em/G–F–C/E | 0.688 | 1.000 |
| pushed changes (chord on the "and" of 4) | 0.762, every change a beat early, bar 1 lost | 1.000, changes on the bar line |
| walking bass Gm7–C7–Fmaj7–Dm7 | 0.875 (Dm7 → F) | 1.000 |
| sustain-pedal ballad with inversions | 0.714 | 1.000 |
| key exact, 29 songs / hard tier | 23 / 3 of 12 (5 / 7 on the dominant) | 28 / 10 (rest = the relative of an ambiguous vi–IV–I–V loop) |
| bar lines on the true downbeat | 26/27 | 27/27 |
| real previews: one-beat chord blips | 0–6 per preview, changes a beat before the bar | 0–2, changes on the bar lines |

Root causes (measured):
1. **Late-biased beat window → changes shown early.** Each beat averaged frames centred up to `beat+T+50 ms` with a 372 ms window, so
   ~30 % of the last frames already held the next chord: on real previews most changes came out one beat early (e.g. "F F F A | A A A Dm"),
   and every anticipated change landed on beat 4. Now `spanChroma` weights each frame by the (squared) share of its Hann window inside the beat.
2. **Bass = root, always.** `+0.25·bass[root] − 0.08·bass[third]` read every inversion as the chord on the bass note (C/E → Em, G/B → Bm,
   Ab/C → Cm) and a walking bass's passing note as a new root. Now the bass supports a chord through its root (1), third (.6) or fifth (.5).
3. **Melody notes counted like chord tones.** Frames are now averaged as √magnitude (a note that comes and goes within the beat weighs less).
4. **No meter in the Viterbi.** The change penalty is now 0.75× on beat 1, 1.3× on 2/4 once the downbeat is known (second pass), and a
   change whose first half-beat still sounds like the old chord is an anticipation: counted on the next beat for the downbeat vote and moved
   to the bar line (that is where a chord sheet writes it). 3/4 songs are unaffected (100 %).
5. **Key from the profile only.** ii–V–I, pad-heavy and slash-chord songs came out on the dominant (Bb → F, C → G, G → D). `refineKey`
   now scores all 24 keys from the detected chords (diatonic share, tonic share, V→I / IV→I cadences, phrase starts, first/last chord)
   with the profile correlation as a tie-breaker. Spelling follows (no wrong-signature names left except inside a modulation).
6. **Tuning** is estimated (circular mean of the peaks' cent offsets on ≤ 120 frames) and corrected before binning: −42 c → measured −41.8 c.
   It mattered little in practice (round-to-nearest already survives ±45 c), but it removes the cliff at a quarter tone.
7. **Display timing.** Measured by recording what reaches `AudioContext.destination` (`mock/audiotap.js`) and comparing it with the
   highlighted sheet cell every frame: the Signalsmith latency was already compensated correctly (click-track: 119.7 ms vs `latency()`
   120 ms), but the **output latency was not** — the playhead, the sheet and "now/next" ran ahead of the sound by the device latency
   (36 ms in headless Chromium; 150–300 ms on Bluetooth headphones). With a 0.6 s output latency (latencyHint 0.3) the old display led
   by 689 ms and showed the heard chord on 50 % of the beats. Now `heard()` maps `getOutputTimestamp()` (extrapolated per frame;
   `outputLatency` as fallback) through the playback segments: lead −5…−14 ms in all three cases (100 %; −10 % + key +2; +12 % / key −3
   with 0.6 s latency), the right chord on 100 % of the beats. A live tempo change now keeps the old segment until it is heard (`P.seg0`):
   before, each nudge jumped the playhead by 120 ms × Δrate. Cue points set with the keyboard land where you heard them.
   Transposition / capo / edit: labels move by exactly the semitones, capo shows the played shapes, the editor still works (tested).

Not changed (by design / out of scope): the vocabulary is still 24 triads + N.C. — 7ths, sus and dim collapse to their triad (the
triad is right 100 % of the time on the 7th-heavy songs); one global key, so the spelling inside a modulation follows the home key
(F♯ for G♭ in the D♭ section); the grid is constant-tempo (4 % drift → 0.969); 70–80 BPM ballads still get ×2 tempo (REVIEW 1.1), so the
sheet shows each bar as two — the chords per beat are right.

Performance (4-minute song, headless Chromium, alternating runs on a loaded 2-CPU box): upload → sheet 16.8 s → 17.9 s median (+6 %,
the tuning pre-pass); the chord stage itself is ≈ 10–25 ms per song. The pre-pass yields every 30 frames, so the page never blocks longer than before.

Reproduce: `python3 tools/tests/ui/test_chords.py` (`CR_CHORDS_FULL=1` for every song + the hard tier); before/after harness and the
node runner of the DSP section used for tuning `CHP` are in the session scratchpad (`ch/nbench.py`, `ch/play2.py`, `ch/perf.py`).

Reproduce (§1–6): `python3 run_acc.py tempo|keychords|extra|meter`, `python3 run_lufs.py`, `python3 run_cues.py`,
`python3 run_export.py`, `python3 run_dj.py`, `python3 run_drums.py` (slow, real model) from the scratchpad
`review_f/` folder; outputs in `review_f/out/*.json|log`.
