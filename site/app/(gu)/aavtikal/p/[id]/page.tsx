import { FlArticle, flMeta } from "@/views/Flagship.tsx";

export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() { return []; }
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return flMeta("gu", `/p/${id}`, { id });
}
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <FlArticle lang="gu" id={(await params).id} />; }
