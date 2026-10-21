// Closes the gaps the packer leaves: after a page is packed, every story
// with space under it (before the next story, an ad or the page foot) is
// grown to fill it, the way a desk fits copy:
//   a. the next longer version of the story (short -> medium -> long);
//   b. the AI rewrites the body to the exact length the gap needs, from the
//      release's own facts (editorial/rewrite.ts fitLength), at most 2 rounds;
//   c. the body's line pitch, within 2% of the paper's;
// and what still can't be filled gets real content, never an empty box:
//   d. a left-out story set as a brief, or
//   e. the paper's own house ad (profile.fillers).
// Every change is re-measured, so every story still fits exactly.
import type { Element, TextElement } from "@ck/shared/contract";
import { fitLength } from "../editorial/rewrite.ts";
import { setDisplay } from "./display.ts";
import { profile } from "../profile.ts";
import type { Ad, Release, Store, Story } from "../store.ts";
import { stackLines } from "./compose.ts";
import type { Measurer } from "./measure.ts";
import { buildModule, spanWidth, type Module, type Variant } from "./module.ts";
import { colX, renderPlaced, type Band, type PagePlan, type PlacedModule } from "./pack.ts";
import { findGaps, type Gap } from "./occupancy.ts";
import { BODY, DECK, GAP, GRID, HEADLINE, INK, PT } from "./typography.ts";

/** Side-by-side column gaps that start and end about level, as areas. */
function mergeGaps(gaps: Gap[]): { col: number; cols: number; y0: number; y1: number }[] {
  const out: { col: number; cols: number; y0: number; y1: number }[] = [];
  for (const g of [...gaps].sort((a, b) => a.col - b.col || a.y0 - b.y0)) {
    const last = out.find((o) => o.col + o.cols === g.col && Math.abs(o.y0 - g.y0) < BODY.pitch && Math.abs(o.y1 - g.y1) < 2 * BODY.pitch);
    if (last) {
      last.cols++;
      last.y0 = Math.max(last.y0, g.y0);
      last.y1 = Math.min(last.y1, g.y1);
    } else out.push({ col: g.col, cols: 1, y0: g.y0, y1: g.y1 });
  }
  // the widest first: a story needs the room more than a brief
  return out.sort((a, b) => b.cols * (b.y1 - b.y0) - a.cols * (a.y1 - a.y0));
}

