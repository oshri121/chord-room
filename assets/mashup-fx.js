/*
 * Mashup Studio FX engine (window.MXFX), used by assets/mashup.js for BOTH the live preview (AudioContext) and the export
 * (OfflineAudioContext): one builder makes the same node chain in either context, so the export sounds like the preview.
 *
 * Chain per slot (every stage always in series, "off" = transparent settings, so A and B always share the same latency):
 *   input → EQ (low shelf, 3 peaking, high shelf) → low-cut / high-cut biquads → compressor (+ makeup) → saturation
 *   (WaveShaper 4× oversampled; the dry/wet mix lives inside the curve, no parallel path = no comb filtering)
 *   → chorus (dry + two LFO-modulated short delays, stereo width) → [reverb send: pre-delay → convolver with an IR
 *   generated in code] + [echo send: tempo-synced delay, feedback through a high-cut, normal or ping-pong; the "echo throw"
 *   send opens only for a region's last beat] → output (a bypass path for the A/B compare button).
 * Time-based parts (chorus LFO phase, echo throws) are scheduled per start position from the timeline (sched), so a
 * preview started anywhere and the export have the same phase. Random content (IR noise, riser noise) uses a seeded PRNG.
 * Also: width (M/S matrix), transition buffers (riser / downlifter, generated), vocal envelope for auto-duck, EQ response,
 * smart EQ / smart FX (local spectrum + envelope analysis → band settings / effect amounts, with notes for the UI).
 */
