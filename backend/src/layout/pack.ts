// The page helpers the layout engine (layout/engine.ts) shares: a story's
// rank and usual widths, the headline rules between stories, placed modules
// set out as elements. (The old packer that lived here -- a skyline and a
// beam search -- was taken out on 26 Oct 2026: every page is the engine's.)
import type { Element } from "@ck/shared/contract";
import type { Story } from "../store.ts";
import type { Measurer } from "./measure.ts";
import { buildModule, place, type Module, type PhotoMode, type Variant } from "./module.ts";
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
}
