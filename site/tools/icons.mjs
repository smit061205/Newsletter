// The website's icon (29 Oct, the editor's choice of four): a page of the paper. The purple ક in the articles' serif
// (Noto Serif Gujarati) on white, over the printed paper's foot rule in navy with a saffron line. Drawn on a canvas
// in Chromium (the letter centred by its measured outline), then made into every size the site serves:
//   public/icon.png (512) and icon-192.png      the app icon, and what search engines show
//   public/icon-maskable.png (512)              the same with the letter inside a phone's round mask
//   public/apple-icon.png (180)                 an iPhone's home screen
//   public/favicon-32.png, public/favicon.ico   the browser tab: a bolder, bigger letter that stays a ક at 16 pixels
// Run from the repository's top:  node site/tools/icons.mjs   (needs the internet once, for the font)
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const PUBLIC = new URL("../public/", import.meta.url);
const PURPLE = "#7f3894", NAVY = "#2b2f86", SAFFRON = "#f4a21d";

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage();
await p.setContent(`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+Gujarati:wght@600;700&display=block">
  <span style="font:600 20px 'Noto Serif Gujarati'">ક</span><span style="font:700 20px 'Noto Serif Gujarati'">ક</span>`);
await p.evaluate(() => document.fonts.ready);
const drawn = await p.evaluate(({ PURPLE, NAVY, SAFFRON }) => {
  if (!document.fonts.check("600 20px 'Noto Serif Gujarati'", "ક")) throw new Error("the font didn't load");
  // a 512-pixel square: the letter (weight, outline height h, its centre at y) and the foot rule from `foot` down
  const draw = ({ weight, h, y, foot, line }) => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 512, 512);
    g.font = `${weight} 400px 'Noto Serif Gujarati'`;
    const m = g.measureText("ક");
    const k = h / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
    g.save(); g.translate(256, y); g.scale(k, k); g.fillStyle = PURPLE;
    g.fillText("ક", (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    g.restore();
    g.fillStyle = SAFFRON; g.fillRect(0, foot, 512, line);
    g.fillStyle = NAVY; g.fillRect(0, foot + line, 512, 512 - foot - line);
    return c.toDataURL("image/png").split(",")[1];
  };
  return {
    icon: draw({ weight: 600, h: 270, y: 220, foot: 412, line: 18 }),
    // a phone's mask keeps a circle of 80% of the width: the letter inside it, the foot rule running out under it
    maskable: draw({ weight: 600, h: 200, y: 222, foot: 384, line: 16 }),
    small: draw({ weight: 700, h: 352, y: 196, foot: 410, line: 22 }),
  };
}, { PURPLE, NAVY, SAFFRON });
await b.close();

const png = (key) => Buffer.from(drawn[key], "base64");
const size = (key, n) => sharp(png(key)).resize(n, n, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer();
const out = (name, data) => writeFileSync(new URL(name, PUBLIC), data);
out("icon.png", await size("icon", 512));
out("icon-192.png", await size("icon", 192));
out("icon-maskable.png", await size("maskable", 512));
out("apple-icon.png", await size("icon", 180));
out("favicon-32.png", await size("small", 32));
// favicon.ico: the 16, 32 and 48-pixel PNGs one after another, behind the ICO header and its directory
const ico = await Promise.all([16, 32, 48].map(async (n) => [n, await size("small", n)]));
const head = Buffer.alloc(6 + 16 * ico.length);
head.writeUInt16LE(1, 2); head.writeUInt16LE(ico.length, 4);
let at = head.length;
ico.forEach(([n, data], i) => {
  const e = 6 + 16 * i;
  head.writeUInt8(n, e); head.writeUInt8(n, e + 1); head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(at, e + 12);
  at += data.length;
});
out("favicon.ico", Buffer.concat([head, ...ico.map(([, data]) => data)]));
console.log("icons written to site/public");
