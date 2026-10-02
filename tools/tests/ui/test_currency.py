"""Pricing currency: Hebrew shows shekels (₪), every other language shows dollars ($) converted with billing.usd_rate
(default 3.7) — no shekel sign and no "≈" chip outside Hebrew."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    for lang in ['he', 'en', 'ar', 'ru', 'es']:
        ctx, pg = lib.page(b, srv, t, mock=True, lang=lang)
        pg.goto(srv.url('#pricing')); pg.wait_for_selector('#pricingView .pg-price', timeout=20000)
        prices = pg.eval_on_selector_all('#pricingView .pg-pw .pg-price', 'e=>e.map(x=>x.textContent.trim())')
        txt = ' '.join(prices)
        if lang == 'he':
            t.check('he: shekel prices', '₪' in txt and '$' not in txt, prices)
        else:
            t.check(f'{lang}: dollar prices, no shekel', '$' in txt and 'US$' not in txt and '₪' not in txt and 'ILS' not in txt, prices)
            t.check(f'{lang}: no ≈ chip', pg.locator('#pricingView .pg-usd').count() == 0)
            t.check(f'{lang}: 29 ₪ → $8 (rate 3.7)', any('8' in p for p in prices), prices)
        ctx.close()
    t.page_errors()
