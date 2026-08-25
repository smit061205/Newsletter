// Phase 3 (docs/PRECISION_ROADMAP.md): derives one calibration RATIO per
// source-font -> substitute-font role mapping, from many real text samples
// spread across the whole paper (not just the header's ~15 elements).
//
// Unlike the earlier per-element calibration (calibrate-fonts.mjs), this
// computes a size-independent multiplier: for each sample, back-solve the
// substitute size that reproduces the ORIGINAL PDF's exact measured width,
// then take ratio = that_size / original_declared_size. Averaging this ratio
// (median, to resist outliers) across many samples -- deliberately spread
// across the font's full size range where it has one -- gives a multiplier
// that generalizes to brand-new text/sizes that don't exist in the source PDF
// yet, which per-element calibration cannot do.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const samples = JSON.parse(readFileSync(join(ROOT, "out", "_calibration_samples.json"), "utf-8"));

// mirrors web/src/lib/fonts.ts exactly -- kept in sync by hand, not imported,
// since this is a plain Node script outside the Next.js TS build
const FONT_MAP = {
  BBharatiTitleTwo: { family: "'Baloo Bhai 2'", weight: 700 },
  BBharatiGopikaTwo: { family: "'Hind Vadodara'", weight: 400 },
  "BBharatiGopikaTwo,Bold": { family: "'Hind Vadodara'", weight: 700 },
  BBharatiMaruti: { family: "'Mukta Vaani'", weight: 700 },
  "Helvetica-Bold": { family: "Arial, Helvetica", weight: 700 },
  "Times-Bold": { family: "Georgia, 'Times New Roman'", weight: 700 },
  "Times-Roman": { family: "Georgia, 'Times New Roman'", weight: 400 },
  "Calibri,Bold": { family: "Arial, Helvetica", weight: 700 },
  Calibri: { family: "Arial, Helvetica", weight: 400 },
  ArialBlack: { family: "'Arial Black', Arial", weight: 900 },
};

const REF_SIZE = 100;

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function stdev(arr, mean) {
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(
    "data:text/html,<html><head><link rel='preconnect' href='https://fonts.googleapis.com'>" +
      "<link href='https://fonts.googleapis.com/css2?family=Baloo+Bhai+2:wght@700&family=Hind+Vadodara:wght@400;700&family=Mukta+Vaani:wght@700&display=swap' rel='stylesheet'>" +
      "</head><body><span id='m' style='position:absolute;white-space:nowrap;'></span></body></html>"
  );
  await page.waitForTimeout(1500);

  const results = {};
  for (const [sourceFont, picked] of Object.entries(samples)) {
    const font = FONT_MAP[sourceFont];
    if (!font) {
      console.error("no font mapping for", sourceFont);
      continue;
    }
    const perSample = [];
    for (const s of picked) {
      const measuredWidthAtRef = await page.evaluate(
        ({ text, family, weight, size }) => {
          const span = document.getElementById("m");
          span.style.fontFamily = family;
          span.style.fontWeight = String(weight);
          span.style.fontSize = size + "px";
          span.textContent = text;
          return span.getBoundingClientRect().width;
        },
        { text: s.text, family: font.family, weight: font.weight, size: REF_SIZE }
      );
      if (measuredWidthAtRef <= 0) continue;
      const calibratedSize = (s.width / measuredWidthAtRef) * REF_SIZE;
      const ratio = calibratedSize / s.size;
      perSample.push({ text: s.text, origSize: s.size, origWidth: s.width, calibratedSize: round2(calibratedSize), ratio: round4(ratio) });
    }
    const ratios = perSample.map((p) => p.ratio);
    const med = median(ratios);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    results[sourceFont] = {
      substituteFamily: font.family,
      substituteWeight: font.weight,
      sampleCount: perSample.length,
      ratio_median: round4(med),
      ratio_mean: round4(mean),
      ratio_min: round4(Math.min(...ratios)),
      ratio_max: round4(Math.max(...ratios)),
      ratio_stdev: round4(stdev(ratios, mean)),
      samples: perSample,
    };
  }
  await browser.close();

  writeFileSync(join(ROOT, "web", "src", "lib", "calibration_ratios.json"), JSON.stringify(results, null, 2));
  console.log(`${"sourceFont".padEnd(24)} ${"n".padStart(4)} ${"median".padStart(8)} ${"mean".padStart(8)} ${"min".padStart(8)} ${"max".padStart(8)} ${"stdev".padStart(8)}`);
  for (const [k, v] of Object.entries(results)) {
    console.log(
      `${k.padEnd(24)} ${String(v.sampleCount).padStart(4)} ${v.ratio_median.toFixed(4).padStart(8)} ${v.ratio_mean.toFixed(4).padStart(8)} ${v.ratio_min.toFixed(4).padStart(8)} ${v.ratio_max.toFixed(4).padStart(8)} ${v.ratio_stdev.toFixed(4).padStart(8)}`
    );
  }
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

main();
