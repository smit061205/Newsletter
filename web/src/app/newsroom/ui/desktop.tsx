"use client";
// What only the desktop app can do (desktop/preload.js puts window.ck there):
// connect the website through GitHub's device sign-in, wake the computer
// before the evening run, and switch the paper the newsroom works on. In a
// plain browser these cards say where they work.
import { useEffect, useRef, useState } from "react";
import s from "../newsroom.module.css";
import { Button, Note, useApp } from "./kit";

interface Ck {
  info(): Promise<{ desktop: true; platform: string; version: string; github: boolean; canConnect: boolean; wake: string; paper?: string }>;
  connectGitHub(): Promise<{ code: string; url: string }>;
  onGitHubConnected(fn: () => void): void;
  scheduleWake(time: string): Promise<string>;
  cancelWake?(): Promise<void>;
  switchPaper?(id: string): Promise<void>;
}
export const ck = (): Ck | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { ck?: Ck }).ck);

export function useDesktop() {
  const [info, setInfo] = useState<Awaited<ReturnType<Ck["info"]>> | null>(null);
  useEffect(() => { ck()?.info().then(setInfo).catch(() => {}); }, []);
  return { info, refresh: () => ck()?.info().then(setInfo) };
}

export function ConnectCard() {
  const { t } = useApp();
  const { info, refresh } = useDesktop();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { ck()?.onGitHubConnected(() => { setCode(""); refresh(); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) {
    return (
      <section className={s.card}>
        <h2 className={s.cardTitle}>{t("settings.connect")}</h2>
        <p className={s.muted}>{t("settings.connect.body")}</p>
        <p className={s.faint}>{t("settings.connect.browser")}</p>
      </section>
    );
  }
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{t("settings.connect")}</h2>
      {info.github ? <Note tone="good">{t("settings.connect.done")}</Note> : <>
        <p className={s.muted}>{t("settings.connect.body")}</p>
        {!info.canConnect && <Note tone="warn">{t("settings.connect.none")}</Note>}
        {code ? <>
          <p className={s.muted}>{t("settings.connect.code")}</p>
          <p className={s.headlineInput} style={{ fontVariantNumeric: "tabular-nums", letterSpacing: ".12em", userSelect: "all" }}>{code}</p>
        </> : <div><Button kind="primary" disabled={!info.canConnect}
            onClick={() => { setError(""); ck()!.connectGitHub().then((r) => setCode(r.code)).catch((e) => setError(e.message)); }}>{t("settings.connect.go")}</Button></div>}
        {error && <Note tone="bad">{error}</Note>}
      </>}
    </section>
  );
}

/** The time five minutes before `runAt` ("HH:MM"), when the computer wakes. */
export function wakeTime(runAt: string): string {
  const [h, m] = runAt.split(":").map(Number);
  const t = (h * 60 + m - 5 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Waking the computer before the evening run: on or off, and always five
 * minutes before the paper's time (changed with it). */
export function WakeCard({ runAt }: { runAt: string }) {
  const { t } = useApp();
  const { info, refresh } = useDesktop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const asked = useRef("");
  const on = !!info?.wake;
  // the paper's time changed: the waking time follows it (once per change)
  useEffect(() => {
    if (!info?.wake || !runAt || info.wake === wakeTime(runAt) || asked.current === runAt) return;
    asked.current = runAt;
    setBusy(true);
    ck()!.scheduleWake(runAt).then(() => refresh()).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, [info?.wake, runAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info || info.platform === "linux") return null;
  const toggle = async (want: boolean) => {
    setError(""); setBusy(true);
    try {
      if (want) await ck()!.scheduleWake(runAt);
      else await ck()!.cancelWake?.();
      await refresh();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{t("settings.wake")}</h2>
      <p className={s.muted}>{t("settings.wake.body")}</p>
      <label className={s.switch}><input type="checkbox" checked={on} disabled={busy || (!on && !runAt) || (on && !ck()?.cancelWake)} onChange={(e) => toggle(e.target.checked)} />
        <span>{t("settings.wake.toggle")}</span></label>
      {busy ? <p className={s.faint}>{t("settings.wake.working")}</p>
        : on ? <Note tone="good">{t("settings.wake.done", { time: info.wake })}</Note>
        : <p className={s.faint}>{t("settings.wake.off")}</p>}
      <p className={s.faint}>{t("settings.wake.follows")}{info.platform === "darwin" ? ` ${t("settings.wake.mac")}` : ""}</p>
      {error && <Note tone="bad">{error}</Note>}
    </section>
  );
}
