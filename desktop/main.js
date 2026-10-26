// Capital Kranti, the desktop app. It starts the engine (which makes the
// paper) and the newsroom (where the editor works) on this computer, shows
// the newsroom in its own window, keeps a status item in the menu bar / tray,
// says when the paper is ready, starts at log-in, adds itself to the Dock,
// moves an earlier script install into itself, publishes through a one-time
// GitHub sign-in, updates itself, and uninstalls cleanly.
const { app, BrowserWindow, Menu, Tray, Notification, dialog, shell, ipcMain, safeStorage, nativeImage } = require("electron");
const { spawn, execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

const REPO = "smit061205/Newsletter";
// a GitHub OAuth App's client id for "Connect the website" (README: how to make one)
const GITHUB_CLIENT_ID = process.env.CK_GITHUB_CLIENT_ID || "";
const ENGINE = 4000, NEWSROOM = 3000;
const URL_HOME = `http://127.0.0.1:${NEWSROOM}/newsroom`;
const isMac = process.platform === "darwin", isWin = process.platform === "win32";

// where things are: the engine and newsroom (inside the app, or the repository
// when developing), and the paper's own data (the user's app-data folder,
// untouched by updates)
const RES = app.isPackaged ? path.join(process.resourcesPath, "app-engine") : path.resolve(__dirname, "..");
const DATA = app.getPath("userData");
const LOGS = path.join(DATA, "logs");
const STATE = path.join(DATA, "app-state.json");
fs.mkdirSync(LOGS, { recursive: true });

const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; } };
const writeState = (patch) => fs.writeFileSync(STATE, JSON.stringify({ ...readState(), ...patch }, null, 1));
const log = (s) => fs.appendFileSync(path.join(LOGS, "app.log"), `${new Date().toISOString()} ${s}\n`);

let win = null, splash = null, tray = null, quitting = false;
const children = [];

/* ---------------- the GitHub sign-in (the website's Publish) */
const TOKEN_FILE = path.join(DATA, "github.bin");
function githubToken() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE);
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
  } catch { return ""; }
}
function saveToken(t) {
  fs.writeFileSync(TOKEN_FILE, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from(t), { mode: 0o600 });
}

/* ---------------- the engine and the newsroom */
async function answers(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(2500) }); return r.status < 500; } catch { return false; }
}
function startChild(name, args, opts) {
  const out = fs.openSync(path.join(LOGS, `${name}.log`), "a");
  // Electron's own Node runs both: nothing else to install
  const child = spawn(process.execPath, args, {
    cwd: opts.cwd, stdio: ["ignore", out, out], windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...opts.env },
  });
  child.on("exit", (code) => {
    log(`${name} exited (${code})`);
    children.splice(children.indexOf(child) >>> 0, 1);
    // a crash, not a quit: started again after a moment
    if (!quitting && !child.stopping) setTimeout(() => startAll().catch((e) => log(`restart failed: ${e.message}`)), 3000);
  });
  child.name = name;
  children.push(child);
  return child;
}
async function waitFor(url, seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await answers(url)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} didn't answer in ${seconds} seconds`);
}
/** The paper the newsroom works on (Papers screen): Capital Kranti in the
 * app's data folder, any other in its own (papers/<id>/), sharing the AI key
 * and the papers added here. */
