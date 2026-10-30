"use client";
// Breaking news across the top of every page (DESIGN.md §3.1, "breaking bar"; ROADMAP §4): the story the engine
// scored 9.5 or more in the last three hours. Closed, that story's bar stays away on this phone; it goes by itself
// when the three hours are up, even on a page kept from earlier.
import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "ck-brk";

export default function BreakingBar({ id, headline, href, until, label, close }:
  { id: string; headline: string; href: string; until: number; label: string; close: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === id) { setOn(false); return; } } catch { /* shown */ }
    const left = until - Date.now();
    if (left <= 0) { setOn(false); return; }
    const t = setTimeout(() => setOn(false), left);
    return () => clearTimeout(t);
  }, [id, until]);
  if (!on) return null;
  return (
    <div className="breaking" role="region" aria-label={label}>
      <div className="wrap">
        <b>{label}:</b>
        <Link prefetch={false} href={href}>{headline}</Link>
        <button type="button" aria-label={close} onClick={() => { setOn(false); try { localStorage.setItem(KEY, id); } catch { /* closed for now */ } }}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
