"use client";
// The newsroom's pieces: icons, the logo, buttons and badges, the side
// panel, dialogs, toasts (with Undo), the in-app PDF viewer, and the
// context every screen shares -- the language, the day, the engine's status.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import s from "../newsroom.module.css";
import { tr, type Lang, type StringKey } from "./strings";

/* ---------- icons: one consistent set, 1.6px strokes on a 24 grid */
const P = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
export const Icon = {
  today: () => P(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  paper: () => P(<><path d="M5 4.5h11.5a2 2 0 0 1 2 2V19a1.5 1.5 0 0 1-3 0V8.5H5z" /><path d="M5 4.5V18a1.5 1.5 0 0 0 1.5 1.5h10.5" /><path d="M8 8h5M8 11h5M8 14h3" /></>),
  stories: () => P(<><path d="M5 6h14M5 10h14M5 14h9M5 18h6" /></>),
  ads: () => P(<><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 15l2.5-3 2 2 2.5-3.5L18 15" /></>),
  archive: () => P(<><rect x="4" y="4.5" width="16" height="4" rx="1" /><path d="M5.5 8.5V18a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5M10 12.5h4" /></>),
  settings: () => P(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>),
  help: () => P(<><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.5a2.4 2.4 0 0 1 4.6.8c0 1.6-2.3 2-2.3 3.4M12 16.8v.1" /></>),
  left: () => P(<path d="M14.5 6l-6 6 6 6" />),
  right: () => P(<path d="M9.5 6l6 6-6 6" />),
  close: () => P(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />),
  check: () => P(<path d="M5.5 12.5l4 4 9-9" />),
  checkCircle: () => P(<><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.8-4.9" /></>),
  alert: () => P(<><path d="M12 4.5l8.5 14.5h-17z" /><path d="M12 10v4M12 16.8v.1" /></>),
  sparkle: () => P(<><path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.3 2.3M15.2 15.2l2.3 2.3M17.5 6.5l-2.3 2.3M8.8 15.2l-2.3 2.3" /></>),
  print: () => P(<><path d="M7 9V4.5h10V9" /><rect x="4.5" y="9" width="15" height="7" rx="1.5" /><path d="M7 14h10v5.5H7z" /></>),
  publish: () => P(<><path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9" /><path d="M5 14.5v3A2 2 0 0 0 7 19.5h10a2 2 0 0 0 2-2v-3" /></>),
  globe: () => P(<><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></>),
  refresh: () => P(<><path d="M19 12a7 7 0 1 1-2.1-5" /><path d="M19 4.5v4h-4" /></>),
  download: () => P(<><path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14" /></>),
  search: () => P(<><circle cx="11" cy="11" r="6" /><path d="M15.5 15.5l4 4" /></>),
  image: () => P(<><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="M20 15l-4.5-4.5L6 19" /></>),
  external: () => P(<><path d="M14 4.5h5.5V10M19.5 4.5L11 13" /><path d="M17 13.5v4a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" /></>),
  wand: () => P(<><path d="M5 19l10-10M13.5 7.5l3 3M17 4v2M20 7h-2M18.5 9.5l1 1M14.5 5.5l-1-1" /></>),
  calendar: () => P(<><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>),
  copies: () => P(<><rect x="8" y="7.5" width="11" height="13" rx="1.5" /><path d="M5 16.5V5a1.5 1.5 0 0 1 1.5-1.5H15" /><path d="M11 12h5M11 15h5" /></>),
  papers: () => P(<><path d="M4 6.5h12v12.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19z" /><path d="M16 9.5h4V19a1.5 1.5 0 0 1-3 0" /><path d="M7 10h6M7 13h6M7 16h4" /></>),
  trash: () => P(<><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" /></>),
};

/** The mark: a folded newspaper with "ક" on its front page (the app icon, in small). */
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="nrTile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a55e0" /><stop offset="1" stopColor="#2638b0" /></linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#nrTile)" />
      <path d="M17 14h27a3 3 0 0 1 3 3v30a3 3 0 0 1-3 3H20a3 3 0 0 1-3-3z" fill="#fbfbfd" />
      <path d="M44 14h3a3 3 0 0 1 3 3v29a4 4 0 0 1-4 4h-2z" fill="#dfe3f5" />
      <text x="30.5" y="31" textAnchor="middle" fontSize="17" fontWeight="700" fill="#16161d" style={{ fontFamily: "var(--nr-gu), sans-serif" }}>ક</text>
      <path d="M21 34.5h19" stroke="#16161d" strokeWidth="1.6" />
      <path d="M21 39h8.5M21 42.5h8.5M21 46h6M31.5 39H40M31.5 42.5H40M31.5 46H37" stroke="#9aa0b8" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- small pieces */
export function Button({ kind = "secondary", big, icon, children, ...rest }:
  { kind?: "primary" | "secondary" | "quiet" | "danger"; big?: boolean; icon?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [s.btn, kind === "primary" && s.primary, kind === "quiet" && s.quiet, kind === "danger" && s.danger, big && s.big].filter(Boolean).join(" ");
  return <button type="button" className={cls} {...rest}>{icon}{children}</button>;
}
export function Badge({ tone, children, dot }: { tone?: "good" | "warn" | "bad" | "accent"; children: ReactNode; dot?: boolean }) {
  return <span className={s.badge} data-tone={tone}>{dot && <span className={s.dot} />}{children}</span>;
}
export function Note({ tone, children }: { tone?: "good" | "warn" | "bad"; children: ReactNode }) {
  return <p className={s.note} data-tone={tone} role={tone === "bad" ? "alert" : undefined}>{tone === "good" ? Icon.checkCircle() : Icon.alert()}<span>{children}</span></p>;
}
export function Skeleton({ h = 16, w = "100%" }: { h?: number; w?: number | string }) {
  return <div className={s.skeleton} style={{ height: h, width: w }} />;
}
export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className={s.empty}>{icon}<h3>{title}</h3>{children}</div>;
}
/** A calm ring for a percentage. */
export function Ring({ pct }: { pct: number }) {
  const c = 2 * Math.PI * 32;
  return (
    <svg className={s.ring} viewBox="0 0 76 76" role="img" aria-label={`${Math.round(pct)}%`}>
      <circle className={s.ringTrack} cx="38" cy="38" r="32" />
      <circle className={s.ringFill} cx="38" cy="38" r="32" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct / 100))} />
      <text className={s.ringPct} x="38" y="44" textAnchor="middle">{Math.round(pct)}%</text>
    </svg>
  );
}

/** A panel sliding in from the right (story editor, help). Esc closes it. */
export function SidePanel({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  const { t } = useApp();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <button className={s.scrim} aria-label={t("common.close")} onClick={onClose} />
      <aside className={s.panel} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.panelHead}><h2 className={s.cardTitle}>{title}</h2>
          <button className={s.iconBtn} onClick={onClose} aria-label={t("common.close")}>{Icon.close()}</button></div>
        <div className={s.panelBody}>{children}</div>
        {foot && <div className={s.panelFoot}>{foot}</div>}
      </aside>
    </>
  );
}

/** A small centred dialog (Publish). */
export function Dialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const { t } = useApp();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <button className={s.scrim} aria-label={t("common.close")} onClick={onClose} />
      <div className={s.sheetDialog} role="dialog" aria-modal="true">{children}</div>
    </>
  );
}

/** The PDF inside the app: Back, Print and Save -- never a new tab with no way back. */
export function PdfViewer({ url, title, fileName, onClose }: { url: string; title: string; fileName: string; onClose: () => void }) {
  const { t } = useApp();
  const frame = useRef<HTMLIFrameElement>(null);
  // the PDF as a local copy: the engine is another origin (its own port), and
  // only a same-origin frame may be printed from here
  const [local, setLocal] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let u = "";
    let gone = false;
    // read into memory, then made a local copy: Response.blob() keeps a big
    // file in the browser's disk store, which refuses it when the disk is
    // nearly full (the 17 MB CorelDRAW PDF on a 99%-full Mac, 26 Oct);
    // tried three times before giving up
    const get = async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await fetch(url);
          if (r.ok) return new Blob([await r.arrayBuffer()], { type: "application/pdf" });
        } catch { /* again */ }
        await new Promise((ok) => setTimeout(ok, 1000));
      }
      throw new Error("no PDF");
    };
    get().then((b) => { if (gone) return; u = URL.createObjectURL(b); setLocal(u); }).catch(() => !gone && setFailed(true));
    return () => { gone = true; if (u) URL.revokeObjectURL(u); };
  }, [url]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const save = () => {
    if (!local) return;
    // a copy on this computer, under the paper's name
    const a = document.createElement("a");
    a.href = local;
    a.download = fileName;
    a.click();
  };
  return (
    <div className={s.viewer} role="dialog" aria-modal="true" aria-label={title}>
      <div className={s.viewerBar}>
        <Button kind="quiet" icon={Icon.left()} onClick={onClose}>{t("pdf.back")}</Button>
        <strong>{title}</strong>
        <div className={s.row}>
          <Button icon={Icon.download()} onClick={save} disabled={!local}>{t("pdf.save")}</Button>
          <Button kind="primary" icon={Icon.print()} onClick={() => frame.current?.contentWindow?.print()} disabled={!local}>{t("pdf.print")}</Button>
        </div>
      </div>
      {local ? <iframe ref={frame} src={local} title={title} />
        : <div className={s.empty}>{failed ? <Note tone="bad">{t("pdf.failed")}</Note> : <Skeleton h={8} w={180} />}</div>}
    </div>
  );
}

