// The editor's own news, with photos, put on the site at once (Write.tsx).
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import s from "../editor.module.css";
import { W } from "../words.ts";
import Write from "../Write.tsx";
import { COOKIE, editorOf } from "@/lib/editor.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "સંપાદક | કેપિટલ ક્રાંતિ", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = (await searchParams).lang === "en" ? "en" : "gu";
  const w = W[lang];
  const back = lang === "en" ? "lang=en" : "";
  if (!editorOf((await cookies()).get(COOKIE)?.value)) redirect(`/editor${back ? `?${back}` : ""}`);
  return (
    <main className={s.page} lang={lang === "en" ? "en" : undefined}>
      <header className={s.top}>
        <h1>{w.writeTitle}</h1>
        <Link href={`/editor${back ? `?${back}` : ""}#news`}>← {w.back}</Link>
      </header>
      <Write lang={lang} back={back} />
    </main>
  );
}
