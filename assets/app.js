(()=>{
const $=s=>document.querySelector(s);
const SR=22050;
const tick=()=>new Promise(r=>setTimeout(r,0));
const mod=(a,n)=>((a%n)+n)%n;

/* ---------- i18n ---------- */
const I={
he:{tagline:'קצב, סולם, אקורדים וערוצי AI מכל שיר',library:'השירים שלי',upload:'העלאת שיר',loaded:'טעון עכשיו',demo:'דוגמה',key:'סולם',length:'משך',loudness:'עוצמה',loop:'לופ',click:'קליק',wave:'גל',zoom:'זום',grid:'גריד',
now:'עכשיו',next:'הבא',inBeats:'בעוד {n} פעמות',end:'סוף',playAlong:'נגינה',transpose:'טרנספוזיציה',transposeH:'הזזת כל האקורדים בחצאי טונים',capo:'קאפו',capo0:'בלי קאפו',capoN:'צורות לנגינה עם קאפו בשריג {n}',diagrams:'דיאגרמות',guitar:'גיטרה',piano:'פסנתר',names:'שמות תווים',auto:'אוטו',harmonic:'מיקס הרמוני',harmonicH:'סולמות שמתחברים לשיר הזה',
stems:'ערוצים',stemsH:'שירה, תופים, בס ושאר הכלים. ההפרדה נעשית במודל הבינה המלאכותית Demucs v4, ישירות בדפדפן שלך.',aiSep:'הפרדה ב־AI',quickSep:'הפרדה מהירה',cancel:'ביטול',engGpu:'מנוע: GPU',engCpu:'מנוע: CPU (איטי יותר)',
aiFirst:'בפעם הראשונה המודל יורד (כ־100MB), ואחר כך נשמר בדפדפן. ב־GPU שיר של 4 דקות לוקח בערך 1–3 דקות, ב־CPU יותר.',aiDl:'מוריד את מודל ה־AI… {p}%',aiPrep:'מכין את המודל…',aiRun:'מפריד… {p}%',aiEta:' · עוד כ־{t}',aiDone:'הערוצים מוכנים. הנגן מנגן מהם עכשיו.',aiErr:'מודל ה־AI לא נטען במכשיר הזה ({m}). אפשר להשתמש בהפרדה המהירה.',
quickDone:'הפרדה מהירה מוכנה. האיכות נמוכה מההפרדה ב־AI.',quickRun:'מפריד (מהיר)… {p}%',needAudio:'צריך קובץ שמע טעון כדי להפריד ערוצים.',canceled:'ההפרדה בוטלה.',mono:'השיר מוקלט במונו.',
vocals:'שירה',drums:'תופים',bass:'בס',other:'שאר הכלים',karaoke:'קריוקי',
export:'ייצוא ל־FL Studio',exportH:'הכול נארז ב־ZIP: קובץ WAV לכל ערוץ, קובצי MIDI לפסנתר, וקובץ מידע עם BPM וסולם. מניחים הכול בתחילת תיבה 1 והכול מסונכרן.',
xInst:'אינסטרומנטלי',xOrig:'המקור',xChords:'אקורדים',xBassM:'קו בס',xMel:'מלודיה משירה',download:'הורדה כ־ZIP',packing:'אורז…',transcribing:'מתמלל תווים… {p}%',dlConfirm:'מאשרים את ההורדה בחלון שנפתח…',dlDone:'ההורדה נשלחה ({s} MB).',dlDeclined:'ההורדה בוטלה.',dlBusy:'כבר פתוח חלון הורדה.',dlFail:'ההורדה לא הצליחה. נסה שוב או בחר פחות קבצים.',dlNone:'סמן לפחות קובץ אחד.',dlUnavail:'ההורדה עובדת כשהעמוד פתוח ב־claude.ai.',needStems:'דורש הפרדה',
chordsIn:'האקורדים בשיר',sheet:'גיליון אקורדים',sheetHint:'לחיצה על משבצת קופצת לשם',edit:'עריכת אקורדים',editing:'סיום עריכה',editHint:'לחיצה על משבצת משנה את האקורד',thisBeat:'רק הפעמה',block:'כל הקטע',noChord:'בלי',maj:'מז׳ור',min:'מינור',
about:'על הכלי',aboutT:'הניתוח רץ כולו בדפדפן, והשיר לא נשלח לשום מקום. הזיהוי אוטומטי: אפשר לתקן גריד ואקורדים ידנית.',credits:'הפרדת ערוצים: Demucs v4 של Meta (משקלות לשימוש אישי ולא מסחרי), מורץ עם ONNX Runtime Web.',keys:'קיצורי מקלדת',
kPlay:'נגן / עצור',kBar:'תיבה אחורה / קדימה',kCue:'קיו חם: שמירה / קפיצה (Shift מוחק)',kLoop:'לופ',kClick:'קליק מטרונום',kZoom:'זום',
libH:'נשמרים בדפדפן הזה בלבד: קצב, סולם, אקורדים וקיואים. כדי לנגן צריך להעלות את הקובץ שוב.',libEmpty:'עוד אין כאן שירים.',del:'מחיקה',sure:'בטוח?',close:'סגירה',fromLib:'נפתח מהשירים שלי. כדי לנגן ולראות גל קול, העלה שוב את קובץ השמע.',drop:'שחרר כאן את השיר',
readErr:'לא הצלחנו לקרוא את הקובץ. נסה MP3, WAV או M4A.',bReading:'קורא את הקובץ…',bPrep:'מכין את השמע…',bWave:'מצייר גל קול…',bBeats:'מאתר פעמות…',bChords:'מזהה אקורדים…',bTempo:'מחשב קצב וסולם…',bDemo:'יוצר שיר דוגמה…',
major:'מז׳ור',minor:'מינור',same:'אותו',rel:'מקביל',up:'+1',down:'−1',sol:['דו','דו♯','רה','מי♭','מי','פה','פה♯','סול','לה♭','לה','סי♭','סי'],min_:'דק׳',sec_:'שנ׳'},
en:{tagline:'Tempo, key, chords and AI stems from any song',library:'My songs',upload:'Upload song',loaded:'Loaded',demo:'Demo',key:'Key',length:'Length',loudness:'Loudness',loop:'Loop',click:'Click',wave:'Wave',zoom:'Zoom',grid:'Grid',
now:'Now',next:'Next',inBeats:'in {n} beats',end:'End',playAlong:'Play along',transpose:'Transpose',transposeH:'Shift every chord by semitones',capo:'Capo',capo0:'No capo',capoN:'Shapes for capo on fret {n}',diagrams:'Diagrams',guitar:'Guitar',piano:'Piano',names:'Note names',auto:'Auto',harmonic:'Harmonic mixing',harmonicH:'Keys that mix smoothly with this track',
stems:'Stems',stemsH:'Vocals, drums, bass and everything else, separated by the Demucs v4 AI model right in your browser.',aiSep:'Separate with AI',quickSep:'Quick separation',cancel:'Cancel',engGpu:'Engine: GPU',engCpu:'Engine: CPU (slower)',
aiFirst:'The first run downloads the model (about 100 MB); after that it stays in your browser. On a GPU a 4-minute song takes about 1–3 minutes; on CPU longer.',aiDl:'Downloading the AI model… {p}%',aiPrep:'Preparing the model…',aiRun:'Separating… {p}%',aiEta:' · about {t} left',aiDone:'Stems are ready. The player now plays from them.',aiErr:'The AI model could not start on this device ({m}). Quick separation still works.',
quickDone:'Quick separation ready. Quality is lower than the AI separation.',quickRun:'Separating (quick)… {p}%',needAudio:'Load an audio file to separate stems.',canceled:'Separation canceled.',mono:'This song is mono.',
vocals:'Vocals',drums:'Drums',bass:'Bass',other:'Other',karaoke:'Karaoke',
export:'Export for FL Studio',exportH:'Everything is packed in a ZIP: a WAV per stem, piano MIDI files and an info file with BPM and key. Drop it all at bar 1 and it lines up.',
xInst:'Instrumental',xOrig:'Original',xChords:'Chords',xBassM:'Bass line',xMel:'Vocal melody',download:'Download ZIP',packing:'Packing…',transcribing:'Transcribing notes… {p}%',dlConfirm:'Confirm the download in the dialog…',dlDone:'Download sent ({s} MB).',dlDeclined:'Download canceled.',dlBusy:'A download dialog is already open.',dlFail:'The download failed. Try again or pick fewer files.',dlNone:'Select at least one file.',dlUnavail:'Downloads work when the page is open in claude.ai.',needStems:'needs stems',
chordsIn:'Chords in this song',sheet:'Chord sheet',sheetHint:'Click a cell to jump there',edit:'Edit chords',editing:'Done editing',editHint:'Click a cell to change its chord',thisBeat:'This beat',block:'Whole block',noChord:'None',maj:'Major',min:'Minor',
about:'About',aboutT:'All analysis runs in your browser and the song never leaves your device. Detection is automatic; you can correct the grid and chords by hand.',credits:'Stem separation: Demucs v4 by Meta (weights for personal, non-commercial use), run with ONNX Runtime Web.',keys:'Keyboard',
kPlay:'Play / pause',kBar:'Bar back / forward',kCue:'Hot cue: set / jump (Shift clears)',kLoop:'Loop',kClick:'Metronome click',kZoom:'Zoom',
libH:'Saved in this browser only: tempo, key, chords and cues. Upload the file again to play it.',libEmpty:'No songs yet.',del:'Delete',sure:'Sure?',close:'Close',fromLib:'Opened from My songs. Upload the audio file again to play it and see the waveform.',drop:'Drop the song here',
readErr:'Could not read the file. Try MP3, WAV or M4A.',bReading:'Reading the file…',bPrep:'Preparing audio…',bWave:'Drawing the waveform…',bBeats:'Finding beats…',bChords:'Detecting chords…',bTempo:'Tempo and key…',bDemo:'Creating a demo song…',
major:'major',minor:'minor',same:'Same',rel:'Relative',up:'+1',down:'−1',sol:null,min_:'min',sec_:'s'},
ar:{tagline:'الإيقاع والمقام والكوردات وفصل المسارات بالذكاء الاصطناعي',library:'أغانيّ',upload:'رفع أغنية',loaded:'المحمّلة الآن',demo:'تجريبي',key:'المقام',length:'المدة',loudness:'الشدة',loop:'تكرار',click:'نقرة',wave:'الموجة',zoom:'تكبير',grid:'الشبكة',
now:'الآن',next:'التالي',inBeats:'بعد {n} نبضات',end:'النهاية',playAlong:'العزف',transpose:'تحويل',transposeH:'نقل كل الكوردات بأنصاف الدرجات',capo:'كابو',capo0:'بدون كابو',capoN:'أشكال للعزف مع كابو على الدستان {n}',diagrams:'المخططات',guitar:'غيتار',piano:'بيانو',names:'أسماء النوتات',auto:'تلقائي',harmonic:'مزج متناغم',harmonicH:'مقامات تمتزج بسلاسة مع هذه الأغنية',
stems:'المسارات',stemsH:'الغناء والطبول والباص وباقي الآلات، يفصلها نموذج الذكاء الاصطناعي Demucs v4 داخل متصفحك.',aiSep:'فصل بالذكاء الاصطناعي',quickSep:'فصل سريع',cancel:'إلغاء',engGpu:'المحرك: GPU',engCpu:'المحرك: CPU (أبطأ)',
aiFirst:'في المرة الأولى يُحمَّل النموذج (نحو 100MB) ثم يبقى في المتصفح. على GPU تستغرق أغنية من 4 دقائق نحو 1–3 دقائق، وعلى CPU أكثر.',aiDl:'تحميل نموذج الذكاء الاصطناعي… {p}%',aiPrep:'تجهيز النموذج…',aiRun:'جارٍ الفصل… {p}%',aiEta:' · متبقٍّ نحو {t}',aiDone:'المسارات جاهزة، والمشغّل يعزف منها الآن.',aiErr:'تعذّر تشغيل النموذج على هذا الجهاز ({m}). الفصل السريع ما زال متاحًا.',
quickDone:'الفصل السريع جاهز، وجودته أقل من الفصل بالذكاء الاصطناعي.',quickRun:'جارٍ الفصل السريع… {p}%',needAudio:'حمّل ملفًا صوتيًا لفصل المسارات.',canceled:'أُلغي الفصل.',mono:'هذه الأغنية أحادية القناة.',
vocals:'الغناء',drums:'الطبول',bass:'الباص',other:'باقي الآلات',karaoke:'كاريوكي',
export:'تصدير إلى FL Studio',exportH:'كل شيء في ملف ZIP: ملف WAV لكل مسار، وملفات MIDI للبيانو، وملف معلومات بالإيقاع والمقام. ضعها كلها عند المازورة 1 فتتزامن.',
xInst:'موسيقى بلا غناء',xOrig:'الأصلي',xChords:'الكوردات',xBassM:'خط الباص',xMel:'لحن الغناء',download:'تنزيل ZIP',packing:'جارٍ التجميع…',transcribing:'تدوين النوتات… {p}%',dlConfirm:'أكّد التنزيل في النافذة…',dlDone:'أُرسل التنزيل ({s} MB).',dlDeclined:'أُلغي التنزيل.',dlBusy:'نافذة تنزيل مفتوحة بالفعل.',dlFail:'فشل التنزيل. حاول مجددًا أو اختر ملفات أقل.',dlNone:'اختر ملفًا واحدًا على الأقل.',dlUnavail:'التنزيل يعمل عند فتح الصفحة في claude.ai.',needStems:'يتطلب الفصل',
chordsIn:'كوردات الأغنية',sheet:'ورقة الكوردات',sheetHint:'انقر على خانة للانتقال إليها',edit:'تعديل الكوردات',editing:'إنهاء التعديل',editHint:'انقر على خانة لتغيير الكورد',thisBeat:'هذه النبضة',block:'المقطع كله',noChord:'بلا',maj:'ماجور',min:'مينور',
about:'عن الأداة',aboutT:'يجري التحليل كله داخل متصفحك ولا تغادر الأغنية جهازك. الاكتشاف تلقائي ويمكنك تصحيح الشبكة والكوردات يدويًا.',credits:'فصل المسارات: Demucs v4 من Meta (أوزان للاستخدام الشخصي غير التجاري)، يعمل عبر ONNX Runtime Web.',keys:'لوحة المفاتيح',
kPlay:'تشغيل / إيقاف',kBar:'مازورة للخلف / للأمام',kCue:'نقطة سريعة: حفظ / انتقال (Shift للحذف)',kLoop:'تكرار',kClick:'نقرة المترونوم',kZoom:'تكبير',
libH:'تُحفظ في هذا المتصفح فقط: الإيقاع والمقام والكوردات والنقاط. ارفع الملف مجددًا للتشغيل.',libEmpty:'لا توجد أغانٍ بعد.',del:'حذف',sure:'متأكد؟',close:'إغلاق',fromLib:'فُتحت من أغانيّ. ارفع الملف الصوتي مجددًا للتشغيل ورؤية الموجة.',drop:'أفلت الأغنية هنا',
readErr:'تعذّرت قراءة الملف. جرّب MP3 أو WAV أو M4A.',bReading:'قراءة الملف…',bPrep:'تجهيز الصوت…',bWave:'رسم الموجة…',bBeats:'البحث عن النبضات…',bChords:'اكتشاف الكوردات…',bTempo:'الإيقاع والمقام…',bDemo:'إنشاء أغنية تجريبية…',
major:'ماجور',minor:'مينور',same:'نفسه',rel:'المقابل',up:'+1',down:'−1',sol:['دو','دو♯','ري','مي♭','مي','فا','فا♯','صول','لا♭','لا','سي♭','سي'],min_:'د',sec_:'ث'},
ru:{tagline:'Темп, тональность, аккорды и AI-разделение любой песни',library:'Мои песни',upload:'Загрузить песню',loaded:'Загружено',demo:'Демо',key:'Тональность',length:'Длина',loudness:'Громкость',loop:'Луп',click:'Клик',wave:'Волна',zoom:'Зум',grid:'Сетка',
now:'Сейчас',next:'Далее',inBeats:'через {n} долей',end:'Конец',playAlong:'Игра',transpose:'Транспонирование',transposeH:'Сдвиг всех аккордов на полутоны',capo:'Каподастр',capo0:'Без каподастра',capoN:'Аппликатуры с каподастром на {n} ладу',diagrams:'Схемы',guitar:'Гитара',piano:'Фортепиано',names:'Названия нот',auto:'Авто',harmonic:'Гармоничное сведение',harmonicH:'Тональности, которые хорошо сводятся с этим треком',
stems:'Стемы',stemsH:'Вокал, барабаны, бас и остальное — разделяет нейросеть Demucs v4 прямо в браузере.',aiSep:'Разделить с AI',quickSep:'Быстрое разделение',cancel:'Отмена',engGpu:'Движок: GPU',engCpu:'Движок: CPU (медленнее)',
aiFirst:'При первом запуске модель загружается (около 100 МБ), потом хранится в браузере. На GPU 4-минутная песня занимает 1–3 минуты, на CPU дольше.',aiDl:'Загрузка AI-модели… {p}%',aiPrep:'Подготовка модели…',aiRun:'Разделение… {p}%',aiEta:' · осталось около {t}',aiDone:'Стемы готовы, плеер играет из них.',aiErr:'AI-модель не запустилась на этом устройстве ({m}). Быстрое разделение доступно.',
quickDone:'Быстрое разделение готово. Качество ниже, чем у AI.',quickRun:'Быстрое разделение… {p}%',needAudio:'Загрузите аудиофайл, чтобы разделить стемы.',canceled:'Разделение отменено.',mono:'Песня записана в моно.',
vocals:'Вокал',drums:'Барабаны',bass:'Бас',other:'Остальное',karaoke:'Караоке',
export:'Экспорт для FL Studio',exportH:'Всё в ZIP: WAV для каждого стема, MIDI-файлы для фортепиано и файл с BPM и тональностью. Поставьте всё на такт 1 — и всё совпадёт.',
xInst:'Минус',xOrig:'Оригинал',xChords:'Аккорды',xBassM:'Басовая линия',xMel:'Мелодия вокала',download:'Скачать ZIP',packing:'Упаковка…',transcribing:'Распознавание нот… {p}%',dlConfirm:'Подтвердите загрузку в окне…',dlDone:'Загрузка отправлена ({s} МБ).',dlDeclined:'Загрузка отменена.',dlBusy:'Окно загрузки уже открыто.',dlFail:'Не удалось скачать. Повторите или выберите меньше файлов.',dlNone:'Выберите хотя бы один файл.',dlUnavail:'Скачивание работает, когда страница открыта в claude.ai.',needStems:'нужны стемы',
chordsIn:'Аккорды песни',sheet:'Аккордовая сетка',sheetHint:'Нажмите на клетку, чтобы перейти туда',edit:'Править аккорды',editing:'Готово',editHint:'Нажмите на клетку, чтобы сменить аккорд',thisBeat:'Эта доля',block:'Весь блок',noChord:'Нет',maj:'Мажор',min:'Минор',
about:'О сервисе',aboutT:'Анализ идёт в браузере, песня не покидает устройство. Распознавание автоматическое, сетку и аккорды можно поправить вручную.',credits:'Разделение: Demucs v4 от Meta (веса для личного некоммерческого использования), через ONNX Runtime Web.',keys:'Клавиши',
kPlay:'Пуск / пауза',kBar:'Такт назад / вперёд',kCue:'Хот-кью: задать / перейти (Shift удаляет)',kLoop:'Луп',kClick:'Метроном',kZoom:'Зум',
libH:'Хранится только в этом браузере: темп, тональность, аккорды и метки. Для воспроизведения загрузите файл снова.',libEmpty:'Песен пока нет.',del:'Удалить',sure:'Точно?',close:'Закрыть',fromLib:'Открыто из «Мои песни». Загрузите аудиофайл снова, чтобы играть и видеть волну.',drop:'Перетащите песню сюда',
readErr:'Не удалось прочитать файл. Попробуйте MP3, WAV или M4A.',bReading:'Чтение файла…',bPrep:'Подготовка аудио…',bWave:'Рисую волну…',bBeats:'Поиск долей…',bChords:'Распознавание аккордов…',bTempo:'Темп и тональность…',bDemo:'Создаю демо…',
major:'мажор',minor:'минор',same:'Та же',rel:'Параллельная',up:'+1',down:'−1',sol:['До','До♯','Ре','Ми♭','Ми','Фа','Фа♯','Соль','Ля♭','Ля','Си♭','Си'],min_:'мин',sec_:'с'},
es:{tagline:'Tempo, tonalidad, acordes y pistas separadas con IA de cualquier canción',library:'Mis canciones',upload:'Subir canción',loaded:'Cargada',demo:'Demo',key:'Tonalidad',length:'Duración',loudness:'Sonoridad',loop:'Bucle',click:'Clic',wave:'Onda',zoom:'Zoom',grid:'Rejilla',
now:'Ahora',next:'Siguiente',inBeats:'en {n} tiempos',end:'Fin',playAlong:'Tocar',transpose:'Transponer',transposeH:'Mueve todos los acordes por semitonos',capo:'Cejilla',capo0:'Sin cejilla',capoN:'Posiciones con cejilla en el traste {n}',diagrams:'Diagramas',guitar:'Guitarra',piano:'Piano',names:'Nombres de notas',auto:'Auto',harmonic:'Mezcla armónica',harmonicH:'Tonalidades que mezclan bien con esta pista',
stems:'Pistas',stemsH:'Voz, batería, bajo y el resto, separados por el modelo de IA Demucs v4 en tu navegador.',aiSep:'Separar con IA',quickSep:'Separación rápida',cancel:'Cancelar',engGpu:'Motor: GPU',engCpu:'Motor: CPU (más lento)',
aiFirst:'La primera vez se descarga el modelo (unos 100 MB) y luego queda en el navegador. Con GPU una canción de 4 minutos tarda 1–3 minutos; con CPU, más.',aiDl:'Descargando el modelo de IA… {p}%',aiPrep:'Preparando el modelo…',aiRun:'Separando… {p}%',aiEta:' · faltan unos {t}',aiDone:'Pistas listas. El reproductor ya suena desde ellas.',aiErr:'El modelo de IA no pudo iniciar en este equipo ({m}). La separación rápida sigue disponible.',
quickDone:'Separación rápida lista. La calidad es menor que con IA.',quickRun:'Separando (rápido)… {p}%',needAudio:'Carga un archivo de audio para separar pistas.',canceled:'Separación cancelada.',mono:'La canción está en mono.',
vocals:'Voz',drums:'Batería',bass:'Bajo',other:'Resto',karaoke:'Karaoke',
export:'Exportar a FL Studio',exportH:'Todo va en un ZIP: un WAV por pista, archivos MIDI de piano y un archivo con BPM y tonalidad. Colócalo todo en el compás 1 y queda sincronizado.',
xInst:'Instrumental',xOrig:'Original',xChords:'Acordes',xBassM:'Línea de bajo',xMel:'Melodía vocal',download:'Descargar ZIP',packing:'Empaquetando…',transcribing:'Transcribiendo notas… {p}%',dlConfirm:'Confirma la descarga en el cuadro…',dlDone:'Descarga enviada ({s} MB).',dlDeclined:'Descarga cancelada.',dlBusy:'Ya hay un cuadro de descarga abierto.',dlFail:'La descarga falló. Inténtalo de nuevo o elige menos archivos.',dlNone:'Elige al menos un archivo.',dlUnavail:'Las descargas funcionan con la página abierta en claude.ai.',needStems:'requiere pistas',
chordsIn:'Acordes de la canción',sheet:'Hoja de acordes',sheetHint:'Haz clic en una celda para saltar allí',edit:'Editar acordes',editing:'Terminar',editHint:'Haz clic en una celda para cambiar el acorde',thisBeat:'Este tiempo',block:'Todo el bloque',noChord:'Ninguno',maj:'Mayor',min:'Menor',
about:'Acerca de',aboutT:'Todo el análisis ocurre en tu navegador y la canción no sale de tu equipo. La detección es automática; puedes corregir la rejilla y los acordes a mano.',credits:'Separación de pistas: Demucs v4 de Meta (pesos para uso personal no comercial), con ONNX Runtime Web.',keys:'Teclado',
kPlay:'Reproducir / pausar',kBar:'Compás atrás / adelante',kCue:'Hot cue: fijar / saltar (Shift borra)',kLoop:'Bucle',kClick:'Clic de metrónomo',kZoom:'Zoom',
libH:'Se guarda solo en este navegador: tempo, tonalidad, acordes y cues. Sube el archivo otra vez para reproducirlo.',libEmpty:'Aún no hay canciones.',del:'Borrar',sure:'¿Seguro?',close:'Cerrar',fromLib:'Abierta desde Mis canciones. Sube el audio otra vez para reproducir y ver la onda.',drop:'Suelta la canción aquí',
readErr:'No se pudo leer el archivo. Prueba MP3, WAV o M4A.',bReading:'Leyendo el archivo…',bPrep:'Preparando el audio…',bWave:'Dibujando la onda…',bBeats:'Buscando tiempos…',bChords:'Detectando acordes…',bTempo:'Tempo y tonalidad…',bDemo:'Creando una canción demo…',
major:'mayor',minor:'menor',same:'Misma',rel:'Relativa',up:'+1',down:'−1',sol:['Do','Do♯','Re','Mi♭','Mi','Fa','Fa♯','Sol','La♭','La','Si♭','Si'],min_:'min',sec_:'s'}
};

const IA={
he:{notice:'הודעה',signIn:'כניסה',signUp:'הרשמה',signOut:'יציאה מהחשבון',account:'החשבון שלי',adminPanel:'ניהול',
authIn:'כניסה לחשבון',authUp:'יצירת חשבון',authForgot:'שחזור סיסמה',email:'אימייל',password:'סיסמה',password2:'אימות סיסמה',username:'שם משתמש',usernameH:'3–24 תווים: אותיות באנגלית, ספרות, נקודה, מקף וקו תחתון',forgot:'שכחתי סיסמה',toIn:'כבר יש לך חשבון? כניסה',toUp:'אין לך חשבון? הרשמה',sendReset:'שליחת קישור לאיפוס',
resetSent:'אם הכתובת רשומה, נשלח אליה קישור לאיפוס הסיסמה.',checkEmail:'שלחנו מייל אימות ל־{e}. אחרי האישור אפשר להיכנס.',errMismatch:'הסיסמאות לא תואמות.',errShort:'הסיסמה צריכה להכיל לפחות 8 תווים.',errUser:'שם המשתמש לא תקין.',errUserTaken:'שם המשתמש הזה כבר תפוס.',errLogin:'האימייל או הסיסמה שגויים.',errConfirm:'צריך לאשר את כתובת המייל לפני הכניסה.',errGeneric:'משהו השתבש: {m}',signupClosed:'ההרשמה סגורה כרגע.',
newPass:'סיסמה חדשה',setNewPass:'הגדרת סיסמה חדשה',passChanged:'הסיסמה עודכנה.',
photo:'תמונת פרופיל',changePhoto:'החלפת תמונה',removePhoto:'הסרה',nick:'שם תצוגה',bio:'על עצמי',prefLang:'שפה מועדפת',save:'שמירה',saved:'נשמר.',saveFail:'השמירה לא הצליחה.',uploading:'מעלה…',
security:'אבטחה',changeEmail:'שינוי אימייל',newEmail:'אימייל חדש',emailSent:'שלחנו מייל אישור לכתובת החדשה. השינוי ייכנס לתוקף אחרי האישור.',changePass:'שינוי סיסמה',curPass:'סיסמה נוכחית',errCurPass:'הסיסמה הנוכחית שגויה.',
details:'פרטי החשבון',role:'תפקיד',roleAdmin:'מנהל',roleUser:'משתמש',joined:'הצטרפות',lastSeen:'ביקור אחרון',songsSaved:'שירים',seps:'הפרדות',
admin:'ניהול האתר',users:'משתמשים',settings:'הגדרות האתר',statUsers:'משתמשים',statSongs:'שירים שנשמרו',statSeps:'הפרדות ערוצים',statActive:'פעילים ב־7 ימים',colUser:'משתמש',colStatus:'סטטוס',active:'פעיל',blockedS:'חסום',block:'חסימה',unblock:'שחרור',makeAdmin:'הפוך למנהל',removeAdmin:'הסר ניהול',you:'אתה',noUsers:'עוד אין משתמשים רשומים.',search:'חיפוש לפי שם או אימייל',
siteTitle:'שם האתר',defLang:'שפת ברירת מחדל',announce:'הודעה לכל המשתמשים',announceH:'מוצגת בראש העמוד. ריק = מוסתרת.',aiOn:'הפרדה ב־AI זמינה למשתמשים',dlOn:'הורדות זמינות למשתמשים',reqLogin:'חובה להיכנס כדי להשתמש בכלי',allowSignup:'הרשמה פתוחה למשתמשים חדשים',saveSettings:'שמירת הגדרות',
blockedMsg:'מנהל האתר חסם את החשבון שלך.',offByAdmin:'המנהל כיבה את האפשרות הזו.',gateMsg:'כדי להשתמש בכלי צריך להיכנס לחשבון.',libH:'השירים נשמרים בחשבון שלך ומסונכרנים בין מכשירים. בלי חשבון הם נשמרים רק בדפדפן הזה.'},
en:{notice:'Notice',signIn:'Sign in',signUp:'Sign up',signOut:'Sign out',account:'My account',adminPanel:'Admin',
authIn:'Sign in to your account',authUp:'Create an account',authForgot:'Reset your password',email:'Email',password:'Password',password2:'Confirm password',username:'Username',usernameH:'3–24 characters: English letters, digits, dot, dash and underscore',forgot:'Forgot password',toIn:'Already have an account? Sign in',toUp:'No account yet? Sign up',sendReset:'Send reset link',
resetSent:'If this address is registered, a reset link is on its way.',checkEmail:'We sent a confirmation email to {e}. Sign in after you confirm it.',errMismatch:'The passwords do not match.',errShort:'The password needs at least 8 characters.',errUser:'That username is not valid.',errUserTaken:'That username is already taken.',errLogin:'Wrong email or password.',errConfirm:'Confirm your email address before signing in.',errGeneric:'Something went wrong: {m}',signupClosed:'Sign-ups are closed right now.',
newPass:'New password',setNewPass:'Set a new password',passChanged:'Password updated.',
photo:'Profile photo',changePhoto:'Change photo',removePhoto:'Remove',nick:'Display name',bio:'About me',prefLang:'Preferred language',save:'Save',saved:'Saved.',saveFail:'Could not save.',uploading:'Uploading…',
security:'Security',changeEmail:'Change email',newEmail:'New email',emailSent:'We sent a confirmation to the new address. The change applies after you confirm it.',changePass:'Change password',curPass:'Current password',errCurPass:'The current password is wrong.',
details:'Account details',role:'Role',roleAdmin:'Admin',roleUser:'User',joined:'Joined',lastSeen:'Last visit',songsSaved:'Songs',seps:'Separations',
admin:'Site admin',users:'Users',settings:'Site settings',statUsers:'Users',statSongs:'Songs saved',statSeps:'Stem separations',statActive:'Active in 7 days',colUser:'User',colStatus:'Status',active:'Active',blockedS:'Blocked',block:'Block',unblock:'Unblock',makeAdmin:'Make admin',removeAdmin:'Remove admin',you:'you',noUsers:'No registered users yet.',search:'Search by name or email',
siteTitle:'Site name',defLang:'Default language',announce:'Announcement for all users',announceH:'Shown at the top of the page. Leave empty to hide.',aiOn:'AI separation available to users',dlOn:'Downloads available to users',reqLogin:'Require sign-in to use the tool',allowSignup:'New sign-ups open',saveSettings:'Save settings',
blockedMsg:'The site admin has blocked your account.',offByAdmin:'The admin turned this off.',gateMsg:'Sign in to use this tool.',libH:'Songs are saved to your account and sync across devices. Without an account they stay in this browser only.'},
ar:{notice:'إشعار',signIn:'دخول',signUp:'تسجيل',signOut:'تسجيل الخروج',account:'حسابي',adminPanel:'الإدارة',
authIn:'الدخول إلى حسابك',authUp:'إنشاء حساب',authForgot:'استعادة كلمة المرور',email:'البريد الإلكتروني',password:'كلمة المرور',password2:'تأكيد كلمة المرور',username:'اسم المستخدم',usernameH:'من 3 إلى 24 حرفًا: أحرف إنجليزية وأرقام ونقطة وشرطة وشرطة سفلية',forgot:'نسيت كلمة المرور',toIn:'لديك حساب؟ ادخل',toUp:'ليس لديك حساب؟ سجّل',sendReset:'إرسال رابط الاستعادة',
resetSent:'إن كان العنوان مسجلًا فسيصله رابط لإعادة تعيين كلمة المرور.',checkEmail:'أرسلنا رسالة تأكيد إلى {e}. ادخل بعد التأكيد.',errMismatch:'كلمتا المرور غير متطابقتين.',errShort:'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',errUser:'اسم المستخدم غير صالح.',errUserTaken:'اسم المستخدم مستخدم بالفعل.',errLogin:'البريد أو كلمة المرور غير صحيحين.',errConfirm:'أكّد بريدك الإلكتروني قبل الدخول.',errGeneric:'حدث خطأ: {m}',signupClosed:'التسجيل مغلق حاليًا.',
newPass:'كلمة مرور جديدة',setNewPass:'تعيين كلمة مرور جديدة',passChanged:'تم تحديث كلمة المرور.',
photo:'صورة الملف',changePhoto:'تغيير الصورة',removePhoto:'إزالة',nick:'الاسم الظاهر',bio:'نبذة عني',prefLang:'اللغة المفضلة',save:'حفظ',saved:'تم الحفظ.',saveFail:'تعذّر الحفظ.',uploading:'جارٍ الرفع…',
security:'الأمان',changeEmail:'تغيير البريد',newEmail:'البريد الجديد',emailSent:'أرسلنا تأكيدًا إلى العنوان الجديد، ويسري التغيير بعد التأكيد.',changePass:'تغيير كلمة المرور',curPass:'كلمة المرور الحالية',errCurPass:'كلمة المرور الحالية غير صحيحة.',
details:'تفاصيل الحساب',role:'الدور',roleAdmin:'مدير',roleUser:'مستخدم',joined:'الانضمام',lastSeen:'آخر زيارة',songsSaved:'الأغاني',seps:'عمليات الفصل',
admin:'إدارة الموقع',users:'المستخدمون',settings:'إعدادات الموقع',statUsers:'المستخدمون',statSongs:'الأغاني المحفوظة',statSeps:'عمليات الفصل',statActive:'نشطون خلال 7 أيام',colUser:'المستخدم',colStatus:'الحالة',active:'نشط',blockedS:'محظور',block:'حظر',unblock:'إلغاء الحظر',makeAdmin:'تعيين مديرًا',removeAdmin:'إزالة الإدارة',you:'أنت',noUsers:'لا يوجد مستخدمون بعد.',search:'بحث بالاسم أو البريد',
siteTitle:'اسم الموقع',defLang:'اللغة الافتراضية',announce:'إعلان لجميع المستخدمين',announceH:'يظهر أعلى الصفحة. اتركه فارغًا لإخفائه.',aiOn:'الفصل بالذكاء الاصطناعي متاح',dlOn:'التنزيلات متاحة',reqLogin:'يجب الدخول لاستخدام الأداة',allowSignup:'التسجيل مفتوح للمستخدمين الجدد',saveSettings:'حفظ الإعدادات',
blockedMsg:'حظر مدير الموقع حسابك.',offByAdmin:'أوقف المدير هذا الخيار.',gateMsg:'ادخل إلى حسابك لاستخدام الأداة.',libH:'تُحفظ الأغاني في حسابك وتتزامن بين الأجهزة. بدون حساب تبقى في هذا المتصفح فقط.'},
ru:{notice:'Объявление',signIn:'Войти',signUp:'Регистрация',signOut:'Выйти',account:'Мой аккаунт',adminPanel:'Админ',
authIn:'Вход в аккаунт',authUp:'Создание аккаунта',authForgot:'Восстановление пароля',email:'Email',password:'Пароль',password2:'Повторите пароль',username:'Имя пользователя',usernameH:'3–24 символа: латиница, цифры, точка, дефис и подчёркивание',forgot:'Забыли пароль?',toIn:'Уже есть аккаунт? Войти',toUp:'Нет аккаунта? Регистрация',sendReset:'Отправить ссылку',
resetSent:'Если адрес зарегистрирован, на него придёт ссылка для сброса пароля.',checkEmail:'Мы отправили письмо на {e}. Войдите после подтверждения.',errMismatch:'Пароли не совпадают.',errShort:'Пароль должен быть не короче 8 символов.',errUser:'Недопустимое имя пользователя.',errUserTaken:'Это имя уже занято.',errLogin:'Неверный email или пароль.',errConfirm:'Подтвердите email перед входом.',errGeneric:'Что-то пошло не так: {m}',signupClosed:'Регистрация сейчас закрыта.',
newPass:'Новый пароль',setNewPass:'Задать новый пароль',passChanged:'Пароль обновлён.',
photo:'Фото профиля',changePhoto:'Сменить фото',removePhoto:'Удалить',nick:'Отображаемое имя',bio:'О себе',prefLang:'Язык',save:'Сохранить',saved:'Сохранено.',saveFail:'Не удалось сохранить.',uploading:'Загрузка…',
security:'Безопасность',changeEmail:'Сменить email',newEmail:'Новый email',emailSent:'Мы отправили подтверждение на новый адрес. Изменение вступит в силу после подтверждения.',changePass:'Сменить пароль',curPass:'Текущий пароль',errCurPass:'Текущий пароль неверен.',
details:'Данные аккаунта',role:'Роль',roleAdmin:'Админ',roleUser:'Пользователь',joined:'Регистрация',lastSeen:'Последний визит',songsSaved:'Песни',seps:'Разделения',
admin:'Администрирование',users:'Пользователи',settings:'Настройки сайта',statUsers:'Пользователи',statSongs:'Сохранено песен',statSeps:'Разделений',statActive:'Активны за 7 дней',colUser:'Пользователь',colStatus:'Статус',active:'Активен',blockedS:'Заблокирован',block:'Блок',unblock:'Разблок',makeAdmin:'Сделать админом',removeAdmin:'Снять админа',you:'вы',noUsers:'Пользователей пока нет.',search:'Поиск по имени или email',
siteTitle:'Название сайта',defLang:'Язык по умолчанию',announce:'Объявление для всех',announceH:'Показывается вверху страницы. Пусто — скрыто.',aiOn:'AI-разделение доступно',dlOn:'Скачивание доступно',reqLogin:'Вход обязателен для работы',allowSignup:'Регистрация открыта',saveSettings:'Сохранить настройки',
blockedMsg:'Администратор заблокировал ваш аккаунт.',offByAdmin:'Администратор отключил эту функцию.',gateMsg:'Войдите, чтобы пользоваться инструментом.',libH:'Песни сохраняются в аккаунте и синхронизируются между устройствами. Без аккаунта — только в этом браузере.'},
es:{notice:'Aviso',signIn:'Entrar',signUp:'Registrarse',signOut:'Cerrar sesión',account:'Mi cuenta',adminPanel:'Admin',
authIn:'Entra en tu cuenta',authUp:'Crear una cuenta',authForgot:'Recuperar contraseña',email:'Correo',password:'Contraseña',password2:'Repite la contraseña',username:'Usuario',usernameH:'3–24 caracteres: letras inglesas, dígitos, punto, guion y guion bajo',forgot:'Olvidé mi contraseña',toIn:'¿Ya tienes cuenta? Entra',toUp:'¿No tienes cuenta? Regístrate',sendReset:'Enviar enlace',
resetSent:'Si la dirección está registrada, recibirá un enlace para restablecer la contraseña.',checkEmail:'Enviamos un correo de confirmación a {e}. Entra después de confirmarlo.',errMismatch:'Las contraseñas no coinciden.',errShort:'La contraseña necesita al menos 8 caracteres.',errUser:'Ese usuario no es válido.',errUserTaken:'Ese usuario ya existe.',errLogin:'Correo o contraseña incorrectos.',errConfirm:'Confirma tu correo antes de entrar.',errGeneric:'Algo salió mal: {m}',signupClosed:'El registro está cerrado ahora.',
newPass:'Nueva contraseña',setNewPass:'Definir nueva contraseña',passChanged:'Contraseña actualizada.',
photo:'Foto de perfil',changePhoto:'Cambiar foto',removePhoto:'Quitar',nick:'Nombre visible',bio:'Sobre mí',prefLang:'Idioma preferido',save:'Guardar',saved:'Guardado.',saveFail:'No se pudo guardar.',uploading:'Subiendo…',
security:'Seguridad',changeEmail:'Cambiar correo',newEmail:'Correo nuevo',emailSent:'Enviamos una confirmación a la nueva dirección. El cambio se aplica al confirmarla.',changePass:'Cambiar contraseña',curPass:'Contraseña actual',errCurPass:'La contraseña actual es incorrecta.',
details:'Datos de la cuenta',role:'Rol',roleAdmin:'Admin',roleUser:'Usuario',joined:'Alta',lastSeen:'Última visita',songsSaved:'Canciones',seps:'Separaciones',
admin:'Administración',users:'Usuarios',settings:'Ajustes del sitio',statUsers:'Usuarios',statSongs:'Canciones guardadas',statSeps:'Separaciones',statActive:'Activos en 7 días',colUser:'Usuario',colStatus:'Estado',active:'Activo',blockedS:'Bloqueado',block:'Bloquear',unblock:'Desbloquear',makeAdmin:'Hacer admin',removeAdmin:'Quitar admin',you:'tú',noUsers:'Aún no hay usuarios.',search:'Buscar por nombre o correo',
siteTitle:'Nombre del sitio',defLang:'Idioma por defecto',announce:'Aviso para todos',announceH:'Se muestra arriba de la página. Vacío = oculto.',aiOn:'Separación con IA disponible',dlOn:'Descargas disponibles',reqLogin:'Exigir inicio de sesión para usar la herramienta',allowSignup:'Registro abierto',saveSettings:'Guardar ajustes',
blockedMsg:'El administrador bloqueó tu cuenta.',offByAdmin:'El administrador desactivó esta opción.',gateMsg:'Entra en tu cuenta para usar la herramienta.',libH:'Las canciones se guardan en tu cuenta y se sincronizan entre dispositivos. Sin cuenta, solo en este navegador.'}
};
for(const k in IA)Object.assign(I[k],IA[k]);
const ID={
he:{navTool:'הכלי',navDisc:'גלה שירים',dTitle:'גלה שירים',dSub:'השירים החמים והחדשים בעולם, עם סולם, BPM ואקורדים. בחר שיר ותראה עם אילו שירים הוא מתמקסס בדיוק.',dTrend:'טרנדים עכשיו',dNew:'יציאות חדשות',dPlayed:'הכי מנוגנים אצלנו',dRecent:'נוספו לאחרונה',dAll:'הכול',dAllKeys:'כל הסולמות',dMatchCur:'מתאים לשיר שבכלי',dBpm:'BPM',dLoading:'טוען…',dLoadFail:'לא הצלחנו לטעון את הרשימה. נסה שוב בעוד רגע.',dEmptyCat:'הקטלוג עוד ריק. שירים נכנסים אליו אוטומטית כשמשתמשים מחוברים גולשים בטרנדים.',dNoMatch:'אין שירים שמתאימים לסינון.',dAnalyzing:'מנתח…',dPreview:'השמעת קטע',dMix:'מיקס',dOpen:'פתח בכלי',dPlays:'השמעות',dNoPreview:'אין קטע השמעה לשיר הזה.',
dPreviewNote:'נטען קטע של 30 שניות מהשיר. הסולם והקצב מחושבים מהקטע, והאקורדים הם של הקטע בלבד.',mixTitle:'מתמקסס טוב עם',mixH:'שירים בסולם תואם בגלגל קאמלוט, בקצב של עד ±6% (כולל חצי/כפול קצב).',mixNone:'עוד אין שירים מתאימים. ככל שינותחו יותר שירים, יופיעו כאן יותר המלצות.',relSame:'אותו סולם',relRel:'מז׳ור/מינור מקביל',relUp:'+1 אנרגיה',relDown:'−1 רגוע',findMatches:'מצא שירים מתאימים',dNote:'הסולם וה־BPM מחושבים אוטומטית מקטע של 30 שניות, ולכן ייתכנו טעויות. נתוני הטרנדים וקטעי ההשמעה: Deezer.',dSignIn:'משתמשים מחוברים שומרים את הניתוחים בקטלוג המשותף, כך שכולם נהנים מהם.'},
en:{navTool:'Tool',navDisc:'Discover',dTitle:'Discover songs',dSub:'The hottest and newest songs in the world, with key, BPM and chords. Pick a song to see what it mixes into.',dTrend:'Trending now',dNew:'New releases',dPlayed:'Most played here',dRecent:'Recently added',dAll:'All',dAllKeys:'All keys',dMatchCur:'Matches the song in the tool',dBpm:'BPM',dLoading:'Loading…',dLoadFail:'Could not load the list. Try again in a moment.',dEmptyCat:'The catalog is still empty. Songs join it automatically when signed-in users browse the trends.',dNoMatch:'No songs match the filter.',dAnalyzing:'Analyzing…',dPreview:'Play preview',dMix:'Mix',dOpen:'Open in tool',dPlays:'plays',dNoPreview:'No preview for this song.',
dPreviewNote:'Loaded a 30-second preview. Key and tempo come from the preview, and the chords cover the preview only.',mixTitle:'Mixes well with',mixH:'Songs in a compatible Camelot key, within ±6% tempo (half/double time included).',mixNone:'No matches yet. More recommendations appear as more songs are analyzed.',relSame:'Same key',relRel:'Relative major/minor',relUp:'+1 energy',relDown:'−1 calmer',findMatches:'Find matching songs',dNote:'Key and BPM are computed automatically from a 30-second preview, so mistakes are possible. Chart data and previews: Deezer.',dSignIn:'Signed-in users save analyses to the shared catalog, so everyone benefits.'},
ar:{navTool:'الأداة',navDisc:'اكتشف',dTitle:'اكتشف الأغاني',dSub:'أشهر الأغاني وأحدثها في العالم مع المقام والإيقاع والكوردات. اختر أغنية لترى ما يمتزج معها.',dTrend:'الرائج الآن',dNew:'إصدارات جديدة',dPlayed:'الأكثر تشغيلًا هنا',dRecent:'أُضيفت مؤخرًا',dAll:'الكل',dAllKeys:'كل المقامات',dMatchCur:'متوافق مع أغنية الأداة',dBpm:'BPM',dLoading:'جارٍ التحميل…',dLoadFail:'تعذّر تحميل القائمة. حاول بعد قليل.',dEmptyCat:'الكتالوج فارغ حاليًا. تُضاف الأغاني تلقائيًا عندما يتصفح المستخدمون المسجلون الرائج.',dNoMatch:'لا توجد أغانٍ تطابق التصفية.',dAnalyzing:'تحليل…',dPreview:'تشغيل مقطع',dMix:'مزج',dOpen:'افتح في الأداة',dPlays:'تشغيل',dNoPreview:'لا يوجد مقطع لهذه الأغنية.',
dPreviewNote:'تم تحميل مقطع مدته 30 ثانية. المقام والإيقاع من المقطع، والكوردات للمقطع فقط.',mixTitle:'يمتزج جيدًا مع',mixH:'أغانٍ بمقام متوافق في عجلة كاميلوت وبإيقاع ضمن ±6% (مع نصف/ضعف الإيقاع).',mixNone:'لا توجد توصيات بعد. تظهر المزيد كلما حُلّلت أغانٍ أكثر.',relSame:'المقام نفسه',relRel:'ماجور/مينور مقابل',relUp:'+1 طاقة',relDown:'−1 أهدأ',findMatches:'ابحث عن أغانٍ متوافقة',dNote:'يُحسب المقام والإيقاع تلقائيًا من مقطع 30 ثانية لذا قد تقع أخطاء. بيانات الرائج والمقاطع: Deezer.',dSignIn:'المستخدمون المسجلون يحفظون التحليلات في الكتالوج المشترك ليستفيد الجميع.'},
ru:{navTool:'Инструмент',navDisc:'Обзор',dTitle:'Обзор песен',dSub:'Самые популярные и новые песни мира с тональностью, BPM и аккордами. Выберите песню, чтобы увидеть, с чем она сводится.',dTrend:'В тренде',dNew:'Новинки',dPlayed:'Популярное у нас',dRecent:'Недавно добавлено',dAll:'Все',dAllKeys:'Все тональности',dMatchCur:'Подходит к песне в инструменте',dBpm:'BPM',dLoading:'Загрузка…',dLoadFail:'Не удалось загрузить список. Попробуйте чуть позже.',dEmptyCat:'Каталог пока пуст. Песни попадают в него автоматически, когда вошедшие пользователи смотрят тренды.',dNoMatch:'Нет песен под фильтр.',dAnalyzing:'Анализ…',dPreview:'Прослушать',dMix:'Микс',dOpen:'Открыть',dPlays:'прослушиваний',dNoPreview:'Для этой песни нет превью.',
dPreviewNote:'Загружено 30-секундное превью. Тональность и темп — по превью, аккорды — только для превью.',mixTitle:'Хорошо сводится с',mixH:'Песни в совместимой тональности по кругу Camelot, темп в пределах ±6% (включая половинный/двойной).',mixNone:'Совпадений пока нет. Рекомендаций станет больше по мере анализа песен.',relSame:'Та же тональность',relRel:'Параллельный мажор/минор',relUp:'+1 энергия',relDown:'−1 спокойнее',findMatches:'Найти подходящие песни',dNote:'Тональность и BPM вычисляются автоматически по 30-секундному превью, возможны ошибки. Данные чартов и превью: Deezer.',dSignIn:'Вошедшие пользователи сохраняют анализ в общий каталог, и он доступен всем.'},
es:{navTool:'Herramienta',navDisc:'Descubrir',dTitle:'Descubrir canciones',dSub:'Las canciones más populares y nuevas del mundo, con tonalidad, BPM y acordes. Elige una para ver con cuáles mezcla.',dTrend:'Tendencias',dNew:'Novedades',dPlayed:'Lo más escuchado aquí',dRecent:'Añadidas recientemente',dAll:'Todo',dAllKeys:'Todas las tonalidades',dMatchCur:'Compatibles con la canción cargada',dBpm:'BPM',dLoading:'Cargando…',dLoadFail:'No se pudo cargar la lista. Inténtalo en un momento.',dEmptyCat:'El catálogo aún está vacío. Las canciones se añaden solas cuando usuarios con sesión navegan por las tendencias.',dNoMatch:'Ninguna canción coincide con el filtro.',dAnalyzing:'Analizando…',dPreview:'Escuchar fragmento',dMix:'Mezcla',dOpen:'Abrir',dPlays:'reproducciones',dNoPreview:'Esta canción no tiene fragmento.',
dPreviewNote:'Se cargó un fragmento de 30 segundos. Tonalidad y tempo salen del fragmento, y los acordes cubren solo el fragmento.',mixTitle:'Mezcla bien con',mixH:'Canciones en tonalidad compatible en la rueda Camelot, con tempo dentro de ±6% (incluye mitad/doble).',mixNone:'Aún no hay coincidencias. Aparecerán más a medida que se analicen canciones.',relSame:'Misma tonalidad',relRel:'Relativa mayor/menor',relUp:'+1 energía',relDown:'−1 más calma',findMatches:'Buscar canciones compatibles',dNote:'La tonalidad y el BPM se calculan automáticamente con un fragmento de 30 segundos, así que puede haber errores. Datos de listas y fragmentos: Deezer.',dSignIn:'Los usuarios con sesión guardan los análisis en el catálogo compartido para todos.'}
};
for(const k in ID)Object.assign(I[k],ID[k]);
const IX={
he:{loudness:'עוצמה · LUFS',tagline:'קצב, סולם, אקורדים והפרדת ערוצים ב־AI לכל שיר',loaded:'בכלי עכשיו',bpmL:'קצב',camelot:'קאמלוט',peakL:'שיא',noAudio:'— אין קובץ שמע —',
click:'מטרונום',wave:'תצוגה',wm3:'3 תדרים',wmMono:'מונו',wmStems:'ערוצים',muteT:'השתקה',soloT:'סולו',karaoke:'קריוקי: בלי שירה',
stems:'הפרדת ערוצים',engGpu:'מאיץ גרפי',engCpu:'מעבד (איטי יותר)',aiSep:'הפרדה ב־AI',quickSep:'הפרדה מהירה',
aiFirst:'בשימוש הראשון יורד מודל של כ־80MB ונשמר בדפדפן. במחשב עם מאיץ גרפי, שיר של 4 דקות מופרד בערך בדקה.',
aiDone:'הערוצים מוכנים. הזיזו את הפיידרים, והגל למעלה ישתנה בהתאם.',quickDone:'ההפרדה המהירה מוכנה. האיכות נמוכה יותר מהפרדה ב־AI.',needAudio:'טענו שיר כדי להפריד אותו לערוצים.',
dlDone:'הקובץ ירד ({s} MB).',bpmMin:'מ־',bpmMax:'עד',demoName:'שיר דוגמה · Am F C G · 120',
gIsrael:'ישראלי',gPop:'פופ',gHiphop:'היפ־הופ',gDance:'דאנס',gElectro:'אלקטרוני',gLatin:'לטיני',gRnb:'R&B',gRock:'רוק',dAll:'הכול'},
en:{loudness:'Loudness · LUFS',tagline:'Tempo, key, chords and AI stem separation for any song',loaded:'Now in the tool',bpmL:'BPM',camelot:'Camelot',peakL:'peak',noAudio:'— no audio file —',
click:'Metronome',wave:'View',wm3:'3-band',wmMono:'Mono',wmStems:'Stems',muteT:'Mute',soloT:'Solo',karaoke:'Karaoke: no vocals',
stems:'Stem separation',engGpu:'GPU',engCpu:'CPU (slower)',aiSep:'Separate with AI',quickSep:'Quick separation',
aiFirst:'The first run downloads an 80 MB model and keeps it in your browser. With a GPU, a 4-minute song takes about a minute.',
aiDone:'Stems are ready. Move the faders and the waveform above follows.',quickDone:'Quick separation is ready. Quality is lower than AI separation.',needAudio:'Load a song to split it into stems.',
dlDone:'Downloaded ({s} MB).',bpmMin:'from',bpmMax:'to',demoName:'Demo song · Am F C G · 120',
gIsrael:'Israeli',gPop:'Pop',gHiphop:'Hip-Hop',gDance:'Dance',gElectro:'Electronic',gLatin:'Latin',gRnb:'R&B',gRock:'Rock',dAll:'All'},
ar:{loudness:'الشدة · LUFS',tagline:'الإيقاع والمقام والكوردات وفصل المسارات بالذكاء الاصطناعي لأي أغنية',loaded:'في الأداة الآن',bpmL:'الإيقاع',camelot:'كاميلوت',peakL:'الذروة',noAudio:'— لا يوجد ملف صوتي —',
click:'مترونوم',wave:'العرض',wm3:'3 نطاقات',wmMono:'أحادي',wmStems:'المسارات',muteT:'كتم',soloT:'منفرد',karaoke:'كاريوكي: بلا غناء',
stems:'فصل المسارات',engGpu:'معالج رسومي',engCpu:'معالج مركزي (أبطأ)',aiSep:'فصل بالذكاء الاصطناعي',quickSep:'فصل سريع',
aiFirst:'في أول استخدام يُحمَّل نموذج بحجم 80MB ويُحفظ في المتصفح. مع معالج رسومي تُفصل أغنية من 4 دقائق في نحو دقيقة.',
aiDone:'المسارات جاهزة. حرّك المنزلقات وستتغير الموجة في الأعلى.',quickDone:'الفصل السريع جاهز، وجودته أقل من الفصل بالذكاء الاصطناعي.',needAudio:'حمّل أغنية لفصلها إلى مسارات.',
dlDone:'تم التنزيل ({s} MB).',bpmMin:'من',bpmMax:'إلى',demoName:'أغنية تجريبية · Am F C G · 120',
gIsrael:'إسرائيلي',gPop:'بوب',gHiphop:'هيب هوب',gDance:'دانس',gElectro:'إلكتروني',gLatin:'لاتيني',gRnb:'R&B',gRock:'روك',dAll:'الكل'},
ru:{loudness:'Громкость · LUFS',tagline:'Темп, тональность, аккорды и AI-разделение на стемы для любой песни',loaded:'Сейчас в инструменте',bpmL:'Темп',camelot:'Camelot',peakL:'пик',noAudio:'— нет аудиофайла —',
click:'Метроном',wave:'Вид',wm3:'3 полосы',wmMono:'Моно',wmStems:'Стемы',muteT:'Заглушить',soloT:'Соло',karaoke:'Караоке: без вокала',
stems:'Разделение на стемы',engGpu:'Видеокарта',engCpu:'Процессор (медленнее)',aiSep:'Разделить с AI',quickSep:'Быстрое разделение',
aiFirst:'При первом запуске загружается модель на 80 МБ и сохраняется в браузере. С видеокартой 4-минутная песня делится примерно за минуту.',
aiDone:'Стемы готовы. Двигайте фейдеры — волна выше изменится.',quickDone:'Быстрое разделение готово. Качество ниже, чем у AI.',needAudio:'Загрузите песню, чтобы разделить её на стемы.',
dlDone:'Скачано ({s} МБ).',bpmMin:'от',bpmMax:'до',demoName:'Демо · Am F C G · 120',
gIsrael:'Израиль',gPop:'Поп',gHiphop:'Хип-хоп',gDance:'Дэнс',gElectro:'Электроника',gLatin:'Латина',gRnb:'R&B',gRock:'Рок',dAll:'Все'},
es:{loudness:'Sonoridad · LUFS',tagline:'Tempo, tonalidad, acordes y separación de pistas con IA para cualquier canción',loaded:'Ahora en la herramienta',bpmL:'BPM',camelot:'Camelot',peakL:'pico',noAudio:'— sin archivo de audio —',
click:'Metrónomo',wave:'Vista',wm3:'3 bandas',wmMono:'Mono',wmStems:'Pistas',muteT:'Silenciar',soloT:'Solo',karaoke:'Karaoke: sin voz',
stems:'Separación de pistas',engGpu:'GPU',engCpu:'CPU (más lento)',aiSep:'Separar con IA',quickSep:'Separación rápida',
aiFirst:'La primera vez se descarga un modelo de 80 MB que queda en tu navegador. Con GPU, una canción de 4 minutos tarda cerca de un minuto.',
aiDone:'Las pistas están listas. Mueve los faders y la onda de arriba cambia.',quickDone:'La separación rápida está lista. La calidad es menor que con IA.',needAudio:'Carga una canción para separarla en pistas.',
dlDone:'Descargado ({s} MB).',bpmMin:'de',bpmMax:'a',demoName:'Canción demo · Am F C G · 120',
gIsrael:'Israelí',gPop:'Pop',gHiphop:'Hip-hop',gDance:'Dance',gElectro:'Electrónica',gLatin:'Latina',gRnb:'R&B',gRock:'Rock',dAll:'Todo'}
};
for(const k in IX)Object.assign(I[k],IX[k]);
const IY={
he:{fullPlay:'שיר מלא',fullPlayT:'השמעת השיר המלא בנגן של Deezer',fullBarNote:'מחוברים ל־Deezer בדפדפן הזה? השיר מתנגן במלואו. בלי חשבון מתנגן קטע.',fullTag:'ניתוח מלא',fullTagT:'נותח מהשיר המלא, לא רק מקטע',
dPreviewNote:'נטען קטע של 30 שניות מהשיר. יש לכם את השיר המלא? העלו אותו לניתוח מלא, והקטלוג יתעדכן לכולם.',uploadFullBtn:'העלאת השיר המלא',
matchQ:'זה נראה כמו "{t}" של {a} מהקטלוג. לעדכן את הקטלוג בניתוח של השיר המלא?',matchYes:'עדכון הקטלוג',matchNo:'לא עכשיו',matchDone:'תודה! הקטלוג עודכן בניתוח של השיר המלא.',matchAlready:'לשיר הזה כבר יש ניתוח מלא בקטלוג.',matchFail:'העדכון לא הצליח. נסו שוב מאוחר יותר.',
engGpu:'מאיץ גרפי',engCpu:'מעבד',engGpuT:'ההפרדה תרוץ על כרטיס המסך — מהר.',engCpuT:'אין מאיץ גרפי זמין בדפדפן הזה, ולכן ההפרדה תרוץ על המעבד ותהיה איטית יותר.',themeDark:'מצב כהה',themeLight:'מצב בהיר'},
en:{fullPlay:'Full song',fullPlayT:'Play the full song in the Deezer player',fullBarNote:'Signed in to Deezer in this browser? The whole song plays. Without an account you hear a preview.',fullTag:'Full analysis',fullTagT:'Analyzed from the full song, not just a preview',
dPreviewNote:'Loaded a 30-second preview. Have the full song? Upload it for a full analysis, and the catalog updates for everyone.',uploadFullBtn:'Upload the full song',
matchQ:'This looks like "{t}" by {a} from the catalog. Update the catalog with the full-song analysis?',matchYes:'Update catalog',matchNo:'Not now',matchDone:'Thanks! The catalog now has the full-song analysis.',matchAlready:'This song already has a full analysis in the catalog.',matchFail:'The update failed. Try again later.',
engGpu:'GPU',engCpu:'CPU',engGpuT:'Separation runs on your graphics card, so it is fast.',engCpuT:'No GPU is available in this browser, so separation runs on the processor and is slower.',themeDark:'Dark mode',themeLight:'Light mode'},
ar:{fullPlay:'الأغنية كاملة',fullPlayT:'تشغيل الأغنية كاملة في مشغّل Deezer',fullBarNote:'هل أنت مسجّل في Deezer على هذا المتصفح؟ تُشغَّل الأغنية كاملة. بدون حساب يُشغَّل مقطع.',fullTag:'تحليل كامل',fullTagT:'حُلّلت من الأغنية كاملة وليس من مقطع فقط',
dPreviewNote:'تم تحميل مقطع مدته 30 ثانية. لديك الأغنية كاملة؟ ارفعها لتحليل كامل ويُحدَّث الكتالوج للجميع.',uploadFullBtn:'رفع الأغنية كاملة',
matchQ:'يبدو أن هذه "{t}" لـ{a} من الكتالوج. تحديث الكتالوج بتحليل الأغنية كاملة؟',matchYes:'تحديث الكتالوج',matchNo:'ليس الآن',matchDone:'شكرًا! حُدِّث الكتالوج بتحليل الأغنية كاملة.',matchAlready:'لهذه الأغنية تحليل كامل في الكتالوج بالفعل.',matchFail:'تعذّر التحديث. حاول لاحقًا.',
engGpu:'معالج رسومي',engCpu:'معالج مركزي',engGpuT:'يعمل الفصل على بطاقة الرسوميات فهو سريع.',engCpuT:'لا يتوفر معالج رسومي في هذا المتصفح، لذا يعمل الفصل على المعالج وهو أبطأ.',themeDark:'الوضع الداكن',themeLight:'الوضع الفاتح'},
ru:{fullPlay:'Целиком',fullPlayT:'Слушать песню целиком в плеере Deezer',fullBarNote:'Вошли в Deezer в этом браузере? Песня играет целиком. Без аккаунта — превью.',fullTag:'Полный анализ',fullTagT:'Проанализирована вся песня, а не только превью',
dPreviewNote:'Загружено 30-секундное превью. Есть песня целиком? Загрузите её для полного анализа — каталог обновится для всех.',uploadFullBtn:'Загрузить песню целиком',
matchQ:'Похоже, это «{t}» ({a}) из каталога. Обновить каталог анализом всей песни?',matchYes:'Обновить каталог',matchNo:'Не сейчас',matchDone:'Спасибо! В каталоге теперь анализ всей песни.',matchAlready:'У этой песни уже есть полный анализ в каталоге.',matchFail:'Не удалось обновить. Попробуйте позже.',
engGpu:'Видеокарта',engCpu:'Процессор',engGpuT:'Разделение работает на видеокарте — быстро.',engCpuT:'В этом браузере нет доступа к видеокарте, разделение пойдёт на процессоре и будет медленнее.',themeDark:'Тёмная тема',themeLight:'Светлая тема'},
es:{fullPlay:'Completa',fullPlayT:'Escuchar la canción completa en el reproductor de Deezer',fullBarNote:'¿Tienes sesión de Deezer en este navegador? Suena la canción completa. Sin cuenta, un fragmento.',fullTag:'Análisis completo',fullTagT:'Analizada con la canción completa, no solo un fragmento',
dPreviewNote:'Se cargó un fragmento de 30 segundos. ¿Tienes la canción completa? Súbela para un análisis completo y el catálogo se actualiza para todos.',uploadFullBtn:'Subir la canción completa',
matchQ:'Parece "{t}" de {a} del catálogo. ¿Actualizar el catálogo con el análisis de la canción completa?',matchYes:'Actualizar catálogo',matchNo:'Ahora no',matchDone:'¡Gracias! El catálogo tiene ahora el análisis completo.',matchAlready:'Esta canción ya tiene análisis completo en el catálogo.',matchFail:'No se pudo actualizar. Inténtalo más tarde.',
engGpu:'GPU',engCpu:'CPU',engGpuT:'La separación usa la tarjeta gráfica, así que es rápida.',engCpuT:'Este navegador no tiene GPU disponible, así que la separación usa el procesador y es más lenta.',themeDark:'Modo oscuro',themeLight:'Modo claro'}
};
for(const k in IY)Object.assign(I[k],IY[k]);
const IZ={
he:{stemsTitle:'ערוצים',aiSep:'הפרדת ערוצים',aiErr:'לא הצלחנו להפעיל את הפרדת הערוצים במכשיר הזה ({m}). נסו דפדפן Chrome או Edge עדכני.',wmRgb:'צבעי תדרים (RGB)',wm3:'שלושה תדרים',wmMono:'מונו',wmStems:'לפי ערוצים',
cloudTag:'הקובץ שמור בחשבון',savingCloud:'שומר בחשבון…',savedCloud:'שמור בחשבון',saveCloudFail:'השמירה בחשבון נכשלה',bCloud:'טוען את השיר מהחשבון…',
genre:'סגנון',uploads:'העלאות',downloadsL:'הורדות',details:'פרטים',userSongs:'שירים שהעלה',userDownloads:'הורדות',allSongs:'כל השירים',dlAll:'הורדת כל השירים (ZIP)',dlUserAll:'הורדת כל השירים שלו (ZIP)',dlFile:'הורדה',noFile:'אין קובץ',size:'גודל',date:'תאריך',files:'קבצים',back:'→ חזרה למשתמשים',noSongs:'אין שירים.',noDownloads:'אין הורדות.',zipping:'אורז {n} מתוך {t}…',searchSongs:'חיפוש שיר או סגנון',songCol:'שיר',joinedSong:'הועלה',adminOpened:'השיר של המשתמש נפתח בכלי. השינויים לא נשמרים אצלו.',
libH:'השירים שלך: קצב, סולם, אקורדים ונקודות קיו. כשמחוברים, גם הקובץ עצמו נשמר בחשבון ונפתח מכל מכשיר.',fromLib:'השיר נשמר לפני ששמירת קבצים הופעלה, ולכן אין לו קובץ בחשבון. העלו אותו שוב כדי לנגן ולשמור.',
aboutT:'הניתוח רץ בדפדפן. כשמחוברים, השירים שמעלים נשמרים בחשבון שלכם כדי שתוכלו לפתוח אותם שוב, ומנהלי האתר יכולים לגשת אליהם. הזיהוי אוטומטי, ואפשר לתקן גריד ואקורדים ידנית.'},
en:{stemsTitle:'Stems',aiSep:'Separate stems',aiErr:'Stem separation could not start on this device ({m}). Try an up-to-date Chrome or Edge.',wmRgb:'Frequency colours (RGB)',wm3:'Three bands',wmMono:'Mono',wmStems:'By stem',
cloudTag:'File saved in your account',savingCloud:'Saving to your account…',savedCloud:'Saved in your account',saveCloudFail:'Saving to your account failed',bCloud:'Loading the song from your account…',
genre:'Genre',uploads:'Uploads',downloadsL:'Downloads',details:'Details',userSongs:'Uploaded songs',userDownloads:'Downloads',allSongs:'All songs',dlAll:'Download all songs (ZIP)',dlUserAll:'Download all their songs (ZIP)',dlFile:'Download',noFile:'No file',size:'Size',date:'Date',files:'Files',back:'← Back to users',noSongs:'No songs.',noDownloads:'No downloads.',zipping:'Packing {n} of {t}…',searchSongs:'Search song or genre',songCol:'Song',joinedSong:'Uploaded',adminOpened:'The user\'s song is open in the tool. Changes are not saved to their account.',
libH:'Your songs: tempo, key, chords and cue points. When signed in, the audio file is saved too and opens on any device.',fromLib:'This song was saved before file storage was on, so there is no file in your account. Upload it again to play and save it.',
aboutT:'Analysis runs in your browser. When you are signed in, the songs you upload are saved to your account so you can open them again, and site admins can access them. Detection is automatic; you can fix the grid and chords by hand.'},
ar:{stemsTitle:'المسارات',aiSep:'فصل المسارات',aiErr:'تعذّر تشغيل فصل المسارات على هذا الجهاز ({m}). جرّب Chrome أو Edge محدّثًا.',wmRgb:'ألوان الترددات (RGB)',wm3:'ثلاثة نطاقات',wmMono:'أحادي',wmStems:'حسب المسار',
cloudTag:'الملف محفوظ في حسابك',savingCloud:'جارٍ الحفظ في الحساب…',savedCloud:'محفوظ في الحساب',saveCloudFail:'فشل الحفظ في الحساب',bCloud:'تحميل الأغنية من الحساب…',
genre:'النوع',uploads:'الرفع',downloadsL:'التنزيلات',details:'التفاصيل',userSongs:'الأغاني المرفوعة',userDownloads:'التنزيلات',allSongs:'كل الأغاني',dlAll:'تنزيل كل الأغاني (ZIP)',dlUserAll:'تنزيل كل أغانيه (ZIP)',dlFile:'تنزيل',noFile:'لا ملف',size:'الحجم',date:'التاريخ',files:'الملفات',back:'→ العودة إلى المستخدمين',noSongs:'لا توجد أغانٍ.',noDownloads:'لا توجد تنزيلات.',zipping:'تجميع {n} من {t}…',searchSongs:'بحث عن أغنية أو نوع',songCol:'الأغنية',joinedSong:'تاريخ الرفع',adminOpened:'فُتحت أغنية المستخدم في الأداة. لا تُحفظ التغييرات في حسابه.',
libH:'أغانيك: الإيقاع والمقام والكوردات ونقاط التعليم. عند تسجيل الدخول يُحفظ الملف الصوتي أيضًا ويُفتح من أي جهاز.',fromLib:'حُفظت هذه الأغنية قبل تفعيل حفظ الملفات، لذا لا يوجد ملف في حسابك. ارفعها مجددًا لتشغيلها وحفظها.',
aboutT:'يجري التحليل في متصفحك. عند تسجيل الدخول تُحفظ الأغاني التي ترفعها في حسابك لتفتحها مجددًا، ويمكن لمديري الموقع الوصول إليها. الاكتشاف تلقائي ويمكن تصحيح الشبكة والكوردات يدويًا.'},
ru:{stemsTitle:'Стемы',aiSep:'Разделить на стемы',aiErr:'Не удалось запустить разделение на этом устройстве ({m}). Попробуйте свежий Chrome или Edge.',wmRgb:'Цвета частот (RGB)',wm3:'Три полосы',wmMono:'Моно',wmStems:'По стемам',
cloudTag:'Файл сохранён в аккаунте',savingCloud:'Сохраняю в аккаунт…',savedCloud:'Сохранено в аккаунте',saveCloudFail:'Не удалось сохранить в аккаунт',bCloud:'Загружаю песню из аккаунта…',
genre:'Жанр',uploads:'Загрузки',downloadsL:'Скачивания',details:'Подробнее',userSongs:'Загруженные песни',userDownloads:'Скачивания',allSongs:'Все песни',dlAll:'Скачать все песни (ZIP)',dlUserAll:'Скачать все его песни (ZIP)',dlFile:'Скачать',noFile:'Нет файла',size:'Размер',date:'Дата',files:'Файлы',back:'← К пользователям',noSongs:'Песен нет.',noDownloads:'Скачиваний нет.',zipping:'Упаковка {n} из {t}…',searchSongs:'Поиск песни или жанра',songCol:'Песня',joinedSong:'Загружена',adminOpened:'Песня пользователя открыта в инструменте. Изменения в его аккаунт не сохраняются.',
libH:'Ваши песни: темп, тональность, аккорды и метки. Если вы вошли, сохраняется и сам аудиофайл — он откроется на любом устройстве.',fromLib:'Песня сохранена до включения хранения файлов, поэтому файла в аккаунте нет. Загрузите её снова, чтобы слушать и сохранить.',
aboutT:'Анализ идёт в браузере. Если вы вошли, загруженные песни сохраняются в вашем аккаунте, чтобы открыть их снова; администраторы сайта имеют к ним доступ. Распознавание автоматическое, сетку и аккорды можно поправить вручную.'},
es:{stemsTitle:'Pistas',aiSep:'Separar pistas',aiErr:'No se pudo iniciar la separación en este equipo ({m}). Prueba con Chrome o Edge actualizados.',wmRgb:'Colores por frecuencia (RGB)',wm3:'Tres bandas',wmMono:'Mono',wmStems:'Por pista',
cloudTag:'Archivo guardado en tu cuenta',savingCloud:'Guardando en tu cuenta…',savedCloud:'Guardado en tu cuenta',saveCloudFail:'No se pudo guardar en tu cuenta',bCloud:'Cargando la canción desde tu cuenta…',
genre:'Género',uploads:'Subidas',downloadsL:'Descargas',details:'Detalles',userSongs:'Canciones subidas',userDownloads:'Descargas',allSongs:'Todas las canciones',dlAll:'Descargar todas (ZIP)',dlUserAll:'Descargar todas sus canciones (ZIP)',dlFile:'Descargar',noFile:'Sin archivo',size:'Tamaño',date:'Fecha',files:'Archivos',back:'← Volver a usuarios',noSongs:'No hay canciones.',noDownloads:'No hay descargas.',zipping:'Empaquetando {n} de {t}…',searchSongs:'Buscar canción o género',songCol:'Canción',joinedSong:'Subida',adminOpened:'La canción del usuario está abierta en la herramienta. Los cambios no se guardan en su cuenta.',
libH:'Tus canciones: tempo, tonalidad, acordes y cues. Con sesión iniciada también se guarda el archivo de audio y se abre en cualquier equipo.',fromLib:'Esta canción se guardó antes de activar el almacenamiento de archivos, así que no hay archivo en tu cuenta. Súbela de nuevo para escucharla y guardarla.',
aboutT:'El análisis ocurre en tu navegador. Con sesión iniciada, las canciones que subes se guardan en tu cuenta para abrirlas de nuevo, y los administradores del sitio pueden acceder a ellas. La detección es automática; puedes corregir la rejilla y los acordes a mano.'}
};
for(const k in IZ)Object.assign(I[k],IZ[k]);
// tempo & key change
const IT={
he:{tempoDown:'האטה (Shift: 0.1)',tempoUp:'האצה (Shift: 0.1)',bpmEdit:'אפשר להקליד BPM חדש, השיר יתנגן בקצב הזה',keyDown:'הורדת הסולם בחצי טון',keyUp:'העלאת הסולם בחצי טון',origL:'מקור',resetL:'חזרה למקור',
  fxFail:'לא הצלחנו לטעון את מנוע שינוי הקצב והסולם בדפדפן הזה.',fxRender:'מעבד קצב וסולם לקובץ {n} מתוך {m}…',transposeH:'משנה את הסולם של השיר, גם בשמע וגם באקורדים'},
en:{tempoDown:'Slower (Shift: 0.1)',tempoUp:'Faster (Shift: 0.1)',bpmEdit:'Type a new BPM and the song plays at that tempo',keyDown:'Key down a semitone',keyUp:'Key up a semitone',origL:'Original',resetL:'Back to original',
  fxFail:'Couldn\'t load the tempo and key engine in this browser.',fxRender:'Rendering tempo and key, file {n} of {m}…',transposeH:'Changes the song\'s key, both the audio and the chords'},
ar:{tempoDown:'أبطأ (Shift: 0.1)',tempoUp:'أسرع (Shift: 0.1)',bpmEdit:'اكتب BPM جديدًا وستُعزف الأغنية بهذا الإيقاع',keyDown:'خفض المقام نصف درجة',keyUp:'رفع المقام نصف درجة',origL:'الأصل',resetL:'العودة إلى الأصل',
  fxFail:'تعذّر تحميل محرك تغيير الإيقاع والمقام في هذا المتصفح.',fxRender:'معالجة الإيقاع والمقام، الملف {n} من {m}…',transposeH:'يغيّر مقام الأغنية، في الصوت والكوردات معًا'},
ru:{tempoDown:'Медленнее (Shift: 0.1)',tempoUp:'Быстрее (Shift: 0.1)',bpmEdit:'Введите новый BPM, и трек зазвучит в этом темпе',keyDown:'Тональность на полутон ниже',keyUp:'Тональность на полутон выше',origL:'Оригинал',resetL:'Вернуть оригинал',
  fxFail:'Не удалось загрузить движок темпа и тональности в этом браузере.',fxRender:'Обработка темпа и тональности, файл {n} из {m}…',transposeH:'Меняет тональность трека: и звук, и аккорды'},
es:{tempoDown:'Más lento (Shift: 0.1)',tempoUp:'Más rápido (Shift: 0.1)',bpmEdit:'Escribe un BPM nuevo y la canción sonará a ese tempo',keyDown:'Bajar la tonalidad un semitono',keyUp:'Subir la tonalidad un semitono',origL:'Original',resetL:'Volver al original',
  fxFail:'No se pudo cargar el motor de tempo y tonalidad en este navegador.',fxRender:'Procesando tempo y tonalidad, archivo {n} de {m}…',transposeH:'Cambia la tonalidad de la canción, tanto el audio como los acordes'}};
for(const k in IT)Object.assign(I[k],IT[k]);
// points, plans, pages, MP3
const IP={
he:{navPricing:'מחירים',navAbout:'אודות',creditsL:'נקודות',creditsBal:'יתרת נקודות',seePlans:'מסלולים ומחירים',creditsHist:'היסטוריית נקודות',creditsTitle:'נקודות ומסלול',creditsCol:'נקודות',
  grantNote:'הערה (לא חובה)',grantBtn:'הוספה / הורדה של נקודות',setPlanBtn:'הפעלת מסלול',grantDone:'עודכן. יתרה: {b}',planDone:'המסלול עודכן.',months:'חודשים',
  billingTitle:'נקודות ותשלומים',billingH:'כמה עולה כל פעולה, מתנת ההרשמה והמסלולים. קישור תשלום = קישור הקנייה של המסלול ב-Lemon Squeezy, ומזהה וריאנט = המספר שלו שם. אחרי תשלום המסלול מופעל והנקודות נכנסות אוטומטית (ההוראות ב-PAYMENTS.md). אפשר עדיין להפעיל מסלול ידנית מהפרטים של המשתמש.',
  billingOn:'שיטת הנקודות פעילה (כבוי = הכול בחינם)',billSignup:'מתנת הרשמה (נקודות)',billContact:'יצירת קשר לתשלום (מייל או קישור)',billSep:'עלות הפרדת ערוצים',billStems:'עלות הורדת סטמים',
  planPrice:'מחיר לחודש',planPoints:'נקודות לחודש',planLink:'קישור תשלום',planBest:'מומלץ',plan_free:'חינמי',plan_basic:'בסיסי',plan_pro:'מקצועי',plan_studio:'סטודיו',
  needSignIn:'כדי להשתמש בזה צריך להתחבר. נרשמים בחינם ומקבלים {n} נקודות מתנה.',noPoints:'אין מספיק נקודות: הפעולה עולה {n} ויש לך {b}.',charged:'ירדו {n} נקודות. נשארו {b}.',
  dlCostNote:'הורדת הסטמים עולה {n} נקודות (פעם אחת לשיר)',chargeFail:'לא הצלחנו לחייב נקודות. נסה שוב.',subNoLink:'כדי להצטרף למסלול כתבו לנו: {c}',subSoon:'ההצטרפות למסלולים תיפתח בקרוב.',
  planUntil:'בתוקף עד {d}',planFreeL:'מסלול חינמי',lr_signup:'מתנת הרשמה',lr_spend:'שימוש',lr_grant:'עדכון ידני',lr_refill:'חידוש חודשי',lr_plan:'הפעלת מסלול',lr_refund:'החזר',
  fmtT:'פורמט הקבצים',encoding:'מקודד MP3 ({p}%)…',mp3Fail:'קידוד MP3 נכשל, נסה WAV.',noLedger:'אין תנועות עדיין.',lk_sep:'הפרדת ערוצים',lk_stems:'הורדת סטמים',refunded:'ההפרדה לא הושלמה, הנקודות הוחזרו.'},
en:{navPricing:'Pricing',navAbout:'About',creditsL:'points',creditsBal:'Points balance',seePlans:'Plans & pricing',creditsHist:'Points history',creditsTitle:'Points & plan',creditsCol:'Points',
  grantNote:'Note (optional)',grantBtn:'Add / remove points',setPlanBtn:'Activate plan',grantDone:'Updated. Balance: {b}',planDone:'Plan updated.',months:'months',
  billingTitle:'Points & payments',billingH:'What each action costs, the signup gift and the plans. Payment link = the plan\'s Lemon Squeezy checkout link; variant ID = its variant number there. After payment the plan turns on and the points arrive automatically (setup steps in PAYMENTS.md). You can still activate a plan by hand from the user\'s details.',
  billingOn:'Points system on (off = everything is free)',billSignup:'Signup gift (points)',billContact:'Billing contact (email or link)',billSep:'Stem separation cost',billStems:'Stems download cost',
  planPrice:'Price per month',planPoints:'Points per month',planLink:'Payment link',planBest:'Recommended',plan_free:'Free',plan_basic:'Basic',plan_pro:'Pro',plan_studio:'Studio',
  needSignIn:'Sign in to use this. Signing up is free and you get {n} points as a gift.',noPoints:'Not enough points: this costs {n} and you have {b}.',charged:'{n} points used. {b} left.',
  dlCostNote:'Downloading the stems costs {n} points (once per song)',chargeFail:'Couldn\'t charge points. Try again.',subNoLink:'To join a plan, write to us: {c}',subSoon:'Plans open for sign-up soon.',
  planUntil:'Valid until {d}',planFreeL:'Free plan',lr_signup:'Signup gift',lr_spend:'Used',lr_grant:'Manual update',lr_refill:'Monthly refill',lr_plan:'Plan activated',lr_refund:'Refund',
  fmtT:'File format',encoding:'Encoding MP3 ({p}%)…',mp3Fail:'MP3 encoding failed, try WAV.',noLedger:'No activity yet.',lk_sep:'Stem separation',lk_stems:'Stems download',refunded:'The separation didn\'t finish, your points were returned.'},
ar:{navPricing:'الأسعار',navAbout:'حول',creditsL:'نقاط',creditsBal:'رصيد النقاط',seePlans:'الخطط والأسعار',creditsHist:'سجل النقاط',creditsTitle:'النقاط والخطة',creditsCol:'النقاط',
  grantNote:'ملاحظة (اختياري)',grantBtn:'إضافة / خصم نقاط',setPlanBtn:'تفعيل الخطة',grantDone:'تم التحديث. الرصيد: {b}',planDone:'تم تحديث الخطة.',months:'أشهر',
  billingTitle:'النقاط والمدفوعات',billingH:'تكلفة كل عملية، هدية التسجيل والخطط. رابط الدفع = رابط شراء الخطة في Lemon Squeezy، ومعرّف النسخة = رقمها هناك. بعد الدفع تُفعَّل الخطة وتصل النقاط تلقائيًا (خطوات الإعداد في PAYMENTS.md). لا يزال بإمكانك تفعيل خطة يدويًا من تفاصيل المستخدم.',
  billingOn:'نظام النقاط مفعّل (إيقاف = كل شيء مجاني)',billSignup:'هدية التسجيل (نقاط)',billContact:'جهة اتصال للدفع (بريد أو رابط)',billSep:'تكلفة فصل المسارات',billStems:'تكلفة تنزيل المسارات',
  planPrice:'السعر الشهري',planPoints:'نقاط شهريًا',planLink:'رابط الدفع',planBest:'موصى بها',plan_free:'مجانية',plan_basic:'أساسية',plan_pro:'احترافية',plan_studio:'استوديو',
  needSignIn:'سجّل الدخول لاستخدام هذه الميزة. التسجيل مجاني وتحصل على {n} نقطة هدية.',noPoints:'النقاط غير كافية: العملية تكلف {n} ولديك {b}.',charged:'تم خصم {n} نقاط. المتبقي {b}.',
  dlCostNote:'تنزيل المسارات يكلف {n} نقاط (مرة واحدة لكل أغنية)',chargeFail:'تعذّر خصم النقاط. حاول مجددًا.',subNoLink:'للاشتراك في خطة راسلنا: {c}',subSoon:'سيُفتح الاشتراك في الخطط قريبًا.',
  planUntil:'سارية حتى {d}',planFreeL:'الخطة المجانية',lr_signup:'هدية التسجيل',lr_spend:'استخدام',lr_grant:'تحديث يدوي',lr_refill:'تجديد شهري',lr_plan:'تفعيل خطة',lr_refund:'استرداد',
  fmtT:'صيغة الملفات',encoding:'ترميز MP3 ({p}%)…',mp3Fail:'فشل ترميز MP3، جرّب WAV.',noLedger:'لا توجد حركات بعد.',lk_sep:'فصل المسارات',lk_stems:'تنزيل المسارات',refunded:'لم يكتمل الفصل، أُعيدت نقاطك.'},
ru:{navPricing:'Тарифы',navAbout:'О проекте',creditsL:'баллов',creditsBal:'Баланс баллов',seePlans:'Тарифы и цены',creditsHist:'История баллов',creditsTitle:'Баллы и тариф',creditsCol:'Баллы',
  grantNote:'Заметка (необязательно)',grantBtn:'Начислить / списать баллы',setPlanBtn:'Включить тариф',grantDone:'Готово. Баланс: {b}',planDone:'Тариф обновлён.',months:'мес.',
  billingTitle:'Баллы и оплата',billingH:'Стоимость действий, подарок при регистрации и тарифы. Ссылка на оплату = ссылка покупки тарифа в Lemon Squeezy, ID варианта = его номер там. После оплаты тариф включается и баллы приходят автоматически (настройка описана в PAYMENTS.md). Тариф по-прежнему можно включить вручную в карточке пользователя.',
  billingOn:'Система баллов включена (выкл. = всё бесплатно)',billSignup:'Подарок при регистрации (баллы)',billContact:'Контакт по оплате (email или ссылка)',billSep:'Цена разделения на дорожки',billStems:'Цена скачивания дорожек',
  planPrice:'Цена в месяц',planPoints:'Баллов в месяц',planLink:'Ссылка на оплату',planBest:'Рекомендуем',plan_free:'Бесплатный',plan_basic:'Базовый',plan_pro:'Про',plan_studio:'Студия',
  needSignIn:'Войдите, чтобы пользоваться этим. Регистрация бесплатна, и вы получите {n} баллов в подарок.',noPoints:'Недостаточно баллов: действие стоит {n}, у вас {b}.',charged:'Списано {n} баллов. Осталось {b}.',
  dlCostNote:'Скачивание дорожек стоит {n} баллов (один раз на песню)',chargeFail:'Не удалось списать баллы. Попробуйте ещё раз.',subNoLink:'Чтобы подключить тариф, напишите нам: {c}',subSoon:'Подключение тарифов скоро откроется.',
  planUntil:'Действует до {d}',planFreeL:'Бесплатный тариф',lr_signup:'Подарок за регистрацию',lr_spend:'Использовано',lr_grant:'Ручное изменение',lr_refill:'Ежемесячное пополнение',lr_plan:'Тариф включён',lr_refund:'Возврат',
  fmtT:'Формат файлов',encoding:'Кодирование MP3 ({p}%)…',mp3Fail:'Не удалось закодировать MP3, попробуйте WAV.',noLedger:'Пока нет операций.',lk_sep:'Разделение на стемы',lk_stems:'Скачивание стемов',refunded:'Разделение не завершилось, баллы возвращены.'},
es:{navPricing:'Precios',navAbout:'Acerca de',creditsL:'puntos',creditsBal:'Saldo de puntos',seePlans:'Planes y precios',creditsHist:'Historial de puntos',creditsTitle:'Puntos y plan',creditsCol:'Puntos',
  grantNote:'Nota (opcional)',grantBtn:'Sumar / restar puntos',setPlanBtn:'Activar plan',grantDone:'Actualizado. Saldo: {b}',planDone:'Plan actualizado.',months:'meses',
  billingTitle:'Puntos y pagos',billingH:'Lo que cuesta cada acción, el regalo de registro y los planes. Enlace de pago = el enlace de compra del plan en Lemon Squeezy; ID de variante = su número allí. Tras el pago, el plan se activa y los puntos llegan solos (pasos en PAYMENTS.md). Aún puedes activar un plan a mano desde los detalles del usuario.',
  billingOn:'Sistema de puntos activo (apagado = todo gratis)',billSignup:'Regalo de registro (puntos)',billContact:'Contacto de pagos (email o enlace)',billSep:'Coste de separar pistas',billStems:'Coste de descargar pistas',
  planPrice:'Precio al mes',planPoints:'Puntos al mes',planLink:'Enlace de pago',planBest:'Recomendado',plan_free:'Gratis',plan_basic:'Básico',plan_pro:'Pro',plan_studio:'Estudio',
  needSignIn:'Inicia sesión para usar esto. Registrarte es gratis y recibes {n} puntos de regalo.',noPoints:'No tienes puntos suficientes: esto cuesta {n} y tienes {b}.',charged:'Se usaron {n} puntos. Quedan {b}.',
  dlCostNote:'Descargar las pistas cuesta {n} puntos (una vez por canción)',chargeFail:'No se pudieron cobrar los puntos. Inténtalo de nuevo.',subNoLink:'Para unirte a un plan, escríbenos: {c}',subSoon:'Los planes se abrirán pronto.',
  planUntil:'Válido hasta {d}',planFreeL:'Plan gratis',lr_signup:'Regalo de registro',lr_spend:'Uso',lr_grant:'Ajuste manual',lr_refill:'Recarga mensual',lr_plan:'Plan activado',lr_refund:'Reembolso',
  fmtT:'Formato de archivo',encoding:'Codificando MP3 ({p}%)…',mp3Fail:'Falló la codificación MP3, prueba WAV.',noLedger:'Aún no hay movimientos.',lk_sep:'Separación de pistas',lk_stems:'Descarga de pistas',refunded:'La separación no terminó, te devolvimos los puntos.'}};
for(const k in IP)Object.assign(I[k],IP[k]);
// automatic subscription payments (Lemon Squeezy)
const IPAY={
he:{payWait:'התשלום התקבל, מפעילים את המסלול…',payDone:'המסלול {p} פעיל! יש לך עכשיו {n} נקודות.',paySlow:'התשלום עדיין מאושר אצל חברת הסליקה. זה יכול לקחת דקה, רעננו את הדף בעוד רגע. אם הנקודות לא מגיעות, כתבו לנו.',payContact:'יצירת קשר',
  payManage:'ניהול המנוי',payRenews:'מתחדש אוטומטית ב־{d}',payTrial:'תקופת ניסיון עד {d}',payCancelled:'המנוי בוטל, בתוקף עד {d}',payPastDue:'החיוב האחרון נכשל: עדכנו אמצעי תשלום בניהול המנוי',payPaused:'המנוי מושהה',payEnded:'המנוי הסתיים',
  payHaveSub:'כבר יש לך מנוי. החלפת מסלול או ביטול נעשים בעמוד ניהול המנוי.',planVariant:'מזהה וריאנט (Lemon Squeezy)',payEvents:'תשלומים אחרונים',payNone:'עדיין אין תשלומים.',payTestL:'בדיקה',payEvCol:'אירוע',payResCol:'תוצאה',payUserCol:'משתמש',
  lr_payment:'תשלום',payRefundL:'החזר כספי',payUpgradeL:'שדרוג'},
en:{payWait:'Payment received, activating your plan…',payDone:'Your {p} plan is active! You now have {n} points.',paySlow:'Your payment is still being confirmed. This can take a minute, so refresh the page shortly. If the points don\'t arrive, contact us.',payContact:'Contact us',
  payManage:'Manage subscription',payRenews:'Renews automatically on {d}',payTrial:'Trial until {d}',payCancelled:'Cancelled, active until {d}',payPastDue:'The last payment failed: update your payment method in Manage subscription',payPaused:'Subscription paused',payEnded:'Subscription ended',
  payHaveSub:'You already have a subscription. Change plan or cancel from the subscription page.',planVariant:'Variant ID (Lemon Squeezy)',payEvents:'Recent payments',payNone:'No payments yet.',payTestL:'test',payEvCol:'Event',payResCol:'Result',payUserCol:'User',
  lr_payment:'Payment',payRefundL:'Money refunded',payUpgradeL:'upgrade'},
ar:{payWait:'تم استلام الدفع، جارٍ تفعيل خطتك…',payDone:'خطة {p} مفعّلة! لديك الآن {n} نقطة.',paySlow:'ما زال الدفع قيد التأكيد. قد يستغرق ذلك دقيقة، حدّث الصفحة بعد قليل. إن لم تصل النقاط، راسلنا.',payContact:'تواصل معنا',
  payManage:'إدارة الاشتراك',payRenews:'يتجدد تلقائيًا في {d}',payTrial:'فترة تجريبية حتى {d}',payCancelled:'أُلغي الاشتراك، ساري حتى {d}',payPastDue:'فشلت الدفعة الأخيرة: حدّث وسيلة الدفع من إدارة الاشتراك',payPaused:'الاشتراك متوقف مؤقتًا',payEnded:'انتهى الاشتراك',
  payHaveSub:'لديك اشتراك بالفعل. غيّر الخطة أو ألغِها من صفحة إدارة الاشتراك.',planVariant:'معرّف النسخة (Lemon Squeezy)',payEvents:'آخر المدفوعات',payNone:'لا توجد مدفوعات بعد.',payTestL:'تجربة',payEvCol:'الحدث',payResCol:'النتيجة',payUserCol:'المستخدم',
  lr_payment:'دفعة',payRefundL:'استرداد المبلغ',payUpgradeL:'ترقية'},
ru:{payWait:'Оплата получена, включаем тариф…',payDone:'Тариф «{p}» включён! Теперь у вас {n} баллов.',paySlow:'Оплата ещё подтверждается. Это может занять минуту, обновите страницу чуть позже. Если баллы не придут, напишите нам.',payContact:'Написать нам',
  payManage:'Управление подпиской',payRenews:'Продлится автоматически {d}',payTrial:'Пробный период до {d}',payCancelled:'Подписка отменена, действует до {d}',payPastDue:'Последний платёж не прошёл: обновите способ оплаты в управлении подпиской',payPaused:'Подписка приостановлена',payEnded:'Подписка закончилась',
  payHaveSub:'У вас уже есть подписка. Сменить тариф или отменить её можно на странице управления подпиской.',planVariant:'ID варианта (Lemon Squeezy)',payEvents:'Последние платежи',payNone:'Платежей пока нет.',payTestL:'тест',payEvCol:'Событие',payResCol:'Результат',payUserCol:'Пользователь',
  lr_payment:'Оплата',payRefundL:'Возврат денег',payUpgradeL:'повышение'},
es:{payWait:'Pago recibido, activando tu plan…',payDone:'¡Tu plan {p} está activo! Ahora tienes {n} puntos.',paySlow:'Tu pago aún se está confirmando. Puede tardar un minuto; recarga la página en un momento. Si los puntos no llegan, escríbenos.',payContact:'Contáctanos',
  payManage:'Gestionar suscripción',payRenews:'Se renueva automáticamente el {d}',payTrial:'Prueba hasta el {d}',payCancelled:'Cancelada, activa hasta el {d}',payPastDue:'El último pago falló: actualiza tu método de pago en Gestionar suscripción',payPaused:'Suscripción en pausa',payEnded:'La suscripción terminó',
  payHaveSub:'Ya tienes una suscripción. Cambia de plan o cancela desde la página de la suscripción.',planVariant:'ID de variante (Lemon Squeezy)',payEvents:'Pagos recientes',payNone:'Aún no hay pagos.',payTestL:'prueba',payEvCol:'Evento',payResCol:'Resultado',payUserCol:'Usuario',
  lr_payment:'Pago',payRefundL:'Dinero reembolsado',payUpgradeL:'mejora'}};
for(const k in IPAY)Object.assign(I[k],IPAY[k]);




let LANG='he';let LANG_CHOSEN=false;
try{const s=localStorage.getItem('chordroom.lang');if(s&&I[s]){LANG=s;LANG_CHOSEN=true}}catch(e){}
function t(k,v){let s=(I[LANG][k]??I.en[k]??k);if(v)for(const x in v)s=s.replace('{'+x+'}',v[x]);return s}
function applyLang(){
  const rtl=LANG==='he'||LANG==='ar';
  document.documentElement.lang=LANG;document.documentElement.dir=rtl?'rtl':'ltr';
  document.querySelectorAll('[data-i]').forEach(el=>{el.textContent=t(el.dataset.i)});
  document.querySelectorAll('[data-ip]').forEach(el=>{el.placeholder=t(el.dataset.ip)});
  document.querySelectorAll('[data-it]').forEach(el=>{el.title=t(el.dataset.it);el.setAttribute('aria-label',el.title)});
  $('#lang').value=LANG;
  $('#play').setAttribute('aria-label',t('kPlay'));
  const rk=$('#rack');if(rk)rk.dir=rtl?'rtl':'ltr';
  $('#keys').innerHTML='';
  [['Space','kPlay'],['← →','kBar'],['1 – 8','kCue'],['L','kLoop'],['M','kClick'],['+ −','kZoom']].forEach(([k,d])=>{const a=document.createElement('kbd');a.textContent=k;const b=document.createElement('span');b.textContent=t(d);$('#keys').append(a,b)});
}

/* ---------- constants & state ---------- */
const SHARP=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
const FLAT=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const ASCII_S=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],ASCII_F=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const FLAT_MAJ=new Set([5,10,3,8,1,6]);
const CAM_MAJ=[8,3,10,5,12,7,2,9,4,11,6,1];
const SHAPES=[
 ['x32010','x46664','xx0232','x68886','022100','133211','244322','320003','466544','x02220','x13331','x24442'],
 ['x35543','x46654','xx0231','x68876','022000','133111','244222','355333','466444','x02210','x13321','x24432']];
const HC_COL=['#2BD46A','#3D8BFF','#FFB020','#FF4D4D','#B66DFF','#22D3D3','#FF6FB5','#E8E24A'];
const STEMS=[{id:'vocals',file:'Vocals',color:'#FF4FA3'},{id:'drums',file:'Drums',color:'#FFC53D'},{id:'bass',file:'Bass',color:'#3D8BFF'},{id:'other',file:'Other',color:'#2BD46A'}];
const STEM_IC={
vocals:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
drums:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9M4 3l6 5M20 3l-6 5"/></svg>',
bass:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 10l6-6M18 2l4 4M8.5 11.5a4 4 0 0 0-5.3 1.3c-1.7 2.4-.3 6 2.5 7.2s6.3-.2 7-3a4 4 0 0 0 1.8-5.2z"/><circle cx="8" cy="16" r="1.2"/></svg>',
other:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M8 4v10M13 4v10M18 4v10M6.5 14v6M11.5 14v6M16.5 14v6"/></svg>'};
let S={name:'',buffer:null,dur:0,wave:null,chroma:null,env:null,lowEnv:null,bpm:0,offset:0,beats:[],chords:null,down:0,key:null,
  transpose:0,rate:1,capo:0,acc:0,win:8,demo:false,stems:null,stemKind:null,edited:new Set(),cues:new Array(8).fill(null),lufs:null,peak:null,
  wmode:'rgb',diag:'guitar',loopBars:4,loop:null,click:false,editing:false,notes:null};
let cells=[],bars=[];

/* ---------- DSP ---------- */
function makeFFT(n){
  const cos=new Float64Array(n/2),sin=new Float64Array(n/2),rev=new Uint32Array(n);
  for(let i=0;i<n/2;i++){cos[i]=Math.cos(2*Math.PI*i/n);sin[i]=Math.sin(2*Math.PI*i/n)}
  const bits=Math.log2(n);
  for(let i=0;i<n;i++){let r=0,x=i;for(let b=0;b<bits;b++){r=(r<<1)|(x&1);x>>=1}rev[i]=r}
  return (re,im)=>{
    for(let i=0;i<n;i++){const j=rev[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
    for(let size=2;size<=n;size<<=1){
      const half=size>>1,step=n/size;
      for(let i=0;i<n;i+=size){
        for(let j=i,k=0;j<i+half;j++,k+=step){
          const l=j+half,tr=re[l]*cos[k]+im[l]*sin[k],ti=-re[l]*sin[k]+im[l]*cos[k];
          re[l]=re[j]-tr;im[l]=im[j]-ti;re[j]+=tr;im[j]+=ti;
        }
      }
    }
  };
}
const hann=n=>{const w=new Float64Array(n);for(let i=0;i<n;i++)w[i]=0.5-0.5*Math.cos(2*Math.PI*i/(n-1));return w};

async function toMono(buf){
  const len=Math.max(1,Math.ceil(buf.duration*SR));
  const oc=new OfflineAudioContext(1,len,SR);
  const s=oc.createBufferSource();s.buffer=buf;s.connect(oc.destination);s.start();
  const r=await oc.startRendering();return r.getChannelData(0);
}

function computeBands(x){
  const rate=200,spp=SR/rate,len=Math.floor(x.length/spp);
  const low=new Float32Array(len),mid=new Float32Array(len),high=new Float32Array(len);
  const aL=Math.exp(-2*Math.PI*200/SR),aH=Math.exp(-2*Math.PI*2500/SR);
  let l1=0,l2=0,h1=0,h2=0;
  for(let i=0;i<x.length;i++){
    const v=x[i];
    l1=(1-aL)*v+aL*l1;l2=(1-aL)*l1+aL*l2;
    h1=(1-aH)*v+aH*h1;h2=(1-aH)*h1+aH*h2;
    const j=(i/spp)|0;if(j>=len)break;
    const lo=Math.abs(l2),hi=Math.abs(v-h2),mi=Math.abs(h2-l2);
    if(lo>low[j])low[j]=lo;if(mi>mid[j])mid[j]=mi;if(hi>high[j])high[j]=hi;
  }
  let m=1e-6;for(let i=0;i<len;i++)m=Math.max(m,low[i],mid[i],high[i]);
  for(let i=0;i<len;i++){low[i]=Math.min(1,Math.pow(low[i]/m,.75));mid[i]=Math.min(1,Math.pow(mid[i]/m,.75));high[i]=Math.min(1,Math.pow(high[i]/m,.75))}
  return {low,mid,high,rate,len};
}

const OH=512,ON=1024,FPS=SR/OH;
const envTime=f=>(f*OH+ON/2-OH/2)/SR;
async function computeOnset(x,prog){
  const fft=makeFFT(ON),w=hann(ON),re=new Float64Array(ON),im=new Float64Array(ON),prev=new Float32Array(ON/2);
  const frames=Math.max(1,Math.floor((x.length-ON)/OH)+1);
  const env=new Float32Array(frames),low=new Float32Array(frames);
  for(let f=0;f<frames;f++){
    const off=f*OH;
    for(let i=0;i<ON;i++){re[i]=(x[off+i]||0)*w[i];im[i]=0}
    fft(re,im);
    let s=0,sl=0;
    for(let k=1;k<ON/2;k++){
      const m=Math.log1p(100*Math.sqrt(re[k]*re[k]+im[k]*im[k])),d=m-prev[k];
      if(d>0){s+=d;if(k<=8)sl+=d}prev[k]=m;
    }
    env[f]=f?s:0;low[f]=f?sl:0;
    if(f%400===0){prog(f/frames);await tick()}
  }
  const post=a=>{
    const n=a.length,o=new Float32Array(n),W=16;let acc=0;
    const cs=new Float64Array(n+1);for(let i=0;i<n;i++)cs[i+1]=cs[i]+a[i];
    let mx=1e-9;
    for(let i=0;i<n;i++){const lo=Math.max(0,i-W),hi=Math.min(n,i+W+1);const v=a[i]-(cs[hi]-cs[lo])/(hi-lo);o[i]=v>0?v:0;if(o[i]>mx)mx=o[i]}
    for(let i=0;i<n;i++)o[i]/=mx;
    // light smoothing
    const s=new Float32Array(n);for(let i=0;i<n;i++)s[i]=0.25*(o[i-1]||0)+0.5*o[i]+0.25*(o[i+1]||0);
    return s;
  };
  return {env:post(env),low:post(low)};
}

const CN=8192,CH=2048;
const chromaTime=i=>(i*CH+CN/2)/SR;
async function computeChroma(x,prog){
  const fft=makeFFT(CN),w=hann(CN),re=new Float64Array(CN),im=new Float64Array(CN),M=new Float64Array(CN/2),cs=new Float64Array(CN/2+1);
  const kmin=Math.floor(45*CN/SR),kmax=Math.ceil(2300*CN/SR),R=10;
  const frames=Math.max(1,Math.floor((x.length-CN)/CH)+1);
  const tre=new Float32Array(frames*12),bas=new Float32Array(frames*12),en=new Float32Array(frames);
  for(let f=0;f<frames;f++){
    const off=f*CH;
    for(let i=0;i<CN;i++){re[i]=(x[off+i]||0)*w[i];im[i]=0}
    fft(re,im);
    for(let k=0;k<CN/2;k++){M[k]=Math.sqrt(re[k]*re[k]+im[k]*im[k]);cs[k+1]=cs[k]+M[k]}
    let e=0;
    // keep only tonal peaks that stand out from the local spectral floor (drums are broadband)
    for(let k=kmin;k<=kmax;k++){
      const m=M[k];if(m<=M[k-1]||m<M[k+1])continue;
      const lo=Math.max(0,k-R),hi=Math.min(CN/2,k+R+1),avg=(cs[hi]-cs[lo])/(hi-lo);
      if(m<1.6*avg)continue;
      const la=Math.log(M[k-1]+1e-12),lb=Math.log(m+1e-12),lc=Math.log(M[k+1]+1e-12);
      const den=la-2*lb+lc,d=den?0.5*(la-lc)/den:0;
      const fq=(k+d)*SR/CN;if(fq<50||fq>2200)continue;
      const p=mod(Math.round(69+12*Math.log2(fq/440)),12),v=m-avg;
      e+=v;
      if(fq>=130)tre[f*12+p]+=v;
      if(fq<=180)bas[f*12+p]+=v;
    }
    en[f]=e;
    if(f%60===0){prog(f/frames);await tick()}
  }
  return {tre,bas,en,frames};
}

function estimateTempo(env){
  const n=env.length,maxLag=Math.min(n-2,Math.ceil(60*FPS/50*4));
  const acf=new Float32Array(maxLag+2);
  for(let lag=1;lag<=maxLag;lag++){let s=0;for(let i=lag;i<n;i++)s+=env[i]*env[i-lag];acf[lag]=s/(n-lag)}
  const at=l=>{if(l>=maxLag)return 0;const i=l|0,f=l-i;return acf[i]*(1-f)+acf[i+1]*f};
  let best=120,bs=-1;
  for(let bpm=60;bpm<=200;bpm+=0.1){
    const lag=60*FPS/bpm;let s=0;
    for(let m=1;m<=4;m++)s+=at(lag*m)/m;
    const oct=Math.log2(bpm/118);s*=Math.exp(-0.5*(oct/0.55)**2);
    if(s>bs){bs=s;best=bpm}
  }
  return best;
}
function gridScore(e,P,phi){let s=0,c=0;for(let p=phi;p<e.length-1;p+=P){const i=p|0,f=p-i;s+=e[i]*(1-f)+e[i+1]*f;c++}return c?s/c:0}
function bestPhase(e,P){
  let bs=-1,bp=0;
  for(let phi=0;phi<P;phi+=0.5){const s=gridScore(e,P,phi);if(s>bs){bs=s;bp=phi}}
  for(let phi=bp-0.5;phi<=bp+0.5;phi+=0.1){const s=gridScore(e,P,mod(phi,P));if(s>bs){bs=s;bp=mod(phi,P)}}
  return {phi:bp,score:bs};
}
function fitGrid(env,bpm0){
  let best={bpm:bpm0,phi:0,score:-1};
  for(let bpm=bpm0-2;bpm<=bpm0+2;bpm+=0.02){
    const r=bestPhase(env,60*FPS/bpm);
    if(r.score>best.score)best={bpm,phi:r.phi,score:r.score};
  }
  let bpm=best.bpm,phi=best.phi;
  if(Math.abs(bpm-Math.round(bpm))<0.15){bpm=Math.round(bpm);phi=bestPhase(env,60*FPS/bpm).phi}
  return {bpm,offset:envTime(phi)};
}

function buildBeats(){
  const T=60/S.bpm,first=mod(S.offset,T),b=[];
  for(let t=first;t<S.dur;t+=T)b.push(t);
  S.beats=b;
}

const KMAJ=[6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const KMIN=[6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
function pearson(a,b){const n=a.length;let ma=0,mb=0;for(let i=0;i<n;i++){ma+=a[i];mb+=b[i]}ma/=n;mb/=n;let s=0,sa=0,sb=0;for(let i=0;i<n;i++){const x=a[i]-ma,y=b[i]-mb;s+=x*y;sa+=x*x;sb+=y*y}return s/Math.sqrt(sa*sb||1)}
function detectKey(){
  const ch=S.chroma,tot=new Float64Array(12);
  for(let f=0;f<ch.frames;f++)for(let p=0;p<12;p++)tot[p]+=Math.sqrt(ch.tre[f*12+p])+0.5*Math.sqrt(ch.bas[f*12+p]);
  let best={pc:0,mode:0},bs=-2;
  for(let k=0;k<12;k++)for(let mode=0;mode<2;mode++){
    const prof=mode?KMIN:KMAJ,rot=new Array(12);
    for(let p=0;p<12;p++)rot[p]=prof[mod(p-k,12)];
    const r=pearson(tot,rot);if(r>bs){bs=r;best={pc:k,mode}}
  }
  return best;
}
function diatonic(key){
  const k=key.pc,s=new Set();
  const add=(r,q)=>s.add(mod(r,12)+12*q);
  if(key.mode===0){add(k,0);add(k+2,1);add(k+4,1);add(k+5,0);add(k+7,0);add(k+9,1)}
  else{add(k,1);add(k+3,0);add(k+5,1);add(k+7,1);add(k+7,0);add(k+8,0);add(k+10,0)}
  return s;
}
function detectChords(){
  const ch=S.chroma,beats=S.beats,T=60/S.bpm,B=beats.length;
  const vec=[],bass=[],E=new Float32Array(B);
  let fi=0;
  for(let b=0;b<B;b++){
    const t0=beats[b]+Math.min(0.15,T*0.3),t1=beats[b]+T+Math.min(0.05,T*0.1),v=new Float64Array(12),bv=new Float64Array(12);let c=0;
    while(fi<ch.frames&&chromaTime(fi)<t0)fi++;
    let j=fi;
    for(;j<ch.frames&&chromaTime(j)<t1;j++){for(let p=0;p<12;p++){v[p]+=ch.tre[j*12+p];bv[p]+=ch.bas[j*12+p]}E[b]+=ch.en[j];c++}
    if(!c){const k=Math.min(ch.frames-1,Math.max(0,Math.round((t0*SR-CN/2)/CH)));for(let p=0;p<12;p++){v[p]=ch.tre[k*12+p];bv[p]=ch.bas[k*12+p]}E[b]=ch.en[k];c=1}
    let n=0,bm=1e-9;for(let p=0;p<12;p++){v[p]=Math.sqrt(v[p]/c);n+=v[p]*v[p];bv[p]=Math.sqrt(bv[p]/c);bm=Math.max(bm,bv[p])}
    n=Math.sqrt(n)||1;for(let p=0;p<12;p++){v[p]/=n;bv[p]/=bm}
    vec.push(v);bass.push(bv);E[b]/=c;
  }
  const sorted=[...E].sort((a,b)=>a-b),med=sorted[sorted.length>>1]||0;
  const dia=diatonic(S.key),NS=25;
  // harmonic-aware templates: each chord tone also brings its 3rd and 5th harmonics
  const H=[[0,1.75],[7,.33],[4,.2]],TPL=[];
  for(let q=0;q<2;q++)for(let r=0;r<12;r++){
    const t=new Float64Array(12);
    for(const [iv,w] of [[0,1],[q?3:4,.9],[7,.9]])for(const [h,hw] of H)t[(r+iv+h)%12]+=w*hw;
    let n=0;for(let p=0;p<12;p++)n+=t[p]*t[p];n=Math.sqrt(n);for(let p=0;p<12;p++)t[p]/=n;
    TPL[r+12*q]=t;
  }
  const emit=b=>{
    const out=new Float64Array(NS);
    if(E[b]<0.08*med){out.fill(0);out[24]=1;return out}
    const v=vec[b],bv=bass[b];
    for(let q=0;q<2;q++)for(let r=0;r<12;r++){
      const t=TPL[r+12*q];let d=0;for(let p=0;p<12;p++)d+=t[p]*v[p];
      const s=d+0.25*bv[r]-0.08*bv[(r+(q?3:4))%12]+(dia.has(r+12*q)?0.04:0);
      out[r+12*q]=s;
    }
    out[24]=0.2;return out;
  };
  const pen=0.15,back=[];let prev=emit(0);
  for(let b=1;b<B;b++){
    const e=emit(b),cur=new Float64Array(NS),bk=new Int8Array(NS);
    let mi=0;for(let s=1;s<NS;s++)if(prev[s]>prev[mi])mi=s;
    for(let s=0;s<NS;s++){
      if(prev[s]>=prev[mi]-pen){cur[s]=prev[s]+e[s];bk[s]=s}else{cur[s]=prev[mi]-pen+e[s];bk[s]=mi}
    }
    back.push(bk);prev=cur;
  }
  const res=new Int8Array(B);
  let s=0;for(let i=1;i<NS;i++)if(prev[i]>prev[s])s=i;
  for(let b=B-1;b>=0;b--){res[b]=s===24?-1:s;if(b>0)s=back[b-1][s]}
  return res;
}
function refineKey(){
  const cnt=new Map();for(const c of S.chords)if(c>=0)cnt.set(c,(cnt.get(c)||0)+1);
  const g=c=>cnt.get(c)||0,k=S.key.pc;
  if(S.key.mode===0){const rel=mod(k+9,12)+12;if(g(rel)>1.2*g(k))S.key={pc:mod(k+9,12),mode:1}}
  else{const rel=mod(k+3,12);if(g(rel)>1.2*g(k+12))S.key={pc:rel,mode:0}}
}
function detectDownbeat(){
  const B=S.beats.length;if(!S.lowEnv){S.down=0;return}
  const lowAt=t=>{const f=Math.round((t*SR-(ON/2-OH/2))/OH);let m=0;for(let d=-1;d<=1;d++)m=Math.max(m,S.lowEnv[f+d]||0);return m};
  const ch=new Array(4).fill(0),lo=new Array(4).fill(0);let tc=0,tl=0;
  for(let b=0;b<B;b++){const p=b%4;const c=b>0&&S.chords[b]!==S.chords[b-1]?1:0;ch[p]+=c;tc+=c;const l=lowAt(S.beats[b]);lo[p]+=l;tl+=l}
  let best=0,bs=-1;
  for(let p=0;p<4;p++){const s=(tc?ch[p]/tc:0)+0.6*(tl?lo[p]/tl:0);if(s>bs){bs=s;best=p}}
  S.down=best;
}



/* ---------- loudness ---------- */
async function measureLoudness(buf){
  const sr=buf.sampleRate,nc=Math.min(2,buf.numberOfChannels);
  const oc=new OfflineAudioContext(nc,buf.length,sr);
  const src=oc.createBufferSource();src.buffer=buf;
  const hs=oc.createBiquadFilter();hs.type='highshelf';hs.frequency.value=1681.97;hs.gain.value=4.0;
  const hp=oc.createBiquadFilter();hp.type='highpass';hp.frequency.value=38.13;hp.Q.value=0.5;
  src.connect(hs).connect(hp).connect(oc.destination);src.start();
  const r=await oc.startRendering();
  const blk=Math.round(0.4*sr),hop=Math.round(0.1*sr),chs=[];for(let c=0;c<nc;c++)chs.push(r.getChannelData(c));
  const cs=chs.map(x=>{const a=new Float64Array(x.length+1);for(let i=0;i<x.length;i++)a[i+1]=a[i]+x[i]*x[i];return a});
  const L=[];
  for(let s=0;s+blk<=r.length;s+=hop){let z=0;for(const a of cs)z+=(a[s+blk]-a[s])/blk;L.push(z)}
  const lk=z=>-0.691+10*Math.log10(z||1e-12);
  let g=L.filter(z=>lk(z)>-70);if(!g.length)return {lufs:null,peak:null};
  const rel=lk(g.reduce((a,b)=>a+b,0)/g.length)-10;g=g.filter(z=>lk(z)>rel);
  let pk=0;for(let c=0;c<nc;c++){const x=buf.getChannelData(c);for(let i=0;i<x.length;i++){const v=Math.abs(x[i]);if(v>pk)pk=v}}
  return {lufs:lk(g.reduce((a,b)=>a+b,0)/g.length),peak:20*Math.log10(pk||1e-9)};
}

/* ---------- waveform data ---------- */
function computeWave(x){
  const rate=150,spp=SR/rate,len=Math.floor(x.length/spp);
  const low=new Float32Array(len),mid=new Float32Array(len),high=new Float32Array(len),amp=new Float32Array(len);
  const aL=Math.exp(-2*Math.PI*220/SR),aH=Math.exp(-2*Math.PI*2600/SR);
  let l1=0,l2=0,h1=0,h2=0;const eL=new Float64Array(len),eM=new Float64Array(len),eH=new Float64Array(len);
  for(let i=0;i<x.length;i++){
    const v=x[i];l1=(1-aL)*v+aL*l1;l2=(1-aL)*l1+aL*l2;h1=(1-aH)*v+aH*h1;h2=(1-aH)*h1+aH*h2;
    const j=(i/spp)|0;if(j>=len)break;
    const lo=l2,hi=v-h2,mi=h2-l2;
    eL[j]+=lo*lo;eM[j]+=mi*mi;eH[j]+=hi*hi;
    const a=Math.abs(v);if(a>amp[j])amp[j]=a;
  }
  let m=1e-9,mb=1e-9;
  for(let j=0;j<len;j++){low[j]=Math.sqrt(eL[j]/spp);mid[j]=Math.sqrt(eM[j]/spp);high[j]=Math.sqrt(eH[j]/spp);m=Math.max(m,amp[j]);mb=Math.max(mb,low[j],mid[j],high[j])}
  // RGB colour per slice (red = lows, green = mids, blue = highs), like a DJ waveform
  const col=new Uint8Array(len*3);
  for(let j=0;j<len;j++){
    amp[j]=Math.min(1,Math.pow(amp[j]/m,0.8));
    const r=low[j],g=mid[j]*1.6,b=high[j]*3.2,mx=Math.max(r,g,b,1e-9);
    const k=255/mx;
    col[j*3]=Math.min(255,40+r*k*0.86);col[j*3+1]=Math.min(255,40+g*k*0.86);col[j*3+2]=Math.min(255,50+b*k*0.84);
    low[j]=Math.min(1,Math.pow(low[j]/mb,0.7));mid[j]=Math.min(1,Math.pow(mid[j]/mb,0.7));high[j]=Math.min(1,Math.pow(high[j]/mb,0.7));
  }
  return {low,mid,high,amp,col,rate,len};
}

/* ---------- names & diagrams ---------- */
function flats(){if(S.acc===1)return false;if(S.acc===2)return true;if(!S.key)return false;const pc=mod(S.key.pc+S.transpose,12);return FLAT_MAJ.has(S.key.mode?mod(pc+3,12):pc)}
function played(c){return c<0?c:mod(c%12+S.transpose-S.capo,12)+12*Math.floor(c/12)}
function sounding(c){return c<0?c:mod(c%12+S.transpose,12)+12*Math.floor(c/12)}
function chordName(c,ascii){if(c<0)return 'N.C.';const n=(ascii?(flats()?ASCII_F:ASCII_S):(flats()?FLAT:SHARP))[c%12];return n+(c>=12?'m':'')}
function chordColor(c){if(c<0)return 'transparent';const h=(mod((c%12)*7,12))*30;return c>=12?`hsl(${h},45%,42%)`:`hsl(${h},62%,52%)`}
function guitarSvg(c){
  if(c<0)return '<svg viewBox="0 0 100 122"><text class="txt" x="50" y="66" text-anchor="middle" font-size="13" fill="currentColor" opacity=".45" font-family="IBM Plex Mono,monospace">N.C.</text></svg>';
  const f=[...SHAPES[c>=12?1:0][c%12]].map(ch=>ch==='x'?-1:+ch);
  const fr=f.filter(v=>v>0),maxF=Math.max(0,...fr),minF=fr.length?Math.min(...fr):0,base=maxF>4?minF:1;
  const x0=20,x1=84,y0=30,fh=17,sx=i=>x0+i*(x1-x0)/5;
  let s=`<svg viewBox="0 0 100 122" role="img" aria-label="${chordName(c,true)}">`;
  for(let i=0;i<6;i++)s+=`<line class="fg" x1="${sx(i)}" y1="${y0}" x2="${sx(i)}" y2="${y0+5*fh}" stroke="currentColor" stroke-width="1.1"/>`;
  for(let j=0;j<=5;j++)s+=`<line class="fg" x1="${x0}" y1="${y0+j*fh}" x2="${x1}" y2="${y0+j*fh}" stroke="currentColor" stroke-width="${j===0&&base===1?4:1.1}"/>`;
  if(base>1)s+=`<text class="txt" x="${x0-6}" y="${y0+fh*0.72}" text-anchor="end" font-size="11" font-family="IBM Plex Mono,monospace" fill="currentColor">${base}</text>`;
  f.forEach((v,i)=>{if(v<0)s+=`<text class="txt" x="${sx(i)}" y="${y0-8}" text-anchor="middle" font-size="12" fill="currentColor" opacity=".55">×</text>`;else if(v===0)s+=`<circle class="fg" cx="${sx(i)}" cy="${y0-12}" r="4" fill="none" stroke="currentColor" stroke-width="1.3"/>`});
  const fp=f.findIndex(v=>v>=0);let barre=false;
  if(minF>0&&f[fp]===minF&&f[5]===minF){barre=true;const y=y0+(minF-base+.5)*fh;s+=`<rect class="dot" x="${sx(fp)-6}" y="${y-6}" width="${sx(5)-sx(fp)+12}" height="12" rx="6" fill="currentColor"/>`}
  f.forEach((v,i)=>{if(v>0&&!(barre&&v===minF)){const y=y0+(v-base+.5)*fh;s+=`<circle class="dot" cx="${sx(i)}" cy="${y}" r="6.3" fill="currentColor"/>`}});
  return s+'</svg>';
}
function pianoSvg(c){
  const W=14,w=9,H=50,bh=31,bw=6;
  let s=`<svg viewBox="0 0 ${W*w+2} ${H+14}" role="img" aria-label="${c<0?'N.C.':chordName(c,true)}">`;
  const on=new Set();
  if(c>=0){const r=c%12;for(const iv of [0,c>=12?3:4,7])on.add(r+iv)}
  const whites=[0,2,4,5,7,9,11],blacks=[1,3,6,8,10],bx={1:1,3:2,6:4,8:5,10:6};
  for(let o=0;o<2;o++)whites.forEach((n,i)=>{const x=1+(o*7+i)*w,a=on.has(n+12*o);s+=`<rect x="${x}" y="1" width="${w}" height="${H}" fill="${a?'#0B0B0C':'#fff'}" stroke="#0B0B0C" stroke-width="1"/>`;if(a&&(n+12*o)===[...on][0])s+=`<circle cx="${x+w/2}" cy="${H-7}" r="2.2" fill="#fff"/>`});
  for(let o=0;o<2;o++)blacks.forEach(n=>{const x=1+(o*7+bx[n])*w-bw/2,a=on.has(n+12*o);s+=`<rect x="${x}" y="1" width="${bw}" height="${bh}" fill="${a?'#E5322B':'#0B0B0C'}" stroke="#0B0B0C" stroke-width="1"/>`});
  s+=`<text class="txt" x="${(W*w+2)/2}" y="${H+12}" text-anchor="middle" font-size="9" font-family="IBM Plex Mono,monospace" fill="#6D6D72">${c<0?'N.C.':[...on].map(n=>ASCII_S[n%12]).join(' ')}</text>`;
  return s+'</svg>';
}
const diagram=c=>S.diag==='piano'?pianoSvg(sounding(c)):guitarSvg(played(c));

/* ---------- canvases ---------- */
const ov=$('#ov'),zm=$('#zm'),og=ov.getContext('2d'),zg=zm.getContext('2d');
let dpr=1,ovCache=null,dirty=true;
function sizeCanvases(){
  dpr=Math.min(2,window.devicePixelRatio||1);
  for(const c of [ov,zm]){c.width=Math.max(1,Math.round(c.clientWidth*dpr));c.height=Math.max(1,Math.round(c.clientHeight*dpr))}
  buildOverview();dirty=true;
}
function sliceRange(w,i0,i1){let a=0,lo=0,mi=0,hi=0,bi=i0;for(let i=i0;i<i1;i++){if(w.amp[i]>a){a=w.amp[i];bi=i}if(w.low[i]>lo)lo=w.low[i];if(w.mid[i]>mi)mi=w.mid[i];if(w.high[i]>hi)hi=w.high[i]}return [a,lo,mi,hi,bi,i0,i1]}
function drawWave(g,cols,cy,amp){
  if(S.wmode==='stems'&&S.stemEnv){
    // stacked stems: each part in its colour, scaled by its current volume (mute/solo included)
    const E=S.stemEnv,gains=STEMS.map((_,i)=>Math.min(1.5,stemGain(i))),order=[1,2,3,0],v=[0,0,0,0];
    for(const c of cols){
      let tot=0;for(let i=0;i<4;i++){let m=0;const e=E.env[i];for(let k=c[6];k<c[7];k++)if(e[k]>m)m=e[k];v[i]=m*gains[i];tot+=v[i]}
      if(tot<=0)continue;
      const h=Math.min(1.08,Math.pow(tot/E.ref,0.8))*amp;let acc=0;
      for(const i of order){if(!v[i])continue;const seg=h*v[i]/tot;g.fillStyle=STEMS[i].color;g.fillRect(c[0],cy-acc-seg,1,seg);g.fillRect(c[0],cy+acc,1,seg);acc+=seg}
    }
    return;
  }
  if(S.wmode==='3band'){
    const band=(k,color,sc)=>{g.fillStyle=color;g.beginPath();for(const c of cols){const h=Math.max(.5,c[k]*amp*sc);g.rect(c[0],cy-h,1,2*h)}g.fill()};
    band(2,'#1E62D0',1);band(3,'#E08A1E',.85);band(4,'#F2EFE6',.7);return;
  }
  if(S.wmode==='blue'){
    g.fillStyle='#2A7FFF';g.beginPath();for(const c of cols){const h=Math.max(.5,c[1]*amp);g.rect(c[0],cy-h,1,2*h)}g.fill();
    g.fillStyle='rgba(255,255,255,.55)';g.beginPath();for(const c of cols){const h=Math.max(.5,c[1]*amp*.45);g.rect(c[0],cy-h,1,2*h)}g.fill();return;
  }
  const col=S.wave.col;
  for(const c of cols){const h=Math.max(.5,c[1]*amp),j=c[5]*3;g.fillStyle=wcol(col[j],col[j+1],col[j+2]);g.fillRect(c[0],cy-h,1,2*h)}
  g.fillStyle='rgba(255,255,255,.22)';g.beginPath();for(const c of cols){const h=Math.max(.3,c[1]*amp*.38);g.rect(c[0],cy-h,1,2*h)}g.fill();
}
function buildOverview(){
  const W=ov.width,H=ov.height;
  ovCache=document.createElement('canvas');ovCache.width=W;ovCache.height=H;
  const g=ovCache.getContext('2d');
  g.fillStyle='#000';g.fillRect(0,0,W,H);
  const strip=Math.round(6*dpr),wh=H-strip-2*dpr;
  if(S.wave&&S.dur){
    const w=S.wave,cols=[];
    for(let x=0;x<W;x++){const i0=Math.floor(x/W*w.len),i1=Math.max(i0+1,Math.floor((x+1)/W*w.len));cols.push([x,...sliceRange(w,i0,Math.min(i1,w.len))])}
    drawWave(g,cols,wh/2,wh/2*.95);
  }else if(S.dur){g.fillStyle='#6d6d72';g.font=`${12*dpr}px IBM Plex Mono, monospace`;g.textAlign='center';g.fillText(t('noAudio'),W/2,wh/2+4*dpr)}
  if(S.chords&&S.dur){const T=60/S.bpm;S.beats.forEach((tb,b)=>{const c=S.chords[b];if(c<0)return;g.fillStyle=chordColor(sounding(c));const x0=tb/S.dur*W,x1=(tb+T)/S.dur*W;g.fillRect(x0,H-strip,Math.max(1,x1-x0+.5),strip)})}
  dirty=true;
}
function drawOverview(tm){
  const W=ov.width,H=ov.height;if(ovCache)og.drawImage(ovCache,0,0);if(!S.dur)return;
  const px=tm/S.dur*W;
  og.fillStyle='rgba(0,0,0,.55)';og.fillRect(0,0,px,H);
  if(S.loop){og.fillStyle='rgba(255,176,32,.25)';og.fillRect(S.loop.ls/S.dur*W,0,(S.loop.le-S.loop.ls)/S.dur*W,H)}
  S.cues.forEach((c,i)=>{if(c==null)return;const x=c/S.dur*W;og.fillStyle=HC_COL[i];og.fillRect(x-dpr*.5,0,dpr*1.5,H);og.beginPath();og.moveTo(x,0);og.lineTo(x+6*dpr,0);og.lineTo(x,6*dpr);og.fill()});
  const wx0=(tm-S.win/2)/S.dur*W,wx1=(tm+S.win/2)/S.dur*W;
  og.strokeStyle='rgba(255,255,255,.5)';og.lineWidth=dpr;og.strokeRect(wx0,.5*dpr,wx1-wx0,H-dpr);
  og.fillStyle='#E5322B';og.fillRect(px-dpr,0,2*dpr,H);
}
function barNo(b){return Math.floor((b-S.down)/4)+(S.down>0?2:1)}
function drawZoom(tm){
  const W=zm.width,H=zm.height,g=zg,lane=Math.round(30*dpr);
  g.fillStyle='#000';g.fillRect(0,0,W,H);
  g.fillStyle='#121214';g.fillRect(0,0,W,lane);
  const top=lane,h=H-lane,cy=top+h/2,win=S.win,pt=win/W,tl=tm-win/2;
  if(S.loop){const x0=(S.loop.ls-tl)/pt,x1=(S.loop.le-tl)/pt;g.fillStyle='rgba(255,176,32,.13)';g.fillRect(x0,top,x1-x0,h);g.fillStyle='#FFB020';g.fillRect(x0,top,2*dpr,h);g.fillRect(x1-2*dpr,top,2*dpr,h)}
  g.fillStyle='#1d1d20';g.fillRect(0,cy,W,dpr);
  if(S.wave){
    const w=S.wave,cols=[];
    for(let x=0;x<W;x++){const ta=tl+x*pt;let i0=Math.floor(ta*w.rate),i1=Math.max(i0+1,Math.floor((ta+pt)*w.rate));if(i1<=0||i0>=w.len)continue;i0=Math.max(0,i0);i1=Math.min(w.len,i1);cols.push([x,...sliceRange(w,i0,i1)])}
    drawWave(g,cols,cy,h/2*.94);
  }
  if(S.beats.length){
    const T=60/S.bpm,first=S.beats[0];
    const b0=Math.max(0,Math.floor((tl-first)/T)),b1=Math.min(S.beats.length-1,Math.ceil((tl+win-first)/T));
    g.font=`600 ${10*dpr}px IBM Plex Mono, monospace`;g.textAlign='left';
    for(let b=b0;b<=b1;b++){
      const x=Math.round((S.beats[b]-tl)/pt),isBar=mod(b-S.down,4)===0;
      if(isBar){g.fillStyle='rgba(255,255,255,.95)';g.fillRect(x-dpr*.5,top,1.5*dpr,h);g.fillStyle='rgba(255,255,255,.75)';g.fillText(String(barNo(b)),x+4*dpr,H-6*dpr)}
      else{g.fillStyle='rgba(255,255,255,.28)';g.fillRect(x,top,Math.max(1,dpr*.8),h*.14);g.fillRect(x,top+h*.86,Math.max(1,dpr*.8),h*.14)}
    }
    if(S.chords){
      g.font=`700 ${15*dpr}px "IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif`;g.textBaseline='middle';
      const lab=(b,x)=>{const c=played(S.chords[b]);g.fillStyle=chordColor(sounding(S.chords[b]));g.fillRect(x,6*dpr,3*dpr,lane-12*dpr);g.fillStyle=c<0?'#6d6d72':'#EDEDEF';g.fillText(chordName(c),x+8*dpr,lane/2+dpr)};
      if((S.beats[b0]-tl)<0)lab(b0,2*dpr);
      for(let b=b0;b<=b1;b++){if(b>0&&S.chords[b]===S.chords[b-1])continue;const x=(S.beats[b]-tl)/pt;if(x<0)continue;lab(b,x)}
      g.textBaseline='alphabetic';
    }
  }
  S.cues.forEach((c,i)=>{if(c==null)return;const x=(c-tl)/pt;if(x<-20||x>W+20)return;g.fillStyle=HC_COL[i];g.fillRect(x-dpr*.5,top,1.5*dpr,h);g.beginPath();g.moveTo(x,top);g.lineTo(x+14*dpr,top);g.lineTo(x+14*dpr,top+12*dpr);g.lineTo(x,top+16*dpr);g.fill();g.fillStyle='#000';g.font=`700 ${10*dpr}px IBM Plex Mono, monospace`;g.fillText('ABCDEFGH'[i],x+3*dpr,top+10*dpr)});
  const px=Math.round(W/2);
  g.fillStyle='#E5322B';g.fillRect(px-dpr,top,2*dpr,h);
  g.beginPath();g.moveTo(px-6*dpr,top);g.lineTo(px+6*dpr,top);g.lineTo(px,top+7*dpr);g.fill();
  g.beginPath();g.moveTo(px-6*dpr,H);g.lineTo(px+6*dpr,H);g.lineTo(px,H-7*dpr);g.fill();
}

/* ---------- audio engine ---------- */
let actx=null;const P={srcs:[],gains:[],playing:false,startCtx:0,startPos:0,pos:0,loop:null,rate:1,fx:false};
const ac=()=>{if(!actx){actx=new (window.AudioContext||window.webkitAudioContext)();applyMono()}return actx};
// accessibility: "mono audio" folds L/R together for listeners who hear with one ear
function applyMono(){if(!actx)return;const m=!!(window.A11Y&&A11Y.get('mono'));try{actx.destination.channelCount=m?1:Math.min(2,actx.destination.maxChannelCount||2);actx.destination.channelInterpretation='speakers'}catch(e){}}
// colour-blind-safe waveform colours when the accessibility plugin asks for them
const wcol=(r,g,b)=>window.A11Y&&A11Y.get('cb')==='safe'&&A11Y.waveColor?A11Y.waveColor(r,g,b):`rgb(${r},${g},${b})`;
const MIX=STEMS.map(()=>({vol:1,mute:false,solo:false}));
function stemGain(i){const any=MIX.some(m=>m.solo),m=MIX[i];return any?(m.solo?m.vol:0):(m.mute?0:m.vol)}
let ovPending=false;
function applyGains(){P.gains.forEach((g,i)=>{if(g)g.gain.setTargetAtTime(stemGain(i),ac().currentTime,0.012)});
  if(S.wmode==='stems'&&!ovPending){ovPending=true;requestAnimationFrame(()=>{ovPending=false;buildOverview()})}dirty=true}
/* tempo & key change: sources play at S.rate (speed), then Signalsmith Stretch (MIT, vendor/) on the master bus
   shifts the pitch back so only the tempo changes, plus S.transpose semitones. Bypassed entirely at 100 % / 0.
   The node adds ~120 ms latency, folded into P.startCtx so the playhead matches what you hear. */
const FX={node:null,ctx:null,lat:0,p:null};
const SS_SRC='vendor/signalsmith-stretch-1.3.2.js';
const ebpm=()=>S.bpm*S.rate;
const fxOn=()=>Math.abs(S.rate-1)>1e-4||S.transpose!==0;
const fxSemis=()=>S.transpose-12*Math.log2(S.rate);
function loadScript(src){return new Promise((res,rej)=>{if(window.SignalsmithStretch)return res();const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>rej(new Error('load '+src));document.head.appendChild(s)})}
async function stretchNode(c){await loadScript(SS_SRC);const n=await window.SignalsmithStretch(c);const lat=await n.latency();return {n,lat:+lat||0}}
function ensureFx(){
  const c=ac();if(FX.node&&FX.ctx===c)return Promise.resolve(FX);
  if(!FX.p)FX.p=stretchNode(c).then(({n,lat})=>{n.connect(c.destination);FX.node=n;FX.ctx=c;FX.lat=lat;return FX}).catch(e=>{FX.p=null;throw e});
  return FX.p;
}
// apply a tempo/key change: live while playing (no gap), or restart when the audio route has to change
function applyFx(){
  dirty=true;
  if(!fxOn()){if(P.playing&&(P.fx||P.rate!==1))restart();return}
  ensureFx().then(()=>{
    if(!P.playing)return;
    if(!P.fx){restart();return}
    const c=ac(),tt=now();if(!P.playing)return;
    P.srcs.forEach(x=>x.playbackRate.setTargetAtTime(S.rate,c.currentTime,0.01));
    FX.node.schedule({semitones:fxSemis(),output:c.currentTime+FX.lat});
    P.startPos=tt;P.startCtx=c.currentTime;P.rate=S.rate;
  }).catch(e=>{console.warn(e);showNotice(t('fxFail'))});
}
function now(){
  if(!P.playing)return P.pos;
  let tt=P.startPos+Math.max(0,ac().currentTime-P.startCtx)*P.rate;
  if(P.loop){const {ls,le}=P.loop;if(P.startPos<le&&tt>=le)tt=ls+mod(tt-ls,le-ls);return tt}
  if(tt>=S.dur){endPlayback();return S.dur}
  return tt;
}
function play(){
  if(!S.buffer)return;const c=ac();c.resume();
  if(fxOn()&&!(FX.node&&FX.ctx===c)){ // first use: load the pitch/tempo engine, then start
    if(P.waitFx)return;P.waitFx=true;
    ensureFx().catch(e=>{console.warn(e);showNotice(t('fxFail'))}).finally(()=>{P.waitFx=false;if(!P.playing&&(!fxOn()||FX.node))play()});return;
  }
  if(P.pos>=S.dur-0.05)P.pos=0;
  const when=c.currentTime+0.03;P.loop=S.loop?{...S.loop}:null;
  const fx=fxOn()&&!!FX.node,out=fx?FX.node:c.destination;
  if(fx)FX.node.schedule({active:true,semitones:fxSemis(),output:when});
  const mk=(buf,gv)=>{const s=c.createBufferSource();s.buffer=buf;s.playbackRate.value=fx?S.rate:1;const g=c.createGain();g.gain.value=gv;s.connect(g).connect(out);
    if(P.loop){s.loop=true;s.loopStart=P.loop.ls;s.loopEnd=Math.min(P.loop.le,buf.duration)}
    s.start(when,Math.min(P.pos,buf.duration-0.001));return [s,g]};
  if(S.stems){const r=S.stems.map((b,i)=>mk(b,stemGain(i)));P.srcs=r.map(x=>x[0]);P.gains=r.map(x=>x[1])}
  else{const r=mk(S.buffer,1);P.srcs=[r[0]];P.gains=[]}
  P.startCtx=when+(fx?FX.lat:0);P.startPos=P.pos;P.rate=fx?S.rate:1;P.fx=fx;P.playing=true;lastClick=P.pos-0.001;setIcon();
}
function killSources(){P.srcs.forEach(x=>{try{x.onended=null;x.stop()}catch(e){}});P.srcs=[];P.gains=[];
  // let the stretch tail ring out, then idle the node (a quick restart cancels this)
  if(P.fx&&FX.node){FX.node.schedule({active:false,output:ac().currentTime+FX.lat+0.05});P.fx=false}}
function stop(){if(!P.playing)return;const tt=now();if(!P.playing)return;P.playing=false;P.pos=tt;killSources();setIcon()}
// reached the end of the song: stop cleanly (no re-entry into now()), next play starts from the top
function endPlayback(){P.playing=false;P.pos=S.dur;killSources();setIcon();dirty=true}
function restart(){if(P.playing){stop();play()}}
function toggle(){P.playing?stop():play()}
function seek(tm){
  tm=Math.max(0,Math.min(S.dur,tm));
  if(S.loop&&(tm<S.loop.ls-0.01||tm>S.loop.le+0.01)){S.loop=null;renderLoop()}
  const was=P.playing;if(was)stop();P.pos=tm;if(was)play();dirty=true;
}
function setIcon(){$('#icPlay').hidden=P.playing;$('#icPause').hidden=!P.playing;$('#play').classList.toggle('on',P.playing)}
// metronome
let lastClick=0;
setInterval(()=>{
  if(!P.playing||!S.click||!S.beats.length)return;
  const c=ac(),tt=now(),T=60/S.bpm;
  if(tt<lastClick)lastClick=tt-0.001;
  const b0=Math.max(0,Math.ceil((lastClick-S.beats[0])/T+1e-6));
  for(let b=b0;b<S.beats.length&&S.beats[b]<=tt+0.12*P.rate;b++){
    if(S.beats[b]<=lastClick)continue;
    const at=c.currentTime+(S.beats[b]-tt)/P.rate;if(at<c.currentTime-0.01)continue;
    const o=c.createOscillator(),g=c.createGain(),bar=mod(b-S.down,4)===0;
    o.frequency.value=bar?1760:1175;g.gain.setValueAtTime(0.0001,at);g.gain.exponentialRampToValueAtTime(bar?0.5:0.3,at+0.002);g.gain.exponentialRampToValueAtTime(0.0001,at+0.05);
    o.connect(g).connect(c.destination);o.start(at);o.stop(at+0.06);lastClick=S.beats[b];
  }
},25);

/* ---------- rendering ---------- */
const fmt=x=>{x=Math.max(0,x);const m=Math.floor(x/60),s=x-m*60;return m+':'+(s<10?'0':'')+s.toFixed(1)};
const fmtS=x=>{const m=Math.floor(x/60),s=Math.floor(x-m*60);return m+':'+(s<10?'0':'')+s};
function fmtBpm(b){return Math.abs(b-Math.round(b))<0.005?String(Math.round(b)):b.toFixed(2)}
function keyName(pc,mode,ascii){const fl=flats();return (ascii?(fl?ASCII_F:ASCII_S):(fl?FLAT:SHARP))[pc]+(mode?'m':'')}
function keyLong(pc,mode){const sol=I[LANG].sol;const fl=flats();const n=sol?sol[pc]:(fl?FLAT:SHARP)[pc];return n+' '+(mode?t('minor'):t('major'))}
function camelot(pc,mode){return mode?CAM_MAJ[mod(pc+3,12)]+'A':CAM_MAJ[pc]+'B'}
function renderStats(){
  const h=$('#tname');h.textContent=S.name||'—';
  if(S.demo){const s=document.createElement('span');s.className='tag';s.textContent=t('demo');h.appendChild(s)}
  // tempo: the value is an input you can type into; − / + nudge by 1 BPM (Shift: 0.1)
  const bi=$('#sBpm'),rch=S.rate!==1,canT=!!(S.buffer&&S.bpm);
  if(document.activeElement!==bi)bi.value=S.bpm?fmtBpm(Math.round(ebpm()*100)/100):'—';
  bi.readOnly=!canT;['#tmM','#tmP'].forEach(x=>$(x).disabled=!canT);$('#stBpm').classList.toggle('chg',rch);
  const bs=$('#sBpmS');bs.innerHTML='';
  if(S.bpm){if(rch){const pct=(S.rate-1)*100;bs.append(rstBtn('rate'),`${t('origL')} `,ltrNode(`${fmtBpm(S.bpm)} · ${pct>0?'+':''}${pct.toFixed(1)}%`))}else bs.textContent='4/4'}
  const kch=!!S.transpose;$('#stKey').classList.toggle('chg',kch);['#kyM','#kyP'].forEach(x=>$(x).disabled=!S.key);
  if(S.key){const pc=mod(S.key.pc+S.transpose,12),ks=$('#sKeyS');$('#sKey').textContent=keyName(pc,S.key.mode);$('#sCam').textContent=camelot(pc,S.key.mode);
    if(kch){ks.innerHTML='';ks.append(rstBtn('key'),`${t('origL')} `,ltrNode(`${keyName(S.key.pc,S.key.mode)} · ${S.transpose>0?'+':''}${S.transpose}`))}else ks.textContent=keyLong(pc,S.key.mode)}
  else{$('#sKey').textContent='—';$('#sKeyS').textContent='';$('#sCam').textContent='—'}
  $('#sDur').textContent=S.dur?fmtS(S.dur/S.rate):'—';
  $('#sLufs').textContent=S.lufs!=null?S.lufs.toFixed(1):'—';$('#sPeak').textContent=S.lufs!=null?`${t('peakL')} \u2066${S.peak.toFixed(1)} dB\u2069`:'';
  $('#trV').textContent=(S.transpose>0?'+':'')+S.transpose;$('#cpV').textContent=S.capo;
  $('#capoH').textContent=S.capo?t('capoN',{n:S.capo}):t('capo0');
  document.querySelectorAll('[data-acc]').forEach(b=>b.classList.toggle('on',+b.dataset.acc===S.acc));
  document.querySelectorAll('[data-dg]').forEach(b=>b.classList.toggle('on',b.dataset.dg===S.diag));
  if(S.wmode==='stems'&&!S.stemEnv)S.wmode='rgb';
  document.querySelectorAll('[data-wm]').forEach(b=>b.classList.toggle('on',b.dataset.wm===S.wmode));
  $('[data-wm="stems"]').hidden=!S.stemEnv;
  const can=!!S.chroma;['#bpmD','#bpmH','#gL','#gR'].forEach(s=>$(s).disabled=!can);
  $('#play').disabled=!S.buffer;
  renderHarm();renderLoop();renderCues();
  $('#clickBtn').classList.toggle('on',S.click);
}
function ltrNode(x){const e=document.createElement('span');e.dir='ltr';e.className='ltr';e.textContent=x;return e}
function rstBtn(kind){const b=document.createElement('button');b.type='button';b.className='rst';b.title=t('resetL');b.setAttribute('aria-label',t('resetL'));
  b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5M4 3.5v5h5"/></svg>';
  b.onclick=()=>kind==='rate'?setRate(1):setT(0);return b}
function renderHarm(){
  const box=$('#harm');box.innerHTML='';if(!S.key)return;
  const pc=mod(S.key.pc+S.transpose,12),m=S.key.mode;
  const items=[[t('same'),pc,m],[t('down'),mod(pc-7,12),m],[t('up'),mod(pc+7,12),m],[t('rel'),m?mod(pc+3,12):mod(pc+9,12),1-m]];
  for(const [lb,p,md] of items){const s=document.createElement('span');s.innerHTML=`<b>${camelot(p,md)}</b>`;s.append(keyName(p,md));s.title=lb;box.appendChild(s)}
}
function renderLoop(){document.querySelectorAll('[data-lb]').forEach(b=>b.classList.toggle('on',+b.dataset.lb===S.loopBars));$('#loopBtn').classList.toggle('on',!!S.loop)}
function renderCues(){
  const box=$('#hc');box.innerHTML='';
  S.cues.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.textContent='ABCDEFGH'[i];if(c!=null){b.classList.add('set');b.style.background=HC_COL[i]}
    b.title=c!=null?fmt(c):'';b.onclick=e=>cueHit(i,e.shiftKey);b.oncontextmenu=e=>{e.preventDefault();cueHit(i,true)};box.appendChild(b)});
}
function cueHit(i,clear){
  if(!S.dur)return;
  if(clear){S.cues[i]=null}
  else if(S.cues[i]==null){let tt=now();if(S.beats.length){const T=60/S.bpm,b=Math.round((tt-S.beats[0])/T);tt=S.beats[Math.max(0,Math.min(S.beats.length-1,b))]}S.cues[i]=tt}
  else{seek(S.cues[i]);if(!P.playing&&S.buffer)play()}
  renderCues();dirty=true;saveLibSoon();
}
function renderChips(){
  const box=$('#chips');box.innerHTML='';if(!S.chords)return;
  const seen=[];for(const c of S.chords)if(c>=0&&!seen.includes(c))seen.push(c);
  seen.forEach(c=>{const d=document.createElement('div');d.className='chip';d.dataset.c=c;d.innerHTML=`<b>${chordName(played(c))}</b>${diagram(c)}`;box.appendChild(d)});
}
function renderSheet(){
  const sh=$('#sheet');sh.innerHTML='';cells=[];bars=[];if(!S.chords)return;
  sh.classList.toggle('editing',S.editing);
  const B=S.beats.length;let b=0,no=1;
  const mk=(list,pad)=>{
    const bar=document.createElement('div');bar.className='bar';
    const n=document.createElement('span');n.className='no';n.textContent=no++;bar.appendChild(n);
    for(let i=0;i<pad;i++){const e=document.createElement('div');e.className='cell empty';bar.appendChild(e)}
    list.forEach((bi,k)=>{
      const cl=document.createElement('button');cl.type='button';cl.className='cell';
      const c=S.chords[bi],prev=bi>0?S.chords[bi-1]:-99;
      if(c!==prev){if(c<0){cl.classList.add('nc');cl.textContent='N.C.'}else cl.textContent=chordName(played(c))}
      else if(k===0&&pad===0&&c>=0){cl.classList.add('cont');cl.textContent=chordName(played(c))}
      else cl.classList.add('dot');
      if(S.edited.has(bi))cl.classList.add('edited');
      cl.setAttribute('aria-label',`${bi+1}: ${chordName(played(c),true)}`);
      cl.addEventListener('click',e=>{if(S.editing)openPop(bi,cl);else seek(S.beats[bi]+0.001)});
      cells[bi]=cl;bar.appendChild(cl);
    });
    for(let i=pad+list.length;i<4;i++){const e=document.createElement('div');e.className='cell empty';bar.appendChild(e)}
    list.forEach(bi=>bars[bi]=bar);sh.appendChild(bar);
  };
  if(S.down>0){const l=[];for(let i=0;i<Math.min(S.down,B);i++)l.push(i);mk(l,4-l.length);b=S.down}
  for(;b<B;b+=4){const l=[];for(let i=b;i<Math.min(b+4,B);i++)l.push(i);mk(l,0)}
  lastBeat=-2;lastBar=null;
  $('#sheetHint').textContent=S.editing?t('editHint'):t('sheetHint');
  $('#editBtn').textContent=S.editing?t('editing'):t('edit');
  $('#editBtn').classList.toggle('solid',S.editing);
}
function renderAll(){renderStats();renderChips();renderSheet();buildOverview();renderStemsUI();lastBeat=-2}

let lastBeat=-2,lastBar=null;
function beatAt(tm){if(!S.beats.length)return -1;const T=60/S.bpm;const b=Math.floor((tm-S.beats[0])/T+1e-6);return b<0?-1:Math.min(b,S.beats.length-1)}
function updateNow(tm){
  const b=beatAt(tm);if(b===lastBeat)return;
  if(P.playing&&b>=0){const bar=mod(b-S.down,4)===0;if(window.A11Y)A11Y.beat(bar);if(window.BG)BG.pulse(bar?0.75:0.4)}
  if(cells[lastBeat])cells[lastBeat].classList.remove('on');lastBeat=b;if(cells[b])cells[b].classList.add('on');
  const bar=bars[b]||null;
  if(bar!==lastBar){if(lastBar)lastBar.classList.remove('cur');if(bar){bar.classList.add('cur');const sh=$('#sheet');const top=bar.offsetTop;if(top<sh.scrollTop+10||top>sh.scrollTop+sh.clientHeight-bar.offsetHeight-10)sh.scrollTop=Math.max(0,top-sh.clientHeight/3)}lastBar=bar}
  if(!S.chords)return;
  const bi=Math.max(0,b),c=S.chords[bi];
  $('#nowName').textContent=b<0?'—':chordName(played(c));$('#nowDia').innerHTML=b<0?'':diagram(c);
  let j=bi+1;while(j<S.chords.length&&S.chords[j]===c)j++;
  if(j<S.chords.length){const n=S.chords[j];$('#nextName').textContent=chordName(played(n));$('#nextDia').innerHTML=diagram(n);$('#nextWhen').textContent=t('inBeats',{n:j-bi})}
  else{$('#nextName').textContent=t('end');$('#nextDia').innerHTML='';$('#nextWhen').textContent=''}
  document.querySelectorAll('.chip').forEach(el=>el.classList.toggle('cur',+el.dataset.c===c));
}
let lastT=-1;
function loop(){
  const tm=now();
  if(tm!==lastT||dirty){drawZoom(tm);drawOverview(tm);$('#time').innerHTML=`${fmt(tm/S.rate)} <span>/ ${fmtS(S.dur/S.rate)}</span>`;updateNow(tm);lastT=tm;dirty=false}
  requestAnimationFrame(loop);
}

/* ---------- chord editing ---------- */
let popState=null;
function openPop(bi,el){
  const cur=S.chords[bi],pl=played(cur);
  popState={bi,root:pl<0?0:pl%12,q:pl<0?2:(pl>=12?1:0)};
  const p=$('#pop');const names=flats()?FLAT:SHARP;
  const draw=()=>{
    p.innerHTML=`<div class="t">${fmtS(S.beats[bi])} · ${bi+1}</div><div class="roots">${names.map((n,i)=>`<button type="button" data-r="${i}" class="${popState.root===i&&popState.q<2?'on':''}">${n}</button>`).join('')}</div>
      <div class="q"><button type="button" data-q="0" class="${popState.q===0?'on':''}">${t('maj')}</button><button type="button" data-q="1" class="${popState.q===1?'on':''}">${t('min')}</button><button type="button" data-q="2" class="${popState.q===2?'on':''}">N.C.</button></div>
      <div class="act"><button class="btn ghost" type="button" data-a="x">${t('cancel')}</button><button class="btn ghost" type="button" data-a="1">${t('thisBeat')}</button><button class="btn solid" type="button" data-a="b">${t('block')}</button></div>`;
    p.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{popState.root=+b.dataset.r;if(popState.q===2)popState.q=0;draw()});
    p.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>{popState.q=+b.dataset.q;draw()});
    p.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>applyPop(b.dataset.a));
  };
  draw();p.hidden=false;
  const r=el.getBoundingClientRect(),pw=292,ph=p.offsetHeight;
  let x=Math.min(window.innerWidth-pw-8,Math.max(8,r.left+r.width/2-pw/2)),y=r.bottom+6;if(y+ph>window.innerHeight-8)y=Math.max(8,r.top-ph-6);
  p.style.left=x+'px';p.style.top=y+'px';
}
function applyPop(a){
  const p=$('#pop');p.hidden=true;if(a==='x'||!popState)return;
  const {bi,root,q}=popState;
  const raw=q===2?-1:mod(root-S.transpose+S.capo,12)+12*q;
  const old=S.chords[bi];let i0=bi,i1=bi;
  if(a==='b'){while(i0>0&&S.chords[i0-1]===old)i0--;while(i1<S.chords.length-1&&S.chords[i1+1]===old)i1++}
  for(let i=i0;i<=i1;i++){S.chords[i]=raw;S.edited.add(i)}
  renderChips();renderSheet();buildOverview();saveLibSoon();popState=null;
}
document.addEventListener('pointerdown',e=>{const p=$('#pop');if(!p.hidden&&!p.contains(e.target)&&!e.target.closest('.cell'))p.hidden=true});

/* ---------- full-song analysis → shared catalog ---------- */
const normTok=x=>String(x||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\(.*?\)|\[.*?\]|feat\..*$|ft\..*$/g,' ').split(/[^a-z0-9\u0590-\u05ff\u0600-\u06ff\u0400-\u04ff]+/).filter(w=>w.length>1);
async function catalogPool(){
  if(!ACC.on)return Object.values(typeof DC!=='undefined'?DC.rows:{});
  if(!DC.pool){try{(await Backend.catalogList('created_at',1000)).forEach(rowFromCatalog)}catch(e){}DC.pool=true}
  return Object.values(DC.rows);
}
async function offerCatalogMatch(){
  if(!ACC.on||!ACC.user)return;
  const name=S.name,ft=new Set(normTok(name)),pool=await catalogPool();let best=null,bs=0;
  for(const r of pool){
    if(!r.inCat)continue;const tt=normTok(r.title);if(!tt.length||!tt.every(w=>ft.has(w)))continue;
    let sc=2+tt.length*0.1;if(normTok(r.artist).some(w=>ft.has(w)))sc+=1;if(S.catRef&&S.catRef.id===r.id)sc+=2;
    if(sc>bs){bs=sc;best=r}
  }
  if(S.catRef&&!best&&S.catRef.inCat)best=S.catRef;
  if(!best||S.name!==name)return;
  const r=best;
  showNotice(t('matchQ',{t:r.title,a:r.artist}),[[t('matchYes'),async()=>{
    const prog=[];for(let b=S.down;b<S.chords.length&&prog.length<8;b++){const c=S.chords[b];if(c>=0&&c!==prog[prog.length-1])prog.push(c)}
    const a={bpm:Math.round(S.bpm*10)/10,pc:S.key.pc,mode:S.key.mode,chords:prog};
    try{const ok=await Backend.catalogSetFull(r.id,a);if(ok){r.a=a;r.full=true;const c=cacheRead();c[r.id]=a;cacheWrite(c);showNotice(t('matchDone'))}else showNotice(t('matchAlready'))}
    catch(e){console.warn(e);showNotice(t('matchFail'))}
  }],[t('matchNo'),()=>{$('#notice').hidden=true}]]);
}
/* ---------- notice bar with actions ---------- */
function showNotice(text,actions){
  const n=$('#notice');n.hidden=false;n.innerHTML='';const p=document.createElement('span');p.textContent=text;n.appendChild(p);
  if(actions&&actions.length){const w=document.createElement('span');w.className='nact';
    for(const [label,fn,icon] of actions){const b=document.createElement('button');b.type='button';b.className='btn ghost';b.innerHTML=(icon||'')+'<span></span>';b.lastChild.textContent=label;b.onclick=fn;w.appendChild(b)}n.appendChild(w)}
}
/* ---------- analysis pipeline ---------- */
function busy(msg,p){const o=$('#busy');if(msg===null){o.hidden=true;return}o.hidden=false;$('#busyMsg').textContent=msg;$('#busyBar').style.width=Math.round(p*100)+'%'}
async function analyze(buffer,name,demo,nosave){
  stop();P.pos=0;cancelSep(true);
  Object.assign(S,{name,buffer,dur:buffer.duration,demo,stemsPaid:false,transpose:0,rate:1,capo:0,chords:null,beats:[],key:null,wave:null,chroma:null,stems:null,stemKind:null,stemEnv:null,fileMeta:null,genre:'',
    edited:new Set(),cues:new Array(8).fill(null),loop:null,lufs:null,peak:null,notes:null});
  $('#notice').hidden=true;renderStats();renderStemsUI();
  busy(t('bPrep'),0.02);await tick();
  const x=await toMono(buffer);
  busy(t('bWave'),0.08);await tick();
  S.wave=computeWave(x);buildOverview();
  const on=await computeOnset(x,p=>busy(t('bBeats'),0.1+p*0.3));
  S.env=on.env;S.lowEnv=on.low;
  S.chroma=await computeChroma(x,p=>busy(t('bChords'),0.4+p*0.48));
  busy(t('bTempo'),0.9);await tick();
  const genv=new Float32Array(S.env.length);for(let i=0;i<genv.length;i++)genv[i]=S.env[i]+2*S.lowEnv[i];
  const g=fitGrid(genv,estimateTempo(S.env));S.bpm=g.bpm;S.offset=g.offset;
  buildBeats();recompute();
  try{const L=await measureLoudness(buffer);S.lufs=L.lufs;S.peak=L.peak}catch(e){}
  renderStats();busy(null);
  if(!demo&&!nosave){saveLib();if(buffer.duration>=60)offerCatalogMatch()}
}
function recompute(){S.key=detectKey();S.chords=detectChords();refineKey();S.chords=detectChords();detectDownbeat();S.edited=new Set();renderAll();dirty=true}
function regrid(){buildBeats();S.chords=detectChords();detectDownbeat();S.edited=new Set();S.loop=null;restart();renderAll();saveLibSoon();dirty=true}

async function synthDemo(o){
  o=o||{};const sr=44100,T=60/(o.bpm||120),lead=0.3,barsN=o.bars||16,dur=lead+barsN*4*T+1,sh=o.shift||0,intro=o.intro||0;
  const oc=new OfflineAudioContext(2,Math.ceil(dur*sr),sr);
  const master=oc.createGain();master.gain.value=0.55;master.connect(oc.destination);
  const nb=oc.createBuffer(1,sr,sr),nd=nb.getChannelData(0);for(let i=0;i<sr;i++)nd[i]=Math.random()*2-1;
  const mtof=m=>440*Math.pow(2,(m-69)/12);
  const prog=(o.prog||[[57,60,64,45],[53,57,60,41],[55,60,64,48],[55,59,62,43]]).map(c=>c.map(m=>m+sh));
  for(let i=0;i<barsN;i++){
    const ch=prog[i%4],t0=lead+i*4*T,t1=t0+4*T,drumsOnly=i<intro;
    const lp=oc.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1700;lp.connect(master);
    if(!drumsOnly)for(const m of ch.slice(0,3))for(const det of [-6,6]){
      const o=oc.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=det;
      const g=oc.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(0.035,t0+0.03);g.gain.setValueAtTime(0.035,t1-0.06);g.gain.linearRampToValueAtTime(0,t1);
      o.connect(g).connect(lp);o.start(t0);o.stop(t1+0.02);
    }
    for(let k=0;k<4;k++){
      const tb=t0+k*T;
      if(!drumsOnly){const b=oc.createOscillator();b.type='triangle';b.frequency.value=mtof(ch[3]);
      const bg=oc.createGain();bg.gain.setValueAtTime(0.0001,tb);bg.gain.exponentialRampToValueAtTime(0.4,tb+0.01);bg.gain.exponentialRampToValueAtTime(0.001,tb+Math.min(0.42,T*0.84));
      b.connect(bg).connect(master);b.start(tb);b.stop(tb+0.45)}
      const kk=oc.createOscillator();kk.frequency.setValueAtTime(150,tb);kk.frequency.exponentialRampToValueAtTime(48,tb+0.12);
      const kg=oc.createGain();kg.gain.setValueAtTime(1,tb);kg.gain.exponentialRampToValueAtTime(0.001,tb+0.32);
      kk.connect(kg).connect(master);kk.start(tb);kk.stop(tb+0.35);
      const hs=oc.createBufferSource();hs.buffer=nb;const hf=oc.createBiquadFilter();hf.type='highpass';hf.frequency.value=8000;
      const hg=oc.createGain();const th=tb+T/2;hg.gain.setValueAtTime(0.18,th);hg.gain.exponentialRampToValueAtTime(0.001,th+0.06);
      hs.connect(hf).connect(hg).connect(master);hs.start(th,Math.random()*0.5,0.08);
      if(k%2===1){const ss=oc.createBufferSource();ss.buffer=nb;const sf=oc.createBiquadFilter();sf.type='bandpass';sf.frequency.value=1800;sf.Q.value=0.8;
        const sg=oc.createGain();sg.gain.setValueAtTime(0.5,tb);sg.gain.exponentialRampToValueAtTime(0.001,tb+0.18);ss.connect(sf).connect(sg).connect(master);ss.start(tb,Math.random()*0.5,0.2)}
    }
  }
  return oc.startRendering();
}



/* full analysis of any buffer without touching the tool's song (used by the DJ decks).
   hint = a saved library item with bpm/offset/key → skip the slow beat/chord passes */
async function analyzeTrack(buffer,prog,hint){
  prog=prog||(()=>{});
  const x=await toMono(buffer);prog(0.06);await tick();
  const wave=computeWave(x);prog(0.12);
  let L={lufs:null,peak:null};try{L=await measureLoudness(buffer)}catch(e){}
  const base={wave,dur:buffer.duration,lufs:L.lufs,peak:L.peak};
  if(hint&&hint.bpm&&hint.key&&hint.offset!=null){prog(1);return {...base,bpm:hint.bpm,offset:hint.offset,down:hint.down||0,key:hint.key}}
  const on=await computeOnset(x,p=>prog(0.14+p*0.3));
  const chroma=await computeChroma(x,p=>prog(0.44+p*0.52));
  const genv=new Float32Array(on.env.length);for(let i=0;i<genv.length;i++)genv[i]=on.env[i]+2*on.low[i];
  const g=fitGrid(genv,estimateTempo(on.env));
  const saved=S;let out;
  S={...saved,chroma,env:on.env,lowEnv:on.low,bpm:g.bpm,offset:g.offset,dur:buffer.duration,beats:[],chords:null,key:null,down:0,transpose:0,capo:0};
  try{buildBeats();S.key=detectKey();S.chords=detectChords();refineKey();S.chords=detectChords();detectDownbeat();out={bpm:S.bpm,offset:S.offset,down:S.down,key:S.key}}
  finally{S=saved}
  prog(1);return {...base,...out};
}

/* ---------- stems ---------- */
const AI={w:null,ready:false,ep:'',busy:false,job:0};
let quickW=null;
function renderStemsUI(){
  const gpu=!!navigator.gpu;
  const isGpu=AI.ready?AI.ep==='webgpu':gpu,eg=$('#engine');eg.classList.toggle('gpu',isGpu);eg.classList.toggle('cpu',!isGpu);
  eg.querySelector('span').textContent=isGpu?t('engGpu'):t('engCpu');eg.title=isGpu?t('engGpuT'):t('engCpuT');
  const running=AI.busy;
  const aiOk=typeof cfgOn!=='function'||cfgOn('ai');
  $('#aiBtn').disabled=!S.buffer||running||S.stemKind==='ai'||!aiOk;
  $('#cancelBtn').hidden=!running;
  if(!running){const n=$('#snote');n.classList.remove('err');n.textContent=!S.buffer?t('needAudio'):S.stemKind==='ai'?t('aiDone'):S.stemKind==='quick'?t('quickDone'):t('aiFirst')}
  if(!aiOk&&!running){$('#snote').textContent=t('offByAdmin')}
  renderMixer();renderExport();
}
function renderMixer(){
  const box=$('#mixer');box.innerHTML='';
  STEMS.forEach((st,i)=>{
    const m=MIX[i],on=!!S.stems,pct=Math.round(m.vol*100);
    const d=document.createElement('div');d.className='strip'+(on?'':' off')+(stemGain(i)===0&&on?' silent':'');d.style.setProperty('--sc',st.color);
    d.innerHTML=`<div class="tp"><span class="nm">${STEM_IC[st.id]}<span>${esc(t(st.id))}</span></span>
      <span class="ms">${i===0?`<button type="button" class="k${MIX[0].mute&&on?' on':''}" title="${esc(t('karaoke'))}" ${on?'':'disabled'}>K</button>`:''}<button type="button" class="m${m.mute?' on':''}" title="${esc(t('muteT'))}" ${on?'':'disabled'}>M</button><button type="button" class="s${m.solo?' on':''}" title="${esc(t('soloT'))}" ${on?'':'disabled'}>S</button></span></div>
      <div class="fad"><input type="range" dir="ltr" id="vol-${st.id}" min="0" max="1.5" step="0.01" value="${m.vol}" aria-label="${esc(t(st.id))}" ${on?'':'disabled'}><output class="mono">${pct}%</output></div>`;
    const redraw=()=>{applyGains();renderMixer()};
    d.querySelector('.m').onclick=()=>{m.mute=!m.mute;redraw()};
    d.querySelector('.s').onclick=()=>{m.solo=!m.solo;redraw()};
    const k=d.querySelector('.k');if(k)k.onclick=()=>{MIX.forEach(x=>{x.solo=false});MIX[0].mute=!MIX[0].mute;redraw()};
    const inp=d.querySelector('input'),out=d.querySelector('output');
    inp.oninput=e=>{m.vol=+e.target.value;out.textContent=Math.round(m.vol*100)+'%';d.classList.toggle('silent',stemGain(i)===0);applyGains()};
    inp.ondblclick=()=>{m.vol=1;redraw()};
    box.appendChild(d);
  });
}
function drawStem(cv,i,color){
  const w=Math.max(1,cv.clientWidth*dpr),h=Math.max(1,cv.clientHeight*dpr);cv.width=w;cv.height=h;const g=cv.getContext('2d');
  g.clearRect(0,0,w,h);if(!S.stems)return;
  const b=S.stems[i],L=b.getChannelData(0),R=b.getChannelData(1),n=L.length,step=n/w;
  g.fillStyle=color;g.beginPath();
  for(let x=0;x<w;x++){let m=0;const a=Math.floor(x*step),e=Math.floor((x+1)*step);for(let k=a;k<e;k+=8){const v=Math.abs(L[k])+Math.abs(R[k]);if(v>m)m=v}const hh=Math.max(.5,Math.min(1,m*0.6)*h/2);g.rect(x,h/2-hh,1,2*hh)}
  g.fill();
}
function sepProgress(p,msg){$('#sprog').hidden=false;$('#sbar').style.width=Math.round(p*100)+'%';$('#smsg').textContent=msg}
function sepEnd(note,err){$('#sprog').hidden=true;AI.busy=false;renderStemsUI();if(note){const n=$('#snote');n.textContent=note;n.classList.toggle('err',!!err)}}
async function stereo44(){
  const sr=44100,len=Math.ceil(S.buffer.duration*sr);
  const oc=new OfflineAudioContext(2,len,sr);const src=oc.createBufferSource();src.buffer=S.buffer;src.connect(oc.destination);src.start();
  const r=await oc.startRendering();return [r.getChannelData(0).slice(0),r.getChannelData(1).slice(0),len];
}
function setStems(res,len,kind){
  const c=ac(),was=P.playing;if(was)stop();
  S.stems=STEMS.map((st,i)=>{const b=c.createBuffer(2,len,44100);b.copyToChannel(res[i*2],0);b.copyToChannel(res[i*2+1],1);return b});
  S.stemKind=kind;S.notes=null;
  S.stemEnv=stemEnvelopes();S.wmode='stems';buildOverview();renderStats();
  if(was)play();
}
function stemEnvelopes(){
  const rate=S.wave?S.wave.rate:150,n=S.wave?S.wave.len:Math.floor(S.dur*rate),spp=44100/rate,env=[],sum=new Float32Array(n);
  for(const b of S.stems){
    const L=b.getChannelData(0),R=b.getChannelData(1),e=new Float32Array(n);
    for(let j=0;j<n;j++){let m=0;const a=Math.floor(j*spp),z=Math.min(L.length,Math.floor((j+1)*spp));for(let k=a;k<z;k+=2){const x=Math.abs(L[k]+R[k])*0.5;if(x>m)m=x}e[j]=m;sum[j]+=m}
    env.push(e);
  }
  let ref=1e-9;for(let j=0;j<n;j++)if(sum[j]>ref)ref=sum[j];
  return {env,ref};
}
const fmtEta=s=>s>=90?Math.round(s/60)+' '+t('min_'):Math.max(5,Math.round(s/5)*5)+' '+t('sec_');
async function aiSeparate(){
  if(!S.buffer||AI.busy)return;
  if(!(await payFor('sep')))return;
  const pay=await charge('sep',S.name);if(!pay)return;
  AI.busy=true;const job=++AI.job;AI.pay=pay;renderStemsUI();
  const token=S.buffer;
  try{
    if(!AI.ready){
      sepProgress(0,t('aiDl',{p:0}));
      if(!AI.w)AI.w=new Worker('ai/worker.js');
      const man=await (await fetch('ai/model/wman.json')).json();
      const abs=f=>new URL(f,location.href).href;
      await new Promise((ok,fail)=>{
        AI.w.onmessage=e=>{const d=e.data;if(job!==AI.job)return;
          if(d.type==='dl')sepProgress(d.p*0.9,t('aiDl',{p:Math.round(d.p*100)}));
          else if(d.type==='stage'&&d.s!=='fail')sepProgress(0.95,t('aiPrep'));
          else if(d.type==='ready'){AI.ready=true;AI.ep=d.ep;ok()}
          else if(d.type==='error')fail(new Error(d.message))};
        AI.w.onerror=e=>fail(new Error(e.message||'worker'));
        AI.w.postMessage({type:'init',man,bytes:AI_BYTES,base:abs('ai/'),gpu:!/cpu/.test(location.hash),
          files:{ort:['ai/model/rt0.bin'].map(abs),graph:['ai/model/g0.bin'].map(abs),w:[0,1,2,3,4,5].map(i=>abs(`ai/model/w${i}.bin`))}});
      });
      renderStemsUI();
    }
    sepProgress(0,t('aiRun',{p:0}));
    const [L,R,len]=await stereo44();
    const res=await new Promise((ok,fail)=>{
      AI.w.onmessage=e=>{const d=e.data;if(job!==AI.job)return;
        if(d.type==='p'){const p=d.tot?d.i/d.tot:0;let m=t('aiRun',{p:Math.round(p*100)});if(d.i>0)m+=t('aiEta',{t:fmtEta(d.el/d.i*(d.tot-d.i))});sepProgress(p,m)}
        else if(d.type==='done')ok(d.res);else if(d.type==='error')fail(new Error(d.message))};
      AI.w.postMessage({type:'run',L,R},[L.buffer,R.buffer]);
    });
    if(job!==AI.job||S.buffer!==token)return;
    AI.pay=null;setStems(res,len,'ai');sepEnd(null);bumpSeps();S.stemsPaid=false;
  }catch(e){
    console.error(e);if(job!==AI.job)return;
    refund(AI.pay);AI.pay=null;
    if(AI.w){AI.w.terminate();AI.w=null;AI.ready=false}
    sepEnd(t('aiErr',{m:String(e.message||e).slice(0,80)}),true);
  }
}
const AI_BYTES=78767446;
function cancelSep(silent){
  if(!AI.busy)return;AI.job++;if(AI.pay){refund(AI.pay);AI.pay=null}
  if(AI.w&&!AI.ready){AI.w.terminate();AI.w=null}
  else if(AI.w){AI.w.terminate();AI.w=null;AI.ready=false}
  sepEnd(silent?null:t('canceled'));
}

/* ---------- note transcription (YIN) ---------- */
const YIN_SRC=`
function yin(x,sr,fmin,fmax,win,hop,thr){
  const tmin=Math.floor(sr/fmax),tmax=Math.ceil(sr/fmin),n=Math.floor((x.length-win-tmax)/hop),f0=new Float32Array(Math.max(0,n)),rms=new Float32Array(Math.max(0,n));
  const d=new Float32Array(tmax+1);
  for(let fr=0;fr<n;fr++){
    const o=fr*hop;let e=0;for(let i=0;i<win;i++)e+=x[o+i]*x[o+i];rms[fr]=Math.sqrt(e/win);
    for(let tau=1;tau<=tmax;tau++){let s=0;for(let i=0;i<win;i++){const v=x[o+i]-x[o+i+tau];s+=v*v}d[tau]=s}
    let run=0,best=-1;
    for(let tau=1;tau<=tmax;tau++){run+=d[tau];const c=d[tau]*tau/(run||1);d[tau]=c}
    for(let tau=tmin;tau<tmax;tau++){if(d[tau]<thr){while(tau+1<tmax&&d[tau+1]<d[tau])tau++;best=tau;break}}
    if(best>0){const a=d[best-1],b=d[best],c=d[best+1]||b,den=a-2*b+c,p=den?0.5*(a-c)/den:0;f0[fr]=sr/(best+p)}else f0[fr]=0;
  }
  return {f0,rms};
}
function notes(x,sr,fmin,fmax,win,hop,minDur){
  const {f0,rms}=yin(x,sr,fmin,fmax,win,hop,0.15);
  let mx=0;for(const v of rms)if(v>mx)mx=v;const gate=mx*0.06;
  const n=f0.length,m=new Float32Array(n);
  for(let i=0;i<n;i++)m[i]=f0[i]>0&&rms[i]>gate?69+12*Math.log2(f0[i]/440):-1;
  const md=new Float32Array(n);
  for(let i=0;i<n;i++){const w=[];for(let k=-2;k<=2;k++){const v=m[i+k];if(v!==undefined)w.push(v)}w.sort((a,b)=>a-b);md[i]=w[w.length>>1]}
  const out=[];let st=-1,cur=-1,vel=0,cnt=0;
  const flush=(end)=>{if(st>=0&&(end-st)*hop/sr>=minDur)out.push({t:st*hop/sr,d:(end-st)*hop/sr,n:cur,v:Math.min(127,Math.round(50+70*vel/cnt/mx))});st=-1};
  for(let i=0;i<n;i++){
    const v=md[i]<0?-1:Math.round(md[i]);
    if(v!==cur){flush(i);cur=v;if(v>=0){st=i;vel=0;cnt=0}}
    if(v>=0){vel+=rms[i];cnt++}
    if(i%500===0)postMessage({type:'p',p:i/n});
  }
  flush(n);return out;
}
onmessage=e=>{const {x,sr,kind}=e.data;
  const r=kind==='bass'?notes(x,sr,28,330,256,48,0.08):notes(x,sr,70,1100,320,64,0.07);
  postMessage({type:'done',notes:r});};`;
async function stemMono(i,sr){
  const b=S.stems[i],oc=new OfflineAudioContext(1,Math.ceil(b.duration*sr),sr);const s=oc.createBufferSource();s.buffer=b;s.connect(oc.destination);s.start();
  return (await oc.startRendering()).getChannelData(0).slice(0);
}
async function transcribe(onP){
  if(S.notes)return S.notes;
  const run=async(kind,idx,sr,p0)=>{const x=await stemMono(idx,sr);const w=new Worker(URL.createObjectURL(new Blob([YIN_SRC],{type:'text/javascript'})));
    return new Promise(ok=>{w.onmessage=e=>{if(e.data.type==='p')onP(p0+e.data.p*0.5);else{w.terminate();ok(e.data.notes)}};w.postMessage({x,sr,kind},[x.buffer])})};
  const bass=await run('bass',2,4000,0),mel=await run('mel',0,8000,0.5);
  S.notes={bass,mel};return S.notes;
}

/* ---------- MIDI ---------- */
function vlq(n){const b=[n&0x7f];n>>=7;while(n>0){b.unshift((n&0x7f)|0x80);n>>=7}return b}
function u32(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]}
function mtrk(evs){evs.sort((a,b)=>a.t-b.t||a.o-b.o);const d=[];let last=0;for(const e of evs){d.push(...vlq(e.t-last),...e.b);last=e.t}d.push(0,0xFF,0x2F,0);return [0x4D,0x54,0x72,0x6B,...u32(d.length),...d]}
const txt=(type,str)=>{const b=[...new TextEncoder().encode(str)];return [0xFF,type,...vlq(b.length),...b]};
const PPQ=480;const tk=x=>Math.max(0,Math.round(x/(60/S.bpm)*PPQ));
function midiFile(trackName,noteEvs,markers){
  const t0=[{t:0,o:0,b:txt(3,S.name||'Song')}];
  const us=Math.round(60e6/ebpm());t0.push({t:0,o:0,b:[0xFF,0x51,3,(us>>16)&255,(us>>8)&255,us&255]},{t:0,o:0,b:[0xFF,0x58,4,4,2,24,8]});
  if(S.key){const pc=mod(S.key.pc+S.transpose,12),maj=S.key.mode?mod(pc+3,12):pc;const SF=[0,-5,2,-3,4,-1,6,1,-4,3,-2,5];let sf=SF[maj];if(sf===6&&flats())sf=-6;t0.push({t:0,o:0,b:[0xFF,0x59,2,sf&255,S.key.mode]})}
  (markers||[]).forEach(m=>t0.push({t:m.t,o:1,b:txt(6,m.s)}));
  const tr=[{t:0,o:0,b:txt(3,trackName)},{t:0,o:0,b:[0xC0,0]},...noteEvs];
  return new Uint8Array([0x4D,0x54,0x68,0x64,...u32(6),0,1,0,2,(PPQ>>8)&255,PPQ&255,...mtrk(t0),...mtrk(tr)]);
}
const note=(on,off,n,v)=>[{t:on,o:1,b:[0x90,n,v]},{t:Math.max(on+1,off),o:0,b:[0x80,n,0]}];
function chordMidi(){
  const B=S.beats.length,T=60/S.bpm,ch=Array.from(S.chords,c=>sounding(c)),ev=[],mk=[];
  for(let b=0;b<B;){let e=b+1;while(e<B&&ch[e]===ch[b])e++;const c=ch[b];
    if(c>=0){const on=tk(S.beats[b]),off=tk(e<B?S.beats[e]:S.beats[B-1]+T)-1;mk.push({t:on,s:chordName(c,true)});
      const r=c%12;for(const iv of [0,c>=12?3:4,7]){let n=r+iv;while(n<53)n+=12;while(n>64)n-=12;ev.push(...note(on,off,n,82))}
      ev.push(...note(on,off,36+r,92))}
    b=e}
  return midiFile('Chords (Piano)',ev,mk);
}
function notesMidi(name,list,oct){const ev=[];for(const n of list){let p=n.n+S.transpose;ev.push(...note(tk(n.t),tk(n.t+n.d),Math.max(0,Math.min(127,p)),n.v))}return midiFile(name,ev)}

