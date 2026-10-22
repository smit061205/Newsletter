#!/usr/bin/env node
// Copies the paper's licensed Gopika fonts from a folder (as the paper keeps
// them, e.g. "B Bharati GopikaTwo Bold.ttf") into
// publications/capital-kranti/fonts/ under the names the profile uses.
// Used by both installers; the fonts never go into git.
//
//   node scripts/install-fonts.mjs <folder>
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "publications", "capital-kranti", "fonts");

// the profile's name for each face, and how to recognise it in a file name
const FACES = [
  ["gopika-light-two-regular.ttf", (n) => /gopika\s*light\s*two/.test(n)],
  ["gopika-two-bolditalic.ttf", (n) => /gopika\s*two/.test(n) && /bold\s*italic/.test(n)],
  ["gopika-two-bold.ttf", (n) => /gopika\s*two/.test(n) && /bold/.test(n) && !/italic/.test(n)],
  ["gopika-two-regular.ttf", (n) => /gopika\s*two/.test(n) && !/bold|italic|light/.test(n)],
];

const folder = process.argv[2];
if (!folder || !existsSync(folder) || !statSync(folder).isDirectory()) {
  console.error("Give the folder that has the Gopika .ttf files.");
  process.exit(2);
}
const files = [];
const walk = (dir, depth) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) { if (depth < 2) walk(p, depth + 1); }
    else if (/\.(ttf|otf)$/i.test(f)) files.push(p);
  }
};
walk(folder, 0);
mkdirSync(DEST, { recursive: true });
const missing = [];
for (const [name, test] of FACES) {
  const hit = files.find((f) => test(path.basename(f).toLowerCase().replace(/[-_]+/g, " ")) || path.basename(f).toLowerCase() === name);
  if (!hit) { missing.push(name); continue; }
  copyFileSync(hit, path.join(DEST, name));
  console.log(`  ${path.basename(hit)} -> ${name}`);
}
if (missing.length) {
  console.error(`Not found in that folder: ${missing.join(", ")} (BBharati GopikaTwo Normal, Bold, BoldItalic and GopikalightTwo Normal are needed).`);
  process.exit(1);
}
console.log("Fonts installed.");
