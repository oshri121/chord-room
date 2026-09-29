/*
 * "My key" (הסולם שלי): vocal range test → best key for the song open in the tool.
 * - Range test: the mic runs through its own AudioContext → AnalyserNode; every 50 ms one YIN pitch frame (voicing =
 *   YIN aperiodicity + level above an adaptive noise floor), 5-frame median, octave guard against the recent median.
 *   Steps: lowest comfortable note (25th percentile of steady frames), highest (75th), optional 10 s of a song
 *   (10th–90th percentile widens the range). Saved per account in localStorage `chordroom.voice.v1:<uid|guest>`.
 *   The audio never leaves the browser; the mic is stopped when the panel closes.
 * - Song range: YIN over the AI vocals stem when there is one, otherwise over a centre-channel extract of the mix
 *   (STFT mask on L/R similarity, band-passed 250–2500 Hz so the centred bass drops out) → marked "estimated". Only steady runs (≥ 120 ms) count,
 *   octave jumps against the local median are folded, and the 10th–90th percentiles (weighted by duration) give low/high.
 *   Runs in a Worker built from the functions below (their source is copied with toString(), so they use nothing outside).
 * - Recommendation: every shift −6…+6 with the singer's octave choice (−1/0/+1 octave: a man singing a female song an
 *   octave down is normal) is scored: 3 × semitones outside the comfortable range + 0.45 × |shift| + 0.2 × distance
 *   between the centres + 0.8 for another octave. Best three distinct keys are shown; "Apply" = CR.setTranspose.
 * Talks to the app only through window.CR.
 */
