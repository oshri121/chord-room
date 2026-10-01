/*
 * Extended generator (#extended): a DJ extended version of a track, made as an EDIT of the song itself. Nothing new is
 * composed and the vocals, melody and tempo are never changed: every second of the result is the original audio (or some
 * of its stems), cut and repeated on the song's own bar grid. Talks to the app only through window.CR (bridge at the end of
 * app.js). Settings (never audio) are kept per account in localStorage `chordroom.extended.v1:<uid|guest>`. Only the current
 * song's stems are kept in memory; leaving the view frees the free (quick) stems and the render (paid AI stems are kept).
 *
 * 1. Analysis (all in the browser):
 *    CR.analyzeTrack → BPM, key, beat grid (offset + downbeat) and the RGB waveform; stems from the free quick DSP split
 *    (assets/quicksep-worker.js, default) or from AI separation (CR.separateBuffer: the same points as the tool, charged before,
 *    refunded on failure), or the tool's stems when the song comes from the tool. CUES._features → 50 ms band envelopes
 *    (all, lows <110 Hz, highs >6 kHz, centre/side 0.8–3.5 kHz), CR.chromaOf → chroma frames. Everything is averaged per BAR
 *    (bar k starts at firstDownbeat + k·bar) and normalised to its 90th percentile over the music:
 *      lo (kick + bass), dr (drums stem), vo (vocals stem), md (other stem), hi, fu (all), and a 24-bin chroma vector.
 * 2. Sections (a heuristic, the user can relabel and drag boundaries):
 *    novelty(k) = |features(k−4…k) − features(k…k+4)| + 0.6·(1 − cos chroma), the 4-bar phrase lattice is the offset that
 *    collects the most novelty (and the CUES.detect bars); boundaries = lattice bars with novelty ≥ ⅓ of its 95th percentile
 *    (off-lattice only when much stronger), plus the CUES.detect cue bars snapped to the lattice. Pieces < 4 bars merge into
 *    their closest neighbour, pieces > 32 bars split at their strongest inner phrase line. Labels from per-section means:
 *      hot = bass + energy high → Drop (club tracks, or no vocals) / Chorus (vocal pop)
 *      low bass right before a hot section, ≤ 8 bars or highs rising → Build (a long one is split Break + Build)
 *      low bass otherwise → Verse (vocals) / Break
 *      bass, not hot: vocals → Verse (Pre-Chorus when short, after a verse and before the hot part), else Verse / Break
 *      (Break when it is a clear energy dip after a drop); the first section → Intro, everything after the last hot section
 *      that has less bass/energy → Outro; vocal pop: a late one-off vocal section after the 2nd chorus → Bridge, a verse that
 *      repeats a chorus (chroma + energy) → Chorus.
 *    Groove confidence = how strongly the onsets (rises of the lows + level, 150 Hz frames) sit on the 16th grid
 *    (Gaussian 20 ms, rescaled against chance), lowered when the beat drifts away from the grid.
 *    Drift (live playing): the beat phase per 2-bar window (onsets folded on the beat), tracked by dynamic programming and
 *    unwrapped, so it may grow to whole beats; its straight-line part = a slightly wrong BPM → folded into the bar length (the
 *    BPM shown/tagged follows), the rest → per-bar offsets. Kept only when the hits then fit the grid clearly better.
 *    Phrase lock = mean over inner section boundaries of 1 (on an 8-bar line from the first music bar) / .75 (4) / .25 (2) / 0.
 * 3. Arrangement (deterministic; every block = source bar range + stems mask + filter + crossfade, and says where it came from):
 *    DJ intro of N bars: if the original intro is already mixable (drums, no vocals) only N − its length is added in front of
 *    it, else N bars. Built from the best 4/8/16-bar loop inside one section (steady drums, little vocal bleed; bass/other
 *    when the style uses them), styles: Drums · Drums + bass (bass enters at the halfway phrase) · Full instrumental ·
 *    Filtered (low-pass opens 250 Hz → 16 kHz) · Percussion (high-passed drums, then the full kit) · Original (the original
 *    intro's last phrase repeated). Then the whole original, in order. DJ outro mirrors it (vocals out → mids out → drums,
 *    ending on a bar line). The rest of the requested length is added in whole phrases (16/8/4 bars, never mid-phrase) by
 *    repeating the last phrase of a drop/chorus (similar energy by construction) or a break; Performance Edit first inserts
 *    an extra Build → Drop cycle after the last drop. Nothing of the original is ever removed.
 * 4. Render: OfflineAudioContext, every block sample-accurately on the output bar grid (bar = 240/BPM, the original tempo),
 *    blocks that continue the source are merged into one segment (bit-identical to the source when unmasked); joins get a
 *    20 ms equal-power crossfade that ENDS on the downbeat (the new block's downbeat is never softened; the source's own
 *    pickup before bar 1 is laid over the end of the DJ intro). Stems per block by gain automation, filters by BiquadFilter
 *    automation, normalised only when it would clip. A track whose beat drifts gets per-bar source times; when a block then
 *    needs > 0.2 % speed change it is pitch-corrected with the vendored Signalsmith Stretch.
 * 5. Preview A/B plays the original or the render (position mapped through the blocks); export = WAV 16/24-bit or MP3 320 at
 *    44.1/48 kHz, "Artist - Title (Extended Mix)", optional Serato cue markers (intro / drop / outro of the new arrangement,
 *    via CRATE.tagMp3), logged as `extended_export`.
 */
