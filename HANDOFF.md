# Handoff: where Capital Kranti stands, and what's next

Written 23 October 2026 for the next Claude Code session (a new account, with
none of the earlier conversations); brought up to date on 24 October 2026.
**Starting the website? Go to §8 first.** **Read `CLAUDE.md` first** (the standing
rules), then this file (the story and the open work), then `README.md` (the
technical manual) as needed.

---

## 1. What this is

An engine that makes a whole daily newspaper by itself, plus the tools the
editor uses. The first paper is **કેપિટલ ક્રાંતિ (Capital Kranti)**, a Gujarati
daily from Gandhinagar, 4 pages of 390 × 525 mm. The editor is the user's
father: **not technical**, works every evening, on a **Windows PC**. The user
(the developer) works on a Mac.

Every evening at 8 PM (India time) the engine:
1. reads the day's press releases from **PIB**: PIB Ahmedabad's Gujarati ones first, then PIB Delhi's Hindi ones translated into Gujarati when the Gujarati ones don't fill the pages;
2. has an AI (through OpenRouter) rewrite them as newspaper stories;
3. lays out every page itself, measuring real text in Chromium, in the paper's own Bharati Gopika fonts;
4. runs the release checks ("gates");
5. makes a print-ready PDF and page images.

The editor then looks it over in the **newsroom**, fixes anything, and presses **Publish** (the website) and **Print PDF** (the printer).

Repository: <https://github.com/smit061205/Newsletter> (**public**). Branch `main` is current; `redesign` holds the same commits.

---

## 2. The pieces

| Part | Where | Notes |
|---|---|---|
| Engine (backend) | `backend/src/` | Node 22 runs the TypeScript directly (`--experimental-strip-types --experimental-sqlite`); SQLite store; HTTP API on 127.0.0.1:4000 (`server.ts`) |
| Shared code | `shared/src/` | The render contract, the plotter (`plot.ts`) and the PDF writer (`pdf.ts`), used by the engine and the website |
| Paper profiles | `publications/<id>/` | One paper = one folder: `profile.json` (grid, type, fonts, AI models, rules) and `chrome.json` (masthead, headers, footer, foot rule, stand-in ads). Capital Kranti, `dev-test` (free fonts, for CI), `sample-english`, `sample-urdu` |
| Newsroom | `web/src/app/newsroom/` | Next.js 16 (**read `web/node_modules/next/dist/docs` before changing Next code: it differs from what you know**). Only exists where `NEWSROOM=1`. Port 3000 |
| Public website | `web/src/app/page.tsx` | On Vercel (project `web`, `BACKEND_API_MODE=static`); shows what's published in `web/public/issues/` |
| Desktop app | `desktop/` | Electron: runs the engine and the newsroom in its own Node, window, tray, notifications, updates, uninstall. **Installers built by GitHub Actions** (`.github/workflows/release.yml`) |
| Old script installers | `windows/`, `mac/`, `scripts/launch.mjs` | Superseded by the desktop app; kept for development. The desktop app moves an old install into itself on first open |
| CI | `.github/workflows/apps.yml` | Every push: engine typecheck, PIB parser, layout tests (must stay READY), newsroom build, start/stop. Green as of 23 Oct |

---

## 3. History, briefly

1. **The layout engine** (to 21 Oct): Knuth–Plass body text, display type fitted to width, a whitespace map so nothing is left empty, column balancing, ads on the grid, tombstone avoidance, and the gates (1–7, S1–S7). README §8 and §10 describe them.
2. **Layout fixes from the paper's feedback** (issues 269–271):
   - columns end level and there's no gap under photos;
   - horizontal rules divide stacked stories and fill odd space;
   - tight spacing between title, sub-title and text;
   - **at most one slogan ("quote") panel per paper**;
   - **"વિશેષ લેખ" (special article) only once per paper**.
