// Lays out one story inside the rectangle the page planner gave it, the way
// the paper does (ported from archive/frontend-layout-engine/engine.py):
// kicker and headline across the box, a photo with its caption at the right,
// the body threaded through justified columns on the paper's grid. Every line
// break is decided here, by measuring in Chromium (measure.ts), and sent to
// the frontend as "\n" -- the plotter only draws.
//
// The fluid part: the same text has to fill boxes of any size. Short text
// grows the headline and the photo; long text shrinks them, then tightens the
// leading and steps the body size down. What still doesn't fit is reported
// (overflow, with the leftover text), never dropped silently.
import type { Element, TextElement } from "@ck/shared/contract";
import { elementText, topFor, type Line, type Measurer } from "./measure.ts";
import { BODY, CAPTION, DECK, GAP, GRID, HEADLINE, INK, KICKER, PHOTO, PT } from "./typography.ts";

export interface Story {
  id: string;
  kicker?: string;
  title?: string;
  deck?: string;
  /** Paragraphs separated by blank lines. */
  body: string;
  photo?: { url: string; caption?: string };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Composed {
  elements: Element[];
  /** Everything fits in the box. */
  fits: boolean;
  /** Share of the body columns' height the text fills (1 = full). */
  fill: number;
  /** Body lines that didn't fit, and their text. */
  overflowLines: number;
  /** The story has a photo but no acceptable size for it fit this box. */
  photoDropped?: boolean;
  leftover?: string;
}

export interface Frame { x: number; y: number; w: number; h: number }

export const r1 = (v: number) => Math.round(v * 10) / 10;
export const DISPLAY_SAFETY = 0.98;

export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** A headline whose last line is a stray word or two. */
export function widowed(lines: Line[]): boolean {
  if (lines.length < 2) return false;
  const longest = Math.max(...lines.map((l) => l.width));
  return lines[lines.length - 1].width < 0.25 * longest;
}

/** One text element per line, each at a baseline chosen from the INK of the
 * actual lines: the first line's tallest mark starts at `y`, and every next
 * line sits low enough that its marks clear the descenders of the line above
 * (at least the nominal `pitch` apart). Returns the elements and the y where
 * the last line's ink ends. Each fills its line exactly when it's nearly full. */
export async function stackLines(m: Measurer, lines: Line[], id: string, aid: string, x: number, y: number, w: number,
                          font: string, size: number, pitch: number): Promise<{ elements: TextElement[]; bottom: number }> {
  if (!lines.length) return { elements: [], bottom: y };
  const ink = await m.ink(lines.map((l) => ({ text: l.text, font, size })));
  const gap = 0.08 * size;
  let baseline = y + ink[0].ascent;
  const elements = lines.map((l, j) => {
    if (j) baseline += Math.max(pitch, ink[j - 1].descent + gap + ink[j].ascent);
    const top = topFor(baseline, ink[j].fontAscent, ink[j].fontDescent, pitch);
    return {
      id: `${id}${j}`, kind: "text" as const, articleId: aid,
      x: r1(x), y: r1(top), width: r1(w), height: r1(pitch),
      ...elementText([l], m.isLegacy(font)), font, size: r1(size), lineHeight: r1(pitch), color: INK,
      align: (l.width >= 0.96 * w ? "justify-all" : "left") as TextElement["align"],
    };
  });
  return { elements, bottom: baseline + ink[ink.length - 1].descent };
}

/** Per-column line counts that end every column on the same baseline when
 * the text is shorter than the box, else plain top-to-bottom filling. */
function balancedCaps(frames: Frame[], pitch: number, n: number): number[] {
  const capsAt = (limit: number) => frames.map((f) => Math.max(0, Math.floor((Math.min(limit, f.y + f.h) - f.y + 0.01) / pitch)));
  let lo = Math.min(...frames.map((f) => f.y));
  let hi = Math.max(...frames.map((f) => f.y + f.h));
  if (capsAt(hi).reduce((a, b) => a + b, 0) < n) return capsAt(hi);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (capsAt(mid).reduce((a, b) => a + b, 0) >= n) hi = mid; else lo = mid;
  }
  return capsAt(hi);
}

/** The body lines of one column as text elements: lines continuing a
 * paragraph from the column before get their own element (no indent), the
 * rest share one with a first-line indent. Inner lines end with "\n" so the
 * plotter stretches them to the column edge; a paragraph's last line isn't,
 * unless the paragraph runs on into the next column. */
