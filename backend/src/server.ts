// The backend's HTTP API (Node's built-in http, no framework needed):
//
//   GET   /api/issue?date=YYYY-MM-DD   the issue as render-contract JSON (latest version; latest day if no date)
//   GET   /api/issues/:date            build report, status and version
//   POST  /api/issues/:date/build      lay the day out again (keeps editors' edits), as a job
//   POST  /api/issues/:date/approve    mark the latest version approved
//   POST  /api/issues/:date/edits      {storyId, change} -- an editor's change; re-lays out the day (a job)
//   GET   /api/stories?date=           the day's stories (what an editor edits)
//   POST  /api/releases                one release, JSON (an editor's upload, or the browser reader)
//   GET   /api/export/:date.svg?page=N an editable SVG of one page (CorelDRAW)
//   GET   /api/jobs?date=              the day's runs (pipeline.ts), newest first; /api/jobs/current the one running
//   POST  /api/jobs                    {date, from?} -- run the day (from a step); 409 while one runs
//   GET   /api/events                  every change to a running job, as server-sent events (the live log)
//   GET   /api/releases?date=          the day's releases, each with what became of it
//   POST  /api/releases/:id/translate  translate a Hindi release into a story now
//   GET   /api/ads?date= POST /api/ads DELETE /api/ads/:id   the ad bookings (an image, its size, its page and days)
//   POST  /api/issues/:date/publish    approve the latest version and put it on the website
//   GET   /api/status  GET|POST /api/settings   the newsroom's dashboard and settings
//   POST  /api/papers/draft            {pdfs: [base64]} -- a new paper's profile, drafted from its PDFs
//   GET   /api/papers  POST /api/papers   the papers; save a new one from its reviewed draft
//   GET   /api/papers/:id  POST /api/papers/:id/test  GET /api/papers/:id/pdf   a paper's test issue
//   GET   /healthz                     "ok" (for the host's health check)
//   GET   /reader                      the release reader: a bookmark that sends the release page you're reading here
//
// With BACKEND_API_TOKEN set, every POST needs "Authorization: Bearer <token>"
// (builds and edits cost AI credit; approval publishes). Reads stay open: the
// website's readers load page images straight from here.
//
// It also runs the day at the newsroom's run time (20:00 India time unless
// changed in Settings): the whole pipeline, as a job.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "./config.ts";
import { existsSync, readFileSync } from "node:fs";
import { DATA_DIR, ROOT } from "./config.ts";
import { currentJob, onJob, runPipeline, settleInterrupted, STEPS } from "./pipeline.ts";
import type { Ad, Release, StepName, Store } from "./store.ts";

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    // Chrome asks before a public page may reach a server on this machine
    // (Private Network Access): the release reader runs on the
    // Information Department's own page and posts here
    "access-control-allow-private-network": "true",
  });
  res.end(typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

interface UploadedRelease {
  id: number; url: string; dateLine?: string; date?: string; office?: string;
  headline: string; subhead?: string; paras: string[]; photos?: { name: string; base64: string }[];
}

/** Store one uploaded release, its photos written under web/public/media/<date>/. */
export async function acceptRelease(store: Store, u: UploadedRelease): Promise<Release> {
  let date = u.date;
  if (!date && u.dateLine) {
    const m = u.dateLine.match(/([A-Z]{3})\s+(\d{1,2})\s+(\d{4})/);
    if (m) date = `${m[3]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  if (!date || !u.headline || !u.paras?.length) throw new Error("a release needs a date, a headline and body paragraphs");
  const dir = path.join(MEDIA_DIR, date);
  await mkdir(dir, { recursive: true });
  const photos: string[] = [];
  for (const p of u.photos ?? []) {
    const name = `${u.id}-${p.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
    await writeFile(path.join(dir, name), Buffer.from(p.base64, "base64"));
    photos.push(`/media/${date}/${name}`);
  }
  const office = u.office ?? (u.dateLine ?? "").replace(/^.*?\bBY\b/i, "").trim();
  const release: Release = {
    id: u.id, date, url: u.url, office, headline: u.headline.trim(), subhead: (u.subhead ?? "").trim(),
    body: u.paras.map((p) => p.trim()).filter(Boolean).join("\n\n"), photos, fetchedAt: new Date().toISOString(),
  };
  store.putRelease(release);
  return release;
}

/** The release reader: a bookmark to keep in your own browser. On a press
 * release page of gujaratinformation.gujarat.gov.in it reads what's on the
 * page -- headline, sub-heading, date line, paragraphs, photos (scaled to at
 * most 1800px wide, enough for 200 ppi across four columns) -- and hands it
 * to this server through /ingest in a new tab (the release page's security
 * policy doesn't let it call a local server directly); then, if you like,
 * it opens the previous release. One page at a time, read by you: the
 * site's block on automated readers is respected, not worked around. */
function readerPage(req: IncomingMessage): string {
  const origin = `http://${req.headers.host ?? "localhost:4000"}`;
  const token = process.env.BACKEND_API_TOKEN?.trim();
  const target = `${origin}/ingest${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const js = `(function(){var q=function(s){var e=document.querySelector(s);return e?e.textContent.replace(/\\s+/g," ").trim():""};` +
    `var headline=q(".ttm-service-single-content-area .title h4");` +
    `if(!headline){alert("Capital Kranti: open a press release page (PressReleaseDetails) first, and wait for its text to appear.");return}` +
    `var id=Number(new URL(location.href).searchParams.get("id"));var desc=document.querySelector(".ttm-service-description");` +
    `var paras=desc?Array.prototype.map.call(desc.querySelectorAll("p"),function(p){return p.textContent.replace(/\\s+/g," ").trim()}).filter(Boolean):[];` +
    `var photos=[];(desc?Array.prototype.slice.call(desc.querySelectorAll("img")):[]).filter(function(i){return i.naturalWidth>=300}).slice(0,4).forEach(function(img,k){` +
    `try{var s=Math.min(1,1800/img.naturalWidth),c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);` +
    `c.getContext("2d").drawImage(img,0,0,c.width,c.height);photos.push({name:k+".jpg",base64:c.toDataURL("image/jpeg",0.85).split(",")[1]})}catch(e){}});` +
    `var data={id:id,url:location.href,dateLine:q(".ReleaseDateSubHeaddateTime"),headline:headline,subhead:q("h5.subtitle"),paras:paras,photos:photos};` +
    `window.open(${JSON.stringify(target)}+"#"+encodeURIComponent(JSON.stringify(data)),"_blank");` +
    `if(confirm("Sent release "+id+" ("+data.dateLine+", "+photos.length+" photo(s)). Open the previous release?"))location.href=location.href.replace(/id=\\d+/,"id="+(id-1))})();`;
  return `<!doctype html><meta charset="utf-8"><title>Capital Kranti release reader</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#1f1f24}
a.bm{display:inline-block;padding:10px 18px;background:#2e3092;color:#fff;border-radius:6px;text-decoration:none;font-weight:600}</style>
<h1>Release reader</h1>
<p>Drag this button to your browser's bookmarks bar:</p>
<p><a class="bm" href="${esc(`javascript:${js}`)}">Send to Capital Kranti</a></p>
<ol><li>Keep this server running.</li>
<li>Open a press release on <a href="https://gujaratinformation.gujarat.gov.in" target="_blank">gujaratinformation.gujarat.gov.in</a> (a <code>PressReleaseDetails</code> page, Gujarati) and wait for its text.</li>
<li>Click the bookmark. The release is stored for the date on its date line; a tab opens briefly to confirm.</li>
<li>Choose OK to open the previous release (ids run in order across departments), and repeat for the whole day.</li></ol>
<p>Then: <code>cli.ts rewrite --date YYYY-MM-DD</code> and <code>cli.ts build --date YYYY-MM-DD</code>.</p>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Now in India: the day and the time ("HH:MM"). */
function indiaNow(): { day: string; time: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}` };
}

/** Calls `job` once a day at the settings' run time (India time), if it's on. */
function everyEvening(store: Store, job: (day: string) => Promise<unknown>, log: (s: string) => void) {
  setInterval(() => {
    const { autoRun, runAt } = settingsOf(store);
    const { day, time } = indiaNow();
    if (!autoRun || time < runAt || store.setting("lastScheduledRun", "") === day) return;
    store.putSetting("lastScheduledRun", day);
    log(`evening run for ${day}`);
    job(day).catch((e) => log(`evening run failed: ${e instanceof Error ? e.message : e}`));
  }, 30_000);
}

/** The newsroom's settings, with their defaults. */
export function settingsOf(store: Store) {
  return { runAt: store.setting("runAt", "20:00"), autoRun: store.setting("autoRun", true) };
}

const ENV_FILE = path.join(ROOT, "backend", ".env");
/** Is a key set in backend/.env (its value is never sent anywhere)? */
const envHas = (name: string) => !!process.env[name] || (existsSync(ENV_FILE) && readFileSync(ENV_FILE, "utf8").split("\n").some((l) => l.startsWith(`${name}=`) && l.length > name.length + 1));
/** Set one key in backend/.env, keeping the rest of the file. */
async function setEnv(name: string, value: string) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n").filter((l) => l && !l.startsWith(`${name}=`)) : [];
  lines.push(`${name}=${value.replace(/[\r\n]/g, "")}`);
  await writeFile(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
}

/** What became of each of the day's releases. */
function releaseStatus(store: Store, date: string) {
  const stories = store.stories(date);
  const built = store.latestIssue(date)?.report as { placed?: { story: string }[]; leftOut?: { id: string }[] } | undefined;
  const placed = new Set((built?.placed ?? []).map((p) => p.story));
  return store.releases(date).map((r) => {
    const story = stories.find((s) => s.releaseId === r.id || s.mergedFrom?.includes(r.id));
    return {
      id: r.id, source: r.source ?? "gujinfo", lang: r.lang ?? "gu", ministry: r.ministry ?? r.office, headline: r.headline,
      url: r.url, photos: r.photos, body: r.body,
      story: story?.id ?? null, inPaper: story ? placed.has(story.id) : false,
      translated: story?.translatedFrom === "hi", roundUp: (story?.mergedFrom?.length ?? 0) > 1,
    };
  });
}

/** Does this request carry the API token (or is none configured)? */
function authorized(req: IncomingMessage): boolean {
  const token = process.env.BACKEND_API_TOKEN?.trim();
  return !token || req.headers.authorization === `Bearer ${token}`;
}

export async function serve(store: Store, opts: { port: number; host?: string; log: (s: string) => void }) {
  const { log } = opts;
  settleInterrupted(store);
  /** Start a run in the background and answer at once with its job. */
  const startJob = (res: ServerResponse, date: string, from?: StepName) => {
    if (currentJob()) return send(res, 409, { error: `a run for ${currentJob()!.date} is still going`, job: currentJob() });
    runPipeline(store, date, { by: "newsroom", from, log }).catch((e) => log(`run for ${date} stopped: ${e instanceof Error ? e.message : e}`));
    return send(res, 202, currentJob());
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
      if (req.method === "POST" && !authorized(req)) return send(res, 401, { error: "missing or wrong API token" });
      if (req.method === "GET" && url.pathname === "/api/issue") {
        const date = url.searchParams.get("date") ?? store.latestDate();
        const got = date ? store.latestIssue(date) : null;
        return got ? send(res, 200, got.issue) : send(res, 404, { error: `no issue built for ${date ?? "any day"}` });
      }
      if (parts[0] === "api" && parts[1] === "issues" && parts[2]) {
        const date = parts[2];
        if (req.method === "GET" && parts.length === 3) {
          const got = store.latestIssue(date);
          return got ? send(res, 200, { date, version: got.version, status: got.status, report: got.report })
                     : send(res, 404, { error: `no issue built for ${date}` });
        }
        if (req.method === "GET" && parts[3] === "pdf") {
          const got = store.latestIssue(date);
          const file = (got?.report as { pdf?: string } | undefined)?.pdf;
          if (!file) return send(res, 404, { error: `no issue built for ${date}` });
          return send(res, 200, new Uint8Array(await readFile(file)), "application/pdf");
        }
        if (req.method === "POST" && parts[3] === "build") return startJob(res, date, "build");
        if (req.method === "POST" && parts[3] === "approve") {
          const got = store.latestIssue(date);
          if (!got) return send(res, 404, { error: `no issue built for ${date}` });
          store.approve(date, got.version);
          return send(res, 200, { date, version: got.version, status: "approved" });
        }
        if (req.method === "POST" && parts[3] === "edits") {
          const body = (await readJson(req)) as { storyId: string; change: Record<string, unknown> };
          if (!body.storyId || !body.change) return send(res, 400, { error: "an edit needs storyId and change" });
          store.addEdit({ issueDate: date, storyId: body.storyId, change: body.change, at: new Date().toISOString() });
          // laid out again in the background; while another run goes, its own build takes the edit
          if (currentJob()) return send(res, 202, { saved: true, rebuilding: "after the run that's going" });
          return startJob(res, date, "build");
        }
        if (req.method === "POST" && parts[3] === "publish") {
          const got = store.latestIssue(date);
          if (!got) return send(res, 404, { error: `no issue built for ${date}` });
          const { publishIssue } = await import("./publish.ts");
          const lines: string[] = [];
          const body = (await readJson(req)) as { force?: boolean };
          const published = await publishIssue(store, date, { log: (l) => { lines.push(l); log(l); }, push: true, force: !!body.force });
          store.approve(date, got.version);
          return send(res, 200, { date, version: got.version, status: "approved", published, log: lines });
        }
      }
      if (req.method === "GET" && url.pathname === "/reader") return send(res, 200, readerPage(req), "text/html; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/ingest") {
        // A hand-off page for reading releases in a browser: a release page
        // can't call this server (browsers keep public pages off local
        // servers), but it can navigate here with the release in the URL's
        // #fragment; this page then stores it, same-origin.
        return send(res, 200, `<!doctype html><meta charset="utf-8"><title>…</title><pre id="o"></pre><script>
          (async () => {
            const o = document.getElementById("o");
            try {
              const body = decodeURIComponent(location.hash.slice(1));
              const token = new URLSearchParams(location.search).get("token");
              const headers = { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) };
              const r = await fetch("/api/releases", { method: "POST", headers, body });
              const j = await r.json();
              document.title = r.ok ? "stored " + j.id : "error";
              o.textContent = r.ok ? "Stored release " + j.id + " for " + j.date + " (" + j.photos + " photo(s)). This tab closes itself."
                                   : JSON.stringify(j);
              if (r.ok) setTimeout(() => window.close(), 1500);
            } catch (e) { document.title = "error"; o.textContent = String(e); }
          })();
        </script>`, "text/html; charset=utf-8");
      }
      if (req.method === "GET" && parts[0] === "api" && parts[1] === "pages" && parts[2] && /^\d+\.png$/.test(parts[3] ?? "")) {
        // a page as an image (for papers whose fonts may not be served publicly)
        const { pageImageDir } = await import("./build.ts");
        try {
          const png = await readFile(path.join(pageImageDir(parts[2]), parts[3]));
          return send(res, 200, new Uint8Array(png), "image/png");
        } catch {
          return send(res, 404, { error: `no image of page ${parts[3]} for ${parts[2]}` });
        }
      }
      if (req.method === "GET" && url.pathname === "/api/stories") {
        const date = url.searchParams.get("date") ?? store.latestDate() ?? "";
        // as the editor left them: edits applied, the dropped ones marked, where each one went
        const { applyTextEdits, droppedBy } = await import("./layout/stories.ts");
        const edits = store.edits(date);
        const dropped = droppedBy(edits);
        const report = store.latestIssue(date)?.report as { placed?: { page: number; story: string; cols: number }[] } | undefined;
        const where = new Map((report?.placed ?? []).map((p) => [p.story, p]));
        return send(res, 200, applyTextEdits(store.stories(date), edits).map((s) => ({
          ...s, dropped: dropped.has(s.id), edited: edits.some((e) => e.storyId === s.id),
          page: where.get(s.id)?.page ?? null, cols: where.get(s.id)?.cols ?? null,
        })));
      }
      if (req.method === "POST" && url.pathname === "/api/releases") {
        const r = await acceptRelease(store, (await readJson(req)) as UploadedRelease);
        log(`release ${r.id} stored for ${r.date}: ${r.headline.slice(0, 60)} (${r.photos.length} photos)`);
        return send(res, 200, { id: r.id, date: r.date, photos: r.photos.length });
      }
      if (req.method === "GET" && parts[0] === "api" && parts[1] === "export" && parts[2]?.endsWith(".svg")) {
        const date = parts[2].replace(/\.svg$/, "");
        const got = store.latestIssue(date);
        if (!got) return send(res, 404, { error: `no issue built for ${date}` });
        const { pageSvg } = await import("./export/svg.ts");
        return send(res, 200, await pageSvg(got.issue, Number(url.searchParams.get("page") ?? 1)), "image/svg+xml; charset=utf-8");
      }
      if (parts[0] === "api" && parts[1] === "jobs") {
        if (req.method === "GET" && parts[2] === "current") return send(res, 200, currentJob());
        if (req.method === "GET" && !parts[2]) return send(res, 200, store.jobs(url.searchParams.get("date") ?? undefined));
        if (req.method === "POST" && !parts[2]) {
          const body = (await readJson(req)) as { date?: string; from?: StepName };
          if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return send(res, 400, { error: "a run needs a date (YYYY-MM-DD)" });
          if (body.from && !STEPS.includes(body.from)) return send(res, 400, { error: `no step "${body.from}"` });
          return startJob(res, body.date, body.from);
        }
      }
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive",
                             "access-control-allow-origin": "*" });
        res.write(`data: ${JSON.stringify({ job: currentJob() })}\n\n`);
        const off = onJob((job, line) => res.write(`data: ${JSON.stringify({ job, line })}\n\n`));
        const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
        req.on("close", () => { off(); clearInterval(ping); });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/releases") {
        return send(res, 200, releaseStatus(store, url.searchParams.get("date") ?? indiaNow().day));
      }
      if (req.method === "POST" && parts[0] === "api" && parts[1] === "releases" && parts[3] === "translate") {
        const r = store.release(Number(parts[2]));
        if (!r) return send(res, 404, { error: `no release ${parts[2]}` });
        const { env } = await import("./editorial/rewrite.ts");
        const key = env("OPENROUTER_API_KEY");
        if (!key) return send(res, 400, { error: "no OpenRouter key: add it in Settings" });
        const { translateOne } = await import("./editorial/translate.ts");
        const got = await translateOne(r, key);
        store.putStory(got.story);
        return send(res, 200, { story: got.story, cost: got.cost });
      }
      if (parts[0] === "api" && parts[1] === "ads") {
        if (req.method === "GET") return send(res, 200, store.ads(url.searchParams.get("date") ?? indiaNow().day));
        if (req.method === "POST") return send(res, 200, await bookAd(store, (await readJson(req)) as AdBooking));
        if (req.method === "DELETE" && parts[2]) {
          // a booking is a row per day it runs ("<id>@<date>")
          const id = decodeURIComponent(parts[2]);
          store.db.prepare("delete from ads where id = ? or id like ?").run(id, `${id}@%`);
          return send(res, 200, { deleted: parts[2] });
        }
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        const { day, time } = indiaNow();
        const s = settingsOf(store);
        const latest = store.latestIssue(day);
        return send(res, 200, {
          today: day, now: time, ...s, nextRun: s.autoRun ? `${store.setting("lastScheduledRun", "") === day || time >= s.runAt ? "tomorrow" : "today"} ${s.runAt}` : null,
          running: currentJob(), lastJob: store.jobs(undefined, 1)[0] ?? null,
          openrouterKey: envHas("OPENROUTER_API_KEY"),
          issue: latest ? { version: latest.version, status: latest.status, ready: (latest.report as { ready?: boolean }).ready } : null,
          version: gitVersion(),
        });
      }
      if (parts[0] === "api" && parts[1] === "settings") {
        if (req.method === "GET") return send(res, 200, { ...settingsOf(store), openrouterKey: envHas("OPENROUTER_API_KEY") });
        if (req.method === "POST") {
          const body = (await readJson(req)) as { runAt?: string; autoRun?: boolean; openrouterKey?: string };
          if (body.runAt !== undefined) {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.runAt)) return send(res, 400, { error: "the run time is HH:MM, e.g. 20:00" });
            store.putSetting("runAt", body.runAt);
          }
          if (body.autoRun !== undefined) store.putSetting("autoRun", !!body.autoRun);
          if (body.openrouterKey) {
            if (!/^sk-or-[A-Za-z0-9_-]{20,}$/.test(body.openrouterKey.trim())) return send(res, 400, { error: "that doesn't look like an OpenRouter key (sk-or-...)" });
            await setEnv("OPENROUTER_API_KEY", body.openrouterKey.trim());
          }
          return send(res, 200, { ...settingsOf(store), openrouterKey: envHas("OPENROUTER_API_KEY") });
        }
      }
      if (parts[0] === "api" && parts[1] === "papers") return await papersApi(req, res, parts, url);
      return send(res, 404, { error: "not found" });
    } catch (e) {
      log(`error: ${e instanceof Error ? e.stack : e}`);
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  });
  // local by default; a host like Render needs 0.0.0.0 (HOST)
  const host = opts.host ?? "127.0.0.1";
  await new Promise<void>((resolve) => server.listen(opts.port, host, resolve));
  log(`backend listening on http://${host}:${opts.port}`);
  everyEvening(store, (day) => runPipeline(store, day, { by: "schedule", log }), log);
  backupDaily(store, log);
}

/** An ad booked in the newsroom: its image, its size on the page, the page and the days it runs. */
interface AdBooking {
  name: string; base64: string; cols: number; heightCm: number; page: number;
  dates?: string[]; weekdays?: number[]; from?: string; to?: string;
}

/** Store an ad's image and book it on each of its days (it's placed by layout/ads.ts). */
async function bookAd(store: Store, b: AdBooking): Promise<{ booked: string[] }> {
  const { GRID, PT } = await import("./layout/typography.ts");
  const { spanWidth } = await import("./layout/module.ts");
  if (!b.base64 || !b.cols || !b.heightCm || !b.page) throw new Error("an ad needs an image, its width in columns, its height in cm and a page");
  const id = `ad-${b.name.replace(/\.[a-z]+$/i, "").replace(/[^A-Za-z0-9-]+/g, "-").toLowerCase()}-${Date.now().toString(36)}`;
  const dir = path.join(MEDIA_DIR, "ads");
  await mkdir(dir, { recursive: true });
  const file = `${id}.${/^\/9j/.test(b.base64) ? "jpg" : "png"}`;
  await writeFile(path.join(dir, file), Buffer.from(b.base64, "base64"));
  const days = new Set(b.dates ?? []);
  if (b.from && b.to) {
    for (let d = new Date(`${b.from}T12:00:00Z`); d <= new Date(`${b.to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      if (!b.weekdays?.length || b.weekdays.includes(d.getUTCDay())) days.add(d.toISOString().slice(0, 10));
    }
  }
  if (!days.size) throw new Error("an ad needs the days it runs");
  const width = spanWidth(Math.min(GRID.columns, Math.max(1, Math.round(b.cols))));
  const height = (b.heightCm / 2.54) * 72 * PT;
  for (const date of days) {
    // the day's first booking replaces the 8 August stand-ins
    const ads = store.ads(date);
    const { referenceAds } = await import("./layout/stories.ts");
    const standIns = new Set(referenceAds("").map((a) => a.id));
    for (const a of ads) if (standIns.has(a.id)) store.db.prepare("delete from ads where id = ? and date = ?").run(a.id, date);
    const ad: Ad = { id: `${id}`, date, page: b.page, x: 0, y: 0, width, height, url: `/media/ads/${file}`, pinned: false };
    store.db.prepare("insert or replace into ads (id, date, json) values (?, ?, ?)").run(`${id}@${date}`, date, JSON.stringify(ad));
  }
  return { booked: [...days].sort() };
}

let version: string | null = null;
/** The code's version (its git commit), for the newsroom's About line. */
function gitVersion(): string {
  if (version === null) {
    try {
      version = readFileSync(path.join(ROOT, ".git", "HEAD"), "utf8").trim();
      const ref = version.match(/^ref: (.+)$/)?.[1];
      if (ref) version = `${ref.split("/").pop()} ${readFileSync(path.join(ROOT, ".git", ref), "utf8").trim().slice(0, 7)}`;
    } catch { version = "unknown"; }
  }
  return version;
}

/** A copy of the database every day (backups/, the last 30 kept): SQLite's
 * VACUUM INTO, consistent even while the engine writes. */
function backupDaily(store: Store, log: (s: string) => void) {
  const dir = path.join(DATA_DIR || ROOT, "backups");
  const once = async () => {
    const file = path.join(dir, `capital-kranti-${indiaNow().day}.sqlite`);
    if (existsSync(file)) return;
    await mkdir(dir, { recursive: true });
    store.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const { readdir, rm } = await import("node:fs/promises");
    const old = (await readdir(dir)).filter((f) => /^capital-kranti-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().slice(0, -30);
    for (const f of old) await rm(path.join(dir, f));
    log(`database backed up to ${file}`);
  };
  const safe = () => once().catch((e) => log(`backup failed: ${e instanceof Error ? e.message : e}`));
  safe();
  setInterval(safe, 60 * 60_000);
}

/** The papers: publications/<id>/ each; every one but this engine's own is
 * built in its own process and data folder (papers/<id>/). */
async function papersApi(req: IncomingMessage, res: ServerResponse, parts: string[], url: URL) {
  const { readdir } = await import("node:fs/promises");
  const pubs = path.join(ROOT, "publications");
  const dataOf = (id: string) => path.join(ROOT, "papers", id);
  const issueOf = async (id: string) => {
    const file = path.join(dataOf(id), "capital-kranti.sqlite");
    if (!existsSync(file)) return null;
    const { Store } = await import("./store.ts");
    const st = new Store(file);
    const day = st.latestDate();
    const got = day ? st.latestIssue(day) : null;
    st.db.close();
    return got ? { date: day, version: got.version, ready: (got.report as { ready?: boolean }).ready, pdf: (got.report as { pdf?: string }).pdf,
                   gates: (got.report as { gates?: unknown[] }).gates } : null;
  };
  if (req.method === "POST" && parts[2] === "draft") {
    const body = (await readJson(req)) as { pdfs?: string[] };
    if (!body.pdfs?.length) return send(res, 400, { error: "upload one or more of the paper's PDF issues" });
    const { extractDraft } = await import("./onboard/extract.ts");
    return send(res, 200, await extractDraft(body.pdfs.map((b) => new Uint8Array(Buffer.from(b, "base64")))));
  }
  if (req.method === "GET" && !parts[2]) {
    const out = [];
    for (const id of (await readdir(pubs)).filter((d) => existsSync(path.join(pubs, d, "profile.json")))) {
      const prof = JSON.parse(readFileSync(path.join(pubs, id, "profile.json"), "utf8")) as { name: string; language: { lang: string }; issue: { pages: number } };
      out.push({ id, name: prof.name, lang: prof.language.lang, pages: prof.issue.pages, own: id === (process.env.CK_PUBLICATION?.trim() || "capital-kranti"),
                 test: ["dev-test", "sample-english", "sample-urdu"].includes(id), issue: await issueOf(id) });
    }
    return send(res, 200, out);
  }
  if (req.method === "POST" && !parts[2]) {
    const { savePaper } = await import("./onboard/save.ts");
    const saved = await savePaper((await readJson(req)) as import("./onboard/save.ts").NewPaper);
    // the profile must load as the engine will load it
    const { ProfileSchema } = await import("@ck/shared/profile");
    const check = ProfileSchema.safeParse(JSON.parse(readFileSync(path.join(saved.dir, "profile.json"), "utf8")));
    if (!check.success) return send(res, 400, { error: `the profile doesn't validate: ${check.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` });
    return send(res, 200, saved);
  }
  const id = parts[2];
  if (!id || !/^[a-z0-9-]+$/.test(id) || !existsSync(path.join(pubs, id, "profile.json"))) return send(res, 404, { error: `no paper "${id}"` });
  if (req.method === "POST" && parts[3] === "test") {
    const body = (await readJson(req)) as { date?: string };
    const date = body.date ?? indiaNow().day;
    const { spawn } = await import("node:child_process");
    const { openSync } = await import("node:fs");
    await mkdir(dataOf(id), { recursive: true });
    const log = openSync(path.join(dataOf(id), "test.log"), "w");
    const child = spawn(process.execPath, ["--experimental-strip-types", "--experimental-sqlite", "--no-warnings", path.join(ROOT, "backend", "src", "cli.ts"), "all", "--date", date],
      { cwd: ROOT, env: { ...process.env, CK_PUBLICATION: id, DATA_DIR: dataOf(id) }, stdio: ["ignore", log, log], detached: false });
    child.on("error", () => {});
    return send(res, 202, { id, date, started: true });
  }
  if (req.method === "GET" && parts[3] === "pdf") {
    const got = await issueOf(id);
    if (!got?.pdf || !existsSync(got.pdf)) return send(res, 404, { error: `no test issue for ${id} yet` });
    return send(res, 200, new Uint8Array(await readFile(got.pdf)), "application/pdf");
  }
  if (req.method === "GET" && !parts[3]) {
    const logFile = path.join(dataOf(id), "test.log");
    const log = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter((l) => l && !/^  p\d  |fit to/.test(l)).slice(-40) : [];
    return send(res, 200, { id, issue: await issueOf(id), log });
  }
  return send(res, 404, { error: "not found" });
}