(function(){
'use strict';
const CR=window.CR;if(!CR)return;
const {t,esc,mod}=CR;

/* ---------- strings (he / en / ar / ru / es) ---------- */
CR.addStrings({
he:{vcBtn:'הסולם שלי',vcBtnT:'מוצאים את הסולם שמתאים לקול שלך',vcTitle:'הסולם שלי',
  vcIntro:'שר לתוך המיקרופון: נלמד את טווח הקול שלך, נגיד לך באיזה סולם לשיר את השיר הזה, ונעביר אותו לשם בלחיצה אחת.',
  vcPriv:'הקול שלך מעובד רק בדפדפן הזה. שום דבר לא מוקלט ולא נשלח.',
  vcYou:'הקול שלך',vcNone:'עוד לא מכירים את הטווח שלך. הבדיקה לוקחת בערך דקה.',vcStart:'להתחיל את בדיקת הקול',vcStartH:'חדר שקט עוזר. אפשר גם עם אוזניות.',
  vcAgain:'לבדוק שוב',vcRange:'טווח נוח',vcStep:'שלב {n} מתוך {m}',
  vcS1:'הצליל הכי נמוך שנוח לך',vcS1H:'שיר "אההה" על הצליל הכי נמוך שעדיין קל לך, בלי לדחוק, והחזק אותו כ־2 שניות.',
  vcS2:'הצליל הכי גבוה שנוח לך',vcS2H:'עכשיו הצליל הכי גבוה שנוח לך לשיר, בלי צעקה ובלי פלסט מאומץ. החזק אותו כ־2 שניות.',
  vcS3:'שיר שאתה אוהב (לא חובה)',vcS3H:'שיר כ־10 שניות משיר שכיף לך לשיר, בקול הרגיל שלך. זה עוזר לדייק את הטווח.',
  vcListen:'מקשיבים…',vcHold:'ממשיכים… {s} שנ׳',vcGot:'קלטנו: {n}. אפשר להמשיך לשיר כדי לדייק, או לעבור לשלב הבא.',vcLeft:'נשארו {s} שנ׳',
  vcNext:'הבא',vcRedo:'להתחיל את השלב מחדש',vcSkip:'דילוג',vcCancel:'ביטול',vcFinish:'סיום',vcStarting:'מפעילים את המיקרופון…',
  vcNoMic:'לא נמצא מיקרופון. חבר מיקרופון (או אוזניות עם מיקרופון) ונסה שוב.',
  vcDenied:'הגישה למיקרופון חסומה. אפשר אותה בסמל שליד שורת הכתובת ונסה שוב.',
  vcNoSupport:'הדפדפן הזה לא יכול להשתמש כאן במיקרופון. נסה גרסה עדכנית של Chrome,‏ Edge,‏ Firefox או Safari.',
  vcMicFail:'לא הצלחנו להפעיל את המיקרופון. ייתכן שאפליקציה אחרת משתמשת בו.',
  vcSilent:'לא שומעים אותך. בדוק שהמיקרופון הנכון פועל והתקרב אליו קצת.',
  vcNoisy:'יש הרבה רעש ברקע. נסה במקום שקט יותר או קרוב יותר למיקרופון.',
  vcNarrow:'הצליל הגבוה יצא כמעט כמו הנמוך. בוא ננסה שוב את שני השלבים.',
  vcSong:'השיר הזה',vcNoSong:'פתח שיר בכלי כדי לקבל המלצה לסולם שלו.',vcSongAna:'מחפשים את המנגינה של השיר…',vcSongR:'טווח המנגינה',
  vcEst:'הערכה מתוך המיקס',vcEstT:'אין ערוצים מופרדים, ולכן הטווח מוערך ממרכז המיקס. הפרד ערוצים עם AI לתוצאה מדויקת יותר.',vcFromVoc:'מתוך ערוץ השירה',
  vcSongFail:'לא מצאנו מנגינה ברורה בשיר הזה. הפרדת ערוצים עם AI בדרך כלל עוזרת.',vcNeedYou:'עשה את בדיקת הקול כדי לקבל המלצה.',
  vcRec:'שיר אותו ב־{k}',vcOrig:'הסולם המקורי',vcOctDown:'אוקטבה מתחת להקלטה',vcOctUp:'אוקטבה מעל ההקלטה',
  vcFitOk:'כל המנגינה יושבת בתוך הטווח הנוח שלך.',vcFitLo:'הצלילים הכי נמוכים יורדים קצת מתחת לטווח שלך.',vcFitHi:'הצלילים הכי גבוהים עולים קצת מעל הטווח שלך.',
  vcFitBoth:'המנגינה רחבה מהטווח הנוח שלך, וזו הפשרה הכי טובה.',
  vcApply:'להעביר את השיר לסולם הזה',vcApplyS:'החלה',vcApplied:'השיר מתנגן עכשיו ב־{k}.',vcHere:'השיר כבר בסולם הזה.',vcAlt:'עוד אפשרויות טובות',
  vcLgYou:'הטווח שלך',vcLgSong:'המנגינה (מקור)',vcLgNew:'המנגינה בסולם המומלץ',vcLive:'שר עכשיו',
  vtBass:'בס',vtBari:'בריטון',vtTenor:'טנור',vtAlto:'אלט',vtMezzo:'מצו־סופרן',vtSop:'סופרן',
  vtBassP:'הקול הנמוך ביותר, עמוק ועשיר. שירים של זמרים גברים ירגישו לך לרוב הכי טוב כמה חצאי טונים למטה.',
  vtBariP:'הקול הגברי הנפוץ ביותר, חם ובאמצע. רוב שירי הפופ של זמרים יושבים לך טוב, לפעמים טון אחד למטה.',
  vtTenorP:'טווח גברי גבוה ובהיר. שירי פופ ורוק של זמרים מתאימים לך, ושירים של זמרות אפשר לשיר אוקטבה נמוך.',
  vtAltoP:'קול נשי נמוך, חם ומלא. שירים של זמרות עם קול גבוה ירגישו לך לרוב טוב יותר כמה חצאי טונים למטה.',
  vtMezzoP:'הקול הנשי הנפוץ ביותר, בדיוק באמצע. רוב שירי הפופ של זמרות יושבים לך טוב.',
  vtSopP:'הקול הגבוה ביותר, בהיר וצלול. שירים של זמרות מתאימים לך, לפעמים אפילו קצת יותר גבוה.',
  vtNote:'סוגי הקול חופפים, אז זה מדריך ידידותי ולא פסק דין.'},
en:{vcBtn:'My key',vcBtnT:'Find the key that fits your voice',vcTitle:'Find your key',
  vcIntro:'Sing into the mic: we learn your vocal range, tell you which key to sing this song in, and move the song there with one click.',
  vcPriv:'Your voice is processed only in this browser. Nothing is recorded or uploaded.',
  vcYou:'Your voice',vcNone:'We don\'t know your range yet. The test takes about a minute.',vcStart:'Start the voice test',vcStartH:'A quiet room helps. Headphones are fine.',
  vcAgain:'Test again',vcRange:'Comfortable range',vcStep:'Step {n} of {m}',
  vcS1:'Your lowest comfortable note',vcS1H:'Sing "aah" on the lowest note that still feels easy, without pushing, and hold it for about 2 seconds.',
  vcS2:'Your highest comfortable note',vcS2H:'Now the highest note you can sing comfortably, no shouting or strained falsetto. Hold it for about 2 seconds.',
  vcS3:'A song you like (optional)',vcS3H:'Sing about 10 seconds of a song you enjoy, in your normal voice. It helps fine-tune your range.',
  vcListen:'Listening…',vcHold:'Keep going… {s} s',vcGot:'Got it: {n}. Keep singing to adjust, or go on.',vcLeft:'{s} s left',
  vcNext:'Next',vcRedo:'Start this step over',vcSkip:'Skip',vcCancel:'Cancel',vcFinish:'Finish',vcStarting:'Starting the microphone…',
  vcNoMic:'No microphone found. Connect a mic (or a headset with a mic) and try again.',
  vcDenied:'Microphone access is blocked. Allow it from the icon next to the address bar, then try again.',
  vcNoSupport:'This browser can\'t use the microphone here. Try an up-to-date Chrome, Edge, Firefox or Safari.',
  vcMicFail:'We couldn\'t start the microphone. Another app may be using it.',
  vcSilent:'We can\'t hear you. Check that the right mic is on and come a little closer.',
  vcNoisy:'There\'s a lot of background noise. Try somewhere quieter or closer to the mic.',
  vcNarrow:'Your high note came out almost the same as your low note. Let\'s try both steps again.',
  vcSong:'This song',vcNoSong:'Open a song in the tool to get a key recommendation for it.',vcSongAna:'Finding the melody of the song…',vcSongR:'Melody range',
  vcEst:'estimated from the mix',vcEstT:'There are no separated stems, so the range is estimated from the centre of the mix. Separate the stems with AI for a more precise result.',vcFromVoc:'from the vocals stem',
  vcSongFail:'We couldn\'t find a clear melody in this song. Separating the stems with AI usually helps.',vcNeedYou:'Take the voice test to get a recommendation.',
  vcRec:'Sing it in {k}',vcOrig:'original key',vcOctDown:'an octave below the recording',vcOctUp:'an octave above the recording',
  vcFitOk:'The whole melody sits inside your comfortable range.',vcFitLo:'The lowest notes dip a little below your range.',vcFitHi:'The highest notes go a little above your range.',
  vcFitBoth:'The melody is wider than your comfortable range; this is the best compromise.',
  vcApply:'Move the song to this key',vcApplyS:'Apply',vcApplied:'The song now plays in {k}.',vcHere:'The song is already in this key.',vcAlt:'Other good options',
  vcLgYou:'Your range',vcLgSong:'Melody (original)',vcLgNew:'Melody in the recommended key',vcLive:'Now singing',
  vtBass:'Bass',vtBari:'Baritone',vtTenor:'Tenor',vtAlto:'Alto',vtMezzo:'Mezzo-soprano',vtSop:'Soprano',
  vtBassP:'The lowest voice: deep and rich. Songs by male singers often feel best for you a few semitones lower.',
  vtBariP:'The most common male voice: warm and in the middle. Most pop songs by male singers suit you, sometimes a step lower.',
  vtTenorP:'A bright, high male range. Pop and rock songs by male singers fit you well, and songs by female singers work an octave lower.',
  vtAltoP:'A low, warm and full female voice. Songs by female singers with a high voice usually feel better a few semitones lower.',
  vtMezzoP:'The most common female voice, right in the middle. Most pop songs by female singers sit well for you.',
  vtSopP:'The highest voice: bright and clear. Songs by female singers fit you, sometimes even a little higher.',
  vtNote:'Voice types overlap, so this is a friendly guide, not a verdict.'},
ar:{vcBtn:'مقامي',vcBtnT:'اعثر على المقام المناسب لصوتك',vcTitle:'مقامي',
  vcIntro:'غنِّ في الميكروفون: نتعرّف على مدى صوتك، ونخبرك بأي مقام تغنّي هذه الأغنية، وننقلها إليه بنقرة واحدة.',
  vcPriv:'يُعالَج صوتك داخل هذا المتصفح فقط. لا يُسجَّل شيء ولا يُرفع.',
  vcYou:'صوتك',vcNone:'لا نعرف مدى صوتك بعد. يستغرق الاختبار نحو دقيقة.',vcStart:'ابدأ اختبار الصوت',vcStartH:'الغرفة الهادئة تساعد. لا بأس بسماعات الرأس.',
  vcAgain:'اختبار من جديد',vcRange:'المدى المريح',vcStep:'الخطوة {n} من {m}',
  vcS1:'أخفض نغمة مريحة لك',vcS1H:'غنِّ «آآه» على أخفض نغمة ما زالت سهلة عليك، دون ضغط، وامسكها نحو ثانيتين.',
  vcS2:'أعلى نغمة مريحة لك',vcS2H:'الآن أعلى نغمة تغنّيها براحة، بلا صراخ ولا فالسيتو متكلَّف. امسكها نحو ثانيتين.',
  vcS3:'أغنية تحبها (اختياري)',vcS3H:'غنِّ نحو 10 ثوانٍ من أغنية تحبها بصوتك المعتاد. هذا يساعد على ضبط المدى بدقة.',
  vcListen:'نستمع…',vcHold:'استمر… {s} ث',vcGot:'التقطناها: {n}. تابع الغناء للضبط أو انتقل إلى الخطوة التالية.',vcLeft:'بقي {s} ث',
  vcNext:'التالي',vcRedo:'إعادة هذه الخطوة',vcSkip:'تخطٍّ',vcCancel:'إلغاء',vcFinish:'إنهاء',vcStarting:'نشغّل الميكروفون…',
  vcNoMic:'لم يُعثر على ميكروفون. وصّل ميكروفونًا (أو سماعة بميكروفون) وحاول مجددًا.',
  vcDenied:'الوصول إلى الميكروفون محظور. اسمح به من الرمز بجانب شريط العنوان ثم حاول مجددًا.',
  vcNoSupport:'لا يستطيع هذا المتصفح استخدام الميكروفون هنا. جرّب إصدارًا حديثًا من Chrome أو Edge أو Firefox أو Safari.',
  vcMicFail:'تعذّر تشغيل الميكروفون. ربما يستخدمه تطبيق آخر.',
  vcSilent:'لا نسمعك. تأكد من تشغيل الميكروفون الصحيح واقترب منه قليلًا.',
  vcNoisy:'هناك ضجيج كثير في الخلفية. جرّب مكانًا أهدأ أو اقترب من الميكروفون.',
  vcNarrow:'جاءت النغمة العالية قريبة جدًا من المنخفضة. لنجرّب الخطوتين مرة أخرى.',
  vcSong:'هذه الأغنية',vcNoSong:'افتح أغنية في الأداة لتحصل على توصية بمقامها.',vcSongAna:'نبحث عن لحن الأغنية…',vcSongR:'مدى اللحن',
  vcEst:'تقدير من المزيج',vcEstT:'لا توجد مسارات مفصولة، لذا يُقدَّر المدى من وسط المزيج. افصل المسارات بالذكاء الاصطناعي لنتيجة أدق.',vcFromVoc:'من مسار الغناء',
  vcSongFail:'لم نجد لحنًا واضحًا في هذه الأغنية. فصل المسارات بالذكاء الاصطناعي يساعد عادةً.',vcNeedYou:'أجرِ اختبار الصوت لتحصل على توصية.',
  vcRec:'غنِّها في {k}',vcOrig:'المقام الأصلي',vcOctDown:'أوكتاف تحت التسجيل',vcOctUp:'أوكتاف فوق التسجيل',
  vcFitOk:'اللحن كله داخل مداك المريح.',vcFitLo:'أخفض النغمات تنزل قليلًا تحت مداك.',vcFitHi:'أعلى النغمات تصعد قليلًا فوق مداك.',
  vcFitBoth:'اللحن أوسع من مداك المريح، وهذا أفضل حل وسط.',
  vcApply:'انقل الأغنية إلى هذا المقام',vcApplyS:'تطبيق',vcApplied:'الأغنية تُعزف الآن في {k}.',vcHere:'الأغنية في هذا المقام بالفعل.',vcAlt:'خيارات جيدة أخرى',
  vcLgYou:'مداك',vcLgSong:'اللحن (الأصلي)',vcLgNew:'اللحن في المقام المقترح',vcLive:'تغنّي الآن',
  vtBass:'باص',vtBari:'باريتون',vtTenor:'تينور',vtAlto:'ألتو',vtMezzo:'ميتزو سوبرانو',vtSop:'سوبرانو',
  vtBassP:'أعمق الأصوات، غني وممتلئ. أغاني المطربين الرجال تناسبك غالبًا أكثر بعد خفضها بضعة أنصاف درجات.',
  vtBariP:'أكثر الأصوات الرجالية شيوعًا، دافئ ومتوسط. تناسبك معظم أغاني البوب للمطربين، أحيانًا بعد خفضها درجة.',
  vtTenorP:'مدى رجالي عالٍ ومشرق. تناسبك أغاني البوب والروك للمطربين، ويمكنك غناء أغاني المطربات أوكتافًا أخفض.',
  vtAltoP:'صوت نسائي منخفض، دافئ وممتلئ. أغاني المطربات ذوات الأصوات العالية تريحك غالبًا بعد خفضها بضعة أنصاف درجات.',
  vtMezzoP:'أكثر الأصوات النسائية شيوعًا، في الوسط تمامًا. تناسبك معظم أغاني البوب للمطربات.',
  vtSopP:'أعلى الأصوات، مشرق وصافٍ. تناسبك أغاني المطربات، وأحيانًا أعلى قليلًا.',
  vtNote:'أنواع الأصوات متداخلة، فهذا دليل ودّي وليس حكمًا نهائيًا.'},
ru:{vcBtn:'Моя тональность',vcBtnT:'Подберите тональность под свой голос',vcTitle:'Моя тональность',
  vcIntro:'Спойте в микрофон: мы узнаем ваш диапазон, подскажем, в какой тональности петь эту песню, и перенесём её туда одним нажатием.',
  vcPriv:'Голос обрабатывается только в этом браузере. Ничего не записывается и не отправляется.',
  vcYou:'Ваш голос',vcNone:'Мы пока не знаем ваш диапазон. Тест займёт около минуты.',vcStart:'Начать тест голоса',vcStartH:'Лучше в тихой комнате. В наушниках тоже можно.',
  vcAgain:'Пройти заново',vcRange:'Удобный диапазон',vcStep:'Шаг {n} из {m}',
  vcS1:'Самая низкая удобная нота',vcS1H:'Спойте «а-а-а» на самой низкой ноте, которая даётся легко, без напряжения, и держите около 2 секунд.',
  vcS2:'Самая высокая удобная нота',vcS2H:'Теперь самую высокую ноту, которую поёте комфортно, без крика и натужного фальцета. Держите около 2 секунд.',
  vcS3:'Любимая песня (по желанию)',vcS3H:'Спойте секунд 10 из песни, которую любите, своим обычным голосом. Это уточнит диапазон.',
  vcListen:'Слушаем…',vcHold:'Продолжайте… {s} с',vcGot:'Есть: {n}. Можно петь дальше для уточнения или перейти к следующему шагу.',vcLeft:'Осталось {s} с',
  vcNext:'Далее',vcRedo:'Повторить этот шаг',vcSkip:'Пропустить',vcCancel:'Отмена',vcFinish:'Готово',vcStarting:'Включаем микрофон…',
  vcNoMic:'Микрофон не найден. Подключите микрофон (или гарнитуру) и попробуйте снова.',
  vcDenied:'Доступ к микрофону заблокирован. Разрешите его через значок рядом с адресной строкой и попробуйте снова.',
  vcNoSupport:'Этот браузер не может использовать микрофон здесь. Попробуйте свежий Chrome, Edge, Firefox или Safari.',
  vcMicFail:'Не удалось включить микрофон. Возможно, его занимает другое приложение.',
  vcSilent:'Вас не слышно. Проверьте, что включён нужный микрофон, и подойдите чуть ближе.',
  vcNoisy:'Слишком много фонового шума. Попробуйте в более тихом месте или ближе к микрофону.',
  vcNarrow:'Высокая нота получилась почти как низкая. Давайте повторим оба шага.',
  vcSong:'Эта песня',vcNoSong:'Откройте песню в инструменте, чтобы получить рекомендацию по тональности.',vcSongAna:'Ищем мелодию песни…',vcSongR:'Диапазон мелодии',
  vcEst:'оценка по миксу',vcEstT:'Стемов нет, поэтому диапазон оценён по центру микса. Разделите трек на стемы с ИИ для более точного результата.',vcFromVoc:'по стему вокала',
  vcSongFail:'Не удалось найти чёткую мелодию в этой песне. Обычно помогает разделение на стемы с ИИ.',vcNeedYou:'Пройдите тест голоса, чтобы получить рекомендацию.',
  vcRec:'Пойте в {k}',vcOrig:'исходная тональность',vcOctDown:'на октаву ниже записи',vcOctUp:'на октаву выше записи',
  vcFitOk:'Вся мелодия умещается в ваш удобный диапазон.',vcFitLo:'Самые низкие ноты чуть ниже вашего диапазона.',vcFitHi:'Самые высокие ноты чуть выше вашего диапазона.',
  vcFitBoth:'Мелодия шире вашего удобного диапазона — это лучший компромисс.',
  vcApply:'Перенести песню в эту тональность',vcApplyS:'Применить',vcApplied:'Песня теперь звучит в {k}.',vcHere:'Песня уже в этой тональности.',vcAlt:'Другие хорошие варианты',
  vcLgYou:'Ваш диапазон',vcLgSong:'Мелодия (оригинал)',vcLgNew:'Мелодия в рекомендуемой тональности',vcLive:'Сейчас поёте',
  vtBass:'Бас',vtBari:'Баритон',vtTenor:'Тенор',vtAlto:'Альт',vtMezzo:'Меццо-сопрано',vtSop:'Сопрано',
  vtBassP:'Самый низкий голос, глубокий и насыщенный. Песни исполнителей-мужчин обычно удобнее на несколько полутонов ниже.',
  vtBariP:'Самый распространённый мужской голос, тёплый и средний. Большинство поп-песен исполнителей-мужчин вам подходят, иногда на тон ниже.',
  vtTenorP:'Высокий и яркий мужской диапазон. Вам подходят поп и рок исполнителей-мужчин, а женские песни можно петь на октаву ниже.',
  vtAltoP:'Низкий женский голос, тёплый и полный. Песни певиц с высоким голосом обычно удобнее на несколько полутонов ниже.',
  vtMezzoP:'Самый распространённый женский голос, прямо посередине. Большинство поп-песен певиц вам подходят.',
  vtSopP:'Самый высокий голос, яркий и чистый. Вам подходят песни певиц, иногда даже чуть выше.',
  vtNote:'Типы голосов пересекаются, так что это дружеская подсказка, а не приговор.'},
es:{vcBtn:'Mi tono',vcBtnT:'Encuentra la tonalidad que le va a tu voz',vcTitle:'Mi tonalidad',
  vcIntro:'Canta al micrófono: aprendemos tu registro, te decimos en qué tonalidad cantar esta canción y la llevamos allí con un clic.',
  vcPriv:'Tu voz se procesa solo en este navegador. No se graba ni se sube nada.',
  vcYou:'Tu voz',vcNone:'Aún no conocemos tu registro. La prueba dura alrededor de un minuto.',vcStart:'Empezar la prueba de voz',vcStartH:'Ayuda un lugar tranquilo. Puedes usar auriculares.',
  vcAgain:'Repetir la prueba',vcRange:'Registro cómodo',vcStep:'Paso {n} de {m}',
  vcS1:'Tu nota más grave cómoda',vcS1H:'Canta «aaa» en la nota más grave que aún te resulte fácil, sin forzar, y mantenla unos 2 segundos.',
  vcS2:'Tu nota más aguda cómoda',vcS2H:'Ahora la nota más aguda que cantas con comodidad, sin gritar ni forzar el falsete. Mantenla unos 2 segundos.',
  vcS3:'Una canción que te guste (opcional)',vcS3H:'Canta unos 10 segundos de una canción que te guste, con tu voz normal. Ayuda a afinar tu registro.',
  vcListen:'Escuchando…',vcHold:'Sigue… {s} s',vcGot:'¡Listo: {n}! Sigue cantando para ajustar o pasa al siguiente paso.',vcLeft:'Quedan {s} s',
  vcNext:'Siguiente',vcRedo:'Repetir este paso',vcSkip:'Omitir',vcCancel:'Cancelar',vcFinish:'Terminar',vcStarting:'Activando el micrófono…',
  vcNoMic:'No se encontró ningún micrófono. Conecta uno (o unos auriculares con micrófono) e inténtalo de nuevo.',
  vcDenied:'El acceso al micrófono está bloqueado. Permítelo desde el icono junto a la barra de direcciones e inténtalo de nuevo.',
  vcNoSupport:'Este navegador no puede usar el micrófono aquí. Prueba con Chrome, Edge, Firefox o Safari actualizados.',
  vcMicFail:'No pudimos activar el micrófono. Puede que otra aplicación lo esté usando.',
  vcSilent:'No te oímos. Comprueba que está activo el micrófono correcto y acércate un poco.',
  vcNoisy:'Hay mucho ruido de fondo. Prueba en un sitio más tranquilo o más cerca del micrófono.',
  vcNarrow:'Tu nota aguda salió casi igual que la grave. Repitamos los dos pasos.',
  vcSong:'Esta canción',vcNoSong:'Abre una canción en la herramienta para recibir una recomendación de tonalidad.',vcSongAna:'Buscando la melodía de la canción…',vcSongR:'Registro de la melodía',
  vcEst:'estimado a partir de la mezcla',vcEstT:'No hay pistas separadas, así que el registro se estima a partir del centro de la mezcla. Separa las pistas con IA para un resultado más preciso.',vcFromVoc:'de la pista de voz',
  vcSongFail:'No encontramos una melodía clara en esta canción. Separar las pistas con IA suele ayudar.',vcNeedYou:'Haz la prueba de voz para recibir una recomendación.',
  vcRec:'Cántala en {k}',vcOrig:'tonalidad original',vcOctDown:'una octava por debajo de la grabación',vcOctUp:'una octava por encima de la grabación',
  vcFitOk:'Toda la melodía queda dentro de tu registro cómodo.',vcFitLo:'Las notas más graves bajan un poco de tu registro.',vcFitHi:'Las notas más agudas suben un poco por encima de tu registro.',
  vcFitBoth:'La melodía es más amplia que tu registro cómodo; este es el mejor equilibrio.',
  vcApply:'Llevar la canción a esta tonalidad',vcApplyS:'Aplicar',vcApplied:'La canción suena ahora en {k}.',vcHere:'La canción ya está en esta tonalidad.',vcAlt:'Otras buenas opciones',
  vcLgYou:'Tu registro',vcLgSong:'Melodía (original)',vcLgNew:'Melodía en la tonalidad recomendada',vcLive:'Cantando ahora',
  vtBass:'Bajo',vtBari:'Barítono',vtTenor:'Tenor',vtAlto:'Contralto',vtMezzo:'Mezzosoprano',vtSop:'Soprano',
  vtBassP:'La voz más grave, profunda y rica. Las canciones de cantantes masculinos suelen quedarte mejor unos semitonos más abajo.',
  vtBariP:'La voz masculina más común, cálida y en el medio. La mayoría de canciones pop de cantantes masculinos te quedan bien, a veces un tono más abajo.',
  vtTenorP:'Un registro masculino agudo y brillante. Te van el pop y el rock de cantantes masculinos, y las canciones de cantantes femeninas funcionan una octava más abajo.',
  vtAltoP:'Una voz femenina grave, cálida y plena. Las canciones de cantantes con voz aguda suelen quedarte mejor unos semitonos más abajo.',
  vtMezzoP:'La voz femenina más común, justo en el medio. La mayoría de canciones pop de cantantes femeninas te quedan bien.',
  vtSopP:'La voz más aguda, brillante y clara. Te van las canciones de cantantes femeninas, a veces incluso un poco más arriba.',
  vtNote:'Los tipos de voz se solapan, así que esto es una guía amistosa, no un veredicto.'}
});

/* ---------- DSP: copied into the song worker with toString(), so these functions use nothing from outside ---------- */
/* one YIN frame: cumulative-mean-normalised difference, first dip under thr, parabolic refinement.
   Returns the period in samples (0 = unvoiced); out[0] = aperiodicity of the chosen dip. */
function yinFrame(x,o,W,tmin,tmax,d,thr,out){
  for(let tau=1;tau<=tmax;tau++){let s=0;for(let i=0;i<W;i++){const v=x[o+i]-x[o+i+tau];s+=v*v}d[tau]=s}
  let run=0;d[0]=1;
  for(let tau=1;tau<=tmax;tau++){run+=d[tau];d[tau]=run>0?d[tau]*tau/run:1}
  let best=-1;
  for(let tau=tmin;tau<tmax;tau++){if(d[tau]<thr){while(tau+1<tmax&&d[tau+1]<d[tau])tau++;best=tau;break}}
  if(best<1)return 0;
  const a=d[best-1],b=d[best],c=d[best+1],den=a-2*b+c;let p=den>0?0.5*(a-c)/den:0;if(p>0.5)p=0.5;if(p<-0.5)p=-0.5;
  if(out)out[0]=b;return best+p;
}
function medOf(a){const b=a.slice().sort((x,y)=>x-y),n=b.length;return n?(n&1?b[n>>1]:(b[n/2-1]+b[n/2])/2):NaN}
/* weighted percentile of values v with weights w (q in 0…1) */
function wpct(v,w,q){const ix=v.map((_,i)=>i).sort((a,b)=>v[a]-v[b]);let tot=0;for(const x of w)tot+=x;let acc=0;
  for(const i of ix){acc+=w[i];if(acc>=q*tot)return v[i]}return v[ix[ix.length-1]]}
function fftC(re,im,inv){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
  for(let len=2;len<=n;len<<=1){const ang=(inv?2:-2)*Math.PI/len,wr=Math.cos(ang),wi=Math.sin(ang),h=len>>1;
    for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let k=0;k<h;k++){const a=i+k,b=a+h,xr=re[b]*cr-im[b]*ci,xi=re[b]*ci+im[b]*cr;
      re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;const nr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=nr}}}
}
/* centre-channel extract: per STFT bin keep what L and R share (ψ = 2·Re(L·R̄)/(|L|²+|R|²), gain ψ²) */
function centreOf(L,R,cut,sr){
  const N=1024,H=256,n=L.length,out=new Float32Array(n),w=new Float32Array(N);
  for(let i=0;i<N;i++)w[i]=0.5-0.5*Math.cos(2*Math.PI*i/N);
  const re=new Float32Array(N),im=new Float32Array(N),ar=new Float32Array(N),ai=new Float32Array(N);
  for(let o=0;o+N<=n;o+=H){
    for(let i=0;i<N;i++){re[i]=L[o+i]*w[i];im[i]=R[o+i]*w[i]}
    fftC(re,im,false);
    for(let k=0;k<=N/2;k++){const k2=(N-k)%N,xr=re[k],xi=im[k],yr=re[k2],yi=-im[k2];
      const Lr=(xr+yr)/2,Li=(xi+yi)/2,Rr=(xi-yi)/2,Ri=-(xr-yr)/2;
      const pl=Lr*Lr+Li*Li,pr=Rr*Rr+Ri*Ri;let psi=pl+pr>1e-14?2*(Lr*Rr+Li*Ri)/(pl+pr):0;if(psi<0)psi=0;const g=psi*psi;
      const gg=cut&&k*sr/N<cut?0:g;ar[k]=gg*(Lr+Rr)/2;ai[k]=gg*(Li+Ri)/2;if(k>0&&k<N/2){ar[N-k]=ar[k];ai[N-k]=-ai[k]}}
    fftC(ar,ai,true);
    for(let i=0;i<N;i++)out[o+i]+=ar[i]/N*w[i]/1.5;
  }
  return out;
}
/* melody range of a mono signal: steady pitch runs → duration-weighted 10th / 90th percentiles */
function songWork(L,R,sr,mix,post,O){
  O=O||{};const x=mix&&R?centreOf(L,R,O.cut||0,sr):L;post(0.3);
  const W=Math.round(sr*0.03),hop=Math.round(sr*0.0116),fmin=O.fmin||(mix?95:75),fmax=1000,tmin=Math.floor(sr/fmax),tmax=Math.ceil(sr/fmin);
  const n=Math.max(0,Math.floor((x.length-W-tmax-2)/hop)),d=new Float32Array(tmax+2),m=new Float32Array(n).fill(-1),rms=new Float32Array(n),ap=[1];
  for(let f=0;f<n;f++){const o=f*hop;let e=0;for(let i=0;i<W;i++)e+=x[o+i]*x[o+i];rms[f]=Math.sqrt(e/W)}
  const rs=Array.from(rms).sort((a,b)=>a-b),gate=Math.max(1e-4,(rs[Math.floor(rs.length*0.9)]||0)*(mix?0.2:0.12));
  for(let f=0;f<n;f++){
    if(rms[f]>=gate){const tau=yinFrame(x,f*hop,W,tmin,tmax,d,O.thr||(mix?0.14:0.18),ap);if(tau>0){const hz=sr/tau;if(hz>=fmin&&hz<=fmax)m[f]=69+12*Math.log2(hz/440)}}
    if(f%400===0)post(0.3+0.6*f/Math.max(1,n));
  }
  /* 5-frame median of voiced frames */
  const md=new Float32Array(n).fill(-1);
  for(let f=0;f<n;f++){if(m[f]<0)continue;const w=[];for(let k=-2;k<=2;k++){const v=m[f+k];if(v!==undefined&&v>=0)w.push(v)}if(w.length>=3)md[f]=medOf(w)}
  /* steady runs: consecutive frames within 1 semitone of the run's mean, at least 120 ms */
  const minRun=Math.max(3,Math.round(0.12*sr/hop)),runs=[];let st=-1,sum=0,cnt=0,vals=[];
  const flush=()=>{if(cnt>=minRun)runs.push({t:st*hop/sr,v:medOf(vals),w:cnt*hop/sr});st=-1;sum=0;cnt=0;vals=[]};
  for(let f=0;f<n;f++){const v=md[f];if(v<0){flush();continue}if(cnt&&Math.abs(v-sum/cnt)>1)flush();if(st<0)st=f;sum+=v;cnt++;vals.push(v)}
  flush();
  /* octave guard: a run ~12 semitones away from the local (±4 s) median is folded back */
  for(const r of runs){const near=runs.filter(q=>Math.abs(q.t-r.t)<=4&&q!==r).map(q=>q.v);if(near.length<3)continue;const ref=medOf(near),dv=r.v-ref;
    if(Math.abs(Math.abs(dv)-12)<1.5)r.v-=12*Math.sign(dv)}
  let sec=0;for(const r of runs)sec+=r.w;
  if(sec<(mix?4:3)||runs.length<6)return {ok:false,sec};
  const v=runs.map(r=>r.v),w=runs.map(r=>r.w);
  return {ok:true,lo:Math.round(wpct(v,w,0.1)),hi:Math.round(wpct(v,w,0.9)),mid:Math.round(wpct(v,w,0.5)),sec,runs:runs.length};
}

