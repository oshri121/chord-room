/* Chord Room — cookie consent + analytics (growth). window.CONSENT
   Israeli Privacy Protection Law (amendment 13) + GDPR style: only what the site needs runs by default; analytics is
   opt-in. Google Analytics 4 and Microsoft Clarity load ONLY when
     1. the admin configured their ids (site_config.analytics = {ga4:'G-…', clarity:'…'}, validated on the server too), and
     2. this browser said yes to "Analytics" (localStorage chordroom.consent.v1 = {v:1, a:true|false, at}).
   Without ids no banner is shown (nothing to ask about); "Cookie settings" ([data-ck="open"] anywhere) always opens the dialog.
   No PII ever goes out: GA gets the view name (as a clean virtual path, no query/hash), event names from logAct (never the
   song names in `detail`), A/B variants as user properties; no user id, Google signals / ad personalisation off.
   Clarity: inputs, song names and account/admin areas are masked (data-clarity-mask).
   Search Console: site_config.analytics.gsc → <meta name="google-site-verification"> (not tracking; no consent needed).
   API: CONSENT.open(), .choice() → null|{a}, .set(bool), .track(name, params), .userProp(name, value), .active(), ._state() */
(function () {
'use strict';
const CR = window.CR; if (!CR) return;
const KEY = 'chordroom.consent.v1', VER = 1;

const T = {
he: { ckTitle: 'עוגיות ופרטיות', ckText: 'האתר משתמש רק במה שהוא צריך כדי לעבוד. בהסכמתך נפעיל גם כלי סטטיסטיקה (Google Analytics ו־Microsoft Clarity) שעוזרים לנו להבין איך משתמשים באתר ולשפר אותו. אפשר לשנות את הבחירה בכל עת.',
  ckPolicy: 'מדיניות הפרטיות', ckAccept: 'אישור סטטיסטיקה', ckReject: 'רק הכרחיות', ckSettings: 'הגדרות',
  dlgTitle: 'הגדרות עוגיות', dlgIntro: 'בחרו מה יפעל בדפדפן הזה. הבחירה נשמרת במכשיר, ואפשר לשנות אותה בכל עת מהקישור ״הגדרות עוגיות״ בתחתית העמוד.',
  necH: 'הכרחיות', necP: 'כניסה לחשבון, שפה, מצב כהה, הגדרות נגישות, השיר האחרון ושמירת הבחירה הזאת. בלעדיהן האתר לא עובד, ולכן הן תמיד פעילות.', always: 'תמיד פעיל',
  anH: 'סטטיסטיקה ומפות חום', anP: 'Google Analytics 4 — צפיות בעמודים ופעולות כמו ייצוא, בלי שם ובלי אימייל. Microsoft Clarity — מפות לחיצות והקלטות גלישה, שבהן שדות טקסט, שמות שירים ואזור החשבון מוסתרים. לא משמש לפרסום.',
  save: 'שמירת הבחירה', acceptAll: 'אישור הכול', rejectAll: 'דחיית הכול', notActive: 'כרגע כלי הסטטיסטיקה לא מופעלים באתר. הבחירה שלך תישמר למקרה שיופעלו.',
  saved: 'הבחירה נשמרה', close: 'סגירה', on: 'פעיל', off: 'כבוי' },
en: { ckTitle: 'Cookies & privacy', ckText: 'The site only uses what it needs to work. With your consent we also turn on analytics (Google Analytics and Microsoft Clarity), which help us understand how the site is used and improve it. You can change your choice at any time.',
  ckPolicy: 'Privacy Policy', ckAccept: 'Allow analytics', ckReject: 'Necessary only', ckSettings: 'Settings',
  dlgTitle: 'Cookie settings', dlgIntro: 'Choose what runs in this browser. Your choice is saved on this device, and you can change it any time from the “Cookie settings” link at the bottom of the page.',
  necH: 'Necessary', necP: 'Signing in, language, dark mode, accessibility settings, your last song and remembering this choice. The site can’t work without them, so they are always on.', always: 'Always on',
  anH: 'Analytics & heatmaps', anP: 'Google Analytics 4 — page views and actions such as exports, without your name or email. Microsoft Clarity — click maps and session recordings in which text fields, song names and the account area are hidden. Never used for advertising.',
  save: 'Save my choice', acceptAll: 'Accept all', rejectAll: 'Reject all', notActive: 'Analytics is not switched on for this site right now. Your choice is kept for when it is.',
  saved: 'Choice saved', close: 'Close', on: 'On', off: 'Off' },
ar: { ckTitle: 'ملفات تعريف الارتباط والخصوصية', ckText: 'يستخدم الموقع فقط ما يحتاجه ليعمل. بموافقتك نفعّل أيضًا أدوات إحصاء (Google Analytics وMicrosoft Clarity) تساعدنا على فهم طريقة استخدام الموقع وتحسينه. يمكنك تغيير اختيارك في أي وقت.',
  ckPolicy: 'سياسة الخصوصية', ckAccept: 'السماح بالإحصاءات', ckReject: 'الضرورية فقط', ckSettings: 'الإعدادات',
  dlgTitle: 'إعدادات ملفات تعريف الارتباط', dlgIntro: 'اختر ما يعمل في هذا المتصفح. يُحفظ اختيارك على هذا الجهاز، ويمكنك تغييره في أي وقت من رابط «إعدادات ملفات تعريف الارتباط» أسفل الصفحة.',
  necH: 'ضرورية', necP: 'تسجيل الدخول واللغة والوضع الداكن وإعدادات إمكانية الوصول وآخر أغنية وحفظ هذا الاختيار. لا يعمل الموقع بدونها، لذا هي مفعّلة دائمًا.', always: 'مفعّلة دائمًا',
  anH: 'الإحصاءات وخرائط الحرارة', anP: 'Google Analytics 4 — مشاهدات الصفحات وإجراءات مثل التصدير، بدون اسمك أو بريدك الإلكتروني. Microsoft Clarity — خرائط النقرات وتسجيلات التصفح مع إخفاء حقول النص وأسماء الأغاني ومنطقة الحساب. لا تُستخدم للإعلانات أبدًا.',
  save: 'حفظ اختياري', acceptAll: 'قبول الكل', rejectAll: 'رفض الكل', notActive: 'أدوات الإحصاء غير مفعّلة في الموقع حاليًا. سيُحفظ اختيارك لحين تفعيلها.',
  saved: 'تم حفظ الاختيار', close: 'إغلاق', on: 'مفعّل', off: 'متوقف' },
ru: { ckTitle: 'Cookie и конфиденциальность', ckText: 'Сайт использует только то, что нужно для работы. С вашего согласия мы также включим аналитику (Google Analytics и Microsoft Clarity): она помогает понять, как пользуются сайтом, и улучшить его. Выбор можно изменить в любой момент.',
  ckPolicy: 'Политика конфиденциальности', ckAccept: 'Разрешить аналитику', ckReject: 'Только необходимые', ckSettings: 'Настройки',
  dlgTitle: 'Настройки cookie', dlgIntro: 'Выберите, что будет работать в этом браузере. Выбор сохраняется на устройстве, изменить его можно в любой момент по ссылке «Настройки cookie» внизу страницы.',
  necH: 'Необходимые', necP: 'Вход в аккаунт, язык, тёмная тема, настройки доступности, последняя песня и сохранение этого выбора. Без них сайт не работает, поэтому они всегда включены.', always: 'Всегда включены',
  anH: 'Аналитика и тепловые карты', anP: 'Google Analytics 4 — просмотры страниц и действия вроде экспорта, без имени и e-mail. Microsoft Clarity — карты кликов и записи сеансов, в которых скрыты текстовые поля, названия песен и раздел аккаунта. Никогда не используется для рекламы.',
  save: 'Сохранить выбор', acceptAll: 'Принять все', rejectAll: 'Отклонить все', notActive: 'Сейчас аналитика на сайте не включена. Ваш выбор сохранится на случай, если её включат.',
  saved: 'Выбор сохранён', close: 'Закрыть', on: 'Вкл.', off: 'Выкл.' },
es: { ckTitle: 'Cookies y privacidad', ckText: 'El sitio solo usa lo que necesita para funcionar. Con tu consentimiento también activamos analítica (Google Analytics y Microsoft Clarity), que nos ayuda a entender cómo se usa el sitio y a mejorarlo. Puedes cambiar tu elección en cualquier momento.',
  ckPolicy: 'Política de privacidad', ckAccept: 'Permitir analítica', ckReject: 'Solo necesarias', ckSettings: 'Configuración',
  dlgTitle: 'Configuración de cookies', dlgIntro: 'Elige qué funciona en este navegador. Tu elección se guarda en este dispositivo y puedes cambiarla cuando quieras desde el enlace «Configuración de cookies» al pie de la página.',
  necH: 'Necesarias', necP: 'Inicio de sesión, idioma, modo oscuro, ajustes de accesibilidad, tu última canción y guardar esta elección. El sitio no funciona sin ellas, por eso siempre están activas.', always: 'Siempre activas',
  anH: 'Analítica y mapas de calor', anP: 'Google Analytics 4 — páginas vistas y acciones como exportar, sin tu nombre ni tu correo. Microsoft Clarity — mapas de clics y grabaciones de sesión en las que se ocultan los campos de texto, los nombres de canciones y la zona de la cuenta. Nunca se usa para publicidad.',
  save: 'Guardar mi elección', acceptAll: 'Aceptar todo', rejectAll: 'Rechazar todo', notActive: 'La analítica no está activada en el sitio ahora mismo. Tu elección se guardará para cuando lo esté.',
  saved: 'Elección guardada', close: 'Cerrar', on: 'Activado', off: 'Desactivado' }
};
const L = () => { const l = (document.documentElement.lang || 'he').slice(0, 2).toLowerCase(); return T[l] ? l : 'en'; };
const t = k => (T[L()][k] != null ? T[L()][k] : T.en[k]);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- configuration (ids validated again here: only these exact shapes ever reach a URL or the DOM) ---------- */
const RX = { ga4: /^G-[A-Z0-9]{4,16}$/, clarity: /^[a-z0-9]{6,16}$/, gsc: /^[A-Za-z0-9_-]{10,100}$/ };
function ids() {
  const a = (CR.ACC && CR.ACC.config && CR.ACC.config.analytics) || {}, o = {};
  if (a && typeof a === 'object') for (const k in RX) { const v = typeof a[k] === 'string' ? a[k].trim() : ''; if (RX[k].test(v)) o[k] = v; }
  return o;
}
const need = () => { const i = ids(); return !!(i.ga4 || i.clarity); };

function read() { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === VER && typeof o.a === 'boolean') return o; } catch (e) {} return null; }
function write(a) { const o = { v: VER, a: !!a, at: new Date().toISOString() }; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} return o; }

