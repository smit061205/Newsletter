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
  /** it stands at the page's edge, at the top: the editor's column */
  edge?: boolean;
  /** the widths it may take */
  widths: number[];
  /** its area at its middle length (px²), a width's own */
  area: (cols: number) => number;
}

/** An ad in its columns [c0, c1), its top `y` from the top of the story area: at their
 * foot, or wherever the editor put it (layout/engine.ts). */
export interface DesignAd { index: number; c0: number; c1: number; y: number; height: number }

/** This drawing leaves no gap: no story is left without an ad's column to stand over, and the reverse. */
let storiesOnly = false;

/** A part of the page: its columns, its top (from the story area's) and height, its ads and stories. */
interface Region { c0: number; c1: number; top: number; height: number; ads: DesignAd[]; items: number[] }

/** Up to `count` different designs for a page of `cols` columns `height` tall. */
export function designs(stories: DesignStory[], ads: DesignAd[], cols: number, height: number, rng: () => number,
                        count = 300, attempts = 6000, gaps = true): Tree[] {
  const out = new Map<string, Tree>();
  const items = stories.map((_, i) => i);
  storiesOnly = !gaps;
  for (let n = 0; n < attempts && out.size < count; n++) {
    const edge = stories.some((s) => s.edge);
    const t = ((edge ? n % 4 !== 3 : !gaps && n % 2 === 0) ? footRow(stories, ads, cols, height, rng) ?? well(stories, ads, cols, height, rng) : null) ?? grow({ c0: 0, c1: cols, top: 0, height, ads, items }, stories, rng);
    if (t && fills(t) <= (gaps ? 2 : 0)) out.set(key(t), t);
  }
  return [...out.values()];
}

const key = (t: Tree): string => (t.kind === "story" ? `s${t.story}:${t.cols}` : t.kind === "ad" ? `a${t.ad}` : t.kind === "fill" ? `f${t.cols}`
  : t.kind === "fix" ? `x${Math.round(t.height)}(${key(t.child)})` : `${t.kind}(${t.children.map(key).join(",")})`);
const fills = (t: Tree): number => (t.kind === "fill" ? 1 : t.kind === "fix" ? fills(t.child)
  : t.kind === "stack" || t.kind === "row" ? t.children.reduce((a, c) => a + fills(c), 0) : 0);

/** The page the way a desk lays out ads of different heights: a row along the
 * foot, a story standing on each ad and in each stretch of free columns, the rest
 * of the page over the row. (Grown at random, the room over a short ad was a strip
 * only a filler could take: 30 Oct's page 4, its one-column ad beside two tall ones.) */
function footRow(stories: DesignStory[], ads: DesignAd[], cols: number, height: number, rng: () => number): Tree | null {
  const column = stories.findIndex((s) => s.edge);
  if ((!ads.length && column < 0) || ads.some((a) => a.y + a.height < height - 1)) return null;
  const sorted = [...ads].sort((a, b) => a.c0 - b.c0);
  if (sorted.some((a, i) => i > 0 && a.c0 < sorted[i - 1].c1)) return null; // (stacked)
  const parts: { c0: number; c1: number; ad?: DesignAd }[] = [];
  let at = 0;
  for (const a of sorted) {
    if (a.c0 > at) parts.push({ c0: at, c1: a.c0 });
    parts.push({ c0: a.c0, c1: a.c1, ad: a });
    at = a.c1;
  }
  if (ads.length && at < cols) parts.push({ c0: at, c1: cols });
  // the row's stories: never the page's first, each at a width it may take
  const free = stories.map((_, i) => i).slice(1).filter((i) => !stories[i].fill && !stories[i].edge);
  const row: { part: (typeof parts)[number]; story: number }[] = [];
  for (const part of [...parts].sort((a, b) => a.c1 - a.c0 - (b.c1 - b.c0))) {
    const able = free.filter((i) => stories[i].widths.includes(part.c1 - part.c0));
    if (!able.length) return null;
    const story = able[Math.floor(rng() * able.length)];
    free.splice(free.indexOf(story), 1);
    row.push({ part, story });
  }
  const rest = stories.map((_, i) => i).filter((i) => !stories[i].fill && !row.some((r) => r.story === i));
  if (!rest.length) return null;
  const tall = (r: (typeof row)[number]) => {
    const k = r.part.c1 - r.part.c0;
    return stories[r.story].area(k) / spanOf(k) + (r.part.ad ? r.part.ad.height + GAP.betweenStories : 0);
  };
  const rowHeight = row.length ? Math.max(...row.map(tall)) : -GAP.betweenStories;
  const topHeight = height - rowHeight - GAP.betweenStories;
  if (topHeight < 60) return null;
  const top = column >= 0 ? besideColumn(stories, column, rest, cols, topHeight, rng)
    : grow({ c0: 0, c1: cols, top: 0, height: topHeight, ads: [], items: rest }, stories, rng);
  if (!top) return null;
  if (!row.length) return top;
  const blocks = row.sort((a, b) => a.part.c0 - b.part.c0).map(({ part, story }) => {
    const k = part.c1 - part.c0;
    const leaf: Tree = { kind: "story", story, cols: k };
    return part.ad ? join("stack", k, [leaf, { kind: "ad", ad: part.ad.index, cols: k }]) : leaf;
  });
  return join("stack", cols, [top, join("row", cols, blocks)]);
}

