/* Chord Room — accounts v4 (launch checklist). Talks to the app only through window.CR and window.Backend.
   Server side: supabase/schema.sql [accounts-v4] (= supabase/accounts_v4.sql). Owner steps: SECURITY-AUDIT.md "v4".
     TEXTGUARD   offensive-word check (same normalisation + built-in list as private.is_offensive in SQL); CR.offensive(text)
     CAP         Cloudflare Turnstile for Supabase Auth (Backend.captcha) — only when billing.turnstile_site_key is set
     MFA         two-step verification: account panel section, enrolment dialog (QR from Supabase), the sign-in code step
     DEL         "Delete account" (danger zone) + admin "Delete user"; clears this browser's per-user data
     IDLE        sign-out after billing.idle_minutes (users, default 7 days) / idle_minutes_admin (admin-panel accounts,
                 default 60 min) without activity, shared by every tab (localStorage), 60 s "Still there?" warning
     admin       Settings → Security (Turnstile key, 2FA for management, idle limits, minimum age) + blocked words; 2FA banner
   Every string: 5 languages (CR.addStrings). All dynamic text goes through textContent / esc(). */
(function () {
'use strict';
const CR = window.CR;
if (!CR) return;
const B = () => window.Backend || {};
const $ = s => document.querySelector(s);
const esc = CR.esc;
const t = (k, v) => CR.t(k, v);

/* ---------- strings ---------- */
const S = {
he: {
  ac2faH: 'אימות דו־שלבי (2FA)', ac2faOff: 'כבוי. אפשר להוסיף קוד מאפליקציית אימות (Google Authenticator,‏ Microsoft Authenticator,‏ 1Password,‏ Authy…) לכל כניסה.',
  ac2faOn: 'פעיל — בכל כניסה נבקש קוד בן 6 ספרות מאפליקציית האימות.', ac2faEnable: 'הפעלת אימות דו־שלבי', ac2faRemove: 'הסרה', ac2faRemoveSure: 'לחצו שוב כדי להסיר',
  ac2faAdded: 'נוסף {d}', ac2faApp: 'אפליקציית אימות', ac2faHeld: 'הרשאות הניהול שלכם מושהות עד שתפעילו אימות דו־שלבי.', ac2faErr: 'לא הצלחנו לטעון את מצב האימות הדו־שלבי.',
  acEnrH: 'הפעלת אימות דו־שלבי', acEnr1: '1. סרקו את קוד ה־QR באפליקציית האימות (או הקלידו את המפתח שמתחת).', acEnrKey: 'מפתח הגדרה', acCopy: 'העתקה', acCopied: 'הועתק',
  acEnr2: '2. הקלידו את הקוד בן 6 הספרות שמופיע באפליקציה.', acCodeL: 'קוד בן 6 ספרות', acVerify: 'אימות והפעלה', acEnrDone: 'האימות הדו־שלבי פעיל.',
  acCodeBad: 'הקוד לא התאים. בדקו שהשעה בטלפון נכונה ונסו את הקוד העדכני.', acEnrErr: 'לא הצלחנו להתחיל את ההפעלה ({m}). ייתכן שאימות דו־שלבי עוד לא הופעל באתר.',
  acMfaH: 'אימות דו־שלבי', acMfaP: 'הקלידו את הקוד בן 6 הספרות מאפליקציית האימות עבור {e}.', acMfaGo: 'אימות', acMfaOut: 'יציאה / כניסה עם חשבון אחר',
  acDangerH: 'אזור מסוכן', acDelBtn: 'מחיקת החשבון', acDelLead: 'מחיקת החשבון וכל מה שבו. אי אפשר לבטל את זה.',
  acDelH: 'מחיקת החשבון', acDelWhat: 'הפעולה מוחקת לצמיתות:', acDelL1: 'את הפרופיל, שם המשתמש והתמונה', acDelL2: 'את השירים, הקבצים שהעליתם, הניתוחים, היסטוריית הייצוא ויומן הפעילות',
  acDelL3: 'את הנקודות ({n}) והמסלול — הם אובדים ולא מוחזרים', acDelL4: 'את האימות הדו־שלבי ואת כל החיבורים הפעילים', acDelL5: 'בדפדפן הזה: ניתוח הספרייה, ההגדרות והשיר האחרון שנפתח',
  acDelKeep: 'רשומות תשלום (סכום, תאריך, מסלול) נשמרות 7 שנים כפי שדורש דין המס — בלי שם ובלי אימייל. ניתוחי שירים שהוספתם לקטלוג המשותף של ״גלה שירים״ נשארים, בלי קשר אליכם.',
  acDelOwner: 'זה החשבון של בעל האתר. העבירו את הבעלות לחשבון אחר לפני המחיקה.', acDelSub: 'יש לכם מנוי פעיל. בטלו אותו קודם בפורטל המנוי, ואז מחקו את החשבון.', acDelPortal: 'לפורטל המנוי',
  acDelConfL: 'לאישור, הקלידו את שם המשתמש ({u}) או את המילה {w}', acDelWord: 'מחק', acDelPwL: 'הסיסמה הנוכחית', acDelNoPw: 'שכחתם את הסיסמה? קבלו קוד במייל במקום',
  acDelSend: 'שליחת קוד למייל', acDelSent: 'שלחנו קוד בן 6 ספרות אל {e}.', acDelCodeL: 'הקוד מהמייל', acDelTotpL: 'הקוד מאפליקציית האימות', acDelGo: 'מחיקת החשבון לצמיתות',
  acDelConfBad: 'האישור לא תואם.', acDelPwBad: 'הסיסמה שגויה.', acDelReauth: 'הקלידו שוב את הסיסמה (או קוד מהמייל).', acDelMfa: 'הקלידו את הקוד מאפליקציית האימות.',
  acDelFiles: 'חלק מהקבצים עוד לא נמחקו. נסו שוב.', acDelRunFiles: 'מוחקים את הקבצים שלכם…', acDelRunAcc: 'מוחקים את החשבון…', acDelDoneH: 'החשבון נמחק',
  acDelDoneP: 'תודה שהייתם איתנו. כל מה שפורט נמחק, והדפדפן הזה התנתק.', acDelErr: 'לא הצלחנו למחוק את החשבון ({m}). נסו שוב.', acOk: 'אישור', acCancel: 'ביטול',
  acUdDel: 'מחיקת המשתמש', acUdDelH: 'למחוק את {u}?', acUdDelP: 'מוחק את החשבון, השירים, הקבצים והיומנים שלו. רשומות תשלום נשמרות בלי פרטים מזהים. אי אפשר לבטל את זה.',
  acUdDelConfL: 'לאישור, הקלידו את שם המשתמש ({u}) או {w}', acUdDelGo: 'מחיקת המשתמש לצמיתות', acUdDelDone: 'החשבון נמחק.',
  acWhy_owner: 'אי אפשר למחוק את חשבון הבעלים.', acWhy_staff: 'רק הבעלים יכול למחוק חשבון עם תפקיד ניהול.', acWhy_subscription: 'לחשבון יש מנוי פעיל — צריך לבטל אותו קודם.',
  acWhy_self: 'את החשבון שלכם מוחקים מחלון החשבון.', acWhy_not_found: 'החשבון כבר לא קיים.',
  acOutAll: 'יציאה מכל המכשירים', acOutAllDone: 'יצאתם מהחשבון בכל המכשירים.',
  acIdleH: 'עדיין כאן?', acIdleP: 'לביטחונכם, ננתק אתכם בעוד {s} שניות בגלל חוסר פעילות.', acIdleStay: 'להישאר מחובר/ת', acIdleOut: 'יציאה עכשיו', acIdleGone: 'התנתקתם אחרי זמן בלי פעילות.',
  acCapL: 'בדיקת אבטחה', acCapErr: 'בדיקת האבטחה לא עברה. נסו שוב.',
  acOffensive: 'הטקסט כולל מילים שאסורות כאן. נא לשנות אותו.', acOffName: 'שם המשתמש הזה אסור. נא לבחור שם אחר.',
  acSecH: 'אבטחה', acSecP: 'הגנה מבוטים, אימות דו־שלבי, ניתוק אוטומטי וגיל מינימלי.', acTsKey: 'Site key של Cloudflare Turnstile (ריק = כבוי)',
  acTsKeyH: 'את המפתח הסודי (Secret) מדביקים ב־Supabase ← Authentication ← Bot and Abuse Protection, לא כאן.', acReqMfa: 'פעולות ניהול דורשות אימות דו־שלבי (בעלים בלבד)',
  acIdleU: 'ניתוק משתמשים רגילים אחרי (דקות בלי פעילות)', acIdleA: 'ניתוק חשבונות ניהול אחרי (דקות)', acMinAge: 'גיל מינימלי בהרשמה', acSecSave: 'שמירת הגדרות האבטחה',
  acSecOwnerOnly: 'רק הבעלים יכול לשנות את זה.', acWordsH: 'מילים חסומות',
  acWordsP: 'שמות משתמש, כינויים וביוגרפיות עם המילים האלה נדחים (מילים שלמות; אותיות שימוש בעברית, רווחים, אותיות כפולות וספרות שמחליפות אותיות מטופלים).',
  acWordAdd: 'הוספה', acWordL: 'מילה או ביטוי חדשים', acModeWord: 'מילה שלמה', acModeHword: 'מילה שלמה + אותיות שימוש', acModePrefix: 'תחילת מילה', acModePart: 'בכל מקום',
  acModePhrase: 'ביטוי', acWordRm: 'הסרת {w}', acWordsN: '{n} מילים', acWordsBad: 'אי אפשר להוסיף את זה.',
  acMfaBanner: 'הגנו על חשבון הניהול: הפעילו אימות דו־שלבי.', acMfaBannerReq: 'פעולות ניהול דורשות אימות דו־שלבי. כבעלים אתם לא ננעלים — אבל הפעילו אותו עכשיו.',
  acMfaBannerGo: 'הפעלת אימות דו־שלבי', acAge: 'אני בן/בת {n} ומעלה', acSaved: 'נשמר', acSaveFail: 'השמירה נכשלה'
},
en: {
  ac2faH: 'Two-step verification (2FA)', ac2faOff: 'Off. Add a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…) to every sign-in.',
  ac2faOn: 'On — every sign-in asks for a 6-digit code from your authenticator app.', ac2faEnable: 'Turn on 2FA', ac2faRemove: 'Remove', ac2faRemoveSure: 'Click again to remove',
  ac2faAdded: 'Added {d}', ac2faApp: 'Authenticator app', ac2faHeld: 'Your management permissions are paused until you turn on two-step verification.', ac2faErr: 'Couldn’t load the two-step verification status.',
  acEnrH: 'Turn on two-step verification', acEnr1: '1. Scan this QR code with your authenticator app (or type the key below).', acEnrKey: 'Setup key', acCopy: 'Copy', acCopied: 'Copied',
  acEnr2: '2. Enter the 6-digit code the app shows.', acCodeL: '6-digit code', acVerify: 'Verify and turn on', acEnrDone: 'Two-step verification is on.',
  acCodeBad: 'That code didn’t work. Check the time on your phone and try the newest code.', acEnrErr: 'Couldn’t start it here ({m}). Two-step verification may not be enabled for this site yet.',
  acMfaH: 'Two-step verification', acMfaP: 'Enter the 6-digit code from your authenticator app for {e}.', acMfaGo: 'Verify', acMfaOut: 'Sign out / use another account',
  acDangerH: 'Danger zone', acDelBtn: 'Delete account', acDelLead: 'Delete your account and everything in it. This can’t be undone.',
  acDelH: 'Delete your account', acDelWhat: 'This permanently deletes:', acDelL1: 'your profile, username and photo', acDelL2: 'your songs, uploaded files, analyses, export history and activity log',
  acDelL3: 'your points ({n}) and plan — they are lost and not refunded', acDelL4: 'two-step verification and every signed-in session', acDelL5: 'on this browser: your library analysis, settings and the last opened song',
  acDelKeep: 'We keep payment records (amount, date, plan) for 7 years as tax law requires — without your name or email. Song analyses you added to the shared Discover catalog stay, without any link to you.',
  acDelOwner: 'This is the site owner’s account. Hand ownership to another account before deleting it.', acDelSub: 'You have an active subscription. Cancel it in the subscription portal first, then delete the account.', acDelPortal: 'Open the subscription portal',
  acDelConfL: 'To confirm, type your username ({u}) or the word {w}', acDelWord: 'DELETE', acDelPwL: 'Current password', acDelNoPw: 'Forgot your password? Get a code by email instead',
  acDelSend: 'Email me a code', acDelSent: 'We sent a 6-digit code to {e}.', acDelCodeL: 'Code from the email', acDelTotpL: 'Code from your authenticator app', acDelGo: 'Delete my account permanently',
  acDelConfBad: 'The confirmation doesn’t match.', acDelPwBad: 'Wrong password.', acDelReauth: 'Please enter your password (or an email code) again.', acDelMfa: 'Enter the code from your authenticator app.',
  acDelFiles: 'Some files could not be removed yet. Try again.', acDelRunFiles: 'Removing your files…', acDelRunAcc: 'Deleting the account…', acDelDoneH: 'Your account was deleted',
  acDelDoneP: 'Thanks for having been with us. Everything listed was removed, and this browser is signed out.', acDelErr: 'Couldn’t delete the account ({m}). Please try again.', acOk: 'OK', acCancel: 'Cancel',
  acUdDel: 'Delete user', acUdDelH: 'Delete {u}?', acUdDelP: 'Deletes the account, their songs, files and logs. Payment records stay, without identifying details. This can’t be undone.',
  acUdDelConfL: 'To confirm, type the username ({u}) or {w}', acUdDelGo: 'Delete user permanently', acUdDelDone: 'The account was deleted.',
  acWhy_owner: 'The owner’s account can’t be deleted.', acWhy_staff: 'Only the owner can delete accounts with a management role.', acWhy_subscription: 'This account has a live subscription — it must be cancelled first.',
  acWhy_self: 'Delete your own account from the account panel.', acWhy_not_found: 'The account no longer exists.',
  acOutAll: 'Sign out of all devices', acOutAllDone: 'You were signed out on every device.',
  acIdleH: 'Still there?', acIdleP: 'For your security you’ll be signed out in {s} seconds because of inactivity.', acIdleStay: 'Stay signed in', acIdleOut: 'Sign out now', acIdleGone: 'You were signed out after a period of inactivity.',
  acCapL: 'Security check', acCapErr: 'The security check didn’t pass. Please try again.',
  acOffensive: 'This text contains words that aren’t allowed here. Please change it.', acOffName: 'This username isn’t allowed. Please choose another one.',
  acSecH: 'Security', acSecP: 'Bot protection, two-step verification, automatic sign-out and minimum age.', acTsKey: 'Cloudflare Turnstile site key (empty = off)',
  acTsKeyH: 'Paste the SECRET key in Supabase → Authentication → Bot and Abuse Protection, not here.', acReqMfa: 'Management requires two-step verification (owner only)',
  acIdleU: 'Sign out regular users after (minutes without activity)', acIdleA: 'Sign out management accounts after (minutes)', acMinAge: 'Minimum age at sign-up', acSecSave: 'Save security settings',
  acSecOwnerOnly: 'Only the owner can change this.', acWordsH: 'Blocked words',
  acWordsP: 'Usernames, display names and bios with these words are refused (whole words; Hebrew prefixes, spacing, repeated letters and look-alike digits are handled).',
  acWordAdd: 'Add', acWordL: 'New word or phrase', acModeWord: 'Whole word', acModeHword: 'Whole word + Hebrew prefixes', acModePrefix: 'Word start', acModePart: 'Anywhere',
  acModePhrase: 'Phrase', acWordRm: 'Remove {w}', acWordsN: '{n} words', acWordsBad: 'That can’t be added.',
  acMfaBanner: 'Protect this management account: turn on two-step verification.', acMfaBannerReq: 'Management requires two-step verification. As the owner you are not locked out — but turn it on now.',
  acMfaBannerGo: 'Turn on 2FA', acAge: 'I am {n} or older', acSaved: 'Saved', acSaveFail: 'Couldn’t save'
},
ar: {
  ac2faH: 'التحقق بخطوتين (2FA)', ac2faOff: 'متوقف. أضف رمزًا من تطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 1Password أو Authy…) إلى كل تسجيل دخول.',
  ac2faOn: 'مفعّل — نطلب في كل تسجيل دخول رمزًا من 6 أرقام من تطبيق المصادقة.', ac2faEnable: 'تفعيل التحقق بخطوتين', ac2faRemove: 'إزالة', ac2faRemoveSure: 'انقر مرة أخرى للإزالة',
  ac2faAdded: 'أُضيف {d}', ac2faApp: 'تطبيق مصادقة', ac2faHeld: 'صلاحيات الإدارة لديك معلّقة حتى تفعّل التحقق بخطوتين.', ac2faErr: 'تعذّر تحميل حالة التحقق بخطوتين.',
  acEnrH: 'تفعيل التحقق بخطوتين', acEnr1: '1. امسح رمز QR هذا بتطبيق المصادقة (أو اكتب المفتاح أدناه).', acEnrKey: 'مفتاح الإعداد', acCopy: 'نسخ', acCopied: 'تم النسخ',
  acEnr2: '2. أدخل الرمز المكوّن من 6 أرقام الذي يعرضه التطبيق.', acCodeL: 'رمز من 6 أرقام', acVerify: 'تحقّق وفعّل', acEnrDone: 'التحقق بخطوتين مفعّل.',
  acCodeBad: 'الرمز غير صحيح. تحقّق من ساعة هاتفك وجرّب أحدث رمز.', acEnrErr: 'تعذّر البدء هنا ({m}). ربما لم يُفعَّل التحقق بخطوتين في الموقع بعد.',
  acMfaH: 'التحقق بخطوتين', acMfaP: 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة للحساب {e}.', acMfaGo: 'تحقّق', acMfaOut: 'خروج / استخدام حساب آخر',
  acDangerH: 'منطقة خطرة', acDelBtn: 'حذف الحساب', acDelLead: 'احذف حسابك وكل ما فيه. لا يمكن التراجع عن ذلك.',
  acDelH: 'حذف حسابك', acDelWhat: 'سيُحذف نهائيًا:', acDelL1: 'ملفك الشخصي واسم المستخدم والصورة', acDelL2: 'أغانيك والملفات التي رفعتها والتحليلات وسجل التصدير وسجل النشاط',
  acDelL3: 'نقاطك ({n}) وخطتك — تضيع ولا تُستردّ', acDelL4: 'التحقق بخطوتين وكل جلسات الدخول', acDelL5: 'في هذا المتصفح: تحليل المكتبة والإعدادات وآخر أغنية فُتحت',
  acDelKeep: 'نحتفظ بسجلات الدفع (المبلغ والتاريخ والخطة) لمدة 7 سنوات كما يقتضي قانون الضرائب — بدون اسمك أو بريدك. تبقى تحليلات الأغاني التي أضفتها إلى كتالوج «اكتشف» المشترك، دون أي صلة بك.',
  acDelOwner: 'هذا حساب مالك الموقع. انقل الملكية إلى حساب آخر قبل حذفه.', acDelSub: 'لديك اشتراك فعّال. ألغِه أولًا من بوابة الاشتراك، ثم احذف الحساب.', acDelPortal: 'فتح بوابة الاشتراك',
  acDelConfL: 'للتأكيد، اكتب اسم المستخدم ({u}) أو الكلمة {w}', acDelWord: 'حذف', acDelPwL: 'كلمة المرور الحالية', acDelNoPw: 'نسيت كلمة المرور؟ احصل على رمز بالبريد بدلًا منها',
  acDelSend: 'أرسل لي رمزًا', acDelSent: 'أرسلنا رمزًا من 6 أرقام إلى {e}.', acDelCodeL: 'الرمز من البريد', acDelTotpL: 'الرمز من تطبيق المصادقة', acDelGo: 'حذف حسابي نهائيًا',
  acDelConfBad: 'التأكيد غير مطابق.', acDelPwBad: 'كلمة المرور خاطئة.', acDelReauth: 'أدخل كلمة المرور (أو رمز البريد) مرة أخرى.', acDelMfa: 'أدخل الرمز من تطبيق المصادقة.',
  acDelFiles: 'لم تُحذف بعض الملفات بعد. حاول مرة أخرى.', acDelRunFiles: 'جارٍ حذف ملفاتك…', acDelRunAcc: 'جارٍ حذف الحساب…', acDelDoneH: 'تم حذف حسابك',
  acDelDoneP: 'شكرًا لأنك كنت معنا. حُذف كل ما ذُكر، وخرج هذا المتصفح من الحساب.', acDelErr: 'تعذّر حذف الحساب ({m}). حاول مرة أخرى.', acOk: 'حسنًا', acCancel: 'إلغاء',
  acUdDel: 'حذف المستخدم', acUdDelH: 'حذف {u}؟', acUdDelP: 'يحذف الحساب وأغانيه وملفاته وسجلاته. تبقى سجلات الدفع دون تفاصيل تعريفية. لا يمكن التراجع.',
  acUdDelConfL: 'للتأكيد، اكتب اسم المستخدم ({u}) أو {w}', acUdDelGo: 'حذف المستخدم نهائيًا', acUdDelDone: 'تم حذف الحساب.',
  acWhy_owner: 'لا يمكن حذف حساب المالك.', acWhy_staff: 'المالك وحده يحذف حسابات لها دور إداري.', acWhy_subscription: 'لهذا الحساب اشتراك فعّال — يجب إلغاؤه أولًا.',
  acWhy_self: 'احذف حسابك من نافذة الحساب.', acWhy_not_found: 'الحساب لم يعد موجودًا.',
  acOutAll: 'الخروج من كل الأجهزة', acOutAllDone: 'خرجت من الحساب على كل الأجهزة.',
  acIdleH: 'ما زلت هنا؟', acIdleP: 'حفاظًا على أمانك سنُخرجك بعد {s} ثانية بسبب عدم النشاط.', acIdleStay: 'البقاء متصلًا', acIdleOut: 'الخروج الآن', acIdleGone: 'تم إخراجك بعد فترة بلا نشاط.',
  acCapL: 'فحص أمني', acCapErr: 'لم ينجح الفحص الأمني. حاول مرة أخرى.',
  acOffensive: 'يحتوي النص على كلمات غير مسموح بها هنا. يُرجى تغييره.', acOffName: 'اسم المستخدم هذا غير مسموح. اختر اسمًا آخر.',
  acSecH: 'الأمان', acSecP: 'الحماية من الروبوتات والتحقق بخطوتين والخروج التلقائي والحد الأدنى للعمر.', acTsKey: 'مفتاح الموقع لـ Cloudflare Turnstile (فارغ = متوقف)',
  acTsKeyH: 'الصق المفتاح السري (Secret) في Supabase ← Authentication ← Bot and Abuse Protection، وليس هنا.', acReqMfa: 'الإدارة تتطلب التحقق بخطوتين (للمالك فقط)',
  acIdleU: 'إخراج المستخدمين العاديين بعد (دقائق بلا نشاط)', acIdleA: 'إخراج حسابات الإدارة بعد (دقائق)', acMinAge: 'الحد الأدنى للعمر عند التسجيل', acSecSave: 'حفظ إعدادات الأمان',
  acSecOwnerOnly: 'المالك وحده يمكنه تغيير هذا.', acWordsH: 'كلمات محظورة',
  acWordsP: 'تُرفض أسماء المستخدمين والأسماء المعروضة والنبذات التي تحتوي هذه الكلمات (كلمات كاملة؛ مع مراعاة السوابق العبرية والمسافات والحروف المكررة والأرقام الشبيهة بالحروف).',
  acWordAdd: 'إضافة', acWordL: 'كلمة أو عبارة جديدة', acModeWord: 'كلمة كاملة', acModeHword: 'كلمة كاملة + سوابق عبرية', acModePrefix: 'بداية كلمة', acModePart: 'في أي مكان',
  acModePhrase: 'عبارة', acWordRm: 'إزالة {w}', acWordsN: '{n} كلمة', acWordsBad: 'لا يمكن إضافة ذلك.',
  acMfaBanner: 'احمِ حساب الإدارة هذا: فعّل التحقق بخطوتين.', acMfaBannerReq: 'الإدارة تتطلب التحقق بخطوتين. بصفتك المالك لن تُقفل — لكن فعّله الآن.',
  acMfaBannerGo: 'تفعيل التحقق بخطوتين', acAge: 'عمري {n} عامًا أو أكثر', acSaved: 'تم الحفظ', acSaveFail: 'تعذّر الحفظ'
},
ru: {
  ac2faH: 'Двухэтапная проверка (2FA)', ac2faOff: 'Выключена. Добавьте к каждому входу код из приложения-аутентификатора (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).',
  ac2faOn: 'Включена — при каждом входе мы спросим 6-значный код из приложения-аутентификатора.', ac2faEnable: 'Включить 2FA', ac2faRemove: 'Удалить', ac2faRemoveSure: 'Нажмите ещё раз для удаления',
  ac2faAdded: 'Добавлено {d}', ac2faApp: 'Приложение-аутентификатор', ac2faHeld: 'Ваши права администратора приостановлены, пока вы не включите двухэтапную проверку.', ac2faErr: 'Не удалось загрузить состояние двухэтапной проверки.',
  acEnrH: 'Включение двухэтапной проверки', acEnr1: '1. Отсканируйте QR-код приложением-аутентификатором (или введите ключ ниже).', acEnrKey: 'Ключ настройки', acCopy: 'Копировать', acCopied: 'Скопировано',
  acEnr2: '2. Введите 6-значный код из приложения.', acCodeL: '6-значный код', acVerify: 'Проверить и включить', acEnrDone: 'Двухэтапная проверка включена.',
  acCodeBad: 'Код не подошёл. Проверьте время на телефоне и введите самый свежий код.', acEnrErr: 'Не удалось начать ({m}). Возможно, двухэтапная проверка ещё не включена на сайте.',
  acMfaH: 'Двухэтапная проверка', acMfaP: 'Введите 6-значный код из приложения-аутентификатора для {e}.', acMfaGo: 'Проверить', acMfaOut: 'Выйти / войти в другой аккаунт',
  acDangerH: 'Опасная зона', acDelBtn: 'Удалить аккаунт', acDelLead: 'Удалить аккаунт со всем содержимым. Это нельзя отменить.',
  acDelH: 'Удаление аккаунта', acDelWhat: 'Безвозвратно удаляются:', acDelL1: 'профиль, имя пользователя и фото', acDelL2: 'ваши песни, загруженные файлы, анализы, история экспорта и журнал действий',
  acDelL3: 'ваши баллы ({n}) и тариф — они пропадают и не возвращаются', acDelL4: 'двухэтапная проверка и все активные сеансы', acDelL5: 'в этом браузере: анализ библиотеки, настройки и последняя открытая песня',
  acDelKeep: 'Записи о платежах (сумма, дата, тариф) хранятся 7 лет, как требует налоговое право, — без вашего имени и почты. Анализы песен, добавленные вами в общий каталог «Поиск», остаются без связи с вами.',
  acDelOwner: 'Это аккаунт владельца сайта. Передайте владение другому аккаунту перед удалением.', acDelSub: 'У вас активная подписка. Сначала отмените её на портале подписки, затем удалите аккаунт.', acDelPortal: 'Открыть портал подписки',
  acDelConfL: 'Для подтверждения введите имя пользователя ({u}) или слово {w}', acDelWord: 'УДАЛИТЬ', acDelPwL: 'Текущий пароль', acDelNoPw: 'Забыли пароль? Получите код по почте',
  acDelSend: 'Прислать код', acDelSent: 'Мы отправили 6-значный код на {e}.', acDelCodeL: 'Код из письма', acDelTotpL: 'Код из приложения-аутентификатора', acDelGo: 'Удалить аккаунт навсегда',
  acDelConfBad: 'Подтверждение не совпадает.', acDelPwBad: 'Неверный пароль.', acDelReauth: 'Введите пароль (или код из письма) ещё раз.', acDelMfa: 'Введите код из приложения-аутентификатора.',
  acDelFiles: 'Часть файлов ещё не удалена. Попробуйте снова.', acDelRunFiles: 'Удаляем ваши файлы…', acDelRunAcc: 'Удаляем аккаунт…', acDelDoneH: 'Аккаунт удалён',
  acDelDoneP: 'Спасибо, что были с нами. Всё перечисленное удалено, этот браузер вышел из аккаунта.', acDelErr: 'Не удалось удалить аккаунт ({m}). Попробуйте снова.', acOk: 'OK', acCancel: 'Отмена',
  acUdDel: 'Удалить пользователя', acUdDelH: 'Удалить {u}?', acUdDelP: 'Удаляет аккаунт, его песни, файлы и журналы. Записи о платежах остаются без идентифицирующих данных. Это нельзя отменить.',
  acUdDelConfL: 'Для подтверждения введите имя пользователя ({u}) или {w}', acUdDelGo: 'Удалить пользователя навсегда', acUdDelDone: 'Аккаунт удалён.',
  acWhy_owner: 'Аккаунт владельца удалить нельзя.', acWhy_staff: 'Аккаунты с ролью управления удаляет только владелец.', acWhy_subscription: 'У аккаунта активная подписка — сначала её нужно отменить.',
  acWhy_self: 'Свой аккаунт удаляйте в окне аккаунта.', acWhy_not_found: 'Аккаунта уже нет.',
  acOutAll: 'Выйти на всех устройствах', acOutAllDone: 'Вы вышли из аккаунта на всех устройствах.',
  acIdleH: 'Вы ещё здесь?', acIdleP: 'Для безопасности мы выйдем из аккаунта через {s} с из-за бездействия.', acIdleStay: 'Остаться в системе', acIdleOut: 'Выйти сейчас', acIdleGone: 'Вы вышли из аккаунта после периода бездействия.',
  acCapL: 'Проверка безопасности', acCapErr: 'Проверка безопасности не пройдена. Попробуйте снова.',
  acOffensive: 'Текст содержит недопустимые слова. Пожалуйста, измените его.', acOffName: 'Такое имя пользователя недопустимо. Выберите другое.',
  acSecH: 'Безопасность', acSecP: 'Защита от ботов, двухэтапная проверка, автоматический выход и минимальный возраст.', acTsKey: 'Ключ сайта Cloudflare Turnstile (пусто = выключено)',
  acTsKeyH: 'СЕКРЕТНЫЙ ключ вставляется в Supabase → Authentication → Bot and Abuse Protection, не здесь.', acReqMfa: 'Для управления нужна двухэтапная проверка (только владелец)',
  acIdleU: 'Выход обычных пользователей через (минут без активности)', acIdleA: 'Выход аккаунтов управления через (минут)', acMinAge: 'Минимальный возраст при регистрации', acSecSave: 'Сохранить настройки безопасности',
  acSecOwnerOnly: 'Изменить это может только владелец.', acWordsH: 'Запрещённые слова',
  acWordsP: 'Имена пользователей, отображаемые имена и описания с этими словами отклоняются (целые слова; учитываются еврейские приставки, пробелы, повторы букв и похожие цифры).',
  acWordAdd: 'Добавить', acWordL: 'Новое слово или фраза', acModeWord: 'Целое слово', acModeHword: 'Целое слово + еврейские приставки', acModePrefix: 'Начало слова', acModePart: 'Где угодно',
  acModePhrase: 'Фраза', acWordRm: 'Удалить {w}', acWordsN: 'Слов: {n}', acWordsBad: 'Это нельзя добавить.',
  acMfaBanner: 'Защитите этот аккаунт управления: включите двухэтапную проверку.', acMfaBannerReq: 'Для управления нужна двухэтапная проверка. Владельца это не блокирует — но включите её сейчас.',
  acMfaBannerGo: 'Включить 2FA', acAge: 'Мне {n} лет или больше', acSaved: 'Сохранено', acSaveFail: 'Не удалось сохранить'
},
es: {
  ac2faH: 'Verificación en dos pasos (2FA)', ac2faOff: 'Desactivada. Añade a cada inicio de sesión un código de una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).',
  ac2faOn: 'Activada: en cada inicio de sesión pediremos un código de 6 dígitos de tu app de autenticación.', ac2faEnable: 'Activar 2FA', ac2faRemove: 'Quitar', ac2faRemoveSure: 'Pulsa otra vez para quitar',
  ac2faAdded: 'Añadida el {d}', ac2faApp: 'App de autenticación', ac2faHeld: 'Tus permisos de gestión están en pausa hasta que actives la verificación en dos pasos.', ac2faErr: 'No se pudo cargar el estado de la verificación en dos pasos.',
  acEnrH: 'Activar la verificación en dos pasos', acEnr1: '1. Escanea este código QR con tu app de autenticación (o escribe la clave de abajo).', acEnrKey: 'Clave de configuración', acCopy: 'Copiar', acCopied: 'Copiado',
  acEnr2: '2. Escribe el código de 6 dígitos que muestra la app.', acCodeL: 'Código de 6 dígitos', acVerify: 'Verificar y activar', acEnrDone: 'La verificación en dos pasos está activada.',
  acCodeBad: 'Ese código no funcionó. Revisa la hora del teléfono y prueba el código más reciente.', acEnrErr: 'No se pudo iniciar aquí ({m}). Puede que la verificación en dos pasos aún no esté habilitada en el sitio.',
  acMfaH: 'Verificación en dos pasos', acMfaP: 'Escribe el código de 6 dígitos de tu app de autenticación para {e}.', acMfaGo: 'Verificar', acMfaOut: 'Cerrar sesión / usar otra cuenta',
  acDangerH: 'Zona de peligro', acDelBtn: 'Eliminar cuenta', acDelLead: 'Elimina tu cuenta y todo lo que contiene. No se puede deshacer.',
  acDelH: 'Eliminar tu cuenta', acDelWhat: 'Se elimina para siempre:', acDelL1: 'tu perfil, nombre de usuario y foto', acDelL2: 'tus canciones, archivos subidos, análisis, historial de exportaciones y registro de actividad',
  acDelL3: 'tus puntos ({n}) y tu plan: se pierden y no se reembolsan', acDelL4: 'la verificación en dos pasos y todas las sesiones abiertas', acDelL5: 'en este navegador: el análisis de la biblioteca, los ajustes y la última canción abierta',
  acDelKeep: 'Guardamos los registros de pago (importe, fecha, plan) 7 años, como exige la ley fiscal, sin tu nombre ni tu correo. Los análisis de canciones que añadiste al catálogo compartido de Descubrir se quedan, sin ningún vínculo contigo.',
  acDelOwner: 'Esta es la cuenta del propietario del sitio. Transfiere la propiedad a otra cuenta antes de eliminarla.', acDelSub: 'Tienes una suscripción activa. Cancélala primero en el portal de suscripción y luego elimina la cuenta.', acDelPortal: 'Abrir el portal de suscripción',
  acDelConfL: 'Para confirmar, escribe tu nombre de usuario ({u}) o la palabra {w}', acDelWord: 'ELIMINAR', acDelPwL: 'Contraseña actual', acDelNoPw: '¿Olvidaste la contraseña? Recibe un código por correo',
  acDelSend: 'Enviarme un código', acDelSent: 'Enviamos un código de 6 dígitos a {e}.', acDelCodeL: 'Código del correo', acDelTotpL: 'Código de tu app de autenticación', acDelGo: 'Eliminar mi cuenta para siempre',
  acDelConfBad: 'La confirmación no coincide.', acDelPwBad: 'Contraseña incorrecta.', acDelReauth: 'Escribe de nuevo tu contraseña (o un código del correo).', acDelMfa: 'Escribe el código de tu app de autenticación.',
  acDelFiles: 'Algunos archivos aún no se han borrado. Inténtalo de nuevo.', acDelRunFiles: 'Borrando tus archivos…', acDelRunAcc: 'Eliminando la cuenta…', acDelDoneH: 'Tu cuenta se ha eliminado',
  acDelDoneP: 'Gracias por haber estado con nosotros. Se borró todo lo indicado y este navegador cerró la sesión.', acDelErr: 'No se pudo eliminar la cuenta ({m}). Inténtalo de nuevo.', acOk: 'Aceptar', acCancel: 'Cancelar',
  acUdDel: 'Eliminar usuario', acUdDelH: '¿Eliminar a {u}?', acUdDelP: 'Elimina la cuenta, sus canciones, archivos y registros. Los registros de pago se conservan sin datos identificativos. No se puede deshacer.',
  acUdDelConfL: 'Para confirmar, escribe el nombre de usuario ({u}) o {w}', acUdDelGo: 'Eliminar usuario para siempre', acUdDelDone: 'La cuenta se ha eliminado.',
  acWhy_owner: 'La cuenta del propietario no se puede eliminar.', acWhy_staff: 'Solo el propietario puede eliminar cuentas con un rol de gestión.', acWhy_subscription: 'Esta cuenta tiene una suscripción activa: primero hay que cancelarla.',
  acWhy_self: 'Tu propia cuenta se elimina desde el panel de la cuenta.', acWhy_not_found: 'La cuenta ya no existe.',
  acOutAll: 'Cerrar sesión en todos los dispositivos', acOutAllDone: 'Cerraste la sesión en todos los dispositivos.',
  acIdleH: '¿Sigues ahí?', acIdleP: 'Por tu seguridad cerraremos la sesión en {s} segundos por inactividad.', acIdleStay: 'Seguir conectado', acIdleOut: 'Cerrar sesión ahora', acIdleGone: 'Se cerró tu sesión tras un periodo de inactividad.',
  acCapL: 'Control de seguridad', acCapErr: 'El control de seguridad no se superó. Inténtalo de nuevo.',
  acOffensive: 'El texto contiene palabras que no se permiten aquí. Cámbialo, por favor.', acOffName: 'Ese nombre de usuario no está permitido. Elige otro.',
  acSecH: 'Seguridad', acSecP: 'Protección contra bots, verificación en dos pasos, cierre automático de sesión y edad mínima.', acTsKey: 'Clave del sitio de Cloudflare Turnstile (vacío = desactivado)',
  acTsKeyH: 'La clave SECRETA se pega en Supabase → Authentication → Bot and Abuse Protection, no aquí.', acReqMfa: 'La gestión exige verificación en dos pasos (solo el propietario)',
  acIdleU: 'Cerrar sesión de usuarios normales tras (minutos sin actividad)', acIdleA: 'Cerrar sesión de cuentas de gestión tras (minutos)', acMinAge: 'Edad mínima para registrarse', acSecSave: 'Guardar ajustes de seguridad',
  acSecOwnerOnly: 'Solo el propietario puede cambiar esto.', acWordsH: 'Palabras bloqueadas',
  acWordsP: 'Se rechazan nombres de usuario, nombres visibles y biografías con estas palabras (palabras completas; se tienen en cuenta prefijos hebreos, espacios, letras repetidas y números que imitan letras).',
  acWordAdd: 'Añadir', acWordL: 'Palabra o frase nueva', acModeWord: 'Palabra completa', acModeHword: 'Palabra completa + prefijos hebreos', acModePrefix: 'Inicio de palabra', acModePart: 'En cualquier parte',
  acModePhrase: 'Frase', acWordRm: 'Quitar {w}', acWordsN: '{n} palabras', acWordsBad: 'No se puede añadir.',
  acMfaBanner: 'Protege esta cuenta de gestión: activa la verificación en dos pasos.', acMfaBannerReq: 'La gestión exige verificación en dos pasos. Como propietario no quedas bloqueado, pero actívala ya.',
  acMfaBannerGo: 'Activar 2FA', acAge: 'Tengo {n} años o más', acSaved: 'Guardado', acSaveFail: 'No se pudo guardar'
}
};
CR.addStrings(S);

const ACC = () => CR.ACC || {};
const billing = () => (ACC().config && ACC().config.billing) || {};
const signedIn = () => !!(ACC().on && ACC().user);
const uid = () => (ACC().user && ACC().user.id) || null;
const intIn = (v, lo, hi, d) => { const n = parseInt(v, 10); return isFinite(n) && n >= lo && n <= hi ? n : d; };
const minAge = () => intIn(billing().min_age, 13, 21, 16);
const fmtDate = v => { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return ''; const L = CR.getLang(); try { return d.toLocaleDateString(L === 'he' ? 'he-IL' : L === 'ar' ? 'ar-u-nu-latn' : L, { dateStyle: 'medium' }); } catch (e) { return d.toISOString().slice(0, 10); } };
const errMsg = e => String((e && (e.message || e.code)) || e || '').replace(/\s+/g, ' ').slice(0, 120);
function busy(btn, on) { if (!btn) return; btn.disabled = !!on; btn.classList.toggle('ld', !!on); if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); }
function msg(el, text, kind) { if (!el) return; el.textContent = text || ''; el.className = 'acmsg' + (kind ? ' ' + kind : ''); el.hidden = !text; }

/* ---------- TEXTGUARD: the same rules as private.is_offensive (schema.sql [A-4]) ---------- */
const TEXTGUARD = (() => {
  const NIQ = /[֑-ֽֿ-ׇ׳״]/g, ARD = /[ً-ٰٟـ]/g;
  const tr = (s, a, b) => { const A = [...a], Bc = [...b], m = new Map(A.map((c, i) => [c, Bc[i]])); return [...s].map(c => m.has(c) ? m.get(c) : c).join(''); };
  function norm(p) {
    let s = [...String(p == null ? '' : p).toLowerCase()].slice(0, 4000).join('');
    s = s.replace(NIQ, '');
    s = tr(s, 'ךםןףץ', 'כמנפצ');
    s = s.replace(ARD, '');
    s = tr(s, 'أإآٱةىؤئ', 'ااااهيوي');
    s = s.replace(/ё/g, 'е');
    s = tr(s, 'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ', 'aaaaaaeeeeiiiiooooouuuuncyy');
    s = tr(s, '01345789', 'oieastbg');
    return s.replace(/@(?=[a-z])/g, 'a').replace(/\$(?=[a-z])/g, 's').replace(/[!|](?=[a-z])/g, 'i').replace(/\+(?=[a-z])/g, 't');
  }
  const tokens = p => norm(p).match(/[a-z]+|[א-ת]+|[ء-ي]+|[а-я]+/g) || [];
  const r2 = x => x.replace(/(.)\1{2,}/g, '$1$1'), r1 = x => x.replace(/(.)\1+/g, '$1');
  const key = p => tokens(p).map(r2).join(' ');
  /* the built-in list = the seed in schema.sql [A-4] (tools/tests compare them) */
  const BASE = [
    ['shit','word'],['shits','word'],['shitty','word'],['shithead','word'],['bullshit','word'],['bitch','word'],['bitches','word'],['bastard','word'],
    ['bastards','word'],['asshole','word'],['assholes','word'],['cunt','word'],['cunts','word'],['twat','word'],['wanker','word'],['whore','word'],
    ['whores','word'],['slut','word'],['sluts','word'],['fag','word'],['fags','word'],['faggot','word'],['faggots','word'],['retard','word'],
    ['retards','word'],['retarded','word'],['kike','word'],['kikes','word'],['spic','word'],['spics','word'],['chink','word'],['chinks','word'],
    ['gook','word'],['wetback','word'],['tranny','word'],['dickhead','word'],['kys','word'],['rapist','word'],['nigger','word'],['niggers','word'],
    ['nigga','word'],['niggas','word'],['niggaz','word'],['fuck','part'],['kill yourself','phrase'],['heil hitler','phrase'],['sieg heil','phrase'],
    ['white power','phrase'],
    ['זונה','hword'],['זונות','hword'],['שרמוטה','hword'],['שרמוטות','hword'],['שרמוט','hword'],['הזדיין','hword'],['תזדיין','hword'],['תזדייני','hword'],
    ['תזדיינו','hword'],['מזדיין','hword'],['מזדיינת','hword'],['מזדיינים','hword'],['זיון','word'],['זין','word'],['כוסאמק','word'],['כוסעמק','word'],
    ['כוסומו','word'],['כוס אמק','phrase'],['כוס עמק','phrase'],['כוס אמא שלך','phrase'],['ערבוש','hword'],['ערבושים','hword'],['כושי','hword'],
    ['כושים','hword'],['כושית','hword'],['קוקסינל','hword'],['מניאק','hword'],['מניאקים','hword'],['חרא','hword'],['מוות לערבים','phrase'],
    ['מוות ליהודים','phrase'],['sharmuta','word'],['sharmouta','word'],['sharmota','word'],['kusemek','word'],['kusemak','word'],['kusomo','word'],
    ['manyak','word'],['ben zona','phrase'],['kus emak','phrase'],
    ['شرموطه','word'],['شرموط','word'],['شراميط','word'],['قحبه','word'],['قحاب','word'],['عاهره','word'],['منيوك','word'],['منيك','word'],['متناك','word'],
    ['كسمك','word'],['كس','word'],['زب','word'],['خول','word'],['كس امك','phrase'],['ابن الكلب','phrase'],['ابن القحبه','phrase'],
    ['пизд','prefix'],['хуй','prefix'],['хуе','prefix'],['хуя','prefix'],['бляд','prefix'],['блят','prefix'],['бля','word'],['ебан','prefix'],['ебат','prefix'],
    ['ебал','prefix'],['ебл','prefix'],['ебу','prefix'],['нахуй','word'],['похуй','word'],['охуеть','word'],['охуел','word'],['заебал','word'],['заебись','word'],
    ['отъебись','word'],['мудак','prefix'],['мудил','prefix'],['пидор','prefix'],['пидар','prefix'],['шлюх','prefix'],['залуп','prefix'],['гандон','prefix'],
    ['сука','word'],['суки','word'],['сучка','word'],
    ['puta','word'],['putas','word'],['puto','word'],['putos','word'],['mierda','word'],['cabron','word'],['cabrona','word'],['cabrones','word'],
    ['pendejo','word'],['pendeja','word'],['pendejos','word'],['gilipollas','word'],['maricon','word'],['maricones','word'],['joder','word'],['culero','word'],
    ['verga','word'],['chinga','word'],['chingada','word'],['chingado','word'],['chingar','word'],['chingate','word']
  ];
  const entry = (raw, mode) => { const k = key(raw); let m = mode || 'word'; if (k.includes(' ')) m = 'phrase'; else if (m === 'phrase') m = 'word';
    return [...k].length >= 2 && [...k].length <= 60 ? { w: k, w1: r1(k), m } : null; };
  let LIST = BASE.map(e => entry(e[0], e[1])).filter(Boolean);
  const HP = /^[והשבלכ]+$/;
  function offensive(p) {
    if (p == null || String(p).trim() === '') return false;
    const toks = tokens(p); if (!toks.length) return false;
    const extra = []; let run = '', n = 0;
    for (const x of toks) { if ([...x].length === 1) { run += x; n++; } else { if (n >= 3) extra.push(run); run = ''; n = 0; } }
    if (n >= 3) extra.push(run);
    const all = toks.concat(extra), tk = all.map(x => ({ a: r2(x), b: r1(x), s: r2(x) !== x }));   // s: stretched (3+ equal letters)
    const c2 = r2(all.join('')), c1 = r1(c2), line = ' ' + toks.map(r2).join(' ') + ' ';
    return LIST.some(w => {
      const L1 = [...w.w1].length >= 4, ok = x => x.a === w.w || (x.s && L1 && x.b === w.w1);
      if ((w.m === 'word' || w.m === 'hword') && tk.some(ok)) return true;
      if (w.m === 'hword' && tk.some(x => [1, 2].some(k => { const A = [...x.a]; if (A.length - k < 3 || !HP.test(A.slice(0, k).join(''))) return false;
        const rest = A.slice(k).join(''); return rest === w.w || (x.s && L1 && r1(rest) === w.w1); }))) return true;
      if (w.m === 'prefix' && tk.some(x => x.a.startsWith(w.w) || (x.s && L1 && x.b.startsWith(w.w1)))) return true;
      if (w.m === 'part' && (c2.includes(w.w) || (w.w === w.w1 && c1.includes(w.w1)))) return true;
      if (w.m === 'phrase' && line.includes(' ' + w.w + ' ')) return true;
      return false;
    });
  }
  // admin-added words (the server stays authoritative; this only makes the instant check closer to it)
  const learn = rows => { if (!Array.isArray(rows)) return; const seen = new Set(LIST.map(e => e.w));
    for (const r of rows) { const e = r && typeof r.word === 'string' ? entry(r.word, r.mode) : null; if (e && !seen.has(e.w)) { LIST.push(e); seen.add(e.w); } } };
  return { offensive, norm, tokens, key, BASE, learn, _list: () => LIST.slice() };
})();
window.TEXTGUARD = TEXTGUARD;
CR.offensive = TEXTGUARD.offensive;

/* ---------- small modal helper (focus trap, Esc, focus return) ---------- */
function modal(o) {
  const ret = document.activeElement;
  const w = document.createElement('div');
  w.className = 'dlgwrap acwrap' + (o.cls ? ' ' + o.cls : ''); w.id = o.id;
  w.innerHTML = `<div class="dlg acdlg" role="${o.role || 'dialog'}" aria-modal="true" aria-labelledby="${o.id}H"${o.desc ? ` aria-describedby="${o.id}D"` : ''}>${o.body}</div>`;
  const old = document.getElementById(o.id); if (old) old.remove();
  document.body.appendChild(w); document.documentElement.classList.add('dlg-open');
  let closed = false;
  const close = v => {
    if (closed) return; closed = true; w.remove();
    if (!document.querySelector('.dlgwrap.acwrap,.dlgwrap.sepc')) document.documentElement.classList.remove('dlg-open');
    if (ret && ret.isConnected && ret.getClientRects().length && !o.noReturn) ret.focus({ preventScroll: true });
    if (o.onClose) o.onClose(v);
  };
  const FOC = 'button:not([disabled]),[href],input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  w.addEventListener('keydown', e => {
    if (e.key === 'Escape' && o.esc !== false) { e.preventDefault(); e.stopPropagation(); close(null); return; }
    if (e.key !== 'Tab') return;
    const f = [...w.querySelectorAll(FOC)].filter(x => x.getClientRects().length && !x.closest('[hidden]'));
    if (!f.length) return; const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === a || !w.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && (document.activeElement === z || !w.contains(document.activeElement))) { e.preventDefault(); a.focus(); }
  });
  if (o.outside !== false) { let down = null; w.addEventListener('mousedown', e => { down = e.target; }); w.addEventListener('click', e => { if (e.target === w && down === w) close(null); }); }
  setTimeout(() => { if (closed) return; const vis = x => x && x.getClientRects().length && !x.closest('[hidden]');
    const f = [...w.querySelectorAll('[data-af]')].find(vis) || [...w.querySelectorAll('input:not([type=hidden]),button')].find(vis) || w.querySelector('.dlg');
    if (f) { if (f.classList.contains('dlg')) f.tabIndex = -1; f.focus({ preventScroll: true }); } }, 30);
  return { w, close, q: s => w.querySelector(s), qa: s => [...w.querySelectorAll(s)], get closed() { return closed; } };
}
const otpField = (id, label) => `<div class="fld"><label for="${id}">${esc(label)}</label><input type="text" id="${id}" class="acotp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" dir="ltr" spellcheck="false"></div>`;
const digits = el => String(el && el.value || '').replace(/\D/g, '').slice(0, 6);
function wireDigits(el) { if (el) el.addEventListener('input', () => { const v = digits(el); if (v !== el.value) el.value = v; }); }

