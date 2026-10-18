/*
 * Mashup Studio (#mashup): the vocals of song A over the instrumental of song B, matched automatically.
 * Talks to the app only through window.CR (bridge at the end of app.js). Settings (never audio) are kept per account in
 * localStorage `chordroom.mashup.v1:<uid|guest>`; separated stems are cached in memory for the session.
 *
 * Model (every "out" time is seconds on the mashup timeline; B starts at out 0):
 *   T       target tempo: B's (default), A's, or typed
 *   k, r    per slot: k ∈ {1, 2, ½} = how the song's beat is counted (half/double aware, like CR.bpmFit),
 *           r = T / (bpm·k) = playback speed
 *   B       pB(out) = out·rB. Timeline bars: bar0 = B's first downbeat / rB, one bar = 240 / T s
 *   A       its vocal start vA (source seconds, on one of A's own bars) sits on bar `align` of B (+ nudge seconds):
 *           anchor = bar0 + align·bar + nudge,  pA(out) = vA + (out − anchor)·rA
 *           vA from the vocals stem = the onset's beat; an entry on beat 2/3 of A's bar moves A's downbeat there (see vocalStart)
 *   free    "Free move" mode: dragging / arrow keys change nudge with no snapping (0.01 ms steps); moving B by d = A by −d
 *   zoom    wheel / pinch around the pointer, down to 0.2 s across the timeline (ruler: bars → beats → 16ths → ms)
 *   key     A is moved by `semis` (auto: the smallest shift that makes A the same Camelot key as B or its relative,
 *           i.e. B's key or its relative major/minor); B keeps its key. Pitch sent to the stretcher = semis − 12·log2(r).
 * Audio graph per slot: stem sources (playbackRate r) → stem gain → fade gain → Signalsmith Stretch (or a delay of the
 * same latency when that slot needs no tempo/key change, so A and B always line up) → level → master → limiter.
 * Export renders the same graph in an OfflineAudioContext (no limiter, normalised only when it would clip) and cuts
 * the stretcher latency off the front → WAV (CR.wav) or MP3 320 (window.MP3).
 * Studio (assets/mashup-fx.js = window.MXFX): after the stretcher each slot runs through MXFX.chain (EQ → filter → comp →
 * saturation → chorus → reverb/echo sends, + compare bypass) → level (vol × solo/mute) → master → width (→ limiter live).
 * Regions (see "regions") replace the single clip: schedule() plays runs of regions with their envelopes, B's auto-duck
 * curve (pre-stretch gain), chorus LFO phase + echo throws + transitions on the post-FX latency (G.pl), whole-sample starts.
 */
