# The website's design: Capital Kranti's own design system

Written 24 Oct 2026. This replaces the earlier plan to copy the Washington
Post's look. The user asked for the website to be **the best news site it can
be for Gujarati readers**, so it has its own design: what the Post does well,
the Guardian's way of building a front page, and BBC News Gujarati's phone-first
lightness, under the printed paper's own colours.

**The sample** is in `docs/website/sample/`:
- `capital-kranti-website.html` is the whole sample: home, a section page, an article page, the e-paper, the menu and search, both themes, the text size control and the English switch. Open it in a browser (it needs nothing else), **on a phone first**.
- It was published as https://claude.ai/artifact/RK4UQHxNmQvWrFZuuksEeY.
- It is generated: `python3 make_page.py` puts `full-img.json` (22 Oct's real stories, photos inlined) and the 22 Oct printed pages into `page_template.html`.

The real site (phase A of ROADMAP.md) turns the sample's parts into components.

---

## 0. Why not copy one paper

Checked on 24 Oct 2026:
- **What can be had legitimately from the Post:** its design kit, WPDS (`@washingtonpost/wpds-ui-kit`, MIT), with its tokens and ~36 basic components (buttons, drawer, carousel, tabs). **Its front-page layouts are not public** (they live in its own publishing system), and **its fonts are licensed to it**. Measuring its pages gives the look at a few widths, not the rules underneath, which is why the first sample broke at the edges.
- **The Post is built for other readers:** American, paying, often on desktops and iPhones.
- **Our readers** (Reuters Institute Digital News Report 2026, India):
  - get news from YouTube (~58%) and WhatsApp (~56%);
  - trust in news is low and falling (39%), and 53% (2025) named WhatsApp as the biggest source of false news;
  - are mostly on mid-range Android phones, on mobile data, many of them older.
- **Google sends less every year:** search referrals to publishers fell ~40% in a year (Chartbeat, July 2025 to July 2026). Readers who come straight to us, or through WhatsApp, matter most.

So the site wins on **trust, speed on a phone, and being where readers already are**, not on looking like a famous paper.

**What we take, and from whom** (patterns only; if we ever copy code, keep its licence notice):

| From | What | Licence of their code |
|---|---|---|
| The Washington Post | the ruled grid (1 px rules in the middle of gutters), the calm reading page, the drawer and panels | WPDS: MIT |
| The Guardian (`guardian/dotcom-rendering`) | the front page as a stack of **containers** (one per section), each filled with **cards** of a few fixed sizes; the live list | Apache-2.0 |
| BBC News Gujarati (`bbc/simorgh`, which renders bbc.com/gujarati) | phone first, light pages, Gujarati type that breathes, fast article pages | Apache-2.0 |
| The printed Capital Kranti | the purple wordmark, the navy and cyan, the heavy rule over a section | ours |

Never the Post's (or anyone's) logo, fonts, text, photos or screenshots in the repository.

---

## 1. Principles (in order; when two clash, the higher wins)

1. **Trust you can see.** Every story shows where it came from, that its numbers were checked, when it was updated, and how to report a mistake.
2. **Phone first.** Designed at 360-412 px wide, then widened. A ₹10,000 Android phone on patchy 4G is the test device.
3. **Fast and light.** Pages open in about 2 seconds on that phone; nothing waits for a script.
4. **Easy to read for every age.** Large Gujarati text, generous spacing, a text size control, audio (Listen), high contrast in both themes.
5. **Where readers are.** WhatsApp sharing and the WhatsApp channel are first-class; video shorts have their own strip; the e-paper is one tap away.
6. **Calm and ordered.** The ruled grid, few colours, no pop-ups, no autoplay with sound, no clutter. Ads (later) sit in marked slots and never move text.
7. **Gujarati first.** Every word on screen is Gujarati by default, with an English switch for the site's own labels.

---

## 2. Tokens

### 2.1 Colour

The printed paper's colours, measured from the 22 Oct front page: wordmark purple `#7f3894`, top bars navy `#2e3192`, rule cyan `#0aaae4`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#ffffff` | `#121214` | page |
| `surface` | `#f6f5f8` | `#1c1b20` | boxes, menu, sheets |
| `ink` | `#1d1d21` | `#e7e7ea` | body text |
| `strong` | `#111114` | `#ffffff` | headlines |
| `soft` | `#3f3f46` | `#c9c9d1` | summaries |
| `muted` | `#5f5f66` | `#a3a3ab` | times, captions, labels |
| `rule` | `#e4e2e8` | `#2c2b31` | grid rules between cards |
| `rule-strong` | `#111114` | `#e7e7ea` | the heavy rule over a section (as in print) |
| `brand` | `#7f3894` | `#c99be0` | wordmark, section names, links |
| `navy` | `#2e3192` | `#a4a7ff` | the e-paper button (white / dark text on it) |
| `cyan` | `#0aaae4` | `#0aaae4` | decoration only: the thin line under the header (too light for text) |
| `live` | `#0b6f99` | `#5cc8f0` | "updated" times, the live dot |
| `breaking` | `#b3261e` | `#b3261e` | breaking bar (white text) |
| `checked` | `#1d7a46` | `#62cf8f` | the "checked" mark |
| `whatsapp` | `#1a7f45` | `#1a7f45` | WhatsApp buttons (white text) |

