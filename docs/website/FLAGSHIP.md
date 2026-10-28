# The flagship section: a measured spec (28 Oct 2026)

The user's plan (28 Oct): the daily news keeps the site's Washington Post–style
design. A separate **flagship section** for AI, tech, science and politics
articles gets its own design, modelled on Pirate Wires (piratewires.com).

Everything below was **measured** in a normal browser, at a person's pace, from
the computed styles and boxes of their public pages. Their site turns programs
away (a Vercel Security Checkpoint), so there was no crawler.

The measurements are at 1440 px wide unless a width is named. "px" are CSS
pixels.

**What we take and what we don't** (as in `DESIGN.md` §0 and `UIUX.md`):
- **We take** the grid, spacing, proportions, type scale and sizes, the
  components and how they behave, rebuilt in our own code.
- **We don't take** their HTML, CSS, images, text, logo or wordmark, or their
  fonts. The fonts are licensed and have no Gujarati.
- **We leave out** their email gate and pop-ups: `DESIGN.md` §1.6 says "no
  pop-ups".

---

## 1. System

### 1.1 Grid
- **Full width, fluid. No max width:** the page fills the screen at every
  width.
- **Margins and gutters:**

  | Screen | Margin | Gutter |
  |---|---|---|
  | Phone ≤ 480 | 10 | 20 |
  | 481–1727 | 20 | 40 between cards (20 in rows of text and photo) |
  | ≥ 1728 | 24 | 40 |

- **Cards:** three across from about 768 px wide, two across on phones (never
  one).

  | Width | Card | Gutter |
  |---|---|---|
  | 1440 | 440 | 40 |
  | 800 | 226 | 40 |
  | 390 | 175 | 20 |
  | 2000 | 624 | 40 |

- **Above 1728 px everything scales by 1.2:** type, margins and the header
  together (headline 40 → 48, margin 20 → 24). It's a zoom, not more columns.
- **Rules:** 0.5 px hairlines, drawn as decorative lines, never borders. Between
  cards in a row there is one vertical line in the middle of the gutter, card
  height tall. Above each row of cards there is a horizontal line, the card's
  width, 20.5 px above it.
- **On dark bands the lines are `rgba(227,227,227,.45)`;** on light ones,
  `#060606`.

### 1.2 Colour

**Their values, as measured:**

| Role | Value |
|---|---|
| Ink | `#060606` (never pure black) |
| Page | `#E3E3E3` (a light grey, not white) |
| Lower bands and footer | `#D9D9D9` |
| Dark band | `#060606`; staff band `#1C1C1C` |
| Cream band (the Daily) | `#F7F3E7` |
| Orange labels | `#E4562C`; Culture `#E9521A` |
| Technology | `#5BAB5F` |
| Politics | `#CD80A2` |
| Meta text (likes, comments) | `rgba(0,0,0,.5)` on light, `#828282` on dark |
| Dek on the article page | `#272727` |

**How colour is used:** each section owns one flat colour. It fills:
- the section's tab in the top bar;
- the whole second header bar on its pages;
- its band on the home page.

The rest is black, grey and cream.

**Ours:** the same roles, with our own colours, one per beat (AI, Tech, Science,
Politics). They're to be chosen with the user, and must pass the WCAG AA check
in `site/test/a11y.mjs`.

### 1.3 Type

Their faces, and our free stand-ins:

| Role | Theirs | Ours (Gujarati / Latin) |
|---|---|---|
| Headlines (compressed bold) | GT America Compressed Bold | Anek Gujarati Condensed ExtraBold / Anek Latin Condensed or Oswald 700 |
| Big section titles (grotesk) | Neue Haas Grotesk Display | Anek Gujarati SemiBold / Inter Tight 600 |
| Interface: nav, bylines, meta | Neue Haas (Reg, Med, Bold) | Anek Gujarati / Inter |
| Reading text, summaries (serif) | Martina Light / Regular / Italic / Bold | Noto Serif Gujarati 300–400 / Source Serif 4 Light |

**Gujarati needs more room:** taller line heights (about 1.25× theirs for
headlines and 1.1× for reading text), and no negative letter spacing on
Gujarati. Their tight tracking (−3 %) applies to Latin only.

**Their scale at 1440 (size/line height, letter spacing):**

