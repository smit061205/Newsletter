// Aavtikal's frame: the fixed two-row header (the beats as tabs, then the bar), the
// menu, and the footer with the name across the page (FLAGSHIP.md §2.1-2.3, §2.11).
import Link from "next/link";
import s from "./fl.module.css";
import Look from "./Look.tsx";
import Menu from "./Menu.tsx";
import { SearchIcon } from "../icons.tsx";
import type { Lang } from "../../lib/types.ts";
import { href } from "../../lib/i18n.ts";
import { BEATS, beatName, flw, type Beat } from "../../lib/flagship.ts";
import { PAPER } from "../../lib/site.ts";
import { num } from "../../lib/format.ts";

/** A flagship path in the reader's language: fl("en", "/ai") → /en/aavtikal/ai. */
export const fl = (lang: Lang, path = "") => href(lang, `/aavtikal${path}`);

const LANGS: { lang: Lang; name: string }[] = [{ lang: "gu", name: "ગુજરાતી" }, { lang: "en", name: "English" }, { lang: "hi", name: "हिन्दी" }];

/** The name, stretched to the full width it's given. */
export function Wordmark({ lang, cls }: { lang: Lang; cls: string }) {
  return (
    <div className={cls}>
      {/* 30 units above the line's top: the Gujarati and Hindi vowel signs over the letters
          (ી, ि) rise to 18 above it, where the fixed header used to cut them off */}
      <svg viewBox="0 -30 1000 265" role="img" aria-label={flw(lang).name}>
        <text x="0" y="198" fontSize="232" textLength="1000" lengthAdjust="spacingAndGlyphs">{flw(lang).name}</text>
      </svg>
    </div>
  );
}

export default function Frame({ lang, beat, path, children }: { lang: Lang; beat?: Beat; path: string; children: React.ReactNode }) {
  const w = flw(lang);
  return (
    <div className={`${s.root} ${beat ? s[beat] : ""}`}>
      <a className="skip" href="#main">{{ gu: "મુખ્ય લેખ પર જાઓ", en: "Skip to the articles", hi: "मुख्य लेखों पर जाएँ" }[lang]}</a>
      <header className={s.hdr}>
        <nav className={s.tabs} aria-label={w.name}>
          <Link className={`${s.tab} ${s.tabHome} ${!beat && path === "" ? s.tabOn : ""}`} href={fl(lang)}>{w.home}</Link>
          {BEATS.map((b) => (
            <Link key={b} className={`${s.tab} ${s[b]} ${beat === b ? s.tabOn : ""}`} href={fl(lang, `/${b}`)} aria-current={beat === b ? "page" : undefined}>{beatName(b, lang)}</Link>
          ))}
          <Link className={`${s.tab} ${s.tabEnd}`} href={fl(lang, "/search")} aria-label={w.search}><span className={s.iconBtn} style={{ margin: 0 }}><SearchIcon /></span></Link>
        </nav>
        <div className={`${s.bar} ${beat ? s.barBeat : ""}`}>
          <Link className={s.brand} href={fl(lang)}>
            <span className={s.brandMark}>{w.name}</span>
            {beat && <span className={s.brandBeat}>/ {beatName(beat, lang)}</span>}
          </Link>
          <div className={s.barR}>
            <Link className={s.hideS} href={href(lang, "/")}>{w.daily}</Link>
            <a className={`${s.pill} ${s.hideS}`} href="#join">{w.join}</a>
            <Menu label={w.menu} close={w.close}>
              <div className={s.dGroup}>
                <Link className={s.dBig} href={fl(lang)} aria-current={!beat && path === "" ? "page" : undefined}>{w.home}</Link>
                {BEATS.map((b) => <Link key={b} className={s.dBig} href={fl(lang, `/${b}`)} aria-current={beat === b ? "page" : undefined}>{beatName(b, lang)}</Link>)}
              </div>
              <div className={s.dGroup}>
                <Link className={s.dSmall} href={fl(lang, "/search")}>{w.search}</Link>
                <Link className={s.dSmall} href={fl(lang, "/author/desk")}>{w.writers}</Link>
                <Link className={s.dSmall} href={href(lang, "/")}>{w.daily}</Link>
                <a className={s.dSmall} href={lang === "en" ? "/editor?lang=en" : "/editor"}>{w.editor}</a>
              </div>
              <div className={s.dGroup}>
                <Look label={w.look} names={[w.lookAuto, w.lookLight, w.lookDark]} />
              </div>
              <div className={s.dGroup}>
                {LANGS.map((l) => <Link key={l.lang} className={s.dSmall} href={fl(l.lang, path)} lang={l.lang} aria-current={l.lang === lang ? "true" : undefined}>{l.name}</Link>)}
              </div>
            </Menu>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className={s.foot}>
        <Wordmark lang={lang} cls={s.footMark} />
        <div className={s.footRow}>
          <nav aria-label={w.name}>
            {BEATS.map((b) => <Link key={b} href={fl(lang, `/${b}`)}>{beatName(b, lang)}</Link>)}
            <Link href={href(lang, "/")}>{w.daily}</Link>
          </nav>
          <nav aria-label={PAPER[lang].name}>
            <Link href={href(lang, "/about")}>{w.about}</Link>
            <Link href={href(lang, "/editorial-policy")}>{w.policy}</Link>
            <Link href={href(lang, "/how-we-check")}>{w.how}</Link>
            <Link href={href(lang, "/contact")}>{w.contact}</Link>
          </nav>
        </div>
        <div className={`${s.footRow} ${s.footSmall}`}>© {num(2026, lang)} {PAPER[lang].name}</div>
      </footer>
    </div>
  );
}
