"use client";
// An article's two actions: send it on WhatsApp, copy its link.
import { useEffect, useState } from "react";
import s from "./fl.module.css";
import { LinkIcon, WhatsApp } from "../icons.tsx";

export default function Share({ url, headline, words: w }: { url: string; headline: string; words: { share: string; copy: string; copied: string } }) {
  const [done, setDone] = useState(false);
  useEffect(() => { if (!done) return; const k = setTimeout(() => setDone(false), 2200); return () => clearTimeout(k); }, [done]);
  const copy = () => { navigator.clipboard?.writeText(url).then(() => setDone(true), () => {}); };
  return (
    <div className={s.actions}>
      <a className={s.actBtn} href={`https://wa.me/?text=${encodeURIComponent(`${headline}\n${url}`)}`} target="_blank" rel="noopener"><WhatsApp />{w.share}</a>
      <button className={s.actBtn} onClick={copy} aria-live="polite"><LinkIcon />{done ? w.copied : w.copy}</button>
    </div>
  );
}
