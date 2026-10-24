"use client";
// The time meter for copies and sister papers: a clock from the start, how
// long the wording took (every paper at once) and each one's layout, the
// longest marked -- as the Today screen's for the day's paper.
import { useEffect, useState } from "react";
import type { CopiesRun } from "../api";
import s from "../newsroom.module.css";
import { num } from "./format";
import { useApp } from "./kit";

const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

export function BatchTime({ run }: { run: CopiesRun }) {
  const { t, lang } = useApp();
  const live = run.status === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  const end = live ? now : Date.parse(run.endedAt ?? "") || now;
  const rows = run.times ?? [];
  const most = Math.max(1, ...rows.map((r) => r.seconds));
  return (
    <div className={s.timeMeter}>
      <div className={s.timeHead}>
        <span className={s.faint}>{t(live ? "time.batchRunning" : "time.batchTook")}</span>
        <strong className={s.timeClock}>{num(lang, clock((end - Date.parse(run.startedAt)) / 1000))}</strong>
      </div>
      {rows.map((r, i) => (
        <div key={i} className={s.timeRow} data-slowest={!live && rows.length > 1 && r.seconds === most}>
          <span className={s.timeName}>{r.name === "wording" ? t("time.wording") : r.name}</span>
          <span className={s.timeBar}><span style={{ width: `${(r.seconds / most) * 100}%` }} /></span>
          <span className={s.timeSecs}>{num(lang, clock(r.seconds))}</span>
        </div>
      ))}
    </div>
  );
}
