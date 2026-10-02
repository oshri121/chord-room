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
 *   key     A is moved by `semis` (auto: the smallest shift that makes A the same Camelot key as B or its relative,
 *           i.e. B's key or its relative major/minor); B keeps its key. Pitch sent to the stretcher = semis − 12·log2(r).
 * Audio graph per slot: stem sources (playbackRate r) → stem gain → fade gain → Signalsmith Stretch (or a delay of the
 * same latency when that slot needs no tempo/key change, so A and B always line up) → level → master → limiter.
 * Export renders the same graph in an OfflineAudioContext (no limiter, normalised only when it would clip) and cuts
 * the stretcher latency off the front → WAV (CR.wav) or MP3 320 (window.MP3).
 */
(function(){
'use strict';
const CR=window.CR;if(!CR)return;
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
  mxLibT:'השירים שלי',mxLibSearch:'חיפוש',mxLibEmpty:'עדיין אין שירים שמורים עם קובץ. שירים שמעלים בכלי (מחוברים) מופיעים כאן.',mxLibNoFile:'אין קובץ שמור',mxLoadTo:'לטעון ל־{s}',mxClose:'סגירה',
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
  mxLibT:'My Songs',mxLibSearch:'Search',mxLibEmpty:'No saved songs with a file yet. Songs you upload in the tool (signed in) show up here.',mxLibNoFile:'no file saved',mxLoadTo:'Load into {s}',mxClose:'Close',
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
  mxLibT:'أغانيّ',mxLibSearch:'بحث',mxLibEmpty:'لا توجد أغانٍ محفوظة مع ملف بعد. الأغاني التي ترفعها في الأداة (مع تسجيل الدخول) تظهر هنا.',mxLibNoFile:'لا يوجد ملف محفوظ',mxLoadTo:'تحميل إلى {s}',mxClose:'إغلاق',
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
  mxLibT:'Мои песни',mxLibSearch:'Поиск',mxLibEmpty:'Пока нет сохранённых песен с файлом. Песни, загруженные в инструменте (после входа), появятся здесь.',mxLibNoFile:'файл не сохранён',mxLoadTo:'Загрузить в {s}',mxClose:'Закрыть',
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
  mxLibT:'Mis canciones',mxLibSearch:'Buscar',mxLibEmpty:'Aún no hay canciones guardadas con archivo. Las que subas en la herramienta (con sesión iniciada) aparecerán aquí.',mxLibNoFile:'sin archivo guardado',mxLoadTo:'Cargar en {s}',mxClose:'Cerrar',
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
  gridOn:false,gLane:0,undo:[],redo:[],gk:null};   /* griddrag: grid mode, the lane the arrows move, undo/redo of alignment + grid edits */
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
// A's vocal entry (source seconds, on one of A's bars): vocals stem energy → 'vocal' cue → 'intro' cue → first bar with sound
function vocalStart(s){
  if(s.vStart)return s.vStart;
  const A=s.an,bar=240/A.bpm,fd=firstDown(A),dur=s.buffer.duration,k0=-Math.floor(fd/bar),n=Math.floor((dur-fd)/bar);
  const at=k=>fd+k*bar;let res=null;
  const perBar=(get,len,sr)=>{const e=[];for(let k=k0;k<n;k++){const a=Math.max(0,Math.floor(at(k)*sr)),z=Math.min(len,Math.floor(at(k+1)*sr));let q=0,c=0;for(let j=a;j<z;j+=8){const x=get(j);q+=x*x;c++}e.push({k,v:c?Math.sqrt(q/c):0})}return e};
  const firstOn=(e,f)=>{const v=e.map(x=>x.v).sort((x,y)=>x-y),p90=v[Math.floor(v.length*0.9)]||0;if(p90<1e-4)return null;for(let i=0;i+1<e.length;i++)if(e[i].v>f*p90&&e[i+1].v>f*p90)return e[i].k;return null};
  if(s.stems&&s.stems.vocals){const b=s.stems.vocals,L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L;const k=firstOn(perBar(j=>L[j]+R[j],L.length,b.sampleRate),0.25);if(k!=null)res={t:Math.max(0,at(k)),src:'stem'}}
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
  const T=target(),o={T,beat:60/T,bar:240/T,hasA:!!A,hasB:!!B,semis:0};
  if(B){o.kB=fitK(B.bpm,T);o.rB=T/(B.bpm*o.kB);o.bar0=firstDown(B)/o.rB;o.t1=b.buffer.duration/o.rB}else o.bar0=0;
  if(A){
    o.kA=fitK(A.bpm,T);o.rA=T/(A.bpm*o.kA);o.semis=B?semis():0;
    const v=vocalStart(a);o.vA=v.t;o.vSrc=v.src;
    const barA=240/A.bpm;o.aIn=!B||M.startA==='all'?0:M.startA==='pre'?Math.max(0,o.vA-barA):o.vA;
    if(B){o.alignAuto=defAlign(o);o.align=M.align!=null?M.align:o.alignAuto;o.anchor=o.bar0+o.align*o.bar+M.nudge}
    else{o.anchor=o.vA/o.rA;o.t1=a.buffer.duration/o.rA}
    o.aStart=o.anchor+(o.aIn-o.vA)/o.rA;o.aEnd=o.anchor+(a.buffer.duration-o.vA)/o.rA;
  }
  o.t0=A&&B?Math.min(0,o.aStart):0;
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
  if(i===1&&o&&o.rB){const w=Math.round((raw-fdN)/(o.bar*o.rB));if(w){if(M.align!=null)M.align+=w;if(M.loop)M.loop={a:M.loop.a+w,b:M.loop.b+w}}}
}
function mSnap(){return {align:M.align,nudge:M.nudge,loop:M.loop,g:[gridBase(0),gridBase(1)]}}
function mPush(sn){M.undo.push(sn||mSnap());if(M.undo.length>60)M.undo.shift();M.redo=[];M.gk=null}
function mRestore(sn){M.align=sn.align;M.nudge=sn.nudge;M.loop=sn.loop;
  sn.g.forEach((x,i)=>{const s=song(i);if(x&&s&&s.key===x.key){s.an=x.an;s.vStart=x.vStart;s.cues=x.cues;cachePut(s.key,{an:s.an,cues:s.cues})}});changed()}
const sameSongs=sn=>sn.g.every((x,i)=>(x?x.key:null)===(song(i)?song(i).key:null));
function mUndo(){while(M.undo.length&&!sameSongs(M.undo[M.undo.length-1]))M.undo.pop();if(!M.undo.length)return false;M.redo.push(mSnap());mRestore(M.undo.pop());M.gk=null;return true}
function mRedo(){while(M.redo.length&&!sameSongs(M.redo[M.redo.length-1]))M.redo.pop();if(!M.redo.length)return false;M.undo.push(mSnap());mRestore(M.redo.pop());M.gk=null;return true}
const mClearUndo=()=>{M.undo=[];M.redo=[];M.gk=null};
// arrow keys in grid mode: the last dragged lane's grid ±1 ms (Shift ±10 ms), one undo step per burst
function gridKey(ms){
  const o=model();let i=M.gLane;if(!song(i))i=song(0)?0:1;const s=song(i);if(!o||!s)return;
  const tn=performance.now();if(!M.gk||M.gk.i!==i||tn-M.gk.t>900){const sn=mSnap();mPush(sn);M.gk={i,b:sn.g[i],acc:0,o}}
  const k=M.gk;k.t=tn;k.acc=Math.round((k.acc+ms/1000)*1e6)/1e6;
  const al=M.undo[M.undo.length-1];M.align=al.align;M.loop=al.loop;     // renumbering is computed from the burst's start
  gridShift(i,k.acc,k.b,k.o);changed();
}

/* ---------- audio engine ---------- */
let c=null;
const E={ready:false,p:null,st:[null,null],dl:[null,null],fade:[null,null],lvl:[null,null],route:[null,null],master:null,lim:null,lat:0,noStretch:false,
  playing:false,srcs:[],segs:[],o:null,timer:0,starting:false};
function engine(){
  if(E.ready)return Promise.resolve();if(E.p)return E.p;
  E.p=(async()=>{
    c=CR.ac();
    E.master=c.createGain();E.master.gain.value=0.9;
    const l=c.createDynamicsCompressor();l.threshold.value=-1;l.knee.value=0;l.ratio.value=20;l.attack.value=0.002;l.release.value=0.12;E.lim=l;
    E.master.connect(l).connect(c.destination);
    for(const i of [0,1]){E.fade[i]=c.createGain();E.lvl[i]=c.createGain();E.lvl[i].gain.value=M.vol[i];E.lvl[i].connect(E.master)}
    try{
      await CR.loadScript(CR.SS_SRC);
      for(const i of [0,1]){E.st[i]=await window.SignalsmithStretch(c);E.st[i].connect(E.lvl[i])}
      E.lat=+(await E.st[0].latency())||0;
    }catch(e){console.warn(e);E.noStretch=true;E.st=[null,null];E.lat=0;setMsg(t('mxNoStretch'),true)}
    for(const i of [0,1]){E.dl[i]=c.createDelay(1);E.dl[i].delayTime.value=E.lat;E.dl[i].connect(E.lvl[i])}
    E.ready=true;
  })().catch(e=>{E.p=null;throw e});
  return E.p;
}
const needSt=(i,o)=>{if(E.noStretch)return false;const r=i?o.rB:o.rA,s=i?0:o.semis;return !!r&&(Math.abs(r-1)>1e-4||s!==0)};
const pitchOf=(i,o)=>(i?0:o.semis)-12*Math.log2(i?o.rB:o.rA);
function route(i,o){const want=needSt(i,o)?'st':'dl';if(E.route[i]===want)return;try{E.fade[i].disconnect()}catch(e){}E.fade[i].connect(want==='st'?E.st[i]:E.dl[i]);E.route[i]=want}
const gainOf=(s,id)=>s.use[id]&&!s.mute[id]?s.gain[id]:0;
function parts(i){
  const sl=M.slots[i],s=sl.song;if(!s||!s.an)return [];
  if(s.stems)return IDS.map(id=>({id,buf:s.stems[id],g:gainOf(sl,id)}));
  return [{id:'full',buf:s.buffer,g:1}];
}
// schedule every source of both slots so that timeline position `pos` plays at context time `when` (ctx = c or offline)
function schedule(ctx,o,when,pos,fadeN,out,ramp){
  const made=[],wait=[];
  for(const i of [0,1]){
    const s=song(i);if(!s||!s.an)continue;
    const r=i?o.rB:o.rA,p=srcPos(i,o,pos),lo=i?0:o.aIn,end=i?o.t1:o.aOut;
    if(pos>=end)continue;
    for(const pt of parts(i)){
      let at=when,off=p;if(off<lo){at=when+(lo-off)/r;off=lo}
      if(off>=pt.buf.duration-0.002)continue;
      const src=ctx.createBufferSource();src.buffer=pt.buf;src.playbackRate.value=r;
      const g=ctx.createGain();
      if(ramp){g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(pt.g,at+0.001)}else g.gain.value=pt.g;   // 1 ms: no click, keeps the downbeat transient
      src.connect(g).connect(fadeN[i]);src.start(at,off);made.push({src,g,i,id:pt.id});
    }
    const fp=fadeN[i].gain;fp.cancelScheduledValues(when);
    if(i===0){
      fp.setValueAtTime(gA(o,pos),when);
      const fi=Math.min(o.fi,(o.aOut-o.aStart)/2),fo=Math.min(o.fo,(o.aOut-o.aStart)/2);
      for(const x of [o.aStart,o.aStart+fi,o.aOut-fo,o.aOut].sort((a,b)=>a-b))if(x>pos)fp.linearRampToValueAtTime(gA(o,x),when+(x-pos));
    }else fp.setValueAtTime(1,when);
    if(out&&out[i])wait.push(out[i].schedule({active:true,semitones:pitchOf(i,o),output:when}));
  }
  made.wait=wait;return made;
}
function killSrcs(list,at){for(const x of list){try{x.g.gain.cancelScheduledValues(at);x.g.gain.setValueAtTime(x.g.gain.value,at);x.g.gain.linearRampToValueAtTime(0,at+0.004);x.src.stop(at+0.01)}catch(e){}}}
function nowPos(x){if(!E.segs.length)return M.pos;let s=E.segs[0];for(const q of E.segs)if(q.when<=x)s=q;return s.pos+Math.max(0,x-s.when)}
const heard=()=>E.playing&&c?nowPos(c.currentTime-E.lat):M.pos;
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
  if(E.playing)killSrcs(E.srcs,c.currentTime+0.02);
  if(pos>=o.t1-0.05||pos<o.t0)pos=o.t0;
  const lt=M.loopOn&&loopT(o);if(lt&&(pos<lt.a||pos>=lt.b))pos=lt.a;
  for(const i of [0,1])route(i,o);
  const when=c.currentTime+0.06;
  E.o=o;M.lastO=o;E.srcs=schedule(c,o,when,pos,E.fade,E.st.map((n,i)=>E.route[i]==='st'?n:null),E.playing);
  E.segs=[{when,pos}];E.playing=true;M.pos=pos;
  for(const i of [0,1])if(E.st[i]&&E.route[i]!=='st')E.st[i].schedule({active:false,output:when});
  clearInterval(E.timer);E.timer=setInterval(pump,40);
  renderTransport();kick();
}
function stop(keep){
  if(!E.playing){if(!keep){const o=model();M.pos=o?(M.loopOn&&loopT(o)?loopT(o).a:o.t0):0}renderTransport();kick();return}
  const h=heard();killSrcs(E.srcs,c.currentTime);E.srcs=[];E.playing=false;E.segs=[];clearInterval(E.timer);
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
    if(LE-c.currentTime<0.25){const old=E.srcs;killSrcs(old,LE);E.srcs=schedule(c,o,LE,lt.a,E.fade,null,true);E.segs.push({when:LE,pos:lt.a});if(E.segs.length>6)E.segs.shift()}
  }else if(heard()>=o.t1-0.01){stop()}
}
// structural change while playing → restart from the same musical position
let rsT=0;
function restart(){clearTimeout(rsT);rsT=setTimeout(()=>{if(!E.playing)return;const o=model();if(!o){stop();return}startAt(mapPos(nowPos(c.currentTime+0.06),E.o,o),o)},40)}
function liveGains(){
  if(!E.playing)return;const now=c.currentTime;
  for(const x of E.srcs){const sl=M.slots[x.i];const v=x.id==='full'?1:gainOf(sl,x.id);x.g.gain.cancelScheduledValues(now);x.g.gain.setTargetAtTime(v,now,0.015)}
}
function setVol(i,v){M.vol[i]=v;if(E.lvl[i])E.lvl[i].gain.setTargetAtTime(v,c.currentTime,0.015);save()}

