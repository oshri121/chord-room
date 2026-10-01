"""Synthesise a club track with a KNOWN arrangement (for the Extended generator test).

128 BPM, 4/4, bar = 1.875 s, 104 bars (+ `lead` s of silence first, 1 s after), 44.1 kHz stereo 16-bit WAV (~35 MB):
  bars   0–15  intro   kick on every beat + off-beat closed hats (drums only: a mixable intro)
  bars  16–31  verse   kick + hats + a centre-panned "vocal" (vibrato tone around 1.2 kHz, in 2-bar phrases)
  bars  32–39  build   no kick/bass: snare on 2 and 4 + a noise riser (highs rising into the drop)
  bars  40–55  drop    kick + sub bass (A F C G, one note per bar) + hats + a wide lead
  bars  56–71  break   wide pad + hats, no kick, no bass
  bars  72–87  drop    as the first drop
  bars  88–103 outro   kick + hats (drums only)
SECTIONS below = (label, first bar, end bar). Hats sit ≈ −28 dB under the kick (louder off-beat hats can pull the beat grid,
see the KNOWN issue in tests/README).

Usage: python3 gen_club.py OUT.wav     (or import: gen_club.make(path) → path)
"""
import sys, wave
import numpy as np

SR, BPM, BARS = 44100, 128.0, 104
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BASS = (55.0, 43.65, 65.41, 49.0)
SECTIONS = [('intro', 0, 16), ('verse', 16, 32), ('build', 32, 40), ('drop', 40, 56), ('break', 56, 72), ('drop', 72, 88), ('outro', 88, 104)]
VOCAL_HZ = 1200.0

def lab_of(b):
    for l, a, z in SECTIONS:
        if a <= b < z: return l
    return None

