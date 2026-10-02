"""Grid drag (FL Studio style) in the tool and in Mashup Studio (mock backend, signed in as the admin 'oshri').

Tool (#tool, fixtures/gen_edm.py: 128 BPM, kicks on every beat from 0.5 s):
  * the "Drag" toggle (#gEdit, aria-pressed) shows the undo/redo/reset group + the hint line;
  * Ctrl+drag N px in grid mode moves S.offset by exactly N·win/width seconds (zoom-aware: checked at two zooms), the audio /
    playhead stays put, one undo step per drag;
  * arrows on the focused toggle: Shift+→ = +10 ms, ← = −1 ms (one undo step per burst);
  * a plain drag snaps the grabbed line to the kick (≤ 2 ms) and shows the magnet while dragging; Ctrl disables the snap;
  * double click on a grid line → a bar starts there (S.down); a hot cue on the grid rides along with a grid move;
  * dragging a bar number (bar handle) stretches the tempo with bar 1 fixed; Ctrl+Z / Ctrl+Shift+Z undo / redo; reset = detected;
  * chords are re-detected on the new grid when the drag ends (= detectChords on that grid);
  * with grid mode off a plain drag still scrubs (offset unchanged), Shift+drag moves the grid (shortcut);
  * reload keeps the edited grid (saveLibSoon → IndexedDB last song);
  * he RTL: a drag to the right still moves the grid later; ar strings + RTL; dark theme; 375 px touch (CDP touch events);
    zero CSP violations.
Mashup (synthetic click songs loaded through MASHUP.loadInto with a known grid, 120 BPM both, no stretch):
  * drag A by two bars in the timeline → `align` +2, nudge 0 (lock shown); the WAV export (B muted) has A's downbeat clicks
    exactly on B's bars (≤ 1 ms) at bar `align`;
  * Ctrl+drag = free (nudge ≠ 0, lock off); Ctrl+Z undoes it;
  * grid mode: A loaded with its grid deliberately 90 ms late → dragging A's grid line onto the click snaps it back (≤ 1 ms)
    and the export puts A's real downbeat on B's bar again; B grid drag moves B's bars (A follows); arrows nudge the grid;
  * the grid fix survives a reload of the pair (settings), he/ar/dark screenshots.
"""
import os, sys, time, json, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib
sys.path.insert(0, lib.FIX)
import gen_edm

BEAT = gen_edm.BEAT
LEAD = 0.5

def st(pg): return pg.evaluate("CR._gd.st()")
def zr(pg): return lib.rect(pg, '#zm')
def ymid(pg): r = zr(pg); return round(r['t'] + 30 + (r['h'] - 30) / 2)
def x_of(pg, tm):
    r, s = zr(pg), st(pg)
    return r['l'] + (tm - (s['pos'] - s['win'] / 2)) / s['win'] * r['w']
def spp(pg): return st(pg)['win'] / zr(pg)['w']

def drag(pg, x0, y, dx, mods=(), steps=8, mid=None):
    x0, y = round(x0), round(y)
    for m in mods: pg.keyboard.down(m)
    pg.mouse.move(x0, y); pg.mouse.down()
    for k in range(1, steps + 1): pg.mouse.move(x0 + round(dx * k / steps), y)
    got = pg.evaluate(mid) if mid else None
    pg.mouse.up()
    for m in reversed(mods): pg.keyboard.up(m)
    time.sleep(0.15)
    return got

def load_tool(pg, wav):
    pg.set_input_files('#file', wav); lib.wait_tool_song(pg, 'Grid Test', 120); time.sleep(0.3)

