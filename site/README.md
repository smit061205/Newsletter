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

## Working on it

```bash
npm install --prefix site
CK_SAMPLE=1 npm run dev --prefix site     # http://localhost:3200, with 22 Oct's stories (no keys needed)
npm run build --prefix site               # what Vercel and site.yml run
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
(`app/(en)/en`), each a thin file over the same view.