const MAIN_PAPER = "capital-kranti";
const paperNow = () => (/^[a-z0-9-]+$/.test(readState().paper || "") ? readState().paper : MAIN_PAPER);
async function startAll() {
  const paper = paperNow();
  const engineEnv = {
    DATA_DIR: paper === MAIN_PAPER ? DATA : path.join(DATA, "papers", paper), GITHUB_TOKEN: githubToken(), GITHUB_REPO: REPO,
    CK_PUBLICATION: paper, CK_PAPERS_HOME: DATA, CK_ENV_FILE: path.join(DATA, "settings.env"),
    ...(lastStatus?.lang ? { CK_LANG: lastStatus.lang } : {}),
    // Chromium for laying out pages ships inside the app (node_modules/playwright-core/.local-browsers)
    PLAYWRIGHT_BROWSERS_PATH: "0",
  };
  fs.mkdirSync(engineEnv.DATA_DIR, { recursive: true });
  if (!(await answers(`http://127.0.0.1:${ENGINE}/healthz`))) {
    // inside the app, @ck/shared comes from app-engine/shared (engine-hooks.mjs)
    const hooks = path.join(RES, "engine-hooks.mjs");
    startChild("engine", ["--experimental-strip-types", "--experimental-sqlite", "--no-warnings",
      ...(fs.existsSync(hooks) ? ["--import", pathToFileURL(hooks).href] : []),
      path.join(RES, "backend", "src", "cli.ts"), "serve", "--port", String(ENGINE)], { cwd: RES, env: engineEnv });
  }
  if (!(await answers(URL_HOME))) {
    const nextBin = [path.join(RES, "web", "node_modules", "next", "dist", "bin", "next"), path.join(RES, "node_modules", "next", "dist", "bin", "next")]
      .find((f) => fs.existsSync(f));
    startChild("newsroom", [nextBin, "start", "--port", String(NEWSROOM), "--hostname", "127.0.0.1"],
      { cwd: path.join(RES, "web"), env: { NEWSROOM: "1", BACKEND_API_MODE: "live", BACKEND_API_URL: `http://127.0.0.1:${ENGINE}` } });
  }
  await waitFor(`http://127.0.0.1:${ENGINE}/healthz`, 90);
  await waitFor(URL_HOME, 90);
}
function stopAll() {
  quitting = true;
  for (const c of children) { try { c.kill(); } catch {} }
  // a stuck one (its browser can hold it open) is ended for good
  setTimeout(() => { for (const c of children) { try { if (c.exitCode === null) c.kill("SIGKILL"); } catch {} } }, 4000);
}

