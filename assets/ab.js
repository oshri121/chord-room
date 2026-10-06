/* Chord Room — tiny A/B testing (growth). window.AB
   AB.variant('exp_name', ['a','b']) → the variant to show:
     · the experiment must exist in site_config.experiments ({id, on:true, variants, conversion, note}; admin → Growth tab)
       and list at least two of the variants the code knows — otherwise the FIRST variant (control) is returned and
       nothing is recorded (experiments are OFF by default);
     · sticky per browser (localStorage chordroom.ab.v1); a signed-in member without a stored variant gets
       hash(uid + exp) so the same account sees the same variant on another device;
     · recorded once: activity 'ab_assign' = '<exp>:<variant>' per member (results: ab_results() in schema.sql
       [growth-v4]; guests are logged when they sign in) and, with analytics consent, the GA4 user property ab_<exp>.
   The last experiments list is cached (chordroom.ab.cfg.v1) so returning visitors don't see the control flash first.
   Also renders the admin "Growth" tab: analytics ids + Search Console token (owner / full admin), experiments
   (settings permission), results (activity permission).
   Shipped experiment (OFF until an admin adds + enables it): home_cta — the home hero's main button text. */
(function () {
'use strict';
const CR = window.CR; if (!CR) return;
const LS_A = 'chordroom.ab.v1', LS_CFG = 'chordroom.ab.cfg.v1', LS_LOG = 'chordroom.ab.log.v1';
/* experiments wired in the code (admin: "add" pre-fills them; still off until enabled) */
const KNOWN = [{ id: 'home_cta', variants: ['a', 'b'], conversion: 'song_upload', note: 'Home hero button: "Open the tool" (a) vs "Try it free, no install" (b)' }];
const ACTIONS = ['song_upload', 'song_open', 'separate', 'export', 'sign_in', 'subscribe_click', 'invite_copy', 'mashup_export', 'extended_export', 'convert', 'crate_analyze', 'crate_export', 'dj_load', 'discover_open', 'voice_test'];

const T = {
he: { gTitle: 'צמיחה: סטטיסטיקה, Search Console וניסויי A/B', anTitle: 'סטטיסטיקה ו־Search Console',
  anHelp: 'הכלים נטענים רק אחרי שהמבקר אישר ״סטטיסטיקה״ בחלון העוגיות. ריק = כבוי.',
  ga4: 'Google Analytics 4 — מזהה מדידה', ga4H: 'G-XXXXXXXXXX (GA4 → Admin → Data streams)', clarity: 'Microsoft Clarity — מזהה פרויקט', clarityH: 'אותיות קטנות וספרות (Clarity → Settings → Overview)',
  gsc: 'Google Search Console — קוד אימות (meta)', gscH: 'רק הערך של content מתוך התג google-site-verification',
  anOnly: 'רק בעל האתר או מנהל מלא יכולים לשנות את המזהים.', bad: 'ערך לא תקין: {f}', save: 'שמירה', saved: 'נשמר', saveFail: 'השמירה נכשלה',
  exTitle: 'ניסויי A/B', exHelp: 'כל ניסוי כבוי עד שמסמנים ״פעיל״. התוצאות נספרות למשתמשים מחוברים (אורחים — דרך GA4, מאפיין משתמש ab_<מזהה>).',
  exNone: 'אין עדיין ניסויים.', exAdd: 'הוספה', exKnown: 'ניסויים שמוכנים בקוד:', exOn: 'פעיל', exVariants: 'גרסאות (מופרדות בפסיק)', exConv: 'המרה = פעולה ביומן',
  exNote: 'הערה', exRemove: 'הסרה', exResults: 'תוצאות', exSave: 'שמירת הניסויים', exNoPerm: 'צפייה בתוצאות דורשת הרשאת ״יומן פעילות״.',
  rVariant: 'גרסה', rAssigned: 'שובצו', rConv: 'המירו', rRate: 'שיעור', rEmpty: 'עוד אין שיבוצים לניסוי הזה.', rFail: 'לא ניתן לטעון תוצאות', loading: 'טוען…' },
en: { gTitle: 'Growth: analytics, Search Console and A/B tests', anTitle: 'Analytics & Search Console',
  anHelp: 'The tools load only after a visitor allows “Analytics” in the cookie banner. Empty = off.',
  ga4: 'Google Analytics 4 — measurement ID', ga4H: 'G-XXXXXXXXXX (GA4 → Admin → Data streams)', clarity: 'Microsoft Clarity — project ID', clarityH: 'lower-case letters and digits (Clarity → Settings → Overview)',
  gsc: 'Google Search Console — verification code (meta)', gscH: 'only the content value of the google-site-verification tag',
  anOnly: 'Only the site owner or a full admin can change these IDs.', bad: 'Invalid value: {f}', save: 'Save', saved: 'Saved', saveFail: 'Could not save',
  exTitle: 'A/B experiments', exHelp: 'Every experiment is off until you tick “On”. Results count signed-in members (guests: in GA4, user property ab_<id>).',
  exNone: 'No experiments yet.', exAdd: 'Add', exKnown: 'Experiments ready in the code:', exOn: 'On', exVariants: 'Variants (comma-separated)', exConv: 'Conversion = activity action',
  exNote: 'Note', exRemove: 'Remove', exResults: 'Results', exSave: 'Save experiments', exNoPerm: 'Viewing results needs the “Activity log” permission.',
  rVariant: 'Variant', rAssigned: 'Assigned', rConv: 'Converted', rRate: 'Rate', rEmpty: 'No assignments for this experiment yet.', rFail: 'Could not load results', loading: 'Loading…' },
ar: { gTitle: 'النمو: الإحصاءات وSearch Console واختبارات A/B', anTitle: 'الإحصاءات وSearch Console',
  anHelp: 'لا تُحمَّل الأدوات إلا بعد أن يسمح الزائر بـ«الإحصاءات» في نافذة ملفات تعريف الارتباط. فارغ = متوقف.',
  ga4: 'Google Analytics 4 — معرّف القياس', ga4H: 'G-XXXXXXXXXX (GA4 → Admin → Data streams)', clarity: 'Microsoft Clarity — معرّف المشروع', clarityH: 'أحرف صغيرة وأرقام (Clarity → Settings → Overview)',
  gsc: 'Google Search Console — رمز التحقق (meta)', gscH: 'قيمة content فقط من وسم google-site-verification',
  anOnly: 'يمكن لمالك الموقع أو لمدير كامل فقط تغيير هذه المعرّفات.', bad: 'قيمة غير صالحة: {f}', save: 'حفظ', saved: 'تم الحفظ', saveFail: 'تعذّر الحفظ',
  exTitle: 'تجارب A/B', exHelp: 'كل تجربة متوقفة حتى تحدد «مفعّلة». تُحتسب النتائج للأعضاء المسجّلين (الزوار: في GA4، خاصية المستخدم ab_<المعرّف>).',
  exNone: 'لا توجد تجارب بعد.', exAdd: 'إضافة', exKnown: 'تجارب جاهزة في الشيفرة:', exOn: 'مفعّلة', exVariants: 'النسخ (مفصولة بفواصل)', exConv: 'التحويل = إجراء في السجل',
  exNote: 'ملاحظة', exRemove: 'إزالة', exResults: 'النتائج', exSave: 'حفظ التجارب', exNoPerm: 'عرض النتائج يتطلب صلاحية «سجل النشاط».',
  rVariant: 'النسخة', rAssigned: 'عُيّنوا', rConv: 'حوّلوا', rRate: 'النسبة', rEmpty: 'لا توجد تعيينات لهذه التجربة بعد.', rFail: 'تعذّر تحميل النتائج', loading: 'جارٍ التحميل…' },
ru: { gTitle: 'Рост: аналитика, Search Console и A/B-тесты', anTitle: 'Аналитика и Search Console',
  anHelp: 'Инструменты загружаются только после того, как посетитель разрешит «Аналитику» в окне cookie. Пусто = выключено.',
  ga4: 'Google Analytics 4 — идентификатор потока', ga4H: 'G-XXXXXXXXXX (GA4 → Admin → Data streams)', clarity: 'Microsoft Clarity — ID проекта', clarityH: 'строчные буквы и цифры (Clarity → Settings → Overview)',
  gsc: 'Google Search Console — код подтверждения (meta)', gscH: 'только значение content из тега google-site-verification',
  anOnly: 'Менять эти идентификаторы может только владелец сайта или полный администратор.', bad: 'Неверное значение: {f}', save: 'Сохранить', saved: 'Сохранено', saveFail: 'Не удалось сохранить',
  exTitle: 'A/B-эксперименты', exHelp: 'Каждый эксперимент выключен, пока не отмечено «Вкл.». Результаты считаются по вошедшим пользователям (гости — в GA4, свойство пользователя ab_<id>).',
  exNone: 'Экспериментов пока нет.', exAdd: 'Добавить', exKnown: 'Эксперименты, готовые в коде:', exOn: 'Вкл.', exVariants: 'Варианты (через запятую)', exConv: 'Конверсия = действие в журнале',
  exNote: 'Заметка', exRemove: 'Удалить', exResults: 'Результаты', exSave: 'Сохранить эксперименты', exNoPerm: 'Для просмотра результатов нужно право «Журнал действий».',
  rVariant: 'Вариант', rAssigned: 'Назначено', rConv: 'Конверсии', rRate: 'Доля', rEmpty: 'В этом эксперименте пока нет назначений.', rFail: 'Не удалось загрузить результаты', loading: 'Загрузка…' },
es: { gTitle: 'Crecimiento: analítica, Search Console y pruebas A/B', anTitle: 'Analítica y Search Console',
  anHelp: 'Las herramientas se cargan solo después de que el visitante permita «Analítica» en el aviso de cookies. Vacío = desactivado.',
  ga4: 'Google Analytics 4 — ID de medición', ga4H: 'G-XXXXXXXXXX (GA4 → Admin → Data streams)', clarity: 'Microsoft Clarity — ID del proyecto', clarityH: 'minúsculas y dígitos (Clarity → Settings → Overview)',
  gsc: 'Google Search Console — código de verificación (meta)', gscH: 'solo el valor content de la etiqueta google-site-verification',
  anOnly: 'Solo el propietario del sitio o un administrador completo pueden cambiar estos ID.', bad: 'Valor no válido: {f}', save: 'Guardar', saved: 'Guardado', saveFail: 'No se pudo guardar',
  exTitle: 'Experimentos A/B', exHelp: 'Cada experimento está apagado hasta que marques «Activo». Los resultados cuentan miembros con sesión iniciada (invitados: en GA4, propiedad de usuario ab_<id>).',
  exNone: 'Todavía no hay experimentos.', exAdd: 'Añadir', exKnown: 'Experimentos listos en el código:', exOn: 'Activo', exVariants: 'Variantes (separadas por comas)', exConv: 'Conversión = acción del registro',
  exNote: 'Nota', exRemove: 'Quitar', exResults: 'Resultados', exSave: 'Guardar experimentos', exNoPerm: 'Ver los resultados requiere el permiso «Registro de actividad».',
  rVariant: 'Variante', rAssigned: 'Asignados', rConv: 'Convirtieron', rRate: 'Tasa', rEmpty: 'Aún no hay asignaciones en este experimento.', rFail: 'No se pudieron cargar los resultados', loading: 'Cargando…' }
};
const L = () => { const l = (document.documentElement.lang || 'he').slice(0, 2).toLowerCase(); return T[l] ? l : 'en'; };
const t = (k, v) => { let s = T[L()][k] != null ? T[L()][k] : T.en[k]; if (v) s = s.replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m)); return s; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

/* ---------- experiments from the config (or the cached copy until it arrives) ---------- */
const RX_ID = /^[a-z][a-z0-9_]{1,31}$/, RX_V = /^[a-z0-9_]{1,16}$/, RX_ACT = /^[a-z_]{2,40}$/;
function clean(list) {
  return (Array.isArray(list) ? list : []).filter(e => e && typeof e === 'object' && RX_ID.test(e.id) && Array.isArray(e.variants))
    .map(e => ({ id: e.id, on: e.on === true, variants: e.variants.filter(v => RX_V.test(v)).slice(0, 4), conversion: RX_ACT.test(e.conversion || '') ? e.conversion : '', note: String(e.note || '').slice(0, 120) }));
}
function loaded() { const c = CR.ACC && CR.ACC.config; return !!(c && typeof c === 'object' && Object.keys(c).length); }
function exps() {
  if (loaded()) { const e = clean(CR.ACC.config.experiments); lsSet(LS_CFG, e); return e; }
  return clean(lsGet(LS_CFG, []));
}
function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function rnd() { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; } catch (e) { return Math.floor(Math.random() * 4294967296); } }