| Use | Size |
|---|---|
| Section and page title | 150/126, −5.34 (grotesk); "Pirate Wires Daily" 178/150 |
| Home and section lead headline | 80/72, −2.4 (compressed) |
| "Continue Reading" band title | 120/94, −3.6 |
| "Contributors" | 100/94, −3 |
| Card headline | 40/38, −1.2 (compressed); author-card name the same |
| Article title | 60/60, −1.8, centred |
| Article H2 | 40/normal, −0.8, margin 40 above and below |
| Article H3 | 26/38, −0.8, margin 32 |
| Article dek | 26/32, grotesk Reg, `#272727`, centred, 900 wide |
| Reading text | 22/32.8 serif Light, paragraph gap 24 |
| Lists | 22/35.2, indent 40 |
| Footnotes | 16/23.8 |
| Lead summary | 18/normal serif Light |
| Card summary | 17/normal serif Light, **all lowercase** (the editors write it that way) |
| Byline | 14 Med, +0.07 |
| Meta (likes, comments) | 12 Med, 50 % ink |
| Nav | 14 Bold; menu items 22 Bold; menu small links 15 Reg |
| Caption | 13 serif Light, +0.1, centred, 8 above |

**Phone (390):**

| Use | Size |
|---|---|
| Lead headline | 40/36 |
| Card headline | 26/24.7 |
| Section title | 36/34 |
| Article title | 46/46, left-aligned |
| Dek | 20/24.6, left-aligned |
| Reading text | 18/26.8 |
| Article H2 | 40, unchanged |

At 800 the leads are 40/36, cards 26/24.7, and "Staff Writers" names 36.

### 1.4 Shape and motion
- **Corners:** square everywhere, except:
  - the pill buttons: Subscribe 20 px, the share chips on the Daily 23 px, the
    tag pills 100 px;
  - a 1 px ink border on pills.
- **Shadows:** none.
- **Motion:** only `transform` and `opacity`, over 0.2 s
  `cubic-bezier(.39,.575,.565,1)`: the arrow square splitting on hover and the
  date fading in (§4.3). The menu drawer slides in from the right over a
  `rgba(6,6,6,.5)` shade.

### 1.5 Images
- **Card photo:** 3:2 (440×293, `object-fit: cover`), full card width, no corners.
- **Lead photo:** 3:2, 938×629, to the right of the text.
- **Article hero:** 3:2, 1394×934, almost the full width (23 px margins).
- **Author photos:** 1:1, 440 (the Writers page) or 320 (the home band).
- **Video:** 16:9.
- **Our rule stays:** a row shows photos only when all its cards have one
  (`UIUX.md`). Without photos, the flagship's cards are text cards: a bigger
  headline plus the beat colour as a thin top bar.

---

## 2. Components

### 2.1 Header (fixed, 80 tall, on every page)
- **Row 1** (30 tall): the four sections as **equal tabs across the full
  width** (349 each at 1440, then a 46 px end cell). 14 Bold, with 0.5 px
  dividers.
  - The current section's tab is filled with its colour.
  - The home tab is the brand.
  - On a phone the row scrolls sideways.
- **Row 2** (50 tall, padding 0 20):
  - the monogram (34 px) on the left;
  - on the right: Newsletters (14 Bold), a **Subscribe pill** (87×29, 1 px
    border, radius 20), Sign In, and the menu icon.
  - On a section's pages this row is filled with the section's colour, with the
    section's name beside the monogram (14 Bold).
- **On the home page** the header is ink (`#060606`) with light text.
- **Ours:** row 1 holds the beats; row 2 holds our wordmark, "WhatsApp channel"
  instead of Newsletters, and no Sign In.

### 2.2 Menu drawer
- From the right: 400 wide, full height, page grey, padding 0 20 21. It slides
  in (transform) over the 50 % shade.
- **Three groups:**
  - Subscribe, Sign In, Newsletters, Gift, Store (22 Bold);
  - the sections (22 Bold);
  - Search, Archive, About, Writers, Careers (15 Reg).
- Then social icons (16).
- Hairlines of 0.5 px between groups (360 wide).

### 2.3 Masthead (home only)
- The wordmark as an SVG, the **full content width** (1400×291 at 1440, 370×77
  on a phone), 10 px under the header.
- **Ours:** the flagship's own name, set full width the same way. Its name is
  still to be decided with the user.

