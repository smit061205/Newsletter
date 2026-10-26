import Policy, { POLICY } from "@/views/Policy.tsx";
import { pageMeta } from "@/lib/meta.ts";

export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(POLICY).map((page) => ({ page })); }
export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const page = (await params).page;
  return pageMeta({ lang: "hi", path: `/${page}`, title: POLICY[page]?.["hi"].title });
}
export default async function Page({ params }: { params: Promise<{ page: string }> }) { return <Policy page={(await params).page} lang="hi" />; }
