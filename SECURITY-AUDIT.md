# Chord Room — ביקורת אבטחה, צד שרת (אוקטובר 2026)

היקף: Supabase (טבלאות, RLS, הרשאות עמודות, כל פונקציות `security definer`, Storage, הגדרות Auth), Cloudflare Pages
Functions (`/api/deezer`, `/api/pay/webhook`, `/api/assistant`), `_middleware.js` + `_routes.json`, `_headers`, וסודות בקוד
ובהיסטוריית git. הותקף כגולש אנונימי עם המפתח הציבורי וכמשתמש רשום רגיל. כל ממצא אומת בבדיקה שאפשר להריץ שוב
(`tools/tests/sql/test_security_v3.py` מול Postgres מקומי, `tools/tests/node/security_v3.test.mjs` מול ה-Functions).
צד הדפדפן (XSS וכו׳) נבדק בנפרד.

**שורה תחתונה:** אין פריצה ישירה להרשאות, לנקודות או לתשלומים — ההקשחות הקודמות (S-1…S-16) מחזיקות. הבעיות שנמצאו הן
בעיקר **מילוי הדיסק / עלויות** (גם בלי חשבון), **הפניית תשלומים** על ידי תפקיד מותאם, והנחות לא מאומתות לגבי הסתרת
קבצים ב-Cloudflare. כל מה שאפשר תוקן בקוד; שאר הצעדים אצל הבעלים (למטה).

## ממצאים

