/*
 * Roomy (רומי) — the site's chat assistant. A floating button (bottom corner opposite the accessibility button) opens a
 * chat panel; answers stream from /api/assistant (functions/api/assistant.js → Anthropic), one message of the daily
 * quota each (supabase/assistant.sql). Owner guide: ASSISTANT.md.
 *
 *  * Talks to the app only through window.CR (strings, language, current song) and window.Backend (access token,
 *    quota status). Signed-in users only; the conversation lives in sessionStorage per account and is dropped when
 *    the account changes (the `cr-user` event).
 *  * Answers are rendered with DOM nodes only (never innerHTML of model text): a tiny markdown subset — bold,
 *    italics, inline code, bullet/numbered lists, line breaks — and links ONLY to the site's own views.
 *  * What the user is looking at (view, song key/BPM/chords, crate stats, DJ decks) is sent as `ctx`; the server
 *    validates it and gives it to the model as data.
 */
(function () {
'use strict';
const CR = window.CR;
if (!CR || !window.Backend) return;
if (!Backend.enabled) return;                       // no accounts → no assistant (it needs a sign-in)
const { t } = CR;

const API = '/api/assistant';
const MAX = 2000;                                   // characters per message (the server refuses more)
const HIST = 24;                                    // messages per request
const BODY_MAX = 30000;                             // bytes (server limit 32 KB)
const LINKS = ['#tool', '#discover', '#dj', '#crate', '#mashup', '#pricing', '#terms', '#privacy', '#'];
const SS = 'chordroom.rm.v1';                       // sessionStorage: conversation per account
const LS_SEEN = 'chordroom.rm.seen';                // localStorage: the one-time hello bubble was shown

/* ---------- strings (he / en / ar / ru / es) ---------- */
CR.addStrings({
he: { rmName: 'רומי', rmRole: 'העוזר המוזיקלי שלך', rmOnline: 'מחובר', rmFab: 'צ׳אט עם רומי', rmTyping: 'רומי כותב…',
  rmHello: 'היי, אני **רומי** 👋 העוזר המוזיקלי של Chord\u00a0Room.\nאפשר לשאול אותי על כל דבר באתר — וגם על מוזיקה בכלל: סולמות ואקורדים, מאשאפים ורמיקסים, מעברי DJ וטיפים להפקה. במה נתחיל?',
  rmTeaser: 'היי! אני רומי 🎧 צריכים עזרה עם מיקס, סולם או משהו באתר?', rmTeaserX: 'לא עכשיו',
  rmPh: 'כתבו לרומי…', rmSend: 'שליחה', rmStop: 'עצירה', rmNew: 'שיחה חדשה', rmClose: 'סגירה', rmMine: 'ההודעה שלך', rmIdeas: 'רעיונות לשאלות',
  rmLeft: 'נשארו לך {n} הודעות היום', rmLeft1: 'נשארה לך הודעה אחת היום', rmChars: '{n} מתוך {max} תווים', rmLong: 'ההודעה ארוכה מדי (עד {max} תווים).',
  rmSignT: 'כדי לדבר עם רומי צריך להתחבר', rmSignP: 'החשבון חינמי ולוקח דקה. אחרי ההתחברות רומי כאן בשבילך: שאלות על האתר, תיאוריה, מאשאפים, מעברים והפקה.',
  rmSignIn: 'כניסה', rmSignUp: 'הרשמה',
  rmErrQuota: 'סיימת את ההודעות של היום 🙌 נתראה מחר! במסלולים בתשלום יש יותר הודעות: [מחירים](#pricing)',
  rmErrSlow: 'וואו, מהר! 😅 חכו דקה ונמשיך.', rmErrBlocked: 'החשבון הזה לא יכול להשתמש ברומי כרגע.',
  rmErrOff: 'רומי לוקח הפסקה קצרה. נחזור בקרוב!', rmErrCfg: 'רומי עוד מתכונן להופעה — הוא יהיה זמין בקרוב.',
  rmErrBusy: 'יש עומס רגעי. נסו שוב בעוד כמה שניות.', rmErrNet: 'אין חיבור. בדקו את האינטרנט ונסו שוב.',
  rmErrCut: 'התשובה נקטעה באמצע.', rmErrGen: 'משהו השתבש. נסו שוב.', rmErrAuth: 'פג תוקף ההתחברות. התחברו שוב ונמשיך.',
  rmRetry: 'לנסות שוב', rmStopped: 'נעצר',
  sgSongKey: 'באיזה סולם השיר הזה? רעיונות למאשאפ איתו', sgSongRemix: 'איך לעשות רמיקס לשיר הזה?', sgStems: 'איך מפרידים את השירה מהשיר?',
  sgMidi: 'איך מייצאים MIDI ל־FL Studio?', sgDiscMatch: 'איך עובדות התאמות ה־DJ?', sgDiscSet: 'איך בונים סט מהמצעדים?',
  sgDjSync: 'איך עושים מעבר חלק בין שני שירים?', sgDjEq: 'טיפים למיקס עם EQ', sgCrateXml: 'איך מייצאים נקודות קיו ל־rekordbox?',
  sgCrateUsb: 'איך מכינים דיסק און קי לפיוניר?', sgCrateSmart: 'מה עושה הסידור החכם?', sgPoints: 'על מה משלמים בנקודות?',
  sgInvite: 'איך מזמינים חבר?', sgMinor: 'תלמד אותי את הסולם המינורי', sgWhat: 'מה אתה יודע לעשות?', sgMashup: 'איך עושים מאשאפ?',
  sgCircle: 'מה זה מעגל הקווינטות?' },
en: { rmName: 'Roomy', rmRole: 'Your music buddy', rmOnline: 'Online', rmFab: 'Chat with Roomy', rmTyping: 'Roomy is typing…',
  rmHello: 'Hi, I\'m **Roomy** 👋 Chord\u00a0Room\'s music buddy.\nAsk me anything about the site — or about music in general: scales and chords, mashups and remixes, DJ transitions and production tips. Where shall we start?',
  rmTeaser: 'Hey! I\'m Roomy 🎧 Need a hand with a mix, a key or anything on the site?', rmTeaserX: 'Not now',
  rmPh: 'Message Roomy…', rmSend: 'Send', rmStop: 'Stop', rmNew: 'New chat', rmClose: 'Close', rmMine: 'Your message', rmIdeas: 'Question ideas',
  rmLeft: 'You have {n} messages left today', rmLeft1: 'You have 1 message left today', rmChars: '{n} of {max} characters', rmLong: 'That message is too long (up to {max} characters).',
  rmSignT: 'Sign in to chat with Roomy', rmSignP: 'Accounts are free and take a minute. Then Roomy is here for you: questions about the site, theory, mashups, transitions and production.',
  rmSignIn: 'Sign in', rmSignUp: 'Sign up',
  rmErrQuota: 'You\'ve used today\'s messages 🙌 See you tomorrow! Paid plans get more messages: [Pricing](#pricing)',
  rmErrSlow: 'Whoa, that\'s fast! 😅 Give it a minute and we\'ll carry on.', rmErrBlocked: 'This account can\'t use Roomy right now.',
  rmErrOff: 'Roomy is taking a short break. Back soon!', rmErrCfg: 'Roomy is still warming up backstage — available soon.',
  rmErrBusy: 'It\'s busy right now. Try again in a few seconds.', rmErrNet: 'No connection. Check your internet and try again.',
  rmErrCut: 'The answer was cut off.', rmErrGen: 'Something went wrong. Please try again.', rmErrAuth: 'Your session expired. Sign in again and we\'ll carry on.',
  rmRetry: 'Try again', rmStopped: 'Stopped',
  sgSongKey: 'What key is this song? Ideas for a mashup with it', sgSongRemix: 'How would I remix this song?', sgStems: 'How do I separate the vocals?',
  sgMidi: 'How do I export MIDI to FL Studio?', sgDiscMatch: 'How do DJ matches work?', sgDiscSet: 'How do I build a set from the charts?',
  sgDjSync: 'How do I make a smooth transition?', sgDjEq: 'Tips for mixing with EQ', sgCrateXml: 'How do I export cue points to rekordbox?',
  sgCrateUsb: 'How do I prepare a USB for Pioneer?', sgCrateSmart: 'What does Smart order do?', sgPoints: 'What are points for?',
  sgInvite: 'How do I invite a friend?', sgMinor: 'Teach me the minor scale', sgWhat: 'What can you do?', sgMashup: 'How do I make a mashup?',
  sgCircle: 'What is the circle of fifths?' },
ar: { rmName: 'رومي', rmRole: 'رفيقك الموسيقي', rmOnline: 'متصل', rmFab: 'دردشة مع رومي', rmTyping: 'رومي يكتب…',
  rmHello: 'أهلًا، أنا **رومي** 👋 رفيقك الموسيقي في Chord\u00a0Room.\nاسألني عن أي شيء في الموقع — أو عن الموسيقى عمومًا: المقامات والكوردات، الماشأب والريمكس، انتقالات الـDJ ونصائح الإنتاج. من أين نبدأ؟',
  rmTeaser: 'أهلًا! أنا رومي 🎧 تحتاج مساعدة في مزج أو مقام أو أي شيء في الموقع؟', rmTeaserX: 'ليس الآن',
  rmPh: 'اكتب لرومي…', rmSend: 'إرسال', rmStop: 'إيقاف', rmNew: 'محادثة جديدة', rmClose: 'إغلاق', rmMine: 'رسالتك', rmIdeas: 'أفكار لأسئلة',
  rmLeft: 'تبقّى لك {n} رسائل اليوم', rmLeft1: 'تبقّت لك رسالة واحدة اليوم', rmChars: '{n} من {max} حرف', rmLong: 'الرسالة طويلة جدًا (حتى {max} حرف).',
  rmSignT: 'سجّل الدخول للدردشة مع رومي', rmSignP: 'الحساب مجاني ويستغرق دقيقة. بعدها رومي هنا من أجلك: أسئلة عن الموقع والنظرية والماشأب والانتقالات والإنتاج.',
  rmSignIn: 'دخول', rmSignUp: 'تسجيل',
  rmErrQuota: 'استخدمت رسائل اليوم 🙌 نلتقي غدًا! الخطط المدفوعة فيها رسائل أكثر: [الأسعار](#pricing)',
  rmErrSlow: 'واو، بسرعة! 😅 انتظر دقيقة ونكمل.', rmErrBlocked: 'لا يمكن لهذا الحساب استخدام رومي حاليًا.',
  rmErrOff: 'رومي في استراحة قصيرة. نعود قريبًا!', rmErrCfg: 'رومي ما زال يستعد خلف الكواليس — سيتوفر قريبًا.',
  rmErrBusy: 'هناك ضغط الآن. حاول مجددًا بعد ثوانٍ.', rmErrNet: 'لا يوجد اتصال. تحقّق من الإنترنت وحاول مجددًا.',
  rmErrCut: 'انقطعت الإجابة في المنتصف.', rmErrGen: 'حدث خطأ ما. حاول مجددًا.', rmErrAuth: 'انتهت الجلسة. سجّل الدخول مجددًا ونكمل.',
  rmRetry: 'حاول مجددًا', rmStopped: 'توقّف',
  sgSongKey: 'ما مقام هذه الأغنية؟ أفكار لماشأب معها', sgSongRemix: 'كيف أعمل ريمكس لهذه الأغنية؟', sgStems: 'كيف أفصل الغناء عن الأغنية؟',
  sgMidi: 'كيف أصدّر MIDI إلى FL Studio؟', sgDiscMatch: 'كيف تعمل توافقات الـDJ؟', sgDiscSet: 'كيف أبني سِتًّا من القوائم؟',
  sgDjSync: 'كيف أنتقل بسلاسة بين أغنيتين؟', sgDjEq: 'نصائح للمزج بالـEQ', sgCrateXml: 'كيف أصدّر نقاط الـCue إلى rekordbox؟',
  sgCrateUsb: 'كيف أجهّز USB لأجهزة Pioneer؟', sgCrateSmart: 'ماذا يفعل الترتيب الذكي؟', sgPoints: 'على ماذا تُصرف النقاط؟',
  sgInvite: 'كيف أدعو صديقًا؟', sgMinor: 'علّمني السلّم الصغير (المينور)', sgWhat: 'ماذا تستطيع أن تفعل؟', sgMashup: 'كيف أصنع ماشأب؟',
  sgCircle: 'ما هي دائرة الخامسات؟' },
ru: { rmName: 'Руми', rmRole: 'Твой музыкальный помощник', rmOnline: 'В сети', rmFab: 'Чат с Руми', rmTyping: 'Руми печатает…',
  rmHello: 'Привет, я **Руми** 👋 музыкальный помощник Chord\u00a0Room.\nСпрашивайте о чём угодно на сайте — и о музыке вообще: гаммы и аккорды, мэшапы и ремиксы, DJ-переходы и советы по продакшену. С чего начнём?',
  rmTeaser: 'Привет! Я Руми 🎧 Помочь с миксом, тональностью или чем-то на сайте?', rmTeaserX: 'Не сейчас',
  rmPh: 'Напишите Руми…', rmSend: 'Отправить', rmStop: 'Стоп', rmNew: 'Новый чат', rmClose: 'Закрыть', rmMine: 'Ваше сообщение', rmIdeas: 'Идеи для вопросов',
  rmLeft: 'Сегодня осталось сообщений: {n}', rmLeft1: 'Сегодня осталось 1 сообщение', rmChars: '{n} из {max} символов', rmLong: 'Сообщение слишком длинное (до {max} символов).',
  rmSignT: 'Войдите, чтобы общаться с Руми', rmSignP: 'Аккаунт бесплатный и создаётся за минуту. После входа Руми ответит на вопросы о сайте, теории, мэшапах, переходах и продакшене.',
  rmSignIn: 'Вход', rmSignUp: 'Регистрация',
  rmErrQuota: 'Сообщения на сегодня закончились 🙌 До завтра! В платных тарифах сообщений больше: [Тарифы](#pricing)',
  rmErrSlow: 'Ого, как быстро! 😅 Подождите минуту, и продолжим.', rmErrBlocked: 'Этот аккаунт сейчас не может пользоваться Руми.',
  rmErrOff: 'Руми на коротком перерыве. Скоро вернёмся!', rmErrCfg: 'Руми ещё готовится за кулисами — скоро будет доступен.',
  rmErrBusy: 'Сейчас высокая нагрузка. Попробуйте через несколько секунд.', rmErrNet: 'Нет соединения. Проверьте интернет и попробуйте снова.',
  rmErrCut: 'Ответ прервался.', rmErrGen: 'Что-то пошло не так. Попробуйте снова.', rmErrAuth: 'Сессия истекла. Войдите снова, и продолжим.',
  rmRetry: 'Повторить', rmStopped: 'Остановлено',
  sgSongKey: 'В какой тональности эта песня? Идеи для мэшапа', sgSongRemix: 'Как сделать ремикс на эту песню?', sgStems: 'Как отделить вокал от песни?',
  sgMidi: 'Как экспортировать MIDI в FL Studio?', sgDiscMatch: 'Как работают DJ-совпадения?', sgDiscSet: 'Как собрать сет из чартов?',
  sgDjSync: 'Как сделать плавный переход?', sgDjEq: 'Советы по сведению с EQ', sgCrateXml: 'Как экспортировать cue-точки в rekordbox?',
  sgCrateUsb: 'Как подготовить флешку для Pioneer?', sgCrateSmart: 'Что делает умный порядок?', sgPoints: 'За что платят баллами?',
  sgInvite: 'Как пригласить друга?', sgMinor: 'Научи меня минорной гамме', sgWhat: 'Что ты умеешь?', sgMashup: 'Как сделать мэшап?',
  sgCircle: 'Что такое квинтовый круг?' },
es: { rmName: 'Roomy', rmRole: 'Tu compañero musical', rmOnline: 'En línea', rmFab: 'Chatear con Roomy', rmTyping: 'Roomy está escribiendo…',
  rmHello: '¡Hola! Soy **Roomy** 👋 el compañero musical de Chord\u00a0Room.\nPregúntame lo que quieras sobre el sitio — o sobre música en general: escalas y acordes, mashups y remixes, transiciones de DJ y consejos de producción. ¿Por dónde empezamos?',
  rmTeaser: '¡Hola! Soy Roomy 🎧 ¿Te ayudo con una mezcla, una tonalidad o algo del sitio?', rmTeaserX: 'Ahora no',
  rmPh: 'Escribe a Roomy…', rmSend: 'Enviar', rmStop: 'Detener', rmNew: 'Nuevo chat', rmClose: 'Cerrar', rmMine: 'Tu mensaje', rmIdeas: 'Ideas de preguntas',
  rmLeft: 'Te quedan {n} mensajes hoy', rmLeft1: 'Te queda 1 mensaje hoy', rmChars: '{n} de {max} caracteres', rmLong: 'El mensaje es demasiado largo (hasta {max} caracteres).',
  rmSignT: 'Inicia sesión para chatear con Roomy', rmSignP: 'La cuenta es gratis y se crea en un minuto. Después Roomy te ayuda con el sitio, teoría, mashups, transiciones y producción.',
  rmSignIn: 'Entrar', rmSignUp: 'Registrarse',
  rmErrQuota: 'Ya usaste los mensajes de hoy 🙌 ¡Hasta mañana! Los planes de pago tienen más mensajes: [Precios](#pricing)',
  rmErrSlow: '¡Uy, qué rápido! 😅 Espera un minuto y seguimos.', rmErrBlocked: 'Esta cuenta no puede usar Roomy ahora.',
  rmErrOff: 'Roomy está en una pausa corta. ¡Volvemos pronto!', rmErrCfg: 'Roomy todavía se prepara tras el escenario — pronto estará disponible.',
  rmErrBusy: 'Hay mucha demanda ahora. Inténtalo en unos segundos.', rmErrNet: 'Sin conexión. Revisa internet e inténtalo de nuevo.',
  rmErrCut: 'La respuesta se cortó.', rmErrGen: 'Algo salió mal. Inténtalo de nuevo.', rmErrAuth: 'Tu sesión caducó. Vuelve a entrar y seguimos.',
  rmRetry: 'Reintentar', rmStopped: 'Detenido',
  sgSongKey: '¿En qué tonalidad está esta canción? Ideas para un mashup', sgSongRemix: '¿Cómo haría un remix de esta canción?', sgStems: '¿Cómo separo la voz de la canción?',
  sgMidi: '¿Cómo exporto MIDI a FL Studio?', sgDiscMatch: '¿Cómo funcionan las coincidencias DJ?', sgDiscSet: '¿Cómo armo un set con las listas?',
  sgDjSync: '¿Cómo hago una transición suave?', sgDjEq: 'Consejos para mezclar con EQ', sgCrateXml: '¿Cómo exporto cue points a rekordbox?',
  sgCrateUsb: '¿Cómo preparo un USB para Pioneer?', sgCrateSmart: '¿Qué hace el orden inteligente?', sgPoints: '¿Para qué sirven los puntos?',
  sgInvite: '¿Cómo invito a un amigo?', sgMinor: 'Enséñame la escala menor', sgWhat: '¿Qué sabes hacer?', sgMashup: '¿Cómo hago un mashup?',
  sgCircle: '¿Qué es el círculo de quintas?' }
});

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v);
  }
  if (kids) for (const c of [].concat(kids)) if (c != null) e.append(c);
  return e;
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const reduced = () => document.documentElement.classList.contains('a11y-noanim') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const mobile = () => window.matchMedia && matchMedia('(max-width: 520px)').matches;
const lang = () => CR.getLang ? CR.getLang() : (document.documentElement.lang || 'he');
const ascii = s => String(s || '').replace(/♯/g, '#').replace(/♭/g, 'b').trim();
const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(markup, cls) {                     // our own constant icon markup only
  const d = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}" ${markup}</svg>`, 'image/svg+xml');
  const s = document.importNode(d.documentElement, true);
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); if (cls) s.setAttribute('class', cls);
  return s;
}
// the avatar: a round face with headphones (features in currentColor on the brand gradient)
const AVATAR = 'viewBox="0 0 40 40"><path d="M9 23v-3.5a11 11 0 0 1 22 0V23" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
  '<rect x="5.5" y="20.5" width="6" height="10" rx="3" fill="currentColor"/><rect x="28.5" y="20.5" width="6" height="10" rx="3" fill="currentColor"/>' +
  '<circle cx="16.3" cy="22" r="1.9" fill="currentColor"/><circle cx="23.7" cy="22" r="1.9" fill="currentColor"/>' +
  '<path d="M16 26.6q4 3.2 8 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const IC = {
  send: 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: 'viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>',
  close: 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/>',
  plus: 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  retry: 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'
};

