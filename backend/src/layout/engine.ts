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
import { grown, ladderOf, MIN_WORDS, writtenTo, type Rung } from "../editorial/ladder.ts";
import { checkFacts } from "../editorial/facts.ts";
import { wordCount } from "../editorial/quality.ts";
import { paragraphs } from "../editorial/rewrite.ts";
import { alwaysPrinted, wordForWord, type Ad, type Release, type Store, type Story } from "../store.ts";
import { Blocks, type Option } from "./blocks.ts";
import { spanWidth } from "./module.ts";
import { designs, type DesignAd, type DesignStory } from "./designs.ts";
import { FILL_MAX, FILL_MIN, realise, Solver, spanOf, type Block, type Tree } from "./guillotine.ts";
import { fillInTurn, type FillContext } from "./fill.ts";
import { plan } from "./planner.ts";
import type { FillerCount } from "./fit.ts";
import type { Measurer } from "./measure.ts";
import { outranks, rankOf, renderPlaced, tombstoned, type Band, type PlacedModule } from "./pack.ts";
import { related } from "./stories.ts";
import { BODY, FRONT_MOST, GAP, GRID, LEAD_FULL_WIDTH, PT } from "./typography.ts";

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
const sent = (s: Sized) => alwaysPrinted(s.story) || !!s.story.editorsColumn;
/** the story to hold back first: not one he sent, then the least important, then one with no photo */
const toHold = (a: Sized, b: Sized) => Number(sent(a)) - Number(sent(b)) || b.story.priority - a.story.priority || Number(!!a.story.photo) - Number(!!b.story.photo);
/** the held story to bring back first: one he sent, then the most important, then one with a photo */
const toBring = (a: Sized, b: Sized) => Number(sent(b)) - Number(sent(a)) || a.story.priority - b.story.priority || Number(!!b.story.photo) - Number(!!a.story.photo);

