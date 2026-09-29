"""Mobile (375 px, touch) in he / en / ar: home and header fit (no horizontal scroll, both header buttons), the
sign-up dialog is a full-width sheet through details → terms → code, the terms page fits; he also opens the terms
TOC and the nav drawer."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    for lang in ['he', 'en', 'ar']:
        t.section(lang)
        ctx, pg = lib.page(b, srv, t, mock=lib.auth_mock(), w=375, h=780, mobile=True, lang=lang)
        pg.goto(srv.url()); lib.wait_booted(pg); time.sleep(0.5)
        pg.evaluate("document.querySelectorAll('.rv').forEach(x=>x.classList.add('in'))")
        t.eq(f'{lang} home: no h-scroll', lib.scroll_width(pg), 375)
        t.check(f'{lang}: both header buttons visible', pg.is_visible('#signInBtn') and pg.is_visible('#signUpBtn'))
        t.shot(pg, f'hdr_{lang}', clip={'x': 0, 'y': 0, 'width': 375, 'height': 70})
        pg.click('#signUpBtn'); time.sleep(0.6)
        t.eq(f'{lang} dialog: no h-scroll', lib.scroll_width(pg), 375)
        t.eq(f'{lang}: full-width sheet', pg.evaluate("Math.round(document.getElementById('authBox').getBoundingClientRect().width)"), 375)
        pg.fill('#upUser', 'mob_user'); pg.fill('#upEmail', 'm@x.com'); pg.fill('#upPass', 'Mobile-Pass-77'); pg.fill('#upPass2', 'Mobile-Pass-77'); time.sleep(0.6)
        pg.click('#fUp .au-cta'); time.sleep(0.5)
        t.check(f'{lang}: terms step', pg.is_visible('#fTerms'))
        pg.click('label.au-chk:has(#auAgree)'); pg.click('label.au-chk:has(#auAge)'); pg.click('#auCreate'); time.sleep(0.8)
        t.check(f'{lang}: code step, no h-scroll', pg.is_visible('#fCode') and lib.scroll_width(pg) == 375)
        t.shot(pg, f'code_{lang}')
        pg.click('#authClose'); time.sleep(0.3)
        pg.goto(srv.url('#terms')); lib.wait_booted(pg); time.sleep(0.8)
        t.eq(f'{lang} terms page: no h-scroll', lib.scroll_width(pg), 375)
        if lang == 'he':
            pg.click('.lg-toc summary'); time.sleep(0.3)
            t.check('he: TOC opens', pg.evaluate("document.querySelector('.lg-toc details').open"))
            pg.goto(srv.url('#tool')); lib.wait_booted(pg); time.sleep(0.5)
            t.eq('he tool (gate): no h-scroll', lib.scroll_width(pg), 375)
            pg.click('#navBurger'); time.sleep(0.6)
            t.check('he: nav drawer opens', pg.evaluate("document.querySelector('#navBurger').getAttribute('aria-expanded')") == 'true', pg.get_attribute('#navBurger', 'aria-expanded'))
            t.shot(pg, 'drawer_he')
        ctx.close()
