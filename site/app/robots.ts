import type { MetadataRoute } from "next";
import { INDEXABLE, SITE_URL } from "@/lib/site.ts";

// The free Vercel address stays out of search engines until the paper's own
// domain points here (lib/site.ts); then everything but search and the API is open.
export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/search", "/en/search", "/saved", "/en/saved"] },
           sitemap: [`${SITE_URL}/sitemap.xml`, `${SITE_URL}/news-sitemap.xml`] };
}
