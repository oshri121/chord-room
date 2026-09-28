/*
 * DJ view: two decks, mixer, beat FX, sampler, auto transition, recording, match score and next-song picks.
 * Uses the app through window.CR (see the bridge at the end of app.js). Audio graph per deck:
 *   source → srcGain → Signalsmith Stretch (key lock / key shift) → trim → EQ lo/mid/hi → HP → LP → gate
 *   → fader → crossfader → bus → master → limiter → out;  crossfader → FX send → echo / reverb / flanger → bus
 * Positions are tracked as source time in segments ({t0,p0,r}); "heard" = source time lat seconds ago,
 * because every deck goes through its stretch node (same latency on both, so beats line up).
 */
(function(){
'use strict';
const CR=window.CR;if(!CR)return;
const {t,$,esc,mod}=CR;
const COL0=['#2F8CFF','#FF7A1A'],COL=COL0.slice(),LET=['A','B'];
/* deck colours follow the accessibility "safe palette" (the DOM gets the same pair from dj.css) */
function syncCol(){let p=null;if(window.A11Y&&A11Y.activePalette)p=A11Y.activePalette();else try{if((JSON.parse(localStorage.getItem('chordroom.a11y'))||{}).cb==='safe')p={a:'#56B4E9',b:'#E69F00'}}catch(e){}COL[0]=p?p.a:COL0[0];COL[1]=p?p.b:COL0[1]}
syncCol();document.addEventListener('a11y-change',syncCol);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dbg=db=>Math.pow(10,db/20);
const DEMOS=[{bpm:124,shift:0,key:'Am'},{bpm:126,shift:7,key:'Em'},{bpm:122,shift:5,key:'Dm'},{bpm:128,shift:-2,key:'Gm'}];
let c=null;
const D={ready:false,initP:null,decks:[],xf:0,curve:'smooth',master:0.85,lat:0,noStretch:false,visible:false,raf:0,win:7,
  fx:{type:'echo',div:0.75,tg:'M',depth:0.55,on:false},masterI:0,auto:null,rec:null,autoBars:16,demoN:0,built:false,pickFor:0,cat:null,catP:null};

/* ================= audio engine ================= */
function bq(type,f,q){const b=c.createBiquadFilter();b.type=type;b.frequency.value=f;if(q!=null)b.Q.value=q;return b}
function gain(v){const g=c.createGain();g.gain.value=v;return g}
function ramp(p,v,tc){p.cancelScheduledValues(c.currentTime);p.setTargetAtTime(v,c.currentTime,tc||0.012)}
function makeIR(sec){
  const sr=c.sampleRate,n=Math.floor(sr*sec),b=c.createBuffer(2,n,sr);
  for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);for(let i=0;i<n;i++){const x=i/n;d[i]=(Math.random()*2-1)*Math.pow(1-x,2.6)*(i<sr*0.012?i/(sr*0.012):1)}}
  return b;
}
function buildGraph(){
  D.bus=gain(1);D.mst=gain(D.master*1.15);
  D.lim=c.createDynamicsCompressor();D.lim.threshold.value=-4;D.lim.knee.value=4;D.lim.ratio.value=14;D.lim.attack.value=0.002;D.lim.release.value=0.12;
  D.man=c.createAnalyser();D.man.fftSize=2048;D.man.smoothingTimeConstant=0.78;
  D.bus.connect(D.mst).connect(D.lim).connect(D.man).connect(c.destination);
  D.fxIn=gain(1);
  const e={in:gain(0),dl:c.createDelay(8),fb:gain(0.45),hp:bq('highpass',180),lp:bq('lowpass',7000),out:gain(0.6)};
  D.fxIn.connect(e.in).connect(e.dl);e.dl.connect(e.hp).connect(e.lp);e.lp.connect(e.fb).connect(e.dl);e.lp.connect(e.out).connect(D.bus);
  const r={in:gain(0),cv:c.createConvolver(),out:gain(0.8)};r.cv.buffer=makeIR(3.4);D.fxIn.connect(r.in).connect(r.cv).connect(r.out).connect(D.bus);
  const f={in:gain(0),dl:c.createDelay(0.05),fb:gain(0.5),lfo:c.createOscillator(),lg:gain(0.002),out:gain(0.8)};
  f.dl.delayTime.value=0.004;f.lfo.frequency.value=0.25;f.lfo.connect(f.lg).connect(f.dl.delayTime);f.lfo.start();
  D.fxIn.connect(f.in).connect(f.dl);f.dl.connect(f.fb).connect(f.dl);f.dl.connect(f.out).connect(D.bus);
  D.fxu={echo:e,reverb:r,flanger:f};
  D.smp=gain(0.75);D.smp.connect(D.bus);
}
function makeDeck(i){
  const n={in:gain(1),trim:gain(1),lo:bq('lowshelf',220),mid:bq('peaking',1000,0.7),hi:bq('highshelf',3600),hp:bq('highpass',10,0.7),lp:bq('lowpass',22000,0.7),
    gate:gain(1),an:c.createAnalyser(),fader:gain(0.72),xf:gain(1),send:gain(0),st:null};
  n.an.fftSize=1024;
  n.trim.connect(n.lo).connect(n.mid).connect(n.hi).connect(n.hp).connect(n.lp).connect(n.gate);
  n.gate.connect(n.an);n.gate.connect(n.fader).connect(n.xf).connect(D.bus);n.xf.connect(n.send).connect(D.fxIn);
  return {i,n,track:null,playing:false,pos:0,segs:[],rate:1,bend:1,tempo:0,range:0.08,keyLock:true,semis:0,sync:false,k:1,cue:0,cues:[null,null,null,null],
    loop:null,src:null,srcG:null,eq:{trim:0,hi:0,mid:0,lo:0,filt:0},fader:0.85,autoGain:0,pm:'hot',waitUntil:0,slip:null,braking:false,cuePrev:false,lastBeat:-9,vu:0,pk:0,pkT:0,loading:false};
}
async function init(){
  if(D.ready)return;if(D.initP)return D.initP;
  D.initP=(async()=>{
    c=CR.ac();buildGraph();D.decks=[makeDeck(0),makeDeck(1)];applyXf();
    try{
      await CR.loadScript(CR.SS_SRC);
      for(const d of D.decks){d.n.st=await window.SignalsmithStretch(c);d.n.in.connect(d.n.st).connect(d.n.trim)}
      D.lat=+(await D.decks[0].n.st.latency())||0;
    }catch(e){console.warn(e);D.noStretch=true;for(const d of D.decks){d.n.st=null;try{d.n.in.disconnect()}catch(x){}d.n.in.connect(d.n.trim)}}
    D.ready=true;
  })();
  return D.initP;
}

/* ---------- timeline ---------- */
const effRate=d=>d.rate*d.bend;
const T_=d=>60/d.track.bpm;
const first=d=>mod(d.track.offset,T_(d));
const beatF=(d,p)=>(p-first(d))/T_(d);
const barPh=(d,p)=>mod(beatF(d,p)-d.track.down,4);
const snapBeat=(d,p)=>first(d)+Math.round(beatF(d,p))*T_(d);
const floorBeat=(d,p)=>first(d)+Math.floor(beatF(d,p)+1e-4)*T_(d);
const snapBar=(d,p)=>{let b=Math.round((beatF(d,p)-d.track.down)/4)*4+d.track.down;while(first(d)+b*T_(d)<0)b+=4;return first(d)+b*T_(d)};
const firstDown=d=>{let p=first(d)+mod(d.track.down,4)*T_(d);return p>30?first(d):p};
function srcAt(d,time){
  if(!d.playing||!d.segs.length)return d.pos;
  let s=d.segs[0];for(const x of d.segs)if(x.t0<=time)s=x;
  const dt=time-s.t0;if(dt<=0)return s.p0;
  let p=s.ramp?(dt<s.ramp?s.p0+s.r*(dt-dt*dt/(2*s.ramp)):s.p0+s.r*s.ramp/2):s.p0+dt*s.r;
  if(s.loop&&p>=s.loop[1])p=s.loop[0]+mod(p-s.loop[0],s.loop[1]-s.loop[0]);
  return p;
}
const heard=d=>d.playing?srcAt(d,c.currentTime-D.lat):d.pos;
const srcNow=d=>d.playing?srcAt(d,c.currentTime):d.pos;
function pushSeg(d,t0,p0,extra){d.segs.push({t0,p0,r:effRate(d),loop:d.loop?[d.loop.ls,d.loop.le]:null,...(extra||{})});if(d.segs.length>8)d.segs.shift()}
const semisOf=d=>d.semis-(d.keyLock&&!d.braking&&!D.noStretch?12*Math.log2(effRate(d)):0);
function stSched(d,o){if(d.n.st)d.n.st.schedule(o)}

function spawn(d,when,p){
  const s=c.createBufferSource();s.buffer=d.track.buffer;s.playbackRate.value=effRate(d);
  const g=c.createGain();g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(1,when+0.005);
  s.connect(g).connect(d.n.in);
  if(d.loop){s.loop=true;s.loopStart=d.loop.ls;s.loopEnd=d.loop.le}
  s.start(when,clamp(p,0,d.track.dur-0.001));d.src=s;d.srcG=g;pushSeg(d,when,p);
}
function killSrc(d,at){
  if(!d.src)return;const s=d.src,g=d.srcG;d.src=null;d.srcG=null;
  try{g.gain.cancelScheduledValues(at);g.gain.setValueAtTime(1,at);g.gain.linearRampToValueAtTime(0,at+0.006);s.stop(at+0.01)}catch(e){}
}
function startDeck(d,when){
  if(!d.track)return;c.resume();
  when=Math.max(when||0,c.currentTime+0.02);
  if(d.pos>=d.track.dur-0.05)d.pos=0;
  d.segs=[];d.playing=true;spawn(d,when,d.pos);d.waitUntil=when>c.currentTime+0.06?when:0;
  stSched(d,{active:true,semitones:semisOf(d),output:when});
  if(D.masterI!==d.i&&!D.decks[D.masterI].playing)D.masterI=d.i;
  renderDeck(d);renderMatch();
}
function stopDeck(d){
  if(!d.playing)return;const now=c.currentTime;
  d.pos=clamp(srcAt(d,now),0,d.track.dur);killSrc(d,now);d.playing=false;d.segs=[];d.bend=1;d.slip=null;d.waitUntil=0;d.cuePrev=false;
  stSched(d,{active:false,output:now+D.lat+0.15});
  if(D.auto&&(D.auto.from===d||D.auto.to===d)&&!D.auto.ending)autoCancel();
  renderDeck(d);
}
function jump(d,p){
  if(!d.track)return;p=clamp(p,0,d.track.dur-0.02);
  if(d.loop&&!d.slip&&(p<d.loop.ls-1e-3||p>=d.loop.le))d.loop=null;
  if(!d.playing){d.pos=p;renderDeck(d);return}
  const when=c.currentTime+0.012;killSrc(d,when);spawn(d,when,p);
}
function applyRate(d){
  if(d.playing&&!d.braking){
    const now=c.currentTime,p=srcAt(d,now);pushSeg(d,now,p);
    d.src.playbackRate.cancelScheduledValues(now);d.src.playbackRate.setValueAtTime(effRate(d),now);
    stSched(d,{semitones:semisOf(d),output:now+D.lat});
  }
  // decks synced to this one follow
  for(const o of D.decks)if(o!==d&&o.sync&&o.track&&d.track&&D.masterI===d.i){const r=syncRate(o,d);if(Math.abs(r.r-o.rate)>1e-6){o.rate=r.r;o.k=r.k;applyRate(o);renderDeck(o)}}
}
function applyKey(d){if(d.playing&&!d.braking)stSched(d,{semitones:semisOf(d),output:c.currentTime+D.lat});renderDeck(d);renderMatch();renderRecsSoon()}

