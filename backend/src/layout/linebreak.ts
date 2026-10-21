// Body text the way a good typesetter justifies it, not the way a browser does.
//
// A browser breaks lines greedily (as many words as fit, then the next line)
// and then pushes ALL the leftover space into the word gaps -- so a line with
// two long words gets two huge holes, and holes line up into rivers. Two
// well-known remedies, used together here:
//
//   1. Total-fit line breaking (Knuth & Plass, "Breaking Paragraphs into
//      Lines", 1981 -- TeX, and InDesign's Paragraph Composer): choose all the
//      breaks of a paragraph at once, so that no line is much looser or
//      tighter than the rest, instead of filling each line in turn.
//   2. Micro-typography (pdfTeX's font expansion, after Hermann Zapf's hz
//      program): a line's slack goes into word spaces AND a little letter
//      spacing AND an imperceptible change of glyph width, so no single kind
//      of space has to take it all. The 8 August paper itself letter-spaces
//      its body lines (up to about 0.7pt).
//
// Widths are measured in Chromium (measure.ts); the breaking runs here.

/** How far each kind of spacing may move, as a share. */
export const MICRO = {
  /** word space, as a share of the font's own space */
  spaceMin: 0.7, spaceMax: 2.0,
  /** letter spacing, in em (the 8 August body runs up to about 0.055) */
  letterMin: -0.02, letterMax: 0.06,
  /** a hard ceiling for letter spacing on a line past its budget */
  letterLimit: 0.08,
  /** horizontal glyph scale */
  scaleMin: 0.97, scaleMax: 1.02,
};

/** A word as measured: its natural width and how many letters letter
 * spacing is added after (contract px). */
export interface Word { width: number; letters: number }

/** How one line is spread to its width: letter and word spacing (contract
 * px, before the squeeze) and the squeeze itself. `ratio` is how far into
 * its stretch (+) or shrink (-) budget the line is: beyond ±1 it's past the
 * typographer's limits. */
export interface Spread { letterSpacing: number; wordSpacing: number; hScale: number; ratio: number }

export interface LineShape {
  /** natural width: words and plain spaces */
  natural: number;
  /** word spaces in the line */
  spaces: number;
  /** letters the spacing goes between (the last one's trailing spacing excluded) */
  letters: number;
}

/** The spacing that makes a line of this shape exactly `target` wide. */
export function spread(line: LineShape, target: number, size: number, spaceW: number): Spread {
  const d = target - line.natural;
  const sp = line.spaces * spaceW;
  const em = line.letters * size;
  // each kind's capacity in this direction
  const cap = d >= 0
    ? { ws: sp * (MICRO.spaceMax - 1), ls: em * MICRO.letterMax, hs: line.natural * (MICRO.scaleMax - 1) }
    : { ws: sp * (1 - MICRO.spaceMin), ls: em * -MICRO.letterMin, hs: line.natural * (1 - MICRO.scaleMin) };
  const total = cap.ws + cap.ls + cap.hs;
  if (total <= 0) return { letterSpacing: 0, wordSpacing: 0, hScale: 1, ratio: d === 0 ? 0 : d > 0 ? Infinity : -Infinity };
  const ratio = d / total;
  const r = Math.max(-1, Math.min(1, ratio));
  // the squeeze first (it scales everything else too), then the rest
  // shared between letter and word spacing by their capacities
  const hScale = d >= 0 ? 1 + r * (MICRO.scaleMax - 1) : 1 + r * (1 - MICRO.scaleMin);
  const rest = target / hScale - line.natural;
  const share = cap.ws + cap.ls;
  let letterSpacing = 0;
  let wordSpacing = 0;
  if (share > 0) {
    // shared by capacity; past the budget the letters keep their share up
    // to a hard ceiling, and word spaces take whatever is left
    const ceiling = line.letters * size * (d >= 0 ? MICRO.letterLimit : -MICRO.letterMin);
    const lsTotal = Math.sign(rest) * Math.min(Math.abs(rest * (cap.ls / share)), ceiling);
    letterSpacing = line.letters ? lsTotal / line.letters : 0;
    // (a space is a letter too, already counted in `letters`: word spacing
    // is only what the spaces get on top of that)
    wordSpacing = line.spaces ? (rest - lsTotal) / line.spaces : 0;
  }
  return { letterSpacing, wordSpacing, hScale, ratio };
}

