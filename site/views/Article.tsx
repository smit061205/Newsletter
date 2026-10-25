// A story (DESIGN.md §3.5), with its trust pieces (§3.4) and NewsArticle markup for Google.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Lang, Story } from "../lib/types.ts";
import { latestStories, storiesIn, storyById } from "../lib/db.ts";
import { href, t } from "../lib/i18n.ts";
import { sectionName } from "../lib/sections.ts";
import { dateText, minutes, num, paragraphs, timeText } from "../lib/format.ts";
import { PAPER, SITE_URL } from "../lib/site.ts";
import { Cmp, Head, Join, LatestList, words } from "../components/cards.tsx";
import { Check, Chev, Flag } from "../components/icons.tsx";
import ArticleTools from "../components/ArticleTools.tsx";
import Frame from "../components/Frame.tsx";

export function articleJsonLd(s: Story, lang: Lang) {
  const w = words(s, lang);
  return {
    "@context": "https://schema.org", "@type": "NewsArticle",
    headline: w.headline.slice(0, 110), description: w.deck || undefined, inLanguage: lang === "en" && w.translated ? "en" : "gu",
    datePublished: s.publishedAt, dateModified: s.updatedAt,
    image: s.photo ? [s.photo.url] : undefined,
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
  const [related, latest] = await Promise.all([storiesIn(s.tier, 6), latestStories(12)]);
  const w = words(s, lang);
  const url = `${SITE_URL}${href(lang, `/news/${s.id}`)}`;
  const changed = s.updatedAt && Date.parse(s.updatedAt) - Date.parse(s.publishedAt) > 5 * 60_000;
  const toolWords = Object.fromEntries((["share", "shareShort", "copy", "copied", "save", "saved", "savedToast", "unsavedToast", "size"] as const)
    .map((k) => [k, t(lang, k)])) as Parameters<typeof ArticleTools>[0]["words"];
  const mail = `mailto:${PAPER.email}?subject=${encodeURIComponent(`${t(lang, "reportBody")} ${s.id}`)}&body=${encodeURIComponent(`${w.headline}\n${url}\n\n`)}`;

  return (
    <Frame lang={lang} path={`/news/${s.id}`} section={s.tier} bottomBar={false}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(s, lang)).replace(/</g, "\\u003c") }} />
      <div className="artg">
        <article className="art" lang={w.translated || lang === "gu" ? lang : "gu"}>
          <Link className="crumbs" href={href(lang, `/section/${s.tier}`)}>{sectionName(s.tier, lang)} <Chev /></Link>
          {lang === "en" && !w.translated && <p className="fix" lang="en">{t(lang, "noEnglish")}</p>}
          {s.corrections.map((c, i) => (
            <p key={i} className="fix">{t(lang, "correction")}, {dateText(c.at, lang)}: {lang === "en" && c.en ? c.en : c.gu}</p>
          ))}
          {w.kicker && <span className="kick">{w.kicker}</span>}
          <h1>{w.headline}</h1>
          {w.deck && <p className="stand">{w.deck}</p>}
          <div className="times">
            {t(lang, "by")} <b>{t(lang, "desk")}</b>, {PAPER[lang].place}
            <br />{t(lang, "published")}: {dateText(s.publishedAt, lang)}, {timeText(s.publishedAt, lang)}
            {changed && <> · {t(lang, "updatedAt")}: {timeText(s.updatedAt, lang)}</>}
            {" · "}{num(minutes(w.body), lang)} {t(lang, "min")}
          </div>
          {s.checked && <div className="chk"><Check />{t(lang, "checked")}</div>}
          <ArticleTools id={s.id} url={url} headline={w.headline} words={toolWords} />
          {s.photo && (
            <figure>
              <img className="ph" src={s.photo.url} width={s.photo.width} height={s.photo.height} alt={w.caption || w.headline} />
              {w.caption && <figcaption>{w.caption} ({t(lang, "photo")}: {s.source?.name ?? "PIB"})</figcaption>}
            </figure>
          )}
          <div className="body">{paragraphs(w.body).map((p, i) => <p key={i}>{p}</p>)}</div>
          <div className="srcbox">
            <h2>{t(lang, "srcTitle")}</h2>
            {s.source ? <a href={s.source.url} target="_blank" rel="noopener">{s.source.name}{s.source.office ? `, ${s.source.office}` : ""}</a>
                      : <span>{t(lang, "desk")}</span>}
            {s.checked && <p className="how">{t(lang, "how")}</p>}
            <a className="report" href={mail}><Flag />{t(lang, "report")}</a>
          </div>
          {related.filter((x) => x.id !== s.id).length > 0 && (
            <section className="ctr"><Head label={t(lang, "related")} to={href(lang, `/section/${s.tier}`)} />
              <div className="stack">{related.filter((x) => x.id !== s.id).slice(0, 4).map((x) => <Cmp key={x.id} s={x} lang={lang} />)}</div></section>
          )}
          <section className="ctr"><Join lang={lang} /></section>
        </article>
        <aside><div><Head label={t(lang, "latestTitle")} to={href(lang, "/latest")} /><LatestList stories={latest.filter((x) => x.id !== s.id)} lang={lang} n={7} /></div></aside>
      </div>
    </Frame>
  );
}