/* ---------- music helpers ---------- */
const noteName=m=>{m=Math.round(m);return CR.SHARP[mod(m,12)]+(Math.floor(m/12)-1)};
const ltr=s=>'<span dir="ltr" class="vc-ltr">'+esc(s)+'</span>';
const shTxt=s=>(s>0?'+':s<0?'−':'±')+Math.abs(s);
/* voice type from the comfortable range: nearest typical centre (bass E2–C4 … soprano C4–A5) */
const VT=[['vtBass',40,60],['vtBari',45,65],['vtTenor',48,69],['vtAlto',53,74],['vtMezzo',57,77],['vtSop',60,81]];
function voiceType(lo,hi){const c=(lo+hi)/2;let best=VT[0],bd=1e9;for(const v of VT){const d=Math.abs(c-(v[1]+v[2])/2)+0.15*Math.abs(lo-v[1]);if(d<bd){bd=d;best=v}}return best[0]}
/* best keys: u = {lo,hi} comfortable range, s = {lo,hi} melody in the original key, key = {pc,mode} */
function recommend(u,s,key){
  const uc=(u.lo+u.hi)/2,all=[];
  for(let sh=-6;sh<=6;sh++){let best=null;
    for(const k of [0,-1,1]){const lo=s.lo+sh+12*k,hi=s.hi+sh+12*k,below=Math.max(0,u.lo-lo),above=Math.max(0,hi-u.hi);
      const cost=3*(below+above)+0.45*Math.abs(sh)+0.2*Math.abs((lo+hi)/2-uc)+(k?0.8:0);
      if(!best||cost<best.cost-1e-9)best={sh,k,lo,hi,below,above,cost}}
    all.push(best)}
  all.sort((a,b)=>a.cost-b.cost||Math.abs(a.sh)-Math.abs(b.sh));
  const seen=new Set(),res=[];
  for(const o of all){const pc=mod(key.pc+o.sh,12);if(seen.has(pc))continue;seen.add(pc);res.push({...o,pc,mode:key.mode});if(res.length===3)break}
  return res;
}