/* ---------- loading songs ---------- */
function setMsg(m,err){M.msg=m||'';M.msgErr=!!err;const el=$('#mxMsg');if(el){el.textContent=M.msg;el.classList.toggle('err',M.msgErr);el.hidden=!M.msg}}
async function loadInto(i,getBuf,name,hint,pre){
  const sl=M.slots[i],tok=++sl.tok;
  stop(true);setMsg('');
  sl.loading={msg:t('mxDecoding'),p:0.02};renderSlot(i);
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
    sl.loading=null;
    M.semis=null;M.align=null;M.nudge=0;M.loop=null;M.loopOn=false;mClearUndo();
    applyPair();
    const o=model();M.pos=o?o.t0:0;M.view0=M.pos;M.lastO=o;
    save();renderAll();updWave(i);
  }catch(e){
    console.warn(e);if(tok!==sl.tok)return;sl.loading=null;
    setMsg(e&&e.big?t('mxBig'):e&&e.lib?t('mxErrLib'):e&&e.name==='EncodingError'||e&&/decode/i.test(String(e.message))?t('readErr'):t('mxErrLoad'),true);renderSlot(i);
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
function clearSlot(i){const sl=M.slots[i];sl.tok++;if(sl.song&&sl.song.sep)sl.song.sep.ctl.abort();stop();sl.song=null;sl.loading=null;mClearUndo();M.align=null;M.nudge=0;M.semis=null;M.loop=null;M.loopOn=false;const o=model();M.pos=o?o.t0:0;M.lastO=o;save();renderAll()}
function swap(){
  stop();const a=M.slots[0],b=M.slots[1];[a.song,b.song]=[b.song,a.song];[a.loading,b.loading]=[b.loading,a.loading];a.tok++;b.tok++;
  for(const s of [a.song,b.song])if(s){s.vStart=null;s.waveKey=''}
  M.semis=null;M.align=null;M.nudge=0;M.loop=null;M.loopOn=false;mClearUndo();applyPair();
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
      pair:a&&b?{a:a.name,b:b.name,semis:M.semis,align:M.align,nudge:M.nudge,loop:M.loop,
        grid:[a,b].map(s=>s.gfix?{bpm:s.an.bpm,offset:s.an.offset,down:s.an.down}:null)}:M.pair};   /* griddrag: grid fixes */
    M.pair=o.pair;try{localStorage.setItem(lsKey(),JSON.stringify(o))}catch(e){}
  },250);
}
// read back as data: only the expected fields, types and ranges
function load(){
  let o=null;try{o=JSON.parse(localStorage.getItem(lsKey())||'null')}catch(e){}
  const num=(x,a,b,d)=>typeof x==='number'&&isFinite(x)?clamp(x,a,b):d;
  M.tempo='B';M.custom=0;M.fadeIn=4;M.fadeOut=4;M.startA='pre';M.vol=[1,1];M.fmt='wav';M.onlyLoop=false;M.loopBars=8;M.pair=null;
  M.slots.forEach((s,i)=>{s.use={...DEF_USE[i]};s.gain={vocals:1,drums:1,bass:1,other:1}});
  if(!o||o.v!==1)return;
  if(['A','B','custom'].includes(o.tempo))M.tempo=o.tempo;
  M.custom=num(o.custom,0,250,0);
  if(FADES.includes(o.fadeIn))M.fadeIn=o.fadeIn;if(FADES.includes(o.fadeOut))M.fadeOut=o.fadeOut;
  if(STARTS.includes(o.startA))M.startA=o.startA;
  if(Array.isArray(o.vol))M.vol=[0,1].map(i=>num(o.vol[i],0,1.5,1));
  if(o.fmt==='mp3'||o.fmt==='wav')M.fmt=o.fmt;M.onlyLoop=o.onlyLoop===true;
  if([4,8,16].includes(o.loopBars))M.loopBars=o.loopBars;
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
      grid:Array.isArray(p.grid)?[G(p.grid[0]),G(p.grid[1])]:[null,null]};
  }
}
// the same two songs as last time → their fine-tuning comes back
function applyPair(){
  const a=song(0),b=song(1),p=M.pair;
  if(!a||!b||!p||p.a!==a.name||p.b!==b.name)return;
  M.semis=p.semis;M.align=p.align;M.nudge=p.nudge;M.loop=p.loop;
  (p.grid||[]).forEach((g,i)=>{const s=song(i);if(g&&s&&Math.abs(g.bpm-s.an.bpm)<0.01){s.an={...s.an,offset:g.offset,down:g.down};s.gfix=true;s.vStart=null}});   /* griddrag */
}
function setOwner(uid){
  uid=uid||null;if(M.owner===uid)return;
  const had=M.owner!==undefined;M.owner=uid;
  if(had){stop();for(const s of M.slots){s.tok++;if(s.song&&s.song.sep)s.song.sep.ctl.abort();s.song=null;s.loading=null}M.semis=null;M.align=null;M.nudge=0;M.loop=null;M.loopOn=false;closePick()}
  load();if(M.built)renderAll();
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
      <button type="button" class="mxib mxloop" id="mxLoop" aria-pressed="false">${IC.loop}<span data-i="mxLoop"></span></button>
      <select class="mxsel" id="mxLoopN"></select>
      <button type="button" class="mxib" id="mxZo" data-it="mxZoomOut">${IC.zout}</button><button type="button" class="mxib" id="mxZi" data-it="mxZoomIn">${IC.zin}</button>
    </div>
    <div class="mxtl" id="mxTl" dir="ltr"><canvas id="mxCv" role="img"></canvas><canvas id="mxOv" aria-hidden="true"></canvas></div>
    <div class="mxmix">
      <label class="mxvol"><span class="mxlet a" dir="ltr">A</span><span class="vh" data-i="mxVolA"></span><input type="range" id="mxVolA" min="0" max="1.5" step="0.01" dir="ltr"><output class="mono" id="mxVolAo"></output></label>
      <label class="mxvol"><span class="mxlet b" dir="ltr">B</span><span class="vh" data-i="mxVolB"></span><input type="range" id="mxVolB" min="0" max="1.5" step="0.01" dir="ltr"><output class="mono" id="mxVolBo"></output></label>
      <p class="mxhelp"><span data-i="mxTlHelp"></span> · <span data-i="mxKeysH"></span></p>
      <p class="mxghelp" id="mxGHelp" data-i="mxGridHelp" hidden></p>
    </div>
  </section>
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
      else if(a==='half'||a==='double'){const s=song(i);if(s){mPush();s.an={...s.an,bpm:s.an.bpm*(a==='half'?0.5:2)};s.vStart=null;cachePut(s.key,{an:s.an});M.align=null;M.nudge=0;M.lastO=null;renderAll();restart()}}
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
  $('#mxGrid').onclick=()=>{M.gridOn=!M.gridOn;renderTransport();drawSoon()};   /* griddrag */
  $('#mxPlay').onclick=toggle;$('#mxStop').onclick=()=>stop();
  $('#mxLoop').onclick=loopToggle;
  $('#mxLoopN').onchange=e=>{M.loopBars=+e.target.value;if(M.loopOn&&M.loop){M.loop={a:M.loop.a,b:M.loop.a+M.loopBars};restart()}save();drawSoon();renderTransport()};
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
  wireTimeline();
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
function changed(noRenderInput){M.lastO=null;renderMatch(noRenderInput);drawSoon();restart();save();renderExport()}
function nudge(k){
  const o=model();if(!o||!o.hasA||!o.hasB)return;
  mPush();if(M.align==null)M.align=o.align;
  if(k==='bar'||k==='-bar')M.align+=k[0]==='-'?-1:1;
  else{M.nudge+=(k[0]==='-'?-1:1)*(k.endsWith('beat')?o.beat:0.01);M.nudge=Math.round(M.nudge*10000)/10000;
    // whole bars go into `align`, the rest stays a nudge within ±½ bar
    const w=Math.round(M.nudge/o.bar);if(w){M.align+=w;M.nudge=Math.round((M.nudge-w*o.bar)*10000)/10000}}
  changed();
}
function loopToggle(){
  const o=model();if(!o)return;
  if(M.loopOn){M.loopOn=false}
  else{const h=heard(),k=Math.floor((h-o.bar0)/o.bar+1e-6);if(!M.loop||h<o.bar0+M.loop.a*o.bar||h>o.bar0+M.loop.b*o.bar)M.loop={a:k,b:k+M.loopBars};M.loopOn=true}
  save();renderTransport();drawSoon();
  if(E.playing&&M.loopOn){const lt=loopT(o),h=heard();if(h<lt.a||h>=lt.b)startAt(lt.a,E.o)}
}
function zoom(f){
  const o=model();if(!o)return;const span=(o.t1-o.t0)/M.zoom,mid=E.playing?heard():M.view0+span/2;
  M.zoom=clamp(M.zoom*f,1,32);const ns=(o.t1-o.t0)/M.zoom;M.view0=clamp(mid-ns/2,o.t0,o.t1-ns);renderTransport();drawSoon();
}

/* ---------- library picker ---------- */
function openPick(i,btn){M.pickFor=i;M.pickFrom=btn||null;$('#mxPick').hidden=false;$('#mxPickQ').value='';renderPick();setTimeout(()=>$('#mxPickQ').focus(),30)}
function closePick(){const p=$('#mxPick');if(!p||p.hidden)return;p.hidden=true;if(M.pickFrom&&document.contains(M.pickFrom))M.pickFrom.focus();M.pickFrom=null}
function renderPick(){
  const q=$('#mxPickQ').value.trim().toLowerCase(),ul=$('#mxPickL'),signed=CR.signedIn();
  const list=CR.readLib().filter(x=>x&&x.name&&(!q||String(x.name).toLowerCase().includes(q)));
  const any=list.some(x=>x.file_path);
  $('#mxPickN').textContent=!signed||!any?t('mxLibEmpty'):'';ul.innerHTML='';
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
  const o=model(),v=i===0&&o&&o.hasA?vocalStart(s):null,vb=v?Math.round((v.t-firstDown(a))/(240/a.bpm))+1:null;
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
  $('#mxTempo').querySelectorAll('[data-tm]').forEach(b=>{const on=b.dataset.tm===M.tempo||(!A&&b.dataset.tm==='B'&&M.tempo==='A');b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));b.disabled=(b.dataset.tm==='A'&&!A)||(b.dataset.tm==='B'&&!B)});
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
  {const lk=$('#mxLock');if(lk){lk.textContent=A&&B?(Math.abs(M.nudge)<5e-4?t('mxLockOn',{n:o.align+1}):t('mxLockOff',{n:o.align+1,ms:'\u2066'+(M.nudge>0?'+':'−')+Math.abs(Math.round(M.nudge*1000))+' ms\u2069'})):'';lk.classList.toggle('on',!!(A&&B)&&Math.abs(M.nudge)<5e-4)}}   /* griddrag */
  $('#mxOff').textContent=`${M.nudge>=0?'+':'−'}${Math.abs(Math.round(M.nudge*1000))} ms`;$('#mxOff').title=t('mxOffset',{ms:Math.round(M.nudge*1000)});
  $('#mxNudge').querySelectorAll('button').forEach(b=>{b.disabled=!(A&&B);const k=b.dataset.nd,u=t(k.endsWith('bar')?'mxUBar':k.endsWith('beat')?'mxUBeat':'mxUMs'),lab=t(k[0]==='-'?'mxEarlier':'mxLater',{x:u});b.title=lab;b.setAttribute('aria-label',lab)});
  const sel=(id,list,val)=>{const e=$(id);e.innerHTML=list.map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join('');e.value=String(val)};
  const fl=[[0,t('mxFade0')],[1,t('mxFadeBeat')],[4,t('mxFadeBar')],[8,t('mxFadeBars',{n:2})],[16,t('mxFadeBars',{n:4})]];
  sel('#mxFi',fl,M.fadeIn);sel('#mxFo',fl,M.fadeOut);
  sel('#mxStartA',[['all',t('mxStartAll')],['pre',t('mxStartPre')],['vocal',t('mxStartVoc')]],M.startA);
  ['#mxFi','#mxFo','#mxStartA'].forEach(q=>{$(q).disabled=!(A&&B)});
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
  $('#mxZi').disabled=!o||M.zoom>=32;$('#mxZo').disabled=!o||M.zoom<=1;
  {const gb=$('#mxGrid');if(!o)M.gridOn=false;gb.disabled=!o;gb.classList.toggle('on',M.gridOn);gb.setAttribute('aria-pressed',String(M.gridOn));$('#mxGHelp').hidden=!M.gridOn;$('#mxTl').classList.toggle('grid',M.gridOn)}   /* griddrag */
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
  o.vA,M.align,M.nudge,M.startA,M.fadeIn,M.fadeOut,M.vol,M.slots.map(s=>[s.use,s.gain]),+r0.toFixed(3),+r1.toFixed(3)])}
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
function renderAll(){
  if(!M.built)return;renderSlot(0);renderSlot(1);$('#mxSwap').disabled=!(song(0)||song(1));
  setMsg(M.msg,M.msgErr);renderMatch();renderTransport();renderExport();sizeCanvas();drawSoon();
}

