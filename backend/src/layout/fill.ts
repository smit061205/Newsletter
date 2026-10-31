// A filler block (layout/guillotine.ts): a gap -- beside an ad, or where a
// page is short -- that no story of the page fits, filled with real copy where there is any --
//   1. a story held back from the pages, set as a brief to the hole's size,
//      else cut to it (whole sentences off its end);
//   1c. else a held story shortened by the AI to its size, from its release's facts;
//   2. a "જાણવા જેવું" item written by the AI to its size (editorial/features.ts);
//   3. the paper's message panel or house ad (once each in a paper: profile fillers).
import type { Element } from "@ck/shared/contract";
import { writeBrief } from "../editorial/features.ts";
import { aiStalled, newsBrief } from "../editorial/rewrite.ts";
import { wordForWord, type Release, type Store, type Story } from "../store.ts";
import { ONE_COLUMN_HEAD_LINES, type Blocks } from "./blocks.ts";
import { houseAd, messageFiller, type FillerCount } from "./fit.ts";
import { stretchTo } from "./guillotine.ts";
import type { Measurer } from "./measure.ts";
import { buildModule, spanWidth, type Module } from "./module.ts";
import { colX, type PlacedModule } from "./pack.ts";
import { profile } from "../profile.ts";
import { BODY, GAP, HEADLINE, PT } from "./typography.ts";

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
/** The fewest words anything filling a gap has: the paper's shortest story (the
 * editor, 30 Oct: no short stories; an 11-word item had gone in with 32 stories held). */
