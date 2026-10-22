# Handoff: the October 2026 cloud session, and how to carry on from your Mac

This file records everything one long Claude Code **cloud** session did to this
project: what was wrong, what changed, how it's run now, and what's left.
It's written for the next Claude session, the one running **on your Mac** (the
Claude Desktop app's Code tab, `claude` in Terminal, or Remote Control).

> **Read this first, then `README.md`.** The README is the full technical
> manual; this file is the story of what changed and the day-to-day routine.

---

## 1. Why the work moves to your Mac

The cloud container this session ran in **cannot reach**:
- the licensed **Gopika fonts** (`publications/capital-kranti/fonts/*.ttf`: on the Mac only, never in git);
- the **database** (`backend/data/capital-kranti.sqlite`: releases, stories, built issues, AI caches);
- `backend/.env` (the **OpenRouter key**);
- **your Chrome**, needed to read gujaratinformation.gujarat.gov.in like a person;
- most outside websites, including the Vercel site.

So in the cloud, every real build had to be pasted back and forth. On the Mac,
Claude can do it all directly: read releases, build, check the pages, publish.

---

## 2. Where things stand

| | |
|---|---|
| Website | Vercel project `web`, `BACKEND_API_MODE=static`; shows what's published in `web/public/issues/` |
| Published | **Issue 270, 21 Oct 2026, v46: READY**, all gates pass |
| Database (Mac) | Only 2026-10-21 so far (25 releases, 23 stories) |
| Next | Issue 269 (20 Oct 2026): needs its releases read in first (section 6) |
| All code | Merged to `main` (pull requests #1–#9) |

---

## 3. What was done, in order

### 3.1 Deployment (PRs #1)
- Checked hosting options: the backend needs Chromium, a persistent disk and a long-running process, so it **can't run on Vercel**. Render (paid) was prepared but **not used** (no budget).
- **Free setup chosen:** build on the Mac, publish the finished files to the website.
  - `cli.ts publish --date D [--push] [--force] [--keep N]` (`backend/src/publish.ts`): page JPEGs, the PDF and a small `issue.json` go into `web/public/issues/<date>/`, plus `index.json`; with `--push` it commits and pushes, and Vercel redeploys. It refuses a NOT READY issue unless you pass `--force`, and keeps 14 days.
  - Website static mode (`web/src/lib/published.ts`, `web/src/app/page.tsx`): shows the published pages, a PDF download and date links.
  - Also ready for later (unused): `Dockerfile`, `DATA_DIR`, `HOST`/`PORT`, `BACKEND_API_TOKEN` on POSTs, `/healthz`.

### 3.2 Diagnosis of the unpolished issue
Issue 270 v40 (published early) looked loose. It was measured line by line
against the 8 August reference PDF (pdfminer):

| Problem | Cause |
|---|---|
| Holes and rivers between words | Greedy line breaking, and the browser put all the slack into word gaps |
| Ragged, small headlines | Display lines left-aligned unless 96% full; size scale too small |
| Weak kickers and decks | Sized from small headlines, left-aligned |
| Grey wall of text (620 body lines on p1, against 300 in the original) | Gaps closed by lengthening text, not display |
| Holes beside ads, yet "READY" | The gap check only looked straight down under each story |
| Uneven column ends | Leftover lines all came off the last column |
| Placeholder-looking house-ad box | Last-resort ruled box sized to any gap |
| Western digits mixed in | ASCII digits printed in the Latin font |
| One-column stories with 5-line headlines | Allowed for every rank |
| Ads fixed at their 8 August positions | Coordinates copied from that issue |

### 3.3 The fixes (PRs #2–#8): the layout engine now
- **Body text** (`backend/src/layout/linebreak.ts`): Knuth–Plass total-fit line breaking. A line's slack is spread over word spacing (70–200%), letter spacing (−0.02 to +0.06 em) and a 97–102% glyph scale. Each line is its own element at its exact width (`compose.ts` `columnElements`); the browser never justifies. Contract fields `wordSpacing` and `nowrap` were added, and the plotter probe now reports `line-fit`.
- **Display type** (`backend/src/layout/display.ts`): headlines, kickers and decks are fitted to the full width (hScale 0.86–1.2 plus letter spacing), at the largest size allowed, on a tight fixed pitch.
  - **Every kicker is centred.**
  - Decks are set like a short paragraph: every line full, the last one natural.
  - Leads prefer two big lines.
- **Story structure:** every story is **headline > sub-heading (deck) > body**, enforced as headline ≥ 1.25× deck and deck ≥ 1.15× body (headline min 21pt, deck min 15.6pt). Missing decks come from the release's sub-heading, or the AI writes one (`rewrite.ts` `writeDeck`, cached); the rewrite prompt always asks for one.
- **Larger type scale** (`publications/capital-kranti/profile.json`):
  - caps 22–72pt by column span;
  - rank scale 1 / .78 / .62 / .5 / .42;
  - leading 1.12;
  - kicker 0.6× and deck 0.45× the headline.
- **Text normalisation** (`layout/text.ts`): numbers print in Gujarati digits, while English ones like "ATM 2026" or "COVID-19" stay Latin; phone numbers are kept whole.
- **White space** (`layout/occupancy.ts`): a whitespace map of the finished page (each story's rectangle, fillers and ads on a columns × 2pt grid). Gate 2 uses it, and the gap closer (`fit.ts`) fills every hole with, in order:
  - a left-out story;
  - an AI brief (60, 40 or 25 words);
  - the house ad;
  - a public-service message panel (`fillers.messages`).

  There is **at most 1 message and 1 house ad per issue** (`fillers.maxMessages`, `maxHouseAds`).
- **Density by display first:** a landscape photo goes full width before any text is lengthened.
- **Columns** end at most one line apart (`module.ts` `balance()`); text under a photo stays on the baseline grid.
- **Ads** (`layout/ads.ts`): stand-in ads are modules snapped to the column grid at the foot of the page. A booking can still pin a position.
- **Packer** (`layout/pack.ts`):
  - the page budget is a preference, but a page may take more copy only while later pages keep enough;
  - costs for tombstones, out-of-order headline sizes, headlines that can't fill their width, and stories straddling columns of different depth;
  - no one-column headlines except briefs.
- **Tombstones** (side-by-side, level, same-size headlines) are resolved on the finished layout (`fit.ts` `detombstone()`). In order:
  1. the lesser headline ≤ 0.82× its neighbour's;
  2. else the greater one larger, with shorter text;
  3. else a hairline **column rule** in the gutter.
- **AI calls** (`rewrite.ts` `openRouter()`) time out after 90s; the build prints each step as it happens.
- **Gate 7** (`backend/src/fingerprint.ts`) compares only builds with the same inputs and engine code. A code change no longer fails it.

### 3.4 New quality gates (`backend/src/layout/style.ts`)
The issue is READY only if gates 1–7 and these all pass:
- **S1** body spacing: extra word space p95 ≤ 0.5 em, at most 3% loose lines;
- **S2** every display line fills its width;
- **S4** columns end level;
- **S5** fillers under 12% of a page (otherwise the day is short of copy);
- **S6** Gujarati digits;
- **S7** headline > sub-heading > body.

Issue 270 v46: S1 extra word space p50 0.04em, p95 0.22em, 0.5% loose lines; 22/22 stories placed; 0 gaps; 1 message panel; 4 column rules.

### 3.5 Testing tools
- `backend/test/pack-0808.ts`: the whole engine without the licensed fonts, using the free-font profile `publications/dev-test` (regenerate it with `python3 scripts/dev_profile.py` after changing the real profile).
  - `CK_FAKE_AI=1` stands in for the model (`rewrite.ts` `fakeFit`).
  - Must exit 0 on 2 pages (`TEST_PAGES=2`, the default).
  ```
  CK_PUBLICATION=dev-test DATA_DIR=/tmp/ck-test node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/pack-0808.ts
  ```
- `python3 scripts/replica/style_stats.py <issue.pdf>`: word gaps, letter spacing, display fill, headline sizes and body lines per page, from any PDF. The 8 August reference: word gap p50 4.5 / p90 6.7pt; display lines 96–100% full.
- `backend/test/gaps.mts <date>`: lists a build's empty stretches.

### 3.6 Getting news in (PR #9)
- `cli.ts ingest` (automatic) is **blocked**: the government site refuses automated browsers. The project's decision is **not to get around this**.
- `cli.ts status`: every day in the database, with its releases, stories and latest build.
- **Release reader bookmark:** `http://localhost:4000/reader` (with `cli.ts serve` running) gives a "Send to Capital Kranti" bookmark. On a release page it reads the headline, sub-heading, date line, paragraphs and photos (photos ≤ 1800px), stores them through `/ingest`, and offers to open the previous release. One page at a time.
- **On the Mac, Claude can do this through your own Chrome** (Claude in Chrome, or the Browser Use plugin in "your Chrome" mode). Use only your own browser: never a cloud browser or an "unblocker" service.

---

## 4. Daily routine (on the Mac)

```bash
cd ~/NewsPaper_Project
git pull origin main
B="node --experimental-strip-types --experimental-sqlite --no-warnings backend/src/cli.ts"

# 1. backend running (for the reader / ingest hand-off)
lsof -ti :4000 | xargs kill; $B serve &

# 2. get the day's releases in (Claude through Chrome, or the bookmark): see section 6
$B status

# 3. stories, layout, checks
$B rewrite --date 2026-10-20
$B build   --date 2026-10-20     # read the gate table at the end

# 4. publish (only when READY)
$B publish --date 2026-10-20 --push
```

- The first build of a day makes the AI calls: a few cents and a few minutes. Rebuilds reuse the cache.
- Aim for about 20 releases a day for 4 pages. Fewer, and gate 2 or S5 says the day is short of copy: add releases, or build fewer pages with `--pages`.
- Issue numbers come from the date (2026-10-21 = 270, 2026-10-20 = 269).

---

## 5. Rules and decisions (don't re-litigate)

- **Don't get around the government site's bot block.** Read pages like a person, through your own browser, or use email or official access.
- **Never commit** `backend/.env` or `backend/data/`. The repo is public. (The Gopika fonts *are* committed: the paper confirmed it's fine, 22 Oct 2026. Fonts copied from a computer's system folder for a test are not.)
- **No Anthropic models** for the paper's AI (cost); it uses OpenRouter (GPT-6 Luna, Gemini 3.8 Flash).
- **At most one slogan panel and one house ad per issue.** Fill space with stories.
- **Every story is headline, sub-heading, body,** in decreasing sizes. **Kickers are centred.**
- Take inspiration from the 8 August paper, but don't copy its grid or positions. Pages should be dense.
- The backend decides all layout; the website only shows it.
- Work on a branch and merge through a pull request. `publish --push` pushes to `main` directly, which is what Vercel deploys.

---

## 6. What's next

1. **Issue 269 (20 Oct 2026).** Read its releases (ids just below 55011, back to 19 October), then rewrite, build and publish. Paste-ready task:
   > Stay on `main`. Start the backend (`lsof -ti :4000 | xargs kill`, then `cli.ts serve` in the background). Using my Chrome, open `https://gujaratinformation.gujarat.gov.in/PressReleaseDetails/?id=<n>&LanguageId=2` one page at a time from id 55010 downwards, wait for the text, and keep the releases whose `.ReleaseDateSubHeaddateTime` says OCT 20 2026. Stop after about 12 earlier-dated pages in a row. Send each one as the bookmark at http://localhost:4000/reader does (`/ingest#<url-encoded JSON>` with `id, url, dateLine, headline, subhead, paras, photos`). If the site blocks the browser, stop. Then `status`, `rewrite`, `build --date 2026-10-20`, and `publish --push` if READY.
2. **Automatic news**, in order of preference:
   - **Email inbox ingest** (README 15.2): a dedicated releases inbox that the information offices email or auto-forward to, read over IMAP with an app password in `backend/.env`. `runDay()` already calls `ingestInbox(store, date, {log})`; build `backend/src/ingest/inbox.ts`.
   - Ask the Information Department for an allow-list or an official feed.
   - PIB RSS for extra (national) copy.
   - A paid Gujarati news wire.
3. The rest of the README's roadmap (15.1, 15.3–15.9): AI editorial plan, editor screen, a second paper, onboarding, Urdu, SVG export, print preflight, clean-up (`backend/test/recompose-0808.ts` is stale, the `compose()` box filler is dead code).
4. **Worth checking by eye** on new issues:
   - vowel signs in letter-spaced body lines (Gopika is a legacy font; spacing applies per glyph code);
   - the look of the column rules;
   - the message panel.


---

## The newsroom (22 Oct 2026, branch `newsroom`)

What changed, so a later session can carry on:
- **News is PIB** (`backend/src/ingest/pib.ts`): PIB Ahmedabad's Gujarati releases, topped up with PIB Delhi's Hindi translated into Gujarati (`editorial/translate.ts`) until the pages are full. The state site stays off (PIB only, the user's choice).
- **One pipeline** (`backend/src/pipeline.ts`) is what the 8 PM run, the newsroom's Run now and `cli.ts all` do; every run is a job with a live log (`/api/events`) and can be retried from a failed step.
- **The newsroom** (`web/src/app/newsroom/`) runs on the paper's own computer only (`NEWSROOM=1`): Today, News, Stories (edit, rank, photo, drop/restore, Hindi original alongside), Pages (click a story to edit), Ads (book with size and days), Papers (add a newspaper from its PDFs), Settings (run time, OpenRouter key into `backend/.env`).
- **Apps:** `windows/` and `mac/` installers, both over `scripts/launch.mjs`; CI builds and runs them on Windows and macOS (`.github/workflows/apps.yml`).
- **New gates:** F (every printed letter in its own font, `fonts/cmap.ts`) and P (print preflight, `export/preflight.ts`). The 8 August test, `sample-english` and the extractor test (`test/extract-0808.ts`) must stay green.
- **Other papers:** profiles in `publications/<id>/` (from the Papers screen: `onboard/extract.ts`, `onboard/save.ts`), each built in its own process and data folder `papers/<id>/`. `sample-urdu` proves right to left.
- **Keep:** never two engines on one database (stop with `launch.mjs --stop`, which forces a stuck one); `publish` pushes the current branch, so publish from `main`.
