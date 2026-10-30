// A story (DESIGN.md §3.5), with its trust pieces (§3.4) and NewsArticle markup for Google.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Lang, Story } from "../lib/types.ts";
import { pic, SIZES } from "../lib/photo.ts";
import { latestStories, moreOnSubject, mostRead, storiesIn, storyById } from "../lib/db.ts";
import { href, t } from "../lib/i18n.ts";
import { sectionName } from "../lib/sections.ts";
import { dateText, minutes, num, paragraphs, timeText } from "../lib/format.ts";
import { PAPER, SITE_URL } from "../lib/site.ts";
import { Cmp, Head, Join, LatestList, MoreOn, MostRead, Std, words } from "../components/cards.tsx";
import CountRead from "../components/CountRead.tsx";
import { Chev, Flag } from "../components/icons.tsx";
import ArticleTools from "../components/ArticleTools.tsx";
import ReadProgress from "../components/ReadProgress.tsx";
import PhotoZoom from "../components/PhotoZoom.tsx";
import { ViewTransition } from "react";
import Frame from "../components/Frame.tsx";

export function articleJsonLd(s: Story, lang: Lang) {
  const w = words(s, lang);
  return {
    "@context": "https://schema.org", "@type": "NewsArticle",
    headline: w.headline.slice(0, 110), description: w.deck || undefined, inLanguage: lang !== "gu" && w.translated ? lang : "gu",
    datePublished: s.publishedAt, dateModified: s.updatedAt,
    image: s.photo ? [new URL(s.photo.url, SITE_URL).href] : undefined,
    mainEntityOfPage: `${SITE_URL}${href(lang, `/news/${s.id}`)}`,
    articleSection: sectionName(s.tier, lang),
    author: { "@type": "Organization", name: PAPER[lang].name, url: SITE_URL },
    publisher: { "@type": "NewsMediaOrganization", name: PAPER[lang].name, url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` } },
    isBasedOn: s.source?.url,
  };
}

export default async function Article({ id, lang }: { id: string; lang: Lang }) {
  const s = await storyById(id);
  if (!s) notFound();
  const [related, latest, more, most] = await Promise.all([storiesIn(s.tier, 6), latestStories(12), moreOnSubject(s.id), mostRead(5)]);
  const w = words(s, lang);
  const url = `${SITE_URL}${href(lang, `/news/${s.id}`)}`;
  const changed = s.updatedAt && Date.parse(s.updatedAt) - Date.parse(s.publishedAt) > 5 * 60_000;
  const toolWords = Object.fromEntries((["share", "shareShort", "copy", "copied", "save", "saved", "savedToast", "unsavedToast", "size"] as const)
    .map((k) => [k, t(lang, k)])) as Parameters<typeof ArticleTools>[0]["words"];
  const others = related.filter((x) => x.id !== s.id && !more.some((m) => m.id === x.id));
  const paras = paragraphs(w.body);
  // a long story carries one related story inside it, after its third paragraph (as news sites do)
  const inline = paras.length >= 5 ? others.find((x) => x.photo) ?? others[0] : undefined;
  const after = others.filter((x) => x !== inline).slice(0, 3);
  // the further photos (the editor's own reports) spread evenly through the text, after the paragraph nearest each place
  const shotsAfter = (i: number) => s.gallery.filter((_, j) => Math.max(0, Math.min(paras.length - 1, Math.round(((j + 1) * paras.length) / (s.gallery.length + 1)) - 1)) === i);
  const mail = `mailto:${PAPER.email}?subject=${encodeURIComponent(`${t(lang, "reportBody")} ${s.id}`)}&body=${encodeURIComponent(`${w.headline}\n${url}\n\n`)}`;

  return (
    <Frame lang={lang} path={`/news/${s.id}`} section={s.tier} bottomBar={false}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(s, lang)).replace(/</g, "\\u003c") }} />
      <ReadProgress target=".art" />
      <CountRead id={s.id} />
      <div className="artg">
        <article className="art" lang={w.translated || lang === "gu" ? lang : "gu"}>
          <div className="crumbrow">
            <Link prefetch={false} className="crumbs" href={href(lang, `/section/${s.tier}`)}>{sectionName(s.tier, lang)} <Chev /></Link>
            {s.genres[0] && <Link prefetch={false} className="crumbs" href={href(lang, `/section/${s.tier}/${s.genres[0]}`)}>{sectionName(s.genres[0], lang)} <Chev /></Link>}
          </div>
          {lang !== "gu" && !w.translated && <p className="fix" lang={lang}>{t(lang, "noEnglish")}</p>}
          {s.corrections.map((c, i) => (
            <p key={i} className="fix">{t(lang, "correction")}, {dateText(c.at, lang)}: {lang === "en" && c.en ? c.en : c.gu}</p>
          ))}
          {w.kicker && <span className="kick">{w.kicker}</span>}
          <h1>{w.headline}</h1>
          {w.deck && <p className="stand">{w.deck}</p>}
          <div className="byblock">
            <span className="badge" aria-hidden="true">{PAPER[lang].name.slice(0, 1)}</span>
            <div className="times">
              <span>{t(lang, "by")} <b>{t(lang, "desk")}</b>, {PAPER[lang].place}</span>
              <span>{dateText(s.publishedAt, lang)}, {timeText(s.publishedAt, lang)}
                {changed && <> · {t(lang, "updatedAt")} {timeText(s.updatedAt, lang)}</>}
                {" · "}{num(minutes(w.body), lang)} {t(lang, "min")}</span>
            </div>
          </div>
          <ArticleTools id={s.id} url={url} headline={w.headline} words={toolWords} />
          {s.photo && (
            <figure>
              <PhotoZoom src={s.photo.url} width={s.photo.width} height={s.photo.height} alt={w.caption || w.headline}
                         caption={w.caption} label={t(lang, "zoom")} close={t(lang, "close2")}>
                <ViewTransition name={`photo-${s.id}`} share="morph" default="none">
                  <span className="phw"><img className="ph" {...pic(s.photo, SIZES.inside)} fetchPriority="high" width={s.photo.width} height={s.photo.height} alt={w.caption || w.headline} /></span>
                </ViewTransition>
              </PhotoZoom>
              {w.caption && <figcaption>{w.caption} ({t(lang, "photo")}: {s.photo?.credit ?? s.source?.name ?? "PIB"})</figcaption>}
            </figure>
          )}
          <div className="body">
            {paras.map((p, i) => (
              <div key={i} style={{ display: "contents" }}>
                <p>{p}</p>
                {shotsAfter(i).map((g) => (
                  <figure key={g.url} className="inph">
                    <PhotoZoom src={g.url} width={g.width} height={g.height} alt={w.headline} caption="" label={t(lang, "zoom")} close={t(lang, "close2")}>
                      <span className="phw"><img className="ph" {...pic(g, SIZES.inside)} width={g.width} height={g.height} alt={w.headline} loading="lazy" /></span>
                    </PhotoZoom>
                  </figure>
                ))}
                {inline && i === 2 && (
                  <aside className="readalso"><b>{t(lang, "readAlso")}</b><Cmp s={inline} lang={lang} /></aside>
                )}
              </div>
            ))}
          </div>
          {more.length > 0 && <MoreOn stories={more} lang={lang} />}
          <div className="srcbox">
            <h2>{t(lang, "srcTitle")}</h2>
            {s.sources.length > 1 ? (
              <ul className="srcs">{s.sources.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noopener">{x.name}</a></li>)}</ul>
            ) : s.source ? <a href={s.source.url} target="_blank" rel="noopener">{s.source.name}{s.source.office ? `, ${s.source.office}` : ""}</a>
                      : <span>{t(lang, "desk")}</span>}
            <a className="report" href={mail}><Flag />{t(lang, "report")}</a>
          </div>
          {after.length > 0 && (
            <section className="ctr"><Head label={t(lang, "related")} to={href(lang, `/section/${s.tier}`)} />
              <div className="g cards c3 relgrid">{/* photos only when every card has one, so the headlines line up */}
                {after.map((x) => <Std key={x.id} s={x} lang={lang} photo={after.every((y) => y.photo)} />)}</div></section>
          )}
          <section className="ctr"><Join lang={lang} /></section>
        </article>
        <aside><div><Head label={t(lang, "latestTitle")} to={href(lang, "/latest")} /><LatestList stories={latest.filter((x) => x.id !== s.id)} lang={lang} n={7} />
          {most.filter((x) => x.id !== s.id).length >= 3 && <div className="ctr"><Head label={t(lang, "mostRead")} /><MostRead stories={most.filter((x) => x.id !== s.id)} lang={lang} /></div>}</div></aside>
      </div>
    </Frame>
  );
}
