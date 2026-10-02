/*
 * Crate (#crate): batch analysis for DJs. Drop many files (or a folder) → BPM / key / Camelot / length / LUFS / energy
 * for each, sortable + filterable table, "smart order" into a harmonic set, exports (CSV, rekordbox XML, M3U8,
 * renamed copies ZIP with ID3 TBPM/TKEY for MP3s). Runs fully in the browser, talks to the app only through window.CR.
 * Files are decoded and analysed one at a time (CR.analyzeTrack runs on the main thread) and every decoded buffer is
 * dropped right after its analysis. Only the results (never the audio) are kept in localStorage.
 *
 * Energy 1–10 is a deliberately simple estimate:
 *   L = loudness  (LUFS −20 → 0 … −6 → 1)
 *   T = tempo     (80 BPM → 0 … 140 BPM → 1)
 *   D = busyness  (sum of positive steps of the peak-normalised waveform envelope per second, 2.5/s → 0 … 7.5/s → 1)
 *   energy = round(1 + 9 × (0.5 L + 0.3 T + 0.2 D))
 */
(function(){
'use strict';
const CR=window.CR;if(!CR)return;
const {t,$,esc,mod}=CR;

/* ---------- strings (he / en / ar / ru / es) ---------- */
CR.addStrings({
he:{navCrate:'ניתוח ספרייה',navCrateS:'ספרייה',crEyebrow:'ניתוח מרוכז · בדפדפן שלך',crTitle:'ניתוח ספרייה',
  crSub:'גוררים תיקייה של שירים ומקבלים לכולם BPM, סולם, אורך, עוצמה ואנרגיה. ממיינים, בונים סט הרמוני ומייצאים ל־rekordbox, לאקסל או לפלייליסט.',
  crDropT:'גרור לכאן קבצי אודיו או תיקייה שלמה',crDropH:'MP3, WAV, M4A, AAC, FLAC, OGG, AIFF · עד {n} קבצים · שום דבר לא עולה לשרת, הכול רץ אצלך במחשב',
  crPathHint:'לייצוא ל־rekordbox תתבקש להקליד את נתיב התיקייה במחשב (הדפדפן לא יכול לראות אותו).',
  crFiles:'בחירת קבצים',crFolder:'בחירת תיקייה',crDropping:'שחרר כדי להוסיף לרשימה',crMoreH:'אפשר לגרור עוד קבצים או תיקייה לכל מקום בעמוד',
  crProg:'מנתח {i} מתוך {n}',crStop:'עצירה',crResume:'לנתח את {n} הנותרים',crClear:'ניקוי',crClearSure:'ללחוץ שוב לניקוי',
  sTracks:'שירים',sRange:'טווח BPM',sKeyTop:'סולם נפוץ',sTime:'זמן כולל',
  crSearch:'סינון לפי שם',crAllKeys:'כל הסולמות',crCompat:'מתאימים ל: {name}',crCompatT:'להציג שירים שמתחברים לשיר הזה (סולם תואם, קצב בטווח 6%)',crShowAll:'הצג הכול',
  crSmart:'סידור חכם',crSmartT:'בונה סט: מתחיל מהשיר שנבחר (או הרגוע ביותר), וכל שיר הבא נבחר לפי סולם, קצב ועלייה הדרגתית באנרגיה',crSmartDone:'סודר כסט שמתחיל ב־{name}.',crSmartNeed:'צריך לפחות שני שירים מנותחים.',
  colName:'שיר',colFile:'קובץ',colKey:'סולם',colLen:'אורך',colEnergy:'אנרגיה',colStatus:'מצב',crSortBy:'מיון',crSetOrder:'סדר הסט',
  crEnergyT:'אנרגיה 1–10: הערכה גסה לפי עוצמה (LUFS), קצב וצפיפות הביט',
  crOpen:'פתיחה בכלי',crOpenNo:'צריך להוסיף את הקובץ שוב כדי לפתוח אותו',crHalf:'חצי BPM',crDouble:'כפול BPM',crRemove:'הסרה',crStartT:'להתחיל את הסט מהשיר הזה',crStartTag:'פתיחה',
  stQ:'ממתין',stDec:'טוען…',stAna:'מנתח…',stErr:'לא הצלחנו לקרוא את הקובץ',stBig:'גדול מדי (מעל 250 MB)',stPause:'נעצר',stSaved:'תוצאה שמורה · הקובץ לא טעון',
  crDup:'{n} כפולים דולגו.',crBad:'{n} קבצים שאינם אודיו דולגו.',crLim:'הגעת למגבלה: עד {n} קבצים.',crReatt:'{n} שורות שמורות קיבלו את הקובץ בחזרה.',
  mxGood:'מתחבר טוב לשיר הקודם',mxTempo:'הסולמות מתאימים, פער קצב {p}%',mxBad:'הסולם מתנגש עם השיר הקודם',
  crExport:'ייצוא',crExportN:'{n} שירים, בסדר שמוצג',crCsv:'CSV (אקסל)',crXml:'rekordbox XML',crM3u:'פלייליסט M3U8',crZip:'עותקים עם שם חדש (ZIP)',crZipT:'עותקים בשם "Am - 124 - שם", ולקובצי MP3 נכתבים תגי BPM וסולם',
  crFolderL:'התיקייה במחשב שלך',crFolderP:'למשל C:\\Music\\My set או /Users/me/Music/My set',
  crFolderH:'rekordbox צריך לדעת איפה הקבצים נמצאים: הקלד את הנתיב המלא של התיקייה שבחרת (או של התיקייה שבה הקבצים). שמות הקבצים מתווספים אחריו.',
  crXmlDone:'קובץ ה־XML נשמר. ב־rekordbox: Preferences › Advanced › rekordbox xml, בוחרים את הקובץ ומייבאים את הפלייליסט "Chord Room".',
  crXmlNoFolder:'לא הוזן נתיב תיקייה, ולכן rekordbox לא ימצא את הקבצים. הקלד אותו למעלה וייצא שוב.',
  crZipBig:'קובץ ה־ZIP שוקל {s} MB ונבנה בזיכרון. זה עלול להיות איטי או להיכשל במכשיר הזה.',crZipGo:'לבנות בכל זאת',
  crZipNo:'{n} שורות שמורות בלי קובץ טעון לא נכללו. הוסף את הקבצים שוב כדי לכלול אותן.',crZipNone:'אין קבצים טעונים להעתקה. הוסף את הקבצים שוב.',crZipBusy:'בונה ZIP… {p}%',crZipDone:'ה־ZIP מוכן ({s} MB).',
  crRestored:'תוצאות מהביקור הקודם. האודיו לא נשמר: כדי לפתוח שיר או ליצור עותקים, הוסף שוב את אותם קבצים.',
  crNoMatch:'אין שירים שמתאימים לסינון.',crNothing:'קודם צריך לנתח שירים.'},
en:{navCrate:'Crate',navCrateS:'Crate',crEyebrow:'Batch analysis · in your browser',crTitle:'Analyse your library',
  crSub:'Drop a folder of tracks and get BPM, key, length, loudness and energy for all of them. Sort, build a harmonic set and export to rekordbox, Excel or a playlist.',
  crDropT:'Drop audio files or a whole folder here',crDropH:'MP3, WAV, M4A, AAC, FLAC, OGG, AIFF · up to {n} files · nothing is uploaded, everything runs on your computer',
  crPathHint:'For the rekordbox export you\'ll type the folder\'s path on your computer (the browser can\'t see it).',
  crFiles:'Choose files',crFolder:'Choose folder',crDropping:'Drop to add to the crate',crMoreH:'Drop more files or a folder anywhere on this page',
  crProg:'Analysing {i} of {n}',crStop:'Stop',crResume:'Analyse the remaining {n}',crClear:'Clear',crClearSure:'Click again to clear',
  sTracks:'Tracks',sRange:'BPM range',sKeyTop:'Top key',sTime:'Total time',
  crSearch:'Filter by name',crAllKeys:'All keys',crCompat:'Mixes with: {name}',crCompatT:'Show tracks that mix with this one (compatible key, tempo within 6 %)',crShowAll:'Show all',
  crSmart:'Smart order',crSmartT:'Builds a DJ set: starts from the selected track (or the calmest), then picks each next track by key, tempo and a gentle energy rise',crSmartDone:'Ordered as a set starting with {name}.',crSmartNeed:'Analyse at least two tracks first.',
  colName:'Track',colFile:'File',colKey:'Key',colLen:'Length',colEnergy:'Energy',colStatus:'Status',crSortBy:'Sort',crSetOrder:'Set order',
  crEnergyT:'Energy 1–10: a rough estimate from loudness (LUFS), tempo and how busy the beat is',
  crOpen:'Open in tool',crOpenNo:'Add the file again to open it',crHalf:'Half BPM',crDouble:'Double BPM',crRemove:'Remove',crStartT:'Start the set from this track',crStartTag:'Start',
  stQ:'Waiting',stDec:'Loading…',stAna:'Analysing…',stErr:'Couldn\'t read this file',stBig:'Too large (over 250 MB)',stPause:'Stopped',stSaved:'Saved result · file not loaded',
  crDup:'{n} duplicates skipped.',crBad:'{n} non-audio files skipped.',crLim:'Limit reached: up to {n} files.',crReatt:'{n} saved rows got their file back.',
  mxGood:'Mixes well with the previous track',mxTempo:'Keys mix, tempo gap {p} %',mxBad:'Key clashes with the previous track',
  crExport:'Export',crExportN:'{n} tracks, in the order shown',crCsv:'CSV (Excel)',crXml:'rekordbox XML',crM3u:'M3U8 playlist',crZip:'Renamed copies (ZIP)',crZipT:'Copies named "Am - 124 - name"; MP3s also get BPM and key tags',
  crFolderL:'Folder on your computer',crFolderP:'e.g. C:\\Music\\My set or /Users/me/Music/My set',
  crFolderH:'rekordbox needs the real location of the files: type the full path of the folder you chose (or the one the files are in). File names are added after it.',
  crXmlDone:'rekordbox XML saved. In rekordbox: Preferences › Advanced › rekordbox xml, pick this file, then import the "Chord Room" playlist.',
  crXmlNoFolder:'No folder path set, so rekordbox won\'t find the files. Type it above and export again.',
  crZipBig:'The ZIP is {s} MB and is built in memory. It may be slow or fail on this device.',crZipGo:'Build anyway',
  crZipNo:'{n} saved rows have no file loaded and were left out. Add the files again to include them.',crZipNone:'No loaded files to copy. Add the files again.',crZipBusy:'Building the ZIP… {p}%',crZipDone:'ZIP ready ({s} MB).',
  crRestored:'Results from your last visit. The audio isn\'t kept: add the same files again to open them or make renamed copies.',
  crNoMatch:'No tracks match the filter.',crNothing:'Analyse some tracks first.'},
ar:{navCrate:'تحليل المكتبة',navCrateS:'المكتبة',crEyebrow:'تحليل دفعة واحدة · في متصفحك',crTitle:'تحليل المكتبة',
  crSub:'اسحب مجلدًا من الأغاني واحصل لكل منها على BPM والمقام والمدة والجهارة والطاقة. رتّب، وابنِ مجموعة متناغمة، وصدّر إلى rekordbox أو Excel أو قائمة تشغيل.',
  crDropT:'اسحب ملفات صوتية أو مجلدًا كاملًا إلى هنا',crDropH:'MP3, WAV, M4A, AAC, FLAC, OGG, AIFF · حتى {n} ملف · لا يُرفع شيء، كل شيء يعمل على جهازك',
  crPathHint:'لتصدير rekordbox ستكتب مسار المجلد على جهازك (المتصفح لا يستطيع رؤيته).',
  crFiles:'اختيار ملفات',crFolder:'اختيار مجلد',crDropping:'أفلت للإضافة إلى القائمة',crMoreH:'يمكنك سحب المزيد من الملفات أو مجلد إلى أي مكان في الصفحة',
  crProg:'تحليل {i} من {n}',crStop:'إيقاف',crResume:'تحليل المتبقي ({n})',crClear:'مسح',crClearSure:'اضغط مرة أخرى للمسح',
  sTracks:'أغانٍ',sRange:'نطاق BPM',sKeyTop:'المقام الأكثر شيوعًا',sTime:'المدة الكلية',
  crSearch:'تصفية بالاسم',crAllKeys:'كل المقامات',crCompat:'تتوافق مع: {name}',crCompatT:'إظهار الأغاني التي تمتزج مع هذه (مقام متوافق، إيقاع ضمن 6%)',crShowAll:'إظهار الكل',
  crSmart:'ترتيب ذكي',crSmartT:'يبني مجموعة DJ: يبدأ من الأغنية المختارة (أو الأهدأ)، ثم يختار كل أغنية تالية حسب المقام والإيقاع وارتفاع تدريجي في الطاقة',crSmartDone:'رُتّبت كمجموعة تبدأ بـ {name}.',crSmartNeed:'حلّل أغنيتين على الأقل أولًا.',
  colName:'الأغنية',colFile:'الملف',colKey:'المقام',colLen:'المدة',colEnergy:'الطاقة',colStatus:'الحالة',crSortBy:'ترتيب',crSetOrder:'ترتيب المجموعة',
  crEnergyT:'الطاقة 1–10: تقدير تقريبي من الجهارة (LUFS) والإيقاع وكثافة الضربات',
  crOpen:'فتح في الأداة',crOpenNo:'أضف الملف مرة أخرى لفتحه',crHalf:'نصف BPM',crDouble:'ضعف BPM',crRemove:'إزالة',crStartT:'ابدأ المجموعة من هذه الأغنية',crStartTag:'البداية',
  stQ:'في الانتظار',stDec:'تحميل…',stAna:'تحليل…',stErr:'تعذّرت قراءة الملف',stBig:'كبير جدًا (أكثر من 250 MB)',stPause:'متوقف',stSaved:'نتيجة محفوظة · الملف غير محمّل',
  crDup:'تم تخطي {n} ملفات مكررة.',crBad:'تم تخطي {n} ملفات ليست صوتية.',crLim:'بلغت الحد: حتى {n} ملف.',crReatt:'استعادت {n} صفوف محفوظة ملفاتها.',
  mxGood:'يمتزج جيدًا مع الأغنية السابقة',mxTempo:'المقامات متوافقة، فرق الإيقاع {p}%',mxBad:'المقام يتعارض مع الأغنية السابقة',
  crExport:'تصدير',crExportN:'{n} أغانٍ، بالترتيب المعروض',crCsv:'CSV (Excel)',crXml:'rekordbox XML',crM3u:'قائمة تشغيل M3U8',crZip:'نسخ بأسماء جديدة (ZIP)',crZipT:'نسخ باسم "Am - 124 - الاسم"، وتُكتب في ملفات MP3 وسوم BPM والمقام',
  crFolderL:'المجلد على جهازك',crFolderP:'مثلًا C:\\Music\\My set أو /Users/me/Music/My set',
  crFolderH:'يحتاج rekordbox إلى المكان الحقيقي للملفات: اكتب المسار الكامل للمجلد الذي اخترته (أو الذي توجد فيه الملفات). تُضاف أسماء الملفات بعده.',
  crXmlDone:'تم حفظ ملف XML. في rekordbox: Preferences › Advanced › rekordbox xml، اختر الملف ثم استورد قائمة "Chord Room".',
  crXmlNoFolder:'لم يُدخل مسار المجلد، لذا لن يجد rekordbox الملفات. اكتبه في الأعلى وصدّر مرة أخرى.',
  crZipBig:'حجم ZIP هو {s} MB ويُبنى في الذاكرة. قد يكون بطيئًا أو يفشل على هذا الجهاز.',crZipGo:'إنشاء على أي حال',
  crZipNo:'لم تُضمَّن {n} صفوف محفوظة بلا ملف محمّل. أضف الملفات مرة أخرى لتضمينها.',crZipNone:'لا توجد ملفات محمّلة للنسخ. أضف الملفات مرة أخرى.',crZipBusy:'جارٍ إنشاء ZIP… {p}%',crZipDone:'ملف ZIP جاهز ({s} MB).',
  crRestored:'نتائج من زيارتك السابقة. الصوت لا يُحفظ: أضف الملفات نفسها مرة أخرى لفتحها أو لإنشاء نسخ بأسماء جديدة.',
  crNoMatch:'لا توجد أغانٍ تطابق التصفية.',crNothing:'حلّل بعض الأغاني أولًا.'},
ru:{navCrate:'Анализ библиотеки',navCrateS:'Библиотека',crEyebrow:'Пакетный анализ · в браузере',crTitle:'Анализ библиотеки',
  crSub:'Перетащите папку с треками и получите BPM, тональность, длительность, громкость и энергию для каждого. Сортируйте, собирайте гармоничный сет и экспортируйте в rekordbox, Excel или плейлист.',
  crDropT:'Перетащите сюда аудиофайлы или целую папку',crDropH:'MP3, WAV, M4A, AAC, FLAC, OGG, AIFF · до {n} файлов · ничего не загружается, всё работает на вашем компьютере',
  crPathHint:'Для экспорта в rekordbox нужно будет ввести путь к папке на компьютере (браузер его не видит).',
  crFiles:'Выбрать файлы',crFolder:'Выбрать папку',crDropping:'Отпустите, чтобы добавить',crMoreH:'Можно перетащить ещё файлы или папку в любое место страницы',
  crProg:'Анализ {i} из {n}',crStop:'Стоп',crResume:'Проанализировать оставшиеся ({n})',crClear:'Очистить',crClearSure:'Нажмите ещё раз, чтобы очистить',
  sTracks:'Треков',sRange:'Диапазон BPM',sKeyTop:'Частая тональность',sTime:'Общее время',
  crSearch:'Фильтр по названию',crAllKeys:'Все тональности',crCompat:'Сочетается с: {name}',crCompatT:'Показать треки, которые сводятся с этим (совместимая тональность, темп в пределах 6 %)',crShowAll:'Показать все',
  crSmart:'Умный порядок',crSmartT:'Собирает DJ-сет: начинает с выбранного трека (или самого спокойного), затем выбирает следующий по тональности, темпу и плавному росту энергии',crSmartDone:'Упорядочено как сет, начиная с {name}.',crSmartNeed:'Сначала проанализируйте хотя бы два трека.',
  colName:'Трек',colFile:'Файл',colKey:'Тональность',colLen:'Длина',colEnergy:'Энергия',colStatus:'Статус',crSortBy:'Сортировка',crSetOrder:'Порядок сета',
  crEnergyT:'Энергия 1–10: грубая оценка по громкости (LUFS), темпу и плотности ритма',
  crOpen:'Открыть в инструменте',crOpenNo:'Добавьте файл снова, чтобы открыть его',crHalf:'BPM пополам',crDouble:'BPM ×2',crRemove:'Удалить',crStartT:'Начать сет с этого трека',crStartTag:'Старт',
  stQ:'В очереди',stDec:'Загрузка…',stAna:'Анализ…',stErr:'Не удалось прочитать файл',stBig:'Слишком большой (более 250 MB)',stPause:'Остановлено',stSaved:'Сохранённый результат · файл не загружен',
  crDup:'Пропущено дубликатов: {n}.',crBad:'Пропущено файлов не аудио: {n}.',crLim:'Достигнут предел: до {n} файлов.',crReatt:'Сохранённым строкам возвращены файлы: {n}.',
  mxGood:'Хорошо сводится с предыдущим треком',mxTempo:'Тональности сочетаются, разница темпа {p} %',mxBad:'Тональность конфликтует с предыдущим треком',
  crExport:'Экспорт',crExportN:'Треков: {n}, в показанном порядке',crCsv:'CSV (Excel)',crXml:'rekordbox XML',crM3u:'Плейлист M3U8',crZip:'Переименованные копии (ZIP)',crZipT:'Копии с именами "Am - 124 - название", в MP3 записываются теги BPM и тональности',
  crFolderL:'Папка на вашем компьютере',crFolderP:'например C:\\Music\\My set или /Users/me/Music/My set',
  crFolderH:'rekordbox нужно настоящее расположение файлов: введите полный путь к выбранной папке (или к папке с файлами). Имена файлов добавляются после него.',
  crXmlDone:'XML сохранён. В rekordbox: Preferences › Advanced › rekordbox xml, выберите файл и импортируйте плейлист "Chord Room".',
  crXmlNoFolder:'Путь к папке не указан, поэтому rekordbox не найдёт файлы. Введите его выше и экспортируйте снова.',
  crZipBig:'ZIP весит {s} MB и собирается в памяти. На этом устройстве это может быть медленно или не получиться.',crZipGo:'Всё равно собрать',
  crZipNo:'Сохранённые строки без загруженного файла пропущены: {n}. Добавьте файлы снова, чтобы их включить.',crZipNone:'Нет загруженных файлов для копирования. Добавьте файлы снова.',crZipBusy:'Сборка ZIP… {p}%',crZipDone:'ZIP готов ({s} MB).',
  crRestored:'Результаты прошлого визита. Аудио не сохраняется: добавьте те же файлы снова, чтобы открыть их или сделать переименованные копии.',
  crNoMatch:'Нет треков под фильтр.',crNothing:'Сначала проанализируйте треки.'},
es:{navCrate:'Biblioteca DJ',navCrateS:'Biblioteca',crEyebrow:'Análisis por lotes · en tu navegador',crTitle:'Analiza tu biblioteca',
  crSub:'Arrastra una carpeta de temas y obtén BPM, tonalidad, duración, sonoridad y energía de todos. Ordena, arma un set armónico y exporta a rekordbox, Excel o una playlist.',
  crDropT:'Arrastra aquí archivos de audio o una carpeta entera',crDropH:'MP3, WAV, M4A, AAC, FLAC, OGG, AIFF · hasta {n} archivos · no se sube nada, todo se ejecuta en tu equipo',
  crPathHint:'Para exportar a rekordbox escribirás la ruta de la carpeta en tu equipo (el navegador no puede verla).',
  crFiles:'Elegir archivos',crFolder:'Elegir carpeta',crDropping:'Suelta para añadir',crMoreH:'Puedes arrastrar más archivos o una carpeta a cualquier parte de la página',
  crProg:'Analizando {i} de {n}',crStop:'Detener',crResume:'Analizar los {n} restantes',crClear:'Vaciar',crClearSure:'Pulsa otra vez para vaciar',
  sTracks:'Temas',sRange:'Rango de BPM',sKeyTop:'Tonalidad más común',sTime:'Duración total',
  crSearch:'Filtrar por nombre',crAllKeys:'Todas las tonalidades',crCompat:'Mezcla con: {name}',crCompatT:'Mostrar temas que mezclan con este (tonalidad compatible, tempo dentro del 6 %)',crShowAll:'Mostrar todo',
  crSmart:'Orden inteligente',crSmartT:'Arma un set: empieza por el tema seleccionado (o el más tranquilo) y elige cada siguiente por tonalidad, tempo y una subida suave de energía',crSmartDone:'Ordenado como set empezando por {name}.',crSmartNeed:'Analiza al menos dos temas primero.',
  colName:'Tema',colFile:'Archivo',colKey:'Tonalidad',colLen:'Duración',colEnergy:'Energía',colStatus:'Estado',crSortBy:'Ordenar',crSetOrder:'Orden del set',
  crEnergyT:'Energía 1–10: estimación aproximada a partir de la sonoridad (LUFS), el tempo y la densidad del ritmo',
  crOpen:'Abrir en la herramienta',crOpenNo:'Añade el archivo otra vez para abrirlo',crHalf:'Mitad de BPM',crDouble:'Doble de BPM',crRemove:'Quitar',crStartT:'Empezar el set por este tema',crStartTag:'Inicio',
  stQ:'En espera',stDec:'Cargando…',stAna:'Analizando…',stErr:'No se pudo leer el archivo',stBig:'Demasiado grande (más de 250 MB)',stPause:'Detenido',stSaved:'Resultado guardado · archivo no cargado',
  crDup:'{n} duplicados omitidos.',crBad:'{n} archivos que no son audio omitidos.',crLim:'Límite alcanzado: hasta {n} archivos.',crReatt:'{n} filas guardadas recuperaron su archivo.',
  mxGood:'Mezcla bien con el tema anterior',mxTempo:'Las tonalidades encajan, diferencia de tempo {p} %',mxBad:'La tonalidad choca con el tema anterior',
  crExport:'Exportar',crExportN:'{n} temas, en el orden mostrado',crCsv:'CSV (Excel)',crXml:'rekordbox XML',crM3u:'Playlist M3U8',crZip:'Copias renombradas (ZIP)',crZipT:'Copias con nombre "Am - 124 - nombre"; en los MP3 se escriben etiquetas de BPM y tonalidad',
  crFolderL:'Carpeta en tu equipo',crFolderP:'p. ej. C:\\Music\\My set o /Users/me/Music/My set',
  crFolderH:'rekordbox necesita la ubicación real de los archivos: escribe la ruta completa de la carpeta que elegiste (o donde están los archivos). Los nombres se añaden después.',
  crXmlDone:'XML guardado. En rekordbox: Preferences › Advanced › rekordbox xml, elige el archivo e importa la playlist "Chord Room".',
  crXmlNoFolder:'No hay ruta de carpeta, así que rekordbox no encontrará los archivos. Escríbela arriba y exporta de nuevo.',
  crZipBig:'El ZIP pesa {s} MB y se crea en memoria. Puede ser lento o fallar en este dispositivo.',crZipGo:'Crear igualmente',
  crZipNo:'Se omitieron {n} filas guardadas sin archivo cargado. Añade los archivos otra vez para incluirlas.',crZipNone:'No hay archivos cargados para copiar. Añádelos otra vez.',crZipBusy:'Creando el ZIP… {p}%',crZipDone:'ZIP listo ({s} MB).',
  crRestored:'Resultados de tu última visita. El audio no se guarda: añade los mismos archivos otra vez para abrirlos o crear copias renombradas.',
  crNoMatch:'Ningún tema coincide con el filtro.',crNothing:'Analiza algunos temas primero.'}
});

CR.addStrings({
he:{crUsb:'USB לפיוניר · שמות באנגלית',crUsbT:'עותקים ששמם כתוב באותיות אנגליות לפי ההגייה (עופר לוי – אני חוזר ← \u2066Ofer Levi – Ani Chozer\u2069), כדי שיופיעו בנגנים ובקונטרולרים של Pioneer. ב־MP3 וב־FLAC מתורגמים גם שם השיר והאמן שבתוך הקובץ.',
  crUsbH:'השמות באנגלית מופיעים מתחת לכל שיר בעברית. אפשר לתקן כל שם (✎), והאתר זוכר את התיקון לפעם הבאה.',crPrefix:'להוסיף בתחילת השם סולם ו־BPM \u2066(Am - 124 - …)\u2069',
  crLatEdit:'עריכת השם באנגלית',crLatP:'Artist - Title',crLatSave:'שמירה',crLatCancel:'ביטול',crLatReset:'חזרה לתרגום האוטומטי',crLatLook:'מחפש את השמות הרשמיים של האמנים…',
  crUsbDone:'ה־ZIP מוכן ({s} MB). מחלצים ומעתיקים את הקבצים ל־USB (FAT32 או exFAT) ומכניסים לנגן.',crUsbOther:'{n} קבצים שאינם MP3/FLAC: רק שם הקובץ תורגם (התגיות שבתוכם נשארו).'},
en:{crUsb:'USB for Pioneer · English names',crUsbT:'Copies named in Latin letters by pronunciation (עופר לוי – אני חוזר → Ofer Levi – Ani Chozer) so they show on Pioneer players and controllers. In MP3 and FLAC the title and artist inside the file are converted too.',
  crUsbH:'The Latin name appears under every Hebrew track. Fix any name (✎) and it is remembered next time.',crPrefix:'Start the name with key and BPM (Am - 124 - …)',
  crLatEdit:'Edit the Latin name',crLatP:'Artist - Title',crLatSave:'Save',crLatCancel:'Cancel',crLatReset:'Back to the automatic name',crLatLook:'Looking up the artists\' official names…',
  crUsbDone:'ZIP ready ({s} MB). Unzip, copy the files to a USB stick (FAT32 or exFAT) and plug it into the player.',crUsbOther:'{n} files aren\'t MP3/FLAC: only their file name was converted (the tags inside stay).'},
ar:{crUsb:'USB لأجهزة Pioneer · أسماء بالإنجليزية',crUsbT:'نسخ بأسماء بالحروف اللاتينية حسب النطق (עופר לוי – אני חוזר ← \u2066Ofer Levi – Ani Chozer\u2069) لتظهر في مشغلات وأجهزة تحكم Pioneer. في MP3 وFLAC يُحوَّل أيضًا اسم الأغنية والفنان داخل الملف.',
  crUsbH:'يظهر الاسم اللاتيني تحت كل أغنية عبرية. يمكنك تصحيح أي اسم (✎) وسيُحفظ للمرة القادمة.',crPrefix:'ابدأ الاسم بالمقام وBPM \u2066(Am - 124 - …)\u2069',
  crLatEdit:'تعديل الاسم اللاتيني',crLatP:'Artist - Title',crLatSave:'حفظ',crLatCancel:'إلغاء',crLatReset:'العودة إلى الاسم التلقائي',crLatLook:'البحث عن الأسماء الرسمية للفنانين…',
  crUsbDone:'ملف ZIP جاهز ({s} MB). فك الضغط وانسخ الملفات إلى USB (FAT32 أو exFAT) وضعه في المشغل.',crUsbOther:'{n} ملفات ليست MP3/FLAC: حُوِّل اسم الملف فقط (بقيت الوسوم داخلها).'},
ru:{crUsb:'USB для Pioneer · латиницей',crUsbT:'Копии с названиями латиницей по произношению (עופר לוי – אני חוזר → Ofer Levi – Ani Chozer), чтобы они отображались на плеерах и контроллерах Pioneer. В MP3 и FLAC также переводятся название и исполнитель внутри файла.',
  crUsbH:'Латинское название показано под каждым треком на иврите. Любое можно исправить (✎) — исправление запомнится.',crPrefix:'Начинать имя с тональности и BPM (Am - 124 - …)',
  crLatEdit:'Изменить латинское название',crLatP:'Artist - Title',crLatSave:'Сохранить',crLatCancel:'Отмена',crLatReset:'Вернуть автоматическое название',crLatLook:'Ищем официальные имена исполнителей…',
  crUsbDone:'ZIP готов ({s} MB). Распакуйте, скопируйте файлы на USB (FAT32 или exFAT) и вставьте в плеер.',crUsbOther:'Файлов не MP3/FLAC: {n} — у них переведено только имя файла (теги внутри остались).'},
es:{crUsb:'USB para Pioneer · nombres en latín',crUsbT:'Copias con el nombre en letras latinas según la pronunciación (עופר לוי – אני חוזר → Ofer Levi – Ani Chozer) para que se vean en reproductores y controladores Pioneer. En MP3 y FLAC también se convierten el título y el artista dentro del archivo.',
  crUsbH:'El nombre en latín aparece bajo cada tema en hebreo. Puedes corregir cualquiera (✎) y se recordará.',crPrefix:'Empezar el nombre con tonalidad y BPM (Am - 124 - …)',
  crLatEdit:'Editar el nombre en latín',crLatP:'Artist - Title',crLatSave:'Guardar',crLatCancel:'Cancelar',crLatReset:'Volver al nombre automático',crLatLook:'Buscando los nombres oficiales de los artistas…',
  crUsbDone:'ZIP listo ({s} MB). Descomprime, copia los archivos a un USB (FAT32 o exFAT) y conéctalo al reproductor.',crUsbOther:'{n} archivos no son MP3/FLAC: solo se convirtió el nombre del archivo (las etiquetas internas quedan).'}
});

CR.addStrings({
he:{crNml:'Traktor NML',crNmlDone:'קובץ ה־NML נשמר. ב־Traktor: לגרור אותו לחלון ה־Playlists (או File › Import Collection). נקודות הקיו נכנסות יחד עם השירים.',
  crCuesH:'נקודות קיו אוטומטיות',crCuesT:'לכל שיר מנותח מסומנים קטעי השיר כנקודות קיו בצבעים קבועים, כדי לקפוץ לחלק הנכון בלי לזכור איפה הוא:',
  crCuesHow:'Serato ו־VirtualDJ: הנקודות כבר בתוך הקבצים שמורידים (העותקים ב־ZIP וב־USB, קובצי MP3) — גוררים ומנגנים. rekordbox לא קורא נקודות מתוך קבצים (הוא שומר אותן במאגר שלו), ולכן אצלו מייבאים פעם אחת את קובץ ה־XML. Traktor: דרך קובץ ה־NML.',
  crCuesOld:'לשירים שנותחו לפני העדכון אין נקודות קיו: מוסיפים אותם שוב.',crCueAt:'{k} · {t}'},
en:{crNml:'Traktor NML',crNmlDone:'NML saved. In Traktor, drag it onto the Playlists panel (or File › Import Collection). The cue points come in with the tracks.',
  crCuesH:'Automatic cue points',crCuesT:'Every analysed track gets its sections marked as cue points in fixed colours, so you jump to the right part without remembering where it is:',
  crCuesHow:'Serato and VirtualDJ: the cues are already inside the files you download (the MP3 copies in the ZIP and USB downloads), just drag and play. rekordbox doesn\'t read cue points from files (it keeps them in its own database), so there you import the XML once. Traktor: through the NML.',
  crCuesOld:'Tracks analysed before this update have no cue points: add them again.',crCueAt:'{k} · {t}'},
ar:{crNml:'Traktor NML',crNmlDone:'تم حفظ NML. في Traktor اسحبه إلى لوحة Playlists (أو File › Import Collection). تدخل نقاط الـ Cue مع الأغاني.',
  crCuesH:'نقاط Cue تلقائية',crCuesT:'تُعلَّم أجزاء كل أغنية محلَّلة كنقاط Cue بألوان ثابتة، لتقفز إلى الجزء الصحيح دون أن تتذكر مكانه:',
  crCuesHow:'Serato وVirtualDJ: النقاط موجودة داخل الملفات التي تنزّلها (نسخ MP3 في تنزيلات ZIP وUSB)، اسحب وشغّل. rekordbox لا يقرأ النقاط من الملفات (يحفظها في قاعدة بياناته)، لذا تستورد ملف XML مرة واحدة. Traktor: عبر ملف NML.',
  crCuesOld:'الأغاني التي حُلِّلت قبل هذا التحديث بلا نقاط Cue: أضفها مرة أخرى.',crCueAt:'{k} · {t}'},
ru:{crNml:'Traktor NML',crNmlDone:'NML сохранён. В Traktor перетащите его на панель Playlists (или File › Import Collection). Cue-точки придут вместе с треками.',
  crCuesH:'Автоматические cue-точки',crCuesT:'У каждого проанализированного трека части отмечены cue-точками постоянных цветов — прыгайте к нужной части, не запоминая, где она:',
  crCuesHow:'Serato и VirtualDJ: точки уже внутри скачанных файлов (копии MP3 в ZIP и USB) — просто перетащите и играйте. rekordbox не читает cue-точки из файлов (хранит их в своей базе), поэтому для него один раз импортируйте XML. Traktor: через NML.',
  crCuesOld:'У треков, проанализированных до обновления, cue-точек нет: добавьте их снова.',crCueAt:'{k} · {t}'},
es:{crNml:'Traktor NML',crNmlDone:'NML guardado. En Traktor, arrástralo al panel Playlists (o File › Import Collection). Los cue points llegan con los temas.',
  crCuesH:'Cue points automáticos',crCuesT:'Cada tema analizado lleva sus partes marcadas como cue points en colores fijos, para saltar a la parte justa sin recordar dónde está:',
  crCuesHow:'Serato y VirtualDJ: los cue points ya van dentro de los archivos que descargas (las copias MP3 del ZIP y del USB): arrastra y pincha. rekordbox no lee cue points de los archivos (los guarda en su propia base), así que allí importas el XML una vez. Traktor: con el NML.',
  crCuesOld:'Los temas analizados antes de esta actualización no tienen cue points: añádelos otra vez.',crCueAt:'{k} · {t}'}
});

/* points v2 (the dialog itself is in app.js) */
CR.addStrings({
he:{crPayT:'ניתוח {n} שירים',crUsbPayT:'USB לפיוניר · {n} שירים',crZipPayT:'עותקים עם שם חדש · {n} שירים',crUsbLeft:'{n} שירים לא נכללו (לא היו מספיק נקודות).',crUsbBad:'{n} קבצים לא נקראו, והנקודות שלהם הוחזרו.'},
en:{crPayT:'Analyse {n} songs',crUsbPayT:'USB for Pioneer · {n} songs',crZipPayT:'Renamed copies · {n} songs',crUsbLeft:'{n} songs were left out (not enough points).',crUsbBad:'{n} files couldn\'t be read; their points were returned.'},
ar:{crPayT:'تحليل {n} أغانٍ',crUsbPayT:'USB لأجهزة Pioneer · {n} أغانٍ',crZipPayT:'نسخ بأسماء جديدة · {n} أغانٍ',crUsbLeft:'لم تُضمَّن {n} أغانٍ (النقاط غير كافية).',crUsbBad:'تعذّرت قراءة {n} ملفات، وأُعيدت نقاطها.'},
ru:{crPayT:'Анализ: {n} песен',crUsbPayT:'USB для Pioneer · {n} песен',crZipPayT:'Переименованные копии · {n} песен',crUsbLeft:'Не вошло песен: {n} (не хватило баллов).',crUsbBad:'Не удалось прочитать файлов: {n}; баллы за них возвращены.'},
es:{crPayT:'Analizar {n} canciones',crUsbPayT:'USB para Pioneer · {n} canciones',crZipPayT:'Copias renombradas · {n} canciones',crUsbLeft:'{n} canciones quedaron fuera (no había puntos suficientes).',crUsbBad:'No se pudieron leer {n} archivos; te devolvimos sus puntos.'}
});
CR.addStrings({
he:{ovPlay:'ניגון',ovPause:'השהיה',ovGrid:'גריד',ovBeatM:'הזזת הגריד פעימה אחורה',ovBeatP:'הזזת הגריד פעימה קדימה',ovFineM:'הזזה עדינה אחורה (10ms)',ovFineP:'הזזה עדינה קדימה (10ms)',
  ovBarHere:'כאן מתחילה תיבה',ovReset:'איפוס',ovHint:'לחיצה על הגל מנגנת משם · גוררים דגל כדי להזיז נקודת קיו (נצמד לתיבות, Alt = חופשי)',ovDragT:'אפשר לגרור'},
en:{ovPlay:'Play',ovPause:'Pause',ovGrid:'Grid',ovBeatM:'Move the grid one beat back',ovBeatP:'Move the grid one beat forward',ovFineM:'Nudge back (10 ms)',ovFineP:'Nudge forward (10 ms)',
  ovBarHere:'A bar starts here',ovReset:'Reset',ovHint:'Click the waveform to play from there · drag a flag to move a cue (snaps to bars, Alt = free)',ovDragT:'drag to move'},
ar:{ovPlay:'تشغيل',ovPause:'إيقاف مؤقت',ovGrid:'الشبكة',ovBeatM:'تحريك الشبكة نبضة للخلف',ovBeatP:'تحريك الشبكة نبضة للأمام',ovFineM:'تحريك دقيق للخلف (10ms)',ovFineP:'تحريك دقيق للأمام (10ms)',
  ovBarHere:'هنا يبدأ مازورة',ovReset:'إعادة ضبط',ovHint:'انقر على الموجة للتشغيل من هناك · اسحب علمًا لتحريك نقطة Cue (تلتصق بالمازورات، Alt = حر)',ovDragT:'يمكن السحب'},
ru:{ovPlay:'Играть',ovPause:'Пауза',ovGrid:'Сетка',ovBeatM:'Сдвинуть сетку на долю назад',ovBeatP:'Сдвинуть сетку на долю вперёд',ovFineM:'Точно назад (10 мс)',ovFineP:'Точно вперёд (10 мс)',
  ovBarHere:'Здесь начинается такт',ovReset:'Сброс',ovHint:'Клик по волне — играть оттуда · перетащите флажок, чтобы сдвинуть cue (прилипает к тактам, Alt — свободно)',ovDragT:'можно перетащить'},
es:{ovPlay:'Reproducir',ovPause:'Pausa',ovGrid:'Rejilla',ovBeatM:'Mover la rejilla un tiempo atrás',ovBeatP:'Mover la rejilla un tiempo adelante',ovFineM:'Ajuste fino atrás (10 ms)',ovFineP:'Ajuste fino adelante (10 ms)',
  ovBarHere:'Aquí empieza un compás',ovReset:'Restablecer',ovHint:'Haz clic en la onda para sonar desde ahí · arrastra una bandera para mover un cue (se ajusta a compases, Alt = libre)',ovDragT:'se puede arrastrar'}
});

/* ---------- constants & state ---------- */
const LS_K='chordroom.crate.v1',MAX=300,MAX_BYTES=250*1024*1024,BIG_ZIP=500*1024*1024,LS_CAP=1000;
const AUDIO_EXT=['mp3','wav','m4a','aac','mp4','flac','ogg','oga','opus','aif','aiff'];
const ACCEPT='audio/*,'+AUDIO_EXT.map(e=>'.'+e).join(',');
/* rekordbox / ID3 TKEY key names by Camelot number (index 1–12), minor = A, major = B */
const RB_A=[,'Abm','Ebm','Bbm','Fm','Cm','Gm','Dm','Am','Em','Bm','F#m','Dbm'];
const RB_B=[,'B','F#','Db','Ab','Eb','Bb','F','C','G','D','A','E'];
const KIND={mp3:'MP3 File',wav:'WAV File',m4a:'M4A File',aac:'M4A File',mp4:'M4A File',flac:'FLAC File',aif:'AIFF File',aiff:'AIFF File',ogg:'OGG File',oga:'OGG File',opus:'OGG File'};
const COLS=[['n','#'],['name','colName'],['bpm','BPM'],['key','colKey'],['dur','colLen'],['lufs','LUFS'],['energy','colEnergy'],['st','colStatus']];
const SORTABLE=new Set(['n','name','bpm','key','dur','lufs','energy']);
const C={usbPre:(()=>{try{return localStorage.getItem('chordroom.crate.usbpre')==='1'}catch(e){return false}})(),editLat:null,built:false,visible:false,rows:[],sort:null,q:'',key:'',compat:null,sel:null,folder:'',running:false,cancel:false,cur:null,curP:0,
  msg:'',msgErr:false,msgAct:null,clearArm:0,seq:0,zipBusy:false};

const IC={
  files:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
  drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l9-5 9 5-9 5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/></svg>',
  smart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18c3 0 4-12 8-12s5 8 8 8"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="14" r="1.5"/></svg>',
  open:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  usb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8v6H8zM6 9h12v8a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z"/><path d="M10 5.5h.01M14 5.5h.01"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>'
};

/* ---------- helpers ---------- */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const byId=id=>C.rows.find(r=>r.id===id)||null;
const extOf=n=>{const m=/\.([^./\\]+)$/.exec(n||'');return m?m[1].toLowerCase():''};
const baseOf=n=>String(n||'').replace(/\.[^./\\]+$/,'');
const fmtB=b=>b==null?'—':Math.abs(b-Math.round(b))<0.05?String(Math.round(b)):b.toFixed(1);
const fmtLen=s=>{if(s==null)return '—';s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s/60)%60,x=s%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0')};
const camStr=k=>k?CR.camelot(k.pc,k.mode):'';            // internal only (matching / filter values)
const keyStr=k=>k?CR.keyText(k):'';                          // what people see: Am, F#m, Db
const camO=k=>k?CR.camOf(k):null;
const rbKey=k=>{if(!k)return '';const c=CR.camOf(k);return (c.l==='A'?RB_A:RB_B)[c.n]};
const mb=b=>(b/1048576).toFixed(b>=1048576*10?0:1);
const done=r=>r.st==='ok'&&r.bpm>0;
function nid(){return 'r'+Date.now().toString(36)+(C.seq++).toString(36)}
/* "01 - Artist - Title (Mix).mp3" → {artist,title}; also strips our own "Am - 124 - " prefix */
function parseName(fn){
  let b=baseOf(fn).trim();if(!/\s/.test(b))b=b.replace(/_/g,' ');
  b=b.replace(/^(?:\d{1,2}[AB]|[A-G][b#]?m?) - \d{2,3}(?:\.\d)? - /,'').replace(/^\d{1,3}\s*[-.)_]\s*(?=\S)/,'').trim();
  const m=/^(.+?)\s+[-–—]\s+(.+)$/.exec(b);
  return m?{artist:m[1].trim(),title:m[2].trim()}:{artist:'',title:b};
}
/* energy (see header) */
function fluxOf(w,dur){
  if(!w||!w.amp||!dur)return null;const a=w.amp;let s=0;
  for(let i=1;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)s+=d}
  return s/dur;
}
function energyOf(r){
  if(r.lufs==null||!isFinite(r.lufs)||!r.bpm)return null;
  const L=clamp((r.lufs+20)/14,0,1),T=clamp((r.bpm-80)/60,0,1),D=r.flux==null?0.5:clamp((r.flux-2.5)/5,0,1);
  return clamp(Math.round(1+9*(0.5*L+0.3*T+0.2*D)),1,10);
}
/* how well b follows a: 'good' (Camelot neighbour + tempo ≤6 %), 'tempo' (keys fit, bigger tempo gap), 'bad' (key clash) */
function mixOf(a,b){
  if(!done(a)||!done(b)||!a.key||!b.key)return null;
  const rel=CR.camRel(camO(a.key),camO(b.key)),fit=CR.bpmFit(a.bpm,b.bpm);
  if(rel<0)return {k:'bad',fit};
  return {k:fit<=0.06?'good':'tempo',fit};
}
function compatible(a,b){return a===b||(done(a)&&done(b)&&a.key&&b.key&&CR.camRel(camO(a.key),camO(b.key))>=0&&CR.bpmFit(a.bpm,b.bpm)<=0.06)}

/* ---------- persistence (results only, never audio) ---------- */
const r3=x=>x==null?null:Math.round(x*1000)/1000;
/* every account keeps its own crate on this browser (guest = signed out) */
C.owner=undefined;
const lsKey=()=>LS_K+':'+(C.owner||'guest');
function save(){
  if(C.owner===undefined)return;              // not known yet who is signed in
  try{
    const rows=C.rows.filter(done).slice(0,LS_CAP).map(r=>({id:r.id,name:r.name,rel:r.rel,size:r.size,ext:r.ext,dur:r3(r.dur),lufs:r3(r.lufs),peak:r3(r.peak),
      bpm:r3(r.bpm),bpm0:r3(r.bpm0),offset:r3(r.offset),down:r.down||0,key:r.key,flux:r3(r.flux),...(r.lat?{lat:r.lat}:{}),...(r.cues?{cues:r.cues}:{}),...(r.wv?{wv:r.wv}:{}),...(r.gsh?{gsh:r3(r.gsh)}:{})}));
    localStorage.setItem(lsKey(),JSON.stringify({v:1,folder:C.folder,sort:C.sort,sel:C.sel,rows}));
  }catch(e){}
}
/* rows read back from localStorage are data, never markup: keep only the expected fields with the expected types
   (ids and numbers go into HTML attributes/styles unescaped, so a tampered entry must not reach them as text) */
function cleanRow(r){
  if(!r||typeof r!=='object')return null;
  const str=(v,n)=>typeof v==='string'?v.slice(0,n):'',num=v=>typeof v==='number'&&isFinite(v)?v:null;
  const x={id:typeof r.id==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(r.id)?r.id:nid(),name:str(r.name,400),rel:str(r.rel,1000),size:num(r.size),ext:str(r.ext,10).replace(/[^a-z0-9]/gi,''),
    dur:num(r.dur),lufs:num(r.lufs),peak:num(r.peak),bpm:num(r.bpm),bpm0:num(r.bpm0),offset:num(r.offset),down:num(r.down)||0,flux:num(r.flux)};
  if(r.key&&Number.isInteger(r.key.pc)&&r.key.pc>=0&&r.key.pc<12)x.key={pc:r.key.pc,mode:r.key.mode?1:0};
  if(r.lat&&typeof r.lat==='object')x.lat={artist:str(r.lat.artist,300),title:str(r.lat.title,300)};
  if(Array.isArray(r.cues))x.cues=r.cues.filter(c=>c&&typeof c.k==='string'&&num(c.t)!=null).slice(0,32).map(c=>({...c,k:c.k,t:c.t}));
  if(r.wv&&typeof r.wv.a==='string'&&typeof r.wv.c==='string')x.wv={a:r.wv.a,c:r.wv.c};
  if(num(r.gsh)!=null)x.gsh=r.gsh;
  return x;
}
function load(){
  C.rows=[];C.sel=null;C.compat=null;C.sort=null;C.folder='';C.q='';C.key='';C.editLat=null;
  try{
    // the crate used to be shared by everyone on the browser: it goes to the first account that signs in here
    if(C.owner&&localStorage.getItem(LS_K)!=null&&localStorage.getItem(lsKey())==null){localStorage.setItem(lsKey(),localStorage.getItem(LS_K))}
    if(C.owner)localStorage.removeItem(LS_K);
    const o=JSON.parse(localStorage.getItem(lsKey())||'null');if(!o||o.v!==1||!Array.isArray(o.rows))return;
    C.folder=typeof o.folder==='string'?o.folder:'';
    C.sort=o.sort&&SORTABLE.has(o.sort.k)?{k:o.sort.k,dir:o.sort.dir<0?-1:1}:null;
    C.rows=o.rows.map(cleanRow).filter(r=>r&&r.name&&r.bpm>0).map(r=>{const x={...r,st:'ok',file:null,p:1};x.energy=energyOf(x);return x});
    C.sel=o.sel&&byId(o.sel)?o.sel:null;
  }catch(e){}
}

/* ---------- adding files ---------- */
function isAudio(f){return AUDIO_EXT.includes(extOf(f.name))||/^audio\//.test(f.type||'')}
function addFiles(list){
  let dup=0,bad=0,lim=0,re=0;
  for(const {file,rel} of list){
    if(!file||/^\._/.test(file.name))continue;
    if(!isAudio(file)){bad++;continue}
    const ex=C.rows.find(x=>x.name===file.name&&x.size===file.size);
    if(ex){if(!ex.file){ex.file=file;if(rel)ex.rel=rel;if(!done(ex))ex.st='q';re++}else dup++;continue}
    if(C.rows.length>=MAX){lim++;continue}
    C._batch=(C._batch||0)+1;
    C.rows.push({id:nid(),name:file.name,rel:rel||file.name,size:file.size,ext:extOf(file.name),file,st:'q',p:0});
  }
  const m=[];if(re)m.push(t('crReatt',{n:re}));if(dup)m.push(t('crDup',{n:dup}));if(bad)m.push(t('crBad',{n:bad}));if(lim)m.push(t('crLim',{n:MAX}));
  setMsg(m.join(' '),!!lim);
  renderAll();save();pump();
}
function fromInput(inp,folder){
  const fs=[...inp.files];inp.value='';
  addFiles(fs.map(f=>{let rel=f.name;if(folder&&f.webkitRelativePath){const p=f.webkitRelativePath.split('/');rel=p.length>1?p.slice(1).join('/'):f.webkitRelativePath}return {file:f,rel}}));
}
/* drag & drop, folders included (webkitGetAsEntry). One dropped folder → paths relative to it. */
function collect(dt){
  const items=[...(dt.items||[])].filter(i=>i.kind==='file'),ents=items.map(i=>i.webkitGetAsEntry?i.webkitGetAsEntry():null);
  const files=[...(dt.files||[])];
  if(!ents.length||ents.some(e=>!e)){addFiles(files.map(f=>({file:f,rel:f.name})));return}
  (async()=>{
    const out=[],one=ents.length===1;
    const fileOf=en=>new Promise((res,rej)=>en.file(res,rej));
    async function walk(dir,prefix){
      const rd=dir.createReader();
      for(;;){const batch=await new Promise((res,rej)=>rd.readEntries(res,rej));if(!batch.length)break;
        for(const en of batch){if(out.length>MAX*4)return;if(en.isFile){try{out.push({file:await fileOf(en),rel:prefix+en.name})}catch(e){}}else if(en.isDirectory)await walk(en,prefix+en.name+'/')}}
    }
    for(const en of ents){try{if(en.isFile)out.push({file:await fileOf(en),rel:en.name});else if(en.isDirectory)await walk(en,one?'':en.name+'/')}catch(e){console.warn(e)}}
    out.sort((a,b)=>a.rel.localeCompare(b.rel,undefined,{numeric:true}));
    addFiles(out);
  })();
}

/* ---------- analysis queue: one file at a time, buffer dropped after each ---------- */
/* points v2: analysing a new song costs the 'song' price once per account (any module). Before a row is analysed, all
   queued rows that were not approved yet are asked for in ONE confirmation (CR.paySongs: songs paid before are free);
   rows the user didn't approve (cancel / "only the first K") wait as 'pause' (Resume asks again). The point is spent per
   row only after its analysis worked (commit → spend_song), so a file that fails to decode never costs anything. */
async function approve(owner){
  const q=C.rows.filter(x=>x.st==='q'&&x.file&&!x.pay);if(!q.length)return;
  if(!CR.paySongs){q.forEach(r=>{r.pay={}});return}
  const g=await CR.paySongs(q.map(r=>({name:r.name,size:r.size,r})),{title:t('crPayT',{n:q.length})});
  if(C.owner!==owner)return;
  const ok=new Set(g.ok.map(x=>x.r));
  for(const r of q){if(ok.has(r))r.pay=g;else if(r.st==='q')r.st='pause'}
  const skip=q.length-ok.size;if(skip){setMsg(t('pvSkipped',{n:skip}),true);renderMsg()}
}
async function pump(){
  if(C.running||C.owner===undefined)return;C.running=true;C.cancel=false;const owner=C.owner;
  try{
    for(;;){
      if(C.cancel||C.owner!==owner)break;
      let r=C.rows.find(x=>x.st==='q'&&x.file);if(!r)break;
      if(!r.pay){await approve(owner);renderAll();continue}
      await analyzeRow(r);save();renderAll();await CR.tick();
    }
  }finally{C.running=false;C.cur=null;C.cancel=false;renderAll();save();lookupArtists();if(C.owner===owner&&C._batch){CR.log&&CR.log('crate_analyze',`${C._batch} tracks`);C._batch=0}}
}
async function analyzeRow(r){
  C.cur=r.id;C.curP=0;r.st='dec';r.p=0;renderRow(r);renderDeck();
  let buf=null;
  try{
    if(r.size>MAX_BYTES){r.st='err';r.err='stBig';return}
    buf=await CR.ac().decodeAudioData(await r.file.arrayBuffer());
    if(!C.rows.includes(r))return;
    r.st='ana';renderRow(r);
    const res=await CR.analyzeTrack(buf,p=>setP(r,p*0.9));
    if(!C.rows.includes(r))return;
    const g=r.pay;r.pay=null;
    if(g&&g.commit&&!(await g.commit({name:r.name,size:r.size}))){r.st='pause';r.p=0;buf=null;return}   // no points left → wait (Resume)
    r.wv=packWave(res.wave);
    Object.assign(r,{dur:res.dur,lufs:isFinite(res.lufs)?res.lufs:null,peak:isFinite(res.peak)?res.peak:null,bpm:res.bpm,bpm0:res.bpm,offset:res.offset,down:res.down||0,key:res.key||null,flux:fluxOf(res.wave,res.dur)});
    if(window.CUES&&r.bpm>0){try{r.cues=await CUES.detect(buf,res)}catch(e){console.warn('cues',r.name,e);r.cues=null}}
    buf=null;
    r.energy=energyOf(r);r.st=r.bpm>0?'ok':'err';r.err=r.st==='err'?'stErr':null;r.p=1;
  }catch(e){console.warn('crate',r.name,e);r.st='err';r.err='stErr'}
  finally{buf=null;if(C.cur===r.id)C.cur=null}
}
function setP(r,p){
  r.p=p;C.curP=p;
  const b=document.querySelector(`#crTab tr[data-id="${r.id}"] .rp i`);if(b)b.style.width=Math.round(p*100)+'%';
  renderProg();
}
function stop(){C.cancel=true;C.rows.forEach(r=>{if(r.st==='q')r.st='pause'});renderAll()}
function resume(){C.rows.forEach(r=>{if(r.st==='pause'&&r.file)r.st='q'});renderAll();pump()}

/* ---------- view model ---------- */
function sortVal(r,k,i){
  switch(k){
    case 'name':return parseName(r.name).title.toLowerCase();
    case 'bpm':return done(r)?r.bpm:null;
    case 'key':{const c=done(r)&&camO(r.key);return c?c.n*2+(c.l==='B'?1:0):null}
    case 'dur':return r.dur??null;
    case 'lufs':return r.lufs??null;
    case 'energy':return r.energy??null;
    default:return i;
  }
}
function view(){
  let list=C.rows.map((r,i)=>({r,i}));
  if(C.q){const q=C.q.toLowerCase();list=list.filter(({r})=>(r.name+' '+r.rel).toLowerCase().includes(q))}
  if(C.key)list=list.filter(({r})=>done(r)&&camStr(r.key)===C.key);
  const a=C.compat&&byId(C.compat);
  if(a)list=list.filter(({r})=>compatible(a,r));
  if(C.sort){const {k,dir}=C.sort;list=list.map(o=>({...o,v:sortVal(o.r,k,o.i)}));
    list.sort((x,y)=>{if(x.v==null&&y.v==null)return x.i-y.i;if(x.v==null)return 1;if(y.v==null)return -1;
      const c=typeof x.v==='string'?x.v.localeCompare(y.v,undefined,{numeric:true}):x.v-y.v;return c?c*dir:x.i-y.i})}
  if(a){const j=list.findIndex(o=>o.r===a);if(j>0)list.unshift(...list.splice(j,1))}
  return list.map(o=>o.r);
}
const exportRows=()=>view().filter(done);

/* ---------- smart order: greedy harmonic path with a gentle energy rise ---------- */
function stepCost(a,b,target){
  const rel=CR.camRel(camO(a.key),camO(b.key));
  const k=rel===0?0:rel===1?0.25:rel>=2?0.35:1.6;
  const f=CR.bpmFit(a.bpm,b.bpm),tp=f<=0.06?f/0.06*0.6:0.6+(f-0.06)*20;
  const ea=a.energy||5,eb=b.energy||5,de=eb-ea;
  const en=de<0?-de*0.3:de>2?(de-2)*0.25:0;
  return k+tp+en+Math.abs(eb-target)*0.08;
}
function smartOrder(){
  const ok=C.rows.filter(r=>done(r)&&r.key);
  if(ok.length<2){setMsg(t('crSmartNeed'),true);renderMsg();return}
  const rest=C.rows.filter(r=>!ok.includes(r));
  let cur=(C.sel&&ok.find(r=>r.id===C.sel))||ok.slice().sort((a,b)=>((a.energy||5)-(b.energy||5))||(a.bpm-b.bpm))[0];
  const left=new Set(ok),path=[cur];left.delete(cur);
  const e0=cur.energy||1,eMax=Math.max(...ok.map(r=>r.energy||1)),N=ok.length;
  while(left.size){
    const target=e0+(eMax-e0)*(path.length/(N-1));let best=null,bs=Infinity;
    for(const r of left){const s=stepCost(cur,r,target);if(s<bs){bs=s;best=r}}
    path.push(best);left.delete(best);cur=best;
  }
  C.rows=[...path,...rest];C.sort=null;C.compat=null;C.key='';C.q='';
  const si=$('#crQ');if(si)si.value='';
  setMsg(t('crSmartDone',{name:'\u2068'+parseName(path[0].name).title+'\u2069'}));
  save();renderAll();
}

/* ---------- exports ---------- */
const logExp=(kind,n)=>{if(CR.log)CR.log('crate_export',`${kind} · ${n} tracks`)};
// spreadsheet formula injection: a cell that starts with = + - @ (or a tab/CR) is opened as a formula by Excel/Sheets → prefix "'" unless it's a plain number
function csvCell(v){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s)&&!/^-?\d+(?:\.\d+)?$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function exportCsv(){
  const rows=exportRows();if(!rows.length){setMsg(t('crNothing'),true);renderMsg();return}
  const L=[[t('colName'),t('colFile'),'BPM',t('colKey'),t('colLen'),'LUFS',t('colEnergy')].map(csvCell).join(',')];
  for(const r of rows){const p=parseName(r.name);
    L.push([p.artist?p.artist+' - '+p.title:p.title,r.rel||r.name,fmtB(r.bpm),r.key?CR.keyText(r.key):'',fmtLen(r.dur),r.lufs!=null?r.lufs.toFixed(1):'',r.energy??''].map(csvCell).join(','))}
  CR.saveBlob(new Blob(['\uFEFF'+L.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}),'chord-room-crate.csv');logExp('csv',rows.length);
  setMsg('');renderMsg();
}
const xa=s=>String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function folderSegs(f){return String(f||'').trim().replace(/^file:\/\/(localhost)?\/?/i,'').replace(/\\/g,'/').split('/').filter(s=>s&&s!=='.')}
function locOf(r){
  const segs=[...folderSegs(C.folder),...String(r.rel||r.name).split('/').filter(Boolean)];
  return 'file://localhost/'+segs.map((s,i)=>i===0&&/^[A-Za-z]:$/.test(s)?s:encodeURIComponent(s)).join('/');
}
/* first downbeat of the grid, re-anchored if the user halved/doubled the BPM */
function gridStart(r){
  const T0=60/(r.bpm0||r.bpm),Tn=60/r.bpm,td=mod(r.offset||0,T0)+(r.down||0)*T0+(r.gsh||0);   // gsh = the user's grid move
  const ini=mod(td,Tn),k=Math.round((td-ini)/Tn);return {ini,beat:mod(-k,4)+1};
}
function exportXml(){
  const rows=exportRows();if(!rows.length){setMsg(t('crNothing'),true);renderMsg();return}
  const day=new Date().toISOString().slice(0,10),L=['<?xml version="1.0" encoding="UTF-8"?>','<DJ_PLAYLISTS Version="1.0.0">','  <PRODUCT Name="Chord Room" Version="1.0" Company="Chord Room"/>',`  <COLLECTION Entries="${rows.length}">`];
  rows.forEach((r,i)=>{const p=parseName(r.name),g=gridStart(r),bpm=r.bpm.toFixed(2);
    L.push(`    <TRACK TrackID="${i+1}" Name="${xa(p.title)}" Artist="${xa(p.artist)}" Composer="" Album="" Grouping="" Genre="" Kind="${xa(KIND[r.ext]||(r.ext||'').toUpperCase()+' File')}" Size="${r.size|0}" TotalTime="${Math.round(r.dur||0)}" DiscNumber="0" TrackNumber="0" Year="0" AverageBpm="${bpm}" DateAdded="${day}" BitRate="0" SampleRate="0" Comments="${xa(keyStr(r.key))}" PlayCount="0" Rating="0" Location="${xa(locOf(r))}" Remixer="" Tonality="${xa(rbKey(r.key))}" Label="" Mix="">`,
      `      <TEMPO Inizio="${g.ini.toFixed(3)}" Bpm="${bpm}" Metro="4/4" Battito="${g.beat}"/>`,...rbMarks(r),'    </TRACK>')});
  L.push('  </COLLECTION>','  <PLAYLISTS>','    <NODE Type="0" Name="ROOT" Count="1">',`      <NODE Name="Chord Room" Type="1" KeyType="0" Entries="${rows.length}">`);
  rows.forEach((r,i)=>L.push(`        <TRACK Key="${i+1}"/>`));
  L.push('      </NODE>','    </NODE>','  </PLAYLISTS>','</DJ_PLAYLISTS>');
  CR.saveBlob(new Blob([L.join('\n')+'\n'],{type:'application/xml'}),'chord-room-rekordbox.xml');logExp('rekordbox',rows.length);
  if(folderSegs(C.folder).length)setMsg(t('crXmlDone'));else setMsg(t('crXmlNoFolder'),true);
  renderMsg();
}
/* sec: ZIP names go through CR.zipName first (no CON/NUL…, control or bidi characters) so the M3U8 lines match the entries;
   one line per field — a CR/LF (or other control character) in a file name must not add playlist lines */
const m3l=x=>String(x??'').replace(/[\u0000-\u001F\u007F]+/g,' ').trim();
function m3u(rows,nameOf){
  const L=['#EXTM3U','#PLAYLIST:Chord Room'];
  for(const r of rows){const p=parseName(r.name);L.push(`#EXTINF:${Math.round(r.dur||0)},${p.artist?m3l(p.artist)+' - ':''}${m3l(p.title)}`,m3l(nameOf(r)))}
  return L.join('\n')+'\n';
}
function exportM3u(){
  const rows=exportRows();if(!rows.length){setMsg(t('crNothing'),true);renderMsg();return}
  CR.saveBlob(new Blob([m3u(rows,r=>r.rel||r.name)],{type:'audio/x-mpegurl'}),'chord-room-set.m3u8');logExp('m3u',rows.length);setMsg('');renderMsg();
}
function renamed(r){
  const safe=s=>s.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'').replace(/[\\/:*?"<>|\u0000-\u001F]/g,'_').replace(/\s+/g,' ').trim();
  const base=baseOf(r.name).replace(/^(?:\d{1,2}[AB]|[A-G][b#]?m?) - \d{2,3}(?:\.\d)? - /,'');
  return safe(`${keyStr(r.key)||'--'} - ${Math.round(r.bpm)} - ${base}`).slice(0,180)+(r.ext?'.'+r.ext:'');
}
async function exportZip(force){
  if(C.zipBusy)return;
  const all=exportRows(),rows=all.filter(r=>r.file),miss=all.length-rows.length;
  if(!rows.length){setMsg(all.length?t('crZipNone'):t('crNothing'),true);renderMsg();return}
  const total=rows.reduce((a,r)=>a+r.size,0);
  if(total>BIG_ZIP&&!force){setMsg(t('crZipBig',{s:mb(total)}),true,[t('crZipGo'),()=>exportZip(true)]);renderMsg();return}
  // points v2: the same folder price as "USB for Pioneer" ('usb' × songs, ONE charge: copies with cue points + tags);
  // files that can't be read and a ZIP that fails are refunded. Busy before asking (no double charge on a double click).
  C.zipBusy=true;renderExp();
  const pay=await folderPay(rows,t('crZipPayT',{n:rows.length}),t('crZip'));
  if(!pay){C.zipBusy=false;renderExp();return}
  let bad=0,ok=false;
  try{
    const files=[],used=new Set();let i=0;
    for(const r of rows){
      setMsg(t('crZipBusy',{p:Math.round(i/rows.length*100)}));renderMsg();await CR.tick();
      let nm=CR.zipName?CR.zipName(renamed(r)):renamed(r);if(used.has(nm.toLowerCase())){let k=2;const b=baseOf(nm);while(used.has(`${b} (${k}).${r.ext}`.toLowerCase()))k++;nm=`${b} (${k})`+(r.ext?'.'+r.ext:'')}
      used.add(nm.toLowerCase());r._zn=nm;
      let data;try{data=new Uint8Array(await r.file.arrayBuffer())}catch(e){console.warn('zip read',r.name,e);bad++;i++;used.delete(nm.toLowerCase());r._zn=null;continue}
      if(r.ext==='mp3')try{data=tagMp3(data,{bpm:String(Math.round(r.bpm)),key:rbKey(r.key),cam:keyStr(r.key),cues:cueList(r)})}catch(e){console.warn('id3',r.name,e)}
      files.push({name:nm,data});i++;
    }
    const inZip=rows.filter(r=>r._zn);if(!inZip.length)throw new Error('no files');
    files.push({name:'Chord Room.m3u8',data:new TextEncoder().encode(m3u(inZip,r=>r._zn))});
    setMsg(t('crZipBusy',{p:100}));renderMsg();await CR.tick();
    const blob=CR.zip(files);
    CR.saveBlob(blob,'chord-room-renamed.zip');logExp('zip',inZip.length);ok=true;
    const left=all.filter(r=>r.file).length-rows.length;
    setMsg(t('crZipDone',{s:mb(blob.size)})+(miss?' '+t('crZipNo',{n:miss}):'')+(left?' '+t('crUsbLeft',{n:left}):'')+(bad?' '+t('crUsbBad',{n:bad}):''),!!(miss||bad));
  }catch(e){console.error(e);setMsg(t('stErr'),true)}
  finally{C.zipBusy=false;renderExp();renderMsg();settle(pay,ok?bad:rows.length)}
}
/* points v2 helpers for the two folder exports: ask + charge 'usb' × rows (rows beyond "only the first K" are dropped from
   `rows`) → pay | null; settle(pay, failed) = refund the failed rows + close the crash journal (app.js settleN) */
async function folderPay(rows,title,ref){
  if(!CR.payN)return {qty:rows.length,id:null};
  let pay=null;try{pay=await CR.payN('usb',rows.length,{title,ref})}catch(e){console.warn(e);pay=null}
  if(!pay||!pay.qty)return null;
  if(pay.qty<rows.length)rows.splice(pay.qty);
  return pay;
}
function settle(pay,back){if(!pay)return;if(CR.settleN)CR.settleN(pay,back);else if(back>0&&pay.id&&CR.refundN)CR.refundN(pay,back)}

/* ---------- ID3v2: keep the existing tag's frames (v2.3 / v2.4), replace TBPM / TKEY, Camelot into the comment ---------- */
const ss=(u,p)=>((u[p]&127)<<21)|((u[p+1]&127)<<14)|((u[p+2]&127)<<7)|(u[p+3]&127);
const be=(u,p)=>((u[p]<<24)>>>0)+(u[p+1]<<16)+(u[p+2]<<8)+u[p+3];
const ssEnc=n=>[(n>>>21)&127,(n>>>14)&127,(n>>>7)&127,n&127];
const beEnc=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function readTag(u){
  const none={end:0,ver:3,frames:[]};
  if(u.length<10||u[0]!==73||u[1]!==68||u[2]!==51||u[6]>127||u[7]>127||u[8]>127||u[9]>127)return none;
  const maj=u[3],fl=u[5],size=ss(u,6),tagEnd=Math.min(u.length,10+size);
  const out={end:Math.min(u.length,10+size+(maj===4&&(fl&16)?10:0)),ver:3,frames:[]};
  if((maj!==3&&maj!==4)||(fl&128))return out; // v2.2 or whole-tag unsynchronisation → write a fresh v2.3 tag
  const parse=sync=>{
    let p=10;if(fl&64)p+=maj===3?4+be(u,10):ss(u,10);const fr=[];
    while(p+10<=tagEnd){
      if(u[p]===0)break; // padding
      const id=String.fromCharCode(u[p],u[p+1],u[p+2],u[p+3]);if(!/^[A-Z0-9]{4}$/.test(id))throw new Error('frame id');
      const n=sync?ss(u,p+4):be(u,p+4);if(p+10+n>tagEnd)throw new Error('frame size');
      fr.push({id,f1:u[p+8],f2:u[p+9],data:u.subarray(p+10,p+10+n)});p+=10+n;
    }
    return fr;
  };
  try{out.frames=parse(maj===4);out.ver=maj}
  catch(e){if(maj===4){try{out.frames=parse(false);out.ver=4}catch(e2){out.frames=[];out.ver=3}}else{out.frames=[];out.ver=3}}
  return out;
}
function decStr(enc,b){
  try{
    if(enc===0)return new TextDecoder('latin1').decode(b);
    if(enc===3)return new TextDecoder('utf-8').decode(b);
    if(enc===1)return new TextDecoder(b[0]===0xFE&&b[1]===0xFF?'utf-16be':'utf-16le').decode(b);
    if(enc===2)return new TextDecoder('utf-16be').decode(b);
  }catch(e){}
  return '';
}
function parseComm(d){
  const enc=d[0],lang=String.fromCharCode(d[1]||0,d[2]||0,d[3]||0),w=enc===1||enc===2?2:1;let q=4;
  while(q+w<=d.length){if(d[q]===0&&(w===1||d[q+1]===0))break;q+=w}
  return {enc,lang,desc:decStr(enc,d.subarray(4,q)).replace(/\0+$/,''),text:decStr(enc,d.subarray(Math.min(d.length,q+w))).replace(/\0+$/,'')};
}
const u16=s=>{const a=[0xFF,0xFE];for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a.push(c&255,c>>8)}return a};
const latin=s=>[...s].map(c=>c.charCodeAt(0)&255);
const encText=s=>/^[\x20-\x7E]*$/.test(s)?[0,...latin(s)]:[1,...u16(s)];
function tagMp3(u,{bpm,key,cam,lat,cues}){
  const T=readTag(u),ver=T.ver,keep=[];let old=null;
  const plain=f=>(f.f2&(ver===4?0x0F:0xC0))===0;   // not compressed / encrypted / unsynchronised
  for(let f of T.frames){
    if(f.id==='TBPM'||f.id==='TKEY')continue;
    if(cues&&cues.length&&isSeratoM2(f))continue;
    if(lat&&((f.id==='TIT2'&&lat.title)||(f.id==='TPE1'&&lat.artist)))continue;
    if(f.id==='COMM'&&plain(f)){const c=parseComm(f.data);if(c.desc==='Camelot')continue;if(c.desc===''&&!old){old=c;continue}
      if(lat&&hasHeb(c.text+c.desc)){const x=HL.translit(c.text);f={...f,data:new Uint8Array([1,...latin(/^[A-Za-z]{3}$/.test(c.lang)?c.lang:'eng'),...u16(HL.translit(c.desc)),0,0,...u16(x)])}}}
    else if(lat&&f.id[0]==='T'&&f.id!=='TXXX'&&plain(f)&&f.data.length>1){const x=decStr(f.data[0],f.data.subarray(1)).replace(/\0+$/,'');
      if(hasHeb(x))f={...f,data:new Uint8Array(encText(x.split('\0').map(v=>HL.translit(v)).join(' / ')))}}
    keep.push(f);
  }
  if(lat&&old&&hasHeb(old.text))old={...old,text:HL.translit(old.text)};
  let com=cam;
  if(old&&old.text){const rest=old.text.replace(/^(?:\d{1,2}[AB]|[A-G][b#]?m?)(?:\s*·\s*|\s*$)/,'').trim();if(rest)com=cam+' · '+rest}
  const lang=old&&/^[A-Za-z]{3}$/.test(old.lang)?old.lang:'eng';
  const add=[{id:'TBPM',data:[0,...latin(bpm)]}];
  if(lat&&lat.title)add.push({id:'TIT2',data:encText(lat.title)});
  if(lat&&lat.artist)add.push({id:'TPE1',data:encText(lat.artist)});
  if(key)add.push({id:'TKEY',data:[0,...latin(key)]});
  if(com)add.push({id:'COMM',data:[1,...latin(lang),...u16(''),0,0,...u16(com)]});
  if(cues&&cues.length)add.push({id:'GEOB',data:seratoGeob(cues)});
  const parts=[];let size=0;
  const push=(id,f1,f2,data)=>{const h=[...latin(id),...(ver===4?ssEnc(data.length):beEnc(data.length)),f1,f2];parts.push(new Uint8Array(h),data instanceof Uint8Array?data:new Uint8Array(data));size+=10+data.length};
  for(const f of keep)push(f.id,f.f1,f.f2,f.data);
  for(const f of add)push(f.id,0,0,f.data);
  const head=new Uint8Array([73,68,51,ver,0,0,...ssEnc(size)]),audio=u.subarray(T.end);
  const out=new Uint8Array(10+size+audio.length);let o=0;
  out.set(head,0);o=10;for(const p of parts){out.set(p,o);o+=p.length}out.set(audio,o);
  return out;
}

/* ---------- automatic cue points (assets/cues.js): A Intro · B Vocal · C Break · D Build · E Drop · F Outro ---------- */
const CU=window.CUES;
const cueList=r=>(CU&&Array.isArray(r.cues)?r.cues.filter(c=>CU.KINDS.includes(c.k)&&isFinite(c.t)):[]);
const letter=k=>String.fromCharCode(65+CU.slot(k));
function rbMarks(r){
  const L=[];
  for(const c of cueList(r)){const [R,G,B]=CU.COL[c.k],nm=xa(CU.NAME[c.k]),st=c.t.toFixed(3);
    L.push(`      <POSITION_MARK Name="${nm}" Type="0" Start="${st}" Num="${CU.slot(c.k)}" Red="${R}" Green="${G}" Blue="${B}"/>`,
      `      <POSITION_MARK Name="${nm}" Type="0" Start="${st}" Num="-1"/>`)}
  return L;
}
/* Serato reads its cues from the file: ID3 GEOB "Serato Markers2" (layout as documented by the serato-tags project) */
function seratoGeob(cues){
  const enc=new TextEncoder(),d=[1,1];
  const entry=(name,data)=>{d.push(...enc.encode(name),0,...beEnc(data.length),...data)};
  entry('COLOR',[0,0xFF,0xFF,0xFF]);
  for(const c of cues){const ms=Math.max(0,Math.round(c.t*1000));entry('CUE',[0,CU.slot(c.k),...beEnc(ms),0,...CU.SERATO[c.k],0,0,...enc.encode(CU.NAME[c.k]),0])}
  entry('BPMLOCK',[0]);d.push(0);
  let b64='';for(let i=0;i<d.length;i+=0x8000)b64+=String.fromCharCode.apply(null,d.slice(i,i+0x8000));
  b64=btoa(b64).replace(/=+$/,'').replace(/(.{72})/g,'$1\n').replace(/\n$/,'');
  const body=[1,1,...latin(b64),0];while(body.length<470)body.push(0);
  return [0,...latin('application/octet-stream'),0,0,...latin('Serato Markers2'),0,...body];
}
const isSeratoM2=f=>f.id==='GEOB'&&new TextDecoder('latin1').decode(f.data.subarray(0,Math.min(80,f.data.length))).includes('Serato Markers2');
/* Traktor: collection NML with the tracks, their grid, key and hot cues */
function nmlLoc(r){
  const segs=[...folderSegs(C.folder),...String(r.rel||r.name).split('/').filter(Boolean)],file=segs.pop()||r.name;let vol='';
  if(segs.length&&/^[A-Za-z]:$/.test(segs[0]))vol=segs.shift().toUpperCase();
  else if(segs[0]==='Volumes'&&segs.length>1){segs.shift();vol=segs.shift()}
  else vol='Macintosh HD';
  return {vol,dir:'/:'+segs.map(x=>x+'/:').join(''),file};
}
function exportNml(){
  const rows=exportRows();if(!rows.length){setMsg(t('crNothing'),true);renderMsg();return}
  const d=new Date(),day=`${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`,L=['<?xml version="1.0" encoding="UTF-8" standalone="no" ?>','<NML VERSION="19"><HEAD COMPANY="www.native-instruments.com" PROGRAM="Traktor"></HEAD>','<MUSICFOLDERS></MUSICFOLDERS>',`<COLLECTION ENTRIES="${rows.length}">`];
  const keys=[];
  for(const r of rows){const p=parseName(r.name),lc=nmlLoc(r),g=gridStart(r);keys.push(lc.vol+lc.dir+lc.file);
    L.push(`<ENTRY TITLE="${xa(p.title)}" ARTIST="${xa(p.artist)}"><LOCATION DIR="${xa(lc.dir)}" FILE="${xa(lc.file)}" VOLUME="${xa(lc.vol)}" VOLUMEID=""></LOCATION>`,
      `<INFO BITRATE="0" KEY="${xa(keyStr(r.key))}" PLAYTIME="${Math.round(r.dur||0)}" PLAYTIME_FLOAT="${(r.dur||0).toFixed(6)}" IMPORT_DATE="${day}" FILESIZE="${Math.round((r.size||0)/1024)}"></INFO>`,
      `<TEMPO BPM="${r.bpm.toFixed(6)}" BPM_QUALITY="100.000000"></TEMPO>`+(r.key?`<MUSICAL_KEY VALUE="${(r.key.mode?12:0)+r.key.pc}"></MUSICAL_KEY>`:''),
      `<CUE_V2 NAME="AutoGrid" DISPL_ORDER="0" TYPE="4" START="${(g.ini*1000).toFixed(6)}" LEN="0.000000" REPEATS="-1" HOTCUE="-1"></CUE_V2>`,
      ...cueList(r).map(c=>`<CUE_V2 NAME="${xa(CU.NAME[c.k])}" DISPL_ORDER="0" TYPE="0" START="${(c.t*1000).toFixed(6)}" LEN="0.000000" REPEATS="-1" HOTCUE="${CU.slot(c.k)}"></CUE_V2>`),
      '</ENTRY>')}
  const uuid=[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
  L.push('</COLLECTION>','<SETS ENTRIES="0"></SETS>','<PLAYLISTS><NODE TYPE="FOLDER" NAME="$ROOT"><SUBNODES COUNT="1">',`<NODE TYPE="PLAYLIST" NAME="Chord Room"><PLAYLIST ENTRIES="${rows.length}" TYPE="LIST" UUID="${uuid}">`,
    ...keys.map(k=>`<ENTRY><PRIMARYKEY TYPE="TRACK" KEY="${xa(k)}"></PRIMARYKEY></ENTRY>`),'</PLAYLIST></NODE></SUBNODES></NODE></PLAYLISTS>','</NML>');
  CR.saveBlob(new Blob([L.join('\n')+'\n'],{type:'application/xml'}),'chord-room-traktor.nml');logExp('traktor',rows.length);
  if(folderSegs(C.folder).length)setMsg(t('crNmlDone'));else setMsg(t('crXmlNoFolder'),true);
  renderMsg();
}
/* ---------- rekordbox-style overview: RGB waveform, bar grid, coloured hot cue flags ---------- */
const WN=300;
const b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const unb64=s=>{try{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}catch(e){return null}};
function packWave(w){
  if(!w||!w.amp||!w.len)return null;
  const a=new Uint8Array(WN),c=new Uint8Array(WN*3),n=w.len;
  for(let i=0;i<WN;i++){const s0=Math.floor(i*n/WN),s1=Math.max(s0+1,Math.floor((i+1)*n/WN));let mx=0,R=0,G=0,B=0,k=0;
    for(let j=s0;j<s1&&j<n;j++){const v=w.amp[j];if(v>mx)mx=v;R+=w.col[j*3];G+=w.col[j*3+1];B+=w.col[j*3+2];k++}
    a[i]=Math.round(mx*255);if(k){c[i*3]=R/k;c[i*3+1]=G/k;c[i*3+2]=B/k}}
  return {a:b64(a),c:b64(c)};
}
const WV=new Map();   // row id → decoded overview
function wvOf(r){if(!r.wv)return null;let x=WV.get(r.id);if(x&&x.src===r.wv)return x;const a=unb64(r.wv.a),c=unb64(r.wv.c);if(!a||!c)return null;x={a,c,src:r.wv};WV.set(r.id,x);return x}
function cueHTML(r){
  const cs=cueList(r);if(!done(r)||!r.dur||(!cs.length&&!r.wv))return '';
  const pc=x=>Math.max(0,Math.min(100,x/r.dur*100)).toFixed(2);
  const cs2=cs;
  const flags=cs2.map(c=>{const [R,G,B]=CU.COL[c.k],tip=esc(`${letter(c.k)} · ${CU.NAME[c.k]} · ${fmtLen(c.t)} · ${t('ovDragT')}`);
    return `<span class="cuef" data-cue="${c.k}" style="left:${pc(c.t)}%;--c:rgb(${R} ${G} ${B})" title="${tip}" role="img" aria-label="${tip}">${letter(c.k)}</span>`}).join('');
  const on=PL.id===r.id,playing=on&&PL.audio&&!PL.audio.paused;
  const pb=r.file?`<button type="button" class="ovp" data-act="ovplay" title="${esc(t(playing?'ovPause':'ovPlay'))}" aria-label="${esc(t(playing?'ovPause':'ovPlay'))}">${playing?IC.pause:IC.play}</button>`:'';
  const bar=on&&r.file?`<div class="ovbar" dir="ltr"><span class="ovt mono" data-ovt="${r.id}">${fmtLen(PL.audio?PL.audio.currentTime:0)} / ${fmtLen(r.dur)}</span>
    <span class="ovg"><span class="ovl">${esc(t('ovGrid'))}</span><button type="button" data-act="gbeatm" title="${esc(t('ovBeatM'))}" aria-label="${esc(t('ovBeatM'))}">◀◀</button><button type="button" data-act="gfinem" title="${esc(t('ovFineM'))}" aria-label="${esc(t('ovFineM'))}">◀</button><button type="button" data-act="gfinep" title="${esc(t('ovFineP'))}" aria-label="${esc(t('ovFineP'))}">▶</button><button type="button" data-act="gbeatp" title="${esc(t('ovBeatP'))}" aria-label="${esc(t('ovBeatP'))}">▶▶</button></span>
    <button type="button" class="ovb" data-act="gbar">${esc(t('ovBarHere'))}</button>${r.gsh?`<button type="button" class="ovb ghost" data-act="greset">${esc(t('ovReset'))}</button>`:''}
    <span class="snote ovh" dir="auto">${esc(t('ovHint'))}</span></div>`:'';
  return `<div class="rbov${on?' on':''}" dir="ltr" data-ovr="${r.id}"><canvas data-ov="${r.id}" aria-hidden="true"></canvas>${flags}${pb}</div>${bar}`;
}
function drawOverviews(root){
  (root||document).querySelectorAll('canvas[data-ov]').forEach(cv=>{const r=byId(cv.dataset.ov);if(r)drawOverview(cv,r)});
}
function drawOverview(cv,r){
  const w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;
  const dpr=Math.min(2,window.devicePixelRatio||1);cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);
  const g=cv.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const top=12,H=h-top,mid=top+H/2,x=t=>t/r.dur*w,cs=cueList(r);
  // sections: a faint wash of the cue colour until the next cue
  cs.forEach((c,i)=>{const e=i+1<cs.length?cs[i+1].t:r.dur,[R,G,B]=CU.COL[c.k];g.fillStyle=`rgba(${R},${G},${B},.13)`;g.fillRect(x(c.t),top,x(e)-x(c.t),H)});
  // bar grid: a thin line every 4 bars, brighter every 16 (phrases), from the first downbeat
  if(r.bpm>0){const {db,bar}=bars(r);let k=0;
    for(let t=db;t<r.dur;t+=bar*4,k++){const px=Math.round(x(t))+.5;g.fillStyle=k%4===0?'rgba(255,255,255,.3)':'rgba(255,255,255,.11)';g.fillRect(px,top,1,H)}}
  // waveform (RGB like rekordbox's 3-band view), mirrored around the middle
  const wv=wvOf(r);
  if(wv){const bw=w/WN;for(let i=0;i<WN;i++){const v=wv.a[i]/255;if(!v)continue;const hh=Math.max(1,v*(H/2-1));
    g.fillStyle=`rgb(${wv.c[i*3]},${wv.c[i*3+1]},${wv.c[i*3+2]})`;g.fillRect(i*bw,mid-hh,Math.max(1,bw-.2),hh*2)}}
  else{g.fillStyle='rgba(255,255,255,.12)';g.fillRect(0,mid-.5,w,1)}
  // hot cues: full-height line + the flag strip on top
  for(const c of cs){const [R,G,B]=CU.COL[c.k],px=Math.round(x(c.t));g.fillStyle=`rgb(${R},${G},${B})`;g.fillRect(px,0,2,h);g.fillRect(px,0,14,top-1)}
  // playhead (and what has been played, dimmed)
  if(PL.id===r.id&&PL.audio){const tp=PL.audio.currentTime||0,px=x(tp);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(0,top,px,H);g.fillStyle='#fff';g.fillRect(Math.round(px),0,2,h)}
}
/* ---------- listening + moving the grid / cues on the overview ---------- */
const PL={id:null,audio:null,url:null,raf:0};
function bars(r){const gs=gridStart(r),T=60/r.bpm;return {db:gs.ini+mod(1-gs.beat,4)*T,bar:4*T,T}}
function snapBar(r,t){const {db,bar}=bars(r);return db+Math.round((t-db)/bar)*bar}
function plStop(){if(PL.audio){PL.audio.pause()}cancelAnimationFrame(PL.raf);const id=PL.id;PL.id=null;if(PL.url){URL.revokeObjectURL(PL.url);PL.url=null}if(id){const r=byId(id);if(r)renderRow(r)}}
async function plPlay(r,at){
  if(!r.file)return;
  if(PL.id!==r.id){plStop();PL.id=r.id;PL.url=URL.createObjectURL(r.file);
    if(!PL.audio){PL.audio=new Audio();PL.audio.preload='auto';PL.audio.onended=()=>{const x=byId(PL.id);if(x)renderRow(x)};PL.audio.onpause=PL.audio.onplay=()=>{const x=byId(PL.id);if(x)renderRow(x)}}
    PL.audio.src=PL.url}
  if(CR.stopTool)CR.stopTool();
  if(at!=null&&isFinite(at))try{PL.audio.currentTime=Math.max(0,Math.min(r.dur-0.05,at))}catch(e){}
  try{await PL.audio.play()}catch(e){console.warn(e)}
  loop();
}
function loop(){cancelAnimationFrame(PL.raf);const tick=()=>{const r=PL.id&&byId(PL.id);if(!r){return}
  const cv=document.querySelector(`canvas[data-ov="${r.id}"]`);if(cv)drawOverview(cv,r);
  const tt=document.querySelector(`[data-ovt="${r.id}"]`);if(tt)tt.textContent=`${fmtLen(PL.audio.currentTime)} / ${fmtLen(r.dur)}`;
  if(!PL.audio.paused)PL.raf=requestAnimationFrame(tick)};PL.raf=requestAnimationFrame(tick)}
/* move grid AND cues together (cues sit on bar lines) */
function shiftGrid(r,d){
  if(!d||!isFinite(d))return;r.gsh=(r.gsh||0)+d;
  if(Array.isArray(r.cues))r.cues=r.cues.map(c=>({...c,t:Math.max(0,Math.round((c.t+d)*1000)/1000)}));
  save();renderRow(r);
}
function gridAct(a,r){
  const T=60/r.bpm;
  if(a==='gbeatm')shiftGrid(r,-T);else if(a==='gbeatp')shiftGrid(r,T);
  else if(a==='gfinem')shiftGrid(r,-0.01);else if(a==='gfinep')shiftGrid(r,0.01);
  else if(a==='gbar'){const p=PL.audio?PL.audio.currentTime:0,{db,bar}=bars(r),near=db+Math.round((p-db)/bar)*bar;shiftGrid(r,p-near)}
  else if(a==='greset'){shiftGrid(r,-(r.gsh||0));delete r.gsh;save();renderRow(r)}
}
/* pointer on the overview: click = listen from there, drag a flag = move that cue (snaps to bars, Alt = free) */
function ovPointer(e){
  const box=e.target.closest('.rbov');if(!box||e.button>0)return;
  if(e.target.closest('.ovp'))return;
  const r=byId(box.dataset.ovr);if(!r||!r.dur)return;
  const rect=box.getBoundingClientRect(),tAt=cx=>Math.max(0,Math.min(r.dur,(cx-rect.left)/rect.width*r.dur));
  const flag=e.target.closest('.cuef'),cue=flag&&cueList(r).find(c=>c.k===flag.dataset.cue);
  if(!cue){plPlay(r,tAt(e.clientX));return}
  e.preventDefault();const x0=e.clientX,t0=cue.t;let moved=false;
  const mv=ev=>{if(Math.abs(ev.clientX-x0)>3)moved=true;if(!moved)return;let tn=tAt(ev.clientX);if(!ev.altKey&&r.bpm>0)tn=snapBar(r,tn);cue.t=Math.max(0,Math.round(tn*1000)/1000);
    flag.style.left=(cue.t/r.dur*100).toFixed(2)+'%';const cv=box.querySelector('canvas');if(cv)drawOverview(cv,r)};
  const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);
    if(moved){r.cues.sort((a,b)=>CU.slot(a.k)-CU.slot(b.k));save();renderRow(r)}else plPlay(r,t0)};
  window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up);
}
let ovRO=null;
function watchOverviews(){if(ovRO||!window.ResizeObserver)return;ovRO=new ResizeObserver(()=>drawOverviews($('#crBody')));const b=$('#crBody');if(b)ovRO.observe(b)}
function legendHTML(){
  if(!CU)return '';
  return CU.KINDS.map(k=>{const [R,G,B]=CU.COL[k];return `<span class="cl" dir="ltr"><i style="background:rgb(${R} ${G} ${B})">${letter(k)}</i>${esc(CU.NAME[k])}</span>`}).join('');
}

/* ---------- Latin names for Pioneer players (assets/heblat.js) ---------- */
const HL=window.HEBLAT;
const AK='chordroom.dzartist.v1';
let DZA=(()=>{try{return JSON.parse(localStorage.getItem(AK)||'{}')||{}}catch(e){return {}}})();
const hasHeb=s=>!!HL&&HL.has(s);
function artistLat(a){
  if(!a||!hasHeb(a))return a||'';
  const k=HL.known(a);if(k)return k;
  const d=DZA[a.trim()];if(d)return d;
  return HL.translit(a);
}
/* {artist,title} in Latin letters for a row (a name the user typed wins) */
function latOf(r){
  if(r.lat)return {artist:r.lat.artist||'',title:r.lat.title||''};
  const p=parseName(r.name);
  return {artist:artistLat(p.artist),title:hasHeb(p.title)&&HL?HL.translit(p.title):p.title};
}
const latStr=l=>(l.artist?l.artist+' - ':'')+l.title;
/* official artist spellings from Deezer ("עופר לוי" → "Ofer Levi"), only when the spelling looks like the same name */
function sim(a,b){a=HL.skeleton(a);b=HL.skeleton(b);if(!a||!b)return 0;
  const m=a.length,n=b.length,d=Array.from({length:m+1},()=>new Array(n+1).fill(0));
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=a[i-1]===b[j-1]?d[i-1][j-1]+1:Math.max(d[i-1][j],d[i][j-1]);
  return 2*d[m][n]/(m+n)}
let looking=false;
async function lookupArtists(){
  if(looking||!HL||!CR.dz)return;
  const todo=[...new Set(C.rows.map(r=>parseName(r.name).artist.trim()).filter(a=>a&&hasHeb(a)&&!HL.known(a)&&!(a in DZA)))].slice(0,40);
  if(!todo.length)return;
  looking=true;setMsg(t('crLatLook'));renderMsg();
  try{
    for(const a of todo){
      let best='';
      try{const d=await CR.dz('search/artist',{q:a,limit:5});const guess=HL.translit(a);
        for(const x of (d&&d.data)||[]){const nm=String(x.name||'').trim();if(!nm||hasHeb(nm))continue;if(sim(nm,guess)>=0.6){best=nm;break}}}catch(e){if(!DZA.__fail)console.warn('deezer artist',e);continue}
      DZA[a]=best;
    }
    try{localStorage.setItem(AK,JSON.stringify(DZA))}catch(e){}
  }finally{looking=false;if(C.msg===t('crLatLook'))setMsg('');renderTable();renderMsg()}
}
function saveLat(r,val){
  const v=String(val||'').replace(/\s+/g,' ').trim();
  if(!v){delete r.lat}
  else{const m=/^(.+?)\s+[-–—]\s+(.+)$/.exec(v),l=m?{artist:m[1].trim(),title:m[2].trim()}:{artist:'',title:v};
    const p=parseName(r.name);
    if(HL){if(p.artist&&l.artist&&hasHeb(p.artist))HL.learnArtist(p.artist,l.artist);if(hasHeb(p.title)&&l.title)HL.learn(p.title,l.title)}
    r.lat=l}
  C.editLat=null;save();renderTable();
}
/* file names that FAT32 USB sticks and CDJs accept */
const fatName=s=>String(s).normalize('NFC').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'').replace(/[\\/:*?"<>|\u0000-\u001F]/g,'_').replace(/\s+/g,' ').replace(/[. ]+$/,'').trim();
function usbName(r){
  const l=latOf(r),pre=C.usbPre?`${keyStr(r.key)||'--'} - ${Math.round(r.bpm)} - `:'';
  return fatName(pre+latStr(l)).slice(0,120)+(r.ext?'.'+r.ext:'');
}
/* FLAC: Vorbis comments — Hebrew values converted, TITLE / ARTIST set, BPM / INITIALKEY written */
function tagFlac(u,{lat,bpm,key}){
  if(u.length<8||u[0]!==0x66||u[1]!==0x4C||u[2]!==0x61||u[3]!==0x43)return u;
  const blocks=[];let p=4,last=false;
  while(!last&&p+4<=u.length){const h=u[p];last=!!(h&128);const type=h&127,len=(u[p+1]<<16)|(u[p+2]<<8)|u[p+3];if(p+4+len>u.length)return u;blocks.push({type,data:u.subarray(p+4,p+4+len)});p+=4+len}
  const audio=u.subarray(p),dv=d=>new DataView(d.buffer,d.byteOffset,d.byteLength),te=new TextEncoder(),td=new TextDecoder();
  let vendor='Chord Room',com=[];const vi=blocks.findIndex(b=>b.type===4);
  if(vi>=0){const d=blocks[vi].data,v=dv(d);let q=0;const vl=v.getUint32(q,true);q+=4;vendor=td.decode(d.subarray(q,q+vl));q+=vl;const n=v.getUint32(q,true);q+=4;
    for(let i=0;i<n&&q+4<=d.length;i++){const l=v.getUint32(q,true);q+=4;com.push(td.decode(d.subarray(q,q+l)));q+=l}}
  const drop=new Set(['TITLE','ARTIST','BPM','INITIALKEY','KEY']);
  com=com.filter(c=>!drop.has(c.split('=')[0].toUpperCase())).map(c=>{const i=c.indexOf('=');if(i<0)return c;const v=c.slice(i+1);return hasHeb(v)?c.slice(0,i+1)+HL.translit(v):c});
  if(lat.title)com.push('TITLE='+lat.title);if(lat.artist)com.push('ARTIST='+lat.artist);if(bpm)com.push('BPM='+bpm);if(key)com.push('INITIALKEY='+key);
  const parts=[te.encode(vendor),...com.map(c=>te.encode(c))];
  const size=4+parts[0].length+4+com.length*4+parts.slice(1).reduce((a,x)=>a+x.length,0),vc=new Uint8Array(size),w=dv(vc);let q=0;
  w.setUint32(q,parts[0].length,true);q+=4;vc.set(parts[0],q);q+=parts[0].length;w.setUint32(q,com.length,true);q+=4;
  for(const x of parts.slice(1)){w.setUint32(q,x.length,true);q+=4;vc.set(x,q);q+=x.length}
  if(vi>=0)blocks[vi]={type:4,data:vc};else blocks.splice(1,0,{type:4,data:vc});
  const keep=blocks.filter(b=>b.type!==1);   // PADDING dropped (the whole file is rewritten anyway)
  const total=4+keep.reduce((a,b)=>a+4+b.data.length,0)+audio.length,out=new Uint8Array(total);out.set([0x66,0x4C,0x61,0x43]);let o=4;
  keep.forEach((b,i)=>{const L=b.data.length;out.set([(i===keep.length-1?128:0)|b.type,(L>>16)&255,(L>>8)&255,L&255],o);o+=4;out.set(b.data,o);o+=L});
  out.set(audio,o);return out;
}
async function exportUsb(force){
  if(C.zipBusy)return;
  const all=exportRows(),rows=all.filter(r=>r.file),miss=all.length-rows.length;
  if(!rows.length){setMsg(all.length?t('crZipNone'):t('crNothing'),true);renderMsg();return}
  const total=rows.reduce((a,r)=>a+r.size,0);
  if(total>BIG_ZIP&&!force){setMsg(t('crZipBig',{s:mb(total)}),true,[t('crZipGo'),()=>exportUsb(true)]);renderMsg();return}
  // points v2: the whole folder is ONE charge ('usb' × rows, plan discount applied); rows that fail are refunded.
  // Busy BEFORE asking: a double click (or "don't ask again") must not charge the folder twice.
  C.zipBusy=true;renderExp();
  const pay=await folderPay(rows,t('crUsbPayT',{n:rows.length}),t('crUsb'));
  if(!pay){C.zipBusy=false;renderExp();return}
  let bad=0,ok=false;
  try{
    await lookupArtists();
    const files=[],used=new Set();let i=0,other=0;
    for(const r of rows){
      setMsg(t('crZipBusy',{p:Math.round(i/rows.length*100)}));renderMsg();await CR.tick();
      let nm=CR.zipName?CR.zipName(usbName(r)):usbName(r);if(used.has(nm.toLowerCase())){let k=2;const b=baseOf(nm);while(used.has(`${b} (${k}).${r.ext}`.toLowerCase()))k++;nm=`${b} (${k})`+(r.ext?'.'+r.ext:'')}
      used.add(nm.toLowerCase());r._zn=nm;
      const lat=latOf(r),bpm=String(Math.round(r.bpm)),key=rbKey(r.key);
      let data;try{data=new Uint8Array(await r.file.arrayBuffer())}catch(e){console.warn('usb read',r.name,e);bad++;i++;used.delete(nm.toLowerCase());r._zn=null;continue}
      if(r.ext==='mp3'){try{data=tagMp3(data,{bpm,key,cam:keyStr(r.key),lat,cues:cueList(r)})}catch(e){console.warn('id3',r.name,e)}}
      else if(r.ext==='flac'){try{data=tagFlac(data,{lat,bpm,key})}catch(e){console.warn('flac',r.name,e)}}
      else if(hasHeb(r.name))other++;
      files.push({name:nm,data});i++;
    }
    const inZip=rows.filter(r=>r._zn);if(!inZip.length)throw new Error('no files');
    files.push({name:'Chord Room.m3u8',data:new TextEncoder().encode(['#EXTM3U','#PLAYLIST:Chord Room',...inZip.flatMap(r=>[`#EXTINF:${Math.round(r.dur||0)},${m3l(latStr(latOf(r)))}`,m3l(r._zn)])].join('\n')+'\n')});
    setMsg(t('crZipBusy',{p:100}));renderMsg();await CR.tick();
    const blob=CR.zip(files);
    CR.saveBlob(blob,'chord-room-usb.zip');logExp('usb',inZip.length);ok=true;
    const left=all.filter(r=>r.file).length-rows.length;
    setMsg(t('crUsbDone',{s:mb(blob.size)})+(other?' '+t('crUsbOther',{n:other}):'')+(miss?' '+t('crZipNo',{n:miss}):'')+(left?' '+t('crUsbLeft',{n:left}):'')+(bad?' '+t('crUsbBad',{n:bad}):''),!!(miss||bad));
  }catch(e){console.error(e);setMsg(t('stErr'),true)}
  finally{C.zipBusy=false;renderExp();renderMsg();
    settle(pay,ok?bad:rows.length)}
}

/* ---------- messages ---------- */
function setMsg(text,err,act){C.msg=text||'';C.msgErr=!!err;C.msgAct=act||null}
function renderMsg(){
  const m=$('#crMsg');if(!m)return;m.innerHTML='';m.classList.toggle('err',C.msgErr);
  if(!C.msg)return;const s=document.createElement('span');s.textContent=C.msg;m.appendChild(s);
  if(C.msgAct){const b=document.createElement('button');b.type='button';b.className='btn ghost';b.textContent=C.msgAct[0];const fn=C.msgAct[1];b.onclick=()=>{setMsg('');renderMsg();fn()};m.appendChild(b)}
}

/* ---------- build ---------- */
function build(){
  const v=$('#crateView');
  v.innerHTML=`
<div class="dhead crhead">
  <div><div class="eyebrow" data-i="crEyebrow"></div><h1 data-i="crTitle"></h1><p data-i="crSub"></p></div>
  <div class="cracts" id="crActs">
    <button type="button" class="btn solid" id="crFilesB">${IC.files}<span data-i="crFiles"></span></button>
    <button type="button" class="btn" id="crFolderB">${IC.folder}<span data-i="crFolder"></span></button>
  </div>
</div>
<div class="crdrop" id="crDrop">
  <div class="crdi">${IC.drop}</div>
  <b data-i="crDropT"></b>
  <p class="snote" id="crDropH"></p>
  <div class="crdb"><button type="button" class="btn solid" id="crFilesB2">${IC.files}<span data-i="crFiles"></span></button>
    <button type="button" class="btn" id="crFolderB2">${IC.folder}<span data-i="crFolder"></span></button></div>
  <p class="snote crhint" data-i="crPathHint"></p>
</div>
<div id="crMain" hidden>
  <div class="crdeck" id="crDeck"></div>
  <div class="crtools">
    <input type="search" class="srch" id="crQ" data-ip="crSearch" autocomplete="off">
    <select class="sel" id="crKey"></select>
    <select class="sel crsortm" id="crSortM"></select>
    <span class="crchip" id="crChip" hidden></span>
    <button type="button" class="btn" id="crSmart">${IC.smart}<span data-i="crSmart"></span></button>
  </div>
  <div class="snote crmsg" id="crMsg" role="status" aria-live="polite"></div>
  <div class="crwrap"><table class="crtab" id="crTab"><thead><tr id="crHead"></tr></thead><tbody id="crBody"></tbody></table><p class="dempty" id="crNone" hidden></p></div>
  <p class="snote crmore" data-i="crMoreH"></p>
  <section class="crexp" aria-labelledby="crExpH">
    <div class="crexph"><h2 id="crExpH" data-i="crExport"></h2><span class="snote" id="crExpN"></span></div>
    <div class="crcues"><b data-i="crCuesH"></b><p class="snote" data-i="crCuesT"></p><div class="clg" id="crLegend"></div><p class="snote" data-i="crCuesHow"></p><p class="snote" id="crCuesOld" data-i="crCuesOld" hidden></p></div>
    <div class="crfld"><label for="crFolderIn" data-i="crFolderL"></label>
      <input type="text" class="srch" id="crFolderIn" aria-describedby="crFolderH" dir="ltr" spellcheck="false" autocomplete="off" data-ip="crFolderP">
      <p class="snote" id="crFolderH" data-i="crFolderH"></p></div>
    <div class="crxb">
      <button type="button" class="btn" id="crCsv">${IC.dl}<span data-i="crCsv"></span></button>
      <button type="button" class="btn" id="crXml">${IC.dl}<span data-i="crXml"></span></button>
      <button type="button" class="btn" id="crNml">${IC.dl}<span data-i="crNml"></span></button>
      <button type="button" class="btn" id="crM3u">${IC.dl}<span data-i="crM3u"></span></button>
      <button type="button" class="btn" id="crZip">${IC.dl}<span data-i="crZip"></span><i class="ptchip" id="crZipPts" hidden></i></button>
    </div>
    <div class="crusb">
      <div class="crusbh"><button type="button" class="btn solid" id="crUsb">${IC.usb}<span data-i="crUsb"></span><i class="ptchip" id="crUsbPts" hidden></i></button>
        <label class="crchk"><input type="checkbox" id="crUsbPre"><span data-i="crPrefix"></span></label></div>
      <p class="snote" id="crUsbT" data-i="crUsbT"></p><p class="snote" data-i="crUsbH"></p>
    </div>
  </section>
</div>
<input type="file" id="crIn" multiple accept="${ACCEPT}">
<input type="file" id="crDir" multiple webkitdirectory>
<div class="crover" id="crOver" hidden><div><span>${IC.drop}</span><b data-i="crDropping"></b></div></div>`;
  C.built=true;wire();CR.applyLang();renderAll();
}
function wire(){
  const fin=$('#crIn'),din=$('#crDir');
  ['#crFilesB','#crFilesB2'].forEach(s=>$(s).onclick=()=>fin.click());
  ['#crFolderB','#crFolderB2'].forEach(s=>$(s).onclick=()=>din.click());
  $('#crFolderB2').setAttribute('aria-describedby','crDropH');
  fin.onchange=()=>fromInput(fin,false);din.onchange=()=>fromInput(din,true);
  $('#crQ').oninput=e=>{C.q=e.target.value.trim();renderTable()};
  $('#crKey').onchange=e=>{C.key=e.target.value;renderTable()};
  $('#crSortM').onchange=e=>{const [k,d]=e.target.value.split(':');C.sort=k==='n'?null:{k,dir:+d};save();renderTable();renderSortM()};
  $('#crSmart').onclick=smartOrder;
  $('#crCsv').onclick=exportCsv;$('#crXml').onclick=exportXml;$('#crNml').onclick=exportNml;$('#crLegend').innerHTML=legendHTML();$('#crM3u').onclick=exportM3u;$('#crZip').onclick=()=>exportZip(false);$('#crUsb').onclick=()=>exportUsb(false);
  const up=$('#crUsbPre');up.checked=C.usbPre;up.onchange=()=>{C.usbPre=up.checked;try{localStorage.setItem('chordroom.crate.usbpre',C.usbPre?'1':'0')}catch(e){}};
  const fi=$('#crFolderIn');fi.value=C.folder;fi.oninput=e=>{C.folder=e.target.value;save()};
  $('#crHead').onclick=e=>{const b=e.target.closest('button[data-k]');if(!b)return;const k=b.dataset.k;
    if(k==='n')C.sort=null;else if(!C.sort||C.sort.k!==k)C.sort={k,dir:k==='energy'||k==='lufs'?-1:1};else if(C.sort.dir===(k==='energy'||k==='lufs'?-1:1))C.sort.dir*=-1;else C.sort=null;
    save();renderTable();renderSortM();const nb=$(`#crHead button[data-k="${k}"]`);if(nb)nb.focus()};
  $('#crBody').addEventListener('pointerdown',ovPointer);
  $('#crBody').onclick=e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled)return;const tr=b.closest('tr'),r=tr&&byId(tr.dataset.id);if(!r)return;act(b.dataset.act,r)};
  $('#crDeck').onclick=e=>{const b=e.target.closest('[data-act]');if(!b)return;
    if(b.dataset.act==='stop')stop();else if(b.dataset.act==='resume')resume();
    else if(b.dataset.act==='clear'){
      if(Date.now()-C.clearArm<4000){C.clearArm=0;if(C.running)stop();C.rows=[];C.sel=null;C.compat=null;setMsg('');save();renderAll();const f=$('#crFilesB2');if(f)f.focus()}
      else{C.clearArm=Date.now();renderDeck();const nb=$('#crDeck [data-act="clear"]');if(nb)nb.focus();setTimeout(()=>{if(C.clearArm&&Date.now()-C.clearArm>=4000){C.clearArm=0;renderDeck()}},4100)}
    }};
}
function focusLat(r){const b=$(`#crBody tr[data-id="${r.id}"] [data-act="lat"]`);if(b)b.focus()}
function act(a,r){
  const keep=`#crBody tr[data-id="${r.id}"] [data-act="${a}"]`;
  if(a==='sel'){C.sel=C.sel===r.id?null:r.id;save()}
  else if(a==='compat'){C.compat=C.compat===r.id?null:r.id}
  else if(a==='half'||a==='dbl'){if(!done(r))return;r.bpm=a==='half'?r.bpm/2:r.bpm*2;r.energy=energyOf(r);save();renderDeck()}
  else if(a==='open'){if(r.file){plStop();CR.openFile(r.file)}return}
  else if(a==='ovplay'){if(PL.id===r.id&&PL.audio&&!PL.audio.paused){PL.audio.pause();return}plPlay(r,PL.id===r.id?null:0);return}
  else if(/^g(beat|fine)[mp]$|^gbar$|^greset$/.test(a)){gridAct(a,r);const n=$(keep);if(n)n.focus();return}
  else if(a==='lat'){C.editLat=r.id;renderTable();const inp=$(`#crBody tr[data-id="${r.id}"] input.latin`);if(inp){inp.focus();inp.select();
      inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveLat(r,inp.value);focusLat(r)}else if(e.key==='Escape'){e.preventDefault();C.editLat=null;renderTable();focusLat(r)}}}return}
  else if(a==='latok'){const inp=$(`#crBody tr[data-id="${r.id}"] input.latin`);saveLat(r,inp?inp.value:'');focusLat(r);return}
  else if(a==='latx'){C.editLat=null;renderTable();focusLat(r);return}
  else if(a==='latreset'){delete r.lat;C.editLat=null;save();renderTable();focusLat(r);return}
  else if(a==='rm'){if(PL.id===r.id)plStop();const i=view().indexOf(r);C.rows=C.rows.filter(x=>x!==r);if(C.sel===r.id)C.sel=null;if(C.compat===r.id)C.compat=null;save();renderAll();
    const tr=$('#crBody').children[Math.max(0,Math.min(i,$('#crBody').children.length-1))],f=tr&&tr.querySelector('[data-act="rm"]');if(f)f.focus();else{const s=$('#crFilesB2');if(s&&!$('#crDrop').hidden)s.focus()}return}
  renderTable();const n=$(keep);if(n)n.focus();
}

/* ---------- render ---------- */
function renderAll(){if(!C.built)return;
  const has=C.rows.length>0;$('#crDrop').hidden=has;$('#crMain').hidden=!has;$('#crActs').hidden=!has;
  $('#crDropH').textContent=t('crDropH',{n:MAX});
  $('#crSmart').title=t('crSmartT');$('#crZip').title=t('crZipT');$('#crQ').setAttribute('aria-label',t('crSearch'));
  renderDeck();renderTools();renderTable();renderExp();renderMsg();
}
function renderDeck(){
  const d=$('#crDeck');if(!d)return;
  const ok=C.rows.filter(done),bp=ok.map(r=>r.bpm),tot=ok.reduce((a,r)=>a+(r.dur||0),0);
  const cnt={};let top=null;ok.forEach(r=>{if(!r.key)return;const c=camStr(r.key);cnt[c]=(cnt[c]||0)+1;if(!top||cnt[c]>cnt[camStr(top)])top=r.key});
  const paused=C.rows.filter(r=>r.st==='pause'&&r.file).length;
  const st=(k,v)=>`<div class="crst"><span class="k">${esc(t(k))}</span><span class="v mono" dir="ltr">${v}</span></div>`;
  d.innerHTML=st('sTracks',`${ok.length}${ok.length<C.rows.length?`<small>/${C.rows.length}</small>`:''}`)+
    st('sRange',bp.length?`${Math.round(Math.min(...bp))}–${Math.round(Math.max(...bp))}`:'—')+
    `<div class="crst"><span class="k">${esc(t('sKeyTop'))}</span><span class="v kv"></span></div>`+
    st('sTime',ok.length?fmtLen(tot):'—')+
    `<div class="crprog" id="crProg"${C.running?'':' hidden'}><span class="pt mono"></span><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>`+
    `<div class="crdact">${C.running?`<button type="button" class="btn" data-act="stop">${esc(t('crStop'))}</button>`:''}${!C.running&&paused?`<button type="button" class="btn" data-act="resume">${esc(t('crResume',{n:paused}))}</button>`:''}`+
    `<button type="button" class="btn ghost${C.clearArm?' arm':''}" data-act="clear">${IC.x}<span>${esc(t(C.clearArm?'crClearSure':'crClear'))}</span></button></div>`;
  const kv=d.querySelector('.kv');if(top)kv.appendChild(CR.keyBadge(top));else kv.textContent='—';
  renderProg();
}
function renderProg(){
  const p=$('#crProg');if(!p)return;p.hidden=!C.running;if(!C.running)return;
  const act=C.rows.filter(r=>r.file&&r.st!=='pause'),fin=act.filter(r=>r.st==='ok'||r.st==='err').length,n=act.length;
  const cur=C.cur&&byId(C.cur),frac=n?(fin+(cur?C.curP:0))/n:0;
  p.querySelector('.pt').textContent=t('crProg',{i:Math.min(n,fin+1),n})+(cur?' · '+parseName(cur.name).title:'');
  p.querySelector('i').style.width=Math.round(frac*100)+'%';p.querySelector('.bar').setAttribute('aria-valuenow',Math.round(frac*100));
}
function renderTools(){
  const sel=$('#crKey'),cur=C.key;sel.innerHTML='';sel.setAttribute('aria-label',t('colKey'));
  const o0=document.createElement('option');o0.value='';o0.textContent=t('crAllKeys');sel.appendChild(o0);
  const have=new Set(C.rows.filter(done).map(r=>camStr(r.key)));
  for(let n=1;n<=12;n++)for(const l of ['A','B']){const k=n+l;if(!have.has(k)&&k!==cur)continue;
    const pc=l==='B'?CR.CAM_MAJ.indexOf(n):mod(CR.CAM_MAJ.indexOf(n)-3,12);const o=document.createElement('option');o.value=k;o.textContent=CR.keyText({pc,mode:l==='A'?1:0});sel.appendChild(o)}
  sel.value=cur;renderSortM();renderChip();
}
function renderSortM(){
  const s=$('#crSortM');if(!s)return;s.setAttribute('aria-label',t('crSortBy'));
  const opts=[['n:1',t('crSetOrder')],['name:1',t('colName')+' ↑'],['name:-1',t('colName')+' ↓'],['bpm:1','BPM ↑'],['bpm:-1','BPM ↓'],['key:1',t('colKey')+' ↑'],['energy:-1',t('colEnergy')+' ↓'],['energy:1',t('colEnergy')+' ↑'],['dur:1',t('colLen')+' ↑'],['lufs:-1','LUFS ↓']];
  s.innerHTML=opts.map(([v,l])=>`<option value="${v}">${esc(t('crSortBy'))}: ${esc(l)}</option>`).join('');
  const v=C.sort?C.sort.k+':'+C.sort.dir:'n:1';if(![...s.options].some(o=>o.value===v)){const o=document.createElement('option');o.value=v;o.textContent=t('crSortBy')+': '+(COLS.find(c=>c[0]===C.sort.k)||[])[1];s.appendChild(o)}s.value=v;
}
function renderChip(){
  const c=$('#crChip'),a=C.compat&&byId(C.compat);c.hidden=!a;if(!a)return;
  c.innerHTML=`<span></span><button type="button" class="ib" id="crChipX">${IC.x}<span>${esc(t('crShowAll'))}</span></button>`;
  const s=c.firstChild,parts=t('crCompat').split('{name}');s.append(parts[0]);const b=document.createElement('bdi');b.textContent=parseName(a.name).title;s.append(b,parts[1]||'');
  c.querySelector('#crChipX').onclick=()=>{C.compat=null;renderTable();const k=$(`#crBody tr[data-id="${a.id}"] [data-act="compat"]`);if(k)k.focus()};
}
function renderHead(){
  const h=$('#crHead');
  h.innerHTML=COLS.map(([k,l])=>{
    const lab=l==='#'||l==='BPM'||l==='LUFS'?l:t(l),on=k==='n'?!C.sort:C.sort&&C.sort.k===k,dir=on&&C.sort?C.sort.dir:0;
    const aria=SORTABLE.has(k)?` aria-sort="${k==='n'?(on?'ascending':'none'):dir>0?'ascending':dir<0?'descending':'none'}"`:'';
    const inner=SORTABLE.has(k)?`<button type="button" data-k="${k}"${k==='energy'?` title="${esc(t('crEnergyT'))}"`:''}${k==='n'?` title="${esc(t('crSetOrder'))}"`:''}><span>${esc(lab)}</span><i class="sa" aria-hidden="true">${on&&dir?dir>0?'▲':'▼':on?'•':''}</i></button>`:`<span class="th">${esc(lab)}</span>`;
    return `<th scope="col" class="c-${k}"${aria}>${inner}</th>`}).join('');
}
function latHTML(r){
  if(!HL||!(hasHeb(r.name)||r.lat))return '';
  const v=latStr(latOf(r));
  if(C.editLat===r.id)return `<div class="lat edit" dir="ltr"><input type="text" class="latin" value="${esc(v)}" placeholder="${esc(t('crLatP'))}" aria-label="${esc(t('crLatEdit'))}" spellcheck="false" autocomplete="off"><button type="button" class="btn solid" data-act="latok">${esc(t('crLatSave'))}</button><button type="button" class="ib" data-act="latx" title="${esc(t('crLatCancel'))}" aria-label="${esc(t('crLatCancel'))}">${IC.x}</button>${r.lat?`<button type="button" class="btn ghost" data-act="latreset">${esc(t('crLatReset'))}</button>`:''}</div>`;
  return `<div class="lat" dir="ltr"><span class="en">EN</span><span class="lv">${esc(v)}</span><button type="button" class="ib" data-act="lat" title="${esc(t('crLatEdit'))}" aria-label="${esc(t('crLatEdit'))} · ${esc(v)}">${IC.edit}</button></div>`;
}
function rowHTML(r,i,prev){
  const p=parseName(r.name),ok=done(r),mx=prev?mixOf(prev,r):null;
  const sub=[p.artist,r.rel&&r.rel!==r.name?r.rel:''].filter(Boolean);
  const mxT=mx?mx.k==='good'?t('mxGood'):mx.k==='tempo'?t('mxTempo',{p:(mx.fit*100).toFixed(1)}):t('mxBad'):'';
  const stat=r.st==='dec'||r.st==='ana'?`<div class="rs"><span>${esc(t(r.st==='dec'?'stDec':'stAna'))}</span><span class="rp"><i style="width:${Math.round((r.p||0)*100)}%"></i></span></div>`
    :r.st==='err'?`<span class="rs err">${esc(t(r.err||'stErr'))}</span>`
    :r.st==='q'?`<span class="rs">${esc(t('stQ'))}</span>`:r.st==='pause'?`<span class="rs">${esc(t('stPause'))}</span>`
    :!r.file?`<span class="rs saved" title="${esc(t('crOpenNo'))}">${esc(t('stSaved'))}</span>`:'';
  const openB=ok?`<button type="button" class="ib op" data-act="open" ${r.file?'':'disabled'} title="${esc(r.file?t('crOpen'):t('crOpenNo'))}" aria-label="${esc(r.file?t('crOpen'):t('crOpenNo'))}">${IC.open}<span>${esc(t('crOpen'))}</span></button>`:'';
  const nm=esc(p.title);
  return `<tr data-id="${r.id}" class="${C.sel===r.id?'sel ':''}${C.compat===r.id?'anchor ':''}st-${r.st}">
<td class="c-n">${mx?`<span class="mx ${mx.k}" role="img" title="${esc(mxT)}" aria-label="${esc(mxT)}">${mx.k==='good'?'':mx.k==='tempo'?'~':'×'}</span>`:''}<button type="button" class="rn mono" data-act="sel" aria-pressed="${C.sel===r.id}" title="${esc(t('crStartT'))}" aria-label="${i+1} · ${esc(t('crStartT'))}">${i+1}</button></td>
<td class="c-name"><div class="tt" dir="auto" title="${esc(r.name)}">${nm}${C.sel===r.id?` <span class="tag">${esc(t('crStartTag'))}</span>`:''}</div>${sub.length?`<div class="ar" dir="auto">${esc(sub.join(' · '))}</div>`:''}${latHTML(r)}${cueHTML(r)}</td>
<td class="c-bpm"><div class="bw"><b class="mono" dir="ltr">${ok?fmtB(r.bpm):'—'}</b>${ok?`<span class="hx" dir="ltr"><button type="button" data-act="half" title="${esc(t('crHalf'))}" aria-label="${esc(t('crHalf'))} · ${nm}">½</button><button type="button" data-act="dbl" title="${esc(t('crDouble'))}" aria-label="${esc(t('crDouble'))} · ${nm}">2×</button></span>`:''}</div></td>
<td class="c-key">${ok&&r.key?`<button type="button" class="kbb" data-act="compat" aria-pressed="${C.compat===r.id}" title="${esc(t('crCompatT'))}" aria-label="${esc(CR.keyText(r.key))} · ${esc(t('crCompatT'))}"></button>`:'<span class="mono dim">—</span>'}</td>
<td class="c-dur" data-l="${esc(t('colLen'))}"><span class="mono" dir="ltr">${fmtLen(r.dur)}</span></td>
<td class="c-lufs" data-l="LUFS"><span class="mono" dir="ltr">${r.lufs!=null?r.lufs.toFixed(1):'—'}</span></td>
<td class="c-energy" data-l="${esc(t('colEnergy'))}">${r.energy?`<span class="eb" title="${esc(t('crEnergyT'))}"><span class="ebar" aria-hidden="true"><i style="width:${r.energy*10}%"></i></span><b class="mono" dir="ltr">${r.energy}</b></span>`:'<span class="mono dim">—</span>'}</td>
<td class="c-st"><div class="sw">${stat}${openB}<button type="button" class="ib rm" data-act="rm" title="${esc(t('crRemove'))}" aria-label="${esc(t('crRemove'))} · ${nm}">${IC.x}</button></div></td></tr>`;
}
function renderTable(){
  if(!C.built)return;
  const ae=document.activeElement,foc=ae&&ae.closest&&ae.closest('#crBody tr')&&ae.dataset.act?`#crBody tr[data-id="${ae.closest('tr').dataset.id}"] [data-act="${ae.dataset.act}"]`:null;
  renderHead();renderChip();
  const list=view(),body=$('#crBody');
  body.innerHTML=list.map((r,i)=>rowHTML(r,i,i?list[i-1]:null)).join('');
  list.forEach(r=>{if(!done(r)||!r.key)return;const b=body.querySelector(`tr[data-id="${r.id}"] .kbb`);if(b)b.appendChild(CR.keyBadge(r.key))});
  requestAnimationFrame(()=>drawOverviews(body));watchOverviews();
  const none=$('#crNone');none.hidden=!!list.length||!C.rows.length;none.textContent=t('crNoMatch');
  renderExp();
  if(foc){const n=$(foc);if(n)n.focus()}
}
function renderRow(r){
  const tr=$(`#crBody tr[data-id="${r.id}"]`);if(!tr){return}
  const list=view(),i=list.indexOf(r);if(i<0)return;
  const tmp=document.createElement('tbody');tmp.innerHTML=rowHTML(r,i,i?list[i-1]:null);const n=tmp.firstElementChild;
  if(done(r)&&r.key){const b=n.querySelector('.kbb');if(b)b.appendChild(CR.keyBadge(r.key))}
  tr.replaceWith(n);drawOverviews(n);
}
// "USB for Pioneer · 12 pts" / "Renamed copies (ZIP) · 12 pts": the price of the rows that would go into the folder
// (both folder exports cost 'usb' per song; plan discount included, '' when free)
function renderUsbPts(rows){const n=(rows||exportRows()).filter(r=>r.file).length,c=n&&CR.priceChip?CR.priceChip('usb',n):'';
  for(const [b,k] of [['#crUsb','crUsb'],['#crZip','crZip']]){const el=$(b+'Pts');if(!el)continue;el.hidden=!c;el.textContent=c;$(b).setAttribute('aria-label',t(k)+(c?' · '+c:''))}}
document.addEventListener('cr-prices',()=>{if(C.built)renderUsbPts()});
function renderExp(){
  if(!C.built)return;
  const rows=exportRows(),n=rows.length;
  $('#crExpN').textContent=t('crExportN',{n});
  ['#crCsv','#crXml','#crNml','#crM3u'].forEach(s=>$(s).disabled=!n);
  $('#crCuesOld').hidden=!rows.some(r=>!cueList(r).length);
  $('#crZip').disabled=!rows.some(r=>r.file)||C.zipBusy;$('#crUsb').disabled=!rows.some(r=>r.file)||C.zipBusy;
  renderUsbPts(rows);
  const restored=C.rows.some(r=>done(r)&&!r.file);
  let rn=$('#crRest');
  if(restored&&!rn){rn=document.createElement('p');rn.id='crRest';rn.className='snote crrest';$('#crMain').insertBefore(rn,$('#crMain').querySelector('.crtools'))}
  if(rn){rn.hidden=!restored;rn.textContent=t('crRestored')}
}

/* ---------- page-wide drop while the crate is open (runs before app.js' window handlers) ---------- */
let dd=0;
const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter',e=>{if(!C.visible||!hasFiles(e))return;e.stopImmediatePropagation();dd++;$('#crOver').hidden=false},true);
window.addEventListener('dragleave',e=>{if(!C.visible||!hasFiles(e))return;e.stopImmediatePropagation();dd=Math.max(0,dd-1);if(!dd)$('#crOver').hidden=true},true);
window.addEventListener('drop',e=>{if(!C.visible)return;e.preventDefault();e.stopImmediatePropagation();dd=0;$('#crOver').hidden=true;if(e.dataTransfer)collect(e.dataTransfer)},true);

/* ---------- who owns the crate ---------- */
function setOwner(uid){
  uid=uid||null;if(C.owner===uid)return;
  // guest → signing in with an empty crate: the guest's rows (and loaded files) move to the account
  if(C.owner===null&&uid&&C.rows.length){let mine=null;try{mine=localStorage.getItem(LS_K+':'+uid)}catch(e){}
    if(!mine){C.owner=uid;save();try{localStorage.removeItem(LS_K+':guest')}catch(e){}return}}
  const early=C.owner===undefined?C.rows.slice():[];   // files added before we knew who is signed in stay
  if(C.running)C.cancel=true;
  plStop();
  C.owner=uid;load();
  for(const r of early)if(!C.rows.some(x=>x.name===r.name&&x.size===r.size))C.rows.push(r);
  if(early.length){save();setTimeout(pump,0)}
  if(C.built){const fi=$('#crFolderIn');if(fi)fi.value=C.folder;const q=$('#crQ');if(q)q.value='';renderAll()}
}
document.addEventListener('cr-user',e=>setOwner(e.detail&&e.detail.uid));
{const u=CR.user&&CR.user();if(u&&u.known)setOwner(u.uid)}

/* ---------- public ---------- */
window.CRATE={
  show(){if(!C.built)build();C.visible=true;renderAll();lookupArtists()},
  hide(){C.visible=false;dd=0;plStop();const o=$('#crOver');if(o)o.hidden=true},
  lang(){if(C.built)renderAll()},
  tagMp3, // ID3 TBPM/TKEY/COMM + Serato Markers2 cues into an MP3 (used by the Extended generator export)
  _C:C,_tagMp3:tagMp3,_tagFlac:tagFlac,_latOf:latOf,_usbName:usbName,_parseName:parseName // for tests
};
CR.applyLang();
if($('#crateView')&&!$('#crateView').hidden)CRATE.show();
})();
