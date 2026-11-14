// A title-and-footer PDF's dates and issue number changed to the day the paper carries: a sister
// paper's frame (export/frame.ts; the developer, 5 Nov: "auto date update in the title for intended
// date") and a copy's paper's design (export/designs.ts; 6 Nov: "titles given from outside ... date
// gets automatically adjusted and the aank number also").
//
// Found in the text as the papers write it, in English or in the old Gujarati font code (Bharati /
// Gopika, as their CorelDRAW and PageMaker pages are typed): "તારીખ : 03-11-2026, મંગળવાર",
// "Date : 03-11-2026", "Thursday, 05 November, 2026"; the issue number after "અંક" or "Issue No.",
// counted on a day at a time from the date the PDF is written for. Every date within a year of the
// day is the paper's (an RNI number's year is never near it). The new text keeps the old one's
// place: everything after it on the line stays exactly where it was. A design's fonts are subsets
// that hold only the letters it already uses: a date that needs others is written in the same font
// whole, found among the computer's fonts (the developer, 6 Nov: "the date and day's typography
// looks odd" in another), else in the app's own Gopika (the same family) or a standard font of its kind.
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, StandardFontEmbedder,
  StandardFonts, type PDFPage,
} from "pdf-lib";
import { publicationDir } from "../config.ts";
import { BharatiEncoder } from "../fonts/bharati.ts";
import { embedTrueType, readTtf, WIN_HIGH } from "./pdf-editable.ts";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const GU_DAYS = ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"];
// "Thursday, 05 November, 2026", "05 November 2026"
const WORDS = new RegExp(`(?:(${DAYS.join("|")})(,?\\s*))?(\\d{1,2})(\\s+)(${MONTHS.join("|")})(,?\\s*)(\\d{4})`, "g");
// "Issue No. 65", "અંક : 019" (old font code "ytf"), "અંક નં. 19"
const ISSUE = /(Issue\s*No\.?\s*:?\s*|ytf\s*(?:™t\.?)?\s*[:\-–]?\s*)(\d+)/g;
const NEAR = 400;
// the old Gujarati fonts a paper's title is set in: a date they can't draw is written in the app's Gopika
const GUJARATI_FONT = /bharati|gopika|title|saumil|shruti|krishna|maruti|ajuba|harikrishna|lmg|gujarati|ghanshyam|avantika|terafont/i; // days: a date this near the paper's day is its own

const DAY_MS = 86_400_000;
const utc = (y: number, m: number, d: number) => {
  const t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? t : NaN;
};

// ---- dates with their weekdays, and weekdays on their own (the developer, 6 Nov: "do it for the day also")
interface Days { numeric: RegExp; alone: RegExp; english(day: string): boolean; gujarati(dow: number): string }
let known: Days | null = null;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
function daysOf(): Days {
  if (known) return known;
  // (the Gujarati paper's own learned spellings: Capital Kranti's, whatever paper is open)
  const file = path.join(publicationDir("capital-kranti"), "fonts", "bharati.json");
  const encoder = new BharatiEncoder(file);
  // each typist types a letter whole or as its half and the stem ("„" or "øk" for ગ): either is the letter
  const table = (JSON.parse(readFileSync(file, "utf8")) as { table: Record<string, [string, unknown]> }).table;
  const consOf = new Map<string, string>(), whole = new Map<string, string[]>(), half = new Map<string, string[]>();
  for (const [code, [kind, v]] of Object.entries(table)) {
    if (typeof v !== "string") continue;
    if (kind === "cons") { consOf.set(code, v); whole.set(v, [...(whole.get(v) ?? []), code]); }
    else if (kind === "half" && v.endsWith("્")) half.set(v.slice(0, -1), [...(half.get(v.slice(0, -1)) ?? []), code]);
  }
  const typed = (word: string) => [...encoder.encode(word).text].map((c) => {
    const x = consOf.get(c);
    return x ? `(?:${[...(whole.get(x) ?? []), ...(half.get(x) ?? []).map((h) => h + "k")].map(esc).join("|")})` : esc(c);
  }).join("");
  const day = `(?:${DAYS.join("|")}|${DAYS.map((d) => d.toUpperCase()).join("|")}|${[...GU_DAYS, "ગુરૂવાર"].map(typed).join("|")})`;
  return (known = {
    // "03-11-2026", "3/11/2026", "03.11.2026", with its weekday after it or before it if it has one
    numeric: new RegExp(`(?:(${day})(,?\\s*))?(?<![\\d/.\\-])(\\d{1,2})([-/.])(\\d{1,2})\\4(\\d{4})(?![\\d/])(?:(,?\\s*)(${day}))?`, "g"),
    // "Tuesday", "મંગળવાર" on its own
    alone: new RegExp(`(?<![A-Za-z])${day}(?![a-z])`, "g"),
    english: (w) => DAYS.some((d) => d.toLowerCase() === w.toLowerCase()),
    gujarati: (dow) => encoder.encode(GU_DAYS[dow]).text,
  });
}
/** The weekday of `target` written as `was` was: Gujarati, English, or English in capitals. */
const dayAs = (was: string | undefined, target: number) => {
  if (!was) return "";
  const dow = new Date(target).getUTCDay(), d = daysOf();
  return !d.english(was) ? d.gujarati(dow) : was === was.toUpperCase() ? DAYS[dow].toUpperCase() : DAYS[dow];
};