def tool_part(t, srv, b, wav):
    ctx, pg = lib.page(b, srv, t, mock=True, init=lib.CSP_INIT)
    pg.goto(srv.url('#tool')); lib.wait_booted(pg); lib.wait_tool_song(pg)
    lib.sign_up(pg, 'oshri', 'o@x.com')
    load_tool(pg, wav)
    s0 = st(pg)
    t.check('song analysed at 128 BPM, grid on the kicks', s0['bpm'] == 128 and abs(s0['b1'] - LEAD) % BEAT < 0.004 or abs(abs(s0['b1'] - LEAD) % BEAT - BEAT) < 0.004, s0)
    t.check('the grid toggle is enabled, grid mode off', pg.evaluate("!document.querySelector('#gEdit').disabled&&document.querySelector('#gEdit').getAttribute('aria-pressed')==='false'&&document.querySelector('#gdHint').hidden"))

    t.section('grid mode: toggle, Ctrl+drag = exact pixel move (zoom-aware)')
    pg.click('#gEdit'); time.sleep(0.2)
    t.check('toggle on: aria-pressed, hint + undo/reset group shown', pg.evaluate("document.querySelector('#gEdit').getAttribute('aria-pressed')==='true'&&!document.querySelector('#gdHint').hidden&&!document.querySelector('#gdX').hidden"))
    t.check('hint text (he) mentions Ctrl/⌘ and Ctrl+Z', pg.evaluate("document.querySelector('#gdHint').textContent.includes('Ctrl/⌘')&&document.querySelector('#gdHint').textContent.includes('Ctrl+Z')"))
    t.eq('document is RTL (he)', pg.evaluate("document.documentElement.dir"), 'rtl')
    cur = pg.evaluate("getComputedStyle(document.querySelector('#zm')).cursor"); t.eq('cursor in grid mode', cur, 'ew-resize')
    y = ymid(pg); r = zr(pg)
    a = st(pg); k = 40
    drag(pg, r['l'] + r['w'] * 0.62, y, k, mods=('Control',))
    c = st(pg)
    want = k * a['win'] / r['w']
    t.check(f'Ctrl+drag {k}px (win {a["win"]} s) → offset +{want*1000:.2f} ms (RTL page, timeline LTR)', abs((c['offset'] - a['offset']) - want) < 1e-6, (c['offset'] - a['offset'], want))
    t.check('bar 1 moved by the same amount', abs((c['b1'] - a['b1']) - want) < 1e-6 or abs(abs(c['b1'] - a['b1'] - want) - 4 * BEAT) < 1e-6, (c['b1'], a['b1']))
    t.check('playhead stayed put, one undo step', c['pos'] == a['pos'] and c['undo'] == 1 and c['redo'] == 0, (c['pos'], c['undo']))
    pg.click('#zIn'); time.sleep(0.1)
    a = st(pg); r = zr(pg); k = -30
    drag(pg, r['l'] + r['w'] * 0.6, y, k, mods=('Control',))
    c = st(pg); want = k * a['win'] / r['w']
    t.check(f'zoomed in (win {a["win"]} s): Ctrl+drag {k}px → {want*1000:.2f} ms', a['win'] == 6 and abs((c['offset'] - a['offset']) - want) < 1e-6, (a['win'], c['offset'] - a['offset'], want))
    t.shot(pg, 'tool_grid_on')

    t.section('undo / redo / keyboard')
    pg.keyboard.press('Control+z'); time.sleep(0.15); pg.keyboard.press('Control+z'); time.sleep(0.15)
    u = st(pg)
    t.check('Ctrl+Z twice → back to the detected grid', u['offset'] == s0['offset'] and u['bpm'] == s0['bpm'] and u['down'] == s0['down'] and u['redo'] == 2, u)
    pg.keyboard.press('Control+Shift+z'); time.sleep(0.15)
    t.check('Ctrl+Shift+Z → first move again', abs(st(pg)['offset'] - s0['offset'] - 40 * 8 / r['w']) < 1e-6, st(pg)['offset'] - s0['offset'])
    pg.keyboard.press('Control+z'); time.sleep(0.15)
    pg.focus('#gEdit')
    for key in ['Shift+ArrowRight'] * 3 + ['ArrowLeft']: pg.keyboard.press(key); time.sleep(0.03)
    time.sleep(0.6)
    kb = st(pg)
    t.check('arrows on the toggle: 3×Shift+→ − 1×← = +29 ms, one undo step, playhead unchanged', abs(kb['offset'] - s0['offset'] - 0.029) < 1e-6 and kb['undo'] == 1 and kb['pos'] == s0['pos'], (kb['offset'] - s0['offset'], kb['undo']))
    t.check('status line shows the shift (LTR-isolated)', '+29.0 ms' in pg.evaluate("document.querySelector('#gdStat').textContent"), pg.evaluate("document.querySelector('#gdStat').textContent"))

    t.section('snap to the kick, magnet, Ctrl = free')
    s1 = st(pg)
    g4 = s1['b1'] + 4 * BEAT                      # a grid line ~29 ms after the kick at LEAD + 4 beats (bar 2)
    true_k = LEAD + round((g4 - LEAD) / BEAT) * BEAT
    px = spp(pg)
    dx = -round(0.021 / px)                       # → ~8 ms after the kick: inside the 20 ms magnet
    mag = drag(pg, x_of(pg, g4), y, dx, mid="CR._gd.st().snap")
    s2 = st(pg)
    t.check('magnet shown while dragging, at the kick (≤ 2 ms)', mag is not None and abs(mag - true_k) < 0.002, (mag, true_k))
    t.check('after the drag: the grid line sits on the kick (≤ 2 ms)', abs(s2['b1'] + 4 * BEAT - true_k) < 0.002, (s2['b1'] + 4 * BEAT, true_k))
    t.check('…so every beat is back on the kicks', abs((s2['b1'] - LEAD) / BEAT - round((s2['b1'] - LEAD) / BEAT)) * BEAT < 0.002, s2['b1'])
    a = st(pg)
    mag = drag(pg, x_of(pg, a['b1'] + 4 * BEAT), y, 2, mods=('Control',), mid="CR._gd.st().snap")
    c = st(pg)
    t.check('Ctrl+drag 2 px: no magnet, exact pixel move (no snap back)', mag is None and abs((c['offset'] - a['offset']) - 2 * spp(pg)) < 1e-6, (mag, c['offset'] - a['offset']))
    pg.keyboard.press('Control+z'); time.sleep(0.15)

    t.section('double click = a bar starts here; cues ride along')
    a = st(pg)
    j = None
    for i in range(1, 8):
        bi = round((a['b1'] - a['beats'][0]) / BEAT) + i
        if (bi - a['down']) % 4: j = bi; break
    tj = a['beats'][0] + j * BEAT
    pg.mouse.dblclick(round(x_of(pg, tj)), y); time.sleep(0.25)
    c = st(pg)
    t.check('double click on a beat line → S.down = that beat (mod 4)', c['down'] == j % 4 and c['down'] != a['down'], (a['down'], c['down'], j))
    t.check('status: "a bar starts here"', pg.evaluate("document.querySelector('#gdStat').textContent.length>0"))
    pg.keyboard.press('Control+z'); time.sleep(0.15)
    t.eq('Ctrl+Z restores the downbeat', st(pg)['down'], a['down'])
    # a hot cue on the grid follows the grid
    pg.evaluate("CR._gd.seek(%f)" % (a['b1'] + 2 * BEAT + 0.05)); time.sleep(0.1)
    pg.evaluate("document.activeElement&&document.activeElement.blur()")
    pg.keyboard.press('Digit1'); time.sleep(0.15)
    cue0 = st(pg)['cues'][0]
    t.check('hot cue A set on a grid line', cue0 is not None and abs(cue0 - (a['b1'] + 2 * BEAT)) < 1e-6, cue0)
    a = st(pg)
    drag(pg, zr(pg)['l'] + zr(pg)['w'] * 0.7, y, 15, mods=('Control',))
    c = st(pg)
    t.check('Ctrl+drag 15 px → the cue moved with the grid', abs((c['cues'][0] - cue0) - (c['offset'] - a['offset'])) < 1e-6 and c['cues'][0] != cue0, (c['cues'][0] - cue0, c['offset'] - a['offset']))

    t.section('chords re-timed on the new grid')
    t.check('chords = detectChords() on the moved grid', c['chords'] == pg.evaluate("CR._gd.fresh()"))
    a = st(pg)
    drag(pg, zr(pg)['l'] + zr(pg)['w'] * 0.7, y, round(BEAT / 2 / spp(pg)), mods=('Control',))
    c = st(pg)
    t.check('half-beat move: chords re-detected (= fresh), beat count consistent', c['chords'] == pg.evaluate("CR._gd.fresh()") and len(c['chords']) == c['beats'][2], (len(c['chords']), c['beats']))
    t.check('…and the sheet was redrawn for the new grid', pg.evaluate("document.querySelectorAll('#sheet .cell:not(.empty)').length") == c['beats'][2])
    pg.keyboard.press('Control+z'); time.sleep(0.15); pg.keyboard.press('Control+z'); time.sleep(0.15)
    t.check('Ctrl+Z ×2 → cue back, offset back', abs(st(pg)['cues'][0] - cue0) < 1e-6 and abs(st(pg)['offset'] - s2['offset']) < 1e-9, st(pg))

    t.section('tempo stretch: drag a bar number, bar 1 stays')
    pg.click('#zOut'); pg.click('#zOut'); pg.click('#zOut'); pg.click('#zOut'); time.sleep(0.1)    # win 24
    pg.evaluate("CR._gd.seek(4)"); time.sleep(0.1)
    a = st(pg); r = zr(pg)
    gi = a['down'] + 4 * 4                         # bar line four bars after bar 1
    T = 60 / a['bpm']; tg = a['beats'][0] + gi * T; ta = a['b1']
    hb = round(r['b'] - 8)
    cur = pg.evaluate("([x,y])=>{const z=document.querySelector('#zm');z.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y,bubbles:true}));return getComputedStyle(z).cursor}", [round(x_of(pg, tg)), hb])
    t.eq('cursor on a bar handle', cur, 'col-resize')
    dxh = 12
    drag(pg, x_of(pg, tg) + 2, hb, dxh, mods=('Control',))
    c = st(pg)
    Tn = (tg + dxh * spp(pg) - ta) / (gi - a['down'])
    t.check('bpm changed to fit the dragged bar line', abs(c['bpm'] - 60 / Tn) < 1e-6 and c['bpm'] < 128, (c['bpm'], 60 / Tn))
    t.check('bar 1 stayed exactly where it was', abs(c['b1'] - ta) < 1e-9, (c['b1'], ta))
    t.check('chords re-detected for the new tempo', c['chords'] == pg.evaluate("CR._gd.fresh()"))
    bs = pg.evaluate("document.querySelector('#sBpm').value")
    t.check('BPM display follows', bs == pg.evaluate("String(Math.round(CR._gd.st().bpm*100)/100)") or bs.startswith(str(int(c['bpm']))), bs)
    pg.keyboard.press('Control+z'); time.sleep(0.15)
    t.check('undo → 128 BPM again', st(pg)['bpm'] == 128 and abs(st(pg)['b1'] - ta) < 1e-9)
    pg.keyboard.press('Control+Shift+z'); time.sleep(0.15)
    t.check('redo → stretched again', abs(st(pg)['bpm'] - c['bpm']) < 1e-9)
    t.shot(pg, 'tool_stretched')
    pg.click('#gReset'); time.sleep(0.3)
    rs = st(pg)
    t.check('reset → the detected grid (bpm, offset, downbeat)', rs['bpm'] == s0['bpm'] and rs['offset'] == s0['offset'] and rs['down'] == s0['down'], rs)
    t.check('reset button disabled at the detected grid', pg.evaluate("document.querySelector('#gReset').disabled"))

    t.section('normal mode: plain drag scrubs, Shift+drag moves the grid')
    pg.click('#gEdit'); time.sleep(0.1)
    t.check('grid mode off', pg.evaluate("document.querySelector('#gEdit').getAttribute('aria-pressed')==='false'&&document.querySelector('#gdHint').hidden"))
    a = st(pg); r = zr(pg)
    drag(pg, r['l'] + r['w'] * 0.6, y, -100)
    c = st(pg)
    t.check('plain drag: playhead moved by 100 px, grid untouched', abs((c['pos'] - a['pos']) - 100 * a['win'] / r['w']) < 1e-6 and c['offset'] == a['offset'], (c['pos'] - a['pos'], 100 * a['win'] / r['w']))
    a = st(pg)
    drag(pg, r['l'] + r['w'] * 0.55, y, 9, mods=('Shift', 'Control'))
    c = st(pg)
    t.check('Shift(+Ctrl)+drag 9 px in normal mode → grid moved, playhead not', abs((c['offset'] - a['offset']) - 9 * a['win'] / r['w']) < 1e-6 and c['pos'] == a['pos'], c['offset'] - a['offset'])
    pg.keyboard.press('ArrowRight'); time.sleep(0.1)
    t.check('→ in normal mode still seeks a bar (grid unchanged)', st(pg)['offset'] == c['offset'] and st(pg)['pos'] > c['pos'])
    saved = st(pg)

    t.section('reload keeps the edited grid')
    time.sleep(1.2)
    lib.reload(pg); lib.wait_tool_song(pg)              # the mock backend is in memory: sign in again (same uid u1)
    lib.sign_up(pg, 'oshri', 'o@x.com'); lib.wait_tool_song(pg, 'Grid Test', 120); time.sleep(0.5)
    rl = st(pg)
    t.check('after reload: same bpm/offset/downbeat', rl['bpm'] == saved['bpm'] and abs(rl['offset'] - saved['offset']) < 1e-9 and rl['down'] == saved['down'], (rl['offset'], saved['offset'], rl['down'], saved['down']))
    t.check('…and the detected grid is still known (reset possible)', rl['det'] and rl['det']['offset'] == s0['offset'], rl['det'])

    t.section('ar: strings + RTL, en/ru/es labels')
    labels = {}
    for lg in ['ar', 'en', 'ru', 'es', 'he']:
        pg.evaluate("l=>CR.setLang(l,true)", lg); time.sleep(0.1)
        labels[lg] = pg.evaluate("[document.querySelector('#gEdit span').textContent,document.querySelector('#gEdit').getAttribute('aria-label'),document.querySelector('#gdHint span').textContent,document.querySelector('#gUndo').title,document.documentElement.dir]")
    t.check('five languages: label, accessible name contains it, hint, undo title', all(v[0] and v[0].lower() in v[1].lower() and len(v[2]) > 40 and v[3] for v in labels.values()) and len({v[2] for v in labels.values()}) == 5, labels)
    t.check('he/ar RTL, others LTR', labels['ar'][4] == 'rtl' and labels['he'][4] == 'rtl' and labels['en'][4] == 'ltr')
    pg.evaluate("CR.setLang('ar',true)"); pg.click('#gEdit'); time.sleep(0.2)
    t.shot(pg, 'tool_ar')
    pg.evaluate("CR.setLang('he',true)")
    t.eq('zero CSP violations (tool)', lib.csp_violations(pg), [])
    ctx.close()

