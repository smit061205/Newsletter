import { Section } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { SECTIONS, sectionName } from "@/lib/sections.ts";

export const revalidate = 3600;
export const dynamicParams = false;
export function generateStaticParams() { return SECTIONS.map((key) => ({ key })); }
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key;
  return pageMeta({ lang: "en", path: `/section/${key}`, title: sectionName(key, "en") });
}
export default async function Page({ params }: { params: Promise<{ key: string }> }) { return <Section k={(await params).key} lang="en" />; }
