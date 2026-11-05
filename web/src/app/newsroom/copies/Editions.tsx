"use client";
// The day's sister papers (on Other papers): the day's paper under other
// names, in Gujarati, Hindi and Urdu, each laid out its own way with its
// masthead, page headers and footer left empty (editorial/copies.ts): make
// them, open them, rename them.
import { useCallback, useEffect, useState } from "react";
import { batchProgress, call, media, switchPaper, type CopiesRun, type Edition, type Settings } from "../api";
import { useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { BatchTime } from "../ui/BatchTime";
import { num, rupees, shortDate } from "../ui/format";
import { Badge, Button, Icon, Note, useApp } from "../ui/kit";
import type { StringKey } from "../ui/strings";

/** The day's sister papers: each one's name (renamed here), its language,
 * whether it's made, and its PDF; make them all, or one again. */
export function Editions() {
  const { t, lang, date, toast, pdf } = useApp();
  const { status } = useStatus();
  const [data, setData] = useState<{ editions: Edition[]; run: CopiesRun | null } | null>(null);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const has = !!status?.issue;
  const load = useCallback(() => {
    call<{ editions: Edition[]; run: CopiesRun | null }>(`/api/issues/${date}/editions`).then(setData).catch((e) => setError(e.message));
  }, [date]);
  useEffect(() => { setData(null); setError(""); load(); }, [load]);
  useEffect(() => { call<Settings>("/api/settings").then((x) => setAuto(x.editionsAuto)).catch(() => {}); }, []);
  const running = data?.run?.status === "running";
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
    try { await call(`/api/issues/${date}/editions/stop`, { json: {} }); load(); } catch (e) { setError((e as Error).message); setStopping(false); }
  };
  const make = async (only?: string) => {
    setError("");
    try { setData(await call(`/api/issues/${date}/editions`, { json: only ? { only } : {} })); toast(t("eds.started")); }
    catch (e) { setError((e as Error).message); }
  };
  const rename = async () => {
    if (!renaming) return;
    try {
      const x = await call<Settings>("/api/settings", { json: { editions: [{ id: renaming.id, name: renaming.name }] } });
      setData((d) => (d ? { ...d, editions: x.editions } : d));
      setRenaming(null);
      toast(t("settings.saved"));
    } catch (e) { setError((e as Error).message); }
  };
  const setAutoOn = async (on: boolean) => {
    try { setAuto((await call<Settings>("/api/settings", { json: { editionsAuto: on } })).editionsAuto); } catch (e) { setError((e as Error).message); }
  };
  const run = data?.run;
  const open = (e: Edition, corel = false) => pdf({
    url: media(`/api/issues/${date}/editions/${e.id}.${corel ? "editable." : ""}pdf?t=${encodeURIComponent(run?.endedAt ?? run?.done ?? "")}`),
    title: corel ? t("corel.title", { what: `${e.name} · ${shortDate(lang, date)}` }) : `${e.name} · ${shortDate(lang, date)}`,
    fileName: `${e.name} - ${date.split("-").reverse().join("-")}${corel ? " - CorelDRAW" : ""}.pdf`,
  });

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <div><h2 className={s.cardTitle}>{t("eds.title")}</h2><p className={s.muted} style={{ margin: "4px 0 0" }}>{t("eds.body")}</p></div>
        <Button kind="primary" icon={Icon.copies()} onClick={() => make()} disabled={!has || running || !status?.openrouterKey || !!status?.running}>
          {running ? t("eds.making", { done: num(lang, Math.round(batchProgress(run!, run!.count * 4).share * 100)), total: num(lang, batchProgress(run!, run!.count * 4).minutes) }) : t("eds.makeAll")}</Button>
      </div>
      {!has && <Note tone="warn">{t("copies.none")}</Note>}
      {error && <Note tone="bad">{error}</Note>}
      {running && <div className={s.row} style={{ justifyContent: "flex-end" }}>
        <Button kind="danger" onClick={stop} disabled={stopping}>{stopping ? t("stop.stopping") : t("stop.papers")}</Button></div>}
      {run?.status === "stopped" && <Note tone="warn">{t("stop.done")}</Note>}
      {run?.status === "failed" && <Note tone="bad">{t("copies.failed", { error: run.error ?? "" })}</Note>}
      <div className={s.list}>
        {(data?.editions ?? []).map((e) => {
          const f = run?.files.find((x) => x.id === e.id);
          return (
            <div key={e.id} className={s.paperRow}>
              <div className={s.field} style={{ gap: 2 }}>
                {renaming?.id === e.id ? (
                  <form className={s.row} onSubmit={(ev) => { ev.preventDefault(); rename(); }}>
                    <input className={s.input} autoFocus value={renaming.name} maxLength={60} onChange={(ev) => setRenaming({ id: e.id, name: ev.target.value })} aria-label={t("papers.name")} />
                    <Button kind="primary" type="submit" disabled={!renaming.name.trim()}>{t("settings.save")}</Button>
                    <Button kind="quiet" onClick={() => setRenaming(null)}>{t("edit.cancel")}</Button>
                  </form>
                ) : <span className={s.listTitle}>{e.name}</span>}
                <span className={s.listMeta}>{t(`lang.${e.lang}` as StringKey)}{e.lang !== "gu" ? ` · ${t("copies.translatedShort")}` : ""}</span>
              </div>
              <span className={s.listBadges}>
                {f ? <Badge tone={f.ready ? "good" : "warn"} dot>{f.ready ? t("archive.ready") : t("archive.look")}</Badge>
                  : running && run?.parts?.[e.name] ? <Badge tone="accent">{num(lang, Math.round(run.parts[e.name].share * 100))}%</Badge>
                  : running ? <Badge>{t("eds.waiting")}</Badge> : has ? <Badge>{t("eds.notMade")}</Badge> : null}
                {renaming?.id !== e.id && <Button kind="quiet" onClick={() => setRenaming({ id: e.id, name: e.name })}>{t("eds.rename")}</Button>}
                {f && <Button icon={Icon.print()} onClick={() => open(e)}>{t("copies.open")}</Button>}
                {f && e.lang === "gu" && <Button kind="quiet" icon={Icon.download()} onClick={() => open(e, true)}>{t("corel.short")}</Button>}
                {f && !running && <Button kind="quiet" icon={Icon.refresh()} onClick={() => make(e.id)} disabled={!!status?.running}>{t("eds.again")}</Button>}
                {/* (the newsroom on that paper alone: its pages, ads, changes and past issues) */}
                {renaming?.id !== e.id && <Button icon={Icon.right()} onClick={() => switchPaper(e.id)}>{t("sister.enter")}</Button>}
              </span>
            </div>
          );
        })}
      </div>
      {auto !== null && <label className={s.switch}><input type="checkbox" checked={auto} onChange={(ev) => setAutoOn(ev.target.checked)} /><span>{t("eds.auto")}</span></label>}
      <div className={s.row} style={{ justifyContent: "space-between" }}>
        {/* (from what this paper's sister papers really cost, learned each evening: a day of about 45 stories) */}
        <span className={s.faint}>{t("eds.cost", {
          gu: rupees(lang, 45 * (status?.costRates?.headlineDeck ?? 0), status?.inrPerUsd ?? 88),
          hi: rupees(lang, 45 * (status?.costRates?.["translate-hi"] ?? 0), status?.inrPerUsd ?? 88),
        })}</span>
        {run && <span className={s.faint}>{t("copies.cost", { cost: rupees(lang, run.cost, status?.inrPerUsd ?? 88) })}</span>}
      </div>
      {run && <BatchTime run={run} />}
      {run && (
        <details className={s.details}>
          <summary>{t("today.details")}</summary>
          <div className={s.logBox}>{run.log.map((l, i) => <div key={i}>{l}</div>)}</div>
        </details>
      )}
    </section>
  );
}