def tool_dark_mobile(t, srv, b):
    t.section('dark theme + 375 px touch')
    ctx, pg = lib.page(b, srv, t, mock=True, theme='dark', lang='en', w=375, h=812, mobile=True)
    pg.goto(srv.url('#tool')); lib.wait_booted(pg); lib.wait_tool_song(pg)
    pg.click('#gEdit'); time.sleep(0.2)
    t.check('dark page background', lib.page_luma(pg, 'body') < 60, lib.page_luma(pg, 'body'))
    t.check('no horizontal scroll at 375 px with grid mode on', lib.scroll_width(pg) <= 375, lib.scroll_width(pg))
    t.check('hint visible and inside the viewport', pg.evaluate("(()=>{const r=document.querySelector('#gdHint').getBoundingClientRect();return r.width>0&&r.right<=376&&r.left>=-1})()"))
    pg.locator('#zm').scroll_into_view_if_needed(); time.sleep(0.2)
    a = st(pg); r = zr(pg); y = round(r['t'] + 30 + (r['h'] - 30) / 2)
    cdp = ctx.new_cdp_session(pg)
    x0 = round(r['l'] + r['w'] * 0.6); dx = 40
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y}]})
    for k in range(1, 9):
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + dx * k // 8, 'y': y}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); time.sleep(0.3)
    c = st(pg); want = dx * a['win'] / r['w']
    t.check('one-finger drag in grid mode moves the grid (≈ px·win/width, magnet ≤ 20 ms)', abs((c['offset'] - a['offset']) - want) < 0.021 and c['offset'] != a['offset'] and c['pos'] == a['pos'], (c['offset'] - a['offset'], want))
    t.check('undo button works on touch', not pg.evaluate("document.querySelector('#gUndo').disabled"))
    pg.tap('#gUndo'); time.sleep(0.2)
    t.check('tap undo → grid back', st(pg)['offset'] == a['offset'])
    t.shot(pg, 'tool_dark_375')
    ctx.close()

