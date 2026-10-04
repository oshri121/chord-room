"""Independent quality metrics for an Extended render (numpy only): what a DJ hears at every join, measured from the
exported WAV, the source WAV, the plan the page reports (EXTENDED._planInfo()) and, for the synthetic songs, the truth.

A join = a block start whose source does not continue the previous block (or whose stems change). For each join at output
time tj (outgoing source would have continued at `so`, incoming source starts at `si`):

  click_db   high-band (> 6 kHz) energy in 2 ms windows over [tj − 40 ms, tj + 8 ms] against the louder of the two sources
             at the same spots (each scaled by its own render/source level, floor −65 dBFS), minus the same measure one bar
             before / after the join (what a separated stem does at every downbeat): > 3 dB = something that is in neither source
  phase_ms   beat phase of the render's onsets over the 2 bars after tj minus the 2 bars before (onsets folded on the beat,
             Gaussian 3 ms): a flam / beat jump across the join (0 = the incoming beats continue the outgoing grid)
  step_lu    K-weighted loudness of the bar after tj minus the bar before, compared with what the music does there by itself
             (the same step in the incoming source and in the outgoing source; the smaller difference) — full-mix joins only
  vocal_cut  (truth) a sung phrase that is cut off (still sung > ¼ beat after `so`) or entered in the middle (began > ¼ beat
             before `si`) on a side that carries vocals
Whole render: block loudness vs its source bars (full-mix blocks), ending (last low/kick onset on a bar line, decaying tail,
silent end), vocal bleed in stem-only blocks (projection onto the true vocal stem), unique-source-bar ratio of the made blocks.
"""
import wave, json
import numpy as np


def read_wav(path):
    with wave.open(path, 'rb') as w:
        sr, nc, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2: x = np.frombuffer(raw, '<i2').astype(np.float64) / 32768
    else:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16); v[v >= 1 << 23] -= 1 << 24; x = v / 8388608.0
    return sr, x.reshape(-1, nc)


def _band(x, sr, f0=None, f1=None):
    """zero-phase FFT band filter of a 1-D signal"""
    n = len(x); N = 1 << int(np.ceil(np.log2(max(2, n))))
    X = np.fft.rfft(x, N); f = np.fft.rfftfreq(N, 1 / sr); H = np.ones_like(f)
    if f0: H *= 1 / (1 + (f0 / np.maximum(f, 1e-3)) ** 8)
    if f1: H *= 1 / (1 + (f / f1) ** 8)
    return np.fft.irfft(X * H, N)[:n]


def kweight(x, sr):
    """ITU-R BS.1770 K-weighting as a magnitude response (loudness only needs power): high shelf +4 dB > 1.5 kHz, HP 38 Hz"""
    n = len(x); N = 1 << int(np.ceil(np.log2(max(2, n))))
    f = np.fft.rfftfreq(N, 1 / sr)
    shelf = 10 ** (4 / 20 * (1 / (1 + (1681.97 / np.maximum(f, 1e-3)) ** 2)))
    hpf = (f / 38.13) ** 2 / np.sqrt(1 + (f / 38.13) ** 4)
    return np.fft.irfft(np.fft.rfft(x, N) * shelf * hpf, N)[:n]


class Sig:
    """precomputed envelopes of a stereo signal"""
    def __init__(self, x, sr):
        self.sr = sr; self.n = len(x); m = x.mean(1); self.mono = m
        self.hf = _band(m, sr, 6000) ** 2                       # high band power
        self.kw = sum(kweight(x[:, c], sr) ** 2 for c in range(x.shape[1]))   # K-weighted power (sum of channels)
        H = 44; nf = self.n // H; self.H = H
        lo = _band(m, sr, None, 150); hi = _band(m, sr, 4000)
        e = lambda y: np.sqrt((y[:nf * H] ** 2).reshape(nf, H).mean(1) + 1e-12)
        el, eh = np.log(e(lo) + 1e-5), np.log(e(hi) + 1e-5)
        fl = np.maximum(0, el - np.concatenate([[el[0]] * 3, el[:-3]])); fh = np.maximum(0, eh - np.concatenate([[eh[0]] * 3, eh[:-3]]))
        self.on = fl + 0.6 * fh                                     # onset strength per 1 ms frame
        # low-band onsets weighted by how loud the low band is (kicks, not the rise of a quiet tail)
        lev = e(lo); self.on_lo = fl * np.minimum(1, lev / (np.percentile(lev, 95) + 1e-9) * 2)
        self.lo_e = e(lo)

    def pw(self, arr, t0, t1):
        a, z = max(0, int(t0 * self.sr)), min(self.n, int(t1 * self.sr))
        return float(arr[a:z].mean()) if z > a else 0.0

    def lu(self, t0, t1):
        p = self.pw(self.kw, t0, t1); return -0.691 + 10 * np.log10(p + 1e-12)


