// A page design as a guillotine cut (layout/designs.ts makes them): the page's
// story area cut straight across or straight down, again and again, into one
// block per story or ad. Every story block's height is then solved exactly:
//   - blocks side by side ("row") end at the same depth;
//   - blocks stacked ("stack") add up, with the paper's gap (and its rule)
//     between them -- a hair wider where that's what fits;
//   - the whole design fills the page's story area to its foot.
// Heights are worked out in whole points over every setting of every story
// (layout/blocks.ts): a story's lengths, widths and photo layouts, and the
// small stretch each one has (header spacing, pitch). A design with no exact
// solution is dropped -- so a page that's laid out has no hole by construction.
import type { Ad } from "../store.ts";
import type { Measurer } from "./measure.ts";
import { atPitch, columnLines, HEAD_SPREAD, PITCH_STRETCH, type Option } from "./blocks.ts";
import type { Module } from "./module.ts";
import { colX, type PlacedModule } from "./pack.ts";
import { GAP, GRID, PT } from "./typography.ts";
import type { Element } from "@ck/shared/contract";

export type Tree =
  | { kind: "story"; story: number; cols: number }
  | { kind: "ad"; ad: number; cols: number }
  /** a hole by an ad no story fits: a short item written to its size, or the paper's message panel */
  | { kind: "fill"; cols: number }
  | { kind: "stack"; cols: number; children: Tree[] }
  | { kind: "row"; cols: number; children: Tree[] };

/** Extra gap a stack may put between two blocks (pt): the rule stays halfway. */
const GAP_STRETCH = 3;
/** A filler block: at least this tall (px), and what one costs (more than any story's setting). */
export const FILL_MIN = 70 * PT;
/** ... at most this tall: a hole a short item can fill */
export const FILL_MAX = 420 * PT;
/** (a point of a column's filler costs more than any story's setting: the last resort) */
const FILL_COST = 10;
/** What a point of stretch costs (the natural setting is best). */
const STRETCH_COST = 0.01;

/** What each design's blocks can be set as: per story, its options at each width. */
export interface SolveInput {
  options: (story: number, cols: number) => Option[];
  ads: Ad[];
  /** the story area's height (px) */
  height: number;
  /** the tallest a filler block may be (px): taller on a page short of copy */
  fillMax?: number;
}

/** A design solved: for each node, the cheapest way to make it each height (in whole points). */
interface Solved {
  cost: Float64Array;
  /** story: the option index per height; stack: the split per height */
  pick?: Int32Array;
  /** stack: the gap stretch per height (pt) */
  stretch?: Int8Array;
  children?: Solved[];
  /** a stack's children folded left to right: what each prefix can be */
  prefix?: Solved[];
}

const INF = Number.POSITIVE_INFINITY;

export function signature(t: Tree): string {
  switch (t.kind) {
    case "story": return `s${t.story}:${t.cols}`;
    case "ad": return `a${t.ad}`;
    case "fill": return `f:${t.cols}`;
    default: return `${t.kind === "stack" ? "S" : "R"}(${t.children.map(signature).join(",")})`;
  }
}

export class Solver {
  private input: SolveInput;
  private H: number; // buckets (pt)
  private memo = new Map<string, Solved>();
  constructor(input: SolveInput) {
    this.input = input;
    this.H = Math.ceil(input.height / PT) + 2;
  }

  /** The cheapest cost of a design filling the story area exactly, or Infinity. */
  cost(t: Tree): number {
    const s = this.solve(t);
    return s.cost[this.target()];
  }

  /** How near a design gets to the story area's height (pt): the closest heights it can make, below and above. */
  near(t: Tree): { below: number; above: number } {
    const c = this.solve(t).cost;
    const h = this.target();
    let below = -1, above = -1;
    for (let k = h; k >= 0; k--) if (c[k] < INF) { below = h - k; break; }
    for (let k = h; k < c.length; k++) if (c[k] < INF) { above = k - h; break; }
    return { below, above };
  }

  private target() {
    return Math.floor(this.input.height / PT);
  }

