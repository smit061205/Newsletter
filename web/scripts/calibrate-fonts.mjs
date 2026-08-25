// Calibrates a font-size for every header text element so the SUBSTITUTE font
// (Baloo Bhai 2 / Hind Vadodara for the Bharati originals; real Helvetica/Arial
// Black for the Latin ones) renders at the exact width the original PDF span
// measured, at a reference size, using Chromium's own text metrics --
// not an eyeballed guess.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const inventory = JSON.parse(readFileSync(join(__dirname, "..", "src", "lib", "element_inventory.json"), "utf-8"));

// same font-role mapping as src/lib/fonts.ts
const FONT_MAP = {
  "BBharatiTitleTwo": { family: "'Baloo Bhai 2'", weight: 700 },
  "BBharatiGopikaTwo,Bold": { family: "'Hind Vadodara'", weight: 700 },
  "Helvetica-Bold": { family: "Arial, Helvetica", weight: 700 },
  "Helvetica": { family: "Arial, Helvetica", weight: 400 },
  "ArialBlack": { family: "'Arial Black', Arial", weight: 900 },
};

const REF_SIZE = 100; // pt, measured then scaled

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("data:text/html,<html><head><link rel='preconnect' href='https://fonts.googleapis.com'>" +
    "<link href='https://fonts.googleapis.com/css2?family=Baloo+Bhai+2:wght@700&family=Hind+Vadodara:wght@700&display=swap' rel='stylesheet'>" +
    "</head><body><span id='m' style='position:absolute;white-space:nowrap;'></span></body></html>");
  await page.waitForTimeout(1500); // let webfonts actually load

  const results = {};
  for (const [key, el] of Object.entries(inventory)) {
    const font = FONT_MAP[el.font];
    if (!font) { console.error("no font mapping for", el.font); continue; }
    const measuredWidthAtRef = await page.evaluate(
      ({ text, family, weight, size }) => {
        const span = document.getElementById("m");
        span.style.fontFamily = family;
        span.style.fontWeight = String(weight);
        span.style.fontSize = size + "px"; // px==pt at 1x/96dpi mapping used only for ratio, cancels out
        span.textContent = text;
        return span.getBoundingClientRect().width;
      },
      { text: el.text, family: font.family, weight: font.weight, size: REF_SIZE }
    );
    const calibratedSize = round2((el.width_pt / measuredWidthAtRef) * REF_SIZE);
    results[key] = {
      ...el,
      substituteFont: font.family,
      measuredWidthAtRef100: round2(measuredWidthAtRef),
      calibratedSizePt: calibratedSize,
    };
  }
  await browser.close();

  writeFileSync(join(__dirname, "..", "src", "lib", "calibrated_sizes.json"), JSON.stringify(results, null, 2));
  console.log(`${"key".padEnd(16)} ${"orig".padStart(7)} ${"calibrated".padStart(11)}  font`);
  for (const [k, v] of Object.entries(results)) {
    console.log(`${k.padEnd(16)} ${v.size.toFixed(2).padStart(7)} ${String(v.calibratedSizePt).padStart(11)}  ${v.substituteFont}`);
  }
}

function round2(n) { return Math.round(n * 100) / 100; }

main();
