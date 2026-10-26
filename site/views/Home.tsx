// The front page (DESIGN.md §3.3): a stack of containers. Containers with no
// stories yet simply don't show (phase A has only the evening paper's).
import Link from "next/link";
import type { Lang, Story } from "../lib/types.ts";
import { latestIssue, latestStories, moreOnSubject, mostRead } from "../lib/db.ts";
import { href, t } from "../lib/i18n.ts";
import { sectionName } from "../lib/sections.ts";
import { dateText, num, todayInIndia } from "../lib/format.ts";
import { Cmp, Head, Join, LatestList, Lead, MostRead, Std, words } from "../components/cards.tsx";
import { Chev } from "../components/icons.tsx";
import Frame from "../components/Frame.tsx";

const inSection = (s: Story, key: string) => s.tier === key || s.genres.includes(key as never);
const BELOW = ["gujarat", "india", "farm", "economy", "tech", "health", "sport", "education", "entertainment"];

// The sections below the top, after the Post's front page: a section with
// plenty of news gets a full-width row (its best photo story, then two columns
// of headlines); sections with a few stories share a row, three to a row on a
// desktop. A story shows once on the page, in the first section it belongs to.
function sectionBoxes(stories: Story[], shown: Set<string>) {
  const used = new Set(shown);
  const boxes: { k: string; list: Story[] }[] = [];
  for (const k of BELOW) {
    const list = stories.filter((s) => inSection(s, k) && !used.has(s.id)).slice(0, 7)
      .sort((a, b) => Number(!!b.photo) - Number(!!a.photo));
    if (!list.length) continue;
    list.forEach((s) => used.add(s.id));
    boxes.push({ k, list });
  }
  return { wide: boxes.filter((b) => b.list.length >= 4), small: boxes.filter((b) => b.list.length < 4) };
}

function WideBox({ k, list, lang }: { k: string; list: Story[]; lang: Lang }) {
  const [first, ...rest] = list;
  return (
    <section className="ctr wide">
      <Head label={sectionName(k, lang)} to={href(lang, `/section/${k}`)} />
      <div className="wbody">
        <div><Std s={first} lang={lang} sec={false} /></div>
        <div className="stack">{rest.slice(0, 3).map((s) => <Cmp key={s.id} s={s} lang={lang} />)}</div>
        {rest.length > 3 && <div className="stack">{rest.slice(3, 6).map((s) => <Cmp key={s.id} s={s} lang={lang} />)}</div>}
      </div>
    </section>
  );
}

function SmallBox({ k, list, lang }: { k: string; list: Story[]; lang: Lang }) {
  const [first, ...rest] = list;
  return (
    <section className="secbox">
      <Head label={sectionName(k, lang)} to={href(lang, `/section/${k}`)} />
      <Std s={first} lang={lang} sec={false} />
      {rest.length > 0 && <div className="stack">{rest.map((s) => <Cmp key={s.id} s={s} lang={lang} />)}</div>}
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
  // the six under the lead: photo stories in the first row, so the row lines up
  // under the lead, its subject's other stories; in the rail, what readers open most
  const [more, most] = await Promise.all([lead ? moreOnSubject(lead.id) : [], mostRead(5)]);
  const six = today.filter((s) => s !== lead).slice(0, 6).sort((a, b) => Number(!!b.photo) - Number(!!a.photo));
  const shown = new Set([lead, ...six].filter(Boolean).map((s) => s!.id));
  // the latest list beside them: newest first, without the stories already at the top
  const byTime = stories.filter((s) => !shown.has(s.id))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || (a.page ?? 9) - (b.page ?? 9) || (a.rank ?? 99) - (b.rank ?? 99));
  const world = stories.filter((s) => s.tier === "world" && !shown.has(s.id)).slice(0, 4);
  const { wide, small } = sectionBoxes(stories, shown);

  return (
    <Frame lang={lang} path="/" active="home">
      {!lead ? <p className="empty">{t(lang, "empty")}</p> : (
        <>
          <div className="dateline"><span>{dateText(day!, lang, true)}</span><span className="upd">{t(lang, "updated")}</span></div>
          <div className="ctr g topg" style={{ marginTop: 16 }}>
            <div>
              <Lead s={lead} lang={lang} more={more} />
              {six.length > 0 && (
                <div className="g cards c3 six" style={{ marginTop: "var(--gut)", paddingTop: "var(--gut)", borderTop: "1px solid var(--rule)" }}>
                  {/* photos only in a full first row (photo stories come first), so every row's headlines line up */}
                  {six.map((s, i) => <Std key={s.id} s={s} lang={lang} morph photo={i < 3 && six.slice(0, 3).every((x) => x.photo)} />)}
                </div>
              )}
            </div>
            <aside className="rail vr"><Head label={t(lang, "latestTitle")} to={href(lang, "/latest")} /><LatestList stories={byTime} lang={lang} n={8} />
              {most.length >= 3 && <div className="ctr"><Head label={t(lang, "mostRead")} /><MostRead stories={most} lang={lang} /></div>}
              <div style={{ marginTop: 20 }}><Join lang={lang} /></div></aside>
          </div>
          <section className="ctr phone-latest"><Head label={t(lang, "latestTitle")} to={href(lang, "/latest")} /><LatestList stories={byTime} lang={lang} n={6} /></section>
          {most.length >= 3 && <section className="ctr phone-latest"><Head label={t(lang, "mostRead")} /><MostRead stories={most} lang={lang} /></section>}
          <section className="ctr phone-latest"><Join lang={lang} /></section>
          {wide.map((b) => <WideBox key={b.k} k={b.k} list={b.list} lang={lang} />)}
          {small.length > 0 && <div className="ctr g cards c3 smalls">{small.map((b) => <SmallBox key={b.k} k={b.k} list={b.list} lang={lang} />)}</div>}
          {world.length > 0 && (
            <section className="ctr"><Head label={sectionName("world", lang)} to={href(lang, "/section/world")} />
              <div className="g cards c4">{world.map((s) => (
                <Link key={s.id} className="h" href={href(lang, `/news/${s.id}`)}><h3 className="h4">{words(s, lang).headline}</h3>
                  {words(s, lang).deck && <p className="dek">{words(s, lang).deck}</p>}</Link>))}</div>
            </section>
          )}
          {issue && issue.pages.length > 0 && (
            <section className="ctr"><Head label={t(lang, issue.date === todayInIndia() ? "epTitle" : "epLast")} to={href(lang, "/epaper")} />
              <div className="strip">{issue.pages.map((p) => (
                <Link key={p.number} href={href(lang, "/epaper")}><span className="epg"><img src={p.url} alt={`${t(lang, "page")} ${num(p.number, lang)}`} loading="lazy" decoding="async" /></span>
                  <div className="epcap">{t(lang, "page")} {num(p.number, lang)}</div></Link>))}</div>
              <Link className="more" href={href(lang, "/epaper")}>{t(lang, issue.date === todayInIndia() ? "epRead" : "epReadLast")} <Chev /></Link>
            </section>
          )}
        </>
      )}
    </Frame>
  );
}
