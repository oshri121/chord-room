"""Extended generator (#extended, assets/extended.js): a DJ extended version made as an edit of the track itself.

Fixture: fixtures/gen_club.py synthesises a 128 BPM club track with a known arrangement (16-bar drum intro, 16-bar verse
with a centred vocal-like tone, 8-bar build with a noise riser, 16-bar drop, 16-bar break without bass, 16-bar drop,
16-bar drum outro). The quick DSP split is used (AI separation lives in slow/).

1. Gate: #extended signed out shows the sign-in gate; signed in, the view builds (nav tab, drop zone, schematic).
2. Analysis: BPM 128 ± 0.5, key shown as a key name (never a Camelot code), section boundaries within ±1 bar of the truth
   for intro / both drops / break / outro (labels too), Phrase lock ≥ 90 %, Groove confidence ≥ 60 %.
3. Settings → the planned arrangement updates live (+90 s adds ~30 s, the list grows); relabel a section from its chip
   (popover radio group) and drag a boundary on the canvas (snaps to bars), then "back to the detected sections".
   All 96 preset × style × length plans keep the whole original in order and only repeat whole phrases; Performance Edit
   adds a build + drop cycle; filtered / percussion / drums+bass club renders have the planned length, no NaN, no clipping.
4. Generate with DJ Extended, +60 s, intro 32 / outro 32 (Drums): the first minute is playable before the whole render is done
   (head render), checklist ends with every step done and "ready"; export WAV 16-bit 44.1 kHz and check the render itself:
     - duration = planned length ± 1 beat; planned = original + 60 s here (the mixable original intro/outro count),
     - every join is on the bar grid: the kick onset at each block start sits where it sits in the source (≤ 5 ms),
     - the DJ intro's first 16 bars carry no vocal energy (1.1–1.3 kHz band < 5 % of the verse's),
     - unmodified blocks are the source itself (correlation > 0.99),
     - tools/tests/extq.py at every join: no high-band excess over both sources (≤ 3 dB, a click), the incoming beats continue
       the outgoing grid (≤ 2 ms against the true bar lines), full-mix level steps within 1.5 LU of what the music does there,
       no sung line cut (fixture truth); repeated blocks have their source's loudness (± 0.5 LU); the DJ intro's last 4 bars
       are within 1.5 LU of the original's first 4 (no jump when the song starts); the loop seams score ≥ 0.8; the intro's
       layers enter on 8-bar phrase lines; the outro ends ON the final bar line with a decaying one-beat tail (silent end),
     - quality chip ≥ 85, joins navigator (hear a join = 4 bars before → 4 after, then it stops).
5. Export MP3 320 (duration via mutagen, TBPM + Serato Markers2 GEOB) and WAV 24-bit 48 kHz (header + duration);
   file names "<name> (Extended Mix)"; activity `extended_export` logged.
6. Preview A/B: play the extended version, switch to the original at the mapped spot, loop a block, stop, hover tooltip.
   Leaving the view frees the quick stems + render; "Upgrade to AI stems" (CR.separateBuffer stubbed) re-analyses, generate again.
7. he + ar RTL (values stay LTR), dark (really dark), 375 px without horizontal scroll, zero CSP violations, no page errors.
7b. A sung pop song (fixtures/gen_styles.py 'pop': pickups, lines over bar lines), Club Extended +2 min, measured by extq against
   the song's truth: whole repeated phrases, no sung line cut at any join, no click, beats continue (≤ 2 ms), the singer in the
   drums-only DJ intro/outro ≤ −12 dB, ends on the final bar line with a tail.
8. A drifting live track (gen_club.make_drift, tempo ramp +-1.5 %): BPM refitted, every bar line on the true downbeat (<= 40 ms);
   the arrangement list titles made blocks by their role ('DJ intro' / 'DJ outro', 'from <section> · ...' below).
"""
import os, sys, re, json, time, wave, struct, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import lib, extq
sys.path.insert(0, lib.FIX)
import gen_club, gen_styles
import numpy as np

try:
    import mutagen.mp3, mutagen.id3
except ImportError:
    mutagen = None

FX = tempfile.mkdtemp(prefix='cr-club-')
POP, POP_T = gen_styles.make('pop', os.path.join(FX, 'Synth Pop - Vocal Song.wav'), voc_stem=True)   # 100 BPM, sung lines over bar lines
WAV = gen_club.make(os.path.join(FX, 'Test Artist - Club Track.wav'))
BEAT, BAR = gen_club.BEAT, gen_club.BAR

def read_wav(path):
    with wave.open(path, 'rb') as w:
        sr, nc, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2: x = np.frombuffer(raw, '<i2').astype(np.float64) / 32768
    else:
        b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16); v[v >= 1 << 23] -= 1 << 24; x = v / 8388608.0
    x = x.reshape(-1, nc)
    return sr, x

def lowpass(x, sr, fc=150, taps=801):
    k = np.arange(taps) - (taps - 1) / 2
    h = np.sinc(2 * fc / sr * k) * np.hanning(taps); h /= h.sum()
    return np.convolve(x, h, mode='same')

def onset_near(env, sr, t, before=0.03, after=0.06):
    """first time the kick envelope crosses half its local peak in [t-before, t+after] (None when there is no kick)"""
    a, z = max(0, int((t - before) * sr)), min(len(env), int((t + after) * sr))
    if z - a < 10: return None
    seg = env[a:z]; pk = seg.max()
    if pk < 0.05: return None
    i = int(np.argmax(seg > 0.5 * pk))
    return (a + i) / sr

def band_energy(x, sr, f0, f1):
    if len(x) < 1024: return 0.0
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))); f = np.fft.rfftfreq(len(x), 1 / sr)
    return float((X[(f >= f0) & (f < f1)] ** 2).sum() / len(x))

