/* Chord Room — accessibility menu (תפריט נגישות).
   Self-contained: builds its own button + dialog, stores settings in localStorage `chordroom.a11y`,
   sets `a11y-*` classes on <html>, and exposes window.A11Y for the rest of the app.
   Load order: <link rel="stylesheet" href="assets/a11y.css"> in <head>, this script after the other scripts. */
(function () {
  'use strict';

  /* ---------- owner: fill in the accessibility coordinator's details ----------
     (or define window.A11Y_CONTACT = {name, email, phone, reviewed} before this script) */
  var CONTACT = {
    name: '',      // e.g. 'אושרי …'
    email: '',     // e.g. 'access@example.com'
    phone: '',     // e.g. '050-0000000'
    reviewed: ''   // date of the last accessibility review, e.g. '28.09.2026'
  };
  // only a plain object with string values (an element with id="A11Y_CONTACT" would also appear on window)
  var AC = window.A11Y_CONTACT;
  if (AC && Object.prototype.toString.call(AC) === '[object Object]') for (var ck in CONTACT) if (typeof AC[ck] === 'string') CONTACT[ck] = AC[ck];

  var KEY = 'chordroom.a11y';
  var root = document.documentElement;
  var DEF = { text: 100, contrast: false, cb: 'off', readable: false, links: false, noanim: false, cursor: false, focus: false, mono: false, flash: false };
  var SIZES = [100, 115, 130, 150];
  var CBS = ['off', 'safe', 'mono'];

  /* Okabe–Ito based, tuned to read on the black deck. low/mid/high replace the red/green/blue waveform bands,
     a/b replace the DJ deck colours. */
  var PALETTE = { low: '#D55E00', mid: '#F0E442', high: '#56B4E9', a: '#56B4E9', b: '#E69F00', ok: '#009E73', warn: '#E69F00', bad: '#D55E00' };

  function clean(o) {
    var s = {}, k;
    for (k in DEF) s[k] = DEF[k];
    if (!o || typeof o !== 'object') return s;
    if (SIZES.indexOf(+o.text) >= 0) s.text = +o.text;
    if (CBS.indexOf(o.cb) >= 0) s.cb = o.cb;
    ['contrast', 'readable', 'links', 'noanim', 'cursor', 'focus', 'mono', 'flash'].forEach(function (b) { if (b in o) s[b] = !!o[b]; });
    return s;
  }
  function load() { try { return clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return clean(null); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  var st = load();
  var CLASSES = ['a11y-t115', 'a11y-t130', 'a11y-t150', 'a11y-contrast', 'a11y-cb', 'a11y-cb-safe', 'a11y-cb-mono', 'a11y-readable',
    'a11y-links', 'a11y-noanim', 'a11y-cursor', 'a11y-focus', 'a11y-monoaudio', 'a11y-flash'];
  function applyClasses() {
    var on = [];
    if (st.text !== 100) on.push('a11y-t' + st.text);
    if (st.contrast) on.push('a11y-contrast');
    if (st.cb !== 'off') on.push('a11y-cb', 'a11y-cb-' + st.cb);
    if (st.readable) on.push('a11y-readable');
    if (st.links) on.push('a11y-links');
    if (st.noanim) on.push('a11y-noanim');
    if (st.cursor) on.push('a11y-cursor');
    if (st.focus) on.push('a11y-focus');
    if (st.mono) on.push('a11y-monoaudio');
    if (st.flash) on.push('a11y-flash');
    CLASSES.forEach(function (c) { root.classList.toggle(c, on.indexOf(c) >= 0); });
    root.style.setProperty('--a11y-z', String(st.text / 100));
    zoomSheet(st.text !== 100);
  }
  /* perf: the text-size zoom rule (assets/a11y-zoom.css, same ?v= as a11y.css) is attached only while it is needed */
  function zoomSheet(on) {
    var l = document.getElementById('a11yZoomCss');
    if (on && !l) {
      var base = document.querySelector('link[href*="a11y.css"]'), href = base ? base.getAttribute('href').replace('a11y.css', 'a11y-zoom.css') : 'assets/a11y-zoom.css';
      l = document.createElement('link'); l.id = 'a11yZoomCss'; l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
    }
    if (l) l.disabled = !on;
  }
  applyClasses(); // as early as possible

  /* ---------- strings ---------- */
  var T = {
    he: { fab: 'נגישות', title: 'נגישות', sub: 'התאמות תצוגה, קריאה ושמע. ההגדרות נשמרות בדפדפן הזה.', close: 'סגירה',
      gDisplay: 'תצוגה', gColour: 'צבע', gReading: 'קריאה וניווט', gMotion: 'תנועה', gHearing: 'שמיעה',
      text: 'גודל טקסט', contrast: 'ניגודיות גבוהה', contrastH: 'שחור ולבן, מסגרות וקווים חזקים', cursor: 'סמן עכבר גדול',
      cb: 'התאמה לעיוורון צבעים', cbH: 'צבעים שקל להבחין ביניהם בכל סוגי עיוורון הצבעים', cbOff: 'רגיל', cbSafe: 'פלטה בטוחה', cbMono: 'גווני אפור',
      readable: 'גופן קריא ומרווח', readableH: 'גופן ברור יותר ומרווחים גדולים בין אותיות ושורות', links: 'הדגשת קישורים וכפתורים',
      focus: 'מסגרת מיקוד בולטת', focusH: 'מראה היטב איפה אתם נמצאים בניווט במקלדת',
      noanim: 'עצירת אנימציות', noanimH: 'ביטול תנועה, מעברים והבהובים',
      mono: 'שמע מונו', monoH: 'מאחד את ערוצי השמאל והימין — למי ששומע באוזן אחת',
      flash: 'הבהוב חזותי על הביט', flashH: 'מסגרת זוהרת בכל פעמה, חזקה יותר בתחילת תיבה — לחירשים ולכבדי שמיעה',
      reset: 'איפוס הכל', resetDone: 'כל הגדרות הנגישות אופסו', statement: 'הצהרת נגישות', shortcut: 'קיצור מקלדת' },
    en: { fab: 'Accessibility', title: 'Accessibility', sub: 'Display, reading and hearing adjustments. Saved in this browser.', close: 'Close',
      gDisplay: 'Display', gColour: 'Colour', gReading: 'Reading & navigation', gMotion: 'Motion', gHearing: 'Hearing',
      text: 'Text size', contrast: 'High contrast', contrastH: 'Black and white, strong borders and lines', cursor: 'Large cursor',
      cb: 'Colour vision', cbH: 'Colours that stay distinct with every type of colour-blindness', cbOff: 'Standard', cbSafe: 'Safe palette', cbMono: 'Grayscale',
      readable: 'Readable font & spacing', readableH: 'A clearer typeface with more space between letters and lines', links: 'Highlight links & buttons',
      focus: 'Strong focus ring', focusH: 'Clearly shows where you are when using the keyboard',
      noanim: 'Stop animations', noanimH: 'Turns off motion, transitions and blinking',
      mono: 'Mono audio', monoH: 'Mixes left and right into both ears — for listeners who hear with one ear',
      flash: 'Visual beat flash', flashH: 'A glowing frame on every beat, stronger on each bar — for deaf and hard-of-hearing users',
      reset: 'Reset all', resetDone: 'All accessibility settings were reset', statement: 'Accessibility statement', shortcut: 'Shortcut' },
    ar: { fab: 'إمكانية الوصول', title: 'إمكانية الوصول', sub: 'ملاءمات للعرض والقراءة والسمع. تُحفظ الإعدادات في هذا المتصفح.', close: 'إغلاق',
      gDisplay: 'العرض', gColour: 'الألوان', gReading: 'القراءة والتنقّل', gMotion: 'الحركة', gHearing: 'السمع',
      text: 'حجم النص', contrast: 'تباين عالٍ', contrastH: 'أسود وأبيض مع حدود وخطوط واضحة', cursor: 'مؤشر فأرة كبير',
      cb: 'ملاءمة لعمى الألوان', cbH: 'ألوان يسهل التمييز بينها مع كل أنواع عمى الألوان', cbOff: 'عادي', cbSafe: 'ألوان آمنة', cbMono: 'تدرّج رمادي',
      readable: 'خط مقروء وتباعد', readableH: 'خط أوضح ومسافات أكبر بين الكلمات والأسطر', links: 'إبراز الروابط والأزرار',
      focus: 'إطار تركيز بارز', focusH: 'يوضّح موقعك بجلاء عند التنقّل بلوحة المفاتيح',
      noanim: 'إيقاف الحركة', noanimH: 'إلغاء الحركة والانتقالات والوميض',
      mono: 'صوت أحادي (مونو)', monoH: 'يدمج القناتين اليسرى واليمنى — لمن يسمع بأذن واحدة',
      flash: 'وميض مرئي مع الإيقاع', flashH: 'إطار مضيء مع كل نبضة، أقوى في بداية كل مازورة — للصمّ وضعاف السمع',
      reset: 'إعادة ضبط الكل', resetDone: 'تمت إعادة ضبط كل إعدادات إمكانية الوصول', statement: 'بيان إمكانية الوصول', shortcut: 'اختصار' },
    ru: { fab: 'Доступность', title: 'Доступность', sub: 'Настройки экрана, чтения и звука. Сохраняются в этом браузере.', close: 'Закрыть',
      gDisplay: 'Экран', gColour: 'Цвет', gReading: 'Чтение и навигация', gMotion: 'Движение', gHearing: 'Слух',
      text: 'Размер текста', contrast: 'Высокий контраст', contrastH: 'Чёрное и белое, чёткие рамки и линии', cursor: 'Крупный курсор',
      cb: 'Цветовое зрение', cbH: 'Цвета, которые различимы при любом типе дальтонизма', cbOff: 'Обычные', cbSafe: 'Безопасные', cbMono: 'Серые',
      readable: 'Удобный шрифт и интервалы', readableH: 'Более чёткий шрифт и больше места между буквами и строками', links: 'Выделить ссылки и кнопки',
      focus: 'Заметная рамка фокуса', focusH: 'Хорошо видно, где вы находитесь при работе с клавиатуры',
      noanim: 'Остановить анимацию', noanimH: 'Отключает движение, переходы и мигание',
      mono: 'Моно-звук', monoH: 'Сводит левый и правый каналы вместе — для тех, кто слышит одним ухом',
      flash: 'Световая вспышка на долю', flashH: 'Светящаяся рамка на каждую долю, ярче в начале такта — для глухих и слабослышащих',
      reset: 'Сбросить всё', resetDone: 'Все настройки доступности сброшены', statement: 'Заявление о доступности', shortcut: 'Сочетание клавиш' },
    es: { fab: 'Accesibilidad', title: 'Accesibilidad', sub: 'Ajustes de pantalla, lectura y audio. Se guardan en este navegador.', close: 'Cerrar',
      gDisplay: 'Pantalla', gColour: 'Color', gReading: 'Lectura y navegación', gMotion: 'Movimiento', gHearing: 'Audición',
      text: 'Tamaño del texto', contrast: 'Alto contraste', contrastH: 'Blanco y negro, bordes y líneas marcados', cursor: 'Cursor grande',
      cb: 'Visión del color', cbH: 'Colores que se distinguen con cualquier tipo de daltonismo', cbOff: 'Normal', cbSafe: 'Paleta segura', cbMono: 'Grises',
      readable: 'Fuente legible y espaciado', readableH: 'Una tipografía más clara con más espacio entre letras y líneas', links: 'Resaltar enlaces y botones',
      focus: 'Foco muy visible', focusH: 'Muestra claramente dónde estás al usar el teclado',
      noanim: 'Detener animaciones', noanimH: 'Desactiva movimiento, transiciones y parpadeos',
      mono: 'Audio mono', monoH: 'Mezcla izquierda y derecha en ambos oídos — para quien oye con un solo oído',
      flash: 'Destello visual del pulso', flashH: 'Un marco luminoso en cada pulso, más intenso en cada compás — para personas sordas o con pérdida auditiva',
      reset: 'Restablecer todo', resetDone: 'Se restablecieron todos los ajustes de accesibilidad', statement: 'Declaración de accesibilidad', shortcut: 'Atajo' }
  };
  function lang() { var l = (root.lang || 'he').slice(0, 2).toLowerCase(); return T[l] ? l : 'en'; }
  function isRtl(l) { return l === 'he' || l === 'ar'; }
  function t(k) { var L = T[lang()]; return L[k] != null ? L[k] : T.en[k]; }

  /* ---------- accessibility statement ---------- */
  var ST = {
    he: {
      title: 'הצהרת נגישות',
      intro: 'ב-Chord Room אנחנו מאמינים שמוזיקה שייכת לכולם. אנו פועלים כדי שהאתר יהיה נגיש ונוח לשימוש לכל אדם, לרבות אנשים עם מוגבלות, ומשקיעים משאבים בשיפור הנגישות באופן שוטף.',
      law: 'האתר הונגש בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות, התשנ"ח-1998, ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013.',
      level: 'התאמות הנגישות בוצעו לפי המלצות התקן הישראלי ת"י 5568 "קווים מנחים לנגישות תכנים באינטרנט", ברמת AA, המבוסס על הנחיות WCAG 2.0 של ארגון W3C.',
      menuH: 'תפריט הנגישות',
      menu: 'בכל עמוד באתר מופיע כפתור נגישות (סמל של דמות בתוך עיגול) בפינה התחתונה של המסך. אפשר לפתוח אותו גם בקיצור המקלדת Alt+Shift+A. ההגדרות שנבחרות נשמרות בדפדפן ומופעלות מחדש בכל ביקור.',
      adjH: 'התאמות הנגישות באתר',
      adj: [
        'הגדלת טקסט בארבע רמות (100%, 115%, 130%, 150%) בלי לפגוע בפעולת צורות הגל והפקדים.',
        'מצב ניגודיות גבוהה: שחור ולבן, מסגרות חזקות וקישורים עם קו תחתון.',
        'התאמה לעיוורון צבעים: פלטת צבעים בטוחה (על בסיס פלטת Okabe–Ito) לצורות הגל ולסימון הדקים, או תצוגה בגווני אפור.',
        'גופן קריא (Atkinson Hyperlegible) עם ריווח מוגדל בין אותיות, מילים ושורות.',
        'הדגשת קישורים וכפתורים.',
        'עצירת אנימציות, מעברים והבהובים.',
        'סמן עכבר גדול.',
        'מסגרת מיקוד בולטת לניווט במקלדת.',
        'שמע מונו — איחוד ערוצי השמאל והימין למי ששומע באוזן אחת.',
        'הבהוב חזותי על כל פעמה ותיבה, כדי שאנשים חירשים וכבדי שמיעה יוכלו לעקוב אחר הקצב.',
        'ניווט במקלדת: הכפתורים והפקדים באתר זמינים במקש Tab, ויש קיצורי מקלדת לנגן ולעמדת ה-DJ.',
        'תוויות נגישות (ARIA) לכפתורים, לחלונות ולפקדים, לשימוש בתוכנות קורא מסך.',
        'תמיכה מלאה בכתיבה מימין לשמאל (עברית וערבית) ובחמש שפות ממשק: עברית, אנגלית, ערבית, רוסית וספרדית.',
        'מצב כהה ומצב בהיר, והתאמה למסכי טלפון נייד.'
      ],
      limH: 'מגבלות ידועות',
      lim: [
        'צורות הגל וחלק מהתצוגות הגרפיות מצוירים על גבי Canvas ולכן אינם נקראים במלואם בתוכנות קורא מסך. המידע העיקרי שלהם (קצב BPM, סולם, אקורדים וזמן) מוצג גם כטקסט.',
        'האתר עוסק בשמע: ניגון, הפרדת ערוצים (Stems) ועמדת ה-DJ מבוססים על שמיעה. כדי להקל, הוספנו הבהוב חזותי על הקצב ושמע מונו.',
        'תוכן של צד שלישי — רשימות שירים, תמונות עטיפה, קטעי השמעה ונגן השירים המלאים של Deezer — מוצג כפי שהוא מתקבל מ-Deezer, ואין לנו שליטה מלאה על נגישותו.',
        'חלק מהפעולות, כמו גרירה על צורת הגל ופקדים סיבוביים, נוחות יותר בעכבר או במגע; לרובן יש חלופה במקלדת.',
        'ייתכן שחלקים באתר עדיין אינם נגישים במלואם. אנו ממשיכים לבדוק ולשפר.'
      ],
      physH: 'הסדרי נגישות פיזיים',
      phys: 'Chord Room הוא שירות מקוון בלבד, ואין לו משרדים או מוקדי שירות פתוחים לקהל.',
      contactH: 'פנייה לרכז/ת הנגישות',
      contact: 'נתקלתם בבעיית נגישות או שיש לכם הצעה לשיפור? נשמח לשמוע. כדי שנוכל לטפל בפנייה, אנא ציינו תיאור של הבעיה, את העמוד שבו נתקלתם בה, את סוג הדפדפן והמכשיר, ואם אתם משתמשים בטכנולוגיה מסייעת — גם את סוגה.',
      name: 'שם', email: 'דוא"ל', phone: 'טלפון', reviewed: 'ההצהרה עודכנה לאחרונה בתאריך',
      ph: { name: '[שם רכז/ת הנגישות]', email: '[כתובת דוא"ל]', phone: '[מספר טלפון]', reviewed: '[תאריך]' }
    },
    en: {
      title: 'Accessibility statement',
      intro: 'At Chord Room we believe music belongs to everyone. We work to make this website accessible and easy to use for all people, including people with disabilities, and we keep investing in improving its accessibility.',
      law: 'The website was made accessible in accordance with the Equal Rights for Persons with Disabilities Law, 5758-1998, and the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 5773-2013.',
      level: 'The adjustments follow the recommendations of Israeli Standard SI 5568, "Web content accessibility guidelines", at level AA, which is based on the W3C Web Content Accessibility Guidelines (WCAG) 2.0.',
      menuH: 'The accessibility menu',
      menu: 'Every page shows an accessibility button (a figure inside a circle) in a bottom corner of the screen. You can also open it with the keyboard shortcut Alt+Shift+A. Your choices are saved in the browser and applied again on every visit.',
      adjH: 'Accessibility adjustments on this website',
      adj: [
        'Text enlargement in four steps (100%, 115%, 130%, 150%) without breaking the waveforms and controls.',
        'High-contrast mode: black and white, strong borders and underlined links.',
        'Colour-vision support: a colour-blind-safe palette (based on the Okabe–Ito palette) for the waveforms and deck colours, or a grayscale view.',
        'A readable typeface (Atkinson Hyperlegible) with more space between letters, words and lines.',
        'Highlighted links and buttons.',
        'Stopping animations, transitions and blinking.',
        'A large mouse cursor.',
        'A strong focus ring for keyboard navigation.',
        'Mono audio — left and right channels combined for listeners who hear with one ear.',
        'A visual flash on every beat and bar, so deaf and hard-of-hearing users can follow the rhythm.',
        'Keyboard navigation: buttons and controls are reachable with the Tab key, with keyboard shortcuts for the player and the DJ view.',
        'Accessibility labels (ARIA) on buttons, dialogs and controls for screen-reader users.',
        'Full right-to-left support (Hebrew and Arabic) and five interface languages: Hebrew, English, Arabic, Russian and Spanish.',
        'Dark and light modes, and layouts adapted to mobile screens.'
      ],
      limH: 'Known limitations',
      lim: [
        'Waveforms and some other graphics are drawn on a canvas, so screen readers cannot read them in full. Their key information (BPM, key, chords and time) is also shown as text.',
        'This is an audio website: playback, stem separation and the DJ view rely on hearing. To help, we added a visual beat flash and mono audio.',
        'Third-party content — Deezer charts, cover images, previews and the full-song player — is shown as received from Deezer, and we do not fully control its accessibility.',
        'Some actions, such as dragging on the waveform and turning rotary knobs, are easier with a mouse or touch; most of them have a keyboard alternative.',
        'Some parts of the website may not yet be fully accessible. We keep testing and improving.'
      ],
      physH: 'Physical accessibility',
      phys: 'Chord Room is an online-only service and has no offices or service points open to the public.',
      contactH: 'Contact the accessibility coordinator',
      contact: 'Found an accessibility problem or have a suggestion? We would like to hear from you. To help us handle your request, please describe the problem, the page where it happened, your browser and device, and any assistive technology you use.',
      name: 'Name', email: 'Email', phone: 'Phone', reviewed: 'This statement was last updated on',
      ph: { name: '[Accessibility coordinator name]', email: '[email address]', phone: '[phone number]', reviewed: '[date]' }
    },
    ar: {
      title: 'بيان إمكانية الوصول',
      intro: 'نؤمن في Chord Room بأن الموسيقى للجميع. نعمل على أن يكون الموقع متاحًا وسهل الاستخدام لكل شخص، بما في ذلك الأشخاص ذوو الإعاقة، ونستثمر باستمرار في تحسين إمكانية الوصول.',
      law: 'تمت ملاءمة الموقع وفقًا لقانون المساواة في الحقوق للأشخاص ذوي الإعاقة لسنة 1998، وأنظمة المساواة في الحقوق للأشخاص ذوي الإعاقة (ملاءمات إمكانية الوصول للخدمة) لسنة 2013.',
      level: 'نُفِّذت الملاءمات وفق توصيات المعيار الإسرائيلي 5568 "إرشادات إمكانية الوصول إلى محتوى الإنترنت" بمستوى AA، المستند إلى إرشادات WCAG 2.0 الصادرة عن منظمة W3C.',
      menuH: 'قائمة إمكانية الوصول',
      menu: 'يظهر في كل صفحة زر إمكانية الوصول (رمز شخص داخل دائرة) في الزاوية السفلية من الشاشة. يمكن فتحه أيضًا باختصار لوحة المفاتيح Alt+Shift+A. تُحفظ الإعدادات المختارة في المتصفح وتُطبَّق من جديد في كل زيارة.',
      adjH: 'ملاءمات إمكانية الوصول في الموقع',
      adj: [
        'تكبير النص بأربع درجات (100%، 115%، 130%، 150%) دون الإضرار بعمل أشكال الموجة وعناصر التحكم.',
        'وضع التباين العالي: أسود وأبيض، حدود واضحة وروابط مسطّرة.',
        'ملاءمة لعمى الألوان: لوحة ألوان آمنة (مبنية على لوحة Okabe–Ito) لأشكال الموجة وألوان الأسطوانات، أو عرض بتدرّج رمادي.',
        'خط مقروء (Atkinson Hyperlegible) مع مسافات أكبر بين الكلمات والأسطر.',
        'إبراز الروابط والأزرار.',
        'إيقاف الحركة والانتقالات والوميض.',
        'مؤشر فأرة كبير.',
        'إطار تركيز بارز للتنقّل بلوحة المفاتيح.',
        'صوت أحادي (مونو) — دمج القناتين اليسرى واليمنى لمن يسمع بأذن واحدة.',
        'وميض مرئي مع كل نبضة ومازورة، ليتمكّن الصمّ وضعاف السمع من متابعة الإيقاع.',
        'التنقّل بلوحة المفاتيح: يمكن الوصول إلى الأزرار وعناصر التحكم بمفتاح Tab، مع اختصارات للمشغّل ولواجهة الـDJ.',
        'تسميات إمكانية الوصول (ARIA) للأزرار والنوافذ وعناصر التحكم لمستخدمي قارئات الشاشة.',
        'دعم كامل للكتابة من اليمين إلى اليسار (العبرية والعربية) وخمس لغات للواجهة: العبرية والإنجليزية والعربية والروسية والإسبانية.',
        'وضع داكن ووضع فاتح، وتصميم ملائم لشاشات الهواتف.'
      ],
      limH: 'قيود معروفة',
      lim: [
        'تُرسم أشكال الموجة وبعض العناصر الرسومية على Canvas، لذلك لا تستطيع قارئات الشاشة قراءتها بالكامل. معلوماتها الأساسية (الإيقاع BPM والمقام والأكوردات والوقت) معروضة أيضًا كنص.',
        'هذا موقع صوتي: التشغيل وفصل المسارات (Stems) وواجهة الـDJ تعتمد على السمع. للتسهيل أضفنا وميضًا مرئيًا مع الإيقاع وصوتًا أحاديًا.',
        'محتوى الطرف الثالث — قوائم Deezer وصور الأغلفة والمقاطع ومشغّل الأغنية الكاملة — يُعرض كما يصل من Deezer، ولا نتحكم بالكامل في إمكانية الوصول إليه.',
        'بعض الإجراءات، مثل السحب على شكل الموجة وتدوير المقابض، أسهل بالفأرة أو باللمس؛ ولمعظمها بديل بلوحة المفاتيح.',
        'قد تكون بعض أجزاء الموقع غير متاحة بالكامل بعد. نواصل الفحص والتحسين.'
      ],
      physH: 'ترتيبات إمكانية الوصول المادية',
      phys: 'Chord Room خدمة عبر الإنترنت فقط، وليس لها مكاتب أو مراكز خدمة مفتوحة للجمهور.',
      contactH: 'التواصل مع منسّق/ة إمكانية الوصول',
      contact: 'واجهتم مشكلة في إمكانية الوصول أو لديكم اقتراح للتحسين؟ يسعدنا سماعكم. لمساعدتنا في معالجة الطلب، يُرجى وصف المشكلة والصفحة التي ظهرت فيها ونوع المتصفح والجهاز، وأي تقنية مساعدة تستخدمونها.',
      name: 'الاسم', email: 'البريد الإلكتروني', phone: 'الهاتف', reviewed: 'آخر تحديث لهذا البيان بتاريخ',
      ph: { name: '[اسم منسّق/ة إمكانية الوصول]', email: '[عنوان البريد الإلكتروني]', phone: '[رقم الهاتف]', reviewed: '[التاريخ]' }
    },
    ru: {
      title: 'Заявление о доступности',
      intro: 'В Chord Room мы считаем, что музыка — для всех. Мы стремимся сделать сайт доступным и удобным для каждого, включая людей с инвалидностью, и постоянно работаем над улучшением доступности.',
      law: 'Сайт адаптирован в соответствии с Законом о равных правах людей с инвалидностью 1998 года и Положениями о равных правах людей с инвалидностью (адаптация услуг для доступности) 2013 года.',
      level: 'Адаптация выполнена по рекомендациям израильского стандарта SI 5568 «Руководство по доступности веб-контента» на уровне AA, основанного на рекомендациях WCAG 2.0 консорциума W3C.',
      menuH: 'Меню доступности',
      menu: 'На каждой странице в нижнем углу экрана есть кнопка доступности (фигура человека в круге). Её также можно открыть сочетанием клавиш Alt+Shift+A. Выбранные настройки сохраняются в браузере и применяются при каждом посещении.',
      adjH: 'Что сделано для доступности',
      adj: [
        'Увеличение текста в четыре шага (100%, 115%, 130%, 150%) без нарушения работы волновых форм и элементов управления.',
        'Режим высокого контраста: чёрное и белое, чёткие рамки, подчёркнутые ссылки.',
        'Поддержка цветового зрения: безопасная для дальтоников палитра (на основе палитры Okabe–Ito) для волновых форм и цветов деков или отображение в оттенках серого.',
        'Удобочитаемый шрифт (Atkinson Hyperlegible) с увеличенными интервалами между буквами, словами и строками.',
        'Выделение ссылок и кнопок.',
        'Остановка анимации, переходов и мигания.',
        'Крупный курсор мыши.',
        'Заметная рамка фокуса для работы с клавиатуры.',
        'Моно-звук — левый и правый каналы сведены вместе для тех, кто слышит одним ухом.',
        'Световая вспышка на каждую долю и такт, чтобы глухие и слабослышащие могли следить за ритмом.',
        'Навигация с клавиатуры: кнопки и элементы управления доступны клавишей Tab, есть сочетания клавиш для плеера и DJ-режима.',
        'Метки доступности (ARIA) для кнопок, окон и элементов управления для пользователей программ экранного доступа.',
        'Полная поддержка письма справа налево (иврит и арабский) и пять языков интерфейса: иврит, английский, арабский, русский и испанский.',
        'Тёмная и светлая темы, адаптация под экраны телефонов.'
      ],
      limH: 'Известные ограничения',
      lim: [
        'Волновые формы и часть графики рисуются на canvas, поэтому программы экранного доступа не могут прочитать их полностью. Основная информация (BPM, тональность, аккорды, время) также показана текстом.',
        'Это звуковой сайт: воспроизведение, разделение на стемы и DJ-режим основаны на слухе. Для облегчения добавлены световая вспышка на долю и моно-звук.',
        'Сторонний контент — чарты Deezer, обложки, фрагменты и плеер полной версии песни — показывается в том виде, в каком его передаёт Deezer, и мы не полностью контролируем его доступность.',
        'Некоторые действия, например перетаскивание по волновой форме и поворотные ручки, удобнее мышью или касанием; для большинства есть альтернатива с клавиатуры.',
        'Отдельные части сайта могут быть ещё не полностью доступны. Мы продолжаем проверять и улучшать сайт.'
      ],
      physH: 'Физическая доступность',
      phys: 'Chord Room — исключительно онлайн-сервис, у него нет офисов или пунктов обслуживания для посетителей.',
      contactH: 'Связь с координатором по доступности',
      contact: 'Столкнулись с проблемой доступности или есть предложение? Напишите нам. Чтобы мы могли помочь, опишите проблему, страницу, где она возникла, браузер и устройство, а также вспомогательную технологию, если вы её используете.',
      name: 'Имя', email: 'Эл. почта', phone: 'Телефон', reviewed: 'Заявление последний раз обновлено',
      ph: { name: '[имя координатора по доступности]', email: '[адрес эл. почты]', phone: '[номер телефона]', reviewed: '[дата]' }
    },
    es: {
      title: 'Declaración de accesibilidad',
      intro: 'En Chord Room creemos que la música es para todos. Trabajamos para que este sitio sea accesible y fácil de usar para cualquier persona, incluidas las personas con discapacidad, e invertimos de forma continua en mejorar su accesibilidad.',
      law: 'El sitio se adaptó conforme a la Ley de Igualdad de Derechos para Personas con Discapacidad de 1998 y al Reglamento de Igualdad de Derechos para Personas con Discapacidad (Ajustes de Accesibilidad al Servicio) de 2013 del Estado de Israel.',
      level: 'Los ajustes siguen las recomendaciones de la norma israelí SI 5568, "Pautas de accesibilidad para el contenido web", en el nivel AA, basada en las pautas WCAG 2.0 del W3C.',
      menuH: 'El menú de accesibilidad',
      menu: 'Todas las páginas muestran un botón de accesibilidad (una figura dentro de un círculo) en una esquina inferior de la pantalla. También se abre con el atajo de teclado Alt+Shift+A. Tus elecciones se guardan en el navegador y se aplican en cada visita.',
      adjH: 'Ajustes de accesibilidad del sitio',
      adj: [
        'Ampliación del texto en cuatro niveles (100 %, 115 %, 130 %, 150 %) sin afectar las formas de onda ni los controles.',
        'Modo de alto contraste: blanco y negro, bordes marcados y enlaces subrayados.',
        'Apoyo a la visión del color: una paleta segura para daltonismo (basada en la paleta Okabe–Ito) para las formas de onda y los colores de los decks, o vista en escala de grises.',
        'Una tipografía legible (Atkinson Hyperlegible) con más espacio entre letras, palabras y líneas.',
        'Enlaces y botones resaltados.',
        'Detención de animaciones, transiciones y parpadeos.',
        'Cursor de ratón grande.',
        'Indicador de foco muy visible para la navegación con teclado.',
        'Audio mono: canales izquierdo y derecho combinados para quien oye con un solo oído.',
        'Destello visual en cada pulso y compás, para que las personas sordas o con pérdida auditiva puedan seguir el ritmo.',
        'Navegación con teclado: los botones y controles se alcanzan con la tecla Tab, con atajos para el reproductor y la vista DJ.',
        'Etiquetas de accesibilidad (ARIA) en botones, diálogos y controles para usuarios de lectores de pantalla.',
        'Soporte completo de escritura de derecha a izquierda (hebreo y árabe) y cinco idiomas de interfaz: hebreo, inglés, árabe, ruso y español.',
        'Modos oscuro y claro, y diseño adaptado a pantallas de móvil.'
      ],
      limH: 'Limitaciones conocidas',
      lim: [
        'Las formas de onda y algunos gráficos se dibujan en un canvas, por lo que los lectores de pantalla no pueden leerlos por completo. Su información principal (BPM, tonalidad, acordes y tiempo) también se muestra como texto.',
        'Es un sitio de audio: la reproducción, la separación de stems y la vista DJ dependen de la audición. Para ayudar, añadimos un destello visual del pulso y audio mono.',
        'El contenido de terceros (listas de Deezer, portadas, fragmentos y el reproductor de la canción completa) se muestra tal como llega de Deezer y no controlamos por completo su accesibilidad.',
        'Algunas acciones, como arrastrar sobre la forma de onda o girar perillas, son más cómodas con ratón o pantalla táctil; la mayoría tiene una alternativa con teclado.',
        'Es posible que algunas partes del sitio aún no sean totalmente accesibles. Seguimos revisando y mejorando.'
      ],
      physH: 'Accesibilidad física',
      phys: 'Chord Room es un servicio exclusivamente en línea y no tiene oficinas ni puntos de atención al público.',
      contactH: 'Contacto con la persona coordinadora de accesibilidad',
      contact: '¿Encontraste un problema de accesibilidad o tienes una sugerencia? Queremos saberlo. Para ayudarnos a atender tu solicitud, describe el problema, la página donde ocurrió, tu navegador y dispositivo, y la tecnología de apoyo que uses, si es el caso.',
      name: 'Nombre', email: 'Correo electrónico', phone: 'Teléfono', reviewed: 'Esta declaración se actualizó por última vez el',
      ph: { name: '[nombre de la persona coordinadora]', email: '[correo electrónico]', phone: '[número de teléfono]', reviewed: '[fecha]' }
    }
  };
  /* growth: the standalone statement page (#accessibility, assets/info.js) — the sections IS 5568 / the 2013 regulations
     ask for beyond the list above: compliance status, alternatives, how it was checked, how requests are handled */
  var REVIEWED_DEFAULT = '2026-10-06';   // last review of this statement (automated sweep + content); CONTACT.reviewed overrides it
  var STX = {
    he: { statusH: 'רמת ההנגשה', status: 'לפי הבדיקה שלנו האתר עומד ברוב הדרישות של ת"י 5568 ברמה AA (המבוסס על WCAG 2.0; אנחנו בודקים גם מול WCAG 2.1 ברמה AA), למעט מה שמפורט ב״מגבלות ידועות״. ההנגשה חלקית, ואנחנו ממשיכים להשלים אותה.',
      altH: 'חלופות נגישות', alt: ['כל מה שמצויר על צורת הגל — קצב, סולם, אקורדים, נקודות קיו וזמן — מוצג גם כטקסט: בשורת הנתונים, בדף האקורדים ובטבלת ניתוח הספרייה.',
        'אפשר לשמור את הניתוח כקבצים (CSV,‏ MIDI,‏ rekordbox XML) ולפתוח אותם בתוכנה אחרת שנוחה לכם.',
        'לפעולות גרירה יש חלופה בכפתורים או במקלדת (למשל הזזת הגריד בחיצים ובכפתורי ◀ ▶).',
        'אם חלק באתר לא נגיש לכם, פנו לרכז/ת הנגישות: נעזור לבצע את הפעולה או נשלח את המידע בפורמט חלופי.'],
      testH: 'איך בדקנו', test: 'בכל עדכון רצות בדיקות אוטומטיות על כל המסכים בחמש השפות, בכיוון ימין־לשמאל ושמאל־לימין, במצב כהה וברוחב טלפון: ניווט ומיקוד במקלדת, לכידת מיקוד בחלונות, תוויות לפקדים, ניגודיות וגלילה אופקית. בדיקה ידנית עם קוראי מסך היא חלק מהבדיקה התקופתית.',
      respH: 'טיפול בפניות', resp: 'נשתדל לענות לכל פנייה בנושא נגישות בתוך 5 ימי עבודה ולתקן תקלות בהקדם האפשרי.',
      general: 'אפשר גם לפנות דרך כתובת הקשר של האתר:', openMenu: 'פתיחת תפריט הנגישות',
      adminWarn: 'למנהלים בלבד: פרטי רכז/ת הנגישות (שם, דוא"ל, טלפון) עדיין לא מולאו ב־assets/a11y.js (CONTACT). התקנות מחייבות לפרסם אותם בהצהרה.' },
    en: { statusH: 'Conformance status', status: 'Based on our review, the site meets most requirements of Israeli Standard SI 5568 at level AA (based on WCAG 2.0; we also check against WCAG 2.1 level AA), except for the items listed under “Known limitations”. The site is partially conformant and we keep working on the rest.',
      altH: 'Accessible alternatives', alt: ['Everything drawn on the waveform — tempo, key, chords, cue points and time — is also shown as text: in the stats bar, on the chord sheet and in the library analysis table.',
        'You can save the analysis as files (CSV, MIDI, rekordbox XML) and open them in other software that suits you.',
        'Drag actions have a button or keyboard alternative (for example, moving the grid with the arrow keys and the ◀ ▶ buttons).',
        'If part of the site isn’t accessible to you, contact the accessibility coordinator: we will help you complete the action or send the information in another format.'],
      testH: 'How we checked', test: 'Every update runs automated checks on every screen in all five languages, right-to-left and left-to-right, in dark mode and at phone width: keyboard navigation and focus, focus trapping in dialogs, labels on controls, contrast and horizontal scrolling. Manual checks with screen readers are part of the periodic review.',
      respH: 'How we handle requests', resp: 'We aim to answer every accessibility request within 5 business days and to fix problems as soon as possible.',
      general: 'You can also reach us through the site’s contact address:', openMenu: 'Open the accessibility menu',
      adminWarn: 'Admins only: the accessibility coordinator’s details (name, email, phone) are not filled in yet in assets/a11y.js (CONTACT). The regulations require publishing them in the statement.' },
    ar: { statusH: 'مستوى الملاءمة', status: 'وفق فحصنا، يستوفي الموقع معظم متطلبات المعيار الإسرائيلي 5568 بمستوى AA (المستند إلى WCAG 2.0؛ ونفحص أيضًا مقابل WCAG 2.1 بمستوى AA)، باستثناء ما ورد في «قيود معروفة». الملاءمة جزئية ونواصل استكمالها.',
      altH: 'بدائل متاحة', alt: ['كل ما يُرسم على شكل الموجة — الإيقاع والمقام والأكوردات ونقاط الإشارة والوقت — يُعرض أيضًا كنص: في شريط البيانات وورقة الأكوردات وجدول تحليل المكتبة.',
        'يمكن حفظ التحليل كملفات (CSV وMIDI وrekordbox XML) وفتحها في برنامج آخر يناسبك.',
        'لعمليات السحب بديل بالأزرار أو بلوحة المفاتيح (مثل تحريك الشبكة بالأسهم وبأزرار ◀ ▶).',
        'إذا كان جزء من الموقع غير متاح لك، تواصل مع منسّق/ة إمكانية الوصول: سنساعدك على إتمام الإجراء أو نرسل المعلومات بصيغة بديلة.'],
      testH: 'كيف فحصنا', test: 'مع كل تحديث تعمل فحوص آلية على كل الشاشات باللغات الخمس، من اليمين إلى اليسار ومن اليسار إلى اليمين، في الوضع الداكن وبعرض الهاتف: التنقّل والتركيز بلوحة المفاتيح، وحصر التركيز في النوافذ، وتسميات عناصر التحكم، والتباين، والتمرير الأفقي. الفحص اليدوي بقارئات الشاشة جزء من المراجعة الدورية.',
      respH: 'معالجة الطلبات', resp: 'نسعى للرد على كل طلب يتعلق بإمكانية الوصول خلال 5 أيام عمل وإصلاح الأعطال في أقرب وقت ممكن.',
      general: 'يمكنك أيضًا التواصل عبر عنوان التواصل في الموقع:', openMenu: 'فتح قائمة إمكانية الوصول',
      adminWarn: 'للمديرين فقط: لم تُملأ بعد بيانات منسّق/ة إمكانية الوصول (الاسم والبريد والهاتف) في assets/a11y.js ‏(CONTACT). تُلزم الأنظمة بنشرها في البيان.' },
    ru: { statusH: 'Уровень соответствия', status: 'По нашей проверке сайт соответствует большинству требований израильского стандарта SI 5568 уровня AA (на основе WCAG 2.0; мы также проверяем по WCAG 2.1 уровня AA), кроме пунктов из раздела «Известные ограничения». Соответствие частичное, и мы продолжаем работу.',
      altH: 'Доступные альтернативы', alt: ['Всё, что нарисовано на волновой форме, — темп, тональность, аккорды, cue-точки и время — также показано текстом: в строке данных, на листе аккордов и в таблице анализа библиотеки.',
        'Анализ можно сохранить в файлы (CSV, MIDI, rekordbox XML) и открыть в другой удобной вам программе.',
        'У действий перетаскивания есть альтернатива кнопками или с клавиатуры (например, сдвиг сетки стрелками и кнопками ◀ ▶).',
        'Если какая-то часть сайта вам недоступна, напишите координатору по доступности: мы поможем выполнить действие или пришлём информацию в другом формате.'],
      testH: 'Как мы проверяли', test: 'При каждом обновлении запускаются автоматические проверки всех экранов на пяти языках, справа налево и слева направо, в тёмной теме и при ширине телефона: навигация и фокус с клавиатуры, удержание фокуса в окнах, подписи элементов управления, контраст и горизонтальная прокрутка. Ручная проверка с программами экранного доступа входит в периодический аудит.',
      respH: 'Как мы обрабатываем обращения', resp: 'Мы стараемся отвечать на каждое обращение о доступности в течение 5 рабочих дней и исправлять проблемы как можно быстрее.',
      general: 'Также можно написать на контактный адрес сайта:', openMenu: 'Открыть меню доступности',
      adminWarn: 'Только для администраторов: данные координатора по доступности (имя, e-mail, телефон) ещё не заполнены в assets/a11y.js (CONTACT). По правилам их нужно опубликовать в заявлении.' },
    es: { statusH: 'Nivel de conformidad', status: 'Según nuestra revisión, el sitio cumple la mayoría de los requisitos de la norma israelí SI 5568 en el nivel AA (basada en WCAG 2.0; también revisamos frente a WCAG 2.1 nivel AA), salvo lo indicado en «Limitaciones conocidas». La conformidad es parcial y seguimos trabajando en el resto.',
      altH: 'Alternativas accesibles', alt: ['Todo lo que se dibuja en la forma de onda —tempo, tonalidad, acordes, puntos cue y tiempo— también aparece como texto: en la barra de datos, en la hoja de acordes y en la tabla del análisis de biblioteca.',
        'Puedes guardar el análisis en archivos (CSV, MIDI, rekordbox XML) y abrirlos en otro programa que te resulte cómodo.',
        'Las acciones de arrastre tienen una alternativa con botones o teclado (por ejemplo, mover la cuadrícula con las flechas y los botones ◀ ▶).',
        'Si alguna parte del sitio no te resulta accesible, escribe a la persona coordinadora de accesibilidad: te ayudaremos a completar la acción o te enviaremos la información en otro formato.'],
      testH: 'Cómo lo revisamos', test: 'En cada actualización se ejecutan pruebas automáticas en todas las pantallas en los cinco idiomas, de derecha a izquierda y de izquierda a derecha, en modo oscuro y con ancho de móvil: navegación y foco con teclado, foco atrapado en los diálogos, etiquetas de los controles, contraste y desplazamiento horizontal. Las revisiones manuales con lectores de pantalla forman parte de la revisión periódica.',
      respH: 'Cómo atendemos las solicitudes', resp: 'Intentamos responder cada solicitud de accesibilidad en un plazo de 5 días hábiles y corregir los problemas lo antes posible.',
      general: 'También puedes escribirnos a la dirección de contacto del sitio:', openMenu: 'Abrir el menú de accesibilidad',
      adminWarn: 'Solo administradores: los datos de la persona coordinadora de accesibilidad (nombre, correo, teléfono) aún no se completaron en assets/a11y.js (CONTACT). El reglamento exige publicarlos en la declaración.' }
  };
  for (var sk in STX) for (var sx in STX[sk]) ST[sk][sx] = STX[sk][sx];
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDay(iso, l) { try { return new Intl.DateTimeFormat(l === 'he' ? 'he-IL' : l === 'ar' ? 'ar-u-nu-latn' : l, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T12:00:00Z')); } catch (e) { return iso; } }
  /* opts (growth): { full: the standalone page's extra sections, admin: show the "not filled in" warning + placeholders,
     contact: the site contact (email / https link) shown when the coordinator's details are empty } */
  function statementHTML(l, opts) {
    l = (l || lang()).slice(0, 2).toLowerCase();
    opts = opts || {};
    var S = ST[l] || ST.en, d = isRtl(l) ? 'rtl' : 'ltr', full = !!opts.full;
    function li(a) { return '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
    function val(k) {
      var v = CONTACT[k];
      if (!v && k === 'reviewed' && full) return '<span dir="auto">' + esc(fmtDay(REVIEWED_DEFAULT, l)) + '</span>';
      if (!v) return '<span class="a11y-ph">' + esc(S.ph[k]) + '</span>';
      if (k === 'email') return '<a href="mailto:' + esc(v) + '" dir="ltr">' + esc(v) + '</a>';
      if (k === 'phone') return '<a href="tel:' + esc(String(v).replace(/[^\d+]/g, '')) + '" dir="ltr">' + esc(v) + '</a>';
      return k === 'reviewed' ? '<span dir="ltr">' + esc(v) + '</span>' : esc(v);
    }
    if (full) {
      var empty = !CONTACT.name && !CONTACT.email && !CONTACT.phone, c = String(opts.contact || '').trim(), cl = '';
      if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(c)) cl = '<a href="mailto:' + esc(c) + '" dir="ltr">' + esc(c) + '</a>';
      else if (/^https:\/\/[^\s<>"']+$/i.test(c)) cl = '<a href="' + esc(c) + '" target="_blank" rel="noopener" dir="ltr">' + esc(c.replace(/^https:\/\//i, '')) + '</a>';
      var rows = ['name', 'email', 'phone'].filter(function (k) { return CONTACT[k] || opts.admin; })
        .map(function (k) { return '<dt>' + esc(S[k]) + '</dt><dd>' + val(k) + '</dd>'; }).join('');
      return '<section class="a11y-statement a11y-full" lang="' + l + '" dir="' + d + '">' +
        (opts.admin && empty ? '<p class="a11y-warn" role="note">' + esc(S.adminWarn) + '</p>' : '') +
        '<p>' + esc(S.intro) + '</p><p>' + esc(S.law) + '</p>' +
        '<h2 id="a11y-status">' + esc(S.statusH) + '</h2><p>' + esc(S.level) + '</p><p>' + esc(S.status) + '</p>' +
        '<h2 id="a11y-menu">' + esc(S.menuH) + '</h2><p>' + esc(S.menu) + '</p>' +
        '<h2 id="a11y-adj">' + esc(S.adjH) + '</h2>' + li(S.adj) +
        '<h2 id="a11y-alt">' + esc(S.altH) + '</h2>' + li(S.alt) +
        '<h2 id="a11y-lim">' + esc(S.limH) + '</h2>' + li(S.lim) +
        '<h2 id="a11y-test">' + esc(S.testH) + '</h2><p>' + esc(S.test) + '</p>' +
        '<h2 id="a11y-phys">' + esc(S.physH) + '</h2><p>' + esc(S.phys) + '</p>' +
        '<h2 id="a11y-contact">' + esc(S.contactH) + '</h2><p>' + esc(S.contact) + '</p>' +
        (rows ? '<dl class="a11y-contact">' + rows + '</dl>' : '') +
        (cl && (empty || !CONTACT.email) ? '<p>' + esc(S.general) + ' ' + cl + '</p>' : '') +
        '<h3>' + esc(S.respH) + '</h3><p>' + esc(S.resp) + '</p>' +
        '<p class="a11y-upd">' + esc(S.reviewed) + ': ' + val('reviewed') + '</p>' +
        '</section>';
    }
    return '<section class="a11y-statement" lang="' + l + '" dir="' + d + '">' +
      '<h2>' + esc(S.title) + '</h2>' +
      '<p>' + esc(S.intro) + '</p><p>' + esc(S.law) + '</p><p>' + esc(S.level) + '</p>' +
      '<h3>' + esc(S.menuH) + '</h3><p>' + esc(S.menu) + '</p>' +
      '<h3>' + esc(S.adjH) + '</h3>' + li(S.adj) +
      '<h3>' + esc(S.limH) + '</h3>' + li(S.lim) +
      '<h3>' + esc(S.physH) + '</h3><p>' + esc(S.phys) + '</p>' +
      '<h3>' + esc(S.contactH) + '</h3><p>' + esc(S.contact) + '</p>' +
      '<dl class="a11y-contact">' +
      '<dt>' + esc(S.name) + '</dt><dd>' + val('name') + '</dd>' +
      '<dt>' + esc(S.email) + '</dt><dd>' + val('email') + '</dd>' +
      '<dt>' + esc(S.phone) + '</dt><dd>' + val('phone') + '</dd>' +
      '</dl>' +
      '<p class="a11y-upd">' + esc(S.reviewed) + ': ' + val('reviewed') + '</p>' +
      '</section>';
  }

  /* ---------- icons ---------- */
  var IC = {
    access: '<circle cx="12" cy="12" r="10.2"/><circle cx="12" cy="6.7" r="1.7" fill="currentColor" stroke="none"/><path d="M6.6 9.7l5.4 1.1 5.4-1.1M12 10.8v3.4l-2.7 5.1M12 14.2l2.7 5.1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    text: '<path d="M3 19l5.2-14h.6L14 19M5 14.5h7M15.5 19l3-8h.5l3 8M16.4 16.6h4.3"/>',
    contrast: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    cursor: '<path d="M5 3.5l13.5 7-6 1.6-2.2 6.4z"/><path d="M12.4 12.2l5.3 5.3"/>',
    cb: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/>',
    readable: '<path d="M4 6h16M4 11h16M4 16h10"/><path d="M4 20.5h13" opacity=".45"/>',
    links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    focus: '<path d="M4 8.5V4h4.5M15.5 4H20v4.5M20 15.5V20h-4.5M8.5 20H4v-4.5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.2"/>',
    noanim: '<circle cx="12" cy="12" r="9"/><path d="M10 8.8v6.4M14 8.8v6.4"/>',
    mono: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6.5" rx="1.6"/><rect x="17" y="14" width="4" height="6.5" rx="1.6"/>',
    flash: '<rect x="2.5" y="4" width="19" height="16" rx="3"/><path d="M12.8 7.5l-3.3 5h3l-1.3 4 3.4-5.3h-3z" fill="currentColor" stroke-width="1"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.5-5.8L4 8.5"/><path d="M4 4v4.5h4.5"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/>'
  };
  function svg(n, cls) { return '<svg class="' + (cls || 'a11y-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + IC[n] + '</svg>'; }

  /* ---------- UI ---------- */
  var ui = {}, opener = null, inerted = [], listeners = [];
  function el(tag, attrs, html) {
    var e = document.createElement(tag), k;
    for (k in attrs || {}) { if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html) e.innerHTML = html;
    return e;
  }
  var uid = 0;
  function switchRow(key, icon, hintKey) {
    var id = 'a11y-' + key + '-' + (++uid);
    var b = el('button', { type: 'button', role: 'switch', class: 'a11y-row', 'aria-checked': 'false', 'data-key': key, 'aria-labelledby': id + 'l' });
    b.innerHTML = '<span class="a11y-rico">' + svg(icon) + '</span><span class="a11y-rtx"><span class="a11y-rl" id="' + id + 'l" data-t="' + key + '"></span>' +
      (hintKey ? '<span class="a11y-rh" id="' + id + 'h" data-t="' + hintKey + '"></span>' : '') + '</span><span class="a11y-sw" aria-hidden="true"><i></i></span>';
    if (hintKey) b.setAttribute('aria-describedby', id + 'h');
    b.addEventListener('click', function () { set(key, !st[key]); if (key === 'flash' && st.flash) setTimeout(function () { beat(true); }, 60); });
    return b;
  }
  function segRow(key, icon, values, labelFor, hintKey) {
    var id = 'a11y-' + key + '-' + (++uid);
    var w = el('div', { class: 'a11y-seg-row' });
    w.innerHTML = '<div class="a11y-seg-head"><span class="a11y-rico">' + svg(icon) + '</span><span class="a11y-rtx"><span class="a11y-rl" id="' + id + 'l" data-t="' + key + '"></span>' +
      (hintKey ? '<span class="a11y-rh" id="' + id + 'h" data-t="' + hintKey + '"></span>' : '') + '</span></div>';
    var g = el('div', { class: 'a11y-seg', role: 'radiogroup', 'aria-labelledby': id + 'l', 'data-key': key });
    if (hintKey) g.setAttribute('aria-describedby', id + 'h');
    values.forEach(function (v) {
      var b = el('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-v': String(v), tabindex: '-1' });
      var lf = labelFor(v);
      if (lf.t) b.setAttribute('data-t', lf.t); else { b.textContent = lf.s; b.dir = 'ltr'; }
      if (lf.style) b.setAttribute('style', lf.style);
      b.addEventListener('click', function () { set(key, typeof DEF[key] === 'number' ? +v : v); });
      g.appendChild(b);
    });
    g.addEventListener('keydown', function (e) {
      var ks = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1, Home: 'h', End: 'e' };
      if (!(e.key in ks)) return;
      e.preventDefault();
      var i = values.map(String).indexOf(String(st[key])), n = values.length, m = ks[e.key];
      if (m === 'h') i = 0; else if (m === 'e') i = n - 1;
      else { if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && getComputedStyle(g).direction === 'rtl') m = -m; i = Math.max(0, Math.min(n - 1, i + m)); }
      set(key, typeof DEF[key] === 'number' ? +values[i] : values[i]);
      g.querySelectorAll('[role=radio]')[i].focus();
    });
    w.appendChild(g);
    return w;
  }
  function group(tkey, rows) {
    var id = 'a11y-g-' + tkey;
    var s = el('section', { class: 'a11y-grp', 'aria-labelledby': id });
    s.appendChild(el('h3', { id: id, class: 'a11y-gh', 'data-t': tkey }));
    var box = el('div', { class: 'a11y-card' });
    rows.forEach(function (r) { box.appendChild(r); });
    s.appendChild(box);
    return s;
  }

  function build() {
    if (ui.root) return;
    var r = ui.root = el('div', { id: 'a11y-root', class: 'a11y-ui' });
    ui.gray = el('div', { class: 'a11y-gray', 'aria-hidden': 'true' });
    ui.flash = el('div', { class: 'a11y-flashframe', 'aria-hidden': 'true' });
    ui.fab = el('button', { type: 'button', class: 'a11y-fab', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': 'a11y-panel', 'aria-keyshortcuts': 'Alt+Shift+A' }, svg('access', 'a11y-fab-ic'));
    ui.scrim = el('div', { class: 'a11y-scrim', hidden: '' });
    var p = ui.panel = el('div', { id: 'a11y-panel', class: 'a11y-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'a11y-title', 'aria-describedby': 'a11y-sub', tabindex: '-1', hidden: '' });
    var head = el('div', { class: 'a11y-head' });
    head.innerHTML = '<span class="a11y-badge">' + svg('access') + '</span><div class="a11y-htx"><h2 id="a11y-title" data-t="title"></h2><p id="a11y-sub" data-t="sub"></p></div>';
    ui.close = el('button', { type: 'button', class: 'a11y-x', 'data-ta': 'close' }, svg('close'));
    head.appendChild(ui.close);
    var body = el('div', { class: 'a11y-body' });
    body.appendChild(group('gDisplay', [
      segRow('text', 'text', SIZES, function (v) { return { s: v + '%', style: 'font-size:' + (0.86 + (v - 100) / 250).toFixed(2) + 'em' }; }),
      switchRow('contrast', 'contrast', 'contrastH'),
      switchRow('cursor', 'cursor')
    ]));
    body.appendChild(group('gColour', [
      segRow('cb', 'cb', CBS, function (v) { return { t: v === 'off' ? 'cbOff' : v === 'safe' ? 'cbSafe' : 'cbMono' }; }, 'cbH')
    ]));
    body.appendChild(group('gReading', [
      switchRow('readable', 'readable', 'readableH'),
      switchRow('links', 'links'),
      switchRow('focus', 'focus', 'focusH')
    ]));
    body.appendChild(group('gMotion', [switchRow('noanim', 'noanim', 'noanimH')]));
    body.appendChild(group('gHearing', [switchRow('mono', 'mono', 'monoH'), switchRow('flash', 'flash', 'flashH')]));
    var foot = el('div', { class: 'a11y-foot' });
    ui.reset = el('button', { type: 'button', class: 'a11y-btn' }, svg('reset') + '<span data-t="reset"></span>');
    ui.stmt = el('a', { href: '#accessibility', class: 'a11y-btn a11y-link' }, svg('doc') + '<span data-t="statement"></span>');   /* growth: the standalone statement page */
    foot.appendChild(ui.reset); foot.appendChild(ui.stmt);
    var kb = el('p', { class: 'a11y-kbd' }, '<span data-t="shortcut"></span> <span dir="ltr" class="a11y-combo"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd></span>');
    ui.live = el('p', { class: 'a11y-sr', 'aria-live': 'polite', role: 'status' });
    body.appendChild(foot); body.appendChild(kb);
    p.appendChild(head); p.appendChild(body); p.appendChild(ui.live);
    r.appendChild(ui.gray); r.appendChild(ui.flash); r.appendChild(ui.fab); r.appendChild(ui.scrim); r.appendChild(p);
    document.body.appendChild(r);

    ui.fab.addEventListener('click', function () { if (p.hidden) open(); else close(); });
    ui.close.addEventListener('click', function () { close(); });
    ui.scrim.addEventListener('click', function () { close(); });
    ui.reset.addEventListener('click', function () { reset(); ui.live.textContent = ''; setTimeout(function () { ui.live.textContent = t('resetDone'); }, 30); });
    ui.stmt.addEventListener('click', function () { close(true); });
    p.addEventListener('keydown', onPanelKey);
    // the app's own document-level shortcuts (space, arrows, Escape…) must not fire while the dialog is used
    p.addEventListener('keyup', function (e) { e.stopPropagation(); });

    texts(); sync(); watchBottom();
  }

  function texts() {
    if (!ui.root) return;
    var l = lang(), d = isRtl(l) ? 'rtl' : 'ltr';
    ui.root.setAttribute('dir', d); ui.root.setAttribute('lang', l);
    ui.root.querySelectorAll('[data-t]').forEach(function (n) { n.textContent = t(n.getAttribute('data-t')); });
    ui.root.querySelectorAll('[data-ta]').forEach(function (n) { var s = t(n.getAttribute('data-ta')); n.setAttribute('aria-label', s); n.title = s; });
    ui.fab.setAttribute('aria-label', t('fab'));
    ui.fab.title = t('fab') + ' (Alt+Shift+A)';
  }
  function sync() {
    if (!ui.root) return;
    ui.root.querySelectorAll('[role=switch][data-key]').forEach(function (b) { b.setAttribute('aria-checked', st[b.getAttribute('data-key')] ? 'true' : 'false'); });
    ui.root.querySelectorAll('.a11y-seg').forEach(function (g) {
      var k = g.getAttribute('data-key');
      g.querySelectorAll('[role=radio]').forEach(function (b) { var on = b.getAttribute('data-v') === String(st[k]); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    });
  }

  function focusables() {
    return Array.prototype.filter.call(ui.panel.querySelectorAll('button,a[href],[tabindex]:not([tabindex="-1"])'), function (n) {
      return !n.disabled && n.offsetParent !== null && n.tabIndex >= 0;
    });
  }
  function onPanelKey(e) {
    e.stopPropagation(); // keep the app's global key handlers out of the dialog
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.altKey && e.shiftKey && e.code === 'KeyA') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || a === ui.panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  }
  function setInert(on) {
    if (on) {
      Array.prototype.forEach.call(document.body.children, function (c) {
        if (c === ui.root || c.tagName === 'SCRIPT' || c.hasAttribute('inert')) return;
        c.setAttribute('inert', ''); inerted.push(c);
      });
    } else { inerted.forEach(function (c) { c.removeAttribute('inert'); }); inerted = []; }
  }
  function open() {
    build();
    if (!ui.panel.hidden) return;
    opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : ui.fab;
    ui.panel.hidden = false; ui.scrim.hidden = false;
    ui.fab.setAttribute('aria-expanded', 'true'); ui.root.classList.add('open');
    setInert(true);
    ui.panel.focus({ preventScroll: true });
  }
  function close(keepFocusHere) {
    if (!ui.panel || ui.panel.hidden) return;
    ui.panel.hidden = true; ui.scrim.hidden = true;
    ui.fab.setAttribute('aria-expanded', 'false'); ui.root.classList.remove('open');
    setInert(false);
    if (!keepFocusHere) { var o = opener && document.contains(opener) ? opener : ui.fab; try { o.focus({ preventScroll: true }); } catch (e) {} }
    opener = null;
  }

  /* keep the button clear of the full-song bar (#fullbar) and the DJ toasts (.djnote, centred at the bottom) */
  var toast = null;
  function updLift() {
    if (!ui.root) return;
    var fb = document.getElementById('fullbar'), lift = fb && !fb.hidden ? fb.offsetHeight : 0;
    var dp = document.getElementById('dPlayer'); if (dp && !dp.hidden) lift = Math.max(lift, dp.offsetHeight);   /* Discover player bar */
    var ck = document.getElementById('ckBar'); if (ck && !ck.hidden) lift = Math.max(lift, ck.offsetHeight);     /* growth: cookie banner */
    if (toast && !toast.hidden && document.contains(toast)) {
      var r = toast.getBoundingClientRect(), f = ui.fab.getBoundingClientRect();
      var fl = f.left, fr = f.right, H = window.innerHeight;
      if (r.width && r.left < fr + 8 && r.right > fl - 8) lift = Math.max(lift, Math.round(H - r.top + 12 - 16));
    }
    ui.root.style.setProperty('--a11y-lift', lift + 'px');
  }
  function hookToast(n) {
    if (!n || n === toast) return;
    toast = n;
    new MutationObserver(function () { requestAnimationFrame(updLift); }).observe(n, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, characterData: true, subtree: true });
    updLift();
  }
  function watchBottom() {
    var fb = document.getElementById('fullbar');
    if (fb) {
      if (window.ResizeObserver) new ResizeObserver(updLift).observe(fb);
      new MutationObserver(updLift).observe(fb, { attributes: true, attributeFilter: ['hidden'] });
    }
    hookToast(document.getElementById('djNote'));
    // the DJ view builds its toast lazily; it animates in (.djnote.in), so catch it on the first animation
    document.addEventListener('animationstart', function (e) { if (e.target && e.target.classList && e.target.classList.contains('djnote')) { hookToast(e.target); updLift(); } }, true);
    document.addEventListener('animationend', function (e) { if (e.target === toast) updLift(); }, true);
    window.addEventListener('resize', updLift);
    new MutationObserver(function () { requestAnimationFrame(updLift); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });   /* body.hasdp = Discover player bar */
    updLift();
  }

  /* ---------- state ---------- */
  function emit(key) {
    var s = get();
    listeners.slice().forEach(function (fn) { try { fn(s, key); } catch (e) { console.error(e); } });
    try { document.dispatchEvent(new CustomEvent('a11y-change', { detail: s })); } catch (e) {}
  }
  function get(key) { if (key == null) { var o = {}, k; for (k in st) o[k] = st[k]; return o; } return st[key]; }
  function set(key, value) {
    if (typeof key === 'object' && key) { var n = clean(Object.assign(get(), key)); st = n; }
    else {
      if (!(key in DEF)) return;
      var o = {}; o[key] = value;
      var c = clean(Object.assign(get(), o));
      if (c[key] === st[key]) return;
      st = c;
    }
    save(); applyClasses(); sync(); emit(typeof key === 'string' ? key : null);
  }
  function reset() { st = clean(null); save(); applyClasses(); sync(); emit(null); }
  function on(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  /* visual beat: a glowing frame around the viewport (max ~3 flashes a second) */
  var lastFlash = 0, flashT = 0;
  function beat(isBar) {
    if (!st.flash) return;
    build();
    var now = (window.performance && performance.now()) || Date.now();
    if (!isBar && now - lastFlash < 330) return;
    lastFlash = now;
    var f = ui.flash;
    f.classList.remove('on', 'bar'); void f.offsetWidth;
    if (isBar) f.classList.add('bar');
    f.classList.add('on');
    clearTimeout(flashT);
    flashT = setTimeout(function () { f.classList.remove('on'); }, st.noanim ? 140 : 70);
  }

  /* map the app's per-slice waveform colour (r = lows, g = mids, b = highs, 0–255) to the safe palette */
  function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  var PL = hex(PALETTE.low), PM = hex(PALETTE.mid), PH = hex(PALETTE.high);
  function waveColor(r, g, b) {
    var lo = Math.max(0, r - 40), mi = Math.max(0, g - 40), hi = Math.max(0, b - 50), s = lo + mi + hi || 1, mx = Math.max(lo, mi, hi) / 215;
    var k = 0.35 + 0.65 * Math.min(1, mx), out = [0, 0, 0];
    for (var i = 0; i < 3; i++) out[i] = Math.round((PL[i] * lo + PM[i] * mi + PH[i] * hi) / s * k);
    return 'rgb(' + out[0] + ',' + out[1] + ',' + out[2] + ')';
  }

  /* ---------- global wiring ---------- */
  window.addEventListener('keydown', function (e) {
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyA') {
      e.preventDefault(); e.stopPropagation();
      build(); if (ui.panel.hidden) open(); else close();
    }
  }, true);
  window.addEventListener('storage', function (e) { if (e.key === KEY) { st = load(); applyClasses(); sync(); emit(null); } });
  new MutationObserver(function () { texts(); }).observe(root, { attributes: true, attributeFilter: ['lang'] });

  function boot() { build(); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);

  window.A11Y = {
    get: get, set: set, on: on, reset: reset,
    open: open, close: function () { close(); },
    palette: PALETTE,
    activePalette: function () { return st.cb === 'safe' ? PALETTE : null; },
    waveColor: waveColor,
    beat: beat,
    statementHTML: statementHTML
  };
})();