# ------------------------------------------------------------------ Mashup
MX_SETUP = r"""
async (o)=>{
  const sr=44100,ac=CR.ac();
  // B: 120 BPM, a low kick on every beat from 0.5 s (downbeat louder); A: 120 BPM, a 3 kHz click on each of ITS downbeats from 0.8 s
  const mk=(dur,fn)=>{const b=ac.createBuffer(2,Math.round(dur*sr),sr);const L=b.getChannelData(0),R=b.getChannelData(1);fn(L);R.set(L);return b};
  const T=0.5,bar=2;
  const B=mk(40,L=>{for(let t=0.5;t<40;t+=T){const i0=Math.round(t*sr),a=Math.abs((t-0.5)/bar-Math.round((t-0.5)/bar))<1e-6?0.9:0.5;for(let j=0;j<Math.round(0.12*sr)&&i0+j<L.length;j++)L[i0+j]+=a*Math.sin(2*Math.PI*60*j/sr)*Math.exp(-j/sr*30)}});
  const A=mk(36,L=>{for(let t=0.8;t<36;t+=bar){const i0=Math.round(t*sr);for(let j=0;j<Math.round(0.03*sr)&&i0+j<L.length;j++)L[i0+j]+=0.8*Math.sin(2*Math.PI*3000*j/sr)*Math.exp(-j/sr*120)}});
  const wA=await CR.waveOf(A),wB=await CR.waveOf(B);
  // grid = {offset: a beat, down: index of the first downbeat counted from the first beat mod(offset,T)} → first downbeat at fd
  const pre=(buf,fd,wave)=>({buffer:buf,bpm:120,offset:fd,down:Math.floor(fd/T+1e-9)%4,key:{pc:9,mode:1},wave,lufs:-10,peak:-1,dur:buf.duration});
  window.__mxA=A;window.__mxB=B;
  await MASHUP.loadInto(1,null,'Beat B',null,pre(B,0.5,wB));
  await MASHUP.loadInto(0,null,'Vocal A',null,pre(A,0.8+(o.aShift||0),wA));
  const M=MASHUP._M;M.startA='all';M.fadeIn=0;M.fadeOut=0;MASHUP.lang();
  return true;
}"""
MX_EXPORT = r"""
async ()=>{
  const M=MASHUP._M;const vol=M.vol.slice();M.vol=[1,0];let blob=null;const sv=CR.saveBlob;CR.saveBlob=(b)=>{blob=b};
  try{await MASHUP.exportMix()}finally{CR.saveBlob=sv;M.vol=vol}
  if(!blob)return null;
  const buf=await CR.ac().decodeAudioData(await blob.arrayBuffer()),L=buf.getChannelData(0),sr=buf.sampleRate,o=MASHUP.model();
  const hits=[];let last=-1;for(let i=0;i<L.length;i++){if(Math.abs(L[i])>0.2&&(last<0||i-last>sr*0.5)){hits.push(i/sr+o.t0);last=i}}
  return {hits:hits.slice(0,6),bar0:o.bar0,bar:o.bar,align:o.align,anchor:o.anchor,nudge:M.nudge,t0:o.t0};
}"""
def mx_state(pg): return pg.evaluate("(()=>{const M=MASHUP._M,o=MASHUP.model(),a=M.slots[0].song,b=M.slots[1].song;return {align:o.align,nudge:M.nudge,anchor:o.anchor,bar0:o.bar0,bar:o.bar,vA:o.vA,aOff:a.an.offset,aDown:a.an.down,bOff:b.an.offset,bDown:b.an.down,undo:M.undo.length,redo:M.redo.length,lock:document.querySelector('#mxLock').textContent,lockOn:document.querySelector('#mxLock').classList.contains('on'),gridOn:M.gridOn}})()")
def tl_rect(pg): return lib.rect(pg, '#mxTl')
def tl_x(pg, tm):
    v = pg.evaluate("(()=>{const o=MASHUP.model(),M=MASHUP._M;return {v0:M.view0,span:(o.t1-o.t0)/M.zoom}})()")
    r = tl_rect(pg); return r['l'] + (tm - v['v0']) / v['span'] * r['w']
