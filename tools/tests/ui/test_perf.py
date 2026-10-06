"""Performance budgets (PERF.md), on the CSP-served local server with the mock backend:
  * home ships only what home needs: request count + JS / CSS (gzip estimate) + font KB under budget, no view-module JS
    (DJ, Crate, Mashup, Converter, Extended, "My key", MP3, cues, transliteration, legal text) requested, no Arabic or
    Cyrillic font file on a Hebrew page, nothing from Google Fonts (self-hosted)
  * no main-thread task > 200 ms while home loads — measured as CPU time from a Chrome trace: the wall-clock
    PerformanceObserver numbers are printed too, but on a shared CI box they mostly measure the other processes
  * CLS < 0.05 on home and pricing
  * idle home: after a few quiet seconds no requestAnimationFrame callbacks, the background canvas loop stopped,
    <html data-idle>, no running CSS animation; input wakes it again
  * every deep link (#tool #dj #crate #mashup #convert #extended #terms #licenses #accessibility) works from a cold load and loads its module once,
    also after leaving and coming back, and no other view module
  * assets/og.png ≤ 150 KB at 1200×630
Budgets = the measured numbers after the perf pass + ~15 %. Run with CR_PERF_REPORT=1 to print the measurements only."""
import os, re, sys, gzip, json, time, struct, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

BUDGET = {'home_requests': 32, 'home_js_gz_kb': 355, 'home_css_gz_kb': 54, 'home_font_kb': 132, 'task_cpu_ms': 200, 'cls': 0.05}   # measured 28 · 309 · 47 · 115 · 64 ms · 0
MODULE_JS = ['dj.js', 'crate.js', 'mashup.js', 'convert.js', 'extended.js', 'voice.js', 'mp3.js', 'cues.js', 'heblat.js', 'legal.js', 'acct.js', 'info.js']   # merge: + accounts v4, licenses/accessibility pages
DEEP = [('#tool', 'tool', '#toolView', 'VOICE', 'voice.js'), ('#dj', 'dj', '#djView', 'DJ', 'dj.js'), ('#crate', 'crate', '#crateView', 'CRATE', 'crate.js'),
        ('#mashup', 'mashup', '#mashupView', 'MASHUP', 'mashup.js'), ('#convert', 'convert', '#convertView', 'CONVERT', 'convert.js'),
        ('#extended', 'extended', '#extendedView', 'EXTENDED', 'extended.js'), ('#terms', 'legal', '#legalView', 'LEGAL', 'legal.js'),
        ('#licenses', 'info', '#infoView', 'INFO', 'info.js'), ('#accessibility', 'info', '#infoView', 'INFO', 'info.js')]
ALLOWED = {'tool': {'voice.js', 'mp3.js'}, 'dj': {'dj.js'}, 'crate': {'heblat.js', 'cues.js', 'crate.js', 'mp3.js'}, 'mashup': {'cues.js', 'mp3.js', 'mashup.js'},
           'convert': {'mp3.js', 'convert.js'}, 'extended': {'heblat.js', 'cues.js', 'crate.js', 'mp3.js', 'extended.js'}, 'legal': {'legal.js'},
           'info': {'legal.js', 'info.js'}}   # info = the licenses / accessibility pages (their tabs name the legal documents)
REPORT = os.environ.get('CR_PERF_REPORT') == '1'

# long tasks + layout shifts + rAF callbacks, recorded from the first byte
INIT = r"""window.__lt=[];window.__cls=0;window.__raf=0;
try{new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__lt.push(Math.round(e.duration)))).observe({type:'longtask',buffered:true})}catch(e){}
try{new PerformanceObserver(l=>l.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__cls+=e.value})).observe({type:'layout-shift',buffered:true})}catch(e){}
(()=>{const r=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>r(t=>{window.__raf++;f(t)})})();"""
TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline']