All text pairs pass WCAG AA (checked 24 Oct: muted 6.3:1 light / 7.5:1 dark; brand 7.3 / 8.2; live 5.6 / 9.8; white on breaking 6.5, on WhatsApp 5.0).

**Theme:** follows the phone's setting by default; the reader can pick Light or Dark (remembered on that device).

### 2.2 Type

- **Reading** (headlines, summaries, body): **Noto Serif Gujarati**.
- **Interface** (labels, buttons, times, menus): **Anek Gujarati**, the newsroom's own UI font, so the site and the app feel like one family.
- Both free (OFL), from Google Fonts, which sends only the Gujarati and Latin pieces a page uses; self-hosted later. The paper's Gopika fonts are for print only.
- **Gujarati needs room:** its marks sit above and below the line, so line heights are higher than for English.
- **Smallest text 13 px**, and only for times and captions. Nothing that must be read is lighter than 400.

| Token | Phone | Desktop | Line height | Weight | Use |
|---|---|---|---|---|---|
| `display` | 28 | 40 | 1.3 | 700 | the lead story's headline |
| `h1` | 28 | 40 | 1.3 | 700 | an article's headline |
| `h2` | 22 | 26 | 1.35 | 700 | large cards, section titles |
| `h3` | 18 | 20 | 1.45 | 600 | standard cards |
| `h4` | 16 | 17 | 1.5 | 600 | list items, compact cards |
| `standfirst` | 17 | 20 | 1.6 | 400 | an article's summary |
| `body` | 18 | 19 | 1.85 | 400 | article text |
| `dek` | 15 | 16 | 1.6 | 400 | card summaries |
| `ui` | 15 | 15 | 1.3 | 500-700 | buttons, menus, section names |
| `meta` | 13 | 14 | 1.4 | 400-600 | times, places, captions |

**Text size control:** three steps on articles, 100%, 115%, 130% (remembered).

**Numbers:** the site's own labels use Gujarati digits in Gujarati (૨૨ ઓક્ટોબર) and English digits in English. Story text keeps whatever the story uses.

### 2.3 Space, grid and rules

- **Spacing:** steps of 4 px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Grid** (as the Guardian and the Post, sized for us):

| Width | Columns | Gutter | Side margin |
|---|---|---|---|
| under 740 (phone) | 4 | 16 | 16 |
| 740-1023 (tablet) | 8 | 24 | 24 |
| 1024 and up (desktop) | 12 | 32 | 32, content at most 1240 |