/* ---------- toasts */
interface ToastItem { id: number; text: string; action?: { label: string; run: () => void } }

/* ---------- the shared context */
export interface AppCtx {
  lang: Lang;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  date: string;
  setDate: (d: string) => void;
  toast: (text: string, action?: ToastItem["action"]) => void;
  busy: (on: boolean) => void;
  pdf: (p: { url: string; title: string; fileName: string } | null) => void;
}
const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside the newsroom");
  return c;
};

export function AppProvider({ lang, date, setDate, children }: { lang: Lang; date: string; setDate: (d: string) => void; children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [busyCount, setBusyCount] = useState(0);
  const [pdf, setPdf] = useState<{ url: string; title: string; fileName: string } | null>(null);
  const t = useCallback((key: StringKey, vars?: Record<string, string | number>) => tr(lang, key, vars), [lang]);
  const toast = useCallback((text: string, action?: ToastItem["action"]) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { id, text, action }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), action ? 8000 : 4500);
  }, []);
  const busy = useCallback((on: boolean) => setBusyCount((n) => Math.max(0, n + (on ? 1 : -1))), []);
  return (
    <Ctx.Provider value={{ lang, t, date, setDate, toast, busy, pdf: setPdf }}>
      {busyCount > 0 && <div className={s.topLoader} />}
      {children}
      {pdf && <PdfViewer {...pdf} onClose={() => setPdf(null)} />}
      <div className={s.toasts} aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={s.toast}>
            <span>{x.text}</span>
            {x.action && <button onClick={() => { x.action!.run(); setToasts((y) => y.filter((z) => z.id !== x.id)); }}>{x.action.label}</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
