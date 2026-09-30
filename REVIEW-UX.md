# Chord Room — product / UX review (first-time visitor + paying customer)

Reviewer lens: a new visitor landing on the home page, and a subscriber who uses the tools every week.
Method: the site was served locally through `tools/tests/lib.py` (real `_headers` CSP, mock backend, mock Deezer) and every
view/state was screenshotted in he/en/ar × light/dark × 1440/375 (plus header at 1024/1280/1920); load timing, long
tasks, compressed weight, headings/focus/contrast were measured with Playwright. Scripts + screenshots:
`scratchpad/review_e/` (s1…s5, `shots/`). Nothing in the app was changed.

Severity: **P0** blocks users or money · **P1** clearly costs sign-ups/revenue/trust · **P2** real friction, fix soon · **P3** polish.

---

## Measurements (baseline, local server, headless Chromium, 2 CPU)

| What | Value | Note |
|---|---|---|
| Requests on first load | 34 (19 scripts, 11 stylesheets, fonts, manifest, mock) | all scripts synchronous at end of `<body>` |
| Transfer weight (gzip estimate) | **492 KB** (JS 432 KB, CSS 59 KB) + Google Fonts (5 families, 19 weights) | raw 1.55 MB; `app.js` 117 KB gz, `supabase.js` 54 KB gz, `pages.js` 40, `crate.js` 36, `legal.js` 35, `mashup.js` 33 |
| DOMContentLoaded / load | 755 ms / 929 ms | FCP 316 ms |
| Long tasks during boot on the **home page** | 13 tasks, ≈1.25 s total (58–197 ms each) | the demo song is synthesised **and analysed on every boot, on every view**, incl. home while signed out (`assets/app.js:3271`) |
| Time to demo analysed in the tool | 3.5 s after sign-in | fine on desktop; expect 3–4× on a mid phone |
| Idle CPU | `loop()` rAF forever (cheap, draws only when dirty) + `bg.js` canvas animation (stops when hidden / reduced motion) | |
| `?v=` cache-busters | 10 distinct values across 30 tags (`v=1` × 13); `vendor/supabase.js` has none | works, but easy to forget one file |
| Home page height | 9 408 px (he, 1440) / 13 472 px (he, 375) | 7 feature blocks + steps + pricing + privacy + FAQ + full accessibility statement inline |
| CSP violations / console errors / `data-i` fallbacks | 0 / 0 / 0 in all 5 languages | good |
| Horizontal scroll at 375 | none on any view | good |

**SEO / head (home):** `<title>` is the constant string "Chord Room" on every view; one English meta description while
`lang="he"`; **no** `og:*` / `twitter:*` tags, no canonical, no `hreflang`, no JSON-LD, no `robots.txt`, no `sitemap.xml`.
Manifest icon is a single SVG (`sizes: any`), no PNG 192/512, no `apple-touch-icon` → iOS "Add to Home Screen" gets a
screenshot icon and Chrome's install prompt may not fire. Headings order is sane (one visible h1 per view), all images
have `alt`, all buttons have names, no skip link, focus is not moved when the view changes.

---

## P0

**P0-1 — `ROADMAP.md` / `REVIEW-UX.md` will be publicly served once pushed.**
`functions/_middleware.js:7` hides only an explicit list of `.md` files (`CLAUDE|PAYMENTS|README|EMAIL|ASSISTANT`) and
`_routes.json` routes only those through the Function. Any new `*.md` in the repo root (these two review files, and the
security notes they contain) is a normal public file on Cloudflare Pages.
Fix: change the regex + `_routes.json` include to `/*.md` (and keep `node/functions.test.mjs` asserting it), or move
internal docs under a hidden folder (`docs/` added to `HIDDEN`). Do this in the same push as the review files.

## P1

