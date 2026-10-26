// The front page (DESIGN.md §3.3): a stack of containers. Containers with no
// stories yet simply don't show (phase A has only the evening paper's).
import Link from "next/link";
import type { Lang, Story } from "../lib/types.ts";
import { latestIssue, latestStories } from "../lib/db.ts";
import { href, t } from "../lib/i18n.ts";
import { sectionName } from "../lib/sections.ts";
import { dateText, num } from "../lib/format.ts";
import { Cmp, Head, Join, LatestList, Lead, Std, words } from "../components/cards.tsx";
import { Chev } from "../components/icons.tsx";
import Frame from "../components/Frame.tsx";

const inSection = (s: Story, key: string) => s.tier === key || s.genres.includes(key as never);

function SecBox({ stories, k, lang, shown }: { stories: Story[]; k: string; lang: Lang; shown: Set<string> }) {
  // a story already at the top of the page isn't repeated below it
  const list = stories.filter((s) => inSection(s, k) && !shown.has(s.id)).sort((a, b) => Number(!!b.photo) - Number(!!a.photo));
  if (!list.length) return null;
  const [first, ...rest] = list;
  return (
    <section className="secbox">
      <Head label={sectionName(k, lang)} to={href(lang, `/section/${k}`)} />
      <div className={`body${rest.length ? "" : " solo"}`}>
        <div><Std s={first} lang={lang} sec={false} /></div>
        {rest.length > 0 && <div className="cmps">{rest.slice(0, 3).map((s) => <Cmp key={s.id} s={s} lang={lang} />)}</div>}
      </div>
    </section>
  );
}

export default async function Home({ lang }: { lang: Lang }) {
  const [stories, issue] = await Promise.all([latestStories(200), latestIssue()]);
  const day = stories[0]?.issueDate;
  const today = stories.filter((s) => s.issueDate === day);
  // the lead: the engine's most important story of the last 12 hours when it's
  // headline-sized (ROADMAP §0.1), else the printed paper's front page
  const recentLive = stories.filter((s) => s.origin === "live" && Date.now() - Date.parse(s.publishedAt) < 12 * 3600_000 && (s.importance ?? 0) >= 7.5)
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0) || b.publishedAt.localeCompare(a.publishedAt));
  const lead = recentLive[0] ?? today.find((s) => s.photo && s.page === 1) ?? today.find((s) => s.photo) ?? today[0];
  const six = today.filter((s) => s !== lead).slice(0, 6);
  const shown = new Set([lead, ...six].filter(Boolean).map((s) => s!.id));
  // the latest list beside them: newest first, without the stories already at the top
  const byTime = stories.filter((s) => !shown.has(s.id))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || (a.page ?? 9) - (b.page ?? 9) || (a.rank ?? 99) - (b.rank ?? 99));
  const world = stories.filter((s) => s.tier === "world" && !shown.has(s.id)).slice(0, 4);
  const pairs: [string, string][] = [["gujarat", "india"], ["farm", "economy"], ["tech", "health"], ["sport", "education"]];

  return (
    <Frame lang={lang} path="/" active="home">
      {!lead ? <p className="empty">{t(lang, "empty")}</p> : (
        <>
          <div className="dateline"><span>{dateText(day!, lang, true)}</span><span className="upd">{t(lang, "updated")}</span></div>
          <div className="ctr g topg" style={{ marginTop: 16 }}>
            <div>
              <Lead s={lead} lang={lang} />
              {six.length > 0 && (
                <div className="g cards c3 six" style={{ marginTop: "var(--gut)", paddingTop: "var(--gut)", borderTop: "1px solid var(--rule)" }}>
                  {six.map((s) => <Std key={s.id} s={s} lang={lang} />)}
                </div>
              )}
            </div>
            <aside className="rail vr"><Head label={t(lang, "latestTitle")} to={href(lang, "/latest")} /><LatestList stories={byTime} lang={lang} n={8} />
              <div style={{ marginTop: 20 }}><Join lang={lang} /></div></aside>
          </div>
          <section className="ctr phone-latest"><Head label={t(lang, "latestTitle")} to={href(lang, "/latest")} /><LatestList stories={byTime} lang={lang} n={6} /></section>
          <section className="ctr phone-latest"><Join lang={lang} /></section>
          {pairs.map(([a, b]) => (
            <div key={a} className="ctr pair"><SecBox stories={stories} k={a} lang={lang} shown={shown} /><SecBox stories={stories} k={b} lang={lang} shown={shown} /></div>
          ))}
          {world.length > 0 && (
            <section className="ctr"><Head label={sectionName("world", lang)} to={href(lang, "/section/world")} />
              <div className="g cards c4">{world.map((s) => (
                <Link key={s.id} className="h" href={href(lang, `/news/${s.id}`)}><h3 className="h4">{words(s, lang).headline}</h3>
                  {words(s, lang).deck && <p className="dek">{words(s, lang).deck}</p>}</Link>))}</div>
            </section>
          )}
          {issue && issue.pages.length > 0 && (
            <section className="ctr"><Head label={t(lang, "epTitle")} to={href(lang, "/epaper")} />
              <div className="strip">{issue.pages.map((p) => (
                <Link key={p.number} href={href(lang, "/epaper")}><span className="epg"><img src={p.url} alt={`${t(lang, "page")} ${num(p.number, lang)}`} loading="lazy" decoding="async" /></span>
                  <div className="epcap">{t(lang, "page")} {num(p.number, lang)}</div></Link>))}</div>
              <Link className="more" href={href(lang, "/epaper")}>{t(lang, "epRead")} <Chev /></Link>
            </section>
          )}
        </>
      )}
    </Frame>
  );
}
