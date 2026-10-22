"use client";
// The first-run welcome: four calm screens -- hello, the AI key, when to make
// the paper, all set (make today's now, or let it make itself this evening).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "../api";
import { useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { Button, Icon, Mark, Note, useApp } from "../ui/kit";

export default function Welcome() {
  const { t, lang, date } = useApp();
  const { status, refresh } = useStatus();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [key, setKey] = useState("");
  const [runAt, setRunAt] = useState(status?.runAt ?? "20:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async (makeNow: boolean) => {
    setBusy(true);
    try {
      await call("/api/settings", { json: { onboarded: true, runAt } });
      if (makeNow) await call("/api/jobs", { json: { date } }).catch(() => {});
      refresh();
      router.replace("/newsroom");
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  const saveKey = async () => {
    setError(""); setBusy(true);
    try { await call("/api/settings", { json: { openrouterKey: key } }); setStep(2); }
    catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className={s.welcome}>
      <div className={s.welcomeCard} key={step}>
        {step === 0 && (
          <>
            <Mark className={s.welcomeMark} />
            <h1 className={s.welcomeTitle}>{t("welcome.1.title")}</h1>
            <p className={s.muted}>{t("welcome.1.body")}</p>
            <div className={s.segmented} style={{ alignSelf: "flex-start" }}>
              <button aria-pressed={lang === "gu"} onClick={() => call("/api/settings", { json: { lang: "gu" } }).then(refresh)}>ગુજરાતી</button>
              <button aria-pressed={lang === "en"} onClick={() => call("/api/settings", { json: { lang: "en" } }).then(refresh)}>English</button>
            </div>
            <Button kind="primary" big onClick={() => setStep(status?.openrouterKey ? 2 : 1)}>{t("welcome.start")}</Button>
          </>
        )}
        {step === 1 && (
          <>
            <h1 className={s.welcomeTitle}>{t("welcome.2.title")}</h1>
            <p className={s.muted}>{t("welcome.2.body")}</p>
            <input className={s.input} type="password" autoComplete="off" placeholder="sk-or-…" value={key} onChange={(e) => setKey(e.target.value)} aria-label={t("welcome.2.title")} />
            {error && <Note tone="bad">{error}</Note>}
            <div className={s.row}>
              <Button kind="primary" big onClick={saveKey} disabled={!key || busy}>{t("welcome.2.check")}</Button>
              <Button kind="quiet" onClick={() => setStep(2)}>{t("welcome.2.later")}</Button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h1 className={s.welcomeTitle}>{t("welcome.3.title")}</h1>
            <p className={s.muted}>{t("welcome.3.body")}</p>
            <input className={`${s.input} ${s.headlineInput}`} type="time" value={runAt} onChange={(e) => setRunAt(e.target.value)} style={{ maxWidth: 180 }} aria-label={t("welcome.3.title")} />
            <Button kind="primary" big onClick={() => setStep(3)}>{t("welcome.next")}</Button>
          </>
        )}
        {step === 3 && (
          <>
            <div className={s.state} data-tone="good">{Icon.checkCircle()}</div>
            <h1 className={s.welcomeTitle}>{t("welcome.4.title")}</h1>
            <p className={s.muted}>{t("welcome.4.body")}</p>
            {error && <Note tone="bad">{error}</Note>}
            <div className={s.row}>
              <Button kind="primary" big icon={Icon.wand()} onClick={() => finish(true)} disabled={busy}>{t("welcome.makeNow")}</Button>
              <Button big onClick={() => finish(false)} disabled={busy}>{t("welcome.later")}</Button>
            </div>
          </>
        )}
        <div className={s.dots} aria-hidden>{[0, 1, 2, 3].map((k) => <span key={k} data-on={k === step} />)}</div>
      </div>
    </div>
  );
}
