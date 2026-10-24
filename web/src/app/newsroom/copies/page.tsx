"use client";
// નકલો / Copies: copies of the day's paper -- how many, what the AI rewords,
// how far the stories move -- made in the background, each copy a print PDF
// with its masthead, page headers and footer left empty for the paper's own
// (backend/src/editorial/copies.ts).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { batchProgress, call, media, type CopiesRun, type IssueInfo, type Job, type PaperLang, type Reword, type Shuffle } from "../api";
import { TopBar, useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { BatchTime } from "../ui/BatchTime";
import { num, rupees } from "../ui/format";
import { Badge, Button, Empty, Icon, Note, Ring, useApp } from "../ui/kit";
import type { StringKey } from "../ui/strings";

const REWORDS: Reword[] = ["headline", "headlineDeck", "all"];
// (Urdu waits for its own fonts and layout)
const LANGS: PaperLang[] = ["gu", "hi"];
const SHUFFLES: Shuffle[] = ["keepLead", "anywhere", "samePage"];

export default function Copies() {
  const { t, lang, date, toast, pdf } = useApp();
  const { status } = useStatus();
  const [info, setInfo] = useState<IssueInfo | null>(null);
  const [run, setRun] = useState<CopiesRun | null>(null);
  const [minutesPerCopy, setMinutesPerCopy] = useState(3);
  const [count, setCount] = useState(3);
  const [reword, setReword] = useState<Reword>("headlineDeck");
  const [shuffle, setShuffle] = useState<Shuffle>("keepLead");
  const [paperLang, setPaperLang] = useState<PaperLang>("gu");
  const translated = paperLang !== "gu";
  const [error, setError] = useState("");
  const has = !!status?.issue;

  const load = useCallback(() => {
    call<CopiesRun | null>(`/api/issues/${date}/copies`).then(setRun).catch(() => {});
  }, [date]);
  useEffect(() => {
    setInfo(null); setRun(null); setError("");
    if (!has) return;
    call<IssueInfo>(`/api/issues/${date}`).then(setInfo).catch(() => {});
    // a copy takes about as long as laying out the day's pages did
    call<Job[]>(`/api/jobs?date=${date}`).then((js) => {
      const b = js.flatMap((j) => j.steps).find((x) => x.name === "build" && x.status === "done" && x.startedAt && x.endedAt);
      if (b) setMinutesPerCopy(Math.max(1, (Date.parse(b.endedAt!) - Date.parse(b.startedAt!)) / 60_000));
    }).catch(() => {});
    load();
  }, [date, has, load]);
  const running = run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(load, 3000);
    return () => clearInterval(tick);
  }, [running, load]);

  const [stopping, setStopping] = useState(false);
  useEffect(() => { if (!running) setStopping(false); }, [running]);
  const stop = async () => {
    if (!window.confirm(t("stop.confirm"))) return;
    setStopping(true);
    try { await call(`/api/issues/${date}/copies/stop`, { json: {} }); load(); } catch (e) { setError((e as Error).message); setStopping(false); }
  };
  const make = async () => {
    setError("");
    try {
      setRun(await call<CopiesRun>(`/api/issues/${date}/copies`, { json: { count, reword, shuffle, lang: paperLang } }));
      toast(t("copies.making", { done: num(lang, 1), total: num(lang, count) }));
    } catch (e) { setError((e as Error).message); }
  };
  // the estimate from what this paper's copies really cost and took (learned by the
  // engine from each batch): every story of the day is worded, placed or not; a
  // translation is paid once, however many copies
  const stories = (info?.report.placed.length ?? 25) + (info?.report.leftOut.length ?? 0);
  const rate = (k: string) => status?.costRates?.[k] ?? 0;
  const estimate = translated ? stories * rate(`translate-${paperLang}`) : count * stories * rate(reword);
  const minutes = Math.max(1, Math.round(count * (status?.copyMinutes ?? minutesPerCopy) + (translated ? 1 : 0)));
  const paperBusy = !!status?.running && status.running.date === date;
  const issueNo = info?.report.issueNumber ?? status?.issue?.issueNumber ?? 0;
  const paperName = status?.paper.name.split(" (")[0] ?? "Capital Kranti";
  // what a copy is doing, in plain words
  const whatOf = (w: string): string => {
    // a copy laid out again: which try, then what it's doing
    const again = w.match(/^again (\d+): (.*)$/);
    if (again) return `${t("copies.doing.again", { n: num(lang, again[1]) })} · ${whatOf(again[2])}`;
    const m = w.match(/^(planning|finishing) (\d+)$/);
    if (m) return t(m[1] === "planning" ? "progress.planning" : "progress.finishing", { item: num(lang, m[2]) });
    if (w.startsWith("lengths")) return t("copies.doing.lengths");
    return w === "checking" ? t("progress.checking") : w === "translating" ? t("copies.doing.translating") : w === "rewording" ? t("copies.doing.rewording") : w;
  };
  // a copy's print PDF, or (`corel`) the one whose text stays text in CorelDRAW
  const open = (n: number, corel = false) => pdf({
    url: media(`/api/issues/${date}/copies/${n}.${corel ? "editable." : ""}pdf?t=${encodeURIComponent(run?.endedAt ?? "")}`),
    title: corel ? t("corel.title", { what: t("copies.pdfTitle", { issue: num(lang, issueNo), n: num(lang, n) }) })
      : t("copies.pdfTitle", { issue: num(lang, issueNo), n: num(lang, n) }),
    fileName: `${paperName} ${issueNo} - ${lang === "gu" ? "નકલ" : "copy"} ${n}${run && run.lang !== "gu" ? ` (${run.lang})` : ""} - ${date.split("-").reverse().join("-")}${corel ? " - CorelDRAW" : ""}.pdf`,
  });

  if (!has) {
    return (
      <div className={s.inner}>
        <TopBar title={t("copies.title")} />
        <div className={s.card}><Empty icon={Icon.copies()} title={t("copies.none")}><Link className={`${s.btn} ${s.primary}`} href="/newsroom">{t("today.make")}</Link></Empty></div>
      </div>
    );
  }
  return (
    <div className={s.inner}>
      <TopBar title={t("copies.title")} />
      <section className={s.card}>
        <p className={s.muted} style={{ margin: 0 }}>{t("copies.body")}</p>
        <div className={s.grid2} style={{ gap: 24 }}>
          <div className={s.field}>
            <span className={s.label}>{t("copies.count")}</span>
            <input className={`${s.input} ${s.countInput}`} type="number" min={1} max={20} value={count} disabled={running}
                   onChange={(e) => setCount(Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))))} aria-label={t("copies.count")} />
            <span className={s.label} style={{ marginTop: 12 }}>{t("copies.shuffle")}</span>
            <div className={s.choices} role="radiogroup" aria-label={t("copies.shuffle")}>
              {SHUFFLES.map((k) => (
                <label key={k} className={s.choice}><input type="radio" name="shuffle" checked={shuffle === k} disabled={running} onChange={() => setShuffle(k)} />
                  <span>{t(`copies.shuffle.${k}` as StringKey)}</span></label>
              ))}
            </div>
          </div>
          <div className={s.field}>
            <span className={s.label}>{t("copies.lang")}</span>
            <div className={s.segmented} role="radiogroup" aria-label={t("copies.lang")}>
              {LANGS.map((k) => <button key={k} type="button" aria-pressed={paperLang === k} disabled={running} onClick={() => setPaperLang(k)}>{t(`lang.${k}` as StringKey)}</button>)}
            </div>
            {translated ? <Note tone="good">{t("copies.translated")}</Note> : <>
              <span className={s.label} style={{ marginTop: 12 }}>{t("copies.reword")}</span>
              <div className={s.choices} role="radiogroup" aria-label={t("copies.reword")}>
                {REWORDS.map((k) => (
                  <label key={k} className={s.choice}><input type="radio" name="reword" checked={reword === k} disabled={running} onChange={() => setReword(k)} />
                    <span>{t(`copies.reword.${k}` as StringKey)}</span></label>
                ))}
              </div>
              <span className={s.hint}>{t("copies.reword.note")}</span>
            </>}
          </div>
        </div>
        {error && <Note tone="bad">{error}</Note>}
        {paperBusy && <Note tone="warn">{t("copies.busyPaper")}</Note>}
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          <span className={s.faint}>{t("copies.estimate", { cost: rupees(lang, estimate, status?.inrPerUsd ?? 88), min: num(lang, Math.max(1, minutes)) })}</span>
          <Button kind="primary" big icon={Icon.copies()} onClick={make} disabled={running || paperBusy || !status?.openrouterKey}>{t("copies.make")}</Button>
        </div>
        {!status?.openrouterKey && <Note tone="warn">{t("today.setup.body")}</Note>}
        {run && run.files.length > 0 && !running && <p className={s.faint} style={{ margin: 0 }}>{t("copies.replace")}</p>}
      </section>

      {run && (
        <section className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.cardTitle}>{running ? t("copies.making", { done: num(lang, Math.min(run.count, run.done + 1)), total: num(lang, run.count) })
              : t("copies.done", { n: num(lang, run.files.length) })}</h2>
            <span className={s.faint}>{t(`lang.${run.lang ?? "gu"}` as StringKey)} · {run.lang && run.lang !== "gu" ? t("copies.translatedShort") : t(`copies.reword.${run.reword}` as StringKey)} · {t(`copies.shuffle.${run.shuffle}` as StringKey)}</span>
          </div>
          {running && (
            <div className={s.ringWrap}>
              <Ring pct={batchProgress(run, run.count * (status?.copyMinutes ?? minutesPerCopy)).share * 100} />
              <div className={s.heroText}>
                <span className={s.muted}>{t("today.making.left", { min: num(lang, batchProgress(run, run.count * (status?.copyMinutes ?? minutesPerCopy)).minutes) })}</span>
                {Object.entries(run.parts ?? {}).filter(([, p]) => p.share < 1).map(([label, p]) => (
                  <span key={label} className={s.faint}>{label.replace(/^copy (\d+)$/, (_, n) => t("copies.copy", { n: num(lang, n) }))}: {whatOf(p.what)} · {num(lang, Math.round(p.share * 100))}%</span>
                ))}
              </div>
            </div>
          )}
          {running && <div className={s.row} style={{ justifyContent: "flex-end" }}>
            <Button kind="danger" onClick={stop} disabled={stopping}>{stopping ? t("stop.stopping") : t("stop.copies")}</Button></div>}
          {run.status === "stopped" && <Note tone="warn">{t("stop.done")}</Note>}
          {run.status === "failed" && <Note tone="bad">{t("copies.failed", { error: run.error ?? "" })}</Note>}
          <div className={s.copyGrid}>
            {run.files.map((f) => (
              <div key={f.n} className={s.copyCard}>
                <div className={s.row} style={{ justifyContent: "space-between" }}>
                  <strong>{t("copies.copy", { n: num(lang, f.n) })}</strong>
                  <Badge tone={f.ready ? "good" : "warn"} dot>{f.ready ? t("archive.ready") : t("archive.look")}</Badge>
                </div>
                <Button icon={Icon.print()} onClick={() => open(f.n)}>{t("copies.open")}</Button>
                {(f.lang ?? "gu") === "gu" && <Button kind="quiet" icon={Icon.download()} onClick={() => open(f.n, true)}>{t("corel.pdf")}</Button>}
              </div>
            ))}
          </div>
          <BatchTime run={run} />
          <div className={s.row} style={{ justifyContent: "space-between" }}>
            <span className={s.faint}>{t("copies.cost", { cost: rupees(lang, run.cost, status?.inrPerUsd ?? 88) })}</span>
          </div>
          <details className={s.details}>
            <summary>{t("today.details")}</summary>
            <div className={s.logBox}>{run.log.map((l, i) => <div key={i}>{l}</div>)}</div>
          </details>
        </section>
      )}
    </div>
  );
}
