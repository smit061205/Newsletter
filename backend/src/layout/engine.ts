// The layout engine ("v2"): a day's stories onto its pages, every page filled
// exactly, with no AI in the loop.
//
//   1. lengths: each story's ladder (editorial/ladder.ts) -- every length it
//      may print at, made before the layout starts;
//   2. pages: the stories shared out over the pages by the room each has
//      (its story area less its ads), most important first, the front page's
//      lead on it, related stories apart (assign());
//   3. designs: for each page, many ways of cutting its story area into one
//      block per story and ad (layout/designs.ts), each solved exactly
//      (layout/guillotine.ts); the cheapest that keeps the desk's rules wins;
//   4. a page with no exact design: a story moved between pages, and the
//      pages tried again; then with room for a filler, and the nearest design
//      if none is exact (its gap reported). No other engine lays out a page.
import type { Element } from "@ck/shared/contract";
import { ladderOf, MIN_WORDS, type Rung } from "../editorial/ladder.ts";
import { alwaysPrinted, type Ad, type Release, type Store, type Story } from "../store.ts";
import { Blocks, type Option } from "./blocks.ts";
import { spanWidth } from "./module.ts";
import { designs, type DesignAd, type DesignStory } from "./designs.ts";
import { FILL_MAX, FILL_MIN, realise, Solver, spanOf, type Block, type Tree } from "./guillotine.ts";
import { fillInTurn, type FillContext } from "./fill.ts";
import type { FillerCount } from "./fit.ts";
import type { Measurer } from "./measure.ts";
import { outranks, rankOf, renderPlaced, tombstoned, type Band, type PlacedModule } from "./pack.ts";
import { related } from "./stories.ts";
import { GAP, GRID, LEAD_FULL_WIDTH, PT } from "./typography.ts";

export interface EnginePage {
  page: number;
  placed: PlacedModule[];
  ads: Ad[];
  elements: Element[];
  /** what fills the page, as boxes (for the white-space check) */
  blocks: Element[];
  /** the design used (copies keep theirs apart) */
  design: string;
}

export interface EngineResult {
  pages: (EnginePage | null)[];
  /** stories with no room on any page */
  leftOut: Story[];
  cost: number;
  /** each page's stories */
  assigned: Story[][];
  factChecks: { story: string; detail: string }[];
}

/** Run `jobs`, at most `limit` at a time; their results in order. */
async function inParallel<T>(jobs: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); }
  }));
  return out;
}

/** Room a page's stories have (px²): its band, less its ads and their gaps. */
export function roomOf(band: Band, ads: Ad[]): number {
  return spanOf(GRID.columns) * (band.bottom - band.top) - ads.reduce((t, a) => t + a.width * (a.height + GAP.betweenStories), 0);
}

/** A seeded random number generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sized { story: Story; min: number; mid: number; max: number }

/** News the editor sent the paper's Telegram bot, and a copy's fixed article:
 * always printed (26 Oct, the editor's wish): never the story held back while another can be. */
const sent = (s: Sized) => alwaysPrinted(s.story);
/** the story to hold back first: not one he sent, then the least important, then one with no photo */
const toHold = (a: Sized, b: Sized) => Number(sent(a)) - Number(sent(b)) || b.story.priority - a.story.priority || Number(!!a.story.photo) - Number(!!b.story.photo);
/** the held story to bring back first: one he sent, then the most important, then one with a photo */
const toBring = (a: Sized, b: Sized) => Number(sent(b)) - Number(sent(a)) || a.story.priority - b.story.priority || Number(!!b.story.photo) - Number(!!a.story.photo);

