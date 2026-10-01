# Chord Room — סקירה הנדסית (נכונות, דליפות, ביצועים, אבטחה, עלויות, בדיקות)

נמדד על `main` (`316da39`) + ה־worktree הזה, דרך השרת המקומי של `tools/tests/lib.py` (CSP אמיתי, backend מדומה),
Chromium headless על 2 ליבות. סקריפטים: scratchpad `i18n/` (דיפ מפתחות i18n), `perf/` (`perf_audit.py`, `race*.py`, `bigfns.mjs`).
חומרה: **P0** = שובר משתמשים/כסף · **P1** = באג אמיתי שפוגע בנתונים/אמון/עלות · **P2** = חוב שכדאי לסגור בקרוב.

מה תוקן כאן (מכני ובטוח בלבד, פירוט בסוף): 3 תיקוני `catch`/`revokeObjectURL` ב־`assets/app.js` + `?v=28`.
**אין ממצאי P0 פתוחים.** המערכת יציבה: 21/21 בדיקות עוברות (כולל `--slow`), אפס הפרות CSP, אפס דליפת זיכרון בטעינת 5 שירים.

---

## 1. מדידות (בסיס להשוואה)

| מה | ערך | הערה |
|---|---|---|
| משקל JS דחוס (gzip) | **444 KB** (app.js 120 · supabase.js 56 · pages 41 · crate 37 · legal 36 · mashup 34 · dj 24 · voice 23 · a11y 20 · assistant 17) | CSS 61 KB · 34 בקשות · הכול סינכרוני בסוף `<body>` |
| דף הבית מנותק | FCP 228 ms · DCL 490 · load 557 · **thread ראשי עסוק עד 5.7 שנ׳** | 9 משימות ארוכות (641 ms); `TaskDuration` מצטבר 5.4 שנ׳; `RecalcStyle` 763 ms על 5 015 צמתים (ההצהרה המשפטית וה־FAQ כולם ב־DOM) |
| הכלי (מצב מקומי) | FCP 196 ms · הדמו מנותח ב־3.0 שנ׳ · 3 משימות ארוכות (173 ms) | `ScriptDuration` 190–217 ms = פרסינג+ריצה של 1.3 MB JS |
| זיכרון אחרי דמו → 5 טעינות שיר | JS heap 2.6 → 3.5 MB · RSS renderer 200 → 205 MB · מאזינים 365 → 376 | **אין צמיחה** — `analyze()` משחרר את ה־buffer הקודם |
| ציור קנבס במנוחה (כלי) | `bgCanvas` 30 fps קבוע גם כשלא מנגן; הגל נצבע רק כש־`dirty` | DJ: `frame()` מצייר גלים/VU/ויז׳ואלייזר 60 fps כל עוד המסך גלוי, גם בלי נגינה |
| פונקציות גדולות | IIFE יחיד 320 KB ב־app.js; הגדולה הבאה `renderPricing` 7.8 KB | אין פונקציה פתולוגית — הבעיה היא נפח הטעינה הראשונית, לא נקודה חמה |
| i18n | **31 טבלאות, 0 פערים** בין he/en/ar/ru/es; 572 מפתחות מוגדרים, 440 בשימוש, 0 מפתחות חסרים | כולל `IGATE`, `dj-i18n`, crate/mashup/voice/assistant/pages/legal/a11y/shell |

---

## 2. P1