/* ---------- CAP: Cloudflare Turnstile for Supabase Auth (only with billing.turnstile_site_key) ---------- */
const CAP = { s: null, w: new Map() };
const capKey = () => { const k = String(billing().turnstile_site_key || '').trim(); return /^[0-9]x[A-Za-z0-9_-]{10,80}$/.test(k) ? k : ''; };
function capLoad() {
  if (window.turnstile && window.turnstile.render) return Promise.resolve(window.turnstile);
  if (!CAP.s) CAP.s = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.referrerPolicy = 'strict-origin-when-cross-origin';
    s.onload = () => (window.turnstile && window.turnstile.render ? ok(window.turnstile) : no(new Error('turnstile')));
    s.onerror = () => { CAP.s = null; s.remove(); no(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return CAP.s;
}
function capSlot(id, where, before) {
  let el = document.getElementById(id);
  if (!el && where) { el = document.createElement('div'); el.id = id; el.className = 'accap'; el.hidden = true; el.setAttribute('role', 'group'); where.insertBefore(el, before || null); }
  if (el) el.setAttribute('aria-label', t('acCapL'));
  return el;
}
async function capRender(slot, action) {
  const k = capKey(); if (!k || !slot) return null;
  let st = CAP.w.get(slot);
  if (st && st.key === k && slot.isConnected) return st;
  const ts = await capLoad();
  if (st && st.id != null) { try { ts.remove(st.id); } catch (e) {} }
  st = { key: k, id: null, token: '', at: 0, wait: [] }; CAP.w.set(slot, st);
  slot.hidden = false; slot.textContent = '';
  const L = CR.getLang(), dark = document.documentElement.dataset.themeResolved === 'dark';
  st.id = ts.render(slot, {
    sitekey: k, action: String(action || 'auth').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'auth', theme: dark ? 'dark' : 'light', language: L,
    appearance: 'interaction-only', size: 'flexible', 'refresh-expired': 'auto', 'response-field': false,
    callback: tok => { st.token = String(tok || ''); st.at = Date.now(); st.err = false; st.wait.splice(0).forEach(f => f(st.token)); },
    'expired-callback': () => { st.token = ''; },
    'error-callback': () => { st.token = ''; st.err = true; st.wait.splice(0).forEach(f => f('')); return true; }
  });
  return st;
}
// a fresh single-use token from the widget in `slot` (rendered now if needed); '' = the check failed
async function capToken(slot, action) {
  let st; try { st = await capRender(slot, action); } catch (e) { return ''; }
  if (!st) return undefined;
  const ts = window.turnstile;
  let tok = st.token && Date.now() - st.at < 280000 ? st.token : '';
  if (!tok) tok = await new Promise(ok => {
    st.wait.push(ok); setTimeout(() => ok(''), 60000);
    if (st.err) { st.err = false; try { ts.reset(st.id); } catch (e) { ok(''); } }   // a widget in error state: try once more
  });
  st.token = '';
  setTimeout(() => { try { if (ts && st.id != null) ts.reset(st.id); } catch (e) {} }, 0);   // tokens are single-use: get the next one ready
  return tok;
}
function capSlotFor() {
  const vis = sel => { const e = $(sel); return e && !e.hidden; };
  const del = document.querySelector('#acDelDlg .accap'); if (del) return del;
  if (vis('#authDlg')) return capSlot('acCapAu', $('#authDlg .au-main'), $('#auFoot'));
  if (vis('#acc')) return capSlot('acCapAcc', $('#fPass'), $('#fPass .row2'));
  let w = $('#acCapDlg');
  if (!w) { const m = modal({ id: 'acCapDlg', body: `<h3 id="acCapDlgH">${esc(t('acCapL'))}</h3><div class="accap"></div>`, outside: false }); w = m.w; }
  return w.querySelector('.accap');
}
Backend_hook();
function Backend_hook() {
  const b = B(); if (!b || typeof b !== 'object') return;
  b.captcha = async action => {
    if (!capKey()) return undefined;
    const slot = capSlotFor(); const tok = await capToken(slot, action);
    const d = $('#acCapDlg'); if (d) d.remove();
    if (tok === '') { const e = new Error('captcha'); e.code = 'captcha'; throw e; }
    return tok;
  };
}
// the auth dialog / account panel get their widget ready as soon as they open (the token is ready by submit time)
function capPrep() {
  if (!capKey()) { for (const id of ['acCapAu', 'acCapAcc']) { const el = document.getElementById(id); if (el) el.hidden = true; } return; }
  if (!$('#authDlg').hidden) capRender(capSlot('acCapAu', $('#authDlg .au-main'), $('#auFoot')), 'auth').catch(() => {});
}

/* ---------- MFA: account panel section, enrolment, the sign-in code step ---------- */
const MFA = { factors: null, loading: false };
async function mfaLoad() {
  const b = B(); if (!b.mfaFactors || !signedIn()) { MFA.factors = null; return; }
  MFA.loading = true;
  try { MFA.factors = await b.mfaFactors(); MFA.err = false; } catch (e) { MFA.factors = null; MFA.err = true; }
  MFA.loading = false;
}
const mfaOn = () => !!(MFA.factors && MFA.factors.some(f => f.status === 'verified'));
function accSections() {
  const bd = $('#acc .bd'); if (!bd || !signedIn()) return;
  if (!$('#acMfa')) {
    const sec = document.createElement('div'); sec.id = 'acMfaWrap';
    sec.innerHTML = `<div class="sech" id="acMfaH"></div><section class="acbox" id="acMfa" aria-labelledby="acMfaH"><p class="snote" id="acMfaSt"></p><ul class="acfac" id="acMfaList"></ul>
      <p class="acmsg warn" id="acMfaHeld" hidden></p><div class="row2"><button type="button" class="btn solid" id="acMfaOn"></button></div></section>`;
    bd.insertBefore(sec, $('#signOutBtn'));
    $('#acMfaOn').onclick = () => openEnroll();
  }
  if (!$('#acOutAll')) {
    const so = $('#signOutBtn'), row = document.createElement('div'); row.className = 'row2 acout'; so.replaceWith(row); row.append(so);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost'; b.id = 'acOutAll'; row.append(b);
    b.onclick = async () => { busy(b, true); try { await B().signOutAll(); CR.toast(t('acOutAllDone')); } catch (e) { CR.toast(t('acSaveFail')); } busy(b, false); $('#acc').hidden = true; };
  }
  if (!$('#acDanger')) {
    const d = document.createElement('section'); d.id = 'acDanger'; d.className = 'acdanger'; d.setAttribute('aria-labelledby', 'acDangerH');
    d.innerHTML = `<h4 id="acDangerH"></h4><p class="snote" id="acDangerP"></p><div class="row2"><button type="button" class="btn acdanger-btn" id="acDelBtn"></button></div>`;
    bd.append(d); $('#acDelBtn').onclick = () => openDelete();
  }
  accPaint();
}
function accPaint() {
  if (!$('#acMfa')) return;
  $('#acMfaH').textContent = t('ac2faH');
  const on = mfaOn(), st = $('#acMfaSt');
  st.textContent = MFA.err ? t('ac2faErr') : on ? t('ac2faOn') : t('ac2faOff'); st.classList.toggle('on', on);
  const ul = $('#acMfaList'); ul.textContent = '';
  for (const f of (MFA.factors || []).filter(x => x.status === 'verified')) {
    const li = document.createElement('li'), nm = document.createElement('span'), rm = document.createElement('button');
    nm.textContent = t('ac2faApp') + (f.created_at ? ' · ' + t('ac2faAdded', { d: fmtDate(f.created_at) }) : '');
    rm.type = 'button'; rm.className = 'btn ghost'; rm.textContent = t('ac2faRemove');
    rm.onclick = async () => {
      if (!rm.classList.contains('arm')) { rm.classList.add('arm'); rm.textContent = t('ac2faRemoveSure'); setTimeout(() => { if (rm.isConnected) { rm.classList.remove('arm'); rm.textContent = t('ac2faRemove'); } }, 4000); return; }
      busy(rm, true); try { await B().mfaUnenroll(f.id); } catch (e) { CR.toast(t('acSaveFail')); } await mfaLoad(); accPaint(); adminBanner();
    };
    li.append(nm, rm); ul.append(li);
  }
  ul.hidden = !ul.children.length;
  const onBtn = $('#acMfaOn'); onBtn.textContent = t('ac2faEnable'); onBtn.hidden = on || MFA.err || !B().mfaEnroll;
  const acc = ACC().access || {}, held = $('#acMfaHeld'); held.hidden = !(acc.mfa && acc.mfa.held && !on); held.textContent = t('ac2faHeld');
  $('#acOutAll').textContent = t('acOutAll');
  $('#acDangerH').textContent = t('acDangerH'); $('#acDangerP').textContent = t('acDelLead'); $('#acDelBtn').textContent = t('acDelBtn');
}
async function openEnroll() {
  const b = B(); if (!b.mfaEnroll) return;
  const m = modal({ id: 'acEnr', desc: true, body: `<div class="dh"><h3 id="acEnrH">${esc(t('acEnrH'))}</h3></div>
    <div id="acEnrD"><p>${esc(t('acEnr1'))}</p><div class="acqr" id="acQr" aria-hidden="true"></div>
    <div class="fld"><label for="acKey">${esc(t('acEnrKey'))}</label><div class="row2"><input type="text" id="acKey" readonly dir="ltr" class="mono"><button type="button" class="btn ghost" id="acKeyCp">${esc(t('acCopy'))}</button></div></div>
    <p>${esc(t('acEnr2'))}</p>${otpField('acEnrCode', t('acCodeL'))}</div>
    <p class="acmsg" id="acEnrMsg" role="alert" hidden></p>
    <div class="row2"><button type="button" class="btn solid" id="acEnrGo">${esc(t('acVerify'))}</button><button type="button" class="btn ghost" id="acEnrNo">${esc(t('acCancel'))}</button></div>` });
  m.q('#acEnrNo').onclick = () => m.close(null);
  m.q('#acEnrCode').setAttribute('data-af', ''); wireDigits(m.q('#acEnrCode'));
  let f = null;
  try { f = await b.mfaEnroll((ACC().profile && ACC().profile.username) || 'Chord Room'); }
  catch (e) { msg(m.q('#acEnrMsg'), t('acEnrErr', { m: errMsg(e) }), 'err'); m.q('#acEnrGo').disabled = true; return; }
  if (m.closed) return;
  const qr = String(f.qr || '');
  if (/^data:image\/svg\+xml[;,]/.test(qr)) { const im = document.createElement('img'); im.alt = ''; im.width = 180; im.height = 180; im.src = qr; m.q('#acQr').append(im); }   // a data: image only (CSP img-src data:)
  else m.q('#acQr').hidden = true;
  m.q('#acKey').value = String(f.secret || '').replace(/[^A-Z2-7=]/gi, '');
  m.q('#acKeyCp').onclick = async () => { const v = m.q('#acKey').value; try { await navigator.clipboard.writeText(v); } catch (e) { m.q('#acKey').select(); } m.q('#acKeyCp').textContent = t('acCopied'); };
  const go = async () => {
    const code = digits(m.q('#acEnrCode')); if (code.length !== 6) { msg(m.q('#acEnrMsg'), t('acCodeL'), 'err'); m.q('#acEnrCode').focus(); return; }
    busy(m.q('#acEnrGo'), true);
    try { await b.mfaVerify(f.id, code); }
    catch (e) { busy(m.q('#acEnrGo'), false); msg(m.q('#acEnrMsg'), e && e.code === 'otp' ? t('acCodeBad') : t('acEnrErr', { m: errMsg(e) }), 'err'); m.q('#acEnrCode').value = ''; m.q('#acEnrCode').focus(); return; }
    m.close('ok'); CR.toast(t('acEnrDone'));
    await mfaLoad(); accPaint(); refreshAccess();
  };
  m.q('#acEnrGo').onclick = go;
  m.q('#acEnrCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  m.q('#acEnrCode').addEventListener('input', () => { if (digits(m.q('#acEnrCode')).length === 6) go(); });
  m.q('#acEnrCode').focus();
}
async function refreshAccess() { try { const b = B(); if (b.myAccess && signedIn()) { ACC().access = await b.myAccess(); } } catch (e) {} adminBanner(); accPaint(); }
// the sign-in's second step (Backend dispatches 'cr-mfa' when a 2FA account signed in with its password)
function mfaChallenge() {
  const b = B(), info = b.mfaPendingInfo ? b.mfaPendingInfo() : null;
  if (!info || $('#acMfaDlg')) return;
  const m = modal({ id: 'acMfaDlg', desc: true, esc: false, outside: false, body: `<div class="dh"><h3 id="acMfaDlgH">${esc(t('acMfaH'))}</h3></div>
    <p id="acMfaDlgD"></p>${otpField('acMfaCode', t('acCodeL'))}<p class="acmsg" id="acMfaMsg" role="alert" hidden></p>
    <div class="row2"><button type="button" class="btn solid" id="acMfaGo">${esc(t('acMfaGo'))}</button><button type="button" class="btn ghost" id="acMfaNo">${esc(t('acMfaOut'))}</button></div>` });
  m.q('#acMfaDlgD').textContent = t('acMfaP', { e: '⁨' + info.email + '⁩' });
  wireDigits(m.q('#acMfaCode'));
  const go = async () => {
    const code = digits(m.q('#acMfaCode')); if (code.length !== 6) { m.q('#acMfaCode').focus(); return; }
    busy(m.q('#acMfaGo'), true);
    try { await b.mfaSignInVerify(code); m.close('ok'); }
    catch (e) { busy(m.q('#acMfaGo'), false); msg(m.q('#acMfaMsg'), e && e.code === 'otp' ? t('acCodeBad') : t('acEnrErr', { m: errMsg(e) }), 'err'); m.q('#acMfaCode').value = ''; m.q('#acMfaCode').focus(); }
  };
  m.q('#acMfaGo').onclick = go;
  m.q('#acMfaCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  m.q('#acMfaCode').addEventListener('input', () => { if (digits(m.q('#acMfaCode')).length === 6 && !m.q('#acMfaGo').disabled) go(); });
  m.q('#acMfaNo').onclick = async () => { m.close(null); try { await b.mfaAbort(); } catch (e) {} };
}
document.addEventListener('cr-mfa', e => { if (e.detail && e.detail.pending) setTimeout(mfaChallenge, 60); });

/* ---------- DEL: delete my account / delete a user (admin) ---------- */
const LIVE = ['active', 'on_trial', 'past_due', 'paused'];
function portalHref() {
  const c = ACC().cred || {}, v = c.pay_portal;
  if (!v || !/^https:\/\//.test(v)) return null;
  try { const u = new URL(v); const exp = +u.searchParams.get('expires'); if (exp && exp * 1000 < Date.now() + 60000) u.search = ''; return u.href; } catch (e) { return null; }
}
const delWhy = why => why === 'confirm' ? t('acDelConfBad') : why === 'reauth' ? t('acDelReauth') : why === 'mfa' ? t('acDelMfa') : why === 'files_left' ? t('acDelFiles')
  : why === 'owner' ? t('acDelOwner') : why === 'subscription' ? t('acDelSub') : CR.t('acWhy_' + why) !== 'acWhy_' + why ? t('acWhy_' + why) : t('acDelErr', { m: String(why || '') });
async function openDelete() {
  if (!signedIn()) return;
  const b = B(), pr = ACC().profile || {};
  // fresh owner / subscription state (the dialog must not offer a deletion the server will refuse)
  let owner = !!ACC().owner;
  try { if (b.myAccess) { const a = await b.myAccess(); if (a) owner = !!a.owner; } } catch (e) {}
  try { if (CR.refreshPoints) await CR.refreshPoints(); } catch (e) {}
  const c = ACC().cred || {}, live = !!(c.pay_status && LIVE.includes(c.pay_status));
  if (MFA.factors === null) await mfaLoad();
  const need2fa = mfaOn(), word = t('acDelWord'), uname = pr.username || '';
  const items = [t('acDelL1'), t('acDelL2'), t('acDelL3', { n: '⁦' + (c.credits || 0) + '⁩' }), t('acDelL4'), t('acDelL5')];
  const m = modal({ id: 'acDelDlg', cls: 'acdelw', desc: true, body: `<div class="dh"><h3 id="acDelDlgH">${esc(t('acDelH'))}</h3></div>
    <div id="acDelDlgD"><p><b>${esc(t('acDelWhat'))}</b></p><ul class="acdel-list">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="snote">${esc(t('acDelKeep'))}</p></div>
    ${owner ? `<p class="acmsg err" role="alert">${esc(t('acDelOwner'))}</p>` : ''}
    ${live ? `<p class="acmsg err" role="alert">${esc(t('acDelSub'))}${portalHref() ? ` <a id="acDelPortal" target="_blank" rel="noopener">${esc(t('acDelPortal'))}</a>` : ''}</p>` : ''}
    <form id="acDelF" class="fset" novalidate${owner || live ? ' hidden' : ''}>
      <div class="fld"><label for="acDelConf" id="acDelConfL"></label><input type="text" id="acDelConf" autocomplete="off" spellcheck="false" dir="auto" data-af></div>
      <div class="fld" id="acDelPwF"><label for="acDelPw">${esc(t('acDelPwL'))}</label><input type="password" id="acDelPw" autocomplete="current-password"></div>
      <p class="acalt"><button type="button" class="lnk" id="acDelNoPw">${esc(t('acDelNoPw'))}</button></p>
      <div id="acDelOtpF" hidden><div class="row2"><button type="button" class="btn ghost" id="acDelSend">${esc(t('acDelSend'))}</button></div>${otpField('acDelCode', t('acDelCodeL'))}</div>
      ${need2fa ? otpField('acDelTotp', t('acDelTotpL')) : ''}
      <div class="accap" hidden></div>
      <p class="acmsg" id="acDelMsg" role="alert" hidden></p>
      <div class="row2"><button type="submit" class="btn acdanger-btn" id="acDelGo">${esc(t('acDelGo'))}</button><button type="button" class="btn ghost" id="acDelNo">${esc(t('acCancel'))}</button></div>
    </form>
    ${owner || live ? `<div class="row2"><button type="button" class="btn ghost" id="acDelNo2">${esc(t('acCancel'))}</button></div>` : ''}`,
    onClose: () => { if (b.reauthDone) b.reauthDone(); } });
  const pl = m.q('#acDelPortal'); if (pl) pl.href = portalHref();
  const cl = m.q('#acDelConfL'); if (cl) cl.textContent = t('acDelConfL', { u: uname ? '@' + uname : '—', w: word });
  for (const id of ['#acDelNo', '#acDelNo2']) { const x = m.q(id); if (x) x.onclick = () => m.close(null); }
  if (owner || live) return;
  wireDigits(m.q('#acDelCode')); wireDigits(m.q('#acDelTotp'));
  const st = { otp: false, reauthed: false };
  m.q('#acDelNoPw').onclick = () => { st.otp = true; m.q('#acDelPwF').hidden = true; m.q('#acDelNoPw').parentElement.hidden = true; m.q('#acDelOtpF').hidden = false; m.q('#acDelSend').focus(); };
  m.q('#acDelSend').onclick = async () => {
    const btn = m.q('#acDelSend'); busy(btn, true);
    try { await b.sendReauthCode(); msg(m.q('#acDelMsg'), t('acDelSent', { e: '⁨' + ((ACC().user || {}).email || '') + '⁩' }), 'ok'); m.q('#acDelCode').focus(); }
    catch (e) { msg(m.q('#acDelMsg'), e && e.code === 'captcha' ? t('acCapErr') : e && e.code === 'rate' ? t('acDelErr', { m: errMsg(e) }) : t('acDelErr', { m: errMsg(e) }), 'err'); }
    busy(btn, false); setTimeout(() => { if (btn.isConnected) btn.disabled = false; }, 30000); btn.disabled = true;
  };
  const conf = () => { const v = m.q('#acDelConf').value.trim().toLowerCase(); return v && (v === word.toLowerCase() || ['delete', 'מחק', 'حذف', 'удалить', 'eliminar'].includes(v) || (uname && (v === uname.toLowerCase() || v === '@' + uname.toLowerCase()))); };
  m.q('#acDelF').addEventListener('submit', async e => {
    e.preventDefault();
    const out = m.q('#acDelMsg'), go = m.q('#acDelGo');
    if (go.disabled) return;
    if (!conf()) { msg(out, t('acDelConfBad'), 'err'); m.q('#acDelConf').focus(); return; }
    const pw = m.q('#acDelPw').value, code = digits(m.q('#acDelCode')), totp = digits(m.q('#acDelTotp'));
    if (!st.reauthed && !st.otp && !pw) { msg(out, t('acDelReauth'), 'err'); m.q('#acDelPw').focus(); return; }
    if (!st.reauthed && st.otp && code.length !== 6) { msg(out, t('acDelReauth'), 'err'); m.q('#acDelCode').focus(); return; }
    if (need2fa && totp.length !== 6) { msg(out, t('acDelMfa'), 'err'); m.q('#acDelTotp').focus(); return; }
    busy(go, true); msg(out, '');
    try {
      if (!st.reauthed) {
        try { if (st.otp) await b.verifyReauthCode(code); else await b.reauthPassword(pw); }
        catch (x) { busy(go, false); msg(out, x && x.code === 'curpass' ? t('acDelPwBad') : x && x.code === 'otp' ? t('acCodeBad') : x && x.code === 'captcha' ? t('acCapErr') : t('acDelErr', { m: errMsg(x) }), 'err'); (st.otp ? m.q('#acDelCode') : m.q('#acDelPw')).focus(); return; }
        st.reauthed = true; m.q('#acDelPw').value = '';
      }
      if (need2fa) {
        const fs = (MFA.factors || []).filter(f => f.status === 'verified');
        try { await b.mfaVerify(fs[0].id, totp); }
        catch (x) { busy(go, false); msg(out, x && x.code === 'otp' ? t('acCodeBad') : t('acDelErr', { m: errMsg(x) }), 'err'); m.q('#acDelTotp').value = ''; m.q('#acDelTotp').focus(); return; }
      }
      const me = uid(), confirmText = m.q('#acDelConf').value.trim().replace(/^@/, '');
      const r = await b.deleteMyAccount(confirmText, step => msg(out, step === 'files' ? t('acDelRunFiles') : t('acDelRunAcc'), 'info'));
      if (!r || !r.ok) {
        busy(go, false); msg(out, delWhy(r && r.why), 'err');
        if (r && r.why === 'reauth') { st.reauthed = false; m.q('#acDelPw').focus(); }
        return;
      }
      await clearLocal(me);
      m.close('done'); $('#acc').hidden = true;
      deletedNotice();
    } catch (x) { busy(go, false); msg(out, t('acDelErr', { m: errMsg(x) }), 'err'); }
  });
}
function deletedNotice() {
  const m = modal({ id: 'acDelDone', role: 'alertdialog', desc: true, noReturn: true, body: `<div class="dh"><h3 id="acDelDoneH">${esc(t('acDelDoneH'))}</h3></div><p id="acDelDoneD">${esc(t('acDelDoneP'))}</p>
    <div class="row2"><button type="button" class="btn solid" id="acDelDoneOk">${esc(t('acOk'))}</button></div>`, onClose: () => { try { CR.showView('about'); } catch (e) {} } });
  m.q('#acDelDoneOk').onclick = () => m.close('ok');
}
// this browser's data of an account that no longer exists: per-account keys (…:<uid>), journal entries, the remembered song
async function clearLocal(id) {
  if (!id) return;
  try {
    const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));   // a snapshot: removing reorders keys
    for (const k of keys) {
      if (!k || !/^chordroom/.test(k)) continue;
      if (k.endsWith(':' + id) || k.includes(id)) { localStorage.removeItem(k); continue; }
      if (k === 'chordroom.payjobs.v1') {   // the batch-charge journal (an array of {id, uid, …}): keep other accounts' jobs
        try { const a = JSON.parse(localStorage.getItem(k) || '[]'), n = Array.isArray(a) ? a.filter(j => j && j.uid !== id) : [];
          if (n.length) localStorage.setItem(k, JSON.stringify(n)); else localStorage.removeItem(k); } catch (e) { localStorage.removeItem(k); }
      }
    }
    const sk = []; for (let i = 0; i < sessionStorage.length; i++) sk.push(sessionStorage.key(i));
    for (const k of sk) if (k && k.includes(id)) sessionStorage.removeItem(k);
  } catch (e) {}
  try {
    await new Promise(ok => {
      const r = indexedDB.open('chordroom', 1);
      r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) {} };
      r.onerror = () => ok();
      r.onsuccess = () => {
        const db = r.result; let tx;
        try { tx = db.transaction('kv', 'readwrite'); } catch (e) { db.close(); ok(); return; }
        const s = tx.objectStore('kv'); let audioMine = false;
        const g = s.get('audio'); g.onsuccess = () => { const a = g.result; if (a && a.uid === id) { audioMine = true; s.delete('audio'); } };
        const h = s.get('state'); h.onsuccess = () => { const a = h.result; if (a && a.uid === id) s.delete('state'); };
        tx.oncomplete = () => { db.close(); if (audioMine) try { localStorage.removeItem('chordroom.lastpos'); } catch (e) {} ok(); };
        tx.onerror = tx.onabort = () => { db.close(); ok(); };
      };
    });
  } catch (e) {}
}
// admin panel → user details → "Delete user" (owner / full admin; never the owner, never yourself)
function adminUserDel() {
  const box = $('#admUser'); if (!box) return;
  let el = $('#acUdDelW');
  const m = ACC().admUser, me = uid(), ok = !!(m && ACC().admin && ACC().perms && ACC().perms.has('users') && !m.owner && m.id !== me && (ACC().owner || m.role === 'user') && B().adminDeleteUser);
  if (!el) { el = document.createElement('div'); el.id = 'acUdDelW'; el.className = 'acdanger acud'; el.innerHTML = '<button type="button" class="btn acdanger-btn" id="acUdDel"></button>'; box.append(el); $('#acUdDel').onclick = () => openAdminDelete(); }
  el.hidden = !ok; $('#acUdDel').textContent = t('acUdDel');
}
function openAdminDelete() {
  const u = ACC().admUser; if (!u) return;
  const b = B(), name = u.username || u.email || u.id, word = t('acDelWord');
  const m = modal({ id: 'acUdDlg', cls: 'acdelw', desc: true, body: `<div class="dh"><h3 id="acUdDlgH"></h3></div><p id="acUdDlgD">${esc(t('acUdDelP'))}</p>
    <form id="acUdF" class="fset" novalidate><div class="fld"><label for="acUdConf" id="acUdConfL"></label><input type="text" id="acUdConf" autocomplete="off" spellcheck="false" dir="auto" data-af></div>
    <p class="acmsg" id="acUdMsg" role="alert" hidden></p>
    <div class="row2"><button type="submit" class="btn acdanger-btn" id="acUdGo">${esc(t('acUdDelGo'))}</button><button type="button" class="btn ghost" id="acUdNo">${esc(t('acCancel'))}</button></div></form>` });
  m.q('#acUdDlgH').textContent = t('acUdDelH', { u: '⁨' + name + '⁩' });
  m.q('#acUdConfL').textContent = t('acUdDelConfL', { u: u.username ? '@' + u.username : '—', w: word });
  m.q('#acUdNo').onclick = () => m.close(null);
  m.q('#acUdF').addEventListener('submit', async e => {
    e.preventDefault(); const v = m.q('#acUdConf').value.trim().replace(/^@/, ''), out = m.q('#acUdMsg'), go = m.q('#acUdGo');
    const lv = v.toLowerCase();
    if (!lv || !(lv === word.toLowerCase() || ['delete', 'מחק', 'حذف', 'удалить', 'eliminar'].includes(lv) || (u.username && lv === u.username.toLowerCase()))) { msg(out, t('acDelConfBad'), 'err'); m.q('#acUdConf').focus(); return; }
    busy(go, true);
    try {
      const r = await b.adminDeleteUser(u.id, v);
      if (!r || !r.ok) { busy(go, false); msg(out, delWhy(r && r.why), 'err'); return; }
      m.close('ok'); CR.toast(t('acUdDelDone'));
      ACC().admUser = null; ACC().users = (ACC().users || []).filter(x => x.id !== u.id);
      const back = $('#udBack'); if (back) back.click();
      try { ACC().users = await b.adminUsers(); } catch (x) {}
      const back2 = $('#udBack'); if (back2 && !$('#admUser').hidden) back2.click();
    } catch (x) { busy(go, false); msg(out, t('acDelErr', { m: errMsg(x) }), 'err'); }
  });
}

/* ---------- IDLE: sign out after a period without activity (all tabs) ---------- */
const IDLE = { K: 'chordroom.idle.v1', last: 0, wrote: 0, timer: 0, dlg: null, cd: 0, now: () => Date.now(), out: false };
const idleLimit = () => { const b = billing(), adm = !!ACC().panel; return (adm ? intIn(b.idle_minutes_admin, 5, 525600, 60) : intIn(b.idle_minutes, 5, 525600, 10080)) * 60000; };
const idleStored = () => { try { const o = JSON.parse(localStorage.getItem(IDLE.K) || 'null'); return o && +o.t > 0 ? +o.t : 0; } catch (e) { return 0; } };
function idleWrite(n) { IDLE.wrote = n; try { localStorage.setItem(IDLE.K, JSON.stringify({ t: n })); } catch (e) {} }
function idleTouch(force) {
  if (!signedIn() || IDLE.out) return;
  const n = IDLE.now(); IDLE.last = Math.max(IDLE.last, n);
  if (force || n - IDLE.wrote > 5000) idleWrite(n);
  if (IDLE.dlg) idleHideWarn();
}
function idleLast() { return Math.max(IDLE.last, idleStored()); }
function idleTick() {
  if (!signedIn()) { idleHideWarn(); return; }
  const n = IDLE.now(), lim = idleLimit(), idle = n - idleLast();
  if (idle >= lim) { idleSignOut(); return; }
  if (idle >= lim - 60000) idleShowWarn(Math.ceil((lim - idle) / 1000)); else if (IDLE.dlg) idleHideWarn();
}
function idleShowWarn(sec) {
  if (!IDLE.dlg) {
    IDLE.dlg = modal({ id: 'acIdleDlg', role: 'alertdialog', desc: true, esc: false, outside: false, cls: 'acidle', body: `<div class="dh"><h3 id="acIdleDlgH">${esc(t('acIdleH'))}</h3></div>
      <p id="acIdleDlgD" aria-live="polite"></p><div class="row2"><button type="button" class="btn solid" id="acIdleStay" data-af>${esc(t('acIdleStay'))}</button><button type="button" class="btn ghost" id="acIdleOut">${esc(t('acIdleOut'))}</button></div>`,
      onClose: () => { IDLE.dlg = null; clearInterval(IDLE.cd); } });
    IDLE.dlg.q('#acIdleStay').onclick = () => idleTouch(true);
    IDLE.dlg.q('#acIdleOut').onclick = () => idleSignOut(true);
    clearInterval(IDLE.cd); IDLE.cd = setInterval(() => idleTick(), 1000);
  }
  const p = IDLE.dlg.q('#acIdleDlgD'); if (p) p.textContent = t('acIdleP', { s: '⁦' + Math.max(0, sec) + '⁩' });
}
function idleHideWarn() { if (IDLE.dlg) { const d = IDLE.dlg; IDLE.dlg = null; d.close(null); } clearInterval(IDLE.cd); }
async function idleSignOut(byUser) {
  if (IDLE.out) return; IDLE.out = true; idleHideWarn();
  try { localStorage.removeItem(IDLE.K); } catch (e) {}
  try { $('#acc').hidden = true; $('#admin').hidden = true; } catch (e) {}
  try { await B().signOut(); } catch (e) {}
  IDLE.out = false; IDLE.last = 0;
  if (!byUser) CR.toast(t('acIdleGone'));
}
function idleStart() {
  // inside the warning only its buttons act (the dialog must not vanish under the pointer); elsewhere any click/key counts
  const ev = e => { if (e && e.target && e.target.closest && e.target.closest('#acIdleDlg')) return; idleTouch(false); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(k => window.addEventListener(k, ev, { passive: true, capture: true }));
  // passive movement counts too, but does not dismiss an open "Still there?" warning (only a click / key / "Stay" does)
  let mv = 0; const passive = () => { const n = IDLE.now(); if (IDLE.dlg || n - mv <= 5000) return; mv = n; idleTouch(false); };
  window.addEventListener('pointermove', passive, { passive: true }); window.addEventListener('wheel', passive, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) return; idleTick(); if (signedIn()) idleTouch(true); });
  window.addEventListener('storage', e => { if (e.key === IDLE.K) { const v = idleStored(); if (v > IDLE.last) IDLE.last = v; if (IDLE.dlg && IDLE.now() - idleLast() < idleLimit() - 60000) idleHideWarn(); } });
  IDLE.timer = setInterval(idleTick, 10000);
}
// signed in / out / switched: a stale stored activity (browser closed for longer than the limit) signs out right away
function idleUser(d) {
  d = d || {};
  if (!d.uid) { idleHideWarn(); IDLE.last = 0; return; }
  const stored = idleStored(), n = IDLE.now();
  // a sign-in that just happened (password, 2FA code, recovery) starts fresh; an existing session (INITIAL…) is judged
  if (['SIGNED_IN', 'MFA_CHALLENGE_VERIFIED', 'PASSWORD_RECOVERY', 'USER_UPDATED'].includes(d.event) || !stored) { IDLE.last = n; idleWrite(n); return; }
  // wait for the profile (admin-panel accounts have the shorter limit) before judging an old session
  setTimeout(() => { if (signedIn() && IDLE.now() - idleLast() >= idleLimit()) idleSignOut(); else { IDLE.last = Math.max(IDLE.last, idleStored()); idleTick(); } }, 1500);
}
document.addEventListener('cr-user', e => idleUser(e.detail));

