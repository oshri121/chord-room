/* Chord Room - quick DSP stem separation (Web Worker), used by Mashup Studio as the free, lower-quality fallback
   when AI separation is unavailable. It is the tool's original "quick separation" (first version of the site):
   STFT 4096/1024, median-filter harmonic/percussive split (13 frames x 13 bins), then
     drums  = percussive part
     bass   = harmonic part below ~150-300 Hz
     vocals = harmonic, 120 Hz-13 kHz, weighted by how centred (L=R) each bin is (lead vocals sit in the middle)
     other  = the rest (input minus the three above), so the four stems always add back to the input.
   in:  {L, R, sr}  (Float32Array stereo)   out: {type:'p', p} progress, then {type:'done', res:[vL,vR,dL,dR,bL,bR,oL,oR]} */
function makeFFT(n){const cos=new Float64Array(n/2),sin=new Float64Array(n/2),rev=new Uint32Array(n);
for(let i=0;i<n/2;i++){cos[i]=Math.cos(2*Math.PI*i/n);sin[i]=Math.sin(2*Math.PI*i/n)}
const bits=Math.log2(n);for(let i=0;i<n;i++){let r=0,x=i;for(let b=0;b<bits;b++){r=(r<<1)|(x&1);x>>=1}rev[i]=r}
return (re,im)=>{for(let i=0;i<n;i++){const j=rev[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
for(let size=2;size<=n;size<<=1){const half=size>>1,step=n/size;for(let i=0;i<n;i+=size){for(let j=i,k=0;j<i+half;j++,k+=step){
const l=j+half,tr=re[l]*cos[k]+im[l]*sin[k],ti=-re[l]*sin[k]+im[l]*cos[k];re[l]=re[j]-tr;im[l]=im[j]-ti;re[j]+=tr;im[j]+=ti}}}}}
function med(a,n){for(let i=1;i<n;i++){const v=a[i];let j=i-1;while(j>=0&&a[j]>v){a[j+1]=a[j];j--}a[j+1]=v}return a[n>>1]}
self.onmessage=e=>{
 const L=e.data.L,R=e.data.R,sr=e.data.sr,N=4096,HOP=1024,B=N/2+1,D=6,K=2*D+1,FK=6,FW=2*FK+1;
 const len=L.length,pad=N,frames=Math.ceil((len+pad)/HOP)+1,total=frames*HOP+N;
 const w=new Float64Array(N);for(let i=0;i<N;i++)w[i]=Math.sqrt(0.5-0.5*Math.cos(2*Math.PI*i/N));
 const fft=makeFFT(N),out=[0,1,2].map(()=>[new Float32Array(total),new Float32Array(total)]);
 const rZr=[],rZi=[],rS=[],rC=[];for(let j=0;j<K;j++){rZr.push(new Float64Array(N));rZi.push(new Float64Array(N));rS.push(new Float32Array(B));rC.push(new Float32Array(B))}
 const re=new Float64Array(N),im=new Float64Array(N),yr=new Float64Array(N),yi=new Float64Array(N),tmp=new Float32Array(K),tf=new Float32Array(FW);
 const wb=new Float32Array(B),wv=new Float32Array(B);
 for(let k=0;k<B;k++){const f=k*sr/N;
  wb[k]=f<=150?1:f>=300?0:0.5+0.5*Math.cos(Math.PI*(f-150)/150);
  wv[k]=f<=120?0:f<220?(f-120)/100:f<=9000?1:f>=13000?0:1-(f-9000)/4000;}
 const M=[new Float32Array(B),new Float32Array(B),new Float32Array(B)];
 for(let f=0;f<frames+D;f++){
  const slot=f%K;
  if(f<frames){
   const off=f*HOP-pad;
   for(let i=0;i<N;i++){const s=off+i;const inb=s>=0&&s<len;re[i]=inb?L[s]*w[i]:0;im[i]=inb?R[s]*w[i]:0}
   fft(re,im);rZr[slot].set(re);rZi[slot].set(im);
   const S=rS[slot],C=rC[slot];
   for(let k=0;k<B;k++){const kn=(N-k)%N,a=re[k],b=im[k],c=re[kn],d=im[kn];
    const xlr=(a+c)/2,xli=(b-d)/2,xrr=(b+d)/2,xri=(c-a)/2,mr=(xlr+xrr)/2,mi=(xli+xri)/2,mm=mr*mr+mi*mi;
    S[k]=Math.sqrt(mm);C[k]=4*mm/(2*(xlr*xlr+xli*xli+xrr*xrr+xri*xri)+1e-12)}
  }else{rS[slot].fill(0)}
  const t=f-D;if(t<0)continue;if(t>=frames)break;
  const ts=t%K,St=rS[ts],Ct=rC[ts];
  for(let k=0;k<B;k++){
   for(let j=0;j<K;j++)tmp[j]=rS[j][k];const H=med(tmp,K);
   for(let j=0;j<FW;j++){const q=k-FK+j;tf[j]=q>=0&&q<B?St[q]:0}const P=med(tf,FW);
   const h2=H*H,p2=P*P,mp=p2/(h2+p2+1e-12),mh=1-mp;
   const c=Math.min(1,Ct[k]),c6=c*c*c*c*c*c;
   M[1][k]=mp;M[2][k]=mh*wb[k];M[0][k]=mh*(1-wb[k])*wv[k]*c6;
  }
  const Zr=rZr[ts],Zi=rZi[ts],pos=t*HOP;
  for(let s=0;s<3;s++){
   const m=M[s];
   for(let k=0;k<N;k++){const mk=m[k<B?k:N-k];yr[k]=Zr[k]*mk;yi[k]=-Zi[k]*mk}
   fft(yr,yi);
   const oL=out[s][0],oR=out[s][1],g=0.5/N;
   for(let i=0;i<N;i++){oL[pos+i]+=yr[i]*w[i]*g;oR[pos+i]-=yi[i]*w[i]*g}
  }
  if(t%150===0)postMessage({type:'p',p:t/frames});
 }
 const res=[];for(let s=0;s<3;s++)for(let ch=0;ch<2;ch++)res.push(out[s][ch].slice(pad,pad+len));
 const oL=new Float32Array(len),oR=new Float32Array(len);
 for(let i=0;i<len;i++){oL[i]=L[i]-res[0][i]-res[2][i]-res[4][i];oR[i]=R[i]-res[1][i]-res[3][i]-res[5][i]}
 res.push(oL,oR);
 postMessage({type:'done',res},res.map(a=>a.buffer));
};
