// The page planned, not guessed (the developer, 1 Nov): stories and ads are
// blocks, and a page is any way of cutting its columns into them. For every group
// of the page's blocks and every width, this works out each height (in whole points)
// the group can be set to, side by side or one over another, from the same settings
// the solver uses (layout/guillotine.ts). So the page's height is either reachable,
// and designs are read back from the table, each one fitting by construction, or
// it isn't, and that is known for certain, with how far off the nearest design is.
//
// An ad is a block of one width and height that stands on the foot of the page or on
// another ad. The lead is at the top. The editor's column (DesignStory.edge) is the
// top of a side two columns wide. Nothing here reads a story's words.
import { type DesignAd, type DesignStory } from "./designs.ts";
import { type Tree } from "./guillotine.ts";
import type { Option } from "./blocks.ts";
import { GAP, PT } from "./typography.ts";

/** How long the table may take to work out (ms): a page with more blocks than usual gives up on it. */
const BUDGET = 8000;
/** Extra gap a stack may put between two blocks (pt), as in the solver. */
const GAP_STRETCH = 3;

const flag = (top: boolean, foot: boolean) => (top ? 2 : 0) + (foot ? 1 : 0);
const bitsOf = (b: bigint): number[] => {
  const out: number[] = [];
  const text = b.toString(2);
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 49 && b) out.push(text.length - 1 - i);
  return out.reverse();
};

export interface Plan {
  /** can the page be filled to its foot at all? */
  fits: boolean;
  /** how many points the nearest reachable height falls short of the foot (0: it fits) */
  short: number;
  /** designs that fill the page */
  trees: Tree[];
  /** the table was given up on: nothing is known */
  gaveUp: boolean;
}

interface Block { ad?: number; lead?: boolean; widths: number[]; heights: (cols: number) => bigint; least: number }

