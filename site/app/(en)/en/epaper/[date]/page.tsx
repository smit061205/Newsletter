import { Epaper } from "@/views/Lists.tsx";
import { pageMeta } from "@/lib/meta.ts";
import { t } from "@/lib/i18n.ts";
import { dateText } from "@/lib/format.ts";

export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }
export async function generateMetadata({ params }: { params: Promise<{ date: string }> }) {
  const date = (await params).date;
  return pageMeta({ lang: "en", path: `/epaper/${date}`, title: `${t("en", "epaper")}: ${dateText(date, "en")}` });
}
export default async function Page({ params }: { params: Promise<{ date: string }> }) { return <Epaper date={(await params).date} lang="en" />; }
