// Text measurement in the engine that will draw the text. One headless
// Chromium, with the issue's fonts loaded from the same files the website
// serves, breaks lines with canvas measureText -- the same shaping (HarfBuzz)
// Chromium uses on the page -- so a line the backend says fits does fit when
// the frontend plots it. Lengths are contract px throughout: widths scale
// linearly with font size, so the CSS-px vs 300-DPI-px factor cancels out.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { Font, TextRun } from "@ck/shared/contract";
import { assetFile, PLOT_ORIGIN, PUBLIC_DIR } from "../config.ts";
import { BharatiEncoder } from "../fonts/bharati.ts";

/** How each font's text is written: in Unicode, or in a legacy font's own
 * glyph codes -- and which font sets Latin letters and digits for it. */
export interface Faces {
  encoding: Record<string, "unicode" | "bharati">;
  latin: Record<string, string>;
}

/** A piece of printed text: `text` as it goes to the font, `font` unset for
 * the element's own font. */
export interface Run { text: string; font?: string }

export interface BreakRequest {
  /** Paragraphs; each is broken into lines on its own. */
  paras: string[];
  width: number;
  font: string;
  size: number;
  hScale?: number;
  /** First-line indent of each paragraph. */
  indent?: number;
  /** Share of the width a line may fill (default SAFETY). Display lines are
   * single elements with nothing to give: they keep a wider margin. */
  safety?: number;
}

export interface Line {
  /** The line as Unicode (what it says). */
  text: string;
  /** The line as printed: glyph codes for a legacy font, Latin runs in their own font. */
  runs: Run[];
  /** Index of the paragraph this line belongs to. */
  para: number;
  /** First / last line of its paragraph. */
  start: boolean;
  end: boolean;
  /** Natural width (after hScale). */
  width: number;
}

// A line must come out no wider than this share of its box: Chromium's own
// layout can differ from canvas measurement by a hair, and a line that wraps
// on the page would overflow by a whole line.
const SAFETY = 0.995;

