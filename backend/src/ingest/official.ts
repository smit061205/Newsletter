// Gujarati news from two official sources besides PIB, read the way PIB is --
// plain pages open to programs (their robots rules allow them), one at a time
// with a pause, under the paper's own name:
//
//   cmo  the Gujarat Chief Minister's Office, cmogujarat.gov.in/gu/news: the
//        state's own news from Gandhinagar, five a page, newest first (?page=N)
//   air  All India Radio's Gujarati news, newsonair.gov.in/gu: each day's
//        archive (/gu/YYYY/MM/DD/, then /page/N/), Ahmedabad's regional news
//        among the national; and its English service's world news (the
//        Gujarati one has little or none), up to WORLD_MAX a day, translated
//        by the top-up (editorial/translate.ts worldNews)
//
// Each item is stored as a release in the paper's language, so the rewrite
// writes it up like a PIB release; one that is the same news as a release
// already taken that day is left out (PIB's is the source of record). Photos
// only from the CM's office (the government's own): All India Radio's are
// often news agencies' pictures, not the government's to give.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import { storyIdOf, type Progress, type Release, type Store } from "../store.ts";
import { sameNewsIn } from "../editorial/translate.ts";
import { decodeEntities, imageSize } from "./pib.ts";

const UA = "CapitalKranti-news-ingest/1.0";
const PAUSE_MS = 1500;
const MAX_PAGES = 120; // a day's ceiling for both, whatever happens

export type OfficialSource = "cmo" | "air";
/** Release ids: far above PIB's PRIDs, so the two never meet in the store. */
const ID_BASE: Record<OfficialSource, number> = { cmo: 3_000_000_000, air: 4_000_000_000 };
/** All India Radio's English posts (numbered apart from its Gujarati ones). */
const AIR_EN_BASE = 5_000_000_000;
const WORLD_MAX = 4;
export const OFFICE: Record<OfficialSource, string> = { cmo: "મુખ્યમંત્રી કાર્યાલય, ગુજરાત", air: "આકાશવાણી સમાચાર" };

// each site its own pace (the two are read side by side, each politely)
const last = new Map<string, number>();
let pages = 0;
async function get(url: string): Promise<string | null> {
  if (++pages > MAX_PAGES) throw new Error(`more than ${MAX_PAGES} pages from the official sources in one run: stopping`);
  const host = new URL(url).host;
  for (let attempt = 0; attempt < 2; attempt++) {
    // (the next slot is taken before waiting, so two calls for one site never share it)
    const at = Math.max(Date.now(), (last.get(host) ?? 0) + PAUSE_MS * (attempt + 1));
    last.set(host, at);
    if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()));
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (res.ok) return await res.text();
    } catch { /* once more */ }
  }
  throw new Error(`no answer from ${new URL(url).host}`);
}

// (invisible joiners some items carry are dropped: no font draws them)
const text = (html: string) => decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
  .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
const paragraphs = (html: string) => [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
  .flatMap((m) => text(m[1]).split("\n")).filter((p) => p.length > 1);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const GU_MONTHS = ["જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઓગસ્ટ", "સપ્ટેમ્બર", "ઓક્ટોબર", "નવેમ્બર", "ડિસેમ્બર"];
const iso = (y: string, m: number, d: string) => `${y}-${String(m).padStart(2, "0")}-${d.padStart(2, "0")}`;
/** "23 Oct, 2026" -> "2026-10-23" */
function cmoDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : 0;
  return m && month ? iso(m[3], month, m[1]) : null;
}

export interface Item { source: OfficialSource; id: number; url: string; headline: string; date: string; section?: string; lang?: "en" }

/** All India Radio's sections, as the paper names them (the release's "ministry": what kind of news it is). */
export const AIR_SECTION: Record<string, string> = {
  national: "રાષ્ટ્રીય", international: "આંતરરાષ્ટ્રીય", "regional-news": "પ્રાદેશિક", sports: "રમતગમત",
  business: "વેપાર", "business-miscellaneous": "વેપાર", health: "આરોગ્ય", "science-and-technologies": "વિજ્ઞાન અને ટેકનોલોજી",
  entertainment: "મનોરંજન", elections: "ચૂંટણી", weather: "હવામાન",
};

/** The CM's office: the day's items, from its news pages (newest first) until they're older. */
async function cmoList(date: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 0; page < 8; page++) {
    const html = await get(`https://cmogujarat.gov.in/gu/news${page ? `?page=${page}` : ""}`);
    if (!html) break;
    const rows = [...html.matchAll(/<h4><a href="(\/gu\/latest-news\/[^"]+)"[^>]*>([\s\S]*?)<\/a><\/h4>\s*<p class="date">([^<]+)</g)];
    if (!rows.length) break;
    let older = false;
    for (const r of rows) {
      const d = cmoDate(r[3]);
      if (!d) continue;
      if (d < date) { older = true; continue; }
      if (d === date) out.push({ source: "cmo", id: 0, url: `https://cmogujarat.gov.in${r[1]}`, headline: text(r[2]), date: d });
    }
    if (older) break;
  }
  return out;
}

