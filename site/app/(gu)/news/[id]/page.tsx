import Article from "@/views/Article.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { storyById } from "@/lib/db.ts";
import { words } from "@/components/cards.tsx";

export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const s = await storyById((await params).id);
  if (!s) return pageMeta({ lang: "gu", path: "/" });
  const w = words(s, "gu");
  return pageMeta({ lang: "gu", path: `/news/${s.id}`, title: w.headline, description: w.deck || w.body.slice(0, 160), image: s.photo?.url, article: s });
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <Article id={(await params).id} lang="gu" />; }
