// The editor's change page for one news story or Aavtikal article: its headline, sub-heading,
// story and photo caption in big boxes, saved with one button, or taken off the site.
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import s from "./editor.module.css";
import { W } from "./words.ts";
import { changeFeature, changeStory, removeFeature, removeStory } from "./actions.ts";
import { db } from "@/lib/db.ts";
import { COOKIE, editorOf, featureFor, storyFor } from "@/lib/editor.ts";
import { timeText, shortDate } from "@/lib/format.ts";

export default async function Change({ kind, id, q }: { kind: "story" | "feature"; id: string; q: { lang?: string; missing?: string } }) {
  const lang = q.lang === "en" ? "en" : "gu";
  const w = W[lang];
  const back = lang === "en" ? "lang=en" : "";
  if (!editorOf((await cookies()).get(COOKIE)?.value)) redirect(`/editor${back ? `?${back}` : ""}`);
  const x = kind === "story" ? await storyFor(db(), id) : await featureFor(db(), id);
  const list = `/editor${back ? `?${back}` : ""}#${kind === "story" ? "news" : "aavtikal"}`;
  const view = kind === "story" ? `/news/${id}` : `/aavtikal/p/${id}`;

  return (
    <main className={s.page} lang={lang === "en" ? "en" : undefined}>
      <header className={s.top}>
        <h1>{kind === "story" ? w.editTitle : w.editFeature}</h1>
        <Link href={list}>← {w.back}</Link>
      </header>
      {!x ? <p className={s.note}>{w.notFound}</p> : x.status === "withdrawn" ? <p className={s.note}>{w.gone}</p> : (
        <form className={s.form} action={(kind === "story" ? changeStory : changeFeature).bind(null, id, back)}>
          <p className={s.when}>
            {kind === "story" ? w.ck : w.av} · {shortDate(x.at, "gu")}, {timeText(x.at, "gu")} ·{" "}
            {x.status === "published" && <a href={view} target="_blank" rel="noopener">{w.view}</a>}
          </p>
          {q.missing && <p className={s.stopped} role="alert">{w.missing}</p>}
          <label>{w.headline}<textarea name="headline" rows={2} required defaultValue={x.headline} className={s.hl} /></label>
          <label>{w.deck}<textarea name="deck" rows={2} defaultValue={x.deck} /></label>
          <label>{w.body}<span className={s.help}>{w.bodyHelp}</span><textarea name="body" rows={18} required defaultValue={x.body} className={s.bodyBox} /></label>
          {x.hasPhoto ? <label>{w.caption}<textarea name="caption" rows={2} defaultValue={x.caption} /></label> : <input type="hidden" name="caption" value={x.caption} />}
          <p className={s.empty}>{w.later}</p>
          <div className={s.buttons}>
            <button className={s.yes}>{w.save}</button>
            <Link className={s.ghost} href={list}>{w.cancel}</Link>
          </div>
        </form>
      )}
      {x && x.status !== "withdrawn" && (
        <details className={`${s.confirm} ${s.danger}`}><summary>{w.remove}</summary>
          <form action={(kind === "story" ? removeStory : removeFeature).bind(null, id)}><button className={s.no}>{w.sure}</button></form></details>
      )}
    </main>
  );
}