/* ---------- WAV + ZIP ---------- */
// render one stereo track through the same tempo/key chain as playback (offline, faster than real time)
async function fxRender(L,R,sr){
  await loadScript(SS_SRC);
  const n=L.length,m=Math.round(n/S.rate),pad=Math.ceil(sr*0.6);
  const oc=new OfflineAudioContext(2,m+pad,sr),st=await window.SignalsmithStretch(oc),lat=+(await st.latency())||0;
  const b=oc.createBuffer(2,n,sr);b.copyToChannel(L,0);b.copyToChannel(R,1);
  const src=oc.createBufferSource();src.buffer=b;src.playbackRate.value=S.rate;src.connect(st);st.connect(oc.destination);
  await st.schedule({active:true,semitones:fxSemis(),output:0});src.start(0);
  const out=await oc.startRendering(),o=Math.round(lat*sr);
  return [out.getChannelData(0).slice(o,o+m),out.getChannelData(1).slice(o,o+m)];
}
function wav(L,R,sr){
  const n=L.length,buf=new ArrayBuffer(44+n*4),v=new DataView(buf);
  const w4=(o,s)=>{for(let i=0;i<4;i++)v.setUint8(o+i,s.charCodeAt(i))};
  w4(0,'RIFF');v.setUint32(4,36+n*4,true);w4(8,'WAVE');w4(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);w4(36,'data');v.setUint32(40,n*4,true);
  const pcm=new Int16Array(buf,44);
  for(let i=0,j=0;i<n;i++){let a=L[i],b=R[i];a=a>1?1:a<-1?-1:a;b=b>1?1:b<-1?-1:b;pcm[j++]=a*32767;pcm[j++]=b*32767}
  return new Uint8Array(buf);
}
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
function zip(files){
  const parts=[],cen=[];let off=0;const enc=new TextEncoder();
  for(const f of files){
    const nm=enc.encode(f.name),crc=crc32(f.data),sz=f.data.length;
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,0,true);h.setUint16(12,33,true);
    h.setUint32(14,crc,true);h.setUint32(18,sz,true);h.setUint32(22,sz,true);h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
    parts.push(h.buffer,nm,f.data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,0,true);c.setUint16(14,33,true);
    c.setUint32(16,crc,true);c.setUint32(20,sz,true);c.setUint32(24,sz,true);c.setUint16(28,nm.length,true);c.setUint32(42,off,true);
    cen.push(c.buffer,nm);
    off+=30+nm.length+sz;
  }
  const cs=cen.reduce((a,x)=>a+x.byteLength,0);
  const e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
  return new Blob([...parts,...cen,e.buffer],{type:'application/zip'});
}