(function(){
'use strict';
const CR=window.CR;if(!CR||!window.MXFX)return;
const {t,$,esc,mod}=CR;

/* ---------- strings (he / en / ar / ru / es) ---------- */
CR.addStrings({
he:{navMashup:'מאשאפ',mxEyebrow:'שירה × ביט · התאמה אוטומטית',mxTitle:'סטודיו מאשאפ',
  mxSub:'לוקחים את השירה משיר אחד ואת הביט משיר אחר. אנחנו מתאימים קצב, סולם ותיבות אוטומטית, ואתם מאזינים, מכווננים ומייצאים.',
  mxStep1H:'טוענים את השירה (A)',mxStep1P:'שיר שאתם אוהבים את השירה שלו. מקובץ, מ״השירים שלי״ או מהכלי.',
  mxStep2H:'טוענים את הביט (B)',mxStep2P:'השיר שהנגינה שלו תחזיק את המאשאפ.',
  mxStep3H:'מתאימים, מאזינים, מייצאים',mxStep3P:'הקצב, הסולם והתיבות מסתדרים לבד. מכווננים ומייצאים ל־WAV או ל־MP3.',
  mxSlotA:'A · שירה',mxSlotB:'B · ביט',mxDrop:'גררו לכאן שיר',mxDropH:'MP3, WAV, M4A, FLAC, OGG',
  mxFile:'קובץ',mxLib:'השירים שלי',mxTool:'מהכלי',mxReplaceL:'החלפה:',mxClear:'הסרת השיר',mxSwap:'החלפה בין A ל־B',
  mxDecoding:'קורא את הקובץ…',mxAnalyzing:'מנתח… {p}%',mxCues:'מזהה את מבנה השיר…',mxNoTool:'קודם צריך לפתוח שיר בכלי.',
  mxLibT:'השירים שלי',mxLibSearch:'חיפוש',mxLibEmpty:'עדיין אין שירים שמורים עם קובץ. שירים שמעלים בכלי (מחוברים) מופיעים כאן.',mxLibNoFile:'אין קובץ שמור',mxLibNone:'אין שירים תואמים',mxLoadTo:'לטעון ל־{s}',mxClose:'סגירה',
  mxFull:'השיר המלא (לא מופרד)',mxFullHintA:'כרגע מתנגן השיר כולו. הפרידו אותו כדי להשאיר רק את השירה.',mxFullHintB:'כרגע מתנגן השיר כולו, כולל השירה שלו. הפרידו אותו כדי לקבל ביט נקי.',
  mxSepAI:'הפרדה ב־AI',mxSepQuick:'הפרדה מהירה',mxQuickT:'חינם ומהיר, אבל באיכות נמוכה יותר: יהיו דליפות בין הערוצים.',mxCost:'{n} נקודות',
  mxAiStems:'ערוצי AI',mxQuickStems:'ערוצים מהירים · איכות נמוכה יותר',mxToolStems:'ערוצים מהכלי',mxCached:'כבר הופרד בביקור הזה',
  mxSepFail:'ההפרדה לא הצליחה: {m}',mxSepBusy:'הפרדה אחרת רצה עכשיו. חכו שתסתיים.',mxMute:'השתקה',mxUse:'שימוש: {s}',mxGain:'עוצמה: {s}',
  mxHalfT:'חצי BPM',mxDoubleT:'כפול BPM',mxVocalAt:'השירה נכנסת בתיבה {n}',
  mxMatchH:'התאמה אוטומטית',mxTempoL:'קצב',mxTempoB:'הקצב של B',mxTempoA:'הקצב של A',mxTempoC:'אחר',mxTempoIn:'BPM יעד',
  mxKeyL:'סולם',mxKeyBest:'אותו סולם',mxKeyRel:'הסולם המקביל',mxKeyFifth:'סולם שכן',mxKeyOrig:'מקורי',mxSemi:'{n} חצאי טון',mxKeyDown:'חצי טון למטה',mxKeyUp:'חצי טון למעלה',
  mxAlignH:'יישור',mxAlignL:'השירה של A נכנסת ב',mxBar:'תיבה {n}',mxEarlier:'מוקדם יותר: {x}',mxLater:'מאוחר יותר: {x}',mxUBar:'תיבה',mxUBeat:'פעמה',mxUMs:'10 מילישניות',
  mxReset:'איפוס',mxOffset:'היסט {ms} ms',mxFadeIn:'כניסה הדרגתית',mxFadeOut:'יציאה הדרגתית',mxFade0:'בלי',mxFadeBeat:'פעמה',mxFadeBar:'תיבה',mxFadeBars:'{n} תיבות',
  mxStartA:'A מתחיל',mxStartAll:'מההתחלה',mxStartPre:'תיבה לפני השירה',mxStartVoc:'בדיוק בשירה',
  mxScore:'התאמה',mxAdvKeyOk:'הסולמות כבר מתאימים, אין צורך בהזזה.',mxAdvKeyShift:'A זז {n} חצאי טון ל־{k}, כדי להתאים ל־B ({b}).',
  mxAdvKeyWarn:'אין סולם שמתאים בדיוק; {k} הכי קרוב. כדאי להקשיב טוב לפזמון.',mxAdvShiftBig:'הזזה גדולה ({n} חצאי טון) יכולה לשנות את צבע הקול. נסו סולם שכן.',
  mxAdvTempoOk:'הקצבים קרובים: A משתנה רק ב־{p}.',mxAdvTempoBig:'הקצב של A משתנה ב־{p}, והשירה עלולה להישמע מתוחה. נסו את אפשרות הקצב השנייה.',
  mxAdvHalf:'A מנוגן בחצי או בכפול קצב (מ־{b} ל־{t} BPM).',mxAdvQuick:'בערוצים מהירים יש דליפות; הפרדה ב־AI נשמעת נקייה הרבה יותר.',
  mxPlay:'ניגון',mxPause:'השהיה',mxStop:'עצירה',mxLoop:'לופ',mxLoopT:'לופ של {n} תיבות מהמיקום הנוכחי. אפשר גם לגרור על סרגל התיבות.',mxLoopBars:'{n} תיבות',mxZoomIn:'הגדלה',mxZoomOut:'הקטנה',mxVolA:'עוצמת A',mxVolB:'עוצמת B',
  mxTlHelp:'לחיצה קופצת לשם · גוררים את A כדי להזיז (נצמד לתיבות, Shift לפעמות, Alt חופשי) · גרירה על הסרגל יוצרת לופ',mxKeysH:'Space ניגון/השהיה · ← → תיבה · L לופ',
  mxTlAria:'ציר זמן: {a} על {b}, {bpm} BPM',mxEngine:'טוען את מנוע הקצב והסולם…',mxNoStretch:'הדפדפן הזה לא יכול לשנות קצב בלי לשנות גובה צליל, אז גם הגובה ישתנה.',
  mxExportH:'ייצוא',mxExportP:'המאשאפ ייוצא ב־{bpm} BPM בסולם {k}.',mxOnlyLoop:'רק טווח הלופ',mxExportBtn:'ייצוא המאשאפ',mxRendering:'מעבד את המאשאפ… {p}%',
  mxDone:'נשמר: {f} ({s} MB).',mxExpFail:'הייצוא נכשל. נסו WAV או טווח קצר יותר.',mxNeedBoth:'קודם צריך לטעון את שני השירים.',
  mxErrLoad:'לא הצלחנו לטעון את השיר. נסו שוב.',mxErrLib:'לא הצלחנו להוריד את השיר מהחשבון שלכם.',mxEmptyLane:'טוענים שיר',mxBig:'הקובץ גדול מדי (מעל 250 MB).'},
en:{navMashup:'Mashup',mxEyebrow:'Vocals × beat · matched automatically',mxTitle:'Mashup Studio',
  mxSub:'Take the vocals from one song and the beat from another. We match tempo, key and bars automatically; you listen, fine-tune and export.',
  mxStep1H:'Load the vocals (A)',mxStep1P:'A song whose singing you love. From a file, My Songs or the tool.',
  mxStep2H:'Load the beat (B)',mxStep2P:'The song whose instrumental carries the mashup.',
  mxStep3H:'Match, listen, export',mxStep3P:'Tempo, key and bars line up by themselves. Fine-tune, then export WAV or MP3.',
  mxSlotA:'A · Vocals',mxSlotB:'B · Beat',mxDrop:'Drop a song here',mxDropH:'MP3, WAV, M4A, FLAC, OGG',
  mxFile:'File',mxLib:'My Songs',mxTool:'From the tool',mxReplaceL:'Replace:',mxClear:'Remove the song',mxSwap:'Swap A and B',
  mxDecoding:'Reading the file…',mxAnalyzing:'Analysing… {p}%',mxCues:'Finding the song\'s structure…',mxNoTool:'Open a song in the tool first.',
  mxLibT:'My Songs',mxLibSearch:'Search',mxLibEmpty:'No saved songs with a file yet. Songs you upload in the tool (signed in) show up here.',mxLibNoFile:'no file saved',mxLibNone:'No matching songs',mxLoadTo:'Load into {s}',mxClose:'Close',
  mxFull:'Full song (not separated)',mxFullHintA:'The whole song plays now. Separate it to keep only the vocals.',mxFullHintB:'The whole song plays now, including its vocals. Separate it for a clean beat.',
  mxSepAI:'Separate with AI',mxSepQuick:'Quick separation',mxQuickT:'Free and fast, but lower quality: expect bleed between the parts.',mxCost:'{n} points',
  mxAiStems:'AI stems',mxQuickStems:'Quick stems · lower quality',mxToolStems:'Stems from the tool',mxCached:'already separated this session',
  mxSepFail:'The separation didn\'t work: {m}',mxSepBusy:'Another separation is running. Wait for it to finish.',mxMute:'Mute',mxUse:'Use: {s}',mxGain:'Level: {s}',
  mxHalfT:'Halve the BPM',mxDoubleT:'Double the BPM',mxVocalAt:'Vocals start at bar {n}',
  mxMatchH:'Auto-match',mxTempoL:'Tempo',mxTempoB:'B\'s tempo',mxTempoA:'A\'s tempo',mxTempoC:'Custom',mxTempoIn:'Target BPM',
  mxKeyL:'Key',mxKeyBest:'Same key',mxKeyRel:'Relative key',mxKeyFifth:'Neighbour key',mxKeyOrig:'Original',mxSemi:'{n} semitones',mxKeyDown:'Down a semitone',mxKeyUp:'Up a semitone',
  mxAlignH:'Alignment',mxAlignL:'A\'s vocals start at',mxBar:'Bar {n}',mxEarlier:'Earlier: {x}',mxLater:'Later: {x}',mxUBar:'1 bar',mxUBeat:'1 beat',mxUMs:'10 ms',
  mxReset:'Reset',mxOffset:'Offset {ms} ms',mxFadeIn:'Fade in',mxFadeOut:'Fade out',mxFade0:'Off',mxFadeBeat:'1 beat',mxFadeBar:'1 bar',mxFadeBars:'{n} bars',
  mxStartA:'A starts',mxStartAll:'From the beginning',mxStartPre:'1 bar before the vocals',mxStartVoc:'Right at the vocals',
  mxScore:'Match',mxAdvKeyOk:'The keys already match, no shift needed.',mxAdvKeyShift:'A moves {n} semitones to {k} to fit B ({b}).',
  mxAdvKeyWarn:'No key fits perfectly; {k} is the closest. Listen closely to the chorus.',mxAdvShiftBig:'A big shift ({n} semitones) can make a voice sound unnatural. Try a neighbour key.',
  mxAdvTempoOk:'The tempos are close: A changes by only {p}.',mxAdvTempoBig:'A\'s tempo changes by {p}, so the vocals may sound stretched. Try the other tempo option.',
  mxAdvHalf:'A plays at half or double time (from {b} to {t} BPM).',mxAdvQuick:'Quick stems have bleed; AI separation sounds much cleaner.',
  mxPlay:'Play',mxPause:'Pause',mxStop:'Stop',mxLoop:'Loop',mxLoopT:'Loop {n} bars from the playhead. You can also drag on the bar ruler.',mxLoopBars:'{n} bars',mxZoomIn:'Zoom in',mxZoomOut:'Zoom out',mxVolA:'A level',mxVolB:'B level',
  mxTlHelp:'Click to jump · drag A to move it (snaps to bars, Shift = beats, Alt = free) · drag on the ruler to loop',mxKeysH:'Space play/pause · ← → one bar · L loop',
  mxTlAria:'Timeline: {a} over {b}, {bpm} BPM',mxEngine:'Loading the tempo and key engine…',mxNoStretch:'This browser can\'t change the tempo without changing the pitch, so the pitch will change too.',
  mxExportH:'Export',mxExportP:'The mashup is rendered at {bpm} BPM in {k}.',mxOnlyLoop:'Only the loop range',mxExportBtn:'Export mashup',mxRendering:'Rendering the mashup… {p}%',
  mxDone:'Saved {f} ({s} MB).',mxExpFail:'The export failed. Try WAV or a shorter range.',mxNeedBoth:'Load both songs first.',
  mxErrLoad:'Couldn\'t load this song. Try again.',mxErrLib:'Couldn\'t download the song from your account.',mxEmptyLane:'Load a song',mxBig:'The file is too large (over 250 MB).'},
ar:{navMashup:'ماش أب',mxEyebrow:'غناء × إيقاع · مطابقة تلقائية',mxTitle:'استوديو الماش أب',
  mxSub:'خذ الغناء من أغنية والإيقاع من أغنية أخرى. نطابق الإيقاع والمقام والمازورات تلقائيًا، وأنت تستمع وتضبط وتصدّر.',
  mxStep1H:'حمّل الغناء (A)',mxStep1P:'أغنية تحب غناءها. من ملف أو من «أغانيّ» أو من الأداة.',
  mxStep2H:'حمّل الإيقاع (B)',mxStep2P:'الأغنية التي تحمل موسيقاها الماش أب.',
  mxStep3H:'طابق، استمع، صدّر',mxStep3P:'الإيقاع والمقام والمازورات تتوافق وحدها. اضبط ثم صدّر WAV أو MP3.',
  mxSlotA:'A · غناء',mxSlotB:'B · إيقاع',mxDrop:'اسحب أغنية إلى هنا',mxDropH:'MP3, WAV, M4A, FLAC, OGG',
  mxFile:'ملف',mxLib:'أغانيّ',mxTool:'من الأداة',mxReplaceL:'استبدال:',mxClear:'إزالة الأغنية',mxSwap:'تبديل A و B',
  mxDecoding:'قراءة الملف…',mxAnalyzing:'تحليل… {p}%',mxCues:'اكتشاف بنية الأغنية…',mxNoTool:'افتح أغنية في الأداة أولًا.',
  mxLibT:'أغانيّ',mxLibSearch:'بحث',mxLibEmpty:'لا توجد أغانٍ محفوظة مع ملف بعد. الأغاني التي ترفعها في الأداة (مع تسجيل الدخول) تظهر هنا.',mxLibNoFile:'لا يوجد ملف محفوظ',mxLibNone:'لا توجد أغانٍ مطابقة',mxLoadTo:'تحميل إلى {s}',mxClose:'إغلاق',
  mxFull:'الأغنية كاملة (غير مفصولة)',mxFullHintA:'تُشغَّل الأغنية كاملة الآن. افصلها لتبقي الغناء فقط.',mxFullHintB:'تُشغَّل الأغنية كاملة الآن مع غنائها. افصلها لتحصل على إيقاع نظيف.',
  mxSepAI:'فصل بالذكاء الاصطناعي',mxSepQuick:'فصل سريع',mxQuickT:'مجاني وسريع لكن بجودة أقل: ستتسرّب الأصوات بين المسارات.',mxCost:'{n} نقاط',
  mxAiStems:'مسارات AI',mxQuickStems:'مسارات سريعة · جودة أقل',mxToolStems:'مسارات من الأداة',mxCached:'فُصلت مسبقًا في هذه الجلسة',
  mxSepFail:'لم ينجح الفصل: {m}',mxSepBusy:'هناك فصل آخر قيد التشغيل. انتظر حتى ينتهي.',mxMute:'كتم',mxUse:'استخدام: {s}',mxGain:'المستوى: {s}',
  mxHalfT:'نصف BPM',mxDoubleT:'ضعف BPM',mxVocalAt:'يبدأ الغناء عند المازورة {n}',
  mxMatchH:'مطابقة تلقائية',mxTempoL:'الإيقاع',mxTempoB:'إيقاع B',mxTempoA:'إيقاع A',mxTempoC:'مخصّص',mxTempoIn:'BPM المطلوب',
  mxKeyL:'المقام',mxKeyBest:'نفس المقام',mxKeyRel:'المقام النسبي',mxKeyFifth:'مقام مجاور',mxKeyOrig:'الأصلي',mxSemi:'{n} نصف تون',mxKeyDown:'نصف تون للأسفل',mxKeyUp:'نصف تون للأعلى',
  mxAlignH:'المحاذاة',mxAlignL:'يبدأ غناء A عند',mxBar:'المازورة {n}',mxEarlier:'تقديم: {x}',mxLater:'تأخير: {x}',mxUBar:'مازورة',mxUBeat:'نبضة',mxUMs:'10 ms',
  mxReset:'إعادة الضبط',mxOffset:'إزاحة {ms} ms',mxFadeIn:'دخول تدريجي',mxFadeOut:'خروج تدريجي',mxFade0:'بدون',mxFadeBeat:'نبضة',mxFadeBar:'مازورة',mxFadeBars:'{n} مازورات',
  mxStartA:'يبدأ A',mxStartAll:'من البداية',mxStartPre:'مازورة قبل الغناء',mxStartVoc:'عند الغناء تمامًا',
  mxScore:'التوافق',mxAdvKeyOk:'المقامات متوافقة أصلًا، لا حاجة للتحريك.',mxAdvKeyShift:'يتحرك A بمقدار {n} نصف تون إلى {k} ليتوافق مع B ({b}).',
  mxAdvKeyWarn:'لا يوجد مقام متوافق تمامًا؛ {k} هو الأقرب. استمع جيدًا إلى اللازمة.',mxAdvShiftBig:'التحريك الكبير ({n} نصف تون) قد يجعل الصوت غير طبيعي. جرّب مقامًا مجاورًا.',
  mxAdvTempoOk:'الإيقاعان متقاربان: يتغير A بنسبة {p} فقط.',mxAdvTempoBig:'يتغير إيقاع A بنسبة {p} وقد يبدو الغناء ممطوطًا. جرّب خيار الإيقاع الآخر.',
  mxAdvHalf:'يُشغَّل A بنصف الإيقاع أو ضعفه (من {b} إلى {t} BPM).',mxAdvQuick:'في المسارات السريعة تسرّب صوتي؛ الفصل بالذكاء الاصطناعي أنقى بكثير.',
  mxPlay:'تشغيل',mxPause:'إيقاف مؤقت',mxStop:'إيقاف',mxLoop:'تكرار',mxLoopT:'تكرار {n} مازورات من الموضع الحالي. يمكنك أيضًا السحب على مسطرة المازورات.',mxLoopBars:'{n} مازورات',mxZoomIn:'تكبير',mxZoomOut:'تصغير',mxVolA:'مستوى A',mxVolB:'مستوى B',
  mxTlHelp:'انقر للانتقال · اسحب A لتحريكه (يلتصق بالمازورات، Shift للنبضات، Alt بحرية) · اسحب على المسطرة لإنشاء تكرار',mxKeysH:'Space تشغيل/إيقاف · ← → مازورة · L تكرار',
  mxTlAria:'الخط الزمني: {a} فوق {b}، {bpm} BPM',mxEngine:'تحميل محرك الإيقاع والمقام…',mxNoStretch:'هذا المتصفح لا يستطيع تغيير الإيقاع دون تغيير طبقة الصوت، لذا ستتغير الطبقة أيضًا.',
  mxExportH:'تصدير',mxExportP:'سيُصدَّر الماش أب بإيقاع {bpm} BPM في مقام {k}.',mxOnlyLoop:'نطاق التكرار فقط',mxExportBtn:'تصدير الماش أب',mxRendering:'معالجة الماش أب… {p}%',
  mxDone:'تم الحفظ: {f} ({s} MB).',mxExpFail:'فشل التصدير. جرّب WAV أو نطاقًا أقصر.',mxNeedBoth:'حمّل الأغنيتين أولًا.',
  mxErrLoad:'تعذّر تحميل الأغنية. حاول مرة أخرى.',mxErrLib:'تعذّر تنزيل الأغنية من حسابك.',mxEmptyLane:'حمّل أغنية',mxBig:'الملف كبير جدًا (أكثر من 250 MB).'},
ru:{navMashup:'Мэшап',mxEyebrow:'Вокал × бит · автоматический подбор',mxTitle:'Мэшап-студия',
  mxSub:'Возьмите вокал из одной песни и бит из другой. Темп, тональность и такты мы подгоним сами, а вы слушаете, подстраиваете и экспортируете.',
  mxStep1H:'Загрузите вокал (A)',mxStep1P:'Песня, вокал которой вам нравится. Из файла, «Моих песен» или инструмента.',
  mxStep2H:'Загрузите бит (B)',mxStep2P:'Песня, чья музыка станет основой мэшапа.',
  mxStep3H:'Подбор, прослушивание, экспорт',mxStep3P:'Темп, тональность и такты совпадут сами. Подстройте и экспортируйте в WAV или MP3.',
  mxSlotA:'A · Вокал',mxSlotB:'B · Бит',mxDrop:'Перетащите песню сюда',mxDropH:'MP3, WAV, M4A, FLAC, OGG',
  mxFile:'Файл',mxLib:'Мои песни',mxTool:'Из инструмента',mxReplaceL:'Заменить:',mxClear:'Убрать песню',mxSwap:'Поменять A и B местами',
  mxDecoding:'Чтение файла…',mxAnalyzing:'Анализ… {p}%',mxCues:'Ищу структуру песни…',mxNoTool:'Сначала откройте песню в инструменте.',
  mxLibT:'Мои песни',mxLibSearch:'Поиск',mxLibEmpty:'Пока нет сохранённых песен с файлом. Песни, загруженные в инструменте (после входа), появятся здесь.',mxLibNoFile:'файл не сохранён',mxLibNone:'Нет подходящих песен',mxLoadTo:'Загрузить в {s}',mxClose:'Закрыть',
  mxFull:'Вся песня (без разделения)',mxFullHintA:'Сейчас играет вся песня. Разделите её, чтобы оставить только вокал.',mxFullHintB:'Сейчас играет вся песня вместе с вокалом. Разделите её, чтобы получить чистый бит.',
  mxSepAI:'Разделить с AI',mxSepQuick:'Быстрое разделение',mxQuickT:'Бесплатно и быстро, но качество ниже: партии будут просачиваться друг в друга.',mxCost:'{n} баллов',
  mxAiStems:'AI-стемы',mxQuickStems:'Быстрые стемы · качество ниже',mxToolStems:'Стемы из инструмента',mxCached:'уже разделено в этом сеансе',
  mxSepFail:'Разделение не удалось: {m}',mxSepBusy:'Уже идёт другое разделение. Дождитесь его окончания.',mxMute:'Заглушить',mxUse:'Использовать: {s}',mxGain:'Уровень: {s}',
  mxHalfT:'Половина BPM',mxDoubleT:'Двойной BPM',mxVocalAt:'Вокал с такта {n}',
  mxMatchH:'Автоподбор',mxTempoL:'Темп',mxTempoB:'Темп B',mxTempoA:'Темп A',mxTempoC:'Свой',mxTempoIn:'Целевой BPM',
  mxKeyL:'Тональность',mxKeyBest:'Та же тональность',mxKeyRel:'Параллельная тональность',mxKeyFifth:'Соседняя тональность',mxKeyOrig:'Исходная',mxSemi:'полутонов: {n}',mxKeyDown:'На полутон ниже',mxKeyUp:'На полутон выше',
  mxAlignH:'Выравнивание',mxAlignL:'Вокал A начинается с',mxBar:'Такт {n}',mxEarlier:'Раньше: {x}',mxLater:'Позже: {x}',mxUBar:'1 такт',mxUBeat:'1 доля',mxUMs:'10 мс',
  mxReset:'Сбросить',mxOffset:'Смещение {ms} мс',mxFadeIn:'Плавный вход',mxFadeOut:'Плавный выход',mxFade0:'Нет',mxFadeBeat:'1 доля',mxFadeBar:'1 такт',mxFadeBars:'Тактов: {n}',
  mxStartA:'Начало A',mxStartAll:'С самого начала',mxStartPre:'За такт до вокала',mxStartVoc:'Ровно с вокала',
  mxScore:'Совместимость',mxAdvKeyOk:'Тональности уже совпадают, сдвиг не нужен.',mxAdvKeyShift:'A транспонируется в {k} (полутонов: {n}), чтобы подойти к B ({b}).',
  mxAdvKeyWarn:'Идеально подходящей тональности нет; ближе всего {k}. Внимательно послушайте припев.',mxAdvShiftBig:'Большой сдвиг (полутонов: {n}) может сделать голос неестественным. Попробуйте соседнюю тональность.',
  mxAdvTempoOk:'Темпы близки: A меняется всего на {p}.',mxAdvTempoBig:'Темп A меняется на {p}, вокал может звучать растянуто. Попробуйте другой вариант темпа.',
  mxAdvHalf:'A играет в половинном или двойном темпе (с {b} до {t} BPM).',mxAdvQuick:'В быстрых стемах есть просачивание; AI-разделение звучит намного чище.',
  mxPlay:'Играть',mxPause:'Пауза',mxStop:'Стоп',mxLoop:'Луп',mxLoopT:'Луп на {n} тактов от текущей позиции. Можно также протянуть по линейке тактов.',mxLoopBars:'Тактов: {n}',mxZoomIn:'Приблизить',mxZoomOut:'Отдалить',mxVolA:'Уровень A',mxVolB:'Уровень B',
  mxTlHelp:'Клик — перейти · тяните A, чтобы сдвинуть (к тактам, Shift — к долям, Alt — свободно) · протяните по линейке — луп',mxKeysH:'Space — пуск/пауза · ← → такт · L — луп',
  mxTlAria:'Таймлайн: {a} поверх {b}, {bpm} BPM',mxEngine:'Загружаю движок темпа и тональности…',mxNoStretch:'Этот браузер не умеет менять темп без изменения высоты, поэтому высота тоже изменится.',
  mxExportH:'Экспорт',mxExportP:'Мэшап будет сведён в {bpm} BPM, тональность {k}.',mxOnlyLoop:'Только диапазон лупа',mxExportBtn:'Экспортировать мэшап',mxRendering:'Сведение мэшапа… {p}%',
  mxDone:'Сохранено: {f} ({s} МБ).',mxExpFail:'Экспорт не удался. Попробуйте WAV или более короткий диапазон.',mxNeedBoth:'Сначала загрузите обе песни.',
  mxErrLoad:'Не удалось загрузить песню. Попробуйте ещё раз.',mxErrLib:'Не удалось скачать песню из вашего аккаунта.',mxEmptyLane:'Загрузите песню',mxBig:'Файл слишком большой (больше 250 МБ).'},
es:{navMashup:'Mashup',mxEyebrow:'Voz × base · ajuste automático',mxTitle:'Estudio Mashup',
  mxSub:'Toma la voz de una canción y la base de otra. Ajustamos tempo, tonalidad y compases automáticamente; tú escuchas, afinas y exportas.',
  mxStep1H:'Carga la voz (A)',mxStep1P:'Una canción cuya voz te encanta. Desde un archivo, Mis canciones o la herramienta.',
  mxStep2H:'Carga la base (B)',mxStep2P:'La canción cuya música sostiene el mashup.',
  mxStep3H:'Ajusta, escucha, exporta',mxStep3P:'Tempo, tonalidad y compases se alinean solos. Afina y exporta en WAV o MP3.',
  mxSlotA:'A · Voz',mxSlotB:'B · Base',mxDrop:'Suelta aquí una canción',mxDropH:'MP3, WAV, M4A, FLAC, OGG',
  mxFile:'Archivo',mxLib:'Mis canciones',mxTool:'Desde la herramienta',mxReplaceL:'Cambiar:',mxClear:'Quitar la canción',mxSwap:'Intercambiar A y B',
  mxDecoding:'Leyendo el archivo…',mxAnalyzing:'Analizando… {p}%',mxCues:'Buscando la estructura de la canción…',mxNoTool:'Primero abre una canción en la herramienta.',
  mxLibT:'Mis canciones',mxLibSearch:'Buscar',mxLibEmpty:'Aún no hay canciones guardadas con archivo. Las que subas en la herramienta (con sesión iniciada) aparecerán aquí.',mxLibNoFile:'sin archivo guardado',mxLibNone:'No hay canciones que coincidan',mxLoadTo:'Cargar en {s}',mxClose:'Cerrar',
  mxFull:'Canción completa (sin separar)',mxFullHintA:'Ahora suena la canción entera. Sepárala para quedarte solo con la voz.',mxFullHintB:'Ahora suena la canción entera, con su voz. Sepárala para tener una base limpia.',
  mxSepAI:'Separar con IA',mxSepQuick:'Separación rápida',mxQuickT:'Gratis y rápida, pero de menor calidad: habrá sangrado entre las pistas.',mxCost:'{n} puntos',
  mxAiStems:'Pistas con IA',mxQuickStems:'Pistas rápidas · menor calidad',mxToolStems:'Pistas de la herramienta',mxCached:'ya separada en esta sesión',
  mxSepFail:'La separación no funcionó: {m}',mxSepBusy:'Hay otra separación en curso. Espera a que termine.',mxMute:'Silenciar',mxUse:'Usar: {s}',mxGain:'Nivel: {s}',
  mxHalfT:'Mitad de BPM',mxDoubleT:'Doble de BPM',mxVocalAt:'La voz entra en el compás {n}',
  mxMatchH:'Ajuste automático',mxTempoL:'Tempo',mxTempoB:'Tempo de B',mxTempoA:'Tempo de A',mxTempoC:'Otro',mxTempoIn:'BPM objetivo',
  mxKeyL:'Tonalidad',mxKeyBest:'Misma tonalidad',mxKeyRel:'Tonalidad relativa',mxKeyFifth:'Tonalidad vecina',mxKeyOrig:'Original',mxSemi:'{n} semitonos',mxKeyDown:'Bajar un semitono',mxKeyUp:'Subir un semitono',
  mxAlignH:'Alineación',mxAlignL:'La voz de A entra en',mxBar:'Compás {n}',mxEarlier:'Antes: {x}',mxLater:'Después: {x}',mxUBar:'1 compás',mxUBeat:'1 tiempo',mxUMs:'10 ms',
  mxReset:'Restablecer',mxOffset:'Desfase {ms} ms',mxFadeIn:'Entrada gradual',mxFadeOut:'Salida gradual',mxFade0:'No',mxFadeBeat:'1 tiempo',mxFadeBar:'1 compás',mxFadeBars:'{n} compases',
  mxStartA:'A empieza',mxStartAll:'Desde el principio',mxStartPre:'1 compás antes de la voz',mxStartVoc:'Justo en la voz',
  mxScore:'Compatibilidad',mxAdvKeyOk:'Las tonalidades ya encajan, no hace falta moverlas.',mxAdvKeyShift:'A se mueve {n} semitonos a {k} para encajar con B ({b}).',
  mxAdvKeyWarn:'Ninguna tonalidad encaja del todo; {k} es la más cercana. Escucha bien el estribillo.',mxAdvShiftBig:'Un cambio grande ({n} semitonos) puede hacer que la voz suene poco natural. Prueba una tonalidad vecina.',
  mxAdvTempoOk:'Los tempos son parecidos: A cambia solo un {p}.',mxAdvTempoBig:'El tempo de A cambia un {p} y la voz puede sonar estirada. Prueba la otra opción de tempo.',
  mxAdvHalf:'A suena a medio o doble tiempo (de {b} a {t} BPM).',mxAdvQuick:'Las pistas rápidas tienen sangrado; la separación con IA suena mucho más limpia.',
  mxPlay:'Reproducir',mxPause:'Pausa',mxStop:'Detener',mxLoop:'Bucle',mxLoopT:'Bucle de {n} compases desde la posición actual. También puedes arrastrar sobre la regla de compases.',mxLoopBars:'{n} compases',mxZoomIn:'Acercar',mxZoomOut:'Alejar',mxVolA:'Nivel de A',mxVolB:'Nivel de B',
  mxTlHelp:'Clic para saltar · arrastra A para moverlo (se ajusta a compases, Shift a tiempos, Alt libre) · arrastra sobre la regla para crear un bucle',mxKeysH:'Espacio reproducir/pausa · ← → un compás · L bucle',
  mxTlAria:'Línea de tiempo: {a} sobre {b}, {bpm} BPM',mxEngine:'Cargando el motor de tempo y tonalidad…',mxNoStretch:'Este navegador no puede cambiar el tempo sin cambiar el tono, así que el tono también cambiará.',
  mxExportH:'Exportar',mxExportP:'El mashup se exporta a {bpm} BPM en {k}.',mxOnlyLoop:'Solo el rango del bucle',mxExportBtn:'Exportar mashup',mxRendering:'Procesando el mashup… {p}%',
  mxDone:'Guardado: {f} ({s} MB).',mxExpFail:'La exportación falló. Prueba WAV o un rango más corto.',mxNeedBoth:'Primero carga las dos canciones.',
  mxErrLoad:'No se pudo cargar la canción. Inténtalo de nuevo.',mxErrLib:'No se pudo descargar la canción de tu cuenta.',mxEmptyLane:'Carga una canción',mxBig:'El archivo es demasiado grande (más de 250 MB).'}
});

/* griddrag: grid mode (move a song's grid against its audio), A drag snapping, lock, undo (he / en / ar / ru / es) */
CR.addStrings({
he:{mxGrid:'גריד',mxGridT:'גריד: גוררים על שיר כדי להזיז את הגריד שלו מול הקול שלו (תיקון תיבה ראשונה שגויה)',
  mxGridHelp:'מצב גריד: גוררים על A או על B כדי להזיז את הגריד של אותו שיר מול הקול שלו (נצמד למכה, Ctrl/⌘ חופשי). בסוף הגרירה A ננעל שוב על התיבות של B · ← → מזיזים את הגריד של השיר שגררתם אחרון במילישנייה (Shift עשר) · Ctrl+Z ביטול',
  mxTlHelp:'לחיצה קופצת לשם · גוררים את A כדי להזיז (נצמד לתיבות, Shift לפעמות, Ctrl/⌘ חופשי) · גרירה על הסרגל יוצרת לופ · Ctrl+Z ביטול',
  mxLockOn:'נעול: התיבה של A יושבת בדיוק על תיבה {n} של B',mxLockOff:'A זז {ms} מתיבה {n} של B'},
en:{mxGrid:'Grid',mxGridT:'Grid: drag on a song to move its grid against its audio (fix a wrong downbeat)',
  mxGridHelp:'Grid mode: drag on A or B to move that song\'s grid against its audio (snaps to a hit, Ctrl/⌘ = free). When you let go, A locks onto B\'s bars again · ← → move the last dragged song\'s grid by 1 ms (Shift 10 ms) · Ctrl+Z undo',
  mxTlHelp:'Click to jump · drag A to move it (snaps to bars, Shift = beats, Ctrl/⌘ = free) · drag on the ruler to loop · Ctrl+Z undo',
  mxLockOn:'Locked: A\'s bar sits exactly on bar {n} of B',mxLockOff:'A is {ms} off bar {n} of B'},
ar:{mxGrid:'الشبكة',mxGridT:'الشبكة: اسحب على أغنية لتحريك شبكتها مقابل صوتها (لتصحيح بداية مازورة خاطئة)',
  mxGridHelp:'وضع الشبكة: اسحب على A أو B لتحريك شبكة تلك الأغنية مقابل صوتها (يلتصق بأقرب ضربة، Ctrl/⌘ بحرية). عند الإفلات يُقفل A من جديد على مازورات B · ← → تحرّك شبكة آخر أغنية سحبتها 1 ms ‏(Shift ‏10 ms) · Ctrl+Z تراجع',
  mxTlHelp:'انقر للانتقال · اسحب A لتحريكه (يلتصق بالمازورات، Shift للنبضات، Ctrl/⌘ بحرية) · اسحب على المسطرة لإنشاء تكرار · Ctrl+Z تراجع',
  mxLockOn:'مقفل: مازورة A تقع تمامًا على المازورة {n} من B',mxLockOff:'A مُزاح {ms} عن المازورة {n} من B'},
ru:{mxGrid:'Сетка',mxGridT:'Сетка: тяните по песне, чтобы сдвинуть её сетку относительно звука (исправить неверную сильную долю)',
  mxGridHelp:'Режим сетки: тяните по A или B, чтобы сдвинуть сетку этой песни относительно её звука (прилипает к удару, Ctrl/⌘ — свободно). Когда отпустите, A снова встанет на такты B · ← → сдвигают сетку последней песни на 1 мс (Shift — 10 мс) · Ctrl+Z отмена',
  mxTlHelp:'Клик — перейти · тяните A, чтобы сдвинуть (к тактам, Shift — к долям, Ctrl/⌘ — свободно) · протяните по линейке — луп · Ctrl+Z отмена',
  mxLockOn:'Зафиксировано: такт A стоит ровно на такте {n} у B',mxLockOff:'A смещён на {ms} от такта {n} у B'},
es:{mxGrid:'Rejilla',mxGridT:'Rejilla: arrastra sobre una canción para mover su rejilla respecto a su audio (corregir un primer tiempo equivocado)',
  mxGridHelp:'Modo rejilla: arrastra sobre A o B para mover la rejilla de esa canción respecto a su audio (se pega al golpe, Ctrl/⌘ = libre). Al soltar, A vuelve a fijarse en los compases de B · ← → mueven la rejilla de la última canción arrastrada 1 ms (Shift 10 ms) · Ctrl+Z deshacer',
  mxTlHelp:'Clic para saltar · arrastra A para moverlo (se ajusta a compases, Shift = tiempos, Ctrl/⌘ = libre) · arrastra en la regla para hacer un bucle · Ctrl+Z deshacer',
  mxLockOn:'Fijado: el compás de A cae justo en el compás {n} de B',mxLockOff:'A está {ms} fuera del compás {n} de B'}
});

/* freemove: free / ms move mode, wheel zoom (he / en / ar / ru / es) */
CR.addStrings({
he:{mxFree:'הזזה חופשית',mxFreeT:'הזזה חופשית (מילישניות): לוחצים על A או על B כדי לבחור ומזיזים בגרירה, בלי הצמדה',
  mxFreeHelp:'הזזה חופשית: לוחצים על שיר כדי לבחור אותו וגוררים, בלי הצמדה (הדיוק עולה ככל שמגדילים) · ← → מילישנייה (Shift עשר, Alt עשירית) · גרירה של B מזיזה את B מול A · Ctrl+Z ביטול',
  mxWheelH:'גלגלת על ציר הזמן: זום · Shift+גלגלת: גלילה',mxSelA:'נבחר: A',mxSelB:'נבחר: B'},
en:{mxFree:'Free move',mxFreeT:'Free move (ms): click A or B to select it and drag it, no snapping',
  mxFreeHelp:'Free move: click a song to select it and drag it, no snapping (finer the more you zoom in) · ← → 1 ms (Shift 10 ms, Alt 0.1 ms) · dragging B moves B against A · Ctrl+Z undo',
  mxWheelH:'Wheel on the timeline: zoom · Shift+wheel: scroll',mxSelA:'Selected: A',mxSelB:'Selected: B'},
ar:{mxFree:'تحريك حر',mxFreeT:'تحريك حر (بالمللي ثانية): انقر A أو B لتحديده واسحبه بلا التصاق',
  mxFreeHelp:'تحريك حر: انقر أغنية لتحديدها واسحبها بلا التصاق (أدق كلما كبّرت) · ← → ‏1 ms ‏(Shift ‏10 ms، Alt ‏0.1 ms) · سحب B يحرّك B مقابل A · Ctrl+Z تراجع',
  mxWheelH:'العجلة على الخط الزمني: تكبير · Shift+العجلة: تمرير',mxSelA:'المحدد: A',mxSelB:'المحدد: B'},
ru:{mxFree:'Свободно',mxFreeT:'Свободный сдвиг (мс): кликните по A или B, чтобы выбрать, и тяните без привязки',
  mxFreeHelp:'Свободный сдвиг: кликните по песне, чтобы выбрать её, и тяните без привязки (чем крупнее масштаб, тем точнее) · ← → 1 мс (Shift — 10 мс, Alt — 0,1 мс) · B сдвигается относительно A · Ctrl+Z отмена',
  mxWheelH:'Колесо на шкале: масштаб · Shift+колесо: прокрутка',mxSelA:'Выбрано: A',mxSelB:'Выбрано: B'},
es:{mxFree:'Mover libre',mxFreeT:'Mover libre (ms): haz clic en A o B para seleccionarla y arrástrala sin ajuste',
  mxFreeHelp:'Mover libre: haz clic en una canción para seleccionarla y arrástrala sin ajuste (más fino cuanto más acercas) · ← → 1 ms (Shift 10 ms, Alt 0,1 ms) · arrastrar B mueve B respecto a A · Ctrl+Z deshacer',
  mxWheelH:'Rueda en la línea de tiempo: zoom · Shift+rueda: desplazar',mxSelA:'Seleccionada: A',mxSelB:'Seleccionada: B'}
});

/* studio: vocal FX, EQ, editing, transitions, auto-duck, compare, solo/mute, width, meter (he / en / ar / ru / es) */
CR.addStrings({
he:{mxFxH:'אפקטים לשירה',mxFxBH:'אפקטים לביט (B)',mxEqH:'EQ',mxEdH:'עריכה',
  mxRev:'ריוורב',mxDly:'אקו',mxFlt:'פילטר',mxCmp:'קומפרסור',mxCho:'כורוס והכפלה',mxSat:'חום',
  mxPSize:'גודל',mxPPre:'השהיה',mxPMix:'מינון',mxPFb:'חזרות',mxPHc:'עמעום החזרות',mxPLo:'חיתוך נמוכים',mxPHi:'חיתוך גבוהים',mxPAmt:'עוצמה',mxPDepth:'עומק',mxPWidth:'רוחב',mxPDrive:'דרייב',
  mxRoom:'חדר',mxHall:'אולם',mxPlate:'פלייט',mxPP:'פינג־פונג',mxNoteL:'קצב החזרות',mxOnOff:'הפעלה: {s}',
  mxPresets:'מוכנים',mxPDry:'יבש',mxPRadio:'רדיו',mxPClub:'מועדון',mxPLofi:'לו־פיי',mxPDreamy:'חלומי',mxPPhone:'טלפון',
  mxEqOn:'EQ פעיל',mxEqFlat:'שטוח',mxEqMud:'הסרת בוץ',mxEqAir:'אוויר',mxEqWarm:'חום',mxEqVoc:'קול קדימה',mxEqBass:'שקט מבס',
  mxEqHelp:'גוררים נקודה: תדר ועוצמה · גלגלת על נקודה: רוחב (Q) · לחיצה כפולה: איפוס הנקודה · מקשים 1–5 בוחרים נקודה, חצים מזיזים',
  mxBand:'נקודה {n}',mxFreq:'תדר',mxDb:'עוצמה',mxQ:'רוחב (Q)',mxEqAria:'עקומת EQ של {s}',mxEqFor:'ערוץ',
  mxCut:'חיתוך',mxCutT:'מצב חיתוך (C): לחיצה על שיר חותכת אותו שם (נצמד לפעמה, Shift לשש־עשריות, Alt חופשי)',mxSplit:'פיצול',mxSplitT:'פיצול בסמן (S)',
  mxDup:'שכפול',mxDupT:'שכפול הקטע מיד אחריו (Ctrl/⌘+D)',mxMuteR:'השתקה',mxMuteRT:'השתקת הקטע (M)',mxDel:'מחיקה',mxDelT:'מחיקת הקטע (Delete)',mxDelBT:'ב־B: מחיקת התיבות והצמדת ההמשך (גם השירה באותו קטע נמחקת)',
  mxRGain:'עוצמת הקטע',mxRFi:'כניסה',mxRFo:'יציאה',mxThrow:'אקו בסוף הקטע',mxThrowT:'האקו נפתח רק בפעמה האחרונה של הקטע וממשיך להדהד אחריו',
  mxNoSel:'בחרו קטע בלחיצה על ציר הזמן, או פצלו שיר עם S כדי ליצור קטעים.',mxSelR:'{s} · קטע {n} · {a}–{b}',mxBeats:'{n} פעמות',
  mxBBars:'הארכה וקיצור של הביט',mxBBarsP:'מהתיבה שבה נמצא הסמן; כל מה שאחרי זז בהתאם, גם השירה.',mxRepeat:'לחזור על {n} תיבות',mxRemove:'להסיר {n} תיבות',
  mxTrans:'אפקטי מעבר',mxRiser:'רייזר',mxDown:'דאונליפטר',mxTrAdd:'הוספת {s} בתיבה של הסמן',mxTLen:'אורך',mxTLv:'עוצמה',mxTrSel:'{s} · תיבה {n}',mxTrNone:'אפשר לגרור אפקט מעבר על סרגל התיבות כדי להזיז אותו.',
  mxDuck:'הנמכה אוטומטית של הביט',mxDuckT:'הביט יורד בכמה dB כשיש שירה',mxDuckAmt:'עומק',
  mxResetEd:'ביטול העריכה של {s}',mxWidth:'רוחב סטריאו',mxCompare:'השוואה',mxCompareT:'החזיקו כדי לשמוע בלי אפקטים ובלי EQ',mxSolo:'סולו',mxMuteS:'השתקת {s}',mxSoloT:'סולו ל־{s}',mxMeter:'עוצמת יציאה',
  mxEdHelp:'S פיצול · C חיתוך · Delete מחיקה · M השתקה · Ctrl/⌘+D שכפול · Esc ביטול בחירה · גוררים קטע כדי להזיז (נצמד לתיבות, Shift לפעמות, הזזה חופשית בלי הצמדה) · גוררים את הנקודות שבפינות כדי לקבוע כניסה ויציאה',
  mxKeysH:'Space ניגון/השהיה · ← → תיבה · L לופ · S פיצול · C חיתוך'},
en:{mxFxH:'Vocal effects',mxFxBH:'Beat effects (B)',mxEqH:'EQ',mxEdH:'Edit',
  mxRev:'Reverb',mxDly:'Echo',mxFlt:'Filter',mxCmp:'Compressor',mxCho:'Chorus & double',mxSat:'Warmth',
  mxPSize:'Size',mxPPre:'Pre-delay',mxPMix:'Mix',mxPFb:'Feedback',mxPHc:'Darken repeats',mxPLo:'Low cut',mxPHi:'High cut',mxPAmt:'Amount',mxPDepth:'Depth',mxPWidth:'Width',mxPDrive:'Drive',
  mxRoom:'Room',mxHall:'Hall',mxPlate:'Plate',mxPP:'Ping-pong',mxNoteL:'Repeat rate',mxOnOff:'On: {s}',
  mxPresets:'Presets',mxPDry:'Dry',mxPRadio:'Radio',mxPClub:'Club',mxPLofi:'Lo-fi',mxPDreamy:'Dreamy',mxPPhone:'Telephone',
  mxEqOn:'EQ on',mxEqFlat:'Flat',mxEqMud:'Remove mud',mxEqAir:'Air',mxEqWarm:'Warm',mxEqVoc:'Vocal forward',mxEqBass:'Bass cut',
  mxEqHelp:'Drag a point: frequency and gain · wheel on a point: width (Q) · double-click: reset the point · keys 1–5 pick a point, arrows move it',
  mxBand:'Point {n}',mxFreq:'Frequency',mxDb:'Gain',mxQ:'Width (Q)',mxEqAria:'EQ curve of {s}',mxEqFor:'Channel',
  mxCut:'Cut',mxCutT:'Cut mode (C): click a song to cut it there (snaps to beats, Shift = 16ths, Alt = free)',mxSplit:'Split',mxSplitT:'Split at the playhead (S)',
  mxDup:'Duplicate',mxDupT:'Duplicate the part right after itself (Ctrl/⌘+D)',mxMuteR:'Mute',mxMuteRT:'Mute the part (M)',mxDel:'Delete',mxDelT:'Delete the part (Delete)',mxDelBT:'On B: deletes those bars and closes the gap (the vocals in that range go too)',
  mxRGain:'Part level',mxRFi:'Fade in',mxRFo:'Fade out',mxThrow:'Echo at the end',mxThrowT:'The echo opens only on the part\'s last beat and keeps ringing after it',
  mxNoSel:'Click a part on the timeline to select it, or split a song with S to make parts.',mxSelR:'{s} · part {n} · {a}–{b}',mxBeats:'{n} beats',
  mxBBars:'Extend or shorten the beat',mxBBarsP:'From the bar under the playhead; everything after moves along, vocals included.',mxRepeat:'Repeat {n} bars',mxRemove:'Remove {n} bars',
  mxTrans:'Transition FX',mxRiser:'Riser',mxDown:'Downlifter',mxTrAdd:'Add a {s} at the playhead\'s bar',mxTLen:'Length',mxTLv:'Level',mxTrSel:'{s} · bar {n}',mxTrNone:'Drag a transition on the bar ruler to move it.',
  mxDuck:'Auto-duck the beat',mxDuckT:'The beat dips a few dB while the vocals sing',mxDuckAmt:'Depth',
  mxResetEd:'Undo all edits on {s}',mxWidth:'Stereo width',mxCompare:'Compare',mxCompareT:'Hold to hear it without effects and EQ',mxSolo:'Solo',mxMuteS:'Mute {s}',mxSoloT:'Solo {s}',mxMeter:'Output level',
  mxEdHelp:'S split · C cut · Delete delete · M mute · Ctrl/⌘+D duplicate · Esc deselect · drag a part to move it (snaps to bars, Shift = beats, Free move = no snapping) · drag the corner dots to set fades',
  mxKeysH:'Space play/pause · ← → one bar · L loop · S split · C cut'},
ar:{mxFxH:'مؤثرات الغناء',mxFxBH:'مؤثرات الإيقاع (B)',mxEqH:'EQ',mxEdH:'تحرير',
  mxRev:'صدى المكان',mxDly:'إيكو',mxFlt:'فلتر',mxCmp:'ضاغط',mxCho:'كورس ومضاعفة',mxSat:'دفء',
  mxPSize:'الحجم',mxPPre:'تأخير مسبق',mxPMix:'المقدار',mxPFb:'التكرارات',mxPHc:'تعتيم التكرارات',mxPLo:'قص المنخفضات',mxPHi:'قص المرتفعات',mxPAmt:'الشدة',mxPDepth:'العمق',mxPWidth:'العرض',mxPDrive:'الدفع',
  mxRoom:'غرفة',mxHall:'قاعة',mxPlate:'صفيحة',mxPP:'بينغ بونغ',mxNoteL:'سرعة التكرار',mxOnOff:'تشغيل: {s}',
  mxPresets:'جاهزة',mxPDry:'جاف',mxPRadio:'راديو',mxPClub:'نادٍ',mxPLofi:'لو-فاي',mxPDreamy:'حالم',mxPPhone:'هاتف',
  mxEqOn:'EQ مفعّل',mxEqFlat:'مستوٍ',mxEqMud:'إزالة الطين',mxEqAir:'هواء',mxEqWarm:'دافئ',mxEqVoc:'الصوت للأمام',mxEqBass:'تخفيف الباص',
  mxEqHelp:'اسحب نقطة: التردد والشدة · العجلة على نقطة: العرض (Q) · نقر مزدوج: إعادة النقطة · المفاتيح 1–5 تختار نقطة والأسهم تحركها',
  mxBand:'النقطة {n}',mxFreq:'التردد',mxDb:'الشدة',mxQ:'العرض (Q)',mxEqAria:'منحنى EQ لـ {s}',mxEqFor:'المسار',
  mxCut:'قص',mxCutT:'وضع القص (C): انقر على أغنية لقصها هناك (يلتصق بالنبضة، Shift لأجزاء 1/16، Alt بحرية)',mxSplit:'تقسيم',mxSplitT:'تقسيم عند المؤشر (S)',
  mxDup:'نسخ',mxDupT:'نسخ المقطع بعده مباشرة (Ctrl/⌘+D)',mxMuteR:'كتم',mxMuteRT:'كتم المقطع (M)',mxDel:'حذف',mxDelT:'حذف المقطع (Delete)',mxDelBT:'في B: يحذف تلك المازورات ويغلق الفجوة (ويُحذف الغناء في ذلك الجزء أيضًا)',
  mxRGain:'مستوى المقطع',mxRFi:'دخول تدريجي',mxRFo:'خروج تدريجي',mxThrow:'إيكو في النهاية',mxThrowT:'يُفتح الإيكو في آخر نبضة من المقطع فقط ويستمر بعده',
  mxNoSel:'انقر على مقطع في الخط الزمني لتحديده، أو قسّم أغنية بالمفتاح S لإنشاء مقاطع.',mxSelR:'{s} · المقطع {n} · {a}–{b}',mxBeats:'{n} نبضات',
  mxBBars:'إطالة الإيقاع أو تقصيره',mxBBarsP:'من المازورة التي تحت المؤشر؛ كل ما بعدها يتحرك معها، والغناء أيضًا.',mxRepeat:'تكرار {n} مازورات',mxRemove:'إزالة {n} مازورات',
  mxTrans:'مؤثرات الانتقال',mxRiser:'رايزر',mxDown:'داون ليفتر',mxTrAdd:'إضافة {s} عند مازورة المؤشر',mxTLen:'الطول',mxTLv:'المستوى',mxTrSel:'{s} · المازورة {n}',mxTrNone:'اسحب مؤثر الانتقال على مسطرة المازورات لتحريكه.',
  mxDuck:'خفض الإيقاع تلقائيًا',mxDuckT:'ينخفض الإيقاع بضع ديسيبلات أثناء الغناء',mxDuckAmt:'العمق',
  mxResetEd:'إلغاء كل التحرير في {s}',mxWidth:'عرض الستيريو',mxCompare:'مقارنة',mxCompareT:'اضغط مطولًا لتسمع بلا مؤثرات ولا EQ',mxSolo:'منفرد',mxMuteS:'كتم {s}',mxSoloT:'{s} منفردًا',mxMeter:'مستوى الخرج',
  mxEdHelp:'S تقسيم · C قص · Delete حذف · M كتم · Ctrl/⌘+D نسخ · Esc إلغاء التحديد · اسحب مقطعًا لتحريكه (يلتصق بالمازورات، Shift بالنبضات، التحريك الحر بلا التصاق) · اسحب النقاط في الزوايا لضبط الدخول والخروج',
  mxKeysH:'Space تشغيل/إيقاف · ← → مازورة · L تكرار · S تقسيم · C قص'},
ru:{mxFxH:'Эффекты для вокала',mxFxBH:'Эффекты для бита (B)',mxEqH:'Эквалайзер',mxEdH:'Монтаж',
  mxRev:'Реверб',mxDly:'Эхо',mxFlt:'Фильтр',mxCmp:'Компрессор',mxCho:'Хорус и дабл',mxSat:'Теплота',
  mxPSize:'Размер',mxPPre:'Предзадержка',mxPMix:'Доля',mxPFb:'Повторы',mxPHc:'Затемнение повторов',mxPLo:'Срез низов',mxPHi:'Срез верхов',mxPAmt:'Сила',mxPDepth:'Глубина',mxPWidth:'Ширина',mxPDrive:'Драйв',
  mxRoom:'Комната',mxHall:'Зал',mxPlate:'Пластина',mxPP:'Пинг-понг',mxNoteL:'Шаг повторов',mxOnOff:'Включить: {s}',
  mxPresets:'Пресеты',mxPDry:'Сухо',mxPRadio:'Радио',mxPClub:'Клуб',mxPLofi:'Лоу-фай',mxPDreamy:'Мечтательно',mxPPhone:'Телефон',
  mxEqOn:'Эквалайзер включён',mxEqFlat:'Ровно',mxEqMud:'Убрать муть',mxEqAir:'Воздух',mxEqWarm:'Тепло',mxEqVoc:'Голос вперёд',mxEqBass:'Меньше баса',
  mxEqHelp:'Тяните точку: частота и уровень · колесо на точке: ширина (Q) · двойной клик: сброс точки · клавиши 1–5 выбирают точку, стрелки двигают её',
  mxBand:'Точка {n}',mxFreq:'Частота',mxDb:'Уровень',mxQ:'Ширина (Q)',mxEqAria:'Кривая эквалайзера: {s}',mxEqFor:'Канал',
  mxCut:'Нарезка',mxCutT:'Режим нарезки (C): клик по песне разрезает её в этом месте (к долям, Shift — к 1/16, Alt — свободно)',mxSplit:'Разрезать',mxSplitT:'Разрезать по курсору (S)',
  mxDup:'Дублировать',mxDupT:'Дублировать фрагмент сразу после него (Ctrl/⌘+D)',mxMuteR:'Заглушить',mxMuteRT:'Заглушить фрагмент (M)',mxDel:'Удалить',mxDelT:'Удалить фрагмент (Delete)',mxDelBT:'В B: удаляет эти такты и сдвигает остальное (вокал на этом участке тоже удаляется)',
  mxRGain:'Уровень фрагмента',mxRFi:'Плавный вход',mxRFo:'Плавный выход',mxThrow:'Эхо в конце',mxThrowT:'Эхо открывается только на последней доле фрагмента и звучит дальше',
  mxNoSel:'Кликните по фрагменту на шкале, чтобы выбрать его, или разрежьте песню клавишей S.',mxSelR:'{s} · фрагмент {n} · {a}–{b}',mxBeats:'долей: {n}',
  mxBBars:'Удлинить или укоротить бит',mxBBarsP:'С такта под курсором; всё, что дальше, сдвигается, включая вокал.',mxRepeat:'Повторить тактов: {n}',mxRemove:'Убрать тактов: {n}',
  mxTrans:'Переходы',mxRiser:'Райзер',mxDown:'Даунлифтер',mxTrAdd:'Добавить: {s} на такте курсора',mxTLen:'Длина',mxTLv:'Уровень',mxTrSel:'{s} · такт {n}',mxTrNone:'Тяните переход по линейке тактов, чтобы сдвинуть его.',
  mxDuck:'Автоприглушение бита',mxDuckT:'Бит становится тише на несколько дБ, когда звучит вокал',mxDuckAmt:'Глубина',
  mxResetEd:'Отменить весь монтаж {s}',mxWidth:'Ширина стерео',mxCompare:'Сравнить',mxCompareT:'Удерживайте, чтобы слушать без эффектов и эквалайзера',mxSolo:'Соло',mxMuteS:'Заглушить {s}',mxSoloT:'Соло {s}',mxMeter:'Выходной уровень',
  mxEdHelp:'S разрезать · C нарезка · Delete удалить · M заглушить · Ctrl/⌘+D дублировать · Esc снять выбор · тяните фрагмент, чтобы сдвинуть (к тактам, Shift — к долям, свободный режим — без привязки) · тяните точки в углах для входа и выхода',
  mxKeysH:'Space — пуск/пауза · ← → такт · L — луп · S — разрезать · C — нарезка'},
es:{mxFxH:'Efectos de voz',mxFxBH:'Efectos de la base (B)',mxEqH:'EQ',mxEdH:'Edición',
  mxRev:'Reverb',mxDly:'Eco',mxFlt:'Filtro',mxCmp:'Compresor',mxCho:'Chorus y doblaje',mxSat:'Calidez',
  mxPSize:'Tamaño',mxPPre:'Pre-retardo',mxPMix:'Mezcla',mxPFb:'Repeticiones',mxPHc:'Oscurecer repeticiones',mxPLo:'Corte de graves',mxPHi:'Corte de agudos',mxPAmt:'Cantidad',mxPDepth:'Profundidad',mxPWidth:'Amplitud',mxPDrive:'Saturación',
  mxRoom:'Sala',mxHall:'Auditorio',mxPlate:'Placa',mxPP:'Ping-pong',mxNoteL:'Ritmo del eco',mxOnOff:'Activar: {s}',
  mxPresets:'Ajustes',mxPDry:'Seco',mxPRadio:'Radio',mxPClub:'Club',mxPLofi:'Lo-fi',mxPDreamy:'Soñador',mxPPhone:'Teléfono',
  mxEqOn:'EQ activo',mxEqFlat:'Plano',mxEqMud:'Quitar barro',mxEqAir:'Aire',mxEqWarm:'Cálido',mxEqVoc:'Voz al frente',mxEqBass:'Menos graves',
  mxEqHelp:'Arrastra un punto: frecuencia y ganancia · rueda sobre un punto: ancho (Q) · doble clic: restablecer el punto · teclas 1–5 eligen punto, flechas lo mueven',
  mxBand:'Punto {n}',mxFreq:'Frecuencia',mxDb:'Ganancia',mxQ:'Ancho (Q)',mxEqAria:'Curva de EQ de {s}',mxEqFor:'Canal',
  mxCut:'Cortar',mxCutT:'Modo corte (C): haz clic en una canción para cortarla ahí (se ajusta a tiempos, Shift a semicorcheas, Alt libre)',mxSplit:'Dividir',mxSplitT:'Dividir en el cursor (S)',
  mxDup:'Duplicar',mxDupT:'Duplicar el fragmento justo después (Ctrl/⌘+D)',mxMuteR:'Silenciar',mxMuteRT:'Silenciar el fragmento (M)',mxDel:'Borrar',mxDelT:'Borrar el fragmento (Supr)',mxDelBT:'En B: borra esos compases y cierra el hueco (también la voz de ese tramo)',
  mxRGain:'Nivel del fragmento',mxRFi:'Entrada',mxRFo:'Salida',mxThrow:'Eco al final',mxThrowT:'El eco se abre solo en el último tiempo del fragmento y sigue sonando después',
  mxNoSel:'Haz clic en un fragmento de la línea de tiempo para elegirlo, o divide una canción con S.',mxSelR:'{s} · fragmento {n} · {a}–{b}',mxBeats:'{n} tiempos',
  mxBBars:'Alargar o acortar la base',mxBBarsP:'Desde el compás bajo el cursor; todo lo que sigue se mueve, también la voz.',mxRepeat:'Repetir {n} compases',mxRemove:'Quitar {n} compases',
  mxTrans:'Efectos de transición',mxRiser:'Riser',mxDown:'Downlifter',mxTrAdd:'Añadir {s} en el compás del cursor',mxTLen:'Duración',mxTLv:'Nivel',mxTrSel:'{s} · compás {n}',mxTrNone:'Arrastra una transición sobre la regla para moverla.',
  mxDuck:'Atenuar la base automáticamente',mxDuckT:'La base baja unos dB mientras suena la voz',mxDuckAmt:'Profundidad',
  mxResetEd:'Deshacer toda la edición de {s}',mxWidth:'Amplitud estéreo',mxCompare:'Comparar',mxCompareT:'Mantén pulsado para oírlo sin efectos ni EQ',mxSolo:'Solo',mxMuteS:'Silenciar {s}',mxSoloT:'Solo {s}',mxMeter:'Nivel de salida',
  mxEdHelp:'S dividir · C cortar · Supr borrar · M silenciar · Ctrl/⌘+D duplicar · Esc quitar selección · arrastra un fragmento para moverlo (compases, Shift tiempos, Mover libre sin ajuste) · arrastra los puntos de las esquinas para las entradas y salidas',
  mxKeysH:'Espacio reproducir/pausa · ← → un compás · L bucle · S dividir · C cortar'}
});

/* studio: smart EQ / smart FX (local analysis), undo / redo buttons (he / en / ar / ru / es) */
CR.addStrings({
he:{mxSmEq:'EQ חכם ✨',mxSmEqT:'מנתח את הסאונד של הערוץ ומכוון את ה־EQ בשבילו (בלי אינטרנט, בחינם)',mxSmFx:'אפקטים חכמים ✨',mxSmFxT:'בוחר אפקטים וכמויות לשירה לפי הקצב, הביט והקול (בלי אינטרנט, בחינם)',
  mxSmDone:'מה עשיתי:',mxUndo:'ביטול',mxRedo:'חזרה',mxUndoT:'ביטול (Ctrl/⌘+Z)',mxRedoT:'חזרה (Ctrl/⌘+Shift+Z)',
  mxSnLow:'ניקיתי נמוכים מתחת ל־{f}',mxSnMud:'חתכתי בוץ ב־{f}',mxSnHarsh:'ריככתי חדות ב־{f}',mxSnPres:'הוספתי נוכחות ב־{f}',mxSnAir:'הוספתי אוויר מ־{f}',mxSnCarve:'פיניתי מקום לשירה ב־{f}',
  mxSnDelay:'אקו {n} לפי {bpm} BPM',mxSnBusy:'ביט עמוס: מעט ריוורב ואקו',mxSnSparse:'ביט אוורירי: יותר חלל ואקו',mxSnMid:'ריוורב ואקו במינון בינוני',mxSnWet:'השירה כבר רטובה: מעט ריוורב',mxSnDry:'שירה יבשה: הוספתי חלל',
  mxSnCmp:'קומפרסור {p}% לפי הדינמיקה של הקול',mxSnWarm:'קול כהה: הוספתי חום',mxSnBright:'קול בהיר: בלי סטורציה',mxSnDuck:'הנמכה אוטומטית של הביט ב־{db} dB'},
en:{mxSmEq:'Smart EQ ✨',mxSmEqT:'Analyses this channel\'s sound and sets the EQ for it (offline, free)',mxSmFx:'Smart effects ✨',mxSmFxT:'Picks vocal effects and amounts from the tempo, the beat and the voice (offline, free)',
  mxSmDone:'What I did:',mxUndo:'Undo',mxRedo:'Redo',mxUndoT:'Undo (Ctrl/⌘+Z)',mxRedoT:'Redo (Ctrl/⌘+Shift+Z)',
  mxSnLow:'cleaned the lows under {f}',mxSnMud:'cut mud at {f}',mxSnHarsh:'softened harshness at {f}',mxSnPres:'added presence at {f}',mxSnAir:'added air from {f}',mxSnCarve:'made room for the vocals at {f}',
  mxSnDelay:'{n} echo at {bpm} BPM',mxSnBusy:'busy beat: little reverb and echo',mxSnSparse:'sparse beat: more space and echo',mxSnMid:'medium reverb and echo',mxSnWet:'the vocals are already wet: little reverb',mxSnDry:'dry vocals: added space',
  mxSnCmp:'compressor {p}% from the voice\'s dynamics',mxSnWarm:'dark voice: added warmth',mxSnBright:'bright voice: no saturation',mxSnDuck:'beat ducks by {db} dB'},
ar:{mxSmEq:'EQ ذكي ✨',mxSmEqT:'يحلل صوت هذا المسار ويضبط الـ EQ له (دون إنترنت، مجانًا)',mxSmFx:'مؤثرات ذكية ✨',mxSmFxT:'يختار مؤثرات الغناء ومقاديرها حسب الإيقاع والخلفية والصوت (دون إنترنت، مجانًا)',
  mxSmDone:'ما فعلته:',mxUndo:'تراجع',mxRedo:'إعادة',mxUndoT:'تراجع (Ctrl/⌘+Z)',mxRedoT:'إعادة (Ctrl/⌘+Shift+Z)',
  mxSnLow:'نظّفت المنخفضات تحت {f}',mxSnMud:'قصصت الطين عند {f}',mxSnHarsh:'خففت الحدة عند {f}',mxSnPres:'أضفت حضورًا عند {f}',mxSnAir:'أضفت هواءً من {f}',mxSnCarve:'أفسحت مكانًا للغناء عند {f}',
  mxSnDelay:'إيكو {n} حسب {bpm} BPM',mxSnBusy:'إيقاع مزدحم: صدى وإيكو قليلان',mxSnSparse:'إيقاع خفيف: مساحة وإيكو أكثر',mxSnMid:'صدى وإيكو بمقدار متوسط',mxSnWet:'الغناء فيه صدى أصلًا: صدى قليل',mxSnDry:'غناء جاف: أضفت مساحة',
  mxSnCmp:'ضاغط {p}% حسب ديناميكية الصوت',mxSnWarm:'صوت داكن: أضفت دفئًا',mxSnBright:'صوت ساطع: بلا تشبع',mxSnDuck:'خفض الإيقاع تلقائيًا {db} dB'},
ru:{mxSmEq:'Умный EQ ✨',mxSmEqT:'Анализирует звук канала и настраивает эквалайзер под него (без интернета, бесплатно)',mxSmFx:'Умные эффекты ✨',mxSmFxT:'Подбирает эффекты для вокала и их долю по темпу, биту и голосу (без интернета, бесплатно)',
  mxSmDone:'Что сделано:',mxUndo:'Отменить',mxRedo:'Повторить',mxUndoT:'Отменить (Ctrl/⌘+Z)',mxRedoT:'Повторить (Ctrl/⌘+Shift+Z)',
  mxSnLow:'убрал низы ниже {f}',mxSnMud:'срезал муть на {f}',mxSnHarsh:'смягчил резкость на {f}',mxSnPres:'добавил присутствие на {f}',mxSnAir:'добавил воздух от {f}',mxSnCarve:'освободил место для вокала на {f}',
  mxSnDelay:'эхо {n} под {bpm} BPM',mxSnBusy:'плотный бит: мало реверба и эха',mxSnSparse:'редкий бит: больше пространства и эха',mxSnMid:'реверб и эхо в меру',mxSnWet:'вокал уже с ревером: немного реверба',mxSnDry:'сухой вокал: добавил пространство',
  mxSnCmp:'компрессор {p}% по динамике голоса',mxSnWarm:'тёмный голос: добавил теплоты',mxSnBright:'яркий голос: без сатурации',mxSnDuck:'бит приглушается на {db} дБ'},
es:{mxSmEq:'EQ inteligente ✨',mxSmEqT:'Analiza el sonido de este canal y ajusta el EQ para él (sin conexión, gratis)',mxSmFx:'Efectos inteligentes ✨',mxSmFxT:'Elige los efectos de la voz y su cantidad según el tempo, la base y la voz (sin conexión, gratis)',
  mxSmDone:'Lo que hice:',mxUndo:'Deshacer',mxRedo:'Rehacer',mxUndoT:'Deshacer (Ctrl/⌘+Z)',mxRedoT:'Rehacer (Ctrl/⌘+Shift+Z)',
  mxSnLow:'limpié los graves bajo {f}',mxSnMud:'quité barro en {f}',mxSnHarsh:'suavicé la dureza en {f}',mxSnPres:'añadí presencia en {f}',mxSnAir:'añadí aire desde {f}',mxSnCarve:'hice sitio a la voz en {f}',
  mxSnDelay:'eco {n} a {bpm} BPM',mxSnBusy:'base cargada: poca reverb y eco',mxSnSparse:'base ligera: más espacio y eco',mxSnMid:'reverb y eco moderados',mxSnWet:'la voz ya tiene reverb: poca reverb',mxSnDry:'voz seca: añadí espacio',
  mxSnCmp:'compresor {p}% según la dinámica de la voz',mxSnWarm:'voz oscura: añadí calidez',mxSnBright:'voz brillante: sin saturación',mxSnDuck:'la base baja {db} dB'}
});

/* ---------- constants & state ---------- */
const IDS=['vocals','drums','bass','other'];
const LET=['A','B'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const LS='chordroom.mashup.v1';
const FADES=[0,1,4,8,16];                  // beats: off, 1 beat, 1 bar, 2 bars, 4 bars
const STARTS=['all','pre','vocal'];
const DEF_USE=[{vocals:true,drums:false,bass:false,other:false},{vocals:false,drums:true,bass:true,other:true}];
const MAX_BYTES=250*1024*1024;
const ACCEPT='audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus,.aif,.aiff';
// the quick separation worker lives next to this script (keeps its ?v= cache-busting query)
const QW=(()=>{const s=document.currentScript&&document.currentScript.src;try{return s?new URL('quicksep-worker.js'+new URL(s).search,s).href:'assets/quicksep-worker.js'}catch(e){return 'assets/quicksep-worker.js'}})();
const newSlot=i=>({i,use:{...DEF_USE[i]},gain:{vocals:1,drums:1,bass:1,other:1},mute:{vocals:false,drums:false,bass:false,other:false},song:null,loading:null,tok:0});
const M={built:false,visible:false,slots:[newSlot(0),newSlot(1)],tempo:'B',custom:0,semis:null,align:null,nudge:0,fadeIn:4,fadeOut:4,startA:'pre',
  vol:[1,1],fmt:'wav',onlyLoop:false,loop:null,loopOn:false,loopBars:8,zoom:1,view0:0,pos:0,owner:undefined,exporting:false,exp:null,
  msg:'',msgErr:false,pair:null,lastO:null,pickFor:0,pickFrom:null,drag:null,hover:null,lastBeat:null,
  gridOn:false,gLane:0,undo:[],redo:[],gk:null,
  freeOn:false,sel:null,fk:null,   /* freemove: free move mode, the selected clip (0 = A, 1 = B), the arrow-key burst */   /* griddrag: grid mode, the lane the arrows move, undo/redo of alignment + grid edits */
  /* studio: FX + EQ per slot, regions per slot (null = untouched), transitions, auto-duck, width, solo/mute, edit tools */
  fx:[MXFX.DEF_FX(),MXFX.DEF_FX()],eq:[MXFX.DEF_EQ(),MXFX.DEF_EQ()],reg:[null,null],tr:[],duckOn:false,duckAmt:6,width:1,
  solo:[false,false],smute:[false,false],cutOn:false,rsel:null,tsel:null,lane:0,eqSlot:0,eqBand:0,cmp:false,bN:4,hov:null,fxNote:null,eqNote:[null,null]};
const CACHE=new Map();                    // song key → {an, cues, stems, kind}: analysis + separated stems for this session
const songKey=(name,buf)=>name+'|'+Math.round(buf.duration*1000)+'|'+buf.length;
// memory cap: stems are 4 stereo float32 buffers per song (≈340 MB for 4 min), so keep the stems of the two slots' songs
// plus at most ~120 M floats more; analysis/cues stay cached for everything (tiny). Evicts least-recently-used first.
const CACHE_FLOATS=120e6,stemFloats=st=>st?Object.values(st).reduce((a,b)=>a+(b&&b.length?b.length*b.numberOfChannels:0),0):0;
function cachePut(k,v){const o=CACHE.get(k)||{};CACHE.delete(k);CACHE.set(k,{...o,...v});
  const live=new Set(M.slots.map(s=>s.song&&s.song.key).filter(Boolean));
  let tot=0;const ks=[...CACHE.keys()].reverse();      // newest first
  for(const key of ks){const e=CACHE.get(key);if(!e.stems)continue;tot+=stemFloats(e.stems);if(tot>CACHE_FLOATS&&!live.has(key)){e.stems=null;e.kind=null}}
  while(CACHE.size>12){const first=CACHE.keys().next().value;CACHE.delete(first)}}
// leaving the view: drop cached stems that no slot is using (a paid separation of the loaded songs is kept)
function cacheTrim(){const live=new Set(M.slots.map(s=>s.song&&s.song.key).filter(Boolean));for(const [k,e] of CACHE)if(e.stems&&!live.has(k)){e.stems=null;e.kind=null}}

/* ---------- model ---------- */
const song=i=>M.slots[i].song;
const an=i=>{const s=song(i);return s&&s.an};
function firstDown(a){const T=60/a.bpm;let p=mod(a.offset||0,T)+mod(a.down||0,4)*T;return p>30?mod(a.offset||0,T):p}
// how to count a song's beat against the target tempo: as is, doubled or halved (the one that needs the least stretch)
function fitK(b,T){let best=1,bd=Infinity;for(const k of [1,2,0.5]){const d=Math.abs(Math.log(b*k/T));if(d<bd-1e-9){bd=d;best=k}}return best}
function target(){
  const A=an(0),B=an(1);
  if(M.tempo==='custom'&&M.custom>=40&&M.custom<=250)return M.custom;
  if(M.tempo==='A'&&A)return A.bpm;
  return B?B.bpm:A?A.bpm:120;
}
// key choices for A over B: exact (same Camelot key = B's key or its relative major/minor), neighbours (±1 on the wheel), original
function keyOpts(){
  const A=an(0),B=an(1);if(!A||!B||!A.key||!B.key)return null;
  const cb=CR.camOf(B.key),all=[];
  for(let s=-6;s<=5;s++){const k={pc:mod(A.key.pc+s,12),mode:A.key.mode},rel=CR.camRel(CR.camOf(k),cb);all.push({s,k,rel,q:rel===0||rel===1?2:rel>=2?1:0})}
  const by=q=>all.filter(o=>o.q===q).sort((a,b)=>Math.abs(a.s)-Math.abs(b.s)||a.s-b.s);
  const best=by(2)[0]||all.find(o=>o.s===0),nb=by(1);
  // auto: the exact match, unless it needs a big shift and a Camelot neighbour is much closer (a voice moved ±6 sounds bad)
  const cost=o=>Math.abs(o.s)+(o.q===2?0:o.q===1?2.5:10),auto=[best,...nb].sort((a,b)=>cost(a)-cost(b))[0];
  return {best,nb,orig:all.find(o=>o.s===0),auto,all};
}
function semis(){if(M.semis!=null)return M.semis;const k=keyOpts();return k?k.auto.s:0}
// A's vocal entry (source seconds, on one of A's bars): vocals stem energy → 'vocal' cue → 'intro' cue → first bar with sound.
// With a vocals stem the entry is refined to its onset (5.8 ms frames) and checked against A's downbeat: songs often get
// their downbeat 1–2 beats off, and then the vocal landed mid-bar on B. Phrase onsets vote for a beat phase (an onset in the
// last ⅔ beat before a beat counts for that beat); when the first entry sits on beat 2 or 3 of A's bar and the votes agree
// (or there are none), A's downbeat is moved onto that beat (s.an.down, in this session; never over a user grid fix). An
// entry on beat 4 is a pickup → the next downbeat. Result: vA is always on one of A's (drawn) bar lines.
function vocalOnset(s,A,fd,k){
  const b=s.stems.vocals,sr=b.sampleRate,L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L,H=256,beat=60/A.bpm;
  const nf=Math.floor(L.length/H)-1,env=new Float32Array(Math.max(0,nf));
  for(let f=0;f<nf;f++){let q=0;for(let j=f*H,z=j+2*H;j<z;j+=2){const x=L[j]+R[j];q+=x*x}env[f]=Math.sqrt(q/H)}
  const ft=f=>(f*H+H)/sr,fo=t=>Math.round((t*sr-H)/H);
  const srt=Float32Array.from(env).sort(),p90=srt[Math.floor(srt.length*0.9)]||0;if(p90<1e-4)return null;
  const hi=0.3*p90,lo=0.12*p90,quiet=Math.round(0.75*beat*sr/H);
  // the first entry: first frame above `hi` from one beat before the first vocal bar
  let f0=-1;for(let f=Math.max(0,fo(fd+k*240/A.bpm-beat));f<nf;f++)if(env[f]>hi){f0=f;break}
  if(f0<0)return null;
  while(f0>0&&env[f0-1]>lo&&env[f0-1]<env[f0])f0--;                     // back to the foot of the rise
  const ph=t=>{const q=Math.floor((t-fd)/beat+2/3);return {b:q,p:mod(q,4)}};      // beat index from A's first downbeat
  const votes=[0,0,0,0];let run=0;
  for(let f=f0+1;f<nf;f++){if(env[f]<lo){run++;continue}if(env[f]>hi&&run>=quiet){votes[ph(ft(f)).p]++}if(env[f]>=lo)run=0}
  return {t:ft(f0),...ph(ft(f0)),votes};
}
function vocalStart(s){
  if(s.vStart)return s.vStart;
  let A=s.an,bar=240/A.bpm,fd=firstDown(A);const dur=s.buffer.duration,k0=-Math.floor(fd/bar),n=Math.floor((dur-fd)/bar);
  const at=k=>fd+k*bar;let res=null;
  const perBar=(get,len,sr)=>{const e=[];for(let k=k0;k<n;k++){const a=Math.max(0,Math.floor(at(k)*sr)),z=Math.min(len,Math.floor(at(k+1)*sr));let q=0,c=0;for(let j=a;j<z;j+=8){const x=get(j);q+=x*x;c++}e.push({k,v:c?Math.sqrt(q/c):0})}return e};
  const firstOn=(e,f)=>{const v=e.map(x=>x.v).sort((x,y)=>x-y),p90=v[Math.floor(v.length*0.9)]||0;if(p90<1e-4)return null;for(let i=0;i+1<e.length;i++)if(e[i].v>f*p90&&e[i+1].v>f*p90)return e[i].k;return null};
  if(s.stems&&s.stems.vocals){const b=s.stems.vocals,L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L;const k=firstOn(perBar(j=>L[j]+R[j],L.length,b.sampleRate),0.25);
    if(k!=null){res={t:Math.max(0,at(k)),src:'stem'};
      const on=vocalOnset(s,A,fd,k);
      if(on){const beat=60/A.bpm,tb=fd+on.b*beat;res.on=on.t;res.t=tb;
        if((on.p===1||on.p===2)&&!s.gfix&&on.votes[on.p]>=on.votes[0]){s.an=A={...A,down:mod((A.down||0)+on.p,4)};fd=firstDown(A);res.rephase=on.p}   // A's downbeat is off: onto the vocal's beat
        else res.t=tb+(on.p===1?-1:on.p===2?2:on.p===3?1:0)*beat;    // beat 2 = just after the downbeat, beat 3/4 = a pickup
        res.t=Math.max(0,res.t)}}}
  if(!res){const c=(s.cues||[]).find(x=>x.k==='vocal')||(s.cues||[]).find(x=>x.k==='intro');if(c)res={t:c.t,src:c.k}}
  if(!res&&A.wave){const w=A.wave;const k=firstOn(perBar(j=>w.amp[j]||0,w.len,w.rate),0.12);if(k!=null)res={t:Math.max(0,at(k)),src:'wave'}}
  if(!res)res={t:Math.max(0,fd),src:'grid'};
  // on A's own bar grid (cues already are; keep it exact)
  res.t=Math.max(0,fd+Math.round((res.t-fd)/bar)*bar);if(res.t>=dur)res.t=Math.max(0,fd);
  s.vStart=res;return res;
}
function bCueBars(o){
  const b=song(1);if(!b||!o.rB)return [];
  return (b.cues||[]).map(c=>({k:c.k,bar:Math.round((c.t/o.rB-o.bar0)/o.bar)})).filter(c=>c.bar>=0);
}
// default target bar on B: its first drop, else its vocal entry, else 8 bars after the intro, else bar 1
function defAlign(o){
  const cs=bCueBars(o),f=k=>cs.find(c=>c.k===k);
  const c=f('drop')||f('vocal');if(c)return c.bar;
  const i=f('intro');return i?i.bar+8:0;
}
function model(){
  const a=song(0),b=song(1),A=a&&a.an,B=b&&b.an;if(!A&&!B)return null;
  const T=target(),o={T,beat:60/T,bar:240/T,hasA:!!A,hasB:!!B,semis:0,seg:[[],[]]};
  if(B){o.kB=fitK(B.bpm,T);o.rB=T/(B.bpm*o.kB);o.bar0=firstDown(B)/o.rB;
    o.seg[1]=segsOf(1,o,Infinity);o.t1=o.seg[1].length?Math.max(...o.seg[1].map(x=>x.x1)):o.bar0+o.bar}else o.bar0=0;
  if(A){
    o.kA=fitK(A.bpm,T);o.rA=T/(A.bpm*o.kA);o.semis=B?semis():0;
    const v=vocalStart(a);o.vA=v.t;o.vSrc=v.src;
    const barA=240/A.bpm;o.aIn=!B||M.startA==='all'?0:M.startA==='pre'?Math.max(0,o.vA-barA):o.vA;
    if(B){o.alignAuto=defAlign(o);o.align=M.align!=null?M.align:o.alignAuto;o.anchor=o.bar0+o.align*o.bar+M.nudge}
    else o.anchor=o.vA/o.rA;
    o.seg[0]=segsOf(0,o,B?o.t1:Infinity);const sa=o.seg[0];
    o.aStart=sa.length?Math.min(...sa.map(x=>x.x0)):o.anchor;o.aEnd=sa.length?Math.max(...sa.map(x=>x.x1)):o.anchor;
    if(!B)o.t1=Math.max(o.aEnd,o.beat);
  }
  o.t0=Math.min(0,A&&B?o.aStart:0,...o.seg[1].map(x=>x.x0));
  o.aOut=A?Math.min(o.aEnd,o.t1):0;
  o.fi=Math.max(0.005,M.fadeIn*o.beat);o.fo=Math.max(0.005,M.fadeOut*o.beat);
  o.nBars=Math.max(1,Math.ceil((o.t1-o.bar0)/o.bar));
  return o;
}
// source position of slot i at timeline time x
const srcPos=(i,o,x)=>i?x*o.rB:o.vA+(x-o.anchor)*o.rA;
// A's fade envelope (piecewise linear): 0 before its start, fade in, 1, fade out towards its end (or the mashup end)
function gA(o,x){
  if(!o.hasA)return 0;const s=o.aStart,e=o.aOut;if(x<s||x>e)return 0;
  let g=1;const fi=Math.min(o.fi,(e-s)/2),fo=Math.min(o.fo,(e-s)/2);
  if(x<s+fi)g=Math.min(g,(x-s)/fi);if(x>e-fo)g=Math.min(g,(e-x)/fo);return clamp(g,0,1);
}
// keep the musical position when the model changes (B's bars, else A's source time)
function mapPos(p,a,b){
  if(!a||!b)return p;
  if(a.hasB&&b.hasB)return b.bar0+(p-a.bar0)/a.bar*b.bar;
  if(a.hasA&&b.hasA)return b.anchor+(srcPos(0,a,p)-b.vA)/b.rA;
  return p;
}
const loopT=o=>M.loop&&o?{a:o.bar0+M.loop.a*o.bar,b:o.bar0+M.loop.b*o.bar}:null;

/* ---------- regions: cutting / arranging parts ----------
   A lane's audio = a list of regions {u0,u1,sh,g,fi,fo,m,th}. u0/u1 = the source range as timeline beats from the slot's
   origin in the ORIGINAL layout (A: its vocal anchor = bar `align` of B + nudge, B: its first bar), so the vocal-entry lock
   and every alignment control still move A as a whole; sh = how far the region was moved (beats), g = gain, fi/fo = fades
   (beats), m = muted, th = echo throw on its last beat. Beats are tempo-independent: one beat of A = 60/(bpm·k) source s.
   M.reg[i] = null → one region = the whole clip (A from `startA`). Placed regions ("segs") carry timeline x0/x1 + source s0;
   contiguous neighbours (same source, no fades) are played as one run, so a split alone never changes the sound; every other
   edit edge gets a 1 ms fade-in and a 4 ms overlapping tail (no clicks, keeps the downbeat). */
const RMAX=200,EPS=1e-6;
const origin=(i,o)=>i?o.bar0:o.anchor;
const newReg=(u0,u1)=>({u0,u1,sh:0,g:1,fi:0,fo:0,m:false,th:false});
function baseU(i,o){const s=song(i);return i?{u0:-o.bar0/o.beat,u1:(s.buffer.duration/o.rB-o.bar0)/o.beat}:{u0:(o.aIn-o.vA)/o.rA/o.beat,u1:(s.buffer.duration-o.vA)/o.rA/o.beat}}
function segsOf(i,o,lim){
  const s=song(i);if(!s)return [];const r=i?o.rB:o.rA,org=origin(i,o),out=[];
  const regs=M.reg[i]||[newReg(baseU(i,o).u0,baseU(i,o).u1)];
  regs.forEach((g,k)=>{let x0=org+(g.u0+g.sh)*o.beat,x1=org+(g.u1+g.sh)*o.beat,s0=i?(o.bar0+g.u0*o.beat)*o.rB:o.vA+g.u0*o.beat*o.rA;
    if(s0<0){x0+=-s0/r;s0=0}x1=Math.min(x1,lim);if(x1-x0<1e-4)return;
    const len=x1-x0;out.push({k:M.reg[i]?k:-1,x0,x1,s0,r,g:g.g,fi:Math.min(g.fi*o.beat,len/2),fo:Math.min(g.fo*o.beat,len/2),m:g.m,th:g.th})});
  return out;
}
// unmuted segments grouped into runs that play from one set of sources; envelope points [x, gain] (piecewise linear)
function runsOf(segs){
  const ss=segs.filter(x=>!x.m&&x.g>0).sort((a,b)=>a.x0-b.x0),runs=[];
  for(const sg of ss){const L=runs[runs.length-1],p=L&&L.segs[L.segs.length-1];
    if(p&&Math.abs(sg.x0-p.x1)<EPS&&Math.abs(sg.s0-(p.s0+(p.x1-p.x0)*p.r))<1e-5&&!p.fo&&!sg.fi){L.segs.push(sg);L.x1=sg.x1}
    else runs.push({x0:sg.x0,x1:sg.x1,s0:sg.s0,r:sg.r,segs:[sg]})}
  for(const R of runs){const f=R.segs[0],l=R.segs[R.segs.length-1],P=[[R.x0,0],[R.x0+Math.max(f.fi,0.001),f.g]];
    for(let j=1;j<R.segs.length;j++){const a=R.segs[j-1],b=R.segs[j];if(a.g!==b.g){P.push([b.x0-0.0025,a.g],[b.x0+0.0025,b.g])}}
    if(l.fo>0){P.push([R.x1-l.fo,l.g],[R.x1,0]);R.end=R.x1}else{P.push([R.x1,l.g],[R.x1+0.004,0]);R.end=R.x1+0.004}
    R.pts=P}
  return runs;
}
function envAt(P,x){if(x<=P[0][0])return P[0][1];for(let j=1;j<P.length;j++)if(x<=P[j][0]){const a=P[j-1],b=P[j],d=b[0]-a[0];return d>0?a[1]+(b[1]-a[1])*(x-a[0])/d:b[1]}return P[P.length-1][1]}
function envSched(p,P,pos,when){p.setValueAtTime(envAt(P,pos),when);for(const q of P)if(q[0]>pos)p.linearRampToValueAtTime(q[1],when+(q[0]-pos))}
// the segment heard at timeline x (first unmuted wins) → source time + display gain
function srcAt(i,o,x){
  let mu=null;for(const sg of o.seg[i]){if(x<sg.x0||x>sg.x1)continue;
    let f=sg.g;if(sg.fi>0&&x<sg.x0+sg.fi)f*=(x-sg.x0)/sg.fi;if(sg.fo>0&&x>sg.x1-sg.fo)f*=(sg.x1-x)/sg.fo;
    const q={s:sg.s0+(x-sg.x0)*sg.r,f,sg};if(!sg.m&&sg.g>0)return q;if(!mu)mu={...q,f:0.12,muted:true}}
  return mu;
}
// edit operations (callers push the undo snapshot)
function mat(i,o){if(!M.reg[i]){const b=baseU(i,o);M.reg[i]=[newReg(b.u0,b.u1)]}return M.reg[i]}
const placed=(i,o,g)=>({x0:origin(i,o)+(g.u0+g.sh)*o.beat,x1:origin(i,o)+(g.u1+g.sh)*o.beat});
function splitRaw(i,o,x,k){
  const regs=mat(i,o);if(k==null){k=-1;regs.forEach((g,j)=>{const p=placed(i,o,g);if(x>p.x0+EPS&&x<p.x1-EPS)k=j})}
  if(k<0||regs.length>=RMAX)return -1;const g=regs[k],u=(x-origin(i,o))/o.beat-g.sh;if(u<=g.u0+1e-4||u>=g.u1-1e-4)return -1;
  regs.splice(k,1,{...g,u1:u,fo:0,th:false},{...g,u0:u,fi:0});return k+1;
}
function canSplit(i,o,x){return o.seg[i].some(sg=>x>sg.x0+EPS&&x<sg.x1-EPS)}
const laneOk=(i,o)=>!!(o&&song(i)&&(i?o.hasB:o.hasA));
// insert Db beats of silence at timeline X in every lane (regions across X are split; later ones move); transitions follow
function insertTime(o,X,Db){
  for(const j of [0,1]){if(!laneOk(j,o)||!o.seg[j].some(sg=>sg.x1>X+EPS))continue;
    const regs=mat(j,o);for(let k=regs.length-1;k>=0;k--){const p=placed(j,o,regs[k]);if(p.x0<X-EPS&&p.x1>X+EPS)splitRaw(j,o,X,k)}
    for(const g of mat(j,o)){if(placed(j,o,g).x0>=X-EPS)g.sh+=Db}}
  const kb=Math.round((X-o.bar0)/o.bar);if(Math.abs(Db/4-Math.round(Db/4))<1e-6)for(const tr of M.tr)if(tr.bar>=kb)tr.bar+=Math.round(Db/4);
}
// cut the timeline range [X0, X1] out of every lane and close the gap
function cutTime(o,X0,X1){
  const Db=(X1-X0)/o.beat;
  for(const j of [0,1]){if(!laneOk(j,o)||!o.seg[j].some(sg=>sg.x1>X0+EPS))continue;
    let regs=mat(j,o);for(const X of [X0,X1])for(let k=regs.length-1;k>=0;k--){const p=placed(j,o,regs[k]);if(p.x0<X-EPS&&p.x1>X+EPS)splitRaw(j,o,X,k)}
    M.reg[j]=regs=regs.filter(g=>{const p=placed(j,o,g);return !(p.x0>=X0-EPS&&p.x1<=X1+EPS)});
    for(const g of regs)if(placed(j,o,g).x0>=X1-EPS)g.sh-=Db}
  const k0=Math.round((X0-o.bar0)/o.bar),n=Math.round(Db/4);if(Math.abs(Db/4-n)<1e-6){M.tr=M.tr.filter(t=>t.bar<k0||t.bar>=k0+n);for(const t of M.tr)if(t.bar>=k0+n)t.bar-=n}
}
function edited(){M.lastO=null;if(M.rsel&&!(M.reg[M.rsel.i]&&M.reg[M.rsel.i][M.rsel.k]))M.rsel=null;if(M.tsel!=null&&!M.tr[M.tsel])M.tsel=null;changed();renderEdit()}
const snapX=(o,x,free,fine)=>free?x:o.bar0+Math.round((x-o.bar0)/(fine?o.beat/4:o.beat))*(fine?o.beat/4:o.beat);
function splitAt(i,x,free,fine){
  const o=model();if(!laneOk(i,o)||M.gridOn)return false;x=snapX(o,x,free,fine);if(!canSplit(i,o,x))return false;
  mPush();const k=splitRaw(i,o,x);if(k<0){M.undo.pop();return false}M.rsel={i,k};M.tsel=null;M.lane=i;edited();return true;
}
function selReg(){const r=M.rsel;return r&&M.reg[r.i]&&M.reg[r.i][r.k]?M.reg[r.i][r.k]:null}
function deleteSel(){
  const g=selReg(),o=model();if(!g||!o)return;const i=M.rsel.i;mPush();
  if(i===1){const p=placed(1,o,g);M.reg[1].splice(M.rsel.k,1);const m2=model();cutTimeKeep(m2,p.x0,p.x1)}else M.reg[0].splice(M.rsel.k,1);
  M.rsel=null;edited();
}
// B delete: its own region is already gone; close the gap only when no other B region covers that range
function cutTimeKeep(o,X0,X1){if(o.seg[1].some(sg=>sg.x0<X1-EPS&&sg.x1>X0+EPS))return;cutTime(o,X0,X1)}
function muteSel(){const g=selReg();if(!g)return;mPush();g.m=!g.m;edited()}
function dupSel(){
  const g=selReg(),o=model();if(!g||!o)return;const i=M.rsel.i,regs=M.reg[i];if(regs.length>=RMAX)return;
  mPush();const len=g.u1-g.u0,X=placed(i,o,g).x1;
  if(i===1)insertTime(o,X,len);else for(const r of regs)if(r!==g&&placed(0,o,r).x0>=X-EPS)r.sh+=len;
  const k=M.reg[i].indexOf(g),cp={...g,sh:g.sh+len};M.reg[i].splice(k+1,0,cp);M.rsel={i,k:k+1};edited();
}
// B: repeat / remove N bars from the bar under the playhead (everything after moves, vocals included)
function bBars(n,rm){
  const o=model();if(!laneOk(1,o))return;const k=Math.floor((heard()-o.bar0)/o.bar+1e-6),X0=o.bar0+k*o.bar,X1=X0+n*o.bar;
  if(X0>=o.t1-EPS)return;mPush();
  if(rm){cutTime(o,X0,X1)}
  else{const regs=mat(1,o);for(const X of [X0,X1])for(let j=regs.length-1;j>=0;j--){const p=placed(1,o,regs[j]);if(p.x0<X-EPS&&p.x1>X+EPS)splitRaw(1,o,X,j)}
    const inside=M.reg[1].filter(g=>{const p=placed(1,o,g);return p.x0>=X0-EPS&&p.x1<=X1+EPS});
    insertTime(o,X1,n*4);for(const g of inside)M.reg[1].push({...g,sh:g.sh+n*4})}
  M.rsel=null;edited();
}
function resetLane(i){if(!M.reg[i])return;mPush();M.reg[i]=null;if(M.rsel&&M.rsel.i===i)M.rsel=null;edited()}
// transitions: riser ends on its bar, downlifter starts on it
const TRK=['riser','down'],TRL=[1,2,4,8];
function trPlace(o,tr){const xb=o.bar0+tr.bar*o.bar,d=tr.len*o.bar;return tr.k==='riser'?{x0:xb-d,x1:xb,d}:{x0:xb,x1:xb+d,d}}
function addTr(k){const o=model();if(!o||M.tr.length>=32)return;const b=Math.max(0,Math.round((heard()-o.bar0)/o.bar));mPush();M.tr.push({k,bar:b,len:k==='riser'?4:2,lv:0.7});M.tsel=M.tr.length-1;M.rsel=null;edited()}
// auto-duck: B dips under A's vocals; curve sampled at 100 Hz on the timeline, computed from the stem (same for preview + export)
function duckCurve(o){
  const a=song(0);if(!M.duckOn||!(M.duckAmt>0)||!o.hasA||!o.hasB||!a||effLvl(0)<=0)return null;
  const src=a.stems&&M.slots[0].use.vocals?a.stems.vocals:a.buffer;
  if(!a.venv||a.venvSrc!==src){a.venv=MXFX.vocalEnv(src);a.venvSrc=src}
  const key=JSON.stringify([o.seg[0].map(x=>[x.x0,x.x1,x.s0,x.g,x.fi,x.fo,x.m]),o.t0,o.t1,M.duckAmt,o.fi,o.fo]);if(a.dk&&a.dk.key===key)return a.dk;
  const env=a.venv,runs=runsOf(o.seg[0]),N=Math.max(2,Math.ceil((o.t1-o.t0)*100)+2),lev=new Float32Array(N);
  for(let j=0;j<N;j++){const x=o.t0+j/100;let v=0;for(const R of runs){if(x<R.x0||x>R.x1)continue;const s=R.s0+(x-R.x0)*R.r,f=s*100,f0=Math.floor(f);if(f0<0||f0+1>=env.length)continue;
    v+=(env[f0]+(env[f0+1]-env[f0])*(f-f0))*envAt(R.pts,x)}lev[j]=v*gA(o,x)}
  const srt=Float32Array.from(lev).filter(x=>x>1e-5).sort(),ref=srt.length?srt[Math.floor(srt.length*0.95)]:0,out=new Float32Array(N);
  const aa=1-Math.exp(-1/(100*0.015)),ar=1-Math.exp(-1/(100*0.25));let y=0;
  for(let j=0;j<N;j++){const l=ref>0?clamp(lev[j]/ref,0,1):0;y+=(l>y?aa:ar)*(l-y);out[j]=Math.pow(10,-M.duckAmt*y/20)}
  a.dk={key,t0:o.t0,v:out};return a.dk;
}
const effLvl=i=>M.vol[i]*(M.smute[i]?0:1)*(M.solo.some(Boolean)&&!M.solo[i]?0:1);

/* ---------- griddrag: a song's own grid (fix a wrong downbeat), undo ----------
   Moving slot i's grid by d source seconds: its first downbeat (offset/down) moves by d; A's vocal entry (on one of A's bars)
   rides along, so after the edit A's corrected bar locks onto B's bar `align` again; B's structure cues ride along and, when
   B's first downbeat wraps past a bar, `align`/loop are renumbered so A stays on the same musical bar of B. */
const tlOf=(i,o,src)=>i?src/o.rB:o.anchor+(src-o.vA)/o.rA;           // source seconds of slot i → timeline
function gridBase(i){const s=song(i);return s?{key:s.key,an:s.an,vStart:s.vStart,cues:s.cues}:null}
function gridShift(i,d,b,o){
  const s=song(i);if(!s||!b||s.key!==b.key)return;const A=b.an,T=60/A.bpm,bar=4*T,fd=firstDown(A),raw=fd+d,fdN=mod(raw,bar),off=mod(fdN,T);
  s.an={...A,offset:off,down:Math.round((fdN-off)/T)%4};s.gfix=true;
  if(b.vStart){let vt=b.vStart.t+d;while(vt<0)vt+=bar;while(vt>=s.buffer.duration&&vt-bar>=0)vt-=bar;s.vStart={...b.vStart,t:vt}}else s.vStart=null;
  s.cues=(b.cues||[]).map(c=>({...c,t:Math.max(0,c.t+d)}));
  cachePut(s.key,{an:s.an,cues:s.cues});
  if(i===1&&o&&o.rB){const w=Math.round((raw-fdN)/(o.bar*o.rB));if(w){M.align=(M.align!=null?M.align:o.align!=null?o.align:0)+w;if(M.loop)M.loop={a:M.loop.a+w,b:M.loop.b+w};
    /* studio: B's regions (beats from its first bar) and the transitions (bars) are renumbered too, so the edits stay on the same music */
    if(M.reg[1])for(const g of M.reg[1]){g.u0+=4*w;g.u1+=4*w}for(const tr of M.tr)tr.bar+=w}}
}
function mSnap(snd){return {align:M.align,nudge:M.nudge,loop:M.loop,g:[gridBase(0),gridBase(1)],reg:MXFX.clone(M.reg),tr:MXFX.clone(M.tr),
  ...(snd?{snd:MXFX.clone({fx:M.fx,eq:M.eq,duckOn:M.duckOn,duckAmt:M.duckAmt,fxNote:M.fxNote,eqNote:M.eqNote})}:{})}}   /* studio: regions + transitions; sound only for smart EQ/FX steps */   /* studio: regions + transitions too */
function mPush(sn){M.undo.push(sn||mSnap());if(M.undo.length>60)M.undo.shift();M.redo=[];M.gk=null;M.fk=null;updUR()}
function mRestore(sn){M.align=sn.align;M.nudge=sn.nudge;M.loop=sn.loop;if(sn.snd){Object.assign(M,MXFX.clone(sn.snd));fxApply(0);fxApply(1);if(M.built){renderRack(0);renderRack(1);renderEq();renderSmart()}}if(sn.reg){M.reg=MXFX.clone(sn.reg);M.tr=MXFX.clone(sn.tr)}if(M.rsel&&!(M.reg[M.rsel.i]&&M.reg[M.rsel.i][M.rsel.k]))M.rsel=null;if(M.tsel!=null&&!M.tr[M.tsel])M.tsel=null;
  sn.g.forEach((x,i)=>{const s=song(i);if(x&&s&&s.key===x.key){s.an=x.an;s.vStart=x.vStart;s.cues=x.cues;cachePut(s.key,{an:s.an,cues:s.cues})}});
  const f=document.activeElement,fs=f&&f.closest&&f.closest('[id^="mxSlot"]'),fa=fs&&f.dataset.a;
  renderSlot(0);renderSlot(1);if(fs){const n=(fa&&fs.querySelector('[data-a="'+fa+'"]'))||fs.querySelector('button');if(n)n.focus()}changed();renderEdit()}
const sameSongs=sn=>sn.g.every((x,i)=>(x?x.key:null)===(song(i)?song(i).key:null));
function mUndo(){while(M.undo.length&&!sameSongs(M.undo[M.undo.length-1]))M.undo.pop();if(!M.undo.length)return false;const sn=M.undo.pop();M.redo.push(mSnap(!!sn.snd));mRestore(sn);M.gk=null;updUR();return true}
function mRedo(){while(M.redo.length&&!sameSongs(M.redo[M.redo.length-1]))M.redo.pop();if(!M.redo.length)return false;const sn=M.redo.pop();M.undo.push(mSnap(!!sn.snd));mRestore(sn);M.gk=null;updUR();return true}
const mClearUndo=()=>{M.undo=[];M.redo=[];M.gk=null;updUR()};
function updUR(){const u=$('#mxEdBody [data-ed="undo"]'),r=$('#mxEdBody [data-ed="redo"]');if(u)u.disabled=!M.undo.length;if(r)r.disabled=!M.redo.length}
// arrow keys in grid mode: the last dragged lane's grid ±1 ms (Shift ±10 ms), one undo step per burst
function gridKey(ms){
  const o=model();let i=M.gLane;if(!song(i))i=song(0)?0:1;const s=song(i);if(!o||!s)return;
  const tn=performance.now();if(!M.gk||M.gk.i!==i||tn-M.gk.t>900){const sn=mSnap();mPush(sn);M.gk={i,b:sn.g[i],acc:0,o}}
  const k=M.gk;k.t=tn;k.acc=Math.round((k.acc+ms/1000)*1e6)/1e6;
  const al=M.undo[M.undo.length-1];M.align=al.align;M.loop=al.loop;M.reg=MXFX.clone(al.reg);M.tr=MXFX.clone(al.tr);     // renumbering is computed from the burst's start
  gridShift(i,k.acc,k.b,k.o);changed();
}

/* ---------- freemove: free / ms move of a clip ----------
   A moves its own anchor (nudge, whole bars folded into `align`). B always starts at timeline 0 on its own grid, so moving
   B by d = moving A by −d (the relative alignment is what changes); the view follows B so B is what moves on screen. */
const LOCK=5e-5;                                     // |nudge| below 0.05 ms = locked on the bar
const r6=x=>Math.round(x*1e6)/1e6;
const fmtMs=x=>{const v=Math.round(Math.abs(x)*1e4)/10;return (x>=5e-5?'+':x<=-5e-5?'−':'±')+(v%1?v.toFixed(1):String(v))+'\u00a0ms'};
function moveA(d,o){
  if(M.align==null)M.align=o.align;M.nudge=r6(M.nudge+d);
  const w=Math.round(M.nudge/o.bar);if(w){M.align+=w;M.nudge=r6(M.nudge-w*o.bar)}
}
// arrow keys on the selected clip: ±1 ms (Shift 10, Alt 0.1), one undo step per burst
function freeKey(ms){
  const o=model();if(!o||!o.hasA||!o.hasB||M.sel==null)return;
  const tn=performance.now();if(!M.fk||M.fk.i!==M.sel||tn-M.fk.t>900){mPush();M.fk={i:M.sel,acc:0}}
  const k=M.fk;k.t=tn;k.acc=r6(k.acc+ms/1000);const d=ms/1000*(M.sel?-1:1);moveA(d,o);if(M.sel)M.view0+=d;
  M.fdx={i:M.sel,d:k.acc,t:tn};changed();
}
function renderOff(o){
  const A=an(0),B=an(1),lk=$('#mxLock'),on=!!(A&&B)&&Math.abs(M.nudge)<LOCK;
  if(lk){lk.textContent=A&&B?(on?t('mxLockOn',{n:o.align+1}):t('mxLockOff',{n:o.align+1,ms:'\u2066'+fmtMs(M.nudge)+'\u2069'})):'';lk.classList.toggle('on',on)}   /* griddrag */
  const of=$('#mxOff');of.textContent=fmtMs(M.nudge);of.title=t('mxOffset',{ms:Math.round(M.nudge*1e4)/10});
}

/* ---------- audio engine ---------- */
let c=null;
const E={ready:false,p:null,st:[null,null],dl:[null,null],fade:[null,null],lvl:[null,null],route:[null,null],master:null,lim:null,lat:0,noStretch:false,
  playing:false,srcs:[],segs:[],o:null,timer:0,starting:false,
  ch:[null,null],wd:null,trIn:null,meter:null,spec:null,specOn:-1,fxLat:0};   /* studio: FX chains, width, transitions bus, meter + spectrum */
function engine(){
  if(E.ready)return Promise.resolve();if(E.p)return E.p;
  E.p=(async()=>{
    c=CR.ac();
    E.master=c.createGain();E.master.gain.value=0.9;
    const l=c.createDynamicsCompressor();l.threshold.value=-1;l.knee.value=0;l.ratio.value=20;l.attack.value=0.002;l.release.value=0.12;E.lim=l;
    E.wd=MXFX.width(c);E.wd.set(M.width,true);
    E.master.connect(E.wd.input);E.wd.output.connect(l);l.connect(c.destination);
    E.meter=c.createAnalyser();E.meter.fftSize=2048;l.connect(E.meter);
    E.spec=c.createAnalyser();E.spec.fftSize=4096;E.spec.smoothingTimeConstant=0.8;
    E.trIn=c.createGain();E.trIn.connect(E.master);
    E.fxLat=await MXFX.latency();
    for(const i of [0,1]){E.fade[i]=c.createGain();E.lvl[i]=c.createGain();E.lvl[i].gain.value=effLvl(i);E.lvl[i].connect(E.master);
      E.ch[i]=MXFX.chain(c);E.ch[i].output.connect(E.lvl[i])}
    try{
      await CR.loadScript(CR.SS_SRC);
      for(const i of [0,1]){E.st[i]=await window.SignalsmithStretch(c);E.st[i].connect(E.ch[i].input)}
      E.lat=+(await E.st[0].latency())||0;
    }catch(e){console.warn(e);E.noStretch=true;E.st=[null,null];E.lat=0;setMsg(t('mxNoStretch'),true)}
    for(const i of [0,1]){E.dl[i]=c.createDelay(1);E.dl[i].delayTime.value=E.lat;E.dl[i].connect(E.ch[i].input)}
    for(const i of [0,1])E.ch[i].setLat(E.fxLat);
    E.ready=true;const o=model();for(const i of [0,1])fxApply(i,o,true);specRoute();
  })().catch(e=>{E.p=null;throw e});
  return E.p;
}
// FX/EQ settings → the live chain (smoothly); the export builds its own chain with the same values
function fxApply(i,o,imm){if(!E.ready||!E.ch[i])return;o=o||model();E.ch[i].set(M.fx[i],M.eq[i],o?o.beat:0.5,!!imm)}
function specRoute(){if(!E.ready)return;const want=M.eqSlot;if(E.specOn===want)return;if(E.specOn>=0)try{E.ch[E.specOn].output.disconnect(E.spec)}catch(e){}E.ch[want].output.connect(E.spec);E.specOn=want}
const needSt=(i,o)=>{if(E.noStretch)return false;const r=i?o.rB:o.rA,s=i?0:o.semis;return !!r&&(Math.abs(r-1)>1e-4||s!==0)};
const pitchOf=(i,o)=>(i?0:o.semis)-12*Math.log2(i?o.rB:o.rA);
function route(i,o){const want=needSt(i,o)?'st':'dl';if(E.route[i]===want)return;try{E.fade[i].disconnect()}catch(e){}E.fade[i].connect(want==='st'?E.st[i]:E.dl[i]);E.route[i]=want}
const gainOf=(s,id)=>s.use[id]&&!s.mute[id]?s.gain[id]:0;
function parts(i){
  const sl=M.slots[i],s=sl.song;if(!s||!s.an)return [];
  if(s.stems)return IDS.map(id=>({id,buf:s.stems[id],g:gainOf(sl,id)}));
  return [{id:'full',buf:s.buffer,g:1}];
}
// schedule every source of both slots so that timeline position `pos` plays at context time `when` (ctx = c or offline).
// G = {fade:[2 gain nodes], out:[stretchers or null], ch:[2 FX chains], trIn, pl}: pl = the latency after the fade nodes
// (stretch + FX), so post-FX events (chorus LFO, echo throws, transitions) land on the same timeline position as the audio.
function schedule(ctx,o,when,pos,G,ramp){
  const made=[],wait=[],sr=ctx.sampleRate,q=x=>Math.round(x*sr)/sr,wp=when+(G.pl||0);
  for(const i of [0,1]){
    const s=song(i);if(!s||!s.an)continue;
    const r=i?o.rB:o.rA,end=i?o.t1:o.aOut;
    const fp=G.fade[i].gain;fp.cancelScheduledValues(when);
    if(i===0){
      fp.setValueAtTime(gA(o,pos),when);
      const fi=Math.min(o.fi,(o.aOut-o.aStart)/2),fo=Math.min(o.fo,(o.aOut-o.aStart)/2);
      for(const x of [o.aStart,o.aStart+fi,o.aOut-fo,o.aOut].sort((a,b)=>a-b))if(x>pos)fp.linearRampToValueAtTime(gA(o,x),when+(x-pos));
    }else fp.setValueAtTime(1,when);
    if(G.ch&&G.ch[i])G.ch[i].sched(wp,pos,o.seg[i].filter(x=>x.th&&!x.m).map(x=>({a:Math.max(x.x0,x.x1-o.beat),b:x.x1})),made);
    if(pos>=end)continue;
    let dst=G.fade[i];
    if(i===1){const dc=duckCurve(o);if(dc){const n=Math.max(2,Math.ceil((o.t1-pos)*100)+1),cv=new Float32Array(n);
      for(let k=0;k<n;k++){const f=(pos+k/100-dc.t0)*100,f0=clamp(Math.floor(f),0,dc.v.length-1),f1=Math.min(dc.v.length-1,f0+1);cv[k]=dc.v[f0]+(dc.v[f1]-dc.v[f0])*clamp(f-f0,0,1)}
      const dk=ctx.createGain();dk.gain.setValueCurveAtTime(cv,when,(n-1)/100);dk.connect(G.fade[1]);dst=dk}}
    for(const R of runsOf(o.seg[i])){
      if(R.end<=pos)continue;const x=Math.max(pos,R.x0);let at=when+(x-pos),off=R.s0+(x-R.x0)*r;
      const aq=q(at);off+=(aq-at)*r;at=aq;if(off<0){at=q(at+-off/r);off=0}   // whole-sample start (and whole-sample source offset per part, below)
      const eg=ctx.createGain();envSched(eg.gain,R.pts,x,at);eg.connect(dst);
      const stopAt=when+(R.end+0.002-pos);
      for(const pt of parts(i)){
        if(off>=pt.buf.duration-0.002)continue;
        const src=ctx.createBufferSource();src.buffer=pt.buf;src.playbackRate.value=r;
        const g=ctx.createGain();
        if(ramp){g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(pt.g,at+0.001)}else g.gain.value=pt.g;   // 1 ms: no click, keeps the downbeat transient
        src.connect(g).connect(eg);src.start(at,Math.round(off*pt.buf.sampleRate)/pt.buf.sampleRate);src.stop(Math.max(at+0.01,stopAt));made.push({src,g,i,id:pt.id});
      }
    }
    if(G.out&&G.out[i])wait.push(G.out[i].schedule({active:true,semitones:pitchOf(i,o),output:when}));
  }
  // transition FX (generated buffers) straight into the master, on the timeline
  if(G.trIn)for(const tr of M.tr){const p=trPlace(o,tr);if(p.x1<=pos||p.d<0.05)continue;
    const src=ctx.createBufferSource();src.buffer=MXFX.transition(ctx,tr.k,p.d);const g=ctx.createGain();g.gain.value=tr.lv;
    src.connect(g).connect(G.trIn);const st=Math.max(0,p.x0-pos);src.start(q(wp+st),Math.max(0,pos-p.x0));made.push({src,g,post:true,id:'tr'})}
  made.wait=wait;return made;
}
function killSrcs(list,at,pl){for(const x of list){const t0=at+(x.post?pl||0:0);try{x.g.gain.cancelScheduledValues(t0);x.g.gain.setValueAtTime(x.g.gain.value,t0);x.g.gain.linearRampToValueAtTime(0,t0+0.004);if(x.src)x.src.stop(t0+0.01)}catch(e){}}}
function nowPos(x){if(!E.segs.length)return M.pos;let s=E.segs[0];for(const q of E.segs)if(q.when<=x)s=q;return s.pos+Math.max(0,x-s.when)}
const LIM_LAT=0.006;   // the preview limiter's look-ahead (measured: 264 samples at 44.1 kHz)
const heard=()=>E.playing&&c?nowPos(c.currentTime-E.lat-E.fxLat-LIM_LAT):M.pos;
const liveG=()=>({fade:E.fade,out:E.st.map((n,i)=>E.route[i]==='st'?n:null),ch:E.ch,trIn:E.trIn,pl:E.lat+E.fxLat});
async function play(from){
  const o=model();if(!o||E.starting)return;
  E.starting=true;renderTransport();
  const first=!E.ready;if(first)setMsg(t('mxEngine'));
  try{await engine()}catch(e){console.warn(e);E.starting=false;setMsg(t('fxFail'),true);renderTransport();return}
  if(first&&M.msg===t('mxEngine'))setMsg('');
  E.starting=false;c.resume();
  const o2=model();if(!o2)return;
  startAt(from!=null?from:M.pos,o2);
}
function startAt(pos,o){
  if(E.playing)killSrcs(E.srcs,c.currentTime+0.02,E.lat+E.fxLat);
  if(pos>=o.t1-0.05||pos<o.t0)pos=o.t0;
  const lt=M.loopOn&&loopT(o);if(lt&&(pos<lt.a||pos>=lt.b))pos=lt.a;
  for(const i of [0,1])route(i,o);
  const when=c.currentTime+0.06;
  E.o=o;M.lastO=o;E.srcs=schedule(c,o,when,pos,liveG(),E.playing);
  E.segs=[{when,pos}];E.playing=true;M.pos=pos;
  for(const i of [0,1])if(E.st[i]&&E.route[i]!=='st')E.st[i].schedule({active:false,output:when});
  clearInterval(E.timer);E.timer=setInterval(pump,40);
  renderTransport();kick();
}
function stop(keep){
  if(!E.playing){if(!keep){const o=model();M.pos=o?(M.loopOn&&loopT(o)?loopT(o).a:o.t0):0}renderTransport();kick();return}
  const h=heard();killSrcs(E.srcs,c.currentTime,0);E.srcs=[];E.playing=false;E.segs=[];clearInterval(E.timer);
  for(const i of [0,1])if(E.st[i])E.st[i].schedule({active:false,output:c.currentTime+E.lat+0.1});
  const o=E.o||model();M.pos=keep?h:o?(M.loopOn&&loopT(o)?loopT(o).a:o.t0):0;
  renderTransport();kick();
}
const toggle=()=>E.playing?stop(true):play();
// loop seams are scheduled ahead; the end of the mashup stops the transport
function pump(){
  if(!E.playing)return;const o=E.o,lt=M.loopOn&&loopT(o);
  const last=E.segs[E.segs.length-1];
  if(lt&&lt.b>lt.a+0.05&&last.pos<lt.b){
    const LE=last.when+(lt.b-last.pos);
    if(LE-c.currentTime<0.25){const old=E.srcs;killSrcs(old,LE,E.lat+E.fxLat);E.srcs=schedule(c,o,LE,lt.a,{...liveG(),out:null},true);E.segs.push({when:LE,pos:lt.a});if(E.segs.length>6)E.segs.shift()}
  }else if(heard()>=o.t1-0.01){stop()}
}
// structural change while playing → restart from the same musical position
let rsT=0;
function restart(){clearTimeout(rsT);rsT=setTimeout(()=>{if(!E.playing)return;const o=model();if(!o){stop();return}startAt(mapPos(nowPos(c.currentTime+0.06),E.o,o),o)},40)}
function liveGains(){
  if(!E.playing)return;const now=c.currentTime;
  for(const x of E.srcs){if(x.post||x.id==null)continue;const sl=M.slots[x.i];const v=x.id==='full'?1:gainOf(sl,x.id);x.g.gain.cancelScheduledValues(now);x.g.gain.setTargetAtTime(v,now,0.015)}
}
function setVol(i,v){if(v!=null)M.vol[i]=v;if(E.lvl[i])E.lvl[i].gain.setTargetAtTime(effLvl(i),c.currentTime,0.015);save()}
function lvlAll(){setVol(0);setVol(1);M.lastO=null;if(M.duckOn)restart();renderMix();renderExpPts()}
function compare(on){if(M.cmp===on)return;M.cmp=on;const b=$('#mxCmpB');if(b){b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))}
  if(!E.ready)return;for(const ch of E.ch)ch.bypass(on);E.wd.set(on?1:M.width)}

/* ---------- loading songs ---------- */
function setMsg(m,err){M.msg=m||'';M.msgErr=!!err;const el=$('#mxMsg');if(el){el.textContent=M.msg;el.classList.toggle('err',M.msgErr);el.hidden=!M.msg}}
async function loadInto(i,getBuf,name,hint,pre){
  const sl=M.slots[i],tok=++sl.tok;
  stop(true);setMsg('');
  sl.loading={msg:t('mxDecoding'),p:0.02};renderSlot(i);swapDis();
  try{
    let buffer,a=null,cues=null,stems=null,kind=null;
    if(pre){buffer=pre.buffer;a={bpm:pre.bpm,offset:pre.offset,down:pre.down||0,key:pre.key,wave:pre.wave,lufs:pre.lufs,dur:buffer.duration};if(pre.stems){stems=pre.stems;kind='tool'}}
    else buffer=await getBuf();
    if(tok!==sl.tok)return;
    const key=songKey(name,buffer),hit=CACHE.get(key);
    if(!a&&hit&&hit.an)a=hit.an;
    if(hit&&hit.cues)cues=hit.cues;
    if(!stems&&hit&&hit.stems){stems=hit.stems;kind=hit.kind}
    if(!a){
      const h=hint&&hint.bpm&&hint.key&&Math.abs((hint.dur||0)-buffer.duration)<0.5?hint:null;
      a=await CR.analyzeTrack(buffer,p=>{if(tok===sl.tok){sl.loading={msg:t('mxAnalyzing',{p:Math.round(p*100)}),p:0.05+p*0.8};slotProg(i)}},h);
    }
    if(tok!==sl.tok)return;
    if(!cues){sl.loading={msg:t('mxCues'),p:0.9};slotProg(i);try{cues=window.CUES?await CUES.detect(buffer,{bpm:a.bpm,offset:a.offset,down:a.down||0}):[]}catch(e){console.warn(e);cues=[]}}
    if(tok!==sl.tok)return;
    cachePut(key,{an:a,cues,...(stems&&kind!=='tool'?{stems,kind}:{})});
    sl.song={key,name,buffer,an:a,cues,stems,kind,cached:!!(hit&&hit.stems&&stems===hit.stems),wave:null,waveKey:'',vStart:null,sep:null};
    sl.loading=null;if(E.playing)stop(true);
    M.semis=null;M.align=null;M.nudge=0;M.loop=null;M.loopOn=false;M.reg=[null,null];M.tr=[];M.rsel=null;M.tsel=null;mClearUndo();
    applyPair();
    const o=model();M.pos=o?o.t0:0;M.view0=M.pos;M.lastO=o;
    save();renderAll();updWave(i);
  }catch(e){
    console.warn(e);if(tok!==sl.tok)return;sl.loading=null;
    setMsg(e&&e.big?t('mxBig'):e&&e.lib?t('mxErrLib'):e&&e.name==='EncodingError'||e&&/decode/i.test(String(e.message))?t('readErr'):t('mxErrLoad'),true);renderSlot(i);swapDis();
  }
}
function loadFile(i,file){
  if(!file)return;
  if(file.size>MAX_BYTES){setMsg(t('mxBig'),true);return}
  const name=file.name.replace(/\.[a-z0-9]{2,5}$/i,'');
  loadInto(i,async()=>CR.ac().decodeAudioData(await file.arrayBuffer()),name,CR.libItem(name));
}
function loadLib(i,it){
  if(!it||!it.file_path||!CR.signedIn())return;
  loadInto(i,async()=>{let ab;try{const url=await CR.songFileUrl(it.file_path);const r=await fetch(url);if(!r.ok)throw new Error('http '+r.status);ab=await r.arrayBuffer()}catch(e){throw Object.assign(e,{lib:true})}return CR.ac().decodeAudioData(ab)},it.name,it);
}
function loadTool(i){const s=CR.toolSong();if(!s){setMsg(t('mxNoTool'),true);return}loadInto(i,null,s.name,null,s)}
function clearSlot(i){const sl=M.slots[i];sl.tok++;if(sl.song&&sl.song.sep)sl.song.sep.ctl.abort();stop();sl.song=null;sl.loading=null;mClearUndo();M.align=null;M.nudge=0;M.semis=null;M.loop=null;M.loopOn=false;M.reg=[null,null];M.tr=[];M.rsel=null;M.tsel=null;const o=model();M.pos=o?o.t0:0;M.lastO=o;save();renderAll()}
function swap(){
  stop();const a=M.slots[0],b=M.slots[1];[a.song,b.song]=[b.song,a.song];a.tok++;b.tok++;a.loading=b.loading=null;
  for(const s of [a.song,b.song])if(s){s.vStart=null;s.waveKey=''}
  M.semis=null;M.align=null;M.nudge=0;M.loop=null;M.loopOn=false;M.reg=[null,null];M.tr=[];M.rsel=null;M.tsel=null;mClearUndo();applyPair();
  const o=model();M.pos=o?o.t0:0;M.view0=M.pos;M.lastO=o;save();renderAll();updWave(0);updWave(1);
}

/* ---------- stems ---------- */
function quickSep(buf,prog,sig){
  return CR.stereo44(buf).then(([LR,len])=>new Promise((ok,no)=>{
    const L=LR.slice(0,len),R=LR.slice(len);     // the quick worker takes two arrays
    const w=new Worker(QW);
    const ab=()=>{w.terminate();no(Object.assign(new Error('aborted'),{code:'aborted'}))};
    if(sig){if(sig.aborted)return ab();sig.addEventListener('abort',ab,{once:true})}
    w.onmessage=e=>{const d=e.data;
      if(d.type==='p')prog(d.p,t('quickRun',{p:Math.round(d.p*100)}));
      else if(d.type==='done'){w.terminate();if(sig)sig.removeEventListener('abort',ab);const ac=CR.ac(),out={};
        IDS.forEach((id,k)=>{const b=ac.createBuffer(2,len,44100);b.copyToChannel(d.res[k*2],0);b.copyToChannel(d.res[k*2+1],1);out[id]=b});ok(out)}};
    w.onerror=e=>{if(e&&e.preventDefault)e.preventDefault();w.terminate();no(new Error((e&&e.message)||'worker'))};
    w.postMessage({L,R,sr:44100},[L.buffer,R.buffer]);
  }));
}
async function separate(i,kind){
  const s=song(i);if(!s||s.sep)return;
  if(kind==='ai'&&CR.sepInfo().busy){setMsg(t('mxSepBusy'),true);return}
  const ctl=new AbortController();s.sep={kind,ctl,p:0,msg:kind==='ai'?t('aiDl',{p:0}):t('quickRun',{p:0})};setMsg('');renderSlot(i);
  const prog=(p,m)=>{if(!s.sep)return;s.sep.p=p;s.sep.msg=m;const at=M.slots.findIndex(x=>x.song===s);if(at>=0)slotProg(at)};
  try{
    const stems=kind==='ai'?await CR.separateBuffer(s.buffer,{onProgress:prog,signal:ctl.signal,ref:'mashup: '+s.name}):await quickSep(s.buffer,prog,ctl.signal);
    s.stems=stems;s.kind=kind;s.cached=false;s.vStart=null;s.waveKey='';cachePut(s.key,{stems,kind});
  }catch(e){
    const code=e&&e.code;
    if(code==='aborted')setMsg(t('canceled'));
    else if(code==='declined'){/* payFor / charge already told the user why (points, sign-in) */}
    else if(code==='busy')setMsg(t('mxSepBusy'),true);
    else if(code==='off')setMsg(t('offByAdmin'),true);
    else{console.error(e);setMsg(t('mxSepFail',{m:String((e&&e.message)||e).slice(0,80)}),true)}
  }finally{
    s.sep=null;const at=M.slots.findIndex(x=>x.song===s);
    if(at>=0){renderSlot(at);if(s.stems){M.lastO=null;renderMatch();updWave(at);restart()}}
  }
}

/* ---------- waveforms (the parts in use, drawn on the shared bar grid) ---------- */
function updWave(i){
  const sl=M.slots[i],s=sl.song;if(!s)return;
  if(!s.stems){s.wave=s.an.wave;s.waveKey='full';drawSoon();return}
  const key=IDS.map(id=>gainOf(sl,id)>0?1:0).join('');if(key===s.waveKey)return;s.waveKey=key;
  clearTimeout(sl.wt);sl.wt=setTimeout(async()=>{
    if(sl.song!==s||s.waveKey!==key)return;
    const ids=IDS.filter(id=>gainOf(sl,id)>0);if(!ids.length){s.wave=null;drawSoon();return}
    const n=s.stems[ids[0]].length,mono=CR.ac().createBuffer(1,n,s.stems[ids[0]].sampleRate),d=mono.getChannelData(0);
    for(const id of ids){const b=s.stems[id],L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L;for(let j=0;j<n;j++)d[j]+=(L[j]+R[j])*0.5}
    try{const w=await CR.waveOf(mono);if(sl.song===s&&s.waveKey===key){s.wave=w;drawSoon()}}catch(e){console.warn(e)}
  },200);
}

/* ---------- settings (per account, never audio) ---------- */
const lsKey=()=>LS+':'+(M.owner||'guest');
function save(){
  clearTimeout(save.t);save.t=setTimeout(()=>{
    const a=song(0),b=song(1);
    const o={v:1,tempo:M.tempo,custom:M.custom,fadeIn:M.fadeIn,fadeOut:M.fadeOut,startA:M.startA,vol:M.vol,fmt:M.fmt,onlyLoop:M.onlyLoop,loopBars:M.loopBars,
      use:M.slots.map(s=>s.use),gain:M.slots.map(s=>s.gain),
      fx:M.fx,eq:M.eq,duck:{on:M.duckOn,amt:M.duckAmt},width:M.width,   /* studio: the last sound settings = the default for a new pair */
      pair:a&&b?{a:a.name,b:b.name,semis:M.semis,align:M.align,nudge:M.nudge,loop:M.loop,
        grid:[a,b].map(s=>s.gfix?{bpm:s.an.bpm,offset:s.an.offset,down:s.an.down}:null),   /* griddrag: grid fixes */
        reg:M.reg,tr:M.tr,fx:M.fx,eq:M.eq,duck:{on:M.duckOn,amt:M.duckAmt},width:M.width}:M.pair};   /* studio: edits + sound of this pair */
    M.pair=o.pair;try{localStorage.setItem(lsKey(),JSON.stringify(o))}catch(e){}
  },250);
}
// read back as data: only the expected fields, types and ranges
function load(){
  let o=null;try{o=JSON.parse(localStorage.getItem(lsKey())||'null')}catch(e){}
  const num=(x,a,b,d)=>typeof x==='number'&&isFinite(x)?clamp(x,a,b):d;
  M.tempo='B';M.custom=0;M.fadeIn=4;M.fadeOut=4;M.startA='pre';M.vol=[1,1];M.fmt='wav';M.onlyLoop=false;M.loopBars=8;M.pair=null;
  M.slots.forEach((s,i)=>{s.use={...DEF_USE[i]};s.gain={vocals:1,drums:1,bass:1,other:1}});
  M.fx=[MXFX.DEF_FX(),MXFX.DEF_FX()];M.eq=[MXFX.DEF_EQ(),MXFX.DEF_EQ()];M.duckOn=false;M.duckAmt=6;M.width=1;M.reg=[null,null];M.tr=[];
  if(!o||o.v!==1)return;
  if(['A','B','custom'].includes(o.tempo))M.tempo=o.tempo;
  M.custom=num(o.custom,0,250,0);
  if(FADES.includes(o.fadeIn))M.fadeIn=o.fadeIn;if(FADES.includes(o.fadeOut))M.fadeOut=o.fadeOut;
  if(STARTS.includes(o.startA))M.startA=o.startA;
  if(Array.isArray(o.vol))M.vol=[0,1].map(i=>num(o.vol[i],0,1.5,1));
  if(o.fmt==='mp3'||o.fmt==='wav')M.fmt=o.fmt;M.onlyLoop=o.onlyLoop===true;
  if([4,8,16].includes(o.loopBars))M.loopBars=o.loopBars;
  sound(o);
  M.slots.forEach((s,i)=>{
    const u=Array.isArray(o.use)&&o.use[i],g=Array.isArray(o.gain)&&o.gain[i];
    if(u&&typeof u==='object')for(const id of IDS)if(typeof u[id]==='boolean')s.use[id]=u[id];
    if(g&&typeof g==='object')for(const id of IDS)s.gain[id]=num(g[id],0,1.5,1);
  });
  const p=o.pair;
  if(p&&typeof p==='object'&&typeof p.a==='string'&&typeof p.b==='string'){
    const L=p.loop&&typeof p.loop==='object'&&typeof p.loop.a==='number'&&typeof p.loop.b==='number'&&isFinite(p.loop.a)&&isFinite(p.loop.b)&&p.loop.b>p.loop.a?{a:clamp(p.loop.a,-64,4096),b:clamp(p.loop.b,-64,4096)}:null;
    const G=x=>x&&typeof x==='object'&&typeof x.bpm==='number'&&isFinite(x.bpm)&&typeof x.offset==='number'&&isFinite(x.offset)&&Number.isInteger(x.down)?{bpm:clamp(x.bpm,20,400),offset:clamp(x.offset,0,10),down:mod(x.down,4)}:null;
    M.pair={a:p.a.slice(0,300),b:p.b.slice(0,300),semis:Number.isInteger(p.semis)?clamp(p.semis,-12,12):null,align:Number.isInteger(p.align)?clamp(p.align,-64,4096):null,nudge:num(p.nudge,-4,4,0),loop:L,
      grid:Array.isArray(p.grid)?[G(p.grid[0]),G(p.grid[1])]:[null,null],
      reg:Array.isArray(p.reg)?[sanReg(p.reg[0]),sanReg(p.reg[1])]:[null,null],tr:sanTr(p.tr),snd:p.fx?sndOf(p):null};
  }
}
/* studio: sound settings (FX, EQ, duck, width) and edits (regions, transitions), read back as data */
function sndOf(o){const n=(x,a,b,d)=>typeof x==='number'&&isFinite(x)?clamp(x,a,b):d;
  return {fx:Array.isArray(o.fx)?[0,1].map(i=>MXFX.sanFx(o.fx[i])):null,eq:Array.isArray(o.eq)?[0,1].map(i=>MXFX.sanEq(o.eq[i])):null,
    duck:o.duck&&typeof o.duck==='object'?{on:o.duck.on===true,amt:n(o.duck.amt,0,18,6)}:null,width:n(o.width,0,2,null)}}
function sound(o){const x=sndOf(o);if(x.fx)M.fx=x.fx;if(x.eq)M.eq=x.eq;if(x.duck){M.duckOn=x.duck.on;M.duckAmt=x.duck.amt}if(x.width!=null)M.width=x.width}
function sanReg(a){
  if(!Array.isArray(a)||!a.length)return null;const n=(x,lo,hi)=>typeof x==='number'&&isFinite(x)?clamp(x,lo,hi):null,out=[];
  for(const g of a.slice(0,RMAX)){if(!g||typeof g!=='object')continue;const u0=n(g.u0,-1e5,1e5),u1=n(g.u1,-1e5,1e5),sh=n(g.sh,-1e5,1e5);if(u0==null||u1==null||sh==null||u1<=u0)continue;
    out.push({u0,u1,sh,g:n(g.g,0,4)??1,fi:n(g.fi,0,64)??0,fo:n(g.fo,0,64)??0,m:g.m===true,th:g.th===true})}
  return out.length?out:null;
}
function sanTr(a){return Array.isArray(a)?a.slice(0,32).filter(x=>x&&TRK.includes(x.k)&&Number.isInteger(x.bar)&&TRL.includes(x.len)).map(x=>({k:x.k,bar:clamp(x.bar,-64,4096),len:x.len,lv:typeof x.lv==='number'&&isFinite(x.lv)?clamp(x.lv,0,1.5):0.7})):[]}
// the same two songs as last time → their fine-tuning comes back
function applyPair(){
  const a=song(0),b=song(1),p=M.pair;
  if(!a||!b||!p||p.a!==a.name||p.b!==b.name)return;
  M.semis=p.semis;M.align=p.align;M.nudge=p.nudge;M.loop=p.loop;
  M.reg=MXFX.clone(p.reg||[null,null]);M.tr=MXFX.clone(p.tr||[]);if(p.snd){const x=p.snd;if(x.fx)M.fx=MXFX.clone(x.fx);if(x.eq)M.eq=MXFX.clone(x.eq);if(x.duck){M.duckOn=x.duck.on;M.duckAmt=x.duck.amt}if(x.width!=null)M.width=x.width}
  if(M.built)renderStudio();if(E.ready){fxApply(0,null,false);fxApply(1,null,false);E.wd.set(M.width)}
  (p.grid||[]).forEach((g,i)=>{const s=song(i);if(g&&s&&Math.abs(g.bpm-s.an.bpm)<0.01){s.an={...s.an,offset:g.offset,down:g.down};s.gfix=true;s.vStart=null}});   /* griddrag */
}
function setOwner(uid){
  uid=uid||null;if(M.owner===uid)return;
  const had=M.owner!==undefined;M.owner=uid;
  if(had){stop();for(const s of M.slots){s.tok++;if(s.song&&s.song.sep)s.song.sep.ctl.abort();s.song=null;s.loading=null}M.semis=null;M.align=null;M.nudge=0;M.loop=null;M.loopOn=false;M.rsel=null;M.tsel=null;closePick();
    mClearUndo();M.solo=[false,false];M.smute=[false,false];M.fxNote=null;M.eqNote=[null,null];M.cutOn=false}   /* studio: nothing of the previous account's session carries over */
  load();if(M.built)renderAll();if(E.ready){fxApply(0);fxApply(1);E.wd.set(M.width);lvlAll()}
}

/* ---------- UI ---------- */
const IC={
  file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  lib:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  tool:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0"/></svg>',
  drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  swap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
  stop:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/></svg>',
  loop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  zin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/></svg>',
  zout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>',
  ai:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v16M15 4v16M3 12h3M18 12h3M5 10l-2 2 2 2M19 10l2 2-2 2"/></svg>',
  free:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M2 12h3M19 12h3M4 10l-2 2 2 2M20 10l2 2-2 2"/></svg>',
  cut:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></svg>',
  split:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 8h6v8H3M21 8h-6v8h6"/></svg>',
  dup:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  del:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  mute:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4zM23 9l-6 6M17 9l6 6"/></svg>',
  cmp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M5 7l-3 5 3 5M19 7l3 5-3 5"/></svg>',
  dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>'
};
function build(){
  const v=$('#mashupView');
  v.innerHTML=`
<div class="dhead mxhead"><div><div class="eyebrow" data-i="mxEyebrow"></div><h1 data-i="mxTitle"></h1><p data-i="mxSub"></p></div></div>
<ol class="mxsteps" id="mxSteps">
  ${[1,2,3].map(n=>`<li><span class="mxsn" dir="ltr">${n}</span><div><b data-i="mxStep${n}H"></b><p class="snote" data-i="mxStep${n}P"></p></div></li>`).join('')}
</ol>
<div class="mxslots">
  <section class="mxslot" id="mxSlot0" data-s="0" aria-labelledby="mxSlH0"></section>
  <button type="button" class="mxswap" id="mxSwap" data-it="mxSwap">${IC.swap}</button>
  <section class="mxslot" id="mxSlot1" data-s="1" aria-labelledby="mxSlH1"></section>
</div>
<p class="mxmsg" id="mxMsg" role="status" aria-live="polite" hidden></p>
<div id="mxMain" hidden>
  <section class="mxmatch" id="mxMatch" aria-labelledby="mxMatchH">
    <h2 id="mxMatchH" data-i="mxMatchH"></h2>
    <div class="mxgrid">
      <div class="mxcell"><h3 data-i="mxTempoL"></h3>
        <div class="mxseg" role="radiogroup" id="mxTempo" aria-labelledby="mxMatchH">
          <button type="button" role="radio" data-tm="B" data-i="mxTempoB"></button><button type="button" role="radio" data-tm="A" data-i="mxTempoA"></button><button type="button" role="radio" data-tm="custom" data-i="mxTempoC"></button>
        </div>
        <label class="mxbpm" id="mxBpmL" hidden><span data-i="mxTempoIn"></span><input type="number" id="mxBpm" class="srch mono" min="40" max="250" step="0.1" dir="ltr" inputmode="decimal"></label>
        <p class="mxrates mono" id="mxRates" dir="ltr"></p></div>
      <div class="mxcell"><h3 data-i="mxKeyL"></h3>
        <div class="mxkeys" id="mxKeys" dir="ltr"></div>
        <div class="mxchips" id="mxKeyChips"></div>
        <div class="mxstepper" dir="ltr"><button type="button" class="btn ghost" id="mxKDn" data-it="mxKeyDown">−</button><output id="mxKV" class="mono"></output><button type="button" class="btn ghost" id="mxKUp" data-it="mxKeyUp">+</button></div></div>
      <div class="mxcell mxal"><h3 data-i="mxAlignH"></h3>
        <label class="mxfl"><span data-i="mxAlignL"></span><select class="sel" id="mxAlign"></select></label>
        <div class="mxnudge" dir="ltr" id="mxNudge">
          <button type="button" class="btn ghost" data-nd="-bar">«</button><button type="button" class="btn ghost" data-nd="-beat">‹</button><button type="button" class="btn ghost" data-nd="-ms">−10</button>
          <output class="mono" id="mxOff"></output>
          <button type="button" class="btn ghost" data-nd="ms">+10</button><button type="button" class="btn ghost" data-nd="beat">›</button><button type="button" class="btn ghost" data-nd="bar">»</button>
        </div>
        <p class="mxlock" id="mxLock" role="status" aria-live="polite"></p>
        <div class="mxrow3">
          <label class="mxfl"><span data-i="mxStartA"></span><select class="sel" id="mxStartA"></select></label>
          <label class="mxfl"><span data-i="mxFadeIn"></span><select class="sel" id="mxFi"></select></label>
          <label class="mxfl"><span data-i="mxFadeOut"></span><select class="sel" id="mxFo"></select></label>
        </div>
        <button type="button" class="lnk mxreset" id="mxReset" data-i="mxReset"></button></div>
      <div class="mxcell mxsc"><div class="mxring" id="mxRing" role="img"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" class="bg"/><circle cx="32" cy="32" r="27" class="fg" id="mxRingFg"/></svg><b class="mono" id="mxScoreN" dir="ltr"></b><span data-i="mxScore"></span></div>
        <ul class="mxadv" id="mxAdv"></ul></div>
    </div>
  </section>
  <section class="mxdeck" id="mxDeck" aria-label="">
    <div class="mxtr">
      <button type="button" class="mxplay" id="mxPlay">${IC.play}</button>
      <button type="button" class="mxib" id="mxStop" data-it="mxStop">${IC.stop}</button>
      <span class="mxtime mono" id="mxTime" dir="ltr"></span><span class="mxbb mono" id="mxBB" dir="ltr"></span>
      <span class="mxsp"></span>
      <button type="button" class="mxib mxgridb" id="mxGrid" aria-pressed="false" data-it="mxGridT">${IC.grid}<span data-i="mxGrid"></span></button>
      <button type="button" class="mxib mxgridb mxfreeb" id="mxFreeB" aria-pressed="false" data-it="mxFreeT">${IC.free}<span data-i="mxFree"></span></button>
      <button type="button" class="mxib mxgridb mxcutb" id="mxCutB" aria-pressed="false" data-it="mxCutT">${IC.cut}<span data-i="mxCut"></span></button>
      <button type="button" class="mxib" id="mxSplitB" data-it="mxSplitT">${IC.split}</button>
      <button type="button" class="mxib mxgridb mxcmpb" id="mxCmpB" aria-pressed="false" data-it="mxCompareT">${IC.cmp}<span data-i="mxCompare"></span></button>
      <button type="button" class="mxib mxloop" id="mxLoop" aria-pressed="false">${IC.loop}<span data-i="mxLoop"></span></button>
      <select class="mxsel" id="mxLoopN"></select>
      <button type="button" class="mxib" id="mxZo" data-it="mxZoomOut">${IC.zout}</button><button type="button" class="mxib" id="mxZi" data-it="mxZoomIn">${IC.zin}</button>
    </div>
    <div class="mxtl" id="mxTl" dir="ltr"><canvas id="mxCv" role="img"></canvas><canvas id="mxOv" aria-hidden="true"></canvas></div>
    <div class="mxmix">
      ${[0,1].map(i=>`<div class="mxvolw"><label class="mxvol"><span class="mxlet ${i?'b':'a'}" dir="ltr">${LET[i]}</span><span class="vh" data-i="mxVol${LET[i]}"></span><input type="range" id="mxVol${LET[i]}" min="0" max="1.5" step="0.01" dir="ltr"><output class="mono" id="mxVol${LET[i]}o"></output></label>
        <span class="mxsm" dir="ltr"><button type="button" class="mxsmb" data-sm="solo" data-s="${i}" aria-pressed="false">S</button><button type="button" class="mxsmb" data-sm="mute" data-s="${i}" aria-pressed="false">M</button></span></div>`).join('')}
      <label class="mxvol"><span data-i="mxWidth"></span><input type="range" id="mxWidth" min="0" max="2" step="0.01" dir="ltr"><output class="mono" id="mxWidtho"></output></label>
      <span class="mxmeter" dir="ltr"><canvas id="mxMeter" width="120" height="14" role="img"></canvas></span>
      <p class="mxhelp"><span data-i="mxTlHelp"></span> · <span data-i="mxKeysH"></span> · <span data-i="mxWheelH"></span></p>
      <p class="mxghelp" id="mxGHelp" data-i="mxGridHelp" hidden></p>
      <p class="mxghelp mxfhelp" id="mxFHelp" hidden><span data-i="mxFreeHelp"></span> <b class="mono" id="mxSelL"></b></p>
    </div>
  </section>
  <div class="mxstudio" id="mxStudio">
    <details class="mxpanel" id="mxPFx" open><summary><span class="mxlet a" dir="ltr">A</span><h2 data-i="mxFxH"></h2></summary>
      <div class="mxpb"><div class="mxsmrow"><button type="button" class="btn solid mxsmartb" id="mxSmFx" data-it="mxSmFxT"><span data-i="mxSmFx"></span></button><p class="mxsmart" id="mxFxNote" role="status" aria-live="polite" hidden></p></div>
        <div class="mxpre" id="mxPre0" role="group"></div><div class="mxrack" id="mxRack0"></div>
        <details class="mxpanel mxsub" id="mxPFxB"><summary><span class="mxlet b" dir="ltr">B</span><h3 data-i="mxFxBH"></h3></summary>
          <div class="mxpb"><div class="mxpre" id="mxPre1" role="group"></div><div class="mxrack" id="mxRack1"></div></div></details></div></details>
    <details class="mxpanel" id="mxPEq" open><summary><h2 data-i="mxEqH"></h2></summary>
      <div class="mxpb">
        <div class="mxeqtop"><span class="snote" data-i="mxEqFor"></span><div class="mxseg" role="radiogroup" id="mxEqSlot"><button type="button" role="radio" data-eqs="0" dir="ltr">A</button><button type="button" role="radio" data-eqs="1" dir="ltr">B</button></div>
          <label class="mxchk"><input type="checkbox" id="mxEqOn"><span data-i="mxEqOn"></span></label><button type="button" class="btn solid mxsmartb" id="mxSmEq" data-it="mxSmEqT"><span data-i="mxSmEq"></span></button><div class="mxpre" id="mxEqPre" role="group"></div></div>
        <p class="mxsmart" id="mxEqNote" role="status" aria-live="polite" hidden></p>
        <div class="mxeqw" dir="ltr"><canvas id="mxEqCv" tabindex="0" role="img"></canvas></div>
        <div class="mxeqb" dir="ltr"><div class="mxbands" id="mxBands" role="radiogroup"></div>
          <label class="mxfx1"><span data-i="mxFreq"></span><input type="range" id="mxEqF" min="0" max="1000" step="1"><output class="mono" id="mxEqFo"></output></label>
          <label class="mxfx1"><span data-i="mxDb"></span><input type="range" id="mxEqG" min="-18" max="18" step="0.1"><output class="mono" id="mxEqGo"></output></label>
          <label class="mxfx1"><span data-i="mxQ"></span><input type="range" id="mxEqQ" min="0" max="1000" step="1"><output class="mono" id="mxEqQo"></output></label></div>
        <p class="snote mxeqh" data-i="mxEqHelp"></p></div></details>
    <details class="mxpanel" id="mxPEd" open><summary><h2 data-i="mxEdH"></h2></summary>
      <div class="mxpb" id="mxEdBody"></div></details>
  </div>
  <section class="mxexp" aria-labelledby="mxExpH">
    <div class="mxexph"><h2 id="mxExpH" data-i="mxExportH"></h2><p class="snote" id="mxExpP"></p></div>
    <div class="mxexpr">
      <div class="mxseg" role="radiogroup" id="mxFmt" aria-labelledby="mxExpH"><button type="button" role="radio" data-fm="wav">WAV</button><button type="button" role="radio" data-fm="mp3">MP3 320</button></div>
      <label class="mxchk"><input type="checkbox" id="mxOnlyLoop"><span data-i="mxOnlyLoop"></span></label>
      <button type="button" class="btn solid" id="mxExp">${IC.dl}<span data-i="mxExportBtn"></span><i class="ptchip" id="mxExpPts" hidden></i></button>
    </div>
    <div class="mxprog" id="mxExpProg" hidden><div class="bar"><i></i></div></div>
    <p class="snote mxexpmsg" id="mxExpMsg" role="status" aria-live="polite"></p>
  </section>
</div>
<input type="file" id="mxIn" accept="${ACCEPT}" hidden>
<div class="mxpick" id="mxPick" hidden><div class="mxpd" role="dialog" aria-modal="true" aria-labelledby="mxPickH">
  <div class="mxph"><h2 id="mxPickH" data-i="mxLibT"></h2><button type="button" class="mxib" id="mxPickX" data-it="mxClose">${IC.x}</button></div>
  <input type="search" class="srch" id="mxPickQ" data-ip="mxLibSearch" autocomplete="off">
  <p class="snote" id="mxPickN"></p><ul class="mxpl" id="mxPickL"></ul></div></div>`;
  M.built=true;wire();CR.applyLang();renderAll();
}
function wire(){
  const v=$('#mashupView');
  v.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    refocusLater(b);
    const sEl=b.closest('.mxslot'),i=sEl?+sEl.dataset.s:-1,a=b.dataset.a;
    if(a&&i>=0){
      if(a==='file'){M.pickFor=i;$('#mxIn').value='';$('#mxIn').click()}
      else if(a==='lib')openPick(i,b);else if(a==='tool')loadTool(i);else if(a==='clear')clearSlot(i);
      else if(a==='ai'||a==='quick')separate(i,a);else if(a==='cancel'){const s=song(i);if(s&&s.sep)s.sep.ctl.abort()}
      else if(a==='half'||a==='double'){const s=song(i);if(s){mPush();M.reg[i]=null;M.rsel=null;s.an={...s.an,bpm:s.an.bpm*(a==='half'?0.5:2)};s.vStart=null;cachePut(s.key,{an:s.an});M.align=null;M.nudge=0;M.lastO=null;renderAll();restart()}}
      else if(a==='use'||a==='mute'){const sl=M.slots[i],id=b.dataset.id;if(a==='use')sl.use[id]=!sl.use[id];else sl.mute[id]=!sl.mute[id];renderSlot(i);liveGains();updWave(i);save()}
      return;
    }
    if(b.dataset.tm){M.tempo=b.dataset.tm;if(M.tempo==='custom'&&!(M.custom>=40)){const o=model();M.custom=o?Math.round(o.T*10)/10:120}changed();if(M.tempo==='custom')setTimeout(()=>$('#mxBpm').focus(),0);return}
    if(b.dataset.ks!=null){M.semis=+b.dataset.ks;changed();return}
    if(b.dataset.nd){nudge(b.dataset.nd);return}
    if(b.dataset.fm){M.fmt=b.dataset.fm;renderExport();save();return}
  });
  $('#mxSwap').onclick=swap;
  $('#mxIn').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)loadFile(M.pickFor,f)};
  $('#mxBpm').oninput=e=>{const x=parseFloat(String(e.target.value).replace(',','.'));if(x>=40&&x<=250){M.custom=Math.round(x*100)/100;changed(true)}};
  $('#mxBpm').onchange=()=>renderMatch();
  $('#mxKDn').onclick=()=>{M.semis=clamp(semis()-1,-12,12);changed()};
  $('#mxKUp').onclick=()=>{M.semis=clamp(semis()+1,-12,12);changed()};
  $('#mxAlign').onchange=e=>{mPush();M.align=+e.target.value;M.nudge=0;changed()};
  $('#mxStartA').onchange=e=>{M.startA=e.target.value;changed()};
  $('#mxFi').onchange=e=>{M.fadeIn=+e.target.value;changed()};
  $('#mxFo').onchange=e=>{M.fadeOut=+e.target.value;changed()};
  $('#mxReset').onclick=()=>{mPush();M.align=null;M.nudge=0;M.semis=null;changed()};
  $('#mxGrid').onclick=()=>{M.gridOn=!M.gridOn;if(M.gridOn){M.freeOn=false;M.cutOn=false}renderTransport();renderEdit();drawSoon()};   /* griddrag */
  $('#mxFreeB').onclick=()=>{M.freeOn=!M.freeOn;if(M.freeOn){M.gridOn=false;M.cutOn=false;if(M.sel==null)M.sel=0}renderTransport();renderEdit();drawSoon()};   /* freemove */
  $('#mxPlay').onclick=toggle;$('#mxStop').onclick=()=>stop();
  $('#mxLoop').onclick=loopToggle;
  $('#mxLoopN').onchange=e=>{M.loopBars=+e.target.value;if(M.loop){M.loop={a:M.loop.a,b:M.loop.a+M.loopBars};if(M.loopOn)restart()}save();drawSoon();renderTransport();renderExport()};
  $('#mxZi').onclick=()=>zoom(2);$('#mxZo').onclick=()=>zoom(0.5);
  $('#mxVolA').oninput=e=>{setVol(0,+e.target.value);$('#mxVolAo').textContent=Math.round(M.vol[0]*100)+'%'};
  $('#mxVolB').oninput=e=>{setVol(1,+e.target.value);$('#mxVolBo').textContent=Math.round(M.vol[1]*100)+'%'};
  $('#mxOnlyLoop').onchange=e=>{M.onlyLoop=e.target.checked;save()};
  $('#mxExp').onclick=exportMix;
  // stem level sliders (delegated: the slot markup is rebuilt on structural changes only)
  v.addEventListener('input',e=>{const r=e.target.closest('input[data-g]');if(!r)return;const i=+r.closest('.mxslot').dataset.s,id=r.dataset.g,sl=M.slots[i];
    sl.gain[id]=+r.value;const out=r.parentElement.querySelector('output');if(out)out.textContent=Math.round(sl.gain[id]*100)+'%';liveGains();save();if(sl.gain[id]===0||+r.dataset.was===0)updWave(i);r.dataset.was=sl.gain[id]});
  // drag & drop on a slot (or anywhere in the view → the first empty slot)
  v.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();const s=e.target.closest('.mxslot');v.querySelectorAll('.mxslot').forEach(x=>x.classList.toggle('over',x===s))});
  v.addEventListener('dragleave',e=>{if(!v.contains(e.relatedTarget))v.querySelectorAll('.mxslot').forEach(x=>x.classList.remove('over'))});
  v.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();v.querySelectorAll('.mxslot').forEach(x=>x.classList.remove('over'));
    const s=e.target.closest('.mxslot'),f=e.dataTransfer.files[0];if(!f)return;const i=s?+s.dataset.s:!song(0)&&!M.slots[0].loading?0:!song(1)?1:0;loadFile(i,f)});
  // library picker
  $('#mxPickX').onclick=closePick;$('#mxPick').onclick=e=>{if(e.target.id==='mxPick')closePick()};
  $('#mxPickQ').oninput=renderPick;
  $('#mxPick').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closePick()}else if(e.key==='Tab')trap(e,$('#mxPick .mxpd'))});
  wireTimeline();wireStudio();
  new ResizeObserver(()=>{sizeCanvas();drawSoon()}).observe($('#mxTl'));
}
// buttons inside re-rendered markup (slot parts, key chips): keep the keyboard focus on the same control
function refocusLater(b){
  const sEl=b.closest('.mxslot'),d=b.dataset;
  const q=d.a&&sEl?`#${sEl.id} [data-a="${d.a}"]${d.id?`[data-id="${d.id}"]`:''}`:d.ks!=null?`#mxKeyChips [data-ks="${d.ks}"]`:null;
  if(!q||['file','lib','tool','clear'].includes(d.a))return;
  requestAnimationFrame(()=>{if(document.contains(b))return;const n=document.querySelector(q)||(sEl&&sEl.querySelector('button:not([disabled])'));if(n)n.focus()});
}
const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
function trap(e,box){const f=[...box.querySelectorAll('button:not([disabled]),input,select')].filter(x=>x.offsetParent);if(!f.length)return;const a=f[0],z=f[f.length-1];
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
function changed(noRenderInput){M.lastO=null;renderMatch(noRenderInput);drawSoon();restart();save();renderExport();if(E.ready){fxApply(0);fxApply(1)}}
function nudge(k){
  const o=model();if(!o||!o.hasA||!o.hasB)return;
  mPush();if(M.align==null)M.align=o.align;
  if(k==='bar'||k==='-bar')M.align+=k[0]==='-'?-1:1;
  else{M.nudge=r6(M.nudge+(k[0]==='-'?-1:1)*(k.endsWith('beat')?o.beat:0.01));
    // whole bars go into `align`, the rest stays a nudge within ±½ bar
    const w=Math.round(M.nudge/o.bar);if(w){M.align+=w;M.nudge=r6(M.nudge-w*o.bar)}}
  changed();
}
function loopToggle(){
  const o=model();if(!o)return;
  if(M.loopOn){M.loopOn=false}
  else{const h=heard(),k=Math.floor((h-o.bar0)/o.bar+1e-6);if(!M.loop||h<o.bar0+M.loop.a*o.bar||h>o.bar0+M.loop.b*o.bar)M.loop={a:k,b:k+M.loopBars};M.loopOn=true}
  save();renderTransport();renderExport();drawSoon();
  if(E.playing&&M.loopOn){const lt=loopT(o),h=heard();if(h<lt.a||h>=lt.b)startAt(lt.a,E.o)}
}
function zoom(f){
  const o=model();if(!o)return;const span=(o.t1-o.t0)/M.zoom,mid=E.playing?heard():M.view0+span/2;zoomAt(f,mid,0.5);
}
// freemove: the deepest zoom shows 0.2 s across the timeline (≈ 5 px per ms on a 1000 px timeline)
const zMax=o=>Math.max(1,(o.t1-o.t0)/0.2);
// zoom by f keeping timeline time `at` under the same fraction `fx` of the width
function zoomAt(f,at,fx){
  const o=model();if(!o)return;const z=clamp(M.zoom*f,1,zMax(o));if(z===M.zoom)return;
  M.zoom=z;const ns=(o.t1-o.t0)/z;M.view0=clamp(at-fx*ns,o.t0,Math.max(o.t0,o.t1-ns));renderTransport();drawSoon();
}

/* ---------- library picker ---------- */
function openPick(i,btn){M.pickFor=i;M.pickFrom=btn||null;$('#mxPick').hidden=false;$('#mxPickQ').value='';renderPick();setTimeout(()=>$('#mxPickQ').focus(),30)}
function closePick(){const p=$('#mxPick');if(!p||p.hidden)return;p.hidden=true;if(M.pickFrom&&document.contains(M.pickFrom))M.pickFrom.focus();M.pickFrom=null}
function renderPick(){
  const q=$('#mxPickQ').value.trim().toLowerCase(),ul=$('#mxPickL'),signed=CR.signedIn();
  const all=CR.readLib().filter(x=>x&&x.name),list=all.filter(x=>!q||String(x.name).toLowerCase().includes(q));
  const any=all.some(x=>x.file_path);
  $('#mxPickN').textContent=!signed||!any?t('mxLibEmpty'):q&&!list.some(x=>x.file_path)?t('mxLibNone'):'';ul.innerHTML='';
  for(const it of list){
    const ok=signed&&!!it.file_path,li=document.createElement('li');li.className='mxpr'+(ok?'':' dis');
    li.innerHTML='<span class="kbw"></span><div class="mxpt"><div class="tt"></div><div class="ar mono"></div></div><button type="button" class="btn ghost"></button>';
    if(it.key)li.querySelector('.kbw').append(CR.keyBadge({pc:it.key.pc,mode:it.key.mode}));
    li.querySelector('.tt').textContent=it.name;li.querySelector('.tt').dir='auto';
    li.querySelector('.ar').textContent=(it.bpm?`${CR.fmtBpm(Math.round(it.bpm*10)/10)} BPM · `:'')+CR.fmtS(it.dur||0)+(ok?'':` · ${t('mxLibNoFile')}`);
    const b=li.querySelector('button');b.textContent=t('mxLoadTo',{s:LET[M.pickFor]});b.disabled=!ok;
    b.onclick=()=>{closePick();loadLib(M.pickFor,it)};ul.appendChild(li);
  }
}

/* ---------- render ---------- */
const pct=(r,bare)=>{const p=(r-1)*100;return (bare?'':p>0.05?'+':p<-0.05?'−':'')+Math.abs(p).toFixed(1)+(bare?'%':'\u00a0%')};
const fmtT=x=>{const s=x<0?'−':'',a=Math.abs(x),m=Math.floor(a/60),r=a-m*60;return s+m+':'+(r<10?'0':'')+r.toFixed(1)};
const keyTxt=k=>k?CR.keyText(k):'—';
function sourceBtns(){return [["file","mxFile"],["lib","mxLib"],["tool","mxTool"]].map(([a,k])=>`<button type="button" class="btn ghost" data-a="${a}" title="${esc(t(k))}" aria-label="${esc(t(k))}">${IC[a]}<span>${esc(t(k))}</span></button>`).join("")}
function renderSlot(i){
  const el=$('#mxSlot'+i);if(!el)return;const sl=M.slots[i],s=sl.song,L=LET[i];
  el.classList.toggle('a',i===0);el.classList.toggle('b',i===1);el.classList.toggle('empty',!s);
  const head=`<header class="mxsh"><span class="mxlet ${i?'b':'a'}" dir="ltr" aria-hidden="true">${L}</span><h2 id="mxSlH${i}">${esc(t(i?'mxSlotB':'mxSlotA'))}</h2>${s?`<button type="button" class="mxib mxx" data-a="clear" title="${esc(t('mxClear'))}" aria-label="${esc(t('mxClear'))}">${IC.x}</button>`:''}</header>`;
  if(sl.loading){
    el.innerHTML=head+`<div class="mxload" role="status"><span class="mxlm"></span><div class="bar"><i></i></div></div>`;slotProg(i);return;
  }
  if(!s){
    el.innerHTML=head+`<div class="mxdrop"><span class="mxdi">${IC.drop}</span><b>${esc(t('mxDrop'))}</b><span class="snote">${esc(t('mxDropH'))}</span><div class="mxsrc">${sourceBtns()}</div></div>`;return;
  }
  const a=s.an,info=CR.sepInfo(),busy=!!s.sep;
  const kindL=s.kind==='ai'?t('mxAiStems'):s.kind==='quick'?t('mxQuickStems'):s.kind==='tool'?t('mxToolStems'):t('mxFull');
  const o=model(),v=i===0&&o&&o.hasA?vocalStart(s):null,vb=v?Math.round((v.t-firstDown(s.an))/(240/s.an.bpm))+1:null;
  el.innerHTML=head+`
  <div class="mxname" dir="auto" title="${esc(s.name)}">${esc(s.name)}</div>
  <div class="mxinfo"><span class="kbw"></span><span class="mono" dir="ltr">${esc(CR.fmtBpm(Math.round(a.bpm*10)/10))} BPM</span>
    <span class="mxhd" dir="ltr"><button type="button" class="mxtag" data-a="half" title="${esc(t('mxHalfT'))}" aria-label="${esc(t('mxHalfT'))}">½×</button><button type="button" class="mxtag" data-a="double" title="${esc(t('mxDoubleT'))}" aria-label="${esc(t('mxDoubleT'))}">2×</button></span>
    <span class="mono" dir="ltr">${esc(CR.fmtS(s.buffer.duration))}</span>${vb!=null?`<span class="snote mxva">${esc(t('mxVocalAt',{n:vb}))}</span>`:''}</div>
  <div class="mxstems">
    <div class="mxkind${s.stems?' ok':''}${s.kind==='quick'?' lo':''}"><span class="dot" aria-hidden="true"></span><span>${esc(kindL)}${s.cached?` · ${esc(t('mxCached'))}`:''}</span></div>
    ${!s.stems&&!busy?`<p class="snote">${esc(t(i?'mxFullHintB':'mxFullHintA'))}</p>`:''}
    ${busy?`<div class="mxsepp" role="status"><span class="mxlm"></span><div class="bar"><i></i></div><button type="button" class="btn ghost" data-a="cancel">${esc(t('cancel'))}</button></div>`:
      s.kind!=='ai'&&s.kind!=='tool'?`<div class="mxsepb"><button type="button" class="btn solid" data-a="ai"${info.on&&!info.busy?'':' disabled'}>${IC.ai}<span>${esc(t('mxSepAI'))}</span>${info.cost?`<span class="mxcost mono">${esc(t('mxCost',{n:info.cost}))}</span>`:''}</button>
        ${!s.stems?`<button type="button" class="btn ghost" data-a="quick" title="${esc(t('mxQuickT'))}">${IC.bolt}<span>${esc(t('mxSepQuick'))}</span></button>`:''}</div>
        ${!info.on?`<p class="snote">${esc(t('offByAdmin'))}</p>`:!s.stems?`<p class="snote mxq">${esc(t('mxQuickT'))}</p>`:''}`:''}
    <div class="mxparts${s.stems?'':' off'}">${IDS.map(id=>{const st=CR.STEMS.find(x=>x.id===id),on=sl.use[id],m=sl.mute[id],nm=t(id);
      return `<div class="mxpart${on?' on':''}${m?' muted':''}" style="--sc:${st.color}">
        <button type="button" class="mxuse" data-a="use" data-id="${id}" aria-pressed="${on}" aria-label="${esc(t('mxUse',{s:nm}))}"${s.stems?'':' disabled'}>${CR.STEM_IC[id]}<span>${esc(nm)}</span></button>
        <input type="range" dir="ltr" min="0" max="1.5" step="0.01" value="${sl.gain[id]}" data-g="${id}" aria-label="${esc(t('mxGain',{s:nm}))}"${s.stems&&on?'':' disabled'}>
        <output class="mono">${Math.round(sl.gain[id]*100)}%</output>
        <button type="button" class="mxm" data-a="mute" data-id="${id}" aria-pressed="${m}" title="${esc(t('mxMute'))}" aria-label="${esc(t('mxMute'))} · ${esc(nm)}"${s.stems&&on?'':' disabled'}>M</button></div>`}).join('')}</div>
  </div>
  <div class="mxrepl"><span class="snote">${esc(t('mxReplaceL'))}</span>${sourceBtns()}</div>`;
  el.querySelector('.kbw').append(CR.keyBadge(a.key));
  if(busy)slotProg(i);
}
function slotProg(i){
  const el=$('#mxSlot'+i);if(!el)return;const sl=M.slots[i],x=sl.loading||(sl.song&&sl.song.sep);if(!x)return;
  const m=el.querySelector('.mxlm'),b=el.querySelector('.bar i');if(!m||!b){if(sl.loading&&!el.querySelector('.mxload'))renderSlot(i);return}
  m.textContent=x.msg;b.style.width=Math.round(clamp(x.p,0,1)*100)+'%';
}
function renderMatch(keepInput){
  const o=model(),main=$('#mxMain');if(!main)return;
  main.hidden=!o;$('#mxSteps').hidden=!!(song(0)&&song(1));
  if(!o)return;
  const A=an(0),B=an(1);
  $('#mxTempo').querySelectorAll('[data-tm]').forEach(b=>{const eff=M.tempo==='custom'?'custom':(M.tempo==='A'&&A)||!B?'A':'B',on=b.dataset.tm===eff;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));b.disabled=(b.dataset.tm==='A'&&!A)||(b.dataset.tm==='B'&&!B)});
  $('#mxBpmL').hidden=M.tempo!=='custom';if(!keepInput)$('#mxBpm').value=M.custom||'';
  const rt=[`${CR.fmtBpm(Math.round(o.T*10)/10)}\u00a0BPM`];
  if(o.hasA)rt.push(`A\u00a0${pct(o.rA)}${o.kA!==1?` (${o.kA===2?'2×':'½×'})`:''}`);
  if(o.hasB)rt.push(`B\u00a0${pct(o.rB)}${o.kB!==1?` (${o.kB===2?'2×':'½×'})`:''}`);
  $('#mxRates').textContent=rt.join(' · ');
  // key
  const kk=$('#mxKeys');kk.innerHTML='';const ko=keyOpts(),s=semis();
  if(A&&B){
    const cur={pc:mod(A.key.pc+s,12),mode:A.key.mode};
    const lab=(l,x)=>{const w=document.createElement('span');w.className='mxkl';const b=document.createElement('b');b.textContent=l;w.append(b,x);return w};
    const arr=document.createElement('span');arr.className='mxarr';arr.textContent='→';arr.setAttribute('aria-hidden','true');
    kk.append(lab('A',CR.keyBadge(A.key)),arr,CR.keyBadge(cur),lab('B',CR.keyBadge(B.key)));
    const chips=[[ko.best,ko.best.k.mode===B.key.mode?'mxKeyBest':'mxKeyRel'],...ko.nb.slice(0,2).map(x=>[x,'mxKeyFifth']),[ko.orig,'mxKeyOrig']].filter((x,j,arr)=>arr.findIndex(y=>y[0].s===x[0].s)===j);
    const ch=$('#mxKeyChips');ch.innerHTML='';
    for(const [x,l] of chips){const b=document.createElement('button');b.type='button';b.className='mxchip'+(x.s===s?' on':'');b.dataset.ks=x.s;b.setAttribute('aria-pressed',String(x.s===s));
      const st=(x.s>0?'+':x.s<0?'−':'±')+Math.abs(x.s);b.title=t('mxSemi',{n:(x.s>0?'+':'')+x.s});
      const lb=document.createElement('span');lb.textContent=t(l);const row=document.createElement('span');row.className='mxcr';row.dir='ltr';const sm=document.createElement('b');sm.className='mono';sm.textContent=st;
      row.append(CR.keyBadge(x.k),sm);b.append(lb,row);ch.appendChild(b)}
    $('#mxKV').textContent=(s>0?'+':s<0?'−':'±')+Math.abs(s);$('#mxKV').title=t('mxSemi',{n:s});
  }else{if(A||B)kk.append(CR.keyBadge((A||B).key));$('#mxKeyChips').innerHTML='';$('#mxKV').textContent='±0'}
  $('#mxKDn').disabled=$('#mxKUp').disabled=!(A&&B);
  // alignment
  const al=$('#mxAlign');al.disabled=!(A&&B);
  if(A&&B){
    const cs=bCueBars(o),opts=[];for(let k=0;k<o.nBars;k++){const cu=cs.filter(x=>x.bar===k).map(x=>window.CUES?CUES.NAME[x.k]:x.k);opts.push(`<option value="${k}">${esc(t('mxBar',{n:k+1}))}${cu.length?' · '+esc(cu.join(', ')):''}${k===o.alignAuto?' ★':''}</option>`)}
    if(al.options.length!==o.nBars||al.dataset.sig!==cs.map(x=>x.k+x.bar).join()+o.alignAuto+LANG()){al.innerHTML=opts.join('');al.dataset.sig=cs.map(x=>x.k+x.bar).join()+o.alignAuto+LANG()}
    al.value=String(clamp(o.align,0,o.nBars-1));
  }else al.innerHTML='';
  renderOff(o);   /* griddrag + freemove: lock line and offset (0.1 ms) */
  $('#mxNudge').querySelectorAll('button').forEach(b=>{b.disabled=!(A&&B);const k=b.dataset.nd,u=t(k.endsWith('bar')?'mxUBar':k.endsWith('beat')?'mxUBeat':'mxUMs'),lab=t(k[0]==='-'?'mxEarlier':'mxLater',{x:u});b.title=lab;b.setAttribute('aria-label',lab)});
  const sel=(id,list,val)=>{const e=$(id);e.innerHTML=list.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('');e.value=String(val)};
  const fl=[[0,t('mxFade0')],[1,t('mxFadeBeat')],[4,t('mxFadeBar')],[8,t('mxFadeBars',{n:2})],[16,t('mxFadeBars',{n:4})]];
  sel('#mxFi',fl,M.fadeIn);sel('#mxFo',fl,M.fadeOut);
  sel('#mxStartA',[['all',t('mxStartAll')],['pre',t('mxStartPre')],['vocal',t('mxStartVoc')]],M.startA);
  ['#mxFi','#mxFo','#mxStartA'].forEach(q=>{$(q).disabled=!(A&&B)});if(M.reg[0])$('#mxStartA').disabled=true;   /* studio: A is edited → its parts are fixed */
  $('#mxReset').disabled=!(A&&B);
  renderScore(o,ko,s);
}
const LANG=()=>CR.getLang();
function scoreOf(o,ko,s){
  const A=an(0),B=an(1);if(!A||!B)return null;
  const cur={pc:mod(A.key.pc+s,12),mode:A.key.mode},rel=CR.camRel(CR.camOf(cur),CR.camOf(B.key));
  const ca=CR.camOf(cur),cb=CR.camOf(B.key),dist=Math.min(mod(ca.n-cb.n,12),mod(cb.n-ca.n,12));
  const ks=rel===0||rel===1?100:rel>=2?78:Math.max(0,60-dist*12);
  const st=Math.abs(o.rA-1),ts=clamp(100-st*400,0,100);
  const pen=Math.abs(s)>=5?12:Math.abs(s)>=3?5:0;
  return {n:Math.round(clamp(0.6*ks+0.4*ts-pen,0,100)),rel,st,cur};
}
function renderScore(o,ko,s){
  const sc=scoreOf(o,ko,s),adv=$('#mxAdv'),ring=$('#mxRing');adv.innerHTML='';
  ring.hidden=!sc;if(!sc){return}
  $('#mxScoreN').textContent=sc.n;ring.setAttribute('aria-label',`${t('mxScore')} ${sc.n}/100`);
  const fg=$('#mxRingFg'),C=2*Math.PI*27;fg.style.strokeDasharray=`${C*sc.n/100} ${C}`;ring.dataset.lv=sc.n>=80?'hi':sc.n>=55?'mid':'lo';
  const A=an(0),B=an(1),L=[];
  if(s===0&&sc.rel>=0&&sc.rel<=1)L.push(['ok',t('mxAdvKeyOk')]);
  else if(sc.rel===0||sc.rel===1)L.push(['ok',t('mxAdvKeyShift',{n:(s>0?'+':'')+s,k:keyTxt(sc.cur),b:keyTxt(B.key)})]);
  else L.push(['warn',t('mxAdvKeyWarn',{k:keyTxt(sc.cur)})]);
  if(Math.abs(s)>=4)L.push(['warn',t('mxAdvShiftBig',{n:Math.abs(s)})]);
  if(o.kA!==1)L.push(['info',t('mxAdvHalf',{b:CR.fmtBpm(Math.round(A.bpm*10)/10),t:CR.fmtBpm(Math.round(A.bpm*o.kA*10)/10)})]);
  L.push(sc.st>0.08?['warn',t('mxAdvTempoBig',{p:pct(o.rA,true)})]:['ok',t('mxAdvTempoOk',{p:pct(o.rA,true)})]);
  const a=song(0),b=song(1);
  if(!a.stems)L.push(['warn',t('mxFullHintA')]);if(!b.stems)L.push(['warn',t('mxFullHintB')]);
  if(a.kind==='quick'||b.kind==='quick')L.push(['info',t('mxAdvQuick')]);
  for(const [k,x] of L){const li=document.createElement('li');li.className=k;li.textContent=x;adv.appendChild(li)}
}
function renderTransport(){
  if(!M.built)return;const o=model();
  const p=$('#mxPlay');p.innerHTML=E.playing?IC.pause:IC.play;const pl=t(E.playing?'mxPause':'mxPlay');p.title=pl;p.setAttribute('aria-label',pl);p.disabled=!o||E.starting;p.classList.toggle('on',E.playing);
  $('#mxStop').disabled=!o;
  const lb=$('#mxLoop');lb.classList.toggle('on',M.loopOn);lb.setAttribute('aria-pressed',String(M.loopOn));lb.title=t('mxLoopT',{n:M.loopBars});lb.disabled=!o;
  const ln=$('#mxLoopN');const ls=[4,8,16].map(n=>`<option value="${n}">${esc(t('mxLoopBars',{n}))}</option>`).join('');if(ln.dataset.l!==LANG()){ln.innerHTML=ls;ln.dataset.l=LANG()}ln.value=String(M.loopBars);ln.setAttribute('aria-label',t('mxLoop'));
  $('#mxZi').disabled=!o||M.zoom>=zMax(o)-1e-6;$('#mxZo').disabled=!o||M.zoom<=1;
  {const gb=$('#mxGrid');if(!o)M.gridOn=false;gb.disabled=!o;gb.classList.toggle('on',M.gridOn);gb.setAttribute('aria-pressed',String(M.gridOn));$('#mxGHelp').hidden=!M.gridOn;$('#mxTl').classList.toggle('grid',M.gridOn)}   /* griddrag */
  {const both=!!(o&&o.hasA&&o.hasB),fb=$('#mxFreeB');if(!both)M.freeOn=false;fb.disabled=!both;fb.classList.toggle('on',M.freeOn);fb.setAttribute('aria-pressed',String(M.freeOn));
    $('#mxFHelp').hidden=!M.freeOn;$('#mxSelL').textContent=M.freeOn&&M.sel!=null?t(M.sel?'mxSelB':'mxSelA'):'';$('#mxTl').classList.toggle('free',M.freeOn)}   /* freemove */
  $('#mxVolA').value=M.vol[0];$('#mxVolAo').textContent=Math.round(M.vol[0]*100)+'%';$('#mxVolB').value=M.vol[1];$('#mxVolBo').textContent=Math.round(M.vol[1]*100)+'%';
  $('#mxVolA').disabled=!(o&&o.hasA);$('#mxVolB').disabled=!(o&&o.hasB);
  const a=song(0),b=song(1);
  $('#mxCv').setAttribute('aria-label',o?t('mxTlAria',{a:a?a.name:'—',b:b?b.name:'—',bpm:CR.fmtBpm(Math.round(o.T*10)/10)}):'');
  $('#mxDeck').setAttribute('aria-label',t('mxTlAria',{a:a?a.name:'—',b:b?b.name:'—',bpm:o?CR.fmtBpm(Math.round(o.T*10)/10):''}));
  timeText();
}
function timeText(){
  const o=M.lastO||model();if(!o)return;const h=heard();
  $('#mxTime').textContent=`${fmtT(h)} / ${fmtT(o.t1)}`;
  const q=(h-o.bar0)/o.beat,bar=Math.floor(q/4),beat=Math.floor(mod(q,4));$('#mxBB').textContent=`${bar+1}.${beat+1}`;
}
/* points v2: an export costs the 'mashup' price; exporting the SAME mix again in this session (another format) is free.
   The mix = everything that changes the audio (songs, tempo, key shift, alignment, parts, levels, fades, range). */
