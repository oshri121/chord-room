"""Synthesise realistic test songs in several styles, with KNOWN beats, sections and vocal phrases (Extended generator audit).

Each song is built from synthesised parts that behave like the real thing for an edit: kicks with a long low tail (a DSP
stem split puts part of it in the bass), claps/snares, closed/open hats, shakers, darbuka (doum/tek), bass lines, wide pads,
stereo keys/guitar strums, crash cymbals on section starts (long tails), snare
fills/risers before drops, and VOCALS made by additive formant synthesis (vowels, vibrato, consonant noise bursts, reverb
tail) in phrases that start on pickups and run over bar lines, like a singer. Rap = short syllables on swung 16ths.

  house   124 BPM  long mixable intro (kick → +hats → +clap/shaker → +bass, 32 bars), break + build + drop, outro 16
  pop     100 BPM  intro 4 · verse · pre · chorus ×2 · bridge · double chorus · outro with a ringing final chord
  mizrahi  96 BPM  live feel: ±7 ms hits + slow tempo wander (±0.6 %), darbuka, centred melody, melismatic vocal
  hiphop   90 BPM  swung 16ths, laid-back snare, rap verses + sung hooks
  vocal1  118 BPM  vocals AND drums from bar 1 (no instrumental intro), ends on a vocal ad-lib
  pickup  110 BPM  a 1.5-beat vocal + guitar pickup before bar 1 (anacrusis), drums enter at the first chorus

make(style, path) → (path, truth) with truth = {style, bpm, downbeats: [bar start times], sections: [(label, a, b)],
vocal: [(t0, t1)] (sung, without the reverb tail), live: bool, sr, layers: [layer string per bar]}.
voc_stem=True also writes <path>.voc.wav (the vocals alone, same scale) for bleed measurements. Also writes <path>.json. 44.1 kHz stereo 16-bit.
Usage: python3 gen_styles.py STYLE OUT.wav   ·   python3 gen_styles.py all DIR
"""
import sys, os, json, wave
import numpy as np

SR = 44100
STYLES = ('house', 'pop', 'mizrahi', 'hiphop', 'vocal1', 'pickup')

