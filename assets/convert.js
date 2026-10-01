/*
 * Converter (#convert): batch media conversion that runs entirely in the browser (nothing is uploaded).
 * Talks to the app only through window.CR (bridge at the end of app.js). Options (never files) are remembered in
 * localStorage `chordroom.convert.v1`.
 *
 * Pipeline per file:  read → tags (own readers: ID3v2 in MP3/WAV/AIFF, Vorbis comments + PICTURE in FLAC/OGG, iTunes
 * ilst in MP4/M4A/MOV) → decode → process (trim silence, channels, resample through an OfflineAudioContext, −14 LUFS
 * normalise via CR.loudness, fades) → encode → tags written back → Blob.
 *   fast path  decode: Web Audio decodeAudioData · encode: WAV (own writer, 16/24-bit, LIST INFO + id3 chunk) and
 *              MP3 (window.MP3 = lamejs worker; our ID3v2.3 tag with APIC cover replaces the worker's tag)
 *   ffmpeg     everything the browser cannot do: video containers (mp4/mov/webm/mkv…), formats decodeAudioData
 *              rejects (AIFF, WMA, AAC in builds without it…), and FLAC / OGG-Vorbis / M4A-AAC encoding.
 *              vendor/ffmpeg/ffmpeg-core-0.12.10.js + .wasm.bin (gzip, inflated here, 10 MB once per browser cache),
 *              driven by assets/ffmpeg-worker.js. Loaded lazily on first need with a progress bar.
 * "Images" tab: cover-art resize/convert through a canvas (jpg/png/webp, square 500/1000/1500 or original).
 */
