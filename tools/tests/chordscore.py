"""Scoring for the chord benchmark (used by test_chords.py): app output vs gen_chords.py truth.

got = {bpm, offset, down, key:{pc,mode}, labels:[chord name per app beat, as the sheet shows it (ASCII, e.g. 'Bb', 'C#m', 'N.C.')]}
  * beat_acc  — MIREX "majmin" per TRUE beat: root + maj/min of the app's chord at the middle of the beat (beats whose true
                chord is sus/dim/half-dim are excluded; 7ths count as their triad)
  * frame_acc — the same at 20 ms resolution against the SOUNDING chords (anticipations included)
  * seg_f     — chord changes found within ±1 beat (F1 of true vs app change times), seg_off = median signed offset in beats
  * key       — exact | relative | fifth | wrong
"""
import re
import numpy as np

NAME2PC = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8,
           'A': 9, 'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11}
SYM_MM = {'': 'maj', '7': 'maj', 'maj7': 'maj', 'm': 'min', 'm7': 'min'}

def parse_label(s):
    """'C#m7/E' → (1, 'min'); 'N.C.' → None; sus/dim → (root, None)."""
    s = s.replace('♯', '#').replace('♭', 'b').strip()
    if s.startswith('N.C') or s in ('—', ''): return None
    m = re.match(r'^([A-G][#b]?)(maj7|m7b5|m7|7sus4|sus4|sus2|dim7|dim|m|7|)(?:/([A-G][#b]?))?$', s)
    if not m: return ('?', None)
    return (NAME2PC[m.group(1)], SYM_MM.get(m.group(2)))

def truth_at(chords, t, key='t0'):
    for c in chords:
        if c[key] <= t < c['t1']: return c
    return None

def score(tr, got):
    r = {}
    T = 60 / got['bpm']; first = got['offset'] % T; lab = got['labels']
    def app_at(t):
        k = int(np.floor((t - first) / T + 1e-6))
        if k < 0 or k >= len(lab): return None, k
        return parse_label(lab[k]), k
    beats = tr['beats']; tb = np.array(beats + [tr['chords'][-1]['t1']])
    ok = n = 0; errs = {}
    for j in range(len(beats)):
        tm = (tb[j] + tb[j + 1]) / 2
        c = truth_at(tr['chords'], tm)
        if c is None or c['mm'] is None: continue
        g, _ = app_at(tm); n += 1
        if g is not None and g[0] == c['root'] and g[1] == c['mm']: ok += 1
        else:
            k = f"{c['sym']}→{lab[app_at(tm)[1]] if 0 <= app_at(tm)[1] < len(lab) else '-'}"; errs[k] = errs.get(k, 0) + 1
    r['beat_acc'] = ok / n if n else 0; r['beat_n'] = n
    # spelling: where the root is right, is it written with the same letter as the chart (Bb not A#, C# not Db in E major)?
    sp_n = sp_bad = 0; bad = set()
    for j in range(len(beats)):
        tm = (tb[j] + tb[j + 1]) / 2; c = truth_at(tr['chords'], tm); g, k = app_at(tm)
        if c is None or g is None or g[0] != c['root'] or not (0 <= k < len(lab)): continue
        want = re.match(r'^[A-G][#b]?', c['sym']).group(0); got_ = re.match(r'^[A-G][#b♯♭]?', lab[k]).group(0).replace('♯', '#').replace('♭', 'b')
        sp_n += 1
        if want != got_: sp_bad += 1; bad.add(f'{want}→{got_}')
    r['spell_n'], r['spell_bad'], r['spell_errs'] = sp_n, sp_bad, sorted(bad)
    r['errs'] = sorted(errs.items(), key=lambda x: -x[1])
    # frame-level vs sounding chords
    ok = n = 0
    snd = [dict(s, **dict(zip(('root', 'mm'), parse_label(s['sym'])))) for s in tr['sounding']]
    for tm in np.arange(tr['chords'][0]['t0'], tr['chords'][-1]['t1'], 0.02):
        c = truth_at(snd, tm)
        if c is None or c['mm'] is None: continue
        g, _ = app_at(tm); n += 1
        if g is not None and g[0] == c['root'] and g[1] == c['mm']: ok += 1
    r['frame_acc'] = ok / n if n else 0
    # segmentation: true change times vs app change times (majmin identity, so a change Am7→Am does not count)
    def mmkey(c): return (c['root'], c['mm'] or c['q'])
    tch = [c['t0'] for i, c in enumerate(tr['chords']) if i and mmkey(c) != mmkey(tr['chords'][i - 1])]
    Tt = 60 / tr['bpm']; offs = []; hit = 0
    lo, hi = tr['chords'][0]['t0'] + Tt / 2, tr['chords'][-1]['t1'] - Tt / 2     # the song's own start/end are not changes
    ach = [first + k * T for k in range(1, len(lab)) if parse_label(lab[k]) != parse_label(lab[k - 1]) and lo < first + k * T < hi]
    for t in tch:
        d = [a - t for a in ach if abs(a - t) <= Tt * 1.01]
        if d: hit += 1; offs.append(min(d, key=abs) / Tt)
    rec = hit / len(tch) if tch else 1
    prec = sum(1 for a in ach if any(abs(a - t) <= Tt * 1.01 for t in tch)) / len(ach) if ach else 1
    r['seg_f'] = 2 * rec * prec / (rec + prec) if rec + prec else 0; r['seg_rec'] = rec; r['seg_prec'] = prec
    r['seg_off'] = float(np.median(offs)) if offs else 0.0
    # bar lines: the app's downbeat lands on a true bar start (4/4 songs; the app has no other meter)
    if tr.get('bpb', 4) == 4:
        fd = first + (got.get('down') or 0) * T; bars = np.array(beats[tr['down0']::4])
        r['down_ok'] = bool(np.min(np.abs(((fd - bars) / (4 * Tt) + 0.5) % 1 - 0.5)) < 0.1)
    kt, kg = tr['key'], got['key']
    if kg['pc'] == kt['pc'] and kg['mode'] == kt['mode']: r['key'] = 'exact'
    elif kg['mode'] != kt['mode'] and kg['pc'] == (kt['pc'] + (9 if kt['mode'] == 0 else 3)) % 12: r['key'] = 'relative'
    elif kg['mode'] == kt['mode'] and kg['pc'] in ((kt['pc'] + 7) % 12, (kt['pc'] + 5) % 12): r['key'] = 'fifth'
    else: r['key'] = 'wrong'
    return r

def summary(res):
    v = list(res.values())
    if not v: return ''
    mean = lambda k: sum(x[k] for x in v) / len(v)
    tot_ok = sum(x['beat_acc'] * x['beat_n'] for x in v); tot_n = sum(x['beat_n'] for x in v)
    keys = {}
    for x in v: keys[x['key']] = keys.get(x['key'], 0) + 1
    dn = [x['down_ok'] for x in v if 'down_ok' in x]
    spn = sum(x.get('spell_n', 0) for x in v); spb = sum(x.get('spell_bad', 0) for x in v)
    return (f"SUMMARY {len(v)} songs: majmin per beat {tot_ok / tot_n:.3f} (song mean {mean('beat_acc'):.3f}, worst {min(x['beat_acc'] for x in v):.3f}) · "
            f"frame {mean('frame_acc'):.3f} · seg F1 {mean('seg_f'):.3f} · key {keys} · bar lines {sum(dn)}/{len(dn)} · spelling {spn - spb}/{spn}")
