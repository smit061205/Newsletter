"use client";
// A leader added to the list or changed (lib/leaders.ts): the name looked up on Wikidata ("Find"), which fills in the
// Gujarati name, the birthday and a free portrait for the editor to check; or everything filled in by hand, with a
// photo from the phone (made smaller here and kept by app/api/editor/photo, as on the write page).
import { useRef, useState } from "react";
import s from "./editor.module.css";
import { W } from "./words.ts";
import { findLeaderAction, saveLeaderAction } from "./actions.ts";
import { smaller } from "./Write.tsx";
import type { Leader } from "@/lib/leaders.ts";

const TITLES = ["શ્રી", "શ્રીમતી", "સુશ્રી", "ડૉ."];
const EMPTY: Leader = { id: "", nameGu: "", nameEn: "", title: TITLES[0], post: "", born: "", email: "", portrait: "", credit: "" };
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

export default function LeaderForm({ lang, leader }: { lang: "gu" | "en"; leader?: Leader }) {
  const w = W[lang];
  const [l, setL] = useState<Leader>(leader ?? EMPTY);
  const [query, setQuery] = useState("");
  const [say, setSay] = useState<{ text: string; good: boolean } | null>(null);
  const [busy, setBusy] = useState<"" | "find" | "photo" | "save">("");
  const picker = useRef<HTMLInputElement>(null);
  const set = (x: Partial<Leader>) => setL((y) => ({ ...y, ...x }));
  const [month, day] = l.born ? l.born.split("-") : ["", ""];

  async function find() {
    if (!query.trim()) return;
    setBusy("find"); setSay(null);
    const f = await findLeaderAction(query).catch(() => null);
    setBusy("");
    if (!f) { setSay({ text: w.notFoundLeader, good: false }); return; }
    set({ nameGu: f.nameGu || l.nameGu, nameEn: f.nameEn, title: f.title, born: f.born || l.born, portrait: f.portrait || l.portrait, credit: f.portrait ? f.credit : l.credit });
    setSay({ text: `${w.foundNote}${f.about ? ` (${f.about})` : ""}${f.born ? "" : ` ${w.foundNoBday}`}`, good: true });
  }

  async function photo(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy("photo");
    try {
      const { blob, width, height } = await smaller(file);
      const res = await fetch(`/api/editor/photo?w=${width}&h=${height}`, { method: "POST", body: blob, headers: { "content-type": "image/jpeg" } });
      if (!res.ok) throw new Error(String(res.status));
      set({ portrait: ((await res.json()) as { url: string }).url, credit: "" });
    } catch { setSay({ text: w.badPhoto, good: false }); }
    setBusy("");
    if (picker.current) picker.current.value = "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    const ok = await saveLeaderAction(l).catch(() => false);
    setBusy("");
    setSay({ text: ok ? w.leaderSaved : w.leaderNotSaved, good: ok });
    if (ok && !leader) { setL(EMPTY); setQuery(""); }
  }

  return (
    <form className={s.form} onSubmit={save}>
      {!leader && <div className={s.aiBox}>
        <label>{w.findName}
          <span className={s.search}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void find(); } }} placeholder="Bhupendra Patel" />
            <button type="button" className={s.find} onClick={find} disabled={busy === "find"}>{busy === "find" ? w.finding : w.search}</button>
          </span>
          <span className={s.help}>{w.findHelp}</span>
        </label>
      </div>}
      {say && <p className={say.good ? s.done : s.stopped} role="status">{say.text}</p>}
      <label>{w.nameGu}<input className={s.select} value={l.nameGu} onChange={(e) => set({ nameGu: e.target.value })} required /></label>
      <label>{w.nameEn}<input className={s.select} value={l.nameEn} onChange={(e) => set({ nameEn: e.target.value })} lang="en" /></label>
      <label>{w.addressAs}
        <select className={s.select} value={l.title} onChange={(e) => set({ title: e.target.value })}>{TITLES.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <label>{w.post}<input className={s.select} value={l.post} onChange={(e) => set({ post: e.target.value })} placeholder={w.postHelp} /></label>
      <fieldset className={s.pick}>
        <legend>{w.birthday}</legend>
        <div className={s.pills}>
          <select className={s.select} aria-label={w.day} value={day} onChange={(e) => set({ born: `${month || "01"}-${e.target.value}` })} required>
            <option value="">{w.day}</option>{DAYS.map((d) => <option key={d} value={d}>{Number(d)}</option>)}
          </select>
          <select className={s.select} aria-label={w.month} value={month} onChange={(e) => set({ born: `${e.target.value}-${day || "01"}` })} required>
            <option value="">{w.month}</option>{w.months.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
          </select>
        </div>
      </fieldset>
      <label>{w.email}<input className={s.select} type="email" value={l.email} onChange={(e) => set({ email: e.target.value })} lang="en" /></label>
      <fieldset className={s.pick}>
        <legend>{w.portrait}</legend>
        {l.portrait
          ? <div className={s.portrait}><img src={l.portrait} alt="" />{l.credit && <span className={s.help}>{l.credit}</span>}</div>
          : <p className={s.help}>{w.noPortrait}</p>}
        <div className={s.shotActs}>
          <input ref={picker} className={s.file} type="file" accept="image/*" id={`ph-${leader?.id ?? "new"}`} onChange={(e) => photo(e.target.files)} />
          <label htmlFor={`ph-${leader?.id ?? "new"}`} className={s.small}>{busy === "photo" ? w.uploading : w.ownPhoto}</label>
          {l.portrait && <button type="button" className={s.small} onClick={() => set({ portrait: "", credit: "" })}>{w.removePortrait}</button>}
        </div>
      </fieldset>
      <div className={s.buttons}><button className={s.yes} disabled={busy === "save"}>{w.saveLeader}</button></div>
    </form>
  );
}
