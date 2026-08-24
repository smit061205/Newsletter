// Captures the masthead region from the already-correct React render at print
// resolution, for embedding into the pdf-lib output. This exists because
// @pdf-lib/fontkit's GPOS engine cannot reliably shape Gujarati text (confirmed:
// it crashes on Noto Sans Gujarati and mis-renders conjuncts/matras on Hind
// Vadodara -- a library bug, not a font choice problem). Chromium's HarfBuzz-based
// engine shapes it correctly, so it becomes the rasterizer for this one region.
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));

const PT_TO_PX = 96 / 72; // browser CSS px per pt, at 1x
const SCALE = 4; // ~384 "dpi"-equivalent -- ample for offset print

// header region in pt: full live-area width, from the top margin down through
// the bottom of the edition-info bar (see header_spec.json)
const REGION = { x0: 15.51, y0: 12.064, x1: 1104.182, y1: 266.054 };

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 400 },
    deviceScaleFactor: SCALE,
  });
  await page.goto("http://localhost:3000/print/1", { waitUntil: "networkidle" });

  const clip = {
    x: REGION.x0 * PT_TO_PX,
    y: REGION.y0 * PT_TO_PX,
    width: (REGION.x1 - REGION.x0) * PT_TO_PX,
    height: (REGION.y1 - REGION.y0) * PT_TO_PX,
  };
  const outPath = join(__dirname, "..", "..", "out", "header-capture.png");
  await page.screenshot({ path: outPath, clip });
  await browser.close();
  console.log("wrote", outPath, clip);
}

main();
