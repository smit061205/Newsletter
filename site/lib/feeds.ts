// The RSS feed and the Google News sitemap, written as XML by hand (small, and no library to keep up).
import type { Lang, Story } from "./types.ts";
import { href } from "./i18n.ts";
import { PAPER, SITE_URL } from "./site.ts";
import { sectionName } from "./sections.ts";

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function rss(stories: Story[], lang: Lang, title?: string) {
  const items = stories.map((s) => {
    const e = lang === "en" ? s.en : lang === "hi" ? s.hi : null;
    const link = `${SITE_URL}${href(lang, `/news/${s.id}`)}`;
    return `<item><title>${x(e?.headline || s.headline)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid>` +
      `<pubDate>${new Date(s.publishedAt).toUTCString()}</pubDate><category>${x(sectionName(s.tier, lang))}</category>` +
      `<description>${x(e?.deck || s.deck)}</description>${s.photo ? `<enclosure url="${x(new URL(s.photo.url, SITE_URL).href)}" type="image/jpeg" length="0"/>` : ""}</item>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${x(title ?? PAPER[lang].name)}</title>` +
    `<link>${SITE_URL}${href(lang, "/")}</link><description>${x(PAPER[lang].tagline)}</description><language>${lang}-IN</language>${items}</channel></rss>`;
}

/** Google News: the last two days' stories only. */
export function newsSitemap(stories: { id: string; publishedAt: string; headline: string; en: boolean }[]) {
  const urls = stories.map((s) => `<url><loc>${SITE_URL}/news/${s.id}</loc><news:news><news:publication><news:name>${x(PAPER.gu.name)}</news:name>` +
    `<news:language>gu</news:language></news:publication><news:publication_date>${s.publishedAt}</news:publication_date><news:title>${x(s.headline)}</news:title></news:news></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls}</urlset>`;
}