const S = { seen: {}, sig: '' };
function variant(name, variants) {
  if (!Array.isArray(variants) || !variants.length) return undefined;
  const e = exps().find(x => x.id === name && x.on);
  if (!e) return variants[0];
  const vs = variants.filter(v => e.variants.includes(v));
  if (vs.length < 2) return variants[0];
  const st = lsGet(LS_A, {});
  let v = st[name];
  if (!vs.includes(v)) {
    const u = CR.user && CR.user(), uid = u && u.uid;
    v = vs[(uid ? hash(uid + ':' + name) : rnd()) % vs.length];
    st[name] = v; lsSet(LS_A, st);
  }
  record(name, v);
  return v;
}
function record(name, v) {
  S.seen[name] = v;
  if (window.CONSENT) CONSENT.userProp('ab_' + name, v);
  flush();
}
// one 'ab_assign' activity row per member and experiment (guests: when they sign in)
function flush() {
  const u = CR.user && CR.user(); if (!u || !u.uid || !(CR.signedIn && CR.signedIn())) return;
  const log = lsGet(LS_LOG, {}); let ch = false;
  for (const n in S.seen) { const k = u.uid + '|' + n; if (log[k] !== S.seen[n]) { CR.log('ab_assign', n + ':' + S.seen[n]); log[k] = S.seen[n]; ch = true; } }
  if (ch) lsSet(LS_LOG, log);
}
document.addEventListener('cr-user', () => setTimeout(flush, 1200));
// the config arrived / changed → pages that call AB.variant render again (home hero)
document.addEventListener('cr-config', () => {
  const sig = JSON.stringify(exps());
  if (sig !== S.sig) { const first = !S.sig; S.sig = sig; if (!first || exps().some(e => e.on)) { try { if (window.PAGES && PAGES.lang) PAGES.lang(); } catch (e) {} } }
  if (adm.open) renderAdmin(true);
});
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#adminClose')) adm.open = false; });
S.sig = JSON.stringify(clean(lsGet(LS_CFG, [])));