const ITEM_WORDS = profile.editorial.minWords;
/** Does it end where a sentence ends? (an item never stops in mid-thought) */
const whole = (t: string) => /[.।!?]["'”’)]*\s*$/.test(t);

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
                               smallestHead = Infinity,
                               /** the most stories the page may still take (the front page's limit) */
                               most = Infinity):
  Promise<{ placed: PlacedModule[]; elements: Element[]; left: number } | null> {
  const placed: PlacedModule[] = [];
  const elements: Element[] = [];
  let top = y, left = h;
  for (let n = 0; n < 3 && n < most && left >= 4 * BODY.pitch; n++) {
    const got = await fillOne(page, col, cols, top, left, ctx, [...avoid, ...placed.map((p) => p.module.story.headline)], n, smallestHead);
    if (!got) break;
    if (got.placed) placed.push(got.placed);
    if (got.elements) elements.push(...got.elements);
    const used = got.placed ? got.placed.module.height : got.height ?? left;
    top += used + GAP.betweenStories;
    left = h - (top - y);
  }
  // what's left under the last item is under a line and a half, or nothing went in
  // (`left`: room under the last item another couldn't take)
  return placed.length || elements.length ? { placed, elements, left: Math.max(0, left) } : null;
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
    ctx.log(`  page ${page}: ${s.id} set as a brief in a gap`);
    return { placed: { module: mod, col, x: colX(col), y } };
  }
  // 1b. a held story cut to the hole, whole sentences off its end (real news
  // before anything written: 25 Oct wrote a cooking tip with eight stories held)
  {
    let best: { s: Story; mod: Module } | null = null;
    for (const s of ctx.held.slice(0, 30)) {
      const sentences = s.bodies.long.split(/(?<=[.।!?])\s+/);
      for (let k = sentences.length; k >= 1; k--) {
        const body = sentences.slice(0, k).join(" ");
        if (words(body) < ITEM_WORDS) break;
        if (!whole(body)) continue;
        const mod = await buildModule({ ...s, bodies: { long: body, medium: body, short: body } }, 5, cols, "long", ctx.m, 0, BODY.pitch, HEADLINE.filler);
        if (!Number.isFinite(mod.height) || mod.height > h + 0.5) continue;
        const heads = mod.elements.filter((e) => new RegExp(`^${s.id}-h\\d+$`).test(e.id)).length;
        if ((mod.displayFill >= 0.97 || cols === 1) && heads <= (cols === 1 ? ONE_COLUMN_HEAD_LINES : 4) && mod.headlineHeight <= 0.45 * mod.height && close(mod)
            && (!best || mod.height > best.mod.height)) best = { s, mod };
        break; // (the longest cut that fits: shorter ones fill less)
      }
      if (best && h - best.mod.height < 1.5 * pitch) break;
    }
    if (best && ctx.held.includes(best.s)) {
      ctx.held.splice(ctx.held.indexOf(best.s), 1);
      const mod = await stretchTo(best.mod, h, ctx.m);
      ctx.log(`  page ${page}: ${best.s.id} cut to ${words(best.mod.story.bodies.long)} words for a gap`);
      return { placed: { module: mod, col, x: colX(col), y } };
    }
  }
  // 1c. a held story made a brief by the AI to the gap's size -- a short headline,
  // sub-heading and body, from its release's facts only (26 Oct's copies left
  // six-line gaps white with 35 stories held: every one's headline and
  // sub-heading alone were taller than the gap, and a tip is no news)
  if (!aiStalled() && (h / pitch - 4) * cols * 5 >= ITEM_WORDS * 0.8) {
    const size = { head: cols === 1 ? 3 : cols === 2 ? 5 : 7, deck: cols === 1 ? 4 : cols === 2 ? 7 : 10 };
    for (const s of ctx.held.filter((x) => !wordForWord(x)).slice(0, 8)) {
      const release = (s.releaseId ? ctx.store.release(s.releaseId) : null)
        ?? ({ id: 0, date: s.date, headline: s.headline, subhead: s.deck, body: s.bodies.long } as unknown as Release);
      let target = Math.max(ITEM_WORDS + 10, Math.round((h / pitch - 4) * cols * 5));
      // (written to fill the hole: 30 Oct's first try, cut to the sentence that fitted,
      // was 16 words over a slogan; the next tries' lengths from what it measured)
      let mod: Module | null = null;
      let filled = false;
      for (let attempt = 0; attempt < 3 && !filled; attempt++) {
        const got = await newsBrief(ctx.store, s, release, { ...size, words: target }, { log: ctx.log });
        if (!got) break;
        ctx.cost += got.cost;
        // a hair long: whole sentences off its end
        const sentences = got.story.bodies.long.split(/(?<=[.।!?])\s+/);
        let tried: Module | null = null;
        for (let k = sentences.length; k >= 1; k--) {
          const body = sentences.slice(0, k).join(" ");
          if (words(body) < ITEM_WORDS) break;
          if (!whole(body)) continue;
          tried = await buildModule({ ...got.story, bodies: { long: body, medium: body, short: body } }, 5, cols, "long", ctx.m, 0, BODY.pitch, HEADLINE.filler);
          if (Number.isFinite(tried.height) && tried.height <= h + 0.5) break;
        }
        const heads = tried ? tried.elements.filter((e) => new RegExp(`^${s.id}-h\\d+$`).test(e.id)).length : 0;
        if (tried && tried.height <= h + 0.5 && (tried.displayFill >= 0.97 || cols === 1) && heads <= (cols === 1 ? ONE_COLUMN_HEAD_LINES : 4)
            && tried.headlineHeight <= 0.45 * tried.height && close(tried) && (!mod || tried.height > mod.height)) mod = tried;
        filled = !!mod && h - mod.height < 1.5 * pitch;
        if (filled || !tried || !Number.isFinite(tried.height)) break;
        // the next try's length from what this one measured, short of the hole or over it
        const perLine = words(tried.story.bodies.long) / Math.max(1, tried.bodyLines);
        target = Math.max(ITEM_WORDS, Math.round(words(tried.story.bodies.long) + Math.floor((h - tried.height) / pitch) * cols * perLine * 0.9));
      }
      if (!mod || !ctx.held.includes(s)) continue;
      ctx.held.splice(ctx.held.indexOf(s), 1);
      ctx.log(`  page ${page}: ${s.id} made a ${words(mod.story.bodies.long)}-word brief by the AI for a gap`);
      return { placed: { module: await stretchTo(mod, h, ctx.m), col, x: colX(col), y } };
    }
  }
  // 2. an item written to its size, its length from what a first try measured
  // (never with real news waiting: 30 Oct's was a tip on storing grain, 28 stories held)
  if (!ctx.held.length && (h / pitch - 5) * cols * 5 >= ITEM_WORDS * 0.8) {
    const slot = `${page}-${col}-${cols}-${n}`;
    let target = Math.max(ITEM_WORDS + 10, Math.round((h / pitch - 5) * cols * 5));
    let best: Module | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const got = await writeBrief(ctx.store, ctx.date, `${slot}-${attempt}`, target, [...avoid, ...ctx.written], { log: ctx.log });
      if (!got) break;
      ctx.cost += got.cost;
      // set as a brief; a short headline that can't fill a wider brief's width a size up
      // (never a bigger headline than the page's own stories': it's the least of them)
      const set = async (story: Story) => {
        let mod = await buildModule(story, 5, cols, "long", ctx.m, 0, BODY.pitch, HEADLINE.filler);
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
      const fitsHere = brief.height <= h + 0.5 && (brief.displayFill >= 0.97 || cols === 1) && words(brief.story.bodies.long) >= ITEM_WORDS;
      if (fitsHere && (!best || brief.height > best.height)) best = brief;
      if (best && h - best.height < 1.5 * pitch) break;
      const perLine = words(got.story.bodies.long) / Math.max(1, brief.bodyLines);
      target = Math.max(ITEM_WORDS, Math.round(words(brief.story.bodies.long) + Math.floor((h - brief.height) / pitch) * cols * perLine * 0.9));
    }
    // over a line and a half short, yet too little room for another item:
    // a sentence or two off it, so one fits under it
    for (let k = 0; best && !close(best) && k < 4; k++) {
      const cut = best.story.bodies.long.split(/(?<=[.।!?])\s+/).slice(0, -1).join(" ");
      if (!cut || words(cut) < ITEM_WORDS) break;
      const shorter = await buildModule({ ...best.story, bodies: { long: cut, medium: cut, short: cut } }, best.rank, cols, "long", ctx.m, 0, BODY.pitch, HEADLINE.filler);
      if (!(shorter.displayFill >= 0.97 || cols === 1)) break;
      best = shorter;
    }
    if (best && close(best)) {
      ctx.written.push(best.story.headline);
      const mod = await stretchTo(best, h, ctx.m);
      ctx.log(`  page ${page}: "${best.story.headline}", a ${words(best.story.bodies.long)}-word item written for a gap`);
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
