"use client";
// Other papers' designs: one PDF per paper (its title, headers and footer on
// its pages), each copy going with one -- given in turn as they're added,
// changed here; a design may go with any number of copies. The copies on their designs are saved in a folder in
// Downloads; copies made before (PDFs from elsewhere) can be put on theirs too
// (backend/src/export/designs.ts).
import { useState } from "react";
import { call, type CopiesRun, type PaperDesigns } from "../api";
import s from "../newsroom.module.css";
import { num } from "../ui/format";
import { Button, Icon, Note, useApp } from "../ui/kit";

const toBase64 = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = () => bad(new Error("couldn't read that file"));
  r.readAsDataURL(f);
});
const GU_DIGITS = "૦૧૨૩૪૫૬૭૮૯";
/** The copy number in a file's name: "copy 7", "નકલ ૭", "copy-7.pdf", else its last number. */
export function copyNumberIn(name: string): number | null {
  const latin = name.replace(/[૦-૯]/g, (c) => String(GU_DIGITS.indexOf(c)));
  const m = latin.match(/(?:copy|નકલ)\s*[-_ ]?\s*(\d+)/i) ?? latin.replace(/\.pdf$/i, "").match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
}
/** A design's name without ".pdf". */
export const designName = (name: string) => name.replace(/\.pdf$/i, "");

type Old = { file: File; n: string; done?: boolean };

