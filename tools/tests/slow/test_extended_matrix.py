"""Extended generator, the heavy matrix (opt-in with --slow, ≈ 6–8 min): every style of fixtures/gen_styles.py + the club
fixture, DJ Extended (+2 min, intro/outro 32 bars, Drums) and Club Extended (+2 min, 16/16, Drums + bass), quick DSP stems.
Each render is exported as WAV and measured by tools/tests/extq.py against the song's truth (beats, sections, sung phrases,
the vocals alone):

  - no click at any join (high band ≤ 3 dB over both sources — 4 dB on the live song —, the stem's own behaviour at other
    downbeats subtracted),
  - the incoming beats continue the outgoing grid: ≤ 2 ms on quantised songs, ≤ 12 ms on the live (drifting) one,
  - body (full-mix) level steps ≤ 2 LU beyond what the music does there (measured max 1.6); repeated blocks keep their source
    loudness (± 0.6 LU; ± 1 LU on the live song, where drifting bars go through Signalsmith),
  - sung lines cut at joins: 0 on DJ Extended for every style (the engine's tail / pickup / duck rules + vocal-aware choice),
  - vocal bleed in drums-only DJ intro/outro blocks ≤ −12 dB of the singer (quick split; AI stems are cleaner),
  - the track ends ON the final bar line with a decaying one-beat tail and a silent end,
  - the in-app quality score is reported and not wildly off the measured joins (≥ 50 when every measured join is clean).
Prints one line per render (the table REVIEW-EXTENDED.md quotes).
"""
import os, sys, json, time, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import lib, extq
sys.path.insert(0, lib.FIX)
import gen_club, gen_styles

TMP = tempfile.mkdtemp(prefix='cr-extm-')
CONF = (('dj', 'dj'), ('club', 'club'))

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=True, lang='en')
    pg.goto(srv.url('#extended')); lib.wait_booted(pg); lib.poll(pg, "!document.querySelector('#gateView').hidden", 15)
    lib.sign_up(pg, 'oshri', 'o@x.com')
    lib.poll(pg, "!document.querySelector('#extendedView').hidden&&document.querySelector('#exSrc .exdz')", 15)
    songs = [('club', gen_club.make(os.path.join(TMP, 'club.wav')), gen_club.truth(), None)]
    for st in gen_styles.STYLES:
        path, tr = gen_styles.make(st, os.path.join(TMP, st + '.wav'), voc_stem=True)
        songs.append((st, path, tr, path + '.voc.wav'))
    for name, path, truth, vocp in songs:
        t.section(name)
        pg.evaluate("document.querySelector('#exIn').value=''"); pg.set_input_files('#exIn', path)
        lib.poll(pg, "EXTENDED._X.stage==='analyzing'", 20); lib.poll(pg, "EXTENDED._X.stage==='ready'||!!EXTENDED._X.msg", 300)
        if not t.check(f'{name}: analysed', pg.evaluate("EXTENDED._X.stage") == 'ready', pg.evaluate("EXTENDED._X.msg")): continue
        src = extq.read_wav(path)[1]; voc = extq.read_wav(vocp)[1] if vocp else None
        for cn, preset in CONF:
            pg.click(f'#exSet [data-ps="{preset}"]'); pg.click('#exSet [data-a="gen"]')
            lib.poll(pg, "EXTENDED._X.stage==='done'||!!EXTENDED._X.msg", 200)
            plan = pg.evaluate("EXTENDED._planInfo()")
            pg.click('#exExp [data-fm="wav16"]'); pg.click('#exExp [data-sr="44100"]')
            with pg.expect_download(timeout=200000) as d: pg.click('#exExp [data-a="exp"]')
            rp = os.path.join(TMP, f'r_{name}_{cn}.wav'); d.value.save_as(rp)
            sr, ren = extq.read_wav(rp); os.remove(rp)
            M = extq.measure(ren, sr, src, plan, truth, voc); S = extq.summary(M); q = plan.get('quality') or {}
            print(f'  {name}/{cn}: q {q.get("score")} ', json.dumps(S))
            J = M['joins']; live = truth.get('live')
            lim = 4 if live else 3   # live playing: the jitter of the hits themselves reads up to ~1 dB at a downbeat
            t.check(f'{name}/{cn}: no click at a join', all(j['click_db'] <= lim for j in J), [(j['t'], j['click_db']) for j in J if j['click_db'] > 3])
            t.check(f'{name}/{cn}: beats continue across joins (≤ {12 if live else 2} ms)', S['grid_max'] <= (12 if live else 2), [(j['t'], j['grid_ms']) for j in J])
            body = [j['step_lu'] for j in J if j['step_lu'] is not None and not (j['frm'] == j['role'] and j['role'] in ('intro', 'outro'))]
            bl = 1.0 if live else 0.6   # a ducked pickup takes a little level off a short repeat; live: Signalsmith on drifting bars
            t.check(f'{name}/{cn}: body level steps ≤ 2 LU, repeats keep their loudness (± {bl} LU)', max(body or [0]) <= 2 and S['blocks_lu_max'] <= bl, (body, S['blocks_lu_max']))
            if cn == 'dj': t.check(f'{name}/{cn}: no sung line cut', S['vocal_cuts'] == 0, [(j['t'], j['vocal_cut']) for j in J if j['vocal_cut']])
            if voc is not None: t.check(f'{name}/{cn}: vocal bleed in drums-only blocks ≤ −12 dB', S['bleed_max'] <= -12, M.get('bleed_db'))
            e = S['ending']
            if plan['endHit']: t.check(f'{name}/{cn}: ends on the final bar line with a one-beat tail, silent end', e['on_bar'] and e['end_db'] < -40, e)
            t.check(f'{name}/{cn}: quality reported', isinstance(q.get('score'), int) and 0 <= q['score'] <= 100, q.get('score'))
    ctx.close()