/* ---------- safe markdown subset → DOM ---------- */
// inline: `code`, **bold**, *italic* / _italic_, [text](#hash) with an allowed hash. Everything else stays text.
const INLINE = /(`[^`\n]{1,300}`)|(\*\*(?=\S)[^\n]{1,400}?\*\*)|(\*(?=[^\s*])[^*\n]{1,300}?\*)|(\b_(?=\S)[^_\n]{1,300}?_\b)|(\[([^\]\n]{1,200})\]\(([^)\s]{0,200})\))/;
function inline(text, depth) {
  const out = document.createDocumentFragment();
  let s = text;
  while (s) {
    const m = INLINE.exec(s);
    if (!m) { out.append(s); break; }
    if (m.index) out.append(s.slice(0, m.index));
    const tok = m[0];
    if (m[1]) out.append(el('code', { text: tok.slice(1, -1) }));
    else if (m[2]) { const b = el('strong'); depth < 2 ? b.append(inline(tok.slice(2, -2), depth + 1)) : b.append(tok.slice(2, -2)); out.append(b); }
    else if (m[3] || m[4]) { const i = el('em'); depth < 2 ? i.append(inline(tok.slice(1, -1), depth + 1)) : i.append(tok.slice(1, -1)); out.append(i); }
    else if (m[5]) {
      const label = m[6], href = m[7];
      if (LINKS.includes(href)) out.append(el('a', { href, class: 'rm-link', 'data-rm-view': href.slice(1) || 'about', text: label }));
      else out.append(tok);                     // javascript:, https:, data:… → plain text, never a link
    }
    s = s.slice(m.index + tok.length);
  }
  return out;
}
function render(text) {
  const root = document.createDocumentFragment();
  // bidi override/isolate controls could make text read differently than it is: drop them
  const lines = String(text || '').replace(/\r\n?/g, '\n').replace(/[\u202A-\u202E\u2066-\u2069]/g, '').split('\n');
  let para = null, list = null, listType = '';
  const endPara = () => { para = null; };
  const endList = () => { list = null; listType = ''; };
  for (let raw of lines) {
    if (/^\s*```/.test(raw)) continue;                              // code fences: keep the text, drop the fences
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { endPara(); endList(); continue; }
    let m;
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
      endPara();
      if (listType !== 'ul') { list = el('ul', { dir: 'auto' }); root.append(list); listType = 'ul'; }
      list.append(el('li', { dir: 'auto' }, inline(m[1], 0)));
      continue;
    }
    if ((m = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line))) {
      endPara();
      if (listType !== 'ol') { list = el('ol', { dir: 'auto' }); if (+m[1] > 1) list.setAttribute('start', String(+m[1])); root.append(list); listType = 'ol'; }
      list.append(el('li', { dir: 'auto' }, inline(m[2], 0)));
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw) && list.lastChild) {         // continuation of a list item
      list.lastChild.append(el('br'), inline(line.trim(), 0));
      continue;
    }
    endList();
    let body = line, strong = false;
    if ((m = /^\s*#{1,6}\s+(.*)$/.exec(line))) { body = m[1]; strong = true; endPara(); }
    if (/^\s*>\s?/.test(body)) body = body.replace(/^\s*>\s?/, '');
    if (!para) { para = el('p', { dir: 'auto' }); root.append(para); } else para.append(el('br'));
    const f = inline(body.trim(), 0);
    if (strong) { para.append(el('strong', null, f)); endPara(); } else para.append(f);
  }
  return root;
}

