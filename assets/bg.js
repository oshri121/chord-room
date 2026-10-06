/* Chord Room animated background: soft accent orbs, a flowing sound-wave ribbon and drifting dust.
   One fixed <canvas> behind the page. ~30 fps, 1 canvas px per CSS px, paused while the tab is hidden or nobody is around,
   a single still frame under prefers-reduced-motion or <html class="a11y-noanim">.
   window.BG.pulse(level 0..1) makes it breathe with the music (glow boost that decays).
   perf: the drawing runs in a Web Worker on an OffscreenCanvas (this same file, started as a worker), so the page's main thread
   never paints it; browsers without OffscreenCanvas run the same engine on the page. Idle = no pointer / scroll / key / touch
   and no BG.pulse for 6 s → the loop stops and the last frame stays (no frames, no repaint); any of those wakes it. */
(function(){
  'use strict';

  /* ---------- the engine: same code on the page and in the worker. cv = canvas (or OffscreenCanvas), tell(msg) = report state ---------- */
  function Engine(cv,mkCanvas,tell){
    var ctx=cv.getContext('2d');
    if(!ctx)return null;
    var raf=typeof requestAnimationFrame==='function'?requestAnimationFrame:function(f){return setTimeout(function(){f(performance.now())},33)};
    var caf=typeof cancelAnimationFrame==='function'?cancelAnimationFrame:clearTimeout;
    var orb=mkCanvas(8,8),octx=orb.getContext('2d');
    var OS=8;/* orbs are rendered at 1/8 size and scaled up: they are blurry anyway */
    var W=0,H=0,dpr=1,t=0,last=0,req=0,energy=0,dark=false,still=false,hidden=false;
    var mx=0,my=0,tx=0,ty=0,act=performance.now(),IDLE=6000;
    var stats={frames:0,ms:0};
    var BLUE=[47,140,255],PURPLE=[182,109,255],ORANGE=[255,122,26];
    var ORBS=[
      {c:BLUE,  x:.12,y:.18,r:.46,sx:.11,sy:.13,ph:0},
      {c:PURPLE,x:.84,y:.26,r:.40,sx:.09,sy:.12,ph:2.1},
      {c:ORANGE,x:.66,y:.88,r:.44,sx:.08,sy:.10,ph:4.2},
      {c:BLUE,  x:.30,y:.95,r:.30,sx:.13,sy:.07,ph:1.3},
      {c:PURPLE,x:.45,y:.45,r:.26,sx:.07,sy:.09,ph:3.3}
    ];
    var dust=[];

    function rgba(c,a){return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a.toFixed(3)+')'}
    function seed(n){var s=n;return function(){s=(s*16807)%2147483647;return (s-1)/2147483646}}
    function makeDust(){
      var rnd=seed(7),n=Math.min(56,Math.round(W*H/26000));dust=[];
      for(var i=0;i<n;i++)dust.push({x:rnd(),y:rnd(),r:.6+rnd()*1.6,v:.006+rnd()*.018,sw:rnd()*6.28,tw:.6+rnd()*1.6,c:[BLUE,PURPLE,ORANGE][i%3],z:.3+rnd()*.7});
    }
    function resize(w,h,d){
      W=w;H=h;dpr=Math.min(1,d||1);/* perf: soft art — 1 canvas px per CSS px (was ≤1.5: 2.25× the pixels every frame) */
      cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
      orb.width=Math.max(8,Math.ceil(W/OS));orb.height=Math.max(8,Math.ceil(H/OS));
      makeDust();draw();
    }

    function drawOrbs(){
      var w=orb.width,h=orb.height,m=Math.max(w,h),boost=1+.7*energy;
      octx.clearRect(0,0,w,h);
      var base=dark?.30:.15;
      for(var i=0;i<ORBS.length;i++){
        var o=ORBS[i];
        var x=(o.x+o.sx*Math.sin(t*.07*(1+i*.13)+o.ph))*w-mx*30/OS*(1+i*.2);
        var y=(o.y+o.sy*Math.cos(t*.09*(1+i*.11)+o.ph))*h-my*24/OS*(1+i*.2);
        var r=o.r*m*(1+.04*Math.sin(t*.25+o.ph)+.08*energy);
        var a=Math.min(.6,base*boost*(i>2?.8:1));
        var g=octx.createRadialGradient(x,y,0,x,y,r);
        g.addColorStop(0,rgba(o.c,a));g.addColorStop(.45,rgba(o.c,a*.45));g.addColorStop(1,rgba(o.c,0));
        octx.fillStyle=g;octx.fillRect(x-r,y-r,2*r,2*r);
      }
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';
      ctx.drawImage(orb,0,0,w,h,0,0,W,H);
    }

    function ribbon(cy,amp,n,alpha,speed,freq,lw,shift){
      var g=ctx.createLinearGradient(0,0,W,0);
      g.addColorStop(0,rgba(BLUE,0));g.addColorStop(.14,rgba(BLUE,1));g.addColorStop(.5,rgba(PURPLE,1));
      g.addColorStop(.86,rgba(ORANGE,1));g.addColorStop(1,rgba(ORANGE,0));
      ctx.strokeStyle=g;ctx.lineWidth=lw;
      var step=Math.max(10,W/110),f1=6.2832*freq/W,f2=f1*2.3,A=amp*(1+.45*energy),px=mx*14,py=my*10;
      for(var k=0;k<n;k++){
        var u=n>1?k/(n-1):.5,ua=Math.sin(Math.PI*u);
        ctx.globalAlpha=alpha*(.25+.75*ua)*(1+.5*energy);
        var tw=.55+.45*Math.sin(t*.21*speed+u*2.6+shift);
        ctx.beginPath();
        for(var x=-step;x<=W+step;x+=step){
          var e=.3+.7*Math.sin(Math.PI*Math.min(1,Math.max(0,x/W)));
          var y=cy+py+A*e*(Math.sin((x+px)*f1+t*.33*speed+u*1.1+shift)*tw+.42*Math.sin((x-px)*f2-t*.26*speed+u*.7+shift*1.7));
          if(x===-step)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha=1;
    }

    function drawDust(){
      var a0=dark?.55:.28;
      for(var i=0;i<dust.length;i++){
        var p=dust[i];
        var x=(p.x*W+Math.sin(t*.3+p.sw)*14*p.z-mx*8*p.z),y=(p.y*H-my*6*p.z);
        var a=a0*p.z*(.45+.55*Math.sin(t*p.tw+p.sw))*(1+.6*energy);
        if(a<=.01)continue;
        ctx.fillStyle=rgba(p.c,Math.min(1,a));
        ctx.beginPath();ctx.arc(x,y,p.r*(1+.3*energy),0,6.2832);ctx.fill();
      }
    }

    function draw(){
      if(!W)return;
      var s=performance.now();
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      drawOrbs();
      ctx.globalCompositeOperation=dark?'lighter':'source-over';
      var small=W<700;
      var k=small?.7:1;
      ribbon(H*.62,Math.min(H*.13,120),small?10:18,(dark?.28:.20)*k,1,1.15,dark?1.1:1,0);
      ribbon(H*.28,Math.min(H*.06,60),small?4:6,(dark?.20:.11)*k,.7,.8,1,2.4);
      drawDust();
      ctx.globalCompositeOperation='source-over';
      stats.frames++;stats.ms+=performance.now()-s;
    }

    function frame(now){
      if(now-act>IDLE&&!energy&&Math.abs(tx-mx)+Math.abs(ty-my)<.01){req=0;tell({run:false,frames:stats.frames,ms:stats.ms});return}
      req=raf(frame);
      if(now-last<30)return;
      var dt=last?Math.min(.1,(now-last)/1000):0;last=now;
      t+=dt;
      energy*=Math.pow(.86,dt*30);if(energy<.002)energy=0;
      mx+=(tx-mx)*.06;my+=(ty-my)*.06;
      draw();
    }
    function start(){if(!req&&!still&&!hidden&&W){last=0;req=raf(frame);tell({run:true})}}
    function stop(){if(req){caf(req);req=0;tell({run:false,frames:stats.frames,ms:stats.ms})}}

    /* messages: {size:[w,h,dpr]} {dark} {still} {hidden} {pulse} {ptr:[x,y]} {wake} */
    return function(m){
      if(m.size)resize(m.size[0],m.size[1],m.size[2]);
      if('dark' in m)dark=!!m.dark;
      if('still' in m&&!!m.still!==still){still=!!m.still;if(still){stop();t=14;energy=0;mx=my=tx=ty=0}}
      if('hidden' in m){hidden=!!m.hidden;if(hidden)stop()}
      if(m.ptr){tx=m.ptr[0];ty=m.ptr[1]}
      if(m.pulse>0&&!still)energy=Math.max(energy,Math.min(1,m.pulse));
      if(m.wake||m.pulse||m.ptr)act=performance.now();
      if(m.draw||'dark' in m||m.size)draw();
      if(!still)start();
    };
  }

  /* ---------- worker side: this file started with new Worker(...) ---------- */
  if(typeof window==='undefined'){
    var E=null;
    self.onmessage=function(e){
      var m=e.data||{};
      if(m.canvas)E=Engine(m.canvas,function(w,h){return new OffscreenCanvas(w,h)},function(s){self.postMessage(s)});
      if(E)E(m);
    };
    return;
  }

  /* ---------- page side ---------- */
  if(window.BG)return;
  var root=document.documentElement;
  var cv=document.createElement('canvas');cv.id='bgCanvas';cv.setAttribute('aria-hidden','true');
  var rm=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
  var fine=window.matchMedia?matchMedia('(pointer: fine)'):null;
  var self_src=document.currentScript&&document.currentScript.src;
  var send=null,still=false,state={run:false,frames:0,ms:0,worker:false},lastWake=0,lastPtr=0;
  function onState(s){for(var k in s)state[k]=s[k]}

  /* still (and, in high contrast, hidden by a11y.css): reduced motion, the a11y "stop animations" switch, high contrast */
  function isStill(){return !!(rm&&rm.matches)||root.classList.contains('a11y-noanim')||root.classList.contains('a11y-contrast')}
  function dark(){return root.getAttribute('data-theme-resolved')==='dark'}
  function size(){return [window.innerWidth,window.innerHeight,window.devicePixelRatio||1]}
  function sync(){if(!send)return;still=isStill();send({dark:dark(),still:still,draw:1})}
  /* perf: <html data-idle> after 6 s without input or music: the CSS decorative loops (header line, logo, home/pricing art)
     pause too (shell.css, pages.css); the first input or BG.pulse removes it */
  var actAt=performance.now(),idleT=0,IDLE_MS=6000;
  function idleCheck(){var d=performance.now()-actAt;if(d>=IDLE_MS){idleT=0;root.setAttribute('data-idle','')}else idleT=setTimeout(idleCheck,IDLE_MS-d+50)}
  function active(){actAt=performance.now();if(root.hasAttribute('data-idle'))root.removeAttribute('data-idle');if(!idleT)idleT=setTimeout(idleCheck,IDLE_MS)}
  function wake(){active();if(still||!send)return;var n=performance.now();if(n-lastWake<400&&state.run)return;lastWake=n;send({wake:1})}

  function mount(){
    document.body.insertBefore(cv,document.body.firstChild);
    still=isStill();
    var first={size:size(),dark:dark(),still:still,hidden:document.hidden,wake:1};
    if(self_src&&window.Worker&&cv.transferControlToOffscreen&&window.OffscreenCanvas){
      try{
        var oc=cv.transferControlToOffscreen(),w=new Worker(self_src);
        w.onmessage=function(e){onState(e.data||{})};
        w.postMessage({canvas:oc},[oc]);
        send=function(m){w.postMessage(m)};state.worker=true;
      }catch(e){send=null}
    }
    if(!send){
      var run=Engine(cv,function(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c},onState);
      if(!run)return;
      send=run;
    }
    send(first);
  }

  window.addEventListener('resize',function(){if(send)send({size:size()})});
  document.addEventListener('visibilitychange',function(){if(send)send({hidden:document.hidden})});
  new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['class','data-theme-resolved','data-theme']});
  if(rm){var f=function(){sync()};rm.addEventListener?rm.addEventListener('change',f):rm.addListener&&rm.addListener(f)}
  window.addEventListener('pointermove',function(e){
    active();if(still||!send)return;
    if((fine&&!fine.matches)||e.pointerType==='touch'){wake();return}
    var n=performance.now();if(n-lastPtr<30)return;lastPtr=n;
    send({ptr:[(e.clientX/window.innerWidth-.5)*2,(e.clientY/window.innerHeight-.5)*2]});
  },{passive:true});
  ['scroll','keydown','touchstart','wheel'].forEach(function(ev){window.addEventListener(ev,wake,{passive:true,capture:true})});

  window.BG={
    pulse:function(level){var v=+level;if(!(v>0))return;active();if(still||!send)return;send({pulse:Math.min(1,v)})},
    stats:function(){return {frames:state.frames,avgMs:state.frames?state.ms/state.frames:0,running:!!state.run,still:still,worker:!!state.worker}},
    wake:wake
  };
  active();
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
})();
