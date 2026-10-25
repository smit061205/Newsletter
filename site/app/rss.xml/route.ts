import { latestStories } from "@/lib/db.ts";
import { rss } from "@/lib/feeds.ts";

export const revalidate = 3600;
export async function GET() {
  return new Response(rss(await latestStories(50), "gu"), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
