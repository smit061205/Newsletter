// A filler block (layout/guillotine.ts): a hole beside an ad that no story
// of the page fits, filled with real copy where there is any --
//   1. a story held back from the pages, set as a brief to the hole's size,
//      else cut to it (whole sentences off its end);
//   2. a "જાણવા જેવું" item written by the AI to its size (editorial/features.ts);
//   3. the paper's message panel or house ad (once each in a paper: profile fillers).
import type { Element } from "@ck/shared/contract";
import { writeBrief } from "../editorial/features.ts";
import type { Store, Story } from "../store.ts";
import type { Blocks } from "./blocks.ts";
import { houseAd, messageFiller, type FillerCount } from "./fit.ts";
import { stretchTo } from "./guillotine.ts";
import type { Measurer } from "./measure.ts";
import { buildModule, spanWidth, type Module } from "./module.ts";
import { colX, type PlacedModule } from "./pack.ts";
import { profile } from "../profile.ts";
import { BODY, GAP, PT } from "./typography.ts";

export interface FillContext {
  store: Store; date: string; m: Measurer; blocks: Blocks;
  /** stories held back from the pages (taken from as they're used) */
  held: Story[];
  fillers: FillerCount;
  /** the items written so far in the paper (each topic once) */
  written: string[];
  /** pages fill their holes one at a time (so each sees the others' items) */
  turn: Promise<unknown>;
  cost: number;
  log: (s: string) => void;
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Copy for a hole `cols` wide and `h` tall at (col, y): briefs (one, or one
 * under another where one alone leaves room), or a panel. Null if nothing fits. */
/** fillHole() in its turn after the other pages' (see FillContext.turn). */
export function fillInTurn(...args: Parameters<typeof fillHole>): ReturnType<typeof fillHole> {
  const ctx = args[5];
  const run = ctx.turn.then(() => fillHole(...args), () => fillHole(...args));
  ctx.turn = run.catch(() => {});
  return run;
}

export async function fillHole(page: number, col: number, cols: number, y: number, h: number, ctx: FillContext, avoid: string[],
                               smallestHead = Infinity):
  Promise<{ placed: PlacedModule[]; elements: Element[] } | null> {
  const placed: PlacedModule[] = [];
  const elements: Element[] = [];
  let top = y, left = h;
  for (let n = 0; n < 3 && left >= 4 * BODY.pitch; n++) {
    const got = await fillOne(page, col, cols, top, left, ctx, [...avoid, ...placed.map((p) => p.module.story.headline)], n, smallestHead);
    if (!got) break;
    if (got.placed) placed.push(got.placed);
    if (got.elements) elements.push(...got.elements);
    const used = got.placed ? got.placed.module.height : got.height ?? left;
    top += used + GAP.betweenStories;
    left = h - (top - y);
  }
  // what's left under the last item is under a line and a half, or nothing went in
  return placed.length || elements.length ? { placed, elements } : null;
}

async function fillOne(page: number, col: number, cols: number, y: number, h: number, ctx: FillContext, avoid: string[], n: number,
                       smallestHead: number):
  Promise<{ placed?: PlacedModule; elements?: Element[]; height?: number } | null> {
  const pitch = BODY.pitch;
  // fills the hole to its foot, or leaves room for another item under it
  const close = (mod: Module) => mod.height <= h + 0.5 && (h - mod.height < 1.5 * pitch || h - mod.height >= 4 * pitch + GAP.betweenStories);
  // 1. a held story as a brief
  for (const s of [...ctx.held]) {
    const opts = await ctx.blocks.options(s, 5, cols);
    const fit = opts.filter((o) => o.height <= h + 0.5 && o.height + o.stretch >= h - 1.5 * pitch).sort((a, b) => b.height - a.height)[0];
    if (!fit || !ctx.held.includes(s)) continue;
    ctx.held.splice(ctx.held.indexOf(s), 1);
    const mod = await stretchTo(fit.module, h, ctx.m);
    ctx.log(`  page ${page}: ${s.id} set as a brief by an ad`);
    return { placed: { module: mod, col, x: colX(col), y } };
  }
  // 1b. a held story cut to the hole, whole sentences off its end (real news
  // before anything written: 25 Oct wrote a cooking tip with eight stories held)
  {
    let best: { s: Story; mod: Module } | null = null;
    for (const s of ctx.held.slice(0, 12)) {
      const sentences = s.bodies.long.split(/(?<=[.।!?])\s+/);
      for (let k = sentences.length; k >= 2; k--) {
        const body = sentences.slice(0, k).join(" ");
        if (words(body) < 15) break;
        const mod = await buildModule({ ...s, bodies: { long: body, medium: body, short: body } }, 5, cols, "long", ctx.m, 0);
        if (!Number.isFinite(mod.height) || mod.height > h + 0.5) continue;
        const heads = mod.elements.filter((e) => new RegExp(`^${s.id}-h\\d+$`).test(e.id)).length;
        if ((mod.displayFill >= 0.97 || cols === 1) && heads <= 4 && mod.headlineHeight <= 0.45 * mod.height && close(mod)
            && (!best || mod.height > best.mod.height)) best = { s, mod };
        break; // (the longest cut that fits: shorter ones fill less)
      }
      if (best && h - best.mod.height < 1.5 * pitch) break;
    }
    if (best && ctx.held.includes(best.s)) {
      ctx.held.splice(ctx.held.indexOf(best.s), 1);
      const mod = await stretchTo(best.mod, h, ctx.m);
      ctx.log(`  page ${page}: ${best.s.id} cut to ${words(best.mod.story.bodies.long)} words for a hole by an ad`);
      return { placed: { module: mod, col, x: colX(col), y } };
    }
  }
  // 2. an item written to its size, its length from what a first try measured
  if (h >= (cols >= 3 ? 4 : 6) * pitch) {
    const slot = `${page}-${col}-${cols}-${n}`;
    let target = Math.max(12, Math.round((h / pitch - 5) * cols * 5));
    let best: Module | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const got = await writeBrief(ctx.store, ctx.date, `${slot}-${attempt}`, target, [...avoid, ...ctx.written], { log: ctx.log });
      if (!got) break;
      ctx.cost += got.cost;
      // set as a brief; a short headline that can't fill a wider brief's width a size up
      // (never a bigger headline than the page's own stories': it's the least of them)
      const set = async (story: Story) => {
        let mod = await buildModule(story, 5, cols, "long", ctx.m, 0);
        for (const rank of [4, 3]) {
          if (mod.displayFill >= 0.97 || cols === 1) break;
          const up = await buildModule(story, rank, cols, "long", ctx.m, 0);
          if (up.headSize > smallestHead) break;
          mod = up;
        }
        return mod;
      };
      let brief = await set(got.story);
      // too long: whole sentences off the end until it fits
      const sentences = got.story.bodies.long.split(/(?<=[.।!?])\s+/);
      for (let k = sentences.length - 1; brief.height > h && k >= 1; k--) {
        const body = sentences.slice(0, k).join(" ");
        brief = await set({ ...got.story, bodies: { long: body, medium: body, short: body } });
      }
      const fitsHere = brief.height <= h + 0.5 && (brief.displayFill >= 0.97 || cols === 1);
      if (fitsHere && (!best || brief.height > best.height)) best = brief;
      if (best && h - best.height < 1.5 * pitch) break;
      const perLine = words(got.story.bodies.long) / Math.max(1, brief.bodyLines);
      target = Math.max(8, Math.round(words(brief.story.bodies.long) + Math.floor((h - brief.height) / pitch) * cols * perLine * 0.9));
    }
    // over a line and a half short, yet too little room for another item:
    // a sentence or two off it, so one fits under it
    for (let k = 0; best && !close(best) && k < 4; k++) {
      const cut = best.story.bodies.long.split(/(?<=[.।!?])\s+/).slice(0, -1).join(" ");
      if (!cut || words(cut) < 8) break;
      const shorter = await buildModule({ ...best.story, bodies: { long: cut, medium: cut, short: cut } }, best.rank, cols, "long", ctx.m, 0);
      if (!(shorter.displayFill >= 0.97 || cols === 1)) break;
      best = shorter;
    }
    if (best && close(best)) {
      ctx.written.push(best.story.headline);
      const mod = await stretchTo(best, h, ctx.m);
      ctx.log(`  page ${page}: "${best.story.headline}", a ${words(best.story.bodies.long)}-word item written for a hole by an ad`);
      return { placed: { module: mod, col, x: colX(col), y } };
    }
  }
  // 3. the paper's own panels, once each in a paper
  const id = `filler-${page}-${col}`;
  const w = spanWidth(cols);
  if (cols >= 3 && h <= 0.6 * w && ctx.fillers.houseAds < profile.fillers.maxHouseAds) {
    const ad = await houseAd(id, colX(col), y, w, h, ctx.m);
    if (ad) {
      ctx.fillers.houseAds++;
      return { elements: ad, height: h };
    }
  }
  // (one size: what's under it is the next item's, fillHole)
  const msg = await messageFiller(id, colX(col), y, w, h, page * 3, ctx.m, ctx.fillers);
  if (msg) return { elements: msg.elements, height: msg.height };
  return null;
}