/** All India Radio in English: the day's world news (its "international" section), the first few. */
async function airWorldList(date: string): Promise<Item[]> {
  const [y, m, d] = date.split("-");
  const out: Item[] = [];
  for (let page = 1; page <= 6 && out.length < WORLD_MAX; page++) {
    const html = await get(`https://newsonair.gov.in/${y}/${m}/${d}/${page > 1 ? `page/${page}/` : ""}`);
    if (!html) break;
    const rows = [...html.matchAll(/<article class="post-(\d+)([^"]*)"[\s\S]*?<h3 class="entry-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    if (!rows.length) break;
    for (const r of rows) {
      if (!/category-international\b/.test(r[2]) || out.length >= WORLD_MAX) continue;
      out.push({ source: "air", id: AIR_EN_BASE + Number(r[1]), url: r[3], headline: text(r[4]), date, section: AIR_SECTION.international, lang: "en" });
    }
    if (!html.includes(`/page/${page + 1}/`)) break;
  }
  return out;
}

/** All India Radio: the day's archive, page by page. */
async function airList(date: string): Promise<Item[]> {
  const [y, m, d] = date.split("-");
  const out: Item[] = [];
  for (let page = 1; page <= 8; page++) {
    const html = await get(`https://newsonair.gov.in/gu/${y}/${m}/${d}/${page > 1 ? `page/${page}/` : ""}`);
    if (!html) break;
    const rows = [...html.matchAll(/<article class="post-(\d+)([^"]*)"[\s\S]*?<h3 class="entry-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    if (!rows.length) break;
    for (const r of rows) {
      const cat = r[2].match(/category-([\w-]+)/g)?.map((c) => c.slice(9)).find((c) => AIR_SECTION[c]);
      out.push({ source: "air", id: ID_BASE.air + Number(r[1]), url: r[3], headline: text(r[4]), date, section: cat ? AIR_SECTION[cat] : undefined });
    }
    if (!html.includes(`/page/${page + 1}/`)) break;
  }
  return out;
}

interface Page { id: number; headline: string; subhead: string; date: string | null; paras: string[]; photo: string | null }

