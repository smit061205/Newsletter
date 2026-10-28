"use client";
// આજે / Today: one card that says where the day's paper stands, in plain
// words, with the one thing to do next -- make it, watch it being made
// (live), look at what needs a look, publish it, print it.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BACKEND, call, media, type IssueInfo, type Job, type StepName, type StoryRow } from "./api";
import { TopBar, useStatus } from "./Shell";
import s from "./newsroom.module.css";
import { num, problems, rupees } from "./ui/format";
import { Badge, Button, Dialog, Icon, Note, Ring, Skeleton, useApp } from "./ui/kit";
import { StoryPanel } from "./ui/StoryPanel";
import type { StringKey } from "./ui/strings";

const STEPS: StepName[] = ["fetch", "rewrite", "topup", "fill", "build"];
// each step's usual share of a run's time (for the overall percentage)
const WEIGHT: Record<StepName, number> = { fetch: 0.12, rewrite: 0.2, topup: 0.16, fill: 0.04, build: 0.48 };

/** How far a run has got, 0-100. */
function percent(job: Job): number {
  let p = 0;
  for (const st of job.steps) {
    const w = WEIGHT[st.name];
    if (st.status === "done" || st.status === "skipped") p += w;
    else if (st.status === "running") {
      const pr = st.progress;
      p += w * (pr && pr.total ? Math.min(0.97, pr.done / pr.total) : 0.05);
    }
  }
  return Math.min(99, p * 100);
}
/** Minutes left, from how long the last finished run's steps took. */
function minutesLeft(job: Job, previous: Job | undefined): number | null {
  if (!previous) return null;
  const dur = (st: Job["steps"][number]) => (st.startedAt && st.endedAt ? (Date.parse(st.endedAt) - Date.parse(st.startedAt)) / 60_000 : 0);
  let left = 0;
  for (const st of job.steps) {
    const prev = previous.steps.find((x) => x.name === st.name);
    const usual = prev ? dur(prev) : 0;
    if (st.status === "waiting") left += usual;
    if (st.status === "running") {
      const pr = st.progress;
      left += usual * (1 - (pr && pr.total ? pr.done / pr.total : 0.1));
    }
  }
  return Math.max(1, Math.round(left));
}

