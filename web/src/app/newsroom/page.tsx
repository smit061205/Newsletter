"use client";
// આજનું છાપું / Tonight's paper: one card that says where the day's paper
// stands, in plain words, with the one thing to do next -- make it, watch it
// being made (live), look at what needs a look, save it for CorelDRAW, print
// it -- and the pages under it, any story opening its editor (ui/PaperView).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BACKEND, call, media, type IssueInfo, type Job, type StepName, type StoryRow } from "./api";
import { TopBar, useStatus } from "./Shell";
import s from "./newsroom.module.css";
import { num, problems, rupees } from "./ui/format";
import { Badge, Button, Icon, Note, Ring, Skeleton, useApp } from "./ui/kit";
import { PaperView } from "./ui/PaperView";
import { SisterToday } from "./ui/SisterToday";
import { StoryPanel } from "./ui/StoryPanel";
import { TitleDialog } from "./ui/TitleDialog";
import type { StringKey } from "./ui/strings";

const STEPS: StepName[] = ["fetch", "rewrite", "topup", "fill", "build", "sections"];
// each step's usual share of a run's time (for the overall percentage)
const WEIGHT: Record<StepName, number> = { fetch: 0.1, rewrite: 0.18, topup: 0.14, fill: 0.04, build: 0.42, sections: 0.12 };

/** How far a run has got, 0-100. */
function percent(job: Job): number {
  let p = 0;
  for (const st of job.steps) {
    const w = WEIGHT[st.name];
    if (st.status === "done" || st.status === "skipped") p += w;
    else if (st.status === "running") {
      const pr = st.progress;
      // (the stories' lengths come before the pages, which count from half way: 87% then 69%, 10 Nov)
      const part = pr && pr.total ? pr.done / pr.total * (pr.label === "lengths" ? 0.45 : 1) : 0.05;
      p += w * Math.min(0.97, part);
    }
  }
  return Math.min(99, p * 100);
}
/** The most a run has shown: a page laid out again starts its count over, the number never goes back. */
const shown = new Map<string, number>();
function percentShown(job: Job): number {
  const pct = Math.max(percent(job), shown.get(job.startedAt) ?? 0);
  shown.set(job.startedAt, pct);
  return pct;
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
  const { status } = useStatus();
  // (a sister paper worked on as its own: its own day, made from Capital Kranti's)
  return status?.paper.sister ? <SisterToday /> : <PaperToday />;
}

