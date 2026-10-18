/* Key + chord benchmark synthesiser for the browser (no numpy needed): a JS port of the gen_chords.py song model —
   piano (inharmonic partials, voice-led inversions, left-hand root/fifth) / strummed guitar / pad (+ off-beat stabs), bass
   (root, octave/fifth, approach notes; `bass5` = leans on the fifth, `walk`), drums (pop / four / ballad, `drums_mul`),
   a vocal-like lead (formants, vibrato, chord tones on strong beats, passing tones on weak 8ths), optional saw lead, a
   Schroeder room, ±6 ms timing jitter, tuning offset in cents.
   GENK.make(spec, seed) → {x: Float32Array (mono, 22050 Hz), sr, truth:{key:{pc,mode}, beats:[t], chords:[{root,mm}|null per beat]}}
   GENK.KEYSET() = the key benchmark (15 categories × 4–7 tonics, both modes), GENK.CHORDSET = gen_chords.py's songs.
   Run in the page: tools/tests/key_bench.js (paste or load after this file). */
(function(){
const SR=22050;
const PC={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11,Cb:11};
const QUAL={'':[0,4,7],m:[0,3,7],'7':[0,4,7,10],maj7:[0,4,7,11],m7:[0,3,7,10],sus4:[0,5,7],'7sus4':[0,5,7,10],sus2:[0,2,7],dim:[0,3,6],
  m7b5:[0,3,6,10],'9':[0,4,7,10,2],maj9:[0,4,7,11,2],m9:[0,3,7,10,2],add9:[0,4,7,2],'6':[0,4,7,9],m6:[0,3,7,9]};
const MM={'':'maj','7':'maj',maj7:'maj',m:'min',m7:'min','9':'maj',maj9:'maj',m9:'min',add9:'maj','6':'maj',m6:'min'};
const NM=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const mod=(a,n)=>((a%n)+n)%n;
function parse(sym){
  const m=sym.match(/^([A-G][#b]?)(maj9|maj7|m7b5|m9|m7|m6|7sus4|sus4|sus2|add9|dim|m|9|7|6|)(?:\/([A-G][#b]?))?$/);
  if(!m)throw new Error(sym);const r=PC[m[1]],q=m[2];
  return {root:r,q,mm:MM[q]||null,bass:m[3]?PC[m[3]]:r,tones:QUAL[q].map(i=>(r+i)%12)};
}
function rng(seed){let a=seed>>>0;const u=()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296};
  u.n=(s)=>{let v=0;for(let i=0;i<6;i++)v+=u();return (v-3)*s/0.7071};return u}
const mtof=(m,c)=>440*Math.pow(2,(m-69+(c||0)/100)/12);
function put(buf,sig,t,g){const i0=Math.round(t*SR);for(let i=0;i<sig.length;i++){const j=i0+i;if(j>=0&&j<buf.length)buf[j]+=sig[i]*(g==null?1:g)}}
function piano(f,dur,vel,R){
  const d=dur+0.25,n=Math.floor(d*SR),o=new Float32Array(n),B=3e-4*(1+(f<200)),tau0=2.2*Math.sqrt(220/f);
  for(let k=1;k<14;k++){const fk=k*f*Math.sqrt(1+B*k*k);if(fk>7000)break;
    const a=(1/Math.pow(k,1.1))*Math.pow(0.6+0.4*vel,k*0.25)*(k!==7?1:0.3),ph=R()*6.28,w=2*Math.PI*fk/SR,dc=(1+0.45*k)/tau0/SR;
    for(let i=0;i<n;i++)o[i]+=a*Math.sin(w*i+ph)*Math.exp(-i*dc)}
  for(let i=0;i<n;i++){const t=i/SR;o[i]*=Math.min(1,t/0.003)*Math.min(1,Math.max(0,(d-t)/0.12))*vel}return o;
}
function pluck(f,dur,vel,R,pp){
  pp=pp||0.18;const d=dur+0.08,n=Math.floor(d*SR),o=new Float32Array(n);
  for(let k=1;k<16;k++){const fk=k*f*Math.sqrt(1+1.2e-4*k*k);if(fk>6500)break;const a=Math.abs(Math.sin(Math.PI*k*pp))/k,ph=R()*6.28,w=2*Math.PI*fk/SR,dc=(1.6+0.9*k)/SR;
    for(let i=0;i<n;i++)o[i]+=a*Math.sin(w*i+ph)*Math.exp(-i*dc)}
  for(let i=0;i<n;i++){const t=i/SR;o[i]*=Math.min(1,t/0.002)*Math.min(1,Math.max(0,(d-t)/0.06))*vel}return o;
}
function pad(f,dur){
  const d=dur+0.3,n=Math.floor(d*SR),o=new Float32Array(n);
  for(const det of [-0.004,0,0.0045])for(let k=1;k<12;k++){if(k*f>3500)break;const w=2*Math.PI*f*(1+det)*k/SR,a=1/k/(1+(k*f/1800)**2),ph=k*det*400;
    for(let i=0;i<n;i++)o[i]+=Math.sin(w*i+ph)*a}
  for(let i=0;i<n;i++){const t=i/SR;o[i]*=Math.min(1,t/0.12)*Math.min(1,Math.max(0,(d-t)/0.3))/3}return o;
}
function bassN(f,dur,vel){
  const n=Math.max(1,Math.floor(dur*SR)),o=new Float32Array(n),w=2*Math.PI*f/SR;
  for(let i=0;i<n;i++){const t=i/SR;o[i]=(Math.sin(w*i)+0.5*Math.sin(2*w*i)+0.25*Math.sin(3*w*i)+0.12*Math.sin(4*w*i))*Math.min(1,t/0.004)*Math.exp(-t*2)*Math.min(1,Math.max(0,(dur-t)/0.03))*vel}
  return o;
}
const FORM=[[700,110,1],[1220,120,0.5],[2600,160,0.25]];
function voice(f0,f1,dur,vel){
  const n=Math.floor(dur*SR),o=new Float32Array(n);let ph=0;const ks=[];
  for(let k=1;k<20;k++){const fk=k*f1;if(fk>5000)break;let w=0.25/k;for(const [fc,bw,a] of FORM)w+=a/(1+((fk-fc)/bw)**2);ks.push([k,w])}
  for(let i=0;i<n;i++){const t=i/SR,gl=f1+(f0-f1)*Math.exp(-t/0.03),vib=1+(Math.pow(2,35/1200)-1)*Math.sin(2*Math.PI*5.6*t)*Math.min(1,Math.max(0,(t-0.18)/0.25));
    ph+=2*Math.PI*gl*vib/SR;let s=0;for(const [k,w] of ks)s+=w*Math.sin(k*ph);o[i]=s*Math.min(1,t/0.04)*Math.min(1,Math.max(0,(dur-t)/0.06))*vel/2}
  return o;
}
function reverb(x){ // Schroeder: 4 combs + 2 allpasses, ~0.9 s
  const n=x.length,y=new Float32Array(n);
  for(const [D,g] of [[1557,0.84],[1617,0.83],[1491,0.85],[1422,0.86]]){const b=new Float32Array(D);let p=0;
    for(let i=0;i<n;i++){const o=b[p];b[p]=x[i]+o*g;p=(p+1)%D;y[i]+=o*0.25}}
  for(const [D,g] of [[225,0.7],[556,0.7]]){const b=new Float32Array(D);let p=0;
    for(let i=0;i<n;i++){const o=b[p],v=y[i]+o*g;b[p]=v;p=(p+1)%D;y[i]=o-g*v}}
  return y;
}
function make(sp,seed){
  const R=rng(seed||1),cents=sp.cents||0,kpc=PC[sp.key[0]],mode=sp.key[1],bpb=sp.bpb||4;
  const seq=[];const nb=sp.bars*bpb;while(seq.length<nb)for(const [s,n] of sp.prog)for(let i=0;i<n;i++)seq.push(s);seq.length=nb;
  const B=seq.length,lead=0.6,T=60/sp.bpm,beats=[];for(let b=0;b<=B;b++)beats.push(lead+b*T);
  const dur=beats[B]+2.5,n=Math.floor(dur*SR),mix=new Float32Array(n),dv=new Float32Array(n);
  const bt=x=>lead+x*T,jit=()=>R.n(0.006);
  const segs=[];for(let b=0;b<B;){let e=b;while(e<B&&seq[e]===seq[b])e++;segs.push([b,e,seq[b]]);b=e}
  const scale=(mode?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11]).map(d=>(kpc+d)%12);
  const inst=sp.inst;let prev=null;
  for(const [st,en,s] of segs){
    const c=parse(s),tones=c.tones,t0=bt(st),t1=bt(en);
    if(inst==='piano'){
      const cands=[];for(let base=53;base<66;base++){if(!tones.includes(base%12))continue;const v=[base];for(const p of tones)if(p!==base%12)v.push(base+mod(p-base,12));v.sort((a,b)=>a-b);if(v[v.length-1]<=77)cands.push(v)}
      const cost=v=>prev?v.reduce((a,m,i)=>a+Math.abs(m-(prev[i]||prev[prev.length-1])),0):Math.abs(v.reduce((a,b)=>a+b,0)/v.length-64);
      const v=cands.reduce((a,b)=>cost(b)<cost(a)?b:a);prev=v;
      let lh=36+mod(c.bass-36,12);if(lh<40)lh+=12;
      let l2=lh+7,bd=99;for(let d=3;d<10;d++)if(tones.includes((lh+d)%12)&&Math.abs(d-7)<bd){bd=Math.abs(d-7);l2=lh+d}
      if(sp.arp){const pat=[lh,l2,v[0]-lh>9?v[0]:v[0]+12,v.length>1?v[1]+12:v[0]+12];let k=0;
        for(let pos=st;pos<en-1e-6;pos+=0.5,k++)put(mix,piano(mtof(pat[k%4],cents),(t1-bt(pos))*0.8+0.2,0.32,R),bt(pos)+jit());
        for(const m of v)put(mix,piano(mtof(m,cents),t1-t0,0.22,R),t0+jit());
      }else for(let pos=st;pos<en-1e-6;){const nx=Math.min(en,pos+(bpb===4?2:3)),acc=(pos%bpb===0)?0.5:0.42;
        for(const m of v)put(mix,piano(mtof(m,cents),bt(nx)-bt(pos),acc,R),bt(pos)+jit());
        put(mix,piano(mtof(lh,cents),bt(nx)-bt(pos),acc*0.9,R),bt(pos)+jit());
        for(let o=1;o<nx-pos;o++)put(mix,piano(mtof(l2,cents),bt(nx)-bt(pos+o),0.25,R),bt(pos+o)+jit());pos=nx}
    }else if(inst==='guitar'){
      const pat=[[0,1],[1,0.7],[1.5,0.5],[2.5,0.55],[3,0.75],[3.5,0.5]];
      let low=40+mod(c.bass-40,12);if(low>47)low-=12;const stack=[low];for(let m=low+3;m<73&&stack.length<6;m++)if(tones.includes(m%12)&&m-stack[stack.length-1]>=3)stack.push(m);
      for(let bar=st;bar<en;bar+=4)for(let i=0;i<pat.length;i++){const p=bar+pat[i][0];if(p>=en)break;const q=Math.min(en,i+1<pat.length?bar+pat[i+1][0]:bar+4),d=bt(q)-bt(p)+0.04,t=bt(p)+jit(),up=i%2===0;
        const ss=up?stack:stack.slice(-4).reverse();ss.forEach((m,k)=>put(mix,pluck(mtof(m,cents),d,pat[i][1]*0.33*(1-0.04*k),R),t+k*0.01))}
    }else{
      const v=[...new Set(tones.map(x=>55+mod(x-55,12)))].sort((a,b)=>a-b);
      for(const m of v)put(mix,pad(mtof(m,cents),t1-t0),t0,0.16);for(const m of v.slice(0,2))put(mix,pad(mtof(m+12,cents),t1-t0),t0,0.06);
      if(sp.drums==='four')for(let pos=st+0.5;pos<en;pos++)for(const m of v)put(mix,pluck(mtof(m+12,cents),bt(pos+0.4)-bt(pos),0.12,R,0.3),bt(pos)+jit());
    }
  }
  // bass
  segs.forEach(([st,en,s],i)=>{const c=parse(s);let bn=28+mod(c.bass-28,12);if(bn>38)bn-=12;const nx=i+1<segs.length?parse(segs[i+1][2]):null;
    for(let pos=st,k=0;pos<en-1e-6;pos++,k++){const last=pos+1>=en-1e-6;let notes=[[0,bn,0.5]];
      if(k%2===1)notes=[[0,k%4===1?bn+12:bn+7,0.38]];
      if(sp.bass5&&k%2===1)notes=[[0,bn+7,0.6]];
      if(sp.walk){const iv=QUAL[c.q],w=[0,iv[1],iv[2],iv[1]+(scale.includes((c.root+iv[1]+2)%12)?2:1)];notes=[[0,bn+w[k%4],0.9]]}
      if(last&&nx&&en-st>=2){let tg=28+mod(nx.bass-28,12);if(tg>38)tg-=12;const ap=R()<0.5?tg-1:tg+(scale.includes((tg+2)%12)?2:1);notes=sp.walk?[[0,ap,0.9]]:[[0,bn,0.45],[0.5,ap,0.35]]}
      for(const [o,m,d] of notes)put(mix,bassN(mtof(m,cents),bt(pos+o+d)-bt(pos+o),0.42*(sp.bass_mul||1)),bt(pos+o)+jit())}});
  // drums
  const dm=sp.drums_mul||1,mk=(len,fn)=>{const o=new Float32Array(Math.floor(len*SR));for(let i=0;i<o.length;i++)o[i]=fn(i/SR)*dm;return o};
  const kick=mk(0.3,t=>Math.sin(2*Math.PI*(50*t+95*(1-Math.exp(-t*30))/30))*Math.exp(-t*12)*0.9);
  let pz=0;const snare=mk(0.2,t=>{const z=R.n(1),d=z-pz;pz=z;return (0.45*Math.sin(2*Math.PI*185*t)*Math.exp(-t*28)+0.32*d*Math.exp(-t*18))*0.8});
  let h1=0,h2=0;const hat=mk(0.06,t=>{const z=R.n(1),d=z-2*h1+h2;h2=h1;h1=z;return d*Math.exp(-t*70)*0.05});
  for(let b=0;b<B;b++){const p=b%bpb,t=beats[b],dk=sp.drums;
    if(dk==='four'){put(mix,kick,t+jit());put(mix,hat,t+T/2+jit(),1.2);if(p%2)put(mix,snare,t+jit(),0.7)}
    else if(dk==='pop'){if(p%2===0)put(mix,kick,t+jit());if(p===1&&R()<0.5)put(mix,kick,t+T/2+jit(),0.7);if(p%2)put(mix,snare,t+jit());put(mix,hat,t+jit());put(mix,hat,t+T/2+jit(),0.7)}
    else{if(p===0)put(mix,kick,t+jit(),0.8);if(p===2)put(mix,snare,t+jit(),0.6);put(mix,hat,t+jit(),0.5);put(mix,hat,t+T/2+jit(),0.35)}}
  // vocal
  const chordAt=x=>{for(const [st,en,s] of segs)if(st<=x&&x<en)return parse(s);return parse(segs[segs.length-1][2])};
  const mel=[];let cur=60+mod(kpc+7-60,12)+(((kpc+7)%12)<5?12:0);
  for(let x=0;x<B-0.5;){const rel=x%(2*bpb);if(rel>=2*bpb-2){x+=0.5;continue}
    const c=chordAt(x),strong=Math.abs(x-Math.round(x))<1e-6&&Math.round(x)%2===0;
    const cands=[];for(let m=cur-5;m<=cur+5;m++)if(m>=60&&m<=81&&scale.includes(m%12))cands.push(m);
    let m=cur,d=0.5;
    if(strong){const ch=cands.filter(m=>c.tones.includes(m%12));if(ch.length)m=ch.reduce((a,b)=>Math.abs(b-cur)+R()*3<Math.abs(a-cur)+R()*3?b:a);d=R()<0.6?1:0.5}
    else{const nct=cands.filter(m=>!c.tones.includes(m%12)&&Math.abs(m-cur)<=2&&m!==cur);if(nct.length&&R()<0.65)m=nct[Math.floor(R()*nct.length)];else if(cands.length)m=cands.reduce((a,b)=>Math.abs(b-cur)+R()*4<Math.abs(a-cur)+R()*4?b:a)}
    mel.push([x,m,d]);cur=m;x+=d}
  const vl=0.30*(sp.voc==null?1:sp.voc);let pv=mel.length?mtof(mel[0][1],cents):300;
  for(const [xs,m,d] of mel){const f1=mtof(m,cents),t0=bt(xs),t1=bt(Math.min(B,xs+d));
    if(vl>0)put(dv,voice(pv,f1,Math.max(0.08,t1-t0-0.03),vl),t0+jit());
    if(sp.lead){const f2=2*f1,nn=Math.floor(Math.max(0.08,t1-t0-0.02)*SR),sw=new Float32Array(nn);
      for(let k=1;k<12&&f2*k<9000;k++){const w=2*Math.PI*f2*k*(1+0.003*(k%2))/SR;for(let i=0;i<nn;i++)sw[i]+=Math.sin(w*i)/k}
      for(let i=0;i<nn;i++)sw[i]*=Math.min(1,i/SR/0.005)*Math.exp(-i/SR*3)*0.14;put(mix,sw,t0)}
    pv=f1}
  const wet=sp.wet||1,rm=reverb(mix),rv=reverb(dv),x=new Float32Array(n);let pk=1e-9;
  for(let i=0;i<n;i++){x[i]=mix[i]+dv[i]+wet*(0.18*rm[i]+0.28*rv[i]);pk=Math.max(pk,Math.abs(x[i]))}
  for(let i=0;i<n;i++)x[i]*=0.89/pk;
  const chords=seq.map(s=>{const c=parse(s);return c.mm?{root:c.root,mm:c.mm}:null});
  return {x,sr:SR,truth:{key:{pc:kpc,mode},beats:beats.slice(0,B),T,chords}};
}
// key benchmark: [category, mode, [[degree, quality, beats]], extra, tonics]
const CATS=[
  ['pop I-V-vi-IV',0,[[0,'',4],[7,'',4],[9,'m',4],[5,'',4]],{inst:'piano',drums:'pop'},[0,2,4,7,9,11,6]],
  ['axis vi-IV-I-V',0,[[9,'m',4],[5,'',4],[0,'',4],[7,'',4]],{inst:'guitar',drums:'pop'},[0,3,5,7,10,1]],
  ['starts on IV',0,[[5,'',4],[0,'',4],[7,'',4],[9,'m',4]],{inst:'piano',drums:'pop',voc:1.3},[2,4,8,10,0,6]],
  ['starts on V',0,[[7,'',4],[9,'m',4],[5,'',4],[0,'',4]],{inst:'guitar',drums:'four'},[1,3,5,9,11,7]],
  ['bass on 5th',0,[[0,'',4],[5,'',4],[0,'',4],[7,'',4]],{inst:'piano',drums:'pop',bass5:true,bass_mul:2.2},[0,5,7,2,10,4]],
  ['minor i-VI-III-VII',1,[[0,'m',4],[8,'',4],[3,'',4],[10,'',4]],{inst:'piano',drums:'pop'},[9,4,2,7,0,5,11]],
  ['minor i-iv-v',1,[[0,'m',4],[5,'m',4],[7,'m',4],[0,'m',4]],{inst:'guitar',drums:'pop'},[1,6,8,3,10,9]],
  ['harmonic minor i-iv-V7',1,[[0,'m',4],[5,'m',4],[7,'7',4],[0,'m',4]],{inst:'piano',drums:'ballad',arp:true},[4,9,2,11,6,0]],
  ['andalusian i-VII-VI-V',1,[[0,'m',4],[10,'',4],[8,'',4],[7,'',4]],{inst:'guitar',drums:'pop'},[9,4,2,7,1,5]],
  ['dorian i-IV',1,[[0,'m7',4],[5,'',4],[0,'m7',4],[5,'',4]],{inst:'piano',drums:'pop'},[2,9,4,7,11,3]],
  ['edm pad+lead',1,[[0,'m',4],[8,'',4],[3,'',4],[10,'',4]],{inst:'pad',drums:'four',lead:true,voc:0},[10,3,8,1,6,11]],
  ['detuned +30c',0,[[0,'',4],[9,'m',4],[5,'',4],[7,'',4]],{inst:'guitar',drums:'pop',cents:30},[0,7,2,9]],
  ['detuned -30c',0,[[0,'',4],[9,'m',4],[5,'',4],[7,'',4]],{inst:'piano',drums:'pop',cents:-30},[5,10,3,8]],
  ['432 Hz',1,[[0,'m',4],[8,'',4],[10,'',4],[0,'m',4]],{inst:'piano',drums:'pop',cents:-31.77},[9,4,0,7]],
  ['mixolydian I-bVII-IV-I',0,[[0,'',4],[10,'',4],[5,'',4],[0,'',4]],{inst:'guitar',drums:'pop'},[7,2,9,4]],
  ['I-IV vamp',0,[[0,'',4],[5,'',4],[0,'',4],[5,'',4]],{inst:'piano',drums:'pop',voc:1.4},[0,7,10,3]],
  ['royal road IV-V-iii-vi',0,[[5,'maj7',4],[7,'7',4],[4,'m7',4],[9,'m',4]],{inst:'piano',drums:'pop'},[0,2,5,8]],
  ['ii7-V7-Imaj7-vi7',0,[[2,'m7',4],[7,'7',4],[0,'maj7',4],[9,'m7',4]],{inst:'piano',drums:'ballad',voc:1.3},[10,5,1,6]],
  ['verse vi.. chorus I..',0,[[9,'m',4],[5,'',4],[0,'',4],[7,'',4],[9,'m',4],[5,'',4],[0,'',4],[7,'',4],[0,'',4],[7,'',4],[9,'m',4],[5,'',4],[0,'',4],[7,'',4],[9,'m',4],[5,'',4]],{inst:'guitar',drums:'pop',bars:16},[2,11,4,9]],
  ['minor VI-VII-i-v',1,[[8,'',4],[10,'',4],[0,'m',4],[7,'m',4]],{inst:'pad',drums:'four',lead:true,voc:0.5},[9,4,11,6]],
  ['minor i-VI-iv-V',1,[[0,'m',4],[8,'',4],[5,'m',4],[7,'',4]],{inst:'piano',drums:'pop'},[1,8,3,10]],
  ['minor loud vocal (hard)',1,[[0,'m',4],[8,'',4],[3,'',4],[10,'',4]],{inst:'guitar',drums:'pop',voc:2.2,bass_mul:1.8,wet:2.5},[6,1,8,3]],
  ['major loud vocal (hard)',0,[[0,'',4],[7,'',4],[9,'m',4],[5,'',4]],{inst:'pad',drums:'pop',voc:2.6,bass_mul:1.8,wet:2.5},[11,4,6,1]],
  ['sub-bass EDM minor',1,[[0,'m',4],[10,'',4],[8,'',4],[10,'',4]],{inst:'pad',drums:'four',bass_mul:3,lead:true,voc:0},[4,11,2,8]],
  ['mostly drums',1,[[0,'m',4],[10,'',4],[8,'',4],[10,'',4]],{inst:'pad',drums:'four',drums_mul:4,voc:0.4},[9,2,7,0,5,10]],
];
const BPM=[96,104,112,120,128,90,100,124,116,108];
function KEYSET(){const out=[];CATS.forEach(([cat,mode,prog,extra,tonics],ci)=>tonics.forEach((k,j)=>out.push({name:`${cat} ${NM[k]}${mode?'m':''}`,cat,seed:ci*100+j+7,
  spec:Object.assign({bpm:BPM[(ci+j)%BPM.length],key:[NM[k],mode],bars:12,prog:prog.map(([d,q,n])=>[NM[(k+d)%12]+q,n])},extra)})));return out}
// gen_chords.py's songs (4/4 ones; 3/4 and modulating ones left out), chord ground truth per beat
const S2=(bpm,key,prog,inst,drums,bars,ex)=>Object.assign({bpm,key,prog,inst,drums,bars},ex||{});
const CHORDSET={
  pop_C_100:S2(100,['C',0],[['C',4],['G',4],['Am',4],['F',4]],'piano','pop',16),
  pop_E_120:S2(120,['E',0],[['C#m',4],['A',4],['E',4],['B',4]],'guitar','pop',16),
  ballad_Eb_75:S2(75,['Eb',0],[['Eb',4],['Cm',4],['Ab',2],['Bb',2],['Eb',4]],'piano','ballad',12,{arp:true}),
  minor_Am_128:S2(128,['A',1],[['Am',4],['F',4],['C',4],['G',4]],'pad','four',16),
  'minor_F#m_92':S2(92,['F#',1],[['F#m',4],['D',4],['A',4],['E',4]],'guitar','pop',16),
  jazz_Bb_110:S2(110,['Bb',0],[['Cm7',4],['F7',4],['Bbmaj7',8],['Gm7',4],['Cm7',4],['F7',4],['Bbmaj7',4]],'piano','pop',16),
  halfbar_D_96:S2(96,['D',0],[['D',2],['G',2],['A',2],['Bm',2],['G',2],['A',2],['D',4]],'piano','pop',16),
  twobar_Db_84:S2(84,['Db',0],[['Db',8],['Gb',8],['Bbm',8],['Ab',8]],'pad','ballad',16),
  mixo_G_136:S2(136,['G',0],[['G',4],['F',4],['C',4],['G',4],['Em',4],['C',4],['D',8]],'guitar','pop',16),
  susdim_C_90:S2(90,['C',0],[['C',4],['Fsus2',2],['F',2],['G7sus4',2],['G',2],['C',2],['Bdim',2],['Am',4],['Dm7',2],['G7',2]],'piano','ballad',16),
  slash_C_80:S2(80,['C',0],[['C',4],['G/B',4],['Am',4],['Em/G',4],['F',4],['C/E',4],['Dm',4],['G',4]],'piano','ballad',16),
  harmmin_Em_140:S2(140,['E',1],[['Em',4],['Am',4],['B7',4],['Em',4],['C',4],['Am',4],['B',8]],'guitar','pop',16),
  tuned_Gm_100:S2(100,['G',1],[['Gm',4],['Eb',4],['Bb',4],['F',4]],'piano','pop',16,{cents:28}),
  detuned_E_104:S2(104,['E',0],[['E',4],['B',4],['C#m',4],['A',4]],'guitar','pop',16,{cents:-42}),
  flatpop_Ab_122:S2(122,['Ab',0],[['Ab',4],['Eb',4],['Fm',4],['Db',4]],'guitar','four',16),
  vocal_G_96:S2(96,['G',0],[['G',4],['Bm',4],['Em',4],['C',4],['Am',4],['D',4],['G',4],['D/F#',4]],'guitar','pop',16,{voc:2.2}),
  walk_F_124:S2(124,['F',0],[['Gm7',4],['C7',4],['Fmaj7',4],['Dm7',4]],'piano','pop',16,{walk:true}),
  neosoul_C_84:S2(84,['C',0],[['Fmaj9',4],['Em7',4],['Dm9',4],['Cmaj7',2],['C6',2]],'piano','ballad',16,{voc:1.5}),
  edm_Dm_126:S2(126,['D',1],[['Dm',4],['Bb',4],['F',4],['C',4]],'pad','four',16,{lead:true,voc:0}),
  vi7_C_108:S2(108,['C',0],[['C',4],['Am7',4],['Fmaj7',4],['G',4],['Em7',4],['Am7',4],['Dm7',4],['G7',4]],'piano','pop',16,{voc:1.5}),
  'pop_E_120+hard':S2(120,['E',0],[['C#m',4],['A',4],['E',4],['B',4]],'guitar','pop',16,{voc:2.2,bass_mul:1.8,wet:2.5}),
  'jazz_Bb_110+hard':S2(110,['Bb',0],[['Cm7',4],['F7',4],['Bbmaj7',8],['Gm7',4],['Cm7',4],['F7',4],['Bbmaj7',4]],'piano','pop',16,{voc:2.2,bass_mul:1.8,wet:2.5}),
  'slash_C_80+hard':S2(80,['C',0],[['C',4],['G/B',4],['Am',4],['Em/G',4],['F',4],['C/E',4],['Dm',4],['G',4]],'piano','ballad',16,{voc:2.2,bass_mul:1.8,wet:2.5}),
  'walk_F_124+hard':S2(124,['F',0],[['Gm7',4],['C7',4],['Fmaj7',4],['Dm7',4]],'piano','pop',16,{walk:true,voc:2.2,bass_mul:1.8,wet:2.5}),
  'vocal_G_96+hard':S2(96,['G',0],[['G',4],['Bm',4],['Em',4],['C',4],['Am',4],['D',4],['G',4],['D/F#',4]],'guitar','pop',16,{voc:4.8,bass_mul:1.8,wet:2.5}),
  cm_ballad_78:S2(78,['C',1],[['Cm',4],['Ab',4],['Eb',4],['Bb',4],['Fm',4],['Ab',4],['G7',8]],'piano','ballad',16,{arp:true}),
};
window.GENK={make,KEYSET,CHORDSET,SR,NM};
})();