3. **News from PIB** (`ingest/pib.ts`, `editorial/translate.ts`): the state government's site blocks bots, and **the project doesn't get around that**.
4. **The newsroom and apps** (merged 22 Oct): one pipeline as jobs, with a live log, retries and the 8 PM run; the newsroom screens; other papers ("Add a newspaper" from PDFs); right-to-left Urdu; CorelDRAW SVG export; print preflight; the AI editorial plan.
5. **The redesign** (22–23 Oct): the newsroom rebuilt for a non-technical editor, with:
   - "Paper & ink" colours, Anek Gujarati + Geist fonts;
   - **Gujarati by default, English switch**;
   - a welcome flow, Today with a live progress loader, Review, Publish sheet, Past issues and Help;
   - the side-panel story editor;
   - the in-app PDF viewer (it never leaves the app);
   - costs shown in **₹** (rate in Settings, ₹88 per US$ by default).

   The engine side added:
   - progress per step;
   - PIB retries every 10 minutes when PIB is down;
   - the release date counted as a known number in the fact check;
   - **gate W:** no full-width story on the front page unless the editor allows it ("Allow full width on the front page" in the story editor; the profile's `grid.frontPageMaxCols`, 7 of 8).
6. **Print geometry** (23 Oct):
   - every page but the last ends at 1469.3pt, with a 2.04pt rule across the grid at ~1473.4pt, as in the original paper;
   - the PDF no longer sits 0.76pt low (it had trimmed Chromium's rounded page at the wrong corner);
   - the "વ્યવસાયિક સમાચાર" logo strip ad is removed.
7. **The desktop app** (23 Oct): `desktop/` plus the release workflow. Getting the first installers out took several rounds; the lessons are in §6.
8. **Fixes and copies** (23 Oct, branch `fixes-and-copies`), from the user's report on the installed app:
   - the date opens a calendar (Gujarati, days with a paper dotted); the hidden native date input never opened;
   - Ads: the sample ads' images loaded from the engine (404: they're the newsroom's own `/chrome/ads/`); Remove was blocked (CORS had no DELETE); a page preview to scale, the height following the image, ads too tall for the page refused, each booking's days shown, and "lay out again" offered when the day's paper exists;
   - Settings: waking the computer is on/off and follows the run time (`ck:cancel-wake`); the rupee rate updates itself daily (Frankfurter/ECB, else open.er-api.com) unless typed in; plain words for an app with no GitHub sign-in yet;
   - **Copies** (`editorial/copies.ts`, the build's copy mode): N copies of the day's paper, reworded by the AI (headline / + sub-heading / + text, numbers checked), laid out afresh (anywhere keeping the lead / anywhere / same page), the masthead, page headers and footer left empty for CorelDRAW, a copy that comes out like another (or with a layout check failing) laid out again; PDFs in `out/copies/<date>/`;
   - **Papers** in the sidebar, in Gujarati/English; the app switches the newsroom to another paper (`ck:switch-paper`: the engine restarted with `CK_PUBLICATION`, its own `DATA_DIR`, the shared key `CK_ENV_FILE` and papers home `CK_PAPERS_HOME`); papers added in the app are saved in its data folder, so updates keep them; a test issue's process gets the engine's own Node flags (inside the app it couldn't find the shared code);
   - **Sister papers** (later on 23 Oct): 3 Gujarati, 1 Hindi, 1 Urdu, from the day's paper, as copies with names (`makeEditions`), made after the evening run (setting `editionsAuto`); Copies take a language. Another language is laid out by a process of its own (`cli.ts copies-in`, the paper `edition-hi`/`edition-ur` in `papers/<id>/`, the day's stories, ads, edits and plan copied in from the main database; `CK_SOURCE_DB`, `CK_MEDIA_DIR`). Measuring fixes that made Hindi fit: Hindi and Urdu text is measured kerned, with its word space measured between real words (Tiro kerns against the space), and never letter-spaced; Gujarati and English measure as before (the CI tests unchanged). Copies never carry the house ad (it names Capital Kranti).
   - **Stop** for the day's run (`pipeline.ts stopJob`: checked at every step of progress, and in PIB's 10-minute waits), copies and sister papers (`copies.ts stopCopies`: their workers and browsers killed). Copies and sister papers are laid out side by side, each in a worker process of its own (`cli.ts copies-in`, a data folder per worker filled from the day's database, the AI's new work merged back), 1-3 at a time by the computer's memory. PIB's "full text of the address" release is folded into its event's story (`speechTwin`; 23 Oct printed both). Briefs are written in the paper's language.
   - **Speed and memory (later on 23 Oct):** one browser for the whole engine (`browser.ts`: a tab per job, closed a minute after the last; copy workers connect to one browser server, `CK_BROWSER_WS`); the gap closer grows a page's stories side by side (`fit.ts grow`, 5 AI fits in flight); the AI is told the exact lines to fill; Hindi top-up translates up to 4 at once, sized to what the pages still need. Every build logs and reports `timing` (planning, fitting with its AI fit count, printing, page review; engine memory). Measured on 22 Oct with the real AI: layout 4.8 min (was 8-11), READY; rounds of fitting barely fell (15/13/13 in rounds 1/2/3) -- the time saved is from running them together. Two copies at once peak ~2.3 GB (each worker's engine ~0.6 GB): 1 copy at a time under 7 GB, 2 under 24 GB, else 3.
   - **PDF for CorelDRAW (23 Oct):** the father's grey/missing text was CorelDRAW importing the print PDF (Chromium writes text glyph by glyph in subset CID fonts). `export/pdf-editable.ts` writes the PDF itself from the render contract, as PageMaker does: simple TrueType fonts embedded whole, WinAnsi (+ Differences for Gopika's 3 other characters), named `BBharatiGopikaTwo[,Bold]`, a text object per line with Tw/Tc/Tz. Checked: Poppler renders it like the print PDF (lines within a fraction of a point); not yet checked in CorelDRAW itself -- ask the father. Copies keep their issue JSON beside the PDF for it.
   - **The father's grey/missing text (23 Oct):** the same Mac-made PDF opens fine in his Chrome and phone; it's his other PDF program (a 20 MB file with 3 MB PNG ads drawn in stages). The user chose not to change the PDF.
   - Publish in the app without a GitHub sign-in says so plainly (it tried `git` and failed); an edit made while another day's run went is laid out once that run ends.