**P1-1 — A visitor cannot see the product before creating an account.**
Repro: open `/` signed out → every CTA ("פתחו את הכלי", "למיקס החי", "גלו מה חם") lands on the lock card
(`renderGate`, `app.js:3006`). There is no demo, no screenshot, no read-only tool. The home hero shows a fake deck; the
real one is behind sign-up + email code. This is the biggest conversion leak on the site.
Fix: let guests open `#tool` with the demo song and the read-only analysis (waveform, chords, tempo/key controls);
gate only what costs or persists (upload, save, Discover catalog writes, separation, export). Same for Discover in
read-only mode (charts + catalog results, play preview; "open in tool" asks for an account). Keep DJ/Crate/Mashup gated if
desired. `GATED` at `app.js:3003` + `needAccount` checks in `loadFile`/drop already exist for the upload path.

**P1-2 — Sign-up asks for 4 fields + 2 checkboxes + an email code, and there is no social login.**
Repro: "הרשמה" → username, email, password, confirm password → terms step (2 required boxes) → 6-digit code. Seven
interactions before the product is visible. Username availability is checked live (good) but the field is mandatory and
must be Latin.
Fix (in order of impact): (a) add Google (and Apple) OAuth through Supabase — one tap, verified email, no code step;
(b) drop "confirm password" (the eye toggle exists, `data-eye`); (c) derive a username from the email/Google name and let
the user change it later in the account panel; (d) merge the two consents into one sentence + one checkbox ("I am 16+ and
accept the Terms and Privacy Policy") — the age statement can be part of it legally. Files: `index.html` `#fUp`, `app.js`
auth dialog section (~1850–2100), `assets/auth.css`.

**P1-3 — Legal pages ship with unfilled placeholders.**
Repro: `#terms` / `#privacy` in any language: "השירות מופעל על ידי [שם המפעיל, מספר עוסק או ח״פ וכתובת — להשלמה על ידי בעל
האתר]" and "[Contact address — to be filled in by the site owner]"; the accessibility statement on the home page has an
empty contact block (`assets/a11y.js:10` `CONTACT`, `assets/legal.js:15` `OPERATOR`). A paying customer reading the
terms before entering a card sees an unfinished document; Israeli consumer-protection and accessibility regulations
require the operator identity and an accessibility coordinator contact.
Fix: owner fills `OPERATOR`, `CONTACT`, `billing.contact`; until then render the paragraph without the bracketed
placeholder (hide the sentence when empty) so the page never shows editor notes.

**P1-4 — Terms contradict the product about the sign-in gate.**
`#terms` §2: "אפשר להשתמש בחלק מהכלים בלי חשבון" / "Some tools work without an account" — but every tool is gated
(`GATED`). Either implement P1-1 (which makes the sentence true) or change the sentence in all five languages
(`assets/legal.js`, the "account" section).

**P1-5 — The plan buttons can dead-end in a "coming soon" toast.**
Repro (mock config = no `link` on plans, i.e. the state until the owner pastes Lemon Squeezy links): pricing → "הצטרפות
למסלול" → toast "ההצטרפות למסלולים תיפתח בקרוב." (`PAGES.onSubscribe`, `app.js:2535`). Three big paid cards with primary
buttons that do nothing is the worst possible moment to disappoint. If the live `site_config.billing` already has links,
downgrade this to P3.
Fix: when a plan has no `https://` link, render the button as disabled "בקרוב" (or "כתבו לנו" with `billing.contact`)
instead of a live CTA; and log `subscribe_click` with the outcome so the owner can see it in Activity.

## P2

**P2-1 — After signing up from the home page the user is left on the home page.**
Repro: `/` → "הרשמה" → … → "בואו נתחיל" → dialog closes (`app.js:2092` `$('#auDoneGo').onclick=()=>closeDlg()`),
`#aboutView` stays, no song, no next step. From the gate it works (regate → tool). Fix: "בואו נתחיל" → `showView('tool')`
(or the view the user was heading to, remembered in `GATE.v`), and open the file picker / show a first-run hint.