| # | חומרה | ממצא | סטטוס |
|---|---|---|---|
| 1 | גבוהה | **גולש אנונימי ממלא את הדיסק:** `catalog_play('dz:<כל מספר>')` כתב שורה ל-`private.catalog_play_log` גם למזהים שלא קיימים בקטלוג (10^15 אפשרויות) → מיליוני שורות בשעה, בלי חשבון. ב-Supabase דיסק מלא = כל הפרויקט לקריאה בלבד. | תוקן [S-17] |
| 2 | בינונית | **משתמש רשום אחד מנפח את המסד:** יומן פעילות 400 בשעה ל-180 יום (~1.7 מיליון שורות), My Songs ‏5000×2MB = ‏10GB לחשבון, יומן הורדות בלי תקרה, `spend_song` כשהמחיר 0 שומר שורה לכל קריאה. | תוקן [S-18/19/21] — תקרות יומיות, 50MB ניתוחים לחשבון |
| 3 | בינונית | **הרעלת הקטלוג (מוצג לכולם):** חבר יכול להוסיף 9600 "שירים" מומצאים ביום (כותרת חופשית, BPM/סולם שגויים) לרשימת "חדשים"; הקישור לדיזר לא היה חייב להיות של אותו שיר. | תוקן חלקית [S-20] — 1500 ביום, הקישור תמיד של השיר עצמו. הנתונים עדיין לא מאומתים מול Deezer (שארית) |
| 4 | בינונית | **הפניית הכנסות:** תפקיד מותאם עם הרשאת `settings` בלבד יכול היה לשנות את קישורי התשלום (`plans[].link`) ו-variant ids לחנות שלו. | תוקן [S-22] — רק הבעלים/מנהל מלא |
| 5 | נמוכה (באג) | תפקיד `settings` **לא יכול היה לשמור הגדרות בכלל** — האפליקציה שומרת ב-upsert ולא הייתה מדיניות INSERT ("violates row-level security"). | תוקן [S-22] |
| 6 | בינונית | **עלות רומי:** אין תקרה לכל האתר (הרבה חשבונות = חשבון גדול), חשבון לא מאומת/אנונימי מקבל תשובות, שיחה של 24×2000 תווים לכל הודעה. | תוקן — `assistant.sql` (אימייל מאומת, `assistant_site_daily` ברירת מחדל 3000/יום), ה-Function מקצר ל-12,000 תווים ומחזיר 503 busy |
| 7 | נמוכה | אם יופעלו פעם "Anonymous sign-ins" ב-Supabase, כל סשן אנונימי היה מקבל 20 נקודות מתנה → נקודות בלי סוף. | תוקן [S-23] (+ להשאיר כבוי) |
| 8 | בינונית | **הסתרת קבצי הריפו** (`supabase/`, `tools/`, `*.md` — כולל כתובת המייל שלך ב-schema.sql) נשענה על התאמה מדויקת של הנתיב. גרסאות כמו `/supabase%2Fschema.sql`, `//supabase/…`, `/Supabase/…`, `%2e%2e`, `CLAUDE.md.` לא נתפסו. | תוקן ב-middleware (נרמול נתיב) + `_routes.json` (וריאנטים של אותיות). **לא אומת מול האתר החי** (חסום מהסביבה שלי) → בדיקה אצלך, למטה |
| 9 | נמוכה | `/ai/*` הוריד את ה-CSP מכל נתיב תחת `/ai/`, וכל כתובת לא קיימת שם מקבלת את index.html (SPA) — דף בלי CSP. | תוקן — רק `/ai/worker.js` |
| 10 | בינונית | **מכסת ה-Functions:** `/api/deezer` פתוח לכל העולם; ריצה עליו שורפת את 100K הבקשות היומיות החינמיות → ה-webhook של התשלומים ורומי נופלים לכל השאר היום. | צריך בעלים (Cloudflare) |
| 11 | גבוהה* | *אם אין variant id לכל תוכנית:* הקונה יכול לערוך בקישור `checkout[custom][plan]=studio`, לקנות את הזולה ולקבל סטודיו (כשמוצרי Lemon Squeezy לא נקראים basic/pro/studio). | צריך בעלים — למלא variant id לכל תוכנית |
| 12 | בינונית | השתלטות על חשבון בניחוש קוד 6 ספרות (שחזור סיסמה במייל) — תלוי בתוקף הקוד ובמגבלות קצב ב-Supabase. | צריך בעלים (הגדרות Auth) |
| 13 | נמוכה | `profiles.pay_portal` (קישור ניהול מנוי) קריא לבעלי הרשאת `users`; `catalog.analyzed_by/full_by` גלויים לכולם. S-16 מוכן אבל מחכה לשינוי ב-`backend.js` (לא לבחור `*`, להשתמש ב-`my_pay_portal()`). הקישורים של LS פגים אחרי 24 שעות. | פתוח (צד לקוח) |
| 14 | נמוכה | ברירת המחדל של אחסון קבצים: 5GB ו-2000 קבצים **לכל חשבון** — חשבון אחד יכול למלא את כל האחסון של התוכנית ב-Supabase (1GB בחינמי). | צריך בעלים — `billing.storage_mb` / `max_files` |
| 15 | מקובל | הפעולות בתשלום רצות בדפדפן: משתמש זדוני יכול לבקש החזר אחרי הצלחה (עד 20 החזרים / 1000 יחידות ביום; הפרדה 2 ביום). הלדג׳ר נכון, השער "ישר". | מקובל (בתכנון) |
| 16 | מקובל | `username_available` חושף אם שם משתמש תפוס (נדרש להרשמה). מגבלות הקצב נספרות (מקבילות יכולה לעבור במעט). | מקובל |

**נבדק ותקין** (עם בדיקות): RLS בכל הטבלאות, אין TRUNCATE/TRIGGER ל-API; משתמש לא יכול לשנות role/owner/blocked/credits/plan/
pay_*/ref_*/terms_*/email; כל פונקציית definer עם `search_path`, רק 4 פונקציות פתוחות לאנונימי; סכמת `private` סגורה; סיסמת
הרשאות + נעילה; הפניות (הדדי, לא מאומת, כפול); webhook — HMAC בהשוואה בזמן קבוע, replay → duplicate, גוף לא-JSON / 270KB /
חתימה ריקה נדחים לפני כל כתיבה; נקודות v2 — כולל הוצאה/החזר מקבילים (בלי משיכת יתר); Storage — `../`, תיקייה של אחר,
רשימת דליים, סוגי MIME; פרוקסי Deezer — allow-list, בלי SSRF/הזרקת פרמטרים, GET/HEAD בלבד; רומי — Bearer נבדק מול
Supabase, Origin, 32KB, בלי מפתחות בלוגים. **סודות:** אין מפתח/סיסמה בקוד ובכל 43 הקומיטים; `config.js` ו-Functions
מכילים רק את המפתח הציבורי `sb_publishable_…`.