def beat_phase(sig, t0, t1, ref, T, sigma=0.003):
    """phase (s, in [−T/2, T/2)) of the low-band (kick / bass) onsets in [t0, t1) against the grid ref + k·T; None when
    the window has fewer than 4 clear low hits (a break, a build: no beat to compare)"""
    H = sig.H / sig.sr; a, z = max(0, int(t0 / H)), min(len(sig.on_lo), int(t1 / H))
    if z - a < 10: return None, 0
    o = sig.on_lo[a:z]; tm = (np.arange(a, z) + 0.5) * H
    thr = max(np.percentile(sig.on_lo, 99.5) * 0.3, 1e-3)
    pk = [(tm[i], o[i]) for i in range(1, len(o) - 1) if o[i] > thr and o[i] >= o[i - 1] and o[i] >= o[i + 1]]
    if len(pk) < 4: return None, 0
    ts = np.array([p[0] for p in pk]); ws = np.array([p[1] for p in pk])
    cand = np.arange(-T / 2, T / 2, 0.00025); best, bv = 0, -1
    for c in cand:
        d = ((ts - ref - c) + T / 2) % T - T / 2
        v = float((ws * np.exp(-0.5 * (d / sigma) ** 2)).sum())
        if v > bv: bv, best = v, c
    # refine: weighted mean of the onsets near the best phase
    d = ((ts - ref - best) + T / 2) % T - T / 2; m = np.abs(d) < 2.5 * sigma
    if m.sum(): best += float((d[m] * ws[m]).sum() / ws[m].sum())
    return best, bv


def joins_of(plan):
    bl = plan['blocks']; out = []
    for i in range(1, len(bl)):
        p, b = bl[i - 1], bl[i]
        cont = abs(b['s0'] - p['s1']) < 1e-4 and json.dumps(p.get('mask')) == json.dumps(b.get('mask'))
        if cont: continue
        out.append(dict(i=i, tj=b['t0'], so=p['s1'], si=b['s0'], prev=p, next=b, full=not p.get('mask') and not b.get('mask')))
    return out


FLOOR = 10 ** (-65 / 10)   # high-band power floor (−65 dBFS): residue below it right before a hit is masked (and absent from real
                           # recordings, which are never digitally silent); the old segment-gain tick measured −52 dBFS
def has_vox(b): m = b.get('mask'); return (not m) or bool(m.get('vocals'))