const family = (id: string) => `f-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

/** Element top (contract px) that puts a line's baseline on `baseline`
 * (contract px) in Chromium's printed PDF -- the measured rule documented in
 * docs/RENDER_CONTRACT.md ("Placing text exactly"). */
export function topFor(baseline: number, fontAscent: number, fontDescent: number, lineHeight: number, dpi = 300): number {
  const k = 96 / dpi; // contract px -> CSS px
  const a = Math.round(fontAscent * k);
  const d = Math.round(fontDescent * k);
  const offset = a + Math.floor((lineHeight * k - a - d) / 2);
  return Math.round(baseline * k - offset - 1) / k;
}

const LATIN_TOKEN = /[A-Za-z0-9]+(?:[.,:\-\/%&+'’][A-Za-z0-9]+)*|[^A-Za-z0-9]+/g;

/** Merge neighbouring runs in the same font. */
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.font === r.font) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

/** Text element fields for lines (and "\n" / "\n\n" separators): a plain
 * string when everything is in the element's own font, styled runs
 * otherwise; plus the Unicode text when the font is a legacy one. */
export function elementText(pieces: (Line | string)[], legacy: boolean): { text: string | TextRun[]; plainText?: string } {
  const runs = mergeRuns(pieces.flatMap((p) => (typeof p === "string" ? [{ text: p }] : p.runs)));
  const text = runs.every((r) => !r.font) ? runs.map((r) => r.text).join("") : runs.map((r) => (r.font ? { text: r.text, font: r.font } : { text: r.text }));
  if (!legacy) return { text };
  return { text, plainText: pieces.map((p) => (typeof p === "string" ? (p.includes("\n\n") ? "\n\n" : "\n") : p.text)).join("") };
}

export class Measurer {
  private browser: Browser;
  private page: Page;
  private faces: Faces;
  private encoder: BharatiEncoder | null;
  /** Text the encoder couldn't set in the legacy font (reported by the build). */
  unencodable = new Set<string>();

  private constructor(browser: Browser, page: Page, faces: Faces) {
    this.browser = browser;
    this.page = page;
    this.faces = faces;
    this.encoder = Object.values(faces.encoding).includes("bharati") ? new BharatiEncoder() : null;
  }

  /** Is this font written in a legacy glyph encoding? */
  isLegacy(font: string): boolean {
    return this.faces.encoding[font] === "bharati";
  }

  /** A word (or any text) as printed in `font`: legacy fonts get their glyph
   * codes, with Latin letters and digits in the font's Latin partner. */
  shape(text: string, font: string): Run[] {
    if (!this.isLegacy(font) || !this.encoder) return [{ text }];
    const latin = this.faces.latin[font];
    const runs: Run[] = [];
    for (const tok of text.match(LATIN_TOKEN) ?? []) {
      if (/^[A-Za-z0-9]/.test(tok) && latin) {
        runs.push({ text: tok, font: latin });
      } else {
        const e = this.encoder.encode(tok);
        e.unknown.forEach((u) => this.unencodable.add(u));
        runs.push({ text: e.text });
      }
    }
    return mergeRuns(runs);
  }

  static async open(fonts: Font[], faces: Faces = { encoding: {}, latin: {} }, publicDir = PUBLIC_DIR): Promise<Measurer> {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const fontFaces = fonts
      .map((f) => `@font-face{font-family:"${family(f.id)}";src:url("${f.url}");font-weight:${f.weight ?? 400};font-display:block}`)
      .join("");
    await context.route(`${PLOT_ORIGIN}/**`, async (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === "/__measure") {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><meta charset="utf-8"><style>${fontFaces}</style>` });
      }
      try {
        const file = publicDir === PUBLIC_DIR ? assetFile(pathname) : path.join(publicDir, decodeURIComponent(pathname));
        return route.fulfill({ body: await readFile(file) });
      } catch {
        return route.fulfill({ status: 404, body: "" });
      }
    });
    const page = await context.newPage();
    await page.goto(`${PLOT_ORIGIN}/__measure`);
    const failed = await page.evaluate(async (families) => {
      const bad: string[] = [];
      for (const f of families) {
        const loaded = await document.fonts.load(`40px "${f}"`, "a");
        if (!loaded.length) bad.push(f);
      }
      return bad;
    }, fonts.map((f) => family(f.id)));
    if (failed.length) {
      await browser.close();
      throw new Error(`fonts failed to load for measuring: ${failed.join(", ")}`);
    }
    return new Measurer(browser, page, faces);
  }

  /** Greedy line breaking, many requests per round trip. A word longer than
   * the whole width gets a line to itself (and its width says it overflows).
   * Widths are measured on the text as printed (see shape()). */
  async breakLines(requests: BreakRequest[]): Promise<Line[][]> {
    const reqs = requests.map((r) => ({
      width: r.width, size: r.size, hScale: r.hScale ?? 1, indent: r.indent ?? 0, safety: r.safety ?? SAFETY,
      base: family(r.font),
      space: this.shape(" ", r.font)[0].text,
      paras: r.paras.map((p) => p.split(/\s+/).filter(Boolean).map((w) => ({
        word: w, runs: this.shape(w, r.font).map((x) => ({ text: x.text, font: x.font ?? null, family: family(x.font ?? r.font) })),
      }))),
    }));
    const raw = await this.page.evaluate(({ reqs }) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      return reqs.map((r) => {
        const width = (runs: { text: string; family: string }[]) => runs.reduce((a, x) => {
          ctx.font = `${r.size}px "${x.family}"`;
          return a + ctx.measureText(x.text).width;
        }, 0) * r.hScale;
        ctx.font = `${r.size}px "${r.base}"`;
        const spaceW = ctx.measureText(r.space).width * r.hScale;
        const out: { words: number[]; para: number; start: boolean; end: boolean; width: number }[] = [];
        r.paras.forEach((words, pi) => {
          const ws = words.map((w) => width(w.runs));
          let cur: number[] = [];
          let curW = 0;
          let first = true;
          ws.forEach((wWidth, i) => {
            const candW = cur.length ? curW + spaceW + wWidth : wWidth;
            const avail = (r.width - (first ? r.indent : 0)) * r.safety;
            if (!cur.length || candW <= avail) {
              cur.push(i);
              curW = candW;
            } else {
              out.push({ words: cur, para: pi, start: first, end: false, width: curW });
              cur = [i];
              curW = wWidth;
              first = false;
            }
          });
          if (cur.length) out.push({ words: cur, para: pi, start: first, end: true, width: curW });
        });
        return out;
      });
    }, { reqs });
    return raw.map((lines, ri) => lines.map((l) => {
      const words = reqs[ri].paras[l.para];
      const runs: Run[] = [];
      l.words.forEach((wi, k) => {
        if (k) runs.push({ text: reqs[ri].space });
        for (const x of words[wi].runs) runs.push(x.font ? { text: x.text, font: x.font } : { text: x.text });
      });
      return { text: l.words.map((wi) => words[wi].word).join(" "), runs: mergeRuns(runs),
               para: l.para, start: l.start, end: l.end, width: l.width };
    }));
  }

  /** Width of single strings as printed (after hScale), e.g. to size a headline line. */
  async widths(items: { text: string; font: string; size: number; hScale?: number }[]): Promise<number[]> {
    const list = items.map((i) => ({
      size: i.size, hScale: i.hScale ?? 1,
      runs: this.shape(i.text, i.font).map((x) => ({ text: x.text, family: family(x.font ?? i.font) })),
    }));
    return this.page.evaluate((list) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      return list.map((i) => i.runs.reduce((a, x) => {
        ctx.font = `${i.size}px "${x.family}"`;
        return a + ctx.measureText(x.text).width;
      }, 0) * i.hScale);
    }, list);
  }

  /** How far each text's letters reach above and below its baseline (its
   * ink), and its font's ascent/descent (what Chromium uses for the line box). */
  async ink(items: { text: string; font: string; size: number }[]): Promise<{ ascent: number; descent: number; fontAscent: number; fontDescent: number }[]> {
    const list = items.map((i) => ({
      size: i.size, family: family(i.font),
      runs: this.shape(i.text, i.font).map((x) => ({ text: x.text, family: family(x.font ?? i.font) })),
    }));
    return this.page.evaluate((list) => {
      const ctx = document.createElement("canvas").getContext("2d")!;
      return list.map((i) => {
        let ascent = 0;
        let descent = 0;
        for (const r of i.runs) {
          ctx.font = `${i.size}px "${r.family}"`;
          const m = ctx.measureText(r.text);
          ascent = Math.max(ascent, m.actualBoundingBoxAscent);
          descent = Math.max(descent, m.actualBoundingBoxDescent);
        }
        // the line box comes from the element's own font -- at a large size,
        // as em ratios, then scaled: canvas rounds them to whole px
        ctx.font = `1000px "${i.family}"`;
        const big = ctx.measureText("a");
        return { ascent, descent, fontAscent: big.fontBoundingBoxAscent / 1000 * i.size, fontDescent: big.fontBoundingBoxDescent / 1000 * i.size };
      });
    }, list);
  }

  /** Natural pixel size of an image URL (relative URLs resolve against the
   * website's public folder), or null if it doesn't load. */
  async imageSize(url: string): Promise<{ width: number; height: number } | null> {
    return this.page.evaluate((src) => new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = src;
    }), url);
  }

  async close() {
    await this.browser.close();
  }
}
