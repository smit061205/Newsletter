# Capital Kranti: an automatic newspaper engine

This software produces a complete, print-ready daily newspaper by itself. The first paper is **કેપિટલ ક્રાંતિ (Capital Kranti)**, a Gujarati daily from Gandhinagar. The engine is built so that other papers (Gujarati, English, Urdu) can be added as data, without code changes.

Every night it:
1. collects the day's Gujarat government press releases;
2. has an AI model rewrite them as newspaper stories;
3. lays out every page (masthead, stories, photos, ads, page headers and footer) with measured precision, in the paper's own Bharati Gopika fonts;
4. runs a set of release checks;
5. produces a print-ready PDF, plus page images for the website;
6. waits for an editor to approve it.

The rule throughout: **the AI makes the judgement calls, and the code does the measuring.** AI writes, shortens and reviews. Every position on the page is computed by measuring real text in Chromium (the same browser engine that prints the PDF), so the layout is exact, repeatable and costs nothing to compute.

> **New here? Read `HANDOFF.md` first:** what the October 2026 session changed, where things stand, and the daily routine.
>
> **This README is the hand-over document.** It is written for someone (or a Claude Code cloud session) starting with no prior context: what exists, how it works, how to run it, and exactly what is left to do.

---

## Contents
1. [Current status](#1-current-status)
2. [Quick start](#2-quick-start)
3. [Repository map](#3-repository-map)
4. [Architecture](#4-architecture)
5. [The render contract](#5-the-render-contract-backend--frontend-json)
6. [The publication profile](#6-the-publication-profile-one-paper--one-folder)
7. [Fonts: Bharati Gopika (legacy encoding) and licensing](#7-fonts-bharati-gopika-legacy-encoding-and-licensing)
8. [The layout engine](#8-the-layout-engine-how-a-page-is-built)
9. [AI: models, prompts, costs](#9-ai-models-prompts-costs)
10. [Release gates ("is the paper perfect?")](#10-release-gates-is-the-paper-perfect)
11. [Ingest: where the news comes from](#11-ingest-where-the-news-comes-from)
12. [Backend API, storage, nightly job](#12-backend-api-storage-nightly-job)
13. [Website (frontend)](#13-website-frontend)
14. [Tools, tests and the replica](#14-tools-tests-and-the-8-august-replica)
15. [Remaining work, in detail](#15-remaining-work-in-detail-do-these-in-order)
16. [Known issues and gotchas](#16-known-issues-and-gotchas)
17. [Decisions already made (don't re-litigate)](#17-decisions-already-made-dont-re-litigate)
18. [Glossary](#18-glossary)

---

## 1. Current status

**Last verified build:** 22 October 2026 (issue 271), 4 pages, 29 stories from PIB (Gujarati, plus Hindi translated), **every release gate passing (READY)**, made by the 8 PM run and finished from the newsroom.

| Area | State |
|---|---|
| Render contract and plotter (JSON → website and PDF) | Done, with right-to-left text (`direction`, `lang`) |
| Publication profile (all paper settings as data) | Done: Capital Kranti, `dev-test`, `sample-english`, `sample-urdu` |
| Bharati Gopika encoder | Done |
| Layout engine: modules, packer, gap closing, level columns, tight photos | Done |
| Release gates (1–7, S1–S7, **F** every letter in its font, **P** print preflight) | Done |
| **News: PIB** (Gujarati from PIB Ahmedabad; Hindi from PIB Delhi, translated when short) | Done (`ingest/pib.ts`, `editorial/translate.ts`) |
| AI: rewrite, round-ups, length fitting, **editorial plan**, page review | Done (`editorial/`) |
| **One pipeline as jobs** (fetch → rewrite → top-up → features → build), 8 PM, live log, retry | Done (`pipeline.ts`) |
| **Newsroom website** (Today, News, Stories, Pages, Ads, Papers, Settings) | Done (`web/src/app/newsroom/`, only where `NEWSROOM=1`) |
| **Apps: Windows installer and Mac app** (one launcher, log-in start, evening wake) | Done (`windows/`, `mac/`, `scripts/launch.mjs`) |
| **CorelDRAW SVG export** | Done (`export/svg.ts`, `/api/export/:date.svg?page=N`) |
| **Add a newspaper** (profile drafted from PDFs, saved as a paper, test issue) | Done (`onboard/`, Papers screen) |
| Urdu (right to left) | Works (`sample-urdu`); Nastaliq tuning waits for the paper's chosen font |
| State news (Gujarat Info Dept) | Off (PIB only, by choice): the `/reader` bookmark remains; email ingest not built |

---

## 2. Quick start

### The app (what the paper's computer runs)
- **Windows:** double-click `windows\Install Capital Kranti.cmd`. **Mac:** `mac/Install Capital Kranti.command`. They install Node and Git if needed, copy the app, its Chromium and the Gopika fonts (from a folder you pick), sign in to GitHub for Publish, build the newsroom, put **Capital Kranti** on the desktop / in Applications, start it at log-in and wake the computer at 7:55 PM.
- **The newsroom** opens at `http://127.0.0.1:3000/newsroom`; the engine at `http://127.0.0.1:4000` (both local only). One launcher behind both apps: `node scripts/launch.mjs [--background | --stop | --update | --status]`.
- **Every evening** the engine runs the day (PIB → rewrite → Hindi top-up → features if short → build) at the Settings' time; the editor reviews it on **Today / Pages / Stories**, then **Approve & Publish** (website) and **Print PDF**. The editor's guide: `docs/NEWSROOM_GUIDE.md` (Gujarati and English).
- By hand: `cli.ts all --date D [--from fetch|rewrite|topup|fill|build]`, `cli.ts pib --date D --lang gu|hi`, `cli.ts topup --date D`.

### Requirements
- **Node 22+** (the backend runs TypeScript directly with `--experimental-strip-types`, and uses the built-in SQLite with `--experimental-sqlite`).
- **Python 3.11+** with `pymupdf`, `pillow`, `fonttools`, `numpy`. These are needed only for the replica and asset tools in `scripts/`, not for the daily build.
- **Playwright Chromium, pinned to 1.62.1.** Run `npx playwright install chromium`. The version is pinned in `web/`, `backend/` and `shared/`; don't upgrade one without the others.

### Install
```bash
npm install
npx playwright install chromium
pip install pymupdf pillow fonttools numpy
```

### Secrets and licensed files (not in git; you must supply them)
1. **`backend/.env`**:
   ```
   OPENROUTER_API_KEY=sk-or-...
   # optional overrides:
   # OPENROUTER_MODEL=openai/gpt-6-luna
   # OPENROUTER_LEAD_MODEL=google/gemini-3.8-flash
   # OPENROUTER_VISION_MODEL=google/gemini-3.8-flash
   ```
2. **The Gopika fonts**, commercial, from the paper's DTP machine, copied to `publications/capital-kranti/fonts/` with exactly these names:
   - `gopika-two-regular.ttf` (B Bharati GopikaTwo Normal)
   - `gopika-two-bold.ttf` (B Bharati GopikaTwo Bold)
   - `gopika-two-bolditalic.ttf` (B Bharati GopikaTwo BoldItalic)
   - `gopika-light-two-regular.ttf` (B Bharati GopikalightTwo Normal)

   `publications/*/fonts/*.ttf` is in `.gitignore`. **Never commit these files** to this public repository. Without them the build stops with "fonts failed to load for measuring".
3. **`web/.env.local`**: the website's switch between mock and live data:
   ```
   BACKEND_API_MODE=live            # or "mock" (the 8 August replica, no backend needed)
   BACKEND_API_URL=http://localhost:4000
   ```

### Run
```bash
# the backend API (also starts the 8 PM job)
node --experimental-strip-types --experimental-sqlite --no-warnings backend/src/cli.ts serve --port 4000

# the website (another terminal)
npm run dev --prefix web          # http://localhost:3000
```
`.claude/launch.json` has both as `backend` and `web-dev`.

### Deploy for free: build at home, publish to Vercel (static mode)
The backend runs on your own computer (where the licensed fonts are); the website on Vercel shows what you publish.
1. **Vercel, once:** a project with root directory `web` and the environment variable `BACKEND_API_MODE=static`.
2. **Every day, on your computer:**
   ```bash
   B="node --experimental-strip-types --experimental-sqlite --no-warnings backend/src/cli.ts"
   $B all     --date 2026-10-21          # (or ingest/rewrite/build by hand)
   $B publish --date 2026-10-21 --push   # page JPEGs + PDF + issue.json -> web/public/issues, commit, push
   ```
   Vercel redeploys on the push (from the branch its project deploys, usually `main`). `publish` refuses a NOT READY issue unless you add `--force`, and keeps the last 14 days on the site (`--keep N`).
- Only page images and the PDF are published, never the font files.
- Each day adds about 12 MB to the repository (4 page JPEGs of about 1.5 MB, plus the PDF). Older days leave the site but stay in git history. If the repository grows too large, move the files to cheaper storage.

### Deploy with a hosted backend (website on Vercel, backend on Render, paid)
- **Backend:** a Render web service built from the root `Dockerfile` (Node 22 + Playwright Chromium), on a paid instance with a **persistent disk mounted at `/var/data`** (`DATA_DIR`). The disk holds the SQLite database, PDFs, page images and release photos; copy the licensed fonts to `/var/data/publications/capital-kranti/fonts/` (never into git). Environment: `OPENROUTER_API_KEY`, `BACKEND_API_TOKEN` (required on every POST). Health check: `/healthz`.
- **Website:** a Vercel project with root directory `web`, and `BACKEND_API_MODE=live`, `BACKEND_API_URL=<the Render URL>`, `BACKEND_API_TOKEN=<same token>`.
- The browser hand-off page needs the token too: `/ingest?token=<token>#<json>`.

### Build an issue by hand
```bash
B="node --experimental-strip-types --experimental-sqlite --no-warnings backend/src/cli.ts"
$B ingest  --date 2026-10-21   # fetch releases (blocked by the site from servers, see 11)
$B rewrite --date 2026-10-21   # AI rewrite (adds --force to redo stories already rewritten)
$B build   --date 2026-10-21   # lay out, check, save a draft, write the PDF and page images
$B all     --date 2026-10-21   # what the nightly job runs
```
Output: `out/backend/capital-kranti-<date>.pdf` and `out/backend/pages/capital-kranti/<date>/<n>.png`. The build prints the gate table at the end.

**Note:** `backend/data/capital-kranti.sqlite` (the releases, stories and issues) is **not in git**, so a fresh checkout has no stored news. Use the release upload API (12) or build the inbox ingest (15.2) to get material.

---

## 3. Repository map

```
package.json                npm workspaces: shared, web, backend
shared/                     used by both website and backend -- ONE copy
  src/contract.ts           the render contract (Zod schema + TS types)
  src/plot.ts               the plotter: contract JSON -> standalone HTML per page,
                            plus the in-page PROBE (overflow/overlap/font/image checks)
  src/pdf.ts                prints plotted pages with Playwright Chromium, merges with
                            pdf-lib, optional PNG page images
  src/profile.ts            the publication profile schema
backend/
  src/cli.ts                ingest | rewrite | build | all | publish | serve | status
  src/publish.ts            built issue -> web/public/issues (JPEG pages, PDF, issue.json)
  src/config.ts             paths; assetFile() maps /private/<paper>/... to the
                            publication folder (licensed fonts, never public)
  src/profile.ts            loads publications/$CK_PUBLICATION/profile.json
  src/store.ts              SQLite (releases, stories, ads, issues, edits, fitted)
  src/server.ts             HTTP API + the 20:00 Asia/Kolkata job
  src/build.ts              the whole issue build + release gates
  src/chrome/chrome.ts      masthead / running headers / footer with the day's fields
  src/fonts/bharati.ts      Unicode Gujarati -> Bharati Gopika glyph codes
  src/ingest/gujaratInfo.ts Playwright reader for gujaratinformation.gujarat.gov.in
                            (blocked from servers -- see 11)
  src/editorial/rewrite.ts  OpenRouter rewrite + fitLength() + fact check
  src/editorial/review.ts   vision page reviewer (gate 5)
  src/layout/
    measure.ts              Measurer: line breaking, widths, ink, topFor(), shape()
                            (legacy encoding + Latin runs) -- all in Chromium
    typography.ts           profile values in contract px (PT, GRID, BODY, HEADLINE...)
    module.ts               a story at its natural size (k columns)
    linebreak.ts            total-fit line breaking + spacing of a justified line (8.6)
    display.ts              headlines, kickers, decks fitted to the full width (8.7)
    text.ts                 printed text: the paper's digits, clean spacing
    ads.ts                  ads as modules at the foot of the page (unless pinned)
    occupancy.ts            the page's whitespace map (gate 2, gap filling)
    style.ts                style gates S1-S6
    pack.ts                 page packer (skyline + beam search), tombstone/headline rules
    fit.ts                  gap closing: longer version, AI fit, sentence trim, pitch,
                            briefs, house ad
    stories.ts              dedupe, related stories, edits, stand-in ads
    compose.ts              older box-filling composer; its helpers (stackLines,
                            columnElements...) are used by module.ts. Rest is dead code.
  test/                     bharati-roundtrip.ts, compare-models.ts, recompose-0808.ts (stale)
publications/capital-kranti/
  profile.json              everything that makes Capital Kranti look like itself
  chrome.json               masthead/header/footer art + field positions + stand-in ads
  fonts/bharati.json        learned syllable spellings + glyph table (for the encoder)
  fonts/*.ttf               LICENSED -- not in git, supply yourself
web/                        Next.js 16 website (see web/AGENTS.md: this Next differs
                            from older versions -- read node_modules/next/dist/docs)
  src/app/page.tsx          issue viewer (one scaled iframe per page; static mode: published images)
  src/lib/published.ts      static mode: reads web/public/issues (written by cli.ts publish)
  src/app/api/render/[page] page HTML, or the backend's page image for restricted fonts
  src/app/api/pdf           PDF download (the backend's PDF for restricted fonts)
  src/app/api/issue         validated issue JSON
  src/mocks/                MSW mock backend + the 8 August replica JSON + stress fixture
  public/fonts              free fonts (Hind, Mukta, Baloo, Tinos, Liberation Serif)
  public/chrome             blank masthead/header art + stand-in ad creatives
  public/replica            8 August photos/ads used by the replica
scripts/
  replica/bharati_decode.py legacy Bharati -> Unicode decoder (the glyph table)
  replica/bharati_learn.py  learns the paper's syllable spellings -> bharati.json
  replica/bharati_check.py  round-trip test (with backend/test/bharati-roundtrip.ts)
  replica/line_diff.py      line-by-line baseline/edge check vs the original PDF
  replica/compare.py        page size + blank-area check vs the original
  replica/extract_source.py article regions of the 8 August issue
  mock_backend/from_source.py  8 August PDF -> element-level JSON (the replica);
                            --gopika sets it in the real Gopika fonts
  mock_backend/chrome_assets.py  blank chrome art + field template + ad creatives
  mock_backend/print-issue.mts   print any issue JSON to PDF without a server
docs/
  RENDER_CONTRACT.md        the JSON spec (for anyone writing a backend)
  FRONTEND_ROADMAP.md, PRECISION_ROADMAP.md   history
archive/                    retired code, kept for reference (frontend-layout-engine,
                            legacy-pipeline). The 8 August article boxes in
                            archive/frontend-layout-engine/article-level-issue-2026-08-08.json
                            are still used by recompose-0808.ts.
(196) Capital Kranti_08 august.pdf   THE reference issue (the only one that exists)
(172) PDF.pdf                        a blank master from earlier work
```

---

## 4. Architecture

```
 news source ──► ingest ──► releases (SQLite)
                               │
                   AI rewrite (OpenRouter) ──► stories: kicker, headline, deck,
                               │                body long/medium/short, priority
                               ▼
   publication profile ──► LAYOUT ENGINE (backend, Node + headless Chromium)
   (page, grid, fonts,        1. chrome (masthead / headers / footer with today's fields)
    type, spacing, photo      2. ads (fixed blocks)
    rules, chrome)            3. story modules at natural size      (module.ts)
                              4. page packing, beam search          (pack.ts)
                              5. gap closing: AI length fit, trims  (fit.ts)
                              6. render contract JSON, Zod-validated
                              7. print + PROBE checks + page images (shared/pdf.ts)
                              8. release gates + AI page review     (build.ts, review.ts)
                               ▼
                     issue (draft, versioned) ──► editor approves
                               ▼
              website (Next.js) shows page images; PDF goes to the printer
```

There are three layers:
- **Profile (data).** Everything specific to one paper.
- **Engine (code).** The same for every paper.
- **AI.** Rewriting, length fitting and page review now; the editorial plan to come.

The frontend is a **pure plotter**: it never moves, resizes or reflows anything.

---

## 5. The render contract (backend → frontend JSON)

The full spec is in **`docs/RENDER_CONTRACT.md`**; the source of truth is `shared/src/contract.ts`.

- **Units:** every length is in px at `dpi` (300); 1 px = 0.24 pt.
- **Document:** `issueDate`, `issueNumber`, `dpi`, `fonts[]`, `pages[]`. Each font has `id`, `url`, `weight` and `style`, plus `restricted` for licensed fonts. Each page has `number`, `width`, `height` and `elements[]`, drawn in order.
- **Element kinds:**
  - `text`: `x, y, width, height, text` (a string or runs `[{text, font?, size?, color?}]`), `font, size, lineHeight, color, align` (`left|center|right|justify|justify-all`), and optionally `hScale, letterSpacing, wordSpacing, indent, vAlign, plainText, nowrap`. `nowrap` marks one line the backend set to its width itself (spacing and squeeze already computed); with `justify-all` the plotter checks it prints at that width.
  - `image`: `url, fit`.
  - `rect`: `fill, stroke, strokeWidth, radius`. The stroke is centred on the edge.
  - `line`: `x1, y1, x2, y2, color, width, dash`.
  - `path`: SVG `d` in contract px, with `fill, stroke`.
- **Text rules:**
  - `"\n"` ends a line, and in justified text that line is stretched to the full width;
  - `"\n\n"` starts a new paragraph;
  - a trailing `"\n"` also stretches a paragraph's last line;
  - runs never change the line's baseline.
- **Exact placement (measured in Chromium):**
  ```
  offset = round(ascent*s) + floor((L - round(ascent*s) - round(descent*s)) / 2)
  printed baseline = round(top) + offset + 1          (CSS px; s, L = size, lineHeight in CSS px)
  ```
  `backend/src/layout/measure.ts` `topFor()` implements it.
- **`plainText`:** the Unicode text when `text` is in legacy glyph codes. The plotter exposes it as `aria-label`.
- **Plotter warnings** (in-page PROBE): `text-overflow`, `overlap` (ink box per word), `off-page`, `image-failed`, `font-failed`, `empty-text`, `line-fit` (a fitted line not printing at its width).

---

## 6. The publication profile (one paper = one folder)

The profile is `publications/<id>/profile.json`, validated by `shared/src/profile.ts`. It is selected with the `CK_PUBLICATION` environment variable; the default is `capital-kranti`. It contains:

- **`language`:** `lang`, `direction`, digits, weekday names, the `dateLine` pattern (`"તારીખ : {dd}-{mm}-{yyyy}, {weekday}"`) and the `issueLine` pattern.
- **`issue`:** a reference date and number for counting issues (one issue a day from No. 196 on 2026-08-08), and the page count.
- **`page` and `grid`:** in pt. Capital Kranti is 1105.5 × 1488.2 pt with 8 columns of 124.2 pt and an 11.884 pt gutter.
- **`fonts`:** a role id mapped to `{file, weight, style, encoding: "unicode"|"bharati", restricted, latin}`. `latin` names the font that sets English words and Latin digits inside a legacy-font run.
- **`type`:**
  - body size, pitch and indent (13 / 15.6 / 12 pt, as printed);
  - headline: `capByColumns`, the largest size by column span; `rankScale`, the share of that cap for ranks 1–5; `maxLines` by rank;
  - kicker and deck ratios;
  - caption.
- **`spacing`:** the gaps between parts of a story, `betweenStories` (8 pt), `storyRule` (0.75 pt).
- **`photo`:** at most 15% cropped, at least 80 pt tall, at least 2 columns wide, at least 200 ppi at print size, at most 45% of the story.
- **`chrome`:** points to `chrome.json`.
- **`fillers.houseAd`:** the lines of the paper's own house ad.
- **`editorial`:** `workhorseModel`, `leadModel`, `leadStories`.
- **`fontLicence`:** a note on what the licence allows.

`chrome.json` (made by `scripts/mock_backend/chrome_assets.py`) holds:
- for each role (`first` / `inner` / `last`): the blank art image and the band where stories may go;
- the **dynamic fields** (`issue`, `date`, `folio`), with their printed font, size, baseline and left edge, so today's text is set exactly where the original was;
- the 8 August **ad creatives**, used as stand-ins until real bookings exist.

**Rule: no paper-specific constants in engine code.** Anything you'd change for another paper belongs in the profile.

---

## 7. Fonts: Bharati Gopika (legacy encoding) and licensing

- **Gopika is pre-Unicode.** Each character code is a glyph shape in visual order: the i-sign is typed before its consonant, the reph after its syllable, and conjuncts are single codes or half forms.
- **Decoder:** `scripts/replica/bharati_decode.py` (table `T`). It was built by reading every glyph off the 8 August PDF and is validated on all 1,319 legacy spans.
- **Encoder:** `backend/src/fonts/bharati.ts`.
  - It first uses the paper's own spellings, learned per syllable by `bharati_learn.py` (620 syllables) and stored in `publications/capital-kranti/fonts/bharati.json`. Where those don't cover a syllable, it runs the decoder's rules backwards.
  - **Tested:**
    - all 1,319 8 August spans round-trip, 97% byte-identical to the typesetters' own codes;
    - every word of the 21 October news round-trips;
    - re-run with `backend/test/bharati-roundtrip.ts` and `scripts/replica/bharati_check.py`.
  - **Special cases:**
    - **digits and English:** the font draws ASCII digits as Gujarati digits, so Latin letters and digits go into `latin` runs (Tinos / Liberation Serif);
    - **₹:** written as રૂ.;
    - **ઃ (visarga):** uses the font's colon, which is the same two dots;
    - **dashes:** the font has its own en and em dash.
  - **Unknown characters** are collected in `Measurer.unencodable` and logged by the build. They are never silently replaced.
- **Where encoding happens:** `Measurer.shape()` converts every word before it's measured, so line breaks are computed on the glyphs that will actually print.
- **Fonts still missing:**
  - **BBharatiMaruti**, the condensed headline face. Its headlines currently fall back to GopikaTwo Bold.
  - **BBharatiTitleTwo**, the masthead face. The masthead is artwork, so this only matters for section labels.
- **Licence:** these are commercial fonts (Oasis Systems, 2002).
  - Their OS/2 `fsType=1` flag is an old, non-standard value. The PDF embeds them, which is fine for print.
  - Until the paper confirms that web use is allowed, they are treated as **restricted**: they live in `publications/<paper>/fonts/` and are reached only through `/private/<paper>/...` by the backend's own Chromium (`config.ts` `assetFile`).
  - The **website shows page images rendered by the backend** (`/api/pages/<date>/<n>.png`), and its PDF button hands over **the backend's PDF** (`/api/issues/<date>/pdf`).
  - If the paper confirms web use, set `restricted: false` in the profile.

---

## 8. The layout engine (how a page is built)

### 8.1 Measurement (`layout/measure.ts`)
- One long-lived headless Chromium loads the issue's fonts.
- `breakLines()`: Chromium measures every word once with canvas `measureText` (the same HarfBuzz shaping it uses on the page): its width, and how many letters letter spacing applies to. The breaks are then chosen in Node: **total-fit** for body text (`optimal`, see 8.6), greedy otherwise.
- `words()`: one text's measured words, for display lines (8.7).
- `ink()` returns ink extents and font metrics; `widths()` and `imageSize()` are also here.

### 8.2 Story module (`layout/module.ts`), a story at its natural size
For a story with a given **rank** (1 = lead … 5 = brief), **column span k**, **variant** (`long|medium|short`) and **photo mode** (0 = beside the text, 1 = across the whole story, 2 = two photos side by side):
- **Headline, kicker, deck:** set by `display.ts` (8.7): every line fitted to the story's full width, at the largest size the rank allows (`capByColumns[k] × rankScale[rank]`; a short headline may go one rank up to fill). Kicker 0.6× and deck 0.45× the headline size; every kicker centred over its story.
- **Text** is normalised first (`text.ts`): numbers in the paper's digits (English ones like "ATM 2026" stay Latin), clean spacing.
- **Photo:**
  - natural aspect ratio, nothing cropped in mode 0;
  - must meet the photo rules (minimum height, ppi, share of the story);
  - must not be taller than the text beside it, which would leave a hole;
  - modes 1 and 2 need landscape photos (width/height ≥ 1.25).
- **Body:** 13 pt on 15.6 pt (or a pitch within 2% from the gap closer), one element per line, each spread to exactly the column width (8.6); columns balanced so they end at most one line apart (`balance()`); first-line indent.
- **Result:** exact `width`, `height` and `elements`, positioned at (0, 0); `place()` moves them onto the page.

### 8.3 Page packing (`layout/pack.ts`)
- **Fixed blocks:** chrome and ads. Ads are placed first (`ads.ts`): a booking may pin its position; any other ad (the 8 August stand-ins included) is snapped to whole columns, shape kept, and stacked up from the foot of the page, so stories get one unbroken area. Each column's "free y" skips over ads (`settle`).
- **Skyline:** take the lowest, leftmost open stretch of columns and try candidate stories × spans (`spansFor(rank)`) × photo modes × variants. Keep the longest variant that fits under the next obstacle.
- **The lead:** the first story placed on each page is that page's lead (rank 1).
- **Beam search:** keep the 12 best partial pages at each step. A state's score combines:
  - white space already stranded, plus white space projected once the copy still allowed on the page fills the open area;
  - minus the value of what's placed: importance × length, less penalties for a dropped photo, a related story on the same page (−1.5), a headline over 30% of its story (−4), tombstoned headlines (−4), headline sizes out of importance order (−4), and a headline that can't fill its width (−3, so a narrower span wins).
- **Page budgets** (`build.ts`): the day's copy at natural size, divided between pages in proportion to their free room. That stops page 1 from taking everything. A budget is a preference: when only an over-budget story fits a stretch, it goes in rather than leaving a hole. No headline in one column except briefs.
- **Rules between stacked stories:** an 8 pt gap and a 0.75 pt rule (`renderPlaced`).

### 8.4 Gap closing (`layout/fit.ts`)
- For each placed story, `room()` measures the space down to the next element below in its columns: a story, an ad, a house ad, or the foot of the band.
- If more than one line is free, it tries, in order:
  0. display before copy: a landscape photo across the whole story;
  1. the next longer variant;
  2. **AI `fitLength`** to the word count the gap needs (words per line measured from the story itself). Up to 3 rounds; if the AI overshoots, it asks again for fewer words;
  3. **sentence trim** of the shortest version that overshot: drop whole sentences from the end until it fits exactly. News puts the most important facts first, so the end is what goes;
  4. pitch +≤2%, once.
- Still more than 4 lines free, and then **every empty area found on the finished page** (`occupancy.ts`: all element boxes on a columns × 2pt grid, so holes beside ads or between stories of different widths count too): a left-out story, else a 60- or 40-word AI brief, else a filler -- the **house ad** where the area is wide and shallow, otherwise a **public-service message** (`fillers.messages` in the profile, e.g. "રક્તદાન મહાદાન ચક્ષુદાન શ્રેષ્ઠદાન") set in fitted display type in a ruled panel. At most **one message and one house ad in a whole issue** (`fillers.maxMessages`, `maxHouseAds`): space is filled with stories, not slogans; a day short of copy fails gate 2 instead.
- What remains is reported as `white-space` (gate 2). More than 2 fillers on a page is logged as "short of copy" (and gate S5 fails past 12% of the page).

### 8.5 Chrome (`chrome/chrome.ts`)
The art is the 8 August masthead and headers with the date, issue number and page number **removed** (PyMuPDF redaction, text only). Today's values are set in Gopika Bold at the printed size, on the printed baseline. Page 1 gets the masthead, inner pages the inner header, and the last page the last-page header plus the legal footer.

### 8.6 Body justification (`layout/linebreak.ts`)
A browser breaks lines greedily and puts all the slack of a justified line into its word gaps: holes and rivers, worst on lines of two or three long Gujarati words. Instead:
- **Total-fit breaking** (Knuth & Plass, 1981 -- TeX and InDesign's Paragraph Composer): all of a paragraph's breaks chosen at once, so no line is much looser than the rest. Lines past the budget cost more the further past; a lone word mid-paragraph costs most.
- **Micro-typography** (pdfTeX's font expansion, after Zapf's hz program): a line's slack is shared between word spacing (70-200% of a space), letter spacing (−0.02 to +0.06 em; the 8 August body letter-spaces up to about 0.055 em) and a glyph scale of 97-102%. Past the budget the letters keep spreading to 0.08 em, then the word spaces take the rest. A lone word too short for its line is set flush left.
- Each line is one text element (`compose.ts` `columnElements`) with its own `letterSpacing`, `wordSpacing` and `hScale`, `nowrap`, `justify-all`: the browser never reflows it. The plotter's probe reports a fitted line that doesn't print at its width (`line-fit`).

### 8.7 Display type (`layout/display.ts`)
Headlines, kickers and decks never end ragged: the text is broken into a few balanced lines and each line fitted to the exact measure with horizontal scaling (0.86-1.2) plus letter spacing, at the largest size that allows it (the paper itself scales headlines 0.6-1.4×). A lead's headline prefers two big lines to one long one. Baselines sit on a fixed tight pitch (1.12× the size), opened only where two lines' marks would touch.

---

## 9. AI: models, prompts, costs

All AI calls go through **OpenRouter** (an OpenAI-compatible `chat/completions` API) with `response_format: json_schema` (strict). **No Anthropic models:** the user decided they cost too much.

| Use | Model (profile `editorial`) | Where | Notes |
|---|---|---|---|
| Rewrite (workhorse) | `openai/gpt-6-luna` (~$0.0007 per story) | `editorial/rewrite.ts` `rewriteOne` | kicker, headline, deck, body long/medium/short, caption, priority, page |
| Rewrite (the day's 3 biggest Chief Minister stories) | `google/gemini-3.8-flash` (~$0.007) | same | Google is strong in regional languages |
| Length fitting | the workhorse | `fitLength()` | Cached in the SQLite `fitted` table by `storyId|words`, so rebuilds are free |
| Page review (vision) | `google/gemini-3.8-flash` | `editorial/review.ts` | A fixed list of issue types, each with a confidence; report only |

- **Faithfulness:** every prompt says to use only facts in the release. After every rewrite or fit, **every number in the output must appear in the release** (`digits()`). A mismatch is recorded as a `factCheck` and fails gate 6.
- **Duplicate releases:** English duplicates of Gujarati releases are skipped (`rewriteDay`). Duplicate events are removed by word overlap of more than 60% (`stories.ts` `dedupe`).
- **Cost:** a full rewrite of about 23 stories costs about $0.05, a page review about $0.04, and length fitting a few cents, about $0.10 a day in all. `backend/test/compare-models.ts` compares models on real releases.

---

## 10. Release gates ("is the paper perfect?")

Printed at the end of every build and stored in the report (`GET /api/issues/<date>`). The issue is **READY** only if all pass:

1. **Plotter:** no overflow, overlap, off-page, failed font or failed image warnings.
2. **No empty space on the page:** the whitespace map (`occupancy.ts`) finds no column stretch empty for longer than the story gap plus 1.5 body lines, anywhere.
3. **Desk rules:**
   - no tombstoned headlines (same size, side by side, starting level);
   - headline sizes follow importance (no less-important, no-wider story with a bigger headline);
   - no headline over 30% of its story (briefs excepted).
4. **The lead is on page 1;** every story placed, or listed as left out.
5. **The AI page reviewer** reports nothing it is at least 0.8 confident about.
6. **Fact checks:** every number in a rewritten or fitted story is in its release.
7. **Determinism:** the same inputs give an identical issue JSON. Each build records a fingerprint of what it's made from (`fingerprint.ts`: the day's stories, edits, ads and releases, the publication folder, and the engine's code under `backend/src` and `shared/src`); the gate compares only with a previous build of the same fingerprint. After a change to the inputs or the code there's nothing to compare, and the gate says so and passes.

Style gates (`layout/style.ts`), what a reader sees, held to the 8 August paper's standard:
- **S1 body spacing:** extra word space (word + letter spacing) p95 ≤ 0.5 em, and at most 3% of lines past 0.6 em. The loosest lines are listed in the report (`style.looseLines`) for the editor.
- **S2 display fill:** every headline, kicker and deck line fills ≥ 97% of its width.
- **S4 columns:** a story's columns end within one line of each other.
- **S5 enough copy:** fillers cover under 12% of each page's story area; otherwise the day is short of news (add releases, or print fewer pages).
- **S6 digits:** no number left in Latin digits that the paper prints in its own.
- **S7 structure:** every story prints a headline, a smaller sub-heading (deck) and smaller body text: headline ≥ 1.25× the sub-heading, sub-heading ≥ 1.15× the body. A story without a deck gets its release's sub-heading, else one written by the AI (`rewrite.ts` `writeDeck`, cached); the rewrite prompt now always asks for one.

---

## 11. Ingest: where the news comes from

- **PIB, the Press Information Bureau** (`backend/src/ingest/pib.ts`): the central government's releases, issued for the press, plain HTML that answers ordinary requests. Read politely (one page at a time, 1.5 s apart, the user agent `CapitalKranti-news-ingest/1.0`, only the day's releases, each once by its PRID, at most 300 pages a run).
  - **Gujarati:** PIB Ahmedabad, `allRel.aspx?reg=22&lang=13` (its own releases and the national ones it translates during the day).
  - **Hindi:** PIB Delhi, `allRel.aspx?reg=3&lang=2`; **English:** `reg=3&lang=1`.
  - A past day: the list page's own ASP.NET date form posted back.
  - A release: `PressReleaseIframePage.aspx?PRID=n` (ministry, headline, date line, paragraphs, photos, and the PRIDs of its other language versions).
- **Round-ups:** near-identical releases from one office (the PM's congratulations to each medal winner) become one story (`groupSimilar` in `rewrite.ts`).
- **The Hindi top-up** (`editorial/translate.ts`): when the Gujarati copy fills less than the profile's `fillTarget` (110%), the Hindi list (less what PIB also issued in Gujarati, by language links or by the same names and figures, and less greetings) is ranked by the AI for Gujarat's readers, then translated one by one until the pages are full or the day's AI budget (`dailyBudgetUsd`) is spent. Numbers are checked against the Hindi (Devanagari digits, "9 हज़ार", "2 लाख" understood).
- **The state's Information Department** (gujaratinformation.gujarat.gov.in) blocks automated browsers; **don't get around that.** The `/reader` bookmark (one page at a time, read by a person) and `POST /api/releases` still work; `ingest/gujaratInfo.ts` is kept for if access is ever allowed.

---

## 12. Backend API, storage, nightly job

`backend/src/server.ts` uses Node's built-in http module, on port 4000. CORS is open, and Private Network Access headers are sent.

| Method | Path | What |
|---|---|---|
| GET | `/api/issue?date=` | the issue's render JSON (latest version; latest day if no date) |
| GET | `/api/issues/:date` | `{version, status, report}`; the report includes gates, placements, warnings, review and cost |
| GET | `/api/issues/:date/pdf` | the print PDF |
| POST | `/api/issues/:date/build` | rebuild the day (keeps edits) |
| POST | `/api/issues/:date/approve` | mark the latest version approved |
| POST | `/api/issues/:date/edits` | `{storyId, change}`; change is any of `headline, kicker, deck, caption, body, photo, drop:true, swapWith, box`; then rebuilds |
| GET | `/api/stories?date=` | the day's stories |
| POST | `/api/releases` | upload one release (see 11) |
| GET | `/api/pages/:date/:n.png` | page image (150 dpi) |
| GET | `/ingest#<json>` | browser hand-off page for releases |
| GET | `/api/export/:date.svg?page=` | **not built yet** (15.7) |

- **Storage:** `backend/data/capital-kranti.sqlite`, through `node:sqlite`. Tables: `releases`, `stories`, `ads`, `issues` (date, version, status, json, report), `edits`, `fitted`.
- **Nightly job:** `everyEvening()` runs `runDay()` at 20:00 Asia/Kolkata: inbox ingest (missing, so it logs and skips), then rewrite, then build. It does nothing useful until 15.2 exists.

---

## 13. Website (frontend)

**Next.js 16** in `web/`. Read `web/AGENTS.md` first: this Next.js version differs from older ones, and its docs are in `node_modules/next/dist/docs/`.

- `/` shows the issue: one scaled iframe per page, a warnings panel and a PDF button.
- **Live mode** (`BACKEND_API_MODE=live`) reads the backend.
- **Restricted fonts:** pages are the backend's PNGs, and the PDF is the backend's PDF.
- **Mock mode** uses MSW (`web/src/mocks/`) to serve the 8 August replica (`issue-2026-08-08.json`) or `MOCK_FIXTURE=stress`. The stress fixture deliberately plants 24 problems, and the warnings panel must report all of them.
- **Gotcha:** after editing `web/src/mocks/*` or shared code, **restart `next dev`**. Hot reload can break MSW (the symptom is `fetch failed … ENOTFOUND mock-backend.local`).

---

## 14. Tools, tests and the 8 August replica

`(196) Capital Kranti_08 august.pdf` is **the only reference issue that exists**. Everything was measured from it.

- **The replica:** `python3 scripts/mock_backend/from_source.py` rebuilds that issue as contract JSON, one element per printed line at its printed baseline. It uses Chromium print feedback (`calibrate_ink`) to put the ink where it printed.
  - `--gopika` sets it in the real Gopika fonts and writes `out/replica/issue-2026-08-08-gopika.json`;
  - print it with `node --experimental-strip-types --no-warnings scripts/mock_backend/print-issue.mts <json> <pdf>`;
  - then check it:
    ```bash
    python3 scripts/replica/line_diff.py --pdf out/replica/issue-gopika.pdf --issue out/replica/issue-2026-08-08-gopika.json
    python3 scripts/replica/compare.py   --pdf out/replica/issue-gopika.pdf --issue out/replica/issue-2026-08-08-gopika.json
    ```
  - **Last result:** 1,206 of 1,208 lines within tolerance, baselines within 0.37 pt, median edge error 0 pt; blank area matches the original within 0.7–2.5 points per page.
- **Chrome and ad assets:** `python3 scripts/mock_backend/chrome_assets.py`.
- **Encoder:**
  ```bash
  python3 scripts/replica/bharati_learn.py
  node --experimental-strip-types --no-warnings backend/test/bharati-roundtrip.ts <spans.json> <text.json> <out.json>
  python3 scripts/replica/bharati_check.py <out.json>
  ```
  (See the scripts for how the inputs are made.)
- **Model comparison:** `node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/compare-models.ts <date> <ids...>`
- **Layout test without the licensed fonts:** `backend/test/pack-0808.ts` runs the 8 August stories through the whole engine (packer, gap closer, printer, every gate) in the free fonts of `publications/dev-test` (written by `python3 scripts/dev_profile.py` from the real profile: re-run it after changing the profile). Each story's text stands in as its release and `CK_FAKE_AI=1` stands in for the model (`rewrite.ts` `fakeFit`), so length fitting, briefs and sub-headings run with no network. It exits non-zero if any gate fails. Two pages by default; on three the fixture's copy runs short, which gate 2 reports:
  ```bash
  CK_PUBLICATION=dev-test DATA_DIR=/tmp/ck-test \
    node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/pack-0808.ts   # TEST_PAGES=2 by default
  ```
  Page images land in `$DATA_DIR/out/pages/dev-test/2026-08-08/`. `backend/test/gaps.mts <date>` lists a build's empty stretches.
- **Typography by numbers:** `python3 scripts/replica/style_stats.py <issue.pdf>` prints word gaps, letter spacing, display-line fill, headline sizes and body lines per page, read back from any PDF. The 8 August reference: word gap p50 4.5 / p90 6.7pt, letter spacing up to 0.72pt, display lines 96-100% full, 273-390 body lines a page.
- **Stale:** `backend/test/recompose-0808.ts` uses the old box composer and the rough 8 August ad regions, so it reports ad overlaps. Superseded by `pack-0808.ts`; remove it (15.9).

---

## 15. Remaining work

1. **Install on the father's Windows PC** with the user: `windows\Install Capital Kranti.cmd` (after this branch is merged: the installer clones `main`), paste the OpenRouter key in Settings, set the run time, and watch one 8 PM run.
2. **The other five papers** (1 Urdu, 1 Hindi, 3 Gujarati): each through the Papers screen with its PDFs, fonts and masthead art. Then a paper switcher in the newsroom and every paper in the 8 PM run (today each extra paper is built by "Make a test issue" in its own process and data folder, `papers/<id>/`).
3. **Urdu polish** once the paper's Nastaliq font is known: line spacing, display fitting and the overlap tolerance for tall Nastaliq letters (`sample-urdu` shows where).
4. **Print specs** from the printer: bleed, crop marks, CMYK/PDF-X (the preflight gate has the hook).
5. **Needed from the user:** BBharatiMaruti (condensed headlines), confirmation that the Bharati licence covers this PC, the printer's specs, the other papers' PDFs and fonts.
6. **English hyphenation**, only if an English paper is ever added (none of the six is English).

## 16. Known issues and gotchas

- **Restart rules:** `next dev` must be restarted after mock or shared changes (MSW); the backend server must be restarted after backend code changes (no hot reload).
- **Playwright** is pinned at 1.62.1. Newer versions want a different Chromium build.
- **The OpenRouter key** is in `backend/.env`. The account had a $5 limit when it was set up; check it at `https://openrouter.ai/api/v1/key`.
- **`gate 7`** compares only builds with the same fingerprint (same inputs, same engine code), so a code or input change doesn't fail it.
- **The 8 August stand-in ads** are used whenever a day has no `ads` rows (`referenceAds`). There is no ad-booking UI yet.
- **A release with a Punjabi letter** ("ਲિમિટેડના", release 55037) can't be set in Gopika. It's logged, not fixed: it's a typo in the source.
- **Fonts with `restricted: true`** are never served publicly. Don't move them to `web/public`.
- **`web/public/replica`, `web/public/chrome` and the reference PDFs** are the paper's own printed content (photos and ads from 8 August), committed for testing.

## 17. Decisions already made (don't re-litigate)

- **The backend decides all layout;** the frontend is a pure plotter of positioned elements (the render contract).
- **Every length is in px at 300 dpi.** Chrome (masthead, headers, footer) comes as elements from the backend.
- **The layout is measured, not predicted by an AI.** The AI judges and writes; the code measures. Training a small model to place things was considered and rejected: placement is computable, and there is no training data.
- **Content-sized stories**, not fixed slots copied from 8 August; that was the cause of the unpolished look.
- **No Anthropic models** (cost). Use GPT-6 Luna as the workhorse and Gemini 3.8 Flash for leads and vision.
- **Don't circumvent the government site's bot block.** Use the email inbox or manual upload.
- **Issue numbering:** every day counts, from No. 196 on 2026-08-08, so 2026-10-21 is issue 270.
- **The real fonts are used** (Bharati Gopika, legacy encoding via the encoder), not Unicode look-alikes.
- **One profile per paper;** no paper-specific constants in engine code.

## 18. Glossary

- **Chrome:** the masthead, running headers, folio (page number) and footer.
- **Kicker:** a small line above the headline. **Deck:** the line under it.
- **Module:** one story laid out at a given column span, at its natural height.
- **Pitch:** the distance from one baseline to the next.
- **Tombstoning:** two headlines side by side at the same height, which read as one line.
- **Widow:** a headline's last line holding a single short word.
- **Legacy encoding:** a pre-Unicode font where codes are glyph shapes (Bharati Gopika).
- **Contract px:** 1/300 inch, the unit of every length in the render JSON.