**P2-2 — Header compaction hides the primary actions at common laptop widths.**
Measured (`s5`, he): 1024 px → the whole nav is in the burger, only "הרשמה" + an icon-only sign-in remain; 1280 px →
"הרשמה" and "העלאת שיר" become **unlabelled icons**; 1440 px → "כניסה" is icon-only (a person glyph) while "הרשמה" is
labelled; only at 1920 px do all labels show. `assets/shell.js:54 fit()` compacts step by step (`LEVELS`). Fix: never
strip the label from `#signInBtn`/`#signUpBtn`/`#upLbl`; compact the tab icons and "השירים שלי" first, move
theme/language into the drawer/account menu earlier, and let tabs use shorter labels ("ספרייה", "מיקס") before falling to
the drawer. Consider a 44 px-tall single-row header with the tools in an overflow "⋯" menu.

**P2-3 — The demo song is synthesised and analysed on every boot, on every view.**
`app.js:3271` runs `synthDemo()` + `analyze()` unconditionally (unless `restoreLast()` returns a song), also on the home
page for a signed-out visitor who cannot even open the tool. That is ≈1.25 s of main-thread long tasks on a desktop and
several seconds on a phone, right when the hero animation and fonts are competing. Fix: start the demo lazily the first
time `showView('tool')` runs unlocked (and only if no last song); on the home page render the hero deck from static data
(it already is).

**P2-4 — Spending points has no confirmation and no cost preview at the moment of the click.**
Repro: signed in with points → "הפרדת ערוצים" → 5 points are charged immediately (`toast` "ירדו 5 נקודות. נשארו 45.").
The cancel path refunds (good), but a paying customer who mis-clicks or expected the 80 MB model download to be a
separate step is surprised. Fix: a first-time confirmation ("עולה 5 נקודות · נשארו לך 50 · ~1–4 דק׳") with a
"don't ask again" box; show the model download as a separate free phase (progress "מוריד מודל 80 MB…") before the charge,
so a failed download never costs a charge/refund round-trip. Same for stem download (2 points).

**P2-5 — Export block: 8 of 10 options are greyed out with no way forward.**
Repro: tool with the demo/an unseparated song → "ייצוא ל־FL STUDIO" shows "שירה · דורש הפרדה" × 8, WAV/MP3 toggle and a
"הורדה כ־ZIP" button. Nothing links to the separation button 900 px higher. Fix: a one-line inline CTA in the block
("כדי לייצא ערוצים צריך להפריד קודם · הפרדה ב־AI · 5 נקודות") that scrolls to `#aiBtn` / starts separation; group
"available now" (Original, Chords MIDI) above "after separation".

**P2-6 — Floating UI covers content on phones.**
At 375 px there are two permanent FABs (Roomy bottom-left, accessibility bottom-right, both 56 px) and, for 14 s after
load, a Roomy teaser bubble. They overlap: the tool's transport bar (play button) at the bottom of the deck, the last
Discover row's actions, the pricing "סטודיו" card at 1440, and on the sign-up sheet the a11y FAB sits on the "Continue"
button and the "tick both boxes" hint (`shots/s3_auth_admin/auth_up_filled_en_375.png`). Fix: hide both FABs while any
dialog/sheet is open (`.dlgwrap:not([hidden])`, `#authDlg`), collapse the a11y FAB into the header/drawer on phones,
and give the page `padding-bottom` equal to the FAB zone when a fixed player bar is absent.

**P2-7 — No per-view `<title>`, no focus management, no `aria-live` for view changes.**
`document.title` is "Chord Room" everywhere; after `showView` focus stays where it was (`focus=BUTTON#navPricing`) and
screen-reader users get no announcement. Fix: `document.title = viewName + ' · Chord Room'` in `showView`, move focus to
the new view's `h1` (`tabindex=-1`, like `renderLegal` already does), announce through the existing `#toast` live region
or a dedicated `aria-live="polite"` node. Also add a skip link to the main view.