/* ---------- sign-in attempts: a client-side brake after repeated wrong passwords (the server has its own limits) ---------- */
const TH = { K: 'chordroom.signin.th' };
function thGet() { try { const o = JSON.parse(sessionStorage.getItem(TH.K) || '{}'); return { n: +o.n || 0, until: +o.until || 0 }; } catch (e) { return { n: 0, until: 0 }; } }
function thSet(o) { try { sessionStorage.setItem(TH.K, JSON.stringify(o)); } catch (e) {} }
(function wrapSignIn() {
  const b = B(); if (!b || typeof b.signIn !== 'function' || b.signIn.__acct) return;
  const orig = b.signIn;
  const wrapped = async function (a) {
    const s = thGet(), now = Date.now();
    if (s.until > now) { const e = new Error('rate'); e.code = 'rate'; e.wait = Math.ceil((s.until - now) / 1000); throw e; }
    try { const r = await orig.call(this, a); thSet({ n: 0, until: 0 }); return r; }
    catch (e) { if (e && e.code === 'login') { const n = s.n + 1; thSet({ n, until: n >= 5 ? now + Math.min(300, 15 * 2 ** (n - 5)) * 1000 : 0 }); } throw e; }
  };
  wrapped.__acct = true; b.signIn = wrapped;
})();

