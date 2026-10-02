# ציד באגים + אבטחת צד לקוח — אוקטובר 2026

היקף: כל המסכים בדפדפן (Chromium, mock backend, משתמש רגיל + אדמין), he/en/ar/ru/es, בהיר/כהה, 1440/1024/375.
קלט עוין: backend עוין (`mock/evil.js`), JSON עוין מ־Deezer, קבצים עם שמות ותגי ID3 עוינים (`fixtures/gen_evil.py`),
localStorage מורעל, payload ב־hash וב־`?ref=`. שינויים בקוד מסומנים `/* sec */` או `/* fix */`.

## ממצאים

| # | חומרה | מסך | ממצא | תוקן? |
|---|---|---|---|---|
| 1 | בינונית | גלה שירים | נתוני Deezer (`rowFromTrack`, `freshPreview`) לא נבדקו כמו שורות הקטלוג: `cover` = `javascript:` הגיע ל־`<img src>`, preview מכל דומיין נטען ב־fetch. רק ה־CSP עצר (הפרות CSP + פנייה לשרת זר). עכשיו: מזהה מספרי בלבד, מחרוזות מוגבלות, cover/preview רק `*.dzcdn.net`, קישור רק `www.deezer.com` | כן |
| 2 | בינונית | המרה, ספרייה (USB), כל ZIP | שמות קבצים בתוך ZIP: בממיר נשמרו `< > " \| ? *`, תו RLO (U+202E, "gpj.exe" מזויף) ו־`CON.wav`; ב־"USB ל־Pioneer" נוצר `CON.mp3` (שם התקן ב־Windows — החילוץ נכשל). עכשיו `zipName` מרכזי ב־`zip()` (+ `CR.zipName`): בלי `..`/נתיב מוחלט/כונן, בלי תווי בקרה/bidi, בלי שמות שמורים, כפילויות ← ` (2)`; `saveBlob` מנקה את שם ההורדה | כן |
| 3 | בינונית | ספרייה | הזרקת שורות ל־M3U8: CR/LF בשם קובץ הוסיף שורות לפלייליסט (למשל כתובת חיצונית) — ב־M3U8, ב־ZIP השמות החדשים וב־USB. עכשיו כל שדה בשורה אחת (`m3l`), והנתיבים תואמים בדיוק לשמות שב־ZIP | כן |
| 4 | נמוכה–בינונית | נקודות / הפרדה | "לא לשאול שוב" (`chordroom.payok.v1`, `chordroom.sepok`) היה משותף לכל החשבונות באותו דפדפן — חשבון אחר חויב בלי שאלה. עכשיו לפי חשבון (`:<uid\|guest>`) | כן |
| 5 | נמוכה | מיקס (DJ) | כפתור LOAD בכל דק: `e.currentTarget` נקרא אחרי `await` (=null) → TypeError והתפריט לא נפתח כשהכפתור מופעל דרך `element.click()` (שליטה קולית / switch access, אוטומציה). עכבר, Enter ו־Space עבדו | כן |
| 6 | בינונית (נגישות) | השירים שלי, חשבון, ניהול, בוחר השירים ב־DJ | הפוקוס לא עבר לפאנל בפתיחה ולא חזר לכפתור בסגירה; בפאנל הניהול (מכסה את כל המסך) Tab יצא לדף שמאחור; בוחר השירים ב־DJ בלי `role=dialog`, בלי מלכודת פוקוס | כן |
| 7 | נמוכה | מחירים, ru, 375px | כרטיס "הזמינו חברים" רחב מהמסך (גלילה אופקית): לשדה הקישור היה רוחב מובנה. `.refurl{width:0}` | כן |
| 8 | נמוכה | נגן Deezer מלא | ה־iframe בלי `sandbox`. מומלץ `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"` — לבדוק מול הווידג׳ט האמיתי (כניסה ל־Deezer, EME) לפני שמכניסים | לא — המלצה |
| 9 | נמוכה (תכנון) | נקודות v2 | יומן `chordroom.payjobs.v1` / `progressN` הוא נתון של הלקוח: משתמש יכול לערוך אותו (או לקרוא ל־`refund_credits_n` ישירות) ולקבל החזר על אצווה שכבר נמסרה, עד 3 שעות ובתוך התקרות. השרת מגביל (סכום ≤ ששולם, 20 החזרים / 1000 יחידות ליום) — זה ה־"honest-user level" המתועד. הוחלט אצל צד השרת/הבעלים | לא — לצד השרת |
| 10 | נמוכה | כללי | טוסט עם כפתורי פעולה נעלם אחרי 7 שנ׳ (WCAG 2.2.1) | לא |
| 11 | נמוכה | כללי | מפתחות משותפים לכל החשבונות: `chordroom.translit.v1`, `chordroom.dzartist.v1`, `chordroom.convert.v1`, `chordroom.lastpos` — העדפות בלבד, בלי מידע רגיש | לא (בכוונה) |
| 12 | — | בדיקות | `test_per_user` "A signs in again → its song is back" נכשל פעם אחת על העץ המקורי (תזמון 30 שנ׳), עבר על העץ הזה | לעקוב |

