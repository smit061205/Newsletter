// Canonical camera-ready export for page 1: direct vector PDF writing via pdf-lib,
// no browser layout engine involved. Reads the SAME frames.json the React print
// route renders, so the editor preview and the production export can never disagree
// on where a frame is supposed to be -- only on how precisely each one draws it
// (React/Chromium: measured <=0.375pt drift; this path: measured <=0.0001pt).
//
// Usage: node scripts/export-page1.mjs [output-path]

import { PDFDocument, rgb } from "pdf-lib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gridSpec = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "capital_kranti_grid_spec.json"), "utf-8")
);
const frameData = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "lib", "frames.json"), "utf-8")
);

const PAGE_W = gridSpec.page_size_pt.width;
const PAGE_H = gridSpec.page_size_pt.height;

const COLORS = {
  chrome: rgb(0.549, 0.118, 0.745),
  masthead: rgb(0.784, 0.118, 0.118),
  photo: rgb(0.118, 0.353, 0.863),
  headline: rgb(0.902, 0.431, 0.0),
  body: rgb(0.0, 0.471, 0.549),
};

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);

  // live-area guide (non-printing in a real build; kept visible here for verification)
  const la = gridSpec.live_area_pt;
  page.drawRectangle({
    x: la.x0,
    y: PAGE_H - la.y1,
    width: la.x1 - la.x0,
    height: la.y1 - la.y0,
    borderColor: rgb(0.6, 0.6, 0.6),
    borderWidth: 0.24,
    borderDashArray: [3, 2],
  });

  for (const f of frameData.frames) {
    const w = f.x1 - f.x0;
    const h = f.y1 - f.y0;
    const yBottom = PAGE_H - f.y1; // flip: PDF origin is bottom-left, frame data is top-left
    page.drawRectangle({
      x: f.x0,
      y: yBottom,
      width: w,
      height: h,
      borderColor: COLORS[f.type] ?? rgb(0.2, 0.2, 0.2),
      borderWidth: 1,
    });
  }

  const outPath = process.argv[2] ?? join(__dirname, "..", "..", "out", "page-1.pdf");
  const bytes = await doc.save();
  writeFileSync(outPath, bytes);
  console.log(`wrote ${outPath} (${PAGE_W} x ${PAGE_H} pt, ${frameData.frames.length} frames)`);
}

main();
