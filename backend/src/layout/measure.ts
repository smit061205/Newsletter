// Text measurement in the engine that will draw the text. One headless
// Chromium, with the issue's fonts loaded from the same files the website
// serves, breaks lines with canvas measureText -- the same shaping (HarfBuzz)
// Chromium uses on the page -- so a line the backend says fits does fit when
// the frontend plots it. Lengths are contract px throughout: widths scale
// linearly with font size, so the CSS-px vs 300-DPI-px factor cancels out.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { acquireBrowser, releaseBrowser } from "../browser.ts";
import type { Font, TextRun } from "@ck/shared/contract";
import { assetFile, PLOT_ORIGIN, PUBLIC_DIR } from "../config.ts";
import { cmapCoverage } from "../fonts/cmap.ts";
import { BharatiEncoder } from "../fonts/bharati.ts";
import { breakParagraph, type Word } from "./linebreak.ts";

/** How each font's text is written: in Unicode, or in a legacy font's own
 * glyph codes -- and which font sets Latin letters and digits for it. */
export interface Faces {
  encoding: Record<string, "unicode" | "bharati">;
  latin: Record<string, string>;
  /** a Unicode font's fallback for the characters it lacks */
  fallback?: Record<string, string>;
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
  /** Total-fit breaking for justified text (linebreak.ts), every line then
   * spread to exactly the width; otherwise greedy, lines at natural width. */
  optimal?: boolean;
  /** Per paragraph (optimal only): lines more (+) or fewer (-) than its best setting, where that sets well. */
  looseness?: number[];
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
  /** Word spaces in the line, and the letters spacing goes between (for
   * spreading it to a width: linebreak.ts spread()). */
  spaces: number;
  letters: number;
  /** The font's space at this size. */
  spaceWidth: number;
}

// A line must come out no wider than this share of its box: Chromium's own
// layout can differ from canvas measurement by a hair, and a line that wraps
// on the page would overflow by a whole line.
const SAFETY = 0.995;
/** The share of the width a justified line of a kerned script (Hindi, Urdu) is broken to. */
const KERNED_SAFETY = 0.994;

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

