"""Chord detection + chord display during playback, against ground truth (fixtures/gen_chords.py).

The generator synthesises band-style songs whose beats, key and chord per beat are known: piano (inharmonic partials,
voice-led inversions) or strummed guitar or pad, a bass with approach notes / walking / slash-chord basses, drums, a
vocal-like lead with non-chord tones, room reverb, ±6 ms human timing; tempos 70–150 BPM, major/minor, sharp and flat
keys, changes every bar / 2 beats / 2 bars, 7ths, sus, dim, a borrowed bVII, a pickup, anticipated ("pushed") changes,
a tempo drift, a tuning offset (−42 cents), 3/4, and "+hard" mixes (vocal 2.2×, bass 1.8×, 2.5× reverb).

1. Benchmark (local mode, real upload path): every song is loaded through #file and the sheet's beat labels are scored
   (tools/tests/chordscore.py): MIREX majmin per true beat ≥ 0.95 overall and ≥ 0.85 per song, 20 ms frame accuracy,
   chord changes within ±1 beat (F1), key exact (relative allowed only for genuinely ambiguous loops), bar lines on the
   true downbeat (4/4 songs), chord names spelled like the chart (Bb not A#, C#m not Dbm in E major).
   CR_CHORDS_FULL=1 runs all songs (≈ 30) instead of the default subset.
2. The display follows transposition and capo: +2 semitones → every sheet label moves by 2 (key too); capo 3 → the
   played shapes are 3 below the sounding chord; the chord editor still edits one beat / a whole block.
3. Playback timing (mock/audiotap.js records what reaches the speakers): the highlighted sheet cell and the "now" chord
   follow what is HEARD (getOutputTimestamp), not what was just scheduled — at 100 %, with tempo + key changed
   (Signalsmith in the path: its latency measured from a click track = 120 ms), and with ~0.6 s of output latency
   (latencyHint 0.3, a Bluetooth stand-in): display lead within ±40 ms, the right chord on ≥ 95 % of the beats.
4. CR.analyzeTrack (DJ / Crate / Mashup path) gives the tool's key and grid for the same song.
"""
import os, sys, json, time, wave, tempfile, hashlib
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import lib, chordscore
sys.path.insert(0, lib.FIX)
import gen_chords
import numpy as np

FULL = os.environ.get('CR_CHORDS_FULL') == '1'
SUBSET = ['pop_C_100', 'minor_Am_128', 'jazz_Bb_110', 'halfbar_D_96', 'mixo_G_136', 'pickup_Bb_104', 'drift_F_112',
          'slash_C_80', 'push_A_118', 'detuned_E_104', 'walk_F_124', 'waltz_D_150', 'pedal_Ab_70', 'vocal_G_96+hard']
HARD = ['pop_E_120+hard', 'jazz_Bb_110+hard', 'mixo_G_136+hard', 'slash_C_80+hard', 'push_A_118+hard', 'walk_F_124+hard']
NAMES = (list(gen_chords.SONGS) + HARD + ['vocal_G_96+hard']) if FULL else SUBSET
AMBIGUOUS = {'pop_E_120', 'pop_E_120+hard'}          # vi–IV–I–V loop: the relative minor is a fair answer
TAP = open(os.path.join(lib.MOCK_DIR, 'audiotap.js'), encoding='utf-8').read()

# generated audio is cached per generator version (≈ 3 s per song to make)
GEN = hashlib.sha1(open(gen_chords.__file__, 'rb').read()).hexdigest()[:10]
FX = os.path.join(tempfile.gettempdir(), f'cr-chords-{GEN}'); os.makedirs(FX, exist_ok=True)
def song(nm):
    p = os.path.join(FX, nm + '.wav')
    if not (os.path.exists(p) and os.path.exists(p[:-4] + '.json')): gen_chords.make(nm, p)
    return p, json.load(open(p[:-4] + '.json'))