## נבדק ותקין (בלי ממצא)
כל ה־`innerHTML` במודולים עוברים `esc`; טבלאות הניהול / פרופילים / יומן / pay_events עם payloads; Roomy (‏`test_assistant_md`);
CSV כבר מצטט נוסחאות (`'=`); XML/NML (`xa` מסנן תווים לא חוקיים); כתובות אווטאר, contact/checkout/portal רק https/mailto;
`?ref=` לפי regex ומוסר מה־URL; hash לא מוכר ← טוסט ב־textContent; אין `postMessage` handlers; `window.open` עם noopener;
אין `target=_blank` בלי noopener; אין mixed content; סקריפטים רק מהאתר; `frame-ancestors 'none'` + `X-Frame-Options: DENY`;
שחזור הגדרות מ־localStorage (ספרייה, מאשאפ, אקסטנדד, קול, ממיר) מסנן טיפוסים וטווחים; זיכרון יציב ב־5 טעינות (כלי + DJ).
אין מחרוזות חסרות: כל טבלת תרגום כוללת את כל 5 השפות וכל `t('key')`/`data-i` מוגדר (`tools/tests/i18n_static.py`).

## בדיקות
- `ui/test_security.py` הורחב: Deezer עוין, קבצים עוינים בכלי/השירים שלי/ספרייה/ממיר/מאשאפ/DJ/אקסטנדד, ZIP + M3U8 + CSV,
  hash/`?ref=`, דפים משפטיים עם contact של `javascript:`, הגדרות מורעלות. על העץ המקורי: 10 כשלים; כאן: 37/37.
- `ui/test_bughunt.py` (חדש): כל המסכים × שפות × רוחבים × ערכות צבע — שגיאות קונסול, הבטחות שנדחו, גלילה אופקית, מפתחות
  תרגום גולמיים / `{placeholder}` / undefined / NaN, אנגלית שנשארה ב־he/ar/ru, חפיפת כפתורים צפים, פוקוס בדיאלוגים, זיכרון.
  על העץ המקורי נופל על #5 ו־#7.
- `ui/test_per_user.py`: "לא לשאול שוב" לפי חשבון (נופל על העץ המקורי). `ui/test_points.py` עודכן למפתח החדש.

## צילומי מסך
`/tmp/claude-0/-home-claude-chord-room/dd02b687-b28c-5837-8156-efae9320a6c1/scratchpad/bughunt/`
- `ru_375_pricing_refcard_before.png` / `ru_375_pricing_refcard_after.png` — #7
- `fab_{he,en}_375_*.png` — כפתורים צפים מעל נגן Deezer (תקין)
- `explore/` — סיור בכל הזרימות (he 1440, ar כהה 375)
