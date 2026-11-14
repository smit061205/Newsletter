"use client";
// The date and issue numbers (અંક) on the copies' titles, which come from the other papers' designs
// (the developer, 14 Nov: "give the same aank no changing feature and date changing feature in copies").
// One date for the day's copies; a number for each design, counting on for the days after. Nothing is
// made again: a copy is put on its design as it's opened or saved (backend export/designs.ts).
import { useEffect, useState } from "react";
import { call } from "../api";
import s from "../newsroom.module.css";
import { addDays, longDate, num } from "../ui/format";
import { DateField } from "../ui/calendar";
import { Button, Dialog, Note, useApp } from "../ui/kit";

type Titles = { date: string; auto: string; designs: { id: string; name: string; copies: number[]; issue: number | null; auto: number | null }[] };
// (a number typed in the editor's digits or the usual ones)
const designName = (name: string) => name.replace(/\.pdf$/i, "");
const numberOf = (x: string) => Number(x.replace(/[૦-૯]/g, (d) => String("૦૧૨૩૪૫૬૭૮૯".indexOf(d))));

export function CopiesTitleDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const { t, lang, toast } = useApp();
  const [now, setNow] = useState<Titles | null>(null);
  const [printed, setPrinted] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    call<Titles>(`/api/designs/title?date=${date}`).then((x) => {
      setNow(x);
      setPrinted(x.date);
      setIssues(Object.fromEntries(x.designs.filter((d) => d.issue !== null).map((d) => [d.id, String(d.issue)])));
    }).catch((e) => setError(e.message));
  }, [date]);
  // the designs some copy goes with, those with a number first
  const shown = (now?.designs ?? []).filter((d) => d.copies.length).sort((a, b) => Number(a.issue === null) - Number(b.issue === null));
  const valid = !!printed && Object.values(issues).every((x) => Number.isInteger(numberOf(x)) && numberOf(x) > 0);
  const changed = (now?.designs ?? []).some((d) => d.issue !== null && issues[d.id] !== undefined && numberOf(issues[d.id]) !== d.issue);
  const save = async () => {
    setWorking(true);
    setError("");
    try {
      const want = Object.fromEntries(Object.entries(issues).map(([id, x]) => [id, numberOf(x)]));
      await call(`/api/designs/title`, { json: { date, printed, issues: want } });
      toast(t("ctitle.done"));
      onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  };
  return (
    <Dialog onClose={() => !working && onClose()}>
      <h2 className={s.cardTitle}>{t("ctitle.title")}</h2>
      <p className={s.muted}>{t("ctitle.body")}</p>
      {!now && !error && <p className={s.faint}>{t("ctitle.reading")}</p>}
      {now && <>
        <DateField label={t("title.date")} value={printed} max={addDays(now.auto, 60)} onPick={setPrinted} />
        {printed !== now.auto && <p className={s.faint}>{t("ctitle.usualDate", { date: longDate(lang, now.auto, true) })}</p>}
        {shown.length === 0 && <p className={s.faint}>{t("ctitle.noDesigns")}</p>}
        {shown.some((d) => d.issue !== null) && <div className={s.row} style={{ justifyContent: "flex-end" }}><span className={s.label} style={{ width: 110 }}>{t("title.issue")}</span></div>}
        {shown.map((d) => (
          <div key={d.id} className={s.row} style={{ gap: 12, alignItems: "center" }}>
            <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
              <strong>{designName(d.name)}</strong>
              <span className={s.faint}> · {t("ctitle.copies", { list: d.copies.map((n) => num(lang, n)).join(", ") })}</span>
            </span>
            {d.issue === null
              ? <span className={s.hint}>{t("ctitle.noIssue")}</span>
              : <div className={s.field} style={{ flex: "0 0 110px" }}>
                  <input className={s.input} inputMode="numeric" disabled={working} aria-label={`${designName(d.name)}: ${t("title.issue")}`}
                         value={lang === "gu" ? num(lang, issues[d.id] ?? "") : issues[d.id] ?? ""}
                         onChange={(e) => setIssues((x) => ({ ...x, [d.id]: e.target.value }))} />
                  {d.auto !== null && numberOf(issues[d.id] ?? "") !== d.auto &&
                    <span className={s.faint}>{t("ctitle.usualIssue", { issue: num(lang, d.auto) })}</span>}
                </div>}
          </div>
        ))}
        {changed && valid && <p className={s.faint}>{t("title.after")}</p>}
      </>}
      {error && <Note tone="bad">{error}</Note>}
      <div className={s.row} style={{ justifyContent: "flex-end" }}>
        <Button kind="quiet" onClick={onClose} disabled={working}>{t("edit.cancel")}</Button>
        <Button kind="primary" onClick={save} disabled={!now || !valid || working}>{working ? t("title.saving") : t("edit.save")}</Button>
      </div>
    </Dialog>
  );
}
