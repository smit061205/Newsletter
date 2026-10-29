import { Section } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { GENRES, sectionName, TIERS } from "@/lib/sections.ts";

// a region on one subject, "ગુજરાત › ખેતી" (ROADMAP §4)
export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return TIERS.flatMap((key) => GENRES.map((sub) => ({ key, sub }))); }
export async function generateMetadata({ params }: { params: Promise<{ key: string; sub: string }> }) {
  const { key, sub } = await params;
  return pageMeta({ lang: "gu", path: `/section/${key}/${sub}`, title: `${sectionName(key, "gu")} › ${sectionName(sub, "gu")}` });
}
export default async function Page({ params }: { params: Promise<{ key: string; sub: string }> }) {
  const { key, sub } = await params;
  return <Section k={key} sub={sub} lang="gu" />;
}