/** A narrow ad stacked on a wide one at the page's side, the staircase a film poster
 * on a yatra ad makes (31 Oct's page 4: no design of stories alone, so a one-column
 * hole went white). As a desk lays it out: stories down the free columns, and over
 * the wide ad a story standing on the narrow ad, one beside it down to the wide ad,
 * and at times one across both. The editor's column stands on a two-column ad. */
function well(stories: DesignStory[], ads: DesignAd[], cols: number, height: number, rng: () => number): Tree | null {
  if (ads.length !== 2) return null;
  const [wide, narrow] = [...ads].sort((a, b) => b.c1 - b.c0 - (a.c1 - a.c0));
  const right = wide.c1 === cols && narrow.c1 === cols;
  if ((!right && !(wide.c0 === 0 && narrow.c0 === 0)) || wide.y + wide.height < height - 1 || narrow.y + narrow.height > wide.y + 1) return null;
  const k = wide.c1 - wide.c0, n = narrow.c1 - narrow.c0, side = cols - k, mid = k - n;
  if (side < 1 || mid < 1) return null;
  const items = stories.map((_, i) => i).filter((i) => !stories[i].fill);
  const column = items.find((i) => stories[i].edge);
  if (column !== undefined && n !== 2) return null;
  const free = items.filter((i) => i !== column);
  for (let i = free.length - 1; i > 1; i--) { // (the page's first story stays first)
    const j = 1 + Math.floor(rng() * i);
    [free[i], free[j]] = [free[j], free[i]];
  }
  const take = (w: number): number | null => {
    const at = free.findIndex((i) => stories[i].widths.includes(w));
    return at < 0 ? null : free.splice(at, 1)[0];
  };
  const on = column ?? take(n);
  const down = take(side);
  const beside = take(mid);
  if (on == null || down == null || beside == null) return null;
  const across = free.length && rng() < 0.5 ? take(k) : null;
  const left: number[] = [down];
  while (free.length) {
    const i = take(side);
    if (i == null) return null;
    left.push(i);
  }
  const leaf = (story: number, w: number): Tree => ({ kind: "story", story, cols: w });
  const standing = join("stack", n, [leaf(on, n), { kind: "ad", ad: narrow.index, cols: n }]);
  const over = join("row", k, right ? [leaf(beside, mid), standing] : [standing, leaf(beside, mid)]);
  const tower = join("stack", k, [...(across != null ? [leaf(across, k)] : []), over, { kind: "ad", ad: wide.index, cols: k }]);
  const running = left.length > 1 ? join("stack", side, left.map((i) => leaf(i, side))) : leaf(down, side);
  return join("row", cols, right ? [running, tower] : [tower, running]);
}

/** The top of a page with the editor's column: the column at the left or right
 * edge, in its two columns (another story of that width under it, at times), the
 * other stories beside it. */
