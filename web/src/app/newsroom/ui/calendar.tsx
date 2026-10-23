"use client";
// The calendar under the day switcher: a month at a time, in the editor's
// language and digits, the days a paper was made marked with a dot, nothing
// after today. Esc or a click outside closes it.
import { useEffect, useRef, useState } from "react";
import { call, type ArchiveRow } from "../api";
import s from "../newsroom.module.css";
import { num } from "./format";
import { Icon, useApp } from "./kit";

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function Calendar({ value, max, onPick, onClose }: { value: string; max: string; onPick: (d: string) => void; onClose: () => void }) {
  const { t, lang } = useApp();
  const box = useRef<HTMLDivElement>(null);
  const [y0, m0] = value.split("-").map(Number);
  const [month, setMonth] = useState({ y: y0, m: m0 - 1 });
  const [made, setMade] = useState<Set<string>>(new Set());
  useEffect(() => { call<ArchiveRow[]>("/api/issues").then((rows) => setMade(new Set(rows.map((r) => r.date)))).catch(() => {}); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const click = (e: MouseEvent) => { if (box.current && !box.current.parentElement?.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("mousedown", click); };
  }, [onClose]);

  const first = new Date(Date.UTC(month.y, month.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const step = (k: number) => setMonth(({ y, m }) => ({ y: m + k < 0 ? y - 1 : m + k > 11 ? y + 1 : y, m: (m + k + 12) % 12 }));
  const canNext = (month.m === 11 ? iso(month.y + 1, 0, 1) : iso(month.y, month.m + 1, 1)) <= max;
  const today = max;

  return (
    <div className={s.calendar} ref={box} role="dialog" aria-label={t("cal.pick")}>
      <div className={s.calHead}>
        <button onClick={() => step(-1)} aria-label={t("cal.prevMonth")}>{Icon.left()}</button>
        <strong>{t("months").split(",")[month.m]} {num(lang, month.y)}</strong>
        <button onClick={() => step(1)} disabled={!canNext} aria-label={t("cal.nextMonth")}>{Icon.right()}</button>
      </div>
      <div className={s.calGrid}>
        {t("weekdays").split(",").map((d) => <span key={d} className={s.calDow}>{d}</span>)}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const day = iso(month.y, month.m, d);
          return (
            <button key={day} disabled={day > max} aria-pressed={day === value} data-today={day === today}
                    title={made.has(day) ? t("cal.made") : undefined} onClick={() => { onPick(day); onClose(); }}>
              {num(lang, d)}{made.has(day) && <i aria-hidden />}
            </button>
          );
        })}
      </div>
      <button className={s.calToday} onClick={() => { onPick(today); onClose(); }}>{t("date.today")}</button>
    </div>
  );
}
