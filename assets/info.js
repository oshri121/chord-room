/* Chord Room — public info pages + per-page SEO meta (growth). window.INFO
   · #licenses / /licenses — "Licenses & credits": every third-party font, library, model, data source and service with
     its license, links and (for the copyleft parts) where the corresponding source is + our written offer.
     Keep it in sync with vendor/, ai/, index.html and LICENSES-AUDIT.md when a component changes.
   · #accessibility / /accessibility — the official accessibility statement (IS 5568 / 2013 regulations): text from
     A11Y.statementHTML(lang, {full:true}) in assets/a11y.js; admins see a warning while the coordinator is not filled in.
   · the per-view <meta> (description, canonical, og:*, twitter:*) moved to assets/pages.js (PAGES.seo), which is loaded on
     every page; this file loads on first use (#licenses / #accessibility, window.CRLOAD 'info'). */
(function () {
'use strict';
const CR = window.CR; if (!CR) return;
const UPDATED = '2026-10-18';

const T = {
he: { docs: 'מסמכים', licT: 'רישיונות וקרדיטים', licIntro: 'Chord Room בנוי גם על עבודה של אחרים. כאן מפורטים כל הגופנים, הספריות, המודלים ומקורות הנתונים של צד שלישי שבאתר, הרישיון של כל אחד, ואיפה נמצא קוד המקור. תודה לכל היוצרים.',
  updated: 'עודכן: {d}', fontsH: 'גופנים', iconsH: 'אייקונים וגרפיקה', icons: 'האייקונים, הלוגו, האיורים וצורות הגל באתר צוירו על ידינו (SVG ו־Canvas). לא נעשה שימוש בספריית אייקונים של צד שלישי. פלטת הצבעים הבטוחה לעיוורון צבעים בתפריט הנגישות מבוססת על הפלטה שפרסמו Masataka Okabe ו־Kei Ito (2008).',
  libsH: 'ספריות קוד', modelsH: 'מודלים של בינה מלאכותית', dataH: 'נתונים ושירותים', tmH: 'סימנים מסחריים',
  tm: 'Deezer,‏ FL Studio,‏ Ableton,‏ Cubase,‏ rekordbox ו־Pioneer DJ,‏ Serato,‏ Traktor,‏ Google,‏ Microsoft ושמות נוספים שמוזכרים באתר הם סימנים מסחריים של בעליהם. הם מוזכרים רק כדי לתאר תאימות, ואין בכך שותפות או חסות.',
  srcH: 'קוד מקור של רכיבי GPL ו־LGPL', src: 'הקבצים של lamejs ו־ffmpeg.wasm נטענים כמו שהם, בלי שינוי, כקבצים נפרדים (אפשר להחליף אותם בגרסה אחרת). קוד המקור של הגרסאות המדויקות זמין בקישורים שליד כל רכיב. בנוסף, במשך שלוש שנים לפחות ממועד ההפצה האחרון של הקבצים האלה, נשלח לכל מי שיבקש עותק מלא של קוד המקור התואם, בלי תשלום מעבר לעלות המשלוח.',
  srcAsk: 'לבקשת קוד מקור:', srcNone: 'דרך כתובת הקשר שבתחתית האתר',
  textsH: 'טקסטים של הרישיונות', mitT: 'רישיון MIT (חל על הרכיבים שמסומנים MIT, עם שורת זכויות היוצרים של כל אחד מהם)', oflT: 'SIL Open Font License 1.1 — תקציר',
  ofl: 'מותר להשתמש בגופנים, ללמוד אותם, לשנות ולהפיץ אותם בחופשיות, כל עוד הם לא נמכרים לבדם, וגרסאות משנה מופצות תחת אותו רישיון ובשם אחר.', fullText: 'הנוסח המלא', localCopy: 'העותק שמצורף לקובץ',
  licL: 'רישיון', byL: 'זכויות יוצרים', linksL: 'קישורים', project: 'הפרויקט', source: 'קוד המקור של הגרסה', licenseL: 'הרישיון', terms: 'תנאי השימוש', unmod: 'נטען כמו שהוא, בלי שינוי, כקובץ נפרד.', modified: 'שינינו את הקוד: אורך istft מדויק ו־FFT מהיר יותר (המקור שלנו נמצא ב־tools/ai-worker).',
  bundled: 'ארוז בקובץ ai/worker.js.', consent: 'נטען רק אחרי הסכמה לסטטיסטיקה בחלון העוגיות.',
  w_plex: 'הגופן של האתר בעברית, בערבית ובאנגלית (מאוחסן באתר עצמו).', w_atk: 'הגופן הקריא בתפריט הנגישות (מאוחסן באתר עצמו).',
  w_supa: 'חשבונות, מסד הנתונים ואחסון הקבצים.', w_stretch: 'שינוי קצב וסולם בזמן אמת ובייצוא.', w_ort: 'מריץ את מודל הפרדת הערוצים בדפדפן.',
  w_lame: 'ייצוא MP3.', w_ffmpeg: 'פורמטים נוספים בממיר (FLAC,‏ OGG,‏ M4A, וידאו ועוד). רץ ב־Web Worker נפרד.',
  w_model: 'המודל המאומן Spleeter 4stems (שירה, תופים, בס ושאר הכלים), בהמרה שלנו ל־ONNX מנקודת השמירה הרשמית של Deezer. ה־STFT, המסכות וה־STFT ההפוך כתובים מחדש ב־JavaScript בקובץ ai/worker.js.',
  modelLic: 'לפי המאמר הרשמי של Deezer, גם הקוד וגם המודלים המאומנים מופצים ברישיון MIT.', modelNote: 'המאמר (JOSS 2020)',
  w_deezer: 'מצעדים, פרטי שירים, עטיפות, קטעי האזנה של 30 שניות והנגן הרשמי. התוכן שייך לבעלי הזכויות ומסופק על ידי Deezer.',
  w_ga: 'סטטיסטיקת שימוש מצטברת.', w_clarity: 'מפות חום והקלטות גלישה עם הסתרת טקסט.', w_ts: 'בדיקת בוטים קצרה בטופסי ההרשמה, הכניסה ואיפוס הסיסמה — רק כשבעל האתר מפעיל אותה.', back: 'חזרה לאתר', top: 'לראש העמוד',
  a11yUpd: 'עודכן: {d}' },
en: { docs: 'Legal', licT: 'Licenses & credits', licIntro: 'Chord Room is built partly on other people’s work. This page lists every third-party font, library, model and data source on the site, its license and where its source code is. Thank you to all of their authors.',
  updated: 'Updated {d}', fontsH: 'Fonts', iconsH: 'Icons and graphics', icons: 'The icons, logo, illustrations and waveforms on the site are drawn by us (SVG and canvas). No third-party icon set is used. The colour-blind-safe palette in the accessibility menu is based on the palette published by Masataka Okabe and Kei Ito (2008).',
  libsH: 'Code libraries', modelsH: 'AI models', dataH: 'Data and services', tmH: 'Trademarks',
  tm: 'Deezer, FL Studio, Ableton, Cubase, rekordbox and Pioneer DJ, Serato, Traktor, Google, Microsoft and other names mentioned on the site are trademarks of their owners. They are mentioned only to describe compatibility and imply no partnership or endorsement.',
  srcH: 'Source code of the GPL and LGPL components', src: 'The lamejs and ffmpeg.wasm files are loaded as they are, unmodified, as separate files (you can replace them with another version). The source code of the exact versions is linked next to each component. In addition, for at least three years from our last distribution of these files, we will send anyone who asks a complete copy of the corresponding source code, at no charge beyond the cost of delivery.',
  srcAsk: 'To request the source code:', srcNone: 'through the contact address at the bottom of the site',
  textsH: 'License texts', mitT: 'MIT License (applies to the components marked MIT, each with its own copyright line)', oflT: 'SIL Open Font License 1.1 — summary',
  ofl: 'The fonts may be used, studied, modified and redistributed freely, as long as they are not sold by themselves, and modified versions are released under the same license with a different name.', fullText: 'Full text', localCopy: 'The copy shipped with the file',
  licL: 'License', byL: 'Copyright', linksL: 'Links', project: 'Project', source: 'Source of this version', licenseL: 'License', terms: 'Terms of use', unmod: 'Loaded as is, unmodified, as a separate file.', modified: 'We changed the code: exact istft length and a faster FFT (our source is in tools/ai-worker).',
  bundled: 'Bundled in ai/worker.js.', consent: 'Loaded only after you allow analytics in the cookie banner.',
  w_plex: 'The site’s typeface in Hebrew, Arabic and Latin (hosted on this site).', w_atk: 'The readable typeface in the accessibility menu (hosted on this site).',
  w_supa: 'Accounts, the database and file storage.', w_stretch: 'Changing tempo and key, live and in exports.', w_ort: 'Runs the stem-separation model in the browser.',
  w_lame: 'MP3 export.', w_ffmpeg: 'Extra formats in the Converter (FLAC, OGG, M4A, video and more). Runs in its own Web Worker.',
  w_model: 'The trained Spleeter 4-stem model (vocals, drums, bass and other), converted by us to ONNX from Deezer’s official checkpoint. The STFT, masks and inverse STFT are re-implemented in JavaScript in ai/worker.js.',
  modelLic: 'According to Deezer’s official paper, both the code and the trained models are released under the MIT license.', modelNote: 'Paper (JOSS 2020)',
  w_deezer: 'Charts, track details, cover art, 30-second previews and the official player. The content belongs to its rights holders and is provided by Deezer.',
  w_ga: 'Aggregated usage statistics.', w_clarity: 'Heatmaps and session recordings with text masked.', w_ts: 'A short bot check on the sign-up, sign-in and password-reset forms — only when the site owner turns it on.', back: 'Back to the site', top: 'Back to top',
  a11yUpd: 'Updated {d}' },
ar: { docs: 'مستندات', licT: 'التراخيص والشكر', licIntro: 'يعتمد Chord Room جزئيًا على عمل آخرين. تسرد هذه الصفحة كل الخطوط والمكتبات والنماذج ومصادر البيانات من أطراف ثالثة في الموقع، وترخيص كلٍّ منها، ومكان الشيفرة المصدرية. شكرًا لكل مؤلفيها.',
  updated: 'آخر تحديث: {d}', fontsH: 'الخطوط', iconsH: 'الأيقونات والرسوم', icons: 'الأيقونات والشعار والرسوم وأشكال الموجة في الموقع من رسمنا (SVG وCanvas). لا نستخدم مكتبة أيقونات من طرف ثالث. لوحة الألوان الآمنة لعمى الألوان في قائمة إمكانية الوصول مبنية على اللوحة التي نشرها Masataka Okabe وKei Ito ‏(2008).',
  libsH: 'مكتبات برمجية', modelsH: 'نماذج الذكاء الاصطناعي', dataH: 'البيانات والخدمات', tmH: 'العلامات التجارية',
  tm: 'Deezer وFL Studio وAbleton وCubase وrekordbox وPioneer DJ وSerato وTraktor وGoogle وMicrosoft وأسماء أخرى مذكورة في الموقع هي علامات تجارية لأصحابها. تُذكر فقط لوصف التوافق، ولا تعني شراكة أو رعاية.',
  srcH: 'الشيفرة المصدرية لمكوّنات GPL وLGPL', src: 'تُحمَّل ملفات lamejs وffmpeg.wasm كما هي، دون تعديل، كملفات منفصلة (ويمكن استبدالها بإصدار آخر). الشيفرة المصدرية للإصدارات الدقيقة مرتبطة بجانب كل مكوّن. إضافةً إلى ذلك، ولمدة ثلاث سنوات على الأقل من آخر توزيع لهذه الملفات، سنرسل لكل من يطلب نسخة كاملة من الشيفرة المصدرية المقابلة، دون رسوم تتجاوز تكلفة الإرسال.',
  srcAsk: 'لطلب الشيفرة المصدرية:', srcNone: 'عبر عنوان التواصل أسفل الموقع',
  textsH: 'نصوص التراخيص', mitT: 'ترخيص MIT (يسري على المكوّنات المعلَّمة بـMIT، مع سطر حقوق النشر الخاص بكلٍّ منها)', oflT: 'SIL Open Font License 1.1 — ملخّص',
  ofl: 'يجوز استخدام الخطوط ودراستها وتعديلها وإعادة توزيعها بحرية، طالما لا تُباع وحدها، وتُنشر النسخ المعدّلة بالترخيص نفسه وباسم مختلف.', fullText: 'النص الكامل', localCopy: 'النسخة المرفقة بالملف',
  licL: 'الترخيص', byL: 'حقوق النشر', linksL: 'روابط', project: 'المشروع', source: 'مصدر هذا الإصدار', licenseL: 'الترخيص', terms: 'شروط الاستخدام', unmod: 'يُحمَّل كما هو، دون تعديل، كملف منفصل.', modified: 'عدّلنا الشيفرة: طول istft دقيق وFFT أسرع (مصدرنا في tools/ai-worker).',
  bundled: 'مضمَّن في ai/worker.js.', consent: 'يُحمَّل فقط بعد السماح بالإحصاءات في نافذة ملفات تعريف الارتباط.',
  w_plex: 'خط الموقع بالعبرية والعربية واللاتينية (مستضاف على الموقع نفسه).', w_atk: 'الخط المقروء في قائمة إمكانية الوصول (مستضاف على الموقع نفسه).',
  w_supa: 'الحسابات وقاعدة البيانات وتخزين الملفات.', w_stretch: 'تغيير الإيقاع والمقام مباشرةً وفي التصدير.', w_ort: 'تشغيل نموذج فصل المسارات في المتصفح.',
  w_lame: 'تصدير MP3.', w_ffmpeg: 'صيغ إضافية في المحوّل (FLAC وOGG وM4A والفيديو وغيرها). يعمل في Web Worker منفصل.',
  w_model: 'النموذج المدرَّب Spleeter رباعي المسارات (الغناء والطبول والباص وبقية الآلات)، حوَّلناه إلى ONNX من نقطة الحفظ الرسمية من Deezer. أُعيدت كتابة STFT والأقنعة وSTFT العكسي بلغة JavaScript في ai/worker.js.',
  modelLic: 'وفقًا للورقة الرسمية من Deezer، تُنشر الشيفرة والنماذج المدرَّبة كلاهما برخصة MIT.', modelNote: 'الورقة العلمية (JOSS 2020)',
  w_deezer: 'القوائم وتفاصيل الأغاني والأغلفة ومقاطع 30 ثانية والمشغّل الرسمي. المحتوى ملك لأصحاب الحقوق وتوفّره Deezer.',
  w_ga: 'إحصاءات استخدام مجمَّعة.', w_clarity: 'خرائط حرارية وتسجيلات تصفّح مع إخفاء النص.', w_ts: 'فحص قصير للروبوتات في نماذج التسجيل والدخول وإعادة تعيين كلمة المرور — فقط عندما يفعّله مالك الموقع.', back: 'العودة إلى الموقع', top: 'إلى أعلى الصفحة',
  a11yUpd: 'آخر تحديث: {d}' },
ru: { docs: 'Документы', licT: 'Лицензии и благодарности', licIntro: 'Chord Room частично построен на чужой работе. Здесь перечислены все сторонние шрифты, библиотеки, модели и источники данных сайта, их лицензии и где находится исходный код. Спасибо всем авторам.',
  updated: 'Обновлено: {d}', fontsH: 'Шрифты', iconsH: 'Иконки и графика', icons: 'Иконки, логотип, иллюстрации и волновые формы нарисованы нами (SVG и canvas). Сторонние наборы иконок не используются. Безопасная для дальтоников палитра в меню доступности основана на палитре, опубликованной Масатакой Окабе и Кэем Ито (2008).',
  libsH: 'Программные библиотеки', modelsH: 'Модели ИИ', dataH: 'Данные и сервисы', tmH: 'Товарные знаки',
  tm: 'Deezer, FL Studio, Ableton, Cubase, rekordbox и Pioneer DJ, Serato, Traktor, Google, Microsoft и другие упомянутые на сайте названия — товарные знаки их владельцев. Они упоминаются только для описания совместимости и не означают партнёрства или одобрения.',
  srcH: 'Исходный код компонентов под GPL и LGPL', src: 'Файлы lamejs и ffmpeg.wasm загружаются как есть, без изменений, отдельными файлами (их можно заменить другой версией). Исходный код именно этих версий доступен по ссылкам рядом с каждым компонентом. Кроме того, не менее трёх лет с момента последнего распространения этих файлов мы бесплатно (кроме стоимости доставки) отправим полный соответствующий исходный код любому, кто попросит.',
  srcAsk: 'Запросить исходный код:', srcNone: 'через контактный адрес внизу сайта',
  textsH: 'Тексты лицензий', mitT: 'Лицензия MIT (действует для компонентов с пометкой MIT, у каждого — своя строка об авторских правах)', oflT: 'SIL Open Font License 1.1 — кратко',
  ofl: 'Шрифты можно свободно использовать, изучать, изменять и распространять, если они не продаются сами по себе, а изменённые версии выпускаются под той же лицензией и с другим названием.', fullText: 'Полный текст', localCopy: 'Копия, приложенная к файлу',
  licL: 'Лицензия', byL: 'Авторские права', linksL: 'Ссылки', project: 'Проект', source: 'Исходный код этой версии', licenseL: 'Лицензия', terms: 'Условия использования', unmod: 'Загружается как есть, без изменений, отдельным файлом.', modified: 'Мы изменили код: точная длина istft и более быстрое БПФ (наш исходный код — в tools/ai-worker).',
  bundled: 'Встроен в ai/worker.js.', consent: 'Загружается только после разрешения аналитики в окне cookie.',
  w_plex: 'Шрифт сайта для иврита, арабского и латиницы (размещён на самом сайте).', w_atk: 'Удобочитаемый шрифт в меню доступности (размещён на самом сайте).',
  w_supa: 'Аккаунты, база данных и хранение файлов.', w_stretch: 'Изменение темпа и тональности вживую и при экспорте.', w_ort: 'Запускает модель разделения на стемы в браузере.',
  w_lame: 'Экспорт MP3.', w_ffmpeg: 'Дополнительные форматы в конвертере (FLAC, OGG, M4A, видео и др.). Работает в отдельном Web Worker.',
  w_model: 'Обученная модель Spleeter на 4 стема (вокал, ударные, бас и остальное), сконвертированная нами в ONNX из официального чекпойнта Deezer. STFT, маски и обратное STFT переписаны на JavaScript в ai/worker.js.',
  modelLic: 'Согласно официальной статье Deezer, и код, и обученные модели распространяются под лицензией MIT.', modelNote: 'Статья (JOSS 2020)',
  w_deezer: 'Чарты, данные о треках, обложки, 30-секундные фрагменты и официальный плеер. Контент принадлежит правообладателям и предоставляется Deezer.',
  w_ga: 'Сводная статистика использования.', w_clarity: 'Тепловые карты и записи сеансов со скрытым текстом.', w_ts: 'Короткая проверка на ботов в формах регистрации, входа и сброса пароля — только если владелец сайта её включил.', back: 'Вернуться на сайт', top: 'Наверх',
  a11yUpd: 'Обновлено: {d}' },
es: { docs: 'Documentos', licT: 'Licencias y créditos', licIntro: 'Chord Room se apoya en parte en el trabajo de otras personas. Aquí están todas las fuentes, bibliotecas, modelos y fuentes de datos de terceros del sitio, su licencia y dónde está su código fuente. Gracias a todos sus autores.',
  updated: 'Actualizado: {d}', fontsH: 'Tipografías', iconsH: 'Iconos y gráficos', icons: 'Los iconos, el logotipo, las ilustraciones y las formas de onda del sitio los dibujamos nosotros (SVG y canvas). No usamos ningún set de iconos de terceros. La paleta segura para daltonismo del menú de accesibilidad se basa en la paleta publicada por Masataka Okabe y Kei Ito (2008).',
  libsH: 'Bibliotecas de código', modelsH: 'Modelos de IA', dataH: 'Datos y servicios', tmH: 'Marcas registradas',
  tm: 'Deezer, FL Studio, Ableton, Cubase, rekordbox y Pioneer DJ, Serato, Traktor, Google, Microsoft y otros nombres mencionados en el sitio son marcas de sus propietarios. Se mencionan solo para describir la compatibilidad y no implican asociación ni respaldo.',
  srcH: 'Código fuente de los componentes GPL y LGPL', src: 'Los archivos de lamejs y ffmpeg.wasm se cargan tal cual, sin modificar, como archivos separados (puedes reemplazarlos por otra versión). El código fuente de las versiones exactas está enlazado junto a cada componente. Además, durante al menos tres años desde nuestra última distribución de estos archivos, enviaremos a quien lo pida una copia completa del código fuente correspondiente, sin cobrar más que el coste del envío.',
  srcAsk: 'Para pedir el código fuente:', srcNone: 'a través de la dirección de contacto al pie del sitio',
  textsH: 'Textos de las licencias', mitT: 'Licencia MIT (se aplica a los componentes marcados MIT, cada uno con su propia línea de copyright)', oflT: 'SIL Open Font License 1.1 — resumen',
  ofl: 'Las tipografías se pueden usar, estudiar, modificar y redistribuir libremente, siempre que no se vendan por sí solas y que las versiones modificadas se publiquen con la misma licencia y otro nombre.', fullText: 'Texto completo', localCopy: 'La copia incluida con el archivo',
  licL: 'Licencia', byL: 'Copyright', linksL: 'Enlaces', project: 'Proyecto', source: 'Código de esta versión', licenseL: 'Licencia', terms: 'Condiciones de uso', unmod: 'Se carga tal cual, sin modificar, como archivo separado.', modified: 'Cambiamos el código: longitud exacta de istft y una FFT más rápida (nuestro código está en tools/ai-worker).',
  bundled: 'Incluido en ai/worker.js.', consent: 'Se carga solo después de permitir la analítica en el aviso de cookies.',
  w_plex: 'La tipografía del sitio en hebreo, árabe y latín (alojada en el propio sitio).', w_atk: 'La tipografía legible del menú de accesibilidad (alojada en el propio sitio).',
  w_supa: 'Cuentas, base de datos y almacenamiento de archivos.', w_stretch: 'Cambiar tempo y tonalidad, en vivo y al exportar.', w_ort: 'Ejecuta el modelo de separación de pistas en el navegador.',
  w_lame: 'Exportación MP3.', w_ffmpeg: 'Formatos extra en el Conversor (FLAC, OGG, M4A, vídeo y más). Funciona en su propio Web Worker.',
  w_model: 'El modelo entrenado Spleeter de 4 pistas (voz, batería, bajo y resto), convertido por nosotros a ONNX desde el checkpoint oficial de Deezer. La STFT, las máscaras y la STFT inversa están reimplementadas en JavaScript en ai/worker.js.',
  modelLic: 'Según el artículo oficial de Deezer, tanto el código como los modelos entrenados se publican con licencia MIT.', modelNote: 'Artículo (JOSS 2020)',
  w_deezer: 'Listas, datos de canciones, portadas, fragmentos de 30 segundos y el reproductor oficial. El contenido pertenece a sus titulares y lo proporciona Deezer.',
  w_ga: 'Estadísticas de uso agregadas.', w_clarity: 'Mapas de calor y grabaciones de sesión con el texto oculto.', w_ts: 'Una breve comprobación anti-bots en los formularios de registro, inicio de sesión y restablecimiento de contraseña, solo si el propietario del sitio la activa.', back: 'Volver al sitio', top: 'Volver arriba',
  a11yUpd: 'Actualizado: {d}' }
};
/* licenses sweep 2026-10-18: Emscripten, Meta Pixel, PayPal, Anthropic, Cloudflare + our GPL worker (merged into T) */
const T2 = {
he: { w_emcc: 'ערכת הכלים שבה נבנו קובצי ה־WebAssembly של ffmpeg.wasm ו־Signalsmith Stretch. קוד ההרצה שלה כלול בתוך הקבצים האלה.',
  w_meta: 'מדידת פרסום (Meta Pixel).', consentM: 'נטען רק אחרי הסכמה נפרדת למדידת פרסום בחלון העוגיות.',
  w_pp: 'תשלומים ומנויים. פרטי הכרטיס מוקלדים רק אצל PayPal.', w_anth: 'מודל הבינה המלאכותית (Claude) שמאחורי העוזר רומי. מקבל הודעות רק כשכותבים לרומי.',
  w_cf: 'אחסון האתר, הפצת התוכן וספירת ביקורים מצטברת בלי עוגיות (Web Analytics).',
  srcOwn: 'גם הקובץ שלנו assets/ffmpeg-worker.js, שמפעיל את ffmpeg.wasm, מופץ ברישיון GPL-2.0-or-later. אנחנו שומרים ארכיון של קוד המקור המדויק של הגרסה שבאתר, כולל FFmpeg וכל הספריות שנבנו איתו.' },
en: { w_emcc: 'The toolchain the WebAssembly files of ffmpeg.wasm and Signalsmith Stretch were built with. Its runtime code is included inside those files.',
  w_meta: 'Ad measurement (Meta Pixel).', consentM: 'Loaded only after you separately allow ad measurement in the cookie banner.',
  w_pp: 'Payments and subscriptions. Card details are typed only at PayPal.', w_anth: 'The AI model (Claude) behind the Roomy assistant. It receives messages only when you write to Roomy.',
  w_cf: 'Hosting, content delivery and cookie-free aggregate visit counts (Web Analytics).',
  srcOwn: 'Our own file assets/ffmpeg-worker.js, which drives ffmpeg.wasm, is also released under GPL-2.0-or-later. We keep an archive of the exact source code of the version on the site, including FFmpeg and every library it was built with.' },
ar: { w_emcc: 'مجموعة الأدوات التي بُنيت بها ملفات WebAssembly الخاصة بـffmpeg.wasm وSignalsmith Stretch. شيفرة التشغيل الخاصة بها مضمَّنة داخل هذه الملفات.',
  w_meta: 'قياس الإعلانات (Meta Pixel).', consentM: 'يُحمَّل فقط بعد موافقة منفصلة على قياس الإعلانات في نافذة ملفات تعريف الارتباط.',
  w_pp: 'المدفوعات والاشتراكات. تُكتب بيانات البطاقة لدى PayPal فقط.', w_anth: 'نموذج الذكاء الاصطناعي (Claude) الذي يشغّل المساعد رومي. يتلقى الرسائل فقط عندما تكتب لرومي.',
  w_cf: 'استضافة الموقع وتوزيع المحتوى وعدّ الزيارات بشكل مجمَّع دون ملفات تعريف ارتباط (Web Analytics).',
  srcOwn: 'ملفنا assets/ffmpeg-worker.js، الذي يشغّل ffmpeg.wasm، منشور أيضًا بترخيص GPL-2.0-or-later. نحتفظ بأرشيف للشيفرة المصدرية الدقيقة للإصدار الموجود في الموقع، بما في ذلك FFmpeg وكل المكتبات التي بُني معها.' },
ru: { w_emcc: 'Набор инструментов, которым собраны WebAssembly-файлы ffmpeg.wasm и Signalsmith Stretch. Его код среды выполнения входит в эти файлы.',
  w_meta: 'Измерение рекламы (Meta Pixel).', consentM: 'Загружается только после отдельного согласия на измерение рекламы в окне cookie.',
  w_pp: 'Платежи и подписки. Данные карты вводятся только на стороне PayPal.', w_anth: 'ИИ-модель (Claude), на которой работает ассистент Руми. Получает сообщения, только когда вы пишете Руми.',
  w_cf: 'Хостинг сайта, доставка контента и сводный подсчёт посещений без cookie (Web Analytics).',
  srcOwn: 'Наш собственный файл assets/ffmpeg-worker.js, который управляет ffmpeg.wasm, тоже распространяется под лицензией GPL-2.0-or-later. Мы храним архив точного исходного кода версии на сайте, включая FFmpeg и все библиотеки, с которыми он собран.' },
es: { w_emcc: 'El conjunto de herramientas con el que se compilaron los archivos WebAssembly de ffmpeg.wasm y Signalsmith Stretch. Su código de ejecución va incluido dentro de esos archivos.',
  w_meta: 'Medición publicitaria (Meta Pixel).', consentM: 'Se carga solo después de permitir por separado la medición publicitaria en el aviso de cookies.',
  w_pp: 'Pagos y suscripciones. Los datos de la tarjeta se escriben solo en PayPal.', w_anth: 'El modelo de IA (Claude) detrás del asistente Roomy. Recibe mensajes solo cuando le escribes a Roomy.',
  w_cf: 'Alojamiento del sitio, distribución del contenido y recuento agregado de visitas sin cookies (Web Analytics).',
  srcOwn: 'Nuestro propio archivo assets/ffmpeg-worker.js, que controla ffmpeg.wasm, también se publica con la licencia GPL-2.0-or-later. Guardamos un archivo del código fuente exacto de la versión del sitio, incluidos FFmpeg y todas las bibliotecas con las que se compiló.' }
};
for (const l in T2) Object.assign(T[l], T2[l]);
const L = () => { const l = (document.documentElement.lang || 'he').slice(0, 2).toLowerCase(); return T[l] ? l : 'en'; };
const t = (k, v) => { let s = T[L()][k] != null ? T[L()][k] : T.en[k]; if (v) s = String(s).replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m)); return s; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = iso => { const l = L(); try { return new Intl.DateTimeFormat(l === 'he' ? 'he-IL' : l === 'ar' ? 'ar-u-nu-latn' : l, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z')); } catch (e) { return iso; } };

/* ---------- the components (keep in sync with vendor/, ai/, index.html, LICENSES-AUDIT.md) ---------- */
const LIC = { MIT: 'https://opensource.org/license/mit', OFL: 'https://openfontlicense.org/open-font-license-official-text/', LGPL3: 'https://www.gnu.org/licenses/lgpl-3.0.html',
  GPL3: 'https://www.gnu.org/licenses/gpl-3.0.html', GPL2: 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html' };
const FONTS = [
  { n: 'IBM Plex Sans · Sans Hebrew · Sans Arabic · Sans Condensed · Mono', lic: 'SIL OFL 1.1', lu: LIC.OFL, by: '© IBM Corp.', w: 'w_plex', links: [['project', 'https://github.com/IBM/plex']] },
  { n: 'Atkinson Hyperlegible', lic: 'SIL OFL 1.1', lu: LIC.OFL, by: '© Braille Institute of America, Inc.', w: 'w_atk', links: [['project', 'https://www.brailleinstitute.org/freefont/']] }
];
const LIBS = [
  { n: 'supabase-js', v: '2.117.2', lic: 'MIT', lu: LIC.MIT, by: '© Supabase', w: 'w_supa', extra: 'unmod', local: 'vendor/supabase.LICENSE.txt', links: [['project', 'https://github.com/supabase/supabase-js'], ['source', 'https://www.npmjs.com/package/@supabase/supabase-js/v/2.117.2']] },
  { n: 'Signalsmith Stretch', v: '1.3.2', lic: 'MIT', lu: LIC.MIT, by: '© 2022 Geraint Luff / Signalsmith Audio Ltd.', w: 'w_stretch', extra: 'unmod', local: 'vendor/signalsmith-stretch-1.3.2.LICENSE.txt', links: [['project', 'https://signalsmith-audio.co.uk/code/stretch/'], ['source', 'https://www.npmjs.com/package/signalsmith-stretch/v/1.3.2']] },
  { n: 'ONNX Runtime Web', v: '1.23.0', lic: 'MIT', lu: LIC.MIT, by: '© Microsoft Corporation', w: 'w_ort', extra: 'bundled', local: 'vendor/onnxruntime-web-1.23.0.LICENSE.txt', links: [['project', 'https://github.com/microsoft/onnxruntime'], ['source', 'https://github.com/microsoft/onnxruntime/tree/v1.23.0']] },
  { n: 'lamejs', v: '1.2.7', lic: 'LGPL-3.0', lu: LIC.LGPL3, by: '© the LAME project; JavaScript port by zhuker and contributors', w: 'w_lame', extra: 'unmod', local: 'vendor/lamejs-1.2.7.LICENSE.txt',
    links: [['project', 'https://github.com/zhuker/lamejs'], ['source', 'https://github.com/shijinyu/lamejs/tree/1fb0ef5fa177413107e2e107d054a9b994e3f79c'], ['source', 'https://registry.npmjs.org/@breezystack/lamejs/-/lamejs-1.2.7.tgz']] },
  { n: 'ffmpeg.wasm core (FFmpeg)', v: '0.12.10', lic: 'GPL-2.0-or-later', lu: LIC.GPL2, by: '© the FFmpeg developers; ffmpeg.wasm © Jerome Wu and contributors', w: 'w_ffmpeg', extra: 'unmod', local: 'vendor/ffmpeg/LICENSE.txt?v=2',
    links: [['project', 'https://github.com/ffmpegwasm/ffmpeg.wasm'], ['source', 'https://github.com/ffmpegwasm/ffmpeg.wasm/tree/71aa99d37c02a7b4c435275ca9ef50e612f6efa1'], ['source', 'https://ffmpeg.org/releases/ffmpeg-5.1.4.tar.xz'], ['source', 'https://www.npmjs.com/package/@ffmpeg/core/v/0.12.10']] },
  { n: 'Emscripten', lic: 'MIT / NCSA', lu: 'https://github.com/emscripten-core/emscripten/blob/3.1.40/LICENSE', by: '© 2010–2014 Emscripten authors', w: 'w_emcc', links: [['project', 'https://emscripten.org/']] }
];
const MODELS = [{ n: 'Spleeter — 4stems model (our ONNX conversion)', v: 'v1.4.0', lic: 'MIT', lu: 'https://github.com/deezer/spleeter/blob/master/LICENSE', by: '© 2019-present, Deezer SA', w: 'w_model', extra: 'modelLic',
  links: [['project', 'https://github.com/deezer/spleeter'], ['source', 'https://github.com/deezer/spleeter/releases/tag/v1.4.0'], ['modelNote', 'https://joss.theoj.org/papers/10.21105/joss.02154']] }];
const DATA = [
  { n: 'Deezer API & widget', lic: 'Deezer', lu: 'https://developers.deezer.com/termsofuse', lt: 'terms', by: '© Deezer SA and the rights holders', w: 'w_deezer', links: [['project', 'https://developers.deezer.com/']] },
  { n: 'Google Analytics 4', lic: 'Google', lu: 'https://marketingplatform.google.com/about/analytics/terms/us/', lt: 'terms', by: 'Google LLC', w: 'w_ga', extra: 'consent', links: [['project', 'https://marketingplatform.google.com/about/analytics/']] },
  { n: 'Microsoft Clarity', lic: 'Microsoft', lu: 'https://clarity.microsoft.com/terms', lt: 'terms', by: 'Microsoft Corporation', w: 'w_clarity', extra: 'consent', links: [['project', 'https://clarity.microsoft.com/']] },
  { n: 'Cloudflare Turnstile', lic: 'Cloudflare', lu: 'https://www.cloudflare.com/turnstile-terms-of-service/', lt: 'terms', by: 'Cloudflare, Inc.', w: 'w_ts', links: [['project', 'https://www.cloudflare.com/products/turnstile/']] },   /* acct (accounts v4) */
  /* licenses sweep 2026-10-18: the other services the page loads or sends data to (same list as the privacy policy) */
  { n: 'Meta Pixel', lic: 'Meta', lu: 'https://www.facebook.com/legal/terms/businesstools', lt: 'terms', by: 'Meta Platforms, Inc.', w: 'w_meta', extra: 'consentM', links: [['project', 'https://www.facebook.com/business/tools/meta-pixel']] },
  { n: 'Cloudflare Pages & Web Analytics', lic: 'Cloudflare', lu: 'https://www.cloudflare.com/terms/', lt: 'terms', by: 'Cloudflare, Inc.', w: 'w_cf', links: [['project', 'https://www.cloudflare.com/web-analytics/']] },
  { n: 'PayPal', lic: 'PayPal', lu: 'https://www.paypal.com/us/legalhub/useragreement-full', lt: 'terms', by: 'PayPal, Inc.', w: 'w_pp', links: [['project', 'https://www.paypal.com/']] },
  { n: 'Anthropic API (Claude)', lic: 'Anthropic', lu: 'https://www.anthropic.com/legal/commercial-terms', lt: 'terms', by: 'Anthropic PBC', w: 'w_anth', links: [['project', 'https://www.anthropic.com/']] }
];
const MIT_TEXT = 'Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.';

const a = (href, text) => '<a href="' + esc(href) + '" target="_blank" rel="noopener" dir="ltr">' + esc(text) + '</a>';
function card(c) {
  const lic = c.model ? '<span>' + esc(t('modelLic')) + '</span>' : a(c.lu, c.lt ? t(c.lt) : c.lic);
  const links = c.links.map(([k, u]) => a(u, t(k) + (k === 'source' ? ' · ' + u.replace(/^https:\/\/(www\.)?/, '').split('/')[0] : ''))).join('<span aria-hidden="true"> · </span>');
  return '<li class="lic' + (c.model ? ' lic-model' : '') + '"><h3><span dir="ltr">' + esc(c.n) + '</span>' + (c.v ? ' <span class="lic-v mono" dir="ltr">' + esc(c.v) + '</span>' : '') +
    (c.lic && !c.model && !c.lt ? '<span class="lic-tag mono" dir="ltr">' + esc(c.lic) + '</span>' : '') + '</h3><p>' + esc(t(c.w)) + (c.extra ? ' ' + esc(t(c.extra)) : '') + '</p>' +
    '<dl><dt>' + esc(t('licL')) + '</dt><dd>' + lic + (c.local ? ' · <a href="' + esc(c.local) + '" target="_blank" rel="noopener" dir="ltr">' + esc(t('localCopy')) + '</a>' : '') + '</dd>' +
    '<dt>' + esc(t('byL')) + '</dt><dd dir="ltr">' + esc(c.by) + '</dd><dt>' + esc(t('linksL')) + '</dt><dd>' + links + '</dd></dl></li>';
}
function contactLink() {
  const c = String((CR.ACC && CR.ACC.config && CR.ACC.config.billing && CR.ACC.config.billing.contact) || '').trim();
  if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(c)) return '<a href="mailto:' + esc(c) + '" dir="ltr">' + esc(c) + '</a>';
  if (/^https:\/\/[^\s<>"']+$/i.test(c)) return '<a href="' + esc(c) + '" target="_blank" rel="noopener" dir="ltr">' + esc(c.replace(/^https:\/\//i, '')) + '</a>';
  return esc(t('srcNone'));
}
function head(kind, title) {
  const lu = window.LEGAL && LEGAL.ui ? LEGAL.ui(L()) : null;
  const tab = (k, label) => '<a href="#' + k + '" class="lg-tab' + (k === kind ? ' on' : '') + '"' + (k === kind ? ' aria-current="page"' : '') + '>' + esc(label) + '</a>';
  return '<header class="lg-head"><span class="pg-eb">Chord Room · ' + esc(t('docs')) + '</span><h1 id="infoH">' + esc(title) + '</h1>' +
    '<p class="lg-meta"><span>' + esc(t('updated', { d: day(UPDATED) })) + '</span></p>' +
    '<nav class="lg-tabs" aria-label="' + esc(t('docs')) + '">' + (lu ? tab('terms', lu.terms) + tab('privacy', lu.privacy) : '') + tab('accessibility', a11yTitle()) + tab('licenses', t('licT')) + '</nav></header>';
}
function a11yTitle() { try { const m = /<h2>([^<]*)<\/h2>/.exec(window.A11Y ? A11Y.statementHTML(L()) : ''); if (m) return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); } catch (e) {} return 'Accessibility'; }
const foot = () => '<p class="lg-foot"><button type="button" class="lnk" data-nav="about">' + esc(t('back')) + '</button><button type="button" class="lnk" data-top="1">' + esc(t('top')) + '</button></p>';
function licensesHTML() {
  const sec = (id, h, body) => '<section class="lg-sec" id="' + id + '" aria-labelledby="' + id + '-h"><h2 id="' + id + '-h">' + esc(h) + '</h2>' + body + '</section>';
  return '<div class="pg lg info">' + head('licenses', t('licT')) + '<article class="lg-doc info-doc" aria-labelledby="infoH"><p class="lg-intro">' + esc(t('licIntro')) + '</p>' +
    sec('lic-fonts', t('fontsH'), '<ul class="lics">' + FONTS.map(card).join('') + '</ul>') +
    sec('lic-icons', t('iconsH'), '<p>' + esc(t('icons')) + '</p>') +
    sec('lic-libs', t('libsH'), '<ul class="lics">' + LIBS.map(card).join('') + '</ul>') +
    sec('lic-models', t('modelsH'), '<ul class="lics">' + MODELS.map(card).join('') + '</ul>') +
    sec('lic-data', t('dataH'), '<ul class="lics">' + DATA.map(card).join('') + '</ul>') +
    sec('lic-source', t('srcH'), '<p>' + esc(t('src')) + '</p><p>' + esc(t('srcOwn')) + '</p><p><b>' + esc(t('srcAsk')) + '</b> ' + contactLink() + '</p>') +
    sec('lic-tm', t('tmH'), '<p>' + esc(t('tm')) + '</p>') +
    sec('lic-texts', t('textsH'),
      '<details class="lic-txt"><summary>' + esc(t('mitT')) + '</summary><pre dir="ltr" lang="en">MIT License\n\nCopyright (c) — see each component above\n\n' + esc(MIT_TEXT) + '</pre></details>' +
      '<details class="lic-txt"><summary>' + esc(t('oflT')) + '</summary><p>' + esc(t('ofl')) + ' ' + a(LIC.OFL, t('fullText')) + '</p></details>' +
      '<p>' + a(LIC.LGPL3, 'GNU LGPL 3.0') + ' · ' + a(LIC.GPL3, 'GNU GPL 3.0') + ' · ' + a(LIC.GPL2, 'GNU GPL 2.0') + '</p>') +
    '</article>' + foot() + '</div>';
}
function isAdmin() { const A = CR.ACC || {}; return !!(A.admin || A.owner); }
function a11yHTML() {
  let body = '';
  try { if (window.A11Y && A11Y.statementHTML) body = A11Y.statementHTML(L(), { full: true, admin: isAdmin(), contact: (CR.ACC && CR.ACC.config && CR.ACC.config.billing && CR.ACC.config.billing.contact) || '' }); } catch (e) { body = ''; }
  const om = window.A11Y ? '<p class="info-a11ybtn"><button type="button" class="btn solid" data-a11y-open="1">' + esc(menuLabel()) + '</button></p>' : '';
  return '<div class="pg lg info info-a11y">' + head('accessibility', a11yTitle()) + '<article class="lg-doc info-doc" aria-labelledby="infoH">' + body + om + '</article>' + foot() + '</div>';
}
function menuLabel() { const M = { he: 'פתיחת תפריט הנגישות', en: 'Open the accessibility menu', ar: 'فتح قائمة إمكانية الوصول', ru: 'Открыть меню доступности', es: 'Abrir el menú de accesibilidad' }; return M[L()] || M.en; }

let curKind = null;
function render(kind, el) {
  el = el || document.getElementById('infoView'); if (!el) return;
  curKind = kind;
  el.innerHTML = kind === 'accessibility' ? a11yHTML() : licensesHTML();
}
function title(kind) { return kind === 'accessibility' ? a11yTitle() : t('licT'); }
document.addEventListener('click', e => {
  const root = document.getElementById('infoView'); if (!root || !root.contains(e.target)) return;
  const b = e.target.closest('[data-nav],[data-top],[data-a11y-open]'); if (!b) return;
  if (b.dataset.nav) CR.showView(b.dataset.nav);
  else if (b.dataset.top) { window.scrollTo(0, 0); const h = document.getElementById('infoH'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
  else if (b.dataset.a11yOpen && window.A11Y) A11Y.open();
});

document.addEventListener('cr-config', () => { const el = document.getElementById('infoView'); if (el && !el.hidden && curKind) render(curKind, el); });
document.addEventListener('cr-user', () => { const el = document.getElementById('infoView'); if (el && !el.hidden && curKind) setTimeout(() => render(curKind, el), 300); });
new MutationObserver(() => {
  const el = document.getElementById('infoView'); if (el && !el.hidden && curKind) { render(curKind, el); try { document.title = title(curKind) + ' · Chord Room'; } catch (e) {} }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

/* perf: the per-page meta (SEO, applyMeta) lives in assets/pages.js, which every page loads; this file loads on first use */
const SM = (window.PAGES && PAGES.seo) || {};
window.INFO = { render, title, applyMeta: SM.applyMeta, SEO: SM.SEO, PATHS: SM.PATHS, _origin: SM.origin };
})();
