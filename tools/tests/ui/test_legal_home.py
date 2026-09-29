"""Home (About) page content + legal pages: home mentions the Crate/rekordbox and never shows Camelot codes, terms
and privacy open from the footer, TOC keeps the hash, all five languages (ar = rtl), pricing has the legal links,
dark theme renders the legal page and the sign-up dialog steps."""
import os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=lib.auth_mock(), lang='he')
    pg.goto(srv.url()); lib.wait_booted(pg); time.sleep(0.5)
    pg.evaluate("document.querySelectorAll('.rv').forEach(x=>x.classList.add('in'))")
    txt = pg.inner_text('#aboutView')
    t.check('home mentions the Crate + rekordbox', 'ניתוח ספרייה' in txt and 'rekordbox' in txt)
    t.check('no Camelot codes (8A, 11B…) on home', not re.search(r'\b(1[0-2]|[1-9])[AB]\b', txt), re.findall(r'\b(?:1[0-2]|[1-9])[AB]\b', txt)[:5])
    t.check('no "Camelot" word on home', 'קאמלוט' not in txt and 'Camelot' not in txt)
    t.shot(pg, 'home_he', full_page=True)
    pg.click('.pg-legal a[href="#terms"]'); time.sleep(0.8)
    t.check('terms from the home footer', pg.is_visible('#legalView') and 'תנאי שימוש' in pg.inner_text('#lgH'), pg.inner_text('#lgH'))
    pg.click('.lg-toc a[data-sec="t-points"]'); time.sleep(0.5)
    t.eq('TOC click keeps the hash', pg.evaluate("location.hash"), '#terms')
    pg.click('.lg-tab[href="#privacy"]'); time.sleep(0.6)
    t.check('privacy tab', 'מדיניות פרטיות' in pg.inner_text('#lgH'))
    t.check('activity log retention (180 days) mentioned', '180' in pg.inner_text('#legalView'))
    for lang, want in [('en', 'Privacy Policy'), ('ar', None), ('ru', None), ('es', None)]:
        pg.select_option('#lang', lang); time.sleep(0.5)
        h = pg.inner_text('#lgH')
        t.check(f'privacy in {lang}', (want in h) if want else (h.strip() and 'מדיניות' not in h), h)
        t.eq(f'{lang}: dir', pg.evaluate("document.documentElement.dir"), 'rtl' if lang == 'ar' else 'ltr')
    pg.goto(srv.url('#terms')); lib.wait_booted(pg); time.sleep(0.8)
    t.check('es terms after reload (language remembered)', 'Términos' in pg.inner_text('#lgH'), pg.inner_text('#lgH'))
    pg.select_option('#lang', 'he'); time.sleep(0.4)
    pg.goto(srv.url('#pricing')); lib.wait_booted(pg); time.sleep(0.8)
    t.check('pricing page has the legal links', pg.is_visible('#pricingView .pg-legal'))

    t.section('dark')
    light = lib.page_luma(pg, '#pricingView')
    pg.evaluate("localStorage.setItem('chordroom.theme','dark')"); pg.goto(srv.url('#privacy')); lib.reload(pg); time.sleep(0.8)
    t.eq('dark theme applied from localStorage', pg.evaluate("document.documentElement.dataset.theme"), 'dark')
    dark = lib.page_luma(pg, '#legalView')
    t.check('dark: page background is dark (light was light)', dark < 60 and light > 200, (light, dark))
    t.shot(pg, 'legal_dark')
    pg.click('#signUpBtn'); time.sleep(0.6); t.shot(pg, 'dialog_dark_details')
    pg.fill('#upUser', 'zzz_q'); pg.fill('#upEmail', 'z@z.com'); pg.fill('#upPass', 'Zebra-Stripes-99'); pg.fill('#upPass2', 'Zebra-Stripes-99'); time.sleep(0.6)
    pg.click('#fUp .au-cta'); time.sleep(0.5)
    t.check('dark: terms step reached', pg.is_visible('#fTerms'))
    t.shot(pg, 'dialog_dark_terms')