/* ---------- state ---------- */
const R = {
  built: false, open: false, uid: null, msgs: [], busy: false, ac: null, left: null, limit: null,
  note: null,           // {kind:'err'|'info', key, retry, md}
  ui: {}
};
const ssKey = () => SS + ':' + (R.uid || 'guest');
function load() {
  R.msgs = [];
  if (!R.uid) return;
  try {
    const o = JSON.parse(sessionStorage.getItem(ssKey()) || 'null');
    if (o && Array.isArray(o.msgs)) R.msgs = o.msgs.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-60);
  } catch (e) {}
}
function save() {
  if (!R.uid) return;
  try { sessionStorage.setItem(ssKey(), JSON.stringify({ msgs: R.msgs.filter(m => !m.pending).slice(-60).map(m => ({ role: m.role, content: m.content, ...(m.stopped ? { stopped: 1 } : {}), ...(m.cut ? { cut: 1 } : {}) })) })); } catch (e) {}
}
function dropAll() {
  try { for (let i = sessionStorage.length - 1; i >= 0; i--) { const k = sessionStorage.key(i); if (k && k.indexOf(SS) === 0) sessionStorage.removeItem(k); } } catch (e) {}
}

/* ---------- what the user is looking at ---------- */
const VIEW_OF = [['#toolView', 'tool'], ['#discover', 'discover'], ['#djView', 'dj'], ['#crateView', 'crate'], ['#mashupView', 'mashup'], ['#pricingView', 'pricing'], ['#aboutView', 'home']];
function view() {
  if (document.documentElement.classList.contains('home')) return 'home';
  for (const [sel, v] of VIEW_OF) { const e = $(sel); if (e && !e.hidden) return v; }
  const lg = $('#legalView');
  if (lg && !lg.hidden) return /privacy/.test(location.hash) ? 'privacy' : 'terms';
  return 'other';
}
function songCtx() {
  let s = null; try { s = CR.toolSong && CR.toolSong(); } catch (e) {}
  if (!s) return null;
  const o = { name: String(s.name || '').slice(0, 80) };
  try { if (s.key) o.origKey = ascii(CR.keyText(s.key)); } catch (e) {}
  if (s.bpm) o.origBpm = Math.round(s.bpm * 10) / 10;
  if (s.dur) o.dur = Math.round(s.dur);
  const k = $('#sKey'); if (k && /^[A-G]/.test(k.textContent.trim())) o.key = ascii(k.textContent);
  const b = $('#sBpm'); const bv = b ? parseFloat(String(b.value).replace(',', '.')) : NaN; if (isFinite(bv)) o.bpm = Math.round(bv * 10) / 10;
  const ch = [...document.querySelectorAll('#chips .chip b')].map(x => ascii(x.textContent)).filter(Boolean).slice(0, 12);
  if (ch.length) o.chords = ch;
  o.demo = !!(s.name && s.name === t('demoName'));
  return o;
}
function crateCtx() {
  try {
    const C = window.CRATE && CRATE._C; if (!C || !Array.isArray(C.rows) || !C.rows.length) return null;
    const done = C.rows.filter(r => r && r.bpm > 0);
    const o = { tracks: C.rows.length, analysed: done.length };
    if (done.length) {
      const bp = done.map(r => r.bpm); o.bpmMin = Math.round(Math.min(...bp)); o.bpmMax = Math.round(Math.max(...bp));
      const cnt = {}; for (const r of done) if (r.key) { const k = ascii(CR.keyText(r.key)); cnt[k] = (cnt[k] || 0) + 1; }
      const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; if (top) o.topKey = top;
      o.cues = done.some(r => Array.isArray(r.cues) && r.cues.length);
    }
    return o;
  } catch (e) { return null; }
}
function djCtx() {
  try {
    const D = window.DJ && DJ._D; if (!D || !Array.isArray(D.decks)) return null;
    const o = {};
    D.decks.forEach((d, i) => {
      if (!d || !d.track || i > 1) return;
      const x = {}; if (d.track.name) x.name = String(d.track.name).slice(0, 60);
      if (d.track.key) x.key = ascii(CR.keyText(d.track.key)); if (d.track.bpm) x.bpm = Math.round(d.track.bpm * 10) / 10;
      o[i ? 'b' : 'a'] = x;
    });
    return Object.keys(o).length ? o : null;
  } catch (e) { return null; }
}
function ctx() {
  const v = view(), o = { view: v, signedIn: signedIn() };
  if (v === 'tool') { const s = songCtx(); if (s) o.song = s; }
  if (v === 'crate') { const c = crateCtx(); if (c) o.crate = c; }
  if (v === 'dj') { const d = djCtx(); if (d) o.dj = d; }
  return o;
}
function suggestions() {
  const v = view();
  if (v === 'tool') return songCtx() ? ['sgSongKey', 'sgSongRemix', 'sgStems', 'sgMidi'] : ['sgStems', 'sgMidi', 'sgMashup', 'sgMinor'];
  if (v === 'discover') return ['sgDiscMatch', 'sgDiscSet', 'sgMashup', 'sgCircle'];
  if (v === 'dj') return ['sgDjSync', 'sgDjEq', 'sgDiscSet', 'sgCircle'];
  if (v === 'crate') return ['sgCrateXml', 'sgCrateUsb', 'sgCrateSmart', 'sgDjSync'];
  if (v === 'mashup') return ['sgMashup', 'sgStems', 'sgCircle', 'sgDjSync'];
  if (v === 'pricing') return ['sgPoints', 'sgInvite', 'sgStems', 'sgWhat'];
  return ['sgWhat', 'sgMinor', 'sgMashup', 'sgCircle'];
}
const signedIn = () => { try { return !!(CR.signedIn && CR.signedIn()); } catch (e) { return false; } };

