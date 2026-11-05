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
//   GET   /api/ads/month?month=YYYY-MM   how many ads are booked on each day of a month
//   POST  /api/issues/:date/publish    approve the latest version and put it on the website
//   GET   /api/status  GET|POST /api/settings   the newsroom's dashboard and settings
//   POST  /api/papers/draft            {pdfs: [base64]} -- a new paper's profile, drafted from its PDFs
//   GET   /api/papers  POST /api/papers   the papers; save a new one from its reviewed draft
//   GET   /api/papers/:id  POST /api/papers/:id/test  GET /api/papers/:id/pdf   a paper's test issue
//   GET   /api/issues/:date/articles   the editor's own articles in the paper (editorial/articles.ts); POST {articles} saves them and lays it out again
//   GET   /api/issues/:date/copies     the day's copies (editorial/copies.ts); POST {count, reword, shuffle, lang, articles?, pages?: 4|8} makes them
//   GET   /api/issues/:date/editions   the day's sister papers; POST {only?} makes them (all, or one); GET .../editions/<id>.pdf
//   POST  /api/issues/:date/copies/swaps {articles}  the day's stories those articles take the place of in the copies
//   GET   /api/issues/:date/pdf8       the 8-page paper's PDF (when it was made from the latest version); .../editable8.pdf for CorelDRAW
//   GET   /api/issues/:date/copies/N.pdf  one copy (on its paper's design, if it has one)
//   GET   /api/designs  POST /api/designs {name, base64}  DELETE /api/designs/:id|all   other papers' designs, one per copy
//   POST  /api/designs/assign {copy | upTo, id|null}   POST /api/designs/save {date, names}   POST /api/designs/stamp {date, copy, name, base64}
//   POST  /api/designs/reveal {date}   the copies on their designs, saved in a folder in Downloads (and that folder opened)
//   GET   /api/layout                  the page, its columns and each page's room for stories (the Ads screen's preview)
//   GET   /api/space  POST /api/space   what the data folder holds; POST clears old files now (tidy.ts)
//   GET   /api/backups  POST /api/backups {folder} | {now} | {restore: "YYYY-MM-DD"}   backups outside the app (backup.ts); a restore restarts the engine
//   GET   /healthz                     "ok" (for the host's health check)
//   GET   /reader                      the release reader: a bookmark that sends the release page you're reading here
//
// With BACKEND_API_TOKEN set, every change (POST, PATCH, DELETE) needs
// "Authorization: Bearer <token>" (builds and edits cost AI credit; approval
// publishes). Reads stay open: the website's readers load page images straight
// from here. On this computer it answers only to its own address, and only the
// newsroom's pages may read its answers or change anything (newsroomOrigins).
//
// It also runs the day at the newsroom's run time (20:00 India time unless
// changed in Settings): the whole pipeline, as a job.
//
// Each area's routes are in api/ (issues, copies, releases, ads, settings,
// papers); this file lets in only the newsroom, serves the photos, keeps the
// runs in line and starts what the engine does by itself (api/upkeep.ts).
import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import { MEDIA_DIR } from "./config.ts";
import { currentJob, onJob, runPipeline, settleInterrupted } from "./pipeline.ts";
import type { StepName, Store } from "./store.ts";
import { adsRoutes } from "./api/ads.ts";
import { copiesRoutes } from "./api/copies.ts";
import { authorized, LOOPBACK, newsroomOrigins, send, type Ctx } from "./api/http.ts";
import { issuesRoutes } from "./api/issues.ts";
import { papersApi } from "./api/papers.ts";
import { releasesRoutes } from "./api/releases.ts";
import { afterBatch, afterRun, afterSister, copiesNow, loadCopies } from "./api/runs.ts";
import { sisterStore } from "./sister.ts";
import { rupeeRate, settingsOf, settingsRoutes } from "./api/settings.ts";
import { backupDaily, collectHourly, everyEvening } from "./api/upkeep.ts";

export { acceptRelease } from "./api/releases.ts";
export { settingsOf } from "./api/settings.ts";