**P1-1 — `analyze()` לא מוגן מריצות מקבילות: ניתוח של שיר א׳ נוחת על שיר ב׳ (אומת).**
`assets/app.js:1234`. הפונקציה אסינכרונית (מניבה כל 400 פריימים ב־`computeOnset`/`computeChroma`) וכותבת ישירות ל־`S` בכל שלב.
ה־overlay `#busy` מכסה רק את הדק; כפתור ההעלאה, drag-drop על החלון, "פתח בכלי" מ־Discover ו־`userSwitched` (כניסה שמגיעה
אחרי timeout של 4 שנ׳ ב־`authChanged`, `app.js:1790`) כולם יכולים להפעיל `analyze` נוסף בזמן שאחד רץ.
רפרודוקציה (`perf/race3.py`): טוענים קובץ של 90 שנ׳, ובזמן "מאתר פעמות…" מפילים קובץ של 30 שנ׳ →
הכותרת והגל של הקצר, אבל **הסולם E→A והאקורדים זבל** (86 תווים במקום 48, N.C. בכל תיבה) כי `S.chroma` של הארוך
נכנס אחרי `S.beats` של הקצר; `busy(null)` של הראשון מסיר את ה־overlay בעוד השני רץ; `saveLib()` שומר את הזבל תחת שם
הקצר, ו־`offerCatalogMatch` (קובץ ≥60 שנ׳) מציע לדחוף אותו ל־`catalog` המשותף.
תיקון (מונה דור, 10 שורות):
```js
let anGen=0;
async function analyze(buffer,name,demo,nosave){
  const gen=++anGen,live=()=>gen===anGen;
  stop();P.pos=0;cancelSep(true);
  Object.assign(S,{...});                       // כמו היום
  $('#notice').hidden=true;renderStats();renderStemsUI();
  busy(t('bPrep'),0.02);await tick();if(!live())return;
  const x=await toMono(buffer);if(!live())return;
  busy(t('bWave'),0.08);await tick();if(!live())return;
  S.wave=computeWave(x);buildOverview();
  const on=await computeOnset(x,p=>live()&&busy(t('bBeats'),0.1+p*0.3));if(!live())return;
  S.env=on.env;S.lowEnv=on.low;
  const chroma=await computeChroma(x,p=>live()&&busy(t('bChords'),0.4+p*0.48));if(!live())return;
  S.chroma=chroma;
  ... (fitGrid/buildBeats/recompute ללא שינוי)
  try{const L=await measureLoudness(buffer);if(live()){S.lufs=L.lufs;S.peak=L.peak}}catch(e){}
  if(!live())return;renderStats();busy(null);
  if(!demo&&!nosave){saveLib();if(buffer.duration>=60)offerCatalogMatch()}
}
```
ולהוסיף בדיקה: `race3.py` כמעט מוכן להיות `tools/tests/ui/test_analyze_race.py` (צריך רק להעתיק את `gen_edm.make` ל־fixture).

**P1-2 — Mashup Studio מחזיק עד 4 שירים מופרדים בזיכרון: ~1.3 GB על שירים של 4 דק׳.**
`assets/mashup.js:190–192`: `CACHE` עד 4 ערכים, כל ערך 4 סטמים סטריאו float32 ב־44.1 kHz (= 4 × 2 × 4 B × 10.6 M = 340 MB
לשיר של 4 דק׳) + ה־buffer המקורי. בטלפון/מחשב עם 8 GB זה קריסת טאב — והקריסה היא אחרי שההפרדה **כבר שולמה**
(`sepCrashCheck` מחזיר רק את ההפרדה שבאוויר, לא כזו שהסתיימה). תיקון: לשמור בקאש לכל היותר 2 שירים **ולהגביל לפי דגימות**
(למשל ≤ 120 M floats בסך הכול), או לשמור סטמים כ־`Int16Array` (חצי זיכרון, ללא הבדל נשמע במאשאפ) ולהמיר ל־AudioBuffer רק
בניגון; ובכל מקרה `CACHE.clear()` ב־`hide()` של המסך כשאין ייצוא פעיל.

**P1-3 — ברירת מחדל של מכסת אחסון: 5 GB ו־2 000 קבצים לכל משתמש, והעלאה אוטומטית של כל קובץ.**
`supabase/schema.sql:1562–1565` (`storage_mb` 5120, `max_files` 2000) + `assets/app.js:3133` (`storeUpload` רץ על כל
`loadFile`, בלי אישור). משתמש חינמי יחיד יכול למלא פי 5 את שכבת החינם של Supabase (1 GB) ו־20 משתמשים את ה־Pro (100 GB);
כל פתיחה מהספרייה = egress מלא של הקובץ. תיקון: ברירת מחדל 300–500 MB / 100 קבצים לחשבון חינמי, מכסה גבוהה למנויים
(לקרוא `plan` ב־`storage_room`), ולהעלות רק כשהמשתמש שומר במפורש או אחרי הניתוח הראשון המוצלח (לא על כל גרירה).
ה־`billing` כבר תומך בערכים האלה — זה שינוי ברירת מחדל + שורה ב־`storage_room`.

---

## 3. P2 — נכונות ודליפות