// ---- the PDF's text: WinAnsi bytes <-> Unicode, literal strings
const FROM_WIN = new Map(Object.entries(WIN_HIGH).map(([u, c]) => [c, Number(u)]));
const fromWin = (b: number) => FROM_WIN.get(b) ?? b;
const toWin = (u: number): number | null => (u < 0x80 || (u >= 0xa0 && u <= 0xff) ? u : WIN_HIGH[u] ?? null);
const unlit = (s: string) => s.replace(/\\(?:([0-7]{1,3})|(\r\n|\r|\n)|([\s\S]))/g, (_, oct: string, nl: string, ch: string) =>
  oct ? String.fromCharCode(parseInt(oct, 8) & 0xff) : nl ? "" : ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[ch] ?? ch);
const unhex = (h: string) => { const c = h.replace(/\s/g, ""); return (c.length % 2 ? c + "0" : c).replace(/../g, (x) => String.fromCharCode(parseInt(x, 16))); };
const lit = (bytes: number[]) => `(${String.fromCharCode(...bytes).replace(/([()\\])/g, "\\$1").replace(/\r/g, "\\r").replace(/\n/g, "\\n")})`;
const num = (v: number) => String(Math.round(v * 1000) / 1000);

type StdName = Parameters<typeof StandardFontEmbedder.for>[0];
// the standard fonts a PDF may name without carrying them
const STANDARD: Record<string, StandardFonts> = {
  "Times-Roman": StandardFonts.TimesRoman, "Times-Bold": StandardFonts.TimesRomanBold, "Times-Italic": StandardFonts.TimesRomanItalic,
  "Times-BoldItalic": StandardFonts.TimesRomanBoldItalic, Helvetica: StandardFonts.Helvetica, "Helvetica-Bold": StandardFonts.HelveticaBold,
  "Helvetica-Oblique": StandardFonts.HelveticaOblique, "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
  Courier: StandardFonts.Courier, "Courier-Bold": StandardFonts.CourierBold,
};

/** A font the text is shown in: each code's width (thousandths of the size), and whether it can draw it. */
interface Font { base: string; cid: boolean; width(b: number): number; has(b: number): boolean }