/* ---------- sync ---------- */
const other=d=>D.decks[1-d.i];
function syncRate(d,m){
  const mb=m.track.bpm*m.rate;let best={r:1,k:1},bd=9;
  for(const k of [0.5,1,2]){const r=mb*k/d.track.bpm,dd=Math.abs(Math.log(r));if(dd<bd){bd=dd;best={r,k}}}
  return best;
}
function alignPhase(d,m){
  const when=c.currentTime+0.02,pm=srcAt(m,when),pd=srcAt(d,when);
  const target=mod(barPh(m,pm)*d.k,4),cur=barPh(d,pd),dl=mod(target-cur+2,4)-2;
  if(Math.abs(dl)<0.003)return;
  killSrc(d,when);spawn(d,when,pd+dl*T_(d));
}
function setSync(d,on){
  const m=other(d);
  if(on&&(!d.track||!m.track))return;
  d.sync=on;
  if(on){m.sync=false;D.masterI=m.i;const r=syncRate(d,m);d.rate=r.r;d.k=r.k;d.tempo=clamp((d.rate-1)/d.range,-1,1);applyRate(d);if(d.playing&&m.playing)alignPhase(d,m)}
  renderDeck(d);renderDeck(m);renderMatch();
}
function playPress(d){
  if(!d.track)return;
  if(d.cuePrev){d.cuePrev=false;renderDeck(d);return}
  if(d.playing){stopDeck(d);return}
  const m=other(d);
  if(d.sync&&m.playing&&m.track){
    const r=syncRate(d,m);d.rate=r.r;d.k=r.k;
    const now=c.currentTime+0.03,pm=srcAt(m,now),need=barPh(d,d.pos),cur=mod(barPh(m,pm)*d.k,4);
    const wait=mod(need-cur,4)*T_(d)/effRate(d);
    startDeck(d,now+wait);
  }else startDeck(d);
}

/* ---------- cue, hot cues, loops, jumps ---------- */
function cueDown(d){
  if(!d.track)return;
  if(d.playing){if(d.cuePrev)return;stopDeck(d);d.pos=d.cue;renderDeck(d);return}
  if(Math.abs(d.pos-d.cue)<0.02){d.cuePrev=true;startDeck(d);return}
  d.cue=clamp(snapBeat(d,d.pos),0,d.track.dur);d.pos=d.cue;renderDeck(d);
}
function cueUp(d){if(d.cuePrev&&d.playing){d.cuePrev=false;stopDeck(d);d.pos=d.cue;renderDeck(d)}}
function hotCue(d,i,del){
  if(!d.track)return;
  if(del){d.cues[i]=null;renderDeck(d);return}
  if(d.cues[i]==null){d.cues[i]=clamp(snapBeat(d,heard(d)),0,d.track.dur-0.05);renderDeck(d);return}
  jump(d,d.cues[i]);if(!d.playing)playPress(d);
}
function setLoop(d,beats,ls){
  if(!d.track)return;const T=T_(d),p=srcNow(d);
  ls=ls!=null?ls:floorBeat(d,p);const le=Math.min(d.track.dur,ls+beats*T);if(le-ls<0.02)return;
  d.loop={ls,le,beats};
  if(d.playing){
    const now=c.currentTime,pp=srcAt(d,now);
    if(pp<ls||pp>=le){jump(d,ls+mod(pp-ls,le-ls))}
    else{d.src.loopStart=ls;d.src.loopEnd=le;d.src.loop=true;pushSeg(d,now,pp)}
  }else if(d.pos<ls||d.pos>=le)d.pos=ls;
  renderDeck(d);
}
function exitLoop(d){
  if(!d.loop)return;
  if(d.playing&&d.src){const now=c.currentTime,pp=srcAt(d,now);d.loop=null;d.src.loop=false;pushSeg(d,now,pp)}else d.loop=null;
  renderDeck(d);
}
function loopPad(d,beats){if(d.loop&&d.loop.beats===beats&&!d.slip)exitLoop(d);else setLoop(d,beats)}
function beatJump(d,beats){if(!d.track)return;const p=srcNow(d)+beats*T_(d);if(d.loop&&!d.slip){const L=d.loop.le-d.loop.ls;d.loop={...d.loop,ls:d.loop.ls+beats*T_(d),le:d.loop.ls+beats*T_(d)+L}}jump(d,p)}

/* ---------- tempo ---------- */
function setTempo(d,v,fromUser){
  if(!d.track)return;
  if(fromUser&&d.sync){d.sync=false}
  d.tempo=clamp(v,-1,1);d.rate=1+d.tempo*d.range;applyRate(d);renderDeck(d);renderMatch();renderRecsSoon();
}
function cycleRange(d){const R=[0.08,0.16,0.5];d.range=R[(R.indexOf(d.range)+1)%R.length];if(!d.sync)d.tempo=clamp((d.rate-1)/d.range,-1,1);if(!d.sync){d.rate=1+d.tempo*d.range;applyRate(d)}renderDeck(d)}
function setBend(d,b){d.bend=b;applyRate(d)}
// smallest pitch shift that makes the keys mix (same / relative / ±1 on the Camelot wheel); press again to undo
function keySync(d){
  const m=other(d);if(!d.track||!m.track)return;
  if(d.semis){d.semis=0;applyKey(d);return}
  const best=bestShift(d,m);
  if(!best){note(t('djKeyOk'));return}
  d.semis=best;applyKey(d);
}

/* ---------- mixer ---------- */
function eqDb(v){return v<=-0.97?-60:v<0?v*26:v*6}
function applyEq(d){
  const n=d.n,e=d.eq;
  ramp(n.trim.gain,dbg(d.autoGain+e.trim*12));ramp(n.hi.gain,eqDb(e.hi));ramp(n.mid.gain,eqDb(e.mid));ramp(n.lo.gain,eqDb(e.lo));
  const f=e.filt;
  if(f<-0.02){ramp(n.lp.frequency,20000*Math.pow(160/20000,(-f-0.02)/0.98),0.02);ramp(n.hp.frequency,10,0.02);n.lp.Q.value=1.6;n.hp.Q.value=0.7}
  else if(f>0.02){ramp(n.hp.frequency,20*Math.pow(9000/20,(f-0.02)/0.98),0.02);ramp(n.lp.frequency,22000,0.02);n.hp.Q.value=1.6;n.lp.Q.value=0.7}
  else{ramp(n.lp.frequency,22000,0.02);ramp(n.hp.frequency,10,0.02);n.lp.Q.value=n.hp.Q.value=0.7}
}
function applyFader(d){ramp(d.n.fader.gain,d.fader*d.fader)}
function xfGains(x,curve){
  const p=(x+1)/2;
  if(curve==='cut')return [p<0.94?1:(1-p)/0.06,p>0.06?1:p/0.06];
  return [p<0.5?1:Math.cos((p-0.5)*Math.PI),p>0.5?1:Math.cos((0.5-p)*Math.PI)];
}
function applyXf(){const g=xfGains(D.xf,D.curve);D.decks.forEach((d,i)=>ramp(d.n.xf.gain,g[i],0.006))}

/* ---------- beat FX ---------- */
const FXS=['echo','reverb','flanger','gate','roll','brake'];
const DIVS=[[0.25,'1/4'],[0.5,'1/2'],[0.75,'3/4'],[1,'1'],[2,'2'],[4,'4']];
const fxDecks=()=>D.decks.filter(d=>D.fx.tg==='M'||String(d.i)===D.fx.tg);
function fxBeatSec(){const ds=fxDecks().filter(d=>d.track);const d=ds.find(x=>x.playing)||ds[0]||D.decks.find(x=>x.track);return d?60/(d.track.bpm*effRate(d)):0.5}
function updateFx(){
  if(!D.ready)return;const F=D.fx,on=F.on,bs=fxBeatSec(),u=D.fxu;
  const send=on&&(F.type==='echo'||F.type==='reverb'||F.type==='flanger');
  D.decks.forEach(d=>ramp(d.n.send.gain,send&&fxDecks().includes(d)?1:0,0.01));
  ramp(u.echo.in.gain,on&&F.type==='echo'?1:0,0.01);ramp(u.reverb.in.gain,on&&F.type==='reverb'?1:0,0.01);ramp(u.flanger.in.gain,on&&F.type==='flanger'?1:0,0.01);
  ramp(u.echo.dl.delayTime,Math.min(7.9,bs*F.div),0.03);ramp(u.echo.fb.gain,0.25+0.5*F.depth);ramp(u.echo.out.gain,0.25+0.85*F.depth);
  ramp(u.reverb.out.gain,0.3+1.2*F.depth);
  ramp(u.flanger.lfo.frequency,1/Math.max(0.2,bs*F.div*4));ramp(u.flanger.lg.gain,0.0012+0.0032*F.depth);ramp(u.flanger.fb.gain,0.3+0.5*F.depth);
  if(F.type!=='gate'||!on)D.decks.forEach(d=>{d.n.gate.gain.cancelScheduledValues(c.currentTime);ramp(d.n.gate.gain,1,0.005);d.gateTo=0});
}
function gateTick(){
  const F=D.fx;if(!D.ready||!F.on||F.type!=='gate')return;
  const now=c.currentTime,ahead=now+0.25;
  for(const d of fxDecks()){
    if(!d.playing||!d.track||!d.segs.length)continue;
    const s=d.segs[d.segs.length-1],L=F.div*T_(d),off=1-F.depth;
    // slice boundaries in source time → heard ctx time (source time lat later)
    const pFrom=srcAt(d,Math.max(now,d.gateTo||now)-D.lat),k0=Math.ceil((pFrom-first(d))/L-1e-6);
    for(let k=k0;k<k0+64;k++){
      const ps=first(d)+k*L,ts=s.t0+(ps-s.p0)/s.r+D.lat;if(ts>ahead)break;if(ts<now)continue;
      const g=d.n.gate.gain,te=ts+L*0.5/s.r;
      g.setTargetAtTime(1,ts,0.003);g.setTargetAtTime(off,te,0.004);d.gateTo=te;
    }
  }
}
function rollOn(d){
  if(!d.playing||!d.track)return;const now=c.currentTime;
  d.slip={t0:now,p0:srcAt(d,now),r:effRate(d),loop:d.loop};
  const L=D.fx.div*T_(d),p=srcAt(d,now),ls=first(d)+Math.floor((p-first(d))/L)*L;
  setLoop(d,D.fx.div,ls);
}
function rollOff(d){
  if(!d.slip)return;const s=d.slip,now=c.currentTime;d.slip=null;
  const vp=s.p0+(now-s.t0)*s.r;d.loop=null;
  if(d.playing)jump(d,vp);else d.pos=vp;
  renderDeck(d);
}
function brake(d){
  if(!d.playing||d.braking)return;
  const dur=Math.max(0.35,Math.min(4,D.fx.div*2*60/(d.track.bpm*effRate(d)))),now=c.currentTime,p=srcAt(d,now);
  d.braking=true;d.segs.push({t0:now,p0:p,r:effRate(d),ramp:dur,loop:null});
  const pr=d.src.playbackRate;pr.cancelScheduledValues(now);pr.setValueAtTime(effRate(d),now);pr.linearRampToValueAtTime(0.0001,now+dur);
  stSched(d,{semitones:d.semis,output:now+D.lat});
  setTimeout(()=>{d.braking=false;if(d.playing){stopDeck(d);stSched(d,{semitones:semisOf(d)})}if(D.fx.on&&D.fx.type==='brake'){D.fx.on=false;renderFx()}},dur*1000+40);
}
function setFxOn(on){
  const F=D.fx,was=F.on;F.on=on;
  if(F.type==='roll'){for(const d of D.decks)if(on&&fxDecks().includes(d))rollOn(d);else rollOff(d)}
  if(F.type==='brake'&&on&&!was){const ds=fxDecks().filter(d=>d.playing);if(!ds.length)F.on=false;ds.forEach(brake)}
  updateFx();renderFx();
}
function setFxType(tp){
  if(D.fx.on)setFxOn(false);D.fx.type=tp;updateFx();renderFx();
}

