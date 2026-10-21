// Build-order step 2 check: the composer alone, on real stories. Takes the
// 8 August issue's stories and the box each one was printed in
// (archive/frontend-layout-engine/article-level-issue-2026-08-08.json), lets
// compose.ts decide everything inside each box, and checks the result with
// the frontend's own plotter: valid contract, no text overflow. Writes the
// issue JSON and a PDF to out/backend/ for scripts/replica/compare.py.
//
//   node --experimental-strip-types --no-warnings backend/test/recompose-0808.ts
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { IssueRenderSchema, type Element, type IssueRender } from "@ck/shared/contract";
import { printIssue } from "@ck/shared/pdf";
import { OUT_DIR, PLOT_ORIGIN, PUBLIC_DIR, ROOT } from "../src/config.ts";
import { compose, type Composed } from "../src/layout/compose.ts";
import { Measurer } from "../src/layout/measure.ts";
import { DPI, FACES, FONTS, PAGE } from "../src/layout/typography.ts";

interface Placement {
  id: string; page: number; x: number; y: number; width: number; height: number;
  type: "news" | "article" | "ad"; title: string; kicker?: string; bodyText: string; photoUrl: string; photoCaption?: string;
}

const src = JSON.parse(await readFile(path.join(ROOT, "archive/frontend-layout-engine/article-level-issue-2026-08-08.json"), "utf8"));
const replica: IssueRender = JSON.parse(await readFile(path.join(ROOT, "web/src/mocks/issue-2026-08-08.json"), "utf8"));

// photos were re-cut per article when the replica moved to element level
const photo = (url: string) => {
  if (!url) return "";
  if (existsSync(path.join(PUBLIC_DIR, url))) return url;
  const alt = url.replace(/\.jpg$/, "-photo0.jpg");
  return existsSync(path.join(PUBLIC_DIR, alt)) ? alt : url;
};

// The archived article-level data was extracted before the fix that joins a
// justified line's pieces, so some "paragraphs" are single words of one
// printed line ("પ્રતિબંધ" / "અને" / "નિવારણ)"). Join any paragraph that
// doesn't end a sentence onto the next -- test-data repair, not layout.
const mend = (text: string) => {
  const out: string[] = [];
  for (const p of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    if (out.length && !/[.?!।”"’)]$/.test(out[out.length - 1])) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out.join("\n\n");
};

const m = await Measurer.open(FONTS, FACES);
const stats: Record<string, Composed> = {};
const pages: IssueRender["pages"] = [];
for (const rp of replica.pages) {
  // the day's chrome, as printed (the planner will build its own, step 3)
  const chrome = rp.elements.filter((e) => e.id === `p${rp.number}-header` || e.id === `p${rp.number}-footer`);
  const top = Math.max(...chrome.filter((e) => e.id.endsWith("header")).map((e) => (e.kind === "image" ? e.y + e.height : 0)));
  const footer = chrome.find((e) => e.id.endsWith("footer"));
  const bottom = footer && footer.kind === "image" ? footer.y : PAGE.height;
  const elements: Element[] = [...chrome];
  for (const a of (src.articles as Placement[]).filter((a) => a.page === rp.number)) {
    const y = Math.max(a.y, top);
    const box = { x: a.x, y, width: a.width, height: Math.min(a.y + a.height, bottom) - y };
    if (a.type === "ad") {
      elements.push({ id: a.id, kind: "image", articleId: a.id, ...box, url: photo(a.photoUrl), fit: "fill" });
      continue;
    }
    const url = photo(a.photoUrl);
    const c = await compose({ id: a.id, kicker: a.kicker, title: a.title, body: mend(a.bodyText),
                              photo: url ? { url, caption: a.photoCaption } : undefined }, box, m);
    stats[a.id] = c;
    elements.push(...c.elements);
  }
  pages.push({ number: rp.number, width: PAGE.width, height: PAGE.height, elements });
}
await m.close();

const issue = IssueRenderSchema.parse({ issueDate: "2026-08-08", issueNumber: 196, dpi: DPI, fonts: FONTS, pages });
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "recompose-0808.json"), JSON.stringify(issue));
const { pdf, warnings } = await printIssue(issue, { origin: PLOT_ORIGIN, publicDir: PUBLIC_DIR });
await writeFile(path.join(OUT_DIR, "recompose-0808.pdf"), pdf);

for (const [id, c] of Object.entries(stats)) {
  console.log(`${id.padEnd(24)} ${c.fits ? "fits" : "OVERFLOW " + c.overflowLines + " lines"}  fill ${(c.fill * 100).toFixed(0)}%`);
}
console.log(`plotter warnings: ${warnings.length}`);
for (const w of warnings) console.log("  ", w.page, w.elementId, w.kind, w.detail);
console.log(`wrote ${path.join(OUT_DIR, "recompose-0808.pdf")}`);
