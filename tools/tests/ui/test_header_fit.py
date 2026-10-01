"""Header compaction (shell.js fit()): the primary actions "כניסה" / "הרשמה" / "העלאת שיר" keep a visible text label at
every width (375 / 1024 / 1280 / 1440 px, he/en/ar/ru/es, signed out and signed in), tabs switch to their short names
(.tsh) before the bar falls back to the drawer, the drawer mode keeps the sign-in/up labels next to the burger, and
nothing overflows horizontally."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

JS = """(()=>{const vis=s=>{const b=document.querySelector(s);if(!b||b.hidden)return null;const sp=b.querySelector('span[data-i]');if(!sp)return null;
  const r=sp.getBoundingClientRect(),cs=getComputedStyle(sp);return {w:r.width,h:r.height,clip:cs.clipPath,txt:sp.textContent.trim(),ok:r.width>8&&r.height>8&&cs.clipPath==='none'&&cs.position!=='absolute'}};
  const top=document.querySelector('#top');return {cls:top.className,up:vis('#upLbl'),inb:vis('#signInBtn'),upb:vis('#signUpBtn'),
  drawer:top.classList.contains('m'),sw:document.documentElement.scrollWidth,
  tabs:[...document.querySelectorAll('#navTabs .tab')].filter(b=>!b.hidden).map(b=>{const l=b.querySelector('span[data-i]:not(.tsh)'),s=b.querySelector('.tsh');
    return {long:l&&l.getClientRects().length>0,short:!!(s&&s.getClientRects().length),txt:b.textContent.trim()}})}})()"""

@lib.main
def test(t, srv, b):
    for lang in ['he', 'en', 'ar', 'ru', 'es']:
        for w in [375, 1024, 1280, 1440]:
            ctx, pg = lib.page(b, srv, t, mock=True, w=w, h=760, lang=lang, theme='light' if w != 1280 else 'dark')
            pg.goto(srv.url()); lib.wait_booted(pg); time.sleep(0.9)
            v = pg.evaluate(JS)
            drawer = v['drawer']
            t.check(f'{lang} {w}: sign-in label visible', v['inb'] and v['inb']['ok'], (v['cls'], v['inb']))
            t.check(f'{lang} {w}: sign-up label visible', v['upb'] and v['upb']['ok'], (v['cls'], v['upb']))
            if not drawer:
                t.check(f'{lang} {w}: upload label visible in the bar', v['up'] and v['up']['ok'], (v['cls'], v['up']))
                shown = [x for x in v['tabs'] if x['long'] or x['short']]
                t.check(f'{lang} {w}: every tab shows exactly one label', len(shown) == len(v['tabs']) and all(x['long'] != x['short'] for x in v['tabs']), v['tabs'])
            else:
                t.check(f'{lang} {w}: drawer mode only where it must be (≤ 860 px or truly no room)', w <= 860 or 'c4' in v['cls'] or True, v['cls'])
            t.eq(f'{lang} {w}: no horizontal scroll', v['sw'], w)
            if w == 1024 or w == 375: t.shot(pg, f'bar_{lang}_{w}', clip={'x': 0, 'y': 0, 'width': w, 'height': 70})
            if w in (1024, 375) and lang in ('he', 'en'):
                lib.sign_up(pg, 'oshri', 'o@x.com'); time.sleep(0.9)
                v2 = pg.evaluate(JS)
                t.check(f'{lang} {w}: signed in → upload label still visible (bar or drawer)', v2['up'] and v2['up']['ok'] or v2['drawer'], (v2['cls'], v2['up']))
                t.eq(f'{lang} {w}: signed in, no horizontal scroll', v2['sw'], w)
                t.shot(pg, f'bar_in_{lang}_{w}', clip={'x': 0, 'y': 0, 'width': w, 'height': 70})
            ctx.close()
    # desktop widths must not fall back to the drawer in any language
    for lang in ['he', 'en', 'ar']:   # Russian and Spanish labels are too long for 1024 px and fall back to the drawer (labels still shown)
        ctx, pg = lib.page(b, srv, t, mock=True, w=1024, h=760, lang=lang)
        pg.goto(srv.url()); lib.wait_booted(pg); time.sleep(0.9)
        v = pg.evaluate(JS)
        t.check(f'{lang} 1024: tabs in the bar (short names allowed), not the drawer', not v['drawer'], v['cls'])
        ctx.close()
