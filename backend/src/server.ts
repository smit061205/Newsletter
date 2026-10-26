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
//   GET   /api/issues/:date/copies     the day's copies (editorial/copies.ts); POST {count, reword, shuffle, lang} makes them
//   GET   /api/issues/:date/editions   the day's sister papers; POST {only?} makes them (all, or one); GET .../editions/<id>.pdf
//   GET   /api/issues/:date/copies/N.pdf  one copy
//   GET   /api/layout                  the page, its columns and each page's room for stories (the Ads screen's preview)
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
import { DATA_DIR, ENV_FILE, PAPERS_HOME, publicationDir, ROOT } from "./config.ts";
import { collecting, currentJob, onJob, runPipeline, settleInterrupted, STEPS } from "./pipeline.ts";
import type { Ad, Release, StepName, Store } from "./store.ts";
import { profile, PUBLICATION as PUBLICATION_ID } from "./profile.ts";
import { DEFAULT_EDITIONS, START_RATES, type CostKind, type Edition } from "./editorial/copies.ts";

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
  // a run missed while the computer was off happens when it's back -- but not
  // on the very first start (a fresh install after the run time waits for tomorrow)
  if (!store.setting("firstStart", "")) {
    const { day, time } = indiaNow();
    store.putSetting("firstStart", day);
    if (time >= settingsOf(store).runAt) store.putSetting("lastScheduledRun", day);
  }
  setInterval(() => {
    const { autoRun, runAt } = settingsOf(store);
    const { day, time } = indiaNow();
    if (!autoRun || time < runAt || store.setting("lastScheduledRun", "") === day) return;
    // no AI key: nothing would be written or translated -- wait for one (Settings)
    if (!envHas("OPENROUTER_API_KEY")) {
      if (store.setting("noKeyLogged", "") !== day) { store.putSetting("noKeyLogged", day); log(`evening run for ${day} skipped: no OpenRouter key yet (Settings)`); }
      return;
    }
    store.putSetting("lastScheduledRun", day);
    log(`evening run for ${day}`);
    job(day).catch((e) => log(`evening run failed: ${e instanceof Error ? e.message : e}`));
  }, 30_000);
}

/** The newsroom's settings, with their defaults. */
export function settingsOf(store: Store) {
  return {
    runAt: store.setting("runAt", "20:00"), autoRun: store.setting("autoRun", true),
    /** the newsroom's language: Gujarati or English */
    lang: store.setting<"gu" | "en">("lang", process.env.CK_LANG === "en" ? "en" : "gu"),
    /** the first-run welcome is done (a second paper of the same newsroom needs none) */
    onboarded: store.setting("onboarded", !!process.env.CK_PAPERS_HOME && PUBLICATION_ID !== "capital-kranti"),
    /** rupees to a US dollar, for showing the AI's cost (reported in USD) */
    inrPerUsd: store.setting("inrPerUsd", 88),
    /** what a story really costs in each kind of copy (US$), learned from batches (editorial/copies.ts), and a copy's minutes */
    costRates: { ...START_RATES, ...store.setting<Partial<Record<CostKind, number>>>("costRates", {}) },
    copyMinutes: store.setting("copyMinutes", 1),
    /** the sample ads printed on a day with nothing booked (the Ads screen) */
    samplesOn: store.setting("samplesOn", true),
    /** the rate kept up to date from the day's exchange rate (rupeeRate) */
    inrAuto: store.setting("inrAuto", true),
    /** when it was last brought up to date (ISO), "" never */
    inrUpdated: store.setting("inrUpdated", ""),
    notify: store.setting("notify", true),
    /** the public website, for "Open the website" */
    siteUrl: store.setting("siteUrl", ""),
    /** the sister papers (editorial/copies.ts): their names and languages */
    editions: store.setting<Edition[]>("editions", DEFAULT_EDITIONS),
    /** make them by themselves once the evening paper is made */
    editionsAuto: store.setting("editionsAuto", true),
  };
}

// (backend/.env, or the app-data folder's settings.env: config.ts ENV_FILE)
/** Is a key set in backend/.env (its value is never sent anywhere)? */
const envHas = (name: string) => !!process.env[name] || (existsSync(ENV_FILE) && readFileSync(ENV_FILE, "utf8").split("\n").some((l) => l.startsWith(`${name}=`) && l.length > name.length + 1));
/** Set one key in backend/.env, keeping the rest of the file. */
async function setEnv(name: string, value: string) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split("\n").filter((l) => l && !l.startsWith(`${name}=`)) : [];
  lines.push(`${name}=${value.replace(/[\r\n]/g, "")}`);
  await writeFile(ENV_FILE, lines.join("\n") + "\n", { mode: 0o600 });
}