function PaperToday() {
  const { t, lang, date, toast, pdf } = useApp();
  const { status, refresh } = useStatus();
  const [job, setJob] = useState<Job | null>(null);
  const [lastDone, setLastDone] = useState<Job | undefined>();
  const [issue, setIssue] = useState<IssueInfo | null>(null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [ticker, setTicker] = useState<string[]>([]);
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
    setJob(null); setTicker([]); setWaiting(null);
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
  // the 4 pages are saved before the 8-page paper is made: theirs to open meanwhile
  // (the developer, 5 Nov: "i can't access my 4 page pdf even if it is made")
  const fourMade = !running || !!job?.steps.some((x) => x.name === "build" && (x.status === "done" || x.status === "skipped"));
  const otherRunning = status?.running && status.running.date !== date;
  const report = issue?.report;
  const headlineOf = useCallback((id: string) => stories.find((x) => x.id === id)?.headline, [stories]);
  const todo = useMemo(() => (report ? problems(lang, report.gates, headlineOf, report.whiteSpace) : []), [report, lang, headlineOf]);
  // a page badly empty: not ready, whatever else (28 Oct: called "ready" with a fifth of page 1 blank)
  const badlyEmpty = todo.some((p) => p.bad);
  // the latest run stopped: say where, and offer to carry on from there
  const failed = !running && job?.status === "failed" ? job.steps.find((x) => x.status === "failed") : undefined;
  // (9 Nov: no internet, and the screen only said to try again)
  const offline = !!failed?.error?.startsWith("no internet");

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
  // the title's date and number changed after the paper is made (ui/TitleDialog): the pages shown again
  const [retitling, setRetitling] = useState(false);
  const [titled, setTitled] = useState(0);
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
  const openPdf = () => issue && pdf({ url: media(`/api/issues/${date}/pdf`), title: t("pdf.title", { issue: num(lang, issue.report.issueNumber) }),
                                       fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${issue.report.issueNumber} - ${date.split("-").reverse().join("-")}.pdf` });
  // the paper as a PDF whose text stays text in CorelDRAW, where the editor finishes it
  const openCorel = () => issue && pdf({ url: media(`/api/issues/${date}/editable.pdf`),
    title: t("corel.title", { what: t("pdf.title", { issue: num(lang, issue.report.issueNumber) }) }),
    fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${issue.report.issueNumber} - ${date.split("-").reverse().join("-")} - CorelDRAW.pdf` });
  const openCorel8 = () => issue && pdf({ url: media(`/api/issues/${date}/editable8.pdf`),
    title: t("corel.title", { what: t("pdf.title8", { issue: num(lang, issue.report.issueNumber) }) }),
    fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${issue.report.issueNumber} - ${date.split("-").reverse().join("-")} - 8 - CorelDRAW.pdf` });
  // (the 8-page paper, made beside it)
  const openPdf8 = () => issue && pdf({ url: media(`/api/issues/${date}/pdf8`), title: t("pdf.title8", { issue: num(lang, issue.report.issueNumber) }),
                                        fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${issue.report.issueNumber} - ${date.split("-").reverse().join("-")} - 8.pdf` });
  const nextRun = status?.autoRun && status.nextRun
    ? t("today.next", { when: t(status.nextRun.startsWith("today") ? "today.next.today" : "today.next.tomorrow", { time: num(lang, status.runAt) }) })
    : t("today.auto.off");

  return (
    <div className={`${s.inner} ${s.wide}`}>
      <TopBar title={t("nav.today")} />
      {status && !status.openrouterKey && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <div><h2 className={s.cardTitle}>{t("today.setup.title")}</h2><p className={s.muted}>{t("today.setup.body")}</p></div>
            <Link className={`${s.btn} ${s.primary}`} href="/newsroom/settings#more">{t("today.setup.go")}</Link>
          </div>
        </div>
      )}

      {status?.aiOutOfMoney && !running && (
        <div className={s.card}>
          <h2 className={s.cardTitle}>{t("today.money.title")}</h2>
          <p className={s.muted}>{t("today.money.body")}</p>
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
            <Hero tone="bad" icon={Icon.alert()} title={t(offline ? "today.offline.title" : "today.failed.title")}
                  body={offline ? t("today.offline.body") : t("today.failed.body", { step: t(`step.${failed.name}` as StringKey) })}>
              <Button kind="primary" big icon={Icon.refresh()} onClick={() => run(failed.name)}>{t("today.retry")}</Button>
              <Button big onClick={restart}>{t("today.restart")}</Button>
            </Hero>
          ) : !hasIssue ? (
            <Hero tone="accent" icon={Icon.sparkle()} title={t("today.none.title")} body={t("today.none.body", { time: num(lang, status?.runAt ?? "20:00") })}>
              <Button kind="primary" big icon={Icon.wand()} onClick={() => run()} disabled={!!otherRunning}>{t("today.make")}</Button>
            </Hero>
          ) : !report ? (
            <div className={s.heroTop}><Skeleton h={56} w={56} /><div className={s.heroText} style={{ flex: 1 }}><Skeleton h={28} w="60%" /><Skeleton h={16} w="40%" /></div></div>

          ) : badlyEmpty ? (
            <Hero tone="bad" icon={Icon.alert()} title={t("today.bad.title")} body={t("today.bad.body", { issue: num(lang, report.issueNumber) })}>
              <Button kind="primary" big icon={Icon.refresh()} onClick={() => run()} disabled={!!otherRunning}>{t("today.again")}</Button>
            </Hero>
          ) : (
            <Hero tone={todo.length ? "warn" : "good"} icon={todo.length ? Icon.alert() : Icon.checkCircle()}
                  title={todo.length ? t("today.look.title", { n: num(lang, todo.length) }) : t("today.ready.title")}
                  body={t("today.ready.body", { issue: num(lang, report.issueNumber), stories: num(lang, report.placed.length), pages: num(lang, report.pages) })}>
              {todo.length > 0 && <Link className={`${s.btn} ${s.big}`} href="/newsroom/review">{t("today.review")}</Link>}
              <Button kind="primary" big icon={Icon.download()} onClick={openCorel}>{t("today.corel")}</Button>
            </Hero>
          )}

        {!running && report && todo.length > 0 && (
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
        {/* the steps and their times while it's made (or where it stopped); after, under the details */}
        {job && (running || job.status === "failed") && <Stepper job={job} />}
        {job && running && <TimeMeter job={job} />}
        {reviewing && !running && <p className={s.faint}>{t("today.reviewing")}</p>}
        {error && <Note tone="bad">{error}</Note>}
        {waiting && <Note>{t(waiting === "copies" ? "today.waitCopies" : "today.waitPapers")}</Note>}
        {otherRunning && <p className={s.faint}>{t("today.otherRunning", { date: status!.running!.date })}</p>}
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          <span className={s.faint}>{date === status?.today ? nextRun : ""}</span>
          <span className={s.row}>
            {report && <span className={s.faint}>{t("today.cost", { cost: rupees(lang, report.cost, status?.inrPerUsd ?? 88) })}</span>}
            {report && running && fourMade && <Button kind="quiet" icon={Icon.download()} onClick={openCorel}>{t("today.corel")}</Button>}
            {report && fourMade && <Button kind="quiet" icon={Icon.print()} onClick={openPdf}>{t("today.print")}</Button>}
            {report && !running && issue!.eight && <Button kind="quiet" icon={Icon.print()} onClick={openPdf8}>{t("today.print8")}</Button>}
            {report && !running && issue!.eightEditable && <Button kind="quiet" icon={Icon.download()} onClick={openCorel8}>{t("corel.pdf8")}</Button>}
            {report && !running && !otherRunning && <Button kind="quiet" icon={Icon.calendar()} onClick={() => setRetitling(true)}>{t("title.open")}</Button>}
            {report && !running && <Button kind="quiet" icon={Icon.refresh()} onClick={() => run()} disabled={!!otherRunning}>{t("today.again")}</Button>}
          </span>
        </div>
        {job && (
          <details className={s.details}>
            <summary>{t("today.details")}</summary>
            {!running && <TimeMeter job={job} />}
            <div className={s.logBox}>{job.steps.flatMap((x) => x.log.map((l, i) => <div key={`${x.name}${i}`}>{l}</div>)).slice(-300)}</div>
          </details>
        )}
      </section>

      {hasIssue && !running && <PaperView key={titled} onChanged={loadIssue} />}
      {retitling && <TitleDialog onClose={() => setRetitling(false)} onDone={() => { loadIssue(); setTitled((k) => k + 1); }} />}
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
  // a part's name in the editor's language ("laying out again 2": the name, then its round)
  const partName = (n: string) => {
    const [, name, round] = n.match(/^(.*?)(?: (\d+))?$/) ?? [n, n, ""];
    const key = `time.part.${name}` as StringKey;
    const got = t(key);
    return `${got === key ? t("time.part.other") : got}${round ? ` ${num(lang, round)}` : ""}`;
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
  const pct = percentShown(job);
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