const PAID=new Set();
const settleP=(p,n)=>{if(!p)return;if(CR.settleN)CR.settleN(p,n);else if(n>0&&p.id&&CR.refundN)CR.refundN(p,n)};   // points v2: refund n units + close the crash journal
function mixSig(o,a,b,r0,r1){return JSON.stringify([a.name,b.name,Math.round(a.buffer.duration*1000),Math.round(b.buffer.duration*1000),+o.T.toFixed(3),o.semis,o.rA&&+o.rA.toFixed(5),o.rB&&+o.rB.toFixed(5),
  o.vA,M.align,M.nudge,M.startA,M.fadeIn,M.fadeOut,M.vol,M.slots.map(s=>[s.use,s.gain]),+r0.toFixed(3),+r1.toFixed(3),
  M.fx,M.eq,M.reg,M.tr,M.duckOn&&M.duckAmt,M.width,M.solo,M.smute])}   /* studio */
function curSig(){const o=model(),a=song(0),b=song(1);if(!o||!a||!b||!o.hasA||!o.hasB)return null;let r0=o.t0,r1=o.t1;const lt=loopT(o);if(M.onlyLoop&&lt){r0=Math.max(o.t0,lt.a);r1=Math.min(o.t1,lt.b)}return mixSig(o,a,b,r0,r1)}
function renderExpPts(){const el=$('#mxExpPts');if(!el)return;let paid=false;try{const g=curSig();paid=!!(g&&PAID.has(g))}catch(e){}
  const c=CR.priceChip&&!paid?CR.priceChip('mashup',1):'';el.hidden=!c;el.textContent=c}
