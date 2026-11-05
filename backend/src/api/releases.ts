// The news as it came in: the releases of a day and what became of each, one
// translated now, and the release reader (a bookmark that sends the release
// page you're reading here).
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import type { Release, Store } from "../store.ts";
import { indiaNow, readerKey, readJson, sameKey, send, type Ctx } from "./http.ts";

export async function releasesRoutes(c: Ctx) {
  const { store, log, req, res, url, parts } = c;
  if (req.method === "GET" && url.pathname === "/reader") return send(res, 200, readerPage(req, readerKey(store)), "text/html; charset=utf-8");
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
          const q = new URLSearchParams(location.search), token = q.get("token");
          const headers = { "content-type": "application/json", "x-reader-key": q.get("key") || "", ...(token ? { authorization: "Bearer " + token } : {}) };
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
  if (req.method === "POST" && url.pathname === "/api/releases") {
    // (from the reader's page only: any website could open /ingest with a release of its own)
    if (!sameKey(String(req.headers["x-reader-key"] ?? ""), readerKey(store))) return send(res, 403, { error: "only the release reader can send releases" });
    const r = await acceptRelease(store, (await readJson(req)) as UploadedRelease);
    log(`release ${r.id} stored for ${r.date}: ${r.headline.slice(0, 60)} (${r.photos.length} photos)`);
    return send(res, 200, { id: r.id, date: r.date, photos: r.photos.length });
  }
  if (req.method === "GET" && url.pathname === "/api/releases") {
    return send(res, 200, releaseStatus(store, url.searchParams.get("date") ?? indiaNow().day));
  }
  if (req.method === "POST" && parts[0] === "api" && parts[1] === "releases" && parts[3] === "translate") {
    const r = store.release(Number(parts[2]));
    if (!r) return send(res, 404, { error: `no release ${parts[2]}` });
    const { env } = await import("../editorial/rewrite.ts");
    const key = env("OPENROUTER_API_KEY");
    if (!key) return send(res, 400, { error: "no OpenRouter key: add it in Settings" });
    const { translateOne } = await import("../editorial/translate.ts");
    const got = await translateOne(r, key);
    store.putStory(got.story);
    return send(res, 200, { story: got.story, cost: got.cost });
  }
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
function readerPage(req: IncomingMessage, key: string): string {
  const origin = `http://${req.headers.host ?? "localhost:4000"}`;
  const token = process.env.BACKEND_API_TOKEN?.trim();
  const target = `${origin}/ingest?key=${key}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
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
