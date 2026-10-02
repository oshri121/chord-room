"""Ground-truth chord benchmark: synthesise band-style songs whose chords, beats and key are KNOWN.

Each song = piano (inharmonic partials, per-partial decay, voice-led right hand in inversions, left-hand root/fifth)
or strummed guitar (plucked strings, pick-position comb, 8th strum pattern, strings 10 ms apart) or a pad, a bass
(root on 1, octave/fifth moves, chromatic/diatonic approach notes into the next chord, slash chords = the given bass),
drums (kick / snare / closed hats, a crash on section starts), a vocal-like lead (formant-shaped harmonics, vibrato,
glides) singing chord tones on strong beats and passing/neighbour tones, suspensions and anticipations on weak ones,
plus a short room reverb so the previous chord rings into the next. Small human timing jitter (±6 ms) everywhere.
Options per song: tempo 75–140 BPM, an optional linear tempo drift, a pickup (the song starts with a 2-beat bar),
chords pushed an 8th early (anticipations), tuning offset in cents (A ≠ 440).

Chord symbols: root (C, C#, Db …) + quality ('' maj, 'm', '7', 'maj7', 'm7', 'sus4', 'sus2', 'dim', 'm7b5') + optional
'/bass'. MIREX "majmin" truth: '', 7, maj7 → maj; m, m7 → min; sus/dim/m7b5 → excluded from the majmin score.

Any song + '+hard' (e.g. 'pop_C_100+hard') = the same song with a 2.2× louder vocal, 1.8× bass and 2.5× more reverb.

Usage:
    python3 gen_chords.py OUTDIR [name ...]     → OUTDIR/<name>.wav + <name>.json (truth)
    import gen_chords; gen_chords.SONGS; gen_chords.make(name, path) → truth dict
truth = {name, sr, bpm, key:{pc,mode}, lead, beats:[t…] (every true beat), down0 (index of the first downbeat),
         chords:[{t0,t1,sym,root,q,mm,bass}] (notated, beat-aligned), sounding:[…] (actual onsets, anticipations included)}
"""
import os, sys, json, wave, re
import numpy as np

SR = 32000
PC = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
      'A': 9, 'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11}
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], 'sus4': [0, 5, 7], '7sus4': [0, 5, 7, 10],
        'sus2': [0, 2, 7], 'dim': [0, 3, 6], 'm7b5': [0, 3, 6, 10], '9': [0, 4, 7, 10, 2], 'maj9': [0, 4, 7, 11, 2], 'm9': [0, 3, 7, 10, 2],
        'add9': [0, 4, 7, 2], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9]}
MM = {'': 'maj', '7': 'maj', 'maj7': 'maj', 'm': 'min', 'm7': 'min', '9': 'maj', 'maj9': 'maj', 'm9': 'min', 'add9': 'maj', '6': 'maj', 'm6': 'min'}          # MIREX majmin; others → None (excluded)
MAJ_SCALE, MIN_SCALE = [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10]

def parse(sym):
    m = re.match(r'^([A-G][#b]?)(maj9|maj7|m7b5|m9|m7|m6|7sus4|sus4|sus2|add9|dim|m|9|7|6|)(?:/([A-G][#b]?))?$', sym)
    if not m: raise ValueError(sym)
    r = PC[m.group(1)]; q = m.group(2)
    return {'root': r, 'q': q, 'mm': MM.get(q), 'bass': PC[m.group(3)] if m.group(3) else r, 'tones': [(r + i) % 12 for i in QUAL[q]]}

