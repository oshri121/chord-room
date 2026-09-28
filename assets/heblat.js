/* Hebrew → Latin letters by pronunciation (for players that can't show Hebrew, e.g. Pioneer CDJs / controllers).
   "עופר לוי – אני חוזר" → "Ofer Levi – Ani Chozer".
   Written Hebrew has no vowels, so this is: known artists → common words (+ prefixes ו/ה/ב/ל/מ/ש/כ) → a rule-based
   fallback that guesses the vowels. Corrections the user makes are learnt (localStorage) and win next time.
   window.HEBLAT = { has(s), translit(s), word(w), learn(heb, latin), learnArtist(heb, latin), skeleton(s) } */
(function(){
'use strict';
const HEB=/[֐-׿]/;
const NIQQUD=/[֑-ׇ]/g;                       // vowel points / cantillation (kept out; we read bare letters)
const FINAL={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'};
const LK='chordroom.translit.v1';

/* ---------- known artists (official Latin spelling) ---------- */
const ARTISTS={
'עומר אדם':'Omer Adam','נועה קירל':'Noa Kirel','עדן בן זקן':'Eden Ben Zaken','סטטיק ובן אל':'Static & Ben El','סטטיק ובן אל תבורי':'Static & Ben El Tavori',
'סטטיק':'Static','בן אל':'Ben El','בן אל תבורי':'Ben El Tavori','עדן חסון':'Eden Hason','אנה זק':'Anna Zak','נסרין קדרי':'Nasrin Kadri',
'איתי לוי':'Itay Levy','משה פרץ':'Moshe Peretz','שרית חדד':'Sarit Hadad','אייל גולן':'Eyal Golan','חנן בן ארי':'Hanan Ben Ari','ישי ריבו':'Ishay Ribo',
'רביד פלוטניק':'Ravid Plotnik','טונה':'Tuna','סטפן לגר':'Stephane Legar','מאור אדרי':'Maor Edri','אושר כהן':'Osher Cohen','אגם בוחבוט':'Agam Buhbut',
'קובי פרץ':'Kobi Peretz','עידן רייכל':'Idan Raichel','הפרויקט של עידן רייכל':'The Idan Raichel Project','שלמה ארצי':'Shlomo Artzi','עברי לידר':'Ivri Lider',
'נטע':'Netta','נטע ברזילי':'Netta Barzilai','עדן גולן':'Eden Golan','יובל דיין':'Yuval Dayan','נצ\'י נצ\'':'Nechi Nech','מרגי':'Mergui','פאר טסי':'Peer Tasi',
'ליאור נרקיס':'Lior Narkis','דודו אהרון':'Dudu Aharon','אברהם טל':'Avraham Tal','עופר לוי':'Ofer Levi','זהבה בן':'Zehava Ben','עומרי 69':'Omri 69',
'אליעד נחום':'Eliad Nachum','אליעד':'Eliad','שחר סאול':'Shahar Saul','נוגה ארז':'Noga Erez','הדג נחש':'Hadag Nahash','קרן פלס':'Keren Peles','הראל סקעת':'Harel Skaat',
'שלומי שבת':'Shlomi Shabat','אמיר דדון':'Amir Dadon','עידן עמדי':'Idan Amedi','לירן דנינו':'Liran Danino','אלאי בוטנר':'Elai Botner','יובל רפאל':'Yuval Raphael',
'נדב גדג\'':'Nadav Guedj','יסמין מועלם':'Jasmin Moallem','נועם בתן':'Noam Bettan','אודיה':'Odeya','אביב גפן':'Aviv Geffen','ריטה':'Rita','משינה':'Mashina',
'כוורת':'Kaveret','אריק איינשטיין':'Arik Einstein','שלום חנוך':'Shalom Hanoch','יהודית רביץ':'Yehudit Ravitz','זוהר ארגוב':'Zohar Argov','חיים משה':'Haim Moshe',
'בועז שרעבי':'Boaz Sharabi','עמיר בניון':'Amir Benayoun','ישי לוי':'Ishay Levi','מורן מזור':'Moran Mazor','דודו טסה':'Dudu Tassa','ברי סחרוף':'Berry Sakharof',
'מוש בן ארי':'Mosh Ben Ari','סאבלימינל':'Subliminal','התקווה 6':'Hatikva 6','ג\'יין בורדו':'Jane Bordeaux','שירי מימון':'Shiri Maimon','מירי מסיקה':'Miri Mesika',
'אביתר בנאי':'Evyatar Banai','מאיר בנאי':'Meir Banai','אהוד בנאי':'Ehud Banai','שלמה גרוניך':'Shlomo Gronich','דני סנדרסון':'Danny Sanderson','גידי גוב':'Gidi Gov',
'אליאב זוהר':'Eliav Zohar','קובי אפללו':'Kobi Aflalo','רן דנקר':'Ran Danker','עקיבא':'Akiva','רון נשר':'Ron Nesher','תמר יהלומי':'Tamar Yahalomy',
'מאיה בוסקילה':'Maya Buskila','עדי ביטי':'Adi Bity','ששון איפרם שאולוב':'Sasson Ifram Shaulov','אייל גולן ומשה פרץ':'Eyal Golan & Moshe Peretz',
'ישי ריבו ועקיבא':'Ishay Ribo & Akiva','פאר טסי ועדן בן זקן':'Peer Tasi & Eden Ben Zaken','שרית חדד ואייל גולן':'Sarit Hadad & Eyal Golan',
'אופק אדנק':'Ofek Adanek','בר צברי':'Bar Tzabary','ליעד מאיר':'Liad Meir','שילה אליה':'Shilo Elia','נתן גושן':'Nathan Goshen','אושר כהן ועדן חסון':'Osher Cohen & Eden Hason',
'גלי עטרי':'Gali Atari','עפרה חזה':'Ofra Haza','אריק סיני':'Arik Sinai','בן צור':'Ben Zur','כנסיית השכל':'Knesiyat Hasekhel','טיפקס':'Teapacks','אתניקס':'Ethnix',
'יהורם גאון':'Yehoram Gaon','חווה אלברשטיין':'Chava Alberstein','אילנית':'Ilanit','הדס קליינמן':'Hadas Kleinman','מיקה קרני':'Mika Karni','אליעד נחום ומאור אדרי':'Eliad Nachum & Maor Edri'
};

/* ---------- common words ---------- */
const WORDS={
'אני':'Ani','אתה':'Ata','את':'At','הוא':'Hu','היא':'Hi','אנחנו':'Anachnu','אתם':'Atem','אתן':'Aten','הם':'Hem','הן':'Hen',
'שלי':'Sheli','שלך':'Shelach','שלו':'Shelo','שלה':'Shela','שלנו':'Shelanu','שלכם':'Shelachem','שלהם':'Shelahem',
'אותך':'Otach','אותי':'Oti','אותו':'Oto','אותה':'Ota','אותנו':'Otanu','איתך':'Itach','איתי':'Iti','איתו':'Ito','איתה':'Ita','איתנו':'Itanu','אתי':'Iti','אתך':'Itach',
'לי':'Li','לך':'Lach','לו':'Lo','לה':'La','לנו':'Lanu','לכם':'Lachem','להם':'Lahem','בי':'Bi','בך':'Bach','בו':'Bo','בה':'Ba','בנו':'Banu',
'עליי':'Alai','עלי':'Alai','עלייך':'Alayich','עלייך':'Alayich','עליך':'Alecha','עליו':'Alav','עליה':'Aleha','ממך':'Mimech','ממני':'Mimeni','בשבילך':'Bishvilech','בשבילי':'Bishvili',
'עם':'Im','בלי':'Bli','כמו':'Kmo','כל':'Kol','הכל':'Hakol','הכול':'Hakol','רק':'Rak','עוד':'Od','גם':'Gam','אם':'Im','כי':'Ki','אבל':'Aval','או':'O','אז':'Az','של':'Shel',
'על':'Al','אל':'El','עד':'Ad','אחרי':'Acharei','לפני':'Lifnei','בין':'Bein','תוך':'Toch','מול':'Mul','ליד':'Leyad','בגלל':'Biglal','בשביל':'Bishvil','כמעט':'Kimat',
'עכשיו':'Achshav','היום':'Hayom','מחר':'Machar','אתמול':'Etmol','תמיד':'Tamid','לעולם':'Leolam','לפעמים':'Lifamim','פעם':'Paam','שוב':'Shuv','כבר':'Kvar','עדיין':'Adayin',
'לא':'Lo','כן':'Ken','אין':'Ein','יש':'Yesh','מה':'Ma','מי':'Mi','איך':'Eich','למה':'Lama','מתי':'Matai','איפה':'Eifo','כמה':'Kama','לאן':'Lean','מאיפה':'Meeifo','זה':'Ze','זאת':'Zot','זו':'Zo','אלה':'Ele',
'אהבה':'Ahava','אהבת':'Ahavat','האהבה':'Haahava','אהבתי':'Ahavti','אוהב':'Ohev','אוהבת':'Ohevet','אוהבים':'Ohavim','לאהוב':'Leehov','אהוב':'Ahuv','אהובה':'Ahuva','אהובתי':'Ahuvati',
'לב':'Lev','הלב':'Halev','לבי':'Libi','ליבי':'Libi','לבך':'Libech','נשמה':'Neshama','הנשמה':'Haneshama','נשמתי':'Nishmati','חיים':'Chaim','החיים':'Hachaim','חיי':'Chayai','חיה':'Chaya',
'יום':'Yom','ימים':'Yamim','לילה':'Layla','הלילה':'Halayla','לילות':'Leilot','בוקר':'Boker','ערב':'Erev','שבת':'Shabat','חג':'Chag','קיץ':'Kayitz','חורף':'Choref',
'ילדה':'Yalda','ילד':'Yeled','ילדים':'Yeladim','אמא':'Ima','אבא':'Aba','אמי':'Imi','אבי':'Avi','אחי':'Achi','אחות':'Achot','אחים':'Achim','חבר':'Chaver','חברה':'Chavera','חברים':'Chaverim','אישה':'Isha','איש':'Ish','בנות':'Banot','בנים':'Banim','בחורה':'Bachura','בחור':'Bachur',
'מלכה':'Malka','מלך':'Melech','המלכה':'Hamalka','נסיכה':'Nesicha','יפה':'Yafa','יפה':'Yafa','יפים':'Yafim','מאמי':'Mami','בייבי':'Baby','מותק':'Motek','חיים שלי':'Chaim Sheli','חיימשלי':'Chaim Sheli',
'עולם':'Olam','העולם':'Haolam','שמיים':'Shamayim','שמים':'Shamayim','ים':'Yam','הים':'Hayam','שמש':'Shemesh','ירח':'Yareach','כוכב':'Kochav','כוכבים':'Kochavim','גשם':'Geshem','רוח':'Ruach','אש':'Esh','מים':'Mayim','אדמה':'Adama','פרח':'Perach','פרחים':'Prachim',
'בית':'Bayit','הביתה':'Habayta','בבית':'Babayit','דרך':'Derech','הדרך':'Haderech','רחוב':'Rechov','עיר':'Ir','ארץ':'Eretz','הארץ':'Haaretz','מדינה':'Medina',
'ירושלים':'Yerushalayim','תל':'Tel','אביב':'Aviv','ישראל':'Israel','אילת':'Eilat','חיפה':'Haifa','תימן':'Teiman','מרוקו':'Maroko','פריז':'Paris',
'שיר':'Shir','השיר':'Hashir','שירה':'Shira','שירים':'Shirim','מוזיקה':'Muzika','מנגינה':'Mangina','רוקדת':'Rokedet','רוקד':'Roked','רוקדים':'Rokdim','לרקוד':'Lirkod','ריקוד':'Rikud','שרה':'Shara','שר':'Shar',
'חוזר':'Chozer','חוזרת':'Chozeret','חוזרים':'Chozrim','לחזור':'Lachzor','תחזור':'Tachzor','תחזרי':'Tachzeri','הולך':'Holech','הולכת':'Holechet','הולכים':'Holchim','ללכת':'Lalechet','בא':'Ba','באה':'Baa','בוא':'Bo','בואי':'Boi','תבואי':'Tavoi','תבוא':'Tavo',
'רוצה':'Rotze','רוצים':'Rotzim','יודע':'Yodea','יודעת':'Yodaat','זוכר':'Zocher','זוכרת':'Zocheret','מחכה':'Mechake','מחכים':'Mechakim','חושב':'Choshev','חושבת':'Choshevet','מרגיש':'Margish','מרגישה':'Margisha','מבקש':'Mevakesh','צריך':'Tzarich','צריכה':'Tzricha','יכול':'Yachol','יכולה':'Yechola',
'תני':'Tni','תן':'Ten','קח':'Kach','קחי':'Kchi','תגיד':'Tagid','תגידי':'Tagidi','תאמיני':'Taamini','תאמין':'Taamin','תסתכלי':'Tistakli','תראי':'Tiri','תראה':'Tire','תעזבי':'Taazvi','תלכי':'Telchi','תישארי':'Tisha\'ari','תשאר':'Tisha\'er',
'טוב':'Tov','טובה':'Tova','טובים':'Tovim','רע':'Ra','רעה':'Raa','גדול':'Gadol','גדולה':'Gdola','קטן':'Katan','קטנה':'Ktana','חדש':'Chadash','חדשה':'Chadasha','ישן':'Yashan','חם':'Cham','קר':'Kar','מתוק':'Matok','מתוקה':'Metuka','יפהפייה':'Yefefiya',
'שמח':'Sameach','שמחה':'Simcha','שמחות':'Smachot','עצוב':'Atzuv','עצובה':'Atzuva','בוכה':'Boche','בוכים':'Bochim','דמעות':'Dmaot','דמעה':'Dimaa','כאב':'Keev','כואב':'Koev',
'סוף':'Sof','הסוף':'Hasof','התחלה':'Hatchala','רגע':'Rega','רגעים':'Regaim','זמן':'Zman','הזמן':'Hazman','שנה':'Shana','שנים':'Shanim','שעה':'Shaa','דקה':'Daka',
'אחד':'Echad','אחת':'Achat','שתיים':'Shtayim','שניים':'Shnayim','שני':'Shnei','שתי':'Shtei','שלוש':'Shalosh','ארבע':'Arba','חמש':'Chamesh','שש':'Shesh','שבע':'Sheva','שמונה':'Shmone','תשע':'Tesha','עשר':'Eser','מאה':'Mea','אלף':'Elef','מיליון':'Milyon',
'אלוהים':'Elohim','אבינו':'Avinu','ה\'':'Hashem','השם':'Hashem','שלום':'Shalom','תודה':'Toda','סליחה':'Slicha','בבקשה':'Bevakasha','אמן':'Amen','הללויה':'Halleluya',
'מתגעגע':'Mitgaagea','מתגעגעת':'Mitgaagaat','געגועים':'Gaaguim','חלום':'Chalom','חלומות':'Chalomot','תקווה':'Tikva','אמונה':'Emuna','תפילה':'Tfila','מאמין':'Maamin','מאמינה':'Maamina',
'עיניים':'Einayim','עינייך':'Einayich','העיניים':'Haeinayim','ידיים':'Yadayim','יד':'Yad','פנים':'Panim','שפתיים':'Sfatayim','גוף':'Guf','ראש':'Rosh',
'כסף':'Kesef','זהב':'Zahav','יהלום':'Yahalom','מסיבה':'Mesiba','בלגן':'Balagan','סבבה':'Sababa','יאללה':'Yalla','וואלה':'Walla','אחלה':'Achla','חביבי':'Habibi','חביבתי':'Habibti',
'הכי':'Hachi','מאוד':'Meod','אולי':'Ulai','בטח':'Betach','ביחד':'Beyachad','יחד':'Yachad','לבד':'Levad','לבדי':'Levadi','פה':'Po','שם':'Sham','כאן':'Kan','הנה':'Hine','רחוק':'Rachok','קרוב':'Karov',
'משוגע':'Meshuga','משוגעת':'Meshugaat','משוגעים':'Meshugaim','מטורף':'Metoraf','מטורפת':'Metorefet','חופשי':'Chofshi','חופשיה':'Chofshiya','נצח':'Netzach','לנצח':'Lanetzach',
'נתתי':'Natati','לקחתי':'Lakachti','ראיתי':'Raiti','אמרתי':'Amarti','ידעתי':'Yadati','חשבתי':'Chashavti','הלכתי':'Halachti','חזרתי':'Chazarti','שכחתי':'Shachachti','בכיתי':'Bachiti','נולדתי':'Noladti',
'אמרה':'Amra','אמר':'Amar','הלכה':'Halcha','הלך':'Halach','עזבה':'Azva','עזב':'Azav','נתת':'Natata','לקחת':'Lakachat','תהום':'Tehom','מחול':'Machol','סיבוב':'Sivuv','בסיבוב':'Basivuv','הבא':'Haba','הבאה':'Habaa',
'קדימה':'Kadima','אחורה':'Achora','למעלה':'Lemala','למטה':'Lemata','קילומטר':'Kilometer','מיליונר':'Milyoner','רולקס':'Rolex','וקסקט':'Vekasket','קסקט':'Kasket','גנבים':'Ganavim','כולם':'Kulam','כולנו':'Kulanu',
'יוצאת':'Yotzet','יוצא':'Yotze','הכלל':'Haklal','מן':'Min','שחור':'Shachor','לבן':'Lavan','אדום':'Adom','כחול':'Kachol','ירוק':'Yarok','צהוב':'Tzahov','ורוד':'Varod',
'בית שלי':'Bayit Sheli','לנצח שלך':'Lanetzach Shelach','מלכת':'Malkat','הדור':'Hador','כאילו':'Keilu','סתם':'Stam','באמת':'Beemet','אמת':'Emet','שקר':'Sheker','שקרים':'Shkarim',
'טירוף':'Tiruf','בלילה':'Balayla','ביום':'Bayom','בבוקר':'Baboker','בערב':'Baerev','ביחד':'Beyachad','בשקט':'Besheket','שקט':'Sheket','רעש':'Raash','צחוק':'Tzchok','צוחקת':'Tzochechet',
'מזל':'Mazal','מזל טוב':'Mazal Tov','חתונה':'Chatuna','החתונה':'Hachatuna','כלה':'Kala','חתן':'Chatan','הורים':'Horim','משפחה':'Mishpacha','בן':'Ben','בת':'Bat',
'אחרת':'Acheret','אחר':'Acher','אחרים':'Acherim','דבר':'Davar','דברים':'Dvarim','מילים':'Milim','מילה':'Mila','סיפור':'Sipur','לספר':'Lesaper',
'ואני':'Vaani','ואתה':'Veata','ואת':'Veat','והיא':'Vehi','והוא':'Vehu','ושוב':'Vshuv','ועוד':'Veod','וזה':'Veze','ולא':'Velo','ומה':'Uma','וכל':'Vechol','והכל':'Vehakol',
'שאני':'Sheani','שאתה':'Sheata','שאת':'Sheat','שהיא':'Shehi','שהוא':'Shehu','שלא':'Shelo','שיש':'Sheyesh','שאין':'Sheein','כשאני':'Keshani','כשאת':'Keshat','כשהיא':'Keshehi',
'היה':'Haya','הייתי':'Hayiti','היית':'Hayita','הייתה':'Hayta','היו':'Hayu','תהיה':'Tihye','יהיה':'Yihye','להיות':'Lihyot','הלוואי':'Halevai','כאלה':'Kaele','כזה':'Kaze','כזאת':'Kazot','ככה':'Kacha',
'אלייך':'Elayich','אליך':'Elecha','אליי':'Elay','אלי':'Elay','אליו':'Elav','אליה':'Eleha','מעליו':'Mealav','מעל':'Meal','בנימין':'Binyamin','ראשונה':'Rishona','ראשון':'Rishon','אחרונה':'Achrona','אחרון':'Acharon',
'ריו דה ז\'נרו':'Rio De Janeiro','מחשבות':'Machshavot','מחשבה':'Machshava','חתונת':'Chatunat','זוגות':'Zugot','זוג':'Zug','רמות':'Ramot','רמה':'Rama','טחול':'Tchol','הטחול':'Hatchol','אולפנה':'Ulpana',
'עוד פעם':'Od Paam','פעם אחת':'Paam Achat','ילדה טובה':'Yalda Tova','עד הסוף':'Ad Hasof'
};

/* ---------- learnt corrections ---------- */
let LRN={w:{},s:{},a:{}};
try{const o=JSON.parse(localStorage.getItem(LK)||'null');if(o&&typeof o==='object')LRN={w:o.w||{},s:o.s||{},a:o.a||{}}}catch(e){}
const saveL=()=>{try{localStorage.setItem(LK,JSON.stringify(LRN))}catch(e){}};

const norm=s=>String(s||'').normalize('NFC').replace(NIQQUD,'').replace(/[׳]/g,"'").replace(/[״]/g,'"').replace(/[‎‏‪-‮⁦-⁩]/g,'');
const key=s=>norm(s).replace(/\s+/g,' ').trim();
const cap=w=>w?w.charAt(0).toUpperCase()+w.slice(1):w;
const has=s=>HEB.test(String(s||''));

/* ---------- rule-based fallback for one bare Hebrew word ---------- */
const CONS={'ב':'b','ג':'g','ד':'d','ה':'h','ז':'z','ח':'ch','ט':'t','כ':'k','ל':'l','מ':'m','נ':'n','ס':'s','פ':'p','צ':'tz','ק':'k','ר':'r','ש':'sh','ת':'t'};
const GERESH={'ג':'j','ז':'zh','צ':'ch','ת':'t','ד':'d','ח':'ch'};
function rules(w){
  const L=[...w];const u=[];   // units: {c:'b'} consonant | {v:'o'} vowel
  for(let i=0;i<L.length;i++){
    let ch=L[i];const fin='ךםןףץ'.includes(ch);ch=FINAL[ch]||ch;
    const next=L[i+1],nx=FINAL[next]||next,first=i===0,last=i===L.length-1||(L[i+1]==="'"&&i===L.length-2);
    if(next==="'"&&GERESH[ch]){u.push({c:GERESH[ch]});i++;continue}
    if(ch==="'"||ch==='"')continue;
    if(ch==='א'||ch==='ע'){
      if(nx==='ו'||nx==='י')continue;            // the vowel letter after it carries the sound
      if(first||last||!u.length||u[u.length-1].c)u.push({v:last&&u.length&&u[u.length-1].v==='e'?'':'a'});
      continue;
    }
    if(ch==='ו'){
      if(nx==='ו'){u.push({c:'v'});i++;continue}
      if(first){u.push({c:'v'});continue}
      const prevV=u.length&&u[u.length-1].v!=null;
      if(prevV&&!last){u.push({c:'v'});continue}      // between a vowel and what follows → consonant v
      u.push({v:'o'});continue;
    }
    if(ch==='י'){
      if(nx==='י'){u.push({c:'y'});i++;continue}
      if(first){u.push({c:'y'});continue}
      const prevV=u.length&&u[u.length-1].v!=null;
      if(prevV){u.push({c:'y'});continue}
      if(nx==='ו'||nx==='א'||nx==='ה'&&!(i+1===L.length-1)){u.push({v:'i'});continue}
      u.push({v:'i'});continue;
    }
    if(ch==='ה'&&last&&!first){u.push({v:'a'});continue}
    if(ch==='כ'&&fin){u.push({c:'ch',soft:1});continue}
    if(ch==='פ'&&fin){u.push({c:'f',soft:1});continue}
    const c=CONS[ch];if(c)u.push({c,bk:'בכפ'.includes(ch)?ch:null});else if(/[0-9A-Za-z]/.test(ch))u.push({c:ch.toLowerCase(),lat:1});
  }
  // vowels between consonants: word-initial cluster → a, a run of three → e, word-final cluster → e
  const o=[];
  for(let i=0;i<u.length;i++){
    const x=u[i];o.push(x);
    const y=u[i+1];if(!y||x.v!=null||y.v!=null)continue;
    const prev=o[o.length-2],isLast=i+1===u.length-1;
    if(o.length===1)o.push({v:'a',ins:1});
    else if(isLast){let pv='e';for(let j=o.length-1;j>=0;j--)if(o[j].v){pv=o[j].v;break}o.push({v:pv==='a'?'a':'e',ins:1})}
    else if(prev&&prev.v==null)o.push({v:'e',ins:1});
  }
  // ב/כ/פ: hard at the start and after a consonant, soft (v/ch/f) after a vowel
  let s='';
  for(let i=0;i<o.length;i++){const x=o[i];
    if(x.v!=null){s+=x.v;continue}
    let c=x.c;
    if(x.bk){const pv=i>0&&o[i-1].v!=null&&o[i-1].v!=='';c=pv?{'ב':'v','כ':'ch','פ':'f'}[x.bk]:{'ב':'b','כ':'k','פ':'p'}[x.bk]}
    s+=c;
  }
  return s.replace(/aa+/g,'a').replace(/(.)\1\1+/g,'$1$1');
}

/* one word: learnt → dictionary → prefix + dictionary → rules */
const PREF=[['וה','Veha'],['שה','Sheha'],['כשה','Kesheha'],['כש','Kshe'],['מה','Meha'],['וב','Uv'],['ול','Ve'],['ומ','Umi'],['וש','Vshe'],['וכ','Uch'],
  ['ה','Ha'],['ו','Ve'],['ב','Be'],['ל','Le'],['מ','Mi'],['ש','She'],['כ','Ke']];
function word(w0){
  const w=key(w0);if(!w)return '';
  if(!has(w))return w;
  const k=w.replace(/[״"]/g,'');
  if(LRN.w[k])return LRN.w[k];
  if(WORDS[k])return WORDS[k];
  for(const [p,lat] of PREF){
    if(k.length>p.length+1&&k.startsWith(p)){
      const rest=k.slice(p.length),r=LRN.w[rest]||WORDS[rest];
      if(r){const pre=lat;
        return cap(pre)+r.charAt(0).toLowerCase()+r.slice(1)}
    }
  }
  return cap(rules(k));
}
/* a whole string (title or artist): known phrases first, Hebrew runs word by word, everything else kept */
function translit(s0){
  const s=key(s0);if(!s||!has(s))return s;
  if(LRN.s[s])return LRN.s[s];if(LRN.a[s])return LRN.a[s];if(ARTISTS[s])return ARTISTS[s];
  // artist lists: "X ו-Y", "X & Y", "X, Y", "X feat. Y"
  const parts=s.split(/(\s*(?:&|,|\bx\b|\bfeat\.?|\bft\.?|–|—|-|\(|\)|\[|\])\s*)/i);
  if(parts.length>1)return parts.map((p,i)=>i%2?p:translitRun(p)).join('');
  return translitRun(s);
}
function translitRun(s){
  const t=s.trim();if(!t)return s;
  if(LRN.s[t])return LRN.s[t];if(LRN.a[t])return LRN.a[t];if(ARTISTS[t])return ARTISTS[t];if(WORDS[t])return WORDS[t];
  // "X ו Y" / "X וY" between two known artists
  const m=/^(.+?)\s+ו-?\s*(.+)$/.exec(t);
  if(m&&ARTISTS[m[1]]&&(ARTISTS[m[2]]||ARTISTS[m[2].replace(/^ו/,'')]))return ARTISTS[m[1]]+' & '+(ARTISTS[m[2]]||ARTISTS[m[2].replace(/^ו/,'')]);
  const toks=t.split(/(\s+)/);const out=[];
  for(let i=0;i<toks.length;i++){
    const w=toks[i];if(/^\s+$/.test(w)){out.push(' ');continue}
    // two-word phrases
    const two=i+2<toks.length?w+' '+toks[i+2]:null;
    if(two&&(WORDS[two]||LRN.w[two])){out.push(LRN.w[two]||WORDS[two]);i+=2;continue}
    const m2=/^([^֐-׿]*)([֐-׿'"״׳]+)([^֐-׿]*)$/.exec(w);
    if(!m2){out.push(w.replace(/[֐-׿]+/g,x=>word(x)));continue}
    out.push(m2[1]+word(m2[2])+m2[3]);
  }
  return out.join('').replace(/\s+/g,' ').trim();
}

/* the user fixed a transliteration: remember the whole string and, when the word counts match, each word */
function learn(heb,lat){
  const h=key(heb),l=String(lat||'').replace(/\s+/g,' ').trim();if(!h||!l||!has(h)||has(l))return;
  LRN.s[h]=l;
  const hw=h.split(' '),lw=l.split(' ');
  if(hw.length===lw.length)hw.forEach((w,i)=>{if(has(w)&&!/[&,()]/.test(w)){const k=w.replace(/^[^֐-׿]+|[^֐-׿'"]+$/g,'');const v=lw[i].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9']+$/g,'');if(k&&v)LRN.w[k]=v}});
  saveL();
}
function learnArtist(heb,lat){const h=key(heb),l=String(lat||'').trim();if(!h||!l||has(l))return;LRN.a[h]=l;saveL()}
/* consonant skeleton to compare two spellings ("Ofer Levi" ≈ "Ofer Lvi") */
function skeleton(s){return String(s||'').toLowerCase().replace(/ch/g,'h').replace(/kh/g,'h').replace(/tz|ts/g,'z').replace(/sh/g,'s').replace(/ph/g,'f').replace(/[wv]/g,'b').replace(/[ck]/g,'k').replace(/q/g,'k').replace(/[^a-z0-9]/g,'').replace(/[aeiouy]/g,'').replace(/(.)\1+/g,'$1')}

/* an artist we are sure about (learnt from the user or in the list) → its spelling, else null */
function known(s){const h=key(s);return LRN.a[h]||ARTISTS[h]||null}
window.HEBLAT={has,translit,word,learn,learnArtist,known,skeleton,_rules:rules,_ARTISTS:ARTISTS};
})();
