// Publishes the day's paper to the website (site/, docs/website/ROADMAP.md
// phase A): the stories as printed (with the editor's changes, at their
// longest length -- the web has no column inches), each story's photo, and the
// e-paper (each page as a picture, and a light PDF of them), sent to the
// site's publish API with the website key (CK_SITE_KEY, entered once in
// Settings). The website shows them at once.
//
// Files go one at a time to /api/publish/file (the free photo store's
// ceiling is checked there); each is named by its content, so publishing the
// same day again sends only what changed.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { acquireBrowser, releaseBrowser } from "./browser.ts";
import { pageImageDir, type BuildReport } from "./build.ts";
import { assetFile } from "./config.ts";
import { env } from "./editorial/rewrite.ts";
import { applyTextEdits } from "./layout/stories.ts";
import { profile } from "./profile.ts";
import type { Store, Story } from "./store.ts";

const SOURCE_NAMES: Record<string, { kind: "pib" | "cmo" | "air" | "gujinfo"; name: string }> = {
  p: { kind: "pib", name: "પત્ર સૂચના કાર્યાલય (PIB)" },
  c: { kind: "cmo", name: "મુખ્યમંત્રી કાર્યાલય, ગુજરાત" },
  a: { kind: "air", name: "આકાશવાણી સમાચાર" },
  r: { kind: "gujinfo", name: "માહિતી ખાતું, ગુજરાત" },
};

/** The website Publish sends to: the paper's profile (CK_SITE_URL overrides it, for a test site). Settings'
 * own "website address" is only the newsroom's "Open the website" button, which may still name the old site. */
export const siteBase = () => (env("CK_SITE_URL") || profile.website.url).replace(/\/$/, "");

/** Pictures re-encoded as JPEGs at most `maxWidth` wide, in the engine's own browser. */
async function jpegs(files: string[], maxWidth: number, quality: number): Promise<{ data: Buffer; width: number; height: number }[]> {
  const browser = await acquireBrowser();
  const context = await browser.newContext();
  const out: { data: Buffer; width: number; height: number }[] = [];
  try {
    const page = await context.newPage();
    for (const file of files) {
      const type = /\.png$/i.test(file) ? "png" : "jpeg";
      await page.setContent(`<style>html,body{margin:0}img{display:block;width:100%;height:100%}</style>` +
                            `<img src="data:image/${type};base64,${(await readFile(file)).toString("base64")}">`);
      const natural = await page.$eval("img", (img) => ({ w: (img as HTMLImageElement).naturalWidth, h: (img as HTMLImageElement).naturalHeight }));
      const width = Math.min(maxWidth, natural.w), height = Math.round(natural.h * (width / natural.w));
      await page.setViewportSize({ width, height });
      out.push({ data: await page.screenshot({ type: "jpeg", quality, clip: { x: 0, y: 0, width, height } }), width, height });
    }
  } finally {
    await context.close().catch(() => {});
    releaseBrowser();
  }
  return out;
}

const hash = (b: Uint8Array) => createHash("sha256").update(b).digest("hex").slice(0, 10);

/** A release's "નવી દિલ્હી ::" line, on its own, joined to the first paragraph as a dateline. */
export const webBody = (body: string) => body.replace(/^\s*([^\n:]{1,40}?)\s*::\s*\n+/, "$1: ").trim();

export interface SitePublished { url: string; stories: number; photos: number; pages: number; skipped: string[] }

