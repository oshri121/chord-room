/*
 * Extended generator (#extended): a DJ extended version of a track, made as an EDIT of the song itself. Nothing new is
 * composed and the vocals, melody and tempo are never changed: every second of the result is the original audio (or some
 * of its stems), cut and repeated on the song's own bar grid. Talks to the app only through window.CR (bridge at the end of
 * app.js). Settings (never audio) are kept per account in localStorage `chordroom.extended.v1:<uid|guest>`. Only the current
 * song's stems are kept in memory; leaving the view frees the free (quick) stems and the render (paid AI stems are kept).
 * Measured design notes (why each rule exists, with numbers): REVIEW-EXTENDED.md.
 *
 * 1. Analysis (all in the browser):
 *    CR.analyzeTrack → BPM, key, beat grid (offset + downbeat) and the RGB waveform; stems from the free quick DSP split
 *    (assets/quicksep-worker.js, default) or from AI separation (CR.separateBuffer: the same points as the tool, charged before,
 *    refunded on failure), or the tool's stems when the song comes from the tool. CUES._features → 50 ms band envelopes
 *    (all, lows <110 Hz, highs >6 kHz, centre/side 0.8–3.5 kHz), CR.chromaOf → chroma frames. Everything is averaged per BAR
 *    (bar k starts at firstDownbeat + k·bar) and normalised to its 90th percentile over the music:
 *      lo (kick + bass), dr (drums stem), vo (vocals stem), md (other stem), hi, fu (all), and a 24-bin chroma vector.
 *    stemEnv (own JS biquads, 1024-sample frames): vocals stem and mix in the voice band (550 Hz–4 kHz), drums stem lows/highs.
 *      Singer present in a frame = vocals stem ≥ 15 % of its 95th pct AND ≥ 45 % of the mix's voice band (7-frame medians; 30 % with AI
 *      stems), runs < 120 ms dropped, gaps < 250 ms bridged → va (share per bar); vp = the high-recall version (10 % / 35 %) used at cuts,
 *      where a miss costs more than a false alarm. vocShare / vocRun (seconds of singing from a time).
 *      (Full-band vocal/mix RMS does not work: the kick dominates the RMS, singing bars read 0.1–0.2.)
 *    Rhythm pattern per bar = 16 steps × (lows, highs) of the drum envelope rises; barSim(i,j) = .4 chroma + .35 groove + .25 layer
 *    levels (drums-only material: groove + drum level).
 * 2. Sections (a heuristic, the user can relabel and drag boundaries):
 *    novelty(k) = |features(k−4…k) − features(k…k+4)| + 0.6·(1 − cos chroma), the 4-bar phrase lattice is the offset that
 *    collects the most novelty (and the CUES.detect bars); boundaries = lattice bars with novelty ≥ ⅓ of its 95th percentile
 *    (off-lattice only when much stronger), plus the CUES.detect cue bars snapped to the lattice. Pieces < 4 bars merge into
 *    their closest neighbour, pieces > 32 bars split at their strongest inner phrase line. Labels from per-section means:
 *      hot = bass + energy high → Drop (club tracks, or no vocals) / Chorus (vocal pop)
 *      low bass right before a hot section, ≤ 8 bars or highs rising → Build (a long one is split Break + Build)
 *      low bass otherwise → Verse (vocals) / Break
 *      bass, not hot: vocals → Verse (Pre-Chorus when short, after a verse and before the hot part), else Verse / Break
 *      (Break when it is a clear energy dip after a drop); the first section → Intro, everything after the last hot section
 *      that has less bass/energy → Outro; vocal pop: a late one-off vocal section after the 2nd chorus → Bridge, a verse that
 *      repeats a chorus (chroma + energy) → Chorus.
 *    Groove confidence = how strongly the onsets (rises of the lows + level, 150 Hz frames) sit on the 16th grid
 *    (Gaussian 20 ms, rescaled against chance), lowered when the beat drifts away from the grid.
 *    Drift (live playing): the beat phase per 2-bar window (onsets folded on the beat), tracked by dynamic programming and
 *    unwrapped, so it may grow to whole beats; its straight-line part = a slightly wrong BPM → folded into the bar length (the
 *    BPM shown/tagged follows), the rest → per-bar offsets. Kept only when the hits then fit the grid clearly better.
 *    Phrase lock = mean over inner section boundaries of 1 (on an 8-bar line from the first music bar) / .75 (4) / .25 (2) / 0.
 * 3. Arrangement (deterministic; every block = source bar range + stems mask + eq/filter + level, and says where it came from):
 *    DJ intro of N bars (only N − its length in front of an original intro that is already mixable = drums, no singer).
 *    Loop source (loopCands/pickLoop): 8-bar phrases on the lattice, scored by drum level and steadiness, the singer (×2.6 with
 *    the quick split: its drums stem keeps consonants and short syllables, measured −4…−10 dB of the vocal; also at the loop's edges),
 *    8- and 4-bar loops compete (a clean 4-bar groove beats an 8-bar one with a singer), the SEAM (the bar
 *    after the loop ≈ its first bar, or the bar before it ≈ its last: jumping back is what the ear expects) and the groove
 *    inside; a second similar phrase B (barSim ≥ .82) alternates with A every phrase so 32 bars are not one loop ×4. A loop
 *    whose MIX has nothing the stage would remove (no singer, no other music) is played from the mix itself (no separation
 *    artefacts, the kick keeps its body); a last bar that carries the next line's pickup is replaced by the bar before it (same
 *    groove, no "and-" every loop). Stages on phrase lines (stagesOf): kick + hats ('kh' = −15 dB wide cut at 1.4 kHz:
 *    claps/snare body and most bleed out) → full kit → + bass → + music (only when the music stem is clean: the quick split
 *    leaves the singer in 'other', measured −0.6…−4 dB) / Filtered (low-pass 380 Hz, opens over the last 8 bars) /
 *    Percussion (no kick, then the kit). Drum stages from bars with a singer get a gentler −7 dB cut ('kb'). Each stage's
 *    level is matched to the SAME stems in the first bars of the original after it (±6 dB) — no jump when the song starts.
 *    Then the whole original, in order. DJ outro mirrors it (vocals out first → bass → drums → kick + hats) from a late loop
 *    and ends ON a downbeat: one more hit of the loop that rings out over a beat (endHit), never a hard cut at a bar line.
 *    Body (bodyCands): whole phrases (16/8/4) where the track itself allows it — the last w bars of a section played again
 *    right after it (it may span sections: a pre-chorus + chorus phrase); scored by the seam (seamOf), the level jolt, the singer
 *    (joinVocal: a line may not run over the cut by more than the one-beat tail; the incoming pickup is laid in and the outgoing
 *    vocals step aside = 'duck', mix minus the sample-aligned vocals stem; the outgoing side's own pickup into what follows is ducked
 *    too), drops/choruses first, then breaks, ≤ 2 repeats per section. Pass 1 only repeats that cut no line; what is still missing
 *    lengthens the DJ intro/outro by 8-bar phrases (≤ 64, said in the plan); only then repeats with a possible (never a certain) cut.
 *    Performance Edit first inserts an extra Build → Drop cycle after the last drop. Nothing of the original is ever removed.
 *    Joins (joinsOf): sub-beat shift (relShift: the incoming bar's drum onsets cross-correlated with the bar the outgoing source
 *    would have played or its last bar, ±12 ms, only when both have the same drum pattern and the match is clear: across different
 *    patterns it lines up wrongly, and on a live track the drift-corrected grid is already within the players' ±7 ms), crossfade
 *    6 / 12 / 30 ms by how hard the incoming downbeat hits, the singer's tail / pickup (vocals stem, ≤ 1 beat).
 * 4. Render: OfflineAudioContext, every block sample-accurately on the output bar grid (bar = 240/BPM, the original tempo),
 *    blocks that continue the source are merged into one segment (bit-identical to the source when unmasked); joins get an
 *    equal-power crossfade that ENDS on the downbeat; every segment's gain is 0 until its fade starts (an unset gain is 1: the
 *    first sample of a source started before its curve made a −52 dBFS tick at most joins). Stems per block by gain
 *    automation, eq/filters by BiquadFilter automation, kick restore for drums-only stages of the quick split (the kick's body
 *    goes to its bass stem: −30 dB after 100 ms; its lows below 115 Hz come back gated on the drum hits), normalised only when
 *    it would clip. A drifting beat gets per-bar source times; a block needing > 0.2 % speed change goes through Signalsmith
 *    Stretch. The first minute is rendered first (while the checklist animates) so the preview starts at once.
 *    qualityOf (after every render, on the render): per join the level step against what was meant (the music's own step for
 *    full-mix joins, the planned stage levels for stem joins), the seam, the singer, the shift → Quality score + chip.
 * 5. Preview (free): big play, A/B against the original at the mapped spot, joins navigator (each join: 4 bars before → 4
 *    after, J / Shift+J), loop a block, volume, the render's own waveform; then Download (the paid step, points v2) = WAV
 *    16/24-bit or MP3 320 at 44.1/48 kHz, "Artist - Title (Extended Mix)", optional Serato cue markers (intro / drop / outro of
 *    the new arrangement, via CRATE.tagMp3), logged as `extended_export`.
 */
