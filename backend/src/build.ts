// Builds one day's issue end to end: chrome for every page, the day's ads,
// the planner's stories; validated against the render contract, checked with
// the frontend's own plotter (no text may overflow or run into anything),
// saved as a draft, and printed to PDF.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { IssueRenderSchema, type Element, type IssueRender, type TextElement } from "@ck/shared/contract";
import { printIssue } from "@ck/shared/pdf";
import { assetFile, OUT_DIR, PLOT_ORIGIN } from "./config.ts";
import { chromeFor } from "./chrome/chrome.ts";
import { Measurer } from "./layout/measure.ts";
import { FEATURE_KICKER } from "./editorial/features.ts";
import { planDay } from "./editorial/plan.ts";
import { preflight } from "./export/preflight.ts";
import { cmapCoverage } from "./fonts/cmap.ts";
import { reviewPages } from "./editorial/review.ts";
import { writeDeck } from "./editorial/rewrite.ts";
import { closeGaps, type FillerCount } from "./layout/fit.ts";
import { headlineHeavy, outranks, Packer, tombstoned, type PagePlan } from "./layout/pack.ts";
import { applyTextEdits, dedupe, droppedBy, inPaperLanguage, referenceAds, standInsMovable } from "./layout/stories.ts";
import { arrangeAds } from "./layout/ads.ts";
import { findGaps } from "./layout/occupancy.ts";
import { styleChecks } from "./layout/style.ts";
import { buildFingerprint } from "./fingerprint.ts";
import { spanWidth } from "./layout/module.ts";
import { BODY, DPI, FACES, FONTS, GRID, PAGE, PT } from "./layout/typography.ts";
import { profile } from "./profile.ts";
import { storyIdOf, type Store, type Story } from "./store.ts";

type Opts = { log: (s: string) => void; issueNumber?: number; pages?: number; noReview?: boolean;
              /** page images even when the fonts may be served (tests read them) */
              images?: boolean };

/** Where a day's page images go (served by the API for the website). */
export const pageImageDir = (date: string) => path.join(OUT_DIR, "pages", profile.id, date);