(function(){
'use strict';
const CR=window.CR;if(!CR)return;
const {t,$,esc,mod}=CR;

/* ---------- strings (he / en / ar / ru / es) ---------- */
CR.addStrings({
he:{navExtended:'אקסטנדד',navExtendedS:'אקסטנדד',exEyebrow:'עריכה של השיר עצמו · על רשת התיבות',exTitle:'מחולל אקסטנדד',
  exSub:'יוצרים גרסת אקסטנדד לדיג׳יי מכל שיר. זו עריכה של השיר עצמו: השירה, המנגינה והקצב נשארים בדיוק כמו שהם.',
  exDrop:'גררו לכאן שיר',exDropH:'MP3, WAV, M4A, FLAC, OGG · עד 250 MB',exFile:'קובץ',exLib:'השירים שלי',exTool:'מהכלי',exReplace:'החלפה:',
  exNoTool:'קודם צריך לפתוח שיר בכלי.',exErrLoad:'לא הצלחנו לטעון את השיר. נסו שוב.',exErrLib:'לא הצלחנו להוריד את השיר מהחשבון שלכם.',
  exBig:'הקובץ גדול מדי (מעל 250 MB).',exLong:'השיר ארוך מדי (מעל 15 דקות). המחולל עובד על שירים של עד 15 דקות.',exShort:'השיר קצר מדי לגרסת אקסטנדד (צריך לפחות 30 שניות ו־16 תיבות).',
  exLegO:'האודיו המקורי',exLegS:'נבנה מהערוצים של השיר עצמו',exHow1:'מעלים שיר',exHow2:'בודקים את מבנה השיר ומתקנים אם צריך',exHow3:'בוחרים אורך וסגנון ומייצרים',
  exLibT:'השירים שלי',exLibSearch:'חיפוש',exLibEmpty:'עדיין אין שירים שמורים עם קובץ. שירים שמעלים בכלי (מחוברים) מופיעים כאן.',exLibNoFile:'אין קובץ שמור',exLoad:'טעינה',exClose:'סגירה',
  exS_an:'מנתחים את השיר',exS_bpm:'מזהים BPM',exS_key:'מזהים סולם',exS_sep:'מפרידים ערוצים',exS_struct:'מנתחים את המבנה',exS_phr:'מזהים משפטים',exS_drop:'מזהים דרופים',
  exS_intro:'בונים אינטרו לדיג׳יי',exS_outro:'בונים אאוטרו לדיג׳יי',exS_arr:'מייצרים את העיבוד',exS_render:'מעבדים את האודיו',
  exProcH:'מנתחים את {n}',exGenH:'מייצרים גרסת אקסטנדד',exReady:'גרסת האקסטנדד מוכנה',exReadyP:'{len} · ארוך יותר ב־{add} · {n} בלוקים על רשת התיבות',
  exLowGroove:'הקצב בשיר הזה פחות יציב (אולי הוקלט חי), ולכן הלופים באינטרו ובאאוטרו עלולים לא לנחות בדיוק על הפעמה. מומלץ לבחור סגנון אינטרו/אאוטרו "מקורי" ולהאזין לפני הייצוא.',exAnH:'ניתוח השיר',exStBpm:'BPM',exStKey:'סולם',exStLen:'אורך',exStBars:'תיבות',exStGroove:'ביטחון בגרוב',exStLock:'נעילת משפטים',
  exStGrooveT:'עד כמה המכות נופלות בדיוק על רשת הפעמות',exStLockT:'כמה מהמעברים בין החלקים נופלים על קווי משפט של 8 או 16 תיבות',
  exL_intro:'אינטרו',exL_verse:'בית',exL_pre:'פרה־פזמון',exL_build:'בילד',exL_drop:'דרופ',exL_break:'ברייק',exL_chorus:'פזמון',exL_bridge:'גשר',exL_outro:'אאוטרו',
  exStemsQ:'ערוצים מהירים · חינם',exStemsAI:'ערוצי AI',exStemsTool:'ערוצים מהכלי',exUpAi:'שדרוג לערוצי AI',exUpAiT:'הפרדה ב־AI נשמעת נקייה יותר באינטרו ובאאוטרו. אחר כך מנתחים שוב את המבנה.',exCost:'{n} נקודות',
  exSepFail:'ההפרדה לא הצליחה: {m}',exSepBusy:'הפרדה אחרת רצה עכשיו. חכו שתסתיים.',
  exOrig:'מקור',exExt:'אקסטנדד',exPlayO:'ניגון המקור',exPlayE:'ניגון האקסטנדד',exPause:'השהיה',exStop:'עצירה',exAB:'A/B',exABT:'מעבר בין המקור לאקסטנדד באותה נקודה בשיר (T)',
  exLoopBlk:'לופ על הבלוק',exLoopT:'מנגנים שוב ושוב את הבלוק שנבחר (L)',exZoomIn:'הגדלה',exZoomOut:'הקטנה',exPlanned:'מתוכנן',exStale:'ההגדרות השתנו. מייצרים שוב כדי לשמוע אותן.',
  exTlHelp:'לוחצים על חלק כדי לשנות את הסוג שלו · גוררים את הקצה שלו כדי להזיז (נצמד לתיבות) · לוחצים על בלוק כדי לראות מאיפה הוא נלקח',exKeys:'Space ניגון · ← → תיבה · T מקור/אקסטנדד · L לופ',
  exTlAria:'ציר זמן: {n}, המקור ({a}) מעל גרסת האקסטנדד ({b})',exPickBlk:'בוחרים בלוק בגרסת האקסטנדד כדי לראות מאיפה הוא נלקח.',
  exFromS:'מתוך {sec}',exFrom:'נלקח מ־{sec} · {t} · תיבות {b}',exBarsN:'{n} תיבות',exFull:'המיקס המלא',exPlus:' + ',
  exWhyOrig:'המקור, בלי שינוי',exWhyIntro:'אינטרו לדיג׳יי: לופ של המשפט הכי יציב',exWhyOutro:'אאוטרו לדיג׳יי: מסתיים בדיוק על קו תיבה',exWhyRep:'משפט שחוזר כדי להאריך את {sec}',exWhyCycle:'סבב נוסף של בילד ודרופ',
  exFxOpen:'הפילטר נפתח',exFxClose:'הפילטר נסגר',exFxHp:'בלי קיק ובס',
  exSecH:'חלקי השיר',exSecEdit:'עריכת {sec}',exSecType:'סוג החלק',exSecStart:'התחלה',exSecEnd:'סוף',exEarlier:'תיבה אחת מוקדם יותר',exLater:'תיבה אחת מאוחר יותר',exSecReset:'חזרה לחלקים שזוהו',exEdited:'נערך',
  exSetH:'הגדרות',exPreset:'סגנון',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'אינטרו ואאוטרו ארוכים של תופים, נוח למיקס',exP_clubT:'בס כבר באינטרו, דרופים וברייקים ארוכים יותר',exP_radioT:'קצר יותר, עם התחלה וסוף נקיים',exP_perfT:'מוסיף סבב שני של בילד ודרופ',
  exLen:'כמה להאריך',exLenC:'אחר',exLenIn:'שניות להוספה',exSec:'{n} שנ׳',exMin:'{n} דק׳',exIntro:'אינטרו',exOutro:'אאוטרו',exIStyle:'סגנון האינטרו',exOStyle:'סגנון האאוטרו',
  exSt_drums:'תופים',exSt_db:'תופים + בס',exSt_full:'אינסטרומנטלי מלא',exSt_filt:'עם פילטר',exSt_perc:'כלי הקשה',exSt_origI:'האינטרו המקורי',exSt_origO:'האאוטרו המקורי',
  exGen:'יצירת אקסטנדד',exGenAgain:'יצירה מחדש',exGenBusy:'מייצרים…',exCancel:'ביטול',
  exPlanH:'העיבוד המתוכנן',exPlanSum:'{len} · ארוך יותר ב־{add} · {n} בלוקים',exOver:'האינטרו והאאוטרו לבד מוסיפים {x}, יותר מה־{t} שביקשתם.',exTarget:'יעד: {t}',
  exR_intro:'אינטרו לדיג׳יי',exR_orig:'מקור',exR_rep:'חזרה',exR_cycle:'סבב נוסף',exR_outro:'אאוטרו לדיג׳יי',
  exExpH:'ייצוא',exExpP:'{len} · {bpm} BPM · {k}',exRate:'קצב דגימה',exCues:'נקודות קיו ל־Serato בתוך ה־MP3 (אינטרו, דרופ, אאוטרו)',exExpBtn:'ייצוא',
  exRendering:'מעבדים… {p}%',exDone:'נשמר: {f} ({s} MB).',exExpFail:'הייצוא נכשל. נסו WAV.',exNeedGen:'קודם מייצרים את גרסת האקסטנדד.'},
en:{navExtended:'Extended',navExtendedS:'Ext.',exEyebrow:'An edit of the track itself · on its bar grid',exTitle:'Extended Generator',
  exSub:'Create a DJ extended version from any track. It is an edit of the song itself: the vocals, melody and tempo stay exactly as they are.',
  exDrop:'Drop a track here',exDropH:'MP3, WAV, M4A, FLAC, OGG · up to 250 MB',exFile:'File',exLib:'My Songs',exTool:'From the tool',exReplace:'Replace:',
  exNoTool:'Open a song in the tool first.',exErrLoad:'Couldn\'t load this track. Try again.',exErrLib:'Couldn\'t download the song from your account.',
  exBig:'The file is too large (over 250 MB).',exLong:'This track is too long (over 15 minutes). The generator works on tracks up to 15 minutes.',exShort:'This track is too short for an extended version (it needs at least 30 seconds and 16 bars).',
  exLegO:'Original audio',exLegS:'Built from the track\'s own stems',exHow1:'Load a track',exHow2:'Check its structure and fix it if needed',exHow3:'Pick a length and style, then generate',
  exLibT:'My Songs',exLibSearch:'Search',exLibEmpty:'No saved songs with a file yet. Songs you upload in the tool (signed in) show up here.',exLibNoFile:'no file saved',exLoad:'Load',exClose:'Close',
  exS_an:'Analyzing track',exS_bpm:'Detecting BPM',exS_key:'Detecting key',exS_sep:'Separating stems',exS_struct:'Analyzing structure',exS_phr:'Detecting phrases',exS_drop:'Detecting drops',
  exS_intro:'Building DJ intro',exS_outro:'Building DJ outro',exS_arr:'Generating arrangement',exS_render:'Rendering audio',
  exProcH:'Analyzing {n}',exGenH:'Generating the extended version',exReady:'Extended version ready',exReadyP:'{len} · {add} longer · {n} blocks on the bar grid',
  exLowGroove:'This track\'s timing is less steady (maybe played live), so intro/outro loops may not land exactly on the beat. Choosing the "Original" intro/outro style and listening before export is recommended.',exAnH:'Track analysis',exStBpm:'BPM',exStKey:'Key',exStLen:'Length',exStBars:'Bars',exStGroove:'Groove confidence',exStLock:'Phrase lock',
  exStGrooveT:'How precisely the hits fall on the beat grid',exStLockT:'How many section changes fall on 8- or 16-bar phrase lines',
  exL_intro:'Intro',exL_verse:'Verse',exL_pre:'Pre-Chorus',exL_build:'Build',exL_drop:'Drop',exL_break:'Break',exL_chorus:'Chorus',exL_bridge:'Bridge',exL_outro:'Outro',
  exStemsQ:'Quick stems · free',exStemsAI:'AI stems',exStemsTool:'Stems from the tool',exUpAi:'Upgrade to AI stems',exUpAiT:'AI separation sounds cleaner in the intro and outro. The structure is analysed again afterwards.',exCost:'{n} points',
  exSepFail:'The separation didn\'t work: {m}',exSepBusy:'Another separation is running. Wait for it to finish.',
  exOrig:'Original',exExt:'Extended',exPlayO:'Play the original',exPlayE:'Play the extended version',exPause:'Pause',exStop:'Stop',exAB:'A/B',exABT:'Switch between the original and the extended version at the same spot (T)',
  exLoopBlk:'Loop block',exLoopT:'Repeat the selected block (L)',exZoomIn:'Zoom in',exZoomOut:'Zoom out',exPlanned:'planned',exStale:'Settings changed. Generate again to hear them.',
  exTlHelp:'Click a section to change its type · drag its edge to move it (snaps to bars) · click a block to see where it came from',exKeys:'Space play · ← → one bar · T original/extended · L loop',
  exTlAria:'Timeline: {n}, the original ({a}) above the extended version ({b})',exPickBlk:'Pick a block of the extended version to see where it came from.',
  exFromS:'from {sec}',exFrom:'From {sec} · {t} · bars {b}',exBarsN:'{n} bars',exFull:'Full mix',exPlus:' + ',
  exWhyOrig:'The original, unchanged',exWhyIntro:'DJ intro: a loop of the steadiest phrase',exWhyOutro:'DJ outro: ends right on a bar line',exWhyRep:'Phrase repeated to extend {sec}',exWhyCycle:'An extra build and drop',
  exFxOpen:'filter opens',exFxClose:'filter closes',exFxHp:'no kick or bass',
  exSecH:'Sections',exSecEdit:'Edit {sec}',exSecType:'Section type',exSecStart:'Start',exSecEnd:'End',exEarlier:'One bar earlier',exLater:'One bar later',exSecReset:'Back to the detected sections',exEdited:'edited',
  exSetH:'Settings',exPreset:'Style',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'Long drum intro and outro for mixing',exP_clubT:'Bass in the intro, longer drops and breaks',exP_radioT:'Shorter, with a clean start and end',exP_perfT:'Adds a second build and drop',
  exLen:'Add',exLenC:'Custom',exLenIn:'Seconds to add',exSec:'{n} s',exMin:'{n} min',exIntro:'Intro',exOutro:'Outro',exIStyle:'Intro style',exOStyle:'Outro style',
  exSt_drums:'Drums',exSt_db:'Drums + bass',exSt_full:'Full instrumental',exSt_filt:'Filtered',exSt_perc:'Percussion',exSt_origI:'Original intro',exSt_origO:'Original outro',
  exGen:'Generate extended',exGenAgain:'Generate again',exGenBusy:'Generating…',exCancel:'Cancel',
  exPlanH:'Planned arrangement',exPlanSum:'{len} · {add} longer · {n} blocks',exOver:'The intro and outro alone add {x}, more than the {t} you asked for.',exTarget:'target {t}',
  exR_intro:'DJ intro',exR_orig:'Original',exR_rep:'Repeat',exR_cycle:'Extra cycle',exR_outro:'DJ outro',
  exExpH:'Export',exExpP:'{len} · {bpm} BPM · {k}',exRate:'Sample rate',exCues:'Serato cue points in the MP3 (intro, drop, outro)',exExpBtn:'Export',
  exRendering:'Rendering… {p}%',exDone:'Saved {f} ({s} MB).',exExpFail:'The export failed. Try WAV.',exNeedGen:'Generate the extended version first.'},
ar:{navExtended:'إكستندد',navExtendedS:'إكستندد',exEyebrow:'تحرير للأغنية نفسها · على شبكة المازورات',exTitle:'مولّد الإكستندد',
  exSub:'أنشئ نسخة إكستندد للدي جي من أي أغنية. إنه تحرير للأغنية نفسها: الغناء واللحن والإيقاع تبقى كما هي تمامًا.',
  exDrop:'اسحب أغنية إلى هنا',exDropH:'MP3, WAV, M4A, FLAC, OGG · حتى 250 MB',exFile:'ملف',exLib:'أغانيّ',exTool:'من الأداة',exReplace:'استبدال:',
  exNoTool:'افتح أغنية في الأداة أولًا.',exErrLoad:'تعذّر تحميل الأغنية. حاول مرة أخرى.',exErrLib:'تعذّر تنزيل الأغنية من حسابك.',
  exBig:'الملف كبير جدًا (أكثر من 250 MB).',exLong:'الأغنية طويلة جدًا (أكثر من 15 دقيقة). يعمل المولّد على أغانٍ حتى 15 دقيقة.',exShort:'الأغنية قصيرة جدًا لنسخة إكستندد (تحتاج 30 ثانية و16 مازورة على الأقل).',
  exLegO:'الصوت الأصلي',exLegS:'مبني من مسارات الأغنية نفسها',exHow1:'حمّل أغنية',exHow2:'راجع بنيتها وصحّحها إن لزم',exHow3:'اختر الطول والأسلوب ثم أنشئ',
  exLibT:'أغانيّ',exLibSearch:'بحث',exLibEmpty:'لا توجد أغانٍ محفوظة مع ملف بعد. الأغاني التي ترفعها في الأداة (مع تسجيل الدخول) تظهر هنا.',exLibNoFile:'لا يوجد ملف محفوظ',exLoad:'تحميل',exClose:'إغلاق',
  exS_an:'تحليل الأغنية',exS_bpm:'اكتشاف BPM',exS_key:'اكتشاف المقام',exS_sep:'فصل المسارات',exS_struct:'تحليل البنية',exS_phr:'اكتشاف الجُمل',exS_drop:'اكتشاف الدروب',
  exS_intro:'بناء مقدمة للدي جي',exS_outro:'بناء خاتمة للدي جي',exS_arr:'إنشاء التوزيع',exS_render:'معالجة الصوت',
  exProcH:'تحليل {n}',exGenH:'إنشاء نسخة الإكستندد',exReady:'نسخة الإكستندد جاهزة',exReadyP:'{len} · أطول بـ {add} · {n} مقاطع على شبكة المازورات',
  exLowGroove:'إيقاع هذه الأغنية أقل ثباتًا (ربما سُجّلت حيًّا)، لذا قد لا تقع حلقات المقدمة والخاتمة على النبضة تمامًا. يُنصح باختيار نمط "الأصلي" للمقدمة والخاتمة والاستماع قبل التصدير.',exAnH:'تحليل الأغنية',exStBpm:'BPM',exStKey:'المقام',exStLen:'المدة',exStBars:'المازورات',exStGroove:'ثبات الإيقاع',exStLock:'التزام الجُمل',
  exStGrooveT:'مدى دقة وقوع الضربات على شبكة النبضات',exStLockT:'كم من الانتقالات بين الأقسام تقع على خطوط جُمل من 8 أو 16 مازورة',
  exL_intro:'مقدمة',exL_verse:'مقطع',exL_pre:'ما قبل اللازمة',exL_build:'تصاعد',exL_drop:'دروب',exL_break:'استراحة',exL_chorus:'لازمة',exL_bridge:'جسر',exL_outro:'خاتمة',
  exStemsQ:'مسارات سريعة · مجانًا',exStemsAI:'مسارات AI',exStemsTool:'مسارات من الأداة',exUpAi:'الترقية إلى مسارات AI',exUpAiT:'الفصل بالذكاء الاصطناعي أنقى في المقدمة والخاتمة. بعدها تُحلَّل البنية من جديد.',exCost:'{n} نقاط',
  exSepFail:'لم ينجح الفصل: {m}',exSepBusy:'هناك فصل آخر قيد التشغيل. انتظر حتى ينتهي.',
  exOrig:'الأصل',exExt:'إكستندد',exPlayO:'تشغيل الأصل',exPlayE:'تشغيل نسخة الإكستندد',exPause:'إيقاف مؤقت',exStop:'إيقاف',exAB:'A/B',exABT:'التبديل بين الأصل والإكستندد عند النقطة نفسها (T)',
  exLoopBlk:'تكرار المقطع',exLoopT:'تكرار المقطع المحدد (L)',exZoomIn:'تكبير',exZoomOut:'تصغير',exPlanned:'مخطَّط',exStale:'تغيّرت الإعدادات. أنشئ من جديد لتسمعها.',
  exTlHelp:'انقر قسمًا لتغيير نوعه · اسحب طرفه لتحريكه (يلتصق بالمازورات) · انقر مقطعًا لترى من أين أُخذ',exKeys:'Space تشغيل · ← → مازورة · T الأصل/الإكستندد · L تكرار',
  exTlAria:'الخط الزمني: {n}، الأصل ({a}) فوق نسخة الإكستندد ({b})',exPickBlk:'اختر مقطعًا من نسخة الإكستندد لترى من أين أُخذ.',
  exFromS:'من {sec}',exFrom:'من {sec} · {t} · المازورات {b}',exBarsN:'{n} مازورات',exFull:'المزيج الكامل',exPlus:' + ',
  exWhyOrig:'الأصل دون تغيير',exWhyIntro:'مقدمة للدي جي: تكرار للجملة الأكثر ثباتًا',exWhyOutro:'خاتمة للدي جي: تنتهي تمامًا على خط مازورة',exWhyRep:'جملة مكرّرة لإطالة {sec}',exWhyCycle:'دورة إضافية من التصاعد والدروب',
  exFxOpen:'الفلتر ينفتح',exFxClose:'الفلتر ينغلق',exFxHp:'بلا كيك ولا باص',
  exSecH:'أقسام الأغنية',exSecEdit:'تعديل {sec}',exSecType:'نوع القسم',exSecStart:'البداية',exSecEnd:'النهاية',exEarlier:'مازورة واحدة أبكر',exLater:'مازورة واحدة أبعد',exSecReset:'العودة إلى الأقسام المكتشفة',exEdited:'معدَّل',
  exSetH:'الإعدادات',exPreset:'الأسلوب',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'مقدمة وخاتمة طويلتان من الطبول للمزج',exP_clubT:'باص في المقدمة، ودروب واستراحات أطول',exP_radioT:'أقصر، ببداية ونهاية نظيفتين',exP_perfT:'يضيف دورة ثانية من التصاعد والدروب',
  exLen:'الإطالة',exLenC:'مخصّص',exLenIn:'ثوانٍ للإضافة',exSec:'{n} ث',exMin:'{n} د',exIntro:'المقدمة',exOutro:'الخاتمة',exIStyle:'أسلوب المقدمة',exOStyle:'أسلوب الخاتمة',
  exSt_drums:'طبول',exSt_db:'طبول + باص',exSt_full:'موسيقى كاملة بلا غناء',exSt_filt:'مع فلتر',exSt_perc:'إيقاعيات',exSt_origI:'المقدمة الأصلية',exSt_origO:'الخاتمة الأصلية',
  exGen:'إنشاء إكستندد',exGenAgain:'إنشاء من جديد',exGenBusy:'جارٍ الإنشاء…',exCancel:'إلغاء',
  exPlanH:'التوزيع المخطَّط',exPlanSum:'{len} · أطول بـ {add} · {n} مقاطع',exOver:'المقدمة والخاتمة وحدهما تضيفان {x}، أكثر من {t} المطلوبة.',exTarget:'الهدف: {t}',
  exR_intro:'مقدمة الدي جي',exR_orig:'الأصل',exR_rep:'تكرار',exR_cycle:'دورة إضافية',exR_outro:'خاتمة الدي جي',
  exExpH:'تصدير',exExpP:'{len} · {bpm} BPM · {k}',exRate:'معدل العيّنات',exCues:'نقاط Serato داخل ملف MP3 (المقدمة، الدروب، الخاتمة)',exExpBtn:'تصدير',
  exRendering:'معالجة… {p}%',exDone:'تم الحفظ: {f} ({s} MB).',exExpFail:'فشل التصدير. جرّب WAV.',exNeedGen:'أنشئ نسخة الإكستندد أولًا.'},
ru:{navExtended:'Extended',navExtendedS:'Ext.',exEyebrow:'Монтаж самого трека · по сетке тактов',exTitle:'Генератор Extended',
  exSub:'Сделайте DJ extended-версию любого трека. Это монтаж самой песни: вокал, мелодия и темп остаются точно такими же.',
  exDrop:'Перетащите трек сюда',exDropH:'MP3, WAV, M4A, FLAC, OGG · до 250 МБ',exFile:'Файл',exLib:'Мои песни',exTool:'Из инструмента',exReplace:'Заменить:',
  exNoTool:'Сначала откройте песню в инструменте.',exErrLoad:'Не удалось загрузить трек. Попробуйте ещё раз.',exErrLib:'Не удалось скачать песню из вашего аккаунта.',
  exBig:'Файл слишком большой (больше 250 МБ).',exLong:'Трек слишком длинный (больше 15 минут). Генератор работает с треками до 15 минут.',exShort:'Трек слишком короткий для extended-версии (нужно минимум 30 секунд и 16 тактов).',
  exLegO:'Оригинальный звук',exLegS:'Собрано из стемов самого трека',exHow1:'Загрузите трек',exHow2:'Проверьте структуру и поправьте при необходимости',exHow3:'Выберите длину и стиль и создайте версию',
  exLibT:'Мои песни',exLibSearch:'Поиск',exLibEmpty:'Пока нет сохранённых песен с файлом. Песни, загруженные в инструменте (после входа), появятся здесь.',exLibNoFile:'файл не сохранён',exLoad:'Загрузить',exClose:'Закрыть',
  exS_an:'Анализ трека',exS_bpm:'Определение BPM',exS_key:'Определение тональности',exS_sep:'Разделение на стемы',exS_struct:'Анализ структуры',exS_phr:'Поиск фраз',exS_drop:'Поиск дропов',
  exS_intro:'Сборка DJ-интро',exS_outro:'Сборка DJ-аутро',exS_arr:'Создание аранжировки',exS_render:'Сведение аудио',
  exProcH:'Анализ: {n}',exGenH:'Создаём extended-версию',exReady:'Extended-версия готова',exReadyP:'{len} · длиннее на {add} · блоков на сетке тактов: {n}',
  exLowGroove:'Темп этого трека менее стабилен (возможно, живая запись), поэтому лупы интро/аутро могут не попадать точно в долю. Лучше выбрать стиль интро/аутро «Оригинал» и послушать перед экспортом.',exAnH:'Анализ трека',exStBpm:'BPM',exStKey:'Тональность',exStLen:'Длина',exStBars:'Такты',exStGroove:'Уверенность в груве',exStLock:'Привязка к фразам',
  exStGrooveT:'Насколько точно удары попадают в сетку долей',exStLockT:'Сколько смен частей приходится на границы фраз в 8 или 16 тактов',
  exL_intro:'Интро',exL_verse:'Куплет',exL_pre:'Пре-припев',exL_build:'Билд',exL_drop:'Дроп',exL_break:'Брейк',exL_chorus:'Припев',exL_bridge:'Бридж',exL_outro:'Аутро',
  exStemsQ:'Быстрые стемы · бесплатно',exStemsAI:'AI-стемы',exStemsTool:'Стемы из инструмента',exUpAi:'Перейти на AI-стемы',exUpAiT:'AI-разделение звучит чище в интро и аутро. После него структура анализируется заново.',exCost:'{n} баллов',
  exSepFail:'Разделение не удалось: {m}',exSepBusy:'Уже идёт другое разделение. Дождитесь его окончания.',
  exOrig:'Оригинал',exExt:'Extended',exPlayO:'Играть оригинал',exPlayE:'Играть extended-версию',exPause:'Пауза',exStop:'Стоп',exAB:'A/B',exABT:'Переключиться между оригиналом и extended в том же месте (T)',
  exLoopBlk:'Луп блока',exLoopT:'Повторять выбранный блок (L)',exZoomIn:'Приблизить',exZoomOut:'Отдалить',exPlanned:'план',exStale:'Настройки изменились. Создайте версию заново, чтобы их услышать.',
  exTlHelp:'Клик по части — сменить её тип · тяните её край, чтобы сдвинуть (по тактам) · клик по блоку — откуда он взят',exKeys:'Space — пуск · ← → такт · T — оригинал/extended · L — луп',
  exTlAria:'Таймлайн: {n}, оригинал ({a}) над extended-версией ({b})',exPickBlk:'Выберите блок extended-версии, чтобы увидеть, откуда он взят.',
  exFromS:'из: {sec}',exFrom:'Из: {sec} · {t} · такты {b}',exBarsN:'Тактов: {n}',exFull:'Полный микс',exPlus:' + ',
  exWhyOrig:'Оригинал без изменений',exWhyIntro:'DJ-интро: луп самой ровной фразы',exWhyOutro:'DJ-аутро: заканчивается точно на границе такта',exWhyRep:'Фраза повторена, чтобы удлинить: {sec}',exWhyCycle:'Дополнительный билд и дроп',
  exFxOpen:'фильтр открывается',exFxClose:'фильтр закрывается',exFxHp:'без бочки и баса',
  exSecH:'Части трека',exSecEdit:'Изменить: {sec}',exSecType:'Тип части',exSecStart:'Начало',exSecEnd:'Конец',exEarlier:'На такт раньше',exLater:'На такт позже',exSecReset:'Вернуть найденные части',exEdited:'изменено',
  exSetH:'Настройки',exPreset:'Стиль',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'Длинные барабанные интро и аутро для сведения',exP_clubT:'Бас уже в интро, дропы и брейки длиннее',exP_radioT:'Короче, с чистым началом и концом',exP_perfT:'Добавляет второй билд и дроп',
  exLen:'Удлинить на',exLenC:'Своё',exLenIn:'Сколько секунд добавить',exSec:'{n} с',exMin:'{n} мин',exIntro:'Интро',exOutro:'Аутро',exIStyle:'Стиль интро',exOStyle:'Стиль аутро',
  exSt_drums:'Барабаны',exSt_db:'Барабаны + бас',exSt_full:'Весь инструментал',exSt_filt:'С фильтром',exSt_perc:'Перкуссия',exSt_origI:'Оригинальное интро',exSt_origO:'Оригинальное аутро',
  exGen:'Создать extended',exGenAgain:'Создать заново',exGenBusy:'Создаём…',exCancel:'Отмена',
  exPlanH:'План аранжировки',exPlanSum:'{len} · длиннее на {add} · блоков: {n}',exOver:'Одни интро и аутро добавляют {x} — больше, чем запрошенные {t}.',exTarget:'цель: {t}',
  exR_intro:'DJ-интро',exR_orig:'Оригинал',exR_rep:'Повтор',exR_cycle:'Доп. цикл',exR_outro:'DJ-аутро',
  exExpH:'Экспорт',exExpP:'{len} · {bpm} BPM · {k}',exRate:'Частота дискретизации',exCues:'Cue-точки Serato в MP3 (интро, дроп, аутро)',exExpBtn:'Экспортировать',
  exRendering:'Сведение… {p}%',exDone:'Сохранено: {f} ({s} МБ).',exExpFail:'Экспорт не удался. Попробуйте WAV.',exNeedGen:'Сначала создайте extended-версию.'},
es:{navExtended:'Extended',navExtendedS:'Ext.',exEyebrow:'Una edición del propio tema · sobre su rejilla de compases',exTitle:'Generador Extended',
  exSub:'Crea una versión extended para DJ de cualquier tema. Es una edición de la propia canción: la voz, la melodía y el tempo quedan exactamente igual.',
  exDrop:'Suelta aquí un tema',exDropH:'MP3, WAV, M4A, FLAC, OGG · hasta 250 MB',exFile:'Archivo',exLib:'Mis canciones',exTool:'Desde la herramienta',exReplace:'Cambiar:',
  exNoTool:'Primero abre una canción en la herramienta.',exErrLoad:'No se pudo cargar el tema. Inténtalo de nuevo.',exErrLib:'No se pudo descargar la canción de tu cuenta.',
  exBig:'El archivo es demasiado grande (más de 250 MB).',exLong:'La pista es demasiado larga (más de 15 minutos). El generador funciona con pistas de hasta 15 minutos.',exShort:'El tema es demasiado corto para una versión extended (necesita al menos 30 segundos y 16 compases).',
  exLegO:'Audio original',exLegS:'Hecho con las pistas del propio tema',exHow1:'Carga un tema',exHow2:'Revisa su estructura y corrígela si hace falta',exHow3:'Elige duración y estilo, y genera',
  exLibT:'Mis canciones',exLibSearch:'Buscar',exLibEmpty:'Aún no hay canciones guardadas con archivo. Las que subas en la herramienta (con sesión iniciada) aparecerán aquí.',exLibNoFile:'sin archivo guardado',exLoad:'Cargar',exClose:'Cerrar',
  exS_an:'Analizando el tema',exS_bpm:'Detectando el BPM',exS_key:'Detectando la tonalidad',exS_sep:'Separando pistas',exS_struct:'Analizando la estructura',exS_phr:'Detectando frases',exS_drop:'Detectando drops',
  exS_intro:'Creando la intro DJ',exS_outro:'Creando el outro DJ',exS_arr:'Generando el arreglo',exS_render:'Renderizando el audio',
  exProcH:'Analizando {n}',exGenH:'Generando la versión extended',exReady:'Versión extended lista',exReadyP:'{len} · {add} más larga · {n} bloques sobre la rejilla de compases',
  exLowGroove:'El tempo de este tema es menos estable (quizá grabado en vivo), así que los loops de intro/outro pueden no caer justo en el pulso. Se recomienda el estilo de intro/outro "Original" y escuchar antes de exportar.',exAnH:'Análisis del tema',exStBpm:'BPM',exStKey:'Tonalidad',exStLen:'Duración',exStBars:'Compases',exStGroove:'Confianza del groove',exStLock:'Ajuste a frases',
  exStGrooveT:'Con qué precisión caen los golpes sobre la rejilla de tiempos',exStLockT:'Cuántos cambios de sección caen en líneas de frase de 8 o 16 compases',
  exL_intro:'Intro',exL_verse:'Estrofa',exL_pre:'Pre-estribillo',exL_build:'Build',exL_drop:'Drop',exL_break:'Break',exL_chorus:'Estribillo',exL_bridge:'Puente',exL_outro:'Outro',
  exStemsQ:'Pistas rápidas · gratis',exStemsAI:'Pistas con IA',exStemsTool:'Pistas de la herramienta',exUpAi:'Mejorar a pistas con IA',exUpAiT:'La separación con IA suena más limpia en la intro y el outro. Después se analiza de nuevo la estructura.',exCost:'{n} puntos',
  exSepFail:'La separación no funcionó: {m}',exSepBusy:'Hay otra separación en curso. Espera a que termine.',
  exOrig:'Original',exExt:'Extended',exPlayO:'Reproducir el original',exPlayE:'Reproducir la versión extended',exPause:'Pausa',exStop:'Detener',exAB:'A/B',exABT:'Cambiar entre el original y la extended en el mismo punto (T)',
  exLoopBlk:'Bucle del bloque',exLoopT:'Repetir el bloque seleccionado (L)',exZoomIn:'Acercar',exZoomOut:'Alejar',exPlanned:'planificado',exStale:'Cambiaron los ajustes. Genera de nuevo para escucharlos.',
  exTlHelp:'Haz clic en una sección para cambiar su tipo · arrastra su borde para moverla (se ajusta a compases) · haz clic en un bloque para ver de dónde salió',exKeys:'Espacio reproducir · ← → un compás · T original/extended · L bucle',
  exTlAria:'Línea de tiempo: {n}, el original ({a}) sobre la versión extended ({b})',exPickBlk:'Elige un bloque de la versión extended para ver de dónde salió.',
  exFromS:'de {sec}',exFrom:'De {sec} · {t} · compases {b}',exBarsN:'{n} compases',exFull:'Mezcla completa',exPlus:' + ',
  exWhyOrig:'El original, sin cambios',exWhyIntro:'Intro DJ: un bucle de la frase más estable',exWhyOutro:'Outro DJ: termina justo en una línea de compás',exWhyRep:'Frase repetida para alargar {sec}',exWhyCycle:'Un build y un drop extra',
  exFxOpen:'el filtro se abre',exFxClose:'el filtro se cierra',exFxHp:'sin bombo ni bajo',
  exSecH:'Secciones',exSecEdit:'Editar {sec}',exSecType:'Tipo de sección',exSecStart:'Inicio',exSecEnd:'Final',exEarlier:'Un compás antes',exLater:'Un compás después',exSecReset:'Volver a las secciones detectadas',exEdited:'editado',
  exSetH:'Ajustes',exPreset:'Estilo',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'Intro y outro largos de batería para mezclar',exP_clubT:'Bajo en la intro, drops y breaks más largos',exP_radioT:'Más corto, con un inicio y un final limpios',exP_perfT:'Añade un segundo build y drop',
  exLen:'Añadir',exLenC:'Otro',exLenIn:'Segundos que añadir',exSec:'{n} s',exMin:'{n} min',exIntro:'Intro',exOutro:'Outro',exIStyle:'Estilo de la intro',exOStyle:'Estilo del outro',
  exSt_drums:'Batería',exSt_db:'Batería + bajo',exSt_full:'Instrumental completo',exSt_filt:'Con filtro',exSt_perc:'Percusión',exSt_origI:'Intro original',exSt_origO:'Outro original',
  exGen:'Generar extended',exGenAgain:'Generar de nuevo',exGenBusy:'Generando…',exCancel:'Cancelar',
  exPlanH:'Arreglo planificado',exPlanSum:'{len} · {add} más larga · {n} bloques',exOver:'La intro y el outro por sí solos añaden {x}, más de los {t} que pediste.',exTarget:'objetivo: {t}',
  exR_intro:'Intro DJ',exR_orig:'Original',exR_rep:'Repetición',exR_cycle:'Ciclo extra',exR_outro:'Outro DJ',
  exExpH:'Exportar',exExpP:'{len} · {bpm} BPM · {k}',exRate:'Frecuencia de muestreo',exCues:'Cue points de Serato en el MP3 (intro, drop, outro)',exExpBtn:'Exportar',
  exRendering:'Renderizando… {p}%',exDone:'Guardado: {f} ({s} MB).',exExpFail:'La exportación falló. Prueba WAV.',exNeedGen:'Primero genera la versión extended.'}
});

/* ---------- constants ---------- */
const IDS=['vocals','drums','bass','other'];
const LABS=['intro','verse','pre','build','drop','break','chorus','bridge','outro'];
// fixed colours, consistent with the cue colours in assets/cues.js (intro green, vocal→verse blue, break yellow, build purple, drop red, outro orange)
const LCOL={intro:[40,226,20],verse:[48,90,255],pre:[54,190,240],build:[170,114,255],drop:[230,40,40],break:[195,175,4],chorus:[255,79,154],bridge:[150,160,178],outro:[255,140,0]};
const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;
const STYLES=['drums','db','full','filt','perc','orig'];
// defaults sized so intro + outro fit inside the added time at ~128 BPM (32 bars ≈ 60 s): DJ = long intro/outro only,
// Club/Performance leave about a minute for longer drops / a second build-drop cycle
const PRESETS={dj:{add:120,intro:32,outro:32,is:'drums',os:'drums'},club:{add:120,intro:16,outro:16,is:'db',os:'db'},radio:{add:30,intro:16,outro:16,is:'orig',os:'orig'},perf:{add:120,intro:16,outro:16,is:'drums',os:'drums'}};
const ADDS=[30,60,90,120],BARN=[16,32,64];
const XF=0.02;                         // join crossfade, ends on the downbeat
const MAX_BYTES=250*1024*1024,MAX_DUR=15*60;   // ~3 GB of tab memory for a 12-min track (song + 4 quick stems + render): longer ones would crash the tab
const ACCEPT='audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus,.aif,.aiff';
const LS='chordroom.extended.v1';
const STEPS=['an','bpm','key','sep','struct','phr','drop','intro','outro','arr','render'];
const AN_STEPS=STEPS.slice(0,7);
const QW=(()=>{const s=document.currentScript&&document.currentScript.src;try{return s?new URL('quicksep-worker.js'+new URL(s).search,s).href:'assets/quicksep-worker.js'}catch(e){return 'assets/quicksep-worker.js'}})();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reduced=()=>document.documentElement.classList.contains('a11y-noanim')||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const defSet=()=>({preset:'dj',add:120,custom:45,intro:32,outro:32,is:'drums',os:'drums',fmt:'mp3',sr:44100,cues:true});

const X={built:false,visible:false,owner:undefined,song:null,tok:0,stage:'empty',steps:{},stepP:0,stepMsg:'',set:defSet(),
  plan:null,render:null,rwave:null,rsig:'',genTok:0,sel:-1,hover:-1,msg:'',msgErr:false,zoom:1,view0:0,reveal:Infinity,
  exporting:false,sep:null,pickFrom:null,drag:null,fin:0,secEd:-1,lastExport:null};

/* ---------- small helpers ---------- */
const fmtT=x=>{x=Math.max(0,x);const m=Math.floor(x/60),s=x-m*60;return m+':'+(s<10?'0':'')+s.toFixed(1)};
const fmtD=x=>CR.fmtS(Math.max(0,Math.round(x)));
const fmtAdd=x=>{const a=Math.round(Math.abs(x));const m=Math.floor(a/60),s=a%60;return iso((x<0?'−':'')+(m?m+':'+(s<10?'0':'')+s:t('exSec',{n:a})))};
// numbers / times inside translated sentences: an LTR isolate, so RTL text never reorders them ("1:00–1:15" stays in order)
const iso=x=>'\u2066'+x+'\u2069';
const pctl=(arr,p)=>{const s=Array.from(arr).filter(isFinite).sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:0};
const meanOf=(a,i,j)=>{let s=0,n=0;for(let k=Math.max(0,i);k<Math.min(a.length,j);k++){s+=a[k];n++}return n?s/n:0};
const labName=l=>t('exL_'+l);
function secNames(secs){const c={};return secs.map(s=>{c[s.lab]=(c[s.lab]||0)+1;return labName(s.lab)+' '+c[s.lab]})}
function gridOf(a,dur){const T=60/a.bpm,B=4*T;let fd=mod(a.offset||0,T)+mod(a.down||0,4)*T;if(fd>30)fd=mod(a.offset||0,T);return {T,B,fd,nb:Math.max(0,Math.floor((dur-fd)/B+1e-6))}}
const srcT=(s,x)=>s.g.fd+x*s.g.B+(s.drift?s.drift[clamp(Math.round(x),0,s.drift.length-1)]:0);

/* ---------- analysis: per-bar features ---------- */
function barRms(buf,s,nb){
  const L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L,sr=buf.sampleRate,o=new Float32Array(nb);
  for(let k=0;k<nb;k++){const a=Math.max(0,Math.floor(srcT(s,k)*sr)),z=Math.min(L.length,Math.floor(srcT(s,k+1)*sr));let q=0,c=0;for(let j=a;j<z;j+=16){const x=(L[j]+R[j])*0.5;q+=x*x;c++}o[k]=c?Math.sqrt(q/c):0}
  return o;
}
async function features(s){
  const nb=s.g.nb,HOP=0.05;
  const F=s.F||(s.F=await CUES._features(s.buffer));
  const perBar=e=>{const o=new Float32Array(nb);for(let k=0;k<nb;k++){const a=Math.max(0,Math.round(srcT(s,k)/HOP)),b=Math.min(e.length,Math.round(srcT(s,k+1)/HOP));o[k]=meanOf(e,a,b)}return o};
  const fu=perBar(F.mono),lo=perBar(F.lo),hi=perBar(F.hi),vm=perBar(F.vm),vs=F.vs?perBar(F.vs):null;
  const mix=barRms(s.buffer,s,nb),st={};
  if(s.stems)for(const id of IDS)st[id]=barRms(s.stems[id],s,nb);
  // chroma per bar (24 bins: 12 treble + 12 bass at half weight), unit length
  const C=s.chroma||(s.chroma=await CR.chromaOf(s.buffer)),ch=[];
  for(let k=0;k<nb;k++){const v=new Float32Array(24),a=Math.max(0,Math.ceil((srcT(s,k)-C.t0)*C.rate)),b=Math.min(C.frames,Math.ceil((srcT(s,k+1)-C.t0)*C.rate));
    for(let i=a;i<b;i++)for(let p=0;p<12;p++){v[p]+=Math.sqrt(C.tre[i*12+p]);v[12+p]+=0.5*Math.sqrt(C.bas[i*12+p])}
    let n=0;for(let p=0;p<24;p++)n+=v[p]*v[p];n=Math.sqrt(n)||1;for(let p=0;p<24;p++)v[p]/=n;ch.push(v)}
  // music range
  const p90a=pctl(fu,0.9)||1e-9;let s0=0;while(s0<nb-1&&fu[s0]/p90a<0.08)s0++;let e0=nb-1;while(e0>s0&&fu[e0]/p90a<0.08)e0--;
  const n90=a=>{const p=pctl(a.slice(s0,e0+1),0.9)||1e-9;return a.map(v=>Math.min(1.6,v/p))};
  const f={nb,s0,e0,fu:n90(fu),lo:n90(lo),hi:n90(hi),ch,mix};
  if(s.stems){f.dr=n90(st.drums);f.vo=n90(st.vocals);f.md=n90(st.other);f.bs=n90(st.bass);f.pv=st.vocals.map((v,k)=>v/(mix[k]+1e-9))}
  else{f.dr=f.hi;f.vo=n90(vm);f.md=f.vo;f.bs=f.lo;f.pv=vs?vm.map((v,k)=>Math.min(1,(v/(vs[k]+1e-9)-1)/3)):vm.map(()=>0.3)}
  return f;
}
// a bar "has vocals": the vocals stem is clearly present, in absolute terms and against the mix
const vocalBar=(f,k)=>f.vo[k]>0.35&&f.pv[k]>0.2;
function secStats(f,x){
  const a=x.a,b=Math.max(x.a+1,x.b),h=Math.floor((a+b)/2);let voc=0;for(let k=a;k<b;k++)if(vocalBar(f,k))voc++;
  const r={lo:meanOf(f.lo,a,b),dr:meanOf(f.dr,a,b),vo:meanOf(f.vo,a,b),md:meanOf(f.md,a,b),hi:meanOf(f.hi,a,b),fu:meanOf(f.fu,a,b),bs:meanOf(f.bs,a,b),
    voc:voc/(b-a),len:b-a,hiSlope:meanOf(f.hi,h,b)-meanOf(f.hi,a,h)};
  r.E=0.45*r.lo+0.35*r.dr+0.2*r.fu;return r;
}
function chromaMean(f,a,b){const v=new Float32Array(24);a=Math.max(0,a);b=Math.min(f.nb,b);for(let k=a;k<b;k++)for(let p=0;p<24;p++)v[p]+=f.ch[k][p];let n=0;for(let p=0;p<24;p++)n+=v[p]*v[p];n=Math.sqrt(n)||1;for(let p=0;p<24;p++)v[p]/=n;return v}
const dot=(x,y)=>{let s=0;for(let i=0;i<x.length;i++)s+=x[i]*y[i];return s};

/* ---------- analysis: sections ---------- */
function segment(f,cues){
  const {s0,e0}=f,end=e0+1,W=4;
  const vec=k=>[f.lo[k]*1.2,f.dr[k],f.vo[k]*1.2,f.md[k]*0.6,f.hi[k]*0.6,f.fu[k]*0.8];
  const meanV=(a,b)=>{a=Math.max(s0,a);b=Math.min(end,b);if(b<=a)return null;const m=[0,0,0,0,0,0];for(let k=a;k<b;k++){const v=vec(k);for(let i=0;i<6;i++)m[i]+=v[i]}return m.map(x=>x/(b-a))};
  const nov=new Float32Array(end+5);
  for(let k=s0+1;k<end;k++){const A=meanV(k-W,k),Bv=meanV(k,k+W);if(!A||!Bv)continue;let d=0;for(let i=0;i<6;i++)d+=Math.abs(A[i]-Bv[i]);d+=0.6*(1-dot(chromaMean(f,Math.max(s0,k-W),k),chromaMean(f,k,Math.min(end,k+W))));nov[k]=d}
  const cueBars=(cues||[]).filter(c=>c.k!=='intro'&&c.bar>s0&&c.bar<end).map(c=>c.bar);
  let anc=mod(s0,4),best=-1;
  for(let a=0;a<4;a++){let sc=mod(s0-a,4)===0?0.25:0;for(let k=s0+1;k<end;k++)if(mod(k-a,4)===0)sc+=nov[k]*nov[k];for(const c of cueBars)if(mod(c-a,4)===0)sc+=0.5;if(sc>best+1e-9){best=sc;anc=a}}
  const p95=pctl(Array.from(nov).filter(x=>x>0),0.95)||1,thr=p95/3;
  const bd=new Set();
  for(let k=s0+1;k<end;k++){
    if(mod(k-anc,4)===0){if(nov[k]>=thr&&nov[k]>=0.55*Math.max(nov[k-4]||0,nov[k+4]||0))bd.add(k)}
    else if(nov[k]>thr*1.4){const l=k-mod(k-anc,4),r=l+4;if(nov[k]>1.5*Math.max(nov[l]||0,nov[r]||0))bd.add(k)}
  }
  for(const c of cueBars){const d=mod(c-anc,4),sn=d===1?c-1:d===3?c+1:c;bd.add(sn>s0&&sn<end?sn:c)}
  let segs=[],a=0;for(const k of [...bd].sort((x,y)=>x-y)){if(k>a){segs.push({a,b:k});a=k}}if(end>a)segs.push({a,b:end});
  const dist=(x,y)=>{const A=meanV(x.a,x.b),Bv=meanV(y.a,y.b);if(!A||!Bv)return 9;let d=0;for(let i=0;i<6;i++)d+=Math.abs(A[i]-Bv[i]);return d};
  for(let guard=0;guard<200;guard++){
    const i=segs.findIndex((s,j)=>s.b-s.a<4&&segs.length>1&&!(j===0&&s.b<=s0));if(i<0)break;
    const s=segs[i],L=segs[i-1],R=segs[i+1],j=!L?i+1:!R?i-1:dist(s,L)<=dist(s,R)?i-1:i+1;
    segs.splice(Math.min(i,j),2,{a:Math.min(segs[j].a,s.a),b:Math.max(segs[j].b,s.b)});
  }
  for(let guard=0;guard<40;guard++){
    const i=segs.findIndex(s=>s.b-s.a>32);if(i<0)break;const s=segs[i];let bk=-1,bv=0;
    for(let k=s.a+8;k<=s.b-8;k++)if(mod(k-anc,4)===0&&nov[k]>bv){bv=nov[k];bk=k}
    if(bk<0||bv<0.4*thr)bk=s.a+16;if(s.b-bk<4)break;
    segs.splice(i,1,{a:s.a,b:bk},{a:bk,b:s.b});
  }
  return {segs,anc,nov,thr};
}
function label(segs,f){
  const n=segs.length,st=segs.map(x=>secStats(f,x)),lab=new Array(n).fill(null);
  const maxE=Math.max(...st.map(x=>x.E),1e-9),hot=x=>x.lo>=0.5&&x.E>=0.6*maxE;
  // club structure: a hot section right after a stretch without bass that is unsung or rising (a build → drop), or no vocals at
  // all. Not the section after the intro (a pop song whose intro has no bass is no club track), not after a flat sung bridge (pop)
  const club=st.some((x,i)=>i>1&&hot(x)&&st[i-1].lo<0.45&&(st[i-1].voc<0.5||st[i-1].hiSlope>0.06)&&x.lo-st[i-1].lo>0.35)||st.every(x=>x.voc<0.3);
  let lastHot=-1;st.forEach((x,i)=>{if(hot(x))lastHot=i});
  for(let i=n-1;i>0;i--){if(i>lastHot&&lastHot>=0&&(st[i].lo<0.5||st[i].E<0.6*maxE))lab[i]='outro';else break}
  if(n>1)lab[0]='intro';
  for(let i=1,tot=segs[0].b;i<n&&!lab[i]&&st[i].voc<0.3&&!hot(st[i])&&segs[i].b<=32&&tot<32;i++){lab[i]='intro';tot=segs[i].b}
  const out=[];
  for(let i=0;i<n;i++){
    let l=lab[i];const x=st[i],nx=st[i+1],nh=!!nx&&hot(nx)&&lab[i+1]!=='outro',pv=out.length?out[out.length-1]:null;
    if(!l){
      if(hot(x))l=club||x.voc<0.3?'drop':'chorus';
      else if(x.lo<0.45){
        if(nh&&(x.len<=8||x.hiSlope>0.1))l='build';
        else if(club&&pv&&(pv.lab==='drop'||pv.lab==='chorus')&&!(nh&&x.len>=16&&secStats(f,{a:segs[i].b-8,b:segs[i].b}).hiSlope>0.06))l='break';
        else if(nh&&x.len>=16&&x.voc<0.4){const a2=segs[i].b-8,s2=secStats(f,{a:a2,b:segs[i].b});if(s2.hiSlope>0.06){out.push({a:segs[i].a,b:a2,lab:'break'});out.push({a:a2,b:segs[i].b,lab:'build'});continue}l='break'}
        else l=x.voc>=0.4?'verse':'break';
      }else{
        if(x.voc>=0.4)l=nh&&x.len<=8&&pv&&pv.lab==='verse'?'pre':'verse';
        else if(nh&&x.hiSlope>0.08)l='build';
        else l=club&&pv&&(pv.lab==='drop'||pv.lab==='chorus')&&x.E<0.75*st[i-1].E?'break':'verse';
      }
    }
    out.push({a:segs[i].a,b:segs[i].b,lab:l});
  }
  // vocal pop: repeats of a chorus → chorus; one late, one-off vocal section → bridge
  if(!club){
    const C=out.map(s=>({c:chromaMean(f,s.a,s.b),E:secStats(f,s).E}));
    out.forEach((s,i)=>{if(s.lab!=='verse')return;for(let j=0;j<out.length;j++)if(out[j].lab==='chorus'&&dot(C[i].c,C[j].c)>0.96&&Math.abs(C[i].E-C[j].E)<0.1){s.lab='chorus';break}});
    const chs=out.map((s,i)=>s.lab==='chorus'?i:-1).filter(i=>i>=0);
    if(chs.length>=2)out.forEach((s,i)=>{if(i<=chs[1]||s.lab!=='verse')return;if(out.every((o,j)=>j===i||dot(C[i].c,C[j].c)<0.9))s.lab='bridge'});
  }
  return out;
}
// scoreOnly: just the score of s's current grid (+ s.drift), used to keep a drift correction only when it fits the hits better
function groove(s,scoreOnly){
  const w=s.an.wave;if(!w||!w.len)return {g:0,sc:0,drift:null};
  const rate=w.rate,n=w.len,o=new Float32Array(n);
  // band envelopes smoothed over 3 frames (20 ms) so low-note ripple doesn't count as hits
  const sm=x=>{const y=new Float32Array(n);for(let j=0;j<n;j++)y[j]=((x[j-1]||x[j])+x[j]+(x[j+1]||x[j]))/3;return y},lo=sm(w.low),hi=sm(w.high),am=sm(w.amp);
  for(let j=2;j<n;j++)o[j]=Math.max(0,lo[j]-lo[j-2])+0.7*Math.max(0,hi[j]-hi[j-2])+0.3*Math.max(0,am[j]-am[j-2]);
  // onset peaks: local maxima (±20 ms) clearly above the local mean (±0.5 s); noise, vibrato and swells stay out
  const cs=new Float64Array(n+1);for(let j=0;j<n;j++)cs[j+1]=cs[j]+o[j];
  const pk=[];for(let j=3;j<n-3;j++){const v=o[j];if(v<=0)continue;let m=true;for(let d=-3;d<=3;d++)if(d&&o[j+d]>v){m=false;break}if(!m)continue;
    const a=Math.max(0,j-75),z=Math.min(n,j+76),mu=(cs[z]-cs[a])/(z-a);if(v>1.8*mu+0.01)pk.push(j)}
  const T=s.g.T,sub=T/4,fd=s.g.fd,SIG=0.02,tj=j=>(j-0.5)/rate;   // a 2-frame rise is centred half a frame earlier
  const off=j=>s.drift?s.drift[clamp(Math.floor((tj(j)-fd)/s.g.B),0,s.drift.length-1)]:0;
  let sw=0,so=0;for(const j of pk){const tt=tj(j)-fd-off(j),d=Math.abs(tt-Math.round(tt/sub)*sub);sw+=o[j]*Math.exp(-0.5*(d/SIG)**2);so+=o[j]}
  let base=0;for(let i=0;i<200;i++){const d=(i+0.5)/200*sub/2;base+=Math.exp(-0.5*(d/SIG)**2)}base/=200;
  const sc=so?clamp((sw/so-base)/(1-base),0,1):0;
  if(scoreOnly){const mx=s.drift?pctl(Array.from(s.drift).map(Math.abs),1):0;return {sc,g:clamp(sc*(1-clamp((mx-0.01)/0.04,0,0.6)),0,1)}}
  // drift: the beat phase per 2-bar window, folded on the BEAT (not the 16th, so it can grow past a 16th: a live band drifts by
  // hundreds of ms), tracked across windows by dynamic programming (a smooth path; windows without hits just carry it), unwrapped
  // and centred on whole beats. A straight-line part is a slightly wrong BPM: folded into the bar length (`fit`), so the
  // original keeps its own tempo; only the rest becomes per-bar offsets.
  const B=s.g.B,nb=s.g.nb,WB=2,ST=0.004,NC=Math.max(8,Math.round(T/ST)),sig2=0.012,win=[],em=[];
  for(let k=0;k+WB<=nb;k+=WB){const a=fd+k*B,z=fd+(k+WB)*B,ps=pk.filter(j=>tj(j)>=a&&tj(j)<z);let mass=0;for(const j of ps)mass+=o[j];
    if(ps.length<6||mass<so/Math.max(1,nb/WB)*0.35){win.push(null);em.push(null);continue}
    const e=new Float32Array(NC);let mx2=1e-9;
    for(let c=0;c<NC;c++){const dl=(c/NC-0.5)*T;let v=0;for(const j of ps){const tt=tj(j)-fd-dl,d=Math.abs(tt-Math.round(tt/T)*T);v+=o[j]*Math.exp(-0.5*(d/sig2)**2)}e[c]=v;if(v>mx2)mx2=v}
    for(let c=0;c<NC;c++)e[c]/=mx2;em.push(e);win.push(0)}
  let drift=null,fit=null;const nv=em.filter(Boolean).length;
  if(nv>=3){
    const wr=c=>{c=mod(c,NC);return c>NC/2?c-NC:c},lam=0.08/((NC/8)**2);   // steps up to a quarter beat per window (≈ 3 % tempo); a step of an eighth beat costs 0.08 (a clean hit = 1)
    let sc0=new Float32Array(NC),bk=[];
    for(let i=0;i<em.length;i++){const e=em[i],nx=new Float32Array(NC),from=new Int16Array(NC);
      for(let c=0;c<NC;c++){let bv=-1e9,bi=c;for(let d=-Math.floor(NC/4);d<=Math.floor(NC/4);d++){const q=mod(c+d,NC),v=sc0[q]-lam*d*d;if(v>bv){bv=v;bi=q}}nx[c]=bv+(e?e[c]:0);from[c]=bi}
      sc0=nx;bk.push(from)}
    let c=0;for(let q=1;q<NC;q++)if(sc0[q]>sc0[c])c=q;const path=new Array(em.length);
    for(let i=em.length-1;i>=0;i--){path[i]=c;c=bk[i][c]}
    const un=[(path[0]/NC-0.5)*T];for(let i=1;i<path.length;i++)un.push(un[i-1]+wr(path[i]-path[i-1])/NC*T);
    const pts=un.map((x,i)=>em[i]?{k:i*WB+WB/2,x}:null).filter(Boolean),med=pctl(pts.map(p=>p.x),0.5),sh=Math.round(med/T)*T;
    pts.forEach(p=>{p.x-=sh});un.forEach((x,i)=>{if(win[i]!=null)win[i]=x-sh});
    if(pts.filter(p=>Math.abs(p.x)>0.015).length>=2){     // a real drift
      let sk=0,sx=0,skk=0,skx=0;for(const p of pts){sk+=p.k;sx+=p.x;skk+=p.k*p.k;skx+=p.k*p.x}const n=pts.length,den=n*skk-sk*sk;
      const be=den>1e-9?(n*skx-sk*sx)/den:0,al=(sx-be*sk)/n;
      if(Math.abs(be)*nb>0.03&&Math.abs(be)<0.02*B){const a2=fd+al>=0?al:0;fit={B:B+be,fd:fd+a2};for(const p of pts)p.x-=a2+be*p.k}   // ≥ 30 ms over the song, < 2 % tempo
      if(fit||pts.some(p=>Math.abs(p.x)>0.015)){
        drift=new Float32Array(nb+1);
        for(let k=0;k<=nb;k++){let p=pts[0],q=pts[pts.length-1];if(pts.length>1){if(k<=pts[0].k){p=pts[0];q=pts[1]}else if(k>=q.k){p=pts[pts.length-2]}else for(let i=0;i+1<pts.length;i++)if(pts[i].k<=k&&pts[i+1].k>=k){p=pts[i];q=pts[i+1];break}}
          drift[k]=p===q||q.k===p.k?p.x:p.x+(q.x-p.x)*(k-p.k)/(q.k-p.k)}   // linear between the windows, extrapolated at the ends
      }
    }
  }
  const mx=pctl(win.filter(x=>x!=null).map(Math.abs),1)||0;
  return {g:clamp(sc*(1-clamp((mx-0.01)/0.04,0,0.6)),0,1),sc,drift,fit,win};
}
function phraseLock(secs,s0){
  const inner=secs.slice(1).map(x=>x.a).filter(b=>b>s0);if(!inner.length)return 1;
  return inner.reduce((a,b)=>{const d=b-s0;return a+(mod(d,8)===0?1:mod(d,4)===0?0.75:mod(d,2)===0?0.25:0)},0)/inner.length;
}

/* ---------- arrangement ---------- */
const fullMask=null,M_D={vocals:0,drums:1,bass:0,other:0},M_DB={vocals:0,drums:1,bass:1,other:0},M_I={vocals:0,drums:1,bass:1,other:1};
function bestLoop(s,secs,W,want){
  const f=s.f,stem=!!s.stems;let best=null;
  for(const w of [W,8,4]){
    if(w>W)continue;
    secs.forEach((x,i)=>{
      for(let a=x.a;a+w<=x.b;a+=4){
        const b=a+w,d=meanOf(f.dr,a,b),v=meanOf(f.vo,a,b),o=meanOf(f.md,a,b),bs=meanOf(f.bs,a,b);
        let vv=0;for(let k=a;k<b;k++)vv+=(f.dr[k]-d)**2;const cv=Math.sqrt(vv/w)/(d+1e-6);
        let sc=d-0.9*v*(stem?1:0.6)-0.6*cv;
        if(want==='db')sc+=0.4*bs;if(want==='inst')sc+=0.3*bs+0.3*o-0.5*v;if(want==='d')sc-=0.2*o;
        if(x.lab==='build')sc-=0.3;if(x.lab==='break'&&want!=='inst')sc-=0.2;
        if((want==='db'||want==='inst')&&(x.lab==='drop'||x.lab==='chorus'))sc+=0.1;if(want==='d'&&(x.lab==='intro'||x.lab==='outro'))sc+=0.1;
        if(!best||sc>best.sc+1e-9)best={sa:a,sb:b,sec:i,sc};
      }
    });
    if(best)break;
  }
  return best||{sa:secs[0].a,sb:Math.min(secs[0].b,secs[0].a+4),sec:0,sc:0};
}
// DJ intro / outro of `len` bars from one loop, in stages (mask + optional filter sweep), cut into blocks at every loop seam
function loopRun(s,secs,len,style,role,friendlyNext){
  const want=style==='db'?'db':style==='full'||style==='filt'?'inst':'d';
  const W=len>=16?16:len>=8?8:4,lp=bestLoop(s,secs,W,want),w=lp.sb-lp.sa;
  const h=Math.max(4,Math.floor(len/8)*4),q=Math.max(4,Math.floor(len/16)*4);
  let st;
  if(role==='intro')st=style==='drums'?[[0,len,M_D]]:style==='db'?[[0,h,M_D],[h,len,M_DB]]:style==='full'?[[0,len,M_I]]:style==='filt'?[[0,len,M_I,'lp',250,16000]]:[[0,h,M_D,'hp',400,400],[h,len,M_D]];
  else st=style==='drums'?(friendlyNext||len<16?[[0,len,M_D]]:[[0,q,M_I],[q,2*q,M_DB],[2*q,len,M_D]]):style==='db'?[[0,h,M_DB],[h,len,M_D]]:style==='full'?[[0,len,M_I]]:style==='filt'?[[0,len,M_I,'lp',16000,250]]:[[0,h,M_D],[h,len,M_D,'hp',400,400]];
  st=st.filter(x=>x[1]>x[0]&&x[0]<len).map(x=>[x[0],Math.min(len,x[1]),x[2],x[3],x[4],x[5]]);
  const out=[];
  for(const [s0,s1,mask,ft,f0,f1] of st){
    for(let j=s0;j<s1;){
      const pos=mod(j,w),step=Math.min(s1-j,w-pos);
      const fx=ft?{t:ft,f0:f0*Math.pow(f1/f0,(j-s0)/(s1-s0)),f1:f0*Math.pow(f1/f0,(j+step-s0)/(s1-s0))}:null;
      out.push({role,sec:lp.sec,sa:lp.sa+pos,sb:lp.sa+pos+step,mask,fx,ft:ft||null});j+=step;
    }
  }
  return out;
}
function makePlan(s,set,secs){
  const g=s.g,B=g.B,n=secs.length,f=s.f,st=secs.map(x=>secStats(f,x));
  const friendly=i=>st[i].dr>=0.3&&st[i].voc<0.25;
  const orig=secs.map((x,i)=>[{role:'orig',sec:i,sa:x.a,sb:x.b,mask:fullMask,fx:null}]);   // per section: its blocks (repeats go after)
  const rep=(i,w,role)=>{const x=secs[i];w=Math.min(w,x.b-x.a);if(w<4)return 0;orig[i].push({role:role||'rep',sec:i,sa:x.b-w,sb:x.b,mask:fullMask,fx:null});return w};
  const target=set.add==='custom'?clamp(+set.custom||0,0,600):+set.add;
  const N=set.intro,Z=set.outro;
  const first=secs[0],last=secs[n-1];
  let intro=[],outro=[],addBars=0,cycle=[];
  // intro
  const L0=first.lab==='intro'?first.b-Math.max(first.a,f.s0):0;
  if(set.is==='orig'){if(L0&&L0<N){let need=N-L0;const ph=L0>=8?8:4;while(need>=4){const w=Math.min(ph,need-need%4);if(rep(0,w)<4)break;addBars+=w;need-=w}}}
  else{let need=first.lab==='intro'&&friendly(0)?Math.max(0,N-L0):N;need=Math.ceil(need/4)*4;if(need>0){intro=loopRun(s,secs,need,set.is,'intro');addBars+=need}}
  // outro
  const Lz=last.lab==='outro'?last.b-last.a:0;
  if(set.os==='orig'){if(Lz&&Lz<Z){let need=Z-Lz;const ph=Lz>=8?8:4;while(need>=4){const w=Math.min(ph,need-need%4);if(rep(n-1,w)<4)break;addBars+=w;need-=w}}}
  else{const fr=last.lab==='outro'&&friendly(n-1);let need=fr?Math.max(0,Z-Lz):Z;need=Math.ceil(need/4)*4;if(need>0){outro=loopRun(s,secs,need,set.os,'outro',fr);addBars+=need}}
  // body: whole phrases until the requested length
  let rem=Math.round(target/B)-addBars;
  const idx=l=>secs.map((x,i)=>l.includes(x.lab)?i:-1).filter(i=>i>=0);
  const drops=idx(['drop','chorus']),breaks=idx(['break']);
  const pick=r=>r>=14?16:r>=6?8:r>=3?4:0;
  if(set.preset==='perf'&&drops.length&&rem>=8){
    const ld=drops[drops.length-1],bi=ld-1>=0&&secs[ld-1].lab==='build'?ld-1:-1;
    const dl=Math.min(16,secs[ld].b-secs[ld].a,Math.max(4,Math.floor((rem-(bi>=0?Math.min(8,secs[bi].b-secs[bi].a):0))/4)*4));
    if(bi>=0){const w=Math.min(8,secs[bi].b-secs[bi].a);cycle.push({role:'cycle',sec:bi,sa:secs[bi].b-w,sb:secs[bi].b,mask:fullMask,fx:null});rem-=w}
    if(dl>=4){cycle.push({role:'cycle',sec:ld,sa:secs[ld].a,sb:secs[ld].a+dl,mask:fullMask,fx:null});rem-=dl}
    if(cycle.length){orig[ld].push(...cycle)}
  }
  const ops=set.preset==='club'?[...drops.map(i=>[i,16]),...breaks.map(i=>[i,8]),...drops.map(i=>[i,8])]
    :set.preset==='radio'?[...drops.slice(-1).map(i=>[i,8]),...drops.map(i=>[i,8])]
    :[...drops.map(i=>[i,16]),...breaks.map(i=>[i,8]),...drops.map(i=>[i,8])];
  if(!ops.length)secs.forEach((x,i)=>{if(x.lab!=='intro'&&x.lab!=='outro')ops.push([i,8])});
  for(let r=0;r<3&&rem>=3;r++)for(const [i,w0] of ops){if(rem<3)break;const w=Math.min(w0,pick(rem));if(!w)break;const got=rep(i,w);if(got){rem-=got}}
  // a DJ intro goes straight into the music: the original's silent lead-in bars (before its first music bar) are skipped
  if(intro.length&&f.s0>0&&f.s0<first.b)orig[0][0].sa=f.s0;
  const blocks=[...intro,...orig.flat(),...outro];
  // out positions (bars) + times
  let o=0;for(const b of blocks){b.o0=o;o+=b.sb-b.sa;b.o1=o}
  const P=blocks[0].role==='orig'&&blocks[0].sa===0?Math.min(g.fd,srcT(s,0)):0;
  const lb=blocks[blocks.length-1],tail=lb.role==='orig'&&lb.sb===last.b?Math.max(0,Math.min(12,s.buffer.duration-srcT(s,last.b))):0;
  const len=P+o*B+tail;
  return {blocks,bars:o,P,tail,len,B,added:len-s.buffer.duration,target,over:addBars*B>target+B};
}
const outT=(p,bar)=>p.P+bar*p.B;
function planSig(){const s=X.song;return s?JSON.stringify([X.set.add,X.set.custom,X.set.intro,X.set.outro,X.set.is,X.set.os,X.set.preset,s.secs,s.kind]):''}
function replan(){const s=X.song;if(!s||!s.secs){X.plan=null;return}X.plan=makePlan(s,X.set,s.secs);X.sel=X.sel<X.plan.blocks.length?X.sel:-1}
const fresh=()=>!!(X.render&&X.rsig===planSig());

/* ---------- render (OfflineAudioContext, sample-accurate on the bar grid) ---------- */
function segmentsOf(p){
  const out=[];for(const b of p.blocks){const l=out[out.length-1];if(l&&l.sb===b.sa&&l.blocks[l.blocks.length-1].sec!==undefined){l.blocks.push(b);l.sb=b.sb;l.o1=b.o1}else out.push({blocks:[b],sa:b.sa,sb:b.sb,o0:b.o0,o1:b.o1})}
  return out;
}
const EP=(n,up)=>{const c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1);c[i]=up?Math.sin(x*Math.PI/2):Math.cos(x*Math.PI/2)}return c};
async function renderAudio(s,p,sr,prog){
  const n=Math.max(1,Math.ceil(p.len*sr)),segs=segmentsOf(p);
  const rates=segs.map(sg=>(srcT(s,sg.sb)-srcT(s,sg.sa))/((sg.o1-sg.o0)*p.B));
  let st=null,lat=0;
  if(rates.some(r=>Math.abs(r-1)>0.002)){try{await CR.loadScript(CR.SS_SRC)}catch(e){}}
  const oc=new OfflineAudioContext(2,n+Math.ceil(sr*0.5),sr),master=oc.createGain();
  if(window.SignalsmithStretch&&rates.some(r=>Math.abs(r-1)>0.002)){try{st=await window.SignalsmithStretch(oc);lat=+(await st.latency())||0;master.connect(st);st.connect(oc.destination)}catch(e){st=null;lat=0}}
  if(!st)master.connect(oc.destination);
  const nsegs=segs.length;
  for(let si=0;si<nsegs;si++){
    const sg=segs[si],r=Math.abs(rates[si]-1)>0.002?rates[si]:1,t0=outT(p,sg.o0),t1=outT(p,sg.o1),fb=sg.blocks[0];
    const s0=srcT(s,sg.sa),isLast=si===nsegs-1,tail=isLast?p.tail:0;
    // pre-roll: the source's own pickup before bar 1 is laid over the end of the previous block; other joins: the crossfade
    const pre=si===0?Math.min(t0,s0/r):fb.role==='orig'&&sg.sa===0?Math.min(s0/r,p.B,t0):Math.min(XF,s0/r,t0);
    const a0=t0-pre,end=t1+tail;
    const sgG=oc.createGain();sgG.connect(master);const gp=sgG.gain;
    if(si===0&&a0<0.003)gp.setValueAtTime(1,0);
    else if(pre>XF*1.5){gp.setValueAtTime(0,a0);gp.linearRampToValueAtTime(1,a0+0.008)}
    else if(pre>0.001)gp.setValueCurveAtTime(EP(32,true),a0,pre);
    else gp.setValueAtTime(1,a0);
    if(!isLast)gp.setValueCurveAtTime(EP(32,false),t1-XF,XF);
    else if(tail<0.01){gp.setValueAtTime(1,Math.max(a0+0.01,t1-0.025));gp.linearRampToValueAtTime(0,t1)}
    else{gp.setValueAtTime(1,end-0.03);gp.linearRampToValueAtTime(0,end)}
    // filters (only when a block of this segment uses one)
    let head=sgG;const fts=[...new Set(sg.blocks.map(b=>b.ft).filter(Boolean))];
    for(const ft of fts){const bq=oc.createBiquadFilter();bq.type=ft==='lp'?'lowpass':'highpass';bq.Q.value=0.707;const idle=ft==='lp'?Math.min(20000,sr*0.45):10;bq.frequency.setValueAtTime(idle,0);
      for(const b of sg.blocks){const b0=outT(p,b.o0),b1=outT(p,b.o1);if(b.ft===ft){bq.frequency.setValueAtTime(b.fx.f0,b0);bq.frequency.exponentialRampToValueAtTime(Math.max(10,b.fx.f1),b1)}else bq.frequency.setValueAtTime(idle,b0)}
      bq.connect(head);head=bq}
    // layers: the original mix (unmasked blocks) and the stems used by masked blocks
    const layers=[];
    if(sg.blocks.some(b=>!b.mask))layers.push({id:'full',buf:s.buffer,on:b=>b.mask?0:1});
    if(s.stems)for(const id of IDS)if(sg.blocks.some(b=>b.mask&&b.mask[id]))layers.push({id,buf:s.stems[id],on:b=>b.mask&&b.mask[id]?1:0});
    for(const L of layers){
      const src=oc.createBufferSource();src.buffer=L.buf;src.playbackRate.value=r;const g=oc.createGain();
      let prev=null;for(const b of sg.blocks){const v=L.on(b),b0=outT(p,b.o0);if(prev==null)g.gain.setValueAtTime(v,0);else if(v!==prev){g.gain.setValueAtTime(prev,Math.max(0,b0-0.012));g.gain.linearRampToValueAtTime(v,b0)}prev=v}
      src.connect(g).connect(head);
      // whole sample frames on both sides: a fractional start would interpolate (= a gentle low-pass on unmodified blocks)
      const at=Math.round(Math.max(0,a0)*sr)/sr,bsr=L.buf.sampleRate,off=Math.round(Math.max(0,s0-(t0-at)*r)*bsr)/bsr;
      src.start(at,off,Math.max(0.01,(end-at)*r+0.01));
    }
    if(st)st.schedule({active:true,semitones:-12*Math.log2(r),output:Math.max(0,a0)+lat});
  }
  const tot=(n/sr)+lat;for(let x=2;x<tot;x+=2)oc.suspend(x).then(()=>{if(prog)prog(x/tot);oc.resume()}).catch(()=>{});
  const out=await oc.startRendering(),o0=Math.round(lat*sr);
  const L=out.getChannelData(0).subarray(o0,o0+n),R=out.getChannelData(1).subarray(o0,o0+n);   // views, not copies (a 12-min render is ~300 MB per copy)
  let pk=0;for(let j=0;j<n;j++){const a=Math.abs(L[j]),b=Math.abs(R[j]);if(a>pk)pk=a;if(b>pk)pk=b}
  if(pk>0.98){const k=0.98/pk;for(let j=0;j<n;j++){L[j]*=k;R[j]*=k}}
  const ab=new AudioBuffer({numberOfChannels:2,length:n,sampleRate:sr});ab.copyToChannel(L,0);ab.copyToChannel(R,1);
  return ab;
}