def click_wav():
    p = os.path.join(FX, 'click.wav')
    if os.path.exists(p): return p
    sr = 32000; n = sr * 30; t = np.arange(n) / sr
    x = 0.05 * np.sin(2 * np.pi * 220 * t) + 0.04 * np.sin(2 * np.pi * 277.2 * t) + 0.04 * np.sin(2 * np.pi * 329.6 * t)
    for k in range(1, 59):
        i0 = int(k * 0.5 * sr); m = np.arange(400); x[i0:i0 + 400] += 0.9 * np.sin(2 * np.pi * 1500 * m / sr) * np.exp(-m / 60)
    st = (np.stack([x, x], 1) / np.abs(x).max() * 0.9 * 32767).astype('<i2')
    with wave.open(p, 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr); w.writeframes(st.tobytes())
    return p

def read_mono(path):
    with wave.open(path) as w:
        sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, w.getnchannels()).mean(1) / 32768
    return sr, x

LABELS = "()=>[...document.querySelectorAll('#sheet .cell:not(.empty)')].map(c=>c.getAttribute('aria-label').split(': ')[1])"
def load(pg, path, timeout=240):
    pg.set_input_files('#file', path); lib.wait_tool_song(pg, os.path.basename(path)[:-4], timeout=timeout)
    g = pg.evaluate("()=>{const s=CR.toolSong();return {bpm:s.bpm,offset:s.offset,down:s.down,key:s.key,dur:s.dur}}")
    g['labels'] = pg.evaluate(LABELS); g['keyName'] = pg.evaluate("document.querySelector('#sKey').textContent")
    return g

# ---------------------------------------------------------------- playback recording helpers
def recorded(pg):
    chunks = pg.evaluate("()=>__rec.chunks"); sr = pg.evaluate("__rec.sr"); st = pg.evaluate("()=>__rec.starts")
    f0 = min(c[0] for c in chunks); f1 = max(c[0] + len(c[1]) for c in chunks); rec = np.zeros(f1 - f0)
    for a, x in chunks: rec[a - f0:a - f0 + len(x)] = x
    return rec, sr, f0, st

def onsets(rec, sr):
    h = int(sr * 0.0005); n = len(rec) // h; e = (rec[:n * h].reshape(n, h) ** 2).sum(1); thr = np.median(e) * 20 + 1e-9; on = []; last = -1e9
    for i in range(1, n):
        if e[i] > thr and e[i - 1] <= thr and i - last > 400: on.append(i * h / sr); last = i
    return np.array(on)

def set_tempo_key(pg, rate, tr):
    if rate != 1:
        bpm = pg.evaluate("CR.toolSong().bpm"); pg.fill('#sBpm', f"{bpm * rate:.3f}"); pg.press('#sBpm', 'Enter')
    for _ in range(abs(tr)): pg.click('#trP' if tr > 0 else '#trM')

def chain_latency(pg, rate, tr):
    """source → destination delay with the tempo/key engine in the path, from a click track (onsets survive the shift)"""
    load(pg, click_wav(), 120); set_tempo_key(pg, rate, tr)
    pg.evaluate("()=>__rec.start()"); pg.click('#play'); time.sleep(4); pg.click('#play'); time.sleep(0.4)
    rec, sr, f0, st = recorded(pg); on = onsets(rec, sr) + f0 / sr; when, off = st[-1][0], st[-1][1]
    src = np.round((off + (on - when - 0.06) * rate) / 0.5) * 0.5
    return float(np.median(on - (when + (src - off) / rate))), len(on)