/* ---------- storage (per account) ---------- */
const who=()=>{const u=CR.user?CR.user():null;return (u&&u.uid)||'guest'};
const SKEY=()=>'chordroom.voice.v1:'+who();
function loadVoice(){try{const v=JSON.parse(localStorage.getItem(SKEY())||'null');return v&&isFinite(v.lo)&&isFinite(v.hi)&&v.hi>v.lo?v:null}catch(e){return null}}
function saveVoice(v){try{localStorage.setItem(SKEY(),JSON.stringify(v))}catch(e){}}

/* ---------- song melody range (worker) ---------- */
const CACHE=new Map();let JOB=null;
/* mix: the bass and kick are centred too, so the band is 250–2500 Hz (bins under 200 Hz dropped in the centre mask):
   YIN still finds the voice's period from its harmonics, and the bass line no longer wins. Vocals stem: 75–1400 Hz. */
const MIXO={hp:250,lp:2500,cut:200},VOCO={hp:75,lp:1400};
const WSRC=[yinFrame,medOf,wpct,fftC,centreOf,songWork].map(f=>f.toString()).join('\n')+
  '\nonmessage=e=>{const {L,R,sr,mix,O}=e.data;const r=songWork(L,R,sr,mix,p=>postMessage({p}),O);postMessage({done:r})};';