/* ---------- stems ---------- */
function quickSep(buf,prog,sig){
  return CR.stereo44(buf).then(([LR,len])=>new Promise((ok,no)=>{
    const L=LR.slice(0,len),R=LR.slice(len),w=new Worker(QW);
    const ab=()=>{w.terminate();no(Object.assign(new Error('aborted'),{code:'aborted'}))};
    if(sig){if(sig.aborted)return ab();sig.addEventListener('abort',ab,{once:true})}
    w.onmessage=e=>{const d=e.data;
      if(d.type==='p')prog(d.p);
      else if(d.type==='done'){w.terminate();if(sig)sig.removeEventListener('abort',ab);const ac=CR.ac(),out={};
        IDS.forEach((id,k)=>{const b=ac.createBuffer(2,len,44100);b.copyToChannel(d.res[k*2],0);b.copyToChannel(d.res[k*2+1],1);out[id]=b});ok(out)}};
    w.onerror=e=>{if(e&&e.preventDefault)e.preventDefault();w.terminate();no(new Error((e&&e.message)||'worker'))};
    w.postMessage({L,R,sr:44100},[L.buffer,R.buffer]);
  }));
}

/* ---------- loading + analysis pipeline ---------- */
function setMsg(m,err){X.msg=m||'';X.msgErr=!!err;const el=$('#exMsg');if(el){el.textContent=X.msg;el.classList.toggle('err',X.msgErr);el.hidden=!X.msg}}
function step(k,state,p){X.steps[k]=state;if(p!=null)X.stepP=p;renderProc()}
async function loadSong(getBuf,name,pre){
  const tok=++X.tok;stopPB();abortGen();setMsg('');
  if(X.qctl)X.qctl.abort();
  if(X.sep)X.sep.ctl.abort();   // an AI separation of the previous song: cancelled → refunded (its stems would be thrown away)
  X.song=null;X.plan=null;X.render=null;X.rwave=null;X.sel=-1;X.secEd=-1;closeSecEd();
  X.stage='analyzing';X.steps={};X.stepP=0;X.procName=name;AN_STEPS.forEach(k=>X.steps[k]='todo');renderAll();
  try{
    step('an','run',0.02);
    let buffer,a=null,stems=null,kind=null;
    if(pre){buffer=pre.buffer;a={bpm:pre.bpm,offset:pre.offset,down:pre.down||0,key:pre.key,wave:pre.wave,lufs:pre.lufs,dur:buffer.duration};if(pre.stems){stems=pre.stems;kind='tool'}}
    else buffer=await getBuf();
    if(tok!==X.tok)return;
    if(buffer.duration<30)throw Object.assign(new Error('short'),{short:true});
    if(buffer.duration>MAX_DUR)throw Object.assign(new Error('long'),{long:true});
    if(!a)a=await CR.analyzeTrack(buffer,p=>{if(tok===X.tok){X.stepP=0.05+p*0.9;renderProcP()}});
    if(tok!==X.tok)return;
    step('an','done');step('bpm','done');await sleep(80);step('key','done');
    const s={key:name+'|'+Math.round(buffer.duration*1000)+'|'+buffer.length,name,buffer,an:a,g:gridOf(a,buffer.duration),stems,kind,F:null,chroma:null};
    if(s.g.nb<16)throw Object.assign(new Error('short'),{short:true});
    if(!s.stems){
      step('sep','run',0);const ctl=new AbortController();X.qctl=ctl;
      s.stems=await quickSep(buffer,p=>{if(tok===X.tok){X.stepP=p;renderProcP()}},ctl.signal);s.kind='quick';X.qctl=null;
    }
    if(tok!==X.tok)return;
    step('sep','done');
    await analyse(s,tok);
    if(tok!==X.tok)return;
    X.song=s;X.stage='ready';X.zoom=1;X.view0=0;replan();save();renderAll();
  }catch(e){
    if(tok!==X.tok)return;console.warn(e);X.stage=X.song?'ready':'empty';
    setMsg(e&&e.short?t('exShort'):e&&e.long?t('exLong'):e&&e.big?t('exBig'):e&&e.lib?t('exErrLib'):e&&e.code==='aborted'?t('canceled'):e&&(e.name==='EncodingError'||/decode/i.test(String(e.message)))?t('readErr'):t('exErrLoad'),!(e&&e.code==='aborted'));
    renderAll();
  }
}
// structure from the features (also re-run after AI stems arrive)
async function analyse(s,tok){
  step('struct','run',0.1);
  s.f=await features(s);if(tok!==X.tok)return;
  const gr=groove(s);s.groove=gr.g;s.drift=null;
  if(gr.fit||gr.drift){
    const g0=s.g,an0=s.an;let g=gr;
    for(let it=0;;it++){
      if(g.fit){   // the BPM was slightly off: the bar length from the beats themselves (the BPM shown, tagged and the output grid follow)
        const B=g.fit.B,T=B/4,fd=g.fit.fd;s.g={T,B,fd,nb:Math.max(0,Math.floor((s.buffer.duration-fd)/B+1e-6))};s.an={...s.an,bpm:240/B,offset:mod(fd,T),down:Math.floor(mod(fd,B)/T)}}
      if(g.fit&&it===0){s.drift=null;g=groove(s);if(g.fit||g.drift)continue;break}   // track once more on the refitted grid (smaller steps)
      s.drift=g.drift;break;
    }
    if(s.drift)while(s.g.nb>16&&srcT(s,s.g.nb)>s.buffer.duration+0.005)s.g.nb--;
    // keep the correction only when the hits sit clearly better on the corrected grid (a 3/4 song on a 4/4 grid: no)
    const g2=groove(s,true);if(g2.sc>gr.sc+0.05&&s.g.nb>=16){s.groove=g2.g;s.f=await features(s)}else{s.g=g0;s.an=an0;s.drift=null}
  }
  step('struct','done');step('phr','run',0.5);await sleep(30);
  let cues=[];try{cues=await CUES.detect(s.buffer,{bpm:s.an.bpm,offset:s.an.offset,down:s.an.down||0},s.F)}catch(e){console.warn(e)}
  if(tok!==X.tok)return;
  s.cues=cues;const sg=segment(s.f,cues);s.anc=sg.anc;
  step('phr','done');step('drop','run',0.8);await sleep(30);
  s.secs0=label(sg.segs,s.f);s.secs=s.secs0.map(x=>({...x}));s.edited=false;
  s.lock=phraseLock(s.secs,s.f.s0);
  step('drop','done');
}
// decode at the file's own rate when we can tell it (WAV header; else 44.1 kHz, the usual MP3/M4A rate): the AudioContext's
// rate (often 48 kHz) would resample on decode, and the unmodified blocks of the render would no longer be the source's samples
function wavRate(ab){try{const v=new DataView(ab);if(v.getUint32(0)!==0x52494646||v.getUint32(8)!==0x57415645)return 0;let p=12;while(p+8<=v.byteLength){const id=v.getUint32(p),n=v.getUint32(p+4,true);if(id===0x666d7420)return v.getUint32(p+12,true);p+=8+n+(n&1)}}catch(e){}return 0}
async function decode(ab){
  const r=wavRate(ab),sr=r>=8000&&r<=192000?r:44100;
  try{return await new OfflineAudioContext(2,1,sr).decodeAudioData(ab.slice(0))}catch(e){return CR.ac().decodeAudioData(ab)}
}
function loadFile(file){
  if(!file)return;
  if(file.size>MAX_BYTES){setMsg(t('exBig'),true);return}
  const name=file.name.replace(/\.[a-z0-9]{2,5}$/i,'');
  loadSong(async()=>decode(await file.arrayBuffer()),name);
}
function loadLib(it){
  if(!it||!it.file_path||!CR.signedIn())return;
  loadSong(async()=>{let ab;try{const url=await CR.songFileUrl(it.file_path);const r=await fetch(url);if(!r.ok)throw new Error('http '+r.status);ab=await r.arrayBuffer()}catch(e){throw Object.assign(e,{lib:true})}return decode(ab)},it.name);
}
function loadTool(){const s=CR.toolSong();if(!s){setMsg(t('exNoTool'),true);return}loadSong(null,s.name,s)}
async function upgradeAI(){
  const s=X.song;if(!s||X.sep||s.kind==='ai'||s.kind==='tool')return;
  if(CR.sepInfo().busy){setMsg(t('exSepBusy'),true);return}
  const ctl=new AbortController();X.sep={ctl,p:0,msg:t('aiDl',{p:0})};setMsg('');renderSrc();
  try{
    const stems=await CR.separateBuffer(s.buffer,{onProgress:(p,m)=>{if(X.sep){X.sep.p=p;X.sep.msg=m;renderSepP()}},signal:ctl.signal,ref:'extended: '+s.name});
    if(X.song!==s)return;
    s.stems=stems;s.kind='ai';const keep=s.edited?s.secs:null;
    const tok=X.tok;await analyse(s,tok);if(tok!==X.tok)return;if(keep){s.secs=keep;s.edited=true;s.lock=phraseLock(s.secs,s.f.s0)}
    replan();save();
  }catch(e){
    const code=e&&e.code;
    if(X.song!==s){}else if(code==='aborted')setMsg(t('canceled'));else if(code==='declined'){}else if(code==='busy')setMsg(t('exSepBusy'),true);else if(code==='off')setMsg(t('offByAdmin'),true);
    else{console.error(e);setMsg(t('exSepFail',{m:String((e&&e.message)||e).slice(0,80)}),true)}
  }finally{X.sep=null;renderAll()}
}

