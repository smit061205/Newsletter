// The editor page (ROADMAP §6 phase B, item 4): what waits for the editor's yes or no,
// Capital Kranti's news and Aavtikal's articles (each searched, shown 25 at a time, changed
// or taken down and put back), the engine's stop switch and the day's use.
// Gujarati first, English as a switch (?lang=en); plain words, big buttons.
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import s from "./editor.module.css";
import { W } from "./words.ts";
import Birthday from "./Birthday.tsx";
import LeaderForm from "./LeaderForm.tsx";
import { approveStory, dropLeaderAction, pauseEngine, publishFeature, putBackStory, rejectStory, removeFeature, removeStory } from "./actions.ts";
import { db } from "@/lib/db.ts";
import { COOKIE, desk, editorOf, findFeatures, findStories, PAGE, signInReady, type DeskStory, type Found, type Show } from "@/lib/editor.ts";
import { beatName, isBeat } from "@/lib/flagship.ts";
import { birthdays, draftEmail, leaders } from "@/lib/leaders.ts";
import { num, timeText, shortDate } from "@/lib/format.ts";
import { paragraphs } from "@/lib/format.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "સંપાદક | કેપિટલ ક્રાંતિ", robots: { index: false, follow: false } };

type Q = { lang?: string; signin?: string; q?: string; show?: string; n?: string; fq?: string; fshow?: string; fn?: string; saved?: string; written?: string; wrote?: string };

