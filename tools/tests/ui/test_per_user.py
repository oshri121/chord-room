"""Per-account data (mock backend): the sign-in gate on the tools, Crate rows stored per account, the remembered
tool song is only shown to its account, and the admin Activity tab lists logged actions."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, mock=True)
    pg.goto(srv.url('#crate')); lib.wait_booted(pg)
    n = lambda: pg.evaluate("CRATE._C.rows.length")
    t.eq('guest sees the gate instead of the Crate', lib.visible_views(pg), ['#gateView'])
    lib.sign_up(pg, 'oshri', 'o@x.com')
    t.eq('signed in → Crate view', lib.visible_views(pg), ['#crateView'])
    pg.set_input_files('#crIn', [lib.fixture('p0.mp3')])
    lib.poll(pg, "CRATE._C.rows.length===1&&CRATE._C.rows.every(r=>r.st==='ok'||r.st==='err')", 60)
    t.check('A: row analysed, key badge shown', pg.evaluate("CRATE._C.rows[0].st") == 'ok' and pg.inner_text('#crBody .kb').strip() != '', pg.inner_text('#crBody .kb'))
    t.eq('Crate owner = account id', pg.evaluate("CRATE._C.owner"), 'u2')
    pg.set_input_files('#crIn', [lib.fixture('p1.mp3')])
    lib.poll(pg, "CRATE._C.rows.length===2&&CRATE._C.rows.every(r=>r.st==='ok')", 60); time.sleep(0.5)
    lib.sign_out(pg)
    t.eq('signed out → gate', lib.visible_views(pg), ['#gateView'])
    lib.sign_up(pg, 'dana2', 'd2@x.com')
    t.eq('account B starts with an empty Crate', n(), 0)
    lib.sign_out(pg)
    lib.sign_in(pg, 'o@x.com', 'password9')
    t.eq('account A gets its 2 rows back', n(), 2)
    t.check('stored under chordroom.crate.v1:u2', pg.evaluate("!!localStorage.getItem('chordroom.crate.v1:u2')"))

    t.section('tool song per account')
    pg.evaluate("location.hash='#tool'"); time.sleep(0.5)
    pg.set_input_files('#file', lib.fixture('p2.mp3'))
    lib.wait_tool_song(pg, 'p2')
    lib.sign_out(pg); time.sleep(1)
    lib.poll(pg, "document.querySelector('#busy').hidden", 30); time.sleep(0.5)
    t.check("after sign-out the tool stays open (guest demo) but A's song is gone", lib.visible_views(pg) == ['#toolView'] and not pg.inner_text('#tname').startswith('p2') and not pg.evaluate("document.querySelector('#guestBar').hidden"), (lib.visible_views(pg), pg.inner_text('#tname')[:40]))
    lib.sign_in(pg, 'dana@example.com', 'password1')
    lib.poll(pg, "document.querySelector('#busy').hidden", 30); time.sleep(1.5)
    t.check("other account doesn't see A's song", not pg.inner_text('#tname').startswith('p2'), pg.inner_text('#tname')[:40])
    lib.sign_out(pg)
    lib.sign_in(pg, 'o@x.com', 'password9')
    try: lib.wait_tool_song(pg, 'p2', 30)
    except TimeoutError: pass
    t.check('A signs in again → its song is back', pg.inner_text('#tname').startswith('p2'), pg.inner_text('#tname')[:40])

    t.section('admin activity')
    pg.evaluate("document.querySelector('#adminBtn').click()"); time.sleep(0.8)
    pg.click('#admTabs button[data-v="activity"]'); time.sleep(0.8)
    rows = pg.eval_on_selector_all('#aBody tr', 'e=>e.map(x=>x.innerText.replace(/\\s+/g," "))')
    t.check('activity tab has rows', len(rows) > 3, rows[:4])
    acts = {x['action'] for x in pg.evaluate("window.__log||[]")}
    for a in ['sign_in', 'view', 'crate_analyze', 'song_upload']:
        t.check(f'logged action {a}', a in acts, sorted(acts))
    t.shot(pg, 'admin_activity')
