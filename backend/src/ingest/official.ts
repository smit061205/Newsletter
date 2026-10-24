// Gujarati news from two official sources besides PIB, read the way PIB is --
// plain pages open to programs (their robots rules allow them), one at a time
// with a pause, under the paper's own name:
//
//   cmo  the Gujarat Chief Minister's Office, cmogujarat.gov.in/gu/news: the
//        state's own news from Gandhinagar, five a page, newest first (?page=N)
//   air  All India Radio's Gujarati news, newsonair.gov.in/gu: each day's
//        archive (/gu/YYYY/MM/DD/, then /page/N/), Ahmedabad's regional news
//        among the national
//
// Each item is stored as a release in the paper's language, so the rewrite
// writes it up like a PIB release; one that is the same news as a release
// already taken that day is left out (PIB's is the source of record). Photos
// only from the CM's office (the government's own): All India Radio's are
// often news agencies' pictures, not the government's to give.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import type { Progress, Release, Store } from "../store.ts";
import { sameNewsIn } from "../editorial/translate.ts";
import { decodeEntities, imageSize } from "./pib.ts";

const UA = "CapitalKranti-news-ingest/1.0";
const PAUSE_MS = 1500;
const MAX_PAGES = 120; // a day's ceiling for both, whatever happens

export type OfficialSource = "cmo" | "air";
/** Release ids: far above PIB's PRIDs, so the two never meet in the store. */
const ID_BASE: Record<OfficialSource, number> = { cmo: 3_000_000_000, air: 4_000_000_000 };
export const OFFICE: Record<OfficialSource, string> = { cmo: "મુખ્યમંત્રી કાર્યાલય, ગુજરાત", air: "આકાશવાણી સમાચાર" };

let last = 0;
let pages = 0;
async function get(url: string): Promise<string | null> {
  if (++pages > MAX_PAGES) throw new Error(`more than ${MAX_PAGES} pages from the official sources in one run: stopping`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = last + PAUSE_MS * (attempt + 1) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (res.ok) return await res.text();
    } catch { /* once more */ }
  }
  throw new Error(`no answer from ${new URL(url).host}`);
}

const text = (html: string) => decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
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

export interface Item { source: OfficialSource; id: number; url: string; headline: string; date: string }

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

/** All India Radio: the day's archive, page by page. */
async function airList(date: string): Promise<Item[]> {
  const [y, m, d] = date.split("-");
  const out: Item[] = [];
  for (let page = 1; page <= 8; page++) {
    const html = await get(`https://newsonair.gov.in/gu/${y}/${m}/${d}/${page > 1 ? `page/${page}/` : ""}`);
    if (!html) break;
    const rows = [...html.matchAll(/<article class="post-(\d+)[^"]*"[\s\S]*?<h3 class="entry-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    if (!rows.length) break;
    for (const r of rows) out.push({ source: "air", id: ID_BASE.air + Number(r[1]), url: r[2], headline: text(r[3]), date });
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
  const photo = html.match(/<figure class="featured-media">[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1] ?? null;
  return { id, headline, subhead: "", date: when ? iso(when[3], GU_MONTHS.indexOf(when[1]) + 1, when[2]) : null,
           paras: paragraphs(body), photo };
}

/** Every item of `date` from both sources not stored yet, with its photo. */
export async function ingestOfficial(store: Store, date: string, opts: { log?: (s: string) => void; progress?: (p: Progress) => void } = {}):
  Promise<{ listed: number; fetched: number }> {
  const log = opts.log ?? (() => {});
  pages = 0;
  const items: Item[] = [];
  for (const [name, list] of [["the CM's office", cmoList], ["All India Radio, Gujarati", airList]] as const) {
    const got = await list(date).catch((e: unknown) => { log(`${name}: couldn't read the list (${e instanceof Error ? e.message : e})`); return []; });
    log(`${name}: ${got.length} item(s) for ${date}`);
    items.push(...got);
  }
  const taken = store.releases(date).filter((r) => !r.lang || r.lang === "gu");
  const mediaDir = path.join(MEDIA_DIR, date);
  await mkdir(mediaDir, { recursive: true });
  let fetched = 0;
  for (const [k, it] of items.entries()) {
    opts.progress?.({ done: k, total: items.length, label: "reading", item: it.headline });
    if (it.id && store.hasRelease(it.id)) continue;
    const html = await get(it.url).catch(() => null);
    const p = html ? (it.source === "cmo" ? parseCmo(html) : parseAir(html, it.id)) : null;
    if (!p || !p.paras.length) { log(`  ${it.url}: no text on the page`); continue; }
    if (p.date && p.date !== date) continue;
    if (store.hasRelease(p.id)) continue;
    const twin = sameNewsIn({ headline: p.headline, body: p.paras.join("\n\n") }, taken);
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
      body: p.paras.join("\n\n"), photos, fetchedAt: new Date().toISOString(), source: it.source, lang: "gu",
    };
    store.putRelease(release);
    taken.push(release);
    fetched++;
    log(`  ${it.source} ${p.headline.slice(0, 70)} (${photos.length} photo${photos.length === 1 ? "" : "s"})`);
  }
  opts.progress?.({ done: items.length, total: items.length, label: "reading" });
  return { listed: items.length, fetched };
}
