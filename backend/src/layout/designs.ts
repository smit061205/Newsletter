// Page designs: the ways a page's story area can be cut into one block per
// story and ad (layout/guillotine.ts solves each one's heights). A design is
// grown from the page's stories, most important first, the way a desk sketches
// a page: the top story across the top, or a column of stories beside it;
// the rest split into strips side by side, or stacked. The page's ads sit at
// the foot of their columns, each in its own block. Every story's block is a
// width that story may take (layout/blocks.ts). Many designs are drawn from a
// seeded random choice -- the same day, the same designs; a copy, others --
// and the solver keeps those that fill the page exactly.
import type { Tree } from "./guillotine.ts";
import { spanOf } from "./guillotine.ts";
import { GAP } from "./typography.ts";

export interface DesignStory {
  /** not a story: room for a filler (a page short of copy) */
  fill?: boolean;
  /** the widths it may take */
  widths: number[];
  /** its area at its middle length (px²), a width's own */
  area: (cols: number) => number;
}

/** An ad at the foot of its columns [c0, c1). */
export interface DesignAd { index: number; c0: number; c1: number; y: number; height: number }

interface Region { c0: number; c1: number; height: number; ads: DesignAd[]; items: number[] }

/** Up to `count` different designs for a page of `cols` columns `height` tall. */
export function designs(stories: DesignStory[], ads: DesignAd[], cols: number, height: number, rng: () => number,
                        count = 300, attempts = 6000): Tree[] {
  const out = new Map<string, Tree>();
  const items = stories.map((_, i) => i);
  for (let n = 0; n < attempts && out.size < count; n++) {
    const t = grow({ c0: 0, c1: cols, height, ads, items }, stories, rng);
    if (t && fills(t) <= 2) out.set(key(t), t);
  }
  return [...out.values()];
}

const key = (t: Tree): string => (t.kind === "story" ? `s${t.story}:${t.cols}` : t.kind === "ad" ? `a${t.ad}` : t.kind === "fill" ? `f${t.cols}`
  : `${t.kind}(${t.children.map(key).join(",")})`);
const fills = (t: Tree): number => (t.kind === "fill" ? 1 : t.kind === "stack" || t.kind === "row" ? t.children.reduce((a, c) => a + fills(c), 0) : 0);

/** A child's blocks taken into its parent when they're the same kind (a stack in a stack is one stack). */
function join(kind: "stack" | "row", cols: number, parts: Tree[]): Tree {
  return { kind, cols, children: parts.flatMap((p) => (p.kind === kind ? p.children : [p])) };
}

/** Weighted choice of 1..n. */
const pick = (rng: () => number, weights: number[]) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
  return weights.length - 1;
};

/** No design this way (the reason says why, for whoever reads the code). */
const no = (_why: string): null => null;

function grow(r: Region, stories: DesignStory[], rng: () => number): Tree | null {
  const cols = r.c1 - r.c0;
  if (r.height < 30) return no("short");
  if (r.ads.length) {
    // an ad across the whole region: at its foot, the rest above it
    const full = r.ads.filter((a) => a.c0 === r.c0 && a.c1 === r.c1);
    if (full.length) {
      const f = full.reduce((p, a) => (a.y > p.y ? a : p));
      const rest = r.ads.filter((a) => a !== f);
      const leaf: Tree = { kind: "ad", ad: f.index, cols };
      // an ad with nothing over it: the ad alone (it must end level by itself), or a filler over it
      if (!r.items.length && !rest.length) return rng() < 0.5 ? leaf : join("stack", cols, [{ kind: "fill", cols }, leaf]);
      const above = grow({ ...r, height: r.height - f.height - GAP.betweenStories, ads: rest }, stories, rng);
      return above ? join("stack", cols, [above, leaf]) : null;
    }
    if (!r.items.length) {
      // ads that don't cover the region, and no story for it: a filler beside them
      const cuts = [...new Set(r.ads.flatMap((a) => [a.c0, a.c1]))].filter((c) => c > r.c0 && c < r.c1 && !r.ads.some((a) => a.c0 < c && c < a.c1));
      if (!cuts.length) return no("ads without stories");
      return rowAt(r, cuts[Math.floor(rng() * cuts.length)], stories, rng);
    }
    // stories across the top, the ads' columns below; or cut down beside an ad
    // (the first story's side as wide as it may be)
    const cuts: number[] = [];
    for (let c = r.c0 + 1; c < r.c1; c++) if (!r.ads.some((a) => a.c0 < c && c < a.c1)) cuts.push(c);
    const first = stories[r.items[0]].widths;
    const good = cuts.filter((c) => first.includes(c - r.c0) || first.includes(r.c1 - c));
    if (r.items.length >= 2 && (!good.length || rng() < 0.4)) return stackTop(r, stories, rng);
    if (!cuts.length) return no("no cut beside the ads");
    return rowAt(r, (good.length ? good : cuts)[Math.floor(rng() * (good.length || cuts.length))], stories, rng);
  }
  // a strip with no story for it (beside or over an ad): a filler
  if (!r.items.length) return cols <= 4 ? { kind: "fill", cols } : no("empty");
  const first = stories[r.items[0]];
  if (r.items.length === 1) {
    if (first.fill) return first.widths.includes(cols) || cols <= 4 ? { kind: "fill", cols } : no("width");
    if (!first.widths.includes(cols)) {
      // a strip the story can't take whole (over one of several ads side by
      // side, 24 Oct's page 3): the story at a width it may take, a filler
      // beside it -- rather than no design at all
      const w = first.widths.filter((x) => x < cols && cols - x <= 3).sort((a, b) => b - a)[0];
      if (!w) return no("width");
      const story: Tree = { kind: "story", story: r.items[0], cols: w };
      return join("row", cols, rng() < 0.5 ? [story, { kind: "fill", cols: cols - w }] : [{ kind: "fill", cols: cols - w }, story]);
    }
    // a block far from the story's own size can't be filled by it -- unless,
    // much too big for it, a filler takes the rest of the height under it
    const ratio = first.area(cols) / (spanOf(cols) * r.height);
    if (ratio > 0.45 && ratio < 2.2) return { kind: "story", story: r.items[0], cols };
    if (ratio <= 0.45 && ratio > 0.12 && cols <= 4) return join("stack", cols, [{ kind: "story", story: r.items[0], cols }, { kind: "fill", cols }]);
    return no(`ratio ${ratio < 0.45 ? "low" : "high"}`);
  }
  // the first story across the top, the rest below; or the first story's
  // column (a width it may take) beside the rest; or a few across the top
  const across = first.widths.includes(cols);
  // (two stories left: the second takes the rest of the width, so it must be one it may take)
  const beside = first.widths.filter((w) => w < cols && (r.items.length > 2 || stories[r.items[1]].widths.includes(cols - w)));
  const choice = pick(rng, [across ? 1 : 0, beside.length ? 1.2 : 0, 0.5]);
  if (choice === 0) return stackTop(r, stories, rng, 1);
  if (choice === 1) {
    // wider columns for more important stories, mostly
    const w = beside[pick(rng, beside.map((x) => 0.5 + x))];
    return rowAt(r, rng() < 0.85 ? r.c0 + w : r.c1 - w, stories, rng, rng() < 0.85 ? 0 : 1);
  }
  return stackTop(r, stories, rng);
}

