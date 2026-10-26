// Builds one day's issue end to end: chrome for every page, the day's ads,
// the planner's stories; validated against the render contract, checked with
// the frontend's own plotter (no text may overflow or run into anything),
// saved as a draft, and printed to PDF.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IssueRenderSchema, type Element, type IssueRender, type TextElement } from "@ck/shared/contract";
import { printIssue } from "@ck/shared/pdf";
import { assetFile, OUT_DIR, PLOT_ORIGIN } from "./config.ts";
import { chromeFor, printedDate } from "./chrome/chrome.ts";
import { Measurer } from "./layout/measure.ts";

import { planDay } from "./editorial/plan.ts";
import { preflight } from "./export/preflight.ts";
import { cmapCoverage } from "./fonts/cmap.ts";
import { reviewPages } from "./editorial/review.ts";
import { fitCalls, isSpeechText, numbersNotIn, speechTwin, writeDeck } from "./editorial/rewrite.ts";
import type { FillerCount } from "./layout/fit.ts";
import { layOut, type EngineResult } from "./layout/engine.ts";
import { headlineHeavy, outranks, Packer, tombstoned, type PagePlan } from "./layout/pack.ts";
import { removed } from "./layout/text.ts";
import { applyTextEdits, dedupe, droppedBy, inPaperLanguage, referenceAds, standInsMovable } from "./layout/stories.ts";
import { arrangeAds } from "./layout/ads.ts";
import { findGaps } from "./layout/occupancy.ts";
import { styleChecks } from "./layout/style.ts";
import { buildFingerprint } from "./fingerprint.ts";
import { acquireBrowser, releaseBrowser } from "./browser.ts";
import { spanWidth } from "./layout/module.ts";
import { DPI, FACES, FONTS, GRID, MAX_STORY_COLS, PAGE } from "./layout/typography.ts";
import { profile } from "./profile.ts";
import { storyIdOf, type Progress, type Store, type Story } from "./store.ts";

type Opts = { log: (s: string) => void; issueNumber?: number; pages?: number; noReview?: boolean;
  /** the page review left to run after the paper is saved (reviewLater): the paper is ready a minute sooner */
  reviewLater?: boolean;
  /** another arrangement of the same day (a repair after a layout check failed): 0 the day's own */
  seedShift?: number;
              /** how far the build has got: planning the pages, finishing each, checking (pipeline.ts) */
              progress?: (p: Progress) => void;
              /** page images even when the fonts may be served (tests read them) */
              images?: boolean;
              /** one of the day's copies (editorial/copies.ts): laid out afresh, never saved as the day's issue */
              copy?: CopyOpts };

/** A copy of the day's paper: its stories in other places, reworded, its
 * masthead, page headers and footer left empty for the paper's own. */
export interface CopyOpts {
  /** a random number in [0, 1), the same every time for the same copy */
  rng: () => number;
  /** how far the stories move: "keepLead" (anywhere, the day's lead stays the
   * front page's), "anywhere" (any story anywhere), "samePage" (each on its page) */
  shuffle: "keepLead" | "anywhere" | "samePage";
  /** each story's page in the day's paper (for "samePage") */
  pageOf: Map<string, number>;
  /** the day's lead story (for "keepLead": the front page's in every copy) */
  lead?: string;
  /** the stories as this copy words them */
  reword: (pool: Story[]) => Promise<{ pool: Story[]; cost: number }>;
  /** where this copy's PDF goes */
  pdfPath: string;
  /** the store the gap closer caches its length fits in (a reworded body has its own) */
  store?: Store;
  /** the stories come in another language (`reword` translates them): not filtered by language until then */
  translate?: boolean;
}

/** The sample ads (the paper's own stand-ins for a day with nothing booked) as
 * the editor keeps them: printed at all (setting samplesOn), and which of them
 * not (samplesOff) -- taken out of every paper laid out after, for good. */
export function sampleAdsOf(store: Store) {
  const ids = new Set(referenceAds("").map((a) => a.id));
  const on = store.setting("samplesOn", true);
  const off = new Set(store.setting<string[]>("samplesOff", []));
  return { isSample: (id: string) => ids.has(id), use: (id: string) => on && !off.has(id), on, off };
}

/** Gate 5's word while the page review runs after the paper is saved (reviewSaved). */
export const REVIEW_RUNNING = "the page review is running";

/** The page review of a saved issue, run after it (Opts.reviewLater): its
 * findings and gate 5 written into the stored report, "ready" again from all
 * the gates. Returns the report, or null if there's nothing to review. */