### 2.4 Lead (home, section and author pages)
- **Desktop:** a flex row with a 20 gap.
  - Text column 442 wide: headline 80/72, a 0.5 px line above and below the
    block, then the summary (18), then a byline row (14 Med) with the likes and
    comments (12, 50 %) and a 20×20 arrow square on the right.
  - Photo 938×629 on the right.
  - The text column is as tall as the photo, with the headline at the bottom.
- **Phone:** the photo on top (370×248), then the text.
- **On the home page** the first lead sits on the dark band, with light text.

### 2.5 Card
- `article`, 440 wide. From the top:
  - the photo (3:2);
  - the headline (40/38), with a 20×20 arrow square at the right of its first
    line;
  - the summary (17, lowercase, padding-right 40);
  - a meta row (gap 8): byline left; likes | comments right, with a 1 px divider
    at 50 % between them.
- Card height is about 527–565. The row's dividers are drawn by the card itself
  (decorative lines: the vertical one at x = width + 20, the horizontal one
  20.5 above).
- **Ours:** the likes and comments become "time to read · date". There are no
  likes or comments on our site.

### 2.6 Bands (home)

From top to bottom at 1440 (the page is 13,572 tall):

1. **Masthead** (305).
2. **Lead** on the dark band (629).
3. **"From the Daily"**, a cream band:
   - padding 40;
   - an orange date label (289×64, compressed 70);
   - the title;
   - "See all takes";
   - three takes in **three equal columns with no gaps** (460 / 480 / 459),
     with 1 px ink dividers;
   - each take: an author pill, the take's title (40/38, can be struck through
     with `<s>` for jokes), a serif summary (15/20), then "Share to X" and
     "Share to Substack" pills (radius 100, 1 px border).
4. **Latest Podcast**, a dark band: a grid of 940 + 440, gap 20. The video is
   16:9 on the left; on the right, the title "Latest Podcast" (32/30.4) and the
   episode headline (80/72).
5. **Card grid**: 8 cards and a ninth "Dive into …" tile (white at 10 %, padding
   20) that opens the archive.
6. **"Staff Writers"**, band `#1C1C1C`: four authors (320 square photo, name
   40/38, role 15/20 serif), with 0.7 px vertical dividers.
7. **Sections**, one band each, filled with the section's colour:
   - the section's name (grotesk 40, a link);
   - its lead (as in §2.4);
   - six cards;
   - "Read more … coverage." (80/72).
8. **"More"**: twelve cards.
9. **Footer**.

### 2.7 Section page (`/c/technology`)
- The header with its section colour.
- The title (grotesk 150/126, 166 tall; 36 on a phone).
- The lead (§2.4).
- Cards, three across, 24 or more, loaded as you go (the page is 6,150 tall at
  first).
- The footer.

### 2.8 Article page (`/p/…`)

**Heading area** (padding 47 20):
- the title 60/60, centred, max 1000 (900 wide);
- the dek (26/32, centred, 900 wide);
- a meta row (1000 wide, a 0.5 px line on top, padding 20 0 17): the author
  (16 Med) on the left, the date on the right;
- the hero image (3:2, 1394 wide, 23 px margins).

**Action bar** (a 630 column, padding 20 0, a 2 px bottom line at
`rgba(43,43,43,.45)`): "Likes" and "Comments" buttons (pad 8 16, 1 px border)
and "Share" on the right.

**Body column:** **630 wide, centred** (x = 405 at 1440), 360 on a phone.
- Paragraphs: 22/32.8 serif Light, 24 apart.
- Links: underlined (1.1 px, offset auto).
- Bold and italic: Martina Bold and Italic.
- H2 40 and H3 26, as in §1.3.
- Ordered lists: indent 40, lines 22/35.2.
- Figures: column width, margin 22, caption 13, centred.
- Footnote markers: superscript 15, underlined. The notes go at the end
  (16/23.8, number hung at 25).

