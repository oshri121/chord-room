"""Routing + sign-in gate (mock backend, accounts on): home is the About page, the tools (#tool #discover #dj #crate)
show #gateView when signed out, pricing stays open, upload/gate buttons open the auth dialog, signing in opens the
tools, signing out gates again, the brand goes home. Header sign-in/up buttons and gate layout checked in
light/dark × he/en/ar × 375/1300-1440 px (no horizontal scroll)."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=True, theme='light', lang='he', init=lib.CSP_INIT)
    pg.goto(srv.url()); lib.wait_booted(pg)
    t.eq('home (no hash) = About', lib.visible_views(pg), ['#aboutView'])
    t.check('first nav tab "בית" is active', pg.evaluate("document.querySelector('#navAbout').classList.contains('on')") and 'בית' in pg.inner_text('#navAbout'))
    for nav, want, h in [('#navTool', '#gateView', '#tool'), ('#navDisc', '#gateView', '#discover'), ('#navDj', '#gateView', '#dj'),
                         ('#navCrate', '#gateView', '#crate'), ('#navPricing', '#pricingView', '#pricing')]:
        pg.click(nav); time.sleep(0.6)
        t.check(f'signed out: {nav} → {want} ({h})', lib.visible_views(pg) == [want] and pg.evaluate("location.hash") == h, (lib.visible_views(pg), pg.evaluate("location.hash")))
    pg.goto(srv.url('#tool')); lib.wait_booted(pg); time.sleep(0.5)
    t.eq('deep link #tool → gate', lib.visible_views(pg), ['#gateView'])
    t.check('gate has a heading', pg.evaluate("(document.querySelector('#gateView h1')||{}).textContent||''") != '')
    t.shot(pg, 'gate_light')
    pg.click('#upLbl'); time.sleep(0.6)
    t.check('upload asks for an account (auth dialog)', not pg.evaluate("document.querySelector('#authDlg').hidden"))
    pg.keyboard.press('Escape'); time.sleep(0.4)
    pg.click('#gateView [data-g=in]'); time.sleep(0.5)
    t.check('gate "sign in" opens the dialog', not pg.evaluate("document.querySelector('#authDlg').hidden") and pg.is_visible('#fIn'))
    pg.keyboard.press('Escape'); time.sleep(0.3)
    lib.sign_up(pg, 'oshri', 'o@x.com'); time.sleep(1)
    t.check('after sign-in: tool shown at #tool', lib.visible_views(pg) == ['#toolView'] and pg.evaluate("location.hash") == '#tool', lib.visible_views(pg))
    t.check('tool canvas laid out', (pg.evaluate("(document.querySelector('#toolView canvas')||{}).clientWidth") or 0) > 100)
    for nav, want in [('#navDisc', '#discover'), ('#navDj', '#djView'), ('#navCrate', '#crateView')]:
        pg.click(nav); time.sleep(0.7)
        t.eq(f'signed in: {nav} → {want}', lib.visible_views(pg), [want])
    lib.sign_out(pg); time.sleep(0.8)
    t.eq('after sign-out: gated again', lib.visible_views(pg), ['#gateView'])
    pg.click('#top .mark'); time.sleep(0.5)
    t.check('brand → home', lib.visible_views(pg) == ['#aboutView'] and pg.evaluate("location.hash") in ('', '#'), pg.evaluate("location.hash"))
    t.eq('no CSP violations', lib.csp_violations(pg), [])
    ctx.close()

    t.section('layout matrix')
    for th, w, lang in [('light', 1440, 'he'), ('dark', 1440, 'en'), ('light', 375, 'ar'), ('dark', 375, 'he')]:
        ctx, pg = lib.page(b, srv, t, mock=True, w=w, h=800, theme=th, lang=lang)
        pg.goto(srv.url()); lib.wait_booted(pg); time.sleep(1)
        v = pg.evaluate("(()=>{const b=document.querySelector('#signUpBtn'),r=b.getBoundingClientRect(),i=document.querySelector('#signInBtn').getBoundingClientRect();return {up:!b.hidden&&r.width>0,inb:i.width>0,top:r.top,bg:getComputedStyle(b).backgroundColor,theme:document.documentElement.dataset.theme,dir:document.documentElement.dir}})()")
        t.check(f'{th} {w} {lang}: header sign-in + sign-up visible', v['up'] and v['inb'] and v['top'] < 80, v)
        t.eq(f'{th} {w} {lang}: theme + dir applied', [v['theme'], v['dir']], [th, 'ltr' if lang == 'en' else 'rtl'])
        t.eq(f'{th} {w} {lang}: home no h-scroll', lib.scroll_width(pg), w)
        t.shot(pg, f'home_{th}_{w}_{lang}', clip={'x': 0, 'y': 0, 'width': w, 'height': 110})
        pg.evaluate("location.hash='#crate'"); time.sleep(0.8)
        t.check(f'{th} {w} {lang}: gate shown, no h-scroll', lib.visible_views(pg) == ['#gateView'] and lib.scroll_width(pg) == w, lib.scroll_width(pg))
        t.shot(pg, f'gate_{th}_{w}_{lang}')
        ctx.close()