/* ---------- admin → Growth tab ---------- */
const adm = { open: false, res: {}, msgA: '', msgE: '', draft: null };
const $ = s => document.querySelector(s);
const ACC = () => CR.ACC || {};
const canIds = () => !!(ACC().owner || ACC().admin);
const canRes = () => !!(ACC().perms && ACC().perms.has && ACC().perms.has('activity'));
function cfgA() { const a = ACC().config && ACC().config.analytics; return a && typeof a === 'object' ? a : {}; }
function fld(id, label, help, val, dis) {
  return '<div class="fld"><label for="' + id + '">' + esc(label) + '</label><input type="text" id="' + id + '" dir="ltr" maxlength="100" spellcheck="false" autocomplete="off" value="' + esc(val || '') + '"' + (dis ? ' disabled' : '') + '><span class="snote">' + esc(help) + '</span></div>';
}
function exRow(e, i) {
  const r = adm.res[e.id];
  let res = '';
  if (r === 'loading') res = '<p class="snote">' + esc(t('loading')) + '</p>';
  else if (r === 'fail') res = '<p class="snote err">' + esc(t('rFail')) + '</p>';
  else if (r && Array.isArray(r.variants)) res = r.variants.length ? '<div class="tblw"><table class="ut st gx-res"><thead><tr><th>' + esc(t('rVariant')) + '</th><th>' + esc(t('rAssigned')) + '</th><th>' + esc(t('rConv')) + (r.conversion ? ' <span class="mono" dir="ltr">(' + esc(r.conversion) + ')</span>' : '') + '</th><th>' + esc(t('rRate')) + '</th></tr></thead><tbody>' +
    r.variants.map(v => '<tr><td class="mono" dir="ltr">' + esc(v.variant) + '</td><td class="mono">' + (+v.assigned || 0) + '</td><td class="mono">' + (+v.converted || 0) + '</td><td class="mono" dir="ltr">' + (+v.rate || 0) + '%</td></tr>').join('') + '</tbody></table></div>'
    : '<p class="snote">' + esc(t('rEmpty')) + '</p>';
  return '<div class="gx-ex" data-idx="' + i + '"><div class="gx-exh"><b class="mono" dir="ltr">' + esc(e.id) + '</b>' +
    '<label class="tog"><span>' + esc(t('exOn')) + '</span><input type="checkbox" data-k="on"' + (e.on ? ' checked' : '') + '></label>' +
    '<button type="button" class="btn ghost" data-a="res"' + (canRes() ? '' : ' disabled title="' + esc(t('exNoPerm')) + '"') + '>' + esc(t('exResults')) + '</button>' +
    '<button type="button" class="btn ghost" data-a="rm">' + esc(t('exRemove')) + '</button></div>' +
    '<div class="sgrid"><div class="fld"><label>' + esc(t('exVariants')) + '<input type="text" dir="ltr" data-k="variants" maxlength="80" value="' + esc(e.variants.join(',')) + '"></label></div>' +
    '<div class="fld"><label>' + esc(t('exConv')) + '<input type="text" dir="ltr" data-k="conversion" maxlength="40" list="gxActs" value="' + esc(e.conversion) + '"></label></div>' +
    '<div class="fld" style="grid-column:1/-1"><label>' + esc(t('exNote')) + '<input type="text" data-k="note" maxlength="120" value="' + esc(e.note) + '"></label></div></div>' + res + '</div>';
}
function renderAdmin(keepTyped) {
  const el = $('#admGrowth'); if (!el) return;
  if (keepTyped && el.querySelector('#gxGa4')) { adm.av = { ga4: $('#gxGa4').value, clarity: $('#gxClarity').value, gsc: $('#gxGsc').value }; readDraft(); }
  adm.open = true;
  if (!adm.draft) adm.draft = exps().map(e => ({ ...e, variants: e.variants.slice() }));
  const a = adm.av || cfgA(), dis = !canIds(), ids = adm.draft.map(e => e.id), known = KNOWN.filter(k => !ids.includes(k.id));
  el.innerHTML = '<div class="bhead"><h3>' + esc(t('gTitle')) + '</h3></div>' +
    '<section class="gx-sec" aria-labelledby="gxAnH"><h4 id="gxAnH">' + esc(t('anTitle')) + '</h4><p class="snote">' + esc(t('anHelp')) + (dis ? ' ' + esc(t('anOnly')) : '') + '</p>' +
    '<div class="sgrid">' + fld('gxGa4', t('ga4'), t('ga4H'), a.ga4, dis) + fld('gxClarity', t('clarity'), t('clarityH'), a.clarity, dis) + fld('gxGsc', t('gsc'), t('gscH'), a.gsc, dis) +
    '<div class="row2" style="grid-column:1/-1"><button type="button" class="btn solid" id="gxSaveA"' + (dis ? ' disabled' : '') + '>' + esc(t('save')) + '</button><span class="snote" id="gxMsgA" role="status">' + esc(adm.msgA) + '</span></div></div></section>' +
    '<section class="gx-sec" aria-labelledby="gxExH"><h4 id="gxExH">' + esc(t('exTitle')) + '</h4><p class="snote">' + esc(t('exHelp')) + '</p>' +
    (adm.draft.length ? adm.draft.map(exRow).join('') : '<p class="snote">' + esc(t('exNone')) + '</p>') +
    (known.length ? '<p class="snote gx-known">' + esc(t('exKnown')) + ' ' + known.map(k => '<button type="button" class="btn ghost" data-add="' + esc(k.id) + '"><span class="mono" dir="ltr">' + esc(k.id) + '</span> · ' + esc(t('exAdd')) + '</button>').join(' ') + '</p>' : '') +
    '<datalist id="gxActs">' + ACTIONS.map(x => '<option value="' + x + '">').join('') + '</datalist>' +
    '<div class="row2"><button type="button" class="btn solid" id="gxSaveE">' + esc(t('exSave')) + '</button><span class="snote" id="gxMsgE" role="status">' + esc(adm.msgE) + '</span></div></section>';
}
function readDraft() {
  document.querySelectorAll('#admGrowth .gx-ex').forEach(row => {
    const e = adm.draft[+row.dataset.idx]; if (!e) return;
    e.on = row.querySelector('[data-k="on"]').checked;
    e.variants = row.querySelector('[data-k="variants"]').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    e.conversion = row.querySelector('[data-k="conversion"]').value.trim();
    e.note = row.querySelector('[data-k="note"]').value.trim();
  });
}
async function saveA() {
  const vals = { ga4: $('#gxGa4').value.trim(), clarity: $('#gxClarity').value.trim(), gsc: $('#gxGsc').value.trim() };
  const RX = { ga4: /^(G-[A-Z0-9]{4,16})?$/, clarity: /^([a-z0-9]{6,16})?$/, gsc: /^([A-Za-z0-9_-]{10,100})?$/ };
  const bad = Object.keys(vals).filter(k => !RX[k].test(vals[k]));
  if (bad.length) { adm.msgA = t('bad', { f: bad.join(', ') }); renderAdmin(); return; }
  try { await Backend.saveGrowth({ analytics: vals }); CR.ACC.config = { ...CR.ACC.config, analytics: vals }; adm.msgA = t('saved'); adm.av = null; document.dispatchEvent(new CustomEvent('cr-config')); }
  catch (e) { adm.msgA = t('saveFail'); adm.av = vals; }
  renderAdmin();
}
async function saveE() {
  readDraft();
  const ok = adm.draft.every(e => RX_ID.test(e.id) && e.variants.length >= 2 && e.variants.length <= 4 && e.variants.every(v => RX_V.test(v)) && new Set(e.variants).size === e.variants.length &&
    (!e.conversion || RX_ACT.test(e.conversion)) && e.note.length <= 120 && !/[<>]/.test(e.note));
  if (!ok) { adm.msgE = t('bad', { f: t('exTitle') }); renderAdmin(); return; }
  const list = adm.draft.map(e => ({ id: e.id, on: !!e.on, variants: e.variants, conversion: e.conversion, note: e.note }));
  try { await Backend.saveGrowth({ experiments: list }); CR.ACC.config = { ...CR.ACC.config, experiments: list }; adm.msgE = t('saved'); document.dispatchEvent(new CustomEvent('cr-config')); }
  catch (e) { adm.msgE = t('saveFail'); }
  renderAdmin();
}
async function results(id) {
  adm.res[id] = 'loading'; renderAdmin();
  try { adm.res[id] = await Backend.abResults(id); } catch (e) { adm.res[id] = 'fail'; }
  renderAdmin();
}
document.addEventListener('click', e => {
  const root = $('#admGrowth'); if (!root || !root.contains(e.target)) return;
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.id === 'gxSaveA') { saveA(); return; }
  if (b.id === 'gxSaveE') { saveE(); return; }
  if (b.dataset.add) { readDraft(); const k = KNOWN.find(x => x.id === b.dataset.add); if (k) adm.draft.push({ ...k, on: false, variants: k.variants.slice() }); renderAdmin(); return; }
  const row = b.closest('.gx-ex'); if (!row) return;
  const e2 = adm.draft[+row.dataset.idx];
  if (b.dataset.a === 'rm') { readDraft(); adm.draft.splice(+row.dataset.idx, 1); renderAdmin(); }
  else if (b.dataset.a === 'res' && e2) { readDraft(); results(e2.id); }
});
document.addEventListener('cr-admin', e => {
  const el = $('#admGrowth');
  if (e.detail && e.detail.view === 'growth') { const was = adm.open && el && el.querySelector('#gxGa4'); if (!was) { adm.draft = null; adm.av = null; adm.msgA = adm.msgE = ''; } renderAdmin(!!was); }
  else adm.open = false;
});
new MutationObserver(() => { const el = $('#admGrowth'); if (adm.open && el && !el.hidden) renderAdmin(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

window.AB = {
  variant, KNOWN,
  assignments: () => ({ ...lsGet(LS_A, {}) }),
  experiments: () => exps(),
  _reset: () => { try { localStorage.removeItem(LS_A); localStorage.removeItem(LS_LOG); } catch (e) {} S.seen = {}; }
};
})();