/* ---------- timeline ---------- */
const TL={W:0,H:0,dpr:1,ruler:22,lane:0,gap:6,top:[0,0],dirty:true,raf:0};
function sizeCanvas(){
  const box=$('#mxTl');if(!box||!box.clientWidth)return;const d=window.devicePixelRatio||1,w=box.clientWidth,h=box.clientHeight;
  TL.dpr=d;TL.W=w;TL.H=h;TL.lane=Math.floor((h-TL.ruler-TL.gap*2)/2);TL.top=[TL.ruler+TL.gap,TL.ruler+TL.gap*2+TL.lane];
  for(const id of ['#mxCv','#mxOv']){const cv=$(id);cv.width=Math.round(w*d);cv.height=Math.round(h*d)}
}
function viewOf(o){const span=(o.t1-o.t0)/M.zoom;M.view0=clamp(M.view0,o.t0,Math.max(o.t0,o.t1-span));return {v0:M.view0,span}}
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
  if(E.playing||M.drag)kick();
}
function drawLane(g,o,v,i,y,hgt,col){
  const s=song(i);g.fillStyle=col.lane;g.fillRect(0,y,TL.W,hgt);
  if(!s){g.fillStyle=col.text;g.font='12px '+tok('--sans');g.textAlign='center';g.fillText(t('mxEmptyLane'),TL.W/2,y+hgt/2+4);g.textAlign='start';return}
  const w=s.wave;if(!w)return;const mid=y+hgt/2,px=v.span/TL.W;
  for(let x=0;x<TL.W;x++){
    const ta=v.v0+x*px,tb=ta+px;
    let fa=1;
    if(i===0){if(tb<o.aStart||ta>o.aOut)continue;fa=Math.max(gA(o,ta),gA(o,tb),0.06)}else if(ta>o.t1)break;
    const pa=srcPos(i,o,ta),pb=srcPos(i,o,tb);if(pb<0||pa>s.buffer.duration)continue;
    const i0=Math.max(0,Math.floor(pa*w.rate)),i1=Math.min(w.len,Math.max(i0+1,Math.ceil(pb*w.rate)));if(i0>=w.len)continue;
    const r=CR.sliceRange(w,i0,i1),a=r[0],bi=r[4];
    const hh=Math.max(0.6,a*fa*(hgt/2-2));g.fillStyle=CR.wcol(w.col[bi*3],w.col[bi*3+1],w.col[bi*3+2]);g.fillRect(x,mid-hh,1,hh*2);
  }
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
  // lanes
  g.globalCompositeOperation='lighter';
  drawLane(g,o,v,0,TL.top[0],TL.lane,col);drawLane(g,o,v,1,TL.top[1],TL.lane,col);
  g.globalCompositeOperation='source-over';
  // griddrag: each song's own bar lines in its lane (A's that sit on one of B's bars = locked, brighter); grid drag preview
  for(const i of [0,1]){
    const s=song(i);if(!s||!s.an||(i===0&&!o.hasA)||(i===1&&!o.hasB))continue;
    const gd=M.drag&&M.drag.kind==='grid'&&M.drag.i===i&&M.drag.moved?M.drag:null,A=s.an,bs=240/A.bpm,fd=firstDown(A)+(gd?gd.dSrc:0);
    const sa=srcPos(i,o,v.v0),sz=srcPos(i,o,v.v0+v.span),k0=Math.floor((sa-fd)/bs)-1,k1=Math.ceil((sz-fd)/bs)+1,y=TL.top[i];
    if(k1-k0>TL.W/3)continue;
    for(let k=k0;k<=k1;k++){const src=fd+k*bs;if(src<0||src>s.buffer.duration)continue;const tl=tlOf(i,o,src),x=Math.round(xOf(v,tl))+0.5;if(x<0||x>TL.W)continue;
      const lock=i===0&&o.hasB&&!gd&&Math.abs(mod(tl-o.bar0+o.bar/2,o.bar)-o.bar/2)<0.001;
      g.fillStyle=gd?'#22D3D3':lock?col.hi:i?col.b:col.a;g.globalAlpha=gd?0.95:lock?0.85:0.6;g.fillRect(x-0.5,y,gd||lock?2:1,TL.lane);
      g.globalAlpha=1;g.fillRect(x-(gd?3:2),y,gd?6:4,3)}
    if(gd&&gd.snap!=null){const x=xOf(v,tlOf(i,o,gd.snap)),yy=y+6;g.strokeStyle='#22D3D3';g.lineWidth=2.5;g.beginPath();g.moveTo(x-4,yy);g.lineTo(x-4,yy+5);g.arc(x,yy+5,4,Math.PI,0,true);g.lineTo(x+4,yy);g.stroke();
      g.fillStyle='#EDEDEF';g.fillRect(x-5.5,yy-2,3,3);g.fillRect(x+2.5,yy-2,3,3)}
  }
  if(M.gridOn){g.fillStyle='#22D3D3';g.fillRect(0,TL.ruler,TL.W,2)}
  // lane labels
  for(const i of [0,1]){const y=TL.top[i];g.fillStyle=i?col.b:col.a;g.fillRect(0,y,3,TL.lane);g.font='600 11px '+tok('--mono');g.fillText(LET[i],8,y+11)}
  // B's structure cues
  const b=song(1);
  if(b&&o.hasB&&window.CUES)for(const cu of b.cues||[]){const x=xOf(v,cu.t/o.rB);if(x<-40||x>TL.W)continue;const cc=CUES.COL[cu.k]||[200,200,200],cs=`rgb(${cc[0]},${cc[1]},${cc[2]})`;
    g.fillStyle=cs;g.fillRect(Math.round(x),TL.top[1],2,TL.lane);g.beginPath();g.moveTo(x,TL.top[1]);g.lineTo(x+14,TL.top[1]);g.lineTo(x+14,TL.top[1]+12);g.lineTo(x,TL.top[1]+12);g.fill();
    g.fillStyle='#0A0A0C';g.font='700 9px '+tok('--mono');g.fillText((CUES.NAME[cu.k]||cu.k)[0],x+4,TL.top[1]+6.5)}
  // A's vocal entry = the anchor, shown on both lanes
  if(o.hasA&&o.hasB){const x=Math.round(xOf(v,o.anchor))+0.5,lock=Math.abs(M.nudge)<5e-4;if(x>=0&&x<=TL.W){g.strokeStyle=lock?col.hi:col.a;g.lineWidth=lock?2:1.5;if(!lock)g.setLineDash([4,3]);g.beginPath();g.moveTo(x,TL.top[0]);g.lineTo(x,TL.top[1]+TL.lane);g.stroke();g.setLineDash([]);
    g.fillStyle=col.a;g.beginPath();g.moveTo(x-5,TL.top[0]);g.lineTo(x+5,TL.top[0]);g.lineTo(x,TL.top[0]+7);g.fill();
    if(lock){const ly=TL.top[1]-TL.gap-1;g.fillStyle=col.hi;g.fillRect(x+4,ly-6,8,6);g.strokeStyle=col.hi;g.lineWidth=1.5;g.beginPath();g.arc(x+8,ly-6,2.6,Math.PI,0);g.stroke()}}}   /* griddrag: downbeat lock */
  // loop range
  const lt=loopT(o);if(lt){const x0=xOf(v,lt.a),x1=xOf(v,lt.b);g.fillStyle=M.loopOn?'rgba(255,176,32,.16)':'rgba(255,255,255,.06)';g.fillRect(x0,TL.ruler,x1-x0,TL.H-TL.ruler);
    g.fillStyle=M.loopOn?tok('--warn')||'#FFB020':col.text;g.fillRect(x0,0,Math.max(2,x1-x0),4)}
}
function drawHead(o){
  const cv=$('#mxOv');if(!cv||!TL.W)return;const g=cv.getContext('2d'),d=TL.dpr,v=viewOf(o);g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,TL.W,TL.H);
  if(M.drag&&M.drag.kind==='loop'&&M.drag.moved){const a=Math.min(M.drag.a,M.drag.b),b=Math.max(M.drag.a,M.drag.b),x0=xOf(v,o.bar0+a*o.bar),x1=xOf(v,o.bar0+b*o.bar);g.fillStyle='rgba(255,176,32,.22)';g.fillRect(x0,0,x1-x0,TL.H)}
  const x=Math.round(xOf(v,heard()))+0.5;if(x<0||x>TL.W)return;g.fillStyle='#fff';g.fillRect(x-0.5,0,2,TL.H);g.beginPath();g.moveTo(x-5,0);g.lineTo(x+6,0);g.lineTo(x+0.5,7);g.fill();
}
function beatTick(o){
  if(!E.playing){M.lastBeat=null;return}const h=heard(),b=Math.floor((h-o.bar0)/o.beat+1e-4);
  if(b!==M.lastBeat&&h>=o.t0){const first=M.lastBeat==null;M.lastBeat=b;if(!first){const bar=mod(b,4)===0;if(window.A11Y&&A11Y.beat)A11Y.beat(bar);if(window.BG)BG.pulse(bar?0.75:0.4)}}
}
function wireTimeline(){
  const cv=$('#mxOv'),box=$('#mxTl');
  const tAt=e=>{const o=model(),r=box.getBoundingClientRect(),v=viewOf(o);return {o,t:v.v0+(e.clientX-r.left)/r.width*v.span,y:e.clientY-r.top,v}};
  box.addEventListener('pointerdown',e=>{
    const o=model();if(!o||e.button>0)return;const p=tAt(e);box.setPointerCapture(e.pointerId);e.preventDefault();
    const zone=p.y<TL.ruler?'ruler':p.y<TL.top[1]-TL.gap/2?'a':'b';
    const gi=zone==='a'?0:1;   /* griddrag: grid mode → the lane's song grid moves against its audio */
    if(zone==='ruler'){const k=Math.floor((p.t-o.bar0)/o.bar);M.drag={kind:'loop',x:e.clientX,a:k,b:k+1,t:p.t}}
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
    else if(d.kind==='grid'){   /* griddrag: preview only; applied when the drag ends */
      let ds=(p.t-d.t)*d.r;d.snap=null;
      if(!(e.ctrlKey||e.metaKey)&&CR.onsetNear){const q=CR.onsetNear(song(d.i).buffer,d.g+ds,0.02);if(q!=null){d.snap=q;ds=q-d.g}}
      d.dSrc=ds;TL.dirty=true;
    }
    kick();
  });
  const end=e=>{
    const d=M.drag;if(!d)return;M.drag=null;const p=tAt(e),o=p.o;
    if(!d.moved||d.kind==='seek'){const x=clamp(p.t,o.t0,o.t1-0.02);if(E.playing)startAt(x,model());else{M.pos=x;renderTransport()}}
    else if(d.kind==='loop'){M.loop={a:d.a,b:d.b};M.loopOn=true;save();renderTransport();renderExport();if(E.playing){const lt=loopT(o),h=heard();if(h<lt.a||h>=lt.b)startAt(lt.a,o)}}
    else if(d.kind==='a'){if(d.sn.align!==M.align||d.sn.nudge!==M.nudge)mPush(d.sn);changed()}
    else if(d.kind==='grid'){if(Math.abs(d.dSrc)>1e-6){mPush(d.sn);gridShift(d.i,d.dSrc,d.base,d.o);changed()}}   /* griddrag */
    drawSoon();
  };
  box.addEventListener('pointerup',end);box.addEventListener('pointercancel',()=>{M.drag=null;drawSoon()});
  box.addEventListener('wheel',e=>{const o=model();if(!o||M.zoom<=1)return;e.preventDefault();const v=viewOf(o);M.view0=clamp(M.view0+(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)/600*v.span,o.t0,o.t1-v.span);drawSoon()},{passive:false});
  box.addEventListener('pointermove',e=>{if(M.drag)return;const r=box.getBoundingClientRect(),y=e.clientY-r.top;const o=model();box.style.cursor=!o?'default':y<TL.ruler?'col-resize':M.gridOn?'ew-resize':y<TL.top[1]-TL.gap/2&&o.hasA&&o.hasB?'grab':'pointer'});
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
    const oc=new OfflineAudioContext(2,n+sr,sr);
    const master=oc.createGain();master.gain.value=0.9;master.connect(oc.destination);
    const fade=[oc.createGain(),oc.createGain()],lvl=[0,1].map(i=>{const g=oc.createGain();g.gain.value=M.vol[i];g.connect(master);return g});
    for(const i of [0,1])if(need[i]){nodes[i]=await window.SignalsmithStretch(oc);lat=+(await nodes[i].latency())||0}
    for(const i of [0,1]){if(nodes[i]){fade[i].connect(nodes[i]);nodes[i].connect(lvl[i])}else{const dl=oc.createDelay(1);dl.delayTime.value=lat;fade[i].connect(dl).connect(lvl[i])}}
    await Promise.all(schedule(oc,o,0,r0,fade,nodes,false).wait);
    const tot=n/sr+lat;for(let x=1;x<tot;x+=1)oc.suspend(x).then(()=>{prog(x/tot*0.9);setExp(t('mxRendering',{p:Math.round(x/tot*90)}));oc.resume()}).catch(()=>{});
    const out=await oc.startRendering(),o0=Math.round(lat*sr);
    const L=out.getChannelData(0).slice(o0,o0+n),R=out.getChannelData(1).slice(o0,o0+n);
    let pk=0;for(let j=0;j<n;j++){const x=Math.abs(L[j]),y=Math.abs(R[j]);if(x>pk)pk=x;if(y>pk)pk=y}
    if(pk>0.98){const k=0.98/pk;for(let j=0;j<n;j++){L[j]*=k;R[j]*=k}}
    prog(0.92);
    const mp3=M.fmt==='mp3'&&window.MP3&&MP3.supported,ext=mp3?'mp3':'wav',bpm=CR.fmtBpm(Math.round(o.T*10)/10),kn=CR.keyName(b.an.key.pc,b.an.key.mode,true);
    const title=`${a.name} × ${b.name} (Mashup)`;
    const data=mp3?await MP3.encode(L,R,sr,{kbps:320,tags:{title,artist:'Chord Room',bpm:o.T,key:kn},onProgress:p=>{prog(0.92+p*0.08);setExp(t('encoding',{p:Math.round(p*100)}))}}):CR.wav(L,R,sr);
    const fname=`${title} ${bpm} BPM ${kn}`.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').slice(0,180)+'.'+ext;
    const blob=new Blob([data],{type:mp3?'audio/mpeg':'audio/wav'});
    CR.saveBlob(blob,fname);prog(1);okSig=sig;PAID.add(sig);
    CR.log('mashup_export',`${a.name} × ${b.name} · ${bpm} BPM · ${kn} · ${ext}${M.onlyLoop&&lt?' · loop':''}`);
    setExp(t('mxDone',{f:fname,s:(blob.size/1048576).toFixed(1)}));
    M.lastExport={name:fname,size:blob.size,sr,n,lat,r0,r1};
  }catch(e){console.error(e);setExp(e&&/MP3/.test(String(e.message))?t('mp3Fail'):t('mxExpFail'),true)}
  finally{M.exporting=false;renderExport();settleP(pay,okSig?0:1)}   // failed export → points back
}
function setExp(m,err){const el=$('#mxExpMsg');if(!el)return;el.textContent=m||'';el.classList.toggle('err',!!err)}

