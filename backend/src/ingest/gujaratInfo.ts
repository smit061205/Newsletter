// Fetches a day's Gujarati press releases from the Gujarat government's
// Information Department (gujaratinformation.gujarat.gov.in). Government
// releases are issued for publication.
//
// The site loads each release's text with an encrypted script request, so we
// read the rendered page with Playwright instead of calling that API. Release
// ids are sequential across departments and districts: start from the newest
// id linked on the home page and walk down until the releases are older than
// the day asked for.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { MEDIA_DIR } from "../config.ts";
import type { Release, Store } from "../store.ts";

const SITE = "https://gujaratinformation.gujarat.gov.in";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "OCT 21 2026 6:00 PM BY ..." -> "2026-10-21" */
function isoFrom(dateLine: string): string | null {
  const m = dateLine.match(/([A-Z]{3})\s+(\d{1,2})\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

async function newestId(ctx: BrowserContext): Promise<number> {
  const page = await ctx.newPage();
  await page.goto(`${SITE}/Index`, { waitUntil: "networkidle", timeout: 60_000 });
  const ids = await page.$$eval('a[href*="PressReleaseDetails"]', (as) =>
    as.map((a) => Number(new URL((a as HTMLAnchorElement).href).searchParams.get("id"))).filter(Boolean));
  await page.close();
  if (!ids.length) throw new Error("no releases linked on the Information Department's home page");
  return Math.max(...ids);
}

interface Raw { headline: string; subhead: string; dateLine: string; paras: string[]; photos: string[] }

async function readRelease(ctx: BrowserContext, id: number): Promise<Raw | null> {
  const page = await ctx.newPage();
  try {
    await page.goto(`${SITE}/PressReleaseDetails/?id=${id}&LanguageId=2`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // the text arrives a moment after the page itself
    await page.waitForFunction(() => {
      const h = document.querySelector(".ttm-service-single-content-area .title h4");
      return !!h && h.textContent!.trim().length > 0;
    }, null, { timeout: 20_000 }).catch(() => null);
    await page.waitForTimeout(500);
    return await page.evaluate(() => {
      const q = (s: string) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const headline = q(".ttm-service-single-content-area .title h4");
      if (!headline) return null;
      const desc = document.querySelector(".ttm-service-description");
      const paras = desc ? Array.from(desc.querySelectorAll("p")).map((p) => p.textContent!.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
      const photos = desc ? Array.from(desc.querySelectorAll("img"))
        .filter((i) => (i as HTMLImageElement).naturalWidth >= 300)
        .map((i) => (i as HTMLImageElement).src) : [];
      return { headline, subhead: q("h5.subtitle"), dateLine: q(".ReleaseDateSubHeaddateTime"), paras, photos };
    });
  } finally {
    await page.close();
  }
}

export interface IngestResult { fetched: number; skipped: number; releases: Release[] }

/** Fetch every release published on `date` (ISO) that isn't stored yet. */
export async function ingestDay(store: Store, date: string, opts: { concurrency?: number; log?: (s: string) => void } = {}): Promise<IngestResult> {
  const log = opts.log ?? (() => {});
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "gu-IN" });
  const mediaDir = path.join(MEDIA_DIR, date);
  await mkdir(mediaDir, { recursive: true });
  let fetched = 0;
  let skipped = 0;
  try {
    let id = await newestId(ctx);
    log(`newest release id ${id}`);
    let olderInARow = 0;
    const conc = opts.concurrency ?? 4;
    // walk down in batches until a run of releases is older than `date`
    while (olderInARow < 12 && id > 0) {
      const batch = Array.from({ length: conc }, (_, i) => id - i).filter((n) => n > 0);
      id -= conc;
      const results = await Promise.all(batch.map(async (n) => {
        if (store.hasRelease(n)) return { n, raw: null as Raw | null, known: true };
        return { n, raw: await readRelease(ctx, n).catch(() => null), known: false };
      }));
      for (const { n, raw, known } of results.sort((a, b) => b.n - a.n)) {
        if (known) { skipped++; olderInARow = 0; continue; }
        if (!raw) continue; // no Gujarati version, or not a release
        const day = isoFrom(raw.dateLine);
        if (!day) continue;
        if (day < date) { olderInARow++; continue; }
        olderInARow = 0;
        if (day > date) continue;
        const photos: string[] = [];
        for (const [k, src] of raw.photos.entries()) {
          const res = await ctx.request.get(src).catch(() => null);
          if (!res || !res.ok()) continue;
          const type = res.headers()["content-type"] ?? "";
          const ext = type.includes("png") ? "png" : "jpg";
          const name = `${n}-${k}.${ext}`;
          await writeFile(path.join(mediaDir, name), await res.body());
          photos.push(`/media/${date}/${name}`);
        }
        const office = raw.dateLine.replace(/^.*?\bBY\b/i, "").trim();
        const release: Release = {
          id: n, date: day, url: `${SITE}/PressReleaseDetails/?id=${n}&LanguageId=2`, office,
          headline: raw.headline, subhead: raw.subhead, body: raw.paras.join("\n\n"), photos,
          fetchedAt: new Date().toISOString(),
        };
        store.putRelease(release);
        fetched++;
        log(`  ${n}  ${office.slice(0, 24).padEnd(24)} ${raw.headline.slice(0, 60)}  (${photos.length} photo${photos.length === 1 ? "" : "s"})`);
      }
    }
  } finally {
    await browser.close();
  }
  return { fetched, skipped, releases: store.releases(date) };
}
