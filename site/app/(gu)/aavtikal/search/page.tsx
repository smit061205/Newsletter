import { FlSearch, flMeta } from "@/views/Flagship.tsx";
import { flw } from "@/lib/flagship.ts";

export const generateMetadata = async () => ({ ...(await flMeta("gu", "/search", { title: flw("gu").search })), robots: { index: false } });
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const q = (await searchParams).q;
  return <FlSearch lang="gu" q={(Array.isArray(q) ? q[0] : q ?? "").slice(0, 80)} />;
}
