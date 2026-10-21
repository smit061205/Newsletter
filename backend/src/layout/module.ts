// One story laid out at its own natural size: a "module", k columns wide and
// exactly as tall as its content -- the way a news desk sizes a story, not
// stretched to fill a box someone else drew.
//
//   - headline size comes from the story's rank and the columns it spans
//     (the profile's ladder); it only ever steps DOWN, to keep within the
//     rank's line limit, avoid a lone last word or a word wider than the column;
//   - the photo follows the print desk's photo rules (typography.ts PHOTO),
//     at its natural shape, at the right of the story;
//   - the body is set at the paper's size and line pitch and balanced across
//     the columns, so they all end on the same line.
// Every line is measured in Chromium (measure.ts), so the height is exact.
import type { Element, ImageElement } from "@ck/shared/contract";
import { columnElements, DISPLAY_SAFETY, r1, splitParagraphs, stackLines, widowed, type Frame } from "./compose.ts";
import type { Line, Measurer } from "./measure.ts";
import { setDisplay, type DisplaySpec } from "./display.ts";
import { normalizeStory } from "./text.ts";
import { BODY, CAPTION, DECK, GAP, GRID, HEADLINE, KICKER, PHOTO, PT } from "./typography.ts";
import type { Story } from "../store.ts";

export type Variant = "long" | "medium" | "short";

/** How the story's pictures are shown: 0 = one photo beside the text (the
 * usual), 1 = one photo across the whole story, 2 = two photos side by side
 * across it. The wider layouts are for pages with room to spare. */
export type PhotoMode = 0 | 1 | 2;

export interface Module {
  story: Story;
  rank: number;
  cols: number;
  variant: Variant;
  photoMode: PhotoMode;
  width: number;
  height: number;
  /** positioned with the module's top-left at (0, 0) */
  elements: Element[];
  /** the story has a photo but no acceptable size for it fits this width */
  photoDropped: boolean;
  headlineHeight: number;
  bodyLines: number;
  /** the body's line pitch (the profile's, or within 2% of it) */
  pitch: number;
  /** the headline's size (0 without one) */
  headSize: number;
  /** the least full display line (headline, kicker, deck), as a share of its width */
  displayFill: number;
  /** the sub-heading's size (0 without one) */
  deckSize: number;
  /** a headline size band set from outside (layout/fit.ts, so two
   * neighbours' headlines differ): kept by every rebuild */
  head?: HeadBand;
}

/** Bounds on a module's headline size, contract px. */
export interface HeadBand { max?: number; min?: number }

export const spanWidth = (cols: number) => cols * GRID.column + (cols - 1) * GRID.gutter;

/** Move a module's elements to (dx, dy). */
export function place(elements: Element[], dx: number, dy: number): Element[] {
  return elements.map((e) => (e.kind === "line"
    ? { ...e, x1: r1(e.x1 + dx), x2: r1(e.x2 + dx), y1: r1(e.y1 + dy), y2: r1(e.y2 + dy) }
    : e.kind === "path" ? e
    : { ...e, x: r1(e.x + dx), y: r1(e.y + dy) }));
}

async function fitLines(m: Measurer, text: string, width: number, font: string, start: number, min: number,
                        maxLines: number): Promise<{ size: number; lines: Line[] }> {
  const sizes: number[] = [];
  for (let s = start; s >= min - 0.01; s -= PT) sizes.push(s);
  if (!sizes.length) sizes.push(min);
  const tries = await m.breakLines(sizes.map((size) => ({ paras: [text], width, font, size, safety: DISPLAY_SAFETY })));
  const fitsWidth = (ls: Line[]) => ls.every((l) => l.width <= width * DISPLAY_SAFETY);
  let i = tries.findIndex((ls) => ls.length <= maxLines && !widowed(ls) && fitsWidth(ls));
  if (i === -1) i = tries.findIndex((ls) => ls.length <= maxLines && fitsWidth(ls));
  if (i === -1) i = tries.findIndex(fitsWidth);
  if (i === -1) i = tries.length - 1;
  return { size: sizes[i], lines: tries[i] };
}

/** The smallest common bottom at which `n` lines fit in columns starting at
 * `tops`, and how many lines each column takes: every column ends on that
 * bottom or one line above it -- the spare lines come off the last columns
 * one each, never all off the last one (which left it several lines short). */
