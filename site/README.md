# The Capital Kranti website (`site/`)

The paper's website: the plan is [docs/website/ROADMAP.md](../docs/website/ROADMAP.md),
the look [docs/website/DESIGN.md](../docs/website/DESIGN.md). Next.js 16 (read
`node_modules/next/dist/docs` before changing Next code: it differs from what you
know), with its own installs: it is not in the root workspaces, so the desktop
app never carries it.

## Where things run (free plans, ROADMAP §1.1)

| What | Where | Keys |
|---|---|---|
| The site | Vercel project `capital-kranti` (root directory `site/`) | `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` (from its Storage tab) |
| Stories, issues, runs | Neon Postgres `capital-kranti-db` | |
| Photos, e-paper pages and PDFs | Vercel Blob `capital-kranti-photos` (a **private** store: the site serves its files itself at `/media/…`, cached for a year by the CDN) | |
| The hourly run | GitHub Actions `site-run.yml` | repository secrets `DATABASE_URL`, `OPENROUTER_API_KEY` |
| Loading 20-22 Oct | GitHub Actions `site-seed.yml` (once) | `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` |
| **The news engine** (every 15 min) | GitHub Actions `site-engine.yml` (`engine/run.ts`) | `DATABASE_URL`, `OPENROUTER_API_KEY`, `BLOB_READ_WRITE_TOKEN`; for approvals `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`. Each run queues the next itself; between rounds `engine/listen.ts` answers the bot within seconds: `/start` replies with that chat's number, the one to put in `TELEGRAM_CHAT_IDS` |
| The engine's checks and dry run | GitHub Actions `site-engine-try.yml` (on every engine change, any branch) | `OPENROUTER_API_KEY` (stores nothing) |
| **The editor's page** (`/editor`: approve or reject held stories and Aavtikal drafts; search, change, take off and put back any story or article; the engine's stop switch, the day's use; linked from both menus) | the site (`lib/editor.ts`, `app/(gu)/editor`), Google sign-in | Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (a Google Cloud OAuth client, redirect `https://capital-kranti.vercel.app/api/editor/callback`), `CK_EDITORS` (the allowed Google addresses, comma-separated), `CK_SESSION_SECRET` (32+ random characters) |
| **The editor's own news** (`/editor/write`: headline, sub-heading, story, where it's from and its topic, photos from the phone made smaller in the browser and kept in the photo store, the first the main photo and the rest spread through the story; on the site at once, word for word, at the top of the home page; the engine adds its English and Hindi; optional AI help that corrects spelling and suggests a headline, undone with one button and never changing a number; the unfinished words kept on the phone) | the site (`app/(gu)/editor/Write.tsx`, `app/api/editor/photo`, `lib/aihelp.ts`) | Vercel: `GOOGLE_AI_KEY` for the AI help only (the same key as the engine's GitHub secret); without it the button says AI help isn't switched on |
| **The editor's own Aavtikal articles** (`/editor/write?for=aavtikal`, the same page: its section (AI, Tech, Science, Politics) instead of where it's from, `## ` for sub-headings, the first photo leading it and the others placed between paragraphs as pictures; in Aavtikal at once under the editor's name, word for word; the desk adds its English and Hindi at the start of its next round and never rewrites it) | the site (`lib/editor.ts` `addFeature`, `engine/desk.ts`) | as above |
| **Aavtikal's desk** (deep explainers for AI, Tech and Science, never Politics: 10 a day, more on the days `lib/config.ts` names; 1,200–1,800 words for a smaller development, up to 3,500 for a big one; a photo on every article (every picture first looked at by Gemini Flash Lite, `engine/cover.ts`: the top one must show the subject itself, sharp, 1,600 px wide or more (an official one 1,200), shown 1,920 wide; pictures that don't belong are never used; with no true picture, a cover drawn in Aavtikal's look with the subject's name, `engine/drawn.ts`; the published articles' pictures looked at again the same way, ten minutes a round), and 4 to 8 graphs, tables, step diagrams and pictures (Flash Lite adds more when the writer gave too few), drawn by the site from the sources' own numbers, `[[fig N]]` in the body; the companies' own pictures, credited, or free-licence ones from Wikimedia Commons (shown from Wikimedia's servers, no uploads); ten published every day without fail (held ones do not count; when the news has no subject worth it, a lasting subject from Wikipedia); a subject already written about is never written again; the older articles (not Politics) written again to this standard, each replaced only when it checks out; published by itself when every number and claim checks out, else held for the editor) | `engine/desk.ts`, `.github/workflows/site-desk.yml` (its own job, a keeper like the engine's) | GitHub: `GOOGLE_AI_KEY` (Gemini Flash writes: 20 free requests a day for each Flash, 3.8, then 3.6, then 3 when both are busy, `WEBSITE.gemini`; Flash Lite translates, 500 a day; Gemma picks and checks), and the engine's |
| The editor's Telegram buttons, instantly (optional) | `/api/telegram` on the site | Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`, `TELEGRAM_WEBHOOK_SECRET` (else the engine collects the presses and messages, within seconds while it runs) |

## How a day gets onto the site

**The app is not changed for the website** (the user's rule, 25 Oct): work stays in
`site/` and the website's own workflows. The engine's code is only *read* (the
hourly run borrows its number check, `backend/src/editorial/rewrite.ts`).

1. Stories come in through the website's own runs: for now the days published before
   it existed (`pipeline/seed.ts`, from `pipeline/seed/<date>.json`); next, the site
   collecting PIB itself on GitHub (PIB answers GitHub's servers: `/api/status`).
   `/api/publish` and `/api/publish/file` take a day with the publish key
   (`CK_PUBLISH_KEY`), but nothing sends to them yet.
2. The site saves them (`lib/write.ts`) and renews its pages (`/api/refresh`).
3. The hourly run (`pipeline/run.ts`) gives each new story its section and English
   version with a free model (`lib/config.ts`), numbers checked against the Gujarati,
   then asks `/api/refresh` to renew the pages.

The free plans' ceilings are kept by the code: at most `CK_DAILY_UPLOADS` (50) uploads a
day, 900 free AI requests a day, pages kept ready and renewed only when something changed.
`/api/status` shows the hourly runs (how late GitHub started them, whether PIB answered),
today's use, and stories waiting for their English.

## The news engine (`engine/`, ROADMAP §0.1 and §3)

Every 15 minutes (`run.ts`), with **free OpenRouter models only** (₹0; `ai.ts` asks
OpenRouter which free models exist, the ones named in `lib/config.ts` first, and
sets a busy one aside for 10 minutes rather than retrying it):

1. **Watch** (`collect.ts`, `sources.ts`): 126 sources by their RSS/Atom feeds, PIB by
   its lists (the app's parsers, read-only). Politely: robots.txt, a pause per site,
   "nothing new" by ETag. A source that refuses us (401/403/451/robots) is switched off,
   never worked around; `probe.ts` checks them all from GitHub.
2. **Triage** (`triage.ts`): new items 40 to a request: importance 0-10 for our readers,
   tier, genres, sensitive or not, one English line and keywords. The keywords group
   items about one event into a cluster, across Gujarati, Hindi and English.
3. **Genuine?** (`newsroom.ts`, `gate`): fresh (not old news recirculating), not debunked
   by a fact-checker, and from an official source or two independent outlets (two of one
   owner count once). Otherwise it waits up to 6 hours for a second source, then drops.
4. **Write** (`newsroom.ts`): the most important confirmed events first, in Gujarati, its
   length by importance (lead/top 300-450 words, normal 150-250, brief 60-100), from the
   sources' facts only. Checked: numbers by code (`numbersNotIn`), no sentence twice, no
   copied wording, then every claim by a **different** free model. One rewrite naming
   the problems; national and world stories get English and Hindi (numbers checked).
5. **Publish** (`publish.ts`): live at once; **held** for the editor when sensitive or a
   check failed, sent to Telegram with ✅/❌ (`lib/telegram.ts`). Photos from official
   sources; when there's none, a file photo of the story's subject (a public figure, place
   or thing) from Wikimedia Commons, free licence only, credited (`engine/wikiphoto.ts`);
   the outlets' photos are never copied. Each run renews the pages.
6. **Watch after**: for 24 hours, a source correcting or withdrawing takes the story down
   (held) and tells the editor; new sources are added to its source box.

`try.ts` does all of it on real news and prints the stories, storing nothing;
`selftest.ts` checks the pure parts (feeds, the gate, grouping, copy detection).

## Working on it

```bash
npm install --prefix site
CK_SAMPLE=1 npm run dev --prefix site     # http://localhost:3200, with 22 Oct's stories (no keys needed)
node site/test/a11y.mjs http://localhost:3200     # the accessibility check CI runs (WCAG 2 AA; serious problems fail it)
npm run build --prefix site               # what Vercel and site.yml run
npx --prefix site tsc -p site/engine      # the engine's typecheck (it's outside the Next build)
node --experimental-strip-types site/engine/selftest.ts
node site/tools/icons.mjs                 # redraws the icon in every size (public/icon*.png, favicon*)
OPENROUTER_API_KEY=... node --experimental-strip-types site/engine/try.ts 3   # a dry run on real news
```

**Claude Code on the website: open it in this `site/` folder**, not the repository's
top. Then `site/.claude/settings.json` applies: its hook (`.claude/hooks/guard.mjs`)
refuses any edit or writing command outside `site/`, `docs/website/`, the
`site*.yml` workflows and the shared notes (`CLAUDE.md`, `HANDOFF.md`), and git
commands that sweep the whole repository (`git add -A`, `git commit -a`, `git stash`,
`git reset --hard`; use `git add .` here). A session opened at the top folder (the
app's) never loads it. Best in its own copy of the repository, so it never shares
a working folder with an app session: `git worktree add ../NewsPaper_Site main`
once, then open `NewsPaper_Site/site`. On GitHub, `site-guard.yml` fails any commit
that changes the website and the app together, and any website branch (`site/…`,
`site-…`) that changes the app.

`lib/` is the data and words, `components/` the design system's parts, `views/` the
pages, and `app/` the routes: Gujarati at the root (`app/(gu)`), English under `/en`
(`app/(en)/en`) and Hindi under `/hi` (`app/(hi)/hi`), each a thin file over the same view.
A first visit opens in the reader's language by where they are (`proxy.ts`, from Vercel's
location headers): Gujarat in Gujarati, the rest of India in Hindi, the rest of the world in
English. A language the reader picks is kept for a year (`ck_lang`, `components/LangLink.tsx`)
and wins after that; search engines and link previews are never moved.
