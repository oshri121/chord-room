/* Test init script (lib.context(init=...)): what reaches the speakers vs what the tool shows.
   * window.__rec — every AudioNode.connect(ctx.destination) of a real AudioContext goes through one tap GainNode → destination,
     and an AudioWorklet (blob module, allowed by the CSP's script-src blob:) records the tap's output frame-exactly:
     __rec.start()/stop(), __rec.chunks = [[firstFrame, [samples…]], …] (mono), __rec.starts = every long AudioBufferSourceNode.start
     as [when, offset, currentTime, playbackRate].
   * window.__disp — after each frame of the tool's draw loop (rAF callback named `loop`), one row
     [performance.now(), currentTime, heardContextTime (getOutputTimestamp, extrapolated), index of the highlighted sheet cell,
      #nowName text, outputLatency, baseLatency]; __disp.on = true/false.
   * window.__latencyHint (set before this script) → every AudioContext is created with that latencyHint, e.g. 0.3 → Chromium
     reports ~0.6 s of output latency: a stand-in for Bluetooth headphones. */
(()=>{
  const AC=window.AudioContext;if(!AC)return;
  const LH=window.__latencyHint;
  if(LH!=null){window.AudioContext=class extends AC{constructor(o){super({...(o||{}),latencyHint:LH})}}}
  const R=window.__rec={chunks:[],sr:0,ctx:null,on:false,starts:[]};
  const SRC=`class T extends AudioWorkletProcessor{constructor(){super();this.b=[];this.n=0;this.f0=-1;this.on=false;this.port.onmessage=e=>{this.on=e.data}}
    process(i){if(!this.on)return true;const x=i[0],m=new Float32Array(128);if(x&&x.length){const L=x[0],Rr=x[1]||x[0];for(let k=0;k<L.length;k++)m[k]=(L[k]+Rr[k])*0.5}
      if(this.f0<0)this.f0=currentFrame;this.b.push(m);this.n+=128;
      if(this.n>=8192){const o=new Float32Array(this.n);let p=0;for(const q of this.b){o.set(q,p);p+=q.length}this.port.postMessage({f0:this.f0,x:o},[o.buffer]);this.b=[];this.n=0;this.f0=-1}
      return true}}registerProcessor('cr-tap',T)`;
  const url=URL.createObjectURL(new Blob([SRC],{type:'text/javascript'}));
  const taps=new WeakMap(),oc=AudioNode.prototype.connect,od=AudioNode.prototype.disconnect;
  function tapFor(ctx){
    let t=taps.get(ctx);if(t)return t;
    t=ctx.createGain();oc.call(t,ctx.destination);taps.set(ctx,t);R.ctx=ctx;R.sr=ctx.sampleRate;
    ctx.audioWorklet.addModule(url).then(()=>{const w=new AudioWorkletNode(ctx,'cr-tap',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      w.port.onmessage=e=>R.chunks.push([e.data.f0,Array.from(e.data.x)]);oc.call(t,w);oc.call(w,ctx.destination);R.w=w;R.ready=true;w.port.postMessage(R.on)});
    return t;
  }
  R.start=()=>{R.on=true;R.chunks=[];R.starts=[];if(R.w)R.w.port.postMessage(true)};
  R.stop=()=>{R.on=false;if(R.w)R.w.port.postMessage(false)};
  AudioNode.prototype.connect=function(d,...a){if(d instanceof AudioDestinationNode&&d.context instanceof AC){oc.call(this,tapFor(d.context),...a);return d}return oc.call(this,d,...a)};
  AudioNode.prototype.disconnect=function(d,...a){if(d instanceof AudioDestinationNode&&d.context instanceof AC)return od.call(this,tapFor(d.context),...a);return od.apply(this,arguments)};
  const ost=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(w,o,d){if(this.context instanceof AC&&this.buffer&&this.buffer.duration>5)R.starts.push([w,o||0,this.context.currentTime,this.playbackRate.value]);return ost.apply(this,arguments)};
  const D=window.__disp={rows:[],on:false,cells:null};
  const raf=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=cb=>raf(ts=>{cb(ts);if(!D.on||cb.name!=='loop')return;
    const c=R.ctx;if(!c)return;const pn=performance.now();let h=null;
    if(c.getOutputTimestamp){const o=c.getOutputTimestamp();if(o&&o.performanceTime)h=o.contextTime+(pn-o.performanceTime)/1000}
    if(!D.cells)D.cells=[...document.querySelectorAll('#sheet .cell:not(.empty)')];
    const on=document.querySelector('#sheet .cell.on');
    D.rows.push([pn,c.currentTime,h,on?D.cells.indexOf(on):-1,(document.querySelector('#nowName')||{}).textContent||'',c.outputLatency||0,c.baseLatency||0])});
})();