const S = { choice: read(), ga: '', cl: '', props: {}, view: null, off: false };
const active = () => !!(S.choice && S.choice.a && !S.off);

/* ---------- loaders ---------- */
const VPATH = { about: '/', tool: '/tool', pricing: '/pricing', terms: '/terms', privacy: '/privacy', accessibility: '/accessibility', licenses: '/licenses' };
const vpath = v => VPATH[v] || '/' + String(v || '').replace(/[^a-z]/g, '');
function addScript(src) { const s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); return s; }
function loadGA(id) {
  if (S.ga) return; S.ga = id;
  window['ga-disable-' + id] = false;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  const g = window.gtag;
  g('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted', personalization_storage: 'denied' });
  g('js', new Date());
  g('config', id, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, anonymize_ip: true });
  if (Object.keys(S.props).length) g('set', 'user_properties', { ...S.props });
  addScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id));
}
/* Clarity: hide what users type, song names, the account / admin areas and the tool views (clicks still show on heatmaps) */
const MASK = ['input', 'textarea', 'select', '#tname', '#acc', '#admin', '#lib', '#authDlg', '#ptsDlg', '#rvDlg', '#crateView', '#djView', '#mashupView',
  '#convertView', '#extendedView', '#toast', '.refbox', '#creditsChip', '#udName', '.rm-panel', '.rm-root', '#libList', '#sheet'];
