// The 8-page paper's own news (the editor, 3 Nov): each section page's sources
// (profile `sections`), read as they offer themselves to programs -- their RSS
// feeds, then each item's own page for its text, only where the site's
// robots rules allow it. A site that refuses us (401, 403, 451 or robots.txt)
// is left out and said, never worked around (ESPNcricinfo refused, 3 Nov).
//
// A news outlet's report is a source of facts: the paper writes its own story
// from them (editorial/sections.ts) and never prints its words or its photos;
// a government's (RBI, SEBI) or NASA's photos may be printed (`photos`).
//
// Each item is stored as a release of the sections' own day (store.ts
// sectionsDay), so nothing that makes the day's paper ever sees it.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import { profile } from "../profile.ts";
import { sectionsDay, type Release, type Store } from "../store.ts";
import { decodeEntities, imageSize } from "./pib.ts";

const UA = "CapitalKranti-news-ingest/1.0";
const PAUSE_MS = 500;
/** Release ids: above every other source's (official.ts, telegram.ts). */
const ID_BASE = 8_000_000_000;
/** The newest items read from each feed (a feed lists 30-200; a page prints six or seven). */
const PER_FEED = 8;
/** The fewest words an item's page must give for a story to be written from it. */
const MIN_WORDS = 80;

export type Section = NonNullable<typeof profile.sections>[number];
export type Feed = Section["feeds"][number];

// ---- polite fetching: one request at a time to a site, robots rules kept

const last = new Map<string, number>();
async function get(url: string): Promise<{ status: number; text: string } | null> {
  const host = new URL(url).host;
  const at = Math.max(Date.now(), (last.get(host) ?? 0) + PAUSE_MS);
  last.set(host, at);
  if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()));
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(25_000) });
    return { status: res.status, text: res.ok ? await res.text() : "" };
  } catch {
    return null;
  }
}

const robots = new Map<string, Promise<(path: string) => boolean>>();
/** Whether a site's robots.txt lets programs read `url` (the rules for every program, or ours by name). */
export async function allowed(url: string): Promise<boolean> {
  const u = new URL(url);
  if (!robots.has(u.host)) robots.set(u.host, (async () => {
    const got = await get(`${u.protocol}//${u.host}/robots.txt`);
    return rulesOf(got && got.status === 200 ? got.text : "");
  })());
  return (await robots.get(u.host)!)(u.pathname + u.search);
}

/** A robots.txt's rules for us, as a test of a path (Allow and Disallow, `*` and `$`, the longest match wins). */
export function rulesOf(txt: string): (path: string) => boolean {
  const groups: { agents: string[]; rules: { allow: boolean; re: RegExp; len: number }[] }[] = [];
  let open = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [k, v] = [m[1].toLowerCase(), m[2].trim()];
    if (k === "user-agent") {
      if (!open) groups.push({ agents: [], rules: [] });
      groups[groups.length - 1].agents.push(v.toLowerCase());
      open = true;
    } else if ((k === "allow" || k === "disallow") && groups.length) {
      open = false;
      if (!v) continue; // "Disallow:" with nothing: everything allowed
      const re = new RegExp(`^${v.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*").replace(/\\\$$/, "$")}`);
      groups[groups.length - 1].rules.push({ allow: k === "allow", re, len: v.length });
    } else open = false;
  }
  const ours = groups.filter((g) => g.agents.some((a) => a !== "*" && UA.toLowerCase().startsWith(a)));
  const rules = (ours.length ? ours : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  return (p: string) => {
    const hit = rules.filter((r) => r.re.test(p)).sort((a, b) => b.len - a.len || Number(b.allow) - Number(a.allow))[0];
    return !hit || hit.allow;
  };
}

// ---- feeds and pages

export interface FeedItem { title: string; link: string; at: number; summary: string; image: string | null }