/* ---------- UI ---------- */
function build() {
  if (R.built) return;
  R.built = true;
  const U = R.ui;
  U.root = el('div', { id: 'rm-root', class: 'rm' });
  U.fab = el('button', { type: 'button', class: 'rm-fab', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'rm-panel' },
    [el('span', { class: 'rm-av rm-av-fab' }, svg(AVATAR)), el('span', { class: 'rm-fab-dot', 'aria-hidden': 'true' })]);
  U.teaser = el('div', { class: 'rm-teaser', hidden: true, role: 'status' });
  U.teaserT = el('button', { type: 'button', class: 'rm-teaser-t' });
  U.teaserX = el('button', { type: 'button', class: 'rm-teaser-x' }, svg(IC.close));
  U.teaser.append(U.teaserT, U.teaserX);

  U.panel = el('section', { id: 'rm-panel', class: 'rm-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'rm-title', hidden: true, tabindex: '-1' });
  U.title = el('h2', { id: 'rm-title', class: 'rm-name' });
  U.status = el('span', { class: 'rm-status' });
  U.role = el('span', { class: 'rm-role' });
  U.newBtn = el('button', { type: 'button', class: 'rm-hbtn rm-new' }, svg(IC.plus));
  U.closeBtn = el('button', { type: 'button', class: 'rm-hbtn rm-x' }, svg(IC.close));
  U.head = el('header', { class: 'rm-head' }, [
    el('span', { class: 'rm-av rm-av-head' }, [svg(AVATAR), el('i', { class: 'rm-on', 'aria-hidden': 'true' })]),
    el('div', { class: 'rm-htx' }, [U.title, el('div', { class: 'rm-sub' }, [U.status, el('span', { class: 'rm-sep', 'aria-hidden': 'true', text: '·' }), U.role])]),
    U.newBtn, U.closeBtn]);
  U.log = el('div', { class: 'rm-log', tabindex: '0' });
  U.live = el('div', { class: 'rm-sr', 'aria-live': 'polite', 'aria-atomic': 'true' });
  U.chips = el('div', { class: 'rm-chips', role: 'group' });
  U.note = el('div', { class: 'rm-note', hidden: true });
  U.ta = el('textarea', { class: 'rm-ta', rows: '1', dir: 'auto', maxlength: String(MAX), 'aria-describedby': 'rm-count', enterkeyhint: 'send', autocomplete: 'off' });
  U.count = el('span', { id: 'rm-count', class: 'rm-count', 'aria-live': 'polite' });
  U.send = el('button', { type: 'submit', class: 'rm-send' }, svg(IC.send));
  U.stop = el('button', { type: 'button', class: 'rm-stop', hidden: true }, svg(IC.stop));
  U.form = el('form', { class: 'rm-form', novalidate: true }, [el('div', { class: 'rm-field' }, [U.ta, U.count]), U.send, U.stop]);
  U.gate = el('div', { class: 'rm-gate', hidden: true });
  U.panel.append(U.head, U.log, U.gate, U.chips, U.note, U.form, U.live);
  U.root.append(U.teaser, U.panel, U.fab);
  document.body.appendChild(U.root);

  U.fab.addEventListener('click', () => toggle());
  U.teaserT.addEventListener('click', () => { hideTeaser(); openPanel(); });
  U.teaserX.addEventListener('click', () => { hideTeaser(); U.fab.focus(); });
  U.closeBtn.addEventListener('click', () => closePanel(true));
  U.newBtn.addEventListener('click', newChat);
  U.form.addEventListener('submit', e => { e.preventDefault(); send(U.ta.value); });
  U.stop.addEventListener('click', stopStream);
  U.ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(U.ta.value); }
  });
  U.ta.addEventListener('input', () => { taDir(); autosize(); counter(); });
  U.panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closePanel(true); return; }
    if (e.key === 'Tab' && mobile()) trap(e);          // full-screen sheet on phones: keep focus inside
  });
  U.panel.addEventListener('click', e => {
    const a = e.target.closest('a[data-rm-view]');
    if (a) {
      e.preventDefault();
      const v = a.dataset.rmView;
      try { CR.showView(v); } catch (x) { location.hash = v === 'about' ? '' : v; }
      if (mobile()) closePanel(false);
      renderChips();
      return;
    }
    const b = e.target.closest('[data-rm-act]');
    if (b) {
      const act = b.dataset.rmAct;
      if (act === 'in' || act === 'up') {
        const btn = $(act === 'in' ? '#signInBtn' : '#signUpBtn');
        closePanel(false);
        if (btn) btn.click();
      } else if (act === 'retry') retry();
      else if (act === 'chip') send(b.dataset.q || '');
    }
  });
  watchBottom();
  applyLang();
}