/** The paper's Telegram bot, for Settings: its name (if the token works), the code a new person sends it, who's let in. */
async function telegramOf(store: Store) {
  if (!envHas("TELEGRAM_BOT_TOKEN")) return { token: false };
  const { botName, telegramState } = await import("./ingest/telegram.ts");
  const { code, chats } = telegramState(store);
  const bot = await botName();
  return { token: true, bot: bot === "busy" ? null : bot, busy: bot === "busy", code, chats, waiting: store.inbox(true).length };
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
      translated: !!story?.translatedFrom, roundUp: (story?.mergedFrom?.length ?? 0) > 1,
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
  copiesNow = (await import("./editorial/copies.ts")).currentCopies;
  // days edited while a run went: laid out again, one at a time, when it ends
  const next = () => {
    if (currentJob() || copiesNow?.()) return;
    const day = [...afterRun][0];
    if (!day) return;
    afterRun.delete(day);
    log(`laying out ${day} again for the edits made while a run went`);
    runPipeline(store, day, { by: "newsroom", from: "build", log }).catch((e) => log(`run for ${day} stopped: ${e instanceof Error ? e.message : e}`));
  };
  onJob((job) => { if (job.status !== "running") setTimeout(next, 500); });
  setInterval(next, 30_000);
  /** Start a run in the background and answer at once with its job. */
  const startJob = (res: ServerResponse, date: string, from?: StepName) => {
    if (currentJob()) return send(res, 409, { error: `a run for ${currentJob()!.date} is still going`, job: currentJob() });
    if (copiesNow?.()?.date === date) return send(res, 409, { error: "copies of this day are being made: make the paper again when they're done" });
    runPipeline(store, date, { by: "newsroom", from, log }).catch((e) => log(`run for ${date} stopped: ${e instanceof Error ? e.message : e}`));
    return send(res, 202, currentJob());
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, "ok", "text/plain");
      // release photos and ads (the newsroom shows them from here: MEDIA_DIR may be the app's data folder)
      if (req.method === "GET" && parts[0] === "media" && parts.length > 1 && !parts.includes("..")) {
        const type = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[path.extname(url.pathname).slice(1).toLowerCase()];
        if (!type) return send(res, 404, { error: "not an image" });
        const file = path.resolve(MEDIA_DIR, ...parts.slice(1).map(decodeURIComponent));
        if (!file.startsWith(path.resolve(MEDIA_DIR) + path.sep)) return send(res, 404, { error: "not found" });
        try { return send(res, 200, new Uint8Array(await readFile(file)), type); }
        catch { return send(res, 404, { error: `no file ${url.pathname}` }); }
      }
      if (req.method === "POST" && !authorized(req)) return send(res, 401, { error: "missing or wrong API token" });
      if (req.method === "GET" && url.pathname === "/api/issue") {
        const date = url.searchParams.get("date") ?? store.latestDate();
        const got = date ? store.latestIssue(date) : null;
        return got ? send(res, 200, got.issue) : send(res, 404, { error: `no issue built for ${date ?? "any day"}` });
      }
      if (req.method === "GET" && url.pathname === "/api/issues") {
        // the archive: every day built, newest first, its latest version
        const rows = store.db.prepare("select date, max(version) v from issues group by date order by date desc limit 120").all() as { date: string; v: number }[];
        return send(res, 200, rows.map((row) => {
          const got = store.latestIssue(row.date)!;
          const rep = got.report as { issueNumber?: number; ready?: boolean; cost?: number; placed?: unknown[]; pages?: number };
          return { date: row.date, version: got.version, status: got.status, issueNumber: rep.issueNumber, ready: rep.ready,
                   cost: rep.cost, stories: rep.placed?.length ?? 0, pages: rep.pages };
        }));
      }
      if (parts[0] === "api" && parts[1] === "issues" && parts[2]) {
        const date = parts[2];
        if (req.method === "GET" && parts.length === 3) {
          const got = store.latestIssue(date);
          return got ? send(res, 200, { date, version: got.version, status: got.status, report: got.report })
                     : send(res, 404, { error: `no issue built for ${date}` });
        }
        if (req.method === "GET" && parts[3] === "editable.pdf") {
          // the paper as a PDF whose text stays text in CorelDRAW (export/pdf-editable.ts)
          const got = store.latestIssue(date);
          if (!got) return send(res, 404, { error: `no issue built for ${date}` });
          return sendEditable(res, got.issue);
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
          // laid out again in the background; while a run goes (this day's or
          // another's), the day is laid out again as soon as it's done
          if (currentJob() || copiesNow?.()?.date === date) {
            afterRun.add(date);
            return send(res, 202, { saved: true, rebuilding: "after the run that's going" });
          }
          return startJob(res, date, "build");
        }
        if ((parts[3] === "copies" || parts[3] === "editions") && parts[4] === "stop" && req.method === "POST") {
          const { stopCopies } = await import("./editorial/copies.ts");
          return stopCopies() ? send(res, 202, { stopping: true }) : send(res, 404, { error: "nothing is being made" });
        }
        if (parts[3] === "copies") {
          const { copiesOf, copyFile, currentCopies, makeCopies } = await import("./editorial/copies.ts");
          if (req.method === "GET" && parts[4]?.endsWith(".editable.pdf")) {
            const json = copyFile(date, Number(parts[4].replace(/\.editable\.pdf$/, ""))).replace(/\.pdf$/, ".json");
            if (!existsSync(json)) return send(res, 404, { error: "make the copies again for their CorelDRAW PDF" });
            return sendEditable(res, JSON.parse(await readFile(json, "utf8")));
          }
          if (req.method === "GET" && parts[4]) {
            const n = Number(parts[4].replace(/\.pdf$/, ""));
            const file = copyFile(date, n);
            if (!Number.isInteger(n) || n < 1 || !existsSync(file)) return send(res, 404, { error: `no copy ${parts[4]} for ${date}` });
            return send(res, 200, new Uint8Array(await readFile(file)), "application/pdf");
          }
          if (req.method === "GET") return send(res, 200, copiesOf(date));
          if (req.method === "POST") {
            const body = (await readJson(req)) as { count?: number; reword?: string; shuffle?: string; lang?: string };
            if (body.lang !== undefined && !["gu", "hi", "ur"].includes(body.lang)) return send(res, 400, { error: "the language is gu, hi or ur" });
            const count = Math.round(Number(body.count));
            if (!(count >= 1 && count <= 20)) return send(res, 400, { error: "make between 1 and 20 copies" });
            if (!["headline", "headlineDeck", "all"].includes(body.reword ?? "")) return send(res, 400, { error: "what to reword: headline, headlineDeck or all" });
            if (!["keepLead", "anywhere", "samePage"].includes(body.shuffle ?? "")) return send(res, 400, { error: "how far stories move: keepLead, anywhere or samePage" });
            if (currentCopies()) return send(res, 409, { error: "copies or the other papers are being made: wait for them to finish" });
            if (currentJob()?.date === date) return send(res, 409, { error: "the day's paper is being made: make copies when it's done" });
            if (!store.latestIssue(date)) return send(res, 404, { error: `no paper made for ${date} yet` });
            makeCopies(store, date, { count, reword: body.reword as "headline", shuffle: body.shuffle as "keepLead", lang: body.lang as "gu" | undefined, log })
              .catch((e) => log(`copies stopped: ${e instanceof Error ? e.message : e}`));
            return send(res, 202, copiesOf(date));
          }
        }
        if (parts[3] === "editions") {
          const { batchOf, currentCopies, editionFile, makeEditions } = await import("./editorial/copies.ts");
          const editions = settingsOf(store).editions;
          if (req.method === "GET" && parts[4]?.endsWith(".editable.pdf")) {
            const id = parts[4].replace(/\.editable\.pdf$/, "");
            const json = editions.some((e) => e.id === id) ? editionFile(date, id).replace(/\.pdf$/, ".json") : "";
            if (!json || !existsSync(json)) return send(res, 404, { error: "make the papers again for their CorelDRAW PDF" });
            return sendEditable(res, JSON.parse(await readFile(json, "utf8")));
          }
          if (req.method === "GET" && parts[4]) {
            const id = parts[4].replace(/\.pdf$/, "");
            const file = editions.some((e) => e.id === id) ? editionFile(date, id) : "";
            if (!file || !existsSync(file)) return send(res, 404, { error: `no paper ${id} for ${date}` });
            return send(res, 200, new Uint8Array(await readFile(file)), "application/pdf");
          }
          if (req.method === "GET") return send(res, 200, { editions, run: batchOf("editions", date) });
          if (req.method === "POST") {
            const body = (await readJson(req)) as { only?: string };
            if (body.only && !editions.some((e) => e.id === body.only)) return send(res, 404, { error: `no paper ${body.only}` });
            if (currentCopies()) return send(res, 409, { error: "copies or the other papers are being made: wait for them to finish" });
            if (currentJob()?.date === date) return send(res, 409, { error: "the day's paper is being made: make the other papers when it's done" });
            if (!store.latestIssue(date)) return send(res, 404, { error: `no paper made for ${date} yet` });
            makeEditions(store, date, editions, { log, only: body.only }).catch((e) => log(`other papers stopped: ${e instanceof Error ? e.message : e}`));
            return send(res, 202, { editions, run: batchOf("editions", date) });
          }
        }
        if (req.method === "POST" && parts[3] === "publish") {
          const got = store.latestIssue(date);
          if (!got) return send(res, 404, { error: `no issue built for ${date}` });
          // the app (no Git) publishes through the one-time GitHub sign-in
          if (!existsSync(path.join(ROOT, ".git")) && !process.env.GITHUB_TOKEN) {
            return send(res, 400, { error: "The website isn't connected yet. Open Settings and press Connect (once), then publish again." });
          }
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
        if (req.method === "POST" && parts[2] === "current" && parts[3] === "stop") {
          const { stopJob } = await import("./pipeline.ts");
          return stopJob() ? send(res, 202, { stopping: true }) : send(res, 404, { error: "nothing is being made" });
        }
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
        if (req.method === "GET") {
          const { standInsMovable, referenceAds } = await import("./layout/stories.ts");
          const { sampleAdsOf } = await import("./build.ts");
          const samples = sampleAdsOf(store);
          const day = url.searchParams.get("date") ?? indiaNow().day;
          // each booking with every day it runs (a row per day: "<id>@<date>"); then every
          // sample ad, used or not (they print on a day with nothing booked)
          const days = (id: string) => (store.db.prepare("select date from ads where id like ? order by date").all(`${id}@%`) as { date: string }[]).map((r) => r.date);
          const booked = standInsMovable(store.ads(day)).filter((a) => !samples.isSample(a.id))
            .map((a) => ({ ...a, sample: false, inUse: true, days: days(a.id) }));
          const stand = referenceAds(day).map((a) => ({ ...a, sample: true, inUse: samples.use(a.id), days: [day] }));
          return send(res, 200, [...booked, ...stand]);
        }
        // the sample ads: all on or off, or one of them (taken out of every paper after)
        if (req.method === "POST" && parts[2] === "samples") {
          const body = (await readJson(req)) as { on?: boolean; id?: string; use?: boolean };
          if (typeof body.on === "boolean") store.putSetting("samplesOn", body.on);
          if (body.id && typeof body.use === "boolean") {
            const off = new Set(store.setting<string[]>("samplesOff", []));
            if (body.use) off.delete(body.id); else off.add(body.id);
            store.putSetting("samplesOff", [...off]);
          }
          return send(res, 200, { on: store.setting("samplesOn", true), off: store.setting<string[]>("samplesOff", []) });
        }
        // a booking moved: another page, another place along its foot, or anywhere on the page (every day it runs)
        if (req.method === "PATCH" && parts[2]) {
          const id = decodeURIComponent(parts[2]);
          const body = (await readJson(req)) as { page?: number; place?: Ad["place"]; at?: Ad["at"] | null };
          if (body.page !== undefined && !(body.page >= 1 && body.page <= profile.issue.pages)) return send(res, 400, { error: `the paper has pages 1 to ${profile.issue.pages}` });
          if (body.place !== undefined && !["left", "middle", "right"].includes(body.place)) return send(res, 400, { error: "the place is left, middle or right" });
          const rows = store.db.prepare("select id, json from ads where id = ? or id like ?").all(id, `${id}@%`) as { id: string; json: string }[];
          if (!rows.length) return send(res, 404, { error: "no such ad" });
          for (const r of rows) {
            const ad = JSON.parse(r.json) as Ad;
            const page = body.page ?? ad.page;
            // (a place along the foot clears a place on the page, and the other way round)
            const at = body.at === null || body.place ? undefined : body.at ?? ad.at;
            const place = body.at ? undefined : body.place ?? ad.place;
            const { at: _a, place: _p, ...rest } = ad;
            const moved = await placeAd({ ...rest, page, ...(place ? { place } : {}) }, at);
            store.db.prepare("update ads set json = ? where id = ?").run(JSON.stringify(moved), r.id);
          }
          return send(res, 200, { moved: rows.length });
        }
        if (req.method === "POST") return send(res, 200, await bookAd(store, (await readJson(req)) as AdBooking));
        if (req.method === "DELETE" && parts[2]) {
          // a booking is a row per day it runs ("<id>@<date>")
          const id = decodeURIComponent(parts[2]);
          store.db.prepare("delete from ads where id = ? or id like ?").run(id, `${id}@%`);
          return send(res, 200, { deleted: parts[2] });
        }
      }
      if (req.method === "GET" && url.pathname === "/api/layout") {
        // the page in centimetres, its columns, and each page's room for stories
        const { chromeFor } = await import("./chrome/chrome.ts");
        const { GRID, PAGE } = await import("./layout/typography.ts");
        const total = profile.issue.pages;
        const cm = (px: number) => Math.round((px / PAGE.width) * (profile.page.width / 72 * 2.54) * 100) / 100;
        const pages = [];
        for (let n = 1; n <= total; n++) {
          const c = await chromeFor(n, total, indiaNow().day, 1);
          pages.push({ page: n, topCm: cm(c.bodyTop), bottomCm: cm(c.bodyBottom) });
        }
        return send(res, 200, { widthCm: cm(PAGE.width), heightCm: cm(PAGE.height), columns: GRID.columns,
                                leftCm: cm(GRID.left), columnCm: cm(GRID.column), gutterCm: cm(GRID.gutter), pages });
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        const { day, time } = indiaNow();
        const s = settingsOf(store);
        // the day the newsroom is on (?date=), today by default
        const asked = url.searchParams.get("date");
        const latest = store.latestIssue(asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : day);
        return send(res, 200, {
          today: day, now: time, ...s, nextRun: s.autoRun ? `${store.setting("lastScheduledRun", "") === day || time >= s.runAt ? "tomorrow" : "today"} ${s.runAt}` : null,
          running: currentJob(), lastJob: store.jobs(undefined, 1)[0] ?? null,
          openrouterKey: envHas("OPENROUTER_API_KEY"),
          issue: latest ? { version: latest.version, status: latest.status, ready: (latest.report as { ready?: boolean }).ready,
                            issueNumber: (latest.report as { issueNumber?: number }).issueNumber } : null,
          version: gitVersion(),
          paper: { id: profile.id, name: profile.name },
        });
      }
      if (parts[0] === "api" && parts[1] === "settings") {
        if (req.method === "GET") return send(res, 200, { ...settingsOf(store), openrouterKey: envHas("OPENROUTER_API_KEY"), telegram: await telegramOf(store) });
        if (req.method === "POST") {
          const body = (await readJson(req)) as { runAt?: string; autoRun?: boolean; openrouterKey?: string; lang?: string;
                                                   onboarded?: boolean; inrPerUsd?: number; inrAuto?: boolean; notify?: boolean; siteUrl?: string;
                                                   editions?: Edition[]; editionsAuto?: boolean;
                                                   telegramToken?: string; telegramRemove?: number };
          if (body.editions !== undefined) {
            // only the names change: the papers themselves (their ids and languages) stay
            const now = settingsOf(store).editions;
            const named = now.map((e) => ({ ...e, name: (body.editions!.find((x) => x.id === e.id)?.name ?? e.name).trim().slice(0, 60) || e.name }));
            store.putSetting("editions", named);
          }
          if (body.editionsAuto !== undefined) store.putSetting("editionsAuto", !!body.editionsAuto);
          if (body.lang !== undefined) {
            if (body.lang !== "gu" && body.lang !== "en") return send(res, 400, { error: "the language is gu or en" });
            store.putSetting("lang", body.lang);
          }
          if (body.onboarded !== undefined) store.putSetting("onboarded", !!body.onboarded);
          if (body.siteUrl !== undefined) {
            if (body.siteUrl && !/^https:\/\/[^\s]+$/.test(body.siteUrl)) return send(res, 400, { error: "the website address starts with https://" });
            store.putSetting("siteUrl", body.siteUrl.trim());
          }
          if (body.notify !== undefined) store.putSetting("notify", !!body.notify);
          if (body.inrPerUsd !== undefined) {
            if (!(body.inrPerUsd > 10 && body.inrPerUsd < 1000)) return send(res, 400, { error: "the rupee rate should be about 80-100" });
            store.putSetting("inrPerUsd", Math.round(body.inrPerUsd * 100) / 100);
            // a rate typed in by hand stays as typed
            if (body.inrAuto === undefined) store.putSetting("inrAuto", false);
          }
          if (body.inrAuto !== undefined) {
            store.putSetting("inrAuto", !!body.inrAuto);
            if (body.inrAuto) await rupeeRate(store, log, true);
          }
          if (body.runAt !== undefined) {
            if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.runAt)) return send(res, 400, { error: "the run time is HH:MM, e.g. 20:00" });
            store.putSetting("runAt", body.runAt);
          }
          if (body.autoRun !== undefined) store.putSetting("autoRun", !!body.autoRun);
          if (body.openrouterKey) {
            if (!/^sk-or-[A-Za-z0-9_-]{20,}$/.test(body.openrouterKey.trim())) return send(res, 400, { error: "that doesn't look like an OpenRouter key (sk-or-...)" });
            await setEnv("OPENROUTER_API_KEY", body.openrouterKey.trim());
          }
          if (body.telegramToken) {
            if (!/^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(body.telegramToken.trim())) return send(res, 400, { error: "that doesn't look like a Telegram bot token (from @BotFather)" });
            await setEnv("TELEGRAM_BOT_TOKEN", body.telegramToken.trim());
            store.putSetting("telegramOffset", 0);
          }
          if (body.telegramRemove !== undefined) {
            store.putSetting("telegramChats", store.setting<{ id: number }[]>("telegramChats", []).filter((c) => c.id !== body.telegramRemove));
          }
          return send(res, 200, { ...settingsOf(store), openrouterKey: envHas("OPENROUTER_API_KEY"), telegram: await telegramOf(store) });
        }
      }
      if (parts[0] === "api" && parts[1] === "telegram" && parts[2] === "photos") {
        // photos sent to the paper's bot that no article has yet, and the articles not printed yet (the newsroom attaches one)
        const { articles, attach } = await import("./ingest/telegram.ts");
        if (req.method === "POST") {
          const body = (await readJson(req)) as { photo: number; to: number };
          if (!(await attach(store, Number(body.photo), Number(body.to)))) return send(res, 400, { error: "that photo or article is gone" });
        }
        const all = store.inbox(true);
        return send(res, 200, {
          photos: all.filter((x) => x.kind === "photo" && x.pairedTo === undefined && x.at > Date.now() / 1000 - 2 * 86400).map((x) => ({ id: x.id, url: x.photo, at: x.at, from: x.from })),
          articles: articles(all).map((a) => ({ id: a.ids[0], at: a.at, title: a.text.split("\n").find((l) => l.trim())?.trim().slice(0, 80) ?? "" })),
        });
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
  everyEvening(store, async (day) => {
    const job = await runPipeline(store, day, { by: "schedule", log });
    // the evening paper made: the sister papers after it (when that's on)
    const s = settingsOf(store);
    if (job.status === "done" && s.editionsAuto && s.editions.length && store.latestIssue(day)) {
      const { makeEditions } = await import("./editorial/copies.ts");
      await makeEditions(store, day, s.editions, { log });
    }
  }, log);
  backupDaily(store, log);
  collectHourly(store, log);
  // news the editor sends the paper's Telegram bot, taken in as it comes (ingest/telegram.ts)
  (await import("./ingest/telegram.ts")).pollTelegram(store, log);
  // the rupee rate, kept up to date (when it's on): now, then every few hours
  rupeeRate(store, log).catch(() => {});
  setInterval(() => rupeeRate(store, log).catch(() => {}), 3 * 3600_000);
}

