"use client";
// જાહેરાત / Ads: book an ad -- its image, its size, its page and its days --
// with a preview of its room on a page; the day's ads as cards.
import { useCallback, useEffect, useState } from "react";
import { call, media, type AdRow } from "../api";
import { TopBar } from "../Shell";
import s from "../newsroom.module.css";
import { num } from "../ui/format";
import { Button, Icon, Note, useApp } from "../ui/kit";

const toBase64 = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = () => bad(new Error("couldn't read that file"));
  r.readAsDataURL(f);
});
// the page in centimetres (Capital Kranti: 39 × 52.5 cm, 8 columns)
const PAGE_CM = { w: 39, h: 52.5, cols: 8 };

export default function Ads() {
  const { t, lang, date, toast } = useApp();
  const [ads, setAds] = useState<AdRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [over, setOver] = useState(false);
  const [cols, setCols] = useState(4);
  const [heightCm, setHeightCm] = useState(10);
  const [page, setPage] = useState(4);
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { call<AdRow[]>(`/api/ads?date=${date}`).then(setAds).catch((e) => setError(e.message)); }, [date]);
  useEffect(() => { setFrom(date); setTo(date); load(); }, [date, load]);
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!file) return setError(t("ads.needImage"));
    setSaving(true);
    try {
      const got = await call<{ booked: string[] }>("/api/ads", { json: { name: file.name, base64: await toBase64(file), cols, heightCm, page, from, to, weekdays } });
      toast(t("ads.booked", { n: num(lang, got.booked.length) }));
      setFile(null);
      load();
    } catch (err) { setError((err as Error).message); }
    setSaving(false);
  };
  const remove = async (id: string) => {
    try { await call(`/api/ads/${encodeURIComponent(id)}`, { method: "DELETE" }); toast(t("ads.removed")); load(); }
    catch (e) { setError((e as Error).message); }
  };
  const standIns = ads.length > 0 && ads.every((a) => !a.url.startsWith("/media/ads/"));
  const days = t("weekdays").split(",");

  return (
    <div className={s.inner}>
      <TopBar title={t("ads.title")} />
      <div className={s.grid2}>
        <form className={s.card} onSubmit={book}>
          <h2 className={s.cardTitle}>{t("ads.new")}</h2>
          <label className={s.drop} data-over={over} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                 onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="" style={{ maxHeight: 140, maxWidth: "100%" }} /> : <>{Icon.image()}<div>{t("ads.drop")}</div></>}
            <input type="file" accept="image/jpeg,image/png" aria-label={t("ads.image")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className={s.adPreview}>
            <div className={s.field} style={{ flex: 1 }}>
              <span className={s.label}>{t("ads.width")}</span>
              <select className={s.select} value={cols} onChange={(e) => setCols(Number(e.target.value))}>
                {Array.from({ length: PAGE_CM.cols }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{t("ads.cols", { n: num(lang, c) })}</option>)}
              </select>
              <span className={s.label}>{t("ads.height")}</span>
              <input className={s.input} type="number" min={1} max={50} step={0.5} value={heightCm} onChange={(e) => setHeightCm(Number(e.target.value))} />
              <span className={s.label}>{t("ads.page")}</span>
              <div className={s.segmented}>{[1, 2, 3, 4].map((p) => <button type="button" key={p} aria-pressed={page === p} onClick={() => setPage(p)}>{num(lang, p)}</button>)}</div>
            </div>
            <div className={s.field} style={{ alignItems: "center" }}>
              <div className={s.adPage} title={t("ads.preview")}>
                <span style={{ width: `${(cols / PAGE_CM.cols) * 90}%`, height: `${Math.min(96, (heightCm / PAGE_CM.h) * 100)}%` }} />
              </div>
              <span className={s.faint}>{t("ads.preview")}</span>
            </div>
          </div>
          <div className={s.row}>
            <label className={s.field} style={{ flex: 1 }}><span className={s.label}>{t("ads.from")}</span><input className={s.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className={s.field} style={{ flex: 1 }}><span className={s.label}>{t("ads.to")}</span><input className={s.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <div className={s.field}><span className={s.label}>{t("ads.days")}</span>
            <div className={s.days}>{days.map((d, i) => (
              <label key={d}><input type="checkbox" checked={weekdays.includes(i)} onChange={(e) => setWeekdays(e.target.checked ? [...weekdays, i] : weekdays.filter((x) => x !== i))} />{d}</label>
            ))}</div></div>
          {error && <Note tone="bad">{error}</Note>}
          <Button kind="primary" type="submit" disabled={saving} icon={Icon.check()}>{t("ads.book")}</Button>
        </form>
        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("ads.onDay")}</h2>
          {standIns && <p className={s.muted}>{t("ads.standIns")}</p>}
          <div className={s.adGrid}>
            {ads.map((a) => (
              <div key={a.id} className={s.adCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media(a.url)} alt="" />
                <div><span>{t("paper.page", { n: num(lang, a.page) })}</span>
                  {a.url.startsWith("/media/ads/") && <Button kind="quiet" onClick={() => remove(a.id)}>{t("ads.remove")}</Button>}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