document.addEventListener('cr-prices',()=>{if(M.built)renderExpPts()});
function renderExport(){
  if(!M.built)return;const o=model(),A=an(0),B=an(1),both=!!(A&&B);
  $('#mxFmt').querySelectorAll('[data-fm]').forEach(b=>{const on=b.dataset.fm===M.fmt;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));b.disabled=M.exporting||(b.dataset.fm==='mp3'&&!(window.MP3&&MP3.supported))});
  $('#mxOnlyLoop').checked=M.onlyLoop;$('#mxOnlyLoop').disabled=!M.loop||M.exporting;
  $('#mxExp').disabled=!both||M.exporting;renderExpPts();
  $('#mxExpP').textContent=both&&o?t('mxExportP',{bpm:CR.fmtBpm(Math.round(o.T*10)/10),k:keyTxt(B.key)}):t('mxNeedBoth');
  $('#mxExpProg').hidden=!M.exporting;
}
function swapDis(){const b=$('#mxSwap');if(b)b.disabled=!(song(0)||song(1))||M.slots.some(s=>s.loading)}
function renderAll(){
  if(!M.built)return;renderSlot(0);renderSlot(1);swapDis();
  setMsg(M.msg,M.msgErr);renderMatch();renderTransport();renderExport();renderStudio();sizeCanvas();drawSoon();
}

