// Unicode Gujarati -> the legacy Bharati (Gopika) glyph encoding, so text can
// be set in the paper's own fonts. Those fonts predate Unicode: each code is a
// glyph shape, in visual order -- the i-sign typed before its consonant, the
// reph after its syllable, conjuncts as single ligature codes or half forms.
//
// Two sources, from publications/<paper>/fonts/bharati.json (written by
// scripts/replica/bharati_learn.py):
//   - syllables: how the paper's own typesetters spelled every syllable they
//     printed (620 of them on 8 August), used first -- it includes their
//     choice among variant glyphs;
//   - table: the decoder's glyph table (scripts/replica/bharati_decode.py),
//     whose rules run backwards for syllables the paper never printed.
// Anything that can't be encoded is reported, never silently replaced.
import { readFileSync } from "node:fs";
import { profilePath } from "../profile.ts";

type Kind = "half" | "cons" | "ya" | "stem" | "mod" | "sign" | "nas" | "vowel" | "reph" | "pre" | "other";
interface Data {
  table: Record<string, [Kind, string | [string, string] | [string, string, boolean]]>;
  syllables: Record<string, { codes: string; count: number }>;
}

const C = "ક-હ"; // consonants
const SYLLABLE = new RegExp(
  `[${C}]઼?(?:્[${C}]઼?)*્?[ા-ૌ]*[ઁ-ઃ]?` + // consonant syllable
  `|[અ-ઔ][ા-ૌ]*[ઁ-ઃ]?` + // independent vowel
  `|[\\s\\S]`, "gu"); // anything else, one character

const GUJ_DIGITS = "૦૧૨૩૪૫૬૭૮૯";
const OTHER_OUT: Record<string, string> = {
  "×": '"', "‘": "'", "’": "’", "'": "’", "“": "“", "”": "”", "•": "•", "–": "–", "—": "—",
  "ઃ": ":", // the font has no visarga; its colon is the same two dots
};
const VOWELS: Record<string, string> = { "આ": "ા", "એ": "ે", "ઐ": "ૈ", "ઓ": "ો", "ઔ": "ૌ", "ઑ": "ૉ" };
// signs made of two glyphs: ો = ા + ે
const SIGN_SPLIT: Record<string, string[]> = { "ો": ["ા", "ે"], "ૌ": ["ા", "ૈ"], "ોં": ["ા", "ેં"] };

export interface Encoded { text: string; unknown: string[] }

export class BharatiEncoder {
  private learned: Map<string, string>;
  private full = new Map<string, string>(); // consonant / ligature -> code
  private half = new Map<string, string>(); // "ક્" -> code
  private signs = new Map<string, string>(); // vowel sign -> code
  private nasal = new Map<string, string>();
  private vowels = new Map<string, string>(); // independent vowel -> code
  private withSign = new Map<string, string>(); // "જા" -> code (consonant ligatures carrying a sign)
  private pre: { plain: string; nasal: string; reph: string; both: string };
  private mods = new Map<string, string>(); // "્ર", "્ય", "્"
  private stem = "k";
  private reph = "o";
  private rephNasal = "O";

