# Capital Kranti website and social media: the roadmap

Written 24 Oct 2026. Status: **planned and agreed in outline; nothing built yet.**
This replaces the earlier `ECOSYSTEM_PLAN.md` (on the unmerged `reserve` branch).
The look is in [DESIGN.md](DESIGN.md), and its sample in [sample/](sample/).

---

## 0. The idea, in one picture

The website becomes the heart. News comes in all day, is checked, written up
in the house style, published within minutes, and sent out to social media.
The printed paper becomes one product of the website: at 8 PM the layout
engine makes the day's pages from the day's published stories.

```
 SOURCES ─► WATCHERS ─► CLUSTER ─► VERIFY ─► DECIDE ─► WRITE ─► PUBLISH ─► SOCIAL DESK
 PIB, govt, every few   one event, sources'  tier,     Gujarati  website    cards, carousels,
 outlets'   minutes,    many       rules     genres,   story,    (live)     shorts ─► Facebook,
 RSS        politely    sources              route     checked              Instagram, X,
                                                                            Telegram, YouTube,
                                                                            WhatsApp
                 sensitive or unsure ─► the editor's phone: approve / change / reject
                                                         │
                                        8 PM ─► the printed paper (the layout engine, as now)
```

### Decisions already made (24 Oct)

- **Hosting: free services to start** (decided 24 Oct; no money for a server). The website and its pipeline still never depend on the father's computer or the 8 PM run. Section 1.1 has the setup; a paid server only if the paper outgrows it.
- **Publishing:** anything verified goes live on its own. These wait for the editor's approval:
  - sensitive stories: deaths, accidents, crime, allegations against named people;
  - unverified stories.
- **Look:** Capital Kranti's own design system, phone first, in the printed paper's colours; light or dark follows the phone (changed 24 Oct from copying the Washington Post). See DESIGN.md.
- **Coverage:**
  - three **tiers:** Gujarat, India, World;
  - **genres:** agriculture, economy, tech and science, health, sport, education, entertainment, plus politics and culture as needed.
- **Other outlets:** used with credit. Their facts and a link, never their wording or photos.
- **Social accounts:**
  - the Facebook Page and X exist;
  - Instagram is to be made a Business account, linked to the Page.
- **Code:** a new **`site/`** folder in this repository (section 1).

### The paper's rules still apply

These come from `CLAUDE.md`:
- **Costs:** every cost shown in ₹.
- **AI:** no Anthropic models for the paper's own AI (OpenRouter models from the profile).
- **The repository is public:** keys are entered in the website's own settings page and never committed.
- **Language:** Gujarati first, English as a switch (labels and stories, the stories translated by a free model).

---

## 1. Where the code lives, and why it doesn't disturb the app

```
backend/    the engine (the desktop app's)   ─┐
web/        the newsroom (the desktop app's)  ├─ packed into the desktop app (desktop/stage.mjs)
shared/, publications/                       ─┘
site/       NEW: the website, its pipeline and the social desk (free hosting, section 1.1)
docs/website/   this roadmap, the design, the sample
```

**Keeping the app safe:**
- **The packing step copies only a fixed list** (`backend/`, `web/`, `shared/`, `publications/` and their libraries). `site/` is never in the app.
- **Its own installs:** `site/` is **not** added to the root `package.json` workspaces, so its libraries never land in the shared `node_modules` the app copies.
- **Borrowing the engine's code:** it imports by path what it needs, such as:
  - PIB reading: `backend/src/ingest/pib.ts`;
  - Gujarati text cleaning: `normalizeText` and `printableGujarati` in `backend/src/layout/text.ts`;
  - the number check (`numbersNotIn`) and repeat check (`quality.ts`);
  - the paper's profile.

  No copies of that code.
- **Its own CI and deploy:** `.github/workflows/site.yml`, run only when `site/**` changes. App releases still come only from version tags.