/* ---------- studio panels: vocal FX rack, EQ, editing ---------- */
const FXD=[['rev','mxRev',[['size',0,1,0.01,'%'],['pre',0,150,1,'ms'],['mix',0,1,0.01,'%']]],
  ['dly','mxDly',[['fb',0,0.85,0.01,'%'],['hc',1000,16000,'log','hz'],['mix',0,1,0.01,'%']]],
  ['flt','mxFlt',[['lo',20,1500,'log','hz'],['hi',800,20000,'log','hz']]],
  ['cmp','mxCmp',[['amt',0,1,0.01,'%']]],
  ['cho','mxCho',[['depth',0,1,0.01,'%'],['width',0,1,0.01,'%'],['mix',0,1,0.01,'%']]],
  ['sat','mxSat',[['drive',0,1,0.01,'%'],['mix',0,1,0.01,'%']]]];
const PK={size:'mxPSize',pre:'mxPPre',mix:'mxPMix',fb:'mxPFb',hc:'mxPHc',lo:'mxPLo',hi:'mxPHi',amt:'mxPAmt',depth:'mxPDepth',width:'mxPWidth',drive:'mxPDrive'};
const PRE=[['dry','mxPDry'],['radio','mxPRadio'],['club','mxPClub'],['lofi','mxPLofi'],['dreamy','mxPDreamy'],['phone','mxPPhone']];
const EQPRE=[['flat','mxEqFlat'],['mud','mxEqMud'],['air','mxEqAir'],['warm','mxEqWarm'],['voc','mxEqVoc'],['bass','mxEqBass']];
const RTN={room:'mxRoom',hall:'mxHall',plate:'mxPlate'},DNOTE={'1/4':'1/4','1/8':'1/8','d1/8':'1/8.','1/16':'1/16'};
const FADEB=[0,0.25,0.5,1,2,4,8];
const fmtHz=x=>x>=1000?(Math.round(x/100)/10)+' kHz':Math.round(x)+' Hz';
const fmtV=(x,u)=>u==='%'?Math.round(x*100)+'%':u==='ms'?Math.round(x)+' ms':u==='hz'?fmtHz(x):String(x);
const toSl=(x,lo,hi,st)=>st==='log'?Math.round(1000*Math.log(x/lo)/Math.log(hi/lo)):x;
const fromSl=(v,lo,hi,st)=>st==='log'?Math.round(lo*Math.pow(hi/lo,v/1000)):+v;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fdb=g=>{const d=20*Math.log10(Math.max(1e-6,g));return (d>0.05?'+':d<-0.05?'−':'±')+Math.abs(d).toFixed(1)+' dB'};
function renderStudio(){if(!M.built)return;renderRack(0);renderRack(1);renderEq();renderEdit();renderMix();renderSmart()}
/* smart EQ / smart FX: local analysis of the audio actually used (stems in use, else the song), results as notes (data, so
   they re-render in any language); each run is one undo step (sound snapshot) */