export async function reviewSaved(store: Store, date: string, version: number, log: (s: string) => void = () => {}) {
  const dir = pageImageDir(date);
  const got = store.issueVersion(date, version);
  if (!got) return null;
  const report = got.report as BuildReport;
  const images = Array.from({ length: report.pages }, (_, i) => path.join(dir, `${i + 1}.png`)).filter((f) => existsSync(f));
  const review = images.length ? await reviewPages(images, { log }) : null;
  const confident = (review?.findings ?? []).filter((f) => f.confidence >= 0.8);
  const gate = report.gates.find((g) => g.gate.startsWith("5 "));
  if (gate) {
    gate.pass = !!review && confident.length === 0 && !review.unreviewed.length;
    gate.detail = !review ? "not run (no API key or no page images)"
      : review.unreviewed.length ? `page(s) ${review.unreviewed.join(", ")} not reviewed (the model didn't answer)`
      : confident.map((f) => `p${f.page} ${f.issue} "${f.where.slice(0, 30)}": ${f.note}`).join("; ") || `ok (${review.findings.length} minor note(s))`;
  }
  report.review = review?.findings ?? [];
  report.cost = (report.cost ?? 0) + (review?.cost ?? 0);
  report.ready = report.gates.every((g) => g.pass);
  store.updateReport(date, version, report);
  return report;
}

/** The day's own seed for the layout's choices: the same day, the same paper. */
const seedOf = (date: string) => Number(date.replace(/-/g, "")) % 2 ** 30;

/** Where a day's page images go (served by the API for the website). */
export const pageImageDir = (date: string) => path.join(OUT_DIR, "pages", profile.id, date);

/** Issue numbers count every day from the profile's reference issue. */
export function issueNumberFor(date: string): number {
  const { referenceDate, referenceNumber } = profile.issue;
  // (the number of the date it carries: the next day's, for a paper made the evening before)
  const days = Math.round((Date.parse(`${printedDate(date)}T00:00:00Z`) - Date.parse(`${referenceDate}T00:00:00Z`)) / 86_400_000);
  return referenceNumber + days;
}

export interface BuildReport {
  date: string; version: number; issueNumber: number; pages: number;
  placed: { page: number; story: string; headline: string; variant: string; cols: number; rank: number; source: string }[];
  /** column stretches left empty (taller than 1.5 body lines), pt */
  whiteSpace: { page: number; col: number; height: number; y: number }[];
  leftOut: { story: string; headline: string }[];
  warnings: { page: number; elementId?: string; kind: string; detail: string }[];
  pdf: string;
  /** the inputs and engine this issue was built from (fingerprint.ts) */
  fingerprint: string;
  gates: { gate: string; pass: boolean; detail: string }[];
  ready: boolean;
  /** the page reviewer's findings, for the editor */
  review: { page: number; issue: string; where: string; confidence: number; note: string }[];
  /** OpenRouter spend on this build (length fitting), USD */
  cost: number;
  /** the editorial plan's rank and reason for each story (editorial/plan.ts), for the editor */
  plan: { id: string; rank: number; reason: string }[];
  /** how long each part of the layout took (ms) and the AI length fits it asked
   * for, and the memory the engine and the computer had (MB) -- for making it faster */
  timing?: { preparing?: number; planning: number; fitting: number; print: number; review: number; checks: number; total: number; fits: number;
             engineMb: number; freeMb: number };
  /** spacing and fill measures, and the loosest body lines (for the editor) */
  style: ReturnType<typeof styleChecks>["stats"];
}

/** How much of the day's pages its copy fills at its natural size (1 = all
 * of it, the way buildIssue measures it), and a way to measure a story the
 * day might add -- for the Hindi top-up (editorial/translate.ts), which
 * translates until the copy is enough. close() when done. */
export async function fillContext(store: Store, date: string): Promise<{
  room: number; content: number; share: () => number; areaOf: (s: Story) => Promise<number>; close: () => Promise<void>;
}> {
  const total = profile.issue.pages;
  const samples = sampleAdsOf(store);
  let ads = standInsMovable(store.ads(date)).filter((a) => !samples.isSample(a.id) || samples.use(a.id));
  if (!ads.length && !store.ads(date).length) ads = referenceAds(date).filter((a) => samples.use(a.id));
  const m = await Measurer.open(FONTS, FACES);
  try {
    const chrome: Awaited<ReturnType<typeof chromeFor>>[] = [];
    for (let i = 0; i < total; i++) chrome.push(await chromeFor(i + 1, total, date, issueNumberFor(date), m));
    ads = chrome.flatMap((c, i) => arrangeAds(ads.filter((a) => a.page === i + 1), { top: c.bodyTop, bottom: c.bodyBottom }));
    const room = chrome.reduce((sum, c, i) => {
      const band = (c.bodyBottom - c.bodyTop) * spanWidth(GRID.columns);
      const adArea = ads.filter((a) => a.page === i + 1).reduce((t, a) =>
        t + a.width * Math.max(0, Math.min(a.y + a.height, c.bodyBottom) - Math.max(a.y, c.bodyTop)), 0);
      return sum + Math.max(0, band - adArea);
    }, 0);
    const edits = store.edits(date);
    const dropped = droppedBy(edits);
    const pool = dedupe(applyTextEdits(store.stories(date), edits).filter((s) => !dropped.has(s.id) && inPaperLanguage(s)))
      .sort((a, b) => a.priority - b.priority || b.bodies.long.length - a.bodies.long.length);
    const packer = new Packer(m);
    const ctx = {
      room,
      content: (await Promise.all(pool.map((s, i) => packer.naturalArea(s, i === 0)))).reduce((a, b) => a + b, 0),
      share: () => ctx.content / room,
      areaOf: (s: Story) => packer.naturalArea(s, false),
      close: () => m.close(),
    };
    return ctx;
  } catch (e) {
    await m.close();
    throw e;
  }
}