/* ---------- generation ---------- */
function abortGen(){X.genTok++;if(X.stage==='generating'){if(X.qctl)X.qctl.abort();X.stage=X.song?'ready':'empty'}}
async function generate(){
  const s=X.song;if(!s||X.stage==='generating')return;
  const tok=++X.genTok;stopPB();X.stage='generating';X.steps={};STEPS.forEach(k=>X.steps[k]='todo');X.stepP=0;X.reveal=0;X.sel=-1;X.fin=0;
  renderAll();
  const alive=()=>tok===X.genTok&&X.song===s;
  try{
    // what the analysis already found: a quick cascade
    for(const k of ['an','bpm','key']){step(k,'done');await sleep(70);if(!alive())return}
    if(!s.stems){step('sep','run',0);const ctl=new AbortController();X.qctl=ctl;s.stems=await quickSep(s.buffer,p=>{X.stepP=p;renderProcP()},ctl.signal);s.kind='quick';X.qctl=null;if(!alive())return}
    step('sep','done');await sleep(70);
    for(const k of ['struct','phr','drop']){step(k,'done');await sleep(70);if(!alive())return}
    replan();const p=X.plan,nI=p.blocks.filter(b=>b.role==='intro').length,nO=p.blocks.filter(b=>b.role==='outro').length;
    const grow=async(to,ms)=>{const n0=X.reveal;for(let i=n0+1;i<=to;i++){X.reveal=i;drawSoon();await sleep(reduced()?0:ms)}};
    step('intro','run');await grow(nI,90);step('intro','done');if(!alive())return;
    step('outro','run');X.reveal=nI;drawSoon();await sleep(reduced()?0:120);step('outro','done');if(!alive())return;
    step('arr','run');await grow(p.blocks.length-nO,45);await grow(p.blocks.length,90);step('arr','done');if(!alive())return;
    step('render','run',0);
    const sig=planSig(),buf=await renderAudio(s,p,X.set.sr,q=>{if(alive()){X.stepP=q;renderProcP()}});
    if(!alive())return;
    step('render','done',1);
    X.render=buf;X.rsig=sig;X.rwave=null;X.reveal=Infinity;
    try{const w=await CR.waveOf(buf);if(alive())X.rwave=w}catch(e){console.warn(e)}
    X.stage='done';X.fin=performance.now();X.pb.pos.B=0;renderAll();finAnim();
  }catch(e){
    if(!alive())return;console.error(e);X.stage='ready';setMsg(t('exExpFail'),true);renderAll();
  }
}