function fontOf(dict: PDFDict): Font {
  const name = (k: string) => { const v = dict.lookup(PDFName.of(k)); return v instanceof PDFName ? v.decodeText() : ""; };
  const base = name("BaseFont").replace(/^[A-Z]{6}\+/, "");
  if (name("Subtype") === "Type0") return { base, cid: true, width: () => 0, has: () => false };
  const descriptor = dict.lookup(PDFName.of("FontDescriptor"));
  const widths = dict.lookup(PDFName.of("Widths"));
  const first = (dict.lookup(PDFName.of("FirstChar")) as PDFNumber | undefined)?.asNumber() ?? 0;
  const std = !(descriptor instanceof PDFDict) && STANDARD[base] ? StandardFontEmbedder.for(STANDARD[base] as unknown as StdName) : null;
  const missing = descriptor instanceof PDFDict ? (descriptor.lookup(PDFName.of("MissingWidth")) as PDFNumber | undefined)?.asNumber() ?? 0 : 0;
  const width = (b: number) => {
    if (widths instanceof PDFArray && b >= first && b - first < widths.size()) return (widths.lookup(b - first) as PDFNumber).asNumber();
    if (std) return std.widthOfTextAtSize(String.fromCharCode(fromWin(b)), 1000);
    return missing;
  };
  // what it can draw: a standard font every WinAnsi letter; an embedded TrueType (often a subset) what its map holds
  let has = (b: number) => b >= 0x20;
  if (descriptor instanceof PDFDict) {
    const file = descriptor.lookup(PDFName.of("FontFile2"));
    if (file instanceof PDFRawStream) {
      try {
        // (a symbolic one by its codes as they are, else as WinAnsi letters; a space draws nothing and is there)
        const drawn = readTtf(Buffer.from(decodePDFRawStream(file).decode())).drawn;
        const flags = (descriptor.lookup(PDFName.of("Flags")) as PDFNumber | undefined)?.asNumber() ?? 0;
        has = flags & 4 ? (b) => b === 32 || drawn.has(b) : (b) => b === 32 || drawn.has(fromWin(b));
      } catch { has = () => false; }
    } else if (descriptor.lookup(PDFName.of("FontFile")) || descriptor.lookup(PDFName.of("FontFile3"))) has = () => false;
  }
  return { base, cid: false, width, has };
}

// ---- a design's font whole: the cut-down copy inside it named the same as one of the computer's fonts
// (the app's own first, then the system's: on the paper's PC the Bharati fonts its designs are made in)
let fontIndex: Map<string, string> | null = null;
const plainName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^b?bharati/, "");
const keyOf = (family: string, bold: boolean, italic: boolean) => `${plainName(family)}|${bold ? "b" : ""}${italic ? "i" : ""}`;
function fontFolders(): string[] {
  const home = os.homedir();
  const own = path.join(publicationDir("capital-kranti"), "fonts");
  if (process.platform === "win32") {
    return [own, path.join(process.env.WINDIR ?? "C:\\Windows", "Fonts"),
            ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts")] : [])];
  }
  if (process.platform === "darwin") return [own, "/Library/Fonts", path.join(home, "Library", "Fonts"), "/System/Library/Fonts/Supplemental"];
  return [own, "/usr/share/fonts", path.join(home, ".local", "share", "fonts")];
}
/** The whole font a subset font was cut from (`sub`: its file, `base`: its PDF name), if this computer has it. */
function wholeFont(sub: Buffer, base: string): Buffer | null {
  if (!fontIndex) {
    fontIndex = new Map();
    for (const dir of fontFolders()) {
      let files: string[];
      try { files = readdirSync(dir, { recursive: true }) as string[]; } catch { continue; }
      for (const f of files) {
        if (!/\.ttf$/i.test(f)) continue;
        const file = path.join(dir, f);
        try {
          // (the old Gujarati fonts are small: the big ones are other scripts' and not read)
          if (statSync(file).size > 3_000_000) continue;
          const t = readTtf(readFileSync(file));
          const key = keyOf(t.family, t.bold, t.italic);
          if (t.family && !fontIndex.has(key)) fontIndex.set(key, file);
        } catch { /* not a font it can read */ }
      }
    }
  }
  // its name as the subset gives it, else as the PDF does ("BBharatiGopikaTwo,Bold")
  let t: { family: string; bold: boolean; italic: boolean } | null = null;
  try { t = readTtf(sub); } catch { /* a subset without its names */ }
  const [family, style = ""] = base.split(",");
  const keys = [t?.family ? keyOf(t.family, t.bold, t.italic) : "", keyOf(family, /bold|black|heavy/i.test(style), /italic|oblique/i.test(style))];
  for (const k of keys) {
    const file = k && fontIndex.get(k);
    if (file) { try { return readFileSync(file); } catch { /* gone since */ } }
  }
  return null;
}

/** A string shown: its codes, and the TJ adjustment after each (thousandths of the size). */
interface Piece { at: number; len: number; font: string; size: number; tc: number; tw: number; lead: number; codes: { b: number; kern: number }[] }

const OPS = /\/([^\s/[\]()<>{}%]+)\s+([-\d.]+)\s+Tf\b|([-\d.]+)\s+(Tc|Tw)\b|\b(BT|ET)\b|\(((?:\\[\s\S]|[^\\)])*)\)\s*Tj|<([0-9A-Fa-f\s]*)>\s*Tj|\[((?:\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]*>|[-\d.\s]+)*)\]\s*TJ/g;