# name → spec. prog = list of (symbol, beats); the progression repeats for `bars` bars (after an optional pickup).
SONGS = {
    'pop_C_100':      dict(bpm=100, key=('C', 0), prog=[('C', 4), ('G', 4), ('Am', 4), ('F', 4)], inst='piano', drums='pop', bars=20),
    'pop_E_120':      dict(bpm=120, key=('E', 0), prog=[('C#m', 4), ('A', 4), ('E', 4), ('B', 4)], inst='guitar', drums='pop', bars=24),
    'ballad_Eb_75':   dict(bpm=75, key=('Eb', 0), prog=[('Eb', 4), ('Cm', 4), ('Ab', 2), ('Bb', 2), ('Eb', 4)], inst='piano', drums='ballad', bars=12, arp=True),
    'minor_Am_128':   dict(bpm=128, key=('A', 1), prog=[('Am', 4), ('F', 4), ('C', 4), ('G', 4)], inst='pad', drums='four', bars=24),
    'minor_F#m_92':   dict(bpm=92, key=('F#', 1), prog=[('F#m', 4), ('D', 4), ('A', 4), ('E', 4)], inst='guitar', drums='pop', bars=16),
    'jazz_Bb_110':    dict(bpm=110, key=('Bb', 0), prog=[('Cm7', 4), ('F7', 4), ('Bbmaj7', 8), ('Gm7', 4), ('Cm7', 4), ('F7', 4), ('Bbmaj7', 4)], inst='piano', drums='pop', bars=20),
    'halfbar_D_96':   dict(bpm=96, key=('D', 0), prog=[('D', 2), ('G', 2), ('A', 2), ('Bm', 2), ('G', 2), ('A', 2), ('D', 4)], inst='piano', drums='pop', bars=16),
    'twobar_Db_84':   dict(bpm=84, key=('Db', 0), prog=[('Db', 8), ('Gb', 8), ('Bbm', 8), ('Ab', 8)], inst='pad', drums='ballad', bars=16),
    'mixo_G_136':     dict(bpm=136, key=('G', 0), prog=[('G', 4), ('F', 4), ('C', 4), ('G', 4), ('Em', 4), ('C', 4), ('D', 8)], inst='guitar', drums='pop', bars=24),
    'pickup_Bb_104':  dict(bpm=104, key=('Bb', 0), prog=[('Bb', 4), ('Gm', 4), ('Eb', 4), ('F', 4)], inst='piano', drums='pop', bars=16, pickup=('F', 2)),
    'drift_F_112':    dict(bpm=112, bpm_end=116.5, key=('F', 0), prog=[('F', 4), ('Dm', 4), ('Bb', 4), ('C', 4)], inst='guitar', drums='pop', bars=24),
    'susdim_C_90':    dict(bpm=90, key=('C', 0), prog=[('C', 4), ('Fsus2', 2), ('F', 2), ('G7sus4', 2), ('G', 2), ('C', 2), ('Bdim', 2), ('Am', 4), ('Dm7', 2), ('G7', 2)], inst='piano', drums='ballad', bars=16),
    'slash_C_80':     dict(bpm=80, key=('C', 0), prog=[('C', 4), ('G/B', 4), ('Am', 4), ('Em/G', 4), ('F', 4), ('C/E', 4), ('Dm', 4), ('G', 4)], inst='piano', drums='ballad', bars=16),
    'harmmin_Em_140': dict(bpm=140, key=('E', 1), prog=[('Em', 4), ('Am', 4), ('B7', 4), ('Em', 4), ('C', 4), ('Am', 4), ('B', 8)], inst='guitar', drums='pop', bars=24),
    'push_A_118':     dict(bpm=118, key=('A', 0), prog=[('A', 4), ('E', 4), ('F#m', 4), ('D', 4)], inst='piano', drums='pop', bars=20, push=True),
    'tuned_Gm_100':   dict(bpm=100, key=('G', 1), prog=[('Gm', 4), ('Eb', 4), ('Bb', 4), ('F', 4)], inst='piano', drums='pop', bars=16, cents=28),
    'detuned_E_104':  dict(bpm=104, key=('E', 0), prog=[('E', 4), ('B', 4), ('C#m', 4), ('A', 4)], inst='guitar', drums='pop', bars=16, cents=-42),
    'flatpop_Ab_122': dict(bpm=122, key=('Ab', 0), prog=[('Ab', 4), ('Eb', 4), ('Fm', 4), ('Db', 4)], inst='guitar', drums='four', bars=24),
    # harder, closer to real mixes: loud vocal with many non-chord tones, walking bass, sustain pedal, extended chords, synth lead
    'vocal_G_96':     dict(bpm=96, key=('G', 0), prog=[('G', 4), ('Bm', 4), ('Em', 4), ('C', 4), ('Am', 4), ('D', 4), ('G', 4), ('D/F#', 4)], inst='guitar', drums='pop', bars=16, voc=2.2),
    'walk_F_124':     dict(bpm=124, key=('F', 0), prog=[('Gm7', 4), ('C7', 4), ('Fmaj7', 4), ('Dm7', 4)], inst='piano', drums='pop', bars=20, walk=True),
    'pedal_Ab_70':    dict(bpm=70, key=('Ab', 0), prog=[('Ab', 4), ('Eb/G', 4), ('Fm', 4), ('Db', 4), ('Ab/C', 4), ('Db', 2), ('Eb', 2), ('Ab', 4)], inst='piano', drums='ballad', bars=14, arp=True, pedal=True),
    'neosoul_C_84':   dict(bpm=84, key=('C', 0), prog=[('Fmaj9', 4), ('Em7', 4), ('Dm9', 4), ('Cmaj7', 2), ('C6', 2)], inst='piano', drums='ballad', bars=16, voc=1.5),
    'edm_Dm_126':     dict(bpm=126, key=('D', 1), prog=[('Dm', 4), ('Bb', 4), ('F', 4), ('C', 4)], inst='pad', drums='four', bars=24, lead=True, voc=0.0),
    'vi7_C_108':      dict(bpm=108, key=('C', 0), prog=[('C', 4), ('Am7', 4), ('Fmaj7', 4), ('G', 4), ('Em7', 4), ('Am7', 4), ('Dm7', 4), ('G7', 4)], inst='piano', drums='pop', bars=16, voc=1.5),
    'rock_D_140':     dict(bpm=140, key=('D', 0), prog=[('D', 4), ('A', 4), ('Bm', 4), ('G', 4)], inst='guitar', drums='pop', bars=24, dist=True, voc=1.3),
    'waltz_D_150':    dict(bpm=150, key=('D', 0), prog=[('D', 3), ('A', 3), ('Bm', 3), ('G', 3), ('D', 3), ('Em', 3), ('A', 6)], inst='guitar', drums='waltz', bars=24, bpb=3),
    'waltz_Am_96':    dict(bpm=96, key=('A', 1), prog=[('Am', 3), ('Dm', 3), ('G', 3), ('C', 3), ('F', 3), ('Dm', 3), ('E', 6)], inst='piano', drums='waltz', bars=16, bpb=3),
    'modulate_C_112': dict(bpm=112, key=('C', 0), prog=[('C', 4), ('Am', 4), ('F', 4), ('G', 4)] * 3 + [('Db', 4), ('Bbm', 4), ('Gb', 4), ('Ab', 4)] * 2, inst='piano', drums='pop', bars=20, voc=1.3),
    'cm_ballad_78':   dict(bpm=78, key=('C', 1), prog=[('Cm', 4), ('Ab', 4), ('Eb', 4), ('Bb', 4), ('Fm', 4), ('Ab', 4), ('G7', 8)], inst='piano', drums='ballad', bars=16, arp=True),
}