(function(){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const NOTES={'1/4':1,'1/8':0.5,'d1/8':0.75,'1/16':0.25};
const RTYPES=['room','hall','plate'];
const LFO_HZ=0.8;

/* ---------- defaults, presets, sanitising ---------- */
const DEF_FX=()=>({rev:{on:false,type:'hall',size:0.5,pre:20,mix:0.25},dly:{on:false,note:'1/8',fb:0.35,pp:false,hc:6000,mix:0.2},
  flt:{on:false,lo:120,hi:12000},cmp:{on:false,amt:0.5},cho:{on:false,depth:0.5,width:0.8,mix:0.35},sat:{on:false,drive:0.35,mix:0.5}});
const DEF_BANDS=[{t:'lowshelf',f:100,g:0,q:0.7},{t:'peaking',f:300,g:0,q:1},{t:'peaking',f:1200,g:0,q:1},{t:'peaking',f:4000,g:0,q:1},{t:'highshelf',f:10000,g:0,q:0.7}];
const DEF_EQ=()=>({on:true,b:DEF_BANDS.map(x=>({f:x.f,g:x.g,q:x.q}))});
const off=()=>DEF_FX();
const fxP=(o)=>{const d=DEF_FX();for(const k in o)Object.assign(d[k],o[k]);return d};
const PRESETS={
  dry:off(),
  radio:fxP({flt:{on:true,lo:160,hi:7500},cmp:{on:true,amt:0.6},sat:{on:true,drive:0.25,mix:0.4},rev:{on:true,type:'room',size:0.25,pre:10,mix:0.12}}),
  club:fxP({flt:{on:true,lo:120,hi:16000},cmp:{on:true,amt:0.5},rev:{on:true,type:'hall',size:0.55,pre:30,mix:0.22},dly:{on:true,note:'d1/8',fb:0.32,pp:true,hc:5000,mix:0.16}}),
  lofi:fxP({flt:{on:true,lo:300,hi:3800},sat:{on:true,drive:0.7,mix:0.7},cho:{on:true,depth:0.35,width:0.5,mix:0.3},rev:{on:true,type:'room',size:0.3,pre:5,mix:0.15},cmp:{on:true,amt:0.4}}),
  dreamy:fxP({flt:{on:true,lo:100,hi:14000},rev:{on:true,type:'hall',size:0.9,pre:60,mix:0.42},dly:{on:true,note:'1/4',fb:0.5,pp:true,hc:4000,mix:0.28},cho:{on:true,depth:0.6,width:1,mix:0.35},cmp:{on:true,amt:0.35}}),
  phone:fxP({flt:{on:true,lo:500,hi:3000},sat:{on:true,drive:0.55,mix:0.6},cmp:{on:true,amt:0.8}})
};
const eqP=g=>{const e=DEF_EQ();g.forEach((x,i)=>{if(x)Object.assign(e.b[i],x)});return e};
const EQ_PRESETS={
  flat:DEF_EQ(),
  mud:eqP([{f:80,g:-2},{f:300,g:-5,q:1.2},null,null,null]),
  air:eqP([null,null,null,{f:5000,g:1.5,q:0.8},{f:10000,g:5}]),
  warm:eqP([{f:150,g:3},{f:250,g:1.5,q:0.9},null,null,{f:9000,g:-2.5}]),
  voc:eqP([null,{f:300,g:-2,q:1},{f:2500,g:3.5,q:1},null,{f:12000,g:2}]),
  bass:eqP([{f:150,g:-12},null,null,null,null])
};
const num=(x,a,b,d)=>typeof x==='number'&&isFinite(x)?clamp(x,a,b):d;
const R={rev:{size:[0,1],pre:[0,150],mix:[0,1]},dly:{fb:[0,0.85],hc:[1000,16000],mix:[0,1]},flt:{lo:[20,1500],hi:[800,20000]},cmp:{amt:[0,1]},cho:{depth:[0,1],width:[0,1],mix:[0,1]},sat:{drive:[0,1],mix:[0,1]}};
function sanFx(x){
  const d=DEF_FX();if(!x||typeof x!=='object')return d;
  for(const k in d){const s=x[k];if(!s||typeof s!=='object')continue;
    if(typeof s.on==='boolean')d[k].on=s.on;
    for(const p in R[k])d[k][p]=num(s[p],R[k][p][0],R[k][p][1],d[k][p])}
  if(RTYPES.includes(x.rev&&x.rev.type))d.rev.type=x.rev.type;
  if(x.dly&&NOTES[x.dly.note])d.dly.note=x.dly.note;
  if(x.dly&&typeof x.dly.pp==='boolean')d.dly.pp=x.dly.pp;
  return d;
}
function sanEq(x){
  const d=DEF_EQ();if(!x||typeof x!=='object')return d;
  if(typeof x.on==='boolean')d.on=x.on;
  if(Array.isArray(x.b))d.b.forEach((b,i)=>{const s=x.b[i];if(s&&typeof s==='object'){b.f=num(s.f,20,20000,b.f);b.g=num(s.g,-18,18,b.g);b.q=num(s.q,0.2,10,b.q)}});
  return d;
}
const clone=x=>JSON.parse(JSON.stringify(x));

/* ---------- seeded noise ---------- */
function rng(seed){let a=seed>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}

/* ---------- impulse responses (generated, cached per context) ---------- */
const irCache=new WeakMap();
function makeIR(ctx,type,size){
  let m=irCache.get(ctx);if(!m){m=new Map();irCache.set(ctx,m)}
  const key=type+'|'+size.toFixed(2);if(m.has(key))return m.get(key);
  const sr=ctx.sampleRate,T60=type==='room'?0.35+size*1.1:type==='plate'?0.8+size*2.2:1.3+size*3.2;
  const n=Math.max(1,Math.round(Math.min(T60*1.15,6)*sr)),buf=ctx.createBuffer(2,n,sr);
  const damp=type==='room'?[0.75,0.3]:type==='plate'?[0.95,0.55]:[0.85,0.18];
  let E=0;
  for(let ch=0;ch<2;ch++){
    const d=buf.getChannelData(ch),rnd=rng(9001+ch*7919+RTYPES.indexOf(type)*101);let y=0;
    const att=type==='hall'?0.025*sr:type==='plate'?0.002*sr:0.004*sr;
    for(let i=0;i<n;i++){const p=i/n,a=damp[0]+(damp[1]-damp[0])*p;y+=a*((rnd()*2-1)-y);
      d[i]=y*Math.exp(-6.91*i/sr/T60)*Math.min(1,(i+1)/att)}
    if(type==='room'){const r2=rng(77+ch);for(let k=0;k<14;k++){const at=Math.round((0.004+r2()*0.045*(0.6+size))*sr);if(at<n)d[at]+=(r2()<0.5?-1:1)*(0.55-k*0.03)}}
    for(let i=0;i<n;i++)E+=d[i]*d[i];
  }
  const k=Math.sqrt(0.5*2/Math.max(E,1e-9));for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<n;i++)d[i]*=k}
  while(m.size>=6)m.delete(m.keys().next().value);m.set(key,buf);return buf;
}

/* ---------- saturation curve (dry/wet inside the curve; input scaled by 1/4 so ±4 fits the shaper's ±1 range) ---------- */
function satCurve(on,drive,mix){
  const N=4097,c=new Float32Array(N),dd=1+drive*9,mk=1+drive*1.2,w=on?mix:0;
  for(let i=0;i<N;i++){const x=i/(N-1)*2-1,u=x*4,s=Math.tanh(dd*u)/dd*mk;c[i]=((1-w)*u+w*s)/4}
  return c;
}

