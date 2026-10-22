"use client";
// What only the desktop app can do (desktop/preload.js puts window.ck there):
// connect the website through GitHub's device sign-in, and wake the computer
// before the evening run. In a plain browser these cards don't appear.
import { useEffect, useState } from "react";
import s from "../newsroom.module.css";
import { Button, Note, useApp } from "./kit";

interface Ck {
  info(): Promise<{ desktop: true; platform: string; version: string; github: boolean; canConnect: boolean; wake: string }>;
  connectGitHub(): Promise<{ code: string; url: string }>;
  onGitHubConnected(fn: () => void): void;
  scheduleWake(time: string): Promise<string>;
}
const ck = (): Ck | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { ck?: Ck }).ck);

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
  if (!info) return null;
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

export function WakeCard({ runAt }: { runAt: string }) {
  const { t } = useApp();
  const { info } = useDesktop();
  const [at, setAt] = useState("");
  const [error, setError] = useState("");
  if (!info || info.platform === "linux") return null;
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{t("settings.wake")}</h2>
      <p className={s.muted}>{t("settings.wake.body")}</p>
      {at || info.wake ? <Note tone="good">{t("settings.wake.done", { time: at || info.wake })}</Note>
        : <div><Button onClick={() => { setError(""); ck()!.scheduleWake(runAt).then(setAt).catch((e) => setError(e.message)); }}>{t("settings.wake.go")}</Button></div>}
      {error && <Note tone="bad">{error}</Note>}
    </section>
  );
}