export default async function Editor({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const lang = q.lang === "en" ? "en" : "gu";
  const w = W[lang];
  const who = editorOf((await cookies()).get(COOKIE)?.value);
  const other = lang === "en" ? "/editor" : "/editor?lang=en";

  if (!who) {
    const note = !signInReady() ? w.off : q.signin === "refused" ? w.refused : q.signin === "again" ? w.again : null;
    return (
      <main className={s.page} lang={lang === "en" ? "en" : undefined}>
        <header className={s.top}><h1>{w.title}</h1><Link href={other}>{w.lang}</Link></header>
        <section className={s.signin}>
          <p>{w.intro}</p>
          {note && <p className={s.note} role="status">{note}</p>}
          {signInReady() && <a className={s.big} href="/api/editor/login">{w.signIn}</a>}
        </section>
      </main>
    );
  }

  // what's asked for: words, which list, how many (25 more each time)
  const words = (q.q ?? "").trim().slice(0, 80), fwords = (q.fq ?? "").trim().slice(0, 80);
  const show: Show = q.show === "removed" ? "removed" : "site", fshow: Show = q.fshow === "removed" ? "removed" : "site";
  const count = (v?: string) => Math.min(500, Math.max(PAGE, Math.round(Number(v) / PAGE) * PAGE || PAGE));
  const n = count(q.n), fn = count(q.fn);
  const sql = db();
  const [d, news, arts, people] = await Promise.all([desk(sql), findStories(sql, words, show, n), findFeatures(sql, fwords, fshow, fn), leaders(sql)]);
  const bday = birthdays(people);

  // a link to this page with some of its asks changed (the rest kept)
  const keep: Record<string, string | undefined> = { lang: lang === "en" ? "en" : undefined, q: words || undefined, show: show === "removed" ? show : undefined,
    n: n > PAGE ? String(n) : undefined, fq: fwords || undefined, fshow: fshow === "removed" ? fshow : undefined, fn: fn > PAGE ? String(fn) : undefined };
  const link = (change: Record<string, string | undefined>, at: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, ...change })) if (v) p.set(k, v);
    const qs = p.toString();
    return `/editor${qs ? `?${qs}` : ""}#${at}`;
  };
  const back = lang === "en" ? "lang=en" : "";

  const time = (iso: string) => (iso ? `${shortDate(iso, "gu")}, ${timeText(iso, "gu")}` : "");
  const nn = (x: number) => (lang === "gu" ? num(x, "gu") : String(x));

  const Held = ({ x }: { x: DeskStory }) => (
    <article className={s.card}>
      <h3>{x.headline}</h3>
      {x.reason && <p className={s.why}><b>{w.why}:</b> {x.reason}</p>}
      {x.deck && <p className={s.deck}>{x.deck}</p>}
      <details className={s.more}>
        <summary>{w.read}</summary>
        {paragraphs(x.body).map((p, i) => <p key={i}>{p}</p>)}
        {x.sources.length > 0 && <p><b>{w.sources}:</b> {x.sources.map((src, i) => <span key={src.url}>{i > 0 && ", "}<a href={src.url} target="_blank" rel="noopener">{src.name}</a></span>)}</p>}
      </details>
      <div className={s.buttons}>
        <form action={approveStory.bind(null, x.id)}><button className={s.yes}>{w.publish}</button></form>
        <Link className={s.ghost} href={`/editor/story/${x.id}${back ? `?${back}` : ""}`}>{w.edit}</Link>
        <form action={rejectStory.bind(null, x.id)}><button className={s.no}>{w.reject}</button></form>
      </div>
    </article>
  );

  // one searchable list (Capital Kranti's news or Aavtikal's articles)
  const Finder = ({ at, kind, found, value, which, more }: { at: string; kind: "story" | "feature"; found: { rows: Found[]; more: boolean }; value: string; which: Show; more: string }) => {
    const qk = kind === "story" ? "q" : "fq", sk = kind === "story" ? "show" : "fshow", nk = kind === "story" ? "n" : "fn";
    const hidden = Object.entries(keep).filter(([k, v]) => v && k !== qk && k !== nk);
    return (
      <>
        <form className={s.search} action={`/editor#${at}`} role="search">
          {hidden.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="search" name={qk} defaultValue={value} placeholder={w.searchFor} aria-label={w.search} />
          <button className={s.find}>{w.search}</button>
        </form>
        <div className={s.tabs} role="group">
          <Link href={link({ [sk]: undefined, [nk]: undefined }, at)} aria-current={which === "site" ? "true" : undefined}>{w.onSite}</Link>
          <Link href={link({ [sk]: "removed", [nk]: undefined }, at)} aria-current={which === "removed" ? "true" : undefined}>{w.removedTab}</Link>
          {value && <Link className={s.clear} href={link({ [qk]: undefined, [nk]: undefined }, at)}>{w.clear}</Link>}
        </div>
        {found.rows.length ? (
          <ul className={s.list}>
            {found.rows.map((x) => (
              <li key={x.id}>
                <div className={s.what}>
                  {x.status === "withdrawn"
                    ? <span className={s.title}>{x.headline}</span>
                    : <a className={s.title} href={kind === "story" ? `/news/${x.id}` : `/aavtikal/p/${x.id}`} target="_blank" rel="noopener">{x.headline}</a>}
                  <span className={s.when}>
                    {time(x.at)} · {kind === "story" ? (x.kind === "editor" ? w.fromYou : x.kind === "live" ? w.fromEngine : w.fromPaper) : isBeat(x.kind) ? beatName(x.kind, lang) : x.kind}
                  </span>
                </div>
                <div className={s.acts}>
                  {x.status === "withdrawn" ? (
                    <form action={(kind === "story" ? putBackStory : publishFeature).bind(null, x.id)}><button className={s.small}>{w.putBack}</button></form>
                  ) : <>
                    <Link className={s.small} href={`/editor/${kind}/${x.id}${back ? `?${back}` : ""}`}>{w.edit}</Link>
                    <details className={s.confirm}><summary>{w.remove}</summary>
                      <form action={(kind === "story" ? removeStory : removeFeature).bind(null, x.id)}><button className={s.no}>{w.sure}</button></form></details>
                  </>}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className={s.empty}>{value ? w.noneFound : w.none}</p>}
        {found.more && <Link className={s.moreBtn} href={more}>{w.more}</Link>}
      </>
    );
  };

  return (
    <main className={s.page} lang={lang === "en" ? "en" : undefined}>
      <header className={s.top}>
        <h1>{w.title}</h1>
        <div className={s.who}>
          <span>{who}</span>
          <Link href={other}>{w.lang}</Link>
          <form action="/api/editor/logout" method="post"><button className={s.link}>{w.signOut}</button></form>
        </div>
      </header>
      <nav className={s.jump} aria-label={w.jump}>
        <a href="#waiting">{w.waiting}{d.held.length > 0 && ` (${nn(d.held.length)})`}</a>
        <a href="#leaders">{w.leadersShort}{bday.today.length > 0 && ` (${nn(bday.today.length)})`}</a>
        <a href="#news" className={s.jCK}>{w.ck}</a>
        <a href="#aavtikal" className={s.jAV}>{w.av}</a>
        <a href="#engine">{w.engine}</a>
      </nav>
      <Link className={s.writeBtn} href={`/editor/write${back ? `?${back}` : ""}`}>{w.writeNew}</Link>
      {q.written && <p className={s.done} role="status">{w.written} <a href={`/news/${encodeURIComponent(q.written)}`} target="_blank" rel="noopener">{w.seeIt}</a></p>}
      {q.saved && <p className={q.saved === "1" ? s.done : s.stopped} role="status">{q.saved === "1" ? w.saved : w.notSaved}</p>}

      <section className={s.block} aria-labelledby="waiting">
        <h2 id="waiting">{w.waiting} {d.held.length > 0 && <span className={s.count}>{nn(d.held.length)}</span>}</h2>
        {d.held.length ? d.held.map((x) => <Held key={x.id} x={x} />) : <p className={s.empty}>{w.waitingNone}</p>}
      </section>

      <section className={s.block} aria-labelledby="leaders">
        <h2 id="leaders">{w.leaders} {bday.today.length > 0 && <span className={s.count}>{nn(bday.today.length)}</span>}</h2>
        <p className={s.help}>{w.leadersNote}</p>
        {bday.today.length ? bday.today.map((l) => {
          const m = draftEmail(l);
          return <Birthday key={l.id} lang={lang} leader={l} subject={m.subject} body={m.body} />;
        }) : <p className={s.empty}>{w.bdayNone}</p>}
        {bday.soon.length > 0 && <>
          <h3 className={s.sub}>{w.bdaySoon}</h3>
          <ul className={s.runs}>{bday.soon.map(({ leader: l, inDays }) => (
            <li key={l.id}><span>{l.title} {l.nameGu}</span><span className={s.when}>{inDays === 1 ? w.tomorrow : `${nn(inDays)} ${w.daysLater}`}</span></li>
          ))}</ul>
        </>}
        <h3 className={s.sub}>{w.allLeaders}</h3>
        {people.length ? (
          <ul className={s.list}>
            {people.map((l) => (
              <li key={l.id}>
                <div className={s.what}>
                  <span className={s.title}>{l.title} {l.nameGu}</span>
                  <span className={s.when}>{nn(Number(l.born.slice(3)))} {w.months[Number(l.born.slice(0, 2)) - 1]}{l.post && ` · ${l.post}`}{!l.email && ` · ${w.noEmailShort}`}</span>
                </div>
                <div className={s.acts}>
                  <details className={s.confirm}><summary>{w.edit}</summary><LeaderForm lang={lang} leader={l} /></details>
                  <details className={s.confirm}><summary>{w.removeLeader}</summary>
                    <form action={dropLeaderAction.bind(null, l.id)}><button className={s.no}>{w.sure}</button></form></details>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className={s.empty}>{w.leadersNone}</p>}
        <details className={s.addLeader}><summary className={s.writeBtn}>{w.addLeader}</summary><LeaderForm lang={lang} /></details>
      </section>

      <section className={`${s.block} ${s.ck}`} aria-labelledby="news">
        <div className={s.brandHead}><h2 id="news">{w.ck}</h2><p>{w.ckNote}</p></div>
        <Finder at="news" kind="story" found={news} value={words} which={show} more={link({ n: String(n + PAGE) }, "news")} />
      </section>

      <section className={`${s.block} ${s.av}`} aria-labelledby="aavtikal">
        <div className={s.brandHead}><h2 id="aavtikal">{w.av}</h2><p>{w.avNote}</p></div>
        <Link className={s.writeBtn} href={`/editor/write?for=aavtikal${back ? `&${back}` : ""}`}>{w.avWriteNew}</Link>
        {q.wrote && <p className={s.done} role="status">{w.avWritten} <a href={`/aavtikal/p/${encodeURIComponent(q.wrote)}`} target="_blank" rel="noopener">{w.seeIt}</a></p>}
        {d.av && <>
          <h3 className={s.sub}>{w.avDesk}</h3>
          <p className={d.av.running ? s.running : s.stopped}>{d.av.running ? w.avWorking : w.avResting}</p>
          <dl className={s.use}>
            <div><dt>{w.avNew}</dt><dd>{nn(d.av.published)} / {nn(d.av.target)}</dd></div>
            <div><dt>{w.avOld}</dt><dd>{nn(d.av.rewritten)}{d.av.toRewrite > 0 && <small> · {nn(d.av.toRewrite)} {w.avOldLeft}</small>}</dd></div>
          </dl>
          {d.av.lines.length > 0 && <details className={s.more}><summary>{w.avLog}</summary>
            <ul className={s.runs}>{d.av.lines.map((l, i) => <li key={i}>{l}</li>)}</ul></details>}
        </>}
        <h3 className={s.sub}>{w.drafts}</h3>
        {d.drafts.length ? d.drafts.map((f) => (
          <article key={f.id} className={s.card}>
            <p className={s.tag}>{isBeat(f.beat) ? beatName(f.beat, lang) : f.beat}</p>
            <h3>{f.headline}</h3>
            {f.dek && <p className={s.deck}>{f.dek}</p>}
            <details className={s.more}><summary>{w.read}</summary>{paragraphs(f.body).map((p, i) => <p key={i}>{p.replace(/^#+\s*/, "")}</p>)}</details>
            <div className={s.buttons}>
              <form action={publishFeature.bind(null, f.id)}><button className={s.yes}>{w.publish}</button></form>
              <Link className={s.ghost} href={`/editor/feature/${f.id}${back ? `?${back}` : ""}`}>{w.edit}</Link>
              <form action={removeFeature.bind(null, f.id)}><button className={s.no}>{w.reject}</button></form>
            </div>
          </article>
        )) : <p className={s.empty}>{w.none}</p>}
        <h3 className={s.sub}>{w.published}</h3>
        <Finder at="aavtikal" kind="feature" found={arts} value={fwords} which={fshow} more={link({ fn: String(fn + PAGE) }, "aavtikal")} />
      </section>

      <section className={s.block} aria-labelledby="engine">
        <h2 id="engine">{w.engine}</h2>
        <p className={d.paused ? s.stopped : s.running}>{d.paused ? w.stopped : w.running}</p>
        <form action={pauseEngine.bind(null, !d.paused)}><button className={d.paused ? s.yes : s.no}>{d.paused ? w.start : w.stop}</button></form>
        {d.runs.length > 0 && <>
          <h3 className={s.sub}>{w.lastRuns}</h3>
          <ul className={s.runs}>
            {d.runs.map((r) => (
              <li key={r.at}><span>{time(r.at)}</span><span className={r.ok ? s.ok : s.bad}>{r.ok ? w.ok : w.failed}</span>
                <span className={s.when}>{r.seconds != null && `${nn(r.seconds)} ${w.seconds}`}{r.ai != null && ` · ${nn(r.ai)} ${w.requests}`}</span></li>
            ))}
          </ul>
        </>}
      </section>

      <section className={s.block} aria-labelledby="use">
        <h2 id="use">{w.use}</h2>
        <dl className={s.use}>
          <div><dt>{w.stories}</dt><dd>{nn(d.today.stories)}</dd></div>
          <div><dt>{w.ai}</dt><dd>{nn(d.today.ai)} / {nn(d.today.aiLimit)}</dd></div>
          <div><dt>{w.uploads}</dt><dd>{nn(d.today.uploads)} / {nn(d.today.uploadLimit)}</dd></div>
          <div><dt>{w.cost}</dt><dd>₹{nn(0)}</dd></div>
        </dl>
        <p className={s.empty}>{w.free}</p>
      </section>
    </main>
  );
}