function balance(tops: number[], n: number, pitch: number): { bottom: number; caps: number[] } {
  const capsAt = (b: number) => tops.map((t) => Math.max(0, Math.floor((b - t + 0.01) / pitch)));
  const candidates = tops.flatMap((t) => Array.from({ length: n + 1 }, (_, j) => t + j * pitch)).sort((a, b) => a - b);
  let bottom = Math.max(...tops) + n * pitch;
  for (const b of candidates) {
    if (capsAt(b).reduce((a, c) => a + c, 0) >= n) { bottom = b; break; }
  }
  const caps = capsAt(bottom);
  let spare = caps.reduce((a, c) => a + c, 0) - n;
  for (let round = 0; spare > 0 && round < n; round++) {
    for (let i = caps.length - 1; i >= 0 && spare > 0; i--) {
      if (caps[i] > 0) { caps[i]--; spare--; }
    }
  }
  return { bottom, caps };
}

const imageSizes = new Map<string, { width: number; height: number } | null>();

async function sizeOf(url: string, m: Measurer) {
  if (!imageSizes.has(url)) imageSizes.set(url, await m.imageSize(url));
  return imageSizes.get(url) ?? null;
}

/** Two photos side by side across the story, cut to one common height
 * (each loses at most PHOTO.maxCrop), each half the story wide. */
async function photoPair(story: Story, cols: number, y: number, m: Measurer): Promise<{ elements: Element[]; bottom: number } | null> {
  const urls = (story.photos ?? []).slice(0, 2);
  if (urls.length < 2 || cols < 4) return null;
  // both landscape: two tall pictures side by side would take the story over
  const kl = Math.ceil(cols / 2);
  const parts = [{ k: kl, x: 0 }, { k: cols - kl, x: kl * (GRID.column + GRID.gutter) }];
  const sizes = await Promise.all(urls.map((u) => sizeOf(u, m)));
  if (sizes.some((sz) => !sz || sz.width / sz.height < 1.25)) return null;
  const naturals = parts.map((p, i) => spanWidth(p.k) * sizes[i]!.height / sizes[i]!.width);
  const h = Math.min(...naturals);
  if (naturals.some((n) => h < n * (1 - PHOTO.maxCrop)) || h < PHOTO.minHeight) return null;
  if (parts.some((p, i) => sizes[i]!.width / (spanWidth(p.k) / 300) < PHOTO.minPpi)) return null;
  return {
    elements: parts.map((p, i) => ({ id: `${story.id}-photo${i}`, kind: "image" as const, articleId: story.id,
                                     x: r1(p.x), y: r1(y), width: r1(spanWidth(p.k)), height: r1(h), url: urls[i], fit: "cover" as const })),
    bottom: y + h + GAP.afterPhoto + GAP.afterCaption,
  };
}

export async function buildModule(story: Story, rank: number, cols: number, variant: Variant, m: Measurer,
                                  photoMode: PhotoMode = 0, pitch = BODY.pitch, head?: HeadBand): Promise<Module> {
  const mod = await build(story, rank, cols, variant, m, photoMode, pitch, head);
  return head ? { ...mod, head } : mod;
}