/* ---------- keys ---------- */
document.addEventListener('keydown',e=>{
  if(!M.visible||e.metaKey||e.ctrlKey||e.altKey)return;
  if(!$('#mxPick').hidden)return;
  if(e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(document.querySelector('.rm-panel:not([hidden]),#authDlg:not([hidden])')&&e.target.closest('.rm-panel,#authDlg'))return;
  const o=model();if(!o)return;
  if(e.code==='Space'){if(e.target.closest('button,label,a'))return;e.preventDefault();toggle()}
  else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){if(e.target.closest('.mxslot'))return;e.preventDefault();
    if(M.gridOn||document.activeElement===$('#mxGrid')){gridKey((e.key==='ArrowRight'?1:-1)*(e.shiftKey?10:1));return}   /* griddrag */const x=clamp(heard()+(e.key==='ArrowRight'?1:-1)*o.bar,o.t0,o.t1-0.05);if(E.playing)startAt(x,o);else{M.pos=x;renderTransport();kick()}}
  else if(e.key==='l'||e.key==='L')loopToggle();
});

/* griddrag: Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) undo / redo alignment and grid edits */
document.addEventListener('keydown',e=>{
  if(!M.visible||!(e.ctrlKey||e.metaKey)||e.altKey)return;const k=(e.key||'').toLowerCase();if(k!=='z'&&k!=='y')return;
  if(e.target.closest('input,textarea,select,[contenteditable]')||!$('#mxPick').hidden)return;
  if((k==='y'||e.shiftKey)?mRedo():mUndo())e.preventDefault();
});

/* ---------- public ---------- */
document.addEventListener('cr-user',e=>setOwner(e.detail&&e.detail.uid));
{const u=CR.user&&CR.user();if(u&&u.known)setOwner(u.uid)}
window.MASHUP={
  show(){if(M.owner===undefined){const u=CR.user();setOwner(u&&u.uid)}if(!M.built)build();M.visible=true;CR.stopTool();renderAll();requestAnimationFrame(()=>{sizeCanvas();drawSoon()})},
  hide(){if(!M.visible)return;M.visible=false;stop(true);closePick();if(!M.exporting)cacheTrim();if(M.built)$('#mashupView').querySelectorAll('.mxslot').forEach(x=>x.classList.remove('over'))},
  lang(){if(M.built)renderAll()},
  // for tests
  _M:M,_E:E,model,heard,play,stop,loadInto,exportMix,vocalStart,keyOpts,CACHE,undo:mUndo,redo:mRedo
};
CR.applyLang();
if($('#mashupView')&&!$('#mashupView').hidden)MASHUP.show();
})();