/* ---------- width (M/S): w 0 = mono, 1 = as is, 2 = extra wide ---------- */
function width(ctx){
  const sp=ctx.createChannelSplitter(2),mg=ctx.createChannelMerger(2),ll=ctx.createGain(),rl=ctx.createGain(),lr=ctx.createGain(),rr=ctx.createGain();
  const input=ctx.createGain();input.channelCount=2;input.channelCountMode='explicit';input.channelInterpretation='speakers';
  input.connect(sp);sp.connect(ll,0);sp.connect(rl,1);sp.connect(lr,0);sp.connect(rr,1);
  ll.connect(mg,0,0);rl.connect(mg,0,0);lr.connect(mg,0,1);rr.connect(mg,0,1);
  const n={input,output:mg,w:1,set(w,imm){n.w=w;const a=(1+w)/2,b=(1-w)/2,P=(p,v)=>imm?(p.value=v):p.setTargetAtTime(v,ctx.currentTime,0.02);P(ll.gain,a);P(rr.gain,a);P(rl.gain,b);P(lr.gain,b)}};
  n.set(1,true);return n;
}

/* ---------- chorus LFO (one period, looped; phase from the timeline) ---------- */
const lfoCache=new WeakMap();
function lfoBuf(ctx){let b=lfoCache.get(ctx);if(b)return b;const sr=ctx.sampleRate,n=Math.round(sr/LFO_HZ);b=ctx.createBuffer(1,n,sr);const d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.sin(2*Math.PI*i/n);lfoCache.set(ctx,b);return b}