/** The stories shared out over the pages: each page's list, most important first. */
export function assign(sized: Sized[], rooms: number[], opts: { fixedPage?: Map<string, number>; rng?: () => number }): { pages: Sized[][]; held: Sized[] } {
  const pages: Sized[][] = rooms.map(() => []);
  const used = rooms.map(() => 0);
  const held: Sized[] = [];
  const total = sized.reduce((a, s) => a + s.mid, 0);
  const room = rooms.reduce((a, b) => a + b, 0);
  // how full each page is meant to be at the stories' middle lengths -- the
  // front page full first: a day short of copy is short on the inside pages
  const fill = Math.min(1.1, total / Math.max(1, room));
  const share = rooms.map((r, k) => (k === 0 || rooms.length === 1 ? Math.max(fill, Math.min(1, total / r)) * r
    : Math.max(0, total - Math.max(fill, Math.min(1, total / rooms[0])) * rooms[0]) / Math.max(1, room - rooms[0]) * r));
  for (const [i, s] of sized.entries()) {
    const fixed = opts.fixedPage?.get(s.story.id);
    let p: number;
    if (fixed !== undefined) p = Math.min(rooms.length, fixed) - 1;
    else if (i === 0) p = 0; // the lead: the front page
    else {
      // the page with the most room still wanted, the front page first for the
      // day's important stories; a page with a related story only if no other has room
      const want = rooms.map((_, k) => share[k] - used[k] - s.mid);
      // (news fills the front pages first, a feature article the inside ones:
      // 24 Oct's short day put five features on the front page)
      const feature = s.story.id.startsWith("f-");
      const score = (k: number) => want[k] / rooms[k] + (k === 0 && s.story.priority <= 2 ? 0.15 : 0)
        + (feature ? (k === 0 ? -0.5 : 0.05 * k) : 0.08 * (rooms.length - 1 - k))
        - (pages[k].some((o) => related(o.story, s.story)) ? 0.3 : 0) + (opts.rng ? (opts.rng() - 0.5) * 0.12 : 0);
      p = rooms.map((_, k) => k).reduce((a, b) => (score(b) > score(a) ? b : a));
      if (rooms[p] - used[p] < s.min * 0.6 && !sent(s)) { held.push(s); continue; }
    }
    pages[p].push(s);
    used[p] += s.mid;
  }
  // a page short of copy takes a held story, or one from a page with copy to spare
  for (let round = 0; round < 8; round++) {
    const sum = (k: number, f: "min" | "max") => pages[k].reduce((a, s) => a + s[f], 0);
    const short = rooms.findIndex((r, k) => sum(k, "max") < r);
    const long = rooms.findIndex((r, k) => sum(k, "min") > r);
    if (short < 0 && long < 0) break;
    if (long >= 0) {
      // the least important story that isn't the page's first goes where there's room, else is held
      const s = [...pages[long]].slice(1).sort((a, b) => toHold(a, b) || a.mid - b.mid)[0];
      if (!s) break;
      pages[long] = pages[long].filter((x) => x !== s);
      const to = rooms.findIndex((r, k) => k !== long && sum(k, "max") + s.mid < r * 1.05);
      if (to >= 0) pages[to].push(s); else held.push(s);
      continue;
    }
    const spare = held.sort(toBring)[0];
    if (spare) { held.splice(held.indexOf(spare), 1); pages[short].push(spare); continue; }
    const from = rooms.findIndex((r, k) => k !== short && pages[k].length > 1 && sum(k, "min") < r * 0.9);
    if (from < 0) break;
    const s = [...pages[from]].slice(1).sort((a, b) => a.mid - b.mid)[0];
    pages[from] = pages[from].filter((x) => x !== s);
    pages[short].push(s);
  }
  // each page's stories most important first again (its first is its lead): the
  // moves above put a story at the end of its new page
  const order = new Map(sized.map((s, i) => [s, i]));
  for (const p of pages) p.sort((a, b) => order.get(a)! - order.get(b)!);
  return { pages, held };
}