(function(){
'use strict';
const CR=window.CR;if(!CR)return;
const {t,$,esc,mod}=CR;

/* ---------- strings (he / en / ar / ru / es) ---------- */
CR.addStrings({
he:{navExtended:'אקסטנדד',navExtendedS:'אקסטנדד',exEyebrow:'עריכה של השיר עצמו · על רשת התיבות',exTitle:'מחולל אקסטנדד',
  exSub:'יוצרים גרסת אקסטנדד לדיג׳יי מכל שיר. זו עריכה של השיר עצמו: השירה, המנגינה והקצב נשארים בדיוק כמו שהם.',
  exDrop:'גררו לכאן שיר',exDropH:'MP3, WAV, M4A, FLAC, OGG · עד 250 MB',exFile:'קובץ',exLib:'השירים שלי',exTool:'מהכלי',exReplace:'החלפה:',
  exNoTool:'קודם צריך לפתוח שיר בכלי.',exErrLoad:'לא הצלחנו לטעון את השיר. נסו שוב.',exErrLib:'לא הצלחנו להוריד את השיר מהחשבון שלכם.',
  exBig:'הקובץ גדול מדי (מעל 250 MB).',exLong:'השיר ארוך מדי (מעל 15 דקות). המחולל עובד על שירים של עד 15 דקות.',exShort:'השיר קצר מדי לגרסת אקסטנדד (צריך לפחות 30 שניות ו־16 תיבות).',
  exLegO:'האודיו המקורי',exLegS:'נבנה מהערוצים של השיר עצמו',exHow1:'מעלים שיר',exHow2:'בודקים את מבנה השיר ומתקנים אם צריך',exHow3:'בוחרים אורך וסגנון ומייצרים',
  exLibT:'השירים שלי',exLibSearch:'חיפוש',exLibEmpty:'עדיין אין שירים שמורים עם קובץ. שירים שמעלים בכלי (מחוברים) מופיעים כאן.',exLibNoFile:'אין קובץ שמור',exLoad:'טעינה',exClose:'סגירה',
  exS_an:'מנתחים את השיר',exS_bpm:'מזהים BPM',exS_key:'מזהים סולם',exS_sep:'מפרידים ערוצים',exS_struct:'מנתחים את המבנה',exS_phr:'מזהים משפטים',exS_drop:'מזהים דרופים',
  exS_intro:'בונים אינטרו לדיג׳יי',exS_outro:'בונים אאוטרו לדיג׳יי',exS_arr:'מייצרים את העיבוד',exS_render:'מעבדים את האודיו',
  exProcH:'מנתחים את {n}',exGenH:'מייצרים גרסת אקסטנדד',exReady:'גרסת האקסטנדד מוכנה',exReadyP:'{len} · ארוך יותר ב־{add} · {n} בלוקים על רשת התיבות',
  exLowGroove:'הקצב בשיר הזה פחות יציב (אולי הוקלט חי), ולכן הלופים באינטרו ובאאוטרו עלולים לא לנחות בדיוק על הפעמה. מומלץ לבחור סגנון אינטרו/אאוטרו "מקורי" ולהאזין לפני הייצוא.',exAnH:'ניתוח השיר',exStBpm:'BPM',exStKey:'סולם',exStLen:'אורך',exStBars:'תיבות',exStGroove:'ביטחון בגרוב',exStLock:'נעילת משפטים',
  exStGrooveT:'עד כמה המכות נופלות בדיוק על רשת הפעמות',exStLockT:'כמה מהמעברים בין החלקים נופלים על קווי משפט של 8 או 16 תיבות',
  exL_intro:'אינטרו',exL_verse:'בית',exL_pre:'פרה־פזמון',exL_build:'בילד',exL_drop:'דרופ',exL_break:'ברייק',exL_chorus:'פזמון',exL_bridge:'גשר',exL_outro:'אאוטרו',
  exStemsQ:'ערוצים מהירים · חינם',exStemsAI:'ערוצי AI',exStemsTool:'ערוצים מהכלי',exUpAi:'שדרוג לערוצי AI',exUpAiT:'הפרדה ב־AI נשמעת נקייה יותר באינטרו ובאאוטרו. אחר כך מנתחים שוב את המבנה.',exCost:'{n} נקודות',
  exSepFail:'ההפרדה לא הצליחה: {m}',exSepBusy:'הפרדה אחרת רצה עכשיו. חכו שתסתיים.',
  exOrig:'מקור',exExt:'אקסטנדד',exPlayO:'ניגון המקור',exPlayE:'ניגון האקסטנדד',exPause:'השהיה',exStop:'עצירה',exAB:'A/B',exABT:'מעבר בין המקור לאקסטנדד באותה נקודה בשיר (T)',
  exLoopBlk:'לופ על הבלוק',exLoopT:'מנגנים שוב ושוב את הבלוק שנבחר (L)',exZoomIn:'הגדלה',exZoomOut:'הקטנה',exPlanned:'מתוכנן',exStale:'ההגדרות השתנו. מייצרים שוב כדי לשמוע אותן.',
  exTlHelp:'לוחצים על חלק כדי לשנות את הסוג שלו · גוררים את הקצה שלו כדי להזיז (נצמד לתיבות) · לוחצים על בלוק כדי לראות מאיפה הוא נלקח',exKeys:'Space ניגון · ← → תיבה · T מקור/אקסטנדד · L לופ · J המעבר הבא',
  exTlAria:'ציר זמן: {n}, המקור ({a}) מעל גרסת האקסטנדד ({b})',exPickBlk:'בוחרים בלוק בגרסת האקסטנדד כדי לראות מאיפה הוא נלקח.',
  exFromS:'מתוך {sec}',exFrom:'נלקח מ־{sec} · {t} · תיבות {b}',exBarsN:'{n} תיבות',exFull:'המיקס המלא',exPlus:' + ',
  exWhyOrig:'המקור, בלי שינוי',exWhyIntro:'אינטרו לדיג׳יי: לופ של המשפט הכי יציב',exWhyOutro:'אאוטרו לדיג׳יי: מסתיים בדיוק על קו תיבה',exWhyRep:'משפט שחוזר כדי להאריך את {sec}',exWhyCycle:'סבב נוסף של בילד ודרופ',
  exFxOpen:'הפילטר נפתח',exFxClose:'הפילטר נסגר',exFxHp:'בלי קיק ובס',
  exSecH:'חלקי השיר',exSecEdit:'עריכת {sec}',exSecType:'סוג החלק',exSecStart:'התחלה',exSecEnd:'סוף',exEarlier:'תיבה אחת מוקדם יותר',exLater:'תיבה אחת מאוחר יותר',exSecReset:'חזרה לחלקים שזוהו',exEdited:'נערך',
  exSetH:'הגדרות',exPreset:'סגנון',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'אינטרו ואאוטרו ארוכים של תופים, נוח למיקס',exP_clubT:'בס כבר באינטרו, דרופים וברייקים ארוכים יותר',exP_radioT:'קצר יותר, עם התחלה וסוף נקיים',exP_perfT:'מוסיף סבב שני של בילד ודרופ',
  exLen:'כמה להאריך',exLenC:'אחר',exLenIn:'שניות להוספה',exSec:'{n} שנ׳',exMin:'{n} דק׳',exIntro:'אינטרו',exOutro:'אאוטרו',exIStyle:'סגנון האינטרו',exOStyle:'סגנון האאוטרו',
  exSt_drums:'תופים',exSt_db:'תופים + בס',exSt_full:'אינסטרומנטלי מלא',exSt_filt:'עם פילטר',exSt_perc:'כלי הקשה',exSt_origI:'האינטרו המקורי',exSt_origO:'האאוטרו המקורי',
  exGen:'יצירת אקסטנדד',exGenAgain:'יצירה מחדש',exGenBusy:'מייצרים…',exCancel:'ביטול',
  exPlanH:'העיבוד המתוכנן',exPlanSum:'{len} · ארוך יותר ב־{add} · {n} בלוקים',exOver:'האינטרו והאאוטרו לבד מוסיפים {x}, יותר מה־{t} שביקשתם.',exTarget:'יעד: {t}',
  exR_intro:'אינטרו לדיג׳יי',exR_orig:'מקור',exR_rep:'חזרה',exR_cycle:'סבב נוסף',exR_outro:'אאוטרו לדיג׳יי',
  exExpH:'הורדה',exExpP:'{len} · {bpm} BPM · {k}',exRate:'קצב דגימה',exCues:'נקודות קיו ל־Serato בתוך ה־MP3 (אינטרו, דרופ, אאוטרו)',exExpBtn:'הורדה',
  exRendering:'מעבדים… {p}%',exDone:'נשמר: {f} ({s} MB).',exExpFail:'הייצוא נכשל. נסו WAV.',exNeedGen:'קודם מייצרים את גרסת האקסטנדד.',
  exJoins:'מעברים',exJoinN:'מעבר {i} מתוך {n}',exJoinPrev:'המעבר הקודם',exJoinNext:'המעבר הבא',exJoinPlay:'האזנה למעבר',exJoinPlayT:'מנגן 4 תיבות לפני המעבר ו־4 תיבות אחריו (J)',exVol:'עוצמה',exQ:'איכות',exQT:'כמה נקייה העריכה, כפי שנמדד על האודיו שנוצר',exQClean:'מעברים נקיים',exQSeam:'חיבורי לופ',exQLu:'קפיצות עוצמה',exQCuts:'חיתוכי שירה',exQNone:'אין',exQBleed:'השירה דולפת לתופים של ההפרדה המהירה באינטרו או באאוטרו. הפרדת AI נותנת אינטרו נקי.',exQAi:'שדרוג לערוצי AI לאינטרו נקי יותר',exHead:'מעבדים את ההמשך… אפשר כבר להאזין',exDlNote:'ההאזנה בחינם. נקודות יורדות רק כשמורידים.',exJoinOk:'נקי',exJoinWarn:'כדאי להאזין',exFxKH:'קיק והיי־האט',exFxLp:'פילטר סגור',exGrown:'בתוך השירה אין מקום נקי לחזרה נוספת, אז האינטרו והאאוטרו לדיג׳יי התארכו ב־{x}.',exShortBy:'אי אפשר להאריך עוד בלי לחתוך את השירה: יצא קצר ב־{x} ממה שביקשתם.'},
en:{navExtended:'Extended',navExtendedS:'Ext.',exEyebrow:'An edit of the track itself · on its bar grid',exTitle:'Extended Generator',
  exSub:'Create a DJ extended version from any track. It is an edit of the song itself: the vocals, melody and tempo stay exactly as they are.',
  exDrop:'Drop a track here',exDropH:'MP3, WAV, M4A, FLAC, OGG · up to 250 MB',exFile:'File',exLib:'My Songs',exTool:'From the tool',exReplace:'Replace:',
  exNoTool:'Open a song in the tool first.',exErrLoad:'Couldn\'t load this track. Try again.',exErrLib:'Couldn\'t download the song from your account.',
  exBig:'The file is too large (over 250 MB).',exLong:'This track is too long (over 15 minutes). The generator works on tracks up to 15 minutes.',exShort:'This track is too short for an extended version (it needs at least 30 seconds and 16 bars).',
  exLegO:'Original audio',exLegS:'Built from the track\'s own stems',exHow1:'Load a track',exHow2:'Check its structure and fix it if needed',exHow3:'Pick a length and style, then generate',
  exLibT:'My Songs',exLibSearch:'Search',exLibEmpty:'No saved songs with a file yet. Songs you upload in the tool (signed in) show up here.',exLibNoFile:'no file saved',exLoad:'Load',exClose:'Close',
  exS_an:'Analyzing track',exS_bpm:'Detecting BPM',exS_key:'Detecting key',exS_sep:'Separating stems',exS_struct:'Analyzing structure',exS_phr:'Detecting phrases',exS_drop:'Detecting drops',
  exS_intro:'Building DJ intro',exS_outro:'Building DJ outro',exS_arr:'Generating arrangement',exS_render:'Rendering audio',
  exProcH:'Analyzing {n}',exGenH:'Generating the extended version',exReady:'Extended version ready',exReadyP:'{len} · {add} longer · {n} blocks on the bar grid',
  exLowGroove:'This track\'s timing is less steady (maybe played live), so intro/outro loops may not land exactly on the beat. Choosing the "Original" intro/outro style and listening before export is recommended.',exAnH:'Track analysis',exStBpm:'BPM',exStKey:'Key',exStLen:'Length',exStBars:'Bars',exStGroove:'Groove confidence',exStLock:'Phrase lock',
  exStGrooveT:'How precisely the hits fall on the beat grid',exStLockT:'How many section changes fall on 8- or 16-bar phrase lines',
  exL_intro:'Intro',exL_verse:'Verse',exL_pre:'Pre-Chorus',exL_build:'Build',exL_drop:'Drop',exL_break:'Break',exL_chorus:'Chorus',exL_bridge:'Bridge',exL_outro:'Outro',
  exStemsQ:'Quick stems · free',exStemsAI:'AI stems',exStemsTool:'Stems from the tool',exUpAi:'Upgrade to AI stems',exUpAiT:'AI separation sounds cleaner in the intro and outro. The structure is analysed again afterwards.',exCost:'{n} points',
  exSepFail:'The separation didn\'t work: {m}',exSepBusy:'Another separation is running. Wait for it to finish.',
  exOrig:'Original',exExt:'Extended',exPlayO:'Play the original',exPlayE:'Play the extended version',exPause:'Pause',exStop:'Stop',exAB:'A/B',exABT:'Switch between the original and the extended version at the same spot (T)',
  exLoopBlk:'Loop block',exLoopT:'Repeat the selected block (L)',exZoomIn:'Zoom in',exZoomOut:'Zoom out',exPlanned:'planned',exStale:'Settings changed. Generate again to hear them.',
  exTlHelp:'Click a section to change its type · drag its edge to move it (snaps to bars) · click a block to see where it came from',exKeys:'Space play · ← → one bar · T original/extended · L loop · J next join',
  exTlAria:'Timeline: {n}, the original ({a}) above the extended version ({b})',exPickBlk:'Pick a block of the extended version to see where it came from.',
  exFromS:'from {sec}',exFrom:'From {sec} · {t} · bars {b}',exBarsN:'{n} bars',exFull:'Full mix',exPlus:' + ',
  exWhyOrig:'The original, unchanged',exWhyIntro:'DJ intro: a loop of the steadiest phrase',exWhyOutro:'DJ outro: ends right on a bar line',exWhyRep:'Phrase repeated to extend {sec}',exWhyCycle:'An extra build and drop',
  exFxOpen:'filter opens',exFxClose:'filter closes',exFxHp:'no kick or bass',
  exSecH:'Sections',exSecEdit:'Edit {sec}',exSecType:'Section type',exSecStart:'Start',exSecEnd:'End',exEarlier:'One bar earlier',exLater:'One bar later',exSecReset:'Back to the detected sections',exEdited:'edited',
  exSetH:'Settings',exPreset:'Style',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'Long drum intro and outro for mixing',exP_clubT:'Bass in the intro, longer drops and breaks',exP_radioT:'Shorter, with a clean start and end',exP_perfT:'Adds a second build and drop',
  exLen:'Add',exLenC:'Custom',exLenIn:'Seconds to add',exSec:'{n} s',exMin:'{n} min',exIntro:'Intro',exOutro:'Outro',exIStyle:'Intro style',exOStyle:'Outro style',
  exSt_drums:'Drums',exSt_db:'Drums + bass',exSt_full:'Full instrumental',exSt_filt:'Filtered',exSt_perc:'Percussion',exSt_origI:'Original intro',exSt_origO:'Original outro',
  exGen:'Generate extended',exGenAgain:'Generate again',exGenBusy:'Generating…',exCancel:'Cancel',
  exPlanH:'Planned arrangement',exPlanSum:'{len} · {add} longer · {n} blocks',exOver:'The intro and outro alone add {x}, more than the {t} you asked for.',exTarget:'target {t}',
  exR_intro:'DJ intro',exR_orig:'Original',exR_rep:'Repeat',exR_cycle:'Extra cycle',exR_outro:'DJ outro',
  exExpH:'Download',exExpP:'{len} · {bpm} BPM · {k}',exRate:'Sample rate',exCues:'Serato cue points in the MP3 (intro, drop, outro)',exExpBtn:'Download',
  exRendering:'Rendering… {p}%',exDone:'Saved {f} ({s} MB).',exExpFail:'The export failed. Try WAV.',exNeedGen:'Generate the extended version first.',
  exJoins:'Joins',exJoinN:'Join {i} of {n}',exJoinPrev:'Previous join',exJoinNext:'Next join',exJoinPlay:'Hear this join',exJoinPlayT:'Plays 4 bars before the join and 4 bars after it (J)',exVol:'Volume',exQ:'Quality',exQT:'How clean the edit is, measured on the rendered audio',exQClean:'Clean joins',exQSeam:'Loop seams',exQLu:'Level jumps',exQCuts:'Vocal cuts',exQNone:'none',exQBleed:'The singer leaks into the quick-split drums in the intro or outro. AI stems give a clean intro.',exQAi:'Upgrade to AI stems for a cleaner intro',exHead:'Rendering the rest… you can already listen',exDlNote:'Listening is free. Points are charged only when you download.',exJoinOk:'clean',exJoinWarn:'worth a listen',exFxKH:'kick + hats',exFxLp:'filtered',exGrown:'The vocals leave no clean place for another repeat, so the DJ intro and outro got {x} longer.',exShortBy:'More can\'t be added without cutting the vocals: {x} shorter than you asked.'},
ar:{navExtended:'إكستندد',navExtendedS:'إكستندد',exEyebrow:'تحرير للأغنية نفسها · على شبكة المازورات',exTitle:'مولّد الإكستندد',
  exSub:'أنشئ نسخة إكستندد للدي جي من أي أغنية. إنه تحرير للأغنية نفسها: الغناء واللحن والإيقاع تبقى كما هي تمامًا.',
  exDrop:'اسحب أغنية إلى هنا',exDropH:'MP3, WAV, M4A, FLAC, OGG · حتى 250 MB',exFile:'ملف',exLib:'أغانيّ',exTool:'من الأداة',exReplace:'استبدال:',
  exNoTool:'افتح أغنية في الأداة أولًا.',exErrLoad:'تعذّر تحميل الأغنية. حاول مرة أخرى.',exErrLib:'تعذّر تنزيل الأغنية من حسابك.',
  exBig:'الملف كبير جدًا (أكثر من 250 MB).',exLong:'الأغنية طويلة جدًا (أكثر من 15 دقيقة). يعمل المولّد على أغانٍ حتى 15 دقيقة.',exShort:'الأغنية قصيرة جدًا لنسخة إكستندد (تحتاج 30 ثانية و16 مازورة على الأقل).',
  exLegO:'الصوت الأصلي',exLegS:'مبني من مسارات الأغنية نفسها',exHow1:'حمّل أغنية',exHow2:'راجع بنيتها وصحّحها إن لزم',exHow3:'اختر الطول والأسلوب ثم أنشئ',
  exLibT:'أغانيّ',exLibSearch:'بحث',exLibEmpty:'لا توجد أغانٍ محفوظة مع ملف بعد. الأغاني التي ترفعها في الأداة (مع تسجيل الدخول) تظهر هنا.',exLibNoFile:'لا يوجد ملف محفوظ',exLoad:'تحميل',exClose:'إغلاق',
  exS_an:'تحليل الأغنية',exS_bpm:'اكتشاف BPM',exS_key:'اكتشاف المقام',exS_sep:'فصل المسارات',exS_struct:'تحليل البنية',exS_phr:'اكتشاف الجُمل',exS_drop:'اكتشاف الدروب',
  exS_intro:'بناء مقدمة للدي جي',exS_outro:'بناء خاتمة للدي جي',exS_arr:'إنشاء التوزيع',exS_render:'معالجة الصوت',
  exProcH:'تحليل {n}',exGenH:'إنشاء نسخة الإكستندد',exReady:'نسخة الإكستندد جاهزة',exReadyP:'{len} · أطول بـ {add} · {n} مقاطع على شبكة المازورات',
  exLowGroove:'إيقاع هذه الأغنية أقل ثباتًا (ربما سُجّلت حيًّا)، لذا قد لا تقع حلقات المقدمة والخاتمة على النبضة تمامًا. يُنصح باختيار نمط "الأصلي" للمقدمة والخاتمة والاستماع قبل التصدير.',exAnH:'تحليل الأغنية',exStBpm:'BPM',exStKey:'المقام',exStLen:'المدة',exStBars:'المازورات',exStGroove:'ثبات الإيقاع',exStLock:'التزام الجُمل',
  exStGrooveT:'مدى دقة وقوع الضربات على شبكة النبضات',exStLockT:'كم من الانتقالات بين الأقسام تقع على خطوط جُمل من 8 أو 16 مازورة',
  exL_intro:'مقدمة',exL_verse:'مقطع',exL_pre:'ما قبل اللازمة',exL_build:'تصاعد',exL_drop:'دروب',exL_break:'استراحة',exL_chorus:'لازمة',exL_bridge:'جسر',exL_outro:'خاتمة',
  exStemsQ:'مسارات سريعة · مجانًا',exStemsAI:'مسارات AI',exStemsTool:'مسارات من الأداة',exUpAi:'الترقية إلى مسارات AI',exUpAiT:'الفصل بالذكاء الاصطناعي أنقى في المقدمة والخاتمة. بعدها تُحلَّل البنية من جديد.',exCost:'{n} نقاط',
  exSepFail:'لم ينجح الفصل: {m}',exSepBusy:'هناك فصل آخر قيد التشغيل. انتظر حتى ينتهي.',
  exOrig:'الأصل',exExt:'إكستندد',exPlayO:'تشغيل الأصل',exPlayE:'تشغيل نسخة الإكستندد',exPause:'إيقاف مؤقت',exStop:'إيقاف',exAB:'A/B',exABT:'التبديل بين الأصل والإكستندد عند النقطة نفسها (T)',
  exLoopBlk:'تكرار المقطع',exLoopT:'تكرار المقطع المحدد (L)',exZoomIn:'تكبير',exZoomOut:'تصغير',exPlanned:'مخطَّط',exStale:'تغيّرت الإعدادات. أنشئ من جديد لتسمعها.',
  exTlHelp:'انقر قسمًا لتغيير نوعه · اسحب طرفه لتحريكه (يلتصق بالمازورات) · انقر مقطعًا لترى من أين أُخذ',exKeys:'Space تشغيل · ← → مازورة · T الأصل/الإكستندد · L تكرار · J الانتقال التالي',
  exTlAria:'الخط الزمني: {n}، الأصل ({a}) فوق نسخة الإكستندد ({b})',exPickBlk:'اختر مقطعًا من نسخة الإكستندد لترى من أين أُخذ.',
  exFromS:'من {sec}',exFrom:'من {sec} · {t} · المازورات {b}',exBarsN:'{n} مازورات',exFull:'المزيج الكامل',exPlus:' + ',
  exWhyOrig:'الأصل دون تغيير',exWhyIntro:'مقدمة للدي جي: تكرار للجملة الأكثر ثباتًا',exWhyOutro:'خاتمة للدي جي: تنتهي تمامًا على خط مازورة',exWhyRep:'جملة مكرّرة لإطالة {sec}',exWhyCycle:'دورة إضافية من التصاعد والدروب',
  exFxOpen:'الفلتر ينفتح',exFxClose:'الفلتر ينغلق',exFxHp:'بلا كيك ولا باص',
  exSecH:'أقسام الأغنية',exSecEdit:'تعديل {sec}',exSecType:'نوع القسم',exSecStart:'البداية',exSecEnd:'النهاية',exEarlier:'مازورة واحدة أبكر',exLater:'مازورة واحدة أبعد',exSecReset:'العودة إلى الأقسام المكتشفة',exEdited:'معدَّل',
  exSetH:'الإعدادات',exPreset:'الأسلوب',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'مقدمة وخاتمة طويلتان من الطبول للمزج',exP_clubT:'باص في المقدمة، ودروب واستراحات أطول',exP_radioT:'أقصر، ببداية ونهاية نظيفتين',exP_perfT:'يضيف دورة ثانية من التصاعد والدروب',
  exLen:'الإطالة',exLenC:'مخصّص',exLenIn:'ثوانٍ للإضافة',exSec:'{n} ث',exMin:'{n} د',exIntro:'المقدمة',exOutro:'الخاتمة',exIStyle:'أسلوب المقدمة',exOStyle:'أسلوب الخاتمة',
  exSt_drums:'طبول',exSt_db:'طبول + باص',exSt_full:'موسيقى كاملة بلا غناء',exSt_filt:'مع فلتر',exSt_perc:'إيقاعيات',exSt_origI:'المقدمة الأصلية',exSt_origO:'الخاتمة الأصلية',
  exGen:'إنشاء إكستندد',exGenAgain:'إنشاء من جديد',exGenBusy:'جارٍ الإنشاء…',exCancel:'إلغاء',
  exPlanH:'التوزيع المخطَّط',exPlanSum:'{len} · أطول بـ {add} · {n} مقاطع',exOver:'المقدمة والخاتمة وحدهما تضيفان {x}، أكثر من {t} المطلوبة.',exTarget:'الهدف: {t}',
  exR_intro:'مقدمة الدي جي',exR_orig:'الأصل',exR_rep:'تكرار',exR_cycle:'دورة إضافية',exR_outro:'خاتمة الدي جي',
  exExpH:'تنزيل',exExpP:'{len} · {bpm} BPM · {k}',exRate:'معدل العيّنات',exCues:'نقاط Serato داخل ملف MP3 (المقدمة، الدروب، الخاتمة)',exExpBtn:'تنزيل',
  exRendering:'معالجة… {p}%',exDone:'تم الحفظ: {f} ({s} MB).',exExpFail:'فشل التصدير. جرّب WAV.',exNeedGen:'أنشئ نسخة الإكستندد أولًا.',
  exJoins:'الانتقالات',exJoinN:'الانتقال {i} من {n}',exJoinPrev:'الانتقال السابق',exJoinNext:'الانتقال التالي',exJoinPlay:'استمع إلى الانتقال',exJoinPlayT:'يشغّل 4 مازورات قبل الانتقال و4 مازورات بعده (J)',exVol:'مستوى الصوت',exQ:'الجودة',exQT:'مدى نظافة التحرير، مقاسة على الصوت الناتج',exQClean:'انتقالات نظيفة',exQSeam:'وصلات الحلقات',exQLu:'قفزات في مستوى الصوت',exQCuts:'قطع في الغناء',exQNone:'لا يوجد',exQBleed:'الغناء يتسرّب إلى طبول الفصل السريع في المقدمة أو الخاتمة. فصل AI يعطي مقدمة نظيفة.',exQAi:'الترقية إلى مسارات AI لمقدمة أنظف',exHead:'نعالج الباقي… يمكنك الاستماع الآن',exDlNote:'الاستماع مجاني. تُخصم النقاط عند التنزيل فقط.',exJoinOk:'نظيف',exJoinWarn:'يستحق الاستماع',exFxKH:'كيك وهاي هات',exFxLp:'مع فلتر',exGrown:'لا يترك الغناء مكانًا نظيفًا لتكرار آخر، لذا أصبحت مقدمة الدي جي وخاتمته أطول بـ {x}.',exShortBy:'لا يمكن الإضافة أكثر دون قطع الغناء: أقصر بـ {x} مما طلبت.'},
ru:{navExtended:'Extended',navExtendedS:'Ext.',exEyebrow:'Монтаж самого трека · по сетке тактов',exTitle:'Генератор Extended',
  exSub:'Сделайте DJ extended-версию любого трека. Это монтаж самой песни: вокал, мелодия и темп остаются точно такими же.',
  exDrop:'Перетащите трек сюда',exDropH:'MP3, WAV, M4A, FLAC, OGG · до 250 МБ',exFile:'Файл',exLib:'Мои песни',exTool:'Из инструмента',exReplace:'Заменить:',
  exNoTool:'Сначала откройте песню в инструменте.',exErrLoad:'Не удалось загрузить трек. Попробуйте ещё раз.',exErrLib:'Не удалось скачать песню из вашего аккаунта.',
  exBig:'Файл слишком большой (больше 250 МБ).',exLong:'Трек слишком длинный (больше 15 минут). Генератор работает с треками до 15 минут.',exShort:'Трек слишком короткий для extended-версии (нужно минимум 30 секунд и 16 тактов).',
  exLegO:'Оригинальный звук',exLegS:'Собрано из стемов самого трека',exHow1:'Загрузите трек',exHow2:'Проверьте структуру и поправьте при необходимости',exHow3:'Выберите длину и стиль и создайте версию',
  exLibT:'Мои песни',exLibSearch:'Поиск',exLibEmpty:'Пока нет сохранённых песен с файлом. Песни, загруженные в инструменте (после входа), появятся здесь.',exLibNoFile:'файл не сохранён',exLoad:'Загрузить',exClose:'Закрыть',
  exS_an:'Анализ трека',exS_bpm:'Определение BPM',exS_key:'Определение тональности',exS_sep:'Разделение на стемы',exS_struct:'Анализ структуры',exS_phr:'Поиск фраз',exS_drop:'Поиск дропов',
  exS_intro:'Сборка DJ-интро',exS_outro:'Сборка DJ-аутро',exS_arr:'Создание аранжировки',exS_render:'Сведение аудио',
  exProcH:'Анализ: {n}',exGenH:'Создаём extended-версию',exReady:'Extended-версия готова',exReadyP:'{len} · длиннее на {add} · блоков на сетке тактов: {n}',
  exLowGroove:'Темп этого трека менее стабилен (возможно, живая запись), поэтому лупы интро/аутро могут не попадать точно в долю. Лучше выбрать стиль интро/аутро «Оригинал» и послушать перед экспортом.',exAnH:'Анализ трека',exStBpm:'BPM',exStKey:'Тональность',exStLen:'Длина',exStBars:'Такты',exStGroove:'Уверенность в груве',exStLock:'Привязка к фразам',
  exStGrooveT:'Насколько точно удары попадают в сетку долей',exStLockT:'Сколько смен частей приходится на границы фраз в 8 или 16 тактов',
  exL_intro:'Интро',exL_verse:'Куплет',exL_pre:'Пре-припев',exL_build:'Билд',exL_drop:'Дроп',exL_break:'Брейк',exL_chorus:'Припев',exL_bridge:'Бридж',exL_outro:'Аутро',
  exStemsQ:'Быстрые стемы · бесплатно',exStemsAI:'AI-стемы',exStemsTool:'Стемы из инструмента',exUpAi:'Перейти на AI-стемы',exUpAiT:'AI-разделение звучит чище в интро и аутро. После него структура анализируется заново.',exCost:'{n} баллов',
  exSepFail:'Разделение не удалось: {m}',exSepBusy:'Уже идёт другое разделение. Дождитесь его окончания.',
  exOrig:'Оригинал',exExt:'Extended',exPlayO:'Играть оригинал',exPlayE:'Играть extended-версию',exPause:'Пауза',exStop:'Стоп',exAB:'A/B',exABT:'Переключиться между оригиналом и extended в том же месте (T)',
  exLoopBlk:'Луп блока',exLoopT:'Повторять выбранный блок (L)',exZoomIn:'Приблизить',exZoomOut:'Отдалить',exPlanned:'план',exStale:'Настройки изменились. Создайте версию заново, чтобы их услышать.',
  exTlHelp:'Клик по части — сменить её тип · тяните её край, чтобы сдвинуть (по тактам) · клик по блоку — откуда он взят',exKeys:'Space — пуск · ← → такт · T — оригинал/extended · L — луп · J — следующий стык',
  exTlAria:'Таймлайн: {n}, оригинал ({a}) над extended-версией ({b})',exPickBlk:'Выберите блок extended-версии, чтобы увидеть, откуда он взят.',
  exFromS:'из: {sec}',exFrom:'Из: {sec} · {t} · такты {b}',exBarsN:'Тактов: {n}',exFull:'Полный микс',exPlus:' + ',
  exWhyOrig:'Оригинал без изменений',exWhyIntro:'DJ-интро: луп самой ровной фразы',exWhyOutro:'DJ-аутро: заканчивается точно на границе такта',exWhyRep:'Фраза повторена, чтобы удлинить: {sec}',exWhyCycle:'Дополнительный билд и дроп',
  exFxOpen:'фильтр открывается',exFxClose:'фильтр закрывается',exFxHp:'без бочки и баса',
  exSecH:'Части трека',exSecEdit:'Изменить: {sec}',exSecType:'Тип части',exSecStart:'Начало',exSecEnd:'Конец',exEarlier:'На такт раньше',exLater:'На такт позже',exSecReset:'Вернуть найденные части',exEdited:'изменено',
  exSetH:'Настройки',exPreset:'Стиль',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'Длинные барабанные интро и аутро для сведения',exP_clubT:'Бас уже в интро, дропы и брейки длиннее',exP_radioT:'Короче, с чистым началом и концом',exP_perfT:'Добавляет второй билд и дроп',
  exLen:'Удлинить на',exLenC:'Своё',exLenIn:'Сколько секунд добавить',exSec:'{n} с',exMin:'{n} мин',exIntro:'Интро',exOutro:'Аутро',exIStyle:'Стиль интро',exOStyle:'Стиль аутро',
  exSt_drums:'Барабаны',exSt_db:'Барабаны + бас',exSt_full:'Весь инструментал',exSt_filt:'С фильтром',exSt_perc:'Перкуссия',exSt_origI:'Оригинальное интро',exSt_origO:'Оригинальное аутро',
  exGen:'Создать extended',exGenAgain:'Создать заново',exGenBusy:'Создаём…',exCancel:'Отмена',
  exPlanH:'План аранжировки',exPlanSum:'{len} · длиннее на {add} · блоков: {n}',exOver:'Одни интро и аутро добавляют {x} — больше, чем запрошенные {t}.',exTarget:'цель: {t}',
  exR_intro:'DJ-интро',exR_orig:'Оригинал',exR_rep:'Повтор',exR_cycle:'Доп. цикл',exR_outro:'DJ-аутро',
  exExpH:'Скачать',exExpP:'{len} · {bpm} BPM · {k}',exRate:'Частота дискретизации',exCues:'Cue-точки Serato в MP3 (интро, дроп, аутро)',exExpBtn:'Скачать',
  exRendering:'Сведение… {p}%',exDone:'Сохранено: {f} ({s} МБ).',exExpFail:'Экспорт не удался. Попробуйте WAV.',exNeedGen:'Сначала создайте extended-версию.',
  exJoins:'Стыки',exJoinN:'Стык {i} из {n}',exJoinPrev:'Предыдущий стык',exJoinNext:'Следующий стык',exJoinPlay:'Послушать стык',exJoinPlayT:'Играет 4 такта до стыка и 4 такта после (J)',exVol:'Громкость',exQ:'Качество',exQT:'Насколько чистый монтаж — измерено по готовому звуку',exQClean:'Чистые стыки',exQSeam:'Швы лупов',exQLu:'Скачки громкости',exQCuts:'Обрывы вокала',exQNone:'нет',exQBleed:'Вокал просачивается в барабаны быстрого разделения в интро или аутро. AI-стемы дают чистое интро.',exQAi:'Перейти на AI-стемы для более чистого интро',exHead:'Сводим остальное… уже можно слушать',exDlNote:'Слушать бесплатно. Баллы списываются только при скачивании.',exJoinOk:'чисто',exJoinWarn:'стоит послушать',exFxKH:'бочка и хэты',exFxLp:'с фильтром',exGrown:'Вокал не оставляет чистого места для ещё одного повтора, поэтому DJ-интро и аутро стали длиннее на {x}.',exShortBy:'Больше не добавить, не обрезав вокал: короче запрошенного на {x}.'},
es:{navExtended:'Extended',navExtendedS:'Ext.',exEyebrow:'Una edición del propio tema · sobre su rejilla de compases',exTitle:'Generador Extended',
  exSub:'Crea una versión extended para DJ de cualquier tema. Es una edición de la propia canción: la voz, la melodía y el tempo quedan exactamente igual.',
  exDrop:'Suelta aquí un tema',exDropH:'MP3, WAV, M4A, FLAC, OGG · hasta 250 MB',exFile:'Archivo',exLib:'Mis canciones',exTool:'Desde la herramienta',exReplace:'Cambiar:',
  exNoTool:'Primero abre una canción en la herramienta.',exErrLoad:'No se pudo cargar el tema. Inténtalo de nuevo.',exErrLib:'No se pudo descargar la canción de tu cuenta.',
  exBig:'El archivo es demasiado grande (más de 250 MB).',exLong:'La pista es demasiado larga (más de 15 minutos). El generador funciona con pistas de hasta 15 minutos.',exShort:'El tema es demasiado corto para una versión extended (necesita al menos 30 segundos y 16 compases).',
  exLegO:'Audio original',exLegS:'Hecho con las pistas del propio tema',exHow1:'Carga un tema',exHow2:'Revisa su estructura y corrígela si hace falta',exHow3:'Elige duración y estilo, y genera',
  exLibT:'Mis canciones',exLibSearch:'Buscar',exLibEmpty:'Aún no hay canciones guardadas con archivo. Las que subas en la herramienta (con sesión iniciada) aparecerán aquí.',exLibNoFile:'sin archivo guardado',exLoad:'Cargar',exClose:'Cerrar',
  exS_an:'Analizando el tema',exS_bpm:'Detectando el BPM',exS_key:'Detectando la tonalidad',exS_sep:'Separando pistas',exS_struct:'Analizando la estructura',exS_phr:'Detectando frases',exS_drop:'Detectando drops',
  exS_intro:'Creando la intro DJ',exS_outro:'Creando el outro DJ',exS_arr:'Generando el arreglo',exS_render:'Renderizando el audio',
  exProcH:'Analizando {n}',exGenH:'Generando la versión extended',exReady:'Versión extended lista',exReadyP:'{len} · {add} más larga · {n} bloques sobre la rejilla de compases',
  exLowGroove:'El tempo de este tema es menos estable (quizá grabado en vivo), así que los loops de intro/outro pueden no caer justo en el pulso. Se recomienda el estilo de intro/outro "Original" y escuchar antes de exportar.',exAnH:'Análisis del tema',exStBpm:'BPM',exStKey:'Tonalidad',exStLen:'Duración',exStBars:'Compases',exStGroove:'Confianza del groove',exStLock:'Ajuste a frases',
  exStGrooveT:'Con qué precisión caen los golpes sobre la rejilla de tiempos',exStLockT:'Cuántos cambios de sección caen en líneas de frase de 8 o 16 compases',
  exL_intro:'Intro',exL_verse:'Estrofa',exL_pre:'Pre-estribillo',exL_build:'Build',exL_drop:'Drop',exL_break:'Break',exL_chorus:'Estribillo',exL_bridge:'Puente',exL_outro:'Outro',
  exStemsQ:'Pistas rápidas · gratis',exStemsAI:'Pistas con IA',exStemsTool:'Pistas de la herramienta',exUpAi:'Mejorar a pistas con IA',exUpAiT:'La separación con IA suena más limpia en la intro y el outro. Después se analiza de nuevo la estructura.',exCost:'{n} puntos',
  exSepFail:'La separación no funcionó: {m}',exSepBusy:'Hay otra separación en curso. Espera a que termine.',
  exOrig:'Original',exExt:'Extended',exPlayO:'Reproducir el original',exPlayE:'Reproducir la versión extended',exPause:'Pausa',exStop:'Detener',exAB:'A/B',exABT:'Cambiar entre el original y la extended en el mismo punto (T)',
  exLoopBlk:'Bucle del bloque',exLoopT:'Repetir el bloque seleccionado (L)',exZoomIn:'Acercar',exZoomOut:'Alejar',exPlanned:'planificado',exStale:'Cambiaron los ajustes. Genera de nuevo para escucharlos.',
  exTlHelp:'Haz clic en una sección para cambiar su tipo · arrastra su borde para moverla (se ajusta a compases) · haz clic en un bloque para ver de dónde salió',exKeys:'Espacio reproducir · ← → un compás · T original/extended · L bucle · J siguiente unión',
  exTlAria:'Línea de tiempo: {n}, el original ({a}) sobre la versión extended ({b})',exPickBlk:'Elige un bloque de la versión extended para ver de dónde salió.',
  exFromS:'de {sec}',exFrom:'De {sec} · {t} · compases {b}',exBarsN:'{n} compases',exFull:'Mezcla completa',exPlus:' + ',
  exWhyOrig:'El original, sin cambios',exWhyIntro:'Intro DJ: un bucle de la frase más estable',exWhyOutro:'Outro DJ: termina justo en una línea de compás',exWhyRep:'Frase repetida para alargar {sec}',exWhyCycle:'Un build y un drop extra',
  exFxOpen:'el filtro se abre',exFxClose:'el filtro se cierra',exFxHp:'sin bombo ni bajo',
  exSecH:'Secciones',exSecEdit:'Editar {sec}',exSecType:'Tipo de sección',exSecStart:'Inicio',exSecEnd:'Final',exEarlier:'Un compás antes',exLater:'Un compás después',exSecReset:'Volver a las secciones detectadas',exEdited:'editado',
  exSetH:'Ajustes',exPreset:'Estilo',exP_dj:'DJ Extended',exP_club:'Club Extended',exP_radio:'Radio Extended',exP_perf:'Performance Edit',
  exP_djT:'Intro y outro largos de batería para mezclar',exP_clubT:'Bajo en la intro, drops y breaks más largos',exP_radioT:'Más corto, con un inicio y un final limpios',exP_perfT:'Añade un segundo build y drop',
  exLen:'Añadir',exLenC:'Otro',exLenIn:'Segundos que añadir',exSec:'{n} s',exMin:'{n} min',exIntro:'Intro',exOutro:'Outro',exIStyle:'Estilo de la intro',exOStyle:'Estilo del outro',
  exSt_drums:'Batería',exSt_db:'Batería + bajo',exSt_full:'Instrumental completo',exSt_filt:'Con filtro',exSt_perc:'Percusión',exSt_origI:'Intro original',exSt_origO:'Outro original',
  exGen:'Generar extended',exGenAgain:'Generar de nuevo',exGenBusy:'Generando…',exCancel:'Cancelar',
  exPlanH:'Arreglo planificado',exPlanSum:'{len} · {add} más larga · {n} bloques',exOver:'La intro y el outro por sí solos añaden {x}, más de los {t} que pediste.',exTarget:'objetivo: {t}',
  exR_intro:'Intro DJ',exR_orig:'Original',exR_rep:'Repetición',exR_cycle:'Ciclo extra',exR_outro:'Outro DJ',
  exExpH:'Descargar',exExpP:'{len} · {bpm} BPM · {k}',exRate:'Frecuencia de muestreo',exCues:'Cue points de Serato en el MP3 (intro, drop, outro)',exExpBtn:'Descargar',
  exRendering:'Renderizando… {p}%',exDone:'Guardado: {f} ({s} MB).',exExpFail:'La exportación falló. Prueba WAV.',exNeedGen:'Primero genera la versión extended.',
  exJoins:'Uniones',exJoinN:'Unión {i} de {n}',exJoinPrev:'Unión anterior',exJoinNext:'Unión siguiente',exJoinPlay:'Escuchar la unión',exJoinPlayT:'Reproduce 4 compases antes de la unión y 4 después (J)',exVol:'Volumen',exQ:'Calidad',exQT:'Qué tan limpia es la edición, medido sobre el audio generado',exQClean:'Uniones limpias',exQSeam:'Empalmes de bucle',exQLu:'Saltos de volumen',exQCuts:'Cortes de voz',exQNone:'ninguno',exQBleed:'La voz se filtra en la batería de la separación rápida en la intro o el outro. Las pistas con IA dan una intro limpia.',exQAi:'Mejorar a pistas con IA para una intro más limpia',exHead:'Renderizando el resto… ya puedes escuchar',exDlNote:'Escuchar es gratis. Los puntos se cobran solo al descargar.',exJoinOk:'limpia',exJoinWarn:'conviene escucharla',exFxKH:'bombo y charles',exFxLp:'con filtro',exGrown:'La voz no deja un lugar limpio para otra repetición, así que la intro y el outro DJ son {x} más largos.',exShortBy:'No se puede añadir más sin cortar la voz: {x} más corto de lo que pediste.'}
});

/* ---------- constants ---------- */
const IDS=['vocals','drums','bass','other'];
const LABS=['intro','verse','pre','build','drop','break','chorus','bridge','outro'];
// fixed colours, consistent with the cue colours in assets/cues.js (intro green, vocal→verse blue, break yellow, build purple, drop red, outro orange)
const LCOL={intro:[40,226,20],verse:[48,90,255],pre:[54,190,240],build:[170,114,255],drop:[230,40,40],break:[195,175,4],chorus:[255,79,154],bridge:[150,160,178],outro:[255,140,0]};
const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;
const STYLES=['drums','db','full','filt','perc','orig'];
// defaults sized so intro + outro fit inside the added time at ~128 BPM (32 bars ≈ 60 s): DJ = long intro/outro only,
// Club/Performance leave about a minute for longer drops / a second build-drop cycle
const PRESETS={dj:{add:120,intro:32,outro:32,is:'drums',os:'drums'},club:{add:120,intro:16,outro:16,is:'db',os:'db'},radio:{add:30,intro:16,outro:16,is:'orig',os:'orig'},perf:{add:120,intro:16,outro:16,is:'drums',os:'drums'}};
const ADDS=[30,60,90,120],BARN=[16,32,64];
const XF=0.02;                         // join crossfade, ends on the downbeat
const MAX_BYTES=250*1024*1024,MAX_DUR=15*60;   // ~3 GB of tab memory for a 12-min track (song + 4 quick stems + render): longer ones would crash the tab
const ACCEPT='audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.oga,.opus,.aif,.aiff';
const LS='chordroom.extended.v1';
const STEPS=['an','bpm','key','sep','struct','phr','drop','intro','outro','arr','render'];
const AN_STEPS=STEPS.slice(0,7);
const QW=(()=>{const s=document.currentScript&&document.currentScript.src;try{return s?new URL('quicksep-worker.js'+new URL(s).search,s).href:'assets/quicksep-worker.js'}catch(e){return 'assets/quicksep-worker.js'}})();
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const reduced=()=>document.documentElement.classList.contains('a11y-noanim')||(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const defSet=()=>({preset:'dj',add:120,custom:45,intro:32,outro:32,is:'drums',os:'drums',fmt:'mp3',sr:44100,cues:true,vol:0.9});

const X={built:false,visible:false,owner:undefined,song:null,tok:0,stage:'empty',steps:{},stepP:0,stepMsg:'',set:defSet(),
  plan:null,render:null,rwave:null,rsig:'',genTok:0,sel:-1,hover:-1,msg:'',msgErr:false,zoom:1,view0:0,reveal:Infinity,
  exporting:false,sep:null,pickFrom:null,drag:null,fin:0,secEd:-1,lastExport:null};

/* ---------- small helpers ---------- */
const fmtT=x=>{x=Math.max(0,x);const m=Math.floor(x/60),s=x-m*60;return m+':'+(s<10?'0':'')+s.toFixed(1)};
const fmtD=x=>CR.fmtS(Math.max(0,Math.round(x)));
const fmtAdd=x=>{const a=Math.round(Math.abs(x));const m=Math.floor(a/60),s=a%60;return iso((x<0?'−':'')+(m?m+':'+(s<10?'0':'')+s:t('exSec',{n:a})))};
// numbers / times inside translated sentences: an LTR isolate, so RTL text never reorders them ("1:00–1:15" stays in order)
const iso=x=>'\u2066'+x+'\u2069';
const pctl=(arr,p)=>{const s=Array.from(arr).filter(isFinite).sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:0};
const meanOf=(a,i,j)=>{let s=0,n=0;for(let k=Math.max(0,i);k<Math.min(a.length,j);k++){s+=a[k];n++}return n?s/n:0};
const labName=l=>t('exL_'+l);
function secNames(secs){const c={};return secs.map(s=>{c[s.lab]=(c[s.lab]||0)+1;return labName(s.lab)+' '+c[s.lab]})}
function gridOf(a,dur){const T=60/a.bpm,B=4*T;let fd=mod(a.offset||0,T)+mod(a.down||0,4)*T;if(fd>30)fd=mod(a.offset||0,T);return {T,B,fd,nb:Math.max(0,Math.floor((dur-fd)/B+1e-6))}}
const srcT=(s,x)=>s.g.fd+x*s.g.B+(s.drift?s.drift[clamp(Math.round(x),0,s.drift.length-1)]:0);

/* ---------- analysis: per-bar features ---------- */
function barRms(buf,s,nb){
  const L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L,sr=buf.sampleRate,o=new Float32Array(nb);
  for(let k=0;k<nb;k++){const a=Math.max(0,Math.floor(srcT(s,k)*sr)),z=Math.min(L.length,Math.floor(srcT(s,k+1)*sr));let q=0,c=0;for(let j=a;j<z;j+=16){const x=(L[j]+R[j])*0.5;q+=x*x;c++}o[k]=c?Math.sqrt(q/c):0}
  return o;
}
async function features(s){
  const nb=s.g.nb,HOP=0.05;
  const F=s.F||(s.F=await CUES._features(s.buffer));
  const perBar=e=>{const o=new Float32Array(nb);for(let k=0;k<nb;k++){const a=Math.max(0,Math.round(srcT(s,k)/HOP)),b=Math.min(e.length,Math.round(srcT(s,k+1)/HOP));o[k]=meanOf(e,a,b)}return o};
  const fu=perBar(F.mono),lo=perBar(F.lo),hi=perBar(F.hi),vm=perBar(F.vm),vs=F.vs?perBar(F.vs):null;
  const mix=barRms(s.buffer,s,nb),st={};
  if(s.stems)for(const id of IDS)st[id]=barRms(s.stems[id],s,nb);
  // chroma per bar (24 bins: 12 treble + 12 bass at half weight), unit length
  const C=s.chroma||(s.chroma=await CR.chromaOf(s.buffer)),ch=[];
  for(let k=0;k<nb;k++){const v=new Float32Array(24),a=Math.max(0,Math.ceil((srcT(s,k)-C.t0)*C.rate)),b=Math.min(C.frames,Math.ceil((srcT(s,k+1)-C.t0)*C.rate));
    for(let i=a;i<b;i++)for(let p=0;p<12;p++){v[p]+=Math.sqrt(C.tre[i*12+p]);v[12+p]+=0.5*Math.sqrt(C.bas[i*12+p])}
    let n=0;for(let p=0;p<24;p++)n+=v[p]*v[p];n=Math.sqrt(n)||1;for(let p=0;p<24;p++)v[p]/=n;ch.push(v)}
  // music range
  const p90a=pctl(fu,0.9)||1e-9;let s0=0;while(s0<nb-1&&fu[s0]/p90a<0.08)s0++;let e0=nb-1;while(e0>s0&&fu[e0]/p90a<0.08)e0--;
  const n90=a=>{const p=pctl(a.slice(s0,e0+1),0.9)||1e-9;return a.map(v=>Math.min(1.6,v/p))};
  const f={nb,s0,e0,fu:n90(fu),lo:n90(lo),hi:n90(hi),ch,mix};
  if(s.stems){f.dr=n90(st.drums);f.vo=n90(st.vocals);f.md=n90(st.other);f.bs=n90(st.bass);f.pv=st.vocals.map((v,k)=>v/(mix[k]+1e-9));f.st=st}
  else{f.dr=f.hi;f.vo=n90(vm);f.md=f.vo;f.bs=f.lo;f.pv=vs?vm.map((v,k)=>Math.min(1,(v/(vs[k]+1e-9)-1)/3)):vm.map(()=>0.3)}
  const E=s.E||(s.E=stemEnv(s));
  // vocal presence per bar = share of the bar's frames where the singer is heard (see vocalFrames), and a rhythm pattern per bar
  f.va=new Float32Array(nb);f.rp=[];f.de=new Float32Array(nb);
  for(let k=0;k<nb;k++){const a=Math.max(0,Math.floor(srcT(s,k)*E.fps)),b=Math.min(E.nf,Math.floor(srcT(s,k+1)*E.fps));let c=0;for(let i=a;i<b;i++)c+=E.va[i];f.va[k]=b>a?c/(b-a):0;
    f.rp.push(rhythmOf(E,srcT(s,k),srcT(s,k+1)))}
  f.E=E;
  return f;
}
/* ---------- analysis: stem envelopes (band-limited, 1024-sample frames) ----------
   vm = vocals stem 550 Hz–4 kHz (above a bass guitar's strong harmonics, which the quick split hands to its vocals stem), mm = mix in the same band, dl / dh = drums stem < 150 Hz / > 5 kHz (or the mix without stems).
   A frame "has the singer" when the vocals stem (7-frame median) carries ≥ 45 % of the mix's voice band (30 % with AI stems)
   AND ≥ 15 % of its own 95th percentile (the quick split also hands centred instruments to its vocals stem, hence the share
   test); runs < 120 ms are dropped, gaps < 250 ms bridged. Measured against the true vocal of the synthetic songs
   (tools/tests/fixtures/gen_styles.py): balanced accuracy .73–.81 with the quick split (.52–.60 with 300 Hz–3.4 kHz). */
function bq(type,f,sr,q){q=q||0.7071;const w=2*Math.PI*Math.min(f,sr*0.45)/sr,c=Math.cos(w),al=Math.sin(w)/(2*q),a0=1+al;
  const b=type==='lp'?[(1-c)/2,1-c,(1-c)/2]:[(1+c)/2,-(1+c),(1+c)/2];return [b[0]/a0,b[1]/a0,b[2]/a0,-2*c/a0,(1-al)/a0]}
function bandEnv(buf,chains,hop){
  const L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L,n=L.length,sr=buf.sampleRate,nf=Math.floor(n/hop);
  return chains.map(ch=>{const cs=ch.map(([t,f])=>bq(t,f,sr)),z=ch.map(()=>new Float64Array(4)),o=new Float32Array(nf);let acc=0;
    for(let i=0,fi=0,cnt=0;i<nf*hop;i++){let x=(L[i]+R[i])*0.5;
      for(let j=0;j<cs.length;j++){const c=cs[j],s=z[j],y=c[0]*x+c[1]*s[0]+c[2]*s[1]-c[3]*s[2]-c[4]*s[3];s[1]=s[0];s[0]=x;s[3]=s[2];s[2]=y;x=y}
      acc+=x*x;if(++cnt===hop){o[fi++]=Math.sqrt(acc/hop);acc=0;cnt=0}}
    return o});
}
function stemEnv(s){
  const sr=s.buffer.sampleRate,hop=Math.max(256,Math.round(1024*sr/44100)),fps=sr/hop,MID=[['hp',550],['hp',550],['lp',4000],['lp',4000]];
  const [mm]=bandEnv(s.buffer,[MID],hop);
  const dsrc=s.stems?s.stems.drums:s.buffer,h2=Math.max(256,Math.round(1024*dsrc.sampleRate/44100));
  const [dl,dh]=bandEnv(dsrc,[[['lp',150],['lp',150]],[['hp',5000],['hp',5000]]],h2);
  const nf=mm.length,E={hop,fps,nf,mm,dl,dh,va:new Uint8Array(nf),vp:new Uint8Array(nf),vm:null,kind:s.kind};
  if(s.stems){
    const [vm]=bandEnv(s.stems.vocals,[MID],Math.max(256,Math.round(1024*s.stems.vocals.sampleRate/44100)));E.vm=vm;
    const p95=pctl(vm,0.95)||1e-9,ai=s.kind==='ai'||s.kind==='tool';
    // share + level, each smoothed by a 7-frame median (syllables and note gaps are not phrase ends)
    const med7=a=>{const o=new Float32Array(nf),w=[];for(let i=0;i<nf;i++){w.length=0;for(let k=Math.max(0,i-3);k<=Math.min(nf-1,i+3);k++)w.push(a[k]);w.sort((x,y)=>x-y);o[i]=w[w.length>>1]}return o};
    const shr=new Float32Array(nf);for(let i=0;i<nf;i++)shr[i]=(vm[i]||0)/(mm[i]+1e-9);const sh7=med7(shr),lv7=med7(vm);
    // runs: drop < 120 ms, bridge gaps < 250 ms. va = "the singer" (few false alarms, misses ~40 % of sung frames in dense
    // mixes with the quick split); vp = "maybe the singer" (finds ~85–90 %, more false alarms): used where a miss costs more
    // than a false alarm — the tail / pickup / duck at a cut and the risk of a cut
    const runs=(raw,dst)=>{const mn=Math.round(0.12*fps),gap=Math.round(0.25*fps);
      for(let i=0;i<nf;){if(!raw[i]){i++;continue}let j=i;while(j<nf&&raw[j])j++;if(j-i>=mn)for(let q=i;q<j;q++)dst[q]=1;i=j}
      for(let i=0;i<nf;){if(dst[i]){i++;continue}let j=i;while(j<nf&&!dst[j])j++;if(i>0&&j<nf&&j-i<gap)for(let q=i;q<j;q++)dst[q]=1;i=j}};
    const raw=new Uint8Array(nf),rp=new Uint8Array(nf);
    for(let i=0;i<nf;i++){raw[i]=lv7[i]>0.15*p95&&sh7[i]>(ai?0.3:0.45)?1:0;rp[i]=lv7[i]>0.1*p95&&sh7[i]>(ai?0.22:0.35)?1:0}
    runs(raw,E.va);runs(rp,E.vp);
  }
  return E;
}
// drum-hit pattern of a bar: 16 steps × (lows, highs) of the rises of the drums envelopes, unit length (compares grooves)
function rhythmOf(E,t0,t1){
  const v=new Float32Array(32),a=Math.max(1,Math.floor(t0*E.fps)),b=Math.min(E.nf,Math.ceil(t1*E.fps)),d=(t1-t0)||1;
  for(let i=a;i<b;i++){const st=clamp(Math.floor(((i/E.fps)-t0)/d*16+0.5),0,15);
    const ol=Math.max(0,Math.log((E.dl[i]+1e-5)/(E.dl[i-1]+1e-5))),oh=Math.max(0,Math.log((E.dh[i]+1e-5)/(E.dh[i-1]+1e-5)));
    v[st]=Math.max(v[st],ol*Math.sqrt(E.dl[i]));v[16+st]=Math.max(v[16+st],oh*Math.sqrt(E.dh[i]))}
  let n=0;for(let i=0;i<32;i++)n+=v[i]*v[i];n=Math.sqrt(n)||1;for(let i=0;i<32;i++)v[i]/=n;return v;
}
// how alike two bars sound (0…1): harmony (chroma), groove (drum pattern) and the layers present (level per stem)
function barSim(f,i,j,layers){
  if(i<0||j<0||i>=f.nb||j>=f.nb)return 0;if(i===j)return 1;
  const ch=dot(f.ch[i],f.ch[j]),rp=dot(f.rp[i],f.rp[j]);
  const lv=['lo','dr','vo','md','hi','bs'].reduce((a,k)=>a+Math.abs((f[k][i]||0)-(f[k][j]||0)),0)/6,lev=1-Math.min(1,lv*1.6);
  if(layers==='d')return 0.7*rp+0.3*(1-Math.min(1,Math.abs(f.dr[i]-f.dr[j])*1.6));
  return 0.4*ch+0.35*rp+0.25*lev;
}
// how seamless a jump from bar kOut−1 to bar kIn is: the incoming bar sounds like what would have come next, or the bar before
// it like the one just played (classic loop points), or simply the same groove/harmony carries on (a drop restarting)
function seamOf(f,kOut,kIn,lay){return Math.max(0,barSim(f,kOut,kIn,lay),barSim(f,kOut-1,kIn-1,lay),0.92*barSim(f,kOut-1,kIn,lay))}
// the singer is heard at source time x (seconds)
const vocAt=(s,x)=>{const E=s.E;if(!E||!E.vm)return false;const i=Math.floor(x*E.fps);return i>=0&&i<E.nf&&!!E.va[i]};
// seconds of continuous (maybe-)singing from x forward (dir 1) / backward (dir −1), capped at `cap`
function vocRun(s,x,dir,cap,maybe){const E=s.E;if(!E||!E.vm)return 0;const A=maybe?E.vp:E.va;let i=Math.floor(x*E.fps),n=0;const m=Math.ceil(cap*E.fps);
  while(n<m&&i>=0&&i<E.nf&&A[i]){n++;i+=dir}return n/E.fps}
// sub-beat alignment of a join: how far (s, within ±12 ms) the drum hits right after the incoming downbeat sit from the hits the
// outgoing source would have played next. 1 ms onset envelopes (rises of the drums stem's level) of one beat before + one bar
// after both places are cross-correlated; constant detector bias cancels, an exact grid gives 0. Moved only when the match is
// clear (a live band: the average of its hits).
function onsetEnv(s,t0,t1){
  const buf=s.stems?s.stems.drums:s.buffer,sr=buf.sampleRate,L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L,H=Math.round(sr/1000);
  const i0=Math.floor(t0*sr),nf=Math.floor((t1-t0)*1000),e=new Float32Array(nf+4),on=new Float32Array(nf);
  for(let f=0;f<nf+4;f++){let q=0;const o=i0+(f-4)*H;for(let j=0;j<H;j++){const k=o+j;if(k>=0&&k<L.length){const x=L[k]+R[k];q+=x*x}}e[f]=Math.log(q/H+1e-9)}
  for(let f=0;f<nf;f++){const v=e[f+4]-Math.max(e[f],e[f+1]);on[f]=v>0?v:0}
  return on;
}
// lag (ms, ±M) that best lines up the hits of the bar starting at `si` with those of the bar starting at `sr`: smoothed
// 1 ms onset envelopes over one beat before + the bar; {lag, c (best normalised correlation), c0 (at lag 0)}
function lagOf(s,sr,si,M){
  const T=s.g.T,a=-T,z=4*T,W=s.drift||s.groove<0.5?6:1,sm=e=>{const o=new Float32Array(e.length);for(let i=0;i<e.length;i++){let v=0;for(let k=-W;k<=W;k++)v+=(e[i+k]||0)*(W+1-Math.abs(k));o[i]=v}return o};   // triangular smoothing: ±1 ms, ±6 ms for live playing (the average of jittered hits)
  const eo=sm(onsetEnv(s,sr+a-M/1000,sr+z+M/1000)),ei=sm(onsetEnv(s,si+a,si+z)),n=ei.length;
  let ni=0;for(let i=0;i<n;i++)ni+=ei[i]*ei[i];if(ni<1e-6)return {lag:0,c:0,c0:0};
  const cc=l=>{let v=0,no=0;for(let i=0;i<n;i++){const x=eo[i+M+l]||0;v+=ei[i]*x;no+=x*x}return no>1e-9?v/Math.sqrt(ni*no):0};
  let lag=0,c=-1;const c0=cc(0);for(let l=-M;l<=M;l++){const v=cc(l);if(v>c+1e-9){c=v;lag=l}}
  return {lag,c,c0};
}
// the join's shift: against the bar the outgoing source would have played next (kOut) and against its last bar (kOut−1, the
// only reference at the end of the song); the clearer match wins, moved only on a clear improvement (≥ 2 ms)
function relDbg(s,kOut,kIn){
  const nb=s.g.nb,M=12;if(kIn<0||kIn>=nb)return {shift:0};
  const si=srcT(s,kIn),r=[];
  // only against a bar with the same drum pattern (a different pattern lines up wrongly: measured on a live track, where the
  // drift-corrected grid is already within the players' own ±7 ms)
  const same=k=>barSim(s.f,k,kIn,'d')>=0.85;
  if(kOut>=1&&kOut<nb&&same(kOut))r.push({ref:'next',...lagOf(s,srcT(s,kOut),si,M)});
  if(kOut-1>=0&&kOut-1<nb&&same(kOut-1))r.push({ref:'last',...lagOf(s,srcT(s,kOut-1),si,M)});
  const ok=r.filter(x=>x.c>0.5&&x.c>x.c0+0.04&&Math.abs(x.lag)>=2).sort((x,y)=>y.c-x.c);
  const best=r.slice().sort((x,y)=>y.c-x.c)[0];
  // a clear match at lag ~0 (the grid is right) wins over a weaker shifted one. lag > 0 = the outgoing hits sit later on their
  // grid than the incoming ones → the incoming source starts that much earlier (its hits then land later)
  const shift=ok.length&&!(best&&best.c>ok[0].c+0.02&&Math.abs(best.lag)<2)?-ok[0].lag/1000:0;
  return {shift,r};
}
const relShift=(s,kOut,kIn)=>relDbg(s,kOut,kIn).shift;
// a bar "has vocals": the singer is heard in a good part of it (band-limited vocals stem against the mix, see stemEnv)
const vocalBar=(f,k)=>f.va?f.va[k]>0.3:f.vo[k]>0.35&&f.pv[k]>0.2;
function secStats(f,x){
  const a=x.a,b=Math.max(x.a+1,x.b),h=Math.floor((a+b)/2);let voc=0;for(let k=a;k<b;k++)if(vocalBar(f,k))voc++;
  const r={lo:meanOf(f.lo,a,b),dr:meanOf(f.dr,a,b),vo:meanOf(f.vo,a,b),md:meanOf(f.md,a,b),hi:meanOf(f.hi,a,b),fu:meanOf(f.fu,a,b),bs:meanOf(f.bs,a,b),
    voc:voc/(b-a),len:b-a,hiSlope:meanOf(f.hi,h,b)-meanOf(f.hi,a,h)};
  r.E=0.45*r.lo+0.35*r.dr+0.2*r.fu;return r;
}
function chromaMean(f,a,b){const v=new Float32Array(24);a=Math.max(0,a);b=Math.min(f.nb,b);for(let k=a;k<b;k++)for(let p=0;p<24;p++)v[p]+=f.ch[k][p];let n=0;for(let p=0;p<24;p++)n+=v[p]*v[p];n=Math.sqrt(n)||1;for(let p=0;p<24;p++)v[p]/=n;return v}
const dot=(x,y)=>{let s=0;for(let i=0;i<x.length;i++)s+=x[i]*y[i];return s};

/* ---------- analysis: sections ---------- */
function segment(f,cues){
  const {s0,e0}=f,end=e0+1,W=4;
  const vec=k=>[f.lo[k]*1.2,f.dr[k],f.vo[k]*1.2,f.md[k]*0.6,f.hi[k]*0.6,f.fu[k]*0.8];
  const meanV=(a,b)=>{a=Math.max(s0,a);b=Math.min(end,b);if(b<=a)return null;const m=[0,0,0,0,0,0];for(let k=a;k<b;k++){const v=vec(k);for(let i=0;i<6;i++)m[i]+=v[i]}return m.map(x=>x/(b-a))};
  const nov=new Float32Array(end+5);
  for(let k=s0+1;k<end;k++){const A=meanV(k-W,k),Bv=meanV(k,k+W);if(!A||!Bv)continue;let d=0;for(let i=0;i<6;i++)d+=Math.abs(A[i]-Bv[i]);d+=0.6*(1-dot(chromaMean(f,Math.max(s0,k-W),k),chromaMean(f,k,Math.min(end,k+W))));nov[k]=d}
  const cueBars=(cues||[]).filter(c=>c.k!=='intro'&&c.bar>s0&&c.bar<end).map(c=>c.bar);
  let anc=mod(s0,4),best=-1;
  for(let a=0;a<4;a++){let sc=mod(s0-a,4)===0?0.25:0;for(let k=s0+1;k<end;k++)if(mod(k-a,4)===0)sc+=nov[k]*nov[k];for(const c of cueBars)if(mod(c-a,4)===0)sc+=0.5;if(sc>best+1e-9){best=sc;anc=a}}
  const p95=pctl(Array.from(nov).filter(x=>x>0),0.95)||1,thr=p95/3;
  const bd=new Set();
  for(let k=s0+1;k<end;k++){
    if(mod(k-anc,4)===0){if(nov[k]>=thr&&nov[k]>=0.55*Math.max(nov[k-4]||0,nov[k+4]||0))bd.add(k)}
    else if(nov[k]>thr*1.4){const l=k-mod(k-anc,4),r=l+4;if(nov[k]>1.5*Math.max(nov[l]||0,nov[r]||0))bd.add(k)}
  }
  for(const c of cueBars){const d=mod(c-anc,4),sn=d===1?c-1:d===3?c+1:c;bd.add(sn>s0&&sn<end?sn:c)}
  let segs=[],a=0;for(const k of [...bd].sort((x,y)=>x-y)){if(k>a){segs.push({a,b:k});a=k}}if(end>a)segs.push({a,b:end});
  const dist=(x,y)=>{const A=meanV(x.a,x.b),Bv=meanV(y.a,y.b);if(!A||!Bv)return 9;let d=0;for(let i=0;i<6;i++)d+=Math.abs(A[i]-Bv[i]);return d};
  for(let guard=0;guard<200;guard++){
    const i=segs.findIndex((s,j)=>s.b-s.a<4&&segs.length>1&&!(j===0&&s.b<=s0));if(i<0)break;
    const s=segs[i],L=segs[i-1],R=segs[i+1],j=!L?i+1:!R?i-1:dist(s,L)<=dist(s,R)?i-1:i+1;
    segs.splice(Math.min(i,j),2,{a:Math.min(segs[j].a,s.a),b:Math.max(segs[j].b,s.b)});
  }
  for(let guard=0;guard<40;guard++){
    const i=segs.findIndex(s=>s.b-s.a>32);if(i<0)break;const s=segs[i];let bk=-1,bv=0;
    for(let k=s.a+8;k<=s.b-8;k++)if(mod(k-anc,4)===0&&nov[k]>bv){bv=nov[k];bk=k}
    if(bk<0||bv<0.4*thr)bk=s.a+16;if(s.b-bk<4)break;
    segs.splice(i,1,{a:s.a,b:bk},{a:bk,b:s.b});
  }
  return {segs,anc,nov,thr};
}
function label(segs,f){
  const n=segs.length,st=segs.map(x=>secStats(f,x)),lab=new Array(n).fill(null);
  const maxE=Math.max(...st.map(x=>x.E),1e-9),hot=x=>x.lo>=0.5&&x.E>=0.6*maxE;
  // club structure: a hot section right after a stretch without bass that is unsung or rising (a build → drop), or no vocals at
  // all. Not the section after the intro (a pop song whose intro has no bass is no club track), not after a flat sung bridge (pop)
  const club=st.some((x,i)=>i>1&&hot(x)&&st[i-1].lo<0.45&&(st[i-1].voc<0.5||st[i-1].hiSlope>0.06)&&x.lo-st[i-1].lo>0.35)||st.every(x=>x.voc<0.3);
  let lastHot=-1;st.forEach((x,i)=>{if(hot(x))lastHot=i});
  for(let i=n-1;i>0;i--){if(i>lastHot&&lastHot>=0&&(st[i].lo<0.5||st[i].E<0.6*maxE))lab[i]='outro';else break}
  if(n>1)lab[0]='intro';
  for(let i=1,tot=segs[0].b;i<n&&!lab[i]&&st[i].voc<0.3&&!hot(st[i])&&segs[i].b<=32&&tot<32;i++){lab[i]='intro';tot=segs[i].b}
  const out=[];
  for(let i=0;i<n;i++){
    let l=lab[i];const x=st[i],nx=st[i+1],nh=!!nx&&hot(nx)&&lab[i+1]!=='outro',pv=out.length?out[out.length-1]:null;
    if(!l){
      if(hot(x))l=club||x.voc<0.3?'drop':'chorus';
      else if(x.lo<0.45){
        if(nh&&(x.len<=8||x.hiSlope>0.1))l='build';
        else if(club&&pv&&(pv.lab==='drop'||pv.lab==='chorus')&&!(nh&&x.len>=16&&secStats(f,{a:segs[i].b-8,b:segs[i].b}).hiSlope>0.06))l='break';
        else if(nh&&x.len>=16&&x.voc<0.4){const a2=segs[i].b-8,s2=secStats(f,{a:a2,b:segs[i].b});if(s2.hiSlope>0.06){out.push({a:segs[i].a,b:a2,lab:'break'});out.push({a:a2,b:segs[i].b,lab:'build'});continue}l='break'}
        else l=x.voc>=0.4?'verse':'break';
      }else{
        if(x.voc>=0.4)l=nh&&x.len<=8&&pv&&pv.lab==='verse'?'pre':'verse';
        else if(nh&&x.hiSlope>0.08)l='build';
        else l=club&&pv&&(pv.lab==='drop'||pv.lab==='chorus')&&x.E<0.75*st[i-1].E?'break':'verse';
      }
    }
    out.push({a:segs[i].a,b:segs[i].b,lab:l});
  }
  // vocal pop: repeats of a chorus → chorus; one late, one-off vocal section → bridge
  if(!club){
    const C=out.map(s=>({c:chromaMean(f,s.a,s.b),E:secStats(f,s).E}));
    out.forEach((s,i)=>{if(s.lab!=='verse')return;for(let j=0;j<out.length;j++)if(out[j].lab==='chorus'&&dot(C[i].c,C[j].c)>0.96&&Math.abs(C[i].E-C[j].E)<0.1){s.lab='chorus';break}});
    const chs=out.map((s,i)=>s.lab==='chorus'?i:-1).filter(i=>i>=0);
    if(chs.length>=2)out.forEach((s,i)=>{if(i<=chs[1]||s.lab!=='verse')return;if(out.every((o,j)=>j===i||dot(C[i].c,C[j].c)<0.9))s.lab='bridge'});
  }
  return out;
}
// scoreOnly: just the score of s's current grid (+ s.drift), used to keep a drift correction only when it fits the hits better
function groove(s,scoreOnly){
  const w=s.an.wave;if(!w||!w.len)return {g:0,sc:0,drift:null};
  const rate=w.rate,n=w.len,o=new Float32Array(n);
  // band envelopes smoothed over 3 frames (20 ms) so low-note ripple doesn't count as hits
  const sm=x=>{const y=new Float32Array(n);for(let j=0;j<n;j++)y[j]=((x[j-1]||x[j])+x[j]+(x[j+1]||x[j]))/3;return y},lo=sm(w.low),hi=sm(w.high),am=sm(w.amp);
  for(let j=2;j<n;j++)o[j]=Math.max(0,lo[j]-lo[j-2])+0.7*Math.max(0,hi[j]-hi[j-2])+0.3*Math.max(0,am[j]-am[j-2]);
  // onset peaks: local maxima (±20 ms) clearly above the local mean (±0.5 s); noise, vibrato and swells stay out
  const cs=new Float64Array(n+1);for(let j=0;j<n;j++)cs[j+1]=cs[j]+o[j];
  const pk=[];for(let j=3;j<n-3;j++){const v=o[j];if(v<=0)continue;let m=true;for(let d=-3;d<=3;d++)if(d&&o[j+d]>v){m=false;break}if(!m)continue;
    const a=Math.max(0,j-75),z=Math.min(n,j+76),mu=(cs[z]-cs[a])/(z-a);if(v>1.8*mu+0.01)pk.push(j)}
  const T=s.g.T,sub=T/4,fd=s.g.fd,SIG=0.02,tj=j=>(j-0.5)/rate;   // a 2-frame rise is centred half a frame earlier
  const off=j=>s.drift?s.drift[clamp(Math.floor((tj(j)-fd)/s.g.B),0,s.drift.length-1)]:0;
  let sw=0,so=0;for(const j of pk){const tt=tj(j)-fd-off(j),d=Math.abs(tt-Math.round(tt/sub)*sub);sw+=o[j]*Math.exp(-0.5*(d/SIG)**2);so+=o[j]}
  let base=0;for(let i=0;i<200;i++){const d=(i+0.5)/200*sub/2;base+=Math.exp(-0.5*(d/SIG)**2)}base/=200;
  const sc=so?clamp((sw/so-base)/(1-base),0,1):0;
  if(scoreOnly){const mx=s.drift?pctl(Array.from(s.drift).map(Math.abs),1):0;return {sc,g:clamp(sc*(1-clamp((mx-0.01)/0.04,0,0.6)),0,1)}}
  // drift: the beat phase per 2-bar window, folded on the BEAT (not the 16th, so it can grow past a 16th: a live band drifts by
  // hundreds of ms), tracked across windows by dynamic programming (a smooth path; windows without hits just carry it), unwrapped
  // and centred on whole beats. A straight-line part is a slightly wrong BPM: folded into the bar length (`fit`), so the
  // original keeps its own tempo; only the rest becomes per-bar offsets.
  const B=s.g.B,nb=s.g.nb,WB=2,ST=0.004,NC=Math.max(8,Math.round(T/ST)),sig2=0.012,win=[],em=[];
  for(let k=0;k+WB<=nb;k+=WB){const a=fd+k*B,z=fd+(k+WB)*B,ps=pk.filter(j=>tj(j)>=a&&tj(j)<z);let mass=0;for(const j of ps)mass+=o[j];
    if(ps.length<6||mass<so/Math.max(1,nb/WB)*0.35){win.push(null);em.push(null);continue}
    const e=new Float32Array(NC);let mx2=1e-9;
    for(let c=0;c<NC;c++){const dl=(c/NC-0.5)*T;let v=0;for(const j of ps){const tt=tj(j)-fd-dl,d=Math.abs(tt-Math.round(tt/T)*T);v+=o[j]*Math.exp(-0.5*(d/sig2)**2)}e[c]=v;if(v>mx2)mx2=v}
    for(let c=0;c<NC;c++)e[c]/=mx2;em.push(e);win.push(0)}
  let drift=null,fit=null;const nv=em.filter(Boolean).length;
  if(nv>=3){
    const wr=c=>{c=mod(c,NC);return c>NC/2?c-NC:c},lam=0.08/((NC/8)**2);   // steps up to a quarter beat per window (≈ 3 % tempo); a step of an eighth beat costs 0.08 (a clean hit = 1)
    let sc0=new Float32Array(NC),bk=[];
    for(let i=0;i<em.length;i++){const e=em[i],nx=new Float32Array(NC),from=new Int16Array(NC);
      for(let c=0;c<NC;c++){let bv=-1e9,bi=c;for(let d=-Math.floor(NC/4);d<=Math.floor(NC/4);d++){const q=mod(c+d,NC),v=sc0[q]-lam*d*d;if(v>bv){bv=v;bi=q}}nx[c]=bv+(e?e[c]:0);from[c]=bi}
      sc0=nx;bk.push(from)}
    let c=0;for(let q=1;q<NC;q++)if(sc0[q]>sc0[c])c=q;const path=new Array(em.length);
    for(let i=em.length-1;i>=0;i--){path[i]=c;c=bk[i][c]}
    const un=[(path[0]/NC-0.5)*T];for(let i=1;i<path.length;i++)un.push(un[i-1]+wr(path[i]-path[i-1])/NC*T);
    const pts=un.map((x,i)=>em[i]?{k:i*WB+WB/2,x}:null).filter(Boolean),med=pctl(pts.map(p=>p.x),0.5),sh=Math.round(med/T)*T;
    pts.forEach(p=>{p.x-=sh});un.forEach((x,i)=>{if(win[i]!=null)win[i]=x-sh});
    if(pts.filter(p=>Math.abs(p.x)>0.015).length>=2){     // a real drift
      let sk=0,sx=0,skk=0,skx=0;for(const p of pts){sk+=p.k;sx+=p.x;skk+=p.k*p.k;skx+=p.k*p.x}const n=pts.length,den=n*skk-sk*sk;
      const be=den>1e-9?(n*skx-sk*sx)/den:0,al=(sx-be*sk)/n;
      if(Math.abs(be)*nb>0.03&&Math.abs(be)<0.02*B){const a2=fd+al>=0?al:0;fit={B:B+be,fd:fd+a2};for(const p of pts)p.x-=a2+be*p.k}   // ≥ 30 ms over the song, < 2 % tempo
      if(fit||pts.some(p=>Math.abs(p.x)>0.015)){
        drift=new Float32Array(nb+1);
        for(let k=0;k<=nb;k++){let p=pts[0],q=pts[pts.length-1];if(pts.length>1){if(k<=pts[0].k){p=pts[0];q=pts[1]}else if(k>=q.k){p=pts[pts.length-2]}else for(let i=0;i+1<pts.length;i++)if(pts[i].k<=k&&pts[i+1].k>=k){p=pts[i];q=pts[i+1];break}}
          drift[k]=p===q||q.k===p.k?p.x:p.x+(q.x-p.x)*(k-p.k)/(q.k-p.k)}   // linear between the windows, extrapolated at the ends
      }
    }
  }
  const mx=pctl(win.filter(x=>x!=null).map(Math.abs),1)||0;
  return {g:clamp(sc*(1-clamp((mx-0.01)/0.04,0,0.6)),0,1),sc,drift,fit,win};
}
function phraseLock(secs,s0){
  const inner=secs.slice(1).map(x=>x.a).filter(b=>b>s0);if(!inner.length)return 1;
  return inner.reduce((a,b)=>{const d=b-s0;return a+(mod(d,8)===0?1:mod(d,4)===0?0.75:mod(d,2)===0?0.25:0)},0)/inner.length;
}

/* ---------- arrangement ---------- */
const fullMask=null,M_D={vocals:0,drums:1,bass:0,other:0},M_DB={vocals:0,drums:1,bass:1,other:0},M_I={vocals:0,drums:1,bass:1,other:1};
const maskKey=m=>m?IDS.filter(id=>m[id]).join('+'):'full';
const sameLayers=(a,b)=>maskKey(a.mask)===maskKey(b.mask)&&(a.eq||'')===(b.eq||'')&&(a.ft||'')===(b.ft||'');
const isAI=s=>s.kind==='ai'||s.kind==='tool';
const dB=x=>20*Math.log10(Math.max(1e-7,x));
// level of a set of stems over bars [a,b): √Σ rms² (stems ≈ uncorrelated); the mix when mask = null
function layerLvl(s,mask,a,b){const f=s.f;a=clamp(a,0,f.nb-1);b=clamp(b,a+1,f.nb);
  if(!mask||!f.st)return meanOf(f.mix,a,b);let q=0;for(const id of IDS)if(mask[id]){const m=meanOf(f.st[id],a,b);q+=m*m}return Math.sqrt(q)}
/* loop candidates of L bars for a DJ intro/outro: on the phrase lattice, drums steady, no singer (heavily weighted with the
   quick split: its drums stem still carries consonants and short syllables), a SEAMLESS end (the bar after the loop sounds
   like its first bar, so jumping back is what the ear expects) and a steady groove inside. `clean` = the mix itself has only
   what the stage needs there (no singer, no other music → the mix is used: no separation artefacts, the kick keeps its body). */
function loopCands(s,secs,L,want,role){
  const f=s.f,out=[],wv=isAI(s)?1:2.6,anc=s.anc||0,secAt=k=>secs.findIndex(x=>k>=x.a&&k<x.b),n=f.nb;
  for(let a=Math.max(f.s0,0);a+L<=f.e0+1;a++){
    if(mod(a-anc,4))continue;
    const i0=secAt(a),i1=secAt(a+L-1);if(i0<0||i1<0)continue;
    let bad=false;for(let i=i0;i<=i1;i++){const l=secs[i].lab;if(l==='build'||(l==='break'&&want!=='inst'))bad=true}if(bad)continue;
    const d=meanOf(f.dr,a,a+L);if(want!=='inst'&&d<0.25)continue;
    let vv=0;for(let k=a;k<a+L;k++)vv+=(f.dr[k]-d)**2;const cv=Math.sqrt(vv/L)/(d+1e-6);
    const va=meanOf(f.va,a,a+L),md=meanOf(f.md,a,a+L),bs=meanOf(f.bs,a,a+L),lay=want==='d'?'d':'f',T=s.g.T;
    const edge=Math.max(vocShare(s,srcT(s,a+L)-T,srcT(s,a+L),true),vocShare(s,srcT(s,a),srcT(s,a)+T*0.5,true));
    const seam=a+L<n?0.6*barSim(f,a+L,a,lay)+0.4*barSim(f,a+L-1,a-1>=0?a-1:a+L-1,lay):barSim(f,a+L-1,a+3<a+L?a+3:a,lay)*0.8;
    let stab=0;for(let k=a+1;k<a+L;k++)stab+=dot(f.rp[k],f.rp[a]);stab/=Math.max(1,L-1);
    const clean=va<0.04&&edge<0.1&&(want==='d'?md<0.15&&bs<0.2:want==='db'?md<0.15:true);
    let sc=d-wv*va-wv*0.6*edge-0.5*cv+0.9*seam+0.3*stab+(clean?0.3:0)+(L>=8?0.25:0);
    if(want==='db')sc+=0.4*bs;if(want==='inst')sc+=0.3*bs+0.3*md;if(want==='d')sc-=0.15*md;
    sc+=role==='outro'?0.15*(a/n):0.15*(1-a/n);
    if(mod(a-secs[i0].a,8)===0)sc+=0.05;
    out.push({a,b:a+L,sec:i0,sc,seam,va,clean,d,edge});
  }
  return out.sort((x,y)=>y.sc-x.sc);
}
function pickLoop(s,secs,L,want,role){
  const lens=[L,8,4].filter((x,i,arr)=>x<=L&&arr.indexOf(x)===i),c=[].concat(...lens.map(l=>loopCands(s,secs,l,want,role).map(x=>({...x,L:l})))).sort((x,y)=>y.sc-x.sc);
  const sub=x=>{const T=s.g.T,e=srcT(s,x.b);x.subLast=x.L>=4&&vocShare(s,e-T,e,true)>0.25&&vocShare(s,srcT(s,x.b-1)-T,srcT(s,x.b-1),true)<0.15;
    if(x.subLast)x.clean=false;return x};
  if(c.length){const A=sub(c[0]),l=A.L;let B=null;   // a second, similar phrase of the same length to alternate with (variation, same groove)
    for(const x of c.slice(1,60)){if(x.L===l&&Math.abs(x.a-A.a)>=l&&x.sc>=A.sc-0.35&&barSim(s.f,x.a,A.a,want==='d'?'d':'f')>=0.82&&x.va<=A.va+0.05&&x.edge<=A.edge+0.05){B=sub(x);break}}
    return {A,B,L:l}}
  const x=secs[0];return {A:{a:x.a,b:Math.min(x.b,x.a+4),sec:0,sc:0,seam:0,va:0,clean:false,edge:0},B:null,L:Math.min(4,x.b-x.a)};
}
/* stages of a DJ intro / outro (bars from its start; every change on a phrase line): eq 'kh' = kick + hats (a wide cut around
   1.4 kHz takes out claps, snare body and most of the bleed), then the full kit, then bass, then the music; 'lp'/'hp' sweeps */
function stagesOf(style,role,n,cleanMusic){
  const P=n>=16?8:4,ph=Math.max(1,Math.round(n/P)),at=i=>Math.min(n,i*P),half=at(Math.ceil(ph/2));
  const I=cleanMusic?M_I:M_DB;let st;
  if(role==='intro'){
    if(style==='drums')st=n>=16?[[0,P,M_D,'kh'],[P,n,M_D]]:[[0,n,M_D]];
    else if(style==='db')st=n>=16?[[0,P,M_D,'kh'],[P,half,M_D],[half,n,M_DB]]:[[0,half,M_D],[half,n,M_DB]];
    else if(style==='full')st=n>=32?[[0,P,M_D,'kh'],[P,2*P,M_D],[2*P,n-P,M_DB],[n-P,n,I]]:n>=16?[[0,P,M_D],[P,n-P/2,M_DB],[n-P/2,n,I]]:[[0,half,M_D],[half,n,M_DB]];
    else if(style==='filt')st=n>=16?[[0,n-P,I,null,'lp',380,380],[n-P,n,I,null,'lp',380,18000]]:[[0,n,I,null,'lp',380,18000]];
    else st=[[0,half,M_D,null,'hp',300,300],[half,n,M_D]];   // percussion: no kick, then the full kit
  }else{
    if(style==='drums')st=n>=32?[[0,P,M_DB],[P,n-P,M_D],[n-P,n,M_D,'kh']]:n>=16?[[0,P,M_D],[P,n,M_D,'kh']]:[[0,n,M_D]];
    else if(style==='db')st=n>=32?[[0,2*P,M_DB],[2*P,n-P,M_D],[n-P,n,M_D,'kh']]:n>=16?[[0,P,M_DB],[P,n,M_D]]:[[0,half,M_DB],[half,n,M_D]];
    else if(style==='full')st=n>=32?[[0,P,I],[P,2*P,M_DB],[2*P,n-P,M_D],[n-P,n,M_D,'kh']]:n>=16?[[0,P/2,I],[P/2,P,M_DB],[P,n,M_D]]:[[0,half,M_DB],[half,n,M_D]];
    else if(style==='filt')st=n>=16?[[0,P,I],[P,n,I,null,'lp',18000,380]]:[[0,n,I,null,'lp',18000,380]];
    else st=[[0,half,M_D],[half,n,M_D,null,'hp',300,300]];
  }
  return st.filter(x=>x[1]>x[0]).map(([a,b,mask,eq,ft,f0,f1])=>({a,b,mask,eq:eq||null,ft:ft||null,f0,f1}));
}
// DJ intro / outro of n bars: the loop (alternating with a similar phrase B) through the stages; level of each stage matched to
// the same stems in the original next to it (`ref` bars), cut into blocks at every loop seam / stage change
function loopRun(s,secs,n,style,role,ref){
  const want=style==='db'?'db':style==='full'||style==='filt'?'inst':'d';
  const lp=pickLoop(s,secs,n>=16?8:4,want,role),L=lp.L;
  const cleanMusic=isAI(s)||(lp.A.va<0.05&&(!lp.B||lp.B.va<0.05));   // the quick split leaves the singer in 'other': no music stage then
  const st=stagesOf(style,role,n,cleanMusic),out=[];
  for(const g of st){
    // the mix itself when it has nothing the stage would remove (cleanest); else the stems
    const useMix=lp.A.clean&&(!lp.B||lp.B.clean)&&(g.mask===M_D?true:g.mask===M_DB);
    const mask=useMix?fullMask:g.mask,lv=lp2=>layerLvl(s,g.mask,lp2.a,lp2.b);   // levels always compare the stage's own stems
    const tgt=ref?layerLvl(s,g.mask,ref[0],ref[1]):0;
    for(let j=g.a;j<g.b;){
      const ph=Math.floor(j/L),src=lp.B&&ph%2===1?lp.B:lp.A,pos0=mod(j,L),sl=src.subLast&&L>=4;
      const last=sl&&pos0===L-1,pos=last?L-2:pos0,step=last?1:Math.min(g.b-j,(sl?L-1:L)-pos0);
      const bleedy=!useMix&&s.kind==='quick'&&mask&&mask.drums&&!mask.vocals&&meanOf(s.f.va,src.a,src.b)>0.12;
      const own=lv(src),gain=tgt>0.35*own&&own>1e-6?clamp(tgt/own,0.5,1.6):1;   // those stems absent next to it: keep the loop's own level
      const fx=g.ft?{t:g.ft,f0:g.f0*Math.pow(g.f1/g.f0,(j-g.a)/(g.b-g.a)),f1:g.f0*Math.pow(g.f1/g.f0,(j+step-g.a)/(g.b-g.a))}:null;
      out.push({role,sec:src.sec,sa:src.a+pos,sb:src.a+pos+step,mask,lay:g.mask,eq:g.eq||(bleedy?'kb':null),fx,ft:g.ft,gain,stage:g.a,useMix});j+=step;
    }
  }
  return {blocks:out,loop:lp};
}
/* body: whole phrases repeated where the track itself would allow it. Candidate = the last w bars of a section, played again
   right after it (the original then continues where it was: one new join, from bar b−1 to bar b−w). Scored by how seamless the
   jump is (bar b−w vs the bar the ear expects, b; and what precedes each), by the singer (no line may run over the cut by more
   than the 1-beat tail, no pickup longer than a beat may be lost) and by musical sense (drops/choruses first, breaks next,
   at most two repeats per section). */
// share of frames with the singer in source [t0,t1)
function vocShare(s,t0,t1,maybe){const E=s.E;if(!E||!E.vm)return 0;const A=maybe?E.vp:E.va,a=Math.max(0,Math.floor(t0*E.fps)),z=Math.min(E.nf,Math.ceil(t1*E.fps));let c=0;for(let i=a;i<z;i++)c+=A[i];return z>a?c/(z-a):0}
// the singer at a cut (source times so = where the outgoing would go on, si = where the incoming starts):
//  outgoing line that began more than a beat before `so` and goes on > a beat after it → cut mid-line (risk 1); ≤ a beat after
//  it → its last word rings on (tail, vocals stem, ≤ 1 beat). A line that began within the last beat before `so` is the
//  PICKUP of the next phrase → the outgoing side drops its vocals from there (duck: mix minus vocals for ≤ 1 beat) instead of
//  playing "and-" then cutting. Incoming line that began ≤ a beat before `si` → its pickup is laid in (pre) and the
//  outgoing vocals step aside for it (duck); began earlier → entered mid-line (risk 1).
function joinVocal(s,so,si,outVox,inVox){
  const T=s.g.T,M=true;let rOut=0,rIn=0,tail=0,pre=0,duck=0;
  if(outVox&&vocShare(s,so-0.12,so+0.12,M)>0.4){
    const back=vocRun(s,so-0.02,-1,2*T,M),fwd=vocRun(s,so,1,2*T,M);
    if(back<=T&&back>0.02)duck=Math.min(T,back+0.04);                 // a pickup into what follows: leave it out
    else if(fwd>T&&back>T)rOut=vocShare(s,so-T,so+T)>0.5?1:0.5;        // the middle of a line (certain / likely)
    else if(fwd>0.02){tail=Math.min(T,Math.max(fwd+0.12,0.35*T));rOut=0.1}}
  if(inVox&&vocShare(s,si-0.15,si+0.1,M)>0.4){
    const back=vocRun(s,si-0.02,-1,2*T,M),fwd=vocRun(s,si,1,T,M),outBusy=outVox&&!duck&&vocShare(s,so-Math.min(T,back+0.05),so,M)>0.5;
    if(back>T&&fwd>0.05)rIn=vocShare(s,si-T,si+T)>0.5?1:0.5;
    else if(back>0.02){pre=Math.min(T,back+0.06);rIn=outBusy?0.15:0.1}}
  // the incoming pickup always gets the stage: the outgoing vocals step aside for it (no two lines at once, and an outgoing
  // pickup the detector missed goes too)
  if(pre>0&&outVox){duck=Math.max(duck,pre);if(tail>0)tail=0}
  return {rOut,rIn,risk:Math.max(rOut,rIn),tail,pre,duck};
}
function bodyCands(s,secs,club,used){
  const f=s.f,out=[],secAt=k=>secs.findIndex(x=>k>=x.a&&k<x.b);
  const pref={drop:0.35,chorus:0.35,break:0.15,verse:0.02,pre:-0.25,bridge:-0.2,build:-0.6,intro:-0.8,outro:-0.8};
  secs.forEach((x,i)=>{const u=used[i]||0;if(u>=2||pref[x.lab]==null||pref[x.lab]<=-0.6)return;
    for(const w of [16,8,4]){const b=x.b,a=b-w;if(a<Math.max(f.s0,0))continue;
      const ia=secAt(a);if(ia<0||secs[ia].lab==='intro'||secs[ia].lab==='outro')continue;
      if(ia!==i&&w<8)continue;
      const seam=seamOf(f,b,a,'f'),v=joinVocal(s,srcT(s,b),srcT(s,a),true,true),head=a===secs[ia].a?0.1:0;
      const L=k=>dB(f.mix[clamp(k,0,f.nb-1)]||1e-7),jump=Math.abs(L(a)-L(b-1)),nat=a>0?Math.abs(L(a)-L(a-1)):0;   // the incoming bar's own step
      const jolt=Math.max(0,jump-Math.max(1.5,nat));if(jolt>6)continue;   // a quiet breakdown straight after a full chorus: never
      const sc=1.2*seam-2*v.risk-0.15*jolt-(seam<0.7?0.6:0)+(pref[x.lab]||0)+(club&&x.lab==='break'?0.05:0)-0.8*u+(w===16?0.1:w===8?0.04:0)+head;
      out.push({i,w,a,b,sc,seam,risk:v.risk})}});
  return out.sort((p,q)=>q.sc-p.sc);
}
function makePlan(s,set,secs){
  const g=s.g,B=g.B,n=secs.length,f=s.f,st=secs.map(x=>secStats(f,x));
  const friendly=i=>st[i].dr>=0.3&&st[i].voc<0.25;
  const orig=secs.map((x,i)=>[{role:'orig',sec:i,sa:x.a,sb:x.b,mask:fullMask,fx:null}]);   // per section: its blocks (repeats go after)
  const rep=(i,w,role,span)=>{const x=secs[i];if(!span)w=Math.min(w,x.b-x.a);if(w<4||x.b-w<0)return 0;orig[i].push({role:role||'rep',sec:i,sa:x.b-w,sb:x.b,mask:fullMask,fx:null});return w};
  const target=set.add==='custom'?clamp(+set.custom||0,0,600):+set.add;
  const N=set.intro,Z=set.outro;
  const first=secs[0],last=secs[n-1];
  let intro=[],outro=[],addBars=0,cycle=[],loops={};
  // intro
  const L0=first.lab==='intro'?first.b-Math.max(first.a,f.s0):0;
  const s0=Math.max(first.a,f.s0);
  if(set.is==='orig'){if(L0&&L0<N){let need=N-L0;const ph=L0>=8?8:4;while(need>=4){const w=Math.min(ph,need-need%4);if(rep(0,w)<4)break;addBars+=w;need-=w}}}
  let needI=0,needZ=0;const zEnd=Math.min(f.e0+1,last.b);
  const mkIntro=n=>{const r=loopRun(s,secs,n,set.is,'intro',[s0,s0+4]);intro=r.blocks;loops.intro=r.loop};
  const mkOutro=n=>{const r=loopRun(s,secs,n,set.os,'outro',[zEnd-4,zEnd]);outro=r.blocks;loops.outro=r.loop};
  if(set.is!=='orig'){needI=Math.ceil((first.lab==='intro'&&friendly(0)?Math.max(0,N-L0):N)/4)*4;if(needI>0){mkIntro(needI);addBars+=needI}}
  // outro
  const Lz=last.lab==='outro'?last.b-last.a:0;
  if(set.os==='orig'){if(Lz&&Lz<Z){let need=Z-Lz;const ph=Lz>=8?8:4;while(need>=4){const w=Math.min(ph,need-need%4);if(rep(n-1,w)<4)break;addBars+=w;need-=w}}}
  else{const fr=last.lab==='outro'&&friendly(n-1);needZ=Math.ceil((fr?Math.max(0,Z-Lz):Z)/4)*4;if(needZ>0){mkOutro(needZ);addBars+=needZ}}
  // body: whole phrases until the requested length
  let rem=Math.round(target/B)-addBars;
  const idx=l=>secs.map((x,i)=>l.includes(x.lab)?i:-1).filter(i=>i>=0);
  const drops=idx(['drop','chorus']);
  const club=secs.some(x=>x.lab==='drop');
  if(set.preset==='perf'&&drops.length&&rem>=8){
    const ld=drops[drops.length-1],bi=ld-1>=0&&secs[ld-1].lab==='build'?ld-1:-1;
    const dl=Math.min(16,secs[ld].b-secs[ld].a,Math.max(4,Math.floor((rem-(bi>=0?Math.min(8,secs[bi].b-secs[bi].a):0))/4)*4));
    if(bi>=0){const w=Math.min(8,secs[bi].b-secs[bi].a);cycle.push({role:'cycle',sec:bi,sa:secs[bi].b-w,sb:secs[bi].b,mask:fullMask,fx:null});rem-=w}
    if(dl>=4){cycle.push({role:'cycle',sec:ld,sa:secs[ld].a,sb:secs[ld].a+dl,mask:fullMask,fx:null});rem-=dl}
    if(cycle.length){orig[ld].push(...cycle)}
  }
  /* 1) repeats that cut no sung line; 2) what is still missing goes to the DJ intro / outro (8-bar phrases, up to 64 bars: a
     longer mixable intro beats a repeat that chops the singer); 3) only then repeats with a possible cut (never a certain one) */
  const used={};
  const fill=maxRisk=>{for(let guard=0;guard<24&&rem>=3;guard++){
    const lim=rem>=14?16:rem>=6?8:4,c=bodyCands(s,secs,club,used).filter(x=>x.w<=lim&&x.risk<maxRisk&&(set.preset!=='radio'||x.w<=8));
    if(!c.length)break;const x=c[0];if(rep(x.i,x.w,'rep',true)){rem-=x.w;used[x.i]=(used[x.i]||0)+1}else break}};
  fill(0.35);
  let grown=0;
  if(rem>=8&&set.preset!=='radio'){
    let nI=needI,nZ=needZ;const canI=set.is!=='orig'&&needI>0,canZ=set.os!=='orig'&&needZ>0;
    while(rem>=8){if(canI&&nI<64&&(nI<=nZ||!canZ||nZ>=64))nI+=8;else if(canZ&&nZ<64)nZ+=8;else break;rem-=8;grown+=8}
    if(nI!==needI)mkIntro(needI=nI);if(nZ!==needZ)mkOutro(needZ=nZ);
  }
  fill(0.95);
  // a DJ intro goes straight into the music: the original's silent lead-in bars (before its first music bar) are skipped
  if(intro.length&&f.s0>0&&f.s0<first.b)orig[0][0].sa=f.s0;
  const blocks=[...intro,...orig.flat(),...outro];
  // out positions (bars) + times
  let o=0;for(const b of blocks){b.o0=o;o+=b.sb-b.sa;b.o1=o;if(b.gain==null)b.gain=1}
  const P=blocks[0].role==='orig'&&blocks[0].sa===0?Math.min(g.fd,srcT(s,0)):0;
  const lb=blocks[blocks.length-1];
  // ending: the original's own tail after its last bar, or (made outro) one more downbeat hit of the outro's loop that rings
  // out over a beat: the track ends ON a downbeat with a natural decay, never with a hard cut at a bar line
  let tail=0,endHit=null;
  if(lb.role==='orig'&&lb.sb===last.b)tail=Math.max(0,Math.min(12,s.buffer.duration-srcT(s,last.b)));
  else if(lb.role==='outro'||lb.role==='intro'){const lpx=loops.outro||loops.intro,hb=lpx?lpx.A.a:lb.sa;endHit={sa:hb,mask:lb.mask,eq:lb.eq,gain:lb.gain};tail=g.T}
  const len=P+o*B+tail;
  const p={blocks,bars:o,P,tail,endHit,len,B,added:len-s.buffer.duration,target,over:addBars*B>target+B,loops,grown,short:rem>=4?rem*B:0};
  p.joins=joinsOf(s,p);
  return p;
}
// every join: where the outgoing source would have gone on (so) and where the incoming one starts (si); sub-beat alignment
// (snap of the drum hits at both places), crossfade length (short when the downbeat is a hard hit), the singer's tail / pickup
function joinsOf(s,p){
  const out=[],bl=p.blocks,T=s.g.T;
  for(let i=1;i<bl.length;i++){
    const a=bl[i-1],b=bl[i],cont=a.sb===b.sa;
    if(cont&&sameLayers(a,b)&&Math.abs((a.gain||1)-(b.gain||1))<1e-3)continue;
    const so=srcT(s,a.sb),si=srcT(s,b.sa),vox=x=>!x.mask||!!x.mask.vocals;
    const j={i,t:outT(p,b.o0),kOut:a.sb,kIn:b.sa,so,si,src:!cont,shift:0,xf:0.012,tail:0,pre:0,duck:0,seam:1,risk:0};
    if(!cont){
      j.shift=relShift(s,a.sb,b.sa);
      const E=s.E,hit=E?(()=>{const q=Math.floor(si*E.fps);let m=0,base=1e-9;for(let k=q-4;k<q;k++)if(k>=0)base=Math.max(base,E.dl[k]+E.dh[k]);for(let k=q;k<q+3;k++)if(k<E.nf)m=Math.max(m,E.dl[k]+E.dh[k]);return m/base})():1;
      j.xf=hit>2.5?0.006:hit>1.4?0.012:0.03;
      const v=joinVocal(s,so,si,vox(a),vox(b));Object.assign(j,{tail:v.tail,pre:v.pre,risk:v.risk,duck:v.duck});
      if(b.role==='orig'&&b.sa===0&&b===p.blocks.find(x=>x.role==='orig')){j.pre=Math.min(si,p.B);j.risk=v.rOut}   // the render lays the source's own pickup over the DJ intro
      j.seam=seamOf(s.f,a.sb,b.sa,(!a.mask&&!b.mask)?'f':'d');
    }
    out.push(j);
  }
  return out;
}
const outT=(p,bar)=>p.P+bar*p.B;
// per block: the source shift (s) the render applies (cumulative join snaps, ±12 ms)
function blockShifts(p){const J=new Map((p.joins||[]).map(j=>[j.i,j])),out=[];let sh=0;p.blocks.forEach((b,i)=>{const j=J.get(i);if(j&&j.src)sh=clamp(sh+j.shift,-0.012,0.012);out.push(sh)});return out}
function planSig(){const s=X.song;return s?JSON.stringify([X.set.add,X.set.custom,X.set.intro,X.set.outro,X.set.is,X.set.os,X.set.preset,s.secs,s.kind]):''}
function replan(){const s=X.song;if(!s||!s.secs){X.plan=null;return}X.plan=makePlan(s,X.set,s.secs);X.sel=X.sel<X.plan.blocks.length?X.sel:-1}
const playable=()=>!!(X.render&&X.rsig===planSig());   // the first minute may still be the only part rendered
const fresh=()=>playable()&&!X.rpart;

/* ---------- render (OfflineAudioContext, sample-accurate on the bar grid) ---------- */
function segmentsOf(p){
  const out=[];for(const b of p.blocks){const l=out[out.length-1];if(l&&l.sb===b.sa&&l.blocks[l.blocks.length-1].sec!==undefined){l.blocks.push(b);l.sb=b.sb;l.o1=b.o1}else out.push({blocks:[b],sa:b.sa,sb:b.sb,o0:b.o0,o1:b.o1})}
  return out;
}
const EP=(n,up)=>{const c=new Float32Array(n);for(let i=0;i<n;i++){const x=i/(n-1);c[i]=up?Math.sin(x*Math.PI/2):Math.cos(x*Math.PI/2)}return c};
// drum-low hits (kick) in source [a,z): rises of the drums stem's lows (for the kick restore of the quick split)
function kickHits(s,a,z){const E=s.E;if(!E)return [];const out=[],p=pctl(E.dl,0.9)||1e-9,i0=Math.max(2,Math.floor(a*E.fps)),i1=Math.min(E.nf-1,Math.ceil(z*E.fps));
  for(let i=i0;i<i1;i++){const v=E.dl[i];if(v>0.3*p&&v>2*Math.max(E.dl[i-1],E.dl[i-2])&&v>=E.dl[i+1]*0.9){const t=(i-0.5)/E.fps;if(!out.length||t-out[out.length-1]>0.09)out.push(t)}}return out}
/* opt.until = render only the first `until` seconds (the preview starts while the rest renders). Joins: the crossfade ENDS on the
   downbeat (length per join, 6–30 ms: short on a hard hit so the kick stays sharp), the incoming segment is moved by the
   join's sub-beat shift (its hits continue the outgoing ones), the singer's last word rings on over the cut (tail, vocals stem)
   and a short pickup before the incoming downbeat is laid in (pre). Every segment's gain is 0 until its own fade-in starts. */
async function renderAudio(s,p,sr,prog,opt){
  opt=opt||{};
  const full=Math.max(1,Math.ceil(p.len*sr)),n=opt.until?Math.min(full,Math.ceil(opt.until*sr)):full,uT=n/sr,segs=segmentsOf(p);
  const rates=segs.map(sg=>(srcT(s,sg.sb)-srcT(s,sg.sa))/((sg.o1-sg.o0)*p.B));
  let st=null,lat=0;
  if(rates.some(r=>Math.abs(r-1)>0.002)){try{await CR.loadScript(CR.SS_SRC)}catch(e){}}
  const oc=new OfflineAudioContext(2,n+Math.ceil(sr*0.5),sr),master=oc.createGain();
  if(window.SignalsmithStretch&&rates.some(r=>Math.abs(r-1)>0.002)){try{st=await window.SignalsmithStretch(oc);lat=+(await st.latency())||0;master.connect(st);st.connect(oc.destination)}catch(e){st=null;lat=0}}
  if(!st)master.connect(oc.destination);
  const jAt=new Map((p.joins||[]).map(j=>[j.i,j])),T=s.g.T,quick=s.kind==='quick',voc=s.stems&&s.stems.vocals;
  const play=(buf,at,off,dur,r)=>{const src=oc.createBufferSource();src.buffer=buf;src.playbackRate.value=r||1;
    const a=Math.round(Math.max(0,at)*sr)/sr,bsr=buf.sampleRate,o=Math.round(Math.max(0,off+(a-at)*(r||1))*bsr)/bsr;src.start(a,o,Math.max(0.01,dur));src._f=[Math.round(a*sr),Math.round(o*bsr)];return src};
  // a source that must line up sample for sample with another (cancellation): same output↔source frame mapping as `ref`
  const playAt=(buf,ref,at,dur)=>{const fo=Math.round(at*sr),fs=ref[1]+(fo-ref[0]);if(fs<0)return null;const src=oc.createBufferSource();src.buffer=buf;src.start(fo/sr,fs/buf.sampleRate,Math.max(0.01,dur));return src};
  const BS=blockShifts(p);let shift=0,prevShift=0;const nsegs=segs.length;let lastEnd=0;
  for(let si=0;si<nsegs;si++){
    const sg=segs[si],fb=sg.blocks[0],bi=p.blocks.indexOf(fb),J=jAt.get(bi),nJ=jAt.get(bi+sg.blocks.length);
    prevShift=shift;shift=BS[bi];
    const r=Math.abs(rates[si]-1)>0.002?rates[si]:1,t0=outT(p,sg.o0),t1=outT(p,sg.o1);
    if(t0-0.05>uT)break;
    const s0=srcT(s,sg.sa)+shift,isLast=si===nsegs-1,tail=isLast&&!p.endHit?p.tail:0,xfIn=J?J.xf:XF,xfOut=nJ?nJ.xf:XF;
    // pre-roll: the source's own pickup before bar 1 is laid over the end of the previous block; other joins: the crossfade
    const pre=si===0?Math.min(t0,s0/r):fb.role==='orig'&&sg.sa===0?Math.min(s0/r,p.B,t0):Math.min(xfIn,s0/r,t0);
    const a0=t0-pre,end=t1+tail+(isLast&&p.endHit?0.01:0);lastEnd=end;
    const sgG=oc.createGain(),bg=oc.createGain();sgG.connect(bg).connect(master);const gp=sgG.gain;
    if(si===0&&a0<0.003)gp.setValueAtTime(1,0);
    else{gp.setValueAtTime(0,0);
      if(pre>xfIn*1.5){gp.setValueAtTime(0,a0);gp.linearRampToValueAtTime(1,a0+0.008)}
      else if(pre>0.001)gp.setValueCurveAtTime(EP(32,true),a0,pre);
      else{gp.setValueAtTime(0,Math.max(0,a0-0.003));gp.linearRampToValueAtTime(1,a0)}}
    if(!isLast||p.endHit){const xo=isLast?0.006:xfOut;gp.setValueCurveAtTime(EP(32,false),t1-xo,xo)}
    else if(tail<0.01){gp.setValueAtTime(1,Math.max(a0+0.01,t1-0.025));gp.linearRampToValueAtTime(0,t1)}
    else{gp.setValueAtTime(1,end-0.03);gp.linearRampToValueAtTime(0,end)}
    // per-block level (DJ intro / outro stages matched to the original next to them)
    {let pv=null;for(const b of sg.blocks){const v=b.gain||1,b0=outT(p,b.o0);if(pv==null)bg.gain.setValueAtTime(v,0);else if(Math.abs(v-pv)>1e-4){bg.gain.setValueAtTime(pv,Math.max(0,b0-0.01));bg.gain.linearRampToValueAtTime(v,b0)}pv=v}}
    // filters (only when a block of this segment uses one)
    let head=sgG;const fts=[...new Set(sg.blocks.map(b=>b.ft).filter(Boolean))];
    for(const ft of fts){const bq=oc.createBiquadFilter();bq.type=ft==='lp'?'lowpass':'highpass';bq.Q.value=ft==='lp'?0.9:0.707;const idle=ft==='lp'?Math.min(20000,sr*0.45):10;bq.frequency.setValueAtTime(idle,0);
      for(const b of sg.blocks){const b0=outT(p,b.o0),b1=outT(p,b.o1);if(b.ft===ft){bq.frequency.setValueAtTime(b.fx.f0,b0);bq.frequency.exponentialRampToValueAtTime(Math.max(10,b.fx.f1),b1)}else bq.frequency.setValueAtTime(idle,b0)}
      bq.connect(head);head=bq}
    // layers: the original mix (unmasked blocks), the stems used by masked blocks, the kick restore (quick split: the kick's
    // body went to the bass stem → its lows, gated on the drum hits, come back under drums-only stages)
    const layers=[];
    if(sg.blocks.some(b=>!b.mask))layers.push({id:'full',buf:s.buffer,on:b=>b.mask?0:1});
    if(s.stems)for(const id of IDS)if(sg.blocks.some(b=>b.mask&&b.mask[id]))layers.push({id,buf:s.stems[id],on:b=>b.mask&&b.mask[id]?1:0});
    const kickOn=b=>b.mask&&b.mask.drums&&!b.mask.bass&&!b.ft&&meanOf(s.f.bs,b.sa,b.sb)>0.25?1:0;
    if(quick&&s.stems&&sg.blocks.some(kickOn))layers.push({id:'kick',buf:s.stems.bass,on:kickOn});
    for(const L of layers){
      const g=oc.createGain();
      let prv=null;for(const b of sg.blocks){const v=L.on(b),b0=outT(p,b.o0);if(prv==null)g.gain.setValueAtTime(v,0);else if(v!==prv){g.gain.setValueAtTime(prv,Math.max(0,b0-0.012));g.gain.linearRampToValueAtTime(v,b0)}prv=v}
      let tailN=g;
      if((L.id==='drums'||L.id==='full')&&sg.blocks.some(b=>b.eq)){   // kick + hats: a wide cut around 1.4 kHz; 'kb' = a gentler one (bleed)
        const pk=oc.createBiquadFilter();pk.type='peaking';pk.frequency.value=1400;pk.Q.value=0.45;
        let pe=null;for(const b of sg.blocks){const v=b.eq==='kh'?-15:b.eq==='kb'?-7:0,b0=outT(p,b.o0);if(pe==null)pk.gain.setValueAtTime(v,0);else if(v!==pe){pk.gain.setValueAtTime(pe,Math.max(0,b0-0.012));pk.gain.linearRampToValueAtTime(v,b0)}pe=v}
        g.connect(pk);tailN=pk}
      if(L.id==='kick'){
        const lp=oc.createBiquadFilter();lp.type='lowpass';lp.frequency.value=115;lp.Q.value=0.6;const kg=oc.createGain();kg.gain.setValueAtTime(0,0);
        g.connect(lp).connect(kg);tailN=kg;
        for(const b of sg.blocks){if(!kickOn(b))continue;const bs0=srcT(s,b.sa),bs1=srcT(s,b.sb),b0=outT(p,b.o0);
          for(const h of kickHits(s,bs0,bs1)){const x=b0+(h-bs0)/r;if(x<b0+0.004||x>outT(p,b.o1)-0.03)continue;
            kg.gain.setValueAtTime(0,x-0.003);kg.gain.linearRampToValueAtTime(0.9,x+0.002);kg.gain.setTargetAtTime(0,x+0.03,0.055)}}
      }
      tailN.connect(head);
      const sn=play(L.buf,a0,s0-pre*r,(end-Math.max(0,a0))*r+0.01,r);sn.connect(g);if(L.id==='full')sg.ref=sn._f;
    }
    if(st)st.schedule({active:true,semitones:-12*Math.log2(r),output:Math.max(0,a0)+lat});
    // the outgoing pickup of the next phrase is left out: its vocals (stem, polarity-inverted) cancel them from the mix for the
    // last `duck` seconds before the cut (the quick split sums exactly to the mix; AI stems: within their own leakage)
    if(voc&&nJ&&nJ.src&&nJ.duck>0.02&&sg.ref&&r===1&&voc.sampleRate===s.buffer.sampleRate&&!sg.blocks[sg.blocks.length-1].mask){
      const xo=nJ.xf,d0=t1-nJ.duck,gg=oc.createGain(),inv=oc.createGain();inv.gain.value=-1;
      gg.gain.setValueAtTime(0,0);gg.gain.setValueAtTime(0,d0-0.03);gg.gain.linearRampToValueAtTime(1,d0);
      const dn=playAt(voc,sg.ref,d0-0.03,nJ.duck+0.04+xo);if(dn){inv.connect(gg).connect(head);dn.connect(inv)}
    }
    // the singer across the join: tail of the outgoing line / pickup of the incoming one (vocals stem only)
    if(voc&&J&&J.src&&J.tail>0.02&&si>0){
      const pb=p.blocks[bi-1],x0=t0-xfIn,src0=srcT(s,pb.sb)+prevShift-xfIn,gg=oc.createGain();
      gg.gain.setValueAtTime(0,0);gg.gain.setValueAtTime(0,x0);gg.gain.linearRampToValueAtTime(1,t0);gg.gain.setValueAtTime(1,t0+J.tail*0.4);gg.gain.linearRampToValueAtTime(0,t0+J.tail);
      gg.connect(bg);play(voc,x0,src0,xfIn+J.tail+0.02,1).connect(gg);
    }
    if(voc&&J&&J.src&&J.pre>0.02){
      const x0=t0-J.pre,gg=oc.createGain();
      gg.gain.setValueAtTime(0,0);gg.gain.setValueAtTime(0,x0);gg.gain.linearRampToValueAtTime(1,x0+Math.min(0.04,J.pre/2));gg.gain.setValueAtTime(1,t0-xfIn);gg.gain.linearRampToValueAtTime(0,t0);
      gg.connect(bg);play(voc,x0,s0-J.pre,J.pre+0.02,1).connect(gg);
    }
  }
  // the last downbeat: one more hit of the outro's loop, ringing out over a beat (no hard cut at a bar line)
  if(p.endHit&&outT(p,p.bars)<uT+0.05){
    const eh=p.endHit,t1=outT(p,p.bars),dur=p.tail,xo=0.006,src0=srcT(s,eh.sa),g=oc.createGain(),bg=oc.createGain();g.connect(bg).connect(master);
    bg.gain.value=eh.gain||1;g.gain.setValueAtTime(0,0);g.gain.setValueCurveAtTime(EP(16,true),t1-xo,xo);g.gain.setTargetAtTime(0,t1+0.08,T*0.3);g.gain.setValueAtTime(0.0001,t1+dur-0.03);g.gain.linearRampToValueAtTime(0,t1+dur-0.005);
    const ls=eh.mask?IDS.filter(id=>eh.mask[id]&&s.stems).map(id=>s.stems[id]):[s.buffer];
    for(const b of ls){let tn=g;if(eh.eq){const pk=oc.createBiquadFilter();pk.type='peaking';pk.frequency.value=1400;pk.Q.value=0.45;pk.gain.value=eh.eq==='kh'?-15:-7;pk.connect(g);tn=pk}
      play(b,t1-xo,src0-xo,dur+xo-0.006,1).connect(tn)}
  }
  const tot=(n/sr)+lat;for(let x=2;x<tot;x+=2)oc.suspend(x).then(()=>{if(prog)prog(x/tot);oc.resume()}).catch(()=>{});
  const out=await oc.startRendering(),o0=Math.round(lat*sr);
  const L=out.getChannelData(0).subarray(o0,o0+n),R=out.getChannelData(1).subarray(o0,o0+n);   // views, not copies (a 12-min render is ~300 MB per copy)
  let pk=0;for(let j=0;j<n;j++){const a=Math.abs(L[j]),b=Math.abs(R[j]);if(a>pk)pk=a;if(b>pk)pk=b}
  const k=opt.gain||(pk>0.98?0.98/pk:1);if(k!==1){for(let j=0;j<n;j++){L[j]*=k;R[j]*=k}}
  const ab=new AudioBuffer({numberOfChannels:2,length:n,sampleRate:sr});ab.copyToChannel(L,0);ab.copyToChannel(R,1);
  ab._k=k;void lastEnd;
  return ab;
}
/* ---------- quality (after every render): what the render does at each join, measured on the render itself ----------
   step = level change across the join (bar before vs bar after, render) against what was meant: for full-mix joins the
   change the music makes there by itself (or none), for stem joins the planned stage levels. seam = bar similarity of the
   incoming bar and the bar the outgoing source would have played. risk = a sung line cut (see joinVocal). aligned = the
   incoming hits continue the outgoing grid (sub-beat snap applied, |shift| ≤ 12 ms). */
function barLvl(buf,t0,t1){const L=buf.getChannelData(0),R=buf.getChannelData(1),sr=buf.sampleRate,a=Math.max(0,Math.floor(t0*sr)),z=Math.min(L.length,Math.floor(t1*sr));let q=0,c=0;for(let j=a;j<z;j+=4){q+=L[j]*L[j]+R[j]*R[j];c++}return c?Math.sqrt(q/(2*c)):0}
function qualityOf(s,p,buf){
  const B=p.B,f=s.f,J=[];const k=buf._k||1;
  for(const j of p.joins||[]){
    if(j.t<B||j.t+B>buf.duration)continue;
    const a=p.blocks[j.i-1],b=p.blocks[j.i];
    const step=dB(barLvl(buf,j.t,j.t+B))-dB(barLvl(buf,j.t-B,j.t));
    let want;
    if(!a.mask&&!b.mask){const nIn=dB(f.mix[j.kIn]||1e-7)-dB(f.mix[j.kIn-1]||1e-7),nOut=dB(f.mix[j.kOut]||1e-7)-dB(f.mix[j.kOut-1]||1e-7);
      want=[0,nIn,nOut].reduce((m,x)=>Math.abs(step-x)<Math.abs(step-m)?x:m,0)}
    else want=dB(layerLvl(s,b.mask,b.sa,b.sb)*(b.gain||1))-dB(layerLvl(s,a.mask,a.sa,a.sb)*(a.gain||1));
    const ex=Math.abs(step-want),inner=a.role===b.role&&(a.role==='intro'||a.role==='outro');
    const clean=ex<=1.5&&j.risk<0.5&&(j.seam>=0.62||!j.src||inner&&j.seam>=0.5);
    J.push({t:j.t,step:Math.round(ex*10)/10,seam:Math.round(j.seam*100)/100,risk:j.risk,src:j.src,shift:Math.round(j.shift*1e4)/10,clean,inner,from:a.role,to:b.role});
  }
  const loops=J.filter(x=>x.inner&&x.src),seam=loops.length?loops.reduce((m,x)=>m+x.seam,0)/loops.length:1;
  const lu=J.length?Math.max(...J.map(x=>x.step)):0,cuts=J.filter(x=>x.risk>=0.5).length,clean=J.length?J.filter(x=>x.clean).length/J.length:1;
  const lb=p.loops&&(p.loops.intro||p.loops.outro),bleed=s.kind==='quick'&&p.blocks.some(b=>b.mask&&!b.mask.vocals&&!b.useMix&&meanOf(f.va,b.sa,b.sb)>0.12);
  const score=Math.round(100*(0.4*clean+0.25*clamp(seam,0,1)+0.2*clamp(1-lu/3,0,1)+0.15*(cuts?Math.max(0,1-cuts/3):1))*(bleed?0.92:1));
  void lb;void k;
  return {score,clean:Math.round(clean*100),seam:Math.round(seam*100)/100,lu:Math.round(lu*10)/10,cuts,bleed,joins:J};
}

/* ---------- stems ---------- */
function quickSep(buf,prog,sig){
  return CR.stereo44(buf).then(([LR,len])=>new Promise((ok,no)=>{
    const L=LR.slice(0,len),R=LR.slice(len),w=new Worker(QW);
    const ab=()=>{w.terminate();no(Object.assign(new Error('aborted'),{code:'aborted'}))};
    if(sig){if(sig.aborted)return ab();sig.addEventListener('abort',ab,{once:true})}
    w.onmessage=e=>{const d=e.data;
      if(d.type==='p')prog(d.p);
      else if(d.type==='done'){w.terminate();if(sig)sig.removeEventListener('abort',ab);const ac=CR.ac(),out={};
        IDS.forEach((id,k)=>{const b=ac.createBuffer(2,len,44100);b.copyToChannel(d.res[k*2],0);b.copyToChannel(d.res[k*2+1],1);out[id]=b});ok(out)}};
    w.onerror=e=>{if(e&&e.preventDefault)e.preventDefault();w.terminate();no(new Error((e&&e.message)||'worker'))};
    w.postMessage({L,R,sr:44100},[L.buffer,R.buffer]);
  }));
}

/* ---------- loading + analysis pipeline ---------- */
function setMsg(m,err){X.msg=m||'';X.msgErr=!!err;const el=$('#exMsg');if(el){el.textContent=X.msg;el.classList.toggle('err',X.msgErr);el.hidden=!X.msg}}
function step(k,state,p){X.steps[k]=state;if(p!=null)X.stepP=p;renderProc()}
async function loadSong(getBuf,name,pre){
  const tok=++X.tok;stopPB();abortGen();setMsg('');
  if(X.qctl)X.qctl.abort();
  if(X.sep)X.sep.ctl.abort();   // an AI separation of the previous song: cancelled → refunded (its stems would be thrown away)
  X.song=null;X.plan=null;X.render=null;X.rwave=null;X.sel=-1;X.secEd=-1;closeSecEd();
  X.stage='analyzing';X.steps={};X.stepP=0;X.procName=name;AN_STEPS.forEach(k=>X.steps[k]='todo');renderAll();
  try{
    step('an','run',0.02);
    let buffer,a=null,stems=null,kind=null;
    if(pre){buffer=pre.buffer;a={bpm:pre.bpm,offset:pre.offset,down:pre.down||0,key:pre.key,wave:pre.wave,lufs:pre.lufs,dur:buffer.duration};if(pre.stems){stems=pre.stems;kind='tool'}}
    else buffer=await getBuf();
    if(tok!==X.tok)return;
    if(buffer.duration<30)throw Object.assign(new Error('short'),{short:true});
    if(buffer.duration>MAX_DUR)throw Object.assign(new Error('long'),{long:true});
    if(!a)a=await CR.analyzeTrack(buffer,p=>{if(tok===X.tok){X.stepP=0.05+p*0.9;renderProcP()}});
    if(tok!==X.tok)return;
    step('an','done');step('bpm','done');await sleep(80);step('key','done');
    const s={key:name+'|'+Math.round(buffer.duration*1000)+'|'+buffer.length,name,buffer,an:a,g:gridOf(a,buffer.duration),stems,kind,F:null,chroma:null};
    if(s.g.nb<16)throw Object.assign(new Error('short'),{short:true});
    if(!s.stems){
      step('sep','run',0);const ctl=new AbortController();X.qctl=ctl;
      s.stems=await quickSep(buffer,p=>{if(tok===X.tok){X.stepP=p;renderProcP()}},ctl.signal);s.kind='quick';X.qctl=null;
    }
    if(tok!==X.tok)return;
    step('sep','done');
    await analyse(s,tok);
    if(tok!==X.tok)return;
    X.song=s;X.stage='ready';X.zoom=1;X.view0=0;replan();save();renderAll();
  }catch(e){
    if(tok!==X.tok)return;console.warn(e);X.stage=X.song?'ready':'empty';
    setMsg(e&&e.short?t('exShort'):e&&e.long?t('exLong'):e&&e.big?t('exBig'):e&&e.lib?t('exErrLib'):e&&e.code==='aborted'?t('canceled'):e&&(e.name==='EncodingError'||/decode/i.test(String(e.message)))?t('readErr'):t('exErrLoad'),!(e&&e.code==='aborted'));
    renderAll();
  }
}
// structure from the features (also re-run after AI stems arrive)
async function analyse(s,tok){
  step('struct','run',0.1);
  s.f=await features(s);if(tok!==X.tok)return;
  const gr=groove(s);s.groove=gr.g;s.drift=null;
  if(gr.fit||gr.drift){
    const g0=s.g,an0=s.an;let g=gr;
    for(let it=0;;it++){
      if(g.fit){   // the BPM was slightly off: the bar length from the beats themselves (the BPM shown, tagged and the output grid follow)
        const B=g.fit.B,T=B/4,fd=g.fit.fd;s.g={T,B,fd,nb:Math.max(0,Math.floor((s.buffer.duration-fd)/B+1e-6))};s.an={...s.an,bpm:240/B,offset:mod(fd,T),down:Math.floor(mod(fd,B)/T)}}
      if(g.fit&&it===0){s.drift=null;g=groove(s);if(g.fit||g.drift)continue;break}   // track once more on the refitted grid (smaller steps)
      s.drift=g.drift;break;
    }
    if(s.drift)while(s.g.nb>16&&srcT(s,s.g.nb)>s.buffer.duration+0.005)s.g.nb--;
    // keep the correction only when the hits sit clearly better on the corrected grid (a 3/4 song on a 4/4 grid: no)
    const g2=groove(s,true);if(g2.sc>gr.sc+0.05&&s.g.nb>=16){s.groove=g2.g;s.f=await features(s)}else{s.g=g0;s.an=an0;s.drift=null}
  }
  step('struct','done');step('phr','run',0.5);await sleep(30);
  let cues=[];try{cues=await CUES.detect(s.buffer,{bpm:s.an.bpm,offset:s.an.offset,down:s.an.down||0},s.F)}catch(e){console.warn(e)}
  if(tok!==X.tok)return;
  s.cues=cues;const sg=segment(s.f,cues);s.anc=sg.anc;
  step('phr','done');step('drop','run',0.8);await sleep(30);
  s.secs0=label(sg.segs,s.f);s.secs=s.secs0.map(x=>({...x}));s.edited=false;
  s.lock=phraseLock(s.secs,s.f.s0);
  step('drop','done');
}
// decode at the file's own rate when we can tell it (WAV header; else 44.1 kHz, the usual MP3/M4A rate): the AudioContext's
// rate (often 48 kHz) would resample on decode, and the unmodified blocks of the render would no longer be the source's samples
function wavRate(ab){try{const v=new DataView(ab);if(v.getUint32(0)!==0x52494646||v.getUint32(8)!==0x57415645)return 0;let p=12;while(p+8<=v.byteLength){const id=v.getUint32(p),n=v.getUint32(p+4,true);if(id===0x666d7420)return v.getUint32(p+12,true);p+=8+n+(n&1)}}catch(e){}return 0}
async function decode(ab){
  const r=wavRate(ab),sr=r>=8000&&r<=192000?r:44100;
  try{return await new OfflineAudioContext(2,1,sr).decodeAudioData(ab.slice(0))}catch(e){return CR.ac().decodeAudioData(ab)}
}
function loadFile(file){
  if(!file)return;
  if(file.size>MAX_BYTES){setMsg(t('exBig'),true);return}
  const name=file.name.replace(/\.[a-z0-9]{2,5}$/i,'');
  loadSong(async()=>decode(await file.arrayBuffer()),name);
}
function loadLib(it){
  if(!it||!it.file_path||!CR.signedIn())return;
  loadSong(async()=>{let ab;try{const url=await CR.songFileUrl(it.file_path);const r=await fetch(url);if(!r.ok)throw new Error('http '+r.status);ab=await r.arrayBuffer()}catch(e){throw Object.assign(e,{lib:true})}return decode(ab)},it.name);
}
function loadTool(){const s=CR.toolSong();if(!s){setMsg(t('exNoTool'),true);return}loadSong(null,s.name,s)}
async function upgradeAI(){
  const s=X.song;if(!s||X.sep||s.kind==='ai'||s.kind==='tool')return;
  if(CR.sepInfo().busy){setMsg(t('exSepBusy'),true);return}
  const ctl=new AbortController();X.sep={ctl,p:0,msg:t('aiDl',{p:0})};setMsg('');renderSrc();
  try{
    const stems=await CR.separateBuffer(s.buffer,{onProgress:(p,m)=>{if(X.sep){X.sep.p=p;X.sep.msg=m;renderSepP()}},signal:ctl.signal,ref:'extended: '+s.name});
    if(X.song!==s)return;
    s.stems=stems;s.kind='ai';s.E=null;s.snap=null;const keep=s.edited?s.secs:null;
    const tok=X.tok;await analyse(s,tok);if(tok!==X.tok)return;if(keep){s.secs=keep;s.edited=true;s.lock=phraseLock(s.secs,s.f.s0)}
    replan();save();
  }catch(e){
    const code=e&&e.code;
    if(X.song!==s){}else if(code==='aborted')setMsg(t('canceled'));else if(code==='declined'){}else if(code==='busy')setMsg(t('exSepBusy'),true);else if(code==='off')setMsg(t('offByAdmin'),true);
    else{console.error(e);setMsg(t('exSepFail',{m:String((e&&e.message)||e).slice(0,80)}),true)}
  }finally{X.sep=null;renderAll()}
}

/* ---------- generation ---------- */
function abortGen(){X.genTok++;if(X.stage==='generating'){if(X.qctl)X.qctl.abort();X.stage=X.song?'ready':'empty'}}
async function generate(){
  const s=X.song;if(!s||X.stage==='generating')return;
  const tok=++X.genTok;stopPB();X.stage='generating';X.steps={};STEPS.forEach(k=>X.steps[k]='todo');X.stepP=0;X.reveal=0;X.sel=-1;X.fin=0;X.join=-1;
  X.render=null;X.rpart=false;X.rwave=null;X.quality=null;
  renderAll();
  const alive=()=>tok===X.genTok&&X.song===s;
  try{
    // what the analysis already found: a quick cascade
    for(const k of ['an','bpm','key']){step(k,'done');await sleep(reduced()?0:30);if(!alive())return}
    if(!s.stems){step('sep','run',0);const ctl=new AbortController();X.qctl=ctl;s.stems=await quickSep(s.buffer,p=>{X.stepP=p;renderProcP()},ctl.signal);s.kind='quick';X.qctl=null;if(!alive())return}
    step('sep','done');
    for(const k of ['struct','phr','drop'])step(k,'done');
    replan();const p=X.plan,nI=p.blocks.filter(b=>b.role==='intro').length,nO=p.blocks.filter(b=>b.role==='outro').length,sig=planSig(),sr=X.set.sr;
    // the first minute renders while the checklist animates: the preview can start before the whole track is rendered
    const headT=p.len>90?60:0;
    const headP=headT?renderAudio(s,p,sr,null,{until:headT}).then(hb=>{if(alive()&&!X.render){X.render=hb;X.rsig=sig;X.rpart=true;renderTransport();renderPreview();drawSoon()}return hb}).catch(e=>{console.warn(e);return null}):Promise.resolve(null);
    const grow=async(to,ms)=>{const n0=X.reveal;for(let i=n0+1;i<=to;i++){X.reveal=i;drawSoon();await sleep(reduced()?0:ms)}};
    step('intro','run');await grow(nI,30);step('intro','done');if(!alive())return;
    step('outro','run');X.reveal=nI;drawSoon();await sleep(reduced()?0:40);step('outro','done');if(!alive())return;
    step('arr','run');await grow(p.blocks.length-nO,15);await grow(p.blocks.length,30);step('arr','done');if(!alive())return;
    step('render','run',0);
    const hb=await headP;if(!alive())return;
    const buf=await renderAudio(s,p,sr,q=>{if(alive()){X.stepP=q;renderProcP()}},hb?{gain:hb._k}:null);
    if(!alive())return;
    step('render','done',1);
    swapRender(buf,sig);X.reveal=Infinity;
    X.quality=qualityOf(s,p,buf);
    try{const w=await CR.waveOf(buf);if(alive())X.rwave=w}catch(e){console.warn(e)}
    if(!alive())return;
    X.stage='done';X.fin=performance.now();if(!X.pb.playing)X.pb.pos.B=X.pb.which==='B'?X.pb.pos.B:0;renderAll();finAnim();
  }catch(e){
    if(!alive())return;console.error(e);X.stage='ready';X.render=null;X.rpart=false;setMsg(t('exExpFail'),true);renderAll();
  }
}
// the full render replaces the first-minute one: playback continues at the same spot (or resumes where the head ran out)
function swapRender(buf,sig){
  const P=X.pb,was=P.playing&&P.which==='B',pos=was?heardPB():null,waited=P.waitFull;
  X.render=buf;X.rsig=sig;X.rpart=false;X.rwave=null;P.waitFull=false;
  if(was)playPB('B',pos,{swap:true});else if(waited)playPB('B',P.pos.B);
}

/* ---------- preview A/B ---------- */
X.pb={which:'B',playing:false,src:null,g:null,t0:0,p0:0,pos:{A:0,B:0},loop:false,until:null,waitFull:false};
const pbBuf=w=>w==='A'?X.song&&X.song.buffer:playable()?X.render:null;
const vol=()=>clamp(X.set.vol==null?0.9:+X.set.vol,0,1);
function heardPB(){const P=X.pb;if(!P.playing)return P.pos[P.which];const c=CR.ac();let x=P.p0+Math.max(0,c.currentTime-P.t0);const lp=loopRange(P.which);if(P.loop&&lp&&x>=lp[1])x=lp[0]+mod(x-lp[0],lp[1]-lp[0]);return x}
function loopRange(w){const p=X.plan,s=X.song,b=p&&X.sel>=0?p.blocks[X.sel]:null;if(!b)return null;return w==='A'?[srcT(s,b.sa),srcT(s,b.sb)]:[outT(p,b.o0),outT(p,b.o1)]}
// opt.until: stop there (hear a join: 4 bars before → 4 bars after); opt.swap: the same spot of a new buffer, crossfaded in 15 ms
function playPB(which,pos,opt){
  opt=opt||{};const buf=pbBuf(which);if(!buf)return;const P=X.pb,c=CR.ac();c.resume();
  const fade=opt.swap?0.015:0.04,at=c.currentTime+(opt.swap?0.02:0.03);
  if(P.playing){if(opt.swap){const og=P.g,os=P.src;try{og.gain.cancelScheduledValues(at);og.gain.setValueAtTime(og.gain.value,at);og.gain.linearRampToValueAtTime(0,at+fade);os.stop(at+fade+0.01)}catch(e){}os.onended=null;P.src=null;pos=pos+(at-c.currentTime)}else killPB()}
  P.which=which;if(pos==null)pos=P.pos[which];if(pos>=buf.duration-0.05)pos=opt.swap?buf.duration-0.05:0;
  const lp=P.loop&&loopRange(which);if(lp&&(pos<lp[0]||pos>=lp[1]))pos=lp[0];
  const src=c.createBufferSource();src.buffer=buf;const g=c.createGain();g.gain.setValueAtTime(0,c.currentTime);g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol(),at+fade);
  if(lp){src.loop=true;src.loopStart=lp[0];src.loopEnd=lp[1]}
  src.connect(g).connect(c.destination);src.start(at,pos);
  P.until=opt.until!=null&&!lp?opt.until:null;
  if(P.until!=null){const d=Math.max(0.05,P.until-pos);g.gain.setValueAtTime(vol(),at+d-0.06);g.gain.linearRampToValueAtTime(0,at+d);src.stop(at+d+0.01)}
  src.onended=()=>{if(P.src!==src)return;P.playing=false;P.src=null;
    if(P.until!=null){P.pos[which]=P.until;P.until=null}
    else if(which==='B'&&X.rpart&&pos+(c.currentTime-at)>=buf.duration-0.2){P.pos.B=buf.duration;P.waitFull=true}   // the head ran out: resume when the rest is rendered
    else P.pos[which]=0;
    renderTransport();kick()};
  Object.assign(P,{src,g,t0:at,p0:pos,playing:true});P.pos[which]=pos;renderTransport();kick();
}
function killPB(){const P=X.pb,c=CR.ac();if(!P.src)return;try{P.g.gain.cancelScheduledValues(c.currentTime);P.g.gain.setValueAtTime(P.g.gain.value,c.currentTime);P.g.gain.linearRampToValueAtTime(0,c.currentTime+0.03);P.src.stop(c.currentTime+0.04)}catch(e){}P.src.onended=null;P.src=null;P.until=null}
function setVol(v){X.set.vol=clamp(Math.round(v*100)/100,0,1);save();const P=X.pb,c=CR.ac();if(P.playing&&P.g&&P.until==null){try{P.g.gain.cancelScheduledValues(c.currentTime);P.g.gain.setTargetAtTime(vol(),c.currentTime,0.02)}catch(e){}}}
// joins of the extended version (block boundaries where the source jumps or the stems change)
function joinList(){const p=X.plan;return p&&p.joins?p.joins:[]}
function playJoin(i){const p=X.plan,J=joinList();if(!J.length||!pbBuf('B'))return;i=clamp(i,0,J.length-1);X.join=i;const j=J[i],B=p.B;
  const a=Math.max(0,j.t-4*B),z=Math.min(pbBuf('B').duration,j.t+4*B);X.pb.loop=false;
  {const v=viewOf();if(j.t<v.v0||j.t>v.v0+v.span)X.view0=j.t-v.span/2}
  playPB('B',a,{until:z});renderPreview();drawSoon()}
function stopPB(keep){const P=X.pb;P.waitFull=false;if(P.playing){P.pos[P.which]=keep?heardPB():0;killPB();P.playing=false}else if(!keep)P.pos[P.which]=0;renderTransport();kick()}
function togglePB(which){const P=X.pb;if(P.playing&&(which==null||which===P.which))stopPB(true);else playPB(which||P.which)}
// position mapping through the blocks: extended time ↔ source time
function extToSrc(x){const p=X.plan,s=X.song;if(!p)return x;if(x<p.P)return x;for(const b of p.blocks){const a=outT(p,b.o0),z=outT(p,b.o1);if(x>=a&&x<z)return srcT(s,b.sa)+(x-a)}const lb=p.blocks[p.blocks.length-1];return srcT(s,lb.sb)+(x-outT(p,lb.o1))}
function srcToExt(y){const p=X.plan,s=X.song;if(!p)return y;let best=null;
  for(const b of p.blocks){const a=srcT(s,b.sa),z=srcT(s,b.sb);if(y>=a&&y<z){const v=outT(p,b.o0)+(y-a);if(b.role==='orig')return v;if(best==null)best=v}}
  if(best!=null)return best;if(y<srcT(s,0)){const o=p.blocks.find(b=>b.role==='orig'&&b.sa===0);return o?outT(p,o.o0)-(srcT(s,0)-y):y}
  const lo=[...p.blocks].reverse().find(b=>b.role==='orig');return lo?outT(p,lo.o1)+(y-srcT(s,lo.sb)):y}
function abSwitch(){
  const P=X.pb,cur=heardPB(),to=P.which==='A'?'B':'A';if(!pbBuf(to)){P.which=to;renderTransport();return}
  const pos=to==='B'?srcToExt(cur):extToSrc(cur);P.pos[to]=clamp(pos,0,pbBuf(to).duration-0.05);
  if(P.playing)playPB(to,P.pos[to]);else{P.which=to;renderTransport();kick()}
}
function seekPB(which,x){const P=X.pb,buf=pbBuf(which);if(!buf)return;x=clamp(x,0,buf.duration-0.05);if(P.playing)playPB(which,x);else{P.which=which;P.pos[which]=x;renderTransport();kick()}}
function loopToggle(){const P=X.pb;if(X.sel<0){P.loop=false;renderTransport();return}P.loop=!P.loop;if(P.playing)playPB(P.which,heardPB());else renderTransport();drawSoon()}

/* ---------- settings (per account, never audio) ---------- */
const lsKey=()=>LS+':'+(X.owner||'guest');
function save(){clearTimeout(save.t);save.t=setTimeout(()=>{try{localStorage.setItem(lsKey(),JSON.stringify({v:1,...X.set}))}catch(e){}},200)}
function load(){
  let o=null;try{o=JSON.parse(localStorage.getItem(lsKey())||'null')}catch(e){}
  const d=defSet();X.set=d;if(!o||o.v!==1)return;
  if(PRESETS[o.preset])d.preset=o.preset;
  if(ADDS.includes(o.add)||o.add==='custom')d.add=o.add;
  if(typeof o.custom==='number'&&isFinite(o.custom))d.custom=clamp(Math.round(o.custom),0,600);
  if(BARN.includes(o.intro))d.intro=o.intro;if(BARN.includes(o.outro))d.outro=o.outro;
  if(STYLES.includes(o.is))d.is=o.is;if(STYLES.includes(o.os))d.os=o.os;
  if(['mp3','wav16','wav24'].includes(o.fmt))d.fmt=o.fmt;if(o.sr===44100||o.sr===48000)d.sr=o.sr;d.cues=o.cues!==false;
  if(typeof o.vol==='number'&&isFinite(o.vol))d.vol=clamp(o.vol,0,1);
}
function setOwner(uid){
  uid=uid||null;if(X.owner===uid)return;const had=X.owner!==undefined;X.owner=uid;
  if(had){X.tok++;abortGen();stopPB();if(X.qctl)X.qctl.abort();if(X.sep)X.sep.ctl.abort();X.song=null;X.plan=null;X.render=null;X.rwave=null;X.stage='empty';closePick();closeSecEd()}
  load();if(X.built)renderAll();
}
function applyPreset(k){const p=PRESETS[k];if(!p)return;Object.assign(X.set,{preset:k,add:p.add,intro:p.intro,outro:p.outro,is:p.is,os:p.os});changed()}
function changed(){replan();X.join=-1;save();renderSettings();renderPlan();renderExport();renderTransport();renderPreview();drawSoon()}

/* ---------- UI ---------- */
const IC={
  file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
  lib:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  tool:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0"/></svg>',
  ext:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 8v8M12 5v14M15 8v8"/><path d="M5.5 9L3 12l2.5 3M18.5 9L21 12l-2.5 3"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
  stop:'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/></svg>',
  loop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
  ab:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>',
  zin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/></svg>',
  zout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/></svg>',
  ai:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 19h16"/></svg>',
  drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  vol:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  prev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  join:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h6M15 12h6M9 7v10M15 7v10"/></svg>'
};
function build(){
  const v=$('#extendedView');
  v.innerHTML=`
<div class="dhead exhead"><div><div class="eyebrow" data-i="exEyebrow"></div><h1 data-i="exTitle"></h1><p data-i="exSub"></p></div></div>
<section class="exsrc" id="exSrc" aria-label=""></section>
<p class="mxmsg exmsg" id="exMsg" role="status" aria-live="polite" hidden></p>
<section class="exproc" id="exProc" hidden aria-live="polite"></section>
<div id="exMain" hidden>
  <section class="exan" aria-labelledby="exAnH">
    <div class="exanh"><h2 id="exAnH" data-i="exAnH"></h2></div>
    <dl class="exstats" id="exStats"></dl>
  </section>
  <section class="exdeck" id="exDeck" aria-label="">
    <div class="extr">
      <button type="button" class="exbig" id="exPlay" disabled>${IC.play}</button>
      <div class="exab" role="group" id="exAB">
        <button type="button" class="exabb" data-pb="A"><span class="ic">${IC.play}</span><span class="exabl"><b data-i="exOrig"></b><small class="mono" id="exTA" dir="ltr"></small></span></button>
        <button type="button" class="exsw" id="exSw">${IC.ab}<span data-i="exAB"></span></button>
        <button type="button" class="exabb" data-pb="B"><span class="ic">${IC.play}</span><span class="exabl"><b data-i="exExt"></b><small class="mono" id="exTB" dir="ltr"></small></span></button>
      </div>
      <span class="extime mono" id="exTime" dir="ltr"></span>
      <span class="exsp"></span>
      <label class="exvol"><span class="vh" data-i="exVol"></span>${IC.vol}<input type="range" id="exVol" min="0" max="100" step="1" dir="ltr"></label>
      <button type="button" class="mxib exloop" id="exLoop" aria-pressed="false">${IC.loop}<span data-i="exLoopBlk"></span></button>
      <button type="button" class="mxib" id="exStopB" data-it="exStop">${IC.stop}</button>
      <button type="button" class="mxib" id="exZo" data-it="exZoomOut">${IC.zout}</button><button type="button" class="mxib" id="exZi" data-it="exZoomIn">${IC.zin}</button>
    </div>
    <div class="expv" id="exPv" hidden></div>
    <div class="extl" id="exTl" dir="ltr"><canvas id="exCv" role="img"></canvas><canvas id="exOv" aria-hidden="true"></canvas><div class="extip" id="exTip" hidden></div></div>
    <div class="exinsp" id="exInsp" aria-live="polite"></div>
    <div class="exsecs"><span class="exsecl" data-i="exSecH"></span><div class="exsecb" id="exSecs"></div></div>
    <p class="exhelp"><span data-i="exTlHelp"></span> · <span data-i="exKeys"></span></p>
  </section>
  <div class="excols">
    <section class="exset" id="exSet" aria-labelledby="exSetH"></section>
    <section class="explan" id="exPlan" aria-labelledby="exPlanH"></section>
  </div>
  <section class="exexp" id="exExp" aria-labelledby="exExpH" hidden></section>
</div>
<input type="file" id="exIn" accept="${ACCEPT}" hidden>
<div class="exed" id="exEd" hidden role="dialog" aria-modal="false" aria-labelledby="exEdH"></div>
<div class="mxpick" id="exPick" hidden><div class="mxpd" role="dialog" aria-modal="true" aria-labelledby="exPickH">
  <div class="mxph"><h2 id="exPickH" data-i="exLibT"></h2><button type="button" class="mxib" id="exPickX" data-it="exClose">${IC.x}</button></div>
  <input type="search" class="srch" id="exPickQ" data-ip="exLibSearch" autocomplete="off">
  <p class="snote" id="exPickN"></p><ul class="mxpl" id="exPickL"></ul></div></div>`;
  X.built=true;wire();CR.applyLang();renderAll();
}
const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
function wire(){
  const v=$('#extendedView');
  v.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;
    if(d.a==='file'){$('#exIn').value='';$('#exIn').click()}
    else if(d.a==='lib')openPick(b);else if(d.a==='tool')loadTool();
    else if(d.a==='ai')upgradeAI();else if(d.a==='cancelSep'){if(X.sep)X.sep.ctl.abort()}
    else if(d.a==='cancelLoad'){X.tok++;if(X.qctl)X.qctl.abort();X.stage='empty';renderAll()}
    else if(d.a==='gen')generate();else if(d.a==='cancelGen'){abortGen();renderAll()}
    else if(d.a==='exp')exportExt();
    else if(d.pb)togglePB(d.pb);
    else if(d.blk!=null){selectBlock(+d.blk,true)}
    else if(d.sec!=null)openSecEd(+d.sec,b);
    else if(d.ps){applyPreset(d.ps)}
    else if(d.add!=null){X.set.add=d.add==='custom'?'custom':+d.add;changed();if(d.add==='custom')setTimeout(()=>{const i=$('#exCustom');if(i)i.focus()},0)}
    else if(d.ib!=null){X.set.intro=+d.ib;changed()}else if(d.ob!=null){X.set.outro=+d.ob;changed()}
    else if(d.fm){X.set.fmt=d.fm;save();renderExport()}else if(d.sr){X.set.sr=+d.sr;save();renderExport()}
  });
  v.addEventListener('change',e=>{const el=e.target;
    if(el.id==='exIS'){X.set.is=el.value;changed()}else if(el.id==='exOS'){X.set.os=el.value;changed()}
    else if(el.id==='exCuesC'){X.set.cues=el.checked;save()}
    else if(el.id==='exCustom'){renderSettings()}});
  v.addEventListener('input',e=>{const el=e.target;if(el.id==='exCustom'){const x=parseFloat(String(el.value).replace(',','.'));if(x>=0&&x<=600){X.set.custom=Math.round(x);X.set.add='custom';replan();save();renderPlan();renderExport();drawSoon()}}});
  $('#exSw').onclick=abSwitch;$('#exStopB').onclick=()=>stopPB();$('#exLoop').onclick=loopToggle;
  $('#exPlay').onclick=()=>togglePB(X.pb.which==='A'&&!X.pb.playing?'B':null);
  $('#exVol').addEventListener('input',e=>setVol(+e.target.value/100));
  $('#exPv').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset,J=joinList();
    if(d.jn==='prev')playJoin((X.join<0?J.length:X.join)-1);else if(d.jn==='next')playJoin(X.join+1);else if(d.jn==='play')playJoin(X.join<0?0:X.join);
    else if(d.a==='q'){const pn=$('#exQp');pn.hidden=!pn.hidden;b.setAttribute('aria-expanded',String(!pn.hidden))}
    else if(d.a==='ai')upgradeAI();
    const f=d.jn&&$('#exPv').querySelector(`[data-jn="${d.jn}"]`);if(f&&!f.disabled)f.focus()});
  $('#exZi').onclick=()=>zoom(2);$('#exZo').onclick=()=>zoom(0.5);
  $('#exIn').onchange=e=>{const f=e.target.files&&e.target.files[0];if(f)loadFile(f)};
  v.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();const z=$('#exSrc');if(z)z.classList.add('over')});
  v.addEventListener('dragleave',e=>{if(!v.contains(e.relatedTarget)){const z=$('#exSrc');if(z)z.classList.remove('over')}});
  v.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();e.stopPropagation();const z=$('#exSrc');if(z)z.classList.remove('over');const f=e.dataTransfer.files[0];if(f)loadFile(f)});
  $('#exPickX').onclick=closePick;$('#exPick').onclick=e=>{if(e.target.id==='exPick')closePick()};$('#exPickQ').oninput=renderPick;
  $('#exPick').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closePick()}else if(e.key==='Tab')trap(e,$('#exPick .mxpd'))});
  $('#exEd').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset,i=X.secEd;
    const q=d.lab?`[data-lab="${d.lab}"]`:d.mv?`[data-mv="${d.mv}"]`:null;
    if(d.lab){setLab(i,d.lab)}else if(d.mv){moveEdge(i,d.mv)}else if(d.a==='reset'){resetSecs();return}else if(d.a==='close'){closeSecEd(true);return}
    // the editor was re-rendered: keep the keyboard focus on the same control
    const n=q&&$('#exEd').querySelector(q);if(n&&!n.disabled)n.focus();else{const f=$('#exEd').querySelector('[data-lab].on');if(f)f.focus()}});
  $('#exEd').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeSecEd(true)}});
  document.addEventListener('pointerdown',e=>{const ed=$('#exEd');if(ed&&!ed.hidden&&!ed.contains(e.target)&&!e.target.closest('[data-sec]')&&!e.target.closest('#exTl'))closeSecEd()},true);
  wireTimeline();
  new ResizeObserver(()=>{sizeCanvas();drawSoon()}).observe($('#exTl'));
}
function trap(e,box){const f=[...box.querySelectorAll('button:not([disabled]),input,select')].filter(x=>x.offsetParent);if(!f.length)return;const a=f[0],z=f[f.length-1];
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}