/* ---------- the chain ---------- */
function chain(ctx){
  const G=v=>{const g=ctx.createGain();g.gain.value=v;return g},nyq=ctx.sampleRate/2;
  const input=G(1),output=G(1);
  const eq=DEF_BANDS.map(b=>{const f=ctx.createBiquadFilter();f.type=b.t;f.frequency.value=b.f;f.gain.value=0;f.Q.value=b.q;return f});
  const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=0;hp.Q.value=0.707;
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=nyq;lp.Q.value=0.707;
  const cmp=ctx.createDynamicsCompressor();cmp.threshold.value=0;cmp.ratio.value=1;cmp.knee.value=0;cmp.attack.value=0.004;cmp.release.value=0.15;
  const mk=G(1),pre=G(0.25),sh=ctx.createWaveShaper(),post=G(4);sh.oversample='4x';sh.curve=satCurve(false,0,0);
  // chorus
  const sum=G(1),dlL=ctx.createDelay(0.1),dlR=ctx.createDelay(0.1);dlL.delayTime.value=0.014;dlR.delayTime.value=0.019;
  const spL=ctx.createChannelSplitter(2),spR=ctx.createChannelSplitter(2),cmg=ctx.createChannelMerger(2),cw=width(ctx),choWet=G(0);
  // reverb send
  const revSend=G(0),preDly=ctx.createDelay(0.5);let conv=ctx.createConvolver();conv.normalize=false;
  const wet=G(1);
  // echo
  // Inside a feedback cycle the engine adds one render quantum (128 frames) on the cycle's back edge, so the first repeat(s)
  // go through acyclic delays, the loop delay is shortened by that quantum and the entry into the normal loop gets it back
  // (nQ) → every repeat lands on the note grid (measured: ±0 samples over 5 repeats, normal and ping-pong).
  const dIn=G(0),thr=G(0),nG=G(1),pG=G(0),nHC=ctx.createBiquadFilter(),nD=ctx.createDelay(3),nFb=G(0.35),nHC2=ctx.createBiquadFilter(),nD2=ctx.createDelay(3),nFb2=G(0.35);
  const pMono=G(1);pMono.channelCount=1;pMono.channelCountMode='explicit';pMono.channelInterpretation='speakers';
  const pHC=ctx.createBiquadFilter(),pL=ctx.createDelay(3),pR=ctx.createDelay(3),pFb=G(0.35),pHC2=ctx.createBiquadFilter(),pL2=ctx.createDelay(3),pR2=ctx.createDelay(3),pFb2=G(0.35),pMg=ctx.createChannelMerger(2);
  for(const f of [nHC,pHC,nHC2,pHC2]){f.type='lowpass';f.frequency.value=6000}
  const QN=128/ctx.sampleRate,nQ=ctx.createDelay(0.05);nQ.delayTime.value=QN;
  const chOut=G(1),byDry=G(0),byD=ctx.createDelay(0.1);   // the dry (compare) path is delayed by the chain's latency → no jump when toggling
  // wiring
  let x=input;for(const f of eq){x.connect(f);x=f}
  x.connect(hp);hp.connect(lp);lp.connect(cmp);cmp.connect(mk);mk.connect(pre);pre.connect(sh);sh.connect(post);
  post.connect(sum);post.connect(dlL);post.connect(dlR);dlL.connect(spL);dlR.connect(spR);spL.connect(cmg,0,0);spR.connect(cmg,1,1);cmg.connect(cw.input);cw.output.connect(choWet);choWet.connect(sum);
  sum.connect(chOut);
  sum.connect(revSend);revSend.connect(preDly);preDly.connect(conv);conv.connect(wet);
  sum.connect(dIn);sum.connect(thr);for(const s of [dIn,thr]){s.connect(nG);s.connect(pG)}
  nG.connect(nHC);nHC.connect(nD);nD.connect(wet);nD.connect(nFb);nFb.connect(nQ);nQ.connect(nHC2);nHC2.connect(nD2);nD2.connect(wet);nD2.connect(nFb2);nFb2.connect(nHC2);
  pG.connect(pMono);pMono.connect(pHC);pHC.connect(pL);pL.connect(pMg,0,0);pL.connect(pR);pR.connect(pMg,0,1);
  pR.connect(pFb);pFb.connect(pHC2);pHC2.connect(pL2);pL2.connect(pMg,0,0);pL2.connect(pR2);pR2.connect(pMg,0,1);pR2.connect(pFb2);pFb2.connect(pHC2);pMg.connect(wet);
  wet.connect(chOut);chOut.connect(output);input.connect(byD);byD.connect(byDry);byDry.connect(output);
  const st={ir:'',curve:'',depth:0,lfo:[],irOn:false};
  const ch={input,output,beat:0.5,cq:[1,0,1],
    set(fx,eqc,beat,imm){
      const t=ctx.currentTime,P=(p,v)=>{if(!isFinite(v))return;if(imm){p.cancelScheduledValues(0);p.value=v}else p.setTargetAtTime(v,t,0.02)};
      eq.forEach((f,i)=>{const b=eqc.b[i];P(f.frequency,clamp(b.f,10,nyq));P(f.gain,eqc.on?b.g:0);P(f.Q,b.q)});
      P(hp.frequency,fx.flt.on?fx.flt.lo:0);P(lp.frequency,fx.flt.on?Math.min(fx.flt.hi,nyq):nyq);
      const a=fx.cmp.on?fx.cmp.amt:0;P(cmp.threshold,-a*32);P(cmp.ratio,1+a*7);P(cmp.knee,a?10:0);P(mk.gain,Math.pow(10,(a*32*(1-1/(1+a*7))*0.42)/20));
      const ck=[fx.sat.on,fx.sat.drive.toFixed(3),fx.sat.mix.toFixed(3)].join();if(ck!==st.curve){st.curve=ck;sh.curve=satCurve(fx.sat.on,fx.sat.drive,fx.sat.mix)}
      P(choWet.gain,fx.cho.on?fx.cho.mix:0);cw.set(fx.cho.width,imm);st.depth=0.0005+fx.cho.depth*0.0035;
      for(const l of st.lfo){P(l.a.gain,st.depth);P(l.b.gain,-st.depth)}
      // reverb: the convolver gets its IR (and input) only while on, so an unused reverb costs nothing
      const ik=fx.rev.type+'|'+fx.rev.size.toFixed(2);
      if(fx.rev.on&&ik!==st.ir){
        const nc=ctx.createConvolver();nc.normalize=false;nc.buffer=makeIR(ctx,fx.rev.type,fx.rev.size);preDly.connect(nc);nc.connect(wet);
        if(st.ir){const old=conv;try{preDly.disconnect(old)}catch(e){}setTimeout(()=>{try{old.disconnect()}catch(e){}},imm?0:4000)}
        else{try{preDly.disconnect(conv);conv.disconnect()}catch(e){}}
        conv=nc;st.ir=ik;
      }
      P(revSend.gain,fx.rev.on?fx.rev.mix:0);P(preDly.delayTime,fx.rev.pre/1000);
      // echo: tempo-synced (the timeline's beat)
      ch.beat=beat;const dt=clamp((NOTES[fx.dly.note]||0.5)*beat,0.02,2.9);
      P(dIn.gain,fx.dly.on?fx.dly.mix:0);P(nG.gain,fx.dly.pp?0:1);P(pG.gain,fx.dly.pp?1:0);
      for(const g of [nFb,pFb,nFb2,pFb2])P(g.gain,fx.dly.fb);for(const f of [nHC,pHC,nHC2,pHC2])P(f.frequency,Math.min(fx.dly.hc,nyq));
      for(const d of [nD,pL,pR])P(d.delayTime,dt);P(nD2.delayTime,dt-QN*ch.cq[0]);P(pL2.delayTime,dt-QN*ch.cq[1]);P(pR2.delayTime,dt-QN*ch.cq[2]);
      ch.throwMix=Math.max(0.6,fx.dly.mix);
    },
    // A/B compare: everything off (dry path) while held
    setLat(sec){byD.delayTime.value=clamp(sec||0,0,0.1)},
    bypass(on){const t=ctx.currentTime;chOut.gain.setTargetAtTime(on?0:1,t,0.008);byDry.gain.setTargetAtTime(on?1:0,t,0.008)},
    // timeline-based parts from timeline position `pos` heard at context time `when`: chorus LFO phase + echo throws
    sched(when,pos,throws,made){
      const src=ctx.createBufferSource();src.buffer=lfoBuf(ctx);src.loop=true;
      const a=G(st.depth),b=G(-st.depth);src.connect(a);src.connect(b);a.connect(dlL.delayTime);b.connect(dlR.delayTime);
      const ph=((pos*LFO_HZ)%1+1)%1;src.start(when,ph*src.buffer.duration);
      const L={a,b};st.lfo.push(L);if(st.lfo.length>4)st.lfo.shift();
      made.push({src,g:a,post:true,id:'lfo'},{g:b,post:true,id:'lfo'});
      const p=thr.gain;p.cancelScheduledValues(when);p.setValueAtTime(0,when);let last=when;const v=ch.throwMix||0.6;
      for(const w of throws){if(w.b<=pos)continue;const ta=Math.max(when+(w.a-pos),last),tb=when+(w.b-pos);if(tb<=ta+0.012)continue;
        p.setValueAtTime(0,ta);p.linearRampToValueAtTime(v,ta+0.01);p.setValueAtTime(v,tb-0.002);p.linearRampToValueAtTime(0,tb+0.004);last=tb+0.005}
    },
    analyserTap:output
  };
  return ch;
}