def playback(pg, path, truth, rate, tr, chain, secs=10):
    """play `secs` s; returns display lead over the heard position (ms), share of frames / beats showing the heard chord"""
    g = load(pg, path); set_tempo_key(pg, rate, tr)
    pg.evaluate("()=>{__disp.cells=null;__disp.rows=[];__rec.start();__disp.on=true}")
    pg.click('#play'); time.sleep(secs)
    pg.evaluate("()=>{__disp.on=false;document.querySelector('#play').click()}"); time.sleep(0.4)
    rows = [r for r in pg.evaluate("()=>__disp.rows") if r[2] is not None and r[3] >= 0]
    rec, sr, f0, st = recorded(pg)
    when, off = st[-1][0], st[-1][1]
    if chain is None:   # no stretcher in the path: align the recording with the file sample-exactly (waveform xcorr, ±0.3 s)
        ssr, x = read_mono(path); xs = np.interp(np.arange(int(len(rec) / sr * ssr)) / ssr, np.arange(len(rec)) / sr, rec)
        seg = xs[int(1.0 * ssr):int(5.0 * ssr)]; a0 = off + (f0 / sr - when) * rate + 1.0
        lo = max(0, int((a0 - 0.3) * ssr)); ref = x[lo:lo + len(seg) + int(0.6 * ssr)]
        nf = 1 << int(np.ceil(np.log2(len(ref) + len(seg))))
        cc = np.fft.irfft(np.fft.rfft(ref, nf) * np.conj(np.fft.rfft(seg, nf)), nf)[:len(ref) - len(seg)]
        a = (lo + int(np.argmax(cc))) / ssr - 1.0
    else: a = off + (f0 / sr - when) * rate - chain * rate
    srcAt = lambda tc: a + rate * (tc - f0 / sr)                 # source time heard at context time tc
    T = 60 / g['bpm']; first = g['offset'] % T
    best = (-1, 0, 0)
    for dl in np.arange(-0.8, 0.8, 0.002):
        f = sum(1 for r in rows if first + r[3] * T <= srcAt(r[2]) + dl * rate < first + (r[3] + 1) * T) / len(rows)
        if f > best[0] + 1e-9: best = (f, dl, dl)
        elif abs(f - best[0]) < 1e-9: best = (best[0], best[1], dl)
    snd = [dict(x, **dict(zip(('root', 'mm'), chordscore.parse_label(x['sym'])))) for x in truth['sounding']]
    edges = np.array([x['t0'] for x in snd]); tb = np.array(truth['beats'] + [truth['chords'][-1]['t1']])
    per = {}; okf = nf_ = 0
    for r in rows:
        hs = srcAt(r[2]); c = chordscore.truth_at(snd, hs)
        if not c or not c['mm'] or np.min(np.abs(edges - hs)) < 0.04: continue     # ±40 ms around a change: one frame either way
        gl = chordscore.parse_label(r[4]); good = bool(gl and gl[0] == (c['root'] + tr) % 12 and gl[1] == c['mm'])
        nf_ += 1; okf += good; per.setdefault(int(np.searchsorted(tb, hs, side='right') - 1), []).append(good)
    return dict(lead_ms=round(float(best[1] + best[2]) / 2 * 1000, 1), lead_fit=round(float(best[0]), 3), frames=len(rows),
                chord_frames=round(okf / max(1, nf_), 3), beats_ok=round(sum(1 for v in per.values() if np.mean(v) >= 0.75) / max(1, len(per)), 3),
                beats=len(per), out_ms=round(float(np.median([r[1] - r[2] for r in rows])) * 1000, 1) if rows else None)

def shift_label(lb, k):
    p = chordscore.parse_label(lb)
    return None if p is None else ((p[0] + k) % 12, p[1])

