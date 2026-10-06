/* Chord Room — reviews & testimonials, REAL ones only (growth). window.REVIEWS
   · Prompt: after 3 successful exports (logAct export / separate / mashup_export / extended_export / crate_export / convert)
     a signed-in member who has no review yet sees a small dismissible card, at most once every 30 days
     (localStorage chordroom.rev.v1:<uid> = {n, last, done}).
   · Dialog #rvDlg: 1–5 stars (radio group), ≤ 400 characters, "show my display name" (off = initials). The server
     (review_submit in schema.sql [growth-v4]) checks: confirmed member who used the site, no links, offensive words,
     ≤ 5 saves a day; every save goes back to moderation.
   · Home: PAGES.afterAbout → approved reviews (featured first) + the average, only when there is at least one; never
     seeded or invented. JSON-LD AggregateRating (WebApplication) only with ≥ 5 approved reviews; injected as a data block
     (type application/ld+json is not executed, so the strict CSP does not apply to it; Google renders it from JS).
   · Admin tab "Reviews" (#admReviews, 'catalog' permission): approve / hide / feature. */
(function () {
'use strict';
const CR = window.CR; if (!CR) return;
const EXPORTS = { export: 1, separate: 1, mashup_export: 1, extended_export: 1, crate_export: 1, convert: 1 };
const DAY = 864e5;

const T = {
he: { askT: 'איך Chord Room עובד בשבילך?', askP: 'נשמח לביקורת קצרה — היא עוזרת למוזיקאים אחרים להחליט.', askRate: 'כתיבת ביקורת', askLater: 'לא עכשיו', close: 'סגירה',
  dlgT: 'הביקורת שלך', rating: 'דירוג', star1: 'כוכב אחד', starN: '{n} כוכבים', body: 'במה Chord Room עזר לך? (לא חובה)', count: '{n}/400',
  showName: 'להציג את שם התצוגה שלי ליד הביקורת', showNameH: 'אחרת יוצגו רק ראשי התיבות.',
  note: 'רק משתמשים רשומים שהשתמשו בכלים יכולים לכתוב ביקורת. כל ביקורת נבדקת לפני פרסום. אנחנו לא ממציאים ביקורות ולא נותנים תמורה על ביקורת.',
  submit: 'שליחה', del: 'מחיקת הביקורת שלי', cancel: 'ביטול', stPending: 'ממתינה לאישור', stApproved: 'פורסמה', stHidden: 'לא פורסמה', yours: 'הביקורת הקיימת שלך: {s}',
  e_not_eligible: 'אפשר לכתוב ביקורת אחרי שמשתמשים באתר — למשל אחרי ייצוא או הפרדה ראשונה — ועם אימייל מאומת.', e_offensive: 'הביקורת כוללת מילים פוגעניות. נסחו אותה מחדש, בבקשה.',
  e_links: 'בלי קישורים בביקורת, בבקשה.', e_rate: 'הגעת למספר העריכות המרבי להיום. נסו שוב מחר.', e_too_long: 'עד 400 תווים.', e_bad_rating: 'בחרו דירוג בין כוכב אחד לחמישה.',
  e_blocked: 'החשבון חסום.', e_auth: 'צריך להתחבר כדי לכתוב ביקורת.', e_generic: 'לא הצלחנו לשמור. נסו שוב.', thanks: 'תודה! הביקורת תופיע אחרי בדיקה קצרה.', deleted: 'הביקורת נמחקה.',
  hEb: 'ביקורות', hH: 'מה אומרים המשתמשים', hAvg: 'דירוג ממוצע {a} מתוך 5', hCount: '{n} ביקורות', hCount1: 'ביקורת אחת', hWrite: 'כתבו ביקורת', hNote: 'ביקורות אמיתיות של משתמשים רשומים בלבד, אחרי בדיקה.',
  aT: 'ביקורות משתמשים', aAll: 'הכול', aPending: 'ממתינות', aApproved: 'פורסמו', aHidden: 'מוסתרות', aApprove: 'אישור', aHide: 'הסתרה', aFeature: 'הצגה בדף הבית', aUnfeature: 'הסרה מדף הבית',
  aEmpty: 'אין ביקורות.', aName: 'שם גלוי', aInit: 'ראשי תיבות', aRefresh: 'רענון', aFeatured: 'בדף הבית', aFail: 'הפעולה נכשלה' },
en: { askT: 'How is Chord Room working for you?', askP: 'A short review would mean a lot — it helps other musicians decide.', askRate: 'Write a review', askLater: 'Not now', close: 'Close',
  dlgT: 'Your review', rating: 'Rating', star1: '1 star', starN: '{n} stars', body: 'How did Chord Room help you? (optional)', count: '{n}/400',
  showName: 'Show my display name next to the review', showNameH: 'Otherwise only your initials are shown.',
  note: 'Only registered members who have used the tools can write a review. Every review is checked before it’s published. We never invent reviews or give anything in return for one.',
  submit: 'Send', del: 'Delete my review', cancel: 'Cancel', stPending: 'waiting for approval', stApproved: 'published', stHidden: 'not published', yours: 'Your current review: {s}',
  e_not_eligible: 'You can review once you’ve used the site — for example after your first export or separation — with a confirmed email.', e_offensive: 'The review contains offensive words. Please rephrase it.',
  e_links: 'Please don’t include links in the review.', e_rate: 'You’ve reached today’s edit limit. Try again tomorrow.', e_too_long: 'Up to 400 characters.', e_bad_rating: 'Choose a rating from 1 to 5 stars.',
  e_blocked: 'This account is blocked.', e_auth: 'Sign in to write a review.', e_generic: 'Could not save. Please try again.', thanks: 'Thanks! Your review will appear after a short check.', deleted: 'Your review was deleted.',
  hEb: 'Reviews', hH: 'What members say', hAvg: 'Average rating {a} out of 5', hCount: '{n} reviews', hCount1: '1 review', hWrite: 'Write a review', hNote: 'Real reviews from registered members only, checked before publishing.',
  aT: 'Member reviews', aAll: 'All', aPending: 'Pending', aApproved: 'Published', aHidden: 'Hidden', aApprove: 'Approve', aHide: 'Hide', aFeature: 'Show on home', aUnfeature: 'Remove from home',
  aEmpty: 'No reviews.', aName: 'name shown', aInit: 'initials', aRefresh: 'Refresh', aFeatured: 'on home', aFail: 'Action failed' },
ar: { askT: 'كيف يعمل Chord Room معك؟', askP: 'يسعدنا تقييم قصير — فهو يساعد موسيقيين آخرين على القرار.', askRate: 'كتابة تقييم', askLater: 'ليس الآن', close: 'إغلاق',
  dlgT: 'تقييمك', rating: 'التقييم', star1: 'نجمة واحدة', starN: '{n} نجوم', body: 'كيف ساعدك Chord Room؟ (اختياري)', count: '{n}/400',
  showName: 'إظهار اسم العرض الخاص بي بجانب التقييم', showNameH: 'وإلا تُعرض الأحرف الأولى فقط.',
  note: 'يمكن فقط للأعضاء المسجّلين الذين استخدموا الأدوات كتابة تقييم. يُراجَع كل تقييم قبل نشره. لا نختلق تقييمات ولا نقدّم مقابلًا لها.',
  submit: 'إرسال', del: 'حذف تقييمي', cancel: 'إلغاء', stPending: 'بانتظار الموافقة', stApproved: 'منشور', stHidden: 'غير منشور', yours: 'تقييمك الحالي: {s}',
  e_not_eligible: 'يمكنك التقييم بعد استخدام الموقع — مثلًا بعد أول تصدير أو فصل — وببريد إلكتروني مؤكَّد.', e_offensive: 'يحتوي التقييم على كلمات مسيئة. يُرجى إعادة صياغته.',
  e_links: 'يُرجى عدم إضافة روابط إلى التقييم.', e_rate: 'وصلت إلى حد التعديلات لهذا اليوم. حاول غدًا.', e_too_long: 'حتى 400 حرف.', e_bad_rating: 'اختر تقييمًا من نجمة إلى خمس نجوم.',
  e_blocked: 'هذا الحساب محظور.', e_auth: 'سجّل الدخول لكتابة تقييم.', e_generic: 'تعذّر الحفظ. حاول مرة أخرى.', thanks: 'شكرًا! سيظهر تقييمك بعد مراجعة قصيرة.', deleted: 'تم حذف تقييمك.',
  hEb: 'التقييمات', hH: 'ماذا يقول الأعضاء', hAvg: 'متوسط التقييم {a} من 5', hCount: '{n} تقييمات', hCount1: 'تقييم واحد', hWrite: 'اكتب تقييمًا', hNote: 'تقييمات حقيقية من أعضاء مسجّلين فقط، تُراجَع قبل النشر.',
  aT: 'تقييمات الأعضاء', aAll: 'الكل', aPending: 'بانتظار', aApproved: 'منشورة', aHidden: 'مخفية', aApprove: 'موافقة', aHide: 'إخفاء', aFeature: 'عرض في الصفحة الرئيسية', aUnfeature: 'إزالة من الرئيسية',
  aEmpty: 'لا توجد تقييمات.', aName: 'الاسم ظاهر', aInit: 'أحرف أولى', aRefresh: 'تحديث', aFeatured: 'في الرئيسية', aFail: 'فشل الإجراء' },
ru: { askT: 'Как вам Chord Room?', askP: 'Будем рады короткому отзыву — он помогает другим музыкантам решить.', askRate: 'Написать отзыв', askLater: 'Не сейчас', close: 'Закрыть',
  dlgT: 'Ваш отзыв', rating: 'Оценка', star1: '1 звезда', starN: 'Звёзд: {n}', body: 'Чем вам помог Chord Room? (необязательно)', count: '{n}/400',
  showName: 'Показывать моё отображаемое имя рядом с отзывом', showNameH: 'Иначе будут показаны только инициалы.',
  note: 'Писать отзывы могут только зарегистрированные пользователи, которые пользовались инструментами. Каждый отзыв проверяется перед публикацией. Мы не придумываем отзывы и ничего не даём за них.',
  submit: 'Отправить', del: 'Удалить мой отзыв', cancel: 'Отмена', stPending: 'ждёт проверки', stApproved: 'опубликован', stHidden: 'не опубликован', yours: 'Ваш текущий отзыв: {s}',
  e_not_eligible: 'Оставить отзыв можно после использования сайта — например, после первого экспорта или разделения — и с подтверждённым e-mail.', e_offensive: 'В отзыве есть оскорбительные слова. Пожалуйста, перефразируйте.',
  e_links: 'Пожалуйста, без ссылок в отзыве.', e_rate: 'Достигнут лимит правок на сегодня. Попробуйте завтра.', e_too_long: 'Не более 400 символов.', e_bad_rating: 'Выберите оценку от 1 до 5 звёзд.',
  e_blocked: 'Аккаунт заблокирован.', e_auth: 'Войдите, чтобы написать отзыв.', e_generic: 'Не удалось сохранить. Попробуйте ещё раз.', thanks: 'Спасибо! Отзыв появится после короткой проверки.', deleted: 'Ваш отзыв удалён.',
  hEb: 'Отзывы', hH: 'Что говорят пользователи', hAvg: 'Средняя оценка {a} из 5', hCount: 'Отзывов: {n}', hCount1: '1 отзыв', hWrite: 'Написать отзыв', hNote: 'Только настоящие отзывы зарегистрированных пользователей, после проверки.',
  aT: 'Отзывы пользователей', aAll: 'Все', aPending: 'Ждут', aApproved: 'Опубликованы', aHidden: 'Скрыты', aApprove: 'Одобрить', aHide: 'Скрыть', aFeature: 'Показать на главной', aUnfeature: 'Убрать с главной',
  aEmpty: 'Отзывов нет.', aName: 'имя видно', aInit: 'инициалы', aRefresh: 'Обновить', aFeatured: 'на главной', aFail: 'Действие не выполнено' },
es: { askT: '¿Qué tal te funciona Chord Room?', askP: 'Nos encantaría una reseña breve: ayuda a otros músicos a decidir.', askRate: 'Escribir una reseña', askLater: 'Ahora no', close: 'Cerrar',
  dlgT: 'Tu reseña', rating: 'Valoración', star1: '1 estrella', starN: '{n} estrellas', body: '¿En qué te ayudó Chord Room? (opcional)', count: '{n}/400',
  showName: 'Mostrar mi nombre visible junto a la reseña', showNameH: 'Si no, solo se muestran tus iniciales.',
  note: 'Solo los miembros registrados que han usado las herramientas pueden escribir una reseña. Cada reseña se revisa antes de publicarse. Nunca inventamos reseñas ni damos nada a cambio de ellas.',
  submit: 'Enviar', del: 'Borrar mi reseña', cancel: 'Cancelar', stPending: 'pendiente de aprobación', stApproved: 'publicada', stHidden: 'no publicada', yours: 'Tu reseña actual: {s}',
  e_not_eligible: 'Puedes reseñar después de usar el sitio —por ejemplo tras tu primera exportación o separación— y con el correo confirmado.', e_offensive: 'La reseña contiene palabras ofensivas. Por favor, reformúlala.',
  e_links: 'Por favor, no incluyas enlaces en la reseña.', e_rate: 'Alcanzaste el límite de ediciones de hoy. Inténtalo mañana.', e_too_long: 'Hasta 400 caracteres.', e_bad_rating: 'Elige una valoración de 1 a 5 estrellas.',
  e_blocked: 'Esta cuenta está bloqueada.', e_auth: 'Inicia sesión para escribir una reseña.', e_generic: 'No se pudo guardar. Inténtalo de nuevo.', thanks: '¡Gracias! Tu reseña aparecerá tras una breve revisión.', deleted: 'Tu reseña se borró.',
  hEb: 'Reseñas', hH: 'Lo que dicen los miembros', hAvg: 'Valoración media {a} de 5', hCount: '{n} reseñas', hCount1: '1 reseña', hWrite: 'Escribir una reseña', hNote: 'Solo reseñas reales de miembros registrados, revisadas antes de publicarse.',
  aT: 'Reseñas de miembros', aAll: 'Todas', aPending: 'Pendientes', aApproved: 'Publicadas', aHidden: 'Ocultas', aApprove: 'Aprobar', aHide: 'Ocultar', aFeature: 'Mostrar en inicio', aUnfeature: 'Quitar de inicio',
  aEmpty: 'No hay reseñas.', aName: 'nombre visible', aInit: 'iniciales', aRefresh: 'Actualizar', aFeatured: 'en inicio', aFail: 'La acción falló' }
};
const L = () => { const l = (document.documentElement.lang || 'he').slice(0, 2).toLowerCase(); return T[l] ? l : 'en'; };
const t = (k, v) => { let s = T[L()][k] != null ? T[L()][k] : T.en[k]; if (v) s = String(s).replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m)); return s; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const B = () => window.Backend || {};
const uid = () => { const u = CR.user && CR.user(); return u && u.uid; };
const signedIn = () => !!(CR.signedIn && CR.signedIn());
const num = (n, d) => { try { return new Intl.NumberFormat(L() === 'ar' ? 'ar-u-nu-latn' : L(), { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 }).format(n); } catch (e) { return String(n); } };
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>';
const stars = n => '<span class="rv-stars" aria-hidden="true">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= Math.round(n) ? 'on' : '') + '">' + STAR + '</i>').join('') + '</span>';
const starLabel = n => (n === 1 ? t('star1') : t('starN', { n }));

/* ---------- prompt after 3 exports (max once per 30 days) ---------- */
const lsk = () => 'chordroom.rev.v1:' + (uid() || 'guest');
function st() { try { const o = JSON.parse(localStorage.getItem(lsk()) || 'null'); if (o && typeof o === 'object') return { n: +o.n || 0, last: +o.last || 0, done: !!o.done }; } catch (e) {} return { n: 0, last: 0, done: false }; }
function save(o) { try { localStorage.setItem(lsk(), JSON.stringify(o)); } catch (e) {} }
let mine = { for: null, r: undefined };
async function myReview() {
  const u = uid(); if (!u || !B().myReview) return null;
  if (mine.for === u && mine.r !== undefined) return mine.r;
  try { mine = { for: u, r: await B().myReview() || null }; } catch (e) { mine = { for: u, r: null }; }
  return mine.r;
}
document.addEventListener('cr-user', () => { mine = { for: null, r: undefined }; });
document.addEventListener('cr-act', e => {
  const a = e.detail && e.detail.action;
  if (!EXPORTS[a] || !signedIn()) return;
  const o = st(); o.n++; save(o);
  maybeAsk();
});
async function maybeAsk() {
  const o = st();
  if (o.done || o.n < 3 || Date.now() - o.last < 30 * DAY || !signedIn() || !B().reviewSubmit) return;
  if (await myReview()) { o.done = true; save(o); return; }
  setTimeout(showAsk, 1500);
}
function showAsk() {
  if ($('#rvAsk') || ($('#rvDlg') && !$('#rvDlg').hidden)) return;
  const o = st(); o.last = Date.now(); save(o);
  const d = document.createElement('div'); d.id = 'rvAsk'; d.className = 'rv-ask'; d.setAttribute('role', 'region'); d.setAttribute('aria-labelledby', 'rvAskT');
  d.innerHTML = '<div class="rv-askt"><b id="rvAskT">' + esc(t('askT')) + '</b><p>' + esc(t('askP')) + '</p></div>' +
    '<div class="rv-aska"><button type="button" class="btn solid" data-rv="write">' + esc(t('askRate')) + '</button><button type="button" class="btn ghost" data-rv="later">' + esc(t('askLater')) + '</button></div>' +
    '<button type="button" class="rv-x" data-rv="later" aria-label="' + esc(t('close')) + '">×</button>';
  document.body.appendChild(d);
}
function hideAsk() { const d = $('#rvAsk'); if (d) d.remove(); }

/* ---------- dialog ---------- */
let lastFocus = null, cur = { rating: 0 };
async function openDlg() {
  hideAsk();
  if (!signedIn()) { try { CR.toast(t('e_auth')); } catch (e) {} return; }
  lastFocus = document.activeElement;
  let w = $('#rvDlg');
  if (!w) {
    w = document.createElement('div'); w.className = 'dlgwrap rvd'; w.id = 'rvDlg'; w.hidden = true; document.body.appendChild(w);
    w.addEventListener('mousedown', e => { if (e.target === w) closeDlg(); });
    w.addEventListener('keydown', onKey);
    w.addEventListener('input', e => { if (e.target.id === 'rvBody') $('#rvCount').textContent = t('count', { n: e.target.value.length }); });
  }
  const r = await myReview();
  cur = { rating: r ? +r.rating || 0 : 0 };
  const stName = r ? ({ pending: t('stPending'), approved: t('stApproved'), hidden: t('stHidden') }[r.status] || '') : '';
  w.innerHTML = '<div class="dlg rvdlg" role="dialog" aria-modal="true" aria-labelledby="rvDH"><div class="dh"><h3 id="rvDH">' + esc(t('dlgT')) + '</h3>' +
    '<button type="button" class="x" data-rv="close" aria-label="' + esc(t('close')) + '">×</button></div>' +
    (r ? '<p class="snote">' + esc(t('yours', { s: stName })) + '</p>' : '') +
    '<div class="rv-rate" role="radiogroup" aria-labelledby="rvRateL"><span id="rvRateL" class="rv-l">' + esc(t('rating')) + '</span><span class="rv-sw" dir="ltr">' +
    [1, 2, 3, 4, 5].map(i => '<button type="button" role="radio" class="rv-s" data-n="' + i + '" aria-label="' + esc(starLabel(i)) + '" aria-checked="' + (i === cur.rating) + '" tabindex="' + ((cur.rating ? i === cur.rating : i === 1) ? 0 : -1) + '">' + STAR + '</button>').join('') + '</span></div>' +
    '<label class="rv-l" for="rvBody">' + esc(t('body')) + '</label><textarea id="rvBody" maxlength="400" rows="4">' + esc(r ? r.body : '') + '</textarea>' +
    '<span class="snote rv-count" id="rvCount" dir="ltr">' + esc(t('count', { n: r ? String(r.body || '').length : 0 })) + '</span>' +
    '<label class="rv-chk"><input type="checkbox" id="rvShow"' + (r && r.show_name ? ' checked' : '') + '><span>' + esc(t('showName')) + '<small>' + esc(t('showNameH')) + '</small></span></label>' +
    '<p class="snote rv-note">' + esc(t('note')) + '</p><p class="rv-msg" id="rvMsg" role="alert"></p>' +
    '<div class="rv-act"><button type="button" class="btn solid" data-rv="send">' + esc(t('submit')) + '</button><button type="button" class="btn ghost" data-rv="close">' + esc(t('cancel')) + '</button>' +
    (r ? '<button type="button" class="btn ghost rv-del" data-rv="del">' + esc(t('del')) + '</button>' : '') + '</div></div>';
  paintStars(); w.hidden = false;
  setTimeout(() => { const f = w.querySelector('.rv-s[tabindex="0"]'); if (f) f.focus(); }, 30);
}
function paintStars() { document.querySelectorAll('#rvDlg .rv-s').forEach(b => { const n = +b.dataset.n; b.classList.toggle('on', n <= cur.rating); b.setAttribute('aria-checked', String(n === cur.rating)); b.tabIndex = (cur.rating ? n === cur.rating : n === 1) ? 0 : -1; }); }
function onKey(e) {
  const w = $('#rvDlg');
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDlg(); return; }
  const s = e.target.closest && e.target.closest('.rv-s');
  if (s && /^Arrow/.test(e.key)) {
    e.preventDefault(); const rtl = getComputedStyle(s.parentElement).direction === 'rtl';
    const up = e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    cur.rating = Math.max(1, Math.min(5, (cur.rating || +s.dataset.n) + (up ? 1 : -1) * (cur.rating ? 1 : 0))); paintStars();
    const f = w.querySelector('.rv-s[data-n="' + cur.rating + '"]'); if (f) f.focus(); return;
  }
  if (e.key !== 'Tab') return;
  const f = [...w.querySelectorAll('button,textarea,input,a[href]')].filter(x => x.offsetParent !== null && x.tabIndex !== -1), i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
}
function closeDlg() {
  const w = $('#rvDlg'); if (!w || w.hidden) return; w.hidden = true;
  if (lastFocus && document.contains(lastFocus) && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
}
function msg(k) { const m = $('#rvMsg'); if (m) m.textContent = k ? t(k) : ''; }
async function send(btn) {
  if (!cur.rating) { msg('e_bad_rating'); return; }
  const body = $('#rvBody').value.trim();
  if (body.length > 400) { msg('e_too_long'); return; }
  btn.disabled = true;
  try {
    const r = await B().reviewSubmit({ rating: cur.rating, body, showName: $('#rvShow').checked, lang: L() });
    if (r && r.ok) { mine = { for: uid(), r: { rating: cur.rating, body, show_name: $('#rvShow').checked, status: 'pending' } }; const o = st(); o.done = true; save(o); closeDlg(); try { CR.toast(t('thanks')); } catch (e) {} return; }
    msg('e_' + ((r && T.en['e_' + r.error]) ? r.error : 'generic'));
  } catch (e) { msg('e_generic'); }
  finally { btn.disabled = false; if (document.contains(btn) && !$('#rvDlg').hidden) try { btn.focus({ preventScroll: true }); } catch (e) {} }
}
// Esc closes the dialog even when focus fell out of it (e.g. while the send button was disabled)
document.addEventListener('keydown', e => { const w = $('#rvDlg'); if (e.key === 'Escape' && w && !w.hidden && !w.contains(e.target)) { e.preventDefault(); closeDlg(); } });
async function del(btn) {
  btn.disabled = true;
  try { await B().reviewDelete(); mine = { for: uid(), r: null }; closeDlg(); pub = null; try { CR.toast(t('deleted')); } catch (e) {} loadPub(true); }
  catch (e) { msg('e_generic'); btn.disabled = false; }
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-rv]'); if (!b) {
    const s = e.target.closest && e.target.closest('#rvDlg .rv-s'); if (s) { cur.rating = +s.dataset.n; paintStars(); }
    return;
  }
  const k = b.dataset.rv;
  if (k === 'write') openDlg();
  else if (k === 'later') hideAsk();
  else if (k === 'close') closeDlg();
  else if (k === 'send') send(b);
  else if (k === 'del') del(b);
});