/* ---------- transitions: riser (ends on its bar) / downlifter (starts on its bar) ---------- */
const trCache=new WeakMap();
function transition(ctx,kind,dur){
  let m=trCache.get(ctx);if(!m){m=new Map();trCache.set(ctx,m)}
  const key=kind+'|'+dur.toFixed(5);if(m.has(key))return m.get(key);
  const sr=ctx.sampleRate,n=Math.max(1,Math.round(dur*sr)),buf=ctx.createBuffer(2,n,sr),cap=sr*0.16;let pk=0;
  for(let ch=0;ch<2;ch++){
    const d=buf.getChannelData(ch),rnd=rng((kind==='riser'?501:907)+ch*31);let low=0,band=0,ph=0;
    for(let i=0;i<n;i++){
      const p=i/n,x=rnd()*2-1;let fc,amp,f0,o;
      if(kind==='riser'){fc=250*Math.pow(48,p);amp=p*p*(0.15+0.85*p);f0=180*Math.pow(8,p)}
      else{fc=9000*Math.pow(150/9000,p);amp=(1-p)*(1-p)*Math.min(1,i/(0.005*sr));f0=420*Math.pow(55/420,p)}
      const f=2*Math.sin(Math.PI*Math.min(fc,cap)/sr);low+=f*band;const hi=x-low-0.6*band;band+=f*hi;
      ph+=2*Math.PI*f0/sr;
      o=kind==='riser'?amp*(0.8*band+0.18*p*Math.sin(ph)):amp*(0.7*low+0.35*Math.sin(ph));
      if(kind==='riser'&&n-i<0.01*sr)o*=(n-i)/(0.01*sr);
      d[i]=o;const q=Math.abs(o);if(q>pk)pk=q;
    }
  }
  if(pk>0){const k=0.6/pk;for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<n;i++)d[i]*=k}}
  while(m.size>=8)m.delete(m.keys().next().value);m.set(key,buf);return buf;
}

/* ---------- vocal envelope (100 Hz frames of a 20 ms RMS, source time) for the auto-duck ---------- */
function vocalEnv(b){
  const sr=b.sampleRate,L=b.getChannelData(0),Rr=b.numberOfChannels>1?b.getChannelData(1):L,hop=sr/100,win=Math.round(sr*0.02),n=Math.floor(L.length/hop),e=new Float32Array(n);
  for(let f=0;f<n;f++){const a=Math.round(f*hop-win/2),z=a+win;let q=0,c=0;for(let j=Math.max(0,a);j<Math.min(L.length,z);j+=2){const x=(L[j]+Rr[j])*0.5;q+=x*x;c++}e[f]=c?Math.sqrt(q/c):0}
  return e;
}

/* ---------- EQ response for the UI (BiquadFilterNode.getFrequencyResponse on a tiny offline context) ---------- */
let uiCtx=null,uiF=null;
function eqResponse(eqc,freqs){
  if(!uiCtx){uiCtx=new OfflineAudioContext(1,128,48000);uiF=DEF_BANDS.map(b=>{const f=uiCtx.createBiquadFilter();f.type=b.t;return f})}
  const n=freqs.length,mag=new Float32Array(n),ph=new Float32Array(n),tot=new Float32Array(n),one=[];
  uiF.forEach((f,i)=>{const b=eqc.b[i];f.frequency.value=b.f;f.gain.value=eqc.on?b.g:0;f.Q.value=b.q;f.getFrequencyResponse(freqs,mag,ph);
    const db=new Float32Array(n);for(let j=0;j<n;j++){db[j]=20*Math.log10(Math.max(1e-6,mag[j]));tot[j]+=db[j]}one.push(db)});
  return {tot,one};
}

