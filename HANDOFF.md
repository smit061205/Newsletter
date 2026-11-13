# Handoff: where Capital Kranti stands, and what's next

Written 23 October 2026 for the next Claude Code session (a new account, with
none of the earlier conversations); brought up to date on 24 October 2026.
**The website moved to its own repository on 31 Oct (§8).** **Read `CLAUDE.md` first** (the standing
rules), then this file (the story and the open work), then `README.md` (the
technical manual) as needed.

**The new engine (1 Nov 2026, v1.1.50):** built and released behind Settings' switch, off by default; the older design search still makes the paper. Replay of the saved days (first build, no AI): 5 of 10 clean layouts, 4 READY (2 of 10 before); hard days 1 of 6. A real paper on 31 Oct's news came out READY after one repair in about 3 minutes, about ₹1 of AI. Open: the first build left a page blank in 2 of 3 real runs (repairs mended it each time); a page with a kept ad falls back to the older designs; `sample-english` has one gap and `sample-urdu` isn't READY with the new engine on. `sample-urdu` also fails on this Mac with it off, on `main` too. Who turns it on and when starts the 14 evenings' count; `report.modular` marks those papers.

**The third engine (2 Nov 2026, behind the same switch):** the order changed so retries aren't needed: spaces of all pages, then stories chosen to fit them, facts read before the layout, stories written to their slots, page-only repair, whole paper last. Replay with real AI, first build: 8 of 10 saved days clean layouts (the second engine: 5 of 10), 5 READY; the stories that failed were fact flags, mended by the repair loop. Goals, not promises: no whole-paper rebuild on a normal day, under 2 minutes of layout. Still the switch's trial: 14 clean evenings (READY first try, no whole-paper rebuild) before it becomes the default.

## State on 4 November 2026 (read this first)

Written for the next Claude Code session, on another Claude account, which has none of the earlier
conversations. **Latest release: v1.1.98** (13 Nov). Work happens on branch
`feat/third-engine`, merged to `main` with `--no-ff` after the checks, then tagged (§5, CLAUDE.md).

**Copies no longer wait on the day's ranking** (13 Nov, v1.1.98; the developer: "it gets stuck
here", a copy at 0% for minutes after "wording ready"): the AI's editorial plan (`editorial/plan.ts`,
ranks and "same event" for every story) had timed out at 150 s almost every evening since the
website's stories came in (10 Nov: 100-odd stories, 11,000 tokens of answer), so the paper went
unranked, and each copy asked again (the day's list had changed with three news items in since the
paper) and waited the same 150 s with nothing on screen. Now the plan asks for little thinking and
reasons of five words (109 stories: 38 s, 7,000 tokens; measured 64 s and 43 s before) with 240 s
to answer; a copy takes the day's paper's own plan from its report (`dayOf`, `CopyOpts.plan`) and,
when the paper had none, ranks as it did without asking. A worker's progress is sent on every 5%
too (a hundred rewordings found ready inside half a second showed as 0%). One copy of 13 Nov's:
1.4 min, its wording done at 6 s (was 3.2 min, 156 s).

**The developer (the user) wants:** answers first in plain English, short; little testing time on
their side; every finished improvement merged, tagged and released without asking (tell them the version
and what's in it); **one** test paper per change, built on a scratch copy of the database (never
several days, never the real issues); a plan agreed before any big engine change (root-cause fixes,
no shortcuts); costs in rupees. His father (the editor) uses the app on Windows every evening.

**Done 5 Nov 2026 (v1.1.77-v1.1.78):** Paper back in the sidebar, and the 4-page PDF opens while the
8-page paper is still being made (v1.1.77). **A sister paper worked on as its own** (v1.1.78; the developer:
"like changing profiles in netflix"): Other papers → "Work on this paper" puts the whole newsroom on it
(`?paper=<id>` on every call, `web/.../api.ts`; a bar across the top and "Back to Capital Kranti"). Its own
store (`backend/src/sister.ts`, `data/sister-papers/<id>/paper.sqlite`): its ads start each day from
Capital Kranti's until it changes that day's; Capital Kranti's edits go through unless it changed that
story; its own text edits are put over its reworded or translated words; every make saves an issue
there (latest per day, its PDF and page pictures under `out/sister-papers/<id>/<date>/`). Its news is
Capital Kranti's; one engine and one evening run; "make again" makes that paper alone (`makeEditions`
`only`). Not yet: the sister databases aren't in the backups (`backup.ts`).

