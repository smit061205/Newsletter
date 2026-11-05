// Text drawn as its letters' own shapes, for CorelDRAW (the developer, 5 Nov: the editor
// sets the Urdu paper in CorelDRAW too). A script whose letters join (Urdu, Hindi) can't go
// into the editable PDF as simple-font text (export/pdf-editable.ts), and CorelDRAW reads
// Chromium's print PDF grey or not at all; so each line is shaped here as a browser shapes
// it (HarfBuzz, in the paper's own font file) and every letter drawn as a filled outline, at
// the line's own place, width and spacing. It opens in CorelDRAW exactly as it prints; the
// words can't be typed over there.
import { readFile } from "node:fs/promises";
import type { PDFPage } from "pdf-lib";
import { rgb as pdfColor } from "pdf-lib";
import type { IssueRender, TextElement } from "@ck/shared/contract";
import { assetFile } from "../config.ts";
import { fontInfo } from "./svg.ts";

type Hb = typeof import("harfbuzzjs");
interface Shaper { font: InstanceType<Hb["Font"]>; upm: number; ascent: number; descent: number; paths: Map<number, string> }
interface Glyph { g: number; ax: number; dx: number; dy: number; space: boolean }

/** The issue's fonts, ready to shape with (by font id). */
export async function shapers(issue: IssueRender): Promise<{ hb: Hb; fonts: Map<string, Shaper> }> {
  // (loaded only when a paper needs it: the engine starts without it)
  const hb = await import("harfbuzzjs");
  const fonts = new Map<string, Shaper>();
  for (const f of issue.fonts) {
    let bytes: Buffer;
    try { bytes = await readFile(assetFile(new URL(f.url, "http://x").pathname)); } catch { continue; }
    const info = fontInfo(bytes);
    const face = new hb.Face(new hb.Blob(new Uint8Array(bytes)));
    fonts.set(f.id, { font: new hb.Font(face), upm: face.upem, ascent: info.ascent, descent: info.descent, paths: new Map() });
  }
  return { hb, fonts };
}

// a run of left-to-right text inside right-to-left (digits, English words, with what joins them)
const LTR_RUN = /[0-9A-Za-zÀ-ɏ](?:[0-9A-Za-zÀ-ɏ.,:%/@&+\-]*[0-9A-Za-zÀ-ɏ%])?/g;
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** One line's glyphs in visual order, left to right (font units). */
function shapeLine(hb: Hb, s: Shaper, text: string, rtl: boolean, lang: string | undefined): Glyph[] {
  const run = (t: string, dir: "ltr" | "rtl"): Glyph[] => {
    if (!t) return [];
    const b = new hb.Buffer();
    b.addText(t);
    b.setDirection(dir === "rtl" ? hb.Direction.RTL : hb.Direction.LTR);
    if (dir === "rtl") { b.setScript("Arab"); b.setLanguage(lang ?? "ur"); } else b.guessSegmentProperties();
    hb.shape(s.font, b);
    const chars = [...t];
    // (a cluster is a code-unit offset: map it to its character)
    const at = new Map<number, string>();
    let off = 0;
    for (const ch of chars) { at.set(off, ch); off += ch.length; }
    return b.getGlyphInfosAndPositions().map((x) => ({ g: x.codepoint, ax: x.xAdvance ?? 0, dx: x.xOffset ?? 0, dy: x.yOffset ?? 0,
                                                       space: /\s/.test(at.get(x.cluster) ?? "") }));
  };
  if (!rtl) return run(text, "ltr");
  // a right-to-left line: its left-to-right pieces shaped on their own, the pieces laid right to left
  const pieces: { t: string; dir: "ltr" | "rtl" }[] = [];
  let last = 0;
  for (const m of text.matchAll(LTR_RUN)) {
    if (m.index! > last) pieces.push({ t: text.slice(last, m.index), dir: "rtl" });
    pieces.push({ t: m[0], dir: "ltr" });
    last = m.index! + m[0].length;
  }
  if (last < text.length) pieces.push({ t: text.slice(last), dir: "rtl" });
  return pieces.reverse().flatMap((p) => run(p.t, p.dir));
}

/** A glyph's outline as an SVG path, y down, x squeezed by `h` (font units). */
function outline(s: Shaper, g: number, h: number): string {
  const key = g * 1000 + Math.round(h * 1000);
  let d = s.paths.get(key);
  if (d === undefined) {
    let i = 0;
    d = s.font.glyphToPath(g).replace(/-?\d+(?:\.\d+)?/g, (n) => String(i++ % 2 === 0 ? +(Number(n) * h).toFixed(1) : -Number(n)));
    s.paths.set(key, d);
  }
  return d;
}

/** A text element drawn as letter shapes, as the print PDF sets it: each line at its baseline,
 * justified lines to their box's width by their word spaces, the squeeze and any thickening kept. */
export function drawShapes(page: PDFPage, e: TextElement, hb: Hb, fonts: Map<string, Shaper>, k: number, H: number, rgb: (c?: string) => [number, number, number]) {
  const s = fonts.get(e.font);
  if (!s) return;
  const runs = typeof e.text === "string" ? [{ text: e.text }] : e.text;
  const lines = runs.map((r) => r.text).join("").split("\n");
  const rtl = e.direction === "rtl" || (e.direction !== "ltr" && RTL.test(lines.join("")));
  const h = e.hScale ?? 1;
  const unit = e.size / s.upm; // contract px per font unit
  const asc = (s.ascent / s.upm) * e.size, desc = (-s.descent / s.upm) * e.size;
  const baseline = (e.lineHeight - (asc + desc)) / 2 + asc;
  const justify = e.align === "justify" || e.align === "justify-all";
  const color = pdfColor(...rgb(e.color));
  lines.forEach((text, i) => {
    if (!text.trim()) return;
    const glyphs = shapeLine(hb, s, text, rtl, e.lang);
    const last = i === lines.length - 1;
    const indent = i === 0 ? e.indent ?? 0 : 0;
    const ls = e.letterSpacing ?? 0;
    let ws = e.wordSpacing ?? 0;
    const spaces = glyphs.filter((x) => x.space).length;
    const natural = glyphs.reduce((a, x) => a + x.ax * unit + ls + (x.space ? ws : 0), 0);
    // (a stretched line ends exactly at its box's edges, as Chromium set it)
    const stretch = justify && (e.nowrap || !last || e.align === "justify-all");
    if (stretch && spaces) ws += ((e.width - indent) / h - natural) / spaces;
    const width = glyphs.reduce((a, x) => a + x.ax * unit + ls + (x.space ? ws : 0), 0) * h;
    const x0 = e.align === "center" ? e.x + (e.width - width) / 2
      : e.align === "right" || (rtl && e.align !== "left" && !stretch) ? e.x + e.width - indent - width
      : rtl ? e.x : e.x + indent;
    const y = H - (e.y + i * e.lineHeight + baseline) * k;
    let pen = x0;
    for (const x of glyphs) {
      if (x.g && !x.space) {
        page.drawSvgPath(outline(s, x.g, h), {
          x: (pen + x.dx * unit * h) * k, y: y + x.dy * unit * k, scale: unit * k, color,
          // (thickened letters, as the print PDF's shadows: an outline round each, as wide)
          ...(e.thicken ? { borderColor: color, borderWidth: e.thicken / unit } : {}),
        });
      }
      pen += (x.ax * unit + ls + (x.space ? ws : 0)) * h;
    }
  });
}