function infoText(){
  const pc=S.key?mod(S.key.pc+S.transpose,12):0;
  const L=[`Song: ${S.name}`,`BPM: ${fmtBpm(Math.round(ebpm()*100)/100)}`+(S.rate!==1?` (original ${fmtBpm(S.bpm)}, tempo ${S.rate>1?'+':''}${((S.rate-1)*100).toFixed(1)}%)`:''),S.key?`Key: ${keyName(pc,S.key.mode,true)} (${camelot(pc,S.key.mode)})`:'',S.lufs!=null?`Loudness: ${S.lufs.toFixed(1)} LUFS, peak ${S.peak.toFixed(1)} dBFS`:'',
    `First beat at: ${S.beats[0]?(S.beats[0]/S.rate).toFixed(3):0} s`,`Transpose: ${S.transpose>0?'+':''}${S.transpose} semitones`+(S.transpose&&S.key?` (original key ${keyName(S.key.pc,S.key.mode,true)})`:''),fxOn()?'Audio files are rendered at this tempo and key.':'',S.stemKind?`Stems: ${S.stemKind==='ai'?'Demucs v4 (AI)':'quick DSP'}`:'','',
    'FL Studio: set the project tempo to the BPM above and drop every WAV and MIDI file at bar 1 (time 0). They line up.','','Chords by bar:'];
  let row=[];for(let b=0;b<S.beats.length;b++){if(mod(b-S.down,4)===0&&row.length){L.push(row.join(' '));row=[]}row.push(chordName(sounding(S.chords[b]),true).padEnd(4))}
  if(row.length)L.push(row.join(' '));
  return new TextEncoder().encode(L.filter((x,i)=>x!==''||i>7).join('\n'));
}
const EXP=[{id:'vocals',st:0},{id:'drums',st:1},{id:'bass',st:2},{id:'other',st:3},{id:'xInst',st:'inst'},{id:'xOrig',st:'orig'},{id:'xChords',st:'mchords',midi:1},{id:'xBassM',st:'mbass',midi:1},{id:'xMel',st:'mmel',midi:1}];
const expSel={vocals:1,drums:1,bass:1,other:1,xInst:0,xOrig:0,xChords:1,xBassM:1,xMel:1};
function expOk(e){if(e.st==='mchords')return !!S.chords;if(e.st==='orig')return !!S.buffer;return !!S.stems}
let expFmt=(()=>{try{return localStorage.getItem('chordroom.fmt')==='mp3'?'mp3':'wav'}catch(e){return 'wav'}})();
function renderFmt(){document.querySelectorAll('[data-fmt]').forEach(b=>{const on=b.dataset.fmt===expFmt;b.classList.toggle('on',on);b.setAttribute('aria-checked',on)});renderDlCost()}
document.querySelectorAll('[data-fmt]').forEach(b=>b.onclick=()=>{expFmt=b.dataset.fmt;try{localStorage.setItem('chordroom.fmt',expFmt)}catch(e){}renderFmt();renderExport()});
function renderExport(){
  const box=$('#xlist');box.innerHTML='';
  EXP.forEach(e=>{const ok=expOk(e),l=document.createElement('label');if(!ok)l.className='dis';
    l.innerHTML=`<input type="checkbox" id="x-${e.id}" ${expSel[e.id]&&ok?'checked':''} ${ok?'':'disabled'}><span></span><span class="ext">${e.midi?'MIDI':expFmt==='mp3'?'MP3':'WAV'}</span>`;
    l.querySelector('span').textContent=t(e.id)+(ok?'':` · ${t('needStems')}`);
    l.querySelector('input').onchange=ev=>{expSel[e.id]=ev.target.checked?1:0;renderDlCost()};box.appendChild(l)});
  renderDlCost();
}
function saveBlob(blob,filename){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)}
async function download(){
  const msg=$('#dlMsg'),btn=$('#dlBtn');msg.classList.remove('err');
  if(typeof cfgOn==='function'&&!cfgOn('dl')){msg.textContent=t('offByAdmin');msg.classList.add('err');return}
  const pick=EXP.filter(e=>expSel[e.id]&&expOk(e));
  if(!pick.length){msg.textContent=t('dlNone');msg.classList.add('err');return}
  btn.disabled=true;msg.textContent=t('packing');await tick();
  try{
    const fx=fxOn(),tag=fx?` (${fmtBpm(Math.round(ebpm()*100)/100)} BPM${S.key?' '+keyName(mod(S.key.pc+S.transpose,12),S.key.mode,true):''})`:'';
    const safe=((S.name||'song').replace(/[\\/:*?"<>|]/g,'_').slice(0,80)+tag).replace(/[\\/:*?"<>|]/g,'_'),files=[];
    const wavs=pick.filter(e=>!e.midi).length;let wi=0;
    const mp3=expFmt==='mp3'&&window.MP3&&MP3.supported,EXT=mp3?'mp3':'wav';
    const W=async(L,R,sr,part)=>{
      let a=L,b=R;if(fx){msg.textContent=t('fxRender',{n:++wi,m:wavs});await tick();[a,b]=await fxRender(L,R,sr)}
      if(!mp3)return wav(a,b,sr);
      const kp=S.key?mod(S.key.pc+S.transpose,12):null;
      return MP3.encode(a,b,sr,{kbps:320,tags:{title:part?`${S.name} (${part})`:S.name,artist:'Chord Room',bpm:S.bpm?ebpm():undefined,key:kp!=null?keyName(kp,S.key.mode,true):undefined},
        onProgress:p=>{msg.textContent=t('encoding',{p:Math.round(p*100)})}}).catch(e=>{(e=e instanceof Error?e:new Error(String(e))).mp3=true;throw e});
    };
    if(pick.some(e=>typeof e.st==='number'||e.st==='inst')&&!S.stemsPaid){
      if(!(await payFor('stems'))){msg.textContent='';return}
      if(!(await charge('stems',S.name))){msg.textContent='';return}
      S.stemsPaid=true;renderDlCost();
    }
    if(pick.some(e=>e.st==='mbass'||e.st==='mmel'))await transcribe(p=>{msg.textContent=t('transcribing',{p:Math.round(p*100)})});
    msg.textContent=t('packing');await tick();
    for(const e of pick){
      if(typeof e.st==='number'){const b=S.stems[e.st];files.push({name:`${safe} - ${STEMS[e.st].file}.${EXT}`,data:await W(b.getChannelData(0),b.getChannelData(1),b.sampleRate,STEMS[e.st].file)})}
      else if(e.st==='inst'){const n=S.stems[1].length,L=new Float32Array(n),R=new Float32Array(n);for(const i of [1,2,3]){const a=S.stems[i].getChannelData(0),b=S.stems[i].getChannelData(1);for(let k=0;k<n;k++){L[k]+=a[k];R[k]+=b[k]}}files.push({name:`${safe} - Instrumental.${EXT}`,data:await W(L,R,S.stems[1].sampleRate,'Instrumental')})}
      else if(e.st==='orig'){const b=S.buffer,L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L;files.push({name:`${safe}.${EXT}`,data:await W(L,R,b.sampleRate)})}
      else if(e.st==='mchords')files.push({name:`${safe} - Chords (Piano).mid`,data:chordMidi()});
      else if(e.st==='mbass')files.push({name:`${safe} - Bass line (Piano).mid`,data:notesMidi('Bass line',S.notes.bass)});
      else if(e.st==='mmel')files.push({name:`${safe} - Vocal melody (Piano).mid`,data:notesMidi('Vocal melody',S.notes.mel)});
      await tick();
    }
    if(S.chords)files.push({name:`${safe} - info.txt`,data:infoText()});
    const blob=zip(files);
    saveBlob(blob,`${safe} - Chord Room.zip`);
    if(ACC.on&&ACC.user)Backend.logDownload({song_name:S.name,files:pick.map(e=>e.id),size:blob.size}).catch(()=>{});
    msg.textContent=t('dlDone',{s:(blob.size/1048576).toFixed(1)});
  }catch(err){const c=err&&err.code;msg.textContent=c==='declined'?t('dlDeclined'):c==='rate_limited'?t('dlBusy'):err&&err.mp3?t('mp3Fail'):t('dlFail');msg.classList.add('err');console.error(err)}
  finally{btn.disabled=false}
}

/* ---------- library ---------- */
const LK='chordroom.library.v2';
function readLocal(){try{return JSON.parse(localStorage.getItem(LK)||'[]')}catch(e){return []}}
function readLib(){return (typeof ACC!=='undefined'&&ACC.lib)?ACC.lib:readLocal()}
function writeLib(l){try{localStorage.setItem(LK,JSON.stringify(l))}catch(e){}}
function saveLib(){
  if(!S.chords||S.demo)return;
  const item={name:S.name,dur:S.dur,bpm:S.bpm,offset:S.offset,down:S.down,key:S.key,chords:Array.from(S.chords),edited:[...S.edited],cues:S.cues,rate:S.rate,transpose:S.transpose,lufs:S.lufs,peak:S.peak,saved:Date.now(),
    ...(S.fileMeta||{}),genre:S.genre||(S.fileMeta&&S.fileMeta.genre)||''};
  const loc=readLocal().filter(x=>x.name!==S.name);loc.unshift(item);writeLib(loc.slice(0,80));cloudSave(item);
}
let saveT=0;function saveLibSoon(){clearTimeout(saveT);saveT=setTimeout(saveLib,400)}
function renderLib(){
  const ul=$('#libList'),l=readLib();ul.innerHTML='';
  if(!l.length){const li=document.createElement('li');li.className='empty';li.textContent=t('libEmpty');ul.appendChild(li);return}
  l.forEach((it,i)=>{
    const li=document.createElement('li'),o=document.createElement('button');o.type='button';o.className='op';
    const kn=(FLAT_MAJ.has(it.key.mode?mod(it.key.pc+3,12):it.key.pc)?FLAT:SHARP)[it.key.pc]+(it.key.mode?'m':'');
    o.innerHTML=`<span class="t"></span><span class="m"><span class="lt" dir="ltr">${fmtBpm(it.bpm)} BPM · ${kn} · ${camelot(it.key.pc,it.key.mode)} · ${fmtS(it.dur)}</span>${it.genre?`<span class="g"></span>`:''}${it.file_path?`<span class="cl" title="${esc(t('cloudTag'))}">${CLOUD_IC}</span>`:''}</span>`;
    if(it.genre)o.querySelector('.g').textContent=it.genre;
    o.querySelector('.t').textContent=it.name;o.onclick=()=>openLib(it);
    const d=document.createElement('button');d.type='button';d.className='del';d.textContent=t('del');
    d.onclick=()=>{if(!d.classList.contains('arm')){d.classList.add('arm');d.textContent=t('sure');setTimeout(()=>{d.classList.remove('arm');d.textContent=t('del')},3000);return}writeLib(readLocal().filter(x=>x.name!==it.name));cloudDelete(it.name).then(renderLib);renderLib()};
    li.append(o,d);ul.appendChild(li);
  });
}
function restoreSaved(saved){
  S.bpm=saved.bpm;S.offset=saved.offset;buildBeats();S.chords=Int8Array.from(saved.chords);S.down=saved.down;
  S.edited=new Set(saved.edited||[]);S.cues=saved.cues||new Array(8).fill(null);if(saved.key)S.key=saved.key;
  S.rate=saved.rate||1;S.transpose=saved.transpose||0;if(fxOn())ensureFx().catch(()=>{});renderAll();
}
async function openLib(it){
  stop();P.pos=0;cancelSep(true);$('#lib').hidden=true;
  if(it.file_path&&ACC.on&&ACC.user){
    try{
      busy(t('bCloud'),0.05);
      const url=await Backend.songFileUrl(it.file_path);
      const ab=await (await fetch(url)).arrayBuffer();busy(t('bCloud'),0.3);
      const buf=await ac().decodeAudioData(ab);
      await analyze(buf,it.name,false,true);restoreSaved(it);
      S.fileMeta={file_path:it.file_path,file_size:it.file_size,file_type:it.file_type};S.genre=it.genre||'';setSaveState('saved');
      $('#notice').hidden=true;return;
    }catch(e){console.warn(e);busy(null)}
  }
  Object.assign(S,{name:it.name,buffer:null,dur:it.dur,wave:null,chroma:null,env:null,lowEnv:null,bpm:it.bpm,offset:it.offset,down:it.down,key:it.key,transpose:it.transpose||0,rate:it.rate||1,capo:0,demo:false,
    stems:null,stemEnv:null,stemKind:null,edited:new Set(it.edited||[]),cues:it.cues||new Array(8).fill(null),loop:null,lufs:it.lufs??null,peak:it.peak??null,notes:null,fileMeta:null,genre:it.genre||''});
  buildBeats();S.chords=Int8Array.from(it.chords);renderAll();setSaveState('');
  showNotice(t('fromLib'),[[t('upload'),()=>$('#file').click()]]);
}


/* ---------- accounts, profiles, admin (Supabase) ---------- */
const ACC={on:!!(window.Backend&&Backend.enabled),user:null,profile:null,admin:false,config:{},users:[],lib:null};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>{if(!v)return '—';const d=new Date(v);return isNaN(d)?'—':d.toLocaleString(LANG==='he'?'he-IL':LANG==='ar'?'ar':LANG,{dateStyle:'medium',timeStyle:'short'})};
const initials=n=>{const s=String(n||'?').trim();return s?s[0].toUpperCase():'?'};
function avatarFor(p){
  if(p&&p.avatar_url)return p.avatar_url;
  const n=(p&&(p.display_name||p.username||p.email))||'?',c=document.createElement('canvas');c.width=c.height=96;const g=c.getContext('2d');
  g.fillStyle='#0B0B0C';g.fillRect(0,0,96,96);g.fillStyle='#fff';g.font='600 44px IBM Plex Sans, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(initials(n),48,52);return c.toDataURL();
}
function authErr(e){const c=e&&e.code;return c==='login'?t('errLogin'):c==='confirm'?t('errConfirm'):c==='short'?t('errShort'):c==='user'?t('errUser'):c==='taken'?t('errUserTaken'):c==='closed'?t('signupClosed'):c==='curpass'?t('errCurPass'):t('errGeneric',{m:String(e&&e.message||e).slice(0,120)})}
function setMsg(el,text,err){el.textContent=text||'';el.classList.toggle('err',!!err)}

async function initAccount(){
  if(!ACC.on){renderAccount();return}
  try{ACC.config=await Backend.getConfig()}catch(e){}
  applyConfig();
  try{Backend.onConfig&&Backend.onConfig(c=>{ACC.config={...ACC.config,...c};applyConfig()})}catch(e){}
  await Backend.init(async(event,user)=>{
    if(event==='PASSWORD_RECOVERY'){openDlg('reset');}
    const changed=(user&&user.id)!==(ACC.user&&ACC.user.id);ACC.user=user;
    if(!user){ACC.profile=null;ACC.admin=false;ACC.lib=null;ACC.cred=null;renderAccount();applyConfig();renderCredits();if(changed)renderLib();return}
    if(changed||event==='USER_UPDATED'||event==='INITIAL'){await loadProfile(true);loadCloudLib()}
  });
}
async function loadProfile(touch){
  try{ACC.profile=await Backend.getProfile()}catch(e){ACC.profile=null}
  ACC.admin=!!(ACC.profile&&ACC.profile.role==='admin'&&!ACC.profile.blocked);
  if(touch&&ACC.profile){Backend.touch().catch(()=>{});const pl=ACC.profile.lang;if(pl&&!LANG_CHOSEN&&pl!==LANG)setLang(pl,false)}
  renderAccount();applyConfig();loadCredits(touch);
}
function myName(){const p=ACC.profile||{};return p.display_name||p.username||(ACC.user&&ACC.user.email)||'—'}
function renderAccount(){
  const on=ACC.on,user=ACC.user;
  $('#signInBtn').hidden=!on||!!user;$('#accBtn').hidden=!on||!user;$('#adminBtn').hidden=!ACC.admin;
  if(!user)return;
  const p=ACC.profile||{};
  $('#accImg').src=avatarFor(p);$('#accBtn').setAttribute('aria-label',t('account'));
  if(!pendingAvatar)$('#pImg').src=avatarFor(p);
  $('#pName').textContent=myName();$('#pUser').textContent=p.username?'@'+p.username:'';
  const rl=$('#pRole');rl.textContent=ACC.admin?t('roleAdmin'):t('roleUser');rl.classList.toggle('adm',ACC.admin);
  if(!$('#acc').contains(document.activeElement)){
    $('#pUname').value=p.username||'';$('#pNick').value=p.display_name||'';$('#pBio').value=p.bio||'';$('#pLang').value=p.lang||LANG;
  }
  const rows=[[t('username'),p.username?'@'+p.username:'—'],[t('email'),user.email||'—'],[t('role'),rl.textContent],[t('joined'),fmtDate(p.created_at||user.created_at)],[t('lastSeen'),fmtDate(p.last_seen)],[t('songsSaved'),String(p.songs??(ACC.lib?ACC.lib.length:0))],[t('seps'),String(p.seps??0)]];
  const dl=$('#pDl');dl.innerHTML='';for(const [k,v] of rows){const a=document.createElement('dt');a.textContent=k;const b=document.createElement('dd');b.textContent=v;dl.append(a,b)}
}

/* auth dialog */
let dlgMode='in';
function openDlg(mode){
  dlgMode=mode;const d=$('#authDlg');d.hidden=false;
  const sec={in:'#fIn',up:'#fUp',forgot:'#fForgot',reset:'#fReset'};
  for(const [m,sel] of Object.entries(sec))$(sel).hidden=m!==mode;
  $('#authTitle').textContent=mode==='in'?t('authIn'):mode==='up'?t('authUp'):mode==='forgot'?t('authForgot'):t('setNewPass');
  d.querySelectorAll('.amsg').forEach(el=>setMsg(el,''));
  const signupOpen=ACC.config.allow_signup!==false;$('#toUp').hidden=!signupOpen;
  setTimeout(()=>{const f=d.querySelector(sec[mode]+' input');f&&f.focus()},30);
}
function closeDlg(){$('#authDlg').hidden=true}
$('#signInBtn').onclick=()=>openDlg('in');
$('#gateIn').onclick=()=>openDlg('in');
$('#authClose').onclick=closeDlg;
$('#authDlg').addEventListener('click',e=>{if(e.target.id==='authDlg')closeDlg()});
$('#toUp').onclick=()=>openDlg('up');$('#toIn').onclick=()=>openDlg('in');$('#toForgot').onclick=()=>openDlg('forgot');$('#toIn2').onclick=()=>openDlg('in');
async function busyBtn(btn,fn){btn.disabled=true;try{await fn()}finally{btn.disabled=false}}
$('#fIn').addEventListener('submit',e=>{e.preventDefault();const m=$('#fIn .amsg');busyBtn(e.submitter||$('#fIn button[type=submit]'),async()=>{
  try{await Backend.signIn({email:$('#inEmail').value.trim(),password:$('#inPass').value});$('#inPass').value='';closeDlg()}catch(err){setMsg(m,authErr(err),true)}})});
$('#fUp').addEventListener('submit',e=>{e.preventDefault();const m=$('#fUp .amsg');
  const username=$('#upUser').value.trim(),email=$('#upEmail').value.trim(),p1=$('#upPass').value,p2=$('#upPass2').value;
  if(p1!==p2)return setMsg(m,t('errMismatch'),true);
  if(ACC.config.allow_signup===false)return setMsg(m,t('signupClosed'),true);
  busyBtn(e.submitter||$('#fUp button[type=submit]'),async()=>{
    try{const r=await Backend.signUp({username,email,password:p1});$('#upPass').value=$('#upPass2').value='';
      if(r.needsConfirm)setMsg(m,t('checkEmail',{e:email}),false);else closeDlg()}catch(err){setMsg(m,authErr(err),true)}})});
$('#fForgot').addEventListener('submit',e=>{e.preventDefault();const m=$('#fForgot .amsg');busyBtn(e.submitter||$('#fForgot button[type=submit]'),async()=>{
  try{await Backend.sendReset($('#fgEmail').value.trim());setMsg(m,t('resetSent'))}catch(err){setMsg(m,authErr(err),true)}})});
$('#fReset').addEventListener('submit',e=>{e.preventDefault();const m=$('#fReset .amsg'),p1=$('#rsPass').value,p2=$('#rsPass2').value;
  if(p1!==p2)return setMsg(m,t('errMismatch'),true);
  busyBtn(e.submitter||$('#fReset button[type=submit]'),async()=>{try{await Backend.setPassword(p1);setMsg(m,t('passChanged'));setTimeout(closeDlg,1200)}catch(err){setMsg(m,authErr(err),true)}})});

/* profile */
let pendingAvatar=null;
$('#pFile').addEventListener('change',async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const bm=await createImageBitmap(f);const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
    const sz=Math.min(bm.width,bm.height);g.drawImage(bm,(bm.width-sz)/2,(bm.height-sz)/2,sz,sz,0,0,256,256);
    pendingAvatar=await new Promise(r=>c.toBlob(r,'image/jpeg',0.86));$('#pImg').src=URL.createObjectURL(pendingAvatar);setMsg($('#pMsg'),'')}
  catch(err){setMsg($('#pMsg'),t('saveFail'),true)}
});
$('#pRm').onclick=()=>{pendingAvatar='remove';$('#pImg').src=avatarFor({...ACC.profile,avatar_url:''})};
$('#pForm').addEventListener('submit',e=>{e.preventDefault();const m=$('#pMsg');busyBtn($('#pSave'),async()=>{
  try{
    const patch={display_name:$('#pNick').value.trim().slice(0,40),bio:$('#pBio').value.trim().slice(0,280),lang:$('#pLang').value};
    const un=$('#pUname').value.trim();if(un!==(ACC.profile&&ACC.profile.username||''))patch.username=un;
    if(pendingAvatar==='remove')patch.avatar_url='';
    else if(pendingAvatar){setMsg(m,t('uploading'));patch.avatar_url=await Backend.uploadAvatar(pendingAvatar)}
    ACC.profile=await Backend.updateProfile(patch)||{...ACC.profile,...patch};pendingAvatar=null;setMsg(m,t('saved'));
    renderAccount();if(patch.lang!==LANG)setLang(patch.lang,true);
  }catch(err){setMsg(m,authErr(err),true)}})});
