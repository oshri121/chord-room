/* Chord Room — cookie consent + analytics (growth). window.CONSENT
   Israeli Privacy Protection Law (amendment 13) + GDPR style: only what the site needs runs by default; analytics is
   opt-in. Google Analytics 4 and Microsoft Clarity load ONLY when
     1. the admin configured their ids (site_config.analytics = {ga4:'G-…', clarity:'…'}, validated on the server too), and
     2. this browser said yes to "Analytics" (localStorage chordroom.consent.v1 = {v:1, a:true|false, m?:true|false, at}).
   Without ids no banner is shown (nothing to ask about); "Cookie settings" ([data-ck="open"] anywhere) always opens the dialog.
   No PII ever goes out: GA gets the view name (as a clean virtual path, no query/hash), event names from logAct (never the
   song names in `detail`), A/B variants as user properties; no user id, Google signals / ad personalisation off.
   Clarity: inputs, song names and account/admin areas are masked (data-clarity-mask).
   Meta Pixel (site_config.analytics.meta = dataset id, digits) is ADVERTISING, so it has its own choice "m" (marketing),
   default off, never implied by "a". A record without "m" (saved before this split) = marketing not chosen yet: Meta stays
   off and, only when a Meta id is configured, a small banner asks about it alone. PageView + key events (CompleteRegistration,
   InitiateCheckout, Purchase with plan value in ILS, custom events for uploads / separations / exports).
   fbq('set','autoConfig',false,id) runs before init (no automatic button/page-data events) and init gets no user data (no
   advanced matching): no email, phone or user id is passed to fbq. The owner must ALSO switch off "Automatic advanced matching"
   for the dataset in Meta Events Manager — that one is a Meta-side setting the code can't enforce.
   Search Console: site_config.analytics.gsc → <meta name="google-site-verification"> (not tracking; no consent needed).
   API: CONSENT.open(), .choice() → null|{a, m}, .set(analytics[, marketing]), .track(name, params), .userProp(name, value), .active(), ._state() */
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
  adH: 'מדידת פרסום (Meta)', adP: 'Meta Pixel — מודד הרשמות ורכישות שהגיעו ממודעות בפייסבוק ובאינסטגרם, ושולח את המידע הזה ל־Meta. בחירה נפרדת מהסטטיסטיקה, וכבויה עד שתפעילו אותה. ההגדרה האוטומטית וההתאמה המתקדמת כבויות, כדי שמה שמקלידים בטפסים לא יישלח ל־Meta.',
  adNot: 'כרגע מדידת הפרסום לא מופעלת באתר.', ckTextAd: 'מדידת פרסום של Meta (פייסבוק ואינסטגרם) היא בחירה נפרדת, והיא כבויה אלא אם תאשרו אותה.',
  ckAdTitle: 'מדידת פרסום', ckAdText: 'אנחנו רוצים למדוד הרשמות ורכישות שהגיעו ממודעות בפייסבוק ובאינסטגרם (Meta Pixel). זו בחירה נפרדת מהסטטיסטיקה, והיא כבויה עד שתאשרו.',
  ckAdAccept: 'אישור מדידת פרסום', ckAdReject: 'לא, תודה',
  save: 'שמירת הבחירה', acceptAll: 'אישור הכול', rejectAll: 'דחיית הכול', notActive: 'כרגע כלי הסטטיסטיקה לא מופעלים באתר. הבחירה שלך תישמר למקרה שיופעלו.',
  saved: 'הבחירה נשמרה', close: 'סגירה', on: 'פעיל', off: 'כבוי' },
