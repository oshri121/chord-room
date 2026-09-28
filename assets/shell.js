/* Chord Room shell: sticky top bar, fit-to-content compaction, sliding tab indicator, mobile drawer.
   Plain script, no dependencies. It never calls app.js: it only watches the DOM
   (the `on` class app.js puts on the nav tabs, `hidden` on the tools, <html lang/dir>). */
(function(){
  'use strict';
  var top=document.getElementById('top');
  if(!top)return;
  var root=document.documentElement;
  var topIn=top.querySelector('.top-in');
  var tabs=document.getElementById('navTabs');
  var ind=tabs&&tabs.querySelector('.tab-ind');
  var drawer=document.getElementById('navDrawer');
  var burger=document.getElementById('navBurger');
  var closeBtn=document.getElementById('navClose');
  var scrim=document.getElementById('navScrim');
  var drawerT=document.getElementById('navDrawerT');
  var mq=window.matchMedia('(max-width:860px)');
  var LEVELS=['c1','c2','c3','c4'];

  /* labels owned by the shell (all five app languages) */
  var L={
    he:{menu:'תפריט',open:'פתיחת התפריט',close:'סגירת התפריט',nav:'ניווט ראשי'},
    en:{menu:'Menu',open:'Open menu',close:'Close menu',nav:'Main navigation'},
    ar:{menu:'القائمة',open:'فتح القائمة',close:'إغلاق القائمة',nav:'التنقل الرئيسي'},
    ru:{menu:'Меню',open:'Открыть меню',close:'Закрыть меню',nav:'Основная навигация'},
    es:{menu:'Menú',open:'Abrir menú',close:'Cerrar menú',nav:'Navegación principal'}
  };
  function lbl(){return L[root.lang]||L.en}
  function isOpen(){return top.classList.contains('open')}
  function isDrawer(){return top.classList.contains('m')}
  function applyLabels(){
    var l=lbl();
    if(drawerT&&drawerT.textContent!==l.menu)drawerT.textContent=l.menu;
    if(closeBtn)closeBtn.setAttribute('aria-label',l.close);
    if(burger)burger.setAttribute('aria-label',isOpen()?l.close:l.open);
    if(tabs)tabs.setAttribute('aria-label',l.nav);
    var tl=document.querySelector('#navTool span[data-i]');if(mark&&tl&&tl.textContent&&mark.title!==tl.textContent)mark.title=tl.textContent;
    /* icon-only tabs/tools (compact levels) still show their name on hover */
    Array.prototype.forEach.call(top.querySelectorAll('.tab,#libBtn,#adminBtn,#signInBtn'),function(b){
      var s=b.querySelector('span[data-i]');if(s&&s.textContent&&b.title!==s.textContent)b.title=s.textContent;
    });
  }

  /* ---------- scrolled state ---------- */
  var scrolled=null;
  function onScroll(){var s=(window.scrollY||root.scrollTop)>4;if(s!==scrolled){scrolled=s;top.classList.toggle('scrolled',s)}}
  window.addEventListener('scroll',onScroll,{passive:true});onScroll();

  /* ---------- fit: compact step by step, then fall back to the drawer ---------- */
  var mark=top.querySelector('.mark');
  function overflows(){
    return (drawer&&drawer.scrollWidth>drawer.clientWidth+1)||topIn.scrollWidth>topIn.clientWidth+1||(mark&&mark.scrollWidth>mark.clientWidth+1);
  }
  function fit(){
    var wasDrawer=isDrawer(),cl=top.classList;
    LEVELS.forEach(function(c){cl.remove(c)});cl.remove('m','m2','m3');
    var m=mq.matches;
    if(!m){for(var i=0;i<LEVELS.length&&overflows();i++)cl.add(LEVELS[i]);if(overflows())m=true}
    if(m){LEVELS.forEach(function(c){cl.remove(c)});cl.add('m');if(overflows())cl.add('m2');if(overflows())cl.add('m3')}
    if(wasDrawer&&!m)close(false);
    if(m!==wasDrawer){cl.remove('anim');setInert();if(m)requestAnimationFrame(function(){requestAnimationFrame(function(){if(isDrawer())cl.add('anim')})})}
  }

  /* ---------- brand mark → home (the Tool view) ---------- */
  if(mark){
    mark.setAttribute('role','link');mark.tabIndex=0;
    var goHome=function(){var t=document.getElementById('navTool');if(t)t.click();if(isOpen())close(false)};
    mark.addEventListener('click',goHome);
    mark.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();goHome()}});
  }

  /* ---------- sliding tab indicator ---------- */
  var tabBtns=tabs?Array.prototype.slice.call(tabs.querySelectorAll('.tab')):[];
  function place(){
    if(!ind)return;
    var on=null;
    for(var i=0;i<tabBtns.length;i++){var b=tabBtns[i],act=b.classList.contains('on')&&!b.hidden;if(act&&!on)on=b;if(act)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')}
    if(!on||!on.offsetWidth){ind.style.opacity='0';return}
    /* layout offsets (not rects), so it is right even while the drawer slides */
    var x=on.offsetLeft,y=on.offsetTop;
    ind.style.width=on.offsetWidth+'px';ind.style.height=on.offsetHeight+'px';
    ind.style.transform='translate('+x+'px,'+y+'px)';ind.style.opacity='1';
    if(!ind.classList.contains('ready'))requestAnimationFrame(function(){requestAnimationFrame(function(){ind.classList.add('ready')})});
  }

  var raf=0;
  function update(){raf=0;applyLabels();fit();place()}
  function schedule(){if(!raf)raf=requestAnimationFrame(update)}

  /* ---------- mobile drawer ---------- */
  function focusables(){
    return Array.prototype.slice.call(drawer.querySelectorAll('button,select,[tabindex]:not([tabindex="-1"]),a[href]'))
      .filter(function(el){return !el.hidden&&!el.disabled&&el.getClientRects().length});
  }
  function setInert(){
    if(!drawer)return;
    var off=isDrawer()&&!isOpen();/* the closed drawer is off screen: keep it out of the tab order */
    if('inert' in drawer)drawer.inert=off;
    if(off)drawer.setAttribute('aria-hidden','true');else drawer.removeAttribute('aria-hidden');
  }
  function open(){
    if(isOpen()||!isDrawer())return;
    top.classList.add('open');root.classList.add('nav-open');
    burger.setAttribute('aria-expanded','true');applyLabels();setInert();place();
    setTimeout(function(){var on=tabs&&tabs.querySelector('.tab.on');var f=on&&on.getClientRects().length?on:focusables()[0];(f||drawer).focus({preventScroll:true})},50);
  }
  function close(restore){
    if(!isOpen())return;
    top.classList.remove('open');root.classList.remove('nav-open');
    burger.setAttribute('aria-expanded','false');applyLabels();setInert();
    if(restore!==false&&isDrawer())burger.focus({preventScroll:true});
  }
  if(drawer&&burger){
    burger.addEventListener('click',function(){isOpen()?close():open()});
    if(closeBtn)closeBtn.addEventListener('click',function(){close()});
    if(scrim)scrim.addEventListener('click',function(){close()});
    document.addEventListener('keydown',function(e){
      if(!isOpen())return;
      if(e.key==='Escape'){e.preventDefault();close();return}
      if(e.key==='Tab'){
        var f=focusables();if(!f.length)return;
        var first=f[0],last=f[f.length-1],a=document.activeElement;
        if(e.shiftKey&&(a===first||!drawer.contains(a))){e.preventDefault();last.focus()}
        else if(!e.shiftKey&&(a===last||!drawer.contains(a))){e.preventDefault();first.focus()}
      }
    });
    /* picking a view or opening a panel closes the drawer and hands focus back to the burger
       (theme and language keep it open) */
    drawer.addEventListener('click',function(e){
      var t=e.target.closest&&e.target.closest('.tab,#libBtn,#adminBtn,#upLbl');
      if(t&&isOpen())close();
    });
  }

  /* ---------- watchers ---------- */
  if(topIn){
    /* class/hidden on tabs & tools (app.js), text of the data-i labels (language switch) */
    new MutationObserver(schedule).observe(topIn,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden']});
  }
  new MutationObserver(schedule).observe(root,{attributes:true,attributeFilter:['lang','dir','class','style']});
  document.addEventListener('a11y-change',schedule); /* text size / font from the accessibility panel */
  window.addEventListener('resize',function(){if(ind){ind.classList.remove('ready')}schedule()});
  if(mq.addEventListener)mq.addEventListener('change',schedule);else if(mq.addListener)mq.addListener(schedule);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(schedule);
  if(document.fonts&&document.fonts.addEventListener)document.fonts.addEventListener('loadingdone',schedule);
  /* anything that changes the size of the bar's parts (web fonts arriving late after a browser restart, the account
     chip/avatar appearing when the session is restored, a tab restored in the background) → fit again */
  if(window.ResizeObserver&&topIn){var ro=new ResizeObserver(schedule);Array.prototype.forEach.call(topIn.querySelectorAll('.mark,.tabs,.tools,.quick'),function(el){ro.observe(el)})}
  window.addEventListener('load',schedule);
  window.addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){if(ind)ind.classList.remove('ready');schedule()}});

  /* first pass synchronously, before the first paint */
  applyLabels();fit();place();setInert();
})();
