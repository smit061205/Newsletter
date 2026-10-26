import { Search } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { t } from "@/lib/i18n.ts";

export const metadata = { ...pageMeta({ lang: "hi", path: "/search", title: t("hi", "searchTitle") }), robots: { index: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const q = (await searchParams).q;
  return <Search q={(Array.isArray(q) ? q[0] : q ?? "").slice(0, 80)} lang="hi" />;
}
