#!/usr/bin/env node
// Gathers what the desktop app carries into desktop/app-engine: the engine
// (backend, shared, the papers' profiles and fonts), the built newsroom, their
// packages, and the Chromium the engine lays pages out with. Run after
//   npm ci && npm run build --prefix web
//   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
// (the release workflow does all of it; electron-builder then packs app-engine).
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "desktop", "app-engine");
const say = (s) => console.log(`[stage] ${s}`);

if (!existsSync(path.join(ROOT, "web", ".next", "BUILD_ID"))) throw new Error("build the newsroom first: npm run build --prefix web");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// never the developer's own data, logs or test output
const skip = [
  /[\\/]\.next[\\/](cache|dev|trace)/, /[\\/]web[\\/]public[\\/](media|review|issues)([\\/]|$)/,
  /[\\/]backend[\\/](data|\.env|test)([\\/]|$)/, /\.(log|tsbuildinfo)$/, /[\\/]\.DS_Store$/,
];
const copy = (rel, opts = {}) => {
  const from = path.join(ROOT, rel);
  if (!existsSync(from)) return say(`(no ${rel})`);
  cpSync(from, path.join(OUT, rel), { recursive: true, filter: (f) => !skip.some((r) => r.test(f)), ...opts });
  say(rel);
};

for (const rel of ["package.json", "backend/package.json", "backend/src", "shared", "publications",
                   "web/package.json", "web/next.config.ts", "web/.next", "web/public"]) copy(rel);
mkdirSync(path.join(OUT, "web", "public", "issues"), { recursive: true });

// the packages: the workspace links (node_modules/@ck/shared -> shared, ...) become
// real folders where the app needs them and are dropped where it doesn't
function copyModules(rel) {
  const from = path.join(ROOT, rel);
  if (!existsSync(from)) return;
  for (const name of readdirSync(from)) {
    if (name === ".bin" || name === ".cache") continue;
    const src = path.join(from, name);
    if (name.startsWith("@") && !lstatSync(src).isSymbolicLink()) {
      for (const sub of readdirSync(src)) link(path.join(src, sub), path.join(rel, name, sub));
      continue;
    }
    link(src, path.join(rel, name));
  }
}
function link(src, rel) {
  if (lstatSync(src).isSymbolicLink()) {
    const real = realpathSync(src);
    // the workspace packages themselves (web, backend) are already in place
    if (real === path.join(ROOT, "web") || real === path.join(ROOT, "backend")) return;
    cpSync(real, path.join(OUT, rel), { recursive: true, filter: (f) => !skip.some((r) => r.test(f)) && !/[\\/]node_modules[\\/]/.test(path.relative(real, f)) });
    return;
  }
  cpSync(src, path.join(OUT, rel), { recursive: true, verbatimSymlinks: true });
}
copyModules("node_modules");
copyModules("web/node_modules");
copyModules("backend/node_modules");
say("node_modules");

const browsers = path.join(OUT, "node_modules", "playwright-core", ".local-browsers");
if (!existsSync(browsers)) throw new Error("no Chromium inside: PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium");

const size = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => {
  const p = path.join(d, e.name);
  return n + (e.isDirectory() ? size(p) : e.isFile() ? statSync(p).size : 0);
}, 0);
say(`done: ${(size(OUT) / 1e6).toFixed(0)} MB in ${path.relative(ROOT, OUT)}`);