/** The stories shared out over the pages: each page's list, most important first. */
export function assign(sized: Sized[], rooms: number[], opts: { fixedPage?: Map<string, number>; rng?: () => number; front?: boolean }): { pages: Sized[][]; held: Sized[] } {
  const roomFront = (k: number, pages: Sized[][]) => k > 0 || opts.front === false || pages[0].length < FRONT_MOST || rooms.length === 1;
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
      const score = (k: number) => (k === 0 && s.story.editorsColumn ? -10 : 0) + want[k] / rooms[k] + (k === 0 && s.story.priority <= 2 ? 0.15 : 0)
        + (feature ? (k === 0 ? -0.5 : 0.05 * k) : 0.08 * (rooms.length - 1 - k))
        - (pages[k].some((o) => related(o.story, s.story)) ? 0.3 : 0) + (opts.rng ? (opts.rng() - 0.5) * 0.12 : 0);
      p = rooms.map((_, k) => k).filter((k) => roomFront(k, pages)).reduce((a, b) => (score(b) > score(a) ? b : a));
      if (rooms[p] - used[p] < s.min * 0.6 && !sent(s)) { held.push(s); continue; }
    }
    pages[p].push(s);
    used[p] += s.mid;
  }
  // a page short of copy takes a held story, or one from a page with copy to spare
  for (let round = 0; round < 8; round++) {
    const sum = (k: number, f: "min" | "max") => pages[k].reduce((a, s) => a + s[f], 0);
    const short = rooms.findIndex((r, k) => sum(k, "max") < r && roomFront(k, pages));
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
  /** a copy's stories written to the spaces its pages need (the new engine; not a translation) */
  toFit?: boolean;
  /** the day (a written brief's cache key) and the fillers the paper has used (one message, one house ad) */
  date: string; fillers: FillerCount;
  /** a paper that failed its checks laid out again another way (pipeline.ts): the
   * front page's lead in its usual width */
  mend?: { narrowLead?: boolean };
  /** the stories that may be the editor's column, best first */
  columnPicks?: string[];
  /** the page planned (layout/planner.ts), and written to what the plan measures */
  modular?: boolean;
  /** a repair (pipeline.ts): pages of the last try that passed, by number, kept as they are */
  keep?: Map<number, EnginePage>;
  log: (s: string) => void; progress?: (done: number, total: number, what: string) => void;
}): Promise<EngineResult> {
  const { m, log } = args;
  const total = args.bands.length;
  // the kept pages' stories aren't the day's to place again, nor their one house ad
  const kept = [...(args.keep?.values() ?? [])];
  const keptStories = new Set(kept.flatMap((p) => p.placed.map((x) => x.module.story.id)));
  args = { ...args, pool: args.pool.filter((s) => !keptStories.has(s.id)) };
  args.fillers.houseAds += new Set(kept.flatMap((p) => p.elements.flatMap((e) => (e.articleId?.startsWith("filler-") ? [e.articleId] : [])))).size;
  if (kept.some((p) => p.placed.some((x) => x.module.story.editorsColumn))) args = { ...args, columnPicks: [] };
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
  // the front page's lead written longer where its release has more: it carries
  // the page, and at its bare 250 words its photo left a stray line under it (30 Oct)
  if (args.longer && args.pool[0] && !args.keep?.has(1)) {
    await lengths([args.pool[0]], true);
    // (every length of its words read before it goes on the page, as a story written to a slot's
    // are: 31 Oct's printed length had a wrong title the longest didn't. Written once more if
    // one is wrong; what's still wrong isn't used, the words it had to start with if nothing's left)
    const lead = args.pool[0];
    const read = async () => {
      const rungs = ladders.get(lead.id) ?? [];
      const got = await Promise.all(rungs.map((r) => checkFacts(args.store, { ...lead, bodies: { ...lead.bodies, long: r.body } }, log)));
      for (const g of got) cost += g.cost;
      return { good: rungs.filter((_, i) => !got[i].problems.length), wrong: got.flatMap((g) => g.problems) };
    };
    if (args.modular && ladders.get(lead.id)?.length) {
      let found = await read();
      if (found.wrong.length) {
        args.store.forgetFitted(lead.id);
        args.store.putFitted(`avoid|${lead.id}`, { body: [...new Set(found.wrong)].join("; "), model: "facts" });
        await lengths([lead], true);
        found = await read();
      }
      if (found.wrong.length) {
        args.store.forgetFitted(lead.id);
        if (found.good.length) ladders.set(lead.id, found.good); else await lengths([lead], false);
        log(`  ${lead.id}: wrong again when written longer: only the lengths that passed kept`);
      }
    }
  }
  // a story shorter than the paper's shortest (profile minWords) isn't printed,
  // unless the editor sent it: no items of a few lines under a big headline
  const tooShort = args.pool.filter((s) => !alwaysPrinted(s) && Math.max(...(ladders.get(s.id) ?? []).map((r) => r.words)) < MIN_WORDS);
  if (tooShort.length) log(`  shorter than ${MIN_WORDS} words, left out: ${tooShort.map((s) => s.id).join(", ")}`);
  args = { ...args, pool: args.pool.filter((s) => !tooShort.includes(s)) };
  const blocks = new Blocks(m, ladders);
  log(`  lengths: ${[...ladders.values()].reduce((a, r) => a + r.length, 0)} for ${ladders.size} stories (${secs(t0)}s)`);
  const t1 = Date.now();

  // 2. the stories over the pages, by their sizes at their usual width
  // the editor's column: the first of the day's picks that can be set (31 Oct's
  // headline had a long English word that fills no two columns: the box went
  // missing and every repair of the paper failed for it)
  for (const id of args.columnPicks ?? []) {
    const s = args.pool.find((x) => x.id === id);
    if (!s) continue;
    const column: Story = { ...s, editorsColumn: true, photo: null, photos: [], priority: 3 };
    if (!(await blocks.range(column, await blocks.settable(column, rankOf(column, false)))).length) continue;
    log(`  the editor's column: ${id}`);
    args = { ...args, pool: args.pool.map((x) => (x === s ? column : x)) };
    break;
  }
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
  // (a translation writes nothing: its stories run to the lengths there are)
  const factsOf = (s: Story) => { const r = args.releases.get(s.id); return (args.longer || args.toFit) && r && !wordForWord(s) ? wordCount(paragraphs(r.body).join(" ")) : 0; };
  const pageAds = (n: number) => args.ads.filter((a) => a.page === n);
  const rooms = args.bands.map((b, i) => roomOf(b, pageAds(i + 1)));
  const rng = seeded(args.seed);
  // (only the open pages share out the stories: a repair keeps the pages that passed)
  const open = rooms.map((_, i) => i).filter((i) => !args.keep?.has(i + 1));
  // (the planned pages: the stories chosen by what each page's spaces can take. A copy
  // that keeps its stories on their pages shares nothing out)
  const chosen = args.modular && !args.fixedPage
    ? await share(sized, rooms, open, (i) => pageAds(i + 1), (i, list) => pageFits(i + 1, list.map((s) => s.story), args.bands[i], pageAds(i + 1), blocks, factsOf, log), rng, log)
    : null;
  const byRoom = chosen ? null : assign(sized, open.map((i) => rooms[i]), { fixedPage: args.fixedPage, rng: args.seed ? rng : undefined, front: !args.keep?.has(1) });
  const held = chosen?.held ?? byRoom!.held;
  const shares: Sized[][] = chosen?.pages ?? rooms.map((_, i) => byRoom!.pages[open.indexOf(i)] ?? []);
  // the editor's column on an inside page, however the pages were evened out
  const astray = shares[0]?.find((s) => s.story.editorsColumn);
  if (astray && shares.length > 1 && open.some((i) => i > 0)) {
    shares[0] = shares[0].filter((s) => s !== astray);
    const to = open.filter((k) => k > 0).sort((a, b) => shares[a].reduce((t, s) => t + s.mid, 0) / rooms[a] - shares[b].reduce((t, s) => t + s.mid, 0) / rooms[b])[0];
    shares[to].push(astray);
  }
  log(`  pages: ${shares.map((p, i) => `${i + 1}: ${p.length} stories (${Math.round(p.reduce((a, s) => a + s.mid, 0) / rooms[i] * 100)}%)`).join(", ")}` +
      (held.length ? `; held: ${held.map((s) => s.story.id).join(", ")}` : "") + ` (${secs(t1)}s)`);

  // a page's stories written longer by the AI, from their releases' facts
  const lengthen = async (page: number, stories: Story[], more: number): Promise<boolean> => {
    const got = await Promise.all(stories.slice(0, GROW_STORIES).map(async (s) => {
      const release = args.releases.get(s.id);
      const ladder = ladders.get(s.id);
      if (!release || !ladder) return false;
      const longer = await grown(args.store, s, release, ladder, more, log);
      if (!longer) return false;
      ladders.set(s.id, longer.rungs);
      blocks.forget(s.id);
      cost += longer.cost;
      log(`  page ${page + 1}: ${s.id} written longer: up to ${longer.rungs[0].words} words`);
      return true;
    }));
    return got.some(Boolean);
  };
  // a page the planner can't fill from the lengths there are: each story written to the
  // slot it needs, from its release's facts, all at once (layout/planner.ts)
  const writeTo: WriteTo | undefined = !args.longer && !args.toFit ? undefined : async (needs) => {
    const got = await Promise.all(needs.map(async ({ story, lines, perLine }) => {
      const release = args.releases.get(story.id);
      const ladder = ladders.get(story.id);
      if (!release || !ladder) return false;
      let more = await writtenTo(args.store, story, release, ladder, lines, perLine, log);
      if (!more) return false;
      // what it now says read before it goes on the page; written once more if it's wrong
      const read = async (body: string) => {
        const got = await checkFacts(args.store, { ...story, bodies: { ...story.bodies, long: body } }, log);
        cost += got.cost;
        return got.problems;
      };
      const wrong = await read(more.rungs[0].body);
      if (wrong.length) {
        args.store.forgetFitted(story.id);
        args.store.putFitted(`avoid|${story.id}`, { body: wrong.join("; "), model: "facts" });
        more = await writtenTo(args.store, story, release, ladder, lines, perLine, log);
        if (!more || (await read(more.rungs[0].body)).length) return false;
      }
      ladders.set(story.id, more.rungs);
      blocks.forget(story.id);
      cost += more.cost;
      log(`  ${story.id} written to its slot: ${Math.round(lines)} lines, ${wordCount(more.rungs[0].body)} words`);
      return true;
    }));
    return got.some(Boolean);
  };
  // a gap on a page: the stories nearest it written longer by the AI, from their
  // releases' facts, to fill it, before any short item goes in (the developer,
  // 30 Oct: an 11-word item was set with stories on the page that had more to say)
  const grow: Grow | undefined = !args.longer ? undefined : async (placed, gaps) => {
    const room = gaps.reduce((a, f) => a + (f.height / BODY.pitch) * f.cols, 0); // lines of a column
    const near = (p: PlacedModule) => Math.min(...gaps.map((f) => {
      const x = GRID.left + f.col * GRID.pitch;
      const across = Math.max(0, p.x - (x + spanWidth(f.cols)), x - (p.x + p.module.width));
      const down = Math.max(0, p.y - (f.y + f.height), f.y - (p.y + p.module.height));
      return across + down;
    }));
    const got = await Promise.all([...placed].sort((a, b) => near(a) - near(b)).slice(0, GROW_STORIES).map(async (p) => {
      const s = p.module.story;
      const release = args.releases.get(s.id);
      const ladder = ladders.get(s.id);
      if (!release || !ladder) return false;
      const perLine = wordCount(s.bodies.long) / Math.max(1, p.module.bodyLines);
      const more = await grown(args.store, s, release, ladder, Math.ceil(room * perLine * 1.1), log);
      if (!more) return false;
      ladders.set(s.id, more.rungs);
      blocks.forget(s.id);
      cost += more.cost;
      log(`  ${s.id} written longer for a gap: up to ${more.rungs[0].words} words`);
      return true;
    }));
    return got.some(Boolean);
  };

  // 3. each page designed and solved; a page no design fills: other designs,
  // then a story more (one held back, or the smallest from a page with copy
  // to spare) or one fewer (the least important, held back), and again
  const pages: (EnginePage | null)[] = rooms.map((_, i) => args.keep?.get(i + 1) ?? null);
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
    fill.held = held.map((s) => s.story);
    await inParallel(todo.map((i) => async () => {
      const n = i + 1;
      tried.set(i, shares[i].map((s) => s.story.id).join() + round);
      // the last try: a filler slot on every page still unsolved, as well as
      // the stories -- whatever its ads leave, the page is made exactly here
      // (a held story as a brief, an item written to its size), never handed
      // to the old engine, which left the copies' white space (24 Oct)
      const slot = shortBy.get(i) ?? (round >= LAST ? (FILL_MAX / 2) * spanOf(1) : 0);
      const got = await solvePage(n, shares[i].map((s) => s.story), args.bands[i], pageAds(n), blocks, m, !!args.modular,
                                  seeded(args.seed * 31 + n + round * 7919), args.avoid, log, Math.min(round, LAST), fill, slot, round >= LAST, !args.mend?.narrowLead, grow, Infinity, false,
                                  writeTo ? { writeTo, factsOf } : undefined);
      pages[i] = got.page;
      diag.set(i, got.diagnosis);
      if (got.page) args.progress?.(++pagesDone, total, "pages");
    }), total); // every page at once
    // held stories set as briefs by an ad are on their pages now
    for (const s of [...held]) if (!fill.held.includes(s.story)) held.splice(held.indexOf(s), 1);
    const failed = todo.filter((i) => !pages[i]);
    if (!failed.length) break;
    for (const i of failed) {
      const d = diag.get(i)!;
      if (d.again) continue;
      const sum = (k: number, f: "min" | "max" | "mid") => shares[k].reduce((a, s) => a + s[f], 0);
      const isShort = sum(i, "mid") < rooms[i];
      // no design fills it yet: its stories written longer give the designs more
      // heights to come out at (a page isn't filled by anything but stories)
      if ((round === 1 || round === 3) && !shortBy.has(i) && args.longer && !args.modular) await lengthen(i, shares[i].map((s) => s.story), 60 + 20 * round);
      // a page's one story won't fit it: another in its place, the page never
      // left blank (30 Oct: page 4's one story, a speech, fitted no design)
      if (shares[i].length === 1 && d.long >= d.short && (d.long > 0 || narrowed.has(i))) {
        const other = held.filter((s) => s.min < rooms[i] && (i > 0 || !s.story.editorsColumn)).sort((a, b) => toBring(a, b) || b.mid - a.mid)[0];
        if (other) {
          const [s] = shares[i];
          held.splice(held.indexOf(other), 1, s);
          shares[i] = [other];
          log(`  page ${i + 1}: ${s.story.id} fits no design: ${other.story.id} in its place`);
          continue;
        }
      }
      // no design could be made at all (narrow strips by the ads no story of
      // the page can take): a reserve story that runs in one or two columns
      // (a page with room for what it has isn't helped by less: only other designs, next round)
      if (d.short === 0 && d.long === 0 && narrowed.has(i) && shares[i].length > 1 && sum(i, "mid") <= rooms[i] && round < LAST) continue;
      if (d.short === 0 && d.long === 0 && narrowed.has(i) && shares[i].length > PAGE_FEWEST) {
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
        // (the front page isn't filled with more short stories: its own written longer)
        if (i === 0 && shares[0].length >= FRONT_MOST && (round < LAST || args.modular)) {
          if (args.longer && !args.modular) await lengthen(i, shares[0].map((s) => s.story).slice(1), 80);
          continue;
        }
        const spare = held.filter((s) => i > 0 || !s.story.editorsColumn).sort((a, b) => toBring(a, b) || b.mid - a.mid)[0];
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
  // a page still not laid out (31 Oct's front page came out blank, its stories held
  // back one by one): the day's stories back on it, the lead in its usual width, the
  // nearest design taken. Any gap is reported (gate 2): a page is never left empty
  for (const i of pages.map((_, k) => k).filter((k) => !pages[k])) {
    const n = i + 1;
    log(`  page ${n}: no design yet: laid out again with more of the day's stories`);
    for (const s of [...held].sort(toBring)) {
      if (shares[i].length >= (i === 0 ? FRONT_MOST : 6) || shares[i].reduce((a, x) => a + x.mid, 0) >= rooms[i]) break;
      if (i === 0 && s.story.editorsColumn) continue;
      held.splice(held.indexOf(s), 1);
      shares[i].push(s);
    }
    const order = new Map(sized.map((s, k) => [s.story.id, k]));
    shares[i].sort((a, b) => (order.get(a.story.id) ?? 0) - (order.get(b.story.id) ?? 0));
    for (let attempt = 0; attempt < 6 && !pages[i]; attempt++) {
      // (three tries with the page's stories, then another story in the place of its last)
      if (attempt >= 3 && held.length && shares[i].length > 1) {
        const other = [...held].sort(toBring).find((s) => i > 0 || !s.story.editorsColumn), out = shares[i].findLast((s) => !s.story.editorsColumn);
        if (other && out) { held.splice(held.indexOf(other), 1, out); shares[i] = shares[i].map((s) => (s === out ? other : s)); }
      }
      fill.held = held.map((s) => s.story);
      const got = await solvePage(n, shares[i].map((s) => s.story), args.bands[i], pageAds(n), blocks, m, !!args.modular, seeded(args.seed * 37 + n + attempt * 7919),
                                  args.avoid, log, LAST, fill, FILL_MAX * spanOf(2), true, false, undefined, Infinity, !!args.mend);
      pages[i] = got.page;
      for (const s of [...held]) if (!fill.held.includes(s.story)) held.splice(held.indexOf(s), 1);
    }
  }
  for (const p of pages) {
    for (const x of p?.placed ?? []) if (x.module.story.factCheck) factChecks.push({ story: x.module.story.id, detail: x.module.story.factCheck });
  }
  cost += fill.cost;
  log(`  layout: ${pages.filter(Boolean).length} of ${total} pages solved exactly (${secs(t0)}s in all)`);
  // (a page's stories, if it couldn't be laid out at all, are reported too)
  const unset = shares.flatMap((p, i) => (pages[i] ? [] : p.map((s) => s.story)));
  return { pages, leftOut: [...held.map((s) => s.story), ...tooShort, ...unset], cost, assigned: shares.map((p) => p.map((s) => s.story)), factChecks };
}

/** Rounds of tries for a page; from LAST on, a filler slot and the nearest design if none is exact. */
const ROUNDS = 12;
const LAST = 8;
/** The round from which a page's designs may leave a gap for an item. */
const GAPS_FROM = 5;
/** Rounds in which a page laid out badly is designed again by itself. */
const PAGE_RETRIES = 3;
/** Pages planned (layout/planner.ts), not drawn at random: the new engine, on trial. */
/** The longest a story is written to fill a slot (words). */
const LONGEST_WRITTEN = 700;
/** The fewest stories a page is brought down to by holding them back. */
const PAGE_FEWEST = 3;
/** The fewest words of the front page's lead. */
const LEAD_WORDS = 250;
/** The narrowest the front page's lead may be, in columns. */
const LEAD_MIN_COLS = 5;
/** The tallest the front page's lead across the page may be, a share of the page. */
const LEAD_MAX_SHARE = 0.4;

/** The stories written longer for a gap, at most: the ones nearest it. */
const GROW_STORIES = 4;
/** Stories on a page written longer for its gaps; true if any was. */
/** A story and the slot the plan wants it to fill: `lines` of body, `perLine` words each. */
interface SlotNeed { story: Story; lines: number; perLine: number }
type WriteTo = (needs: SlotNeed[]) => Promise<boolean>;
type Grow = (placed: PlacedModule[], gaps: Extract<Block, { kind: "fill" }>[]) => Promise<boolean>;

/** Why a page found no design: how many designs came out too short for it, and too tall. */
interface Diagnosis { short: number; long: number; /** a page laid out, but badly: only other designs are wanted */ again?: boolean }

/** A page as it can be set: its stories' settings at each width, and what the designs and
 * the planner are given. The same for choosing a page's stories (share below) and laying it out. */
async function pageModel(n: number, stories: Story[], band: Band, ads: Ad[], blocks: Blocks, log: (s: string) => void, leadWide = true, anyWidth = false) {
  // the front page's lead may run the full width (the profile's leadFullWidth)
  if (n === 1 && LEAD_FULL_WIDTH && leadWide) stories = [{ ...stories[0], fullWidth: true }, ...stories.slice(1)];
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
  // (one column only where an ad leaves a strip that wide: blocks.widths)
  const oneColumn = anyWidth || ads.some((a) => colsOf(a) === 1 || colsOf(a) === GRID.columns - 1);
  // (a story that can't be set at its rank, a rank lower: blocks.settable)
  const ranks = await Promise.all(stories.map((s, i) => blocks.settable(s, rankOf(s, i === 0), oneColumn)));
  // every story's settings at every width it may take (measured once, shared by all designs)
  const table = new Map<string, Option[]>();
  for (const [i, s] of stories.entries()) {
    for (const cols of blocks.widths(s, ranks[i], oneColumn)) table.set(`${i}|${cols}`, await blocks.options(s, ranks[i], cols));
  }
  // the front page's lead keeps its photo (the editor, 30 Oct: a setting
  // without it was shorter, so it won), at any width that can show it
  if (n === 1 && stories[0].photo) {
    const widths = blocks.widths(stories[0], ranks[0], oneColumn);
    const shown = widths.map((c) => (table.get(`0|${c}`) ?? []).filter((o) => !o.module.photoDropped));
    if (shown.some((o) => o.length)) widths.forEach((c, k) => table.set(`0|${c}`, shown[k]));
  }
  // ... and its full length: a cut lead came out at 236 words (30 Oct)
  if (n === 1) {
    const widths = blocks.widths(stories[0], ranks[0], oneColumn);
    const long = widths.map((c) => (table.get(`0|${c}`) ?? []).filter((o) => wordCount(o.module.story.bodies.long) >= LEAD_WORDS));
    if (long.some((o) => o.length)) widths.forEach((c, k) => table.set(`0|${c}`, long[k]));
  }
  // the front page's lead across the page leaves room for the rest: its photo
  // across all the columns made it two thirds of the page, no design had room
  // under it for the page's other stories, and the page was left a third empty
  // (28 Oct). Its settings no taller than LEAD_MAX_SHARE of the page, when it has any
  if (n === 1 && LEAD_FULL_WIDTH && stories[0].fullWidth) {
    const all = table.get(`0|${GRID.columns}`) ?? [];
    const low = all.filter((o) => o.height <= (band.bottom - band.top) * LEAD_MAX_SHARE);
    if (low.length && low.length < all.length) table.set(`0|${GRID.columns}`, low);
    // (none that low: its usual width. 31 Oct's shortest was 41%, so every height was
    // let in and the lead came out at 61%)
    if (all.length && !low.length) stories = [{ ...stories[0], fullWidth: false }, ...stories.slice(1)];
  }
  const options = (i: number, cols: number) => table.get(`${i}|${cols}`) ?? [];
  const ds: DesignStory[] = stories.map((s, i) => {
    let widths = blocks.widths(s, ranks[i], oneColumn).filter((c) => options(i, c).length);
    // the front page's lead across the whole page when it can be (its usual widths only if not)
    if (s.fullWidth && n === 1 && i === 0 && LEAD_FULL_WIDTH && widths.includes(GRID.columns)) widths = [GRID.columns];
    // (else wide enough to lead the page: at three columns a lesser story's headline
    // was bigger than its own, 30 Oct)
    else if (n === 1 && i === 0 && widths.some((c) => c >= LEAD_MIN_COLS)) widths = widths.filter((c) => c >= LEAD_MIN_COLS);
    return {
      widths, edge: !!s.editorsColumn,
      area: (cols: number) => {
        const o = options(i, cols).length ? options(i, cols) : options(i, widths[Math.floor(widths.length / 2)] ?? cols);
        if (!o.length) return 0;
        const mid = o[Math.floor(o.length / 2)];
        return mid.height * spanOf(mid.module.cols) + GAP.betweenStories * spanOf(cols);
      },
    };
  });
  return { stories, ads, ranks, oneColumn, options, ds };
}

/** Each setting's stretch, as far as a story's release could run: the page as if every
 * story could be written to any length its facts reach. */
function elastic(stories: Story[], options: (i: number, c: number) => Option[], factsOf: (s: Story) => number) {
  const room = (i: number, o: Option) => {
    const lines = Math.max(1, o.module.bodyLines);
    const perLine = wordCount(o.module.story.bodies.long) / lines;
    const most = Math.min(LONGEST_WRITTEN, factsOf(stories[i]));
    return Math.max(o.stretch, ((most / perLine - lines) / o.module.cols) * BODY.pitch);
  };
  return (i: number, c: number) => options(i, c).map((o) => ({ ...o, stretch: room(i, o) }));
}

/** An ad as the designs see it. */
const boxOf = (a: Ad, index: number, band: Band): DesignAd => {
  const c0 = Math.round((a.x - GRID.left) / GRID.pitch);
  return { index, c0, c1: c0 + colsOf(a), y: a.y - band.top, height: a.height };
};

/** Can these stories fill this page, written to what their releases reach? Known for certain, before any AI. */
async function pageFits(n: number, stories: Story[], band: Band, ads: Ad[], blocks: Blocks, factsOf: (s: Story) => number, log: (s: string) => void): Promise<boolean> {
  const { stories: set, ads: placed, options, ds: model, ranks, oneColumn } = await pageModel(n, stories, band, ads, blocks, () => {});
  let ds = model;
  if (ds.some((d) => !d.widths.length)) return false;
  const stretched = elastic(set, options, factsOf);
  const boxes = placed.map((a, i) => boxOf(a, i, band));
  const height = band.bottom - band.top;
  const rng = seeded(n);
  let got = plan(ds, stretched, boxes, GRID.columns, height, rng, 0);
  // (a lead across the page can leave no way to set the rest: its usual width)
  if (!got.fits && !got.gaveUp && n === 1 && ds[0].widths.length === 1 && ds[0].widths[0] === GRID.columns) {
    const usual = blocks.widths(set[0], ranks[0], oneColumn).filter((c) => c >= LEAD_MIN_COLS && c < GRID.columns && options(0, c).length);
    if (usual.length) { ds = [{ ...ds[0], widths: usual }, ...ds.slice(1)]; got = plan(ds, stretched, boxes, GRID.columns, height, rng, 0); }
  }
  if (got.gaveUp) log(`  page ${n}: too many stories to work out`);
  if (!got.fits) return false;
  // (headlines following importance, known here: 25 Oct's page 4 had designs, none of them in order)
  const solver = new Solver({ options: stretched, ads: placed, height });
  const trees = plan(ds, stretched, boxes, GRID.columns, height, rng, 120).trees;
  return !trees.length || trees.some((t) => !disordered(solver.layout(t, band.top), stretched));
}

/** A lesser headline bigger than a more important one's, in a page laid out (or none laid out). */
function disordered(laid: Block[] | null | undefined, options: (story: number, cols: number) => Option[]): boolean {
  if (!laid) return true;
  const set = laid.flatMap((b) => (b.kind === "story" ? [options(b.story, b.cols)[b.option].module] : []));
  return set.some((a) => set.some((b) => outranks(a, b)));
}

/** The most stories tried on an inside page. */
const PAGE_MOST = 8;

/** The stories chosen for the pages by what each page's spaces can take, not by how much
 * room it has (31 Oct's page 3: three ads across its foot, three spaces, and the room left
 * said it was fine). Most important first; a page that can't work is known here, before
 * any AI, and takes other stories. Null for a page nothing was found for: left to the rounds. */
async function share(sized: Sized[], rooms: number[], open: number[], perPage: (i: number) => Ad[], fits: (i: number, list: Sized[]) => Promise<boolean>,
                     rng: () => number, log: (s: string) => void): Promise<{ pages: Sized[][]; held: Sized[]; unsure: number[] }> {
  // (a little chance among stories of about the same weight: a repair is another arrangement)
  const lead = sized[0];
  let left = sized.slice(1).map((s, i) => ({ s, at: i + rng() * 3 })).sort((a, b) => a.at - b.at).map((x) => x.s).sort((a, b) => Number(sent(b)) - Number(sent(a)));
  let column = left.find((s) => s.story.editorsColumn);
  left = left.filter((s) => s !== column);
  if (lead) left.unshift(lead);
  const pages: Sized[][] = rooms.map(() => []);
  const unsure: number[] = [];
  // the front page, then the page with the most ads, which has the fewest ways of working
  const order = [...open.filter((i) => i === 0), ...open.filter((i) => i > 0).sort((a, b) => perPage(b).length - perPage(a).length || rooms[a] - rooms[b])];
  for (const i of order) {
    const mean = left.slice(0, 12).reduce((a, s) => a + s.mid, 0) / Math.max(1, Math.min(12, left.length));
    const most = i === 0 ? FRONT_MOST : PAGE_MOST, least = Math.min(most, Math.max(i === 0 ? 3 : 2, perPage(i).length));
    const want = Math.min(most, Math.max(least, Math.round(rooms[i] / Math.max(1, mean))));
    const counts = [0, -1, 1, -2, 2, 3].map((d) => want + d).filter((k, x, all) => k >= least && k <= most && all.indexOf(k) === x);
    let chosen: Sized[] | null = null;
    for (const k of counts) {
      // the most important k; then, a story at a time from the end, the next ones in their place
      for (let skip = 0; skip <= 5 && !chosen; skip++) {
        const head = left.slice(0, Math.max(1, k - 1 - (column && i > 0 ? 1 : 0) - Math.min(skip, 2)));
        // (the editor's own news is never passed over for another: it all prints)
        if (left.slice(head.length, head.length + skip).some(sent)) continue;
        const list = [...head, ...left.slice(head.length + skip, k + skip - (column && i > 0 ? 1 : 0)), ...(column && i > 0 ? [column] : [])];
        if (list.length && await fits(i, list)) chosen = list;
      }
      if (chosen) break;
    }
    if (!chosen) {
      // (the column may do better on another page)
      unsure.push(i);
      log(`  page ${i + 1}: no choice of stories worked out here`);
      continue;
    }
    if (column && chosen.includes(column)) column = undefined;
    pages[i] = chosen;
    left = left.filter((s) => !chosen!.includes(s));
  }
  // (what wasn't chosen waits for the rounds: the room that's left, by weight)
  for (const i of unsure) {
    let used = 0;
    if (column && i > 0) { pages[i].push(column); used += column.mid; column = undefined; }
    while (left.length && used < rooms[i] && pages[i].length < (i === 0 ? FRONT_MOST : PAGE_MOST)) { const s = left.shift()!; pages[i].push(s); used += s.mid; }
  }
  if (column) left.push(column);
  const place = new Map(sized.map((s, k) => [s, k]));
  for (const p of pages) p.sort((a, b) => place.get(a)! - place.get(b)!);
  return { pages, held: left, unsure };
}

/** One page: its designs, solved, the best one set out. Null if none fills it. */
async function solvePage(n: number, stories: Story[], band: Band, ads: Ad[], blocks: Blocks, m: Measurer, modular: boolean, rng: () => number,
                         avoid: Set<string> | undefined, log: (s: string) => void, round: number, fill: FillContext,
                         /** room (px²) no story is left for: a filler block may take it */
                         shortBy = 0,
                         /** the last try: no exact design, the nearest one */
                         last = false,
                         /** the front page's lead across the page (the profile's leadFullWidth) */
                         leadWide = true,
                         /** the page's stories written longer for its gaps, then the page designed again */
                         grow?: Grow,
                         /** designed again: only a design with less gap than this will do */
                         beat = Infinity,
                         /** the last way out of a blank page: a story may run down one column */
                         anyWidth = false,
                         /** stories written to the slots a page needs, and what a release can reach */
                         slots?: { writeTo: WriteTo; factsOf: (s: Story) => number; pass?: number }):
  Promise<{ page: EnginePage | null; diagnosis: Diagnosis }> {
  const t0 = Date.now();
  const none = { page: null, diagnosis: { short: 0, long: 0 } };
  if (!stories.length) return none;
  const model = await pageModel(n, stories, band, ads, blocks, log, leadWide, anyWidth);
  const { options, ds, oneColumn, ranks } = model;
  stories = model.stories;
  ads = model.ads;
  // (up to four columns: the strip over one of several ads side by side, 24 Oct's page 3)
  if (shortBy > 0) ds.push({ fill: true, widths: oneColumn ? [1, 2, 3, 4] : [2, 3, 4], area: () => shortBy });
  const height = band.bottom - band.top;
  const t1 = Date.now();
  // the page's ads in each tidy arrangement (all at their sizes, at the foot):
  // the designs of every one solved, the best page of them all kept
  const candidates: { t: Tree; cost: number; solver: Solver; ads: Ad[]; short?: number }[] = [];
  let tried = 0;
  const near: { below: number; above: number; t: Tree; solver: Solver; ads: Ad[] }[] = [];
  // the page planned (layout/planner.ts) -- not with an ad given a part of the page, which
  // the designs work round. It places free ads itself, so one arrangement is all it needs;
  // an ad kept where the editor put it: only the designs with it there
  const planning = modular && !ads.some((a) => a.place);
  const kept = ads.flatMap((a, i) => (a.pinned !== false ? [i] : []));
  let plannedShort = 0;
  for (const arranged of planning ? [ads] : adLayouts(ads, band)) {
    const boxes: DesignAd[] = arranged.map((a, index) => {
      const c0 = Math.round((a.x - GRID.left) / GRID.pitch);
      return { index, c0, c1: c0 + colsOf(a), y: a.y - band.top, height: a.height };
    });
    const solver = new Solver({ options, ads: arranged, height, ...(shortBy > 0 ? { fillMax: FILL_MAX * 2 } : {}) });
    // (each round tries more designs than the one before)
    // (an ad the editor put part-way down: far fewer designs work round it, so many more are drawn)
    const more = boxes.some((b) => b.y + b.height < height - 1) ? 8 : 1;
    // (a strip left over by the ads takes only a story: 30 Oct's strips held 16-word
    // items; a gap is allowed a page truly short of copy, or once stories alone haven't filled it)
    const inPlace = (t: Tree) => !kept.length || !!solver.layout(t, band.top)?.every((b) => b.kind !== "ad" || !kept.includes(b.ad) || (b.col === boxes[b.ad].c0 && Math.abs(b.y - boxes[b.ad].y) < 1));
    let planned = planning ? plan(ds, options, boxes, GRID.columns, height, rng, kept.length ? 1500 : 600) : null;
    // (a lead across the page can leave no way to set the rest under it, known for certain:
    // its usual width, before anything is written longer or held back. 31 Oct: page 1 blank)
    if (planned && !planned.fits && !planned.gaveUp && n === 1 && ds[0].widths.length === 1 && ds[0].widths[0] === GRID.columns) {
      const usual = blocks.widths(stories[0], ranks[0], oneColumn).filter((c) => c >= LEAD_MIN_COLS && c < GRID.columns && options(0, c).length);
      if (usual.length) {
        ds[0] = { ...ds[0], widths: usual };
        planned = plan(ds, options, boxes, GRID.columns, height, rng, 600);
      }
    }
    if (planned && !planned.fits) plannedShort = planned.short;
    const gaps = shortBy > 0 || last || round >= GAPS_FROM;
    const placedRight = planned?.fits ? planned.trees.filter(inPlace) : [];
    const trees = placedRight.length ? placedRight : planned?.fits && !kept.length ? planned.trees : planned && !planned.gaveUp && !gaps && !kept.length ? []
      : designs(ds, boxes, GRID.columns, height, rng, 300 * (round + 1), 6000 * (round + 1) * more, gaps);
    tried += trees.length;
    for (const t of trees) {
      const cost = solver.cost(t);
      if (Number.isFinite(cost)) candidates.push({ t, cost, solver, ads: arranged });
      else near.push({ ...solver.near(t), t, solver, ads: arranged });
    }
  }
  // nothing fits the lengths there are: the page planned again as if each story could run to
  // what its release holds, and the stories written to the slots that gives (at most twice)
  // (the same when every design has a lesser headline over a bigger one)
  const inOrder = candidates.some((c) => !disordered(c.solver.layout(c.t, band.top), options));
  if (planning && !kept.length && !inOrder && slots && (slots.pass ?? 0) < 2 && !last) {
    const stretched = elastic(stories, options, slots.factsOf);
    const boxes = ads.map((a, index) => boxOf(a, index, band));
    const planned = plan(ds, stretched, boxes, GRID.columns, height, rng, 60);
    const solver = new Solver({ options: stretched, ads, height });
    const t = planned.trees.map((x) => ({ x, cost: solver.cost(x) + (disordered(solver.layout(x, band.top), stretched) ? 1e6 : 0) })).sort((a, b) => a.cost - b.cost)[0]?.x;
    const laid = t && solver.layout(t, band.top);
    const needs: SlotNeed[] = [];
    for (const b of laid || []) {
      if (b.kind !== "story") continue;
      if (options(b.story, b.cols).some((o) => o.height <= b.height + 0.5 && b.height <= o.height + o.stretch)) continue;
      const o = options(b.story, b.cols)[b.option];
      const lines = Math.max(1, o.module.bodyLines) + ((b.height - o.height) / BODY.pitch) * b.cols;
      needs.push({ story: stories[b.story], lines, perLine: wordCount(o.module.story.bodies.long) / Math.max(1, o.module.bodyLines) });
    }
    if (needs.length && await slots.writeTo(needs)) {
      return solvePage(n, stories, band, ads, blocks, m, modular, rng, avoid, log, round, fill, shortBy, last, leadWide, grow, beat, anyWidth, { ...slots, pass: (slots.pass ?? 0) + 1 });
    }
  }
  if (!candidates.length) {
    // (a design that can't be made any height at all says neither)
    const diagnosis = { short: near.filter((x) => x.above < 0 && x.below >= 0).length, long: near.filter((x) => x.below < 0 && x.above >= 0).length };
    // (the planner knows for certain: nothing fits under the foot, or the page falls short of it)
    if (planning && !near.length && plannedShort > 0) { if (plannedShort < Math.floor(height / PT)) diagnosis.short = 1; else diagnosis.long = 1; }
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
  let best: { page: EnginePage; cost: number; penalty: number; fills: Extract<Block, { kind: "fill" }>[] } | null = null;
  let looked = 0;
  const queue = [...candidates];
  for (let q = 0; q < queue.length; q++) {
    const { t, cost, solver, ads: arranged, short } = queue[q];
    if (looked >= (planning ? 300 : n === 1 ? 120 : 40)) break;
    const sig = sigOf(t, stories);
    if (avoid?.has(sig)) continue;
    looked++;
    const laid = solver.layout(t, band.top, short ?? 0);
    if (!laid) continue;
    // (planned designs are many: one with a lesser headline over a bigger one is passed over unset)
    if (planning && q < candidates.length && candidates.length > 1) {
      if (disordered(laid, options)) { queue.push(queue[q]); looked--; continue; }
    }
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
    // the front page's limit counts what its gaps will take (31 Oct: 5 stories and 2 briefs made 7)
    if (n === 1) penalty += 300 * Math.max(0, placed.length + got.fills.length - FRONT_MOST);
    // a gap one column wide with no ad to force it, or a tall one: hardly a story
    // fits it (31 Oct's page 4 left 16cm white)
    for (const f of got.fills) if (f.cols === 1 && (!oneColumn || f.height > 12 * BODY.pitch)) penalty += 500;
    // the lead with its photo (copy 8 of 1 Nov came out without): gate S13
    if (n === 1 && placed.some((p) => p.module.story.id === stories[0].id && p.module.photoDropped)) penalty += 1000;
    // the editor's column at the page's edge, as high as it can be
    for (const p of placed) {
      if (!p.module.story.editorsColumn) continue;
      if (p.col > 0 && p.col + p.module.cols < GRID.columns) penalty += 300;
      if (p.y > band.top + 1) penalty += 30;
    }
    // (a page with a strip by a one-column ad: no more stories down one column than it takes)
    const total = cost + penalty + 100 * placed.filter((p) => p.module.cols === 1).length;
    if (!best || total < best.cost) {
      const elements = renderPlaced(placed);
      const boxes: Element[] = [
        ...placed.map((p) => ({ id: p.module.story.id, kind: "rect" as const, x: p.x, y: p.y, width: p.module.width, height: p.module.height })),
        ...got.ads.map((a) => ({ id: a.id, kind: "rect" as const, x: a.x, y: a.y, width: a.width, height: a.height })),
      ];
      best = { page: { page: n, placed, ads: got.ads, elements, blocks: boxes, design: sig }, cost: total, penalty, fills: got.fills };
    }
    if (penalty === 0 && !placed.some((p) => p.module.cols === 1)) break;
  }
  // a page that came out with a lesser headline over a bigger one, or the like:
  // this page alone designed again (the whole paper laid out again took ten minutes, 30 Oct)
  if (best && best.penalty >= 20 && round < PAGE_RETRIES) {
    log(`  page ${n}: its best design isn't good enough: trying more`);
    return { page: null, diagnosis: { short: 0, long: 0, again: true } };
  }
  // the best design still has a gap one column wide: a real story for it, not a scrap
  if (!oneColumn && best?.fills.some((f) => f.cols === 1)) {
    const again = await solvePage(n, stories, band, ads, blocks, m, modular, rng, avoid, log, round, fill, shortBy, last, leadWide, grow, beat, true);
    if (again.page) return again;
  }
  const gapOf = (fills: Extract<Block, { kind: "fill" }>[]) => fills.reduce((a, f) => a + f.height * f.cols, 0);
  if (beat < Infinity && (!best || gapOf(best.fills) >= beat)) return none;
  if (best?.fills.length && grow && await grow(best.page.placed, best.fills)) {
    const again = await solvePage(n, stories, band, ads, blocks, m, modular, rng, avoid, log, round, fill, shortBy, last, leadWide, undefined, gapOf(best.fills), anyWidth);
    if (again.page) return again;
  }
  // the design's filler blocks, filled with copy (layout/fill.ts)
  if (best?.fills.length) {
    const page = best.page;
    const extra: Element[] = [];
    const avoid = page.placed.map((p) => p.module.story.headline);
    for (const f of best.fills) {
      const smallest = Math.min(...page.placed.filter((p) => p.module.headSize > 0).map((p) => p.module.headSize));
      const room = n === 1 ? FRONT_MOST - page.placed.length : Infinity;
      const got = room > 0 ? await fillInTurn(n, f.col, f.cols, f.y, f.height, fill, avoid, smallest, room) : null;
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