function applyLang() {
  if (!R.built) return;
  const U = R.ui, rtl = document.documentElement.dir === 'rtl';
  U.root.dir = rtl ? 'rtl' : 'ltr';
  U.fab.setAttribute('aria-label', t('rmFab')); U.fab.title = t('rmFab');
  U.title.textContent = t('rmName'); U.status.textContent = t('rmOnline'); U.role.textContent = t('rmRole');
  U.newBtn.setAttribute('aria-label', t('rmNew')); U.newBtn.title = t('rmNew');
  U.closeBtn.setAttribute('aria-label', t('rmClose')); U.closeBtn.title = t('rmClose');
  taDir(); U.ta.placeholder = t('rmPh'); U.ta.setAttribute('aria-label', t('rmPh'));
  U.send.setAttribute('aria-label', t('rmSend')); U.send.title = t('rmSend');
  U.stop.setAttribute('aria-label', t('rmStop')); U.stop.title = t('rmStop');
  U.chips.setAttribute('aria-label', t('rmIdeas'));
  U.teaserT.textContent = t('rmTeaser');
  U.teaserX.setAttribute('aria-label', t('rmTeaserX')); U.teaserX.title = t('rmTeaserX');
  renderAll();
}

function renderAll() {
  if (!R.built) return;
  const U = R.ui, on = signedIn();
  U.gate.hidden = on;
  U.form.hidden = !on;
  if (!on) {
    U.gate.replaceChildren(
      el('span', { class: 'rm-av rm-av-big' }, svg(AVATAR)),
      el('h3', { text: t('rmSignT') }),
      el('p', { text: t('rmSignP') }),
      el('div', { class: 'rm-gate-b' }, [
        el('button', { type: 'button', class: 'btn solid', 'data-rm-act': 'up', text: t('rmSignUp') }),
        el('button', { type: 'button', class: 'btn ghost', 'data-rm-act': 'in', text: t('rmSignIn') })]));
  }
  renderLog();
  renderChips();
  renderNote();
  counter();
  busyUI();
}

