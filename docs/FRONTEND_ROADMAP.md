# Capital Kranti — Frontend Roadmap (Backend-Driven Architecture)

**Status: planning document, cleanup done, no new frontend code written yet.**
Supersedes the content-authoring parts of `docs/PRECISION_ROADMAP.md`, which
stays in place as the historical record of how the masthead/typography/grid
were measured — that measurement work is exactly what this new system reuses.
See "What survives" below.

---

## Part A — The pivot, precisely

Everything built in this project up to now (`docs/PRECISION_ROADMAP.md`'s
Phases 1–9, plus the Phase 3 flow-layout prototype) assumed *this codebase*
sources articles, writes them, and decides their content. That assumption is
gone. A separate backend (built by your brother) will own article content and
placement. This codebase's job becomes exactly two things:

1. **Render the newspaper as a website**, from data the backend supplies.
2. **Produce the print-ready PDF**, from the same data.

Nothing else. No more hand-written `STORY_SAMARTH = {...}` dicts, no more me
personally deciding which PIB release matters — that's the backend's problem
now (or your brother's, or a future automation on top of his API; out of
scope here either way).

**Page count is backend-driven, not hardcoded.** `IssueResponse.pages` (Part D)
tells the frontend how many pages exist; each `ArticlePlacement.page` says
which one an article belongs to. The frontend's page-rendering logic must be
**one generic function that runs once per reported page**, not a fixed number
of pages baked into the code. This is a direct fix to the exact anti-pattern
being retired here: `build_page1_flow.py` and `build_page2_flow.py` were two
separate, hand-written scripts because this session only ever built a 2-page
issue — the new system replicates to however many pages the backend reports
today, tomorrow, or any day after, with the same one function.

---

## Part B — Confirmed facts (from this conversation, not assumed)

- **Coordinate system**: pixel coordinates are anchored to
  `(196) Capital Kranti_08 august.pdf`'s own page size — **1105.50 × 1488.20 pt**
  — at **300 DPI**. That gives a page of **4606.25 × 6200.83 px**, and an
  exact, clean conversion factor:

  ```
  1 px = 0.24 pt        (72 / 300)
  1 pt = 4.166667 px    (300 / 72)
  ```

  This is **not** the same page size as `(172) PDF.pdf` (1119.7 × 1584.55pt,
  `gridSpec.ts`'s `PAGE` constant) that all of this session's Python pipeline
  was calibrated against. `gridSpec.ts` needs a new `PAGE` constant for the
  (196)-based size before anything reuses its grid math for real positioning.
- **Backend provides, per article**: coordinates (x, y), box size (width,
  height), title, full body text, and photo URL(s) — i.e. everything about
  *that one article*. Confirmed size = box dimensions in px (not font size).
- **PDF generation is this codebase's job**, not the backend's — reusing the
  WeasyPrint + calibrated-Gujarati-font pipeline already proven this session.
- **Typography is a frontend decision.** The backend does not specify fonts;
  this project's already-measured font-calibration system (`FONT_ROLES`,
  `calibration_ratios.json`) is the design system the frontend applies.
- **Chrome (masthead, edition bar, running header, ad boxes) is
  frontend-owned**, not part of the backend's article data.
- **Open / not yet decided** (flagged, not guessed past):
  - Exact DPI-to-pixel pipeline your brother's backend actually implements —
    confirm 300 DPI is really what ships, not just the working assumption.
  - Whether `bodyText` arrives as one blob or pre-split paragraphs.
  - Whether there's a `kicker` field, multiple photos per article, an article
    ID (needed for any kind of caching/diffing), or how the backend
    represents "this box has no story yet" (an open slot).
- **Not open, resolved by design**: page count and per-article page number.
  `IssueResponse.pages` gives the total; `ArticlePlacement.page` says which
  page each article belongs to (Part D). The frontend replicates its
  per-page render logic across however many pages that reports — see Part A
  and Part E step 5/6. The only thing left to confirm with your brother is
  that his backend actually names these fields this way, not whether the
  concept is supported.
- **Trigger model: fetch-on-load.** The frontend simply requests and renders
  whatever the backend's current data is when a page loads — no separate
  "build" trigger, no polling, no websocket, for v1. Simplest model that
  satisfies "render what the backend has."
