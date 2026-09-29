"""First-visit language picker: shown when no language is saved (navigator.webdriver faked to false), suggests the
browser language and focuses it, picking Arabic switches to rtl and is remembered; not shown again after reload."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

NOT_WEBDRIVER = "Object.defineProperty(navigator,'webdriver',{get:()=>false})"

@lib.main
def test(t, srv, b):
    for w, h, loc, want in [(1300, 850, 'en-US', 'en'), (375, 760, 'ru-RU', 'ru')]:
        t.section(f'{w}px {loc}')
        ctx, pg = lib.page(b, srv, t, w=w, h=h, locale=loc, init=NOT_WEBDRIVER, mock=True)
        pg.goto(srv.url()); lib.wait_booted(pg)
        lib.poll(pg, "!!document.querySelector('#welcomeLang')&&!document.querySelector('#welcomeLang').hidden", 10)
        t.check('picker shown', pg.is_visible('#welcomeLang'))
        t.eq('suggested language', pg.get_attribute('.wlb.sug', 'data-l'), want)
        t.eq('suggested button focused', pg.evaluate("document.activeElement.dataset.l"), want)
        t.eq('fits the width', lib.scroll_width(pg), w)
        t.shot(pg, f'welcome_{w}')
        pg.click('.wlb[data-l="ar"]'); time.sleep(0.5)
        t.check('after pick: ar + rtl + stored + closed', pg.evaluate("[document.documentElement.lang,document.documentElement.dir,localStorage.getItem('chordroom.lang')]") == ['ar', 'rtl', 'ar'] and not pg.is_visible('#welcomeLang'),
                pg.evaluate("[document.documentElement.lang,document.documentElement.dir,localStorage.getItem('chordroom.lang')]"))
        lib.reload(pg); time.sleep(1)
        t.check('not shown again after reload', not pg.is_visible('#welcomeLang'))
        ctx.close()
    t.section('tests (navigator.webdriver) skip it')
    ctx, pg = lib.page(b, srv, t, mock=True)
    pg.goto(srv.url()); lib.wait_booted(pg); time.sleep(1)
    t.check('no picker under webdriver', not pg.is_visible('#welcomeLang'))