const MSEL = MASK.join(',');
function maskIn(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.matches(MSEL)) root.setAttribute('data-clarity-mask', 'true');
  root.querySelectorAll(MSEL).forEach(e => e.setAttribute('data-clarity-mask', 'true'));
}
let mo = null;
function loadClarity(id) {
  if (S.cl) return; S.cl = id;
  maskIn(document.body);
  if (!mo && window.MutationObserver) { mo = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(maskIn))); mo.observe(document.body, { childList: true, subtree: true }); }
  window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
  addScript('https://www.clarity.ms/tag/' + encodeURIComponent(id));
  window.clarity('consent');
}
function start() {
  if (!active()) return;
  const i = ids();
  if (i.ga4) loadGA(i.ga4);
  if (i.clarity) loadClarity(i.clarity);
  if (S.ga) window['ga-disable-' + S.ga] = false;
  pageView();
}
function dropCookies() {
  const names = document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => /^(_ga|_gid|_gat|_clck|_clsk|_cltk|CLID|ANONCHK|MR|MUID|SM)/.test(n));
  const host = location.hostname.split('.');
  names.forEach(n => {
    document.cookie = n + '=;Max-Age=0;path=/';
    for (let i = 0; i < host.length - 1; i++) document.cookie = n + '=;Max-Age=0;path=/;domain=.' + host.slice(i).join('.');
  });
}
function stop() {
  if (S.ga) { try { window.gtag('consent', 'update', { analytics_storage: 'denied' }); } catch (e) {} window['ga-disable-' + S.ga] = true; }
  if (S.cl && window.clarity) { try { window.clarity('consent', false); window.clarity('stop'); } catch (e) {} }
  dropCookies();
}