/* ---------------- windows */
function showSplash() {
  splash = new BrowserWindow({ width: 420, height: 300, frame: false, resizable: false, show: false, backgroundColor: "#f7f7f8",
                               webPreferences: { contextIsolation: true } });
  splash.loadFile(path.join(__dirname, "splash.html"));
  splash.once("ready-to-show", () => splash && splash.show());
}
function createWindow() {
  const st = readState();
  win = new BrowserWindow({
    width: st.bounds?.width ?? 1280, height: st.bounds?.height ?? 860, x: st.bounds?.x, y: st.bounds?.y,
    minWidth: 880, minHeight: 600, title: "Capital Kranti", backgroundColor: "#f7f7f8", show: false,
    icon: path.join(__dirname, "icon", isWin ? "icon.ico" : "png/512.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.loadURL(URL_HOME);
  win.once("ready-to-show", () => { win.show(); if (splash) { splash.destroy(); splash = null; } });
  // links to the outside open in the user's browser; the window stays on the newsroom
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(`http://127.0.0.1:${NEWSROOM}`)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${NEWSROOM}`)) { e.preventDefault(); shell.openExternal(url); }
  });
  // the engine restarting: wait, then load again (the newsroom shows "Restarting…" meanwhile)
  win.webContents.on("did-fail-load", () => setTimeout(() => win && win.loadURL(URL_HOME), 2000));
  const remember = () => win && !win.isMinimized() && writeState({ bounds: win.getBounds() });
  win.on("resize", remember);
  win.on("move", remember);
  // closing the window keeps the app (and the evening run) going in the menu bar / tray
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}
function show(route = "/newsroom") {
  if (!win) createWindow();
  if (route) win.loadURL(`http://127.0.0.1:${NEWSROOM}${route}`);
  win.show();
  win.focus();
}

/* ---------------- the menu bar / tray and notifications */
let lastStatus = null, lastRunning = false;
const GU = { ready: "છાપું તૈયાર છે", look: "છાપું તૈયાર — જોવા જેવી બાબતો છે", making: "છાપું બની રહ્યું છે…", none: "આજનું છાપું હજી બન્યું નથી" };
function words(s) {
  const gu = s?.lang !== "en";
  if (s?.running) return gu ? GU.making : "Making the paper…";
  if (s?.issue) return s.issue.ready ? (gu ? "છાપું તૈયાર છે" : "The paper is ready") : (gu ? GU.look : "Ready — things to look at");
  return gu ? GU.none : "Today's paper isn't made yet";
}
function buildTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "icon", isMac ? "trayTemplate.png" : "png/32.png"));
  if (isMac) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("Capital Kranti");
  tray.on("click", () => show(null));
  refreshTray();
}
function refreshTray() {
  if (!tray) return;
  const s = lastStatus;
  const gu = s?.lang !== "en";
  const pct = s?.running ? progressOf(s.running) : null;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${words(s)}${pct !== null ? ` (${pct}%)` : ""}`, enabled: false },
    { type: "separator" },
    { label: gu ? "ન્યૂઝરૂમ ખોલો" : "Open the newsroom", click: () => show("/newsroom") },
    { label: gu ? "છાપું હમણાં બનાવો" : "Make today's paper now", enabled: !s?.running,
      click: () => fetch(`http://127.0.0.1:${ENGINE}/api/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: s?.today }) }).then(() => show("/newsroom")).catch(() => {}) },
    { label: gu ? "છાપું જુઓ" : "See the pages", click: () => show("/newsroom/pages") },
    { type: "separator" },
    { label: gu ? "બંધ કરો" : "Quit Capital Kranti", click: () => { quitting = true; app.quit(); } },
  ]));
  if (isMac) tray.setTitle(pct !== null ? `${pct}%` : "");
}
const WEIGHT = { fetch: 0.12, rewrite: 0.2, topup: 0.16, fill: 0.04, build: 0.48 };
function progressOf(job) {
  let p = 0;
  for (const st of job.steps) {
    if (st.status === "done" || st.status === "skipped") p += WEIGHT[st.name];
    else if (st.status === "running") p += WEIGHT[st.name] * (st.progress?.total ? Math.min(0.97, st.progress.done / st.progress.total) : 0.05);
  }
  return Math.min(99, Math.round(p * 100));
}
async function poll() {
  try {
    const r = await fetch(`http://127.0.0.1:${ENGINE}/api/status`, { signal: AbortSignal.timeout(4000) });
    const s = await r.json();
    const wasRunning = lastRunning;
    lastStatus = s;
    lastRunning = !!s.running;
    refreshTray();
    // a run just finished: say so (the notification opens the right screen)
    if (wasRunning && !s.running && s.notify !== false && Notification.isSupported()) {
      const gu = s.lang !== "en";
      const job = s.lastJob;
      const failed = job?.status === "failed";
      const n = new Notification({
        title: "Capital Kranti",
        body: failed ? (gu ? "છાપું બનાવતાં અટક્યું — ફરી પ્રયત્ન કરો" : "Making the paper stopped — try again")
          : s.issue?.ready ? (gu ? "આજનું છાપું તૈયાર છે" : "Today's paper is ready")
          : (gu ? "છાપું તૈયાર — જોવા જેવી બાબતો છે" : "The paper is ready — some things to look at"),
      });
      n.on("click", () => show(failed || s.issue?.ready ? "/newsroom" : "/newsroom/review"));
      n.show();
    }
  } catch { /* the engine is restarting */ }
}

/* ---------------- first launch: Applications, the Dock, log-in */
async function firstLaunchChores() {
  const st = readState();
  // macOS: run from the disk image or Downloads -> offer to move into Applications
  if (isMac && app.isPackaged && !app.isInApplicationsFolder()) {
    const { response } = await dialog.showMessageBox({ type: "question", buttons: ["Move to Applications", "Not now"], defaultId: 0,
      message: "Move Capital Kranti to the Applications folder?", detail: "It then opens from Launchpad and the Dock, and updates itself." });
    if (response === 0) { try { app.moveToApplicationsFolder(); return; } catch (e) { log(`move failed: ${e.message}`); } }
  }
  if (!st.loginItemSet) {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
    writeState({ loginItemSet: true });
  }
  // macOS: in the Dock by default -- once (taken out again, it stays out);
  // an entry already there (the earlier app, pinned by hand) counts, and a
  // second one for the same app is taken out
  if (isMac && app.isPackaged && app.isInApplicationsFolder()) {
    try {
      const mine = dockEntries().filter((e) => e.url === APP_URL);
      if (mine.length === 0 && !st.dockAdded) {
        execFileSync("defaults", ["write", "com.apple.dock", "persistent-apps", "-array-add",
          `<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>${APP_URL}</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>`]);
        execFile("killall", ["Dock"], () => {});
      } else if (mine.length > 1) removeDockEntries((e) => e.url === APP_URL, 1);
      writeState({ dockAdded: true });
    } catch (e) { log(`dock: ${e.message}`); }
  }
}