/* ---------- preview A/B ---------- */
X.pb={which:'B',playing:false,src:null,g:null,t0:0,p0:0,pos:{A:0,B:0},loop:false};
const pbBuf=w=>w==='A'?X.song&&X.song.buffer:fresh()?X.render:null;
function heardPB(){const P=X.pb;if(!P.playing)return P.pos[P.which];const c=CR.ac();let x=P.p0+(c.currentTime-P.t0);const lp=loopRange(P.which);if(P.loop&&lp&&x>=lp[1])x=lp[0]+mod(x-lp[0],lp[1]-lp[0]);return x}
function loopRange(w){const p=X.plan,s=X.song,b=p&&X.sel>=0?p.blocks[X.sel]:null;if(!b)return null;return w==='A'?[srcT(s,b.sa),srcT(s,b.sb)]:[outT(p,b.o0),outT(p,b.o1)]}
function playPB(which,pos){
  const buf=pbBuf(which);if(!buf)return;const P=X.pb,c=CR.ac();c.resume();
  if(P.playing)killPB();
  P.which=which;if(pos==null)pos=P.pos[which];if(pos>=buf.duration-0.05)pos=0;
  const lp=P.loop&&loopRange(which);if(lp&&(pos<lp[0]||pos>=lp[1]))pos=lp[0];
  const src=c.createBufferSource();src.buffer=buf;const g=c.createGain();g.gain.setValueAtTime(0,c.currentTime);g.gain.linearRampToValueAtTime(0.9,c.currentTime+0.04);
  if(lp){src.loop=true;src.loopStart=lp[0];src.loopEnd=lp[1]}
  src.connect(g).connect(c.destination);const at=c.currentTime+0.03;src.start(at,pos);
  src.onended=()=>{if(P.src===src){P.playing=false;P.src=null;P.pos[which]=0;renderTransport();kick()}};
  Object.assign(P,{src,g,t0:at,p0:pos,playing:true});P.pos[which]=pos;renderTransport();kick();
}
function killPB(){const P=X.pb,c=CR.ac();if(!P.src)return;try{P.g.gain.cancelScheduledValues(c.currentTime);P.g.gain.setValueAtTime(P.g.gain.value,c.currentTime);P.g.gain.linearRampToValueAtTime(0,c.currentTime+0.03);P.src.stop(c.currentTime+0.04)}catch(e){}P.src.onended=null;P.src=null}
function stopPB(keep){const P=X.pb;if(P.playing){P.pos[P.which]=keep?heardPB():0;killPB();P.playing=false}else if(!keep)P.pos[P.which]=0;renderTransport();kick()}
function togglePB(which){const P=X.pb;if(P.playing&&(which==null||which===P.which))stopPB(true);else playPB(which||P.which)}
// position mapping through the blocks: extended time ↔ source time
function extToSrc(x){const p=X.plan,s=X.song;if(!p)return x;if(x<p.P)return x;for(const b of p.blocks){const a=outT(p,b.o0),z=outT(p,b.o1);if(x>=a&&x<z)return srcT(s,b.sa)+(x-a)}const lb=p.blocks[p.blocks.length-1];return srcT(s,lb.sb)+(x-outT(p,lb.o1))}
function srcToExt(y){const p=X.plan,s=X.song;if(!p)return y;let best=null;
  for(const b of p.blocks){const a=srcT(s,b.sa),z=srcT(s,b.sb);if(y>=a&&y<z){const v=outT(p,b.o0)+(y-a);if(b.role==='orig')return v;if(best==null)best=v}}
  if(best!=null)return best;if(y<srcT(s,0)){const o=p.blocks.find(b=>b.role==='orig'&&b.sa===0);return o?outT(p,o.o0)-(srcT(s,0)-y):y}
  const lo=[...p.blocks].reverse().find(b=>b.role==='orig');return lo?outT(p,lo.o1)+(y-srcT(s,lo.sb)):y}
function abSwitch(){
  const P=X.pb,cur=heardPB(),to=P.which==='A'?'B':'A';if(!pbBuf(to)){P.which=to;renderTransport();return}
  const pos=to==='B'?srcToExt(cur):extToSrc(cur);P.pos[to]=clamp(pos,0,pbBuf(to).duration-0.05);
  if(P.playing)playPB(to,P.pos[to]);else{P.which=to;renderTransport();kick()}
}
function seekPB(which,x){const P=X.pb,buf=pbBuf(which);if(!buf)return;x=clamp(x,0,buf.duration-0.05);if(P.playing)playPB(which,x);else{P.which=which;P.pos[which]=x;renderTransport();kick()}}
function loopToggle(){const P=X.pb;if(X.sel<0){P.loop=false;renderTransport();return}P.loop=!P.loop;if(P.playing)playPB(P.which,heardPB());else renderTransport();drawSoon()}

/* ---------- settings (per account, never audio) ---------- */
const lsKey=()=>LS+':'+(X.owner||'guest');
function save(){clearTimeout(save.t);save.t=setTimeout(()=>{try{localStorage.setItem(lsKey(),JSON.stringify({v:1,...X.set}))}catch(e){}},200)}
function load(){
  let o=null;try{o=JSON.parse(localStorage.getItem(lsKey())||'null')}catch(e){}
  const d=defSet();X.set=d;if(!o||o.v!==1)return;
  if(PRESETS[o.preset])d.preset=o.preset;
  if(ADDS.includes(o.add)||o.add==='custom')d.add=o.add;
  if(typeof o.custom==='number'&&isFinite(o.custom))d.custom=clamp(Math.round(o.custom),0,600);
  if(BARN.includes(o.intro))d.intro=o.intro;if(BARN.includes(o.outro))d.outro=o.outro;
  if(STYLES.includes(o.is))d.is=o.is;if(STYLES.includes(o.os))d.os=o.os;
  if(['mp3','wav16','wav24'].includes(o.fmt))d.fmt=o.fmt;if(o.sr===44100||o.sr===48000)d.sr=o.sr;d.cues=o.cues!==false;
}
function setOwner(uid){
  uid=uid||null;if(X.owner===uid)return;const had=X.owner!==undefined;X.owner=uid;
  if(had){X.tok++;abortGen();stopPB();if(X.qctl)X.qctl.abort();if(X.sep)X.sep.ctl.abort();X.song=null;X.plan=null;X.render=null;X.rwave=null;X.stage='empty';closePick();closeSecEd()}
  load();if(X.built)renderAll();
}
function applyPreset(k){const p=PRESETS[k];if(!p)return;Object.assign(X.set,{preset:k,add:p.add,intro:p.intro,outro:p.outro,is:p.is,os:p.os});changed()}
function changed(){replan();save();renderSettings();renderPlan();renderExport();renderTransport();drawSoon()}

/* ---------- UI ---------- */
const IC={
  file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  lib:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  tool:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0"/></svg>',
  ext:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 8v8M12 5v14M15 8v8"/><path d="M5.5 9L3 12l2.5 3M18.5 9L21 12l-2.5 3"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
  stop:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/></svg>',
  loop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  ab:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>',
  zin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/></svg>',
  zout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>',
  ai:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>',
  drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};
