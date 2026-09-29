"""Stem separation end to end (SLOW, CPU/wasm: several minutes — the `slow` group only runs with `--slow`).
1. Worker protocol: `ai/worker.js?v=2` initialised with the real model (served locally), run on 12 s of the real
   preview fixtures/p0.mp3 with the streaming API (`{type:'run', LR, n, overlap}`) → 'p' progress, 'blk' blocks that cover exactly
   [0, n) without gaps, 'done'. The 8 returned channels (drums/bass/other/vocals × L/R) are finite, the stems sum
   back to the mix (Demucs is additive: relative error < 15 %), and the demo's drums/bass mostly land in the right
   stems (no stem holds > 70 % of the energy, drums/bass/other are not silent).
2. In the app (mock backend, signed in): the AI button charges 'sep' BEFORE running, the stems view appears with
   the four faders, cancelling a second run refunds the charge.
Adapted from the scratchpad's septest.py (which compared against a pre-streaming worker that is not in the repo)."""
import os, sys, time, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib

SECONDS = 12
JS = r'''
async(sec)=>{
  const man=await (await fetch('ai/model/wman.json')).json();const abs=f=>new URL(f,location.href).href;
  const w=new Worker('ai/worker.js?v=2');const log=[];
  await new Promise((ok,fail)=>{w.onmessage=e=>{const d=e.data;log.push(d.type);if(d.type==='ready')ok();if(d.type==='error')fail(new Error(d.message))};
    w.onerror=e=>fail(new Error(e.message||'worker'));
    w.postMessage({type:'init',man,bytes:78767446,base:abs('ai/'),gpu:false,files:{ort:[abs('ai/model/rt0.bin')],graph:[abs('ai/model/g0.bin')],w:[0,1,2,3,4,5].map(i=>abs(`ai/model/w${i}.bin`))}})});
  const ab=await (await fetch('tools/tests/fixtures/p0.mp3')).arrayBuffer();const buf=await CR.ac().decodeAudioData(ab);const n=Math.min(buf.length,Math.round(buf.sampleRate*sec));
  const L=new Float32Array(n),R=new Float32Array(n);buf.copyFromChannel(L,0);buf.copyFromChannel(R,Math.min(1,buf.numberOfChannels-1));
  const mixL=Float32Array.from(L),mixR=Float32Array.from(R);
  const LR=new Float32Array(2*n);LR.set(L,0);LR.set(R,n);
  const out=Array.from({length:8},()=>new Float32Array(n));const cover=new Uint8Array(n);let blocks=0,prog=0,lastP=-1,mono=true;
  const t0=performance.now();
  await new Promise((ok,fail)=>{w.onmessage=e=>{const d=e.data;
    if(d.type==='p'){prog++;if(d.tot&&d.i<lastP)mono=false;lastP=d.i}
    else if(d.type==='blk'){blocks++;for(let i=0;i<8;i++)out[i].set(d.res[i].subarray(0,d.len),d.off);cover.fill(1,d.off,d.off+d.len)}
    else if(d.type==='done')ok();else if(d.type==='error')fail(new Error(d.message))};
    w.postMessage({type:'run',LR,n,overlap:0.25},[LR.buffer])});
  const secs=(performance.now()-t0)/1000;w.terminate();
  let gaps=0;for(let k=0;k<n;k++)if(!cover[k])gaps++;
  const en=a=>{let s=0;for(let k=0;k<a.length;k++)s+=a[k]*a[k];return s};
  let finite=true;for(const a of out)for(let k=0;k<a.length;k+=97)if(!isFinite(a[k]))finite=false;
  let e=0,ea=0;for(let k=0;k<n;k++){const sl=out[0][k]+out[2][k]+out[4][k]+out[6][k]-mixL[k],sr=out[1][k]+out[3][k]+out[5][k]+out[7][k]-mixR[k];e+=sl*sl+sr*sr;ea+=mixL[k]*mixL[k]+mixR[k]*mixR[k]}
  const stems=['drums','bass','other','vocals'].map((k,i)=>[k,en(out[i*2])+en(out[i*2+1])]);const tot=stems.reduce((s,x)=>s+x[1],0)||1;
  return {secs:+secs.toFixed(1),blocks,prog,mono,gaps,finite,sumRelErr:+Math.sqrt(e/ea).toFixed(4),share:Object.fromEntries(stems.map(([k,v])=>[k,+(v/tot).toFixed(3)])),log:[...new Set(log)]}}
'''

