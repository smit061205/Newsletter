// Each page's title, description, language alternates and share preview.
import type { Metadata } from "next";
import type { Lang, Story } from "./types.ts";
import { href } from "./i18n.ts";
import { INDEXABLE, PAPER, SITE_URL } from "./site.ts";

export function pageMeta(o: { lang: Lang; path: string; title?: string; description?: string; image?: string | null; article?: Story }): Metadata {
  const name = PAPER[o.lang].name;
  const title = o.title ? `${o.title} | ${name}` : `${name}: ${PAPER[o.lang].tagline}`;
  const description = o.description || (o.lang === "gu" ? "ગાંધીનગરનું ગુજરાતી દૈનિક: ગુજરાત, દેશ અને વિશ્વના સમાચાર, ઈ-પેપર અને જૂના અંકો."
    : "The Gujarati daily from Gandhinagar: news of Gujarat, India and the world, the e-paper and past issues.");
  const url = `${SITE_URL}${href(o.lang, o.path)}`;
  const image = o.image ?? `${SITE_URL}/og.png`;
  return {
    metadataBase: new URL(SITE_URL),
    title, description,
    alternates: { canonical: url, languages: { gu: `${SITE_URL}${href("gu", o.path)}`, en: `${SITE_URL}${href("en", o.path)}` },
                  types: { "application/rss+xml": `${SITE_URL}${o.lang === "en" ? "/en" : ""}/rss.xml` } },
    robots: INDEXABLE ? { index: true, follow: true, "max-image-preview": "large" } : { index: false, follow: false },
    openGraph: {
      type: o.article ? "article" : "website", url, title: o.title ?? name, description, siteName: name, locale: o.lang === "gu" ? "gu_IN" : "en_IN",
      images: [{ url: image }],
      ...(o.article ? { publishedTime: o.article.publishedAt, modifiedTime: o.article.updatedAt } : {}),
    },
    twitter: { card: "summary_large_image", title: o.title ?? name, description, images: [image] },
    icons: { icon: "/icon.png", apple: "/icon.png" },
  };
}
