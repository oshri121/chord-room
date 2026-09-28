/* Automatic DJ cue points from the song's structure.
   window.CUES.detect(audioBuffer, {bpm, offset, down}) → Promise<[{k, t, bar}]>, k in
   intro · vocal · break · build · drop · outro (hot cues A–F, colours below). Times are in seconds, on bar starts.

   How: the song is rendered offline at 16 kHz into five band envelopes (50 ms frames): everything, lows (<110 Hz:
   kick + bass), highs (>6 kHz: hats, risers), and the 0.8–3.5 kHz band of the centre (L+R) and of the sides (L−R).
   Frames are median-filtered (drum hits fade out, sustained sounds stay) and averaged per bar of the beat grid.
     intro  = first bar with music
     drop   = the first strong "bass comes back" jump (lows over the next 4 bars vs the 4 before), on a 4-bar phrase;
              songs without one (pop) → start of the loudest 8 bars
     break  = start of the low-bass stretch right before the drop
     build  = the last 8 (or 4) bars of that break, moved to where the highs start rising when that is clearer
     vocal  = first bars where the centre mid band is strong and clearly louder than the sides (lead vocals sit in
              the middle), before the drop
     outro  = where the bass leaves for good near the end (≥ 8 bars left), else 16 bars before the music ends
   It is a heuristic: good on club / pop structure, never perfect. */
