"use client";
// જાહેરાત / Ads: book an ad -- its image, its size, its page, where on the page
// (tapped on the page drawn to scale, or a quick choice), and its days; the
// day's bookings as cards (moved to another page or place, or removed), and the
// sample ads that print on a day with nothing booked (each on or off, or all).
import { useCallback, useEffect, useState } from "react";
import { call, media, type AdAt, type AdRow, type PageLayout } from "../api";
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
  // (none chosen: the foot of the page, on the right)
  const [spot, setSpot] = useState<AdAt | null>(null);
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
  // (a place chosen before a wider or taller size: kept on the page)
  const at = !layout || !band ? { col: 0, topCm: 0 } : spot
    ? { col: Math.min(spot.col, Math.max(0, layout.columns - cols)), topCm: round1(Math.max(0, Math.min(spot.topCm, room - height))) }
    : presetAt("bottomRight", layout, band, cols, height);

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
      const got = await call<{ booked: string[] }>("/api/ads", { json: { name: file.name, base64: await toBase64(file), cols, heightCm: height, page, at, from, to, weekdays } });
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
  // a booking to another page or another place on it (every day it runs)
  const move = async (id: string, change: { page?: number; at?: AdAt }) => {
    try {
      await call(`/api/ads/${encodeURIComponent(id)}`, { method: "PATCH", json: change });
      toast(t("ads.moved"));
      setNeedsLayout(!!status?.issue);
      load();
    } catch (e) { setError((e as Error).message); }
  };
  // the sample ads: all on or off, or one of them
  const samples = async (change: { on?: boolean; id?: string; use?: boolean }) => {
    try {
      await call("/api/ads/samples", { json: change });
      toast(t("ads.saved"));
      setNeedsLayout(!!status?.issue);
      refresh();
      load();
    } catch (e) { setError((e as Error).message); }
  };
  const layOut = async () => {
    try { await call(`/api/issues/${date}/build`, { json: {} }); toast(t("paper.rebuilding")); setNeedsLayout(false); refresh(); }
    catch (e) { setError((e as Error).message); }
  };
  const booked = (ads ?? []).filter((a) => !a.sample);
  const sampleAds = (ads ?? []).filter((a) => a.sample);
  const samplesOn = status?.samplesOn ?? true;
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
              <span className={s.label}>{t("ads.place")}</span>
              <div className={s.presets}>{PRESETS.map((p) => {
                const got = layout && band ? presetAt(p, layout, band, cols, height) : null;
                return <button type="button" key={p} aria-pressed={!!got && sameAt(got, at)} onClick={() => got && setSpot(got)}>{t(`ads.place.${p}`)}</button>;
              })}</div>
            </div>
            <div className={s.field} style={{ alignItems: "center" }}>
              <PagePreview layout={layout} page={page} cols={cols} height={height} tooTall={tooTall} preview={preview} at={at} onPick={setSpot} width={170} />
              <span className={s.faint} style={{ maxWidth: 170, textAlign: "center" }}>{t("ads.preview")}</span>
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
        <div className={s.field} style={{ gap: 16 }}>
          <section className={s.card}>
            <h2 className={s.cardTitle}>{t("ads.bookedOnDay")}</h2>
            {ads && !booked.length && <p className={s.muted}>{t("ads.noneBooked")}</p>}
            <div className={s.adGrid}>
              {booked.map((a) => (
                <div key={a.id} className={s.adCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={media(a.url)} alt="" />
                  <div className={s.adMeta}>
                    <span>{t("ads.size", { w: num(lang, round1(pxToCm(a.width))), h: num(lang, round1(pxToCm(a.height))) })}</span>
                    {a.days.length > 1 && <span>{t("ads.runs", { from: shortDate(lang, a.days[0]), to: shortDate(lang, a.days[a.days.length - 1]) })}</span>}
                    <span className={s.label}>{t("ads.page")}</span>
                    <div className={s.segmented}>{pages.map((p) => (
                      <button type="button" key={p} aria-pressed={a.page === p} onClick={() => a.page !== p && move(a.id, { page: p })}>{num(lang, p)}</button>
                    ))}</div>
                    <span className={s.label}>{t("ads.place")}</span>
                  </div>
                  <BookedPlace ad={a} layout={layout} move={(to) => move(a.id, { at: to })} />
                  <div><span /><Button kind="quiet" icon={Icon.trash()} onClick={() => remove(a.id)}>{t("ads.remove")}</Button></div>
                </div>
              ))}
            </div>
          </section>
          <section className={s.card}>
            <h2 className={s.cardTitle}>{t("ads.samples")}</h2>
            <p className={s.muted} style={{ margin: 0 }}>{t("ads.samplesHint")}</p>
            <label className={s.switch}><input type="checkbox" checked={samplesOn} onChange={(e) => samples({ on: e.target.checked })} /><span>{t("ads.samplesOn")}</span></label>
            {!samplesOn && <Note>{t("ads.samplesOff")}</Note>}
            <div className={s.adGrid}>
              {sampleAds.map((a) => (
                <div key={a.id} className={s.adCard} style={{ opacity: samplesOn && a.inUse ? 1 : 0.45 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={media(a.url)} alt="" />
                  <div className={s.adMeta}>
                    <strong>{t("paper.page", { n: num(lang, a.page) })}</strong>
                    <span>{t("ads.size", { w: num(lang, round1(pxToCm(a.width))), h: num(lang, round1(pxToCm(a.height))) })}</span>
                    {!a.inUse && <span>{t("ads.notUsed")}</span>}
                  </div>
                  <div><span />
                    <Button kind="quiet" disabled={!samplesOn} onClick={() => samples({ id: a.id, use: !a.inUse })}>{a.inUse ? t("ads.dontUse") : t("ads.use")}</Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/** A length on the laid-out page (300 dots an inch) in centimetres. */
const pxToCm = (px: number) => (px / 300) * 2.54;

/** The quick choices of place. */
const PRESETS = ["topLeft", "topRight", "center", "bottomLeft", "bottomMiddle", "bottomRight"] as const;
type Preset = (typeof PRESETS)[number];
type Band = PageLayout["pages"][number];
const sameAt = (a: AdAt, b: AdAt) => a.col === b.col && Math.abs(a.topCm - b.topCm) < 0.05;
/** An ad's width in columns, from its width in cm. */
const colsOfCm = (layout: PageLayout, cm: number) => Math.max(1, Math.round((cm + layout.gutterCm) / (layout.columnCm + layout.gutterCm)));

/** Where a quick choice puts an ad of `cols` columns, `height` cm tall. */
function presetAt(p: Preset, layout: PageLayout, band: Band, cols: number, height: number): AdAt {
  const span = Math.max(0, layout.columns - cols);
  const room = Math.max(0, band.bottomCm - band.topCm - height);
  const col = p.endsWith("Left") ? 0 : p.endsWith("Right") ? span : Math.floor(span / 2);
  const topCm = p.startsWith("top") ? 0 : p === "center" ? Math.round(room) / 2 : room;
  return { col, topCm: round1(topCm) };
}

/** A booking's place on its page: tapped on a small page, or a quick choice. */
function BookedPlace({ ad, layout, move }: { ad: AdRow; layout: PageLayout | null; move: (at: AdAt) => void }) {
  const { t } = useApp();
  if (!layout) return null;
  const band = layout.pages.find((p) => p.page === ad.page) ?? layout.pages[0];
  const h = pxToCm(ad.height);
  const cols = colsOfCm(layout, pxToCm(ad.width));
  // (one booked before places on the page: along the foot, at its side)
  const at = ad.at ?? presetAt(ad.place === "left" ? "bottomLeft" : ad.place === "middle" ? "bottomMiddle" : "bottomRight", layout, band, cols, h);
  return (
    <div className={s.adPlace}>
      <PagePreview layout={layout} page={ad.page} cols={cols} height={h} tooTall={false} preview={media(ad.url)} at={at} onPick={move} width={84} />
      <select className={s.select} value={PRESETS.find((p) => sameAt(presetAt(p, layout, band, cols, h), at)) ?? ""} aria-label={t("ads.place")}
              onChange={(e) => e.target.value && move(presetAt(e.target.value as Preset, layout, band, cols, h))}>
        <option value="" disabled>{t("ads.tapToMove")}</option>
        {PRESETS.map((p) => <option key={p} value={p}>{t(`ads.place.${p}`)}</option>)}
      </select>
    </div>
  );
}

/** The page to scale: the header, the columns, and the ad where it goes.
 * Tapped, the ad goes there: centred on the tap, on whole columns and half
 * centimetres, inside the room for news. */
function PagePreview({ layout, page, cols, height, tooTall, preview, at, onPick, width: boxWidth }:
  { layout: PageLayout | null; page: number; cols: number; height: number; tooTall: boolean; preview: string; at: AdAt;
    onPick?: (at: AdAt) => void; width?: number }) {
  if (!layout) return <div className={s.adPage} style={{ width: boxWidth }} />;
  const band = layout.pages.find((p) => p.page === page) ?? layout.pages[0];
  const W = layout.widthCm, H = layout.heightCm;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const pitch = layout.columnCm + layout.gutterCm;
  const width = cols * layout.columnCm + (cols - 1) * layout.gutterCm;
  const room = band.bottomCm - band.topCm;
  const h = Math.min(height, room);
  const left = layout.leftCm + at.col * pitch;
  const top = band.topCm + Math.min(at.topCm, room - h);
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    const col = Math.max(0, Math.min(layout.columns - cols, Math.round((x - layout.leftCm - width / 2) / pitch)));
    const topCm = Math.max(0, Math.min(room - h, Math.round((y - band.topCm - h / 2) * 2) / 2));
    onPick({ col, topCm: round1(topCm) });
  };
  return (
    <div className={s.adPage} style={{ aspectRatio: `${W} / ${H}`, width: boxWidth, cursor: onPick ? "crosshair" : undefined }} onClick={pick}>
      <span className={s.adHead} style={{ height: pct(band.topCm, H) }} />
      {Array.from({ length: layout.columns }, (_, c) => (
        <span key={c} className={s.adCol} style={{ left: pct(layout.leftCm + c * pitch, W), width: pct(layout.columnCm, W),
                                                    top: pct(band.topCm, H), height: pct(room, H) }} />
      ))}
      <span className={s.adBox} data-bad={tooTall} style={{ width: pct(width, W), height: pct(h, H), left: pct(left, W), top: pct(top, H),
                                                          backgroundImage: preview ? `url(${preview})` : undefined }} />
    </div>
  );
}
