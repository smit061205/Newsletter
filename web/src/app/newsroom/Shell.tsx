"use client";
// The newsroom's frame: the sidebar (logo, the screens, help), the day being
// worked on, and a calm notice if the engine on this computer stops
// answering. A first visit goes to the welcome screens.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { call, type Status } from "./api";
import s from "./newsroom.module.css";
import { Calendar } from "./ui/calendar";
import { addDays, longDate } from "./ui/format";
import { Help } from "./ui/help";
import { AppProvider, Button, Icon, Mark, useApp } from "./ui/kit";
import type { StringKey } from "./ui/strings";

interface StatusCtx { status: Status | null; down: boolean; refresh: () => void }
const StatusContext = createContext<StatusCtx>({ status: null, down: false, refresh: () => {} });
/** The engine's status (polled), for every screen. */
export const useStatus = () => useContext(StatusContext);

const NAV: [string, StringKey, () => React.ReactElement][] = [
  ["/newsroom", "nav.today", Icon.today],
  ["/newsroom/pages", "nav.paper", Icon.paper],
  ["/newsroom/stories", "nav.stories", Icon.stories],
  ["/newsroom/ads", "nav.ads", Icon.ads],
  ["/newsroom/copies", "nav.copies", Icon.copies],
  ["/newsroom/archive", "nav.archive", Icon.archive],
  ["/newsroom/papers", "nav.papers", Icon.papers],
  ["/newsroom/settings", "nav.settings", Icon.settings],
];

const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export default function Shell({ children }: { children: React.ReactNode }) {
  const [date, setDateState] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem("nr-date"); } catch {}
    setDateState(saved ?? todayInIndia());
  }, []);
  const setDate = useCallback((d: string) => {
    setDateState(d);
    try { sessionStorage.setItem("nr-date", d); } catch {}
  }, []);
  const refresh = useCallback(() => {
    if (!date) return;
    call<Status>(`/api/status?date=${date}`).then((x) => { setStatus(x); setDown(false); }).catch(() => setDown(true));
  }, [date]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <StatusContext.Provider value={{ status, down, refresh }}>
      <AppProvider lang={status?.lang ?? "gu"} date={date} setDate={setDate}>
        <Frame>{date && status ? children : <Loading down={down} />}</Frame>
      </AppProvider>
    </StatusContext.Provider>
  );
}

function Loading({ down }: { down: boolean }) {
  const { t } = useApp();
  return down ? <EngineDown /> : <div className={s.empty}><Mark className={s.welcomeMark} /><p className={s.faint}>{t("common.loading")}</p></div>;
}

function EngineDown() {
  const { t } = useApp();
  const { refresh } = useStatus();
  return (
    <div className={s.empty} role="alert">
      <Mark className={s.welcomeMark} />
      <p style={{ maxWidth: 420 }}>{t("engine.down")}</p>
      <Button onClick={refresh} icon={Icon.refresh()}>{t("engine.retry")}</Button>
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { t } = useApp();
  const { status, down } = useStatus();
  const [help, setHelp] = useState(false);
  // a first visit: the welcome screens before anything else
  useEffect(() => {
    if (status && !status.onboarded && path !== "/newsroom/welcome") router.replace("/newsroom/welcome");
  }, [status, path, router]);
  if (path === "/newsroom/welcome") return <>{children}</>;
  return (
    <div className={s.frame}>
      <nav className={s.side} aria-label={t("app.sub")}>
        <div className={s.logo}>
          <Mark className={s.mark} />
          <div className={s.logoText}><span className={s.logoName}>{!status || status.paper.id === "capital-kranti" ? t("app.name") : status.paper.name}</span><span className={s.logoSub}>{t("app.sub")}</span></div>
        </div>
        {NAV.map(([href, key, icon]) => (
          <Link key={href} href={href} className={`${s.navItem} ${href === "/newsroom/archive" || href === "/newsroom/papers" ? s.navExtra : ""}`}
                aria-current={path === href ? "page" : undefined}>{icon()}<span>{t(key)}</span></Link>
        ))}
        <div className={s.navSpacer} />
        <button className={`${s.navItem} ${s.navExtra}`} onClick={() => setHelp(true)}>{Icon.help()}<span>{t("nav.help")}</span></button>
      </nav>
      <main className={s.content}>{down && status ? <EngineDown /> : children}</main>
      {help && <Help onClose={() => setHelp(false)} />}
    </div>
  );
}

/** The day switcher at the top of a screen: ‹ Thursday, 22 October ›, the
 * date itself opening a calendar. */
export function DaySwitch() {
  const { lang, t, date, setDate } = useApp();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const today = todayInIndia();
  return (
    <div className={s.dateSwitch}>
      <button onClick={() => setDate(addDays(date, -1))} aria-label={t("date.prev")}>{Icon.left()}</button>
      <button className={s.dateLabel} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" title={t("cal.pick")}>
        {Icon.calendar()}{date === today ? `${t("date.today")} · ` : ""}{longDate(lang, date)}
      </button>
      <button onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label={t("date.next")}>{Icon.right()}</button>
      {open && <Calendar value={date} max={today} onPick={setDate} onClose={close} />}
    </div>
  );
}

/** A screen's top line: its title and the day switcher. */
export function TopBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={s.topbar}>
      <h1 className={s.pageTitle}>{title}</h1>
      <div className={s.row}>{children}<DaySwitch /></div>
    </div>
  );
}
