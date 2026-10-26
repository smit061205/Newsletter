"use client";
// The thin bar across the top while a page is on its way (as news sites do):
// it starts the moment a link inside the site is pressed, creeps towards the
// end while the server answers, and finishes when the new page is shown.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function NavProgress() {
  const path = usePathname();
  const query = useSearchParams();
  const [w, setW] = useState(0);
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setOn(true); setW(12);
      if (timer.current) clearInterval(timer.current);
      // a little further each tick, never quite to the end until the page arrives
      timer.current = setInterval(() => setW((x) => (x < 90 ? x + (90 - x) * 0.12 : x)), 200);
    };
    document.addEventListener("click", start, true);
    return () => document.removeEventListener("click", start, true);
  }, []);

  useEffect(() => {
    if (!on) return;
    if (timer.current) clearInterval(timer.current);
    setW(100);
    const k = setTimeout(() => { setOn(false); setW(0); }, 320);
    return () => clearTimeout(k);
  // the page has changed: finish
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, query]);

  return <div className={`navbar${on ? " on" : ""}`} style={{ transform: `scaleX(${w / 100})` }} aria-hidden="true" />;
}
