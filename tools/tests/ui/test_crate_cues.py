"""Crate + auto cue points on a synthetic EDM track with a known structure (fixtures/gen_edm.py, accounts off):
BPM 128, cues intro/break/build/drop/outro land on the true bars, the rekordbox-style overview plays + seeks,
grid moves (±1 beat, −10 ms, "a bar starts here", reset) shift grid and cues, dragging the Drop flag moves it by
whole bars, exports carry the cues (rekordbox XML POSITION_MARK + TEMPO, Traktor NML CUE_V2, Serato Markers2 GEOB
in the MP3 copy inside the ZIP when ffmpeg + mutagen are available), leaving the view stops the audio, rows
survive a reload.
Three generated files go into the Crate: the main WAV (must be right) plus two variants for KNOWN issues (reported,
never failing): an MP3 with louder off-beat hats (grid locks half a beat off; also used for the Serato GEOB check)
and a WAV whose music starts exactly at 0:00 (cues one bar late)."""
import base64, io, os, shutil, struct, subprocess, sys, tempfile, time, zipfile
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib
sys.path.insert(0, lib.FIX)
import gen_edm

BEAT, BAR = gen_edm.BEAT, gen_edm.BAR
LEAD = 0.5
TRUE_T = {k: LEAD + b * BAR for k, b in gen_edm.EXPECT.items()}

def serato_cues(mp3):
    from mutagen.id3 import ID3
    g = [f for f in ID3(mp3).getall('GEOB') if f.desc == 'Serato Markers2'][0]; data = g.data
    assert data[:2] == b'\x01\x01'
    b64 = data[2:data.index(b'\x00', 2)].replace(b'\n', b'')
    pad = b'A==' if len(b64) % 4 == 1 else b'=' * (-len(b64) % 4)
    fp = io.BytesIO(base64.b64decode(b64 + pad)); assert fp.read(2) == b'\x01\x01'
    out = []
    while True:
        name = b''
        while (c := fp.read(1)) != b'\x00' and c: name += c
        if not name: break
        ln = struct.unpack('>I', fp.read(4))[0]; d = fp.read(ln)
        if name == b'CUE': out.append((d[12:].rstrip(b'\x00').decode(), struct.unpack('>I', d[2:6])[0] / 1000))
    return out

