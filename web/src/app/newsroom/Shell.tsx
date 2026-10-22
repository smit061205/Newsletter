"use client";
// The newsroom's frame: the paper's name, the day being worked on, the
// screens, and a warning when the engine on this computer isn't answering.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { call, type Status } from "./api";
import styles from "./newsroom.module.css";

const TABS: [string, string, string][] = [
  ["/newsroom", "આજે", "Today"],
  ["/newsroom/news", "સમાચાર", "News"],
  ["/newsroom/stories", "લેખ", "Stories"],
  ["/newsroom/pages", "પાનાં", "Pages"],
  ["/newsroom/ads", "જાહેરાત", "Ads"],
  ["/newsroom/settings", "સેટિંગ્સ", "Settings"],
];

interface Day { date: string; setDate: (d: string) => void; status: Status | null; refreshStatus: () => void }
const DayContext = createContext<Day>({ date: "", setDate: () => {}, status: null, refreshStatus: () => {} });
/** The day the newsroom is working on, and the engine's status. */
export const useDay = () => useContext(DayContext);

const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [date, setDateState] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem("nr-date"); } catch {}
    setDateState(saved ?? todayInIndia());
  }, []);
  const setDate = (d: string) => {
    setDateState(d);
    try { sessionStorage.setItem("nr-date", d); } catch {}
  };
  const refreshStatus = useCallback(() => {
    call<Status>("/api/status").then((s) => { setStatus(s); setDown(false); }).catch(() => setDown(true));
  }, []);
  useEffect(() => {
    refreshStatus();
    const t = setInterval(refreshStatus, 15_000);
    return () => clearInterval(t);
  }, [refreshStatus]);

  return (
    <DayContext.Provider value={{ date, setDate, status, refreshStatus }}>
      <header className={styles.bar}>
        <div className={styles.brand}>
          <span className={styles.brandName}>કેપિટલ ક્રાંતિ</span>
          <span className={styles.brandSub}>Newsroom</span>
        </div>
        <nav className={styles.tabs} aria-label="Newsroom screens">
          {TABS.map(([href, gu, en]) => (
            <Link key={href} href={href} className={styles.tab} aria-current={path === href ? "page" : undefined}>
              <span>{gu}</span><small>{en}</small>
            </Link>
          ))}
        </nav>
        <label className={styles.day}>
          <span>તારીખ <small>Day</small></span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </header>
      {down && (
        <p className={styles.alert} role="alert">
          The Capital Kranti engine on this computer isn&apos;t answering. Open the <b>Capital Kranti</b> app from the desktop, or restart the computer.
        </p>
      )}
      <main className={styles.main}>{date ? children : null}</main>
    </DayContext.Provider>
  );
}
