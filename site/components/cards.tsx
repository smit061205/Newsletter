// The cards and container heads of DESIGN.md §3.2-3.3, as server components.
import Link from "next/link";
import type { Lang, Story } from "../lib/types.ts";
import { href, t } from "../lib/i18n.ts";
import { sectionName } from "../lib/sections.ts";
import { timeText } from "../lib/format.ts";
import { Chev } from "./icons.tsx";

/** A story's words in the reader's language: its English or Hindi when it has one, else the Gujarati. */
export function words(s: Story, lang: Lang) {
  const e = lang === "en" ? s.en : lang === "hi" ? s.hi : null;
  return { kicker: e?.kicker || s.kicker, headline: e?.headline || s.headline, deck: e?.deck || s.deck,
           body: e?.body || s.body, caption: e?.caption || s.caption, translated: !!e };
}
const storyHref = (s: Story, lang: Lang) => href(lang, `/news/${s.id}`);

function Meta({ s, lang, sec = true }: { s: Story; lang: Lang; sec?: boolean }) {
  return (
    <div className="meta">
      {sec && <><span className="sec">{sectionName(s.tier, lang)}</span><span aria-hidden="true">·</span></>}
      <time dateTime={s.publishedAt}>{timeText(s.publishedAt, lang)}</time>
    </div>
  );
}

function Photo({ s, lang, cls = "ph", eager = false }: { s: Story; lang: Lang; cls?: string; eager?: boolean }) {
  if (!s.photo) return null;
  const w = words(s, lang);
  return <img className={cls} src={s.photo.url} width={s.photo.width} height={s.photo.height} alt={w.caption || w.headline}
              loading={eager ? "eager" : "lazy"} decoding="async" />;
}

export function Lead({ s, lang }: { s: Story; lang: Lang }) {
  const w = words(s, lang);
  return (
    <article className="lead">
      <Link className="h txt" href={storyHref(s, lang)}>
        {w.kicker && <span className="kick">{w.kicker}</span>}
        <h2 className="display">{w.headline}</h2>
        {w.deck && <p className="dek">{w.deck}</p>}
        <Meta s={s} lang={lang} />
      </Link>
      {s.photo && (
        <div className="pic">
          <Link href={storyHref(s, lang)} tabIndex={-1}><Photo s={s} lang={lang} eager /></Link>
          {w.caption && <p className="cap">{w.caption} ({t(lang, "photo")}: {s.source?.name ?? "PIB"})</p>}
        </div>
      )}
    </article>
  );
}

export function Std({ s, lang, sec = true }: { s: Story; lang: Lang; sec?: boolean }) {
  const w = words(s, lang);
  return (
    <Link className="h std" href={storyHref(s, lang)}>
      <Photo s={s} lang={lang} />
      <div><h3 className="h3">{w.headline}</h3>{w.deck && <p className="dek">{w.deck}</p>}<Meta s={s} lang={lang} sec={sec} /></div>
      {s.photo && <Photo s={s} lang={lang} cls="thumb" />}
    </Link>
  );
}

export function Cmp({ s, lang, sec = false }: { s: Story; lang: Lang; sec?: boolean }) {
  const w = words(s, lang);
  return (
    <Link className="h cmp" href={storyHref(s, lang)}>
      <div><h3 className="h4">{w.headline}</h3><Meta s={s} lang={lang} sec={sec} /></div>
      {s.photo && <img src={s.photo.url} alt="" loading="lazy" decoding="async" />}
    </Link>
  );
}

export function LatestList({ stories, lang, n }: { stories: Story[]; lang: Lang; n: number }) {
  return (
    <>
      <ul className="list">
        {stories.slice(0, n).map((s) => (
          <li key={s.id}><Link className="h" href={storyHref(s, lang)}><time dateTime={s.publishedAt}>{timeText(s.publishedAt, lang)}</time>
            <h3 className="h4">{words(s, lang).headline}</h3></Link></li>
        ))}
      </ul>
      <Link className="more" href={href(lang, "/latest")}>{t(lang, "allLatest")} <Chev /></Link>
    </>
  );
}

export function Head({ label, to, extra }: { label: string; to?: string; extra?: React.ReactNode }) {
  return (
    <div className="head">
      {to ? <Link href={to}>{label} <Chev /></Link> : <span>{label}</span>}
      {extra}
    </div>
  );
}

/** A river: newest first, a time, the headline and summary, a photo. */
export function River({ stories, lang, sec = false }: { stories: Story[]; lang: Lang; sec?: boolean }) {
  return (
    <div className="river">
      {stories.map((s) => {
        const w = words(s, lang);
        return (
          <Link key={s.id} className="h" href={storyHref(s, lang)}>
            <span className="when">{timeText(s.publishedAt, lang)}</span>
            <div><h3 className="h3">{w.headline}</h3>{w.deck && <p className="dek">{w.deck}</p>}<Meta s={s} lang={lang} sec={sec} /></div>
            {s.photo ? <img src={s.photo.url} alt="" loading="lazy" decoding="async" /> : <span />}
          </Link>
        );
      })}
    </div>
  );
}

export function Join({ lang }: { lang: Lang }) {
  return (
    <div className="join">
      <h3>{t(lang, "joinTitle")}</h3>
      <p>{t(lang, "joinText")}</p>
      <span className="note">{t(lang, "joinSoon")}</span>
    </div>
  );
}
