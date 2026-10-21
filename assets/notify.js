/* Chord Room — owner SMS alerts (notify v7). window.NOTIFY
   Admin tab "Alerts" (#admNotify, OWNER ONLY — tabOk in app.js; the server refuses everyone else: owner_notify_* in
   supabase/notify_v7.sql). A lazy module ('notify' in index.html's crLazy template), loaded when the tab opens.
   · Status: pg_net (sending), pg_cron (hourly summary/anomaly checks), shared secret, SMS today / caps, last delivery / failure.
   · Per category a level: off (log only) / daily summary / SMS now / SMS now even at night; quiet hours; summary hour;
     caps per day / hour (SMS cost); "Send test SMS" / "Send summary now" (≤ 6 an hour).
   · The log of everything that happened (last 80, filter), from private.notify_log.
   The phone number is NOT here on purpose: it lives only in Cloudflare (NOTIFY_TO), see NOTIFY.md. */
(function () {
'use strict';
const CR = window.CR; if (!CR) return;
const CATS = ['security', 'payissue', 'refund', 'pay', 'payfail', 'staff_login', 'admin', 'anomaly', 'edge', 'probe', 'signup', 'review', 'delete'];
const T = {
he: { title: 'התראות לטלפון (SMS)', only: 'רק הבעלים רואה את המסך הזה. ההודעות נשלחות רק למספר שהוגדר ב-Cloudflare (NOTIFY_TO) — אי אפשר לשנות אותו מהאתר.',
  stT: 'מצב', stNet: 'שליחה מהמסד (pg_net)', stCron: 'בדיקה שעתית + סיכום יומי (pg_cron)', stSecret: 'סוד משותף עם Cloudflare', stToday: 'נשלחו היום', stOf: '{n} מתוך {c}',
  stHeld: 'הושהו היום (לילה/תקרה)', stLastOk: 'נמסרה לאחרונה', stLastFail: 'כשל אחרון', yes: 'פעיל', no: 'חסר', never: 'עוד לא',
  hNet: 'ב-Supabase: Database ← Extensions ← להפעיל pg_net. בלי זה ההתראות נשמרות ביומן אבל לא נשלחות.',
  hCron: 'מומלץ: להפעיל גם pg_cron ולהריץ שוב את notify_v7.sql. בלעדיו הבדיקה השעתית והסיכום רצים רק כשקורה אירוע.',
  genT: 'כללי', on: 'שליחת SMS פעילה', onH: 'כבוי = הכול נכנס רק לסיכום היומי וליומן.', quiet: 'שעות שקט', quietH: 'בשעות האלה נשלחות רק התראות "גם בלילה"; השאר מחכות לסיכום.',
  from: 'מ-', to: 'עד', digest: 'סיכום יומי', digestH: 'הודעה אחת ביום עם כל המספרים.', hour: 'שעה', capDay: 'מקסימום הודעות ביום', capHour: 'מקסימום הודעות בשעה',
  capH: 'כל SMS עולה כסף (בעברית ~70 תווים להודעה). מעבר לתקרה — הכול נכנס לסיכום.',
  catT: 'מה לשלוח', lv0: 'כבוי (רק ביומן)', lv1: 'בסיכום היומי', lv2: 'SMS מיד', lv3: 'SMS מיד, גם בלילה',
  c_security: 'אבטחה: שינוי תפקידים ובעלות, הסרת אימות דו-שלבי / שינוי סיסמה או מייל אצל מנהל, ניסיונות על סיסמת התפקידים, מחיקת משתמשים, שינוי מחירים וקישורי תשלום',
  c_payissue: 'תשלום שלא שויך לחשבון / מסלול לא מוכר', c_refund: 'החזר כספי או ביטול חיוב ב-PayPal', c_pay: 'תשלום התקבל, מנוי חדש, מנוי בוטל או הסתיים',
  c_payfail: 'חיוב מנוי נכשל', c_staff_login: 'כניסה לחשבון ניהול (כולל שלך)', c_admin: 'פעולות ניהול: נקודות, מסלולים, חסימות, הגדרות, אימות דו-שלבי שהופעל',
  c_anomaly: 'חריגות: גל הרשמות, חשבון שמציף את האתר, הרבה החזרים, רומי קרוב לתקרה', c_edge: 'Cloudflare: הצפת בקשות, הודעות תשלום מזויפות, סוד לא תואם',
  c_probe: 'Cloudflare: ניסיונות לגשת לקבצים מוסתרים (בוטים סורקים כל אתר — מומלץ בסיכום)', c_signup: 'הרשמה חדשה', c_review: 'ביקורת חדשה מחכה לאישור', c_delete: 'משתמש מחק את החשבון',
  save: 'שמירה', test: 'שליחת SMS לבדיקה', sendDigest: 'שליחת סיכום עכשיו', saved: 'נשמר', saveFail: 'השמירה נכשלה', sentQ: 'נשלח — אמור להגיע תוך דקה', tooMany: 'יותר מדי בדיקות בשעה האחרונה',
  failMsg: 'הפעולה נכשלה', notOwner: 'רק הבעלים', loading: 'טוען…',
  logT: 'יומן אירועים', fAll: 'הכול', fSent: 'נשלחו', fHeld: 'בסיכום / הושהו', fFail: 'נכשלו', refresh: 'רענון', empty: 'אין עדיין אירועים.',
  s_new: 'בתור', s_sent: 'נשלח', s_ok: 'נמסר', s_fail: 'נכשל', s_off: 'רק ביומן', s_digest: 'בסיכום', s_quiet: 'שעות שקט', s_capped: 'תקרה', s_nonet: 'לא נשלח (חסר חיבור)',
  k_test: 'בדיקה', k_digest: 'סיכום', k_security: 'אבטחה', k_payissue: 'תשלום לבדיקה', k_refund: 'החזר', k_pay: 'תשלום', k_payfail: 'חיוב נכשל', k_staff_login: 'כניסת מנהל',
  k_admin: 'ניהול', k_anomaly: 'חריגה', k_edge: 'Cloudflare', k_probe: 'סריקה', k_signup: 'הרשמה', k_review: 'ביקורת', k_delete: 'מחיקה' },
en: { title: 'Phone alerts (SMS)', only: 'Only the owner sees this screen. Messages go only to the number set in Cloudflare (NOTIFY_TO) — it cannot be changed from the site.',
  stT: 'Status', stNet: 'Sending from the database (pg_net)', stCron: 'Hourly checks + daily summary (pg_cron)', stSecret: 'Secret shared with Cloudflare', stToday: 'Sent today', stOf: '{n} of {c}',
  stHeld: 'Held today (night/cap)', stLastOk: 'Last delivered', stLastFail: 'Last failure', yes: 'on', no: 'missing', never: 'not yet',
  hNet: 'In Supabase: Database → Extensions → enable pg_net. Without it alerts are logged but not sent.',
  hCron: 'Recommended: enable pg_cron too and run notify_v7.sql again. Without it the hourly checks and the summary run only when an event happens.',
  genT: 'General', on: 'SMS sending on', onH: 'Off = everything goes to the daily summary and the log only.', quiet: 'Quiet hours', quietH: 'During these hours only "even at night" alerts are sent; the rest wait for the summary.',
  from: 'From', to: 'to', digest: 'Daily summary', digestH: 'One message a day with all the numbers.', hour: 'Hour', capDay: 'Max messages a day', capHour: 'Max messages an hour',
  capH: 'Every SMS costs money (Hebrew ≈ 70 characters per message). Over the cap everything goes to the summary.',
  catT: 'What to send', lv0: 'Off (log only)', lv1: 'Daily summary', lv2: 'SMS now', lv3: 'SMS now, even at night',
  c_security: 'Security: role and owner changes, 2FA removed / password or e-mail changed on a staff account, role-password attempts, users deleted, prices and payment links changed',
  c_payissue: 'A payment not matched to an account / unknown plan', c_refund: 'PayPal refund or reversal', c_pay: 'Payment received, new subscription, subscription cancelled or ended',
  c_payfail: 'A subscription payment failed', c_staff_login: 'Sign-in to a staff account (yours too)', c_admin: 'Admin actions: points, plans, blocks, settings, 2FA turned on',
  c_anomaly: 'Anomalies: sign-up waves, an account hammering the site, many refunds, the assistant near its ceiling', c_edge: 'Cloudflare: request floods, forged payment messages, secret mismatch',
  c_probe: 'Cloudflare: attempts to reach hidden files (bots scan every site — summary recommended)', c_signup: 'New sign-up', c_review: 'A new review waits for approval', c_delete: 'A user deleted their account',
  save: 'Save', test: 'Send a test SMS', sendDigest: 'Send the summary now', saved: 'Saved', saveFail: 'Saving failed', sentQ: 'Sent — should arrive within a minute', tooMany: 'Too many tests in the last hour',
  failMsg: 'Action failed', notOwner: 'Owner only', loading: 'Loading…',
  logT: 'Event log', fAll: 'All', fSent: 'Sent', fHeld: 'Summary / held', fFail: 'Failed', refresh: 'Refresh', empty: 'No events yet.',
  s_new: 'queued', s_sent: 'sent', s_ok: 'delivered', s_fail: 'failed', s_off: 'log only', s_digest: 'in summary', s_quiet: 'quiet hours', s_capped: 'cap', s_nonet: 'not sent (no connection)',
  k_test: 'Test', k_digest: 'Summary', k_security: 'Security', k_payissue: 'Payment to check', k_refund: 'Refund', k_pay: 'Payment', k_payfail: 'Payment failed', k_staff_login: 'Staff sign-in',
  k_admin: 'Admin', k_anomaly: 'Anomaly', k_edge: 'Cloudflare', k_probe: 'Scan', k_signup: 'Sign-up', k_review: 'Review', k_delete: 'Deletion' },
ar: { title: 'تنبيهات الهاتف (SMS)', only: 'المالك فقط يرى هذه الشاشة. تُرسل الرسائل فقط إلى الرقم المحدد في Cloudflare (NOTIFY_TO) — لا يمكن تغييره من الموقع.',
  stT: 'الحالة', stNet: 'الإرسال من قاعدة البيانات (pg_net)', stCron: 'فحص كل ساعة + ملخص يومي (pg_cron)', stSecret: 'سر مشترك مع Cloudflare', stToday: 'أُرسل اليوم', stOf: '{n} من {c}',
  stHeld: 'مؤجل اليوم (ليل/حد)', stLastOk: 'آخر تسليم', stLastFail: 'آخر فشل', yes: 'مفعّل', no: 'ناقص', never: 'ليس بعد',
  hNet: 'في Supabase: Database ← Extensions ← فعّل pg_net. بدونه تُسجَّل التنبيهات ولا تُرسل.',
  hCron: 'يُنصح بتفعيل pg_cron أيضًا وتشغيل notify_v7.sql مرة أخرى. بدونه يعمل الفحص والملخص فقط عند وقوع حدث.',
  genT: 'عام', on: 'إرسال SMS مفعّل', onH: 'متوقف = كل شيء يذهب إلى الملخص اليومي والسجل فقط.', quiet: 'ساعات الهدوء', quietH: 'خلال هذه الساعات تُرسل فقط تنبيهات "حتى في الليل"؛ الباقي ينتظر الملخص.',
  from: 'من', to: 'إلى', digest: 'ملخص يومي', digestH: 'رسالة واحدة في اليوم بكل الأرقام.', hour: 'الساعة', capDay: 'أقصى عدد رسائل في اليوم', capHour: 'أقصى عدد رسائل في الساعة',
  capH: 'كل رسالة SMS تكلف مالًا (العبرية ≈ 70 حرفًا للرسالة). بعد الحد يذهب كل شيء إلى الملخص.',
  catT: 'ماذا يُرسل', lv0: 'متوقف (السجل فقط)', lv1: 'في الملخص اليومي', lv2: 'SMS فورًا', lv3: 'SMS فورًا، حتى في الليل',
  c_security: 'الأمان: تغيير الأدوار والملكية، إزالة التحقق بخطوتين / تغيير كلمة المرور أو البريد لدى حساب إداري، محاولات على كلمة مرور الأدوار، حذف مستخدمين، تغيير الأسعار وروابط الدفع',
  c_payissue: 'دفعة لم تُربط بحساب / خطة غير معروفة', c_refund: 'استرداد أو إلغاء خصم في PayPal', c_pay: 'دفعة وصلت، اشتراك جديد، اشتراك أُلغي أو انتهى',
  c_payfail: 'فشل خصم الاشتراك', c_staff_login: 'دخول إلى حساب إداري (بما فيه حسابك)', c_admin: 'إجراءات إدارية: نقاط، خطط، حظر، إعدادات، تفعيل التحقق بخطوتين',
  c_anomaly: 'حالات شاذة: موجة تسجيل، حساب يُغرق الموقع، استردادات كثيرة، المساعد قرب الحد', c_edge: 'Cloudflare: إغراق بالطلبات، رسائل دفع مزورة، سر غير متطابق',
  c_probe: 'Cloudflare: محاولات للوصول إلى ملفات مخفية (الروبوتات تفحص كل موقع — يُنصح بالملخص)', c_signup: 'تسجيل جديد', c_review: 'مراجعة جديدة بانتظار الموافقة', c_delete: 'مستخدم حذف حسابه',
  save: 'حفظ', test: 'إرسال SMS تجريبي', sendDigest: 'إرسال الملخص الآن', saved: 'تم الحفظ', saveFail: 'فشل الحفظ', sentQ: 'أُرسل — يُفترض أن يصل خلال دقيقة', tooMany: 'تجارب كثيرة في الساعة الأخيرة',
  failMsg: 'فشل الإجراء', notOwner: 'للمالك فقط', loading: 'جارٍ التحميل…',
  logT: 'سجل الأحداث', fAll: 'الكل', fSent: 'أُرسلت', fHeld: 'ملخص / مؤجلة', fFail: 'فشلت', refresh: 'تحديث', empty: 'لا أحداث بعد.',
  s_new: 'في الانتظار', s_sent: 'أُرسل', s_ok: 'سُلّم', s_fail: 'فشل', s_off: 'السجل فقط', s_digest: 'في الملخص', s_quiet: 'ساعات الهدوء', s_capped: 'الحد', s_nonet: 'لم يُرسل (لا اتصال)',
  k_test: 'تجربة', k_digest: 'ملخص', k_security: 'أمان', k_payissue: 'دفعة للفحص', k_refund: 'استرداد', k_pay: 'دفعة', k_payfail: 'فشل خصم', k_staff_login: 'دخول إداري',
  k_admin: 'إدارة', k_anomaly: 'حالة شاذة', k_edge: 'Cloudflare', k_probe: 'فحص', k_signup: 'تسجيل', k_review: 'مراجعة', k_delete: 'حذف' },
ru: { title: 'Уведомления на телефон (SMS)', only: 'Этот экран видит только владелец. Сообщения уходят только на номер, заданный в Cloudflare (NOTIFY_TO), — изменить его с сайта нельзя.',
  stT: 'Состояние', stNet: 'Отправка из базы (pg_net)', stCron: 'Ежечасная проверка + ежедневная сводка (pg_cron)', stSecret: 'Общий секрет с Cloudflare', stToday: 'Отправлено сегодня', stOf: '{n} из {c}',
  stHeld: 'Отложено сегодня (ночь/лимит)', stLastOk: 'Последняя доставка', stLastFail: 'Последний сбой', yes: 'вкл.', no: 'нет', never: 'ещё нет',
  hNet: 'В Supabase: Database → Extensions → включите pg_net. Без него уведомления пишутся в журнал, но не отправляются.',
  hCron: 'Рекомендуется включить и pg_cron и снова выполнить notify_v7.sql. Без него проверка и сводка запускаются только при событии.',
  genT: 'Общее', on: 'Отправка SMS включена', onH: 'Выкл. = всё попадает только в ежедневную сводку и журнал.', quiet: 'Тихие часы', quietH: 'В эти часы отправляются только уведомления «даже ночью»; остальные ждут сводки.',
  from: 'С', to: 'до', digest: 'Ежедневная сводка', digestH: 'Одно сообщение в день со всеми цифрами.', hour: 'Час', capDay: 'Максимум сообщений в день', capHour: 'Максимум сообщений в час',
  capH: 'Каждое SMS стоит денег (на иврите ≈ 70 символов на сообщение). Сверх лимита всё идёт в сводку.',
  catT: 'Что отправлять', lv0: 'Выкл. (только журнал)', lv1: 'В ежедневной сводке', lv2: 'SMS сразу', lv3: 'SMS сразу, даже ночью',
  c_security: 'Безопасность: смена ролей и владельца, отключение 2FA / смена пароля или почты у администратора, попытки пароля ролей, удаление пользователей, смена цен и ссылок оплаты',
  c_payissue: 'Платёж не привязан к аккаунту / неизвестный план', c_refund: 'Возврат или отмена платежа в PayPal', c_pay: 'Платёж получен, новая подписка, подписка отменена или закончилась',
  c_payfail: 'Не прошло списание по подписке', c_staff_login: 'Вход в аккаунт администратора (и ваш тоже)', c_admin: 'Действия администраторов: баллы, планы, блокировки, настройки, включение 2FA',
  c_anomaly: 'Аномалии: волна регистраций, аккаунт, перегружающий сайт, много возвратов, ассистент у лимита', c_edge: 'Cloudflare: поток запросов, поддельные уведомления об оплате, несовпадение секрета',
  c_probe: 'Cloudflare: попытки открыть скрытые файлы (боты сканируют все сайты — лучше в сводку)', c_signup: 'Новая регистрация', c_review: 'Новый отзыв ждёт проверки', c_delete: 'Пользователь удалил аккаунт',
  save: 'Сохранить', test: 'Отправить тестовое SMS', sendDigest: 'Отправить сводку сейчас', saved: 'Сохранено', saveFail: 'Не удалось сохранить', sentQ: 'Отправлено — придёт в течение минуты', tooMany: 'Слишком много тестов за последний час',
  failMsg: 'Действие не удалось', notOwner: 'Только владелец', loading: 'Загрузка…',
  logT: 'Журнал событий', fAll: 'Все', fSent: 'Отправлены', fHeld: 'Сводка / отложены', fFail: 'Сбой', refresh: 'Обновить', empty: 'Событий пока нет.',
  s_new: 'в очереди', s_sent: 'отправлено', s_ok: 'доставлено', s_fail: 'сбой', s_off: 'только журнал', s_digest: 'в сводке', s_quiet: 'тихие часы', s_capped: 'лимит', s_nonet: 'не отправлено (нет связи)',
  k_test: 'Тест', k_digest: 'Сводка', k_security: 'Безопасность', k_payissue: 'Проверить платёж', k_refund: 'Возврат', k_pay: 'Платёж', k_payfail: 'Сбой оплаты', k_staff_login: 'Вход админа',
  k_admin: 'Управление', k_anomaly: 'Аномалия', k_edge: 'Cloudflare', k_probe: 'Сканирование', k_signup: 'Регистрация', k_review: 'Отзыв', k_delete: 'Удаление' },
es: { title: 'Alertas al teléfono (SMS)', only: 'Solo el propietario ve esta pantalla. Los mensajes van solo al número configurado en Cloudflare (NOTIFY_TO): no se puede cambiar desde el sitio.',
  stT: 'Estado', stNet: 'Envío desde la base de datos (pg_net)', stCron: 'Revisión cada hora + resumen diario (pg_cron)', stSecret: 'Secreto compartido con Cloudflare', stToday: 'Enviados hoy', stOf: '{n} de {c}',
  stHeld: 'Retenidos hoy (noche/límite)', stLastOk: 'Última entrega', stLastFail: 'Último fallo', yes: 'activo', no: 'falta', never: 'aún no',
  hNet: 'En Supabase: Database → Extensions → activa pg_net. Sin él las alertas se registran pero no se envían.',
  hCron: 'Recomendado: activa también pg_cron y vuelve a ejecutar notify_v7.sql. Sin él la revisión y el resumen solo corren cuando ocurre un evento.',
  genT: 'General', on: 'Envío de SMS activo', onH: 'Apagado = todo va solo al resumen diario y al registro.', quiet: 'Horas de silencio', quietH: 'En estas horas solo se envían las alertas "incluso de noche"; el resto espera al resumen.',
  from: 'De', to: 'a', digest: 'Resumen diario', digestH: 'Un mensaje al día con todas las cifras.', hour: 'Hora', capDay: 'Máximo de mensajes al día', capHour: 'Máximo de mensajes por hora',
  capH: 'Cada SMS cuesta dinero (en hebreo ≈ 70 caracteres por mensaje). Por encima del límite todo va al resumen.',
  catT: 'Qué enviar', lv0: 'Apagado (solo registro)', lv1: 'En el resumen diario', lv2: 'SMS al momento', lv3: 'SMS al momento, incluso de noche',
  c_security: 'Seguridad: cambios de roles y propiedad, 2FA eliminado / contraseña o correo cambiados en una cuenta de gestión, intentos con la contraseña de roles, usuarios eliminados, precios y enlaces de pago cambiados',
  c_payissue: 'Un pago sin cuenta asociada / plan desconocido', c_refund: 'Reembolso o reversión en PayPal', c_pay: 'Pago recibido, nueva suscripción, suscripción cancelada o terminada',
  c_payfail: 'Falló el cobro de una suscripción', c_staff_login: 'Inicio de sesión en una cuenta de gestión (también la tuya)', c_admin: 'Acciones de gestión: puntos, planes, bloqueos, ajustes, 2FA activado',
  c_anomaly: 'Anomalías: oleada de registros, una cuenta saturando el sitio, muchos reembolsos, el asistente cerca de su límite', c_edge: 'Cloudflare: avalancha de peticiones, avisos de pago falsos, secreto que no coincide',
  c_probe: 'Cloudflare: intentos de acceder a archivos ocultos (los bots escanean todos los sitios: mejor en el resumen)', c_signup: 'Nuevo registro', c_review: 'Una reseña nueva espera aprobación', c_delete: 'Un usuario eliminó su cuenta',
  save: 'Guardar', test: 'Enviar un SMS de prueba', sendDigest: 'Enviar el resumen ahora', saved: 'Guardado', saveFail: 'No se pudo guardar', sentQ: 'Enviado: debería llegar en un minuto', tooMany: 'Demasiadas pruebas en la última hora',
  failMsg: 'La acción falló', notOwner: 'Solo el propietario', loading: 'Cargando…',
  logT: 'Registro de eventos', fAll: 'Todo', fSent: 'Enviados', fHeld: 'Resumen / retenidos', fFail: 'Fallidos', refresh: 'Actualizar', empty: 'Aún no hay eventos.',
  s_new: 'en cola', s_sent: 'enviado', s_ok: 'entregado', s_fail: 'falló', s_off: 'solo registro', s_digest: 'en el resumen', s_quiet: 'horas de silencio', s_capped: 'límite', s_nonet: 'no enviado (sin conexión)',
  k_test: 'Prueba', k_digest: 'Resumen', k_security: 'Seguridad', k_payissue: 'Pago a revisar', k_refund: 'Reembolso', k_pay: 'Pago', k_payfail: 'Cobro fallido', k_staff_login: 'Acceso de gestión',
  k_admin: 'Gestión', k_anomaly: 'Anomalía', k_edge: 'Cloudflare', k_probe: 'Escaneo', k_signup: 'Registro', k_review: 'Reseña', k_delete: 'Eliminación' }
};
const L = () => { const l = (document.documentElement.lang || 'he').slice(0, 2).toLowerCase(); return T[l] ? l : 'en'; };
const t = (k, v) => { let s = T[L()][k] != null ? T[L()][k] : T.en[k] != null ? T.en[k] : k; if (v) s = String(s).replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m)); return s; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const B = () => window.Backend || {};
const when = d => { if (!d) return t('never'); try { return new Intl.DateTimeFormat(L() === 'ar' ? 'ar-u-nu-latn' : L(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d)); } catch (e) { return String(d); } };
const ltr = s => '<span dir="ltr" class="ltr">' + esc(s) + '</span>';

const st = { data: null, err: '', msg: '', filter: '', busy: false, open: false, draft: null };
const HELD = { digest: 1, quiet: 1, capped: 1, off: 1 }, SENT = { sent: 1, ok: 1, new: 1 }, FAIL = { fail: 1, nonet: 1 };

function hours(id, v) {
  let o = ''; for (let h = 0; h < 24; h++) o += '<option value="' + h + '"' + (h === v ? ' selected' : '') + '>' + String(h).padStart(2, '0') + ':00</option>';
  return '<select class="sel" id="' + id + '" dir="ltr">' + o + '</select>';
}
function statusRow(label, good, val, hint) {
  return '<li class="nt-st ' + (good ? 'good' : 'bad') + '"><span class="nt-dot" aria-hidden="true"></span><span class="nt-sl">' + esc(label) + '</span><b>' + val + '</b>' +
    (hint ? '<span class="snote nt-hint">' + esc(hint) + '</span>' : '') + '</li>';
}
function render() {
  const el = $('#admNotify'); if (!el) return;
  st.open = true;
  if (!st.data) { el.innerHTML = '<div class="bhead"><h3>' + esc(t('title')) + '</h3></div><p class="snote" role="status">' + esc(st.err || t('loading')) + '</p>'; return; }
  const d = st.data, p = st.draft || d.prefs, r = d.ready || {}, td = d.today || {};
  const log = (d.log || []).filter(x => !st.filter || (st.filter === 'sent' ? SENT[x.state] : st.filter === 'held' ? HELD[x.state] : FAIL[x.state]));
  el.innerHTML = '<div class="bhead"><h3>' + esc(t('title')) + '</h3></div><p class="snote">' + esc(t('only')) + '</p>' +
    '<section class="gx-sec" aria-labelledby="ntStH"><h4 id="ntStH">' + esc(t('stT')) + '</h4><ul class="nt-status">' +
      statusRow(t('stNet'), r.net, esc(r.net ? t('yes') : t('no')), r.net ? '' : t('hNet')) +
      statusRow(t('stCron'), r.cron, esc(r.cron ? t('yes') : t('no')), r.cron ? '' : t('hCron')) +
      statusRow(t('stSecret'), r.secret, esc(r.secret ? t('yes') : t('no'))) +
      statusRow(t('stToday'), true, esc(t('stOf', { n: td.sent || 0, c: p.cap_day }))) +
      statusRow(t('stHeld'), !(td.held > 0), ltr(String(td.held || 0))) +
      statusRow(t('stLastOk'), !!d.last_ok, esc(when(d.last_ok))) +
      (d.last_fail ? statusRow(t('stLastFail'), false, esc(when(d.last_fail))) : '') +
    '</ul></section>' +
    '<section class="gx-sec" aria-labelledby="ntGenH"><h4 id="ntGenH">' + esc(t('genT')) + '</h4>' +
      '<label class="tog"><span>' + esc(t('on')) + '</span><input type="checkbox" id="ntOn"' + (p.on !== false ? ' checked' : '') + '></label><p class="snote">' + esc(t('onH')) + '</p>' +
      '<div class="nt-row"><label class="tog"><span>' + esc(t('quiet')) + '</span><input type="checkbox" id="ntQOn"' + (p.quiet && p.quiet.on ? ' checked' : '') + '></label>' +
        '<label class="nt-in">' + esc(t('from')) + ' ' + hours('ntQFrom', +(p.quiet && p.quiet.from)) + '</label><label class="nt-in">' + esc(t('to')) + ' ' + hours('ntQTo', +(p.quiet && p.quiet.to)) + '</label></div>' +
      '<p class="snote">' + esc(t('quietH')) + '</p>' +
      '<div class="nt-row"><label class="tog"><span>' + esc(t('digest')) + '</span><input type="checkbox" id="ntDOn"' + (p.digest && p.digest.on ? ' checked' : '') + '></label>' +
        '<label class="nt-in">' + esc(t('hour')) + ' ' + hours('ntDHour', +(p.digest && p.digest.hour)) + '</label></div><p class="snote">' + esc(t('digestH')) + '</p>' +
      '<div class="nt-row"><label class="nt-in">' + esc(t('capDay')) + ' <input type="number" id="ntCapD" min="1" max="60" dir="ltr" value="' + esc(p.cap_day) + '"></label>' +
        '<label class="nt-in">' + esc(t('capHour')) + ' <input type="number" id="ntCapH" min="1" max="30" dir="ltr" value="' + esc(p.cap_hour) + '"></label></div><p class="snote">' + esc(t('capH')) + '</p>' +
    '</section>' +
    '<section class="gx-sec" aria-labelledby="ntCatH"><h4 id="ntCatH">' + esc(t('catT')) + '</h4><ul class="nt-cats">' +
      CATS.map(c => { const v = +((p.cats || {})[c] != null ? p.cats[c] : 1);
        return '<li><label for="ntC_' + c + '"><b>' + esc(t('k_' + c)) + '</b> <span class="snote">' + esc(t('c_' + c)) + '</span></label>' +
          '<select class="sel" id="ntC_' + c + '" data-cat="' + c + '">' + [0, 1, 2, 3].map(l => '<option value="' + l + '"' + (l === v ? ' selected' : '') + '>' + esc(t('lv' + l)) + '</option>').join('') + '</select></li>'; }).join('') +
    '</ul><div class="row2"><button type="button" class="btn solid" id="ntSave">' + esc(t('save')) + '</button>' +
      '<button type="button" class="btn ghost" id="ntTest">' + esc(t('test')) + '</button><button type="button" class="btn ghost" id="ntDigest">' + esc(t('sendDigest')) + '</button>' +
      '<span class="snote" id="ntMsg" role="status">' + esc(st.msg) + '</span></div></section>' +
    '<section class="gx-sec" aria-labelledby="ntLogH"><div class="bhead"><h4 id="ntLogH">' + esc(t('logT')) + '</h4><div class="row2">' +
      '<select class="sel" id="ntFilter" aria-label="' + esc(t('logT')) + '">' + [['', 'fAll'], ['sent', 'fSent'], ['held', 'fHeld'], ['fail', 'fFail']].map(([v, k]) => '<option value="' + v + '"' + (v === st.filter ? ' selected' : '') + '>' + esc(t(k)) + '</option>').join('') + '</select>' +
      '<button type="button" class="btn ghost" id="ntRefresh">' + esc(t('refresh')) + '</button></div></div>' +
      (log.length ? '<ul class="nt-log">' + log.map(x => '<li class="nt-' + esc(x.state) + '"><span class="nt-at">' + ltr(when(x.at)) + '</span><span class="nt-cat lvl' + (+x.lvl || 0) + '">' + esc(t('k_' + x.cat)) +
        '</span><span class="nt-msg" dir="auto">' + esc(x.msg) + '</span><span class="nt-state">' + esc(t('s_' + x.state)) + '</span></li>').join('') + '</ul>'
        : '<p class="snote">' + esc(t('empty')) + '</p>') +
    '</section>';
}
function readDraft() {
  if (!$('#ntOn') || !st.data) return st.draft || (st.data && st.data.prefs);
  const cats = {}; document.querySelectorAll('#admNotify select[data-cat]').forEach(s => { cats[s.dataset.cat] = +s.value; });
  const n = (id, a, b, dv) => { const v = Math.round(+$(id).value); return isFinite(v) ? Math.min(b, Math.max(a, v)) : dv; };
  st.draft = { on: $('#ntOn').checked, cats, quiet: { on: $('#ntQOn').checked, from: +$('#ntQFrom').value, to: +$('#ntQTo').value },
    digest: { on: $('#ntDOn').checked, hour: +$('#ntDHour').value }, cap_day: n('#ntCapD', 1, 60, 25), cap_hour: n('#ntCapH', 1, 30, 8) };
  return st.draft;
}
async function load() {
  if (st.busy || !B().notifyStatus) return;
  st.busy = true;
  try { st.data = await B().notifyStatus(); st.err = ''; }
  catch (e) { st.err = /not allowed|42501|denied/i.test(String(e && (e.message || e.code))) ? t('notOwner') : t('failMsg'); }
  finally { st.busy = false; }
  render();
}
async function save() {
  const p = readDraft(); st.msg = '';
  try { const r = await B().notifySave(p); st.data.prefs = r || p; st.draft = null; st.msg = t('saved'); } catch (e) { st.msg = t('saveFail'); }
  render();
}
async function send(what) {
  readDraft();
  try { const r = await B().notifySend(what); st.msg = r && r.state === 'sent' ? t('sentQ') : t('s_' + (r && r.state || 'fail')); }
  catch (e) { st.msg = /too many/i.test(String(e && e.message)) ? t('tooMany') : t('failMsg'); }
  await load();
}
document.addEventListener('click', e => {
  const root = $('#admNotify'); if (!root || !root.contains(e.target)) return;
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.id === 'ntSave') { b.disabled = true; save(); }
  else if (b.id === 'ntTest') { b.disabled = true; send('test'); }
  else if (b.id === 'ntDigest') { b.disabled = true; send('digest'); }
  else if (b.id === 'ntRefresh') { readDraft(); load(); }
});
document.addEventListener('change', e => { if (e.target && e.target.id === 'ntFilter') { readDraft(); st.filter = e.target.value; render(); } });
document.addEventListener('cr-admin', e => {
  if (e.detail && e.detail.view === 'notify') { if (!st.open) { st.draft = null; st.msg = ''; } render(); load(); }
  else st.open = false;
});
new MutationObserver(() => { const el = $('#admNotify'); if (st.open && el && !el.hidden) { readDraft(); render(); } })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
// the module may load after the tab was opened (lazy): catch up
{ const el = $('#admNotify'); if (el && !el.hidden) { render(); load(); } }

window.NOTIFY = { reload: load, _state: () => st, CATS, T };
})();