function smartParts(i){const sl=M.slots[i],s=sl.song;if(!s)return [];return s.stems?IDS.map(id=>({id,buf:s.stems[id],g:gainOf(sl,id)})).filter(p=>p.g>0):[{id:'full',buf:s.buffer,g:1}]}
function specOf(i){const s=song(i);if(!s)return null;const ps=smartParts(i),key=JSON.stringify([s.key,s.kind,ps.map(p=>p.id+p.g.toFixed(2))]);
  if(s.spc&&s.spc.key===key)return s.spc.S;const S=MXFX.spectrum(ps);s.spc={key,S};return S}
const NOTEK={low:'mxSnLow',mud:'mxSnMud',harsh:'mxSnHarsh',pres:'mxSnPres',air:'mxSnAir',carve:'mxSnCarve',delay:'mxSnDelay',busy:'mxSnBusy',sparse:'mxSnSparse',mid:'mxSnMid',wet:'mxSnWet',dry:'mxSnDry',cmp:'mxSnCmp',warm:'mxSnWarm',bright:'mxSnBright',duck:'mxSnDuck'};
function notesText(ns){return (ns||[]).map(n=>t(NOTEK[n.k],{f:'\u2066'+fmtHz(n.f||0)+'\u2069',n:DNOTE[n.n]||'',bpm:n.bpm,p:n.p,db:n.db})).join(' · ')}
function renderSmart(){if(!M.built)return;const o=model();
  const en=$('#mxEqNote'),fn=$('#mxFxNote'),ne=M.eqNote[M.eqSlot];en.hidden=!ne;if(ne)en.innerHTML=`<b>${esc(t('mxSmDone'))}</b> ${esc(notesText(ne))}`;
  fn.hidden=!M.fxNote;if(M.fxNote)fn.innerHTML=`<b>${esc(t('mxSmDone'))}</b> ${esc(notesText(M.fxNote))}`;
  $('#mxSmEq').disabled=!laneOk(M.eqSlot,o);$('#mxSmFx').disabled=!laneOk(0,o)}
function smartEqRun(){
  const i=M.eqSlot,o=model();if(!laneOk(i,o))return;const S=specOf(i);if(!S)return;const V=i&&laneOk(0,o)?specOf(0):null;
  const r=MXFX.smartEq(S,i?'beat':'vocal',V);mPush(mSnap(true));M.eq[i]=r.eq;M.eqNote=M.eqNote.slice();M.eqNote[i]=r.notes;
  fxApply(i);save();renderExpPts();renderEq();renderSmart()}
function smartFxRun(){
  const o=model();if(!laneOk(0,o))return;const a=song(0),V=specOf(0),vs=a.stems&&M.slots[0].use.vocals?a.stems.vocals:a.buffer;
  if(!a.venv||a.venvSrc!==vs){a.venv=MXFX.vocalEnv(vs);a.venvSrc=vs}
  let B=null,benv=null;if(laneOk(1,o)){const b=song(1);B=specOf(1);if(!b.benv)b.benv=MXFX.vocalEnv(b.buffer);benv=b.benv}
  const r=MXFX.smartFx({T:o.T,minor:!!(a.an.key&&a.an.key.mode),V,venv:a.venv,B,benv});
  mPush(mSnap(true));M.fx[0]=r.fx;if(B){M.duckOn=true;M.duckAmt=r.duck}else r.notes=r.notes.filter(n=>n.k!=='duck');M.fxNote=r.notes;M._smart=r;
  fxChanged(0,true);changed();renderEdit();renderSmart()}
function renderPre(i){const el=$('#mxPre'+i);if(!el)return;el.setAttribute('aria-label',t('mxPresets'));
  el.innerHTML=`<span class="snote">${esc(t('mxPresets'))}</span>`+PRE.map(([k,l])=>{const on=same(M.fx[i],MXFX.PRESETS[k]);return `<button type="button" class="mxchip mxpc${on?' on':''}" data-pre="${k}" data-s="${i}" aria-pressed="${on}">${esc(t(l))}</button>`}).join('')}
