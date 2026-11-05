// A page as an editable SVG -- for CorelDRAW (File > Import) on the paper's
// own computer, where its fonts are installed. Every printed line is a text
// line of its own at its exact baseline, in the font's real family name
// (so CorelDRAW sets it in the installed Gopika); justified lines carry
// their width; photos are embedded, so the file stands alone. Served only
// by the backend on this computer (the fonts are licensed to it).
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Element, IssueRender, TextElement } from "@ck/shared/contract";
import { assetFile } from "../config.ts";

interface FontInfo { family: string; ascent: number; descent: number; upm: number; bold: boolean; italic: boolean }

/** A TrueType/OpenType font's family name and line metrics (hhea), read from its tables. */
export function fontInfo(b: Buffer): FontInfo {
  // a font collection (.ttc): its first font's directory (table offsets stay from the file's start)
  const base = b.toString("latin1", 0, 4) === "ttcf" ? b.readUInt32BE(12) : 0;
  const tables = new Map<string, number>();
  const n = b.readUInt16BE(base + 4);
  for (let i = 0; i < n; i++) tables.set(b.toString("latin1", base + 12 + i * 16, base + 16 + i * 16), b.readUInt32BE(base + 12 + i * 16 + 8));
  const head = tables.get("head")!, hhea = tables.get("hhea")!, name = tables.get("name"), os2 = tables.get("OS/2");
  let family = "";
  if (name !== undefined) {
    const count = b.readUInt16BE(name + 2), strings = name + b.readUInt16BE(name + 4);
    let best = -1;
    for (let i = 0; i < count; i++) {
      const r = name + 6 + i * 12;
      const [platform, , , id, len, off] = [0, 2, 4, 6, 8, 10].map((o) => b.readUInt16BE(r + o));
      if (id !== 1 && id !== 16) continue;
      const rank = (id === 16 ? 2 : 0) + (platform === 3 ? 1 : 0);
      if (rank <= best) continue;
      const raw = b.subarray(strings + off, strings + off + len);
      family = platform === 3 || platform === 0 ? Buffer.from(raw).swap16().toString("utf16le") : raw.toString("latin1");
      best = rank;
    }
  }
  // bold / italic: OS/2 weight class and selection bits, else head's macStyle
  const fsSel = os2 !== undefined ? b.readUInt16BE(os2 + 62) : 0, mac = b.readUInt16BE(head + 44);
  const weight = os2 !== undefined ? b.readUInt16BE(os2 + 4) : 400;
  return { family: family.trim(), ascent: b.readInt16BE(hhea + 4), descent: b.readInt16BE(hhea + 6), upm: b.readUInt16BE(head + 18),
           bold: weight >= 600 || !!(fsSel & 0x20) || !!(mac & 1), italic: !!(fsSel & 1) || !!(mac & 2) };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => String(Math.round(v * 100) / 100);
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

/** One page of the issue as SVG (contract px in the viewBox, millimetres outside). */
export async function pageSvg(issue: IssueRender, pageNumber: number): Promise<string> {
  const page = issue.pages.find((p) => p.number === pageNumber);
  if (!page) throw new Error(`the issue has no page ${pageNumber}`);
  const dpi = issue.dpi ?? 300;
  const fonts = new Map<string, FontInfo>();
  for (const f of issue.fonts) {
    try { fonts.set(f.id, fontInfo(await readFile(assetFile(new URL(f.url, "http://x").pathname)))); }
    catch { fonts.set(f.id, { family: f.id, ascent: 800, descent: -200, upm: 1000, bold: (f.weight ?? 400) >= 600, italic: f.style === "italic" }); }
  }
  // the family, and its weight and style: Gopika's Regular and Bold share one family name
  const family = (id: string) => {
    const f = fonts.get(id);
    return `font-family="${esc(f?.family || id)}"${f?.bold ? ` font-weight="bold"` : ""}${f?.italic ? ` font-style="italic"` : ""}`;
  };
  // where CSS puts a line's baseline in its line box: the font's ascent plus
  // half the leading the line height leaves around ascent + descent
  const baseline = (id: string, size: number, lineHeight: number) => {
    const f = fonts.get(id) ?? { ascent: 800, descent: -200, upm: 1000 };
    const asc = (f.ascent / f.upm) * size, desc = (-f.descent / f.upm) * size;
    return (lineHeight - (asc + desc)) / 2 + asc;
  };

  const out: string[] = [];
  for (const e of page.elements as Element[]) {
    switch (e.kind) {
      case "rect":
        out.push(`<rect x="${n(e.x)}" y="${n(e.y)}" width="${n(e.width)}" height="${n(e.height)}"${e.radius ? ` rx="${n(e.radius)}"` : ""}` +
                 ` fill="${e.fill ?? "none"}"${e.stroke ? ` stroke="${e.stroke}" stroke-width="${n(e.strokeWidth ?? 1)}"` : ""}/>`);
        break;
      case "line":
        out.push(`<line x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}" stroke="${e.color}" stroke-width="${n(e.width)}"` +
                 `${e.dash ? ` stroke-dasharray="${e.dash.map(n).join(" ")}"` : ""}/>`);
        break;
      case "path":
        out.push(`<path d="${esc(e.d)}" fill="${e.fill ?? "none"}"${e.stroke ? ` stroke="${e.stroke}" stroke-width="${n(e.strokeWidth ?? 1)}"` : ""}/>`);
        break;
      case "image": {
        let href = e.url;
        try {
          const file = assetFile(new URL(e.url, "http://x").pathname);
          href = `data:${MIME[path.extname(file).toLowerCase()] ?? "image/jpeg"};base64,${(await readFile(file)).toString("base64")}`;
        } catch { /* left as a link */ }
        const fit = e.fit === "contain" ? "xMidYMid meet" : e.fit === "fill" ? "none" : "xMidYMid slice";
        out.push(`<image x="${n(e.x)}" y="${n(e.y)}" width="${n(e.width)}" height="${n(e.height)}" preserveAspectRatio="${fit}" href="${href}"/>`);
        break;
      }
      case "text":
        out.push(textSvg(e, family, baseline));
        break;
    }
  }
  const mm = (px: number) => n((px / dpi) * 25.4);
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mm(page.width)}mm" height="${mm(page.height)}mm" viewBox="0 0 ${n(page.width)} ${n(page.height)}">\n` +
    `<title>${esc(`Capital Kranti, ${issue.issueDate}, page ${pageNumber}`)}</title>\n` +
    `<rect width="${n(page.width)}" height="${n(page.height)}" fill="#fff"/>\n${out.join("\n")}\n</svg>\n`;
}

