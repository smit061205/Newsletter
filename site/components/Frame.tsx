// Every page's frame (DESIGN.md §3.1): the header and menu (Chrome), the
// section scroller, the page, the footer.
import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import type { Lang } from "../lib/types.ts";
import { href, t } from "../lib/i18n.ts";
import { SECTIONS, sectionName } from "../lib/sections.ts";
import { flw } from "../lib/flagship.ts";
import { PAPER } from "../lib/site.ts";
import { num } from "../lib/format.ts";
import Chrome from "./Chrome.tsx";
import LangLink from "./LangLink.tsx";
import NavProgress from "./NavProgress.tsx";
import ServiceWorker from "./ServiceWorker.tsx";
import ToTop from "./ToTop.tsx";

export interface FrameProps {
  lang: Lang;
  /** this page's path without the language prefix, e.g. "/news/p2326794" */
  path: string;
  /** the section the page belongs to, underlined in the scroller */
  section?: string;
  active?: "home" | "latest" | "epaper" | "archive";
  /** articles carry their own reading bar on a phone */
  bottomBar?: boolean;
  children: React.ReactNode;
}

export default function Frame({ lang, path, section, active, bottomBar = true, children }: FrameProps) {
  const L = (p: string) => href(lang, p);
  const words = Object.fromEntries((["menu", "sections", "search", "close", "epaper", "home", "latest", "latestTitle", "archive", "searchPlaceholder",
    "settings", "size", "language", "services", "about", "savedTitle", "fHow", "fPolicy", "fFix", "fContact", "editorPage"] as const)
    .map((k) => [k, t(lang, k)])) as Parameters<typeof Chrome>[0]["words"];
  return (
    <>
      <a className="skip" href="#main">{t(lang, "skip")}</a>
      <Suspense fallback={null}><NavProgress /></Suspense>
      <Chrome
        lang={lang} name={PAPER.gu.name} tagline={PAPER[lang].tagline} words={words} bottomBar={bottomBar} active={active}
        paths={{ gu: href("gu", path), en: href("en", path), hi: href("hi", path) }}
        sections={[...SECTIONS.map((k) => ({ key: k, name: sectionName(k, lang), href: L(`/section/${k}`) })), { key: "aavtikal", name: flw(lang).name, href: L("/aavtikal") }]}
        links={{ home: L("/"), latest: L("/latest"), epaper: L("/epaper"), archive: L("/archive"), search: L("/search"), saved: L("/saved"),
                 about: L("/about"), how: L("/how-we-check"), policy: L("/editorial-policy"), corrections: L("/corrections"), contact: L("/contact") }}
      />
      <nav className="wrap secs" aria-label={t(lang, "sections")}>
        {SECTIONS.map((k) => <Link key={k} href={L(`/section/${k}`)} className={section === k ? "on" : undefined}>{sectionName(k, lang)}</Link>)}
        {/* the flagship section (views/Flagship.tsx), set apart at the end */}
        <Link href={L("/aavtikal")} className="fl">{flw(lang).name}</Link>
      </nav>
      {/* the page's content crossfades into the next one (the header and footer stay put) */}
      <ViewTransition enter="page-in" exit="page-out" default="none">
        <main className="wrap" id="main" tabIndex={-1}>{children}</main>
      </ViewTransition>
      <ToTop label={t(lang, "toTop")} />
      <ServiceWorker />
      <div className="foot"><div className="wrap">
        <footer>
          <Link className="wm" href={L("/")}><b>{PAPER.gu.name}</b></Link>
          <div className="fcols">
            <div><b>{t(lang, "f1")}</b><Link href={L("/about")}>{t(lang, "fAbout")}</Link><Link href={L("/editorial-policy")}>{t(lang, "fPolicy")}</Link>
              <Link href={L("/how-we-check")}>{t(lang, "fHow")}</Link><Link href={L("/corrections")}>{t(lang, "fFix")}</Link><Link href={L("/contact")}>{t(lang, "fContact")}</Link></div>
            <div><b>{t(lang, "f2")}</b>{SECTIONS.slice(0, 6).map((k) => <Link key={k} href={L(`/section/${k}`)}>{sectionName(k, lang)}</Link>)}<Link href={L("/aavtikal")}>{flw(lang).name}</Link></div>
            <div><b>{t(lang, "f3")}</b><Link href={L("/epaper")}>{t(lang, "epaper")}</Link><Link href={L("/archive")}>{t(lang, "archive")}</Link>
              <a href={lang === "gu" ? "/rss.xml" : `/${lang}/rss.xml`}>{t(lang, "fRss")}</a></div>
            <div><b>{t(lang, "f4")}</b><Link href={L("/terms")}>{t(lang, "fTerms")}</Link><Link href={L("/privacy")}>{t(lang, "fPrivacy")}</Link>
              {(["gu", "hi", "en"] as const).filter((l) => l !== lang).map((l) => (
                <LangLink key={l} to={l} href={href(l, path)} hrefLang={l}>{{ gu: "ગુજરાતી", hi: "हिंदी", en: "English" }[l]}</LangLink>))}</div>
          </div>
          <p className="legal">© {num(PAPER.founded, lang)}–{num(new Date().getFullYear(), lang)} {PAPER[lang].name}, {PAPER[lang].place} · RNI {PAPER.rni}</p>
        </footer>
      </div></div>
    </>
  );
}

/** Runs before the first paint: the reader's text size, so nothing jumps. The site is light only
 *  (the user, 29 Oct); a theme saved by its old switch is forgotten, so Aavtikal, the one part
 *  with a dark look, simply follows the phone. */
export const PREPAINT = `try{var s=localStorage.getItem("ck-size"),r=document.documentElement;localStorage.removeItem("ck-theme");var t=localStorage.getItem("fl-theme");if(t==="light"||t==="dark")r.setAttribute("data-theme",t);` +
  `if(s==="2"||s==="3")r.setAttribute("data-size",s)}catch(e){}`;