| # | קובץ:שורה | מה | למה | תיקון |
|---|---|---|---|---|
| 2-1 | `app.js:1790` | `setTimeout(…authChanged(null,'TIMEOUT'),4000)` → אם Supabase עונה ב־4.5 שנ׳ (נעילת `navigator.locks` בין טאבים, רשת איטית), האתר מתחיל כאורח, מנתח דמו, ואז `userSwitched` מריץ `restoreLast` **במקביל** לדמו | אותו מירוץ כמו P1-1, מופעל בלי מגע משתמש | P1-1 פותר; בנוסף `userSwitched` יכול לבדוק `if(!$('#busy').hidden)` ולהמתין ל־idle |
| 2-2 | `app.js:1440` | `aiSeparate`: אחרי `aiRun` — `if(job!==AI.job‖S.buffer!==token)return;` בלי `refund` | `cancelSep` כבר מחזיר כשמחליפים שיר, אבל אם `S.buffer` התחלף בלי `cancelSep` (עתידי) ההפרדה שולמה ונזרקה | `if(S.buffer!==token){refund(AI.pay);AI.pay=null;sepEnd(null);return}` |
| 2-3 | `app.js:1415–1424` | `aiRun` מקצה 4 AudioBuffers סטריאו באורך מלא **לפני** שהעבודה מתחילה (שיר 5 דק׳ = 423 MB) בנוסף ל־`LR` | בטלפונים זו הסיבה העיקרית ל"הדפדפן נסגר באמצע" (ולכן `sepCrashCheck`) | להקצות סטמים ב־Float32 מונו-ליניארי ולהמיר רק בסוף, או `copyToChannel` לתוך buffers שנוצרים ב־`blk` הראשון לפי `d.tot`; להציג אזהרה כש־`len*32 > 300 MB` |
| 2-4 | `dj.js:366` | `URL.createObjectURL` ל־worklet המקליט — פעם אחת לחיים, לא משוחרר | זניח (פעם אחת) — רק עקביות | `addModule(u).finally(()=>URL.revokeObjectURL(u))` |
| 2-5 | `app.js:1041` | מטרונום ב־`setInterval` 25 ms לנצח, גם כשהדף ברקע/בלי שיר | CPU ברקע בטלפון; Chrome ממילא מאט ל־1 s ברקע, ואז הקליקים נדחסים | להפעיל את ה־interval רק ב־`play()` ולנקות ב־`stop()` |
| 2-6 | `dj.js:912` | `frame()` מצייר `drawWaves`/`drawOv`/VU/ויז׳ואלייזר 60 fps כל עוד `D.visible`, גם כששני הדקים עצורים | מחשב נייד מתחמם במסך DJ פתוח ברקע | כש־`!D.decks.some(d=>d.playing)&&!D.rec` לרדת ל־10 fps (`setTimeout(frame,100)`) |
| 2-7 | `bg.js` | אנימציית הרקע 30 fps קבועים בכל מסך | 2–4 % CPU תמידי; מכובה רק ב־`noanim`/`hidden` | אחרי 10 שנ׳ בלי `BG.pulse` לרדת ל־5 fps או לעצור |
| 2-8 | `app.js:3081` | `rememberSong` שומר Blob עד 200 MB ב־IndexedDB על כל טעינה | iOS Safari מוחק IndexedDB אחרי 7 ימים בלי ביקור, וב־Private mode הכתיבה זורקת — נתפס, בסדר; אבל 200 MB × שיר אחד זה הרבה ל־quota של 50 MB-ish בחלק מהדפדפנים | להוריד ל־60 MB, או לשמור רק `meta` כשיש `file_path` בענן |
| 2-9 | `app.js:2600` | `#udCred details` `toggle` — `catch(x){}` בולע שגיאה בלי לוג | קושי בדיבוג פאנל הניהול | `catch(x){console.warn(x)}` |
| 2-10 | `backend.js:42–51` | `init` — `onAuthStateChange` + `getSession` שניהם קוראים ל־`onChange('INITIAL')`/`INITIAL_SESSION` | `authChanged` עמיד (בודק `prev!==uid`), אבל `loadProfile` רץ פעמיים ברצף (2× `getProfile`, 2× `myAccess`, 2× `refill_credits`) | לדלג על `INITIAL_SESSION` של `onAuthStateChange` כש־`getSession` כבר ענה (דגל `B._init=true`) |

## 4. P2 — נגישות

