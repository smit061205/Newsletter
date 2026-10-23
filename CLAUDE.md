# Capital Kranti: standing instructions

Read `HANDOFF.md` at the start of a session: what this is, where it stands, and
what's next. `README.md` is the technical manual. In `web/`, the Next.js
version differs from what you know: read `web/node_modules/next/dist/docs`
before changing Next code (`web/AGENTS.md`).

## Who it's for
- The newsroom's user is the developer's father: **not technical**, on **Windows**, every evening. Plain words, one clear next step, Gujarati first (English is a switch). No technical terms on screen.
- The developer (the user here) works on a Mac and talks in plain English. Explain what changed and why, briefly.

## The paper's rules (decided; don't re-litigate)
- **The front page never has a full-width story** unless the editor allows it for that story (`frontPageMaxCols`, gate W).
- **At most one slogan / message panel and one house ad per paper.** Fill space with stories.
- **"વિશેષ લેખ" (special article) appears only once per paper.**
- Every story is headline > sub-heading > body, in decreasing sizes; kickers are centred; columns end level; no empty space on a page (horizontal rules divide stories and fill odd gaps).
- The printed size and geometry follow the original paper exactly: 390 × 525 mm, with a foot rule on every page but the last. It goes to a printer, so check positions in the PDF itself.
- News comes from **PIB**: Gujarati first, then Hindi translated when short. **Don't get around any website's bot blocking.**

## Money and secrets
- **Show every cost in rupees (₹)**, converted from USD at display time (Settings' rate, ₹88 per US$ by default).
- **No Anthropic models for the paper's own AI** (cost): it uses OpenRouter models from the profile.
- The repository is **public**. Never commit `backend/.env`, `backend/data/`, `settings.env`, keys or tokens, and never print or ask for the user's keys. The user enters them in the app. The Gopika fonts *are* committed (the paper allowed it); fonts copied from a computer's system folders are not.

## How to work here
- Develop on ports **4100 (engine) / 3100 (newsroom)**; 4000/3000 are the installed app's. Never run two engines on one database.
- Test layout changes on a **copy** of the database in a scratch `DATA_DIR`, never on published issues.
- Before saying the desktop app works, **build it and check the packed app** (HANDOFF §5). Don't open the packed app on the user's Mac without asking: it moves their real install into itself.
- The CI layout tests must stay READY (`backend/test/pack-0808.ts`, `sample-english.ts`).
- Work on a branch, then merge to `main` when the user asks. Publish (`cli.ts publish --push`) from `main`.
- Commit messages describe the change in plain words.
