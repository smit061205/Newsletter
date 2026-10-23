"use client";
// સેટિંગ્સ / Settings: language, the automatic paper, the AI key, costs in
// rupees, the website, other papers, and what this is.
import Link from "next/link";
import { useEffect, useState } from "react";
import { call, type Settings } from "../api";
import { useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { num, shortDate } from "../ui/format";
import { ConnectCard, WakeCard } from "../ui/desktop";
import { Button, Icon, Note, Skeleton, useApp } from "../ui/kit";

export default function SettingsPage() {
  const { t, lang, toast } = useApp();
  const { status, refresh } = useStatus();
  const [x, setX] = useState<Settings | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { call<Settings>("/api/settings").then(setX).catch((e) => setError(e.message)); }, []);
  const save = async (change: Omit<Partial<Settings>, "openrouterKey"> & { openrouterKey?: string }) => {
    setError("");
    try {
      setX(await call<Settings>("/api/settings", { json: change }));
      toast(t("settings.saved"));
      refresh();
    } catch (e) { setError((e as Error).message); }
  };

  if (!x) return <div className={s.inner}><h1 className={s.pageTitle}>{t("settings.title")}</h1>{error ? <Note tone="bad">{error}</Note> : <Skeleton h={200} />}</div>;
  return (
    <div className={s.inner}>
      <h1 className={s.pageTitle}>{t("settings.title")}</h1>
      {error && <Note tone="bad">{error}</Note>}
      <div className={s.grid2}>
        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("settings.lang")}</h2>
          <p className={s.muted}>{t("settings.lang.body")}</p>
          <div className={s.segmented}>
            <button aria-pressed={x.lang === "gu"} onClick={() => save({ lang: "gu" })}>ગુજરાતી</button>
            <button aria-pressed={x.lang === "en"} onClick={() => save({ lang: "en" })}>English</button>
          </div>
        </section>

        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("settings.auto")}</h2>
          <label className={s.switch}><input type="checkbox" checked={x.autoRun} onChange={(e) => save({ autoRun: e.target.checked })} /><span>{t("settings.auto.on")}</span></label>
          <label className={s.field}><span className={s.label}>{t("settings.auto.time")}</span>
            <input className={s.input} type="time" value={x.runAt} disabled={!x.autoRun} onChange={(e) => setX({ ...x, runAt: e.target.value })}
                   onBlur={(e) => e.target.value && save({ runAt: e.target.value })} style={{ maxWidth: 160 }} /></label>
          <label className={s.switch}><input type="checkbox" checked={x.notify} onChange={(e) => save({ notify: e.target.checked })} /><span>{t("settings.notify")}</span></label>
        </section>

        <WakeCard runAt={status?.runAt ?? x.runAt} />

        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("settings.key")}</h2>
          <p className={s.muted}>{x.openrouterKey ? t("settings.key.set") : t("settings.key.unset")}</p>
          <form className={s.row} onSubmit={(e) => { e.preventDefault(); if (key) save({ openrouterKey: key }).then(() => setKey("")); }}>
            <input className={s.input} style={{ flex: 1, minWidth: 200 }} type="password" autoComplete="off" placeholder={x.openrouterKey ? "••••••••" : "sk-or-…"}
                   value={key} onChange={(e) => setKey(e.target.value)} aria-label={t("settings.key")} />
            <Button kind="primary" type="submit" disabled={!key}>{t("settings.save")}</Button>
          </form>
        </section>

        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("settings.money")}</h2>
          <label className={s.switch}><input type="checkbox" checked={x.inrAuto} onChange={(e) => save({ inrAuto: e.target.checked })} />
            <span>{t("settings.money.auto")}</span></label>
          <label className={s.field}><span className={s.label}>{t("settings.money.rate")}</span>
            <input className={s.input} type="number" min={50} max={200} step={0.01} value={x.inrPerUsd} style={{ maxWidth: 160 }} disabled={x.inrAuto}
                   onChange={(e) => setX({ ...x, inrPerUsd: Number(e.target.value) })}
                   onBlur={(e) => Number(e.target.value) !== status?.inrPerUsd && save({ inrPerUsd: Number(e.target.value) })} /></label>
          <p className={s.faint}>US$1 = ₹{num(lang, x.inrPerUsd)} · {x.inrAuto
            ? (x.inrUpdated ? t("settings.money.updated", { when: shortDate(lang, x.inrUpdated.slice(0, 10)) }) : t("settings.money.never"))
            : t("settings.money.manual")}</p>
        </section>

        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("settings.site")}</h2>
          <p className={s.muted}>{t("settings.site.body")}</p>
          <input className={s.input} type="url" placeholder="https://…" value={x.siteUrl} onChange={(e) => setX({ ...x, siteUrl: e.target.value })}
                 onBlur={(e) => e.target.value !== (status?.siteUrl ?? "") && save({ siteUrl: e.target.value })} aria-label={t("settings.site")} />
        </section>

        <ConnectCard />

        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("settings.papers")}</h2>
          <p className={s.muted}>{t("settings.papers.body")}</p>
          <div><Link className={s.btn} href="/newsroom/papers">{Icon.papers()}{t("settings.papers.open")}</Link></div>
        </section>

        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("settings.about")}</h2>
          <dl className={s.facts}>
            <dt>{t("settings.news")}</dt><dd>{t("settings.newsBody")}</dd>
            <dt>{t("settings.version")}</dt><dd>{status?.version ?? "—"}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
