"use client";
// સેટિંગ્સ / Settings: when the day runs by itself, the OpenRouter key the
// writing and translating use, and the app's version.
import { useEffect, useState } from "react";
import { call, type Settings } from "../api";
import { useDay } from "../Shell";
import styles from "../newsroom.module.css";

export default function SettingsPage() {
  const { status } = useDay();
  const [s, setS] = useState<Settings | null>(null);
  const [runAt, setRunAt] = useState("20:00");
  const [autoRun, setAutoRun] = useState(true);
  const [key, setKey] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    call<Settings>("/api/settings").then((x) => { setS(x); setRunAt(x.runAt); setAutoRun(x.autoRun); }).catch((e) => setError(e.message));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setNote("");
    try {
      const x = await call<Settings>("/api/settings", { json: { runAt, autoRun, ...(key ? { openrouterKey: key } : {}) } });
      setS(x);
      setKey("");
      setNote("Saved.");
    } catch (err) { setError((err as Error).message); }
  };

  if (!s) return error ? <p className={styles.error}>{error}</p> : <p className={styles.muted}>Loading…</p>;
  return (
    <div className={styles.twoCol}>
      <section className={styles.panel}>
        <h2>સેટિંગ્સ <small>Settings</small></h2>
        <form className={styles.fields} onSubmit={save}>
          <label className={styles.check}>
            <input type="checkbox" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
            <span>દરરોજ આપમેળે ચલાવો <small>Make the paper by itself every day</small></span>
          </label>
          <label>સમય <small>At (India time; the computer must be on)</small>
            <input type="time" value={runAt} onChange={(e) => setRunAt(e.target.value)} disabled={!autoRun} />
          </label>
          <label>OpenRouter key <small>{s.openrouterKey ? "A key is saved. Paste a new one only to replace it." : "Needed to write and translate the news (sk-or-…)."}</small>
            <input type="password" autoComplete="off" placeholder={s.openrouterKey ? "••••••••  (saved)" : "sk-or-…"} value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <button className={styles.primary} type="submit">સાચવો · Save</button>
          {note && <p className={styles.good}>{note}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </form>
      </section>
      <section className={styles.panel}>
        <h2>વિશે <small>About</small></h2>
        <dl className={styles.facts}>
          <dt>News</dt><dd>PIB Ahmedabad (Gujarati); PIB Delhi (Hindi), translated when the Gujarati news doesn&apos;t fill the paper</dd>
          <dt>Next automatic run</dt><dd>{status?.nextRun ?? "off"}</dd>
          <dt>Version</dt><dd>{status?.version ?? "—"}</dd>
        </dl>
        <p className={styles.muted}>The key is kept only on this computer (in the app&apos;s backend/.env) and never shown again.</p>
      </section>
    </div>
  );
}
