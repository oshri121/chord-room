"""Cross-screen bug sweep: every view × he/en/ar/ru/es × 1440/1024/375 px (light and dark themes alternate between the
languages; ru/es at 1440/375 — at 1024 they use the drawer like 375), signed in through the mock (admin, so no points dialogs) plus the signed-out screens. In each state:
  * no uncaught error / console.error (lib checker) and no unhandled promise rejection,
  * no horizontal page scroll (offending elements listed),
  * no raw i18n key (camelCase / `prefix_kind` tokens), no unreplaced `{placeholder}`, no visible `undefined` / `NaN` /
    `null` / `[object Object]` in visible text or in title / aria-label / placeholder / alt,
  * no English leftovers in he/ar/ru (a visible text node with three or more lowercase English words and no letters of
    the page language; hardware labels / brand names / file names are allow-listed),
  * the floating buttons (accessibility, Roomy) don't overlap each other or the Discover / Deezer bars.
Overlays: account panel, admin panel (every tab + user details), auth dialog (sign-in, sign-up, forgot), Roomy panel,
accessibility panel, mobile drawer; focus handling of My songs / account / admin / DJ song picker. A static pass checks that every i18n table has all five languages and that every
`t('key')` / `data-i="key"` used in the code exists. Last: memory after 5 loads of the same songs in the tool and in a
DJ deck (CDP heap after GC) stays bounded."""
import os, re, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

LANGS = [('he', 'light'), ('en', 'dark'), ('ar', 'dark'), ('ru', 'light'), ('es', 'dark')]
if os.environ.get('CR_BUGHUNT_LANGS'): LANGS = [x for x in LANGS if x[0] in os.environ['CR_BUGHUNT_LANGS'].split(',')]
WIDTHS = [1440, 1024, 375]
HASHES = ['', '#tool', '#discover', '#dj', '#crate', '#mashup', '#convert', '#extended', '#pricing', '#terms', '#privacy', '#about-a11y']
SHOTDIR = os.environ.get('CR_BUGHUNT_SHOTS')

INIT = r"""window.__rej=[];addEventListener('unhandledrejection',e=>{try{window.__rej.push(String(e.reason&&(e.reason.stack||e.reason.message)||e.reason).slice(0,200))}catch(x){}});"""

# lowercase English words that may legitimately stay English in every language (hardware labels, formats, brands…)
ENG_WORDS = ('bpm|lufs|wav|mp3|midi|flac|ogg|m4a|aac|zip|csv|xml|nml|m3u8?|rekordbox|serato|traktor|virtualdj|'
             'pioneer|deezer|chord|room|demucs|onnx|signalsmith|stretch|lame|lamejs|ffmpeg|wasm|fl|studio|ableton|logic|pro|'
             'sync|cue|cues|play|loop|key|lock|fx|beat|echo|reverb|flanger|gate|roll|brake|rec|trim|hi|mid|low|filter|'
             'master|booth|vocals|drums|bass|other|instrumental|extended|mix|mashup|radio|edit|club|dj|intro|outro|drop|break|'
             'build|verse|chorus|bridge|pre|groove|phrase|song|artist|album|title|camelot|db|dbfs|khz|kbps|hz|ms|vs|feat|ft|'
             'lemon|squeezy|supabase|cloudflare|pages|anthropic|claude|haiku|google|fonts|ibm|plex|sans|mono|github|mit|lgpl|gpl|'
             'apache|license|open|source|https?|www|com|net|org|io|dev|example|name|the|of|and|a|to|in|on|for|by|with|is')