function build(){
  const v=$('#extendedView');
  v.innerHTML=`
<div class="dhead exhead"><div><div class="eyebrow" data-i="exEyebrow"></div><h1 data-i="exTitle"></h1><p data-i="exSub"></p></div></div>
<section class="exsrc" id="exSrc" aria-label=""></section>
<p class="mxmsg exmsg" id="exMsg" role="status" aria-live="polite" hidden></p>
<section class="exproc" id="exProc" hidden aria-live="polite"></section>
<div id="exMain" hidden>
  <section class="exan" aria-labelledby="exAnH">
    <div class="exanh"><h2 id="exAnH" data-i="exAnH"></h2></div>
    <dl class="exstats" id="exStats"></dl>
  </section>
  <section class="exdeck" id="exDeck" aria-label="">
    <div class="extr">
      <div class="exab" role="group" id="exAB">
        <button type="button" class="exabb" data-pb="A"><span class="ic">${IC.play}</span><span class="exabl"><b data-i="exOrig"></b><small class="mono" id="exTA" dir="ltr"></small></span></button>
        <button type="button" class="exsw" id="exSw">${IC.ab}<span data-i="exAB"></span></button>
        <button type="button" class="exabb" data-pb="B"><span class="ic">${IC.play}</span><span class="exabl"><b data-i="exExt"></b><small class="mono" id="exTB" dir="ltr"></small></span></button>
      </div>
      <span class="extime mono" id="exTime" dir="ltr"></span>
      <span class="exsp"></span>
      <button type="button" class="mxib exloop" id="exLoop" aria-pressed="false">${IC.loop}<span data-i="exLoopBlk"></span></button>
      <button type="button" class="mxib" id="exStopB" data-it="exStop">${IC.stop}</button>
      <button type="button" class="mxib" id="exZo" data-it="exZoomOut">${IC.zout}</button><button type="button" class="mxib" id="exZi" data-it="exZoomIn">${IC.zin}</button>
    </div>
    <div class="extl" id="exTl" dir="ltr"><canvas id="exCv" role="img"></canvas><canvas id="exOv" aria-hidden="true"></canvas><div class="extip" id="exTip" hidden></div></div>
    <div class="exinsp" id="exInsp" aria-live="polite"></div>
    <div class="exsecs"><span class="exsecl" data-i="exSecH"></span><div class="exsecb" id="exSecs"></div></div>
    <p class="exhelp"><span data-i="exTlHelp"></span> · <span data-i="exKeys"></span></p>
  </section>
  <div class="excols">
    <section class="exset" id="exSet" aria-labelledby="exSetH"></section>
    <section class="explan" id="exPlan" aria-labelledby="exPlanH"></section>
  </div>
  <section class="exexp" id="exExp" aria-labelledby="exExpH" hidden></section>
</div>
<input type="file" id="exIn" accept="${ACCEPT}" hidden>
<div class="exed" id="exEd" hidden role="dialog" aria-modal="false" aria-labelledby="exEdH"></div>
<div class="mxpick" id="exPick" hidden><div class="mxpd" role="dialog" aria-modal="true" aria-labelledby="exPickH">
  <div class="mxph"><h2 id="exPickH" data-i="exLibT"></h2><button type="button" class="mxib" id="exPickX" data-it="exClose">${IC.x}</button></div>
  <input type="search" class="srch" id="exPickQ" data-ip="exLibSearch" autocomplete="off">
  <p class="snote" id="exPickN"></p><ul class="mxpl" id="exPickL"></ul></div></div>`;
  X.built=true;wire();CR.applyLang();renderAll();
}
const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
function wire(){
  const v=$('#extendedView');
  v.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;
    if(d.a==='file'){$('#exIn').value='';$('#exIn').click()}
    else if(d.a==='lib')openPick(b);else if(d.a==='tool')loadTool();
    else if(d.a==='ai')upgradeAI();else if(d.a==='cancelSep'){if(X.sep)X.sep.ctl.abort()}
    else if(d.a==='cancelLoad'){X.tok++;if(X.qctl)X.qctl.abort();X.stage='empty';renderAll()}
    else if(d.a==='gen')generate();else if(d.a==='cancelGen'){abortGen();renderAll()}
    else if(d.a==='exp')exportExt();
    else if(d.pb)togglePB(d.pb);
    else if(d.blk!=null){selectBlock(+d.blk,true)}
    else if(d.sec!=null)openSecEd(+d.sec,b);
    else if(d.ps){applyPreset(d.ps)}
    else if(d.add!=null){X.set.add=d.add==='custom'?'custom':+d.add;changed();if(d.add==='custom')setTimeout(()=>{const i=$('#exCustom');if(i)i.focus()},0)}
    else if(d.ib!=null){X.set.intro=+d.ib;changed()}else if(d.ob!=null){X.set.outro=+d.ob;changed()}
    else if(d.fm){X.set.fmt=d.fm;save();renderExport()}else if(d.sr){X.set.sr=+d.sr;save();renderExport()}
  });
  v.addEventListener('change',e=>{const el=e.target;
    if(el.id==='exIS'){X.set.is=el.value;changed()}else if(el.id==='exOS'){X.set.os=el.value;changed()}
    else if(el.id==='exCuesC'){X.set.cues=el.checked;save()}
    else if(el.id==='exCustom'){renderSettings()}});
  v.addEventListener('input',e=>{const el=e.target;if(el.id==='exCustom'){const x=parseFloat(String(el.value).replace(',','.'));if(x>=0&&x<=600){X.set.custom=Math.round(x);X.set.add='custom';replan();save();renderPlan();renderExport();drawSoon()}}});
  $('#exSw').onclick=abSwitch;$('#exStopB').onclick=()=>stopPB();$('#exLoop').onclick=loopToggle;
  $('#exZi').onclick=()=>zoom(2);$('#exZo').onclick=()=>zoom(0.5);
  $('#exIn').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)loadFile(f)};
  v.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();const z=$('#exSrc');if(z)z.classList.add('over')});
  v.addEventListener('dragleave',e=>{if(!v.contains(e.relatedTarget)){const z=$('#exSrc');if(z)z.classList.remove('over')}});
  v.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();const z=$('#exSrc');if(z)z.classList.remove('over');const f=e.dataTransfer.files[0];if(f)loadFile(f)});
  $('#exPickX').onclick=closePick;$('#exPick').onclick=e=>{if(e.target.id==='exPick')closePick()};$('#exPickQ').oninput=renderPick;
  $('#exPick').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closePick()}else if(e.key==='Tab')trap(e,$('#exPick .mxpd'))});
  $('#exEd').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset,i=X.secEd;
    const q=d.lab?`[data-lab="${d.lab}"]`:d.mv?`[data-mv="${d.mv}"]`:null;
    if(d.lab){setLab(i,d.lab)}else if(d.mv){moveEdge(i,d.mv)}else if(d.a==='reset'){resetSecs();return}else if(d.a==='close'){closeSecEd(true);return}
    // the editor was re-rendered: keep the keyboard focus on the same control
    const n=q&&$('#exEd').querySelector(q);if(n&&!n.disabled)n.focus();else{const f=$('#exEd').querySelector('[data-lab].on');if(f)f.focus()}});
  $('#exEd').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeSecEd(true)}});
  document.addEventListener('pointerdown',e=>{const ed=$('#exEd');if(ed&&!ed.hidden&&!ed.contains(e.target)&&!e.target.closest('[data-sec]')&&!e.target.closest('#exTl'))closeSecEd()},true);
  wireTimeline();
  new ResizeObserver(()=>{sizeCanvas();drawSoon()}).observe($('#exTl'));
}
function trap(e,box){const f=[...box.querySelectorAll('button:not([disabled]),input,select')].filter(x=>x.offsetParent);if(!f.length)return;const a=f[0],z=f[f.length-1];
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}

/* ---------- section editing ---------- */
function secChanged(){const s=X.song;s.edited=true;s.lock=phraseLock(s.secs,s.f.s0);replan();renderStats();renderSecs();renderPlan();renderSettings();renderExport();renderTransport();drawSoon()}
function setLab(i,l){const s=X.song;if(!s||!s.secs[i]||!LABS.includes(l))return;s.secs[i].lab=l;secChanged();renderSecEd()}
// move the start ('s-'/'s+') or end ('e-'/'e+') of section i by one bar; neighbours follow, every section keeps ≥ 1 bar
function moveEdge(i,mv){const s=X.song;if(!s)return;const k=mv[0]==='s'?i:i+1,d=mv[1]==='+'?1:-1;if(setEdge(k,s.secs[k]?s.secs[k].a+d:null))renderSecEd()}
function setEdge(k,bar){const s=X.song,S=s.secs;if(k<=0||k>=S.length||bar==null)return false;bar=clamp(Math.round(bar),S[k-1].a+1,S[k].b-1);if(bar===S[k].a)return false;S[k-1].b=bar;S[k].a=bar;secChanged();return true}
function resetSecs(){const s=X.song;if(!s)return;s.secs=s.secs0.map(x=>({...x}));s.edited=false;secChanged();X.song.edited=false;renderSecs();closeSecEd(true)}
function openSecEd(i,from){X.secEd=i;X.secFrom=from||null;renderSecEd();const ed=$('#exEd');ed.hidden=false;placeEd(from);drawSoon();setTimeout(()=>{const b=ed.querySelector('[data-lab].on')||ed.querySelector('button');if(b)b.focus()},20)}
function closeSecEd(refocus){const ed=$('#exEd');if(!ed||ed.hidden){X.secEd=-1;return}ed.hidden=true;const i=X.secEd;X.secEd=-1;drawSoon();if(refocus){const b=document.querySelector(`#exSecs [data-sec="${i}"]`)||X.secFrom;if(b&&document.contains(b))b.focus()}}
function placeEd(from){
  const ed=$('#exEd'),v=$('#extendedView'),vr=v.getBoundingClientRect();let x=vr.left+20,y=window.scrollY+200;
  if(from&&from.getBoundingClientRect){const r=from.getBoundingClientRect();x=r.left;y=r.bottom+window.scrollY+6}
  else if(from&&from.x!=null){x=from.x;y=from.y+window.scrollY+10}
  const w=Math.min(340,vr.width-8);ed.style.width=w+'px';ed.style.left=clamp(x-vr.left,4,Math.max(4,vr.width-w-4))+'px';ed.style.top=(y-(vr.top+window.scrollY))+'px';
}
function renderSecEd(){
  const ed=$('#exEd'),s=X.song,i=X.secEd;if(!ed||!s||i<0||!s.secs[i]){if(ed)ed.hidden=true;return}
  const x=s.secs[i],nm=secNames(s.secs)[i],B=s.g.B;
  ed.innerHTML=`<div class="exedh"><span class="exsw2" style="--c:${rgb(LCOL[x.lab])}"></span><h3 id="exEdH">${esc(t('exSecEdit',{sec:nm}))}</h3><button type="button" class="mxib" data-a="close" aria-label="${esc(t('exClose'))}" title="${esc(t('exClose'))}">${IC.x}</button></div>
  <p class="exedr mono" dir="ltr">${esc(fmtT(srcT(s,x.a)))}–${esc(fmtT(srcT(s,x.b)))} · ${x.a+1}–${x.b} · ${esc(t('exBarsN',{n:x.b-x.a}))}</p>
  <div class="exedl" role="radiogroup" aria-label="${esc(t('exSecType'))}">${LABS.map(l=>`<button type="button" role="radio" aria-checked="${l===x.lab}" class="exlab${l===x.lab?' on':''}" data-lab="${l}" style="--c:${rgb(LCOL[l])}"><i aria-hidden="true"></i>${esc(labName(l))}</button>`).join('')}</div>
  <div class="exedm">
    <div><span>${esc(t('exSecStart'))}</span><span class="exstep" dir="ltr"><button type="button" class="btn ghost" data-mv="s-" aria-label="${esc(t('exSecStart')+': '+t('exEarlier'))}"${i===0||x.a-1<=s.secs[i-1].a?' disabled':''}>−1</button><output class="mono">${x.a+1}</output><button type="button" class="btn ghost" data-mv="s+" aria-label="${esc(t('exSecStart')+': '+t('exLater'))}"${i===0||x.a+1>=x.b?' disabled':''}>+1</button></span></div>
    <div><span>${esc(t('exSecEnd'))}</span><span class="exstep" dir="ltr"><button type="button" class="btn ghost" data-mv="e-" aria-label="${esc(t('exSecEnd')+': '+t('exEarlier'))}"${i===s.secs.length-1||x.b-1<=x.a?' disabled':''}>−1</button><output class="mono">${x.b}</output><button type="button" class="btn ghost" data-mv="e+" aria-label="${esc(t('exSecEnd')+': '+t('exLater'))}"${i===s.secs.length-1||x.b+1>=s.secs[i+1].b?' disabled':''}>+1</button></span></div>
  </div>
  ${s.edited?`<button type="button" class="lnk" data-a="reset">${esc(t('exSecReset'))}</button>`:''}`;
  void B;
}

/* ---------- library picker ---------- */
function openPick(btn){X.pickFrom=btn||null;$('#exPick').hidden=false;$('#exPickQ').value='';renderPick();setTimeout(()=>$('#exPickQ').focus(),30)}
function closePick(){const p=$('#exPick');if(!p||p.hidden)return;p.hidden=true;if(X.pickFrom&&document.contains(X.pickFrom))X.pickFrom.focus();X.pickFrom=null}
function renderPick(){
  const q=$('#exPickQ').value.trim().toLowerCase(),ul=$('#exPickL'),signed=CR.signedIn();
  const list=CR.readLib().filter(x=>x&&x.name&&(!q||String(x.name).toLowerCase().includes(q))),any=list.some(x=>x.file_path);
  $('#exPickN').textContent=!signed||!any?t('exLibEmpty'):'';ul.innerHTML='';
  for(const it of list){
    const ok=signed&&!!it.file_path,li=document.createElement('li');li.className='mxpr'+(ok?'':' dis');
    li.innerHTML='<span class="kbw"></span><div class="mxpt"><div class="tt"></div><div class="ar mono"></div></div><button type="button" class="btn ghost"></button>';
    if(it.key)li.querySelector('.kbw').append(CR.keyBadge({pc:it.key.pc,mode:it.key.mode}));
    li.querySelector('.tt').textContent=it.name;li.querySelector('.tt').dir='auto';
    li.querySelector('.ar').textContent=(it.bpm?`${CR.fmtBpm(Math.round(it.bpm*10)/10)} BPM · `:'')+CR.fmtS(it.dur||0)+(ok?'':` · ${t('exLibNoFile')}`);
    const b=li.querySelector('button');b.textContent=t('exLoad');b.disabled=!ok;b.onclick=()=>{closePick();loadLib(it)};ul.appendChild(li);
  }
}