function besideColumn(stories: DesignStory[], column: number, items: number[], cols: number, height: number, rng: () => number): Tree | null {
  const k = stories[column].widths[0];
  const rest = items.filter((i) => i !== column);
  if (!rest.length) return null;
  const under = rest.length > 2 && rng() < 0.5 ? rest.filter((i, n) => n > 0 && stories[i].widths.includes(k)) : [];
  const also = under.length ? under[Math.floor(rng() * under.length)] : -1;
  const leaf: Tree = { kind: "story", story: column, cols: k };
  const side = also >= 0 ? join("stack", k, [leaf, { kind: "story", story: also, cols: k }]) : leaf;
  const left = rng() < 0.6;
  const main = grow({ c0: left ? k : 0, c1: left ? cols : cols - k, top: 0, height, ads: [], items: rest.filter((i) => i !== also) }, stories, rng);
  return main ? join("row", cols, left ? [side, main] : [main, side]) : null;
}

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
      // an ad put part-way down (the editor's place): the stories over it fill the room
      // down to it exactly (a fixed block), the rest go under it
      const under = r.top + r.height - (f.y + f.height);
      if (under >= 30) return around(r, f, rest, leaf, stories, rng);
      // an ad with nothing over it: the ad alone (it must end level by itself), or a filler over it
      if (!r.items.length && !rest.length) return storiesOnly || rng() < 0.5 ? leaf : join("stack", cols, [{ kind: "fill", cols }, leaf]);
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
    // (not a side narrower than any story may be, unless an ad fills it: a strip
    // no story can take is a filler the whole page down)
    const narrowest = Math.min(...r.items.map((i) => Math.min(...stories[i].widths)));
    const fits = (c0: number, c1: number) => c1 - c0 >= narrowest || r.ads.some((a) => a.c0 === c0 && a.c1 === c1);
    const all: number[] = [];
    for (let c = r.c0 + 1; c < r.c1; c++) if (!r.ads.some((a) => a.c0 < c && c < a.c1)) all.push(c);
    const sound = all.filter((c) => fits(r.c0, c) && fits(c, r.c1));
    const cuts = sound.length ? sound : all;
    const first = stories[r.items[0]].widths;
    const good = cuts.filter((c) => first.includes(c - r.c0) || first.includes(r.c1 - c));
    // (stories across the top only over ads at the foot: one the editor put higher
    // up stays where it is, the region cut down beside it)
    const atFoot = r.ads.every((a) => a.y + a.height >= r.top + r.height - 1);
    if (!atFoot && rng() < 0.5) {
      // or cut straight across at the top or the foot of an ad put higher up: the
      // stories over the cut set exactly to the room down to it
      const lines = r.ads.filter((a) => a.y + a.height < r.top + r.height - 1)
        .flatMap((a) => [a.y, a.y + a.height + GAP.betweenStories])
        .filter((y) => y - GAP.betweenStories - r.top >= 30 && r.top + r.height - y >= 30
          && !r.ads.some((a) => a.y < y - 1 && a.y + a.height > y - GAP.betweenStories + 1));
      if (lines.length) return cutAcross(r, lines[Math.floor(rng() * lines.length)], stories, rng);
    }
    if (atFoot && r.items.length >= 2 && (!good.length || rng() < 0.4)) return stackTop(r, stories, rng);
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
  const a = grow({ c0: r.c0, c1: r.c1, top: r.top, height: topHeight, ads: [], items: top }, stories, rng);
  if (!a) return null;
  const b = grow({ ...r, top: r.top + topHeight + GAP.betweenStories, height: rest, items: r.items.slice(k) }, stories, rng);
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
  // (a story that can take the side's width, when a gap isn't to be left: over a
  // one-column ad, a long story down one column, 30 Oct's page 4)
  for (const [k, s] of sides.entries()) {
    if (!s.ads.length || s.items.length) continue;
    const other = sides[1 - k];
    if (other.items.length < 2 || (!storiesOnly && rng() >= 0.7)) continue;
    const narrow = s.c1 - s.c0;
    const able = storiesOnly ? other.items.filter((i) => stories[i].widths.includes(narrow) || s.ads.every((a) => a.c1 - a.c0 < narrow)) : [];
    const i = able.length ? able[Math.floor(rng() * able.length)] : other.items[other.items.length - 1];
    other.items.splice(other.items.indexOf(i), 1);
    s.items.push(i);
  }
  const parts: Tree[] = [];
  for (const s of sides) {
    const t = grow({ c0: s.c0, c1: s.c1, top: r.top, height: r.height, ads: s.ads, items: s.items }, stories, rng);
    if (!t) return null;
    parts.push(t);
  }
  return join("row", r.c1 - r.c0, parts);
}