export function columnElements(lines: Line[], id: string, aid: string, f: Frame, size: number, pitch: number, legacy: boolean): TextElement[] {
  const out: TextElement[] = [];
  const chunks: Line[][] = [];
  const firstStart = lines.findIndex((l) => l.start);
  if (firstStart !== 0) chunks.push(lines.slice(0, firstStart === -1 ? lines.length : firstStart));
  if (firstStart !== -1) chunks.push(lines.slice(firstStart));
  let row = 0;
  chunks.forEach((chunk, k) => {
    if (!chunk.length) return;
    const pieces: (Line | string)[] = [];
    chunk.forEach((l, i) => {
      if (i) pieces.push(l.start ? "\n\n" : "\n");
      pieces.push(l);
    });
    if (!chunk[chunk.length - 1].end) pieces.push("\n");
    const indented = chunk[0].start;
    out.push({
      id: `${id}${k ? "b" : "a"}`, kind: "text", articleId: aid,
      x: r1(f.x), y: r1(f.y + row * pitch), width: r1(f.w), height: r1(chunk.length * pitch),
      ...elementText(pieces, legacy), font: BODY.font, size: r1(size), lineHeight: r1(pitch), color: INK, align: "justify",
      ...(indented ? { indent: r1(BODY.indent) } : {}),
    });
    row += chunk.length;
  });
  return out;
}

