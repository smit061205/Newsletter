// The issue as a PDF whose text stays text in CorelDRAW: every printed line
// one text line in the paper's own font, as a page-layout program writes it
// (the paper's own PageMaker PDFs: each font a simple TrueType font, Windows
// encoding, named as Windows knows it -- "BBharatiGopikaTwo",
// "BBharatiGopikaTwo,Bold" -- word and letter spacing and the squeeze as
// text settings), so CorelDRAW sets it in the installed Gopika and it stays
// editable. Photos, ads and rules go in as they are (full quality).
//
// The print PDF (shared/pdf.ts, drawn by Chromium) is unchanged: its text is
// glyph by glyph in subset fonts, which CorelDRAW imports grey or not at all.
//
// Legacy (Bharati) and Latin text only: a Unicode script that needs shaping
// (Hindi, Urdu, Unicode Gujarati) can't be written as simple-font text, so a
// paper set in one gets null (the print PDF is what there is).
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  clip, endPath, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, PDFRef, popGraphicsState,
  pushGraphicsState, rectangle, rgb as pdfColor, type PDFPage,
} from "pdf-lib";
import type { Element, IssueRender, TextElement } from "@ck/shared/contract";
import { assetFile } from "../config.ts";

/** Windows-1252 (WinAnsiEncoding): Unicode -> code, where they differ from Latin-1. */
const WIN_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89,
  0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f,
};
/** Codes WinAnsi leaves empty: a font's characters outside it go here (an /Encoding /Differences). */
const SPARE = [0x81, 0x8d, 0x8f, 0x90, 0x9d, 0x7f, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];

interface Ttf {
  family: string; style: string; bold: boolean; italic: boolean; upm: number; ascent: number; descent: number;
  bbox: [number, number, number, number]; capHeight: number; italicAngle: number;
  /** Unicode -> advance width (font units), for every character the font has */
  advance: Map<number, number>;
}

/** What the PDF needs of a TrueType font: names, metrics, and each character's width. */
function readTtf(b: Buffer): Ttf {
  const base = b.toString("latin1", 0, 4) === "ttcf" ? b.readUInt32BE(12) : 0;
  const tables = new Map<string, number>();
  for (let i = 0, n = b.readUInt16BE(base + 4); i < n; i++) tables.set(b.toString("latin1", base + 12 + i * 16, base + 16 + i * 16), b.readUInt32BE(base + 12 + i * 16 + 8));
  const at = (t: string) => { const o = tables.get(t); if (o === undefined) throw new Error(`the font has no ${t} table`); return o; };
  const head = at("head"), hhea = at("hhea"), hmtx = at("hmtx"), cmap = at("cmap");
  const os2 = tables.get("OS/2"), post = tables.get("post"), name = tables.get("name");
  const names: Record<number, string> = {};
  if (name !== undefined) {
    const count = b.readUInt16BE(name + 2), strings = name + b.readUInt16BE(name + 4);
    for (let i = 0; i < count; i++) {
      const r = name + 6 + i * 12;
      const [platform, , , id, len, off] = [0, 2, 4, 6, 8, 10].map((o) => b.readUInt16BE(r + o));
      if (![1, 2, 6, 16, 17].includes(id) || (names[id] && platform !== 3)) continue;
      const raw = b.subarray(strings + off, strings + off + len);
      names[id] = platform === 3 || platform === 0 ? Buffer.from(raw).swap16().toString("utf16le") : raw.toString("latin1");
    }
  }
  // widths by glyph, then glyphs by character (the Windows Unicode map, format 4)
  const nh = b.readUInt16BE(hhea + 34);
  const widthOf = (g: number) => b.readUInt16BE(hmtx + 4 * Math.min(g, nh - 1));
  const advance = new Map<number, number>();
  const nt = b.readUInt16BE(cmap + 2);
  let sub = -1;
  for (let i = 0; i < nt; i++) {
    const [p, e] = [b.readUInt16BE(cmap + 4 + i * 8), b.readUInt16BE(cmap + 6 + i * 8)];
    const off = cmap + b.readUInt32BE(cmap + 8 + i * 8);
    if (b.readUInt16BE(off) === 4 && ((p === 3 && (e === 1 || e === 0)) || p === 0)) { sub = off; if (p === 3) break; }
  }
  if (sub >= 0) {
    const segX2 = b.readUInt16BE(sub + 6), ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = b.readUInt16BE(ends + 2 * s), start = b.readUInt16BE(starts + 2 * s);
      const delta = b.readInt16BE(deltas + 2 * s), ro = b.readUInt16BE(ranges + 2 * s);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          const gi = ranges + 2 * s + ro + 2 * (c - start);
          g = b.readUInt16BE(gi);
          if (g) g = (g + delta) & 0xffff;
        }
        // a symbol font maps its codes at 0xF000 + code
        const u = c >= 0xf000 && c <= 0xf0ff ? c - 0xf000 : c;
        if (g && !advance.has(u)) advance.set(u, widthOf(g));
      }
    }
  }
  const weight = os2 !== undefined ? b.readUInt16BE(os2 + 4) : 400;
  const fsSel = os2 !== undefined ? b.readUInt16BE(os2 + 62) : 0, mac = b.readUInt16BE(head + 44);
  const style = (names[17] || names[2] || "Regular").trim();
  return {
    family: (names[16] || names[1] || names[6] || "Font").trim(), style,
    bold: weight >= 600 || !!(fsSel & 0x20) || !!(mac & 1) || /bold/i.test(style), italic: !!(fsSel & 1) || !!(mac & 2) || /italic/i.test(style),
    upm: b.readUInt16BE(head + 18), ascent: b.readInt16BE(hhea + 4), descent: b.readInt16BE(hhea + 6),
    bbox: [b.readInt16BE(head + 36), b.readInt16BE(head + 38), b.readInt16BE(head + 40), b.readInt16BE(head + 42)],
    capHeight: os2 !== undefined && b.readUInt16BE(os2) >= 2 ? b.readInt16BE(os2 + 88) : b.readInt16BE(hhea + 4),
    italicAngle: post !== undefined ? b.readInt32BE(post + 4) / 65536 : 0,
    advance,
  };
}

