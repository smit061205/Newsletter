"use client";
// જાહેરાત / Ads: book an ad -- its image, its size, its page and its days --
// with its room drawn on the page to scale; the day's ads as cards, each with
// its size and the days it runs.
import { useCallback, useEffect, useState } from "react";
import { call, media, type AdRow, type PageLayout } from "../api";
import { TopBar, useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { num, shortDate } from "../ui/format";
import { Button, Icon, Note, useApp } from "../ui/kit";

const toBase64 = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = () => bad(new Error("couldn't read that file"));
  r.readAsDataURL(f);
});
const round1 = (x: number) => Math.round(x * 10) / 10;

export default function Ads() {
  const { t, lang, date, toast } = useApp();
  const { status, refresh } = useStatus();
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [ads, setAds] = useState<AdRow[] | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [aspect, setAspect] = useState(0); // the image's height over its width
  const [over, setOver] = useState(false);
  const [cols, setCols] = useState(4);
  const [autoHeight, setAutoHeight] = useState(true);
  const [heightCm, setHeightCm] = useState(10);
  const [page, setPage] = useState(4);
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [needsLayout, setNeedsLayout] = useState(false);

  useEffect(() => { call<PageLayout>("/api/layout").then(setLayout).catch((e) => setError(e.message)); }, []);
  const load = useCallback(() => { call<AdRow[]>(`/api/ads?date=${date}`).then(setAds).catch((e) => setError(e.message)); }, [date]);
  useEffect(() => { setFrom(date); setTo(date); setNeedsLayout(false); setAds(null); load(); }, [date, load]);
  useEffect(() => {
    if (!file) { setPreview(""); setAspect(0); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    const img = new Image();
    img.onload = () => setAspect(img.naturalHeight / img.naturalWidth);
    img.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // sizes in centimetres
  const widthOf = useCallback((c: number) => (layout ? c * layout.columnCm + (c - 1) * layout.gutterCm : 0), [layout]);
  const band = layout?.pages.find((p) => p.page === page);
  const room = band ? round1(band.bottomCm - band.topCm) : 0;
  const height = autoHeight && aspect ? round1(widthOf(cols) * aspect) : heightCm;
  const tooTall = !!band && height > room;
  const pages = layout?.pages.map((p) => p.page) ?? [1, 2, 3, 4];

  const pick = (f: File | undefined | null) => {
    setError("");
    if (f && !/^image\/(jpeg|png)$/.test(f.type)) return setError(t("ads.image"));
    setFile(f ?? null);
  };
  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!file) return setError(t("ads.needImage"));
    if (tooTall) return setError(t("ads.tooTall", { cm: num(lang, room) }));
    setSaving(true);
    try {
      const got = await call<{ booked: string[] }>("/api/ads", { json: { name: file.name, base64: await toBase64(file), cols, heightCm: height, page, from, to, weekdays } });
      toast(t("ads.booked", { n: num(lang, got.booked.length) }));
      setFile(null);
      // the day's paper is made already: the ad reaches its page when it's laid out again
      setNeedsLayout(!!status?.issue && got.booked.includes(date));
      load();
    } catch (err) { setError((err as Error).message); }
    setSaving(false);
  };
  const remove = async (id: string) => {
    if (!window.confirm(t("ads.confirmRemove"))) return;
    try {
      await call(`/api/ads/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast(t("ads.removed"));
      setNeedsLayout(!!status?.issue);
      load();
    } catch (e) { setError((e as Error).message); }
  };
  const layOut = async () => {
    try { await call(`/api/issues/${date}/build`, { json: {} }); toast(t("paper.rebuilding")); setNeedsLayout(false); refresh(); }
    catch (e) { setError((e as Error).message); }
  };
  const standIns = !!ads?.length && ads.every((a) => a.sample);
  const days = t("weekdays").split(",");

  return (
    <div className={s.inner}>
      <TopBar title={t("ads.title")} />
      {needsLayout && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <p className={s.muted} style={{ margin: 0 }}>{t("ads.layoutHint")}</p>
            <Button kind="primary" icon={Icon.refresh()} onClick={layOut} disabled={!!status?.running}>{t("ads.layoutNow")}</Button>
          </div>
        </div>
      )}
      <div className={s.grid2}>
        <form className={s.card} onSubmit={book}>
          <h2 className={s.cardTitle}>{t("ads.new")}</h2>
          <label className={s.drop} data-over={over} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
                 onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview ? <img src={preview} alt="" style={{ maxHeight: 160, maxWidth: "100%" }} /> : <>{Icon.image()}<div>{t("ads.drop")}</div></>}
            <input type="file" accept="image/jpeg,image/png" aria-label={t("ads.image")} onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <div className={s.adPreview}>
            <div className={s.field} style={{ flex: 1 }}>
              <span className={s.label}>{t("ads.width")}</span>
              <select className={s.select} value={cols} onChange={(e) => setCols(Number(e.target.value))}>
                {Array.from({ length: layout?.columns ?? 8 }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c}>{t("ads.cols", { n: num(lang, c) })}{layout ? ` · ${num(lang, round1(widthOf(c)))} cm` : ""}</option>
                ))}
              </select>
              <span className={s.label}>{t("ads.height")}</span>
              {aspect > 0 && (
                <label className={s.switch}><input type="checkbox" checked={autoHeight} onChange={(e) => { setAutoHeight(e.target.checked); setHeightCm(height); }} />
                  <span>{t("ads.autoHeight")}</span></label>
              )}
              <input className={s.input} type="number" min={1} max={room || 50} step={0.5} value={height} disabled={autoHeight && aspect > 0}
                     onChange={(e) => setHeightCm(Number(e.target.value))} aria-label={t("ads.height")} />
              {band && <span className={s.hint} data-tone={tooTall ? "bad" : undefined}>{tooTall ? t("ads.tooTall", { cm: num(lang, room) }) : t("ads.maxHeight", { cm: num(lang, room) })}</span>}
              <span className={s.label}>{t("ads.page")}</span>
              <div className={s.segmented}>{pages.map((p) => <button type="button" key={p} aria-pressed={page === p} onClick={() => setPage(p)}>{num(lang, p)}</button>)}</div>
            </div>
            <div className={s.field} style={{ alignItems: "center" }}>
              <PagePreview layout={layout} page={page} cols={cols} height={height} tooTall={tooTall} preview={preview} />
              <span className={s.faint}>{t("ads.preview")}</span>
            </div>
          </div>
          <p className={s.faint} style={{ margin: 0 }}>{t("ads.where")}</p>
          <div className={s.row}>
            <label className={s.field} style={{ flex: 1 }}><span className={s.label}>{t("ads.from")}</span><input className={s.input} type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></label>
            <label className={s.field} style={{ flex: 1 }}><span className={s.label}>{t("ads.to")}</span><input className={s.input} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <div className={s.field}><span className={s.label}>{t("ads.days")}</span>
            <div className={s.days}>{days.map((d, i) => (
              <label key={d}><input type="checkbox" checked={weekdays.includes(i)} onChange={(e) => setWeekdays(e.target.checked ? [...weekdays, i] : weekdays.filter((x) => x !== i))} />{d}</label>
            ))}</div></div>
          {error && <Note tone="bad">{error}</Note>}
          <Button kind="primary" type="submit" disabled={saving || tooTall} icon={Icon.check()}>{t("ads.book")}</Button>
        </form>
        <section className={s.card}>
          <h2 className={s.cardTitle}>{t("ads.onDay")}</h2>
          {ads && !ads.length && <p className={s.muted}>{t("ads.none")}</p>}
          {standIns && <p className={s.muted}>{t("ads.standIns")}</p>}
          <div className={s.adGrid}>
            {(ads ?? []).map((a) => (
                <div key={a.id} className={s.adCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={media(a.url)} alt="" />
                  <div className={s.adMeta}>
                    <strong>{t("paper.page", { n: num(lang, a.page) })}</strong>
                    <span>{t("ads.size", { w: num(lang, round1(pxToCm(a.width))), h: num(lang, round1(pxToCm(a.height))) })}</span>
                    {a.sample ? <span>{t("ads.sample")}</span>
                      : a.days.length > 1 ? <span>{t("ads.runs", { from: shortDate(lang, a.days[0]), to: shortDate(lang, a.days[a.days.length - 1]) })}</span> : null}
                  </div>
                  {!a.sample && <div><span /><Button kind="quiet" icon={Icon.trash()} onClick={() => remove(a.id)}>{t("ads.remove")}</Button></div>}
                </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** A length on the laid-out page (300 dots an inch) in centimetres. */
const pxToCm = (px: number) => (px / 300) * 2.54;

/** The page to scale: the header, the columns, and the new ad where the
 * layout puts it (the foot of the page, on the right). */
function PagePreview({ layout, page, cols, height, tooTall, preview }:
  { layout: PageLayout | null; page: number; cols: number; height: number; tooTall: boolean; preview: string }) {
  if (!layout) return <div className={s.adPage} />;
  const band = layout.pages.find((p) => p.page === page) ?? layout.pages[0];
  const W = layout.widthCm, H = layout.heightCm;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const width = cols * layout.columnCm + (cols - 1) * layout.gutterCm;
  const right = layout.leftCm + layout.columns * layout.columnCm + (layout.columns - 1) * layout.gutterCm;
  const h = Math.min(height, band.bottomCm - band.topCm);
  return (
    <div className={s.adPage} style={{ aspectRatio: `${W} / ${H}` }}>
      <span className={s.adHead} style={{ height: pct(band.topCm, H) }} />
      {Array.from({ length: layout.columns }, (_, c) => (
        <span key={c} className={s.adCol} style={{ left: pct(layout.leftCm + c * (layout.columnCm + layout.gutterCm), W), width: pct(layout.columnCm, W),
                                                    top: pct(band.topCm, H), height: pct(band.bottomCm - band.topCm, H) }} />
      ))}
      <span className={s.adBox} data-bad={tooTall} style={{ width: pct(width, W), height: pct(h, H), left: pct(right - width, W), top: pct(band.bottomCm - h, H),
                                                          backgroundImage: preview ? `url(${preview})` : undefined }} />
    </div>
  );
}