export async function publishToSite(store: Store, date: string, opts: { log: (s: string) => void; force?: boolean }): Promise<SitePublished> {
  const { log } = opts;
  const key = env("CK_SITE_KEY");
  if (!key) throw new Error("the website key isn't set: open Settings and enter it once");
  const base = siteBase();
  const got = store.latestIssue(date);
  if (!got) throw new Error(`no issue built for ${date}`);
  const report = got.report as BuildReport;
  if (!report.ready && !opts.force) throw new Error(`issue ${date} v${got.version} is NOT READY (see its gates); fix it, or publish anyway`);

  const uploaded = store.setting<Record<string, string>>("siteUploads", {});
  const skipped: string[] = [];
  const send = async (name: string, data: Uint8Array, type: string): Promise<string | null> => {
    const cacheKey = `${base}|${name}`;
    if (uploaded[cacheKey]) return uploaded[cacheKey];
    const res = await fetch(`${base}/api/publish/file?path=${encodeURIComponent(name)}`, {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": type }, body: new Blob([data as Uint8Array<ArrayBuffer>], { type }), signal: AbortSignal.timeout(60_000),
    });
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.status === 429) { skipped.push(name); log(`  not sent (the photo store's daily ceiling): ${name}`); return null; }
    if (!res.ok || !body.url) throw new Error(`the website refused ${name}: ${res.status} ${body.error ?? ""}`.trim());
    uploaded[cacheKey] = body.url;
    store.putSetting("siteUploads", uploaded);
    return body.url;
  };

  // the stories as printed: in page order, then their rank there
  const placed = [...new Map(report.placed.map((p) => [p.story, p])).values()].sort((a, b) => a.page - b.page || a.rank - b.rank);
  const edited = new Map(applyTextEdits(store.stories(date), store.edits(date)).map((s) => [s.id, s]));
  const stories: { s: Story; page: number; rank: number }[] = [];
  for (const p of placed) { const s = edited.get(p.story); if (s) stories.push({ s, page: p.page, rank: p.rank }); }

  // their photos, at most 1200 px wide
  const withPhoto = stories.filter(({ s }) => s.photo && existsSync(assetFile(s.photo)));
  const photoJpegs = await jpegs(withPhoto.map(({ s }) => assetFile(s.photo!)), 1200, 78);
  const photos = new Map<string, { url: string; width: number; height: number }>();
  for (const [i, { s }] of withPhoto.entries()) {
    const j = photoJpegs[i];
    const url = await send(`photos/${date}/${s.id}-${hash(j.data)}.jpg`, j.data, "image/jpeg");
    if (url) photos.set(s.id, { url, width: j.width, height: j.height });
  }

  // the e-paper: each page at 1400 px, and a PDF of them
  const numbers = (got.issue.pages.map((p) => p.number) as number[]).sort((a, b) => a - b);
  const pngs = numbers.map((n) => path.join(pageImageDir(date), `${n}.png`)).filter((f) => existsSync(f));
  const pageJpegs = await jpegs(pngs, 1400, 72);
  const pages: { number: number; url: string; width: number; height: number }[] = [];
  for (const [i, j] of pageJpegs.entries()) {
    const url = await send(`epaper/${date}/${numbers[i]}-${hash(j.data)}.jpg`, j.data, "image/jpeg");
    if (url) pages.push({ number: numbers[i], url, width: j.width, height: j.height });
  }
  let pdf: string | null = null;
  if (pageJpegs.length) {
    const doc = await PDFDocument.create();
    doc.setTitle(`${profile.name} ${date}`);
    for (const j of pageJpegs) {
      const img = await doc.embedJpg(j.data);
      doc.addPage([j.width * 0.75, j.height * 0.75]).drawImage(img, { x: 0, y: 0, width: j.width * 0.75, height: j.height * 0.75 });
    }
    const bytes = await doc.save();
    pdf = await send(`epaper/${date}/capital-kranti-${date}-${hash(bytes)}.pdf`, bytes, "application/pdf");
  }

  const payload = {
    issue: { date, number: got.issue.issueNumber, pages, pdf },
    stories: stories.map(({ s, page, rank }) => {
      const src = s.releaseId != null && s.source ? SOURCE_NAMES[s.id[0]] : undefined;
      const release = s.releaseId != null ? store.release(s.releaseId) : null;
      return {
        id: s.id, kicker: s.kicker, headline: s.headline, deck: s.deck, body: webBody(s.bodies.long), caption: s.caption,
        photo: photos.get(s.id) ?? null,
        source: src ? { ...src, url: s.source, office: release?.ministry || release?.office || undefined } : null,
        checked: !!src && !s.factCheck, page, rank,
      };
    }),
  };
  const res = await fetch(`${base}/api/publish`, {
    method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  });
  const answer = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(`the website refused the day's stories: ${res.status} ${answer.error ?? ""}`.trim());
  log(`published ${date} to ${base}: ${payload.stories.length} stories, ${photos.size} photos, ${pages.length} e-paper pages`);
  return { url: base, stories: payload.stories.length, photos: photos.size, pages: pages.length, skipped };
}