const tag = (x: string, name: string) => x.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";
const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
const plain = (html: string) => decodeEntities(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** An RSS or Atom feed's items, newest first. */
export function parseFeed(xml: string): FeedItem[] {
  const blocks = [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return blocks.map((b) => {
    const link = cdata(tag(b, "link")).trim() || (b.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? "");
    const when = cdata(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date")).trim();
    const image = b.match(/<media:content[^>]+url="([^"]+\.(?:jpe?g|png)[^"]*)"/i)?.[1] ?? b.match(/<enclosure[^>]+url="([^"]+\.(?:jpe?g|png)[^"]*)"/i)?.[1] ?? null;
    return { title: plain(cdata(tag(b, "title"))), link: decodeEntities(link), at: Date.parse(when) || 0,
             summary: plain(cdata(tag(b, "description") || tag(b, "summary"))), image };
  }).filter((i) => i.title && /^https?:\/\//.test(i.link)).sort((a, b) => b.at - a.at);
}

// (a site's menus, shares and notices, not the report)
const NOISE = /cookie|subscribe|newsletter|download (the )?app|follow us|also read|read more|click here|whatsapp|telegram|copyright|all rights reserved|advertisement|આ પણ વાંચો|વધુ વાંચો|ફોલો કરો|ડાઉનલોડ/i;
/** An item's page as the report's paragraphs (its <article> first, else the page's), menus and notices left out. */
export function articleText(html: string): string[] {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ");
  const inArticle = [...body.matchAll(/<article[\s\S]*?<\/article>/gi)].map((m) => m[0]).join(" ");
  const from = inArticle.length > 2000 ? inArticle : body;
  const paras = [...from.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)].map((m) => plain(m[0]))
    .filter((p) => p.length >= 40 && !NOISE.test(p) && !/[{};]\s*\S+\s*:/.test(p));
  return [...new Set(paras)];
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const idOf = (url: string) => {
  let h = 0;
  for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ID_BASE + (h % 1_000_000_000);
};

/** The day's window: its own news (IST), with the evening before (a match ended late). */
export function windowOf(date: string): { from: number; to: number } {
  const start = Date.parse(`${date}T00:00:00+05:30`);
  return { from: start - 6 * 3600_000, to: start + 24 * 3600_000 };
}

/** Every section's news for `date`: each feed's newest items in the day, read where its site allows it. */
export async function ingestSections(store: Store, date: string, log: (s: string) => void): Promise<{ read: number; refused: string[] }> {
  const sections = profile.sections ?? [];
  const day = sectionsDay(date);
  const have = new Set(store.releases(day).map((r) => r.url));
  const { from, to } = windowOf(date);
  const mediaDir = path.join(MEDIA_DIR, date);
  await mkdir(mediaDir, { recursive: true });
  const refused: string[] = [];
  let read = 0;
  const one = async (section: Section, feed: Feed) => {
    if (!(await allowed(feed.url))) { refused.push(feed.name); return log(`  ${feed.name}: its robots rules don't allow programs: left out`); }
    const got = await get(feed.url);
    if (!got || got.status !== 200) {
      if (got && [401, 403, 451].includes(got.status)) refused.push(feed.name);
      return log(`  ${feed.name}: the feed didn't answer (${got?.status ?? "no answer"}): left out`);
    }
    // (the feed's newest of the day, those not read already: read again, it doesn't go further down the list)
    const items = parseFeed(got.text).filter((i) => !i.at || (i.at >= from && i.at < to)).slice(0, PER_FEED).filter((i) => !have.has(i.link));
    for (const it of items) {
      if (!(await allowed(it.link))) continue;
      const page = await get(it.link);
      if (!page || page.status !== 200) {
        if (page && [401, 403, 451].includes(page.status)) { refused.push(feed.name); log(`  ${feed.name}: its pages refuse programs: left out`); return; }
        continue;
      }
      const paras = articleText(page.text);
      if (words(paras.join(" ")) < MIN_WORDS) continue;
      const photos: string[] = [];
      if (feed.photos && it.image) {
        const img = await fetch(it.image, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
        const bytes = img?.ok ? new Uint8Array(await img.arrayBuffer()) : null;
        const size = bytes ? imageSize(bytes) : null;
        if (bytes && size && size.width >= 600) {
          const name = `section-${idOf(it.link) - ID_BASE}.${bytes[0] === 0x89 ? "png" : "jpg"}`;
          await writeFile(path.join(mediaDir, name), bytes);
          photos.push(`/media/${date}/${name}`);
        }
      }
      const release: Release = { id: idOf(it.link), date: day, url: it.link, office: feed.name, headline: it.title, subhead: "",
                                 body: paras.join("\n\n"), photos, fetchedAt: new Date().toISOString(), source: "section", lang: feed.lang, section: section.id };
      store.putRelease(release);
      have.add(it.link);
      read++;
    }
    log(`  ${feed.name}: ${items.length} of the day's item(s) looked at`);
  };
  // (the sources side by side; each site's requests one at a time, at its own pace)
  await Promise.all(sections.flatMap((s) => s.feeds.map((f) => one(s, f).catch((e: unknown) => log(`  ${f.name}: couldn't be read (${e instanceof Error ? e.message : e})`)))));
  log(`the 8-page paper's own news: ${read} new item(s)${refused.length ? `; refused us: ${[...new Set(refused)].join(", ")}` : ""}`);
  return { read, refused };
}