/* ---------- home page: approved reviews + average; JSON-LD from 5 reviews ---------- */
let pub = null, pubP = null;
function loadPub(force) {
  if (!B().reviewsPublic) return Promise.resolve(null);
  if (pub && !force) return Promise.resolve(pub);
  if (pubP && !force) return pubP;
  pubP = B().reviewsPublic(12).then(r => { pub = r && typeof r === 'object' ? r : null; pubP = null; ld(); paintHome(); return pub; }).catch(() => { pubP = null; return null; });
  return pubP;
}
function canon() { const c = document.querySelector('link[rel="canonical"]'); try { return new URL(c ? c.href : location.href).origin; } catch (e) { return location.origin; } }
function ld() {
  let s = document.getElementById('ldRating');
  const n = pub ? +pub.count || 0 : 0, a = pub ? +pub.avg || 0 : 0;
  if (n < 5 || !(a >= 1 && a <= 5)) { if (s) s.remove(); return; }
  if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ldRating'; document.head.appendChild(s); }
  s.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Chord Room', url: canon() + '/',
    applicationCategory: 'MultimediaApplication', operatingSystem: 'Web browser',
    aggregateRating: { '@type': 'AggregateRating', ratingValue: String(Math.round(a * 10) / 10), ratingCount: n, bestRating: '5', worstRating: '1' } }).replace(/</g, '\\u003c');
}
function homeHTML() {
  const n = Math.max(0, Math.floor(+pub.count) || 0), a = Math.min(5, Math.max(0, +pub.avg || 0)), items = (Array.isArray(pub.items) ? pub.items : []).filter(x => x && x.rating >= 1 && x.rating <= 5);
  const feat = items.filter(x => x.featured), show = (feat.length ? feat : items).slice(0, 6);
  return '<div class="pg-sh rv in"><span class="pg-eb">' + esc(t('hEb')) + '</span><h2 class="pg-h" id="pgRevH">' + esc(t('hH')) + '</h2></div>' +
    '<div class="rv-sum"><span class="rv-big" dir="ltr">' + esc(num(Math.round(a * 10) / 10, 1)) + '</span>' + stars(a) +
    '<span class="rv-sumt"><span class="sr-only">' + esc(t('hAvg', { a: num(Math.round(a * 10) / 10, 1) })) + ' · </span>' + esc(n === 1 ? t('hCount1') : t('hCount', { n: num(n) })) + '</span></div>' +
    '<ul class="rv-list">' + show.map(x => '<li class="rv-card"><div class="rv-ch">' + stars(x.rating) + '<span class="sr-only">' + esc(starLabel(+x.rating)) + '</span></div>' +
      (x.body ? '<blockquote dir="auto">' + esc(x.body) + '</blockquote>' : '') + '<p class="rv-who" dir="auto">— ' + esc(x.name || '') + '</p></li>').join('') + '</ul>' +
    '<p class="snote rv-hnote">' + esc(t('hNote')) + (signedIn() ? ' <button type="button" class="lnk" data-rv="write">' + esc(t('hWrite')) + '</button>' : '') + '</p>';
}
function paintHome() {
  const host = document.querySelector('#aboutView .pg-about'); if (!host) return;
  let sec = host.querySelector('#pgReviews');
  if (!pub || !(+pub.count > 0)) { if (sec) sec.remove(); return; }
  if (!sec) {
    sec = document.createElement('section'); sec.className = 'pg-sec pg-rev'; sec.id = 'pgReviews'; sec.setAttribute('aria-labelledby', 'pgRevH');
    const before = host.querySelector('.pg-faq') || host.querySelector('.pg-a11y') || host.querySelector('.pg-foot');
    if (before) host.insertBefore(sec, before); else host.appendChild(sec);
  }
  sec.innerHTML = homeHTML();
}
function afterAbout() { if (pub) paintHome(); loadPub(false); }
function hook() { if (window.PAGES) { const prev = PAGES.afterAbout; PAGES.afterAbout = function (el) { try { if (prev) prev(el); } catch (e) {} afterAbout(); }; } }
hook();
document.addEventListener('cr-user', () => { if (pub) paintHome(); });

