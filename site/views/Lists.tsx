// Section, latest, search, e-paper and archive pages (DESIGN.md §3.6-3.7).
import EpaperViewer from "../components/EpaperViewer.tsx";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Lang } from "../lib/types.ts";
import { issueDates, issueOn, latestIssue, latestStories, search, storiesIn, storiesOn } from "../lib/db.ts";
import { href, t } from "../lib/i18n.ts";
import { isSection, sectionName } from "../lib/sections.ts";
import { dateText, num, todayInIndia } from "../lib/format.ts";
import { Lead, River, Std } from "../components/cards.tsx";
import Frame from "../components/Frame.tsx";
import Saved from "../components/Saved.tsx";

export async function Section({ k, lang }: { k: string; lang: Lang }) {
  if (!isSection(k)) notFound();
  const list = await storiesIn(k, 60);
  const top = list.find((s) => s.photo) ?? list[0];
  return (
    <Frame lang={lang} path={`/section/${k}`} section={k}>
      <div className="sechead"><h1>{sectionName(k, lang)}</h1></div>
      {top ? (
        <>
          <div className="ctr" style={{ marginTop: 20 }}>{top.photo ? <Lead s={top} lang={lang} /> : <Std s={top} lang={lang} sec={false} />}</div>
          <div className="ctr"><River stories={list.filter((s) => s !== top)} lang={lang} /></div>
        </>
      ) : <><p className="empty">{t(lang, "none")}</p><Link className="more" href={href(lang, "/")}>{t(lang, "back")}</Link></>}
    </Frame>
  );
}

export async function Latest({ lang }: { lang: Lang }) {
  const list = (await latestStories(80)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return (
    <Frame lang={lang} path="/latest" active="latest">
      <div className="sechead"><h1>{t(lang, "latestTitle")}</h1></div>
      <p className="note" style={{ margin: "0 0 8px" }}>{t(lang, "updated")}</p>
      {list.length ? <River stories={list} lang={lang} sec /> : <p className="empty">{t(lang, "empty")}</p>}
    </Frame>
  );
}

export async function Search({ q, lang }: { q: string; lang: Lang }) {
  const list = q ? await search(q) : [];
  return (
    <Frame lang={lang} path="/search">
      <div className="sechead"><h1>{q ? `“${q}”` : t(lang, "searchTitle")}</h1></div>
      <form className="search" role="search" action={href(lang, "/search")} method="get" style={{ maxWidth: 560 }}>
        <input name="q" type="search" defaultValue={q} placeholder={t(lang, "searchPlaceholder")} aria-label={t(lang, "searchPlaceholder")} />
      </form>
      {q && <p className="note">{num(list.length, lang)} {t(lang, "found")}</p>}
      {q && (list.length ? <River stories={list} lang={lang} sec /> : <p className="empty">{t(lang, "notFound")}</p>)}
    </Frame>
  );
}

export async function Epaper({ date, lang }: { date?: string; lang: Lang }) {
  const issue = date ? await issueOn(date) : await latestIssue();
  if (date && !issue) notFound();
  return (
    <Frame lang={lang} path={date ? `/epaper/${date}` : "/epaper"} active="epaper">
      {/* "today's paper" only when it is today's; an older one is "the latest", or plainly the e-paper of its date */}
      <div className="sechead"><h1>{date ? t(lang, "epaper") : !issue || issue.date === todayInIndia() ? t(lang, "epTitle") : t(lang, "epLast")}</h1></div>
      {!issue ? <p className="empty">{t(lang, "noEpaper")}</p> : (
        <>
          <p className="note" style={{ margin: 0 }}>{dateText(issue.date, lang, true)} · {t(lang, "issue")} {num(issue.number, lang)}</p>
          <div className="tools" style={{ marginBottom: 16 }}>
            {issue.pdf && <a className="tool" href={issue.pdf} target="_blank" rel="noopener">{t(lang, "pdf")}</a>}
            <Link className="tool" href={href(lang, "/archive")}>{t(lang, "archive")}</Link>
          </div>
          <EpaperViewer pages={issue.pages.map((p) => ({ ...p, label: `${t(lang, "page")} ${num(p.number, lang)}` }))}
            lang={lang} words={{ open: t(lang, "epOpen"), close: t(lang, "close2"), prev: t(lang, "prev"), next: t(lang, "next"), zoom: t(lang, "zoomIn") }} />
          <p className="note">{t(lang, "epNote")}</p>
        </>
      )}
    </Frame>
  );
}

export async function Archive({ lang }: { lang: Lang }) {
  const days = await issueDates();
  return (
    <Frame lang={lang} path="/archive" active="archive">
      <div className="sechead"><h1>{t(lang, "archive")}</h1></div>
      {days.length ? (
        <div className="river">
          {days.map((d) => (
            <Link key={d.date} className="h" href={href(lang, `/archive/${d.date}`)}>
              <span className="when">{t(lang, "issue")} {num(d.number, lang)}</span>
              <div><h3 className="h3">{dateText(d.date, lang, true)}</h3><div className="meta">{num(d.stories, lang)} {t(lang, "storiesCount")}</div></div>
              <span />
            </Link>
          ))}
        </div>
      ) : <p className="empty">{t(lang, "noEpaper")}</p>}
    </Frame>
  );
}

export async function ArchiveDay({ date, lang }: { date: string; lang: Lang }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const [issue, list] = await Promise.all([issueOn(date), storiesOn(date)]);
  if (!issue && !list.length) notFound();
  return (
    <Frame lang={lang} path={`/archive/${date}`} active="archive">
      <div className="sechead"><h1>{dateText(date, lang, true)}</h1></div>
      {issue && <p className="note" style={{ margin: 0 }}>{t(lang, "issue")} {num(issue.number, lang)} · <Link href={href(lang, `/epaper/${date}`)}>{t(lang, "epaper")}</Link></p>}
      <div className="ctr" style={{ marginTop: 16 }}><River stories={list} lang={lang} sec /></div>
    </Frame>
  );
}

export function SavedPage({ lang }: { lang: Lang }) {
  return (
    <Frame lang={lang} path="/saved">
      <div className="sechead"><h1>{t(lang, "savedTitle")}</h1></div>
      <Saved lang={lang} empty={t(lang, "noneSaved")} />
    </Frame>
  );
}