/* ---------- section editing ---------- */
function secChanged(){const s=X.song;s.edited=true;s.lock=phraseLock(s.secs,s.f.s0);replan();renderStats();renderSecs();renderPlan();renderSettings();renderExport();renderTransport();drawSoon()}
function setLab(i,l){const s=X.song;if(!s||!s.secs[i]||!LABS.includes(l))return;s.secs[i].lab=l;secChanged();renderSecEd()}
// move the start ('s-'/'s+') or end ('e-'/'e+') of section i by one bar; neighbours follow, every section keeps ≥ 1 bar
function moveEdge(i,mv){const s=X.song;if(!s)return;const k=mv[0]==='s'?i:i+1,d=mv[1]==='+'?1:-1;if(setEdge(k,s.secs[k]?s.secs[k].a+d:null))renderSecEd()}
function setEdge(k,bar){const s=X.song,S=s.secs;if(k<=0||k>=S.length||bar==null)return false;bar=clamp(Math.round(bar),S[k-1].a+1,S[k].b-1);if(bar===S[k].a)return false;S[k-1].b=bar;S[k].a=bar;secChanged();return true}
function resetSecs(){const s=X.song;if(!s)return;s.secs=s.secs0.map(x=>({...x}));s.edited=false;secChanged();X.song.edited=false;renderSecs();closeSecEd(true)}
function openSecEd(i,from){X.secEd=i;X.secFrom=from||null;renderSecEd();const ed=$('#exEd');ed.hidden=false;placeEd(from);drawSoon();setTimeout(()=>{const b=ed.querySelector('[data-lab].on')||ed.querySelector('button');if(b)b.focus()},20)}
function closeSecEd(refocus){const ed=$('#exEd');if(!ed||ed.hidden){X.secEd=-1;return}ed.hidden=true;const i=X.secEd;X.secEd=-1;drawSoon();if(refocus){const b=document.querySelector(`#exSecs [data-sec="${i}"]`)||X.secFrom;if(b&&document.contains(b))b.focus()}}
function placeEd(from){
  const ed=$('#exEd'),v=$('#extendedView'),vr=v.getBoundingClientRect();let x=vr.left+20,y=window.scrollY+200;
  if(from&&from.getBoundingClientRect){const r=from.getBoundingClientRect();x=r.left;y=r.bottom+window.scrollY+6}
  else if(from&&from.x!=null){x=from.x;y=from.y+window.scrollY+10}
  const w=Math.min(340,vr.width-8);ed.style.width=w+'px';ed.style.left=clamp(x-vr.left,4,Math.max(4,vr.width-w-4))+'px';ed.style.top=(y-(vr.top+window.scrollY))+'px';
}
function renderSecEd(){
  const ed=$('#exEd'),s=X.song,i=X.secEd;if(!ed||!s||i<0||!s.secs[i]){if(ed)ed.hidden=true;return}
  const x=s.secs[i],nm=secNames(s.secs)[i],B=s.g.B;
  ed.innerHTML=`<div class="exedh"><span class="exsw2" style="--c:${rgb(LCOL[x.lab])}"></span><h3 id="exEdH">${esc(t('exSecEdit',{sec:nm}))}</h3><button type="button" class="mxib" data-a="close" aria-label="${esc(t('exClose'))}" title="${esc(t('exClose'))}">${IC.x}</button></div>
  <p class="exedr mono" dir="ltr">${esc(fmtT(srcT(s,x.a)))}–${esc(fmtT(srcT(s,x.b)))} · ${x.a+1}–${x.b} · ${esc(t('exBarsN',{n:x.b-x.a}))}</p>
  <div class="exedl" role="radiogroup" aria-label="${esc(t('exSecType'))}">${LABS.map(l=>`<button type="button" role="radio" aria-checked="${l===x.lab}" class="exlab${l===x.lab?' on':''}" data-lab="${l}" style="--c:${rgb(LCOL[l])}"><i aria-hidden="true"></i>${esc(labName(l))}</button>`).join('')}</div>
  <div class="exedm">
    <div><span>${esc(t('exSecStart'))}</span><span class="exstep" dir="ltr"><button type="button" class="btn ghost" data-mv="s-" aria-label="${esc(t('exSecStart')+': '+t('exEarlier'))}"${i===0||x.a-1<=s.secs[i-1].a?' disabled':''}>−1</button><output class="mono">${x.a+1}</output><button type="button" class="btn ghost" data-mv="s+" aria-label="${esc(t('exSecStart')+': '+t('exLater'))}"${i===0||x.a+1>=x.b?' disabled':''}>+1</button></span></div>
    <div><span>${esc(t('exSecEnd'))}</span><span class="exstep" dir="ltr"><button type="button" class="btn ghost" data-mv="e-" aria-label="${esc(t('exSecEnd')+': '+t('exEarlier'))}"${i===s.secs.length-1||x.b-1<=x.a?' disabled':''}>−1</button><output class="mono">${x.b}</output><button type="button" class="btn ghost" data-mv="e+" aria-label="${esc(t('exSecEnd')+': '+t('exLater'))}"${i===s.secs.length-1||x.b+1>=s.secs[i+1].b?' disabled':''}>+1</button></span></div>
  </div>
  ${s.edited?`<button type="button" class="lnk" data-a="reset">${esc(t('exSecReset'))}</button>`:''}`;
  void B;
}

