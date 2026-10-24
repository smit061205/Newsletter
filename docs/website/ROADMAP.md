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
- **Language:** Gujarati first, English as a switch.

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

| Job | Free service | Why it fits | Limits to check |
|---|---|---|---|
| **The pipeline** (watchers, writing, cards, shorts, posting) | **GitHub Actions**, on a schedule | free for a public repository (this one is); each run has Node, Chromium and `ffmpeg` | scheduled runs every 5 minutes at most, and they're often late by several minutes, so "live" means within about 10-20 minutes; a run can't last over 6 hours |
| **The website** | **Cloudflare** (Pages / Workers), or **Vercel**'s free plan (where today's site already is) | free, fast in India, HTTPS included | Vercel's free plan is for **non-commercial** use, which matters once the site carries ads; Cloudflare's free plan allows commercial use; daily request and build limits |
| **The database** | a free Postgres (**Neon** or **Supabase**) | stories are text: a free database holds years of them | storage (about 0.5 GB), and Supabase pauses a project idle for a week |
| **Photos, cards and shorts** | **Cloudflare R2** (free storage) | no charge for people viewing them | about 10 GB free |
| **The address** | a free one first (`capitalkranti.pages.dev` or `…vercel.app`) | ₹0 | a real domain (~₹800-1,000 a year) when the paper wants one |

**How it runs:**
- **Every 10 minutes**, a scheduled GitHub Actions run reads the sources and writes the new stories into the database.
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
shorts) and **X**'s posting plan. Section 7 has the figures; a daily ceiling in
₹ keeps the AI within what the user can spend, and stories can be fewer and
shorter at first.

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

Settled once, so no phase stops to ask. Accounts and keys are always made and
entered by the user; never in chat or the repository.

| # | What | Who | Needed by |
|---|---|---|---|
| 1 | How stories say they were made: "written by the Capital Kranti desk from the government press release, with AI help; every number checked" (DESIGN.md §6) | user decides | A |
| 2 | The English switch: the site's labels only (free), or stories translated too (AI cost per story) | user decides | A |
| 3 | The domain: is `capitalkranti.co.in` the paper's, and can it point at the site? (A free address until then) | user | A (or later) |
| 4 | Website host account: Cloudflare (ads allowed on the free plan) or Vercel (free plan non-commercial) | user makes it | A |
| 5 | Database account: Supabase recommended (it can also hold the editor's sign-in and, at first, photos), or Neon | user makes it | A |
| 6 | The keys from 4 and 5 saved as the repository's **Actions secrets** | user | A |
| 7 | **A new OpenRouter key** (the old one appeared in a screenshot on 23 Oct), in the app's Settings and as an Actions secret | user | A |
| 8 | Who signs in as editor (the father, the user, or both) and how (an email link or a password) | user decides | B |
| 9 | **A daily AI ceiling in ₹** for live news, so it can run for real without asking | user decides | B |
| 10 | **Start the slow outside steps now**, guided: a Meta app and its review for posting (can take weeks); the Instagram Business account linked to the Page; admin access to the Page and X | user, guided | C |
| 11 | X's posting price, once checked and shown in ₹: yes or no | user decides | C |
| 12 | Optionally, a yes on writing to PIB for program access (RNI 54922/93), and who signs it | user decides | any |

### Phase A: the website (stages 0 and 1)

1. **First, the test that shapes phase B:** does PIB answer GitHub's servers (section 1.1)? Also how late scheduled runs start.
2. **Groundwork:** the `site/` folder, its own CI (`site.yml`, run only for `site/**`), the host, the database, photo storage, a scheduled run that writes to the database.
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
| Hosting, database, storage, scheduled runs (free plans, section 1.1) | ₹0 | ₹0 |
| Domain (optional; a free address first) | — | ₹0, or ~₹80 (about ₹1,000 a year) |
| Writing ~100-300 stories (mostly the cheap model; world stories as briefs) | ₹10-150 | ₹300-4,500 |
| Decide, tag and caption calls (cheap) | ₹2-15 | ₹60-450 |
| Cards | ~₹0 (own server) | ~₹0 |
| Shorts: voice for 2-4 a day | ₹5-20 | ₹150-600 |
| X posting | — | check the current price |
| Telegram, Facebook, Instagram, YouTube posting | ₹0 | ₹0 |
| **To start (phases A-C, without shorts)** | | **about ₹400-5,500, nearly all of it the AI; a daily ceiling keeps it low** |

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
- **Free plans changing or running out:** the limits are written down (section 1.1) and watched on the dashboard; the code avoids depending on one host, so the site can move. The printed paper still works from the desktop app whatever happens.
- **Scheduled runs late or skipped:** stories go up 10-20 minutes after the source; breaking news isn't instant. Honest wording on the site ("updated every few minutes").

---

## 9. Needed from the user, overall

Section 6.0 is the full checklist, with when each item is needed. In short:

1. **Free accounts** for the website host and the database (phase A); a domain only later, if wanted.
2. **Admin access** to the Facebook Page and the X account, and an **Instagram Business account** linked to the Page (phase C). All links are made through the site's own sign-in screens; no passwords or keys in chat.
3. A decision on **X's posting price** once checked (phase C).
4. **Approval of the design** (done 24 Oct), the voice (phase C), and the posting schedule.
5. Optionally, a yes on **writing to PIB** for program access, and who signs it.