export async function compose(story: Story, box: Rect, m: Measurer): Promise<Composed> {
  const { x, y, width: w, height: h } = box;
  const aid = story.id;
  const cols = Math.max(1, Math.round((w + GRID.gutter) / GRID.pitch));
  const colw = (w - (cols - 1) * GRID.gutter) / cols;
  const paras = splitParagraphs(story.body);
  const title = story.title?.trim() ?? "";
  const photo = story.photo?.url ? await m.imageSize(story.photo.url) : null;
  const aspect = photo ? photo.width / photo.height : 0;

  // body line counts per size, measured once
  const bodyLines = new Map<number, Line[]>();
  const bodyAt = async (size: number) => {
    if (!bodyLines.has(size)) {
      const [lines] = await m.breakLines([{ paras, width: colw, font: BODY.font, size, indent: BODY.indent }]);
      bodyLines.set(size, lines);
    }
    return bodyLines.get(size)!;
  };
  for (const s of BODY.sizes) await bodyAt(s);

  // ---- header: kicker, headline, deck, for a given (extra points, extra lines)
  const headers = new Map<string, { elements: Element[]; cursor: number; size: number }>();
  async function header(extraPt: number, extraLines: number) {
    const key = `${extraPt}/${extraLines}`;
    if (headers.has(key)) return headers.get(key)!;
    const els: Element[] = [];
    let cursor = y + GAP.top; // the tallest mark of the first line stays inside the slot
    let hd = 0;
    let hl: Line[] = [];
    if (title) {
      const maxLines = (cols === 1 ? 3 : 2) + extraLines;
      // a shrink variant on a narrow column can't go below the smallest headline
      const top = Math.max(HEADLINE.min, Math.min(64 * PT, HEADLINE.cap(cols) + extraPt * PT));
      const sizes: number[] = [];
      for (let s = top; s >= HEADLINE.min; s -= PT) sizes.push(s);
      const tries = await m.breakLines(sizes.map((size) => ({ paras: [title], width: w, font: HEADLINE.font, size, safety: DISPLAY_SAFETY })));
      // every line must fit the column (a single long word otherwise gets a
      // line of its own that runs past it) -- even at the smallest size
      const fitsWidth = (ls: Line[]) => ls.every((l) => l.width <= w * DISPLAY_SAFETY);
      let pick = tries.findIndex((ls) => ls.length <= maxLines && !widowed(ls) && fitsWidth(ls));
      if (pick === -1) pick = tries.findIndex(fitsWidth);
      const i = pick === -1 ? tries.length - 1 : pick;
      hd = sizes[i];
      hl = tries[i];
    }
    const kicker = story.kicker?.trim();
    if (kicker) {
      let kd = Math.max(KICKER.min, Math.round((hd || 30 * PT) * KICKER.ratio));
      let kl = (await m.breakLines([{ paras: [kicker], width: w, font: KICKER.font, size: kd, safety: DISPLAY_SAFETY }]))[0];
      while (kl.length > 2 && kd > KICKER.min) {
        kd -= PT;
        kl = (await m.breakLines([{ paras: [kicker], width: w, font: KICKER.font, size: kd, safety: DISPLAY_SAFETY }]))[0];
      }
      const st = await stackLines(m, kl, `${aid}-k`, aid, x, cursor, w, KICKER.font, kd, kd * KICKER.leading);
      els.push(...st.elements);
      cursor = st.bottom + GAP.afterKicker;
    }
    if (title) {
      const st = await stackLines(m, hl, `${aid}-h`, aid, x, cursor, w, HEADLINE.font, hd, hd * HEADLINE.leading);
      els.push(...st.elements);
      cursor = st.bottom + GAP.afterHeadline;
    }
    const deck = story.deck?.trim();
    if (deck) {
      let dd = Math.max(DECK.min, Math.round((hd || 24 * PT) * DECK.ratio));
      let dl = (await m.breakLines([{ paras: [deck], width: w, font: DECK.font, size: dd, safety: DISPLAY_SAFETY }]))[0];
      while (dl.length > 3 && dd > DECK.min) {
        dd -= PT;
        dl = (await m.breakLines([{ paras: [deck], width: w, font: DECK.font, size: dd, safety: DISPLAY_SAFETY }]))[0];
      }
      const st = await stackLines(m, dl, `${aid}-d`, aid, x, cursor, w, DECK.font, dd, dd * DECK.leading);
      els.push(...st.elements);
      cursor = st.bottom + GAP.afterDeck;
    }
    const out = { elements: els, cursor, size: hd };
    headers.set(key, out);
    return out;
  }

  // ---- one candidate: photo (k columns, at most `frac` of the room) + body frames
  type Attempt = { elements: Element[]; frames: Frame[]; size: number; pitch: number; fits: boolean; fill: number };
  async function attempt(hdr: { elements: Element[]; cursor: number }, opt: [number, number] | null): Promise<Attempt | null> {
    const els = [...hdr.elements];
    let k = 0;
    let photoBottom = hdr.cursor;
    const room = y + h - hdr.cursor;
    if (photo && opt && room > 60 * PT) {
      const [kk, frac] = opt;
      k = kk;
      const pw = k * colw + (k - 1) * GRID.gutter;
      const natural = pw / aspect;
      const ph = Math.min(natural, room * frac);
      if (ph < natural * (1 - PHOTO.maxCrop)) return null; // would crop away too much of the picture
      if (ph < PHOTO.minHeight) return null; // a postage stamp
      if (paras.length && cols >= 2 && k < PHOTO.minCols) return null;
      if (paras.length && pw * ph > PHOTO.maxShare * w * h) return null; // the picture would crowd out the story
      // contract px -> inches is /DPI (300): the image's own pixels per printed inch
      if (photo!.width / (pw / 300) < PHOTO.minPpi) return null; // would print soft
      const px = x + w - pw;
      els.push({ id: `${aid}-photo`, kind: "image", articleId: aid, x: r1(px), y: r1(hdr.cursor), width: r1(pw), height: r1(ph),
                 url: story.photo!.url, fit: "cover" });
      photoBottom = hdr.cursor + ph + GAP.afterPhoto;
      const caption = story.photo!.caption?.trim();
      if (caption) {
        const [cl] = await m.breakLines([{ paras: [caption], width: pw, font: CAPTION.font, size: CAPTION.size, safety: DISPLAY_SAFETY }]);
        const st = await stackLines(m, cl, `${aid}-cap`, aid, px, photoBottom, pw, CAPTION.font, CAPTION.size, CAPTION.pitch);
        els.push(...st.elements.map((e) => ({ ...e, align: "center" as const })));
        photoBottom = st.bottom;
      }
      photoBottom += GAP.afterCaption;
    }
    const frames: Frame[] = [];
    for (let i = 0; i < cols; i++) {
      const fy = k && i >= cols - k ? photoBottom : hdr.cursor;
      frames.push({ x: x + i * (colw + GRID.gutter), y: fy, w: colw, h: Math.max(0, y + h - fy) });
    }
    if (!paras.length) {
      // a picture story: the photo and its caption must end inside the box
      const fits = photoBottom - GAP.afterCaption <= y + h + 0.5;
      return { elements: els, frames, size: BODY.size, pitch: BODY.pitch, fits, fill: fits ? 1 : 0 };
    }
    const capacity = (pitch: number) => frames.reduce((a, f) => a + Math.floor((f.h + 0.01) / pitch), 0);
    const area = frames.reduce((a, f) => a + f.h, 0);
    // body: the paper's size and pitch first; looser to fill a short story;
    // then tighter, then smaller, for a long one
    for (const size of BODY.sizes) {
      const n = (await bodyAt(size)).length;
      const base = BODY.pitches[0] * (size / BODY.size);
      if (n <= capacity(base)) {
        let pitch = base;
        for (const p of BODY.pitches.slice(1, 4).map((p) => p * (size / BODY.size))) if (n <= capacity(p)) pitch = p;
        return { elements: els, frames, size, pitch, fits: true, fill: Math.min(1, (n * pitch) / area) };
      }
      for (const p of BODY.pitches.slice(4).map((p) => p * (size / BODY.size))) {
        if (n <= capacity(p)) return { elements: els, frames, size, pitch: p, fits: true, fill: Math.min(1, (n * p) / area) };
      }
    }
    const size = BODY.sizes[BODY.sizes.length - 1];
    const pitch = BODY.pitches[BODY.pitches.length - 1] * (size / BODY.size);
    return { elements: els, frames, size, pitch, fits: false, fill: 1 };
  }

  // Candidates in editorial order: default headline with a modest photo;
  // a bigger headline; bigger photos; only then a smaller headline. The
  // first that fits and fills >= 92% wins, else the fullest that fits,
  // else the least-bad overflow.
  const photoOpts: ([number, number] | null)[] = [];
  if (photo && !paras.length) {
    // a picture story: as big as the box allows, leaving room for the caption
    for (let k = cols; k >= 1; k--) for (const frac of [1, 0.9, 0.8, 0.7, 0.6, 0.5]) photoOpts.push([k, frac]);
  } else if (photo) {
    const base = cols <= 1 ? cols : cols <= 3 ? cols - 1 : Math.ceil(cols / 2);
    const widths = [base, ...Array.from({ length: cols - base }, (_, i) => base + 1 + i), ...Array.from({ length: base - 1 }, (_, i) => base - 1 - i)];
    for (const k of widths) for (const frac of [0.45, 0.55, 0.65, 0.75, 0.35, 0.28, 0.22]) photoOpts.push([k, frac]);
    photoOpts.push(null); // no acceptable size: the story runs without its photo
  } else {
    photoOpts.push(null);
  }
  const modest = photoOpts.filter((o) => o === null || o[1] === 0.45 || o[1] === 0.55).slice(0, 2);
  const order: [[number, number], [number, number] | null][] = [];
  const grow: [number, number][] = [[10, 1], [16, 2]];
  const shrink: [number, number][] = [[-4, 0], [-8, 0], [-12, 0]];
  for (const o of modest) order.push([[0, 0], o]);
  for (const v of grow) for (const o of modest) order.push([v, o]);
  for (const v of [[0, 0] as [number, number], ...grow]) for (const o of photoOpts) order.push([v, o]);
  for (const v of shrink) for (const o of photoOpts) order.push([v, o]);

  // With a photo first: only when no layout with the photo fits does the
  // story run without it.
  async function choose(withPhoto: boolean): Promise<Attempt | null> {
    let best: Attempt | null = null;
    const fitting: Attempt[] = [];
    const seen = new Set<string>();
    for (const [variant, opt] of order) {
      if ((opt !== null) !== withPhoto) continue;
      const key = `${variant}|${opt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = await attempt(await header(...variant), opt);
      if (!a) continue;
      if (a.fits && a.fill >= 0.92) return a;
      if (a.fits) fitting.push(a);
      else if (!best || a.fill > best.fill) best = a;
    }
    return fitting.length ? fitting.reduce((a, b) => (b.fill > a.fill ? b : a)) : best;
  }
  let best = photo ? await choose(true) : null;
  let photoDropped = false;
  if (!best?.fits && (!photo || paras.length)) {
    const plain = await choose(false);
    if (plain && (plain.fits || !best)) {
      photoDropped = !!photo;
      best = plain;
    }
  }
  if (!best) {
    // nothing could be placed at all (e.g. a photo that can't fit and no text)
    return { elements: [], fits: false, fill: 0, overflowLines: 0 };
  }

  const elements = [...best.elements];
  if (!paras.length) return { elements, fits: best.fits, fill: best.fill, overflowLines: 0 };
  const lines = await bodyAt(best.size);
  const caps = balancedCaps(best.frames, best.pitch, lines.length);
  let i = 0;
  best.frames.forEach((f, fi) => {
    const take = lines.slice(i, i + caps[fi]);
    if (take.length) elements.push(...columnElements(take, `${aid}-c${fi}`, aid, f, best!.size, best!.pitch, m.isLegacy(BODY.font)));
    i += take.length;
  });
  const left = lines.slice(i);
  return {
    elements, fits: best.fits && !left.length, fill: best.fill, overflowLines: left.length, photoDropped,
    ...(left.length ? { leftover: left.map((l) => l.text).join(" ") } : {}),
  };
}