3. **The new layout engine (24 Oct, v1.1.0):** the old engine packed stories, then asked the AI to rewrite them one by one to close each gap -- slow (a copy took 41 min), and it stretched short releases until they said things twice and still left holes. The new one (`layout/engine.ts`, README §8.3) makes every length a story may print at first (`editorial/ladder.ts`: its own three, cut by sentences; longer AI versions only on a short day), shares the stories over the pages, then for each page solves hundreds of guillotine designs exactly in whole points (`designs.ts`, `guillotine.ts`) -- no AI in the loop, no hole by construction. Ads go at the foot in their best tidy arrangement; a strip by an ad no story fits takes a written item (`fill.ts`). The old engine lays out any page the new one can't. New gates S8 (says a thing twice) and S9 (a loose story). Measured on 22 Oct (real AI): the day's paper READY in 3.3 min (1.8 of it the page review), its 4 pages solved in ~10 s; 3 copies READY in 1.5 min, $0.006 in all; the Hindi paper READY in 2.9 min (the old engine's had 14-19 gaps, overflows, repeats). Fixed on the way: Hindi headings were letter-spaced (letter spacing applies to every Devanagari character: lines ran 65-127 px over), the brief writer wrote sister papers' items in Gujarati and shared its cache across papers.

4. **PIB and the run (24 Oct, v1.1.1-v1.1.4):**
   - **What PIB allows programs** (checked 24 Oct, from the same Mac and connection, so it's not an address block):
     - today's list and any single release page: yes;
     - **its date form for earlier days: no.** The firewall drops it, even when the program pretends to be Firefox (tested once).
   - **v1.1.1:** an earlier day is made from its saved releases when PIB won't show it.
   - **v1.1.2:** the engine collects today's Gujarati and Hindi lists every hour while it runs (`collectHourly` in `server.ts`), stores new releases, and saves the lists (`pib-list/<feed>/<date>` in settings). An earlier day uses its saved list.
   - **v1.1.3:** "Start again from the beginning" on Today. It stops the run, then runs from the first step, keeping what was done.
   - **v1.1.4:** a missed day (no saved list) is found **by release number** (`scanDay` in `ingest/pib.ts`):
     - every release in every language takes the next number, and each page says its day and office;
     - it halves the gap to find the day's edge, then reads out both ways, one page a second, until 60 pages are past the day;
     - it saves the Gujarati, Hindi and English lists together;
     - 23 Oct took about 10 minutes (40 Gujarati, 72 Hindi, 74 English);
     - **the edges are ragged** (2327294 is the 23rd, 2327300 the 22nd), hence reading both ways.

     This method came from the user's brother's scraper; it only reads pages PIB serves to programs.

**Published so far:** issues 269–271 (20–22 Oct 2026) on the website. Issue numbers come from the date (22 Oct 2026 = 271).

---

## 4. Running it

```bash
# development (Mac): the engine and the newsroom, each in its own terminal
node --experimental-strip-types --experimental-sqlite --no-warnings backend/src/cli.ts serve --port 4100
NEWSROOM=1 NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:4100 npm run dev --prefix web -- --port 3100
```

- Use ports **4100/3100** for development. **4000/3000 belong to the installed app** on this Mac; don't run a second engine on them, and **never two engines on one database**.
- `.claude/launch.json` already has `engine-dev` and `newsroom` for the preview tools.
- Without `DATA_DIR`, the engine uses the repository's own data: `backend/data/` (database) and `backend/.env` (the OpenRouter key). **Both are git-ignored and must never be committed.**
- The installed app keeps its data in `~/Library/Application Support/Capital Kranti` (Mac) or `%APPDATA%\Capital Kranti` (Windows), with the key in `settings.env` there.
- By hand:
  - `cli.ts all --date D [--from fetch|rewrite|topup|fill|build]`
  - `cli.ts build --date D`
  - `cli.ts publish --date D --push` (from `main`: it pushes the current branch)
  - `cli.ts status`

**Testing a layout change without spending money or touching real issues:** copy the database into a scratch `DATA_DIR`, along with `web/public/media/<date>`. Then:
- `DATA_DIR=<scratch> cli.ts build --date D` runs without AI.
- If the change shortens the page body, the no-AI build can't refit stories and shows gaps. Put a copy of the key in `<scratch>/settings.env` for one rebuild (a few rupees), then delete it.

**The CI layout tests** (they must stay READY):
```bash
CK_PUBLICATION=dev-test DATA_DIR=/tmp/ck-test node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/pack-0808.ts
```

---

## 5. Making a release (the desktop app)

1. Push the code to `main`.
2. Push a new version tag from `main`: `git tag vX.Y.Z && git push origin vX.Y.Z` (from 23 Oct, every finished improvement is released this way; CLAUDE.md).
3. The **release** workflow creates the release and builds three installers and attaches them to it in about 30 minutes:
   - Mac Apple silicon on `macos-14`;
   - Mac Intel on `macos-15-intel`;
   - Windows on `windows-latest`.

The installer names never change, so these links always serve the newest release:
- `…/releases/latest/download/Capital-Kranti-mac-arm64.dmg`
- `…/releases/latest/download/Capital-Kranti-mac-x64.dmg`
- `…/releases/latest/download/Capital-Kranti-Setup.exe`

Installed apps update themselves from Releases:
- **Windows** uses electron-updater (`latest.yml`).
- **Mac** downloads the zip and swaps itself in.

**Build and check a Mac app locally before releasing.** It's the only way to catch packaging problems early:
```bash
npm install --prefix desktop                                # once
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium  # Chromium inside the packages
npm run build --prefix web && node desktop/stage.mjs
cd desktop && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --publish never
codesign --verify --deep --strict "dist/mac-arm64/Capital Kranti.app"
```
Then run the engine from *inside the packed app*, as the workflow's "packed app" step does.

**Never open the packed app itself on the user's Mac without asking:** on first open it moves the user's real old install into itself and changes their Dock.

**State on 23 Oct:**
- Windows installers built and attached from v1.0.2 on.
- v1.0.4's Mac build succeeded, but its check step had a path bug (fixed). The Mac files aren't online yet.
- The user installed a locally built `.dmg`.
- Next release: **v1.0.5** or later, with the fixes from 23 Oct (own engine, Dock, Back in the welcome).
- The empty releases v1.0.0–v1.0.3 can be deleted.

---

## 6. Lessons (things that went wrong; don't repeat them)

- **Packaging:**
  - electron-builder **silently drops the top-level `node_modules` of a folder in `extraResources`**. That's why the engine is staged in `desktop/stage-root/app-engine`, packed from `stage-root`.
  - **No symlinks in the packed app.** They break signing on Mac and packing on Windows, so `stage.mjs` replaces them with real copies. Next's build links external packages by **absolute path** in `web/.next/node_modules`.
  - Node won't strip TypeScript under `node_modules`. In the app, `@ck/shared` is resolved by `desktop/engine-hooks.mjs` (`--import`).
  - The Mac app is **ad-hoc signed** (`identity: "-"`): Apple silicon refuses fully unsigned apps.
  - First open on current macOS: **System Settings → Privacy & Security → Open Anyway** (right-click → Open no longer works). Removing that needs an Apple Developer account (US$99/yr) for notarisation; on Windows a code-signing certificate removes SmartScreen.
- **Moving from the old install:** the old app's engine survives its own `--stop` and kept serving port 4000, so the new app used it. The app now **stops whatever else listens on 4000/3000** (`freePorts()` in `desktop/main.js`).
- **The Dock** stores apps as file URLs (`file:///Applications/Capital%20Kranti.app/`). Read and edit it with `defaults export` and `PlistBuddy`, one entry at a time.
- **GitHub retired `macos-13`**, so the Intel build runs on `macos-15-intel`.
- **Test what ships.** Earlier checks ran the engine before packing and so missed packing bugs. The workflow now checks the packed app: its signature, its contents, and that its engine starts.
- **Release builds use the workflow from the tagged commit,** so a fix needs a **new** release; re-running an old one won't pick it up.
- **Check the real thing, not a proxy.** For example: the PDF's *content* position, not just its page size; the console 404s, investigated rather than hidden (they were real: the newsroom asked for issues before they existed, and photos had no engine route).

---

## 7. What's next

Releases: **v1.1.4** is the latest (check the release workflow's result
through the GitHub API before saying a release works; `gh` isn't installed).

The desktop app's open items:

0. **The new layout engine (v1.1.0):**
   - **PIB photos are dropped** from stories 2 columns or wider: they're ~600 px wide, and the print rule asks 200 ppi (under 3 inches). Ask the user whether 150 ppi is acceptable for the paper (profile `photo.minPpi`).
   - **Page designs from back issues:** the designs are grown from rules today; 5-10 back-issue PDFs would let `designs.ts` prefer the paper's own (to collect from the user).
   - **Short days:** a day short of news (no Hindi top-up or features yet) can leave a hole the written items don't hit exactly; the evening run's top-up and features usually prevent it.
   - The Urdu sample (CI, informational) is still NOT READY on either engine: Nastaliq tuning waits for the paper's own Urdu font.

1. **Get a complete release out** (v1.0.5+). Confirm all three installers are attached, then delete v1.0.0–v1.0.3.
2. **Install on the father's Windows PC** with the user; it's the real test of the Windows app:
   - the first open past SmartScreen;
   - moving the old script install in;
   - the welcome flow;
   - a full evening run;
   - Publish and Print.
3. **Connect the website** (Publish without Git):
   - The user registers a GitHub OAuth App with **Device Flow** enabled.
   - Its Client ID goes in the repository Actions variable `CK_GITHUB_CLIENT_ID` (README, "making a release"), or straight into `desktop/main.js` as the default (it isn't a secret).
   - Until then, Publish from the app can't push. The sign-in now asks only for `public_repo`.
4. **Copies with the real AI on the father's PC:** one real copy was checked on 22 Oct data (26 of 29 headlines reworded, no white space, the lead kept, ~₹4). Check "Headline, sub-heading and text" and "Anywhere" on real data too; each copy takes about as long as the day's layout.
5. **Every paper in the evening run:** today only the chosen paper makes itself.
6. **Rotate the OpenRouter key.** It appeared in a screenshot on 23 Oct. The user makes a new one at openrouter.ai, pastes it in **Settings → AI key**, and deletes the old one.
7. **Verify in a real run:**
   - the live progress loader through all five steps;
   - edit, save, leave out and Undo on real data;
   - Allow full width (the gate catches a full-width story placed without it);
   - the evening wake (`pmset` on Mac, a scheduled task on Windows);
   - Uninstall: once keeping and once removing the archive.
8. **Rebuild issues 269–271 if they're reprinted.** Their PDFs predate the foot rule, the foot margin and the 0.76pt fix.
9. **Later:**
   - signing (Apple Developer and Windows certificate), to remove the first-open warnings;
   - an Urdu paper's own Nastaliq font;
   - a releases inbox (email ingest, README §15) if PIB ever isn't enough;
   - clean-up: `backend/test/recompose-0808.ts` is stale, and the old `windows/` and `mac/` scripts can go once every computer runs the desktop app.

---

## 8. The website: start here in a new session

The user wants a live website as the heart of the paper, with a social media
desk (Facebook, Instagram, X, Telegram, YouTube Shorts, WhatsApp) and the
printed paper as one of its products. It is **planned, not built**.

**Read first:**
- `docs/website/ROADMAP.md`: what it does, the newsroom and social pipelines, the stages to build it in, costs in ₹, and what's needed from the user.
- `docs/website/DESIGN.md`: the Washington Post's UI (dark), measured on 24 Oct, mapped to Gujarati: tokens, the ruled grid, header, modules, section and article pages.
- `docs/website/sample/capital-kranti-website.html`: the sample the user liked. Open it in a browser. It was published as https://claude.ai/artifact/EnGn4RLGwG5BQyeo2nMLpq.

**Decided:**
- **Where:** the code goes in a new **`site/`** folder.
  - It is **not** in the root workspaces, so its libraries stay out of the desktop app.
  - It borrows the engine's code by path (PIB reading, the Gujarati text cleaning, the checks).
- **Running: free hosting, no paid server** (the user has no budget for one). The pipeline runs as scheduled GitHub Actions runs (free for this public repository); the site is on a free host (Cloudflare or Vercel), with a free Postgres (Neon or Supabase) and free photo storage (Cloudflare R2). ROADMAP §1.1 has the details and the two things to test first. App releases still come only from version tags.
- **Look:** the Washington Post, dark by default. Only its patterns are copied, never its logo, fonts, text or images.
- **Order:** stage 0 (server, domain, empty site), then stage 1 (the website from the evening paper's stories, with Publish sending to it), then live news, other outlets, and the social desk.

**First steps in the new session:**
1. Read `CLAUDE.md`, this file's §8, and `docs/website/ROADMAP.md` §1 and §6.
2. Ask the user for stage 0's needs: free accounts on the chosen host and database. They create them and save the keys as Actions secrets themselves; never in chat. First test whether PIB answers GitHub's servers (ROADMAP §1.1).
3. Build stage 0, then stage 1, and show the user screenshots at phone and desktop widths before moving on.

