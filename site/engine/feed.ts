// RSS 2.0, RSS 1.0 (RDF) and Atom, read without a library: the items' titles,
// links, summaries, dates and pictures. Feeds in the wild are untidy (CDATA,
// entities, missing dates), so every field is optional except title and link.
import { decodeEntities } from "../../backend/src/ingest/pib.ts";

export interface FeedItem { title: string; url: string; summary: string; publishedAt: string | null; image: string | null }

// tags removed after decoding too: many feeds send their HTML escaped ("&lt;p&gt;")
const untag = (s: string) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ");
const strip = (s: string) => decodeEntities(untag(decodeEntities(untag(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")))))
  .replace(/\s+/g, " ").trim();
const raw = (block: string, tag: string) => block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"))?.[1];
const attr = (block: string, tag: string, name: string) =>
  block.match(new RegExp(`<${tag}\\b[^>]*\\b${name}=["']([^"']+)["'][^>]*>`, "i"))?.[1];

function date(s: string | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(strip(s));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function parseFeed(xml: string, base: string): FeedItem[] {
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const title = strip(raw(b, "title") ?? "");
    let link = atom
      ? (b.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/i)?.[1] ?? attr(b, "link", "href"))
      : strip(raw(b, "link") ?? "") || attr(b, "link", "href") || (raw(b, "guid")?.trim().startsWith("http") ? strip(raw(b, "guid")!) : undefined);
    if (!title || !link) continue;
    try { link = new URL(decodeEntities(link), base).href; } catch { continue; }
    const summary = strip(raw(b, "description") ?? raw(b, "summary") ?? raw(b, "content") ?? raw(b, "content:encoded") ?? "").slice(0, 1200);
    const publishedAt = date(raw(b, "pubDate") ?? raw(b, "published") ?? raw(b, "updated") ?? raw(b, "dc:date"));
    const image = attr(b, "media:content", "url") ?? attr(b, "media:thumbnail", "url")
      ?? (attr(b, "enclosure", "type")?.startsWith("image") ? attr(b, "enclosure", "url") : undefined) ?? null;
    items.push({ title, url: link, summary, publishedAt, image });
  }
  return items;
}

/** A page's main text, roughly: its paragraphs, longest run first kept in order.
 * Used for official pages (to check claims against) and for an outlet's
 * article only as facts to check, never as words to reuse. */
export function pageText(html: string): { text: string; image: string | null; published: string | null } {
  const body = html.replace(/<(script|style|nav|header|footer|aside|form|noscript)[\s\S]*?<\/\1>/gi, " ");
  const paras = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter((p) => p.length > 40);
  const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] ?? null;
  const published = date(html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|pubdate|date)["'][^>]+content=["']([^"']+)/i)?.[1]);
  return { text: paras.join("\n\n").slice(0, 12_000), image, published };
}
