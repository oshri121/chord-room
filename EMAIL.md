# מיילים של Chord Room — הגדרה ב־Supabase

המסמך הזה מסביר איך לגרום לכך שמיילי ההרשמה ואיפוס הסיסמה ייצאו בשם **Chord Room**, בעיצוב של האתר, עם **קוד בן 6 ספרות** — ולא ״from Supabase״.
התבניות נמצאות בתיקייה `supabase/email/`. הלוגו שבתוכן נטען מ־`https://chord-room.pages.dev/assets/email/logo-192.png` (הקובץ נמצא ב־`assets/email/` ויעלה לאוויר עם הדחיפה הבאה ל־`main`).

> אין במסמך הזה ואין בקוד שום סיסמה או מפתח. כל סוד (סיסמת SMTP, מפתח API) מקלידים רק בלוח הבקרה של Supabase או של ספק המייל.

---

## 1. להריץ את ה־SQL
Supabase → **SQL Editor** → New query → להדביק את `supabase/auth_consent.sql` → **Run**.
הקובץ מוסיף ל־`profiles` את `terms_version` ו־`terms_at` (גרסת התנאים שאושרה ומועד האישור) ומעדכן את `handle_new_user`.
**חשוב:** בכל פעם שמריצים מחדש את `schema.sql`, צריך להריץ אחריו שוב את `auth_consent.sql` (אחרת ההרשמות החדשות יפסיקו לשמור את אישור התנאים).

## 2. הפעלת אימות אימייל וקוד בן 6 ספרות
Supabase → **Authentication** → **Sign In / Providers** → **Email**:
- **Confirm email** — להפעיל. בלי זה אין שלב קוד (האתר מזהה את זה ומדלג על השלב).
- **Email OTP Length** — ‏`6`.
- **Email OTP Expiration** — מומלץ `3600` שניות (שעה). אפשר פחות (למשל 900).
- **Minimum password length** — ‏`8` (האתר דורש 8 ממילא).
- **Secure email change** — מומלץ להשאיר פעיל (אישור בשתי הכתובות).

Authentication → **URL Configuration**:
- **Site URL**: ‏`https://chord-room.pages.dev`
- **Redirect URLs**: להוסיף `https://chord-room.pages.dev/**` (וגם `http://localhost:8000/**` לבדיקות מקומיות).

## 3. להדביק את התבניות
Supabase → **Authentication** → **Emails** (בגרסאות ישנות: Email Templates). לכל תבנית: להדביק את **Subject** ואת כל תוכן קובץ ה־HTML בתיבת **Body** (מצב Source), ולשמור.

| תבנית ב־Supabase | קובץ | Subject (נושא) |
|---|---|---|
| Confirm signup | `supabase/email/confirm-signup.html` | `קוד האימות שלך ל־Chord Room` |
| Reset Password | `supabase/email/reset-password.html` | `איפוס הסיסמה ב־Chord Room` |
| Change Email Address | `supabase/email/change-email.html` | `אישור כתובת האימייל החדשה ב־Chord Room` |
| Magic Link | `supabase/email/magic-link.html` | `הקישור שלך לכניסה ל־Chord Room` |
| Reauthentication | `supabase/email/reauthentication.html` | `קוד לאישור פעולה בחשבון Chord Room` |

הערות:
- התבניות משתמשות במשתנים של Supabase: `{{ .Token }}` (הקוד), `{{ .ConfirmationURL }}` (הקישור), `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .NewEmail }}`. לא לשנות אותם.
- במיילי ההרשמה והאיפוס יש **גם קוד וגם קישור**. האתר עובד עם שניהם: הקוד מוקלד בחלון, והקישור הישן ממשיך לעבוד כגיבוי.
- ״Invite user״ לא בשימוש באתר — אפשר להשאיר כמו שהוא.

## 4. שולח בשם Chord Room — חובה SMTP משלכם
השולח המובנה של Supabase **מוגבל מאוד** (כמה מיילים בשעה לכל הפרויקט), מופיע כשולח של Supabase, ומיועד לבדיקות בלבד. כדי שהשולח יהיה `Chord Room <no-reply@הדומיין-שלכם>` ושהמיילים יגיעו לתיבה ולא לספאם, צריך **Custom SMTP**.