## מה עליך לעשות

**1. Supabase → SQL Editor:** להריץ פעם אחת את `supabase/security_v3.sql` (כולל את `assistant.sql` המעודכן). בטוח להריץ שוב.

**2. Supabase Dashboard — רשימת בדיקה:**
- Authentication → Sign In / Providers: **Confirm email = ON**, **Anonymous sign-ins = OFF**, Secure email change = ON,
  Secure password change = ON.
- Password: אורך מינימלי **8+** עם אותיות וספרות; **Leaked password protection = ON** (בתוכנית Pro).
- Email OTP expiry: **600 שניות** (10 דק׳) במקום שעה. Rate Limits: אימות קודים (token verifications) ו-sign-ups/sign-ins נמוכים
  לכל IP; שליחת מיילים דרך SMTP משלך (EMAIL.md).
- URL Configuration: Site URL = `https://chord-room.pages.dev`; Redirect URLs **רק** הכתובות שלך — לעולם לא `https://*.pages.dev/**`
  (כל אתר pages.dev היה מקבל טוקני התחברות).
- מומלץ: CAPTCHA (Cloudflare Turnstile) להרשמה/כניסה/שחזור — דורש שינוי קטן באפליקציה וב-CSP, תבקש ממני.
- API → Exposed schemas: רק `public` (לעולם לא `private`). אם לא משתמשים ב-GraphQL — לכבות.
- Billing: Spend cap = ON. Database: גיבויים.
- `billing.storage_mb` / `max_files` לערכים שמתאימים לתוכנית (למשל 500MB / 300 קבצים למשתמש).
- החשבון שלך = שליטה מלאה באתר: סיסמה ייחודית וחזקה, ו-2FA על תיבת המייל.

**3. Lemon Squeezy:** **variant id לכל תוכנית** בהגדרות המחירים (ממצא 11); Signing secret אקראי של 32+ תווים; webhook של מצב בדיקה נפרד.

**4. Cloudflare:**
- Security → WAF → **Rate limiting rule**: ‏`/api/*` — למשל 60 בקשות ל-10 שניות ל-IP; ‏`/api/assistant` — 10 לדקה.
- לשקול Workers Paid (‏5$, 10 מיליון בקשות) כדי שהצפה לא תפיל את ה-webhook של התשלומים.
- Preview deployments (ענפים שאינם main) משתמשים באותו Supabase אמיתי — להגביל עם Cloudflare Access או לכבות.
- Anthropic Console: תקרת הוצאה חודשית.
- **לבדוק שהקבצים מוסתרים באתר החי** — כל השורות צריכות להחזיר 404:
  ```
  for p in /supabase/schema.sql //supabase/schema.sql /Supabase/schema.sql /supabase%2Fschema.sql /%73upabase/schema.sql \
           /CLAUDE.md /claude.md /CLAUDE.md. /SECURITY-AUDIT.md /tools/tests/README.md /tools%2Ftests%2FREADME.md \
           /.gitignore /functions/_middleware.js /ai/x; do
    printf '%-34s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' --path-as-is "https://chord-room.pages.dev$p"; done
  ```
  (`/ai/x` יחזיר 200 = index.html — זה תקין; לבדוק שיש לו `content-security-policy` עם `curl -sI`.) אם משהו אחר מחזיר 200 — לשלוח לי.

## סיכונים שנשארים

