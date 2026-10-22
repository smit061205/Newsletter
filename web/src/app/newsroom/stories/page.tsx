"use client";
// લેખ / Stories: the day's stories as they'll print. Edit any one -- its
// headline, sub-heading, text, photo or rank -- or leave it out; every
// change lays the paper out again. A translation shows its Hindi beside it.
import { useCallback, useEffect, useState } from "react";
import { call, media, type ReleaseRow, type StoryRow } from "../api";
import { useDay } from "../Shell";
import styles from "../newsroom.module.css";

type Draft = { kicker: string; headline: string; deck: string; body: string; caption: string; priority: number; photo: string | null };
const draftOf = (s: StoryRow): Draft => ({ kicker: s.kicker, headline: s.headline, deck: s.deck, body: s.bodies.long, caption: s.caption, priority: s.priority, photo: s.photo });

export default function Stories() {
  const { date } = useDay();
  const [stories, setStories] = useState<StoryRow[] | null>(null);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    call<StoryRow[]>(`/api/stories?date=${date}`).then(setStories).catch((e) => setError(e.message));
    call<ReleaseRow[]>(`/api/releases?date=${date}`).then(setReleases).catch(() => {});
  }, [date]);
  useEffect(() => { setStories(null); setOpenId(null); load(); }, [load]);
  useEffect(() => {
    // a story opened from the Pages screen
    try {
      const want = sessionStorage.getItem("nr-open-story");
      if (want) { sessionStorage.removeItem("nr-open-story"); setOpenId(want); }
    } catch {}
  }, []);
  useEffect(() => {
    const s = stories?.find((x) => x.id === openId);
    setDraft(s ? draftOf(s) : null);
  }, [openId, stories]);

  const send = async (storyId: string, change: Record<string, unknown>, done: string) => {
    setError("");
    try {
      await call(`/api/issues/${date}/edits`, { json: { storyId, change } });
      setNote(done);
      load();
    } catch (e) { setError((e as Error).message); }
  };
  const save = (s: StoryRow) => {
    if (!draft) return;
    const was = draftOf(s);
    const change = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== was[k as keyof Draft]));
    if (!Object.keys(change).length) return setNote("Nothing changed.");
    send(s.id, change, "Saved. The pages are being laid out again: see Today or Pages in a few minutes.");
  };

  if (!stories) return <p className={styles.muted}>Loading…</p>;
  if (!stories.length) return <p className={styles.muted}>No stories for this day yet. Run the day from <b>Today</b>.</p>;
  const sorted = [...stories].sort((a, b) => Number(a.dropped) - Number(b.dropped) || (a.page ?? 9) - (b.page ?? 9) || a.priority - b.priority);

  return (
    <div className={styles.stack}>
      {note && <p className={styles.good}>{note}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <section className={styles.panel}>
        <h2>લેખ <small>Stories · {stories.length}</small></h2>
        <ul className={styles.rows}>
          {sorted.map((s) => {
            const originals = releases.filter((r) => r.id === s.releaseId || s.mergedFrom?.includes(r.id));
            return (
              <li key={s.id} data-dropped={s.dropped}>
                <button className={styles.rowHead} onClick={() => setOpenId(openId === s.id ? null : s.id)} aria-expanded={openId === s.id}>
                  <span className={styles.rowTitle}>{s.headline}</span>
                  <span className={styles.rowMeta}>{s.deck}</span>
                  <span className={styles.chips}>
                    {s.dropped ? <span className={styles.pill} data-tone="bad">Left out</span>
                      : s.page ? <span className={styles.pill} data-tone="good">Page {s.page}, {s.cols} col</span>
                      : <span className={styles.pill}>Not placed</span>}
                    {s.translatedFrom && <span className={styles.pill} data-tone="info">From Hindi</span>}
                    {(s.mergedFrom?.length ?? 0) > 1 && <span className={styles.pill} data-tone="info">Round-up of {s.mergedFrom!.length}</span>}
                    {s.id.startsWith("f-") && <span className={styles.pill}>Feature</span>}
                    {s.factCheck && <span className={styles.pill} data-tone="bad">Check the numbers</span>}
                    {s.edited && <span className={styles.pill}>Edited</span>}
                  </span>
                </button>
                {openId === s.id && draft && (
                  <div className={styles.editor}>
                    {s.factCheck && <p className={styles.warn}>{s.factCheck}. Compare with the original below.</p>}
                    <div className={styles.editGrid}>
                      <div className={styles.fields}>
                        <label>ઉપર શીર્ષક <small>Kicker (optional)</small><input value={draft.kicker} onChange={(e) => setDraft({ ...draft, kicker: e.target.value })} /></label>
                        <label>શીર્ષક <small>Headline</small><textarea rows={2} value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} /></label>
                        <label>પેટા શીર્ષક <small>Sub-heading</small><textarea rows={2} value={draft.deck} onChange={(e) => setDraft({ ...draft, deck: e.target.value })} /></label>
                        <label>લેખ <small>Text (a blank line between paragraphs)</small><textarea rows={14} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
                        <label>મહત્વ <small>Rank: 1 is the day&apos;s lead, 5 a brief</small>
                          <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </label>
                        {(s.photos?.length || originals.some((o) => o.photos.length)) ? (
                          <fieldset className={styles.photos}>
                            <legend>ફોટો <small>Photo</small></legend>
                            <label><input type="radio" checked={draft.photo === null} onChange={() => setDraft({ ...draft, photo: null })} /> None</label>
                            {[...new Set([...(s.photos ?? []), ...originals.flatMap((o) => o.photos)])].map((p) => (
                              <label key={p}><input type="radio" checked={draft.photo === p} onChange={() => setDraft({ ...draft, photo: p })} />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={media(p)} alt="" /></label>
                            ))}
                          </fieldset>
                        ) : null}
                        {draft.photo && <label>ફોટો નીચે <small>Caption</small><input value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} /></label>}
                        <div className={styles.actions}>
                          <button className={styles.primary} onClick={() => save(s)}>સાચવો · Save</button>
                          <button onClick={() => setDraft(draftOf(s))}>Undo changes</button>
                          {s.dropped
                            ? <button onClick={() => send(s.id, { drop: false }, "Back in the paper: laying the pages out again.")}>Put it back</button>
                            : <button className={styles.danger} onClick={() => send(s.id, { drop: true }, "Left out: laying the pages out again.")}>Leave it out</button>}
                        </div>
                      </div>
                      {originals.length > 0 && (
                        <aside className={styles.originalPane}>
                          <h3>મૂળ પ્રેસ રિલીઝ <small>The original{s.translatedFrom ? " (Hindi)" : ""}</small></h3>
                          {originals.map((o) => (
                            <div key={o.id}>
                              <p className={styles.originalHead} lang={o.lang}>{o.headline}</p>
                              <p className={styles.original} lang={o.lang}>{o.body}</p>
                              <a href={o.url} target="_blank" rel="noreferrer">Open on PIB</a>
                            </div>
                          ))}
                        </aside>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