# "+hard" variant of any song (name 'pop_C_100+hard'): vocal 2.2× louder, bass 1.8×, 2.5× more room — closer to a dense modern mix
HARD = {'voc_mul': 2.2, 'bass_mul': 1.8, 'wet': 2.5}

def mtof(m, cents=0.0): return 440.0 * 2 ** ((m - 69 + cents / 100) / 12)

class Mix:
    def __init__(self, n):
        self.L = np.zeros(n); self.R = np.zeros(n); self.n = n
    def put(self, sig, t, pan=0.0, bus=None):
        i = int(round(t * SR))
        if i >= self.n: return
        if i < 0: sig = sig[-i:]; i = 0
        j = min(self.n, i + len(sig)); s = sig[:j - i]
        gl, gr = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
        self.L[i:j] += s * gl; self.R[i:j] += s * gr

def piano_note(f, dur, vel, rng):
    """Struck string: inharmonic partials (B ≈ 3e-4), high partials decay faster, hammer-ish brightness by velocity."""
    d = dur + 0.25; t = np.arange(int(d * SR)) / SR
    B = 3e-4 * (1 + (f < 200)); out = np.zeros_like(t)
    tau0 = 2.2 * (220 / f) ** 0.5
    for k in range(1, 14):
        fk = k * f * np.sqrt(1 + B * k * k)
        if fk > 7000: break
        a = (1 / k ** 1.1) * (0.6 + 0.4 * vel) ** (k * 0.25) * (1.0 if k != 7 else 0.3)
        out += a * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t * (1 + 0.45 * k) / tau0)
    env = np.minimum(1, t / 0.003) * np.clip((d - t) / 0.12, 0, 1)
    return out * env * vel

