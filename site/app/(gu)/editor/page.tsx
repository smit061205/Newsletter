// The editor page (ROADMAP §6 phase B, item 4): what waits for the editor's yes or no,
// what's live now, Aavtikal's articles, the engine's stop switch and the day's use.
// Gujarati first, English as a switch (?lang=en); plain words, big buttons.
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import s from "./editor.module.css";
import { approveStory, pauseEngine, publishFeature, rejectStory, removeFeature, removeStory } from "./actions.ts";
import { db } from "@/lib/db.ts";
import { COOKIE, desk, editorOf, signInReady, type DeskStory } from "@/lib/editor.ts";
import { beatName, isBeat } from "@/lib/flagship.ts";
import { num, timeText, shortDate } from "@/lib/format.ts";
import { paragraphs } from "@/lib/format.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "સંપાદક | કેપિટલ ક્રાંતિ", robots: { index: false, follow: false } };

const W = {
  gu: {
    title: "સંપાદકનું પાનું", signIn: "Google વડે પ્રવેશ કરો", signOut: "બહાર નીકળો", lang: "English",
    intro: "અહીં તમે નક્કી કરો છો કે કયા સમાચાર સાઇટ પર જાય.",
    off: "પ્રવેશ હજી ચાલુ નથી: Google પ્રવેશની ગોઠવણ બાકી છે.", again: "પ્રવેશ પૂરો ન થયો. ફરી પ્રયત્ન કરો.",
    refused: "આ Google ખાતાને સંપાદકના પાના પર પ્રવેશ નથી.",
    waiting: "તમારી રાહ જુએ છે", waitingNone: "હમણાં કંઈ બાકી નથી.", why: "કેમ રોક્યું",
    publish: "પ્રકાશિત કરો", reject: "નહીં", read: "આખો સમાચાર વાંચો", sources: "સ્રોત",
    live: "હમણાં સાઇટ પર", liveNone: "એન્જિને હજી કોઈ સમાચાર મૂક્યા નથી.", remove: "સાઇટ પરથી હટાવો", sure: "હા, હટાવો",
    aavtikal: "આવતીકાલના લેખો", drafts: "મંજૂરીની રાહમાં", published: "પ્રકાશિત", none: "કંઈ નથી.",
    engine: "સમાચાર એન્જિન", running: "ચાલુ છે: દર ૧૫ મિનિટે નવા સમાચાર શોધે છે.", stopped: "બંધ છે: કંઈ નવું મુકાતું નથી.",
    stop: "એન્જિન બંધ કરો", start: "એન્જિન ફરી ચાલુ કરો", lastRuns: "છેલ્લી વખત ચાલ્યું", ok: "બરાબર", failed: "ભૂલ",
    use: "આજનો વપરાશ", stories: "છેલ્લા ૨૪ કલાકમાં મુકાયેલા સમાચાર", ai: "AI વિનંતીઓ (મફત)", uploads: "આ મહિને ફોટા ચડાવ્યા", cost: "ખર્ચ",
    free: "મફત મૉડલ જ વપરાય છે.", seconds: "સેકન્ડ", requests: "AI વિનંતી",
  },
  en: {
    title: "Editor's page", signIn: "Sign in with Google", signOut: "Sign out", lang: "ગુજરાતી",
    intro: "Here you decide which news goes on the site.",
    off: "Sign-in isn't on yet: Google sign-in still needs setting up.", again: "Sign-in didn't finish. Try again.",
    refused: "This Google account can't open the editor's page.",
    waiting: "Waiting for you", waitingNone: "Nothing is waiting.", why: "Why it was held",
    publish: "Publish", reject: "Don't publish", read: "Read the whole story", sources: "Sources",
    live: "On the site now", liveNone: "The engine hasn't put any news up yet.", remove: "Take off the site", sure: "Yes, take it off",
    aavtikal: "Aavtikal articles", drafts: "Waiting for approval", published: "Published", none: "Nothing.",
    engine: "News engine", running: "Running: it looks for new news every 15 minutes.", stopped: "Stopped: nothing new goes up.",
    stop: "Stop the engine", start: "Start the engine again", lastRuns: "Last runs", ok: "OK", failed: "Error",
    use: "Today's use", stories: "News put up in the last 24 hours", ai: "AI requests (free)", uploads: "Photos uploaded this month", cost: "Cost",
    free: "Only free models are used.", seconds: "s", requests: "AI requests",
  },
} as const;