/** The first story (or two or three) across the region's top, the rest under them. */
function stackTop(r: Region, stories: DesignStory[], rng: () => number, fixed?: number): Tree | null {
  const cols = r.c1 - r.c0;
  const most = Math.min(3, r.items.length - (r.ads.length ? 0 : 1));
  if (most < 1) return no("stack: too few");
  const k = fixed ?? 1 + pick(rng, [0.55, 0.3, 0.15].slice(0, most));
  const top = r.items.slice(0, k);
  const topHeight = top.reduce((a, s) => a + stories[s].area(Math.min(cols, Math.max(...stories[s].widths))), 0) / spanOf(cols);
  const rest = r.height - topHeight - GAP.betweenStories;
  if (rest < 60) return no("stack: no room under");
  const a = grow({ c0: r.c0, c1: r.c1, height: topHeight, ads: [], items: top }, stories, rng);
  if (!a) return null;
  const b = grow({ ...r, height: rest, items: r.items.slice(k) }, stories, rng);
  return b ? join("stack", cols, [a, b]) : null;
}

/** The region cut down at column `c`: the stories shared out by the room each side has. */
function rowAt(r: Region, c: number, stories: DesignStory[], rng: () => number, firstSide?: number): Tree | null {
  const sides = [{ c0: r.c0, c1: c }, { c0: c, c1: r.c1 }].map((s) => {
    const ads = r.ads.filter((a) => a.c0 >= s.c0 && a.c1 <= s.c1);
    const room = spanOf(s.c1 - s.c0) * r.height - ads.reduce((t, a) => t + spanOf(a.c1 - a.c0) * (a.height + GAP.betweenStories), 0);
    return { ...s, ads, room, items: [] as number[], used: 0 };
  });
  if (sides.some((s) => s.room < 0)) return no("row: ads overfill a side");
  // the first story to the left (mostly), then each to the side with the most room left
  for (const [i, s] of r.items.entries()) {
    const side = i === 0 ? sides[firstSide ?? (stories[s].widths.includes(c - r.c0) ? 0 : 1)]
      : sides.reduce((p, q) => ((q.room - q.used) * (0.85 + 0.3 * rng()) > (p.room - p.used) ? q : p));
    side.items.push(s);
    side.used += stories[s].area(Math.min(side.c1 - side.c0, Math.max(...stories[s].widths)));
  }
  // a side with ads needs a story over them: ads of fixed heights side by
  // side can't end level with their neighbours by themselves (22 Oct, page 4)
  for (const [k, s] of sides.entries()) {
    if (!s.ads.length || s.items.length) continue;
    const other = sides[1 - k];
    if (other.items.length >= 2 && rng() < 0.7) s.items.push(other.items.pop()!);
  }
  const parts: Tree[] = [];
  for (const s of sides) {
    const t = grow({ c0: s.c0, c1: s.c1, height: r.height, ads: s.ads, items: s.items }, stories, rng);
    if (!t) return null;
    parts.push(t);
  }
  return join("row", r.c1 - r.c0, parts);
}