| # | היכן | מה | תיקון |
|---|---|---|---|
| 4-1 | `index.html:212` `#acc`, `:319` `#admin` | פאנלים מודאליים בלי `role="dialog"`, `aria-modal`, `aria-labelledby`; הפוקוס לא עובר פנימה בפתיחה ולא חוזר לכפתור בסגירה; אין focus trap (ל־`#authBox` יש, `app.js:2008`) | אותו `trap` כמו ב־authBox; `openDlgLike(el,opener)` משותף: שומר `document.activeElement`, מעביר פוקוס ל־`.hd button`, מחזיר ב־Esc/סגירה |
| 4-2 | `index.html:115` `#busy`, `:111` `#sprog` | התקדמות הניתוח וההפרדה בלי `role="progressbar"`/`aria-live` — קורא מסך לא יודע שמשהו קורה (ל־crate/voice/mashup יש) | `#busyMsg` → `role="status" aria-live="polite"`; `.pbar`/`.track2` → `role="progressbar" aria-valuenow` מעודכן ב־`busy()`/`sepProgress()` |
| 4-3 | `index.html:86–87` `#ov`, `#zm` | הקנבסים בלי שם נגיש ובלי חלופה; הניווט במקלדת קיים (חצים ב־`keydown` גלובלי) אבל לא מתועד ל־AT | `role="img" aria-label="גל הקול · {bpm} BPM · {key}"` מעודכן ב־`renderStats`, ו־`tabindex="0"` על `#zm` עם `aria-keyshortcuts` |
| 4-4 | `app.js:1332` מיקסר | כפתורי K/M/S בלי `aria-pressed` (יש `title`), פיידר עם `aria-label` ✓ | `aria-pressed="${m.mute}"` וכו׳ |
| 4-5 | `app.js:3217` | Esc סוגר הכול כולל `#lib`/`#mix` בלי להחזיר פוקוס | חלק מ־4-1 |
| 4-6 | `app.css` | `.snote`/`.rnote` ב־`--faint` על רקע הדק: יש לוודא ≥ 4.5:1 גם ב־`data-theme="light"` (ראו REVIEW-UX מקרא 10 px) | טוקן `--muted-aa` ייעודי לטקסט ≤ 12 px |

## 5. אבטחה — מה השתנה מאז הביקורת הקודמת

נבדק: `functions/api/assistant.js`, `supabase/assistant.sql`, הבריידג׳ים `separateBuffer`/`voiceSong`/`setTranspose`, `_headers`,
`_middleware.js`, `index.html` (0 `on*=`/`javascript:`), ו־`test_security` (17/17, 0 הפרות CSP). **אין ממצא חוסם.**

* `assistant_use()` — definer עם `search_path` נעול, `for update` על שורת היום, burst 8/30 לדקה, מכסה לפי plan, `blocked` נבדק,
  מחירים מסוננים (`assistant_prices` בלי links/variants), `revoke … from anon`. ✓ `guard_config_assistant` מאמת טיפוסים. ✓
* `assistant.js` (Function) — Origin same-host, 32 KB גוף, 24 הודעות × 2000 תווים, ניקוי תווי בקרה/U+2028, `MAX_TOKENS` 900, timeout
  8 s ל־Supabase, `AbortController` לאפסטרים, לוגים בלי מפתחות (אומת ב־`assistant_fn` 65 בדיקות). ✓
  הערה (P2): המכסה נגבית **לפני** הקריאה למודל — כשל 502 "עולה" הודעה למשתמש. אפשר `assistant_refund()` קטן או לקרוא ל־`assistant_use`
  רק אחרי ה־handshake של הזרם (קונפליקט עם זמן תגובה — החלטה מוצרית).
* `separateBuffer` — `ref` נחתך ל־200 תווים לפני `charge`; `payFor` → `charge` → החזר בכישלון/ביטול; נעילה `AI.ext`. ✓
  `setTranspose` מוגבל ל־±12 ומעוגל. ✓ `voiceSong` חושף רק buffers (אין PII). ✓
* CSP — `script-src 'self' 'wasm-unsafe-eval' blob:` ללא inline; `/ai/*` בלי CSP (ORT embind) — מתועד; `frame-ancestors 'none'`; COOP/CORP. ✓
  `_middleware.js` מסתיר כעת `/*.md` (P0-1 של REVIEW-UX נסגר ב־`316da39`) ו־`_routes.json` כולל `/*.md`. ✓