function songKey(s){return s.name+'|'+(s.dur||0).toFixed(2)+'|'+(s.vocals?'v':'m')}
async function songRange(s,onP){
  const k=songKey(s);if(CACHE.has(k))return CACHE.get(k);
  if(JOB&&JOB.k===k)return JOB.p;
  const p=(async()=>{
    const src=s.vocals||s.buffer,mix=!s.vocals,sr=11025,dur=Math.min(src.duration,420);
    const oc=new OfflineAudioContext(mix?2:1,Math.max(1,Math.ceil(dur*sr)),sr),b=oc.createBufferSource();b.buffer=src;
    let node=b;const f=(type,fq)=>{const q=oc.createBiquadFilter();q.type=type;q.frequency.value=fq;q.Q.value=0.707;node.connect(q);node=q};
    const O=mix?MIXO:VOCO;f('highpass',O.hp);f('highpass',O.hp);f('lowpass',O.lp);f('lowpass',O.lp);
    node.connect(oc.destination);b.start();
    const r=await oc.startRendering();onP&&onP(0.15);
    const L=r.getChannelData(0).slice(0),R=mix?r.getChannelData(1).slice(0):null;
    const url=URL.createObjectURL(new Blob([WSRC],{type:'text/javascript'})),w=new Worker(url);
    const res=await new Promise((ok,no)=>{w.onmessage=e=>{if(e.data.done){ok(e.data.done)}else if(onP)onP(0.15+0.85*e.data.p)};w.onerror=e=>no(e);
      w.postMessage({L,R,sr,mix,O},R?[L.buffer,R.buffer]:[L.buffer])}).finally(()=>{w.terminate();URL.revokeObjectURL(url)});
    res.est=mix;CACHE.set(k,res);return res})();
  JOB={k,p};try{return await p}finally{if(JOB&&JOB.k===k)JOB=null}
}

/* ---------- microphone pitch tracker ---------- */
/* The pitch of every 2048-sample block is found inside an AudioWorklet (audio thread), so a busy page (slow phones)
   loses no audio and timing stays in audio time; the page only gets {rms, hz} per block. Without AudioWorklet: an
   AnalyserNode polled every 50 ms on the main thread. pitchOf() is copied into the worklet with toString(). */
function pitchOf(x,sr,W,tmin,tmax,d){
  let e=0;for(let i=0;i<x.length;i++)e+=x[i]*x[i];const rms=Math.sqrt(e/x.length);
  const tau=rms>0.003?yinFrame(x,x.length-W-tmax-1,W,tmin,tmax,d,0.2,null):0;
  return {rms,hz:tau>0?sr/tau:0};
}
const TAP_SRC=yinFrame.toString()+'\n'+pitchOf.toString()+'\n'+
  'class T extends AudioWorkletProcessor{constructor(o){super();const q=o.processorOptions;this.ds=q.ds;this.N=4096;this.r=new Float32Array(this.N);this.n=0;this.c=0;'+
  'this.x=new Float32Array(this.N/this.ds);this.sr=sampleRate/this.ds;this.tmin=Math.floor(this.sr/1100);this.tmax=Math.ceil(this.sr/65);this.W=Math.min(1024,this.x.length-this.tmax-2);this.d=new Float32Array(this.tmax+2)}'+
  'process(i){const ch=i[0]&&i[0][0];if(!ch)return true;const r=this.r,N=this.N;for(let k=0;k<ch.length;k++){r[this.n]=ch[k];this.n=(this.n+1)%N;if(++this.c===2048){this.c=0;this.frame()}}return true}'+
  'frame(){const r=this.r,N=this.N,x=this.x,ds=this.ds,o=this.n;for(let i=0;i<x.length;i++){let s=0;for(let j=0;j<ds;j++)s+=r[(o+i*ds+j)%N];x[i]=s/ds}'+
  'this.port.postMessage(pitchOf(x,this.sr,this.W,this.tmin,this.tmax,this.d))}}registerProcessor("vc-tap",T);';
