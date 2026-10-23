// Headlines, kickers and decks set the way a newspaper sets them: every line
// fitted to the full width of its story, at the largest size that allows it.
//
// The 8 August paper never leaves a headline ragged. It picks a size, breaks
// the words into a few balanced lines, then stretches or squeezes each line
// to the exact measure: horizontal scaling (from 0.6x to 1.4x in that issue)
// and letter spacing. Here the same, in a tighter range so the face never
// looks distorted: the size comes down only until every line can be fitted
// within hScale [HMIN, HMAX] plus a little letter spacing.
//
// Lines sit on a fixed baseline pitch (size x leading, tight like the
// paper's), opened up only where two lines' actual marks would touch.
import type { TextElement } from "@ck/shared/contract";
import { r1 } from "./compose.ts";
import { elementText, topFor, type Line, type Measurer, type Run } from "./measure.ts";
import { INK, PT } from "./typography.ts";

/** How far a display line may be squeezed or stretched. */
const HMIN = 0.86;
const HMAX = 1.2;
/** letter spacing a display line may take on top of HMAX, in em */
const LS_MAX = 0.05;

export interface DisplaySpec {
  font: string;
  /** largest and smallest size to try (contract px) */
  max: number;
  min: number;
  maxLines: number;
  /** baseline pitch, as a multiple of the size */
  leading: number;
  /** "fit": every line fills the width; "center" / "left": one natural line, never stretched */
  align: "fit" | "center" | "left";
  /** prefer more, bigger lines over one long one (a lead's headline): each
   * extra line is worth this share of size */
  linesBonus?: number;
  /** set like a short paragraph (a sub-heading): every line full but the
   * last, which may end short of the width */
  lastFree?: boolean;
}

export interface DisplayBlock {
  elements: TextElement[];
  /** where the last line's marks end */
  bottom: number;
  size: number;
  lines: number;
  /** the least full line, as a share of the width (1 = flush both sides) */
  fill: number;
}

interface Measured { word: string; width: number; letters: number; runs: Run[] }

/** The best way to break `words` (measured at size 1) into `n` lines that can
 * each be fitted to `w` at `size`: the most even lines, no lone last word. */
function breaksFor(words: Measured[], space: number, size: number, w: number, n: number, lastFree = false): number[] | null {
  const k = words.length;
  if (n > k) return null;
  const nat = (i: number, j: number) => (words.slice(i, j).reduce((a, x) => a + x.width, 0) + (j - i - 1) * space) * size;
  const stretchable = (i: number, j: number) => nat(i, j) * HMAX + (words.slice(i, j).reduce((a, x) => a + x.letters, 0) + j - i - 2) * LS_MAX * size * HMAX;
  // cost[j][l]: best cost to set words[0..j) in l lines
  const INF = Number.POSITIVE_INFINITY;
  const cost = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(INF));
  const from = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(-1));
  cost[0][0] = 0;
  for (let l = 1; l <= n; l++) {
    for (let j = 1; j <= k; j++) {
      for (let i = l - 1; i < j; i++) {
        if (cost[i][l - 1] === INF) continue;
        const width = nat(i, j);
        if (width * HMIN > w) continue; // can't squeeze it in
        const free = lastFree && l === n && j === k && width <= w;
        if (!free && stretchable(i, j) < w && !(j - i === 1 && n === 1)) continue; // can't stretch it out
        // how far the line's scale is from 1, both ways alike (a free last line: how short it falls)
        let c = free ? (width < 0.35 * w ? 1 : 0) : Math.log(w / width) ** 2;
        if (l === n && j - i === 1 && n > 1) c += 0.5; // a lone last word
        if (cost[i][l - 1] + c < cost[j][l]) {
          cost[j][l] = cost[i][l - 1] + c;
          from[j][l] = i;
        }
      }
    }
  }
  if (cost[k][n] === INF) return null;
  const starts: number[] = [];
  for (let j = k, l = n; l > 0; l--) {
    const i = from[j][l];
    starts.push(i);
    j = i;
  }
  return starts.reverse();
}

/** One display line's spacing: the squeeze or stretch, then letter spacing,
 * then (only if still short) word spacing. */
function fitLine(natural: number, letters: number, spaces: number, size: number, w: number) {
  const hScale = Math.max(HMIN, Math.min(HMAX, w / natural));
  let rest = w / hScale - natural;
  let letterSpacing = 0;
  let wordSpacing = 0;
  if (rest > 0 && letters > 0) {
    letterSpacing = Math.min(LS_MAX * size, rest / letters);
    rest -= letterSpacing * letters;
  }
  if (rest > 0.01 && spaces > 0) {
    wordSpacing = rest / spaces;
    rest = 0;
  }
  const fill = Math.min(1, (w - Math.max(0, rest) * hScale) / w);
  return { hScale, letterSpacing, wordSpacing, fill };
}

/**
 * Sets `text` at (x, y), `w` wide: returns its elements, or null if it can't
 * be set within the spec (the caller tries another width or size range).
 */
const KERNED = /[\u0600-\u06FF\u0750-\u077F\u0900-\u097F]/;

// set blocks, per measurer: a story built again at another length sets the
// same headline at the same place (layout/blocks.ts)
const sets = new WeakMap<Measurer, Map<string, DisplayBlock | null>>();