// ASCII marks the Gopika (legacy) faces draw as something else -- "@" as જ,
// "[" as ચ, "{" as મ, '"' as ×, "*" as a star (checked glyph by glyph, 24 Oct):
// only ! % ( ) + , - . / : ; = ? and the quotes print as themselves
const LEGACY_TAKEN = /(["#$&*<>@[\\\]^_{|}~]+)/;
const LATIN_TOKEN = /[A-Za-z0-9]+(?:[.,:\-\/%&+'’][A-Za-z0-9]+)*|[^A-Za-z0-9]+/g;

/** A long word joined by dashes ("જયપુર–ટાટાનગર–સંતરાગાછી", 26 Oct: a headline
 * line ran into the next column) may break after a dash, its parts glued. */
export function dashParts(tok: string): string[] {
  if (tok.length <= 10) return [tok];
  return tok.split(/(?<=[–—])(?=\S)|(?<=[^\d\s-]-)(?=[^\d\s-])/);
}

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
  /** its own tab in the engine's one browser (browser.ts) */
  private context: BrowserContext;
  private closed = false;
  private page: Page;
  private faces: Faces;
  /** each font's characters (fonts/cmap.ts), for the fallbacks */
  private coverage = new Map<string, Set<number>>();
  private encoder: BharatiEncoder | null;
  /** Text the encoder couldn't set in the legacy font (reported by the build). */
  unencodable = new Set<string>();

  private constructor(context: BrowserContext, page: Page, faces: Faces) {
    this.context = context;
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
    if (!this.isLegacy(font) || !this.encoder) {
      // a character the font lacks, in the first of its fallbacks (and theirs) that has it
      const has = this.coverage.get(font);
      if (!this.faces.fallback?.[font] || !has) return [{ text }];
      const chain: string[] = [];
      for (let f = this.faces.fallback[font]; f && !chain.includes(f) && chain.length < 4; f = this.faces.fallback?.[f]) chain.push(f);
      const runs: Run[] = [];
      for (const ch of text) {
        const c = ch.codePointAt(0)!;
        const fb = has.has(c) || /\s/.test(ch) ? undefined : chain.find((f) => this.coverage.get(f)?.has(c));
        runs.push(fb ? { text: ch, font: fb } : { text: ch });
      }
      return mergeRuns(runs);
    }
    const latin = this.faces.latin[font];
    const runs: Run[] = [];
    for (const tok of text.match(LATIN_TOKEN) ?? []) {
      if (/^[A-Za-z0-9]/.test(tok) && latin) {
        runs.push({ text: tok, font: latin });
        continue;
      }
      // a mark whose code the legacy font gives a Gujarati letter is set in
      // the Latin face (24 Oct: "CHHAAP@Sabarmati" printed "CHHAAPજSabarmati")
      for (const part of latin ? tok.split(LEGACY_TAKEN) : [tok]) {
        if (!part) continue;
        if (latin && LEGACY_TAKEN.test(part)) { runs.push({ text: part, font: latin }); continue; }
        const e = this.encoder.encode(part);
        e.unknown.forEach((u) => this.unencodable.add(u));
        runs.push({ text: e.text });
      }
    }
    return mergeRuns(runs);
  }

  static async open(fonts: Font[], faces: Faces = { encoding: {}, latin: {} }, publicDir = PUBLIC_DIR): Promise<Measurer> {
    const browser = await acquireBrowser();
    let context: BrowserContext;
    try { context = await browser.newContext(); } catch (e) { releaseBrowser(); throw e; }
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
    // (a tab that fails to open gives its share of the browser back)
    const opened = async () => {
      const p = await context.newPage();
      await p.goto(`${PLOT_ORIGIN}/__measure`);
      return p;
    };
    let page: Page;
    try { page = await opened(); } catch (e) { await context.close().catch(() => {}); releaseBrowser(); throw e; }
    const failed = await page.evaluate(async (families) => {
      const bad: string[] = [];
      for (const f of families) {
        const loaded = await document.fonts.load(`40px "${f}"`, "a");
        if (!loaded.length) bad.push(f);
      }
      return bad;
    }, fonts.map((f) => family(f.id)));
    if (failed.length) {
      await context.close().catch(() => {});
      releaseBrowser();
      throw new Error(`fonts failed to load for measuring: ${failed.join(", ")}`);
    }
    const m = new Measurer(context, page, faces);
    for (const f of fonts) {
      try {
        const file = publicDir === PUBLIC_DIR ? assetFile(f.url) : path.join(publicDir, decodeURIComponent(f.url));
        m.coverage.set(f.id, cmapCoverage(await readFile(file)));
      } catch { /* a font that didn't load is reported above */ }
    }
    return m;
  }

  // what's been measured already, for the life of this measurer: a word's
  // width doesn't depend on the line it's in, so a story set again at
  // another width or length (layout/blocks.ts) costs no round trip
  private wordCache = new Map<string, { width: number; letters: number }>();
  private spaceCache = new Map<string, number>();
  private inkCache = new Map<string, { ascent: number; descent: number; fontAscent: number; fontDescent: number }>();
  private widthCache = new Map<string, number>();

  /** Widths of the words of each request's paragraphs (contract px, after
   * hScale), how many letters letter spacing applies to in each, and the
   * width of a space -- from the cache, the words not measured yet in one
   * round trip. */
  private async measureWords(reqs: { size: number; hScale: number; base: string; space: string; kern: boolean;
                                     paras: { word: string; runs: { text: string; family: string }[] }[][] }[]) {
    type Req = (typeof reqs)[number];
    // (a kerned script's word space is measured between the request's own first
    // two words, and differs by them: so it's one of the key)
    const pair = (r: Req) => (r.kern ? (r.paras.find((p) => p.length > 1)?.slice(0, 2).map((w) => w.runs.map((x) => x.text).join("")).join(" ") ?? "") : "");
    const group = (r: Req) => `${r.base}|${r.size}|${r.hScale}|${r.kern ? 1 : 0}|${r.space}|${pair(r)}`;
    const wordGroup = (r: Req) => `${r.base}|${r.size}|${r.hScale}|${r.kern ? 1 : 0}`;
    const wordKey = (r: Req, w: Req["paras"][number][number]) => `${wordGroup(r)}|${w.runs.map((x) => `${x.family}:${x.text}`).join("\u0001")}`;
    // per group: the words still to measure, and the request its space is measured from
    const todo = new Map<string, { req: Req; words: Map<string, Req["paras"][number][number]> }>();
    for (const r of reqs) {
      const g = group(r);
      for (const p of r.paras) {
        for (const w of p) {
          const k = wordKey(r, w);
          if (this.wordCache.has(k)) continue;
          if (!todo.has(g)) todo.set(g, { req: r, words: new Map() });
          todo.get(g)!.words.set(k, w);
        }
      }
      if (!this.spaceCache.has(g) && !todo.has(g)) todo.set(g, { req: r, words: new Map() });
    }
    if (todo.size) {
      const send = [...todo.values()].map(({ req, words }) => ({
        ...req,
        // the request's first two words first: its word space is measured between them
        paras: [req.paras.find((p) => p.length > 1)?.slice(0, 2) ?? [], [...words.values()]],
      }));
      const got = await this.measureRaw(send);
      [...todo].forEach(([g, { words }], i) => {
        this.spaceCache.set(g, got[i].space);
        [...words.keys()].forEach((k, j) => this.wordCache.set(k, got[i].paras[1][j]));
      });
    }
    return reqs.map((r) => {
      const g = group(r);
      return { space: this.spaceCache.get(g)!, paras: r.paras.map((p) => p.map((w) => ({ ...this.wordCache.get(wordKey(r, w))! }))) };
    });
  }

  private async measureRaw(reqs: { size: number; hScale: number; base: string; space: string; kern: boolean;
                                   paras: { word: string; runs: { text: string; family: string }[] }[][] }[]) {
    return this.page.evaluate(({ reqs }) => {
      const ctx = document.createElement("canvas").getContext("2d")! as CanvasRenderingContext2D & { letterSpacing: string };
      const TEST = 10;
      const measure = (runs: { text: string; family: string }[], size: number) => {
        let w = 0;
        let spaced = 0;
        for (const x of runs) {
          ctx.font = `${size}px "${x.family}"`;
          ctx.letterSpacing = "0px";
          const plain = ctx.measureText(x.text).width;
          ctx.letterSpacing = `${TEST}px`;
          spaced += ctx.measureText(x.text).width - plain;
          w += plain;
        }
        ctx.letterSpacing = "0px";
        return { w, letters: Math.round(spaced / TEST) };
      };
      // a word space as it sets between words: some fonts kern their letters
      // against the space (Tiro Devanagari, by ~2px a space at body size), so
      // it's measured between two of the text's own words, not on its own
      const spaceOf = (r: (typeof reqs)[number]) => {
        const alone = measure([{ text: r.space, family: r.base }], r.size).w;
        const words = r.paras.find((p) => p.length > 1);
        if (!r.kern || !words || words[0].runs.length !== 1 || words[1].runs.length !== 1) return alone;
        const [a, b] = [words[0].runs[0].text, words[1].runs[0].text];
        const inContext = measure([{ text: a + r.space + b, family: r.base }], r.size).w - measure([{ text: a, family: r.base }], r.size).w
          - measure([{ text: b, family: r.base }], r.size).w;
        return inContext > alone * 0.5 && inContext < alone * 2 ? inContext : alone;
      };
      return reqs.map((r) => {
        // text justified in its word spaces alone (Hindi, Urdu) sets kerned, so
        // it's measured kerned (a canvas leaves kerning out by default: Tiro
        // Devanagari measured ~2% narrow and overran); letter-spaced text
        // (Gujarati, English) as it always was
        ctx.fontKerning = r.kern ? "normal" : "auto";
        return {
        space: spaceOf(r) * r.hScale,
        paras: r.paras.map((words) => words.map((w) => {
          const m = measure(w.runs, r.size);
          return { width: m.w * r.hScale, letters: m.letters };
        })),
      };
      });
    }, { reqs });
  }

  /** Lines of text, many requests per round trip: Chromium measures every
   * word once (its width, and how many letters letter spacing applies to),
   * then the breaks are chosen here -- total-fit for justified text
   * (`optimal`), greedy otherwise. A word longer than the whole width gets
   * a line to itself (and its width says it overflows). Widths are measured
   * on the text as printed (see shape()). */
  async breakLines(requests: BreakRequest[]): Promise<Line[][]> {
    // a story's body breaks the same at every width it's set at (its column
    // is always one grid column): broken once, for every setting of it (layout/blocks.ts)
    const keys = requests.map((r) => JSON.stringify(r));
    const missing = requests.filter((_, i) => !this.lineCache.has(keys[i]));
    if (missing.length) {
      const got = await this.breakLinesRaw(missing);
      missing.forEach((r, i) => this.lineCache.set(JSON.stringify(r), got[i]));
    }
    return keys.map((k) => this.lineCache.get(k)!);
  }

  private lineCache = new Map<string, Line[]>();

  private async breakLinesRaw(requests: BreakRequest[]): Promise<Line[][]> {
    const unspaced = /[\u0600-\u06FF\u0750-\u077F\u0900-\u097F]/;
    const reqs = requests.map((r) => ({
      size: r.size, hScale: r.hScale ?? 1, kern: r.paras.some((p) => unspaced.test(p)),
      base: family(r.font),
      space: this.shape(" ", r.font)[0].text,
      // a long token may break after a "/" (a URL, "PLI/RPLI"), and a long
      // email or web address after its "@" and dots too (26 Oct: an address
      // alone on a line ran 7 mm past its column): its parts glued, no space between
      // (a part still too long for a column -- a web address's code,
      // "Url9dlIwCinQVSf8lwPB9w/", 26 Oct's copies -- breaks every 8 letters)
      paras: r.paras.map((p) => p.split(/\s+/).filter(Boolean).flatMap((tok) =>
        (tok.length > 14 && /^[\w.@\-+:/%?=&#~]+$/.test(tok) && /[A-Za-z]{2}/.test(tok) && /[@./]/.test(tok)
          ? tok.split(/(?<=[@/])(?=[^/])|(?<=\.)(?=\w)/).flatMap((w) => (w.length > 12 ? w.match(/.{1,8}/g)! : [w]))
          : tok.length > 10 && tok.includes("/") ? tok.split(/(?<=\/)(?=[^/])/) : dashParts(tok)).map((w, k) => ({
          word: w, glue: k > 0, runs: this.shape(w, r.font).map((x) => ({ text: x.text, font: x.font ?? null, family: family(x.font ?? r.font) })),
        })))),
    }));
    const measured = await this.measureWords(reqs);
    // the glue goes with each measured word; a cursive script (Urdu,
    // Arabic) is never letter-spaced -- it would break the joins -- nor is
    // Devanagari (Hindi), whose letters hang from one line along their tops:
    // their lines justify in their word spaces alone
    // (the whole paragraph: letter spacing applies to every letter of a line,
    // so an English word or a number in a Hindi line takes none either)
    measured.forEach((m, ri) => m.paras.forEach((ws, pi) => {
      const none = reqs[ri].paras[pi].some((w) => unspaced.test(w.word));
      ws.forEach((w, wi) => {
        if (reqs[ri].paras[pi][wi].glue) (w as Word).glue = true;
        if (none) w.letters = 0;
      });
    }));

    return requests.map((req, ri) => {
      const r = reqs[ri];
      const { space, paras } = measured[ri];
      const width = req.width;
      const indent = req.indent ?? 0;
      const safety = req.safety ?? SAFETY;
      const out: Line[] = [];
      paras.forEach((words, pi) => {
        let starts: number[];
        if (req.optimal) {
          // (a kerned script prints a hair wider than the canvas measures it: Hindi
          // lines ran 5-6 px over (22 Oct): broken to 99.4% of the width, then spread to it)
          const fit = r.kern ? KERNED_SAFETY : 1;
          starts = breakParagraph(words, space, req.size, (width - indent) * fit, width * fit, req.looseness?.[pi] ?? 0);
        } else {
          starts = [0];
          let cur = 0;
          words.forEach((w, i) => {
            if (i === 0) { cur = w.width; return; }
            const avail = (width - (starts.length === 1 ? indent : 0)) * safety;
            const gap = (w as Word).glue ? 0 : space;
            if (cur + gap + w.width <= avail) cur += gap + w.width;
            else { starts.push(i); cur = w.width; }
          });
        }
        starts.forEach((i, k) => {
          const j = starts[k + 1] ?? words.length;
          const runs: Run[] = [];
          let spaces = 0;
          for (let wi = i; wi < j; wi++) {
            if (wi > i && !r.paras[pi][wi].glue) { runs.push({ text: r.space }); spaces++; }
            for (const x of r.paras[pi][wi].runs) runs.push(x.font ? { text: x.text, font: x.font } : { text: x.text });
          }
          out.push({
            text: r.paras[pi].slice(i, j).map((w, k) => (k > 0 && !w.glue ? " " : "") + w.word).join(""), runs: mergeRuns(runs), para: pi,
            start: k === 0, end: j === words.length,
            width: words.slice(i, j).reduce((a, w) => a + w.width, 0) + spaces * space,
            spaces, spaceWidth: space,
            // (as linebreak.ts counts them: none on a line of cursive words)
            letters: ((n) => (n ? n + spaces - 1 : 0))(words.slice(i, j).reduce((a, w) => a + w.letters, 0)),
          });
        });
      });
      return out;
    });
  }

  /** The words of `text` as printed in `font` at `size`: each word's runs,
   * width and letter count, and the space between words. For display lines,
   * set and fitted by layout/display.ts. */
  async words(text: string, font: string, size: number): Promise<{ words: (Word & { word: string; runs: Run[]; glue?: boolean })[]; space: number; spaceText: string }> {
    // Hindi and Urdu: kerned, and never letter-spaced (see breakLines)
    const unspaced = /[\u0600-\u06FF\u0750-\u077F\u0900-\u097F]/.test(text);
    const req = {
      size, hScale: 1, base: family(font), space: this.shape(" ", font)[0].text, kern: unspaced,
      paras: [text.split(/\s+/).filter(Boolean).flatMap((tok) => dashParts(tok).map((w, k) => ({
        word: w, glue: k > 0, runs: this.shape(w, font).map((x) => ({ text: x.text, font: x.font ?? null, family: family(x.font ?? font) })),
      })))],
    };
    const [m] = await this.measureWords([req]);
    if (unspaced) for (const w of m.paras[0]) w.letters = 0;
    return {
      space: m.space, spaceText: req.space,
      words: m.paras[0].map((w, i) => ({ ...w, word: req.paras[0][i].word, ...(req.paras[0][i].glue ? { glue: true } : {}),
                                          runs: req.paras[0][i].runs.map((x) => (x.font ? { text: x.text, font: x.font } : { text: x.text })) })),
    };
  }

  /** Width of single strings as printed (after hScale), e.g. to size a headline line. */
  async widths(items: { text: string; font: string; size: number; hScale?: number }[]): Promise<number[]> {
    const key = (i: (typeof items)[number]) => `${i.font}|${i.size}|${i.hScale ?? 1}|${i.text}`;
    const missing = items.filter((i) => !this.widthCache.has(key(i)));
    if (missing.length) {
      const got = await this.widthsRaw(missing);
      missing.forEach((i, n) => this.widthCache.set(key(i), got[n]));
    }
    return items.map((i) => this.widthCache.get(key(i))!);
  }

  private async widthsRaw(items: { text: string; font: string; size: number; hScale?: number }[]): Promise<number[]> {
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
    const key = (i: (typeof items)[number]) => `${i.font}|${i.size}|${i.text}`;
    const missing = items.filter((i) => !this.inkCache.has(key(i)));
    if (missing.length) {
      const got = await this.inkRaw(missing);
      missing.forEach((i, n) => this.inkCache.set(key(i), got[n]));
    }
    return items.map((i) => ({ ...this.inkCache.get(key(i))! }));
  }

  private async inkRaw(items: { text: string; font: string; size: number }[]): Promise<{ ascent: number; descent: number; fontAscent: number; fontDescent: number }[]> {
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
    if (this.closed) return;
    this.closed = true;
    await this.context.close().catch(() => {});
    releaseBrowser();
  }
}
