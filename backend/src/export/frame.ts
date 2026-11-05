// A sister paper's title and footer (the developer, 5 Nov: the Urdu paper's own masthead,
// running heads and printer's line, made each day as a PDF of the paper's size with the
// rest of each page empty): drawn over its pages when its PDF is given out. Kept beside its
// database (sister.ts frameFile), by the day it was given for; a day without one of its own
// takes the latest given before it, its dates changed to the day the paper carries
// (the developer, 5 Nov: "auto date update in the title for intended date"). The pages
// themselves are laid out as before, their masthead, heads and last page's foot left empty for it.
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { printedDate } from "../profile.ts";
import { frameFile, sisterDir } from "../sister.ts";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "Thursday, 05 November, 2026" and the like, as a frame writes its date
const DATE = new RegExp(`(${DAYS.join("|")})(,?\\s*)(\\d{1,2})(\\s+)(${MONTHS.join("|")})(,?\\s*)(\\d{4})`);
// the standard fonts a frame may name without carrying them (every letter there to write a new date in)
const STANDARD: Record<string, StandardFonts> = {
  "Times-Roman": StandardFonts.TimesRoman, "Times-Bold": StandardFonts.TimesRomanBold, "Times-Italic": StandardFonts.TimesRomanItalic,
  "Times-BoldItalic": StandardFonts.TimesRomanBoldItalic, Helvetica: StandardFonts.Helvetica, "Helvetica-Bold": StandardFonts.HelveticaBold,
  Courier: StandardFonts.Courier, "Courier-Bold": StandardFonts.CourierBold,
};

/** `date` written as the frame wrote its own: the same words, padding and punctuation. */
function sameWay(m: RegExpExecArray, date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = String(d.getUTCDate());
  return `${DAYS[d.getUTCDay()]}${m[2]}${m[3].length === 2 ? day.padStart(2, "0") : day}${m[4]}${MONTHS[d.getUTCMonth()]}${m[6]}${d.getUTCFullYear()}`;
}

const unescape = (s: string) => s.replace(/\\([()\\])/g, "$1");
const escape = (s: string) => s.replace(/([()\\])/g, "\\$1");

/** A frame page's dates changed to `date`, where it writes them in a standard font as plain
 * text (pieces of one line, as CorelDRAW writes them): the first piece takes the whole new date,
 * the others nothing, its letters spaced (a little) and the line moved (half the rest) so it
 * keeps its place. How many it changed. */
async function redatePage(doc: PDFDocument, page: PDFPage, date: string, measure: Map<string, PDFFont>): Promise<number> {
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  const parts: string[] = [];
  for (const r of refs) {
    const s = r instanceof PDFRef ? doc.context.lookup(r) : r;
    if (s instanceof PDFRawStream) parts.push(Buffer.from(decodePDFRawStream(s).decode()).toString("latin1"));
    else if (s instanceof PDFStream) parts.push(Buffer.from(s.getContents()).toString("latin1"));
    else return 0;
  }
  let text = parts.join("\n");
  const fontsDict = page.node.Resources()?.lookup(PDFName.of("Font"));
  const baseOf = (name: string) => {
    const f = fontsDict instanceof PDFDict ? fontsDict.lookup(PDFName.of(name)) : null;
    const base = f instanceof PDFDict ? f.lookup(PDFName.of("BaseFont")) : null;
    return base instanceof PDFName ? base.decodeText() : "";
  };
  let changed = 0;
  text = text.replace(/BT[\s\S]*?ET/g, (block) => {
    // the block's strings shown, each with the font, size and letter spacing it's shown in
    const pieces: { at: number; len: number; text: string; font: string; size: number; tc: number }[] = [];
    let font = "", size = 0, tc = 0;
    const ops = /\/(\S+)\s+([-\d.]+)\s+Tf|([-\d.]+)\s+Tc|\(((?:\\.|[^\\)])*)\)\s*Tj/g;
    for (let m; (m = ops.exec(block)); ) {
      if (m[1]) { font = m[1]; size = +m[2]; }
      else if (m[3] !== undefined) tc = +m[3];
      else pieces.push({ at: m.index, len: m[0].length, text: unescape(m[4]), font, size, tc });
    }
    const all = pieces.map((p) => p.text).join("");
    const m = DATE.exec(all);
    if (!m) return block;
    // the pieces the date runs over
    let from = 0, i = 0;
    while (i < pieces.length && from + pieces[i].text.length <= m.index) from += pieces[i++].text.length;
    let j = i, to = from;
    while (j < pieces.length && to + pieces[j].text.length < m.index + m[0].length) to += pieces[j++].text.length;
    if (j >= pieces.length) return block;
    const first = pieces[i];
    const std = STANDARD[baseOf(first.font)];
    const metrics = std && measure.get(std);
    if (!metrics || !first.size) return block; // a font it carries: its letters for a new date may not be there
    const before = first.text.slice(0, m.index - from);
    const after = pieces[j].text.slice(m.index + m[0].length - to);
    const fresh = sameWay(m, date);
    // the width it had (each piece in its own spacing) and the new date's in the first's
    const w = (s: string, p: typeof first) => metrics.widthOfTextAtSize(s, p.size) + p.tc * s.length;
    const had = pieces.slice(i, j + 1).reduce((a, p) => a + w(p.text, p), 0);
    const now = w(before + fresh + after, first);
    const chars = Math.max(1, (before + fresh + after).length - 1);
    const give = Math.max(-0.5, Math.min(0.5, (had - now) / chars));
    const rest = had - (now + give * chars);
    let out = block;
    for (let k = j; k >= i; k--) {
      const p = pieces[k];
      const op = k === i
        ? `${(p.tc + give).toFixed(4)} Tc ${(-rest / 2).toFixed(3)} 0 Td (${escape(before + fresh + after)})Tj ${(rest / 2).toFixed(3)} 0 Td ${p.tc} Tc`
        : "()Tj";
      out = out.slice(0, p.at) + op + out.slice(p.at + p.len);
    }
    changed++;
    return out;
  });
  if (changed) page.node.set(PDFName.of("Contents"), doc.context.register(doc.context.flateStream(Buffer.from(text, "latin1"))));
  return changed;
}