- **Human approval gate: kept.** Before an issue counts as final/publishable,
  a human confirms the rendered result (no overlaps, every article's text
  actually fit its box, photos correct) — the same safety principle this
  whole project has used throughout, now checking backend-supplied data
  instead of hand-authored content. See Part E step 7 and Part G.
- **Runtime schema validation: yes, strict.** Every backend response is
  validated against a schema matching Part D's contract (Zod) before
  anything renders from it. A field-name mismatch or missing value fails
  loudly with a clear error, not a silently broken/blank page.
- **Hosting plan**: mocked data only for now (MSW). Backend and frontend will
  each be hosted separately in the future, with the frontend given a direct
  connector to the real backend API at that point — so the API base URL (and
  any auth) must be environment-configured from day one, never hardcoded,
  even while everything is mocked.

---

## Part C — What survives vs. what's archived

Moved into `archive/legacy-pipeline/` this session (git history preserved via
`git mv` where the files were already tracked). Nothing was deleted.

**Archived — superseded by the backend-driven model:**
- `scripts/daily_build.py`, `build_page1_flow.py`, `build_page2_flow.py`,
  `build_daily_flow.py`, `build_page1_full.py`, `build_page2_full.py`,
  `build_page*_demo.py`, `build_running_headers_demo.py`, `audit_page.py`,
  `build_header_final.py` — all hand-authored per-day content and one-off
  page templates.
- `verify_page.py`, `review_manifest.py` — QA/manifest logic tied to the old
  fixed 149-frame `template.json` model.
- `web/src/app/print/`, `web/src/app/review/` — old Next.js routes tied to
  the old per-frame data model and the old manifest format.
- `web/src/lib/template.json`, `frames.ts`, `element_inventory.json`,
  `calibrated_final.json`, `calibrated_sizes.json` — the old fixed-frame
  dataset itself.
- `web/src/lib/content.ts` — old `Story` interface, `STORY_*` stubs,
  `PAGE1_CONTENT`, `AD_PLACEHOLDER_IDS`, `OPEN_STORY_SLOT_IDS`. Its still-valid
  `CHROME` constants and `editionBar()` were extracted first (see below).
- `out/` (all generated PDFs/images from every build this session) —
  disposable output, zero loss.

**Kept and meant to be reused directly:**
- `scripts/layout_lib.py` — the calibrated Gujarati text-fitting engine
  (`flow_gujarati_text`, `flow_story_across_frames`, `crop_to_aspect`,
  `FONT_ROLES`, `calibration_ratio`). This is the core of "given a box size
  in px/pt and article text, render it correctly" — directly reusable for the
  new per-article rendering, generalized instead of tied to
  `template.json` frame lookups.
- `scripts/running_header.py`, `build_header_v2.py`, `geometry.py` — masthead
  and running-header rendering, unchanged in purpose. (One real dependency
  fixed during cleanup: `running_header.py` read a cached measurement file
  from `out/`, which is disposable — moved to `scripts/data/` instead, a real
  measured-data dependency, not a disposable output.)
- `web/src/lib/gridSpec.ts`, `header_spec.json`, `calibration_ratios.json`,
  `fonts.ts` — the masthead's exact measured geometry/colors and the font
  calibration data. `gridSpec.ts`'s `PAGE`/`LIVE_AREA` constants need updating
  to the (196)-based page size (Part B) before reuse.
- `web/src/lib/chrome.ts` (new, split out of the old `content.ts`) — just the
  real, hand-verified masthead/contact/RNI/footer text and `editionBar()`.
- `web/fonts/*.ttf`, `web/public/photos/*` — real assets, untouched.
- `docs/PRECISION_ROADMAP.md` — left in place as the historical record of how
  every one of the above measurements was derived. Not superseded, just not
  the active plan anymore.

---

## Part D — Proposed API contract (for your brother, not final)

Implemented as the actual Zod schema at `web/src/lib/contract.ts` (source of
truth) -- shown here as TypeScript for readability. `type` and `photoUrl`
below are confirmed, not proposed:

```ts
type ArticleType = "news" | "article" | "ad"; // confirmed by the user;
  // "news" vs "article" semantic difference still unconfirmed (Part F)

interface ArticlePlacement {
  id: string;              // stable ID -- needed for caching/diffing, not yet confirmed
  page: number;             // 1-indexed
  x: number;                // px, top-left, at 300 DPI on the (196)-size page
  y: number;
  width: number;            // px
  height: number;           // px
  type: ArticleType;        // confirmed: always present
  title: string;
  kicker?: string;          // TBD whether this field exists
  bodyText: string;         // TBD: one blob vs. pre-split paragraphs
  photoUrl: string;         // confirmed: ALWAYS present -- "" means no photo, not an absent field
  photoCaption?: string;
}

interface IssueResponse {
  issueDate: string;        // ISO date
  issueNumber: number;
  pages: number;
  articles: ArticlePlacement[];
}
```