$('#fEmail').addEventListener('submit',e=>{e.preventDefault();const m=$('#fEmail .amsg');busyBtn($('#fEmail button'),async()=>{
  try{await Backend.changeEmail($('#chEmail').value.trim());setMsg(m,t('emailSent'))}catch(err){setMsg(m,authErr(err),true)}})});
$('#fPass').addEventListener('submit',e=>{e.preventDefault();const m=$('#fPass .amsg'),p1=$('#chNew').value,p2=$('#chNew2').value;
  if(p1!==p2)return setMsg(m,t('errMismatch'),true);
  busyBtn($('#fPass button'),async()=>{try{await Backend.changePassword($('#chCur').value,p1);$('#fPass').reset();setMsg(m,t('passChanged'))}catch(err){setMsg(m,authErr(err),true)}})});
$('#signOutBtn').onclick=async()=>{await Backend.signOut();$('#acc').hidden=true};
$('#accBtn').onclick=()=>{renderAccount();$('#chEmail').value='';$('#acc').hidden=false};
$('#accClose').onclick=()=>$('#acc').hidden=true;

/* site settings, gates */
function applyConfig(){
  const c=ACC.config||{};
  const ttl=(c.title||'').trim();document.querySelector('.mark .wm').textContent=ttl||'CHORD ROOM';document.title=ttl||'Chord Room';
  const ann=(c.announce||'').trim();$('#banner').hidden=!ann;$('#bannerT').textContent=ann;
  if(c.lang&&I[c.lang]&&!LANG_CHOSEN&&!(ACC.profile&&ACC.profile.lang)&&c.lang!==LANG)setLang(c.lang,false);
  $('#blocked').hidden=!(ACC.profile&&ACC.profile.blocked);
  $('#gate').hidden=!(ACC.on&&c.require_login&&!ACC.user);
  renderStemsUI();renderCredits();
}
const cfgOn=k=>ACC.admin||(ACC.config||{})[k]!==false;
$('#adminBtn').onclick=()=>{fillSettings();fillBilling();ACC.admUser=null;ACC.songsAll=null;$('#admin').hidden=false;loadUsers()};
$('#adminClose').onclick=()=>$('#admin').hidden=true;
function fillSettings(){const c=ACC.config||{};$('#cTitle').value=c.title||'';$('#cAnn').value=c.announce||'';$('#cLang').value=c.lang||'he';$('#cAi').checked=c.ai!==false;$('#cDl').checked=c.dl!==false;$('#cReq').checked=!!c.require_login;$('#cSign').checked=c.allow_signup!==false;setMsg($('#cMsg'),'')}
$('#cSave').onclick=()=>busyBtn($('#cSave'),async()=>{
  const c={...ACC.config,title:$('#cTitle').value.trim(),announce:$('#cAnn').value.trim(),lang:$('#cLang').value,ai:$('#cAi').checked,dl:$('#cDl').checked,require_login:$('#cReq').checked,allow_signup:$('#cSign').checked};
  try{await Backend.saveConfig(c);ACC.config=c;applyConfig();setMsg($('#cMsg'),t('saved'))}catch(e){setMsg($('#cMsg'),t('saveFail'),true)}});