/** The frame's dates changed to `date` (the paper's printed day); how many it had. */
async function redated(frame: Uint8Array, date: string): Promise<{ pdf: Uint8Array; dates: number }> {
  const doc = await PDFDocument.load(frame);
  const measure = new Map<string, PDFFont>();
  for (const f of Object.values(STANDARD)) measure.set(f, await doc.embedFont(f));
  let dates = 0;
  for (const page of doc.getPages()) dates += await redatePage(doc, page, date, measure);
  return { pdf: dates ? await doc.save() : frame, dates };
}

/** The paper's PDF with the day's frame over each page (page by page; a page past the frame's last has none). */
export async function framed(pdf: Uint8Array, frame: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const src = await PDFDocument.load(frame);
  const n = Math.min(doc.getPageCount(), src.getPageCount());
  const pages = await doc.embedPdf(src, [...Array(n).keys()]);
  pages.forEach((p, i) => {
    const page = doc.getPage(i);
    page.drawPage(p, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  });
  return doc.save();
}

/** The frame a day's paper takes: its own, else the latest given before it (or after it, if none is). */
function frameOf(id: string, date: string): { file: string; day: string } | null {
  if (existsSync(frameFile(id, date))) return { file: frameFile(id, date), day: date };
  const dir = path.join(sisterDir(id), "frames");
  const days = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.pdf$/.test(f)).map((f) => f.slice(0, 10)).sort() : [];
  const day = days.filter((d) => d <= date).pop() ?? days[0];
  return day ? { file: frameFile(id, day), day } : null;
}

/** A sister paper's PDF for a day, with its frame if it has one, dated the day the paper carries. */
export async function withFrame(id: string, date: string, pdf: Uint8Array): Promise<Uint8Array> {
  const got = frameOf(id, date);
  if (!got) return pdf;
  return framed(pdf, (await redated(new Uint8Array(await readFile(got.file)), printedDate(date))).pdf);
}

/** The day's frame: how many pages, how many dates it changes by itself, and the day it was given for. */
export async function frameInfo(id: string, date: string): Promise<{ pages: number; dates: number; from: string } | null> {
  const got = frameOf(id, date);
  if (!got) return null;
  try {
    const bytes = new Uint8Array(await readFile(got.file));
    return { pages: (await PDFDocument.load(bytes)).getPageCount(), dates: (await redated(bytes, printedDate(date))).dates, from: got.day };
  } catch { return null; }
}

/** The day's frame saved, checked first: a PDF of the paper's own page size (within 3pt). A string is what's wrong. */
export async function saveFrame(id: string, date: string, base64: string, size: { width: number; height: number }): Promise<string | null> {
  const bytes = Buffer.from(base64, "base64");
  let doc: PDFDocument;
  try { doc = await PDFDocument.load(bytes); } catch { return "That file isn't a PDF."; }
  const odd = doc.getPages().findIndex((p) => Math.abs(p.getWidth() - size.width) > 3 || Math.abs(p.getHeight() - size.height) > 3);
  if (odd >= 0) {
    const p = doc.getPage(odd);
    return `Page ${odd + 1} is ${Math.round(p.getWidth())} × ${Math.round(p.getHeight())} pt; the paper's pages are ${Math.round(size.width)} × ${Math.round(size.height)}.`;
  }
  await mkdir(path.dirname(frameFile(id, date)), { recursive: true });
  await writeFile(frameFile(id, date), bytes);
  return null;
}

/** The day's frame taken off. */
export const removeFrame = (id: string, date: string) => rm(frameFile(id, date), { force: true });
