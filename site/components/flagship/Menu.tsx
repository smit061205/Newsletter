"use client";
// Aavtikal's menu: a drawer from the right over a shade (FLAGSHIP.md §2.2), closed by
// the ×, the shade or Escape; the page underneath doesn't scroll while it's open.
import { useEffect, useRef, useState } from "react";
import s from "./fl.module.css";
import { CloseIcon, MenuIcon } from "../icons.tsx";

export default function Menu({ label, close, children }: { label: string; close: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", key);
    document.documentElement.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => { document.removeEventListener("keydown", key); document.documentElement.style.overflow = ""; };
  }, [open]);
  return (
    <>
      <button className={s.iconBtn} aria-label={label} aria-expanded={open} aria-controls="fl-menu" onClick={() => setOpen(true)}><MenuIcon /></button>
      <div className={`${s.shade} ${open ? s.open : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav id="fl-menu" className={`${s.drawer} ${open ? s.open : ""}`} aria-label={label} onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
        <div className={s.drawerTop}><button ref={closeBtn} className={s.iconBtn} aria-label={close} onClick={() => setOpen(false)}><CloseIcon /></button></div>
        {children}
      </nav>
    </>
  );
}
