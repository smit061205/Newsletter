"use client";
// The calendar under the day switcher: a month at a time, in the editor's
// language and digits, the days a paper was made marked with a dot, nothing
// after today. Esc or a click outside closes it. DateField is the same
// calendar for choosing a date (an ad's days), the browser's own date box
// never opening on the editor's computer (23 Oct).
import { useCallback, useEffect, useRef, useState } from "react";
import { call, type ArchiveRow } from "../api";
import s from "../newsroom.module.css";
import { longDate, num } from "./format";
import { Icon, useApp } from "./kit";

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export function Calendar({ value, min, max, onPick, onClose, left }:
  { value: string; min?: string; max?: string; onPick: (d: string) => void; onClose: () => void; left?: boolean }) {
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
  const canNext = !max || (month.m === 11 ? iso(month.y + 1, 0, 1) : iso(month.y, month.m + 1, 1)) <= max;
  const today = max ?? todayInIndia();

  return (
    <div className={s.calendar} ref={box} role="dialog" aria-label={t("cal.pick")} style={left ? { left: 0, right: "auto" } : undefined}>
      <div className={s.calHead}>
        <button type="button" onClick={() => step(-1)} aria-label={t("cal.prevMonth")}>{Icon.left()}</button>
        <strong>{t("months").split(",")[month.m]} {num(lang, month.y)}</strong>
        <button type="button" onClick={() => step(1)} disabled={!canNext} aria-label={t("cal.nextMonth")}>{Icon.right()}</button>
      </div>
      <div className={s.calGrid}>
        {t("weekdays").split(",").map((d) => <span key={d} className={s.calDow}>{d}</span>)}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const day = iso(month.y, month.m, d);
          return (
            <button key={day} type="button" disabled={(!!max && day > max) || (!!min && day < min)} aria-pressed={day === value} data-today={day === today}
                    title={made.has(day) ? t("cal.made") : undefined} onClick={() => { onPick(day); onClose(); }}>
              {num(lang, d)}{made.has(day) && <i aria-hidden />}
            </button>
          );
        })}
      </div>
      <button type="button" className={s.calToday} disabled={!!min && today < min} onClick={() => { onPick(today); onClose(); }}>{t("date.today")}</button>
    </div>
  );
}

/** A date chosen on the calendar: "ગુરુવાર, 6 નવેમ્બર 2026", opening it. */
export function DateField({ label, value, min, max, onPick }: { label: string; value: string; min?: string; max?: string; onPick: (d: string) => void }) {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className={s.field} style={{ flex: 1, position: "relative" }}>
      <span className={s.label}>{label}</span>
      <button type="button" className={s.input} style={{ display: "flex", alignItems: "center", gap: 8, textAlign: "start", cursor: "pointer" }}
              onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
        <span style={{ width: 18, height: 18, flex: "none", display: "inline-flex" }}>{Icon.calendar()}</span>{longDate(lang, value, true)}
      </button>
      {open && <Calendar value={value} min={min} max={max} onPick={onPick} onClose={close} left />}
    </div>
  );
}