- השער לנקודות הוא "למשתמש ישר": ההפרדה והייצוא רצים בדפדפן; הלדג׳ר נכון אבל אפשר לנצל החזרים עד התקרות.
- נתוני הקטלוג (BPM/סולם/כותרת) מגיעים ממשתמשים ולא מאומתים; מנחי `catalog` מוחקים. אימות אמיתי דורש Function עם מפתח שירות.
- XSS בצד הדפדפן = גניבת סשן (גם של מנהל). ה-CSP הקשוח מקטין, אבל זה תחום הבדיקה השנייה.
- הנחות על נרמול נתיבים ב-Cloudflare לא נבדקו מול האתר (ממצא 8) — הבדיקה למעלה סוגרת את זה.
- תקרות קצב לפי ספירה — בקשות מקבילות יכולות לעבור אותן במעט. אין MFA בחשבון הבעלים.

## מה השתנה בקוד

- `supabase/schema.sql` — בלוק `[security-v3]` בסוף ([S-17]…[S-23]); `supabase/security_v3.sql` = הבלוק + `assistant.sql`, מילה במילה.
- `supabase/assistant.sql` — אימייל מאומת, תקרה לכל האתר `assistant_site_daily` (+ אימות בהגדרות). `ASSISTANT.md` מעודכן.
- `functions/api/assistant.js` — `site_limit` → ‏503 busy, קיצור השיחה ל-12,000 תווים.
- `functions/_middleware.js` — נרמול נתיב (פענוח כפול, `//`, `\`, `..`, נקודה בסוף, אותיות), `*.md` בכל עומק, `.git*`, `.claude/`.
- `_routes.json` — וריאנטים של אותיות גדולות (בלי catch-all, שהיה עולה בקשת Function לכל קובץ). `_headers` — רק `/ai/worker.js` בלי CSP.
- בדיקות: `sql/test_security_v3.py` (92), `node/security_v3.test.mjs` (47). `ui/test_gate.py` — בדיקת ה-skip link מחכה לאנימציה (הייתה נכשלת במכונה עמוסה).

---

# v4 — חשבונות, אימות דו־שלבי, הגנה מבוטים (אוקטובר 2026, רשימת ההשקה)

קוד: `supabase/schema.sql` בלוק `[accounts-v4]` בסוף (= `supabase/accounts_v4.sql`), `assets/acct.js` + `assets/acct.css`
(חדשים), שינויים קטנים מסומנים `/* acct */` ב־`assets/app.js`, `assets/backend.js`, `functions/_middleware.js`, `_headers`.

| # | מה | איך |
|---|---|---|
| 1 | **מחיקת חשבון** | החשבון שלי ← "אזור מסוכן" ← "מחיקת החשבון": מה נמחק, הקלדת שם המשתמש או "מחק"/DELETE, סיסמה מחדש (או קוד במייל), קוד 2FA אם יש. הדפדפן מוחק את הקבצים דרך Storage API (`uploads/<uid>`, `avatars/<uid>`), ואז `delete_my_account` בודק בשרת: לא הבעלים, אין מנוי חי (active/on_trial/past_due/paused → קישור לפורטל), אישור, כניסה טרייה ב־15 הדקות האחרונות (JWT `amr`), aal2 אם יש 2FA, אין קבצים שנשארו — ומוחק את `auth.users`. טריגר `before delete` (גם למחיקה מהדשבורד) מוחק/מאנונם הכל: כל ה־FK לחשבון נבדקים בטסט. **רשומות תשלום** (`credit_ledger` reason 'payment', `pay_events`) נשמרות 7 שנים בלי `user_id`, עם `subject_hash` = sha256(מלח סודי:uid), ושם/אימייל/כרטיס נחתכים מה־payload. שורת תיעוד ב־`account_deletions` (בלי פרטים מזהים). אחרי המחיקה: יציאה + ניקוי מפתחות localStorage/IndexedDB של החשבון. ניהול ← משתמש ← "מחיקת המשתמש" (`admin_delete_user`: בעלים/מנהל מלא בלבד, אף פעם לא הבעלים, תפקידי ניהול רק ע"י הבעלים). מדיניות הפרטיות עודכנה (5 שפות, גרסה 2026-10-06). |
| 2 | **אימות דו־שלבי (TOTP)** | Supabase Auth MFA: הפעלה מהחשבון (QR מ־Supabase כתמונת data:, מפתח להקלדה, קוד), רשימה והסרה. כניסה עם 2FA: אחרי הסיסמה מופיע שלב הקוד; עד שהוא עובר, האפליקציה לא רואה את המשתמש כמחובר. בשרת: `has_perm`/`is_admin`/`is_owner` דורשים aal2 למי שיש לו 2FA, ומדיניות RESTRICTIVE על הטבלאות שלו (פרופיל, שירים, קבצים, לדג'ר, יומנים) — סיסמה גנובה לבד לא מספיקה. `billing.require_mfa_admin` (בעלים בלבד) — ניהול רק עם 2FA; **הבעלים אף פעם לא ננעל** (באנר בפאנל הניהול). |
| 3 | **CAPTCHA** | Cloudflare Turnstile (managed, `interaction-only`, ערכת צבעים ושפה לפי האתר) בהרשמה, כניסה, איפוס סיסמה, שליחת קוד מחדש ואימות מחדש — הטוקן נשלח ל־Supabase Auth (`captchaToken`). פעיל **רק** כשיש `billing.turnstile_site_key` בהגדרות; בלי מפתח לא נטען כלום. |
| 4 | **הגבלת קצב** | Pages לא מאפשר להגדיר מה־repo את ה־Rate Limiting binding (בלי `wrangler.toml`, שהיה מעביר את כל המשתנים מהדשבורד) → ב־`_middleware.js` מונה לפי IP (מגובב) לדקה ב־Cache API: `/api/assistant` 20, `/api/deezer` 120, שאר `/api` 60, ה־webhook פטור; 429 + Retry-After; גוף מעל 300KB → 413. Best effort (לכל data center) — החומה האמיתית היא כלל WAF (למטה). בדפדפן: ניסיון חוזר עם backoff ל־429/503 בקריאות ה־Storage/RPC החדשות, בלם אחרי 5 סיסמאות שגויות (15 שנ' ומכפיל, עד 5 דק'). |
| 5 | **ניתוק אוטומטי** | `billing.idle_minutes` (ברירת מחדל 7 ימים) / `idle_minutes_admin` (60 דק', לכל מי שיש לו גישה לפאנל הניהול). פעילות (קליק/מקש/מגע/תנועה) נשמרת ב־localStorage ומשותפת לכל הלשוניות; 60 שניות לפני: "עדיין כאן?"; דפדפן שנסגר יותר מהמגבלה → יציאה בפתיחה הבאה. "יציאה מכל המכשירים" (`signOut({scope:'global'})`); "יציאה" הרגילה היא עכשיו רק מהדפדפן הזה. |
| 6 | **מילים פוגעניות** | `private.is_offensive(text)` + `private.blocked_words` (רשימה בעברית/אנגלית/ערבית/רוסית/ספרדית, ניהול מהפאנל). נרמול: אותיות קטנות, ניקוד, אותיות סופיות, צורות ערביות, ё, אקצנטים, leetspeak, רווחים/נקודות בין אותיות, אותיות כפולות. התאמה לפי מילים שלמות (בלי בעיית Scunthorpe; 63 מילים רגילות בטסט). טריגר על `profiles` (שגיאה `offensive` + שם השדה), `username_available` מחזיר false לשם פוגעני, `text_ok()` לבדיקה; בדפדפן `CR.offensive()` / `window.TEXTGUARD` עם אותה רשימה ואותם כללים (הטסט משווה) — לשימוש גם בביקורות של סוכן B. |
| 7 | **גיל** | תיבת "אני בן/בת N ומעלה" חובה (N = `billing.min_age`, ברירת מחדל 16 כמו בתנאים); נשמר כ־`profiles.age_confirmed_at`/`age_min` (לא ניתן לעריכה ע"י המשתמש). |
| 8 | **SQLi / XSS** | כל ה־RPC החדשים בפרמטרים בלבד; `execute` היחיד בבלוק = `format('%I')` על שמות טבלאות קבועים (נבדק בטסט). כל טקסט דינמי ב־`acct.js` דרך `textContent`/`esc`; קוד QR רק `data:image/svg+xml` ב־`<img>`; קישור פורטל רק https. `mock/evil.js` הורחב (גורמי 2FA, מילים, תשובות מחיקה, מפתח Turnstile עוינים). |
| 9 | **תשלומים חיצוניים** | אין שדה כרטיס באתר (נבדק); התשלום רק בדף של Lemon Squeezy. כתוב בתנאים ובמדיניות הפרטיות (5 שפות). |

**CSP:** נוסף רק `https://challenges.cloudflare.com` ל־`script-src` (ה־api.js של Turnstile, נטען רק כשיש מפתח) ול־`frame-src`/`child-src` (ה־iframe של הבדיקה). שום דבר אחר לא הורחב.

**SQL חדש:** `private.jwt_claims/jwt_aal/mfa_enrolled/mfa_ok`, `public.aal_ok()`, `has_perm/is_admin/is_owner/my_access` (עם 2FA), מדיניות RESTRICTIVE "mfa: aal2 when enrolled" (profiles, songs, downloads, credit_ledger, activity, charged_songs, assistant_usage, storage uploads/avatars), טריגר `site_config_guard_v4`, `private.blocked_words` + `txt_*`/`is_offensive`/`bw_put`, `public.text_ok`, `admin_blocked_words`, `admin_blocked_word_set`, טריגר `profiles_text_guard`, `profiles.age_confirmed_at/age_min`, `handle_new_user` (גיל + שם פוגעני), `credit_ledger.subject_hash` (+ `user_id` nullable), `pay_events.subject_hash`, `public.account_deletions`, `private.subject_hash/forget_user/on_auth_user_delete/confirm_ok/recent_auth/files_left/sub_live`, טריגר `on_auth_user_deleted` על `auth.users`, `public.delete_my_account`, `public.admin_delete_user`, מדיניות storage `avatars: admin read/delete`.

**בדיקות:** `sql/test_accounts_v4.py` (167), `ui/test_accounts.py` (118), `node/accounts_v4.test.mjs` (30); עודכנו `sql/pg.py` (stub של `auth.jwt()` ו־`auth.mfa_factors`), `sql/test_security_v3.py` (בלוקים מאוחרים מותרים אחרי v3), `node/security_v3.test.mjs` (Turnstile ב־script-src), `mock/mockb.js`, `mock/evil.js`.

## מה הבעלים צריך לעשות — v4

**1. Supabase → SQL Editor:** להריץ פעם אחת את `supabase/accounts_v4.sql` (אחרי `security_v3.sql`). בטוח להריץ שוב; מילים שהסרתם מהרשימה נשארות מוסרות.

**2. Supabase → Authentication → Multi-Factor (MFA):** להפעיל **TOTP (App Authenticator)** — Enroll + Verify = Enabled. אחר כך:
- להפעיל 2FA **בחשבון שלכם** (החשבון שלי ← "אימות דו־שלבי") — מומלץ שתי אפליקציות (למשל בטלפון וב־1Password), כי ל־TOTP של Supabase אין קודי שחזור.
- רק אחרי זה, אם רוצים: ניהול ← הגדרות ← אבטחה ← "פעולות ניהול דורשות אימות דו־שלבי". הבעלים לא ננעל גם כשהוא מופעל.
- אם איבדתם את האפליקציה: SQL Editor → `delete from auth.mfa_factors where user_id = '<ה-id שלכם>';` ואז להפעיל מחדש.

**3. Cloudflare → Turnstile → Add widget:** Hostname = `chord-room.pages.dev` (+ הדומיין שלכם אם יש), Widget mode = **Managed**. מעתיקים:
- **Site key** → באתר: ניהול ← הגדרות ← אבטחה ← "Site key של Cloudflare Turnstile" ← שמירה.
- **Secret key** → Supabase → Authentication → **Bot and Abuse Protection** (Attack Protection) → Enable CAPTCHA protection → Provider: Turnstile → להדביק → Save.
- **הסדר חשוב:** קודם את ה־Site key באתר (ולוודא שהווידג'ט מופיע בחלון הכניסה), ורק אז להפעיל ב־Supabase. הפוך = הרשמה וכניסה נכשלות עד שהמפתח באתר.

**4. Cloudflare → WAF → Rate limiting rule** (דורש דומיין משלכם שמחובר ל־Cloudflare כ־zone; על `*.pages.dev` לבד אין WAF — אז נשאר רק המונה ב־middleware):
- Rule 1: `(starts_with(http.request.uri.path, "/api/") and http.request.uri.path ne "/api/pay/webhook")` → 60 בקשות ל־10 שניות לכל IP → Block ל־60 שניות.
- Rule 2: `http.request.uri.path eq "/api/assistant"` → 10 בקשות לדקה לכל IP → Block ל־5 דקות.
- Rule 3 (אופציונלי): `http.request.uri.path eq "/api/pay/webhook" and http.request.method ne "POST"` → Block.

**5. ניהול ← הגדרות ← אבטחה (באתר):** ניתוק משתמשים רגילים (דקות, ברירת מחדל 10080 = 7 ימים), ניתוק חשבונות ניהול (ברירת מחדל 60), גיל מינימלי (16; אם משנים — לעדכן גם את הטקסט בתנאים ובמדיניות, שכתוב בהם 16), ו"מילים חסומות" — להוסיף/להסיר מילים (גם ביטויים של כמה מילים).

**6. Supabase → Authentication → Emails:** התבנית **Magic Link** חייבת להציג `{{ .Token }}` (הקוד בן 6 הספרות למחיקת חשבון בלי סיסמה). `supabase/email/magic-link.html` כבר כוללת אותו — לוודא שהודבקה.

**7. מדיניות הפרטיות:** נוסף סעיף "מחיקת החשבון" ועודכן "כמה זמן אנחנו שומרים מידע" (תשלומים 7 שנים בלי זיהוי, גיבויים עד 30 יום, כרטיס אשראי רק אצל Lemon Squeezy, Turnstile, 2FA). לוודא ש־30 יום מתאים לגיבויים בתוכנית ה־Supabase שלכם ולמלא את `OPERATOR` ב־`assets/legal.js`.

**העברת בעלות** (לפני שהבעלים מוחק את החשבון שלו — אין לזה כפתור, בכוונה): SQL Editor →
`update public.profiles set owner = false where owner; update public.profiles set owner = true, role = 'admin', blocked = false where id = '<ה-id של הבעלים החדש>';`

**8. בדיקה אחרי פריסה:** חשבון ניסיון → להפעיל 2FA → לצאת ולהיכנס (מתבקש קוד) → למחוק את החשבון (סיסמה + קוד) → לוודא ב־SQL: `select * from public.account_deletions order by id desc limit 1;` (שורה אחת, בלי אימייל). חלון הכניסה מראה את Turnstile רק אם יש מפתח.

**סיכונים שנשארים (v4):** המונה ב־middleware הוא best effort (לכל data center, לא אטומי) — בלי WAF הצפה מבוזרת עוד יכולה לשרוף את מכסת ה־Functions. פעולות נקודות (RPC) לא דורשות aal2 (רק ניהול ונתוני המשתמש). הסינון של מילים פוגעניות מבוסס רשימה — מילים מחוברות בלי רווח (CamelCase) נתפסות רק לרשומות במצב "בכל מקום". הניתוק האוטומטי הוא בצד הדפדפן (טוקן שנגנב לא פג בגללו; ל־JWT יש תוקף קצר משלו).
