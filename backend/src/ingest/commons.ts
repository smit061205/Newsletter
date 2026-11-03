// Photos for the 8-page paper's own pages (the editor, 4 Nov): a news outlet's
// photos are never printed, so a section story without one of its own (a PIB
// release's, NASA's) is given a file photo from Wikimedia Commons, credited
// under it with its author and licence as the licence asks (Commons takes only
// free photos: public domain, CC0, CC BY, CC BY-SA). The AI that chose the
// page's news names what to look for (editorial/sections.ts): a person, a team,
// a film, a place.
//
// Read only where Wikimedia's robots rules allow programs: the search and the
// file's sizes from its API site (api.wikimedia.org), the author and licence
// from the photo's own page (commons.wikimedia.org/wiki/File:...), never the
// /w/ pages its robots rules keep programs out of.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import type { Store } from "../store.ts";
import { decodeEntities, imageSize } from "./pib.ts";
import { allowed } from "./sections.ts";

const API = "https://api.wikimedia.org/core/v1/commons";
const UA = "CapitalKranti-news/1.0 (https://github.com/smit061205/Newsletter)";
/** The widest it's fetched at, and the least it must be to print 2 columns sharp (542 pixels at 150 ppi; 3 columns, 826). */
const WANT = 1600, LEAST = 560;
/** Licences that let the paper print a photo (with its credit); GODL-India: the Government of India's own photos. */
const FREE = /^(public domain|pd\b|cc0|cc[- ]by(-sa)?[- ]\d|godl)/i;

export interface FilePhoto { url: string; credit: string }

let queue = Promise.resolve();
/** One request at a time to Commons. */
function get(url: string): Promise<Response | null> {
  const run = queue.then(() => fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null));
  queue = run.then(() => new Promise((r) => setTimeout(r, 300)));
  return run;
}

const plain = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);

/** A free file photo of `subject` (a name, in English), saved with the day's media; null if Commons has none that fits. */
export async function filePhoto(store: Store, date: string, subject: string): Promise<FilePhoto | null> {
  const q = subject.trim();
  if (!q) return null;
  // (looked for already today: the same answer, none paid for twice)
  const key = `commons1|${q.toLowerCase()}`;
  const had = store.fitted(key);
  if (had) return had.body ? (JSON.parse(had.body) as FilePhoto) : null;
  const found = await search(q, date).catch(() => null);
  store.putFitted(key, { body: found ? JSON.stringify(found) : "", model: "commons" });
  return found;
}

async function search(q: string, date: string): Promise<FilePhoto | null> {
  const res = await get(`${API}/search/page?q=${encodeURIComponent(q)}&limit=10`);
  if (!res?.ok) return null;
  const data = (await res.json()) as { pages?: { key: string; title: string; description?: string | null; excerpt?: string; thumbnail?: { url: string } | null }[] };
  const need = words(q);
  // the photos it found: files named for the subject, and the photo heading a category or gallery of it
  // (the photo heading the subject's own category first, then the files named most nearly for it alone)
  const files: { title: string; rank: number }[] = [];
  for (const p of data.pages ?? []) {
    const about = words(`${p.title} ${p.description ?? ""} ${plain(p.excerpt ?? "")}`);
    if (!need.every((w) => about.some((a) => a.startsWith(w)))) continue;
    if (p.key.startsWith("File:")) files.push({ title: p.key, rank: words(p.title).length - need.length });
    const thumb = p.thumbnail?.url.match(/\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)\//)?.[1];
    if (thumb && !p.key.startsWith("File:")) files.push({ title: `File:${decodeURIComponent(thumb)}`, rank: -1 });
  }
  const order = [...new Map(files.sort((a, b) => a.rank - b.rank).map((f) => [f.title, f])).keys()];
  for (const title of order.slice(0, 8)) {
    if (!/\.(jpe?g|png)$/i.test(title) || /logo|map|flag|coat.of.arms|signature|diagram|chart|icon|poster|cover/i.test(title)) continue;
    const info = await get(`${API}/file/${encodeURIComponent(title)}`);
    if (!info?.ok) continue;
    const f = (await info.json()) as { original?: { url: string; width: number; height: number } };
    const o = f.original;
    if (!o || o.width < LEAST || o.height < LEAST * 0.5 || o.width / o.height > 2.2 || o.width / o.height < 0.55) continue;
    // its author and licence, from its own page
    const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    if (!(await allowed(pageUrl))) continue;
    const page = await get(pageUrl);
    if (!page?.ok) continue;
    const html = await page.text();
    const licence = plain(html.match(/licensetpl&#95;short"[^>]*>([^<]*)/)?.[1] ?? html.match(/licensetpl_short"[^>]*>([^<]*)/)?.[1] ?? "");
    if (!FREE.test(licence)) continue;
    const artist = plain(html.match(/fileinfotpl(?:&#95;|_)aut"[^>]*>[^<]*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "").replace(/\s*Parent institution.*$/i, "").slice(0, 60);
    // (the original is fetched at a printable width: Commons' own thumbnail of it)
    const src = o.width > WANT ? o.url.replace(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^?]+).*$/, `$1/thumb/$2/$3/${WANT}px-$3`) : o.url;
    const img = await get(src);
    if (!img?.ok) continue;
    const bytes = new Uint8Array(await img.arrayBuffer());
    const size = imageSize(bytes);
    if (!size || size.width < LEAST) continue;
    const dir = path.join(MEDIA_DIR, date);
    await mkdir(dir, { recursive: true });
    const name = `commons-${hash(title)}.${bytes[0] === 0x89 ? "png" : "jpg"}`;
    await writeFile(path.join(dir, name), bytes);
    // (the credit the licence asks for: who took it, and the licence)
    return { url: `/media/${date}/${name}`, credit: `${artist ? `${artist}, ` : ""}${licence} / Wikimedia Commons` };
  }
  return null;
}

function hash(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