/* ---------- sampler (synthesized, no samples to license) ---------- */
function noiseBuf(sec){const n=Math.floor(c.sampleRate*sec),b=c.createBuffer(1,n,c.sampleRate),x=b.getChannelData(0);for(let i=0;i<n;i++)x[i]=Math.random()*2-1;return b}
function sampler(kind){
  if(!D.ready)return;c.resume();const now=c.currentTime+0.01,out=D.smp;
  const md=D.decks.find(d=>d.playing)||D.decks.find(d=>d.track),bs=md?60/(md.track.bpm*effRate(md)):0.5;
  if(kind==='horn'){
    const pat=[[0,0.11],[0.16,0.11],[0.32,0.62]];
    for(const [o,l] of pat){const g=gain(0);g.connect(out);const lp=bq('lowpass',3200);lp.connect(g);
      for(const f of [415,523,622]){const s=c.createOscillator();s.type='sawtooth';s.frequency.setValueAtTime(f*0.97,now+o);s.frequency.linearRampToValueAtTime(f,now+o+0.04);s.connect(lp);s.start(now+o);s.stop(now+o+l+0.05)}
      g.gain.setValueAtTime(0,now+o);g.gain.linearRampToValueAtTime(0.16,now+o+0.015);g.gain.setValueAtTime(0.16,now+o+l-0.03);g.gain.linearRampToValueAtTime(0,now+o+l)}
  }else if(kind==='siren'){
    const s=c.createOscillator(),l=c.createOscillator(),lg=gain(380),g=gain(0);s.type='square';s.frequency.value=980;l.frequency.value=1/(bs);
    l.connect(lg).connect(s.frequency);const lp=bq('lowpass',2400);s.connect(lp).connect(g).connect(out);
    const len=bs*8;g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(0.1,now+0.05);g.gain.setValueAtTime(0.1,now+len-0.3);g.gain.linearRampToValueAtTime(0,now+len);
    s.start(now);l.start(now);s.stop(now+len+0.05);l.stop(now+len+0.05);
  }else if(kind==='riser'){
    const len=bs*16,src=c.createBufferSource();src.buffer=noiseBuf(len+0.1);const bp=bq('bandpass',300,4),g=gain(0);
    bp.frequency.setValueAtTime(250,now);bp.frequency.exponentialRampToValueAtTime(9000,now+len);
    g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(0.5,now+len);g.gain.linearRampToValueAtTime(0,now+len+0.05);
    src.connect(bp).connect(g).connect(out);src.start(now);
  }else if(kind==='impact'){
    const o=c.createOscillator(),g=gain(0);o.frequency.setValueAtTime(90,now);o.frequency.exponentialRampToValueAtTime(28,now+1.4);
    g.gain.setValueAtTime(0.9,now);g.gain.exponentialRampToValueAtTime(0.001,now+1.6);o.connect(g).connect(out);o.start(now);o.stop(now+1.7);
    const nz=c.createBufferSource();nz.buffer=noiseBuf(1.2);const lp=bq('lowpass',1800),ng=gain(0);
    ng.gain.setValueAtTime(0.35,now);ng.gain.exponentialRampToValueAtTime(0.001,now+1.1);nz.connect(lp).connect(ng);ng.connect(out);ng.connect(D.fxu.reverb.cv);nz.start(now);
  }
}

/* ---------- auto transition ---------- */
function autoStart(){
  if(D.auto){autoCancel();return}
  const from=D.decks.find(d=>d.playing&&d.track&&(D.decks.filter(x=>x.playing).length===1||d.i===D.masterI)),to=from&&other(from);
  if(!from||!to.track||to.playing){note(t('djAutoNeed'));return}
  setSync(to,true);
  const bars=D.autoBars,now=c.currentTime+0.05,pf=srcAt(from,now);
  // start on the next bar of the playing song, at least half a second away
  let nb=Math.ceil(beatF(from,pf)-from.track.down);nb=Math.ceil(nb/4)*4+from.track.down;
  let tStart=now+(first(from)+nb*T_(from)-pf)/effRate(from);if(tStart<now+0.5)tStart+=4*T_(from)/effRate(from);
  const p0=Math.max(to.pos,firstDown(to));to.pos=snapBar(to,p0);
  to.eq.lo=-1;applyEq(to);syncKnobs(to);
  if(to.fader<0.6){to.fader=0.85;applyFader(to);syncFader(to)}
  D.xf=from.i===0?-1:1;applyXf();syncXf();
  startDeck(to,tStart);
  D.auto={from,to,t0:tStart,len:bars*4*60/(from.track.bpm*effRate(from)),swapped:false,ending:false};
  renderAuto();
}
function autoStep(){
  const A=D.auto;if(!A)return;const now=c.currentTime-D.lat;
  const x=clamp((now-A.t0)/A.len,0,1);
  if(now<A.t0){renderAuto();return}
  const dir=A.from.i===0?1:-1;D.xf=clamp(-dir+2*dir*Math.min(1,x*1.15),-1,1);applyXf();syncXf();
  if(!A.swapped&&x>=0.5){A.swapped=true;A.from.eq.lo=-1;A.to.eq.lo=0;applyEq(A.from);applyEq(A.to);syncKnobs(A.from);syncKnobs(A.to)}
  if(x>=1){A.ending=true;const f=A.from;stopDeck(f);f.eq.lo=0;applyEq(f);syncKnobs(f);D.masterI=A.to.i;A.to.sync=false;D.auto=null;renderDeck(A.to);renderMatch();renderRecsSoon()}
  renderAuto(x);
}
function autoCancel(){D.auto=null;renderAuto()}

