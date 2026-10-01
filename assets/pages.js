/* Chord Room — About and Pricing pages.
   window.PAGES = { renderAbout(el, billing?), renderPricing(el, billing, state), lang() }
   The integrator sets PAGES.onNav(view), PAGES.onSignup(), PAGES.onSubscribe(planId), PAGES.onManage() and may set PAGES.contact.
   renderPricing state: { signedIn, plan, credits, planUntil, portal (URL|null), payStatus ('active'|'cancelled'|'past_due'|null), renews (ISO|null) }.
   Text comes from the tables below (he/en/ar/ru/es), picked by <html lang>. Numbers, prices and codes stay LTR. */
(function () {
'use strict';

/* ---------- strings ---------- */
const S = {
he: {
  aboutEyebrow: 'Chord Room · אולפן בתוך הדפדפן',
  heroH: 'לשמוע את השיר <em>מבפנים.</em>',
  heroP: 'קצב, סולם ואקורדים תוך שניות, הפרדת ערוצים ב־AI, מיקס חי על שני דקים וייצוא ל־FL Studio. הכל רץ בדפדפן, בלי להתקין כלום.',
  ctaTool: 'פתחו את הכלי', ctaDj: 'למיקס החי', ctaDisc: 'גלו מה חם עכשיו',
  heroNote: ['חינם להתחלה', 'בלי התקנה', '5 שפות'],
  rdBpm: 'BPM', rdKey: 'סולם', rdCam: 'אורך', rdLufs: 'LUFS',
  stems: ['שירה', 'תופים', 'בס', 'שאר הכלים'],
  featEyebrow: 'מה יש בפנים', featH: 'כל השיר, במקום אחד.',
  f1k: 'הכלי', f1h: 'ניתוח, אקורדים ונגינה',
  f1p: 'מעלים שיר ומקבלים תמונה מלאה שלו — קצב, סולם, אקורדים ועוצמה — ואז מנגנים, משנים ומפרקים אותו לערוצים.',
  f1l: ['BPM, סולם עם קוד קאמלוט ועוצמה (LUFS)',
    'אקורדים עם דף אקורדים חי, דיאגרמות לגיטרה ולפסנתר, טרנספוזיציה וקאפו',
    'צורת גל RGB בסגנון DJ — אדום לבסים, ירוק לאמצע, כחול לגבוהים — עם גריד ביטים, לופים, Hot Cues ומטרונום',
    'שינוי קצב בלי לשנות את גובה הצליל, ושינוי סולם בלי לשנות את הקצב',
    'הפרדת ערוצים ב־AI לשירה, תופים, בס ושאר הכלים (Demucs v4 בדפדפן, עם האצת GPU כשיש) ומיקסר עם השתקה, סולו וקריוקי'],
  f2k: 'גלה שירים', f2h: 'מה חם עכשיו — כבר מנותח',
  f2p: 'השירים הטרנדיים והחדשים בעולם ובישראל, מתוך המצעדים של Deezer. כל שיר מנותח לסולם, BPM ואקורדים מתוך קטע ההאזנה של 30 השניות.',
  f2l: ['מצעדים ושירים חדשים — בעולם ובישראל', 'סולם, BPM ואקורדים לכל שיר',
    'התאמות DJ: סולמות קאמלוט תואמים וקצב בטווח של 6%', 'השמעת השיר המלא דרך הנגן הרשמי של Deezer'],
  f3k: 'מיקס חי', f3h: 'שני דקים, סנכרון מושלם',
  f3p: 'טוענים שני שירים, מסנכרנים קצב וביטים ברמת הדגימה ומעבירים ביניהם בלייב — עם ציון התאמה שאומר מה לעשות.',
  f3l: ['סנכרון קצב וביטים מדויק לדגימה, Key Lock, הזזת סולם וסנכרון סולם',
    'EQ בשלושה תחומים עם Kill, פילטר וקרוספיידר', 'אפקטי ביט: Echo,‏ Reverb,‏ Flanger,‏ Gate,‏ Roll ו־Brake',
    'סמפלר (צופר, סירנה, Riser,‏ Drop), Hot Cues ולופים', 'מעבר אוטומטי שנכנס בתחילת תיבה ומחליף בסים',
    'הקלטת המיקס, ציון התאמה על גלגל סולמות עם עצה בלחיצה אחת, והצעות לשיר הבא מהשירים שלכם ומהקטלוג'],
  f4k: 'ייצוא למפיקים', f4h: 'ישר ל־FL Studio',
  f4p: 'מוציאים בדיוק את מה שצריך להפקה — בקצב ובסולם שבחרתם.',
  f4l: ['WAV ו־MP3 ב־320 kbps: ערוצים, אינסטרומנטלי ומקור', 'MIDI לפסנתר: אקורדים, קו בס ומלודיית השירה', 'הכל בקצב ובסולם שבחרתם'],
  f5k: 'חשבון והשירים שלי', f5h: 'הספרייה שלכם, איתכם בכל מקום',
  f5p: 'נרשמים עם אימייל וסיסמה, והשירים נשמרים בחשבון — כולל קובץ האודיו, באופן פרטי.',
  f5l: ['פרופיל עם תמונה, שם וביו', '״השירים שלי״ נשמרים בחשבון יחד עם קובץ האודיו (פרטי)', 'מצב בהיר וכהה',
    '5 שפות: עברית, אנגלית, ערבית, רוסית וספרדית', 'תוסף נגישות'],
  howEyebrow: 'איך זה עובד', howH: 'משיר למיקס בשלושה צעדים',
  how: [['מעלים שיר', 'MP3,‏ WAV,‏ FLAC ועוד — או פותחים שיר מ״השירים שלי״.'],
    ['הניתוח רץ בדפדפן', 'קצב, גריד ביטים, סולם, אקורדים ועוצמה — תוך שניות, על המכשיר שלכם.'],
    ['מנגנים, מפרידים, ממקסים', 'לופים, שינוי סולם וקצב, הפרדה לערוצים, מיקס על הדקים וייצוא WAV,‏ MP3 ו־MIDI.']],
  ptsEyebrow: 'נקודות ומסלולים', ptsH: 'רוב הדברים בחינם.',
  ptsP: 'ניתוח, אקורדים, גלה שירים, המיקס החי וייצוא MIDI — בחינם. נקודות נדרשות רק לעבודת ה־AI הכבדה: הפרדת ערוצים והורדת ערוצים.',
  ptsGift: 'מתנת הרשמה', ptsSep: 'הפרדת ערוצים', ptsDl: 'הורדת ערוצים', ptsMonthly: 'מסלולים חודשיים מוסיפים נקודות בכל חודש.', ptsCta: 'למסלולים ולמחירים',
  prvEyebrow: 'פרטיות', prvH: 'המוזיקה שלכם נשארת שלכם.',
  prv: [['העלאות פרטיות', 'שירים שאתם מעלים נשמרים באופן פרטי בחשבון שלכם. מנהלי האתר יכולים לגשת אליהם לצורכי תמיכה ופיקוח.'],
    ['ניתוחים משותפים, אף פעם לא אודיו', 'ניתוחים של קטעי האזנה מ״גלה שירים״ נשמרים בקטלוג ציבורי — סולם, BPM ואקורדים בלבד, לעולם לא אודיו.'],
    ['מצעדים מ־Deezer', 'נתוני המצעדים וקטעי ההאזנה של 30 שניות מגיעים מ־Deezer, ושירים מלאים מתנגנים בנגן הרשמי שלהם.']],
  faqEyebrow: 'שאלות נפוצות', faqH: 'שאלות ותשובות',
  faq: [['צריך להתקין משהו?', 'לא. הכל עובד בדפדפן — גם הניתוח וגם הפרדת הערוצים רצים על המכשיר שלכם. כשאתם מחוברים, השיר נשמר ב״השירים שלי״ באופן פרטי.'],
    ['אילו קבצים אפשר להעלות?', 'MP3,‏ WAV,‏ M4A/AAC,‏ OGG ו־FLAC. לשמירה בחשבון — עד 50MB לקובץ.'],
    ['ומה אם אקורד או הביט לא מדויקים?', 'הזיהוי אוטומטי, ואפשר לתקן: לערוך אקורדים, להזיז את גריד הביטים ולחצות או להכפיל את ה־BPM.'],
    ['זה עובד עם FL Studio ותוכנות אחרות?', 'כן. קבצי WAV,‏ MP3 ו־MIDI נפתחים בכל תוכנת הפקה, וה־MIDI מותאם ל־FL Studio.'],
    ['אפשר לשמוע שירים מלאים ב״גלה שירים״?', 'קטע ההאזנה הוא 30 שניות. כפתור השיר המלא פותח את הנגן הרשמי של Deezer — מלא למחוברים ל־Deezer, ו־30 שניות לשאר.'],
    ['מה עולה נקודות?', 'רק הפרדת ערוצים ב־AI והורדת ערוצים. כל השאר בחינם.']],
  a11yEyebrow: 'נגישות', a11yH: 'הצהרת נגישות',
  a11yPh: 'אנחנו רוצים ש־Chord Room יהיה נוח לכל אחד. באתר יש תוסף נגישות, מצב בהיר וכהה וחמש שפות. נתקלתם בקושי? ספרו לנו ונתקן.',
  contactL: 'שאלות, רעיונות או בעיה?', contactW: 'כתבו לנו', contactNone: 'נשמח לשמוע מכם.',
  credits: 'הפרדת ערוצים: Demucs v4 של Meta, מורץ עם ONNX Runtime Web · שינוי קצב וסולם: Signalsmith Stretch · מצעדים וקטעי האזנה: Deezer',
  /* pricing */
  prEyebrow: 'מסלולים ונקודות', prH: 'משלמים רק על העבודה הכבדה.',
  prP: 'ניתוח, אקורדים, גלה שירים, המיקס החי ו־MIDI — בחינם. נקודות משמשות להפרדת ערוצים ב־AI ולהורדת ערוצים.',
  stActive: 'המנוי פעיל', stRenews: 'מתחדש ב־{d}', stCancelled: 'המנוי בוטל · פעיל עד {d}', stCancelledNd: 'המנוי בוטל', stPastDue: 'התשלום נכשל — עדכנו את אמצעי התשלום', manage: 'ניהול המנוי',
  balance: 'היתרה שלכם', planL: 'מסלול', until: 'בתוקף עד {d}',
  free: 'חינם', perMonth: 'לחודש', oneTime: 'חד־פעמי', buyOr: 'או',
  incFree: ['BPM, סולם ועוצמה', 'אקורדים, דף אקורדים ודיאגרמות', 'גלה שירים ומיקס חי', 'ייצוא MIDI לפסנתר'],
  incAll: 'כל מה שבמסלול החינמי', incPts: '{pts} נוספות בכל חודש',
  best: 'מומלץ', current: 'המסלול שלכם',
  btnSignup: 'הרשמה בחינם', btnSubSignup: 'הרשמה והצטרפות', btnSub: 'הצטרפות למסלול', btnYour: 'המסלול שלכם', btnIncl: 'כלול במסלול שלכם', btnSoon: 'בקרוב', btnContact: 'כתבו לנו', usdNote: 'המחירים בשקלים; הדולר משוער',
  offH: 'כרגע הכל בחינם', offP: 'אין צורך בנקודות כרגע — כל הכלים, כולל הפרדת ערוצים ב־AI והורדת ערוצים, פתוחים לשימוש בחינם.',
  tblEyebrow: 'מחירון', tblH: 'על מה משלמים בנקודות', tblA: 'פעולה', tblC: 'עלות',
  rowSep: 'הפרדת ערוצים ב־AI (שירה, תופים, בס, שאר הכלים)', rowDl: 'הורדת ערוצים (WAV / MP3)',
  rowAn: 'ניתוח: BPM, סולם, אקורדים, עוצמה', rowDisc: 'גלה שירים ומיקס חי', rowMidi: 'ייצוא MIDI', freeV: 'חינם', rowGift: 'מתנת הרשמה',
  prFaqH: 'שאלות על נקודות',
  prFaq: [['מה הן נקודות?', 'נקודות הן הקרדיט של האתר. הפרדת ערוצים ב־AI עולה {sep}, והורדת ערוצים עולה {dl}. כל השאר בחינם.'],
    ['מה מקבלים בהרשמה?', 'כל חשבון חדש מקבל {gift} במתנה.'],
    ['איך עובד מסלול חודשי?', 'המסלול מוסיף את הנקודות שלו ליתרה שלכם בכל חודש. כשאתם מחוברים, היתרה והמסלול מופיעים בראש העמוד.'],
    ['חייבים מסלול כדי להשתמש באתר?', 'לא. ניתוח, אקורדים, גלה שירים, המיקס החי וייצוא MIDI — בחינם.']],
  prContact: 'שאלות על מסלולים ותשלום?',
  plans: { free: 'חינם', basic: 'בסיסי', pro: 'מקצועי', studio: 'סטודיו' }
},
en: {
  aboutEyebrow: 'Chord Room · a studio in your browser',
  heroH: 'Hear the song <em>from the inside.</em>',
  heroP: 'Tempo, key and chords in seconds, AI stem separation, a live two-deck mix and export to FL Studio. It all runs in your browser — nothing to install.',
  ctaTool: 'Open the tool', ctaDj: 'Go to DJ Mix', ctaDisc: 'See what’s trending',
  heroNote: ['Free to start', 'No install', '5 languages'],
  rdBpm: 'BPM', rdKey: 'Key', rdCam: 'Length', rdLufs: 'LUFS',
  stems: ['Vocals', 'Drums', 'Bass', 'Other'],
  featEyebrow: 'What’s inside', featH: 'The whole song, in one place.',
  f1k: 'The tool', f1h: 'Analyse, read the chords, play along',
  f1p: 'Upload a song and get the full picture — tempo, key, chords and loudness — then play it, reshape it and split it into stems.',
  f1l: ['BPM, key with its Camelot code, and loudness (LUFS)',
    'Chords with a live chord sheet, guitar and piano diagrams, transpose and capo',
    'RGB DJ waveform — red lows, green mids, blue highs — with beat grid, loops, hot cues and a metronome',
    'Change the tempo without changing the pitch, and the key without changing the tempo',
    'AI stem separation into vocals, drums, bass and other (Demucs v4 in the browser, GPU-accelerated when available) with a mute / solo / karaoke mixer'],
  f2k: 'Discover', f2h: 'What’s hot now — already analysed',
  f2p: 'Trending and new songs worldwide and in Israel, from the Deezer charts. Every track is analysed for key, BPM and chords from its 30-second preview.',
  f2l: ['Charts and new releases — worldwide and Israel', 'Key, BPM and chords for every track',
    'DJ matches: compatible Camelot keys, tempo within 6%', 'Full-song playback through Deezer’s official player'],
  f3k: 'DJ Mix', f3h: 'Two decks, locked in sync',
  f3p: 'Load two songs, sync tempo and beats sample-accurately and mix between them live — with a match score that tells you what to do.',
  f3l: ['Sample-accurate tempo and beat sync, key lock, key shift and key sync',
    '3-band EQ with kill, filter and crossfader', 'Beat FX: echo, reverb, flanger, gate, roll and brake',
    'Sampler (horn, siren, riser, drop), hot cues and loops', 'Auto transition with a bar-aligned entry and bass swap',
    'Record the mix, a match score on a key wheel with one-click advice, and next-song picks from your songs and the catalog'],
  f4k: 'Export for producers', f4h: 'Straight into FL Studio',
  f4p: 'Take out exactly what you need for production — in the tempo and key you chose.',
  f4l: ['WAV and MP3 320 kbps: stems, instrumental and original', 'Piano MIDI: chords, bass line and vocal melody', 'Everything in your chosen tempo and key'],
  f5k: 'Accounts & My songs', f5h: 'Your library, wherever you are',
  f5p: 'Sign up with email and password and your songs are saved to your account — audio file included, kept private.',
  f5l: ['Profile with photo, name and bio', 'My songs saved with the audio file (private)', 'Light and dark mode',
    '5 languages: Hebrew, English, Arabic, Russian and Spanish', 'Accessibility plugin'],
  howEyebrow: 'How it works', howH: 'From file to mix in three steps',
  how: [['Upload a song', 'MP3, WAV, FLAC and more — or open one from My songs.'],
    ['It’s analysed in your browser', 'Tempo, beat grid, key, chords and loudness in seconds, right on your device.'],
    ['Play, separate, mix', 'Loop it, change key and tempo, split it into stems, take it to the decks and export WAV, MP3 and MIDI.']],
  ptsEyebrow: 'Points & plans', ptsH: 'Most of it is free.',
  ptsP: 'Analysis, chords, Discover, the DJ mix and MIDI export cost nothing. Points are only for the heavy AI work: stem separation and stem downloads.',
  ptsGift: 'Signup gift', ptsSep: 'Stem separation', ptsDl: 'Stem download', ptsMonthly: 'Monthly plans add points every month.', ptsCta: 'See plans & prices',
  prvEyebrow: 'Privacy', prvH: 'Your music stays yours.',
  prv: [['Private uploads', 'Songs you upload are stored privately in your account. Site admins can access them for support and moderation.'],
    ['Shared analyses, never audio', 'Analyses of Discover previews go into a public catalog — key, BPM and chords only, never audio.'],
    ['Charts by Deezer', 'Chart data and 30-second previews come from Deezer; full songs play in Deezer’s official player.']],
  faqEyebrow: 'FAQ', faqH: 'Questions & answers',
  faq: [['Do I need to install anything?', 'No. Everything works in the browser — analysis and stem separation both run on your device. When you’re signed in, the song is saved privately to My songs.'],
    ['Which files can I upload?', 'MP3, WAV, M4A/AAC, OGG and FLAC. To save a song to your account, up to 50 MB per file.'],
    ['What if a chord or the beat is off?', 'Detection is automatic and you can correct it: edit chords, nudge the beat grid, and halve or double the BPM.'],
    ['Does it work with FL Studio and other DAWs?', 'Yes. WAV, MP3 and MIDI files open in any DAW, and the MIDI is tuned for FL Studio.'],
    ['Can I hear full songs in Discover?', 'Previews are 30 seconds. The full-song button opens Deezer’s official player — complete for listeners signed in to Deezer, 30 seconds otherwise.'],
    ['What costs points?', 'Only AI stem separation and stem downloads. Everything else is free.']],
  a11yEyebrow: 'Accessibility', a11yH: 'Accessibility statement',
  a11yPh: 'We want Chord Room to work for everyone. The site includes an accessibility plugin, light and dark modes and five languages. Ran into a barrier? Tell us and we’ll fix it.',
  contactL: 'Questions, ideas or found a problem?', contactW: 'Write to us', contactNone: 'We’d love to hear from you.',
  credits: 'Stem separation: Demucs v4 by Meta, run with ONNX Runtime Web · Tempo & key: Signalsmith Stretch · Charts & previews: Deezer',
  prEyebrow: 'Plans & points', prH: 'Pay only for the heavy lifting.',
  prP: 'Analysis, chords, Discover, the DJ mix and MIDI are free. Points are for AI stem separation and stem downloads.',
  stActive: 'Subscription active', stRenews: 'Renews on {d}', stCancelled: 'Cancelled · active until {d}', stCancelledNd: 'Subscription cancelled', stPastDue: 'Payment failed — please update your payment method', manage: 'Manage subscription',
  balance: 'Your balance', planL: 'Plan', until: 'Valid until {d}',
  free: 'Free', perMonth: 'per month', oneTime: 'one-time', buyOr: 'or',
  incFree: ['BPM, key, Camelot and loudness', 'Chords, chord sheet and diagrams', 'Discover and DJ Mix', 'Piano MIDI export'],
  incAll: 'Everything in Free', incPts: '{pts} added every month',
  best: 'Recommended', current: 'Your plan',
  btnSignup: 'Sign up free', btnSubSignup: 'Sign up to subscribe', btnSub: 'Subscribe', btnYour: 'Your plan', btnIncl: 'Included in your plan', btnSoon: 'Coming soon', btnContact: 'Contact us', usdNote: 'Prices are in Israeli shekels (₪); the dollar amount is approximate',
  offH: 'Everything is free right now', offP: 'No points needed at the moment — every feature, including AI stem separation and stem downloads, is free to use.',
  tblEyebrow: 'Price list', tblH: 'What costs points', tblA: 'Action', tblC: 'Cost',
  rowSep: 'AI stem separation (vocals, drums, bass, other)', rowDl: 'Stems download (WAV / MP3)',
  rowAn: 'Analysis: BPM, key, chords, loudness', rowDisc: 'Discover and DJ Mix', rowMidi: 'MIDI export', freeV: 'Free', rowGift: 'Signup gift',
  prFaqH: 'Questions about points',
  prFaq: [['What are points?', 'Points are the site’s credits. AI stem separation costs {sep} and a stems download costs {dl}. Everything else is free.'],
    ['What do I get when I sign up?', 'Every new account gets {gift} as a signup gift.'],
    ['How does a monthly plan work?', 'A plan adds its points to your balance every month. When you’re signed in, your balance and plan are shown at the top of this page.'],
    ['Do I need a plan to use the site?', 'No. Analysis, chords, Discover, the DJ mix and MIDI export are free.']],
  prContact: 'Questions about plans or billing?',
  plans: { free: 'Free', basic: 'Basic', pro: 'Pro', studio: 'Studio' }
},
ar: {
  aboutEyebrow: 'Chord Room · استوديو داخل متصفحك',
  heroH: 'اسمع الأغنية <em>من الداخل.</em>',
  heroP: 'الإيقاع والمقام والكوردات في ثوانٍ، وفصل المسارات بالذكاء الاصطناعي، ومزج حيّ على منصّتين، وتصدير إلى FL Studio. كل ذلك داخل متصفحك دون تثبيت أي شيء.',
  ctaTool: 'افتح الأداة', ctaDj: 'إلى مزج DJ', ctaDisc: 'اكتشف الرائج الآن',
  heroNote: ['ابدأ مجانًا', 'بلا تثبيت', '5 لغات'],
  rdBpm: 'BPM', rdKey: 'المقام', rdCam: 'المدة', rdLufs: 'LUFS',
  stems: ['الغناء', 'الطبول', 'الباص', 'باقي الآلات'],
  featEyebrow: 'ماذا في الداخل', featH: 'الأغنية كاملة، في مكان واحد.',
  f1k: 'الأداة', f1h: 'تحليل وكوردات وعزف',
  f1p: 'ارفع أغنية واحصل على صورة كاملة لها — الإيقاع والمقام والكوردات والشدة — ثم شغّلها وعدّلها وافصلها إلى مسارات.',
  f1l: ['BPM والمقام مع رمز كاميلوت، والشدة (LUFS)',
    'كوردات مع ورقة كوردات حيّة، ومخططات للغيتار والبيانو، وتحويل المقام والكابو',
    'موجة DJ ملوّنة RGB — الأحمر للمنخفضات، والأخضر للمتوسطات، والأزرق للعاليات — مع شبكة إيقاع وحلقات ونقاط Hot Cue ومترونوم',
    'غيّر الإيقاع دون تغيير طبقة الصوت، وغيّر المقام دون تغيير الإيقاع',
    'فصل المسارات بالذكاء الاصطناعي إلى الغناء والطبول والباص وباقي الآلات (Demucs v4 داخل المتصفح، مع تسريع GPU عند توفره) مع خلّاط للكتم والعزل والكاريوكي'],
  f2k: 'اكتشف', f2h: 'الرائج الآن — محلَّل مسبقًا',
  f2p: 'الأغاني الرائجة والجديدة في العالم وفي إسرائيل من قوائم Deezer. تُحلَّل كل أغنية للمقام وBPM والكوردات من مقطعها التجريبي ذي الـ30 ثانية.',
  f2l: ['القوائم والإصدارات الجديدة — عالميًا وفي إسرائيل', 'المقام وBPM والكوردات لكل أغنية',
    'اقتراحات DJ: مقامات كاميلوت متوافقة وإيقاع في حدود 6%', 'تشغيل الأغنية كاملة عبر مشغّل Deezer الرسمي'],
  f3k: 'مزج DJ', f3h: 'منصّتان بتزامن تام',
  f3p: 'حمّل أغنيتين، وزامن الإيقاع والنبضات بدقة العيّنة، وامزج بينهما مباشرة — مع درجة توافق تخبرك بما عليك فعله.',
  f3l: ['مزامنة الإيقاع والنبضات بدقة العيّنة، وقفل المقام وتحريكه ومزامنته',
    'معادل بثلاثة نطاقات مع Kill، وفلتر وكروسفيدر', 'مؤثرات إيقاعية: Echo وReverb وFlanger وGate وRoll وBrake',
    'سامبلر (بوق، صفارة، Riser،‏ Drop)، ونقاط Hot Cue وحلقات', 'انتقال تلقائي يبدأ مع بداية المازورة ويبدّل الباص',
    'تسجيل المزج، ودرجة توافق على عجلة المقامات مع نصيحة بنقرة واحدة، واقتراحات للأغنية التالية من أغانيك ومن الكتالوج'],
  f4k: 'تصدير للمنتجين', f4h: 'مباشرة إلى FL Studio',
  f4p: 'صدّر ما تحتاجه للإنتاج بالضبط — بالإيقاع والمقام اللذين اخترتهما.',
  f4l: ['WAV وMP3 بجودة 320 kbps: المسارات والنسخة الموسيقية والأصل', 'MIDI للبيانو: الكوردات وخط الباص ولحن الغناء', 'كل شيء بالإيقاع والمقام اللذين اخترتهما'],
  f5k: 'الحساب وأغانيّ', f5h: 'مكتبتك معك أينما كنت',
  f5p: 'سجّل بالبريد الإلكتروني وكلمة المرور، وتُحفظ أغانيك في حسابك — مع ملف الصوت، بشكل خاص.',
  f5l: ['ملف شخصي بصورة واسم ونبذة', '«أغانيّ» محفوظة مع ملف الصوت (خاص)', 'الوضع الفاتح والداكن',
    '5 لغات: العبرية والإنجليزية والعربية والروسية والإسبانية', 'إضافة لإمكانية الوصول'],
  howEyebrow: 'كيف يعمل', howH: 'من الملف إلى المزج في ثلاث خطوات',
  how: [['ارفع أغنية', 'MP3 وWAV وFLAC وغيرها — أو افتح أغنية من «أغانيّ».'],
    ['التحليل داخل متصفحك', 'الإيقاع وشبكة النبضات والمقام والكوردات والشدة في ثوانٍ، على جهازك.'],
    ['شغّل وافصل وامزج', 'حلقات، وتغيير المقام والإيقاع، وفصل المسارات، والمزج على المنصّات، وتصدير WAV وMP3 وMIDI.']],
  ptsEyebrow: 'النقاط والباقات', ptsH: 'معظم الميزات مجانية.',
  ptsP: 'التحليل والكوردات والاكتشاف ومزج DJ وتصدير MIDI مجانًا. النقاط مخصّصة فقط لعمل الذكاء الاصطناعي الثقيل: فصل المسارات وتنزيلها.',
  ptsGift: 'هدية التسجيل', ptsSep: 'فصل المسارات', ptsDl: 'تنزيل المسارات', ptsMonthly: 'الباقات الشهرية تضيف نقاطًا كل شهر.', ptsCta: 'الباقات والأسعار',
  prvEyebrow: 'الخصوصية', prvH: 'موسيقاك تبقى لك.',
  prv: [['رفع خاص', 'الأغاني التي ترفعها تُحفظ بشكل خاص في حسابك. يمكن لمشرفي الموقع الوصول إليها لأغراض الدعم والإشراف.'],
    ['تحليلات مشتركة، لا صوت أبدًا', 'تحليلات المقاطع التجريبية في «اكتشف» تُحفظ في كتالوج عام — المقام وBPM والكوردات فقط، ولا صوت أبدًا.'],
    ['القوائم من Deezer', 'بيانات القوائم والمقاطع التجريبية ذات الـ30 ثانية مصدرها Deezer، والأغاني الكاملة تُشغَّل في مشغّل Deezer الرسمي.']],
  faqEyebrow: 'الأسئلة الشائعة', faqH: 'أسئلة وأجوبة',
  faq: [['هل أحتاج إلى تثبيت شيء؟', 'لا. كل شيء يعمل في المتصفح — التحليل وفصل المسارات يعملان على جهازك. عند تسجيل الدخول تُحفظ الأغنية في «أغانيّ» بشكل خاص.'],
    ['ما الملفات التي يمكن رفعها؟', 'MP3 وWAV وM4A/AAC وOGG وFLAC. للحفظ في الحساب، حتى 50MB للملف.'],
    ['ماذا لو لم يكن كورد أو النبض دقيقًا؟', 'الكشف تلقائي ويمكنك التصحيح: تعديل الكوردات، وتحريك شبكة النبضات، وقسمة BPM على 2 أو مضاعفته.'],
    ['هل يعمل مع FL Studio وبرامج أخرى؟', 'نعم. ملفات WAV وMP3 وMIDI تُفتح في أي برنامج إنتاج، وملف MIDI مهيّأ لـ FL Studio.'],
    ['هل يمكن سماع الأغاني كاملة في «اكتشف»؟', 'المقطع التجريبي 30 ثانية. زر الأغنية الكاملة يفتح مشغّل Deezer الرسمي — كاملة لمن سجّل الدخول إلى Deezer، و30 ثانية لغيرهم.'],
    ['ما الذي يكلّف نقاطًا؟', 'فصل المسارات بالذكاء الاصطناعي وتنزيل المسارات فقط. كل ما عدا ذلك مجاني.']],
  a11yEyebrow: 'إمكانية الوصول', a11yH: 'بيان إمكانية الوصول',
  a11yPh: 'نريد أن يكون Chord Room مريحًا للجميع. يتضمن الموقع إضافة لإمكانية الوصول، والوضعين الفاتح والداكن، وخمس لغات. واجهت عائقًا؟ أخبرنا وسنصلحه.',
  contactL: 'أسئلة أو أفكار أو مشكلة؟', contactW: 'راسلنا', contactNone: 'يسعدنا أن نسمع منك.',
  credits: 'فصل المسارات: Demucs v4 من Meta عبر ONNX Runtime Web · الإيقاع والمقام: Signalsmith Stretch · القوائم والمقاطع: Deezer',
  prEyebrow: 'الباقات والنقاط', prH: 'ادفع فقط مقابل العمل الثقيل.',
  prP: 'التحليل والكوردات والاكتشاف ومزج DJ وMIDI مجانًا. النقاط لفصل المسارات بالذكاء الاصطناعي وتنزيلها.',
  stActive: 'الاشتراك فعّال', stRenews: 'يتجدد في {d}', stCancelled: 'أُلغي · فعّال حتى {d}', stCancelledNd: 'تم إلغاء الاشتراك', stPastDue: 'فشل الدفع — يرجى تحديث وسيلة الدفع', manage: 'إدارة الاشتراك',
  balance: 'رصيدك', planL: 'الباقة', until: 'صالحة حتى {d}',
  free: 'مجاني', perMonth: 'شهريًا', oneTime: 'مرة واحدة', buyOr: 'أو',
  incFree: ['BPM والمقام وكاميلوت والشدة', 'الكوردات وورقة الكوردات والمخططات', 'اكتشف ومزج DJ', 'تصدير MIDI للبيانو'],
  incAll: 'كل ما في الباقة المجانية', incPts: '{pts} تُضاف كل شهر',
  best: 'موصى بها', current: 'باقتك',
  btnSignup: 'سجّل مجانًا', btnSubSignup: 'سجّل للاشتراك', btnSub: 'اشترك', btnYour: 'باقتك', btnIncl: 'مشمول في باقتك', btnSoon: 'قريبًا', btnContact: 'راسلونا', usdNote: 'الأسعار بالشيكل الإسرائيلي (₪)؛ المبلغ بالدولار تقريبي',
  offH: 'كل شيء مجاني حاليًا', offP: 'لا حاجة إلى نقاط في الوقت الحالي — كل الميزات، بما فيها فصل المسارات بالذكاء الاصطناعي وتنزيلها، مجانية الاستخدام.',
  tblEyebrow: 'قائمة الأسعار', tblH: 'ما الذي يكلّف نقاطًا', tblA: 'الإجراء', tblC: 'التكلفة',
  rowSep: 'فصل المسارات بالذكاء الاصطناعي (الغناء، الطبول، الباص، باقي الآلات)', rowDl: 'تنزيل المسارات (WAV / MP3)',
  rowAn: 'التحليل: BPM والمقام والكوردات والشدة', rowDisc: 'اكتشف ومزج DJ', rowMidi: 'تصدير MIDI', freeV: 'مجاني', rowGift: 'هدية التسجيل',
  prFaqH: 'أسئلة عن النقاط',
  prFaq: [['ما هي النقاط؟', 'النقاط هي رصيد الموقع. فصل المسارات بالذكاء الاصطناعي يكلّف {sep}، وتنزيل المسارات يكلّف {dl}. كل ما عدا ذلك مجاني.'],
    ['ماذا أحصل عند التسجيل؟', 'يحصل كل حساب جديد على {gift} هديةً عند التسجيل.'],
    ['كيف تعمل الباقة الشهرية؟', 'تضيف الباقة نقاطها إلى رصيدك كل شهر. عند تسجيل الدخول يظهر رصيدك وباقتك أعلى هذه الصفحة.'],
    ['هل أحتاج إلى باقة لاستخدام الموقع؟', 'لا. التحليل والكوردات والاكتشاف ومزج DJ وتصدير MIDI مجانًا.']],
  prContact: 'أسئلة عن الباقات أو الدفع؟',
  plans: { free: 'مجاني', basic: 'أساسي', pro: 'احترافي', studio: 'استوديو' }
},
ru: {
  aboutEyebrow: 'Chord Room · студия в браузере',
  heroH: 'Услышьте песню <em>изнутри.</em>',
  heroP: 'Темп, тональность и аккорды за секунды, разделение на стемы с AI, живой микс на двух деках и экспорт в FL Studio. Всё работает в браузере — ничего не нужно устанавливать.',
  ctaTool: 'Открыть инструмент', ctaDj: 'В DJ-микс', ctaDisc: 'Что сейчас в тренде',
  heroNote: ['Бесплатный старт', 'Без установки', '5 языков'],
  rdBpm: 'BPM', rdKey: 'Тональность', rdCam: 'Длина', rdLufs: 'LUFS',
  stems: ['Вокал', 'Барабаны', 'Бас', 'Остальное'],
  featEyebrow: 'Что внутри', featH: 'Вся песня — в одном месте.',
  f1k: 'Инструмент', f1h: 'Анализ, аккорды и игра',
  f1p: 'Загрузите песню и получите полную картину — темп, тональность, аккорды и громкость, — а затем играйте, меняйте и разделяйте её на стемы.',
  f1l: ['BPM, тональность с кодом Camelot и громкость (LUFS)',
    'Аккорды с живым листом аккордов, аппликатуры для гитары и фортепиано, транспонирование и каподастр',
    'RGB-волна как у DJ — красный для низов, зелёный для середины, синий для верхов — с битовой сеткой, лупами, хот-кью и метрономом',
    'Меняйте темп без изменения высоты тона, а тональность — без изменения темпа',
    'Разделение с AI на вокал, барабаны, бас и остальное (Demucs v4 в браузере, с ускорением на GPU, если есть) и микшер с mute, solo и караоке'],
  f2k: 'Обзор', f2h: 'Что в тренде — уже проанализировано',
  f2p: 'Популярные и новые песни в мире и в Израиле из чартов Deezer. Каждый трек анализируется по 30-секундному превью: тональность, BPM и аккорды.',
  f2l: ['Чарты и новинки — мир и Израиль', 'Тональность, BPM и аккорды для каждого трека',
    'DJ-совпадения: совместимые тональности, темп в пределах 6%', 'Полная песня в официальном плеере Deezer'],
  f3k: 'DJ-микс', f3h: 'Две деки, точная синхронизация',
  f3p: 'Загрузите две песни, синхронизируйте темп и биты с точностью до сэмпла и сводите вживую — с оценкой совместимости, которая подскажет, что делать.',
  f3l: ['Синхронизация темпа и битов с точностью до сэмпла, key lock, сдвиг и синхронизация тональности',
    '3-полосный эквалайзер с kill, фильтр и кроссфейдер', 'Бит-эффекты: echo, reverb, flanger, gate, roll и brake',
    'Сэмплер (горн, сирена, райзер, дроп), хот-кью и лупы', 'Автопереход: вход с начала такта и смена баса',
    'Запись микса, оценка совместимости на круге тональностей с советом в один клик и подбор следующей песни из ваших песен и каталога'],
  f4k: 'Экспорт для продюсеров', f4h: 'Прямо в FL Studio',
  f4p: 'Забирайте ровно то, что нужно для продакшна, — в выбранном темпе и тональности.',
  f4l: ['WAV и MP3 320 kbps: стемы, инструментал и оригинал', 'Фортепианный MIDI: аккорды, бас-линия и вокальная мелодия', 'Всё в выбранном темпе и тональности'],
  f5k: 'Аккаунт и мои песни', f5h: 'Ваша библиотека всегда с вами',
  f5p: 'Регистрация по email и паролю — и песни сохраняются в аккаунте вместе с аудиофайлом, приватно.',
  f5l: ['Профиль с фото, именем и описанием', '«Мои песни» сохраняются вместе с аудиофайлом (приватно)', 'Светлая и тёмная тема',
    '5 языков: иврит, английский, арабский, русский и испанский', 'Плагин доступности'],
  howEyebrow: 'Как это работает', howH: 'От файла до микса за три шага',
  how: [['Загрузите песню', 'MP3, WAV, FLAC и другие — или откройте песню из «Моих песен».'],
    ['Анализ прямо в браузере', 'Темп, битовая сетка, тональность, аккорды и громкость — за секунды, на вашем устройстве.'],
    ['Играйте, разделяйте, сводите', 'Лупы, смена тональности и темпа, разделение на стемы, сведение на деках и экспорт WAV, MP3 и MIDI.']],
  ptsEyebrow: 'Баллы и тарифы', ptsH: 'Почти всё бесплатно.',
  ptsP: 'Анализ, аккорды, обзор, DJ-микс и экспорт MIDI ничего не стоят. Баллы нужны только для тяжёлой работы AI: разделения на стемы и скачивания стемов.',
  ptsGift: 'Подарок при регистрации', ptsSep: 'Разделение на стемы', ptsDl: 'Скачивание стемов', ptsMonthly: 'Ежемесячные тарифы добавляют баллы каждый месяц.', ptsCta: 'Тарифы и цены',
  prvEyebrow: 'Конфиденциальность', prvH: 'Ваша музыка остаётся вашей.',
  prv: [['Приватные загрузки', 'Загруженные песни хранятся в вашем аккаунте приватно. Администраторы сайта могут получить к ним доступ для поддержки и модерации.'],
    ['Общие анализы, но не аудио', 'Анализы превью из обзора попадают в публичный каталог — только тональность, BPM и аккорды, никогда не аудио.'],
    ['Чарты от Deezer', 'Данные чартов и 30-секундные превью предоставляет Deezer; полные песни играют в официальном плеере Deezer.']],
  faqEyebrow: 'FAQ', faqH: 'Вопросы и ответы',
  faq: [['Нужно что-то устанавливать?', 'Нет. Всё работает в браузере — и анализ, и разделение на стемы выполняются на вашем устройстве. Если вы вошли в аккаунт, песня приватно сохраняется в «Моих песнях».'],
    ['Какие файлы можно загружать?', 'MP3, WAV, M4A/AAC, OGG и FLAC. Для сохранения в аккаунте — до 50 МБ на файл.'],
    ['Что если аккорд или бит определены неточно?', 'Распознавание автоматическое, и всё можно поправить: отредактировать аккорды, сдвинуть битовую сетку, уменьшить или удвоить BPM.'],
    ['Работает с FL Studio и другими программами?', 'Да. Файлы WAV, MP3 и MIDI открываются в любой DAW, а MIDI подготовлен для FL Studio.'],
    ['Можно слушать полные песни в обзоре?', 'Превью длится 30 секунд. Кнопка полной песни открывает официальный плеер Deezer — целиком для вошедших в Deezer, 30 секунд для остальных.'],
    ['За что списываются баллы?', 'Только за разделение на стемы с AI и скачивание стемов. Всё остальное бесплатно.']],
  a11yEyebrow: 'Доступность', a11yH: 'Заявление о доступности',
  a11yPh: 'Мы хотим, чтобы Chord Room был удобен для всех. На сайте есть плагин доступности, светлая и тёмная темы и пять языков. Столкнулись с барьером? Сообщите нам — мы исправим.',
  contactL: 'Вопросы, идеи или нашли проблему?', contactW: 'Напишите нам', contactNone: 'Будем рады вашему отзыву.',
  credits: 'Разделение: Demucs v4 от Meta через ONNX Runtime Web · Темп и тональность: Signalsmith Stretch · Чарты и превью: Deezer',
  prEyebrow: 'Тарифы и баллы', prH: 'Платите только за тяжёлую работу.',
  prP: 'Анализ, аккорды, обзор, DJ-микс и MIDI бесплатны. Баллы нужны для разделения на стемы с AI и скачивания стемов.',
  stActive: 'Подписка активна', stRenews: 'Продлится {d}', stCancelled: 'Отменена · действует до {d}', stCancelledNd: 'Подписка отменена', stPastDue: 'Платёж не прошёл — обновите способ оплаты', manage: 'Управление подпиской',
  balance: 'Ваш баланс', planL: 'Тариф', until: 'Действует до {d}',
  free: 'Бесплатно', perMonth: 'в месяц', oneTime: 'разово', buyOr: 'или',
  incFree: ['BPM, тональность и громкость', 'Аккорды, лист аккордов и аппликатуры', 'Обзор и DJ-микс', 'Экспорт фортепианного MIDI'],
  incAll: 'Всё из бесплатного тарифа', incPts: '+{pts} каждый месяц',
  best: 'Рекомендуем', current: 'Ваш тариф',
  btnSignup: 'Бесплатная регистрация', btnSubSignup: 'Зарегистрироваться и подписаться', btnSub: 'Подписаться', btnYour: 'Ваш тариф', btnIncl: 'Входит в ваш тариф', btnSoon: 'Скоро', btnContact: 'Напишите нам', usdNote: 'Цены в израильских шекелях (₪); сумма в долларах приблизительная',
  offH: 'Сейчас всё бесплатно', offP: 'Баллы сейчас не нужны — все функции, включая разделение на стемы с AI и скачивание стемов, доступны бесплатно.',
  tblEyebrow: 'Прайс', tblH: 'За что списываются баллы', tblA: 'Действие', tblC: 'Стоимость',
  rowSep: 'Разделение на стемы с AI (вокал, барабаны, бас, остальное)', rowDl: 'Скачивание стемов (WAV / MP3)',
  rowAn: 'Анализ: BPM, тональность, аккорды, громкость', rowDisc: 'Обзор и DJ-микс', rowMidi: 'Экспорт MIDI', freeV: 'Бесплатно', rowGift: 'Подарок при регистрации',
  prFaqH: 'Вопросы о баллах',
  prFaq: [['Что такое баллы?', 'Баллы — это кредиты сайта. Разделение на стемы с AI стоит {sep}, скачивание стемов — {dl}. Всё остальное бесплатно.'],
    ['Что я получу при регистрации?', 'Каждый новый аккаунт получает {gift} в подарок.'],
    ['Как работает ежемесячный тариф?', 'Тариф каждый месяц добавляет баллы на ваш баланс. Если вы вошли в аккаунт, баланс и тариф показаны вверху этой страницы.'],
    ['Нужен ли тариф, чтобы пользоваться сайтом?', 'Нет. Анализ, аккорды, обзор, DJ-микс и экспорт MIDI бесплатны.']],
  prContact: 'Вопросы о тарифах или оплате?',
  plans: { free: 'Бесплатный', basic: 'Базовый', pro: 'Про', studio: 'Студия' }
},
es: {
  aboutEyebrow: 'Chord Room · un estudio en tu navegador',
  heroH: 'Escucha la canción <em>por dentro.</em>',
  heroP: 'Tempo, tonalidad y acordes en segundos, separación de pistas con IA, una mezcla en vivo con dos platos y exportación a FL Studio. Todo funciona en tu navegador, sin instalar nada.',
  ctaTool: 'Abrir la herramienta', ctaDj: 'Ir a Mezcla DJ', ctaDisc: 'Ver lo que es tendencia',
  heroNote: ['Empieza gratis', 'Sin instalar', '5 idiomas'],
  rdBpm: 'BPM', rdKey: 'Tonalidad', rdCam: 'Duración', rdLufs: 'LUFS',
  stems: ['Voz', 'Batería', 'Bajo', 'Resto'],
  featEyebrow: 'Qué hay dentro', featH: 'Toda la canción, en un solo lugar.',
  f1k: 'La herramienta', f1h: 'Analiza, lee los acordes y toca',
  f1p: 'Sube una canción y obtén la imagen completa —tempo, tonalidad, acordes y sonoridad—; luego tócala, transfórmala y sepárala en pistas.',
  f1l: ['BPM, tonalidad con su código Camelot y sonoridad (LUFS)',
    'Acordes con hoja de acordes en vivo, diagramas de guitarra y piano, transposición y cejilla',
    'Forma de onda RGB estilo DJ —rojo para graves, verde para medios, azul para agudos— con rejilla de beats, loops, hot cues y metrónomo',
    'Cambia el tempo sin cambiar el tono, y la tonalidad sin cambiar el tempo',
    'Separación con IA en voz, batería, bajo y resto (Demucs v4 en el navegador, con aceleración GPU si está disponible) y mezclador con mute, solo y karaoke'],
  f2k: 'Descubrir', f2h: 'Lo que suena ahora, ya analizado',
  f2p: 'Canciones en tendencia y novedades del mundo y de Israel, de las listas de Deezer. Cada tema se analiza —tonalidad, BPM y acordes— a partir de su vista previa de 30 segundos.',
  f2l: ['Listas y novedades: mundo e Israel', 'Tonalidad, BPM y acordes de cada tema',
    'Coincidencias DJ: tonalidades Camelot compatibles y tempo dentro del 6 %', 'Canción completa en el reproductor oficial de Deezer'],
  f3k: 'Mezcla DJ', f3h: 'Dos platos, en perfecta sincronía',
  f3p: 'Carga dos canciones, sincroniza tempo y beats con precisión de muestra y mezcla en vivo, con una puntuación de compatibilidad que te dice qué hacer.',
  f3l: ['Sincronía de tempo y beats con precisión de muestra, key lock, cambio y sincronía de tonalidad',
    'Ecualizador de 3 bandas con kill, filtro y crossfader', 'Efectos de beat: echo, reverb, flanger, gate, roll y brake',
    'Sampler (bocina, sirena, riser, drop), hot cues y loops', 'Transición automática con entrada alineada al compás y cambio de bajos',
    'Graba la mezcla, puntuación en una rueda de tonalidades con consejo en un clic y sugerencias de la siguiente canción desde tus canciones y el catálogo'],
  f4k: 'Exportar para productores', f4h: 'Directo a FL Studio',
  f4p: 'Llévate justo lo que necesitas para producir, en el tempo y la tonalidad que elegiste.',
  f4l: ['WAV y MP3 a 320 kbps: pistas, instrumental y original', 'MIDI de piano: acordes, línea de bajo y melodía vocal', 'Todo en el tempo y la tonalidad que elijas'],
  f5k: 'Cuenta y Mis canciones', f5h: 'Tu biblioteca, donde estés',
  f5p: 'Regístrate con email y contraseña y tus canciones se guardan en tu cuenta, con el archivo de audio incluido y de forma privada.',
  f5l: ['Perfil con foto, nombre y bio', 'Mis canciones guardadas con el archivo de audio (privado)', 'Modo claro y oscuro',
    '5 idiomas: hebreo, inglés, árabe, ruso y español', 'Plugin de accesibilidad'],
  howEyebrow: 'Cómo funciona', howH: 'Del archivo a la mezcla en tres pasos',
  how: [['Sube una canción', 'MP3, WAV, FLAC y más, o abre una de Mis canciones.'],
    ['Se analiza en tu navegador', 'Tempo, rejilla de beats, tonalidad, acordes y sonoridad en segundos, en tu dispositivo.'],
    ['Toca, separa, mezcla', 'Loops, cambio de tonalidad y tempo, separación en pistas, mezcla en los platos y exportación WAV, MP3 y MIDI.']],
  ptsEyebrow: 'Puntos y planes', ptsH: 'Casi todo es gratis.',
  ptsP: 'El análisis, los acordes, Descubrir, la mezcla DJ y la exportación MIDI no cuestan nada. Los puntos son solo para el trabajo pesado de IA: separar pistas y descargarlas.',
  ptsGift: 'Regalo de registro', ptsSep: 'Separación de pistas', ptsDl: 'Descarga de pistas', ptsMonthly: 'Los planes mensuales añaden puntos cada mes.', ptsCta: 'Ver planes y precios',
  prvEyebrow: 'Privacidad', prvH: 'Tu música sigue siendo tuya.',
  prv: [['Subidas privadas', 'Las canciones que subes se guardan de forma privada en tu cuenta. Los administradores del sitio pueden acceder a ellas para soporte y moderación.'],
    ['Análisis compartidos, nunca audio', 'Los análisis de las vistas previas de Descubrir van a un catálogo público: solo tonalidad, BPM y acordes, nunca audio.'],
    ['Listas de Deezer', 'Los datos de las listas y las vistas previas de 30 segundos vienen de Deezer; las canciones completas suenan en su reproductor oficial.']],
  faqEyebrow: 'Preguntas frecuentes', faqH: 'Preguntas y respuestas',
  faq: [['¿Tengo que instalar algo?', 'No. Todo funciona en el navegador: el análisis y la separación de pistas se ejecutan en tu dispositivo. Si has iniciado sesión, la canción se guarda de forma privada en Mis canciones.'],
    ['¿Qué archivos puedo subir?', 'MP3, WAV, M4A/AAC, OGG y FLAC. Para guardarlos en tu cuenta, hasta 50 MB por archivo.'],
    ['¿Y si un acorde o el beat no es exacto?', 'La detección es automática y puedes corregirla: editar acordes, mover la rejilla de beats y dividir o duplicar el BPM.'],
    ['¿Funciona con FL Studio y otros programas?', 'Sí. Los archivos WAV, MP3 y MIDI se abren en cualquier DAW, y el MIDI está preparado para FL Studio.'],
    ['¿Puedo escuchar canciones completas en Descubrir?', 'La vista previa dura 30 segundos. El botón de canción completa abre el reproductor oficial de Deezer: completa si has iniciado sesión en Deezer, 30 segundos si no.'],
    ['¿Qué cuesta puntos?', 'Solo la separación de pistas con IA y la descarga de pistas. Todo lo demás es gratis.']],
  a11yEyebrow: 'Accesibilidad', a11yH: 'Declaración de accesibilidad',
  a11yPh: 'Queremos que Chord Room funcione para todos. El sitio incluye un plugin de accesibilidad, modo claro y oscuro y cinco idiomas. ¿Encontraste una barrera? Cuéntanos y la arreglamos.',
  contactL: '¿Preguntas, ideas o encontraste un problema?', contactW: 'Escríbenos', contactNone: 'Nos encantará saber de ti.',
  credits: 'Separación: Demucs v4 de Meta con ONNX Runtime Web · Tempo y tonalidad: Signalsmith Stretch · Listas y vistas previas: Deezer',
  prEyebrow: 'Planes y puntos', prH: 'Paga solo por el trabajo pesado.',
  prP: 'El análisis, los acordes, Descubrir, la mezcla DJ y el MIDI son gratis. Los puntos son para separar pistas con IA y descargarlas.',
  stActive: 'Suscripción activa', stRenews: 'Se renueva el {d}', stCancelled: 'Cancelada · activa hasta el {d}', stCancelledNd: 'Suscripción cancelada', stPastDue: 'El pago falló: actualiza tu método de pago', manage: 'Gestionar suscripción',
  balance: 'Tu saldo', planL: 'Plan', until: 'Válido hasta el {d}',
  free: 'Gratis', perMonth: 'al mes', oneTime: 'una vez', buyOr: 'o',
  incFree: ['BPM, tonalidad, Camelot y sonoridad', 'Acordes, hoja de acordes y diagramas', 'Descubrir y Mezcla DJ', 'Exportación MIDI de piano'],
  incAll: 'Todo lo del plan Gratis', incPts: '+{pts} cada mes',
  best: 'Recomendado', current: 'Tu plan',
  btnSignup: 'Regístrate gratis', btnSubSignup: 'Regístrate para suscribirte', btnSub: 'Suscribirse', btnYour: 'Tu plan', btnIncl: 'Incluido en tu plan', btnSoon: 'Próximamente', btnContact: 'Escríbenos', usdNote: 'Precios en shékels israelíes (₪); el importe en dólares es aproximado',
  offH: 'Ahora mismo todo es gratis', offP: 'No necesitas puntos por ahora: todas las funciones, incluida la separación de pistas con IA y su descarga, son gratis.',
  tblEyebrow: 'Tarifas', tblH: 'Qué cuesta puntos', tblA: 'Acción', tblC: 'Coste',
  rowSep: 'Separación de pistas con IA (voz, batería, bajo, resto)', rowDl: 'Descarga de pistas (WAV / MP3)',
  rowAn: 'Análisis: BPM, tonalidad, acordes, sonoridad', rowDisc: 'Descubrir y Mezcla DJ', rowMidi: 'Exportación MIDI', freeV: 'Gratis', rowGift: 'Regalo de registro',
  prFaqH: 'Preguntas sobre los puntos',
  prFaq: [['¿Qué son los puntos?', 'Los puntos son los créditos del sitio. Separar pistas con IA cuesta {sep} y descargar pistas cuesta {dl}. Todo lo demás es gratis.'],
    ['¿Qué recibo al registrarme?', 'Cada cuenta nueva recibe {gift} de regalo al registrarse.'],
    ['¿Cómo funciona un plan mensual?', 'El plan añade sus puntos a tu saldo cada mes. Si has iniciado sesión, tu saldo y tu plan aparecen arriba en esta página.'],
    ['¿Necesito un plan para usar el sitio?', 'No. El análisis, los acordes, Descubrir, la mezcla DJ y la exportación MIDI son gratis.']],
  prContact: '¿Preguntas sobre planes o pagos?',
  plans: { free: 'Gratis', basic: 'Básico', pro: 'Pro', studio: 'Estudio' }
}
};

/* ---------- home page: what the site does today (overrides + new strings, all five languages) ---------- */
const SX = {
he: {
  heroP: 'קצב, סולם ואקורדים תוך שניות, הפרדת ערוצים ב־AI, מיקס חי על שני דקים, ניתוח ספרייה שלמה לתקליטנים וייצוא ל־FL Studio. הכל רץ בדפדפן, בלי להתקין כלום.',
  f1l: ['BPM, סולם ועוצמה (LUFS), עם שמות סולמות מוכרים כמו Am או F#m',
    'אקורדים עם דף אקורדים חי, דיאגרמות לגיטרה ולפסנתר, טרנספוזיציה וקאפו',
    'צורת גל RGB בסגנון DJ — אדום לבסים, ירוק לאמצע, כחול לגבוהים — עם גריד ביטים, לופים, Hot Cues ומטרונום',
    'שינוי קצב בלי לשנות את גובה הצליל, ושינוי סולם בלי לשנות את הקצב',
    'הפרדת ערוצים ב־AI לשירה, תופים, בס ושאר הכלים (Demucs v4 בדפדפן, עם האצת GPU כשיש) ומיקסר עם השתקה, סולו וקריוקי',
    'השיר האחרון נפתח שוב לבד, גם אחרי שסוגרים את הדפדפן',
    'הסולם שלי: שרים למיקרופון, מגלים את טווח הקול, ומקבלים את הסולם הכי נוח לשיר בו את השיר — ומעבירים אותו לשם בלחיצה'],
  f2l: ['מצעדים ושירים חדשים בעולם ובישראל, עם מסנן ״ישראלי״ שמציג אמנים ישראלים', 'סולם, BPM ואקורדים לכל שיר',
    'התאמות DJ: סולמות שמתאימים הרמונית וקצב בטווח של 6%', 'נגן בתחתית המסך: הקודם והבא, עצירה, מעבר בתוך השיר ועוצמה',
    'השמעת השיר המלא דרך הנגן הרשמי של Deezer'],
  f6k: 'ניתוח ספרייה', f6h: 'כל הספרייה, מוכנה לסט',
  f6p: 'גוררים תיקייה שלמה ומקבלים לכל שיר BPM, סולם, עוצמה ואנרגיה. אחר כך מסדרים סט, בודקים את נקודות הקיו ומייצאים לתוכנת ה־DJ.',
  f6l: ['ניתוח של הרבה קבצים ברצף, בטבלה שאפשר למיין ולסנן', 'סדר סט חכם לפי סולמות תואמים, קצב ואנרגיה',
    'נקודות קיו אוטומטיות בצבעים: Intro,‏ Vocal,‏ Break,‏ Build,‏ Drop ו־Outro',
    'תצוגה בסגנון rekordbox: מאזינים מכל נקודה, גוררים קיו ומזיזים את הגריד',
    'ייצוא ל־rekordbox ‏(XML), ל־Traktor ‏(NML) ול־Serato (הקיו בתוך עותקי ה־MP3), וגם CSV ו־M3U8',
    'USB ל־Pioneer: עותקים עם שמות באותיות לטיניות לפי ההגייה העברית, ותגיות BPM וסולם בתוך הקבצים'],
  f7k: 'מאשאפ', f7h: 'שירה משיר אחד, ביט משיר אחר',
  f7p: 'טוענים שני שירים, ו־Chord Room מתאים ביניהם לבד: קצב, סולם ותיבות. מאזינים, מזיזים ומייצאים מאשאפ מוכן.',
  f7l: ['הפרדה ב־AI של השירה והביט, או הפרדה מהירה בחינם', 'התאמת קצב עם שמירה על הסולם, והזזת השירה לסולם המתאים (או למקביל)', 'השירה נכנסת בדיוק על תיבה של הביט, עם הזזה בפעמה או ב־10 מילישניות', 'ציר זמן עם שני גלי קול, לופ וכניסה/יציאה הדרגתית, וייצוא ל־WAV או MP3'],
  f8k: 'המרה', f8h: 'כל קובץ, בפורמט שאתם צריכים', f8p: 'גוררים ערימה של קבצי אודיו או וידאו ומקבלים MP3, WAV, FLAC, OGG או M4A, עם התגיות והעטיפה. הכול רץ בדפדפן: שום קובץ לא עולה לשרת.',
  f8l: ['המרה של הרבה קבצים בבת אחת, גם חילוץ הפסקול מווידאו (MP4, MOV, WebM, MKV)', 'קצב דגימה, עומק ביטים או קצב סיביות, סטריאו/מונו, נרמול ל־\u2066−14 LUFS\u2069, חיתוך שקט וכניסה/יציאה הדרגתית', 'שם השיר, האמן, האלבום והעטיפה עוברים לקובץ החדש, ואפשר להוסיף BPM וסולם לתגיות', 'הורדה של כל התוצאות ב־ZIP, והקטנת עטיפות ל־500/1000/1500 פיקסלים'],
  f4l: ['WAV ו־MP3 ב־320 kbps: ערוצים, אינסטרומנטלי ומקור', 'MIDI לפסנתר: אקורדים, קו בס ומלודיית השירה',
    'תופים ל־MIDI: קיק, סנר והיי־האט מערוץ התופים, מיושרים ל־1/16', 'הכל בקצב ובסולם שבחרתם, ומתחיל בתיבה 1'],
  f5k: 'חשבון ונקודות', f5h: 'הספרייה שלכם, איתכם בכל מקום',
  f5p: 'נרשמים עם אימייל, מאמתים בקוד שנשלח אליו, והשירים נשמרים בחשבון — כולל קובץ האודיו, באופן פרטי.',
  f5lPts: ['נקודות מתנה בהרשמה, ומסלולים חודשיים למי שמפריד הרבה ערוצים', 'הזמנת חברים: גם אתם וגם החבר מקבלים נקודות'],
  f5l: ['״השירים שלי״ נשמרים בחשבון יחד עם קובץ האודיו, באופן פרטי', 'פרופיל עם תמונה, שם וביו, מצב בהיר וכהה ו־5 שפות', 'תוסף נגישות מובנה'],
  prv: [['העלאות פרטיות לכל חשבון', 'שירים שאתם מעלים נשמרים באחסון פרטי של החשבון שלכם ונפתחים בקישורים חתומים לזמן מוגבל. בעל האתר ומנהלים מורשים יכולים לגשת אליהם לצורכי תמיכה ופיקוח.'],
    ['ניתוחים משותפים, אף פעם לא אודיו', 'ניתוחים של קטעי האזנה מ״גלה שירים״ נשמרים בקטלוג משותף — סולם, BPM ואקורדים בלבד, בלי אודיו ובלי שם המשתמש.'],
    ['העיבוד קורה אצלכם', 'הניתוח, הפרדת הערוצים והייצוא רצים בדפדפן. תוצאות ניתוח הספרייה נשמרות בדפדפן שלכם, לכל חשבון בנפרד.']],
  faqX: [['איך מעבירים את הניתוח ל־rekordbox,‏ Serato או Traktor?', 'בניתוח הספרייה מייצאים קובץ XML ל־rekordbox (עם BPM, סולם, גריד ונקודות קיו) או קובץ NML ל־Traktor. ל־Serato ול־VirtualDJ מורידים עותקי MP3 שהקיו כבר שמורים בתוכם.']],
  incFree: ['BPM, סולם ועוצמה', 'אקורדים, דף אקורדים ודיאגרמות', 'גלה שירים, מיקס חי וניתוח ספרייה', 'ייצוא MIDI לפסנתר'],
  rowDisc: 'גלה שירים, מיקס חי וניתוח ספרייה',
  lgNav: 'מסמכים', lgTerms: 'תנאי שימוש', lgPrivacy: 'מדיניות פרטיות', lgA11y: 'הצהרת נגישות'
},
en: {
  heroP: 'Tempo, key and chords in seconds, AI stem separation, a live two-deck mix, whole-library analysis for DJs and export to FL Studio. It all runs in your browser — nothing to install.',
  f1l: ['BPM, key and loudness (LUFS), with familiar key names like Am or F#m',
    'Chords with a live chord sheet, guitar and piano diagrams, transpose and capo',
    'RGB DJ waveform — red lows, green mids, blue highs — with beat grid, loops, hot cues and a metronome',
    'Change the tempo without changing the pitch, and the key without changing the tempo',
    'AI stem separation into vocals, drums, bass and other (Demucs v4 in the browser, GPU-accelerated when available) with a mute / solo / karaoke mixer',
    'Your last song reopens by itself, even after you close the browser',
    'My key: sing into the mic, learn your vocal range and get the most comfortable key to sing the song in, then move it there with one click'],
  f2l: ['Charts and new releases worldwide and in Israel, with an “Israeli” filter that shows Israeli artists', 'Key, BPM and chords for every track',
    'DJ matches: harmonically compatible keys and tempo within 6%', 'A player bar at the bottom: previous and next, stop, seek and volume',
    'Full-song playback through Deezer’s official player'],
  f6k: 'Library analysis', f6h: 'Your whole library, set-ready',
  f6p: 'Drop in a whole folder and get BPM, key, loudness and energy for every track. Then order a set, check the cue points and export to your DJ software.',
  f6l: ['Analyses many files in a row, in a table you can sort and filter', 'Smart set order by compatible keys, tempo and energy',
    'Automatic colour cue points: Intro, Vocal, Break, Build, Drop and Outro',
    'A rekordbox-style overview: listen from any point, drag a cue, move the grid',
    'Export to rekordbox (XML), Traktor (NML) and Serato (cues inside the MP3 copies), plus CSV and M3U8',
    'USB for Pioneer: copies named in Latin letters by Hebrew pronunciation, with BPM and key tags inside the files'],
  f7k: 'Mashup', f7h: 'Vocals from one song, the beat from another',
  f7p: 'Load two songs and Chord Room matches them for you: tempo, key and bars. Listen, nudge and export a finished mashup.',
  f7l: ['AI separation of the vocals and the beat, or a free quick separation', 'Tempo matching with key lock, and the vocals moved to a matching key (or its relative)', 'The vocals land right on one of the beat\'s bars, nudge by a beat or 10 ms', 'Two-lane waveform timeline, loop and fades, export to WAV or MP3'],
  f8k: 'Convert', f8h: 'Any file, in the format you need', f8p: 'Drop a pile of audio or video files and get MP3, WAV, FLAC, OGG or M4A with their tags and cover. Everything runs in the browser: no file is uploaded.',
  f8l: ['Many files at once, including the soundtrack of videos (MP4, MOV, WebM, MKV)', 'Sample rate, bit depth or bitrate, stereo/mono, −14 LUFS normalisation, silence trimming and fades', 'Title, artist, album and cover carry over to the new file; BPM and key can be added to the tags', 'Download every result as one ZIP, and resize cover art to 500/1000/1500 px'],
  f4l: ['WAV and MP3 320 kbps: stems, instrumental and original', 'Piano MIDI: chords, bass line and vocal melody',
    'Drums to MIDI: kick, snare and hi-hat from the drums stem, quantised to 1/16', 'Everything in your chosen tempo and key, starting at bar 1'],
  f5k: 'Account & points', f5h: 'Your library, wherever you are',
  f5p: 'Sign up with your email, confirm it with a code, and your songs are saved to your account — audio file included, kept private.',
  f5lPts: ['Free points when you sign up, and monthly plans for heavy stem users', 'Invite friends: you and your friend both get points'],
  f5l: ['My songs saved with the audio file, privately', 'Profile with photo, name and bio, light and dark mode, and 5 languages', 'Built-in accessibility plugin'],
  prv: [['Private uploads, per account', 'Songs you upload are stored privately in your account and open through time-limited signed links. The site owner and authorized admins can access them for support and moderation.'],
    ['Shared analyses, never audio', 'Analyses of Discover previews go into a shared catalog — key, BPM and chords only, no audio and no username.'],
    ['Processing on your device', 'Analysis, stem separation and exports run in your browser. Library analysis results are kept in your browser, separately for each account.']],
  faqX: [['How do I get the analysis into rekordbox, Serato or Traktor?', 'In Library analysis, export an XML file for rekordbox (with BPM, key, grid and cue points) or an NML file for Traktor. For Serato and VirtualDJ, download MP3 copies that already carry the cues.']],
  incFree: ['BPM, key and loudness', 'Chords, chord sheet and diagrams', 'Discover, DJ Mix and library analysis', 'Piano MIDI export'],
  rowDisc: 'Discover, DJ Mix and library analysis',
  lgNav: 'Legal', lgTerms: 'Terms of Use', lgPrivacy: 'Privacy Policy', lgA11y: 'Accessibility statement'
},
ar: {
  heroP: 'الإيقاع والمقام والكوردات في ثوانٍ، وفصل المسارات بالذكاء الاصطناعي، ومزج حيّ على منصّتين، وتحليل مكتبة كاملة لمنسّقي الأغاني، وتصدير إلى FL Studio. كل ذلك داخل متصفحك دون تثبيت أي شيء.',
  f1l: ['BPM والمقام والشدة (LUFS)، بأسماء مقامات مألوفة مثل Am أو F#m',
    'كوردات مع ورقة كوردات حيّة، ومخططات للغيتار والبيانو، وتحويل المقام والكابو',
    'موجة DJ ملوّنة RGB — الأحمر للمنخفضات، والأخضر للمتوسطات، والأزرق للعاليات — مع شبكة إيقاع وحلقات ونقاط Hot Cue ومترونوم',
    'غيّر الإيقاع دون تغيير طبقة الصوت، وغيّر المقام دون تغيير الإيقاع',
    'فصل المسارات بالذكاء الاصطناعي إلى الغناء والطبول والباص وباقي الآلات (Demucs v4 داخل المتصفح، مع تسريع GPU عند توفره) مع خلّاط للكتم والعزل والكاريوكي',
    'آخر أغنية تُفتح تلقائيًا من جديد، حتى بعد إغلاق المتصفح',
    'مقامي: غنِّ في الميكروفون، اعرف مدى صوتك واحصل على أنسب مقام لغناء الأغنية، ثم انقلها إليه بنقرة واحدة'],
  f2l: ['القوائم والإصدارات الجديدة عالميًا وفي إسرائيل، مع مرشّح «إسرائيلي» يعرض الفنانين الإسرائيليين', 'المقام وBPM والكوردات لكل أغنية',
    'اقتراحات DJ: مقامات متوافقة هارمونيًا وإيقاع في حدود 6%', 'مشغّل أسفل الشاشة: السابق والتالي والإيقاف والتنقل داخل الأغنية ومستوى الصوت',
    'تشغيل الأغنية كاملة عبر مشغّل Deezer الرسمي'],
  f6k: 'تحليل المكتبة', f6h: 'مكتبتك كلها، جاهزة للسِّت',
  f6p: 'اسحب مجلدًا كاملًا واحصل لكل أغنية على BPM والمقام والشدة والطاقة. ثم رتّب السِّت وراجع نقاط الإشارة وصدّر إلى برنامج الـDJ.',
  f6l: ['تحليل ملفات كثيرة على التوالي في جدول يمكن فرزه وتصفيته', 'ترتيب ذكي للسِّت حسب المقامات المتوافقة والإيقاع والطاقة',
    'نقاط إشارة تلقائية ملوّنة: Intro وVocal وBreak وBuild وDrop وOutro',
    'عرض بأسلوب rekordbox: استمع من أي نقطة، واسحب نقطة الإشارة، وحرّك الشبكة',
    'تصدير إلى rekordbox ‏(XML) وTraktor ‏(NML) وSerato (نقاط الإشارة داخل نسخ MP3)، إضافة إلى CSV وM3U8',
    'USB لأجهزة Pioneer: نسخ بأسماء بأحرف لاتينية حسب النطق العبري، مع وسوم BPM والمقام داخل الملفات'],
  f7k: 'ماش أب', f7h: 'الغناء من أغنية والإيقاع من أخرى',
  f7p: 'حمّل أغنيتين وسيطابق Chord Room بينهما تلقائيًا: الإيقاع والمقام والمازورات. استمع وحرّك وصدّر ماش أب جاهزًا.',
  f7l: ['فصل الغناء والإيقاع بالذكاء الاصطناعي، أو فصل سريع مجاني', 'مطابقة الإيقاع مع الحفاظ على المقام، ونقل الغناء إلى مقام متوافق (أو نسبي)', 'يدخل الغناء تمامًا على مازورة من الإيقاع، مع تحريك بنبضة أو 10 ms', 'خط زمني بموجتين، تكرار ودخول/خروج تدريجي، وتصدير WAV أو MP3'],
  f8k: 'تحويل', f8h: 'أي ملف، بالصيغة التي تحتاجها', f8p: 'اسحب كومة من ملفات الصوت أو الفيديو واحصل على MP3 أو WAV أو FLAC أو OGG أو M4A مع الوسوم والغلاف. كل شيء يعمل في المتصفح: لا يُرفع أي ملف.',
  f8l: ['ملفات كثيرة دفعة واحدة، بما فيها استخراج الصوت من الفيديو (MP4, MOV, WebM, MKV)', 'معدل العينات، عمق البت أو معدل البت، ستيريو/أحادي، تطبيع إلى \u2066−14 LUFS\u2069، قص الصمت ودخول/خروج تدريجي', 'العنوان والفنان والألبوم والغلاف تنتقل إلى الملف الجديد، ويمكن إضافة BPM والمقام إلى الوسوم', 'تنزيل كل النتائج في ملف ZIP واحد، وتصغير الأغلفة إلى 500/1000/1500 بكسل'],
  f4l: ['WAV وMP3 بجودة 320 kbps: المسارات والنسخة الموسيقية والأصل', 'MIDI للبيانو: الكوردات وخط الباص ولحن الغناء',
    'الطبول إلى MIDI: الكيك والسنير والهاي هات من مسار الطبول، مضبوطة على 1/16', 'كل شيء بالإيقاع والمقام اللذين اخترتهما، بدءًا من المازورة 1'],
  f5k: 'الحساب والنقاط', f5h: 'مكتبتك معك أينما كنت',
  f5p: 'سجّل ببريدك الإلكتروني وأكّده برمز نرسله إليه، وتُحفظ أغانيك في حسابك — مع ملف الصوت، بشكل خاص.',
  f5lPts: ['نقاط هدية عند التسجيل، وباقات شهرية لمن يفصل المسارات كثيرًا', 'ادعُ أصدقاءك: تحصل أنت وصديقك على نقاط'],
  f5l: ['«أغانيّ» محفوظة مع ملف الصوت، بشكل خاص', 'ملف شخصي بصورة واسم ونبذة، والوضع الفاتح والداكن، و5 لغات', 'إضافة مدمجة لإمكانية الوصول'],
  prv: [['رفع خاص لكل حساب', 'الأغاني التي ترفعها تُحفظ في تخزين خاص بحسابك وتُفتح بروابط موقّعة لمدة محدودة. يمكن لصاحب الموقع والمشرفين المخوّلين الوصول إليها لأغراض الدعم والإشراف.'],
    ['تحليلات مشتركة، لا صوت أبدًا', 'تحليلات المقاطع التجريبية في «اكتشف» تُحفظ في كتالوج مشترك — المقام وBPM والكوردات فقط، دون صوت ودون اسم المستخدم.'],
    ['المعالجة على جهازك', 'التحليل وفصل المسارات والتصدير تعمل داخل متصفحك. تُحفظ نتائج تحليل المكتبة في متصفحك، لكل حساب على حدة.']],
  faqX: [['كيف أنقل التحليل إلى rekordbox أو Serato أو Traktor؟', 'في تحليل المكتبة صدّر ملف XML لـ rekordbox (مع BPM والمقام والشبكة ونقاط الإشارة) أو ملف NML لـ Traktor. أما Serato وVirtualDJ فنزّل لهما نسخ MP3 تحمل نقاط الإشارة بداخلها.']],
  incFree: ['BPM والمقام والشدة', 'الكوردات وورقة الكوردات والمخططات', 'اكتشف ومزج DJ وتحليل المكتبة', 'تصدير MIDI للبيانو'],
  rowDisc: 'اكتشف ومزج DJ وتحليل المكتبة',
  lgNav: 'مستندات', lgTerms: 'شروط الاستخدام', lgPrivacy: 'سياسة الخصوصية', lgA11y: 'بيان إمكانية الوصول'
},
ru: {
  heroP: 'Темп, тональность и аккорды за секунды, разделение на стемы с AI, живой микс на двух деках, анализ целой библиотеки для диджеев и экспорт в FL Studio. Всё работает в браузере — ничего не нужно устанавливать.',
  f1l: ['BPM, тональность и громкость (LUFS) — с привычными названиями тональностей вроде Am или F#m',
    'Аккорды с живым листом аккордов, аппликатуры для гитары и фортепиано, транспонирование и каподастр',
    'RGB-волна как у DJ — красный для низов, зелёный для середины, синий для верхов — с битовой сеткой, лупами, хот-кью и метрономом',
    'Меняйте темп без изменения высоты тона, а тональность — без изменения темпа',
    'Разделение с AI на вокал, барабаны, бас и остальное (Demucs v4 в браузере, с ускорением на GPU, если есть) и микшер с mute, solo и караоке',
    'Последняя песня открывается сама, даже после закрытия браузера',
    'Моя тональность: спойте в микрофон, узнайте свой диапазон и получите самую удобную тональность для песни — и перенесите её туда одним нажатием'],
  f2l: ['Чарты и новинки в мире и в Израиле, с фильтром «Израиль», который показывает израильских артистов', 'Тональность, BPM и аккорды для каждого трека',
    'DJ-совпадения: гармонически совместимые тональности и темп в пределах 6%', 'Плеер внизу экрана: предыдущая и следующая, стоп, перемотка и громкость',
    'Полная песня в официальном плеере Deezer'],
  f6k: 'Анализ библиотеки', f6h: 'Вся библиотека — готова к сету',
  f6p: 'Перетащите целую папку и получите BPM, тональность, громкость и энергию каждого трека. Затем выстройте сет, проверьте кью-точки и экспортируйте в DJ-программу.',
  f6l: ['Анализ множества файлов подряд, в таблице с сортировкой и фильтрами', 'Умный порядок сета по совместимым тональностям, темпу и энергии',
    'Автоматические цветные кью-точки: Intro, Vocal, Break, Build, Drop и Outro',
    'Обзор в стиле rekordbox: слушайте с любого места, перетаскивайте кью, двигайте сетку',
    'Экспорт в rekordbox (XML), Traktor (NML) и Serato (кью внутри копий MP3), а также CSV и M3U8',
    'USB для Pioneer: копии с именами латиницей по ивритскому произношению и тегами BPM и тональности в файлах'],
  f7k: 'Мэшап', f7h: 'Вокал из одной песни, бит из другой',
  f7p: 'Загрузите две песни, и Chord Room сам сведёт их по темпу, тональности и тактам. Послушайте, подвиньте и экспортируйте готовый мэшап.',
  f7l: ['AI-разделение вокала и бита или бесплатное быстрое разделение', 'Подгонка темпа с сохранением тональности и перенос вокала в подходящую (или параллельную) тональность', 'Вокал входит ровно на такт бита, сдвиг на долю или на 10 мс', 'Таймлайн с двумя волнами, луп и плавные вход/выход, экспорт в WAV или MP3'],
  f8k: 'Конвертер', f8h: 'Любой файл — в нужном формате', f8p: 'Перетащите стопку аудио- или видеофайлов и получите MP3, WAV, FLAC, OGG или M4A с тегами и обложкой. Всё работает в браузере: ни один файл не загружается.',
  f8l: ['Много файлов сразу, включая звуковую дорожку видео (MP4, MOV, WebM, MKV)', 'Частота дискретизации, разрядность или битрейт, стерео/моно, нормализация до −14 LUFS, обрезка тишины и плавные переходы', 'Название, исполнитель, альбом и обложка переходят в новый файл; в теги можно добавить BPM и тональность', 'Все результаты одним ZIP, а обложки — в 500/1000/1500 px'],
  f4l: ['WAV и MP3 320 kbps: стемы, инструментал и оригинал', 'Фортепианный MIDI: аккорды, бас-линия и вокальная мелодия',
    'Барабаны в MIDI: бочка, малый и хай-хэт из стема барабанов, с квантизацией 1/16', 'Всё в выбранном темпе и тональности, с первого такта'],
  f5k: 'Аккаунт и баллы', f5h: 'Ваша библиотека всегда с вами',
  f5p: 'Регистрируйтесь по email, подтверждайте кодом из письма — и песни сохраняются в аккаунте вместе с аудиофайлом, приватно.',
  f5lPts: ['Подарочные баллы при регистрации и ежемесячные тарифы для тех, кто часто разделяет стемы', 'Приглашайте друзей: баллы получаете и вы, и друг'],
  f5l: ['«Мои песни» сохраняются вместе с аудиофайлом, приватно', 'Профиль с фото, именем и описанием, светлая и тёмная тема, 5 языков', 'Встроенный плагин доступности'],
  prv: [['Приватные загрузки для каждого аккаунта', 'Загруженные песни хранятся приватно в вашем аккаунте и открываются по ссылкам, подписанным на ограниченное время. Владелец сайта и уполномоченные администраторы могут получить к ним доступ для поддержки и модерации.'],
    ['Общие анализы, но не аудио', 'Анализы превью из обзора попадают в общий каталог — только тональность, BPM и аккорды, без аудио и без имени пользователя.'],
    ['Обработка на вашем устройстве', 'Анализ, разделение на стемы и экспорт выполняются в браузере. Результаты анализа библиотеки хранятся в вашем браузере, отдельно для каждого аккаунта.']],
  faqX: [['Как перенести анализ в rekordbox, Serato или Traktor?', 'В анализе библиотеки экспортируйте XML для rekordbox (с BPM, тональностью, сеткой и кью-точками) или NML для Traktor. Для Serato и VirtualDJ скачайте копии MP3, в которых кью уже записаны.']],
  incFree: ['BPM, тональность и громкость', 'Аккорды, лист аккордов и аппликатуры', 'Обзор, DJ-микс и анализ библиотеки', 'Экспорт фортепианного MIDI'],
  rowDisc: 'Обзор, DJ-микс и анализ библиотеки',
  lgNav: 'Документы', lgTerms: 'Условия использования', lgPrivacy: 'Политика конфиденциальности', lgA11y: 'Заявление о доступности'
},
es: {
  heroP: 'Tempo, tonalidad y acordes en segundos, separación de pistas con IA, una mezcla en vivo con dos platos, análisis de bibliotecas completas para DJs y exportación a FL Studio. Todo funciona en tu navegador, sin instalar nada.',
  f1l: ['BPM, tonalidad y sonoridad (LUFS), con nombres de tonalidad conocidos como Am o F#m',
    'Acordes con hoja de acordes en vivo, diagramas de guitarra y piano, transposición y cejilla',
    'Forma de onda RGB estilo DJ —rojo para graves, verde para medios, azul para agudos— con rejilla de beats, loops, hot cues y metrónomo',
    'Cambia el tempo sin cambiar el tono, y la tonalidad sin cambiar el tempo',
    'Separación con IA en voz, batería, bajo y resto (Demucs v4 en el navegador, con aceleración GPU si está disponible) y mezclador con mute, solo y karaoke',
    'Tu última canción se vuelve a abrir sola, incluso después de cerrar el navegador',
    'Mi tono: canta al micrófono, descubre tu registro y recibe la tonalidad más cómoda para cantar la canción, y llévala allí con un clic'],
  f2l: ['Listas y novedades del mundo y de Israel, con un filtro «Israelí» que muestra artistas israelíes', 'Tonalidad, BPM y acordes de cada tema',
    'Coincidencias DJ: tonalidades armónicamente compatibles y tempo dentro del 6 %', 'Un reproductor abajo: anterior y siguiente, detener, avanzar dentro de la canción y volumen',
    'Canción completa en el reproductor oficial de Deezer'],
  f6k: 'Análisis de biblioteca', f6h: 'Toda tu biblioteca, lista para el set',
  f6p: 'Arrastra una carpeta entera y obtén BPM, tonalidad, sonoridad y energía de cada tema. Después ordena el set, revisa los puntos cue y exporta a tu software de DJ.',
  f6l: ['Analiza muchos archivos seguidos, en una tabla que puedes ordenar y filtrar', 'Orden inteligente del set por tonalidades compatibles, tempo y energía',
    'Puntos cue automáticos en color: Intro, Vocal, Break, Build, Drop y Outro',
    'Vista estilo rekordbox: escucha desde cualquier punto, arrastra un cue y mueve la rejilla',
    'Exporta a rekordbox (XML), Traktor (NML) y Serato (cues dentro de las copias MP3), además de CSV y M3U8',
    'USB para Pioneer: copias con nombres en letras latinas según la pronunciación hebrea, con etiquetas de BPM y tonalidad en los archivos'],
  f7k: 'Mashup', f7h: 'La voz de una canción, la base de otra',
  f7p: 'Carga dos canciones y Chord Room las ajusta por ti: tempo, tonalidad y compases. Escucha, ajusta y exporta un mashup terminado.',
  f7l: ['Separación con IA de la voz y la base, o una separación rápida gratis', 'Ajuste de tempo sin cambiar la tonalidad, y la voz movida a una tonalidad compatible (o su relativa)', 'La voz entra justo en un compás de la base; ajuste por tiempo o por 10 ms', 'Línea de tiempo con dos ondas, bucle y fundidos, exportación a WAV o MP3'],
  f8k: 'Convertir', f8h: 'Cualquier archivo, en el formato que necesitas', f8p: 'Arrastra un montón de archivos de audio o vídeo y obtén MP3, WAV, FLAC, OGG o M4A con sus etiquetas y carátula. Todo se ejecuta en el navegador: no se sube ningún archivo.',
  f8l: ['Muchos archivos a la vez, incluida la pista de audio de los vídeos (MP4, MOV, WebM, MKV)', 'Frecuencia de muestreo, profundidad de bits o bitrate, estéreo/mono, normalización a −14 LUFS, recorte de silencio y fundidos', 'Título, artista, álbum y carátula pasan al archivo nuevo; se pueden añadir BPM y tonalidad a las etiquetas', 'Descarga todos los resultados en un ZIP, y reduce carátulas a 500/1000/1500 px'],
  f4l: ['WAV y MP3 a 320 kbps: pistas, instrumental y original', 'MIDI de piano: acordes, línea de bajo y melodía vocal',
    'Batería a MIDI: bombo, caja y hi-hat desde la pista de batería, cuantizados a 1/16', 'Todo en el tempo y la tonalidad que elijas, desde el compás 1'],
  f5k: 'Cuenta y puntos', f5h: 'Tu biblioteca, donde estés',
  f5p: 'Regístrate con tu email, confírmalo con un código y tus canciones se guardan en tu cuenta, con el archivo de audio incluido y de forma privada.',
  f5lPts: ['Puntos de regalo al registrarte y planes mensuales para quien separa muchas pistas', 'Invita a amigos: tú y tu amigo recibís puntos'],
  f5l: ['Mis canciones guardadas con el archivo de audio, en privado', 'Perfil con foto, nombre y bio, modo claro y oscuro, y 5 idiomas', 'Plugin de accesibilidad integrado'],
  prv: [['Subidas privadas, por cuenta', 'Las canciones que subes se guardan de forma privada en tu cuenta y se abren con enlaces firmados por tiempo limitado. El propietario del sitio y los administradores autorizados pueden acceder a ellas para soporte y moderación.'],
    ['Análisis compartidos, nunca audio', 'Los análisis de las vistas previas de Descubrir van a un catálogo compartido: solo tonalidad, BPM y acordes, sin audio y sin nombre de usuario.'],
    ['Procesamiento en tu dispositivo', 'El análisis, la separación de pistas y las exportaciones se ejecutan en tu navegador. Los resultados del análisis de biblioteca se guardan en tu navegador, por separado para cada cuenta.']],
  faqX: [['¿Cómo llevo el análisis a rekordbox, Serato o Traktor?', 'En Análisis de biblioteca, exporta un archivo XML para rekordbox (con BPM, tonalidad, rejilla y puntos cue) o un NML para Traktor. Para Serato y VirtualDJ, descarga copias MP3 que ya llevan los cues dentro.']],
  incFree: ['BPM, tonalidad y sonoridad', 'Acordes, hoja de acordes y diagramas', 'Descubrir, Mezcla DJ y análisis de biblioteca', 'Exportación MIDI de piano'],
  rowDisc: 'Descubrir, Mezcla DJ y análisis de biblioteca',
  lgNav: 'Documentos', lgTerms: 'Términos de uso', lgPrivacy: 'Política de privacidad', lgA11y: 'Declaración de accesibilidad'
}
};
for (const l in SX) Object.assign(S[l], SX[l]);

/* plural forms, keyed by Intl.PluralRules categories */
const PL = {
  he: { pts: { one: 'נקודה אחת', two: '2 נקודות', other: '{n} נקודות' }, ptsL: { one: 'נקודה', other: 'נקודות' },
    sep: { one: 'הפרדה אחת', other: '{n} הפרדות ערוצים' }, dl: { one: 'הורדה אחת', other: '{n} הורדות ערוצים' } },
  en: { pts: { one: '{n} point', other: '{n} points' }, ptsL: { one: 'point', other: 'points' },
    sep: { one: '{n} stem separation', other: '{n} stem separations' }, dl: { one: '{n} stem download', other: '{n} stem downloads' } },
  ar: { pts: { one: 'نقطة واحدة', two: 'نقطتان', few: '{n} نقاط', many: '{n} نقطة', other: '{n} نقطة' }, ptsL: { few: 'نقاط', other: 'نقطة' },
    sep: { one: 'عملية فصل واحدة', two: 'عمليتا فصل', few: '{n} عمليات فصل', many: '{n} عملية فصل', other: '{n} عملية فصل' },
    dl: { one: 'تنزيل واحد', two: 'تنزيلان', few: '{n} تنزيلات', many: '{n} تنزيلًا', other: '{n} تنزيل' } },
  ru: { pts: { one: '{n} балл', few: '{n} балла', many: '{n} баллов', other: '{n} балла' }, ptsL: { one: 'балл', few: 'балла', many: 'баллов', other: 'балла' },
    sep: { one: '{n} разделение', few: '{n} разделения', many: '{n} разделений', other: '{n} разделения' },
    dl: { one: '{n} скачивание стемов', few: '{n} скачивания стемов', many: '{n} скачиваний стемов', other: '{n} скачивания стемов' } },
  es: { pts: { one: '{n} punto', other: '{n} puntos' }, ptsL: { one: 'punto', other: 'puntos' },
    sep: { one: '{n} separación', other: '{n} separaciones' }, dl: { one: '{n} descarga de pistas', other: '{n} descargas de pistas' } }
};

/* ---------- helpers ---------- */
function L() { const l = (document.documentElement.lang || 'he').slice(0, 2).toLowerCase(); return S[l] ? l : 'en'; }
function loc() { const l = L(); return l === 'ar' ? 'ar-u-nu-latn' : l === 'he' ? 'he-IL' : l; }
function t(k) { const v = S[L()][k]; return v !== undefined ? v : S.en[k]; }
function fill(s, v) { return v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)) : s; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtN(n) { try { return new Intl.NumberFormat(loc()).format(n); } catch (e) { return String(n); } }
function num(n, pre) { return '<span class="pg-n" dir="ltr">' + (pre || '') + fmtN(n) + '</span>'; }
function plCat(n) { try { return new Intl.PluralRules(loc()).select(n); } catch (e) { return n === 1 ? 'one' : 'other'; } }
function pl(k, n, pre) { const f = PL[L()][k]; const c = plCat(n); let s = f[c] !== undefined ? f[c] : f.other; if (pre && s.indexOf('{n}') < 0) s = '{n} ' + (PL[L()].ptsL[c] || PL[L()].ptsL.other); return fill(s, { n: num(n, pre) }); }
function plWord(k, n) { const f = PL[L()][k]; const c = plCat(n); return f[c] !== undefined ? f[c] : f.other; }
function planName(id) { const p = t('plans'); return p[id] || (S.en.plans[id]) || String(id || '').replace(/^./, c => c.toUpperCase()); }
function reduced() { return (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) || document.documentElement.classList.contains('a11y-noanim'); }
function fmtDate(iso) { try { return new Intl.DateTimeFormat(loc(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)); } catch (e) { return String(iso).slice(0, 10); } }
function money(v, cur) {
  cur = cur || 'ILS';
  let parts;
  try { parts = new Intl.NumberFormat(loc(), { style: 'currency', currency: cur, maximumFractionDigits: v % 1 ? 2 : 0, minimumFractionDigits: 0 }).formatToParts(v); }
  catch (e) { parts = [{ type: 'integer', value: String(v) }, { type: 'literal', value: ' ' }, { type: 'currency', value: cur }]; }
  let h = '';
  for (const p of parts) {
    if (p.type === 'currency') h += '<span class="pg-cur">' + esc(p.value) + '</span>';
    else if (p.type === 'literal') continue;
    else if (p.type === 'minusSign') h += '<b>−</b>';
    else h += '<b>' + esc(p.value.replace(/[‎‏]/g, '')) + '</b>';
  }
  return '<span class="pg-price" dir="ltr">' + h.replace(/<\/b><b>/g, '') + '</span>';
}
/* qw: approximate USD next to the shekel price for non-Hebrew languages (fixed rate billing.usd_rate, default 3.7) */
function usdApprox(v, cur, billing) {
  if (L() === 'he' || (cur || 'ILS') !== 'ILS' || !(v > 0)) return '';
  const rate = +(billing && billing.usd_rate) > 0 ? +billing.usd_rate : 3.7, usd = Math.round(v / rate);
  return '<span class="pg-usd" dir="ltr" title="' + esc(t('usdNote')) + '">≈ $' + usd + '</span>';
}

/* ---------- icons (24px grid, stroke) ---------- */
const IP = {
  wave: '<path d="M3 12h1.5M7 8v8M11 4v16M15 7v10M19 10v4M21.5 12h-.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
  decks: '<circle cx="6.5" cy="12" r="4.5"/><circle cx="17.5" cy="12" r="4.5"/><circle cx="6.5" cy="12" r=".8"/><circle cx="17.5" cy="12" r=".8"/>',
  export: '<path d="M12 3v11m0 0l-4-4m4 4l4-4M4 16v4h16v-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  upload: '<path d="M12 16V4m0 0L7 9m5-5l5 5M4 20h16"/>',
  chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  chart: '<path d="M4 20V11M9.3 20V4M14.6 20v-8M20 20v-5"/>',
  gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8C10.5 4 7 3.5 7 6s3 2 5 2zM12 8c1.5-4 5-4.5 5-2s-3 2-5 2z"/>',
  spark: '<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  a11y: '<circle cx="12" cy="4.6" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v5M12 15l-3.5 6M12 15l3.5 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7.2l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z"/>',
  merge: '<path d="M3 6h2.5c4.5 0 5 6 9.5 6H21"/><path d="M3 18h2.5c4.5 0 5-6 9.5-6"/><path d="M18 9l3 3-3 3"/>',
  convert: '<path d="M4 7h11l-3-3M20 17H9l3 3"/><path d="M4 7v3M20 17v-3"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>'
};
function ic(n, cls) { return '<svg class="pg-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + IP[n] + '</svg>'; }

/* ---------- decorative art ---------- */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function bands(i, r) {
  const x = i / 7;
  const lo = Math.pow(Math.max(0, Math.sin(x * 1.9) * .5 + .5), 1.6) * (i % 8 < 2 ? 1 : .55) + r() * .12;
  const mid = (Math.sin(x * .7 + 1) * .5 + .5) * .7 + r() * .2;
  const hi = (i % 4 === 2 ? .75 : .25) + r() * .25;
  return [Math.min(1, lo), Math.min(1, mid), Math.min(1, hi)];
}
function heroWave() {
  const r = rng(7), n = 132, w = 1200, h = 120, bw = w / n;
  let g = '';
  for (let i = 0; i < n; i++) {
    const [lo, mid, hi] = bands(i, r), m = Math.max(lo, mid, hi);
    const amp = (.25 + .75 * (lo * .6 + mid * .3 + hi * .15)) * h * .48 * (0.7 + .3 * Math.sin(i / 13));
    const col = 'rgb(' + Math.round(255 * lo / m) + ',' + Math.round(235 * mid / m) + ',' + Math.round(255 * hi / m) + ')';
    g += '<rect x="' + (i * bw + bw * .18).toFixed(1) + '" y="' + (h / 2 - amp).toFixed(1) + '" width="' + (bw * .64).toFixed(1) + '" height="' + (amp * 2).toFixed(1) + '" rx="1.5" fill="' + col + '" style="--d:' + (-r() * 1.6).toFixed(2) + 's;--s:' + (.45 + r() * .4).toFixed(2) + '"/>';
  }
  return '<svg class="pg-hw" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true" focusable="false">' + g + '</svg>';
}
function artTool() {
  const r = rng(3), n = 72, x0 = 28, x1 = 452, cy = 122, bw = (x1 - x0) / n;
  let lo = '', mi = '', hi = '', grid = '';
  for (let i = 0; i < n; i++) {
    const [a, b, c] = bands(i + 11, r), x = (x0 + i * bw).toFixed(1), w = (bw * .7).toFixed(1);
    const A = 18 + a * 54, B = 10 + b * 34, C = 5 + c * 20;
    lo += '<rect x="' + x + '" y="' + (cy - A).toFixed(1) + '" width="' + w + '" height="' + (A * 2).toFixed(1) + '"/>';
    mi += '<rect x="' + x + '" y="' + (cy - B).toFixed(1) + '" width="' + w + '" height="' + (B * 2).toFixed(1) + '"/>';
    hi += '<rect x="' + x + '" y="' + (cy - C).toFixed(1) + '" width="' + w + '" height="' + (C * 2).toFixed(1) + '"/>';
    if (i % 9 === 0) grid += '<line x1="' + x + '" x2="' + x + '" y1="48" y2="196" stroke="rgba(255,255,255,' + (i % 36 === 0 ? .22 : .08) + ')"/>';
  }
  const ch = ['Am', 'F', 'C', 'G'];
  let chips = '';
  ch.forEach((c, i) => {
    const x = x0 + i * 107;
    chips += '<g class="pg-chd" style="--i:' + i + '"><rect x="' + x + '" y="216" width="99" height="40" rx="7"/><text x="' + (x + 14) + '" y="242">' + c + '</text></g>';
  });
  return '<svg viewBox="0 0 480 290" aria-hidden="true" focusable="false">' +
    '<text class="pg-am" x="28" y="30">124.0 BPM</text><text class="pg-am" x="130" y="30">Am</text><text class="pg-am dim" x="452" y="30" text-anchor="end">−8.6 LUFS</text>' +
    grid + '<g style="mix-blend-mode:screen"><g fill="#FF3B3B" opacity=".95">' + lo + '</g><g fill="#2BE36F" opacity=".9" style="mix-blend-mode:screen">' + mi + '</g><g fill="#3D7BFF" style="mix-blend-mode:screen">' + hi + '</g></g>' +
    '<g class="pg-ph"><line x1="28" x2="28" y1="42" y2="202" stroke="#fff" stroke-width="2"/><path d="M22 42h12l-6 7z" fill="#fff"/></g>' + chips + '</svg>';
}
function artDisc() {
  const rows = [['Am', '124', '#2F8CFF', '#B66DFF', 1], ['Em', '126', '#FF7A1A', '#E5322B', 1], ['Db', '98', '#2BD46A', '#2F8CFF', 0], ['C', '122', '#B66DFF', '#FF4FA3', 1]];
  let g = '<defs>';
  rows.forEach((rw, i) => { g += '<linearGradient id="pgc' + i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + rw[2] + '"/><stop offset="1" stop-color="' + rw[3] + '"/></linearGradient>'; });
  g += '</defs>';
  g += '<rect x="28" y="18" width="64" height="24" rx="12" fill="#fff"/><text class="pg-am ink" x="60" y="34.5" text-anchor="middle">TOP</text>' +
    '<rect x="100" y="18" width="64" height="24" rx="12" fill="none" stroke="#3a3a42"/><text class="pg-am" x="132" y="34.5" text-anchor="middle">NEW</text>' +
    '<rect x="172" y="18" width="44" height="24" rx="12" fill="none" stroke="#6E93FF"/><text class="pg-am" x="194" y="34.5" text-anchor="middle" fill="#6E93FF">IL</text>';
  rows.forEach((rw, i) => {
    const y = 60 + i * 56;
    g += '<g class="pg-drow" style="--i:' + i + '"><rect x="20" y="' + (y - 6) + '" width="440" height="50" rx="9" fill="' + (i === 0 ? 'rgba(255,255,255,.06)' : 'transparent') + '"/>' +
      '<text class="pg-am dim" x="34" y="' + (y + 23) + '">' + (i + 1) + '</text>' +
      '<rect x="56" y="' + y + '" width="38" height="38" rx="6" fill="url(#pgc' + i + ')"/>' +
      '<rect x="108" y="' + (y + 8) + '" width="' + (150 - i * 18) + '" height="9" rx="4.5" fill="#4a4a54"/>' +
      '<rect x="108" y="' + (y + 24) + '" width="' + (90 - i * 8) + '" height="7" rx="3.5" fill="#2c2c33"/>' +
      '<rect x="300" y="' + (y + 7) + '" width="40" height="24" rx="5" fill="' + (rw[4] ? '#fff' : '#26262c') + '"/><text class="pg-am ' + (rw[4] ? 'ink' : '') + '" x="320" y="' + (y + 23.5) + '" text-anchor="middle">' + rw[0] + '</text>' +
      '<text class="pg-am dim" x="352" y="' + (y + 24) + '">' + rw[1] + '</text>' +
      (rw[4] ? '<circle cx="436" cy="' + (y + 19) + '" r="11" fill="#1A9E5C"/><path d="M431 ' + (y + 19) + 'l3.5 3.5 6.5-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="436" cy="' + (y + 19) + '" r="11" fill="none" stroke="#34343c"/>') +
      '</g>';
  });
  return '<svg viewBox="0 0 480 290" aria-hidden="true" focusable="false">' + g + '</svg>';
}
function platter(cx, cy, col) {
  let g = '<g class="pg-plt"><circle cx="' + cx + '" cy="' + cy + '" r="84" fill="#111114" stroke="' + col + '" stroke-width="2.5"/>';
  for (let r = 72; r > 30; r -= 7) g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#1e1e23"/>';
  g += '<g class="pg-spin" style="transform-origin:' + cx + 'px ' + cy + 'px"><circle cx="' + cx + '" cy="' + cy + '" r="26" fill="' + col + '" opacity=".9"/><rect x="' + (cx - 1.5) + '" y="' + (cy - 80) + '" width="3" height="30" rx="1.5" fill="#fff"/></g>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#0a0a0c"/></g>';
  return g;
}
function artDj() {
  return '<svg viewBox="0 0 480 290" aria-hidden="true" focusable="false">' +
    '<defs><radialGradient id="pgga"><stop offset="0" stop-color="#2F8CFF" stop-opacity=".45"/><stop offset="1" stop-color="#2F8CFF" stop-opacity="0"/></radialGradient><radialGradient id="pggb"><stop offset="0" stop-color="#FF7A1A" stop-opacity=".4"/><stop offset="1" stop-color="#FF7A1A" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="112" cy="128" r="120" fill="url(#pgga)"/><circle cx="368" cy="128" r="120" fill="url(#pggb)"/>' +
    platter(112, 128, '#2F8CFF') + platter(368, 128, '#FF7A1A') +
    '<g fill="none" stroke="#2a2a31" stroke-width="4" stroke-linecap="round"><path d="M226 70v110M254 70v110"/></g>' +
    '<rect class="pg-fa" x="216" y="96" width="20" height="12" rx="3" fill="#E9E9EC"/><rect class="pg-fb" x="244" y="140" width="20" height="12" rx="3" fill="#E9E9EC"/>' +
    '<text class="pg-am dim" x="112" y="238" text-anchor="middle">SYNC · 124.0</text><text class="pg-am dim" x="368" y="238" text-anchor="middle">SYNC · 124.0</text>' +
    '<rect x="170" y="254" width="140" height="6" rx="3" fill="#2a2a31"/><rect class="pg-xf" x="232" y="248" width="16" height="18" rx="3" fill="#fff"/>' +
    '<text class="pg-am" x="240" y="40" text-anchor="middle" fill="#2BD46A">MATCH 92</text></svg>';
}
function artMashup() {
  /* two lanes (A vocals in blue, B beat in orange) on one bar grid, with the vocal entry marker and the match readout */
  let g = '<text class="pg-am dim sm" x="40" y="34">A · VOCALS</text><text class="pg-am dim sm" x="40" y="124">B · BEAT</text>';
  for (let k = 0; k <= 8; k++) g += '<rect x="' + (40 + k * 50) + '" y="42" width="1" height="150" fill="#2a2a31"/>';
  for (let x = 0; x < 400; x += 4) {
    const a = x < 100 ? 0 : (0.35 + 0.65 * Math.abs(Math.sin(x / 23) * Math.cos(x / 61))) * 26;
    const b = (0.3 + 0.7 * Math.abs(Math.sin(x / 9)) * (x % 50 < 8 ? 1 : 0.55)) * 26;
    if (a) g += '<rect x="' + (40 + x) + '" y="' + (72 - a).toFixed(1) + '" width="3" height="' + (2 * a).toFixed(1) + '" rx="1" fill="#2F8CFF" opacity=".9"/>';
    g += '<rect x="' + (40 + x) + '" y="' + (162 - b).toFixed(1) + '" width="3" height="' + (2 * b).toFixed(1) + '" rx="1" fill="#FF7A1A" opacity=".85"/>';
  }
  g += '<path d="M140 42v150" stroke="#2F8CFF" stroke-width="2" stroke-dasharray="5 4"/><path d="M134 42h12l-6 8z" fill="#2F8CFF"/>' +
    '<rect x="96" y="216" width="288" height="44" rx="10" fill="#141418" stroke="#2a2a31"/>' +
    '<text class="pg-am" x="116" y="243">124 BPM</text><text class="pg-am" x="206" y="243" fill="#B66DFF">Am + 2</text><text class="pg-am" x="300" y="243" fill="#2BD46A">MATCH 94</text>';
  return '<svg viewBox="0 0 480 290" aria-hidden="true" focusable="false">' + g + '</svg>';
}
function artCrate() {
  /* library table (title · BPM · key · energy) over a rekordbox-style overview with coloured hot cues */
  const rows = [['Am', '124.0', 8, '#2F8CFF', 1], ['F#m', '126.0', 7, '#B66DFF', 0], ['C', '122.0', 5, '#FF7A1A', 0], ['Dm', '125.0', 9, '#2BD46A', 0]];
  let g = '<text class="pg-am dim sm" x="40" y="30">TRACK</text><text class="pg-am dim sm" x="262" y="30">BPM</text><text class="pg-am dim sm" x="326" y="30">KEY</text><text class="pg-am dim sm" x="382" y="30">ENERGY</text>';
  rows.forEach((r, i) => {
    const y = 40 + i * 34;
    g += '<g class="pg-drow" style="--i:' + i + '"><rect x="24" y="' + y + '" width="432" height="28" rx="6" fill="' + (r[4] ? 'rgba(255,255,255,.07)' : 'transparent') + '"/>' +
      '<rect x="34" y="' + (y + 8) + '" width="12" height="12" rx="3" fill="' + r[3] + '"/>' +
      '<rect x="56" y="' + (y + 10) + '" width="' + (150 - i * 22) + '" height="8" rx="4" fill="#4a4a54"/>' +
      '<text class="pg-am" x="262" y="' + (y + 19) + '">' + r[1] + '</text>' +
      '<rect x="322" y="' + (y + 4) + '" width="42" height="20" rx="5" fill="' + (r[4] ? '#fff' : '#26262c') + '"/><text class="pg-am ' + (r[4] ? 'ink' : '') + '" x="343" y="' + (y + 18.5) + '" text-anchor="middle">' + r[0] + '</text>';
    for (let k = 0; k < 10; k++) g += '<rect x="' + (382 + k * 7) + '" y="' + (y + 8) + '" width="5" height="12" rx="1.5" fill="' + (k < r[2] ? (k > 7 ? '#FF7A1A' : k > 4 ? '#B66DFF' : '#2F8CFF') : '#26262c') + '"/>';
    g += '</g>';
  });
  /* overview: RGB waveform, bar grid and cue flags A–F */
  const r = rng(21), x0 = 24, x1 = 456, cy = 232, n = 108, bw = (x1 - x0) / n;
  let lo = '', mi = '', hi = '', grid = '';
  for (let i = 0; i < n; i++) {
    const [a, b, c] = bands(i + 3, r), x = (x0 + i * bw).toFixed(1), w = (bw * .72).toFixed(1), e = i < 12 || i > 98 ? .45 : (i > 40 && i < 58) ? (i < 49 ? .3 + (i - 40) * .06 : .3) : 1;
    const A = (6 + a * 22) * e, B = (4 + b * 14) * e, C = (2 + c * 8) * e;
    lo += '<rect x="' + x + '" y="' + (cy - A).toFixed(1) + '" width="' + w + '" height="' + (A * 2).toFixed(1) + '"/>';
    mi += '<rect x="' + x + '" y="' + (cy - B).toFixed(1) + '" width="' + w + '" height="' + (B * 2).toFixed(1) + '"/>';
    hi += '<rect x="' + x + '" y="' + (cy - C).toFixed(1) + '" width="' + w + '" height="' + (C * 2).toFixed(1) + '"/>';
    if (i % 6 === 0) grid += '<line x1="' + x + '" x2="' + x + '" y1="196" y2="268" stroke="rgba(255,255,255,' + (i % 24 === 0 ? .2 : .07) + ')"/>';
  }
  const cues = [['A', 12, '#28E214'], ['B', 26, '#305AFF'], ['C', 40, '#C3AF04'], ['D', 49, '#AA72FF'], ['E', 58, '#E62828'], ['F', 98, '#FF8C00']];
  let fl = '';
  cues.forEach((c, i) => {
    const x = (x0 + c[1] * bw).toFixed(1);
    fl += '<g class="pg-file" style="--i:' + i + '"><line x1="' + x + '" x2="' + x + '" y1="192" y2="270" stroke="' + c[2] + '" stroke-width="1.5"/><path d="M' + x + ' 186h13v11h-13z" fill="' + c[2] + '"/><text class="pg-am ink sm" x="' + (+x + 6.5) + '" y="195" text-anchor="middle">' + c[0] + '</text></g>';
  });
  return '<svg viewBox="0 0 480 290" aria-hidden="true" focusable="false">' + g +
    '<rect x="16" y="180" width="448" height="96" rx="9" fill="#0f0f12" stroke="#23232a"/>' + grid +
    '<g fill="#FF3B3B" opacity=".9">' + lo + '</g><g fill="#2BE36F" opacity=".85" style="mix-blend-mode:screen">' + mi + '</g><g fill="#3D7BFF" style="mix-blend-mode:screen">' + hi + '</g>' + fl + '</svg>';
}
function artConvert() {
  /* a queue of files turning into another format: source chips → arrow → target chips, with progress bars */
  const rows = [['WAV', 'MP3', 1, '#2F8CFF'], ['MP4', 'MP3', 1, '#B66DFF'], ['FLAC', 'M4A', 0.72, '#FF7A1A'], ['AIFF', 'FLAC', 0.35, '#2BD46A'], ['M4A', 'WAV', 0, '#4a4a54']];
  let g = '<text class="pg-am dim sm" x="40" y="30">SOURCE</text><text class="pg-am dim sm" x="226" y="30">TARGET</text><text class="pg-am dim sm" x="326" y="30">PROGRESS</text>';
  rows.forEach((r, i) => {
    const y = 42 + i * 40, w = Math.round(110 * r[2]);
    g += '<g class="pg-drow" style="--i:' + i + '"><rect x="24" y="' + y + '" width="432" height="32" rx="7" fill="' + (i === 1 ? 'rgba(255,255,255,.07)' : 'transparent') + '"/>' +
      '<rect x="36" y="' + (y + 6) + '" width="54" height="20" rx="5" fill="#26262c"/><text class="pg-am" x="63" y="' + (y + 20.5) + '" text-anchor="middle">' + r[0] + '</text>' +
      '<path d="M104 ' + (y + 16) + 'h18M117 ' + (y + 11) + 'l5 5-5 5" fill="none" stroke="' + r[3] + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<rect x="134" y="' + (y + 12) + '" width="' + (72 - i * 9) + '" height="8" rx="4" fill="#4a4a54"/>' +
      '<rect x="226" y="' + (y + 6) + '" width="54" height="20" rx="5" fill="' + (r[2] >= 1 ? '#fff' : '#26262c') + '"/><text class="pg-am ' + (r[2] >= 1 ? 'ink' : '') + '" x="253" y="' + (y + 20.5) + '" text-anchor="middle">' + r[1] + '</text>' +
      '<rect x="326" y="' + (y + 13) + '" width="110" height="6" rx="3" fill="#26262c"/>' + (w ? '<rect x="326" y="' + (y + 13) + '" width="' + w + '" height="6" rx="3" fill="' + r[3] + '"/>' : '') +
      (r[2] >= 1 ? '<path d="M443 ' + (y + 16) + 'l3 3 6-6" fill="none" stroke="#2BD46A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' : '') + '</g>';
  });
  g += '<rect x="96" y="246" width="288" height="30" rx="8" fill="#141418" stroke="#2a2a31"/><text class="pg-am dim" x="240" y="266" text-anchor="middle">ON DEVICE · NOTHING UPLOADED</text>';
  return '<svg viewBox="0 0 480 290" aria-hidden="true" focusable="false">' + g + '</svg>';
}
function artExport() {
  const files = [['WAV', '#2F8CFF'], ['MP3 320', '#FF7A1A'], ['MIDI', '#B66DFF']];
  let g = '';
  files.forEach((f, i) => {
    const x = 28 + i * 146;
    g += '<g class="pg-file" style="--i:' + i + '"><path d="M' + x + ' 20h104l20 20v40a6 6 0 0 1-6 6H' + (x + 6) + 'a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6z" transform="translate(0 0)" fill="#141418" stroke="#2c2c33"/>' +
      '<path d="M' + (x + 104) + ' 20v14a6 6 0 0 0 6 6h14" fill="none" stroke="#2c2c33"/>' +
      '<rect x="' + (x + 14) + '" y="54" width="' + (f[0].length > 4 ? 74 : 50) + '" height="20" rx="4" fill="' + f[1] + '"/><text class="pg-am ink2" x="' + (x + 21) + '" y="68">' + f[0] + '</text></g>';
  });
  /* piano roll: keys + notes (blue chords, orange bass, purple melody) */
  const top = 108, rh = 11, rows = 14, x0 = 64, x1 = 452;
  g += '<rect x="28" y="' + top + '" width="' + (x1 - 28) + '" height="' + rows * rh + '" rx="6" fill="#0f0f12" stroke="#23232a"/>';
  for (let i = 0; i < rows; i++) {
    const blk = [1, 3, 6, 8, 10].includes(i % 12);
    g += '<rect x="29" y="' + (top + i * rh) + '" width="32" height="' + rh + '" fill="' + (blk ? '#1a1a1e' : '#d9d9de') + '" stroke="#0f0f12" stroke-width=".6"/>';
    g += '<line x1="' + x0 + '" x2="' + x1 + '" y1="' + (top + i * rh) + '" y2="' + (top + i * rh) + '" stroke="#1b1b20"/>';
  }
  for (let b = 0; b <= 8; b++) g += '<line x1="' + (x0 + b * 48.5) + '" x2="' + (x0 + b * 48.5) + '" y1="' + top + '" y2="' + (top + rows * rh) + '" stroke="' + (b % 4 ? '#1b1b20' : '#2c2c34') + '"/>';
  const note = (c, r0, b0, len, col) => '<rect class="pg-note" style="--i:' + c + '" x="' + (x0 + b0 * 48.5 + 1.5) + '" y="' + (top + r0 * rh + 1.5) + '" width="' + (len * 48.5 - 3) + '" height="' + (rh - 3) + '" rx="2.5" fill="' + col + '"/>';
  const chords = [[4, 7, 9], [5, 8, 10], [3, 6, 8], [4, 6, 9]];
  let k = 0;
  chords.forEach((c, i) => c.forEach(r0 => { g += note(k++, r0, i * 2, 2, '#2F8CFF'); }));
  [[12, 0], [12, 1], [13, 2], [13, 3], [11, 4], [11, 5], [12, 6], [12, 7]].forEach(([r0, b0]) => { g += note(k++, r0, b0, 1, '#FF7A1A'); });
  [[1, 0, .5], [0, .5, .5], [2, 1, 1], [1, 2.5, .5], [0, 3, 1.5], [2, 5, .5], [1, 5.5, 1], [0, 6.5, 1.5]].forEach(([r0, b0, l]) => { g += note(k++, r0, b0, l, '#B66DFF'); });
  return '<svg viewBox="0 0 480 290" aria-hidden="true" focusable="false">' + g + '</svg>';
}
function artAcc() {
  let g = '<defs><linearGradient id="pgav" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F8CFF"/><stop offset=".5" stop-color="#B66DFF"/><stop offset="1" stop-color="#FF7A1A"/></linearGradient></defs>';
  g += '<rect x="28" y="24" width="180" height="232" rx="12" fill="#141418" stroke="#26262c"/>' +
    '<circle cx="118" cy="82" r="34" fill="url(#pgav)"/><circle cx="118" cy="74" r="11" fill="#141418" opacity=".55"/><path d="M98 104c4-10 12-14 20-14s16 4 20 14" fill="#141418" opacity=".55"/>' +
    '<rect x="68" y="132" width="100" height="10" rx="5" fill="#E9E9EC"/><rect x="58" y="152" width="120" height="7" rx="3.5" fill="#34343c"/><rect x="74" y="166" width="88" height="7" rx="3.5" fill="#34343c"/>';
  ['HE', 'EN', 'AR', 'RU', 'ES'].forEach((l, i) => {
    g += '<rect x="' + (44 + i * 30) + '" y="206" width="26" height="20" rx="4" fill="' + (i === 0 ? '#fff' : 'none') + '" stroke="#3a3a42"/><text class="pg-am sm ' + (i === 0 ? 'ink' : 'dim') + '" x="' + (57 + i * 30) + '" y="220" text-anchor="middle">' + l + '</text>';
  });
  const cols = ['#FF7A1A', '#2F8CFF', '#B66DFF', '#2BD46A'];
  for (let i = 0; i < 4; i++) {
    const y = 24 + i * 50;
    g += '<g class="pg-srow" style="--i:' + i + '"><rect x="226" y="' + y + '" width="226" height="42" rx="9" fill="#141418" stroke="#26262c"/>' +
      '<rect x="236" y="' + (y + 8) + '" width="26" height="26" rx="5" fill="' + cols[i] + '" opacity=".9"/>' +
      '<rect x="272" y="' + (y + 11) + '" width="' + (104 - i * 12) + '" height="8" rx="4" fill="#4a4a54"/><rect x="272" y="' + (y + 25) + '" width="62" height="6" rx="3" fill="#2c2c33"/>' +
      '<g transform="translate(418 ' + (y + 11) + ') scale(.8)" fill="none" stroke="#8B8B93" stroke-width="2" stroke-linecap="round">' + IP.lock + '</g></g>';
  }
  g += '<g transform="translate(226 232)"><rect width="84" height="30" rx="15" fill="#141418" stroke="#26262c"/><circle class="pg-tg" cx="17" cy="15" r="11" fill="#fff"/>' +
    '<g transform="translate(51 5) scale(.8)" fill="none" stroke="#8B8B93" stroke-width="2"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></g></g>';
  return '<svg viewBox="0 0 480 290" aria-hidden="true" focusable="false">' + g + '</svg>';
}

/* ---------- shared bits ---------- */
function sh(eb, h, lvl, extra) { lvl = lvl || 2; return '<div class="pg-sh rv">' + '<span class="pg-eb">' + eb + '</span><h' + lvl + ' class="pg-h">' + h + '</h' + lvl + '>' + (extra || '') + '</div>'; }
function faqList(items, v) {
  return '<div class="pg-faql">' + items.map((q, i) => '<details class="rv" style="--i:' + i + '"><summary><span>' + fill(q[0], v) + '</span><i class="pg-pm" aria-hidden="true"></i></summary><div class="pg-ans"><p>' + fill(q[1], v) + '</p></div></details>').join('') + '</div>';
}
function contactLine(prefix, billing) {
  const c = PAGES.contact || (billing && billing.contact) || (last.pricing && last.pricing.billing && last.pricing.billing.contact) || '';
  let link = '';
  if (c) {
    const isMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c), isUrl = /^https?:\/\//i.test(c);
    const href = isMail ? 'mailto:' + c : isUrl ? c : '';
    link = href ? '<a class="pg-mail" href="' + esc(href) + '"' + (isUrl ? ' target="_blank" rel="noopener"' : '') + '>' + ic('mail') + '<span dir="ltr">' + esc(c) + '</span></a>'
      : '<span class="pg-mail" dir="auto">' + ic('mail') + esc(c) + '</span>';
  }
  return '<p class="pg-contact"><b>' + prefix + '</b> ' + (link ? '<span class="pg-cw">' + t('contactW') + '</span>' + link : '<span>' + t('contactNone') + '</span>') + '</p>';
}

/* Terms / Privacy (#terms, #privacy — routed by app.js) and the accessibility statement */
function legalLinks(a11y) {
  return '<nav class="pg-legal" aria-label="' + esc(t('lgNav')) + '"><a href="#terms">' + esc(t('lgTerms')) + '</a><a href="#privacy">' + esc(t('lgPrivacy')) + '</a>' +
    (a11y ? '<a href="#about-a11y">' + esc(t('lgA11y')) + '</a>' : '') + '</nav>';
}

/* ---------- About ---------- */
function renderAbout(el, billing) {
  if (!el) return;
  if (billing) PAGES.billing = billing;
  billing = billing || PAGES.billing || (last.pricing && last.pricing.billing) || null;
  last.about = { el, billing };
  const st = t('stems'), stc = ['#FF4FA3', '#FFC53D', '#3D8BFF', '#2BD46A'];
  const con = '<div class="pg-con rv" style="--i:2" aria-hidden="true">' +
    '<div class="pg-cbar"><i></i><i></i><i></i><span dir="ltr">demo-song.wav</span></div>' +
    '<div class="pg-rd">' +
      '<div><span>' + t('rdBpm') + '</span><b dir="ltr">124.0</b></div>' +
      '<div><span>' + t('rdKey') + '</span><b dir="ltr">Am</b></div>' +
      '<div><span>' + t('rdCam') + '</span><b dir="ltr">3:24</b></div>' +
      '<div><span>' + t('rdLufs') + '</span><b dir="ltr">−8.6</b></div></div>' +
    '<div class="pg-cch" dir="ltr">' + ['Am', 'F', 'C', 'G'].map((c, i) => '<span style="--i:' + i + '">' + c + '</span>').join('') + '</div>' +
    '<div class="pg-stm">' + st.map((s, i) => '<div style="--c:' + stc[i] + ';--i:' + i + '"><span>' + s + '</span><i><u></u></i></div>').join('') + '</div></div>';
  const hero = '<section class="pg-hero" aria-labelledby="pgHeroH">' +
    '<div class="pg-glow g1"></div><div class="pg-glow g2"></div><div class="pg-glow g3"></div>' +
    '<div class="pg-hgrid"><div class="pg-htxt">' +
      '<span class="pg-eb rv">' + t('aboutEyebrow') + '</span>' +
      '<h1 id="pgHeroH" class="rv" style="--i:1">' + t('heroH') + '</h1>' +
      '<p class="pg-lead rv" style="--i:2">' + t('heroP') + '</p>' +
      '<div class="pg-ctas rv" style="--i:3">' +
        '<button type="button" class="pg-btn pri" data-nav="tool">' + ic('play') + '<span>' + t('ctaTool') + '</span></button>' +
        '<button type="button" class="pg-btn sec" data-nav="dj">' + ic('decks') + '<span>' + t('ctaDj') + '</span></button>' +
        '<button type="button" class="pg-lnk" data-nav="discover"><span>' + t('ctaDisc') + '</span>' + ic('arrow', 'pg-arr') + '</button>' +
      '</div>' +
      '<ul class="pg-hnote rv" style="--i:4">' + t('heroNote').map(s => '<li>' + s + '</li>').join('') + '</ul>' +
    '</div>' + con + '</div>' +
    '<div class="pg-hwave" aria-hidden="true">' + heroWave() + '<i class="pg-hph"></i></div></section>';

  const payOn = !billing || billing.on !== false;
  const feats = [
    ['wave', 'blue', artTool(), 'tool', 1], ['compass', 'orange', artDisc(), 'discover', 2], ['decks', 'purple', artDj(), 'dj', 3],
    ['layers', 'blue', artCrate(), 'crate', 6], ['merge', 'orange', artMashup(), 'mashup', 7], ['convert', 'purple', artConvert(), 'convert', 8], ['export', 'blue', artExport(), null, 4], ['user', 'blue', artAcc(), null, 5]
  ];
  const fList = k => k === 5 ? (payOn ? t('f5lPts') : []).concat(t('f5l')) : t('f' + k + 'l');
  const featHtml = '<section class="pg-sec" aria-labelledby="pgFeatH">' + sh(t('featEyebrow'), t('featH')).replace('<h2 class="pg-h">', '<h2 class="pg-h" id="pgFeatH">') +
    '<div class="pg-feats">' + feats.map((f, i) => {
      const n = f[4];
      return '<article class="pg-feat" style="--acc:var(--pg-' + f[1] + ')">' +
        '<div class="pg-ftxt rv">' +
          '<div class="pg-fk"><span class="pg-badge">' + ic(f[0]) + '</span><span class="pg-fn" dir="ltr">0' + (i + 1) + '</span><span class="pg-fkt">' + t('f' + n + 'k') + '</span></div>' +
          '<h3>' + t('f' + n + 'h') + '</h3><p class="pg-fp">' + t('f' + n + 'p') + '</p>' +
          '<ul class="pg-list">' + fList(n).map(s => '<li>' + ic('check') + '<span>' + s + '</span></li>').join('') + '</ul>' +
          (f[3] ? '<button type="button" class="pg-lnk ink" data-nav="' + f[3] + '"><span>' + t('f' + n + 'k') + '</span>' + ic('arrow', 'pg-arr') + '</button>' : '') +
        '</div>' +
        '<div class="pg-art rv" style="--i:1" aria-hidden="true">' + f[2] + '</div></article>';
    }).join('') + '</div></section>';

  const howIc = ['upload', 'chip', 'sliders'];
  const how = '<section class="pg-sec" aria-labelledby="pgHowH">' + sh(t('howEyebrow'), t('howH')).replace('<h2 class="pg-h">', '<h2 class="pg-h" id="pgHowH">') +
    '<ol class="pg-steps rv">' + t('how').map((s, i) => '<li style="--i:' + i + '"><span class="pg-sn" dir="ltr">0' + (i + 1) + '</span>' + ic(howIc[i]) + '<h3>' + s[0] + '</h3><p>' + s[1] + '</p></li>').join('') + '</ol></section>';

  let tiles = '';
  if (billing && billing.on !== false) {
    const c = billing.costs || {};
    const nn = v => (v == null || v === '' || !isFinite(+v)) ? null : Math.max(0, Math.round(+v));   // numbers only: these go into HTML
    const tl = [['gift', 'orange', t('ptsGift'), nn(billing.signup), true], ['spark', 'blue', t('ptsSep'), nn(c.sep)], ['export', 'purple', t('ptsDl'), nn(c.stems)]];
    tiles = '<div class="pg-tiles">' + tl.filter(x => x[3] != null).map((x, i) => '<div class="pg-tile rv" style="--acc:var(--pg-' + x[1] + ');--i:' + i + '">' + ic(x[0]) +
      '<b dir="ltr">' + (x[4] ? '+' : '') + '<span data-count="' + x[3] + '">' + fmtN(x[3]) + '</span></b><span class="pg-tu">' + plWord('ptsL', x[3]) + '</span><span class="pg-tl">' + x[2] + '</span></div>').join('') + '</div>';
  }
  const pts = '<section class="pg-sec pg-ptsum" aria-labelledby="pgPtsH"><div class="pg-ptsin">' +
    '<div class="pg-ptxt">' + sh(t('ptsEyebrow'), t('ptsH')).replace('<h2 class="pg-h">', '<h2 class="pg-h" id="pgPtsH">') +
      '<p class="pg-fp rv">' + t('ptsP') + (billing && billing.on !== false ? ' ' + t('ptsMonthly') : '') + '</p>' +
      '<button type="button" class="pg-btn ink rv" data-nav="pricing">' + ic('coin') + '<span>' + t('ptsCta') + '</span>' + ic('arrow', 'pg-arr') + '</button></div>' +
    tiles + '</div></section>';

  const prvIc = ['lock', 'layers', 'chart'];
  const prv = '<section class="pg-sec" aria-labelledby="pgPrvH">' + sh(t('prvEyebrow'), t('prvH')).replace('<h2 class="pg-h">', '<h2 class="pg-h" id="pgPrvH">') +
    '<div class="pg-prv">' + t('prv').map((p, i) => '<div class="rv" style="--i:' + i + '"><span class="pg-badge">' + ic(prvIc[i]) + '</span><h3>' + p[0] + '</h3><p>' + p[1] + '</p></div>').join('') + '</div></section>';

  const faq = '<section class="pg-sec pg-faq" aria-labelledby="pgFaqH"><div class="pg-faqh">' + sh(t('faqEyebrow'), t('faqH')).replace('<h2 class="pg-h">', '<h2 class="pg-h" id="pgFaqH">') + '</div>' + faqList(t('faq').concat(t('faqX'))) + '</section>';

  let stmt = '';
  try { if (window.A11Y && typeof A11Y.statementHTML === 'function') stmt = A11Y.statementHTML(L()) || ''; } catch (e) { stmt = ''; }
  const a11y = '<section class="pg-sec pg-a11y" id="about-a11y" aria-label="' + esc(t('a11yH')) + '">' +
    '<div class="pg-a11yin rv"><div class="pg-a11yh"><span class="pg-badge">' + ic('a11y') + '</span><span class="pg-eb">' + t('a11yEyebrow') + '</span></div>' +
    (stmt ? '<div class="pg-stmt">' + stmt + '</div>' : '<h2 class="pg-h">' + t('a11yH') + '</h2><p class="pg-fp">' + t('a11yPh') + '</p>') + '</div></section>';

  const foot = '<footer class="pg-foot">' + contactLine(t('contactL'), billing) + '<p class="pg-cred">' + t('credits') + '</p>' + legalLinks(true) + '</footer>';

  el.innerHTML = '<div class="pg pg-about">' + hero + featHtml + how + pts + prv + faq + a11y + foot + '</div>';
  wire(el);
}

/* ---------- Pricing ---------- */
function renderPricing(el, billing, state) {
  if (!el) return;
  billing = billing || {}; state = state || { signedIn: false, plan: 'free', credits: 0, planUntil: null };
  PAGES.billing = billing;
  last.pricing = { el, billing, state };
  const on = billing.on !== false, cur = billing.currency || 'ILS', c = billing.costs || {}, sep = +c.sep || 0, dlc = +c.stems || 0;
  const signup = +billing.signup || 0, plans = Array.isArray(billing.plans) ? billing.plans : [];
  const myPlan = state.signedIn ? (state.plan || 'free') : null;
  const accs = ['blue', 'purple', 'orange'];

  let bal = '';
  /* subscription status from the payments integration: payStatus 'active' | 'cancelled' | 'past_due' | null, renews = ISO date */
  const pay = state.signedIn && /^(active|cancelled|past_due)$/.test(state.payStatus || '') ? state.payStatus : null;
  const dt = d => '<span dir="auto">' + esc(fmtDate(d)) + '</span>';
  const endD = state.renews || state.planUntil || null;
  const stText = pay === 'active' ? (state.renews ? fill(t('stRenews'), { d: dt(state.renews) }) : t('stActive'))
    : pay === 'cancelled' ? (endD ? fill(t('stCancelled'), { d: dt(endD) }) : t('stCancelledNd'))
    : pay === 'past_due' ? t('stPastDue') : '';
  if (state.signedIn) {
    bal = '<aside class="pg-bal rv" style="--i:2"><span class="pg-eb">' + t('balance') + '</span>' +
      '<div class="pg-balv"><b dir="ltr" data-count="' + (+state.credits || 0) + '">' + fmtN(+state.credits || 0) + '</b><span>' + plWord('ptsL', +state.credits || 0) + '</span></div>' +
      '<div class="pg-balm"><span>' + t('planL') + ': <strong>' + esc(planName(myPlan)) + '</strong></span>' +
      (!pay && state.planUntil && myPlan !== 'free' ? '<span>' + fill(t('until'), { d: dt(state.planUntil) }) + '</span>' : '') + '</div>' +
      (pay ? '<p class="pg-st ' + esc(pay) + '" role="status"><i aria-hidden="true"></i><span>' + stText + '</span></p>' : '') +
      (state.portal ? '<button type="button" class="pg-btn line pg-manage" data-manage="1">' + ic('sliders') + '<span>' + t('manage') + '</span></button>' : '') + '</aside>';
  }
  const head = '<header class="pg-phead"><div>' + '<span class="pg-eb rv">' + t('prEyebrow') + '</span><h1 class="rv" style="--i:1">' + t('prH') + '</h1><p class="pg-lead rv" style="--i:2">' + t('prP') + '</p></div>' + bal + '</header>';

  function btn(kind, id) {
    if (kind === 'your') return '<button type="button" class="pg-btn line" disabled>' + ic('check') + '<span>' + t('btnYour') + '</span></button>';
    if (kind === 'incl') return '<button type="button" class="pg-btn line" disabled><span>' + t('btnIncl') + '</span></button>';
    if (kind === 'signup') return '<button type="button" class="pg-btn ink" data-signup="1"><span>' + t('btnSignup') + '</span>' + ic('arrow', 'pg-arr') + '</button>';
    if ((kind === 'sub' || kind === 'subsignup') && !/^https:\/\//.test(id.link || '')) {   /* qw: no checkout link yet → no dead-end CTA (signed in or out) */
      const c = (billing.contact || '').trim(), isMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c), isUrl = /^https:\/\//i.test(c);
      if (isMail || isUrl) return '<a class="pg-btn line pg-soon" href="' + esc(isMail ? 'mailto:' + c : c) + '"' + (isUrl ? ' target="_blank" rel="noopener"' : '') + '>' + ic('mail') + '<span>' + t('btnContact') + '</span></a>';
      return '<button type="button" class="pg-btn line pg-soon" disabled aria-disabled="true"><span>' + t('btnSoon') + '</span></button>';
    }
    if (kind === 'subsignup') return '<button type="button" class="pg-btn ' + (id.best ? 'grad' : 'ink') + '" data-signup="1"><span>' + t('btnSubSignup') + '</span>' + ic('arrow', 'pg-arr') + '</button>';
    return '<button type="button" class="pg-btn ' + (id.best ? 'grad' : 'ink') + '" data-sub="' + esc(id.id) + '"><span>' + t('btnSub') + '</span>' + ic('arrow', 'pg-arr') + '</button>';
  }
  function buys(p) {
    const out = [];
    if (sep > 0) out.push('≈ ' + pl('sep', Math.floor(p / sep)));
    if (dlc > 0) out.push((out.length ? t('buyOr') + ' ' : '') + '≈ ' + pl('dl', Math.floor(p / dlc)));
    return out.length ? '<ul class="pg-buys">' + out.map(s => '<li>' + s + '</li>').join('') + '</ul>' : '';
  }
  let cards = '';
  if (on) {
    const isCurFree = myPlan === 'free';
    cards += '<article class="pg-plan' + (isCurFree ? ' cur' : '') + ' rv" style="--acc:var(--ink);--i:0">' +
      (isCurFree ? '<span class="pg-flag cur">' + t('current') + '</span>' : '') +
      '<h3>' + esc(planName('free')) + '</h3><div class="pg-pw">' + money(0, cur) + '<span class="pg-per">' + t('perMonth') + '</span></div>' +
      (signup ? '<div class="pg-ppts"><b dir="ltr" data-count="' + signup + '">' + fmtN(signup) + '</b><span>' + plWord('ptsL', signup) + ' · ' + t('oneTime') + '</span></div>' + buys(signup) : '') +
      '<ul class="pg-list">' + t('incFree').map(s => '<li>' + ic('check') + '<span>' + s + '</span></li>').join('') + '</ul>' +
      '<div class="pg-pact">' + (!state.signedIn ? btn('signup') : isCurFree ? btn('your') : btn('incl')) + '</div></article>';
    plans.forEach((p, i) => {
      const isCur = myPlan === p.id, pts = +p.points || 0;
      cards += '<article class="pg-plan' + (p.best ? ' best' : '') + (isCur ? ' cur' : '') + ' rv" style="--acc:var(--pg-' + accs[i % 3] + ');--i:' + (i + 1) + '">' +
        (p.best ? '<span class="pg-flag best">' + ic('spark') + t('best') + '</span>' : '') + (isCur ? '<span class="pg-flag cur">' + t('current') + '</span>' : '') +
        '<h3>' + esc(planName(p.id)) + '</h3><div class="pg-pw">' + money(+p.price || 0, cur) + '<span class="pg-per">' + t('perMonth') + '</span>' + usdApprox(+p.price || 0, cur, billing) + '</div>' +
        '<div class="pg-ppts"><b dir="ltr" data-count="' + pts + '">' + fmtN(pts) + '</b><span>' + plWord('ptsL', pts) + ' · ' + t('perMonth') + '</span></div>' + buys(pts) +
        '<ul class="pg-list"><li>' + ic('check') + '<span>' + t('incAll') + '</span></li><li>' + ic('check') + '<span>' + fill(t('incPts'), { pts: pl('pts', pts) }) + '</span></li></ul>' +
        '<div class="pg-pact">' + (isCur ? btn('your') : !state.signedIn ? btn('subsignup', p) : btn('sub', p)) + '</div></article>';
    });
    cards = '<div class="pg-plans" style="--n:' + (plans.length + 1) + '">' + cards + '</div>' + (L() !== 'he' && cur === 'ILS' ? '<p class="pg-usdnote rv">' + esc(t('usdNote')) + '</p>' : '');
  } else {
    cards = '<div class="pg-off rv"><span class="pg-badge">' + ic('gift') + '</span><div><h2>' + t('offH') + '</h2><p>' + t('offP') + '</p></div>' +
      (state.signedIn ? '<button type="button" class="pg-btn ink" data-nav="tool">' + ic('play') + '<span>' + t('ctaTool') + '</span></button>' : '<button type="button" class="pg-btn ink" data-signup="1"><span>' + t('btnSignup') + '</span>' + ic('arrow', 'pg-arr') + '</button>') + '</div>';
  }

  const pv = (n, cls) => '<span class="pg-cost ' + cls + '">' + n + '</span>';
  const rows = [];
  if (on) {
    if (sep) rows.push([ic('spark'), t('rowSep'), pv(pl('pts', sep), 'paid')]);
    if (dlc) rows.push([ic('export'), t('rowDl'), pv(pl('pts', dlc), 'paid')]);
  }
  rows.push([ic('wave'), t('rowAn'), pv(t('freeV'), 'free')], [ic('decks'), t('rowDisc'), pv(t('freeV'), 'free')], [ic('sliders'), t('rowMidi'), pv(t('freeV'), 'free')]);
  if (on && signup) rows.push([ic('gift'), t('rowGift'), pv(pl('pts', signup, '+'), 'gift')]);
  const table = '<section class="pg-sec" aria-labelledby="pgTblH">' + sh(t('tblEyebrow'), t('tblH')).replace('<h2 class="pg-h">', '<h2 class="pg-h" id="pgTblH">') +
    '<div class="pg-tblw rv"><table class="pg-tbl"><thead><tr><th scope="col">' + t('tblA') + '</th><th scope="col">' + t('tblC') + '</th></tr></thead><tbody>' +
    rows.map(r => '<tr><th scope="row"><span class="pg-ti">' + r[0] + '</span>' + r[1] + '</th><td>' + r[2] + '</td></tr>').join('') + '</tbody></table></div></section>';

  const fv = { sep: pl('pts', sep), dl: pl('pts', dlc), gift: pl('pts', signup) };
  let fq = t('prFaq');
  if (!on) fq = fq.filter((q, i) => i === 3);
  else fq = fq.filter((q, i) => !(i === 1 && !signup) && !(i === 0 && !sep && !dlc));
  const faq = '<section class="pg-sec pg-faq" aria-labelledby="pgPFaqH"><div class="pg-faqh">' + sh(t('faqEyebrow'), t('prFaqH')).replace('<h2 class="pg-h">', '<h2 class="pg-h" id="pgPFaqH">') + '</div>' + faqList(fq, fv) + '</section>';
  const foot = '<footer class="pg-foot">' + contactLine(t('prContact'), billing) + legalLinks(false) + '</footer>';

  el.innerHTML = '<div class="pg pg-pricing">' + head + cards + table + faq + foot + '</div>';
  wire(el);
}

