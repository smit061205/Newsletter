"use client";
// Aavtikal's light or dark look (the user, 29 Oct: dark is Aavtikal's alone; the main
// site stays light). "Match phone" follows the phone's own setting; a choice is kept on
// this device and stamped on the page before it paints (PREPAINT in ../Frame.tsx).
import { useEffect, useState } from "react";
import s from "./fl.module.css";

const KEYS = ["auto", "light", "dark"] as const;
type Look = (typeof KEYS)[number];

export default function Look({ label, names }: { label: string; names: [string, string, string] }) {
  const [look, setLook] = useState<Look>("auto");
  useEffect(() => {
    try {
      const t = localStorage.getItem("fl-theme");
      if (t === "light" || t === "dark") setLook(t);
    } catch {}
  }, []);
  const choose = (t: Look) => {
    setLook(t);
    const r = document.documentElement;
    if (t === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t);
    try { if (t === "auto") localStorage.removeItem("fl-theme"); else localStorage.setItem("fl-theme", t); } catch {}
  };
  return (
    <div role="group" aria-label={label}>
      <p className={s.dLabel}>{label}</p>
      <div className={s.look}>
        {KEYS.map((k, i) => <button key={k} type="button" aria-pressed={look === k} onClick={() => choose(k)}>{names[i]}</button>)}
      </div>
    </div>
  );
}