/* ---------- admin tab ---------- */
const adm = { list: null, filter: 'pending', busy: false };
function admRow(r) {
  const who = (r.display_name || '').trim() || r.username || '—';
  return '<li class="rv-arow" data-id="' + (+r.id) + '"><div class="rv-ah">' + stars(r.rating) + '<span class="sr-only">' + esc(starLabel(+r.rating)) + '</span>' +
    '<b dir="auto">' + esc(who) + '</b>' + (r.username ? '<span class="mono snote" dir="ltr">@' + esc(r.username) + '</span>' : '') +
    '<span class="pill' + (r.status === 'approved' ? ' ok' : r.status === 'hidden' ? ' bad' : '') + '">' + esc(t({ pending: 'aPending', approved: 'aApproved', hidden: 'aHidden' }[r.status] || 'aPending')) + '</span>' +
    (r.featured ? '<span class="pill adm">' + esc(t('aFeatured')) + '</span>' : '') +
    '<span class="snote">' + esc(r.show_name ? t('aName') : t('aInit')) + (r.lang ? ' · <span dir="ltr">' + esc(r.lang) + '</span>' : '') + '</span></div>' +
    (r.body ? '<p class="rv-ab" dir="auto">' + esc(r.body) + '</p>' : '') +
    '<div class="rv-aa">' + (r.status !== 'approved' ? '<button type="button" class="btn solid" data-ra="approved">' + esc(t('aApprove')) + '</button>' : '') +
    (r.status !== 'hidden' ? '<button type="button" class="btn ghost" data-ra="hidden">' + esc(t('aHide')) + '</button>' : '') +
    (r.status === 'approved' ? '<button type="button" class="btn ghost" data-ra="' + (r.featured ? 'unfeature' : 'feature') + '">' + esc(t(r.featured ? 'aUnfeature' : 'aFeature')) + '</button>' : '') + '</div></li>';
}
function renderAdmin() {
  const el = $('#admReviews'); if (!el) return;
  const f = [['', 'aAll'], ['pending', 'aPending'], ['approved', 'aApproved'], ['hidden', 'aHidden']];
  const list = (adm.list || []).filter(r => !adm.filter || r.status === adm.filter);
  el.innerHTML = '<div class="bhead"><h3>' + esc(t('aT')) + '</h3><div class="row2"><select id="rvFilter" class="sel" aria-label="' + esc(t('aT')) + '">' +
    f.map(([v, k]) => '<option value="' + v + '"' + (v === adm.filter ? ' selected' : '') + '>' + esc(t(k)) + '</option>').join('') + '</select>' +
    '<button type="button" class="btn ghost" id="rvRefresh">' + esc(t('aRefresh')) + '</button><span class="snote" id="rvAMsg" role="status"></span></div></div>' +
    (adm.list == null ? '' : list.length ? '<ul class="rv-alist">' + list.map(admRow).join('') + '</ul>' : '<p class="snote">' + esc(t('aEmpty')) + '</p>');
}
async function loadAdmin() {
  if (!B().adminReviews) return;
  try { adm.list = await B().adminReviews(null); } catch (e) { adm.list = []; }
  renderAdmin();
}
document.addEventListener('cr-admin', e => { if (e.detail && e.detail.view === 'reviews') { renderAdmin(); if (adm.list == null || !adm.busy) { adm.busy = true; loadAdmin().finally(() => { adm.busy = false; }); } } });
document.addEventListener('change', e => { if (e.target && e.target.id === 'rvFilter') { adm.filter = e.target.value; renderAdmin(); } });
document.addEventListener('click', async e => {
  const root = $('#admReviews'); if (!root || !root.contains(e.target)) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'rvRefresh') { loadAdmin(); return; }
  const a = b.dataset.ra, row = b.closest('.rv-arow'); if (!a || !row) return;
  const id = +row.dataset.id, r = (adm.list || []).find(x => +x.id === id); if (!r) return;
  const status = a === 'feature' || a === 'unfeature' ? 'approved' : a, featured = a === 'feature' ? true : a === 'unfeature' ? false : (a === 'approved' ? !!r.featured : false);
  b.disabled = true;
  try { const res = await B().adminReviewSet(id, status, featured); if (res !== 'ok') throw new Error(res); Object.assign(r, { status, featured: status === 'approved' && featured }); renderAdmin(); loadPub(true); }
  catch (err) { b.disabled = false; const m = $('#rvAMsg'); if (m) m.textContent = t('aFail'); }
});

new MutationObserver(() => {
  if (pub) paintHome();
  const a = $('#rvAsk'); if (a) { hideAsk(); showAsk(); }
  const el = $('#admReviews'); if (el && !el.hidden && adm.list) renderAdmin();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

window.REVIEWS = { open: openDlg, ask: showAsk, refresh: () => loadPub(true), _state: () => ({ pub, mine: mine.r, prompt: st() }) };
})();
