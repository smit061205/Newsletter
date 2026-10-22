#!/usr/bin/env node
// The Capital Kranti app: starts the engine (the backend) and the newsroom
// website on this computer, then opens the newsroom in the browser. Behind
// the desktop shortcut on Windows (windows/launch.ps1) and the Mac app
// (mac/Capital Kranti.app) alike, so the two never drift apart.
//
//   node scripts/launch.mjs              start what isn't running, open the newsroom
//   node scripts/launch.mjs --background start without opening the browser (at log-in)
//   node scripts/launch.mjs --stop       stop both
//   node scripts/launch.mjs --update     get the latest version, rebuild, restart
//   node scripts/launch.mjs --status     what's running
//
// Everything stays on this computer: both listen on 127.0.0.1 only.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGS = path.join(ROOT, "logs");
const RUN = path.join(ROOT, "logs", "run");
const BACKEND_PORT = 4000;
const NEWSROOM_PORT = 3000;
const NEWSROOM_URL = `http://127.0.0.1:${NEWSROOM_PORT}/newsroom`;
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

const args = new Set(process.argv.slice(2));
const say = (s) => console.log(`[Capital Kranti] ${s}`);

async function answers(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return r.status < 500;
  } catch { return false; }
}
const engineUp = () => answers(`http://127.0.0.1:${BACKEND_PORT}/healthz`);
const newsroomUp = () => answers(NEWSROOM_URL);

async function waitFor(check, seconds, what) {
  for (let i = 0; i < seconds; i++) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${what} didn't start in ${seconds} seconds: see ${LOGS}`);
}

/** Start a long-running process detached from this one, its output in logs/<name>.log. */
function start(name, cmd, cmdArgs, opts = {}) {
  mkdirSync(RUN, { recursive: true });
  const out = openSync(path.join(LOGS, `${name}.log`), "a");
  const child = spawn(cmd, cmdArgs, {
    cwd: opts.cwd ?? ROOT, env: { ...process.env, ...opts.env }, detached: true,
    stdio: ["ignore", out, out], windowsHide: true, shell: isWin && cmd.endsWith(".cmd"),
  });
  child.unref();
  writeFileSync(path.join(RUN, `${name}.pid`), String(child.pid));
  say(`started the ${name} (process ${child.pid})`);
}

function stop(name) {
  const file = path.join(RUN, `${name}.pid`);
  if (!existsSync(file)) return;
  const pid = Number(readFileSync(file, "utf8"));
  try {
    if (isWin) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGTERM"); // the whole group: npm's children too
    say(`stopped the ${name}`);
  } catch { /* already gone */ }
  rmSync(file, { force: true });
}

function openBrowser(url) {
  if (isWin) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

async function startAll() {
  mkdirSync(LOGS, { recursive: true });
  if (!(await engineUp())) {
    start("engine", process.execPath, ["--experimental-strip-types", "--experimental-sqlite", "--no-warnings",
      path.join("backend", "src", "cli.ts"), "serve", "--port", String(BACKEND_PORT)]);
    await waitFor(engineUp, 60, "The engine");
  } else say("the engine is running");
  if (!(await newsroomUp())) {
    if (!existsSync(path.join(ROOT, "web", ".next", "BUILD_ID"))) build();
    const next = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
    start("newsroom", process.execPath, [existsSync(next) ? next : path.join(ROOT, "web", "node_modules", "next", "dist", "bin", "next"),
      "start", "--port", String(NEWSROOM_PORT), "--hostname", "127.0.0.1"], {
      cwd: path.join(ROOT, "web"),
      env: { NEWSROOM: "1", BACKEND_API_MODE: "live", BACKEND_API_URL: `http://127.0.0.1:${BACKEND_PORT}` },
    });
    await waitFor(newsroomUp, 90, "The newsroom");
  } else say("the newsroom is running");
}

function run(cmd, cmdArgs, cwd = ROOT) {
  say(`${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit", shell: isWin });
  if (r.status !== 0) throw new Error(`"${cmd} ${cmdArgs.join(" ")}" failed`);
}

/** The newsroom website, built for this computer. */
function build() {
  run(npm, ["run", "build", "--prefix", "web"]);
}

async function main() {
  if (args.has("--status")) {
    say(`engine: ${(await engineUp()) ? "running" : "stopped"}, newsroom: ${(await newsroomUp()) ? "running" : "stopped"}`);
    return;
  }
  if (args.has("--stop")) {
    stop("newsroom");
    stop("engine");
    return;
  }
  if (args.has("--update")) {
    run("git", ["pull", "--ff-only"]);
    run(npm, ["ci", "--no-audit", "--no-fund"]);
    build();
    stop("newsroom");
    stop("engine");
    await new Promise((r) => setTimeout(r, 1500));
  }
  await startAll();
  if (!args.has("--background")) openBrowser(NEWSROOM_URL);
  say(`ready: ${NEWSROOM_URL}`);
}

main().catch((e) => {
  console.error(`[Capital Kranti] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
