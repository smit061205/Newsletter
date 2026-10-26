"use client";
// The printed pages, read on a screen (as e-paper readers do): the pages as
// thumbnails; a tap opens one full screen, where a swipe or the arrow keys turn
// the page, a double tap (or the + button) zooms in to read and drag around,
// and Escape closes it.
import { useCallback, useEffect, useRef, useState } from "react";
import { num } from "../lib/format.ts";
import type { Lang } from "../lib/types.ts";

export interface EpPage { number: number; url: string; width: number; height: number; label: string }

export default function EpaperViewer({ pages, lang, words }: { pages: EpPage[]; lang: Lang; words: { open: string; close: string; prev: string; next: string; zoom: string } }) {
  const d = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const touch = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTap = useRef(0);

  const go = useCallback((k: number) => { setZoom(false); setI((x) => Math.max(0, Math.min(pages.length - 1, x + k))); }, [pages.length]);
  const open = (k: number) => { setI(k); setZoom(false); d.current?.showModal(); };

  useEffect(() => {
    const el = d.current;
    if (!el) return;
    const key = (e: KeyboardEvent) => { if (!el.open) return; if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [go]);
  // a new page starts at its top
  useEffect(() => { stage.current?.scrollTo({ top: 0, left: 0 }); }, [i, zoom]);

  const p = pages[i];
  return (
    <>
      <div className="g cards c4">
        {pages.map((pg, k) => (
          <button key={pg.number} type="button" className="eptile" onClick={() => open(k)} aria-label={`${words.open}: ${pg.label}`}>
            <span className="epg"><img src={pg.url} width={pg.width} height={pg.height} alt={pg.label} loading="lazy" decoding="async" /></span>
            <span className="epcap">{pg.label}</span>
          </button>
        ))}
      </div>
      <dialog ref={d} className="epview" aria-label={p?.label}>
        <div className="epbar">
          <span className="epcount">{num(i + 1, lang)} / {num(pages.length, lang)}</span>
          <span className="epbtns">
            <button type="button" className="lbbtn" aria-label={words.zoom} aria-pressed={zoom} onClick={() => setZoom((z) => !z)}>
              <svg className="i" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />{zoom ? <path d="M8 11h6" /> : <path d="M8 11h6M11 8v6" />}</svg>
            </button>
            <button type="button" className="lbbtn" aria-label={words.close} onClick={() => d.current?.close()}>
              <svg className="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        </div>
        <div ref={stage} className={`epstage${zoom ? " zoomed" : ""}`}
             onTouchStart={(e) => { const t0 = e.touches[0]; touch.current = { x: t0.clientX, y: t0.clientY, t: Date.now() }; }}
             onTouchEnd={(e) => {
               const s = touch.current; touch.current = null;
               if (!s) return;
               const t1 = e.changedTouches[0], dx = t1.clientX - s.x, dy = t1.clientY - s.y;
               // a quick sideways swipe turns the page (not while zoomed: then it pans)
               if (!zoom && Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy) && Date.now() - s.t < 600) { go(dx < 0 ? 1 : -1); return; }
               if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                 if (Date.now() - lastTap.current < 300) setZoom((z) => !z);
                 lastTap.current = Date.now();
               }
             }}
             onDoubleClick={() => setZoom((z) => !z)}>
          {p && <img key={p.url} src={p.url} width={p.width} height={p.height} alt={p.label} />}
        </div>
        <button type="button" className="epnav prev" aria-label={words.prev} disabled={i === 0} onClick={() => go(-1)}>
          <svg className="i" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg></button>
        <button type="button" className="epnav next" aria-label={words.next} disabled={i === pages.length - 1} onClick={() => go(1)}>
          <svg className="i" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></button>
      </dialog>
    </>
  );
}
