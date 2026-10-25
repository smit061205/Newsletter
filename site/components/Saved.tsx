"use client";
// The reader's saved stories: kept in their own browser only (DESIGN.md §3.5).
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Lang } from "../lib/types.ts";

export default function Saved({ lang, empty }: { lang: Lang; empty: string }) {
  const [items, setItems] = useState<{ id: string; headline: string }[] | null>(null);
  useEffect(() => {
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem("ck-saved") ?? "[]"); } catch { /* none */ }
    if (!ids.length) { setItems([]); return; }
    fetch(`/api/stories?lang=${lang}&ids=${encodeURIComponent(ids.slice(0, 50).join(","))}`).then((r) => r.json())
      .then((d: { stories: { id: string; headline: string }[] }) => setItems(d.stories)).catch(() => setItems([]));
  }, [lang]);
  if (items === null) return null;
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <div className="stack">
      {items.map((s) => <Link key={s.id} className="h cmp" href={`${lang === "en" ? "/en" : ""}/news/${s.id}`}><div><h3 className="h4">{s.headline}</h3></div></Link>)}
    </div>
  );
}