def make(path, seed=11, lead=0.5, hat_gain=0.03):
    rng = np.random.default_rng(seed)
    n = int((lead + BARS * BAR + 1.0) * SR)
    L = np.zeros(n); R = np.zeros(n)
    def put(sig, start, gl=1.0, gr=1.0):
        i = int(round(start * SR)); j = min(n, i + len(sig))
        if i >= n: return
        L[i:j] += sig[:j - i] * gl; R[i:j] += sig[:j - i] * gr
    def bt(b, beat=0.0): return lead + b * BAR + beat * BEAT
    def seg(b0, b1):
        i, j = int(round(bt(b0) * SR)), min(n, int(round(bt(b1) * SR))); return slice(i, j), np.arange(i, j) / SR
    tk = np.arange(int(0.25 * SR)) / SR
    kick = np.sin(2 * np.pi * (45 * tk + 80 * (1 - np.exp(-tk * 30)) / 30)) * np.exp(-tk * 12)
    th = np.arange(int(0.05 * SR)) / SR
    hat = np.diff(rng.standard_normal(len(th) + 1)) * np.exp(-th * 90) * hat_gain
    ts = np.arange(int(0.18 * SR)) / SR
    snare = rng.standard_normal(len(ts)) * np.exp(-ts * 22) * 0.16 + np.sin(2 * np.pi * 190 * ts) * np.exp(-ts * 30) * 0.2
    tb = np.arange(int(BEAT * 0.9 * SR)) / SR
    for b in range(BARS):
        l = lab_of(b)
        for q in range(4):
            if l in ('intro', 'verse', 'drop', 'outro'): put(kick * (0.9 if l == 'drop' else 0.8), bt(b, q))
            if l == 'drop': put(np.sin(2 * np.pi * BASS[b % 4] * tb) * 0.55 * np.minimum(1, tb * 200) * np.exp(-tb * 3), bt(b, q))
            if l != 'build': put(hat, bt(b, q + 0.5), 0.9, 1.1)
            if l == 'build' and q in (1, 3): put(snare, bt(b, q))
    # vocal: centre, vibrato tone with a harmonic, sung in 2-bar phrases (a short breath at the end of each)
    s, tt = seg(16, 32)
    f = VOCAL_HZ + 40 * np.sin(2 * np.pi * 5.5 * tt)
    ph = 2 * np.pi * np.cumsum(f) / SR
    pos = ((tt - bt(16)) % (2 * BAR)) / (2 * BAR)
    voc = (np.sin(ph) + 0.4 * np.sin(2 * ph)) * 0.13 * np.clip((0.92 - pos) * 30, 0, 1) * np.clip(pos * 60, 0, 1)
    L[s] += voc; R[s] += voc
    # riser: noise, highs rising over the build (decorrelated L/R)
    s, tt = seg(32, 40)
    ramp = ((tt - tt[0]) / (tt[-1] - tt[0])) ** 2
    nz = np.diff(rng.standard_normal(len(tt) + 1))
    L[s] += nz * ramp * 0.12; R[s] += np.roll(nz, 37) * ramp * 0.12
    # lead in the drops: wide (detuned + phase-shifted right channel), so it is not mistaken for a centred vocal
    for b0, b1 in ((40, 56), (72, 88)):
        s, tt = seg(b0, b1)
        L[s] += sum(np.sin(2 * np.pi * 440 * k * tt) / k for k in range(1, 6)) * 0.045
        R[s] += sum(np.sin(2 * np.pi * 440 * 1.006 * k * tt + 1.3 * k) / k for k in range(1, 6)) * 0.045
    # pad in the break: wide chord
    s, tt = seg(56, 72)
    for fr in (220, 277.2, 329.6, 440):
        L[s] += 0.05 * np.sin(2 * np.pi * fr * tt); R[s] += 0.05 * np.sin(2 * np.pi * fr * 1.004 * tt + 1.7)
    pk = max(np.abs(L).max(), np.abs(R).max())
    st = (np.stack([L, R], 1) / pk * 0.89 * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    return path

if __name__ == '__main__':
    print(make(sys.argv[1] if len(sys.argv) > 1 else 'club_test.wav'))

def make_drift(path, depth=0.015, seed=5):
    """A live-feel band track whose tempo ramps 120·(1−depth) → 120·(1+depth) over 88 bars (±6 ms human jitter): against the
    best constant grid its beats wander by ~±0.45 s. intro 8 (drums) · verse 16 · chorus 16 · break 8 (no drums) · verse 16 ·
    chorus 16 · outro 8. Returns (path, downbeat times of every bar)."""
    rng = np.random.default_rng(seed)
    plan = [('intro', 8), ('verse', 16), ('chorus', 16), ('break', 8), ('verse', 16), ('chorus', 16), ('outro', 8)]
    nb = sum(x[1] for x in plan); nbeats = nb * 4; lead = 0.4
    tempo = 120 * (1 - depth + 2 * depth * np.arange(nbeats + 1) / nbeats)
    bt = lead + np.concatenate([[0], np.cumsum(60 / tempo[:-1])])
    n = int((bt[-1] + 2) * SR); L = np.zeros(n); R = np.zeros(n)
    def put(sig, t, gl=1.0, gr=1.0):
        i = int(round(t * SR)); j = min(n, i + len(sig))
        if 0 <= i < n: L[i:j] += sig[:j - i] * gl; R[i:j] += sig[:j - i] * gr
    def tone(f, t, d, amp, wide=False, harm=3, vib=0.0):
        tt = np.arange(int(d * SR)) / SR; env = np.minimum(1, tt / 0.01) * np.minimum(1, np.maximum(0, (d - tt) / 0.05))
        ph = 2 * np.pi * np.cumsum(f * (1 + vib * np.sin(2 * np.pi * 5.3 * tt))) / SR
        x = sum(np.sin(k * ph) / k ** 1.5 for k in range(1, harm + 1)) * env * amp
        if wide: xr = sum(np.sin(k * ph * 1.004 + 1.3 * k) / k ** 1.5 for k in range(1, harm + 1)) * env * amp; put(x, t, 1, 0); put(xr, t, 0, 1)
        else: put(x, t)
    tk = np.arange(int(0.25 * SR)) / SR; kick = np.sin(2 * np.pi * (48 * tk + 80 * (1 - np.exp(-tk * 30)) / 30)) * np.exp(-tk * 12)
    th = np.arange(int(0.05 * SR)) / SR; hat = np.diff(rng.standard_normal(len(th) + 1)) * np.exp(-th * 90) * 0.035
    ts = np.arange(int(0.2 * SR)) / SR; snare = rng.standard_normal(len(ts)) * np.exp(-ts * 20) * 0.22 + np.sin(2 * np.pi * 190 * ts) * np.exp(-ts * 30) * 0.25
    root = (110.0, 87.31, 65.41, 98.0); chords = ((220, 261.6, 329.6), (174.6, 220, 261.6), (130.8, 164.8, 196), (196, 246.9, 293.7))
    b = 0
    for lab, cnt in plan:
        for k in range(cnt):
            bb = b + k; c = k % 4
            for q in range(4):
                i = bb * 4 + q; t = bt[i] + rng.normal(0, 0.006); T = bt[i + 1] - bt[i]
                if lab != 'break': put(kick * 0.8, t); put(hat, t + T / 2 + rng.normal(0, 0.004), 0.9, 1.1)
                if lab in ('verse', 'chorus') and q in (1, 3): put(snare, t)
                if lab in ('verse', 'chorus'): tone(root[c] / 2, bt[i], T * 0.85, 0.11)
            t0 = bt[bb * 4]; d = bt[bb * 4 + 4] - t0
            for f in chords[c]: tone(f, t0, d, 0.04 if lab == 'chorus' else 0.03, wide=True)
            if lab in ('verse', 'chorus'): tone((329.6, 293.7, 261.6, 293.7)[c] * (2 if lab == 'chorus' else 1), t0, d * 0.9, 0.08, harm=5, vib=0.012)
        b += cnt
    pk = max(np.abs(L).max(), np.abs(R).max()); st = (np.stack([L, R], 1) / pk * 0.89 * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    return path, bt[::4]