function renderRack(i){
  const el=$('#mxRack'+i);if(!el)return;const F=M.fx[i];renderPre(i);
  el.innerHTML=FXD.map(([k,l,ps])=>{const x=F[k];
    let extra='';
    if(k==='rev')extra=`<div class="mxseg mxfxseg" role="radiogroup" aria-label="${esc(t(l))}">${MXFX.RTYPES.map(r=>`<button type="button" role="radio" data-rt="${r}" data-s="${i}" class="${x.type===r?'on':''}" aria-checked="${x.type===r}">${esc(t(RTN[r]))}</button>`).join('')}</div>`;
    if(k==='dly')extra=`<div class="mxfxrow"><div class="mxseg mxfxseg" role="radiogroup" aria-label="${esc(t('mxNoteL'))}" dir="ltr">${Object.keys(DNOTE).map(n=>`<button type="button" role="radio" data-dn="${n}" data-s="${i}" class="${x.note===n?'on':''}" aria-checked="${x.note===n}">${DNOTE[n]}</button>`).join('')}</div>
      <label class="mxchk"><input type="checkbox" data-pp="1" data-s="${i}"${x.pp?' checked':''}><span>${esc(t('mxPP'))}</span></label></div>`;
    return `<div class="mxfx${x.on?' on':''}" data-fx="${k}">
      <label class="mxsw"><input type="checkbox" data-fxon="${k}" data-s="${i}"${x.on?' checked':''} aria-label="${esc(t('mxOnOff',{s:t(l)}))}"><span class="mxswt" aria-hidden="true"></span><b>${esc(t(l))}</b></label>
      ${extra}${ps.map(([p,lo,hi,st,u])=>`<label class="mxfx1"><span>${esc(t(PK[p]))}</span><input type="range" dir="ltr" data-fp="${k}.${p}" data-s="${i}" min="${st==='log'?0:lo}" max="${st==='log'?1000:hi}" step="${st==='log'?1:st}" value="${toSl(x[p],lo,hi,st)}"><output class="mono">${fmtV(x[p],u)}</output></label>`).join('')}</div>`}).join('');
}
function fxChanged(i,reRack){fxApply(i);save();renderExpPts();if(reRack)renderRack(i);else renderPre(i)}
/* EQ panel */
const EQF=(()=>{const n=240,f=new Float32Array(n);for(let j=0;j<n;j++)f[j]=20*Math.pow(1000,j/(n-1));return f})();
function renderEq(){
  if(!M.built)return;const e=M.eq[M.eqSlot],b=e.b[M.eqBand],shelf=M.eqBand===0||M.eqBand===4;
  $('#mxEqSlot').querySelectorAll('[data-eqs]').forEach(x=>{const on=+x.dataset.eqs===M.eqSlot;x.classList.toggle('on',on);x.setAttribute('aria-checked',String(on))});
  $('#mxEqSlot').setAttribute('aria-label',t('mxEqFor'));
  $('#mxEqOn').checked=e.on;
  $('#mxEqPre').innerHTML=EQPRE.map(([k,l])=>{const on=same(e,MXFX.EQ_PRESETS[k]);return `<button type="button" class="mxchip mxpc${on?' on':''}" data-eqp="${k}" aria-pressed="${on}">${esc(t(l))}</button>`}).join('');
  $('#mxBands').setAttribute('aria-label',t('mxEqH'));
  $('#mxBands').innerHTML=e.b.map((x,j)=>`<button type="button" role="radio" class="mxband${j===M.eqBand?' on':''}" data-band="${j}" aria-checked="${j===M.eqBand}" aria-label="${esc(t('mxBand',{n:j+1}))}">${j+1}</button>`).join('');
  $('#mxEqF').value=toSl(b.f,20,20000,'log');$('#mxEqFo').textContent=fmtHz(b.f);
  $('#mxEqG').value=b.g;$('#mxEqGo').textContent=(b.g>0?'+':'')+b.g.toFixed(1)+' dB';
  $('#mxEqQ').value=toSl(b.q,0.2,10,'log');$('#mxEqQ').disabled=shelf;$('#mxEqQo').textContent=shelf?'—':b.q.toFixed(2);
  $('#mxEqCv').setAttribute('aria-label',t('mxEqAria',{s:LET[M.eqSlot]})+' · '+e.b.map((x,j)=>`${j+1}: ${fmtHz(x.f)} ${(x.g>0?'+':'')+x.g.toFixed(1)} dB`).join(', '));
  drawEq();
}
function eqSet(fn,reRender){const e=M.eq[M.eqSlot];fn(e.b[M.eqBand],e);fxApply(M.eqSlot);save();renderExpPts();if(reRender!==false)renderEq();else drawEq()}
const eqSpec={};
function drawEq(live){
  const cv=$('#mxEqCv');if(!cv)return;const w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;const d=window.devicePixelRatio||1;
  if(cv.width!==Math.round(w*d)||cv.height!==Math.round(h*d)){cv.width=Math.round(w*d);cv.height=Math.round(h*d)}
  const g=cv.getContext('2d'),col=colors(),e=M.eq[M.eqSlot],X=f=>Math.log(f/20)/Math.log(1000)*w,Y=db=>h/2-db/24*(h/2-10);
  g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,w,h);g.fillStyle=col.lane;g.fillRect(0,0,w,h);
  g.font='10px '+tok('--mono');g.textBaseline='top';
  for(const f of [50,100,200,500,1000,2000,5000,10000]){const x=Math.round(X(f))+0.5;g.fillStyle=col.line;g.fillRect(x,0,1,h);g.fillStyle=col.text;g.fillText(f>=1000?f/1000+'k':String(f),x+3,h-13)}
  for(const db of [-12,-6,0,6,12]){const y=Math.round(Y(db))+0.5;g.fillStyle=col.line;g.globalAlpha=db===0?1:0.6;g.fillRect(0,y,w,1);g.globalAlpha=1;g.fillStyle=col.text;g.fillText((db>0?'+':'')+db,3,y+2)}
  // live spectrum of the channel (preview only): per 3 px column, fast rise / smooth falloff, peak hold (0.8 s, then falls)
  const cols=Math.ceil(w/3)+1;if(!eqSpec.v||eqSpec.v.length!==cols){eqSpec.v=new Float32Array(cols);eqSpec.p=new Float32Array(cols);eqSpec.pt=new Float64Array(cols)}
  const now=performance.now(),dt=Math.min(0.1,(now-(eqSpec.t||now))/1000);eqSpec.t=now;
  if(live&&E.ready&&E.playing&&E.spec){if(!eqSpec.f||eqSpec.f.length!==E.spec.frequencyBinCount)eqSpec.f=new Float32Array(E.spec.frequencyBinCount);E.spec.getFloatFrequencyData(eqSpec.f);
    const nyq=c.sampleRate/2,F=eqSpec.f,n=F.length;
    for(let k=0;k<cols;k++){const f0=20*Math.pow(1000,k*3/w),f1=20*Math.pow(1000,(k+1)*3/w);let i0=Math.floor(f0/nyq*n),i1=Math.max(i0+1,Math.ceil(f1/nyq*n));let m=-200;for(let j=i0;j<Math.min(n,i1);j++)if(F[j]>m)m=F[j];
      const v=clamp((m+95)/80,0,1),V=eqSpec.v;V[k]=v>V[k]?v:Math.max(v,V[k]-dt*0.9);
      if(V[k]>=eqSpec.p[k]){eqSpec.p[k]=V[k];eqSpec.pt[k]=now}else if(now-eqSpec.pt[k]>800)eqSpec.p[k]=Math.max(V[k],eqSpec.p[k]-dt*0.5)}}
  else{for(let k=0;k<cols;k++){eqSpec.v[k]=Math.max(0,eqSpec.v[k]-dt*1.5);eqSpec.p[k]=Math.max(0,eqSpec.p[k]-dt*1.5)}}
  {const V=eqSpec.v,cc=M.eqSlot?col.b:col.a,gr=g.createLinearGradient(0,h,0,0);gr.addColorStop(0,cc);gr.addColorStop(1,'rgba(255,255,255,.85)');
    g.beginPath();g.moveTo(0,h);for(let k=0;k<cols;k++)g.lineTo(k*3,h-V[k]*(h-6));g.lineTo(w,h);g.closePath();g.fillStyle=gr;g.globalAlpha=0.28;g.fill();g.globalAlpha=1;
    g.fillStyle=cc;for(let k=0;k<cols;k++){const pv=eqSpec.p[k];if(pv>0.02)g.fillRect(k*3,h-pv*(h-6)-1,2,2)}}
  const rk=JSON.stringify(e);if(eqSpec.rk!==rk){eqSpec.rk=rk;eqSpec.r=MXFX.eqResponse(e,EQF)}const r=eqSpec.r;   // the curve only changes with the settings (not per spectrum frame)
  r.one.forEach((db,j)=>{if(!e.b[j].g)return;g.beginPath();for(let k=0;k<EQF.length;k++){const x=X(EQF[k]),y=Y(db[k]);k?g.lineTo(x,y):g.moveTo(x,y)}g.strokeStyle=col.text;g.globalAlpha=j===M.eqBand?0.7:0.35;g.lineWidth=1;g.stroke();g.globalAlpha=1});
  g.beginPath();for(let k=0;k<EQF.length;k++){const x=X(EQF[k]),y=Y(r.tot[k]);k?g.lineTo(x,y):g.moveTo(x,y)}g.strokeStyle=e.on?(M.eqSlot?col.b:col.a):col.text;g.lineWidth=2.2;g.stroke();
  e.b.forEach((b,j)=>{const x=X(b.f),y=Y(e.on?b.g:0),sel=j===M.eqBand;g.beginPath();g.arc(x,y,sel?9:7,0,7);g.fillStyle=sel?col.hi:'rgba(10,10,12,.85)';g.fill();g.lineWidth=2;g.strokeStyle=M.eqSlot?col.b:col.a;g.stroke();
    g.fillStyle=sel?'#0A0A0C':col.hi;g.font='700 10px '+tok('--mono');g.textAlign='center';g.textBaseline='middle';g.fillText(String(j+1),x,y+0.5);g.textAlign='start'});
}
function wireEq(){
  const cv=$('#mxEqCv');let dr=null;
  const at=ev=>{const r=cv.getBoundingClientRect();return {x:ev.clientX-r.left,y:ev.clientY-r.top,w:r.width,h:r.height}};
  const near=(p,rad)=>{const e=M.eq[M.eqSlot];let best=-1,bd=rad;e.b.forEach((b,j)=>{const x=Math.log(b.f/20)/Math.log(1000)*p.w,y=p.h/2-(e.on?b.g:0)/24*(p.h/2-10),dd=Math.hypot(x-p.x,y-p.y);if(dd<bd){bd=dd;best=j}});return best};
  cv.addEventListener('pointerdown',ev=>{if(ev.button>0)return;const p=at(ev),j=near(p,22);if(j<0)return;ev.preventDefault();cv.setPointerCapture(ev.pointerId);M.eqBand=j;dr={j};renderEq()});
  cv.addEventListener('pointermove',ev=>{if(!dr)return;const p=at(ev);eqSet(b=>{b.f=Math.round(clamp(20*Math.pow(1000,clamp(p.x/p.w,0,1)),20,20000));b.g=Math.round(clamp((p.h/2-p.y)/(p.h/2-10)*24,-18,18)*10)/10},false)});
  const up=()=>{if(dr){dr=null;renderEq()}};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',ev=>{const p=at(ev);let j=near(p,40);if(j<0)j=M.eqBand;if(j===0||j===4)return;ev.preventDefault();M.eqBand=j;eqSet(b=>{b.q=Math.round(clamp(b.q*Math.exp(-ev.deltaY*0.002),0.2,10)*100)/100})},{passive:false});
  cv.addEventListener('dblclick',ev=>{const j=near(at(ev),22);if(j<0)return;M.eqBand=j;eqSet(b=>{const d=MXFX.BANDS[j];b.f=d.f;b.g=0;b.q=d.q})});
  cv.addEventListener('keydown',ev=>{const k=ev.key;
    if(/^[1-5]$/.test(k)){M.eqBand=+k-1;renderEq();ev.preventDefault();return}
    const st=ev.shiftKey?5:1;
    if(k==='ArrowLeft'||k==='ArrowRight'){ev.preventDefault();eqSet(b=>{b.f=Math.round(clamp(b.f*Math.pow(1.03,(k==='ArrowRight'?1:-1)*st),20,20000))})}
    else if(k==='ArrowUp'||k==='ArrowDown'){ev.preventDefault();eqSet(b=>{b.g=Math.round(clamp(b.g+(k==='ArrowUp'?0.5:-0.5)*st,-18,18)*10)/10})}
    else if((k==='PageUp'||k==='PageDown')&&M.eqBand%4){ev.preventDefault();eqSet(b=>{b.q=Math.round(clamp(b.q*(k==='PageUp'?1.15:1/1.15),0.2,10)*100)/100})}
    else if(k==='0'){ev.preventDefault();const j=M.eqBand;eqSet(b=>{const d=MXFX.BANDS[j];b.f=d.f;b.g=0;b.q=d.q})}});
  new ResizeObserver(()=>drawEq()).observe(cv);
}
/* editing panel */
function renderEdit(){
  const el=$('#mxEdBody');if(!el)return;const o=model(),g=selReg(),i=M.rsel?M.rsel.i:-1,tr=M.tsel!=null?M.tr[M.tsel]:null;
  const ae=document.activeElement,keep=ae&&el.contains(ae)?(ae.id?'#'+ae.id:ae.dataset&&ae.dataset.ed?`[data-ed="${ae.dataset.ed}"]`:null):null;
  const btn=(ed,ic,l,tt,dis,pr)=>`<button type="button" class="btn ghost mxedb${pr?' on':''}" data-ed="${ed}" title="${esc(t(tt||l))}"${pr!=null?` aria-pressed="${!!pr}"`:''}${dis?' disabled':''}>${ic||''}<span>${esc(t(l))}</span></button>`;
  const btnL=(ed,ic,txt,dis)=>`<button type="button" class="btn ghost mxedb" data-ed="${ed}"${dis?' disabled':''}>${ic}<span>${esc(txt)}</span></button>`;
  const fsel=(id,v,lab)=>`<label class="mxfl"><span>${esc(t(lab))}</span><select class="sel" id="${id}">${FADEB.map(b=>`<option value="${b}"${b===v?' selected':''}>${b?esc(t('mxBeats',{n:b})):esc(t('mxFade0'))}</option>`).join('')}</select></label>`;
  let selH;
  if(g&&o){const p=placed(i,o,g);p.x1=Math.min(p.x1,o.t1);selH=`<b class="mxedl">${esc(t('mxSelR',{s:LET[i],n:M.rsel.k+1,a:'⁦'+fmtT(p.x0),b:fmtT(p.x1)+'⁩'}))}</b>
    <label class="mxfx1"><span>${esc(t('mxRGain'))}</span><input type="range" dir="ltr" id="mxRGain" min="-24" max="6" step="0.5" value="${Math.round(20*Math.log10(Math.max(1e-3,g.g))*2)/2}"><output class="mono">${fdb(g.g)}</output></label>
    <div class="mxrow2">${fsel('mxRFi',g.fi,'mxRFi')}${fsel('mxRFo',g.fo,'mxRFo')}</div>
    <label class="mxchk" title="${esc(t('mxThrowT'))}"><input type="checkbox" id="mxThrow"${g.th?' checked':''}><span>${esc(t('mxThrow'))}</span></label>`}
  else selH=`<p class="snote">${esc(t('mxNoSel'))}</p>`;
  const bOk=laneOk(1,o),aOk=laneOk(0,o);
  el.innerHTML=`<div class="mxedtools">${btn('undo','<span aria-hidden="true">↶</span>','mxUndo','mxUndoT',!M.undo.length)}${btn('redo','<span aria-hidden="true">↷</span>','mxRedo','mxRedoT',!M.redo.length)}<span class="mxedsep"></span>${btn('cut',IC.cut,'mxCut','mxCutT',!o,M.cutOn)}${btn('split',IC.split,'mxSplit','mxSplitT',!o)}${btn('dup',IC.dup,'mxDup','mxDupT',!g)}${btn('mute',IC.mute,'mxMuteR','mxMuteRT',!g,g?g.m:false)}${btn('del',IC.del,'mxDel',i===1?'mxDelBT':'mxDelT',!g)}</div>
  <div class="mxedsel">${selH}</div>
  <div class="mxedgs">
  <div class="mxedg"><h3>${esc(t('mxBBars'))}</h3><p class="snote">${esc(t('mxBBarsP'))}</p><div class="mxedrow"><select class="sel" id="mxBN" aria-label="${esc(t('mxBBars'))}"${bOk?'':' disabled'}>${[1,2,4,8,16].map(n=>`<option value="${n}"${n===M.bN?' selected':''}>${esc(t('mxLoopBars',{n}))}</option>`).join('')}</select>
    ${btnL('rep',IC.dup,t('mxRepeat',{n:M.bN}),!bOk)}${btnL('rem',IC.del,t('mxRemove',{n:M.bN}),!bOk)}</div></div>
  <div class="mxedg"><h3>${esc(t('mxTrans'))}</h3><div class="mxedrow">${['riser','down'].map(k=>`<button type="button" class="btn ghost mxedb" data-ed="${k}" title="${esc(t('mxTrAdd',{s:t(k==='riser'?'mxRiser':'mxDown')}))}"${o?'':' disabled'}><span class="mxtri ${k}" aria-hidden="true"></span><span>+ ${esc(t(k==='riser'?'mxRiser':'mxDown'))}</span></button>`).join('')}</div>
    ${tr?`<b class="mxedl">${esc(t('mxTrSel',{s:t(tr.k==='riser'?'mxRiser':'mxDown'),n:tr.bar+1}))}</b><div class="mxrow2"><label class="mxfl"><span>${esc(t('mxTLen'))}</span><select class="sel" id="mxTLen">${TRL.map(n=>`<option value="${n}"${n===tr.len?' selected':''}>${esc(t('mxLoopBars',{n}))}</option>`).join('')}</select></label>
      <label class="mxfx1"><span>${esc(t('mxTLv'))}</span><input type="range" dir="ltr" id="mxTLv" min="0" max="1.5" step="0.01" value="${tr.lv}"><output class="mono">${Math.round(tr.lv*100)}%</output></label></div>${btn('trdel',IC.del,'mxDel')}`:`<p class="snote">${esc(t('mxTrNone'))}</p>`}</div>
  <div class="mxedg"><h3>${esc(t('mxDuck'))}</h3><label class="mxchk"><input type="checkbox" id="mxDuckOn"${M.duckOn?' checked':''}${aOk&&bOk?'':' disabled'}><span>${esc(t('mxDuckT'))}</span></label>
    <label class="mxfx1"><span>${esc(t('mxDuckAmt'))}</span><input type="range" dir="ltr" id="mxDuckAmt" min="1" max="12" step="0.5" value="${M.duckAmt}"${M.duckOn?'':' disabled'}><output class="mono">−${M.duckAmt} dB</output></label></div>
  </div>
  <div class="mxedr">${[0,1].map(j=>`<button type="button" class="lnk" data-ed="reset${j}"${M.reg[j]?'':' disabled'}>${esc(t('mxResetEd',{s:LET[j]}))}</button>`).join('')}</div>
  <p class="snote mxedh">${esc(t('mxEdHelp'))}</p>`;
  if(keep){const n=el.querySelector(keep);if(n&&!n.disabled)n.focus()}
  const cb=$('#mxCutB');if(cb){cb.classList.toggle('on',M.cutOn);cb.setAttribute('aria-pressed',String(M.cutOn));cb.disabled=!o;$('#mxSplitB').disabled=!o;$('#mxTl').classList.toggle('cut',M.cutOn)}
  {const s=$('#mxStartA');if(s&&M.reg[0])s.disabled=true}
}
function renderMix(){
  if(!M.built)return;const o=model();
  $('#mxDeck').querySelectorAll('[data-sm]').forEach(b=>{const i=+b.dataset.s,on=b.dataset.sm==='solo'?M.solo[i]:M.smute[i];b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
    const l=t(b.dataset.sm==='solo'?'mxSoloT':'mxMuteS',{s:LET[i]});b.title=l;b.setAttribute('aria-label',l);b.disabled=!(o&&(i?o.hasB:o.hasA))});
  $('#mxWidth').value=M.width;$('#mxWidtho').textContent=Math.round(M.width*100)+'%';$('#mxWidth').disabled=!o;
  $('#mxMeter').setAttribute('aria-label',t('mxMeter'));
}
let edK=null;   // one undo step per slider burst
function edPush(id){const n=performance.now();if(!edK||edK.id!==id||n-edK.t>900)mPush();edK={id,t:n}}
function cutToggle(on){M.cutOn=on==null?!M.cutOn:on;if(M.cutOn){M.gridOn=false;M.freeOn=false}renderTransport();renderEdit();drawSoon()}
function splitKey(exact){const o=model();if(!o)return;let i=M.rsel?M.rsel.i:M.lane;if(!laneOk(i,o))i=laneOk(0,o)?0:1;splitAt(i,heard(),exact,false)}
function wireStudio(){
  const st=$('#mxStudio');
  st.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset,i=d.s!=null?+d.s:-1;
    if(d.pre){M.fx[i]=MXFX.clone(MXFX.PRESETS[d.pre]);fxChanged(i,true);const n=$(`#mxPre${i} [data-pre="${d.pre}"]`);if(n)n.focus();return}
    if(d.rt){M.fx[i].rev.type=d.rt;fxChanged(i,true);const n=$(`#mxRack${i} [data-rt="${d.rt}"]`);if(n)n.focus();return}
    if(d.dn){M.fx[i].dly.note=d.dn;fxChanged(i,true);const n=$(`#mxRack${i} [data-dn="${d.dn}"]`);if(n)n.focus();return}
    if(d.eqs!=null){M.eqSlot=+d.eqs;specRoute();renderEq();renderSmart();return}
    if(d.eqp){M.eq[M.eqSlot]=MXFX.clone(MXFX.EQ_PRESETS[d.eqp]);fxApply(M.eqSlot);save();renderExpPts();renderEq();const n=$(`#mxEqPre [data-eqp="${d.eqp}"]`);if(n)n.focus();return}
    if(d.band!=null){M.eqBand=+d.band;renderEq();const n=$(`#mxBands [data-band="${d.band}"]`);if(n)n.focus();return}
    const ed=d.ed;if(!ed)return;
    if(ed==='undo'){mUndo();return}if(ed==='redo'){mRedo();return}
    if(ed==='cut')cutToggle();else if(ed==='split')splitKey(false);else if(ed==='dup')dupSel();else if(ed==='mute')muteSel();else if(ed==='del')deleteSel();
    else if(ed==='rep'||ed==='rem')bBars(M.bN,ed==='rem');else if(ed==='riser'||ed==='down')addTr(ed);
    else if(ed==='trdel'){if(M.tsel!=null){mPush();M.tr.splice(M.tsel,1);M.tsel=null;edited()}}
    else if(ed==='reset0'||ed==='reset1')resetLane(+ed.slice(5));
  });
  st.addEventListener('input',e=>{
    const x=e.target,d=x.dataset,i=d.s!=null?+d.s:-1;
    if(d.fp){const [k,p]=d.fp.split('.'),ps=FXD.find(f=>f[0]===k)[2].find(q=>q[0]===p),v=fromSl(x.value,ps[1],ps[2],ps[3]);M.fx[i][k][p]=v;const out=x.parentElement.querySelector('output');if(out)out.textContent=fmtV(v,ps[4]);
      if(!(k==='rev'&&p==='size'))fxChanged(i);return}
    if(x.id==='mxEqF'||x.id==='mxEqG'||x.id==='mxEqQ'){const v=+x.value;eqSet(b=>{if(x.id==='mxEqF')b.f=fromSl(v,20,20000,'log');else if(x.id==='mxEqG')b.g=v;else b.q=Math.round(0.2*Math.pow(50,v/1000)*100)/100},false);
      $('#mxEqFo').textContent=fmtHz(M.eq[M.eqSlot].b[M.eqBand].f);const gg=M.eq[M.eqSlot].b[M.eqBand].g;$('#mxEqGo').textContent=(gg>0?'+':'')+gg.toFixed(1)+' dB';$('#mxEqQo').textContent=M.eqBand%4?M.eq[M.eqSlot].b[M.eqBand].q.toFixed(2):'—';return}
    if(x.id==='mxRGain'){const g=selReg();if(!g)return;edPush('g');g.g=Math.round(Math.pow(10,+x.value/20)*1e4)/1e4;if(+x.value<=-24)g.g=0;x.nextElementSibling.textContent=fdb(g.g);changed();return}
    if(x.id==='mxTLv'){const tr=M.tr[M.tsel];if(!tr)return;edPush('tl');tr.lv=+x.value;x.nextElementSibling.textContent=Math.round(tr.lv*100)+'%';changed();return}
    if(x.id==='mxDuckAmt'){M.duckAmt=+x.value;x.nextElementSibling.textContent='−'+M.duckAmt+' dB';changed();return}
  });
  st.addEventListener('change',e=>{
    const x=e.target,d=x.dataset,i=d.s!=null?+d.s:-1;
    if(d.fxon){M.fx[i][d.fxon].on=x.checked;x.closest('.mxfx').classList.toggle('on',x.checked);fxChanged(i);return}
    if(d.fp==='rev.size'){fxChanged(i);return}
    if(d.pp){M.fx[i].dly.pp=x.checked;fxChanged(i);return}
    if(x.id==='mxEqOn'){eqSet((b,e2)=>{e2.on=x.checked})}
    else if(x.id==='mxRFi'||x.id==='mxRFo'){const g=selReg();if(!g)return;mPush();g[x.id==='mxRFi'?'fi':'fo']=+x.value;edited()}
    else if(x.id==='mxThrow'){const g=selReg();if(!g)return;mPush();g.th=x.checked;edited()}
    else if(x.id==='mxBN'){M.bN=+x.value;renderEdit()}
    else if(x.id==='mxTLen'){const tr=M.tr[M.tsel];if(!tr)return;mPush();tr.len=+x.value;edited()}
    else if(x.id==='mxDuckOn'){M.duckOn=x.checked;changed();renderEdit()}
    else if(x.id==='mxRGain'||x.id==='mxTLv')renderEdit();
  });
  // A/B compare: held (pointer or Space/Enter on the focused button)
  const cb=$('#mxCmpB');
  cb.addEventListener('pointerdown',e=>{if(e.button>0)return;cb.setPointerCapture(e.pointerId);compare(true)});
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])cb.addEventListener(ev,()=>compare(false));
  cb.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();compare(true)}});
  cb.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();compare(false)}});
  cb.addEventListener('blur',()=>compare(false));
  $('#mxCutB').onclick=()=>cutToggle();$('#mxSplitB').onclick=()=>splitKey(false);
  $('#mxDeck').addEventListener('click',e=>{const b=e.target.closest('[data-sm]');if(!b||b.disabled)return;const i=+b.dataset.s;if(b.dataset.sm==='solo')M.solo[i]=!M.solo[i];else M.smute[i]=!M.smute[i];lvlAll()});
  $('#mxWidth').oninput=e=>{M.width=+e.target.value;$('#mxWidtho').textContent=Math.round(M.width*100)+'%';if(E.ready&&!M.cmp)E.wd.set(M.width);save();renderExpPts()};
  wireEq();
  $('#mxSmEq').onclick=smartEqRun;$('#mxSmFx').onclick=smartFxRun;
}
// output meter (peak + RMS, post-limiter), drawn from the frame loop at ≤ 30 fps
let mtBuf=null,mtPk=0;
function drawMeter(){
  const cv=$('#mxMeter');if(!cv)return;const g=cv.getContext('2d'),w=cv.width,h=cv.height;let pk=0,rms=0;
  if(E.ready&&E.playing){if(!mtBuf)mtBuf=new Float32Array(E.meter.fftSize);E.meter.getFloatTimeDomainData(mtBuf);let q=0;for(const x of mtBuf){const a=Math.abs(x);if(a>pk)pk=a;q+=x*x}rms=Math.sqrt(q/mtBuf.length)}
  mtPk=Math.max(pk,mtPk*0.92);const X=a=>clamp((20*Math.log10(Math.max(a,1e-5))+48)/48,0,1)*w;
  g.clearRect(0,0,w,h);g.fillStyle='rgba(255,255,255,.08)';g.fillRect(0,0,w,h);
  const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,'#2BD67B');gr.addColorStop(0.75,'#FFB020');gr.addColorStop(1,'#FF4D4D');
  g.fillStyle=gr;g.fillRect(0,2,X(rms),h-4);g.globalAlpha=0.45;g.fillRect(0,2,X(pk),h-4);g.globalAlpha=1;g.fillStyle='#fff';g.fillRect(Math.max(0,X(mtPk)-1),0,2,h);
}

