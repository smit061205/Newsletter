// The paper's own website (capitalkranti.co.in, its own repository) as a source, 7 Nov: it writes
// Gujarati news all day from about 150 sources and checks every number and claim before it
// publishes, and its Aavtikal section keeps long articles on AI, tech and science. Its address
// /api/paper gives the day's published stories in full (never the paper's own back) and Aavtikal's
// recent articles.
//
//   news      taken at paper time after PIB, the CM's office and All India Radio: one that is the
//             same news as theirs or the editor's Telegram news is left out (theirs are the record)
//   Aavtikal  only on a day short of copy, before the AI is asked for features (fill step): an
//             article already written, once ever (7 Nov: the AI didn't answer for most of an hour)
//
// Both are printed as the website wrote them (rewrite.ts asIs): no AI between them and the page.
// A photo only when it is the government's own (the website shows it through /official/<the
// address in base64>); it is fetched from the government's site itself.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import { settable } from "../editorial/quality.ts";
import { asIs, paragraphs } from "../editorial/rewrite.ts";
import { sameNewsIn } from "../editorial/translate.ts";
import { storyIdOf, type Release, type Store } from "../store.ts";
import { imageSize } from "./pib.ts";

const SITE = process.env.CK_SITE_URL ?? "https://www.capitalkranti.co.in";
const UA = "CapitalKranti-news-ingest/1.0";
/** Release ids: above the other sources' (store.ts), from the website's own id. */
const ID_BASE = 7_000_000_000;
export const OFFICE = "કેપિટલ ક્રાંતિ";
const AAVTIKAL = "આવતીકાલ";
/** The website's stories taken a day at most, its most important first: 11 Nov's 74 (with the rest,
 * 123 stories for 4 pages) made the layout take 26 minutes, and the pages print about 30 in all. */
const MOST = 30;
const TIER: Record<string, string> = { gujarat: "પ્રાદેશિક", india: "રાષ્ટ્રીય", world: "આંતરરાષ્ટ્રીય" };

interface SiteStory { id: string; tier: string; headline: string; deck: string; body: string; caption: string;
  photo: { url: string; width?: number; height?: number } | null; publishedAt: string }
interface SiteFeature { id: string; beat: string; headline: string; deck: string; body: string; publishedAt: string }
interface Day { date: string; stories: SiteStory[]; features: SiteFeature[] }

const idOf = (siteId: string) => ID_BASE + (createHash("sha1").update(siteId).digest().readUInt32BE(0) % 1_000_000_000);
const dayBefore = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

async function day(date: string): Promise<Day> {
  const res = await fetch(`${SITE}/api/paper?date=${date}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`the website answered ${res.status}`);
  return (await res.json()) as Day;
}

/** The government's own photo behind the website's /official/ address, saved with the day's media. */
async function officialPhoto(url: string, date: string, id: number): Promise<string | null> {
  const m = url.match(/^\/official\/([A-Za-z0-9_-]+)\.jpg$/);
  if (!m) return null;
  let source: URL;
  try { source = new URL(Buffer.from(m[1], "base64url").toString()); } catch { return null; }
  if (source.protocol !== "https:" && source.protocol !== "http:") return null;
  const img = await fetch(source, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  const bytes = img?.ok ? new Uint8Array(await img.arrayBuffer()) : null;
  const size = bytes ? imageSize(bytes) : null;
  if (!bytes || !size || size.width < 300 || size.height < 150) return null;
  const dir = path.join(MEDIA_DIR, date);
  await mkdir(dir, { recursive: true });
  const name = `w${id - ID_BASE}.${bytes[0] === 0x89 ? "png" : "jpg"}`;
  await writeFile(path.join(dir, name), bytes);
  return `/media/${date}/${name}`;
}

/** The website's news of `date` not stored yet, as releases written up as the website wrote them. */
export async function ingestSite(store: Store, date: string, opts: { log?: (s: string) => void } = {}): Promise<{ listed: number; taken: number }> {
  const log = opts.log ?? (() => {});
  const got = await day(date);
  // (the other sources' Gujarati news of the day and the day before: theirs is the record)
  const taken = [...store.releases(dayBefore(date)), ...store.releases(date)].filter((r) => !r.lang || r.lang === "gu");
  let n = 0;
  let had = taken.filter((r) => r.source === "site" && r.date === date && r.ministry !== AAVTIKAL).length;
  for (const s of got.stories) {
    if (had >= MOST) break;
    const id = idOf(s.id);
    if (store.hasRelease(id)) continue;
    const body = paragraphs(s.body).join("\n\n");
    if (!s.headline.trim() || !body) continue;
    // (letters the paper's fonts can't print: 3 of 80 on 7 Nov)
    if (!settable(`${s.headline} ${s.deck} ${body}`)) continue;
    const twin = sameNewsIn({ headline: s.headline, body }, taken);
    if (twin) { log(`  ${s.headline.slice(0, 50)}: the same news as ${twin.source === "telegram" ? "the editor's" : twin.source === "pib" ? `PIB ${twin.id}` : `an earlier item (${twin.id})`}, left out`); continue; }
    const photo = s.photo ? await officialPhoto(s.photo.url, date, id).catch(() => null) : null;
    const release: Release = {
      id, date, url: `${SITE}/story/${s.id}`, office: OFFICE, headline: s.headline, subhead: s.deck, body,
      photos: photo ? [photo] : [], fetchedAt: new Date().toISOString(), source: "site", lang: "gu",
      ministry: TIER[s.tier] ?? TIER.india,
    };
    store.putRelease(release);
    taken.push(release);
    n++;
    had++;
    log(`  website: ${s.headline.slice(0, 70)} (${photo ? "1 photo" : "0 photos"})`);
  }
  return { listed: got.stories.length, taken: n };
}

/** Up to `count` of Aavtikal's articles never printed before, into the day's paper as they are
 * (its sub-headings left out: the paper's stories have none), the newest first. Returns how many. */
export async function takeAavtikal(store: Store, date: string, count: number, log: (s: string) => void = () => {}): Promise<number> {
  const got = await day(date);
  let n = 0;
  for (const f of got.features) {
    if (n >= count) break;
    const id = idOf(`aavtikal-${f.id}`);
    if (store.hasRelease(id)) continue;
    const body = paragraphs(f.body).filter((p) => !p.startsWith("#")).join("\n\n");
    if (!f.headline.trim() || !body) continue;
    if (!settable(`${f.headline} ${f.deck} ${body}`)) continue;
    const release: Release = {
      id, date, url: `${SITE}/aavtikal/${f.id}`, office: OFFICE, headline: f.headline, subhead: f.deck, body,
      photos: [], fetchedAt: new Date().toISOString(), source: "site", lang: "gu", ministry: AAVTIKAL,
    };
    store.putRelease(release);
    // (in the paper's inside pages, like the features it stands in for)
    store.putStory({ ...asIs(release), priority: 5, page: 4 });
    n++;
    log(`  ${storyIdOf(release)}: Aavtikal -- ${f.headline.slice(0, 70)}`);
  }
  return n;
}