/** A region round an ad the editor put part-way down it (the ad across the
 * region): stories over it, set exactly to the room down to it; the ad; the
 * rest under it. The stories go over it in their order while there's room
 * (a little give either way, so designs differ), the others under it. */
function around(r: Region, f: DesignAd, rest: DesignAd[], leaf: Tree, stories: DesignStory[], rng: () => number): Tree | null {
  const cols = r.c1 - r.c0;
  const overH = f.y - r.top - GAP.betweenStories;
  const top = f.y + f.height + GAP.betweenStories;
  const underH = r.top + r.height - top;
  const adsOver = rest.filter((a) => a.y + a.height <= f.y + 1);
  const adsUnder = rest.filter((a) => a.y >= f.y + f.height - 1);
  const items = { over: [] as number[], under: [] as number[] };
  if (overH >= 30) {
    const room = overH * spanOf(cols) - adsOver.reduce((t, a) => t + spanOf(a.c1 - a.c0) * (a.height + GAP.betweenStories), 0);
    let used = 0;
    for (const i of r.items) {
      const area = stories[i].area(Math.min(cols, Math.max(...stories[i].widths)));
      if (!items.under.length && used + area / 2 < room * (0.85 + 0.3 * rng())) { items.over.push(i); used += area; }
      else items.under.push(i);
    }
  } else items.under.push(...r.items);
  const parts: Tree[] = [];
  if (overH >= 30) {
    const over = grow({ c0: r.c0, c1: r.c1, top: r.top, height: overH, ads: adsOver, items: items.over }, stories, rng);
    if (!over) return null;
    parts.push({ kind: "fix", cols, height: overH, child: over });
  }
  parts.push(leaf);
  const under = grow({ c0: r.c0, c1: r.c1, top, height: underH, ads: adsUnder, items: items.under }, stories, rng);
  if (!under) return null;
  parts.push(under);
  return join("stack", cols, parts);
}

/** A region cut straight across at `y` (no ad crossing it): the part over the
 * cut set exactly to its room (its stories, in their order, while there's
 * room, a little give either way), the rest under it. */
function cutAcross(r: Region, y: number, stories: DesignStory[], rng: () => number): Tree | null {
  const cols = r.c1 - r.c0;
  const overH = y - GAP.betweenStories - r.top;
  const adsOver = r.ads.filter((a) => a.y + a.height <= y - GAP.betweenStories + 1);
  const adsUnder = r.ads.filter((a) => a.y >= y - 1);
  const room = overH * spanOf(cols) - adsOver.reduce((t, a) => t + spanOf(a.c1 - a.c0) * (a.height + GAP.betweenStories), 0);
  const over: number[] = [], under: number[] = [];
  let used = 0;
  for (const i of r.items) {
    const area = stories[i].area(Math.min(cols, Math.max(...stories[i].widths)));
    if (!under.length && used + area / 2 < room * (0.85 + 0.3 * rng())) { over.push(i); used += area; }
    else under.push(i);
  }
  const a = grow({ c0: r.c0, c1: r.c1, top: r.top, height: overH, ads: adsOver, items: over }, stories, rng);
  if (!a) return null;
  const b = grow({ c0: r.c0, c1: r.c1, top: y, height: r.top + r.height - y, ads: adsUnder, items: under }, stories, rng);
  return b ? join("stack", cols, [{ kind: "fix", cols, height: overH, child: a }, b]) : null;
}
