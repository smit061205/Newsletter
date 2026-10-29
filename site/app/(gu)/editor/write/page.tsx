// The editor's own news, with photos, put on the site at once (Write.tsx); ?for=aavtikal, an Aavtikal article of their own.
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import s from "../editor.module.css";
import { W } from "../words.ts";
import Write from "../Write.tsx";
import { COOKIE, editorOf } from "@/lib/editor.ts";
import { BEATS, beatName } from "@/lib/flagship.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "સંપાદક | કેપિટલ ક્રાંતિ", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string; for?: string }> }) {
  const q = await searchParams;
  const lang = q.lang === "en" ? "en" : "gu";
  const av = q.for === "aavtikal";
  const w = W[lang];
  const back = lang === "en" ? "lang=en" : "";
  if (!editorOf((await cookies()).get(COOKIE)?.value)) redirect(`/editor${back ? `?${back}` : ""}`);
  return (
    <main className={s.page} lang={lang === "en" ? "en" : undefined}>
      <header className={s.top}>
        <h1>{av ? w.avWriteTitle : w.writeTitle}</h1>
        <Link href={`/editor${back ? `?${back}` : ""}#${av ? "aavtikal" : "news"}`}>← {w.back}</Link>
      </header>
      {av ? <Write lang={lang} back={back} kind="aavtikal" beats={BEATS.map((b) => ({ key: b, name: beatName(b, lang) }))} />
          : <Write lang={lang} back={back} />}
    </main>
  );
}
