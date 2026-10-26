"use client";
// How far through the story the reader is: a bar under the header that fills
// as the article's text scrolls past (from its headline to its source box).
import { useEffect, useState } from "react";

export default function ReadProgress({ target }: { target: string }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = document.querySelector(target);
    if (!el) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight * 0.6;
        setP(Math.max(0, Math.min(1, -r.top / Math.max(1, total))));
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [target]);
  return <div className="readprog" aria-hidden="true"><span style={{ transform: `scaleX(${p})` }} /></div>;
}
