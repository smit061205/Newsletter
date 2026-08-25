# Capital Kranti — Pixel-Precision Production Pipeline

**Purpose of this document.** Everything below is a full record of the technology, exact parameters, and measurement techniques used to replicate the Capital Kranti masthead/header with zero visual anomalies — plus the phased roadmap for extending the same rigor to the rest of the newspaper (articles, photos, ads, all 4 pages, daily automation). Written so a future session (human or AI) can pick this up with no lost context.

**Governing principle, established over the header work and binding for everything that follows:** never eyeball a position, color, size, or spacing. Every parameter in this document was extracted from the source PDF with a tool, or back-solved by rendering a candidate and re-measuring it against the source with the same tool. Where a discrepancy was found, it was found by diffing two measured datasets — never by "it looks a little off."

---

## Part A — Technology Stack

| Layer | Tool | Why it's here | Why alternatives were rejected |
|---|---|---|---|
| PDF extraction (text) | **PyMuPDF** (`fitz`), `page.get_text("dict")` | Gives `bbox`, and critically `origin` (the exact baseline anchor point PDF text rendering actually uses), `font`, `size`, `color` per span. This is the ground truth for every position/size claim in this project. | — |
| PDF extraction (vector shapes) | **PyMuPDF**, `page.get_drawings()` | Gives every fill, stroke color, stroke width, dash pattern, and literal path (`re`/`l`/`c`/`qu`) op for every drawn shape — this is how the diamonds, cyan border lines, and navy box fills were found; a visual/screenshot read misses shapes like this. | — |
| PDF extraction (fonts) | **PyMuPDF**, `page.get_fonts()` | Confirms exactly which embedded font program backs each span (e.g. `BBharatiGopikaTwo,Bold`), including whether it's actually embedded vs. a system fallback. | — |
| Static content transfer | **PyMuPDF**, `page.show_pdf_page(rect, src_doc, pno, clip=...)` | Copies real vector content — actual glyph outlines from the actual embedded font program, actual path data — from one PDF's content stream directly into another. This is *not* re-rendering or re-typesetting; the masthead, wordmark, tagline, contact bar, RNI line, and subtitles are copied byte-faithful, forever, because they never change issue to issue. | Re-drawing them with a substitute font would introduce exactly the kind of drift this whole project exists to eliminate. |
| Dynamic text generation | **WeasyPrint** (Python, HTML/CSS → PDF, backed by Pango/HarfBuzz) | The one text engine in this stack proven to shape Gujarati correctly — including the anusvara-after-matra sequence that both other engines get wrong. Used for anything that must change per issue (currently: the edition bar — date/issue no./day/staff line). | **PyMuPDF's own `insert_text()`**: confirmed, reproducible bug — drops the anusvara (ં, U+0A82) when it immediately follows a consonant that already carries a preceding vowel matra. Reproduced across two different fonts (Noto Sans Gujarati, Hind Vadodara) — an engine bug, not a font bug. **pdf-lib + `@pdf-lib/fontkit`** (Node): crashes outright on Noto Sans Gujarati (`TypeError: Cannot read properties of null (reading 'xCoordinate')` in `GPOSProcessor.getAnchor`, a mark-positioning/GPOS bug) and silently mis-shapes conjuncts/matras on Hind Vadodara. Proven unusable for Gujarati by direct side-by-side test before being abandoned as the text engine. |
| PDF compositing | **PyMuPDF** | The WeasyPrint-generated dynamic snippet PDF is composited onto the target page with the same `show_pdf_page()` used for the static masthead — one consistent placement mechanism for both static and dynamic content. | — |
| Font-size calibration | **Playwright + Chromium**, headless width measurement | Chromium's own layout engine measures the actual rendered width of an exact text string in the substitute font at a large reference size (100pt); `calibrated_size = (original_width_pt / measured_width_at_ref) × ref_size`. This is how every substitute-font size in this project was derived — never guessed. | A guessed point size is the single biggest source of "looks almost right but not quite" drift; this technique was adopted specifically because an early hand-guessed wordmark size (68pt) was off from the calibrated value (148.76pt) by more than 2×. |
| Precision/placement testing | **Playwright + Chromium** | Used early to establish that browser-rendered placement has a ~0.375pt drift floor (Blink's internal device-pixel layout snapping) — this bounded how much to trust a browser-only pipeline, and was one input into moving the *final* production path to direct PDF writing instead. | — |
| Direct PDF writing (evaluated, not the current text path) | **pdf-lib** (Node) | Proven via direct test to place geometry with ≤0.0001pt drift — i.e. pdf-lib itself is not the problem; its `fontkit` dependency's Gujarati shaping is. Still relevant for any future non-text vector work in Node. | — |
| Live/interactive preview | **Next.js 16 + React + TypeScript**, `web/` | A pixel-mapped on-screen preview of the grid/frame system for fast iteration and visual QA during layout decisions, independent of the PDF production path. | Not the source of truth for the final PDF — see the open architecture question in Part F. |
| Rendering for visual QA | `pdftoppm` (poppler) | Fast, dependency-light way to rasterize a candidate PDF to PNG for a direct visual diff against the source at a matched DPI, after the numeric checks pass. | — |
| Font substitutes (Google Fonts) | **Baloo Bhai 2** (display/masthead), **Hind Vadodara** (body/headlines), **Mukta Vaani** (secondary headline face) | Real Unicode Gujarati faces that play the same typographic *role* as each legacy Bharati font — see the font-role mapping table in Part C. | The originals are pre-Unicode, WinAnsi-encoded glyph-substitution fonts; their codepoints don't correspond to standard Unicode Gujarati at all, so they can't be used for any text that must be authored/edited as real Gujarati (i.e. anything dynamic). |

---

## Part B — Core Techniques (the methodology itself)

These are the reusable *moves*, independent of any specific header element — this is what "do the systematic check" cashes out to procedurally, and what every future zone (article, ad, photo) needs run against it.

1. **Extract, don't eyeball, every span's `origin`.** `origin` is the actual baseline anchor PDF renderers use — not the bbox top-left, not a flexbox-centered guess. Any position claim not backed by a read `origin`/`bbox` value is provisional.
2. **Full `get_drawings()` audit before declaring shape/color work done.** A visual pass reliably misses thin elements (this project: two 2.04pt cyan border lines on the edition bar, missed by every earlier "looks right" pass and only found by dumping every drawing op).
3. **Static vs. dynamic classification, per element, before building it.** If it's issue-invariant (masthead, contact info, RNI number, ad frames that don't move): vector-copy via `show_pdf_page()`, verbatim, forever. If it changes daily (date, issue number, headlines, story text, photos): must be regenerated — and only WeasyPrint has been proven correct for the Gujarati case.
4. **Calibrate every substitute-font size by measurement, never by inherited assumption.** Even a value that was "already set" earlier in the project turned out to be an unmeasured placeholder (the edition-bar body text was sitting at a guessed 12.5pt the whole time; measuring it against the original's per-segment widths found a 5% systematic overshoot and the real calibrated value, 11.9pt). **Treat every existing font-size constant in this codebase that doesn't cite a measurement in a comment as suspect until it's been calibrated.**
5. **When a generated PDF doesn't match, extract the generated PDF's own spans with the identical extraction code used on the source, and diff the two span lists directly** — position-for-position, width-for-width, gap-for-gap. This is what surfaced every real defect in the edition bar (missing leading bullet, wrong bullet width, doubled gaps, wrong font size) — none of them were visible enough to catch by looking at a render side-by-side; all four were only found by diffing numbers.
6. **Distrust `get_text()`'s `text` string for complex scripts; trust its `bbox`/`origin` geometry.** PyMuPDF's extracted "text" for Gujarati spans can come out with visibly wrong character order (a known complex-script glyph-ordering artifact in text extraction, not a rendering bug) — confirmed by rendering the same PDF to a PNG and reading it visually, which showed correct Gujarati, while `get_text()`'s string for the identical span was garbled. **Geometry (`x0`,`x1`,`origin`) from `get_text("dict")` remains reliable even when the string field is not** — never conclude a render is broken from the string field alone; render to PNG and look.
7. **Isolate suspected tool bugs in a minimal standalone reproduction before working around them.** The WeasyPrint flex-margin-doubling bug (margins on `<span>` children of a `display:flex` container render at exactly 2× their CSS value) was confirmed with a 10-line isolated test *before* trusting that the fix (halve the CSS margin) was correct and not just a coincidental patch.
8. **Re-measure after every fix, don't assume a fix landed.** Each of the four edition-bar fixes above was verified by re-running the exact same extraction script against the newly-rebuilt output, not by inspection of the diff/code change.

---

## Part C — Exact Parameters (canonical reference)

### C.1 Page geometry (blank master, `(172) PDF.pdf`)

```
PAGE   width  = 1119.7 pt    height = 1584.55 pt      (4 pages)
LIVE_AREA  x0=15.51  y0=12.064  x1=1104.182  y1=1575.412
GRID   8 columns, pitch = 136.084pt, origin x = 15.51pt
       gutter = 11.884pt, single-column text width = 124.2pt
       column boundaries (9 points, 8 columns):
       15.51, 151.594, 287.678, 423.762, 559.846, 695.93, 832.014, 968.098, 1104.182
LEADING_RATIO = 1.2   (leading_pt = fontSizePt × 1.2, measured exact across all sizes checked)
```

### C.2 Coordinate reconciliation transform (issue-space → canonical/blank-master space)

The reference issue PDF and the blank master PDF are not pixel-identical in their own internal grids (off by a small scale + offset). This transform, established early and reused everywhere, reconciles any point measured in the *issue* PDF onto the *blank master's* coordinate system:

```python
ISSUE_ORIGIN, ISSUE_PITCH = 14.2076, 136.1467      # issue PDF's own grid origin/pitch
CANON_ORIGIN, CANON_PITCH = 15.51, 136.084         # blank master's grid origin/pitch
SCALE = CANON_PITCH / ISSUE_PITCH                   # ≈ 0.99954
Y_OFFSET_P1 = -3.166                                # page-1-specific vertical correction

def tx(x): return CANON_ORIGIN + (x - ISSUE_ORIGIN) * SCALE
def ty(y): return y + Y_OFFSET_P1
```

**Open item:** `Y_OFFSET_P1` was derived/verified for page 1 only. Pages 2–4 need their own vertical-offset check before any content is placed on them (see Roadmap Phase 1).

### C.3 Header region — box geometry (canonical pt, all already reconciled)

| Element | x0 | y0 | x1 | y1 |
|---|---|---|---|---|
| navy_box_tagline | 16.152 | 12.064 | 220.648 | 39.404 |
| navy_box_contact | 246.546 | 12.064 | 911.979 | 39.404 |
| navy_box_rni | 940.676 | 12.064 | 1091.896 | 39.404 |
| edition_bar_bg (cream field) | 17.002 | 243.814 | 1092.746 | 266.054 |
| edition_tab_left (cyan) | 15.902 | 243.664 | 27.737 | 267.054 |
| edition_tab_right (cyan) | 1081.071 | 243.664 | 1092.906 | 267.054 |
| tagline_text | 29.786 | 17.624 | 199.877 | 36.624 |
| rni_text | 962.596 | 13.524 | 1083.87 | 34.184 |
| wordmark | 169.521 | 55.834 | 886.081 | 245.834 |
| subtitle_paren_open | 182.116 | 205.744 | 188.773 | 240.094 |
| subtitle_en_bold1 | 188.713 | 210.614 | 483.627 | 232.974 |
| subtitle_en_bold2 (smaller "GANDHINAGAR") | 483.897 | 215.014 | 617.765 | 232.904 |
| subtitle_paren_close | 617.755 | 205.744 | 624.412 | 240.094 |
| subtitle_gu | 690.801 | 205.094 | 880.684 | 236.094 |
| contact_text | starts 305.179, ends 867.84 (single line, x-range only) | | | |

Static masthead vector-copy region (the whole thing, copied verbatim from source via `show_pdf_page`):
`src_clip = fitz.Rect(14.85, 12.064, 1091.09, 246.98)`

### C.4 Colors (exact, extracted via `get_drawings()` / span color fields)

| Name | Value |
|---|---|
| navy_fill | rgb(46,48,146) |
| navy_stroke / wordmark_purple | rgb(127,57,150) |
| edition_bg_cream | rgb(255,253,232) |
| edition_tab_cyan | rgb(0,173,239) |
| edition_border_cyan | rgb(0,174,239) *(note: 1 unit off from tab cyan — both extracted independently and kept exact, not merged)* |
| ink_near_black (body text) | rgb(35,31,32) |
| bullet_gold (edition bar bullets) | rgb(154,104,55) |
| bullet_light (contact bar bullets) | rgb(207,209,210) |
| bullet_light2 | rgb(255,253,227) |

### C.5 Decorative diamonds (rhombi at navy-box gaps)

4 diamonds, each a 4-point polygon, canonical pt:

```
diamond_gap1_a: [207.594,25.794] [221.238,12.154] [234.881,25.804] [221.238,39.454]
diamond_gap1_b: [231.383,25.794] [245.027,12.154] [258.67,25.804]  [245.027,39.454]
diamond_gap2_a / diamond_gap2_b: same pattern, mirrored at the second navy-box gap
```
(Found by extracting raw path data via `get_drawings()` — originally misread visually as "notches cut into the boxes"; they are 4 separate overlaid white diamonds, not cuts.)

### C.6 Edition border lines (missed by every earlier visual pass; found only via full `get_drawings()` audit)

```
edition_border_top:    x0=16.592  x1=1092.616  y=244.074  width=2.04pt  color=rgb(0,174,239)
edition_border_bottom: x0=16.592  x1=1092.616  y=266.754  width=2.04pt  color=rgb(0,174,239)
```

### C.7 Font role mapping (legacy Bharati → Google Font substitute)

| Source font (embedded, pre-Unicode) | Role | Substitute | Weight |
|---|---|---|---|
| BBharatiTitleTwo | masthead / wordmark / running header, large display sizes | Baloo Bhai 2 | 700 |
| BBharatiGopikaTwo | body copy | Hind Vadodara | 400 |
| BBharatiGopikaTwo,Bold | headlines, subheads, kickers, edition bar | Hind Vadodara | 700 |
| BBharatiMaruti | secondary headline face | Mukta Vaani | 700 |
| Helvetica-Bold / Calibri,Bold (stray Latin runs inside Gujarati frames) | — | Arial/Helvetica | 700 |
| Times-Bold / Times-Roman | — | Georgia / Times New Roman | 700 / 400 |
| Wingdings (bullet dingbat 'l') | bullet dots throughout | Unicode "●" rendered in a system sans (Verdana-Bold observed) | — |

### C.8 Edition bar — fully measured dynamic-text parameters (the most recently completed work)

```
Bullet glyph width (target, from source):     8.22pt   (Wingdings 'l' @ size 11)
Gap AFTER a bullet (bullet -> next text):      7.57pt  (constant across 6 of 7 gaps; source measurement)
Gap BEFORE a bullet (prev text -> bullet):    14.60pt  (averaged; source varies 13.06-16.96pt, PageMaker kerning noise)
Number of bullets:                             7       (one LEADING bullet before "વર્ષ" + 6 inter-segment — the leading one was missing from every version before this check)
Body text calibrated size:                    11.9pt   (Hind Vadodara Bold; was an unmeasured 12.5pt placeholder, 5% too wide by weighted-width comparison)
Bullet render size (substitute):              13.6pt   (calibrated: 8.0pt rendered only 4.84pt wide vs 8.22pt target)
Total content block width (source):          905.48pt  (first bullet x0 to last char x1)
Left/right margin in field after fix:      83.43 / 83.44pt  (source: 85.20 / 85.56pt — within ~2pt, centered correctly)
```

**Confirmed WeasyPrint bug (flexbox margins):** a `<span>` that is a direct child of a `display:flex` container renders its own `margin-left`/`margin-right` at **exactly 2×** the CSS value. Isolated and reproduced in a standalone 10-line test (`margin-left:20pt` → measured 40pt gap; `margin-right:10pt` → measured 20pt gap; ratio ≈1.999 both times). **Workaround: halve every margin value used on flex-child spans in any WeasyPrint HTML this project generates.** This is a standing gotcha for every future dynamic-text snippet, not just the edition bar — record it before writing the next one.

### C.9 Files that hold all of the above in machine-readable form

| File | Contents |
|---|---|
| `web/src/lib/header_spec.json` | All header box geometry, colors, diamonds, border lines (C.3–C.6) |
| `web/src/lib/gridSpec.ts` | Page/grid/column geometry (C.1), `Pt`-branded type, `moduleSpan()` helper |
| `web/src/lib/fonts.ts` | Font role mapping (C.7), `resolveFont()` |
| `web/src/lib/frames.ts` | `Frame` type + `getPageFrames()` — reads `template.json` |
| `web/src/lib/template.json` | **First-pass** structural frame inventory, all 4 pages (149 frames total: p1=43, p2=28, p3=25, p4=53) — positions + rough classification only; **not yet run through the C.2–C.8-grade measurement rigor** (see Roadmap Phase 1) |
| `web/src/lib/element_inventory.json`, `calibrated_sizes.json`, `calibrated_final.json` | Per-element font/size/width calibration outputs (header elements only, so far) |
| `scripts/build_header_v2.py` | Current production script: static vector-copy + WeasyPrint dynamic edition bar, fully corrected per this document |
| `scripts/audit_page.py` | Reusable per-page span/drawing/image auditor (canonical-space, per-page `Y_OFFSET`-aware) — run as `python3 scripts/audit_page.py <0-indexed page>`, writes `out/_audit_page{N}.json` |
| `out/_audit_page{0,1,2,3}.json` | Full span/drawing/image dumps for all 4 pages, canonical coordinates (scratch-grade regenerate-on-demand, not hand-curated) |
| `web/scripts/calibrate-fonts-full.mjs` | Phase 3 calibration measurement script — reads `out/_calibration_samples.json`, writes `web/src/lib/calibration_ratios.json` |
| `web/src/lib/calibration_ratios.json` | Per-source-font calibration ratios, full per-sample data, and confidence notes (C.7-adjacent, Phase 3 output) |
| `web/src/lib/fonts.ts` | `resolveFont()` (font-role mapping, C.7) plus `calibrationRatio()` / `calibratedFontSize()` (Phase 3) — the sanctioned way to convert any declared PDF size to a substitute-font size |
| `scripts/layout_lib.py` | Phase 4 (`flow_gujarati_text`, `composite_snippet`) + Phase 5 (`crop_to_aspect`, `place_photo_cropped`, `draw_open_photo_slot`) primitives — the reusable engine, not one-off per-story code |
| `scripts/build_page1_demo.py` | Phase 4+5 proof build: header + `STORY_PRAG` flowed into its real frame group via `layout_lib.py` — `python3 scripts/build_page1_demo.py`, writes `out/page-1-demo.pdf` |
| `web/fonts/HindVadodara-Regular.ttf` | Downloaded this session — was missing (only the Bold weight existed), needed for `BBharatiGopikaTwo` (body copy, weight 400) |
| `web/fonts/BalooBhai2-Bold.ttf`, `web/fonts/MuktaVaani-Bold.ttf` | Downloaded as a Part G follow-up — closes the font-asset gap for `BBharatiTitleTwo`/`BBharatiMaruti`, previously unbuildable |
| `scripts/geometry.py` | Shared, page-generalized coordinate transform (`tx`/`ty`/`canon_rect`) — replaces the page-1-only copy that used to be hardcoded inside `build_header_v2.py` |
| `scripts/running_header.py` | Phase 6: builds the pages 2–4 running-header `mixed` region (vector-copy whole strip + erase/repaint the date sub-region) |
| `scripts/build_running_headers_demo.py` | Proof build for `running_header.py` — writes `out/pages-2-4-running-headers-demo.pdf` |
| `out/_running_header_geometry.json` | Consolidated, single-pass-extracted per-page geometry for the running header (fill color, erase-rect, date span) — the fix for the cross-page-contamination mistake described in Phase 6 |
| `scripts/verify_page.py` | Phase 7 QA harness — `python3 scripts/verify_page.py <built_pdf> --page <1-4>`, checks font size/bounds/leading/photo-aspect per frame against Phase 3 calibration, exits nonzero on any FAIL |
| `scripts/build_page2_demo.py` | Phase 8 proof: real fetched story (`STORY_CBI_BRIBERY`) + running header on page 2 — `python3 scripts/build_page2_demo.py`, writes `out/page-2-demo.pdf` |
| `web/src/lib/content.ts` (`STORY_CBI_BRIBERY`) | The Phase 8 proof story — real, live-fetched 21 Aug 2026 PIB Ahmedabad release, original Gujarati paraphrase, cited |
| `scripts/build_page3_demo.py`, `scripts/build_page4_demo.py` | Story coverage for pages 3–4 (`STORY_NIFT`/`STORY_PM_VISIT`/`STORY_SAMARTH`) — `python3 scripts/build_page{3,4}_demo.py`, writes `out/page-{3,4}-demo.pdf` |
| `scripts/review_manifest.py` | Writes the manifest + page images the review UI reads, as part of `daily_build.py`'s own run |
| `web/src/app/review/page.tsx` | Editorial review UI — `/review` (latest run) or `/review?run=<name>` — reads `web/public/review/` |
| `.claude/launch.json` | Dev-server preview config (`npm run dev --prefix web`, port 3000), added this session to preview the review UI |
| `scripts/daily_build.py` | Phase 9 orchestrator — `python3 scripts/daily_build.py [--include-overflow-test]`; routes to `out/final/` (READY) or `out/staging/` + a `.report.txt` (NEEDS_REVIEW) |
| `layout_lib.MIN_FIT_RATIO` / `flow_gujarati_text`'s auto-shrink loop | Phase 9's content-overflow failure mode, and Phase 10's one concrete, tested instance of constraint-based layout |
| `/tmp/orig_edition_spans.json` | Raw span dump used for the edition-bar systematic check (scratch, not durable — regenerate if needed) |

---

## Part D — Current State

**Done, verified, production-quality:**
- Page 1 header/masthead: static region vector-copied exactly; edition bar fully measured and corrected (all items in C.8).
- **Phase 1 (structural re-inventory), all 4 pages — complete for geometry/color, per the results below.**
- **Phase 2 (static/dynamic classification), all 4 pages — complete, per the results below.**
- **Phase 3 (font calibration), whole paper — complete, per the results below.**
- **Phase 4 (Gujarati layout engine) and Phase 5 (photo pipeline) — core engines complete and proven against real fresh content; some sub-scope (multi-column balancing, hyphenation, caption sub-boxes) still open, per the results below.**
- **Phase 6 (per-page composition) core done for page 1 + pages 2-4's running header; Phase 7 (QA harness) complete and already caught + helped fix a real bug in Phase 4's layout engine — per the results below.**
- **Phase 8: the live-PIB-fetch blocker (flagged open twice) is solved — one real, freshly-fetched story ingested and built end-to-end on page 2, verified 20/20 — per the results below.**
- **Phase 9 (daily orchestration) complete, both failure modes deliberately tested. Phase 10 (template flexibility) resolved: confirmed with the user that no second reference issue exists or ever will, so constraint-based layout (already built and tested via Phase 9's auto-shrink) is adopted as the permanent strategy, not a placeholder awaiting data that isn't coming. This closes out all 10 roadmap phases — see Part G for what that does and does not mean.**
- **Font-role coverage extended**: `BBharatiTitleTwo`/`BBharatiMaruti` font files downloaded and wired in, closing a real gap (2 of 4 Gujarati font roles were previously unbuildable) — see Phase 4's follow-up subsection for the three real bugs this surfaced and fixed.
- **Story coverage extended to pages 3 and 4**: `scripts/build_page3_demo.py` (`STORY_NIFT` + `STORY_PM_VISIT`, the latter's headline in a real `BBharatiMaruti` frame — the first full-story test of that font beyond isolated placeholder text) and `scripts/build_page4_demo.py` (`STORY_SAMARTH`). Both real, previously-sourced-but-unbuilt stories from `content.ts`, not new fabricated content. Verified 27/27 and 16/16 (scoped) respectively.
  - **Real QA-harness bug found and fixed in the process**: a headline_L1 frame sized generously for a multi-line display headline (`p3-20`) geometrically overlaps the body frames sitting below it in that same space; the harness's naive per-frame bbox scan double-counted the body frames' own spans into the headline's check, producing a false `FAIL` (`expected 19.50pt, got 9.68pt`) against content that was actually correct — confirmed by rendering the page and looking before concluding the check itself was wrong. Fixed `spans_in_frame` → `assign_spans_to_frames`: each span is now assigned to the single smallest-area frame that contains it, not every overlapping frame.
  - **A second, unrelated finding while manually checking page 4**: `get_image_info()` reported real image metadata (aspect-mismatched against two photo frames) for sponsor-logo images that are **not actually visible** on the built page — `show_pdf_page(clip=...)` leaves embedded-image XObject references enumerable even when the clip hides them from rendering. Confirmed via a visual render (blank where the logos would be) before concluding it was a tool quirk, not a defect. Added `verify_page.py --frames` so a check can be scoped to what a build actually touched, avoiding this class of false positive going forward.
- **Built the editorial review UI** (Part F item 1, now resolved): `web/src/app/review/`, reading a manifest + rendered page images that `scripts/review_manifest.py` writes as part of `daily_build.py`'s own run — not a live PDF renderer in the browser. Shows run status, per-page QA results, and the build log (overflow/shrink/skip events) for any run, with a picker across multiple runs. Verified in-browser, both the `READY` and `NEEDS_REVIEW` states — the latter required giving test runs distinct names, since the original script silently reused one hardcoded run name and the first test run overwrote the example it was meant to sit alongside.
  - **Real bug found and fixed**: every `<code>` element (frame IDs throughout the UI) rendered functionally invisible — `rgb(237,237,237)` text on a near-matching light background — because the page inherited `globals.css`'s dark-mode `--foreground` CSS variable instead of using its own explicit color. Found by inspecting computed styles directly in the browser, not by trusting a screenshot that looked fine at a glance (a scroll-triggered screenshot glitch in the browser tool made this session's visual checks unreliable at points — cross-checked with DOM text and network requests instead of retrying screenshots blindly). Fixed by setting an explicit color at the page root rather than patching individual elements.

**Phase 1 results (this pass):**
- **Per-page `Y_OFFSET` derived and confirmed for all 4 pages** (previously only page 1 had one): `{0: -3.164, 1: -2.133, 2: -2.133, 3: -2.616}` (0-indexed). Method: each page's topmost drawn rect (running-header box, flush to `LIVE_AREA.y0=12.064`) gives a candidate offset; every candidate was cross-verified by re-transforming that page's text spans and diffing against `template.json`'s existing frame positions — all 3 previously-unverified pages matched to within 0.01pt. Page 1's own offset was independently re-derived from a cleaner anchor and came out -3.164 vs the previously recorded -3.166 — 0.002pt apart, within measurement noise, not a real correction.
- **Built `scripts/audit_page.py`** — a reusable, general-purpose version of the extraction technique that found every real header defect (full per-page span/drawing/image dump, reconciled to canonical space via the confirmed per-page offset). This replaces writing a new one-off extraction script per region/page and is the seed of the Phase 7 QA harness.
- **Text/photo frame geometry**: `template.json`'s existing bboxes for pages 1–3 (0-indexed 0–2) matched fresh extraction to within 0.01pt across the board — the first-pass inventory was more accurate than the roadmap assumed for these pages.
- **Real defect found and fixed — page 4 photo inventory**: the top sponsor-logo strip (Cadila, Zydus, Reliance, Honda, Essar, Ashok Leyland, IFFCO, Bajaj, etc.) has several logos built from two separate embedded images (icon + wordmark); `template.json`'s original pass only captured 13 of the 18 actual images in that strip, missing 5 entirely. Confirmed by rendering the strip to PNG and visually matching before fixing. Added the 5 missing frames (`labelHint: "sponsor_logo_strip_secondary"`); page 4 went from 53 → 58 frames.
- **Color palette confirmed closed across the whole issue**: every text color found on all 4 pages (`get_text` span colors) reduces to the same 5 values already in C.4 (`ink_near_black`, white, `wordmark_purple`, `bullet_gold`, `bullet_light2`) — no new/unknown colors anywhere outside the header.
- **`ad_or_box` frame counts reconcile against drawn rectangles** on all 4 pages once the header's cyan tabs (drawn but intentionally not classified as their own `ad_or_box` frames) are accounted for — no missing ad boxes found.
- **Real methodological finding — block vs. span granularity**: `get_text("dict")`'s **block**-level grouping can silently merge a headline and its deck/subhead into one bbox/font reading (found on page 1's lead story: a 55pt headline and an unrelated 25pt deck sitting in the same block, with the deck completely hidden by only reading each block's first span). `audit_page.py` extracts at **span** level specifically to avoid this. Any future extraction code must never read block-level "representative font/size" as ground truth — always walk to spans.
- **Real layout finding — page 1's lead story uses an irregular column layout**: column 1's body text begins while the headline's second line is still wrapping across columns 1–3, and a bold deck occupies columns 2–3 independently of column 1's own flow. This is real PageMaker-era editorial composition, not a simple stacked-block grid — flagged as a concrete complexity for Phase 4 (the layout engine can't assume uniform per-story column start positions).

**Not yet started:**
- Most of page 1's remaining story slots (only the `STORY_PRAG` group has actually been built; the `STORY_SAMARTH`, `STORY_NIFT`, `STORY_PM_VISIT` frame groups in `content.ts` are still unbuilt in the PDF pipeline).
- Pages 2–4's running headers — inventoried and classified `mixed`, but not yet decomposed/built the way the edition bar was.
- The 4 other `mixed` regions (`p1-39`/`p1-40`, `p2-6`, `p4-36`) — same: classified, not built.
- Pages 2–4's own content build-out generally.
- Multi-column balancing/hyphenation (Phase 4) and caption sub-box geometry (Phase 5) — noted as open in their phase sections above.
- Any daily-automation, content-ingestion, or scheduling layer. Note: the one fresh piece of content used to prove Phase 4 (`STORY_PRAG`) was already-sourced text reused from `content.ts`, not a new live fetch — a real PIB fetch was attempted this session and abandoned when the listing UI proved unreliable to automate; Phase 8 (repeatable content ingestion) still needs to actually solve that, not just reuse existing text.
- Extending the Phase 7 QA harness beyond the current `audit_page.py` dump (no automated pass/fail diff yet — comparisons this session were done manually against `template.json`).

---

## Part E — Roadmap: extending header-grade precision to the whole newspaper

Each phase produces something concrete and is checkpointed by the same measure-then-diff discipline used on the header. Phases are ordered by dependency, not necessarily by calendar priority — Phase 1 blocks everything after it.

### Phase 1 — Full structural re-inventory, all 4 pages, header-grade rigor
- Re-run the C.2 transform verification per page: confirm (or derive fresh) a `Y_OFFSET_p{N}` for pages 2–4 the same way it was done for page 1, since nothing after this phase is trustworthy until each page's own coordinate reconciliation is confirmed.
- For every frame currently in `template.json` (149 total), re-extract with `get_text("dict")` (`origin`, not just `bbox`) and a full per-page `get_drawings()` audit — the header work found 2 missing border lines and a whole missing bullet glyph that a bbox-only/visual pass had missed; assume the same failure rate applies to every other zone until proven otherwise.
- Output: an upgraded `template.json` (or a new `template_v2.json`) where every frame carries verified `origin`-based text anchors and a confirmed static/dynamic classification (Part B, technique 3).

### Phase 2 — Static/dynamic classification pass, whole paper — **COMPLETE**

**Correction to this phase's own original description:** the plan above assumed "running headers" would fall cleanly into the static bucket. They don't — inspecting actual content on pages 2–4 found each running header decomposes into 4 spans: a page-folio number (dynamic), the brand wordmark repeated twice (static), and a date/day stamp (dynamic) — the exact same static+dynamic mixing pattern as the edition bar, just not yet decomposed/built. A third **`mixed`** classification was added (not just static/dynamic) for any frame that is a static box/border with dynamic content poured inside — this is more honest than forcing a binary and directly flags what still needs a WeasyPrint-snippet build, the same treatment the edition bar already got.

- Walked all 154 frames (all 4 pages, post-Phase-1 counts) and classified each `static` / `dynamic` / `mixed`, with a `classificationNote` explaining the call. Results: page 1 = 10 static / 31 dynamic / 2 mixed; page 2 = 2 / 24 / 2; page 3 = 2 / 22 / 1; page 4 = 22 / 34 / 2.
- The `ad_or_box` type turned out to be a first-pass catch-all bucket hiding at least 6 genuinely different things, resolved by reading each frame's actual text/drawing content rather than trusting the type label: real header chrome (already static, already handled), a photo-caption box (`p1-39`/`p1-40`), an editorial opinion column ("તંત્રી સ્થાનેથી" / From the Editor's Desk, `p2-6`), a boxed news story (Rotary District 3055 awards, `p4-36`), a fixed section-flag label ("વ્યવસાયિક સમાચાર" / Business News, `p4-7`), and what content analysis suggests is a recurring PSA-style ad (blood/eye donation slogan, `p4-52` — plain border, no image, inferred not confirmed).
- Page 4's sponsor-logo strip (18 images, all of page 4's `photo`-type frames with `y0<80`) classified `static` but tagged **static-per-run**: fixed for this issue, but a real production system must treat it as swappable between issues (an advertiser's booked slot can change), unlike the masthead which is permanent.
- `classification` + `classificationNote` fields written directly onto every frame object in `template.json`.

**Content contract per classification** (what fills it, from where, in what shape):

| Classification | Frame types / examples | Contract |
|---|---|---|
| `static` | masthead, navy chrome boxes, edition tabs, diamonds, border-only boxes, section-flag labels, masthead's own illustration photo, sponsor-logo strip (static-per-run) | Vector-copied once via `show_pdf_page()`, byte-identical every time. Sponsor logos are the one static category that still needs a swap mechanism per issue — not truly permanent like the masthead. |
| `dynamic` — `headline_L1` / `headline_L2` / `subhead_kicker` | Editorial headline/deck text | Single or few-line string from a `Story.headline`/`Story.kicker` field; must fit the frame's measured width at the frame's calibrated font size (Phase 3) — no contract yet for what happens when it doesn't fit (open item, Phase 4/10). |
| `dynamic` — `body_or_caption` | Multi-column article body, or a caption tied to an adjacent photo frame | Flowing multi-paragraph text (`Story.body`) when paired with a headline group; short caption text when paired with a `photo` frame instead — **the frame type alone doesn't disambiguate which**; that pairing has to come from proximity/adjacency to a headline or photo frame, which isn't encoded anywhere yet (open item). |
| `dynamic` — `photo` | News photography | Image + a crop rect matching the frame's own aspect ratio (never stretch-to-fit) + optional linked caption frame. |
| `dynamic` — computed fields (page folio, date/day spans) | The `p{N}-1` / `p{N}-3` pieces of the running header, edition bar's date/issue/day | Not authored content — deterministically computed from the issue date + page position, same generator logic `build_header_v2.py` already uses for the edition bar. |
| `mixed` | `edition_bar_bg` (done), running headers on pages 2–4 (not yet built), `p1-39`/`p1-40` photo-caption box, `p2-6` editorial column, `p4-36` boxed story | Static box geometry/fill/border (drawn once via `draw_rect`/`draw_line`, same as the edition bar background) + a WeasyPrint-rendered dynamic snippet composited on top via `show_pdf_page()`. **Only the edition bar has actually been built this way — the other 4 mixed regions are inventoried but not yet implemented.** |

**Not resolved by this phase (carried forward, not silently decided):**
- Whether `p4-52` really is a recurring stock ad or genuinely-dynamic sponsored content — inferred from content pattern (plain border, no image, PSA-style slogan text), not confirmed against an actual ad-booking record.
- The body/caption disambiguation rule above (what determines whether a `body_or_caption` frame is a caption vs. a story continuation) — needs an explicit adjacency rule before Phase 8 (content ingestion) can assign anything to these frames automatically.
- What happens when authored content doesn't fit its measured frame (truncate? resize? flag?) — still open, as already noted in Phase 9.

### Phase 3 — Font calibration, whole paper — **COMPLETE**

**Methodological upgrade over the header's per-element calibration:** the header work calibrated specific elements (this wordmark, this tagline) to specific measured sizes — fine for content that's fixed forever, useless for headlines that don't exist yet. Phase 3 instead derives one **size-independent RATIO per source-font role** (e.g. `BBharatiGopikaTwo,Bold` → Hind Vadodara Bold): for many real spans, back-solve the substitute size that reproduces the original's exact measured width, divide by the original's own declared size, and take the median across samples. `calibrated_size = declared_size × ratio` then applies to *any* future text set in that font role, including headlines that will only exist once real daily content flows through Phase 4+.

- Surveyed every distinct source font actually used across all 4 pages (not just the header): 9 found, of which 2 (`Calibri`, `ArialBlack`) had no entry yet in `fonts.ts`'s substitution table — added.
- **Sample-length matters**: an early pass using short fragments (e.g. `'rðï '`, 3 characters) produced wild per-sample ratios (up to 1.59× against a median around 0.65–0.75) — individual glyph/kerning quirks dominate a short string's aggregate width ratio. Fixed with a tiered length filter: ≥10 characters where enough exist (the 4 Gujarati fonts — plenty of long real body/headline text), falling back to ≥4 characters for fonts that are *inherently* only ever used for short acronym-style fragments in this document (`Calibri`, `Times-Roman`, `Times-Bold`, `Helvetica-Bold` — used for things like "NRI", "ATM 2026", "UAE", "B2B", "MENA"), flagged explicitly as lower-confidence rather than presented as equally solid.
- Two fonts (`ArialBlack`: 2 occurrences total; `Calibri,Bold`: 1 occurrence total) had too little data for any independent estimate. `Calibri,Bold` borrows `Helvetica-Bold`'s ratio (they resolve to the *identical* substitute: Arial/Helvetica weight 700 — not a guess, a legitimate equivalence). `ArialBlack` has no sibling to borrow from, so its 2-sample estimate is kept but flagged **very low confidence**.
- **Real non-obvious finding**: `BBharatiMaruti`'s ratio is *not* size-independent — sizes ~34–38pt cluster around ratio 0.37–0.61, sizes ~50–55pt cluster around 0.71–0.77, a real trend (not noise), most likely from tracking/letter-spacing applied differently at different display sizes in the original PageMaker file. Confirmed as isolated to this one font by checking the two other wide-size-range fonts (`BBharatiGopikaTwo,Bold` spans 11–60pt, `BBharatiTitleTwo` spans 19–190pt including the wordmark itself) — neither shows any size trend. `BBharatiMaruti` gets an explicit 2-band interpolation table instead of a flat multiplier; using it outside the sampled 30–60pt range falls back to the flat median rather than extrapolating a trend past where it was ever measured.

**Calibration ratios (median, `calibrated_size = declared_size × ratio`):**

| Source font | Substitute | Ratio | Confidence |
|---|---|---|---|
| BBharatiTitleTwo | Baloo Bhai 2, 700 | 0.6423 | high (n=7, ≥10 chars, spans 19–190pt with no size trend) |
| BBharatiGopikaTwo | Hind Vadodara, 400 | 0.7444 | high (n=40, ≥10 chars) |
| BBharatiGopikaTwo,Bold | Hind Vadodara, 700 | 0.6716 | high (n=40, ≥10 chars, spans 11–60pt with no size trend) |
| BBharatiMaruti | Mukta Vaani, 700 | **size-banded**: 0.52 (30–40pt) / 0.74 (45–60pt) | high sample count, but real size-dependence — see above |
| Helvetica-Bold | Arial/Helvetica, 700 | 1.0307 | low (n=4, short fragments only) |
| Times-Bold | Georgia/Times New Roman, 700 | 0.9283 | low (n=6, short fragments only) |
| Times-Roman | Georgia/Times New Roman, 400 | 1.0269 | low (n=13, short fragments only) |
| Calibri | Arial/Helvetica, 400 | 0.8745 | low (n=3, short fragments only) |
| Calibri,Bold | Arial/Helvetica, 700 | 1.0307 | borrowed from Helvetica-Bold (n=1 in doc, identical substitute) |
| ArialBlack | Arial Black, 900 | 0.9036 | very low (n=2 total occurrences, no sibling) |

- Output: `web/src/lib/calibration_ratios.json` (full per-sample data + confidence notes), and a new `calibrationRatio()` / `calibratedFontSize()` pair exported from `web/src/lib/fonts.ts` — this is now the **only** sanctioned way to turn a declared PDF size into a substitute-font size anywhere in this codebase; a hand-set size guess is exactly the class of bug (the edition bar's unmeasured 12.5pt) this phase exists to prevent from recurring.

### Phase 4 — Gujarati layout engine for flowing body text — **COMPLETE (core engine proven; multi-column balancing and hyphenation still open)**
- Built `scripts/layout_lib.py`: `flow_gujarati_text(text, frame, source_font, declared_size_pt, ...)` — pours arbitrary text into a measured frame rect via WeasyPrint, using the Phase 3 calibration ratio (never a hand-set size) and the grid's confirmed leading ratio (1.2×).
- **Proven against real, freshly-flowed content, not reference-issue text**: `scripts/build_page1_demo.py` flows `STORY_PRAG` (a real, sourced, previously-written story from `content.ts` that had never actually been rendered through the PDF pipeline before) into its full frame group — headline (`p1-12`), subhead (`p1-21`), and 4 body columns (`p1-20`/`22`/`23`/`24`) — proving the engine handles content that didn't exist when the source PDF was made, which per-element calibration (the header's approach) fundamentally cannot do.
- **Verified numerically, not just visually** (same discipline as every other phase): re-extracted the built output's own spans and confirmed (a) every frame's rendered font size matches its Phase 3 calibrated size *exactly* (24.18pt / 14.78pt / 9.68pt), (b) measured line-to-line baseline gap on the 2-line headline is 29.01pt against an expected 29.02pt (1.2× leading, confirmed to 0.01pt), (c) rendered text stays within its frame's bounds on every frame checked (max overflow found: +0.06pt, sub-pixel noise, not a real defect).
- **Real bug found and fixed in the process**: the "open slot" placeholder helper (used when a frame has no sourced content yet, same honest-labeling spirit as the project's existing `AD_PLACEHOLDER_IDS`/`OPEN_STORY_SLOT_IDS` pattern) used PyMuPDF's own `insert_textbox()` with a Gujarati label — same class of bug as the anusvara issue documented in Part A: PyMuPDF's built-in font can't render Gujarati Unicode and silently prints `?` glyphs instead of erroring. Fixed by using a plain-ASCII label for this debug-only marker rather than routing a placeholder through the full WeasyPrint pipeline.
- **Not yet done**: true multi-column balancing (the engine flows independently-supplied per-column text, matching how `content.ts`'s `Story.bodyColumns` already pre-splits stories — it does not itself decide how to split one long story across N columns or balance column fill), widow/orphan control, and Gujarati hyphenation convention (still unresearched, as flagged in Part F). Justified text at the grid's narrow single-column width (124.2pt) was tested and looks clean at the calibrated body size, but hasn't been stress-tested against a much longer paragraph that would need real hyphenation to justify well.

**Font-role coverage extended (post-Phase-9 follow-up)** — closes the gap Part G named explicitly: `BBharatiTitleTwo` (Baloo Bhai 2) and `BBharatiMaruti` (Mukta Vaani) previously had no local font file, so `flow_gujarati_text` correctly *refused* to render them (raising, not silently falling back) — meaning every headline/masthead-style frame set in either font was completely unbuildable. Downloaded both (`web/fonts/BalooBhai2-Bold.ttf`, `web/fonts/MuktaVaani-Bold.ttf`) and registered them in `FONT_ROLES`; Phase 3's calibration ratios for both already existed, so no recalibration was needed.

- **Real finding: the top-leading offset (`TOP_LEADING_OFFSET_RATIO`, previously a single global 0.149 constant derived only from Hind Vadodara) is font-specific, not universal.** Measuring it the same clean way for the two new fonts found Baloo Bhai 2 at 0.2110 and Mukta Vaani at 0.2310 — both exactly proportional across sizes 15–50pt (four decimal places stable), confirming they're real per-font constants, not noise, but genuinely different from Hind Vadodara's. Refactored into `TOP_LEADING_OFFSET_RATIOS`, a per-source-font dict, with the old constant re-verified at 0.1490 (matching exactly) as a sanity check that the new measurement method agreed with the old one before trusting either.
- **A second real finding, only visible because the new fonts' offsets are larger**: shifting the whole composited target rect down to fix the top-of-line glyph overshoot can push content past the frame's *bottom* edge for a tight, single-line frame with little vertical slack (found on `p2-8`, a small headline_L2 box) — invisible with Hind Vadodara's smaller 0.149 offset on every frame tested before this session's font-role work, real and measurable (1.15pt) with Baloo Bhai 2's larger 0.211. Fixed by making the Phase 9 auto-shrink fit-check aware of the *post-shift* position, not just WeasyPrint's own pagination — `p2-8` now auto-shrinks to `shrink_ratio=0.94` and fits cleanly.
- **A third real finding, in the QA harness itself**: `verify_page.py`'s font-size and leading checks didn't know about Phase 9's legitimate auto-shrink, so a correctly-shrunk frame like `p2-8` registered as a false `FAIL`. Fixed: a measured size below the calibrated target but within `MIN_FIT_RATIO`'s known floor now reports `PASS (within auto-shrink floor)`, and the leading check now uses the frame's *actual* rendered size rather than recomputing from the unshrunk declared value.
- All three fixes verified together: `p2-8` (Baloo Bhai 2, auto-shrunk) and `p2-9` (Mukta Vaani, no shrink needed) both render correctly and pass every check; a full regression pass across every existing build script (`build_header_v2.py`, `build_page1_demo.py`, `build_page2_demo.py`, `build_running_headers_demo.py`, `daily_build.py` both happy-path and overflow-test) confirmed zero regressions.

### Phase 5 — Photo pipeline — **COMPLETE (core pipeline proven; caption sub-box geometry still open)**
- Built `place_photo_cropped()` in `scripts/layout_lib.py`: center-crops a source image to a frame's *exact* aspect ratio before embedding — never stretch-to-fit.
- **Proven against a real photo** (`prag1.jpg`, already sourced earlier this project for this exact story) placed into `p1-15`. Verified numerically: frame aspect 1.4996 vs. placed-image aspect 1.5000–1.5003, delta ≤0.0007 — confirms no distortion, not just "looks fine."
- **Second photo frame (`p1-16`) deliberately left as an honest placeholder** rather than duplicating the one real photo or fabricating a second — built `draw_open_photo_slot()` following the same labeling discipline as `AD_PLACEHOLDER_IDS`/`OPEN_STORY_SLOT_IDS`.
- **Not yet done**: captions/credit lines. A photo frame's implicit caption strip needs its own measured sub-bbox (the same kind of decomposition the header's sub-elements got) before caption text can be positioned precisely rather than eyeballed off the photo's bottom edge — open item, carried forward.

### Phase 6 — Per-page composition script — **CORE DONE for page 1 + the pages 2–4 running header; full multi-page composition still open**
- Built on `layout_lib.py` (Phase 4/5) rather than a new architecture, exactly as planned: static via `show_pdf_page()`, dynamic via WeasyPrint snippet + `show_pdf_page()` composite.
- **New this batch — completed one of the 5 `mixed` regions flagged unbuilt in Phase 2**: pages 2–4's running header. Built `scripts/running_header.py` + `scripts/geometry.py` (a shared, page-generalized coordinate transform — previously `build_header_v2.py` hardcoded a page-1-only version; refactored to import the shared one, verified no regression by rerunning it and confirming identical calibrated sizes).
- **Real finding while building it**: the running header's background color is *not* the same across pages — pages 2 and 3 use `rgb(236,0,140)` (magenta), page 4 uses `rgb(127,57,150)` (the same purple as page 1's masthead). Also found a dense row of ~24 decorative diamonds spanning nearly the whole strip width — a different decorative pattern from page 1's masthead (which has only 2 diamond-pair gaps) — discovered only by dumping raw drawing ops, not visible as "the same pattern" from a casual look. Given this richness, the strip is vector-copied whole (capturing every diamond/color correctly without hand-reproducing them) and only the date/day sub-region is erased and repainted with fresh WeasyPrint text — same principle as the edition bar, applied to a structurally different region.
- **A real process mistake, caught by re-checking rather than trusting the first pass**: an earlier attempt at this hand-transcribed each page's geometry into a Python dict by copy-pasting from separate script runs, and cross-contaminated values — page 3's `erase_x` ended up filed under page 2's entry. Fixed by re-extracting all 3 pages' geometry in one consolidated pass (`out/_running_header_geometry.json`) instead of hand-transcribing per-page numbers across multiple runs — the class of mistake this avoids (silently mixing up which number belongs to which page) is exactly why the project insists on machine-extracted values over manual transcription.
- Verified: rebuilt page's date span size matches the Phase 3 calibrated value (10.75pt) exactly on all 3 pages; visual check confirms the erase-repaint seam is invisible against both background colors.
- **Not yet done**: full multi-page composition (pages 2–4 have no story content to compose yet — Phase 8 is still open); the other 4 `mixed` regions (`p1-39`/`p1-40`, `p2-6`, `p4-36`); one parameterized script vs. per-page scripts hasn't been decided (deferred until there's enough real page-2-4 content to see whether the per-page differences are actually small, per the phase's own original plan).

### Phase 7 — Automated QA / regression harness — **COMPLETE (core harness built and already proved its worth)**
- Built `scripts/verify_page.py <built_pdf> --page <1-4>`: for every text frame, checks rendered font size against the Phase 3 calibrated expectation, checks content stays within frame bounds, and checks leading against the 1.2× ratio; for every photo frame, checks placed-image aspect ratio against frame aspect. A frame with nothing rendered is reported `NOT_BUILT` (skipped), not `FAIL` — most frames aren't built yet, and treating "empty" as failure would bury real signal in noise.
- **Immediately found a real, previously-undetected bug in the Phase 4 layout engine**: every text frame showed the same systematic top-of-frame overflow (1.44–3.6pt), and checking the ratio against font size showed it was *exactly* proportional (1.49× the naive half-leading estimate, constant across sizes from 9.68pt to 24.18pt, both font weights) — a real, deterministic effect from how WeasyPrint's `line-height:1.2` positions glyph-ink relative to the nominal line box in this font, not noise. Documented as `TOP_LEADING_OFFSET_RATIO = 0.149` in `layout_lib.py` and compensated for by shifting the composited target rect.
- **The fix itself had a sign error on the first attempt** (shifted the rect the wrong direction, which doubled the discrepancy instead of fixing it) — caught immediately by re-running the harness after the "fix" rather than assuming it worked, exactly the discipline this phase exists to enforce. Second attempt: clean, all 26 checks across the Phase 4/5 proof build now `PASS`, 0 `FAIL`.
- This retroactively means Batch 1's Phase 4/5 "proven" claim was true for calibration/bounds/aspect but had one real, small, now-fixed placement defect that manual inspection alone did not catch (the earlier visual checks looked fine — the ~1-4pt discrepancy wasn't visually obvious, only the harness's numeric diff caught it).
- **Not yet done**: whole-page `get_drawings()` diffing (currently only text/photo frames are checked, not vector shapes) and any check of `static`/`mixed` regions' vector content against the source (current checks only cover `dynamic` text/photo frames).

### Phase 8 — Content ingestion pipeline — **CORE FETCH SOLVED (one real story ingested end-to-end); repeatable automation and editorial mapping still open**
- **Solved the gap flagged twice in Batches 1 and 2**: a live PIB fetch was attempted and abandoned in Batch 1 (the listing page's UI proved unreliable to click through), and flagged again after Batch 2 as the thing Phase 8 actually had to fix. This time it got fixed, not deferred again — two concrete technical blockers, both found and solved:
  1. **The date-filter `<select>` dropdowns don't respond reliably to simulated clicks** (the earlier attempt left the value stuck at today's date, which had zero releases). Fixed by setting `.value` directly via JavaScript and dispatching a synthetic `change` event — the page is classic ASP.NET WebForms with an `onchange="__doPostBack(...)"` handler, which a direct JS event triggers correctly where clicking the native dropdown overlay did not. Confirmed by checking the resulting release count changed from 0 to 26 for a real date (21 Aug 2026).
  2. **The article content isn't in the page you navigate to.** `PressReleaseDetail.aspx?PRID=...` (the URL the listing page links to) renders only the search-widget shell with no article text — the actual content loads inside an `<iframe src="PressReleasePage.aspx?PRID=...">` (no `reg`/`lang` params). Found by dumping `document.querySelectorAll('iframe')` after the outer page loaded blank, then navigating directly to the iframe's own URL, which returns the full headline/dateline/body text cleanly.
- **Proven with one real story, fetched live this session, not reused text**: "CBI Court Ahmedabad Sentences Income Tax Officer to Three Years' Rigorous Imprisonment in Bribery Case" (PIB Ahmedabad, 21 Aug 2026, PRID 2302022) — an original Gujarati paraphrase (not a machine translation or verbatim copy) added as `STORY_CBI_BRIBERY` in `content.ts`, then flowed through the full pipeline: `scripts/build_page2_demo.py` places it into a real page-2 frame group (headline `p2-23`, kicker `p2-26`, 4 body columns `p2-24`/`25`/`27`/`28`) on top of the Phase 6 running header, and `verify_page.py` confirms 20/20 checks pass — the Batch 2 leading-offset fix generalized correctly to different content on a different page without any further correction needed.
- **Not yet done**: this is one manually-selected story, not a repeatable daily pipeline — no scheduling, no automatic story selection, no handling for "PIB published nothing relevant today." Editorial mapping (which fetched story goes in which frame, on which page) is still a manual choice made this session, not a rules layer or review UI — both remain open per the phase's original plan, and per the standing open question in Part F about whether the Next.js app becomes that review surface.

### Phase 9 — Daily production run — **COMPLETE (orchestration + both failure modes built and deliberately tested, not just assumed to work)**
- Built `scripts/daily_build.py`: fetch (Phase 8, currently one hand-picked story per run) → assign to frames (a plain content-plan dict) → flow text (Phase 4) → place photos (Phase 5) → compose pages (masthead+edition bar for page 1, running header for pages 2–4, Phase 6) → QA gate (Phase 7) → routed handoff. `READY` runs land in `out/final/`; anything else lands in `out/staging/` with a written report — the two are never in the same place, so nothing ships by accident.
- **Both failure modes Phase 9's own plan flagged as "needs a decision, not a default" are now real, tested code paths, not assumptions**:
  1. *Content doesn't fit its frame*: `flow_gujarati_text()` (Phase 4, `layout_lib.py`) now auto-shrinks down to a measured floor (`MIN_FIT_RATIO = 0.85`) before giving up; if it still doesn't fit, the orchestrator refuses to composite that piece and marks the whole run `NEEDS_REVIEW` rather than shipping a page with silently dropped text. **Deliberately tested**, not assumed: `python3 scripts/daily_build.py --include-overflow-test` feeds a guaranteed-oversized paragraph into a real frame and confirms the run correctly lands in `out/staging/` with a report naming exactly which frame and why.
  2. *A story is missing required fields, or needs a font asset that isn't downloaded yet*: that one assignment is skipped and logged (`SKIPPED_ASSIGNMENT` / `MISSING_FONT_ASSET`), the rest of the run continues — one bad assignment doesn't abort otherwise-fine pages.
- **A real, serious latent bug found and fixed while building this phase, not before**: WeasyPrint paginates content that overflows a fixed-height `@page` onto *additional PDF pages* rather than clipping it (confirmed directly: one deliberately-long paragraph produced a 9-page snippet). `composite_snippet()` only ever placed page 0 of a snippet — meaning any overflow, anywhere in the whole project up to this point, would have been **silently dropped**, not just visually clipped, and nothing built so far had happened to trigger it. Fixed by making `flow_gujarati_text()` page-count-aware (the auto-shrink loop above) and adding a second refusal guard directly in `composite_snippet()` itself, so a caller that forgets to check `fit_status` fails loudly instead of shipping truncated text.
- **A second real bug found by the deliberate overflow test, unrelated to overflow itself**: the orchestrator's first draft hardcoded `"BBharatiGopikaTwo,Bold"` as the font role for every headline, instead of reading each frame's own `sourceFont` from `template.json`. This happened to be harmless for both happy-path stories (their frames coincidentally used that exact font already) and was only exposed when the overflow test exercised a frame using a different font (`BBharatiTitleTwo`) — the QA harness caught the resulting wrong calibrated size (18.43pt rendered vs. 17.62pt expected) immediately. Fixed to always read `sourceFont` from the frame; the overflow test itself was also narrowed to target only a `BBharatiGopikaTwo` frame so it isolates one failure mode at a time instead of conflating two.
- **Not yet done, and flagged rather than assumed**: no scheduling mechanism (cron or otherwise) — this pipeline runs on demand, not on a timer; no automatic story-to-frame assignment (the content plan is still hand-written per run); no handling for "the source has nothing relevant today"; and per the phase's own original plan, the first several *real* runs should still be gated on human sign-off before this is trusted unattended, regardless of how clean the QA harness's track record looks in one session.

### Phase 10 — Template flexibility — **RESOLVED, by decision rather than by data: constraint-based layout is the strategy, permanently, not provisionally**
- **Confirmed directly with the user: `(196) Capital Kranti_08 august.pdf` is the only reference issue that exists.** This isn't a temporary data gap to fill later — there is no second or third issue coming. That changes what this phase's original plan ("decide between a template library and constraint-based layout after a few more reference issues make the variability visible") actually means: **option (a), a template library, is not merely unresolved, it is not viable for this project** — it fundamentally requires comparative evidence across multiple real issues that will never exist here. Continuing to list it as "blocked, pending more data" would misstate the situation; it's closed.
- **Therefore: option (b), constraint-based layout, is the adopted strategy for handling day-to-day content variability — a decision, not a placeholder.** It's already real and tested for the one axis of variability this project *can* produce and verify evidence for without a second issue: content length vs. frame size, via Phase 9's auto-shrink-then-flag mechanism (a frame's content resizes within a bounded, measured range to fit the template's own grid, and falls back to a flagged human decision rather than silently reflowing the grid when it can't). The same approach — bounded, measured adjustment within the existing grid, human review when it can't be resolved mechanically — is now the intended pattern for any other variability this project encounters (different story counts, different photo counts per page), not just the font-size case it was first built for.
- **What this means practically going forward**: don't design new frame-assignment logic around "pick the right template for today's story count" (there will only ever be one grid to work with); design it around "fit what we have into the one grid we have, and flag what doesn't fit for a human." Every future extension of `daily_build.py`'s content-assignment logic should follow this, not quietly reintroduce a template-selection assumption that has no data to justify it.
- **If a second reference issue ever does become available** (a future issue gets exported from the layout software, scanned issues become digitized as real vector PDFs, etc.) — this decision should be revisited, not assumed to still hold. The reasoning here is "no evidence exists to support anything else," not "constraint-based layout is provably correct."

---

## Part F — Open Architectural Questions (not yet decided, flagged not resolved)

1. **RESOLVED — Node/React live-preview path vs. Python/PyMuPDF+WeasyPrint production path.** Built `web/src/app/review/`: an editorial review surface reading `scripts/daily_build.py`'s own output (a manifest + rendered page images written by `scripts/review_manifest.py`, not a live PDF re-render in the browser). This makes the split explicit rather than implied: the React app shows what the Python pipeline built and its QA results (status banner, per-frame pass/fail, build-log events like content-overflow and auto-shrink) — it does not produce the PDF itself. `export-page.mjs`/`render-header-pdf.mjs`/`capture-header.mjs` remain superseded, unchanged by this. A real bug was caught building this: every `<code>` tag (frame IDs) rendered functionally invisible (`rgb(237,237,237)` on a near-matching light background) because the page never set an explicit text color and inherited `globals.css`'s dark-mode `--foreground` variable while using its own hardcoded light palette — found by inspecting actual computed styles in the browser, not by trusting a screenshot that looked fine at a glance, and fixed by setting an explicit color at the page's root rather than patching each element.
2. **CLOSED, not open — see Phase 10.** Confirmed directly with the user: `(196) Capital Kranti_08 august.pdf` is the only reference issue that exists or ever will. Every parameter in Part C describes that one issue, permanently, not a template proven to generalize — Phase 10 adopts constraint-based layout specifically because this question can never be answered with more data.
3. **Hyphenation/line-break convention for Gujarati body copy** — not yet investigated at all; needed before Phase 4 can be trusted for anything beyond a single unbroken line.
4. **Approval/sign-off gate for the daily run** (Phase 9) — who reviews, at what stage, and what's the rollback if a bad issue goes out — a process decision, not a technical one, but it blocks calling Phase 9 "production."

---

## Part G — What "all 10 phases addressed" does and does not mean

All 10 phases now have a status in this document. That is a real milestone — the full path from raw source PDF to a QA-gated, print-shaped page exists and has been run, more than once, on real (not fabricated) content. It is **not** the same as "this is a production system." Concretely, still true after this phase:

- **One issue, one page-1 story slot, one page-2 story slot.** Every claim in Phases 4–9 was proven on `STORY_PRAG` and `STORY_CBI_BRIBERY` in two frame groups across two pages. Pages 3–4 have zero story content built. The other 4 `mixed` regions flagged in Phase 2 (`p1-39`/`p1-40`, `p2-6`, `p4-36`) are still just inventoried.
- **No scheduling.** `daily_build.py` runs when a person runs it. There is no cron job, no trigger, no "daily" about it yet beyond the name.
- **No automatic editorial judgment.** Which story goes in which frame is a hand-written Python dict in this session. Nothing decides that a CBI-court story is page-2-appropriate versus page-1 versus not-worth-running today — a person made every one of those calls.
- **Template flexibility is a closed decision, not proven generalization.** Phase 10 above adopts constraint-based layout because it's the only strategy this project's evidence (one reference issue, confirmed permanent) can support — that is a reasoned choice under a real constraint, not evidence the grid itself has been shown to generalize beyond this one issue. If this software is ever pointed at a differently-laid-out issue, that's untested territory, not a solved case.
- **The QA harness checks geometry, not truth.** It confirms a headline renders at the right size in the right place — it has no opinion on whether the headline is accurate, well-written, or the right editorial call. That remains entirely human.
- **Every real bug found this session was found by deliberately testing an edge case**, not by the happy path looking clean: the top-leading offset (Batch 2), the WeasyPrint multi-page silent-drop bug and the hardcoded-font-role bug (Phase 9), and — in the direct follow-up to this section — the font-specific top-offset and post-shift bottom-overflow bugs found the moment `BBharatiTitleTwo`/`BBharatiMaruti` were actually exercised for the first time, were all invisible until something was pushed past its comfortable case. **"More font roles" as a named gap here is now closed** (all 4 Gujarati font roles have local files and were verified against real frames) — but the corollary stands for everything else still untested: different frame types, longer stories, pages 3–4's actual content. ("A second reference issue's actual layout" is no longer on this list as "untested" — it's confirmed permanently unavailable, per Phase 10, not merely something nobody's gotten to yet.) Treat the absence of a known bug as "not yet found," not "doesn't exist," the same discipline this document has applied to every claim in it so far.
