import { FlBeat, flMeta } from "@/views/Flagship.tsx";
import { BEATS, isBeat, beatName } from "@/lib/flagship.ts";

export const revalidate = 600;
export const dynamicParams = false;
export function generateStaticParams() { return BEATS.map((beat) => ({ beat })); }
export async function generateMetadata({ params }: { params: Promise<{ beat: string }> }) {
  const { beat } = await params;
  return flMeta("en", `/${beat}`, { title: isBeat(beat) ? beatName(beat, "en") : undefined });
}
export default async function Page({ params }: { params: Promise<{ beat: string }> }) { return <FlBeat lang="en" beat={(await params).beat} />; }
