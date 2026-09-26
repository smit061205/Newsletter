// Prints an issue to one PDF. Each page is the plotter's own HTML (plot.ts),
// printed by Chromium at exactly the page size the backend gave -- the same
// engine that draws the website preview, so screen and print can't disagree.
// Also returns the plotter's warnings (text overflow, failed images/fonts,
// elements off the page); printing never changes anything to hide them.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import type { IssueRender } from "./contract";
import { plotPage, staticWarnings, type PlotWarning } from "./plot";

export interface PrintResult {
  pdf: Uint8Array;
  warnings: PlotWarning[];
}

/** `origin` is where relative font/image URLs resolve (this app's origin). */
export async function printIssue(issue: IssueRender, origin: string): Promise<PrintResult> {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const merged = await PDFDocument.create();
    const warnings: PlotWarning[] = staticWarnings(issue);
    // inches, not CSS px: Chromium rounds a px page size, which drifted the
    // printed page ~0.5pt off the size the backend asked for
    const inches = (v: number) => `${(v / issue.dpi).toFixed(5)}in`;

    // Serve each plotted page at a URL on this app's own origin, straight
    // from memory: fonts and images then load same-origin (a blank tab with
    // setContent has an opaque origin, and browsers refuse cross-origin font
    // loads without CORS -- every font "failed" and text silently fell back).
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
    return { pdf: await merged.save(), warnings };
  } finally {
    await browser.close();
  }
}