Treat this as a starting draft to negotiate with your brother, not a spec
he's already agreed to. Its TypeScript shape is also the Zod schema's shape
(Part G) — one definition, not two things that can drift apart.

---

## Part E — Build plan

1. ✅ **Update `gridSpec.ts`'s page constants** to the (196)-based size (Part B) —
   the one piece of existing "reusable" data that's currently wrong for the
   new coordinate system.
2. ✅ **Define the contract** (Part D) with your brother — resolve the open items
   before building against it. *(Draft in `contract.ts`; still pending his
   sign-off — see Part F.)*
3. ✅ **Set up environment config** for the API base URL (and future auth token),
   plus a mock/real switch — nothing about the base URL hardcoded anywhere,
   per the hosting plan (Part B).
4. ✅ **Write the Zod schema** matching Part D exactly, and the typed API client
   that validates every response through it before returning data to any
   component.
5. ✅ **Mock the backend with MSW**, implementing the agreed contract with
   *today's real stories* (SAMARTH/PRAG/NIFT/PM_VISIT/UPI/RBI/etc.) as fixture
   data — proves the frontend against realistic content before his backend
   exists, and swapping to the real backend later is a config change, not a
   rewrite. Include more than one fixture `IssueResponse` — at minimum a
   1-page day, today's real 2-page day, and a synthetic 4+ page day — so
   "page count is backend-driven" (Part A) is actually exercised, not just
   asserted. *(`ONE_PAGE_ISSUE`/`TWO_PAGE_ISSUE`/`FOUR_PAGE_ISSUE` in
   `fixtures.ts`, switchable via `MOCK_FIXTURE`.)*
6. ✅ **Build the coordinate/typography layer**: given a box (px) and article
   text, produce correctly-fit, correctly-calibrated Gujarati typography —
   port `layout_lib.py`'s fitting logic (proven, don't rebuild from scratch)
   to work from a `(width, height)` box instead of a `template.json` frame ID.
   *(Website side: `fonts.ts`'s `ARTICLE_FONT_ROLES`/`calibratedFontSize()`.
   PDF side: `build_issue_pdf.py`'s `article_frame()`/`render_article()`,
   reusing `layout_lib.py`'s `flow_gujarati_text()` directly rather than a
   re-port — one real engine, not two.)*
7. ✅ **Build the website render path**: a Next.js page that fetches
   `IssueResponse` and renders **one page component, invoked once per entry
   in `pages`** (grouping `articles` by their own `page` field) — not one
   file per page number. Positions each article via its px coordinates,
   renders masthead/chrome from `chrome.ts` + `gridSpec.ts` + `header_spec.json`
   on every page the loop produces. *(`NewspaperPage.tsx` + `Masthead.tsx` +
   `ArticleCard.tsx`, looped from `page.tsx`. Verified in-browser: real
   Gujarati content, photos, ad placeholder, correct 2-page grouping. Found
   and fixed a real bug in the process — `fonts.ts` was building an invalid
   `var(...)` reference from `next/font/local`'s class-name `.variable`
   instead of the CSS property name it registers, so every article/masthead
   text was silently falling back to inherited Arial with no console error.)*
8. ✅ **Build the PDF-generation path**: same data, same fitting logic, same
   per-page loop (not per-page scripts), output via WeasyPrint (reusing
   `layout_lib.py` directly). Runs as a Python service inside this
   (frontend-side) codebase's own future hosting, called with the same
   already-fetched-and-validated data — not the backend's responsibility
   (Part B). *(`scripts/build_issue_pdf.py`, invoked via the new
   `GET /api/issue` route — this app calling its own `fetchIssue()` over
   HTTP so the Python side never has to know about MSW/mock-vs-live — and
   wired to the website's "Download print-ready PDF" button via
   `GET /api/pdf`, which shells out to the script and streams the result.
   The masthead is a real vector copy straight out of the source PDF
   (`show_pdf_page` with a clip rect at native (196) coordinates, the same
   technique the archived `build_header_v2.py` used against the old
   canonical page) rather than a redrawn approximation — more faithful than
   the website's CSS masthead, and simpler now that source and target share
   one coordinate space. Verified end to end against the 2-page mock fixture
   producing a real print-quality PDF; a handful of mock-data boxes are too
   small for their real content and get flagged in a `warnings` report
   rather than silently clipped or crashing the whole build — expected,
   since fixture box sizes are illustrative, not hand-measured.)*
