import { FlAuthor, flMeta } from "@/views/Flagship.tsx";
import { AUTHORS, isAuthor } from "@/lib/flagship.ts";

export const revalidate = 600;
export const dynamicParams = false;
export function generateStaticParams() { return Object.keys(AUTHORS).map((key) => ({ key })); }
export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return flMeta("gu", `/author/${key}`, { title: isAuthor(key) ? AUTHORS[key].name["gu"] : undefined });
}
export default async function Page({ params }: { params: Promise<{ key: string }> }) { return <FlAuthor lang="gu" author={(await params).key} />; }
