// One browser for the whole engine: measuring text, plotting and printing the
// pages, page images -- each job gets its own context (a tab with its own
// fonts), never a browser of its own. It starts when the first job needs it
// and closes a minute after the last one is done (the app is idle most of
// the day). Copy workers (editorial/copies.ts) connect to one browser the
// batch serves (CK_BROWSER_WS) instead of each starting their own.
//
// Started lean: no GPU (pages are drawn off-screen), no extensions, no audio.
import { chromium, type Browser, type BrowserServer } from "playwright";

const ARGS = ["--disable-gpu", "--disable-dev-shm-usage", "--disable-extensions", "--mute-audio", "--no-first-run",
              "--disable-background-networking", "--disable-component-update"];
const IDLE_MS = 60_000;

let browser: Promise<Browser> | null = null;
let users = 0;
let idle: ReturnType<typeof setTimeout> | null = null;

/** The engine's browser (started, or connected to the copies' one, if need be). Give it back with releaseBrowser(). */
export async function acquireBrowser(): Promise<Browser> {
  users++;
  if (idle) { clearTimeout(idle); idle = null; }
  for (let attempt = 0; ; attempt++) {
    if (!browser) {
      const ws = process.env.CK_BROWSER_WS?.trim();
      const starting = ws ? chromium.connect(ws) : chromium.launch({ args: ARGS });
      browser = starting;
      starting.then((b) => b.on("disconnected", () => { if (browser === starting) browser = null; }), () => { if (browser === starting) browser = null; });
    }
    try {
      const b = await browser;
      if (b.isConnected()) return b;
      browser = null;
    } catch (e) {
      browser = null;
      if (attempt >= 1) { users--; throw e; }
    }
  }
}

/** A job is done with the browser: it closes a minute after the last one. */
export function releaseBrowser() {
  users = Math.max(0, users - 1);
  if (users || idle) return;
  idle = setTimeout(() => {
    idle = null;
    const b = browser;
    browser = null;
    if (users === 0 && b) b.then((x) => x.close()).catch(() => {});
  }, IDLE_MS);
  idle.unref?.();
}

/** A browser the copy workers share (each connects with CK_BROWSER_WS): started per batch, closed with it. */
export async function browserServer(): Promise<BrowserServer> {
  return chromium.launchServer({ args: ARGS });
}

/** Close it now (a worker that's done, so its process can end). */
export async function closeBrowser() {
  if (idle) { clearTimeout(idle); idle = null; }
  const b = browser;
  browser = null;
  users = 0;
  if (b) await b.then((x) => x.close()).catch(() => {});
}