  private solve(t: Tree): Solved {
    const key = signature(t);
    const got = this.memo.get(key);
    if (got) return got;
    const H = this.H;
    let out: Solved;
    switch (t.kind) {
      case "story": {
        const cost = new Float64Array(H).fill(INF);
        const pick = new Int32Array(H).fill(-1);
        this.input.options(t.story, t.cols).forEach((o, i) => {
          const lo = o.height / PT, hi = (o.height + o.stretch) / PT;
          for (let h = Math.max(0, Math.floor(lo)); h < H && h <= hi; h++) {
            const c = o.cost + Math.max(0, h - lo) * STRETCH_COST;
            if (c < cost[h]) { cost[h] = c; pick[h] = i; }
          }
        });
        out = { cost, pick };
        break;
      }
      case "ad": {
        const cost = new Float64Array(H).fill(INF);
        const h = Math.floor(this.input.ads[t.ad].height / PT);
        if (h < H) cost[h] = 0;
        out = { cost };
        break;
      }
      case "fill": {
        // any height from a few lines up: what's written for it is fitted to it
        const cost = new Float64Array(H).fill(INF);
        const lo = Math.ceil(FILL_MIN / PT);
        for (let h = lo; h < H && h * PT <= (this.input.fillMax ?? FILL_MAX); h++) cost[h] = FILL_COST + (h * t.cols) / 40;
        out = { cost };
        break;
      }
      case "row": {
        const children = t.children.map((c) => this.solve(c));
        const cost = new Float64Array(H);
        for (let h = 0; h < H; h++) {
          let c = 0;
          for (const ch of children) { c += ch.cost[h]; if (c === INF) break; }
          cost[h] = c;
        }
        out = { cost, children };
        break;
      }
      case "stack": {
        const children = t.children.map((c) => this.solve(c));
        const gap = Math.round(GAP.betweenStories / PT);
        const prefix: Solved[] = [children[0]];
        for (let k = 1; k < children.length; k++) {
          const A = prefix[k - 1].cost, B = children[k].cost;
          const cost = new Float64Array(H).fill(INF);
          const pick = new Int32Array(H).fill(-1);
          const stretch = new Int8Array(H);
          const as: number[] = [], bs: number[] = [];
          for (let h = 0; h < H; h++) { if (A[h] < INF) as.push(h); if (B[h] < INF) bs.push(h); }
          for (const a of as) {
            for (const b of bs) {
              for (let s = 0; s <= GAP_STRETCH; s++) {
                const h = a + b + gap + s;
                if (h >= H) break;
                const c = A[a] + B[b] + s * STRETCH_COST * 2;
                if (c < cost[h]) { cost[h] = c; pick[h] = a; stretch[h] = s; }
              }
            }
          }
          prefix.push({ cost, pick, stretch });
        }
        out = { cost: prefix[prefix.length - 1].cost, children, prefix };
        break;
      }
    }
    this.memo.set(key, out);
    return out;
  }

  /** The design set out on the page: each block's place and target height (px), from `top`. */
  layout(t: Tree, top: number, short = 0): Block[] | null {
    const s = this.solve(t);
    // (`short`: points short of the foot -- a page no design fills, set out as near as one gets)
    const h = this.target() - short;
    if (s.cost[h] === INF) return null;
    const out: Block[] = [];
    this.place(t, s, 0, top, short ? h * PT : this.input.height, h, out);
    return out;
  }

  private place(t: Tree, s: Solved, col: number, y: number, height: number, h: number, out: Block[]) {
    switch (t.kind) {
      case "story": {
        // the bucket asked for, or the nearest one this story can make
        const at = (k: number) => (k >= 0 && k < s.pick!.length ? s.pick![k] : -1);
        let option = at(h);
        for (let d = 1; option < 0 && d < 4; d++) option = at(h - d) >= 0 ? at(h - d) : at(h + d);
        out.push({ kind: "story", story: t.story, cols: t.cols, col, y, height, option: Math.max(0, option) });
        return;
      }
      case "ad":
        out.push({ kind: "ad", ad: t.ad, cols: t.cols, col, y, height: this.input.ads[t.ad].height });
        return;
      case "fill":
        out.push({ kind: "fill", cols: t.cols, col, y, height });
        return;
      case "row": {
        let c = col;
        t.children.forEach((child, i) => {
          this.place(child, s.children![i], c, y, height, h, out);
          c += child.cols;
        });
        return;
      }
      case "stack": {
        // from the last child back: each prefix's split says where it ends
        const n = t.children.length;
        const parts: { h: number; gap: number }[] = new Array(n);
        let rest = h;
        for (let k = n - 1; k >= 1; k--) {
          const p = s.prefix![k];
          const a = p.pick![rest];
          const gapPt = Math.round(GAP.betweenStories / PT) + p.stretch![rest];
          parts[k] = { h: rest - a - gapPt, gap: gapPt };
          rest = a;
        }
        parts[0] = { h: rest, gap: 0 };
        // in px: each child its buckets' share of the height (the exact
        // height's spare fraction goes to the first one)
        const gaps = parts.reduce((t2, p) => t2 + p.gap, 0);
        const sizes = parts.map((p, i) => (t.children[i].kind === "ad" ? this.input.ads[(t.children[i] as { ad: number }).ad].height : p.h * PT));
        const spare = height - gaps * PT - sizes.reduce((a, b) => a + b, 0);
        sizes[Math.max(0, t.children.findIndex((c) => c.kind !== "ad"))] += spare;
        let cy = y;
        t.children.forEach((child, i) => {
          cy += parts[i].gap * PT;
          this.place(child, s.children![i], col, cy, sizes[i], parts[i].h, out);
          cy += sizes[i];
        });
        return;
      }
    }
  }
}

