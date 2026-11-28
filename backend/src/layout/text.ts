// Story text as the paper prints it, applied to every field just before it's
// laid out (so rewrites, AI fits and briefs all get it):
//   - numbers in the paper's own digits (profile language.digits): a
//     Gujarati paper prints "૧૨૯ જાપાની કંપનીઓ", not "129" in a Latin face;
//     numbers that belong to English ("ATM 2026", "COVID-19") stay Latin;
//   - no doubled spaces, no space before punctuation.
import { profile } from "../profile.ts";
import { wordForWord, type Story } from "../store.ts";

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

/** Characters taken out of the printed text because the paper's font has
 * nothing for them (the build reports them, for the editor). */
export const removed = new Set<string>();

/** Gujarati text as the paper's fonts can print it -- the one door all
 * printed text goes through, whoever wrote it (a release, the AI, a
 * translation, an editor): a letter of a sister script (Punjabi, Hindi) in
 * its Gujarati twin; the signs Gopika lacks (the candra vowels: "ૅ")
 * in their nearest form; anything else outside Gujarati, Latin and common
 * punctuation taken out and reported (24 Oct: a Punjabi "ਲ" in a PIB release
 * was printed in a system font). The degree sign in words: Gopika has none (1 Nov's
 * "૧૧૧.૭૫°" came from a system font), and taken out it would change the number's sense. */
/** Gujarati's vowel signs and their vowels, written alone. */
const FULL_VOWEL: Record<string, string> = { "ા": "આ", "િ": "ઇ", "ી": "ઈ", "ુ": "ઉ", "ૂ": "ઊ", "ૃ": "ઋ", "ે": "એ", "ૈ": "ઐ", "ો": "ઓ", "ૌ": "ઔ" };
function printableGujarati(text: string, lost?: { n: number }): string {
  const CANDRA: Record<string, string> = { "ૅ": "ે", "ૉ": "ો", "ઍ": "એ", "ઑ": "ઓ" };
  const out = devanagariToGujarati(text)
    .replace(/\s*°\s*C\b/g, " ડિગ્રી સેલ્સિયસ").replace(/\s*°\s*F\b/g, " ડિગ્રી ફેરનહીટ").replace(/\s*°/g, " ડિગ્રી")
    // Gurmukhi lines up with Gujarati letter for letter (U+0A00 -> U+0A80)
    .replace(/[\u0A00-\u0A7F]/g, (c) => { const g = String.fromCodePoint(c.codePointAt(0)! + 0x80); return /\p{Cn}/u.test(g) ? c : g; })
    .replace(/[ૅૉઍઑ]/g, (c) => CANDRA[c])
    // a vowel sign on an English letter ("Keshyepે", 2 Nov): no font joins them -- the vowel itself
    .replace(/(?<=[A-Za-z0-9])[\u0ABE-\u0ACC]/g, (c) => FULL_VOWEL[c] ?? "")
    // a halant ending a word ("કાર્યરત્", 24 Oct): Gopika has no such form, and
    // Gujarati papers print the word without it
    .replace(/([\u0A95-\u0AB9])\u0ACD(?=[^\u0A80-\u0AFF\u200C\u200D]|$)/g, "$1");
  return out.replace(/[^\u0A80-\u0AFF\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u2000-\u206F\u20B9\u0964\u0965\u200C\u200D]/gu, (c) => {
    if (lost) lost.n++; else removed.add(c);
    return "";
  });
}

/** How many of `text`'s letters printing would take out (none to print them with), not reported:
 * a story losing a word's worth is left out (build.ts), never printed with words cut short. */
export function lettersLost(text: string): number {
  const lost = { n: 0 };
  printableGujarati(text, lost);
  return lost.n;
}

/** Words that make a report a news outlet's (or the media's in general): "હિન્દુસ્તાન ટાઈમ્સના અહેવાલ
 * મુજબ", "મીડિયા અહેવાલો અનુસાર" -- not a named body's own report ("વર્લ્ડ બેંકના અહેવાલ મુજબ" is the news). */