/* ---------- recording (AudioWorklet → 16-bit WAV) ---------- */
const REC_SRC=`class R extends AudioWorkletProcessor{constructor(){super();this.on=true;this.n=0;this.L=new Float32Array(32768);this.R=new Float32Array(32768);this.port.onmessage=e=>{if(e.data==='stop'){this.flush();this.on=false;this.port.postMessage('done')}}}
flush(){if(this.n){this.port.postMessage([this.L.slice(0,this.n),this.R.slice(0,this.n)]);this.n=0}}
process(inp){if(!this.on)return false;const i=inp[0];if(i&&i.length){const a=i[0],b=i[1]||i[0];this.L.set(a,this.n);this.R.set(b,this.n);this.n+=a.length;if(this.n+256>this.L.length)this.flush()}return true}}
registerProcessor('cr-rec',R);`;
async function recToggle(){
  if(D.rec){recStop();return}
  try{
    await init();c.resume();
    if(!D.recMod){D.recMod=c.audioWorklet.addModule(URL.createObjectURL(new Blob([REC_SRC],{type:'text/javascript'})))}
    await D.recMod;
    const node=new AudioWorkletNode(c,'cr-rec',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[1]});
    const sink=gain(0);node.connect(sink).connect(c.destination);D.lim.connect(node);
    const R={node,sink,chunks:[],frames:0,t0:performance.now(),sr:c.sampleRate};
    node.port.onmessage=e=>{
      if(e.data==='done'){recSave(R);return}
      const [L,Rr]=e.data,n=L.length,pcm=new Int16Array(n*2);
      for(let i=0,j=0;i<n;i++){let a=L[i],b=Rr[i];a=a>1?1:a<-1?-1:a;b=b>1?1:b<-1?-1:b;pcm[j++]=a*32767;pcm[j++]=b*32767}
      R.chunks.push(pcm);R.frames+=n;
    };
    D.rec=R;renderRec();
  }catch(e){console.warn(e);note(t('djRecFail'))}
}
function recStop(){const R=D.rec;if(!R)return;D.rec=null;try{D.lim.disconnect(R.node)}catch(e){}R.node.port.postMessage('stop');renderRec()}
function recSave(R){
  try{R.node.disconnect();R.sink.disconnect()}catch(e){}
  const bytes=R.frames*4,h=new DataView(new ArrayBuffer(44)),w=(o,s)=>{for(let i=0;i<4;i++)h.setUint8(o+i,s.charCodeAt(i))};
  w(0,'RIFF');h.setUint32(4,36+bytes,true);w(8,'WAVE');w(12,'fmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,2,true);
  h.setUint32(24,R.sr,true);h.setUint32(28,R.sr*4,true);h.setUint16(32,4,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,bytes,true);
  const blob=new Blob([h.buffer,...R.chunks],{type:'audio/wav'}),d=new Date(),p=n=>String(n).padStart(2,'0');
  CR.saveBlob(blob,`Chord Room mix ${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}.wav`);
  note(t('djRecSaved',{s:(blob.size/1048576).toFixed(1)}));
}

/* ---------- loading songs ---------- */
function keyEff(d){const k=d.track.key,sh=d.semis+(d.keyLock&&!D.noStretch?0:Math.round(12*Math.log2(effRate(d))));return {pc:mod(k.pc+sh,12),mode:k.mode}}
const bpmEff=d=>d.track.bpm*d.rate;
async function loadInto(d,getBuf,name,hint,meta){
  await init();
  if(d.loading)return;d.loading=true;
  if(CR.log)CR.log('dj_load',name);
  if(d.playing)stopDeck(d);
  if(D.auto)autoCancel();
  busyDeck(d,t('djDecoding'),0.03);
  try{
    let a=meta&&meta.analysis,buffer;
    if(a){buffer=a.buffer}else{
      buffer=await getBuf();
      busyDeck(d,t('djAnalyzing'),0.1);
      a=await CR.analyzeTrack(buffer,p=>busyDeck(d,t('djAnalyzing'),0.1+p*0.9),hint);
    }
    if(d.slip)d.slip=null;
    d.track={name,buffer,bpm:a.bpm,offset:a.offset,down:a.down||0,key:a.key,wave:a.wave,lufs:a.lufs,dur:buffer.duration,preview:!!(meta&&meta.preview),artist:(meta&&meta.artist)||''};
    d.loop=null;d.cues=[null,null,null,null];d.semis=0;d.bend=1;d.segs=[];d.lastBeat=-9;
    if(d.sync&&other(d).track){const r=syncRate(d,other(d));d.rate=r.r;d.k=r.k}else{d.sync=false;d.tempo=0;d.rate=1}
    d.cue=firstDown(d);d.pos=d.cue;
    d.autoGain=a.lufs!=null?clamp(-9-a.lufs,-12,6):0;applyEq(d);
    d.tiles=null;d.ovc=null;
    if(!D.decks[D.masterI].track)D.masterI=d.i;
  }catch(e){console.warn(e);note(t('djLoadFail'))}
  finally{d.loading=false;busyDeck(d,null);renderDeck(d);renderMatch();renderRecsSoon()}
}
function loadFile(d,file){
  if(!file)return;const nm=file.name.replace(/\.[a-z0-9]{2,5}$/i,'');
  loadInto(d,async()=>c.decodeAudioData(await file.arrayBuffer()),nm,CR.libItem(nm));
}
function loadTool(d){const s=CR.toolSong();if(!s){note(t('djNoTool'));return}loadInto(d,null,s.name,null,{analysis:s})}
function loadDemo(d,n){
  const o=DEMOS[(n!=null?n:D.demoN++)%DEMOS.length],name=t('djDemoName',{n:(DEMOS.indexOf(o)+1),b:o.bpm});
  // tempo, grid and key of the demos are known (same progression as the tool's demo), so skip the slow analysis
  loadInto(d,()=>demoBuf(o),name,{bpm:o.bpm,offset:0.3,down:0,key:{pc:mod(o.shift,12),mode:0}});
}
// render 8 bars (4 drum intro + the 4-chord loop, fast) and repeat the loop → 40 bars, with a short crossfade at each seam
async function demoBuf(o){
  const b=await CR.synthDemo({bpm:o.bpm,shift:o.shift,bars:8,intro:4}),sr=b.sampleRate,bar=4*60/o.bpm,lead=0.3,reps=8;
  const at=x=>Math.round((lead+x*bar)*sr),s0=at(4),s1=at(8),tail=b.length-s1,xf=256;
  const out=c.createBuffer(2,s1+reps*(s1-s0)+tail,sr);
  for(let ch=0;ch<2;ch++){
    const src=b.getChannelData(Math.min(ch,b.numberOfChannels-1)),dst=out.getChannelData(ch);
    dst.set(src.subarray(0,s1));
    for(let r=0;r<reps;r++){const d0=s1+r*(s1-s0);for(let i=0;i<s1-s0;i++){let v=src[s0+i];if(i<xf){const g=i/xf;v=v*g+src[s1+i]*(1-g)}dst[d0+i]=v}}
    dst.set(src.subarray(s1),s1+reps*(s1-s0));
  }
  return out;
}
async function loadLib(d,it){
  if(!it.file_path||!CR.signedIn())return;
  return loadInto(d,async()=>{const url=await CR.songFileUrl(it.file_path);return c.decodeAudioData(await (await fetch(url)).arrayBuffer())},it.name,it);
}
async function loadCatalog(d,r){
  return loadInto(d,async()=>{const url=await CR.freshPreview(r);if(!url)throw new Error('no preview');return c.decodeAudioData(await (await fetch(url)).arrayBuffer())},
    `${r.artist} – ${r.title}`,null,{preview:true,artist:r.artist});
}

/* ================= interface ================= */
let noteT=0;
function note(msg){const n=$('#djNote');if(!n)return;n.textContent=msg;n.hidden=false;n.classList.remove('in');void n.offsetWidth;n.classList.add('in');clearTimeout(noteT);noteT=setTimeout(()=>{n.hidden=true},5200)}
const IC={
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
  load:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  auto:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h11l-3-3M20 17H9l3 3"/><circle cx="19" cy="7" r="1.6" fill="currentColor"/><circle cx="5" cy="17" r="1.6" fill="currentColor"/></svg>',
  demo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'};
const deckHTML=i=>`
<div class="dk" data-d="${i}" style="--dc:${COL[i]}">
  <div class="dkhead"><span class="dkl">${LET[i]}</span><div class="dkinfo"><div class="dkt"></div><div class="dka"></div></div>
    <button type="button" class="dkload" data-act="load">${IC.load}<span data-i="djLoad"></span></button></div>
  <div class="dkbig"><div class="dkbpm"><b class="mono">—</b><span>BPM</span><i class="mono"></i></div><div class="dkkey"></div><div class="dktime mono">—</div></div>
  <canvas class="dkov"></canvas>
  <div class="dkmid">
    <div class="jog" data-it="djJogT" tabindex="-1"><div class="jring"></div><div class="jplat"><i class="jdot"></i></div><div class="jcen"><b>${LET[i]}</b><span class="mono"></span></div></div>
    <div class="tempo">
      <button type="button" class="trange mono" data-act="range" data-it="djRangeT">±8%</button>
      <div class="tfw"><input type="range" class="tfader" min="-1" max="1" step="0.0005" value="0" data-it="djTempoT"><i class="tzero"></i></div>
      <div class="tbend"><button type="button" data-act="bendUp" data-it="djBendUpT">+</button><button type="button" data-act="bendDown" data-it="djBendDownT">−</button></div>
    </div>
  </div>
  <div class="dkctl">
    <button type="button" class="bcue" data-act="cue" data-it="djCueT">CUE</button>
    <button type="button" class="bplay" data-act="play" data-it="djPlayT">${IC.play}</button>
    <button type="button" class="bsync" data-act="sync" data-it="djSyncT">SYNC</button>
    <button type="button" class="bmst" data-act="master" data-it="djMasterT">MASTER</button>
  </div>
  <div class="dkkeyrow">
    <button type="button" class="bkl on" data-act="keylock" data-it="djKeyLockT">KEY LOCK</button>
    <div class="kshift"><button type="button" data-act="keyDown" data-it="keyDown">−</button><output class="mono">0</output><button type="button" data-act="keyUp" data-it="keyUp">+</button></div>
    <button type="button" class="bks" data-act="keysync" data-it="djKeySyncT">KEY SYNC</button>
  </div>
  <div class="dkpads">
    <div class="ptabs"><button type="button" data-pm="hot" class="on">HOT CUE</button><button type="button" data-pm="loop">LOOP</button><button type="button" data-pm="jump">JUMP</button></div>
    <div class="pgrid">${[0,1,2,3].map(k=>`<button type="button" data-p="${k}"></button>`).join('')}</div>
  </div>
  <div class="dkbusy" hidden><div class="bm"></div><div class="bb"><i></i></div></div>
  <div class="dkdrop" hidden><span data-i="djDropHere"></span></div>
</div>`;
const chanHTML=i=>`
<div class="ch" data-d="${i}" style="--dc:${COL[i]}">
  <span class="chl">${LET[i]}</span>
  <div class="knob" data-k="trim"></div><div class="knob" data-k="hi"></div><div class="knob" data-k="mid"></div><div class="knob" data-k="lo"></div><div class="knob filt" data-k="filt"></div>
  <div class="chbot"><div class="vu"><i></i><b></b></div><div class="cfw"><input type="range" class="cf" min="0" max="1" step="0.001" value="0.85" data-it="djFaderT"></div></div>
</div>`;
function build(){
  const v=$('#djView');
  v.innerHTML=`
<div class="djhead">
  <div><div class="eyebrow" data-i="djEyebrow"></div><h1 data-i="djTitle"></h1><p data-i="djSub"></p></div>
  <div class="djacts">
    <button type="button" class="btn solid" id="djDemoBoth">${IC.demo}<span data-i="djTryDemo"></span></button>
    <div class="djauto"><button type="button" class="btn" id="djAuto" data-it="djAutoT">${IC.auto}<span data-i="djAuto"></span><i class="aprog"></i></button>
      <select id="djBars" aria-label="bars"><option value="8"></option><option value="16" selected></option><option value="32"></option></select></div>
    <button type="button" class="btn rec" id="djRec" data-it="djRecT"><i class="rdot"></i><span data-i="djRec"></span><span class="rt mono" id="djRecT"></span></button>
  </div>
</div>
<div class="djcon" id="djCon" dir="ltr">
  <div class="djglow ga"></div><div class="djglow gb"></div>
  <div class="djwv"><canvas id="djWave"></canvas><div class="djzoom"><button type="button" id="djZo">−</button><button type="button" id="djZi">+</button></div></div>
  <div class="djrow">${deckHTML(0)}
    <div class="mixer"><canvas class="mxviz" id="djViz"></canvas>
      <div class="mxch">${chanHTML(0)}
        <div class="mxmid"><div class="knob" data-k="master"></div><div class="mvu"><div class="vu"><i></i><b></b></div><div class="vu"><i></i><b></b></div></div>
          <button type="button" class="bcurve mono" id="djCurve" data-it="djCurveT"></button></div>
        ${chanHTML(1)}</div>
      <div class="xfw"><span style="color:${COL[0]}">A</span><input type="range" id="djXf" min="-1" max="1" step="0.001" value="0" data-it="djXfT"><span style="color:${COL[1]}">B</span></div>
    </div>
  ${deckHTML(1)}</div>
  <div class="djfx">
    <div class="fxg"><span class="fxl" data-i="djFx"></span><div class="fxsel">${FXS.map(f=>`<button type="button" data-fx="${f}">${f.toUpperCase()}</button>`).join('')}</div></div>
    <div class="fxg"><span class="fxl" data-i="djBeat"></span><div class="fxdiv">${DIVS.map(([v,l])=>`<button type="button" class="mono" data-div="${v}">${l}</button>`).join('')}</div></div>
    <div class="fxg"><span class="fxl" data-it="djFxTargetT">FX →</span><div class="fxtg"><button type="button" data-tg="0" style="--dc:${COL[0]}">A</button><button type="button" data-tg="M">A+B</button><button type="button" data-tg="1" style="--dc:${COL[1]}">B</button></div></div>
    <div class="fxg fxk"><div class="knob" data-k="depth"></div></div>
    <button type="button" class="fxon" id="djFxOn" data-it="djFxOnT">FX</button>
    <div class="fxg smp"><span class="fxl" data-i="djSampler"></span><div class="smpads"><button type="button" data-s="horn" data-i="djHorn"></button><button type="button" data-s="siren" data-i="djSiren"></button><button type="button" data-s="riser" data-i="djRiser"></button><button type="button" data-s="impact" data-i="djImpact"></button></div></div>
  </div>
  <div class="djkeys" data-i="djKeysHint"></div>
</div>
<div class="djlow">
  <section class="djmatch"><h2 data-i="djMatch"></h2><div id="djMatchBody"></div></section>
  <section class="djrecs"><h2 data-i="djRecs"></h2><p class="djrh" id="djRecsH"></p><ul id="djRecList"></ul></section>
</div>
<input type="file" id="djFile" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" hidden>
<div class="djmenu" id="djMenu" hidden></div>
<div class="djnote" id="djNote" role="status" hidden></div>
<div class="djpick" id="djPick" hidden><div class="pkin"><div class="pkh"><b data-i="djLibTitle"></b><button type="button" class="btn ghost" id="djPickX" data-i="djClose"></button></div>
  <input type="search" id="djPickQ" data-ip="djLibSearch"><p class="pkn" id="djPickN"></p><ul id="djPickL"></ul></div></div>`;
  D.built=true;wire();CR.applyLang();renderAll();
}

/* ---------- knob widget ---------- */
function arcPath(a0,a1,r){const p=a=>{const rad=(a-90)*Math.PI/180;return [20+r*Math.cos(rad),20+r*Math.sin(rad)]};const [x0,y0]=p(a0),[x1,y1]=p(a1);return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${Math.abs(a1-a0)>180?1:0} ${a1>a0?1:0} ${x1.toFixed(2)} ${y1.toFixed(2)}`}
function knob(el,o){
  const st={v:o.val};
  el.innerHTML=`<svg viewBox="0 0 40 40"><path class="ktrk" d="${arcPath(-135,135,15)}"/><path class="karc"/><circle class="kcap" cx="20" cy="20" r="11"/><line class="kptr" x1="20" y1="20" x2="20" y2="11"/></svg><span class="kl"></span>`;
  el.tabIndex=0;el.setAttribute('role','slider');
  const arc=el.querySelector('.karc'),ptr=el.querySelector('.kptr'),lab=el.querySelector('.kl');
  const draw=()=>{const x=(st.v-o.min)/(o.max-o.min),a=-135+270*x,a0=o.bip?0:-135;
    arc.setAttribute('d',Math.abs(a-a0)<0.5?'':arcPath(Math.min(a,a0),Math.max(a,a0),15));ptr.setAttribute('transform',`rotate(${a} 20 20)`);
    el.setAttribute('aria-valuenow',st.v.toFixed(2));el.classList.toggle('kill',!!o.kill&&st.v<=-0.97);el.classList.toggle('off0',Math.abs(st.v-o.def)<0.005)};
  const set=(v,emit)=>{v=clamp(v,o.min,o.max);if(o.bip&&Math.abs(v)<0.025)v=0;st.v=v;draw();if(emit)o.onChange(v)};
  let y0=0,v0=0;
  el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);y0=e.clientY;v0=st.v;el.classList.add('drag')});
  el.addEventListener('pointermove',e=>{if(!el.hasPointerCapture(e.pointerId))return;set(v0-(e.clientY-y0)/(e.shiftKey?600:150)*(o.max-o.min),true)});
  el.addEventListener('pointerup',e=>{el.classList.remove('drag')});
  el.addEventListener('dblclick',()=>set(o.def,true));
  el.addEventListener('wheel',e=>{e.preventDefault();set(st.v-Math.sign(e.deltaY)*0.04*(o.max-o.min),true)},{passive:false});
  el.addEventListener('keydown',e=>{const s=(o.max-o.min)*(e.shiftKey?0.01:0.05);if(e.key==='ArrowUp'||e.key==='ArrowRight'){e.preventDefault();set(st.v+s,true)}else if(e.key==='ArrowDown'||e.key==='ArrowLeft'){e.preventDefault();set(st.v-s,true)}});
  const api={set:v=>set(v,false),get:()=>st.v,label:x=>{lab.textContent=x;el.title=x;el.setAttribute('aria-label',x)}};
  draw();return api;
}

/* ---------- wiring ---------- */
const KN=[];
function deckEl(d){return document.querySelector(`.dk[data-d="${d.i}"]`)}
function chEl(d){return document.querySelector(`.ch[data-d="${d.i}"]`)}
function wire(){
  D.decks.length||(D.decks=[null,null]);
  for(let i=0;i<2;i++){
    const el=document.querySelector(`.dk[data-d="${i}"]`),dk=()=>D.decks[i];
    const act=(a,e)=>{const d=dk();if(!d)return;
      if(a==='load')openMenu(i,e.currentTarget);
      else if(a==='play')playPress(d);else if(a==='sync')setSync(d,!d.sync);
      else if(a==='master'){if(d.track){D.masterI=d.i;d.sync=false;const o=other(d);if(o.sync&&o.track){const r=syncRate(o,d);o.rate=r.r;o.k=r.k;applyRate(o)}renderAll()}}
      else if(a==='keylock'){d.keyLock=!d.keyLock;applyRate(d);applyKey(d)}
      else if(a==='keyDown'){d.semis=Math.max(-12,d.semis-1);applyKey(d)}else if(a==='keyUp'){d.semis=Math.min(12,d.semis+1);applyKey(d)}
      else if(a==='keysync')keySync(d);else if(a==='range')cycleRange(d)};
    el.querySelectorAll('[data-act]').forEach(b=>{
      const a=b.dataset.act;
      if(a==='cue'){b.addEventListener('pointerdown',e=>{e.preventDefault();ensure().then(()=>cueDown(dk()))});b.addEventListener('pointerup',()=>dk()&&cueUp(dk()));b.addEventListener('pointerleave',()=>dk()&&cueUp(dk()));return}
      if(a==='bendUp'||a==='bendDown'){const f=a==='bendUp'?1.04:0.96;b.addEventListener('pointerdown',e=>{e.preventDefault();const d=dk();if(d)setBend(d,f)});['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>{const d=dk();if(d&&d.bend!==1)setBend(d,1)}));return}
      b.addEventListener('click',e=>ensure().then(()=>act(a,e)));
    });
    const tf=el.querySelector('.tfader');
    tf.addEventListener('input',()=>{const d=dk();if(d)setTempo(d,-(+tf.value),true)});
    tf.addEventListener('dblclick',()=>{const d=dk();if(d){tf.value=0;setTempo(d,0,true)}});
    el.querySelectorAll('[data-pm]').forEach(b=>b.onclick=()=>{const d=dk();if(!d)return;d.pm=b.dataset.pm;renderDeck(d)});
    el.querySelectorAll('[data-p]').forEach(b=>{
      const k=+b.dataset.p;
      b.addEventListener('click',e=>{const d=dk();if(!d||!d.track)return;
        if(d.pm==='hot')hotCue(d,k,e.shiftKey);else if(d.pm==='loop')loopPad(d,[1,2,4,8][k]);else beatJump(d,[-4,-1,1,4][k])});
      b.addEventListener('contextmenu',e=>{const d=dk();if(d&&d.pm==='hot'){e.preventDefault();hotCue(d,k,true)}});
    });
    const ovc=el.querySelector('.dkov');ovc.addEventListener('pointerdown',e=>{const d=dk();if(!d||!d.track)return;const r=ovc.getBoundingClientRect();jump(d,(e.clientX-r.left)/r.width*d.track.dur)});
    wireJog(i,el.querySelector('.jog'));
    // drag & drop a file onto the deck
    el.addEventListener('dragover',e=>{e.preventDefault();el.querySelector('.dkdrop').hidden=false});
    el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget))el.querySelector('.dkdrop').hidden=true});
    el.addEventListener('drop',e=>{e.preventDefault();el.querySelector('.dkdrop').hidden=true;const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)loadFile(D.decks[i],f)});
    // channel strip
    const ch=document.querySelector(`.ch[data-d="${i}"]`);
    const mk=(k,o)=>{const kb=knob(ch.querySelector(`[data-k="${k}"]`),{min:-1,max:1,val:0,def:0,bip:true,kill:k==='hi'||k==='mid'||k==='lo',onChange:v=>{const d=dk();if(!d)return;d.eq[k]=v;applyEq(d)},...o});KN.push({i,k,kb});return kb};
    ['trim','hi','mid','lo','filt'].forEach(k=>mk(k));
    const cf=ch.querySelector('.cf');cf.addEventListener('input',()=>{const d=dk();if(!d)return;d.fader=+cf.value;applyFader(d)});
  }
  KN.push({i:-1,k:'master',kb:knob(document.querySelector('[data-k="master"]'),{min:0,max:1,val:D.master,def:0.85,bip:false,onChange:v=>{D.master=v;if(D.mst)ramp(D.mst.gain,v*1.15)}})});
  KN.push({i:-1,k:'depth',kb:knob(document.querySelector('[data-k="depth"]'),{min:0,max:1,val:D.fx.depth,def:0.55,bip:false,onChange:v=>{D.fx.depth=v;updateFx()}})});
  const xf=$('#djXf');xf.addEventListener('input',()=>{if(D.auto)autoCancel();D.xf=+xf.value;if(D.ready)applyXf()});
  xf.addEventListener('dblclick',()=>{xf.value=0;D.xf=0;if(D.ready)applyXf()});
  $('#djCurve').onclick=()=>{D.curve=D.curve==='smooth'?'cut':'smooth';if(D.ready)applyXf();renderMixer()};
  document.querySelectorAll('[data-fx]').forEach(b=>b.onclick=()=>ensure().then(()=>setFxType(b.dataset.fx)));
  document.querySelectorAll('[data-div]').forEach(b=>b.onclick=()=>{D.fx.div=+b.dataset.div;if(D.fx.on&&D.fx.type==='roll'){for(const d of fxDecks())if(d.slip){rollOff(d);rollOn(d)}}updateFx();renderFx()});
  document.querySelectorAll('[data-tg]').forEach(b=>b.onclick=()=>{const was=D.fx.on;if(was)setFxOn(false);D.fx.tg=b.dataset.tg;if(was)setFxOn(true);renderFx()});
  $('#djFxOn').onclick=()=>ensure().then(()=>setFxOn(!D.fx.on));
  document.querySelectorAll('[data-s]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();ensure().then(()=>{sampler(b.dataset.s);b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit')})}));
  $('#djZi').onclick=()=>{D.win=Math.max(2.5,D.win/1.4)};$('#djZo').onclick=()=>{D.win=Math.min(24,D.win*1.4)};
  $('#djAuto').onclick=()=>ensure().then(autoStart);
  $('#djBars').onchange=e=>{D.autoBars=+e.target.value};
  $('#djRec').onclick=()=>recToggle();
  $('#djDemoBoth').onclick=()=>ensure().then(()=>{loadDemo(D.decks[0],0);loadDemo(D.decks[1],1);D.demoN=2});
  $('#djFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)loadFile(D.decks[D.pickFor],f)};
  $('#djPickX').onclick=()=>{$('#djPick').hidden=true};
  $('#djPick').addEventListener('click',e=>{if(e.target.id==='djPick')$('#djPick').hidden=true});
  $('#djPickQ').oninput=renderPick;
  document.addEventListener('pointerdown',e=>{const m=$('#djMenu');if(m&&!m.hidden&&!m.contains(e.target)&&!e.target.closest('.dkload'))m.hidden=true});
  window.addEventListener('resize',()=>{if(D.visible)sizeAll()});
  window.addEventListener('scroll',()=>{const m=$('#djMenu');if(m&&!m.hidden&&Math.abs(window.scrollY-(D.menuY||0))>40)m.hidden=true},{passive:true});
}
const ensure=()=>init();
function openMenu(i,btn){
  const m=$('#djMenu');D.pickFor=i;
  const items=[['upload',t('djUpload')],['tool',t('djFromTool')],['lib',t('djFromLib')],['demo',t('djDemo')]];
  m.innerHTML=items.map(([k,l])=>`<button type="button" data-m="${k}">${esc(l)}</button>`).join('');
  const r=btn.getBoundingClientRect();D.menuY=window.scrollY;m.style.top=(r.bottom+6)+'px';
  m.style.left=Math.max(8,Math.min(window.innerWidth-230,r.left))+'px';m.hidden=false;
  m.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{m.hidden=true;const d=D.decks[i],k=b.dataset.m;
    if(k==='upload')$('#djFile').click();else if(k==='tool')loadTool(d);else if(k==='demo')loadDemo(d);else openPick(i)});
}
function openPick(i){D.pickFor=i;$('#djPick').hidden=false;$('#djPickQ').value='';renderPick();setTimeout(()=>$('#djPickQ').focus(),30)}
function renderPick(){
  const q=$('#djPickQ').value.trim().toLowerCase(),ul=$('#djPickL'),signed=CR.signedIn();
  const list=CR.readLib().filter(x=>x.key&&x.bpm&&(!q||x.name.toLowerCase().includes(q)));
  $('#djPickN').textContent=!signed?t('djLibSignIn'):list.length?'':t('djLibEmpty');ul.innerHTML='';
  for(const it of list){
    const li=document.createElement('li'),ok=signed&&!!it.file_path;li.className='pkr'+(ok?'':' dis');
    li.innerHTML=`<span class="kbw"></span><div class="pkt"><div class="tt"></div><div class="ar mono"></div></div><button type="button" class="btn ghost"></button>`;
    li.querySelector('.kbw').append(CR.keyBadge({pc:it.key.pc,mode:it.key.mode}));li.querySelector('.tt').textContent=it.name;
    li.querySelector('.ar').textContent=`${CR.fmtBpm(Math.round(it.bpm*10)/10)} BPM · ${CR.fmtS(it.dur||0)}`+(ok?'':` · ${t('djLibNoFile')}`);
    const b=li.querySelector('button');b.textContent=t('djLoadTo',{d:LET[D.pickFor]});b.disabled=!ok;
    b.onclick=()=>{$('#djPick').hidden=true;loadLib(D.decks[D.pickFor],it)};ul.appendChild(li);
  }
}

/* jog: drag around the platter. playing → nudge tempo, stopped → move */
function wireJog(i,el){
  let last=null,lastT=0,idle=0;
  const ang=e=>{const r=el.getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))*180/Math.PI};
  el.addEventListener('pointerdown',e=>{const d=D.decks[i];if(!d||!d.track)return;e.preventDefault();el.setPointerCapture(e.pointerId);last=ang(e);lastT=performance.now();el.classList.add('touch')});
  el.addEventListener('pointermove',e=>{
    const d=D.decks[i];if(last==null||!d||!d.track)return;
    let a=ang(e),da=a-last;if(da>180)da-=360;if(da<-180)da+=360;last=a;const now=performance.now(),dt=Math.max(8,now-lastT);lastT=now;
    if(d.playing){setBend(d,clamp(1+da/dt*0.06,0.7,1.3));clearTimeout(idle);idle=setTimeout(()=>{if(d.bend!==1)setBend(d,1)},90)}
    else{d.pos=clamp(d.pos+da/200,0,d.track.dur);renderDeck(d)}
  });
  const end=()=>{last=null;el.classList.remove('touch');const d=D.decks[i];if(d&&d.bend!==1)setBend(d,1)};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
}

/* ---------- render ---------- */
function busyDeck(d,msg,p){
  const el=deckEl(d);if(!el)return;const b=el.querySelector('.dkbusy');
  if(msg===null){b.hidden=true;return}b.hidden=false;b.querySelector('.bm').textContent=msg;b.querySelector('.bb i').style.width=Math.round((p||0)*100)+'%';
}
function renderDeck(d){
  const el=deckEl(d);if(!el)return;const tr=d.track;
  el.classList.toggle('empty',!tr);el.classList.toggle('playing',d.playing);el.classList.toggle('master',!!tr&&D.masterI===d.i);
  el.querySelector('.dkt').textContent=tr?tr.name:t('djEmptyDeck');
  el.querySelector('.dka').textContent=tr?(tr.preview?t('djPreviewTag'):tr.artist||''):t('djEmptyHint');
  const bp=el.querySelector('.dkbpm');
  bp.querySelector('b').textContent=tr?(bpmEff(d)).toFixed(1):'—';
  const pct=(d.rate-1)*100;bp.querySelector('i').textContent=tr?(Math.abs(pct)<0.05?'0.0%':(pct>0?'+':'')+pct.toFixed(1)+'%'):'';
  const kk=el.querySelector('.dkkey');kk.innerHTML='';
  if(tr){const ke=keyEff(d);kk.append(CR.keyBadge(ke));if(ke.pc!==tr.key.pc)kk.insertAdjacentHTML('beforeend',`<s class="mono">${esc(CR.keyText(tr.key))}</s>`)}
  const pb=el.querySelector('.bplay');if(pb.dataset.st!==String(d.playing)){pb.dataset.st=String(d.playing);pb.innerHTML=d.playing?IC.pause:IC.play}pb.classList.toggle('on',d.playing);pb.classList.toggle('wait',d.playing&&d.waitUntil>0);
  el.querySelector('.bcue').classList.toggle('on',!!tr&&!d.playing&&Math.abs(d.pos-d.cue)<0.02);
  el.querySelector('.bsync').classList.toggle('on',d.sync);el.querySelector('.bmst').classList.toggle('on',!!tr&&D.masterI===d.i);
  el.querySelector('.bkl').classList.toggle('on',d.keyLock&&!D.noStretch);el.querySelector('.bkl').disabled=D.noStretch;
  el.querySelector('.kshift output').textContent=(d.semis>0?'+':'')+d.semis;el.querySelector('.kshift').classList.toggle('chg',!!d.semis);
  el.querySelector('.trange').textContent='±'+Math.round(d.range*100)+'%';
  const tf=el.querySelector('.tfader');if(document.activeElement!==tf)tf.value=String(-clamp((d.rate-1)/d.range,-1,1));
  el.querySelectorAll('[data-pm]').forEach(b=>b.classList.toggle('on',b.dataset.pm===d.pm));
  el.querySelectorAll('[data-p]').forEach((b,k)=>{
    b.className='';b.style.removeProperty('--pc');b.disabled=!tr;
    if(d.pm==='hot'){b.textContent='ABCD'[k];b.title=t('djHotT');if(d.cues[k]!=null){b.classList.add('set');b.style.setProperty('--pc',CR.HC_COL[k])}}
    else if(d.pm==='loop'){const n=[1,2,4,8][k];b.textContent=n;b.title=t('djLoopT');if(d.loop&&!d.slip&&d.loop.beats===n)b.classList.add('act')}
    else{b.textContent=['−4','−1','+1','+4'][k];b.title=t('djJumpT')}
  });
  el.querySelectorAll('.dkctl button,.dkkeyrow button,.tempo button,.tfader').forEach(b=>{if(!b.classList.contains('bkl'))b.disabled=!tr});
  if(D.noStretch)el.querySelector('.bkl').title=t('djEngineOff');
}
function renderMixer(){$('#djCurve').textContent=D.curve==='smooth'?'◠':'⊓';$('#djCurve').classList.toggle('on',D.curve==='cut');syncXf();for(const d of D.decks)if(d){syncKnobs(d);syncFader(d)}}
function syncKnobs(d){for(const x of KN)if(x.i===d.i)x.kb.set(d.eq[x.k])}
function syncFader(d){const cf=chEl(d)&&chEl(d).querySelector('.cf');if(cf)cf.value=d.fader}
function syncXf(){const x=$('#djXf');if(x)x.value=D.xf}
function renderFx(){
  const F=D.fx;
  document.querySelectorAll('[data-fx]').forEach(b=>b.classList.toggle('on',b.dataset.fx===F.type));
  document.querySelectorAll('[data-div]').forEach(b=>b.classList.toggle('on',+b.dataset.div===F.div));
  document.querySelectorAll('[data-tg]').forEach(b=>b.classList.toggle('on',b.dataset.tg===F.tg));
  const on=$('#djFxOn');on.classList.toggle('on',F.on);on.textContent=F.on?F.type.toUpperCase():'FX';
  $('.djfx').dataset.fx=F.type;
}
function renderAuto(x){
  const b=$('#djAuto');if(!b)return;const A=D.auto;b.classList.toggle('on',!!A);
  b.querySelector('span').textContent=A?(x==null||c.currentTime-D.lat<A.t0?t('djWaiting'):t('djAutoRun',{p:Math.round(x*100)})):t('djAuto');
  b.querySelector('.aprog').style.width=A&&x!=null?Math.round(x*100)+'%':'0';b.title=A?t('djAutoStop'):t('djAutoT');
}
function renderRec(){const b=$('#djRec');b.classList.toggle('on',!!D.rec);if(!D.rec)$('#djRecT').textContent=''}
function renderBars(){const o=$('#djBars').options;for(const x of o)x.textContent=t('djBars',{n:x.value})}
function renderAll(){if(!D.built)return;D.decks.forEach(d=>d&&renderDeck(d));renderMixer();renderFx();renderAuto();renderRec();renderBars();
  KN.forEach(x=>x.kb.label(t({trim:'djTrim',hi:'djHi',mid:'djMid',lo:'djLow',filt:'djFilter',master:'djMaster',depth:'djDepth'}[x.k])));renderMatch();renderRecs()}

/* ---------- match panel: Camelot wheel, score, advice ---------- */
function relOf(ka,kb){return CR.camRel(CR.camOf(ka),CR.camOf(kb))}
function keyScore(ka,kb){
  const r=relOf(ka,kb);if(r>=0)return [100,92,86,86][r];
  const a=CR.camOf(ka),b=CR.camOf(kb),dn=Math.min(mod(a.n-b.n,12),mod(b.n-a.n,12));
  if(a.l===b.l&&dn===2)return 62;if(a.l!==b.l&&dn===1)return 55;if(dn===7&&a.l===b.l)return 50;return 18;
}
function wheelSVG(ka,kb){
  const seg=(n,l)=>{const r0=l==='B'?62:40,r1=l==='B'?84:61,a0=n*30-15-90,a1=a0+30,p=(r,a)=>[100+r*Math.cos(a*Math.PI/180),100+r*Math.sin(a*Math.PI/180)];
    const [x0,y0]=p(r1,a0),[x1,y1]=p(r1,a1),[x2,y2]=p(r0,a1),[x3,y3]=p(r0,a0);
    return `M${x0} ${y0}A${r1} ${r1} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 0 0 ${x3} ${y3}Z`};
  const ctr=(n,l)=>{const r=l==='B'?73:50.5,a=(n*30-90)*Math.PI/180;return [100+r*Math.cos(a),100+r*Math.sin(a)]};
  let s='<svg viewBox="0 0 200 200" class="cw">';
  const ca=ka&&CR.camOf(ka),cb=kb&&CR.camOf(kb);
  for(let n=1;n<=12;n++)for(const l of ['A','B']){
    const hot=(ca&&ca.n===n&&ca.l===l)||(cb&&cb.n===n&&cb.l===l);
    s+=`<path class="cws" d="${seg(n,l)}" fill="${CR.camColor(n,l)}" opacity="${hot?1:0.28}"/>`;
    const [x,y]=ctr(n,l);s+=`<text x="${x}" y="${y+3}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#fff" opacity="${hot?1:0.7}">${n}${l}</text>`;
  }
  if(ca&&cb){const [x0,y0]=ctr(ca.n,ca.l),[x1,y1]=ctr(cb.n,cb.l);s+=`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="cwl"/>`}
  [[ca,0],[cb,1]].forEach(([k,i])=>{if(!k)return;const [x,y]=ctr(k.n,k.l),dx=ca&&cb&&ca.n===cb.n&&ca.l===cb.l?(i?7:-7):0;s+=`<circle cx="${x+dx}" cy="${y-11}" r="7" fill="${COL[i]}" class="cwm"/><text x="${x+dx}" y="${y-8}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">${LET[i]}</text>`});
  return s+'</svg>';
}
function renderMatch(){
  const box=$('#djMatchBody');if(!box)return;const [a,b]=D.decks;
  if(!a||!b||!a.track||!b.track){box.innerHTML=`<div class="mneed">${wheelSVG(a&&a.track?keyEff(a):null,b&&b.track?keyEff(b):null)}<p>${esc(t('djMatchNeed'))}</p></div>`;return}
  const m=D.decks[D.masterI].track?D.decks[D.masterI]:a,s=other(m);
  const ka=keyEff(a),kb=keyEff(b),ks=keyScore(ka,kb),fit=CR.bpmFit(bpmEff(a),bpmEff(b)),ts=Math.max(0,1-fit/0.08)*100;
  const score=Math.round(ks*0.6+ts*0.4),lvl=score>=90?'djGreat':score>=72?'djGood':score>=50?'djOk':'djBad';
  const rel=relOf(ka,kb),relName=rel>=0?t(['relSame','relRel','relUp','relDown'][rel]):t('djClash');
  const orig=CR.bpmFit(a.track.bpm,b.track.bpm);
  const adv=[];
  if(fit>0.004&&!s.sync)adv.push([t('djAdvSync',{d:LET[s.i],m:LET[m.i]}),()=>setSync(s,true)]);
  if(orig>0.1)adv.push([t('djAdvFar',{p:Math.round(orig*100)})]);
  if(Math.abs(Math.log2(bpmEff(a)/bpmEff(b)))>0.7)adv.push([t('djAdvHalf')]);
  if(ks<86){const b0=s.semis;s.semis=0;const best=bestShift(s,m);s.semis=b0;if(best!=null&&best!==s.semis)adv.push([t('djAdvKey',{d:LET[s.i],s:(best-s.semis>0?'+':'')+(best-s.semis)}),()=>{s.semis=best;applyKey(s)}])}
  if(!adv.length)adv.push([t('djAdvReady'),()=>autoStart()]);
  box.innerHTML=`<div class="mgrid"><div class="mwheel">${wheelSVG(ka,kb)}<div class="mscore" style="--sc:${score}"><b class="mono">${score}</b><span>${esc(t(lvl))}</span></div></div>
    <div class="minfo"><div class="mline"><span>${esc(t('djKeyL'))}</span><b>${esc(relName)}</b><em class="mono">${esc(CR.keyText(ka))} → ${esc(CR.keyText(kb))}</em></div>
    <div class="mline"><span>${esc(t('djTempoL'))}</span><b class="mono">${bpmEff(a).toFixed(1)} / ${bpmEff(b).toFixed(1)}</b><em class="mono">${fit<0.0005?'✓':(fit*100).toFixed(1)+'%'}</em></div>
    <ul class="madv"></ul></div></div>`;
  const ul=box.querySelector('.madv');
  for(const [txt,fn] of adv){const li=document.createElement('li');li.innerHTML=`<span></span>`;li.querySelector('span').textContent=txt;
    if(fn){const bt=document.createElement('button');bt.type='button';bt.className='btn ghost';bt.textContent=t('djDo');bt.onclick=()=>ensure().then(fn);li.append(bt)}ul.appendChild(li)}
}
function bestShift(s,m){
  const km=keyEff(m),k=s.track.key,vin=s.keyLock&&!D.noStretch?0:Math.round(12*Math.log2(effRate(s)));
  let best=null,bv=99;
  for(let sh=-6;sh<=6;sh++){const kk={pc:mod(k.pc+sh+vin,12),mode:k.mode},r=relOf(km,kk);if(r<0)continue;const cost=Math.abs(sh)+(r===0?0:r===1?0.5:1.5);if(cost<bv){bv=cost;best=sh}}
  return best;
}

/* ---------- next-song picks: my songs + Discover catalog ---------- */
let recT=0;function renderRecsSoon(){clearTimeout(recT);recT=setTimeout(renderRecs,120)}
async function catalogPool(){
  if(D.catP)return D.catP;
  D.catP=(async()=>{try{if(window.Backend&&Backend.enabled&&Backend.catalogList){(await Backend.catalogList('plays',1000)).forEach(CR.rowFromCatalog)}}catch(e){}return true})();
  return D.catP;
}
function renderRecs(){
  const ul=$('#djRecList');if(!ul)return;
  const ref=D.decks.find(d=>d&&d.playing&&d.track&&d.i===D.masterI)||D.decks.find(d=>d&&d.playing&&d.track)||D.decks.find(d=>d&&d.track);
  ul.innerHTML='';
  if(!ref){$('#djRecsH').textContent=t('djRecsNone');return}
  const to=other(ref);$('#djRecsH').textContent=t('djRecsH',{d:ref.track.name});
  if(!D.catLoaded){D.catLoaded=true;catalogPool().then(renderRecsSoon)}
  const kr=keyEff(ref),br=bpmEff(ref),signed=CR.signedIn(),out=[],seen=new Set([ref.track.name,to.track&&to.track.name]);
  const consider=(src,name,key,bpm,extra)=>{
    if(!key||!bpm||seen.has(name))return;seen.add(name);
    const fit=CR.bpmFit(br,bpm);if(fit>0.08)return;
    let rel=relOf(kr,key),shift=0;
    if(rel<0){for(const sh of [1,-1,2,-2]){const r=relOf(kr,{pc:mod(key.pc+sh,12),mode:key.mode});if(r>=0){rel=r;shift=sh;break}}if(rel<0)return}
    out.push({src,name,key,bpm,fit,rel,shift,score:(shift?25:0)+rel*6+fit*300,...extra});
  };
  for(const it of CR.readLib())if(it.key&&it.bpm)consider('mine',it.name,it.key,it.bpm,{it,ok:signed&&!!it.file_path});
  for(const r of Object.values(CR.DC.rows))if(r.a)consider('cat',`${r.artist} – ${r.title}`,{pc:r.a.pc,mode:r.a.mode},r.a.bpm,{r,ok:true});
  out.sort((p,q)=>p.score-q.score);
  if(!out.length){ul.innerHTML=`<li class="rnone">${esc(t('djRecsNone'))}</li>`;return}
  const relName=[t('relSame'),t('relRel'),t('relUp'),t('relDown')];
  for(const o of out.slice(0,24)){
    const li=document.createElement('li');li.className='rrow';
    li.innerHTML=`<span class="kbw"></span>${o.r&&o.r.cover?'<img alt="" loading="lazy">':'<i class="rimg"></i>'}<div class="rt"><div class="tt"></div><div class="ar"></div></div><span class="rtag"></span><div class="ra"></div>`;
    li.querySelector('.kbw').append(CR.keyBadge(o.key));if(o.r&&o.r.cover)li.querySelector('img').src=o.r.cover;
    li.querySelector('.tt').textContent=o.name;
    li.querySelector('.ar').textContent=`${Math.round(o.bpm)} BPM${o.fit>0.004?` · ±${Math.max(1,Math.round(o.fit*100))}%`:''} · ${relName[o.rel]}${o.shift?' · '+t('djWithKey',{s:(o.shift>0?'+':'')+o.shift}):''}`;
    const tag=li.querySelector('.rtag');tag.textContent=o.src==='mine'?t('djMine'):t('djCat');tag.classList.add(o.src);
    const ra=li.querySelector('.ra');
    const lb=document.createElement('button');lb.type='button';lb.className='btn ghost';lb.textContent=t('djLoadTo',{d:LET[to.i]})+(o.src==='cat'?' · 30s':'');
    lb.disabled=!o.ok;if(!o.ok)lb.title=t('djNoFileT');
    lb.onclick=()=>ensure().then(()=>{const d=D.decks[to.i];return (o.src==='mine'?loadLib(d,o.it):loadCatalog(d,o.r))}).then(()=>{const d=D.decks[to.i];if(o.shift&&d.track){d.semis=o.shift;applyKey(d)}});
    ra.append(lb);ul.appendChild(li);
  }
}

/* ---------- canvases: parallel waveforms, overviews, meters, visualizer ---------- */
let dpr=1;
function sizeAll(){
  dpr=Math.min(2,window.devicePixelRatio||1);
  const cv=$('#djWave');if(cv){cv.width=Math.max(1,Math.round(cv.clientWidth*dpr));cv.height=Math.max(1,Math.round(cv.clientHeight*dpr))}
  document.querySelectorAll('.dkov,#djViz').forEach(x=>{x.width=Math.max(1,Math.round(x.clientWidth*dpr));x.height=Math.max(1,Math.round(x.clientHeight*dpr))});
  for(const d of D.decks)if(d){d.tiles=null;d.ovc=null}
}
const TILE=4096;
function laneGeom(){const cv=$('#djWave'),H=cv.height,mid=Math.round(22*dpr),lh=Math.floor((H-mid)/2);return {W:cv.width,H,lh,mid}}
function buildTiles(d,lh){
  const w=d.track.wave,tiles=[];
  for(let x0=0;x0<w.len;x0+=TILE){
    const tw=Math.min(TILE,w.len-x0),cv=document.createElement('canvas');cv.width=tw;cv.height=lh;const g=cv.getContext('2d'),cy=lh/2,amp=lh/2*0.94;
    for(let x=0;x<tw;x++){const j=x0+x,h=Math.max(0.5,w.amp[j]*amp),k=j*3;g.fillStyle=CR.wcol(w.col[k],w.col[k+1],w.col[k+2]);g.fillRect(x,cy-h,1,2*h)}
    g.fillStyle='rgba(255,255,255,.28)';g.beginPath();for(let x=0;x<tw;x++){const h=Math.max(0.3,w.amp[x0+x]*amp*0.36);g.rect(x,cy-h,1,2*h)}g.fill();
    tiles.push({x0,cv});
  }
  d.tiles={lh,list:tiles};
}
function drawLane(g,d,top,lh,W){
  g.fillStyle=d.i?'#130d08':'#080d14';g.fillRect(0,top,W,lh);
  if(!d.track){g.fillStyle='rgba(255,255,255,.22)';g.font=`600 ${12*dpr}px IBM Plex Sans, sans-serif`;g.textAlign='center';g.fillText(t('djEmptyDeck'),W/2,top+lh/2+4*dpr);g.textAlign='left';labelLane(g,d,top);return}
  if(!d.tiles||d.tiles.lh!==lh)buildTiles(d,lh);
  const h=heard(d),span=D.win*effRate(d),t0=h-span/2,rate=d.track.wave.rate,sx0=t0*rate,pxs=W/(span*rate);
  if(d.loop){const x0=(d.loop.ls-t0)/span*W,x1=(d.loop.le-t0)/span*W;g.fillStyle=d.slip?'rgba(255,60,120,.16)':'rgba(255,176,32,.14)';g.fillRect(x0,top,x1-x0,lh)}
  for(const tl of d.tiles.list){
    const a=Math.max(sx0,tl.x0),b=Math.min(sx0+span*rate,tl.x0+tl.cv.width);if(b<=a)continue;
    g.drawImage(tl.cv,a-tl.x0,0,b-a,lh,(a-sx0)*pxs,top,(b-a)*pxs,lh);
  }
  const T=T_(d),f=first(d),b0=Math.ceil((t0-f)/T),b1=Math.floor((t0+span-f)/T);
  g.font=`600 ${9*dpr}px IBM Plex Mono, monospace`;
  for(let b=b0;b<=b1;b++){
    const x=Math.round((f+b*T-t0)/span*W),bar=mod(b-d.track.down,4)===0;
    if(bar){g.fillStyle='rgba(255,255,255,.85)';g.fillRect(x,top,Math.max(1,1.2*dpr),lh);g.fillStyle='rgba(255,255,255,.55)';g.fillText(String(Math.floor((b-d.track.down)/4)+1),x+3*dpr,top+lh-5*dpr)}
    else{g.fillStyle='rgba(255,255,255,.3)';g.fillRect(x,top,Math.max(1,dpr*.8),lh*.12);g.fillRect(x,top+lh*.88,Math.max(1,dpr*.8),lh*.12)}
  }
  const cm=(p,col,lab)=>{const x=(p-t0)/span*W;if(x<-20||x>W+20)return;g.fillStyle=col;g.fillRect(x-dpr*.5,top,1.5*dpr,lh);g.beginPath();g.moveTo(x,top);g.lineTo(x+11*dpr,top);g.lineTo(x+11*dpr,top+9*dpr);g.lineTo(x,top+13*dpr);g.fill();if(lab){g.fillStyle='#000';g.fillText(lab,x+2*dpr,top+8*dpr)}};
  cm(d.cue,'#FFB020','');d.cues.forEach((p,k)=>{if(p!=null)cm(p,CR.HC_COL[k],'ABCD'[k])});
  labelLane(g,d,top);
}
function labelLane(g,d,top){g.fillStyle=COL[d.i];g.fillRect(0,top,4*dpr,Math.round(22*dpr));g.font=`800 ${12*dpr}px IBM Plex Sans, sans-serif`;g.fillText(LET[d.i],8*dpr,top+15*dpr)}
function drawWaves(){
  const cv=$('#djWave');if(!cv||!cv.width)return;const g=cv.getContext('2d'),{W,H,lh,mid}=laneGeom();
  g.fillStyle='#000';g.fillRect(0,0,W,H);if(!D.ready||!D.decks[0])return;
  drawLane(g,D.decks[0],0,lh,W);drawLane(g,D.decks[1],lh+mid,lh,W);
  // phase meter: beat-in-bar boxes for each deck + the offset between them
  const my=lh,bw=Math.round(18*dpr),gap=Math.round(3*dpr),bh=Math.round(7*dpr);g.fillStyle='#0b0b0d';g.fillRect(0,my,W,mid);
  D.decks.forEach((d,i)=>{if(!d.track)return;const ph=barPh(d,heard(d)),cur=Math.floor(ph),x0=W/2+(i?gap*4:-(4*bw+5*gap));
    for(let k=0;k<4;k++){g.fillStyle=k===cur&&d.playing?COL[i]:'#26262b';g.fillRect(x0+k*(bw+gap),my+(i?mid/2+1*dpr:mid/2-bh-1*dpr),bw,bh)}});
  const [a,b]=D.decks;
  if(a.track&&b.track&&a.playing&&b.playing){
    const k=b.sync?b.k:a.sync?1/a.k:1,dl=mod(barPh(b,heard(b))-barPh(a,heard(a))*k+2,4)-2,ok=Math.abs(dl)<0.03;
    g.font=`700 ${10*dpr}px IBM Plex Mono, monospace`;g.fillStyle=ok?'#2BD46A':Math.abs(dl)<0.12?'#FFB020':'#FF4D4D';g.textAlign='right';
    g.fillText(ok?'SYNC ✓':(dl>0?'+':'')+dl.toFixed(2),W-10*dpr,my+mid/2+4*dpr);g.textAlign='left';
  }
  g.fillStyle='#fff';g.fillRect(W/2-dpr,0,2*dpr,H);
  g.fillStyle='#E5322B';[0,lh+mid].forEach(y=>{g.beginPath();g.moveTo(W/2-6*dpr,y);g.lineTo(W/2+6*dpr,y);g.lineTo(W/2,y+7*dpr);g.fill()});
}
function drawOv(d){
  const cv=deckEl(d)&&deckEl(d).querySelector('.dkov');if(!cv||!cv.width)return;const g=cv.getContext('2d'),W=cv.width,H=cv.height;
  if(!d.track){g.fillStyle='#0d0d10';g.fillRect(0,0,W,H);return}
  if(!d.ovc||d.ovc.width!==W){const o=document.createElement('canvas');o.width=W;o.height=H;const og=o.getContext('2d'),w=d.track.wave;og.fillStyle='#0d0d10';og.fillRect(0,0,W,H);
    for(let x=0;x<W;x++){const i0=Math.floor(x/W*w.len),i1=Math.max(i0+1,Math.floor((x+1)/W*w.len)),s=CR.sliceRange(w,i0,Math.min(i1,w.len)),hh=Math.max(0.5,s[0]*H/2*0.92),k=s[4]*3;og.fillStyle=CR.wcol(w.col[k],w.col[k+1],w.col[k+2]);og.fillRect(x,H/2-hh,1,2*hh)}
    d.ovc=o}
  g.drawImage(d.ovc,0,0);const h=heard(d),px=h/d.track.dur*W;
  g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,0,px,H);
  if(d.loop){g.fillStyle='rgba(255,176,32,.35)';g.fillRect(d.loop.ls/d.track.dur*W,0,Math.max(2,(d.loop.le-d.loop.ls)/d.track.dur*W),H)}
  d.cues.forEach((p,k)=>{if(p==null)return;g.fillStyle=CR.HC_COL[k];g.fillRect(p/d.track.dur*W-dpr*.5,0,1.5*dpr,H)});
  g.fillStyle='#FFB020';g.fillRect(d.cue/d.track.dur*W-dpr*.5,0,dpr,H);
  g.fillStyle=COL[d.i];g.fillRect(px-dpr,0,2*dpr,H);
}
const tbuf=new Float32Array(1024);
function level(an){an.getFloatTimeDomainData(tbuf);let pk=0,s=0;for(let i=0;i<tbuf.length;i++){const v=Math.abs(tbuf[i]);if(v>pk)pk=v;s+=v*v}return {pk,rms:Math.sqrt(s/tbuf.length)}}
const lv=x=>clamp((20*Math.log10(x||1e-6)+42)/42,0,1);
function meter(el,st,L){
  const v=lv(L.rms*1.8);st.vu=Math.max(v,st.vu*0.86);const p=lv(L.pk);if(p>st.pk||performance.now()-st.pkT>900){st.pk=p;st.pkT=performance.now()}else st.pk=Math.max(0,st.pk-0.004);
  el.querySelector('i').style.transform=`scaleY(${st.vu.toFixed(3)})`;el.querySelector('b').style.bottom=(st.pk*100).toFixed(1)+'%';el.classList.toggle('clip',L.pk>0.98);
}
const MST=[{vu:0,pk:0,pkT:0},{vu:0,pk:0,pkT:0}];let fbuf=null;
function drawViz(){
  const cv=$('#djViz');if(!cv||!cv.width||!D.ready)return;const g=cv.getContext('2d'),W=cv.width,H=cv.height;
  if(!fbuf)fbuf=new Uint8Array(D.man.frequencyBinCount);D.man.getByteFrequencyData(fbuf);
  g.clearRect(0,0,W,H);const N=40,grad=g.createLinearGradient(0,0,W,0);grad.addColorStop(0,COL[0]);grad.addColorStop(0.5,'#B66DFF');grad.addColorStop(1,COL[1]);g.fillStyle=grad;
  for(let k=0;k<N;k++){const f0=Math.floor(Math.pow(fbuf.length,k/N)),f1=Math.max(f0+1,Math.floor(Math.pow(fbuf.length,(k+1)/N)));let m=0;for(let j=f0;j<f1&&j<fbuf.length;j++)m=Math.max(m,fbuf[j]);
    const h=(m/255)**1.6*H;g.fillRect(k*W/N+1,H-h,W/N-2,h)}
}

/* ---------- frame loop ---------- */
function frame(){
  if(!D.visible){D.raf=0;return}
  if(D.ready){
    gateTick();autoStep();
    const con=$('#djCon');
    for(const d of D.decks){
      const el=deckEl(d);if(!el)continue;
      if(d.playing&&d.track){
        const h=heard(d);
        if(!d.loop&&srcAt(d,c.currentTime)>=d.track.dur-0.01){stopDeck(d);d.pos=d.track.dur;renderDeck(d)}
        if(d.waitUntil&&c.currentTime>=d.waitUntil){d.waitUntil=0;renderDeck(d)}
        const b=Math.floor(beatF(d,h));if(b!==d.lastBeat&&h>=first(d)&&c.currentTime-D.lat>=(d.segs[0]?d.segs[0].t0:0)){d.lastBeat=b;const bar=mod(b-d.track.down,4)===0;el.classList.remove('bt','bar');void el.offsetWidth;el.classList.add(bar?'bar':'bt');if(d.i===D.masterI||!other(d).playing){if(window.A11Y)A11Y.beat(bar);if(window.BG)BG.pulse(bar?0.8:0.45)}}
      }
      if(d.track){
        const h=heard(d),rem=Math.max(0,(d.track.dur-h)/effRate(d));
        el.querySelector('.dktime').textContent='-'+CR.fmtS(rem)+'.'+Math.floor((rem%1)*10);
        el.querySelector('.dktime').classList.toggle('warn',d.playing&&rem<30);
        el.querySelector('.jplat').style.transform=`rotate(${(h*200)%360}deg)`;
        el.querySelector('.jcen span').textContent=CR.fmtS(h);
      }
      drawOv(d);
      const L=level(d.n.an),ch=chEl(d);meter(ch.querySelector('.vu'),d,L);
      con.style.setProperty(d.i?'--lb':'--la',(d.vu*(d.fader*d.fader)*xfGains(D.xf,D.curve)[d.i]).toFixed(3));
    }
    const ml=level(D.man);document.querySelectorAll('.mvu .vu').forEach((el,k)=>meter(el,MST[k],ml));
    if(D.rec){const s=D.rec.frames/D.rec.sr;$('#djRecT').textContent=CR.fmtS(s)}
    drawViz();
  }
  drawWaves();
  D.raf=requestAnimationFrame(frame);
}

/* ---------- keyboard ---------- */
document.addEventListener('keydown',e=>{
  if(!D.visible||e.target.closest('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;
  const [a,b]=D.decks;if(!a)return;const k=e.key.toLowerCase();
  const go=fn=>{e.preventDefault();ensure().then(fn)};
  if(k==='q')go(()=>playPress(a));else if(k==='p')go(()=>playPress(b));
  else if(k==='w')go(()=>{cueDown(a);cueUp(a)});else if(k==='o')go(()=>{cueDown(b);cueUp(b)});
  else if(k==='e')go(()=>setSync(a,!a.sync));else if(k==='i')go(()=>setSync(b,!b.sync));
  else if(k==='f')go(()=>setFxOn(!D.fx.on));
  else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();if(D.auto)autoCancel();D.xf=clamp(D.xf+(e.key==='ArrowLeft'?-0.1:0.1),-1,1);if(D.ready)applyXf();syncXf()}
});

/* ---------- public ---------- */
window.DJ={
  show(){syncCol();if(!D.built){D.decks=[];build()}D.visible=true;CR.stopTool();
    init().then(()=>{renderAll();if(D.noStretch)note(t('djEngineOff'))});
    requestAnimationFrame(()=>{sizeAll();if(!D.raf)D.raf=requestAnimationFrame(frame)});renderRecsSoon()},
  hide(){D.visible=false;if(D.ready){D.decks.forEach(d=>d.playing&&stopDeck(d));if(D.fx.on)setFxOn(false);if(D.auto)autoCancel();if(D.rec)recStop()}$('#djMenu')&&($('#djMenu').hidden=true)},
  lang(){if(D.built){renderAll();renderPick()}},
  redraw(){for(const d of D.decks)if(d){d.tiles=null;d.ovc=null}},
  _D:D // for tests
};
// the view may already be open (#dj in the address) before this script ran
CR.applyLang();
if($('#djView')&&!$('#djView').hidden)DJ.show();
})();