const MIC={ctx:null,stream:null,an:null,tap:null,timer:0,nf:0.002,raw:[],acc:[],onFrame:null};
async function micStart(onFrame){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.isSecureContext)throw {vc:'vcNoSupport'};
  const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw {vc:'vcNoSupport'};
  const ctx=new AC();try{ctx.resume&&ctx.resume().catch(()=>{})}catch(e){} // created + resumed inside the click (iOS)
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})}
  catch(e){try{ctx.close()}catch(x){}const n=e&&e.name;
    throw {vc:n==='NotAllowedError'||n==='SecurityError'||n==='PermissionDeniedError'?'vcDenied':n==='NotFoundError'||n==='DevicesNotFoundError'||n==='OverconstrainedError'?'vcNoMic':'vcMicFail'}}
  if(!stream.getAudioTracks().length){stream.getTracks().forEach(x=>x.stop());try{ctx.close()}catch(x){}throw {vc:'vcNoMic'}}
  Object.assign(MIC,{ctx,stream,nf:0.002,raw:[],acc:[],onFrame});
  if(ctx.state!=='running'){try{await ctx.resume()}catch(e){}}
  const src=ctx.createMediaStreamSource(stream),hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=55;
  const mute=ctx.createGain();mute.gain.value=0;src.connect(hp);
  const N=4096,sr0=ctx.sampleRate,ds=sr0>=32000?2:1;
  let tap=null;
  if(ctx.audioWorklet&&window.AudioWorkletNode){const url=URL.createObjectURL(new Blob([TAP_SRC],{type:'text/javascript'}));
    try{await ctx.audioWorklet.addModule(url);tap=new AudioWorkletNode(ctx,'vc-tap',{numberOfInputs:1,numberOfOutputs:1,channelCount:1,channelCountMode:'explicit',processorOptions:{ds}})}catch(e){tap=null}
    finally{URL.revokeObjectURL(url)}}
  if(MIC.ctx!==ctx)return; // stopped meanwhile
  if(tap){MIC.tap=tap;hp.connect(tap).connect(mute).connect(ctx.destination);const dt=2048/sr0;
    tap.port.onmessage=e=>{if(MIC.tap!==tap)return;const f=micFrame(e.data);if(MIC.onFrame)MIC.onFrame(f,dt)}}
  else{const an=ctx.createAnalyser();an.fftSize=N;an.smoothingTimeConstant=0;hp.connect(an).connect(mute).connect(ctx.destination);MIC.an=an;
    const buf=new Float32Array(N),x=new Float32Array(N/ds),sr=sr0/ds,tmin=Math.floor(sr/1100),tmax=Math.ceil(sr/65),W=Math.min(1024,x.length-tmax-2),d=new Float32Array(tmax+2);let last=performance.now();
    MIC.timer=setInterval(()=>{if(MIC.an!==an)return;const now=performance.now(),dt=Math.min(0.25,(now-last)/1000);last=now;an.getFloatTimeDomainData(buf);
      if(ds===2)for(let i=0;i<x.length;i++)x[i]=(buf[2*i]+buf[2*i+1])*0.5;else x.set(buf);
      const f=micFrame(pitchOf(x,sr,W,tmin,tmax,d));if(MIC.onFrame)MIC.onFrame(f,dt)},50)}
}
function micStop(){
  clearInterval(MIC.timer);MIC.timer=0;
  if(MIC.tap){try{MIC.tap.port.onmessage=null;MIC.tap.disconnect()}catch(e){}}
  if(MIC.stream)MIC.stream.getTracks().forEach(x=>x.stop());
  if(MIC.ctx){try{MIC.ctx.close()}catch(e){}}
  Object.assign(MIC,{ctx:null,stream:null,an:null,tap:null,onFrame:null});
}
/* one block {rms, hz} → {rms, loud, m (smoothed MIDI or null), steady} */
function micFrame(p){
  const rms=p.rms,loud=rms>Math.max(0.006,MIC.nf*3);
  const raw=loud&&p.hz>=65&&p.hz<=1100?69+12*Math.log2(p.hz/440):null;
  // adaptive noise floor from frames without a pitch: drops fast in quiet stretches, rises slowly with steady noise
  if(raw==null)MIC.nf=rms<MIC.nf?MIC.nf*0.7+rms*0.3:MIC.nf+(rms-MIC.nf)*0.01;
  MIC.raw.push(raw);if(MIC.raw.length>5)MIC.raw.shift();
  const v=MIC.raw.filter(q=>q!=null);let m=v.length>=3&&raw!=null?medOf(v):null;
  if(m!=null&&MIC.acc.length>=6){const ref=medOf(MIC.acc.slice(-20)),dv=m-ref;if(Math.abs(Math.abs(dv)-12)<1.5)m-=12*Math.sign(dv)}
  const steady=m!=null&&Math.abs(raw-m)<0.7;
  if(steady){MIC.acc.push(m);if(MIC.acc.length>60)MIC.acc.shift()}
  return {rms,loud,m,steady};
}
function pct(a,q){const b=a.slice().sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.max(0,Math.floor(q*(b.length-1)+0.5)))]}

/* ---------- panel ---------- */
const V={open:false,test:null,song:null,songState:'',prog:0,msg:'',err:'',applied:null,lastFocus:null};
const NEED=1.5,MIN_NEXT=0.5,SONG_T=10; // seconds of steady singing / of the song step (audio time)
let wrap=null,box=null,btn=null,kbKeys=null;

const MIC_IC='<svg class="vc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>';
function mkButton(){
  const st=document.getElementById('stKey');if(!st||document.getElementById('vcOpen'))return;
  btn=document.createElement('button');btn.type='button';btn.id='vcOpen';btn.className='vc-open';btn.setAttribute('aria-haspopup','dialog');
  btn.onclick=open;st.appendChild(btn);btnLang();
}
function btnLang(){if(!btn)return;btn.innerHTML=MIC_IC+'<span>'+esc(t('vcBtn'))+'</span>';btn.title=t('vcBtnT')}

function ensureDlg(){
  if(wrap)return;
  wrap=document.createElement('div');wrap.className='dlgwrap vc-wrap';wrap.id='vcDlg';wrap.hidden=true;
  box=document.createElement('div');box.className='dlg vcdlg';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','vcTitle');
  wrap.appendChild(box);document.body.appendChild(wrap);
  wrap.addEventListener('mousedown',e=>{if(e.target===wrap)close()});
  box.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();close();return}
    if(e.key!=='Tab')return;const f=[...box.querySelectorAll('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);if(!f.length)return;
    const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}});
  box.addEventListener('click',onClick);
}
function open(){
  ensureDlg();V.lastFocus=document.activeElement;V.open=true;V.err='';V.msg='';V.applied=null;
  V.song=CR.voiceSong?CR.voiceSong():null;V.songRes=null;V.songState=V.song?'run':'';
  wrap.hidden=false;render();
  const x=box.querySelector('.x');if(x)x.focus();
  if(V.song)runSong();
}
function close(){
  if(!wrap||wrap.hidden)return;
  stopTest();V.open=false;wrap.hidden=true;box.innerHTML='';
  if(V.lastFocus&&V.lastFocus.focus&&document.contains(V.lastFocus))V.lastFocus.focus();
}
async function runSong(){
  const s=V.song;V.prog=0;
  try{const r=await songRange(s,p=>{V.prog=p;const pb=box&&box.querySelector('.vc-sprog i');if(pb)pb.style.width=Math.round(p*100)+'%'});
    if(!V.open||V.song!==s)return;V.songRes=r;V.songState=r.ok?'ok':'fail'}
  catch(e){console.warn(e);if(!V.open||V.song!==s)return;V.songState='fail'}
  render();
}

