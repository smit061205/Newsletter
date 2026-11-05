"use client";
// Tonight's paper on a sister paper worked on as its own (backend/src/sister.ts):
// where its day stands, "make this paper (again)" from Capital Kranti's day with
// its own ads and changes, its PDF (and CorelDRAW's, in Gujarati), and its pages,
// any story opening its editor (ui/PaperView); its own articles, printed in it alone;
// and its title and footer for the day, a PDF laid over its pages (backend export/frame.ts). No news gathering or evening run here:
// those are Capital Kranti's.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { call, media, type CopiesRun, type Edition, type IssueInfo } from "../api";
import { TopBar, useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { copyDoing, num, problems, rupees } from "./format";
import { Button, Icon, Note, Ring, Skeleton, useApp } from "./kit";
import { BatchTime } from "./BatchTime";
import { PaperView } from "./PaperView";

export function SisterToday() {
  const { t, lang, date, pdf, toast } = useApp();
  const { status, refresh } = useStatus();
  const paper = status!.paper;
  const id = paper.sister!;
  const [issue, setIssue] = useState<IssueInfo | null>(null);
  const [run, setRun] = useState<CopiesRun | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const has = !!status?.issue;
  const version = status?.issue?.version;
  useEffect(() => {
    setIssue(null);
    if (has) call<IssueInfo>(`/api/issues/${date}`).then(setIssue).catch((e) => setError(e.message));
  }, [date, has, version]);

  // the day's sister papers being made: whether this one is among them, and how far it has got
  const look = useCallback(() => {
    call<{ editions: Edition[]; run: CopiesRun | null }>(`/api/issues/${date}/editions`).then((x) => setRun(x.run)).catch(() => {});
  }, [date]);
  useEffect(() => { setRun(null); setWaiting(false); setError(""); look(); }, [look]);
  const going = run?.status === "running";
  const mine = going && !run!.files.some((f) => f.id === id) && (run!.count > 1 || !!run!.parts?.[paper.name]);
  useEffect(() => {
    if (!going && !waiting) return;
    const tick = setInterval(look, 3000);
    return () => clearInterval(tick);
  }, [going, waiting, look]);
  // made (or stopped): its new issue, from the status
  useEffect(() => {
    if (mine) setWaiting(false);
    if (!going) { setStopping(false); refresh(); }
  }, [mine, going, refresh]);

  const make = async () => {
    setError("");
    try {
      const got = await call<{ waitingFor?: string }>(`/api/issues/${date}/build`, { json: {} });
      setWaiting(!!got.waitingFor);
      look();
    } catch (e) { setError((e as Error).message); }
  };
  const stop = async () => {
    if (!window.confirm(t("stop.confirm"))) return;
    setStopping(true);
    try { await call(`/api/issues/${date}/editions/stop`, { json: {} }); look(); } catch (e) { setError((e as Error).message); setStopping(false); }
  };
  const report = issue?.report;
  const fileName = (what: string) => `${paper.name} ${report?.issueNumber ?? ""} - ${date.split("-").reverse().join("-")}${what}.pdf`;
  const openPdf = () => report && pdf({ url: media(`/api/issues/${date}/pdf?v=${version}`), title: `${paper.name} · ${t("pdf.title", { issue: num(lang, report.issueNumber) })}`, fileName: fileName("") });
  const openCorel = () => report && pdf({ url: media(`/api/issues/${date}/editable.pdf?v=${version}`),
    title: t("corel.title", { what: `${paper.name} · ${t("pdf.title", { issue: num(lang, report.issueNumber) })}` }), fileName: fileName(" - CorelDRAW") });
  // (Hindi or Urdu for CorelDRAW with its text editable: a folder in Downloads)
  const saveFolder = () => call<{ folder: string }>(`/api/issues/${date}/editable-folder`, { json: {} })
    .then((r) => toast(t("corel.saved", { folder: r.folder }))).catch((e) => setError((e as Error).message));
  // (what making it again costs: a day of about 45 stories, from what these papers really cost)
  const rate = status?.costRates?.[paper.lang && paper.lang !== "gu" ? `translate-${paper.lang}` : "headlineDeck"] ?? 0;
  const failed = !going && run?.status === "failed" && !run.files.some((f) => f.id === id);
  const pct = Math.round((run?.parts?.[paper.name]?.share ?? 0) * 100);
  // (what needs a look: listed beside its pages)
  const todo = report ? problems(lang, report.gates, () => undefined, report.whiteSpace).length : 0;

  return (
    <div className={`${s.inner} ${s.wide}`}>
      <TopBar title={t("nav.today")} />
      <section className={`${s.card} ${s.hero}`}>
        {mine ? (
          <div className={s.heroTop}>
            <Ring pct={pct} />
            <div className={s.heroText}><h2 className={s.heroTitle}>{t("sister.making", { name: paper.name, pct: num(lang, pct) })}</h2>
              <p className={s.muted}>{run?.parts?.[paper.name] ? copyDoing(lang, run.parts[paper.name].what) : t("progress.starting")}</p></div>
          </div>
        ) : !has ? (
          <Hero tone="accent" icon={Icon.sparkle()} title={t("sister.none.title", { name: paper.name })} body={t("sister.none.body")}>
            <Button kind="primary" big icon={Icon.wand()} onClick={make} disabled={waiting || going}>{t("sister.make")}</Button>
          </Hero>
        ) : !report ? (
          <div className={s.heroTop}><Skeleton h={56} w={56} /><div className={s.heroText} style={{ flex: 1 }}><Skeleton h={28} w="60%" /><Skeleton h={16} w="40%" /></div></div>
        ) : (
          <Hero tone={todo ? "warn" : "good"} icon={todo ? Icon.alert() : Icon.checkCircle()} title={todo ? t("today.look.title", { n: num(lang, todo) }) : t("today.ready.title")}
                body={t("sister.ready.body", { issue: num(lang, report.issueNumber), stories: num(lang, report.placed.length), pages: num(lang, report.pages) })}>
            <Button kind="primary" big icon={Icon.download()} onClick={openCorel}>{t("today.corel")}</Button>
            {(paper.lang === "ur" || paper.lang === "hi") && <Button big icon={Icon.download()} onClick={saveFolder}>{t("corel.editable")}</Button>}
            <Button big icon={Icon.print()} onClick={openPdf}>{t("today.print")}</Button>
          </Hero>
        )}
        {mine && <div className={s.row} style={{ justifyContent: "flex-end" }}>
          <Button kind="danger" onClick={stop} disabled={stopping}>{stopping ? t("stop.stopping") : t("stop.papers")}</Button></div>}
        {/* (how long it's taking, and what it's doing, as Capital Kranti's run shows) */}
        {run && (mine || run.files.some((f) => f.id === id)) && <>
          <BatchTime run={run} />
          <details className={s.details} open={mine}>
            <summary>{t("today.details")}</summary>
            <div className={s.logBox}>{run.log.map((l, i) => <div key={i}>{l}</div>)}</div>
          </details>
        </>}
        {error && <Note tone="bad">{error}</Note>}
        {failed && <Note tone="bad">{t("sister.failed", { error: run?.error ?? "" })}</Note>}
        {(waiting || (going && !mine)) && <Note>{t("sister.waiting")}</Note>}
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          <span className={s.faint}>{t("sister.cost", { cost: rupees(lang, 45 * rate, status?.inrPerUsd ?? 88) })}</span>
          <div className={s.row}>
            <Link className={s.btn} href="/newsroom/stories?tab=articles">{Icon.stories()}{t("sister.articles")}</Link>
            {has && !mine && <Button kind="quiet" icon={Icon.refresh()} onClick={make} disabled={waiting || going}>{t("sister.again")}</Button>}
          </div>
        </div>
      </section>
      <Frame date={date} />
      {has && !mine && <PaperView problems />}
    </div>
  );
}

/** The day's title and footer: a PDF of the paper's size, printed over its pages (an earlier day's
 * where this one has none), its date changed to the day the paper carries. */
type FrameInfo = { pages: number; dates: number; from: string };
function Frame({ date }: { date: string }) {
  const { t, lang, toast } = useApp();
  const [frame, setFrame] = useState<FrameInfo | null | undefined>(undefined);
  const pages = frame === undefined ? undefined : frame?.pages ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setFrame(undefined); setError("");
    call<{ frame: FrameInfo | null }>(`/api/issues/${date}/frame`).then((x) => setFrame(x.frame)).catch((e) => setError(e.message));
  }, [date]);
  const add = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const base64 = await new Promise<string>((ok, bad) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",")[1]);
        r.onerror = () => bad(new Error("couldn't read that file"));
        r.readAsDataURL(file);
      });
      const x = await call<{ frame: FrameInfo | null }>(`/api/issues/${date}/frame`, { json: { base64 } });
      setFrame(x.frame);
      toast(t("frame.saved"));
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  const remove = async () => {
    setBusy(true); setError("");
    try { await call(`/api/issues/${date}/frame`, { method: "DELETE" }); setFrame(null); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{t("frame.title")}</h2>
      <p className={s.muted}>{!frame ? t("frame.none") : frame.from === date ? t("frame.has", { n: num(lang, frame.pages) })
        : t("frame.earlier", { day: num(lang, frame.from.split("-").reverse().join("-")) })}{frame && frame.dates > 0 ? ` ${t("frame.dated")}` : ""}</p>
      {error && <Note tone="bad">{error}</Note>}
      <div className={s.row}>
        <label className={s.btn} aria-disabled={busy || pages === undefined}>
          {Icon.download()}{pages ? t("frame.replace") : t("frame.add")}
          <input type="file" accept="application/pdf,.pdf" hidden disabled={busy || pages === undefined}
                 onChange={(e) => { add(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {frame && frame.from === date && <Button kind="quiet" onClick={remove} disabled={busy}>{t("frame.remove")}</Button>}
      </div>
    </section>
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
