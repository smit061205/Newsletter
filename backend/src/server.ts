// The backend's HTTP API (Node's built-in http, no framework needed):
//
//   GET   /api/issue?date=YYYY-MM-DD   the issue as render-contract JSON (latest version; latest day if no date)
//   GET   /api/issues/:date            build report, status and version
//   POST  /api/issues/:date/build      lay the day out again (keeps editors' edits)
//   POST  /api/issues/:date/approve    mark the latest version approved
//   POST  /api/issues/:date/edits      {storyId, change} -- an editor's change; re-lays out the day
//   GET   /api/stories?date=           the day's stories (what an editor edits)
//   POST  /api/releases                one release, JSON (an editor's upload, or the browser reader)
//   GET   /api/export/:date.svg?page=N an editable SVG of one page (CorelDRAW)
//   GET   /healthz                     "ok" (for the host's health check)
//
// With BACKEND_API_TOKEN set, every POST needs "Authorization: Bearer <token>"
// (builds and edits cost AI credit; approval publishes). Reads stay open: the
// website's readers load page images straight from here.
//
// It also runs the evening job: at 20:00 India time, ingest + rewrite + build.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "./config.ts";
import type { Release, Store } from "./store.ts";

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

/** Calls `job` once a day at 20:00 Asia/Kolkata. */
function everyEvening(job: () => Promise<void>, log: (s: string) => void) {
  let lastRun = "";
  setInterval(() => {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now).map((p) => [p.type, p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (Number(parts.hour) === 20 && lastRun !== day) {
      lastRun = day;
      log(`evening job for ${day}`);
      job().catch((e) => log(`evening job failed: ${e instanceof Error ? e.stack : e}`));
    }
  }, 30_000);
}

/** Does this request carry the API token (or is none configured)? */
function authorized(req: IncomingMessage): boolean {
  const token = process.env.BACKEND_API_TOKEN?.trim();
  return !token || req.headers.authorization === `Bearer ${token}`;
}

export async function serve(store: Store, opts: { port: number; host?: string; log: (s: string) => void }) {
  const { log } = opts;
  const { buildIssue, runDay } = await import("./build.ts");
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
        if (req.method === "POST" && parts[3] === "build") {
          const r = await buildIssue(store, date, { log });
          return send(res, 200, r.report);
        }
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
          const r = await buildIssue(store, date, { log });
          return send(res, 200, r.report);
        }
      }
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
              o.textContent = JSON.stringify(j);
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
        return send(res, 200, store.stories(date));
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
  everyEvening(() => runDay(store, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()), { log }), log);
}
