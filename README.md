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

**Last verified build:** 21 October 2026 (issue 270), 4 pages, 22 stories. **Every release gate passes** and the issue is marked READY.

| Area | State |
|---|---|
| Render contract and plotter (JSON → website and PDF) | Done |
| Exact baseline placement (measured Chromium rule) | Done |
| Publication profile (all paper settings as data) | Done (Capital Kranti) |
| Bharati Gopika encoder (Unicode → legacy glyph codes) | Done; round-trips 100% of the 8 August text and all of a day's news |
| Content-sized story modules | Done (`backend/src/layout/module.ts`) |
| Page packer (skyline + beam search) | Done (`backend/src/layout/pack.ts`) |
| Gap closing (AI length fit, trims, briefs, house ad) | Done (`backend/src/layout/fit.ts`) |
| Release gates, including the AI page reviewer | Done (`backend/src/build.ts`, `editorial/review.ts`) |
| AI rewriting (OpenRouter: GPT-6 Luna and Gemini 3.8 Flash) | Done (`editorial/rewrite.ts`) |
| Backend API, SQLite storage, 8 PM nightly job | Done, but the nightly job has no automatic news source yet (see 11) |
| Website showing the live issue, with PDF download | Done |
| AI editorial plan (which story leads, page assignment) | **To do** (15.1) |
| Email-inbox ingest (the automatic news source) | **To do** (15.2) |
| Editor screen (edit, approve) | **To do** (15.3); the API already exists |
| Second paper / "Add a newspaper" screen / Urdu | **To do** (15.4–15.6) |
| CorelDRAW (SVG) export and print preflight | **To do** (15.7–15.8) |
| Clean-up: type errors, dead code, docs, tests | **To do** (15.9) |

---

## 2. Quick start

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
  src/cli.ts                ingest | rewrite | build | all | serve
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
  src/app/page.tsx          issue viewer (one scaled iframe per page)
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
  - `text`: `x, y, width, height, text` (a string or runs `[{text, font?, size?, color?}]`), `font, size, lineHeight, color, align` (`left|center|right|justify|justify-all`), and optionally `hScale, letterSpacing, indent, vAlign, plainText`.
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
- **Plotter warnings** (in-page PROBE): `text-overflow`, `overlap` (ink box per word), `off-page`, `image-failed`, `font-failed`, `empty-text`.

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
- `breakLines()` breaks lines with canvas `measureText`, which uses the same shaping (HarfBuzz) that Chromium uses on the page. It checks against a 0.995 width safety margin (0.98 for display lines).
- `ink()` returns ink extents and font metrics; `widths()` and `imageSize()` are also here.

### 8.2 Story module (`layout/module.ts`), a story at its natural size
For a story with a given **rank** (1 = lead … 5 = brief), **column span k**, **variant** (`long|medium|short`) and **photo mode** (0 = beside the text, 1 = across the whole story, 2 = two photos side by side):
- **Headline:**
  - size = `capByColumns[k] × rankScale[rank]`. It only ever steps *down*: to stay within `maxLines(rank)`, to avoid a lone last word (a widow), or when a single word is wider than the column;
  - lines are stacked by measured ink, so descenders always clear the next line (`compose.ts` `stackLines`).
- **Kicker and deck:** sized from the headline size by their profile ratios.
- **Photo:**
  - natural aspect ratio, nothing cropped in mode 0;
  - must meet the photo rules (minimum height, ppi, share of the story);
  - must not be taller than the text beside it, which would leave a hole;
  - modes 1 and 2 need landscape photos (width/height ≥ 1.25).
- **Body:** 13 pt on 15.6 pt (or a pitch within 2% from the gap closer), balanced so every column ends on the same line (`balance()`), justified, with first-line indent.
- **Result:** exact `width`, `height` and `elements`, positioned at (0, 0); `place()` moves them onto the page.

### 8.3 Page packing (`layout/pack.ts`)
- **Fixed blocks:** chrome and ads. Each column's "free y" skips over ads (`settle`).
- **Skyline:** take the lowest, leftmost open stretch of columns and try candidate stories × spans (`spansFor(rank)`) × photo modes × variants. Keep the longest variant that fits under the next obstacle.
- **The lead:** the first story placed on each page is that page's lead (rank 1).
- **Beam search:** keep the 12 best partial pages at each step. A state's score combines:
  - white space already stranded, plus white space projected once the copy still allowed on the page fills the open area;
  - minus the value of what's placed: importance × length, less penalties for a dropped photo, a related story on the same page (−1.5), a headline over 30% of its story (−4), and tombstoned headlines (−1.2).
