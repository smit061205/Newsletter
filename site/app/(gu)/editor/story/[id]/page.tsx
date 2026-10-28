import type { Metadata } from "next";
import Change from "../../Change.tsx";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "સંપાદક | કેપિટલ ક્રાંતિ", robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lang?: string; missing?: string }> }) {
  return <Change kind="story" id={decodeURIComponent((await params).id)} q={await searchParams} />;
}
