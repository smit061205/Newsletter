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
import { profile } from "../profile.ts";
import type { Ad, Release, Store, Story } from "../store.ts";
import { stackLines } from "./compose.ts";
import type { Measurer } from "./measure.ts";
import { buildModule, spanWidth, type Module, type Variant } from "./module.ts";
import { colX, renderPlaced, type Band, type PagePlan, type PlacedModule } from "./pack.ts";
import { BODY, DECK, GAP, GRID, HEADLINE, INK, PT } from "./typography.ts";

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

  // briefs go into gaps too, so a few passes until nothing changes
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const [i, p] of placed.entries()) {
      const avail = room(p, placed, ads, band, extraBlocks);
      let mod = p.module;
      if (close(mod, avail)) continue;
      const story = mod.story;
      const rebuild = (s: Story, v: Variant, pt = BODY.pitch) => buildModule(s, mod.rank, mod.cols, v, m, mod.photoMode, pt);

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
      // d. / e. what's still empty under the story gets a brief or the house ad
      const left = avail - mod.height - GAP.betweenStories;
      if (left < 4 * pitch) continue;
      const y = p.y + mod.height + GAP.betweenStories;
      let filled = false;
      for (const s of ctx.leftOut.filter((s) => !used.includes(s))) {
        for (const v of ["long", "medium", "short"] as Variant[]) {
          const brief = await buildModule(s, 5, mod.cols, v, m, 0);
          if (brief.height <= left) {
            placed.push({ module: brief, col: p.col, x: p.x, y });
            used.push(s);
            filled = changed = true;
            log.push(`  ${s.id}: placed as a brief under ${story.id}`);
            break;
          }
        }
        if (filled) break;
      }
      // a left-out story as a two- or three-line brief, summarised by the AI from its release
      if (!filled) {
        for (const s of ctx.leftOut.filter((s) => !used.includes(s))) {
          const rel = releases.get(s.id);
          if (!rel) continue;
          for (const n of [60, 40]) {
            const got = await fitLength(store, s, rel, n, { log: (x) => log.push(x) });
            if (!got) break;
            cost += got.cost;
            const briefStory: Story = { ...s, deck: "", kicker: "", photo: null, photos: [],
                                        bodies: { long: got.body, medium: got.body, short: got.body } };
            const brief = await buildModule(briefStory, 5, mod.cols, "long", m, 0);
            if (brief.height <= left) {
              if (got.factCheck) factChecks.push({ story: s.id, detail: got.factCheck });
              placed.push({ module: brief, col: p.col, x: p.x, y });
              used.push(s);
              filled = changed = true;
              log.push(`  ${s.id}: placed as a ${n}-word brief under ${story.id}`);
              break;
            }
          }
          if (filled) break;
        }
      }
      if (!filled) {
        const ad = await houseAd(`house-${plan.page}-${i}`, p.x, y, spanWidth(mod.cols), left, m);
        if (ad) {
          extra.push(...ad);
          extraBlocks.push({ x0: p.x, x1: p.x + spanWidth(mod.cols), y0: y });
          changed = true;
          log.push(`  house ad under ${story.id} (${(left / PT).toFixed(0)}pt)`);
        }
      }
    }
    if (!changed) break;
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
