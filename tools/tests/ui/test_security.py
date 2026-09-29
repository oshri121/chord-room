"""XSS + CSP: every field another user / an admin / a third party can write holds an XSS payload (mock/evil.js,
plus poisoned Crate rows in localStorage). The main flows run under the real _headers CSP: home, pricing + contact
toast, tool (demo, Signalsmith tempo change, MP3 export), AI separation start (model + worker under /ai/*), Discover
(proxy, catalog merge, preview), DJ (demo deck), Crate (restored rows + analysis), account box + admin panel (all tabs).
Asserts: no payload executed, no injected on*/javascript: markup, no request to the attacker host, zero CSP
violations (= the CSP doesn't break the site), no step errors, and each flow actually worked."""
import os, re, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

INIT = r"""
window.__viol=[];window.__inj=[];window.__fired=window.__fired||[];
document.addEventListener('securitypolicyviolation',e=>window.__viol.push({d:e.effectiveDirective,u:String(e.blockedURI).slice(0,80),s:(e.sample||'').slice(0,60)}),true);
new MutationObserver(ms=>{for(const m of ms){const ns=m.type==='attributes'?[m.target]:[...m.addedNodes];for(const n of ns){if(n.nodeType!==1)continue;
  for(const el of [n,...n.querySelectorAll('*')])for(const a of el.attributes)if(/^on/i.test(a.name)||(/^\s*javascript:/i.test(a.value)&&!(el.tagName==='INPUT'&&a.name==='value')))window.__inj.push(el.tagName+' '+a.name+'='+a.value.slice(0,50))}}})
  .observe(document,{subtree:true,childList:true,attributes:true});
try{if(!localStorage.getItem('__seeded')){localStorage.setItem('__seeded','1');localStorage.setItem('chordroom.crate.v1:guest',JSON.stringify({v:1,folder:'',sort:null,sel:null,rows:[
  {id:'x"><img src=x onerror="__xss(\'crate.id\')">',name:'Evil - Row.mp3',rel:'Evil - Row.mp3',size:1,ext:'mp3',dur:100,lufs:-9,peak:-1,bpm:120,bpm0:120,offset:0,down:0,key:{pc:9,mode:1},flux:3},
  {id:'r2',name:'Row2.mp3',bpm:124,dur:'<img src=x onerror="__xss(\'crate.dur\')">',lufs:'1"><img src=x onerror="__xss(\'crate.lufs\')">',key:{pc:0,mode:0}}]}))}}catch(e){}
"""

@lib.main
def test(t, srv, b):
    evil = []
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
    safe('home again', lambda: (pg.evaluate("location.hash=''"), pg.goto(srv.url()), time.sleep(2)))

    t.section('results')
    t.eq('no step errors', step_errs, [])
    t.eq('no XSS payload executed', sorted(acc['fired']), [])
    t.eq('no injected on*/javascript: markup', sorted(acc['inj']), [])
    t.eq('no request to the attacker host', sorted(set(u[:60] for u in evil)), [])
    t.eq('zero CSP violations', acc['viol'], [])
    t.eq('no CSP console messages', sorted(set(cons)), [])
    t.check('contact toast shows the payload as text', 'javascript:' in out.get('toast', ''), out.get('toast'))
    t.check('tool: Signalsmith Stretch loaded under CSP', out.get('signalsmith'))
    t.check('tool: MP3 export downloaded (worker + lamejs)', (out.get('mp3') or '').endswith(('.mp3', '.zip')), out.get('mp3'))
    t.check('AI: model loaded and separation started (worker under /ai/*)', len(out.get('ai', [])) >= 2, out.get('ai', [])[-3:])
    t.check('discover: rows rendered', (out.get('disc_rows') or 0) > 0, out.get('disc_rows'))
    t.check('discover: covers only from dzcdn / own assets', all(c.startswith(('https://cdn-images.dzcdn.net/', 'assets/')) for c in out.get('covers', [])), out.get('covers'))
    t.check('dj: demo loaded in deck A', 'BPM' in out.get('dj_track', ''), out.get('dj_track'))
    t.check('crate: poisoned rows restored + one analysed', (out.get('crate_rows') or 0) >= 3, out.get('crate_rows'))
    t.eq('admin: 3 users listed', out.get('admin_users'), 3)
    t.check('admin: unsafe avatar URLs replaced', out.get('avatars') and all(a.startswith('data:') for a in out['avatars']), out.get('avatars'))