/* ---------- keyboard strip (always LTR) ---------- */
const isBlack=m=>[1,3,6,8,10].includes(mod(m,12));
/* C2–C6 by default (room for any voice while testing); on a narrow dialog with data, zoom to the data (≥ 2 octaves) */
function kbRange(narrow){
  const u=loadVoice(),r=V.songRes&&V.songRes.ok?V.songRes:null,rec=V.rec&&V.rec[0];
  const vals=[u&&u.lo,u&&u.hi,r&&r.lo,r&&r.hi,V.sel&&V.sel.lo,V.sel&&V.sel.hi,rec&&rec.lo,rec&&rec.hi].filter(v=>v!=null&&isFinite(v));
  let lo=36,hi=84;
  if(narrow&&vals.length&&!V.test){lo=Math.min(...vals)-1;hi=Math.max(...vals)+1;while(hi-lo<24){lo--;hi++}}
  else for(const v of vals){lo=Math.min(lo,v-1);hi=Math.max(hi,v+1)}
  lo=Math.max(21,lo-mod(lo,12));hi=Math.min(108,hi+mod(12-mod(hi,12),12));return [lo,hi];
}
function kbSvg(){
  const narrow=!!box&&box.clientWidth>0&&box.clientWidth<480,[lo,hi]=kbRange(narrow),WW=20,BW=12,top=46,WH=74,BH=46;const wx={};let n=0;
  for(let m=lo;m<=hi;m++)if(!isBlack(m)){wx[m]=n*WW;n++}
  const cx=m=>isBlack(m)?wx[m-1]+WW:wx[m]+WW/2,W=n*WW;
  let g='';
  for(let m=lo;m<=hi;m++)if(!isBlack(m))g+='<rect class="wk" data-m="'+m+'" x="'+(wx[m]+0.5)+'" y="'+top+'" width="'+(WW-1)+'" height="'+WH+'" rx="2.5"/>'+
    (mod(m,12)===0?'<text class="kl'+(narrow?' big':'')+'" x="'+(wx[m]+WW/2)+'" y="'+(top+WH-7)+'" text-anchor="middle">C'+(m/12-1)+'</text>':'');
  for(let m=lo;m<=hi;m++)if(isBlack(m))g+='<rect class="bk" data-m="'+m+'" x="'+(cx(m)-BW/2)+'" y="'+top+'" width="'+BW+'" height="'+BH+'" rx="2"/>';
  const band=(a,b,row,cls)=>{if(a==null||b==null)return '';const x0=cx(Math.max(lo,a))-7,x1=cx(Math.min(hi,b))+7;return '<rect class="'+cls+'" x="'+x0+'" y="'+(4+row*13)+'" width="'+Math.max(4,x1-x0)+'" height="10" rx="5"/>'};
  const u=loadVoice(),r=V.songRes&&V.songRes.ok?V.songRes:null,sel=V.sel;
  g+=band(u&&u.lo,u&&u.hi,0,'b-you')+band(r&&r.lo,r&&r.hi,1,'b-song')+band(sel&&sel.lo,sel&&sel.hi,2,'b-new');
  g+='<path class="lv" id="vcLiveMk" d="M0 0" />';
  V.kb={lo,hi,cx,top};
  return '<svg class="vc-kbs" viewBox="0 0 '+W+' '+(top+WH+2)+'" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">'+g+'</svg>';
}
function kbLive(m){
  if(!box)return;const s=box.querySelector('.vc-kbs');if(!s)return;
  const r=m==null?null:Math.round(m);
  if(kbKeys!==r){const o=s.querySelector('.live');if(o)o.classList.remove('live');if(r!=null){const k=s.querySelector('[data-m="'+r+'"]');if(k)k.classList.add('live')}kbKeys=r}
  const mk=s.querySelector('#vcLiveMk');if(!mk||!V.kb)return;
  if(m==null||m<V.kb.lo||m>V.kb.hi){mk.setAttribute('d','M0 0');return}
  const f=Math.floor(m),fr=m-f,x=V.kb.cx(f)+(V.kb.cx(Math.min(V.kb.hi,f+1))-V.kb.cx(f))*fr,y=V.kb.top-2;
  mk.setAttribute('d','M'+(x-6).toFixed(1)+' '+(y-8)+'L'+(x+6).toFixed(1)+' '+(y-8)+'L'+x.toFixed(1)+' '+y+'Z');
}

/* ---------- rendering ---------- */
function render(){
  if(!box||!V.open)return;
  const u=loadVoice(),song=V.song,r=V.songRes;
  V.rec=u&&song&&r&&r.ok?recommend(u,r,song.key):null;
  const cur=CR.getTranspose?CR.getTranspose():0;
  V.sel=V.rec?(V.rec.find(o=>o.sh===cur)||V.rec[0]):null;
  let h='<div class="dh"><h3 id="vcTitle">'+MIC_IC+'<span>'+esc(t('vcTitle'))+'</span></h3><button type="button" class="x" data-a="close" aria-label="'+esc(t('close'))+'" title="'+esc(t('close'))+'">×</button></div>'+
    '<p class="vc-intro">'+esc(t('vcIntro'))+'</p><p class="vc-priv"><svg class="vc-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span>'+esc(t('vcPriv'))+'</span></p>';
  /* your voice */
  h+='<section class="vc-sec" aria-labelledby="vcYouH"><h4 id="vcYouH">'+esc(t('vcYou'))+'</h4>';
  if(V.test)h+=testHtml();
  else if(u){const vt=voiceType(u.lo,u.hi);
    h+='<div class="vc-res"><div class="vc-big">'+ltr(noteName(u.lo)+' – '+noteName(u.hi))+'<span class="vc-vt">'+esc(t(vt))+'</span></div>'+
      '<p class="vc-sub">'+esc(t('vcRange'))+'</p><p>'+esc(t(vt+'P'))+'</p><p class="vc-note">'+esc(t('vtNote'))+'</p>'+
      '<div class="vc-row"><button type="button" class="btn ghost" data-a="start">'+MIC_IC+'<span>'+esc(t('vcAgain'))+'</span></button></div></div>';}
  else h+='<p>'+esc(t('vcNone'))+'</p><div class="vc-row"><button type="button" class="btn solid" data-a="start">'+MIC_IC+'<span>'+esc(t('vcStart'))+'</span></button><span class="vc-hint">'+esc(t('vcStartH'))+'</span></div>';
  if(V.err)h+='<p class="vc-err" role="alert">'+esc(t(V.err))+'</p>';
  h+='</section>';
  /* keyboard + legend */
  h+='<div class="vc-kb" dir="ltr">'+kbSvg()+'</div><ul class="vc-lg">';
  if(u)h+='<li><i class="sw you"></i><span>'+esc(t('vcLgYou'))+'</span> '+ltr(noteName(u.lo)+'–'+noteName(u.hi))+'</li>';
  if(r&&r.ok)h+='<li><i class="sw song"></i><span>'+esc(t('vcLgSong'))+'</span> '+ltr(noteName(r.lo)+'–'+noteName(r.hi))+'</li>';
  if(V.sel)h+='<li><i class="sw new"></i><span>'+esc(t('vcLgNew'))+'</span> '+ltr(noteName(V.sel.lo)+'–'+noteName(V.sel.hi))+'</li>';
  if(V.test)h+='<li><i class="sw live"></i><span>'+esc(t('vcLive'))+'</span></li>';
  h+='</ul>';
  /* this song */
  h+='<section class="vc-sec" aria-labelledby="vcSongH"><h4 id="vcSongH">'+esc(t('vcSong'))+(song?' · <span class="vc-sn">'+esc(song.name)+'</span>':'')+'</h4>';
  if(!song)h+='<p class="vc-muted">'+esc(t('vcNoSong'))+'</p>';
  else if(V.songState==='run')h+='<p class="vc-muted">'+esc(t('vcSongAna'))+'</p><div class="vc-sprog" role="progressbar" aria-label="'+esc(t('vcSongAna'))+'"><i style="width:'+Math.round(V.prog*100)+'%"></i></div>';
  else if(V.songState==='fail')h+='<p class="vc-muted">'+esc(t('vcSongFail'))+'</p>';
  else if(r&&r.ok){
    h+='<p class="vc-srange"><b>'+esc(t('vcSongR'))+':</b> '+ltr(noteName(r.lo)+' – '+noteName(r.hi))+' <span class="vc-tag'+(r.est?' est':'')+'" title="'+esc(r.est?t('vcEstT'):'')+'">'+esc(r.est?t('vcEst'):t('vcFromVoc'))+'</span></p>';
    if(r.est)h+='<p class="vc-note">'+esc(t('vcEstT'))+'</p>';
    if(!u)h+='<p class="vc-muted">'+esc(t('vcNeedYou'))+'</p>';
    else if(V.rec&&V.rec.length){
      const best=V.rec[0];h+=optHtml(best,true,cur);
      if(V.rec.length>1)h+='<h5>'+esc(t('vcAlt'))+'</h5><div class="vc-alts">'+V.rec.slice(1).map(o=>optHtml(o,false,cur)).join('')+'</div>';
    }
  }
  h+='<p class="vc-live" role="status" aria-live="polite">'+esc(V.msg||'')+'</p></section>';
  const ae=document.activeElement,had=box.contains(ae),fa=had&&ae.dataset?ae.dataset.a:null,fsh=had&&ae.dataset?ae.dataset.sh:null;
  box.innerHTML=h;kbKeys=null;if(V.test)V.test.msgKey=''; // fresh status element → the next frame writes it again
  if(had){const e=fa&&box.querySelector('[data-a="'+fa+'"]'+(fsh!=null?'[data-sh="'+fsh+'"]':''));(e||box.querySelector('.x')).focus()} // keep keyboard focus
}
function keyTxt(o){return CR.keyText({pc:o.pc,mode:o.mode})}
function optHtml(o,best,cur){
  const k=keyTxt(o),oct=o.k<0?t('vcOctDown'):o.k>0?t('vcOctUp'):'';
  const fit=o.below&&o.above?'vcFitBoth':o.below?'vcFitLo':o.above?'vcFitHi':'vcFitOk';
  const here=o.sh===cur,sh='<span class="vc-sh">'+(o.sh?ltr(shTxt(o.sh)):esc(t('vcOrig')))+'</span>';
  const head=best?'<div class="vc-rec-h">'+esc(t('vcRec',{k:'\u2066'+k+'\u2069'}))+' '+sh+'</div>'
    :'<div class="vc-alt-h"><b dir="ltr">'+esc(k)+'</b> '+sh+'</div>';
  return '<div class="'+(best?'vc-rec':'vc-alt')+'">'+head+
    '<p class="vc-fit">'+(oct?esc(oct)+' · ':'')+esc(t(fit))+' '+ltr(noteName(o.lo)+'–'+noteName(o.hi))+'</p>'+
    (here?'<p class="vc-ok">'+esc(V.applied===o.sh?t('vcApplied',{k}):t('vcHere'))+'</p>'
      :'<button type="button" class="btn '+(best?'solid':'ghost')+' vc-apply" data-a="apply" data-sh="'+o.sh+'" aria-label="'+esc(t('vcApply')+': '+k)+'">'+esc(best?t('vcApply'):t('vcApplyS'))+'</button>')+'</div>';
}