async function loadUsers(){try{ACC.users=await Backend.adminUsers()}catch(e){ACC.users=[]}try{ACC.dlAll=await Backend.adminDownloads()}catch(e){ACC.dlAll=[]}renderAdmin()}
$('#uSearch').addEventListener('input',()=>renderAdmin());
const CLOUD_IC='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/></svg>';
const fmtMB=b=>b?(b/1048576).toFixed(1)+' MB':'—';
const mbCell=b=>`<span dir="ltr" class="ltr">${fmtMB(b)}</span>`;
const ltr=x=>`<span dir="ltr" class="ltr">${esc(x)}</span>`;
function keyCell(pc,mode){if(pc==null)return '—';const a={pc,mode},c=camOf(a);return `<span class="kb" style="background:${camColor(c.n,c.l)}"><b>${c.n}${c.l}</b><i>${esc(keyText(a))}</i></span>`}
ACC.admView='users';
function renderAdmin(){
  if(!ACC.admin||$('#admin').hidden)return;
  const M=ACC.users||[],wk=Date.now()-7*864e5,dl=ACC.dlAll||[];
  const k=[[t('statUsers'),M.length],[t('statSongs'),M.reduce((a,m)=>a+(m.songs||0),0)],[t('downloadsL'),dl.length],[t('statActive'),M.filter(m=>new Date(m.last_seen).getTime()>wk).length]];
  $('#kpis').innerHTML=k.map(([a,b])=>`<div class="kpi"><div class="k">${esc(a)}</div><div class="v">${b}</div></div>`).join('');
  document.querySelectorAll('#admTabs button').forEach(b=>{const on=b.dataset.v===ACC.admView&&!ACC.admUser;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on))});
  $('#admUsers').hidden=ACC.admView!=='users'||!!ACC.admUser;
  const setSec=$('#cTitle').closest('.asec');const bSec=$('#bOn');if(setSec)setSec.hidden=!!ACC.admUser||ACC.admView==='songs';$('#admSongs').hidden=ACC.admView!=='songs'||!!ACC.admUser;$('#admUser').hidden=!ACC.admUser;
  renderPayEvents();
  if(ACC.admUser){renderAdminUser();return}
  if(ACC.admView==='songs'){renderAdminSongs();return}
  const dlc={};for(const d of dl)dlc[d.user_id]=(dlc[d.user_id]||0)+1;
  const q=$('#uSearch').value.trim().toLowerCase();
  const rows=M.filter(m=>!q||[m.username,m.display_name,m.email].some(x=>String(x||'').toLowerCase().includes(q)));
  const body=$('#uBody');body.innerHTML='';
  if(!rows.length){body.innerHTML=`<tr><td colspan="10" class="snote">${esc(t('noUsers'))}</td></tr>`;return}
  rows.forEach(m=>{
    const tr=document.createElement('tr'),isMe=ACC.user&&m.id===ACC.user.id,adm=m.role==='admin';
    tr.innerHTML=`<td><div class="u"><img alt=""><div style="min-width:0"><div class="t"></div><div class="e"></div></div></div></td><td><span class="pill ${adm?'adm':''}">${esc(adm?t('roleAdmin'):t('roleUser'))}</span></td><td>${esc(fmtDate(m.created_at))}</td><td>${esc(fmtDate(m.last_seen))}</td><td class="mono">${m.songs||0}</td><td class="mono">${dlc[m.id]||0}</td><td class="mono">${m.seps||0}</td><td class="mono">${m.credits??0}${m.plan&&m.plan!=='free'?` · ${esc(planName(m.plan))}`:''}</td><td><span class="pill ${m.blocked?'bad':''}">${esc(m.blocked?t('blockedS'):t('active'))}</span></td><td class="acts"></td>`;
    tr.querySelector('img').src=avatarFor(m);
    tr.querySelector('.t').textContent=(m.display_name||m.username||'—')+(isMe?` (${t('you')})`:'');
    tr.querySelector('.e').innerHTML=[m.username?ltr('@'+m.username):'',m.email?ltr(m.email):''].filter(Boolean).join(' · ');
    const acts=tr.querySelector('.acts');
    const b0=document.createElement('button');b0.type='button';b0.className='btn solid';b0.textContent=t('details');b0.onclick=()=>{ACC.admUser=m;renderAdmin();loadAdminUser(m)};acts.append(b0);
    if(!isMe){
      const b1=document.createElement('button');b1.type='button';b1.className='btn ghost';b1.textContent=adm?t('removeAdmin'):t('makeAdmin');
      b1.onclick=()=>busyBtn(b1,async()=>{try{await Backend.adminSetRole(m.id,adm?'user':'admin');await loadUsers()}catch(e){console.warn(e)}});
      const b2=document.createElement('button');b2.type='button';b2.className='btn '+(m.blocked?'solid':'ghost');b2.textContent=m.blocked?t('unblock'):t('block');
      b2.onclick=()=>busyBtn(b2,async()=>{try{await Backend.adminSetBlocked(m.id,!m.blocked);await loadUsers()}catch(e){console.warn(e)}});
      acts.append(b1,b2);
    }
    body.appendChild(tr);
  });
}
function songRows(list,withUser){
  const users={};for(const m of ACC.users||[])users[m.id]=m;
  if(!list.length)return `<tr><td colspan="9" class="snote">${esc(t('noSongs'))}</td></tr>`;
  return list.map((r,i)=>{const u=users[r.user_id]||{};return `<tr>
    <td><div class="sn"></div></td>${withUser?`<td class="usr">${ltr(u.username?'@'+u.username:(u.email||'—'))}</td>`:''}
    <td class="gen"></td><td class="mono">${r.bpm!=null?Math.round(r.bpm):'—'}</td><td>${keyCell(r.key_pc,r.key_mode)}</td>
    <td class="mono">${r.duration?fmtS(+r.duration):'—'}</td><td class="mono">${mbCell(r.file_size)}</td><td>${esc(fmtDate(r.created_at||r.updated_at))}</td>
    <td class="acts">${r.file_path?`<button type="button" class="btn ghost" data-dl="${i}">${esc(t('dlFile'))}</button><button type="button" class="btn ghost" data-op="${i}">${esc(t('dOpen'))}</button>`:`<span class="snote">${esc(t('noFile'))}</span>`}</td></tr>`}).join('');
}
function wireSongRows(tbody,list){
  tbody.querySelectorAll('tr').forEach((tr,i)=>{const r=list[i];if(!r)return;const sn=tr.querySelector('.sn');sn.textContent=r.name;sn.title=r.name;tr.querySelector('.gen').textContent=r.genre||'—'});
  tbody.querySelectorAll('[data-dl]').forEach(b=>b.onclick=()=>busyBtn(b,()=>adminDownloadFile(list[+b.dataset.dl])));
  tbody.querySelectorAll('[data-op]').forEach(b=>b.onclick=()=>busyBtn(b,()=>adminOpen(list[+b.dataset.op])));
}
async function loadAdminSongs(){try{ACC.songsAll=await Backend.adminSongs()}catch(e){ACC.songsAll=[]}renderAdmin()}
function renderAdminSongs(){
  const list=ACC.songsAll||[],q=$('#sSearch').value.trim().toLowerCase();
  const f=list.filter(r=>!q||[r.name,r.genre].some(x=>String(x||'').toLowerCase().includes(q)));
  const tot=list.reduce((a,r)=>a+(r.file_size||0),0);
  $('#sInfo').innerHTML=ltr(`${list.length} · ${fmtMB(tot)}`);
  const tb=$('#sBody');tb.innerHTML=songRows(f,true);wireSongRows(tb,f);
}
async function loadAdminUser(m){
  $('#udSongs').innerHTML=`<tr><td colspan="8" class="snote">${esc(t('dLoading'))}</td></tr>`;
  try{const [songs,dls]=await Promise.all([Backend.adminSongs(m.id),Backend.adminDownloads(m.id)]);if(ACC.admUser!==m)return;ACC.admUserSongs=songs;ACC.admUserDls=dls}catch(e){ACC.admUserSongs=[];ACC.admUserDls=[]}
  renderAdminUser();
}
function renderAdminUser(){
  const m=ACC.admUser,songs=ACC.admUserSongs||[],dls=ACC.admUserDls||[];
  $('#udImg').src=avatarFor(m);$('#udName').textContent=m.display_name||m.username||'—';
  $('#udMeta').innerHTML=[m.username?ltr('@'+m.username):'',m.email?ltr(m.email):''].filter(Boolean).join(' · ');
  const facts=[[t('role'),m.role==='admin'?t('roleAdmin'):t('roleUser')],[t('joined'),fmtDate(m.created_at)],[t('lastSeen'),fmtDate(m.last_seen)],[t('uploads'),String(songs.length)],[t('downloadsL'),String(dls.length)],[t('seps'),String(m.seps||0)],[t('colStatus'),m.blocked?t('blockedS'):t('active')]];
  facts.push([t('creditsCol'),String(m.credits??0)],[t('seePlans'),m.plan&&m.plan!=='free'?`${planName(m.plan)} · ${t('planUntil',{d:fmtDate(m.plan_until)})}`:t('planFreeL')]);
  $('#udFacts').innerHTML=facts.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  const ps=$('#udPlan');ps.innerHTML=['free',...BILL().plans.map(p=>p.id)].map(id=>`<option value="${esc(id)}">${esc(planName(id))}</option>`).join('');ps.value=m.plan||'free';
  [...$('#udMonths').options].forEach(o=>o.textContent=`${o.value} ${t('months')}`);
  $('#udBio').textContent=m.bio||'';$('#udBio').hidden=!m.bio;
  const tb=$('#udSongs');tb.innerHTML=songRows(songs,false);wireSongRows(tb,songs);
  $('#udDls').innerHTML=dls.length?dls.map(d=>`<tr><td class="sn2"></td><td class="mono">${Array.isArray(d.files)?d.files.length:0}</td><td class="mono">${mbCell(d.size)}</td><td>${esc(fmtDate(d.created_at))}</td></tr>`).join(''):`<tr><td colspan="4" class="snote">${esc(t('noDownloads'))}</td></tr>`;
  $('#udDls').querySelectorAll('tr').forEach((tr,i)=>{const c=tr.querySelector('.sn2');if(c&&dls[i])c.textContent=dls[i].song_name});
  $('#udAll').disabled=!songs.some(r=>r.file_path);
}
async function fetchSongFile(r){const url=await Backend.songFileUrl(r.file_path);return new Uint8Array(await (await fetch(url)).arrayBuffer())}
const fileNameOf=r=>`${String(r.name).replace(/[\\/:*?"<>|]/g,'_').slice(0,100)}.${(r.file_path.match(/\.([a-z0-9]+)$/i)||[,'mp3'])[1]}`;
async function adminDownloadFile(r){try{const d=await fetchSongFile(r);saveBlob(new Blob([d],{type:r.file_type||'audio/mpeg'}),fileNameOf(r))}catch(e){console.warn(e)}}
async function adminZip(list,label,msgEl){
  const withFile=list.filter(r=>r.file_path),files=[],used=new Set();
  for(let i=0;i<withFile.length;i++){
    msgEl.textContent=t('zipping',{n:i+1,t:withFile.length});
    const r=withFile[i],u=(ACC.users||[]).find(x=>x.id===r.user_id)||{};
    let n=(label?'':((u.username||'user')+'/'))+fileNameOf(r);while(used.has(n))n=n.replace(/(\.[^.]+)$/,'_$1');used.add(n);
    try{files.push({name:n,data:await fetchSongFile(r)})}catch(e){console.warn(e)}
    await tick();
  }
  if(!files.length){msgEl.textContent=t('noSongs');return}
  saveBlob(zip(files),`${label||'Chord Room'} - songs.zip`);msgEl.textContent=t('dlDone',{s:(files.reduce((a,f)=>a+f.data.length,0)/1048576).toFixed(1)});
}
async function adminOpen(r){
  try{busy(t('bCloud'),0.05);$('#admin').hidden=true;showView('tool');
    const d=await fetchSongFile(r);const buf=await ac().decodeAudioData(d.buffer);await analyze(buf,r.name,false,true);
    showNotice(t('adminOpened'));
  }catch(e){console.warn(e);busy(null)}
}
document.querySelectorAll('#admTabs button').forEach(b=>b.onclick=()=>{ACC.admView=b.dataset.v;ACC.admUser=null;if(b.dataset.v==='songs'&&!ACC.songsAll)loadAdminSongs();renderAdmin()});
$('#udBack').onclick=()=>{ACC.admUser=null;renderAdmin()};
$('#udAll').onclick=()=>busyBtn($('#udAll'),()=>adminZip(ACC.admUserSongs||[],ACC.admUser.username||'user',$('#udMsg')));
$('#sAll').onclick=()=>busyBtn($('#sAll'),()=>adminZip(ACC.songsAll||[],'',$('#sMsg')));
$('#sSearch').addEventListener('input',()=>renderAdmin());
/* cloud song library */
async function loadCloudLib(){
  if(!ACC.user)return;
  try{
    const cloud=await Backend.listSongs(),names=new Set(cloud.map(x=>x.name));
    for(const it of readLocal())if(!names.has(it.name)){try{await Backend.saveSong(it);cloud.push(it)}catch(e){break}}
    ACC.lib=cloud.sort((a,b)=>(b.saved||0)-(a.saved||0));
  }catch(e){ACC.lib=null}
  renderLib();renderAccount();
}
async function cloudSave(item){if(!ACC.user||ACC.lib===null)return;try{await Backend.saveSong(item);ACC.lib=[item,...ACC.lib.filter(x=>x.name!==item.name)];loadProfile(false)}catch(e){console.warn(e)}}
async function cloudDelete(name){if(!ACC.user||ACC.lib===null)return;try{await Backend.deleteSong(name);ACC.lib=ACC.lib.filter(x=>x.name!==name);loadProfile(false)}catch(e){console.warn(e)}}
/* ---------- points & plans ---------- */
const DEF_BILL={on:true,signup:20,costs:{sep:5,stems:2},currency:'ILS',contact:'',plans:[{id:'basic',price:29,points:60,link:''},{id:'pro',price:59,points:150,link:'',best:true},{id:'studio',price:99,points:400,link:''}]};
function BILL(){const b=(ACC.config&&ACC.config.billing)||{};return {...DEF_BILL,...b,costs:{...DEF_BILL.costs,...(b.costs||{})},plans:Array.isArray(b.plans)&&b.plans.length?b.plans:DEF_BILL.plans}}
// the points tables/functions not installed yet in Supabase → behave as before (free) instead of blocking everyone
const missingDb=e=>/does not exist|could not find|schema cache|PGRST20[0-9]|42703|42883/i.test(String((e&&(e.code||''))+' '+(e&&e.message||e)));
const billingOn=()=>ACC.on&&BILL().on!==false&&!ACC.credMissing;
const costOf=k=>+BILL().costs[k]||0;
ACC.cred=null;
async function loadCredits(refill){
  if(!ACC.on||!ACC.user){ACC.cred=null;renderCredits();return}
  try{if(refill)await Backend.refillCredits()}catch(e){}
  try{ACC.cred=await Backend.credits();ACC.credMissing=false}catch(e){console.warn(e);if(missingDb(e))ACC.credMissing=true}
  renderCredits();payReturn();
}
function planName(id){return t('plan_'+id)!=='plan_'+id?t('plan_'+id):id}
function renderCredits(){
  const c=ACC.cred,show=!!(ACC.user&&c&&billingOn());
  const chip=$('#creditsChip');if(chip){chip.hidden=!show;if(show){$('#creditsN').textContent=(c.credits||0).toLocaleString('en-US');chip.title=t('creditsBal')}}
  const box=$('#ptsBox');if(box){box.hidden=!show;if(show){$('#ptsN').textContent=c.credits||0;
    $('#ptsPlan').textContent=c.plan&&c.plan!=='free'?`${planName(c.plan)} · ${t('planUntil',{d:fmtDate(c.plan_until)})}`:t('planFreeL')}
    renderPayLine(show?c:null)}
  const ai=$('#aiCost');if(ai){const on=billingOn()&&!ACC.admin;ai.hidden=!on;ai.textContent=on?String(costOf('sep')):''}
  renderDlCost();
  if(!$('#pricingView').hidden)renderPricingPage();
}
function renderDlCost(){
  const el=$('#dlCost');if(!el)return;
  const stems=EXP.some(e=>expSel[e.id]&&expOk(e)&&(typeof e.st==='number'||e.st==='inst'));
  const on=billingOn()&&!ACC.admin&&stems&&!S.stemsPaid;el.hidden=!on;if(on)el.textContent=t('dlCostNote',{n:costOf('stems')});
}
function toast(msg,actions){
  const el=$('#toast');el.innerHTML='';const sp=document.createElement('span');sp.textContent=msg;el.append(sp);
  for(const [label,fn] of actions||[]){const b=document.createElement('button');b.type='button';b.className='btn ghost';b.textContent=label;b.onclick=()=>{el.hidden=true;fn()};el.append(b)}
  el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>{el.hidden=true},7000);
}
// may this user do a paid action right now? (the server checks again when charging)
async function payFor(kind){
  if(!billingOn()||ACC.admin)return true;
  if(!ACC.user){toast(t('needSignIn',{n:BILL().signup}),[[t('signIn'),()=>openDlg('up')]]);return false}
  if(!ACC.cred)await loadCredits(false);
  const need=costOf(kind),have=ACC.cred?ACC.cred.credits||0:0;
  if(have<need){toast(t('noPoints',{n:need,b:have}),[[t('seePlans'),()=>showView('pricing')]]);return false}
  return true;
}
// spend points now (the server sets the price). Returns false when refused, else {id} of the ledger row (null = free)
async function charge(kind,ref){
  if(!billingOn()||ACC.admin||!ACC.user)return {id:null};
  const n=costOf(kind);
  try{const r=await Backend.spendCredits(kind,String(ref||'').slice(0,200)),b=r&&r.balance;
    if(ACC.cred&&b!=null)ACC.cred.credits=b;renderCredits();if(r&&r.id)toast(t('charged',{n,b}));return {id:(r&&r.id)||null}}
  catch(e){if(missingDb(e)&&ACC.credMissing)return {id:null}; /* points not installed at all → free; anything else → refuse */if(e.code==='insufficient'){await loadCredits(false);toast(t('noPoints',{n,b:ACC.cred?ACC.cred.credits:0}),[[t('seePlans'),()=>showView('pricing')]])}else toast(t('chargeFail'));return false}
}
async function refund(pay){
  if(!pay||!pay.id)return;
  try{const b=await Backend.refundCredits(pay.id);if(ACC.cred&&b!=null)ACC.cred.credits=b;renderCredits();toast(t('refunded'))}catch(e){console.warn(e)}
}
function ledgerRef(r){
  if(!r.ref||r.reason==='refund')return '';
  if(r.reason==='payment'){const m=/^ls:(rf:)?(sub|inv|up):\S*\s*(\S*)\s*(upgrade)?/.exec(r.ref),test=/\(test\)\s*$/.test(r.ref)?' (test)':'';
    return m?(m[1]?t('payRefundL'):planName(m[3])+(m[4]?` · ${t('payUpgradeL')}`:''))+test:r.ref}
  const m=/^(sep|stems):\s*(.*)$/.exec(r.ref);return m?t('lk_'+m[1])+(m[2]?` · ${m[2]}`:''):r.ref;
}
async function renderLedger(ul,rows){
  ul.innerHTML='';if(!rows||!rows.length){ul.innerHTML=`<li class="snote">${esc(t('noLedger'))}</li>`;return}
  for(const r of rows){const li=document.createElement('li');li.innerHTML=`<span class="lr"></span><span class="lt snote"></span><b class="mono" dir="ltr"></b>`;
    const rf=ledgerRef(r);li.querySelector('.lr').textContent=t('lr_'+r.reason)+(rf?` · ${rf}`:'');li.querySelector('.lt').textContent=fmtDate(r.created_at);
    const d=li.querySelector('b');d.textContent=(r.delta>0?'+':'')+r.delta;d.classList.toggle('neg',r.delta<0);ul.appendChild(li)}
}
$('#creditsChip').onclick=()=>showView('pricing');
$('#ptsPlans').onclick=()=>{$('#acc').hidden=true;showView('pricing')};
$('#ptsBox').querySelector('details').addEventListener('toggle',async e=>{if(e.target.open){try{renderLedger($('#ptsLog'),await Backend.ledger(30))}catch(x){}}});
function pageState(){const c=ACC.cred||{};return {signedIn:!!ACC.user,plan:c.plan||'free',credits:c.credits||0,planUntil:c.plan_until||null,
  portal:portalUrl(c),payStatus:c.pay_status||null,renews:c.pay_renews||null}}