/* ---------- what is sent ---------- */
function pageView() {
  if (!active() || !S.view) return;
  const p = vpath(S.view);
  if (S.ga) window.gtag('event', 'page_view', { page_location: location.origin + p, page_path: p, page_title: 'Chord Room · ' + S.view, language: L() });
}
function track(name, params) {
  if (!active() || !/^[a-z_]{2,40}$/.test(String(name))) return false;
  const clean = {};
  for (const k in (params || {})) { const v = params[k]; if (/^[a-z_]{1,40}$/.test(k) && (typeof v === 'number' || (typeof v === 'string' && /^[\w .:-]{0,60}$/.test(v)))) clean[k] = v; }
  if (S.ga) window.gtag('event', name, clean);
  if (S.cl && window.clarity) window.clarity('event', name);
  return true;
}
function userProp(name, value) {
  name = String(name || '').replace(/[^a-z0-9_]/g, '').slice(0, 24); value = String(value == null ? '' : value).replace(/[^\w-]/g, '').slice(0, 36);
  if (!name) return;
  S.props[name] = value;
  if (active() && S.ga) window.gtag('set', 'user_properties', { [name]: value });
}
// logAct names → GA4 events (key events are marked in GA4 → Admin → Events). Never the detail (song names).
const EV = { separate: 'separation', export: 'export', subscribe_click: 'subscribe_click', mashup_export: 'mashup_export', extended_export: 'extended_export',
  convert: 'convert', crate_export: 'crate_export', song_upload: 'song_upload', invite_copy: 'invite_copy' };
document.addEventListener('cr-act', e => { const n = EV[e.detail && e.detail.action]; if (n) track(n); });
document.addEventListener('cr-signup', () => track('sign_up', { method: 'email' }));
document.addEventListener('cr-view', e => { S.view = e.detail && e.detail.v; pageView(); });

/* ---------- Search Console verification (meta tag; Google also accepts the HTML-file method — see LICENSES-AUDIT / CLAUDE.md) ---------- */
function gsc() {
  const v = ids().gsc; let m = document.querySelector('meta[name="google-site-verification"][data-cr]');
  if (!v) { if (m) m.remove(); return; }
  if (!m) { m = document.createElement('meta'); m.name = 'google-site-verification'; m.setAttribute('data-cr', '1'); document.head.appendChild(m); }
  m.content = v;
}