function bubble(m, i) {
  const mine = m.role === 'user';
  const b = el('div', { class: 'rm-msg ' + (mine ? 'rm-me' : 'rm-bot') + (m.err ? ' rm-errmsg' : '') });
  if (mine) {
    b.append(el('span', { class: 'rm-sr', text: t('rmMine') + ': ' }));
    const p = el('p', { dir: 'auto' }); String(m.content).split('\n').forEach((l, k) => { if (k) p.append(el('br')); p.append(l); }); b.append(p);
  } else {
    b.append(el('span', { class: 'rm-sr', text: t('rmName') + ': ' }));
    const body = el('div', { class: 'rm-md' }); body.append(render(m.content)); b.append(body);
    if (m.pending && !m.content) b.append(dots());
    if (m.stopped) b.append(el('span', { class: 'rm-tag', text: t('rmStopped') }));
    if (m.cut) b.append(el('span', { class: 'rm-tag', text: t('rmErrCut') }));
  }
  b.dataset.i = i;
  return b;
}
const dots = () => el('span', { class: 'rm-dots', role: 'img', 'aria-label': t('rmTyping') }, [el('i'), el('i'), el('i')]);
function renderLog() {
  const U = R.ui;
  const kids = [];
  if (signedIn() || R.msgs.length) {
    const hello = el('div', { class: 'rm-msg rm-bot rm-hello' }, [el('span', { class: 'rm-sr', text: t('rmName') + ': ' }), el('div', { class: 'rm-md' }, render(t('rmHello')))]);
    kids.push(hello);
  }
  R.msgs.forEach((m, i) => kids.push(bubble(m, i)));
  U.log.replaceChildren(...kids);
  U.log.hidden = !signedIn();
  scrollEnd(true);
}
// streaming: only the last bubble changes
let raf = 0;
function paintLast() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const U = R.ui, i = R.msgs.length - 1, m = R.msgs[i];
    if (!m) return;
    const old = U.log.querySelector(`.rm-msg[data-i="${i}"]`);
    const nb = bubble(m, i);
    if (old) old.replaceWith(nb); else U.log.append(nb);
    scrollEnd(false);
  });
}
function scrollEnd(force) {
  const L = R.ui.log; if (!L) return;
  const near = L.scrollHeight - L.scrollTop - L.clientHeight < 120;
  if (force || near) L.scrollTop = L.scrollHeight;
}
function renderChips() {
  const U = R.ui; if (!U.chips) return;
  const show = signedIn() && !R.msgs.length && !R.busy;
  U.chips.hidden = !show;
  if (!show) { U.chips.replaceChildren(); return; }
  U.chips.replaceChildren(...suggestions().map(k => el('button', { type: 'button', class: 'rm-chip', 'data-rm-act': 'chip', 'data-q': t(k), text: t(k) })));
}
function renderNote() {
  const U = R.ui, n = R.note;
  let content = null;
  if (n) {
    const box = el('div', { class: 'rm-md' }); box.append(render(n.md != null ? n.md : t(n.key, n.v)));
    content = [box];
    if (n.retry) content.push(el('button', { type: 'button', class: 'rm-retry', 'data-rm-act': 'retry' }, [svg(IC.retry), el('span', { text: t('rmRetry') })]));
    if (n.auth) content.push(el('button', { type: 'button', class: 'rm-retry', 'data-rm-act': 'in' }, el('span', { text: t('rmSignIn') })));
    U.note.className = 'rm-note ' + (n.kind === 'err' ? 'rm-note-err' : 'rm-note-info');
    U.note.setAttribute('role', n.kind === 'err' ? 'alert' : 'status');
  } else if (signedIn() && R.left === 0 && R.limit != null) {
    const box = el('div', { class: 'rm-md' }); box.append(render(t('rmErrQuota')));
    content = [box];
    U.note.className = 'rm-note rm-note-info';
    U.note.setAttribute('role', 'status');
  } else if (signedIn() && R.left != null && R.limit != null && R.left <= Math.min(5, Math.ceil(R.limit / 5))) {
    content = [el('span', { text: R.left === 1 ? t('rmLeft1') : t('rmLeft', { n: String(R.left) }) })];
    U.note.className = 'rm-note rm-note-info';
    U.note.setAttribute('role', 'status');
  }
  U.note.hidden = !content || !signedIn();
  if (content) U.note.replaceChildren(...content); else U.note.replaceChildren();
}
function counter() {
  const U = R.ui; if (!U.count) return;
  const n = U.ta.value.length;
  U.count.textContent = n > MAX * 0.8 ? t('rmChars', { n: String(n), max: String(MAX) }) : '';
  U.count.classList.toggle('over', n >= MAX);
  U.send.disabled = R.busy || !U.ta.value.trim();
}
// typed text picks its own direction; the empty field (placeholder) follows the page
function taDir() { const ta = R.ui.ta; ta.dir = ta.value.trim() ? 'auto' : (document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'); }
function autosize() {
  const ta = R.ui.ta; ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}
function busyUI() {
  const U = R.ui; if (!U.stop) return;
  U.stop.hidden = !R.busy; U.send.hidden = R.busy;
  U.newBtn.disabled = R.busy;
  counter();
}
function trap(e) {
  const f = [...R.ui.panel.querySelectorAll('button:not([disabled]):not([hidden]),textarea:not([disabled]),a[href],[tabindex="0"]')].filter(x => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ---------- open / close ---------- */
let lastFocus = null;
function toggle() { R.open ? closePanel(true) : openPanel(); }
function openPanel() {
  build();
  hideTeaser();
  const U = R.ui;
  lastFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : U.fab;
  R.open = true; U.panel.hidden = false; U.root.classList.add('open');
  U.fab.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.toggle('rm-sheet', mobile());
  renderAll();
  refreshStatus();
  requestAnimationFrame(() => {
    scrollEnd(true);
    const target = signedIn() ? U.ta : U.gate.querySelector('button');
    (target || U.panel).focus({ preventScroll: true });
  });
}
function closePanel(restore) {
  if (!R.open) return;
  const U = R.ui;
  R.open = false; U.panel.hidden = true; U.root.classList.remove('open');
  U.fab.setAttribute('aria-expanded', 'false');
  document.documentElement.classList.remove('rm-sheet');
  if (restore) { const f = lastFocus && document.contains(lastFocus) && lastFocus.offsetParent !== null ? lastFocus : U.fab; f.focus({ preventScroll: true }); }
}
function newChat() {
  if (R.busy) return;
  R.msgs = []; R.note = null; save();
  renderAll();
  R.ui.ta.value = ''; taDir(); autosize(); counter();
  R.ui.ta.focus({ preventScroll: true });
}

/* ---------- the one-time hello bubble ---------- */
function showTeaser() {
  if (lsGet(LS_SEEN) || R.open || !R.built) return;
  if (document.querySelector('.wl')) { setTimeout(showTeaser, 4000); return; }   // the first-visit language picker is up
  lsSet(LS_SEEN, '1');
  R.ui.teaser.hidden = false; R.ui.root.classList.add('hello');
  if (!reduced()) R.ui.fab.classList.add('rm-wiggle');
  setTimeout(() => R.ui.fab.classList.remove('rm-wiggle'), 2600);
  setTimeout(hideTeaser, 14000);
}
function hideTeaser() {
  if (!R.built) return;
  R.ui.teaser.hidden = true; R.ui.root.classList.remove('hello'); lsSet(LS_SEEN, '1');
}

/* ---------- keep clear of the Discover player bar / Deezer full-song bar / toasts ---------- */
function updLift() {
  if (!R.built) return;
  let lift = 0;
  const fb = $('#fullbar'); if (fb && !fb.hidden) lift = Math.max(lift, fb.offsetHeight);
  const dp = $('#dPlayer'); if (dp && !dp.hidden) lift = Math.max(lift, dp.offsetHeight);
  const f = R.ui.fab.getBoundingClientRect(), H = window.innerHeight;
  document.querySelectorAll('.toast,.djnote').forEach(n => {
    if (n.hidden || !n.offsetParent) return;
    const r = n.getBoundingClientRect();
    if (r.width && r.bottom > H - 90 && r.left < f.right + 8 && r.right > f.left - 8) lift = Math.max(lift, Math.round(H - r.top + 12 - 16));
  });
  R.ui.root.style.setProperty('--rm-lift', lift + 'px');
}
function watchBottom() {
  const mo = new MutationObserver(() => requestAnimationFrame(updLift));
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const fb = $('#fullbar'); if (fb) mo.observe(fb, { attributes: true, attributeFilter: ['hidden'] });
  if (window.ResizeObserver) { const ro = new ResizeObserver(updLift); if (fb) ro.observe(fb); R.ro = ro; }
  // the Discover player bar is built on first use
  const hookDp = () => { const dp = $('#dPlayer'); if (dp && !dp._rm) { dp._rm = 1; mo.observe(dp, { attributes: true, attributeFilter: ['hidden'] }); if (R.ro) R.ro.observe(dp); } };
  new MutationObserver(() => { hookDp(); }).observe(document.body, { childList: true });
  hookDp();
  document.addEventListener('animationstart', e => { if (e.target.classList && (e.target.classList.contains('toast') || e.target.classList.contains('djnote'))) updLift(); }, true);
  document.addEventListener('animationend', () => requestAnimationFrame(updLift), true);
  window.addEventListener('resize', () => { updLift(); if (R.open) document.documentElement.classList.toggle('rm-sheet', mobile()); });
  updLift();
}

/* ---------- talking to the server ---------- */
function history() {
  // the server takes ≤ 24 messages of ≤ 2000 chars and ≤ 32 KB; long answers are shortened, old turns dropped
  let list = R.msgs.filter(m => !m.err && m.content && m.content.trim()).map(m => ({ role: m.role, content: m.content.length > MAX ? m.content.slice(0, MAX - 1) + '…' : m.content }));
  // a question that never got an answer (error, stopped before any text) is not resent — only the latest one
  list = list.filter((m, i) => !(m.role === 'user' && list[i + 1] && list[i + 1].role === 'user'));
  list = list.slice(-HIST);
  while (list.length && list[0].role !== 'user') list.shift();
  const enc = new TextEncoder();
  let body;
  for (;;) {
    body = JSON.stringify({ messages: list, lang: lang(), ctx: ctx() });
    if (enc.encode(body).length <= BODY_MAX || list.length <= 1) break;
    list.shift(); while (list.length > 1 && list[0].role !== 'user') list.shift();
  }
  return body;
}
async function refreshStatus() {
  if (!signedIn() || !Backend.assistantStatus) return;
  try {
    const s = await Backend.assistantStatus();
    if (s && s.ok) { R.left = Number.isInteger(s.left) ? s.left : null; R.limit = Number.isInteger(s.limit) ? s.limit : null; if (R.left === 0 && !R.busy) R.note = { kind: 'err', key: 'rmErrQuota' }; }
    else if (s && s.why === 'off') R.note = { kind: 'info', key: 'rmErrOff' };
    else if (s && s.why === 'blocked') R.note = { kind: 'err', key: 'rmErrBlocked' };
    renderNote();
  } catch (e) {}
}
const ERR = { quota: 'rmErrQuota', slow: 'rmErrSlow', blocked: 'rmErrBlocked', off: 'rmErrOff', not_configured: 'rmErrCfg', busy: 'rmErrBusy', auth: 'rmErrAuth' };

async function send(text) {
  const U = R.ui;
  text = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!text || R.busy) return;
  if (!signedIn()) { renderAll(); return; }
  if (text.length > MAX) { R.note = { kind: 'err', key: 'rmLong', v: { max: String(MAX) } }; renderNote(); return; }
  R.note = null;
  R.msgs.push({ role: 'user', content: text });
  U.ta.value = ''; taDir(); autosize();
  save();
  await ask();
}
function retry() {
  if (R.busy) return;
  // drop a failed / cut answer, then ask again for the last question
  while (R.msgs.length && R.msgs[R.msgs.length - 1].role === 'assistant') R.msgs.pop();
  if (!R.msgs.length) return;
  R.note = null; save();
  ask();
}
function stopStream() { if (R.ac) { R.stopped = true; R.ac.abort(); } }

async function ask() {
  const U = R.ui;
  const bot = { role: 'assistant', content: '', pending: true };
  R.msgs.push(bot);
  R.busy = true; R.stopped = false;
  renderLog(); renderChips(); renderNote(); busyUI();
  U.live.textContent = t('rmTyping');
  const ac = new AbortController(); R.ac = ac;
  let fail = null, got = false, finished = false;
  try {
    const tok = Backend.accessToken ? await Backend.accessToken() : null;
    if (!tok) { fail = { key: 'rmErrAuth', auth: true }; throw 0; }
    const body = history();
    let res;
    try {
      res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body, signal: ac.signal, credentials: 'omit', cache: 'no-store' });
    } catch (e) { if (!R.stopped) fail = { key: 'rmErrNet', retry: true }; throw 0; }
    if (!res.ok || !res.body) {
      let j = {}; try { j = await res.json(); } catch (e) {}
      const code = j && j.error;
      if (res.status === 404 || res.status === 405 || res.status === 501) fail = { key: 'rmErrCfg' };      // no Function here (local dev)
      else if (code === 'quota') { R.left = 0; if (Number.isInteger(j.limit)) R.limit = j.limit; fail = { key: 'rmErrQuota' }; }
      else if (code === 'auth') fail = { key: 'rmErrAuth', auth: true };
      else if (ERR[code]) fail = { key: ERR[code], retry: code === 'busy' || code === 'slow' };
      else fail = { key: 'rmErrGen', retry: true };
      throw 0;
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      let chunk;
      try { chunk = await reader.read(); } catch (e) { if (!R.stopped) fail = { key: 'rmErrNet', retry: true, cut: got }; break; }
      if (chunk.done) break;
      buf += dec.decode(chunk.value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let o; try { o = JSON.parse(line); } catch (e) { continue; }
        if (typeof o.t === 'string') { bot.content += o.t; got = true; paintLast(); }
        else if (o.done) { finished = true; if (o.stop === 'max_tokens') bot.cut = true; }
        else if (o.error) { fail = { key: ERR[o.error] || 'rmErrCut', retry: true, cut: got }; }
        else if ('left' in o) { R.left = Number.isInteger(o.left) ? o.left : null; R.limit = Number.isInteger(o.limit) ? o.limit : null; }
      }
    }
    if (!finished && !fail && !R.stopped) fail = { key: 'rmErrCut', retry: true, cut: got };
  } catch (e) { /* fail is set */ }
  R.ac = null; R.busy = false;
  bot.pending = false;
  if (R.stopped) { bot.stopped = true; fail = null; }
  if (fail) {
    if (got) bot.cut = true;
    else R.msgs.pop();                                  // nothing arrived: no empty bubble
    R.note = { kind: 'err', key: fail.key, retry: !!fail.retry, auth: !!fail.auth };
  }
  if (!bot.content && !fail && R.stopped) R.msgs.pop();
  save();
  renderLog(); renderChips(); renderNote(); busyUI();
  U.live.textContent = bot.content && R.msgs.includes(bot) ? t('rmName') + ': ' + bot.content.replace(/[*_`#]/g, '') : (fail ? t(fail.key).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') : '');
  if (R.open && !mobile()) U.ta.focus({ preventScroll: true });
}

/* ---------- account / language changes ---------- */
function setUser(uid) {
  const changed = uid !== R.uid;
  if (!changed) return;
  if (R.ac) { R.stopped = true; R.ac.abort(); }
  if (R.uid) { try { sessionStorage.removeItem(ssKey()); } catch (e) {} }
  if (!uid) dropAll();
  R.uid = uid || null; R.left = null; R.limit = null; R.note = null;
  load();
  if (R.built) { renderAll(); if (R.open) refreshStatus(); }
}
document.addEventListener('cr-user', e => setUser(e.detail && e.detail.uid));
new MutationObserver(() => applyLang()).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
// views switch without a hashchange (history.replaceState): refresh the suggestions when the panel is open
document.addEventListener('click', e => { if (R.open && e.target.closest && e.target.closest('#navTabs,.top')) setTimeout(renderChips, 50); }, true);

/* ---------- boot ---------- */
function boot() {
  build();
  const u = CR.user && CR.user();
  if (u && u.known) setUser(u.uid);
  setTimeout(showTeaser, 6000);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

window.ROOMY = { open: openPanel, close: () => closePanel(true), _R: R, _render: render };   // for tests
})();