**Done 5 Nov 2026 (v1.1.68-v1.1.74), the newsroom made simpler and safer:**
- Stale news fixed (v1.1.68). The engine answers only the newsroom on this computer (v1.1.69).
- Backups outside the app, in Settings' folder (Documents by default), the last 30, with a restore
  (`backup.ts`, v1.1.70); the data folder kept to a size, once a day and from Settings' "Free up space"
  (`tidy.ts`, v1.1.71: old versions after 3 days, copies' PDFs and page images after 30, photos after 90).
- Publish is gone from the newsroom (the website doesn't read the e-paper); "Save for CorelDRAW" is the
  main button; Gujarati calendar for ads; every screen word in Gujarati (v1.1.72).
- The newsroom reorganised (v1.1.73): Tonight's paper shows the page large, a story clicked opens its
  editor; Ads in 4 steps with a month calendar; Copies and sister papers together as Other papers;
  Settings' set-once cards under "More settings". The old screens still open, out of the sidebar.
- New checks (v1.1.74): `backend/test/rules.ts` reads the paper's rules off the pages apart from the
  gates (in both CI layout tests); `backend/test/screens.ts` opens every screen in Gujarati and fails on
  an error or English (in the `apps` workflow). `server.ts` split by area into `backend/src/api/`.
- **Open:** the Sample Herald (`sample-english`) runs a story down one column with no ad beside it: the
  engine's last way out of a one-column gap (`layout/engine.ts` solvePage `anyWidth`). Capital Kranti's
  saved days keep the rule. Its test reports it without failing until the engine is changed (needs a plan).

**A sister paper's own articles, title and footer** (5 Nov, v1.1.82; the developer, working on the
Urdu paper: "i want to add custom articles", then its masthead and printer's line "like this", a PDF
of Aman Ki Awaz's frame):
- Its own articles: "Your articles in this paper" on its Tonight's paper (Stories' articles tab), kept
  in its folder (`sister-papers/<id>/articles/<date>.json`, `editorial/articles.ts`) and printed in it
  alone, word for word, never translated, the day's story on the same news left out (`makeEditions`).
  A word-for-word article keeps its own title however short: one that couldn't fill a width was left
  out with "no setting keeps the desk's rules" (`blocks.ts`; S2 lets it through, `style.ts`).
- Its title and footer: a PDF of the paper's page size uploaded per day on its Tonight's paper
  (`sister-papers/<id>/frames/<date>.pdf`), drawn over its pages whenever its PDF is given out
  (`export/frame.ts`: Paper's Print PDF, Copies' sister papers). A day without its own takes the
  latest given before it, its dates ("Thursday, 05 November, 2026" in a standard font, as CorelDRAW
  writes it) changed to the day the paper carries (`printedDate`), spaced to keep their place.
  Its issue number ("Issue No. 65") counts on a day at a time from the date it is written for. Every sister paper has all of this. The pages still leave masthead,
  heads and last page's foot empty for it. The page pictures in the newsroom don't show it.
- Its Tonight's paper shows the run's timer and log as Capital Kranti's does; Copies is in its sidebar.
- CorelDRAW's PDF for the Urdu and Hindi papers (the father uses CorelDRAW): simple-font text can't
  carry joined letters, so their text is shaped by HarfBuzz (`harfbuzzjs`, in the paper's own font)
  and every letter drawn as a filled outline (`export/shapes.ts`): it opens as it prints, its words
  not retypeable there. A sister paper's has its title and footer too. **Not yet tried in CorelDRAW
  on Windows.** An "editable text" export (a folder of page SVGs, the font, the title PDF) shipped in
  v1.1.86 and was taken out in v1.1.87: the developer wants one PDF, not a folder.

**Designs and frames date themselves** (6 Nov, v1.1.89; the developer: "some titles have outdated
dates so date gets automatically adjusted and the aank number also", "do it for the day also"): a
copy's paper's design (Copies → designs) and a sister paper's frame get the day the paper carries
(`printedDate`) wherever they write a date — "તારીખ : 03-11-2026, મંગળવાર" in the old Gopika code,
"Date : 03-11-2026", "Thursday, 05 November, 2026" — its weekday (beside the date or on its own,
English or Gujarati, each typist's spelling: a letter typed whole or as half + stem), and the issue
number after "અંક" / "Issue No." counted on from the date the PDF was written for
(`export/redate.ts`). Only dates within 400 days of the day change (an RNI number's year never does).
The new text keeps its place; what follows on the line stays where it was (TJ adjustments). A design's
fonts are subsets holding only its own letters: a date they can't draw is written in the app's Gopika
(Gujarati fonts) or a standard font. Tried on 3 of the father's 33 designs (2 Nov) and Aman Ki Awaz.

**Copies' articles shortened to fit** (7 Nov, v1.1.93; the developer: "reword all the articles with ai
once", "shorten only the unticked ones" then "even ticked ones body can be shortened", "don't touch
titles", "not a hard limit"). Root cause of 6 Nov's white and blank front pages: each customer's article
had one fixed length, and stories side by side must end level -- three fixed lengths never do. Now:
- `editorial/shorten.ts`: once per day and set of articles, before any copy, each article's body (each of
  its texts) is written by the AI at 3-4 shorter lengths round what suits the day (the day's paper's printed
  words, less Telegram news and 30% kept for the day's news, shared over the articles; never under 100
  words), each checked against the original (numbers, `facts.ts checkShortened`, no letter the font can't
  print that the original hasn't: a customer's "✓"). Cached (`shorten1|`, `artcuts|date|`), so every copy
  and a re-run reuse it. Titles, sub-headings and photos untouched and still turning per copy.
- `ladder.ts`: an article's rungs are those lengths (and sentence cuts down to the next), its whole text too
  on a day with room. Ticked still means printed in every copy (S16).
- The planner tells apart too short, too tall, in between, and no design of these widths at all (it was
  "too tall" for all of the last: the front page was emptied a story at a time). On pages with articles the
  engine reacts to each (a story written to fit added; a lesser story swapped; a page of fixed lengths
  given one that can change); pages without articles behave exactly as before (the day's paper).
  A page of nothing but must-print articles moves one away rather than staying blank.
- Test (one copy of 6 Nov, 15 articles, 4 ticked): READY, no white space, all 15 printed, 2.3 min, ~₹0.2.
- **v1.1.94 (7 Nov) fixed:** a copy's lead is a story with a photo and 250 words or more (a short article
  drawn first left the front page unlaid); gate 3 no longer compares customer articles (they keep their own
  headlines); a page that sends back a story it was given doesn't take it again; numbers: a name's Roman
  numeral ("Tara Polaris I" written ૧) is known, and a translation's saved number flag is checked again at
  the gates. Test copy: READY, no gaps, 1.0 min.
- **v1.1.95:** a shortened length that says a sentence twice has that sentence taken out rather than being
  thrown away (6 Nov's 873-word article got no shorter length; now 15 of 15 do).
- **v1.1.96:** the paper's own website as a source, allowed on all pages (the user, 7 Nov): its published
  stories (`/api/paper` in the website repo) taken after the official sources, duplicates left out, printed
  as written; Aavtikal's articles fill a thin day before AI features (`ingest/site.ts`). 7 Nov: 80 listed,
  72 taken on a scratch copy (5 duplicates, 3 with letters the fonts can't print), 0 government photos.
- **v1.1.97:** the bugs from the 11 Nov audit (logs of 8-11 Nov, the whole app tested on a scratch copy):
  a fact check the AI didn't answer no longer passes (gate 6b, the stories named on the Review screen;
  unread ones read again, stopping at the first that fails again); at most 15 stories weighed per page and
  30 from the website (11 Nov's 123 stories took 25 minutes to lay out); PIB not answering has a clock
  limit (9 Nov hung 21 hours): after it the paper is made from the other sources, or "No internet" on
  the Today screen; the evening timer stops a run left over from an earlier day; the lead is chosen
  among stories whose photo can print sharp (S13 looped five builds); a story the fonts would print with
  letters missing (3 or more) is left out; the browser closing mid-step retries that step once; the Mac
  updater's leftovers (2.4 GB) cleared; progress never goes back; the engine logs rotate past 5 MB;
  24-hour times in Gujarati. **Not fixed:** the engine answers slowly while it lays out (up to 33 s; layout
  in a worker thread would cure it); why the browser closed mid-step isn't proven (low memory suspected);
  28 lint style warnings (set-state-in-effect), not crashes.
- **Open:** on 6 Nov's copy the first try still leaves page 4 unlaid. Measured (7 Nov): its stories fit by area
  (37-63 thousand against 47 thousand of room), yet none of the ~700 designs drawn can be made any height
  (every one "neither too short nor too tall"), so it is read as "no design of these widths", a narrow story
  is added and its stories are held back one by one. The second try (stories shared again) is clean (~30s).
  Not a lack of room: the designs drawn for it can't come out level; look at how designs() is drawn for a
  page with one very tall story before changing the hold-back rules.

**"Always print" per article** (7 Nov, for v1.1.93, committed on the branch, not yet released; the developer: "all the copies atleast include ones i
tick"): each article in Copies has a tick box, unticked to begin with. A ticked one is must-print
(source `fixed:copy`, priority 2): gate S16 checks it, the rescue puts it in the place of lesser stories.
An unticked one (`given:copy`, priority 1) is still kept word for word (`wordForWord`) and tried first,
and the rescue gives it a page only where that page still comes out exact; otherwise it gives way
(log: "left out: no room for it"), and the copies prefer a try that prints it (`badness`, 100 a story).
Tried with 24 articles (5,820 words, 8 ticked) on one copy of 6 Nov's: all 24 printed, but the front
page kept two white stretches from the engine's last-resort page; about 3,500 words of articles per
4-page copy is what fits cleanly. Not yet seen: an unticked article actually giving way.

**Every article given prints** (7 Nov, v1.1.92; the developer: "none of the articles should be
missed"): 16 articles were given and the engine took the first 10 without a word
(`takeArticles` sliced them); now up to 30 are taken and more is refused with a message, as are more
than 12 titles, texts or photos to an article. In the layout a customer's article could still be held
back from a crowded page like any story, and three of five copies left one or two out: what must print
and has no place at the end goes in the place of lesser stories (an article first, then the editor's
Telegram news), the page laid out again (`layout/engine.ts`, "must print"); never swapped out by the
last-round fallback; gate S16 fails a copy missing one, and the copies keep the try that prints them all
(`badness`). Tried with 16 articles on one copy of 6 Nov's: all 16 printed, no white space, 3.4 min.

**Copies with many fixed articles** (7 Nov, v1.1.91): ten of a customer's articles (kept word for word)
and five Telegram items were all first in line for every page, so no page's choice of stories worked
and copies 2-4 came out with a blank front page before a retry. The editor's news and the articles
are still tried first in line; when that can't work, each page takes its fair share of them, or one
or two fewer (`share` in `layout/engine.ts`). A page the planner knows is too tall no longer gets a
story added back as "short of copy" (it went back and forth round after round). Tried on one copy
of 6 Nov's: all 4 pages solved first time, no white space, 1.6 min.

**In the design's own font** (6 Nov, v1.1.90; the developer: "the date and day's typography looks
odd"): a date a design's subset can't draw is written in the same font whole, found by its name among
the app's fonts and the computer's (Windows' Fonts folders on the paper's PC, where the Bharati fonts
are), put in a copy of its font entry for the new text alone; the app's Gopika only when the computer
hasn't got it (on this Mac, B Bharati TitleTwo). No letter-spacing nudge any more (a wider one is drawn
up to 3% closer). "Can it draw it" now means the glyph has a shape (a cut-down font keeps empty places:
a ન came out as a box).

**Copies on their own screen; the 8-page paper on Paper** (6 Nov, v1.1.88): the sidebar has "Other
papers" (the sister papers, `newsroom/others`) and "Copies" (`newsroom/copies`, with the designs)
apart. Paper has a 4 / 8 pages switch once the evening's 8-page paper is made: its pages shown (to
look at; stories are changed on the 4-page paper), its Print and CorelDRAW PDFs. Its page pictures
are drawn from its kept layout the first time they're asked for (`export/eight-images.ts`,
`/api/issues/<date>/pages8[/<n>.png]`), beside the day's own pictures, again when it's made again.

**The Urdu paper packed tight like a real Urdu daily** (5 Nov, v1.1.80-81; the user's picture of Aman Ki
Awaz, page 16, then a closer crop: "we want this level of density"): body 11/14pt (13/22 in v1.1.79,
12/16.5 in v1.1.80), headlines at 1.15 line spacing and sub-headings at 1.25, 3pt between stories,
2pt after headlines and sub-headings, captions 9.5/12.5. At this density a letter's tail now and then
touches the line under it, as in printed Urdu dailies; the developer chose to allow small touches
(v1.1.81): the body's `type.body.linesMayTouch` 0.2 (a share of the size) marks its lines `mayTouch`
(`build.ts`), and the plotter lets letters of one story's marked lines meet that deep (`plot.ts`);
letters into a photo, rule or another story are still overlaps. At 13.5pt lines there were 2-10 touches
a paper. Test paper on 4 Nov's news: ready first try, 34 stories, no gaps, 73 seconds, about ₹0.21.

**The Urdu paper on Jameel Noori Nastaleeq** (5 Nov, the font the developer brought, with permission to
ship it): body 13/22pt (11/14 since v1.1.81), headlines and sub-headings thickened in print (the font has no bold: the fonts'
`embolden`, `build.ts`); the Noto files stay beside it unused. Its columns end level by its profile
(`type.body.levelColumns`): on every paper the same rule left the Sample Herald a 56pt hole no filler
fitted (its own 4-column story ends 2 lines apart: **open**, all papers level needs a plan).

**Urdu columns end level** (5 Nov, released with Jameel Noori Nastaleeq) (the user's screenshot: a 4-column Urdu story
ending 5-5-4-4 lines, a white gap under it):
- Why: Urdu's letters join, so a line stretches at its word spaces alone; at five words a line almost
  no paragraph could set a line looser or tighter (7 of 129 at the old limit), which is how a story's
  columns are ended level. 15 of 20 stories on the test paper ended a line uneven, under the gap
  check's line and a half. The Gujarati paper of 4 Nov had none.
- Urdu's word spaces may spread to 3 times the font's own (`type.body.wordSpaceMax`, profile; 2 for
  every other paper): 70 of 129 paragraphs can then take a line more.
- A story's setting records the lines its columns end short (`Module.short`, `module.ts`); the layout
  takes a level setting wherever the story has one at that width, and a width with none costs more
  (`blocks.ts`); gap fillers must end level; gate 2 fails on any uneven story.
- GPT-6 Luna is a thinking model: 7,000 tokens of thought over a 300-word Urdu story, 60 seconds, and
  the test papers took an hour. The Urdu paper sets `editorial.reasoningEffort` "low" (11 seconds, a
  seventh of the cost); fact checks always think in full (`openRouter(..., thinkInFull)`). **The
  Gujarati paper's Luna calls still think in full** (not changed: its writing untested at "low").
- The test paper (4 Nov, on a copy): under 2 minutes, no gaps, no uneven columns. **Open:** an ad that
  leaves a one-column strip can't be filled in Urdu (its headlines run too long down one column; the
  scratch copy's test ad on page 4 left the page unlaid); headline order now and then.

**Done 5 Nov 2026 (v1.1.76), a translated paper cheaper and packed tight** (the user: ₹62 for the
Urdu paper's translation was too much, and its columns ended uneven):
- Translated by GPT-6 Luna (`edition-ur` `translateModel`; the user chose it after a blind A/B with
  Gemini: about 15 times cheaper, as good to read). The Hindi paper is still on Gemini.
- Its stories' order is fixed first, then they're translated down it 10 at a time only until there's
  copy for its pages 1.35 times over (`TRANSLATE_BATCH`, `build.ts`): 38 of 59 on 4 Nov. The editor's
  news always.
- Its stories are written to their slots like a copy's (`toFit`), in its own language from the
  release's facts and read against it; the fits are cached per language (`fitKey`, `rewrite.ts`). A
  whole translation can't be fitted, so its columns ended a line apart. The longest a story may be
  written grows with how much longer its translation ran (`longerBy`: Urdu ~1.37 times the Gujarati
  words; capped at the release's word count, the stories came out short and page 4 had a gap).
- A translation with letters of another script (Luna spelled "Jadhav" in Hindi letters inside Urdu)
  is done again once, then left out (`foreignLetters`, `layout/stories.ts`).
- The test paper (4 Nov, on a copy): ₹8.60 from nothing cached (four layout tries), no white-space
  gap, no touching lines. **Open:** headline order now and then (a long Nastaliq headline shrinks below
  a lesser one's); a "50 lakh" flagged against an English "5 million" (the Gujarati story has the same
  flag); the Hindi paper's new translate flow untested by a real paper.

**Done 5 Nov 2026 (v1.1.75), the Urdu paper back** (the user: "make urdu paper on capital kranti sized
and grid paper, just like we make its hindi"): `ur-1` is in the sister papers again and Urdu in Copies.
- Its fonts are static instances of Noto Nastaliq Urdu made by `scripts/urdu-fonts.py` from the variable
  file beside them: a word space of 0.24 em (the font's own 0.132 em was as wide as the gap after a
  letter that doesn't join forward, so words ran together), and the variable font's fault mended (its
  bold "ھ" after "د" is 1500 units wide for 731 of ink: bold "گاندھی" printed "گاند ھی"). Static fonts
  stay fonts in the PDF (the variable one was written as Type 3, failing the preflight).
- `edition-ur/profile.json`: bold headlines (24pt at the least, Capital Kranti's rank steps, 3 lines),
  semi-bold sub-headings, no kickers, body pitch 24pt (tall stacked loan words reached the line above),
  the next day's date, 100 words the shortest story, the front lead may run full width.
- The print check (`shared/src/plot.ts`) compares letters, not boxes: where two words' ink boxes cross
  (or a word's and a photo's or rule's), both are drawn and only letters that meet are an overlap. A
  Nastaliq word's box is mostly empty: 57 false overlaps on the first Urdu test, 1 real one now.
- The test paper (4 Nov's news, on a copy): 4 pages in about 2 minutes, ₹62 the first time (translation),
  nothing when its wording was kept. **Open:** a real touch now and then where a tall loan word
  ("یکجہتی") sits under a deep tail; the Hindi paper still lacks `minWords` 100, `kicker.none` and
  `leadFullWidth` (not changed: untested).

**Done 3-4 Nov 2026 (v1.1.63-v1.1.67):**
- Every Telegram news of the editor's in every copy; photos never blown up (150 ppi, but the narrowest,
  2 columns, may go to 100: `leastPpi` in `layout/module.ts`, else PIB's 466-pixel photos went missing);
  a customer's article with several photos prints 1, 2 or 3 of them, varying across copies.
- **The 8-page paper** (the father's request, 3 Nov), made every evening after the 4-page one (pipeline
  step `sections`): pages 1-3 the day's, page 4 laid out again as an inside page, then business, tech &
  AI, entertainment, sports (profile `sections`, `ingest/sections.ts`, `editorial/sections.ts`; stored
  under the day `<date>+sections`, `store.ts sectionsDay`). Fact problems on pages 4-8 are written again
  and laid out again. Newsroom: Today and Paper screens have its PDF and its CorelDRAW PDF
  (`/api/issues/<date>/pdf8`, `editable8.pdf`); ads may be booked on pages 5-8; Copies can be 4 or 8 pages.
- **File photos on pages 5-8** (`ingest/commons.ts`): only the one named person a story is about, their
  own Wikipedia lead photo (exact name + what they are), free on Commons, credited in Gujarati under it,
  looked at by a vision AI before it prints, once per paper. A wrong photo is worse than none: the first
  try (matching photos by words) printed a wrong person, a map and a painting. Wikimedia's robots rules
  keep programs off `commons.wikimedia.org/w/`: use `api.wikimedia.org` and `/wiki/File:` pages only.

**Open, in order:**
1. Business and tech pages usually have no photos (their news is about companies). Option offered, not
   agreed: PIB's own photos of ministers and government events.
2. Sister papers (editions) in 8 pages; 8-page copies' pages 5-8 are the same in every copy (only
   1-4 differ): reword their headlines per copy if customers mind.
3. A customer's 4-page design on an 8-page copy: its pages 1-3 on 1-3, its footer on 8, pages 4-7 bare.
4. Promised, not started: Gandhinagar local news sources for pages 1-4 (TV9 Gandhinagar, Indian Express
   Ahmedabad, TOI Ahmedabad: check each one's robots rules first).
5. The third engine is still on trial behind Settings' switch (14 clean evenings before it's the default).

**How the last sessions tested (on the Mac):**
- Scratch copy: `sqlite3 "file:$HOME/Library/Application Support/Capital Kranti/capital-kranti.sqlite?mode=ro" ".backup <scratch>/capital-kranti.sqlite"`,
  and copy that day's `media/<date>` folder beside it. Run the CLI with `DATA_DIR=<scratch> CK_PAPERS_HOME=<scratch>
  CK_ENV_FILE="$HOME/Library/Application Support/Capital Kranti/settings.env"` (the app's AI key, never printed)
  and `CK_PLANNER=1`: `cli.ts all --date D --from build` makes the 4-page and the 8-page papers;
  `cli.ts copies --date D --count 1 --pages 8` one 8-page copy. Look at the PDFs (`pdftoppm`) before saying it works.
- Before a release: `npx tsc --noEmit -p backend`; the four CI layout runs (`backend/test/pack-0808.ts` with
  `CK_PUBLICATION=dev-test`, `sample-english.ts` with `CK_PUBLICATION=sample-english`, each once plain and
  once with `CK_PLANNER=1`, each in a fresh temp `DATA_DIR` with `CK_ENV_FILE=/dev/null`): all READY;
  `cd web && NEWSROOM=1 npm run build`.
- Release: merge to `main`, push, `git tag vX.Y.Z && git push origin vX.Y.Z`, then read the release
  workflow's result through the GitHub API (`gh` isn't installed): both builds (windows-latest,
  macos-15) and 7 files attached, before telling the user it works.
- The website is in its own repository (§8): don't work on it here.

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
   - **Copies** (`editorial/copies.ts`, the build's copy mode): N copies of the day's paper, reworded by the AI (headline / + sub-heading / + text, numbers checked), laid out afresh (anywhere keeping the lead / anywhere / same page), the masthead, page headers and footer left empty for CorelDRAW any number of the customer's articles word for word, each with any number of titles / sub-headings / texts / photos taken in turn (27 Oct, `articleFor`), (or, 27 Oct, printed on the design of the paper the copy goes to: one full-page PDF per paper from CorelDRAW, paired one to one with the copies, stamped when a copy is fetched or saved to Downloads, copies saved before stamped too: `export/designs.ts`), a copy that comes out like another (or with a layout check failing) laid out again; PDFs in `out/copies/<date>/`;
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
     - it halves the gap to find the day's edge, then reads out both ways, one page a second, until 100 pages are past the day;
     - it saves the Gujarati, Hindi and English lists together;
     - 23 Oct took about 14 minutes (43 Gujarati, 76 Hindi, 84 English, in 833 numbers);
     - **the edges are ragged** (2327294 is the 23rd, 2327300 the 22nd), hence reading both ways.

     This method came from the user's brother's scraper; it only reads pages PIB serves to programs.

5. **Short days (24 Oct, v1.1.5-v1.1.6):** a Saturday's PIB filled under half the paper, the slogan stretched to a third of the front page, and pages 3-4 were left empty in places. Now:
   - the slogan panel is one fixed size (`fillers.messageCols`/`messageHeight`), once a paper, claimed before any wait;
   - the top-up translates PIB's **English** releases as well as Hindi, ranks every one that is news, and keeps late translations as spare copy;
   - **two more Gujarati sources** (`ingest/official.ts`): the Gujarat CM's office (cmogujarat.gov.in/gu/news) and All India Radio's Gujarati news (newsonair.gov.in/gu, day archives), both open to programs; repeats of the day's news are left out; photos only from the CM's office (AIR's are often agency pictures);
   - still short: feature articles suited to the time of year, as many as the pages need, printed like the news (the user asked for no special design), on the inside pages;
   - the number check reads English number words and "આઠ હજાર 224", and the build checks saved flags again;
   - stories start 5pt under the page header (`spacing.underHeader`).

6. **Speed, the time meter and print fixes (24 Oct, v1.1.7):**
   - **The time meter:** the Today screen shows a clock from the run's start and each step's time (and its parts: each source, layout planning, review…), the slowest marked; every run's record is in its log ("time: …") and its job. Copies and sister papers have their own (`Batch.times`).
   - **Measured on 24 Oct (cold, nothing collected ahead), before → after:** the day's paper 9.1 → 4.2 min (fetch 0:56 → 0:41, writing 2:01 → 0:32, translating 2:14 → 1:20, features 0:49 → 0:22, layout 3:06 → 1:15); the 5 sister papers 18.6 → 1.6 min after it. (The page review didn't run in the "after" layout: the OpenRouter key's $5 limit ran out; at 4 pages at once it adds ~30 s.)
   - **How:** every AI request of a step goes out at once (`openRouter` retries 429/502/503 with a growing wait; no cap of our own); the 4 pages reviewed at once; features asked in one batch of requests; PIB, the CM's office and All India Radio read side by side, each site at its own pace; the hourly collection also reads PIB's Hindi and English releases, the other sources, writes the day's stories, and from 5 PM translates (`collectHourly`; a run waits for it, `pipeline.ts collecting`); copies and sister papers do all their wording first, every paper at once in light workers (`prepareAll`, started beside the evening layout by `prepareEditions`), then lay out two at a time.
   - **White space in copies:** pages the new engine couldn't solve went to the old engine, which left gaps. Now every page's last try has a filler slot (up to 4 columns), and a story that can't take a strip's width over one of several side-by-side ads takes a width it can with a filler beside it (`designs.ts`). The Urdu paper is still slow and gappy (its Nastaliq font was never tuned).
   - **Fixes:** marks Gopika draws as letters (`@` as જ, `[` as ચ, `{` as મ, `"` as ×…) set in the Latin face (`LEGACY_TAKEN`, measure.ts); sub-heading 0.6 of the headline (was 0.45); a translation's "。" and Urdu's "₹"; number checks read millions/crores/lakhs as each other.
   - **More news:** All India Radio's sections kept (national, international…); its English service's world news (up to 4 a day) translated; the build keeps the best 3 national and 2 world stories in the paper.

7. **Self-repair and a faster cold run (24 Oct, v1.1.9):**
   - **Measured cold (nothing collected ahead) on 24 Oct:** the day's paper 3:20, READY (fetch 0:21, writing 0:27, translating 0:51, layout 1:40 with one repair); the 4 sister papers about 3 min after it, all clean on the first try.
   - **Faster:** PIB read 4 pages at once a quarter-second apart, backing off to one at a time on trouble (`pib.ts slot`); every photo of a release at once; the Hindi and English releases read in the first step (`readForeign`); the CM's office and All India Radio 3 at a time each; world news translated beside the PIB top-up; the editorial plan beside the AI-written sub-headings; the page review after the paper is saved (`reviewSaved`; gate 5 says "running", the newsroom looks again every 15 s).
   - **Self-repair (`pipeline.ts` build step, `editorial/repair.ts`):** after the checks, a story with a number its source doesn't have is written again told to leave it out, and a failed layout check lays the paper out another way (`seedShift`), twice at most; what can't be mended stays for the editor.
   - **Fixes:** a word-final halant dropped ("કાર્યરત્" isn't in Gopika); filler slots never shorter than six lines (`FILL_MIN`); Hindi body lines broken at 98.5% of the column and justified to 98% (it prints ~1.4% wider than it measures).
   - **No Urdu paper** for now (the user's decision): its Nastaliq never set right; it waits for the fonts and layout the user will give. Kept in the code (`edition-ur`), left out of the sister papers and the Copies screen. (Back on 5 Nov, v1.1.75: see above.)
   - **Next agreed:** sister papers that never keep a blank (a last fill that always succeeds), up to three arrangements keeping the best, the page review for them too, and a release test that replays recent real days; then a Gemma-vs-current translation test (Gemma 4 26B is ~15x cheaper than Gemini 3.8 Flash; the free one is rate-limited and lacks strict JSON).

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
3. The **release** workflow creates the release and builds two installers and attaches them to it in about 30 minutes:
   - Mac Apple silicon on `macos-15`;
   - Windows on `windows-latest`.

The installer names never change, so these links always serve the newest release:
- `…/releases/latest/download/Capital-Kranti-mac-arm64.dmg`
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
- **No Intel Mac build** since 26 Oct 2026 (the user's request); an Intel install already out there stops getting updates.
- **Test what ships.** Earlier checks ran the engine before packing and so missed packing bugs. The workflow now checks the packed app: its signature, its contents, and that its engine starts.
- **Release builds use the workflow from the tagged commit,** so a fix needs a **new** release; re-running an old one won't pick it up.
- **Check the real thing, not a proxy.** For example: the PDF's *content* position, not just its page size; the console 404s, investigated rather than hidden (they were real: the newsroom asked for issues before they existed, and photos had no engine route).

---

## 7. What's next

Releases: **v1.1.67** is the latest (4 Nov; the list below is from October, see the top of this file for what's open now) (check the release workflow's result
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

## 8. The website

The website, Aavtikal and their news engine moved to their own repository on 31 Oct 2026:
`smit061205/capital-kranti-website`, folder `/Users/smitthakkar/CapitalKranti_Website`. Its `CLAUDE.md` and
`HANDOFF.md` carry on from here; this repository's history keeps everything up to the move.