  constructor(file = profilePath("fonts/bharati.json")) {
    const data: Data = JSON.parse(readFileSync(file, "utf8"));
    this.learned = new Map(Object.entries(data.syllables).map(([u, v]) => [u, v.codes]));
    // how often each code is used: among equivalent codes, prefer the paper's usual one
    const freq = new Map<string, number>();
    for (const v of Object.values(data.syllables)) for (const ch of v.codes) freq.set(ch, (freq.get(ch) ?? 0) + v.count);
    const better = (map: Map<string, string>, key: string, code: string) => {
      const have = map.get(key);
      if (!have || (freq.get(code) ?? 0) > (freq.get(have) ?? 0)) map.set(key, code);
    };
    let pre = { plain: "r", nasal: "®", reph: "Š", both: "‹" };
    for (const [code, [kind, val]] of Object.entries(data.table)) {
      if (kind === "cons" && typeof val === "string") better(this.full, val, code);
      else if (kind === "cons" && Array.isArray(val)) better(this.withSign, val[0] + val[1], code);
      else if (kind === "half" && typeof val === "string") better(this.half, val, code);
      else if (kind === "sign" && typeof val === "string") better(this.signs, val, code);
      else if (kind === "nas" && typeof val === "string") better(this.nasal, val, code);
      else if (kind === "vowel" && typeof val === "string") better(this.vowels, val, code);
      else if ((kind === "mod" || kind === "ya") && typeof val === "string") better(this.mods, val, code);
      else if (kind === "stem") this.stem = code;
      else if (kind === "reph") (typeof val === "string" && val.endsWith("ં") ? (this.rephNasal = code) : (this.reph = code));
      else if (kind === "pre" && Array.isArray(val)) {
        const [, nas, rp] = val as [string, string, boolean];
        const slot = nas && rp ? "both" : nas ? "nasal" : rp ? "reph" : "plain";
        if ((freq.get(code) ?? 0) >= (freq.get(pre[slot]) ?? 0)) pre = { ...pre, [slot]: code };
      }
    }
    this.pre = pre;
    if (!this.nasal.has("ઃ")) this.nasal.set("ઃ", ":");
  }

  /** Encode Unicode text. Latin letters are reported: they belong in a Latin font run. */
  encode(text: string): Encoded {
    let out = "";
    const unknown: string[] = [];
    for (const syl of text.normalize("NFC").match(SYLLABLE) ?? []) {
      const got = this.syllable(syl);
      if (got === null) {
        unknown.push(syl);
        out += syl;
      } else {
        out += got;
      }
    }
    return { text: out, unknown };
  }

  private syllable(u: string): string | null {
    const learned = this.learned.get(u);
    if (learned) return learned;
    if (/^\s$/.test(u)) return u;
    const d = GUJ_DIGITS.indexOf(u);
    if (d >= 0) return String(d);
    if (OTHER_OUT[u]) return OTHER_OUT[u];
    // the font has no rupee sign; Gujarati papers write રૂ.
    if (u === "₹") return this.encode("રૂ.").text;
    if (/^[\x20-\x40\x5B-\x60\x7B-\x7E]$/.test(u) && !/[A-Za-z]/.test(u)) return u; // ASCII punctuation, digits
    if (/^[અ-ઔ]/.test(u)) return this.vowelSyllable(u);
    if (/^[ક-હ]/.test(u)) return this.consonantSyllable(u);
    return null;
  }

  private vowelSyllable(u: string): string | null {
    let rest = u;
    let nas = "";
    const m = rest.match(/[ઁ-ઃ]$/);
    if (m) { nas = m[0]; rest = rest.slice(0, -1); }
    const learned = this.learned.get(rest);
    let base: string | null = learned ?? null;
    if (!base) {
      const v = rest[0];
      if (this.vowels.has(v)) base = this.vowels.get(v)!;
      else if (VOWELS[v] && this.vowels.has("અ")) base = this.vowels.get("અ")! + this.signCodes(VOWELS[v]);
      else return null;
      const signs = rest.slice(1);
      if (signs) {
        const s = this.signCodes(signs);
        if (s === null) return null;
        base += s;
      }
    }
    if (!nas) return base;
    const n = this.nasal.get(nas);
    return n === undefined ? null : base + n;
  }

  private signCodes(signs: string): string | null {
    let out = "";
    for (const s of signs.match(/[ા-ૌ][ઁ-ઃ]?/g) ?? []) {
      if (this.signs.has(s)) { out += this.signs.get(s); continue; }
      const parts = SIGN_SPLIT[s];
      if (parts) {
        const codes = parts.map((p) => (p === "ા" ? this.stem : this.signs.get(p)));
        if (codes.some((c) => c === undefined)) return null;
        out += codes.join("");
        continue;
      }
      if (s === "ા") { out += this.stem; continue; }
      if (s.length === 2) { // sign + nasal with no combined glyph
        const a = this.signCodes(s[0]);
        const n = this.nasal.get(s[1]);
        if (a === null || n === undefined) return null;
        out += a + n;
        continue;
      }
      return null;
    }
    return out;
  }