export interface FitResult {
  plan: PagePlan;
  elements: Element[];
  cost: number;
  log: string[];
  /** stories used as briefs in gaps */
  used: Story[];
  factChecks: { story: string; detail: string }[];
}

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** The body without its last sentence (a whole paragraph goes if it's one sentence). */
function dropLastSentence(body: string): string | null {
  const paras = body.split(/\n\s*\n/);
  const last = paras[paras.length - 1].trim();
  const sentences = last.match(/[^.!?।]+[.!?।]+["'”’)]*\s*|[^.!?।]+$/g) ?? [last];
  if (sentences.length > 1) paras[paras.length - 1] = sentences.slice(0, -1).join("").trim();
  else if (paras.length > 1) paras.pop();
  else return null;
  return paras.join("\n\n");
}
const NEXT: Record<Variant, Variant | null> = { short: "medium", medium: "long", long: null };

/** Space under each placed story: from its foot to the next element below in
 * any of its columns (less the gap between stories), or the band's foot. */
function room(p: PlacedModule, placed: PlacedModule[], ads: Ad[], band: Band, extraBlocks: { x0: number; x1: number; y0: number }[]): number {
  const gap = GAP.betweenStories;
  let limit = band.bottom;
  for (let c = p.col; c < p.col + p.module.cols; c++) {
    const x0 = colX(c), x1 = x0 + GRID.column;
    for (const q of placed) {
      if (q === p || q.y <= p.y) continue;
      if (Math.min(x1, q.x + q.module.width) - Math.max(x0, q.x) > 20) limit = Math.min(limit, q.y - gap);
    }
    for (const a of ads) {
      if (a.y + a.height <= p.y || Math.min(x1, a.x + a.width) - Math.max(x0, a.x) <= 20) continue;
      limit = Math.min(limit, a.y - gap);
    }
    for (const b of extraBlocks) if (b.y0 > p.y && Math.min(x1, b.x1) - Math.max(x0, b.x0) > 20) limit = Math.min(limit, b.y0 - gap);
  }
  return limit - p.y;
}

/** The paper's house ad, set to fill a box: a ruled panel, lines centred. */
async function houseAd(id: string, x: number, y: number, w: number, h: number, m: Measurer): Promise<Element[] | null> {
  const lines = profile.fillers.houseAd;
  if (!lines.length || h < 60 * PT || w < GRID.column) return null;
  const fontOf = (r: string) => (r === "headline" ? HEADLINE.font : r === "deck" ? DECK.font : BODY.font);
  const pad = 6 * PT;
  const inner = w - 2 * pad;
  // the largest size at which every line fits the width and all fit the height
  for (let top = Math.min(48 * PT, h / 3); top >= 10 * PT; top -= PT) {
    const sets: { lines: Awaited<ReturnType<Measurer["breakLines"]>>[0]; size: number; font: string }[] = [];
    let ok = true;
    for (const l of lines) {
      const size = Math.max(8 * PT, top * l.scale);
      const [ls] = await m.breakLines([{ paras: [l.text], width: inner, font: fontOf(l.role), size, safety: 0.97 }]);
      if (ls.length > 1 || ls[0].width > inner) { ok = false; break; }
      sets.push({ lines: ls, size, font: fontOf(l.role) });
    }
    if (!ok) continue;
    const pitchOf = (s: { size: number }) => s.size * 1.35;
    const total = sets.reduce((a, s) => a + pitchOf(s), 0);
    if (total > h - 2 * pad) continue;
    const out: Element[] = [{ id: `${id}-box`, kind: "rect", x, y, width: w, height: h, stroke: INK, strokeWidth: 1.2 * PT }];
    let cy = y + (h - total) / 2;
    for (const [i, s] of sets.entries()) {
      const st = await stackLines(m, s.lines, `${id}-l${i}`, id, x + pad, cy, inner, s.font, s.size, pitchOf(s));
      out.push(...st.elements.map((e) => ({ ...e, align: "center" as const, articleId: id } as TextElement)));
      cy += pitchOf(s);
    }
    return out;
  }
  return null;
}

/** A public-service message (profile fillers.messages), set as large as the
 * box allows in fitted display type, centred in a ruled panel -- the way the
 * paper prints "રક્તદાન મહાદાન ચક્ષુદાન શ્રેષ્ઠદાન". The `n`th message first,
 * so a page's fillers differ. Returns the elements and the height used. */
async function messageFiller(id: string, x: number, y: number, w: number, h: number, n: number, m: Measurer):
  Promise<{ elements: Element[]; height: number } | null> {
  const messages = profile.fillers.messages;
  if (!messages.length || h < 50 * PT || w < GRID.column) return null;
  const pad = 8 * PT;
  const inner = w - 2 * pad;
  // a panel no taller than its width allows to look like one: a deeper hole takes more than one
  let boxH = Math.min(h, Math.max(1.6 * w, 120 * PT));
  if (h - boxH < 70 * PT) boxH = h; // what would be left is too thin for another: take it all
  let best: { text: string; size: number; lines: number; height: number } | null = null;
  for (let k = 0; k < messages.length; k++) {
    const text = messages[(n + k) % messages.length];
    for (let lines = 1; lines <= 6; lines++) {
      const got = await setDisplay(m, text, { font: HEADLINE.font, max: Math.min(64 * PT, boxH * 0.4), min: 14 * PT, maxLines: lines,
                                             leading: 1.2, align: "fit" }, `${id}-t`, id, 0, 0, inner);
      if (!got || got.lines !== lines || got.bottom > boxH - 2 * pad) continue;
      if (!best || got.size > best.size + 0.5) best = { text, size: got.size, lines, height: got.bottom };
    }
    if (best) break; // the first message that fits; the rotation varies them
  }
  if (!best) return null;
  const set = await setDisplay(m, best.text, { font: HEADLINE.font, max: best.size, min: best.size, maxLines: best.lines,
                                              leading: 1.2, align: "fit" }, `${id}-t`, id, x + pad, y + (boxH - best.height) / 2, inner);
  if (!set) return null;
  return {
    elements: [{ id: `${id}-box`, kind: "rect", articleId: id, x, y, width: w, height: boxH, stroke: INK, strokeWidth: 1.5 * PT }, ...set.elements],
    height: boxH,
  };
}

export async function closeGaps(plan: PagePlan, ctx: {
  band: Band; ads: Ad[]; store: Store; releases: Map<string, Release>; m: Measurer; leftOut: Story[];
}): Promise<FitResult> {
  const { band, ads, store, releases, m } = ctx;
  const log: string[] = [];
  const factChecks: FitResult["factChecks"] = [];
  const used: Story[] = [];
  const extra: Element[] = [];
  const extraBlocks: { x0: number; x1: number; y0: number }[] = [];
  let cost = 0;
  const placed = [...plan.placed];
  const pitch = BODY.pitch;
  const fits = (mod: Module, avail: number) => mod.height <= avail + 0.5;
  const close = (mod: Module, avail: number) => avail - mod.height < pitch; // within one line

  // An empty area `cols` wide from column `col`, `h` tall from `y`: filled
  // with real content, never left blank -- a left-out story that fits, else
  // one summarised by the AI as a brief, else the paper's house ad.
  const fillArea = async (col: number, cols: number, y: number, h: number, where: string): Promise<boolean> => {
    for (const s of ctx.leftOut.filter((s) => !used.includes(s))) {
      for (const v of ["long", "medium", "short"] as Variant[]) {
        const brief = await buildModule(s, cols >= 3 ? 4 : 5, cols, v, m, 0);
        if (brief.height <= h) {
          placed.push({ module: brief, col, x: colX(col), y });
          used.push(s);
          log.push(`  ${s.id}: placed ${where}`);
          return true;
        }
      }
    }
    for (const s of ctx.leftOut.filter((s) => !used.includes(s))) {
      const rel = releases.get(s.id);
      if (!rel) continue;
      for (const n of [60, 40]) {
        const got = await fitLength(store, s, rel, n, { log: (x) => log.push(x) });
        if (!got) break;
        cost += got.cost;
        const briefStory: Story = { ...s, deck: "", kicker: "", photo: null, photos: [],
                                    bodies: { long: got.body, medium: got.body, short: got.body } };
        const brief = await buildModule(briefStory, 5, cols, "long", m, 0);
        if (brief.height <= h) {
          if (got.factCheck) factChecks.push({ story: s.id, detail: got.factCheck });
          placed.push({ module: brief, col, x: colX(col), y });
          used.push(s);
          log.push(`  ${s.id}: placed as a ${n}-word brief ${where}`);
          return true;
        }
      }
    }
    // no copy left for it: the paper's own house ad where it's wide and
    // shallow, a public-service message otherwise
    const id = `filler-${plan.page}-${extraBlocks.length}`;
    const w = spanWidth(cols);
    const ad = cols >= 3 && h <= 0.6 * w ? await houseAd(id, colX(col), y, w, h, m) : null;
    const msg = ad ? null : await messageFiller(id, colX(col), y, w, h, plan.page * 3 + extraBlocks.length, m);
    if (!ad && !msg) return false;
    extra.push(...(ad ?? msg!.elements));
    extraBlocks.push({ x0: colX(col), x1: colX(col) + w, y0: y });
    log.push(`  ${ad ? "house ad" : "message"} ${where} (${((ad ? h : msg!.height) / PT).toFixed(0)}pt)`);
    return true;
  };

  // briefs go into gaps too, so a few passes until nothing changes
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const [i, p] of placed.entries()) {
      const avail = room(p, placed, ads, band, extraBlocks);
      let mod = p.module;
      if (close(mod, avail)) continue;
      const story = mod.story;
      const rebuild = (s: Story, v: Variant, pt = BODY.pitch) => buildModule(s, mod.rank, mod.cols, v, m, mod.photoMode, pt);

      // a0. display before copy: a landscape picture across the whole story
      if (mod.photoMode === 0 && story.photo && !mod.photoDropped) {
        const wide = await buildModule(story, mod.rank, mod.cols, mod.variant, m, 1, mod.pitch);
        if (fits(wide, avail) && wide.height > mod.height) mod = wide;
      }
      // a. the next longer version
      for (let v = NEXT[mod.variant]; v; v = NEXT[v]) {
        const next = await rebuild(story, v);
        if (!fits(next, avail)) break;
        mod = next;
        if (close(mod, avail)) break;
      }
      // b. the AI fits the body to the lines the gap needs
      const release = releases.get(story.id);
      if (!close(mod, avail) && release) {
        const base = mod;
        const baseWords = words(base.story.bodies[base.variant]);
        const perLine = baseWords / Math.max(1, base.bodyLines);
        // lines the gap holds across the story's columns
        let want = Math.floor((avail - base.height) / pitch) * base.cols;
        let target = baseWords;
        let over: Story | null = null; // the shortest version that ran over
        for (let round = 0; round < 3 && want !== 0; round++) {
          target = Math.max(20, Math.round(target + want * perLine * 0.95));
          const got = await fitLength(store, base.story, release, target, { log: (s) => log.push(s) });
          if (!got) break;
          cost += got.cost;
          const fitted: Story = { ...base.story, bodies: { long: got.body, medium: got.body, short: got.body } };
          const next = await rebuild(fitted, "long");
          if (fits(next, avail)) {
            if (got.factCheck) factChecks.push({ story: story.id, detail: got.factCheck });
            if (next.height > mod.height) mod = next;
            if (close(mod, avail)) break;
            want = Math.floor((avail - next.height) / pitch) * base.cols;
          } else {
            // overshot: ask again for fewer words (the lines it ran over)
            if (!over || words(got.body) < words(over.bodies.long)) over = fitted;
            want = -Math.ceil((next.height - avail) / pitch) * base.cols;
          }
        }
        // the AI can't count words to a line: the exact last step is ours --
        // drop whole sentences from the end (news runs most important first)
        // of the shortest version that ran over, until it fits
        if (!close(mod, avail) && over) {
          let body = over.bodies.long;
          for (let k = 0; k < 12; k++) {
            const cut = dropLastSentence(body);
            if (!cut || cut === body) break;
            body = cut;
            const s2: Story = { ...over, bodies: { long: body, medium: body, short: body } };
            const next = await rebuild(s2, "long");
            if (fits(next, avail)) {
              if (next.height > mod.height) mod = next;
              break;
            }
          }
        }
      }
      // c. a slightly looser pitch, for the last part of a line (once: from the paper's own pitch)
      if (!close(mod, avail) && mod.bodyLines && mod.pitch === pitch) {
        const lines = Math.ceil(mod.bodyLines / mod.cols);
        const want = Math.min(pitch * 1.02, pitch + (avail - mod.height) / Math.max(1, lines));
        if (want > pitch * 1.001) {
          const next = await rebuild(mod.story, mod.variant, want);
          if (fits(next, avail)) mod = next;
        }
      }
      if (mod !== p.module && mod.height > p.module.height + 0.5) {
        placed[i] = { ...p, module: mod };
        changed = true;
        log.push(`  ${story.id}: grew ${((mod.height - p.module.height) / PT).toFixed(0)}pt ` +
                 `(${mod.variant}${mod.story.bodies.long !== p.module.story.bodies.long ? ", refitted" : ""}${mod.pitch !== pitch ? ", pitch +" + ((mod.pitch / pitch - 1) * 100).toFixed(1) + "%" : ""})`);
      }
      // d. / e. what's still empty under the story gets a story, a brief or a filler
      const left = avail - mod.height - GAP.betweenStories;
      if (left < 4 * pitch) continue;
      if (await fillArea(p.col, mod.cols, p.y + mod.height + GAP.betweenStories, left, `under ${story.id}`)) changed = true;
    }
    if (!changed) break;
  }

  // anything still empty anywhere on the page -- beside an ad, between
  // stories of different widths -- found on the page as it now stands
  // (layout/occupancy.ts), side-by-side column stretches taken as one area
  for (let round = 0; round < 16; round++) {
    const now = [...renderPlaced(placed, extra), ...ads.map((a) => ({ id: a.id, kind: "rect" as const, x: a.x, y: a.y, width: a.width, height: a.height }))];
    const holes = findGaps(now, band).sort((a, b) => a.y0 - b.y0 || a.col - b.col);
    if (!holes.length) break;
    let filled = false;
    for (const area of mergeGaps(holes)) {
      const top = area.y0 + (area.y0 > band.top + 1 ? GAP.betweenStories : 0);
      if (await fillArea(area.col, area.cols, top, area.y1 - top, "in an empty area")) { filled = true; break; }
    }
    if (!filled) break;
  }

  // what's still open, for the white-space check
  const gaps: PagePlan["gaps"] = [];
  for (const p of placed) {
    const avail = room(p, placed, ads, band, extraBlocks);
    const g = avail - p.module.height;
    if (g > 1.5 * pitch) log.push(`  ${p.module.story.id}: ${(g / PT).toFixed(0)}pt still open under it (${p.module.cols} col, ${p.module.variant}, ` +
                                  `${releases.has(p.module.story.id) ? "" : "no release, "}${p.module.bodyLines} lines)`);
    if (g > 1.5 * pitch && !extraBlocks.some((b) => b.x0 === p.x && Math.abs(b.y0 - (p.y + p.module.height + GAP.betweenStories)) < 1)) {
      for (let c = p.col; c < p.col + p.module.cols; c++) gaps.push({ col: c, y0: p.y + p.module.height, y1: p.y + avail });
    }
  }
  return { plan: { ...plan, placed, gaps }, elements: renderPlaced(placed, extra), cost, log, used, factChecks };
}
