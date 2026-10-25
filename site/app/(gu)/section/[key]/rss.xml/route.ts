import { storiesIn } from "@/lib/db.ts";
import { rss } from "@/lib/feeds.ts";
import { PAPER } from "@/lib/site.ts";
import { SECTIONS, isSection, sectionName } from "@/lib/sections.ts";

export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return SECTIONS.map((key) => ({ key })); }
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key;
  if (!isSection(key)) return new Response("not found", { status: 404 });
  return new Response(rss(await storiesIn(key, 50), "gu", `${PAPER.gu.name}: ${sectionName(key, "gu")}`),
                      { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
