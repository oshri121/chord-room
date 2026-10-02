"""XSS + CSP: every field another user / an admin / a third party can write holds an XSS payload (mock/evil.js,
plus poisoned Crate rows in localStorage). The main flows run under the real _headers CSP: home, pricing + contact
toast, tool (demo, Signalsmith tempo change, MP3 export), AI separation start (model + worker under /ai/*), Discover
(proxy, catalog merge, preview), DJ (demo deck), Crate (restored rows + analysis), account box + admin panel (all tabs).
Asserts: no payload executed, no injected on*/javascript: markup, no request to the attacker host, zero CSP
violations (= the CSP doesn't break the site), no step errors, and each flow actually worked.
Also (fixtures/gen_evil.py): hostile Deezer chart JSON (payload titles/artists, javascript: covers/links, previews on an
attacker host, non-numeric ids); uploaded files whose NAMES are payloads / formula injection / CR-LF / Windows device
names / dots / bidi overrides and an MP3 whose ID3 tags (title, artist, album, comment, TXXX, SVG "cover") are payloads,
through the tool + My Songs, Crate (CSV formula cells quoted, renamed-copies + USB ZIP entry names safe, M3U8 one line
per field), Converter (tags shown escaped, ZIP names), Mashup, DJ, Extended; a payload in the hash (unknown view toast)
and in ?ref=; the legal pages with a javascript: contact; poisoned settings in localStorage (Mashup, Extended, Converter,
voice range, transliteration, Deezer artist cache, accessibility, pay-job journal, player volume/position)."""
import os, re, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib, io, zipfile
sys.path.insert(0, lib.FIX)
import gen_evil
# ZIP entry names: control chars, bidi overrides
CTRL = re.compile('[%s-%s%s%s-%s%s-%s]' % (chr(0), chr(31), chr(127), chr(0x202a), chr(0x202e), chr(0x2066), chr(0x2069)))

INIT = r"""
window.__viol=[];window.__inj=[];window.__fired=window.__fired||[];
document.addEventListener('securitypolicyviolation',e=>window.__viol.push({d:e.effectiveDirective,u:String(e.blockedURI).slice(0,80),s:(e.sample||'').slice(0,60)}),true);
new MutationObserver(ms=>{for(const m of ms){const ns=m.type==='attributes'?[m.target]:[...m.addedNodes];for(const n of ns){if(n.nodeType!==1)continue;
  for(const el of [n,...n.querySelectorAll('*')])for(const a of el.attributes)if(/^on/i.test(a.name)||(/^\s*javascript:/i.test(a.value)&&!(el.tagName==='INPUT'&&a.name==='value')))window.__inj.push(el.tagName+' '+a.name+'='+a.value.slice(0,50))}}})
  .observe(document,{subtree:true,childList:true,attributes:true});
try{if(!localStorage.getItem('__seeded')){localStorage.setItem('__seeded','1');localStorage.setItem('chordroom.crate.v1:guest',JSON.stringify({v:1,folder:'',sort:null,sel:null,rows:[
  {id:'x"><img src=x onerror="__xss(\'crate.id\')">',name:'Evil - Row.mp3',rel:'Evil - Row.mp3',size:1,ext:'mp3',dur:100,lufs:-9,peak:-1,bpm:120,bpm0:120,offset:0,down:0,key:{pc:9,mode:1},flux:3},
  {id:'r2',name:'Row2.mp3',bpm:124,dur:'<img src=x onerror="__xss(\'crate.dur\')">',lufs:'1"><img src=x onerror="__xss(\'crate.lufs\')">',key:{pc:0,mode:0}}]}));
  const X=t=>'x"><img src=x onerror="__xss(\''+t+'\')">';
  for(const u of ['guest','uo']){
    localStorage.setItem('chordroom.mashup.v1:'+u,JSON.stringify({v:1,tempo:X('mx.tempo'),custom:X('mx.custom'),fadeIn:X('mx.fi'),startA:X('mx.start'),fmt:X('mx.fmt'),loopBars:X('mx.loop'),vol:[X('mx.v'),2]}));
    localStorage.setItem('chordroom.extended.v1:'+u,JSON.stringify({v:1,preset:X('ex.preset'),add:X('ex.add'),custom:X('ex.custom'),intro:X('ex.intro'),is:X('ex.is'),fmt:X('ex.fmt'),sr:X('ex.sr')}));
    localStorage.setItem('chordroom.voice.v1:'+u,JSON.stringify({lo:40,hi:70,type:X('voice.type'),name:X('voice.name')}))}
  localStorage.setItem('chordroom.convert.v1',JSON.stringify({fmt:'mp3',q:X('cv.q'),sr:X('cv.sr'),ch:X('cv.ch'),fin:X('cv.fin'),fout:X('cv.fout'),isize:X('cv.isize'),ifmt:X('cv.ifmt')}));
  localStorage.setItem('chordroom.translit.v1',JSON.stringify({w:{'שלום':X('tr.w')},s:{x:X('tr.s')},a:{y:X('tr.a')}}));
  localStorage.setItem('chordroom.dzartist.v1',JSON.stringify({'artist 0':X('dza'),x:{name:X('dza2')}}));
  localStorage.setItem('chordroom.a11y',JSON.stringify({size:X('a11y.size'),cb:X('a11y.cb'),mono:X('a11y.mono')}));
  localStorage.setItem('chordroom.payjobs.v1',JSON.stringify([{id:X('job.id'),uid:'uo',kind:X('job.kind'),qty:X('job.qty'),done:0,t:Date.now()}]));
  localStorage.setItem('chordroom.dvol',X('dvol'));localStorage.setItem('chordroom.lastpos',X('lastpos'));
}}catch(e){}
"""