/* ---------- latency of the chain (compressor look-ahead + oversampling), measured once offline ---------- */
let latP=null;
function latency(){
  if(latP)return latP;
  latP=(async()=>{try{const sr=44100,oc=new OfflineAudioContext(2,sr/5,sr),c=chain(oc);c.set(DEF_FX(),DEF_EQ(),0.5,true);c.output.connect(oc.destination);
    const b=oc.createBuffer(2,sr/5,sr);b.getChannelData(0)[1000]=b.getChannelData(1)[1000]=0.5;const s=oc.createBufferSource();s.buffer=b;s.connect(c.input);s.start(0);
    const out=(await oc.startRendering()).getChannelData(0);let k=0,m=0;for(let i=0;i<out.length;i++){const a=Math.abs(out[i]);if(a>m){m=a;k=i}}return (k-1000)/sr}catch(e){console.warn(e);return 0}})();
  return latP;
}

/* ---------- smart EQ / smart FX: local signal analysis (no network) ----------
   spectrum(parts): up to 160 Hann-windowed 4096-point FFT frames spread over the song (silent frames skipped), power averaged
   per 1/6-octave band, mixed in dB with the per-band median (robust against a few loud frames) → db[]; also the mean spectral
   flatness (100 Hz–10 kHz) and the spectral centroid. dev = db minus the song's own straight tilt (dB per octave fitted over
   150 Hz–8 kHz), so "sticks out" / "dull" is measured against the song itself, not an absolute target. */
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
  for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const k=i+j,l=k+len/2,xr=re[l]*cr-im[l]*ci,xi=re[l]*ci+im[l]*cr;re[l]=re[k]-xr;im[l]=im[k]-xi;re[k]+=xr;im[k]+=xi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t}}}}