export async function layOut(args: {
  pool: Story[]; bands: Band[]; ads: Ad[]; m: Measurer; store: Store; releases: Map<string, Release>;
  /** the same seed, the same layout; a copy has its own */
  seed: number;
  /** a copy: its stories' pages fixed ("samePage"), and the designs used before it, to avoid */
  fixedPage?: Map<string, number>; avoid?: Set<string>;
  /** ask the AI for longer versions (the day's paper; a copy uses what's cached) */
  longer: boolean;
  /** the day (a written brief's cache key) and the fillers the paper has used (one message, one house ad) */
  date: string; fillers: FillerCount;
  log: (s: string) => void; progress?: (done: number, total: number, what: string) => void;
}): Promise<EngineResult> {
  const { m, log } = args;
  const total = args.bands.length;
  let cost = 0;
  const t0 = Date.now();
  const secs = (t: number) => ((Date.now() - t) / 1000).toFixed(1);
  // 1. every story's lengths: its own and cut ones first; the AI's longer
  // versions only on a day short of copy (below)
  const ladders = new Map<string, Rung[]>();
  const factChecks: EngineResult["factChecks"] = [];
  const lengths = async (stories: Story[], longer: boolean | "cached") => {
    let done = 0;
    await inParallel(stories.map((s) => async () => {
      const got = await ladderOf(args.store, s, args.releases.get(s.id), { longer, log });
      ladders.set(s.id, got.rungs);
      cost += got.cost;
      args.progress?.(++done, stories.length, "lengths");
    }), Math.max(1, stories.length)); // all at once (the AI's longer versions; OpenRouter retries what's turned away)
  };
  // (a copy: the day's paper's longer versions, already paid for)
  await lengths(args.pool, args.longer ? false : "cached");
  // a story shorter than the paper's shortest (profile minWords) isn't printed,
  // unless the editor sent it: no items of a few lines under a big headline
  const tooShort = args.pool.filter((s) => !alwaysPrinted(s) && Math.max(...(ladders.get(s.id) ?? []).map((r) => r.words)) < MIN_WORDS);
  if (tooShort.length) log(`  shorter than ${MIN_WORDS} words, left out: ${tooShort.map((s) => s.id).join(", ")}`);
  args = { ...args, pool: args.pool.filter((s) => !tooShort.includes(s)) };
  const blocks = new Blocks(m, ladders);
  log(`  lengths: ${[...ladders.values()].reduce((a, r) => a + r.length, 0)} for ${ladders.size} stories (${secs(t0)}s)`);
  const t1 = Date.now();

  // 2. the stories over the pages, by their sizes at their usual width
  const sizeOf = async (s: Story, lead: boolean): Promise<Sized | null> => {
    const range = await blocks.range(s, await blocks.settable(s, rankOf(s, lead)));
    if (!range.length) return null;
    const usual = range[Math.floor(range.length / 2)];
    const w = spanOf(usual.cols);
    const gap = GAP.betweenStories * w;
    return { story: s, min: usual.min * w + gap, max: usual.max * w + gap, mid: ((usual.min + usual.max) / 2) * w + gap };
  };
  let sized: Sized[] = [];
  for (const [i, s] of args.pool.entries()) {
    const got = await sizeOf(s, i === 0);
    if (got) sized.push(got); else log(`  ${s.id}: no setting keeps the desk's rules: left out`);
  }
  const roomAll = args.bands.reduce((t, b, i) => t + roomOf(b, args.ads.filter((a) => a.page === i + 1)), 0);
  if (args.longer && sized.reduce((a, s) => a + s.mid, 0) < roomAll * 1.02) {
    // short of copy: the stories whose releases say more, written longer
    const t2 = Date.now();
    await lengths(sized.map((s) => s.story), true);
    for (const s of sized) blocks.forget(s.story.id);
    sized = (await Promise.all(sized.map((s, i) => sizeOf(s.story, i === 0)))).filter((x): x is Sized => !!x);
    log(`  short of copy: longer versions written (${secs(t2)}s)`);
  }
  const pageAds = (n: number) => args.ads.filter((a) => a.page === n);
  const rooms = args.bands.map((b, i) => roomOf(b, pageAds(i + 1)));
  const rng = seeded(args.seed);
  const { pages: shares, held } = assign(sized, rooms, { fixedPage: args.fixedPage, rng: args.seed ? rng : undefined });
  log(`  pages: ${shares.map((p, i) => `${i + 1}: ${p.length} stories (${Math.round(p.reduce((a, s) => a + s.mid, 0) / rooms[i] * 100)}%)`).join(", ")}` +
      (held.length ? `; held: ${held.map((s) => s.story.id).join(", ")}` : "") + ` (${secs(t1)}s)`);

  // 3. each page designed and solved; a page no design fills: other designs,
  // then a story more (one held back, or the smallest from a page with copy
  // to spare) or one fewer (the least important, held back), and again
  const pages: (EnginePage | null)[] = new Array(total).fill(null);
  // a page short of copy with no story left to give it: room for a filler
  const shortBy = new Map<number, number>();
  const fill: FillContext = { store: args.store, date: args.date, m, blocks, held: [], fillers: args.fillers, written: [], turn: Promise.resolve(), cost: 0, log };
  const tried = new Map<number, string>(); // page -> its stories when last tried
  let pagesDone = 0;
  // (a page no design was made for at all: a narrow story added once, then stories held back)
  const narrowed = new Set<number>();
  for (let round = 0; round < ROUNDS; round++) {
    const todo = shares.map((_, i) => i).filter((i) => !pages[i] && tried.get(i) !== shares[i].map((s) => s.story.id).join() + round);
    if (!todo.length) break;
    const diag = new Map<number, Diagnosis>();
    // (a story too short to print as one may still fill a strip by an ad)
    fill.held = [...held.map((s) => s.story), ...tooShort];
    await inParallel(todo.map((i) => async () => {
      const n = i + 1;
      tried.set(i, shares[i].map((s) => s.story.id).join() + round);
      // the last try: a filler slot on every page still unsolved, as well as
      // the stories -- whatever its ads leave, the page is made exactly here
      // (a held story as a brief, an item written to its size), never handed
      // to the old engine, which left the copies' white space (24 Oct)
      const slot = shortBy.get(i) ?? (round >= LAST ? (FILL_MAX / 2) * spanOf(1) : 0);
      const got = await solvePage(n, shares[i].map((s) => s.story), args.bands[i], pageAds(n), blocks, m,
                                  seeded(args.seed * 31 + n + round * 7919), args.avoid, log, Math.min(round, LAST), fill, slot, round >= LAST);
      pages[i] = got.page;
      diag.set(i, got.diagnosis);
      if (got.page) args.progress?.(++pagesDone, total, "pages");
    }), total); // every page at once
    // held stories set as briefs by an ad are on their pages now
    for (const s of [...held]) if (!fill.held.includes(s.story)) held.splice(held.indexOf(s), 1);
    for (const s of [...tooShort]) if (!fill.held.includes(s)) tooShort.splice(tooShort.indexOf(s), 1);
    const failed = todo.filter((i) => !pages[i]);
    if (!failed.length) break;
    for (const i of failed) {
      const d = diag.get(i)!;
      const sum = (k: number, f: "min" | "max" | "mid") => shares[k].reduce((a, s) => a + s[f], 0);
      const isShort = sum(i, "mid") < rooms[i];
      // no design could be made at all (narrow strips by the ads no story of
      // the page can take): a reserve story that runs in one or two columns
      if (d.short === 0 && d.long === 0 && narrowed.has(i) && shares[i].length > 1) {
        // a narrow story didn't help (26 Oct): the least important one held back
        const s = shares[i].slice(1).sort((a, b) => toHold(a, b) || b.mid - a.mid)[0];
        shares[i] = shares[i].filter((x) => x !== s);
        held.push(s);
        log(`  page ${i + 1}: still no design: ${s.story.id} held back`);
        continue;
      }
      if (d.short === 0 && d.long === 0) {
        narrowed.add(i);
        let narrow: Sized | undefined;
        for (const s of [...held].sort((a, b) => a.mid - b.mid)) {
          const rank = rankOf(s.story, false);
          for (const cols of blocks.widths(s.story, rank).filter((c) => c <= 2)) {
            if ((await blocks.options(s.story, rank, cols)).length) { narrow = s; break; }
          }
          if (narrow) break;
        }
        if (narrow) {
          held.splice(held.indexOf(narrow), 1);
          shares[i].push(narrow);
          log(`  page ${i + 1}: no design fits its ads: ${narrow.story.id} (it runs in a narrow column) added from the reserve`);
          continue;
        }
      }
      if (d.short > d.long || (round >= 1 && isShort && !shortBy.has(i))) {
        // too little copy for the page: a held story, else the smallest from a page that has the most to spare
        const spare = held.sort((a, b) => toBring(a, b) || b.mid - a.mid)[0];
        if (spare) {
          held.splice(held.indexOf(spare), 1);
          shares[i].push(spare);
          log(`  page ${i + 1}: short of copy: ${spare.story.id} added`);
        } else {
          const from = shares.map((_, k) => k).filter((k) => k !== i && shares[k].length > 2 && !args.fixedPage
                                                         && sum(k, "mid") > rooms[k] * 1.05)
            .sort((a, b) => (sum(b, "mid") - rooms[b]) / rooms[b] - (sum(a, "mid") - rooms[a]) / rooms[a])[0];
          if (from === undefined) {
            shortBy.set(i, Math.max(FILL_MIN * spanOf(1), rooms[i] - sum(i, "mid")));
            log(`  page ${i + 1}: short of copy, none to spare: room for a filler`);
            continue;
          }
          const s = shares[from].slice(1).sort((a, b) => a.mid - b.mid)[0];
          shares[from] = shares[from].filter((x) => x !== s);
          shares[i].push(s);
          pages[from] = null; // laid out again without it
          log(`  page ${i + 1}: short of copy: ${s.story.id} moved here from page ${from + 1}`);
        }
      } else if (d.long > d.short && shares[i].length > 1) {
        const s = shares[i].slice(1).sort((a, b) => toHold(a, b) || a.mid - b.mid)[0];
        shares[i] = shares[i].filter((x) => x !== s);
        held.push(s);
        log(`  page ${i + 1}: more copy than room: ${s.story.id} held back`);
      }
      // (neither: just other designs next round)
    }
    // (a story moved in goes in its place by importance, not at the end: the first is the page's lead)
    const order = new Map(sized.map((s, k) => [s.story.id, k]));
    for (const i of failed) shares[i].sort((a, b) => (order.get(a.story.id) ?? 0) - (order.get(b.story.id) ?? 0));
  }
  for (const p of pages) {
    for (const x of p?.placed ?? []) if (x.module.story.factCheck) factChecks.push({ story: x.module.story.id, detail: x.module.story.factCheck });
  }
  cost += fill.cost;
  log(`  layout: ${pages.filter(Boolean).length} of ${total} pages solved exactly (${secs(t0)}s in all)`);
  return { pages, leftOut: [...held.map((s) => s.story), ...tooShort], cost, assigned: shares.map((p) => p.map((s) => s.story)), factChecks };
}