/** A text element: each of its lines as its own <text>, runs as <tspan>s. */
function textSvg(e: TextElement, family: (id: string) => string, baseline: (id: string, size: number, lh: number) => number): string {
  const runs = typeof e.text === "string" ? [{ text: e.text }] : e.text;
  // split the runs into lines at "\n"
  const lines: { text: string; font?: string; size?: number; color?: string }[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...r, text: part });
    });
  }
  const justify = e.align === "justify" || e.align === "justify-all";
  const anchor = e.align === "center" ? "middle" : e.align === "right" ? "end" : "start";
  const x0 = anchor === "middle" ? e.x + e.width / 2 : anchor === "end" ? e.x + e.width : e.x + (e.indent ?? 0);
  const h = e.hScale ?? 1;
  const out: string[] = [];
  lines.forEach((line, i) => {
    if (!line.length) return;
    const last = i === lines.length - 1;
    const y = e.y + i * e.lineHeight + baseline(e.font, e.size, e.lineHeight);
    const stretch = justify && (e.nowrap || !last || e.align === "justify-all");
    const attrs = [`x="${n(x0)}"`, `y="${n(y)}"`, family(e.font), `font-size="${n(e.size)}"`, `fill="${e.color ?? "#000"}"`,
      anchor !== "start" ? `text-anchor="${anchor}"` : "", e.letterSpacing ? `letter-spacing="${n(e.letterSpacing)}"` : "",
      e.wordSpacing ? `word-spacing="${n(e.wordSpacing)}"` : "", stretch ? `textLength="${n(e.width / h)}" lengthAdjust="spacing"` : "",
      h !== 1 ? `transform="translate(${n(e.x)} 0) scale(${h} 1) translate(${n(-e.x)} 0)"` : "", `xml:space="preserve"`].filter(Boolean).join(" ");
    const body = line.map((r) => {
      const style = [r.font ? family(r.font) : "", r.size ? `font-size="${n(r.size)}"` : "", r.color ? `fill="${r.color}"` : ""].filter(Boolean).join(" ");
      return style ? `<tspan ${style}>${esc(r.text)}</tspan>` : esc(r.text);
    }).join("");
    out.push(`<text ${attrs}>${body}</text>`);
  });
  return out.join("\n");
}
