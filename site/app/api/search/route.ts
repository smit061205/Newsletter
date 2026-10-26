// Results as the reader types (the menu's search box): up to eight stories'
// headlines in the reader's language, kept a minute at the edge.
import { search } from "@/lib/db.ts";
import { words } from "@/components/cards.tsx";
import { dateText } from "@/lib/format.ts";
import type { Lang } from "@/lib/types.ts";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().slice(0, 80);
  const lang = (["gu", "en", "hi"].includes(u.searchParams.get("lang") ?? "") ? u.searchParams.get("lang") : "gu") as Lang;
  if (q.length < 2) return Response.json({ stories: [] });
  const found = (await search(q, 8)).map((s) => ({ id: s.id, headline: words(s, lang).headline, when: dateText(s.publishedAt, lang) }));
  return Response.json({ stories: found }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