en: { ckTitle: 'Cookies & privacy', ckText: 'The site only uses what it needs to work. With your consent we also turn on analytics (Google Analytics and Microsoft Clarity), which help us understand how the site is used and improve it. You can change your choice at any time.',
  ckPolicy: 'Privacy Policy', ckAccept: 'Allow analytics', ckReject: 'Necessary only', ckSettings: 'Settings',
  dlgTitle: 'Cookie settings', dlgIntro: 'Choose what runs in this browser. Your choice is saved on this device, and you can change it any time from the “Cookie settings” link at the bottom of the page.',
  necH: 'Necessary', necP: 'Signing in, language, dark mode, accessibility settings, your last song and remembering this choice. The site can’t work without them, so they are always on.', always: 'Always on',
  anH: 'Analytics & heatmaps', anP: 'Google Analytics 4 — page views and actions such as exports, without your name or email. Microsoft Clarity — click maps and session recordings in which text fields, song names and the account area are hidden. Never used for advertising.',
  adH: 'Advertising measurement (Meta)', adP: 'Meta Pixel — measures sign-ups and purchases that came from Facebook and Instagram ads, and sends this to Meta. A separate choice from analytics, off until you turn it on. Automatic setup and advanced matching are turned off, so what you type into forms is not sent to Meta.',
  adNot: 'Advertising measurement is not switched on for this site right now.', ckTextAd: 'Advertising measurement by Meta (Facebook and Instagram) is a separate choice and stays off unless you allow it.',
  ckAdTitle: 'Advertising measurement', ckAdText: 'We would like to measure sign-ups and purchases that came from Facebook and Instagram ads (Meta Pixel). This is separate from analytics and stays off unless you allow it.',
  ckAdAccept: 'Allow ad measurement', ckAdReject: 'No thanks',
  save: 'Save my choice', acceptAll: 'Accept all', rejectAll: 'Reject all', notActive: 'Analytics is not switched on for this site right now. Your choice is kept for when it is.',
  saved: 'Choice saved', close: 'Close', on: 'On', off: 'Off' },
ar: { ckTitle: 'ملفات تعريف الارتباط والخصوصية', ckText: 'يستخدم الموقع فقط ما يحتاجه ليعمل. بموافقتك نفعّل أيضًا أدوات إحصاء (Google Analytics وMicrosoft Clarity) تساعدنا على فهم طريقة استخدام الموقع وتحسينه. يمكنك تغيير اختيارك في أي وقت.',
  ckPolicy: 'سياسة الخصوصية', ckAccept: 'السماح بالإحصاءات', ckReject: 'الضرورية فقط', ckSettings: 'الإعدادات',
  dlgTitle: 'إعدادات ملفات تعريف الارتباط', dlgIntro: 'اختر ما يعمل في هذا المتصفح. يُحفظ اختيارك على هذا الجهاز، ويمكنك تغييره في أي وقت من رابط «إعدادات ملفات تعريف الارتباط» أسفل الصفحة.',
  necH: 'ضرورية', necP: 'تسجيل الدخول واللغة والوضع الداكن وإعدادات إمكانية الوصول وآخر أغنية وحفظ هذا الاختيار. لا يعمل الموقع بدونها، لذا هي مفعّلة دائمًا.', always: 'مفعّلة دائمًا',
  anH: 'الإحصاءات وخرائط الحرارة', anP: 'Google Analytics 4 — مشاهدات الصفحات وإجراءات مثل التصدير، بدون اسمك أو بريدك الإلكتروني. Microsoft Clarity — خرائط النقرات وتسجيلات التصفح مع إخفاء حقول النص وأسماء الأغاني ومنطقة الحساب. لا تُستخدم للإعلانات أبدًا.',
  adH: 'قياس الإعلانات (Meta)', adP: 'Meta Pixel — يقيس التسجيلات والمشتريات القادمة من إعلانات فيسبوك وإنستغرام ويرسل ذلك إلى Meta. اختيار منفصل عن الإحصاءات، ومتوقف حتى تفعّله. الإعداد التلقائي والمطابقة المتقدمة متوقفان، حتى لا يُرسل ما تكتبه في النماذج إلى Meta.',
  adNot: 'قياس الإعلانات غير مفعّل في الموقع حاليًا.', ckTextAd: 'قياس الإعلانات من Meta (فيسبوك وإنستغرام) اختيار منفصل ويبقى متوقفًا ما لم تسمح به.',
  ckAdTitle: 'قياس الإعلانات', ckAdText: 'نود قياس التسجيلات والمشتريات القادمة من إعلانات فيسبوك وإنستغرام (Meta Pixel). هذا منفصل عن الإحصاءات ويبقى متوقفًا ما لم تسمح به.',
  ckAdAccept: 'السماح بقياس الإعلانات', ckAdReject: 'لا، شكرًا',
  save: 'حفظ اختياري', acceptAll: 'قبول الكل', rejectAll: 'رفض الكل', notActive: 'أدوات الإحصاء غير مفعّلة في الموقع حاليًا. سيُحفظ اختيارك لحين تفعيلها.',
  saved: 'تم حفظ الاختيار', close: 'إغلاق', on: 'مفعّل', off: 'متوقف' },
