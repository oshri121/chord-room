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
let LANG='he';let LANG_CHOSEN=false;
try{const s=localStorage.getItem('chordroom.lang');if(s&&I[s]){LANG=s;LANG_CHOSEN=true}}catch(e){}
function t(k,v){let s=(I[LANG][k]??I.en[k]??k);if(v)for(const x in v)s=s.replace('{'+x+'}',v[x]);return s}
function applyLang(){
  const rtl=LANG==='he'||LANG==='ar';
  document.documentElement.lang=LANG;document.documentElement.dir=rtl?'rtl':'ltr';
  document.querySelectorAll('[data-i]').forEach(el=>{el.textContent=t(el.dataset.i)});
  document.querySelectorAll('[data-ip]').forEach(el=>{el.placeholder=t(el.dataset.ip)});
  $('#lang').value=LANG;
  $('#play').setAttribute('aria-label',t('kPlay'));
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
const STEMS=[{id:'vocals',file:'Vocals',color:'#D6336C'},{id:'drums',file:'Drums',color:'#D99A0B'},{id:'bass',file:'Bass',color:'#1F6FEB'},{id:'other',file:'Other',color:'#169A57'}];
const S={name:'',buffer:null,dur:0,wave:null,chroma:null,env:null,lowEnv:null,bpm:0,offset:0,beats:[],chords:null,down:0,key:null,
  transpose:0,capo:0,acc:0,win:8,demo:false,stems:null,stemKind:null,edited:new Set(),cues:new Array(8).fill(null),lufs:null,peak:null,
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
  if(c<0)return '<svg viewBox="0 0 100 122"><text class="txt" x="50" y="66" text-anchor="middle" font-size="13" fill="#A3A3A8" font-family="IBM Plex Mono,monospace">N.C.</text></svg>';
  const f=[...SHAPES[c>=12?1:0][c%12]].map(ch=>ch==='x'?-1:+ch);
  const fr=f.filter(v=>v>0),maxF=Math.max(0,...fr),minF=fr.length?Math.min(...fr):0,base=maxF>4?minF:1;
  const x0=20,x1=84,y0=30,fh=17,sx=i=>x0+i*(x1-x0)/5;
  let s=`<svg viewBox="0 0 100 122" role="img" aria-label="${chordName(c,true)}">`;
  for(let i=0;i<6;i++)s+=`<line class="fg" x1="${sx(i)}" y1="${y0}" x2="${sx(i)}" y2="${y0+5*fh}" stroke="#0B0B0C" stroke-width="1.1"/>`;
  for(let j=0;j<=5;j++)s+=`<line class="fg" x1="${x0}" y1="${y0+j*fh}" x2="${x1}" y2="${y0+j*fh}" stroke="#0B0B0C" stroke-width="${j===0&&base===1?4:1.1}"/>`;
  if(base>1)s+=`<text class="txt" x="${x0-6}" y="${y0+fh*0.72}" text-anchor="end" font-size="11" font-family="IBM Plex Mono,monospace" fill="#0B0B0C">${base}</text>`;
  f.forEach((v,i)=>{if(v<0)s+=`<text class="txt" x="${sx(i)}" y="${y0-8}" text-anchor="middle" font-size="12" fill="#6D6D72">×</text>`;else if(v===0)s+=`<circle class="fg" cx="${sx(i)}" cy="${y0-12}" r="4" fill="none" stroke="#0B0B0C" stroke-width="1.3"/>`});
  const fp=f.findIndex(v=>v>=0);let barre=false;
  if(minF>0&&f[fp]===minF&&f[5]===minF){barre=true;const y=y0+(minF-base+.5)*fh;s+=`<rect class="dot" x="${sx(fp)-6}" y="${y-6}" width="${sx(5)-sx(fp)+12}" height="12" rx="6" fill="#0B0B0C"/>`}
  f.forEach((v,i)=>{if(v>0&&!(barre&&v===minF)){const y=y0+(v-base+.5)*fh;s+=`<circle class="dot" cx="${sx(i)}" cy="${y}" r="6.3" fill="#0B0B0C"/>`}});
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
function sliceRange(w,i0,i1){let a=0,lo=0,mi=0,hi=0,bi=i0;for(let i=i0;i<i1;i++){if(w.amp[i]>a){a=w.amp[i];bi=i}if(w.low[i]>lo)lo=w.low[i];if(w.mid[i]>mi)mi=w.mid[i];if(w.high[i]>hi)hi=w.high[i]}return [a,lo,mi,hi,bi]}
function drawWave(g,cols,cy,amp){
  if(S.wmode==='3band'){
    const band=(k,color,sc)=>{g.fillStyle=color;g.beginPath();for(const c of cols){const h=Math.max(.5,c[k]*amp*sc);g.rect(c[0],cy-h,1,2*h)}g.fill()};
    band(2,'#1E62D0',1);band(3,'#E08A1E',.85);band(4,'#F2EFE6',.7);return;
  }
  if(S.wmode==='blue'){
    g.fillStyle='#2A7FFF';g.beginPath();for(const c of cols){const h=Math.max(.5,c[1]*amp);g.rect(c[0],cy-h,1,2*h)}g.fill();
    g.fillStyle='rgba(255,255,255,.55)';g.beginPath();for(const c of cols){const h=Math.max(.5,c[1]*amp*.45);g.rect(c[0],cy-h,1,2*h)}g.fill();return;
  }
  const col=S.wave.col;
  for(const c of cols){const h=Math.max(.5,c[1]*amp),j=c[5]*3;g.fillStyle=`rgb(${col[j]},${col[j+1]},${col[j+2]})`;g.fillRect(c[0],cy-h,1,2*h)}
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
  }else if(S.dur){g.fillStyle='#6d6d72';g.font=`${12*dpr}px IBM Plex Mono, monospace`;g.textAlign='center';g.fillText('— no audio —',W/2,wh/2+4*dpr)}
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
let actx=null;const P={srcs:[],gains:[],playing:false,startCtx:0,startPos:0,pos:0,loop:null};
const ac=()=>actx||(actx=new (window.AudioContext||window.webkitAudioContext)());
const MIX=STEMS.map(()=>({vol:1,mute:false,solo:false}));
function stemGain(i){const any=MIX.some(m=>m.solo),m=MIX[i];return any?(m.solo?m.vol:0):(m.mute?0:m.vol)}
function applyGains(){P.gains.forEach((g,i)=>{if(g)g.gain.setTargetAtTime(stemGain(i),ac().currentTime,0.012)})}
function now(){
  if(!P.playing)return P.pos;
  let tt=P.startPos+Math.max(0,ac().currentTime-P.startCtx);
  if(P.loop){const {ls,le}=P.loop;if(P.startPos<le&&tt>=le)tt=ls+mod(tt-ls,le-ls);return tt}
  if(tt>=S.dur){stop();P.pos=S.dur;return S.dur}
  return tt;
}
function play(){
  if(!S.buffer)return;const c=ac();c.resume();
  if(P.pos>=S.dur-0.05)P.pos=0;
  const when=c.currentTime+0.03;P.loop=S.loop?{...S.loop}:null;
  const mk=(buf,gv)=>{const s=c.createBufferSource();s.buffer=buf;const g=c.createGain();g.gain.value=gv;s.connect(g).connect(c.destination);
    if(P.loop){s.loop=true;s.loopStart=P.loop.ls;s.loopEnd=Math.min(P.loop.le,buf.duration)}
    s.start(when,Math.min(P.pos,buf.duration-0.001));return [s,g]};
  if(S.stems){const r=S.stems.map((b,i)=>mk(b,stemGain(i)));P.srcs=r.map(x=>x[0]);P.gains=r.map(x=>x[1])}
  else{const r=mk(S.buffer,1);P.srcs=[r[0]];P.gains=[]}
  P.startCtx=when;P.startPos=P.pos;P.playing=true;lastClick=P.pos-0.001;setIcon();
}
function stop(){if(!P.playing)return;P.pos=now();P.playing=false;P.srcs.forEach(x=>{try{x.stop()}catch(e){}});P.srcs=[];P.gains=[];setIcon()}
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
  for(let b=b0;b<S.beats.length&&S.beats[b]<=tt+0.12;b++){
    if(S.beats[b]<=lastClick)continue;
    const at=c.currentTime+(S.beats[b]-tt);if(at<c.currentTime-0.01)continue;
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
  $('#sBpm').textContent=S.bpm?fmtBpm(S.bpm):'—';$('#sBpmS').textContent=S.bpm?'4/4':'';
  if(S.key){const pc=mod(S.key.pc+S.transpose,12);$('#sKey').textContent=keyName(pc,S.key.mode);$('#sKeyS').textContent=keyLong(pc,S.key.mode);$('#sCam').textContent=camelot(pc,S.key.mode)}
  else{$('#sKey').textContent='—';$('#sKeyS').textContent='';$('#sCam').textContent='—'}
  $('#sDur').textContent=S.dur?fmtS(S.dur):'—';
  $('#sLufs').textContent=S.lufs!=null?S.lufs.toFixed(1):'—';$('#sPeak').textContent=S.lufs!=null?`LUFS · peak ${S.peak.toFixed(1)} dB`:'';
  $('#trV').textContent=(S.transpose>0?'+':'')+S.transpose;$('#cpV').textContent=S.capo;
  $('#capoH').textContent=S.capo?t('capoN',{n:S.capo}):t('capo0');
  document.querySelectorAll('[data-acc]').forEach(b=>b.classList.toggle('on',+b.dataset.acc===S.acc));
  document.querySelectorAll('[data-dg]').forEach(b=>b.classList.toggle('on',b.dataset.dg===S.diag));
  document.querySelectorAll('[data-wm]').forEach(b=>b.classList.toggle('on',b.dataset.wm===S.wmode));
  const can=!!S.chroma;['#bpmD','#bpmH','#gL','#gR'].forEach(s=>$(s).disabled=!can);
  $('#play').disabled=!S.buffer;
  renderHarm();renderLoop();renderCues();
  $('#clickBtn').classList.toggle('on',S.click);
}
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
  if(tm!==lastT||dirty){drawZoom(tm);drawOverview(tm);$('#time').innerHTML=`${fmt(tm)} <span>/ ${fmtS(S.dur)}</span>`;updateNow(tm);lastT=tm;dirty=false}
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

/* ---------- analysis pipeline ---------- */
function busy(msg,p){const o=$('#busy');if(msg===null){o.hidden=true;return}o.hidden=false;$('#busyMsg').textContent=msg;$('#busyBar').style.width=Math.round(p*100)+'%'}
async function analyze(buffer,name,demo){
  stop();P.pos=0;cancelSep(true);
  Object.assign(S,{name,buffer,dur:buffer.duration,demo,transpose:0,capo:0,chords:null,beats:[],key:null,wave:null,chroma:null,stems:null,stemKind:null,
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
  if(!demo)saveLib();
}
function recompute(){S.key=detectKey();S.chords=detectChords();refineKey();S.chords=detectChords();detectDownbeat();S.edited=new Set();renderAll();dirty=true}
function regrid(){buildBeats();S.chords=detectChords();detectDownbeat();S.edited=new Set();S.loop=null;restart();renderAll();saveLibSoon();dirty=true}

async function synthDemo(){
  const sr=44100,T=0.5,lead=0.3,barsN=16,dur=lead+barsN*4*T+1;
  const oc=new OfflineAudioContext(2,Math.ceil(dur*sr),sr);
  const master=oc.createGain();master.gain.value=0.55;master.connect(oc.destination);
  const nb=oc.createBuffer(1,sr,sr),nd=nb.getChannelData(0);for(let i=0;i<sr;i++)nd[i]=Math.random()*2-1;
  const mtof=m=>440*Math.pow(2,(m-69)/12);
  const prog=[[57,60,64,45],[53,57,60,41],[55,60,64,48],[55,59,62,43]];
  for(let i=0;i<barsN;i++){
    const ch=prog[i%4],t0=lead+i*4*T,t1=t0+4*T;
    const lp=oc.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1700;lp.connect(master);
    for(const m of ch.slice(0,3))for(const det of [-6,6]){
      const o=oc.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=det;
      const g=oc.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(0.035,t0+0.03);g.gain.setValueAtTime(0.035,t1-0.06);g.gain.linearRampToValueAtTime(0,t1);
      o.connect(g).connect(lp);o.start(t0);o.stop(t1+0.02);
    }
    for(let k=0;k<4;k++){
      const tb=t0+k*T;
      const b=oc.createOscillator();b.type='triangle';b.frequency.value=mtof(ch[3]);
      const bg=oc.createGain();bg.gain.setValueAtTime(0.0001,tb);bg.gain.exponentialRampToValueAtTime(0.4,tb+0.01);bg.gain.exponentialRampToValueAtTime(0.001,tb+0.42);
      b.connect(bg).connect(master);b.start(tb);b.stop(tb+0.45);
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



/* ---------- stems ---------- */
const AI={w:null,ready:false,ep:'',busy:false,job:0};
let quickW=null;
function renderStemsUI(){
  const gpu=!!navigator.gpu;
  $('#engine').textContent=AI.ready?(AI.ep==='webgpu'?t('engGpu'):t('engCpu')):(gpu?t('engGpu'):t('engCpu'));
  const running=AI.busy;
  const aiOk=typeof cfgOn!=='function'||cfgOn('ai');
  $('#aiBtn').disabled=!S.buffer||running||S.stemKind==='ai'||!aiOk;
  $('#quickBtn').disabled=!S.buffer||running||!!S.stems;
  $('#cancelBtn').hidden=!running;
  if(!running){const n=$('#snote');n.classList.remove('err');n.textContent=!S.buffer?t('needAudio'):S.stemKind==='ai'?t('aiDone'):S.stemKind==='quick'?t('quickDone'):t('aiFirst')}
  if(!aiOk&&!running){$('#snote').textContent=t('offByAdmin')}
  renderMixer();renderExport();
}
function renderMixer(){
  const box=$('#mixer');box.innerHTML='';
  STEMS.forEach((st,i)=>{
    const m=MIX[i],on=!!S.stems;
    const d=document.createElement('div');d.className='strip'+(on?'':' off');
    d.innerHTML=`<div class="tp"><span class="nm"><span class="sw" style="background:${st.color}"></span>${t(st.id)}</span>
      <span class="ms">${i===0?`<button type="button" class="k" title="${t('karaoke')}" ${on?'':'disabled'}>K</button>`:''}<button type="button" class="m${m.mute?' on':''}" ${on?'':'disabled'}>M</button><button type="button" class="s${m.solo?' on':''}" ${on?'':'disabled'}>S</button></span></div>
      <canvas></canvas><input type="range" dir="ltr" id="vol-${st.id}" min="0" max="1.5" step="0.01" value="${m.vol}" aria-label="${t(st.id)}" ${on?'':'disabled'}>`;
    d.querySelector('.m').onclick=()=>{m.mute=!m.mute;applyGains();renderMixer()};
    d.querySelector('.s').onclick=()=>{m.solo=!m.solo;applyGains();renderMixer()};
    const k=d.querySelector('.k');if(k)k.onclick=()=>{MIX.forEach(x=>{x.solo=false});MIX[0].mute=!MIX[0].mute;applyGains();renderMixer()};
    d.querySelector('input').oninput=e=>{m.vol=+e.target.value;applyGains()};
    box.appendChild(d);
    const cv=d.querySelector('canvas');requestAnimationFrame(()=>drawStem(cv,i,st.color));
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
  S.stemKind=kind;S.notes=null;if(was)play();
}
const fmtEta=s=>s>=90?Math.round(s/60)+' '+t('min_'):Math.max(5,Math.round(s/5)*5)+' '+t('sec_');
async function aiSeparate(){
  if(!S.buffer||AI.busy)return;
  AI.busy=true;const job=++AI.job;renderStemsUI();
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
    setStems(res,len,'ai');sepEnd(null);bumpSeps();
  }catch(e){
    console.error(e);if(job!==AI.job)return;
    if(AI.w){AI.w.terminate();AI.w=null;AI.ready=false}
    sepEnd(t('aiErr',{m:String(e.message||e).slice(0,80)}),true);
  }
}
const AI_BYTES=78767446;
const QUICK_SRC=`
function makeFFT(n){const cos=new Float64Array(n/2),sin=new Float64Array(n/2),rev=new Uint32Array(n);
for(let i=0;i<n/2;i++){cos[i]=Math.cos(2*Math.PI*i/n);sin[i]=Math.sin(2*Math.PI*i/n)}
const bits=Math.log2(n);for(let i=0;i<n;i++){let r=0,x=i;for(let b=0;b<bits;b++){r=(r<<1)|(x&1);x>>=1}rev[i]=r}
return (re,im)=>{for(let i=0;i<n;i++){const j=rev[i];if(j>i){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
for(let size=2;size<=n;size<<=1){const half=size>>1,step=n/size;for(let i=0;i<n;i+=size){for(let j=i,k=0;j<i+half;j++,k+=step){
const l=j+half,tr=re[l]*cos[k]+im[l]*sin[k],ti=-re[l]*sin[k]+im[l]*cos[k];re[l]=re[j]-tr;im[l]=im[j]-ti;re[j]+=tr;im[j]+=ti}}}}}
function med(a,n){for(let i=1;i<n;i++){const v=a[i];let j=i-1;while(j>=0&&a[j]>v){a[j+1]=a[j];j--}a[j+1]=v}return a[n>>1]}
self.onmessage=e=>{
 const L=e.data.L,R=e.data.R,sr=e.data.sr,N=4096,HOP=1024,B=N/2+1,D=6,K=2*D+1,FK=6,FW=2*FK+1;
 const len=L.length,pad=N,frames=Math.ceil((len+pad)/HOP)+1,total=frames*HOP+N;
 const w=new Float64Array(N);for(let i=0;i<N;i++)w[i]=Math.sqrt(0.5-0.5*Math.cos(2*Math.PI*i/N));
 const fft=makeFFT(N),out=[0,1,2].map(()=>[new Float32Array(total),new Float32Array(total)]);
 const rZr=[],rZi=[],rS=[],rC=[];for(let j=0;j<K;j++){rZr.push(new Float64Array(N));rZi.push(new Float64Array(N));rS.push(new Float32Array(B));rC.push(new Float32Array(B))}
 const re=new Float64Array(N),im=new Float64Array(N),yr=new Float64Array(N),yi=new Float64Array(N),tmp=new Float32Array(K),tf=new Float32Array(FW);
 const wb=new Float32Array(B),wv=new Float32Array(B);
 for(let k=0;k<B;k++){const f=k*sr/N;
  wb[k]=f<=150?1:f>=300?0:0.5+0.5*Math.cos(Math.PI*(f-150)/150);
  wv[k]=f<=120?0:f<220?(f-120)/100:f<=9000?1:f>=13000?0:1-(f-9000)/4000;}
 const M=[new Float32Array(B),new Float32Array(B),new Float32Array(B)];
 for(let f=0;f<frames+D;f++){
  const slot=f%K;
  if(f<frames){
   const off=f*HOP-pad;
   for(let i=0;i<N;i++){const s=off+i;const inb=s>=0&&s<len;re[i]=inb?L[s]*w[i]:0;im[i]=inb?R[s]*w[i]:0}
   fft(re,im);rZr[slot].set(re);rZi[slot].set(im);
   const S=rS[slot],C=rC[slot];
   for(let k=0;k<B;k++){const kn=(N-k)%N,a=re[k],b=im[k],c=re[kn],d=im[kn];
    const xlr=(a+c)/2,xli=(b-d)/2,xrr=(b+d)/2,xri=(c-a)/2,mr=(xlr+xrr)/2,mi=(xli+xri)/2,mm=mr*mr+mi*mi;
    S[k]=Math.sqrt(mm);C[k]=4*mm/(2*(xlr*xlr+xli*xli+xrr*xrr+xri*xri)+1e-12)}
  }else{rS[slot].fill(0)}
  const t=f-D;if(t<0)continue;if(t>=frames)break;
  const ts=t%K,St=rS[ts],Ct=rC[ts];
  for(let k=0;k<B;k++){
   for(let j=0;j<K;j++)tmp[j]=rS[j][k];const H=med(tmp,K);
   for(let j=0;j<FW;j++){const q=k-FK+j;tf[j]=q>=0&&q<B?St[q]:0}const P=med(tf,FW);
   const h2=H*H,p2=P*P,mp=p2/(h2+p2+1e-12),mh=1-mp;
   const c=Math.min(1,Ct[k]),c6=c*c*c*c*c*c;
   M[1][k]=mp;M[2][k]=mh*wb[k];M[0][k]=mh*(1-wb[k])*wv[k]*c6;
  }
  const Zr=rZr[ts],Zi=rZi[ts],pos=t*HOP;
  for(let s=0;s<3;s++){
   const m=M[s];
   for(let k=0;k<N;k++){const mk=m[k<B?k:N-k];yr[k]=Zr[k]*mk;yi[k]=-Zi[k]*mk}
   fft(yr,yi);
   const oL=out[s][0],oR=out[s][1],g=0.5/N;
   for(let i=0;i<N;i++){oL[pos+i]+=yr[i]*w[i]*g;oR[pos+i]-=yi[i]*w[i]*g}
  }
  if(t%150===0)postMessage({type:'p',p:t/frames});
 }
 const res=[];for(let s=0;s<3;s++)for(let ch=0;ch<2;ch++)res.push(out[s][ch].slice(pad,pad+len));
 const oL=new Float32Array(len),oR=new Float32Array(len);
 for(let i=0;i<len;i++){oL[i]=L[i]-res[0][i]-res[2][i]-res[4][i];oR[i]=R[i]-res[1][i]-res[3][i]-res[5][i]}
 res.push(oL,oR);
 postMessage({type:'done',res},res.map(a=>a.buffer));
};`;
async function quickSeparate(){
  if(!S.buffer||AI.busy)return;
  AI.busy=true;const job=++AI.job;renderStemsUI();const token=S.buffer;
  try{
    sepProgress(0.02,t('quickRun',{p:0}));
    const [L,R,len]=await stereo44();
    if(!quickW)quickW=new Worker(URL.createObjectURL(new Blob([QUICK_SRC],{type:'text/javascript'})));
    const res=await new Promise((ok,fail)=>{
      quickW.onmessage=e=>{if(job!==AI.job)return;if(e.data.type==='p')sepProgress(e.data.p,t('quickRun',{p:Math.round(e.data.p*100)}));else ok(e.data.res)};
      quickW.onerror=err=>fail(err);quickW.postMessage({L,R,sr:44100},[L.buffer,R.buffer]);
    });
    if(job!==AI.job||S.buffer!==token)return;
    setStems(res,len,'quick');sepEnd(null);
  }catch(e){console.error(e);sepEnd(t('aiErr',{m:'quick'}),true)}
}
function cancelSep(silent){
  if(!AI.busy)return;AI.job++;
  if(AI.w&&!AI.ready){AI.w.terminate();AI.w=null}
  else if(AI.w){AI.w.terminate();AI.w=null;AI.ready=false}
  if(quickW){quickW.terminate();quickW=null}
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
  const us=Math.round(60e6/S.bpm);t0.push({t:0,o:0,b:[0xFF,0x51,3,(us>>16)&255,(us>>8)&255,us&255]},{t:0,o:0,b:[0xFF,0x58,4,4,2,24,8]});
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
  const L=[`Song: ${S.name}`,`BPM: ${fmtBpm(S.bpm)}`,S.key?`Key: ${keyName(pc,S.key.mode,true)} (${camelot(pc,S.key.mode)})`:'',S.lufs!=null?`Loudness: ${S.lufs.toFixed(1)} LUFS, peak ${S.peak.toFixed(1)} dBFS`:'',
    `First beat at: ${S.beats[0]?S.beats[0].toFixed(3):0} s`,`Transpose: ${S.transpose}`,S.stemKind?`Stems: ${S.stemKind==='ai'?'Demucs v4 (AI)':'quick DSP'}`:'','',
    'FL Studio: set the project tempo to the BPM above and drop every WAV and MIDI file at bar 1 (time 0). They line up.','','Chords by bar:'];
  let row=[];for(let b=0;b<S.beats.length;b++){if(mod(b-S.down,4)===0&&row.length){L.push(row.join(' '));row=[]}row.push(chordName(sounding(S.chords[b]),true).padEnd(4))}
  if(row.length)L.push(row.join(' '));
  return new TextEncoder().encode(L.filter((x,i)=>x!==''||i>6).join('\n'));
}
const EXP=[{id:'vocals',st:0},{id:'drums',st:1},{id:'bass',st:2},{id:'other',st:3},{id:'xInst',st:'inst'},{id:'xOrig',st:'orig'},{id:'xChords',st:'mchords',midi:1},{id:'xBassM',st:'mbass',midi:1},{id:'xMel',st:'mmel',midi:1}];
const expSel={vocals:1,drums:1,bass:1,other:1,xInst:0,xOrig:0,xChords:1,xBassM:1,xMel:1};
function expOk(e){if(e.st==='mchords')return !!S.chords;if(e.st==='orig')return !!S.buffer;return !!S.stems}
function renderExport(){
  const box=$('#xlist');box.innerHTML='';
  EXP.forEach(e=>{const ok=expOk(e),l=document.createElement('label');if(!ok)l.className='dis';
    l.innerHTML=`<input type="checkbox" id="x-${e.id}" ${expSel[e.id]&&ok?'checked':''} ${ok?'':'disabled'}><span></span><span class="ext">${e.midi?'MIDI':'WAV'}</span>`;
    l.querySelector('span').textContent=t(e.id)+(ok?'':` · ${t('needStems')}`);
    l.querySelector('input').onchange=ev=>{expSel[e.id]=ev.target.checked?1:0};box.appendChild(l)});
}
function saveBlob(blob,filename){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)}
async function download(){
  const msg=$('#dlMsg'),btn=$('#dlBtn');msg.classList.remove('err');
  if(typeof cfgOn==='function'&&!cfgOn('dl')){msg.textContent=t('offByAdmin');msg.classList.add('err');return}
  const pick=EXP.filter(e=>expSel[e.id]&&expOk(e));
  if(!pick.length){msg.textContent=t('dlNone');msg.classList.add('err');return}
  btn.disabled=true;msg.textContent=t('packing');await tick();
  try{
    const safe=(S.name||'song').replace(/[\\/:*?"<>|]/g,'_').slice(0,80),files=[];
    if(pick.some(e=>e.st==='mbass'||e.st==='mmel'))await transcribe(p=>{msg.textContent=t('transcribing',{p:Math.round(p*100)})});
    msg.textContent=t('packing');await tick();
    for(const e of pick){
      if(typeof e.st==='number'){const b=S.stems[e.st];files.push({name:`${safe} - ${STEMS[e.st].file}.wav`,data:wav(b.getChannelData(0),b.getChannelData(1),44100)})}
      else if(e.st==='inst'){const n=S.stems[1].length,L=new Float32Array(n),R=new Float32Array(n);for(const i of [1,2,3]){const a=S.stems[i].getChannelData(0),b=S.stems[i].getChannelData(1);for(let k=0;k<n;k++){L[k]+=a[k];R[k]+=b[k]}}files.push({name:`${safe} - Instrumental.wav`,data:wav(L,R,44100)})}
      else if(e.st==='orig'){const b=S.buffer,L=b.getChannelData(0),R=b.numberOfChannels>1?b.getChannelData(1):L;files.push({name:`${safe}.wav`,data:wav(L,R,b.sampleRate)})}
      else if(e.st==='mchords')files.push({name:`${safe} - Chords (Piano).mid`,data:chordMidi()});
      else if(e.st==='mbass')files.push({name:`${safe} - Bass line (Piano).mid`,data:notesMidi('Bass line',S.notes.bass)});
      else if(e.st==='mmel')files.push({name:`${safe} - Vocal melody (Piano).mid`,data:notesMidi('Vocal melody',S.notes.mel)});
      await tick();
    }
    if(S.chords)files.push({name:`${safe} - info.txt`,data:infoText()});
    const blob=zip(files);
    saveBlob(blob,`${safe} - Chord Room.zip`);
    msg.textContent=t('dlDone',{s:(blob.size/1048576).toFixed(1)});
  }catch(err){const c=err&&err.code;msg.textContent=c==='declined'?t('dlDeclined'):c==='rate_limited'?t('dlBusy'):t('dlFail');msg.classList.add('err');console.error(err)}
  finally{btn.disabled=false}
}

/* ---------- library ---------- */
const LK='chordroom.library.v2';
function readLocal(){try{return JSON.parse(localStorage.getItem(LK)||'[]')}catch(e){return []}}
function readLib(){return (typeof ACC!=='undefined'&&ACC.lib)?ACC.lib:readLocal()}
function writeLib(l){try{localStorage.setItem(LK,JSON.stringify(l))}catch(e){}}
function saveLib(){
  if(!S.chords||S.demo)return;
  const item={name:S.name,dur:S.dur,bpm:S.bpm,offset:S.offset,down:S.down,key:S.key,chords:Array.from(S.chords),edited:[...S.edited],cues:S.cues,lufs:S.lufs,peak:S.peak,saved:Date.now()};
  const loc=readLocal().filter(x=>x.name!==S.name);loc.unshift(item);writeLib(loc.slice(0,80));cloudSave(item);
}
let saveT=0;function saveLibSoon(){clearTimeout(saveT);saveT=setTimeout(saveLib,400)}
function renderLib(){
  const ul=$('#libList'),l=readLib();ul.innerHTML='';
  if(!l.length){const li=document.createElement('li');li.className='empty';li.textContent=t('libEmpty');ul.appendChild(li);return}
  l.forEach((it,i)=>{
    const li=document.createElement('li'),o=document.createElement('button');o.type='button';o.className='op';
    const kn=(FLAT_MAJ.has(it.key.mode?mod(it.key.pc+3,12):it.key.pc)?FLAT:SHARP)[it.key.pc]+(it.key.mode?'m':'');
    o.innerHTML=`<span class="t"></span><span class="m">${fmtBpm(it.bpm)} BPM · ${kn} · ${camelot(it.key.pc,it.key.mode)} · ${fmtS(it.dur)}</span>`;
    o.querySelector('.t').textContent=it.name;o.onclick=()=>openLib(it);
    const d=document.createElement('button');d.type='button';d.className='del';d.textContent=t('del');
    d.onclick=()=>{if(!d.classList.contains('arm')){d.classList.add('arm');d.textContent=t('sure');setTimeout(()=>{d.classList.remove('arm');d.textContent=t('del')},3000);return}writeLib(readLocal().filter(x=>x.name!==it.name));cloudDelete(it.name).then(renderLib);renderLib()};
    li.append(o,d);ul.appendChild(li);
  });
}
function openLib(it){
  stop();P.pos=0;cancelSep(true);
  Object.assign(S,{name:it.name,buffer:null,dur:it.dur,wave:null,chroma:null,env:null,lowEnv:null,bpm:it.bpm,offset:it.offset,down:it.down,key:it.key,transpose:0,capo:0,demo:false,
    stems:null,stemKind:null,edited:new Set(it.edited||[]),cues:it.cues||new Array(8).fill(null),loop:null,lufs:it.lufs??null,peak:it.peak??null,notes:null});
  buildBeats();S.chords=Int8Array.from(it.chords);renderAll();$('#lib').hidden=true;
  const n=$('#notice');n.hidden=false;n.textContent=t('fromLib');
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
    if(!user){ACC.profile=null;ACC.admin=false;ACC.lib=null;renderAccount();applyConfig();if(changed)renderLib();return}
    if(changed||event==='USER_UPDATED'||event==='INITIAL'){await loadProfile(true);loadCloudLib()}
  });
}
async function loadProfile(touch){
  try{ACC.profile=await Backend.getProfile()}catch(e){ACC.profile=null}
  ACC.admin=!!(ACC.profile&&ACC.profile.role==='admin'&&!ACC.profile.blocked);
  if(touch&&ACC.profile){Backend.touch().catch(()=>{});const pl=ACC.profile.lang;if(pl&&!LANG_CHOSEN&&pl!==LANG)setLang(pl,false)}
  renderAccount();applyConfig();
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
  renderStemsUI();
}
const cfgOn=k=>ACC.admin||(ACC.config||{})[k]!==false;
$('#adminBtn').onclick=()=>{fillSettings();$('#admin').hidden=false;loadUsers()};
$('#adminClose').onclick=()=>$('#admin').hidden=true;
function fillSettings(){const c=ACC.config||{};$('#cTitle').value=c.title||'';$('#cAnn').value=c.announce||'';$('#cLang').value=c.lang||'he';$('#cAi').checked=c.ai!==false;$('#cDl').checked=c.dl!==false;$('#cReq').checked=!!c.require_login;$('#cSign').checked=c.allow_signup!==false;setMsg($('#cMsg'),'')}
$('#cSave').onclick=()=>busyBtn($('#cSave'),async()=>{
  const c={...ACC.config,title:$('#cTitle').value.trim(),announce:$('#cAnn').value.trim(),lang:$('#cLang').value,ai:$('#cAi').checked,dl:$('#cDl').checked,require_login:$('#cReq').checked,allow_signup:$('#cSign').checked};
  try{await Backend.saveConfig(c);ACC.config=c;applyConfig();setMsg($('#cMsg'),t('saved'))}catch(e){setMsg($('#cMsg'),t('saveFail'),true)}});
async function loadUsers(){try{ACC.users=await Backend.adminUsers()}catch(e){ACC.users=[]}renderAdmin()}
$('#uSearch').addEventListener('input',()=>renderAdmin());
function renderAdmin(){
  if(!ACC.admin||$('#admin').hidden)return;
  const M=ACC.users||[],wk=Date.now()-7*864e5;
  const k=[[t('statUsers'),M.length],[t('statSongs'),M.reduce((a,m)=>a+(m.songs||0),0)],[t('statSeps'),M.reduce((a,m)=>a+(m.seps||0),0)],[t('statActive'),M.filter(m=>new Date(m.last_seen).getTime()>wk).length]];
  $('#kpis').innerHTML=k.map(([a,b])=>`<div class="kpi"><div class="k">${esc(a)}</div><div class="v">${b}</div></div>`).join('');
  const q=$('#uSearch').value.trim().toLowerCase();
  const rows=M.filter(m=>!q||[m.username,m.display_name,m.email].some(x=>String(x||'').toLowerCase().includes(q)));
  const body=$('#uBody');body.innerHTML='';
  if(!rows.length){body.innerHTML=`<tr><td colspan="8" class="snote">${esc(t('noUsers'))}</td></tr>`;return}
  rows.forEach(m=>{
    const tr=document.createElement('tr'),isMe=ACC.user&&m.id===ACC.user.id,adm=m.role==='admin';
    tr.innerHTML=`<td><div class="u"><img alt=""><div style="min-width:0"><div class="t"></div><div class="e"></div></div></div></td><td><span class="pill ${adm?'adm':''}">${esc(adm?t('roleAdmin'):t('roleUser'))}</span></td><td>${esc(fmtDate(m.created_at))}</td><td>${esc(fmtDate(m.last_seen))}</td><td class="mono">${m.songs||0}</td><td class="mono">${m.seps||0}</td><td><span class="pill ${m.blocked?'bad':''}">${esc(m.blocked?t('blockedS'):t('active'))}</span></td><td class="acts"></td>`;
    tr.querySelector('img').src=avatarFor(m);
    tr.querySelector('.t').textContent=(m.display_name||m.username||'—')+(isMe?` (${t('you')})`:'');
    tr.querySelector('.e').textContent=[m.username?'@'+m.username:'',m.email||''].filter(Boolean).join(' · ');
    if(!isMe){
      const acts=tr.querySelector('.acts');
      const b1=document.createElement('button');b1.type='button';b1.className='btn ghost';b1.textContent=adm?t('removeAdmin'):t('makeAdmin');
      b1.onclick=()=>busyBtn(b1,async()=>{try{await Backend.adminSetRole(m.id,adm?'user':'admin');await loadUsers()}catch(e){console.warn(e)}});
      const b2=document.createElement('button');b2.type='button';b2.className='btn '+(m.blocked?'solid':'ghost');b2.textContent=m.blocked?t('unblock'):t('block');
      b2.onclick=()=>busyBtn(b2,async()=>{try{await Backend.adminSetBlocked(m.id,!m.blocked);await loadUsers()}catch(e){console.warn(e)}});
      acts.append(b1,b2);
    }
    body.appendChild(tr);
  });
}

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
function bumpSeps(){if(ACC.user)Backend.bumpSeps().then(()=>loadProfile(false)).catch(()=>{})}

/* ---------- events ---------- */
async function loadFile(file){
  if(!file)return;
  try{busy(t('bReading'),0.01);const ab=await file.arrayBuffer();const buf=await ac().decodeAudioData(ab);
    // keep cues/edits from a saved copy of the same song
    const saved=readLib().find(x=>x.name===file.name.replace(/\.[^.]+$/,''));
    await analyze(buf,file.name.replace(/\.[^.]+$/,''),false);
    if(saved&&Math.abs(saved.dur-buf.duration)<0.5){S.bpm=saved.bpm;S.offset=saved.offset;buildBeats();S.chords=Int8Array.from(saved.chords);S.down=saved.down;S.edited=new Set(saved.edited||[]);S.cues=saved.cues||S.cues;renderAll()}
  }catch(e){console.error(e);busy(null);const n=$('#notice');n.hidden=false;n.textContent=t('readErr')}
}
$('#file').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value=''});
$('#upLbl').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#file').click()}});
$('#play').onclick=toggle;
$('#lang').onchange=e=>setLang(e.target.value,true);
function setLang(l,chosen){if(!I[l])return;LANG=l;if(chosen){LANG_CHOSEN=true;try{localStorage.setItem('chordroom.lang',LANG)}catch(x){}}applyLang();renderAll();renderLib();renderAccount();renderAdmin()}
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
const setT=d=>{S.transpose=Math.max(-11,Math.min(11,S.transpose+d));renderAll()};
$('#trM').onclick=()=>setT(-1);$('#trP').onclick=()=>setT(1);
const setC=d=>{S.capo=Math.max(0,Math.min(9,S.capo+d));renderAll()};
$('#cpM').onclick=()=>setC(-1);$('#cpP').onclick=()=>setC(1);
function loopToggle(){
  if(S.loop){S.loop=null}else if(S.beats.length){const T=60/S.bpm,b=beatAt(now()),bs=Math.max(0,b-mod(b-S.down,4)),ls=S.beats[bs]??0;S.loop={ls,le:Math.min(S.dur,ls+S.loopBars*4*T)}}
  renderLoop();restart();dirty=true;
}
$('#loopBtn').onclick=loopToggle;
document.querySelectorAll('[data-lb]').forEach(b=>b.onclick=()=>{S.loopBars=+b.dataset.lb;if(S.loop){const T=60/S.bpm;S.loop.le=Math.min(S.dur,S.loop.ls+S.loopBars*4*T);restart()}renderLoop();dirty=true});
$('#clickBtn').onclick=()=>{S.click=!S.click;$('#clickBtn').classList.toggle('on',S.click)};
$('#aiBtn').onclick=aiSeparate;$('#quickBtn').onclick=quickSeparate;$('#cancelBtn').onclick=()=>cancelSep(false);
$('#dlBtn').onclick=download;
$('#editBtn').onclick=()=>{S.editing=!S.editing;$('#pop').hidden=true;renderSheet()};
$('#libBtn').onclick=()=>{renderLib();$('#lib').hidden=false};$('#libClose').onclick=()=>$('#lib').hidden=true;
document.addEventListener('keydown',e=>{
  if(e.target.closest('input,textarea,select')||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key!=='Escape'&&(!$('#authDlg').hidden||!$('#acc').hidden||!$('#admin').hidden))return;
  const onBtn=e.target.closest('button,label');
  if(e.code==='Space'){if(onBtn)return;e.preventDefault();toggle()}
  else if(e.key==='ArrowRight'){e.preventDefault();seek(now()+60/(S.bpm||120)*4)}
  else if(e.key==='ArrowLeft'){e.preventDefault();seek(now()-60/(S.bpm||120)*4)}
  else if(/^Digit[1-8]$/.test(e.code)){cueHit(+e.code.slice(5)-1,e.shiftKey)}
  else if(e.key==='l'||e.key==='L'){loopToggle()}
  else if(e.key==='m'||e.key==='M'){S.click=!S.click;$('#clickBtn').classList.toggle('on',S.click)}
  else if(e.key==='+'||e.key==='='){zoom(-1)}else if(e.key==='-'){zoom(1)}
  else if(e.key==='Escape'){$('#pop').hidden=true;$('#lib').hidden=true;$('#acc').hidden=true;$('#admin').hidden=true;$('#authDlg').hidden=true}
});
ov.addEventListener('pointerdown',e=>{if(!S.dur)return;const r=ov.getBoundingClientRect();seek((e.clientX-r.left)/r.width*S.dur)});
let drag=null;
zm.addEventListener('pointerdown',e=>{if(!S.dur)return;zm.setPointerCapture(e.pointerId);drag={x:e.clientX,t:now(),was:P.playing};if(P.playing)stop();zm.classList.add('drag')});
zm.addEventListener('pointermove',e=>{if(!drag)return;const r=zm.getBoundingClientRect();P.pos=Math.max(0,Math.min(S.dur,drag.t-(e.clientX-drag.x)/r.width*S.win));dirty=true});
const endDrag=()=>{if(!drag)return;zm.classList.remove('drag');const w=drag.was;drag=null;if(S.loop&&(P.pos<S.loop.ls||P.pos>S.loop.le)){S.loop=null;renderLoop()}if(w)play()};
zm.addEventListener('pointerup',endDrag);zm.addEventListener('pointercancel',endDrag);
zm.addEventListener('wheel',e=>{if(!S.dur)return;e.preventDefault();if(Math.abs(e.deltaY)>Math.abs(e.deltaX))zoom(e.deltaY>0?1:-1);else seek(now()+e.deltaX/400*S.win)},{passive:false});
let dd=0;
window.addEventListener('dragenter',e=>{if([...e.dataTransfer.types].includes('Files')){dd++;$('#drop').hidden=false}});
window.addEventListener('dragleave',()=>{dd=Math.max(0,dd-1);if(!dd)$('#drop').hidden=true});
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>{e.preventDefault();dd=0;$('#drop').hidden=true;const f=e.dataTransfer.files[0];if(f)loadFile(f)});
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{sizeCanvases();renderMixer()},120)});

/* ---------- boot ---------- */
applyLang();sizeCanvases();renderAll();requestAnimationFrame(loop);initAccount();
(async()=>{try{busy(t('bDemo'),0.01);const buf=await synthDemo();await analyze(buf,'Demo · Am F C G · 120',true)}catch(e){console.error(e);busy(null)}})();
})();