/** The designs of a page: `want` different ones, each filling `height` exactly. */
export function plan(stories: DesignStory[], options: (story: number, cols: number) => Option[], ads: DesignAd[], cols: number,
                     height: number, rng: () => number, want = 300): Plan {
  const H = Math.floor(height / PT);
  const limit = (1n << BigInt(H + 1)) - 1n;
  const gap = Math.round(GAP.betweenStories / PT);
  const items = stories.map((s, i) => ({ s, i })).filter((x) => !x.s.fill);
  const column = items.findIndex((x) => x.s.edge);
  const blocks: Block[] = [
    ...items.map(({ s, i }, k): Block => {
      const cache = new Map<number, bigint>();
      const heights = (c: number) => {
        let b = cache.get(c);
        if (b === undefined) {
          b = 0n;
          for (const o of options(i, c)) {
            const lo = Math.max(0, Math.floor(o.height / PT)), hi = Math.min(H, Math.floor((o.height + o.stretch) / PT));
            if (lo <= hi) b |= ((1n << BigInt(hi - lo + 1)) - 1n) << BigInt(lo);
          }
          cache.set(c, b);
        }
        return b;
      };
      return { lead: k === 0, widths: s.widths, heights, least: Math.min(...s.widths) };
    }),
    ...ads.map((a, k): Block => {
      const w = a.c1 - a.c0, h = Math.floor(a.height / PT);
      return { ad: k, widths: [w], heights: (c) => (c === w && h <= H ? 1n << BigInt(h) : 0n), least: w };
    }),
  ];
  const n = blocks.length;
  const nothing: Plan = { fits: false, short: H, trees: [], gaveUp: false };
  if (!items.length || n > 16) return { ...nothing, gaveUp: n > 16 };
  const adMask = blocks.reduce((m, b, i) => (b.ad !== undefined ? m | (1 << i) : m), 0);
  const columnBit = column >= 0 ? 1 << column : 0;
  const started = Date.now();
  let gaveUp = false;
  const memo = new Map<number, bigint>();
  const lowest = (m: number) => m & -m;
  const widest = (m: number) => { let c = 0; for (let i = 0; i < n; i++) if (m & (1 << i)) c += blocks[i].least; return c; };

  /** The heights the blocks of `m` can make `w` columns wide. */
  function reach(m: number, w: number, top: boolean, foot: boolean): bigint {
    // (ads stand on the foot; more columns than the blocks' own can never be... the table says)
    if ((m & adMask) && !foot) return 0n;
    if ((m & 1) && !top && column !== 0) return 0n; // the lead
    if (!(m & (m - 1))) {
      const i = Math.log2(m);
      return blocks[i].widths.includes(w) ? blocks[i].heights(w) & limit : 0n;
    }
    const key = m * 512 + w * 4 + flag(top, foot);
    const got = memo.get(key);
    if (got !== undefined) return got;
    if (Date.now() - started > BUDGET) { gaveUp = true; return 0n; }
    let out = 0n;
    const first = lowest(m);
    for (let a = (m - 1) & m; a > 0; a = (a - 1) & m) {
      const b = m ^ a;
      // side by side (the mirror image is the same heights): the first block on the left
      if (a & first) {
        for (let c = 1; c < w; c++) {
          const left = reach(a, c, top, foot);
          if (!left) continue;
          const right = reach(b, w - c, top, foot);
          if (right) out |= left & right;
        }
      }
      // one over another: ads under stories; without ads, the first block over the rest
      const adsOnlyBelow = (b & ~adMask) === 0;
      if ((a & adMask) && !(adsOnlyBelow && foot)) continue;
      if (!(m & adMask) && !(a & first)) continue;
      const over = reach(a, w, top, foot && adsOnlyBelow);
      if (!over) continue;
      const under = reach(b, w, false, foot);
      if (!under) continue;
      out |= sum(over, under);
    }
    memo.set(key, out);
    return out;
  }
  const sum = (a: bigint, b: bigint): bigint => {
    let spread = b;
    for (let s = 1; s <= GAP_STRETCH; s++) spread |= b << BigInt(s);
    spread <<= BigInt(gap);
    let out = 0n;
    for (const h of bitsOf(a)) out |= spread << BigInt(h);
    return out & limit;
  };

  const all = (1 << n) - 1;
  // the editor's column: the top of a side two columns wide, whatever else is under it there
  const sides: { side: number; rest: number; atLeft: boolean }[] = [];
  let whole: bigint;
  if (columnBit) {
    whole = 0n;
    const rest = all ^ columnBit;
    for (let t = rest; ; t = (t - 1) & rest) {
      const side = t | columnBit;
      const main = all ^ side;
      if (main) {
        const s = reachSide(side), r = reach(main, cols - 2, true, true);
        if (s && r) { whole |= s & r; sides.push({ side, rest: main, atLeft: true }); }
      }
      if (!t) break;
    }
  } else {
    whole = reach(all, cols, true, true);
  }
  function reachSide(side: number): bigint {
    const c = blocks[column].heights(2) & limit;
    const below = side ^ columnBit;
    if (!below) return c;
    const under = reach(below, 2, false, true);
    return under ? sum(c, under) : 0n;
  }
  if (gaveUp) return { ...nothing, gaveUp: true };
  const target = 1n << BigInt(H);
  if (!(whole & target)) {
    const reachable = bitsOf(whole);
    return { fits: false, short: reachable.length ? H - reachable[reachable.length - 1] : H, trees: [], gaveUp: false };
  }

  // the designs, read back from the table: at each cut, any way that keeps the height reachable
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const leaf = (i: number, w: number): Tree => {
    const b = blocks[i];
    return b.ad !== undefined ? { kind: "ad", ad: b.ad, cols: w } : { kind: "story", story: items[i].i, cols: w };
  };
  const row = (w: number, parts: Tree[]): Tree => ({ kind: "row", cols: w, children: parts.flatMap((p) => (p.kind === "row" ? p.children : [p])) });
  const stack = (w: number, parts: Tree[]): Tree => ({ kind: "stack", cols: w, children: parts.flatMap((p) => (p.kind === "stack" ? p.children : [p])) });
  const has = (b: bigint, h: number) => h >= 0 && h <= H && ((b >> BigInt(h)) & 1n) === 1n;
  const split = (over: bigint, under: bigint, h: number): number[] => {
    const out: number[] = [];
    for (const a of bitsOf(over)) for (let s = 0; s <= GAP_STRETCH; s++) if (has(under, h - a - gap - s)) { out.push(a); break; }
    return out;
  };
  const gapFor = (under: bigint, h: number, a: number) => { for (let s = 0; s <= GAP_STRETCH; s++) if (has(under, h - a - gap - s)) return h - a - gap - s; return -1; };

  // (the ways of cutting a group at a height, worked out once: designs share most of them)
  const cuts = new Map<string, (() => Tree | null)[]>();
  function read(m: number, w: number, top: boolean, foot: boolean, h: number): Tree | null {
    if (!(m & (m - 1))) return leaf(Math.log2(m), w);
    const key = `${m}:${w}:${flag(top, foot)}:${h}`;
    let ways = cuts.get(key);
    if (!ways) { ways = waysOf(m, w, top, foot, h); cuts.set(key, ways); }
    return ways.length ? pick(ways)() : null;
  }
  function waysOf(m: number, w: number, top: boolean, foot: boolean, h: number): (() => Tree | null)[] {
    const ways: (() => Tree | null)[] = [];
    const first = lowest(m);
    for (let a = (m - 1) & m; a > 0; a = (a - 1) & m) {
      const b = m ^ a;
      if (a & first) {
        for (let c = 1; c < w; c++) {
          const l = reach(a, c, top, foot), r = reach(b, w - c, top, foot);
          if (!has(l, h) || !has(r, h)) continue;
          ways.push(() => {
            const x = read(a, c, top, foot, h), y = read(b, w - c, top, foot, h);
            if (!x || !y) return null;
            // (the part with the lead stays on the left: the lead opens the page at its top left)
            return row(w, m & 1 || rng() < 0.5 ? [x, y] : [y, x]);
          });
        }
      }
      const adsOnlyBelow = (b & ~adMask) === 0;
      if ((a & adMask) && !(adsOnlyBelow && foot)) continue;
      if (!(m & adMask) && !(a & first)) continue;
      const over = reach(a, w, top, foot && adsOnlyBelow);
      const under = reach(b, w, false, foot);
      if (!over || !under) continue;
      const tops = split(over, under, h);
      if (!tops.length) continue;
      ways.push(() => {
        const t = pick(tops), u = gapFor(under, h, t);
        const x = read(a, w, top, foot && adsOnlyBelow, t), y = read(b, w, false, foot, u);
        return x && y ? stack(w, [x, y]) : null;
      });
    }
    return ways;
  }
  function readAll(): Tree | null {
    if (!columnBit) return read(all, cols, true, true, H);
    const ok = sides.filter((x) => has(reachSide(x.side), H) && has(reach(x.rest, cols - 2, true, true), H));
    if (!ok.length) return null;
    const x = pick(ok);
    const below = x.side ^ columnBit;
    let side: Tree | null;
    if (!below) side = leaf(column, 2);
    else {
      const c = blocks[column].heights(2) & limit, under = reach(below, 2, false, true);
      const t = pick(split(c, under, H));
      const y = read(below, 2, false, true, gapFor(under, H, t));
      side = y ? stack(2, [leaf(column, 2), y]) : null;
    }
    const main = read(x.rest, cols - 2, true, true, H);
    if (!side || !main) return null;
    return row(cols, x.rest & 1 || rng() < 0.5 ? [main, side] : [side, main]);
  }
  const out = new Map<string, Tree>();
  for (let n2 = 0; n2 < want * 8 && out.size < want; n2++) {
    const t = readAll();
    if (t) out.set(JSON.stringify(t), t);
  }
  return { fits: true, short: 0, trees: [...out.values()], gaveUp: false };
}