function renderPricingPage(){if(window.PAGES)PAGES.renderPricing($('#pricingView'),BILL(),pageState())}
function renderAboutPage(){if(window.PAGES)PAGES.renderAbout($('#aboutView'),BILL())}
function hookPages(){
  if(!window.PAGES||PAGES.__hooked)return;PAGES.__hooked=true;
  PAGES.onNav=v=>showView(v);
  PAGES.onSignup=()=>{if(ACC.on)openDlg('up')};
  PAGES.onSubscribe=id=>{
    const b=BILL(),p=b.plans.find(x=>x.id===id);
    if(p&&/^https:\/\//.test(p.link||'')){
      if(!ACC.user){if(ACC.on)openDlg('up');return}                       // the payment must know whose account to fill
      const c=ACC.cred||{};
      if(portalUrl(c)&&PAY_LIVE.includes(c.pay_status)){toast(t('payHaveSub'),[[t('payManage'),openPortal]]);return}   // change plan in the portal, not a 2nd subscription
      PAY.opened=Date.now();window.open(checkoutUrl(p.link,p.id),'_blank','noopener');return}
    const c=(b.contact||'').trim();
    if(c){toast(t('subNoLink',{c}),[contactAction(c)]);return}
    toast(t('subSoon'));
  };
  PAGES.onManage=openPortal;
}
// ── automatic payments: checkout link → Lemon Squeezy → webhook (functions/api/pay/webhook.js → pay_webhook in SQL)
const PAY={opened:0,polling:false,focusAt:0};
const PAY_LIVE=['active','on_trial','past_due','paused'];
function contactAction(c){return [/^https?:/.test(c)?c.replace(/^https?:\/\//,'').slice(0,40):c,()=>{location.href=/@/.test(c)&&!/^https?:/.test(c)?'mailto:'+c:c}]}
// the plan's checkout link + who is paying (Lemon Squeezy returns checkout[custom] in the webhook; other providers ignore it)
function checkoutUrl(link,planId){
  try{const u=new URL(link);for(const k of [...u.searchParams.keys()])if(/^checkout\[(custom\]\[(user_id|plan)|email)\]$/.test(k))u.searchParams.delete(k);
    const add=[['checkout[custom][user_id]',ACC.user.id],['checkout[custom][plan]',planId]];if(ACC.user.email)add.push(['checkout[email]',ACC.user.email]);
    u.search=(u.search.length>1?u.search.slice(1)+'&':'')+add.map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');return u.href}catch(e){return link}
}
// the portal link from the webhook is pre-signed for a limited time; once it has expired, open the plain portal (sign-in by email link)
function portalUrl(c){
  const v=c&&c.pay_portal;if(!v||!/^https:\/\//.test(v))return null;
  try{const u=new URL(v),exp=+u.searchParams.get('expires');if(exp&&exp*1000<Date.now()+60000)u.search='';return u.href}catch(e){return null}
}
function openPortal(){const u=portalUrl(ACC.cred);if(u)window.open(u,'_blank','noopener')}
function renderPayLine(c){
  const box=$('#ptsBox');if(!box)return;let el=$('#ptsPay');
  if(!el){el=document.createElement('div');el.id='ptsPay';el.className='snote';$('#ptsPlan').after(el)}
  const st=c&&c.pay_status;el.hidden=!st;el.textContent='';if(!st)return;
  const d=fmtDate(st==='cancelled'?c.plan_until:c.pay_renews);
  const k={active:'payRenews',on_trial:'payTrial',cancelled:'payCancelled',past_due:'payPastDue',paused:'payPaused'}[st]||'payEnded';
  const sp=document.createElement('span');sp.textContent=t(k,{d});el.append(sp);
  const u=portalUrl(c);if(u){const a=document.createElement('a');a.href=u;a.target='_blank';a.rel='noopener';a.textContent=t('payManage');el.append(' · ',a)}
}
// back from checkout (?paid=1): wait for the webhook to activate the plan
async function recentPayment(){try{const r=(await Backend.ledger(1))||[];return !!(r[0]&&r[0].reason==='payment'&&r[0].delta>0&&Date.now()-Date.parse(r[0].created_at)<15*60000)}catch(e){return false}}
function payReturn(){
  if(PAY.polling||!ACC.user||!ACC.cred||!/[?&]paid=1(&|$)/.test(location.search))return;
  const u=new URL(location.href);u.searchParams.delete('paid');history.replaceState(history.state,'',u.pathname+u.search+u.hash);
  PAY.polling=true;const c0={...ACC.cred},t0=Date.now();
  toast(t('payWait'));
  const done=()=>{PAY.polling=false;const c=ACC.cred||{};toast(t('payDone',{p:planName(c.plan||'free'),n:(c.credits||0).toLocaleString('en-US')}))};
  const tick=async()=>{
    await loadCredits(false);const c=ACC.cred||{};
    if((c.plan&&c.plan!==c0.plan)||(c.credits||0)>(c0.credits||0)||await recentPayment())return done();
    if(Date.now()-t0>=90000){PAY.polling=false;const ct=(BILL().contact||'').trim();toast(t('paySlow'),ct?[contactAction(ct)]:[]);return}
    setTimeout(tick,3000);
  };
  setTimeout(tick,3000);
}
// checkout was opened in another tab → refresh the balance when the user comes back to this one
window.addEventListener('focus',()=>{if(PAY.opened&&Date.now()-PAY.opened<30*60000&&Date.now()-PAY.focusAt>5000&&ACC.user&&!PAY.polling){PAY.focusAt=Date.now();loadCredits(false)}});
async function refreshAdmUser(){const m=ACC.admUser;if(!m)return;try{const u=(await Backend.adminUsers()).find(x=>x.id===m.id);if(u){Object.assign(m,u);ACC.users=ACC.users.map(x=>x.id===m.id?m:x)}}catch(e){}renderAdminUser();
  if($('#udCred details').open){try{renderLedger($('#udLog'),await Backend.adminLedger(m.id,50))}catch(e){}}}
$('#udGrant').onclick=()=>busyBtn($('#udGrant'),async()=>{const m=ACC.admUser,n=parseInt($('#udPts').value,10);if(!m||!n)return;
  try{const b=await Backend.adminGrantCredits(m.id,n,$('#udNote').value.trim());setMsg($('#udCredMsg'),t('grantDone',{b}));$('#udNote').value='';if(ACC.user&&m.id===ACC.user.id)loadCredits(false);await refreshAdmUser()}catch(e){setMsg($('#udCredMsg'),t('saveFail'),true)}});
$('#udPlanBtn').onclick=()=>busyBtn($('#udPlanBtn'),async()=>{const m=ACC.admUser;if(!m)return;
  try{await Backend.adminSetPlan(m.id,$('#udPlan').value,+$('#udMonths').value);setMsg($('#udCredMsg'),t('planDone'));if(ACC.user&&m.id===ACC.user.id)loadCredits(false);await refreshAdmUser()}catch(e){setMsg($('#udCredMsg'),t('saveFail'),true)}});
$('#udCred details').addEventListener('toggle',async e=>{if(e.target.open&&ACC.admUser){try{renderLedger($('#udLog'),await Backend.adminLedger(ACC.admUser.id,50))}catch(x){}}});
function fillBilling(){
  const b=BILL();$('#bOn').checked=b.on!==false;$('#bSignup').value=b.signup;$('#bContact').value=b.contact||'';$('#bSep').value=b.costs.sep;$('#bStems').value=b.costs.stems;
  $('#bPlans').innerHTML=b.plans.map((p,i)=>`<div class="bplan" data-i="${i}"><b>${esc(planName(p.id))}</b>
    <label><span>${esc(t('planPrice'))}</span><input type="number" min="0" step="1" data-f="price" value="${+p.price||0}"></label>
    <label><span>${esc(t('planPoints'))}</span><input type="number" min="0" step="1" data-f="points" value="${+p.points||0}"></label>
    <label class="wide"><span>${esc(t('planLink'))}</span><input type="url" dir="ltr" data-f="link" placeholder="https://" value="${esc(p.link||'')}"></label>
    <label><span>${esc(t('planVariant'))}</span><input type="text" inputmode="numeric" dir="ltr" data-f="variant" placeholder="123456" value="${esc(p.variant==null?'':p.variant)}"></label>
    <label class="best"><input type="radio" name="bBest" ${p.best?'checked':''}><span>${esc(t('planBest'))}</span></label></div>`).join('');
  setMsg($('#bMsg'),'');loadPayEvents();
}
// admin: the last webhook deliveries from the payment provider
async function loadPayEvents(){
  try{PAY.ev=await Backend.adminPayEvents(20)}catch(e){PAY.ev=null}   // null = table not installed yet
  renderPayEvents();
}
function renderPayEvents(){
  let box=$('#payEv');const rows=PAY.ev;
  if(!box){if(!rows)return;const bill=$('#bPlans').closest('.sgrid');if(!bill)return;box=document.createElement('div');box.id='payEv';bill.after(box)}
  box.hidden=!rows;if(!rows)return;const M=ACC.users||[];
  const who=id=>{if(!id)return '—';const m=M.find(x=>x.id===id);return m?(m.username||m.display_name||m.email||id.slice(0,8)):id.slice(0,8)};
  box.innerHTML=`<div class="bhead" style="margin-top:26px"><h3>${esc(t('payEvents'))}</h3></div><div class="tblw"><table class="ut st"><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('payEvCol'))}</th><th>${esc(t('payUserCol'))}</th><th>${esc(t('payResCol'))}</th></tr></thead><tbody></tbody></table></div>`;
  const tb=box.querySelector('tbody');
  if(!rows.length){tb.innerHTML=`<tr><td colspan="4" class="snote">${esc(t('payNone'))}</td></tr>`;return}
  for(const r of rows){const tr=document.createElement('tr');
    tr.innerHTML=`<td>${esc(fmtDate(r.created_at))}</td><td><span dir="ltr" class="mono"></span>${r.test?` <span class="pill">${esc(t('payTestL'))}</span>`:''}</td><td></td><td><span dir="ltr"></span></td>`;
    tr.querySelector('td:nth-child(2) span').textContent=r.event||'';tr.children[2].textContent=who(r.user_id);tr.querySelector('td:nth-child(4) span').textContent=r.result||'';tb.appendChild(tr)}
}
$('#bSave').onclick=()=>busyBtn($('#bSave'),async()=>{
  const b=BILL(),plans=[...document.querySelectorAll('#bPlans .bplan')].map((el,i)=>{const p=b.plans[i],f=k=>el.querySelector(`[data-f="${k}"]`).value;
    const v=f('variant').trim();
    return {id:p.id,price:Math.max(0,+f('price')||0),points:Math.max(0,parseInt(f('points'),10)||0),link:f('link').trim(),...(v?{variant:v}:{}),...(el.querySelector('.best input').checked?{best:true}:{})}});
  const billing={...b,on:$('#bOn').checked,signup:Math.max(0,parseInt($('#bSignup').value,10)||0),contact:$('#bContact').value.trim(),
    costs:{sep:Math.max(1,parseInt($('#bSep').value,10)||1),stems:Math.max(1,parseInt($('#bStems').value,10)||1)},plans};
  const bad=plans.find(p=>p.link&&!/^https:\/\//.test(p.link));if(bad){setMsg($('#bMsg'),t('planLink')+': https://',true);return}
  const badV=plans.find(p=>p.variant&&!/^\d{1,12}$/.test(p.variant));if(badV){setMsg($('#bMsg'),t('planVariant')+': 0-9',true);return}
  try{const c={...ACC.config,billing};await Backend.saveConfig(c);ACC.config=c;applyConfig();setMsg($('#bMsg'),t('saved'))}catch(e){setMsg($('#bMsg'),t('saveFail'),true)}});
function bumpSeps(){if(ACC.user)Backend.bumpSeps().then(()=>loadProfile(false)).catch(()=>{})}

/* ---------- discover: trending songs, catalog, DJ mix matches ---------- */
const DISC_GENRES=[[0,'dAll'],[-1,'gIsrael'],[132,'gPop'],[116,'gHiphop'],[113,'gDance'],[106,'gElectro'],[197,'gLatin'],[165,'gRnb'],[152,'gRock']];
const TOP_ISRAEL=1362507345;
const DC={tab:'trend',genre:0,rows:{},lists:{},keyF:'',bpmMin:'',bpmMax:'',queue:[],working:false,audio:null,playing:null,loaded:false,mixFor:null,pool:null};
const CACHE_K='chordroom.cat.v1';
const cacheRead=()=>{try{return JSON.parse(localStorage.getItem(CACHE_K)||'{}')}catch(e){return {}}};
const cacheWrite=c=>{try{localStorage.setItem(CACHE_K,JSON.stringify(c))}catch(e){}};
const camNum=(pc,mode)=>mode?CAM_MAJ[mod(pc+3,12)]:CAM_MAJ[pc];
const camOf=a=>a?{n:camNum(a.pc,a.mode),l:a.mode?'A':'B'}:null;
function camColor(n,l){const h=mod((n-1)*30+170,360);return l==='A'?`hsl(${h},55%,42%)`:`hsl(${h},62%,34%)`}
function keyText(a){const fl=FLAT_MAJ.has(a.mode?mod(a.pc+3,12):a.pc);return (fl?FLAT:SHARP)[a.pc]+(a.mode?'m':'')}
function chordText(c,a){if(c<0)return '';const fl=a&&FLAT_MAJ.has(a.mode?mod(a.pc+3,12):a.pc);return (fl?FLAT:SHARP)[c%12]+(c>=12?'m':'')}

/* Deezer through our proxy (production) or JSONP (local dev, no proxy) */
let dzMode=null;
async function dz(path,params){
  const q=new URLSearchParams(params||{}).toString();
  if(dzMode!=='jsonp'){
    try{const r=await fetch(`api/deezer/${path}${q?'?'+q:''}`);if(r.ok&&/json/.test(r.headers.get('content-type')||'')){dzMode='proxy';return await r.json()}}catch(e){}
    if(dzMode==='proxy')throw new Error('deezer');
    dzMode='jsonp';
  }
  return new Promise((ok,no)=>{const cb='__dz'+Math.random().toString(36).slice(2);const s=document.createElement('script');
    const done=()=>{delete window[cb];s.remove()};window[cb]=d=>{done();ok(d)};s.onerror=()=>{done();no(new Error('deezer'))};
    s.src=`https://api.deezer.com/${path}?${q}${q?'&':''}output=jsonp&callback=${cb}`;document.head.appendChild(s)});
}
function rowFromTrack(t,album){
  const id='dz:'+t.id;const r=DC.rows[id]||{id,ext:t.id,a:null,status:'idle',plays:0};
  Object.assign(r,{title:t.title_short||t.title,artist:(t.artist&&t.artist.name)||'',album:(album&&album.title)||(t.album&&t.album.title)||'',
    cover:(album&&album.cover_medium)||(t.album&&t.album.cover_medium)||r.cover||'',preview:t.preview||r.preview||'',link:t.link||r.link||'',
    release:(album&&album.release_date)||r.release||null,dur:t.duration||r.dur||0});
  return DC.rows[id]=r;
}
function rowFromCatalog(c){
  const r=DC.rows[c.id]||{id:c.id,ext:c.ext_id,status:'idle'};
  Object.assign(r,{title:c.title||r.title,artist:c.artist||r.artist,album:c.album||r.album,cover:c.cover||r.cover,link:c.link||r.link,release:c.release_date||r.release||null,dur:c.duration||r.dur,plays:c.plays,inCat:true,
    a:c.bpm!=null?{bpm:+c.bpm,pc:c.key_pc,mode:c.key_mode,chords:c.chords||[]}:r.a,added:c.created_at,full:!!c.is_full});
  if(r.a)r.status='done';
  return DC.rows[c.id]=r;
}
async function mergeKnown(rows){
  const cache=cacheRead();
  for(const r of rows)if(!r.a&&cache[r.id]){r.a=cache[r.id];r.status='done'}
  if(ACC.on){try{(await Backend.catalogGet(rows.map(r=>r.id))).forEach(rowFromCatalog)}catch(e){}}
}
async function loadTab(){
  const tab=DC.tab,key=tab+':'+DC.genre;setDiscMsg('');
  if(!DC.lists[key]){
    $('#dList').innerHTML=`<li class="dempty">${esc(t('dLoading'))}</li>`;
    try{
      let rows=[];
      if(tab==='trend'&&DC.genre===-1){const d=await dz(`playlist/${TOP_ISRAEL}/tracks`,{limit:60});rows=(d.data||[]).filter(x=>x.readable!==false).map(x=>rowFromTrack(x))}
      else if(tab==='new'&&DC.genre===-1){
        // newest songs in the Israeli chart, by album release date
        const d=await dz(`playlist/${TOP_ISRAEL}/tracks`,{limit:100});const tr=(d.data||[]).filter(x=>x.album&&x.album.id);
        const ids=[...new Set(tr.map(x=>x.album.id))],dates={};
        await Promise.all(ids.map(id=>dz(`album/${id}`).then(a=>{dates[id]=a.release_date||''}).catch(()=>{})));
        rows=tr.map(x=>rowFromTrack(x,{...x.album,release_date:dates[x.album.id]})).sort((p,q)=>String(q.release||'').localeCompare(String(p.release||''))).slice(0,40);
      }
      else if(tab==='trend'){const d=await dz(`chart/${DC.genre}/tracks`,{limit:50});rows=(d.data||[]).map(x=>rowFromTrack(x))}
      else if(tab==='new'){
        const d=await dz(`editorial/${DC.genre}/releases`,{limit:40});const albums=(d.data||[]).filter(a=>a.id);
        const firsts=await Promise.all(albums.map(a=>dz(`album/${a.id}/tracks`,{limit:1}).then(x=>x.data&&x.data[0]?rowFromTrack(x.data[0],a):null).catch(()=>null)));
        rows=firsts.filter(Boolean);
      }else{
        if(!ACC.on){rows=[]}else{const d=await Backend.catalogList(tab==='played'?'plays':'created_at',100);rows=d.map(rowFromCatalog)}
      }
      if(tab==='trend'||tab==='new')await mergeKnown(rows);
      DC.lists[key]=rows.map(r=>r.id);
    }catch(e){console.warn(e);DC.lists[key]=null;$('#dList').innerHTML=`<li class="dempty">${esc(t('dLoadFail'))}</li>`;return}
  }
  renderList();queueVisible();
}
function passesFilter(r){
  const a=r.a,kf=DC.keyF;
  if(kf){if(!a)return false;const c=camOf(a);
    if(kf==='match'){if(!S.key)return true;const ref={pc:mod(S.key.pc+S.transpose,12),mode:S.key.mode};if(camRel(camOf(ref),c)<0)return false;if(S.bpm&&bpmFit(ebpm(),a.bpm)>0.06)return false}
    else if(c.n+c.l!==kf)return false}
  if(DC.bpmMin&&(!a||a.bpm<+DC.bpmMin))return false;
  if(DC.bpmMax&&(!a||a.bpm>+DC.bpmMax))return false;
  return true;
}
function renderList(){
  const ids=DC.lists[DC.tab+':'+DC.genre]||[],ul=$('#dList');ul.innerHTML='';
  const rows=ids.map(id=>DC.rows[id]).filter(passesFilter);
  if(!rows.length){ul.innerHTML=`<li class="dempty">${esc((DC.tab==='played'||DC.tab==='recent')&&!ids.length?t('dEmptyCat'):t('dNoMatch'))}</li>`;return}
  rows.forEach((r,i)=>ul.appendChild(rowEl(r,i+1)));
}
function keyBadge(a,status){
  const s=document.createElement('span');s.className='kb';
  if(a){const c=camOf(a);s.style.background=camColor(c.n,c.l);s.innerHTML=`<b>${c.n}${c.l}</b><i>${esc(keyText(a))}</i>`}
  else{s.classList.add('pending');s.textContent=status==='err'?'—':status==='busy'?t('dAnalyzing'):'···'}
  return s;
}
function rowEl(r,n){
  const li=document.createElement('li');li.className='drow';li.dataset.id=r.id;
  const a=r.a,chips=a&&a.chords?a.chords.slice(0,4).map(c=>`<span>${esc(chordText(c,a))}</span>`).join(''):'';
  li.innerHTML=`<span class="dn mono">${n}</span><a class="dcl" target="_blank" rel="noopener" title="Deezer"><img class="dc" alt="" loading="lazy"></a><div class="dt"><div class="tt"></div><div class="ar"></div></div>
    <div class="dk"></div><span class="db mono">${a?Math.round(a.bpm):'—'}<small>BPM</small></span><div class="dch" dir="ltr">${chips}</div>
    <div class="da"><button type="button" class="ib pv" aria-label="${esc(t('dPreview'))}" title="${esc(t('dPreview'))}">${DC.playing===r.id?'❚❚':'▶'}</button>
    <button type="button" class="ib fl" title="${esc(t('fullPlayT'))}">${FULL_IC}<span>${esc(t('fullPlay'))}</span></button>
    <button type="button" class="ib mx" ${a?'':'disabled'}>${esc(t('dMix'))}</button><button type="button" class="ib op">${esc(t('dOpen'))}</button></div>`;
  li.querySelector('.dc').src=r.cover||'assets/icon.svg';if(r.link&&/^https:\/\/www\.deezer\.com\//.test(r.link))li.querySelector('.dcl').href=r.link;
  li.querySelector('.tt').textContent=r.title;li.querySelector('.ar').textContent=r.artist+(DC.tab==='played'&&r.plays?` · ${r.plays} ${t('dPlays')}`:'')+(DC.tab==='new'&&r.release?` · ${fmtDay(r.release)}`:'');
  li.querySelector('.dk').appendChild(keyBadge(a,r.status));if(r.full){const f=document.createElement('span');f.className='fulltag';f.textContent=t('fullTag');f.title=t('fullTagT');li.querySelector('.dk').appendChild(f)}
  li.querySelector('.fl').onclick=()=>openFull(r);
  li.querySelector('.pv').onclick=()=>togglePreview(r);
  li.querySelector('.mx').onclick=()=>openMix(r);
  li.querySelector('.op').onclick=()=>openInTool(r);
  return li;
}
// update a row in place (never replace it), so a click that is in progress is not lost
function refreshRow(r){
  const el=document.querySelector(`.drow[data-id="${CSS.escape(r.id)}"]`);if(!el)return;
  const a=r.a,dk=el.querySelector('.dk');dk.innerHTML='';dk.appendChild(keyBadge(a,r.status));
  if(r.full){const f=document.createElement('span');f.className='fulltag';f.textContent=t('fullTag');f.title=t('fullTagT');dk.appendChild(f)}
  el.querySelector('.db').innerHTML=`${a?Math.round(a.bpm):'—'}<small>BPM</small>`;
  el.querySelector('.dch').innerHTML=a&&a.chords?a.chords.slice(0,4).map(c=>`<span>${esc(chordText(c,a))}</span>`).join(''):'';
  el.querySelector('.mx').disabled=!a;el.querySelector('.pv').textContent=DC.playing===r.id?'❚❚':'▶';
}
function fmtDay(d){const x=new Date(d);return isNaN(x)?'':x.toLocaleDateString(LANG==='he'?'he-IL':LANG==='ar'?'ar':LANG,{day:'numeric',month:'short'})}
function setDiscMsg(m){$('#dMsg').textContent=m||''}

/* preview URLs expire; refresh from the track endpoint when needed */
async function freshPreview(r){
  if(r.preview&&!/exp=(\d+)/.test(r.preview))return r.preview;
  const exp=+((r.preview||"").match(/exp=(\d+)/)||[])[1]||0;
  if(r.preview&&exp*1000>Date.now()+60e3)return r.preview;
  const d=await dz(`track/${r.ext}`);r.preview=d.preview||'';return r.preview;
}

/* analysis of the 30 s preview: key, BPM and the opening chords */
async function quickAnalyze(buffer){
  const x=await toMono(buffer);
  const on=await computeOnset(x,()=>{});
  const chroma=await computeChroma(x,()=>{});
  const genv=new Float32Array(on.env.length);for(let i=0;i<genv.length;i++)genv[i]=on.env[i]+2*on.low[i];
  const g=fitGrid(genv,estimateTempo(on.env));
  const saved=S;let out;
  S={...saved,chroma,env:on.env,lowEnv:on.low,bpm:g.bpm,offset:g.offset,dur:buffer.duration,beats:[],chords:null,key:null,down:0};
  try{
    buildBeats();S.key=detectKey();S.chords=detectChords();refineKey();S.chords=detectChords();detectDownbeat();
    const prog=[];for(let b=S.down;b<S.chords.length&&prog.length<8;b++){const c=S.chords[b];if(c>=0&&c!==prog[prog.length-1])prog.push(c)}
    out={bpm:Math.round(S.bpm*10)/10,pc:S.key.pc,mode:S.key.mode,chords:prog};
  }finally{S=saved}
  return out;
}
function queueVisible(){
  const ids=DC.lists[DC.tab+':'+DC.genre]||[];
  for(const id of ids){const r=DC.rows[id];if(r&&!r.a&&r.status==='idle'&&r.ext){r.status='queued';DC.queue.push(r)}}
  pump();
}
async function pump(){
  if(DC.working)return;DC.working=true;
  try{
    while(DC.queue.length){
      if($('#discover').hidden){break}
      const r=DC.queue.shift();if(r.a){continue}
      r.status='busy';refreshRow(r);
      try{
        const url=await freshPreview(r);if(!url)throw new Error('no preview');
        const buf=await ac().decodeAudioData(await (await fetch(url)).arrayBuffer());
        r.a=await quickAnalyze(buf);r.status='done';
        const c=cacheRead();c[r.id]=r.a;cacheWrite(c);
        if(ACC.on&&ACC.user&&!r.inCat){Backend.catalogAdd({id:r.id,ext_id:r.ext,title:r.title.slice(0,300),artist:r.artist.slice(0,300),album:(r.album||'').slice(0,300),cover:r.cover||'',link:r.link||'',
          release_date:r.release||null,duration:r.dur||null,bpm:Math.min(300,Math.max(30,r.a.bpm)),key_pc:r.a.pc,key_mode:r.a.mode,chords:r.a.chords}).then(()=>{r.inCat=true}).catch(e=>console.warn(e))}
      }catch(e){console.warn(e);r.status='err'}
      refreshRow(r);if(DC.mixFor)renderMix();
      await tick();
    }
  }finally{DC.working=false}
}

/* preview player */
async function togglePreview(r){
  if(!DC.audio){DC.audio=new Audio();DC.audio.onended=()=>{const p=DC.playing;DC.playing=null;if(p&&DC.rows[p])refreshRow(DC.rows[p])}}
  const prev=DC.playing;
  if(prev===r.id){DC.audio.pause();DC.playing=null;refreshRow(r);return}
  if(P.playing)stop();
  try{DC.audio.src=await freshPreview(r);await DC.audio.play();DC.playing=r.id;if(ACC.on&&r.inCat)Backend.catalogPlay(r.id).catch(()=>{})}catch(e){setDiscMsg(t('dNoPreview'))}
  if(prev&&DC.rows[prev])refreshRow(DC.rows[prev]);refreshRow(r);
}
function stopPreview(){if(DC.audio){DC.audio.pause()}const p=DC.playing;DC.playing=null;if(p&&DC.rows[p])refreshRow(DC.rows[p])}
const FULL_IC='<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-1v-6h3M4 12v5a2 2 0 0 0 2 2h1v-6H4"/></svg>';
// Full songs play inside Deezer's official player: complete for listeners signed in to Deezer, 30 s otherwise.
function openFull(r){
  if(!r||!r.ext)return;stopPreview();if(P.playing)stop();
  const bar=$('#fullbar'),dark=document.documentElement.dataset.themeResolved==='dark';
  $('#fullFrame').src=`https://widget.deezer.com/widget/${dark?'dark':'light'}/track/${encodeURIComponent(r.ext)}?autoplay=true&tracklist=false`;
  $('#fullTitle').textContent=`${r.title} — ${r.artist}`;bar.hidden=false;document.body.classList.add('hasbar');
  if(ACC.on&&r.inCat)Backend.catalogPlay(r.id).catch(()=>{});
  DC.fullFor=r;
}
function closeFull(){$('#fullFrame').src='about:blank';$('#fullbar').hidden=true;document.body.classList.remove('hasbar');DC.fullFor=null}
$('#fullClose').onclick=closeFull;
async function openInTool(r){
  stopPreview();setDiscMsg(t('dLoading'));
  try{
    const buf=await ac().decodeAudioData(await (await fetch(await freshPreview(r))).arrayBuffer());
    setDiscMsg('');showView('tool');await analyze(buf,`${r.artist} – ${r.title}`,false,true);
    S.catRef=r;showNotice(t('dPreviewNote'),[[t('fullPlay'),()=>openFull(r),FULL_IC],[t('uploadFullBtn'),()=>$('#file').click()]]);
    if(ACC.on&&r.inCat)Backend.catalogPlay(r.id).catch(()=>{});
  }catch(e){console.warn(e);setDiscMsg(t('dNoPreview'))}
}

/* DJ mix matches: Camelot neighbours + tempo within 6 % (half/double time counts) */
function camRel(a,b){if(!a||!b)return -1;if(a.n===b.n&&a.l===b.l)return 0;if(a.n===b.n)return 1;if(a.l===b.l){const d=mod(b.n-a.n,12);if(d===1)return 2;if(d===11)return 3}return -1}
function bpmFit(a,b){if(!a||!b)return 1;return Math.min(...[b,b*2,b/2].map(x=>Math.abs(x-a)/a))}
async function openMix(r){
  DC.mixFor=r;$('#mix').hidden=false;
  if(!DC.pool&&ACC.on){try{(await Backend.catalogList('plays',1000)).forEach(rowFromCatalog)}catch(e){}DC.pool=true}
  renderMix();
}
function renderMix(){
  const r=DC.mixFor;if(!r||!r.a)return;const c=camOf(r.a);
  $('#mixHead').innerHTML='';const h=$('#mixHead');
  const b=keyBadge(r.a);h.append(b);const tt=document.createElement('div');tt.innerHTML=`<div class="tt"></div><div class="ar"></div>`;
  tt.querySelector('.tt').textContent=r.title;tt.querySelector('.ar').textContent=`${r.artist} · ${Math.round(r.a.bpm)} BPM`;h.append(tt);
  const relName=[t('relSame'),t('relRel'),t('relUp'),t('relDown')];
  const cands=Object.values(DC.rows).filter(x=>x!==r&&x.a).map(x=>({x,rel:camRel(c,camOf(x.a)),fit:bpmFit(r.a.bpm,x.a.bpm)}))
    .filter(o=>o.rel>=0&&o.fit<=0.06).sort((p,q)=>p.rel-q.rel||p.fit-q.fit).slice(0,40);
  const ul=$('#mixList');ul.innerHTML='';
  if(!cands.length){ul.innerHTML=`<li class="dempty">${esc(t('mixNone'))}</li>`;return}
  for(const o of cands){
    const li=document.createElement('li');li.className='mrow';
    li.innerHTML=`<img alt="" loading="lazy"><div class="dt"><div class="tt"></div><div class="ar"></div></div><span class="rel"></span><button type="button" class="ib pv">▶</button>`;
    li.querySelector('img').src=o.x.cover||'assets/icon.svg';li.querySelector('.tt').textContent=o.x.title;
    li.querySelector('.ar').textContent=`${o.x.artist} · ${Math.round(o.x.a.bpm)} BPM`+(o.fit>0.005?` · ±${Math.max(1,Math.round(o.fit*100))}%`:'');
    li.insertBefore(keyBadge(o.x.a),li.querySelector('.rel'));li.querySelector('.rel').textContent=relName[o.rel];
    li.querySelector('.pv').onclick=()=>togglePreview(o.x);
    ul.appendChild(li);
  }
}
$('#mixClose').onclick=()=>{$('#mix').hidden=true;DC.mixFor=null};

/* views */
const VIEWS={tool:['#toolView','#navTool'],discover:['#discover','#navDisc'],dj:['#djView','#navDj'],pricing:['#pricingView','#navPricing'],about:['#aboutView','#navAbout']};
function showView(v,anchor){
  if(!VIEWS[v])v='tool';
  for(const k in VIEWS){const [sec,nav]=VIEWS[k];$(sec).hidden=k!==v;$(nav).classList.toggle('on',k===v)}
  const d=v==='discover',j=v==='dj';
  if(v!=='tool'&&P.playing)stop();
  if(d){if(!DC.loaded){DC.loaded=true;renderDiscControls();loadTab()}else{renderList();pump()}}
  else{stopPreview();if(v==='tool')requestAnimationFrame(()=>{sizeCanvases();dirty=true})}
  if(window.DJ)j?DJ.show():DJ.hide();
  if(v==='pricing')renderPricingPage();
  if(v==='about')renderAboutPage();
  try{history.replaceState(null,'',v==='tool'?location.pathname+location.search:'#'+(anchor||v))}catch(e){}
  const tgt=anchor&&document.getElementById(anchor);
  if(tgt)requestAnimationFrame(()=>tgt.scrollIntoView({block:'start'}));else window.scrollTo(0,0);
}
function renderDiscControls(){
  const tabs=[['trend','dTrend'],['new','dNew'],['played','dPlayed'],['recent','dRecent']];
  $('#dTabs').innerHTML='';tabs.forEach(([k,l])=>{const b=document.createElement('button');b.type='button';b.textContent=t(l);b.classList.toggle('on',DC.tab===k);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(DC.tab===k));b.onclick=()=>{DC.tab=k;renderDiscControls();loadTab()};$('#dTabs').appendChild(b)});
  const gOk=DC.tab==='trend'||DC.tab==='new';$('#dGenres').hidden=!gOk;$('#dGenres').innerHTML='';
  DISC_GENRES.forEach(([id,name])=>{const b=document.createElement('button');b.type='button';b.textContent=t(name);if(id===-1)b.classList.add('il');b.classList.toggle('on',DC.genre===id);b.onclick=()=>{DC.genre=id;renderDiscControls();loadTab()};$('#dGenres').appendChild(b)});
  const sel=$('#dKey'),cur=DC.keyF;sel.innerHTML=`<option value="">${esc(t('dAllKeys'))}</option><option value="match">${esc(t('dMatchCur'))}</option>`;
  for(let n=1;n<=12;n++)for(const l of ['A','B']){const pc=l==='B'?CAM_MAJ.indexOf(n):mod(CAM_MAJ.indexOf(n)-3,12);const o=document.createElement('option');o.value=n+l;o.textContent=`${n}${l} · ${keyText({pc,mode:l==='A'?1:0})}`;sel.appendChild(o)}
  sel.value=cur;
}
$('#dKey').onchange=e=>{DC.keyF=e.target.value;renderList()};
$('#dBpmMin').oninput=e=>{DC.bpmMin=e.target.value;renderList()};
$('#dBpmMax').oninput=e=>{DC.bpmMax=e.target.value;renderList()};
$('#navDisc').onclick=()=>showView('discover');
$('#navTool').onclick=()=>showView('tool');
$('#navDj').onclick=()=>showView('dj');
$('#navPricing').onclick=()=>showView('pricing');
$('#navAbout').onclick=()=>showView('about');
$('#findMatches').onclick=()=>{DC.keyF='match';showView('discover');renderDiscControls();renderList()};
const viewOfHash=()=>{const h=location.hash.slice(1);return h==='about-a11y'?'about':VIEWS[h]?h:'tool'};
const routeHash=()=>{const h=location.hash.slice(1);showView(viewOfHash(),h==='about-a11y'?h:null)};
window.addEventListener('hashchange',routeHash);

/* ---------- events ---------- */
async function loadFile(file){
  if(!file)return;
  const name=file.name.replace(/\.[^.]+$/,'');
  try{busy(t('bReading'),0.01);const ab=await file.arrayBuffer();const buf=await ac().decodeAudioData(ab);
    const saved=readLib().find(x=>x.name===name);
    setSaveState('');
    await analyze(buf,name,false);S.genre=(saved&&saved.genre)||'';
    if(saved&&Math.abs(saved.dur-buf.duration)<0.5)restoreSaved(saved);
    storeUpload(file,name);
  }catch(e){console.error(e);busy(null);showNotice(t('readErr'))}
}
const songKeyOf=name=>{let h=2166136261;for(const ch of name){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0}return 's'+h.toString(36)+'-'+Math.min(40,name.length)};
function setSaveState(st){const el=$('#saveState');if(!el)return;el.className='sst '+st;el.hidden=!st;
  el.querySelector('span').textContent=st==='saving'?t('savingCloud'):st==='saved'?t('savedCloud'):st==='fail'?t('saveCloudFail'):''}
async function storeUpload(file,name){
  if(!ACC.on||!ACC.user||file.size>50*1024*1024)return;
  setSaveState('saving');
  try{
    const meta=await Backend.uploadSongFile(file,songKeyOf(name));
    if(S.name!==name)return;
    S.fileMeta=meta;saveLib();setSaveState('saved');
    lookupGenre(name).then(g=>{if(g&&S.name===name){S.genre=g;saveLib()}});
  }catch(e){console.warn(e);if(S.name===name)setSaveState('fail')}
}
// genre from Deezer's catalogue, matched by the file name (best effort)
async function lookupGenre(name){
  try{
    const q=normTok(name).slice(0,8).join(' ');if(!q)return '';
    const r=await dz('search',{q,limit:1});const tr=r&&r.data&&r.data[0];if(!tr||!tr.album)return '';
    const tt=normTok(tr.title);if(!tt.length||!tt.every(w=>q.includes(w)))return '';
    const al=await dz(`album/${tr.album.id}`);const g=al&&al.genres&&al.genres.data&&al.genres.data[0];
    return g?g.name:'';
  }catch(e){return ''}
}
$('#file').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value=''});
$('#upLbl').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#file').click()}});
$('#play').onclick=toggle;
$('#lang').onchange=e=>setLang(e.target.value,true);
function setLang(l,chosen){if(!I[l])return;LANG=l;if(typeof applyTheme==='function')setTimeout(applyTheme);if(chosen){LANG_CHOSEN=true;try{localStorage.setItem('chordroom.lang',LANG)}catch(x){}}applyLang();renderAll();renderLib();renderAccount();renderAdmin();renderCredits();renderFmt();renderExport();if(window.DJ)DJ.lang();if(window.PAGES)PAGES.lang();if(typeof DC!=='undefined'&&DC.loaded){renderDiscControls();renderList();if(DC.mixFor)renderMix()}}
const ZOOMS=[2,3,4,6,8,12,16,24,32];
const zoom=d=>{const i=ZOOMS.indexOf(S.win);S.win=ZOOMS[Math.max(0,Math.min(ZOOMS.length-1,i+d))];dirty=true};
$('#zIn').onclick=()=>zoom(-1);$('#zOut').onclick=()=>zoom(1);
$('#bpmD').onclick=()=>{if(S.bpm*2<=300){S.bpm*=2;regrid()}};
$('#bpmH').onclick=()=>{if(S.bpm/2>=40){S.bpm/=2;regrid()}};
$('#gL').onclick=()=>{S.offset-=0.01;regrid()};
$('#gR').onclick=()=>{S.offset+=0.01;regrid()};
$('#gBar').onclick=()=>{S.down=(S.down+1)%4;renderSheet();saveLibSoon();dirty=true};
document.querySelectorAll('[data-wm]').forEach(b=>b.onclick=()=>{S.wmode=b.dataset.wm;buildOverview();renderStats()});
document.querySelectorAll('[data-dg]').forEach(b=>b.onclick=()=>{S.diag=b.dataset.dg;renderStats();renderChips();lastBeat=-2;dirty=true});
document.querySelectorAll('[data-acc]').forEach(b=>b.onclick=()=>{S.acc=+b.dataset.acc;renderAll()});
const setT=d=>{const v=d===0?0:Math.max(-12,Math.min(12,S.transpose+d));if(v===S.transpose)return;S.transpose=v;renderAll();applyFx();saveLibSoon()};
const setRate=r=>{if(!S.bpm)return;r=Math.max(0.5,Math.min(2,r));if(Math.abs(r-1)<1e-4)r=1;if(r===S.rate)return;S.rate=r;renderStats();applyFx();saveLibSoon()};
const nudgeBpm=d=>{if(!S.bpm)return;const cur=ebpm(),step=Math.abs(d)<1?Math.round(cur*10)/10:Math.round(cur);setRate((Math.abs(cur-step)>1e-3&&Math.sign(step-cur)===Math.sign(d)?step:step+d)/S.bpm)};
$('#trM').onclick=()=>setT(-1);$('#trP').onclick=()=>setT(1);
$('#kyM').onclick=()=>setT(-1);$('#kyP').onclick=()=>setT(1);
$('#tmM').onclick=e=>nudgeBpm(e.shiftKey?-0.1:-1);$('#tmP').onclick=e=>nudgeBpm(e.shiftKey?0.1:1);
{const bi=$('#sBpm');
  const commit=()=>{const v=parseFloat(String(bi.value).replace(',','.'));if(S.bpm&&isFinite(v)&&v/S.bpm>=0.25&&v/S.bpm<=4)setRate(v/S.bpm);renderStats()};
  let fresh=false; // select everything on focus so typing replaces the number (mouseup would drop the selection)
  bi.addEventListener('focus',()=>{if(bi.readOnly)return;bi.select();fresh=true});
  bi.addEventListener('mouseup',e=>{if(fresh){e.preventDefault();fresh=false}});
  bi.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();bi.blur()}
    else if(e.key==='Escape'){bi.value='';bi.blur()}
    else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();nudgeBpm((e.key==='ArrowUp'?1:-1)*(e.shiftKey?0.1:1));bi.value=fmtBpm(Math.round(ebpm()*100)/100);bi.select()}});
  bi.addEventListener('blur',()=>{if(!bi.readOnly&&bi.value!=='')commit();else renderStats()});
}
const setC=d=>{S.capo=Math.max(0,Math.min(9,S.capo+d));renderAll()};
$('#cpM').onclick=()=>setC(-1);$('#cpP').onclick=()=>setC(1);
function loopToggle(){
  if(S.loop){S.loop=null}else if(S.beats.length){const T=60/S.bpm,b=beatAt(now()),bs=Math.max(0,b-mod(b-S.down,4)),ls=S.beats[bs]??0;S.loop={ls,le:Math.min(S.dur,ls+S.loopBars*4*T)}}
  renderLoop();restart();dirty=true;
}
$('#loopBtn').onclick=loopToggle;
document.querySelectorAll('[data-lb]').forEach(b=>b.onclick=()=>{S.loopBars=+b.dataset.lb;if(S.loop){const T=60/S.bpm;S.loop.le=Math.min(S.dur,S.loop.ls+S.loopBars*4*T);restart()}renderLoop();dirty=true});
$('#clickBtn').onclick=()=>{S.click=!S.click;$('#clickBtn').classList.toggle('on',S.click)};
$('#aiBtn').onclick=aiSeparate;$('#cancelBtn').onclick=()=>cancelSep(false);
$('#dlBtn').onclick=download;
$('#editBtn').onclick=()=>{S.editing=!S.editing;$('#pop').hidden=true;renderSheet()};
$('#libBtn').onclick=()=>{renderLib();$('#lib').hidden=false};$('#libClose').onclick=()=>$('#lib').hidden=true;
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;
  if(!$('#djView').hidden)return; // the DJ view has its own keys
  if(e.key!=='Escape'&&(!$('#authDlg').hidden||!$('#acc').hidden||!$('#admin').hidden||!$('#discover').hidden))return;
  const onBtn=e.target.closest('button,label');
  if(e.code==='Space'){if(onBtn)return;e.preventDefault();toggle()}
  else if(e.key==='ArrowRight'){e.preventDefault();seek(now()+60/(S.bpm||120)*4)}
  else if(e.key==='ArrowLeft'){e.preventDefault();seek(now()-60/(S.bpm||120)*4)}
  else if(/^Digit[1-8]$/.test(e.code)){cueHit(+e.code.slice(5)-1,e.shiftKey)}
  else if(e.key==='l'||e.key==='L'){loopToggle()}
  else if(e.key==='m'||e.key==='M'){S.click=!S.click;$('#clickBtn').classList.toggle('on',S.click)}
  else if(e.key==='+'||e.key==='='){zoom(-1)}else if(e.key==='-'){zoom(1)}
  else if(e.key==='Escape'){$('#pop').hidden=true;$('#mix').hidden=true;$('#lib').hidden=true;$('#acc').hidden=true;$('#admin').hidden=true;$('#authDlg').hidden=true}
});
ov.addEventListener('pointerdown',e=>{if(!S.dur)return;const r=ov.getBoundingClientRect();seek((e.clientX-r.left)/r.width*S.dur)});
let drag=null;
zm.addEventListener('pointerdown',e=>{if(!S.dur)return;zm.setPointerCapture(e.pointerId);drag={x:e.clientX,t:now(),was:P.playing};if(P.playing)stop();zm.classList.add('drag')});
zm.addEventListener('pointermove',e=>{if(!drag)return;const r=zm.getBoundingClientRect();P.pos=Math.max(0,Math.min(S.dur,drag.t-(e.clientX-drag.x)/r.width*S.win));dirty=true});
const endDrag=()=>{if(!drag)return;zm.classList.remove('drag');const w=drag.was;drag=null;if(S.loop&&(P.pos<S.loop.ls||P.pos>S.loop.le)){S.loop=null;renderLoop()}if(w)play()};
zm.addEventListener('pointerup',endDrag);zm.addEventListener('pointercancel',endDrag);
zm.addEventListener('wheel',e=>{if(!S.dur)return;e.preventDefault();if(Math.abs(e.deltaY)>Math.abs(e.deltaX))zoom(e.deltaY>0?1:-1);else seek(now()+e.deltaX/400*S.win)},{passive:false});
let dd=0;
window.addEventListener('dragenter',e=>{if($('#djView')&&!$('#djView').hidden)return;if([...e.dataTransfer.types].includes('Files')){dd++;$('#drop').hidden=false}});
window.addEventListener('dragleave',()=>{dd=Math.max(0,dd-1);if(!dd)$('#drop').hidden=true});
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>{e.preventDefault();dd=0;$('#drop').hidden=true;if($('#djView')&&!$('#djView').hidden)return;const f=e.dataTransfer.files[0];if(f)loadFile(f)});
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{sizeCanvases();renderMixer()},120)});