export async function serve(store: Store, opts: { port: number; host?: string; log: (s: string) => void }) {
  const { log } = opts;
  settleInterrupted(store);
  await loadCopies();
  // days edited while a run went: laid out again, one at a time, when it ends
  const next = () => {
    if (currentJob() || copiesNow()) return;
    // a paper asked for while its copies or sister papers were being made: made now
    const [waited, from] = [...afterBatch][0] ?? [];
    if (waited) {
      afterBatch.delete(waited);
      afterRun.delete(waited);
      log(`making ${waited} again, asked for while its other papers were being made`);
      runPipeline(store, waited, { by: "newsroom", from, log }).catch((e) => log(`run for ${waited} stopped: ${e instanceof Error ? e.message : e}`));
      return;
    }
    // a sister paper edited while something was being made: made again now
    const sister = [...afterSister][0];
    if (sister) {
      afterSister.delete(sister);
      const [id, date] = sister.split("|");
      log(`making ${id} for ${date} again for the edits made meanwhile`);
      makeSister(id, date);
      return;
    }
    const day = [...afterRun][0];
    if (!day) return;
    afterRun.delete(day);
    log(`laying out ${day} again for the edits made while a run went`);
    runPipeline(store, day, { by: "newsroom", from: "build", log }).catch((e) => log(`run for ${day} stopped: ${e instanceof Error ? e.message : e}`));
  };
  onJob((job) => { if (job.status !== "running") setTimeout(next, 500); });
  setInterval(next, 10_000);
  /** Start a run in the background and answer at once with its job. */
  const startJob = (res: ServerResponse, date: string, from?: StepName) => {
    if (currentJob()) return send(res, 409, { error: `a run for ${currentJob()!.date} is still going`, job: currentJob() });
    // its copies or sister papers being made: the paper is made as soon as they're done
    const batch = copiesNow();
    if (batch?.date === date) {
      if (!afterBatch.has(date) || !from) afterBatch.set(date, from);
      return send(res, 202, { waitingFor: batch.kind });
    }
    runPipeline(store, date, { by: "newsroom", from, log }).catch((e) => log(`run for ${date} stopped: ${e instanceof Error ? e.message : e}`));
    return send(res, 202, currentJob());
  };
  /** A sister paper made again from the day's paper, with its own ads and edits (sister.ts). */
  const makeSister = (id: string, date: string) => {
    import("./editorial/copies.ts").then(({ makeEditions }) => makeEditions(store, date, settingsOf(store).editions, { log, only: id }))
      .catch((e) => log(`${id} stopped: ${e instanceof Error ? e.message : e}`));
  };
  /** On a sister paper, "make it again": once the day's paper and anything being made are done. */
  const startSister = (id: string) => (res: ServerResponse, date: string): true => {
    if (!store.latestIssue(date)) return send(res, 404, { error: "Make Capital Kranti's paper for this day first: this paper is made from it." });
    if (currentJob()?.date === date || copiesNow()) {
      afterSister.add(`${id}|${date}`);
      return send(res, 202, { waitingFor: currentJob()?.date === date ? "paper" : copiesNow()!.kind });
    }
    makeSister(id, date);
    return send(res, 202, { making: id });
  };
  const local = LOOPBACK.test(opts.host ?? "127.0.0.1");
  const origins = newsroomOrigins(opts.port);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      // on this computer: only its own address; only the newsroom may read the answers or change anything
      if (local && !LOOPBACK.test(req.headers.host ?? "")) return send(res, 403, { error: "not this computer's engine" });
      const origin = req.headers.origin;
      if (origin && origins.has(origin)) {
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("access-control-allow-headers", "content-type, authorization");
        res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
      }
      res.setHeader("vary", "origin");
      if (req.method === "OPTIONS") return send(res, 204, "");
      if (req.method !== "GET" && req.method !== "HEAD" && origin && !origins.has(origin)) return send(res, 403, { error: "only the newsroom can change the paper" });
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
      if (req.method !== "GET" && req.method !== "HEAD" && !authorized(req)) return send(res, 401, { error: "missing or wrong API token" });
      const main: Ctx = { store, log, req, res, url, parts, startJob, later: (date) => afterRun.add(date) };
      // the paper the newsroom is on: Capital Kranti, or one of its sister papers worked on as its
      // own (?paper=<id>: its pages, ads, edits and past issues; the news and the rest stay the paper's)
      const paper = url.searchParams.get("paper");
      if (paper && !settingsOf(store).editions.some((e) => e.id === paper)) return send(res, 404, { error: `no paper ${paper}` });
      const c: Ctx = paper ? { ...main, store: sisterStore(store, paper), startJob: startSister(paper), later: (date) => afterSister.add(`${paper}|${date}`) } : main;
      if (await issuesRoutes(c) || await copiesRoutes(main) || await releasesRoutes(main) || await adsRoutes(c) || await settingsRoutes(c)) return;
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