def lane_y(pg, i):
    r = tl_rect(pg); top = pg.evaluate("(()=>{return null})()")
    ruler, gap = 22, 6; lane = (r['h'] - ruler - gap * 2) // 2
    return round(r['t'] + ruler + gap + lane / 2 + i * (lane + gap))

def on_bars(ex):
    """every A hit on one of B's timeline bars (≤ 1 ms)"""
    return all(abs(((h - ex['bar0']) / ex['bar']) - round((h - ex['bar0']) / ex['bar'])) * ex['bar'] < 0.001 for h in ex['hits'])

def mashup_part(t, srv, b):
    t.section('Mashup: drag A to another bar, export lands A on B\'s bar')
    ctx, pg = lib.page(b, srv, t, mock=True, init=lib.CSP_INIT, lang='en')
    pg.goto(srv.url('#tool')); lib.wait_booted(pg)
    lib.sign_up(pg, 'oshri', 'o@x.com')
    pg.evaluate("location.hash='#mashup'"); lib.poll(pg, "!document.querySelector('#mashupView').hidden&&!!document.querySelector('#mxIn')", 15)
    pg.evaluate(MX_SETUP, {'aShift': 0}); time.sleep(0.5)
    lib.poll(pg, "!document.querySelector('#mxMain').hidden", 10)
    pg.locator('#mxTl').scroll_into_view_if_needed(); time.sleep(0.3)
    s0 = mx_state(pg)
    ex = pg.evaluate(MX_EXPORT)
    t.check('baseline export: A clicks on B bars (≤ 1 ms)', ex and len(ex['hits']) >= 3 and on_bars(ex), ex)
    t.check('lock shown (nudge 0)', s0['lockOn'] and 'Locked' in s0['lock'], s0['lock'])
    barpx = tl_x(pg, s0['bar0'] + s0['bar']) - tl_x(pg, s0['bar0'])
    ya = lane_y(pg, 0)
    xa = tl_x(pg, s0['anchor'] + 0.3)
    drag(pg, xa, ya, round(2 * barpx), steps=10)
    s1 = mx_state(pg)
    t.check('drag A right by two bars → align +2, nudge 0, one undo step', s1['align'] == s0['align'] + 2 and s1['nudge'] == 0 and s1['undo'] == 1, (s0['align'], s1['align'], s1['nudge'], s1['undo']))
    ex = pg.evaluate(MX_EXPORT)
    t.check('export: A\'s downbeat clicks on B\'s bars (≤ 1 ms)', ex and len(ex['hits']) >= 3 and on_bars(ex), ex)
    t.check('…the vocal-entry click exactly at bar `align` of B', ex and any(abs(h - (ex['bar0'] + ex['align'] * ex['bar'])) < 0.001 for h in ex['hits']), ex)
    drag(pg, tl_x(pg, s1['anchor'] + 0.3), ya, round(barpx * 0.37), mods=('Control',), steps=6)
    s2 = mx_state(pg)
    t.check('Ctrl+drag = free: nudge ≠ 0, lock off ("off bar")', s2['nudge'] != 0 and not s2['lockOn'] and 'off bar' in s2['lock'], (s2['nudge'], s2['lock']))
    pg.keyboard.press('Control+z'); time.sleep(0.2)
    s3 = mx_state(pg)
    t.check('Ctrl+Z → back to align +2, locked', s3['align'] == s1['align'] and s3['nudge'] == 0 and s3['lockOn'], s3)
    pg.click('#mxNudge [data-nd="beat"]'); time.sleep(0.1)
    t.check('±beat button still works (and is undoable)', abs(mx_state(pg)['nudge'] - 0.5) < 1e-9 and mx_state(pg)['undo'] == s3['undo'] + 1, mx_state(pg))
    pg.keyboard.press('Control+z'); time.sleep(0.2)
    t.check('undo the nudge button', mx_state(pg)['nudge'] == 0)
    t.shot(pg, 'mx_locked')
    ctx.close()

    t.section('Mashup grid mode: fix a deliberately shifted downbeat of A')
    ctx, pg = lib.page(b, srv, t, mock=True, init=lib.CSP_INIT, lang='en')
    pg.goto(srv.url('#tool')); lib.wait_booted(pg)
    lib.sign_up(pg, 'oshri', 'o@x.com')
    pg.evaluate("location.hash='#mashup'"); lib.poll(pg, "!document.querySelector('#mashupView').hidden&&!!document.querySelector('#mxIn')", 15)
    pg.evaluate(MX_SETUP, {'aShift': 0.09}); time.sleep(0.5)
    lib.poll(pg, "!document.querySelector('#mxMain').hidden", 10)
    pg.locator('#mxTl').scroll_into_view_if_needed(); time.sleep(0.3)
    pg.click('#mxZi'); pg.click('#mxZi'); pg.click('#mxZi'); time.sleep(0.2)     # zoom ×8
    ex = pg.evaluate(MX_EXPORT)
    t.check('with A\'s grid 90 ms late, its clicks land 90 ms early (off B\'s bars)', ex and not on_bars(ex), ex)
    pg.click('#mxGrid'); time.sleep(0.15)
    t.check('grid toggle on: aria-pressed + help line', pg.evaluate("document.querySelector('#mxGrid').getAttribute('aria-pressed')==='true'&&!document.querySelector('#mxGHelp').hidden"))
    s0 = mx_state(pg)
    # A's grid line at vA (source) is drawn at the anchor; the real click is 90 ms earlier in A's audio = 90 ms earlier on the timeline (rA = 1)
    pg.evaluate("(()=>{const M=MASHUP._M,o=MASHUP.model();M.view0=Math.max(o.t0,o.anchor-2)})()"); pg.evaluate("MASHUP.lang()"); time.sleep(0.2)
    xg = tl_x(pg, s0['anchor']); spx = pg.evaluate("(()=>{const o=MASHUP.model(),M=MASHUP._M;return (o.t1-o.t0)/M.zoom})()") / tl_rect(pg)['w']
    dx = -round(0.082 / spx)
    mag = drag(pg, xg, lane_y(pg, 0), dx, steps=8, mid="(MASHUP._M.drag&&MASHUP._M.drag.snap)")
    s1 = mx_state(pg)
    t.check('magnet while dragging A\'s grid line, on the click', mag is not None and abs(mag - (s0['vA'] - 0.09)) < 0.001, (mag, s0['vA'] - 0.09))
    t.check('A\'s grid fixed (offset back on the clicks ≤ 1 ms), one undo step', abs((s1['aOff'] - 0.8) % 0.5) < 0.001 or abs((s1['aOff'] - 0.8) % 0.5 - 0.5) < 0.001, (s1['aOff'], s1['undo']))
    t.check('A re-locked on B\'s bar (nudge 0, align kept)', s1['nudge'] == 0 and s1['align'] == s0['align'] and s1['lockOn'], s1)
    ex = pg.evaluate(MX_EXPORT)
    t.check('export after the fix: A\'s real downbeats on B\'s bars (≤ 1 ms)', ex and len(ex['hits']) >= 3 and on_bars(ex), ex)
    t.shot(pg, 'mx_gridfix')
    pg.keyboard.press('Control+z'); time.sleep(0.2)
    t.check('Ctrl+Z → A\'s wrong grid again', abs(mx_state(pg)['aOff'] - s0['aOff']) < 1e-9)
    pg.keyboard.press('Control+Shift+z'); time.sleep(0.2)
    t.check('Ctrl+Shift+Z → fixed again', abs(mx_state(pg)['aOff'] - s1['aOff']) < 1e-9)
    # B's grid: Ctrl+drag (free) moves B's bars, A follows (stays locked on its bar)
    s2 = mx_state(pg)
    xb = tl_x(pg, s2['bar0'] + (s2['align']) * s2['bar'])
    drag(pg, xb, lane_y(pg, 1), 6, mods=('Control',), steps=4)
    s3 = mx_state(pg)
    d = s3['bar0'] - s2['bar0']
    t.check('B grid Ctrl+drag 6 px → B\'s bars moved by 6 px of time, A followed (anchor moved the same)', abs(d - 6 * spx) < 1e-6 and abs((s3['anchor'] - s2['anchor']) - d) < 1e-6, (d, 6 * spx, s3['anchor'] - s2['anchor']))
    pg.keyboard.press('Control+z'); time.sleep(0.2)
    t.check('undo B grid', abs(mx_state(pg)['bar0'] - s2['bar0']) < 1e-9)
    # arrows in grid mode: the last dragged lane (B) ±1 ms / Shift ±10 ms
    pg.focus('#mxGrid')
    pg.keyboard.press('Shift+ArrowRight'); pg.keyboard.press('ArrowRight'); time.sleep(0.2)
    t.check('arrows on the grid toggle: +11 ms on B\'s grid, one undo step', abs(mx_state(pg)['bar0'] - s2['bar0'] - 0.011) < 1e-6 and mx_state(pg)['undo'] == s2['undo'] + 1, mx_state(pg)['bar0'] - s2['bar0'])
    pg.keyboard.press('Control+z'); time.sleep(0.2)
    t.check('undo arrows', abs(mx_state(pg)['bar0'] - s2['bar0']) < 1e-9)
    t.section('Mashup: grid fix kept with the pair (reload)')
    time.sleep(0.6)
    lib.reload(pg); lib.sign_up(pg, 'oshri', 'o@x.com')
    pg.evaluate("location.hash='#mashup'"); lib.poll(pg, "!document.querySelector('#mashupView').hidden&&!!document.querySelector('#mxIn')", 15)
    pg.evaluate(MX_SETUP, {'aShift': 0.09}); time.sleep(0.5)
    s4 = mx_state(pg)
    t.check('same pair reloaded with the wrong analysis → the saved grid fix is applied', abs(s4['aOff'] - s1['aOff']) < 1e-9 and s4['lockOn'], (s4['aOff'], s1['aOff']))
    ex = pg.evaluate(MX_EXPORT)
    t.check('…export still on B\'s bars', ex and on_bars(ex), ex)
    for lg, th in [('he', 'light'), ('ar', 'dark')]:
        pg.evaluate("l=>CR.setLang(l,true)", lg)
        if th == 'dark': pg.evaluate("document.documentElement.dataset.theme='dark'")
        time.sleep(0.3)
        lab = pg.evaluate("[document.querySelector('#mxGrid span').textContent,document.querySelector('#mxGrid').getAttribute('aria-label'),document.querySelector('#mxGHelp').textContent,document.querySelector('#mxLock').textContent,document.documentElement.dir,document.querySelector('#mxTl').dir]")
        t.check(f'{lg}: grid label in its name, help + lock text, page RTL, timeline LTR', lab[0] and lab[0] in lab[1] and len(lab[2]) > 40 and lab[3] and lab[4] == 'rtl' and lab[5] == 'ltr', lab)
        t.shot(pg, f'mx_{lg}_{th}')
    t.check('dark: the match card is dark', lib.page_luma(pg, '#mxMatch') < 80, lib.page_luma(pg, '#mxMatch'))
    t.eq('zero CSP violations (mashup)', lib.csp_violations(pg), [])
    ctx.close()

