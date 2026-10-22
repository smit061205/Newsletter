#!/usr/bin/env node
// Gathers what the desktop app carries into desktop/stage-root/app-engine: the engine
// (backend, shared, the papers' profiles and fonts), the built newsroom, their
// packages, and the Chromium the engine lays pages out with. Run after
//   npm ci && npm run build --prefix web
//   PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
// (the release workflow does all of it; electron-builder then packs it into the app's Resources).
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// packed from stage-root (desktop/package.json): electron-builder leaves out the
// top-level node_modules of a folder it copies, so app-engine sits one level down
const OUT = path.join(ROOT, "desktop", "stage-root", "app-engine");
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
cpSync(path.join(ROOT, "desktop", "engine-hooks.mjs"), path.join(OUT, "engine-hooks.mjs"));

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
    // the workspace packages themselves (web, backend, shared) are already in place:
    // shared is found through engine-hooks.mjs (Node won't run TypeScript in node_modules)
    if ([path.join(ROOT, "web"), path.join(ROOT, "backend"), path.join(ROOT, "shared")].includes(real)) return;
    cpSync(real, path.join(OUT, rel), { recursive: true, filter: (f) => !skip.some((r) => r.test(f)) && !/[\\/]node_modules[\\/]/.test(path.relative(real, f)) });
    return;
  }
  cpSync(src, path.join(OUT, rel), { recursive: true, verbatimSymlinks: true });
}
copyModules("node_modules");
copyModules("web/node_modules");
copyModules("backend/node_modules");
say("node_modules");

// no links in what's packed, they don't survive it (Windows: "cannot find the
// path"; macOS signing: a link out of the bundle): the newsroom's build links
// its external packages (playwright) by this checkout's full path -- a real
// copy instead; .bin shortcuts aren't needed. Chromium's own app bundle keeps
// its internal links (macOS needs them).
(function noLinks(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      const target = path.resolve(path.dirname(p), readlinkSync(p));
      rmSync(p, { force: true });
      if (path.basename(dir) === ".bin" || !existsSync(target)) continue;
      cpSync(target, p, { recursive: true, dereference: true, filter: (f) => !/[\\/]\.bin([\\/]|$)/.test(f) });
      say(`link ${path.relative(OUT, p)}: copied in`);
    } else if (e.isDirectory() && e.name !== ".local-browsers") noLinks(p);
  }
})(OUT);

const browsers = path.join(OUT, "node_modules", "playwright-core", ".local-browsers");
if (!existsSync(browsers)) throw new Error("no Chromium inside: PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium");

const size = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => {
  const p = path.join(d, e.name);
  return n + (e.isDirectory() ? size(p) : e.isFile() ? statSync(p).size : 0);
}, 0);
say(`done: ${(size(OUT) / 1e6).toFixed(0)} MB in ${path.relative(ROOT, OUT)}`);