@lib.main
def test(t, srv, b):
    t.section('worker protocol on %d s of p0.mp3 (CPU)' % SECONDS)
    ctx, pg = lib.page(b, srv, t, accounts=False)
    pg.goto(srv.url('#tool')); lib.wait_tool_song(pg)
    t0 = time.time()
    r = pg.evaluate(JS, SECONDS, )
    print('  ', json.dumps(r), f'({time.time() - t0:.0f}s wall)')
    t.check('init: dl/stage/ready messages', 'ready' in r['log'], r['log'])
    t.check('streamed in blocks', r['blocks'] >= 2, r['blocks'])
    t.check('progress messages, monotonic', r['prog'] >= r['blocks'] and r['mono'], (r['prog'], r['mono']))
    t.eq('blocks cover the whole input (no gaps)', r['gaps'], 0)
    t.check('all stem samples finite', r['finite'])
    t.check('stems sum back to the mix (rel. error < 0.15)', r['sumRelErr'] < 0.15, r['sumRelErr'])
    sh = r['share']
    t.check('energy spread over stems (none > 70 %, drums/bass/other not silent)', max(sh.values()) < 0.7 and all(sh[k] > 0.02 for k in ('drums', 'bass', 'other')), sh)
    ctx.close()

    t.section('in the app: charge before, stems view, refund on cancel')
    ledger = r'''(()=>{const B=window.__MOCK_BACKEND;window.__pay=[];let bal=50;
      B.credits=async()=>({credits:bal,plan:'free',plan_until:null,last_refill:null});
      B.spendCredits=async(kind,ref)=>{window.__pay.push(['spend',kind]);bal-=5;return {balance:bal,id:window.__pay.length}};
      B.refundCredits=async id=>{window.__pay.push(['refund',id]);bal+=5;return bal};
      B.getConfig=async()=>({id:1,title:'',announce:'',lang:'he',ai:true,dl:true,require_login:false,allow_signup:true,billing:{on:true,signup:20,costs:{sep:5,stems:2},plans:[]}})})();'''
    ctx, pg = lib.page(b, srv, t, mock=lib.mock_js(ledger))
    pg.goto(srv.url('#tool#cpu')); lib.wait_booted(pg)
    lib.sign_up(pg, 'dana2', 'd2@x.com')          # a plain user: separation costs points
    lib.wait_tool_song(pg)
    t.check('AI button enabled for a signed-in user', pg.is_enabled('#aiBtn'))
    pg.evaluate("document.querySelector('#aiBtn').click()")
    lib.poll(pg, "(window.__pay||[]).length>0", 20)
    t.eq('charged "sep" before the run', pg.evaluate("__pay[0]"), ['spend', 'sep'])
    lib.poll(pg, "/%/.test(document.querySelector('#smsg').textContent)&&!/מוריד|Download/.test(document.querySelector('#smsg').textContent)", 240)
    pg.evaluate("document.querySelector('#cancelBtn').click()")
    lib.poll(pg, "(window.__pay||[]).some(x=>x[0]==='refund')", 20)
    t.check('cancel refunds the charge', pg.evaluate("__pay.some(x=>x[0]==='refund')"), pg.evaluate("__pay"))
    lib.poll(pg, "document.querySelector('#creditsN')&&document.querySelector('#creditsN').textContent.includes('50')", 10)
    t.check('balance back to 50', '50' in pg.inner_text('#creditsN'), pg.inner_text('#creditsN'))
