"""Invite a friend (mock backend, referral v6): ?ref=CODE is stored, claimed once after sign-up (then forgotten); the claim
only records a pending invite (no points for the friend: the chip keeps the normal sign-up balance); the code is remembered
on this device (chordroom.refdone.v1) so a second account in the same browser does not claim it again and sees the
"already used on this device" message (also when the server answers why:'device'); the invite box (account) and card
(pricing) show the invite URL and the paid-plan rule; pricing card in en / ar + dark."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

EXTRA = r'''(()=>{const B=window.__MOCK_BACKEND;const cred={};const led={};
B.credits=async()=>({credits:cred[B.user.id]??20,plan:'free',plan_until:null,last_refill:null});
B.ledger=async()=>led[B.user.id]||[];
B.myReferral=async()=>({code:'abc12345',invited:2,joined:2,paid:1,pending:1,earned:15});
window.__claims=0;
B.claimReferral=async c=>{window.__claimed=c;window.__claims++;if(window.__claimAnswer)return window.__claimAnswer;return {ok:true,pending:true,points:0,balance:20,inviter_paid:false}};
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
    lib.poll(pg, "document.querySelector('#creditsN')&&document.querySelector('#creditsN').textContent.trim()!==''", 10)
    t.eq('no invite bonus: the chip keeps the sign-up balance', pg.inner_text('#creditsN').strip(), '20')
    t.eq('the code is remembered on this device', pg.evaluate("JSON.parse(localStorage.getItem('chordroom.refdone.v1')||'[]')"), ['abc12345'])
    t.check('invite box in the account box', pg.evaluate("!!document.querySelector('#refBox')&&!document.querySelector('#refBox').hidden"))
    t.check('he: the box says points come when the friend joins a paid plan', 'מסלול בתשלום' in pg.inner_text('#refBox'), pg.inner_text('#refBox')[:160])
    url = pg.evaluate("document.querySelector('#refBox .refurl').value")
    t.check('invite URL carries the code', 'ref=abc12345' in url, url)
    pg.evaluate("location.hash='#pricing'"); time.sleep(1)
    card = pg.query_selector('.refcard')
    t.check('invite card on the pricing page', card is not None and card.is_visible())
    card.scroll_into_view_if_needed(); t.shot(pg, 'pricing_he')
    pg.select_option('#lang', 'en'); time.sleep(0.5)
    t.check('en: card text', 'invite' in pg.inner_text('#refCard').lower(), pg.inner_text('#refCard')[:120])
    t.check('en: card text names the paid plan', 'paid plan' in pg.inner_text('#refCard'), pg.inner_text('#refCard')[:160])
    t.check('en: stats (2 joined, 1 paid, 15 points)', all(x in pg.inner_text('#refCard .refst') for x in ('2 joined', '1 joined a paid plan', '15 points')), pg.inner_text('#refCard .refst'))
    pg.evaluate("document.documentElement.dataset.theme='dark'"); pg.select_option('#lang', 'ar'); time.sleep(0.5)
    t.eq('ar: page is rtl', pg.evaluate("document.documentElement.dir"), 'rtl')
    t.eq('ar dark: no horizontal scroll', lib.scroll_width(pg), 1300)
    pg.query_selector('.refcard').scroll_into_view_if_needed(); t.shot(pg, 'pricing_ar_dark')
    pg.select_option('#lang', 'he'); time.sleep(0.3)

    # the same browser, another account, the same invite link → no claim, a message instead
    lib.sign_out(pg); time.sleep(0.5)
    pg.goto(srv.url('?ref=abc12345')); lib.wait_booted(pg)
    n0 = pg.evaluate("window.__claims||0")
    lib.sign_up(pg, 'second', 's2@x.com')
    lib.poll(pg, "[...document.querySelectorAll('.toast,#toast,[role=status]')].some(e=>/המכשיר הזה/.test(e.textContent))", 10)
    t.check('second account in this browser: the device message', pg.evaluate("[...document.querySelectorAll('.toast,#toast,[role=status]')].some(e=>/המכשיר הזה/.test(e.textContent))"))
    t.eq('…and claim_referral was not called', pg.evaluate("window.__claims||0"), n0)
    t.check('…the stored code is dropped', pg.evaluate("localStorage.getItem('chordroom.ref')") is None)

    # the server says 'device' (another browser on the same network) → the same message, code remembered
    lib.sign_out(pg); time.sleep(0.5)
    pg.evaluate("localStorage.removeItem('chordroom.refdone.v1')")
    pg.goto(srv.url('?ref=zzz98765')); lib.wait_booted(pg)
    pg.evaluate("window.__claimAnswer={ok:false,why:'device'}")   # after the reload (the mock script runs again)
    lib.sign_up(pg, 'third', 's3@x.com')
    lib.poll(pg, "window.__claimed==='zzz98765'", 10)
    lib.poll(pg, "[...document.querySelectorAll('.toast,#toast,[role=status]')].some(e=>/המכשיר הזה/.test(e.textContent))", 10)
    t.check("server why:'device' → the device message", pg.evaluate("[...document.querySelectorAll('.toast,#toast,[role=status]')].some(e=>/המכשיר הזה/.test(e.textContent))"))
    t.eq('…the code is remembered on this device', pg.evaluate("JSON.parse(localStorage.getItem('chordroom.refdone.v1')||'[]')"), ['zzz98765'])