/** Rounds of tries for a page; from LAST on, a filler slot and the nearest design if none is exact. */
const ROUNDS = 8;
const LAST = 3;

/** The tallest the front page's lead across the page may be, a share of the page. */
const LEAD_MAX_SHARE = 0.4;

/** Why a page found no design: how many designs came out too short for it, and too tall. */
interface Diagnosis { short: number; long: number }

/** One page: its designs, solved, the best one set out. Null if none fills it. */
async function solvePage(n: number, stories: Story[], band: Band, ads: Ad[], blocks: Blocks, m: Measurer, rng: () => number,
                         avoid: Set<string> | undefined, log: (s: string) => void, round: number, fill: FillContext,
                         /** room (px²) no story is left for: a filler block may take it */
                         shortBy = 0,
                         /** the last try: no exact design, the nearest one */
                         last = false):
  Promise<{ page: EnginePage | null; diagnosis: Diagnosis }> {
  const t0 = Date.now();
  const none = { page: null, diagnosis: { short: 0, long: 0 } };
  if (!stories.length) return none;
  // the front page's lead may run the full width (the profile's leadFullWidth)
  if (n === 1 && LEAD_FULL_WIDTH) stories = [{ ...stories[0], fullWidth: true }, ...stories.slice(1)];
  // an ad the editor put at a place of their own: laid round it. One booked off
  // the columns (from an old issue) is set on the nearest ones, its picture
  // drawn to their width
  ads = ads.map((a) => {
    if (a.pinned === false) return a;
    const c0 = Math.max(0, Math.min(GRID.columns - 1, Math.round((a.x - GRID.left) / GRID.pitch)));
    const cols = Math.max(1, Math.min(GRID.columns - c0, colsOf(a)));
    const x = GRID.left + c0 * GRID.pitch, width = spanWidth(cols);
    if (Math.abs(a.x - x) <= 3 && Math.abs(a.width - width) <= 3) return a;
    log(`  page ${n}: ad ${a.id} set on the columns nearest it`);
    return { ...a, x, width };
  });
  // (a story that can't be set at its rank, a rank lower: blocks.settable)
  const ranks = await Promise.all(stories.map((s, i) => blocks.settable(s, rankOf(s, i === 0))));
  // every story's settings at every width it may take (measured once, shared by all designs)
  const table = new Map<string, Option[]>();
  for (const [i, s] of stories.entries()) {
    for (const cols of blocks.widths(s, ranks[i])) table.set(`${i}|${cols}`, await blocks.options(s, ranks[i], cols));
  }
  // the front page's lead across the page leaves room for the rest: its photo
  // across all the columns made it two thirds of the page, no design had room
  // under it for the page's other stories, and the page was left a third empty
  // (28 Oct). Its settings no taller than LEAD_MAX_SHARE of the page, when it has any
  if (n === 1 && LEAD_FULL_WIDTH && stories[0].fullWidth) {
    const all = table.get(`0|${GRID.columns}`) ?? [];
    const low = all.filter((o) => o.height <= (band.bottom - band.top) * LEAD_MAX_SHARE);
    if (low.length && low.length < all.length) table.set(`0|${GRID.columns}`, low);
  }
  const options = (i: number, cols: number) => table.get(`${i}|${cols}`) ?? [];
  const ds: DesignStory[] = stories.map((s, i) => {
    let widths = blocks.widths(s, ranks[i]).filter((c) => options(i, c).length);
    // the front page's lead across the whole page when it can be (its usual widths only if not)
    if (s.fullWidth && n === 1 && i === 0 && LEAD_FULL_WIDTH && widths.includes(GRID.columns)) widths = [GRID.columns];
    return {
      widths,
      area: (cols: number) => {
        const o = options(i, cols).length ? options(i, cols) : options(i, widths[Math.floor(widths.length / 2)] ?? cols);
        if (!o.length) return 0;
        const mid = o[Math.floor(o.length / 2)];
        return mid.height * spanOf(mid.module.cols) + GAP.betweenStories * spanOf(cols);
      },
    };
  });
  // (up to four columns: the strip over one of several ads side by side, 24 Oct's page 3)
  if (shortBy > 0) ds.push({ fill: true, widths: [1, 2, 3, 4], area: () => shortBy });
  const height = band.bottom - band.top;
  const t1 = Date.now();
  // the page's ads in each tidy arrangement (all at their sizes, at the foot):
  // the designs of every one solved, the best page of them all kept
  const candidates: { t: Tree; cost: number; solver: Solver; ads: Ad[]; short?: number }[] = [];
  let tried = 0;
  const near: { below: number; above: number; t: Tree; solver: Solver; ads: Ad[] }[] = [];
  for (const arranged of adLayouts(ads, band)) {
    const boxes: DesignAd[] = arranged.map((a, index) => {
      const c0 = Math.round((a.x - GRID.left) / GRID.pitch);
      return { index, c0, c1: c0 + colsOf(a), y: a.y - band.top, height: a.height };
    });
    const solver = new Solver({ options, ads: arranged, height, ...(shortBy > 0 ? { fillMax: FILL_MAX * 2 } : {}) });
    // (each round tries more designs than the one before)
    // (an ad the editor put part-way down: far fewer designs work round it, so many more are drawn)
    const more = boxes.some((b) => b.y + b.height < height - 1) ? 8 : 1;
    const trees = designs(ds, boxes, GRID.columns, height, rng, 300 * (round + 1), 6000 * (round + 1) * more);
    tried += trees.length;
    for (const t of trees) {
      const cost = solver.cost(t);
      if (Number.isFinite(cost)) candidates.push({ t, cost, solver, ads: arranged });
      else near.push({ ...solver.near(t), t, solver, ads: arranged });
    }
  }
  if (!candidates.length) {
    // (a design that can't be made any height at all says neither)
    const diagnosis = { short: near.filter((x) => x.above < 0 && x.below >= 0).length, long: near.filter((x) => x.below < 0 && x.above >= 0).length };
    log(`  page ${n}: none of ${tried} designs fills it exactly (${diagnosis.short} too short, ${diagnosis.long} too tall; ${secs(t0)}s)`);
    if (!last) return { page: null, diagnosis };
    // the last round: the design that comes nearest, set out from the top --
    // the space left at its foot is reported (gate 2), not handed to the old engine
    const nearest = near.filter((x) => x.below >= 0).sort((a, b) => a.below - b.below)[0];
    if (!nearest) return { page: null, diagnosis };
    log(`  page ${n}: the nearest design leaves ${nearest.below}pt at the foot: the day is short of copy for it`);
    candidates.push({ t: nearest.t, cost: 1000 + nearest.below, solver: nearest.solver, ads: nearest.ads, short: nearest.below });
  }
  candidates.sort((a, b) => a.cost - b.cost);
  // the cheapest few set out, judged as a reader sees them: headline sizes
  // follow importance, no two level headlines side by side the same size
  let best: { page: EnginePage; cost: number; fills: Extract<Block, { kind: "fill" }>[] } | null = null;
  let looked = 0;
  for (const { t, cost, solver, ads: arranged, short } of candidates) {
    if (looked >= (n === 1 ? 120 : 12)) break;
    const sig = sigOf(t, stories);
    if (avoid?.has(sig)) continue;
    looked++;
    const laid = solver.layout(t, band.top, short ?? 0);
    if (!laid) continue;
    const got = await realise(laid, options, arranged, m);
    const placed = got.placed.map((p) => ({ ...p, module: { ...p.module } }));
    let penalty = 0;
    for (const a of placed) {
      for (const b of placed) {
        if (a === b) continue;
        if (outranks(a.module, b.module)) penalty += 20;
        if (tombstoned(a, b)) b.ruleLeft = true; // a column rule between them, as a desk does
      }
    }
    // the front page: at most one article beside the lead (a stack of them
    // down its side looks bad, the editor, 27 Oct 2026)
    if (n === 1) penalty += 200 * Math.max(0, besideLead(placed, got.fills, stories[0]) - 1);
    const total = cost + penalty;
    if (!best || total < best.cost) {
      const elements = renderPlaced(placed);
      const boxes: Element[] = [
        ...placed.map((p) => ({ id: p.module.story.id, kind: "rect" as const, x: p.x, y: p.y, width: p.module.width, height: p.module.height })),
        ...got.ads.map((a) => ({ id: a.id, kind: "rect" as const, x: a.x, y: a.y, width: a.width, height: a.height })),
      ];
      best = { page: { page: n, placed, ads: got.ads, elements, blocks: boxes, design: sig }, cost: total, fills: got.fills };
    }
    if (penalty === 0) break;
  }
  // the design's filler blocks, filled with copy (layout/fill.ts)
  if (best?.fills.length) {
    const page = best.page;
    const extra: Element[] = [];
    const avoid = page.placed.map((p) => p.module.story.headline);
    for (const f of best.fills) {
      const smallest = Math.min(...page.placed.filter((p) => p.module.headSize > 0).map((p) => p.module.headSize));
      const got = await fillInTurn(n, f.col, f.cols, f.y, f.height, fill, avoid, smallest);
      if (!got) { log(`  page ${n}: nothing found for a ${f.cols}-column gap (${(f.height / PT).toFixed(0)}pt)`); continue; }
      page.placed.push(...got.placed);
      extra.push(...got.elements);
    }
    // a filler's headline level with a neighbour's, the same size: a column rule between them
    for (const a of page.placed) for (const b of page.placed) if (a !== b && tombstoned(a, b)) b.ruleLeft = true;
    page.elements = renderPlaced(page.placed, extra);
    page.blocks = [
      ...page.placed.map((p) => ({ id: p.module.story.id, kind: "rect" as const, x: p.x, y: p.y, width: p.module.width, height: p.module.height })),
      ...extra.filter((e) => e.kind === "rect"),
      ...page.ads.map((a) => ({ id: a.id, kind: "rect" as const, x: a.x, y: a.y, width: a.width, height: a.height })),
    ];
  }
  log(`  page ${n}: ${candidates.length} of ${tried} designs fill it; ${best ? `cost ${best.cost.toFixed(2)}` : "none unlike the earlier ones"} ` +
      `(${secs(t0)}s: settings ${((t1 - t0) / 1000).toFixed(1)}s)`);
  return { page: best?.page ?? null, diagnosis: { short: 0, long: 0 } };
}

