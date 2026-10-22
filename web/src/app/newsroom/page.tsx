"use client";
// આજે / Today: the day's run step by step with its live log, the checks the
// issue passed, and Approve & Publish.
import { useCallback, useEffect, useRef, useState } from "react";
import { BACKEND, call, gateLabel, media, STEP_LABEL, type IssueInfo, type Job, type StepName } from "./api";
import { useDay } from "./Shell";
import styles from "./newsroom.module.css";

const STEPS: StepName[] = ["fetch", "rewrite", "topup", "fill", "build"];

export default function Today() {
  const { date, status, refreshStatus } = useDay();
  const [job, setJob] = useState<Job | null>(null);
  const [issue, setIssue] = useState<IssueInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [published, setPublished] = useState("");
  const logEnd = useRef<HTMLDivElement>(null);

  const loadIssue = useCallback(() => {
    call<IssueInfo>(`/api/issues/${date}`).then(setIssue).catch(() => setIssue(null));
  }, [date]);
  const loadJob = useCallback(() => {
    call<Job[]>(`/api/jobs?date=${date}`).then((js) => setJob(js[0] ?? null)).catch(() => {});
  }, [date]);

  useEffect(() => {
    setPublished("");
    loadIssue();
    loadJob();
  }, [loadIssue, loadJob]);

  // the run's live log
  useEffect(() => {
    const es = new EventSource(`${BACKEND}/api/events`);
    es.onmessage = (e) => {
      const { job: j } = JSON.parse(e.data) as { job: Job | null };
      if (!j || j.date !== date) return;
      setJob(j);
      if (j.status !== "running") { loadIssue(); refreshStatus(); }
    };
    return () => es.close();
  }, [date, loadIssue, refreshStatus]);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: "nearest" }); }, [job]);

  const otherRunning = status?.running && status.running.date !== date;
  const running = job?.status === "running";

  const run = async (from?: StepName) => {
    setError("");
    setBusy("run");
    try {
      const j = await call<Job>("/api/jobs", { json: { date, ...(from ? { from } : {}) } });
      setJob(j);
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  };
  const publish = async () => {
    setError("");
    setBusy("publish");
    try {
      await call(`/api/issues/${date}/publish`, { json: { force: !issue?.report.ready } });
      setPublished("Published: the website shows this issue in a minute or two.");
      loadIssue();
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  };

  const failed = job?.steps.find((s) => s.status === "failed");
  const report = issue?.report;
  const lines = job?.steps.flatMap((s) => s.log.map((l) => [s.name, l] as const)) ?? [];

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h1>{new Date(`${date}T12:00:00`).toLocaleDateString("gu-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h1>
          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => run()} disabled={running || !!otherRunning || busy === "run"}>
              {running ? "ચાલી રહ્યું છે… Running" : job ? "ફરી ચલાવો · Run again" : "હમણાં ચલાવો · Run now"}
            </button>
            {failed && !running && (
              <button onClick={() => run(failed.name)}>Retry from “{STEP_LABEL[failed.name][1]}”</button>
            )}
          </div>
        </div>
        {status?.nextRun && <p className={styles.muted}>The next automatic run: {status.nextRun.replace("today", "today at").replace("tomorrow", "tomorrow at")}.</p>}
        {otherRunning && <p className={styles.muted}>A run for {status!.running!.date} is going; this day can run after it.</p>}
        {!status?.openrouterKey && status && <p className={styles.warn}>No OpenRouter key yet: add it in <b>Settings</b>, or the news is printed as PIB wrote it, with nothing translated.</p>}

        <ol className={styles.steps}>
          {STEPS.map((name) => {
            const s = job?.steps.find((x) => x.name === name);
            const state = s?.status ?? "waiting";
            return (
              <li key={name} className={styles.step} data-state={state}>
                <span className={styles.stepDot} aria-hidden />
                <span className={styles.stepName}>{STEP_LABEL[name][0]}<small>{STEP_LABEL[name][1]}</small></span>
                <span className={styles.stepState}>
                  {{ waiting: "—", running: "ચાલે છે", done: "થયું", failed: "અટક્યું", skipped: "છોડ્યું" }[state]}
                </span>
                {s?.error && <span className={styles.stepError}>{s.error}</span>}
              </li>
            );
          })}
        </ol>

        {lines.length > 0 && (
          <details className={styles.log} open={running}>
            <summary>What it did ({lines.length} lines)</summary>
            <div className={styles.logBody}>
              {lines.slice(-400).map(([step, l], i) => <div key={i}><span>{step}</span>{l}</div>)}
              <div ref={logEnd} />
            </div>
          </details>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>

      {report && (
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2>અંક {report.issueNumber} <small>Issue {report.issueNumber}, version {issue!.version}</small></h2>
            <span className={styles.pill} data-tone={report.ready ? "good" : "bad"}>{report.ready ? "છાપવા તૈયાર · Ready" : "તપાસ બાકી · Needs a look"}</span>
            {issue!.status === "approved" && <span className={styles.pill} data-tone="info">Approved</span>}
          </div>
          <ul className={styles.gates}>
            {report.gates.map((g) => (
              <li key={g.gate} data-pass={g.pass} title={g.detail}>
                <span aria-hidden>{g.pass ? "✓" : "!"}</span>{gateLabel(g.gate)}
                {!g.pass && <small>{g.detail}</small>}
              </li>
            ))}
          </ul>
          <p className={styles.muted}>
            {report.placed.length} stories on {report.pages} pages{report.leftOut.length ? `, ${report.leftOut.length} left out for room` : ""} · AI cost ${report.cost.toFixed(3)}
          </p>
          <div className={styles.actions}>
            <a className={styles.button} href={media(`/api/issues/${date}/pdf`)} target="_blank" rel="noreferrer">PDF છાપવા માટે · Print PDF</a>
            <button className={styles.primary} onClick={publish} disabled={busy === "publish" || running}>
              {busy === "publish" ? "Publishing…" : report.ready ? "મંજૂર કરી પ્રકાશિત કરો · Approve & Publish" : "તો પણ પ્રકાશિત કરો · Publish anyway"}
            </button>
          </div>
          {!report.ready && <p className={styles.warn}>This issue didn&apos;t pass every check. Look at the pages first; publishing it anyway is your call.</p>}
          {published && <p className={styles.good}>{published}</p>}
        </section>
      )}
      {!report && !running && <p className={styles.muted}>No paper for this day yet. Press <b>Run now</b> to make it.</p>}
    </div>
  );
}