const MEDIA = /મીડિયા|ન્યૂઝ|ન્યુઝ|ટાઈમ્સ|ટાઇમ્સ|એક્સપ્રેસ|હિંદુ|હિન્દુ|એજન્સી|ચેનલ|ટીવી|અખબાર|સમાચાર|રોઇટર્સ|રોયટર્સ|બીબીસી|સીએનએન|પીટીઆઈ|પીટીઆઇ|આઈએએનએસ|એએનઆઈ|બ્લૂમબર્ગ|બ્લુમબર્ગ|મિન્ટ|સંદેશ|ભાસ્કર|ગાર્ડિયન|પોસ્ટ|હેરાલ્ડ|ટ્રિબ્યુન|ક્રોનિકલ|જર્નલ|ડેક્કન|ઈકોનોમિક|ઇકોનોમિક|બિઝનેસ|સીએનબીસી|એનડીટીવી|વેબસાઇટ|પોર્ટલ|ટુડે|આજ તક|આજતક|એબીપી|અસ્મિતા|ઉજાલા|જાગરણ|દેશગુજરાત|રેડિયો|આકાશવાણી|દૂરદર્શન|ઝી |દિવ્ય|ફર્સ્ટપોસ્ટ|વાયર|\b(?:PTI|ANI|IANS|Reuters|BBC|CNN|NDTV|Aaj Tak|India Today|ABP|News|Times|Express|Hindu|Mint|Bloomberg|AIR|Standard|Today|Post|Journal|Herald|Tribune|Wire|Scroll|Print|Mirror|Chronicle|Telegraph|Guardian)\b|વિકિપીડિયા|Wikipedia|ટ્રિબ્યુન|સ્ટાન્ડર્ડ|યોર્ક|દેશ ગુજરાત|ઇન્ડિપેન્ડન્ટ|ઈન્ડિપેન્ડન્ટ|ઉજલા|Independent/;
/** A report or article no one is named for: the text the story was written from. */
const GENERIC = /^(?:આ|એક|એ|તે|કેટલાક|વિવિધ|સ્થાનિક|પ્રારંભિક|પ્રાથમિક|તાજા|તાજેતરના|અન્ય|બીજા|અગાઉના|વધુ|શરૂઆતી|શરૂઆતના|આધારભૂત|વિશ્વસનીય|સૂત્રોના|મળતા)$/;
const REPORT = "(?:અહેવાલ|અહેવાલો|રિપોર્ટ|રિપોર્ટ્સ|લેખ)";
const LEADING = new RegExp(`(^|[.!?।:,]\\s*|\\n)((?:[^\\s,.।:]+\\s+){0,7}?)${REPORT}(?:ના|ની|માં)?\\s+(?:જણાવ્યા\\s+)?(?:મુજબ|અનુસાર|પ્રમાણે)\\s*,?\\s*`, "gu");
/** "આ અહેવાલમાં જણાવાયું છે કે ...": the rest of the sentence, said by the paper. */
const SAYS_THAT = new RegExp(`(^|[.!?।:]\\s*|\\n)((?:[^\\s,.।:]+\\s+){0,7}?)${REPORT}(?:(?:ો)?માં\\s+જણાવ(?:ાયું|વામાં આવ્યું)\\s+(?:છે|હતું)|\\s+જણાવે\\s+છે)\\s+કે\\s*,?\\s*`, "gu");
/** "... ઘટનામાં અહેવાલો મુજબ ૨૪ લોકોનાં મોત": reports no one is named for, in the middle of a sentence. */
const BARE = /(^|[^\S\n]+)((?:[\p{L}\p{M}]+[^\S\n]+)?)(?:મીડિયા\s+)?અહેવાલો\s+(?:મુજબ|અનુસાર)\s*,?\s*/gu;
const SAID_IN = new RegExp(`\\s+હોવાન(?:ું|ો)(?:\\s+પણ)?\\s+((?:[^\\s,.।]+\\s+){0,4}?)${REPORT}(?:ો)?માં\\s+(?:જણાવ(?:ાયું|વામાં આવ્યું)|ઉલ્લેખ)\\s+છે`, "gu");
const AS_SAID = new RegExp(`\\s*,?\\s+તેમ\\s+((?:[^\\s,.।]+\\s+){0,4}?)${REPORT}(?:ો)?માં\\s+જણાવ(?:ાયું|વામાં આવ્યું)\\s+(?:છે|હતું)`, "gu");
const fromTheSource = (words: string) => {
  const w = words.trim().split(/\s+/).filter(Boolean);
  return !w.length || w.every((x) => GENERIC.test(x)) || MEDIA.test(words);
};

