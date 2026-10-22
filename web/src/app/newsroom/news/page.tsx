"use client";
// સમાચાર / News: every release fetched for the day, from which feed and in
// which language, and what became of it. A Hindi one can be translated here.
import { useCallback, useEffect, useState } from "react";
import { call, type ReleaseRow } from "../api";
import { useDay } from "../Shell";
import styles from "../newsroom.module.css";

const GROUPS: [string, string, (r: ReleaseRow) => boolean][] = [
  ["ગુજરાતી", "Gujarati (PIB Ahmedabad)", (r) => r.lang !== "hi"],
  ["હિન્દીમાંથી અનુવાદ", "Translated from Hindi", (r) => r.lang === "hi" && r.translated],
  ["હિન્દી, વપરાયા નથી", "Hindi, not used", (r) => r.lang === "hi" && !r.translated],
];

export default function News() {
  const { date } = useDay();
  const [rows, setRows] = useState<ReleaseRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => { call<ReleaseRow[]>(`/api/releases?date=${date}`).then(setRows).catch((e) => setError(e.message)); }, [date]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const translate = async (id: number) => {
    setBusy(id);
    setError("");
    try {
      await call(`/api/releases/${id}/translate`, { json: {} });
      load();
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  };

  if (!rows) return <p className={styles.muted}>Loading…</p>;
  if (!rows.length) return <p className={styles.muted}>No news fetched for this day yet. Run the day from <b>Today</b>.</p>;
  return (
    <div className={styles.stack}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {GROUPS.map(([gu, en, test]) => {
        const list = rows.filter(test);
        if (!list.length) return null;
        return (
          <section key={en} className={styles.panel}>
            <h2>{gu} <small>{en} · {list.length}</small></h2>
            <ul className={styles.rows}>
              {list.map((r) => (
                <li key={r.id}>
                  <button className={styles.rowHead} onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                    <span className={styles.rowTitle} lang={r.lang}>{r.headline}</span>
                    <span className={styles.rowMeta}>{r.ministry}</span>
                    <span className={styles.chips}>
                      {r.inPaper && <span className={styles.pill} data-tone="good">In the paper</span>}
                      {!r.inPaper && r.story && <span className={styles.pill}>Story, not placed</span>}
                      {r.roundUp && <span className={styles.pill} data-tone="info">Round-up</span>}
                      {r.photos.length > 0 && <span className={styles.pill}>{r.photos.length} photo{r.photos.length > 1 ? "s" : ""}</span>}
                    </span>
                  </button>
                  {open === r.id && (
                    <div className={styles.rowBody}>
                      <p className={styles.original} lang={r.lang}>{r.body}</p>
                      <div className={styles.actions}>
                        <a className={styles.button} href={r.url} target="_blank" rel="noreferrer">Open on PIB</a>
                        {r.lang === "hi" && !r.translated && (
                          <button className={styles.primary} onClick={() => translate(r.id)} disabled={busy === r.id}>
                            {busy === r.id ? "Translating…" : "ગુજરાતીમાં અનુવાદ કરો · Translate"}
                          </button>
                        )}
                      </div>
                      {r.lang === "hi" && !r.translated && <p className={styles.muted}>A translated story joins the paper on the next build (Pages → Build again).</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