/* ---------- the test ---------- */
function testHtml(){
  const T=V.test,st=T.step,title=['vcS1','vcS2','vcS3'][st-1];
  let h='<div class="vc-test"><p class="vc-step">'+esc(t('vcStep',{n:st,m:3}))+'</p><p class="vc-sth">'+esc(t(title))+'</p><p>'+esc(t(title+'H'))+'</p>'+
    '<div class="vc-meter"><div class="vc-note-live" dir="ltr" aria-hidden="true">—</div><div class="vc-lvl" aria-hidden="true"><i></i></div><div class="vc-bar" aria-hidden="true"><i></i></div></div>'+
    '<p class="vc-stat" role="status" aria-live="polite">'+esc(T.starting?t('vcStarting'):t('vcListen'))+'</p><div class="vc-row">';
  if(st<3)h+='<button type="button" class="btn solid" data-a="next" disabled>'+esc(t('vcNext'))+'</button>';
  else h+='<button type="button" class="btn solid" data-a="finish" disabled>'+esc(t('vcFinish'))+'</button><button type="button" class="btn ghost" data-a="skip">'+esc(t('vcSkip'))+'</button>';
  h+='<button type="button" class="btn ghost" data-a="redo">'+esc(t('vcRedo'))+'</button><button type="button" class="btn ghost" data-a="cancel">'+esc(t('vcCancel'))+'</button></div></div>';
  return h;
}
function newStep(st){const T=V.test;Object.assign(T,{step:st,vals:[],frames:0,lev:0,voiced:0,t:0,sv:0,first:-1,msgKey:''});MIC.acc=[];MIC.raw=[]}
async function startTest(){
  V.err='';V.msg='';if(CR.stopTool)CR.stopTool();
  V.test={step:1,starting:true,res:{}};newStep(1);render();
  try{await micStart(tick)}catch(e){micStop();if(!V.test)return;V.test=null;V.err=(e&&e.vc)||'vcMicFail';render();return}
  if(!V.open||!V.test){micStop();return}
  V.test.starting=false;newStep(1);render();
}
function stopTest(){micStop();V.test=null;kbKeys=null}
function tick(f,dt){
  const T=V.test;if(!T||!box||T.starting)return;
  T.frames++;T.t+=dt;if(f.rms>0.006)T.lev++;if(f.m!=null)T.voiced++;
  if(f.steady){T.vals.push(f.m);T.sv+=dt;if(T.first<0)T.first=T.t}
  const q=s=>box.querySelector(s),nl=q('.vc-note-live'),lv=q('.vc-lvl i'),bar=q('.vc-bar i'),stat=q('.vc-stat');
  if(nl)nl.textContent=f.m!=null?noteName(f.m):'—';
  if(lv)lv.style.width=Math.min(100,Math.round(Math.sqrt(f.rms/0.25)*100))+'%';
  kbLive(f.m);
  const secs=T.sv,el=T.t;
  let key='',arg={};
  if(T.step<3){
    if(bar)bar.style.width=Math.min(100,Math.round(secs/NEED*100))+'%';
    const nb=q('[data-a="next"]');if(nb)nb.disabled=secs<MIN_NEXT;
    if(secs>=NEED){key='vcGot';arg={n:'\u2066'+noteName(pct(T.vals,T.step===1?0.25:0.75))+'\u2069'}}
    else if(secs>0.1&&f.m!=null){key='vcHold';arg={s:secs.toFixed(1)}}
  }else{
    const left=T.first>=0?Math.max(0,SONG_T-(T.t-T.first)):SONG_T;
    if(bar)bar.style.width=Math.round((1-left/SONG_T)*100)+'%';
    const fb=q('[data-a="finish"]');if(fb)fb.disabled=secs<2;
    if(T.first>=0){key='vcLeft';arg={s:Math.ceil(left)}}
    if(T.first>=0&&left<=0){finishTest(true);return}
  }
  /* friendly problems (checked over the last few seconds of this step) */
  if(!key||key==='vcLeft'){
    if(el>6&&T.lev<T.frames*0.1&&secs<0.3)key='vcSilent'; // absolute level: steady noise lifts the adaptive gate
    else if(el>5&&T.lev>T.frames*0.5&&T.voiced<T.lev*0.15&&secs<0.3)key='vcNoisy';
  }
  if(!key)key='vcListen';
  const txt=t(key,arg);if(stat&&T.msgKey!==txt){stat.textContent=txt;T.msgKey=txt}
  if(V.hook)V.hook(T,f); // tests only (drives the steps in audio time)
}
function stepValue(T){return T.sv>=MIN_NEXT?Math.round(pct(T.vals,T.step===1?0.25:0.75)):null}
function next(){
  const T=V.test;if(!T)return;const v=stepValue(T);if(v==null)return;
  if(T.step===1){T.res.lo=v;newStep(2)}
  else if(T.step===2){T.res.hi=v;
    if(T.res.hi-T.res.lo<3){T.res={};newStep(1);render();setStat(t('vcNarrow'));return}
    newStep(3)}
  render();
}
function setStat(s){const e=box&&box.querySelector('.vc-stat');if(e){e.textContent=s;if(V.test)V.test.msgKey=s}}
function finishTest(useSong){
  const T=V.test;if(!T)return;let {lo,hi}=T.res;
  if(useSong&&T.sv>=2){lo=Math.min(lo,Math.round(pct(T.vals,0.1)));hi=Math.max(hi,Math.round(pct(T.vals,0.9)))}
  saveVoice({lo,hi,at:Date.now()});stopTest();V.applied=null;
  try{CR.log('voice_test','')}catch(e){}
  V.msg=t('vcRange')+': '+noteName(lo)+' – '+noteName(hi)+' · '+t(voiceType(lo,hi));
  render();const b=box.querySelector('[data-a="start"]');if(b)b.focus();
}
function onClick(e){
  const b=e.target.closest('[data-a]');if(!b||b.disabled)return;const a=b.dataset.a;
  if(a==='close')close();
  else if(a==='start')startTest();
  else if(a==='cancel'){stopTest();render()}
  else if(a==='redo'){if(V.test){newStep(V.test.step);render()}}
  else if(a==='next')next();
  else if(a==='finish')finishTest(true);
  else if(a==='skip')finishTest(false);
  else if(a==='apply'){const sh=+b.dataset.sh;if(CR.setTranspose&&CR.setTranspose(sh)){V.applied=sh;const o=V.rec&&V.rec.find(x=>x.sh===sh);V.msg=o?t('vcApplied',{k:keyTxt(o)}):'';render();
      const f=box.querySelector('.vc-ok')||box.querySelector('.x');if(f&&f.tagName!=='BUTTON')f.setAttribute('tabindex','-1');if(f)f.focus()}}
}

/* ---------- wiring ---------- */
mkButton();
new MutationObserver(()=>{btnLang();if(V.open)render()}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
document.addEventListener('cr-user',()=>{if(V.open)close()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&V.test){stopTest();if(V.open)render()}});
window.addEventListener('hashchange',()=>{if(V.open)close()});

window.VOICE={open,close,recommend,voiceType,noteName,songRange,songWork,yinFrame,loadVoice,micOn:()=>!!(MIC.stream&&MIC.stream.getTracks().some(x=>x.readyState==='live')),_V:V};
})();