* נקודה לתשומת לב (P2): `catalog_play` ניתן ל־`anon` — מוגן ב־slot שעתי לכל `cid`, אבל אין תקרה על **מספר `cid` שונים** לשעה מאותו
  anon; בוט יכול להעלות `plays` לכל הקטלוג ב־1/שעה לשיר. תקרה: ≤ 200 שורות `who='anon'` לשעה (ספירה זולה על PK).

## 6. מלכודות עלות — Cloudflare / Supabase

| # | מה | מספרים | הצעה |
|---|---|---|---|
| 6-1 | **אחסון ו־egress של `uploads`** (ראו P1-3) | 5 GB × משתמש; Supabase Free 1 GB אחסון / 2 GB egress לחודש, Pro 100 GB / 250 GB | מכסה לפי plan + העלאה מפורשת; תזכורת "קבצים בענן: X MB" בפרופיל |
| 6-2 | **`activity`** | `view`/`visit`/`discover_open`… — `logAct` מוגבל ל־30 שנ׳ לאותו מפתח ו־400/שעה למשתמש בשרת; 1 000 DAU × ~80 שורות = 80 k שורות/יום ≈ 14 M שורות ב־180 יום ≈ 2–3 GB (Free DB = 500 MB) | שמירה 30 יום ל־`view`/`visit`, 180 יום לפעולות כסף; ניקוי מתוזמן (pg_cron או Cloudflare Cron Trigger → RPC `prune_activity()`) במקום `random()<0.005`; טבלת `activity_daily` מצטברת לפאנל |
| 6-3 | **מודל AI 78 MB** | Pages: רוחב פס חינם, קבצים `immutable` לשנה ✓ — העלות היא של המשתמש (נתונים סלולריים) ושל ה־cache של הדפדפן שנזרק | Service Worker + Cache API עם גרסה (`wman.json` כמפתח) — ראו רעיונות ב־ROADMAP; להציג "המודל כבר במכשיר" לפני החיוב |
| 6-4 | **פרוקסי Deezer** | כל פתיחת Discover = 3–6 הפעלות Function (מצעד, חדשים, Top Israel, פלייליסט, אלבומים); Pages Functions Free = 100 k/יום. `cf.cacheTtl` על subrequest לא מובטח לכל התוכניות | `caches.default.match(request)` בתחילת ה־Function + `put` (15 דק׳) — חוסך את הקריאה ל־Deezer גם אם ההפעלה נספרת; בצד הלקוח cache ב־`sessionStorage` ל־10 דק׳ |
| 6-5 | **Assistant** | Haiku 4.5, `max_tokens` 900, system prompt ~6 KB עם `cache_control` ✓; מכסה 30/150 ליום | לוג יומי של `input_tokens`/`output_tokens` לפי משתמש (ב־`assistant_usage`) כדי לראות עלות אמיתית לפני שמעלים מכסות |
| 6-6 | `log_activity` מבצע `count(*)` לשעה אחרונה בכל קריאה | יש אינדקס `(user_id, created_at)` ✓ — זול; רק לוודא שלא מוסיפים `logAct` בתוך לולאות ציור | — |

## 7. פערים בחבילת הבדיקות