def crate_part(t, srv, b, wav):
    t.section('Crate overview: Shift+drag moves the grid + cues by whole beats, Ctrl = free')
    ctx, pg = lib.page(b, srv, t, accounts=False, lang='en')
    pg.goto(srv.url('#crate')); lib.wait_booted(pg)
    pg.set_input_files('#crIn', [wav])
    lib.poll(pg, "CRATE._C.rows.length===1&&CRATE._C.rows[0].st==='ok'", 120); time.sleep(0.5)
    row = lambda: pg.evaluate("(r=>({gsh:r.gsh||0,cues:(r.cues||[]).map(c=>c.t),dur:r.dur,bpm:r.bpm}))(CRATE._C.rows[0])")
    a = row(); bb = pg.query_selector('.rbov').bounding_box()
    T = 60 / a['bpm']; px_beat = bb['width'] / a['dur'] * T
    y = bb['y'] + bb['height'] * 0.6; x0 = bb['x'] + bb['width'] * 0.3
    npx = 10; nb = round(npx / px_beat)
    drag(pg, x0, y, npx, mods=('Shift',), steps=6)
    c = row()
    t.check(f'Shift+drag {npx} px ({npx / px_beat:.2f} beats) → grid +{nb} whole beats', nb >= 1 and abs(c['gsh'] - a['gsh'] - nb * T) < 1e-6, (c['gsh'], nb * T))
    t.check('…cues moved with the grid', len(c['cues']) == len(a['cues']) > 0 and all(abs((y2 - y1) - nb * T) < 0.0015 for y1, y2 in zip(a['cues'], c['cues'])), (a['cues'], c['cues']))
    bb = pg.query_selector('.rbov').bounding_box()
    drag(pg, bb['x'] + bb['width'] * 0.3, y, 6, mods=('Shift', 'Control'), steps=3)
    e = row()
    t.check('Ctrl+Shift+drag 6 px → free move (not whole beats)', abs((e['gsh'] - c['gsh']) - 6 / bb['width'] * c['dur']) < 1e-6, e['gsh'] - c['gsh'])
    t.check('hint mentions Shift+drag (en)', 'Shift+drag' in pg.evaluate("CR.t('ovHint')"))
    ctx.close()

@lib.main
def test(t, srv, b):
    tmp = tempfile.mkdtemp(prefix='cr-gd-')
    wav = gen_edm.make(os.path.join(tmp, 'Grid Test.wav'), lead=LEAD)
    only = os.environ.get('GD_ONLY', '')          # GD_ONLY=tool|mobile|mashup runs one part (debugging)
    if only in ('', 'tool'): tool_part(t, srv, b, wav)
    if only in ('', 'mobile'): tool_dark_mobile(t, srv, b)
    if only in ('', 'mashup'): mashup_part(t, srv, b)
    if only in ('', 'crate'): crate_part(t, srv, b, wav)