@lib.main
def test(t, srv, b):
    # ------------------------------------------------------------------ 1. gate
    t.section('gate')
    ctx, pg = lib.page(b, srv, t, mock=True, lang='en', init=lib.CSP_INIT)
    pg.goto(srv.url('#extended')); lib.wait_booted(pg)
    lib.poll(pg, "!document.querySelector('#gateView').hidden", 15)
    t.check('signed out: #extended shows the sign-in gate', pg.evaluate("document.querySelector('#extendedView').hidden&&!document.querySelector('#gateView').hidden"))
    lib.sign_up(pg, 'oshri', 'o@x.com')
    lib.poll(pg, "!document.querySelector('#extendedView').hidden&&document.querySelector('#exSrc .exdz')", 15)
    t.check('signed in: view built, nav tab on', pg.evaluate("document.querySelector('#navExtended').classList.contains('on')&&!!document.querySelector('.exschem')"))
    t.eq('nav label (en)', pg.evaluate("document.querySelector('#navExtended span[data-i=navExtended]').textContent"), 'Extended')
    t.eq('header', pg.evaluate("document.querySelector('#extendedView h1').textContent"), 'Extended Generator')
    t.shot(pg, '01-empty-en')

    # ------------------------------------------------------------------ 2. analysis
    t.section('analysis (quick stems)')
    t0 = time.time()
    pg.set_input_files('#exIn', WAV)
    lib.poll(pg, "EXTENDED._X.stage==='analyzing'&&document.querySelector('#exProc .exsteps')", 20)
    t.shot(pg, '02-analyzing')
    lib.poll(pg, "EXTENDED._X.stage==='ready'||!!EXTENDED._X.msg", 200)
    t.check('analysis finished without an error', pg.evaluate("EXTENDED._X.stage==='ready'"), pg.evaluate("EXTENDED._X.msg"))
    A = pg.evaluate("""(()=>{const s=EXTENDED._X.song;return {bpm:s.an.bpm,fd:s.g.fd,nb:s.g.nb,groove:s.groove,lock:s.lock,kind:s.kind,
        secs:s.secs,key:document.querySelector('#exStats .exkey dd').textContent.trim()}})()""")
    print('  analysis %.0fs' % (time.time() - t0), json.dumps(A))
    t.check('BPM 128 ± 0.5', abs(A['bpm'] - 128) <= 0.5, A['bpm'])
    t.check('key shown as a key name', re.fullmatch(r'[A-G][b#♭♯]?m?', A['key']) is not None, A['key'])
    t.check('no Camelot codes in the view', not re.search(r'\b\d{1,2}[AB]\b', pg.evaluate("document.querySelector('#extendedView').innerText")))
    t.eq('stems: quick split', A['kind'], 'quick')
    secs = A['secs']
    def near(lab, bar):
        return [s for s in secs if s['lab'] == lab and abs(s['a'] - bar) <= 1]
    t.check('intro starts the song and ends at bar 16 ± 1', secs[0]['lab'] == 'intro' and secs[0]['a'] == 0 and abs(secs[0]['b'] - 16) <= 1, secs[0])
    t.check('drop 1 at bar 40 ± 1', bool(near('drop', 40)), secs)
    t.check('break at bar 56 ± 1', bool(near('break', 56)), secs)
    t.check('drop 2 at bar 72 ± 1', bool(near('drop', 72)), secs)
    t.check('outro at bar 88 ± 1 to the end', secs[-1]['lab'] == 'outro' and abs(secs[-1]['a'] - 88) <= 1 and secs[-1]['b'] >= 103, secs[-1])
    t.check('verse and build found (bars 16, 32)', bool(near('verse', 16)) and bool(near('build', 32)), [s['lab'] for s in secs])
    t.check('Phrase lock ≥ 90 %', A['lock'] >= 0.9, A['lock'])
    t.check('Groove confidence ≥ 60 %', A['groove'] >= 0.6, A['groove'])
    t.check('stats show six cells (BPM, key, length, bars, groove, phrase lock)', pg.evaluate("document.querySelectorAll('#exStats .exst').length") == 6)
    t.shot(pg, '03-analysis', full_page=True)

    # ------------------------------------------------------------------ 3. settings → plan, relabel, drag
    t.section('settings → planned arrangement, section editing')
    P0 = pg.evaluate("(()=>{const p=EXTENDED._plan();return {len:p.len,n:p.blocks.length,li:document.querySelectorAll('#exList li').length,set:EXTENDED._X.set}})()")
    t.check('defaults: DJ Extended, +2 min, intro 32, outro 32, drums', P0['set']['preset'] == 'dj' and P0['set']['add'] == 120 and P0['set']['intro'] == 32 and P0['set']['outro'] == 32 and P0['set']['is'] == 'drums', P0['set'])
    pg.click('#exSet [data-add="60"]')   # the rest of the test works at +60 s
    P0 = pg.evaluate("(()=>{const p=EXTENDED._plan();return {len:p.len,n:p.blocks.length,li:document.querySelectorAll('#exList li').length,set:EXTENDED._X.set}})()")
    pg.click('#exSet [data-add="90"]')
    P1 = pg.evaluate("(()=>{const p=EXTENDED._plan();return {len:p.len,n:p.blocks.length,li:document.querySelectorAll('#exList li').length}})()")
    t.check('+90 s: plan ~30 s longer, list grows', abs(P1['len'] - P0['len'] - 30) <= BAR and P1['li'] > P0['li'], (P0, P1))
    t.check('+90 s: the extra phrase repeats the end of a drop', pg.evaluate("EXTENDED._plan().blocks.some(b=>b.role==='rep'&&EXTENDED._secs()[b.sec].lab==='drop')"))
    pg.click('#exSet [data-add="60"]')
    t.eq('back to +60 s', round(pg.evaluate("EXTENDED._plan().len"), 3), round(P0['len'], 3))
    # relabel from the section chip
    ib = next(i for i, s in enumerate(secs) if s['lab'] == 'break')
    pg.click(f'#exSecs [data-sec="{ib}"]')
    lib.poll(pg, "!document.querySelector('#exEd').hidden", 5)
    t.check('section editor: a radio group of section types, focus inside', pg.evaluate("document.querySelectorAll('#exEd [role=radio]').length===9&&document.querySelector('#exEd').contains(document.activeElement)"))
    t.shot(pg, '04-section-editor')
    pg.click('#exEd [data-lab="chorus"]')
    t.eq('relabel: break → chorus', pg.evaluate(f"EXTENDED._secs()[{ib}].lab"), 'chorus')
    t.check('relabel shows in the chip and the plan', 'Chorus' in pg.evaluate(f"document.querySelector('#exSecs [data-sec=\"{ib}\"]').textContent") and pg.evaluate("[...document.querySelectorAll('#exList b')].some(b=>b.textContent.startsWith('Chorus'))"))
    pg.keyboard.press('Escape')
    t.check('Esc closes the editor, focus back on the chip', pg.evaluate(f"document.querySelector('#exEd').hidden&&document.activeElement===document.querySelector('#exSecs [data-sec=\"{ib}\"]')"))
    # drag the boundary between the break and drop 2 (bar 72) to bar 76 on the canvas
    k = ib + 1
    pg.evaluate("document.querySelector('#exTl').scrollIntoView({block:'center'})"); time.sleep(0.2)
    geo = pg.evaluate(f"""(()=>{{const g=EXTENDED._tl(),r=document.querySelector('#exTl').getBoundingClientRect(),x=b=>r.left+(EXTENDED._srcBar(b)-g.view.v0)/g.view.span*g.W;
        return {{x0:x(EXTENDED._secs()[{k}].a),x1:x(76)+2,y:r.top+g.lay.ba[0]+g.lay.ba[1]/2}}}})()""")
    pg.mouse.move(geo['x0'], geo['y']); pg.mouse.down(); pg.mouse.move((geo['x0'] + geo['x1']) / 2, geo['y'], steps=4); pg.mouse.move(geo['x1'], geo['y'], steps=4); pg.mouse.up()
    S2 = pg.evaluate("EXTENDED._secs()")
    t.check('drag: boundary moved to bar 76 (snapped), neighbours follow', S2[k]['a'] == 76 and S2[k - 1]['b'] == 76, S2[k - 1:k + 1])
    t.check('drag: marked edited, plan rebuilt', pg.evaluate("EXTENDED._X.song.edited&&EXTENDED._plan().blocks.some(b=>b.sa===76||b.sb===76)"))
    pg.click(f'#exSecs [data-sec="{ib}"]'); lib.poll(pg, "!document.querySelector('#exEd').hidden", 5)
    pg.click('#exEd [data-a="reset"]')
    t.check('back to the detected sections', pg.evaluate("JSON.stringify(EXTENDED._secs())") == json.dumps(secs, separators=(',', ':')) and not pg.evaluate("EXTENDED._X.song.edited"))

    # every preset × intro/outro style: a valid plan (whole original kept in order, blocks inside the song, whole phrases)
    V = pg.evaluate("""(()=>{const X=EXTENDED._X,s=X.song,out=[];
      for(const preset of ['dj','club','radio','perf'])for(const st of ['drums','db','full','filt','perc','orig'])for(const add of [30,60,90,120]){
        const set={...X.set,preset,add,is:st,os:st,intro:32,outro:32},p=EXTENDED.makePlan(s,set,s.secs);
        const orig=p.blocks.filter(b=>b.role==='orig').map(b=>[b.sa,b.sb]),ok=JSON.stringify(orig)===JSON.stringify(s.secs.map(x=>[x.a,x.b]));
        const inside=p.blocks.every(b=>b.sa>=0&&b.sb<=s.g.nb&&b.sb>b.sa&&Number.isInteger(b.sa)&&Number.isInteger(b.sb));
        const reps=p.blocks.filter(b=>b.role==='rep'||b.role==='cycle').every(b=>(b.sb-b.sa)%4===0);
        out.push({preset,st,add,ok,inside,reps,added:Math.round(p.added),cyc:p.blocks.some(b=>b.role==='cycle'),flt:p.blocks.some(b=>b.ft)})}
      return out})()""")
    bad = [v for v in V if not (v['ok'] and v['inside'] and v['reps'])]
    t.check('all 96 preset/style/length plans keep the whole original and use whole phrases', not bad and len(V) == 96, bad[:3])
    t.check('Performance Edit adds an extra build + drop cycle', all(v['cyc'] for v in V if v['preset'] == 'perf' and v['add'] >= 90), [v for v in V if v['preset'] == 'perf'][:2])
    t.check('Filtered / Percussion styles automate a filter', all(v['flt'] for v in V if v['st'] in ('filt', 'perc')))
    t.check('DJ Extended +120 s plans ≈ +120 s (± 1 bar)', all(abs(v['added'] - 120) <= BAR for v in V if v['preset'] == 'dj' and v['add'] == 120 and v['st'] != 'orig'), [v['added'] for v in V if v['preset'] == 'dj' and v['add'] == 120])
    rr = pg.evaluate("""(async()=>{const X=EXTENDED._X,s=X.song,res=[];for(const st of ['filt','perc','db']){const p=EXTENDED.makePlan(s,{...X.set,preset:'club',is:st,os:st},s.secs);
        const b=await EXTENDED.renderAudio(s,p,22050);const d=b.getChannelData(0);let pk=0,nan=false;for(let i=0;i<d.length;i+=7){const v=Math.abs(d[i]);if(!(v<=1))nan=true;if(v>pk)pk=v}res.push({st,len:b.duration,plan:p.len,pk,nan})}return res})()""")
    t.check('club renders with filtered / percussion / drums+bass intros: right length, no NaN, no clipping', all(abs(x['len'] - x['plan']) < 0.01 and not x['nan'] and 0.05 < x['pk'] <= 0.98 for x in rr), rr)

    # ------------------------------------------------------------------ 4. generate + check the render
    t.section('generate (+60 s, intro 32, outro 32, drums)')
    plan = pg.evaluate("(()=>{const p=EXTENDED._planInfo();return {...p,added:EXTENDED._plan().added}})()")
    t.check('planned length = original + 60 s (± 1 bar)', abs(plan['added'] - 60) <= BAR, plan['added'])
    intro = [x for x in plan['blocks'] if x['role'] == 'intro']
    # drums only: the drums stem, or the mix itself where the original has nothing but drums (bars 0–16 of the fixture)
    t.check('plan: DJ intro = 16 bars of drums before the mixable original intro', plan['blocks'][0]['role'] == 'intro' and next(x for x in plan['blocks'] if x['role'] == 'orig')['o0'] == 16 and sum(x['sb'] - x['sa'] for x in intro) == 16
            and all((x['mask'] and x['mask']['drums'] and not x['mask']['vocals'] and not x['mask']['bass']) or (x['useMix'] and x['sb'] <= 16) for x in intro), [(x['role'], x['sa'], x['sb'], x['mask'], x['useMix']) for x in plan['blocks'][:4]])
    t.check('plan: the whole original, in order, unchanged', [(x['sa'], x['sb']) for x in plan['blocks'] if x['role'] == 'orig'] == [(s['a'], s['b']) for s in secs])
    t.check('plan: DJ outro of 16 bars, then one more downbeat hit ringing out over a beat', plan['blocks'][-1]['role'] == 'outro' and plan['endHit'] and abs(plan['tail'] - BEAT) < 0.01 and sum(x['sb'] - x['sa'] for x in plan['blocks'] if x['role'] == 'outro') == 16, (plan['tail'], plan['endHit']))
    def stage_key(x): return json.dumps([x['mask'], x['eq'], x['ft']])
    ch = [x['o0'] for a, x in zip(intro, intro[1:]) if stage_key(a) != stage_key(x)]
    t.check('DJ intro: the layers change only on 8-bar phrase lines (kick + hats → full kit)', len(ch) >= 1 and all(o % 8 == 0 for o in ch) and intro[0]['eq'] == 'kh', (ch, [x['eq'] for x in intro]))
    lp = plan['loops']['intro']
    t.check('DJ intro loop: seamless (the bar after it sounds like its first bar ≥ 0.8), alternates two similar phrases', lp['A']['seam'] >= 0.8 and lp['B'] and lp['B']['a'] != lp['A']['a'], lp)
    t0 = time.time()
    pg.click('#exSet [data-a="gen"]')
    lib.poll(pg, "EXTENDED._X.stage==='generating'&&document.querySelectorAll('#exPlan .exsteps li').length===11", 10)
    lib.poll(pg, "(EXTENDED._X.render&&EXTENDED._X.rpart)||EXTENDED._X.stage==='done'", 60, every=0.03)
    head = pg.evaluate("({part:EXTENDED._X.rpart,dur:EXTENDED._X.render&&EXTENDED._X.render.duration,stage:EXTENDED._X.stage,dis:document.querySelector('#exPlay').disabled})")
    t.check('preview starts fast: the first minute is playable while the rest renders', head['part'] and 59 < head['dur'] < 61 and head['stage'] == 'generating' and not head['dis'], head)
    pg.click('#exPlay'); lib.poll(pg, "EXTENDED._X.pb.playing", 5)
    time.sleep(0.4); t.shot(pg, '05-generating', full_page=True)
    lib.poll(pg, "EXTENDED._X.stage==='done'", 120)
    print('  generate %.1fs' % (time.time() - t0))
    time.sleep(0.3)
    sw = pg.evaluate("({p:EXTENDED._X.pb.playing,h:EXTENDED._heard(),full:!EXTENDED._X.rpart,dur:EXTENDED._X.render.duration})")
    t.check('the full render took over without stopping the preview', sw['p'] and sw['full'] and abs(sw['dur'] - plan['len']) < 0.05 and 0.3 < sw['h'] < 30, sw)
    pg.click('#exStopB')
    t.check('checklist: every step done, "ready" shown', pg.evaluate("Object.values(EXTENDED._X.steps).every(s=>s==='done')&&Object.keys(EXTENDED._X.steps).length===11&&!!document.querySelector('#exReady')"))
    time.sleep(1.8); t.shot(pg, '06-ready', full_page=True)
    # WAV 16-bit 44.1 kHz
    pg.click('#exExp [data-fm="wav16"]'); pg.click('#exExp [data-sr="44100"]')
    with pg.expect_download(timeout=120000) as d: pg.click('#exExp [data-a="exp"]')
    fn = d.value.suggested_filename; path = str(d.value.path())
    t.eq('file name', fn, 'Test Artist - Club Track (Extended Mix).wav')
    sr, R = read_wav(path); _, S = read_wav(WAV)
    t.check('render: 16-bit 44.1 kHz stereo', sr == 44100 and R.shape[1] == 2)
    dur = len(R) / sr
    t.check('render duration = planned length ± 1 beat', abs(dur - plan['len']) <= BEAT, (dur, plan['len']))
    mono, smono = R.mean(1), S.mean(1)
    env, senv = np.abs(lowpass(mono, sr)), np.abs(lowpass(smono, sr))
    kick_labs = ('intro', 'verse', 'drop', 'outro')
    res = []
    for x in plan['blocks']:
        if x['lab'] not in kick_labs or (x['mask'] and not x['mask'].get('bass') and x['eq']): continue   # 'kh' stages: no kick body to time
        o = onset_near(env, sr, x['t0']); s0 = onset_near(senv, sr, x['s0'])
        if o is None or s0 is None: continue
        res.append(((o - x['t0']) - (s0 - x['s0'])) * 1000)
    t.check('joins on the bar grid: every block-start kick where the source has it (≤ 5 ms)', len(res) >= 6 and max(abs(r) for r in res) <= 5, [round(r, 2) for r in res])
    vb = next(x for x in plan['blocks'] if x['role'] == 'orig' and x['lab'] == 'verse')
    a, z = 0, int(16 * BAR * sr)
    ev_i = band_energy(mono[a:z], sr, 1100, 1300)
    ev_v = band_energy(mono[int(vb['t0'] * sr):int(vb['t1'] * sr)], sr, 1100, 1300)
    t.check('DJ intro (first 16 bars, Drums): no vocal energy (< 5 % of the verse)', ev_v > 0 and ev_i / ev_v < 0.05, round(ev_i / max(ev_v, 1e-12), 4))
    cors = []
    for x in plan['blocks']:
        if x['role'] != 'orig': continue
        n = int((x['t1'] - x['t0'] - 0.1) * sr)
        ra = R[round((x['t0'] + 0.05) * sr):][:n, 0]; i0 = round((x['s0'] + 0.05) * sr)
        best = max(float(np.corrcoef(ra, S[i0 + lag:][:n, 0])[0, 1]) for lag in (-1, 0, 1) if len(S[i0 + lag:][:n, 0]) == n == len(ra))
        cors.append(best)
    t.check('unmodified blocks are the source itself (correlation > 0.99)', len(cors) == 7 and min(cors) > 0.99, [round(c, 5) for c in cors])
    # independent join / loudness / ending metrics on the exported render (tools/tests/extq.py) against the fixture's truth
    M = extq.measure(R, sr, S, plan, gen_club.truth()); Sm = extq.summary(M)
    print('  extq', json.dumps(Sm))
    J = M['joins']
    t.check('joins: no click (high band ≤ 3 dB over both sources at every join)', J and all(j['click_db'] <= 3 for j in J), [(j['t'], j['click_db']) for j in J])
    gm = [j['grid_ms'] for j in J if j['grid_ms'] is not None]   # None = after the song's last bar (no beat to continue)
    t.check('joins: the incoming beats continue the outgoing grid (≤ 2 ms)', len(gm) >= 2 and all(abs(g) <= 2 for g in gm), [(j['t'], j['grid_ms']) for j in J])
    t.check('joins: full-mix level steps within 1.5 LU of what the music does there', all(j['step_lu'] is None or j['step_lu'] <= 1.5 for j in J), [(j['t'], j['step_lu']) for j in J])
    t.check('joins: no sung line cut (the verse lines of the fixture)', Sm['vocal_cuts'] == 0, [(j['t'], j['vocal_cut']) for j in J if j['vocal_cut']])
    t.check('repeated blocks keep their source loudness (± 0.5 LU)', all(abs(b['d']) <= 0.5 for b in M['blocks_lu']), M['blocks_lu'])
    oi = next(x for x in plan['blocks'] if x['role'] == 'orig'); Rs = extq.Sig(R, sr)
    d_int = Rs.lu(oi['t0'] - 4 * BAR, oi['t0']) - Rs.lu(oi['t0'], oi['t0'] + 4 * BAR)
    t.check('DJ intro → original: last 4 intro bars within 1.5 LU of the first 4 original bars', abs(d_int) <= 1.5, round(d_int, 2))
    e = M['ending']
    t.check('outro ends ON the final bar line, then a decaying one-beat tail and silence', e['on_bar'] and BEAT * 0.8 < e['tail_s'] < BEAT * 1.2 and e['end_db'] < -40, e)
    q = pg.evaluate("EXTENDED._quality()")
    t.check('quality (in the app, measured on the render): ≥ 85, every join clean, seams ≥ 0.8, no vocal cuts', q and q['score'] >= 85 and q['clean'] == 100 and q['seam'] >= 0.8 and q['cuts'] == 0, q and {k: q[k] for k in q if k != 'joins'})

    # ------------------------------------------------------------------ 5. MP3 + WAV 24/48
    t.section('export MP3 320 + Serato cues, WAV 24-bit 48 kHz, activity')
    pg.click('#exExp [data-fm="mp3"]')
    t.check('Serato cue option shown for MP3, on by default', pg.evaluate("!document.querySelector('#exCuesC').closest('label').hidden&&document.querySelector('#exCuesC').checked"))
    with pg.expect_download(timeout=150000) as d: pg.click('#exExp [data-a="exp"]')
    fn = d.value.suggested_filename; path = str(d.value.path())
    t.eq('mp3 file name', fn, 'Test Artist - Club Track (Extended Mix).mp3')
    data = open(path, 'rb').read()
    t.check('mp3: ID3 + MPEG frames', data[:3] == b'ID3' and len(data) > 1_000_000, len(data))
    if mutagen:
        m = mutagen.mp3.MP3(path)
        t.check('mp3 duration = planned length ± 1 beat', abs(m.info.length - plan['len']) <= BEAT, (m.info.length, plan['len']))
        t.check('mp3 320 kbps', m.info.bitrate >= 300000, m.info.bitrate)
        tags = m.tags
        t.eq('mp3 TBPM', str(tags.get('TBPM')), '128')
        t.check('mp3 TKEY is a key name', re.fullmatch(r'[A-G][b#]?m?', str(tags.get('TKEY'))) is not None, str(tags.get('TKEY')))
        geob = [f for f in tags.getall('GEOB') if f.desc == 'Serato Markers2']
        t.check('mp3: Serato Markers2 cues (intro, drop, outro of the new arrangement)', len(geob) == 1, [f.desc for f in tags.getall('GEOB')])
        t.check('mp3 title "(Extended Mix)", artist kept', str(tags.get('TIT2')) == 'Club Track (Extended Mix)' and str(tags.get('TPE1')) == 'Test Artist', (str(tags.get('TIT2')), str(tags.get('TPE1'))))
    cues = pg.evaluate("EXTENDED.newCues()")
    dr1 = next(x for x in plan['blocks'] if x['role'] == 'orig' and x['lab'] == 'drop')
    t.check('cues: intro 0, drop at the first drop, outro at the DJ outro', [c['k'] for c in cues] == ['intro', 'drop', 'outro'] and abs(cues[1]['t'] - dr1['t0']) < 0.01, cues)
    pg.click('#exExp [data-fm="wav24"]'); pg.click('#exExp [data-sr="48000"]')
    with pg.expect_download(timeout=150000) as d: pg.click('#exExp [data-a="exp"]')
    raw = open(d.value.path(), 'rb').read()
    nc, sr2, bits = struct.unpack('<H', raw[22:24])[0], struct.unpack('<I', raw[24:28])[0], struct.unpack('<H', raw[34:36])[0]
    frames = struct.unpack('<I', raw[40:44])[0] // (nc * bits // 8)
    t.check('wav 24-bit 48 kHz stereo', (nc, sr2, bits) == (2, 48000, 24), (nc, sr2, bits))
    t.check('wav 48 kHz duration = planned ± 1 beat', abs(frames / 48000 - plan['len']) <= BEAT, frames / 48000)
    acts = pg.evaluate("(window.__log||[]).map(a=>a.action+' '+(a.detail||''))")
    t.check('activity logged: extended_export', sum(1 for a in acts if a.startswith('extended_export ')) >= 3, [a for a in acts if a.startswith('extended')][:3])
    t.check('activity label in the admin strings (5 languages)', pg.evaluate("['he','en','ar','ru','es'].every(l=>{CR.setLang(l);return CR.t('act_extended_export')!=='act_extended_export'})"))
    pg.evaluate("CR.setLang('en')")

    # ------------------------------------------------------------------ 6. preview: joins, quality, A/B + loop
    t.section('preview before download: joins navigator, quality chip, A/B, loop a block')
    pv = pg.evaluate("({pv:!document.querySelector('#exPv').hidden,q:document.querySelector('#exPv .exq b')&&document.querySelector('#exPv .exq b').textContent,n:EXTENDED.joinList().length,lab:document.querySelector('#exPv .exjl').textContent,dl:document.querySelector('#exExp [data-a=exp]').textContent,note:document.querySelector('#exExp .exdlnote').textContent})")
    t.check('preview row: joins navigator + quality chip; the paid step says Download and that listening is free', pv['pv'] and pv['q'] and int(pv['q']) >= 85 and pv['n'] >= 3 and 'Download' in pv['dl'] and 'free' in pv['note'], pv)
    pg.click('#exPv [data-jn="next"]'); time.sleep(0.25)
    jn = pg.evaluate("(()=>{const P=EXTENDED._X.pb,j=EXTENDED.joinList()[EXTENDED._X.join],B=EXTENDED._plan().B;return {i:EXTENDED._X.join,p0:P.p0,until:P.until,t:j.t,B,playing:P.playing,lab:document.querySelector('#exPv .exjl').textContent}})()")
    t.check('next join: plays 4 bars before → 4 bars after it, label "Join 1 of N"', jn['i'] == 0 and jn['playing'] and abs(jn['p0'] - max(0, jn['t'] - 4 * jn['B'])) < 0.05 and abs(jn['until'] - (jn['t'] + 4 * jn['B'])) < 0.05 and jn['lab'].startswith('Join 1 of'), jn)
    pg.keyboard.press('j'); time.sleep(0.2)
    t.check('J = the next join', pg.evaluate("EXTENDED._X.join") == 1)
    pg.click('#exPv [data-a="q"]')
    t.check('quality details: clean joins / loop seams / level jumps / vocal cuts', pg.evaluate("!document.querySelector('#exQp').hidden&&document.querySelectorAll('#exQp .exqr').length===4&&document.querySelector('#exPv [data-a=q]').getAttribute('aria-expanded')==='true'"))
    t.shot(pg, '06b-preview-joins', full_page=False)
    pg.evaluate("document.querySelector('#exVol').value='40';document.querySelector('#exVol').dispatchEvent(new Event('input',{bubbles:true}))")
    t.check('volume: saved in the settings, applied to the preview', abs(pg.evaluate("EXTENDED._X.set.vol") - 0.4) < 1e-6)
    pg.click('#exStopB')
    pg.click('#exAB [data-pb="B"]')
    lib.poll(pg, "EXTENDED._X.pb.playing&&EXTENDED._X.pb.which==='B'", 5)
    vb_t = vb['t0'] + 5
    tl = pg.evaluate("EXTENDED._tl()")
    # seek on the extended waveform into the verse, then switch to the original
    pg.evaluate("document.querySelector('#exTl').scrollIntoView({block:'center'})"); time.sleep(0.2)
    r = pg.evaluate("(()=>{const r=document.querySelector('#exTl').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width}})()")
    x = r['l'] + (vb_t - tl['view']['v0']) / tl['view']['span'] * tl['W']; y = r['t'] + tl['lay']['wb'][0] + tl['lay']['wb'][1] / 2
    pg.mouse.click(x, y); time.sleep(0.8)
    hb = pg.evaluate("EXTENDED._heard()")
    t.check('click on the extended waveform seeks there (playing)', abs(hb - vb_t) < 1.5 and pg.evaluate("EXTENDED._X.pb.playing"), hb)
    m = pg.evaluate("(()=>{const h=EXTENDED._heard(),exp=EXTENDED.extToSrc(h);document.querySelector('#exSw').click();const P=EXTENDED._X.pb;return {exp,p0:P.p0,which:P.which,playing:P.playing}})()")
    t.check('A/B: switches to the original at the mapped spot', m['which'] == 'A' and m['playing'] and abs(m['p0'] - m['exp']) < 0.15 and abs(m['exp'] - (vb['s0'] + (hb - vb['t0']))) < 1.5, m)
    pg.keyboard.press('t')
    t.check('T switches back to the extended version', pg.evaluate("EXTENDED._X.pb.which==='B'&&EXTENDED._X.pb.playing"))
    pg.click('#exList [data-blk="3"]')
    pg.click('#exLoop')
    time.sleep(0.4)
    lp = pg.evaluate("(()=>{const P=EXTENDED._X.pb,p=EXTENDED._plan(),b=p.blocks[3];return {loop:P.loop,src:!!P.src&&P.src.loop,s:P.src&&P.src.loopStart,e:P.src&&P.src.loopEnd,a:EXTENDED._outBar(b.o0),z:EXTENDED._outBar(b.o1),insp:document.querySelector('#exInsp').textContent}})()")
    t.check('loop block: the selected block loops', lp['loop'] and lp['src'] and abs(lp['s'] - lp['a']) < 1e-6 and abs(lp['e'] - lp['z']) < 1e-6, lp)
    t.check('inspector says where the block came from', 'From ' in lp['insp'] and 'bars' in lp['insp'], lp['insp'])
    t.shot(pg, '07-playing-loop')
    pg.click('#exStopB')
    t.check('stop', not pg.evaluate("EXTENDED._X.pb.playing"))
    # hover tooltip on a block of the extended lane
    pg.evaluate("document.querySelector('#exTl').scrollIntoView({block:'center'})"); time.sleep(0.2)
    r = pg.evaluate("(()=>{const r=document.querySelector('#exTl').getBoundingClientRect();return {l:r.left,t:r.top,w:r.width}})()")
    b0 = plan['blocks'][0]; xh = r['l'] + ((b0['t0'] + b0['t1']) / 2 - tl['view']['v0']) / tl['view']['span'] * tl['W']
    pg.mouse.move(xh, r['t'] + tl['lay']['bb'][0] + 6); time.sleep(0.2)
    t.check('hover: tooltip "where the system took this from"', pg.evaluate("!document.querySelector('#exTip').hidden&&document.querySelector('#exTip').textContent.includes('Drums')"), pg.evaluate("document.querySelector('#exTip').textContent"))

    # ------------------------------------------------------------------ leaving the view frees memory
    t.section('hide frees quick stems + render; AI upgrade (stubbed separation); generate again')
    pg.evaluate("location.hash='#pricing'"); lib.poll(pg, "!document.querySelector('#pricingView').hidden", 10)
    t.check('hidden: quick stems and the render freed, analysis kept', pg.evaluate("EXTENDED._X.render===null&&EXTENDED._X.song.stems===null&&EXTENDED._X.stage==='ready'&&EXTENDED._secs().length===7"))
    pg.evaluate("location.hash='#extended'"); lib.poll(pg, "!document.querySelector('#extendedView').hidden", 10)
    t.check('back: analysis + plan shown, export hidden until generated again', pg.evaluate("!document.querySelector('#exMain').hidden&&document.querySelector('#exExp').hidden&&!!document.querySelector('#exList li')"))
    # AI upgrade (CR.separateBuffer stubbed: the real model is in slow/)
    pg.evaluate("(()=>{window.__sepCalls=[];CR.separateBuffer=async(buf,o)=>{window.__sepCalls.push(o&&o.ref);o.onProgress(0.5,'…');return {vocals:buf,drums:buf,bass:buf,other:buf}}})()")
    pg.click('#exSrc [data-a="ai"]')
    lib.poll(pg, "EXTENDED._X.song.kind==='ai'&&!EXTENDED._X.sep", 60)
    t.check('AI stems: separateBuffer called with an extended ref, structure re-analysed, upgrade button gone',
            pg.evaluate("window.__sepCalls.length===1&&/^extended: /.test(window.__sepCalls[0])&&EXTENDED._secs().length>=3&&!!EXTENDED._X.song.stems&&!document.querySelector('#exSrc [data-a=ai]')&&document.querySelector('#exSrc .exkind').textContent.includes('AI')"),
            pg.evaluate("[window.__sepCalls,document.querySelector('#exSrc').textContent]"))
    pg.click('#exSet [data-a="gen"]')
    lib.poll(pg, "EXTENDED._X.stage==='done'", 120)
    t.check('generate again with AI stems: rendered, export shown', pg.evaluate("!!EXTENDED._X.render&&!document.querySelector('#exExp').hidden&&!document.querySelector('#exExp [data-a=exp]').disabled"))

    # ------------------------------------------------------------------ 7. languages, RTL, dark, 375 px
    t.section('he + ar RTL, dark, 375 px')
    pg.mouse.move(5, 5)
    for lang, theme, w in (('he', 'light', 1300), ('ar', 'dark', 375), ('he', 'dark', 375), ('ru', 'dark', 1300), ('es', 'light', 375)):
        pg.set_viewport_size({'width': w, 'height': 900})
        pg.evaluate("([l,th])=>{CR.setLang(l);document.documentElement.dataset.theme=th;document.querySelector('#themeBtn').click();document.querySelector('#themeBtn').click()}", [lang, theme])
        time.sleep(0.5)
        t.eq(f'{lang}: document dir', pg.evaluate("document.documentElement.dir"), 'rtl' if lang in ('he', 'ar') else 'ltr')
        nav = pg.evaluate("document.querySelector('#navExtended span[data-i=navExtended]').textContent")
        t.check(f'{lang}: nav label + title translated', nav in ('אקסטנדד', 'إكستندد', 'Extended') and pg.evaluate("document.querySelector('#extendedView h1').textContent") not in ('', 'exTitle', 'Extended Generator'), nav)
        t.eq(f'{lang} {w}px: no horizontal scroll', lib.scroll_width(pg), w)
        t.check(f'{lang} {w}px: preview controls stay inside the console', pg.evaluate("""(()=>{const d=document.querySelector('#exDeck').getBoundingClientRect();
            return ['#exPlay','#exAB','#exVol','#exPv .exjn','#exPv .exq'].every(s=>{const e=document.querySelector(s);if(!e)return true;const r=e.getBoundingClientRect();return r.left>=d.left-1&&r.right<=d.right+1})})()"""))
        if lang in ('he', 'ar'):
            t.check(f'{lang}: times / BPM values stay LTR', pg.evaluate("[...document.querySelectorAll('#extendedView .exbkt,#exStats dd,#exTime,#exTl')].every(e=>getComputedStyle(e).direction==='ltr')"))
        if theme == 'dark': t.check(f'{lang}: dark background really dark', lib.page_luma(pg, '.exset') < 80, lib.page_luma(pg, '.exset'))
        t.check(f'{lang}: no untranslated keys', not re.search(r'\bex[A-Z]\w+', pg.evaluate("document.querySelector('#extendedView').innerText")))
        t.shot(pg, f'08-{lang}-{theme}-{w}', full_page=True)
    t.check('zero CSP violations', lib.csp_violations(pg) == [], lib.csp_violations(pg))

    # ------------------------------------------------------------------ 7b. a sung pop song: body repeats never chop a line
    t.section('pop song with vocals (pickups, lines over bar lines): Club Extended +2 min (16/16: the body grows)')
    pg.set_viewport_size({'width': 1300, 'height': 900}); pg.evaluate("CR.setLang('en')")
    pg.evaluate("document.querySelector('#exIn').value=''"); pg.set_input_files('#exIn', POP)
    lib.poll(pg, "EXTENDED._X.stage==='analyzing'", 20); lib.poll(pg, "EXTENDED._X.stage==='ready'||!!EXTENDED._X.msg", 200)
    pg.click('#exSet [data-ps="club"]'); pg.click('#exSet [data-a="gen"]'); lib.poll(pg, "EXTENDED._X.stage==='done'", 120)
    pp = pg.evaluate("EXTENDED._planInfo()")
    pg.click('#exExp [data-fm="wav16"]'); pg.click('#exExp [data-sr="44100"]')
    with pg.expect_download(timeout=150000) as d: pg.click('#exExp [data-a="exp"]')
    sr2, R2 = read_wav(str(d.value.path())); _, S2 = read_wav(POP); _, V2 = read_wav(POP + '.voc.wav')
    M2 = extq.measure(R2, sr2, S2, pp, POP_T, V2); S2m = extq.summary(M2); print('  extq pop', json.dumps(S2m))
    reps = [b for b in pp['blocks'] if b['role'] == 'rep']
    t.check('pop: the body is extended by whole repeated phrases', len(reps) >= 1 and all((b['sb'] - b['sa']) % 4 == 0 for b in reps), [(b['sa'], b['sb']) for b in reps])
    t.check('pop: no sung line cut at any join (truth: every phrase incl. pickups)', S2m['vocal_cuts'] == 0, [(j['t'], j['vocal_cut']) for j in M2['joins'] if j['vocal_cut']])
    t.check('pop: no click, beats continue (≤ 2 ms)', S2m['clicks'] == 0 and S2m['grid_max'] <= 2, (S2m['click_max'], S2m['grid_max']))
    t.check('pop: the DJ intro/outro drums carry the singer ≤ −12 dB (quick split)', S2m['bleed_max'] <= -12, M2.get('bleed_db'))
    t.check('pop: ends on the final bar line with a tail', S2m['ending']['on_bar'] and S2m['ending']['end_db'] < -40, S2m['ending'])

    # ------------------------------------------------------------------ 8. a drifting live track: the grid follows the beats
    t.section('drifting tempo (live feel, ±1.5 %): grid tracked, BPM refitted, labels in the list')
    DW, downs = gen_club.make_drift(os.path.join(FX, 'Live Band - Drift.wav'))
    pg.evaluate("document.querySelector('#exIn').value=''"); pg.set_input_files('#exIn', DW)
    lib.poll(pg, "EXTENDED._X.stage==='analyzing'", 20); lib.poll(pg, "EXTENDED._X.stage==='ready'||!!EXTENDED._X.msg", 200)
    G = pg.evaluate("(()=>{const s=EXTENDED._X.song;return {bpm:s.an.bpm,drift:!!s.drift,nb:s.g.nb,t:Array.from({length:s.g.nb+1},(_,k)=>EXTENDED._srcBar(k))}})()")
    errs = [min(abs(x - d) for d in downs) for x in G['t']]
    t.check('drift: BPM refitted to the true mean (120 ± 0.3)', abs(G['bpm'] - 120) <= 0.3, G['bpm'])
    t.check('drift: every bar line within 40 ms of the true downbeat (a constant grid is off by up to ~0.45 s)', G['drift'] and max(errs) <= 0.04, round(max(errs) * 1000, 1))
    lst = pg.evaluate("[...document.querySelectorAll('#exList li')].map(l=>[l.querySelector('b').textContent,l.querySelector('.exbks').textContent])")
    t.check('list: made blocks are titled by their role, the source in the line below', lst[0][0] == 'DJ intro' and lst[0][1].startswith('from ') and lst[-1][0] == 'DJ outro', [lst[0], lst[-1]])
    ctx.close()