ru: { ckTitle: 'Cookie и конфиденциальность', ckText: 'Сайт использует только то, что нужно для работы. С вашего согласия мы также включим аналитику (Google Analytics и Microsoft Clarity): она помогает понять, как пользуются сайтом, и улучшить его. Выбор можно изменить в любой момент.',
  ckPolicy: 'Политика конфиденциальности', ckAccept: 'Разрешить аналитику', ckReject: 'Только необходимые', ckSettings: 'Настройки',
  dlgTitle: 'Настройки cookie', dlgIntro: 'Выберите, что будет работать в этом браузере. Выбор сохраняется на устройстве, изменить его можно в любой момент по ссылке «Настройки cookie» внизу страницы.',
  necH: 'Необходимые', necP: 'Вход в аккаунт, язык, тёмная тема, настройки доступности, последняя песня и сохранение этого выбора. Без них сайт не работает, поэтому они всегда включены.', always: 'Всегда включены',
  anH: 'Аналитика и тепловые карты', anP: 'Google Analytics 4 — просмотры страниц и действия вроде экспорта, без имени и e-mail. Microsoft Clarity — карты кликов и записи сеансов, в которых скрыты текстовые поля, названия песен и раздел аккаунта. Никогда не используется для рекламы.',
  adH: 'Измерение рекламы (Meta)', adP: 'Meta Pixel — измеряет регистрации и покупки, пришедшие из рекламы в Facebook и Instagram, и передаёт эти данные Meta. Отдельный выбор, не связанный с аналитикой; выключен, пока вы его не включите. Автонастройка и расширенное сопоставление выключены, чтобы то, что вы вводите в формы, не уходило в Meta.',
  adNot: 'Сейчас измерение рекламы на сайте не включено.', ckTextAd: 'Измерение рекламы Meta (Facebook и Instagram) — отдельный выбор, он выключен, пока вы его не разрешите.',
  ckAdTitle: 'Измерение рекламы', ckAdText: 'Мы хотели бы измерять регистрации и покупки, пришедшие из рекламы в Facebook и Instagram (Meta Pixel). Это отдельно от аналитики и выключено, пока вы не разрешите.',
  ckAdAccept: 'Разрешить измерение рекламы', ckAdReject: 'Нет, спасибо',
  save: 'Сохранить выбор', acceptAll: 'Принять все', rejectAll: 'Отклонить все', notActive: 'Сейчас аналитика на сайте не включена. Ваш выбор сохранится на случай, если её включат.',
  saved: 'Выбор сохранён', close: 'Закрыть', on: 'Вкл.', off: 'Выкл.' },
