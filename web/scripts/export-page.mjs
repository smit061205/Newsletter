// Canonical camera-ready export: direct vector PDF writing via pdf-lib, no browser
// layout engine involved. Reads src/lib/template.json -- the same 149-frame dataset
// the React print routes render -- so editor preview and production export can only
// ever disagree on *how precisely* each renderer draws a frame, never on where a
// frame is supposed to be. Measured: React/Chromium <=0.375pt drift, this path <=0.0001pt.
//
// Usage: node scripts/export-page.mjs <1|2|3|4> [output-path]

import { PDFDocument, rgb } from "pdf-lib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const template = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "lib", "template.json"), "utf-8")
);

const pageArg = process.argv[2] ?? "1";
const pageData = template.pages[pageArg];
if (!pageData) {
  console.error(`No such page "${pageArg}". Valid: ${Object.keys(template.pages).join(", ")}`);
  process.exit(1);
}

const PAGE_W = pageData.page_size_pt.width;
const PAGE_H = pageData.page_size_pt.height;

const COLORS = {
  chrome: rgb(0.549, 0.118, 0.745),
  masthead: rgb(0.784, 0.118, 0.118),
  running_header: rgb(0.784, 0.118, 0.118),
  footer: rgb(0.471, 0.439, 0.471),
  photo: rgb(0.118, 0.353, 0.863),
  headline_L1: rgb(0.902, 0.431, 0.0),
  headline_L2: rgb(0.784, 0.588, 0.0),
  subhead_kicker: rgb(0.651, 0.525, 0.165),
  body_or_caption: rgb(0.0, 0.471, 0.549),
  fine_print: rgb(0.0, 0.588, 0.627),
  ad_or_box: rgb(0.549, 0.118, 0.745),
};

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);

  page.drawRectangle({
    x: 15.51, y: PAGE_H - 1575.412, width: 1088.672, height: 1563.348,
    borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.24, borderDashArray: [3, 2],
  });

  for (const f of pageData.frames) {
    const yBottom = PAGE_H - f.y1; // flip: PDF content-stream origin is bottom-left
    page.drawRectangle({
      x: f.x0, y: yBottom, width: f.x1 - f.x0, height: f.y1 - f.y0,
      borderColor: COLORS[f.type] ?? rgb(0.2, 0.2, 0.2), borderWidth: 1,
    });
  }

  const outDir = join(__dirname, "..", "..", "out");
  mkdirSync(outDir, { recursive: true });
  const outPath = process.argv[3] ?? join(outDir, `page-${pageArg}.pdf`);
  writeFileSync(outPath, await doc.save());
  console.log(`wrote ${outPath} (${PAGE_W} x ${PAGE_H} pt, ${pageData.frames.length} frames)`);
}

main();
