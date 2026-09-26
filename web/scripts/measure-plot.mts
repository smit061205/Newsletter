// Plots an issue JSON with the frontend's own plotter (src/lib/plot.ts) in
// Chromium and prints its warnings as JSON -- no dev server needed. The mock
// backend (scripts/mock_backend/from_source.py) uses this to fit its text the
// way a real backend would: measured with the same fonts, by the same engine
// that will draw it.
//
//   node --experimental-strip-types --no-warnings scripts/measure-plot.mts <issue.json>
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { plotPage, staticWarnings, type PlotWarning } from "../src/lib/plot.ts";

const ORIGIN = "http://plot.local";
const PUBLIC = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "public");
const TYPES: Record<string, string> = {
  ".ttf": "font/ttf", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
};

const issue = JSON.parse(await readFile(process.argv[2], "utf8"));
const browser = await chromium.launch();
const context = await browser.newContext();
await context.route(`${ORIGIN}/**`, async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith("/__plot/")) {
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: plotPage(issue, Number(url.pathname.split("/").pop())) });
  }
  try {
    const body = await readFile(path.join(PUBLIC, decodeURIComponent(url.pathname)));
    return route.fulfill({ body, contentType: TYPES[path.extname(url.pathname)] ?? "application/octet-stream" });
  } catch {
    return route.fulfill({ status: 404, body: "" });
  }
});

const warnings: PlotWarning[] = staticWarnings(issue);
for (const page of issue.pages) {
  const tab = await context.newPage();
  await tab.goto(`${ORIGIN}/__plot/${page.number}`, { waitUntil: "load" });
  await tab.waitForFunction(() => (window as unknown as { __plotDone?: boolean }).__plotDone === true);
  warnings.push(...(await tab.evaluate(() => (window as unknown as { __plotWarnings: PlotWarning[] }).__plotWarnings)));
  await tab.close();
}
await browser.close();
console.log(JSON.stringify(warnings));
