"""Last song: the tool reopens the last loaded song after a reload (IndexedDB audio + saved state) with its
transpose, in local mode (accounts off)."""
import os, sys, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

@lib.main
def test(t, srv, b):
    ctx, pg = lib.page(b, srv, t, accounts=False)
    pg.goto(srv.url('#tool'))
    lib.wait_tool_song(pg)
    t.check('boots with the demo song', 'דוגמה' in pg.inner_text('#tname'), pg.inner_text('#tname'))
    pg.set_input_files('#file', lib.fixture('p0.mp3'))
    lib.wait_tool_song(pg, 'p0')
    bpm = pg.input_value('#sBpm')
    t.check('uploaded p0.mp3 analysed', bpm not in ('', '—'), f"{pg.inner_text('#tname')} {bpm} BPM")
    pg.click('#trP'); time.sleep(0.8)
    t.eq('transpose +1', pg.inner_text('#trV'), '+1')
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))"); time.sleep(0.5)
    pg.reload()
    lib.wait_tool_song(pg, 'p0')
    t.check('after reload: same song reopened', pg.inner_text('#tname').startswith('p0'), pg.inner_text('#tname'))
    t.eq('after reload: same BPM', pg.input_value('#sBpm'), bpm)
    t.eq('after reload: transpose kept', pg.inner_text('#trV'), '+1')
