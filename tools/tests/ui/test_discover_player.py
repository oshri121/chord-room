"""Discover (accounts off, /api/deezer mock, previews from fixtures): list renders, bottom player bar plays a
preview, next / pause / resume / volume (saved) / mute / previous / stop, fits at 375 px, hides when leaving."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, accounts=False, w=1300, h=800)
    pg.goto(srv.url('#discover')); pg.wait_for_selector('.drow .pv', timeout=30000); time.sleep(1)
    rows = pg.eval_on_selector_all('.drow', 'e=>e.length')
    t.eq('rows from the mock chart', rows, len(srv.tracks))
    t.check('Deezer attribution: cover links to the Deezer track', pg.evaluate("[...document.querySelectorAll('.drow a')].some(a=>/deezer\\.com\\/track\\//.test(a.href))"))
    st = lambda: pg.evaluate("({shown:!document.querySelector('#dPlayer').hidden,title:document.querySelector('#dPlayer .tt').textContent,cur:document.querySelector('#dPlayer .dpcur').textContent,pad:getComputedStyle(document.body).paddingBottom})")
    pg.click('.drow:nth-child(1) .pv')
    lib.poll(pg, "!document.querySelector('#dPlayer').hidden&&document.querySelector('#dPlayer .dpcur').textContent!=='0:00'", 10)
    s = st()
    t.check('player bar shown with track 1, time running', s['shown'] and 'Song 0' in s['title'], s)
    t.check('body padded for the bar', s['pad'] not in ('0px', ''), s['pad'])
    t.shot(pg, 'player')
    title_is = lambda x, to=20: lib.poll(pg, "x=>document.querySelector('#dPlayer .tt').textContent.includes(x)", to, arg=x)
    def wait_title(x):
        try: title_is(x)
        except TimeoutError: pass
    pg.click('#dPlayer [data-dp="next"]'); wait_title('Song 1')
    t.check('next → track 2', 'Song 1' in st()['title'], st()['title'])
    play_title = pg.get_attribute('#dPlayer [data-dp="play"]', 'title')
    pg.click('#dPlayer [data-dp="play"]')
    lib.poll(pg, "x=>document.querySelector('#dPlayer [data-dp=\"play\"]').title!==x", 10, arg=play_title)
    paused_title = pg.get_attribute('#dPlayer [data-dp="play"]', 'title')
    t.check('pause changes the button', paused_title != play_title, (play_title, paused_title))
    c0 = st()['cur']; time.sleep(1.5)
    t.eq('paused: time does not move', st()['cur'], c0)
    pg.click('#dPlayer [data-dp="play"]')
    try: lib.poll(pg, "x=>document.querySelector('#dPlayer .dpcur').textContent!==x", 15, arg=c0)
    except TimeoutError: pass
    t.check('resume: time moves again', st()['cur'] != c0, st()['cur'])
    pg.fill('#dPlayer .dpv', '30'); pg.dispatch_event('#dPlayer .dpv', 'input')
    t.check('volume saved', '0.3' in (pg.evaluate("localStorage.getItem('chordroom.dvol')") or ''), pg.evaluate("localStorage.getItem('chordroom.dvol')"))
    m0 = pg.get_attribute('#dPlayer [data-dp="mute"]', 'title')
    pg.click('#dPlayer [data-dp="mute"]'); time.sleep(0.2)
    t.check('mute toggles', pg.get_attribute('#dPlayer [data-dp="mute"]', 'title') != m0)
    lib.poll(pg, "(t=>+t.split(':')[1]>=4)(document.querySelector('#dPlayer .dpcur').textContent)", 10)
    pg.click('#dPlayer [data-dp="prev"]')
    lib.poll(pg, "/^0:0[0-2]$/.test(document.querySelector('#dPlayer .dpcur').textContent)", 5); time.sleep(0.6)   # let the seek settle
    t.check('previous after >3 s restarts the track', 'Song 1' in st()['title'] and st()['cur'] in ('0:00', '0:01', '0:02'), st())
    pg.click('#dPlayer [data-dp="prev"]'); wait_title('Song 0')
    t.check('previous again → track 1', 'Song 0' in st()['title'], st()['title'])
    pg.set_viewport_size({'width': 375, 'height': 800}); time.sleep(0.4)
    t.eq('375 px: no horizontal scroll', lib.scroll_width(pg), 375)
    t.shot(pg, 'player_375')
    pg.set_viewport_size({'width': 1300, 'height': 800})
    pg.click('#dPlayer [data-dp="stop"]'); time.sleep(0.3)
    t.check('stop hides the bar', pg.evaluate("document.querySelector('#dPlayer').hidden"))
    pg.click('.drow:nth-child(3) .pv'); time.sleep(1); pg.click('#navTool'); time.sleep(0.4)
    t.check('leaving Discover hides the bar', pg.evaluate("document.querySelector('#dPlayer').hidden"))