/* ---------- profile text: instant offensive-word check (the server trigger decides) ---------- */
function wireProfile() {
  if (wireProfile.on) return; wireProfile.on = true;
  // capture on the document: runs before the app's own submit handler on #pForm and stops it
  document.addEventListener('submit', e => {
    if (!e.target || e.target.id !== 'pForm') return;
    for (const id of ['#pUname', '#pNick', '#pBio']) {
      const el = $(id); if (!el || !TEXTGUARD.offensive(el.value)) continue;
      e.preventDefault(); e.stopPropagation();
      const m = $('#pMsg'); if (m) { m.textContent = id === '#pUname' ? t('acOffName') : t('acOffensive'); m.classList.add('err'); }
      el.setAttribute('aria-invalid', 'true'); el.focus(); return;
    }
    ['#pUname', '#pNick', '#pBio'].forEach(id => { const el = $(id); if (el) el.removeAttribute('aria-invalid'); });
  }, true);
}

/* ---------- age checkbox: "I am N or older" (billing.min_age) ---------- */
function agePaint() {
  const box = $('#auAge'); if (!box) return;
  const sp = box.parentElement && box.parentElement.querySelector('span[data-i="auAge"],span[data-acage]');
  if (!sp) return;
  if (sp.dataset.i) { sp.removeAttribute('data-i'); sp.dataset.acage = '1'; }
  sp.textContent = t('acAge', { n: minAge() });
}