/** A story never points at the text it was written from, or at other papers (28 Nov, the developer: "remove the
 * writing that refers to another articles like 'according to this article', as real papers don't do that"):
 * "X ના અહેવાલ મુજબ, ..." -> "...", "... થયો હોવાનું અહેવાલમાં જણાવાયું છે" -> "... થયો છે". A named body's own
 * report (the World Bank's, a ministry's) is news, and stays. */
export function withoutSourceTalk(text: string): string {
  if (!/અહેવાલ|રિપોર્ટ|લેખ/.test(text)) return text;
  return text
    .replace(LEADING, (all, start: string, words: string) => (fromTheSource(words) ? start : all))
    .replace(SAYS_THAT, (all, start: string, words: string) => (fromTheSource(words) ? start : all))
    // (a word owning the reports, "ટીવીના અહેવાલો", is a named one: left to the rules above)
    .replace(BARE, (all, space: string, word: string) => (/(?:ના|ની|નાં)\s*$/u.test(word) ? all : `${space}${word}`))
    .replace(SAID_IN, (all, words: string) => (fromTheSource(words) ? " છે" : all))
    .replace(AS_SAID, (all, words: string) => (fromTheSource(words) ? "" : all));
}

export function normalizeText(text: string): string {
  const digits = DIGITS[profile.language.digits];
  // no zero-width spaces (no font draws them); in Gujarati, a Devanagari
  // danda (। ॥, a quoted verse) ends the sentence as Gujarati prose does: "."
  // (nor an Aavtikal figure's place, "[[fig 2]]", printed as words: 28 Nov's copies; a paragraph of it alone goes)
  let out = text.replace(/\u200b/g, "");
  if (/વિકિપીડિયા|Wikipedia/.test(out)) out = out.replace(/(?:વિકિપીડિયા|Wikipedia)[^,.\n।]{0,50}?(?:મુજબ|અનુસાર)\s*,?\s*/g, "");
  if (out.includes("[[")) out = out.replace(/\n*[ \t]*\[\[[^\]\n]*\]\][ \t]*(?=\n|$)/g, "").replace(/\[\[[^\]\n]*\]\]\s*/g, "").replace(/^\s+/, "");
  if (profile.language.lang === "gu") out = printableGujarati(out).replace(/\s*॥\s*/g, ". ").replace(/\s*।\s*/g, ". ").replace(/\. +$/, ".");
  // a translation's stray full-width stop ("。", 24 Oct: set in a system font): the paper's own
  out = out.replace(/\s*。\s*/g, ({ hi: "। ", ur: "۔ " } as Record<string, string>)[profile.language.lang] ?? ". ").replace(/ +$/, "");
  // the Urdu face has no rupee sign: the word, as Urdu papers write it
  if (profile.language.lang === "ur") out = out.replace(/₹\s*/g, "روپے ");
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
  // (the editor's own words as he gave them; everyone else's without talk of their sources)
  const own = wordForWord(s);
  const t = (x: string) => normalizeText(own ? x : withoutSourceTalk(x));
  return {
    ...s,
    kicker: t(s.kicker ?? ""), headline: t(s.headline ?? ""), deck: t(s.deck ?? ""),
    caption: normalizeText(s.caption ?? ""),
    bodies: { long: t(s.bodies.long), medium: t(s.bodies.medium), short: t(s.bodies.short) },
  };
}