@lib.main
def test(t, srv, b):
    # ------------------------------------------------------------------ 1. benchmark
    t.section(f'benchmark: {len(NAMES)} songs (cache {FX})')
    files = {nm: song(nm) for nm in NAMES}
    ctx, pg = lib.page(b, srv, t, accounts=False, lang='en', init=lib.CSP_INIT)
    pg.goto(srv.url('#tool')); lib.wait_booted(pg); lib.wait_tool_song(pg, timeout=120)
    res = {}
    for nm in NAMES:
        path, tr = files[nm]; t0 = time.time()
        g = load(pg, path); r = chordscore.score(tr, g); res[nm] = r
        print(f"    {nm:<18} {g['bpm']:6.1f} BPM  key {g['keyName']:<4}({r['key']:<8}) majmin {r['beat_acc']:.3f}  frame {r['frame_acc']:.3f}  "
              f"seg F1 {r['seg_f']:.2f}  bars {r.get('down_ok', '-')}  {time.time() - t0:.1f}s  {r['errs'][:3]} {r['spell_errs'] or ''}", flush=True)
    print('   ', chordscore.summary(res))
    v = list(res.values()); n = sum(x['beat_n'] for x in v); acc = sum(x['beat_acc'] * x['beat_n'] for x in v) / n
    t.check('majmin per beat ≥ 0.95 over the set (target 0.85)', acc >= 0.95, f'{acc:.3f}')
    worst = min(res.items(), key=lambda kv: kv[1]['beat_acc'])
    t.check('every song ≥ 0.85 per beat', worst[1]['beat_acc'] >= 0.85, f'worst {worst[0]} {worst[1]["beat_acc"]:.3f}')
    fr = np.mean([x['frame_acc'] for x in v]); t.check('frame accuracy (20 ms, sounding chords) ≥ 0.93', fr >= 0.93, f'{fr:.3f}')
    sf = np.mean([x['seg_f'] for x in v]); t.check('chord changes within ±1 beat: F1 ≥ 0.93', sf >= 0.93, f'{sf:.3f}')
    off = [x['seg_off'] for x in v]; t.check('changes are not early/late on average (|median offset| ≤ 0.1 beat)', max(abs(o) for o in off) <= 0.1, f'{max(off, key=abs):+.2f}')
    bad = {k: x['key'] for k, x in res.items() if x['key'] != 'exact' and not (k in AMBIGUOUS and x['key'] == 'relative')}
    t.check('key exact (relative only on the ambiguous vi–IV–I–V loop)', not bad, bad)
    dn = {k: x['down_ok'] for k, x in res.items() if 'down_ok' in x}
    t.check('bar lines on the true downbeat (4/4 songs)', sum(dn.values()) >= len(dn) - 1, [k for k, ok in dn.items() if not ok])
    spn = sum(x['spell_n'] for x in v); spb = sum(x['spell_bad'] for x in v)
    t.check('chord names spelled like the chart (≥ 99 %)', spb <= 0.01 * spn, f'{spn - spb}/{spn} {sorted({e for x in v for e in x["spell_errs"]})}')
    t.shot(pg, 'sheet_' + NAMES[-1].replace('+', '_'))

    # ------------------------------------------------------------------ 2. transposition, capo, editing
    t.section('transpose / capo / edit')
    path, tr = files['pop_C_100']; g0 = load(pg, path); base = g0['labels']
    pg.click('#trP'); pg.click('#trP'); time.sleep(0.3)
    up = pg.evaluate(LABELS)
    t.check('+2 semitones: every sheet label moves up 2', all(shift_label(a, 2) == chordscore.parse_label(c) for a, c in zip(base, up)) and len(up) == len(base),
            f'{base[1:6]} → {up[1:6]}')
    t.eq('+2 semitones: key C → D', pg.evaluate("document.querySelector('#sKey').textContent"), 'D')
    pg.click('#trM'); pg.click('#trM'); time.sleep(0.2)
    for _ in range(3): pg.click('#cpP')
    cap = pg.evaluate(LABELS)
    t.check('capo 3: shapes are 3 below the sounding chord', all(shift_label(a, -3) == chordscore.parse_label(c) for a, c in zip(base, cap)), f'{base[1:6]} → {cap[1:6]}')
    for _ in range(3): pg.click('#cpM')
    t.check('capo back to 0 restores the labels', pg.evaluate(LABELS) == base)
    pg.click('#editBtn'); bi = 6
    pg.locator('#sheet .cell:not(.empty)').nth(bi).click(); lib.poll(pg, "!document.querySelector('#pop').hidden", 5)
    pg.click('#pop [data-r="2"]'); pg.click('#pop [data-q="1"]'); pg.click('#pop [data-a="1"]')
    ed = pg.evaluate(LABELS)
    t.check('edit one beat → Dm there only', ed[bi] == 'Dm' and ed[bi - 1] == base[bi - 1] and ed[bi + 1] == base[bi + 1], ed[bi - 1:bi + 2])
    t.check('edited beat is marked', pg.evaluate(f"document.querySelectorAll('#sheet .cell:not(.empty)')[{bi}].classList.contains('edited')"))
    pg.locator('#sheet .cell:not(.empty)').nth(bi + 4).click(); lib.poll(pg, "!document.querySelector('#pop').hidden", 5)
    pg.click('#pop [data-r="5"]'); pg.click('#pop [data-q="0"]'); pg.click('#pop [data-a="b"]')
    ed2 = pg.evaluate(LABELS); blk = [i for i in range(len(base)) if base[i] == base[bi + 4] and abs(i - (bi + 4)) < 4]
    t.check('edit a block → F on the whole block', all(ed2[i] == 'F' for i in blk), [ed2[i] for i in blk])
    pg.click('#editBtn')
    t.check('no CSP violations (benchmark)', lib.csp_violations(pg) == [], lib.csp_violations(pg)[:3])
    ctx.close()

    # ------------------------------------------------------------------ 3. playback: the display follows what is heard
    for title, lh, rate, trn, nm in [('100 %', None, 1.0, 0, 'pop_C_100'), ('tempo −10 % + key +2', None, 0.9, 2, 'halfbar_D_96'),
                                      ('~0.6 s output latency, tempo +12 % key −3', 0.3, 1.12, -3, 'halfbar_D_96')]:
        t.section('playback: ' + title)
        init = (f'window.__latencyHint={lh};' if lh is not None else '') + TAP
        ctx, pg = lib.page(b, srv, t, accounts=False, lang='en', init=init)
        pg.goto(srv.url('#tool')); lib.wait_booted(pg); lib.wait_tool_song(pg, timeout=120)
        chain = None
        if rate != 1 or trn:
            chain, n_on = chain_latency(pg, rate, trn)
            t.check('tempo/key engine latency = 120 ms (what the app compensates)', abs(chain - 0.12) < 0.006 and n_on >= 6, f'{chain * 1000:.1f} ms, {n_on} clicks')
        path, tr = files.get(nm) or song(nm)
        r = playback(pg, path, tr, rate, trn, chain)
        print('   ', r)
        t.check('display lead over the heard audio within ±40 ms', abs(r['lead_ms']) <= 40 and r['lead_fit'] >= 0.95, r)
        t.check('"now" chord = the chord being heard on ≥ 95 % of the beats', r['beats_ok'] >= 0.95 and r['chord_frames'] >= 0.95, r)
        ctx.close()

    # ------------------------------------------------------------------ 4. analyzeTrack (DJ / Crate / Mashup)
    t.section('CR.analyzeTrack')
    ctx, pg = lib.page(b, srv, t, accounts=False, lang='en')
    pg.goto(srv.url('#tool')); lib.wait_booted(pg); lib.wait_tool_song(pg, timeout=120)
    path, tr = files['jazz_Bb_110']; g = load(pg, path)
    a = pg.evaluate("async()=>{const s=CR.toolSong();const r=await CR.analyzeTrack(s.buffer);return {bpm:r.bpm,offset:r.offset,down:r.down,key:r.key}}")
    t.check('analyzeTrack = the tool (key, BPM, grid, downbeat)', a['key'] == g['key'] and abs(a['bpm'] - g['bpm']) < 1e-6 and abs(a['offset'] - g['offset']) < 1e-6 and a['down'] == g['down'], (a, {k: g[k] for k in ('bpm', 'offset', 'down', 'key')}))
    t.eq('analyzeTrack key = Bb major (ii–V–I, not the dominant)', a['key'], {'pc': 10, 'mode': 0})
    ctx.close()
