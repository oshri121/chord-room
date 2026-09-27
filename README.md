# Chord Room

כלי מוזיקה בדפדפן: מזהה BPM, סולם ואקורדים, מציג גל RGB כמו ברקורד בוקס, מפריד ערוצים עם AI (Demucs v4), ומייצא WAV ו־MIDI ל־FL Studio. יש בו משתמשים, פרופילים ומערכת ניהול.

- **אתר סטטי:** HTML, CSS ו־JS בלי שלב build. אפשר לערוך קובץ, לדחוף, והאתר מתעדכן.
- **Supabase:** הרשמה עם אימייל וסיסמה, פרופילים, ספריית שירים ותמונות פרופיל.
- **Cloudflare Pages:** אחסון עם תעבורה בלי הגבלה. כל `git push` מעלה גרסה חדשה.

---

## הקמה ראשונה (פעם אחת)

### 1. מסד הנתונים ב־Supabase
1. בדשבורד של הפרויקט: **SQL Editor ← New query**.
2. מדביקים את כל התוכן של [`supabase/schema.sql`](supabase/schema.sql) ולוחצים **Run**.
3. **המשתמש הראשון שנרשם לאתר הופך למנהל.** תירשם ראשון.

### 2. העלאה ל־Cloudflare Pages
1. נכנסים ל־[dash.cloudflare.com](https://dash.cloudflare.com), ובתפריט: **Workers & Pages ← Create ← Pages ← Connect to Git**.
2. בוחרים את ה־repository בשם `chord-room`.
3. בהגדרות ה־build:
   - Framework preset: **None**
   - Build command: *(ריק)*
   - Build output directory: `/`
4. **Save and Deploy**. אחרי כדקה מקבלים כתובת כמו `chord-room.pages.dev`.

### 3. חיבור הכתובת ל־Supabase (חובה בשביל מיילים של אימות ואיפוס סיסמה)
ב־Supabase: **Authentication ← URL Configuration**:
- **Site URL:** הכתובת של האתר, למשל `https://chord-room.pages.dev`
- **Redirect URLs:** מוסיפים `https://chord-room.pages.dev/**`. אם חיברת דומיין משלך, מוסיפים גם אותו.

### 4. דומיין משלך (אופציונלי)
ב־Cloudflare Pages: **Custom domains ← Set up a custom domain**. אחר כך מעדכנים את ה־Site URL ב־Supabase.

---

## פיתוח מהטלפון או ממחשב אחר

הקוד נמצא ב־GitHub, ולכן אפשר לעבוד עליו מכל מקום:

- **Claude Code** (באתר claude.ai/code או באפליקציה בטלפון): פותחים סשן חדש על ה־repo `chord-room` וכותבים מה לשנות. Claude יערוך את הקוד וידחוף, ו־Cloudflare יעלה את הגרסה החדשה אוטומטית.
- **מחשב אחר:** `git clone https://github.com/oshri121/chord-room.git`, עורכים, ואז `git push`.
- **הרצה מקומית:** מתוך תיקיית הפרויקט מריצים `python3 -m http.server 8000` ופותחים את `http://localhost:8000`.

הקובץ `CLAUDE.md` מסביר ל־Claude איך הפרויקט בנוי, כך שכל סשן חדש מתחיל עם ההקשר הנכון.

---

## מבנה הפרויקט

| נתיב | מה יש בו |
|---|---|
| `index.html` | מבנה העמוד |
| `assets/app.css` | העיצוב |
| `assets/app.js` | כל הלוגיקה: תרגומים, ניתוח, גל קול, נגן, הפרדה, ייצוא, חשבונות |
| `assets/backend.js` | החיבור ל־Supabase (הרשמה, פרופיל, שירים, ניהול) |
| `config.js` | כתובת Supabase והמפתח הציבורי |
| `supabase/schema.sql` | טבלאות, הרשאות ואבטחה |
| `ai/worker.js` | מריץ את מודל ה־AI בדפדפן (ONNX Runtime Web) |
| `ai/model/*` | משקלות Demucs (fp16, דחוסים ומפוצלים) |
| `vendor/supabase.js` | ספריית Supabase (גרסה 2.117.2) |
| `tools/` | סקריפטים לבנייה מחדש של ה־worker ושל קובצי המודל |
| `_headers` | כותרות HTTP ל־Cloudflare Pages |

## אבטחה
- `config.js` מכיל רק את המפתח **הציבורי** (publishable/anon). ההרשאות האמיתיות נאכפות במסד הנתונים (Row Level Security).
- משתמש רגיל לא יכול להפוך את עצמו למנהל, לשנות הגדרות אתר או לראות נתונים של אחרים. בדקנו את זה מול Postgres.
- **לעולם** לא מכניסים לקוד את ה־`service_role` / secret key.

## רישיון המודל
משקלות Demucs של Meta מותרים לשימוש אישי ומחקרי בלבד. שימוש מסחרי ידרוש מודל אחר.