### מה צריך קודם
- **דומיין משלכם** (למשל `chordroom.co.il`). על `chord-room.pages.dev` אי אפשר להוסיף רשומות DNS, ולכן אי אפשר לאמת אותו לשליחת מייל.
- חשבון אצל ספק מייל. מומלץ אחד מהשניים:

**Resend** (resend.com) — פשוט ונוח:
1. פותחים חשבון → **Domains** → Add domain → מוסיפים ב־DNS את רשומות ה־SPF/DKIM שהם נותנים (ב־Cloudflare DNS אם הדומיין שם) → מחכים ל־Verified.
2. **API Keys** → יוצרים מפתח עם הרשאת Sending. **המפתח הוא סיסמת ה־SMTP** — מעתיקים אותו ישר ל־Supabase ולא שומרים אותו בשום קובץ.
3. פרטי SMTP: Host `smtp.resend.com` · Port `465` · Username `resend` · Password = המפתח.

**Brevo** (brevo.com) — יש מסלול חינמי נדיב:
1. פותחים חשבון → **Senders, Domains & Dedicated IPs** → מאמתים את הדומיין (רשומות DKIM/DMARC ב־DNS).
2. **SMTP & API** → **SMTP** → יוצרים SMTP key.
3. פרטי SMTP: Host `smtp-relay.brevo.com` · Port `587` · Username = ה־SMTP login שמופיע שם · Password = ה־SMTP key.

### איפה מזינים ב־Supabase
Supabase → **Authentication** → **Emails** → **SMTP Settings** (או Project Settings → Authentication → SMTP) → **Enable Custom SMTP**:
- **Sender email**: ‏`no-reply@הדומיין-שלכם`
- **Sender name**: ‏`Chord Room`
- **Host / Port / Username / Password** — לפי הספק (למעלה). את הסיסמה מקלידים רק כאן.
- **Minimum interval between emails** — אפשר להשאיר `60` שניות (תואם לספירה לאחור של ״שליחת קוד חדש״ באתר).

אחרי שמפעילים SMTP: Authentication → **Rate Limits** → להעלות את **Rate limit for sending emails** (למשל 100 לשעה) לפי הצורך.

### מסירות טובה (שלא ייפול לספאם)
- לוודא שב־DNS יש **SPF**, **DKIM** ו־**DMARC** (לפחות `v=DMARC1; p=none; rua=mailto:...` בהתחלה). הספק מראה בדיוק מה להוסיף.
- לשלוח מכתובת בדומיין שאומת (לא מ־gmail.com).
- לבדוק: להירשם עם כתובת Gmail ועם כתובת Outlook ולוודא שהמייל מגיע לתיבה הראשית, שהלוגו מוצג ושהקוד עובד.

## 5. בדיקה מהירה אחרי ההגדרה
1. באתר: ״הרשמה״ → פרטים → אישור התנאים → יצירת החשבון → מגיע מייל עם קוד → מקלידים → ״ברוכים הבאים״.
2. ״כניסה״ → ״שכחתם סיסמה?״ → מגיע קוד → קוד + סיסמה חדשה → מחוברים.
3. בפאנל הניהול → משתמשים → פרטי המשתמש החדש: מופיע ״תנאים שאושרו: גרסה 2026-09-28 · תאריך״.

## 6. עוד דברים שבעל האתר צריך להשלים
- **פרטי המפעיל** בתנאים ובמדיניות: בקובץ `assets/legal.js`, באובייקט `OPERATOR` בראש הקובץ (שם העסק, מספר עוסק/ח״פ, כתובת). עד שממלאים — מוצג באתר מקום מסומן להשלמה.
- **כתובת ליצירת קשר**: פאנל הניהול → הגדרות → חיוב ונקודות → ״יצירת קשר״. היא מופיעה בתנאים, במדיניות ובעמודי הבית והמחירים.
- כשמשנים את התנאים: לעדכן את הטקסט ב־`assets/legal.js` ואת `VERSION` (תאריך), ולהעלות את `?v=` של `legal.js` ב־`index.html`. חשבונות חדשים יישמרו עם הגרסה החדשה.