/* ---------------- the Dock's own entries (macOS) */
const APP_PATH = isMac ? app.getPath("exe").replace(/\/Contents\/MacOS\/.*$/, "") : "";
// the Dock keeps an app as a file URL ("file:///Applications/Capital%20Kranti.app/")
const APP_URL = isMac ? pathToFileURL(APP_PATH).href.replace(/\/?$/, "/") : "";
const PLISTBUDDY = "/usr/libexec/PlistBuddy";
function dockEntries() {
  const file = path.join(os.tmpdir(), `ck-dock-${process.pid}.plist`);
  execFileSync("defaults", ["export", "com.apple.dock", file]);
  const out = [];
  try {
    for (let i = 0; i < 500; i++) {
      let url;
      try { url = execFileSync(PLISTBUDDY, ["-c", `Print :persistent-apps:${i}:tile-data:file-data:_CFURLString`, file], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
      catch { try { execFileSync(PLISTBUDDY, ["-c", `Print :persistent-apps:${i}`, file], { stdio: "ignore" }); url = ""; } catch { break; } }
      out.push({ index: i, url: url.startsWith("/") ? pathToFileURL(url).href.replace(/\/?$/, "/") : url });
    }
  } finally { fs.rmSync(file, { force: true }); }
  return out;
}
/** Take out the Dock entries that match, keeping the first `keep` of them. */
function removeDockEntries(match, keep = 0) {
  const gone = dockEntries().filter(match).slice(keep);
  if (!gone.length) return;
  const file = path.join(os.tmpdir(), `ck-dock-${process.pid}.plist`);
  execFileSync("defaults", ["export", "com.apple.dock", file]);
  try {
    // from the last, so the indexes before it stay put
    for (const e of gone.reverse()) execFileSync(PLISTBUDDY, ["-c", `Delete :persistent-apps:${e.index}`, file]);
    execFileSync("defaults", ["import", "com.apple.dock", file]);
  } finally { fs.rmSync(file, { force: true }); }
  execFile("killall", ["Dock"], () => {});
}

/* ---------------- the engine's and the newsroom's ports: ours alone */
// Something else on them (the earlier app's engine, left running; a copy of
// ours that outlived a crash) would be used in place of ours, with its own
// data: whatever listens there and isn't this app's is stopped.
function freePorts() {
  for (const port of [ENGINE, NEWSROOM]) {
    let pids = [];
    try {
      if (isWin) {
        for (const line of execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" }).split(/\r?\n/)) {
          const f = line.trim().split(/\s+/);
          if (f[1]?.endsWith(`:${port}`) && f[3] === "LISTENING") pids.push(f[4]);
        }
      } else {
        pids = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).split(/\s+/).filter(Boolean);
      }
    } catch { continue; } // nothing listening
    for (const pid of new Set(pids)) {
      if (children.some((c) => String(c.pid) === pid) || pid === String(process.pid)) continue;
      log(`port ${port}: stopping process ${pid}, not this app's`);
      try { if (isWin) execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" }); else process.kill(Number(pid), "SIGKILL"); } catch {}
    }
  }
}

/* ---------------- the earlier script install: moved in, then removed */
async function migrateOldInstall() {
  if (readState().migrated) return null;
  const old = isMac ? path.join(os.homedir(), "Library", "Application Support", "CapitalKranti")
    : isWin ? path.join(process.env.LOCALAPPDATA || "", "CapitalKranti") : "";
  if (!old || !fs.existsSync(old)) { writeState({ migrated: true }); return null; }
  log(`migrating ${old}`);
  // stop it (its engine would hold the ports)
  try { execFileSync(process.execPath, [path.join(old, "scripts", "launch.mjs"), "--stop"], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: "ignore", timeout: 20000 }); } catch {}
  freePorts();
  const copy = (from, to) => { if (fs.existsSync(from) && !fs.existsSync(to)) fs.cpSync(from, to, { recursive: true }); };
  copy(path.join(old, "backend", "data", "capital-kranti.sqlite"), path.join(DATA, "capital-kranti.sqlite"));
  copy(path.join(old, "backend", ".env"), path.join(DATA, "settings.env"));
  copy(path.join(old, "web", "public", "media"), path.join(DATA, "media"));
  copy(path.join(old, "out", "backend"), path.join(DATA, "out"));
  copy(path.join(old, "backups"), path.join(DATA, "backups"));
  if (isMac) {
    try { execFileSync("launchctl", ["bootout", `gui/${process.getuid()}/in.capitalkranti.newsroom`], { stdio: "ignore" }); } catch {}
    fs.rmSync(path.join(os.homedir(), "Library", "LaunchAgents", "in.capitalkranti.newsroom.plist"), { force: true });
    // the old script app (its executable is "capital-kranti"), not this one
    for (const a of [path.join(os.homedir(), "Applications", "Capital Kranti.app"), "/Applications/Capital Kranti.app"]) {
      if (!fs.existsSync(path.join(a, "Contents", "MacOS", "capital-kranti"))) continue;
      fs.rmSync(a, { recursive: true, force: true });
      // its Dock entry would point at nothing
      const url = pathToFileURL(a).href.replace(/\/?$/, "/");
      if (url !== APP_URL) { try { removeDockEntries((e) => e.url === url); } catch (e) { log(`dock: ${e.message}`); } }
    }
  }
  if (isWin) {
    for (const t of ["Capital Kranti (start)", "Capital Kranti (evening run)"]) { try { execFileSync("schtasks", ["/Delete", "/TN", t, "/F"], { stdio: "ignore" }); } catch {} }
    for (const lnk of [path.join(os.homedir(), "Desktop", "Capital Kranti.lnk"), path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Capital Kranti.lnk")]) {
      // the installer makes its own shortcuts; the old ones pointed at the script
      try { const b = fs.readFileSync(lnk); if (b.includes("launch.ps1") || b.includes(Buffer.from("launch.ps1", "utf16le"))) fs.rmSync(lnk); } catch {}
    }
  }
  fs.rmSync(old, { recursive: true, force: true });
  writeState({ migrated: true });
  return "Your earlier setup was moved into the new app.";
}

/* ---------------- updates */
// The newest release on GitHub: checked at start and once a day, or from
// Settings → Updates; downloaded in the background, then put in on a restart
// (asked in a dialog, or from Settings). Windows: electron-updater; macOS
// (not notarised): the release's zip, swapped in by a small script.
const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
let pendingUpdate = null;
/** Where updating stands, for the newsroom: idle | checking | none | downloading | ready | error. */
let update = { state: "idle", current: app.getVersion(), latest: "", error: "" };
const setUpdate = (patch) => {
  update = { ...update, ...patch };
  if (win && !win.isDestroyed()) win.webContents.send("ck:update", update);
};
let winUpdater = null;
function windowsUpdater() {
  if (winUpdater) return winUpdater;
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  // registered once (each check used to add another listener: one dialog per day)
  autoUpdater.on("update-available", (i) => setUpdate({ state: "downloading", latest: i.version }));
  autoUpdater.on("update-not-available", () => setUpdate({ state: "none" }));
  autoUpdater.on("error", (e) => setUpdate({ state: "error", error: e.message }));
  autoUpdater.on("update-downloaded", (i) => {
    pendingUpdate = { apply: () => { quitting = true; autoUpdater.quitAndInstall(); } };
    setUpdate({ state: "ready", latest: i.version });
    if (!update.quiet) offerUpdate();
  });
  return (winUpdater = autoUpdater);
}
/** The newest release's version and its zip for this Mac (null while it's still being built).
 * GitHub's API first; it allows 60 asks an hour per internet connection, so when it says
 * no (403/429: 26 Oct, the check failed with the internet on), the public release pages. */
async function latestRelease() {
  const opts = { headers: { "user-agent": "CapitalKranti" }, signal: AbortSignal.timeout(20_000) };
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, opts);
  const zipOf = (name) => name.endsWith(`mac-${process.arch}.zip`);
  if (r.ok) {
    const rel = await r.json();
    const asset = (rel.assets || []).find((a) => zipOf(a.name));
    return { v: String(rel.tag_name || "").replace(/^v/, ""), zipUrl: asset ? asset.browser_download_url : null };
  }
  if (r.status !== 403 && r.status !== 429) throw new Error(`GitHub answered ${r.status}`);
  const page = await fetch(`https://github.com/${REPO}/releases/latest`, { ...opts, redirect: "manual" });
  const tag = (page.headers.get("location") || "").match(/\/releases\/tag\/(v[\w.-]+)$/)?.[1];
  if (!tag) throw new Error(`GitHub answered ${r.status}, and its releases page ${page.status}`);
  const files = await (await fetch(`https://github.com/${REPO}/releases/expanded_assets/${tag}`, opts)).text();
  const zip = [...files.matchAll(/href="([^"]*\/releases\/download\/[^"]+)"/g)].map((m) => m[1]).find(zipOf);
  return { v: tag.replace(/^v/, ""), zipUrl: zip ? `https://github.com${zip}` : null };
}

/** Look for a newer release. `from`: "start" (quiet unless one is ready), "menu" (says the outcome), "newsroom" (the newsroom shows it). */
async function checkForUpdates(from = "start") {
  if (update.state === "checking" || update.state === "downloading") return update;
  if (update.state === "ready") { if (from === "menu") offerUpdate(); return update; }
  setUpdate({ state: "checking", error: "", quiet: from === "newsroom" });
  try {
    if (isWin && app.isPackaged) {
      const r = await windowsUpdater().checkForUpdates();
      if (!r || !r.updateInfo || !newer(r.updateInfo.version, app.getVersion())) {
        setUpdate({ state: "none" });
        if (from === "menu") dialog.showMessageBox({ message: "Capital Kranti is up to date." });
      }
      return update;
    }
    const { v, zipUrl } = await latestRelease();
    if (!v || !newer(v, app.getVersion())) {
      setUpdate({ state: "none", latest: v });
      if (from === "menu") dialog.showMessageBox({ message: "Capital Kranti is up to date." });
      return update;
    }
    const asset = zipUrl ? { name: zipUrl.split("/").pop(), browser_download_url: zipUrl } : null;
    // a release whose installers are still being built: none to fetch yet
    if (!isMac || !asset || !app.isPackaged) { setUpdate({ state: "none", latest: v, building: true }); return update; }
    // macOS without notarisation: download the new app, check it, swap it in on restart
    setUpdate({ state: "downloading", latest: v });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ck-update-"));
    const zip = path.join(tmp, asset.name);
    fs.writeFileSync(zip, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()));
    execFileSync("ditto", ["-x", "-k", zip, tmp]);
    const fresh = path.join(tmp, "Capital Kranti.app");
    if (!fs.existsSync(path.join(fresh, "Contents", "MacOS"))) throw new Error("the downloaded update isn't an app");
    const current = app.getPath("exe").replace(/\/Contents\/MacOS\/.*$/, "");
    pendingUpdate = { apply: () => {
      const sh = `sleep 2; rm -rf "${current}"; mv "${fresh}" "${current}"; xattr -dr com.apple.quarantine "${current}"; open "${current}"`;
      spawn("/bin/sh", ["-c", sh], { detached: true, stdio: "ignore" }).unref();
      quitting = true;
      app.quit();
    } };
    setUpdate({ state: "ready" });
    if (from !== "newsroom") offerUpdate();
  } catch (e) {
    log(`update check: ${e.message}`);
    setUpdate({ state: "error", error: e.message });
  }
  return update;
}
function offerUpdate() {
  if (!pendingUpdate) return;
  dialog.showMessageBox({ type: "info", buttons: ["Restart to update", "Later"], defaultId: 0,
    message: "A new version of Capital Kranti is ready.", detail: "The paper's data and settings stay as they are." })
    .then(({ response }) => { if (response === 0) pendingUpdate.apply(); });
}
ipcMain.handle("ck:update-status", () => update);
ipcMain.handle("ck:check-update", () => checkForUpdates("newsroom"));
ipcMain.handle("ck:apply-update", () => { if (pendingUpdate) pendingUpdate.apply(); });