def fname(u): return urllib.parse.urlparse(u).path.rsplit('/', 1)[-1]
def local_path(u): return os.path.join(lib.REPO, urllib.parse.urlparse(u).path.lstrip('/'))
def gz_kb(urls):
    tot = 0
    for u in sorted(set(urls)):                                          # bg.js is requested twice (the page + its worker)
        fp = local_path(u)
        if os.path.isfile(fp): tot += len(gzip.compress(open(fp, 'rb').read(), 6))
    return round(tot / 1024, 1)

def recorder(pg):
    reqs = []
    pg.on('request', lambda r: reqs.append((r.resource_type, r.url)))
    return reqs

def task_cpu_ms(browser, trace_json):
    """Main-thread top-level tasks of the traced page, longest first, by thread CPU time (ms)."""
    ev = json.loads(trace_json)['traceEvents']
    main = {e['tid'] for e in ev if e.get('name') == 'thread_name' and (e.get('args') or {}).get('name') == 'CrRendererMain'}
    return sorted((round(e.get('tdur', 0) / 1000) for e in ev if e.get('tid') in main and e.get('name') == 'RunTask' and e.get('ph') == 'X'), reverse=True)

@lib.main
def test(t, srv, b):
    t.section('home: what loads')
    ctx, pg = lib.page(b, srv, t, mock=True, lang='he', init=lib.CSP_INIT + INIT, w=412, h=860, mobile=True)
    reqs = recorder(pg)
    pg.goto(srv.url('')); lib.wait_booted(pg)
    time.sleep(5)                                                        # idle-time loads (assistant) included when they happen
    own = [(k, u) for k, u in reqs if u.startswith(srv.base) and '/__test/' not in u]
    js = [u for k, u in own if k == 'script']; css = [u for k, u in own if k == 'stylesheet']; fonts = [u for k, u in own if k == 'font']
    third = sorted({urllib.parse.urlparse(u).netloc for k, u in reqs if not u.startswith((srv.base, 'data:', 'blob:'))})
    m = {'requests': len(own), 'js_gz_kb': gz_kb(js), 'css_gz_kb': gz_kb(css), 'font_kb': round(sum(os.path.getsize(local_path(u)) for u in set(fonts)) / 1024, 1),
         'js': [fname(u) for u in js], 'fonts': [fname(u) for u in fonts], 'third_party': third}
    print('  home:', json.dumps(m))
    if not REPORT:
        t.check(f"home: ≤ {BUDGET['home_requests']} requests", m['requests'] <= BUDGET['home_requests'], m['requests'])
        t.check(f"home: JS ≤ {BUDGET['home_js_gz_kb']} KB gzip", m['js_gz_kb'] <= BUDGET['home_js_gz_kb'], m['js_gz_kb'])
        t.check(f"home: CSS ≤ {BUDGET['home_css_gz_kb']} KB gzip", m['css_gz_kb'] <= BUDGET['home_css_gz_kb'], m['css_gz_kb'])
        t.check(f"home: fonts ≤ {BUDGET['home_font_kb']} KB, no Arabic / Cyrillic file on a Hebrew page", m['font_kb'] <= BUDGET['home_font_kb'] and not any(re.search('arabic|cyrillic', f) for f in m['fonts']), m['fonts'])
        t.eq('home: no view-module JS requested', [f for f in m['js'] if f in MODULE_JS], [])
        t.eq('home: nothing from Google Fonts (self-hosted)', [h for h in third if 'fonts.g' in h], [])
    lt, cls = pg.evaluate('window.__lt'), pg.evaluate('window.__cls')
    print('  long tasks (wall clock)', lt, 'CLS', round(cls, 4))
    if not REPORT: t.check(f"home: CLS < {BUDGET['cls']}", cls < BUDGET['cls'], round(cls, 4))

    t.section('home: idle = nothing animating')
    time.sleep(4)                                                        # > 6 s since the last "activity" (load) → idle
    r0 = pg.evaluate('window.__raf'); time.sleep(3); r1 = pg.evaluate('window.__raf')
    bg = pg.evaluate('window.BG&&BG.stats()')
    anims = pg.evaluate("document.getAnimations().filter(a=>a.playState==='running').map(a=>(a.animationName||a.transitionProperty||'?')+' '+((a.effect&&a.effect.target&&a.effect.target.className)||'')).slice(0,8)")
    print('  rAF in 3 s idle:', r1 - r0, 'bg:', bg, 'running CSS animations:', anims)
    if not REPORT:
        t.eq('idle home: no requestAnimationFrame callbacks for 3 s', r1 - r0, 0)
        t.check('idle home: background canvas loop stopped', bg and not bg['running'], bg)
        t.check('idle home: <html data-idle> set', pg.evaluate("document.documentElement.hasAttribute('data-idle')"))
        t.eq('idle home: no running CSS animations', anims, [])
    pg.mouse.move(200, 300); pg.mouse.move(220, 340); time.sleep(0.4)
    t.check('input wakes the background again', pg.evaluate("BG.stats().running&&!document.documentElement.hasAttribute('data-idle')"), pg.evaluate('BG.stats()'))
    t.eq('home: no CSP violations', lib.csp_violations(pg), [])
    ctx.close()

    t.section('home: longest main-thread task (CPU time, cold load, 2 runs)')
    worst = []
    for i in range(2):
        c2, p2 = lib.page(b, srv, t, mock=True, lang='he', w=412, h=860, mobile=True)
        b.start_tracing(page=p2, categories=TRACE_CATS)
        p2.goto(srv.url('')); lib.wait_booted(p2); time.sleep(2)
        cpu = task_cpu_ms(b, b.stop_tracing())[:5]
        worst.append(cpu[0] if cpu else 0); print('  longest tasks (CPU ms):', cpu)
        c2.close()
    if not REPORT: t.check(f"home: no main-thread task > {BUDGET['task_cpu_ms']} ms (CPU time)", 0 < min(worst) <= BUDGET['task_cpu_ms'], worst)

    t.section('pricing: layout shifts')
    ctx, pg = lib.page(b, srv, t, mock=True, lang='he', init=INIT, w=1300, h=900)
    pg.goto(srv.url('#pricing')); lib.wait_booted(pg); time.sleep(2.5)
    cls = pg.evaluate('window.__cls'); print('  pricing CLS', round(cls, 4), 'long tasks (wall clock)', pg.evaluate('window.__lt'))
    if not REPORT: t.check(f"pricing: CLS < {BUDGET['cls']}", cls < BUDGET['cls'], round(cls, 4))
    ctx.close()

    t.section('deep links: cold load → module once')
    for h, mod, sec, glob, main_js in DEEP:
        ctx, pg = lib.page(b, srv, t, accounts=False, lang='he', init=lib.CSP_INIT)
        reqs = recorder(pg)
        pg.goto(srv.url(h)); lib.wait_booted(pg)
        lib.poll(pg, "m=>CRLOAD.has(m)", 20, arg=mod)
        ok = lib.poll(pg, "a=>!!window[a[0]]&&!document.querySelector(a[1]).hidden&&document.querySelector(a[1]).childElementCount>0", 20, arg=[glob, sec])
        t.check(f'{h}: view open, window.{glob} ready, view built', ok and lib.visible_views(pg) == [sec], lib.visible_views(pg))
        pg.evaluate("location.hash='#pricing'"); time.sleep(0.3); pg.evaluate("h=>location.hash=h", h); time.sleep(0.5)   # leave + come back
        t.eq(f'{h}: {main_js} requested once', sum(1 for k, u in reqs if fname(u) == main_js), 1)
        t.eq(f'{h}: no other view module loaded', sorted({fname(u) for k, u in reqs if fname(u) in MODULE_JS} - ALLOWED[mod]), [])
        t.eq(f'{h}: no CSP violations', lib.csp_violations(pg), [])
        ctx.close()

    t.section('images')
    og = open(os.path.join(lib.REPO, 'assets', 'og.png'), 'rb').read()
    w, hh = struct.unpack('>II', og[16:24])
    t.check('og.png ≤ 150 KB, 1200×630', len(og) <= 150 * 1024 and (w, hh) == (1200, 630), f'{len(og)//1024} KB {w}×{hh}')
