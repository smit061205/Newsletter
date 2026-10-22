// Fills each page with stories sized to their own content (module.ts):
//
//   1. the page's chrome and ads are fixed blocks;
//   2. a "skyline" keeps the next free y of every grid column;
//   3. the lowest, leftmost open stretch is filled with a story module that
//      fits there -- a choice of story, column span and text length -- with
//      the paper's normal gap (and rule) between stacked stories;
//   4. a beam search keeps the best partial pages and returns the one that
//      leaves the least white space and places the most important stories.
// The lead story opens page 1 at the top. Related stories never share a page.
// Every module height is measured, so every score is exact.
import type { Element } from "@ck/shared/contract";
import type { Ad, Story } from "../store.ts";
import type { Measurer } from "./measure.ts";
import { buildModule, place, spanWidth, type Module, type PhotoMode, type Variant } from "./module.ts";
import { related } from "./stories.ts";
import { BODY, GAP, GRID, INK, PT } from "./typography.ts";

export interface Band { top: number; bottom: number }

export interface PlacedModule {
  module: Module; col: number; x: number; y: number;
  /** a vertical rule in the gutter on its left, from its top down its
   * height: keeps its headline from reading on from its neighbour's */
  ruleLeft?: boolean;
}

export interface PagePlan {
  page: number;
  placed: PlacedModule[];
  elements: Element[];
  /** white space left inside the band, as a share of it */
  waste: number;
  /** column stretches left empty: [column, from y, to y] */
  gaps: { col: number; y0: number; y1: number }[];
}

const VARIANTS: Variant[] = ["long", "medium", "short"];
const colX = (c: number) => GRID.left + c * GRID.pitch;
export interface Obstacle { x0: number; x1: number; y0: number; y1: number }

/** Column spans worth trying for a story of this rank, widest-preferred first. */
export function spansFor(rank: number): number[] {
  // a headline in one column is only for a brief: anything bigger gets two at least
  return [[4, 5, 6, 3, 8], [4, 3, 5, 2], [3, 2, 4], [2, 3], [1, 2]][Math.min(rank, 5) - 1];
}

/** A story's rank on its page: the page's lead is 1; short items are briefs. */
export function rankOf(s: Story, lead: boolean): number {
  if (lead) return 1;
  if (s.bodies.long.length < 600) return 5;
  return Math.min(5, Math.max(2, s.priority + 1));
}


interface State {
  free: number[];
  placed: PlacedModule[];
  used: Set<string>;
  waste: number;
  gaps: { col: number; y0: number; y1: number }[];
  value: number;
  /** story area placed so far */
  area: number;
}

/** Two headlines of about the same size side by side, starting level:
 * they read as one run-on line. */
export function tombstoned(a: PlacedModule, b: PlacedModule): boolean {
  const ha = a.module.headSize, hb = b.module.headSize;
  return a.col + a.module.cols === b.col && !b.ruleLeft && Math.abs(a.y - b.y) < 2 * BODY.pitch && ha > 0 && hb > 0
    && Math.abs(ha - hb) < 0.15 * Math.max(ha, hb);
}

/** `b` is less important than `a`, no wider, yet has the bigger headline. */
export const outranks = (a: Module, b: Module) =>
  a.rank < b.rank && b.cols <= a.cols && b.headSize > a.headSize + 0.5 * PT;

/** A headline (with kicker) taking over 30% of its story -- briefs aside. */
export const headlineHeavy = (m: Module) => m.headSize > 0 && m.rank < 5 && m.headlineHeight / m.height > 0.3;

/** A page's placed stories as elements, with a thin rule over every story
 * stacked under another one. */