export type Block =
  | { kind: "story"; story: number; cols: number; col: number; y: number; height: number; option: number }
  | { kind: "ad"; ad: number; cols: number; col: number; y: number; height: number }
  | { kind: "fill"; cols: number; col: number; y: number; height: number };

/** A story's module made exactly `height` tall where its stretch allows:
 * its body's pitch opened (up to 2%), then a little more space under the
 * headline and the sub-heading; what's left (under a point, mostly) stays
 * under it. */
export async function stretchTo(mod: Module, height: number, m: Measurer): Promise<Module> {
  let out = mod;
  const lines = columnLines(mod);
  const headroom = (mod.deckSize > 0 ? 2 : 1) * HEAD_SPREAD;
  const forPitch = height - mod.height - headroom;
  if (forPitch > 0.3 * PT && lines > 0) {
    const pitch = Math.min(mod.pitch * (1 + PITCH_STRETCH), mod.pitch + forPitch / lines);
    const looser = await atPitch(mod, pitch, m);
    if (Number.isFinite(looser.height) && looser.height <= height + 0.5) out = looser;
  }
  const r = height - out.height;
  if (r < 0.5) return out;
  const id = out.story.id;
  const isDeck = (e: Element) => e.id.startsWith(`${id}-d`);
  const isHead = (e: Element) => e.id.startsWith(`${id}-h`) || e.id.startsWith(`${id}-k`);
  const hasDeck = out.elements.some(isDeck);
  const a = hasDeck ? Math.min(HEAD_SPREAD, r / 2) : 0; // under the headline (the deck moves down)
  const b = Math.min(HEAD_SPREAD, r - a); // under the sub-heading (photo and body move down)
  const shift = (e: Element, d: number): Element => (d === 0 || e.kind === "path" ? e : e.kind === "line" ? { ...e, y1: e.y1 + d, y2: e.y2 + d } : { ...e, y: e.y + d });
  const elements = out.elements.map((e) => (isHead(e) ? e : isDeck(e) ? shift(e, a) : shift(e, a + b)));
  return { ...out, elements, height: out.height + a + b };
}

/** The blocks as placed modules and ads (the page's elements come from pack.ts renderPlaced). */
export async function realise(blocks: Block[], options: (story: number, cols: number) => Option[], ads: Ad[], m: Measurer):
  Promise<{ placed: PlacedModule[]; ads: Ad[]; fills: Extract<Block, { kind: "fill" }>[] }> {
  const placed: PlacedModule[] = [];
  const outAds: Ad[] = [];
  const fills: Extract<Block, { kind: "fill" }>[] = [];
  for (const b of blocks) {
    if (b.kind === "fill") { fills.push(b); continue; }
    if (b.kind === "ad") {
      outAds.push({ ...ads[b.ad], x: colX(b.col), y: b.y + b.height - ads[b.ad].height });
      continue;
    }
    const opt = options(b.story, b.cols)[b.option];
    const mod = await stretchTo(opt.module, b.height, m);
    placed.push({ module: mod, col: b.col, x: colX(b.col), y: b.y });
  }
  return { placed, ads: outAds, fills };
}

/** Columns' x extent (for the generator's area sums). */
export const spanOf = (cols: number) => cols * GRID.column + (cols - 1) * GRID.gutter;