export async function setDisplay(m: Measurer, text: string, spec: DisplaySpec, id: string, aid: string,
                                 x: number, y: number, w: number): Promise<DisplayBlock | null> {
  if (!sets.has(m)) sets.set(m, new Map());
  const memo = sets.get(m)!;
  const key = JSON.stringify([text, spec, id, aid, x, y, w]);
  if (!memo.has(key)) memo.set(key, await setDisplayOnce(m, text, spec, id, aid, x, y, w));
  const got = memo.get(key)!;
  return got && { ...got, elements: got.elements.map((e) => ({ ...e })) };
}

async function setDisplayOnce(m: Measurer, text: string, spec: DisplaySpec, id: string, aid: string,
                              x: number, y: number, w: number): Promise<DisplayBlock | null> {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  const REF = 100;
  const measured = await m.words(t, spec.font, REF);
  const words: Measured[] = measured.words.map((x) => ({ word: x.word, width: x.width / REF, letters: x.letters, runs: x.runs }));
  const space = measured.space / REF;

  // the largest size (in 0.5pt steps) at which the text can be set; for
  // each line count its own largest size, then the best of those
  let chosen: { size: number; starts: number[] } | null = null;
  if (spec.align !== "fit") {
    for (let size = spec.max; size >= spec.min - 0.01 && !chosen; size -= PT / 2) {
      const natural = (words.reduce((a, x) => a + x.width, 0) + (words.length - 1) * space) * size;
      if (natural * HMIN <= w) chosen = { size, starts: [0] };
    }
  } else {
    let bestScore = -1;
    for (let n = 1; n <= spec.maxLines; n++) {
      for (let size = spec.max; size >= spec.min - 0.01; size -= PT / 2) {
        // (a kerned script, Hindi or Urdu, prints a hair wider than it measures: a margin)
        const starts = breaksFor(words, space, size, KERNED.test(t) ? w * 0.995 : w, n, spec.lastFree);
        if (!starts) continue;
        const score = size * (1 + (spec.linesBonus ?? 0) * (n - 1));
        if (score > bestScore + 0.01) {
          bestScore = score;
          chosen = { size, starts };
        }
        break; // the largest size for this line count
      }
    }
  }
  if (!chosen) return null;
  const { size, starts } = chosen;
  const pitch = size * spec.leading;

  const lines = starts.map((i, k) => {
    const j = starts[k + 1] ?? words.length;
    const ws = words.slice(i, j);
    const runs: Run[] = [];
    ws.forEach((x, wi) => {
      if (wi) runs.push({ text: measured.spaceText });
      runs.push(...x.runs);
    });
    const natural = (ws.reduce((a, x) => a + x.width, 0) + (ws.length - 1) * space) * size;
    // (a script never letter-spaced -- Hindi, Urdu: measure.ts gives its words
    // no letters -- takes none at its spaces either: letter spacing applies to
    // every character on the page, and a Hindi heading ran 65-127 px over)
    const letters = ws.some((x) => x.letters > 0) ? ws.reduce((a, x) => a + x.letters, 0) + ws.length - 2 : 0;
    const line: Line = { text: ws.map((x) => x.word).join(" "), runs, para: 0, start: k === 0, end: k === starts.length - 1,
                         width: natural, spaces: ws.length - 1, letters, spaceWidth: space * size };
    return { line, natural, letters, spaces: ws.length - 1 };
  });

  // the width a line is set to: a kerned script (Hindi, Urdu) prints a hair
  // wider than measured, so a hair short of the box
  const room = KERNED.test(t) ? w * 0.995 : w;
  // baselines: a fixed pitch, opened only where marks would touch
  const ink = await m.ink(lines.map((l) => ({ text: l.line.text, font: spec.font, size })));
  const clear = 0.06 * size;
  let baseline = y + ink[0].ascent;
  let fillMin = 1;
  const elements = lines.map((l, k) => {
    if (k) baseline += Math.max(pitch, ink[k - 1].descent + clear + ink[k].ascent);
    const top = topFor(baseline, ink[k].fontAscent, ink[k].fontDescent, pitch);
    const base = {
      id: `${id}${k}`, kind: "text" as const, articleId: aid, y: r1(top), height: r1(pitch),
      ...elementText([l.line], m.isLegacy(spec.font)), font: spec.font, size: Math.round(size * 100) / 100,
      lineHeight: Math.round(pitch * 100) / 100, color: INK, nowrap: true,
    };
    if (spec.align !== "fit") {
      // the story's full width, the line centred (or flush left) in it, squeezed only if it must be
      const hScale = Math.min(1, room / l.natural);
      return { ...base, x: r1(x), width: r1(w), align: spec.align,
               ...(hScale < 0.9999 ? { hScale: Math.round(hScale * 10000) / 10000 } : {}) };
    }
    if (spec.lastFree && l.line.end && l.natural <= room) {
      // the last line of a paragraph-like block: at its natural width
      return { ...base, x: r1(x), width: r1(w), align: "left" as const };
    }
    const f = fitLine(l.natural, l.letters, l.spaces, size, room);
    fillMin = Math.min(fillMin, f.fill);
    return {
      ...base, x: r1(x), width: r1(w), align: (f.fill > 0.999 ? "justify-all" : "left") as TextElement["align"],
      ...(Math.abs(f.hScale - 1) > 0.0001 ? { hScale: Math.round(f.hScale * 10000) / 10000 } : {}),
      ...(f.letterSpacing > 0.005 ? { letterSpacing: Math.round(f.letterSpacing * 1000) / 1000 } : {}),
      ...(f.wordSpacing > 0.005 ? { wordSpacing: Math.round(f.wordSpacing * 1000) / 1000 } : {}),
    };
  });
  return { elements, bottom: baseline + ink[ink.length - 1].descent, size, lines: lines.length, fill: fillMin };
}
