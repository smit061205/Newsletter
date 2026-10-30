# Capital Kranti: standing instructions

Read `HANDOFF.md` at the start of a session: what this is, where it stands, and
what's next. `README.md` is the technical manual. In `web/`, the Next.js
version differs from what you know: read `web/node_modules/next/dist/docs`
before changing Next code (`web/AGENTS.md`).

## Who it's for
- The newsroom's user is the developer's father: **not technical**, on **Windows**, every evening. Plain words, one clear next step, Gujarati first (English is a switch). No technical terms on screen.
- The developer (the user here) works on a Mac and talks in plain English. Explain what changed and why, briefly.

## The paper's rules (decided; don't re-litigate)
- **No page ever has a full-width story** (the paper, its copies and sister papers) unless the editor allows it for that story (`MAX_STORY_COLS` from the profile's `frontPageMaxCols`, gate W; widened from the front page on 23 Oct 2026). **The front page's lead may run the full width** (the editor, 28 Oct: profile `grid.leadFullWidth`). A kicker is always smaller than its headline.
- **Like the editor's own pages (28 Oct):** every headline big and bold (28pt at the least, profile `headline.min`), a photo with every story that has one (PIB's small photos print down to 100 ppi), fewer and longer stories: none under 100 words (`editorial.minWords`), a front lead of 250 words or more, never over 40% of the page. No headline under 28pt anywhere (gap fillers too); no kicker line over headlines (`kicker.none`); sub-headings set to fill their full width.
- **The same news prints once (30 Oct):** the AI plan names each story's event, and two reports of one event keep the best one, with the other's photo if it has none (`build.ts`). **The front lead always has a photo.** A gap on a page: the AI writes the stories round it longer, from their releases' facts only, and the page is designed again, before any short item goes in; an item in a strip no story fits ends on a whole sentence.
- **At most one slogan / message panel and one house ad per paper.** Fill space with stories.
- **"વિશેષ લેખ" (special article) appears only once per paper.**
- Every story is headline > sub-heading > body, in decreasing sizes; kickers (where a paper has them) are centred; columns end level; no empty space on a page (horizontal rules divide stories and fill odd gaps).
- The printed size and geometry follow the original paper exactly: 390 × 525 mm, with a foot rule on every page but the last. It goes to a printer, so check positions in the PDF itself.
- News comes from **PIB**: Gujarati first, then Hindi translated when short. **Don't get around any website's bot blocking.**

## Money and secrets
- **Show every cost in rupees (₹)**, converted from USD at display time (Settings' rate, ₹88 per US$ by default).
- **No Anthropic models for the paper's own AI** (cost): it uses OpenRouter models from the profile.
- The repository is **public**. Never commit `backend/.env`, `backend/data/`, `settings.env`, keys or tokens, and never print or ask for the user's keys. The user enters them in the app. The Gopika fonts *are* committed (the paper allowed it); fonts copied from a computer's system folders are not.

## How to work here
- Develop on ports **4100 (engine) / 3100 (newsroom)**; 4000/3000 are the installed app's. Never run two engines on one database.
- Test layout changes on a **copy** of the database in a scratch `DATA_DIR`, never on published issues.
- **Don't build the desktop app on the user's Mac** (23 Oct 2026: it ran the Mac out of memory and disk). The release workflow builds and checks the packed app (signature, contents, its engine starting) on both platforms (Apple silicon Mac and Windows; no Intel Mac since 26 Oct 2026): read its result before saying a release works. Never open a packed app on the user's Mac: it moves their real install into itself.
- The CI layout tests must stay READY (`backend/test/pack-0808.ts`, `sample-english.ts`). They run the layout engine (`layout/engine.ts`); the old packer no longer lays out pages (26 Oct 2026).
- Work on a branch. **When an improvement is finished and checked** (typechecks, the CI layout tests READY, the newsroom builds, and for desktop changes the packed-app check), merge it to `main`, push, and release it: bump to the next version tag and `git tag vX.Y.Z && git push origin vX.Y.Z` (the release workflow creates the GitHub release and attaches the installers). The user asked for this standing on 23 Oct 2026; tell them the version and what's in it. Publish the paper (`cli.ts publish --push`) from `main`.
- Commit messages describe the change in plain words.
- **The website (`site/`) is built without touching the app** (the user, 25 Oct): website work stays in `site/`, `.github/workflows/site*.yml` and `docs/website/`; never change the app's code for it and never tag an app release for it. The app's rule above (merge and release) is for app improvements only. HANDOFF §8 says where the website stands.
- **The website and its engine live in this repository, in `site/`** (the user, 25 Oct: no separate repo). The website's own engine (news collection, AI writing, the social media desk, scheduling) is built under `site/` (e.g. `site/engine/`), never in `backend/`, `shared/` or `publications/`. The site may **import** a few stable pieces of the app read-only (the PIB reader `backend/src/ingest/pib.ts`, the number check and AI call in `backend/src/editorial/rewrite.ts`), never change them; if the app ever changes one in a way that breaks the site, copy that piece into `site/` instead of touching the app.