**What's in `site/`:**
- **The website:** Next.js, server-rendered and cached, for speed and Google. Read `web/node_modules/next/dist/docs` first: this Next differs from what you know.
- **The pipeline:** the watchers, the AI steps, the card and short makers, and the posters, as short runs every few minutes (no always-on process; section 1.1).
- **A database** for stories, sources, posts and costs.

**The current public site** (`web/src/app/page.tsx` on Vercel, published by
git push) stays until the new site is live, then redirects to it.

### 1.1 Free hosting

Nothing here needs a paid server. Each service's free limits change, so
**check them when setting up** and write the numbers into this file.

**Decided 24 Oct: everything on Vercel for now, Cloudflare later.** The user
chose not to open a Cloudflare account yet (its photo storage asks for a card).
The code uses nothing Vercel-only (standard Next.js, plain Postgres, files
behind one small storage module), so the later move is a redeploy plus a
one-time copy of the stories and photos.

| Job | Now (free) | Later | Free limits (checked 24 Oct 2026) |
|---|---|---|---|
| **The pipeline** (watchers, writing, cards, shorts, posting) | **GitHub Actions**, on a schedule | the same | free for a public repository; each run has Node, Chromium and `ffmpeg`; scheduled runs every 5 minutes at most, often late by several minutes ("live" means within about 10-20 minutes); 6 hours a run at most |
| **The website** | **Vercel** (Hobby), a new project with its root in `site/` | Cloudflare Workers | **non-commercial use only**; 100 GB transfer, 1 million function calls, **4 CPU-hours of server work** and **5,000 image resizes** a month. Pages are cached and refreshed only when a story changes, and photos are resized by the pipeline, not by Vercel |
| **The database** | **Neon** Postgres, free, through Vercel's marketplace | Cloudflare D1 (or keep Neon) | 1 GB; **100 compute-hours a month**; it sleeps after 5 minutes idle. So the pipeline runs **every 15 minutes** (not 10) and the site reads through its cache: awake about 40% of the time ≈ 75 compute-hours |
| **Photos** | **Vercel Blob**, free | Cloudflare R2 | **1 GB stored, 2,000 uploads a month, 10,000 uncached reads, 10 GB transfer.** One photo per story, resized to ~100 KB, at most **50 uploads a day** (counted; the rest of the day's stories go without a photo). Cards and shorts are not stored here (phase C needs a bigger store) |
| **The address** | **`capitalkranti.co.in`**, pointed at Vercel (a free `…vercel.app` address until then) | pointed at Cloudflare | ₹0 more (the paper already renews it) |

**On Vercel's free plan, going over a limit pauses that feature for 30 days**
(no bill). So the pipeline counts its own uploads and resizes, the dashboard
shows each limit's use, and an alert goes out at 80%.

**When to move to Cloudflare** (whichever comes first):
- before the site carries any ad (Vercel's free plan is non-commercial);
- before phase C (cards and shorts need more than 1 GB and 2,000 uploads a month);
- if a limit nears 80% two months running.

**How it runs:**
- **Every 15 minutes** (the free database's compute hours, above), a scheduled GitHub Actions run reads the sources and writes the new stories into the database.
- It makes and posts that story's cards, then ends.
- The website reads the database, so a new story is live when the run ends.
- **Heavier jobs** (the evening short, the morning carousel) are their own scheduled runs.

**Two things to test first, at the start of phase A:**
1. **Whether PIB answers GitHub's servers.** They're abroad, and PIB's firewall may treat them differently from a computer in India. If it doesn't answer, the **desktop app**, which already collects PIB hourly (v1.1.2), sends what it collects to the website's database. Then PIB news is live while the father's computer is on, and other sources still come from GitHub.
2. **How late the scheduled runs really are,** to tell the user honestly how "live" the site is.

**A genuinely free server, if one is ever needed:**
- Oracle Cloud's "Always Free" machines are a real always-on server at ₹0.
- But sign-up asks for a card (to verify, not to charge), new machines are sometimes unavailable, and idle ones can be reclaimed.
- Keep it as plan B, not the start.

**What still costs money:** the **AI** (writing, captions, the voice for
shorts). Section 7 has the figures; a daily ceiling of ₹25 keeps the AI
within what the user can spend, and English translations use a free model.
X is not posted to automatically (it charges per post), so it costs nothing.

---

## 2. Sources, and the rules for using them

| Kind | Examples | How it's read | Trust |
|---|---|---|---|
| Official | PIB, Gujarat government, ministries, police, disaster authorities, ISRO, RBI, sports bodies | official RSS, APIs, or pages open to programs | confirmed on its own |
| Outlets | national, regional and international papers and broadcasters | their **RSS feeds** (headline, summary, link) | confirmed when 2+ independent outlets agree |
| Data | weather (IMD), markets, exam results | official feeds | confirmed |

**PIB, as it stands (24 Oct):**
- Programs may read **today's list** and **any single release page**.
- The **date form** for earlier days is refused, even when the program pretends to be Firefox (tested 24 Oct).
- **The app already copes:**
  - it collects each day's lists hourly (v1.1.2);
  - it finds a missed day's releases by their numbers (v1.1.4).
- **The server's PIB watcher** reads today's lists every few minutes and saves them, so it never needs the date form.

**Rules:**
- **Be polite:** one request at a time, with a pause; RSS where offered; never hammer a site.
- **Facts, not wording.** We write our own story from the facts, prefer the primary source, and credit with a link ("સ્રોત: …", source). An **originality check** compares our text with each source; too much matching wording means it's rewritten before it goes out.
- **Photos only from:**
  - government sources, credited;
  - our own;
  - a licence.

  Otherwise a designed card. Never an outlet's photo, and never an AI image passed off as a news photo.
- **AI images and video** are labelled as AI-made (Meta and YouTube require it) and used only for features and illustrations.

---

## 3. The newsroom pipeline (on the server)

1. **Watchers:** one small job per source, on its own schedule:
   - official sources every 1-5 minutes;
   - outlets' RSS every 5-15 minutes.

   New items go into a queue, with the raw text kept for fact checks.
2. **Cluster:** items about the same event are grouped (headline and opening similarity plus named people and places, like today's `dedupe`). A new source **updates** the story; it never duplicates it.
3. **Verify:** the trust rules give each cluster one of three states:
   - **confirmed**;
   - **waiting for a second source** (re-checked as sources arrive, dropped after 6 hours);
   - **needs the editor** (sensitive topics).
4. **Decide:** one cheap AI call per cluster scores how much it matters to Capital Kranti's readers. It sets the **tier**, the **genres**, and the **route**:
   - ignore;
   - brief (60-120 words);
   - article;
   - article + card;
   - **breaking** (everything, plus an alert).

   Gujarat stories get the deepest treatment; world stories are mostly briefs.
5. **Write:** a Gujarati story in the house style:
   - headline > sub-heading > body, a 2-line summary, and tags;
   - every number checked against the sources (`numbersNotIn`);
   - text through the one cleaning door (`normalizeText`);
   - no sentence said twice (`quality.ts`).

   A cheap model writes most stories; a stronger one writes the top and breaking ones (OpenRouter, never Anthropic).
6. **Publish:** the page is live in seconds; the sitemap, the Google News sitemap and the RSS feeds update. A correction is an edit with a visible "updated" note, never a silent change.
7. **Social desk:** section 5 takes the published story and makes what its route asks for.
8. **The evening paper:** section 6, phase D.

---

## 4. The website's features

Every page follows DESIGN.md.

**Pages:**
- **Home:** the front block and right rail, the LIVE carousel, more top stories and Most Read, Latest, section bands, the video strip, the "from other outlets" carousel, a WhatsApp/Telegram join box.
- **Article:** headline, summary, times (published, updated), photo and caption, body, the **source box** (links to every source), Listen, Share (copy link, WhatsApp, X, Facebook), Save, recommended stories.
- **Tier and genre pages** ("ગુજરાત › ખેતી", Gujarat › Agriculture), and **topic pages** (a minister, a scheme, a district).
- **Breaking:** the banner on every page, and the alerts bell.
- **The e-paper:** today's printed pages as images and the PDF, with past days by date.
- **Search**, and an **archive** by date.
- **About, contact, corrections policy, terms, privacy**: a news site needs them, and Google News looks for them.

**For readers:**
- Gujarati first with an English switch (labels and stories).
- Dark / light / match device.
- Follow genres (the home page leans to them).
- Web push alerts for breaking news (opt-in).
- No paywall, no sign-in needed.

**Found by Google:**
- NewsArticle structured data;
- a news sitemap;
- RSS per section;
- share previews (Open Graph cards made by the card renderer);
- fast pages on a phone;
- registration in Google News (Publisher Center).

**Measured:** privacy-friendly page analytics (views, reading time, what's shared), feeding the "decide" step and the Most Read list.

**The editor's side** (on the phone; the father and the user sign in with their Google accounts, section 6.0 item 8):
- **The approval queue:** approve, change or reject a story, and its posts.
- **The live desk:** what is coming in, what was published, what each platform posted.
- **Settings:**
  - the AI keys and social account links, entered there and stored on the server, never in the repository;
  - the ₹ rate;
  - posting schedules;
  - the daily AI ceiling (₹25 to start).
- **The dashboard:** stories, reach, clicks, and **every cost in ₹**, per day, tier, genre and platform.

---

## 5. The social media pipeline

### 5.1 What gets made

Formats, made from a story by its route:

| Format | Size | Made how | Used for |
|---|---|---|---|
| Headline card | 1:1 and 4:5 | an HTML template rendered by Chromium (the engine already drives it, `browser.ts`) | every article + card |
| Breaking card | 1:1, 4:5, 9:16 | template, red "તાજા સમાચાર" (breaking) band | breaking |
| Top-5 carousel | 4:5, 5-7 slides | template, one story per slide, a cover and an end slide | morning roundup |
| Quote card | 1:1 | template, a person's photo when it's an official one | speeches, statements |
| Share preview | 1.91:1 | template | each article's link preview |
| 60-second roundup short | 9:16 video | section 5.2 | evening |
| Breaking short | 9:16, 20-30 s | section 5.2 | big breaking news |

**Card templates:**
- They use the website's design (fonts, dark palette, the masthead).
- **Gujarati text goes through the same cleaning door** as the paper, so no font faults.
- Photos only by the rules in section 2.
- Each card is checked like a page: text fits, no clipping, contrast.

**Captions:**
- written by the AI in Gujarati;
- a hook line, 2-3 lines of facts, the link, a few fixed and story hashtags;
- numbers checked like the story's;
- each platform's own length and style.

### 5.2 Shorts (video)

1. **Script:** 60-90 words per story (numbers checked), for 4-5 stories.
2. **Voice:** a Gujarati text-to-speech voice. Compare Google Cloud and Azure Gujarati voices on quality and ₹ before choosing.
3. **Pictures:** official photos with gentle motion (pan and zoom), animated headlines, and the paper's lower-third.
4. **Captions** burned in (most watch muted), and **royalty-free music**, quiet.
5. **Made on the server** with `ffmpeg`, from frames rendered by Chromium.
6. **Labels:** any AI-made picture is marked as AI-made. **No fully AI-generated news video.**

### 5.3 Where it goes

| Platform | How | Notes to check when building |
|---|---|---|
| **Website** | first, always | every post links back to the article |
| **Facebook Page** | Meta's Graph API (Page posts, photos, Reels) | one Meta app; app review for the posting permissions |
| **Instagram** | Instagram's content publishing API (images, carousels up to 10, Reels) | needs a Business account linked to the Page; there is a daily cap on API posts (check the current number) |
| **X** | **by hand for now** | X charges programs per post (about ₹1.3, or ₹17.6 with a link; Feb 2026 on). The desk prepares a ready post and card each day for the user to post from the X app, like the WhatsApp Channel |
| **Telegram channel** | Telegram Bot API | free and simple; a good first channel to test the desk |
| **YouTube Shorts** | YouTube Data API upload | uploads use a large share of the daily quota; new apps' uploads may stay private until Google's audit (check) |
| **WhatsApp Channel** | no public posting API that we know of | the desk prepares a copy-ready post and card; the editor shares it in one tap (check for an API when building) |
| **Threads** | Meta's Threads API | optional, later |

**The posting desk:**
- **A queue:** each planned post has a platform, a time, the story, its card or short, and a caption.
- **Approval:**
  - posts follow the story's approval rule;
  - the editor sees each post on the phone before it goes out, if they wish (a setting per platform);
  - breaking news posts at once when confirmed.
- **Schedule** (changeable in settings):
  - morning: top-5 carousel;
  - midday: one or two cards;
  - evening: the e-paper and the 60-second short;
  - breaking as it happens;
  - at most a set number of posts per platform per day, so it never spams.
- **Reliability:**
  - each post is tried, retried with a pause, and its state shown (planned, posted, failed and why);
  - a failed post never blocks the others;
  - expired account links are reported on the dashboard, with "link again".
- **Tokens:** long-lived account links stored on the server, encrypted, never in the repository or the logs.
- **No fake engagement:** no auto-likes, follows or mass comments (they get accounts banned).
- **Analytics:** reach, clicks and new followers per post, platform, genre and format, fed back into "decide" and the schedule.

---

## 6. Building it, in four phases

Decided 24 Oct: the eight stages planned first are grouped into **four
phases**, so the work takes fewer rounds of questions and reviews without
losing quality. Within a phase the work is built, checked and fixed without
stopping; the user is asked only at the phase's review, or when something
comes up that they would care about. Each phase ends finished, checked, shown
to the user, merged and released (CLAUDE.md).

**How quality holds with fewer reviews:** automatic checks run on every change
in `site.yml`, in place of looking by hand:
- every page at 360 / 390 / 412 / 820 / 1440: no sideways scroll, no script errors, accessibility (DESIGN.md §7);
- speed on phone settings, against DESIGN.md §4;
- every story's numbers against its sources (`numbersNotIn`), and no sentence said twice (`quality.ts`);
- each card rendered and checked: text fits, nothing clipped, contrast.

Anything that reaches real readers (live publishing, real social accounts, the
printed paper) still gets a real-world trial before it's called done.

Pieces of a phase that don't depend on each other (for example the card
templates and the news pipeline) may be built side by side in separate
sessions.

### 6.0 Before starting: the up-front checklist

Gone through with the user on 24 Oct 2026. Accounts and keys are always made
and entered by the user; never in chat or the repository.

| # | What | Decided | Needed by |
|---|---|---|---|
| 1 | How stories say they were made | **The source and the number check only; AI is not mentioned in the text.** (AI-made pictures and video are still labelled, as Meta and YouTube require.) | A |
| 2 | The English switch | **Labels and stories.** Stories are translated by a **free** OpenRouter model (`:free`; the account has bought over US$10, so 1,000 requests a day, 20 a minute). A story whose translation misses the day's allowance stays Gujarati-only until the next day; translations are number-checked. | A |
| 3 | The domain | **`capitalkranti.co.in` is the paper's.** It is pointed at the site in phase A, with guided steps the user does at the registrar. | A |
| 4 | Website host | **Vercel for now** (decided 24 Oct, replacing Cloudflare until the move; see section 1.1): a new Vercel project for `site/`. **Cloudflare later**, before ads or phase C. | A |
| 5 | Database and photos | **For now:** stories in **Neon** Postgres and photos in **Vercel Blob**, both free and made from the Vercel project's Storage tab (no card). **Later:** Cloudflare D1 and R2. | A |
| 6 | Keys as Actions secrets | **To do (user):** in Vercel, the new project from this repository with its root directory `site/`, and its Storage tab's Neon database and Blob store connected to it; then two repository secrets copied from the project's environment variables: `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN`. Checked by name (never value) when phase A starts. (No Cloudflare account yet.) | A |
| 7 | A new OpenRouter key | **To do (user):** a new key in every app's Settings and as the secret `OPENROUTER_API_KEY`; then the old key deleted. | A |
| 8 | The editor's sign-in | **Both the father and the user, with their Google accounts.** On Vercel this is the site's own Google sign-in (Auth.js, free): **to do (user) in phase B**, a Google sign-in client made in Google Cloud (guided), and the two allowed addresses entered in Vercel's settings, never in the repository. On Cloudflare later, Cloudflare Access may replace it. | B |
| 9 | A daily AI ceiling | **₹25 a day** (at most ~₹750 a month) for all paid AI of the live news; translations on the free model don't count. At the ceiling, new stories wait for the next day; breaking news is still written. Changeable in Settings. | B |
| 10 | Slow outside steps | **To do (user), soon:** Instagram switched to a Business account linked to the Page; the user an admin of the Facebook Page; signing in to X works. Meta's app review starts once phase A is live (it asks for a live site and privacy policy). | C |
| 11 | X | **No automatic posting** (X charges programs per post since Feb 2026: about ₹1.3 a plain post, ₹17.6 with a link). The desk prepares a ready post and card for X each day; the user posts by hand. | C |
| 12 | Writing to PIB | **Not now;** revisit only if PIB blocks the live news. | — |

### Phase A: the website (stages 0 and 1)

1. **First, the test that shapes phase B:** does PIB answer GitHub's servers (section 1.1)? Also how late scheduled runs start.
2. **Groundwork:** the `site/` folder, its own CI (`site.yml`, run only for `site/**`); the Vercel project, Neon and Blob (section 1.1); a scheduled run that writes to the database; today's `web` project set to skip builds for `site/` changes, and the new one to build only for them.
3. **The site:** DESIGN.md as components; home, article, section (tiers × genres), latest, search, the e-paper and the archive; the trust pieces on every story; About, editorial policy, how we check news, corrections, contact, terms, privacy.
4. **Publish from the newsroom** sends the day's stories to the site's API instead of a git push (this also removes the GitHub sign-in problem in HANDOFF §7). Each story gets its tier and genres at publish (one cheap AI call).
5. **Found by Google:** NewsArticle markup, the sitemaps and news sitemap, RSS per section, share previews.
6. **Issues 269-271** moved in, if wanted; the old public site redirects to the new one.
- **Review:** the live site at phone and desktop widths in both themes; a real evening's Publish from the app; the automatic checks green; the desktop app's release unaffected. Released with the newsroom change.

### Phase B: live news (stages 2 and 3)

1. **One pipeline with sources that plug in:** watchers → cluster → verify → decide → write → publish (section 3).
2. **Sources:** PIB's lists every few minutes (or, if PIB refuses GitHub, sent in by the desktop app's hourly collection), the Gujarat CM's office, All India Radio Gujarati, ministries; then other outlets' RSS.
3. **Rules:** the two-source rule, the originality check against every source, credits and the source box, sensitive and unconfirmed stories held for the editor.
4. **The editor's side on the phone:** the approval queue, the live desk, Settings (keys, ₹ rate, the daily ceiling), the cost dashboard in ₹.
5. The "from other outlets" carousel, the full tiers × genres pages, breaking alerts.
- **Review:** a day of real running under the daily ceiling: every story number-checked, none matching a source's wording, all credited, world stories kept as briefs, the costs in ₹. Stories go live on their own only after this.

### Phase C: social media (stages 4, 5 and 6)

1. **One card renderer** (HTML templates in Chromium, in DESIGN.md's look) for headline, breaking, quote, top-5 carousel and share-preview cards; captions written in Gujarati and number-checked.
2. **One posting queue** with the schedule, per-platform approval, retries and daily caps (section 5.3).
3. **Shorts:** script, the Gujarati voice (compare Google and Azure on quality and ₹; the user picks), pictures with gentle motion, burned-in captions, `ffmpeg`.
4. **Platforms switch on as their approvals arrive:** Telegram first (no approval needed), then the Facebook Page, Instagram (cards, carousels, Reels), X (if its price is accepted), YouTube Shorts; the WhatsApp Channel's copy-ready posts.
- **Review:** a week of posts on Telegram before the others go on, then each platform's first posts; the cost of each short in ₹; the voice approved.

### Phase D: the printed paper from the website (stage 7)

Kept on its own: it changes how the printed paper is made.
- At 8 PM the layout engine takes the day's published stories (Gujarat first) instead of fetching them itself; the desktop app and the website agree on the day's stories; the app still lays out and prints.
- **Review:** a week of papers made this way, READY and as good as now; CI layout tests still READY.

### Later

- "પૂછો" (ask): answers from our own archive.
- A Gujarati crossword.
- A reporter portal and reader submissions (moderated).
- Notices and online ad booking.
- Back issues in the archive.
- Comments, if the editor wants them.
- Offline reading of pages already opened.

---

## 7. Cost

These are in ₹ at the Settings rate, rough, to be measured in phase B.

| Item | Per day | Per month |
|---|---|---|
| Hosting, database, storage, scheduled runs (Vercel, Neon and Blob free plans for now, section 1.1) | ₹0 | ₹0 |
| Domain (`capitalkranti.co.in`, already the paper's) | — | the paper's existing renewal |
| Writing the stories, and the decide, tag and caption calls (cheap models; world stories as briefs) | at most ₹25 (the ceiling) | at most ~₹750 |
| English translations | ₹0 (free model) | ₹0 |
| Cards | ~₹0 (own server) | ~₹0 |
| Shorts: voice for 2-4 a day | ₹5-20 | ₹150-600 |
| X posting | ₹0 (by hand) | ₹0 |
| Telegram, Facebook, Instagram, YouTube posting | ₹0 | ₹0 |
| **To start (phases A-C, without shorts)** | | **at most about ₹750, all of it the AI, held by the ₹25 daily ceiling** |

The dashboard shows the real figures in ₹ per day, tier, genre and platform,
with the daily ceiling the editor can change.

---

## 8. Risks, and what we do about them

- **Sources blocking programs** (PIB's date form today):
  - collect continuously;
  - ask PIB for access as a registered paper (RNI 54922/93);
  - be polite.
- **AI mistakes:**
  - number checks;
  - the 2-source rule;
  - sensitive topics always to a person;
  - visible corrections;
  - "report a mistake" on every article.
- **Copyright:** facts only, our own words, credits, the originality check, licensed or official photos only.
- **Platform rules:** official APIs only, AI labels, no fake engagement, posting caps.
- **An account link expiring:** the dashboard says so at once, with "link again".
- **Cost creep:**
  - the ₹ dashboard;
  - cheap models for briefs;
  - each event written once;
  - a daily ceiling.
- **Free plans changing or running out:** the limits are written down (section 1.1) and watched on the dashboard; the code avoids depending on one host, so the site can move. The printed paper still works from the desktop app whatever happens.
- **Scheduled runs late or skipped:** stories go up 10-20 minutes after the source; breaking news isn't instant. Honest wording on the site ("updated every few minutes").

---

## 9. Needed from the user, overall

Section 6.0 is the full checklist, with when each item is needed. In short:

1. **The Vercel project** with its Neon database and Blob store, their two keys as Actions secrets, and a new OpenRouter key (phase A); pointing `capitalkranti.co.in` at the site. The Cloudflare account only when the site moves.
2. **Admin access** to the Facebook Page and the X account, and an **Instagram Business account** linked to the Page (phase C). All links are made through the site's own sign-in screens; no passwords or keys in chat.
3. **X:** decided 24 Oct, posted by hand for now.
4. **Approval of the design** (done 24 Oct), the voice (phase C), and the posting schedule.
5. **Writing to PIB:** not now (24 Oct).