def pluck(f, dur, vel, rng, pickpos=0.18):
    d = dur + 0.08; t = np.arange(int(d * SR)) / SR; out = np.zeros_like(t)
    for k in range(1, 16):
        fk = k * f * np.sqrt(1 + 1.2e-4 * k * k)
        if fk > 6500: break
        a = abs(np.sin(np.pi * k * pickpos)) / k
        out += a * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t * (1.6 + 0.9 * k))
    env = np.minimum(1, t / 0.002) * np.clip((d - t) / 0.06, 0, 1)
    return out * env * vel

def pad_note(f, dur):
    d = dur + 0.3; t = np.arange(int(d * SR)) / SR; out = np.zeros_like(t)
    for det in (-0.004, 0.0, 0.0045):
        for k in range(1, 12):
            if k * f > 3500: break
            out += np.sin(2 * np.pi * f * (1 + det) * k * t + k * det * 400) / k * (1 / (1 + (k * f / 1800) ** 2))
    env = np.minimum(1, t / 0.12) * np.clip((d - t) / 0.3, 0, 1)
    return out * env / 3

def bass_note(f, dur, vel):
    d = dur; t = np.arange(int(d * SR)) / SR
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) + 0.25 * np.sin(6 * np.pi * f * t) + 0.12 * np.sin(8 * np.pi * f * t)
    return x * np.minimum(1, t / 0.004) * np.exp(-t * 2.0) * np.clip((d - t) / 0.03, 0, 1) * vel

FORM = [(700, 110, 1.0), (1220, 120, 0.5), (2600, 160, 0.25)]   # vowel "ah"
def voice_note(f0, f1, dur, vel):
    """Sung note: glide f0→f1 over 60 ms, delayed vibrato (5.6 Hz, ±35 cents), formant-weighted harmonics, breath."""
    t = np.arange(int(dur * SR)) / SR
    glide = f1 + (f0 - f1) * np.exp(-t / 0.03)
    vib = 1 + (2 ** (35 / 1200) - 1) * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.18) / 0.25, 0, 1)
    f = glide * vib; ph = 2 * np.pi * np.cumsum(f) / SR; out = np.zeros_like(t)
    for k in range(1, 20):
        fk = k * f1
        if fk > 5000: break
        w = 0.25 / k + sum(a / (1 + ((fk - fc) / bw) ** 2) for fc, bw, a in FORM)
        out += w * np.sin(k * ph)
    env = np.minimum(1, t / 0.04) * np.clip((dur - t) / 0.06, 0, 1)
    return out * env * vel / 2.0

