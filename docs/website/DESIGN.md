# The website's design: the Washington Post's UI, in Gujarati

Written 24 Oct 2026. The user wants the website to feel **exactly like the
Washington Post, dark**: its grid with lines and borders, its header, hover
states, modules and footer. On 24 Oct 2026 washingtonpost.com was explored in
the user's Chrome (looking, hovering and opening menus only) and measured with
the browser. This file is that inventory, mapped to Capital Kranti.

**The approved starting point** is the sample in `docs/website/sample/`:
- `capital-kranti-website.html` is the whole sample: home, a section page, an article page, the drawer, alerts and account panels, and dark and light themes. Open it in a browser; it needs nothing else.
- It was published as https://claude.ai/artifact/EnGn4RLGwG5BQyeo2nMLpq (version 3).
- It is generated: `python3 make_page.py` puts `full-img.json` (22 Oct's real stories, photos inlined) into `page_template.html`.

The real site turns the sample's parts into components. It copies the Post's
layout and patterns only, **never its logo, fonts, text or images**.

---

## 1. Design tokens (measured)

**Fonts:**
- **The Post uses:**
  - headline: Postoni (serif);
  - subhead and labels ("meta"): Franklin (sans);
  - body: Georgia.
- **We use:**
  - Noto Serif Gujarati for headlines and body;
  - Hind Vadodara for meta, labels and buttons.
- The paper's Gopika fonts are licensed for print, not the web.

**Type scale:** 0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.625, 1.75, 2, 2.25, 2.5, 2.75, 3 … 5 rem.
- Weights 300 / 400 / 700 / 800.

**Line heights:**
- **The Post:** headline 1.1, body 1.6, meta 1.25.
- **Gujarati needs more** (its marks above and below): headline about 1.3, body about 1.8.

**Spacing:** 0.25 rem steps (0.25 to 5 rem).

**Corner radii:** 0.125 to 1.5 rem, plus round (pills and avatars).

**Dark palette** (the default theme):

| Token | Value |
|---|---|
| Page | #141414 |
| Headline text / bright | #dedede / #ffffff |
| Secondary text | #a1a1a1 |
| Cell rules | #252525 |
| Rule over a section name | ~#5a5a5a |
| Primary pill (Post: Subscribe) | #166dfc |
| Live / time-ago | #5892c9 |
| Breaking banner | coral-red, ~#f45a5a |
| Opinion underline | red |

A **light theme** and **"match device"** are switchable from the account panel.

**The grid (the lines and borders the user asked for):**
- **Columns:** 20 columns of 34 px with 32 px gutters, 1,288 px at most.
- **Front block:** 15 columns, with a 5-column right rail.
- **Rows:** 32 px apart inside a block, 64 px between blocks.
- **The rules:** every cell draws its 1 px rules in the middle of its gutter:
  - `::before` is the vertical one, at left −16 px;
  - `::after` is the horizontal one, at top −16 px.

  That is what gives the Post its ruled look; borders on the cells themselves look wrong.

**Breakpoints:**
- under 768: one column;
- 768–1023: tablet;
- 1024 and up: desktop;
- 1150 and 1400: wider tunings.

**Hover and focus:**
- headlines dim to grey (no underline);
- footer and plain links underline;
- icon buttons get a round grey background;
- pills darken;
- focus is always a visible ring.

## 2. Header

- **Utility bar** (56 px, sticky):
  - left: the sections/search icon and the alerts bell (red dot when unread);
  - right: the primary pill and the account icon.
  - Once you scroll past the masthead, the small masthead appears in the centre, and the trending row sticks under it.
- **Masthead:** the large wordmark and an italic tagline.
- **Section bar:** bold sans links, a thin divider before the product links, and a full-width light rule under it.
- **Trending row:** "Trending" in bold, then 6 topic links.
- **Breaking banner:** a full-width coral bar: **"Breaking:"**, the headline, and a close ×.

**Sections drawer** (left, about 286 px; the page dims behind it):
1. the primary button;
2. search;
3. main sections, each with a › that opens a sub-list;
4. the A–Z list of every section;
5. "Explore" (the products).

**Alerts panel:** "NEWS ALERTS" with a settings icon. Each alert shows a red dot when unread, the headline, and "BREAKING · time • category".

**Account panel:** name, links, and **Display theme: Match device / Dark / Light**.

## 3. Home page modules, top to bottom

1. **Front block (15 columns) plus the right rail (5):**
   - a kicker with an icon and ›;
   - a lead package: headline, light summary, byline, and a 10-column photo with a grey caption;
   - a row of 3 headlines with vertical rules;
   - **"The 7 · LIVE":** a carousel of developing stories (avatar, minutes ago in blue, "New", ← →);
   - more packages, some with related links and a white pill badge;
   - the rail: "Opinions ›" with a red underline; each item has the author (small), the headline (serif 18) and a round avatar; some have "▶ Listen 27 min".
2. **More Top Stories:** a big photo lead with a badge, 6 headlines divided by rules, and a "Most Read" rail with big serif numbers 1–4.
3. **Ripple (other outlets):** a description, a "Learn more ↗" pill, and a carousel of other outlets' pieces (outlet logo, author, headline, thumbnail).
4. **Latest:** 4 columns with labels and times, and an occasional thumbnail.
5. **Feature cards:** a podcast card with a "▶ Listen" pill, and image cards with labels.
6. **A section block:** a big photo lead (8 columns), a list of 6 with labels, and a **newsletter promo box**.
7. **Video:** a landscape video card and **tall 9:16 tiles** (caption over the picture, "▶ 1:39"), with "Watch all" and an arrow carousel.
8. **Section bands in pairs:** each half has a rule over the name, the name with ›, a lead photo (5 columns) with its headline, and 3 headlines with rules.
9. A second tall-video strip.
10. **Diversions:** games with small icons.
11. **Footer:** the wordmark, 5 link columns, and the copyright line.

**Section page:**
- a big bold sans title with a "+" follow button, and sub-section links;
- a 3-part top: a text story with a badge, a huge photo, and two photo stories;
- a **"More stories" river:** a date column, headline, summary, a right photo, and rules between, with a promo in the right rail.

**Article page:**
1. Section sub-nav.
2. A centred 640 px column: headline 48 px serif, summary 20 px light, published and updated times.
3. Toolbar: Listen (minutes), Share, Save.
4. Photo and caption (sans 14 px grey), byline.
5. Body at 20/32.
6. Recommended stories, a sign-up box, the footer.

## 4. Mapped to Capital Kranti

| The Post | Capital Kranti |
|---|---|
| Wordmark and tagline | કેપિટલ ક્રાંતિ, "સમાજનો વિવેકપૂર્ણ દ્રષ્ટિકોણ" |
| Subscribe pill | "ઈ-પેપર" (e-paper: today's printed pages and PDF) |
| Opinions rail | "વિશેષ" (features and editorials), with a round icon or photo |
| The 7 · LIVE | "તાજા સમાચાર · LIVE" (latest news), from the live pipeline |
| Most Read | "સૌથી વધુ વંચાયેલા" (most read; real counts once the site runs) |
| Ripple | "અન્ય માધ્યમોમાંથી" (from other outlets): credited, linked pieces |
| Video strips | "વીડિયો સમાચાર" (video news): our shorts (9:16) |
| Alerts bell | breaking-news alerts |
| Ask The Post AI | "પૂછો" (ask): later, answers from our own archive |
| Newsletter promo | WhatsApp Channel / Telegram join box |
| Diversions | later (a Gujarati crossword) |
| Paywall, subscriptions, comments | **none**: the paper is free; comments need moderation (later) |

**Sections (tiers × genres):**
- **Tiers:** ગુજરાત (Gujarat), દેશ (India), વિશ્વ (World).
- **Genres:** ખેતી (agriculture), અર્થતંત્ર (economy), ટેક અને વિજ્ઞાન (tech and science), આરોગ્ય (health), રમતગમત (sport), શિક્ષણ (education), મનોરંજન (entertainment).

**Language:** Gujarati first, with an English switch (as in the newsroom).

## 5. How to check the design

- **Widths:** render home, section, article, the open drawer, the alerts and account panels, and the light theme at **390, 820 and 1440** widths.
- **Must hold:**
  - no script errors and no sideways scroll;
  - every rule line and every hover state looked at.
- **Side by side** with the Post, module by module. **Don't commit the Post's screenshots** (they're its content): take them fresh in the session that needs them.
- **Send the user** desktop and phone screenshots before calling a page done.