es: { ckTitle: 'Cookies y privacidad', ckText: 'El sitio solo usa lo que necesita para funcionar. Con tu consentimiento también activamos analítica (Google Analytics y Microsoft Clarity), que nos ayuda a entender cómo se usa el sitio y a mejorarlo. Puedes cambiar tu elección en cualquier momento.',
  ckPolicy: 'Política de privacidad', ckAccept: 'Permitir analítica', ckReject: 'Solo necesarias', ckSettings: 'Configuración',
  dlgTitle: 'Configuración de cookies', dlgIntro: 'Elige qué funciona en este navegador. Tu elección se guarda en este dispositivo y puedes cambiarla cuando quieras desde el enlace «Configuración de cookies» al pie de la página.',
  necH: 'Necesarias', necP: 'Inicio de sesión, idioma, modo oscuro, ajustes de accesibilidad, tu última canción y guardar esta elección. El sitio no funciona sin ellas, por eso siempre están activas.', always: 'Siempre activas',
  anH: 'Analítica y mapas de calor', anP: 'Google Analytics 4 — páginas vistas y acciones como exportar, sin tu nombre ni tu correo. Microsoft Clarity — mapas de clics y grabaciones de sesión en las que se ocultan los campos de texto, los nombres de canciones y la zona de la cuenta. Nunca se usa para publicidad.',
  adH: 'Medición publicitaria (Meta)', adP: 'Meta Pixel — mide registros y compras que llegan desde anuncios de Facebook e Instagram y envía esa información a Meta. Es una elección aparte de la analítica y está desactivada hasta que la actives. La configuración automática y las coincidencias avanzadas están desactivadas, para que lo que escribes en los formularios no llegue a Meta.',
  adNot: 'La medición publicitaria no está activada en el sitio ahora mismo.', ckTextAd: 'La medición publicitaria de Meta (Facebook e Instagram) es una elección aparte y queda desactivada salvo que la permitas.',
  ckAdTitle: 'Medición publicitaria', ckAdText: 'Nos gustaría medir los registros y compras que llegan desde anuncios de Facebook e Instagram (Meta Pixel). Es aparte de la analítica y queda desactivada salvo que la permitas.',
  ckAdAccept: 'Permitir medición publicitaria', ckAdReject: 'No, gracias',
  save: 'Guardar mi elección', acceptAll: 'Aceptar todo', rejectAll: 'Rechazar todo', notActive: 'La analítica no está activada en el sitio ahora mismo. Tu elección se guardará para cuando lo esté.',
  saved: 'Elección guardada', close: 'Cerrar', on: 'Activado', off: 'Desactivado' }
};
const L = () => { const l = (document.documentElement.lang || 'he').slice(0, 2).toLowerCase(); return T[l] ? l : 'en'; };
const t = k => (T[L()][k] != null ? T[L()][k] : T.en[k]);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- configuration (ids validated again here: only these exact shapes ever reach a URL or the DOM) ---------- */
const RX = { ga4: /^G-[A-Z0-9]{4,16}$/, clarity: /^[a-z0-9]{6,16}$/, meta: /^[0-9]{10,20}$/, gsc: /^[A-Za-z0-9_-]{10,100}$/ };
function ids() {
  const a = (CR.ACC && CR.ACC.config && CR.ACC.config.analytics) || {}, o = {};
  if (a && typeof a === 'object') for (const k in RX) { const v = typeof a[k] === 'string' ? a[k].trim() : ''; if (RX[k].test(v)) o[k] = v; }
  return o;
}
const need = () => { const i = ids(); return !!(i.ga4 || i.clarity || i.meta); };
const needA = () => { const i = ids(); return !!(i.ga4 || i.clarity); };
const needM = () => !!ids().meta;

// m: true|false = marketing chosen; missing (records from before the split): an old "allow" = not chosen yet → Meta off and
// asked again (only with a Meta id); an old "necessary only" already refused everything → m false
function read() { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === VER && typeof o.a === 'boolean') { if (typeof o.m !== 'boolean') { if (o.a) delete o.m; else o.m = false; } return o; } } catch (e) {} return null; }
function write(a, m) { const o = { v: VER, a: !!a, at: new Date().toISOString() }; if (typeof m === 'boolean') o.m = m; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} return o; }

const S = { choice: read(), ga: '', cl: '', fb: '', props: {}, view: null, off: false, stopped: false, onA: false, onM: false };
const active = () => !!(S.choice && S.choice.a && !S.off);          // analytics (GA4 + Clarity)
const activeM = () => !!(S.choice && S.choice.m === true && !S.off); // advertising measurement (Meta Pixel)
const mChosen = () => !!(S.choice && typeof S.choice.m === 'boolean');

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
/* Meta Pixel: the standard fbq stub, consent granted only here (after "allow ad measurement"); automatic configuration off
   before init, init without user data (no advanced matching) */
