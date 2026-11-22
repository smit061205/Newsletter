"use client";
// The date and issue number (અંક) on each copy's title, which come from the other papers' designs
// (the developer, 14 Nov: "give the same aank no changing feature and date changing feature in copies";
// 22 Nov: "give me the option to change each and every copies date and aank no"). Each copy its own
// date for the day and its own number, counting on for the days after. Nothing is made again: a copy
// is put on its design as it's opened or saved (backend export/designs.ts).
import { useEffect, useState } from "react";
import { call } from "../api";
import s from "../newsroom.module.css";
import { addDays, longDate, num } from "../ui/format";
import { DateField } from "../ui/calendar";
import { Button, Dialog, Note, useApp } from "../ui/kit";

type Copy = { n: number; design: string; name: string; date: string; issue: number | null; auto: number | null };
type Titles = { auto: string; copies: Copy[] };
const designName = (name: string) => name.replace(/\.pdf$/i, "");
// (a number typed in the editor's digits or the usual ones)
const numberOf = (x: string) => Number(x.replace(/[૦-૯]/g, (d) => String("૦૧૨૩૪૫૬૭૮૯".indexOf(d))));

export function CopiesTitleDialog({ date, onClose }: { date: string; onClose: () => void }) {
  const { t, lang, toast } = useApp();
  const [now, setNow] = useState<Titles | null>(null);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [issues, setIssues] = useState<Record<number, string>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    call<Titles>(`/api/designs/title?date=${date}`).then((x) => {
      setNow(x);
      setDates(Object.fromEntries(x.copies.map((c) => [c.n, c.date])));
      setIssues(Object.fromEntries(x.copies.filter((c) => c.issue !== null).map((c) => [c.n, String(c.issue)])));
    }).catch((e) => setError(e.message));
  }, [date]);
  const copies = now?.copies ?? [];
  const valid = copies.every((c) => !!dates[c.n]) && Object.values(issues).every((x) => Number.isInteger(numberOf(x)) && numberOf(x) > 0);
  const changed = copies.some((c) => c.issue !== null && issues[c.n] !== undefined && numberOf(issues[c.n]) !== c.issue);
  const save = async () => {
    setWorking(true);
    setError("");
    try {
      // only what changed: a copy left as it was keeps following the day's copies and its design
      const want: Record<string, { printed?: string; issue?: number }> = {};
      for (const c of copies) {
        const x: { printed?: string; issue?: number } = {};
        if (dates[c.n] !== c.date) x.printed = dates[c.n];
        if (c.issue !== null && issues[c.n] !== undefined && numberOf(issues[c.n]) !== c.issue) x.issue = numberOf(issues[c.n]);
        if (Object.keys(x).length) want[c.n] = x;
      }
      await call(`/api/designs/title`, { json: { date, copies: want } });
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
      {now && copies.length === 0 && <p className={s.faint}>{t("ctitle.noDesigns")}</p>}
      {now && copies.map((c) => (
        <div key={c.n} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 10, display: "grid", gap: 6 }}>
          <span style={{ overflowWrap: "anywhere" }}>
            <strong>{t("ctitle.copies", { list: num(lang, c.n) })}</strong>
            <span className={s.faint}> · {designName(c.name)}</span>
          </span>
          <div className={s.row} style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <DateField label={t("title.date")} value={dates[c.n] ?? c.date} max={addDays(now.auto, 60)}
                       onPick={(v) => setDates((x) => ({ ...x, [c.n]: v }))} />
            {c.issue === null
              ? <span className={s.hint} style={{ flex: "0 0 140px" }}>{t("ctitle.noIssue")}</span>
              : <div className={s.field} style={{ flex: "0 0 110px" }}>
                  <span className={s.label}>{t("title.issue")}</span>
                  <input className={s.input} inputMode="numeric" disabled={working} aria-label={`${t("ctitle.copies", { list: c.n })}: ${t("title.issue")}`}
                         value={lang === "gu" ? num(lang, issues[c.n] ?? "") : issues[c.n] ?? ""}
                         onChange={(e) => setIssues((x) => ({ ...x, [c.n]: e.target.value }))} />
                  {c.auto !== null && numberOf(issues[c.n] ?? "") !== c.auto &&
                    <span className={s.faint}>{t("ctitle.usualIssue", { issue: num(lang, c.auto) })}</span>}
                </div>}
          </div>
          {(dates[c.n] ?? c.date) !== now.auto && <span className={s.faint}>{t("ctitle.usualDate", { date: longDate(lang, now.auto, true) })}</span>}
        </div>
      ))}
      {changed && valid && <p className={s.faint}>{t("title.after")}</p>}
      {error && <Note tone="bad">{error}</Note>}
      <div className={s.row} style={{ justifyContent: "flex-end" }}>
        <Button kind="quiet" onClick={onClose} disabled={working}>{t("edit.cancel")}</Button>
        <Button kind="primary" onClick={save} disabled={!now || !valid || working}>{working ? t("title.saving") : t("edit.save")}</Button>
      </div>
    </Dialog>
  );
}