let copiesNow: (() => { date: string } | null) | undefined;

/** An issue as the CorelDRAW PDF, or why there's none (a Hindi or Urdu paper's text needs shaping). */
async function sendEditable(res: ServerResponse, issue: import("@ck/shared/contract").IssueRender) {
  const { editablePdf } = await import("./export/pdf-editable.ts");
  const pdf = await editablePdf(issue);
  if (!pdf) return send(res, 400, { error: "a Hindi or Urdu paper has no CorelDRAW PDF: use its print PDF" });
  return send(res, 200, pdf, "application/pdf");
}
/** Days to lay out again once the run that's going ends (edits made meanwhile). */
const afterRun = new Set<string>();

/** The day's US dollar in rupees, from the European Central Bank's reference
 * rates (Frankfurter), else open.er-api.com -- once a day, while "keep it up
 * to date" is on. Nothing is sent but the request for the rate. */
async function rupeeRate(store: Store, log: (s: string) => void, now = false) {
  const s = settingsOf(store);
  if (!s.inrAuto) return;
  if (!now && s.inrUpdated && Date.now() - Date.parse(s.inrUpdated) < 20 * 3600_000) return;
  const sources: [string, (j: { rates?: Record<string, number> }) => number | undefined][] = [
    ["https://api.frankfurter.app/latest?from=USD&to=INR", (j) => j.rates?.INR],
    ["https://open.er-api.com/v6/latest/USD", (j) => j.rates?.INR],
  ];
  for (const [url, pick] of sources) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!r.ok) continue;
      const rate = pick(await r.json());
      if (!rate || !(rate > 10 && rate < 1000)) continue;
      store.putSetting("inrPerUsd", Math.round(rate * 100) / 100);
      store.putSetting("inrUpdated", new Date().toISOString());
      log(`rupee rate: US$1 = ₹${rate.toFixed(2)}`);
      return;
    } catch { /* offline: the last rate stays */ }
  }
}