function loadMeta(id) {
  if (S.fb) return; S.fb = id;
  if (!window.fbq) {
    const n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
  }
  window.fbq('set', 'autoConfig', false, id);
  window.fbq('consent', 'grant');
  window.fbq('init', id);
  addScript('https://connect.facebook.net/en_US/fbevents.js');
}
function start() {
  const i = ids(), a = active(), m = activeM();
  if (a) {
    if (i.ga4) loadGA(i.ga4);
    if (i.clarity) loadClarity(i.clarity);
    if (S.ga) window['ga-disable-' + S.ga] = false;
    if (S.stopped) {                                               // allowed again after a withdrawal in this page: undo stop()
      S.stopped = false;
      if (S.ga) try { window.gtag('consent', 'update', { analytics_storage: 'granted' }); } catch (e) {}
      if (S.cl && window.clarity) try { window.clarity('start'); window.clarity('consent'); } catch (e) {}
    }
  }
  if (m) {
    if (i.meta) loadMeta(i.meta);
    if (S.fb && window.fbq) window.fbq('consent', 'grant');
  }
  const onA = a && !!(S.ga || S.cl), onM = m && !!S.fb;
  const pa = onA && !S.onA, pm = onM && !S.onM;                   // a page view only for a tool that was just switched on
  S.onA = onA; S.onM = onM;
  if (pa || pm) pageView(pa, pm);
}
const RX_A = /^(_ga|_gid|_gat|_clck|_clsk|_cltk|CLID|ANONCHK|MR|MUID|SM)/, RX_M = /^(_fbp|_fbc)/;
function dropCookies(rx) {
  const names = document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => rx.test(n));
  const host = location.hostname.split('.');
  names.forEach(n => {
    document.cookie = n + '=;Max-Age=0;path=/';
    for (let i = 0; i < host.length - 1; i++) document.cookie = n + '=;Max-Age=0;path=/;domain=.' + host.slice(i).join('.');
  });
}
function stop() {                                                 // analytics withdrawn
  S.stopped = true; S.onA = false;
  if (S.ga) { try { window.gtag('consent', 'update', { analytics_storage: 'denied' }); } catch (e) {} window['ga-disable-' + S.ga] = true; }
  if (S.cl && window.clarity) { try { window.clarity('consent', false); window.clarity('stop'); } catch (e) {} }
  dropCookies(RX_A);
}
function stopM() {                                                // advertising measurement withdrawn
  S.onM = false;
  if (S.fb && window.fbq) { try { window.fbq('consent', 'revoke'); } catch (e) {} }
  dropCookies(RX_M);
}

/* ---------- what is sent ---------- */
function pageView(toA = true, toM = true) {
  if (!S.view) return;
  const p = vpath(S.view);
  if (toA && active() && S.ga) window.gtag('event', 'page_view', { page_location: location.origin + p, page_path: p, page_title: 'Chord Room · ' + S.view, language: L() });
  if (toM && activeM() && S.fb && window.fbq) window.fbq('track', 'PageView');
}
function track(name, params) {
  const a = active(), am = activeM();
  if (!(a || am) || !/^[a-z_]{2,40}$/.test(String(name))) return false;
  const clean = {};
  for (const k in (params || {})) { const v = params[k]; if (/^[a-z_]{1,40}$/.test(k) && (typeof v === 'number' || (typeof v === 'string' && /^[\w .:-]{0,60}$/.test(v)))) clean[k] = v; }
  if (a && S.ga) window.gtag('event', name, clean);
  if (a && S.cl && window.clarity) window.clarity('event', name);
  const m = META_EV[name];
  if (m && am && S.fb && window.fbq) {
    const fp = {};
    if (typeof clean.value === 'number') fp.value = clean.value;
    if (typeof clean.currency === 'string' && /^[A-Z]{3}$/.test(clean.currency)) fp.currency = clean.currency;
    if (typeof clean.plan === 'string' && clean.plan) fp.content_name = clean.plan;
    window.fbq(m[0], m[1], fp);
  }
  return true;
}
function userProp(name, value) {
  name = String(name || '').replace(/[^a-z0-9_]/g, '').slice(0, 24); value = String(value == null ? '' : value).replace(/[^\w-]/g, '').slice(0, 36);
  if (!name) return;
  S.props[name] = value;
  if (active() && S.ga) window.gtag('set', 'user_properties', { [name]: value });
}
// the same event names → Meta (standard events where one fits, custom events otherwise)
const META_EV = { sign_up: ['track', 'CompleteRegistration'], subscribe_click: ['track', 'InitiateCheckout'], purchase: ['track', 'Purchase'],
  song_upload: ['trackCustom', 'SongUpload'], separation: ['trackCustom', 'StemSeparation'], export: ['trackCustom', 'Export'],
  mashup_export: ['trackCustom', 'MashupExport'], extended_export: ['trackCustom', 'ExtendedExport'], convert: ['trackCustom', 'Convert'],
  crate_export: ['trackCustom', 'CrateExport'], invite_copy: ['trackCustom', 'InviteCopy'] };
