"""Converter (#convert, assets/convert.js): batch media conversion in the browser.

Fixtures come from fixtures/gen_media.py (system ffmpeg + mutagen when present; WAV + PNG always): tagged MP3
(APIC cover), WAV (id3 chunk), FLAC (PICTURE), OGG/Opus, M4A (covr), MP4 video, AIFF.

1. Gate: #convert signed out shows the sign-in gate; signed in, the view builds (nav tab, drop zone, options).
2. Everything → MP3 320 (fast path: decodeAudioData + lamejs; headless Chromium has no AAC/H.264, so m4a/mp4/aiff
   go through ffmpeg.wasm, which is loaded lazily with its progress bar): every row Done, each download decodes
   (mutagen) with the right duration, and title/artist/cover survived (ID3v2.3 APIC).
3. WAV 24-bit · 48 kHz · mono · normalise · trim silence · fades: header + duration (silence cut) + peak ≈ −1 dBFS.
4. FLAC / OGG / M4A targets (ffmpeg encode): tags and cover (FLAC PICTURE, OGG metadata_block_picture, M4A covr),
   BPM & key from the analysis option into the tags.
5. ZIP of all results, cancel while running, options remembered across a reload, activity logged.
6. he + ar RTL, dark, 375 px: no horizontal scroll, LTR values; zero CSP violations, no page errors.
   Rows are conversion cards (`#cvBody .cvcard`, sizes in `.cvnum bdi`); the format is a segmented radio group `input[name=fmt]`.
Images tab: PNG → 500 px square JPG and WebP.
"""
import os, sys, io, re, json, time, struct, zipfile, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import lib
sys.path.insert(0, lib.FIX)
import gen_media

try:
    import mutagen
except ImportError:
    mutagen = None

FX = tempfile.mkdtemp(prefix='cr-media-')
FILES = gen_media.make(FX, seconds=4)
HAVE_FF = 't.mp3' in FILES

def rows(pg):
    return pg.evaluate("CONVERT._C.rows.map(r=>({name:r.name,status:r.status,err:r.err,out:r.out&&{name:r.out.name,size:r.out.size,fmt:r.out.fmt},dur:r.dur,sr:r.sr,ch:r.ch}))")

def wait_done(pg, timeout=150):
    lib.poll(pg, "!CONVERT._C.running&&CONVERT._C.rows.length&&CONVERT._C.rows.every(r=>['done','error','cancelled'].includes(r.status))", timeout)
    return rows(pg)

def set_opts(pg, **o):
    pg.evaluate("o=>{Object.assign(CONVERT._C.o,o);localStorage.setItem('chordroom.convert.v1',JSON.stringify(CONVERT._C.o));CONVERT.lang()}", o)

def download_row(pg, i):
    with pg.expect_download() as d:
        pg.click(f'#cvBody .cvcard:nth-child({i + 1}) [data-a="dl"]')
    p = d.value.path(); data = open(p, 'rb').read()
    return d.value.suggested_filename, data

def wav_info(data):
    assert data[:4] == b'RIFF' and data[8:12] == b'WAVE'
    p = 12; info = {}
    while p + 8 <= len(data):
        cid = data[p:p + 4]; n = struct.unpack('<I', data[p + 4:p + 8])[0]; a = p + 8
        if cid == b'fmt ':
            tag, nc, sr, _, blk, bits = struct.unpack('<HHIIHH', data[a:a + 16]); info.update(nc=nc, sr=sr, bits=bits, blk=blk)
        elif cid == b'data':
            info['frames'] = n // info['blk']; body = data[a:a + n]
            if info['bits'] == 24:
                pk = 0
                for i in range(0, len(body) - 2, 3 * info['nc']):
                    v = int.from_bytes(body[i:i + 3], 'little', signed=True); pk = max(pk, abs(v))
                info['peak'] = pk / 8388608
        elif cid == b'id3 ' or cid == b'ID3 ': info['id3'] = True
        elif cid == b'LIST': info['list'] = data[a:a + 4]
        p = a + n + (n & 1)
    return info