SCAN = r"""([lang,words])=>{
  const W=innerWidth,res={sw:document.documentElement.scrollWidth,W,over:[],raw:[],eng:[],fab:[],rej:(window.__rej||[]).splice(0)};
  const vis=el=>el&&el.checkVisibility&&el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&el.getClientRects().length>0;
  const path=el=>{const a=[];for(let e=el;e&&e!==document.body&&a.length<4;e=e.parentElement)a.unshift(e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.classList.length?'.'+[...e.classList].slice(0,2).join('.'):''));return a.join('>')};
  const clipped=el=>{for(let e=el.parentElement;e&&e!==document.documentElement;e=e.parentElement){const o=getComputedStyle(e).overflowX;if(o!=='visible'&&o!=='')return true;if(getComputedStyle(e).position==='fixed')return true}return false};
  if(res.sw>W+1){for(const el of document.querySelectorAll('body *')){if(!vis(el))continue;const r=el.getBoundingClientRect();if((r.right>W+1||r.left<-1)&&!clipped(el))res.over.push(path(el)+' ['+Math.round(r.left)+','+Math.round(r.right)+']');if(res.over.length>6)break}}
  const RAW=/^(?:[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*|(?:act|ck|lk|un|lr|perm|plan|ex[LPRS]|mx|cr|cv|dj|rm|pv)_[A-Za-z0-9_]+)$/,
        RAW_OK=/^(?:localStorage|sessionStorage|iTunes|webkitdirectory|kHz|dBFS|dB|iOS|macOS|iPadOS|iPhone|iPad|eBay|mW|kW|pH)$/,
        PH=/\{[a-z][A-Za-z0-9_]{0,15}\}/, JUNK=/(?:^|[^A-Za-z])(?:undefined|NaN|null)(?:$|[^A-Za-z])|\[object /;
  const ENG=new RegExp('^(?:'+words+')$','i');const NATIVE={he:/[\u0590-\u05FF]/,ar:/[\u0600-\u06FF]/,ru:/[\u0400-\u04FF]/}[lang];
  const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
  while((n=tw.nextNode())){const s=n.nodeValue.trim();if(!s)continue;const p=n.parentElement;if(!p||p.closest('script,style,template,noscript,textarea,code,pre,kbd'))continue;if(!vis(p))continue;
    if(p.closest('.lg-doc')&&lang==='en')continue;
    const words=s.split(/\s+/);
    if(words.some(w=>{w=w.replace(/[.,:;!?()…]+$/,'');return RAW.test(w)&&!RAW_OK.test(w)})&&words.length<=3)res.raw.push('text:'+s.slice(0,60)+' @'+path(p));
    else if(PH.test(s)||JUNK.test(s))res.raw.push('text:'+s.slice(0,60)+' @'+path(p));
    if(NATIVE&&!NATIVE.test(s)&&!p.closest('[dir=ltr],.ltr,bdi,.mono,.dkt,.dkh,.drow .tt,.drow .ar,#tname,.cvnm,.crname,.lg-doc .lat')){
      const eng=s.match(/\b[A-Za-z][a-z]{2,}\b/g)||[];const bad=eng.filter(w=>!ENG.test(w));
      if(bad.length>=3)res.eng.push(s.slice(0,70)+' @'+path(p))}}
  for(const el of document.querySelectorAll('[title],[aria-label],[placeholder],[alt]')){if(!vis(el)&&!(el.tagName==='INPUT'))continue;
    for(const a of ['title','aria-label','placeholder','alt']){const v=el.getAttribute(a);if(!v)continue;const s=v.trim();
      if((RAW.test(s)&&!RAW_OK.test(s))||PH.test(s)||JUNK.test(s))res.raw.push(a+':'+s.slice(0,60)+' @'+path(el))}}
  const fabs=[...document.querySelectorAll('.a11y-fab,.rm-fab')].filter(vis).map(e=>[path(e),e.getBoundingClientRect()]);
  const bars=[...document.querySelectorAll('.dplayer,.fullbar')].filter(vis).map(e=>[path(e),e.getBoundingClientRect()]);
  const ov=(a,b)=>!(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top);
  for(let i=0;i<fabs.length;i++){for(let j=i+1;j<fabs.length;j++)if(ov(fabs[i][1],fabs[j][1]))res.fab.push(fabs[i][0]+' × '+fabs[j][0]);
    for(const b of bars)if(ov(fabs[i][1],b[1]))res.fab.push(fabs[i][0]+' × '+b[0])}
  return res}"""