/** A font as the PDF holds it: its resource name, how its characters encode, their widths. */
interface PdfFont { key: string; ttf: Ttf; code: Map<number, number>; scale: number }

/** The paper's fonts as simple TrueType fonts, each embedded whole, WinAnsi
 * encoded (its other characters in the codes WinAnsi leaves empty). */
async function embedFonts(doc: PDFDocument, issue: IssueRender): Promise<Map<string, PdfFont>> {
  const out = new Map<string, PdfFont>();
  for (const [i, f] of issue.fonts.entries()) {
    const file = assetFile(new URL(f.url, "http://x").pathname);
    let bytes: Buffer;
    try { bytes = await readFile(file); } catch { continue; }
    const ttf = readTtf(bytes);
    const code = new Map<number, number>();
    const extra: number[] = [];
    for (const u of ttf.advance.keys()) {
      if (u >= 0x20 && u < 0x7f) code.set(u, u);
      else if (u >= 0xa0 && u <= 0xff) code.set(u, u);
      else if (WIN_HIGH[u]) code.set(u, WIN_HIGH[u]);
      else extra.push(u);
    }
    const differences: (PDFNumber | PDFName)[] = [];
    for (const [k, u] of extra.entries()) {
      const slot = SPARE[k];
      if (slot === undefined) break;
      code.set(u, slot);
      differences.push(PDFNumber.of(slot), PDFName.of(`uni${u.toString(16).toUpperCase().padStart(4, "0")}`));
    }
    const scale = 1000 / ttf.upm;
    const widths: number[] = [];
    const byCode = new Map([...code].map(([u, c]) => [c, u]));
    for (let c = 1; c <= 255; c++) widths.push(Math.round((ttf.advance.get(byCode.get(c) ?? -1) ?? 0) * scale));
    // as Windows names it: the family without spaces, ",Bold" / ",Italic" / ",BoldItalic"
    const style = ttf.bold && ttf.italic ? ",BoldItalic" : ttf.bold ? ",Bold" : ttf.italic ? ",Italic" : "";
    const baseFont = ttf.family.replace(/\s+/g, "") + style;
    const ctx = doc.context;
    const fontFile = ctx.register(ctx.flateStream(bytes, { Length1: bytes.length }));
    const descriptor = ctx.register(ctx.obj({
      Type: "FontDescriptor", FontName: PDFName.of(baseFont), Flags: 32 + (ttf.italic ? 64 : 0),
      FontBBox: ttf.bbox.map((v) => Math.round(v * scale)), ItalicAngle: ttf.italicAngle,
      Ascent: Math.round(ttf.ascent * scale), Descent: Math.round(ttf.descent * scale), CapHeight: Math.round(ttf.capHeight * scale),
      StemV: ttf.bold ? 140 : 80, FontFile2: fontFile,
    }));
    const encoding = differences.length
      ? ctx.obj({ Type: "Encoding", BaseEncoding: "WinAnsiEncoding", Differences: ctx.obj(differences) })
      : PDFName.of("WinAnsiEncoding");
    const fontRef: PDFRef = ctx.register(ctx.obj({
      Type: "Font", Subtype: "TrueType", BaseFont: PDFName.of(baseFont), FirstChar: 1, LastChar: 255, Widths: widths,
      FontDescriptor: descriptor, Encoding: encoding,
    }));
    const key = `F${i + 1}`;
    out.set(f.id, { key, ttf, code, scale });
    (out as Map<string, PdfFont & { ref?: PDFRef }>).get(f.id)!.ref = fontRef;
  }
  return out;
}

