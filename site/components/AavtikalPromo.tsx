"use client";
// Aavtikal in a corner of Capital Kranti's front page (the user, 29 Oct: "advertise Aavtikal", then "not this big:
// small one at the end or at any corner"): a small card at the bottom left, in Aavtikal's own look (its near-black
// ground, the four beats' colours as a strip, its compressed letters), with its newest article and a link in. It
// comes in once the reader has scrolled past the top story (on a phone it would cover it); closed, it stays away on
// that phone or computer for three days.
import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "ck_av_corner";
const AWAY = 3 * 24 * 3600_000;
const BEATS = ["ai", "tech", "science", "politics"] as const;

export interface CornerArticle { href: string; headline: string; beat: string; beatName: string; lang: string }

export default function AavtikalPromo({ name, by, cta, close, home, article }:
  { name: string; by: string; cta: string; close: string; home: string; article: CornerArticle | null }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try { if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < AWAY) return; } catch { /* shown anyway */ }
    const past = () => { if (scrollY > innerHeight * 0.6) { setShown(true); removeEventListener("scroll", past); } };
    addEventListener("scroll", past, { passive: true });
    past();
    return () => removeEventListener("scroll", past);
  }, []);
  const shut = () => {
    setShown(false);
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* closed for this visit */ }
  };
  return (
    <aside className={`avc${shown ? " on" : ""}`} aria-label={name} aria-hidden={!shown} inert={!shown}>
      <div className="avc-strip" aria-hidden="true">{BEATS.map((b) => <i key={b} className={`b-${b}`} />)}</div>
      <button type="button" className="avc-x" onClick={shut} aria-label={close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <Link className="avc-in" href={article?.href ?? home}>
        <span className="avc-by">{by}</span>
        <span className="avc-name">{name}</span>
        {article && <>
          <span className={`avc-tag b-${article.beat}`}>{article.beatName}</span>
          <span className="avc-hl" lang={article.lang}>{article.headline}</span>
        </>}
        <span className="avc-cta">{cta} →</span>
      </Link>
    </aside>
  );
}
