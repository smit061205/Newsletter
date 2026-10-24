# Capital Kranti website and social media: the roadmap

Written 24 Oct 2026. Status: **planned and agreed in outline; nothing built yet.**
This replaces the earlier `ECOSYSTEM_PLAN.md` (on the unmerged `reserve` branch).
The look is in [DESIGN.md](DESIGN.md), and the approved sample in [sample/](sample/).

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

- **Hosting:** a cloud server, always on, so the website never depends on the father's computer or the 8 PM run.
- **Publishing:** anything verified goes live on its own. These wait for the editor's approval:
  - sensitive stories: deaths, accidents, crime, allegations against named people;
  - unverified stories.
- **Look:** exactly the Washington Post, **dark** by default (a light theme as a switch). See DESIGN.md.
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
- **Language:** Gujarati first, English as a switch.

---

## 1. Where the code lives, and why it doesn't disturb the app

```
backend/    the engine (the desktop app's)   ─┐
web/        the newsroom (the desktop app's)  ├─ packed into the desktop app (desktop/stage.mjs)
shared/, publications/                       ─┘
site/       NEW: the website, its workers and the social desk (the cloud server only)
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
- **A worker process:** the watchers, the queue, the AI steps, the card and short makers, and the posters.
- **Postgres** for stories, sources, posts and costs.
- **Deploy:** one Docker setup on a cloud server near India (a Mumbai region), behind HTTPS on the paper's domain.

**The current public site** (`web/src/app/page.tsx` on Vercel, published by
git push) stays until the new site is live, then redirects to it.

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
8. **The evening paper:** section 6, stage 8.

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
- Gujarati first with an English switch.
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

**The editor's side** (sign-in, on the phone):
- **The approval queue:** approve, change or reject a story, and its posts.
- **The live desk:** what is coming in, what was published, what each platform posted.
- **Settings:**
  - the AI keys and social account links, entered there and stored on the server, never in the repository;
  - the ₹ rate;
  - posting schedules;
  - a daily cost ceiling, if wanted.
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
| **X** | X API v2 | posting needs a paid plan; check the current price before building, and show it in ₹ |
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

## 6. Building it, in stages

Each stage is finished, checked, shown to the user and released before the next.

### Stage 0: groundwork

- The `site/` folder, its own CI (`site.yml`, triggered by `site/**`), and Docker.
- The cloud server, the domain and HTTPS, and Postgres with daily backups.
- **Check:** an empty site live on the domain; a push to `site/` deploys; the desktop app's release unaffected.
- **Needed from the user:**
  - the cloud server account and a domain (the user creates them; keys go in the server's settings, never in chat or the repo).

### Stage 1: the website, from the evening paper

- The design system from DESIGN.md as components; home, article, tier and genre pages, search, the e-paper and the archive.
- The newsroom's **Publish** sends the day's stories to the site's API instead of a git push. That also removes the GitHub sign-in problem in HANDOFF §7.
- Google News markup, sitemaps, RSS, the About and policy pages.
- **Check:**
  - pages fast on a phone;
  - the design side by side with the Post at 390 / 820 / 1440;
  - the user approves.

### Stage 2: live official news

- Watchers for PIB (today's lists every few minutes), the Gujarat government and ministries.
- Cluster, verify, decide, write, publish within minutes.
- The editor's approval queue on the phone.
- **Check:** a day of live running, every story number-checked, costs in ₹ on the dashboard.

### Stage 3: other outlets, tiers and genres

- RSS watchers for national, regional and world outlets.
- The 2-source rule, the originality check, the credits and source box.
- The "from other outlets" carousel; the full tiers × genres pages.
- **Check:** no story matches a source's wording; all credited; world stories stay briefs.

### Stage 4: social desk, part 1 (cards)

- The card renderer and templates, captions, the posting queue and schedule.
- **Telegram first** (free, easy), then the **Facebook Page** and **X**.
- **Check:** a week of daily posts with no mistakes; analytics coming back.
- **Needed from the user:**
  - admin on the Facebook Page;
  - the X account and a decision on X's posting price;
  - creating a Meta app (guided).

### Stage 5: Instagram

- The Business account linked to the Page; single cards, top-5 carousels.
- **Check:** a week of posts; the daily cap respected.

### Stage 6: shorts

- The 60-second evening roundup and breaking shorts; the Gujarati voice chosen.
- Facebook and Instagram Reels, then YouTube Shorts.
- The WhatsApp Channel's copy-ready posts.
- **Check:** quality the user approves; the cost of each short in ₹.

### Stage 7: the printed paper from the website

- At 8 PM, the layout engine takes the day's published stories (Gujarat first) instead of fetching itself.
- The desktop app and the server agree on the day's stories; the app still lays out and prints.
- **Check:** a week of papers made this way, READY, as good as now.

### Stage 8: later

- "પૂછો" (ask): answers from our own archive.
- A Gujarati crossword.
- A reporter portal and reader submissions (moderated).
- Notices and online ad booking.
- Back issues in the archive.
- Comments, if the editor wants them.

---

## 7. Cost

These are in ₹ at the Settings rate, rough, to be measured in stage 2.

| Item | Per day | Per month |
|---|---|---|
| Cloud server, database, backups | — | ₹1,000-3,000 |
| Domain | — | ~₹100 (about ₹1,000 a year) |
| Writing ~100-300 stories (mostly the cheap model; world stories as briefs) | ₹10-150 | ₹300-4,500 |
| Decide, tag and caption calls (cheap) | ₹2-15 | ₹60-450 |
| Cards | ~₹0 (own server) | ~₹0 |
| Shorts: voice for 2-4 a day | ₹5-20 | ₹150-600 |
| X posting | — | check the current price |
| Telegram, Facebook, Instagram, YouTube posting | ₹0 | ₹0 |
| **To start (stages 0-4)** | | **about ₹2,000-8,000** |

The dashboard shows the real figures in ₹ per day, tier, genre and platform,
with an optional daily ceiling the editor sets.

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
- **The server going down:** health checks, automatic restart, daily database backups; the printed paper still works from the desktop app.

---

## 9. Needed from the user, overall

1. A **cloud server account** and a **domain** (stage 0).
2. **Admin access** to the Facebook Page and the X account, and an **Instagram Business account** linked to the Page (stages 4-5). All links are made through the site's own sign-in screens; no passwords or keys in chat.
3. A decision on **X's posting price** once checked (stage 4).
4. **Approval of the design** (stage 1), the voice (stage 6), and the posting schedule.
5. Optionally, a yes on **writing to PIB** for program access, and who signs it.
