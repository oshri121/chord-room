"""Smoke: the site boots in local mode (accounts off) under the real CSP, the demo song is analysed, every view
opens from the nav and by hash, no page errors, no CSP violations."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, accounts=False, init=lib.CSP_INIT)
    pg.goto(srv.url('#tool'))
    lib.wait_tool_song(pg)
    t.check('demo song analysed (BPM + key shown)', pg.input_value('#sBpm') not in ('', '—'), pg.inner_text('#tname'))
    t.check('Backend is in local mode', pg.evaluate("Backend.enabled") is False)
    t.check('drums → MIDI export option present', pg.evaluate("!!document.querySelector('#x-xDrumsM')"))
    for nav, view in [('#navDisc', '#discover'), ('#navDj', '#djView'), ('#navCrate', '#crateView'), ('#navPricing', '#pricingView'),
                      ('#navAbout', '#aboutView'), ('#navTool', '#toolView')]:
        pg.click(nav); time.sleep(0.5)
        t.eq(f'nav {nav} → {view}', lib.visible_views(pg), [view])
    for h, view in [('crate', '#crateView'), ('dj', '#djView'), ('discover', '#discover'), ('pricing', '#pricingView'), ('terms', '#legalView'), ('privacy', '#legalView'), ('tool', '#toolView')]:
        pg.evaluate(f"location.hash='#{h}'"); time.sleep(0.5)
        t.eq(f'hash #{h} → {view}', lib.visible_views(pg), [view])
        if h == 'discover':
            t.check('Discover lists the /api/deezer mock tracks', lib.poll(pg, "document.querySelectorAll('.drow').length", 15))
    t.check('nav label for Crate (he)', pg.inner_text('#navCrate').strip() == 'ניתוח ספרייה', pg.inner_text('#navCrate'))
    t.eq('no CSP violations', lib.csp_violations(pg), [])
    t.shot(pg, 'tool')