// logAct names → GA4 events (key events are marked in GA4 → Admin → Events). Never the detail (song names).
const EV = { separate: 'separation', export: 'export', subscribe_click: 'subscribe_click', mashup_export: 'mashup_export', extended_export: 'extended_export',
  convert: 'convert', crate_export: 'crate_export', song_upload: 'song_upload', invite_copy: 'invite_copy' };
document.addEventListener('cr-act', e => { const n = EV[e.detail && e.detail.action]; if (n) track(n); });
document.addEventListener('cr-signup', () => track('sign_up', { method: 'email' }));
// a payment confirmed by the webhook (app.js payReturn): plan + its monthly price in ILS
document.addEventListener('cr-paid', e => { const d = e.detail || {}; track('purchase', { value: +d.value || 0, currency: 'ILS', plan: String(d.plan || '').replace(/[^\w-]/g, '').slice(0, 24) }); });
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
// which banner: 'all' = nothing chosen yet; 'ad' = analytics chosen before the split, a Meta id is set, marketing not chosen
const barKind = () => (!need() ? '' : !S.choice ? 'all' : (needM() && !mChosen()) ? 'ad' : '');
function barHTML() {
  const pol = ' <a href="#privacy" data-ck="policy">' + esc(t('ckPolicy')) + '</a></p></div>', set = '<button type="button" class="btn ghost" data-ck="open">' + esc(t('ckSettings')) + '</button></div></div>';
  if (barKind() === 'ad') return '<div class="ck-in"><div class="ck-t"><b id="ckH">' + esc(t('ckAdTitle')) + '</b><p>' + esc(t('ckAdText')) + pol +
    '<div class="ck-b"><button type="button" class="btn solid" data-ck="adyes">' + esc(t('ckAdAccept')) + '</button><button type="button" class="btn solid" data-ck="adno">' + esc(t('ckAdReject')) + '</button>' + set;
  const m = needM();
  return '<div class="ck-in"><div class="ck-t"><b id="ckH">' + esc(t('ckTitle')) + '</b><p>' + esc(t('ckText')) + (m ? ' ' + esc(t('ckTextAd')) : '') + pol +
    '<div class="ck-b"><button type="button" class="btn solid" data-ck="all">' + esc(m ? t('acceptAll') : t('ckAccept')) + '</button><button type="button" class="btn solid" data-ck="none">' + esc(t('ckReject')) + '</button>' + set;
}
function showBar() {
  if (!barKind()) { hideBar(); return; }
  if (document.getElementById('welcomeLang')) { setTimeout(showBar, 600); return; }   // the first-visit language picker goes first
  let b = $('#ckBar');
  if (!b) { b = document.createElement('div'); b.id = 'ckBar'; b.className = 'ck'; b.setAttribute('role', 'region'); b.setAttribute('aria-labelledby', 'ckH'); document.body.appendChild(b); }
  b.innerHTML = barHTML(); b.hidden = false; lift();
}
function hideBar() { const b = $('#ckBar'); if (b && !b.hidden) { b.hidden = true; lift(); } }