export function renderPlaced(placed: PlacedModule[], extra: Element[] = []): Element[] {
  const gap = GAP.betweenStories;
  const elements: Element[] = [];
  for (const p of placed) {
    elements.push(...place(p.module.elements, p.x, p.y));
    if (p.ruleLeft) {
      const rx = p.x - GRID.gutter / 2;
      elements.push({ id: `${p.module.story.id}-vrule`, kind: "line", articleId: p.module.story.id,
                      x1: rx, y1: p.y, x2: rx, y2: p.y + p.module.height, color: INK, width: GAP.storyRule });
    }
    // the story above, sharing columns, ending in the space just over this one
    // (exactly the gap, or a little short of it): the rule halfway between
    const above = placed.filter((q) => q !== p && Math.min(q.col + q.module.cols, p.col + p.module.cols) > Math.max(q.col, p.col))
      .map((q) => q.y + q.module.height).filter((b) => b <= p.y - gap + 2 && b > p.y - gap - 2 * BODY.pitch);
    if (above.length && GAP.storyRule > 0) {
      const ry = (Math.max(...above) + p.y) / 2;
      elements.push({ id: `${p.module.story.id}-rule`, kind: "line", articleId: p.module.story.id,
                      x1: p.x, y1: ry, x2: p.x + p.module.width, y2: ry, color: INK, width: GAP.storyRule });
    }
  }
  return [...elements, ...extra];
}

export { colX };

export class Packer {
  private cache = new Map<string, Promise<Module>>();
  private m: Measurer;
  constructor(m: Measurer) {
    this.m = m;
  }

  module(story: Story, rank: number, cols: number, variant: Variant, mode: PhotoMode = 0): Promise<Module> {
    const key = `${story.id}|${rank}|${cols}|${variant}|${mode}`;
    if (!this.cache.has(key)) this.cache.set(key, buildModule(story, rank, cols, variant, this.m, mode));
    return this.cache.get(key)!;
  }

  /** A story's usual size: its preferred span, full text, usual photo. */
  async naturalArea(story: Story, lead: boolean): Promise<number> {
    const rank = rankOf(story, lead);
    const mod = await this.module(story, rank, spansFor(rank)[0], "long");
    return mod.width * (mod.height + GAP.betweenStories);
  }