@lib.main
def test(t, srv, b):
    t.section('fixtures: ' + ', '.join(sorted(FILES)) + (' (no ffmpeg → WAV only)' if not HAVE_FF else ''))
    ctx, pg = lib.page(b, srv, t, mock=True, lang='en', init=lib.CSP_INIT)
    pg.goto(srv.url('#convert')); lib.wait_booted(pg)
    lib.poll(pg, "!document.querySelector('#gateView').hidden", 15)
    t.check('gate: #convert signed out shows the sign-in gate', not pg.evaluate("document.querySelector('#gateView').hidden") and pg.evaluate("document.querySelector('#convertView').hidden"))
    lib.sign_up(pg, 'oshri', 'o@x.com')
    lib.poll(pg, "!document.querySelector('#convertView').hidden&&document.querySelector('#cvDrop')", 15)
    t.check('signed in: converter view built, nav tab on', pg.evaluate("document.querySelector('#navConvert').classList.contains('on')&&!!document.querySelector('#cvOpts input[name=fmt]:checked')"))
    t.eq('nav label (en)', pg.evaluate("document.querySelector('#navConvert span').textContent"), 'Convert')
    t.check('empty state mentions on-device privacy', 'not sent anywhere' in pg.evaluate("document.querySelector('.cvpriv').textContent"))
    t.shot(pg, '01-empty-en')

    # ---------------------------------------------------------------- 2. everything → MP3
    t.section('all fixtures → MP3 320')
    names = [n for n in ['t.mp3', 't.wav', 't.flac', 't.ogg', 't.m4a', 't.mp4', 't.aiff'] if n in FILES]
    pg.set_input_files('#cvFile', [FILES[n] for n in names])
    t.eq('rows added', len(rows(pg)), len(names))
    set_opts(pg, fmt='mp3', q=320, sr=0, ch=0, norm=False, trim=False, fin=0, fout=0, tags=True, bk=False)
    pg.click('#cvActs [data-a="go"]')
    time.sleep(0.5); t.shot(pg, '02-converting')
    R = wait_done(pg)
    for r in R: t.check(f'{r["name"]} → mp3 done', r['status'] == 'done', r['err'] or r['out'])
    t.check('engine bar hidden after the run', pg.evaluate("document.querySelector('#cvEngine').hidden"))
    t.shot(pg, '03-mp3-done')
    if mutagen:
        for i, r in enumerate(R):
            if r['status'] != 'done': continue
            fn, data = download_row(pg, i)
            m = mutagen.File(io.BytesIO(data))
            ok = m is not None and abs(m.info.length - 4.0) < 0.2
            t.check(f'{r["name"]} → {fn}: decodes, 4 s, 44.1k stereo', ok and m.info.sample_rate == 44100 and m.info.channels == 2, (round(m.info.length, 2), m.info.sample_rate, m.info.channels) if m else 'unreadable')
            tags = m.tags or {}
            if r['name'] in ('t.mp3', 't.wav', 't.flac', 't.m4a', 't.mp4', 't.ogg', 't.aiff'):
                t.eq(f'{r["name"]}: title kept', str(tags.get('TIT2', '')), gen_media.TAGS['title'])
                t.eq(f'{r["name"]}: artist kept', str(tags.get('TPE1', '')), gen_media.TAGS['artist'])
            if r['name'] in ('t.mp3', 't.wav', 't.flac', 't.m4a'):
                pic = [k for k in tags.keys() if k.startswith('APIC')]
                t.check(f'{r["name"]}: cover kept (APIC jpeg)', pic and tags[pic[0]].mime == 'image/jpeg' and len(tags[pic[0]].data) > 1000, [(k, len(tags[k].data)) for k in pic])
            if r['name'] == 't.mp3':
                t.eq('t.mp3: BPM + key kept', (str(tags.get('TBPM', '')), str(tags.get('TKEY', ''))), ('128', 'Am'))
    t.page_errors('no page errors after the MP3 batch')

    # ---------------------------------------------------------------- 3. WAV 24/48/mono + processing
    t.section('WAV 24-bit 48 kHz mono, normalise, trim, fades')
    pg.click('#cvActs [data-a="clear"]')
    pg.set_input_files('#cvFile', [FILES['t.wav']])
    set_opts(pg, fmt='wav', q=24, sr=48000, ch=1, norm=True, trim=True, fin=0.5, fout=0.5, tags=True)
    t.eq('quality select shows 24-bit', pg.evaluate("document.querySelector('#cvOpts select[name=q]').value"), '24')
    pg.click('#cvActs [data-a="go"]'); R = wait_done(pg)
    t.check('wav row done', R[0]['status'] == 'done', R[0]['err'])
    fn, data = download_row(pg, 0); w = wav_info(data)
    t.eq('wav: 24-bit mono 48 kHz', (w.get('bits'), w.get('nc'), w.get('sr')), (24, 1, 48000))
    dur = w['frames'] / 48000
    t.check('wav: silence trimmed (≈3.4 s instead of 4 s)', 3.3 < dur < 3.6, round(dur, 3))
    t.check('wav: normalised to −14 LUFS (tone was ≈ −12.3 LUFS → peak 0.44 × 0.82 ≈ 0.36)', 0.3 < w.get('peak', 0) < 0.42, round(w.get('peak', 0), 3))
    t.check('wav: LIST INFO + id3 chunk written', w.get('list') == b'INFO' and w.get('id3'), w)
    if mutagen:
        m = mutagen.File(io.BytesIO(data))
        t.eq('wav: id3 title', str((m.tags or {}).get('TIT2', '')), gen_media.TAGS['title'])
        t.eq('wav: id3 artist', str((m.tags or {}).get('TPE1', '')), gen_media.TAGS['artist'])

    # ---------------------------------------------------------------- 4. FLAC / OGG / M4A targets + BPM & key
    if HAVE_FF and mutagen:
        t.section('FLAC / OGG / M4A (ffmpeg.wasm encode) with tags, cover, BPM & key')
        for fmt, q in (('flac', None), ('ogg', 128), ('m4a', 192)):
            pg.click('#cvActs [data-a="clear"]')
            pg.set_input_files('#cvFile', [FILES['t.mp3']])
            set_opts(pg, fmt=fmt, q=q or 320, sr=0, ch=0, norm=False, trim=False, fin=0, fout=0, tags=True, bk=(fmt == 'flac'))
            pg.click('#cvActs [data-a="go"]'); R = wait_done(pg)
            t.check(f'mp3 → {fmt} done', R[0]['status'] == 'done', R[0]['err'])
            if R[0]['status'] != 'done': continue
            fn, data = download_row(pg, 0); m = mutagen.File(io.BytesIO(data))
            t.check(f'{fmt}: decodes, 4 s', m is not None and abs(m.info.length - 4.05) < 0.25, round(m.info.length, 2) if m else None)
            t.eq(f'{fmt}: 44.1 kHz stereo', (m.info.sample_rate, m.info.channels), (44100, 2))
            if fmt == 'ogg': t.eq('ogg: Vorbis', type(m).__name__, 'OggVorbis')
            tg = m.tags
            if fmt == 'm4a':
                t.eq('m4a: title/artist', (tg.get('\xa9nam', [''])[0], tg.get('\xa9ART', [''])[0]), (gen_media.TAGS['title'], gen_media.TAGS['artist']))
                t.check('m4a: cover (covr jpeg)', tg.get('covr') and len(tg['covr'][0]) > 1000)
                t.eq('m4a: tmpo from the source TBPM', tg.get('tmpo', [None])[0], 128)
            else:
                t.eq(f'{fmt}: title/artist', (tg.get('title', [''])[0], tg.get('artist', [''])[0]), (gen_media.TAGS['title'], gen_media.TAGS['artist']))
                if fmt == 'flac':
                    t.check('flac: PICTURE block', m.pictures and m.pictures[0].mime == 'image/jpeg' and len(m.pictures[0].data) > 1000)
                    bpm, key = tg.get('bpm', [''])[0], tg.get('initialkey', [''])[0]
                    t.check('flac: BPM & key from the analysis option (not the source 128/Am)', bpm.isdigit() and 40 <= int(bpm) <= 220 and re.match(r'^[A-G][b#]?m?$', key), (bpm, key))
                else:
                    t.check('ogg: metadata_block_picture', 'metadata_block_picture' in tg and len(tg['metadata_block_picture'][0]) > 1000)
                    t.eq('ogg: bpm/initialkey from the source', (tg.get('bpm', [''])[0], tg.get('initialkey', [''])[0]), ('128', 'Am'))
        t.shot(pg, '04-ffmpeg-done')
        t.page_errors('no page errors after the ffmpeg batches')

    # ---------------------------------------------------------------- 5. ZIP, cancel, persistence, activity
    t.section('ZIP, cancel, remembered options, activity log')
    pg.click('#cvActs [data-a="clear"]')
    pg.set_input_files('#cvFile', [FILES['t.wav'], FILES['t.wav'], FILES['t.wav']])
    set_opts(pg, fmt='mp3', q=128, sr=0, ch=0, norm=False, trim=False, fin=0, fout=0, tags=False, bk=False)
    pg.click('#cvActs [data-a="go"]'); R = wait_done(pg)
    t.eq('3 copies → unique output names', sorted(r['out']['name'] for r in R), ['t (2).mp3', 't (3).mp3', 't.mp3'])
    with pg.expect_download() as d: pg.click('#cvActs [data-a="zip"]')
    z = zipfile.ZipFile(d.value.path())
    t.eq('ZIP holds the 3 results', sorted(z.namelist()), ['t (2).mp3', 't (3).mp3', 't.mp3'])
    t.check('ZIP entries are real MP3s', all(z.read(n)[:3] == b'ID3' or z.read(n)[0] == 0xFF for n in z.namelist()))
    # cancel: queue many slow (analysed) rows and abort
    pg.click('#cvActs [data-a="clear"]')
    pg.set_input_files('#cvFile', [FILES['t.wav']] * 6)
    set_opts(pg, bk=True)
    pg.click('#cvActs [data-a="go"]')
    lib.poll(pg, "CONVERT._C.rows.some(r=>r.status==='done')", 60)
    pg.click('#cvActs [data-a="cancel"]')
    lib.poll(pg, "!CONVERT._C.running", 30); R = rows(pg)
    st = [r['status'] for r in R]
    t.check('cancel: nothing left running, later rows cancelled', 'cancelled' in st and all(s in ('done', 'cancelled') for s in st), st)
    t.check('cancel: convert button back, cancel gone', pg.evaluate("!document.querySelector('#cvActs [data-a=cancel]')&&!document.querySelector('#cvActs [data-a=go]').disabled"))
    acts = pg.evaluate("(window.__log||[]).map(a=>a.action+' '+(a.detail||''))")
    t.check('activity logged: convert "<n> files → <fmt>"', any(re.match(r'convert \d+ files → (mp3|wav|flac|ogg|m4a)', a) for a in acts), [a for a in acts if a.startswith('convert')][:3])
    # persistence
    set_opts(pg, fmt='flac', bk=False, norm=True)
    lib.reload(pg)
    if not pg.evaluate("!!(window.Backend&&Backend.user)"): lib.sign_in(pg)
    lib.poll(pg, "!document.querySelector('#convertView').hidden&&document.querySelector('#cvOpts input[name=fmt]:checked')", 20)
    t.eq('options remembered after reload (flac + normalise)', pg.evaluate("[document.querySelector('#cvOpts input[name=fmt]:checked').value,document.querySelector('#cvOpts input[name=norm]').checked]"), ['flac', True])
    t.check('zero CSP violations', lib.csp_violations(pg) == [], lib.csp_violations(pg))
    ctx.close()

    # ---------------------------------------------------------------- images
    t.section('Images tab')
    ctx, pg = lib.page(b, srv, t, mock=True, lang='en')
    pg.goto(srv.url('#convert')); lib.wait_booted(pg); lib.sign_in(pg)
    lib.poll(pg, "!document.querySelector('#convertView').hidden&&document.querySelector('#cvTabs')", 15)
    pg.click('#cvTabs [data-tab="images"]')
    pg.set_input_files('#cvIFile', [FILES['cover.png']])
    pg.evaluate("Object.assign(CONVERT._C.o,{isize:500,ifmt:'jpg'});CONVERT.lang()")
    pg.click('#cvIActs [data-a="go"]'); lib.poll(pg, "CONVERT._C.irows[0]&&CONVERT._C.irows[0].status==='done'", 20)
    with pg.expect_download() as d: pg.click('#cvIBody [data-a="dl"]')
    data = open(d.value.path(), 'rb').read()
    t.check('png → 500 px jpg (SOF marks 500×500)', d.value.suggested_filename == 'cover-500.jpg' and data[:2] == b'\xff\xd8' and b'\x01\xf4\x01\xf4' in data, (d.value.suggested_filename, len(data)))
    pg.evaluate("Object.assign(CONVERT._C.o,{isize:0,ifmt:'webp'});CONVERT.lang()")
    pg.click('#cvIActs [data-a="go"]'); lib.poll(pg, "CONVERT._C.irows[0].out&&CONVERT._C.irows[0].out.name.endsWith('.webp')", 20)
    with pg.expect_download() as d: pg.click('#cvIBody [data-a="dl"]')
    data = open(d.value.path(), 'rb').read()
    t.check('png → webp original size', data[:4] == b'RIFF' and data[8:12] == b'WEBP' and d.value.suggested_filename == 'cover.webp', d.value.suggested_filename)
    t.shot(pg, '05-images')
    ctx.close()

    # ---------------------------------------------------------------- 6. he / ar RTL, dark, 375 px
    t.section('he + ar RTL, dark, 375 px')
    for lang, theme, w in (('he', 'light', 1300), ('ar', 'dark', 375), ('he', 'dark', 375), ('ru', 'light', 375), ('es', 'dark', 1300)):
        ctx, pg = lib.page(b, srv, t, mock=True, lang=lang, theme=theme, w=w, h=900, mobile=w < 500, init=lib.CSP_INIT)
        pg.goto(srv.url('#convert')); lib.wait_booted(pg); lib.sign_in(pg)
        lib.poll(pg, "!document.querySelector('#convertView').hidden&&document.querySelector('#cvDrop')", 15)
        pg.set_input_files('#cvFile', [FILES['t.wav'], FILES.get('t.mp3', FILES['t.wav'])])
        set_opts(pg, fmt='wav', q=16, sr=0, ch=0, norm=False, trim=False, fin=0, fout=0, tags=True, bk=False)
        pg.click('#cvActs [data-a="go"]'); wait_done(pg)
        dirv = pg.evaluate("document.documentElement.dir")
        t.eq(f'{lang}: document dir', dirv, 'rtl' if lang in ('he', 'ar') else 'ltr')
        t.check(f'{lang}: nav label translated', pg.evaluate("document.querySelector('#navConvert span').textContent") in ('המרה', 'تحويل', 'Конвертер', 'Convertir'), pg.evaluate("document.querySelector('#navConvert span').textContent"))
        t.check(f'{lang}: title translated', pg.evaluate("document.querySelector('#convertView h1').textContent") not in ('', 'cvTitle'))
        t.eq(f'{lang} {w}px: no horizontal scroll', lib.scroll_width(pg), w)
        if lang in ('he', 'ar'):
            t.check(f'{lang}: size/duration cells are LTR', pg.evaluate("[...document.querySelectorAll('#cvBody .cvnum bdi')].every(b=>getComputedStyle(b).direction==='ltr')"))
        if theme == 'dark': t.check(f'{lang}: dark background really dark', lib.page_luma(pg, '.cvopts') < 80, lib.page_luma(pg, '.cvopts'))
        t.check(f'{lang}: zero CSP violations', lib.csp_violations(pg) == [], lib.csp_violations(pg))
        t.shot(pg, f'06-{lang}-{theme}-{w}', full_page=True)
        ctx.close()