const BC=(()=>{const c=[];for(let f=40;f<=16000;f*=Math.pow(2,1/6))c.push(f);return c})();
function spectrum(parts){
  parts=parts.filter(p=>p&&p.buf&&p.g>0);if(!parts.length)return null;
  const b0=parts[0].buf,sr=b0.sampleRate,len=b0.length,N=4096,chs=parts.map(p=>[p.buf.getChannelData(0),p.buf.numberOfChannels>1?p.buf.getChannelData(1):p.buf.getChannelData(0),p.g*0.5]);
  const win=new Float32Array(N);for(let i=0;i<N;i++)win[i]=0.5-0.5*Math.cos(2*Math.PI*i/N);
  const F=Math.min(160,Math.max(1,Math.floor(len/N))),edges=BC.map(f=>[Math.max(1,Math.floor(f*Math.pow(2,-1/12)/sr*N)),Math.max(2,Math.ceil(f*Math.pow(2,1/12)/sr*N))]);
  const frames=[],flats=[],cens=[];const re=new Float32Array(N),im=new Float32Array(N);
  for(let k=0;k<F;k++){const a=Math.floor((len-N)*(k+0.5)/F);let q=0;
    for(let i=0;i<N;i++){let x=0;for(const [L,R,g] of chs)x+=(L[a+i]+R[a+i])*g;re[i]=x*win[i];im[i]=0;q+=x*x}
    if(Math.sqrt(q/N)<0.003)continue;fft(re,im);
    const P=new Float32Array(N/2);for(let i=0;i<N/2;i++)P[i]=re[i]*re[i]+im[i]*im[i];
    frames.push(edges.map(([lo,hi])=>{let s=0,c=0;for(let i=lo;i<Math.min(hi,N/2);i++){s+=P[i];c++}return c?s/c:0}));
    const i0=Math.round(100/sr*N),i1=Math.round(10000/sr*N);let lg=0,ar=0,cw=0,cs=0;for(let i=i0;i<i1;i++){lg+=Math.log(P[i]+1e-12);ar+=P[i];cw+=P[i]*i;cs+=P[i]}
    const n=i1-i0;flats.push(Math.exp(lg/n)/(ar/n+1e-12));cens.push(cw/(cs+1e-12)*sr/N)}
  if(!frames.length)return null;
  const db=BC.map((f,j)=>{const v=frames.map(fr=>fr[j]),m=v.reduce((a,b)=>a+b,0)/v.length,s=Float32Array.from(v).sort(),md=s[Math.floor(s.length/2)];return 0.5*(10*Math.log10(m+1e-12))+0.5*(10*Math.log10(md+1e-12))});
  // tilt fit (dB vs octave) over 150 Hz – 8 kHz
  let sx=0,sy=0,sxx=0,sxy=0,n=0;BC.forEach((f,j)=>{if(f<150||f>8000)return;const x=Math.log2(f/1000);sx+=x;sy+=db[j];sxx+=x*x;sxy+=x*db[j];n++});
  const sl=(n*sxy-sx*sy)/(n*sxx-sx*sx),ic=(sy-sl*sx)/n,dev=BC.map((f,j)=>db[j]-(ic+sl*Math.log2(f/1000)));
  const med=a=>{const s=Float32Array.from(a).sort();return s[Math.floor(s.length/2)]||0};
  return {f:BC,db,dev,slope:sl,flat:med(flats),cen:med(cens)};
}
const bandAvg=(S,lo,hi,arr)=>{let s=0,c=0;S.f.forEach((f,j)=>{if(f>=lo&&f<=hi){s+=(arr||S.dev)[j];c++}});return c?s/c:0};
const bandMax=(S,lo,hi,sign)=>{let bf=Math.sqrt(lo*hi),bv=-Infinity;S.f.forEach((f,j)=>{if(f>=lo&&f<=hi&&sign*S.dev[j]>bv){bv=sign*S.dev[j];bf=f}});return {f:bf,v:sign*bv}};
const rf=f=>f>=1000?Math.round(f/100)*100:Math.round(f/10)*10;
// smart EQ → {eq, notes:[{k,f,g}]}: vocal = clean lows, tame mud / harshness, presence when dull, air; beat = complementary
function smartEq(S,role,V){
  const e=DEF_EQ(),b=e.b,notes=[],c6=x=>Math.round(clamp(x,-6,6)*10)/10;
  if(role==='vocal'){
    const low=bandAvg(S,40,95,S.db)-bandAvg(S,150,400,S.db),lf=low>-10?120:low>-18?100:90,lg=low>-10?-6:low>-18?-4:-2.5;
    Object.assign(b[0],{f:lf,g:lg,q:0.7});notes.push({k:'low',f:lf,g:lg});
    const mud=bandMax(S,200,420,1);if(mud.v>0.8){const g=c6(-(1.5+mud.v*0.8));Object.assign(b[1],{f:rf(mud.f),g,q:clamp(1+mud.v*0.15,1,2)});notes.push({k:'mud',f:rf(mud.f),g})}else Object.assign(b[1],{f:300,g:-1,q:1});
    const harsh=bandMax(S,2500,5000,1),pres=bandAvg(S,3000,5000);
    if(harsh.v>2){const g=c6(-(harsh.v*0.8));Object.assign(b[2],{f:rf(harsh.f),g,q:clamp(1.2+harsh.v*0.1,1.2,2)});notes.push({k:'harsh',f:rf(harsh.f),g})}
    else Object.assign(b[2],{f:1200,g:0,q:1});
    if(pres<-1.5){const g=c6(Math.min(5,-pres*0.9));Object.assign(b[3],{f:4000,g,q:0.9});notes.push({k:'pres',f:4000,g})}
    else if(harsh.v<=2&&pres<1){Object.assign(b[3],{f:3500,g:1.5,q:1});notes.push({k:'pres',f:3500,g:1.5})}
    const air=bandAvg(S,9500,12500),ag=c6(air<-1?Math.min(4.5,1.5-air*0.6):air<2?1.5:0);Object.assign(b[4],{f:11000,g:ag,q:0.7});if(ag>0)notes.push({k:'air',f:11000,g:ag});
  }else{
    // beat: carve the vocal's presence band (where the vocal is strongest against the beat) + mud only when it sticks out
    let fp=2500,gp=-3;if(V){let best=-Infinity;V.f.forEach((f,j)=>{if(f<1200||f>4500)return;const d=V.dev[j]-S.dev[j];if(d>best){best=d;fp=f}});gp=c6(-clamp(2+bandAvg(S,fp/1.3,fp*1.3)*0.5+Math.max(0,best)*0.15,2,5))}
    Object.assign(b[2],{f:rf(fp),g:gp,q:1.4});notes.push({k:'carve',f:rf(fp),g:gp});
    const mud=bandMax(S,180,420,1);if(mud.v>2){const g=c6(-Math.min(4,mud.v*0.8));Object.assign(b[1],{f:rf(mud.f),g,q:1.2});notes.push({k:'mud',f:rf(mud.f),g})}
  }
  b.forEach(x=>{x.q=clamp(x.q,0.7,2)});
  return {eq:e,notes};
}
// onset rate (per second) of a buffer from its 100 Hz envelope: positive flux peaks above an adaptive threshold
function onsetRate(env){let n=0,prev=0;const fl=new Float32Array(env.length);for(let i=1;i<env.length;i++)fl[i]=Math.max(0,env[i]-env[i-1]);
  const s=Float32Array.from(fl).sort(),th=Math.max(1e-4,s[Math.floor(s.length*0.9)]*0.6);
  for(let i=1;i+1<fl.length;i++)if(fl[i]>th&&fl[i]>=fl[i-1]&&fl[i]>fl[i+1]&&i-prev>=6){n++;prev=i}return n/(env.length/100)}