export default async function Editor({ searchParams }: { searchParams: Promise<{ lang?: string; signin?: string }> }) {
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

  const d = await desk(db());
  const time = (iso: string) => (iso ? `${shortDate(iso, "gu")}, ${timeText(iso, "gu")}` : "");
  const n = (x: number) => (lang === "gu" ? num(x, "gu") : String(x));

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
        <form action={rejectStory.bind(null, x.id)}><button className={s.no}>{w.reject}</button></form>
      </div>
    </article>
  );

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

      <section className={s.block} aria-labelledby="waiting">
        <h2 id="waiting">{w.waiting} {d.held.length > 0 && <span className={s.count}>{n(d.held.length)}</span>}</h2>
        {d.held.length ? d.held.map((x) => <Held key={x.id} x={x} />) : <p className={s.empty}>{w.waitingNone}</p>}
      </section>

      <section className={s.block} aria-labelledby="aavtikal">
        <h2 id="aavtikal">{w.aavtikal}</h2>
        <h3 className={s.sub}>{w.drafts}</h3>
        {d.drafts.length ? d.drafts.map((f) => (
          <article key={f.id} className={s.card}>
            <p className={s.tag}>{isBeat(f.beat) ? beatName(f.beat, lang) : f.beat}</p>
            <h3>{f.headline}</h3>
            {f.dek && <p className={s.deck}>{f.dek}</p>}
            <details className={s.more}><summary>{w.read}</summary>{paragraphs(f.body).map((p, i) => <p key={i}>{p.replace(/^#+\s*/, "")}</p>)}</details>
            <div className={s.buttons}>
              <form action={publishFeature.bind(null, f.id)}><button className={s.yes}>{w.publish}</button></form>
              <form action={removeFeature.bind(null, f.id)}><button className={s.no}>{w.reject}</button></form>
            </div>
          </article>
        )) : <p className={s.empty}>{w.none}</p>}
        <h3 className={s.sub}>{w.published}</h3>
        <ul className={s.list}>
          {d.features.map((f) => (
            <li key={f.id}>
              <a href={`/aavtikal/p/${f.id}`} target="_blank" rel="noopener">{f.headline}</a>
              <span className={s.when}>{time(f.at)}</span>
              <details className={s.confirm}><summary>{w.remove}</summary>
                <form action={removeFeature.bind(null, f.id)}><button className={s.no}>{w.sure}</button></form></details>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.block} aria-labelledby="live">
        <h2 id="live">{w.live}</h2>
        {d.live.length ? (
          <ul className={s.list}>
            {d.live.map((x) => (
              <li key={x.id}>
                <a href={`/news/${x.id}`} target="_blank" rel="noopener">{x.headline}</a>
                <span className={s.when}>{time(x.at)}</span>
                <details className={s.confirm}><summary>{w.remove}</summary>
                  <form action={removeStory.bind(null, x.id)}><button className={s.no}>{w.sure}</button></form></details>
              </li>
            ))}
          </ul>
        ) : <p className={s.empty}>{w.liveNone}</p>}
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
                <span className={s.when}>{r.seconds != null && `${n(r.seconds)} ${w.seconds}`}{r.ai != null && ` · ${n(r.ai)} ${w.requests}`}</span></li>
            ))}
          </ul>
        </>}
      </section>

      <section className={s.block} aria-labelledby="use">
        <h2 id="use">{w.use}</h2>
        <dl className={s.use}>
          <div><dt>{w.stories}</dt><dd>{n(d.today.stories)}</dd></div>
          <div><dt>{w.ai}</dt><dd>{n(d.today.ai)} / {n(d.today.aiLimit)}</dd></div>
          <div><dt>{w.uploads}</dt><dd>{n(d.today.uploads)} / {n(d.today.uploadLimit)}</dd></div>
          <div><dt>{w.cost}</dt><dd>₹{n(0)}</dd></div>
        </dl>
        <p className={s.empty}>{w.free}</p>
      </section>
    </main>
  );
}