const COLORS: Record<string, [number, number, number]> = { white: [1, 1, 1], black: [0, 0, 0], none: [0, 0, 0] };
/** A CSS colour ("#231f20", "#fff", "white") as 0-1 RGB. */
function rgb(c: string | undefined): [number, number, number] {
  if (!c) return [0, 0, 0];
  const s = c.trim().toLowerCase();
  if (COLORS[s]) return COLORS[s];
  const h = s.replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  const v = parseInt(full, 16);
  return Number.isNaN(v) ? [0, 0, 0] : [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
}
const op = (name: PDFOperatorNames, ...args: (number | PDFName | PDFHexString)[]) =>
  PDFOperator.of(name, args.map((a) => (typeof a === "number" ? PDFNumber.of(Math.round(a * 1000) / 1000) : a)));

/** Can every text of this issue be written as simple-font text? (Not a Unicode script that needs shaping.) */
export function editableText(issue: IssueRender): boolean {
  for (const p of issue.pages) for (const e of p.elements) {
    if (e.kind !== "text") continue;
    const all = typeof e.text === "string" ? e.text : e.text.map((r) => r.text).join("");
    if (/[ऀ-෿؀-ۿ]/.test(all)) return false;
  }
  return true;
}

/** The issue as an editable-text PDF, or null if its text needs shaping (Hindi, Urdu). */
export async function editablePdf(issue: IssueRender): Promise<Uint8Array | null> {
  if (!editableText(issue)) return null;
  const doc = await PDFDocument.create();
  doc.setTitle(`Issue ${issue.issueNumber}, ${issue.issueDate}`);
  doc.setCreator("Capital Kranti newsroom (editable text)");
  const fonts = await embedFonts(doc, issue);
  const k = 72 / (issue.dpi ?? 300); // contract px -> pt
  const images = new Map<string, Awaited<ReturnType<PDFDocument["embedJpg"]>> | null>();
  const image = async (url: string) => {
    if (images.has(url)) return images.get(url)!;
    let got: Awaited<ReturnType<PDFDocument["embedJpg"]>> | null = null;
    try {
      const file = assetFile(new URL(url, "http://x").pathname);
      const bytes = await readFile(file);
      const ext = path.extname(file).toLowerCase();
      // by its bytes, not its name (a .jpg that's really a PNG)
      got = bytes[0] === 0x89 && bytes[1] === 0x50 ? await doc.embedPng(bytes)
        : bytes[0] === 0xff && bytes[1] === 0xd8 ? await doc.embedJpg(bytes)
        : ext === ".png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch { got = null; }
    images.set(url, got);
    return got;
  };

  for (const p of [...issue.pages].sort((a, b) => a.number - b.number)) {
    const W = p.width * k, H = p.height * k;
    const page = doc.addPage([W, H]);
    for (const f of fonts.values()) page.node.setFontDictionary(PDFName.of(f.key), (f as PdfFont & { ref: PDFRef }).ref);
    if (p.background) page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: pdfColor(...rgb(p.background)) });
    for (const e of p.elements as Element[]) {
      switch (e.kind) {
        case "image": {
          const img = await image(e.url);
          if (!img) break;
          const bx = e.x * k, by = H - (e.y + e.height) * k, bw = e.width * k, bh = e.height * k;
          let dw = bw, dh = bh;
          if (e.fit !== "fill") {
            const s = (e.fit === "contain" ? Math.min : Math.max)(bw / img.width, bh / img.height);
            dw = img.width * s; dh = img.height * s;
          }
          page.pushOperators(pushGraphicsState(), rectangle(bx, by, bw, bh), clip(), endPath());
          page.drawImage(img, { x: bx + (bw - dw) / 2, y: by + (bh - dh) / 2, width: dw, height: dh });
          page.pushOperators(popGraphicsState());
          break;
        }
        case "rect": {
          const fill = e.fill && e.fill !== "none" ? rgb(e.fill) : null, stroke = e.stroke ? rgb(e.stroke) : null;
          page.drawRectangle({
            x: e.x * k, y: H - (e.y + e.height) * k, width: e.width * k, height: e.height * k,
            ...(fill ? { color: pdfColor(...fill) } : {}),
            ...(stroke ? { borderColor: pdfColor(...stroke), borderWidth: (e.strokeWidth ?? 1) * k } : {}),
          });
          break;
        }
        case "line": {
          const c = rgb(e.color);
          page.drawLine({ start: { x: e.x1 * k, y: H - e.y1 * k }, end: { x: e.x2 * k, y: H - e.y2 * k }, thickness: e.width * k,
                          color: pdfColor(...c), ...(e.dash ? { dashArray: e.dash.map((d) => d * k) } : {}) });
          break;
        }
        case "path": {
          const fill = e.fill && e.fill !== "none" ? rgb(e.fill) : null, stroke = e.stroke ? rgb(e.stroke) : null;
          page.drawSvgPath(e.d, { x: 0, y: H, scale: k,
            ...(fill ? { color: pdfColor(...fill) } : {}),
            ...(stroke ? { borderColor: pdfColor(...stroke), borderWidth: (e.strokeWidth ?? 1) * k } : {}) });
          break;
        }
        case "text":
          drawText(page, e, fonts, k, H);
          break;
      }
    }
  }
  return doc.save({ useObjectStreams: false });
}

