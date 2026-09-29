"""Roomy assistant UI (mock backend + fake /api/assistant stream from lib.Server, real CSP): fab + panel a11y
(RTL/LTR placement vs the a11y button), sign-in gate inside the panel, suggestions per view/song, streaming with
stop, request format (bearer token, lang, ctx with song key/BPM/chords), safe tiny-markdown rendering (only
internal hash links, HTML shown as text), quota/slow/not-configured/network errors + retry, 2000-char cap, history
rules, per-user sessionStorage, languages, dark theme, lift above the Discover player and the Deezer bar, 375 px
sheet with focus trap, first-visit teaser once, a11y no-animation, zero CSP violations."""
import os, re, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

INIT = r"""
window.__viol=[];window.__inj=[];window.__alert=0;window.alert=()=>{window.__alert++};
document.addEventListener('securitypolicyviolation',e=>window.__viol.push(e.effectiveDirective+' '+String(e.blockedURI).slice(0,60)),true);
new MutationObserver(ms=>{for(const m of ms){for(const n of m.addedNodes){if(n.nodeType!==1)continue;
  for(const el of [n,...n.querySelectorAll('*')]){if(el.closest&&el.closest('#rm-root')&&/^(IMG|SCRIPT|IFRAME|OBJECT)$/.test(el.tagName))window.__inj.push(el.tagName);
    for(const a of el.attributes)if(/^on/i.test(a.name)||/^\s*javascript:/i.test(a.value))window.__inj.push(el.tagName+' '+a.name)}}}}).observe(document,{subtree:true,childList:true});
"""

