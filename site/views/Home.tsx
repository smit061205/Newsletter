// The front page (DESIGN.md §3.3): a stack of containers. Containers with no
// stories yet simply don't show (phase A has only the evening paper's).
import type { Lang, Story } from "../lib/types.ts";
import { latestStories, moreOnSubject, mostRead } from "../lib/db.ts";
import { href, t } from "../lib/i18n.ts";
import { sectionName } from "../lib/sections.ts";
import { dateText } from "../lib/format.ts";
import { Cmp, Head, Join, LatestList, Lead, MostRead, Std } from "../components/cards.tsx";
import Frame from "../components/Frame.tsx";
import { PAPER } from "../lib/site.ts";

const inSection = (s: Story, key: string) => s.tier === key || s.genres.includes(key as never);
const BELOW = ["gujarat", "india", "farm", "economy", "tech", "health", "sport", "education", "entertainment"];

// The sections below the top, after the Post's front page: a section with
// plenty of news gets a full-width row (its best photo story, then columns of
// headlines); the stories of the sections with only a few go together into one
// grid of cards, each with its section's name, cut to whole rows of four so no
// row is left half empty. A story shows once on the page, in the first section it belongs to.
function sectionBoxes(stories: Story[], shown: Set<string>) {
  const used = new Set(shown);
  const wide: { k: string; list: Story[] }[] = [];
  const few: { k: string; s: Story }[] = [];
  for (const k of [...BELOW, "world"]) {
    const list = stories.filter((s) => inSection(s, k) && !used.has(s.id)).slice(0, 7)
      .sort((a, b) => Number(!!b.photo) - Number(!!a.photo));
    if (!list.length) continue;
    list.forEach((s) => used.add(s.id));
    if (list.length >= 4) wide.push({ k, list });
    else few.push(...list.map((s) => ({ k, s })));
  }
  few.sort((a, b) => Number(!!b.s.photo) - Number(!!a.s.photo));
  return { wide, few: few.length >= 4 ? few.slice(0, Math.min(12, few.length - few.length % 4)) : few };
}

function WideBox({ k, list, lang }: { k: string; list: Story[]; lang: Lang }) {
  const [first, ...rest] = list;
  // no photo to lead with: the section's stories as cards in whole rows of three
  if (!first.photo) return (
    <section className="ctr wide">
      <Head label={sectionName(k, lang)} to={href(lang, `/section/${k}`)} />
      <div className="g cards c3">{list.slice(0, list.length >= 6 ? 6 : 3).map((s) => <Std key={s.id} s={s} lang={lang} sec={false} photo={false} />)}</div>
    </section>
  );
  // two columns of three headlines when there are six, else one column of them all
  const cols = rest.length >= 6 ? [rest.slice(0, 3), rest.slice(3, 6)] : [rest];
  return (
    <section className="ctr wide">
      <Head label={sectionName(k, lang)} to={href(lang, `/section/${k}`)} />
      <div className={`wbody${cols.length === 1 ? " two" : ""}`}>
        <div><Std s={first} lang={lang} sec={false} /></div>
        {cols.map((c, i) => <div key={i} className="stack">{c.map((s) => <Cmp key={s.id} s={s} lang={lang} />)}</div>)}
      </div>
    </section>
  );
}

export default async function Home({ lang }: { lang: Lang }) {
  const stories = await latestStories(200);
  const day = stories[0]?.issueDate;
  const today = stories.filter((s) => s.issueDate === day);
  // the lead: the engine's most important story of the last 12 hours when it's
  // headline-sized (ROADMAP §0.1) and has a photo, else the printed paper's front page.
  // The lead always has a photo (the user, 29 Oct): the engine only takes official photos, so
  // a big story from the outlets may have none; then the newest photo story leads, first
  // from the last two days, else from the printed paper.
  const recentLive = stories.filter((s) => s.photo && s.origin === "live" && Date.now() - Date.parse(s.publishedAt) < 12 * 3600_000 && (s.importance ?? 0) >= 7.5)
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0) || b.publishedAt.localeCompare(a.publishedAt));
  const newest = [...stories].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const lead = recentLive[0] ?? newest.find((s) => s.photo && Date.now() - Date.parse(s.publishedAt) < 48 * 3600_000)
    ?? today.find((s) => s.photo && s.page === 1) ?? today.find((s) => s.photo) ?? newest.find((s) => s.photo) ?? today[0];
  // under the lead, its subject's other stories; below the top, what readers open most
  const [more, most] = await Promise.all([lead ? moreOnSubject(lead.id) : [], mostRead(5)]);
  // the stories under the lead: today's paper first, then the newest; whole rows of three
  // only (28 Oct: four left one card alone in its row and a hole beside the rail)
  const pool = [...today, ...stories.filter((s) => s.issueDate !== day)].filter((s) => s !== lead).slice(0, 6);
  const six = pool.slice(0, pool.length < 3 ? pool.length : pool.length - pool.length % 3).sort((a, b) => Number(!!b.photo) - Number(!!a.photo));
  const shown = new Set([lead, ...six].filter(Boolean).map((s) => s!.id));
  // the latest list beside them: newest first, without the stories already at the top
  const byTime = stories.filter((s) => !shown.has(s.id))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || (a.page ?? 9) - (b.page ?? 9) || (a.rank ?? 99) - (b.rank ?? 99));
  const { wide, few } = sectionBoxes(stories, shown);
  // photos only in whole rows, so every row's headlines line up
  const fewPhotos = Math.floor(few.filter((x) => x.s.photo).length / 4) * 4;

  return (
    <Frame lang={lang} path="/" active="home">
      {/* the page's name for screen readers and search engines (the wordmark above is a link) */}
      <h1 className="vh">{PAPER[lang].name}: {PAPER[lang].tagline}</h1>
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
            {/* the rail is never taller than the stories beside it: the list shows only the headlines that fit */}
            <aside className="rail vr"><div className="fit"><Head label={t(lang, "latestTitle")} to={href(lang, "/latest")} /><LatestList stories={byTime} lang={lang} n={16} /></div></aside>
          </div>
          <section className="ctr phone-latest"><Head label={t(lang, "latestTitle")} to={href(lang, "/latest")} /><LatestList stories={byTime} lang={lang} n={6} /></section>
          <section className="ctr band">
            {most.length >= 3 && <div><Head label={t(lang, "mostRead")} /><MostRead stories={most} lang={lang} /></div>}
            <Join lang={lang} />
          </section>
          {wide.map((b) => <WideBox key={b.k} k={b.k} list={b.list} lang={lang} />)}
          {few.length > 0 && (
            <section className="ctr"><Head label={t(lang, "moreNews")} />
              <div className={`g cards ${few.length >= 4 ? "c4" : `c${few.length}`} few`}>
                {few.map(({ k, s }, i) => <Std key={s.id} s={s} lang={lang} sec={false} label={sectionName(k, lang)} photo={i < fewPhotos} />)}
              </div>
            </section>
          )}
        </>
      )}
    </Frame>
  );
}