@lib.main
def test(t, srv, b):
    evil = []
    P, Q = gen_evil.P, gen_evil.Q
    srv.tracks = [{'id': Q('dz.id'), 'title': P('dz.title'), 'title_short': P('dz.title_short'), 'duration': 30, 'readable': True,
                   'link': "javascript:__xss('dz.link')", 'preview': 'https://evil.example/p0.mp3',
                   'artist': {'id': 1, 'name': Q('dz.artist')}, 'album': {'id': 2, 'title': P('dz.album'), 'cover_medium': "javascript:__xss('dz.cover')", 'release_date': '2026-09-01'}},
                  {'id': 4242, 'title': {'x': 1}, 'duration': 30, 'readable': True, 'link': 'https://evil.example/', 'preview': 'https://cdnt-preview.dzcdn.net/api/1/1/p1.mp3?hdnea=exp=9999999999',
                   'artist': {'id': 3, 'name': 42}, 'album': {'id': 3, 'title': None, 'cover_medium': 'https://evil.example/c.jpg'}}] + lib.dz_tracks(4)
    evil_mp3 = {'name': 'evil-tags.mp3', 'mimeType': 'audio/mpeg', 'buffer': open(gen_evil.tagged_mp3(), 'rb').read()}
    ctx = lib.context(b, srv, mock=lib.read_mock('evil.js'), init=INIT)
    ctx.route(re.compile(r'^https://evil\.example/.*'), lambda r: (evil.append(r.request.url), r.abort()))
    pg = ctx.new_page(); lib.watch(pg, t.errs)
    cons = []
    pg.on('console', lambda m: cons.append(m.text[:200]) if (m.type in ('error', 'warning') and re.search(r'Content Security|Refused|CSP', m.text)) else None)
    pg.on('dialog', lambda d: d.dismiss())
    acc = {'fired': set(), 'inj': set(), 'viol': []}; out = {}; step_errs = []
    def snap(step):
        s = pg.evaluate("({fired:[...new Set(window.__fired||[])],inj:[...new Set(window.__inj||[])],viol:window.__viol||[]})")
        acc['fired'] |= set(s['fired']); acc['inj'] |= set(s['inj'])
        for v in s['viol']:
            v['step'] = step
            if v not in acc['viol']: acc['viol'].append(v)
    def safe(step, fn):
        t0 = time.time()
        try: fn()
        except Exception as e: step_errs.append(f'[{step}] {type(e).__name__}: {str(e)[:160]}')
        snap(step); print(f'  step {step:<10} {time.time() - t0:5.1f}s', flush=True)
    J = lambda sel: pg.evaluate("s=>{const e=document.querySelector(s);if(e)e.click();return !!e}", sel)

    safe('home', lambda: (pg.goto(srv.url()), lib.wait_booted(pg), time.sleep(1.5)))
    safe('pricing', lambda: (pg.evaluate("location.hash='#pricing'"), time.sleep(1.2)))
    def contact():
        lib.sign_in(pg, 'owner@example.com', 'password1')
        pg.evaluate("location.hash='#pricing'"); time.sleep(1)
        btn = pg.query_selector('[data-sub="pro"]')
        if btn: btn.evaluate('e=>e.click()'); time.sleep(0.6)
        out['toast'] = pg.evaluate("(document.querySelector('#toast')||{}).textContent||''")[:80]
        a = pg.query_selector('#toast button')
        if a: a.evaluate('e=>e.click()'); time.sleep(0.6)
        # plans without a checkout link render "coming soon" / "contact us": a javascript: contact must never become a link
        out['soon'] = pg.evaluate("(()=>{const a=[...document.querySelectorAll('#pricingView .pg-soon')];return {n:a.length,hrefs:a.map(x=>x.getAttribute('href')||''),disabled:a.filter(x=>x.disabled).length}})()")
    safe('contact', contact)
    def tool():
        pg.evaluate("location.hash='#tool'"); lib.wait_tool_song(pg)
        pg.click('#tmP'); lib.poll(pg, "!!window.SignalsmithStretch", 20)
        out['signalsmith'] = pg.evaluate("!!window.SignalsmithStretch")
        pg.click('[data-fmt="mp3"]'); time.sleep(0.3)
        with pg.expect_download(timeout=90000) as dl: pg.click('#dlBtn')
        out['mp3'] = dl.value.suggested_filename
    safe('tool', tool)
    def ai():
        out['ai'] = []
        if not pg.is_enabled('#aiBtn'): return
        pg.evaluate("document.querySelector('#aiBtn').click()")
        for _ in range(60):
            time.sleep(1); m = pg.evaluate("document.querySelector('#smsg').textContent")
            if not out['ai'] or out['ai'][-1] != m: out['ai'].append(m)
            if len(out['ai']) >= 3 and re.search(r'\d\s*%', m) and not re.search(r'מוריד|Download', m): break
        pg.evaluate("document.querySelector('#cancelBtn').click()"); time.sleep(1)
    safe('ai', ai)
    def disc():
        pg.evaluate("location.hash='#discover'"); pg.wait_for_selector('.drow', timeout=20000); time.sleep(3)
        pg.eval_on_selector('.drow:nth-child(2) .pv', 'e=>e.click()'); time.sleep(2)
        mx = pg.query_selector('.drow .mx:not([disabled])')
        if mx: mx.evaluate('e=>e.click()'); time.sleep(1); pg.evaluate("document.querySelector('#mixClose').click()")
        out['disc_rows0'] = pg.eval_on_selector_all('.drow', 'e=>e.length')
        out['disc_txt'] = pg.eval_on_selector_all('.drow', 'e=>e.map(x=>x.textContent.slice(0,50))')
        tabs = pg.query_selector_all('#dTabs button')
        if len(tabs) > 2: tabs[2].evaluate('e=>e.click()'); time.sleep(2)
        out['disc_rows'] = pg.eval_on_selector_all('.drow', 'e=>e.length')
        out['covers'] = pg.eval_on_selector_all('.drow img.dc', 'e=>[...new Set(e.map(x=>x.getAttribute("src").slice(0,40)))]')
    safe('discover', disc)
    def dj():
        pg.evaluate("location.hash='#dj'"); time.sleep(1.5)
        pg.click('[data-act="load"] >> nth=0'); time.sleep(0.4)
        d = pg.query_selector('[data-m="demo"]')
        if d: d.click()
        lib.poll(pg, "/BPM/.test((document.querySelector('.dkt')||{}).textContent||'')", 30)
        out['dj_track'] = pg.evaluate("(document.querySelector('.dkt')||{}).textContent||''")[:40]
    safe('dj', dj)
    def crate():
        pg.evaluate("location.hash='#crate'"); time.sleep(1.5)
        pg.set_input_files('#crIn', lib.fixture('p0.mp3'))
        lib.poll(pg, "[...document.querySelectorAll('#crBody tr')].some(t=>/st-ok/.test(t.className)&&!/Evil|Row2/.test(t.textContent))", 120); time.sleep(1)
        out['crate_rows'] = pg.evaluate("CRATE._C.rows.length")
    safe('crate', crate)

    def dl_bytes(click):
        with pg.expect_download(timeout=90000) as d: click()
        return d.value.suggested_filename, open(d.value.path(), 'rb').read()
    def zip_names_bad(names):
        return [n for n in names if n.startswith(('/', '\\')) or CTRL.search(n) or re.search(r'[<>:"|?*\\]', n)
                or re.search(r'(^|/)\.\.?(/|$)|^[A-Za-z]:|(^|/)(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)', n, re.I)]
    def crate_evil():
        pg.evaluate("location.hash='#crate'"); time.sleep(0.8)
        n0 = pg.evaluate("CRATE._C.rows.length")
        pg.set_input_files('#crIn', gen_evil.files(('formula', 'device', 'crlf', 'dots', 'bidi', 'xss')) + [evil_mp3])
        lib.poll(pg, "n=>CRATE._C.rows.filter(r=>r.st==='ok').length>=n", 240, arg=n0 + 7); time.sleep(0.5)
        out['csv'] = dl_bytes(lambda: pg.click('#crCsv'))[1].decode('utf-8-sig')
        zf = zipfile.ZipFile(io.BytesIO(dl_bytes(lambda: pg.click('#crZip'))[1]))
        out['zip_names'] = zf.namelist(); out['zip_m3u'] = zf.read('Chord Room.m3u8').decode('utf-8')
        time.sleep(0.5)
        zf = zipfile.ZipFile(io.BytesIO(dl_bytes(lambda: pg.click('#crUsb'))[1]))
        out['usb_names'] = zf.namelist(); out['usb_m3u'] = zf.read('Chord Room.m3u8').decode('utf-8')
        out['m3u'] = dl_bytes(lambda: pg.click('#crM3u'))[1].decode('utf-8')
        out['crate_n'] = pg.evaluate("CRATE._C.rows.length") - n0
    safe('crate evil', crate_evil)
    def tool_evil():
        pg.evaluate("location.hash='#tool'"); time.sleep(0.5)
        pg.set_input_files('#file', gen_evil.files(('xss',)))
        lib.poll(pg, "document.querySelector('#busy').hidden&&document.querySelector('#tname').textContent.includes('onerror')", 90)
        pg.evaluate("document.querySelector('#libBtn').click()"); time.sleep(1)
        out['lib_names'] = pg.evaluate("[...document.querySelectorAll('#libList li')].map(l=>l.textContent.slice(0,60))")
        pg.evaluate("document.querySelector('#libClose').click()")
        out['tool_zip'] = dl_bytes(lambda: pg.click('#dlBtn'))[0]
        # poisoned voice range + accessibility settings: open both panels
        pg.evaluate("document.querySelector('#vcOpen')&&document.querySelector('#vcOpen').click()"); time.sleep(1.2)
        out['voice_open'] = pg.evaluate("!![...document.querySelectorAll('[class*=vc-]')].find(e=>e.offsetParent)")
        pg.keyboard.press('Escape'); time.sleep(0.4)
        pg.evaluate("document.querySelector('.a11y-fab')&&document.querySelector('.a11y-fab').click()"); time.sleep(0.8)
        pg.keyboard.press('Escape'); time.sleep(0.3)
    safe('tool evil', tool_evil)
    def convert_evil():
        pg.evaluate("location.hash='#convert'"); time.sleep(1)
        pg.evaluate("o=>{Object.assign(CONVERT._C.o,o);CONVERT.lang()}", {'fmt': 'wav', 'q': 16, 'sr': 0, 'ch': 0, 'norm': False, 'trim': False, 'fin': 0, 'fout': 0, 'tags': True, 'bk': False})
        pg.set_input_files('#cvFile', [evil_mp3] + gen_evil.files(('xss', 'device', 'bidi')))
        lib.poll(pg, "CONVERT._C.rows.length===4", 20); time.sleep(0.5)
        pg.evaluate("document.querySelector('#cvActs [data-a=go]').click()")
        lib.poll(pg, "CONVERT._C.rows.every(r=>r.status==='done'||r.status==='error')", 240); time.sleep(0.5)
        out['cv_tags'] = pg.evaluate("[...document.querySelectorAll('#cvBody .cvnm small')].map(x=>x.textContent.slice(0,60))")
        out['cv_zip'] = zipfile.ZipFile(io.BytesIO(dl_bytes(lambda: pg.click('#cvActs [data-a=zip]'))[1])).namelist()
    safe('convert evil', convert_evil)
    def mashup_evil():
        pg.evaluate("location.hash='#mashup'"); time.sleep(1)
        with pg.expect_file_chooser() as fc: pg.evaluate("document.querySelector('.mxslot [data-a=file]').click()")
        fc.value.set_files(gen_evil.files(('xss',)))
        lib.poll(pg, "/onerror/.test(document.querySelector('#mashupView').textContent)", 60); time.sleep(1)
    safe('mashup evil', mashup_evil)
    def dj_evil():
        pg.evaluate("location.hash='#dj'"); time.sleep(1)
        pg.evaluate("document.querySelectorAll('[data-act=load]')[1].click()"); time.sleep(0.3)
        with pg.expect_file_chooser() as fc: pg.evaluate("document.querySelector('[data-m=upload]').click()")
        fc.value.set_files(gen_evil.files(('xss',)))
        lib.poll(pg, "[...document.querySelectorAll('.dkt')].some(x=>/onerror/.test(x.textContent))", 60)
    safe('dj evil', dj_evil)
    def ext_evil():
        pg.evaluate("location.hash='#extended'"); time.sleep(1)
        with pg.expect_file_chooser() as fc: pg.evaluate("document.querySelector('#extendedView [data-a=file]').click()")
        fc.value.set_files(gen_evil.files(('xss',)))
        lib.poll(pg, "(()=>{const m=document.querySelector('#exMsg');return m&&m.textContent.trim().length>0||/onerror/.test(document.querySelector('#extendedView').textContent)})()", 90)
    safe('extended evil', ext_evil)
    def legal():
        pg.evaluate("location.hash='#terms'"); time.sleep(1); pg.evaluate("location.hash='#privacy'"); time.sleep(1)
        out['legal_js_links'] = pg.evaluate("[...document.querySelectorAll('#legalView a')].map(a=>a.getAttribute('href')||'').filter(h=>!/^(#|https:|mailto:)/.test(h))")
    safe('legal', legal)
    def admin():
        pg.evaluate("location.hash='#tool'"); time.sleep(0.5)
        J('#accBtn'); time.sleep(0.8)
        pg.evaluate("(()=>{const d=document.querySelector('#ptsBox details');if(d)d.open=true})()"); time.sleep(0.8)
        pg.evaluate("document.querySelector('#acc').hidden=true")
        J('#adminBtn'); time.sleep(1.5)
        J('#uBody tr:nth-child(2) .acts .btn.solid'); time.sleep(1.2)
        pg.evaluate("(()=>{const d=document.querySelector('#udCred details');if(d)d.open=true})()"); time.sleep(0.8)
        out['admin_users'] = pg.eval_on_selector_all('#uBody tr', 'e=>e.length')
        out['avatars'] = pg.eval_on_selector_all('#uBody img, #udImg', 'e=>e.map(x=>(x.getAttribute("src")||"").slice(0,30))')
        for v in ['users', 'songs', 'activity', 'settings', 'roles']:
            J(f'#admTabs button[data-v="{v}"]'); time.sleep(1)
        J('#adminClose')
    safe('admin', admin)
    def hash_ref():
        pg.evaluate("location.hash='#<img src=x onerror=__xss(\"hash\")>'"); time.sleep(1.2)
        out['hash_toast'] = pg.evaluate("(document.querySelector('#toast')||{}).textContent||''")[:80]
        pg.goto(srv.url('?ref=%3Cimg%20src%3Dx%20onerror%3D__xss(1)%3E#pricing')); lib.wait_booted(pg); time.sleep(1)
        out['ref_ls'] = pg.evaluate("localStorage.getItem('chordroom.ref')")
        out['ref_url'] = pg.evaluate("location.search")
    safe('hash + ref', hash_ref)
    safe('home again', lambda: (pg.evaluate("location.hash=''"), pg.goto(srv.url()), time.sleep(2)))

    t.section('results')
    t.eq('no step errors', step_errs, [])
    t.eq('no XSS payload executed', sorted(acc['fired']), [])
    t.eq('no injected on*/javascript: markup', sorted(acc['inj']), [])
    t.eq('no request to the attacker host', sorted(set(u[:60] for u in evil)), [])
    t.eq('zero CSP violations', acc['viol'], [])
    t.eq('no CSP console messages', sorted(set(cons)), [])
    so = out.get('soon') or {}
    t.check('pricing: javascript: contact → disabled "coming soon" buttons, no link, no live CTA', so.get('n', 0) >= 1 and so.get('disabled') == so.get('n') and not any(h for h in so.get('hrefs', [])), so)
    t.check('tool: Signalsmith Stretch loaded under CSP', out.get('signalsmith'))
    t.check('tool: MP3 export downloaded (worker + lamejs)', (out.get('mp3') or '').endswith(('.mp3', '.zip')), out.get('mp3'))
    t.check('AI: model loaded and separation started (worker under /ai/*)', len(out.get('ai', [])) >= 2, out.get('ai', [])[-3:])
    t.check('discover: rows rendered', (out.get('disc_rows') or 0) > 0, out.get('disc_rows'))
    t.check('discover: covers only from dzcdn / own assets', all(c.startswith(('https://cdn-images.dzcdn.net/', 'assets/')) for c in out.get('covers', [])), out.get('covers'))
    t.check('dj: demo loaded in deck A', 'BPM' in out.get('dj_track', ''), out.get('dj_track'))
    t.check('crate: poisoned rows restored + one analysed', (out.get('crate_rows') or 0) >= 3, out.get('crate_rows'))
    t.eq('admin: 3 users listed', out.get('admin_users'), 3)
    t.section('hostile files, Deezer data, hash/query')
    t.check('discover: hostile Deezer tracks listed as text (6 chart rows incl. 2 hostile)', (out.get('disc_rows0') or 0) >= 6 and any('onerror' in x for x in out.get('disc_txt', [])), out.get('disc_txt'))
    csv = out.get('csv', '')
    cells = re.findall(r'"((?:[^"]|"")*)"', csv)
    t.check("crate CSV: no cell starts with = + @ or a non-numeric - (formula injection quoted with ')", csv and not any(re.match(r'[=+@\t\r]|-(?!\d+(\.\d+)?$)', c) for c in cells), [c[:40] for c in cells if re.match(r'[=+@-]', c)][:4])
    t.check('crate CSV: the formula name is kept as text', "'=HYPERLINK" in csv, csv[:200])
    for k in ('zip_names', 'usb_names', 'cv_zip'):
        t.eq(f'{k}: entry names safe (no traversal / device / control / bidi / reserved chars)', zip_names_bad(out.get(k) or ['<missing>']), [])
    t.check('crate ZIP: CON.mp3 kept under a safe name', any('CON' in n for n in out.get('zip_names', [])), out.get('zip_names'))
    for k in ('zip_m3u', 'usb_m3u', 'm3u'):
        L = [l for l in (out.get(k) or '').split('\n') if l]
        paths = [l for l in L if not l.startswith('#')]
        t.check(f'{k}: one #EXTINF + one path per track, no injected lines', L and sum(l.startswith('#EXTINF') for l in L) == len(paths) and not any(l.startswith('http') for l in paths), L[:8])
    for k, z in (('zip_m3u', 'zip_names'), ('usb_m3u', 'usb_names')):
        paths = [l for l in (out.get(k) or '').split('\n') if l and not l.startswith('#')]
        t.check(f'{k}: every playlist path is an entry of the ZIP', paths and all(x in (out.get(z) or []) for x in paths), [x for x in paths if x not in (out.get(z) or [])][:4])
    t.eq('crate: 7 hostile files analysed', out.get('crate_n'), 7)
    t.check('tool: hostile file name loaded + in My songs as text', any('onerror' in x for x in out.get('lib_names', [])), out.get('lib_names'))
    t.check('tool: export ZIP name safe', out.get('tool_zip') and not re.search(r'[<>:"/\\|?*]', out['tool_zip']), out.get('tool_zip'))
    t.check('voice dialog opened with poisoned stored range', out.get('voice_open'))
    t.check('converter: hostile ID3 tags shown as text', any('onerror' in x for x in out.get('cv_tags', [])), out.get('cv_tags'))
    t.eq('legal pages: only #/https:/mailto: links (javascript: contact dropped)', out.get('legal_js_links'), [])
    t.check('hash payload → "not found" toast, nothing executed', bool(out.get('hash_toast')), out.get('hash_toast'))
    t.eq('?ref=<payload> not stored and removed from the URL', [out.get('ref_ls'), out.get('ref_url')], [None, ''])
    t.check('admin: unsafe avatar URLs replaced', out.get('avatars') and all(a.startswith('data:') for a in out['avatars']), out.get('avatars'))