/* ---------- theme (light / dark) ---------- */
const mqDark=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
function resolvedTheme(){const t=document.documentElement.dataset.theme;return t==='dark'||t==='light'?t:(mqDark&&mqDark.matches?'dark':'light')}
function applyTheme(){const r=resolvedTheme();document.documentElement.dataset.themeResolved=r;$('#themeBtn').title=r==='dark'?t('themeLight'):t('themeDark');$('#themeBtn').setAttribute('aria-label',$('#themeBtn').title)}
$('#themeBtn').onclick=()=>{const next=resolvedTheme()==='dark'?'light':'dark';document.documentElement.dataset.theme=next;try{localStorage.setItem('chordroom.theme',next)}catch(e){}applyTheme();renderChips();lastBeat=-2;dirty=true};
if(mqDark&&mqDark.addEventListener)mqDark.addEventListener('change',()=>{applyTheme();dirty=true});
document.addEventListener('a11y-change',()=>{applyMono();buildOverview();dirty=true;if(window.DJ&&DJ.redraw)DJ.redraw()});
/* ---------- bridge for the DJ view (assets/dj.js) ---------- */
window.CR={
  t,$,esc,tick,mod,ac,applyLang,getLang:()=>LANG,addStrings:tb=>{for(const k in tb)Object.assign(I[k],tb[k])},
  analyzeTrack,synthDemo,loadScript,SS_SRC,sliceRange,saveBlob,wav,fmtS,fmtBpm,showNotice,wcol,
  camelot,camOf,camRel,bpmFit,camColor,keyText,keyBadge,CAM_MAJ,HC_COL,SHARP,FLAT,FLAT_MAJ,
  readLib,libItem:name=>readLib().find(x=>x.name===name)||null,ACC,DC,dz,freshPreview,rowFromCatalog,
  signedIn:()=>!!(ACC.on&&ACC.user),
  songFileUrl:p=>Backend.songFileUrl(p),
  toolSong:()=>S.buffer&&S.bpm&&S.key&&S.wave?{name:S.demo?t('demoName'):S.name,buffer:S.buffer,bpm:S.bpm,offset:S.offset,down:S.down,key:S.key,wave:S.wave,lufs:S.lufs,peak:S.peak,dur:S.dur}:null,
  stopTool:()=>{if(P.playing)stop();stopPreview()}
};
/* ---------- boot ---------- */
applyTheme();applyLang();sizeCanvases();renderAll();renderFmt();renderExport();renderCredits();requestAnimationFrame(loop);initAccount();
// pages.js / a11y.js / shell.js are loaded after this file → wire them and route deep links once all scripts ran
document.addEventListener('DOMContentLoaded',()=>{hookPages();if(location.hash.length>1)routeHash()});
(async()=>{try{busy(t('bDemo'),0.01);const buf=await synthDemo();await analyze(buf,t('demoName'),true)}catch(e){console.error(e);busy(null)}})();
})();