/* ---------- banner + settings dialog ---------- */
const $ = s => document.querySelector(s);
function lift() { document.body.classList.toggle('hasck', !!($('#ckBar') && !$('#ckBar').hidden)); try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
function barHTML() {
  return '<div class="ck-in"><div class="ck-t"><b id="ckH">' + esc(t('ckTitle')) + '</b><p>' + esc(t('ckText')) + ' <a href="#privacy" data-ck="policy">' + esc(t('ckPolicy')) + '</a></p></div>' +
    '<div class="ck-b"><button type="button" class="btn solid" data-ck="all">' + esc(t('ckAccept')) + '</button><button type="button" class="btn solid" data-ck="none">' + esc(t('ckReject')) + '</button>' +
    '<button type="button" class="btn ghost" data-ck="open">' + esc(t('ckSettings')) + '</button></div></div>';
}
function showBar() {
  if (S.choice || !need()) { hideBar(); return; }
  if (document.getElementById('welcomeLang')) { setTimeout(showBar, 600); return; }   // the first-visit language picker goes first
  let b = $('#ckBar');
  if (!b) { b = document.createElement('div'); b.id = 'ckBar'; b.className = 'ck'; b.setAttribute('role', 'region'); b.setAttribute('aria-labelledby', 'ckH'); document.body.appendChild(b); }
  b.innerHTML = barHTML(); b.hidden = false; lift();
}
function hideBar() { const b = $('#ckBar'); if (b && !b.hidden) { b.hidden = true; lift(); } }

let lastFocus = null;
function dlgHTML() {
  const on = !!(S.choice && S.choice.a);
  return '<div class="dlg ckdlg" role="dialog" aria-modal="true" aria-labelledby="ckDH">' +
    '<div class="dh"><h3 id="ckDH">' + esc(t('dlgTitle')) + '</h3><button type="button" class="x" data-ck="close" aria-label="' + esc(t('close')) + '">×</button></div>' +
    '<p class="snote">' + esc(t('dlgIntro')) + '</p>' +
    '<div class="ck-row"><div><b>' + esc(t('necH')) + '</b><p>' + esc(t('necP')) + '</p></div><span class="ck-always">' + esc(t('always')) + '</span></div>' +
    '<div class="ck-row"><div><b id="ckAnH">' + esc(t('anH')) + '</b><p id="ckAnP">' + esc(t('anP')) + '</p>' + (need() ? '' : '<p class="snote">' + esc(t('notActive')) + '</p>') + '</div>' +
    '<button type="button" class="ck-sw" id="ckAn" role="switch" aria-checked="' + on + '" aria-labelledby="ckAnH" aria-describedby="ckAnP"><i aria-hidden="true"></i><span>' + esc(on ? t('on') : t('off')) + '</span></button></div>' +
    '<div class="ck-act"><button type="button" class="btn solid" data-ck="save">' + esc(t('save')) + '</button><button type="button" class="btn ghost" data-ck="all">' + esc(t('acceptAll')) + '</button>' +
    '<button type="button" class="btn ghost" data-ck="none">' + esc(t('rejectAll')) + '</button></div>' +
    '<p class="snote ck-pol"><a href="#privacy" data-ck="policy">' + esc(t('ckPolicy')) + '</a><span class="ck-msg" role="status"></span></p></div>';
}
function open() {
  let w = $('#ckDlg');
  if (!w) {
    w = document.createElement('div'); w.className = 'dlgwrap ckd'; w.id = 'ckDlg'; w.hidden = true; document.body.appendChild(w);
    w.addEventListener('mousedown', e => { if (e.target === w) close(); });
    w.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = [...w.querySelectorAll('button,a[href]')].filter(x => x.offsetParent !== null), i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
  }
  lastFocus = document.activeElement;
  w.innerHTML = dlgHTML(); w.hidden = false;
  setTimeout(() => { const s = w.querySelector('#ckAn'); if (s) s.focus(); }, 30);
}
function close() {
  const w = $('#ckDlg'); if (!w || w.hidden) return;
  w.hidden = true;
  if (lastFocus && document.contains(lastFocus) && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
}
function set(a) {
  const was = active();
  S.choice = write(a); S.off = false;
  hideBar();
  if (a) start(); else if (was || S.ga || S.cl) stop();
  return S.choice;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-ck]'); if (!b) return;
  const k = b.getAttribute('data-ck');
  if (k === 'open') { e.preventDefault(); open(); return; }
  if (k === 'close') { close(); return; }
  if (k === 'policy') { close(); return; }                       // the link itself navigates to #privacy
  if (k === 'all' || k === 'none') { set(k === 'all'); flash(); close(); return; }
  if (k === 'save') { const s = $('#ckAn'); set(!!(s && s.getAttribute('aria-checked') === 'true')); flash(); close(); return; }
});
document.addEventListener('click', e => {
  const s = e.target.closest && e.target.closest('#ckAn'); if (!s) return;
  const on = s.getAttribute('aria-checked') !== 'true';
  s.setAttribute('aria-checked', String(on)); s.querySelector('span').textContent = on ? t('on') : t('off');
});
function flash() { try { CR.toast(t('saved')); } catch (e) {} }

/* ---------- wiring ---------- */
function onConfig() { gsc(); if (active()) start(); showBar(); }
document.addEventListener('cr-config', onConfig);
new MutationObserver(() => { const b = $('#ckBar'); if (b && !b.hidden) b.innerHTML = barHTML(); const w = $('#ckDlg'); if (w && !w.hidden) { w.innerHTML = dlgHTML(); } })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
window.addEventListener('storage', e => { if (e.key === KEY) { const c = read(); const was = active(); S.choice = c; if (active()) start(); else if (was) stop(); if (c) hideBar(); } });
if (CR.ACC && CR.ACC.config && Object.keys(CR.ACC.config).length) onConfig();

window.CONSENT = {
  open, close, set, track, userProp, active, need,
  choice: () => (S.choice ? { a: S.choice.a, at: S.choice.at } : null),
  _state: () => ({ ga: S.ga, cl: S.cl, view: S.view, props: { ...S.props }, ids: ids(), choice: S.choice })
};
})();