export default function Today() {
  const { t, lang, date, toast, pdf } = useApp();
  const { status, refresh } = useStatus();
  const [job, setJob] = useState<Job | null>(null);
  const [lastDone, setLastDone] = useState<Job | undefined>();
  const [issue, setIssue] = useState<IssueInfo | null>(null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [ticker, setTicker] = useState<string[]>([]);
  const [publishing, setPublishing] = useState<"ask" | "working" | "done" | null>(null);
  const [editing, setEditing] = useState<StoryRow | null>(null);
  const [error, setError] = useState("");
  // the paper asked for while its copies or sister papers are made: it starts when they're done
  const [waiting, setWaiting] = useState<"copies" | "editions" | null>(null);

  const hasIssue = !!status?.issue;
  const issueVersion = status?.issue?.version;
  // the issue only when there is one: no asking blind (status says)
  const loadIssue = useCallback(() => {
    if (!hasIssue) { setIssue(null); return; }
    call<IssueInfo>(`/api/issues/${date}`).then(setIssue).catch(() => setIssue(null));
    call<StoryRow[]>(`/api/stories?date=${date}`).then(setStories).catch(() => {});
  }, [date, hasIssue]);
  useEffect(() => { loadIssue(); }, [loadIssue, issueVersion]);
  // the AI's page review runs after the paper is saved: look again until it's in
  const reviewing = !!issue?.report.gates.some((g) => g.gate.startsWith("5 ") && g.detail === "the page review is running");
  useEffect(() => {
    if (!reviewing) return;
    const id = setInterval(loadIssue, 15_000);
    return () => clearInterval(id);
  }, [reviewing, loadIssue]);
  useEffect(() => {
    setJob(null); setTicker([]); setPublishing(null); setWaiting(null);
    call<Job[]>(`/api/jobs?date=${date}`).then((js) => setJob(js[0] ?? null)).catch(() => {});
    call<Job[]>("/api/jobs").then((js) => setLastDone(js.find((j) => j.status === "done"))).catch(() => {});
  }, [date]);
  // the run, live
  useEffect(() => {
    const es = new EventSource(`${BACKEND}/api/events`);
    es.onmessage = (e) => {
      const { job: j } = JSON.parse(e.data) as { job: Job | null };
      if (!j || j.date !== date) return;
      setJob(j);
      setWaiting(null);
      const item = j.steps.find((x) => x.status === "running")?.progress?.item;
      if (item && !/^\d+$/.test(item)) setTicker((tk) => (tk[0] === item ? tk : [item, ...tk].slice(0, 4)));
      if (j.status !== "running") refresh();
    };
    return () => es.close();
  }, [date, refresh]);

  const running = job?.status === "running";
  const otherRunning = status?.running && status.running.date !== date;
  const report = issue?.report;
  const headlineOf = useCallback((id: string) => stories.find((x) => x.id === id)?.headline, [stories]);
  const todo = useMemo(() => (report ? problems(lang, report.gates, headlineOf, report.whiteSpace) : []), [report, lang, headlineOf]);
  // a page badly empty: not ready, whatever else (28 Oct: called "ready" with a fifth of page 1 blank)
  const badlyEmpty = todo.some((p) => p.bad);
  // the latest run stopped: say where, and offer to carry on from there
  const failed = !running && job?.status === "failed" ? job.steps.find((x) => x.status === "failed") : undefined;

  const run = async (from?: StepName) => {
    setError("");
    try {
      const got = await call<Job | { waitingFor: "copies" | "editions" }>("/api/jobs", { json: { date, ...(from ? { from } : {}) } });
      if ("waitingFor" in got) { setWaiting(got.waitingFor); return; }
      setJob(got); setTicker([]);
    } catch (e) { setError((e as Error).message); }
  };
  const [stopping, setStopping] = useState(false);
  // "start again from the beginning" while a run goes: stop it, then run from the first step
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    if (running) return;
    setStopping(false);
    if (restarting) { setRestarting(false); run(); }
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const restart = async () => {
    if (!window.confirm(t("today.restart.confirm"))) return;
    if (!running) return run();
    setRestarting(true);
    setStopping(true);
    try { await call("/api/jobs/current/stop", { json: {} }); } catch (e) { setError((e as Error).message); setStopping(false); setRestarting(false); }
  };
  const stop = async () => {
    if (!window.confirm(t("stop.confirm"))) return;
    setStopping(true);
    try { await call("/api/jobs/current/stop", { json: {} }); } catch (e) { setError((e as Error).message); setStopping(false); }
  };
  const publish = async () => {
    setPublishing("working");
    try {
      await call(`/api/issues/${date}/publish`, { json: { force: !report?.ready } });
      setPublishing("done");
      refresh();
      loadIssue();
    } catch (e) { setPublishing(null); setError((e as Error).message); }
  };
  const openPdf = () => issue && pdf({ url: media(`/api/issues/${date}/pdf`), title: t("pdf.title", { issue: num(lang, issue.report.issueNumber) }),
                                       fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${issue.report.issueNumber} - ${date.split("-").reverse().join("-")}.pdf` });
  const nextRun = status?.autoRun && status.nextRun
    ? t("today.next", { when: t(status.nextRun.startsWith("today") ? "today.next.today" : "today.next.tomorrow", { time: num(lang, status.runAt) }) })
    : t("today.auto.off");

  return (
    <div className={s.inner}>
      <TopBar title={t("nav.today")} />
      {status && !status.openrouterKey && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div><h2 className={s.cardTitle}>{t("today.setup.title")}</h2><p className={s.muted}>{t("today.setup.body")}</p></div>
            <Link className={`${s.btn} ${s.primary}`} href="/newsroom/settings">{t("today.setup.go")}</Link>
          </div>
        </div>
      )}

      <section className={`${s.card} ${s.hero}`}>
        {running && job ? <Making job={job} previous={lastDone} ticker={ticker} />
          : failed && failed.error === "stopped by the editor" ? (
            <Hero tone="warn" icon={Icon.alert()} title={t("today.stopped.title")} body={t("today.stopped.body")}>
              <Button kind="primary" big icon={Icon.refresh()} onClick={() => run(failed.name)}>{t("today.stopped.go")}</Button>
              <Button big onClick={restart}>{t("today.restart")}</Button>
            </Hero>
          ) : failed ? (
            <Hero tone="bad" icon={Icon.alert()} title={t("today.failed.title")} body={t("today.failed.body", { step: t(`step.${failed.name}` as StringKey) })}>
              <Button kind="primary" big icon={Icon.refresh()} onClick={() => run(failed.name)}>{t("today.retry")}</Button>
              <Button big onClick={restart}>{t("today.restart")}</Button>
            </Hero>
          ) : !hasIssue ? (
            <Hero tone="accent" icon={Icon.sparkle()} title={t("today.none.title")} body={t("today.none.body", { time: num(lang, status?.runAt ?? "20:00") })}>
              <Button kind="primary" big icon={Icon.wand()} onClick={() => run()} disabled={!!otherRunning}>{t("today.make")}</Button>
            </Hero>
          ) : !report ? (
            <div className={s.heroTop}><Skeleton h={56} w={56} /><div className={s.heroText} style={{ flex: 1 }}><Skeleton h={28} w="60%" /><Skeleton h={16} w="40%" /></div></div>
          ) : issue!.status === "approved" ? (
            <Hero tone="good" icon={Icon.checkCircle()} title={t("today.published.title")} body={t("today.published.body", { issue: num(lang, report.issueNumber) })}>
              <Button kind="primary" big icon={Icon.print()} onClick={openPdf}>{t("today.print")}</Button>
              {status?.siteUrl && <a className={`${s.btn} ${s.big}`} href={status.siteUrl} target="_blank" rel="noreferrer">{Icon.globe()}{t("today.website")}</a>}
            </Hero>
          ) : badlyEmpty ? (
            <Hero tone="bad" icon={Icon.alert()} title={t("today.bad.title")} body={t("today.bad.body", { issue: num(lang, report.issueNumber) })}>
              <Button kind="primary" big icon={Icon.refresh()} onClick={() => run()} disabled={!!otherRunning}>{t("today.again")}</Button>
              <Link className={`${s.btn} ${s.big}`} href="/newsroom/pages">{Icon.paper()}{t("today.pages")}</Link>
            </Hero>
          ) : (
            <Hero tone={todo.length ? "warn" : "good"} icon={todo.length ? Icon.alert() : Icon.checkCircle()}
                  title={todo.length ? t("today.look.title", { n: num(lang, todo.length) }) : t("today.ready.title")}
                  body={t("today.ready.body", { issue: num(lang, report.issueNumber), stories: num(lang, report.placed.length), pages: num(lang, report.pages) })}>
              {todo.length > 0 && <Link className={`${s.btn} ${s.big}`} href="/newsroom/review">{t("today.review")}</Link>}
              <Link className={`${s.btn} ${s.big}`} href="/newsroom/pages">{Icon.paper()}{t("today.pages")}</Link>
              <Button kind="primary" big icon={Icon.publish()} onClick={() => setPublishing("ask")}>{t("today.publish")}</Button>
            </Hero>
          )}

        {!running && report && todo.length > 0 && issue!.status !== "approved" && (
          <ul className={s.problemList}>
            {todo.slice(0, 4).map((p, i) => (
              <li key={i}>{Icon.alert()}<span style={{ flex: 1 }}>{p.text}</span>
                {p.story && <Button kind="quiet" onClick={() => setEditing(stories.find((x) => x.id === p.story) ?? null)}>{t("issue.fix")}</Button>}</li>
            ))}
          </ul>
        )}

        {running && (
          <div className={s.row} style={{ justifyContent: "flex-end" }}>
            <Button icon={Icon.refresh()} onClick={restart} disabled={stopping}>{restarting ? t("today.restarting") : t("today.restart")}</Button>
            <Button kind="danger" onClick={stop} disabled={stopping}>{stopping && !restarting ? t("stop.stopping") : t("stop.paper")}</Button>
          </div>
        )}
        {job && <Stepper job={job} />}
        {job && <TimeMeter job={job} />}
        {reviewing && !running && <p className={s.faint}>{t("today.reviewing")}</p>}
        {error && <Note tone="bad">{error}</Note>}
        {waiting && <Note>{t(waiting === "copies" ? "today.waitCopies" : "today.waitPapers")}</Note>}
        {otherRunning && <p className={s.faint}>{t("today.otherRunning", { date: status!.running!.date })}</p>}
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          <span className={s.faint}>{date === status?.today ? nextRun : ""}</span>
          <span className={s.row}>
            {report && <span className={s.faint}>{t("today.cost", { cost: rupees(lang, report.cost, status?.inrPerUsd ?? 88) })}</span>}
            {report && !running && issue!.status !== "approved" && <Button kind="quiet" icon={Icon.print()} onClick={openPdf}>{t("today.print")}</Button>}
            {report && !running && <Button kind="quiet" icon={Icon.refresh()} onClick={() => run()} disabled={!!otherRunning}>{t("today.again")}</Button>}
          </span>
        </div>
        {job && (
          <details className={s.details}>
            <summary>{t("today.details")}</summary>
            <div className={s.logBox}>{job.steps.flatMap((x) => x.log.map((l, i) => <div key={`${x.name}${i}`}>{l}</div>)).slice(-300)}</div>
          </details>
        )}
      </section>

      {publishing && report && (
        <Dialog onClose={() => publishing !== "working" && setPublishing(null)}>
          {publishing === "done" ? (
            <>
              <div className={s.state} data-tone="good">{Icon.checkCircle()}</div>
              <h2 className={s.cardTitle}>{t("publish.done", { issue: num(lang, report.issueNumber) })}</h2>
              <p className={s.muted}>{t("publish.doneBody")}</p>
              <div className={s.row}>
                <Button kind="primary" icon={Icon.print()} onClick={() => { setPublishing(null); openPdf(); }}>{t("today.print")}</Button>
                {status?.siteUrl && <a className={s.btn} href={status.siteUrl} target="_blank" rel="noreferrer">{Icon.globe()}{t("today.website")}</a>}
                <Button kind="quiet" onClick={() => setPublishing(null)}>{t("common.close")}</Button>
              </div>
            </>
          ) : (
            <>
              <h2 className={s.cardTitle}>{t("publish.title")}</h2>
              <p className={s.muted}>{t("publish.body", { issue: num(lang, report.issueNumber) })}</p>
              {todo.length > 0 && <Note tone="warn">{t("publish.notReady", { n: num(lang, todo.length) })}</Note>}
              <div className={s.row} style={{ justifyContent: "flex-end" }}>
                <Button kind="quiet" onClick={() => setPublishing(null)} disabled={publishing === "working"}>{t("edit.cancel")}</Button>
                <Button kind="primary" icon={Icon.publish()} onClick={publish} disabled={publishing === "working"}>
                  {publishing === "working" ? t("publish.working") : t("publish.go")}</Button>
              </div>
            </>
          )}
        </Dialog>
      )}
      {editing && <StoryPanel story={editing} onClose={() => setEditing(null)} onChanged={() => { toast(t("toast.rebuilding")); refresh(); }} />}
    </div>
  );
}

function Hero({ tone, icon, title, body, children }: { tone: string; icon: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <>
      <div className={s.heroTop}>
        <div className={s.state} data-tone={tone}>{icon}</div>
        <div className={s.heroText}><h2 className={s.heroTitle}>{title}</h2><p className={s.muted}>{body}</p></div>
      </div>
      <div className={s.heroActions}>{children}</div>
    </>
  );
}

function Stepper({ job }: { job: Job }) {
  const { t } = useApp();
  return (
    <div className={s.stepper}>
      {STEPS.map((name) => {
        const st = job.steps.find((x) => x.name === name);
        const state = st?.status ?? "waiting";
        const pr = st?.progress;
        const w = state === "done" || state === "skipped" || state === "failed" ? 100 : state === "running" ? (pr && pr.total ? (pr.done / pr.total) * 100 : 8) : 0;
        return (
          <div key={name} className={s.stepItem} data-state={state}>
            <div className={s.stepBar}><span style={{ width: `${w}%` }} /></div>
            <span className={s.stepName}>{t(`step.${name}` as StringKey)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** "3:07" */
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

/** The time meter: a clock from the moment the paper started, and how long
 * each step (and its parts) took -- the longest marked, so the slow part
 * shows itself. Live while the paper is being made; the record after. */
function TimeMeter({ job }: { job: Job }) {
  const { t, lang } = useApp();
  const live = job.status === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  const at = (iso?: string) => (iso ? Date.parse(iso) : 0);
  const end = live ? now : at(job.endedAt) || now;
  const rows = job.steps.filter((x) => x.startedAt).map((x) => ({ step: x, secs: Math.max(0, ((x.endedAt ? at(x.endedAt) : end) - at(x.startedAt)) / 1000) }));
  const most = Math.max(1, ...rows.map((r) => r.secs));
  const partName = (n: string) => {
    const key = `time.part.${n}` as StringKey;
    const got = t(key);
    return got === key ? n : got;
  };
  return (
    <div className={s.timeMeter}>
      <div className={s.timeHead}>
        <span className={s.faint}>{t(live ? "time.running" : "time.took")}</span>
        <strong className={s.timeClock}>{num(lang, clock((end - at(job.startedAt)) / 1000))}</strong>
      </div>
      {rows.map(({ step, secs }) => (
        <div key={step.name} className={s.timeRow} data-slowest={!live && rows.length > 1 && secs === most}>
          <span className={s.timeName}>{t(`step.${step.name}` as StringKey)}</span>
          <span className={s.timeBar}><span style={{ width: `${(secs / most) * 100}%` }} /></span>
          <span className={s.timeSecs}>{num(lang, clock(secs))}</span>
          {!!step.parts?.length && (
            <span className={s.timeParts}>
              {step.parts.map((p, i) => <span key={i}>{partName(p.name)} {num(lang, clock(p.seconds))}</span>)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The paper being made: a page outline filling in story by story, the
 * percentage, what it's doing, and the headlines as they're written. */
function Making({ job, previous, ticker }: { job: Job; previous?: Job; ticker: string[] }) {
  const { t, lang } = useApp();
  const pct = percent(job);
  const left = minutesLeft(job, previous);
  const cur = job.steps.find((x) => x.status === "running");
  const pr = cur?.progress;
  const what = pr ? t(`progress.${pr.label}` as StringKey, { done: num(lang, pr.done), total: num(lang, pr.total), item: num(lang, pr.item ?? "") })
    : cur ? t(`step.${cur.name}` as StringKey) : t("progress.starting");
  const blocks = 18;
  const lit = Math.round((pct / 100) * blocks);
  // a front page's shape: a lead across the top, stories under it
  const span = (i: number) => (i === 0 ? 4 : i < 3 ? 2 : i % 5 === 0 ? 2 : 1);
  return (
    <div className={s.making}>
      <div className={s.sheet} aria-hidden>
        <div className={s.sheetMast}>{t("app.name")}</div>
        <div className={s.sheetBlocks}>
          {Array.from({ length: blocks }, (_, i) => (
            <div key={i} className={s.sheetBlock} data-on={i < lit} data-head={i < 3}
                 style={{ gridColumn: `span ${span(i)}`, gridRow: `span ${i === 0 ? 4 : i < 3 ? 3 : 2}` }} />
          ))}
        </div>
      </div>
      <div className={s.heroText} style={{ gap: 16 }}>
        <h2 className={s.heroTitle}>{t("today.making.title")}</h2>
        <div className={s.ringWrap}>
          <Ring pct={pct} />
          <div className={s.heroText}>
            <strong>{what}</strong>
            <span className={s.muted}>{left && left > 1 ? t("today.making.left", { min: num(lang, left) }) : t("today.making.almost")}</span>
          </div>
        </div>
        {ticker.length > 0 && (
          <div className={s.field}>
            <span className={s.faint}>{t("today.lastHeadlines")}</span>
            <ul className={s.ticker}>{ticker.map((h) => <li key={h}>{h}</li>)}</ul>
          </div>
        )}
        {pr?.label === "waiting" && <Badge tone="warn">{what}</Badge>}
      </div>
    </div>
  );
}