export function parseCmo(html: string): Page | null {
  const headline = text(html.match(/field--name-title[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "");
  const nid = Number(html.match(/"nid":"?(\d+)/)?.[1] ?? html.match(/\bnode-(\d+)\b/)?.[1]);
  const body = html.match(/field--name-body[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
  if (!headline || !nid || !body) return null;
  // the opening bold lines are its summary points: the sub-heading, the first of them
  const bold = text(body.match(/^\s*<p>\s*<strong>([\s\S]*?)<\/strong>/)?.[1] ?? "").split("\n");
  const paras = paragraphs(body.replace(/^\s*<p>\s*<strong>[\s\S]*?<\/strong>/, "<p>"));
  // (its own photo is filed by month; the site's logo isn't)
  const photo = html.match(/<img[^>]+src="(\/sites\/default\/files\/\d{4}-\d{2}\/[^"]+\.(?:jpe?g|png))"/i)?.[1];
  return { id: ID_BASE.cmo + nid, headline, subhead: bold[0] ?? "", date: cmoDate(html.match(/<p class="date">([^<]+)</)?.[1] ?? ""),
           paras: [...bold.slice(1), ...paras], photo: photo ? `https://cmogujarat.gov.in${photo}` : null };
}

export function parseAir(html: string, id: number): Page | null {
  const headline = text(html.match(/<h2 class="mb-0 text-capitalize">([\s\S]*?)<\/h2>/)?.[1] ?? "");
  const body = html.match(/<div class="entry-content">([\s\S]*?)<\/div><!-- \.entry-content -->/)?.[1] ?? "";
  if (!headline || !body) return null;
  const when = html.match(/(જાન્યુઆરી|ફેબ્રુઆરી|માર્ચ|એપ્રિલ|મે|જૂન|જુલાઈ|ઓગસ્ટ|સપ્ટેમ્બર|ઓક્ટોબર|નવેમ્બર|ડિસેમ્બર)\s+(\d{1,2}),\s+(\d{4})/);
  // (the English service: "October 24, 2026")
  const en = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/);
  const photo = html.match(/<figure class="featured-media">[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1] ?? null;
  // (some items' paragraphs are divs, not p's)
  const paras = paragraphs(body).length ? paragraphs(body)
    : [...body.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/gi)].map((m) => text(m[1])).filter((p) => p.length > 1);
  return { id, headline, subhead: "",
           date: when ? iso(when[3], GU_MONTHS.indexOf(when[1]) + 1, when[2]) : en ? iso(en[3], MONTHS.indexOf(en[1].slice(0, 3).toLowerCase()) + 1, en[2]) : null,
           paras, photo };
}

/** Every item of `date` from both sources not stored yet, with its photo. */
export async function ingestOfficial(store: Store, date: string, opts: { log?: (s: string) => void; progress?: (p: Progress) => void } = {}):
  Promise<{ listed: number; fetched: number }> {
  const log = opts.log ?? (() => {});
  pages = 0;
  const taken = store.releases(date).filter((r) => !r.lang || r.lang === "gu");
  const mediaDir = path.join(MEDIA_DIR, date);
  await mkdir(mediaDir, { recursive: true });
  let listed = 0, fetched = 0, done = 0;
  // one source's day: its list, then its items one by one (the two sources side by side)
  const one = async (name: string, list: (date: string) => Promise<Item[]>) => {
    const items = await list(date).catch((e: unknown) => { log(`${name}: couldn't read the list (${e instanceof Error ? e.message : e})`); return [] as Item[]; });
    log(`${name}: ${items.length} item(s) for ${date}`);
    listed += items.length;
    for (const it of items) {
      opts.progress?.({ done: done++, total: Math.max(listed, done), label: "reading", item: it.headline });
      if (it.id && store.hasRelease(it.id)) continue;
      const html = await get(it.url).catch(() => null);
      const p = html ? (it.source === "cmo" ? parseCmo(html) : parseAir(html, it.id)) : null;
      if (!p || !p.paras.length) { log(`  ${it.url}: no text on the page`); continue; }
      if (p.date && p.date !== date) continue;
      if (store.hasRelease(p.id)) continue;
      // (world news in English: translated by the top-up, not compared with the Gujarati)
      const twin = it.lang ? null : sameNewsIn({ headline: p.headline, body: p.paras.join("\n\n") }, taken);
      if (twin) { log(`  ${p.headline.slice(0, 50)}: the same news as ${twin.source === "pib" ? `PIB ${twin.id}` : `an earlier item (${twin.id})`}, left out`); continue; }
      const photos: string[] = [];
      if (p.photo && it.source === "cmo") {
        const img = await fetch(p.photo, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
        const bytes = img?.ok ? new Uint8Array(await img.arrayBuffer()) : null;
        const size = bytes ? imageSize(bytes) : null;
        if (bytes && size && size.width >= 300 && size.height >= 150) {
          const name = `${it.source}${p.id - ID_BASE[it.source]}.${bytes[0] === 0x89 ? "png" : "jpg"}`;
          await writeFile(path.join(mediaDir, name), bytes);
          photos.push(`/media/${date}/${name}`);
        }
      }
      const release: Release = {
        id: p.id, date, url: it.url, office: OFFICE[it.source], headline: p.headline, subhead: p.subhead,
        body: p.paras.join("\n\n"), photos, fetchedAt: new Date().toISOString(), source: it.source, lang: it.lang ?? "gu",
        ...(it.section ? { ministry: it.section } : {}),
      };
      store.putRelease(release);
      if (!it.lang) taken.push(release);
      fetched++;
      log(`  ${it.source} ${p.headline.slice(0, 70)} (${photos.length} photo${photos.length === 1 ? "" : "s"})`);
    }
  };
  await Promise.all([one("the CM's office", cmoList), one("All India Radio, Gujarati", airList), one("All India Radio, world news", airWorldList)]);
  opts.progress?.({ done: listed, total: listed, label: "reading" });
  return { listed, fetched };
}

/** The day's items from these sources that turned out to be the same news as
 * a PIB release (read side by side with them, so PIB's may have come after):
 * taken out, PIB's being the source of record. Returns how many. */
export function dropTwinsOfPib(store: Store, date: string, log: (s: string) => void = () => {}): number {
  const all = store.releases(date);
  const pib = all.filter((r) => r.source === "pib" && (!r.lang || r.lang === "gu"));
  let n = 0;
  for (const r of all.filter((x) => (x.source === "cmo" || x.source === "air") && x.lang !== "en")) {
    const twin = sameNewsIn(r, pib);
    if (!twin) continue;
    store.deleteRelease(r.id);
    store.deleteStory(storyIdOf(r));
    log(`  ${r.headline.slice(0, 50)}: the same news as PIB ${twin.id}, left out`);
    n++;
  }
  return n;
}