/* ---------- behaviour: clicks, reveal, count-up ---------- */
const last = { about: null, pricing: null };
let io = null;
function countUp(n) {
  const to = +n.dataset.count; if (!(to > 0) || reduced()) return;
  const t0 = performance.now(), d = 900;
  const step = now => { const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3); n.textContent = fmtN(Math.round(to * e)); if (k < 1) requestAnimationFrame(step); };
  n.textContent = fmtN(0); requestAnimationFrame(step);
}
function show(x) {
  if (x.classList.contains('in')) return;
  x.classList.add('in');
  x.querySelectorAll('[data-count]').forEach(countUp);
  if (x.matches('[data-count]')) countUp(x);
}
function wire(el) {
  const root = el.querySelector('.pg');
  if (!el.__pgWired) {
    el.__pgWired = true;
    el.addEventListener('click', e => {
      const b = e.target.closest('button,[data-nav]'); if (!b || !el.contains(b) || b.disabled) return;
      try {
        if (b.dataset.nav) PAGES.onNav(b.dataset.nav);
        else if (b.dataset.signup) PAGES.onSignup();
        else if (b.dataset.sub) PAGES.onSubscribe(b.dataset.sub);
        else if (b.dataset.manage) { if (PAGES.onManage) PAGES.onManage(); }
      } catch (err) { console.error(err); }
    });
  }
  root.classList.add('pg-anim');
  const items = root.querySelectorAll('.rv');
  if (!('IntersectionObserver' in window) || reduced()) { items.forEach(x => x.classList.add('in')); return; }
  if (!io) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
  items.forEach(x => io.observe(x));
}
function lang() {
  if (last.about && last.about.el) renderAbout(last.about.el, last.about.billing);
  if (last.pricing && last.pricing.el) renderPricing(last.pricing.el, last.pricing.billing, last.pricing.state);
}

const PAGES = window.PAGES = {
  renderAbout, renderPricing, lang,
  onNav: function () {}, onSignup: function () {}, onSubscribe: function () {}, onManage: null,
  contact: '', billing: null
};
})();
