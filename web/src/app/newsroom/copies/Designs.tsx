"use client";
// Other papers' titles, page headers and footers: given once as PDFs from
// CorelDRAW, then a copy given a paper opens printed on them
// (backend/src/export/designs.ts).
import { useState } from "react";
import { call, type PaperDesigns } from "../api";
import s from "../newsroom.module.css";
import { num } from "../ui/format";
import { Badge, Button, Icon, Note, useApp } from "../ui/kit";

const toBase64 = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = () => bad(new Error("couldn't read that file"));
  r.readAsDataURL(f);
});

/** The parts of a paper of `pages` pages: its title, each page's header, its footer. */
export const slotsFor = (pages: number) => ["title", ...Array.from({ length: Math.max(0, pages - 1) }, (_, i) => `header-${i + 2}`), "footer"];

export function Designs({ designs, pages, onChange }: { designs: PaperDesigns; pages: number; onChange: (d: PaperDesigns) => void }) {
  const { t, lang, toast } = useApp();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const act = async (key: string, run: () => Promise<PaperDesigns>, ok = true) => {
    setError(""); setBusy(key);
    try { onChange(await run()); if (ok) toast(t("design.saved")); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  };
  const label = (slot: string) => slot === "title" ? t("design.slot.title") : slot === "footer" ? t("design.slot.footer")
    : t("design.slot.header", { n: num(lang, slot.replace("header-", "")) });

  return (
    <section className={s.card}>
      <div className={s.cardHead}><h2 className={s.cardTitle}>{t("design.title")}</h2></div>
      <p className={s.muted} style={{ margin: 0 }}>{t("design.body")}</p>
      <span className={s.hint}>{t("design.how")}</span>
      {!designs.designs.length && <span className={s.faint}>{t("design.none")}</span>}
      {designs.designs.map((d) => (
        <div key={d.id} className={s.field} style={{ borderTop: "1px solid var(--line, #ddd)", paddingTop: 12 }}>
          <div className={s.row} style={{ justifyContent: "space-between", gap: 12 }}>
            <input className={s.input} style={{ flex: 1, minWidth: 180 }} defaultValue={d.name} aria-label={t("design.name")}
                   onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.name) act(`n${d.id}`, () => call(`/api/designs`, { json: { name: v, id: d.id } })); }} />
            <Button kind="danger" icon={Icon.trash()} disabled={!!busy}
                    onClick={() => { if (window.confirm(t("design.deleteConfirm", { name: d.name }))) act(`d${d.id}`, () => call(`/api/designs/${d.id}`, { method: "DELETE" })); }}>
              {t("design.delete")}</Button>
          </div>
          {slotsFor(pages).map((slot) => {
            const has = !!d.slots[slot];
            return (
              <div key={slot} className={s.row} style={{ justifyContent: "space-between", gap: 12 }}>
                <span style={{ minWidth: 160 }}>{label(slot)}</span>
                <Badge tone={has ? "good" : "warn"} dot>{has ? t("design.added") : t("design.missing")}</Badge>
                <span className={s.row} style={{ gap: 8 }}>
                  <label className={`${s.btn}`} style={{ cursor: busy ? "default" : "pointer" }}>
                    {has ? t("design.change") : t("design.pick")}
                    <input type="file" accept="application/pdf,.pdf" hidden disabled={!!busy} aria-label={`${label(slot)}: ${t("design.pick")}`}
                           onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
                             const base64 = await toBase64(f);
                             act(`${d.id}${slot}`, () => call(`/api/designs/${d.id}/${slot}`, { json: { base64 } })); }} />
                  </label>
                  {has && <Button kind="quiet" disabled={!!busy} onClick={() => act(`${d.id}${slot}`, () => call(`/api/designs/${d.id}/${slot}`, { json: { base64: null } }))}>{t("design.remove")}</Button>}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <div className={s.row} style={{ gap: 12 }}>
        <input className={s.input} style={{ flex: 1, minWidth: 180 }} value={name} placeholder={t("design.name")} aria-label={t("design.name")}
               onChange={(e) => setName(e.target.value)} />
        <Button icon={Icon.copies()} disabled={!name.trim() || !!busy}
                onClick={() => act("add", async () => { const got = await call<PaperDesigns>(`/api/designs`, { json: { name } }); setName(""); return got; })}>
          {t("design.add")}</Button>
      </div>
      {error && <Note tone="bad">{error}</Note>}
    </section>
  );
}