(function(){
'use strict';
const CR=window.CR;if(!CR)return;
const {t,$,esc}=CR;

/* ---------- strings (he / en / ar / ru / es) ---------- */
CR.addStrings({
he:{navConvert:'המרה',cvEyebrow:'המרת קבצים · הכול במכשיר שלכם',cvTitle:'ממיר קבצים',
  cvSub:'גוררים הרבה קבצי אודיו או וידאו ומקבלים MP3, WAV, FLAC, OGG או M4A, עם התגיות והעטיפה. שום דבר לא עולה לשרת: ההמרה רצה בדפדפן.',
  cvTabAudio:'אודיו',cvTabImages:'תמונות',cvAdd:'הוספת קבצים',cvDropT:'גררו לכאן קבצי אודיו או וידאו',
  cvDropH:'MP3, WAV, FLAC, OGG, M4A, AAC, AIFF · וידאו: MP4, MOV, WebM, MKV (מחלצים את הפסקול) · עד {n} קבצים',
  cvPrivacy:'ההמרה רצה אצלכם במכשיר. הקבצים לא נשלחים לשום מקום, גם לא אלינו.',
  cvFmt:'פורמט יעד',cvQ:'איכות',cvBits:'{n} ביט',cvKbps:'{n} kbps',cvSr:'קצב דגימה',cvKeep:'כמו המקור',cvCh:'ערוצים',cvStereo:'סטריאו',cvMono:'מונו',
  cvNorm:'נרמול ל־⁦−14 LUFS⁩',cvNormT:'עוצמה אחידה לכל הקבצים (תקן הסטרימינג), עם תקרה של ⁦−1 dBFS⁩',
  cvTrim:'חיתוך שקט בהתחלה ובסוף',cvFade:'כניסה / יציאה הדרגתית',cvFadeIn:'כניסה',cvFadeOut:'יציאה',cvSec:'שנ׳',
  cvTags:'שמירת התגיות: שם, אמן, אלבום ועטיפה',cvBk:'הוספת BPM וסולם לתגיות',cvBkT:'איטי יותר: כל קובץ מנותח קודם',
  cvConvert:'המרה של הכול',cvConvertN:'המרה של {n} קבצים',cvCancel:'ביטול',cvZip:'הורדת הכול (ZIP)',cvClear:'ניקוי הרשימה',cvRemove:'הסרה',cvDownload:'הורדה',cvRetry:'ניסיון נוסף',
  cvThName:'קובץ',cvThSize:'גודל',cvThDur:'אורך',cvThFmt:'פורמט',cvThStatus:'מצב',cvThOut:'תוצאה',cvThDim:'מידות',
  stReady:'מוכן',stQueued:'ממתין',stReading:'קורא…',stDecoding:'מפענח…',stProcessing:'מעבד…',stAnalyzing:'מנתח BPM וסולם…',stEncoding:'מקודד… {p}%',stDone:'הושלם',stCancelled:'בוטל',
  erRead:'לא הצלחנו לקרוא את הקובץ. האם זה קובץ אודיו או וידאו?',erBig:'הקובץ גדול מדי (מעל {n} MB).',erEngine:'מנוע ההמרה לא נטען. בדקו את החיבור לאינטרנט ונסו שוב.',
  erEncode:'הקידוד נכשל: {m}',erNoAudio:'לא נמצא פסקול בקובץ.',erMany:'אפשר עד {n} קבצים בבת אחת.',erImg:'לא הצלחנו לפתוח את התמונה.',
  cvEngine:'טוען את מנוע ההמרה ({s} MB, פעם אחת בלבד)… {p}%',cvEngineT:'נדרש ל־FLAC, OGG, M4A ולקובצי וידאו',
  cvDone:'הושלמו {n} קבצים',cvDoneErr:'{n} נכשלו',cvNothing:'קודם מוסיפים קבצים.',cvZipBusy:'אורז ZIP…',cvZipDone:'ה־ZIP מוכן ({s} MB).',
  cvImgDropT:'גררו לכאן תמונות',cvImgDropH:'PNG, JPG, WebP, GIF, BMP · עטיפות לשירים, בגודל שהנגנים אוהבים',
  cvImgSize:'גודל',cvImgSq:'{n} × {n} פיקסלים',cvImgOrig:'גודל מקורי',cvImgNote:'הגדלים הריבועיים נחתכים מהמרכז, כמו שנגנים מציגים עטיפות.',
  cvFiles:'{n} קבצים',cvAfter:'אחרי',cvFilesIn:'במכשיר',
  stTagging:'כותב תגיות…',cvRunning:'ממיר…',cvEta:'נותרו בערך {t}',cvAllDone:'הכול מוכן',cvEngineH:'מכין את מנוע ההמרה…',cvEngineS:'פעם אחת בלבד · {s} MB',cvEngineLocal:'רץ אצלכם במכשיר. שום דבר לא עולה לשרת.',cvEng1:'הורדה',cvEng2:'פריסה',cvEng3:'הפעלה',cvAny:'כל פורמט',cvTagsKept:'תגיות נשמרות',cvNoTags:'בלי תגיות',cvTrimS:'חיתוך שקט',cvFadeS:'פייד',cvBkS:'BPM וסולם',cvLossless:'ללא איבוד',spDecode:'פענוח',spProcess:'עיבוד',spEncode:'קידוד',spTags:'תגיות',cvOfN:'{a} מתוך {b}',cvAgain:'המרה מחדש',cvSmaller:'קטן ב־{p}%',cvLarger:'גדול ב־{p}%',cvSummary:'סיכום ההגדרות'},
en:{navConvert:'Convert',cvEyebrow:'File conversion · all on your device',cvTitle:'Converter',
  cvSub:'Drop many audio or video files and get MP3, WAV, FLAC, OGG or M4A, tags and cover included. Nothing is uploaded: the conversion runs in your browser.',
  cvTabAudio:'Audio',cvTabImages:'Images',cvAdd:'Add files',cvDropT:'Drop audio or video files here',
  cvDropH:'MP3, WAV, FLAC, OGG, M4A, AAC, AIFF · video: MP4, MOV, WebM, MKV (the soundtrack is extracted) · up to {n} files',
  cvPrivacy:'Everything runs on your device. Your files are not sent anywhere, not even to us.',
  cvFmt:'Output format',cvQ:'Quality',cvBits:'{n}-bit',cvKbps:'{n} kbps',cvSr:'Sample rate',cvKeep:'Same as source',cvCh:'Channels',cvStereo:'Stereo',cvMono:'Mono',
  cvNorm:'Normalise to −14 LUFS',cvNormT:'The same loudness for every file (the streaming standard), with a −1 dBFS ceiling',
  cvTrim:'Trim silence at start and end',cvFade:'Fade in / out',cvFadeIn:'In',cvFadeOut:'Out',cvSec:'s',
  cvTags:'Keep tags: title, artist, album, cover',cvBk:'Add BPM & key to the tags',cvBkT:'Slower: each file is analysed first',
  cvConvert:'Convert all',cvConvertN:'Convert {n} files',cvCancel:'Cancel',cvZip:'Download all (ZIP)',cvClear:'Clear list',cvRemove:'Remove',cvDownload:'Download',cvRetry:'Retry',
  cvThName:'File',cvThSize:'Size',cvThDur:'Length',cvThFmt:'Format',cvThStatus:'Status',cvThOut:'Result',cvThDim:'Dimensions',
  stReady:'Ready',stQueued:'Waiting',stReading:'Reading…',stDecoding:'Decoding…',stProcessing:'Processing…',stAnalyzing:'Analysing BPM & key…',stEncoding:'Encoding… {p}%',stDone:'Done',stCancelled:'Cancelled',
  erRead:'We couldn\'t read this file. Is it an audio or video file?',erBig:'This file is too big (over {n} MB).',erEngine:'The conversion engine couldn\'t be loaded. Check your connection and try again.',
  erEncode:'Encoding failed: {m}',erNoAudio:'No soundtrack was found in this file.',erMany:'Up to {n} files at a time.',erImg:'We couldn\'t open this image.',
  cvEngine:'Loading the conversion engine ({s} MB, only once)… {p}%',cvEngineT:'needed for FLAC, OGG, M4A and video files',
  cvDone:'{n} files done',cvDoneErr:'{n} failed',cvNothing:'Add files first.',cvZipBusy:'Packing ZIP…',cvZipDone:'ZIP ready ({s} MB).',
  cvImgDropT:'Drop images here',cvImgDropH:'PNG, JPG, WebP, GIF, BMP · cover art for your tracks, at the sizes players like',
  cvImgSize:'Size',cvImgSq:'{n} × {n} px',cvImgOrig:'Original size',cvImgNote:'Square sizes are cropped from the centre, the way players show cover art.',
  cvFiles:'{n} files',cvAfter:'after',cvFilesIn:'on device',
  stTagging:'Tagging…',cvRunning:'Converting…',cvEta:'about {t} left',cvAllDone:'All done',cvEngineH:'Preparing the conversion engine…',cvEngineS:'Only once · {s} MB',cvEngineLocal:'Runs on your device. Nothing is uploaded.',cvEng1:'Download',cvEng2:'Unpack',cvEng3:'Start',cvAny:'any format',cvTagsKept:'tags kept',cvNoTags:'no tags',cvTrimS:'silence trimmed',cvFadeS:'fades',cvBkS:'BPM & key',cvLossless:'lossless',spDecode:'decode',spProcess:'process',spEncode:'encode',spTags:'tags',cvOfN:'{a} of {b}',cvAgain:'Convert again',cvSmaller:'{p}% smaller',cvLarger:'{p}% larger',cvSummary:'Settings summary'},
ar:{navConvert:'تحويل',cvEyebrow:'تحويل الملفات · كل شيء على جهازك',cvTitle:'محوّل الملفات',
  cvSub:'اسحب ملفات صوت أو فيديو كثيرة واحصل على MP3 أو WAV أو FLAC أو OGG أو M4A مع الوسوم والغلاف. لا يُرفع شيء: التحويل يعمل في متصفحك.',
  cvTabAudio:'صوت',cvTabImages:'صور',cvAdd:'إضافة ملفات',cvDropT:'اسحب ملفات صوت أو فيديو إلى هنا',
  cvDropH:'MP3, WAV, FLAC, OGG, M4A, AAC, AIFF · فيديو: MP4, MOV, WebM, MKV (يُستخرج الصوت) · حتى {n} ملفًا',
  cvPrivacy:'كل شيء يعمل على جهازك. ملفاتك لا تُرسل إلى أي مكان، ولا حتى إلينا.',
  cvFmt:'صيغة الإخراج',cvQ:'الجودة',cvBits:'{n} بت',cvKbps:'{n} kbps',cvSr:'معدل العينات',cvKeep:'مثل المصدر',cvCh:'القنوات',cvStereo:'ستيريو',cvMono:'أحادي',
  cvNorm:'تطبيع إلى ⁦−14 LUFS⁩',cvNormT:'الشدة نفسها لكل الملفات (معيار البث)، مع سقف ⁦−1 dBFS⁩',
  cvTrim:'قص الصمت في البداية والنهاية',cvFade:'دخول / خروج تدريجي',cvFadeIn:'دخول',cvFadeOut:'خروج',cvSec:'ث',
  cvTags:'الاحتفاظ بالوسوم: العنوان والفنان والألبوم والغلاف',cvBk:'إضافة BPM والمقام إلى الوسوم',cvBkT:'أبطأ: يُحلَّل كل ملف أولًا',
  cvConvert:'تحويل الكل',cvConvertN:'تحويل {n} ملفات',cvCancel:'إلغاء',cvZip:'تنزيل الكل (ZIP)',cvClear:'مسح القائمة',cvRemove:'إزالة',cvDownload:'تنزيل',cvRetry:'إعادة المحاولة',
  cvThName:'الملف',cvThSize:'الحجم',cvThDur:'المدة',cvThFmt:'الصيغة',cvThStatus:'الحالة',cvThOut:'النتيجة',cvThDim:'الأبعاد',
  stReady:'جاهز',stQueued:'بانتظار',stReading:'يقرأ…',stDecoding:'يفكّ الترميز…',stProcessing:'يعالج…',stAnalyzing:'يحلّل BPM والمقام…',stEncoding:'يرمّز… {p}%',stDone:'تم',stCancelled:'أُلغي',
  erRead:'لم نتمكن من قراءة هذا الملف. هل هو ملف صوت أو فيديو؟',erBig:'الملف كبير جدًا (أكثر من {n} MB).',erEngine:'تعذّر تحميل محرك التحويل. تحقق من الاتصال وحاول مجددًا.',
  erEncode:'فشل الترميز: {m}',erNoAudio:'لم يُعثر على مسار صوتي في هذا الملف.',erMany:'حتى {n} ملفًا في المرة الواحدة.',erImg:'لم نتمكن من فتح هذه الصورة.',
  cvEngine:'يحمّل محرك التحويل ({s} MB، مرة واحدة فقط)… {p}%',cvEngineT:'مطلوب لـ FLAC وOGG وM4A وملفات الفيديو',
  cvDone:'اكتمل {n} ملفات',cvDoneErr:'فشل {n}',cvNothing:'أضف ملفات أولًا.',cvZipBusy:'يحزم ZIP…',cvZipDone:'ملف ZIP جاهز ({s} MB).',
  cvImgDropT:'اسحب الصور إلى هنا',cvImgDropH:'PNG, JPG, WebP, GIF, BMP · أغلفة لأغانيك بالأحجام التي تفضّلها المشغلات',
  cvImgSize:'الحجم',cvImgSq:'{n} × {n} بكسل',cvImgOrig:'الحجم الأصلي',cvImgNote:'الأحجام المربعة تُقص من المنتصف، كما تعرض المشغلات الأغلفة.',
  cvFiles:'{n} ملفات',cvAfter:'بعد',cvFilesIn:'على الجهاز',
  stTagging:'يكتب الوسوم…',cvRunning:'يحوّل…',cvEta:'يتبقى نحو {t}',cvAllDone:'اكتمل كل شيء',cvEngineH:'يجهّز محرك التحويل…',cvEngineS:'مرة واحدة فقط · {s} MB',cvEngineLocal:'يعمل على جهازك. لا يُرفع شيء.',cvEng1:'تنزيل',cvEng2:'فك الضغط',cvEng3:'تشغيل',cvAny:'أي صيغة',cvTagsKept:'الوسوم محفوظة',cvNoTags:'بلا وسوم',cvTrimS:'قص الصمت',cvFadeS:'تدرّج',cvBkS:'BPM والمقام',cvLossless:'بلا فقدان',spDecode:'فك',spProcess:'معالجة',spEncode:'ترميز',spTags:'وسوم',cvOfN:'{a} من {b}',cvAgain:'تحويل من جديد',cvSmaller:'أصغر بنسبة {p}%',cvLarger:'أكبر بنسبة {p}%',cvSummary:'ملخص الإعدادات'},
ru:{navConvert:'Конвертер',cvEyebrow:'Конвертация файлов · всё на вашем устройстве',cvTitle:'Конвертер',
  cvSub:'Перетащите много аудио- или видеофайлов и получите MP3, WAV, FLAC, OGG или M4A вместе с тегами и обложкой. Ничего не загружается: конвертация идёт в браузере.',
  cvTabAudio:'Аудио',cvTabImages:'Изображения',cvAdd:'Добавить файлы',cvDropT:'Перетащите сюда аудио или видео',
  cvDropH:'MP3, WAV, FLAC, OGG, M4A, AAC, AIFF · видео: MP4, MOV, WebM, MKV (извлекается звуковая дорожка) · до {n} файлов',
  cvPrivacy:'Всё работает на вашем устройстве. Файлы никуда не отправляются, даже нам.',
  cvFmt:'Формат',cvQ:'Качество',cvBits:'{n} бит',cvKbps:'{n} kbps',cvSr:'Частота дискретизации',cvKeep:'Как в источнике',cvCh:'Каналы',cvStereo:'Стерео',cvMono:'Моно',
  cvNorm:'Нормализовать до −14 LUFS',cvNormT:'Одинаковая громкость для всех файлов (стандарт стриминга) с потолком −1 dBFS',
  cvTrim:'Обрезать тишину в начале и в конце',cvFade:'Плавное начало / конец',cvFadeIn:'Начало',cvFadeOut:'Конец',cvSec:'с',
  cvTags:'Сохранять теги: название, исполнитель, альбом, обложка',cvBk:'Добавить BPM и тональность в теги',cvBkT:'Медленнее: каждый файл сначала анализируется',
  cvConvert:'Конвертировать всё',cvConvertN:'Конвертировать {n} файлов',cvCancel:'Отмена',cvZip:'Скачать всё (ZIP)',cvClear:'Очистить список',cvRemove:'Убрать',cvDownload:'Скачать',cvRetry:'Повторить',
  cvThName:'Файл',cvThSize:'Размер',cvThDur:'Длина',cvThFmt:'Формат',cvThStatus:'Статус',cvThOut:'Результат',cvThDim:'Размеры',
  stReady:'Готов',stQueued:'Ожидает',stReading:'Чтение…',stDecoding:'Декодирование…',stProcessing:'Обработка…',stAnalyzing:'Анализ BPM и тональности…',stEncoding:'Кодирование… {p}%',stDone:'Готово',stCancelled:'Отменено',
  erRead:'Не удалось прочитать файл. Это аудио- или видеофайл?',erBig:'Файл слишком большой (больше {n} МБ).',erEngine:'Не удалось загрузить движок конвертации. Проверьте соединение и попробуйте снова.',
  erEncode:'Кодирование не удалось: {m}',erNoAudio:'В файле нет звуковой дорожки.',erMany:'Не больше {n} файлов за раз.',erImg:'Не удалось открыть изображение.',
  cvEngine:'Загрузка движка конвертации ({s} МБ, только один раз)… {p}%',cvEngineT:'нужен для FLAC, OGG, M4A и видео',
  cvDone:'Готово: {n} файлов',cvDoneErr:'{n} с ошибкой',cvNothing:'Сначала добавьте файлы.',cvZipBusy:'Упаковка ZIP…',cvZipDone:'ZIP готов ({s} МБ).',
  cvImgDropT:'Перетащите сюда изображения',cvImgDropH:'PNG, JPG, WebP, GIF, BMP · обложки для треков в размерах, которые любят плееры',
  cvImgSize:'Размер',cvImgSq:'{n} × {n} px',cvImgOrig:'Исходный размер',cvImgNote:'Квадратные размеры обрезаются по центру — так плееры показывают обложки.',
  cvFiles:'{n} файлов',cvAfter:'после',cvFilesIn:'на устройстве',
  stTagging:'Запись тегов…',cvRunning:'Конвертация…',cvEta:'осталось около {t}',cvAllDone:'Всё готово',cvEngineH:'Подготовка движка конвертации…',cvEngineS:'Только один раз · {s} МБ',cvEngineLocal:'Работает на вашем устройстве. Ничего не загружается.',cvEng1:'Загрузка',cvEng2:'Распаковка',cvEng3:'Запуск',cvAny:'любой формат',cvTagsKept:'теги сохраняются',cvNoTags:'без тегов',cvTrimS:'обрезка тишины',cvFadeS:'фейды',cvBkS:'BPM и тональность',cvLossless:'без потерь',spDecode:'декодирование',spProcess:'обработка',spEncode:'кодирование',spTags:'теги',cvOfN:'{a} из {b}',cvAgain:'Конвертировать снова',cvSmaller:'меньше на {p}%',cvLarger:'больше на {p}%',cvSummary:'Сводка настроек'},
es:{navConvert:'Convertir',cvEyebrow:'Conversión de archivos · todo en tu dispositivo',cvTitle:'Conversor',
  cvSub:'Arrastra muchos archivos de audio o vídeo y obtén MP3, WAV, FLAC, OGG o M4A con sus etiquetas y carátula. No se sube nada: la conversión se hace en tu navegador.',
  cvTabAudio:'Audio',cvTabImages:'Imágenes',cvAdd:'Añadir archivos',cvDropT:'Arrastra aquí archivos de audio o vídeo',
  cvDropH:'MP3, WAV, FLAC, OGG, M4A, AAC, AIFF · vídeo: MP4, MOV, WebM, MKV (se extrae la pista de audio) · hasta {n} archivos',
  cvPrivacy:'Todo se ejecuta en tu dispositivo. Tus archivos no se envían a ningún sitio, ni siquiera a nosotros.',
  cvFmt:'Formato de salida',cvQ:'Calidad',cvBits:'{n} bits',cvKbps:'{n} kbps',cvSr:'Frecuencia de muestreo',cvKeep:'Como el original',cvCh:'Canales',cvStereo:'Estéreo',cvMono:'Mono',
  cvNorm:'Normalizar a −14 LUFS',cvNormT:'La misma sonoridad para todos los archivos (el estándar del streaming), con techo de −1 dBFS',
  cvTrim:'Recortar el silencio al principio y al final',cvFade:'Fundido de entrada / salida',cvFadeIn:'Entrada',cvFadeOut:'Salida',cvSec:'s',
  cvTags:'Conservar etiquetas: título, artista, álbum, carátula',cvBk:'Añadir BPM y tonalidad a las etiquetas',cvBkT:'Más lento: cada archivo se analiza primero',
  cvConvert:'Convertir todo',cvConvertN:'Convertir {n} archivos',cvCancel:'Cancelar',cvZip:'Descargar todo (ZIP)',cvClear:'Vaciar la lista',cvRemove:'Quitar',cvDownload:'Descargar',cvRetry:'Reintentar',
  cvThName:'Archivo',cvThSize:'Tamaño',cvThDur:'Duración',cvThFmt:'Formato',cvThStatus:'Estado',cvThOut:'Resultado',cvThDim:'Dimensiones',
  stReady:'Listo',stQueued:'En espera',stReading:'Leyendo…',stDecoding:'Decodificando…',stProcessing:'Procesando…',stAnalyzing:'Analizando BPM y tonalidad…',stEncoding:'Codificando… {p}%',stDone:'Hecho',stCancelled:'Cancelado',
  erRead:'No pudimos leer este archivo. ¿Es un archivo de audio o vídeo?',erBig:'El archivo es demasiado grande (más de {n} MB).',erEngine:'No se pudo cargar el motor de conversión. Revisa tu conexión e inténtalo de nuevo.',
  erEncode:'La codificación falló: {m}',erNoAudio:'No se encontró pista de audio en este archivo.',erMany:'Hasta {n} archivos a la vez.',erImg:'No pudimos abrir esta imagen.',
  cvEngine:'Cargando el motor de conversión ({s} MB, solo una vez)… {p}%',cvEngineT:'necesario para FLAC, OGG, M4A y vídeo',
  cvDone:'{n} archivos listos',cvDoneErr:'{n} fallaron',cvNothing:'Añade archivos primero.',cvZipBusy:'Empaquetando ZIP…',cvZipDone:'ZIP listo ({s} MB).',
  cvImgDropT:'Arrastra aquí imágenes',cvImgDropH:'PNG, JPG, WebP, GIF, BMP · carátulas para tus temas, en los tamaños que prefieren los reproductores',
  cvImgSize:'Tamaño',cvImgSq:'{n} × {n} px',cvImgOrig:'Tamaño original',cvImgNote:'Los tamaños cuadrados se recortan desde el centro, como muestran las carátulas los reproductores.',
  cvFiles:'{n} archivos',cvAfter:'después',cvFilesIn:'en el dispositivo',
  stTagging:'Escribiendo etiquetas…',cvRunning:'Convirtiendo…',cvEta:'quedan unos {t}',cvAllDone:'Todo listo',cvEngineH:'Preparando el motor de conversión…',cvEngineS:'Solo una vez · {s} MB',cvEngineLocal:'Se ejecuta en tu dispositivo. No se sube nada.',cvEng1:'Descarga',cvEng2:'Descompresión',cvEng3:'Inicio',cvAny:'cualquier formato',cvTagsKept:'etiquetas conservadas',cvNoTags:'sin etiquetas',cvTrimS:'silencio recortado',cvFadeS:'fundidos',cvBkS:'BPM y tonalidad',cvLossless:'sin pérdida',spDecode:'decodificar',spProcess:'procesar',spEncode:'codificar',spTags:'etiquetas',cvOfN:'{a} de {b}',cvAgain:'Convertir de nuevo',cvSmaller:'{p}% más pequeño',cvLarger:'{p}% más grande',cvSummary:'Resumen de ajustes'}
});

/* ---------- constants & state ---------- */
const LS='chordroom.convert.v1',MAX_FILES=50,MAX_MB=300,ENGINE_MB=10;
const FMT={
  wav:{label:'WAV',ext:'wav',mime:'audio/wav',q:[16,24],ql:'cvBits',dq:16},
  mp3:{label:'MP3',ext:'mp3',mime:'audio/mpeg',q:[128,192,256,320],ql:'cvKbps',dq:320},
  flac:{label:'FLAC',ext:'flac',mime:'audio/flac',q:null},
  ogg:{label:'OGG / Vorbis',ext:'ogg',mime:'audio/ogg',q:[112,128,160,192,224,256],ql:'cvKbps',dq:192},
  m4a:{label:'M4A / AAC',ext:'m4a',mime:'audio/mp4',q:[128,192,256,320],ql:'cvKbps',dq:256}
};
const SRS=[0,44100,48000];
const VIDEO=new Set(['mp4','m4v','mov','webm','mkv','avi','3gp','mpg','mpeg','ts','flv','wmv']);
const FF_ONLY=new Set(['aif','aiff','aifc','wma','ac3','amr','wv','ape','mka','caf','dts','mpc','tta','au','mid']);
const ACCEPT='audio/*,video/*,.mp3,.wav,.flac,.ogg,.oga,.opus,.m4a,.aac,.aif,.aiff,.wma,.mp4,.m4v,.mov,.webm,.mkv,.avi,.3gp';
const IMG_ACCEPT='image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif';
const DEF={fmt:'mp3',q:320,sr:0,ch:0,norm:false,trim:false,fin:0,fout:0,tags:true,bk:false,isize:1000,ifmt:'jpg'};
const C={built:false,visible:false,tab:'audio',rows:[],irows:[],running:false,abort:null,o:loadOpts(),msg:'',msgErr:false,zipBusy:false,seq:0,ffp:null,batch:null,fin:0};
function loadOpts(){let o={};try{o=JSON.parse(localStorage.getItem(LS)||'{}')||{}}catch(e){}const r={...DEF,...o};if(!FMT[r.fmt])r.fmt=DEF.fmt;return r}
function saveOpts(){try{localStorage.setItem(LS,JSON.stringify(C.o))}catch(e){}}
const ext=n=>{const m=/\.([a-z0-9]+)$/i.exec(n||'');return m?m[1].toLowerCase():''};
const base=n=>String(n||'').replace(/\.[a-z0-9]+$/i,'');
const mb=b=>(b/1048576).toFixed(b<10485760?2:1);
const fsz=b=>b<1048576?`${Math.max(1,Math.round(b/1024))} KB`:`${mb(b)} MB`;
const fmtDur=s=>{if(!(s>=0))return '—';s=Math.round(s);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`};
const ltr=s=>`<bdi dir="ltr">${esc(String(s))}</bdi>`;
const tt=(k,v)=>t(k).replace(/\{(\w+)\}/g,(m,x)=>v&&x in v?v[x]:m);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class Aborted extends Error{constructor(){super('aborted');this.aborted=true}}
const chk=sig=>{if(sig&&sig.aborted)throw new Aborted()};

/* ---------- ffmpeg.wasm (lazy) ---------- */
const FF={w:null,ready:null,gz:null,jobs:{},seq:0,fail:null};
const here=document.currentScript&&document.currentScript.src||document.baseURI;
const WORKER_URL=new URL('assets/ffmpeg-worker.js?v=1',document.baseURI).href;
const CORE_URL=new URL('vendor/ffmpeg/ffmpeg-core-0.12.10.js',document.baseURI).href;
const BIN_URL=new URL('vendor/ffmpeg/ffmpeg-core-0.12.10.wasm.bin',document.baseURI).href;
async function fetchProgress(url,prog){
  const res=await fetch(url);if(!res.ok)throw new Error('http '+res.status);
  const total=+res.headers.get('content-length')||ENGINE_MB*1048576;
  if(!res.body)return new Uint8Array(await res.arrayBuffer());
  const rd=res.body.getReader(),parts=[];let got=0;
  for(;;){const {done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;prog(Math.min(0.99,got/total))}
  const out=new Uint8Array(got);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out;
}
async function inflate(gz){
  if(typeof DecompressionStream==='undefined')throw new Error('no DecompressionStream');
  return new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
function ffLoad(prog){
  if(FF.ready)return FF.ready;
  prog=prog||(()=>{});
  FF.ready=(async()=>{
    try{
      if(!FF.gz)FF.gz=await fetchProgress(BIN_URL,p=>prog(p*0.85));
      prog(0.9);
      const wasm=await inflate(FF.gz);
      const w=new Worker(WORKER_URL);FF.w=w;
      w.onmessage=e=>{const d=e.data||{};if(d.type==='prog'){for(const k in FF.jobs)if(FF.jobs[k].onProg)FF.jobs[k].onProg(d.p);return}
        const j=FF.jobs[d.id];if(!j)return;delete FF.jobs[d.id];if(d.error)j.rej(new Error(d.error+(d.log?'\n'+d.log:'')));else j.res(d)};
      w.onerror=e=>{if(e&&e.preventDefault)e.preventDefault();ffKill(new Error('worker: '+(e&&e.message||'failed')))};
      await new Promise((res,rej)=>{const id=++FF.seq;FF.jobs[id]={res,rej};w.postMessage({id,type:'load',coreURL:CORE_URL,wasm},[wasm])});
      prog(1);return true;
    }catch(e){FF.ready=null;if(FF.w){try{FF.w.terminate()}catch(x){}FF.w=null}throw e}
  })();
  return FF.ready;
}
function ffKill(err){
  const w=FF.w;FF.w=null;FF.ready=null;if(w)try{w.terminate()}catch(e){}
  const jobs=FF.jobs;FF.jobs={};for(const k in jobs)jobs[k].rej(err||new Aborted());
}
async function ffRun(files,args,outs,sig,onProg){
  chk(sig);
  await ffLoad(p=>{C.ffp=p;renderEngine()});C.ffp=null;renderEngine();
  chk(sig);
  return new Promise((res,rej)=>{
    const id=++FF.seq;FF.jobs[id]={res,rej,onProg};
    const onAb=()=>ffKill(new Aborted());if(sig)sig.addEventListener('abort',onAb,{once:true});
    FF.w.postMessage({id,type:'run',files,args,outs},files.map(f=>f.data.buffer).filter((b,i,a)=>a.indexOf(b)===i));
    const fin=FF.jobs[id];const wrap=f=>v=>{if(sig)sig.removeEventListener('abort',onAb);f(v)};fin.res=wrap(res);fin.rej=wrap(rej);
  });
}

/* ---------- tag readers ---------- */
const TD=(enc,b)=>{try{return new TextDecoder(enc).decode(b)}catch(e){return ''}};
const str4=(u,p)=>String.fromCharCode(u[p],u[p+1],u[p+2],u[p+3]);
const u32le=(u,p)=>(u[p]|(u[p+1]<<8)|(u[p+2]<<16)|(u[p+3]<<24))>>>0;
const u32be=(u,p)=>((u[p]<<24)>>>0)+(u[p+1]<<16)+(u[p+2]<<8)+u[p+3];
const u16le=(u,p)=>u[p]|(u[p+1]<<8);
const ss=(u,p)=>((u[p]&127)<<21)|((u[p+1]&127)<<14)|((u[p+2]&127)<<7)|(u[p+3]&127);
function id3Str(enc,b){
  let s='';
  if(enc===0)s=TD('latin1',b);else if(enc===3)s=TD('utf-8',b);
  else if(enc===1)s=TD(b[0]===0xFE&&b[1]===0xFF?'utf-16be':'utf-16le',b);else if(enc===2)s=TD('utf-16be',b);
  return s.replace(/\0+$/,'').replace(/\0/g,' / ').trim();
}
function id3Read(u,p0){
  p0=p0||0;const T={};
  if(u.length<p0+10||u[p0]!==73||u[p0+1]!==68||u[p0+2]!==51)return T;
  const maj=u[p0+3],fl=u[p0+5],size=ss(u,p0+6),end=Math.min(u.length,p0+10+size);
  T._end=end+(maj===4&&(fl&16)?10:0);
  if(maj<3||(fl&128))return T;
  let p=p0+10;if(fl&64)p+=maj===3?4+u32be(u,p):ss(u,p);
  while(p+10<=end){
    if(u[p]===0)break;const id=str4(u,p);if(!/^[A-Z0-9]{4}$/.test(id))break;
    let n=maj===4?ss(u,p+4):u32be(u,p+4);if(maj===4&&p+10+n>end)n=u32be(u,p+4);if(p+10+n>end)break;
    const f2=u[p+9];let d=u.subarray(p+10,p+10+n);p+=10+n;
    if((f2&(maj===4?0x0F:0xC0))!==0)continue;   // compressed / encrypted / unsync
    if(id==='APIC'&&!T.cover){let q=1;while(q<d.length&&d[q])q++;const mime=TD('latin1',d.subarray(1,q))||'image/jpeg';q+=2;const enc=d[0],w=enc===1||enc===2?2:1;
      while(q+w<=d.length&&!(d[q]===0&&(w===1||d[q+1]===0)))q+=w;q+=w;if(q<d.length)T.cover={mime:mime.toLowerCase(),data:d.slice(q)};continue}
    if(id==='COMM'){const enc=d[0],w=enc===1||enc===2?2:1;let q=4;while(q+w<=d.length&&!(d[q]===0&&(w===1||d[q+1]===0)))q+=w;const txt=id3Str(enc,d.subarray(q+w));if(txt&&!T.comment)T.comment=txt;continue}
    if(id[0]!=='T'||id==='TXXX'||d.length<2)continue;
    const v=id3Str(d[0],d.subarray(1));if(!v)continue;
    const map={TIT2:'title',TPE1:'artist',TALB:'album',TCON:'genre',TYER:'year',TDRC:'year',TRCK:'track',TBPM:'bpm',TKEY:'key'};
    if(map[id]&&!T[map[id]])T[map[id]]=id==='TDRC'?v.slice(0,4):v;
  }
  if(T.genre){const m=/^\((\d+)\)\s*(.*)$/.exec(T.genre);if(m)T.genre=m[2]||T.genre}
  return T;
}
function vorbisRead(u,p,T){
  T=T||{};if(p+4>u.length)return T;const vl=u32le(u,p);p+=4+vl;if(p+4>u.length)return T;const n=u32le(u,p);p+=4;
  const map={title:'title',artist:'artist',album:'album',genre:'genre',date:'year',year:'year',tracknumber:'track',bpm:'bpm',tempo:'bpm',initialkey:'key',key:'key',comment:'comment',description:'comment'};
  for(let i=0;i<n&&p+4<=u.length;i++){const l=u32le(u,p);p+=4;if(p+l>u.length)break;const s=TD('utf-8',u.subarray(p,p+l));p+=l;const eq=s.indexOf('=');if(eq<0)continue;
    const k=s.slice(0,eq).toLowerCase(),v=s.slice(eq+1).trim();
    if(k==='metadata_block_picture'&&!T.cover){try{const b=Uint8Array.from(atob(v),c=>c.charCodeAt(0));const pic=flacPic(b);if(pic)T.cover=pic}catch(e){}}
    else if(map[k]&&v&&!T[map[k]])T[map[k]]=map[k]==='year'?v.slice(0,4):v}
  return T;
}
function flacPic(b){let p=4;const ml=u32be(b,p);p+=4;const mime=TD('latin1',b.subarray(p,p+ml));p+=ml;const dl=u32be(b,p);p+=4+dl+16;const n=u32be(b,p);p+=4;if(p+n>b.length)return null;return {mime:mime.toLowerCase()||'image/jpeg',data:b.slice(p,p+n)}}
function flacRead(u){
  const T={};if(str4(u,0)!=='fLaC')return T;let p=4;
  while(p+4<=u.length){const last=u[p]&128,type=u[p]&127,n=(u[p+1]<<16)|(u[p+2]<<8)|u[p+3];p+=4;if(p+n>u.length)break;
    if(type===4)vorbisRead(u,p,T);else if(type===6&&!T.cover){const pic=flacPic(u.subarray(p,p+n));if(pic)T.cover=pic}
    else if(type===0&&n>=18){T._sr=(u[p+10]<<12)|(u[p+11]<<4)|(u[p+12]>>4);T._ch=((u[p+12]>>1)&7)+1}
    p+=n;if(last)break}
  return T;
}
function oggRead(u){
  const T={};let p=0,serial=null,body=[],total=0,pages=0;
  while(p+27<=u.length&&pages<64&&total<4e6){
    if(str4(u,p)!=='OggS')break;const sn=u32le(u,p+14),ns=u[p+26];let len=0;for(let i=0;i<ns;i++)len+=u[p+27+i];const bs=p+27+ns;
    if(serial===null)serial=sn;
    if(sn===serial){if(pages>0){body.push(u.subarray(bs,bs+len));total+=len}pages++}
    p=bs+len;
    if(pages>1&&total>0){const b=concat(body);const op=TD('latin1',b.subarray(0,8));
      if(op==='OpusTags'){vorbisRead(b,8,T);break}if(op.slice(0,7)==='\x03vorbis'){vorbisRead(b,7,T);break}
      if(total>2e5&&op.slice(0,7)!=='\x03vorbi'&&op!=='OpusTag')break}
  }
  return T;
}
function concat(parts){let n=0;for(const p of parts)n+=p.length;const o=new Uint8Array(n);let q=0;for(const p of parts){o.set(p,q);q+=p.length}return o}
function mp4Read(u){
  const T={};
  const walk=(a,b,path)=>{let p=a;while(p+8<=b){let n=u32be(u,p),tp=str4(u,p+4),h=8;if(n===1){n=u32be(u,p+12)+u32be(u,p+8)*4294967296;h=16}else if(n===0)n=b-p;if(n<h)break;const e=Math.min(b,p+n);
      if(tp==='moov'||tp==='udta'||tp==='ilst'||tp==='trak'||tp==='mdia'||tp==='minf'||tp==='stbl'||tp==='stsd')walk(p+h,e,tp);
      else if(tp==='meta')walk(p+h+4,e,tp);
      else if(path==='ilst')item(tp,p+h,e);
      else if(tp==='mvhd'){const v=u[p+8];const ts=v===1?u32be(u,p+28):u32be(u,p+20);const d=v===1?u32be(u,p+32)*4294967296+u32be(u,p+36):u32be(u,p+24);if(ts)T._dur=d/ts}
      p=e}};
  const item=(tp,a,b)=>{let p=a;while(p+16<=b){const n=u32be(u,p),k=str4(u,p+4);if(n<16)break;if(k==='data'){const dt=u32be(u,p+8)&0xFFFFFF,d=u.subarray(p+16,Math.min(b,p+n));const s=()=>TD('utf-8',d).trim();
        const nm={'\xA9nam':'title','\xA9ART':'artist','\xA9alb':'album','\xA9gen':'genre','gnre':'genre','\xA9day':'year','\xA9cmt':'comment'}[tp];
        if(nm&&dt===1&&!T[nm])T[nm]=nm==='year'?s().slice(0,4):s();
        else if(tp==='trkn'&&d.length>=4&&!T.track)T.track=String((d[2]<<8)|d[3]);
        else if(tp==='tmpo'&&d.length>=2&&!T.bpm)T.bpm=String((d[0]<<8)|d[1]);
        else if(tp==='covr'&&!T.cover&&d.length>8)T.cover={mime:dt===14?'image/png':'image/jpeg',data:d.slice()}}
      p+=n}};
  try{walk(0,u.length,'')}catch(e){}
  return T;
}
function riffRead(u,aiff){
  const T={};if(u.length<12)return T;const big=aiff;let p=12;const sz=q=>big?u32be(u,q):u32le(u,q);
  while(p+8<=u.length){const id=str4(u,p),n=sz(p+4),a=p+8,b=Math.min(u.length,a+n);
    if(/^id3 $/i.test(id))Object.assign(T,id3Read(u,a));
    else if(id==='LIST'&&str4(u,a)==='INFO'){let q=a+4;const map={INAM:'title',IART:'artist',IPRD:'album',IGNR:'genre',ICRD:'year',ICMT:'comment',ITRK:'track'};
      while(q+8<=b){const k=str4(u,q),l=u32le(u,q+4);const v=TD('utf-8',u.subarray(q+8,Math.min(b,q+8+l))).replace(/\0+$/,'').trim();if(map[k]&&v&&!T[map[k]])T[map[k]]=map[k]==='year'?v.slice(0,4):v;q+=8+l+(l&1)}}
    p=b+(n&1)}
  return T;
}
function readTags(u,e){
  try{
    if(u[0]===73&&u[1]===68&&u[2]===51)return id3Read(u,0);
    const h=str4(u,0);
    if(h==='fLaC')return flacRead(u);
    if(h==='OggS')return oggRead(u);
    if(h==='RIFF')return riffRead(u,false);
    if(h==='FORM')return riffRead(u,true);
    if(str4(u,4)==='ftyp'||str4(u,4)==='moov'||str4(u,4)==='mdat')return mp4Read(u);
    if(e==='mp3'||e==='aac'){ // ID3v1 at the end, as a last resort
      const n=u.length;if(n>128&&u[n-128]===84&&u[n-127]===65&&u[n-126]===71){const s=(a,b)=>TD('latin1',u.subarray(n-128+a,n-128+b)).replace(/\0.*$/,'').trim();
        return {title:s(3,33)||undefined,artist:s(33,63)||undefined,album:s(63,93)||undefined,year:s(93,97)||undefined}}}
  }catch(x){}
  return {};
}
function ffmetaParse(txt,T){
  T=T||{};const map={title:'title',artist:'artist',album:'album',genre:'genre',date:'year',track:'track',comment:'comment',tmpo:'bpm',bpm:'bpm',initialkey:'key'};
  for(const line of String(txt).split('\n')){if(!line||line[0]===';'||line[0]==='[')continue;const eq=line.indexOf('=');if(eq<0)continue;
    const k=line.slice(0,eq).toLowerCase(),v=line.slice(eq+1).replace(/\\(.)/g,'$1').trim();if(map[k]&&v&&!T[map[k]])T[map[k]]=map[k]==='year'?v.slice(0,4):v}
  return T;
}

/* ---------- tag writers ---------- */
const latin=s=>[...String(s)].map(c=>c.charCodeAt(0)&255);
const u16=s=>{const a=[0xFF,0xFE];for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a.push(c&255,c>>8)}return a};
const isAscii=s=>/^[\x20-\x7E]*$/.test(s);
const encText=s=>isAscii(s)?[0,...latin(s)]:[1,...u16(s)];
function id3Tag(T){ // ID3v2.3, text frames ISO-8859-1 or UTF-16 with BOM, APIC = front cover
  const frames=[];const push=(id,body)=>{const n=body.length,h=[...latin(id),(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255,0,0];const f=new Uint8Array(10+n);f.set(h);f.set(body,10);frames.push(f)};
  const txt=(id,v)=>{v=String(v==null?'':v).replace(/\0/g,'').trim();if(v)push(id,encText(v))};
  txt('TIT2',T.title);txt('TPE1',T.artist);txt('TALB',T.album);txt('TCON',T.genre);txt('TYER',T.year);txt('TRCK',T.track);
  if(T.bpm&&isFinite(+T.bpm))txt('TBPM',String(Math.round(+T.bpm)));txt('TKEY',T.key);
  if(T.comment){const c=String(T.comment);push('COMM',isAscii(c)?[0,...latin('eng'),0,...latin(c)]:[1,...latin('eng'),...u16(''),0,0,...u16(c)])}
  if(T.cover&&T.cover.data&&T.cover.data.length){const h=[0,...latin(T.cover.mime||'image/jpeg'),0,3,0],b=new Uint8Array(h.length+T.cover.data.length);b.set(h);b.set(T.cover.data,h.length);push('APIC',b)}
  txt('TSSE','Chord Room');
  let n=0;for(const f of frames)n+=f.length;
  const out=new Uint8Array(10+n);out.set([73,68,51,3,0,0,(n>>>21)&127,(n>>>14)&127,(n>>>7)&127,n&127]);let o=10;for(const f of frames){out.set(f,o);o+=f.length}
  return out;
}
function stripId3(u){if(u.length>10&&u[0]===73&&u[1]===68&&u[2]===51&&u[6]<128){const n=ss(u,6)+10+(u[3]===4&&(u[5]&16)?10:0);return u.subarray(Math.min(n,u.length))}return u}
function flacPicture(c){const m=latin(c.mime||'image/jpeg'),be=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
  const h=[...be(3),...be(m.length),...m,...be(0),...be(0),...be(0),...be(0),...be(0),...be(c.data.length)];const o=new Uint8Array(h.length+c.data.length);o.set(h);o.set(c.data,h.length);return o}
function b64(u){let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}
function infoChunk(T){ // WAV LIST/INFO (UTF-8, what most players and DAWs read)
  const enc=new TextEncoder(),parts=[];const add=(k,v)=>{v=String(v==null?'':v).trim();if(!v)return;const b=enc.encode(v+'\0'),pad=b.length&1;parts.push(...latin(k),b.length&255,(b.length>>8)&255,(b.length>>16)&255,(b.length>>24)&255,...b);if(pad)parts.push(0)};
  add('INAM',T.title);add('IART',T.artist);add('IPRD',T.album);add('IGNR',T.genre);add('ICRD',T.year);add('ITRK',T.track);add('ICMT',T.comment);add('ISFT','Chord Room');
  return parts.length?[...latin('LIST'),...le32(4+parts.length),...latin('INFO'),...parts]:[];
}
const hasTags=T=>['title','artist','album','genre','year','track','bpm','key','comment','cover'].some(k=>T[k]);
const le32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
function chunk(id,data){const pad=data.length&1;const o=new Uint8Array(8+data.length+pad);o.set(latin(id));o.set(le32(data.length),4);o.set(data,8);return o}

/* ---------- WAV ---------- */
function wavPcm(chs,sr,bits,T){
  const nc=chs.length,n=chs[0].length,bps=bits/8,blk=nc*bps,dataLen=n*blk;
  const data=new Uint8Array(dataLen);const dv=new DataView(data.buffer);
  if(bits===16){for(let i=0,o=0;i<n;i++)for(let c=0;c<nc;c++,o+=2){let v=chs[c][i];v=v>1?1:v<-1?-1:v;dv.setInt16(o,v<0?v*32768:v*32767,true)}}
  else{for(let i=0,o=0;i<n;i++)for(let c=0;c<nc;c++,o+=3){let v=chs[c][i];v=v>1?1:v<-1?-1:v;let s=Math.round(v<0?v*8388608:v*8388607);data[o]=s&255;data[o+1]=(s>>8)&255;data[o+2]=(s>>16)&255}}
  const fmt=new Uint8Array(16);const fv=new DataView(fmt.buffer);fv.setUint16(0,1,true);fv.setUint16(2,nc,true);fv.setUint32(4,sr,true);fv.setUint32(8,sr*blk,true);fv.setUint16(12,blk,true);fv.setUint16(14,bits,true);
  const extra=[];if(T&&hasTags(T)){const info=infoChunk(T);if(info.length)extra.push(new Uint8Array(info));extra.push(chunk('id3 ',id3Tag(T)))}
  return riff([chunk('fmt ',fmt),chunk('data',data),...extra]);
}
function wavF32(chs,sr){
  const nc=chs.length,n=chs[0].length;const data=new Float32Array(n*nc);for(let c=0;c<nc;c++){const x=chs[c];for(let i=0,o=c;i<n;i++,o+=nc)data[o]=x[i]}
  const fmt=new Uint8Array(16);const fv=new DataView(fmt.buffer);fv.setUint16(0,3,true);fv.setUint16(2,nc,true);fv.setUint32(4,sr,true);fv.setUint32(8,sr*nc*4,true);fv.setUint16(12,nc*4,true);fv.setUint16(14,32,true);
  return riff([chunk('fmt ',fmt),chunk('data',new Uint8Array(data.buffer))]);
}
function riff(chunks){let n=4;for(const c of chunks)n+=c.length;const o=new Uint8Array(8+n);o.set(latin('RIFF'));o.set(le32(n),4);o.set(latin('WAVE'),8);let p=12;for(const c of chunks){o.set(c,p);p+=c.length}return o}
function wavParse(u){ // → {sr, chs:[Float32Array…]} for the float/16/24/32-bit WAV ffmpeg writes
  if(str4(u,0)!=='RIFF'&&str4(u,0)!=='RF64')throw new Error('not wav');
  let p=12,fmt=null,data=null;
  while(p+8<=u.length){const id=str4(u,p);let n=u32le(u,p+4);if(n===0xFFFFFFFF)n=u.length-p-8;const a=p+8;
    if(id==='fmt ')fmt={tag:u16le(u,a),nc:u16le(u,a+2),sr:u32le(u,a+4),bits:u16le(u,a+14),sub:n>=40?u16le(u,a+24):0};
    else if(id==='data'){data=u.subarray(a,Math.min(u.length,a+n));break}
    p=a+n+(n&1)}
  if(!fmt||!data||!fmt.nc)throw new Error('bad wav');
  const nc=fmt.nc,bps=fmt.bits/8,n=Math.floor(data.length/(nc*bps)),chs=[];for(let c=0;c<nc;c++)chs.push(new Float32Array(n));
  const dv=new DataView(data.buffer,data.byteOffset,data.byteLength),fl=fmt.tag===3||(fmt.tag===0xFFFE&&fmt.sub===3);
  for(let i=0,o=0;i<n;i++)for(let c=0;c<nc;c++,o+=bps){
    chs[c][i]=fl?(bps===4?dv.getFloat32(o,true):dv.getFloat64(o,true)):bps===2?dv.getInt16(o,true)/32768:bps===3?(((data[o]|(data[o+1]<<8)|(data[o+2]<<16))<<8)>>8)/8388608:dv.getInt32(o,true)/2147483648}
  return {sr:fmt.sr,chs};
}

/* ---------- decode ---------- */
function toBuffer(chs,sr){const b=CR.ac().createBuffer(chs.length,chs[0].length,sr);chs.forEach((x,i)=>b.copyToChannel(x,i));return b}
async function decode(r,sig){
  const e=r.ext;
  if(r.file.size>MAX_MB*1048576)throw Object.assign(new Error('big'),{code:'erBig'});
  r.status='reading';renderRow(r);
  const ab=await r.file.arrayBuffer();chk(sig);
  const u=new Uint8Array(ab);
  r.tags=C.o.tags?readTags(u,e):{};
  r.status='decoding';r.p=0;renderRow(r);
  let chs=null,sr=0;
  if(!VIDEO.has(e)&&!FF_ONLY.has(e)){
    try{const b=await CR.ac().decodeAudioData(ab.slice(0));sr=b.sampleRate;chs=[];for(let c=0;c<Math.min(2,b.numberOfChannels);c++)chs.push(b.getChannelData(c))}catch(x){chs=null}
  }
  chk(sig);
  if(!chs){
    const name='in.'+(e||'bin');
    let res;
    try{res=await ffRun([{name,data:u}],['-hide_banner','-nostats','-i',name,'-vn','-map','0:a:0','-f','wav','-c:a','pcm_f32le','-rf64','auto','dec.wav','-map_metadata','0','-f','ffmetadata','meta.txt'],['dec.wav','meta.txt'],sig,p=>{r.p=p;renderRow(r)})}
    catch(x){if(x.aborted)throw x;if(/not loaded|http |DecompressionStream|worker:|createFFmpegCore/.test(String(x.message)))throw Object.assign(x,{code:'erEngine'});throw Object.assign(x,{code:'erRead'})}
    const w=res.outs['dec.wav'];
    if(!w||w.length<44)throw Object.assign(new Error(res.log||'no audio'),{code:/does not contain any stream|Stream map .* matches no streams|No audio/i.test(res.log||'')?'erNoAudio':'erRead'});
    const d=wavParse(w);chs=d.chs.slice(0,2);sr=d.sr;
    if(res.outs['meta.txt']&&C.o.tags)ffmetaParse(TD('utf-8',res.outs['meta.txt']),r.tags);
  }
  if(!chs||!chs.length||!chs[0].length)throw Object.assign(new Error('empty'),{code:'erNoAudio'});
  r.sr=sr;r.ch=chs.length;r.dur=chs[0].length/sr;
  return {chs,sr};
}

/* ---------- process ---------- */
function trimSilence(chs,sr){
  const n=chs[0].length,win=Math.max(1,Math.round(sr*0.01)),th=0.00316,pad=Math.round(sr*0.02);
  const loud=i=>{const e=Math.min(n,i+win);for(const x of chs)for(let k=i;k<e;k++)if(Math.abs(x[k])>th)return true;return false};
  let a=0;while(a<n&&!loud(a))a+=win;if(a>=n)return chs;
  let b=n;while(b>a&&!loud(Math.max(0,b-win)))b-=win;
  a=Math.max(0,a-pad);b=Math.min(n,b+pad);
  return a===0&&b===n?chs:chs.map(x=>x.slice(a,b));
}
async function resample(chs,sr,tsr){
  const n=Math.ceil(chs[0].length*tsr/sr),oc=new OfflineAudioContext(chs.length,n,tsr);
  const src=oc.createBufferSource();src.buffer=toBuffer(chs,sr);src.connect(oc.destination);src.start(0);
  const out=await oc.startRendering();const o=[];for(let c=0;c<out.numberOfChannels;c++)o.push(out.getChannelData(c));return o;
}
async function process(d,o,r,sig){
  let chs=d.chs,sr=d.sr;
  r.status='processing';renderRow(r);
  if(o.trim)chs=trimSilence(chs,sr);
  const want=o.ch===1?1:o.ch===2?2:chs.length;
  if(want===1&&chs.length>1){const m=new Float32Array(chs[0].length);for(const x of chs)for(let i=0;i<m.length;i++)m[i]+=x[i]/chs.length;chs=[m]}
  else if(want===2&&chs.length===1)chs=[chs[0],chs[0]];
  else if(chs.length>2)chs=chs.slice(0,2);
  let tsr=o.sr||sr;
  if(tsr!==sr){chk(sig);chs=await resample(chs,sr,tsr);sr=tsr}
  if(!(chs[0].buffer instanceof ArrayBuffer)||chs[0].byteOffset!==0)chs=chs.map(x=>x.slice());
  if(o.norm&&CR.loudness){chk(sig);
    try{const L=await CR.loudness(toBuffer(chs,sr));
      if(L&&L.lufs!=null&&isFinite(L.lufs)){let g=Math.pow(10,(-14-L.lufs)/20);const pk=Math.pow(10,(L.peak||0)/20),ceil=Math.pow(10,-1/20);if(pk*g>ceil)g=ceil/pk;
        if(Math.abs(g-1)>1e-3)chs=chs.map(x=>{const y=new Float32Array(x.length);for(let i=0;i<x.length;i++)y[i]=x[i]*g;return y})}}catch(e){}}
  const fi=Math.round(clamp(+o.fin||0,0,30)*sr),fo=Math.round(clamp(+o.fout||0,0,30)*sr),n=chs[0].length;
  if(fi>0||fo>0){chs=chs.map(x=>{const y=x.slice();const a=Math.min(fi,n);for(let i=0;i<a;i++)y[i]*=i/a;const b=Math.min(fo,n);for(let i=0;i<b;i++)y[n-1-i]*=i/b;return y})}
  return {chs,sr};
}
const KEYS=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'],KEYSM=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const keyTag=k=>k?(k.mode?KEYSM[k.pc]+'m':KEYS[k.pc]):'';

/* ---------- encode ---------- */
function metaArgs(T,fmt){
  const a=[];const add=(k,v)=>{v=String(v==null?'':v).replace(/\0/g,'').trim();if(v)a.push('-metadata',k+'='+v)};
  add('title',T.title);add('artist',T.artist);add('album',T.album);add('genre',T.genre);add('date',T.year);add('track',T.track);add('comment',T.comment);
  if(fmt==='m4a'){if(T.bpm&&isFinite(+T.bpm))add('tmpo',Math.round(+T.bpm))}
  else{if(T.bpm&&isFinite(+T.bpm))add('bpm',Math.round(+T.bpm));add('initialkey',T.key)}
  add('encoder','Chord Room');
  return a;
}
async function encode(p,o,r,T,sig){
  const f=FMT[o.fmt];r.status='encoding';r.p=0;renderRow(r);
  const prog=x=>{r.p=x;renderRow(r)};
  if(o.fmt==='wav'){const pcm=wavPcm(p.chs,p.sr,o.q===24?24:16,T);r.status='tagging';r.p=1;renderRow(r);return new Blob([pcm],{type:f.mime})}
  if(o.fmt==='mp3'){
    if(!window.MP3||!MP3.supported)throw new Error('MP3 encoder unavailable');
    const L=p.chs[0],R=p.chs[1]||p.chs[0];
    const mp3=await MP3.encode(L,R,p.sr,{kbps:f.q.includes(+o.q)?+o.q:320,onProgress:prog});chk(sig);
    r.status='tagging';r.p=1;renderRow(r);
    return new Blob([id3Tag(T),stripId3(mp3)],{type:f.mime});
  }
  const files=[{name:'in.wav',data:wavF32(p.chs,p.sr)}],args=['-hide_banner','-nostats','-i','in.wav'],out='out.'+f.ext;
  const cover=T.cover&&T.cover.data&&T.cover.data.length&&/^image\/(jpeg|png)$/.test(T.cover.mime||'')?T.cover:null;
  const cname=cover?(cover.mime==='image/png'?'cover.png':'cover.jpg'):null;
  if(cover&&o.fmt!=='ogg'){files.push({name:cname,data:cover.data});args.push('-i',cname,'-map','0:a','-map','1:v','-c:v','copy','-disposition:v','attached_pic')}
  else args.push('-map','0:a');
  args.push(...metaArgs(T,o.fmt));
  if(o.fmt==='flac')args.push('-c:a','flac','-compression_level','5');
  else if(o.fmt==='ogg'){ // libvorbis quality steps ≈ 112/128/160/192/224/256 kbps (libopus crashes in the 0.12.10 wasm build)
    args.push('-c:a','libvorbis','-q:a',String({112:3,128:4,160:5,192:6,224:7,256:8}[+o.q]||6));if(cover)args.push('-metadata','METADATA_BLOCK_PICTURE='+b64(flacPicture(cover)))}
  else if(o.fmt==='m4a')args.push('-c:a','aac','-b:a',(f.q.includes(+o.q)?+o.q:256)+'k','-movflags','+faststart');
  args.push(out);
  let res;
  try{res=await ffRun(files,args,[out],sig,prog)}
  catch(x){if(x.aborted)throw x;if(/not loaded|http |DecompressionStream|worker:|createFFmpegCore/.test(String(x.message)))throw Object.assign(x,{code:'erEngine'});throw Object.assign(x,{code:'erEncode',m:shortLog(x.message)})}
  const data=res.outs[out];r.status='tagging';r.p=1;renderRow(r);
  if(!data||!data.length)throw Object.assign(new Error(res.log||'empty'),{code:'erEncode',m:shortLog(res.log)});
  return new Blob([data],{type:f.mime});
}
const shortLog=s=>{const L=String(s||'').trim().split('\n').filter(x=>/error|invalid|failed|not /i.test(x));return (L[L.length-1]||String(s||'').trim().split('\n').pop()||'').slice(0,120)};

/* ---------- the batch ---------- */
function outName(r,o){
  const used=new Set(C.rows.filter(x=>x!==r&&x.out).map(x=>x.out.name.toLowerCase()));
  let nm=base(r.name)||'audio',n=`${nm}.${FMT[o.fmt].ext}`,k=2;while(used.has(n.toLowerCase()))n=`${nm} (${k++}).${FMT[o.fmt].ext}`;return n;
}
async function runRow(r,o,sig){
  r.err=null;r.out=null;r.p=0;
  const d=await decode(r,sig);chk(sig);
  if(o.bk&&CR.analyzeTrack){r.status='analyzing';renderRow(r);
    try{const a=await CR.analyzeTrack(toBuffer(d.chs,d.sr),p=>{r.p=p;renderRow(r)});chk(sig);if(a&&a.bpm)r.tags.bpm=String(Math.round(a.bpm));if(a&&a.key)r.tags.key=keyTag(a.key)}catch(e){if(e&&e.aborted)throw e}}
  const p=await process(d,o,r,sig);chk(sig);
  const blob=await encode(p,o,r,r.tags||{},sig);chk(sig);
  r.out={blob,name:outName(r,o),size:blob.size,fmt:o.fmt};r.status='done';r.p=1;r.justDone=true;renderRow(r);
}
async function convertAll(only){
  if(C.running)return;
  const todo=(only?[only]:C.rows.filter(r=>r.status!=='done'||r.outFmt!==C.o.fmt)).filter(Boolean);
  if(!todo.length){setMsg(t('cvNothing'),true);return}
  const o={...C.o};C.running=true;C.abort=new AbortController();const sig=C.abort.signal;setMsg('');
  todo.forEach(r=>{r.status='queued';r.err=null});C.batch={t0:performance.now(),todo,total:todo.reduce((a,r)=>a+r.size,0)||1,ok:0,bad:0};C.fin=0;renderActs();renderTable();
  let ok=0,bad=0;
  CR.log&&CR.log('convert',`${todo.length} files → ${o.fmt}`);
  for(const r of todo){
    if(sig.aborted)break;
    try{await runRow(r,o,sig);ok++;C.batch.ok=ok}
    catch(e){
      if(e&&e.aborted){r.status='cancelled';renderRow(r);continue}
      console.warn('convert',r.name,e);bad++;C.batch.bad=bad;
      r.status='error';r.err=e&&e.code?tt(e.code,{n:MAX_MB,m:e.m||''}):t('erRead');renderRow(r);
    }
  }
  if(sig.aborted)C.rows.forEach(r=>{if(r.status==='queued'){r.status='cancelled';renderRow(r)}});
  C.running=false;C.abort=null;C.ffp=null;C.batch=null;C.fin=sig.aborted?0:(bad?1:2);renderEngine();renderActs();renderTable();
  setMsg(sig.aborted?t('stCancelled'):tt('cvDone',{n:ok})+(bad?' · '+tt('cvDoneErr',{n:bad}):''),!!bad&&!ok);
}
function cancelAll(){if(C.abort)C.abort.abort()}

/* ---------- files in ---------- */
function addFiles(list){
  const files=[...list].filter(f=>f&&f.size>0);if(!files.length)return;
  const room=MAX_FILES-C.rows.length;
  if(files.length>room){setMsg(tt('erMany',{n:MAX_FILES}),true)}
  for(const f of files.slice(0,Math.max(0,room))){
    const e=ext(f.name);
    C.rows.push({id:++C.seq,file:f,name:f.name,ext:e,size:f.size,dur:null,sr:0,ch:0,status:'ready',p:0,err:null,out:null,tags:{},fresh:true});
  }
  renderTable();renderActs();
}
function removeRow(id){if(C.running)return;C.rows=C.rows.filter(r=>r.id!==id);if(!C.rows.length)C.fin=0;renderTable();renderActs()}
function clearRows(){if(C.running)return;C.rows=[];C.fin=0;setMsg('');renderTable();renderActs()}
const safeUrl=f=>{try{return URL.createObjectURL(f)}catch(e){return ''}};
const dropImg=r=>{if(r.url)try{URL.revokeObjectURL(r.url)}catch(e){}};
async function zipAll(){
  const rows=C.rows.filter(r=>r.out);if(!rows.length||C.zipBusy)return;C.zipBusy=true;renderActs();setMsg(t('cvZipBusy'));
  try{const files=[];for(const r of rows)files.push({name:r.out.name,data:new Uint8Array(await r.out.blob.arrayBuffer())});
    const blob=CR.zip(files);CR.saveBlob(blob,'chord-room-convert.zip');setMsg(tt('cvZipDone',{s:mb(blob.size)}))}
  catch(e){console.error(e);setMsg(t('erRead'),true)}
  finally{C.zipBusy=false;renderActs()}
}

/* ---------- images ---------- */
const IFMT={jpg:{mime:'image/jpeg',ext:'jpg'},png:{mime:'image/png',ext:'png'},webp:{mime:'image/webp',ext:'webp'}};
const ISIZES=[500,1000,1500,0];
function addImages(list){
  const files=[...list].filter(f=>f&&f.size>0&&/^image\//.test(f.type||''));if(!files.length)return;
  for(const f of files.slice(0,Math.max(0,MAX_FILES-C.irows.length)))C.irows.push({id:++C.seq,file:f,name:f.name,size:f.size,status:'ready',out:null,err:null,w:0,h:0,fresh:true,url:safeUrl(f)});
  renderImgTable();renderImgActs();
  C.irows.filter(r=>!r.w).forEach(async r=>{try{const b=await createImageBitmap(r.file);r.w=b.width;r.h=b.height;b.close&&b.close()}catch(e){}renderImgRow(r)});
}
async function convertImages(){
  if(C.running)return;C.running=true;renderImgActs();
  const size=+C.o.isize||0,f=IFMT[C.o.ifmt]||IFMT.jpg;let ok=0,bad=0;
  for(const r of C.irows){
    if(r.status==='done'&&r.outKey===size+f.ext)continue;
    r.status='processing';r.err=null;renderImgRow(r);
    try{
      const bmp=await createImageBitmap(r.file);const W=size||bmp.width,H=size||bmp.height;
      const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');
      if(f.ext==='jpg'){g.fillStyle='#fff';g.fillRect(0,0,W,H)}
      let sx=0,sy=0,sw=bmp.width,sh=bmp.height;if(size){const s=Math.min(sw,sh);sx=(sw-s)/2;sy=(sh-s)/2;sw=sh=s}
      g.imageSmoothingQuality='high';g.drawImage(bmp,sx,sy,sw,sh,0,0,W,H);bmp.close&&bmp.close();
      const blob=await new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error('toBlob')),f.mime,0.92));
      const used=new Set(C.irows.filter(x=>x!==r&&x.out).map(x=>x.out.name.toLowerCase()));
      let nm=`${base(r.name)||'cover'}${size?'-'+size:''}.${f.ext}`,k=2;while(used.has(nm.toLowerCase()))nm=`${base(r.name)}${size?'-'+size:''} (${k++}).${f.ext}`;
      r.out={blob,name:nm,size:blob.size,w:W,h:H};r.outKey=size+f.ext;r.status='done';r.justDone=true;ok++;
    }catch(e){console.warn('image',r.name,e);r.status='error';r.err=t('erImg');bad++}
    renderImgRow(r);await new Promise(x=>setTimeout(x,0));
  }
  C.running=false;renderImgActs();renderImgTable();
  if(ok||bad)setMsg(tt('cvDone',{n:ok})+(bad?' · '+tt('cvDoneErr',{n:bad}):''),!!bad&&!ok,true);
}
async function zipImages(){
  const rows=C.irows.filter(r=>r.out);if(!rows.length||C.zipBusy)return;C.zipBusy=true;renderImgActs();
  try{const files=[];for(const r of rows)files.push({name:r.out.name,data:new Uint8Array(await r.out.blob.arrayBuffer())});CR.saveBlob(CR.zip(files),'chord-room-covers.zip')}
  catch(e){console.error(e)}finally{C.zipBusy=false;renderImgActs()}
}

/* ---------- messages ---------- */
function setMsg(m,err,img){C.msg=m||'';C.msgErr=!!err;const el=$(img?'#cvIMsg':'#cvMsg');if(!el)return;el.textContent=C.msg;el.classList.toggle('err',!!err)}

/* ---------- build & render ---------- */
const IC={
  files:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  img:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M20 15l-4.5-4.5L8 18"/></svg>',
  dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 7.6-8 9-4.6-1.4-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>',
  ok:'<svg class="cvok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" pathLength="1"/><path d="M7.5 12.3l3 3 6-6.3" pathLength="1"/></svg>',
  bad:'<svg class="cvbadx" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/></svg>',
  eq:'<span class="cveq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>'
};
const RUNS=new Set(['reading','decoding','analyzing','processing','encoding','tagging']);
const STG={ready:0,queued:0,reading:0.03,decoding:0.06,analyzing:0.36,processing:0.56,encoding:0.62,tagging:0.985,done:1,error:1,cancelled:0};
const SPAN={decoding:0.3,analyzing:0.2,encoding:0.36};
const rowFrac=r=>Math.min(1,(STG[r.status]||0)+(SPAN[r.status]?SPAN[r.status]*(r.p||0):0));
const STEP={reading:0,decoding:0,analyzing:1,processing:1,encoding:2,tagging:3,done:4};
const noMotion=()=>document.documentElement.classList.contains('a11y-noanim')||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const bump=(el,cls)=>{if(!el)return;el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)};
function build(){
  const v=$('#convertView');
  v.innerHTML=`
<div class="dhead cvhead">
  <div><div class="eyebrow" data-i="cvEyebrow"></div><h1 data-i="cvTitle"></h1><p data-i="cvSub"></p></div>
  <div class="cvtabs" role="tablist" id="cvTabs">
    <button type="button" role="tab" class="on" data-tab="audio" aria-selected="true" aria-controls="cvAudio"><span data-i="cvTabAudio"></span></button>
    <button type="button" role="tab" data-tab="images" aria-selected="false" aria-controls="cvImages"><span data-i="cvTabImages"></span></button>
  </div>
</div>
<div id="cvAudio" role="tabpanel">
  <div class="cvstage" id="cvDrop">
    <div class="cvsweep" aria-hidden="true"></div>
    <div class="cvsin">
      <div class="cvdi" aria-hidden="true"><span class="cvbars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
      <b data-i="cvDropT"></b>
      <p class="snote" id="cvDropH"></p>
      <div class="cvpills" dir="ltr" aria-hidden="true"><span class="cvpill src" id="cvPillSrc"></span><span class="cvflow"><i></i><i></i><i></i></span><span class="cvpill dst" id="cvPillDst"></span></div>
      <div class="cvdb"><label class="btn solid" for="cvFile">${IC.files}<span data-i="cvAdd"></span></label>
        <input type="file" id="cvFile" multiple accept="${ACCEPT}" hidden></div>
      <p class="snote cvpriv">${IC.lock}<span data-i="cvPrivacy"></span></p>
    </div>
  </div>
  <div class="cvopts" id="cvOpts"></div>
  <div class="cvengine" id="cvEngine" hidden></div>
  <div class="cvconsole" id="cvActs"></div>
  <p class="cvmsg" id="cvMsg" role="status" aria-live="polite"></p>
  <div class="cvlist" id="cvTableWrap" hidden><div class="cvcards" id="cvBody"></div></div>
</div>
<div id="cvImages" role="tabpanel" hidden>
  <div class="cvstage" id="cvIDrop">
    <div class="cvsweep" aria-hidden="true"></div>
    <div class="cvsin">
      <div class="cvdi cvdimg" aria-hidden="true">${IC.img}</div>
      <b data-i="cvImgDropT"></b>
      <p class="snote" data-i="cvImgDropH"></p>
      <div class="cvdb"><label class="btn solid" for="cvIFile">${IC.files}<span data-i="cvAdd"></span></label>
        <input type="file" id="cvIFile" multiple accept="${IMG_ACCEPT}" hidden></div>
      <p class="snote cvpriv">${IC.lock}<span data-i="cvPrivacy"></span></p>
    </div>
  </div>
  <div class="cvopts" id="cvIOpts"></div>
  <div class="cvconsole" id="cvIActs"></div>
  <p class="cvmsg" id="cvIMsg" role="status" aria-live="polite"></p>
  <div class="cvlist" id="cvITableWrap" hidden><div class="cvcards cvigrid" id="cvIBody"></div></div>
</div>`;
  C.built=true;
  $('#cvTabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab)});
  $('#cvFile').addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
  $('#cvIFile').addEventListener('change',e=>{addImages(e.target.files);e.target.value=''});
  // drag & drop anywhere on the view
  let dd=0;
  v.addEventListener('dragenter',e=>{if(!C.visible||![...e.dataTransfer.types].includes('Files'))return;dd++;v.classList.add('over')});
  v.addEventListener('dragleave',()=>{dd=Math.max(0,dd-1);if(!dd)v.classList.remove('over')});
  v.addEventListener('dragover',e=>e.preventDefault());
  v.addEventListener('drop',e=>{e.preventDefault();dd=0;v.classList.remove('over');if(!C.visible)return;const fs=[...e.dataTransfer.files];
    if(C.tab==='images')addImages(fs);else{const im=fs.filter(f=>/^image\//.test(f.type||'')),au=fs.filter(f=>!/^image\//.test(f.type||''));if(au.length)addFiles(au);if(im.length&&!au.length){setTab('images');addImages(im)}}});
  $('#cvBody').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const r=C.rows.find(x=>x.id===+b.dataset.id);if(!r)return;
    if(b.dataset.a==='dl'&&r.out)CR.saveBlob(r.out.blob,r.out.name);else if(b.dataset.a==='rm')removeRow(r.id);else if(b.dataset.a==='retry')convertAll(r)});
  $('#cvIBody').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const r=C.irows.find(x=>x.id===+b.dataset.id);if(!r)return;
    if(b.dataset.a==='dl'&&r.out)CR.saveBlob(r.out.blob,r.out.name);else if(b.dataset.a==='rm'&&!C.running){dropImg(r);C.irows=C.irows.filter(x=>x!==r);renderImgTable();renderImgActs()}});
  $('#cvOpts').addEventListener('change',onOpt);$('#cvOpts').addEventListener('input',onOpt);
  $('#cvIOpts').addEventListener('change',e=>{const el=e.target;if(el.name==='isize')C.o.isize=+el.value;if(el.name==='ifmt')C.o.ifmt=el.value;saveOpts();renderImgSummary()});
  $('#cvActs').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;if(a==='go')convertAll();else if(a==='cancel')cancelAll();else if(a==='zip')zipAll();else if(a==='clear')clearRows()});
  $('#cvIActs').addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;if(a==='go')convertImages();else if(a==='zip')zipImages();else if(a==='clear'&&!C.running){C.irows.forEach(dropImg);C.irows=[];renderImgTable();renderImgActs()}});
}
function setTab(k){C.tab=k;$('#cvTabs').querySelectorAll('[data-tab]').forEach(b=>{const on=b.dataset.tab===k;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on))});$('#cvAudio').hidden=k!=='audio';$('#cvImages').hidden=k!=='images'}
function onOpt(e){
  const el=e.target,n=el.name;if(!n)return;
  if(e.type==='input'&&el.type!=='number')return; // radios/checkboxes/selects: 'change' only
  if(n==='fmt'){if(!el.checked)return;C.o.fmt=el.value;const f=FMT[C.o.fmt];if(f.q&&!f.q.includes(+C.o.q))C.o.q=f.dq;renderOpts();bump($('#cvPillDst'),'morph')}
  else if(n==='q')C.o.q=+el.value;else if(n==='sr')C.o.sr=+el.value;else if(n==='ch')C.o.ch=+el.value;
  else if(n==='fin'||n==='fout')C.o[n]=clamp(+el.value||0,0,30);
  else if(el.type==='checkbox')C.o[n]=el.checked;
  saveOpts();renderSummary();if(n==='fmt'){renderActs();renderTable()}
}
function qualityLabel(o){const f=FMT[o.fmt];return f.q?tt(f.ql,{n:o.q}):t('cvLossless')}
function summaryParts(o){
  const f=FMT[o.fmt],p=[`${f.label.split(' ')[0]} ${qualityLabel(o)}`];
  if(o.sr)p.push(`${o.sr/1000} kHz`);
  p.push(o.ch===1?t('cvMono'):o.ch===2?t('cvStereo'):t('cvKeep'));
  if(o.norm)p.push('−14 LUFS');if(o.trim)p.push(t('cvTrimS'));if(+o.fin||+o.fout)p.push(t('cvFadeS'));
  p.push(o.tags?t('cvTagsKept'):t('cvNoTags'));if(o.bk)p.push(t('cvBkS'));
  return p;
}
function renderSummary(){const el=$('#cvSum');if(el)el.innerHTML=summaryParts(C.o).map(x=>`<bdi>${esc(x)}</bdi>`).join('<i>·</i>');renderPills()}
function renderImgSummary(){const el=$('#cvISum');if(!el)return;const o=C.o;el.innerHTML=[String(IFMT[o.ifmt]?o.ifmt.toUpperCase():'JPG'),o.isize?tt('cvImgSq',{n:o.isize}):t('cvImgOrig')].map(x=>`<bdi>${esc(x)}</bdi>`).join('<i>·</i>')}
function renderPills(){
  const src=$('#cvPillSrc'),dst=$('#cvPillDst');if(!src)return;
  const ex=[...new Set(C.rows.map(r=>(r.ext||'?').toUpperCase()))];
  const txt=ex.length?ex.slice(0,3).join(' · ')+(ex.length>3?` +${ex.length-3}`:''):t('cvAny');
  if(src.textContent!==txt){src.textContent=txt;bump(src,'morph')}
  const d=FMT[C.o.fmt].label.split(' ')[0];if(dst.textContent!==d)dst.textContent=d;
}
function renderOpts(){
  const o=C.o,f=FMT[o.fmt];
  const sel=(name,opts,val,lbl)=>`<label class="cvf"><span>${esc(t(lbl))}</span><select class="sel" name="${name}" aria-label="${esc(t(lbl))}">${opts.map(([v,l])=>`<option value="${v}"${String(v)===String(val)?' selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
  const tog=(name,lbl,title)=>`<label class="tog cvtog"${title?` title="${esc(t(title))}"`:''}><span>${esc(t(lbl))}</span><input type="checkbox" name="${name}"${o[name]?' checked':''}></label>`;
  const seg=`<div class="cvf cvfmt"><span id="cvFmtL">${esc(t('cvFmt'))}</span><div class="cvseg" role="radiogroup" aria-labelledby="cvFmtL">${Object.keys(FMT).map(k=>`<label class="${k===o.fmt?'on':''}"><input type="radio" name="fmt" value="${k}"${k===o.fmt?' checked':''}><span>${esc(FMT[k].label.split(' ')[0])}</span></label>`).join('')}</div></div>`;
  $('#cvOpts').innerHTML=`
  <div class="cvog">
    ${seg}
    ${f.q?sel('q',f.q.map(q=>[q,tt(f.ql,{n:q})]),o.q,'cvQ'):`<label class="cvf"><span>${esc(t('cvQ'))}</span><span class="cvfix">${esc(t('cvLossless'))}</span></label>`}
    ${sel('sr',SRS.map(s=>[s,s?`${s/1000} kHz`:t('cvKeep')]),o.sr,'cvSr')}
    ${sel('ch',[[0,t('cvKeep')],[2,t('cvStereo')],[1,t('cvMono')]],o.ch,'cvCh')}
  </div>
  <div class="cvog cvtogs">
    ${tog('norm','cvNorm','cvNormT')}${tog('trim','cvTrim')}
    <div class="tog cvtog cvfade"><span>${esc(t('cvFade'))}</span><span class="cvfi"><label><span>${esc(t('cvFadeIn'))}</span><input type="number" name="fin" min="0" max="30" step="0.5" value="${+o.fin||0}" dir="ltr"><i>${esc(t('cvSec'))}</i></label><label><span>${esc(t('cvFadeOut'))}</span><input type="number" name="fout" min="0" max="30" step="0.5" value="${+o.fout||0}" dir="ltr"><i>${esc(t('cvSec'))}</i></label></span></div>
    ${tog('tags','cvTags')}${tog('bk','cvBk','cvBkT')}
  </div>
  <p class="cvsum" id="cvSum" aria-label="${esc(t('cvSummary'))}"></p>`;
  $('#cvIOpts').innerHTML=`<div class="cvog">
    ${sel('isize',ISIZES.map(s=>[s,s?tt('cvImgSq',{n:s}):t('cvImgOrig')]),o.isize,'cvImgSize')}
    ${sel('ifmt',Object.keys(IFMT).map(k=>[k,k.toUpperCase()]),o.ifmt,'cvFmt')}
    <p class="snote cvinote">${esc(t('cvImgNote'))}</p></div><p class="cvsum" id="cvISum" aria-label="${esc(t('cvSummary'))}"></p>`;
  renderSummary();renderImgSummary();
}
/* batch console: ring + counter + status + the one big button */
function batchFrac(){const b=C.batch;if(!b)return 0;let acc=0;for(const r of b.todo)acc+=r.size*(r.status==='done'||r.status==='error'?1:rowFrac(r));return Math.min(1,acc/b.total)}
function etaText(){const b=C.batch;if(!b)return '';const f=batchFrac(),el=(performance.now()-b.t0)/1000;if(f<0.04||el<1.5)return '';return tt('cvEta',{t:fmtDur(el*(1-f)/f)})}
const RING_R=15.5,RING_C=2*Math.PI*RING_R;
function ring(p,cls){return `<svg class="cvring ${cls||''}" viewBox="0 0 36 36" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p*100)}"><defs><linearGradient id="cvRingGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0"/><stop offset=".55"/><stop offset="1"/></linearGradient></defs><circle class="bg" cx="18" cy="18" r="${RING_R}"/><circle class="fg" cx="18" cy="18" r="${RING_R}" style="stroke-dasharray:${RING_C.toFixed(2)};stroke-dashoffset:${(RING_C*(1-p)).toFixed(2)}"/><path class="tick" d="M11.5 18.5l4 4 9-9" pathLength="1"/></svg>`}
function renderActs(){
  const n=C.rows.length,done=C.rows.filter(r=>r.out).length,bad=C.rows.filter(r=>r.status==='error').length,run=C.running,p=run?batchFrac():0;
  const fin=!run&&n&&C.fin===2&&done===n;
  const doneN=run?C.batch.ok+C.batch.bad:done;
  const status=run?`<span class="cvdot" aria-hidden="true"></span>${esc(t('cvRunning'))}`:fin?esc(t('cvAllDone')):bad?esc(tt('cvDoneErr',{n:bad})):'';
  const eta=run?etaText():'';
  const goLbl=fin?t('cvAgain'):n>1?tt('cvConvertN',{n}):t('cvConvert');
  $('#cvActs').innerHTML=n?`
    <div class="cvcs">${ring(fin?1:p,fin?'full':run?'live':'')}<div class="cvcst"><span class="cvcnt" dir="ltr" aria-label="${esc(tt('cvOfN',{a:doneN,b:n}))}"><b id="cvCntA">${doneN}</b><i>/</i>${n}</span><span class="cvstat" id="cvStat">${status}${eta?`<span class="cveta" id="cvEta">${esc(eta)}</span>`:''}</span></div></div>
    <div class="cvcb">
      ${run?`<button type="button" class="btn ghost" data-a="cancel">${IC.x}<span>${esc(t('cvCancel'))}</span></button>`:''}
      ${!run&&done>1?`<button type="button" class="btn cvgo${fin?' pri':''}" data-a="zip"${C.zipBusy?' disabled':''}>${IC.dl}<span>${esc(t('cvZip'))}</span></button>`:''}
      <button type="button" class="btn cvgo${fin?' quiet':' pri'}${run?' run':''}" data-a="go" id="cvGo"${run?' disabled':''} style="--p:${(p*100).toFixed(1)}%">${run?'':IC.play}<span class="lbl">${esc(run?t('cvRunning'):goLbl)}</span>${run?`<span class="pct" dir="ltr" id="cvGoP">${Math.round(p*100)}%</span>`:`<span class="cvto" dir="ltr">→ ${esc(FMT[C.o.fmt].label.split(' ')[0])}</span>`}</button>
      ${!run?`<button type="button" class="btn ghost quiet" data-a="clear">${esc(t('cvClear'))}</button>`:''}
    </div>`:'';
  const act=$('#cvActs');act.classList.toggle('fin',!!fin);act.classList.toggle('run',!!run);
  if(fin&&C.fin===2&&!C.celebrated){C.celebrated=true;celebrate(act)}if(!fin)C.celebrated=false;
  $('#cvTableWrap').hidden=!n;$('#cvDrop').classList.toggle('compact',n>0);renderPills();
}
function celebrate(host){
  if(noMotion()||!host)return;
  const c=document.createElement('span');c.className='cvconf';c.setAttribute('aria-hidden','true');
  for(let i=0;i<14;i++){const s=document.createElement('i');s.style.setProperty('--x',(Math.random()*2-1).toFixed(2));s.style.setProperty('--d',(Math.random()*0.25).toFixed(2)+'s');s.style.setProperty('--h',i%3);c.appendChild(s)}
  host.appendChild(c);setTimeout(()=>c.remove(),1600);
}
let tickReq=0;
function consoleTick(){
  if(tickReq)return;tickReq=requestAnimationFrame(()=>{tickReq=0;if(!C.running||!C.batch)return;
    const p=batchFrac(),go=$('#cvGo'),gp=$('#cvGoP'),rg=$('#cvActs .cvring'),eta=etaText();
    if(go)go.style.setProperty('--p',(p*100).toFixed(1)+'%');if(gp)gp.textContent=Math.round(p*100)+'%';
    if(rg){rg.setAttribute('aria-valuenow',Math.round(p*100));const fg=rg.querySelector('.fg');if(fg)fg.style.strokeDashoffset=(RING_C*(1-p)).toFixed(2)}
    const a=$('#cvCntA');if(a){const d=String(C.batch.ok+C.batch.bad);if(a.textContent!==d)a.textContent=d}
    let e=$('#cvEta');const st=$('#cvStat');if(eta){if(!e&&st){e=document.createElement('span');e.className='cveta';e.id='cvEta';st.appendChild(e)}if(e&&e.textContent!==eta)e.textContent=eta}else if(e)e.remove();
  });
}
function renderEngine(){
  const el=$('#cvEngine');if(!el)return;const p=C.ffp;
  if(p==null||p>=1){el.hidden=true;el.innerHTML='';return}
  const pc=Math.round(p*100);
  if(el.hidden||!el.firstChild){el.hidden=false;el.innerHTML=`<div class="cven"><div class="cvenh"><b>${esc(t('cvEngineH'))}</b><span class="pct" dir="ltr">${pc}%</span></div>
    <span class="snote">${esc(tt('cvEngineS',{s:ENGINE_MB}))} · ${esc(t('cvEngineT'))}</span>
    <span class="bar cvbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pc}" aria-label="${esc(t('cvEngineH'))}"><i style="--p:${(p*100).toFixed(1)}%"></i></span>
    <ol class="cvsteps cvensteps"><li>${esc(t('cvEng1'))}</li><li>${esc(t('cvEng2'))}</li><li>${esc(t('cvEng3'))}</li></ol>
    <span class="snote cvpriv">${IC.lock}<span>${esc(t('cvEngineLocal'))}</span></span></div>`}
  el.querySelector('.pct').textContent=pc+'%';const bar=el.querySelector('.bar');bar.setAttribute('aria-valuenow',pc);bar.firstChild.style.setProperty('--p',(p*100).toFixed(1)+'%');
  const li=el.querySelectorAll('.cvensteps li'),k=p>=0.9?2:p>=0.85?1:0;li.forEach((x,i)=>{x.className=i<k?'done':i===k?'now':''});
}
function renderTable(){
  const tb=$('#cvBody');tb.innerHTML='';let i=0;
  for(const r of C.rows){const el=document.createElement('article');el.className='cvcard';el.dataset.id=r.id;if(r.fresh){el.classList.add('fresh');el.style.setProperty('--i',Math.min(i++,14));r.fresh=false}tb.appendChild(el);rowHtml(r,el)}
  $('#cvTableWrap').hidden=!C.rows.length;
}
const rowEl=r=>$('#cvBody')&&$('#cvBody').querySelector(`.cvcard[data-id="${r.id}"]`);
function renderRow(r){
  const el=rowEl(r);if(!el)return;
  if(el.dataset.st===r.status&&RUNS.has(r.status)){ // progress tick only: no re-render
    const f=rowFrac(r),pc=Math.round(f*100);
    const bar=el.querySelector('.cvbar i');if(bar)bar.style.setProperty('--p',(f*100).toFixed(1)+'%');
    const pb=el.querySelector('.cvbar');if(pb)pb.setAttribute('aria-valuenow',pc);
    const pt=el.querySelector('.cvpct');if(pt)pt.textContent=pc+'%';
    consoleTick();return;
  }
  rowHtml(r,el);consoleTick();
}
const stageLabel=r=>{const s=r.status;return s==='encoding'?t('stEncoding').replace(/\s*\{p\}%/,''):t(s==='reading'?'stReading':s==='decoding'?'stDecoding':s==='analyzing'?'stAnalyzing':s==='tagging'?'stTagging':'stProcessing')};
function stepsHtml(r){const k=STEP[r.status];if(k==null)return '';return `<ol class="cvsteps">${['spDecode','spProcess','spEncode','spTags'].map((s,i)=>`<li class="${i<k?'done':i===k?'now':''}">${esc(t(s))}</li>`).join('')}</ol>`}
function ratioChip(a,b){if(!a||!b)return '';const d=Math.round((b-a)/a*100);if(!d)return '';const sm=d<0;return `<span class="cvchip ${sm?'dn':'up'}" dir="ltr" title="${esc(tt(sm?'cvSmaller':'cvLarger',{p:Math.abs(d)}))}">${sm?'−':'+'}${Math.abs(d)}%</span>`}
function statusHtml(r){
  const s=r.status;
  if(s==='error')return `<div class="cvstate err">${IC.bad}<span class="cvst err">${esc(r.err||t('erRead'))}</span></div>`;
  if(s==='done')return `<div class="cvstate ok">${IC.ok}<span class="cvst ok">${esc(t('stDone'))}</span>${stepsHtml(r)}</div>`;
  if(s==='cancelled'||s==='ready'||s==='queued')return `<div class="cvstate dim"><span class="cvst dim">${esc(t(s==='cancelled'?'stCancelled':s==='queued'?'stQueued':'stReady'))}</span></div>`;
  const f=rowFrac(r),pc=Math.round(f*100);
  return `<div class="cvstate run">${IC.eq}<span class="cvst run cvstl">${esc(stageLabel(r))}</span><span class="cvpct" dir="ltr">${pc}%</span>
    <span class="bar cvbar" role="progressbar" aria-valuenow="${pc}" aria-valuemin="0" aria-valuemax="100"><i style="--p:${(f*100).toFixed(1)}%"></i></span>${stepsHtml(r)}</div>`;
}
function rowHtml(r,el){
  el.className='cvcard '+r.status+(el.classList.contains('fresh')?' fresh':'');el.dataset.st=r.status;
  const src=(r.ext||'?').toUpperCase(),dst=FMT[r.out?r.out.fmt:C.o.fmt].label.split(' ')[0];
  const meta=[r.dur!=null?fmtDur(r.dur):null,r.sr?`${(r.sr/1000).toFixed(1).replace(/\.0$/,'')} kHz`:null,r.ch?(r.ch===1?t('cvMono'):t('cvStereo')):null].filter(Boolean);
  el.innerHTML=`<div class="cvfb" dir="ltr"><span class="cvbadge src">${esc(src)}</span><span class="cvarrow" aria-hidden="true"></span><span class="cvbadge dst">${esc(dst)}</span></div>
    <div class="cvmain">
      <div class="cvnm"><bdi>${esc(r.name)}</bdi>${r.tags&&(r.tags.title||r.tags.artist)?`<small><bdi>${esc([r.tags.artist,r.tags.title].filter(Boolean).join(' – '))}</bdi></small>`:''}</div>
      ${statusHtml(r)}
    </div>
    <div class="cvside">
      <div class="cvsz" dir="ltr"><span class="cvnum"><bdi dir="ltr">${esc(fsz(r.size))}</bdi></span>${r.out?`<span class="cvszarr" aria-hidden="true">→</span><span class="cvnum out"><bdi dir="ltr" data-bytes="${r.out.size}">${esc(fsz(r.out.size))}</bdi></span>${ratioChip(r.size,r.out.size)}`:''}${meta.length?`<span class="cvmeta"><bdi dir="ltr">${esc(meta.join(' · '))}</bdi></span>`:''}</div>
      <div class="cvact">${r.out?`<button type="button" class="btn cvdl" data-a="dl" data-id="${r.id}" title="${esc(t('cvDownload'))}">${IC.dl}<span>${esc(t('cvDownload'))}</span></button>`:''}
        ${r.status==='error'&&!C.running?`<button type="button" class="btn ghost cvsm" data-a="retry" data-id="${r.id}">${esc(t('cvRetry'))}</button>`:''}
        ${!C.running?`<button type="button" class="cvx" data-a="rm" data-id="${r.id}" aria-label="${esc(t('cvRemove'))}" title="${esc(t('cvRemove'))}">${IC.x}</button>`:''}</div>
    </div>`;
  if(r.justDone){r.justDone=false;el.classList.add('just');countUp(el.querySelector('.cvnum.out bdi'))}
  if(r.status==='error')bump(el,'shake');
}
function countUp(el){
  if(!el||noMotion())return;const n=+el.dataset.bytes||0,fin=el.textContent;if(!n)return;
  const t0=performance.now(),D=620;
  const step=now=>{const k=Math.min(1,(now-t0)/D),e=1-Math.pow(1-k,3);el.textContent=k<1?fsz(n*e):fin;if(k<1)requestAnimationFrame(step)};
  requestAnimationFrame(step);
}
/* images */
function renderImgTable(){const tb=$('#cvIBody');tb.innerHTML='';let i=0;for(const r of C.irows){const el=document.createElement('article');el.className='cvcard cvimg';el.dataset.id=r.id;if(r.fresh){el.classList.add('fresh');el.style.setProperty('--i',Math.min(i++,14));r.fresh=false}tb.appendChild(el);imgRowHtml(r,el)}$('#cvITableWrap').hidden=!C.irows.length;$('#cvIDrop').classList.toggle('compact',C.irows.length>0)}
function renderImgRow(r){const el=$('#cvIBody')&&$('#cvIBody').querySelector(`.cvcard[data-id="${r.id}"]`);if(el)imgRowHtml(r,el)}
function imgRowHtml(r,el){
  el.className='cvcard cvimg '+r.status+(el.classList.contains('fresh')?' fresh':'');
  const st=r.status==='error'?`<div class="cvstate err">${IC.bad}<span class="cvst err">${esc(r.err||'')}</span></div>`:r.status==='done'?`<div class="cvstate ok">${IC.ok}<span class="cvst ok">${esc(t('stDone'))}</span></div>`:r.status==='processing'?`<div class="cvstate run">${IC.eq}<span class="cvst run">${esc(t('stProcessing'))}</span></div>`:`<div class="cvstate dim"><span class="cvst dim">${esc(t('stReady'))}</span></div>`;
  el.innerHTML=`<div class="cvthumb${r.out?' flip':''}"><span class="face a">${r.url?`<img src="${r.url}" alt="">`:IC.img}</span>${r.out?`<span class="face b" dir="ltr"><b>${r.out.w} × ${r.out.h}</b><small>${esc(fsz(r.out.size))}</small></span>`:''}</div>
    <div class="cvmain">
      <div class="cvnm"><bdi>${esc(r.name)}</bdi></div>
      <div class="cvsz" dir="ltr"><span class="cvnum"><bdi dir="ltr">${esc(fsz(r.size))}</bdi></span>${r.w?`<span class="cvmeta"><bdi dir="ltr">${r.w} × ${r.h}</bdi></span>`:''}${r.out?`<span class="cvszarr" aria-hidden="true">→</span><span class="cvnum out"><bdi dir="ltr" data-bytes="${r.out.size}">${esc(fsz(r.out.size))}</bdi></span><span class="cvmeta"><bdi dir="ltr">${r.out.w} × ${r.out.h}</bdi></span>${ratioChip(r.size,r.out.size)}`:''}</div>
      ${st}
    </div>
    <div class="cvact">${r.out?`<button type="button" class="btn cvdl" data-a="dl" data-id="${r.id}" title="${esc(t('cvDownload'))}">${IC.dl}<span>${esc(t('cvDownload'))}</span></button>`:''}${!C.running?`<button type="button" class="cvx" data-a="rm" data-id="${r.id}" aria-label="${esc(t('cvRemove'))}" title="${esc(t('cvRemove'))}">${IC.x}</button>`:''}</div>`;
  if(r.justDone){r.justDone=false;el.classList.add('just');countUp(el.querySelector('.cvnum.out bdi'))}
}
function renderImgActs(){
  const n=C.irows.length,done=C.irows.filter(r=>r.out).length,run=C.running&&C.tab==='images',fin=!run&&n&&done===n;
  $('#cvIActs').innerHTML=n?`<div class="cvcs">${ring(fin?1:n?done/n:0,fin?'full':run?'live':'')}<div class="cvcst"><span class="cvcnt" dir="ltr" aria-label="${esc(tt('cvOfN',{a:done,b:n}))}"><b>${done}</b><i>/</i>${n}</span><span class="cvstat">${run?`<span class="cvdot" aria-hidden="true"></span>${esc(t('cvRunning'))}`:fin?esc(t('cvAllDone')):''}</span></div></div>
    <div class="cvcb">
    ${!run&&done>1?`<button type="button" class="btn cvgo${fin?' pri':''}" data-a="zip"${C.zipBusy?' disabled':''}>${IC.dl}<span>${esc(t('cvZip'))}</span></button>`:''}
    <button type="button" class="btn cvgo${fin?' quiet':' pri'}" data-a="go"${C.running?' disabled':''}>${IC.play}<span class="lbl">${esc(fin?t('cvAgain'):n>1?tt('cvConvertN',{n}):t('cvConvert'))}</span></button>
    ${!C.running?`<button type="button" class="btn ghost quiet" data-a="clear">${esc(t('cvClear'))}</button>`:''}</div>`:'';
  $('#cvIActs').classList.toggle('fin',!!fin);
}
function renderAll(){
  if(!C.built)return;
  CR.applyLang();
  $('#cvDropH').textContent=tt('cvDropH',{n:MAX_FILES});
  renderOpts();renderActs();renderEngine();renderTable();renderImgTable();renderImgActs();
  if(C.msg)setMsg(C.msg,C.msgErr);
}

/* ---------- public ---------- */
window.CONVERT={
  show(){if(!C.built)build();C.visible=true;renderAll()},
  hide(){C.visible=false;if(C.built)$('#convertView').classList.remove('over')},
  lang(){if(C.built)renderAll()},
  // for tests
  _C:C,addFiles,addImages,convertAll,convertImages,cancelAll,readTags,id3Tag,id3Read,wavParse,ffLoad,FMT
};
CR.applyLang();
if($('#convertView')&&!$('#convertView').hidden)CONVERT.show();
})();