- **Rules:** cards sharing a row are divided by a 1 px `rule` **drawn in the middle of the gutter** (a cell's `::before`), and rows by a 1 px rule across (`::after`). Never borders on the cards themselves.
- **A section begins** with a 2 px `rule-strong` line across, then its name in `brand` with a ›, as the printed paper's heavy rules.
- **Corners:** square for photos and cards (a paper, not an app); round only for buttons (pills) and avatars.
- **Photos:** 3:2 in cards; 16:9 for the lead on desktop; 9:16 for shorts. Every photo has its space reserved, so nothing jumps while loading.

### 2.4 Motion

Short and quiet: 150-200 ms fades and slides for the menu and sheets. Nothing moves on its own except the live dot. All motion off when the phone asks for reduced motion.

---

## 3. Components

### 3.1 The frame

- **Header** (sticky, 56 px):
  - phone: menu ☰ | the wordmark કેપિટલ ક્રાંતિ in `brand` | search;
  - desktop: the same, plus the date and the e-paper button on the right;
  - a 2 px `cyan` line under it (the paper's rule).
- **Section scroller** under the header: ગુજરાત, દેશ, વિશ્વ, ખેતી, અર્થતંત્ર, ટેક-વિજ્ઞાન, આરોગ્ય, રમતગમત, શિક્ષણ, મનોરંજન; scrolls sideways on a phone, the current one underlined.
- **Breaking bar:** full width, `breaking`, "તાજા સમાચાર:" and the headline; closable; only for real breaking news.
- **Bottom bar (phone only):** હોમ, તાજા, વીડિયો, ઈ-પેપર, વિભાગો. Thumbs reach it; it hides while scrolling down and returns on scrolling up.
- **Menu** (a sheet from the left): search, every section with its topics, the e-paper, the WhatsApp channel, Settings (theme, text size, language), About and policies.
- **Footer:** the wordmark, link columns (About, editorial policy, how we check news, corrections, contact, send us news, advertise, terms, privacy, RSS), the RNI number, the address.

### 3.2 Cards (a few fixed sizes, as the Guardian's)

| Card | Parts | Where |
|---|---|---|
| **Lead** | photo (full width on phone), kicker, `display` headline, summary, time | the top of the home and section pages |
| **Standard** | photo 3:2 (optional), `h3` headline, summary (desktop), time | most containers |
| **Compact** | `h4` headline, small square photo on the right (optional), time | lists on phone, the rail on desktop |
| **List item** | time, `h4` headline | "Latest", "Most read" (numbered) |
| **Short** | 9:16 picture, duration, headline over a dark fade | the video strip |
| **E-paper page** | page image, page number | the e-paper strip and page |

Rules: a card without a photo is a text card, never an empty grey box. Headlines are never cut off with "…"; summaries may be.

### 3.3 Containers (the front page is a stack of them)

Each container is one section of news with a heading (§2.3), a layout and a link to the full section:
- **Top:** lead + 3 standard (phone: lead, then 3 compact).
- **Latest:** a time-stamped list, newest first, with "updated every few minutes" said honestly.
- **Section (Gujarat, India, World, a topic):** one standard with photo + 3-4 compact; World stays briefs.
- **Video:** a sideways strip of shorts.
- **E-paper:** today's 4 printed pages, small, and "read today's paper".
- **Join:** the WhatsApp channel (and Telegram), one at a time, never a pop-up.

### 3.4 Trust pieces (on every story)

- **Checked mark** (`checked` ✓): "આંકડા મૂળ સ્રોત સાથે ચકાસેલા" (numbers checked against the source), shown when the number check passed.
- **Times:** published and, when changed, "updated" with the time.
- **Source box** at the end: each source with a link (PIB, the CM's office, an outlet), and how the story was made, in plain words: written by Capital Kranti's desk from the official release, with AI help, and checked (to confirm with the user, §6).
- **Correction note:** when a story is corrected, a dated note at the top says what changed. Never a silent change.
- **"ભૂલ જણાવો"** (report a mistake) on every story.
- **Photo credit** in every caption.

### 3.5 Article page

1. Section and topic links.
2. Kicker, `h1` headline, standfirst.
3. Meta: desk and place, published, updated, the checked mark.
4. Tools: Listen (minutes), text size (અ− અ અ+), Share, Save. On a phone a **sticky bar at the bottom** holds a green **WhatsApp share** button, Listen and text size.
5. Photo with caption and credit.
6. Body in `body` type, at most ~36 Gujarati characters' width per line on desktop (about 640 px).
7. Source box, report a mistake.
8. More from the section (compact cards), the WhatsApp channel box.

### 3.6 Section page

Title in `brand` with Follow; topic chips; a Lead; then a river of compact cards with times, newest first; "more" loads the next page (no endless scroll that hides the footer).

### 3.7 E-paper page

The day's printed pages as images (tap to enlarge, pinch to zoom), the PDF to download, and a calendar for earlier days.

### 3.8 States

- **Hover** (desktop only): headlines dim to `soft`; plain links underline; buttons darken.
- **Focus:** always a visible 2 px ring in `live`.
- **Pressed:** a slight darkening; touch targets at least 48 × 48 px.
- **Loading:** reserved space with a faint `surface` block; never a spinner for text.
- **Empty:** a plain sentence ("આ વિભાગમાં આજે સમાચાર નથી") and a link back.
- **Offline:** "ઇન્ટરનેટ નથી" with the pages already read still readable (later).

---

## 4. Speed and accessibility budgets

- **Speed** (a mid-range Android phone on slow 4G):
  - largest content shown in under 2.5 s; nothing shifts (layout shift under 0.1);
  - page script under 50 KB; the page reads without script;
  - photos in sizes for each width (AVIF/WebP), lazy below the first screen;
  - fonts with `display: swap` and only the Gujarati and Latin pieces needed.
- **Accessibility:** WCAG 2.1 AA; `lang="gu"`; a skip link; real headings in order; every photo with alt text from its caption; everything usable by keyboard and screen reader.

## 5. Language

Gujarati first. The English switch changes the site's own labels, menus and dates; stories stay in Gujarati unless the user decides to translate them (it costs AI money; §6).

## 6. Open questions for the user

1. **How stories say they were made:** "written by Capital Kranti's desk from the official release, with AI help, and checked" in the source box. Is that wording right?
2. **The English switch:** labels only (free), or stories translated too (AI cost per story)?
3. **The domain:** the printed paper names `capitalkranti.co.in`; is it the paper's and can it point at the site?

## 7. How to check the design

- **Widths:** 360, 390, 412 (phones), 820 (tablet), 1440 (desktop): home, section, article, e-paper, the open menu, both themes, all three text sizes, English.
- **Must hold:** no script errors, no sideways scroll, no headline cut off, every rule line in its gutter, every hover and focus state looked at.
- **Speed:** Lighthouse mobile run on the real site from phase A on, against §4.
- **Send the user** phone and desktop screenshots before calling a page done.
