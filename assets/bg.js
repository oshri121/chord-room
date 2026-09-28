/* Chord Room animated background: soft accent orbs, a flowing sound-wave ribbon and drifting dust.
   One fixed <canvas> behind the page. ~30 fps, DPR ≤ 1.5, paused while the tab is hidden,
   a single still frame under prefers-reduced-motion or <html class="a11y-noanim">.
   window.BG.pulse(level 0..1) makes it breathe with the music (glow boost that decays). */
(function(){
  'use strict';
  if(window.BG)return;
  var root=document.documentElement;
  var cv=document.createElement('canvas');cv.id='bgCanvas';cv.setAttribute('aria-hidden','true');
  var ctx=cv.getContext('2d');
  if(!ctx)return;
  var orb=document.createElement('canvas'),octx=orb.getContext('2d');
  var OS=8;/* orbs are rendered at 1/8 size and scaled up: they are blurry anyway */
  var W=0,H=0,dpr=1,t=0,last=0,req=0,energy=0,dark=false,still=false;
  var mx=0,my=0,tx=0,ty=0;
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
  var rm=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):null;
  var fine=window.matchMedia?matchMedia('(pointer: fine)'):null;

  function rgba(c,a){return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a.toFixed(3)+')'}
  function seed(n){var s=n;return function(){s=(s*16807)%2147483647;return (s-1)/2147483646}}
  function makeDust(){
    var rnd=seed(7),n=Math.min(56,Math.round(W*H/26000));dust=[];
    for(var i=0;i<n;i++)dust.push({x:rnd(),y:rnd(),r:.6+rnd()*1.6,v:.006+rnd()*.018,sw:rnd()*6.28,tw:.6+rnd()*1.6,c:[BLUE,PURPLE,ORANGE][i%3],z:.3+rnd()*.7});
  }
  function resize(){
    W=window.innerWidth;H=window.innerHeight;dpr=Math.min(1.5,window.devicePixelRatio||1);
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
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
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
    req=requestAnimationFrame(frame);
    if(now-last<30)return;
    var dt=last?Math.min(.1,(now-last)/1000):0;last=now;
    t+=dt;
    energy*=Math.pow(.86,dt*30);if(energy<.002)energy=0;
    mx+=(tx-mx)*.06;my+=(ty-my)*.06;
    draw();
  }
  function isStill(){return !!(rm&&rm.matches)||root.classList.contains('a11y-noanim')}
  function start(){if(!req&&!still&&!document.hidden){last=0;req=requestAnimationFrame(frame)}}
  function stop(){if(req){cancelAnimationFrame(req);req=0}}
  function sync(){
    dark=root.getAttribute('data-theme-resolved')==='dark';
    var s=isStill();
    if(s!==still){still=s;if(still){stop();t=14;energy=0;mx=my=0}}
    if(still)draw();else{draw();start()}
  }

  window.addEventListener('resize',function(){requestAnimationFrame(resize)});
  document.addEventListener('visibilitychange',function(){document.hidden?stop():start()});
  new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['class','data-theme-resolved','data-theme']});
  if(rm){var f=function(){sync()};rm.addEventListener?rm.addEventListener('change',f):rm.addListener&&rm.addListener(f)}
  window.addEventListener('pointermove',function(e){
    if(still||(fine&&!fine.matches)||e.pointerType==='touch')return;
    tx=(e.clientX/W-.5)*2;ty=(e.clientY/H-.5)*2;
  },{passive:true});

  window.BG={
    pulse:function(level){var v=+level;if(!(v>0)||still)return;energy=Math.max(energy,Math.min(1,v))},
    stats:function(){return {frames:stats.frames,avgMs:stats.frames?stats.ms/stats.frames:0,running:!!req,still:still}}
  };

  function mount(){
    document.body.insertBefore(cv,document.body.firstChild);
    still=isStill();if(still)t=14;
    dark=root.getAttribute('data-theme-resolved')==='dark';
    resize();start();
  }
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
})();