/** How many articles (stories and filler gaps) stand beside the lead, level with it. */
function besideLead(placed: PlacedModule[], fills: Extract<Block, { kind: "fill" }>[], lead: Story | undefined): number {
  const l = placed.find((p) => p.module.story.id === lead?.id);
  if (!l) return 0;
  const [x0, x1, y0, y1] = [l.x, l.x + l.module.width, l.y, l.y + l.module.height];
  const level = (top: number, h: number) => Math.min(y1, top + h) - Math.max(y0, top) > 20 * PT;
  const apart = (x: number, w: number) => x + w <= x0 + 1 || x >= x1 - 1;
  return placed.filter((p) => p !== l && apart(p.x, p.module.width) && level(p.y, p.module.height)).length +
    fills.filter((f) => { const x = GRID.left + f.col * GRID.pitch; return apart(x, spanWidth(f.cols)) && level(f.y, f.height); }).length;
}

/** An ad's width in columns. */
const colsOf = (a: Ad) => Math.max(1, Math.min(GRID.columns, Math.round((a.width + GRID.gutter) / GRID.pitch)));

/** The page's ads in tidy arrangements, all at their own sizes and at the
 * foot: as layout/ads.ts placed them; stacked narrower on wider at the right,
 * and at the left; side by side along the foot from the right, and from the
 * left. (Ads of different heights side by side in a staircase leave narrow
 * columns over the short ones that few stories fit: 22 Oct, page 4.) */