/** A text element: each of its lines one text object, runs switching font within it. */
function drawText(page: PDFPage, e: TextElement, fonts: Map<string, PdfFont>, k: number, H: number) {
  const runs = typeof e.text === "string" ? [{ text: e.text }] : e.text;
  const lines: { text: string; font?: string; size?: number; color?: string }[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...r, text: part });
    });
  }
  const h = e.hScale ?? 1;
  const justify = e.align === "justify" || e.align === "justify-all";
  // where CSS sets a line's baseline in its line box (as export/svg.ts)
  const base = fonts.get(e.font);
  const baseline = (size: number) => {
    if (!base) return size * 0.8;
    const asc = (base.ttf.ascent / base.ttf.upm) * size, desc = (-base.ttf.descent / base.ttf.upm) * size;
    return (e.lineHeight - (asc + desc)) / 2 + asc;
  };
  lines.forEach((line, i) => {
    if (!line.length) return;
    const last = i === lines.length - 1;
    // the line's pieces in their fonts' codes, and its natural width (contract px, before the squeeze)
    const pieces = line.map((r) => {
      const f = fonts.get(r.font ?? e.font) ?? base;
      const size = r.size ?? e.size;
      const bytes: number[] = [];
      let width = 0, spaces = 0, chars = 0;
      for (const ch of r.text) {
        const u = ch.codePointAt(0)!;
        const c = f?.code.get(u);
        if (c === undefined) continue; // not in the font (rare: a character the paper's font lacks)
        bytes.push(c);
        chars++;
        if (c === 0x20) spaces++;
        width += ((f!.ttf.advance.get(u) ?? 0) / f!.ttf.upm) * size;
      }
      return { f, size, color: r.color ?? e.color, bytes, width, spaces, chars };
    }).filter((x) => x.f && x.bytes.length);
    if (!pieces.length) return;
    let ls = e.letterSpacing ?? 0;
    let ws = e.wordSpacing ?? 0;
    const indent = i === 0 ? e.indent ?? 0 : 0;
    const chars = pieces.reduce((a, x) => a + x.chars, 0);
    const spaces = pieces.reduce((a, x) => a + x.spaces, 0);
    const natural = pieces.reduce((a, x) => a + x.width + x.chars * ls + x.spaces * ws, 0);
    // a stretched line (a justified line that isn't a paragraph's last, or one
    // the layout set to its width) ends exactly at the box's edge: its word
    // spaces (else its letters) take up what this font's widths leave, as
    // Chromium's own kerning set it in the print PDF
    const stretch = justify && (e.nowrap || !last || e.align === "justify-all");
    const rest = (e.width - indent) / h - natural;
    if (stretch && spaces) ws += rest / spaces;
    else if (stretch && chars > 1) ls += rest / (chars - 1);
    const widthNow = pieces.reduce((a, x) => a + x.width + x.chars * ls + x.spaces * ws, 0) * h;
    const x0 = e.align === "center" ? e.x + (e.width - widthNow) / 2 : e.align === "right" ? e.x + e.width - widthNow : e.x + indent;
    const y = e.y + i * e.lineHeight + baseline(e.size);
    const ops: PDFOperator[] = [op(PDFOperatorNames.BeginText)];
    ops.push(op(PDFOperatorNames.SetTextHorizontalScaling, h * 100), op(PDFOperatorNames.SetCharacterSpacing, ls * k),
             op(PDFOperatorNames.SetWordSpacing, ws * k), op(PDFOperatorNames.MoveText, x0 * k, H - y * k));
    let color = "";
    for (const x of pieces) {
      const c = rgb(x.color);
      const key = c.join(",");
      if (key !== color) { ops.push(op(PDFOperatorNames.NonStrokingColorRgb, ...c)); color = key; }
      ops.push(op(PDFOperatorNames.SetFontAndSize, PDFName.of(x.f!.key), x.size * k));
      ops.push(op(PDFOperatorNames.ShowText, PDFHexString.of(Buffer.from(x.bytes).toString("hex"))));
    }
    ops.push(op(PDFOperatorNames.EndText));
    page.pushOperators(...ops);
  });
}
