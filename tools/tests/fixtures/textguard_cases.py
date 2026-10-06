"""Shared cases for the offensive-word filter (accounts v4): private.is_offensive in SQL (sql/test_accounts_v4.py) and
window.TEXTGUARD in the browser (ui/test_accounts.py) must give the same answer for every line.

OFFENSIVE: normalisation is exercised on purpose (case, leetspeak, spacing, repeats, niqqud, final letters, Hebrew prefixes,
Arabic forms, ё, accents, phrases). CLEAN: common words that contain a listed word as a substring or look like one
(the "Scunthorpe" problem) — none may be flagged.
"""
OFFENSIVE = [
    'fuck', 'FUCK you', 'f.u.c.k', 'f u c k off', 'fuuuuuck', 'motherfucker', 'BigFuckingDeal', 'sh1t', '$h!t happens', 'shiiiit',
    'Bullshit!', 'you b1tch', 'a55hole', 'kill  yourself', 'Heil-Hitler', 'n1gger', 'retarded idea', 'kys',
    'זונה', 'בזונה', 'והזונות', 'שַׁרְמוּטָה', 'שרמוטההה', 'כוס אמק', 'כוסאמק', 'כוס אמא שלך', 'ערבוש', 'לך תזדיין', 'מוות לערבים',
    'ben zona', 'sharmuta', 'كس امك', 'شرموطة', 'قحبة', 'пиздец', 'ПИЗДА', 'охуеть', 'нахуй', 'сука', 'бляяять',
    'hijo de puta', 'PUTA', 'cabrón', 'gilipollas', 'pendejo', 'j0der',
]
CLEAN = [
    '', '   ', 'Oshri', 'dj_oshri', 'Dana Beats', 'hello world', 'Scunthorpe United', 'assassin', 'classic', 'passion', 'cocktail',
    'shiitake mushrooms', 'therapist', 'Essex', 'Dickens', 'spice', 'snigger', 'Niger', 'niggle', 'grape', 'Hancock', 'cockpit',
    'title', 'mass', 'bass', 'bassline', 'computadora', 'disputa', 'reputación', 'cono de helado', 'zona', 'Zain', 'Ching',
    'שלום', 'מזון', 'מזונות', 'מזין', 'כוס קפה', 'כוסות', 'כושר', 'ערב טוב', 'זינוק', 'חראם', 'מוזיקה', 'אמא שלך מתקשרת',
    'السلام عليكم', 'زين', 'كسر', 'кексы', 'сукно', 'страхуй', 'мудрый', 'небо', 'hola amigos', 'música', 'Cubase 13', '128 BPM',
    'C#m', 'Am', 'F#m7b5', 'remix_2024', 'DJ Snake', 'Skrillex',
]