# arrangement: (label, bars, layers); layers: k kick, s snare/clap, h hats, o open hats, z shaker, d darbuka, b bass, p pad,
# y keys/guitar, l lead synth, v vocal, r rap, c crash on the first beat, f fill in the last bar, x riser over the section,
# e ending (final chord + crash, ringing), 1..4 = a layer only enters in that quarter of the section (house intro build-up)
SONGS = {
 'house':  dict(bpm=124, lead=0.0, key=(57, 'm'), arr=[('intro', 32, 'k h2 s3 z3 b4'), ('break', 16, 'p v'), ('build', 8, 'p x f s'),
            ('drop', 16, 'k s h o z b p l v c'), ('break', 8, 'p v h'), ('drop', 16, 'k s h o z b p l v c f'), ('outro', 16, 'k h s z b1 b2')]),
 'pop':    dict(bpm=100, lead=0.3, key=(60, ''), arr=[('intro', 4, 'y k h'), ('verse', 8, 'y k s h b v'), ('pre', 4, 'y s h b v p f'),
            ('chorus', 8, 'y k s h o b p v c'), ('verse', 8, 'y k s h b v'), ('pre', 4, 'y s h b v p f'), ('chorus', 8, 'y k s h o b p v c'),
            ('bridge', 8, 'p y v'), ('chorus', 8, 'y k s h o b p v c'), ('chorus', 8, 'y k s h o b p v'), ('outro', 4, 'y p e')]),
 'mizrahi': dict(bpm=96, lead=0.25, key=(62, 'h'), live=True, arr=[('intro', 8, 'd b y p l'), ('verse', 16, 'd b y v'), ('chorus', 16, 'd k b y p v c'),
            ('inter', 8, 'd b y l p'), ('verse', 16, 'd b y v'), ('chorus', 16, 'd k b y p v c'), ('outro', 8, 'd b y l e')]),
 'hiphop': dict(bpm=90, lead=0.1, key=(53, 'm'), swing=0.62, arr=[('intro', 4, 'k s h y'), ('verse', 16, 'k s h y b r'), ('chorus', 8, 'k s h y b p v'),
            ('verse', 16, 'k s h y b r'), ('chorus', 8, 'k s h y b p v'), ('outro', 4, 'k s h y')]),
 'vocal1': dict(bpm=118, lead=0.0, key=(64, 'm'), arr=[('verse', 8, 'k h b y v'), ('pre', 4, 'k s h b y v f'), ('chorus', 8, 'k s h o b p y v c'),
            ('verse', 8, 'k h b y v'), ('pre', 4, 'k s h b y v f'), ('chorus', 8, 'k s h o b p y v c'), ('break', 8, 'p v'),
            ('chorus', 8, 'k s h o b p y v c'), ('outro', 4, 'k h b v')]),
 'pickup': dict(bpm=110, lead=0.2, key=(55, ''), pickup=1.5, arr=[('verse', 8, 'y v'), ('chorus', 8, 'y k s h b p v c'), ('verse', 8, 'y k h b v'),
            ('chorus', 8, 'y k s h b p v c'), ('bridge', 4, 'y p v'), ('chorus', 8, 'y k s h b p v c'), ('outro', 4, 'y e')]),
}
PROG = {'m': [(0, 'm'), (8, ''), (3, ''), (10, '')], '': [(0, ''), (7, ''), (9, 'm'), (5, '')], 'h': [(0, ''), (1, ''), (0, ''), (10, 'm')]}
SCALES = {'m': [0, 2, 3, 5, 7, 8, 10], '': [0, 2, 4, 5, 7, 9, 11], 'h': [0, 1, 4, 5, 7, 8, 10]}   # h = Hijaz (Mizrahi)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
VOWELS = [((730, 1090, 2440), (1, .5, .25)), ((530, 1840, 2480), (1, .45, .3)), ((270, 2290, 3010), (1, .3, .3)),
          ((570, 840, 2410), (1, .45, .2)), ((300, 870, 2240), (1, .3, .15))]


