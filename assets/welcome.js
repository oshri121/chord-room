/* First visit (no language saved on this device): a welcome screen to pick one of the five site languages.
   Shown once per browser; the choice is saved like the header language menu (chordroom.lang). */
(function(){
'use strict';
const CR=window.CR;if(!CR||!CR.setLang)return;
let saved=null;try{saved=localStorage.getItem('chordroom.lang')}catch(e){}
if(saved||navigator.webdriver)return;          // automated test browsers skip it
const LANGS=[
  ['he','עברית','ברוכים הבאים','rtl'],['en','English','Welcome','ltr'],['ar','العربية','أهلًا وسهلًا','rtl'],
  ['ru','Русский','Добро пожаловать','ltr'],['es','Español','Bienvenidos','ltr']];
const nav=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'he']).map(x=>String(x).slice(0,2).toLowerCase());
const guess=(nav.map(x=>x==='iw'?'he':x).find(x=>LANGS.some(l=>l[0]===x)))||'he';
function show(){
  if(document.getElementById('welcomeLang'))return;
  const d=document.createElement('div');d.id='welcomeLang';d.className='wl';d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby','wlTitle');
  d.innerHTML=`<div class="wlin">
    <div class="wlbrand"><svg class="wllogo" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="7" fill="#0B0B0C"/><g fill="#fff"><rect x="7" y="14" width="2.4" height="6" rx="1"/><rect x="11" y="10" width="2.4" height="14" rx="1"/><rect x="15" y="6" width="2.4" height="22" rx="1"/><rect x="19" y="11" width="2.4" height="12" rx="1"/><rect x="23" y="13" width="2.4" height="8" rx="1"/></g><rect x="27" y="15" width="2.4" height="4" rx="1" fill="#E5322B"/></svg><span>CHORD ROOM</span></div>
    <h2 id="wlTitle"><span lang="he" dir="rtl">בחרו שפה</span><i aria-hidden="true">·</i><span lang="en" dir="ltr">Choose your language</span></h2>
    <div class="wlgrid">${LANGS.map(([c,n,w,dir])=>`<button type="button" class="wlb${c===guess?' sug':''}" data-l="${c}" lang="${c}" dir="${dir}"><b>${n}</b><small>${w}</small></button>`).join('')}</div>
    <p class="wlnote"><span lang="he" dir="rtl">אפשר לשנות בכל רגע מהתפריט למעלה</span><span lang="en" dir="ltr">You can change it any time from the top menu</span></p></div>`;
  document.body.appendChild(d);document.documentElement.classList.add('wl-open');
  const pick=c=>{try{CR.setLang(c,true)}catch(e){}d.classList.add('out');document.documentElement.classList.remove('wl-open');setTimeout(()=>d.remove(),260)};
  d.addEventListener('click',e=>{const b=e.target.closest('[data-l]');if(b)pick(b.dataset.l)});
  d.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();pick(guess);return}
    if(e.key==='Tab'){const f=[...d.querySelectorAll('button')],i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}
    if(/^Arrow/.test(e.key)){const f=[...d.querySelectorAll('.wlb')],i=f.indexOf(document.activeElement);if(i>=0){e.preventDefault();f[(i+(e.key==='ArrowDown'||e.key==='ArrowRight'?1:f.length-1))%f.length].focus()}}
  });
  setTimeout(()=>{const s=d.querySelector('.wlb.sug')||d.querySelector('.wlb');s&&s.focus()},60);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show);else show();
})();
