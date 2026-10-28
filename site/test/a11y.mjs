// The website's accessibility check (axe, the WCAG 2 AA rules) on its main
// pages, at a phone's and a desktop's width, in light and dark. A serious or
// critical problem fails the check; smaller ones are listed.
// Run against a site started with sample stories:  node site/test/a11y.mjs http://localhost:3200
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const base = process.argv[2] ?? "http://localhost:3200";
const PAGES = ["/", "/en", "/hi", "/latest", "/section/gujarat", "/epaper", "/about", "/aavtikal", "/en/aavtikal", "/aavtikal/science", "/aavtikal/author/desk", "/aavtikal/search"];
const VIEWS = [{ name: "phone", width: 390, height: 844 }, { name: "desktop", width: 1440, height: 900 }];

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let failed = 0;
// a story page too: the first story the front page links to
const probe = await b.newPage();
await probe.goto(base + "/", { waitUntil: "networkidle" });
const story = await probe.$eval('a[href*="/news/"]', (a) => new URL(a.href).pathname).catch(() => null);
await probe.close();
if (story) PAGES.push(story);
// and the flagship's first article (Aavtikal, FLAGSHIP.md)
const fl = await b.newPage();
await fl.goto(base + "/aavtikal", { waitUntil: "networkidle" });
const feature = await fl.$eval('a[href*="/aavtikal/p/"]', (a) => new URL(a.href).pathname).catch(() => null);
await fl.close();
if (feature) PAGES.push(feature);

for (const scheme of ["light", "dark"]) {
  for (const v of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: scheme, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      const res = await page.goto(base + path, { waitUntil: "networkidle" });
      if (!res || res.status() >= 400) { console.log(`✗ ${path}: HTTP ${res?.status()}`); failed++; continue; }
      await page.addScriptTag({ path: AXE });
      const out = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }));
      const bad = out.violations.filter((x) => x.impact === "serious" || x.impact === "critical");
      const tag = `${path} (${v.name}, ${scheme})`;
      if (!out.violations.length) { console.log(`✓ ${tag}`); continue; }
      console.log(`${bad.length ? "✗" : "~"} ${tag}`);
      for (const x of out.violations) {
        console.log(`    [${x.impact}] ${x.id}: ${x.help} (${x.nodes.length})`);
        for (const n of x.nodes.slice(0, 3)) console.log(`        ${n.target.join(" ")}  ${(n.failureSummary ?? "").split("\n").slice(1, 2).join("").trim()}`);
      }
      failed += bad.length;
    }
    await ctx.close();
  }
}
await b.close();
console.log(failed ? `\n${failed} serious problem(s)` : "\nno serious problems");
process.exit(failed ? 1 : 0);
