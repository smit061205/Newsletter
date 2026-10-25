# The Capital Kranti website (`site/`)

The paper's website: the plan is [docs/website/ROADMAP.md](../docs/website/ROADMAP.md),
the look [docs/website/DESIGN.md](../docs/website/DESIGN.md). Next.js 16 (read
`node_modules/next/dist/docs` before changing Next code: it differs from what you
know), with its own installs: it is not in the root workspaces, so the desktop
app never carries it.

## Where things run (free plans, ROADMAP §1.1)

| What | Where | Keys |
|---|---|---|
| The site | Vercel project `capital-kranti` (root directory `site/`) | `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` (from its Storage tab), `CK_PUBLISH_KEY` (made by the user) |
| Stories, issues, runs | Neon Postgres `capital-kranti-db` | |
| Photos, e-paper pages and PDFs | Vercel Blob `capital-kranti-photos` | |
| The hourly run | GitHub Actions `site-run.yml` | repository secrets `DATABASE_URL`, `OPENROUTER_API_KEY` |
| Loading 20-22 Oct | GitHub Actions `site-seed.yml` (once) | `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` |

## How a day gets onto the site

1. The newsroom's **Publish** (`backend/src/publish-site.ts`) sends each story's photo and
   the e-paper's pages and PDF to `/api/publish/file`, then the day's stories to
   `/api/publish`, with the website key (`CK_SITE_KEY` in the app = `CK_PUBLISH_KEY` here).
2. The site saves them (`lib/write.ts`) and renews its pages at once.
3. The hourly run (`pipeline/run.ts`) gives each new story its section and English
   version with a free model from the paper's profile (`website.freeModels`), numbers
   checked against the Gujarati, then asks `/api/refresh` to renew the pages.

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

`lib/` is the data and words, `components/` the design system's parts, `views/` the
pages, and `app/` the routes: Gujarati at the root (`app/(gu)`), English under `/en`
(`app/(en)/en`), each a thin file over the same view.