/** An ad booked in the newsroom: its image, its size on the page, the page and the days it runs. */
interface AdBooking {
  name: string; base64: string; cols: number; heightCm: number; page: number;
  /** where along the foot of the page (the layout's choice, on the right, if none) */
  place?: Ad["place"];
  /** or anywhere on the page: its first column and its top (cm under the top of the news) */
  at?: Ad["at"];
  dates?: string[]; weekdays?: number[]; from?: string; to?: string;
}

/** Store an ad's image and book it on each of its days (it's placed by layout/ads.ts). */
async function bookAd(store: Store, b: AdBooking): Promise<{ booked: string[] }> {
  const { GRID, PT } = await import("./layout/typography.ts");
  const { spanWidth } = await import("./layout/module.ts");
  if (!b.base64 || !b.cols || !b.heightCm || !b.page) throw new Error("an ad needs an image, its width in columns, its height in cm and a page");
  if (!(b.page >= 1 && b.page <= profile.issue.pages)) throw new Error(`the paper has pages 1 to ${profile.issue.pages}`);
  if (b.from && b.to && b.to < b.from) throw new Error("the last day is before the first day");
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
  // taller than the page's room for stories, it would never be placed
  const { chromeFor } = await import("./chrome/chrome.ts");
  const band = await chromeFor(b.page, profile.issue.pages, b.from ?? b.dates?.[0] ?? indiaNow().day, 1);
  if (height > band.bodyBottom - band.bodyTop) {
    const max = Math.floor(((band.bodyBottom - band.bodyTop) / PT / 72) * 2.54 * 10) / 10;
    throw new Error(`that's taller than page ${b.page} has room for: at most ${max} cm`);
  }
  for (const date of days) {
    // the day's first booking replaces the 8 August stand-ins
    const ads = store.ads(date);
    const { referenceAds } = await import("./layout/stories.ts");
    const standIns = new Set(referenceAds("").map((a) => a.id));
    for (const a of ads) if (standIns.has(a.id) || a.url.startsWith("/chrome/ads/")) store.db.prepare("delete from ads where id = ? and date = ?").run(a.id, date);
    const ad = await placeAd({ id: `${id}`, date, page: b.page, x: 0, y: 0, width, height, url: `/media/ads/${file}`, pinned: false,
                               ...(!b.at && b.place && ["left", "middle", "right"].includes(b.place) ? { place: b.place } : {}) }, b.at);
    store.db.prepare("insert or replace into ads (id, date, json) values (?, ?, ?)").run(`${id}@${date}`, date, JSON.stringify(ad));
  }
  return { booked: [...days].sort() };
}

