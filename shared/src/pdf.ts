// Prints an issue to one PDF. Each page is the plotter's own HTML (plot.ts),
// printed by Chromium at exactly the page size the backend gave -- the same
// engine that draws the website preview, so screen and print can't disagree.
// Also returns the plotter's warnings (text overflow, failed images/fonts,
// elements off the page); printing never changes anything to hide them.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { IssueRender } from "./contract.ts";
import { plotPage, staticWarnings, type PlotWarning } from "./plot.ts";

export interface PrintResult {
  pdf: Uint8Array;
  warnings: PlotWarning[];
  /** PNG of each page, in page order, when asked for (`images`). */
  images?: Uint8Array[];
}

export interface PrintOptions {
  /** Where relative font/image URLs resolve -- the website's own origin. */
  origin: string;
  /** Serve every other request on `origin` from this folder instead of the
   * network (the backend checks its pages with no web server running). */
  publicDir?: string;
  /** Plot and check only, no PDF (faster: the backend's fitting loop). */
  checkOnly?: boolean;
  /** Map a URL path to a file on disk (wins over publicDir), e.g. a
   * publication's private fonts. */
  resolve?: (pathname: string) => string;
  /** Also render each page to a PNG at this many dots per inch -- for a
   * website that mustn't load the paper's licensed fonts itself. */
  images?: number;
}

const TYPES: Record<string, string> = {
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
};

export async function printIssue(issue: IssueRender, options: PrintOptions | string): Promise<PrintResult> {
  const { origin, publicDir, checkOnly, resolve, images } = typeof options === "string" ? { origin: options } as PrintOptions : options;
  const browser = await chromium.launch();
  try {
    // the plotted page is laid out in CSS px (96 per inch): this scale gives the asked-for dpi
    const context = await browser.newContext(images ? { deviceScaleFactor: images / 96 } : {});
    const merged = await PDFDocument.create();
    const pngs: Uint8Array[] = [];
    const warnings: PlotWarning[] = staticWarnings(issue);
    // inches, not CSS px: Chromium rounds a px page size, which drifted the
    // printed page ~0.5pt off the size the backend asked for
    const inches = (v: number) => `${(v / issue.dpi).toFixed(5)}in`;

    // Serve each plotted page at a URL on this app's own origin, straight
    // from memory: fonts and images then load same-origin (a blank tab with
    // setContent has an opaque origin, and browsers refuse cross-origin font
    // loads without CORS -- every font "failed" and text silently fell back).
    if (publicDir || resolve) {
      await context.route(`${origin}/**`, async (route) => {
        const { pathname } = new URL(route.request().url());
        if (pathname.startsWith("/__plot/")) return route.fallback();
        try {
          const file = resolve ? resolve(pathname) : path.join(publicDir!, decodeURIComponent(pathname));
          const body = await readFile(file);
          return route.fulfill({ body, contentType: TYPES[path.extname(pathname).toLowerCase()] ?? "application/octet-stream" });
        } catch {
          return route.fulfill({ status: 404, body: "" });
        }
      });
    }
    await context.route(`${origin}/__plot/*`, (route) => {
      const n = Number(new URL(route.request().url()).pathname.split("/").pop());
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: plotPage(issue, n) });
    });

    for (const page of [...issue.pages].sort((a, b) => a.number - b.number)) {
      const tab = await context.newPage();
      await tab.goto(`${origin}/__plot/${page.number}`, { waitUntil: "load", timeout: 60_000 });
      await tab.waitForFunction(() => (window as unknown as { __plotDone?: boolean }).__plotDone === true, null,
                                { timeout: 60_000 });
      warnings.push(...(await tab.evaluate(() => (window as unknown as { __plotWarnings: PlotWarning[] }).__plotWarnings)));
      if (checkOnly) {
        await tab.close();
        continue;
      }
      if (images) {
        const css = (v: number) => Math.ceil((v * 96) / issue.dpi);
        await tab.setViewportSize({ width: css(page.width), height: css(page.height) });
        pngs.push(await tab.screenshot({ clip: { x: 0, y: 0, width: (page.width * 96) / issue.dpi, height: (page.height * 96) / issue.dpi } }));
      }
      const bytes = await tab.pdf({
        width: inches(page.width), height: inches(page.height),
        printBackground: true, pageRanges: "1", margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      const single = await PDFDocument.load(bytes);
      const [copied] = await merged.copyPages(single, [0]);
      // Chromium quantizes the page size (1105.5pt came out 1105.92pt), so
      // set the exact size the backend asked for, keeping the top-left corner
      // fixed -- the sliver trimmed is the page's own blank right/bottom edge.
      const w = (page.width / issue.dpi) * 72;
      const h = (page.height / issue.dpi) * 72;
      const { height: printedH } = copied.getSize();
      copied.setMediaBox(0, printedH - h, w, h);
      copied.setCropBox(0, printedH - h, w, h);
      merged.addPage(copied);
      await tab.close();
    }
    return { pdf: await merged.save(), warnings, ...(images ? { images: pngs } : {}) };
  } finally {
    await browser.close();
  }
}