/* ---------- library picker ---------- */
function openPick(btn){X.pickFrom=btn||null;$('#exPick').hidden=false;$('#exPickQ').value='';renderPick();setTimeout(()=>$('#exPickQ').focus(),30)}
function closePick(){const p=$('#exPick');if(!p||p.hidden)return;p.hidden=true;if(X.pickFrom&&document.contains(X.pickFrom))X.pickFrom.focus();X.pickFrom=null}
function renderPick(){
  const q=$('#exPickQ').value.trim().toLowerCase(),ul=$('#exPickL'),signed=CR.signedIn();
  const list=CR.readLib().filter(x=>x&&x.name&&(!q||String(x.name).toLowerCase().includes(q))),any=list.some(x=>x.file_path);
  $('#exPickN').textContent=!signed||!any?t('exLibEmpty'):'';ul.innerHTML='';
  for(const it of list){
    const ok=signed&&!!it.file_path,li=document.createElement('li');li.className='mxpr'+(ok?'':' dis');
    li.innerHTML='<span class="kbw"></span><div class="mxpt"><div class="tt"></div><div class="ar mono"></div></div><button type="button" class="btn ghost"></button>';
    if(it.key)li.querySelector('.kbw').append(CR.keyBadge({pc:it.key.pc,mode:it.key.mode}));
    li.querySelector('.tt').textContent=it.name;li.querySelector('.tt').dir='auto';
    li.querySelector('.ar').textContent=(it.bpm?`${CR.fmtBpm(Math.round(it.bpm*10)/10)} BPM · `:'')+CR.fmtS(it.dur||0)+(ok?'':` · ${t('exLibNoFile')}`);
    const b=li.querySelector('button');b.textContent=t('exLoad');b.disabled=!ok;b.onclick=()=>{closePick();loadLib(it)};ul.appendChild(li);
  }
}