/** A content stream's text blocks, each its strings in order. */
function blocksOf(content: string): Piece[][] {
  const blocks: Piece[][] = [];
  let block: Piece[] = [];
  let font = "", size = 0, tc = 0, tw = 0;
  for (let m; (m = OPS.exec(content)); ) {
    if (m[1]) { font = m[1]; size = +m[2]; continue; }
    if (m[4] === "Tc") { tc = +m[3]; continue; }
    if (m[4] === "Tw") { tw = +m[3]; continue; }
    if (m[5] === "BT") { block = []; continue; }
    if (m[5] === "ET") { if (block.length) blocks.push(block); block = []; continue; }
    const piece: Piece = { at: m.index, len: m[0].length, font, size, tc, tw, lead: 0, codes: [] };
    const add = (bytes: string) => { for (const ch of bytes) piece.codes.push({ b: ch.charCodeAt(0), kern: 0 }); };
    if (m[6] !== undefined) add(unlit(m[6]));
    else if (m[7] !== undefined) add(unhex(m[7]));
    else {
      for (const x of m[8].matchAll(/\(((?:\\[\s\S]|[^\\)])*)\)|<([0-9A-Fa-f\s]*)>|([-\d.]+)/g)) {
        if (x[3] !== undefined) {
          const last = piece.codes[piece.codes.length - 1];
          if (last) last.kern += +x[3]; else piece.lead += +x[3];
        } else add(x[1] !== undefined ? unlit(x[1]) : unhex(x[2]));
      }
    }
    block.push(piece);
  }
  return blocks;
}

/** What a block's text says: each date, weekday and issue number, the date it names, and its new text for a day. */
interface Found { kind: "date" | "day" | "issue"; start: number; end: number; date: number; make: (target: number, days: number) => string }

function datesIn(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(daysOf().numeric)) {
    const t = utc(+m[6], +m[5], +m[3]);
    if (Number.isNaN(t)) continue;
    out.push({ kind: "date", start: m.index!, end: m.index! + m[0].length, date: t, make: (target) => {
      const d = new Date(target);
      return `${m[1] ? dayAs(m[1], target) + m[2] : ""}${String(d.getUTCDate()).padStart(m[3].length, "0")}${m[4]}${String(d.getUTCMonth() + 1).padStart(m[5].length, "0")}${m[4]}${d.getUTCFullYear()}${m[8] ? m[7] + dayAs(m[8], target) : ""}`;
    } });
  }
  for (const m of text.matchAll(daysOf().alone)) {
    out.push({ kind: "day", start: m.index!, end: m.index! + m[0].length, date: NaN, make: (target) => dayAs(m[0], target) });
  }
  for (const m of text.matchAll(WORDS)) {
    const t = utc(+m[7], MONTHS.indexOf(m[5]) + 1, +m[3]);
    if (Number.isNaN(t)) continue;
    out.push({ kind: "date", start: m.index!, end: m.index! + m[0].length, date: t, make: (target) => {
      const d = new Date(target);
      const day = String(d.getUTCDate());
      return `${m[1] ? DAYS[d.getUTCDay()] + m[2] : ""}${m[3].length === 2 ? day.padStart(2, "0") : day}${m[4]}${MONTHS[d.getUTCMonth()]}${m[6]}${d.getUTCFullYear()}`;
    } });
  }
  for (const m of text.matchAll(ISSUE)) {
    out.push({ kind: "issue", start: m.index! + m[1].length, end: m.index! + m[0].length, date: NaN,
               make: (_, days) => String(Math.max(1, +m[2] + days)).padStart(m[2].length, "0") });
  }
  // (a date with its weekday wins over the weekday alone)
  return out.sort((a, b) => a.start - b.start || b.end - a.end).filter((f, i, all) => i === 0 || f.start >= all[i - 1].end);
}