| פער | למה חשוב | הצעה |
|---|---|---|
| אין בדיקת ריצות מקבילות של `analyze` | P1-1 | `perf/race3.py` → `ui/test_analyze_race.py` |
| **אין בדיקה ל־dj.js** מעבר למעבר האבטחה (SYNC, פאזת תיבה, הקלטה, auto transition) | 69 KB קוד אודיו עם לוגיקת זמן עדינה; ה־"≤1 ms" אומת ידנית בלבד | טעינת שני `synthDemo` עם BPM שונה, SYNC, הקלטה 4 שניות, קורלציה בפייתון (numpy כבר תלות) |
| **אין בדיקה ל־mashup.js / voice.js** | מסכים חדשים עם חיוב (`separateBuffer`) | מאשאפ: quick DSP split (חינמי) + `exportMix` → WAV, לבדוק שהדאונביטים מתיישרים (כבר נמדד ידנית ≤0.5 ms); voice: `recommend()` על טווחים סינתטיים |
| אין בדיקת ייצוא של הכלי (WAV/MIDI/ZIP, `fxRender` עם transpose/rate) | זה המוצר למפיקים; MIDI נבדק רק ב־drums synthetic | ZIP → פענוח בפייתון, בדיקת TBPM/מספר קבצים/אורך WAV = `dur/rate` |
| אין בדיקת i18n אוטומטית | 5 שפות × 31 טבלאות — היום נשענים על משמעת | הסקריפט `i18n/i18n_diff.mjs` (acorn) כ־`node/i18n.test.mjs`; או גרסה בלי תלות: `new Function` על כל `const I*={…}` |
| אין בדיקת ביצועים/תקציב | רגרסיות משקל (legal.js +117 KB נכנס בלי שאיש שם לב) | `node/budget.test.mjs`: gzip של כל קובץ ב־`index.html` ≤ תקרה; סה״כ ≤ 460 KB; זמן עד `#busy` נעלם בכלי ≤ 6 שנ׳ |
| `payReturn` (`?paid=1#pricing`) ו־`refill_credits` בצד הלקוח | זרימת הכסף אחרי החזרה מהצ׳קאאוט | מוק `loadCredits` עם עיכוב; לבדוק טוסט/שגיאה/polling נעצר |
| הקראת שגיאות: אין איסוף `pageerror` בפרודקשן | הסוויטה תופסת רק מה שהבדיקות מפעילות | ראו רעיון `client_errors` ב־ROADMAP |
| "ידועים" (`t.known`) | 2 באגי גריד (hats/lead-0) מתועדים ב־REVIEW-MUSIC עם תיקון של שורה | אחרי התיקון להפוך ל־`t.check` |

## 8. מה שונה בפועל ב־worktree הזה (מכני, בטוח)

`assets/app.js` (+ `index.html`: `app.js?v=27` → `?v=28`):
1. `:1531` — ה־Worker של YIN: ה־blob URL משוחרר מיד אחרי `new Worker` (היה דולף 2 URLs לכל תמלול), ונוסף `onerror` שדוחה את
   ההבטחה במקום לתלות את הייצוא לנצח אם ה־worker נכשל (`exportZip` כבר עטוף ב־try/catch).
2. `:2147` — תצוגה מקדימה של אווטאר: ה־blob URL הקודם משוחרר לפני יצירת חדש.
3. `:2165` — `signOutBtn`: `try/catch` סביב `Backend.signOut()` כדי שהפאנל ייסגר גם כשהרשת נופלת (היה unhandled rejection).
4. `:3267` — `initAccount().catch(console.warn)` — דחייה מ־`Backend.init`/`getSession` לא נשארת unhandled.

הסוויטה המלאה רצה **לפני** השינויים (ירוקה); `node --check` עובר; השינויים לא נוגעים בזרימה שהבדיקות מכסות, מומלץ להריץ
`run_all.sh -k security -k persist` לפני המיזוג.

## 9. תוצאות הסוויטה (עץ `main` + worktree, לפני התיקונים)

`tools/tests/run_all.sh --keep-pg` → **20 בדיקות, 0 נכשלו, 368 שנ׳** (2 ליבות, `-j 1`); `--slow -k separation` → **12 ok, 115 שנ׳**.

| קבוצה | בדיקה | זמן | | קבוצה | בדיקה | זמן |
|---|---|---|---|---|---|---|
| node | assistant_fn | 1 s | | ui | test_gate | 27 s |
| node | functions | 0 s | | ui | test_legal_home | 18 s |
| sql | test_assistant_sql | 4 s | | ui | test_per_user | 16 s |
| sql | test_schema_security | 11 s | | ui | test_persist | 9 s |
| ui | test_assistant_md | 2 s | | ui | test_referral | 7 s |
| ui | test_assistant_ui | 70 s | | ui | test_roles | 14 s |
| ui | test_auth_mobile | 26 s | | ui | test_security | 49 s |
| ui | test_auth_signin | 19 s | | ui | test_smoke | 13 s |
| ui | test_auth_signup | 26 s | | ui | test_welcome | 14 s |
| ui | test_crate_cues | 26 s | | slow | test_separation | 115 s |
| ui | test_discover_player | 16 s | | | | |

Flaky: לא נצפה (ריצה אחת; `test_assistant_ui` הוא הארוך והרגיש ביותר לעומס — 70 שנ׳ עם `-j 1`). "ידועים" שדווחו: 2 (גריד על hats
ב־−20 dB; מוזיקה מ־0:00 → קיו תיבה מאוחר), שניהם עם תיקון של שורה ב־REVIEW-MUSIC §1.2.