@lib.main
def test(t, srv, b):
    tmp = tempfile.mkdtemp(prefix='cr-cues-')
    main = gen_edm.make(os.path.join(tmp, 'Test DJ - Main Drop.wav'), lead=LEAD)
    lead0 = gen_edm.make(os.path.join(tmp, 'Test DJ - Lead Zero.wav'), lead=0)
    files, loud = [main], None
    if shutil.which('ffmpeg'):
        w = gen_edm.make(os.path.join(tmp, 'loud.wav'), hat_gain=0.075, lead=LEAD)
        loud = os.path.join(tmp, 'Test DJ - Loud Hats.mp3')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', w, '-b:a', '128k', loud], check=True)
        files.append(loud)
    else:
        print('  (ffmpeg not installed: no MP3 row → Serato GEOB + loud-hats checks skipped)')
    files.append(lead0)
    ctx, pg = lib.page(b, srv, t, accounts=False, h=1000)
    pg.goto(srv.url('#crate')); lib.wait_booted(pg)
    pg.set_input_files('#crIn', files)
    lib.poll(pg, "CRATE._C.rows.length===%d&&CRATE._C.rows.every(r=>r.st==='ok'||r.st==='err')" % len(files), 60 * len(files)); time.sleep(0.5)
    print(f'  analysed {len(files)} files in {time.time() - t.t0:.0f}s')
    ROW = "(CRATE._C.rows.find(r=>r.name.includes(%s))||{})"
    get = lambda part, js='r': pg.evaluate("(r=>%s)%s" % (js, '(' + ROW % repr(part) + ')'))
    row = get('Main', '({st:r.st,bpm:r.bpm,dur:r.dur,cues:r.cues||[]})')
    t.eq('main: analysed, BPM 128', (row['st'], row['bpm']), ('ok', 128))
    cues = {c['k']: c['t'] for c in row['cues']}
    print('  cues', cues)
    for k in ['intro', 'vocal', 'break', 'build', 'drop', 'outro']:
        t.check(f'main: cue {k} at bar {gen_edm.EXPECT[k]} ({TRUE_T[k]:.2f}s ±0.25)', k in cues and abs(cues[k] - TRUE_T[k]) < 0.25, cues.get(k))
    cue_t = lambda k: get('Main', "(r.cues.find(c=>c.k===%r)||{}).t" % k)
    gsh = lambda: get('Main', 'r.gsh||0')
    TR = '#crBody tr:has-text("Main Drop")'

    t.section('overview: play, seek, grid moves, drag')
    pg.click(TR + ' .rbov .ovp'); time.sleep(1.5)
    t.check('playing: position bar shown', pg.evaluate("!!document.querySelector('.ovbar')"), pg.inner_text('.ovt'))
    box = pg.query_selector(TR + ' .rbov').bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.6, box['y'] + box['height'] * 0.7); time.sleep(0.8)
    pos = pg.inner_text('.ovt').split('/')[0].strip(); m, s = pos.split(':')
    t.check('click at 60 % seeks there', abs(int(m) * 60 + int(s) - 0.6 * row['dur']) < 4, pos)
    d0 = cue_t('drop')
    pg.click('[data-act="gbeatp"]'); time.sleep(0.3)
    t.check('grid +1 beat moves the cues by one beat', abs(abs(cue_t('drop') - d0) - BEAT) < 0.02 and abs(abs(gsh()) - BEAT) < 0.02, (cue_t('drop'), gsh()))
    g1 = gsh(); pg.click('[data-act="gfinem"]'); time.sleep(0.3)
    t.check('fine −10 ms', abs(gsh() - (g1 - 0.01)) < 0.002, gsh())
    g2 = gsh(); pg.click('[data-act="gbar"]'); time.sleep(0.3)
    t.check('"a bar starts here" (at the playhead) changes the shift', abs(gsh() - g2) > 0.001, (g2, gsh()))
    pg.click('[data-act="greset"]'); time.sleep(0.3)
    t.check('reset: shift 0, cues back', abs(gsh()) < 1e-6 and abs(cue_t('drop') - d0) < 0.002, (gsh(), cue_t('drop')))
    f = pg.query_selector(TR + ' .cuef[data-cue="drop"]').bounding_box(); bb = pg.query_selector(TR + ' .rbov').bounding_box()
    dx = bb['width'] * (4 * BAR) / row['dur']
    pg.mouse.move(f['x'] + 5, f['y'] + 5); pg.mouse.down(); pg.mouse.move(f['x'] + 5 + dx / 2, f['y'] + 5, steps=5); pg.mouse.move(f['x'] + 5 + dx, f['y'] + 5, steps=5); pg.mouse.up(); time.sleep(0.4)
    moved = cue_t('drop') - d0
    t.check('drag Drop flag ≈ +4 bars, snapped to a bar', abs(moved - 4 * BAR) < BAR + 0.01 and abs(moved / BAR - round(moved / BAR)) < 0.01, f'{moved:.3f}s = {moved / BAR:.2f} bars')
    pg.click(TR + ' .rbov .ovp'); time.sleep(0.3)
    t.shot(pg, 'crate_overview')

    t.section('exports')
    pg.fill('#crFolderIn', 'C:\\Music\\Set')
    def dl(sel):
        with pg.expect_download(timeout=60000) as d: pg.click(sel)
        return d.value.path()
    x = ET.parse(dl('#crXml'))
    trk = [e for e in x.iter('TRACK') if 'Main' in (e.get('Location') or '')]
    marks = [(m.get('Name'), float(m.get('Start'))) for m in trk[0].iter('POSITION_MARK')] if trk else []
    xd = [s for n, s in marks if n == 'Drop']
    t.check('rekordbox XML: Drop mark at the (dragged) drop cue', xd and abs(xd[0] - cue_t('drop')) < 0.002, (xd[:2], cue_t('drop')))
    t.check('rekordbox XML: hot cues + memory cues', len(marks) >= 10, len(marks))
    t.check('rekordbox XML: TEMPO grid 128', trk and any(abs(float(e.get('Bpm')) - 128) < 0.01 for e in trk[0].iter('TEMPO')))
    t.check('rekordbox XML: Location uses the folder path', trk and 'Music/Set' in trk[0].get('Location'), trk and trk[0].get('Location'))
    n = ET.parse(dl('#crNml'))
    ent = [e for e in n.iter('ENTRY') if any('Main' in (l.get('FILE') or '') for l in e.iter('LOCATION'))]
    nc = [(c.get('NAME'), float(c.get('START'))) for c in ent[0].iter('CUE_V2')] if ent else []
    nd = [s for nm, s in nc if nm == 'Drop']
    t.check('Traktor NML: Drop CUE_V2 (ms)', nd and abs(nd[0] / 1000 - cue_t('drop')) < 0.01, nc[:6])
    if loud:
        try:
            import mutagen  # noqa
            z = zipfile.ZipFile(dl('#crZip')); names = z.namelist()
            mp = [k for k in names if k.endswith('.mp3')]
            t.check('ZIP: renamed copies "key - bpm - name" + m3u8', mp and ' - 128 - ' in mp[0] and any(k.endswith('.m3u8') for k in names), names)
            out = os.path.join(tmp, 'out.mp3'); open(out, 'wb').write(z.read(mp[0]))
            sc = serato_cues(out)
            want = {c['k']: c['t'] for c in get('Loud', 'r.cues||[]')}
            t.check('Serato Markers2 GEOB in the MP3 copy = that row\'s cues', sc and all(abs(want.get(nm.lower(), -9) - s) < 0.01 for nm, s in sc), (sc, want))
        except ImportError:
            print('  (mutagen missing: Serato GEOB check skipped — pip install mutagen)')
    pg.click('#navTool'); time.sleep(0.3)
    t.check('leaving the Crate stops playback', pg.evaluate("[...document.querySelectorAll('audio')].every(a=>a.paused)"))

    t.section('reload keeps rows + overviews')
    pg.goto(srv.url('#crate')); lib.reload(pg)
    lib.poll(pg, "document.querySelectorAll('canvas[data-ov]').length>0", 15)
    t.check('rows restored with their overview waveform', pg.evaluate("CRATE._C.rows.length") == len(files) and all(pg.evaluate("CRATE._C.rows.map(r=>!!r.wv)")))

    t.section('known issues (analysis heuristics)')
    def report(part, lead, label, fixed=False):
        r = get(part, '({bpm:r.bpm,offset:r.offset,down:r.down||0,cues:r.cues||[]})')
        T = 60 / r['bpm']; ph = (r['offset'] % T) / T; fd = ph * T + r['down'] * T
        drop = {c['k']: c['t'] for c in r['cues']}.get('drop', 0); err = drop - (lead + gen_edm.DROP * BAR)
        (t.check if fixed else t.known)(label, abs(err) < 0.1 and min(ph, 1 - ph) < 0.1, f"bpm {r['bpm']}, grid phase {ph:.2f} beat (0 = kick), first downbeat {fd:.3f}s, drop off by {err:+.2f}s")
    if loud: report('Loud', LEAD, 'off-beat hats at -20 dB: grid stays on the kick, drop on time')
    # fixed by the +15 ms onset-frame correction (ENV_LAG in app.js): the first beat at 0.000 is no longer estimated at -0.015
    report('Lead Zero', 0, 'music starting at 0:00: drop on time (bar 24 = 45.00s)', fixed=True)
    shutil.rmtree(tmp, ignore_errors=True)
