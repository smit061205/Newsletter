// Draws the masthead directly onto a copy of the real target file, (172) PDF.pdf --
// the canonical, camera-ready path (pdf-lib direct write, ~0.0001pt measured
// geometric drift), not the React/Chromium preview.
//
// The header itself is placed as ONE high-resolution raster (out/header-capture.png,
// produced by capture-header.mjs from the live React render), not drawn as vector
// text. That's a deliberate, tested decision, not a shortcut: @pdf-lib/fontkit's
// GPOS engine cannot reliably shape Gujarati -- it crashes outright on Noto Sans
// Gujarati (null anchor in mark positioning) and silently drops/misplaces
// conjuncts and matras on Hind Vadodara. Chromium's HarfBuzz-based engine shapes
// the same text correctly (verified earlier this session), so it does the
// typesetting; pdf-lib just places the resulting pixels at the exact measured
// position from header_spec.json. Every position/color that WAS reconciled by
// hand for the old vector attempt came from that same file -- nothing here is
// re-estimated, only re-routed through a rasterizer that actually works.
//
// Usage: node scripts/capture-header.mjs && node scripts/render-header-pdf.mjs

import { PDFDocument } from "pdf-lib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// must match REGION in capture-header.mjs exactly
const REGION = { x0: 15.51, y0: 12.064, x1: 1104.182, y1: 266.054 };

async function main() {
  const targetBytes = readFileSync(join(ROOT, "(172) PDF.pdf"));
  const doc = await PDFDocument.load(targetBytes);
  const page = doc.getPage(0);
  const PAGE_H = page.getHeight();

  const headerPng = readFileSync(join(ROOT, "out", "header-capture.png"));
  const headerImg = await doc.embedPng(headerPng);

  const w = REGION.x1 - REGION.x0;
  const h = REGION.y1 - REGION.y0;
  page.drawImage(headerImg, {
    x: REGION.x0,
    y: PAGE_H - REGION.y1, // flip: PDF origin is bottom-left, REGION is top-left
    width: w,
    height: h,
  });

  const outPath = join(ROOT, "out", "page-1-header.pdf");
  writeFileSync(outPath, await doc.save());
  console.log("wrote", outPath, `(header image: ${w.toFixed(2)} x ${h.toFixed(2)} pt)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
