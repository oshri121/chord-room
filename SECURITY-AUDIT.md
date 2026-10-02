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
