"use client";
// An article's tools (DESIGN.md §3.5): WhatsApp, copy the link, text size,
// save; on a phone, a reading bar at the bottom with WhatsApp and text size.
import { useEffect, useState } from "react";
import { applySize } from "./Chrome.tsx";
import { LinkIcon, SaveIcon, TextSize, WhatsApp } from "./icons.tsx";

interface Props {
  id: string;
  url: string;
  headline: string;
  words: Record<"share" | "shareShort" | "copy" | "copied" | "save" | "saved" | "savedToast" | "unsavedToast" | "size", string>;
}

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

export default function ArticleTools({ id, url, headline, words: w }: Props) {
  const [size, setSize] = useState("1");
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => {
    setSize(read("ck-size", "1"));
    setSaved((JSON.parse(read("ck-saved", "[]")) as string[]).includes(id));
  }, [id]);
  useEffect(() => { if (!toast) return; const k = setTimeout(() => setToast(""), 2200); return () => clearTimeout(k); }, [toast]);

  const wa = `https://wa.me/?text=${encodeURIComponent(`${headline}\n${url}`)}`;
  const setTo = (v: string) => { setSize(v); write("ck-size", v); applySize(v); };
  const save = () => {
    const list = JSON.parse(read("ck-saved", "[]")) as string[];
    const on = !list.includes(id);
    write("ck-saved", JSON.stringify(on ? [id, ...list] : list.filter((x) => x !== id)));
    setSaved(on);
    setToast(on ? w.savedToast : w.unsavedToast);
  };
  const copy = () => { navigator.clipboard?.writeText(url).then(() => setToast(w.copied), () => setToast(url)); };

  return (
    <>
      <div className="tools">
        <a className="tool wa" href={wa} target="_blank" rel="noopener"><WhatsApp />{w.share}</a>
        <button type="button" className="tool" onClick={copy}><LinkIcon />{w.copy}</button>
        <span className="sizes" role="group" aria-label={w.size}>
          {["1", "2", "3"].map((n) => <button key={n} type="button" aria-pressed={size === n} onClick={() => setTo(n)}>અ</button>)}
        </span>
        <button type="button" className={`tool${saved ? " on" : ""}`} onClick={save}><SaveIcon on={saved} />{saved ? w.saved : w.save}</button>
      </div>
      <div className="readbar">
        <a className="wa" href={wa} target="_blank" rel="noopener"><WhatsApp />{w.shareShort}</a>
        <button type="button" className="ib" aria-label={w.size} onClick={() => setTo(String((Number(size) % 3) + 1))}><TextSize /></button>
        <button type="button" className="ib" aria-label={saved ? w.saved : w.save} onClick={save}><SaveIcon on={saved} /></button>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