@lib.main
def test(t, srv, b):
    check = t.check
    poll = lambda pg, js, timeout=60: lib.poll(pg, js, timeout)
    last = lambda: json.loads(json.dumps(srv.last))
    BASE = srv.base
    errs = t.errs
    ctx = lib.context(b, srv, mock=True, init=INIT)
    pg = ctx.new_page(); lib.watch(pg, errs)
    pg.goto(BASE + '#tool'); poll(pg, "window.CR&&CR.toolSong&&!!CR.toolSong()"); time.sleep(0.5)
    shot = lambda n: t.shot(pg, n)
    rect = lambda s: pg.evaluate(f"(()=>{{const r=document.querySelector('{s}').getBoundingClientRect();return {{l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height}}}})()")
    inter = lambda a, c: not (a['r'] <= c['l'] or c['r'] <= a['l'] or a['b'] <= c['t'] or c['b'] <= a['t'])

    t.section('signed out (he, RTL)')
    check('fab exists with label', pg.get_attribute('.rm-fab', 'aria-label') == "צ׳אט עם רומי")
    fab, a11 = rect('.rm-fab'), rect('.a11y-fab')
    check('RTL: fab bottom-left, a11y bottom-right, no overlap', fab['l'] < 100 and a11['r'] > 1200 and not inter(fab, a11), (fab, a11))
    pg.click('.rm-fab'); time.sleep(0.4)
    check('panel open, aria-expanded', pg.is_visible('#rm-panel') and pg.get_attribute('.rm-fab', 'aria-expanded') == 'true')
    check('dialog role + labelled', pg.get_attribute('#rm-panel', 'role') == 'dialog' and pg.inner_text('#rm-title') == 'רומי')
    check('gate shown, composer hidden', pg.is_visible('.rm-gate') and not pg.is_visible('.rm-form'), pg.inner_text('.rm-gate').replace('\n', ' | '))
    check('focus moved into the panel', pg.evaluate("document.querySelector('#rm-panel').contains(document.activeElement)"))
    shot('01_signed_out_he')
    pg.click('.rm-gate [data-rm-act="in"]'); time.sleep(0.5)
    check('sign-in button opens the auth dialog, chat closes', pg.evaluate("!!document.querySelector('.dlgwrap:not([hidden])')") and not pg.is_visible('#rm-panel'))
    pg.keyboard.press('Escape'); time.sleep(0.3)
    pg.evaluate("document.querySelectorAll('.dlgwrap').forEach(d=>d.hidden=true)")

    t.section('signed in')
    pg.evaluate("Backend.signUp({username:'oshri',email:'o@x.com',password:'password9'})"); time.sleep(1.2)
    pg.evaluate("document.querySelectorAll('.dlgwrap').forEach(d=>d.hidden=true)")
    pg.click('.rm-fab'); time.sleep(0.4)
    check('composer + hello message', pg.is_visible('.rm-ta') and 'רומי' in pg.inner_text('.rm-hello'))
    check('focus in textarea', pg.evaluate("document.activeElement===document.querySelector('.rm-ta')"))
    chips = pg.eval_on_selector_all('.rm-chip', 'e=>e.map(x=>x.textContent)')
    check('tool+song suggestions', chips and chips[0].startswith('באיזה סולם השיר הזה'), chips)
    shot('02_signed_in_he')
    pg.click('.rm-chip >> nth=0')
    try: pg.wait_for_function("!document.querySelector('.rm-stop').hidden&&document.querySelector('.rm-send').hidden", polling=20, timeout=5000); streaming = True
    except Exception: streaming = False
    check('stop button (and no send) while streaming', streaming)
    pg.wait_for_selector('.rm-send:not([hidden])', timeout=8000); time.sleep(0.3)
    L = last(); body = L['body']
    check('sent with bearer token + JSON', L['auth'] == 'Bearer tok-u2' and L['ct'] == 'application/json')
    check('sent lang he + one user message', body['lang'] == 'he' and body['messages'] == [{'role': 'user', 'content': chips[0]}], body['messages'])
    s = body['ctx'].get('song', {})
    check('ctx: tool view + song key/bpm/chords', body['ctx']['view'] == 'tool' and re.match(r'^[A-G][#b]?m?$', s.get('key', '')) and s.get('bpm') and s.get('chords'), body['ctx'])
    html = pg.inner_html('.rm-log')
    check('link to #crate rendered', pg.eval_on_selector_all('.rm-log a', 'e=>e.map(a=>a.getAttribute("href"))') == ['#crate', '#', '#pricing'], pg.eval_on_selector_all('.rm-log a', 'e=>e.map(a=>a.outerHTML)'))
    txt = pg.inner_text('.rm-log .rm-msg:last-child')
    check('javascript: link shown as plain text', '[x](javascript:alert(1))' in txt and '[y](https://evil.example/)' in txt)
    check('<img onerror> shown as text, no element', '<img src=x onerror=alert(1)>' in txt and pg.eval_on_selector_all('#rm-root img,#rm-root script', 'e=>e.length') == 0)
    check('bold/italic/code/lists rendered', pg.eval_on_selector_all('.rm-log .rm-msg:last-child strong', 'e=>e.length') >= 2 and pg.eval_on_selector_all('.rm-log .rm-msg:last-child em', 'e=>e.length') == 1
          and pg.eval_on_selector_all('.rm-log .rm-msg:last-child code', 'e=>e.map(x=>x.textContent)') == ['124 BPM'] and pg.eval_on_selector_all('.rm-log .rm-msg:last-child ul li', 'e=>e.length') == 3 and pg.eval_on_selector_all('.rm-log .rm-msg:last-child ol li', 'e=>e.length') == 2)
    check('no injected elements/handlers, no alert', pg.evaluate("window.__inj.length===0&&window.__alert===0"), pg.evaluate("window.__inj"))
    check('chips hidden once chatting', not pg.is_visible('.rm-chips'))
    check('quota hint (3 left)', 'נשארו לך 3 הודעות היום' in pg.inner_text('.rm-note'), pg.inner_text('.rm-note'))
    check('live region got the final answer', pg.inner_text('.rm-sr[aria-live]').startswith('רומי:'))
    shot('03_answer_he')
    pg.click('.rm-log a[href="#crate"]'); time.sleep(0.6)
    check('internal link switches to Crate', pg.evaluate("!document.querySelector('#crateView').hidden"))

    t.section('stop, errors, retry')
    pg.fill('.rm-ta', 'LONG answer please'); pg.keyboard.press('Enter')
    pg.wait_for_selector('.rm-stop:not([hidden])'); time.sleep(0.8)
    check('Enter sends, textarea cleared', pg.input_value('.rm-ta') == '')
    ctxc = last()['body']['ctx']
    check('ctx view crate', ctxc['view'] == 'crate', ctxc)
    pg.click('.rm-stop'); time.sleep(0.6)
    lastmsg = pg.inner_text('.rm-log .rm-msg:last-child')
    check('stop keeps partial text + "נעצר" tag', 'מילה 0' in lastmsg and 'נעצר' in lastmsg and 'מילה 79' not in lastmsg, lastmsg[-60:])
    check('send button back after stop', pg.is_visible('.rm-send'))
    pg.fill('.rm-ta', 'CUT please'); pg.click('.rm-send'); time.sleep(1.2)
    check('cut answer → tag + retry', 'התשובה נקטעה' in pg.inner_text('.rm-log .rm-msg:last-child') and pg.is_visible('.rm-note [data-rm-act="retry"]'))
    pg.fill('.rm-ta', 'QUOTA'); pg.click('.rm-send'); time.sleep(0.8)
    note = pg.inner_text('.rm-note')
    check('quota → friendly note with pricing link', 'סיימת את ההודעות של היום' in note and pg.eval_on_selector_all('.rm-note a', 'e=>e.map(a=>a.getAttribute("href"))') == ['#pricing'], note)
    check('no empty bubble after error', pg.inner_text('.rm-log .rm-msg:last-child').strip().endswith('QUOTA'))
    shot('04_quota_he')
    pg.fill('.rm-ta', 'CFG'); pg.click('.rm-send'); time.sleep(0.6)
    check('not configured → coming soon', 'בקרוב' in pg.inner_text('.rm-note'))
    pg.fill('.rm-ta', 'SLOW'); pg.click('.rm-send'); time.sleep(0.6)
    check('slow → wait a minute + retry', 'חכו דקה' in pg.inner_text('.rm-note') and pg.is_visible('.rm-note [data-rm-act="retry"]'))
    pg.fill('.rm-ta', 'NET'); pg.click('.rm-send'); time.sleep(0.8)
    check('network error message', 'אין חיבור' in pg.inner_text('.rm-note'), pg.inner_text('.rm-note'))
    pg.fill('.rm-ta', 'x' * 2100)
    check('textarea capped at 2000 + counter', len(pg.input_value('.rm-ta')) == 2000 and '2000 מתוך 2000' in pg.inner_text('#rm-count'), pg.inner_text('#rm-count'))
    pg.fill('.rm-ta', '')
    n = pg.eval_on_selector_all('.rm-log .rm-msg:not(.rm-hello)', 'e=>e.length')
    pg.fill('.rm-ta', 'שאלה אחרונה LAST\nשורה שנייה'); pg.click('.rm-send'); time.sleep(0.8)
    hist = last()['body']['messages']
    check('history alternates (unanswered questions dropped), ≤24', hist[0]['role'] == 'user' and len(hist) <= 24 and all(hist[i]['role'] != hist[i+1]['role'] for i in range(len(hist)-1)) and hist[-1]['content'].endswith('שורה שנייה') and not any(m['content'] in ('QUOTA','CFG','SLOW','NET') for m in hist), [m['role'] for m in hist])
    check('user newline kept in bubble', 'שורה שנייה' in pg.inner_text('.rm-log .rm-me >> nth=-1'))

    t.section('persistence, new chat, account switch')
    cnt = pg.eval_on_selector_all('.rm-log .rm-msg:not(.rm-hello)', 'e=>e.length')
    pg.keyboard.press('Escape'); time.sleep(0.3)
    check('Esc closes, focus back on the fab', not pg.is_visible('#rm-panel') and pg.evaluate("document.activeElement===document.querySelector('.rm-fab')"))
    ss = pg.evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('chordroom.rm.v1'))")
    check('conversation in sessionStorage per user', ss == ['chordroom.rm.v1:u2'], ss)
    pg.click('.rm-fab'); time.sleep(0.3)
    check('reopen keeps messages', pg.eval_on_selector_all('.rm-log .rm-msg:not(.rm-hello)', 'e=>e.length') == cnt)
    pg.click('.rm-new'); time.sleep(0.3)
    check('new chat clears + chips back', pg.eval_on_selector_all('.rm-log .rm-msg:not(.rm-hello)', 'e=>e.length') == 0 and pg.is_visible('.rm-chips'))
    chips = pg.eval_on_selector_all('.rm-chip', 'e=>e.map(x=>x.textContent)')
    check('crate suggestions', any('rekordbox' in c for c in chips), chips)
    pg.fill('.rm-ta', 'hello'); pg.click('.rm-send'); time.sleep(1)
    pg.evaluate("Backend.signOut()"); time.sleep(0.6)
    check('sign-out → conversation gone + gate', pg.eval_on_selector_all('.rm-log .rm-msg:not(.rm-hello)', 'e=>e.length') == 0 and pg.is_visible('.rm-gate')
          and pg.evaluate("Object.keys(sessionStorage).filter(k=>k.startsWith('chordroom.rm')).length") == 0)
    pg.evaluate("Backend.signIn({email:'dana@example.com',password:'password1'})"); time.sleep(0.8)
    check('other account starts empty', pg.eval_on_selector_all('.rm-log .rm-msg:not(.rm-hello)', 'e=>e.length') == 0 and pg.is_visible('.rm-ta'))
    pg.evaluate("window.__rmStatus={ok:true,left:0,limit:30}"); pg.click('.rm-x'); pg.click('.rm-fab'); time.sleep(0.4)
    check('status 0 left → quota note on open (dana = en profile)', "used today's messages" in pg.inner_text('.rm-note'), pg.inner_text('.rm-note'))
    pg.evaluate("window.__rmStatus={ok:true,left:30,limit:30}")

    t.section('languages')
    for lg, name, ph in [('en', 'Roomy', 'Message Roomy…'), ('ar', 'رومي', 'اكتب لرومي…'), ('ru', 'Руми', 'Напишите Руми…'), ('es', 'Roomy', 'Escribe a Roomy…')]:
        pg.evaluate(f"CR.setLang('{lg}')"); time.sleep(0.3)
        check(f'{lg}: strings + dir', pg.inner_text('#rm-title') == name and pg.get_attribute('.rm-ta', 'placeholder') == ph and pg.get_attribute('#rm-root', 'dir') == ('rtl' if lg == 'ar' else 'ltr'))
        if lg in ('en', 'ar'):
            pg.evaluate("CR.showView('tool')"); time.sleep(0.2); pg.click('.rm-new'); time.sleep(0.2)
            if lg == 'en': check('en tool chips', pg.eval_on_selector_all('.rm-chip', 'e=>e[0].textContent').startswith('What key'))
            shot(f'05_{lg}')
    pg.evaluate("CR.setLang('en')"); time.sleep(0.2)
    fab = rect('.rm-fab'); a11 = rect('.a11y-fab')
    check('LTR: fab bottom-right, a11y bottom-left', fab['r'] > 1200 and a11['l'] < 100 and not inter(fab, a11))
    pg.fill('.rm-ta', 'hi'); pg.click('.rm-send'); time.sleep(1.5)
    check('en request lang', last()['body']['lang'] == 'en')
    shot('06_en_answer')

    t.section('dark')
    pg.evaluate("document.documentElement.dataset.theme='dark';document.querySelector('#themeBtn')&&0"); time.sleep(0.3)
    bg = pg.evaluate("getComputedStyle(document.querySelector('#rm-panel')).backgroundColor"); bot = pg.evaluate("getComputedStyle(document.querySelector('.rm-bot')).backgroundColor")
    check('dark: panel uses dark paper', bg in ('rgb(14, 14, 16)',) or 'rgb(1' in bg, (bg, bot))
    shot('07_dark_en')
    pg.evaluate("CR.setLang('he')"); time.sleep(0.2); shot('07b_dark_he')
    pg.evaluate("document.documentElement.dataset.theme='light'")

    t.section('bottom bars')
    pg.click('.rm-x'); time.sleep(0.2)
    pg.evaluate("CR.showView('discover')"); pg.wait_for_selector('.drow .pv', timeout=20000); time.sleep(0.5)
    pg.click('.drow:nth-child(1) .pv'); pg.wait_for_selector('#dPlayer:not([hidden])', timeout=10000); time.sleep(0.8)
    fab, dp = rect('.rm-fab'), rect('#dPlayer')
    check('fab lifted above the Discover player bar', fab['b'] <= dp['t'] and not inter(fab, dp), (fab, dp))
    check('…and still clear of the a11y button', not inter(fab, rect('.a11y-fab')))
    pg.click('.rm-fab'); time.sleep(0.4)
    check('open panel sits above the player bar', rect('#rm-panel')['b'] <= dp['t'])
    shot('08_discover_player_he')
    pg.click('.rm-x')
    pg.evaluate("document.querySelector('#dPlayer [data-dp=\"stop\"]').click()"); time.sleep(0.4)
    pg.evaluate("document.querySelector('#fullbar').hidden=false;document.body.classList.add('hasbar')")
    try: poll(pg, "document.querySelector('.rm-fab').getBoundingClientRect().bottom<=document.querySelector('#fullbar').getBoundingClientRect().top", 8)
    except TimeoutError: pass
    fab, fb = rect('.rm-fab'), rect('#fullbar')
    check('fab lifted above the Deezer full-song bar', fab['b'] <= fb['t'], (fab, fb))
    pg.evaluate("document.querySelector('#fullbar').hidden=true;document.body.classList.remove('hasbar')")
    try: poll(pg, "Math.abs(document.querySelector('.rm-fab').getBoundingClientRect().bottom-884)<2", 8)
    except TimeoutError: pass
    check('lift resets', abs(rect('.rm-fab')['b'] - (900 - 16)) < 2, rect('.rm-fab'))

    t.section('keyboard trap on mobile, 375 px')
    mp = ctx.new_page(); mp.set_viewport_size({'width': 375, 'height': 740}); lib.watch(mp, errs)
    mp.goto(BASE + '#tool'); lib.wait_booted(mp); time.sleep(0.4)
    mp.evaluate("Backend.signUp({username:'mobi',email:'m@x.com',password:'password9'})"); time.sleep(1)
    mp.evaluate("document.querySelectorAll('.dlgwrap').forEach(d=>d.hidden=true)")
    mrect = lambda s: mp.evaluate(f"(()=>{{const r=document.querySelector('{s}').getBoundingClientRect();return {{l:r.left,r:r.right,t:r.top,b:r.bottom}}}})()")
    f, a = mrect('.rm-fab'), mrect('.a11y-fab')
    check('375: fab and a11y button apart', not inter(f, a), (f, a))
    t.shot(mp, '09_mobile_closed')
    mp.click('.rm-fab'); time.sleep(0.4)
    pr = mrect('#rm-panel')
    time.sleep(0.4); pr = mrect('#rm-panel'); check('375: full-screen sheet', abs(pr['l']) < 1 and abs(pr['r'] - 375) < 1 and abs(pr['t']) < 1 and abs(pr['b'] - 740) < 1, pr)
    check('375: no horizontal scroll', mp.evaluate("document.documentElement.scrollWidth<=375 && document.querySelector('#rm-panel').scrollWidth<=375"))
    t.shot(mp, '10_mobile_open')
    mp.click('.rm-chip >> nth=1'); time.sleep(2.5)
    check('375: answer fits (no h-scroll in log)', mp.evaluate("(()=>{const l=document.querySelector('.rm-log');return l.scrollWidth<=l.clientWidth+1})()"))
    t.shot(mp, '11_mobile_answer')
    for _ in range(12): mp.keyboard.press('Tab')
    check('375: Tab stays inside the sheet', mp.evaluate("document.querySelector('#rm-panel').contains(document.activeElement)"))
    mp.click('.rm-log a[href="#crate"]'); time.sleep(0.5)
    check('375: internal link closes the sheet + opens view', not mp.is_visible('#rm-panel') and mp.evaluate("!document.querySelector('#crateView').hidden"))
    mp.evaluate("CR.setLang('ar')"); mp.click('.rm-fab'); time.sleep(0.3)
    check('375 ar: no horizontal scroll', mp.evaluate("document.documentElement.scrollWidth<=375"))
    t.shot(mp, '12_mobile_ar')

    t.section('teaser (first visit)')
    v_early = pg.evaluate("window.__viol") + mp.evaluate("window.__viol")
    pg.close(); mp.close()
    ctx2 = lib.context(b, srv, mock=True, init=INIT)
    tp = ctx2.new_page(); lib.watch(tp, errs)
    tp.goto(BASE); lib.wait_booted(tp)                       # fresh context: never seen → the bubble comes 6 s after boot
    try: poll(tp, "!document.querySelector('.rm-teaser').hidden", 15)
    except TimeoutError: pass
    check('teaser shows once', tp.is_visible('.rm-teaser') and 'רומי' in tp.inner_text('.rm-teaser'))
    t.shot(tp, '13_teaser')
    tp.click('.rm-teaser-x'); lib.reload(tp); time.sleep(7)
    check('teaser not again', not tp.is_visible('.rm-teaser'))
    lib.wait_idle(tp); tp.evaluate("localStorage.removeItem('chordroom.rm.seen')")
    tp.reload(); lib.wait_booted(tp); tp.evaluate("document.documentElement.classList.add('a11y-noanim')")
    try: poll(tp, "!document.querySelector('.rm-teaser').hidden", 15)
    except TimeoutError: pass
    anim = tp.evaluate("getComputedStyle(document.querySelector('.rm-fab .rm-av-fab')).animationName")
    check('a11y no-animation → no wiggle', anim == 'none', anim)

    v = v_early + tp.evaluate("window.__viol")
    check('zero CSP violations', not v, v)