let lastFocus = null;
function dlgHTML() {
  const on = !!(S.choice && S.choice.a), onM = !!(S.choice && S.choice.m === true);
  const sw = (id, v, h, p) => '<button type="button" class="ck-sw" id="' + id + '" role="switch" aria-checked="' + v + '" aria-labelledby="' + h + '" aria-describedby="' + p + '"><i aria-hidden="true"></i><span>' + esc(v ? t('on') : t('off')) + '</span></button>';
  return '<div class="dlg ckdlg" role="dialog" aria-modal="true" aria-labelledby="ckDH">' +
    '<div class="dh"><h3 id="ckDH">' + esc(t('dlgTitle')) + '</h3><button type="button" class="x" data-ck="close" aria-label="' + esc(t('close')) + '">×</button></div>' +
    '<p class="snote">' + esc(t('dlgIntro')) + '</p>' +
    '<div class="ck-row"><div><b>' + esc(t('necH')) + '</b><p>' + esc(t('necP')) + '</p></div><span class="ck-always">' + esc(t('always')) + '</span></div>' +
    '<div class="ck-row"><div><b id="ckAnH">' + esc(t('anH')) + '</b><p id="ckAnP">' + esc(t('anP')) + '</p>' + (needA() ? '' : '<p class="snote">' + esc(t('notActive')) + '</p>') + '</div>' +
    sw('ckAn', on, 'ckAnH', 'ckAnP') + '</div>' +
    '<div class="ck-row"><div><b id="ckAdH">' + esc(t('adH')) + '</b><p id="ckAdP">' + esc(t('adP')) + '</p>' + (needM() ? '' : '<p class="snote">' + esc(t('adNot')) + '</p>') + '</div>' +
    sw('ckAd', onM, 'ckAdH', 'ckAdP') + '</div>' +
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
  document.documentElement.classList.add('dlg-open');            // hides the a11y / Roomy buttons over the dialog
  setTimeout(() => { const s = w.querySelector('#ckAn'); if (s) s.focus(); }, 30);
}
function close() {
  const w = $('#ckDlg'); if (!w || w.hidden) return;
  w.hidden = true;
  if (!document.querySelector('.dlgwrap:not([hidden]):not(#ckDlg)')) document.documentElement.classList.remove('dlg-open');
  if (lastFocus && document.contains(lastFocus) && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
}
// set(analytics, marketing): marketing undefined = keep what was chosen (or leave it unchosen)
function set(a, m) {
  const was = active(), wasM = activeM();
  if (typeof m !== 'boolean' && mChosen()) m = S.choice.m;
  S.choice = write(a, m); S.off = false;
  if (barKind()) showBar(); else hideBar();
  if (a || m === true) start();
  if (!a && (was || S.ga || S.cl)) stop();
  if (m !== true && (wasM || S.fb)) stopM();
  return S.choice;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-ck]'); if (!b) return;
  const k = b.getAttribute('data-ck');
  if (k === 'open') { e.preventDefault(); open(); return; }
  if (k === 'close') { close(); return; }
  if (k === 'policy') { close(); return; }                       // the link itself navigates to #privacy
  // "accept all" from the dialog (Meta row shown) or from a banner that named Meta covers marketing; the plain
  // "allow analytics" banner (no Meta id) leaves marketing unchosen so it is asked if Meta is configured later
  if (k === 'all') { set(true, (b.closest('#ckDlg') || needM()) ? true : undefined); flash(); close(); return; }
  if (k === 'none') { set(false, false); flash(); close(); return; }
  if (k === 'adyes' || k === 'adno') { set(!!(S.choice && S.choice.a), k === 'adyes'); flash(); return; }
  if (k === 'save') { const s = $('#ckAn'), m = $('#ckAd'); set(!!(s && s.getAttribute('aria-checked') === 'true'), !!(m && m.getAttribute('aria-checked') === 'true')); flash(); close(); return; }
});
document.addEventListener('click', e => {
  const s = e.target.closest && e.target.closest('#ckDlg .ck-sw'); if (!s) return;
  const on = s.getAttribute('aria-checked') !== 'true';
  s.setAttribute('aria-checked', String(on)); s.querySelector('span').textContent = on ? t('on') : t('off');
});
function flash() { try { CR.toast(t('saved')); } catch (e) {} }

/* ---------- wiring ---------- */
function onConfig() { gsc(); if (active() || activeM()) start(); showBar(); }
document.addEventListener('cr-config', onConfig);
new MutationObserver(() => { const b = $('#ckBar'); if (b && !b.hidden) b.innerHTML = barHTML(); const w = $('#ckDlg'); if (w && !w.hidden) { w.innerHTML = dlgHTML(); } })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
window.addEventListener('storage', e => { if (e.key === KEY) { const c = read(), was = active(), wasM = activeM(); S.choice = c; if (active() || activeM()) start(); if (was && !active()) stop(); if (wasM && !activeM()) stopM(); if (barKind()) showBar(); else hideBar(); } });
if (CR.ACC && CR.ACC.config && Object.keys(CR.ACC.config).length) onConfig();

window.CONSENT = {
  open, close, set, track, userProp, active, activeM, need,
  choice: () => (S.choice ? { a: S.choice.a, m: mChosen() ? S.choice.m : null, at: S.choice.at } : null),
  _state: () => ({ ga: S.ga, cl: S.cl, fb: S.fb, view: S.view, props: { ...S.props }, ids: ids(), choice: S.choice })
};
})();