export function adLayouts(ads: Ad[], band: Band): Ad[][] {
  if (!ads.length) return [ads];
  // (an ad the editor put at a place of their own: the page's ads as they are)
  if (ads.some((a) => a.pinned !== false)) return [ads];
  const out = new Map<string, Ad[]>();
  // (an ad the editor put somewhere stays there: arrangements that move it are left out)
  const placedAt = new Map(ads.filter((a) => a.place).map((a) => [a.id, Math.round(a.x)]));
  const keep = (list: Ad[] | null) => {
    if (!list || list.some((a) => a.y < band.top + 60 * PT)) return;
    if (list.some((a) => placedAt.has(a.id) && Math.round(a.x) !== placedAt.get(a.id))) return;
    out.set(list.map((a) => `${a.id}:${Math.round(a.x)}:${Math.round(a.y)}`).sort().join(), list);
  };
  keep(ads);
  const sorted = [...ads].sort((a, b) => colsOf(b) - colsOf(a) || b.height - a.height || a.id.localeCompare(b.id));
  const at = (a: Ad, c0: number, bottom: number): Ad => ({ ...a, x: GRID.left + c0 * GRID.pitch, y: bottom - a.height });
  for (const right of [true, false]) {
    // a well: each ad on top of the stack it fits in, else a new stack beside the last
    // (each arrangement judged by itself: one that doesn't fit doesn't rule out the others)
    const stacks: { c0: number; c1: number; top: number }[] = [];
    const well: Ad[] = [];
    let ok = true;
    for (const a of sorted) {
      const k = colsOf(a);
      const s = stacks.find((x) => x.c1 - x.c0 >= k);
      if (s) {
        const c0 = right ? s.c1 - k : s.c0;
        well.push(at(a, c0, s.top));
        s.top -= a.height + GAP.betweenStories;
        if (right) s.c0 = c0; else s.c1 = c0 + k;
      } else {
        const used = stacks.reduce((t, x) => t + (x.c1 - x.c0), 0);
        if (used + k > GRID.columns) { ok = false; break; }
        const c0 = right ? GRID.columns - used - k : used;
        well.push(at(a, c0, band.bottom));
        stacks.push({ c0, c1: c0 + k, top: band.bottom - a.height - GAP.betweenStories });
      }
    }
    if (ok) keep(well);
    // side by side along the foot
    ok = true;
    let used = 0;
    const row: Ad[] = [];
    for (const a of sorted) {
      const k = colsOf(a);
      if (used + k > GRID.columns) { ok = false; break; }
      row.push(at(a, right ? GRID.columns - used - k : used, band.bottom));
      used += k;
    }
    if (ok) keep(row);
  }
  return [...out.values()];
}

/** A design with its stories named (copies compare them). */
function sigOf(t: Tree, stories: Story[]): string {
  switch (t.kind) {
    case "story": return `${stories[t.story].id}:${t.cols}`;
    case "ad": return `ad${t.ad}`;
    case "fill": return `fill${t.cols}`;
    case "fix": return `X(${sigOf(t.child, stories)})`;
    default: return `${t.kind === "stack" ? "S" : "R"}(${t.children.map((c) => sigOf(c, stories)).join(",")})`;
  }
}

const secs = (t: number) => ((Date.now() - t) / 1000).toFixed(1);
