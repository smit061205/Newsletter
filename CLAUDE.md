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
- **The same news prints once (30 Oct):** the AI plan names each story's event, and two reports of one event keep the best one, with the other's photo if it has none (`build.ts`). **The front lead always has a photo.** A page is designed with stories alone (a row along the foot, a story standing on each ad, `layout/designs.ts`): the AI writes stories longer from their releases' facts rather than a short item going in. **No story under 100 words anywhere** (gate S10), gap items too. The front page has at most 6 stories, its lead 5 columns or wider and 250 words or more. **No photo in a one-column story**; the columns under a side photo hold 4 lines or none.
- **"તંત્રી સ્થાનેથી....." (30 Oct, as in the 8 August paper, page 2):** once per paper, on page 2, 3 or 4 at an edge, top corner first; exactly 2 columns, thin frame, black rounded bar across it with the white bold italic title (thickened in print), headline, no sub-heading, one block of text inside the frame, no image; Gujarat's news first (gate S11).
- **Test one paper, not several:** a test build costs the user time and money (30 Oct).
- **No slogan / message squares at all (the editor, 31 Oct; profile `fillers.maxMessages` 0) and at most one house ad per paper.** Fill space with stories.
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
- **The website has its own repository** (the user, 31 Oct): `smit061205/capital-kranti-website`, in `/Users/smitthakkar/CapitalKranti_Website`, with Aavtikal and its news engine. Website work happens there, never here. The two share no code; the website keeps its own copies of the few text helpers it used (`site/engine/text.ts`). The app's Publish still sends the e-paper to `web/public/issues` in this repository, which the website doesn't read.