export async function buildIssue(store: Store, date: string, opts: Opts): Promise<{ issue: IssueRender; report: BuildReport }> {
  const { log } = opts;
  // how long each part takes (report.timing)
  const began = Date.now();
  const timing = { start: Date.now(), preparing: 0, planning: 0, fitting: 0, print: 0, review: 0 };
  let fitsBefore = fitCalls();
  let stories = store.stories(date);
  if (!stories.length && store.releases(date).length) {
    const { rewriteDay } = await import("./editorial/rewrite.ts");
    await rewriteDay(store, date, { log });
    stories = store.stories(date);
  }
  if (!stories.length) throw new Error(`no stories for ${date}: ingest and rewrite the day first`);
  // the sample ads, as the editor keeps them (the Ads screen): all off, or some
  const samples = sampleAdsOf(store);
  let ads = standInsMovable(store.ads(date)).filter((a) => !samples.isSample(a.id) || samples.use(a.id));
  if (!ads.length && !store.ads(date).length) {
    // (all of them kept for the day, so one turned back on returns; the ones in use printed)
    const all = referenceAds(date);
    for (const a of all) store.putAd(a);
    ads = all.filter((a) => samples.use(a.id));
    if (ads.length) log(`no ads booked for ${date}: placed the sample ads`);
  }
  const total = opts.pages ?? profile.issue.pages;
  const issueNumber = opts.issueNumber ?? issueNumberFor(date);

  const m = await Measurer.open(FONTS, FACES);
  let planCost = 0;
  let planEntries: BuildReport["plan"] = [];
  let result!: { pages: Map<number, Element[]>; placed: { page: number; story: Story; variant: string; cols: number; rank: number }[];
                 gaps: { page: number; col: number; y0: number; y1: number }[]; leftOut: Story[];
                 plans: PagePlan[]; spent: number; factChecks: { story: string; detail: string }[] };
  const chrome: Awaited<ReturnType<typeof chromeFor>>[] = [];
  try {
    for (let i = 0; i < total; i++) chrome.push(await chromeFor(i + 1, total, date, issueNumber, m, { blank: !!opts.copy }));
    // the ads the layout may place go to the foot of their page (layout/ads.ts)
    ads = chrome.flatMap((c, i) => arrangeAds(ads.filter((a) => a.page === i + 1), { top: c.bodyTop, bottom: c.bodyBottom }));
    // content-sized pages (layout/pack.ts): every page packed in turn from the
    // stories not placed yet, most important first
    const edits = store.edits(date);
    const dropped = droppedBy(edits);
    const releases = new Map(store.releases(date).map((r) => [storyIdOf(r), r]));
    // a feature article (editorial/features.ts) is its own source: the gap
    // closer can lengthen it or brief it from its text, and the number check
    // against a text with no numbers keeps it free of them
    for (const s of stories.filter((s) => s.id.startsWith("f-"))) {
      releases.set(s.id, { id: 0, date, url: s.source, office: s.source, headline: s.headline, subhead: s.deck,
                           body: s.bodies.long, photos: [], fetchedAt: "" });
    }
    // every story prints a headline, a sub-heading and its body: a story
    // without a deck gets its release's own sub-heading, else one written for it
    // (the release's own at once; those the AI writes, all together and beside the editorial plan below)
    for (const s of stories) {
      const sub = !s.deck?.trim() ? releases.get(s.id)?.subhead?.trim() : undefined;
      if (sub) { s.deck = sub; store.putStory(s); }
    }
    const decksRun = Promise.all(stories.filter((s) => !s.deck?.trim() && releases.has(s.id)).map(async (s) => {
      const deck = (await writeDeck(store, s, releases.get(s.id)!, { log }))?.deck;
      if (deck) {
        s.deck = deck;
        store.putStory(s);
      }
    }));
    // a speech's full text written up beside the event's own story (stories
    // written before the rewrite grouped them): the event's story is enough
    const speechDup = (s: Story) => {
      const r = releases.get(s.id);
      return !!r && isSpeechText(r) && stories.some((o) => o.id !== s.id && !dropped.has(o.id) && !!releases.get(o.id) && speechTwin(r, releases.get(o.id)!));
    };
    let pool = dedupe(applyTextEdits(stories, edits).filter((s) => !dropped.has(s.id) && !speechDup(s) && (opts.copy?.translate || inPaperLanguage(s))))
      .map((s) => ({ ...s, photos: s.photo ? [s.photo, ...(releases.get(s.id)?.photos ?? []).filter((u) => u !== s.photo)] : [] }))
      .sort((a, b) => a.priority - b.priority || b.bodies.long.length - a.bodies.long.length);
    // the editorial plan ranks the day's stories (an editor's own rank wins)
    const rankedByEditor = new Set(edits.filter((e) => typeof e.change.priority === "number").map((e) => e.storyId));
    const planned = await planDay(store, date, pool, { log });
    // the sub-headings the AI wrote meanwhile, on the stories laid out
    await decksRun;
    const deckOf = new Map(stories.map((s) => [s.id, s.deck]));
    pool = pool.map((s) => (s.deck?.trim() || !deckOf.get(s.id) ? s : { ...s, deck: deckOf.get(s.id)! }));
    if (planned) {
      const by = new Map(planned.plan.map((p) => [p.id, p]));
      pool = pool.map((s) => (!rankedByEditor.has(s.id) && by.has(s.id) ? { ...s, priority: by.get(s.id)!.rank } : s))
        .sort((a, b) => a.priority - b.priority || b.bodies.long.length - a.bodies.long.length);
      log(`  editorial plan: leads ${planned.plan.filter((p) => p.rank === 1).map((p) => p.id).join(", ") || "none"}`);
    }
    planCost = planned?.cost ?? 0;
    planEntries = planned?.plan ?? [];
    // a few of the day's biggest national and world stories always in the
    // paper (24 Oct: the editor asked for them), the best ranked of each kind
    // raised to where the pages take them -- All India Radio says which is which;
    // PIB's releases from Delhi, translated, are national news
    const kind = (s: Story) => (s.translatedFrom && s.id.startsWith("p") ? "રાષ્ટ્રીય" : releases.get(s.id)?.ministry);
    for (const [section, want] of [["રાષ્ટ્રીય", 3], ["આંતરરાષ્ટ્રીય", 2]] as const) {
      const best = pool.filter((s) => kind(s) === section && !rankedByEditor.has(s.id)).sort((a, b) => a.priority - b.priority).slice(0, want);
      if (!best.length) continue;
      pool = pool.map((s) => (best.includes(s) && s.priority > 3 ? { ...s, priority: 3 } : s))
        .sort((a, b) => a.priority - b.priority || b.bodies.long.length - a.bodies.long.length);
      log(`  ${section === "રાષ્ટ્રીય" ? "national" : "world"} news kept in: ${best.map((s) => s.id).join(", ")}`);
    }
    // feature articles print like the news: no kicker, no special title (24 Oct, the editor's wish)
    pool = pool.map((s) => (s.id.startsWith("f-") ? { ...s, kicker: "" } : s));
    let rewordCost = 0;
    if (opts.copy) {
      const c = opts.copy;
      const got = await c.reword(pool);
      rewordCost = got.cost;
      // a story that couldn't be put into the paper's language stays out
      if (c.translate) got.pool = got.pool.filter((s) => inPaperLanguage(s));
      // the order the pages are filled in, shuffled: importance still counts,
      // with enough chance that every copy comes out its own
      const spread = c.shuffle === "anywhere" ? 4 : 2.5;
      const lead = c.lead && got.pool.some((s) => s.id === c.lead) ? c.lead : got.pool[0]?.id;
      const keyed = got.pool.map((s) => ({ s, k: c.shuffle === "keepLead" && s.id === lead ? -Infinity : s.priority + c.rng() * spread }));
      pool = keyed.sort((a, b) => a.k - b.k).map((x) => x.s) as typeof pool;
    }
    log(`planning ${date} (issue ${issueNumber}): ${pool.length} stories, ${ads.length} ads, ${total} pages`);
    const packer = new Packer(m);
    let spent = 0;
    const factChecks: { story: string; detail: string }[] = [];
    const finalPlans: PagePlan[] = [];
    // spread the day's copy over all the pages: each page's share of it is
    // its share of the room the pages have (their band, less their ads)
    const room = Array.from({ length: total }, (_, i) => {
      const band = (chrome[i].bodyBottom - chrome[i].bodyTop) * spanWidth(GRID.columns);
      const adArea = ads.filter((a) => a.page === i + 1).reduce((s, a) =>
        s + a.width * Math.max(0, Math.min(a.y + a.height, chrome[i].bodyBottom) - Math.max(a.y, chrome[i].bodyTop)), 0);
      return Math.max(0, band - adArea);
    });
    const content = (await Promise.all(pool.map((s, i) => packer.naturalArea(s, i === 0)))).reduce((a, b) => a + b, 0);
    const share = Math.min(1.05, content / room.reduce((a, b) => a + b, 0));
    log(`  the day's copy fills ${(share * 100).toFixed(0)}% of the pages at its natural size`);
    const pagesOut = new Map<number, Element[]>();
    timing.start = Date.now();
    // (the stories made ready: sub-headings written, the editorial plan)
    timing.preparing = timing.start - began;
    fitsBefore = fitCalls();
    const placed: { page: number; story: Story; variant: string; cols: number; rank: number }[] = [];
    const gaps: { page: number; col: number; y0: number; y1: number }[] = [];
    const bands = chrome.map((c) => ({ top: c.bodyTop, bottom: c.bodyBottom }));
    // the layout engine (layout/engine.ts): every page designed and solved exactly
    // (the old packer, and its AI gap closing, no longer lay out a page: 26 Oct)
    // (a copy carries no house ad: it's the paper's own name and number, and a copy is another paper's)
    const fillers: FillerCount = { messages: new Set(), houseAds: opts.copy ? Infinity : 0 };
    const v2: EngineResult = await layOut({
      pool, bands, ads, m, store: opts.copy?.store ?? store, releases, longer: !opts.copy,
      seed: opts.copy ? 1 + Math.floor(opts.copy.rng() * 2 ** 30) : (seedOf(date) + (opts.seedShift ?? 0) * 7919) % 2 ** 30,
      ...(opts.copy?.shuffle === "samePage" ? { fixedPage: opts.copy.pageOf } : {}),
      date, fillers, log,
      // (the stories' lengths, then each page as it's laid out -- in the newsroom's words)
      progress: (done, of, what) => opts.progress?.(what === "pages"
        ? { done: total + done, total: total * 2 + 1, label: "planning", item: String(Math.min(total, done + 1)) }
        : { done, total: of, label: "lengths" }),
    });
    spent += v2.cost;
    factChecks.push(...v2.factChecks);
    pool = v2.leftOut as typeof pool;
    timing.planning = Date.now() - timing.start;
    const t1 = Date.now();
    for (let n = 1; n <= total; n++) {
      const pageAds = ads.filter((a) => a.page === n);
      // (a page no try could lay out: its ads alone, the rest reported as white space -- not seen in practice)
      const done = v2.pages[n - 1] ?? { page: n, placed: [], ads: pageAds, elements: [], design: "",
        blocks: pageAds.map((a) => ({ id: a.id, kind: "rect" as const, x: a.x, y: a.y, width: a.width, height: a.height })) };
      if (!v2.pages[n - 1]) log(`  page ${n}: not laid out`);
      const body: Element[] = [
        ...done.ads.map((ad) => ({ id: `ad-${ad.id}`, kind: "image" as const, articleId: `ad-${ad.id}`, x: ad.x, y: ad.y,
                                   width: ad.width, height: ad.height, url: ad.url, fit: "fill" as const })),
        ...done.elements,
      ];
      pagesOut.set(n, profile.language.direction === "rtl" ? mirrored(body, PAGE.width) : body);
      for (const p of done.placed) placed.push({ page: n, story: p.module.story, variant: p.module.variant, cols: p.module.cols, rank: p.module.rank });
      gaps.push(...findGaps(done.blocks, bands[n - 1]).map((g) => ({ page: n, ...g })));
      finalPlans.push({ page: n, placed: done.placed, elements: done.elements, waste: 0, gaps: [] });
      log(`  page ${n}: ${done.placed.map((p) => `${p.module.story.id}(${p.module.cols}col, ${p.module.story.bodies.long.split(/\s+/).length}w` +
          `${p.module.photoMode === 1 ? ", wide photo" : p.module.photoMode === 2 ? ", 2 photos" : ""}${p.module.photoDropped ? ", no photo" : ""})`).join(" ")}`);
    }
    timing.fitting = Date.now() - t1;
    result = { pages: pagesOut, placed, gaps, leftOut: pool, plans: finalPlans, spent: spent + rewordCost, factChecks };
  } finally {
    await m.close();
  }
  const pages = chrome.map((c, i) => ({
    number: i + 1, width: PAGE.width, height: PAGE.height,
    elements: [...c.elements, ...(result.pages.get(i + 1) ?? [])] as Element[],
  }));
  const issue = IssueRenderSchema.parse({ issueDate: date, issueNumber, dpi: DPI, fonts: FONTS, pages });

  // page images too, for the website: licensed fonts never leave this server
  const restricted = FONTS.some((f) => f.restricted);
  opts.progress?.({ done: total * 2, total: total * 2 + 1, label: "checking" });
  const t2 = Date.now();
  const browser = await acquireBrowser();
  let printed: Awaited<ReturnType<typeof printIssue>>;
  try {
    printed = await printIssue(issue, { origin: PLOT_ORIGIN, resolve: assetFile, browser,
                                        ...((restricted || opts.images) && !opts.copy ? { images: 150 } : {}) });
  } finally { releaseBrowser(); }
  const { pdf, warnings, images } = printed;
  timing.print = Date.now() - t2;
  const pdfPath = opts.copy?.pdfPath ?? path.join(OUT_DIR, `${profile.id}-${date}.pdf`);
  await mkdir(path.dirname(pdfPath), { recursive: true });
  await writeFile(pdfPath, pdf);
  if (images) {
    const dir = pageImageDir(date);
    await mkdir(dir, { recursive: true });
    await Promise.all(images.map((png, i) => writeFile(path.join(dir, `${i + 1}.png`), png)));
  }
  // gate 5: a vision model reviews the finished pages (report only)
  const t3 = Date.now();
  let review: Awaited<ReturnType<typeof reviewPages>> = null;
  if (images && !opts.noReview && !opts.reviewLater) {
    review = await reviewPages(images.map((_, i) => path.join(pageImageDir(date), `${i + 1}.png`)), { log });
  }
  timing.review = Date.now() - t3;
  if (m.unencodable.size) log(`  text the paper's fonts can't set (left as typed): ${[...m.unencodable].join(" ")}`);
  if (removed.size) log(`  characters the paper's fonts have nothing for, taken out: ${[...removed].join(" ")}`);

  const pt = 72 / DPI;
  const whiteSpace = result.gaps.map((g) => ({ page: g.page, col: g.col + 1, height: Math.round((g.y1 - g.y0) * pt * 10) / 10,
                                               y: Math.round(g.y0 * pt * 10) / 10 }));
  const checks = whiteSpace.map((g) => ({ page: g.page, kind: "white-space", detail: `column ${g.col}: ${g.height}pt left empty` }));
  // ---- the release gates: the issue is ready only when every one passes
  const tombstones: string[] = [];
  const hierarchy: string[] = [];
  const headShare: string[] = [];
  for (const plan of result.plans) {
    for (const a of plan.placed) {
      const ma = a.module;
      if (headlineHeavy(ma)) headShare.push(`p${plan.page} ${ma.story.id}`);
      for (const b of plan.placed) {
        if (a === b) continue;
        const mb = b.module;
        // two headlines of about the same size side by side, starting level --
        // they read as one run-on line ("tombstoned")
        if (tombstoned(a, b)) tombstones.push(`p${plan.page} ${ma.story.id}|${mb.story.id}`);
        // a less important story, no wider, with a bigger headline than a more important one
        if (outranks(ma, mb)) hierarchy.push(`p${plan.page} ${mb.story.id}>${ma.story.id}`);
      }
    }
  }
  // ---- style: what a reader sees (layout/style.ts)
  const style = styleChecks(issue, result.plans, chrome.map((c) => ({ top: c.bodyTop, bottom: c.bodyBottom })));
  const lead = result.placed.find((p) => p.page === 1 && p.rank === 1);
  const plotterProblems = warnings;
  // a story's numbers checked again against its release by today's rules (a
  // flag saved when it was written can be stale: "આઠ હજાર 224" read as wrong, 24 Oct)
  const dayReleases = new Map(store.releases(date).map((r) => [storyIdOf(r), r]));
  const recheck = (s: Story) => {
    const r = dayReleases.get(s.id);
    if (!s.factCheck || s.translatedFrom || !r) return s.factCheck;
    const n = numbersNotIn(`${s.headline} ${s.deck} ${s.bodies.long}`, `${r.headline} ${r.subhead} ${r.body}`, r.date);
    return n.length ? `numbers not in the release: ${n.join(", ")}` : undefined;
  };
  // (the layout passes on each story's saved flag: those are the ones checked again)
  const byId = new Map(result.placed.map((p) => [p.story.id, p.story]));
  const seenFact = new Set<string>();
  const allFacts = [...result.factChecks, ...result.placed.flatMap((p) => (p.story.factCheck ? [{ story: p.story.id, detail: p.story.factCheck }] : []))]
    .map((f) => { const s = byId.get(f.story); return s && f.detail === s.factCheck ? { ...f, detail: recheck(s) } : f; })
    .filter((f): f is { story: string; detail: string } => !!f.detail && !seenFact.has(`${f.story}|${f.detail}`) && !!seenFact.add(`${f.story}|${f.detail}`));
  // gate 7 compares only builds made from the same inputs by the same engine:
  // after a change to either, the paper is meant to differ
  // (another arrangement on purpose, a repair: compared only with its like)
  const fingerprint = buildFingerprint(store, date) + (opts.seedShift ? `|arrangement ${opts.seedShift}` : "");
  // (a copy is meant to differ from the day's paper)
  const previous = opts.copy ? null : store.latestIssue(date);
  const comparable = previous && (previous.report as { fingerprint?: string }).fingerprint === fingerprint;
  const same = comparable ? JSON.stringify(previous.issue) === JSON.stringify(issue) : null;
  const print = await preflight(pdf, issue);
  // every printed character in its own font (fonts/cmap.ts): none left to a fallback face
  const coverage = new Map<string, Set<number>>();
  for (const f of issue.fonts) {
    try { coverage.set(f.id, cmapCoverage(await readFile(assetFile(new URL(f.url, "http://x").pathname)))); } catch { /* the plotter reports a failed font */ }
  }
  const missingGlyphs = new Map<string, Set<string>>(); // char -> where
  for (const page of issue.pages) {
    for (const e of page.elements) {
      if (e.kind !== "text") continue;
      for (const run of typeof e.text === "string" ? [{ text: e.text, font: e.font }] : e.text.map((r) => ({ text: r.text, font: r.font ?? e.font }))) {
        const has = coverage.get(run.font);
        if (!has) continue;
        for (const ch of run.text) {
          const c = ch.codePointAt(0)!;
          if (c < 0x20 || /\s/.test(ch) || c === 0x200c || c === 0x200d || c === 0xad || has.has(c)) continue;
          if (!missingGlyphs.has(ch)) missingGlyphs.set(ch, new Set());
          missingGlyphs.get(ch)!.add(`p${page.number} ${e.articleId ?? e.id}`);
        }
      }
    }
  }
  const gates = [
    { gate: "1 plotter: no overflow, overlap, off-page, failed fonts or images", pass: plotterProblems.length === 0, detail: `${plotterProblems.length} warning(s)` },
    { gate: "F every letter in the paper's own fonts", pass: missingGlyphs.size === 0,
      detail: missingGlyphs.size ? [...missingGlyphs].map(([ch, at]) => `"${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}) in ${[...at].slice(0, 3).join(", ")}`).join("; ") : "ok" },
    { gate: "P print preflight: trim size, fonts embedded, photos 200 ppi+, nothing off the page", pass: print.every((c) => c.pass),
      detail: print.map((c) => `${c.name} ${c.pass ? "ok" : c.detail}`).join("; ") },
    { gate: "2 no empty space on the page (every column filled to what's below)", pass: result.gaps.length === 0,
      detail: `${result.gaps.length} empty stretch(es)` },
    { gate: "3 no tombstoned headlines", pass: tombstones.length === 0, detail: tombstones.join(", ") || "none" },
    { gate: "3 headline sizes follow importance", pass: hierarchy.length === 0, detail: hierarchy.join(", ") || "ok" },
    { gate: "3 no headline over 30% of its story", pass: headShare.length === 0, detail: headShare.join(", ") || "ok" },
    { gate: "4 the lead on page 1; every story placed or left out with a reason", pass: !!lead,
      detail: `lead ${lead?.story.id ?? "missing"}; left out (no room): ${result.leftOut.map((s) => s.id).join(", ") || "none"}` },
    { gate: "W no story across the whole page unless the editor allowed it",
      pass: !result.placed.some((p) => p.cols > MAX_STORY_COLS && !p.story.fullWidth),
      detail: result.placed.filter((p) => p.cols > MAX_STORY_COLS && !p.story.fullWidth).map((p) => `p${p.page} ${p.story.id} (${p.cols} columns)`).join(", ") || "ok" },
    { gate: "6 fact checks: every number in the release", pass: allFacts.length === 0, detail: allFacts.map((f) => `${f.story}: ${f.detail}`).join("; ") || "ok" },
    ...style.gates,
    { gate: "7 same inputs, same issue", pass: same !== false,
      detail: !previous ? "first build"
        : same === null ? `inputs or engine changed since v${previous.version}: nothing to compare (the next build of the same inputs will be)`
        : same ? "identical to the last build of the same inputs" : "the same inputs and engine gave a different issue: not deterministic" },
  ];
  const confident = (review?.findings ?? []).filter((f) => f.confidence >= 0.8);
  const later = !!opts.reviewLater && !!images && !opts.noReview;
  gates.splice(6, 0, {
    gate: "5 the page reviewer sees no clear problem", pass: later || (confident.length === 0 && !review?.unreviewed.length),
    detail: later ? REVIEW_RUNNING : !review ? "not run (no API key or no page images)"
      : review.unreviewed.length ? `page(s) ${review.unreviewed.join(", ")} not reviewed (the model didn't answer)`
      : confident.map((f) => `p${f.page} ${f.issue} "${f.where.slice(0, 30)}": ${f.note}`).join("; ") || `ok (${review.findings.length} minor note(s))`,
  });
  const ready = gates.every((g) => g.pass);
  const min = (ms: number) => Math.round(ms / 600) / 100;
  const took = {
    preparing: timing.preparing, planning: timing.planning, fitting: timing.fitting, print: timing.print, review: timing.review,
    checks: Date.now() - timing.start - timing.planning - timing.fitting - timing.print - timing.review,
    total: Date.now() - timing.start, fits: fitCalls() - fitsBefore,
    engineMb: Math.round(process.memoryUsage().rss / 2 ** 20), freeMb: Math.round(os.freemem() / 2 ** 20),
  };
  log(`timing: preparing ${min(took.preparing)}m, planning ${min(took.planning)}m, fitting ${min(took.fitting)}m (${took.fits} AI length fits), printing ${min(took.print)}m, ` +
      `page review ${min(took.review)}m, checks ${min(took.checks)}m -- ${min(took.total)}m; memory: engine ${took.engineMb} MB, computer free ${took.freeMb} MB`);

  const report: Omit<BuildReport, "version"> = {
    date, issueNumber, pages: total,
    placed: result.placed.map((p) => ({ page: p.page, story: p.story.id, headline: p.story.headline, variant: p.variant,
                                        cols: p.cols, rank: p.rank, source: p.story.source })),
    whiteSpace,
    leftOut: result.leftOut.map((s) => ({ story: s.id, headline: s.headline })),
    warnings: [...warnings.map((w) => ({ page: w.page, elementId: w.elementId, kind: w.kind, detail: w.detail })), ...checks],
    pdf: pdfPath, fingerprint,
    gates, ready, cost: Math.round((result.spent + planCost + (review?.cost ?? 0)) * 10000) / 10000,
    review: review?.findings ?? [], plan: planEntries,
    style: style.stats,
    timing: took,
  };
  // a copy is the day's paper laid out again: not a new version of it
  const version = opts.copy ? 0 : store.saveIssue(date, issue, report);
  log(`built ${date} v${version}: ${report.placed.length} stories placed, ${report.leftOut.length} left out, ` +
      `${warnings.length} plotter warning(s), ${checks.length} white-space gap(s) -> ${pdfPath}`);
  for (const w of report.warnings.filter((w) => w.kind !== "white-space")) log(`  warning p${w.page} ${w.elementId ?? ""}: ${w.kind} ${w.detail}`);
  log(`gates (${ready ? "READY" : "NOT READY"}, AI cost $${report.cost.toFixed(4)}):`);
  for (const g of gates) log(`  ${g.pass ? "pass" : "FAIL"}  ${g.gate} -- ${g.detail}`);
  for (let n = 1; n <= total; n++) {
    const g = whiteSpace.filter((x) => x.page === n);
    if (g.length) log(`  page ${n}: ${g.length} column gap(s) over 1.5 lines, the tallest ${Math.max(...g.map((x) => x.height))}pt`);
  }
  return { issue, report: { ...report, version } };
}

/** A right-to-left paper's page (Urdu): laid out as usual, then every story
 * and ad mirrored across the page -- stories, and the columns inside each,
 * then run right to left -- and its text marked right-to-left, which
 * the plotter sets as such (the chrome is the paper's own art: unmirrored). */
function mirrored(els: Element[], pageWidth: number): Element[] {
  const swap = (a: TextElement["align"]) => (a === "left" || a === undefined ? "right" : a === "right" ? "left" : a);
  return els.map((e) => {
    switch (e.kind) {
      case "line": return { ...e, x1: pageWidth - e.x1, x2: pageWidth - e.x2 };
      case "path": return { ...e, d: e.d.replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g, (_, x, y) => `${pageWidth - Number(x)} ${y}`) };
      case "text": return { ...e, x: pageWidth - e.x - e.width, align: swap(e.align), direction: "rtl", lang: profile.language.lang };
      default: return { ...e, x: pageWidth - e.x - e.width };
    }
  });
}
