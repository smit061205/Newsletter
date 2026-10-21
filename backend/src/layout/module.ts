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
}

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

/** The smallest common bottom at which `n` lines fit in columns starting at `tops`. */
function balance(tops: number[], n: number, pitch: number): { bottom: number; caps: number[] } {
  const capsAt = (b: number) => tops.map((t) => Math.max(0, Math.floor((b - t + 0.01) / pitch)));
  const candidates = tops.flatMap((t) => Array.from({ length: n + 1 }, (_, j) => t + j * pitch)).sort((a, b) => a - b);
  for (const b of candidates) {
    const caps = capsAt(b);
    if (caps.reduce((a, c) => a + c, 0) >= n) return { bottom: b, caps };
  }
  const b = Math.max(...tops) + n * pitch;
  return { bottom: b, caps: capsAt(b) };
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
                                  photoMode: PhotoMode = 0, pitch = BODY.pitch): Promise<Module> {
  const aid = story.id;
  const w = spanWidth(cols);
  const els: Element[] = [];

  // ---- header: kicker, headline, deck -- never larger than the rank allows
  let cursor = GAP.top;
  const hd = HEADLINE.sizeFor(rank, cols);
  let headSize = hd;
  const title = story.headline?.trim();
  let headLines: Line[] = [];
  if (title) {
    const got = await fitLines(m, title, w, HEADLINE.font, hd, Math.max(HEADLINE.min, hd * 0.75), HEADLINE.maxLines(rank));
    headSize = got.size;
    headLines = got.lines;
  }
  const kicker = story.kicker?.trim();
  if (kicker) {
    const ks = Math.max(KICKER.min, Math.round(headSize * KICKER.ratio));
    const got = await fitLines(m, kicker, w, KICKER.font, ks, KICKER.min, 2);
    const st = await stackLines(m, got.lines, `${aid}-k`, aid, 0, cursor, w, KICKER.font, got.size, got.size * KICKER.leading);
    els.push(...st.elements);
    cursor = st.bottom + GAP.afterKicker;
  }
  if (headLines.length) {
    const st = await stackLines(m, headLines, `${aid}-h`, aid, 0, cursor, w, HEADLINE.font, headSize, headSize * HEADLINE.leading);
    els.push(...st.elements);
    cursor = st.bottom + GAP.afterHeadline;
  }
  const headlineHeight = cursor;
  const deck = story.deck?.trim();
  if (deck) {
    const ds = Math.max(DECK.min, Math.round(headSize * DECK.ratio));
    const got = await fitLines(m, deck, w, DECK.font, ds, DECK.min, 3);
    const st = await stackLines(m, got.lines, `${aid}-d`, aid, 0, cursor, w, DECK.font, got.size, got.size * DECK.leading);
    els.push(...st.elements);
    cursor = st.bottom + GAP.afterDeck;
  }

  // ---- body lines, measured once
  const paras = splitParagraphs(story.bodies[variant]);
  const [lines] = paras.length
    ? await m.breakLines([{ paras, width: GRID.column, font: BODY.font, size: BODY.size, indent: BODY.indent }])
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
                                photoDropped: false, headlineHeight, bodyLines: lines.length, pitch, headSize: headLines.length ? headSize : 0 });
  if (photoMode && (!photo || photo.width / photo.height < 1.25)) return none();

  if (photoMode === 2) {
    const pair = await photoPair(story, cols, cursor, m);
    if (!pair) return { story, rank, cols, variant, photoMode, width: w, height: Infinity, elements: [], photoDropped: false, headlineHeight: 0, bodyLines: 0, pitch, headSize: 0 };
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
      return { story, rank, cols, variant, photoMode, width: w, height: Infinity, elements: [], photoDropped: false, headlineHeight: 0, bodyLines: 0, pitch, headSize: 0 };
    }
    return { story, rank, cols, variant, photoMode, width: w, height, elements: [...els, ...out], photoDropped: false,
             headlineHeight, bodyLines: lines.length, pitch, headSize: headLines.length ? headSize : 0 };
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
      const caption = story.caption?.trim();
      if (caption) {
        const [cl] = await m.breakLines([{ paras: [caption], width: pw, font: CAPTION.font, size: CAPTION.size, safety: DISPLAY_SAFETY }]);
        const st = await stackLines(m, cl, `${aid}-cap`, aid, px, photoBottom, pw, CAPTION.font, CAPTION.size, CAPTION.pitch);
        out.push(...st.elements.map((e) => ({ ...e, align: "center" as const })));
        photoBottom = st.bottom;
      }
      photoBottom += GAP.afterCaption;
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
    return { story, rank, cols, variant, photoMode, width: w, height: Infinity, elements: [], photoDropped: false, headlineHeight, bodyLines: lines.length, pitch, headSize: headLines.length ? headSize : 0 };
  }

  return {
    story, rank, cols, variant, photoMode, width: w, height: best.height,
    elements: [...els, ...best.elements],
    photoDropped: !!photo && best.k === 0,
    headlineHeight, bodyLines: lines.length, pitch, headSize: headLines.length ? headSize : 0,
  };
}
