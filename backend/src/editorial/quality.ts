// What every piece of copy must pass before it can be printed, whoever wrote
// it (the day's rewrite, a length on the ladder, a copy's rewording):
//   - it doesn't say the same thing twice (a release stretched past its facts
//     is restated in other words: 23 Oct, copy 3, a short release 13 times);
//   - the paper's own fonts can print every letter of it (Gopika has no "ૅ",
//     nor some joins: they'd fall back to a system font).
import { BharatiEncoder } from "../fonts/bharati.ts";
import { profile } from "../profile.ts";

/** The sentences of a text, each as its set of words (short words aside). */
const sentenceWords = (body: string) => body.split(/(?<=[.!?।])\s+|\n+/)
  .map((s) => new Set(s.split(/\s+/).filter((w) => w.length > 2)))
  .filter((s) => s.size >= 6);

/** Does a story say the same thing twice? Two sentences sharing most of
 * their words. */
export function repeats(body: string): boolean {
  const sentences = sentenceWords(body);
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      const a = sentences[i], b = sentences[j];
      let both = 0;
      for (const w of a) if (b.has(w)) both++;
      // of about the same length and mostly the same words: said twice (a
      // short sentence inside a long one, or a long name shared, isn't)
      if (both / Math.max(a.size, b.size) >= 0.5) return true;
    }
  }
  return false;
}

/** Can the paper's own fonts print this text? (A legacy-encoded paper's
 * encoder sets every letter; a Unicode paper's fonts are checked by gate F.) */
let encoder: BharatiEncoder | null | undefined;
export function settable(text: string): boolean {
  if (encoder === undefined) {
    const legacy = Object.values(profile.fonts).some((f) => f.encoding === "bharati");
    try { encoder = legacy ? new BharatiEncoder() : null; } catch { encoder = null; }
  }
  // (English letters and digits are set in the paper's English font, not the legacy one)
  return !encoder || encoder.encode(text).unknown.every((u) => /^[\x00-\x7F -⁯]+$/.test(u));
}

/** Word count. */
export const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;