  private consonantSyllable(u: string): string | null {
    // ર્ before a consonant is drawn as the reph over the syllable
    let reph = false;
    let s = u;
    if (/^ર્[ક-હ]/.test(s)) { reph = true; s = s.slice(2); }
    const m = s.match(/^([ક-હ઼્]+?)(્?)([ા-ૌ]*)([ઁ-ઃ]?)$/);
    if (!m) return null;
    let [, cluster, dangling, signs, nas] = m;
    cluster += dangling;
    const nasalMerged = reph && nas === "ં";
    // the paper's own spelling of the syllable without the reph
    const plain = cluster + signs + (nasalMerged ? "" : nas);
    let body = reph ? this.learned.get(plain) ?? null : null;
    if (body === null) {
      const hasI = signs.startsWith("િ");
      const after = hasI ? signs.slice(1) : signs;
      // a consonant ligature that carries its sign (જા, રુ, હૃ)
      let clusterCodes: string | null = null;
      let restSigns = after;
      const last2 = cluster + after.slice(0, 1);
      if (!hasI && after && this.withSign.has(last2)) {
        clusterCodes = this.withSign.get(last2)!;
        restSigns = after.slice(1);
      } else {
        clusterCodes = this.cluster(cluster);
      }
      if (clusterCodes === null) return null;
      const signCodes = restSigns ? this.signCodes(restSigns) : "";
      if (signCodes === null) return null;
      const nasCode = nas && !nasalMerged ? this.nasal.get(nas) : "";
      if (nasCode === undefined) return null;
      if (hasI) {
        // the i-sign goes in front; its glyph also carries nasal and reph
        const preNas = nas === "ં" && !signCodes;
        const code = reph && preNas ? this.pre.both : reph ? this.pre.reph : preNas ? this.pre.nasal : this.pre.plain;
        const taken = reph; // the pre-base glyph drew the reph
        return code + clusterCodes + signCodes + (preNas ? "" : nasCode ?? "") +
               (reph && !taken ? this.reph : "");
      }
      body = clusterCodes + signCodes + (nasCode ?? "");
    }
    if (!reph) return body;
    return body + (nasalMerged ? this.rephNasal : this.reph);
  }

  /** A consonant cluster (ક, સ્ત, ક્ષ, દ્ર) as glyph codes. */
  private cluster(c: string): string | null {
    if (this.learned.has(c)) return this.learned.get(c)!;
    let out = "";
    let rest = c;
    while (rest) {
      // the whole rest as one ligature or consonant
      if (this.full.has(rest)) return out + this.full.get(rest)!;
      // a full consonant followed only by ્ર / ્ય (drawn as marks)
      let matched = false;
      for (const mod of ["્ર", "્ય"]) {
        if (rest.endsWith(mod) && this.mods.has(mod)) {
          const head = rest.slice(0, -mod.length);
          const h = head ? this.cluster(head) : null;
          if (h !== null && head.length <= 2) return out + h + this.mods.get(mod)!;
        }
      }
      // a conjunct with only a half form (જ્ઞ = જ્ઞ્ + stem)
      if (this.half.has(rest + "્")) return out + this.half.get(rest + "્")! + this.stem;
      // longest half form at the front
      for (let len = Math.min(rest.length, 6); len >= 2; len--) {
        const p = rest.slice(0, len);
        if (p.endsWith("્") && this.half.has(p)) {
          out += this.half.get(p)!;
          rest = rest.slice(len);
          matched = true;
          break;
        }
      }
      if (matched) {
        if (!rest) return null; // ends in a half form with nothing after it
        continue;
      }
      // a consonant with only a half form, completed by the stem
      const first = rest.match(/^[ક-હ]઼?/)?.[0];
      if (!first) return null;
      if (rest === first && this.half.has(first + "્")) return out + this.half.get(first + "્")! + this.stem;
      // a full consonant with an explicit virama, then the rest
      if (this.full.has(first) && rest.startsWith(first + "્") && this.mods.has("્")) {
        out += this.full.get(first)! + this.mods.get("્")!;
        rest = rest.slice(first.length + 1);
        continue;
      }
      if (this.full.has(first) && rest === first) return out + this.full.get(first)!;
      return null;
    }
    return out;
  }
}