@lib.main
def test(t, srv, b):
    J = SCAN
    probs = {'over': [], 'raw': [], 'eng': [], 'fab': [], 'rej': []}
    T = {}
    def scan(pg, label, lang):
        t0 = time.time(); r = pg.evaluate(J, [lang, ENG_WORDS]); T[label] = time.time() - t0
        for k in probs:
            for x in (r[k] or []): probs[k].append(f'{label}: {x}')
        if r['sw'] > r['W'] + 1 and not r['over']: probs['over'].append(f"{label}: scrollWidth {r['sw']} > {r['W']}")
        if (r['sw'] > r['W'] + 1 or r['raw'] or r['fab']) and SHOTDIR:
            os.makedirs(SHOTDIR, exist_ok=True)
            try: pg.screenshot(path=os.path.join(SHOTDIR, re.sub(r'[^\w.-]+', '_', label) + '.png'))
            except Exception: pass
        return r
    def go(pg, h):
        lib.close_dialogs(pg)
        pg.evaluate("h=>{if(location.hash!==h){location.hash=h}else{dispatchEvent(new HashChangeEvent('hashchange'))}}", h or '#')
        if h == '#discover':
            try: lib.poll(pg, "document.querySelectorAll('.drow').length>0", 20)
            except TimeoutError: pass
        time.sleep(0.4)

    t.section('static i18n')
    import i18n_static
    t.eq('every i18n table has all five languages with the same keys', i18n_static.check(lib.REPO), [])
    t.eq('every t(key) / data-i key used in the code is defined', [k for k in i18n_static.undefined_keys(lib.REPO)], [])

    for lang, theme in LANGS:
        t.section(f'{lang} ({theme})')
        ctx, pg = lib.page(b, srv, t, mock=True, w=1440, h=900, lang=lang, theme=theme, init=INIT + lib.CSP_INIT)
        pg.goto(srv.url('#tool')); lib.wait_booted(pg)
        lib.wait_tool_song(pg, timeout=90)
        lib.sign_up(pg, 'oshri', f'o-{lang}@x.com'); time.sleep(0.5)
        t.eq(f'{lang}: <html lang/dir>', pg.evaluate("[document.documentElement.lang,document.documentElement.dir]"), [lang, 'rtl' if lang in ('he', 'ar') else 'ltr'])
        for w in (WIDTHS if lang in ('he', 'en', 'ar') else [1440, 375]):   # ru/es at 1024 use the drawer like 375 (test_header_fit)
            pg.set_viewport_size({'width': w, 'height': 900 if w > 400 else 780}); time.sleep(0.3)
            for h in HASHES:
                go(pg, h); scan(pg, f'{lang}/{theme}/{w}/{h or "home"}', lang)
            # overlays (signed in)
            go(pg, '#tool')
            pg.evaluate("document.querySelector('#accBtn').click()"); time.sleep(0.6); scan(pg, f'{lang}/{w}/account', lang)
            pg.evaluate("document.querySelector('#accClose')&&document.querySelector('#accClose').click()"); time.sleep(0.3)
            if w != 1024:
                pg.evaluate("document.querySelector('#adminBtn').click()"); time.sleep(0.8)
                for v in ['users', 'songs', 'activity', 'settings', 'roles']:
                    pg.evaluate("v=>{const b=document.querySelector(`#admTabs button[data-v=\"${v}\"]`);if(b)b.click()}", v); time.sleep(0.6)
                    scan(pg, f'{lang}/{w}/admin-{v}', lang)
                pg.evaluate("document.querySelector('#admTabs button[data-v=\"users\"]').click()"); time.sleep(0.4)
                pg.evaluate("(()=>{const b=document.querySelector('#uBody tr .acts .btn.solid');if(b)b.click()})()"); time.sleep(0.8)
                scan(pg, f'{lang}/{w}/admin-user', lang)
                pg.evaluate("document.querySelector('#adminClose').click()"); time.sleep(0.3)
            fab = pg.query_selector('.rm-fab')
            if fab and fab.is_visible():
                fab.click(); time.sleep(0.6); scan(pg, f'{lang}/{w}/roomy', lang); pg.keyboard.press('Escape'); time.sleep(0.3)
            a11 = pg.query_selector('.a11y-fab')
            if a11 and a11.is_visible():
                a11.click(); time.sleep(0.5); scan(pg, f'{lang}/{w}/a11y', lang); pg.keyboard.press('Escape'); time.sleep(0.3)
            if w == 375:
                bg = pg.query_selector('#navBurger')
                if bg and bg.is_visible():
                    bg.click(); time.sleep(0.5); scan(pg, f'{lang}/{w}/drawer', lang); pg.keyboard.press('Escape'); time.sleep(0.3)
        # signed out: gate + auth dialog steps
        lib.sign_out(pg)
        for w in (1440, 375):
            pg.set_viewport_size({'width': w, 'height': 900 if w > 400 else 780}); time.sleep(0.3)
            go(pg, '#crate'); scan(pg, f'{lang}/{w}/gate', lang)
            go(pg, '#tool'); scan(pg, f'{lang}/{w}/guest-tool', lang)
            pg.evaluate("document.querySelector('#signInBtn').click()"); time.sleep(0.5); scan(pg, f'{lang}/{w}/auth-in', lang)
            pg.evaluate("document.querySelector('#toForgot').click()"); time.sleep(0.4); scan(pg, f'{lang}/{w}/auth-forgot', lang)
            pg.evaluate("document.querySelector('#toIn2').click()"); time.sleep(0.3)
            pg.evaluate("document.querySelector('#auTabUp').click()"); time.sleep(0.4); scan(pg, f'{lang}/{w}/auth-up', lang)
            pg.keyboard.press('Escape'); time.sleep(0.3)
        t.check(f'{lang}: zero CSP violations', lib.csp_violations(pg) == [], lib.csp_violations(pg)[:3])
        t.page_errors(f'{lang}: no page errors / console errors')
        if os.environ.get('CR_BUGHUNT_TIMES'): print('   slowest scans:', sorted(((round(v, 2), k) for k, v in T.items()), reverse=True)[:6])
        ctx.close()

    t.section('results')
    def uniq(xs):   # one line per distinct problem (the label of its first occurrence + how many states show it)
        seen = {}
        for x in xs:
            lab, msg = x.split(': ', 1)
            k = re.sub(r'\[-?\d+,-?\d+\]', '', msg)
            if k in seen: seen[k][1] += 1
            else: seen[k] = [x, 1]
        out = [f'{v[0]}  (×{v[1]})' if v[1] > 1 else v[0] for v in seen.values()]
        for o in out: print('     ·', o[:300])
        return out
    t.eq('no horizontal page scroll in any view', uniq(probs['over']), [])
    t.eq('no raw i18n keys / placeholders / undefined / NaN', uniq(probs['raw']), [])
    t.eq('no English leftovers in he/ar/ru', uniq(probs['eng']), [])
    t.eq('floating buttons do not overlap each other or the bottom bars', uniq(probs['fab']), [])
    t.eq('no unhandled promise rejections', uniq(probs['rej']), [])

    t.section('panels + dialogs: focus moves in, Tab stays in (modal ones), Esc closes and returns the focus')
    ctx, pg = lib.page(b, srv, t, mock=True, w=1300, h=900, lang='en')
    pg.goto(srv.url('#tool')); lib.wait_booted(pg); lib.wait_tool_song(pg, timeout=90)
    lib.sign_up(pg, 'oshri', 'mem@x.com')
    def dlg(name, opener, box, modal, view=None, then=None):
        if view: pg.evaluate("h=>location.hash=h", view); time.sleep(1)
        pg.focus(opener); pg.keyboard.press('Enter'); time.sleep(0.6)
        if then: pg.evaluate("s=>document.querySelector(s).click()", then); time.sleep(0.6)
        inside = lambda: pg.evaluate("s=>document.querySelector(s).contains(document.activeElement)", box)
        t.check(f'{name}: focus moves into it on open', inside(), pg.evaluate("document.activeElement.id||document.activeElement.className"))
        if modal:
            ok = True
            for i in range(25): pg.keyboard.press('Tab'); ok = ok and inside()
            for i in range(3): pg.keyboard.press('Shift+Tab'); ok = ok and inside()
            t.check(f'{name}: Tab / Shift+Tab stay inside (modal)', ok)
        pg.keyboard.press('Escape'); time.sleep(0.5)
        t.check(f'{name}: Esc closes it and the focus goes back to its button', pg.evaluate("s=>document.querySelector(s).hidden", box) and pg.evaluate("o=>document.activeElement===document.querySelector(o)", then_back.get(name, opener)),
                pg.evaluate("document.activeElement.id||document.activeElement.className"))
    then_back = {'dj picker': '.dk[data-d="0"] [data-act=load]'}
    dlg('my songs', '#libBtn', '#lib', False)
    dlg('account', '#accBtn', '#acc', False)
    dlg('admin', '#adminBtn', '#admin', True)
    dlg('dj picker', '.dk[data-d="0"] [data-act=load]', '#djPick', True, view='#dj', then='[data-m=lib]')

    t.section('memory: the same songs loaded 5 times')
    pg.evaluate("location.hash='#tool'"); time.sleep(1)
    cdp = ctx.new_cdp_session(pg)
    def heap():   # V8 heap + ArrayBuffer backing stores (MB), DOM nodes, JS listeners — after a forced GC
        cdp.send('HeapProfiler.collectGarbage'); time.sleep(0.3); cdp.send('HeapProfiler.collectGarbage')
        u, d = cdp.send('Runtime.getHeapUsage'), cdp.send('Memory.getDOMCounters')
        return (round((u['usedSize'] + u.get('backingStorageSize', 0)) / 1048576, 1), d['nodes'], d['jsEventListeners'])
    hs = []
    for i in range(5):
        pg.set_input_files('#file', lib.fixture('p%d.mp3' % (i % 2)))
        lib.wait_tool_song(pg, 'p%d' % (i % 2), timeout=90); time.sleep(0.5)
        hs.append(heap())
    t.check('tool: heap + buffers / DOM nodes / listeners bounded over 5 loads', hs[-1][0] - hs[1][0] < 40 and hs[-1][1] - hs[1][1] < 300 and hs[-1][2] - hs[1][2] < 50, hs)
    pg.evaluate("location.hash='#dj'"); time.sleep(1.2)
    dh = []
    for i in range(5):
        pg.evaluate("document.querySelector('[data-act=load]').click()"); time.sleep(0.3)
        with pg.expect_file_chooser() as fc:
            pg.evaluate("document.querySelector('[data-m=upload]').click()")
        fc.value.set_files(lib.fixture('p%d.mp3' % (i % 2)))
        lib.poll(pg, "n=>{const d=document.querySelector('.dk');return d&&d.querySelector('.dkt').textContent.startsWith(n)&&/^\\d/.test(d.querySelector('.dkbpm b').textContent)}", 60, arg='p%d' % (i % 2)); time.sleep(1)
        dh.append(heap())
    t.check('dj: heap + buffers / DOM nodes / listeners bounded over 5 deck loads', dh[-1][0] - dh[1][0] < 40 and dh[-1][1] - dh[1][1] < 300 and dh[-1][2] - dh[1][2] < 50, dh)
    ctx.close()
