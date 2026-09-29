"""Synthesise a small EDM-shaped test track with a KNOWN structure (for the Crate cue tests).

128 BPM, 4/4, bar = 1.875 s, 48 bars = 90 s (+ `lead` s of silence first), 16 kHz stereo 16-bit WAV (~6 MB):
  bars  0–11  intro   kick + bass on every beat (bass note changes every bar: A F C G), off-beat closed hats
  bars  4–11          + a centre-panned "vocal" (vibrato tone, 0.8–3.5 kHz band)
  bars 12–23  break   wide stereo pad only (no kick/bass)
  bars 16–23  build   + noise riser, highs rising into the drop
  bars 24–35  drop    kick + louder bass + hats + lead
  bars 36–47  outro   hats + pad (bass gone)
Expected cue bars (CUES.detect; time = lead + bar·1.875 s): EXPECT below.

Knobs that expose KNOWN issues of the current analysis (see ui/test_crate_cues.py):
  hat_gain  peak level of the off-beat hats (kick peak ≈ 0.8). Default 0.03 (≈ -28 dB); louder hats can make the
            beat grid lock onto the off-beat instead of the kick + bass.
  lead      seconds of silence before bar 0 (default 0.5). With lead=0 (music starts exactly on a downbeat at 0:00)
            the downbeat, and so every cue, can come out late.

Usage: python3 gen_edm.py OUT.wav [hat_gain] [lead]      (or import: gen_edm.make(path, ...) → path)
"""
import sys, wave
import numpy as np

SR, BPM, BARS = 16000, 128.0, 48
BEAT = 60.0 / BPM
BAR = 4 * BEAT
BASS = (55.0, 43.65, 65.41, 49.0)
INTRO, VOCAL, BREAK, BUILD, DROP, OUTRO = 0, 4, 12, 16, 24, 36
EXPECT = {'intro': INTRO, 'vocal': VOCAL, 'break': BREAK, 'build': BUILD, 'drop': DROP, 'outro': OUTRO}

def make(path, seed=7, hat_gain=0.03, lead=0.5):
    rng = np.random.default_rng(seed)
    n = int((lead + BARS * BAR) * SR) + SR // 2
    L = np.zeros(n); R = np.zeros(n)
    t_all = np.arange(n) / SR
    def put(sig, start, gl=1.0, gr=1.0):
        i = int(start * SR); j = min(n, i + len(sig))
        if i >= n: return
        L[i:j] += sig[:j - i] * gl; R[i:j] += sig[:j - i] * gr
    def bar_t(b, beat=0.0): return lead + b * BAR + beat * BEAT
    def seg(b0, b1):
        i, j = int(bar_t(b0) * SR), min(n, int(bar_t(b1) * SR)); return slice(i, j), t_all[i:j]
    # one-shots
    tk = np.arange(int(0.25 * SR)) / SR
    kick = np.sin(2 * np.pi * (45 * tk + 80 * (1 - np.exp(-tk * 30)) / 30)) * np.exp(-tk * 12)
    th = np.arange(int(0.05 * SR)) / SR
    hat = np.diff(rng.standard_normal(len(th) + 1)) * np.exp(-th * 90) * hat_gain   # differentiated noise ≈ highs
    tb = np.arange(int(BEAT * 0.9 * SR)) / SR
    for b in range(BARS):
        drums = b < BREAK or DROP <= b < OUTRO
        for q in range(4):
            if drums:
                put(kick * (0.9 if b >= DROP else 0.8), bar_t(b, q))
                amp = 0.55 if b >= DROP else 0.4                   # bass on the beat, note changes every bar
                put(np.sin(2 * np.pi * BASS[b % 4] * tb) * amp * np.minimum(1, tb * 200) * np.exp(-tb * 3), bar_t(b, q))
            if b < BREAK or b >= DROP: put(hat, bar_t(b, q + 0.5), 0.9, 1.1)
    # vocal: centre, vibrato around 1.2 kHz with a harmonic, in phrases
    s, tt = seg(VOCAL, BREAK)
    f = 1200 + 40 * np.sin(2 * np.pi * 5.5 * tt)
    ph = 2 * np.pi * np.cumsum(f) / SR
    voc = (np.sin(ph) + 0.4 * np.sin(2 * ph)) * 0.12 * (np.sin(2 * np.pi * tt / BAR) > -0.6)
    L[s] += voc; R[s] += voc
    # pad: wide (right channel detuned + phase-shifted), break + outro
    for b0, b1, a in [(BREAK, DROP, 0.06), (OUTRO, BARS, 0.05)]:
        s, tt = seg(b0, b1)
        for fr in (220, 277.2, 329.6, 440, 880, 1320):
            L[s] += a * np.sin(2 * np.pi * fr * tt); R[s] += a * np.sin(2 * np.pi * fr * 1.004 * tt + 1.7)
    # riser: noise, highs rising over the build
    s, tt = seg(BUILD, DROP)
    ramp = ((tt - tt[0]) / (tt[-1] - tt[0])) ** 2
    nz = np.diff(rng.standard_normal(len(tt) + 1))
    L[s] += nz * ramp * 0.12; R[s] += np.roll(nz, 37) * ramp * 0.12
    # lead in the drop: saw-ish in the mids
    s, tt = seg(DROP, OUTRO)
    lead_syn = sum(np.sin(2 * np.pi * 440 * k * tt) / k for k in range(1, 6)) * 0.05
    L[s] += lead_syn; R[s] += lead_syn
    pk = max(np.abs(L).max(), np.abs(R).max())
    st = (np.stack([L, R], 1) / pk * 0.89 * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    return path

if __name__ == '__main__':
    a = sys.argv[1:]
    print(make(a[0] if a else 'edm_test.wav', hat_gain=float(a[1]) if len(a) > 1 else 0.03, lead=float(a[2]) if len(a) > 2 else 0.5))