**P2-8 — Basic SEO / share metadata missing.**
See measurements. Fix (all in `index.html` `<head>` + two static files): descriptive title + Hebrew description,
`og:title/description/image/url/type/locale`, `twitter:card=summary_large_image`, `link rel=canonical`, `hreflang` for
the five languages if URLs get a `?lang=` or path variant, `robots.txt` + `sitemap.xml` (home, pricing, terms, privacy),
`apple-touch-icon` 180 PNG + manifest PNG 192/512 (+ `maskable`). Consider prerendering the About text server-side (it is
already static HTML from `pages.js`; an inline `<noscript>` summary would give crawlers and link previews something).

**P2-9 — Prices only in ₪, in every language.**
`#pricing` in en/ar/ru/es shows "₪ 29 per month" with no currency hint. Lemon Squeezy supports localized pricing; at
minimum show "≈ $8" next to the shekel price for non-he languages, and state the currency in the FAQ.

## P3

**P3-1 — Demo song contradicts itself.** Title "שיר דוגמה · Am F C G · 120", detected key "C" (דו מז׳ור), harmonic
panel says relative = Am. For a first impression the demo should agree with itself (label the demo "C / Am") or the
demo progression should resolve unambiguously.

**P3-2 — "Camelot" leaks into copy despite the "key names everywhere" rule.** Crate intro: "BPM, סולם, Camelot, אורך…"
(`assets/crate.js` intro string); DJ match wheel is labelled 1A…12B. Either say "מספר גלגל" / show key names on the wheel,
or accept Camelot for DJs and say so consistently.

**P3-3 — Welcome picker footer mixes directions.** `assets/welcome.js:20` puts Hebrew and English in one
`dir="auto"` paragraph → renders "You can · אפשר לשנות… change it any time". Split into two `<span dir>` lines.

**P3-4 — Small/low-contrast text in the tool.** 10 px labels (`.lb` "לופ/תצוגה/זום/גריד", `.ext` "WAV/MIDI", chord-sheet
bar numbers `.no` at 2.5:1), "N.C." 2.5:1, nav tab text 4.06:1 (#6d6d72 on white, 14 px). Stem K/M/S buttons are 24×22 px
(desktop) — below 24 px min target; on phones the whole mixer row is tiny. Bump to 11–12 px and ≥4.5:1; make K/M/S 32 px.

**P3-5 — "השירים שלי" is offered while signed out** and opens an empty panel ("עוד אין כאן שירים") instead of asking
for an account or explaining. Hide it or route it to `askAccount()`.

**P3-6 — The DJ view on a phone is a desktop layout squeezed into 375 px** (two full decks stacked, jog wheels 200 px).
Show a "best in landscape / on a tablet" hint and a compact phone layout (waveforms + play/cue/sync/crossfader only).

**P3-7 — Home page is very long and repeats itself.** Seven feature cards each with a 5–7-bullet list, then a pricing
teaser, a privacy block, FAQ and the *full* accessibility statement inline (13 k px on a phone). Move the accessibility
statement to `#accessibility`, cut each feature to 3 bullets + "עוד", keep the FAQ.

**P3-8 — Unknown hash silently opens home.** `#nonsense` → About with the hash removed. Show a small "העמוד לא נמצא"
toast so shared broken links are understandable.

**P3-9 — Library panel empty state has no CTA.** "עוד אין כאן שירים." → add "העלאת שיר" and "פתחו שיר מגלה שירים".

**P3-10 — Admin "Activity" sign-in detail shows the raw locale string** (`en-US@posix`); format or drop it.

---

## Things that are good (keep them)

The auth dialog itself (validation, strength meter, caps-lock hint, resend cooldown, code paste), the lock card copy, the
account panel (referral box, ledger link, subscription status), dark theme consistency, the language picker, RTL handling
(no horizontal scroll anywhere, numbers/keys LTR), zero console errors and zero CSP violations across every flow, honest
points UX (charge-before-run with refund on cancel and a clear toast).