/* ---------- admin panel: 2FA banner, Settings → Security, blocked words ---------- */
function adminBanner() {
  const panel = $('#admin .in'); if (!panel) return;
  let el = $('#acMfaBan');
  const a = ACC(), acc = a.access || {}, enrolled = acc.mfa ? !!acc.mfa.enrolled || mfaOn() : mfaOn(), req = !!(acc.mfa && acc.mfa.required) || billing().require_mfa_admin === true;
  const show = !!(a.panel && signedIn() && MFA.factors !== null && !enrolled && B().mfaEnroll);
  if (!el) {
    el = document.createElement('div'); el.id = 'acMfaBan'; el.className = 'acban'; el.setAttribute('role', 'status');
    el.innerHTML = '<span></span><button type="button" class="btn solid"></button>';
    const ah = panel.querySelector('.ah'); panel.insertBefore(el, ah ? ah.nextSibling : panel.firstChild);
    el.querySelector('button').onclick = () => openEnroll();
  }
  el.hidden = !show; if (!show) return;
  el.querySelector('span').textContent = req ? t('acMfaBannerReq') : t('acMfaBanner');
  el.querySelector('button').textContent = t('acMfaBannerGo');
}
function secBlock() {
  const host = $('#admSettings'); if (!host) return null;
  let el = $('#acSec');
  if (!el) {
    el = document.createElement('div'); el.id = 'acSec';
    el.innerHTML = `<div class="bhead" style="margin-top:26px"><h3 id="acSecH"></h3><p id="acSecP"></p></div>
      <div class="sgrid acsec">
        <div class="fld" style="grid-column:1/-1"><label for="acTs" id="acTsL"></label><input type="text" id="acTs" dir="ltr" maxlength="90" spellcheck="false" autocomplete="off" placeholder="0x4AAAAAAA…"><span class="snote" id="acTsH"></span></div>
        <label class="tog" style="grid-column:1/-1"><span id="acReqL"></span><input type="checkbox" id="acReq"></label>
        <div class="fld"><label for="acIdleU" id="acIdleUL"></label><input type="number" id="acIdleU" min="5" max="525600" step="1" dir="ltr"></div>
        <div class="fld"><label for="acIdleA" id="acIdleAL"></label><input type="number" id="acIdleA" min="5" max="525600" step="1" dir="ltr"></div>
        <div class="fld"><label for="acAgeMin" id="acAgeL"></label><input type="number" id="acAgeMin" min="13" max="21" step="1" dir="ltr"></div>
        <div class="row2" style="grid-column:1/-1"><button class="btn solid" type="button" id="acSecSave"></button><span class="snote" id="acSecMsg" role="status"></span></div>
      </div>
      <div class="bhead" style="margin-top:26px"><h3 id="acWordsH"></h3><p id="acWordsP"></p></div>
      <div class="acwords"><div class="row2 acwadd"><input type="text" id="acWord" maxlength="80" dir="auto" autocomplete="off" spellcheck="false"><select id="acWordMode" class="sel"></select><button type="button" class="btn solid" id="acWordAdd"></button><span class="snote" id="acWordsMsg" role="status"></span></div>
      <ul class="acwlist" id="acWordList"></ul></div>`;
    const first = host.querySelector('.sgrid'); host.insertBefore(el, first ? first.nextSibling : null);
    $('#acSecSave').onclick = secSave;
    $('#acWordAdd').onclick = () => wordSet($('#acWord').value, $('#acWordMode').value, true);
    $('#acWord').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#acWordAdd').click(); } });
  }
  return el;
}
function secPaint() {
  const el = secBlock(); if (!el) return;
  const a = ACC(), full = !!a.admin, owner = !!a.owner, b = billing();
  el.hidden = !(a.perms && a.perms.has('settings'));
  $('#acSecH').textContent = t('acSecH'); $('#acSecP').textContent = t('acSecP');
  $('#acTsL').textContent = t('acTsKey'); $('#acTsH').textContent = t('acTsKeyH'); $('#acReqL').textContent = t('acReqMfa');
  $('#acIdleUL').textContent = t('acIdleU'); $('#acIdleAL').textContent = t('acIdleA'); $('#acAgeL').textContent = t('acMinAge'); $('#acSecSave').textContent = t('acSecSave');
  if (!el.contains(document.activeElement)) {
    $('#acTs').value = String(b.turnstile_site_key || ''); $('#acReq').checked = b.require_mfa_admin === true;
    $('#acIdleU').value = intIn(b.idle_minutes, 5, 525600, 10080); $('#acIdleA').value = intIn(b.idle_minutes_admin, 5, 525600, 60); $('#acAgeMin').value = minAge();
  }
  for (const id of ['#acTs', '#acIdleU', '#acIdleA', '#acAgeMin']) $(id).disabled = !full;
  $('#acReq').disabled = !owner; $('#acReq').title = owner ? '' : t('acSecOwnerOnly');
  $('#acSecSave').disabled = !full;
  $('#acWordsH').textContent = t('acWordsH'); $('#acWordsP').textContent = t('acWordsP');
  $('#acWord').setAttribute('aria-label', t('acWordL')); $('#acWord').placeholder = t('acWordL'); $('#acWordAdd').textContent = t('acWordAdd');
  const sel = $('#acWordMode'), cur = sel.value || 'word';
  sel.innerHTML = ['word', 'hword', 'prefix', 'part', 'phrase'].map(k => `<option value="${k}">${esc(t('acMode' + k[0].toUpperCase() + k.slice(1)))}</option>`).join('');
  sel.value = cur; sel.setAttribute('aria-label', t('acWordL'));
  el.querySelector('.acwords').hidden = !full; $('#acWordsH').parentElement.hidden = !full;
  wordsPaint();
}
async function secSave() {
  const m = $('#acSecMsg'), btn = $('#acSecSave'), a = ACC();
  const ts = $('#acTs').value.trim();
  if (ts && !/^[0-9]x[A-Za-z0-9_-]{10,80}$/.test(ts)) { m.textContent = t('acTsKey'); m.classList.add('err'); $('#acTs').focus(); return; }
  const prev = billing(), nb = { ...prev, turnstile_site_key: ts,
    idle_minutes: intIn($('#acIdleU').value, 5, 525600, 10080), idle_minutes_admin: intIn($('#acIdleA').value, 5, 525600, 60), min_age: intIn($('#acAgeMin').value, 13, 21, 16) };
  if (a.owner) nb.require_mfa_admin = $('#acReq').checked;
  busy(btn, true); m.classList.remove('err');
  try { const c = { ...a.config, billing: nb }; await B().saveConfig(c); a.config = c; m.textContent = t('acSaved'); capPrep(); agePaint(); }
  catch (e) { m.textContent = t('acSaveFail') + ' · ' + errMsg(e); m.classList.add('err'); }
  busy(btn, false);
}
const WORDS = { rows: null };
async function wordsLoad() {
  const b = B(); if (!b.blockedWords || !ACC().admin) { WORDS.rows = null; return; }
  try { WORDS.rows = await b.blockedWords(); TEXTGUARD.learn(WORDS.rows); } catch (e) { WORDS.rows = null; }
  wordsPaint();
}
function wordsPaint() {
  const ul = $('#acWordList'); if (!ul) return;
  ul.textContent = '';
  const rows = WORDS.rows || [];
  $('#acWordsMsg').textContent = WORDS.rows ? t('acWordsN', { n: rows.length }) : '';
  for (const r of rows) {
    const li = document.createElement('li'), w = document.createElement('span'), x = document.createElement('button');
    w.textContent = r.word; w.dir = 'auto'; w.title = t('acMode' + String(r.mode || 'word')[0].toUpperCase() + String(r.mode || 'word').slice(1));
    x.type = 'button'; x.className = 'acwx'; x.textContent = '×'; x.setAttribute('aria-label', t('acWordRm', { w: r.word }));
    x.onclick = () => wordSet(r.word, r.mode, false);
    li.append(w, x); ul.append(li);
  }
}
async function wordSet(word, mode, on) {
  const m = $('#acWordsMsg'), w = String(word || '').trim(); if (!w) return;
  try { const r = await B().blockedWordSet(w, mode, on); if (!r || !r.ok) { m.textContent = t('acWordsBad'); return; } if (on) $('#acWord').value = ''; await wordsLoad(); }
  catch (e) { m.textContent = t('acSaveFail') + ' · ' + errMsg(e); }
}

