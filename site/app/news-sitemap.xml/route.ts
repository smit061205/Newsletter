import { sitemapEntries } from "@/lib/db.ts";
import { newsSitemap } from "@/lib/feeds.ts";

export const revalidate = 3600;
export async function GET() {
  return new Response(newsSitemap(await sitemapEntries(2)), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