/* ---------- render: panels ---------- */
function srcBtns(){return [['file','exFile'],['lib','exLib'],['tool','exTool']].map(([a,k])=>`<button type="button" class="btn ghost" data-a="${a}">${IC[a]}<span>${esc(t(k))}</span></button>`).join('')}
function renderSrc(){
  const el=$('#exSrc');if(!el)return;const s=X.song;el.classList.toggle('loaded',!!s||X.stage==='analyzing');el.setAttribute('aria-label',t('exDrop'));
  if(!s&&X.stage!=='analyzing'){
    const row=(l,arr)=>`<div class="exsr0"><span>${esc(t(l))}</span><div class="exsrr">${arr.map(([k,w,x])=>`<i class="${x?'x':''}" style="--c:${rgb(LCOL[k])};flex-grow:${w}"></i>`).join('')}</div></div>`;
    const O=[['intro',2],['verse',2],['build',1],['drop',2],['break',2],['drop',2],['outro',2]];
    el.innerHTML=`<div class="exempty"><div class="exdz"><span class="exdi">${IC.drop}</span><div class="exdt"><b>${esc(t('exDrop'))}</b><span class="snote">${esc(t('exDropH'))}</span></div><div class="mxsrc">${srcBtns()}</div>
      <ol class="exhow">${[1,2,3].map(n=>`<li><span class="mono" dir="ltr">${n}</span>${esc(t('exHow'+n))}</li>`).join('')}</ol></div>
      <div class="exschem">${row('exOrig',O)}${row('exExt',[['intro',4,1],...O.slice(0,4),['drop',1,1],...O.slice(4),['outro',4,1]])}
      <p class="exleg"><span><i aria-hidden="true"></i>${esc(t('exLegO'))}</span><span><i class="x" aria-hidden="true"></i>${esc(t('exLegS'))}</span></p></div></div>`;return;
  }
  if(!s){el.innerHTML=`<div class="exstrip"><span class="exsi">${IC.ext}</span><div class="exsn"><b dir="auto">${esc(X.procName||'')}</b></div><div class="exrepl"><span class="snote">${esc(t('exReplace'))}</span>${srcBtns()}</div></div>`;return}
  const info=CR.sepInfo(),kindL=s.kind==='ai'?t('exStemsAI'):s.kind==='tool'?t('exStemsTool'):t('exStemsQ');
  el.innerHTML=`<div class="exstrip"><span class="exsi">${IC.ext}</span>
    <div class="exsn"><b dir="auto" title="${esc(s.name)}">${esc(s.name)}</b>
      <span class="exkind${s.kind==='quick'?' lo':' ok'}"><i aria-hidden="true"></i>${esc(kindL)}</span></div>
    ${X.sep?`<div class="mxsepp exsepp" role="status"><span class="mxlm"></span><div class="bar"><i></i></div><button type="button" class="btn ghost" data-a="cancelSep">${esc(t('cancel'))}</button></div>`:
      s.kind==='quick'?`<button type="button" class="btn ghost exai" data-a="ai" title="${esc(t('exUpAiT'))}"${info.on&&!info.busy&&X.stage!=='generating'?'':' disabled'}>${IC.ai}<span>${esc(t('exUpAi'))}</span>${info.cost?`<span class="mxcost mono">${esc(t('exCost',{n:info.cost}))}</span>`:''}</button>`:''}
    <div class="exrepl"><span class="snote">${esc(t('exReplace'))}</span>${srcBtns()}</div></div>`;
  if(X.sep)renderSepP();
}
function renderSepP(){const el=$('#exSrc .exsepp');if(!el||!X.sep)return;el.querySelector('.mxlm').textContent=X.sep.msg||'';el.querySelector('.bar i').style.width=Math.round(clamp(X.sep.p,0,1)*100)+'%'}
function renderProc(){
  const el=$('#exProc');if(!el)return;
  const an=X.stage==='analyzing';el.hidden=!an;
  if(an){el.innerHTML=`<h2>${esc(t('exProcH',{n:X.procName||''}))}</h2>${stepList(AN_STEPS)}<div class="bar"><i></i></div><button type="button" class="lnk" data-a="cancelLoad">${esc(t('cancel'))}</button>`;renderProcP()}
  if(X.stage==='generating')renderPlan();
}
function stepList(keys){return `<ol class="exsteps">${keys.map(k=>{const s=X.steps[k]||'todo';return `<li class="${s}"><span class="exsd" aria-hidden="true">${s==='done'?IC.ok:''}</span><span>${esc(t('exS_'+k))}</span><span class="vh">${s==='done'?'✓':s==='run'?'…':''}</span></li>`}).join('')}</ol>`}
function renderProcP(){const p=Math.round(clamp(X.stepP,0,1)*100);document.querySelectorAll('#exProc .bar i,#exPlan .exgbar i').forEach(i=>{i.style.width=p+'%'})}
function renderStats(){
  const el=$('#exStats'),s=X.song;if(!el||!s)return;
  const cell=(k,v,tip,cls)=>`<div class="exst${cls?' '+cls:''}"${tip?` title="${esc(t(tip))}"`:''}><dt>${esc(t(k))}</dt><dd class="mono" dir="ltr">${v}</dd>${tip?`<span class="vh">${esc(t(tip))}</span>`:''}</div>`;
  const meter=x=>`${Math.round(x*100)}<small>%</small><span class="exmeter" aria-hidden="true"><i style="width:${Math.round(x*100)}%"></i></span>`;
  el.innerHTML=cell('exStBpm',esc(CR.fmtBpm(Math.round(s.an.bpm*10)/10)))+`<div class="exst exkey"><dt>${esc(t('exStKey'))}</dt><dd class="mono" dir="ltr"><i class="exkc" aria-hidden="true"></i>${esc(CR.keyText(s.an.key))}</dd></div>`+
    cell('exStLen',esc(fmtD(s.buffer.duration)))+cell('exStBars',String(s.g.nb))+cell('exStGroove',meter(s.groove||0),'exStGrooveT','exm')+cell('exStLock',meter(s.lock||0),'exStLockT','exm');
  {const c=CR.camOf(s.an.key);el.querySelector('.exkc').style.background=CR.camColor(c.n,c.l)}
  if((s.groove||0)<0.3)el.insertAdjacentHTML('beforeend',`<p class="exlow" role="note">${esc(t('exLowGroove'))}</p>`);
}
function renderSecs(){
  const el=$('#exSecs'),s=X.song;if(!el||!s)return;const nm=secNames(s.secs);
  el.innerHTML=s.secs.map((x,i)=>`<button type="button" class="exsc${i===X.secEd?' on':''}" data-sec="${i}" style="--c:${rgb(LCOL[x.lab])}" aria-haspopup="dialog"><i aria-hidden="true"></i><span>${esc(nm[i])}</span><small class="mono" dir="ltr">${x.a+1}–${x.b}</small></button>`).join('')+(s.edited?`<span class="exed1">${esc(t('exEdited'))}</span>`:'');
}
function seg(name,items,cur,attr,label){return `<div class="mxseg exseg" role="radiogroup" aria-label="${esc(label)}">${items.map(([v,l])=>`<button type="button" role="radio" aria-checked="${String(v)===String(cur)}" class="${String(v)===String(cur)?'on':''}" data-${attr}="${v}">${l}</button>`).join('')}</div>`}
function renderSettings(){
  const el=$('#exSet');if(!el||!X.song)return;const S=X.set,busy=X.stage==='generating';
  const opt=(arr,cur,io)=>arr.map(k=>`<option value="${k}"${k===cur?' selected':''}>${esc(t(k==='orig'?(io==='i'?'exSt_origI':'exSt_origO'):'exSt_'+k))}</option>`).join('');
  const focus=document.activeElement&&document.activeElement.id==='exCustom';
  if(focus)return;
  el.innerHTML=`<h2 id="exSetH" data-i="exSetH">${esc(t('exSetH'))}</h2>
  <div class="exfield"><h3>${esc(t('exPreset'))}</h3><div class="expre" role="radiogroup" aria-label="${esc(t('exPreset'))}">${Object.keys(PRESETS).map(k=>`<button type="button" role="radio" aria-checked="${S.preset===k}" class="${S.preset===k?'on':''}" data-ps="${k}"><b>${esc(t('exP_'+k))}</b><span>${esc(t('exP_'+k+'T'))}</span></button>`).join('')}</div></div>
  <div class="exfield"><h3>${esc(t('exLen'))}</h3>${seg('add',[...ADDS.map(a=>[a,'+'+(a<120?esc(t('exSec',{n:a})):esc(t('exMin',{n:a/60})))]),['custom',esc(t('exLenC'))]],S.add,'add',t('exLen'))}
    ${S.add==='custom'?`<label class="exnum"><span>${esc(t('exLenIn'))}</span><input type="number" id="exCustom" class="srch mono" min="0" max="600" step="1" dir="ltr" inputmode="numeric" value="${S.custom}"></label>`:''}</div>
  <div class="exrow2">
    <div class="exfield"><h3>${esc(t('exIntro'))}</h3>${seg('ib',BARN.map(n=>[n,`<span dir="ltr">${n}</span>`]),S.intro,'ib',t('exIntro'))}
      <label class="exsel"><span>${esc(t('exIStyle'))}</span><select class="sel" id="exIS">${opt(STYLES,S.is,'i')}</select></label></div>
    <div class="exfield"><h3>${esc(t('exOutro'))}</h3>${seg('ob',BARN.map(n=>[n,`<span dir="ltr">${n}</span>`]),S.outro,'ob',t('exOutro'))}
      <label class="exsel"><span>${esc(t('exOStyle'))}</span><select class="sel" id="exOS">${opt(STYLES,S.os,'o')}</select></label></div>
  </div>
  <div class="exgen"><button type="button" class="btn solid exgo" data-a="gen"${busy?' disabled':''}>${IC.ext}<span>${esc(t(busy?'exGenBusy':fresh()?'exGenAgain':X.render?'exGenAgain':'exGen'))}</span></button></div>`;
  el.querySelectorAll('button,select,input').forEach(x=>{if(busy&&!x.dataset.a)x.disabled=true});
}
function blkText(b){
  const s=X.song,p=X.plan,nm=secNames(s.secs)[b.sec],n=b.sb-b.sa;
  const stems=b.mask?IDS.filter(id=>b.mask[id]).map(id=>t(id)).join(t('exPlus')):t('exFull');
  const fx=b.ft==='lp'?t(b.fx.f1>b.fx.f0?'exFxOpen':'exFxClose'):b.ft==='hp'?t('exFxHp'):'';
  const why=b.role==='orig'?t('exWhyOrig'):b.role==='intro'?t('exWhyIntro'):b.role==='outro'?t('exWhyOutro'):b.role==='cycle'?t('exWhyCycle'):t('exWhyRep',{sec:nm});
  const ttl=b.role==='orig'?nm:t('exR_'+b.role);   // a made block is titled by its role ("DJ outro"); where it came from goes in the source line
  return {nm,n,stems,fx,why,ttl,head:`${ttl} · ${t('exBarsN',{n})} · ${stems}`,from:t('exFrom',{sec:nm,t:iso(fmtT(srcT(s,b.sa))+'–'+fmtT(srcT(s,b.sb))),b:iso((b.sa+1)+'–'+b.sb)}),at:`${fmtT(outT(p,b.o0))}–${fmtT(outT(p,b.o1))}`};
}
function renderPlan(){
  const el=$('#exPlan'),p=X.plan,s=X.song;if(!el||!s)return;
  if(X.stage==='generating'){
    el.innerHTML=`<h2 id="exPlanH">${esc(t('exGenH'))}</h2>${stepList(STEPS)}<div class="bar exgbar"><i></i></div><button type="button" class="lnk" data-a="cancelGen">${esc(t('exCancel'))}</button>`;renderProcP();return;
  }
  if(!p){el.innerHTML='';return}
  const done=X.stage==='done'&&fresh();
  const sum=t('exPlanSum',{len:iso(fmtD(p.len)),add:fmtAdd(p.added),n:p.blocks.length});
  el.innerHTML=`${done?`<div class="exready" id="exReady"><span class="exok" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/><path d="M14 24.5l7 7 13-14"/></svg></span><div><h2 id="exPlanH">${esc(t('exReady'))}</h2><p dir="auto">${esc(t('exReadyP',{len:iso(fmtD(p.len)),add:fmtAdd(p.added),n:p.blocks.length}))}</p></div></div>`:
    `<div class="explh"><h2 id="exPlanH">${esc(t('exPlanH'))}</h2><p class="snote" dir="auto">${esc(sum)} · ${esc(t('exTarget',{t:fmtAdd(p.target)}))}</p></div>`}
    ${p.over?`<p class="snote exover">${esc(t('exOver',{x:fmtAdd(p.added),t:fmtAdd(p.target)}))}</p>`:''}
    ${X.render&&!fresh()?`<p class="snote exstale">${esc(t('exStale'))}</p>`:''}
    <ol class="exlist" id="exList">${p.blocks.map((b,i)=>{const x=blkText(b),s0=X.song.secs[b.sec];return `<li><button type="button" class="exbk${i===X.sel?' on':''}${b.mask?' st':''}" data-blk="${i}" aria-pressed="${i===X.sel}" style="--c:${rgb(LCOL[s0.lab])}">
      <span class="exbkc" aria-hidden="true"></span><span class="exbkm"><span class="exbkh"><b>${esc(x.ttl)}</b>${b.role==='orig'?`<span class="exrole">${esc(t('exR_orig'))}</span>`:''}</span><span class="exbks">${b.role==='orig'?'':esc(t('exFromS',{sec:x.nm}))+' · '}${esc(t('exBarsN',{n:x.n}))} · ${esc(x.stems)}${x.fx?' · '+esc(x.fx):''}</span></span><span class="exbkt mono" dir="ltr">${esc(x.at)}</span></button></li>`}).join('')}</ol>`;
}
function renderInsp(){
  const el=$('#exInsp'),p=X.plan;if(!el)return;
  if(!p||X.sel<0||!p.blocks[X.sel]){el.innerHTML=`<p class="exhint">${esc(t('exPickBlk'))}</p>`;return}
  const b=p.blocks[X.sel],x=blkText(b),lab=X.song.secs[b.sec].lab;
  el.innerHTML=`<span class="exic" style="--c:${rgb(LCOL[lab])}" aria-hidden="true"></span><div class="exit"><b>${esc(x.head)}</b><span>${esc(x.from)}</span><span class="exwhy">${esc(x.why)}${x.fx?' · '+esc(x.fx):''}</span></div><span class="exat mono" dir="ltr">${esc(x.at)}</span>`;
}
function selectBlock(i,fromList){
  const p=X.plan;if(!p)return;X.sel=i===X.sel&&fromList?-1:i;renderInsp();
  document.querySelectorAll('#exList [data-blk]').forEach(b=>{const on=+b.dataset.blk===X.sel;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
  if(X.pb.loop&&X.pb.playing)playPB(X.pb.which,heardPB());
  if(X.sel>=0){const b=p.blocks[X.sel],v=viewOf();const a=outT(p,b.o0);if(a<v.v0||a>v.v0+v.span){X.view0=a-v.span*0.1}}
  renderTransport();drawSoon();
}
function renderTransport(){
  if(!X.built)return;const P=X.pb,p=X.plan,s=X.song;
  for(const w of ['A','B']){const b=document.querySelector(`#exAB [data-pb="${w}"]`);if(!b)continue;const on=P.playing&&P.which===w,ok=!!pbBuf(w);
    b.querySelector('.ic').innerHTML=on?IC.pause:IC.play;const l=t(on?'exPause':w==='A'?'exPlayO':'exPlayE');b.title=l;b.setAttribute('aria-label',l);
    b.classList.toggle('on',P.which===w);b.classList.toggle('live',on);b.disabled=!ok;b.setAttribute('aria-pressed',String(P.which===w))}
  $('#exTA').textContent=s?fmtD(s.buffer.duration):'';$('#exTB').textContent=p?fmtD(p.len)+(fresh()?'':' · '+t('exPlanned')):'';
  $('#exAB').setAttribute('aria-label',t('exOrig')+' / '+t('exExt'));
  const sw=$('#exSw');sw.disabled=!(s&&fresh());sw.title=t('exABT');sw.setAttribute('aria-label',t('exABT'));
  const lb=$('#exLoop');lb.disabled=X.sel<0;lb.classList.toggle('on',P.loop&&X.sel>=0);lb.setAttribute('aria-pressed',String(P.loop&&X.sel>=0));lb.title=t('exLoopT');
  $('#exStopB').disabled=!P.playing&&!P.pos[P.which];$('#exZi').disabled=X.zoom>=32;$('#exZo').disabled=X.zoom<=1;
  const cv=$('#exCv');if(cv&&s)cv.setAttribute('aria-label',t('exTlAria',{n:s.name,a:fmtD(s.buffer.duration),b:p?fmtD(p.len):'—'}));
  $('#exDeck').setAttribute('aria-label',s?t('exTlAria',{n:s.name,a:fmtD(s.buffer.duration),b:p?fmtD(p.len):'—'}):'');
  timeText();
}
function timeText(){const el=$('#exTime');if(!el)return;const P=X.pb,buf=pbBuf(P.which);el.textContent=buf?`${fmtT(heardPB())} / ${fmtT(buf.duration)}`:''}
function renderExport(){
  const el=$('#exExp');if(!el)return;const p=X.plan,s=X.song,ok=X.stage==='done'&&fresh();el.hidden=!(s&&X.render);if(el.hidden)return;
  const S=X.set,mp3=window.MP3&&MP3.supported;
  el.innerHTML=`<div class="mxexph"><h2 id="exExpH">${esc(t('exExpH'))}</h2><p class="snote" dir="auto">${p?esc(t('exExpP',{len:iso(fmtD(p.len)),bpm:iso(CR.fmtBpm(Math.round(s.an.bpm*10)/10)),k:iso(CR.keyText(s.an.key))})):''}</p></div>
  <div class="mxexpr exexpr">
    ${seg('fm',[['mp3','MP3 320'],['wav16','WAV 16-bit'],['wav24','WAV 24-bit']].filter(x=>x[0]!=='mp3'||mp3),S.fmt==='mp3'&&!mp3?'wav16':S.fmt,'fm',t('exExpH'))}
    <div class="exsr"><span class="snote">${esc(t('exRate'))}</span>${seg('sr',[[44100,'<span dir="ltr">44.1 kHz</span>'],[48000,'<span dir="ltr">48 kHz</span>']],S.sr,'sr',t('exRate'))}</div>
    <label class="mxchk"${S.fmt!=='mp3'?' hidden':''}><input type="checkbox" id="exCuesC"${S.cues?' checked':''}${window.CRATE&&CRATE.tagMp3?'':' disabled'}><span>${esc(t('exCues'))}</span></label>
    <button type="button" class="btn solid" data-a="exp"${ok&&!X.exporting?'':' disabled'}>${IC.dl}<span>${esc(t('exExpBtn'))}</span></button>
  </div>
  <div class="mxprog" id="exExpProg"${X.exporting?'':' hidden'}><div class="bar"><i></i></div></div>
  <p class="snote mxexpmsg" id="exExpMsg" role="status" aria-live="polite">${ok?'':esc(t('exNeedGen'))}</p>`;
  el.querySelectorAll('[data-fm],[data-sr],#exCuesC').forEach(x=>{if(X.exporting)x.disabled=true});
}
function renderAll(){
  if(!X.built)return;const s=X.song,an=X.stage==='analyzing';
  renderSrc();setMsg(X.msg,X.msgErr);renderProc();
  $('#exMain').hidden=!s||an;
  if(s&&!an){renderStats();renderSecs();renderSettings();renderPlan();renderInsp();renderTransport();renderExport();sizeCanvas();drawSoon()}
  if(X.secEd>=0)renderSecEd();
}

/* ---------- timeline (one canvas: original lane, links, extended lane) ---------- */
const TL={W:0,H:0,dpr:1,dirty:true,raf:0,lay:null};
function layout(){const m=TL.W<560,wv=m?40:62,bd=m?16:18,lk=m?26:36,lb=16;let y=4;const L={};
  L.ru=[y,16];y+=18;L.la=[y,lb];y+=lb;L.ba=[y,bd];y+=bd+2;L.wa=[y,wv];y+=wv;L.lk=[y,lk];y+=lk;L.lb=[y,lb];y+=lb;L.bb=[y,bd];y+=bd+2;L.wb=[y,wv];y+=wv+6;L.h=y;return L}
function sizeCanvas(){
  const box=$('#exTl');if(!box||!box.clientWidth)return;const d=Math.min(2,window.devicePixelRatio||1),w=box.clientWidth;TL.W=w;TL.lay=layout();const h=TL.lay.h;
  box.style.height=h+'px';TL.H=h;TL.dpr=d;for(const id of ['#exCv','#exOv']){const cv=$(id);cv.width=Math.round(w*d);cv.height=Math.round(h*d);cv.style.height=h+'px'}TL.dirty=true;
}
function total(){const s=X.song,p=X.plan;return Math.max(s?s.buffer.duration:1,p?p.len:1)}
function viewOf(){const T=total(),span=T/X.zoom;X.view0=clamp(X.view0,0,Math.max(0,T-span));return {v0:X.view0,span}}
const xOf=(v,x)=>(x-v.v0)/v.span*TL.W;
function tok(n){return getComputedStyle($('#extendedView')).getPropertyValue(n).trim()}
function cols(){return {line:tok('--deckline')||'#2A2A31',lane:tok('--deck2')||'#141418',text:tok('--deckmuted')||'#8B8B93',hi:tok('--decktext')||'#EDEDEF',mono:tok('--mono'),sans:tok('--sans')}}
function drawSoon(){TL.dirty=true;kick()}
function kick(){if(!TL.raf&&X.visible)TL.raf=requestAnimationFrame(frame)}
function frame(){
  TL.raf=0;if(!X.visible||!X.song||!TL.lay)return;
  const P=X.pb;if(P.playing&&X.zoom>1){const v=viewOf(),h=heardPB(),hx=P.which==='A'?h:h;if(hx>v.v0+v.span*0.92||hx<v.v0){X.view0=hx-v.span*0.08;TL.dirty=true}}
  if(TL.dirty){TL.dirty=false;drawStatic()}
  drawHead();timeText();beatTick();
  const anim=X.fin&&performance.now()-X.fin<1600&&!reduced();
  if(P.playing||X.drag||anim)kick();
}
function waveCols(g,w,y,h,v,map,alpha,scale){
  // map(xTime) → source time or null; draws the RGB waveform like the tool
  const mid=y+h/2,px=v.span/TL.W;g.globalAlpha=alpha;
  for(let x=0;x<TL.W;x++){const ta=v.v0+x*px,m=map(ta,ta+px);if(!m)continue;const [pa,pb,sc]=m;
    const i0=Math.max(0,Math.floor(pa*w.rate)),i1=Math.min(w.len,Math.max(i0+1,Math.ceil(pb*w.rate)));if(i0>=w.len||i1<=0)continue;
    const r=CR.sliceRange(w,i0,i1),a=r[0]*(sc==null?1:sc)*(scale||1),bi=r[4],hh=Math.max(0.6,a*(h/2-1));
    g.fillStyle=CR.wcol(w.col[bi*3],w.col[bi*3+1],w.col[bi*3+2]);g.fillRect(x,mid-hh,1,hh*2)}
  g.globalAlpha=1;
}
const maskScale=m=>m?Math.min(1,0.15+(m.drums?0.45:0)+(m.bass?0.25:0)+(m.other?0.25:0)+(m.vocals?0.25:0)):1;
function rr(g,x,y,w,h,r){g.beginPath();if(g.roundRect)g.roundRect(x,y,w,h,r);else g.rect(x,y,w,h)}
function drawStatic(){
  const cv=$('#exCv'),s=X.song,p=X.plan,L=TL.lay;if(!cv||!TL.W||!s)return;
  const g=cv.getContext('2d'),c=cols(),v=viewOf(),d=TL.dpr;g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,TL.W,TL.H);
  g.textAlign='left';try{g.direction=document.documentElement.dir==='rtl'?'rtl':'ltr'}catch(e){}   // words shape and order like the page; positions stay on the LTR timeline
  const B=s.g.B,small=TL.W<560;
  // lanes
  for(const k of ['ba','wa','bb','wb']){g.fillStyle=c.lane;g.fillRect(0,L[k][0],TL.W,L[k][1])}
  // ruler: extended bars
  const rb=p?p.P:s.g.fd,barPx=B/v.span*TL.W,every=[1,2,4,8,16,32,64].find(n=>n*barPx>=36)||64;
  g.font='10px '+c.mono;g.textBaseline='middle';
  const k0=Math.floor((v.v0-rb)/B),k1=Math.ceil((v.v0+v.span-rb)/B);
  for(let k=Math.max(0,k0);k<=k1;k++){const x=Math.round(xOf(v,rb+k*B))+0.5;if(x<-1||x>TL.W+1)continue;const strong=mod(k,4)===0;
    g.fillStyle=c.line;g.globalAlpha=strong?0.9:0.4;if(barPx>3||strong){g.fillRect(x,L.bb[0],1,L.wb[0]+L.wb[1]-L.bb[0])}g.globalAlpha=1;
    if(mod(k,every)===0){g.fillStyle=c.text;g.fillRect(x,L.ru[0]+10,1,6);g.fillText(String(k+1),x+3,L.ru[0]+7)}}
  // original lane grid (lighter)
  {const k0a=Math.floor((v.v0-s.g.fd)/B),k1a=Math.ceil((v.v0+v.span-s.g.fd)/B);g.fillStyle=c.line;
    for(let k=Math.max(0,k0a);k<=Math.min(s.g.nb,k1a);k++){if(barPx<=3&&mod(k,4))continue;const x=Math.round(xOf(v,srcT(s,k)))+0.5;g.globalAlpha=mod(k,4)?0.35:0.8;g.fillRect(x,L.ba[0],1,L.wa[0]+L.wa[1]-L.ba[0])}g.globalAlpha=1}
  // lane titles
  g.font='600 11px '+c.sans;g.fillStyle=c.hi;g.textBaseline='middle';
  const ttl=(y,txt,sub)=>{g.fillStyle=c.hi;g.fillText(txt,2,y+8);const w=g.measureText(txt).width;g.fillStyle=c.text;g.font='10.5px '+c.mono;g.fillText(sub,w+10,y+8);g.font='600 11px '+c.sans};
  ttl(L.la[0],t('exOrig'),`${fmtD(s.buffer.duration)} · ${t('exBarsN',{n:s.g.nb})}`);
  if(p)ttl(L.lb[0],t('exExt'),`${fmtD(p.len)} · ${t('exBarsN',{n:p.bars})}${fresh()?'':' · '+t('exPlanned')}`);
  // original sections
  const nm=secNames(s.secs);
  s.secs.forEach((x,i)=>{const x0=xOf(v,srcT(s,x.a)),x1=xOf(v,srcT(s,x.b));if(x1<0||x0>TL.W)return;const col=LCOL[x.lab];
    g.fillStyle=rgb(col);g.globalAlpha=0.92;rr(g,x0+1,L.ba[0]+1,Math.max(1,x1-x0-2),L.ba[1]-2,3);g.fill();g.globalAlpha=1;
    if(i===X.secEd||(X.sel>=0&&p&&p.blocks[X.sel]&&p.blocks[X.sel].sec===i)){g.strokeStyle='#fff';g.lineWidth=1.5;rr(g,x0+1,L.ba[0]+1,Math.max(1,x1-x0-2),L.ba[1]-2,3);g.stroke()}
    g.font='600 '+(small?9.5:10.5)+'px '+c.sans;if(g.measureText(nm[i]).width<x1-x0-10){g.fillStyle='#0A0A0C';g.fillText(nm[i],x0+6,L.ba[0]+L.ba[1]/2+0.5)}});
  // original waveform
  if(s.an.wave){const dur=s.buffer.duration;waveCols(g,s.an.wave,L.wa[0],L.wa[1],v,(a,b)=>a>dur?null:[a,Math.min(b,dur)],1)}
  if(!p)return;
  // links: each block ← its source range
  const yA=L.wa[0]+L.wa[1],yB=L.lb[0];
  const show=X.reveal===Infinity?p.blocks.length:X.reveal;
  p.blocks.forEach((b,i)=>{if(i>=show)return;const col=LCOL[s.secs[b.sec].lab],on=i===X.sel||i===X.hover;if(X.sel>=0&&!on&&X.hover<0&&i!==X.sel){}
    const a0=xOf(v,srcT(s,b.sa)),a1=xOf(v,srcT(s,b.sb)),b0=xOf(v,outT(p,b.o0)),b1=xOf(v,outT(p,b.o1));if(Math.max(a1,b1)<0||Math.min(a0,b0)>TL.W)return;
    const my=(yA+yB)/2;g.beginPath();g.moveTo(a0,yA);g.bezierCurveTo(a0,my,b0,my,b0,yB);g.lineTo(b1,yB);g.bezierCurveTo(b1,my,a1,my,a1,yA);g.closePath();
    g.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},${on?0.42:X.sel>=0?0.05:b.role==='orig'?0.07:0.14})`;g.fill();
    if(on){g.strokeStyle=rgb(col);g.lineWidth=1;g.stroke()}});
  // extended blocks
  const rw=fresh()?X.rwave:null;
  p.blocks.forEach((b,i)=>{if(i>=show)return;const x0=xOf(v,outT(p,b.o0)),x1=xOf(v,outT(p,b.o1));if(x1<0||x0>TL.W)return;const col=LCOL[s.secs[b.sec].lab];
    g.fillStyle=rgb(col);g.globalAlpha=b.mask?0.62:0.92;rr(g,x0+1,L.bb[0]+1,Math.max(1,x1-x0-2),L.bb[1]-2,3);g.fill();g.globalAlpha=1;
    if(b.mask){g.save();rr(g,x0+1,L.bb[0]+1,Math.max(1,x1-x0-2),L.bb[1]-2,3);g.clip();g.strokeStyle='rgba(10,10,12,.35)';g.lineWidth=2;for(let q=x0-L.bb[1];q<x1;q+=7){g.beginPath();g.moveTo(q,L.bb[0]+L.bb[1]);g.lineTo(q+L.bb[1],L.bb[0]);g.stroke()}g.restore()}
    if(i===X.sel){g.strokeStyle='#fff';g.lineWidth=2;rr(g,x0+1,L.bb[0]+1,Math.max(1,x1-x0-2),L.bb[1]-2,3);g.stroke()}
    const bl=b.role==='intro'||b.role==='outro'?t('exR_'+b.role):nm[b.sec];g.font='600 '+(small?9.5:10.5)+'px '+c.sans;if(g.measureText(bl).width<x1-x0-10){g.fillStyle='#0A0A0C';g.fillText(bl,x0+6,L.bb[0]+L.bb[1]/2+0.5)}
    if(!rw&&s.an.wave){const sc=maskScale(b.mask),a=outT(p,b.o0),z=outT(p,b.o1),sa=srcT(s,b.sa);
      g.save();g.beginPath();g.rect(x0,L.wb[0],x1-x0,L.wb[1]);g.clip();waveCols(g,s.an.wave,L.wb[0],L.wb[1],v,(ta,tb)=>tb<a||ta>z?null:[sa+(ta-a),sa+(tb-a),sc],fresh()?1:0.5);g.restore()}
  });
  if(rw){waveCols(g,rw,L.wb[0],L.wb[1],v,(a,b)=>a>p.len?null:[a,Math.min(b,p.len)],1)}
  // loop range
  const lp=X.pb.loop&&loopRange(X.pb.which);if(lp){const isA=X.pb.which==='A',y0=isA?L.ba[0]:L.bb[0],y1=isA?L.wa[0]+L.wa[1]:L.wb[0]+L.wb[1];const x0=xOf(v,lp[0]),x1=xOf(v,lp[1]);g.fillStyle='rgba(255,176,32,.14)';g.fillRect(x0,y0,x1-x0,y1-y0);g.fillStyle=tok('--warn')||'#FFB020';g.fillRect(x0,y0-3,x1-x0,2)}
}
function drawHead(){
  const cv=$('#exOv'),s=X.song,p=X.plan,L=TL.lay;if(!cv||!TL.W||!s)return;
  const g=cv.getContext('2d'),d=TL.dpr,v=viewOf();g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,TL.W,TL.H);
  // finish sweep over the extended lane
  if(X.fin&&!reduced()){const e=(performance.now()-X.fin)/1400;if(e<1){const x=e*TL.W*1.3-TL.W*0.15,gr=g.createLinearGradient(x-120,0,x+40,0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(0.8,'rgba(255,255,255,.28)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,L.bb[0],TL.W,L.wb[0]+L.wb[1]-L.bb[0])}}
  if(X.drag&&X.drag.kind==='edge'&&X.drag.bar!=null){const x=xOf(v,srcT(s,X.drag.bar));g.fillStyle='#fff';g.fillRect(Math.round(x)-1,L.ba[0]-2,2,L.wa[0]+L.wa[1]-L.ba[0]+4)}
  const P=X.pb,h=heardPB();
  const mark=(x,y0,y1,solid)=>{if(x<0||x>TL.W)return;g.fillStyle=solid?'#fff':'rgba(255,255,255,.45)';g.fillRect(Math.round(x)-0.5,y0,solid?2:1,y1-y0);if(solid){g.beginPath();g.moveTo(x-5,y0);g.lineTo(x+6,y0);g.lineTo(x+0.5,y0+6);g.fill()}};
  const xa=xOf(v,P.which==='A'?h:extToSrc(h)),xb=xOf(v,P.which==='B'?h:srcToExt(h));
  if(P.playing||h>0||P.which){mark(xa,L.ba[0],L.wa[0]+L.wa[1],P.which==='A');if(p)mark(xb,L.bb[0],L.wb[0]+L.wb[1],P.which==='B'&&!!pbBuf('B'))}
}
let lastBeat=null;
function beatTick(){const P=X.pb,s=X.song;if(!P.playing||!s){lastBeat=null;return}const h=heardPB(),base=P.which==='A'?s.g.fd:X.plan?X.plan.P:0,b=Math.floor((h-base)/s.g.T+1e-4);
  if(b!==lastBeat){const first=lastBeat==null;lastBeat=b;if(!first&&h>=base){const bar=mod(b,4)===0;if(window.A11Y&&A11Y.beat)A11Y.beat(bar);if(window.BG)BG.pulse(bar?0.7:0.35)}}}
function zoom(f){const v=viewOf(),mid=X.pb.playing?heardPB():v.v0+v.span/2;X.zoom=clamp(X.zoom*f,1,32);const ns=total()/X.zoom;X.view0=clamp(mid-ns/2,0,Math.max(0,total()-ns));renderTransport();drawSoon()}
function hitAt(e){
  const box=$('#exTl'),r=box.getBoundingClientRect(),L=TL.lay,v=viewOf(),x=e.clientX-r.left,y=e.clientY-r.top,tm=v.v0+x/r.width*v.span,s=X.song,p=X.plan;
  const inR=k=>y>=L[k][0]-1&&y<L[k][0]+L[k][1]+1;
  if(inR('ba')||inR('la')){const i=s.secs.findIndex(q=>tm>=srcT(s,q.a)&&tm<srcT(s,q.b));
    for(let k=1;k<s.secs.length;k++){const ex=xOf(v,srcT(s,s.secs[k].a));if(Math.abs(ex-x)<=6)return {zone:'edge',k,tm,x,y}}
    return {zone:'sec',i,tm,x,y}}
  if(inR('wa'))return {zone:'wa',tm,x,y};
  if(p&&(inR('bb')||inR('lb')||inR('lk')))return {zone:'blk',i:p.blocks.findIndex(b=>tm>=outT(p,b.o0)&&tm<outT(p,b.o1)),tm,x,y};
  if(p&&inR('wb'))return {zone:'wb',tm,x,y,i:p.blocks.findIndex(b=>tm>=outT(p,b.o0)&&tm<outT(p,b.o1))};
  return {zone:'none',tm,x,y};
}
function wireTimeline(){
  const box=$('#exTl'),tip=$('#exTip');
  box.addEventListener('pointerdown',e=>{
    if(!X.song||e.button>0)return;const h=hitAt(e);
    if(h.zone==='edge'){box.setPointerCapture(e.pointerId);e.preventDefault();X.drag={kind:'edge',k:h.k,bar:X.song.secs[h.k].a};closeSecEd();kick();return}
    X.drag={kind:'click',h,x:e.clientX};
  });
  box.addEventListener('pointermove',e=>{
    if(!X.song||!TL.lay)return;const d=X.drag;
    if(d&&d.kind==='edge'){const h=hitAt(e),s=X.song;d.bar=clamp(Math.round((h.tm-s.g.fd)/s.g.B),s.secs[d.k-1].a+1,s.secs[d.k].b-1);kick();return}
    const h=hitAt(e);box.style.cursor=h.zone==='edge'?'col-resize':h.zone==='sec'||h.zone==='blk'?'pointer':h.zone==='wa'||h.zone==='wb'?'text':'default';
    const hv=h.zone==='blk'||h.zone==='wb'?h.i:-1;
    if(hv!==X.hover){X.hover=hv;drawSoon()}
    if(hv>=0&&X.plan&&(X.reveal===Infinity||hv<X.reveal)){const x=blkText(X.plan.blocks[hv]);tip.innerHTML=`<b>${esc(x.head)}</b><span>${esc(x.from)}</span><span class="exwhy">${esc(x.why)}${x.fx?' · '+esc(x.fx):''}</span>`;tip.hidden=false;
      const r=box.getBoundingClientRect(),tw=tip.offsetWidth;tip.style.left=clamp(h.x+12,4,r.width-tw-4)+'px';tip.style.top=(TL.lay.lk[0]-4)+'px'}
    else tip.hidden=true;
  });
  box.addEventListener('pointerleave',()=>{tip.hidden=true;if(X.hover>=0){X.hover=-1;drawSoon()}});
  const end=e=>{
    const d=X.drag;if(!d)return;X.drag=null;
    if(d.kind==='edge'){if(d.bar!=null)setEdge(d.k,d.bar);drawSoon();return}
    if(Math.abs(e.clientX-d.x)>4)return;const h=d.h;
    if(h.zone==='sec'&&h.i>=0)openSecEd(h.i,{x:e.clientX,y:e.clientY});
    else if(h.zone==='wa')seekPB('A',h.tm);
    else if(h.zone==='blk'&&h.i>=0)selectBlock(h.i);
    else if(h.zone==='wb'){if(pbBuf('B'))seekPB('B',h.tm);else if(h.i>=0)selectBlock(h.i)}
  };
  box.addEventListener('pointerup',end);box.addEventListener('pointercancel',()=>{X.drag=null;drawSoon()});
  box.addEventListener('wheel',e=>{if(X.zoom<=1)return;e.preventDefault();const v=viewOf();X.view0=clamp(X.view0+(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)/600*v.span,0,total()-v.span);drawSoon()},{passive:false});
}
function finAnim(){X.fin=performance.now();if(reduced())X.fin=0;kick()}

/* ---------- export ---------- */
function wavBytes(L,R,sr,bits){
  const n=L.length,bps=bits/8,blk=2*bps,size=n*blk,buf=new ArrayBuffer(44+size),v=new DataView(buf);
  const w4=(o,s)=>{for(let i=0;i<4;i++)v.setUint8(o+i,s.charCodeAt(i))};
  w4(0,'RIFF');v.setUint32(4,36+size,true);w4(8,'WAVE');w4(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*blk,true);v.setUint16(32,blk,true);v.setUint16(34,bits,true);w4(36,'data');v.setUint32(40,size,true);
  if(bits===16){const pcm=new Int16Array(buf,44,n*2);for(let i=0,j=0;i<n;i++){pcm[j++]=clamp(L[i],-1,1)*32767;pcm[j++]=clamp(R[i],-1,1)*32767}}
  else{const u=new Uint8Array(buf,44);let o=0;for(let i=0;i<n;i++)for(const x of [L[i],R[i]]){let q=Math.round(clamp(x,-1,1)*8388607);if(q<0)q+=16777216;u[o++]=q&255;u[o++]=(q>>8)&255;u[o++]=(q>>16)&255}}
  return new Uint8Array(buf);
}
function fileBase(name){const m=String(name).split(/\s[-–—]\s/);const base=m.length>=2?`${m[0].trim()} - ${m.slice(1).join(' - ').trim()}`:String(name).trim();return (base+' (Extended Mix)').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').slice(0,180)}
// cue points of the NEW arrangement (seconds): intro = 0, first drop/chorus of the original body, DJ outro / last outro
function newCues(){
  const p=X.plan,s=X.song,out=[{k:'intro',t:0}];if(!p)return out;
  const dr=p.blocks.find(b=>b.role==='orig'&&['drop','chorus'].includes(s.secs[b.sec].lab));if(dr)out.push({k:'drop',t:outT(p,dr.o0)});
  const oz=p.blocks.find(b=>b.role==='outro')||p.blocks.find(b=>b.role==='orig'&&s.secs[b.sec].lab==='outro');if(oz)out.push({k:'outro',t:outT(p,oz.o0)});
  return out.map(c=>({k:c.k,t:Math.round(c.t*1000)/1000}));
}
async function exportExt(){
  if(X.exporting)return;const s=X.song,p=X.plan;if(!s||!p||!fresh()){setExp(t('exNeedGen'),true);return}
  X.exporting=true;stopPB(true);renderExport();const prog=q=>{const i=$('#exExpProg .bar i');if(i)i.style.width=Math.round(clamp(q,0,1)*100)+'%'};prog(0);setExp(t('exRendering',{p:0}));
  try{
    const S=X.set,mp3=S.fmt==='mp3'&&window.MP3&&MP3.supported;
    let buf=X.render;if(buf.sampleRate!==S.sr){buf=await renderAudio(s,p,S.sr,q=>{prog(q*0.5);setExp(t('exRendering',{p:Math.round(q*50)}))})}
    const L=buf.getChannelData(0),R=buf.getChannelData(1),sr=buf.sampleRate,base=fileBase(s.name),kn=CR.keyName(s.an.key.pc,s.an.key.mode,true),bpmS=String(Math.round(s.an.bpm*100)/100);
    let data,ext;
    if(mp3){
      const nm=String(s.name).split(/\s[-–—]\s/),title=(nm.length>=2?nm.slice(1).join(' - '):s.name)+' (Extended Mix)',artist=nm.length>=2?nm[0]:'';
      data=await MP3.encode(L,R,sr,{kbps:320,tags:{title,artist,bpm:s.an.bpm,key:kn},onProgress:q=>{prog(0.5+q*0.5);setExp(t('encoding',{p:Math.round(q*100)}))}});ext='mp3';
      if(S.cues&&window.CRATE&&CRATE.tagMp3){try{data=CRATE.tagMp3(data,{bpm:bpmS,key:kn,cam:'',cues:newCues()})}catch(e){console.warn(e)}}
    }else{data=wavBytes(L,R,sr,S.fmt==='wav24'?24:16);ext='wav'}
    const fname=base+'.'+ext,blob=new Blob([data],{type:mp3?'audio/mpeg':'audio/wav'});
    CR.saveBlob(blob,fname);prog(1);
    CR.log('extended_export',`${s.name} · ${fmtD(p.len)} (+${Math.round(p.added)} s) · ${t('exP_'+S.preset)} · ${ext}${ext==='wav'?' '+(S.fmt==='wav24'?24:16):''} · ${sr}`);
    X.lastExport={name:fname,size:blob.size,sr,n:L.length,fmt:S.fmt};
    setExp(t('exDone',{f:fname,s:(blob.size/1048576).toFixed(1)}));
  }catch(e){console.error(e);setExp(e&&/MP3/.test(String(e.message))?t('mp3Fail'):t('exExpFail'),true)}
  finally{X.exporting=false;if(!X.visible){freeMem();return}   // the view was left while exporting: free now (hide() skipped it)
    const m=$('#exExpMsg'),keep=m?[m.textContent,m.classList.contains('err')]:null;renderExport();if(keep)setExp(keep[0],keep[1])}
}
function setExp(m,err){const el=$('#exExpMsg');if(!el)return;el.textContent=m||'';el.classList.toggle('err',!!err)}

/* ---------- keys ---------- */
document.addEventListener('keydown',e=>{
  if(!X.visible||!X.song||e.metaKey||e.ctrlKey||e.altKey)return;
  if(!$('#exPick').hidden||!$('#exEd').hidden)return;
  if(e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(document.querySelector('.rm-panel:not([hidden]),#authDlg:not([hidden])')&&e.target.closest('.rm-panel,#authDlg'))return;
  const P=X.pb;
  if(e.code==='Space'){if(e.target.closest('button,label,a'))return;e.preventDefault();togglePB()}
  else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){if(e.target.closest('.exset,.explan'))return;const buf=pbBuf(P.which);if(!buf)return;e.preventDefault();seekPB(P.which,heardPB()+(e.key==='ArrowRight'?1:-1)*X.song.g.B)}
  else if(e.key==='t'||e.key==='T')abSwitch();
  else if(e.key==='l'||e.key==='L')loopToggle();
});

/* ---------- public ---------- */
function freeMem(){
  const s=X.song;if(s&&s.kind==='quick'){s.stems=null}     // AI stems cost points: kept for the current song; the tool's stay with the tool
  if(s){s.F=null}X.render=null;X.rwave=null;if(X.stage==='done')X.stage='ready';
}
document.addEventListener('cr-user',e=>setOwner(e.detail&&e.detail.uid));
{const u=CR.user&&CR.user();if(u&&u.known)setOwner(u.uid)}
window.EXTENDED={
  show(){if(X.owner===undefined){const u=CR.user();setOwner(u&&u.uid)}if(!X.built)build();X.visible=true;CR.stopTool();renderAll();requestAnimationFrame(()=>{sizeCanvas();drawSoon()})},
  hide(){if(!X.visible)return;X.visible=false;stopPB(true);closePick();closeSecEd();if(X.stage==='generating')abortGen();if(!X.exporting)freeMem();const z=$('#exSrc');if(z)z.classList.remove('over')},
  lang(){if(X.built){renderAll();if(X.secEd>=0)renderSecEd()}},
  // for tests
  _X:X,makePlan,renderAudio,segment,label,groove,phraseLock,srcT,outT,extToSrc,srcToExt,newCues,generate,exportExt,loadSong,
  _plan:()=>X.plan,_secs:()=>X.song&&X.song.secs,_heard:heardPB,_tl:()=>({lay:TL.lay,W:TL.W,view:viewOf()}),_srcBar:x=>srcT(X.song,x),_outBar:x=>outT(X.plan,x)
};
CR.applyLang();
if($('#extendedView')&&!$('#extendedView').hidden)EXTENDED.show();
})();