/* ---------------- uninstall (macOS; Windows has its own uninstaller) */
async function uninstall() {
  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: "warning", buttons: ["Uninstall", "Cancel"], defaultId: 1, cancelId: 1,
    message: "Uninstall Capital Kranti?", detail: "It stops making the paper and is moved to the Trash.",
    checkboxLabel: "Keep the paper's archive (past issues and settings), to use again later", checkboxChecked: true,
  });
  if (response !== 0) return;
  app.setLoginItemSettings({ openAtLogin: false });
  const appPath = app.getPath("exe").replace(/\/Contents\/MacOS\/.*$/, "");
  if (isMac) {
    // out of the Dock
    try { removeDockEntries((e) => e.url === APP_URL); } catch (e) { log(`dock removal: ${e.message}`); }
    // the 7:55 PM wake (an administrator's password, once)
    if (readState().wakeSet) {
      try { execFileSync("osascript", ["-e", 'do shell script "pmset repeat cancel" with administrator privileges']); } catch {}
    }
  }
  stopAll();
  if (!checkboxChecked) { try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {} }
  if (app.isPackaged) { try { await shell.trashItem(appPath); } catch (e) { log(`trash: ${e.message}`); } }
  app.exit(0);
}

/* ---------------- what the newsroom may ask of the app (preload.js) */
ipcMain.handle("ck:info", () => ({ desktop: true, platform: process.platform, version: app.getVersion(), github: !!githubToken(), canConnect: !!GITHUB_CLIENT_ID,
                                   wake: readState().wakeSet || "", paper: paperNow() }));
