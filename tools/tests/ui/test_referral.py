"""Invite a friend (mock backend): ?ref=CODE is stored, claimed once after sign-up (then forgotten), the points
chip updates, the invite box (account) and card (pricing) show the invite URL; pricing card in en / ar + dark."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

EXTRA = r'''(()=>{const B=window.__MOCK_BACKEND;const cred={};const led={};
B.credits=async()=>({credits:cred[B.user.id]??20,plan:'free',plan_until:null,last_refill:null});
B.ledger=async()=>led[B.user.id]||[];
B.myReferral=async()=>({code:'abc12345',invited:2,earned:20});
B.claimReferral=async c=>{window.__claimed=c;cred[B.user.id]=30;led[B.user.id]=[{id:2,delta:10,balance:30,reason:'referral',ref:'ref:joined:x',created_at:new Date().toISOString()},{id:1,delta:20,balance:20,reason:'signup',ref:null,created_at:new Date().toISOString()}];return {ok:true,points:10,balance:30}};
})();'''

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=lib.mock_js(EXTRA))
    pg.goto(srv.url('?ref=ABC12345')); lib.wait_booted(pg)
    raw = pg.evaluate("localStorage.getItem('chordroom.ref')") or ''
    t.check('ref code stored ({c, t} JSON)', 'abc12345' in raw.lower(), raw)
    t.check('?ref removed from the URL', 'ref=' not in pg.url, pg.url)
    lib.sign_up(pg, 'newbie', 'n@x.com')
    lib.poll(pg, "window.__claimed", 10)
    t.check('claimed after sign-up', (pg.evaluate("window.__claimed") or '').lower() == 'abc12345')
    t.check('stored code forgotten after the claim', pg.evaluate("localStorage.getItem('chordroom.ref')") is None)
    lib.poll(pg, "document.querySelector('#creditsN')&&document.querySelector('#creditsN').textContent.includes('30')", 10)
    t.check('points chip shows the new balance', '30' in pg.inner_text('#creditsN'), pg.inner_text('#creditsN'))
    t.check('invite box in the account box', pg.evaluate("!!document.querySelector('#refBox')&&!document.querySelector('#refBox').hidden"))
    url = pg.evaluate("document.querySelector('#refBox .refurl').value")
    t.check('invite URL carries the code', 'ref=abc12345' in url, url)
    pg.evaluate("location.hash='#pricing'"); time.sleep(1)
    card = pg.query_selector('.refcard')
    t.check('invite card on the pricing page', card is not None and card.is_visible())
    card.scroll_into_view_if_needed(); t.shot(pg, 'pricing_he')
    pg.select_option('#lang', 'en'); time.sleep(0.5)
    t.check('en: card text', 'invite' in pg.inner_text('#refCard').lower(), pg.inner_text('#refCard')[:120])
    t.check('en: stats (2 invited)', '2' in pg.inner_text('#refCard .refst'), pg.inner_text('#refCard .refst'))
    pg.evaluate("document.documentElement.dataset.theme='dark'"); pg.select_option('#lang', 'ar'); time.sleep(0.5)
    t.eq('ar: page is rtl', pg.evaluate("document.documentElement.dir"), 'rtl')
    t.eq('ar dark: no horizontal scroll', lib.scroll_width(pg), 1300)
    pg.query_selector('.refcard').scroll_into_view_if_needed(); t.shot(pg, 'pricing_ar_dark')