**More detail, from a second, free article** ("The New American-Greenlandic
Forever Pact", 28 Oct; the page is 14,137 tall, the body 11,434):
- **Spacing:** paragraphs are 20 apart. The paragraph after a subheading, and
  the first note, are 24 below. Subheadings are 40 compressed with 40 above and
  none below (that article marks them as `h1`).
- **Links:** underlined, 1.1 px, in ink at 50 % (`rgba(0,0,0,.5)`), so the line
  is quieter than the text.
- **Footnotes:** the reference is a superscript (18.3 on 22 text). After the
  body, a 1 px rule `rgba(43,43,43,.45)` with 20 above and below. Then the notes
  as ordinary paragraphs, each starting with its number in superscript (22/32.8
  here; 16/23.8 in the first article, so the size varies by article).
- **Calls to action in the body:** a centred outline button (1 px ink border,
  padding 12 24, system font 16/500). Theirs say "Get 14 day free trial" and
  "Subscribe now". **Ours:** the same button for the WhatsApp channel, at most
  one per article.
- **The end-of-article pop-up** (theirs, shown as you reach the notes):
  - a white box 640 wide, padding 32, an **8 px ink border**, square corners,
    shadow `0 8 24 rgba(0,0,0,.15)`;
  - the title "Enjoying this story?" 54/54, centred;
  - an email field and a black button;
  - an × to close.

  **Ours:** no pop-up. The same box sits *in the page* at the end of the
  article, as the WhatsApp channel invitation, so nothing covers the text.

**"Continue Reading"** (band `#D9D9D9`, padding 40 20): the title 120/94, then
three cards.

**Footer.**

**Theirs, left out:** the email gate (a fixed sheet at the bottom, 360 tall, with
a 100 px fade above it).

### 2.9 The Daily (`/daily-takes`)
- The title 178/150.
- One orange date bar per day (1400×32, the date 20 in cream).
- That day's takes in a **3-column grid with no gaps** (466.66 each), with 1 px
  vertical dividers.
- A take may span two columns.
- Their archive is for subscribers. Ours would be open to everyone.

### 2.10 Author pages
- **The author** (`/author/…`): the name (compressed 80/72, centred), links (X,
  Substack: 18 Med, gap 25), padding 72 20 0. Then their cards, three across.
- **The writers** (`/authors`):
  - the title 150 with a small aside link;
  - staff in three columns (440 square photo, name 40, role 15 serif);
  - "Contributors" (100/94);
  - contributors in three columns of names (compressed 40/44).

### 2.11 Search (`/search`)
- One centred field: 393×45, 1 px ink border, square corners, 15 Med, a search
  icon inset 45.
- Under it, "Showing the latest 12 posts."
- Then the card grid.

### 2.12 Footer (every page)
- Band padding 40 20 0.
- The wordmark, full width (1400×291).
- A last row (padding 20 0, three groups across):
  - © (14 Med);
  - legal links (14 Med, gap 20);
  - "Powered by …" (12).

### 2.13 Marketing pages (theirs; we'd use only the layouts)
- **Newsletters:** a sign-up row (a 355×50 field and a 165×50 button), then a
  card per newsletter on ink, with an orange top border and a 40×40 checkbox.
- **About:** the title 150 on the left, text in a serif column beside it.
- **Subscribe:** half and half, the form on the left and a flat orange half on
  the right.

---

## 3. What we'd build (after the user agrees)

**Where it lives:**
- `site/app/(gu)/<name>/…` and `(en)/en/<name>/…`;
- views in `site/views/flagship/`;
- components in `site/components/flagship/`;
- its own tokens under one class (`.fl`), so the daily site's look is untouched.

**The pages:**
- the flagship's front (§2.6, without podcast or Daily until we have them);
- the beat page (§2.7);
- the article page (§2.8);
- the author page (§2.10);
- search within the flagship (§2.11).

**Checks:**
- side by side with theirs at 390, 800, 1440 and 2000;
- `a11y.mjs` (both themes; the flagship needs a dark theme of its own, since
  theirs has none);
- `npm run build`.

**Decisions for the user:**
- the flagship's name and its address;
- one colour per beat;
- whether articles come from the engine, from the editor, or both (essays need
  an editor's page; ROADMAP item 4).

---

## 4. Second pass (28 Oct): switch points, every page at every width, behaviour

### 4.1 Where the layout switches (home page, stepped through 25 widths, 360–2560)

| Width | Margin | Cards across × width | Card headline | Lead headline | Lead | Podcast | Writers band |
|---|---|---|---|---|---|---|---|
| 360 | 10 | 2 × 160 | 26 | 40 | stacked, photo on top 340×228 | one column | 2 × 160 |
| 414 | 10 | 2 × 187 | 26 | 40 | stacked | one column | 2 |
| 480 | 10 | 2 × 220 | 26 | 40 | stacked | one column | 2 |
| 576 | 10 | 2 × 268 | 26 | 40 | stacked | one column | 2 |
| 720 | 10 | 2 × 340 | 26 | 40 | stacked | one column | 2 |
| **767** | 10 | 2 × 364 | 26 | 40 | stacked 747 wide | one column | 2 |
| **768** | **20** | **3** × 216 | 26 | 40 | **side by side**, photo 488 | one column | **3** |
| 864 | 20 | 3 × 248 | 26 | 40 | photo 552 | one column | 3 |
| **959** | 20 | 3 × 279 | 26 | 40 | photo 616 | one column | 3 |
| **960** | 20 | 3 × 280 | **36** | **55** | photo 616 | **two columns** 2/3 + 1/3 | 3 |
| 1024 | 20 | 3 × 301 | 36 | 55 | 659 | two | 3 |
| **1080** | 20 | 3 × 320 | 36 | **60** (= W/18) | 697 | two | **4** |
| 1152 | 20 | 3 × 344 | 36 | 64 | 745 | two | 4 |
| 1296 | 20 | 3 × 392 | 36 | 72 | 842 | two | 4 |
| 1440 | 20 | 3 × 440 | 40 | 80 | 938 | two | 4 × 320 |
| 1512 | 21 | 3 × 463 | 42 | 84 | 985 | two | 4 |
| **1728** | **24** | 3 × 533 | **48** | **96** | 1126 | two | 4 × 390 |
| 2000 | 24 | 3 × 624 | 48 | 96 | 1308 | two | 4 × 458 |
| 2560 | 24 | 3 × 810 | 48 | 96 | 1683 | two | 4 × 598 |

**The rules behind it:**
- **Below 768:** a phone layout. Margin 10, two cards across with a gap of 20, everything stacked.
- **From 768:** three cards across with a gap of 40, margin 20, and the lead beside its photo. The photo is about 2/3 of the width.
- **From 960:**
  - card headlines go to 36, then grow as W/36 from about 1296 (40 at 1440, 42 at 1512) and stop at 48 from 1728;
  - lead headlines go to 55, then grow as W/18 from 1080 (60 at 1080, 80 at 1440) and stop at 96 from 1728;
  - the podcast becomes two columns.
- **From 1080:** the writers band shows four across.
- **From about 1440 to 1728:** the margin grows as W/72 (20, then 21, then 24 from 1728).
- **Above 1728:** nothing grows any more. Only the columns get wider, so 2560 is 2000 with wider cards.
- **The masthead** is always the full content width, about 4.8 : 1 (340×71 at 360, 1400×291 at 1440, 2512×522 at 2560).
- **The section tabs** (row 1): equal quarters of the width. Below 1080 they can scroll sideways, and on a phone each tab is at least 122 wide (four tabs = 419 on a 390 screen). The header is always 80 tall.

### 4.2 Every page at the other widths

| Page | 390 | 800 | 1024 | 2000 |
|---|---|---|---|---|
| **Section** title (grotesk; = W/9.6, between 60 and 180) | 60/50 | 83/70 | 107/90 | 180/151 |
| Section lead headline | 40/36, photo on top 370×248 | 40/36, beside a 509 photo | 55/49.5 | 96/86 |
| Section cards | 2 × 175 | 3 × 226 | 3 × 301 | 3 × 624 |
| **Article** title | **46/46 left** | **80/80 centred** | **80/80 centred**, 900 wide | 63/63 centred, 900 wide |
| Article reading text | 18/26.8 | 20/29.8 | 20/29.8 | 23.1/34.4 |
| Article column (by its subheadings) | 360 at 15 | 760 (full width) | **740 centred** | 662 centred |
| Article hero | 364×244 | 754×505 | 978×655 | 1946×1304 |
| **Daily** title | 64/54 | 99/83 | | |
| Daily takes | one column 370 | **two** columns 389 | three from 1024 | |
| Daily take headline | 28/26.6 | 28/26.6 | 40/38 at 1440 | |
| **Author** page | photo 180², name 40, cards 2 × 175 | photo 180², cards 3 × 226 | | |
| **Writers** title / "Contributors" | 60 / 85 | 83 / 85 | | |
| Writers, staff photos | 2 × 175 | 3 × 226 | 3 × 440 at 1440 | |
| Writers, contributor names | 26 | 36 | 40 at 1440 | |
| **Search** field | 370×45, full width | 393×45 centred | | |

**Note on the article page:** between 768 and about 1100 the title is *bigger*
(80) than on a desktop (60), and the reading column *wider* (740) than at 1440
(630). A tablet held in landscape reads like a magazine. Copy this as measured.

### 4.3 Behaviour
- **Card hover** (not on touch screens):
  - **The arrow square** is two 10×20 ink halves side by side under a light
    10×8 arrow. On hover the left half moves up 2 px and the right half down
    2 px, so the square "splits" behind the arrow. `transform` over 0.2 s,
    `cubic-bezier(.39,.575,.565,1)`.
  - **The date** ("Oct 27", 14 Med), hidden at opacity 0, fades in beside it
    over the same 0.2 s.
  - **Nothing else moves:** no photo zoom and no underline. The earlier note
    about a photo zoom (§1.4) is wrong; it's only this split.
- **Other hovers:**
  - "See all" arrows slide 4 px right;
  - like and comment counts turn ink on light bands and grey on dark bands;
  - share buttons get a 6 % ink wash;
  - × buttons fade to 70 %;
  - black buttons lighten to `#333`.
- **The header** is fixed, 80 tall, and never hides, shrinks or casts a shadow
  while scrolling. There are no focus rings (they remove the outline), so **we
  keep ours**: the BBC-style ring in `globals.css`. Their choice fails our
  accessibility check.
- **The menu:**
  - **at 1440:** a 400 drawer over the 50 % shade; items 22;
  - **on a phone:** the drawer is the full screen (390×844), padding 0 20 21,
    items 24 (and the small links 16). The first item is 54 from the top.
- **Section pages** show a fixed list of about 33 cards. There is no "load
  more" and no endless scrolling. Older cards' photos load as you reach them.
- **The footer** (413 tall, page grey or ink):
  - the wordmark the full width;
  - then one row 20 above the bottom: legal links on the left (14 Med, gap 20);
    social links as words in the middle ("X (Twitter)", "Facebook", "Instagram",
    "RSS", "Newsletter", "Advertise"; 14 Med, gap 20); "Powered by …" (12) and
    © on the right.

### 4.4 The home page's bands, in detail
- **"From the Daily"** (cream `#F7F3E7`, padding 40 0, 690 tall at 1440):
  - an orange date label (`#E4562C`, compressed 46, cream text, 259×58);
  - then three takes 439 wide. Each take:
    - the title (compressed 40/38, may mix **bold** and ~~struck~~ words);
    - the writer's badge (a 140×35 image);
    - the text (serif 15/20, italics for stress);
    - "Share to X" and "Share to Substack" pills (grotesk 14, at the bottom of
      the band).
  - On the right of the band, an email box:
    - the title compressed 40;
    - two lines grotesk 14/20 in `#2A1100`;
    - a 302×45 field (1 px border `#2A1100`, padding 0 20);
    - a 302×40 orange button (`#E4562C`).

  **Ours:** a WhatsApp channel box, no email.
- **"Latest Podcast"** (ink, 621 tall):
  - a 940×529 video on the left;
  - on the right (440): "Latest Podcast" compressed 40/38, "See all podcasts"
    20/20, then the episode title 80/72;
  - a 1 px light rule at the foot.

  **Ours:** "Watch" with a YouTube video, once there are videos.
- **"Staff Writers"** (`#1C1C1C`, padding 40 0, 682 tall):
  - the title compressed 120/93.6;
  - "See all" (17.5 Med) on the right;
  - four writers 320 wide, 40 apart. Each writer: a 320² photo, the name
    compressed 40/38 with the arrow square, and the role serif 15/20 (−0.45).
- **"Dive into …"** tile (the ninth card): white at 10 % on ink, padding 20, a
  headline 80/72, then "Dive into it" (serif 14). It opens the archive.

**Now covered:** the switch points, every page at phone, tablet, desktop and wide
widths, hover and scroll behaviour, the menu on a phone, how much loads, the
footer, and the home bands' insides.

**Still not measured:** Advertise (a sales page like About), and the comments
page (run by their newsletter service, not their site). Neither is needed for
the flagship.