(function(){
'use strict';
const SR=16000,HOP=0.05;
const KINDS=['intro','vocal','break','build','drop','outro'];
/* hot cue colours: rekordbox (RGB it keeps), Serato (its palette) */
const COL={intro:[40,226,20],vocal:[48,90,255],break:[195,175,4],build:[170,114,255],drop:[230,40,40],outro:[255,140,0]};
const SERATO={intro:[0x00,0xCC,0x00],vocal:[0x00,0x00,0xCC],break:[0xCC,0xCC,0x00],build:[0x88,0x00,0xCC],drop:[0xCC,0x00,0x00],outro:[0xCC,0x88,0x00]};
const NAME={intro:'Intro',vocal:'Vocal',break:'Break',build:'Build',drop:'Drop',outro:'Outro'};

async function env(buf,build){
  const n=Math.max(1,Math.ceil(buf.duration*SR)),oc=new OfflineAudioContext(1,n,SR),src=oc.createBufferSource();src.buffer=buf;
  const f=(type,hz)=>{const x=oc.createBiquadFilter();x.type=type;x.frequency.value=hz;x.Q.value=0.707;return x};
  const out=build(oc,src,f);out.connect(oc.destination);src.start();
  const x=(await oc.startRendering()).getChannelData(0),hop=Math.round(SR*HOP),m=Math.floor(x.length/hop),e=new Float32Array(m);
  for(let i=0;i<m;i++){let s=0;const o=i*hop;for(let j=0;j<hop;j++){const v=x[o+j];s+=v*v}e[i]=Math.sqrt(s/hop)}
  return e;
}
const chain=(src,nodes)=>{let p=src;for(const x of nodes){p.connect(x);p=x}return p};
function median(e,w){const out=new Float32Array(e.length),h=w>>1,buf=[];
  for(let i=0;i<e.length;i++){buf.length=0;for(let k=Math.max(0,i-h);k<=Math.min(e.length-1,i+h);k++)buf.push(e[k]);buf.sort((a,b)=>a-b);out[i]=buf[buf.length>>1]}return out}
function pct(a,p){const s=Array.from(a).filter(isFinite).sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:0}
const mean=(a,i,j)=>{let s=0,n=0;for(let k=Math.max(0,i);k<Math.min(a.length,j);k++){s+=a[k];n++}return n?s/n:0};

async function features(buf){
  const mono=await env(buf,(oc,src)=>{const g=oc.createGain();src.connect(g);return g});
  const lo=await env(buf,(oc,src,f)=>chain(src,[f('lowpass',110),f('lowpass',110)]));
  const hi=await env(buf,(oc,src,f)=>chain(src,[f('highpass',6000),f('highpass',6000)]));
  const vm=await env(buf,(oc,src,f)=>chain(src,[f('highpass',800),f('highpass',800),f('lowpass',3500),f('lowpass',3500)]));
  let vs=null;
  if(buf.numberOfChannels>1)vs=await env(buf,(oc,src,f)=>{const sp=oc.createChannelSplitter(2),a=oc.createGain(),b=oc.createGain();a.gain.value=0.5;b.gain.value=-0.5;
    src.connect(sp);sp.connect(a,0);sp.connect(b,1);const sum=oc.createGain();a.connect(sum);b.connect(sum);return chain(sum,[f('highpass',800),f('highpass',800),f('lowpass',3500),f('lowpass',3500)])});
  return {mono,lo,hi,vm:median(vm,9),vs:vs?median(vs,9):null};
}

async function detect(buf,grid){
  const bpm=grid&&grid.bpm;if(!buf||!bpm||!isFinite(bpm)||buf.duration<20)return [];
  const F=await features(buf);
  const T=60/bpm,B=4*T,fd=((grid.offset||0)%T+T)%T+(grid.down||0)*T,dur=buf.duration;
  // bars: bar k starts at fd + k·B (k may be negative for a pickup before the first downbeat)
  const k0=-Math.floor(fd/B),nb=Math.floor((dur-fd)/B)-k0;if(nb<16)return [];
  const at=k=>fd+(k+k0)*B;
  const bar=e=>{const o=new Float32Array(nb);for(let k=0;k<nb;k++){const a=Math.max(0,Math.round(at(k)/HOP)),b=Math.min(e.length,Math.round((at(k)+B)/HOP));o[k]=mean(e,a,b)}return o};
  const full=bar(F.mono),low=bar(F.lo),high=bar(F.hi),vm=bar(F.vm),vs=F.vs?bar(F.vs):null;
  const n90=a=>{const p=pct(a,0.9)||1e-9;return a.map(v=>v/p)};
  const fu=n90(full),lo=n90(low),hi=n90(high),vn=n90(vm);
  const cues={};
  // intro: first bar with music
  let s0=0;while(s0<nb-1&&fu[s0]<0.08)s0++;
  let e0=nb-1;while(e0>s0&&fu[e0]<0.08)e0--;
  cues.intro=s0;
  const phrase=k=>s0+Math.round((k-s0)/4)*4;   // nearest 4-bar phrase line counted from the intro
  // drop: bass returning after a stretch without it
  let best=-1,bs=0;const cand=[];
  for(let k=s0+8;k<=e0-4;k++){
    const after=mean(lo,k,k+4),before=mean(lo,k-4,k),sc=after-before;
    if(after>0.55&&before<0.45&&sc>0.3&&mean(fu,k,k+4)>0.6)cand.push({k,sc});
    if(sc>bs){bs=sc;best=k}
  }
  let drop=null,pop=false;
  if(cand.length){const mx=Math.max(...cand.map(c=>c.sc)),first=cand.find(c=>c.sc>=0.7*mx);
    // the strongest bar of that jump, then onto the phrase line when it is within one bar
    let k=first.k;for(const c of cand)if(Math.abs(c.k-first.k)<=2&&c.sc>(cand.find(x=>x.k===k)||{sc:0}).sc)k=c.k;
    const ph=phrase(k);drop=Math.abs(ph-k)<=1?ph:k}
  else{pop=true;let bw=-1,bv=0;for(let k=s0+8;k+8<=e0;k+=1){if((k-s0)%4)continue;const v=mean(fu,k,k+8);if(v>bv){bv=v;bw=k}}if(bw>0)drop=bw}
  if(drop!=null)cues.drop=drop;
  // break + build before the drop
  if(drop!=null){
    const quiet=pop?(k=>fu[k]<0.55):(k=>lo[k]<0.45);
    let b=drop-1,miss=0;while(b>s0+1){if(quiet(b-1))b--;else if(miss<1&&quiet(b-2)){miss++;b-=2}else break}
    const len=drop-b;
    if(len>=4){let bk=phrase(b);if(bk>=drop||bk<=s0)bk=b;cues.break=bk;
      if(drop-bk>=8){let bu=drop-(drop-bk>=16?8:4);
        // highs rising steadily into the drop → start of that rise
        let r=drop-1;while(r>bk+2&&hi[r-1]<=hi[r]*1.02&&hi[r-1]>0.02)r--;
        if(drop-r>=4&&drop-r<=16){const pr=phrase(r);bu=pr>bk&&pr<drop?pr:r}
        if(bu>bk+1&&bu<drop)cues.build=bu}}
  }
  // vocal: centre mid band strong and clearly above the sides
  {const ratio=vs?vm.map((v,k)=>v/(vs[k]+1e-7)):null,rThr=ratio?Math.max(1.6,pct(ratio,0.3)*1.25):0;
    const isV=k=>vn[k]>0.45&&(!ratio||ratio[k]>rThr);
    const lim=cues.drop!=null?cues.drop:e0;
    for(let k=s0+1;k<lim-1;k++)if(isV(k)&&isV(k+1)){if(k-s0>=2)cues.vocal=k;break}}
  // outro: bass gone for good near the end
  {let last=-1;for(let k=e0;k>s0;k--)if(lo[k]>0.5){last=k;break}
    let out=null;
    if(last>0&&e0-last>=8&&(cues.drop==null||last+1>cues.drop+8))out=phrase(last+1)<=e0-4?phrase(last+1):last+1;
    else if(e0-s0>=48){out=phrase(e0-16);if(cues.drop!=null&&out<=cues.drop+8)out=null}
    if(out!=null&&out>s0)cues.outro=out}
  // order + spacing: intro < break < build < drop < outro, vocal between intro and drop
  const res=[];let prev=-1;
  for(const k of ['intro','break','build','drop','outro']){const v=cues[k];if(v==null)continue;if(v<=prev+1&&k!=='intro')continue;res.push({k,bar:v});prev=v}
  if(cues.vocal!=null&&!res.some(c=>Math.abs(c.bar-cues.vocal)<2))res.push({k:'vocal',bar:cues.vocal});
  res.sort((a,b)=>KINDS.indexOf(a.k)-KINDS.indexOf(b.k));
  const r3=x=>Math.round(x*1000)/1000;
  return res.map(c=>({k:c.k,bar:c.bar,t:r3(Math.max(0,at(c.bar)))})).filter(c=>c.t<dur-1);
}

window.CUES={detect,KINDS,COL,SERATO,NAME,slot:k=>KINDS.indexOf(k),_features:features};
})();