// smart FX for the vocal: info = {T, minor, V (vocal spectrum), venv (vocal 100 Hz env), B (beat spectrum), benv}
function smartFx(info){
  const fx=DEF_FX(),notes=[];const {T,V,venv,B,benv}=info;
  // beat density: onset rate + spectral flatness of B
  const rate=benv?onsetRate(benv):4,busy=clamp(0.6*clamp((rate-2)/6,0,1)+0.4*(B?clamp((B.flat-0.05)/0.3,0,1):0.5),0,1);
  // vocal wetness: level 150–350 ms after phrase ends, relative to the phrase
  let wet=0.3,dr=10;
  if(venv&&venv.length>50){const s=Float32Array.from(venv).sort(),p90=s[Math.floor(s.length*0.9)]||0,th=0.4*p90,rs=[];
    for(let f=10;f+36<venv.length;f++){if(!(venv[f-1]>=th&&venv[f]<th))continue;let L0=0;for(let k=f-10;k<f;k++)L0=Math.max(L0,venv[k]);let back=false,q=0;for(let k=f+1;k<=f+35;k++){if(venv[k]>=th)back=true;if(k>=f+15)q+=venv[k]}
      if(back||L0<=0)continue;rs.push(20*Math.log10(q/21/L0+1e-9))}
    if(rs.length>=3){rs.sort((a,b)=>a-b);wet=clamp((rs[Math.floor(rs.length/2)]+38)/22,0,1)}
    const sung=Array.from(venv).filter(x=>x>0.1*p90).sort((a,b)=>a-b);if(sung.length>20)dr=20*Math.log10((sung[Math.floor(sung.length*0.9)]+1e-9)/(sung[Math.floor(sung.length*0.3)]+1e-9))}
  // echo: tempo-synced
  fx.dly.note=T<90?'1/4':T<=135?'d1/8':'1/4';fx.dly.on=true;fx.dly.pp=true;fx.dly.mix=Math.round(clamp(0.28-0.16*busy,0.08,0.3)*100)/100;fx.dly.fb=Math.round(clamp(0.45-0.15*busy,0.25,0.5)*100)/100;fx.dly.hc=busy>0.5?4500:6000;
  notes.push({k:'delay',n:fx.dly.note,bpm:Math.round(T)});
  // reverb: less on busy beats and on already-wet vocals
  const rm=clamp((0.34-0.2*busy)*(1-0.7*wet),0.05,0.4);fx.rev.on=rm>0.06;fx.rev.mix=Math.round(rm*100)/100;fx.rev.type=info.minor?'hall':'plate';fx.rev.size=Math.round(clamp(0.75-0.4*busy+(info.minor?0.1:0),0.25,0.9)*100)/100;fx.rev.pre=Math.round(clamp(60/T*1000/16,10,60));
  notes.push({k:busy>0.55?'busy':busy<0.35?'sparse':'mid'});if(wet>0.55)notes.push({k:'wet'});else if(wet<0.25)notes.push({k:'dry'});
  // compressor from the vocal's dynamics
  fx.cmp.on=true;fx.cmp.amt=Math.round(clamp(0.3+(dr-8)/20,0.3,0.8)*100)/100;notes.push({k:'cmp',p:Math.round(fx.cmp.amt*100)});
  // brightness → warmth
  const cen=V?V.cen:2000;if(cen<1600){fx.sat.on=true;fx.sat.drive=0.3;fx.sat.mix=0.4;notes.push({k:'warm'})}else if(cen>2600)notes.push({k:'bright'});
  fx.flt.on=true;fx.flt.lo=110;fx.flt.hi=16000;
  if(busy<0.3&&wet<0.4){fx.cho.on=true;fx.cho.depth=0.3;fx.cho.mix=0.2;fx.cho.width=0.8}
  const duck=Math.round(clamp(3+4*busy,3,7)*2)/2;notes.push({k:'duck',db:duck});
  return {fx,duck,notes,busy,wet,dr,rate};
}

window.MXFX={DEF_FX,DEF_EQ,PRESETS,EQ_PRESETS,BANDS:DEF_BANDS,NOTES,RTYPES,sanFx,sanEq,clone,chain,width,transition,vocalEnv,eqResponse,latency,makeIR,spectrum,smartEq,smartFx,onsetRate};
})();