/** A content stream and where its fonts are named, with a way to put it back. */
interface Holder { content: string; fonts: PDFDict | undefined; put(content: string): void }

function holdersOf(doc: PDFDocument, page: PDFPage): Holder[] {
  const ctx = doc.context;
  const out: Holder[] = [];
  const fontsOf = (res: unknown) => (res instanceof PDFDict ? res.lookup(PDFName.of("Font")) : undefined) as PDFDict | undefined;
  // the page's own content
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  const parts: string[] = [];
  let readable = true;
  for (const r of refs) {
    const s = r instanceof PDFRef ? ctx.lookup(r) : r;
    try {
      if (s instanceof PDFRawStream) parts.push(Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"));
      else if (s instanceof PDFStream) parts.push(Buffer.from(s.getContents()).toString("latin1"));
      else readable = false;
    } catch { readable = false; }
  }
  const pageRes = page.node.Resources();
  if (readable) out.push({ content: parts.join("\n"), fonts: fontsOf(pageRes),
                           put: (c) => page.node.set(PDFName.of("Contents"), ctx.register(ctx.flateStream(Buffer.from(c, "latin1")))) });
  // its drawings (form XObjects), and theirs
  const seen = new Set<string>();
  const forms = (res: unknown, depth: number) => {
    const xs = res instanceof PDFDict ? res.lookup(PDFName.of("XObject")) : undefined;
    if (!(xs instanceof PDFDict) || depth > 3) return;
    for (const [, ref] of xs.entries()) {
      if (!(ref instanceof PDFRef) || seen.has(ref.toString())) continue;
      seen.add(ref.toString());
      const s = ctx.lookup(ref);
      if (!(s instanceof PDFRawStream) || (s.dict.lookup(PDFName.of("Subtype")) as PDFName | undefined)?.decodeText() !== "Form") continue;
      let content: string;
      try { content = Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"); } catch { continue; }
      const own = s.dict.lookup(PDFName.of("Resources")) ?? res;
      out.push({ content, fonts: fontsOf(own), put: (c) => {
        const fresh = ctx.flateStream(Buffer.from(c, "latin1"));
        for (const [k, v] of s.dict.entries()) if (!["Filter", "DecodeParms", "Length"].includes(k.decodeText())) fresh.dict.set(k, v);
        ctx.assign(ref, fresh);
      } });
      forms(own, depth + 1);
    }
  };
  forms(pageRes, 0);
  return out;
}

/** `pdf` with its dates changed to `date` (the day the paper carries, ISO) and its issue numbers
 * counted on from the date it was written for, or `issue` when given (the editor's, Copies' "date and
 * અંક", 14 Nov); how many it changed, that date, and the issue number it now carries (null: none). */
export async function redate(pdf: Uint8Array, date: string, opts: { issue?: number } = {}):
  Promise<{ pdf: Uint8Array; changed: number; written: string | null; issue: number | null }> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const target = Date.parse(`${date}T00:00:00Z`);
  const holders = doc.getPages().flatMap((p) => holdersOf(doc, p));
  const blocks = holders.map((h) => blocksOf(h.content));
  // each block's text, and what it says
  const fontCache = new Map<PDFDict | undefined, Map<string, Font | null>>();
  const fontIn = (h: Holder, name: string): Font | null => {
    let byName = fontCache.get(h.fonts);
    if (!byName) fontCache.set(h.fonts, (byName = new Map()));
    if (!byName.has(name)) {
      const d = h.fonts?.lookup(PDFName.of(name));
      byName.set(name, d instanceof PDFDict ? fontOf(d) : null);
    }
    return byName.get(name)!;
  };
  const textOf = (h: Holder, block: Piece[]) => block.map((p) => (fontIn(h, p.font)?.cid ? "\u0000".repeat(p.codes.length)
    : String.fromCharCode(...p.codes.map((c) => fromWin(c.b))))).join("");
  const found = holders.map((h, i) => blocks[i].map((b) => datesIn(textOf(h, b)).filter((f) => f.kind !== "date" || Math.abs(f.date - target) <= NEAR * DAY_MS)));
  // the date it's written for: its first
  const first = found.flat(2).find((f) => f.kind === "date");
  const days = first ? Math.round((target - first.date) / DAY_MS) : 0;
  // the issue number it carries now: the editor's, else its first counted on
  const firstIssue = holders.flatMap((h, hi) => blocks[hi].flatMap((b, bi) => found[hi][bi].filter((f) => f.kind === "issue").map((f) => textOf(h, b).slice(f.start, f.end))))[0];
  const issue = opts.issue ?? (firstIssue ? Math.max(1, +firstIssue + days) : null);

  // fonts of the app's own to write in where a design's can't (each once)
  const embedded = new Map<string, { ref: PDFRef; width(u: number): number; encode(s: string): number[] | null }>();
  const gopika = (base: string) => /light/i.test(base) ? "gopika-light-two-regular.ttf" : /bold.*italic|italic.*bold/i.test(base) ? "gopika-two-bolditalic.ttf"
    : /bold|title|black|heavy/i.test(base) ? "gopika-two-bold.ttf" : "gopika-two-regular.ttf";
  const standardFor = (base: string) => /times|serif|tinos/i.test(base) ? (/bold/i.test(base) ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman)
    : /bold|black|heavy/i.test(base) ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
  const stand = (base: string) => {
    const key = GUJARATI_FONT.test(base) ? gopika(base) : standardFor(base);
    let got = embedded.get(key);
    if (!got) {
      if (key.endsWith(".ttf")) {
        const e = embedTrueType(doc, readFileSync(path.join(publicationDir("capital-kranti"), "fonts", key)));
        got = { ref: e.ref, width: (u) => ((e.ttf.advance.get(u) ?? 0) * 1000) / e.ttf.upm,
                encode: (s) => { const out = [...s].map((ch) => e.code.get(ch.codePointAt(0)!)); return out.every((x) => x !== undefined) ? out as number[] : null; } };
      } else {
        const std = StandardFontEmbedder.for(key as unknown as StdName);
        got = { ref: doc.embedStandardFont(key as StandardFonts).ref, width: (u) => std.widthOfTextAtSize(String.fromCharCode(u), 1000),
                encode: (s) => { const out = [...s].map((ch) => toWin(ch.codePointAt(0)!)); return out.every((x) => x !== null) ? out as number[] : null; } };
      }
      embedded.set(key, got);
    }
    return got;
  };
  // a design's font with its whole file in place of the subset's: for the new text alone, the rest left as it was
  const wholes = new Map<PDFDict, { ref: PDFRef; width(b: number): number; has(b: number): boolean } | null>();
  const wholeOf = (dict: PDFDict, base: string) => {
    if (wholes.has(dict)) return wholes.get(dict)!;
    let got: { ref: PDFRef; width(b: number): number; has(b: number): boolean } | null = null;
    try {
      const descriptor = dict.lookup(PDFName.of("FontDescriptor"));
      const file = descriptor instanceof PDFDict ? descriptor.lookup(PDFName.of("FontFile2")) : undefined;
      const bytes = descriptor instanceof PDFDict && file instanceof PDFRawStream ? wholeFont(Buffer.from(decodePDFRawStream(file).decode()), base) : null;
      if (bytes && descriptor instanceof PDFDict) {
        const ttf = readTtf(bytes);
        // a Unicode font is shown as WinAnsi letters (the subset may have been a symbolic one, by its codes);
        // its few codes WinAnsi has nothing for by their own names
        const unicode = ttf.advance.has(0x2122) || [...ttf.advance.keys()].some((u) => u > 0xff);
        const units = (b: number) => (unicode ? ttf.advance.get(fromWin(b)) ?? ttf.advance.get(b) : ttf.advance.get(b));
        const ctx = doc.context;
        const desc = descriptor.clone(ctx);
        const font = dict.clone(ctx);
        if (unicode) {
          const flags = (descriptor.lookup(PDFName.of("Flags")) as PDFNumber | undefined)?.asNumber() ?? 32;
          desc.set(PDFName.of("Flags"), PDFNumber.of((flags & ~4) | 32));
          const odd = Array.from({ length: 32 }, (_, i) => 0x80 + i).filter((b) => !FROM_WIN.has(b) && ttf.advance.has(b));
          font.set(PDFName.of("Encoding"), odd.length
            ? ctx.obj({ Type: "Encoding", BaseEncoding: "WinAnsiEncoding", Differences: odd.flatMap((b) => [b, PDFName.of(`uni00${b.toString(16).toUpperCase()}`)]) })
            : PDFName.of("WinAnsiEncoding"));
        }
        desc.set(PDFName.of("FontFile2"), ctx.register(ctx.flateStream(bytes, { Length1: bytes.length })));
        desc.set(PDFName.of("FontName"), PDFName.of(base));
        font.set(PDFName.of("BaseFont"), PDFName.of(base));
        font.set(PDFName.of("FontDescriptor"), ctx.register(desc));
        font.set(PDFName.of("FirstChar"), PDFNumber.of(32));
        font.set(PDFName.of("LastChar"), PDFNumber.of(255));
        const widths = Array.from({ length: 224 }, (_, i) => Math.round(((units(32 + i) ?? 0) * 1000) / ttf.upm));
        font.set(PDFName.of("Widths"), ctx.obj(widths));
        const drawn = (b: number) => b === 32 || (unicode ? ttf.drawn.has(fromWin(b)) || ttf.drawn.has(b) : ttf.drawn.has(b));
        got = { ref: ctx.register(font), width: (b) => (b >= 32 && b <= 255 ? widths[b - 32] : 0), has: drawn };
      }
    } catch { got = null; }
    wholes.set(dict, got);
    return got;
  };
  const named = new Map<PDFDict, Map<string, string>>();
  const nameIn = (fonts: PDFDict, ref: PDFRef) => {
    let byRef = named.get(fonts);
    if (!byRef) named.set(fonts, (byRef = new Map()));
    let n = byRef.get(ref.toString());
    if (!n) {
      for (let k = 1; !n; k++) if (!fonts.has(PDFName.of(`CKd${k}`))) n = `CKd${k}`;
      fonts.set(PDFName.of(n), ref);
      byRef.set(ref.toString(), n);
    }
    return n;
  };

  let changed = 0;
  holders.forEach((h, hi) => {
    const edits: { at: number; len: number; text: string }[] = [];
    blocks[hi].forEach((block, bi) => {
      const fs = found[hi][bi];
      if (!fs.length) return;
      const text = textOf(h, block);
      // per piece, its spans changed: [from, to) of its codes, and the new text there (null: taken out)
      const spans = block.map(() => [] as { from: number; to: number; text: string | null }[]);
      const starts: number[] = [];
      block.reduce((at, p) => (starts.push(at), at + p.codes.length), 0);
      const where = (k: number) => { let i = 0; while (i + 1 < block.length && starts[i + 1] <= k) i++; return [i, k - starts[i]] as const; };
      for (const f of fs) {
        const was = text.slice(f.start, f.end);
        const fresh = f.kind === "issue" && opts.issue !== undefined ? String(opts.issue).padStart(was.length, "0") : f.make(target, days);
        if (fresh === was || (f.kind === "issue" && !first && opts.issue === undefined)) continue;
        const [i, a] = where(f.start), [j, b] = where(f.end - 1);
        if (block.slice(i, j + 1).some((p) => !fontIn(h, p.font) || fontIn(h, p.font)!.cid)) continue;
        spans[i].push({ from: a, to: i === j ? b + 1 : block[i].codes.length, text: fresh });
        for (let k = i + 1; k <= j; k++) spans[k].push({ from: 0, to: k === j ? b + 1 : block[k].codes.length, text: null });
        changed++;
      }
      block.forEach((p, pi) => {
        if (!spans[pi].length) return;
        const font = fontIn(h, p.font)!;
        // a run of the piece's own codes as they were, kerning kept
        const run = (from: number, to: number, lead: number) => {
          const parts: string[] = lead ? [num(lead)] : [];
          let bytes: number[] = [];
          for (let k = from; k < to; k++) {
            bytes.push(p.codes[k].b);
            if (p.codes[k].kern || k === to - 1) { parts.push(lit(bytes)); bytes = []; if (p.codes[k].kern) parts.push(num(p.codes[k].kern)); }
          }
          return parts.length ? `[${parts.join(" ")}]TJ ` : "";
        };
        const wide = (codes: { b: number; kern: number }[], f: { width(b: number): number }, tc: number) =>
          codes.reduce((a, c) => a + (f.width(c.b) / 1000) * p.size + tc + (c.b === 32 ? p.tw : 0) - (c.kern / 1000) * p.size, 0);
        let out = "", cursor = 0;
        for (const s of spans[pi].sort((x, y) => x.from - y.from)) {
          out += run(cursor, s.from, cursor === 0 ? p.lead : 0);
          const old = wide(p.codes.slice(s.from, s.to), font, p.tc);
          if (s.text === null) out += `[${num((-old * 1000) / p.size)}]TJ `;
          else {
            // in its own font if that can draw every letter, else the same font whole, else the app's
            const said = [...s.text];
            const own = said.map((ch) => toWin(ch.codePointAt(0)!));
            const inOwn = own.every((b) => b !== null && font.has(b));
            const dict = inOwn ? undefined : h.fonts?.lookup(PDFName.of(p.font));
            const whole = dict instanceof PDFDict ? wholeOf(dict, font.base) : null;
            const inWhole = !!whole && own.every((b) => b !== null && whole.has(b));
            const other = inOwn || inWhole || !h.fonts ? null : stand(font.base);
            const bytes = inOwn || inWhole ? own as number[] : other?.encode(s.text) ?? null;
            if (!bytes) { out += run(s.from, s.to, 0); cursor = s.to; changed--; continue; }
            const w = (b: number) => (inOwn ? font.width(b) : inWhole ? whole!.width(b) : other!.width(said[bytes.indexOf(b)].codePointAt(0)!));
            const natural = bytes.reduce((a, b) => a + (w(b) / 1000) * p.size + p.tc + (b === 32 ? p.tw : 0), 0);
            // (set as the design sets it: only a wider one drawn a little closer, and the line after it put back where it was)
            const give = Math.min(0, Math.max(-0.03 * p.size, (old - natural) / Math.max(1, bytes.length)));
            const now = natural + give * bytes.length;
            const shown = `${give ? `${num(p.tc + give)} Tc ` : ""}[${lit(bytes)} ${num(((now - old) * 1000) / p.size)}]TJ ${give ? `${num(p.tc)} Tc ` : ""}`;
            const swap = inWhole ? whole!.ref : other?.ref;
            out += swap ? `/${nameIn(h.fonts!, swap)} ${num(p.size)} Tf ${shown}/${p.font} ${num(p.size)} Tf ` : shown;
          }
          cursor = s.to;
        }
        out += run(cursor, p.codes.length, cursor === 0 ? p.lead : 0);
        edits.push({ at: p.at, len: p.len, text: out.trimEnd() });
      });
    });
    if (!edits.length) return;
    let content = h.content;
    for (const e of edits.sort((x, y) => y.at - x.at)) content = content.slice(0, e.at) + e.text + content.slice(e.at + e.len);
    h.put(content);
  });
  return { pdf: changed ? await doc.save() : pdf, changed, written: first ? new Date(first.date).toISOString().slice(0, 10) : null, issue: firstIssue ? issue : null };
}