/* ---------- timeline ---------- */
const TL={W:0,H:0,dpr:1,ruler:22,lane:0,gap:6,top:[0,0],dirty:true,raf:0};
function sizeCanvas(){
  const box=$('#mxTl');if(!box||!box.clientWidth)return;const d=window.devicePixelRatio||1,w=box.clientWidth,h=box.clientHeight;
  TL.dpr=d;TL.W=w;TL.H=h;TL.lane=Math.floor((h-TL.ruler-TL.gap*2)/2);TL.top=[TL.ruler+TL.gap,TL.ruler+TL.gap*2+TL.lane];
  for(const id of ['#mxCv','#mxOv']){const cv=$(id);cv.width=Math.round(w*d);cv.height=Math.round(h*d)}
}
function viewOf(o){if(M.zoom>zMax(o))M.zoom=zMax(o);const span=(o.t1-o.t0)/M.zoom;M.view0=clamp(M.view0,o.t0,Math.max(o.t0,o.t1-span));return {v0:M.view0,span}}
const xOf=(v,x)=>(x-v.v0)/v.span*TL.W;
function tok(n){return getComputedStyle($('#mashupView')).getPropertyValue(n).trim()}
function colors(){let a=tok('--acc-a')||'#2F8CFF',b=tok('--acc-b')||'#FF7A1A';if(window.A11Y&&A11Y.activePalette){const p=A11Y.activePalette();if(p){a=p.a;b=p.b}}return {a,b,line:tok('--deckline')||'#2A2A31',lane:tok('--deck2')||'#141418',text:tok('--deckmuted')||'#8B8B93',hi:tok('--decktext')||'#EDEDEF'}}
function drawSoon(){TL.dirty=true;kick()}
function kick(){if(!TL.raf&&M.visible)TL.raf=requestAnimationFrame(frame)}
function frame(){
  TL.raf=0;if(!M.visible)return;
  const o=model();if(!o){return}
  if(E.playing){const h=heard(),v=viewOf(o);if(M.zoom>1&&(h>v.v0+v.span*0.92||h<v.v0)){M.view0=h-v.span*0.08;TL.dirty=true}}
  if(TL.dirty){TL.dirty=false;drawStatic(o)}
  drawHead(o);timeText();beatTick(o);
  {const n=performance.now();if(n-(TL.mt||0)>33||!E.playing){TL.mt=n;drawMeter();if($('#mxPEq').open&&(E.playing||eqSpec.v&&eqSpec.v.some(x=>x>0)))drawEq(true)}if(!E.playing&&eqSpec.v&&eqSpec.v.some(x=>x>0))kick()}   /* studio: meter + live spectrum ≤ 30 fps */
  if(E.playing||M.drag)kick();
}
function drawLane(g,o,v,i,y,hgt,col){
  const s=song(i);g.fillStyle=col.lane;g.fillRect(0,y,TL.W,hgt);
  if(!s){g.fillStyle=col.text;g.font='12px '+tok('--sans');g.textAlign='center';g.fillText(t('mxEmptyLane'),TL.W/2,y+hgt/2+4);g.textAlign='start';return}
  const w=s.wave;if(!w)return;const mid=y+hgt/2,px=v.span/TL.W;
  if(px*w.rate<1&&drawRaw(g,o,v,i,s,y,hgt,col,px))return;   /* freemove: deep zoom → the samples themselves */
  for(let x=0;x<TL.W;x++){
    const ta=v.v0+x*px,tb=ta+px,tm=ta+px/2;
    if(i===0){if(tb<o.aStart||ta>o.aOut)continue}else if(ta>o.t1)break;
    const q=srcAt(i,o,tm);if(!q)continue;   /* studio: the region heard there */
    const fa=Math.max((i===0?Math.max(gA(o,ta),gA(o,tb)):1)*q.f,0.06);
    const pa=q.s-(tm-ta)*q.sg.r,pb=q.s+(tb-tm)*q.sg.r;if(pb<0||pa>s.buffer.duration)continue;
    const i0=Math.max(0,Math.floor(pa*w.rate)),i1=Math.min(w.len,Math.max(i0+1,Math.ceil(pb*w.rate)));if(i0>=w.len)continue;
    const r=CR.sliceRange(w,i0,i1),a=r[0],bi=r[4];
    const hh=Math.max(0.6,a*fa*(hgt/2-2));g.globalAlpha=q.muted?0.4:1;g.fillStyle=CR.wcol(w.col[bi*3],w.col[bi*3+1],w.col[bi*3+2]);g.fillRect(x,mid-hh,1,hh*2);g.globalAlpha=1;
  }
}
// deep zoom: min/max of the parts in use, sample by sample (the wave summary has 150 points a second)
function drawRaw(g,o,v,i,s,y,hgt,col,px){
  const sl=M.slots[i],bufs=s.stems?IDS.filter(id=>gainOf(sl,id)>0).map(id=>[s.stems[id],gainOf(sl,id)]):[[s.buffer,1]];if(!bufs.length)return true;
  const sr=bufs[0][0].sampleRate,ch=bufs.map(([b,k])=>[b.getChannelData(0),b.numberOfChannels>1?b.getChannelData(1):b.getChannelData(0),k*0.5]);
  const pk=typeof s.an.peak==='number'&&isFinite(s.an.peak)?Math.pow(10,s.an.peak/20):1,sc=(hgt/2-2)/Math.max(0.05,pk),mid=y+hgt/2,n=ch[0][0].length;
  g.fillStyle=i?col.b:col.a;
  for(let x=0;x<TL.W;x++){
    const ta=v.v0+x*px,tb=ta+px,tm=ta+px/2;
    if(i===0){if(tb<o.aStart||ta>o.aOut)continue}else if(ta>o.t1)break;
    const q=srcAt(i,o,tm);if(!q)continue;const fa=Math.max((i===0?Math.max(gA(o,ta),gA(o,tb)):1)*q.f,0.06);
    let j0=Math.floor((q.s-(tm-ta)*q.sg.r)*sr),j1=Math.ceil((q.s+(tb-tm)*q.sg.r)*sr);if(j1<0||j0>=n)continue;j0=Math.max(0,j0);j1=Math.min(n,Math.max(j0+1,j1));
    let lo=Infinity,hi=-Infinity;for(let j=j0;j<j1;j++){let q=0;for(const [L,R,k] of ch)q+=(L[j]+R[j])*k;if(q<lo)lo=q;if(q>hi)hi=q}
    const a=clamp(mid-hi*fa*sc,y,y+hgt),b=clamp(mid-lo*fa*sc,y,y+hgt);g.fillRect(x,a,1,Math.max(1,b-a));
  }
  return true;
}
function drawStatic(o){
  const cv=$('#mxCv');if(!cv||!TL.W)return;const g=cv.getContext('2d'),d=TL.dpr,col=colors(),v=viewOf(o);
  g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,TL.W,TL.H);
  // bar grid + ruler numbers (spacing adapts to the zoom)
  const barPx=o.bar/v.span*TL.W,every=[1,2,4,8,16,32,64].find(n=>n*barPx>=34)||64;
  const k0=Math.floor((v.v0-o.bar0)/o.bar),k1=Math.ceil((v.v0+v.span-o.bar0)/o.bar);
  g.font='10.5px '+tok('--mono');g.textBaseline='middle';
  for(let k=k0;k<=k1;k++){const x=Math.round(xOf(v,o.bar0+k*o.bar))+0.5;if(x<-1||x>TL.W+1)continue;
    const strong=mod(k,4)===0;g.fillStyle=strong?col.line:col.line;g.globalAlpha=strong?1:0.5;
    if(barPx>3||strong){g.fillRect(x,TL.ruler,1,TL.H-TL.ruler)}
    g.globalAlpha=1;if(mod(k,every)===0&&k>=0){g.fillStyle=col.text;g.fillRect(x,TL.ruler-6,1,6);g.fillText(String(k+1),x+3,TL.ruler/2)}}
  /* freemove: deeper zoom → beats (bar.beat), then 16ths, then ms ticks counted from the beat on their left */
  const beatPx=barPx/4,pxMs=TL.W/v.span/1000;
  if(beatPx>=36){const j0=Math.floor((v.v0-o.bar0)/o.beat),j1=Math.ceil((v.v0+v.span-o.bar0)/o.beat),sub=beatPx>=120&&pxMs<2;
    for(let j=j0;j<=j1;j++){const tb=o.bar0+j*o.beat,x=Math.round(xOf(v,tb))+0.5;
      if(mod(j,4)){if(x>=-1&&x<=TL.W+1){g.fillStyle=col.line;g.globalAlpha=0.45;g.fillRect(x,TL.ruler,1,TL.H-TL.ruler);g.globalAlpha=1;g.fillStyle=col.text;g.fillRect(x,TL.ruler-4,1,4);if(beatPx>=60&&j>=0)g.fillText(`${Math.floor(j/4)+1}.${mod(j,4)+1}`,x+3,TL.ruler/2)}}
      if(sub)for(let q=1;q<4;q++){const xs=Math.round(xOf(v,tb+q*o.beat/4))+0.5;if(xs>=0&&xs<=TL.W){g.fillStyle=col.text;g.globalAlpha=0.6;g.fillRect(xs,TL.ruler-3,1,3);g.globalAlpha=1}}
      if(pxMs>=0.25){const st=[1,2,5,10,20,50,100,200].find(m=>m*pxMs>=56)||200,mi=st/(st>=10&&String(st)[0]==='2'?4:5),bms=o.beat*1000;
        for(let m=mi;m<bms-mi/2;m+=mi){const xm=Math.round(xOf(v,tb+m/1000))+0.5;if(xm<-40||xm>TL.W)continue;const lab=Math.abs(m/st-Math.round(m/st))<1e-6;
          g.fillStyle=col.text;g.globalAlpha=lab?0.9:0.5;g.fillRect(xm,TL.ruler-(lab?6:3),1,lab?6:3);g.globalAlpha=1;
          if(lab&&m*pxMs>=40&&(bms-m)*pxMs>=40)g.fillText('+'+(Math.round(m*10)/10)+'ms',xm+3,TL.ruler/2)}}
    }}
  // lanes
  g.globalCompositeOperation='lighter';
  drawLane(g,o,v,0,TL.top[0],TL.lane,col);drawLane(g,o,v,1,TL.top[1],TL.lane,col);
  g.globalCompositeOperation='source-over';
  // griddrag: each song's own bar lines in its lane (A's that sit on one of B's bars = locked, brighter); grid drag preview
  for(const i of [0,1]){
    const s=song(i);if(!s||!s.an||(i===0&&!o.hasA)||(i===1&&!o.hasB)||(M.reg[i]&&!M.gridOn))continue;
    const gd=M.drag&&M.drag.kind==='grid'&&M.drag.i===i&&M.drag.moved?M.drag:null,A=s.an,bs=240/A.bpm,fd=firstDown(A)+(gd?gd.dSrc:0);
    const sa=srcPos(i,o,v.v0),sz=srcPos(i,o,v.v0+v.span),k0=Math.floor((sa-fd)/bs)-1,k1=Math.ceil((sz-fd)/bs)+1,y=TL.top[i];
    if(k1-k0>TL.W/3)continue;
    for(let k=k0;k<=k1;k++){const src=fd+k*bs;if(src<0||src>s.buffer.duration)continue;const tl=tlOf(i,o,src),x=Math.round(xOf(v,tl))+0.5;if(x<0||x>TL.W)continue;
      const lock=i===0&&o.hasB&&!gd&&Math.abs(mod(tl-o.bar0+o.bar/2,o.bar)-o.bar/2)<1e-4;
      g.fillStyle=gd?'#22D3D3':lock?col.hi:i?col.b:col.a;g.globalAlpha=gd?0.95:lock?0.85:0.6;g.fillRect(x-0.5,y,gd||lock?2:1,TL.lane);
      g.globalAlpha=1;g.fillRect(x-(gd?3:2),y,gd?6:4,3)}
    if(gd&&gd.snap!=null){const x=xOf(v,tlOf(i,o,gd.snap)),yy=y+6;g.strokeStyle='#22D3D3';g.lineWidth=2.5;g.beginPath();g.moveTo(x-4,yy);g.lineTo(x-4,yy+5);g.arc(x,yy+5,4,Math.PI,0,true);g.lineTo(x+4,yy);g.stroke();
      g.fillStyle='#EDEDEF';g.fillRect(x-5.5,yy-2,3,3);g.fillRect(x+2.5,yy-2,3,3)}
  }
  if(M.gridOn){g.fillStyle='#22D3D3';g.fillRect(0,TL.ruler,TL.W,2)}
  // lane labels
  for(const i of [0,1]){const y=TL.top[i];g.fillStyle=i?col.b:col.a;g.fillRect(0,y,3,TL.lane);g.font='600 11px '+tok('--mono');g.fillText(LET[i],8,y+11)}
  if(M.freeOn&&M.sel!=null&&o.hasA&&o.hasB){const i=M.sel,y=TL.top[i],x0=i?Math.max(0,xOf(v,0)):Math.max(0,xOf(v,o.aStart)),x1=Math.min(TL.W,xOf(v,i?o.t1:o.aOut));   /* freemove: the selected clip */
    if(x1>x0){g.strokeStyle=i?col.b:col.a;g.lineWidth=2;g.strokeRect(x0+1,y+1,x1-x0-2,TL.lane-2);g.globalAlpha=0.08;g.fillStyle=i?col.b:col.a;g.fillRect(x0,y,x1-x0,TL.lane);g.globalAlpha=1}}
  // B's structure cues
  const b=song(1);
  if(b&&o.hasB&&window.CUES)for(const cu of b.cues||[]){const x=xOf(v,cu.t/o.rB);if(x<-40||x>TL.W)continue;const cc=CUES.COL[cu.k]||[200,200,200],cs=`rgb(${cc[0]},${cc[1]},${cc[2]})`;
    g.fillStyle=cs;g.fillRect(Math.round(x),TL.top[1],2,TL.lane);g.beginPath();g.moveTo(x,TL.top[1]);g.lineTo(x+14,TL.top[1]);g.lineTo(x+14,TL.top[1]+12);g.lineTo(x,TL.top[1]+12);g.fill();
    g.fillStyle='#0A0A0C';g.font='700 9px '+tok('--mono');g.fillText((CUES.NAME[cu.k]||cu.k)[0],x+4,TL.top[1]+6.5)}
  // A's vocal entry = the anchor, shown on both lanes
  if(o.hasA&&o.hasB){const x=Math.round(xOf(v,o.anchor))+0.5,lock=Math.abs(M.nudge)<LOCK;if(x>=0&&x<=TL.W){g.strokeStyle=lock?col.hi:col.a;g.lineWidth=lock?2:1.5;if(!lock)g.setLineDash([4,3]);g.beginPath();g.moveTo(x,TL.top[0]);g.lineTo(x,TL.top[1]+TL.lane);g.stroke();g.setLineDash([]);
    g.fillStyle=col.a;g.beginPath();g.moveTo(x-5,TL.top[0]);g.lineTo(x+5,TL.top[0]);g.lineTo(x,TL.top[0]+7);g.fill();
    if(lock){const ly=TL.top[1]-TL.gap-1;g.fillStyle=col.hi;g.fillRect(x+4,ly-6,8,6);g.strokeStyle=col.hi;g.lineWidth=1.5;g.beginPath();g.arc(x+8,ly-6,2.6,Math.PI,0);g.stroke()}}}   /* griddrag: downbeat lock */
  // loop range
  const lt=loopT(o);if(lt){const x0=xOf(v,lt.a),x1=xOf(v,lt.b);g.fillStyle=M.loopOn?'rgba(255,176,32,.16)':'rgba(255,255,255,.06)';g.fillRect(x0,TL.ruler,x1-x0,TL.H-TL.ruler);
    g.fillStyle=M.loopOn?tok('--warn')||'#FFB020':col.text;g.fillRect(x0,0,Math.max(2,x1-x0),4)}
  drawRegions(g,o,v,col);drawTrans(g,o,v,col);   /* studio */
}
// studio: region blocks on edited lanes (edges, fades, mute hatch, gain, echo throw), the selected one framed with fade handles
function drawRegions(g,o,v,col){
  for(const i of [0,1]){if(!M.reg[i])continue;const y=TL.top[i],H=TL.lane,cc=i?col.b:col.a;
    for(const sg of o.seg[i]){const x0=xOf(v,sg.x0),x1=xOf(v,sg.x1);if(x1<0||x0>TL.W)continue;const w=Math.max(1,x1-x0),sel=M.rsel&&M.rsel.i===i&&M.rsel.k===sg.k;
      g.fillStyle=cc;g.globalAlpha=sg.m?0.3:0.9;g.fillRect(x0,y,w,4);g.globalAlpha=0.06;g.fillRect(x0,y,w,H);g.globalAlpha=1;
      g.fillStyle=col.hi;g.globalAlpha=0.6;g.fillRect(Math.round(x0),y,1,H);g.fillRect(Math.round(x1)-1,y,1,H);g.globalAlpha=1;
      if(sg.m){g.save();g.beginPath();g.rect(x0,y,w,H);g.clip();g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x0,y,w,H);g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=1;g.beginPath();for(let q=x0-H;q<x1;q+=8){g.moveTo(q,y+H);g.lineTo(q+H,y)}g.stroke();g.restore()}
      g.strokeStyle=col.hi;g.lineWidth=1.2;g.globalAlpha=0.8;
      if(sg.fi>0){g.beginPath();g.moveTo(x0,y+H);g.lineTo(xOf(v,sg.x0+sg.fi),y+4);g.stroke()}
      if(sg.fo>0){g.beginPath();g.moveTo(xOf(v,sg.x1-sg.fo),y+4);g.lineTo(x1,y+H);g.stroke()}g.globalAlpha=1;
      g.font='600 10px '+tok('--mono');g.textBaseline='top';let lx=x0+5;
      if(Math.abs(sg.g-1)>1e-3&&w>44){g.fillStyle=col.hi;const s=fdb(sg.g).replace(' ',' ');g.fillText(s,lx,y+7);lx+=g.measureText(s).width+6}
      if(sg.th&&w>24){g.fillStyle='#22D3D3';g.fillText('ECHO',Math.max(lx,x1-36),y+7)}
      if(sel){g.strokeStyle='#fff';g.lineWidth=2;g.strokeRect(x0+1,y+1,w-2,H-2);
        for(const hx of [xOf(v,sg.x0+sg.fi),xOf(v,sg.x1-sg.fo)]){g.beginPath();g.arc(clamp(hx,x0+5,x1-5),y+8,4.5,0,7);g.fillStyle='#fff';g.fill();g.strokeStyle=cc;g.lineWidth=1.5;g.stroke()}}
    }}
}
// studio: transitions as wedges on the ruler (riser rises into its bar, downlifter falls from it) + a faint line on the bar
function drawTrans(g,o,v,col){
  const pc=tok('--acc-p')||'#B57BFF';
  M.tr.forEach((tr,k)=>{const p=trPlace(o,tr),x0=xOf(v,p.x0),x1=xOf(v,p.x1),xb=tr.k==='riser'?x1:x0;if(x1<0||x0>TL.W)return;const sel=M.tsel===k;
    g.fillStyle=pc;g.globalAlpha=sel?0.75:0.45;g.beginPath();if(tr.k==='riser'){g.moveTo(x0,TL.ruler);g.lineTo(x1,2);g.lineTo(x1,TL.ruler)}else{g.moveTo(x0,2);g.lineTo(x1,TL.ruler);g.lineTo(x0,TL.ruler)}g.closePath();g.fill();
    g.globalAlpha=sel?0.6:0.3;g.fillRect(Math.round(xb),TL.ruler,1,TL.H-TL.ruler);g.globalAlpha=1;
    if(sel){g.strokeStyle='#fff';g.lineWidth=1.5;g.stroke()}});
}
function drawHead(o){
  const cv=$('#mxOv');if(!cv||!TL.W)return;const g=cv.getContext('2d'),d=TL.dpr,v=viewOf(o);g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,TL.W,TL.H);
  if(M.drag&&M.drag.kind==='loop'&&M.drag.moved){const a=Math.min(M.drag.a,M.drag.b),b=Math.max(M.drag.a,M.drag.b),x0=xOf(v,o.bar0+a*o.bar),x1=xOf(v,o.bar0+b*o.bar);g.fillStyle='rgba(255,176,32,.22)';g.fillRect(x0,0,x1-x0,TL.H)}
  {const d=M.drag&&M.drag.kind==='free'&&M.drag.moved?{i:M.drag.i,d:M.drag.d,x:M.drag.cx,y:M.drag.y}:M.fdx&&performance.now()-M.fdx.t<1200?{i:M.fdx.i,d:M.fdx.d,x:xOf(v,o.anchor),y:TL.top[M.fdx.i]+TL.lane/2}:null;   /* freemove: live offset */
    if(d){const a=LET[d.i]+' '+fmtMs(d.d).replace('\u00a0',' '),b='A→B '+fmtMs(M.nudge).replace('\u00a0',' ');g.font='600 11px '+tok('--mono');
      const w=Math.max(g.measureText(a).width,g.measureText(b).width)+12,bx=clamp(d.x+12,2,TL.W-w-2),by=clamp(d.y-34,TL.ruler+2,TL.H-34);
      const cc=colors();g.fillStyle='rgba(10,10,12,.88)';g.fillRect(bx,by,w,32);g.fillStyle=d.i?cc.b:cc.a;g.fillRect(bx,by,2,32);g.fillStyle='#EDEDEF';g.textBaseline='middle';g.fillText(a,bx+7,by+9);g.fillStyle='#B8B8C0';g.fillText(b,bx+7,by+23);
}
    if(!M.drag&&M.fdx&&performance.now()-M.fdx.t<1300)kick()}
  if(M.cutOn&&M.hov&&!M.drag){const hx=Math.round(xOf(v,M.hov.t))+0.5,y=TL.top[M.hov.i];g.strokeStyle='#FFB020';g.lineWidth=1.5;g.setLineDash([4,3]);g.beginPath();g.moveTo(hx,y);g.lineTo(hx,y+TL.lane);g.stroke();g.setLineDash([])}   /* studio: where the cut lands */
  const x=Math.round(xOf(v,heard()))+0.5;if(x<0||x>TL.W)return;g.fillStyle='#fff';g.fillRect(x-0.5,0,2,TL.H);g.beginPath();g.moveTo(x-5,0);g.lineTo(x+6,0);g.lineTo(x+0.5,7);g.fill();
}
function beatTick(o){
  if(!E.playing){M.lastBeat=null;return}const h=heard(),b=Math.floor((h-o.bar0)/o.beat+1e-4);
  if(b!==M.lastBeat&&h>=o.t0){const first=M.lastBeat==null;M.lastBeat=b;if(!first){const bar=mod(b,4)===0;if(window.A11Y&&A11Y.beat)A11Y.beat(bar);if(window.BG)BG.pulse(bar?0.75:0.4)}}
}
// studio: hit tests in timeline seconds (p = {t, y?, v})
function trHit(o,p){const tol=6/TL.W*p.v.span;for(let k=M.tr.length-1;k>=0;k--){const q=trPlace(o,M.tr[k]);if(p.t>=q.x0-tol&&p.t<=q.x1+tol)return k}return -1}
function regHit(i,o,p){
  const y=p.y-TL.top[i],v=p.v,px=xOf(v,p.t),segs=o.seg[i];
  for(let j=segs.length-1;j>=0;j--){const sg=segs[j];if(!(M.rsel&&M.rsel.i===i&&M.rsel.k===sg.k)||y>18)continue;
    const a=xOf(v,sg.x0+sg.fi),b=xOf(v,sg.x1-sg.fo);if(Math.abs(px-a)<=8)return {k:sg.k,part:'fi'};if(Math.abs(px-b)<=8)return {k:sg.k,part:'fo'}}
  for(let j=segs.length-1;j>=0;j--){const sg=segs[j];if(p.t>=sg.x0&&p.t<=sg.x1)return {k:sg.k,part:'body'}}
  return null;
}
function wireTimeline(){
  const cv=$('#mxOv'),box=$('#mxTl');
  const tAt=e=>{const o=model(),r=box.getBoundingClientRect(),v=viewOf(o);return {o,t:v.v0+(e.clientX-r.left)/r.width*v.span,y:e.clientY-r.top,v}};
  box.addEventListener('pointerdown',e=>{
    const o=model();if(!o||e.button>0)return;const p=tAt(e);box.setPointerCapture(e.pointerId);e.preventDefault();
    const zone=p.y<TL.ruler?'ruler':p.y<TL.top[1]-TL.gap/2?'a':'b';
    const gi=zone==='a'?0:1;   /* griddrag: grid mode → the lane's song grid moves against its audio */
    if(zone!=='ruler')M.lane=gi;
    if(zone==='ruler'){const th=trHit(o,p);   /* studio: a transition on the ruler → move it */
      if(th>=0){if(M.tsel!==th||M.rsel){M.tsel=th;M.rsel=null;renderEdit()}M.drag={kind:'tr',k:th,x:e.clientX,t:p.t,bar:M.tr[th].bar,sn:mSnap()};drawSoon()}
      else{const k=Math.floor((p.t-o.bar0)/o.bar);M.drag={kind:'loop',x:e.clientX,a:k,b:k+1,t:p.t}}}
    else if(M.cutOn&&laneOk(gi,o)){splitAt(gi,p.t,e.altKey||e.ctrlKey||e.metaKey,e.shiftKey);M.drag={kind:'none',x:e.clientX}}   /* studio: cut tool */
    else if(M.reg[gi]&&!M.gridOn&&laneOk(gi,o)){const h=regHit(gi,o,p);   /* studio: edited lane → select / move / fade a region */
      if(h){const g=M.reg[gi][h.k];if(!M.rsel||M.rsel.i!==gi||M.rsel.k!==h.k){M.rsel={i:gi,k:h.k};M.tsel=null;renderEdit()}
        M.drag={kind:h.part==='body'?'rmove':'rfade',part:h.part,i:gi,k:h.k,x:e.clientX,t:p.t,sh:g.sh,sn:mSnap()}}
      else{if(M.rsel||M.tsel!=null){M.rsel=null;M.tsel=null;renderEdit()}M.drag={kind:'seek',x:e.clientX,t:p.t}}
      drawSoon()}
    else if(M.freeOn&&o.hasA&&o.hasB){   /* freemove: select the clip, drag = no snapping */
      if(M.sel!==gi){M.sel=gi;M.fk=null;renderTransport();drawSoon()}
      M.drag={kind:'free',i:gi,x:e.clientX,y:p.y,cx:e.clientX-box.getBoundingClientRect().left,nudge:M.nudge,align:M.align!=null?M.align:o.align,v0:M.view0,d:0,sn:mSnap(),o}}
    else if(M.gridOn&&zone!=='ruler'&&song(gi)&&song(gi).an&&(gi?o.hasB:o.hasA)){const s=song(gi),bs=240/s.an.bpm,fd=firstDown(s.an),ps=srcPos(gi,o,p.t);
      M.drag={kind:'grid',i:gi,x:e.clientX,t:p.t,r:gi?o.rB:o.rA,g:fd+Math.round((ps-fd)/bs)*bs,dSrc:0,snap:null,base:gridBase(gi),sn:mSnap(),o};M.gLane=gi}
    else if(zone==='a'&&o.hasA&&o.hasB)M.drag={kind:'a',x:e.clientX,anchor:o.anchor,t:p.t,sn:mSnap()};
    else M.drag={kind:'seek',x:e.clientX,t:p.t};
    kick();
  });
  box.addEventListener('pointermove',e=>{
    const d=M.drag;if(!d){return}const p=tAt(e),o=p.o;if(Math.abs(e.clientX-d.x)>3)d.moved=true;if(!d.moved)return;
    if(d.kind==='loop'){const k0=Math.floor((d.t-o.bar0)/o.bar),k=Math.round((p.t-o.bar0)/o.bar);d.a=Math.min(k0,k);d.b=Math.max(k0+1,k);if(d.b<=d.a)d.b=d.a+1}
    else if(d.kind==='a'){
      const na=d.anchor+(p.t-d.t),rel=na-o.bar0,was=M.align+'|'+M.nudge;
      if(e.altKey||e.ctrlKey||e.metaKey){const k=Math.round(rel/o.bar);M.align=k;M.nudge=Math.round((rel-k*o.bar)*1000)/1000}   // free (griddrag: Ctrl/⌘ too)
      else if(e.shiftKey){const q=Math.round(rel/o.beat)*o.beat,k=Math.round(q/o.bar);M.align=k;M.nudge=Math.round((q-k*o.bar)*10000)/10000}
      else{M.align=Math.round(rel/o.bar);M.nudge=0}
      M.lastO=null;TL.dirty=true;renderMatch();if(was!==M.align+'|'+M.nudge&&E.playing)restart();   // the preview follows
    }
    else if(d.kind==='tr'){const tr=M.tr[d.k],nb=Math.max(-64,d.bar+Math.round((p.t-d.t)/o.bar));if(tr&&tr.bar!==nb){tr.bar=nb;TL.dirty=true;if(E.playing)restart()}}   /* studio */
    else if(d.kind==='rmove'){const g=M.reg[d.i]&&M.reg[d.i][d.k];if(g){let db=(p.t-d.t)/o.beat;const free=M.freeOn||e.altKey||e.ctrlKey||e.metaKey;
      db=free?db:e.shiftKey?Math.round(db):Math.round(db/4)*4;const ns=r6(d.sh+db);if(g.sh!==ns){g.sh=ns;M.lastO=null;TL.dirty=true;if(E.playing)restart()}}}
    else if(d.kind==='rfade'){const g=M.reg[d.i]&&M.reg[d.i][d.k];if(g){const pl=placed(d.i,o,g),len=g.u1-g.u0;let b=(d.part==='fi'?p.t-pl.x0:pl.x1-p.t)/o.beat;
      if(!(M.freeOn||e.altKey||e.ctrlKey||e.metaKey))b=Math.round(b*4)/4;b=r6(clamp(b,0,len/2));if(g[d.part]!==b){g[d.part]=b;M.lastO=null;TL.dirty=true;if(E.playing)restart()}}}
    else if(d.kind==='free'){   /* freemove: pixel → seconds at the current zoom, no snapping */
      const r=box.getBoundingClientRect(),dt=r6((e.clientX-d.x)/r.width*p.v.span);d.d=dt;d.cx=e.clientX-r.left;d.y=p.y;
      M.align=d.align;M.nudge=d.nudge;moveA(d.i?-dt:dt,d.o);if(d.i)M.view0=d.v0-dt;
      M.lastO=null;TL.dirty=true;renderOff(model());if(E.playing)restart();
    }
    else if(d.kind==='grid'){   /* griddrag: preview only; applied when the drag ends */
      let ds=(p.t-d.t)*d.r;d.snap=null;
      if(!(e.ctrlKey||e.metaKey)&&CR.onsetNear){const q=CR.onsetNear(song(d.i).buffer,d.g+ds,0.02);if(q!=null){d.snap=q;ds=q-d.g}}
      d.dSrc=ds;TL.dirty=true;
    }
    kick();
  });
  const end=e=>{
    const d=M.drag;if(!d)return;M.drag=null;const p=tAt(e),o=p.o;
    if(d.kind==='free'&&!d.moved){drawSoon();return}   /* freemove: a click only selects */
    if(d.kind==='none'||d.kind==='tr'&&!d.moved){drawSoon();return}
    if((d.kind==='rmove'||d.kind==='rfade'||d.kind==='tr')&&d.moved){if(JSON.stringify(d.sn.reg)!==JSON.stringify(M.reg)||JSON.stringify(d.sn.tr)!==JSON.stringify(M.tr))mPush(d.sn);edited();drawSoon();return}   /* studio */
    if(!d.moved||d.kind==='seek'){const x=clamp(p.t,o.t0,o.t1-0.02);if(E.playing)startAt(x,model());else{M.pos=x;renderTransport()}}
    else if(d.kind==='loop'){M.loop={a:d.a,b:d.b};M.loopOn=true;save();renderTransport();renderExport();if(E.playing){const lt=loopT(o),h=heard();if(h<lt.a||h>=lt.b)startAt(lt.a,o)}}
    else if(d.kind==='a'||d.kind==='free'){if(d.sn.align!==M.align||d.sn.nudge!==M.nudge)mPush(d.sn);changed()}
    else if(d.kind==='grid'){if(Math.abs(d.dSrc)>1e-6){mPush(d.sn);gridShift(d.i,d.dSrc,d.base,d.o);changed()}}   /* griddrag */
    drawSoon();
  };
  box.addEventListener('pointerup',end);box.addEventListener('pointercancel',()=>{const d=M.drag;M.drag=null;if(d&&d.kind==='free'){M.align=d.sn.align;M.nudge=d.sn.nudge;M.view0=d.v0;changed()}drawSoon()});
  /* freemove: wheel / pinch (ctrl+wheel) = zoom around the pointer, Shift+wheel or a sideways swipe = scroll */
  box.addEventListener('wheel',e=>{
    const o=model();if(!o)return;e.preventDefault();
    const u=e.deltaMode===1?16:e.deltaMode===2?TL.W:1,dx=e.deltaX*u,dy=e.deltaY*u,r=box.getBoundingClientRect(),fx=clamp((e.clientX-r.left)/r.width,0,1),v=viewOf(o);
    if(e.shiftKey||Math.abs(dx)>Math.abs(dy)){const q=Math.abs(dx)>Math.abs(dy)?dx:dy;M.view0=clamp(M.view0+q/TL.W*v.span,o.t0,Math.max(o.t0,o.t1-v.span));drawSoon();return}
    zoomAt(Math.exp(-dy*(e.ctrlKey?0.01:0.002)),v.v0+fx*v.span,fx);
  },{passive:false});
  box.addEventListener('pointerleave',()=>{if(M.hov){M.hov=null;kick()}});
  box.addEventListener('pointermove',e=>{if(M.drag)return;const r=box.getBoundingClientRect(),y=e.clientY-r.top;const o=model();
    if(M.cutOn&&o&&y>=TL.ruler){const i=y<TL.top[1]-TL.gap/2?0:1,v=viewOf(o),x=v.v0+(e.clientX-r.left)/r.width*v.span;M.hov={i,t:snapX(o,x,e.altKey||e.ctrlKey||e.metaKey,e.shiftKey)};kick()}else if(M.hov){M.hov=null;kick()}
    if(o&&y<TL.ruler&&trHit(o,{t:viewOf(o).v0+(e.clientX-r.left)/r.width*viewOf(o).span,v:viewOf(o)})>=0){box.style.cursor='grab';return}
    if(M.cutOn&&o&&y>=TL.ruler){box.style.cursor='crosshair';return}
    box.style.cursor=!o?'default':y<TL.ruler?'col-resize':M.gridOn||M.freeOn&&o.hasA&&o.hasB?'ew-resize':y<TL.top[1]-TL.gap/2&&o.hasA&&o.hasB?'grab':'pointer'});
}

/* ---------- export ---------- */
async function exportMix(){
  if(M.exporting)return;const o=model(),a=song(0),b=song(1);
  if(!o||!a||!b){setExp(t('mxNeedBoth'),true);return}
  M.exporting=true;renderExport();stop(true);setExp(t('mxRendering',{p:0}));
  const prog=p=>{$('#mxExpProg .bar i').style.width=Math.round(clamp(p,0,1)*100)+'%'};prog(0);
  let pay=null,okSig=null;
  try{
    let r0=o.t0,r1=o.t1;const lt=loopT(o);if(M.onlyLoop&&lt){r0=Math.max(o.t0,lt.a);r1=Math.min(o.t1,lt.b)}
    const sig=mixSig(o,a,b,r0,r1);
    if(!PAID.has(sig)&&CR.payN){pay=await CR.payN('mashup',1,{ref:`${a.name} × ${b.name}`.slice(0,150)});if(!pay){setExp('');return}}
    const sr=44100,n=Math.max(1,Math.ceil((r1-r0)*sr));
    const need=[0,1].map(i=>!E.noStretch&&(i?Math.abs(o.rB-1)>1e-4:Math.abs(o.rA-1)>1e-4||o.semis!==0));
    let nodes=[null,null],lat=0;
    if(need[0]||need[1]){try{await CR.loadScript(CR.SS_SRC)}catch(e){need[0]=need[1]=false}}
    // studio: the same FX chains / width / transitions as the preview; reverb + echo tails ring on past the end (≤ 3 s, trimmed when silent)
    const fl=await MXFX.latency(),tailOn=!(M.onlyLoop&&lt)&&[0,1].some(i=>M.fx[i].rev.on||M.fx[i].dly.on||o.seg[i].some(x=>x.th)),tail=tailOn?3*sr:0;
    const oc=new OfflineAudioContext(2,n+tail+sr,sr);
    const master=oc.createGain();master.gain.value=0.9;const wd=MXFX.width(oc);wd.set(M.width,true);master.connect(wd.input);wd.output.connect(oc.destination);
    const trIn=oc.createGain();trIn.connect(master);
    const fade=[oc.createGain(),oc.createGain()],chs=[0,1].map(()=>MXFX.chain(oc)),lvl=[0,1].map(i=>{const g=oc.createGain();g.gain.value=effLvl(i);g.connect(master);chs[i].output.connect(g);return g});
    for(const i of [0,1])chs[i].set(M.fx[i],M.eq[i],o.beat,true);
    for(const i of [0,1])if(need[i]){nodes[i]=await window.SignalsmithStretch(oc);lat=+(await nodes[i].latency())||0}
    for(const i of [0,1]){if(nodes[i]){fade[i].connect(nodes[i]);nodes[i].connect(chs[i].input)}else{const dl=oc.createDelay(1);dl.delayTime.value=lat;fade[i].connect(dl).connect(chs[i].input)}}
    await Promise.all(schedule(oc,o,0,r0,{fade,out:nodes,ch:chs,trIn,pl:lat+fl},false).wait);
    const tot=(n+tail)/sr+lat;for(let x=1;x<tot;x+=1)oc.suspend(x).then(()=>{prog(x/tot*0.9);setExp(t('mxRendering',{p:Math.round(x/tot*90)}));oc.resume()}).catch(()=>{});
    const out=await oc.startRendering(),o0=Math.round((lat+fl)*sr);
    let nn=n+tail;if(tail){const a0=out.getChannelData(0),a1=out.getChannelData(1);let z=o0+nn-1;while(z>o0+n&&Math.abs(a0[z])<1e-4&&Math.abs(a1[z])<1e-4)z--;nn=Math.min(nn,z-o0+1+Math.round(0.05*sr))}
    const L=out.getChannelData(0).slice(o0,o0+nn),R=out.getChannelData(1).slice(o0,o0+nn);
    if(nn>n){const f=Math.min(nn-n,Math.round(0.05*sr));for(let j=0;j<f;j++){const k=(f-j-1)/f;L[nn-f+j]*=k;R[nn-f+j]*=k}}   // the tail ends on a 50 ms fade
    const N2=L.length;let pk=0;for(let j=0;j<N2;j++){const x=Math.abs(L[j]),y=Math.abs(R[j]);if(x>pk)pk=x;if(y>pk)pk=y}
    if(pk>0.98){const k=0.98/pk;for(let j=0;j<N2;j++){L[j]*=k;R[j]*=k}}
    prog(0.92);
    const mp3=M.fmt==='mp3'&&window.MP3&&MP3.supported,ext=mp3?'mp3':'wav',bpm=CR.fmtBpm(Math.round(o.T*10)/10),kn=CR.keyName(b.an.key.pc,b.an.key.mode,true);
    const title=`${a.name} × ${b.name} (Mashup)`;
    const data=mp3?await MP3.encode(L,R,sr,{kbps:320,tags:{title,artist:'Chord Room',bpm:o.T,key:kn},onProgress:p=>{prog(0.92+p*0.08);setExp(t('encoding',{p:Math.round(p*100)}))}}):CR.wav(L,R,sr);
    const fname=`${title} ${bpm} BPM ${kn}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').slice(0,180)+'.'+ext;
    const blob=new Blob([data],{type:mp3?'audio/mpeg':'audio/wav'});
    CR.saveBlob(blob,fname);prog(1);okSig=sig;PAID.add(sig);
    CR.log('mashup_export',`${a.name} × ${b.name} · ${bpm} BPM · ${kn} · ${ext}${M.onlyLoop&&lt?' · loop':''}`);
    setExp(t('mxDone',{f:fname,s:(blob.size/1048576).toFixed(1)}));
    M.lastExport={name:fname,size:blob.size,sr,n,lat,fl,r0,r1,...(window.__MX_TEST?{L,R}:{})};
  }catch(e){console.error(e);setExp(e&&/MP3/.test(String(e.message))?t('mp3Fail'):t('mxExpFail'),true)}
  finally{M.exporting=false;renderExport();settleP(pay,okSig?0:1)}   // failed export → points back
}
function setExp(m,err){const el=$('#mxExpMsg');if(!el)return;el.textContent=m||'';el.classList.toggle('err',!!err)}

/* ---------- keys ---------- */
document.addEventListener('keydown',e=>{
  if(!M.visible||e.metaKey||e.ctrlKey||e.altKey)return;
  if(!$('#mxPick').hidden)return;
  if(e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(e.target.closest('#mxEqCv')&&e.key!==' ')return;   /* studio: the EQ canvas uses arrows / digits itself */
  if(document.querySelector('.rm-panel:not([hidden]),#authDlg:not([hidden])')&&e.target.closest('.rm-panel,#authDlg'))return;
  const o=model();if(!o)return;
  if(e.code==='Space'){if(e.target.closest('button,label,a'))return;e.preventDefault();toggle()}
  else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){if(e.target.closest('.mxslot')||M.freeOn)return;e.preventDefault();
    if(M.gridOn||document.activeElement===$('#mxGrid')){gridKey((e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1));return}   /* griddrag */const x=clamp(heard()+(e.key==='ArrowRight'?1:-1)*o.bar,o.t0,o.t1-0.05);if(E.playing)startAt(x,o);else{M.pos=x;renderTransport();kick()}}
  else if(e.key==='l'||e.key==='L')loopToggle();
});

/* freemove: ← → move the selected clip 1 ms (Shift 10 ms, Alt 0.1 ms) */
document.addEventListener('keydown',e=>{
  if(!M.visible||!M.freeOn||M.sel==null||e.metaKey||e.ctrlKey||(e.key!=='ArrowRight'&&e.key!=='ArrowLeft'))return;
  if(!$('#mxPick').hidden||e.target.closest('input,textarea,select,[contenteditable],.mxslot,#mxEqCv'))return;
  e.preventDefault();freeKey((e.key==='ArrowRight'?1:-1)*(e.altKey?0.1:e.shiftKey?10:1));
});

/* griddrag: Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) undo / redo alignment and grid edits */
document.addEventListener('keydown',e=>{
  if(!M.visible||!(e.ctrlKey||e.metaKey)||e.altKey)return;const k=(e.key||'').toLowerCase();if(k!=='z'&&k!=='y')return;
  if(e.target.closest('input,textarea,select,[contenteditable]')||!$('#mxPick').hidden)return;
  if((k==='y'||e.shiftKey)?mRedo():mUndo())e.preventDefault();
});

/* studio: S split · Shift+S split exactly at the playhead · C cut tool · Delete/Backspace delete · M mute · Ctrl/⌘+D duplicate · Esc */
document.addEventListener('keydown',e=>{
  if(!M.visible||!$('#mxPick').hidden||e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(document.querySelector('.rm-panel:not([hidden]),#authDlg:not([hidden])')&&e.target.closest('.rm-panel,#authDlg'))return;
  if(e.target.closest('#mxEqCv'))return;
  const k=(e.key||'').toLowerCase(),mod2=e.ctrlKey||e.metaKey;
  if(mod2&&!e.altKey&&k==='d'){if(selReg()){e.preventDefault();dupSel()}return}
  if(mod2||e.altKey||!model())return;
  if(k==='s'){e.preventDefault();splitKey(e.shiftKey)}
  else if(k==='c'){e.preventDefault();cutToggle()}
  else if(k==='delete'||k==='backspace'){if(selReg()){e.preventDefault();deleteSel()}else if(M.tsel!=null&&M.tr[M.tsel]){e.preventDefault();mPush();M.tr.splice(M.tsel,1);M.tsel=null;edited()}}
  else if(k==='m'){if(selReg()){e.preventDefault();muteSel()}}
  else if(k==='escape'){if(M.rsel||M.tsel!=null||M.cutOn){M.rsel=null;M.tsel=null;M.cutOn=false;renderTransport();renderEdit();drawSoon()}}
});

/* ---------- public ---------- */
document.addEventListener('cr-user',e=>setOwner(e.detail&&e.detail.uid));
{const u=CR.user&&CR.user();if(u&&u.known)setOwner(u.uid)}
window.MASHUP={
  show(){if(M.owner===undefined){const u=CR.user();setOwner(u&&u.uid)}if(!M.built)build();M.visible=true;CR.stopTool();renderAll();requestAnimationFrame(()=>{sizeCanvas();drawSoon()})},
  hide(){if(!M.visible)return;M.visible=false;stop(true);compare(false);M.hov=null;closePick();if(!M.exporting)cacheTrim();if(M.built)$('#mashupView').querySelectorAll('.mxslot').forEach(x=>x.classList.remove('over'))},
  lang(){if(M.built)renderAll()},
  // for tests
  _M:M,_E:E,model,heard,play,stop,loadInto,exportMix,vocalStart,keyOpts,CACHE,undo:mUndo,redo:mRedo,
  _studio:{smartEqRun,smartFxRun,specOf,splitAt,dupSel,deleteSel,muteSel,bBars,addTr,resetLane,runsOf,duckCurve,fxApply,compare,renderStudio,save,load,applyPair}
};
CR.applyLang();
if($('#mashupView')&&!$('#mashupView').hidden)MASHUP.show();
})();