/* ---------- render: panels ---------- */
function srcBtns(){return [['file','exFile'],['lib','exLib'],['tool','exTool']].map(([a,k])=>`<button type="button" class="btn ghost" data-a="${a}">${IC[a]}<span>${esc(t(k))}</span></button>`).join('')}
function renderSrc(){
  const el=$('#exSrc');if(!el)return;const s=X.song;el.classList.toggle('loaded',!!s||X.stage==='analyzing');el.setAttribute('aria-label',t('exDrop'));
  if(!s&&X.stage!=='analyzing'){
    const row=(l,arr)=>`<div class="exsr0"><span>${esc(t(l))}</span><div class="exsrr">${arr.map(([k,w,x])=>`<i class="${x?'x':''}" style="--c:${rgb(LCOL[k])};flex-grow:${w}"></i>`).join('')}</div></div>`;
    const O=[['intro',2],['verse',2],['build',1],['drop',2],['break',2],['drop',2],['outro',2]];
    el.innerHTML=`<div class="exempty"><div class="exdz"><span class="exdi">${IC.drop}</span><div class="exdt"><b>${esc(t('exDrop'))}</b><span class="snote">${esc(t('exDropH'))}</span></div><div class="mxsrc">${srcBtns()}</div>
      <ol class="exhow">${[1,2,3].map(n=>`<li><span class="mono" dir="ltr">${n}</span>${esc(t('exHow'+n))}</li>`).join('')}</ol></div>
      <div class="exschem">${row('exOrig',O)}${row('exExt',[['intro',4,1],...O.slice(0,4),['drop',1,1],...O.slice(4),['outro',4,1]])}
      <p class="exleg"><span><i aria-hidden="true"></i>${esc(t('exLegO'))}</span><span><i class="x" aria-hidden="true"></i>${esc(t('exLegS'))}</span></p></div></div>`;return;
  }
  if(!s){el.innerHTML=`<div class="exstrip"><span class="exsi">${IC.ext}</span><div class="exsn"><b dir="auto">${esc(X.procName||'')}</b></div><div class="exrepl"><span class="snote">${esc(t('exReplace'))}</span>${srcBtns()}</div></div>`;return}
  const info=CR.sepInfo(),kindL=s.kind==='ai'?t('exStemsAI'):s.kind==='tool'?t('exStemsTool'):t('exStemsQ');
  el.innerHTML=`<div class="exstrip"><span class="exsi">${IC.ext}</span>
    <div class="exsn"><b dir="auto" title="${esc(s.name)}">${esc(s.name)}</b>
      <span class="exkind${s.kind==='quick'?' lo':' ok'}"><i aria-hidden="true"></i>${esc(kindL)}</span></div>
    ${X.sep?`<div class="mxsepp exsepp" role="status"><span class="mxlm"></span><div class="bar"><i></i></div><button type="button" class="btn ghost" data-a="cancelSep">${esc(t('cancel'))}</button></div>`:
      s.kind==='quick'?`<button type="button" class="btn ghost exai" data-a="ai" title="${esc(t('exUpAiT'))}"${info.on&&!info.busy&&X.stage!=='generating'?'':' disabled'}>${IC.ai}<span>${esc(t('exUpAi'))}</span>${info.cost?`<span class="mxcost mono">${esc(t('exCost',{n:info.cost}))}</span>`:''}</button>`:''}
    <div class="exrepl"><span class="snote">${esc(t('exReplace'))}</span>${srcBtns()}</div></div>`;
  if(X.sep)renderSepP();
}
function renderSepP(){const el=$('#exSrc .exsepp');if(!el||!X.sep)return;el.querySelector('.mxlm').textContent=X.sep.msg||'';el.querySelector('.bar i').style.width=Math.round(clamp(X.sep.p,0,1)*100)+'%'}
function renderProc(){
  const el=$('#exProc');if(!el)return;
  const an=X.stage==='analyzing';el.hidden=!an;
  if(an){el.innerHTML=`<h2>${esc(t('exProcH',{n:X.procName||''}))}</h2>${stepList(AN_STEPS)}<div class="bar"><i></i></div><button type="button" class="lnk" data-a="cancelLoad">${esc(t('cancel'))}</button>`;renderProcP()}
  if(X.stage==='generating')renderPlan();
}
function stepList(keys){return `<ol class="exsteps">${keys.map(k=>{const s=X.steps[k]||'todo';return `<li class="${s}"><span class="exsd" aria-hidden="true">${s==='done'?IC.ok:''}</span><span>${esc(t('exS_'+k))}</span><span class="vh">${s==='done'?'✓':s==='run'?'…':''}</span></li>`}).join('')}</ol>`}
function renderProcP(){const p=Math.round(clamp(X.stepP,0,1)*100);document.querySelectorAll('#exProc .bar i,#exPlan .exgbar i').forEach(i=>{i.style.width=p+'%'})}
function renderStats(){
  const el=$('#exStats'),s=X.song;if(!el||!s)return;
  const cell=(k,v,tip,cls)=>`<div class="exst${cls?' '+cls:''}"${tip?` title="${esc(t(tip))}"`:''}><dt>${esc(t(k))}</dt><dd class="mono" dir="ltr">${v}</dd>${tip?`<span class="vh">${esc(t(tip))}</span>`:''}</div>`;
  const meter=x=>`${Math.round(x*100)}<small>%</small><span class="exmeter" aria-hidden="true"><i style="width:${Math.round(x*100)}%"></i></span>`;
  el.innerHTML=cell('exStBpm',esc(CR.fmtBpm(Math.round(s.an.bpm*10)/10)))+`<div class="exst exkey"><dt>${esc(t('exStKey'))}</dt><dd class="mono" dir="ltr"><i class="exkc" aria-hidden="true"></i>${esc(CR.keyText(s.an.key))}</dd></div>`+
    cell('exStLen',esc(fmtD(s.buffer.duration)))+cell('exStBars',String(s.g.nb))+cell('exStGroove',meter(s.groove||0),'exStGrooveT','exm')+cell('exStLock',meter(s.lock||0),'exStLockT','exm');
  {const c=CR.camOf(s.an.key);el.querySelector('.exkc').style.background=CR.camColor(c.n,c.l)}
  if((s.groove||0)<0.3)el.insertAdjacentHTML('beforeend',`<p class="exlow" role="note">${esc(t('exLowGroove'))}</p>`);
}
function renderSecs(){
  const el=$('#exSecs'),s=X.song;if(!el||!s)return;const nm=secNames(s.secs);
  el.innerHTML=s.secs.map((x,i)=>`<button type="button" class="exsc${i===X.secEd?' on':''}" data-sec="${i}" style="--c:${rgb(LCOL[x.lab])}" aria-haspopup="dialog"><i aria-hidden="true"></i><span>${esc(nm[i])}</span><small class="mono" dir="ltr">${x.a+1}–${x.b}</small></button>`).join('')+(s.edited?`<span class="exed1">${esc(t('exEdited'))}</span>`:'');
}
function seg(name,items,cur,attr,label){return `<div class="mxseg exseg" role="radiogroup" aria-label="${esc(label)}">${items.map(([v,l])=>`<button type="button" role="radio" aria-checked="${String(v)===String(cur)}" class="${String(v)===String(cur)?'on':''}" data-${attr}="${v}">${l}</button>`).join('')}</div>`}
function renderSettings(){
  const el=$('#exSet');if(!el||!X.song)return;const S=X.set,busy=X.stage==='generating';
  const opt=(arr,cur,io)=>arr.map(k=>`<option value="${k}"${k===cur?' selected':''}>${esc(t(k==='orig'?(io==='i'?'exSt_origI':'exSt_origO'):'exSt_'+k))}</option>`).join('');
  const focus=document.activeElement&&document.activeElement.id==='exCustom';
  if(focus)return;
  el.innerHTML=`<h2 id="exSetH" data-i="exSetH">${esc(t('exSetH'))}</h2>
  <div class="exfield"><h3>${esc(t('exPreset'))}</h3><div class="expre" role="radiogroup" aria-label="${esc(t('exPreset'))}">${Object.keys(PRESETS).map(k=>`<button type="button" role="radio" aria-checked="${S.preset===k}" class="${S.preset===k?'on':''}" data-ps="${k}"><b>${esc(t('exP_'+k))}</b><span>${esc(t('exP_'+k+'T'))}</span></button>`).join('')}</div></div>
  <div class="exfield"><h3>${esc(t('exLen'))}</h3>${seg('add',[...ADDS.map(a=>[a,'+'+(a<120?esc(t('exSec',{n:a})):esc(t('exMin',{n:a/60})))]),['custom',esc(t('exLenC'))]],S.add,'add',t('exLen'))}
    ${S.add==='custom'?`<label class="exnum"><span>${esc(t('exLenIn'))}</span><input type="number" id="exCustom" class="srch mono" min="0" max="600" step="1" dir="ltr" inputmode="numeric" value="${S.custom}"></label>`:''}</div>
  <div class="exrow2">
    <div class="exfield"><h3>${esc(t('exIntro'))}</h3>${seg('ib',BARN.map(n=>[n,`<span dir="ltr">${n}</span>`]),S.intro,'ib',t('exIntro'))}
      <label class="exsel"><span>${esc(t('exIStyle'))}</span><select class="sel" id="exIS">${opt(STYLES,S.is,'i')}</select></label></div>
    <div class="exfield"><h3>${esc(t('exOutro'))}</h3>${seg('ob',BARN.map(n=>[n,`<span dir="ltr">${n}</span>`]),S.outro,'ob',t('exOutro'))}
      <label class="exsel"><span>${esc(t('exOStyle'))}</span><select class="sel" id="exOS">${opt(STYLES,S.os,'o')}</select></label></div>
  </div>
  <div class="exgen"><button type="button" class="btn solid exgo" data-a="gen"${busy?' disabled':''}>${IC.ext}<span>${esc(t(busy?'exGenBusy':fresh()?'exGenAgain':X.render?'exGenAgain':'exGen'))}</span></button></div>`;
  el.querySelectorAll('button,select,input').forEach(x=>{if(busy&&!x.dataset.a)x.disabled=true});
}
function blkText(b){
  const s=X.song,p=X.plan,nm=secNames(s.secs)[b.sec],n=b.sb-b.sa;
  const lm=b.mask||b.lay,stems=lm?IDS.filter(id=>lm[id]).map(id=>t(id)).join(t('exPlus')):t('exFull');   // lay = the stage's stems when the mix of a drums-only part is used
  const fx=b.ft==='lp'?t(b.fx.f1>b.fx.f0+1?'exFxOpen':b.fx.f1<b.fx.f0-1?'exFxClose':'exFxLp'):b.ft==='hp'?t('exFxHp'):b.eq==='kh'?t('exFxKH'):'';
  const why=b.role==='orig'?t('exWhyOrig'):b.role==='intro'?t('exWhyIntro'):b.role==='outro'?t('exWhyOutro'):b.role==='cycle'?t('exWhyCycle'):t('exWhyRep',{sec:nm});
  const ttl=b.role==='orig'?nm:t('exR_'+b.role);   // a made block is titled by its role ("DJ outro"); where it came from goes in the source line
  return {nm,n,stems,fx,why,ttl,head:`${ttl} · ${t('exBarsN',{n})} · ${stems}`,from:t('exFrom',{sec:nm,t:iso(fmtT(srcT(s,b.sa))+'–'+fmtT(srcT(s,b.sb))),b:iso((b.sa+1)+'–'+b.sb)}),at:`${fmtT(outT(p,b.o0))}–${fmtT(outT(p,b.o1))}`};
}
function renderPlan(){
  const el=$('#exPlan'),p=X.plan,s=X.song;if(!el||!s)return;
  if(X.stage==='generating'){
    el.innerHTML=`<h2 id="exPlanH">${esc(t('exGenH'))}</h2>${stepList(STEPS)}<div class="bar exgbar"><i></i></div><button type="button" class="lnk" data-a="cancelGen">${esc(t('exCancel'))}</button>`;renderProcP();return;
  }
  if(!p){el.innerHTML='';return}
  const done=X.stage==='done'&&fresh();
  const sum=t('exPlanSum',{len:iso(fmtD(p.len)),add:fmtAdd(p.added),n:p.blocks.length});
  el.innerHTML=`${done?`<div class="exready" id="exReady"><span class="exok" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="21"/><path d="M14 24.5l7 7 13-14"/></svg></span><div><h2 id="exPlanH">${esc(t('exReady'))}</h2><p dir="auto">${esc(t('exReadyP',{len:iso(fmtD(p.len)),add:fmtAdd(p.added),n:p.blocks.length}))}</p></div></div>`:
    `<div class="explh"><h2 id="exPlanH">${esc(t('exPlanH'))}</h2><p class="snote" dir="auto">${esc(sum)} · ${esc(t('exTarget',{t:fmtAdd(p.target)}))}</p></div>`}
    ${p.over?`<p class="snote exover">${esc(t('exOver',{x:fmtAdd(p.added),t:fmtAdd(p.target)}))}</p>`:''}
    ${p.grown?`<p class="snote exover">${esc(t('exGrown',{x:fmtAdd(p.grown*p.B)}))}</p>`:''}${p.short?`<p class="snote exover">${esc(t('exShortBy',{x:fmtAdd(p.short)}))}</p>`:''}
    ${X.render&&!fresh()?`<p class="snote exstale">${esc(t('exStale'))}</p>`:''}
    <ol class="exlist" id="exList">${p.blocks.map((b,i)=>{const x=blkText(b),s0=X.song.secs[b.sec];return `<li><button type="button" class="exbk${i===X.sel?' on':''}${b.mask||b.lay?' st':''}" data-blk="${i}" aria-pressed="${i===X.sel}" style="--c:${rgb(LCOL[s0.lab])}">
      <span class="exbkc" aria-hidden="true"></span><span class="exbkm"><span class="exbkh"><b>${esc(x.ttl)}</b>${b.role==='orig'?`<span class="exrole">${esc(t('exR_orig'))}</span>`:''}</span><span class="exbks">${b.role==='orig'?'':esc(t('exFromS',{sec:x.nm}))+' · '}${esc(t('exBarsN',{n:x.n}))} · ${esc(x.stems)}${x.fx?' · '+esc(x.fx):''}</span></span><span class="exbkt mono" dir="ltr">${esc(x.at)}</span></button></li>`}).join('')}</ol>`;
}
function renderInsp(){
  const el=$('#exInsp'),p=X.plan;if(!el)return;
  if(!p||X.sel<0||!p.blocks[X.sel]){el.innerHTML=`<p class="exhint">${esc(t('exPickBlk'))}</p>`;return}
  const b=p.blocks[X.sel],x=blkText(b),lab=X.song.secs[b.sec].lab;
  el.innerHTML=`<span class="exic" style="--c:${rgb(LCOL[lab])}" aria-hidden="true"></span><div class="exit"><b>${esc(x.head)}</b><span>${esc(x.from)}</span><span class="exwhy">${esc(x.why)}${x.fx?' · '+esc(x.fx):''}</span></div><span class="exat mono" dir="ltr">${esc(x.at)}</span>`;
}
function selectBlock(i,fromList){
  const p=X.plan;if(!p)return;X.sel=i===X.sel&&fromList?-1:i;renderInsp();
  document.querySelectorAll('#exList [data-blk]').forEach(b=>{const on=+b.dataset.blk===X.sel;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
  if(X.pb.loop&&X.pb.playing)playPB(X.pb.which,heardPB());
  if(X.sel>=0){const b=p.blocks[X.sel],v=viewOf();const a=outT(p,b.o0);if(a<v.v0||a>v.v0+v.span){X.view0=a-v.span*0.1}}
  renderTransport();drawSoon();
}
function renderTransport(){
  if(!X.built)return;const P=X.pb,p=X.plan,s=X.song;
  for(const w of ['A','B']){const b=document.querySelector(`#exAB [data-pb="${w}"]`);if(!b)continue;const on=P.playing&&P.which===w,ok=!!pbBuf(w);
    b.querySelector('.ic').innerHTML=on?IC.pause:IC.play;const l=t(on?'exPause':w==='A'?'exPlayO':'exPlayE');b.title=l;b.setAttribute('aria-label',l);
    b.classList.toggle('on',P.which===w);b.classList.toggle('live',on);b.disabled=!ok;b.setAttribute('aria-pressed',String(P.which===w))}
  $('#exTA').textContent=s?fmtD(s.buffer.duration):'';$('#exTB').textContent=p?fmtD(p.len)+(playable()?'':' · '+t('exPlanned')):'';
  {const b=$('#exPlay'),on=P.playing,ok=!!pbBuf(P.which==='A'&&!on?'B':P.which);b.innerHTML=on?IC.pause:IC.play;const l=t(on?'exPause':P.which==='A'?'exPlayO':'exPlayE');
    b.title=l;b.setAttribute('aria-label',l);b.disabled=!ok&&!on;b.classList.toggle('live',on)}
  {const v=$('#exVol');if(v&&document.activeElement!==v){v.value=String(Math.round(vol()*100))}if(v){v.setAttribute('aria-label',t('exVol'));v.setAttribute('aria-valuetext',Math.round(vol()*100)+'%')}}
  $('#exAB').setAttribute('aria-label',t('exOrig')+' / '+t('exExt'));
  const sw=$('#exSw');sw.disabled=!(s&&playable());sw.title=t('exABT');sw.setAttribute('aria-label',t('exABT'));
  const lb=$('#exLoop');lb.disabled=X.sel<0;lb.classList.toggle('on',P.loop&&X.sel>=0);lb.setAttribute('aria-pressed',String(P.loop&&X.sel>=0));lb.title=t('exLoopT');
  $('#exStopB').disabled=!P.playing&&!P.pos[P.which];$('#exZi').disabled=X.zoom>=32;$('#exZo').disabled=X.zoom<=1;
  const cv=$('#exCv');if(cv&&s)cv.setAttribute('aria-label',t('exTlAria',{n:s.name,a:fmtD(s.buffer.duration),b:p?fmtD(p.len):'—'}));
  $('#exDeck').setAttribute('aria-label',s?t('exTlAria',{n:s.name,a:fmtD(s.buffer.duration),b:p?fmtD(p.len):'—'}):'');
  timeText();
}
function timeText(){const el=$('#exTime');if(!el)return;const P=X.pb,buf=pbBuf(P.which);el.textContent=buf?`${fmtT(heardPB())} / ${fmtT(buf.duration)}`:''}
function renderExport(){
  const el=$('#exExp');if(!el)return;const p=X.plan,s=X.song,ok=X.stage==='done'&&fresh();el.hidden=!(s&&X.render&&!X.rpart);if(el.hidden)return;
  const S=X.set,mp3=window.MP3&&MP3.supported;
  el.innerHTML=`<div class="mxexph"><h2 id="exExpH">${esc(t('exExpH'))}</h2><p class="snote" dir="auto">${p?esc(t('exExpP',{len:iso(fmtD(p.len)),bpm:iso(CR.fmtBpm(Math.round(s.an.bpm*10)/10)),k:iso(CR.keyText(s.an.key))})):''}</p></div>
  <div class="mxexpr exexpr">
    ${seg('fm',[['mp3','MP3 320'],['wav16','WAV 16-bit'],['wav24','WAV 24-bit']].filter(x=>x[0]!=='mp3'||mp3),S.fmt==='mp3'&&!mp3?'wav16':S.fmt,'fm',t('exExpH'))}
    <div class="exsr"><span class="snote">${esc(t('exRate'))}</span>${seg('sr',[[44100,'<span dir="ltr">44.1 kHz</span>'],[48000,'<span dir="ltr">48 kHz</span>']],S.sr,'sr',t('exRate'))}</div>
    <label class="mxchk"${S.fmt!=='mp3'?' hidden':''}><input type="checkbox" id="exCuesC"${S.cues?' checked':''}${window.CRATE&&CRATE.tagMp3?'':' disabled'}><span>${esc(t('exCues'))}</span></label>
    <button type="button" class="btn solid" data-a="exp"${ok&&!X.exporting?'':' disabled'}>${IC.dl}<span>${esc(t('exExpBtn'))}</span><i class="ptchip" id="exExpPts" hidden></i></button>
  </div>
  <div class="mxprog" id="exExpProg"${X.exporting?'':' hidden'}><div class="bar"><i></i></div></div>
  <p class="snote exdlnote">${esc(t('exDlNote'))}</p>
  <p class="snote mxexpmsg" id="exExpMsg" role="status" aria-live="polite">${ok?'':esc(t('exNeedGen'))}</p>`;
  el.querySelectorAll('[data-fm],[data-sr],#exCuesC').forEach(x=>{if(X.exporting)x.disabled=true});
  renderExpPts();
}
const roleName=b=>b.role==='orig'?secNames(X.song.secs)[b.sec]:t('exR_'+b.role);
// joins navigator + quality: hear every transition (4 bars before → 4 after) before downloading
function renderPreview(){
  const el=$('#exPv');if(!el)return;const p=X.plan,s=X.song,J=joinList(),ok=!!pbBuf('B'),q=X.quality&&fresh()?X.quality:null;
  el.hidden=!s||!p||(!J.length&&!q);if(el.hidden)return;
  const open=!!($('#exQp')&&!$('#exQp').hidden);
  const i=X.join>=0&&X.join<J.length?X.join:-1,j=i>=0?J[i]:null;
  const qj=q&&j?q.joins.find(x=>Math.abs(x.t-j.t)<1e-3):null;
  const lab=j?`${t('exJoinN',{i:i+1,n:J.length})} · ${iso(fmtT(j.t))} · ${roleName(p.blocks[j.i-1])} → ${roleName(p.blocks[j.i])}`:`${t('exJoins')} · ${J.length}`;
  const row=(k,v,good)=>`<div class="exqr${good?'':' warn'}"><dt>${esc(t(k))}</dt><dd class="mono" dir="ltr">${esc(v)}</dd></div>`;
  const info=CR.sepInfo(),ai=q&&s.kind==='quick'&&(q.bleed||q.cuts)&&info.on;
  el.innerHTML=`<div class="exjn" role="group" aria-label="${esc(t('exJoins'))}">
      <span class="exjic" aria-hidden="true">${IC.join}</span>
      <button type="button" class="mxib" data-jn="prev" aria-label="${esc(t('exJoinPrev'))}" title="${esc(t('exJoinPrev'))}"${J.length&&ok?'':' disabled'}>${IC.prev}</button>
      <span class="exjl" aria-live="polite" dir="auto">${esc(lab)}${qj?` <i class="exjq ${qj.clean?'ok':'warn'}">${esc(t(qj.clean?'exJoinOk':'exJoinWarn'))}</i>`:''}</span>
      <button type="button" class="mxib" data-jn="next" aria-label="${esc(t('exJoinNext'))}" title="${esc(t('exJoinNext'))}"${J.length&&ok?'':' disabled'}>${IC.next}</button>
      <button type="button" class="exjp" data-jn="play" title="${esc(t('exJoinPlayT'))}"${J.length&&ok?'':' disabled'}>${IC.play}<span>${esc(t('exJoinPlay'))}</span></button>
    </div>
    ${X.rpart?`<span class="exheadn" role="status"><i aria-hidden="true"></i>${esc(t('exHead'))}</span>`:''}
    ${q?`<button type="button" class="exq ${q.score>=85?'ok':q.score>=65?'mid':'lo'}" data-a="q" aria-expanded="${open}" aria-controls="exQp" title="${esc(t('exQT'))}"><span>${esc(t('exQ'))}</span><b class="mono" dir="ltr">${q.score}</b></button>
    <div class="exqp" id="exQp"${open?'':' hidden'}><p class="exqh">${esc(t('exQT'))}</p><dl>
      ${row('exQClean',q.clean+'%',q.clean>=85)}${row('exQSeam',Math.round(q.seam*100)+'%',q.seam>=0.7)}${row('exQLu','±'+q.lu+' dB',q.lu<=1.5)}${row('exQCuts',q.cuts?String(q.cuts):t('exQNone'),!q.cuts)}</dl>
      ${q.bleed?`<p class="exqb">${esc(t('exQBleed'))}</p>`:''}
      ${ai?`<button type="button" class="btn ghost exai" data-a="ai"${X.sep||info.busy?' disabled':''}>${IC.ai}<span>${esc(t('exQAi'))}</span>${info.cost?`<span class="mxcost mono">${esc(t('exCost',{n:info.cost}))}</span>`:''}</button>`:''}
    </div>`:''}`;
}
function renderAll(){
  if(!X.built)return;const s=X.song,an=X.stage==='analyzing';
  renderSrc();setMsg(X.msg,X.msgErr);renderProc();
  $('#exMain').hidden=!s||an;
  if(s&&!an){renderStats();renderSecs();renderSettings();renderPlan();renderInsp();renderTransport();renderPreview();renderExport();sizeCanvas();drawSoon()}
  if(X.secEd>=0)renderSecEd();
}

/* ---------- timeline (one canvas: original lane, links, extended lane) ---------- */
const TL={W:0,H:0,dpr:1,dirty:true,raf:0,lay:null};
function layout(){const m=TL.W<560,wv=m?40:62,bd=m?16:18,lk=m?26:36,lb=16;let y=4;const L={};
  L.ru=[y,16];y+=18;L.la=[y,lb];y+=lb;L.ba=[y,bd];y+=bd+2;L.wa=[y,wv];y+=wv;L.lk=[y,lk];y+=lk;L.lb=[y,lb];y+=lb;L.bb=[y,bd];y+=bd+2;L.wb=[y,wv];y+=wv+6;L.h=y;return L}
function sizeCanvas(){
  const box=$('#exTl');if(!box||!box.clientWidth)return;const d=Math.min(2,window.devicePixelRatio||1),w=box.clientWidth;TL.W=w;TL.lay=layout();const h=TL.lay.h;
  box.style.height=h+'px';TL.H=h;TL.dpr=d;for(const id of ['#exCv','#exOv']){const cv=$(id);cv.width=Math.round(w*d);cv.height=Math.round(h*d);cv.style.height=h+'px'}TL.dirty=true;
}
function total(){const s=X.song,p=X.plan;return Math.max(s?s.buffer.duration:1,p?p.len:1)}
function viewOf(){const T=total(),span=T/X.zoom;X.view0=clamp(X.view0,0,Math.max(0,T-span));return {v0:X.view0,span}}
const xOf=(v,x)=>(x-v.v0)/v.span*TL.W;
function tok(n){return getComputedStyle($('#extendedView')).getPropertyValue(n).trim()}
function cols(){return {line:tok('--deckline')||'#2A2A31',lane:tok('--deck2')||'#141418',text:tok('--deckmuted')||'#8B8B93',hi:tok('--decktext')||'#EDEDEF',mono:tok('--mono'),sans:tok('--sans')}}
function drawSoon(){TL.dirty=true;kick()}
function kick(){if(!TL.raf&&X.visible)TL.raf=requestAnimationFrame(frame)}
function frame(){
  TL.raf=0;if(!X.visible||!X.song||!TL.lay)return;
  const P=X.pb;if(P.playing&&X.zoom>1){const v=viewOf(),h=heardPB(),hx=P.which==='A'?h:h;if(hx>v.v0+v.span*0.92||hx<v.v0){X.view0=hx-v.span*0.08;TL.dirty=true}}
  if(TL.dirty){TL.dirty=false;drawStatic()}
  drawHead();timeText();beatTick();
  const anim=X.fin&&performance.now()-X.fin<1600&&!reduced();
  if(P.playing||X.drag||anim)kick();
}
function waveCols(g,w,y,h,v,map,alpha,scale){
  // map(xTime) → source time or null; draws the RGB waveform like the tool
  const mid=y+h/2,px=v.span/TL.W;g.globalAlpha=alpha;
  for(let x=0;x<TL.W;x++){const ta=v.v0+x*px,m=map(ta,ta+px);if(!m)continue;const [pa,pb,sc]=m;
    const i0=Math.max(0,Math.floor(pa*w.rate)),i1=Math.min(w.len,Math.max(i0+1,Math.ceil(pb*w.rate)));if(i0>=w.len||i1<=0)continue;
    const r=CR.sliceRange(w,i0,i1),a=r[0]*(sc==null?1:sc)*(scale||1),bi=r[4],hh=Math.max(0.6,a*(h/2-1));
    g.fillStyle=CR.wcol(w.col[bi*3],w.col[bi*3+1],w.col[bi*3+2]);g.fillRect(x,mid-hh,1,hh*2)}
  g.globalAlpha=1;
}
const maskScale=m=>m?Math.min(1,0.15+(m.drums?0.45:0)+(m.bass?0.25:0)+(m.other?0.25:0)+(m.vocals?0.25:0)):1;
function rr(g,x,y,w,h,r){g.beginPath();if(g.roundRect)g.roundRect(x,y,w,h,r);else g.rect(x,y,w,h)}
function drawStatic(){
  const cv=$('#exCv'),s=X.song,p=X.plan,L=TL.lay;if(!cv||!TL.W||!s)return;
  const g=cv.getContext('2d'),c=cols(),v=viewOf(),d=TL.dpr;g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,TL.W,TL.H);
  g.textAlign='left';try{g.direction=document.documentElement.dir==='rtl'?'rtl':'ltr'}catch(e){}   // words shape and order like the page; positions stay on the LTR timeline
  const B=s.g.B,small=TL.W<560;
  // lanes
  for(const k of ['ba','wa','bb','wb']){g.fillStyle=c.lane;g.fillRect(0,L[k][0],TL.W,L[k][1])}
  // ruler: extended bars
  const rb=p?p.P:s.g.fd,barPx=B/v.span*TL.W,every=[1,2,4,8,16,32,64].find(n=>n*barPx>=36)||64;
  g.font='10px '+c.mono;g.textBaseline='middle';
  const k0=Math.floor((v.v0-rb)/B),k1=Math.ceil((v.v0+v.span-rb)/B);
  for(let k=Math.max(0,k0);k<=k1;k++){const x=Math.round(xOf(v,rb+k*B))+0.5;if(x<-1||x>TL.W+1)continue;const strong=mod(k,4)===0;
    g.fillStyle=c.line;g.globalAlpha=strong?0.9:0.4;if(barPx>3||strong){g.fillRect(x,L.bb[0],1,L.wb[0]+L.wb[1]-L.bb[0])}g.globalAlpha=1;
    if(mod(k,every)===0){g.fillStyle=c.text;g.fillRect(x,L.ru[0]+10,1,6);g.fillText(String(k+1),x+3,L.ru[0]+7)}}
  // original lane grid (lighter)
  {const k0a=Math.floor((v.v0-s.g.fd)/B),k1a=Math.ceil((v.v0+v.span-s.g.fd)/B);g.fillStyle=c.line;
    for(let k=Math.max(0,k0a);k<=Math.min(s.g.nb,k1a);k++){if(barPx<=3&&mod(k,4))continue;const x=Math.round(xOf(v,srcT(s,k)))+0.5;g.globalAlpha=mod(k,4)?0.35:0.8;g.fillRect(x,L.ba[0],1,L.wa[0]+L.wa[1]-L.ba[0])}g.globalAlpha=1}
  // lane titles
  g.font='600 11px '+c.sans;g.fillStyle=c.hi;g.textBaseline='middle';
  const ttl=(y,txt,sub)=>{g.fillStyle=c.hi;g.fillText(txt,2,y+8);const w=g.measureText(txt).width;g.fillStyle=c.text;g.font='10.5px '+c.mono;g.fillText(sub,w+10,y+8);g.font='600 11px '+c.sans};
  ttl(L.la[0],t('exOrig'),`${fmtD(s.buffer.duration)} · ${t('exBarsN',{n:s.g.nb})}`);
  if(p)ttl(L.lb[0],t('exExt'),`${fmtD(p.len)} · ${t('exBarsN',{n:p.bars})}${playable()?'':' · '+t('exPlanned')}`);
  // original sections
  const nm=secNames(s.secs);
  s.secs.forEach((x,i)=>{const x0=xOf(v,srcT(s,x.a)),x1=xOf(v,srcT(s,x.b));if(x1<0||x0>TL.W)return;const col=LCOL[x.lab];
    g.fillStyle=rgb(col);g.globalAlpha=0.92;rr(g,x0+1,L.ba[0]+1,Math.max(1,x1-x0-2),L.ba[1]-2,3);g.fill();g.globalAlpha=1;
    if(i===X.secEd||(X.sel>=0&&p&&p.blocks[X.sel]&&p.blocks[X.sel].sec===i)){g.strokeStyle='#fff';g.lineWidth=1.5;rr(g,x0+1,L.ba[0]+1,Math.max(1,x1-x0-2),L.ba[1]-2,3);g.stroke()}
    g.font='600 '+(small?9.5:10.5)+'px '+c.sans;if(g.measureText(nm[i]).width<x1-x0-10){g.fillStyle='#0A0A0C';g.fillText(nm[i],x0+6,L.ba[0]+L.ba[1]/2+0.5)}});
  // original waveform
  if(s.an.wave){const dur=s.buffer.duration;waveCols(g,s.an.wave,L.wa[0],L.wa[1],v,(a,b)=>a>dur?null:[a,Math.min(b,dur)],1)}
  if(!p)return;
  // links: each block ← its source range
  const yA=L.wa[0]+L.wa[1],yB=L.lb[0];
  const show=X.reveal===Infinity?p.blocks.length:X.reveal;
  p.blocks.forEach((b,i)=>{if(i>=show)return;const col=LCOL[s.secs[b.sec].lab],on=i===X.sel||i===X.hover;if(X.sel>=0&&!on&&X.hover<0&&i!==X.sel){}
    const a0=xOf(v,srcT(s,b.sa)),a1=xOf(v,srcT(s,b.sb)),b0=xOf(v,outT(p,b.o0)),b1=xOf(v,outT(p,b.o1));if(Math.max(a1,b1)<0||Math.min(a0,b0)>TL.W)return;
    const my=(yA+yB)/2;g.beginPath();g.moveTo(a0,yA);g.bezierCurveTo(a0,my,b0,my,b0,yB);g.lineTo(b1,yB);g.bezierCurveTo(b1,my,a1,my,a1,yA);g.closePath();
    g.fillStyle=`rgba(${col[0]},${col[1]},${col[2]},${on?0.42:X.sel>=0?0.05:b.role==='orig'?0.07:0.14})`;g.fill();
    if(on){g.strokeStyle=rgb(col);g.lineWidth=1;g.stroke()}});
  // extended blocks
  const rw=fresh()?X.rwave:null;
  p.blocks.forEach((b,i)=>{if(i>=show)return;const x0=xOf(v,outT(p,b.o0)),x1=xOf(v,outT(p,b.o1));if(x1<0||x0>TL.W)return;const col=LCOL[s.secs[b.sec].lab];
    g.fillStyle=rgb(col);g.globalAlpha=b.mask||b.lay?0.62:0.92;rr(g,x0+1,L.bb[0]+1,Math.max(1,x1-x0-2),L.bb[1]-2,3);g.fill();g.globalAlpha=1;
    if(b.mask||b.lay){g.save();rr(g,x0+1,L.bb[0]+1,Math.max(1,x1-x0-2),L.bb[1]-2,3);g.clip();g.strokeStyle='rgba(10,10,12,.35)';g.lineWidth=2;for(let q=x0-L.bb[1];q<x1;q+=7){g.beginPath();g.moveTo(q,L.bb[0]+L.bb[1]);g.lineTo(q+L.bb[1],L.bb[0]);g.stroke()}g.restore()}
    if(i===X.sel){g.strokeStyle='#fff';g.lineWidth=2;rr(g,x0+1,L.bb[0]+1,Math.max(1,x1-x0-2),L.bb[1]-2,3);g.stroke()}
    const bl=b.role==='intro'||b.role==='outro'?t('exR_'+b.role):nm[b.sec];g.font='600 '+(small?9.5:10.5)+'px '+c.sans;if(g.measureText(bl).width<x1-x0-10){g.fillStyle='#0A0A0C';g.fillText(bl,x0+6,L.bb[0]+L.bb[1]/2+0.5)}
    if(!rw&&s.an.wave){const sc=maskScale(b.mask||b.lay),a=outT(p,b.o0),z=outT(p,b.o1),sa=srcT(s,b.sa);
      g.save();g.beginPath();g.rect(x0,L.wb[0],x1-x0,L.wb[1]);g.clip();waveCols(g,s.an.wave,L.wb[0],L.wb[1],v,(ta,tb)=>tb<a||ta>z?null:[sa+(ta-a),sa+(tb-a),sc],fresh()?1:0.5);g.restore()}
  });
  if(rw){waveCols(g,rw,L.wb[0],L.wb[1],v,(a,b)=>a>p.len?null:[a,Math.min(b,p.len)],1)}
  // joins: a tick under the extended lane title (green = clean, amber = worth a listen, white = the one being heard)
  if(show>=p.blocks.length){const q=fresh()?X.quality:null;joinList().forEach((j,i)=>{const x=xOf(v,j.t);if(x<-4||x>TL.W+4)return;const qj=q&&q.joins.find(z=>Math.abs(z.t-j.t)<1e-3);
    g.fillStyle=i===X.join?'#fff':qj?(qj.clean?(tok('--ok')||'#22C55E'):(tok('--warn')||'#FFB020')):'rgba(255,255,255,.55)';
    g.beginPath();g.moveTo(x-4,L.lb[0]+L.lb[1]-1);g.lineTo(x+4,L.lb[0]+L.lb[1]-1);g.lineTo(x,L.lb[0]+L.lb[1]+5);g.closePath();g.fill();
    if(i===X.join){g.fillRect(Math.round(x)-0.5,L.bb[0],1,L.wb[0]+L.wb[1]-L.bb[0])}})}
  // loop range
  const lp=X.pb.loop&&loopRange(X.pb.which);if(lp){const isA=X.pb.which==='A',y0=isA?L.ba[0]:L.bb[0],y1=isA?L.wa[0]+L.wa[1]:L.wb[0]+L.wb[1];const x0=xOf(v,lp[0]),x1=xOf(v,lp[1]);g.fillStyle='rgba(255,176,32,.14)';g.fillRect(x0,y0,x1-x0,y1-y0);g.fillStyle=tok('--warn')||'#FFB020';g.fillRect(x0,y0-3,x1-x0,2)}
}
function drawHead(){
  const cv=$('#exOv'),s=X.song,p=X.plan,L=TL.lay;if(!cv||!TL.W||!s)return;
  const g=cv.getContext('2d'),d=TL.dpr,v=viewOf();g.setTransform(d,0,0,d,0,0);g.clearRect(0,0,TL.W,TL.H);
  // finish sweep over the extended lane
  if(X.fin&&!reduced()){const e=(performance.now()-X.fin)/1400;if(e<1){const x=e*TL.W*1.3-TL.W*0.15,gr=g.createLinearGradient(x-120,0,x+40,0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(0.8,'rgba(255,255,255,.28)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,L.bb[0],TL.W,L.wb[0]+L.wb[1]-L.bb[0])}}
  if(X.drag&&X.drag.kind==='edge'&&X.drag.bar!=null){const x=xOf(v,srcT(s,X.drag.bar));g.fillStyle='#fff';g.fillRect(Math.round(x)-1,L.ba[0]-2,2,L.wa[0]+L.wa[1]-L.ba[0]+4)}
  const P=X.pb,h=heardPB();
  const mark=(x,y0,y1,solid)=>{if(x<0||x>TL.W)return;g.fillStyle=solid?'#fff':'rgba(255,255,255,.45)';g.fillRect(Math.round(x)-0.5,y0,solid?2:1,y1-y0);if(solid){g.beginPath();g.moveTo(x-5,y0);g.lineTo(x+6,y0);g.lineTo(x+0.5,y0+6);g.fill()}};
  const xa=xOf(v,P.which==='A'?h:extToSrc(h)),xb=xOf(v,P.which==='B'?h:srcToExt(h));
  if(P.playing||h>0||P.which){mark(xa,L.ba[0],L.wa[0]+L.wa[1],P.which==='A');if(p)mark(xb,L.bb[0],L.wb[0]+L.wb[1],P.which==='B'&&!!pbBuf('B'))}
}
let lastBeat=null;
function beatTick(){const P=X.pb,s=X.song;if(!P.playing||!s){lastBeat=null;return}const h=heardPB(),base=P.which==='A'?s.g.fd:X.plan?X.plan.P:0,b=Math.floor((h-base)/s.g.T+1e-4);
  if(b!==lastBeat){const first=lastBeat==null;lastBeat=b;if(!first&&h>=base){const bar=mod(b,4)===0;if(window.A11Y&&A11Y.beat)A11Y.beat(bar);if(window.BG)BG.pulse(bar?0.7:0.35)}}}
function zoom(f){const v=viewOf(),mid=X.pb.playing?heardPB():v.v0+v.span/2;X.zoom=clamp(X.zoom*f,1,32);const ns=total()/X.zoom;X.view0=clamp(mid-ns/2,0,Math.max(0,total()-ns));renderTransport();drawSoon()}
function hitAt(e){
  const box=$('#exTl'),r=box.getBoundingClientRect(),L=TL.lay,v=viewOf(),x=e.clientX-r.left,y=e.clientY-r.top,tm=v.v0+x/r.width*v.span,s=X.song,p=X.plan;
  const inR=k=>y>=L[k][0]-1&&y<L[k][0]+L[k][1]+1;
  if(inR('ba')||inR('la')){const i=s.secs.findIndex(q=>tm>=srcT(s,q.a)&&tm<srcT(s,q.b));
    for(let k=1;k<s.secs.length;k++){const ex=xOf(v,srcT(s,s.secs[k].a));if(Math.abs(ex-x)<=6)return {zone:'edge',k,tm,x,y}}
    return {zone:'sec',i,tm,x,y}}
  if(inR('wa'))return {zone:'wa',tm,x,y};
  if(p&&(inR('bb')||inR('lb')||inR('lk')))return {zone:'blk',i:p.blocks.findIndex(b=>tm>=outT(p,b.o0)&&tm<outT(p,b.o1)),tm,x,y};
  if(p&&inR('wb'))return {zone:'wb',tm,x,y,i:p.blocks.findIndex(b=>tm>=outT(p,b.o0)&&tm<outT(p,b.o1))};
  return {zone:'none',tm,x,y};
}
function wireTimeline(){
  const box=$('#exTl'),tip=$('#exTip');
  box.addEventListener('pointerdown',e=>{
    if(!X.song||e.button>0)return;const h=hitAt(e);
    if(h.zone==='edge'){box.setPointerCapture(e.pointerId);e.preventDefault();X.drag={kind:'edge',k:h.k,bar:X.song.secs[h.k].a};closeSecEd();kick();return}
    X.drag={kind:'click',h,x:e.clientX};
  });
  box.addEventListener('pointermove',e=>{
    if(!X.song||!TL.lay)return;const d=X.drag;
    if(d&&d.kind==='edge'){const h=hitAt(e),s=X.song;d.bar=clamp(Math.round((h.tm-s.g.fd)/s.g.B),s.secs[d.k-1].a+1,s.secs[d.k].b-1);kick();return}
    const h=hitAt(e);box.style.cursor=h.zone==='edge'?'col-resize':h.zone==='sec'||h.zone==='blk'?'pointer':h.zone==='wa'||h.zone==='wb'?'text':'default';
    const hv=h.zone==='blk'||h.zone==='wb'?h.i:-1;
    if(hv!==X.hover){X.hover=hv;drawSoon()}
    if(hv>=0&&X.plan&&(X.reveal===Infinity||hv<X.reveal)){const x=blkText(X.plan.blocks[hv]);tip.innerHTML=`<b>${esc(x.head)}</b><span>${esc(x.from)}</span><span class="exwhy">${esc(x.why)}${x.fx?' · '+esc(x.fx):''}</span>`;tip.hidden=false;
      const r=box.getBoundingClientRect(),tw=tip.offsetWidth;tip.style.left=clamp(h.x+12,4,r.width-tw-4)+'px';tip.style.top=(TL.lay.lk[0]-4)+'px'}
    else tip.hidden=true;
  });
  box.addEventListener('pointerleave',()=>{tip.hidden=true;if(X.hover>=0){X.hover=-1;drawSoon()}});
  const end=e=>{
    const d=X.drag;if(!d)return;X.drag=null;
    if(d.kind==='edge'){if(d.bar!=null)setEdge(d.k,d.bar);drawSoon();return}
    if(Math.abs(e.clientX-d.x)>4)return;const h=d.h;
    if(h.zone==='sec'&&h.i>=0)openSecEd(h.i,{x:e.clientX,y:e.clientY});
    else if(h.zone==='wa')seekPB('A',h.tm);
    else if(h.zone==='blk'&&h.i>=0)selectBlock(h.i);
    else if(h.zone==='wb'){if(pbBuf('B'))seekPB('B',h.tm);else if(h.i>=0)selectBlock(h.i)}
  };
  box.addEventListener('pointerup',end);box.addEventListener('pointercancel',()=>{X.drag=null;drawSoon()});
  box.addEventListener('wheel',e=>{if(X.zoom<=1)return;e.preventDefault();const v=viewOf();X.view0=clamp(X.view0+(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)/600*v.span,0,total()-v.span);drawSoon()},{passive:false});
}
function finAnim(){X.fin=performance.now();if(reduced())X.fin=0;kick()}

/* ---------- export ---------- */
function wavBytes(L,R,sr,bits){
  const n=L.length,bps=bits/8,blk=2*bps,size=n*blk,buf=new ArrayBuffer(44+size),v=new DataView(buf);
  const w4=(o,s)=>{for(let i=0;i<4;i++)v.setUint8(o+i,s.charCodeAt(i))};
  w4(0,'RIFF');v.setUint32(4,36+size,true);w4(8,'WAVE');w4(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*blk,true);v.setUint16(32,blk,true);v.setUint16(34,bits,true);w4(36,'data');v.setUint32(40,size,true);
  if(bits===16){const pcm=new Int16Array(buf,44,n*2);for(let i=0,j=0;i<n;i++){pcm[j++]=clamp(L[i],-1,1)*32767;pcm[j++]=clamp(R[i],-1,1)*32767}}
  else{const u=new Uint8Array(buf,44);let o=0;for(let i=0;i<n;i++)for(const x of [L[i],R[i]]){let q=Math.round(clamp(x,-1,1)*8388607);if(q<0)q+=16777216;u[o++]=q&255;u[o++]=(q>>8)&255;u[o++]=(q>>16)&255}}
  return new Uint8Array(buf);
}
function fileBase(name){const m=String(name).split(/\s[-–—]\s/);const base=m.length>=2?`${m[0].trim()} - ${m.slice(1).join(' - ').trim()}`:String(name).trim();return (base+' (Extended Mix)').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\s+/g,' ').slice(0,180)}
// cue points of the NEW arrangement (seconds): intro = 0, first drop/chorus of the original body, DJ outro / last outro
function newCues(){
  const p=X.plan,s=X.song,out=[{k:'intro',t:0}];if(!p)return out;
  const dr=p.blocks.find(b=>b.role==='orig'&&['drop','chorus'].includes(s.secs[b.sec].lab));if(dr)out.push({k:'drop',t:outT(p,dr.o0)});
  const oz=p.blocks.find(b=>b.role==='outro')||p.blocks.find(b=>b.role==='orig'&&s.secs[b.sec].lab==='outro');if(oz)out.push({k:'outro',t:outT(p,oz.o0)});
  return out.map(c=>({k:c.k,t:Math.round(c.t*1000)/1000}));
}
const PAID=new WeakSet();           // renders already paid for (points v2)
const settleP=(p,n)=>{if(!p)return;if(CR.settleN)CR.settleN(p,n);else if(n>0&&p.id&&CR.refundN)CR.refundN(p,n)};   // points v2: refund n units + close the crash journal
function renderExpPts(){const el=$('#exExpPts');if(!el)return;const c=CR.priceChip&&!(X.render&&PAID.has(X.render))?CR.priceChip('extended',1):'';el.hidden=!c;el.textContent=c}
document.addEventListener('cr-prices',()=>{if(X.built)renderExpPts()});
async function exportExt(){
  if(X.exporting||X.paying)return;const s=X.song,p=X.plan;if(!s||!p||!fresh()){setExp(t('exNeedGen'),true);return}
  /* points v2: the export costs the 'extended' price; generating and previewing are free, and exporting the SAME render
     again in this session (another format / sample rate) is free too */
  let pay=null,paidOk=false;
  if(X.render&&!PAID.has(X.render)&&CR.payN){X.paying=true;try{pay=await CR.payN('extended',1,{ref:String(s.name).slice(0,150)})}finally{X.paying=false}   // no 2nd charge on a double click
    if(!pay)return;if(X.exporting||!fresh()){settleP(pay,1);return}}
  X.exporting=true;stopPB(true);renderExport();const prog=q=>{const i=$('#exExpProg .bar i');if(i)i.style.width=Math.round(clamp(q,0,1)*100)+'%'};prog(0);setExp(t('exRendering',{p:0}));
  try{
    const S=X.set,mp3=S.fmt==='mp3'&&window.MP3&&MP3.supported;
    let buf=X.render;if(buf.sampleRate!==S.sr){buf=await renderAudio(s,p,S.sr,q=>{prog(q*0.5);setExp(t('exRendering',{p:Math.round(q*50)}))})}
    const L=buf.getChannelData(0),R=buf.getChannelData(1),sr=buf.sampleRate,base=fileBase(s.name),kn=CR.keyName(s.an.key.pc,s.an.key.mode,true),bpmS=String(Math.round(s.an.bpm*100)/100);
    let data,ext;
    if(mp3){
      const nm=String(s.name).split(/\s[-–—]\s/),title=(nm.length>=2?nm.slice(1).join(' - '):s.name)+' (Extended Mix)',artist=nm.length>=2?nm[0]:'';
      data=await MP3.encode(L,R,sr,{kbps:320,tags:{title,artist,bpm:s.an.bpm,key:kn},onProgress:q=>{prog(0.5+q*0.5);setExp(t('encoding',{p:Math.round(q*100)}))}});ext='mp3';
      if(S.cues&&window.CRATE&&CRATE.tagMp3){try{data=CRATE.tagMp3(data,{bpm:bpmS,key:kn,cam:'',cues:newCues()})}catch(e){console.warn(e)}}
    }else{data=wavBytes(L,R,sr,S.fmt==='wav24'?24:16);ext='wav'}
    const fname=base+'.'+ext,blob=new Blob([data],{type:mp3?'audio/mpeg':'audio/wav'});
    CR.saveBlob(blob,fname);prog(1);paidOk=true;if(X.render)PAID.add(X.render);
    CR.log('extended_export',`${s.name} · ${fmtD(p.len)} (+${Math.round(p.added)} s) · ${t('exP_'+S.preset)} · ${ext}${ext==='wav'?' '+(S.fmt==='wav24'?24:16):''} · ${sr}`);
    X.lastExport={name:fname,size:blob.size,sr,n:L.length,fmt:S.fmt};
    setExp(t('exDone',{f:fname,s:(blob.size/1048576).toFixed(1)}));
  }catch(e){console.error(e);setExp(e&&/MP3/.test(String(e.message))?t('mp3Fail'):t('exExpFail'),true)}
  finally{X.exporting=false;settleP(pay,paidOk?0:1);   // failed export → points back
    if(!X.visible){freeMem();return}   // the view was left while exporting: free now (hide() skipped it)
    const m=$('#exExpMsg'),keep=m?[m.textContent,m.classList.contains('err')]:null;renderExport();if(keep)setExp(keep[0],keep[1])}
}
function setExp(m,err){const el=$('#exExpMsg');if(!el)return;el.textContent=m||'';el.classList.toggle('err',!!err)}

/* ---------- keys ---------- */
document.addEventListener('keydown',e=>{
  if(!X.visible||!X.song||e.metaKey||e.ctrlKey||e.altKey)return;
  if(!$('#exPick').hidden||!$('#exEd').hidden)return;
  if(e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(document.querySelector('.rm-panel:not([hidden]),#authDlg:not([hidden])')&&e.target.closest('.rm-panel,#authDlg'))return;
  const P=X.pb;
  if(e.code==='Space'){if(e.target.closest('button,label,a'))return;e.preventDefault();togglePB()}
  else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){if(e.target.closest('.exset,.explan'))return;const buf=pbBuf(P.which);if(!buf)return;e.preventDefault();seekPB(P.which,heardPB()+(e.key==='ArrowRight'?1:-1)*X.song.g.B)}
  else if(e.key==='t'||e.key==='T')abSwitch();
  else if(e.key==='l'||e.key==='L')loopToggle();
  else if(e.key==='j'||e.key==='J'){const J=joinList();if(!J.length||!pbBuf('B'))return;e.preventDefault();playJoin(e.shiftKey?(X.join<0?J.length:X.join)-1:X.join+1)}
});

/* ---------- public ---------- */
function freeMem(){
  const s=X.song;if(s&&s.kind==='quick'){s.stems=null}     // AI stems cost points: kept for the current song; the tool's stay with the tool
  if(s){s.F=null}X.render=null;X.rwave=null;if(X.stage==='done')X.stage='ready';
}
document.addEventListener('cr-user',e=>setOwner(e.detail&&e.detail.uid));
{const u=CR.user&&CR.user();if(u&&u.known)setOwner(u.uid)}
window.EXTENDED={
  show(){if(X.owner===undefined){const u=CR.user();setOwner(u&&u.uid)}if(!X.built)build();X.visible=true;CR.stopTool();renderAll();requestAnimationFrame(()=>{sizeCanvas();drawSoon()})},
  hide(){if(!X.visible)return;X.visible=false;stopPB(true);closePick();closeSecEd();if(X.stage==='generating')abortGen();if(!X.exporting)freeMem();const z=$('#exSrc');if(z)z.classList.remove('over')},
  lang(){if(X.built){renderAll();if(X.secEd>=0)renderSecEd()}},
  // for tests
  _X:X,makePlan,renderAudio,segment,label,groove,phraseLock,srcT,outT,extToSrc,srcToExt,newCues,generate,exportExt,loadSong,
  qualityOf,joinList,playJoin,blockShifts,_quality:()=>X.quality,_relDbg:relDbg,
  // the plan as the render plays it (output + source times per block incl. the sub-beat shift, joins, quality): for tests
  _planInfo:()=>{const p=X.plan,s=X.song;if(!p||!s)return null;const BS=blockShifts(p);return {P:p.P,B:p.B,len:p.len,tail:p.tail,bars:p.bars,endHit:p.endHit,kind:s.kind,bpm:s.an.bpm,secs:s.secs,
    blocks:p.blocks.map((b,i)=>({role:b.role,sec:b.sec,lab:s.secs[b.sec].lab,sa:b.sa,sb:b.sb,o0:b.o0,o1:b.o1,mask:b.mask,eq:b.eq||null,ft:b.ft||null,gain:b.gain,stage:b.stage,useMix:!!b.useMix,
      t0:outT(p,b.o0),t1:outT(p,b.o1),s0:srcT(s,b.sa)+BS[i],s1:srcT(s,b.sb)+BS[i],ds:BS[i]})),
    joins:p.joins.map(j=>({i:j.i,t:j.t,src:j.src,shift:j.shift,xf:j.xf,tail:j.tail,pre:j.pre,duck:j.duck,seam:j.seam,risk:j.risk,kIn:j.kIn,kOut:j.kOut})),loops:p.loops,quality:X.quality}},
  _plan:()=>X.plan,_secs:()=>X.song&&X.song.secs,_heard:heardPB,_tl:()=>({lay:TL.lay,W:TL.W,view:viewOf()}),_srcBar:x=>srcT(X.song,x),_outBar:x=>outT(X.plan,x)
};
CR.applyLang();
if($('#extendedView')&&!$('#extendedView').hidden)EXTENDED.show();
})();