def make(style, path, seed=3, voc_stem=False):
    cfg = SONGS[style]; rng = np.random.default_rng(seed + STYLES.index(style))
    bpm = float(cfg['bpm']); T0 = 60.0 / bpm; lead = cfg['lead'] + cfg.get('pickup', 0) * T0
    arr = cfg['arr']; nb = sum(a[1] for a in arr); nbeats = nb * 4
    live, swing = cfg.get('live', False), cfg.get('swing', 0.5)
    # beat times (tempo wander for the live song), per-hit jitter is added at the hits
    if live:
        tempo = bpm * (1 + 0.006 * np.sin(2 * np.pi * np.arange(nbeats + 1) * T0 / 50.0))
        bt = lead + np.concatenate([[0], np.cumsum(60.0 / tempo[:-1])])
    else:
        bt = lead + np.arange(nbeats + 1) * T0
    tail = 5.0
    n = int((bt[-1] + tail) * SR); L = np.zeros(n); R = np.zeros(n); VL = np.zeros(n); VR = np.zeros(n)
    jit = (lambda: rng.normal(0, 0.007)) if live else (lambda: 0.0)

    def at(beat):   # time of a fractional beat index (the 2nd and 4th 16th of a beat are swung)
        i = int(np.floor(beat)); fr = beat - i; q = fr * 4; k = int(round(q))
        if abs(q - k) < 1e-6 and k in (1, 3): fr = (k - 1) / 4 + swing * 0.5
        if 0 <= i < nbeats: return bt[i] + fr * (bt[i + 1] - bt[i])
        return lead + (i + fr) * T0

    def put(sig, t, gl=1.0, gr=1.0, voc=False):
        i = int(round(t * SR))
        if i >= n or i + len(sig) <= 0: return
        a = max(0, -i); j = min(n, i + len(sig))
        (VL if voc else L)[i + a:j] += sig[a:j - i] * gl; (VR if voc else R)[i + a:j] += sig[a:j - i] * gr

    def tt(d): return np.arange(int(d * SR)) / SR
    def noise(d): return rng.standard_normal(int(d * SR))
    def hp(x, k=1):
        for _ in range(k): x = np.diff(x, prepend=0)
        return x

    t_k = tt(0.42); kick = (np.sin(2 * np.pi * (46 * t_k + 110 * (1 - np.exp(-t_k * 28)) / 28)) * np.exp(-t_k * 7.5)
                           + 0.25 * hp(noise(0.42)) * np.exp(-t_k * 300)) * 0.85
    t_s = tt(0.25); clap = (hp(noise(0.25)) * 0.5 * (np.exp(-t_s * 18) + 0.6 * np.exp(-((t_s - 0.012) % 0.011) * 400) * (t_s < 0.035))
                           + 0.25 * np.sin(2 * np.pi * 185 * t_s) * np.exp(-t_s * 30)) * 0.45
    t_h = tt(0.06); chat = hp(noise(0.06), 2) * np.exp(-t_h * 80) * 0.09
    t_o = tt(0.35); ohat = hp(noise(0.35), 2) * np.exp(-t_o * 9) * 0.07
    t_z = tt(0.05); shak = hp(noise(0.05)) * np.sin(np.pi * np.clip(t_z / 0.05, 0, 1)) * 0.05
    t_d = tt(0.3); doum = np.sin(2 * np.pi * (85 * t_d + 30 * (1 - np.exp(-t_d * 40)) / 40)) * np.exp(-t_d * 11) * 0.6
    tek = (hp(noise(0.08), 2) * np.exp(-tt(0.08) * 70) * 0.18 + np.sin(2 * np.pi * 620 * tt(0.08)) * np.exp(-tt(0.08) * 60) * 0.12)
    t_c = tt(2.6); crash = hp(noise(2.6), 2) * np.exp(-t_c * 1.6) * 0.08

    key, mode = cfg['key']; prog = PROG[mode]; scale = SCALES[mode]
    sec_of_bar = []; [sec_of_bar.extend([(li, k, cnt) for k in range(cnt)]) for li, (lab, cnt, lay) in enumerate(arr)]
    vocal_iv = []

    def chord(bar):
        r, q = prog[bar % 4]; root = key + r
        return root, [root, root + (3 if q == 'm' else 4), root + 7]

    def has(lay, ch, k, cnt):
        for tok in lay.split():
            if tok[0] == ch:
                if len(tok) == 1: return True
                qq = int(tok[1]); return k >= (qq - 1) * cnt // 4
        return False

    def tone(f, t, d, amp, wide=0.0, harm=4, decay=0.0, att=0.01, rel=0.08, vib=0.0, gl=1.0, gr=1.0):
        x = tt(d + rel); env = np.minimum(1, x / att) * np.clip((d + rel - x) / rel, 0, 1) * (np.exp(-x * decay) if decay else 1)
        ph = 2 * np.pi * np.cumsum(f * (1 + vib * np.sin(2 * np.pi * 5.2 * x))) / SR
        s = sum(np.sin(h * ph) / h ** 1.3 for h in range(1, harm + 1)) * env * amp
        if wide:
            s2 = sum(np.sin(h * ph * (1 + 0.004 * wide) + 1.1 * h) / h ** 1.3 for h in range(1, harm + 1)) * env * amp
            put(s, t, gl, 0); put(s2, t, 0, gr)
        else: put(s, t, gl, gr)

    def sing(notes, rap=False):
        """notes: [(t0, dur, midi, vowel)] → additive formant vocal (centre) + consonant bursts; records the phrase interval"""
        if not notes: return
        t0 = notes[0][0] - 0.03; t1 = notes[-1][0] + notes[-1][1]
        d = t1 - t0 + 0.15; x = tt(d); m = len(x)
        f0 = np.zeros(m); amp = np.zeros(m); vw = np.zeros(m, int)
        for (ts, du, mi, v) in notes:
            a = int((ts - t0) * SR); z = min(m, int((ts - t0 + du) * SR))
            f0[a:z] = hz(mi); vw[a:z] = v
            e = np.ones(z - a); na = min(len(e), int(0.025 * SR)); nr = min(len(e), int((0.03 if rap else 0.07) * SR))
            e[:na] *= np.linspace(0, 1, na); e[len(e) - nr:] *= np.linspace(1, 0, nr); amp[a:z] = np.maximum(amp[a:z], e)
            if rng.random() < (0.6 if rap else 0.35):     # consonant: a noise burst 2–8 kHz before the vowel
                cb = hp(rng.standard_normal(int(0.04 * SR)), 2) * np.hanning(int(0.04 * SR)) * (0.05 if rap else 0.035)
                put(cb, ts - 0.02, voc=True)
        # glide between notes (portamento 50 ms, melisma), vibrato after 150 ms of a note
        nz = f0 > 0; idx = np.where(nz, np.arange(m), 0); np.maximum.accumulate(idx, out=idx); f0 = np.where(nz, f0, f0[idx])
        k = int(0.05 * SR); f0 = np.convolve(np.pad(f0, (k, k), mode='edge'), np.ones(k) / k, mode='same')[k:-k]
        vib = (0.0 if rap else (0.022 if style == 'mizrahi' else 0.013)) * np.sin(2 * np.pi * 5.6 * x)
        ph = 2 * np.pi * np.cumsum(f0 * (1 + vib)) / SR
        out = np.zeros(m)
        F = np.array([VOWELS[v][0] for v in range(5)], float); G = np.array([VOWELS[v][1] for v in range(5)], float)
        Fi = F[vw]; Gi = G[vw]
        for h in range(1, 28):
            fh = f0 * h
            if fh.max() > 9000: break
            ga = sum(Gi[:, j] / (1 + ((fh - Fi[:, j]) / (80 + 0.08 * Fi[:, j])) ** 2) for j in range(3))
            out += np.sin(h * ph) * ga / h ** 0.6
        out *= amp * (0.06 if rap else 0.05); out[-int(0.15 * SR):] *= np.linspace(1, 0, int(0.15 * SR))
        put(out, t0, voc=True)
        vocal_iv.append((round(float(notes[0][0]), 4), round(float(t1), 4)))

    beat0 = lambda b: b * 4
    for b in range(nb):
        li, k, cnt = sec_of_bar[b]; lab, _, lay = arr[li]
        root, ch = chord(b); B4 = beat0(b)
        # drums
        for q in range(4):
            if has(lay, 'k', k, cnt):
                if style == 'hiphop':
                    if q == 0: put(kick, at(B4) + jit())
                    if q == 2: put(kick * 0.8, at(B4 + 2.5) + jit())
                    if q == 1 and k % 2 == 1: put(kick * 0.6, at(B4 + 1.75) + jit())
                elif style == 'mizrahi':
                    if q in (0, 2): put(kick * 0.8, at(B4 + q) + jit())
                else: put(kick, at(B4 + q) + jit())
            if has(lay, 's', k, cnt) and q in (1, 3):
                lag = 0.012 if style == 'hiphop' else 0.0
                put(clap, at(B4 + q) + lag + jit(), 0.95, 1.05)
            if has(lay, 'h', k, cnt):
                if style in ('hiphop', 'pop', 'vocal1', 'pickup'):
                    for e in (0, 0.5): put(chat * (1 if e else 0.7), at(B4 + q + e) + jit(), 0.8, 1.2)
                else: put(chat, at(B4 + q + 0.5) + jit(), 0.85, 1.15)
            if has(lay, 'o', k, cnt): put(ohat, at(B4 + q + 0.5) + jit(), 1.1, 0.9)
            if has(lay, 'z', k, cnt):
                for e in (0, 0.25, 0.5, 0.75): put(shak * (1.0 if e in (0.25, 0.75) else 0.6), at(B4 + q + e) + jit(), 1.2, 0.8)
            if has(lay, 'd', k, cnt):   # maqsum-ish: D t t D t (doum on 1, 2.5; tek on the rest)
                for e, s in ((0, 'D'), (0.5, 't'), (1.0, 't'), (1.5, 'D'), (2.0, 't'), (3.0, 'D'), (3.5, 't')):
                    if int(e) == q: put(doum if s == 'D' else tek, at(B4 + e) + jit(), 0.9, 1.1)
        if has(lay, 'c', k, cnt) and k == 0: put(crash, at(B4) + jit(), 1.0, 0.9)
        if has(lay, 'f', k, cnt) and k == cnt - 1:   # snare roll / fill in the last bar
            for e in np.arange(0, 4, 0.25 if lab != 'build' else 0.125): put(clap * (0.4 + 0.15 * e), at(B4 + e) + jit())
        if has(lay, 'x', k, cnt):
            d = bt[min(nbeats, B4 + 4)] - bt[B4]; x = tt(d); pos = (k + x / d) / cnt
            nz = hp(rng.standard_normal(len(x))) * (pos ** 2) * 0.06
            put(nz, bt[B4], 1, 0); put(np.roll(nz, 113), bt[B4], 0, 1)
        # bass
        if has(lay, 'b', k, cnt):
            f = hz(root - 24 if root - 24 >= 33 else root - 12)
            if style == 'house':
                for q in range(4): tone(f, at(B4 + q + 0.5), T0 * 0.4, 0.22, harm=3)
            elif style == 'mizrahi':
                for e in (0, 1.5, 3): tone(f, at(B4 + e) + jit(), T0 * 0.8, 0.22, harm=3, decay=3)
            elif style == 'hiphop':
                tone(f, at(B4), T0 * 1.4, 0.26, harm=2, decay=1.2); tone(f, at(B4 + 2.5), T0 * 1.2, 0.22, harm=2, decay=1.5)
            else:
                for q in range(4): tone(f, at(B4 + q), T0 * 0.85, 0.2, harm=3, decay=2)
        # pad (wide)
        if has(lay, 'p', k, cnt):
            d = bt[min(nbeats, B4 + 4)] - bt[B4]
            for m_ in ch: tone(hz(m_), bt[B4], d, 0.028, wide=1.0, harm=5, att=0.15, rel=0.3)
        # keys / guitar: stereo stabs (a stereo piano / doubled guitar: not in the centre where the lead vocal sits)
        if has(lay, 'y', k, cnt):
            pat = (0, 1.5, 2.5) if style in ('house', 'vocal1') else (0, 1, 2, 3) if style == 'mizrahi' else (0, 0.75, 1.5, 2, 2.75, 3.5) if style == 'pickup' else (0, 2, 2.5)
            for e in pat:
                for m_ in ch: tone(hz(m_ + 12), at(B4 + e) + jit(), T0 * 0.6, 0.022, wide=0.8, harm=6, decay=4, gl=1.0, gr=0.8)
        # lead synth (wide)
        if has(lay, 'l', k, cnt):
            mel = [scale[(i * 2 + b) % 7] for i in range(4)]
            for i, e in enumerate((0, 1, 2, 3)): tone(hz(key + 12 + mel[i]), at(B4 + e) + jit(), T0 * 0.9, 0.03, wide=1.0, harm=6)
        if has(lay, 'e', k, cnt) and k == cnt - 1:   # ending: final chord + crash on the next downbeat, ringing
            tE = bt[min(nbeats, B4 + 4)]
            for m_ in ch: tone(hz(m_ - 12 if m_ > 60 else m_), tE, 3.2, 0.05, wide=0.6, harm=6, decay=0.9, rel=0.5)
            put(crash * 1.2, tE); put(kick, tE)
    # vocals: phrases of 2 bars, pickups on "and of 4", over bar lines, melismas for Mizrahi; rap = 16ths
    for li, (lab, cnt, lay) in enumerate(arr):
        b0 = sum(a[1] for a in arr[:li]); rap = 'r' in lay.split()
        if not ('v' in lay.split() or rap): continue
        hi = lab in ('chorus', 'drop')
        for p in range(0, cnt, 2):
            if lab in ('break', 'bridge') and p % 4 == 2 and style != 'vocal1': continue   # breathing room
            B = b0 + p; notes = []
            if rap:
                for e in np.arange(0, 7.5, 0.25):
                    if rng.random() < 0.82:
                        notes.append((at(beat0(B) + e), T0 * 0.19, key - 7 + (2 if (e % 1) == 0 else 0) + int(rng.integers(-1, 2)), int(rng.integers(0, 5))))
            else:
                start = -0.5 if (p // 2) % 2 == 0 and B > 0 else 0.5        # every other phrase starts on a pickup
                if style == 'pickup' and B == 0: start = -1.5
                if style == 'mizrahi': start = 1.0 if (p // 2) % 2 else -0.5
                e = start; deg = 4 if hi else 2
                end = (6.5 if style in ('mizrahi', 'pickup') else 5.5) + float(rng.integers(0, 2))   # some phrases run to the next bar line
                while e < end:
                    du = 0.5 if rng.random() < 0.6 else 1.0
                    if style == 'mizrahi' and rng.random() < 0.35:   # melisma: 3 quick notes on one vowel
                        v = int(rng.integers(0, 5))
                        for j in range(3):
                            notes.append((at(beat0(B) + e) + jit() * 0.5, T0 * du / 3 * 1.05, key + 12 * hi + scale[(deg + j) % 7] + (12 if (deg + j) >= 7 else 0), v))
                            e += du / 3
                        deg = max(0, min(8, deg + int(rng.integers(-2, 3)))); continue
                    deg = max(0, min(8, deg + int(rng.integers(-2, 3))))
                    m_ = key + (12 if hi else 0) + scale[deg % 7] + (12 if deg >= 7 else 0)
                    if m_ > 79: m_ -= 12
                    if m_ < 57: m_ += 12
                    notes.append((at(beat0(B) + e) + jit() * 0.5, T0 * du * 0.92, m_, int(rng.integers(0, 5)))); e += du
                if notes: notes[-1] = (notes[-1][0], T0 * 1.2, notes[-1][2], notes[-1][3])   # held last note, then a breath
            sing(notes, rap)
    # vocal reverb (stereo, decorrelated) + mix
    ir_t = tt(1.4)
    for V, sd in ((VL, 1), (VR, 2)):
        ir = np.random.default_rng(100 + sd).standard_normal(len(ir_t)) * np.exp(-ir_t * 4.5); ir[:int(0.02 * SR)] = 0; ir *= 0.3 / np.sqrt((ir ** 2).sum())   # wet ≈ −10 dB
        N = 1 << int(np.ceil(np.log2(n + len(ir)))); wet = np.fft.irfft(np.fft.rfft(V, N) * np.fft.rfft(ir, N), N)[:n]
        V += wet
    L += VL; R += VR
    VOC = (VL, VR)
    if style == 'pop' or style == 'pickup':   # the song really ends: fade the last 0.5 s of the tail
        z = int((bt[-1] + 3.6) * SR); L[z:] *= 0; R[z:] *= 0
    pk = max(np.abs(L).max(), np.abs(R).max()); st = (np.stack([L, R], 1) / pk * 0.89 * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    if voc_stem:   # the vocals alone, same scale as the mix (bleed measurements)
        vs = (np.stack(VOC, 1) / pk * 0.89 * 32767).astype('<i2')
        with wave.open(path + '.voc.wav', 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(vs.tobytes())
    secs, a = [], 0
    for lab, cnt, _ in arr: secs.append((lab, a, a + cnt)); a += cnt
    truth = dict(style=style, bpm=bpm, downbeats=[round(float(x), 5) for x in bt[::4]], sections=secs, vocal=vocal_iv, live=live, sr=SR,
                 pickup=cfg.get('pickup', 0), layers=[arr[sec_of_bar[b][0]][2] for b in range(nb)])
    json.dump(truth, open(path + '.json', 'w'))
    return path, truth


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'all':
        d = sys.argv[2] if len(sys.argv) > 2 else '.'
        os.makedirs(d, exist_ok=True)
        for s in STYLES: print(make(s, os.path.join(d, s + '.wav'), voc_stem=True)[0])
    else:
        print(make(sys.argv[1] if len(sys.argv) > 1 else 'pop', sys.argv[2] if len(sys.argv) > 2 else 'style_test.wav')[0])