/** Issue numbers count every day from the profile's reference issue. */
export function issueNumberFor(date: string): number {
  const { referenceDate, referenceNumber } = profile.issue;
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${referenceDate}T00:00:00Z`)) / 86_400_000);
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
  let ads = standInsMovable(store.ads(date));
  if (!ads.length) ads = referenceAds(date);
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
  let stories = store.stories(date);
  if (!stories.length && store.releases(date).length) {
    const { rewriteDay } = await import("./editorial/rewrite.ts");
    await rewriteDay(store, date, { log });
    stories = store.stories(date);
  }
  if (!stories.length) throw new Error(`no stories for ${date}: ingest and rewrite the day first`);
  let ads = standInsMovable(store.ads(date));
  if (!ads.length) {
    ads = referenceAds(date);
    for (const a of ads) store.putAd(a);
    log(`no ads booked for ${date}: placed the 8 August ads as stand-ins`);
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
    for (let i = 0; i < total; i++) chrome.push(await chromeFor(i + 1, total, date, issueNumber, m));
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
    for (const s of stories) {
      if (s.deck?.trim()) continue;
      const r = releases.get(s.id);
      const deck = r?.subhead?.trim() || (r ? (await writeDeck(store, s, r, { log }))?.deck : undefined);
      if (deck) {
        s.deck = deck;
        store.putStory(s);
      }
    }
    let pool = dedupe(applyTextEdits(stories, edits).filter((s) => !dropped.has(s.id) && inPaperLanguage(s)))
      .map((s) => ({ ...s, photos: s.photo ? [s.photo, ...(releases.get(s.id)?.photos ?? []).filter((u) => u !== s.photo)] : [] }))
      .sort((a, b) => a.priority - b.priority || b.bodies.long.length - a.bodies.long.length);
    // the editorial plan ranks the day's stories (an editor's own rank wins)
    const rankedByEditor = new Set(edits.filter((e) => typeof e.change.priority === "number").map((e) => e.storyId));
    const planned = await planDay(store, date, pool, { log });
    if (planned) {
      const by = new Map(planned.plan.map((p) => [p.id, p]));
      pool = pool.map((s) => (!rankedByEditor.has(s.id) && by.has(s.id) ? { ...s, priority: by.get(s.id)!.rank } : s))
        .sort((a, b) => a.priority - b.priority || b.bodies.long.length - a.bodies.long.length);
      log(`  editorial plan: leads ${planned.plan.filter((p) => p.rank === 1).map((p) => p.id).join(", ") || "none"}`);
    }
    planCost = planned?.cost ?? 0;
    planEntries = planned?.plan ?? [];
    // "વિશેષ લેખ" marks the paper's one special article: the first feature
    // keeps it, the others print without a kicker
    let special = false;
    pool = pool.map((s) => (s.kicker !== FEATURE_KICKER ? s : special ? { ...s, kicker: "" } : ((special = true), s)));
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
    const placed: { page: number; story: Story; variant: string; cols: number; rank: number }[] = [];
    const gaps: { page: number; col: number; y0: number; y1: number }[] = [];
    const plans: PagePlan[] = [];
    for (let n = 1; n <= total; n++) {
      const pageAds = ads.filter((a) => a.page === n);
      // what's left of the copy, over what's left of the room
      const leftRoom = room.slice(n - 1).reduce((a, b) => a + b, 0);
      const leftCopy = (await Promise.all(pool.map((s, i) => packer.naturalArea(s, i === 0)))).reduce((a, b) => a + b, 0);
      const budget = n === total ? Infinity : room[n - 1] * Math.min(1.05, leftCopy / leftRoom);
      // what the later pages need kept for them: most of their room (length
      // fitting grows the stories into the rest)
      const reserve = room.slice(n).reduce((a, b) => a + b, 0) * 0.7;
      const plan = await packer.packPage(n, pool, { top: chrome[n - 1].bodyTop, bottom: chrome[n - 1].bodyBottom }, pageAds,
                                         { leadFirst: true, budget, reserve });
      plans.push(plan);
      pool = pool.filter((s) => !plan.placed.some((p) => p.module.story.id === s.id));
      log(`  page ${n}: ${plan.placed.length} stories, white space ${(plan.waste * 100).toFixed(1)}%: ` +
          plan.placed.map((p) => `${p.module.story.id}(${p.module.cols}col ${p.module.variant}` +
            `${p.module.photoMode === 1 ? ", wide photo" : p.module.photoMode === 2 ? ", 2 photos" : ""}${p.module.photoDropped ? ", no photo" : ""})`).join(" "));
    }
    // close the gaps: grow stories into them, then briefs and the house ad (layout/fit.ts)
    const fillers: FillerCount = { messages: new Set(), houseAds: 0 };
    for (const plan of plans) {
      const n = plan.page;
      const pageAds = ads.filter((a) => a.page === n);
      const fit = await closeGaps(plan, { band: { top: chrome[n - 1].bodyTop, bottom: chrome[n - 1].bodyBottom }, ads: pageAds,
                                         store, date, releases, m, leftOut: pool, fillers, say: (l) => log(`  p${n}${l}`) });
      spent += fit.cost;
      factChecks.push(...fit.factChecks);
      pool = pool.filter((s) => !fit.used.includes(s));
      const body: Element[] = [
        ...pageAds.map((ad) => ({ id: `ad-${ad.id}`, kind: "image" as const, articleId: `ad-${ad.id}`, x: ad.x, y: ad.y,
                                  width: ad.width, height: ad.height, url: ad.url, fit: "fill" as const })),
        ...fit.elements,
      ];
      pagesOut.set(n, profile.language.direction === "rtl" ? mirrored(body, PAGE.width) : body);
      for (const p of fit.plan.placed) placed.push({ page: n, story: p.module.story, variant: p.module.variant, cols: p.module.cols, rank: p.module.rank });
      // what's empty on the finished page, wherever it is (layout/occupancy.ts)
      gaps.push(...findGaps(fit.blocks, { top: chrome[n - 1].bodyTop, bottom: chrome[n - 1].bodyBottom }).map((g) => ({ page: n, ...g })));
      finalPlans.push(fit.plan);
    }
    result = { pages: pagesOut, placed, gaps, leftOut: pool, plans: finalPlans, spent, factChecks };
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
  const { pdf, warnings, images } = await printIssue(issue, { origin: PLOT_ORIGIN, resolve: assetFile, ...(restricted || opts.images ? { images: 150 } : {}) });
  await mkdir(OUT_DIR, { recursive: true });
  const pdfPath = path.join(OUT_DIR, `${profile.id}-${date}.pdf`);
  await writeFile(pdfPath, pdf);
  if (images) {
    const dir = pageImageDir(date);
    await mkdir(dir, { recursive: true });
    await Promise.all(images.map((png, i) => writeFile(path.join(dir, `${i + 1}.png`), png)));
  }
  // gate 5: a vision model reviews the finished pages (report only)
  let review: Awaited<ReturnType<typeof reviewPages>> = null;
  if (images && !opts.noReview) {
    review = await reviewPages(images.map((_, i) => path.join(pageImageDir(date), `${i + 1}.png`)), { log });
  }
  if (m.unencodable.size) log(`  text the paper's fonts can't set (left as typed): ${[...m.unencodable].join(" ")}`);

  const pt = 72 / DPI;
  const whiteSpace = result.gaps.map((g) => ({ page: g.page, col: g.col + 1, height: Math.round((g.y1 - g.y0) * pt * 10) / 10,
                                               y: Math.round(g.y0 * pt * 10) / 10 }));
  const checks = whiteSpace.map((g) => ({ page: g.page, kind: "white-space", detail: `column ${g.col}: ${g.height}pt left empty` }));
  // ---- the release gates: the issue is ready only when every one passes
  const pitch = BODY.pitch;
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
  const allFacts = [...result.factChecks, ...result.placed.flatMap((p) => (p.story.factCheck ? [{ story: p.story.id, detail: p.story.factCheck }] : []))];
  // gate 7 compares only builds made from the same inputs by the same engine:
  // after a change to either, the paper is meant to differ
  const fingerprint = buildFingerprint(store, date);
  const previous = store.latestIssue(date);
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
    { gate: "6 fact checks: every number in the release", pass: allFacts.length === 0, detail: allFacts.map((f) => `${f.story}: ${f.detail}`).join("; ") || "ok" },
    ...style.gates,
    { gate: "7 same inputs, same issue", pass: same !== false,
      detail: !previous ? "first build"
        : same === null ? `inputs or engine changed since v${previous.version}: nothing to compare (the next build of the same inputs will be)`
        : same ? "identical to the last build of the same inputs" : "the same inputs and engine gave a different issue: not deterministic" },
  ];
  const confident = (review?.findings ?? []).filter((f) => f.confidence >= 0.8);
  gates.splice(6, 0, {
    gate: "5 the page reviewer sees no clear problem", pass: confident.length === 0 && !review?.unreviewed.length,
    detail: !review ? "not run (no API key or no page images)"
      : review.unreviewed.length ? `page(s) ${review.unreviewed.join(", ")} not reviewed (the model didn't answer)`
      : confident.map((f) => `p${f.page} ${f.issue} "${f.where.slice(0, 30)}": ${f.note}`).join("; ") || `ok (${review.findings.length} minor note(s))`,
  });
  const ready = gates.every((g) => g.pass);

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
  };
  const version = store.saveIssue(date, issue, report);
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