def measure(render, sr, source, plan, truth=None, voc=None):
    R = Sig(render, sr); S = Sig(source, sr); B = plan['B']; T = B / 4
    res = {'joins': []}
    # global render/source gain on unmodified blocks (normalisation): regress render on source over orig blocks
    js = joins_of(plan)
    for j in js:
        tj, so, si = j['tj'], j['so'], j['si']
        # --- click: high band excess (each side scaled by its level in the render)
        def lvl(t0, t1, s0):
            r = R.pw(R.hf, t0, t1); s = S.pw(S.hf, s0, s0 + (t1 - t0)); return r / s if s > 1e-14 else 1.0
        gi = lvl(tj + 0.05, tj + B, si + 0.05); go = lvl(tj - B, tj - 0.06, so - B)
        def excess(at, o_src, i_src):   # worst 2 ms high-band excess of the render over both sources around `at`
            w = -99
            for k in range(-20, 4):
                a = at + k * 0.002; e_r = R.pw(R.hf, a, a + 0.002)
                e_o = S.pw(S.hf, o_src + (a - at), o_src + (a - at) + 0.002) * go if o_src is not None else 0
                e_i = S.pw(S.hf, i_src + (a - at), i_src + (a - at) + 0.002) * gi if i_src is not None else 0
                ref = max(e_o, e_i, FLOOR); w = max(w, 10 * np.log10((e_r + 1e-12) / ref))
            return w
        # the same measure one bar before (inside the outgoing block) and after (inside the incoming one): what a stem does at
        # every downbeat (e.g. the STFT pre-echo of a separated drums stem) is not a join artefact
        worst = excess(tj, so, si)
        ctrl = max(excess(tj - B, so - B, None) if tj - B > 0.05 else -99, excess(tj + B, None, si + B))
        worst = worst - max(0.0, ctrl) if worst > 3 else worst
        # --- beat phase across the join
        pb, wb = beat_phase(R, tj - 2 * B, tj - 0.02, tj, T); pa, wa = beat_phase(R, tj + 0.005, tj + 2 * B, tj, T)
        ph = None if pb is None or pa is None else (((pa - pb) + T / 2) % T - T / 2) * 1000
        # --- loudness step vs the music's own step (full-mix joins)
        st = None
        if j['full']:
            step = R.lu(tj, tj + B) - R.lu(tj - B, tj)
            n_in = S.lu(si, si + B) - S.lu(si - B, si); n_out = S.lu(so, so + B) - S.lu(so - B, so)
            st = min(abs(step), abs(step - n_in), abs(step - n_out))   # no step, or the step the music makes there itself
        # --- grid error at the cut points (truth): incoming downbeat vs outgoing downbeat
        grid = None; xc = None
        if truth:   # beat-level error of each cut point against the true beats (extrapolated past the ends), and bar phase
            db = np.array(truth['downbeats']); Tb = (db[-1] - db[0]) / (len(db) - 1) / 4
            beats = np.concatenate([db[0] - Tb * np.arange(16, 0, -1), np.interp(np.arange((len(db) - 1) * 4 + 1) / 4, np.arange(len(db)), db), db[-1] + Tb * np.arange(1, 64)])
            def err(x):
                i = int(np.argmin(np.abs(beats - x))); return x - beats[i], (i - 16) % 4
            ei, bi = err(si); eo, bo = err(so)
            grid = (ei - eo) * 1000 if bi == bo else 9999.0    # 9999 = the cut lands on another beat of the bar
            if so > db[-1] - 0.05: grid = None                  # after the song's last bar there is no beat to continue
        # kick pattern of the bar after the join vs the bar the outgoing source would have played (lag within ±40 ms)
        H = R.H / sr; a, n = int(tj / H), int(B / H); a2 = int(so / H)
        if a + n + 40 < len(R.on_lo) and a2 + n + 40 < len(S.on_lo) and a2 > 40:
            x = R.on_lo[a:a + n]; best, bv = 0, -1
            for lag in range(-40, 41):
                y = S.on_lo[a2 + lag:a2 + lag + n]; v = float((x * y).sum())
                if v > bv: bv, best = v, lag
            nx = float(np.sqrt((x * x).sum() * (S.on_lo[a2:a2 + n] ** 2).sum())) + 1e-12
            if bv / nx > 0.4 and (x > 0.05).sum() >= 4: xc = best * H * 1000
        # --- vocal cuts (truth, source time)
        cut = None
        if truth:
            q = T / 4; cut = []
            pj = next((x for x in plan.get('joins') or [] if abs(x['t'] - tj) < 1e-3), {})   # the render lets a last word ring
            tail, pre, duck = pj.get('tail', 0) or 0, pj.get('pre', 0) or 0, pj.get('duck', 0) or 0   # (tail) / lays a pickup in (pre)
            for (v0, v1) in truth['vocal']:                                                    # / leaves the next line's pickup out (duck)
                if has_vox(j['prev']) and v0 < so - max(q, duck + q) and v1 > so + tail + q: cut.append(('out', round(v0, 2), round(v1, 2)))
                if has_vox(j['next']) and v0 < si - pre - q and v1 > si + q: cut.append(('in', round(v0, 2), round(v1, 2)))
        res['joins'].append(dict(t=round(tj, 3), role=j['next']['role'], frm=j['prev']['role'], full=j['full'], click_db=round(worst, 2),
                                 phase_ms=None if ph is None else round(ph, 2), grid_ms=None if grid is None else round(grid, 2), xc_ms=None if xc is None else round(xc, 2), step_lu=None if st is None else round(st, 2), vocal_cut=cut))
    # --- block loudness vs source (full-mix blocks)
    bl = []
    for b in plan['blocks']:
        if b.get('mask') or b['role'] not in ('orig', 'rep', 'cycle') or b['t1'] - b['t0'] < B * 0.99: continue   # made blocks have their own level
        bl.append(dict(role=b['role'], d=round(R.lu(b['t0'], b['t1']) - S.lu(b['s0'], b['s1']), 2)))
    res['blocks_lu'] = bl
    # --- ending: the strongest hit in the last beat + tail sits on the final bar line; the very end is silent
    H = R.H / sr; endt = R.n / sr; P = plan.get('P', 0); bar_end = P + plan.get('bars', round((endt - P) / B)) * B
    a, z = int(max(0, bar_end - 0.012) / H), min(len(R.on), int(endt / H))
    seg = R.on_lo[a:z] if z > a and R.on_lo[a:z].max() > 1e-3 else (R.on[a:z] if z > a else np.zeros(1))   # the kick first
    first = np.nonzero(seg >= 0.5 * seg.max())[0] if seg.max() > 0 else []
    hit = (a + int(first[0])) * H if len(first) else 0   # the first strong hit there (the end hit's downbeat, not its off-beat hat)
    endv = R.lu(endt - 0.02, endt); ref = max(R.lu(endt - B * 2, endt - B), R.lu(endt - B, endt))
    res['ending'] = dict(last_onset=round(hit, 3), off_beat_ms=round((hit - bar_end) * 1000, 1), on_bar=abs(hit - bar_end) < 0.008,
                         tail_s=round(endt - hit, 2), end_db=round(endv - ref, 1))
    # --- vocal bleed in stem-only blocks (projection on the true vocal stem): retained vocal fraction in dB
    if voc is not None:
        vm = voc.mean(1); rm = render.mean(1); bleed = []
        for b in plan['blocks']:
            m = b.get('mask')
            if not m or m.get('vocals'): continue
            a, z = int(b['t0'] * sr), int(b['t1'] * sr); s0 = int(b['s0'] * sr); n = min(z - a, len(vm) - s0)
            if n <= sr: continue
            v = vm[s0:s0 + n]; r = rm[a:a + n]; ev = float((v * v).sum())
            if ev < 1e-6: continue
            al = float((r * v).sum()) / ev; bleed.append(round(20 * np.log10(abs(al) + 1e-6), 1))
        res['bleed_db'] = bleed
    # --- variety of the made blocks (DJ intro / outro): distinct source bars per output bar
    for role in ('intro', 'outro'):
        bb = [b for b in plan['blocks'] if b['role'] == role]
        if not bb: continue
        nbar = sum(b['sb'] - b['sa'] for b in bb); uniq = len({k for b in bb for k in range(b['sa'], b['sb'])})
        res[role + '_var'] = dict(bars=nbar, unique=uniq, layers=len({json.dumps(b.get('mask')) + str(b.get('ft')) for b in bb}))
    return res


def summary(m):
    J = m['joins']
    ph = [abs(j['phase_ms']) for j in J if j['phase_ms'] is not None]
    st = [j['step_lu'] for j in J if j['step_lu'] is not None]
    gr = [abs(j['grid_ms']) for j in J if j.get('grid_ms') is not None]
    xc = [abs(j['xc_ms']) for j in J if j.get('xc_ms') is not None]
    cuts = sum(len(j['vocal_cut']) for j in J if j['vocal_cut'])
    return dict(joins=len(J), clicks=sum(1 for j in J if j['click_db'] > 3), click_max=max([j['click_db'] for j in J] or [0]),
                phase_max=round(max(ph or [0]), 2), phase_med=round(float(np.median(ph)) if ph else 0, 2),
                grid_max=round(max(gr or [0]), 2), xc_max=round(max(xc or [0]), 2), xc_n=len(xc), step_max=round(max(st or [0]), 2), vocal_cuts=cuts,
                blocks_lu_max=round(max([abs(b['d']) for b in m['blocks_lu']] or [0]), 2), ending=m['ending'],
                bleed_max=max(m.get('bleed_db') or [-99]), intro=m.get('intro_var'), outro=m.get('outro_var'))
