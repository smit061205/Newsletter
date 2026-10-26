"use client";
// The frame's moving parts (DESIGN.md §3.1): the sticky header's buttons, the
// menu sheet (search, sections, settings), and the phone's bottom bar.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../lib/types.ts";
import { Archive, Chev, Clock, CloseIcon, HomeIcon, MenuIcon, Paper, SearchIcon } from "./icons.tsx";

export interface ChromeProps {
  lang: Lang;
  name: string;
  tagline: string;
  /** this page in each language, for the language switch */
  paths: { gu: string; en: string; hi: string };
  sections: { key: string; name: string; href: string }[];
  links: { home: string; latest: string; epaper: string; archive: string; search: string; saved: string; about: string; how: string; policy: string; corrections: string; contact: string };
  words: Record<"menu" | "sections" | "search" | "close" | "epaper" | "home" | "latest" | "latestTitle" | "archive" | "searchPlaceholder" | "settings" | "theme" |
                 "themeAuto" | "light" | "dark" | "size" | "language" | "services" | "about" | "savedTitle" | "fHow" | "fPolicy" | "fFix" | "fContact", string>;
  /** the phone's bottom bar (articles have their own reading bar instead) */
  bottomBar: boolean;
  active?: "home" | "latest" | "epaper" | "archive";
}

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

export function applyTheme(v: string) {
  const r = document.documentElement;
  if (v === "light" || v === "dark") r.setAttribute("data-theme", v); else r.removeAttribute("data-theme");
}
export function applySize(n: string) {
  const r = document.documentElement;
  if (n === "2" || n === "3") r.setAttribute("data-size", n); else r.removeAttribute("data-size");
}

export default function Chrome(p: ChromeProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("auto");
  const [size, setSize] = useState("1");
  const [away, setAway] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const q = useRef<HTMLInputElement>(null);
  const w = p.words;

  useEffect(() => { setTheme(read("ck-theme", "auto")); setSize(read("ck-size", "1")); }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  // the header settles (smaller, with a shadow) once the page moves
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!p.bottomBar) return;
    let last = window.scrollY;
    const on = () => { const y = window.scrollY; setAway(y > last && y > 200); last = y; };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [p.bottomBar]);

  const openMenu = (search: boolean) => { setOpen(true); if (search) setTimeout(() => q.current?.focus(), 30); };
  const seg = (name: string, opts: [string, React.ReactNode][], cur: string, on: (v: string) => void) => (
    <div className="seg" role="group" aria-label={name}>
      {opts.map(([v, label]) => <button key={v} type="button" aria-pressed={cur === v} onClick={() => on(v)}>{label}</button>)}
    </div>
  );

  return (
    <>
      <header className={`top${scrolled ? " scrolled" : ""}`}>
        <div className="wrap bar">
          <div className="l">
            <button type="button" className="ib menu-plain" aria-label={w.menu} onClick={() => openMenu(false)}><MenuIcon /></button>
            <button type="button" className="ib lbl" onClick={() => openMenu(false)}><MenuIcon /><span>{w.sections}</span></button>
          </div>
          <Link className="wm" href={p.links.home}><b>{p.name}</b><i>{p.tagline}</i></Link>
          <div className="r">
            <button type="button" className="ib" aria-label={w.search} onClick={() => openMenu(true)}><SearchIcon /></button>
            <Link className="epill" href={p.links.epaper}>{w.epaper}</Link>
          </div>
        </div>
      </header>

      {open && <div className="shade" onClick={() => setOpen(false)} />}
      <aside className="sheet" hidden={!open} aria-label={w.menu}>
        <div className="x"><b>{p.name}</b><button type="button" className="ib" aria-label={w.close} onClick={() => setOpen(false)}><CloseIcon /></button></div>
        <form className="search" role="search" action={p.links.search} method="get" onSubmit={() => setOpen(false)}>
          <SearchIcon /><input ref={q} id="q" name="q" type="search" placeholder={w.searchPlaceholder} aria-label={w.searchPlaceholder} autoComplete="off" />
        </form>
        <Link className="srow" href={p.links.home} onClick={() => setOpen(false)}>{w.home}</Link>
        <Link className="srow" href={p.links.latest} onClick={() => setOpen(false)}>{w.latestTitle}</Link>
        {p.sections.map((s) => (
          <Link key={s.key} className="srow" href={s.href} onClick={() => setOpen(false)}>{s.name}<span className="chev"><Chev /></span></Link>
        ))}
        <h3>{w.services}</h3>
        <div className="links">
          <Link href={p.links.epaper} onClick={() => setOpen(false)}>{w.epaper}</Link>
          <Link href={p.links.archive} onClick={() => setOpen(false)}>{w.archive}</Link>
          <Link href={p.links.saved} onClick={() => setOpen(false)}>{w.savedTitle}</Link>
        </div>
        <h3>{w.settings}</h3>
        <div className="setl">{w.theme}</div>
        {seg(w.theme, [["auto", w.themeAuto], ["light", w.light], ["dark", w.dark]], theme, (v) => { setTheme(v); write("ck-theme", v); applyTheme(v); })}
        <div className="setl">{w.size}</div>
        {seg(w.size, [["1", <span key="1" style={{ fontSize: 14 }}>અ</span>], ["2", <span key="2" style={{ fontSize: 17 }}>અ</span>], ["3", <span key="3" style={{ fontSize: 20 }}>અ</span>]],
             size, (v) => { setSize(v); write("ck-size", v); applySize(v); })}
        <div className="setl">{w.language}</div>
        <div className="seg" role="group" aria-label={w.language}>
          <Link className="seglink" href={p.paths.gu} aria-current={p.lang === "gu" ? "true" : undefined} hrefLang="gu">ગુજરાતી</Link>
          <Link className="seglink" href={p.paths.hi} aria-current={p.lang === "hi" ? "true" : undefined} hrefLang="hi">हिंदी</Link>
          <Link className="seglink" href={p.paths.en} aria-current={p.lang === "en" ? "true" : undefined} hrefLang="en">English</Link>
        </div>
        <h3>{w.about}</h3>
        <div className="links">
          <Link href={p.links.how}>{w.fHow}</Link><Link href={p.links.policy}>{w.fPolicy}</Link>
          <Link href={p.links.corrections}>{w.fFix}</Link><Link href={p.links.contact}>{w.fContact}</Link><Link href={p.links.about}>{w.about}</Link>
        </div>
      </aside>

      {p.bottomBar && (
        <nav className={`bnav${away ? " away" : ""}`} aria-label={w.menu}>
          <Link href={p.links.home} className={p.active === "home" ? "on" : ""}><HomeIcon />{w.home}</Link>
          <Link href={p.links.latest} className={p.active === "latest" ? "on" : ""}><Clock />{w.latest}</Link>
          <Link href={p.links.epaper} className={p.active === "epaper" ? "on" : ""}><Paper />{w.epaper}</Link>
          <Link href={p.links.archive} className={p.active === "archive" ? "on" : ""}><Archive />{w.archive}</Link>
          <button type="button" onClick={() => openMenu(false)}><MenuIcon />{w.sections}</button>
        </nav>
      )}
    </>
  );
}