- **Page budgets** (`build.ts`): the day's copy at natural size, divided between pages in proportion to their free room. That stops page 1 from taking everything. Spare room goes to bigger photo layouts.
- **Rules between stacked stories:** an 8 pt gap and a 0.75 pt rule (`renderPlaced`).

### 8.4 Gap closing (`layout/fit.ts`)
- For each placed story, `room()` measures the space down to the next element below in its columns: a story, an ad, a house ad, or the foot of the band.
- If more than one line is free, it tries, in order:
  1. the next longer variant;
  2. **AI `fitLength`** to the word count the gap needs (words per line measured from the story itself). Up to 3 rounds; if the AI overshoots, it asks again for fewer words;
  3. **sentence trim** of the shortest version that overshot: drop whole sentences from the end until it fits exactly. News puts the most important facts first, so the end is what goes;
  4. pitch +≤2%, once.
- Still more than 4 lines free: place a left-out story as a 60- or 40-word AI brief, or else the **house ad** (a ruled panel, sized to fit).
- What remains is reported as `white-space` (gate 2).

### 8.5 Chrome (`chrome/chrome.ts`)
The art is the 8 August masthead and headers with the date, issue number and page number **removed** (PyMuPDF redaction, text only). Today's values are set in Gopika Bold at the printed size, on the printed baseline. Page 1 gets the masthead, inner pages the inner header, and the last page the last-page header plus the legal footer.

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
2. **Every column ends within one body line** of what's below it.
3. **Desk rules:**
   - no tombstoned headlines (same size, side by side, starting level);
   - headline sizes follow importance (no less-important, no-wider story with a bigger headline);
   - no headline over 30% of its story (briefs excepted).
4. **The lead is on page 1;** every story placed, or listed as left out.
5. **The AI page reviewer** reports nothing it is at least 0.8 confident about.
6. **Fact checks:** every number in a rewritten or fitted story is in its release.
7. **Determinism:** the same inputs give an identical issue JSON. The gate compares with the previous version, so it legitimately "fails" once after a code or input change.

---

## 11. Ingest: where the news comes from

- **Source:** the Gujarat government's Information Department, **gujaratinformation.gujarat.gov.in**, which publishes press releases in Gujarati, free to use. Releases are at `/PressReleaseDetails/?id=<n>&LanguageId=2`; ids are sequential across departments and districts. On a release page:
  - headline: `.ttm-service-single-content-area .title h4`
  - subheading: `h5.subtitle`
  - date and office: `.ReleaseDateSubHeaddateTime` ("OCT 21 2026 6:00 PM BY …")
  - body: `.ttm-service-description p`
  - photos: `.ttm-service-description img` (served by `ViewFile?fileName=…`)
- **Problem: the site blocks automated (headless) browsers.** The home page returns "The URL you requested has been blocked", and PIB is unreachable from the server too. **Do not try to get around this block** (no disguised user agents or the like). That was decided, and it's the right call.
- **For the 21 October test issue,** the releases were read by hand in a normal browser tab and passed to the backend through `GET /ingest#<json>` (a hand-off page in `server.ts`). The release page's Content Security Policy blocks direct calls to a local server, so the hand-off uses a page navigation instead.
- **The chosen automatic source is the paper's email inbox** (district information offices email releases and photos to newspapers every day). Building it is 15.2.
- `backend/src/ingest/gujaratInfo.ts` (Playwright) is kept for when access is allowed, for example if the department allow-lists the server.
- **Manual upload works today:** `POST /api/releases` with `{id, url, dateLine|date, office?, headline, subhead?, paras[], photos?[{name, base64}]}`.

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
- **Stale:** `backend/test/recompose-0808.ts` uses the old box composer and the rough 8 August ad regions, so it reports ad overlaps. Replace it (15.9).

---

## 15. Remaining work, in detail (do these in order)

Each item says what to build, where, and how to know it's done. **After every step, build 2026-10-21 (and 8 August, once 15.9's test exists) and read every page image at full size.** Gates passing is necessary but not sufficient.