/** The engine started again (a new GitHub sign-in, another paper). */
async function restartEngine() {
  const engine = children.find((c) => c.name === "engine");
  if (engine) {
    engine.stopping = true;
    const gone = new Promise((ok) => engine.once("exit", ok));
    engine.kill();
    await gone;
  }
  await startAll();
}
ipcMain.handle("ck:switch-paper", async (_e, id) => {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("no such paper");
  if (id === paperNow()) return;
  writeState({ paper: id });
  log(`switching to the paper ${id}`);
  await restartEngine();
});
ipcMain.handle("ck:connect-github", async () => {
  if (!GITHUB_CLIENT_ID) throw new Error("Connecting the website isn't switched on in this version yet.");
  const form = (o) => new URLSearchParams(o).toString();
  const r = await fetch("https://github.com/login/device/code", { method: "POST", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
                                                                body: form({ client_id: GITHUB_CLIENT_ID, scope: "public_repo" }) });
  const d = await r.json();
  shell.openExternal(d.verification_uri);
  // polled in the background; the newsroom shows the code meanwhile
  (async () => {
    for (let i = 0; i < Math.ceil(d.expires_in / d.interval); i++) {
      await new Promise((ok) => setTimeout(ok, (d.interval + 1) * 1000));
      const t = await (await fetch("https://github.com/login/oauth/access_token", { method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: form({ client_id: GITHUB_CLIENT_ID, device_code: d.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }) })).json();
      if (t.access_token) {
        saveToken(t.access_token);
        // the engine picks the token up when it starts again
        await restartEngine();
        win && win.webContents.send("ck:github-connected");
        return;
      }
      if (t.error && t.error !== "authorization_pending" && t.error !== "slow_down") return;
    }
  })().catch((e) => log(`github: ${e.message}`));
  return { code: d.user_code, url: d.verification_uri };
});
ipcMain.handle("ck:schedule-wake", async (_e, time) => {
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("bad time");
  const [h, m] = time.split(":").map(Number);
  const t = new Date(2000, 0, 1, h, m - 5); // five minutes before the run
  const at = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  if (isMac) execFileSync("osascript", ["-e", `do shell script "pmset repeat wakeorpoweron MTWRFSU ${at}:00" with administrator privileges`]);
  if (isWin) execFileSync("powershell", ["-NoProfile", "-Command",
    `$a=New-ScheduledTaskAction -Execute '${process.execPath.replace(/'/g, "''")}'; $s=New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries; ` +
    `Register-ScheduledTask -TaskName 'Capital Kranti (wake)' -Action $a -Trigger (New-ScheduledTaskTrigger -Daily -At '${at}') -Settings $s -Force | Out-Null`]);
  writeState({ wakeSet: at });
  return at;
});
ipcMain.handle("ck:cancel-wake", async () => {
  if (isMac) execFileSync("osascript", ["-e", 'do shell script "pmset repeat cancel" with administrator privileges']);
  if (isWin) { try { execFileSync("schtasks", ["/Delete", "/TN", "Capital Kranti (wake)", "/F"], { stdio: "ignore" }); } catch {} }
  writeState({ wakeSet: "" });
});

