// The ads: bookings (an image, its size, its page and days), moved or taken
// out, the sample ads, each day's count in a month, and the page's columns and
// room for stories (the Ads screen's preview). Placed by layout/ads.ts.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import { profile } from "../profile.ts";
import { ownAds, syncAds } from "../sister.ts";
import type { Ad, Store } from "../store.ts";
import { indiaNow, readJson, send, type Ctx } from "./http.ts";

export async function adsRoutes(c: Ctx) {
  const { store, req, res, url, parts } = c;
  if (parts[0] === "api" && parts[1] === "ads") {
    // (a sister paper's ads: Capital Kranti's on every day it hasn't changed, sister.ts)
    syncAds(store);
    /** The days a booking runs (a row per day: "<id>@<date>"), made a sister paper's own before they change. */
    const own = (id: string) => ownAds(store, (store.db.prepare("select date from ads where id = ? or id like ?").all(id, `${id}@%`) as { date: string }[]).map((r) => r.date));
    if (req.method === "GET" && parts[2] === "month") {
      // how many ads are booked on each day of a month (the Ads screen's month), sample ads left out
      const month = url.searchParams.get("month") ?? indiaNow().day.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return send(res, 400, { error: "the month is YYYY-MM" });
      const { sampleAdsOf } = await import("../build.ts");
      const samples = sampleAdsOf(store);
      const days: Record<string, number> = {};
      for (const r of store.db.prepare("select id, date from ads where date like ?").all(`${month}-%`) as { id: string; date: string }[]) {
        if (!samples.isSample(r.id.split("@")[0]) && !samples.isSample(r.id)) days[r.date] = (days[r.date] ?? 0) + 1;
      }
      return send(res, 200, days);
    }
    if (req.method === "GET") {
      const { standInsMovable, referenceAds } = await import("../layout/stories.ts");
      const { sampleAdsOf } = await import("../build.ts");
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
      if (body.page !== undefined && !(body.page >= 1 && body.page <= allPages())) return send(res, 400, { error: `the paper has pages 1 to ${allPages()}` });
      if (body.place !== undefined && !["left", "middle", "right"].includes(body.place)) return send(res, 400, { error: "the place is left, middle or right" });
      own(id);
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
      own(id);
      store.db.prepare("delete from ads where id = ? or id like ?").run(id, `${id}@%`);
      return send(res, 200, { deleted: parts[2] });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/layout") {
    // the page in centimetres, its columns, and each page's room for stories
    const { chromeFor } = await import("../chrome/chrome.ts");
    const { GRID, PAGE } = await import("../layout/typography.ts");
    const total = profile.issue.pages;
    const cm = (px: number) => Math.round((px / PAGE.width) * (profile.page.width / 72 * 2.54) * 100) / 100;
    const pages = [];
    for (let n = 1; n <= total; n++) {
      const c = await chromeFor(n, total, indiaNow().day, 1);
      pages.push({ page: n, topCm: cm(c.bodyTop), bottomCm: cm(c.bodyBottom) });
    }
    // (and the 8-page paper's own pages: an ad booked on one prints in that paper alone)
    const sections = profile.sections ?? [];
    for (let k = 0; k < sections.length; k++) {
      const n = total + 1 + k;
      const c = await chromeFor(n, total + sections.length, indiaNow().day, 1, undefined, { title: sections[k].title });
      pages.push({ page: n, topCm: cm(c.bodyTop), bottomCm: cm(c.bodyBottom) });
    }
    return send(res, 200, { widthCm: cm(PAGE.width), heightCm: cm(PAGE.height), columns: GRID.columns,
                            leftCm: cm(GRID.left), columnCm: cm(GRID.column), gutterCm: cm(GRID.gutter), pages });
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

/** The paper's pages, the 8-page paper's own included (an ad may be booked on one of those). */
const allPages = () => profile.issue.pages + (profile.sections?.length ?? 0);

/** An ad's page's room for stories: one of the day's pages, or one of the 8-page paper's own (under its title bar). */
async function adBand(page: number, date: string) {
  const { chromeFor } = await import("../chrome/chrome.ts");
  const sections = profile.sections ?? [];
  return page <= profile.issue.pages ? chromeFor(page, profile.issue.pages, date, 1)
    : chromeFor(page, allPages(), date, 1, undefined, { title: sections[page - profile.issue.pages - 1]?.title });
}

/** Store an ad's image and book it on each of its days (it's placed by layout/ads.ts). */
async function bookAd(store: Store, b: AdBooking): Promise<{ booked: string[] }> {
  const { GRID, PT } = await import("../layout/typography.ts");
  const { spanWidth } = await import("../layout/module.ts");
  if (!b.base64 || !b.cols || !b.heightCm || !b.page) throw new Error("an ad needs an image, its width in columns, its height in cm and a page");
  if (!(b.page >= 1 && b.page <= allPages())) throw new Error(`the paper has pages 1 to ${allPages()}`);
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
  const band = await adBand(b.page, b.from ?? b.dates?.[0] ?? indiaNow().day);
  if (height > band.bodyBottom - band.bodyTop) {
    const max = Math.floor(((band.bodyBottom - band.bodyTop) / PT / 72) * 2.54 * 10) / 10;
    throw new Error(`that's taller than page ${b.page} has room for: at most ${max} cm`);
  }
  ownAds(store, [...days]);
  for (const date of days) {
    // the day's first booking replaces the 8 August stand-ins
    const ads = store.ads(date);
    const { referenceAds } = await import("../layout/stories.ts");
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
  const { GRID, PT } = await import("../layout/typography.ts");
  const band = await adBand(ad.page, ad.date);
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