def make(name, path, seed=None):
    base, _, var = name.partition('+')
    sp = dict(SONGS[base], **(HARD if var == 'hard' else {})); rng = np.random.default_rng(seed if seed is not None else sum(map(ord, name)))
    cents = sp.get('cents', 0.0); kpc = PC[sp['key'][0]]; mode = sp['key'][1]
    # ---- notated chord per beat
    seq = []
    pk = sp.get('pickup')
    if pk: seq += [pk[0]] * pk[1]
    bpb = sp.get('bpb', 4); nb = sp['bars'] * bpb; body = []
    while len(body) < nb:
        for s, n in sp['prog']: body += [s] * n
    seq += body[:nb]
    npick = pk[1] if pk else 0
    B = len(seq); lead = 0.6
    bpm0 = sp['bpm']; bpm1 = sp.get('bpm_end', bpm0)
    tempo = bpm0 + (bpm1 - bpm0) * np.arange(B + 1) / B
    beats = lead + np.concatenate([[0], np.cumsum(60 / tempo[:-1])])
    dur = beats[-1] + 2.5; n = int(dur * SR); mix = Mix(n); dry_v = Mix(n)
    def T(b): return beats[min(b + 1, B)] - beats[min(b, B - 1)]
    def bt(x):  # fractional beat index → time
        i = int(np.floor(x)); i = max(0, min(i, B - 1)); return beats[i] + (x - i) * T(i)
    jit = lambda: rng.normal(0, 0.006)
    # chord segments (notated) and sounding onsets (pushed an 8th early when push=True, not the first)
    segs = []; b = 0
    while b < B:
        e = b
        while e < B and seq[e] == seq[b]: e += 1
        segs.append((b, e, seq[b])); b = e
    snd = []
    for i, (b0, b1, s) in enumerate(segs):
        st = b0 - (0.5 if sp.get('push') and i > 0 and (b0 - npick) % bpb == 0 else 0)
        snd.append((st, b1 - (0.5 if sp.get('push') and i + 1 < len(segs) and (b1 - npick) % bpb == 0 else 0), s))
    scale = [(kpc + d) % 12 for d in (MIN_SCALE if mode else MAJ_SCALE)]
    # ---- harmony instrument
    inst = sp['inst']; prev_v = None
    for st, en, s in snd:
        c = parse(s); tones = c['tones']
        t0, t1 = bt(st), bt(en)
        if inst == 'piano':
            # right hand: chord tones F3..E5, inversion closest to the previous voicing
            cands = []
            for base in range(53, 66):
                if base % 12 not in tones: continue
                v = [base]
                for tpc in tones:
                    if tpc == base % 12: continue
                    m = base + ((tpc - base) % 12)
                    v.append(m)
                v = sorted(v)
                if v[-1] <= 77: cands.append(v)
            v = min(cands, key=lambda v: sum(abs(a - b) for a, b in zip(v, prev_v)) if prev_v else abs(np.mean(v) - 64))
            prev_v = v
            lh = 36 + (c['bass'] - 36) % 12
            if lh < 40: lh += 12
            # left-hand second note: the chord tone nearest a fifth above the bass (for C/E that is G, not B)
            l2 = min((lh + d for d in range(3, 10) if (lh + d) % 12 in tones), key=lambda m: abs(m - lh - 7))
            if sp.get('arp'):
                pos = st; k = 0; pat = [lh, l2, v[0] if v[0] - lh > 9 else v[0] + 12, v[1] + 12 if len(v) > 1 else v[0] + 12]
                while pos < en - 1e-6:
                    m = pat[k % 4]; d8 = bt(pos + 0.5) - bt(pos)
                    mix.put(piano_note(mtof(m, cents), (t1 - bt(pos)) * 0.8 + 0.2 + (0.9 if sp.get('pedal') else 0), 0.32, rng), bt(pos) + jit(), pan=-0.2); pos += 0.5; k += 1
                for m in v: mix.put(piano_note(mtof(m, cents), t1 - t0 + (0.9 if sp.get('pedal') else 0), 0.22, rng), t0 + jit(), pan=0.15)
            else:
                pos = st
                while pos < en - 1e-6:
                    nxt = min(en, pos + (2 if bpb == 4 else 3))
                    acc = 0.5 if (int(round((pos - npick) * 2)) % (2 * bpb) == 0) else 0.42
                    for m in v: mix.put(piano_note(mtof(m, cents), bt(nxt) - bt(pos) + (0.9 if sp.get('pedal') else 0), acc, rng), bt(pos) + jit(), pan=0.15)
                    mix.put(piano_note(mtof(lh, cents), bt(nxt) - bt(pos), acc * 0.9, rng), bt(pos) + jit(), pan=-0.15)
                    for o in range(1, int(nxt - pos)): mix.put(piano_note(mtof(l2, cents), bt(nxt) - bt(pos + o), 0.25, rng), bt(pos + o) + jit(), pan=-0.15)
                    pos = nxt
        elif inst == 'guitar':
            pass  # strummed below, on a song-wide strum grid
        else:  # pad
            v = sorted(set([55 + (x - 55) % 12 for x in tones]))
            for m in v: mix.put(pad_note(mtof(m, cents), t1 - t0) * 0.16, t0, pan=-0.3 + 0.2 * (m % 3))
            for m in v[:2]: mix.put(pad_note(mtof(m + 12, cents), t1 - t0) * 0.06, t0, pan=0.4)
            if sp['drums'] == 'four':  # plucky synth stab on the off-beats on top of the pad
                pos = st + 0.5
                while pos < en:
                    for m in v: mix.put(pluck(mtof(m + 12, cents), bt(pos + 0.4) - bt(pos), 0.12, rng, 0.3), bt(pos) + jit(), pan=0.2)
                    pos += 1
    gbus = Mix(n)
    if inst == 'guitar':
        def chord_at_s(x):
            for st, en, s in snd:
                if st - 1e-6 <= x < en - 1e-6: return parse(s), en
            return None, None
        pat = [(0, 'D', 1.0), (1, 'D', 0.7), (1.5, 'U', 0.5), (2.5, 'U', 0.55), (3, 'D', 0.75), (3.5, 'U', 0.5)] if bpb == 4 else [(0, 'D', 1.0), (1, 'D', 0.6), (1.5, 'U', 0.45), (2, 'D', 0.6), (2.5, 'U', 0.45)]
        ps = [(p, d, v) for p, d, v in [(o, dd, vv) for o, dd, vv in pat if o < npick]] if npick else []
        ps += [(npick + bpb * k + o, dd, vv) for k in range(sp['bars']) for o, dd, vv in pat]
        # a strum also falls on every (sounding) chord change that is not on the grid
        for st, en, s in snd:
            if not any(abs(p - st) < 1e-6 for p, _, _ in ps): ps.append((st, 'D', 0.8))
        ps.sort()
        for i, (p, dirn, vel) in enumerate(ps):
            c, en = chord_at_s(p)
            if c is None: continue
            q = min(ps[i + 1][0] if i + 1 < len(ps) else B, en); d = bt(q) - bt(p) + 0.04
            low = 40 + (c['bass'] - 40) % 12
            if low > 47: low -= 12
            stack = [low]
            for m in range(low + 3, 73):
                if m % 12 in c['tones'] and m - stack[-1] >= 3: stack.append(m)
                if len(stack) == 6: break
            strs = stack if dirn == 'D' else list(reversed(stack[-4:]))
            t = bt(p) + jit()
            for k, m in enumerate(strs):
                (gbus if sp.get('dist') else mix).put(pluck(mtof(m, cents), d, vel * 0.33 * (1 - 0.04 * k), rng), t + k * 0.010, pan=0.3 if k % 2 else 0.1)
    if sp.get('dist'):
        g = 6.0 / (np.abs(gbus.L).max() + 1e-9)
        mix.L += np.tanh(gbus.L * g) * 0.22; mix.R += np.tanh(gbus.R * g) * 0.22
    # ---- bass: root on 1 (and 3), octave / fifth on the "and"s, approach note into the next chord on the last 8th
    for i, (st, en, s) in enumerate(snd):
        c = parse(s); bn = 28 + (c['bass'] - 28) % 12
        if bn > 38: bn -= 12
        nxt = parse(snd[i + 1][2]) if i + 1 < len(snd) else None
        pos = st; k = 0
        while pos < en - 1e-6:
            last = pos + 1 >= en - 1e-6
            notes = [(0, bn, 0.5)]
            if k % 2 == 1: notes = [(0, bn + 12 if k % 4 == 1 else bn + 7 if c['q'] not in ('dim', 'm7b5') else bn + 6, 0.38)]
            if sp.get('walk'):  # quarter-note walk: root, 3rd/5th/scale steps, chromatic approach into the next chord
                iv = QUAL[c['q']]; walkn = [0, iv[1], iv[2], iv[1] + (2 if (c['root'] + iv[1] + 2) % 12 in scale else 1)]
                notes = [(0, bn + walkn[k % 4], 0.9)]
            if last and nxt is not None and en - st >= 2:
                tgt = 28 + (nxt['bass'] - 28) % 12
                if tgt > 38: tgt -= 12
                appr = tgt - 1 if rng.random() < 0.5 else tgt + (2 if (tgt + 2) % 12 in scale else 1)
                notes = [(0, appr, 0.9)] if sp.get('walk') else [(0, bn, 0.45), (0.5, appr, 0.35)]
            for off, m, d in notes:
                mix.put(bass_note(mtof(m, cents), bt(pos + off + d) - bt(pos + off), 0.42 * sp.get('bass_mul', 1.0)), bt(pos + off) + jit())
            pos += 1; k += 1
    # ---- drums
    dk = sp['drums']; tk = np.arange(int(0.3 * SR)) / SR
    kick = np.sin(2 * np.pi * (50 * tk + 95 * (1 - np.exp(-tk * 30)) / 30)) * np.exp(-tk * 12) * 0.9
    kick[:60] += rng.standard_normal(60) * 0.15 * np.exp(-np.arange(60) / 15)
    ts = np.arange(int(0.2 * SR)) / SR
    nz = np.diff(rng.standard_normal(len(ts) + 1))
    snare = (0.45 * np.sin(2 * np.pi * 185 * ts) * np.exp(-ts * 28) + 0.32 * nz * np.exp(-ts * 18)) * 0.8
    th = np.arange(int(0.06 * SR)) / SR
    hat = np.diff(np.diff(rng.standard_normal(len(th) + 2))) * np.exp(-th * 70) * 0.05
    tc = np.arange(int(1.6 * SR)) / SR
    crash = np.diff(rng.standard_normal(len(tc) + 1)) * np.exp(-tc * 2.2) * 0.07
    for b in range(B):
        pos = (b - npick) % bpb; t = beats[b]; Tb = T(b)
        if b < npick:
            if dk != 'ballad': mix.put(hat, t + jit(), pan=0.3)
            continue
        if pos == 0 and (b - npick) % (8 * bpb) == 0: mix.put(crash, t, pan=-0.4)
        if dk == 'waltz':  # kick on 1, light snare on 2 and 3
            if pos == 0: mix.put(kick * 0.9, t + jit())
            else: mix.put(snare * 0.45, t + jit())
            mix.put(hat * 0.6, t + jit(), pan=0.3)
        elif dk == 'four':
            mix.put(kick, t + jit()); mix.put(hat * 1.2, t + Tb / 2 + jit(), pan=0.3)
            if pos in (1, 3): mix.put(snare * 0.7, t + jit())
        elif dk == 'pop':
            if pos in (0, 2): mix.put(kick, t + jit())
            if pos == 1 and rng.random() < 0.5: mix.put(kick * 0.7, t + Tb / 2 + jit())
            if pos in (1, 3): mix.put(snare, t + jit())
            mix.put(hat, t + jit(), pan=0.3); mix.put(hat * 0.7, t + Tb / 2 + jit(), pan=0.3)
        else:  # ballad: kick 1, snare 3 (rim-ish), soft 8ths
            if pos == 0: mix.put(kick * 0.8, t + jit())
            if pos == 2: mix.put(snare * 0.6, t + jit())
            mix.put(hat * 0.5, t + jit(), pan=0.3); mix.put(hat * 0.35, t + Tb / 2 + jit(), pan=0.3)
    # ---- vocal melody: 2-bar phrases, rest on the last 2 beats; strong beats = chord tones, weak 8ths = passing/neighbour
    #      tones; a 4-3 suspension (previous chord's note held over the downbeat) and an anticipation now and then
    def chord_at(x):
        for st, en, s in snd:
            if st <= x < en: return parse(s)
        return parse(snd[-1][2])
    mel = []; cur = 67 if mode == 0 else 64; cur = 60 + (kpc + 7 - 60) % 12 + (12 if (kpc + 7) % 12 < 5 else 0)
    x = float(npick) if npick else 0.0
    if npick: x = 0.0
    while x < B - 0.5:
        rel = (x - npick) % (2 * bpb)
        if rel >= 2 * bpb - 2 and x >= npick: x += 0.5; continue
        c = chord_at(x); strong = abs(x - round(x)) < 1e-6 and int(round(x - npick)) % 2 == 0
        cands = list(range(cur - 5, cur + 6))
        cands = [m for m in cands if 60 <= m <= 81 and m % 12 in scale]
        if strong:
            ch = [m for m in cands if m % 12 in c['tones']]
            if rel == 0 and mel and rng.random() < 0.25 and mel[-1][1] % 12 in scale and mel[-1][1] % 12 not in c['tones']:
                m = mel[-1][1]  # suspension: hold the non-chord tone over the bar line, resolve down on the next 8th
            elif rel == 0 and mel and rng.random() < 0.3:
                # suspension proper: a step above a chord tone
                tgt = min(ch, key=lambda m: abs(m - cur)) if ch else cur
                up = [m for m in cands if m > tgt and m - tgt <= 2]
                m = up[0] if up else tgt
            else:
                m = min(ch, key=lambda m: abs(m - cur) + rng.random() * 3) if ch else cur
            d = 1.0 if rng.random() < 0.6 else 0.5
        else:
            nct = [m for m in cands if m % 12 not in c['tones'] and abs(m - cur) <= 2 and m != cur]
            m = nct[rng.integers(len(nct))] if nct and rng.random() < 0.65 else min(cands, key=lambda m: abs(m - cur) + rng.random() * 4)
            d = 0.5
        mel.append((x, m, d)); cur = m; x += d
    pv = mtof(mel[0][1], cents) if mel else 300
    for xs, m, d in mel:
        f1 = mtof(m, cents); t0 = bt(xs); t1 = bt(min(B, xs + d))
        vl = 0.30 * sp.get('voc', 1.0) * sp.get('voc_mul', 1.0)
        if vl > 0: dry_v.put(voice_note(pv, f1, max(0.08, t1 - t0 - 0.03), vl), t0 + jit(), pan=0.0)
        if sp.get('lead'):  # bright saw lead, melody an octave up, wide
            tt = np.arange(int(max(0.08, t1 - t0 - 0.02) * SR)) / SR; f2 = 2 * f1
            sw = sum(np.sin(2 * np.pi * f2 * k * tt * (1 + 0.003 * (k % 2))) / k for k in range(1, 12) if f2 * k < 9000)
            mix.put(sw * np.minimum(1, tt / 0.005) * np.exp(-tt * 3) * 0.10, t0, pan=-0.5); mix.put(sw * np.minimum(1, tt / 0.005) * np.exp(-tt * 3) * 0.10, t0 + 0.012, pan=0.5)
        pv = f1
    # ---- room: short exponential-noise reverb on everything (vocal a bit wetter)
    ir_t = np.arange(int(0.9 * SR)) / SR
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 6.5); ir[0] = 0; ir /= np.sqrt((ir ** 2).sum())
    nf = 1 << int(np.ceil(np.log2(n + len(ir))))
    IR = np.fft.rfft(ir, nf)
    def verb(x): return np.fft.irfft(np.fft.rfft(x, nf) * IR, nf)[:n]
    wet = sp.get('wet', 1.0)
    L = mix.L + dry_v.L + 0.18 * wet * verb(mix.L) + 0.28 * wet * verb(dry_v.L)
    R = mix.R + dry_v.R + 0.18 * wet * verb(np.roll(mix.R, 23)) + 0.28 * wet * verb(np.roll(dry_v.R, 31))
    pkv = max(np.abs(L).max(), np.abs(R).max(), 1e-9)
    st = (np.stack([L, R], 1) / pkv * 0.89 * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
    chords = []
    for b0, b1, s in segs:
        c = parse(s); chords.append({'t0': float(beats[b0]), 't1': float(beats[b1]), 'b0': b0, 'b1': b1, 'sym': s, 'root': c['root'], 'q': c['q'], 'mm': c['mm'], 'bass': c['bass']})
    sounding = [{'t0': float(bt(a)), 't1': float(bt(z)), 'sym': s} for a, z, s in snd]
    truth = {'name': name, 'sr': SR, 'bpm': bpm0, 'bpm_end': bpm1, 'key': {'pc': kpc, 'mode': mode}, 'lead': lead, 'cents': cents,
             'beats': [float(x) for x in beats[:-1]], 'down0': npick, 'bpb': bpb, 'chords': chords, 'sounding': sounding, 'dur': n / SR}
    with open(os.path.splitext(path)[0] + '.json', 'w') as f: json.dump(truth, f)
    return truth

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    for nm in (sys.argv[2:] or list(SONGS)):
        tr = make(nm, os.path.join(out, nm + '.wav'))
        print(nm, f"{tr['dur']:.1f}s", len(tr['chords']), 'chords')