  /** Pack one page from `pool` (most important first). */
  async packPage(page: number, pool: Story[], band: Band, ads: Ad[],
                 opts: { leadFirst: boolean; beam?: number; budget?: number;
                         /** the widest a story may be on this page (the front page's rule), unless it's allowed full width */
                         maxCols?: number;
                         /** copy (natural area) that must stay in the pool for the pages after this one */
                         reserve?: number }): Promise<PagePlan> {
    const gap = GAP.betweenStories;
    const obstacles: Obstacle[] = ads.map((a) => ({ x0: a.x, x1: a.x + a.width, y0: a.y, y1: a.y + a.height }));
    const inCol = (o: Obstacle, c: number) => Math.min(o.x1, colX(c) + GRID.column) - Math.max(o.x0, colX(c)) > 20;
    const cols = GRID.columns;
    // a column's free y skips over any ad it runs into
    const settle = (c: number, y: number): number => {
      for (;;) {
        const hit = obstacles.find((o) => inCol(o, c) && o.y0 - gap < y + 1 && o.y1 > y - 1);
        if (!hit) return y;
        y = hit.y1 + gap;
      }
    };
    const limitBelow = (c: number, y: number) => Math.min(band.bottom, ...obstacles.filter((o) => inCol(o, c) && o.y0 >= y).map((o) => o.y0 - gap));
    const minBody = 4 * BODY.pitch; // nothing smaller than a brief fits a stretch shorter than this

    let beam: State[] = [{
      free: Array.from({ length: cols }, (_, c) => settle(c, band.top)), placed: [], used: new Set(), waste: 0, gaps: [], value: 0, area: 0,
    }];
    const budget = opts.budget ?? Infinity;
    // all the copy the page may still take: the rest of its budget, or the pool
    const poolArea = (await Promise.all(pool.map((s, i) => this.naturalArea(s, opts.leadFirst && i === 0)))).reduce((a, b) => a + b, 0);
    const copyLimit = Math.min(budget, poolArea);
    // the space still open in a state: each column from its free y to the
    // page foot, less the ads in the way
    const openArea = (st: State) => {
      let a = 0;
      for (let c = 0; c < cols; c++) {
        if (st.free[c] >= band.bottom - 1) continue;
        let h = band.bottom - st.free[c];
        for (const o of obstacles) if (inCol(o, c)) h -= Math.max(0, Math.min(o.y1, band.bottom) - Math.max(o.y0, st.free[c]));
        a += Math.max(0, h) * (GRID.column + GRID.gutter);
      }
      return a;
    };
    // a state's score: white space already left, plus what will be left once
    // the copy still allowed on this page fills the open space -- so a wider
    // photo now, that leaves no gap later, wins over a gap at the page foot
    const score = (st: State) => {
      const projected = st.waste + Math.max(0, openArea(st) - Math.max(0, copyLimit - st.area));
      return projected / bandArea * 40 - st.value;
    };
    const finished: State[] = [];
    const width = opts.beam ?? 12;
    const bandArea = (band.bottom - band.top) * spanWidth(cols);

    for (let step = 0; step < 80 && beam.length; step++) {
      const next: State[] = [];
      for (const st of beam) {
        // the lowest, leftmost open column
        let c0 = -1;
        for (let c = 0; c < cols; c++) if (st.free[c] < band.bottom - 1 && (c0 < 0 || st.free[c] < st.free[c0] - 0.5)) c0 = c;
        if (c0 < 0) { finished.push(st); continue; }
        const y = st.free[c0];
        let run = 0;
        while (c0 + run < cols && Math.abs(st.free[c0 + run] - y) < 1) run++;
        const options: { st: State; score: number }[] = [];
        const isLead = opts.leadFirst && st.placed.length === 0;
        const onPage = st.placed.map((p) => p.module.story);
        // related stories (the same trip, the same kind of event) preferably
        // go on different pages -- a cost, not a ban: a gap is worse
        const remaining = pool.filter((s) => !st.used.has(s.id));
        const candidates = isLead ? remaining.slice(0, 1)
          : [...new Set([...remaining.slice(0, 4), ...[...remaining].sort((a, b) => a.bodies.long.length - b.bodies.long.length).slice(0, 3)])];
        // the page's budget keeps copy for the pages after it -- but only as
        // a preference: a story that fits here is better than a hole
        for (const strict of [true, false]) {
        if (!strict && options.length) break;
        for (const story of candidates) {
          const rank = rankOf(story, isLead);
          // the story's own usual size counts against the page's budget,
          // whatever layout it gets: wider photos only use up spare room
          const usual = await this.naturalArea(story, isLead);
          if (strict && st.area + usual > budget * 1.08 && st.placed.length) continue;
          // over budget only while the later pages keep enough copy to fill
          if (!strict && poolArea - st.area - usual < (opts.reserve ?? 0)) continue;
          const modes: PhotoMode[] = !story.photo ? [0] : (story.photos?.length ?? 0) >= 2 ? [0, 1, 2] : [0, 1];
          for (const k of spansFor(rank)) {
            if (k > run) continue;
            if (opts.maxCols && k > opts.maxCols && !story.fullWidth) continue;
            const limits = Array.from({ length: k }, (_, i) => limitBelow(c0 + i, y));
            const limit = Math.min(...limits);
            if (limit - y < minBody) continue;
            // a story over columns that end at different depths (an ad under
            // some of them) leaves an L-shaped hole under the rest that no
            // story can grow into: avoided where another width works
            const straddle = Math.max(...limits) - limit > minBody;
            for (const mode of modes) for (const variant of VARIANTS) {
              let mod = await this.module(story, rank, k, variant, mode);
              // two headlines side by side, level and the same size, read as
              // one line ("tombstoned"): the desk sets this one a size smaller
              const level = (m2: Module) => st.placed.some((q) => tombstoned(q, { module: m2, col: c0, x: colX(c0), y })
                                                                 || tombstoned({ module: m2, col: c0, x: colX(c0), y }, q));
              if (!isLead && rank < 5 && level(mod)) {
                const smaller = await this.module(story, rank + 1, k, variant, mode);
                if (smaller.height <= limit && !level(smaller)) mod = smaller;
              }
              if (y + mod.height > limit) continue; // too tall here: try shorter text
              const free = [...st.free];
              for (let i = 0; i < k; i++) free[c0 + i] = settle(c0 + i, y + mod.height + gap);
              // what this leaves under the story before the next ad or the page foot
              const below = limit - (y + mod.height);
              const stranded = below < minBody ? below * spanWidth(k) : 0;
              const value = (6 - rank) * (variant === "long" ? 1 : variant === "medium" ? 0.85 : 0.7)
                            - (mod.photoDropped ? 0.6 : 0) - (mode ? 0.05 : 0)
                            - (onPage.some((o) => related(o, story)) ? 1.5 : 0)
                            // the desk's rules, as costs the search avoids
                            - (headlineHeavy(mod) ? 4 : 0)
                            - (straddle ? 2 : 0)
                            // a headline that can't fill this width: another width, if one works
                            - (mod.displayFill < 0.97 ? 3 : 0)
                            // headline sizes follow importance: never a bigger headline than a
                            // more important story no narrower, nor smaller than a lesser one
                            - (st.placed.some((q) => outranks(q.module, mod) || outranks(mod, q.module)) ? 4 : 0)
                            - (st.placed.some((q) => tombstoned(q, { module: mod, col: c0, x: colX(c0), y })
                                                  || tombstoned({ module: mod, col: c0, x: colX(c0), y }, q)) ? 4 : 0);
              const nst: State = {
                free, placed: [...st.placed, { module: mod, col: c0, x: colX(c0), y }],
                used: new Set([...st.used, story.id]), waste: st.waste + stranded,
                gaps: below < minBody && below > BODY.pitch * 1.5
                  ? [...st.gaps, ...Array.from({ length: k }, (_, i) => ({ col: c0 + i, y0: y + mod.height, y1: limit }))]
                  : st.gaps,
                value: st.value + value,
                area: st.area + usual,
              };
              if (below < minBody) for (let i = 0; i < k; i++) nst.free[c0 + i] = band.bottom; // closed
              options.push({ st: nst, score: score(nst) });
              break; // the longest version that fits (in this photo layout) is the one worth keeping
            }
          }
        }
        }
        if (!options.length) {
          // nothing fits this stretch: close it up to the next level and count the space
          const higher = st.free.filter((f, c) => (c < c0 || c >= c0 + run) && f > y + 0.5 && f < band.bottom - 1);
          const limit = Math.min(...Array.from({ length: run }, (_, i) => limitBelow(c0 + i, y)));
          const to = Math.min(limit, higher.length ? Math.min(...higher) : limit);
          const free = [...st.free];
          for (let i = 0; i < run; i++) free[c0 + i] = to >= limit ? band.bottom : settle(c0 + i, to);
          next.push({ ...st, free, waste: st.waste + (to - y) * spanWidth(run),
                      gaps: (to - y) > BODY.pitch * 1.5 ? [...st.gaps, ...Array.from({ length: run }, (_, i) => ({ col: c0 + i, y0: y, y1: to }))] : st.gaps });
          continue;
        }
        options.sort((a, b) => a.score - b.score);
        next.push(...options.slice(0, 6).map((o) => o.st));
      }
      // keep the best partial pages (and drop exact duplicates)
      const seen = new Set<string>();
      beam = next.sort((a, b) => score(a) - score(b))
        .filter((s) => {
          const key = s.placed.map((p) => `${p.module.story.id}:${p.col}:${p.module.cols}:${p.module.variant}`).sort().join(",");
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, width);
    }
    finished.push(...beam);
    const best = finished.sort((a, b) => score(a) - score(b))[0];

    const elements = renderPlaced(best.placed);
    return { page, placed: best.placed, elements, waste: best.waste / bandArea, gaps: best.gaps };
  }
}