async function build(story: Story, rank: number, cols: number, variant: Variant, m: Measurer,
                     photoMode: PhotoMode, pitch: number, head?: HeadBand): Promise<Module> {
  const aid = story.id;
  const w = spanWidth(cols);
  const text = normalizeStory(story); // what's printed: the paper's digits, clean spacing
  const els: Element[] = [];

  // ---- header: kicker, headline, deck -- each line fitted to the story's
  // full width (display.ts), at the largest size the rank allows that fits
  let cursor = GAP.top;
  const hd = HEADLINE.sizeFor(rank, cols);
  let headSize = 0;
  let deckSize = 0;
  let displayFill = 1;
  // a block set to fit, else (text too long for the rank's lines) the old
  // way: lines at their natural width, sized down to fit
  const display = async (txt: string, idp: string, spec: DisplaySpec, fallbackLines: number, upTo?: number, floor = spec.min) => {
    const at = (sp: DisplaySpec) => setDisplay(m, txt, sp, `${aid}-${idp}`, aid, 0, cursor, w);
    const got = await at(spec)
      // too short to fill the width at this size: up to `upTo` (one rank up), the size it needs
      ?? (upTo && upTo > spec.max ? await at({ ...spec, max: upTo, min: spec.max }) : null)
      // too long: one more line, a little smaller
      ?? (spec.align === "fit" ? await at({ ...spec, maxLines: spec.maxLines + 1, min: Math.max(floor, spec.min * 0.85) }) : null);
    if (got) {
      displayFill = Math.min(displayFill, spec.align === "fit" ? got.fill : 1);
      return got;
    }
    const lines = await fitLines(m, txt, w, spec.font, spec.max, spec.min, fallbackLines);
    const st = await stackLines(m, lines.lines, `${aid}-${idp}`, aid, 0, cursor, w, spec.font, lines.size, lines.size * spec.leading);
    displayFill = 0;
    return { elements: st.elements, bottom: st.bottom, size: lines.size, lines: lines.lines.length, fill: 0 };
  };
  const kicker = text.kicker.trim();
  if (kicker) {
    const ks = Math.max(KICKER.min, hd * KICKER.ratio);
    const got = await display(kicker, "k", { font: KICKER.font, max: ks, min: KICKER.min, maxLines: 1, leading: KICKER.leading,
                                             align: rank <= 2 ? "center" : "left" }, 2);
    els.push(...got.elements);
    cursor = got.bottom + GAP.afterKicker;
  }
  const title = text.headline.trim();
  if (title) {
    // the rank's band, or the one set from outside (never below what the sub-heading needs)
    const floor = DECK.min * 1.3;
    const hMax = Math.max(floor, head?.max ?? Math.max(hd, head?.min ?? 0));
    const hMin = Math.min(hMax, Math.max(floor, head?.min ?? Math.max(HEADLINE.min, hMax * 0.72)));
    const got = await display(title, "h", { font: HEADLINE.font, max: hMax, min: hMin,
                                            maxLines: HEADLINE.maxLines(rank), leading: HEADLINE.leading, align: "fit",
                                            linesBonus: rank === 1 ? 0.25 : 0 }, HEADLINE.maxLines(rank),
                        head?.max ? undefined : HEADLINE.sizeFor(Math.max(1, rank - 1), cols), floor);
    els.push(...got.elements);
    headSize = got.size;
    cursor = got.bottom + GAP.afterHeadline;
  }
  const headlineHeight = cursor;
  const deck = text.deck.trim();
  if (deck) {
    // the sub-heading: clearly smaller than the headline, clearly larger than the body
    const ds = Math.min(Math.max(DECK.min, (headSize || hd) * DECK.ratio), (headSize || hd) / 1.3);
    const got = await display(deck, "d", { font: DECK.font, max: Math.max(ds, DECK.min), min: DECK.min, maxLines: 2, leading: DECK.leading,
                                           align: "fit", lastFree: true }, 3, undefined, DECK.min);
    els.push(...got.elements);
    deckSize = got.size;
    cursor = got.bottom + GAP.afterDeck;
  }

  // ---- body lines, measured once
  const paras = splitParagraphs(text.bodies[variant]);
  const [lines] = paras.length
    ? await m.breakLines([{ paras, width: GRID.column, font: BODY.font, size: BODY.size, indent: BODY.indent, optimal: true }])
    : [[] as Line[]];

  // ---- photo options: natural shape, the print desk's rules
  const photo = story.photo ? await sizeOf(story.photo, m) : null;
  const spans = !photo ? [0]
    : photoMode === 1 ? [cols]
    : cols === 1 ? [1, 0]
    : [...new Set([Math.ceil(cols / 2), cols - 1, cols, Math.max(PHOTO.minCols, Math.floor(cols / 2))])]
        .filter((k) => k >= PHOTO.minCols && k <= cols).concat(0);
  // the wider layouts may give the picture more of the story -- only a
  // landscape picture: a tall one spread across the story would take it over
  const maxShare = photoMode ? Math.min(0.65, PHOTO.maxShare + 0.2) : PHOTO.maxShare;
  const none = (): Module => ({ story, rank, cols, variant, photoMode, width: w, height: Infinity, elements: [],
                                photoDropped: false, headlineHeight, bodyLines: lines.length, pitch, headSize, displayFill, deckSize });
  if (photoMode && (!photo || photo.width / photo.height < 1.25)) return none();

  if (photoMode === 2) {
    const pair = await photoPair(story, cols, cursor, m);
    if (!pair) return { story, rank, cols, variant, photoMode, width: w, height: Infinity, elements: [], photoDropped: false, headlineHeight: 0, bodyLines: 0, pitch, headSize: 0, displayFill, deckSize };
    const tops = Array.from({ length: cols }, () => pair.bottom);
    const { bottom, caps } = balance(tops, lines.length, pitch);
    const out: Element[] = [...pair.elements];
    let li = 0;
    tops.forEach((top, i) => {
      const take = lines.slice(li, li + caps[i]);
      li += take.length;
      if (!take.length) return;
      out.push(...columnElements(take, `${aid}-c${i}`, aid, { x: i * (GRID.column + GRID.gutter), y: top, w: GRID.column, h: bottom - top },
                                 BODY.size, pitch, m.isLegacy(BODY.font)));
    });
    const height = Math.max(bottom, pair.bottom);
    if (pair.elements.reduce((a, e) => a + (e.kind === "image" ? e.width * e.height : 0), 0) > maxShare * w * height) {
      return { story, rank, cols, variant, photoMode, width: w, height: Infinity, elements: [], photoDropped: false, headlineHeight: 0, bodyLines: 0, pitch, headSize: 0, displayFill, deckSize };
    }
    return { story, rank, cols, variant, photoMode, width: w, height, elements: [...els, ...out], photoDropped: false,
             headlineHeight, bodyLines: lines.length, pitch, headSize, displayFill, deckSize };
  }

  let best: { elements: Element[]; height: number; k: number } | null = null;
  for (const k of spans) {
    const out: Element[] = [];
    let photoBottom = cursor;
    if (k && photo) {
      const pw = spanWidth(k);
      const ph = pw * photo.height / photo.width; // natural shape: nothing cropped
      if (ph < PHOTO.minHeight) continue; // a postage stamp
      if (photo.width / (pw / 300) < PHOTO.minPpi) continue; // would print soft
      const px = w - pw;
      const img: ImageElement = { id: `${aid}-photo`, kind: "image", articleId: aid, x: r1(px), y: r1(cursor),
                                  width: r1(pw), height: r1(ph), url: story.photo!, fit: "cover" };
      out.push(img);
      photoBottom = cursor + ph + GAP.afterPhoto;
      const caption = text.caption.trim();
      if (caption) {
        const [cl] = await m.breakLines([{ paras: [caption], width: pw, font: CAPTION.font, size: CAPTION.size, safety: DISPLAY_SAFETY }]);
        const st = await stackLines(m, cl, `${aid}-cap`, aid, px, photoBottom, pw, CAPTION.font, CAPTION.size, CAPTION.pitch);
        out.push(...st.elements.map((e) => ({ ...e, align: "center" as const })));
        photoBottom = st.bottom;
      }
      photoBottom += GAP.afterCaption;
      // the columns under the photo start a whole number of lines below the
      // others, so every column's lines share one grid and end level
      photoBottom = cursor + Math.ceil((photoBottom - cursor) / pitch - 0.001) * pitch;
    }
    // columns under the photo start below it; the rest right under the header
    const tops = Array.from({ length: cols }, (_, i) => (k && i >= cols - k ? photoBottom : cursor));
    const { bottom, caps } = balance(tops, lines.length, pitch);
    const height = Math.max(bottom, k ? photoBottom - GAP.afterCaption : cursor);
    if (k && photo && spanWidth(k) * (spanWidth(k) * photo.height / photo.width) > maxShare * w * height) continue;
    // the text beside a photo must reach (about) its foot: a photo taller
    // than its story's text leaves a hole beside it -- try a smaller one
    if (k && k < cols && photoBottom - GAP.afterCaption - bottom > 1.5 * pitch) continue;
    let li = 0;
    tops.forEach((top, i) => {
      const take = lines.slice(li, li + caps[i]);
      li += take.length;
      if (!take.length) return;
      const f: Frame = { x: i * (GRID.column + GRID.gutter), y: top, w: GRID.column, h: bottom - top };
      out.push(...columnElements(take, `${aid}-c${i}`, aid, f, BODY.size, pitch, m.isLegacy(BODY.font)));
    });
    best = { elements: out, height, k };
    break; // spans are in order of preference
  }
  if (!best) {
    // a wide layout that the photo rules don't allow: not an option
    return { story, rank, cols, variant, photoMode, width: w, height: Infinity, elements: [], photoDropped: false, headlineHeight, bodyLines: lines.length, pitch, headSize, displayFill, deckSize };
  }

  return {
    story, rank, cols, variant, photoMode, width: w, height: best.height,
    elements: [...els, ...best.elements],
    photoDropped: !!photo && best.k === 0,
    headlineHeight, bodyLines: lines.length, pitch, headSize, displayFill, deckSize,
  };
}