export function Designs({ designs, onChange, run, date, nameOf }:
  { designs: PaperDesigns; onChange: (d: PaperDesigns) => void; run: CopiesRun | null; date: string; nameOf: (n: number) => string }) {
  const { t, lang } = useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [saved, setSaved] = useState<{ folder: string; n: number; without: number[] } | null>(null);
  const [old, setOld] = useState<Old[]>([]);
  const byId = new Map(designs.designs.map((d) => [d.id, d]));
  const pagesOf = (n: number) => run?.files.find((f) => f.n === n)?.pages ?? run?.files[0]?.pages ?? 4;
  // a row for every copy made, every design and every copy given one
  const rows = Math.max(run?.count ?? 0, designs.designs.length, ...Object.keys(designs.copies).map(Number));
  const folderName = (p: string) => p.split(/[\\/]/).pop() ?? p;

  const add = async (files: File[]) => {
    setError("");
    try {
      for (const [i, f] of files.entries()) {
        setBusy(t("design.adding", { done: num(lang, i + 1), total: num(lang, files.length) }));
        onChange(await call<PaperDesigns>("/api/designs", { json: { name: f.name, base64: await toBase64(f) } }));
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const act = async (run: () => Promise<PaperDesigns>) => {
    setError("");
    try { onChange(await run()); } catch (e) { setError((e as Error).message); }
  };
  const saveAll = async () => {
    setError(""); setSaved(null); setBusy(t("design.saveAll"));
    try {
      const names = Object.fromEntries((run?.files ?? []).map((f) => [String(f.n), nameOf(f.n)]));
      const got = await call<{ folder: string; saved: number[]; without: number[] }>("/api/designs/save", { json: { date, names } });
      setSaved({ folder: got.folder, n: got.saved.length, without: got.without });
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const putOn = async () => {
    setError(""); setSaved(null);
    const ns = old.map((o) => Number(o.n));
    if (ns.some((n) => !(n >= 1))) { setError(t("design.old.noNumber")); return; }
    if (new Set(ns).size !== ns.length) { setError(t("design.old.same")); return; }
    let folder = "";
    try {
      for (const [i, o] of old.entries()) {
        if (o.done) continue;
        setBusy(t("design.old.doing", { done: num(lang, i + 1), total: num(lang, old.length) }));
        folder = (await call<{ folder: string }>("/api/designs/stamp", { json: { date, copy: Number(o.n), name: o.file.name, base64: await toBase64(o.file) } })).folder;
        setOld((now) => now.map((x) => (x === o ? { ...x, done: true } : x)));
      }
      setSaved({ folder, n: old.length, without: [] });
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const reveal = () => call("/api/designs/reveal", { json: { date } }).catch((e) => setError((e as Error).message));

  return (
    <section className={s.card}>
      <div className={s.cardHead}><h2 className={s.cardTitle}>{t("design.title")}</h2></div>
      <p className={s.muted} style={{ margin: 0 }}>{t("design.body")}</p>
      <label className={s.drop}>
        {Icon.download()}<div>{busy && busy !== t("design.saveAll") && !old.length ? busy : t("design.drop")}</div>
        <input type="file" accept="application/pdf,.pdf" multiple disabled={!!busy} aria-label={t("design.drop")}
               onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) add(f); }} />
      </label>

      {rows > 0 && <div className={s.field}>
        {Array.from({ length: rows }, (_, i) => i + 1).map((n) => {
          const d = byId.get(designs.copies[String(n)] ?? "");
          const need = pagesOf(n);
          return (
            <div key={n} className={s.field} style={{ gap: 4 }}>
              <div className={s.row} style={{ gap: 12 }}>
                <span style={{ minWidth: 70 }}><strong>{t("design.copy", { n: num(lang, n) })}</strong></span>
                <select className={s.select} style={{ flex: 1, minWidth: 180 }} value={d?.id ?? ""} aria-label={t("design.copy", { n: num(lang, n) })}
                        onChange={(e) => act(() => call("/api/designs/assign", { json: { copy: n, id: e.target.value || null } }))}>
                  <option value="">{t("design.none")}</option>
                  {designs.designs.map((x) => <option key={x.id} value={x.id}>{designName(x.name)}</option>)}
                </select>
                {d && <Button kind="quiet" onClick={() => act(() => call("/api/designs/assign", { json: { copy: 1, upTo: rows, id: d.id } }))}>{t("design.every")}</Button>}
                {d && <Button kind="quiet" icon={Icon.trash()} aria-label={`${designName(d.name)}: ${t("copies.extra.removeItem")}`}
                              onClick={() => { if (window.confirm(t("design.removeConfirm", { name: designName(d.name) }))) act(() => call(`/api/designs/${d.id}`, { method: "DELETE" })); }}>{t("copies.extra.removeItem")}</Button>}
              </div>
              {d && d.pages < need && <span className={s.hint}>{t("design.pages", { has: num(lang, d.pages), need: num(lang, need) })}</span>}
            </div>
          );
        })}
      </div>}

      {designs.designs.length > 0 && <div className={s.row} style={{ justifyContent: "space-between", gap: 12 }}>
        <Button kind="danger" icon={Icon.trash()} disabled={!!busy}
                onClick={() => { if (window.confirm(t("design.removeAllConfirm"))) act(() => call("/api/designs/all", { method: "DELETE" })); }}>{t("design.removeAll")}</Button>
        {!!run?.files.length && run.status !== "running" &&
          <Button kind="primary" icon={Icon.download()} disabled={!!busy} onClick={saveAll}>{busy === t("design.saveAll") ? `${t("design.saveAll")}…` : t("design.saveAll")}</Button>}
      </div>}

      {designs.designs.length > 0 && <div className={s.field} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 12 }}>
        <strong>{t("design.old.title")}</strong>
        <span className={s.hint}>{t("design.old.body")}</span>
        <label className={s.drop} style={{ padding: 14 }}>
          {Icon.download()}<div>{t("design.old.drop")}</div>
          <input type="file" accept="application/pdf,.pdf" multiple disabled={!!busy} aria-label={t("design.old.drop")}
                 onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; setSaved(null);
                   setOld((now) => [...now, ...f.map((file) => ({ file, n: String(copyNumberIn(file.name) ?? "") }))]
                     .sort((a, b) => (Number(a.n) || 999) - (Number(b.n) || 999))); }} />
        </label>
        {old.map((o, i) => (
          <div key={i} className={s.row} style={{ gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{o.done ? "✓ " : ""}{o.file.name}</span>
            <span className={s.label}>{t("design.copy", { n: "" }).trim()}</span>
            <input className={`${s.input} ${s.countInput}`} type="number" min={1} value={o.n} disabled={!!busy}
                   aria-label={`${o.file.name}: ${t("design.copy", { n: "" }).trim()}`}
                   onChange={(e) => setOld((now) => now.map((x, k) => (k === i ? { ...x, n: e.target.value, done: false } : x)))} />
            {o.n && !designs.copies[o.n] && <span className={s.hint}>{t("design.none")}</span>}
          </div>
        ))}
        {old.length > 0 && <div className={s.row} style={{ justifyContent: "space-between", gap: 12 }}>
          <Button kind="quiet" disabled={!!busy} onClick={() => setOld([])}>{t("design.old.clear")}</Button>
          <Button kind="primary" icon={Icon.download()} disabled={!!busy} onClick={putOn}>{old.length && busy && old.some((o) => !o.done) ? busy : t("design.old.go")}</Button>
        </div>}
      </div>}

      {saved && <Note tone="good">{t("design.saved", { n: num(lang, saved.n), folder: folderName(saved.folder) })}</Note>}
      {saved && saved.without.length > 0 && <Note tone="warn">{t("design.without", { list: saved.without.map((n) => num(lang, n)).join(", ") })}</Note>}
      {saved && <span><Button icon={Icon.external()} onClick={reveal}>{t("design.openFolder")}</Button></span>}
      {error && <Note tone="bad">{error}</Note>}
    </section>
  );
}