/* ---------- wiring ---------- */
function observe(el, fn) { if (el) new MutationObserver(fn).observe(el, { attributes: true, attributeFilter: ['hidden'] }); }
observe($('#acc'), async () => { if ($('#acc').hidden) return; accSections(); await mfaLoad(); accPaint(); });
observe($('#authDlg'), () => { if (!$('#authDlg').hidden) { capPrep(); agePaint(); } });
observe($('#admin'), async () => { if ($('#admin').hidden) return; secPaint(); if (MFA.factors === null) await mfaLoad(); adminBanner(); wordsLoad(); });
observe($('#admUser'), () => adminUserDel());
const udName = $('#udName'); if (udName) new MutationObserver(() => adminUserDel()).observe(udName, { childList: true, characterData: true, subtree: true });
const tabs = $('#admTabs'); if (tabs) tabs.addEventListener('click', () => setTimeout(secPaint, 0));
function mfaUser(d) {
  MFA.factors = null; WORDS.rows = null;
  if (d && d.uid) setTimeout(async () => { await mfaLoad(); accPaint(); adminBanner(); }, 800);
  const ban = $('#acMfaBan'); if (ban && !(d && d.uid)) ban.hidden = true;
}
document.addEventListener('cr-user', e => mfaUser(e.detail));
wireProfile(); agePaint(); idleStart();
/* perf: this file loads on first use (app.js acctNeed: a saved session at boot, sign-in, the auth dialog, a 2FA challenge),
   so it catches up with what already happened: the last sign-in / out ('cr-user'), a 2FA sign-in waiting for its code and
   the panels / dialog that are already open (their observers only see later changes). */
(function catchUp() {
  const last = CR.lastUser && CR.lastUser();
  if (last) { idleUser(last); mfaUser(last); }
  if (B().mfaPending) setTimeout(mfaChallenge, 60);
  if (!$('#authDlg').hidden) capPrep();
  const acc = $('#acc'); if (acc && !acc.hidden) { accSections(); mfaLoad().then(accPaint); }
  const adm = $('#admin'); if (adm && !adm.hidden) { secPaint(); mfaLoad().then(adminBanner); wordsLoad(); }
})();

window.ACCT = {
  lang() { accPaint(); agePaint(); adminBanner(); if ($('#acSec')) secPaint(); adminUserDel(); const s = $('#acCapAu'); if (s) s.setAttribute('aria-label', t('acCapL')); },
  minAge, offensive: TEXTGUARD.offensive, openEnroll, openDelete, mfaChallenge, clearLocal, capKey,
  config() { capPrep(); agePaint(); },
  _idle: { setNow(fn) { IDLE.now = fn || (() => Date.now()); }, tick: idleTick, limit: idleLimit, touch: () => idleTouch(true) },
  _cap: CAP
};
})();
