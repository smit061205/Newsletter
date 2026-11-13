"use client";
// The date and issue number (અંક) on the paper's title, changed after it's made (the developer,
// 13 Nov): the paper isn't made again, only its title, PDFs and pictures (backend export/retitle.ts).
// A number changed here counts on for the days after it.
import { useEffect, useState } from "react";
import { call } from "../api";
import s from "../newsroom.module.css";
import { addDays, longDate, num } from "./format";
import { DateField } from "./calendar";
import { Button, Dialog, Note, useApp } from "./kit";

type Title = { date: string; issue: number; auto: { date: string; issue: number } };

export function TitleDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t, lang, date, toast } = useApp();
  const [now, setNow] = useState<Title | null>(null);
  const [printed, setPrinted] = useState("");
  const [issue, setIssue] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    call<Title>(`/api/issues/${date}/title`).then((x) => { setNow(x); setPrinted(x.date); setIssue(String(x.issue)); }).catch((e) => setError(e.message));
  }, [date]);
  // (the number typed in the editor's digits or the usual ones)
  const number = Number(issue.replace(/[૦-૯]/g, (d) => String("૦૧૨૩૪૫૬૭૮૯".indexOf(d))));
  const valid = !!printed && Number.isInteger(number) && number > 0;
  const save = async () => {
    setWorking(true);
    setError("");
    try {
      await call(`/api/issues/${date}/title`, { json: { date: printed, issue: number } });
      toast(t("title.done"));
      onDone();
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  };
  return (
    <Dialog onClose={() => !working && onClose()}>
      <h2 className={s.cardTitle}>{t("title.title")}</h2>
      <p className={s.muted}>{t("title.body")}</p>
      {now && <>
        <div className={s.row} style={{ alignItems: "flex-end" }}>
          <DateField label={t("title.date")} value={printed} max={addDays(now.auto.date, 60)} onPick={setPrinted} />
          <div className={s.field} style={{ flex: "0 0 110px" }}>
            <span className={s.label}>{t("title.issue")}</span>
            <input className={s.input} inputMode="numeric" value={lang === "gu" ? num(lang, issue) : issue} disabled={working}
                   onChange={(e) => setIssue(e.target.value)} aria-label={t("title.issue")} />
          </div>
        </div>
        {(printed !== now.auto.date || number !== now.auto.issue) && (
          <p className={s.faint}>{t("title.usual", { date: longDate(lang, now.auto.date, true), issue: num(lang, now.auto.issue) })}</p>
        )}
        {valid && number !== now.issue && <p className={s.faint}>{t("title.after")}</p>}
      </>}
      {working && <p className={s.faint}>{t("title.working")}</p>}
      {error && <Note tone="bad">{error}</Note>}
      <div className={s.row} style={{ justifyContent: "flex-end" }}>
        <Button kind="quiet" onClick={onClose} disabled={working}>{t("edit.cancel")}</Button>
        <Button kind="primary" onClick={save} disabled={!now || !valid || working}>{working ? t("title.saving") : t("edit.save")}</Button>
      </div>
    </Dialog>
  );
}
