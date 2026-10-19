# מכתב ל-Deezer — בקשת אישור לשימוש מסחרי

## איך שולחים
1. נכנסים לטופס השותפויות של Deezer: https://dzr.fm/brandsolution
   (אם הטופס לא נפתח: דרך https://www.deezer.com/company/contact או "Deezer for developers" → Contact).
2. ממלאים את המקומות בסוגריים מרובעים `[...]`: שם, חברה או עוסק, מספר ח״פ/ע״מ, טלפון.
3. מדביקים את המכתב באנגלית (למטה) בשדה ההודעה ושולחים.
4. שומרים את התשובה שלהם. אם הם מאשרים, מוסיפים אותה כאן ומעדכנים את `LICENSES-AUDIT.md` סעיף 2.

**עד שיש תשובה:** "גלה שירים" נשאר פעיל כמו היום (ההחלטה שלך). אם Deezer יבקשו להפסיק, צריך לכבות אותו מיד.

**מה המכתב אומר בקצרה:** מה האתר לוקח מ-Deezer (מצעדים, פרטי שירים, קטעי 30 שניות, הנגן הרשמי), מה הוא עושה עם זה (ניתוח
קצב, סולם ואקורדים בתוך הדפדפן, בלי לשמור או להפיץ את השמע), שהאתר מוכר מסלולים בתשלום אבל "גלה שירים" חינמי, ושכל שיר
מקשר בחזרה ל-Deezer. אנחנו מבקשים אישור או הסכם, ושואלים מה צריך לשנות.

---

## The letter (English — paste this)

**Subject:** Commercial use request — Deezer API, 30-second previews and widget on chord-room.com

Hello Deezer Partnerships team,

My name is [Full name]. I run Chord Room ([company / sole-trader name], Israel, registration no. [number]),
a web app for musicians and DJs at https://chord-room.com. I would like to ask for permission — or a partnership
agreement — to use the Deezer API in a commercial context, and I want to describe our use precisely so you can tell
us what is allowed and what we should change.

**What we use**
- Public read-only endpoints only: `chart/{id}/tracks`, `editorial/{id}/releases`, `album/{id}` and `album/{id}/tracks`,
  `playlist/{id}/tracks` (including your "Top Israel" chart playlist), `track/{id}`, `search` and `search/artist`.
  No user login, no private data. Requests go through a small cached proxy (15-minute cache, allow-listed paths only),
  with the browser calling api.deezer.com directly as a fallback.
- The official 30-second previews (`preview` URLs) and cover images, loaded directly from your CDN.
- The official Deezer widget (widget.deezer.com) to play a full track, so listeners signed in to Deezer hear it on Deezer.

**What we do with it**
- A "Discover" page lists current charts and new releases. Every cover links back to the track on deezer.com, and
  the list carries a "Data and previews by Deezer" note.
- When a user opens a track, the 30-second preview is analysed inside the user's own browser to estimate tempo (BPM),
  musical key and chords. We never download, store, re-host or redistribute any audio. We store only the derived
  numbers (BPM, key, chord labels) with the Deezer track id, title and artist, so other users see them and DJs can find
  tracks that mix well together.
- We never offer full-track audio ourselves; full songs are only heard through your widget.

**Our business model**
- The Discover page is free for every signed-in user. The site also sells optional paid plans and points for other
  tools (stem separation, exports, a DJ mixer and so on) that work on files the users upload themselves. Because the
  site as a whole earns money, we understand that your developer terms (section IV, non-commercial use) may not cover
  us, which is why we are writing.

**What we are asking**
1. Can we continue this use under a commercial licence or partnership, and on what terms?
2. Is analysing the 30-second previews in the browser and storing the derived BPM/key/chord data acceptable?
3. If anything should change (attribution, caching, rate limits, branding, which endpoints), please tell us and we
   will change it right away. If you prefer that we stop, we will switch the feature off.

Separately, we would also be grateful for a short written confirmation that the pre-trained Spleeter models
(github.com/deezer/spleeter, MIT licence) may be used in a commercial product — we use them for stem separation in the
browser and credit Deezer Research on our licences page.

Thank you for your time. I am happy to give more detail or a demo.

Best regards,
[Full name]
[Company / sole-trader name], [registration no.]
[Email] · [Phone]
https://chord-room.com