/* ---------------- the menu */
function buildMenu() {
  const t = [
    ...(isMac ? [{ label: "Capital Kranti", submenu: [
      { role: "about" }, { label: "Check for Updates…", click: () => checkForUpdates("menu") }, { type: "separator" },
      { label: "Uninstall Capital Kranti…", click: uninstall }, { type: "separator" },
      { role: "hide" }, { role: "hideOthers" }, { type: "separator" },
      { label: "Quit Capital Kranti", accelerator: "Cmd+Q", click: () => { quitting = true; app.quit(); } },
    ] }] : [{ label: "File", submenu: [{ label: "Check for Updates…", click: () => checkForUpdates("menu") }, { type: "separator" },
      { label: "Quit", accelerator: "Ctrl+Q", click: () => { quitting = true; app.quit(); } }] }]),
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [
      { label: "Today", accelerator: "CmdOrCtrl+1", click: () => show("/newsroom") },
      { label: "Paper", accelerator: "CmdOrCtrl+2", click: () => show("/newsroom/pages") },
      { label: "Stories", accelerator: "CmdOrCtrl+3", click: () => show("/newsroom/stories") },
      { type: "separator" }, { role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" },
    ] },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "Show the logs", click: () => shell.openPath(LOGS) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

/* ---------------- start */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => show(null));
  app.setAppUserModelId("in.capitalkranti.newsroom");
  app.whenReady().then(async () => {
    buildMenu();
    showSplash();
    const moved = await migrateOldInstall().catch((e) => { log(`migration: ${e.message}`); return null; });
    await firstLaunchChores().catch((e) => log(`first launch: ${e.message}`));
    if (app.isPackaged) {
      freePorts();
      await new Promise((r) => setTimeout(r, 500));
    }
    try {
      await startAll();
    } catch (e) {
      log(`start failed: ${e.message}`);
      dialog.showErrorBox("Capital Kranti couldn't start", `${e.message}\n\nThe details are in ${LOGS}.`);
    }
    // opened at log-in: stay in the menu bar until wanted
    const atLogin = app.getLoginItemSettings().wasOpenedAtLogin || process.argv.includes("--hidden");
    if (atLogin) { if (splash) { splash.destroy(); splash = null; } } else createWindow();
    buildTray();
    setInterval(poll, 10_000);
    poll();
    if (moved && Notification.isSupported()) new Notification({ title: "Capital Kranti", body: moved }).show();
    setTimeout(() => checkForUpdates("start"), 15_000);
    setInterval(() => checkForUpdates("start"), 24 * 3600_000);
  });
  app.on("activate", () => show(null));
  app.on("window-all-closed", () => { /* stays in the menu bar / tray */ });
  app.on("before-quit", () => { quitting = true; stopAll(); });
}