/** An ad put where the editor chose: at a column and a height on its page, it
 * stays there and the stories are laid round it (layout/designs.ts). One whose
 * foot reaches the page's foot is an ad along the foot (`place`); none chosen,
 * the layout places it (layout/ads.ts). */
async function placeAd(ad: Ad, at: Ad["at"] | undefined): Promise<Ad> {
  const free: Ad = { ...ad, x: 0, y: 0, pinned: false };
  if (!at) return free;
  const { GRID, PT } = await import("./layout/typography.ts");
  const { chromeFor } = await import("./chrome/chrome.ts");
  const band = await chromeFor(ad.page, profile.issue.pages, ad.date, 1);
  const cols = Math.max(1, Math.min(GRID.columns, Math.round((ad.width + GRID.gutter) / GRID.pitch)));
  const col = Math.max(0, Math.min(GRID.columns - cols, Math.round(at.col)));
  const cm = (72 * PT) / 2.54;
  // (a few millimetres under the top is the top; one too low for the page comes up to its foot)
  let y = band.bodyTop + Math.max(0, at.topCm) * cm;
  if (y - band.bodyTop < 0.8 * cm) y = band.bodyTop;
  y = Math.min(y, band.bodyBottom - ad.height);
  const kept = { col, topCm: Math.round(((y - band.bodyTop) / cm) * 10) / 10 };
  if (band.bodyBottom - (y + ad.height) < 2 * cm) {
    // at the foot: along it, at the side it's nearest
    const place = col === 0 ? "left" : col + cols === GRID.columns ? "right" : "middle";
    return { ...free, place, at: kept };
  }
  return { ...ad, x: GRID.left + col * GRID.pitch, y, pinned: true, at: kept };
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

/** The day's work done as the news comes in, every hour while the engine
 * runs, so the evening run is left with little but the layout:
 *   - PIB's own releases, and (a Gujarati paper) the CM's office and All India
 *     Radio side by side; PIB's Hindi and English releases read too, ready to
 *     translate; the day's lists saved (PIB shows programs only today's list,
 *     its date form refused, 24 Oct 2026: a day made later is made from these);
 *   - the stories written as their releases arrive (the evening keeps them:
 *     no paying twice);
 *   - from 5 PM, a day still short of copy translated up to the pages' need.
 * Quiet: a site not answering waits for the next hour. Never while a run goes
 * (and a run that starts meanwhile waits for it: pipeline.ts collecting). */
function collectHourly(store: Store, log: (s: string) => void) {
  const once = async () => {
    if (collecting.current || currentJob()) return;
    const work = (async () => {
      const { ingestPib, withPatience, FEEDS } = await import("./ingest/pib.ts");
      const feed = (profile.language.lang in FEEDS ? profile.language.lang : "en") as keyof typeof FEEDS;
      const { day, time } = indiaNow();
      const gu = feed === "gu";
      const pib = withPatience({ tries: 1, seconds: 30 }, async () => {
        const r = await ingestPib(store, day, feed);
        if (r.fetched) log(`collected ${r.fetched} new PIB release(s) for ${day}`);
        // the releases a Gujarati paper's top-up translates from, read ahead
        if (gu) await (await import("./editorial/translate.ts")).readForeign(store, day);
      }).catch((e: unknown) => log(`PIB collection skipped this hour: ${e instanceof Error ? e.message : e}`));
      const others = gu ? (async () => {
        const { ingestOfficial } = await import("./ingest/official.ts");
        const o = await ingestOfficial(store, day);
        if (o.fetched) log(`collected ${o.fetched} new item(s) from the CM's office and All India Radio for ${day}`);
      })().catch((e: unknown) => log(`the CM's office and All India Radio skipped this hour: ${e instanceof Error ? e.message : e}`)) : null;
      await Promise.all([pib, others]);
      if (gu) (await import("./ingest/official.ts")).dropTwinsOfPib(store, day);
      // written ahead (an AI key needed): the evening keeps what's written
      if (!envHas("OPENROUTER_API_KEY")) return;
      const quiet = () => {};
      const { rewriteDay } = await import("./editorial/rewrite.ts");
      await rewriteDay(store, day, { log: quiet });
      if (gu && time >= "17:00") {
        const { topUp } = await import("./editorial/translate.ts");
        await topUp(store, day, { log: quiet });
      }
    })();
    collecting.current = work.catch((e: unknown) => log(`the hourly collection stopped: ${e instanceof Error ? e.message : e}`))
      .finally(() => { collecting.current = null; });
  };
  setTimeout(once, 60_000);
  setInterval(once, 60 * 60_000);
}

/** The papers: publications/<id>/ each (those that ship with the code, and
 * those added here, in PAPERS_HOME); every one but the one this engine makes
 * keeps its own data folder (papers/<id>/), and its test issue is built there
 * in a process of its own. The desktop app switches which paper the newsroom
 * works on (it starts this engine again for that paper). */
let testing: { id: string; done: boolean } | null = null;
async function papersApi(req: IncomingMessage, res: ServerResponse, parts: string[], url: URL) {
  const { readdir } = await import("node:fs/promises");
  const homes = [path.join(ROOT, "publications"), path.join(PAPERS_HOME, "publications")];
  // Capital Kranti keeps its data in the main data folder (a checkout: backend/data); every other paper in papers/<id>/
  const dataOf = (id: string) => id !== "capital-kranti" ? path.join(PAPERS_HOME, "papers", id)
    : PAPERS_HOME === ROOT ? path.join(ROOT, "backend", "data") : PAPERS_HOME;
  const known = async () => [...new Set((await Promise.all(homes.map((h) => readdir(h).catch(() => [] as string[])))).flat())]
    .filter((d) => /^[a-z0-9-]+$/.test(d) && existsSync(path.join(publicationDir(d), "profile.json")));
  /** Another paper's latest test issue (from its own data folder). */
  const issueOf = async (id: string) => {
    const file = path.join(dataOf(id), "capital-kranti.sqlite");
    if (id === PUBLICATION_ID || !existsSync(file)) return null;
    const { Store } = await import("./store.ts");
    const st = new Store(file);
    try {
      const day = st.latestDate();
      const got = day ? st.latestIssue(day) : null;
      if (!got) return null;
      const rep = got.report as { ready?: boolean; pdf?: string; gates?: unknown[] };
      return { date: day, version: got.version, ready: rep.ready, pdf: rep.pdf, gates: rep.gates };
    } finally { st.db.close(); }
  };
  if (req.method === "POST" && parts[2] === "draft") {
    const body = (await readJson(req)) as { pdfs?: string[] };
    if (!body.pdfs?.length) return send(res, 400, { error: "upload one or more of the paper's PDF issues" });
    const { extractDraft } = await import("./onboard/extract.ts");
    return send(res, 200, await extractDraft(body.pdfs.map((b) => new Uint8Array(Buffer.from(b, "base64")))));
  }
  if (req.method === "GET" && !parts[2]) {
    const out = [];
    for (const id of (await known()).sort()) {
      const prof = JSON.parse(readFileSync(path.join(publicationDir(id), "profile.json"), "utf8")) as { name: string; language: { lang: string }; issue: { pages: number } };
      out.push({ id, name: prof.name, lang: prof.language.lang, pages: prof.issue.pages, own: id === PUBLICATION_ID,
                 added: publicationDir(id).startsWith(path.join(PAPERS_HOME, "publications")) && PAPERS_HOME !== ROOT,
                 test: ["dev-test", "sample-english", "sample-urdu"].includes(id), testing: testing?.id === id && !testing.done,
                 // the Hindi and Urdu sister papers' layouts (editorial/copies.ts): made from Capital Kranti, not on their own
                 hidden: id.startsWith("edition-"),
                 issue: await issueOf(id) });
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
  if (!id || !/^[a-z0-9-]+$/.test(id) || !(await known()).includes(id)) return send(res, 404, { error: `no paper "${id}"` });
  if (req.method === "POST" && parts[3] === "test") {
    if (id === PUBLICATION_ID) return send(res, 400, { error: "that's the paper this newsroom makes: make it from Today" });
    if (testing && !testing.done) return send(res, 409, { error: `a test issue of ${testing.id} is being made` });
    const body = (await readJson(req)) as { date?: string };
    const date = body.date ?? indiaNow().day;
    const { spawn } = await import("node:child_process");
    const { openSync } = await import("node:fs");
    await mkdir(dataOf(id), { recursive: true });
    const logFd = openSync(path.join(dataOf(id), "test.log"), "w");
    // the same Node flags as this engine (inside the app: the hook that finds the shared code)
    const child = spawn(process.execPath, [...process.execArgv, path.join(ROOT, "backend", "src", "cli.ts"), "all", "--date", date],
      { cwd: ROOT, env: { ...process.env, CK_PUBLICATION: id, DATA_DIR: dataOf(id), CK_ENV_FILE: ENV_FILE, CK_PAPERS_HOME: PAPERS_HOME },
        stdio: ["ignore", logFd, logFd], detached: false, windowsHide: true });
    const run = { id, done: false };
    testing = run;
    child.on("exit", () => { run.done = true; });
    child.on("error", () => { run.done = true; });
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
    return send(res, 200, { id, issue: await issueOf(id), log, running: testing?.id === id && !testing.done });
  }
  return send(res, 404, { error: "not found" });
}