/** Lines that would be looser than this get the "very loose" badness. */
const LOOSE = 1;

interface Node { at: number; first: boolean; fitness: number; demerits: number; prev: Node | null }

const fitnessOf = (r: number) => (r < -0.5 ? 0 : r <= 0.5 ? 1 : r <= 1 ? 2 : 3);

/**
 * Total-fit breaks for one paragraph: the index of the first word of each
 * line. `firstWidth` is the first line's width (less its indent), `width`
 * every other line's.
 */
export function breakParagraph(words: Word[], spaceW: number, size: number, firstWidth: number, width: number): number[] {
  const n = words.length;
  if (!n) return [];
  const prefixW = [0];
  const prefixL = [0];
  for (const w of words) {
    prefixW.push(prefixW[prefixW.length - 1] + w.width);
    prefixL.push(prefixL[prefixL.length - 1] + w.letters);
  }
  const shapeOf = (i: number, j: number): LineShape => ({
    natural: prefixW[j] - prefixW[i] + (j - i - 1) * spaceW,
    spaces: j - i - 1,
    // every letter and space carries spacing; the line's last letter's trails off unseen
    letters: prefixL[j] - prefixL[i] + (j - i - 1) - 1,
  });
  // the best way found to start a line at a word, per fitness class (and
  // whether it's the paragraph's first line, which is narrower)
  let active: Node[] = [{ at: 0, first: true, fitness: 1, demerits: 0, prev: null }];
  let ends: Node[] = [];
  for (let j = 1; j <= n; j++) {
    const found = new Map<string, Node>();
    const keep: Node[] = [];
    for (const a of active) {
      const s = shapeOf(a.at, j);
      const w = a.first ? firstWidth : width;
      const last = j === n;
      const single = j - a.at === 1;
      const ratio = last && s.natural <= w ? 0 // a paragraph's last line keeps its natural spacing
        : spread(s, w, size, spaceW).ratio;
      let demerits: number;
      if (ratio < -1) {
        if (!single) continue; // too tight: this start can't reach j, nor anything after it
        demerits = a.demerits + 1e7; // one word wider than the column: it gets a line of its own
      } else {
        keep.push(a);
        // past the budget, every extra share of it costs more: a loose
        // line is sometimes the least bad choice in a narrow column, but a
        // lone word that can't be spread at all is the worst of all
        const over = Math.max(0, ratio - LOOSE);
        const badness = 100 * Math.min(Math.abs(ratio), LOOSE) ** 3 + (over ? 2_000 + 4_000 * over : 0)
                        + (single && !last ? 40_000 : 0);
        demerits = a.demerits + (10 + badness) ** 2;
        if (a.prev && Math.abs(fitnessOf(ratio) - a.fitness) > 1) demerits += 3_000; // tight right after loose
        // a paragraph ending in one short word alone on its line
        if (last && single && !a.first && words[a.at].width < 0.2 * w) demerits += 5_000;
      }
      const fitness = fitnessOf(ratio);
      const key = String(fitness);
      const best = found.get(key);
      if (!best || demerits < best.demerits) found.set(key, { at: j, first: false, fitness, demerits, prev: a });
    }
    active = keep;
    if (j === n) ends = [...found.values()];
    else active.push(...found.values());
  }
  const best = ends.sort((a, b) => a.demerits - b.demerits)[0];
  const starts: number[] = [];
  for (let node: Node | null = best?.prev ?? null; node; node = node.prev) starts.push(node.at);
  return starts.reverse();
}
