// Story text as the paper prints it, applied to every field just before it's
// laid out (so rewrites, AI fits and briefs all get it):
//   - numbers in the paper's own digits (profile language.digits): a
//     Gujarati paper prints "૧૨૯ જાપાની કંપનીઓ", not "129" in a Latin face;
//     numbers that belong to English ("ATM 2026", "COVID-19") stay Latin;
//   - no doubled spaces, no space before punctuation.
import { profile } from "../profile.ts";
import type { Story } from "../store.ts";

const DIGITS: Record<string, string> = { gujarati: "૦૧૨૩૪૫૬૭૮૯", "arabic-indic": "۰۱۲۳۴۵۶۷۸۹", latin: "0123456789" };
const LATIN_WORD = /^[A-Za-z][A-Za-z.&'’-]*$/;

/** A number written in Latin digits: keep it so when it's part of English
 * (joined to Latin letters, or next to an English word). */
function belongsToEnglish(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (/[A-Za-z]-?$/.test(before) || /^-?[A-Za-z]/.test(after)) return true;
  const prevWord = before.trimEnd().split(/\s+/).pop() ?? "";
  const nextWord = after.trimStart().split(/\s+/)[0] ?? "";
  // only when the space-separated neighbour is a whole English word
  return before !== before.trimEnd() && LATIN_WORD.test(prevWord.replace(/[,:;(]$/, ""))
    || after !== after.trimStart() && LATIN_WORD.test(nextWord.replace(/[,.:;)]$/, ""));
}

/** Devanagari (a Sanskrit verse, a Hindi name) in Gujarati script, as
 * Gujarati papers print it: the two Unicode blocks line up letter for
 * letter (U+0900 -> U+0A80); the danda (।, ॥) is shared and stays. Letters
 * Gujarati lacks (ऩ ऱ ऴ, the nukta forms) fall back to their base letter. */
export function devanagariToGujarati(text: string): string {
  const BASE: Record<string, string> = { "ऩ": "न", "ऱ": "र", "ऴ": "ळ", "क़": "क", "ख़": "ख", "ग़": "ग", "ज़": "ज", "ड़": "ड", "ढ़": "ढ", "फ़": "फ", "य़": "य" };
  return text.normalize("NFC").replace(/[\u0900-\u097F]/g, (c) => {
    const ch = BASE[c] ?? c;
    const code = ch.codePointAt(0)!;
    if (code === 0x0964 || code === 0x0965) return ch; // danda, double danda
    if (code === 0x093c) return ""; // nukta
    const g = String.fromCodePoint(code + 0x180);
    return /\p{Cn}/u.test(g) ? ch : g; // a slot Gujarati leaves empty: keep it (reported as unsettable)
  });
}

export function normalizeText(text: string): string {
  const digits = DIGITS[profile.language.digits];
  let out = profile.language.lang === "gu" ? devanagariToGujarati(text) : text;
  if (digits && digits !== DIGITS.latin) {
    out = out.replace(/\d+/g, (num, offset: number) => {
      // the whole number, e.g. "1800-233-0222", "2025-26" or "98256 08744"
      // (digit groups split by single spaces): decided once for all of it
      const s = out.slice(0, offset).search(/(?:\d[\d.,:/ -]*)?$/);
      const tokenStart = s < 0 ? offset : s;
      const tokenEnd = offset + num.length + (out.slice(offset + num.length).match(/^(?:[\d.,:/-]| (?=\d))*\d/)?.[0].length ?? 0);
      return belongsToEnglish(out, tokenStart, tokenEnd) ? num : num.replace(/\d/g, (d) => digits[Number(d)]);
    });
  }
  return out
    .replace(/[ \t ]+/g, " ")
    .replace(/ +([,.;:!?।)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/ *\n */g, "\n");
}

/** Every printed field of a story, normalised. */
export function normalizeStory(s: Story): Story {
  return {
    ...s,
    kicker: normalizeText(s.kicker ?? ""), headline: normalizeText(s.headline ?? ""), deck: normalizeText(s.deck ?? ""),
    caption: normalizeText(s.caption ?? ""),
    bodies: { long: normalizeText(s.bodies.long), medium: normalizeText(s.bodies.medium), short: normalizeText(s.bodies.short) },
  };
}