### 15.1 AI editorial plan (`backend/src/editorial/plan.ts`)
- **Why:** story order and rank now come from simple rules (`priority` from the rewrite, plus `rankOf()` in `pack.ts`). An editor would choose the lead and the page for each story by news value.
- **What:** one Gemini 3.8 Flash call per day.
  - **Input:** for each story, its id, headline, a 40-word summary, its word counts per variant, whether it has a photo (and whether it's landscape), and how many photos; plus the ads per page, the page count and sections. Sections are not in the profile yet: add `sections: [{page, name, wants: [...] }]`, e.g. page 1 front, 2–3 state and districts, 4 business and misc.
  - **Output** (strict JSON schema, validated with Zod): `[{storyId, page, rank 1..5, sizeClass lead|major|standard|brief, usePhoto, kicker?}]`, plus `leadId`.
- **Engine:** in `build.ts`, order each page's pool by the plan, and add an optional `rankOverride` to `packPage`, so `rankOf()` uses the plan's rank. If a story can't fit as planned, move it down a rank, try the next page, and log the reason in the report (`planDeviations`).
- **Cache** in SQLite by date plus a hash of the story ids.
- **Done when:** the plan validates, gates 1–7 still pass on 21 October, and the report lists the plan and any deviations.

### 15.2 Email-inbox ingest (`backend/src/ingest/inbox.ts`), the deployable source
- **What:** IMAP over TLS, with the `imapflow` and `mailparser` npm packages. Credentials go in `backend/.env` (`INBOX_HOST, INBOX_PORT, INBOX_USER, INBOX_PASSWORD, INBOX_FOLDER`), filled in by the user. Never ask for or print them.
- Read the day's unseen mail from the information-office senders (an allow-list in the profile: `editorial.sources.inbox.from[]`).
- Each mail becomes a release:
  - subject → headline;
  - first bold line or second line → subhead;
  - body paragraphs → body;
  - JPG and PNG attachments → photos, saved under `web/public/media/<date>/`;
  - `.docx` attachments → text (with `mammoth`);
  - PDF attachments → text (with `pdf-parse`).
- **Legacy-font text:** some offices send Word files typed in legacy Gujarati fonts. Detect them with `is_legacy` rules, port `bharati_decode` to TypeScript, and convert to Unicode.
- **De-duplicate** by Message-ID and by headline similarity; mark mails seen.
- **`runDay()` already calls `ingestInbox(store, date, {log})`**, so implement exactly that signature, returning `{fetched}`.
- **Done when:** a test inbox with 3 sample releases produces 3 releases with photos, and `cli.ts all` builds a READY issue.

### 15.3 Editor screen (`web/src/app/edit/`)
- **Shows:** the page images; the gate table and reviewer findings (from `GET /api/issues/:date`); a list of the stories on each page with headline, rank, span, variant and source link.
- **Lets the editor:**
  - edit the headline, kicker, deck, body or caption;
  - change the photo;
  - set a rank (add `rank` to edits and honour it in `pack.ts`);
  - drop a story;
  - swap two stories;
  - press **Approve**.

  Every change goes to `POST /api/issues/:date/edits`, which rebuilds; then the images refresh.
- **Implement edit handling in the new engine.** Text edits already work through `applyTextEdits()`. `drop` works. `swapWith` and `box` were implemented in the retired planner only, so re-implement: swap ranks and order in the pool, and replace `box` with a `rank` or `cols` hint.
- **Auth:** at least a shared editor password from env, with the API checking a bearer token (`BACKEND_API_TOKEN` already exists in `web/.env.local`).
- **Done when:** editing a headline, rebuilding, approving and downloading the PDF all work in the browser.

### 15.4 Second paper, written by hand (`publications/sample-english/`)
- **Profile:** an English broadsheet, e.g. 6 columns, 12 pt Liberation Serif body, Tinos Bold headlines, a typographic masthead drawn as text and rect elements (make `chrome.json` able to express a typographic masthead without art), and its own colours.
- **Engine needs:**
  - `lang` (and `direction`) on text elements, in the contract and the plotter;
  - hyphenation for English: `hyphens: auto` plus `lang` in the plotter, and the same hyphenation in the measurer (e.g. the `hyphen` npm package with en-US patterns, inserting soft hyphens before measuring so both agree);
  - `inPaperLanguage` already handles `en`.
- **Content:** English releases. PIB English releases can be uploaded through `POST /api/releases`.
- **Done when:** `CK_PUBLICATION=sample-english cli.ts build` passes gates 1–4, 6 and 7 with **no engine code changes** beyond the generic features above.

### 15.5 "Add a newspaper" screen (`web/src/app/publications/new/` and `backend/src/onboard/extract.ts`)
1. **Upload:** 1–3 recent issue PDFs (exported from the layout software, not scans), font files and masthead art.
2. **Extract**, generalising `from_source.py`, `chrome_assets.py` and `extract_source.py`:
   - page size;
   - column grid, from histograms of text column left and right edges;
   - fonts by role: the most-used small face is body; the largest bold at the top of a text block is headline; and so on;
   - type ladder: headline size against column span, body size and pitch (the median baseline delta);
   - spacing: median gaps between headline, deck, body, photo, caption and the next story;
   - colours, rules and boxes;
   - chrome: the top and bottom bands repeated on every page. Parts that change between issues or pages become fields (dates, numbers, page numbers, found by regex or by comparing issues); parts that don't become art (redact the fields, then render);
   - photo habits;
   - language and direction.
3. **Review screen:** the extracted profile drawn over a sample page, with editable fields.
4. **Test build** from that day's news, plus a self-check: re-set one uploaded issue's own text and run `line_diff` and `compare`.
5. **Save** as `publications/<id>/`, and add it to the nightly job, which needs to loop over all publications. Make `PROFILE` a parameter instead of a module-level constant: `backend/src/profile.ts` currently loads one profile per process.
- **Legacy fonts can't be decoded automatically:** ask for Unicode fonts, or a mapping table.
- **Acceptance:** feeding in the 8 August PDF reproduces Capital Kranti's profile (grid, type ladder, spacing within 0.5 pt, the chrome fields).

### 15.6 Urdu (after a Nastaliq font is chosen, e.g. Noto Nastaliq Urdu)
- `direction: "rtl"` throughout:
  - the plotter sets `dir`;
  - the measurer shapes Arabic script (canvas handles it), with `direction="rtl"` on the context;
  - `module.ts` puts photos on the left and runs columns right to left;
  - `pack.ts` mirrors: the skyline fills from the right, so `colX` is mirrored;
  - justification uses kashida if needed (check what Chromium supports).
- Nastaliq's very tall ascenders and descenders are handled by the baseline rule from the font's own metrics. Check that the `overlap` probe still behaves.

### 15.7 CorelDRAW export (`backend/src/export/svg.ts`)
- `server.ts` already routes `/api/export/:date.svg?page=n` to `pageSvg(issue, page)`; implement it.
- One SVG per page:
  - `<text>` elements per line, `x` at the line start, `y` at the baseline (from `topFor`'s inverse);
  - font-family names matching the installed fonts;
  - for legacy fonts, keep the glyph-code text, since that's what CorelDRAW expects with Bharati fonts installed;
  - images linked or embedded; rects, lines and paths as is.
- Justified lines: emit per-word `x` positions so the spacing matches.
- Also a zip export of all pages plus the fonts list. Fonts aren't included, because of the licence: CorelDRAW users have them installed.

### 15.8 Print preflight
After the build:
- trim size equals the profile;
- every font embedded (check with PyMuPDF from a script, or pdf-lib in Node);
- no image under 200 ppi at its placed size;
- nothing outside the trim box;
- optionally bleed and crop marks, and CMYK or PDF/X, once the printer's specs are known (ask the user; Ghostscript isn't installed, so ask before installing anything).

Add this as gate 8.

### 15.9 Clean-up
- **Type errors:**
  - `ingest/gujaratInfo.ts` NodeList iteration (`Array.from`);
  - `server.ts` (`runDay` returns an issue, but the scheduler type expects void; `export/svg.ts` missing);
  - `build.ts` (the dynamic `./ingest/inbox.ts` import).
- **Dead code:** the box-filling parts of `compose.ts` (`compose()` and its candidate loop), once nothing imports them; the old `planner` references in comments.
- **Tests:** replace `backend/test/recompose-0808.ts` with `backend/test/pack-0808.ts`, which feeds the 8 August stories (from `archive/.../article-level-issue-2026-08-08.json`, with its `mend()` paragraph repair) through `Packer` and `closeGaps` using the cut ads from `chrome.json`, and asserts gates 1–4. Add a `npm test` script that runs it, the encoder round trip and the stress fixture.
- **Docs:** update `docs/RENDER_CONTRACT.md` (`plainText`, `restricted`, `path`, `lang`, `direction`, the baseline rule), `docs/FRONTEND_ROADMAP.md`, and this README.
- **`scripts/replica/extract_source.py`:** its `main()` still writes to an archived path; fix it or remove it.

---

## 16. Known issues and gotchas

- **Restart rules:** `next dev` must be restarted after mock or shared changes (MSW); the backend server must be restarted after backend code changes (no hot reload).
- **Playwright** is pinned at 1.62.1. Newer versions want a different Chromium build.
- **The OpenRouter key** is in `backend/.env`. The account had a $5 limit when it was set up; check it at `https://openrouter.ai/api/v1/key`.
- **`gate 7`** compares against the previous stored version, so it fails once after any code or input change. Rebuild to confirm.
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
