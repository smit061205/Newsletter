"use client";
// The reader's switch for breaking-news alerts (lib/push.ts, public/sw.js): asks the phone's permission, signs this
// browser up with the site, and can sign it off again. On an iPhone, alerts work only for the site added to the home
// screen, which it says; where a browser can't take alerts at all, nothing is shown.
import { useEffect, useState } from "react";
import type { Lang } from "../lib/types.ts";

type State = "wait" | "none" | "ios" | "off" | "on" | "denied" | "busy" | "failed";
const keyBytes = (b64: string) => Uint8Array.from(atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export default function Alerts({ lang, words }: { lang: Lang; words: { on: string; areOn: string; off: string; note: string; denied: string; ios: string; failed: string } }) {
  const [state, setState] = useState<State>("wait");
  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const installed = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState(ios && !installed ? "ios" : "none"); return; }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("none"));
  }, []);

  const turnOn = async () => {
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") { setState(Notification.permission === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await (await fetch("/api/push")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      const res = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), lang }) });
      setState(res.ok ? "on" : "failed");
    } catch {
      setState("failed");
    }
  };
  const turnOff = async () => {
    setState("busy");
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("failed");
    }
  };

  if (state === "wait" || state === "none") return null;
  return (
    <div className="alerts" aria-live="polite">
      {state === "on" ? (
        <p className="alerts-on"><Bell /> {words.areOn} · <button type="button" className="linkish" onClick={turnOff}>{words.off}</button></p>
      ) : state === "ios" ? <p className="alerts-why"><Bell /> {words.ios}</p>
        : state === "denied" ? <p className="alerts-why"><Bell /> {words.denied}</p>
        : (
          <>
            <button type="button" className="alerts-btn" onClick={turnOn} disabled={state === "busy"}><Bell /> {words.on}</button>
            <p className="alerts-why">{state === "failed" ? words.failed : words.note}</p>
          </>
        )}
    </div>
  );
}

function Bell() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;
}