9. **Build the QA + approval gate**: pairwise overlap check + "does this
   article's text actually fit its given box" check, generalized rather than
   tied to frame IDs (the same techniques already proven this session, direct
   PDF measurement, not guesswork) — surfaced in a review UI (successor to
   the old `/review`) where a human confirms the result before it's marked
   final. See Part G for where approval state lives. *(Not started —
   `build_issue_pdf.py`'s per-piece `warnings` list is a first-draft version
   of the "does it fit" half of this; no overlap check or approval-state
   storage yet.)*
10. **Swap MSW for the real backend** once available; the build plan's whole
    point is that step 10 should be uneventful.

---

## Part F — Open questions for you (or your brother) still outstanding

- Confirm 300 DPI with your brother directly — this was a working answer, not
  necessarily his final implementation.
- `bodyText` shape (blob vs. paragraphs) — affects how the fitting/threading
  logic should split text.
- Does an "open slot" (no story for this box today) exist as a real concept
  in his data model, or does the frontend only ever receive filled articles?
- Auth: once real hosting exists, what does the frontend authenticate to the
  backend with (API key, bearer token, none)? Not needed for the mocked
  phase, but the env-config step (Part E.3) should leave a place for it.
- What actually distinguishes `type: "news"` from `type: "article"` --
  different rendering treatment (e.g. a lead-story banner vs. a smaller
  brief), different QA rules, or purely an editorial/backend-internal
  label the frontend doesn't need to branch on? Confirmed as a real,
  always-present field; not yet confirmed what it should change here.
- For `type: "ad"` placements, are `title`/`kicker`/`bodyText` meaningful
  (e.g. ad copy) or always empty with only `photoUrl` (the ad creative)
  populated? Assumed the latter in fixtures.ts for now (title/bodyText: "").

**Operational note, not a contract issue**: Turbopack's dev-server hot reload
does not reliably re-run `instrumentation.ts`'s one-time MSW `listen()` after
editing files it depends on (`mocks/*.ts`) -- a stale module can silently stop
intercepting and real `fetch()` calls escape to the network instead (caught
directly: a real `ENOTFOUND mock-backend.local` error, not assumed). Restart
`next dev` after editing anything under `src/mocks/` rather than trusting HMR.

---

## Part G — Finalized technology stack

| Concern | Choice | Why |
|---|---|---|
| Website rendering | Next.js (App Router) + React + TypeScript | Already this project's frontend; Server Components can fetch+validate server-side before render. |
| API mocking | MSW (Mock Service Worker) | Intercepts the same fetch calls the real client will make — swapping to the real backend later changes config, not code. |
| Contract validation | Zod | One schema definition doubles as the TypeScript type and the runtime validator — a contract mismatch fails loudly, immediately, with a clear message. |
| Typography + layout fitting | `scripts/layout_lib.py` (kept from this session), ported/reused for box-based fitting instead of frame-ID lookups | Already proven this session for calibrated Gujarati text; no reason to rebuild it. |
| PDF generation | WeasyPrint, driven by `layout_lib.py`, run as a Python service this codebase owns | Confirmed frontend's responsibility (Part B); reuses the exact pipeline already proven to produce correct Gujarati typography. |
| Chrome/masthead rendering | `chrome.ts`, `gridSpec.ts`, `header_spec.json`, `calibration_ratios.json` (kept from this session) | Already measured directly off the real newspaper; frontend-owned per Part B. |
| Approval-gate state | A small local store (JSON file or SQLite) tracking which issue/run has been human-approved | Lightweight and appropriate while everything is local/mocked; revisit once real hosting (Part B) is set up — this is intentionally the one piece of this stack likely to change shape later, flagged rather than over-built now. |
| Env config | `.env.local`-style config for API base URL + future auth token, mock/real switch | Backend and frontend will each be hosted separately later with a direct connector (Part B) — the base URL must never be hardcoded, even now. |
