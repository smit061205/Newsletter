"use client";
// બેકઅપ / Backups: every night the paper's data is copied to a folder outside
// the app (backend/src/backup.ts); here the editor sees where and when, makes
// one now, or puts an earlier one back (the engine starts again for that).
import { useEffect, useState } from "react";
import { BACKEND, call } from "../api";
import s from "../newsroom.module.css";
import { ck } from "../ui/desktop";
import { num, shortDate } from "../ui/format";
import { Button, Dialog, Note, useApp } from "../ui/kit";

interface Backups { folder: string; last: { at: string; ok: boolean } | null; list: { name: string; at: string; bytes: number }[] }

export function BackupCard({ busy }: { busy: boolean }) {
  const { t, lang } = useApp();
  const [b, setB] = useState<Backups | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState<"" | "now" | "restore">("");
  const [error, setError] = useState("");
  useEffect(() => { call<Backups>("/api/backups").then(setB).catch((e) => setError(e.message)); }, []);
  const ask = async (json: object, what: "" | "now" = "") => {
    setError(""); setWorking(what);
    try { setB(await call<Backups>("/api/backups", { json })); } catch (e) { setError((e as Error).message); }
    setWorking("");
  };
  const choose = async () => {
    const picker = ck()?.pickFolder;
    if (!picker) return setTyped(b?.folder ?? "");
    const folder = await picker();
    if (folder) await ask({ folder }, "now");
  };
  const restore = async () => {
    setError(""); setWorking("restore");
    try {
      await call("/api/backups", { json: { restore: pick } });
      // the engine stops, the app starts it again with the backup in place
      await new Promise((r) => setTimeout(r, 2000));
      for (let i = 0; i < 90; i++) {
        if (await fetch(`${BACKEND}/healthz`).then((r) => r.ok).catch(() => false)) return location.reload();
        await new Promise((r) => setTimeout(r, 1000));
      }
      setError(t("backup.restart"));
    } catch (e) { setError((e as Error).message); }
    setWorking(""); setAsking(false);
  };
  const when = (iso: string) => num(lang, new Date(iso).toLocaleString(lang === "gu" ? "gu-IN" : "en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
  const chosen = pick || b?.list[0]?.name || "";

  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{t("backup.title")}</h2>
      <p className={s.muted}>{t("backup.body")}</p>
      {b && (b.folder ? <p className={s.faint} style={{ wordBreak: "break-all" }}>{t("backup.folder", { folder: b.folder })}</p>
                      : <Note tone="warn">{t("backup.none")}</Note>)}
      {b?.last && (b.last.ok ? <Note tone="good">{t("backup.last", { when: when(b.last.at) })}</Note>
                             : <Note tone="bad">{t("backup.failed", { when: when(b.last.at) })}</Note>)}
      {typed !== null ? (
        <form className={s.row} onSubmit={(e) => { e.preventDefault(); ask({ folder: typed }, "now").then(() => setTyped(null)); }}>
          <input className={s.input} style={{ flex: 1, minWidth: 200 }} value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t("backup.change")} />
          <Button kind="primary" type="submit">{t("settings.save")}</Button>
        </form>
      ) : (
        <div className={s.row}>
          <Button onClick={choose} disabled={!!working}>{t("backup.change")}</Button>
          {b?.folder && <Button onClick={() => ask({ now: true }, "now")} disabled={!!working}>{working === "now" ? t("backup.working") : t("backup.now")}</Button>}
        </div>
      )}
      {b && b.list.length > 0 && (
        <div className={s.row}>
          <select className={s.input} value={chosen} onChange={(e) => setPick(e.target.value)} aria-label={t("backup.which")} style={{ maxWidth: 200 }}>
            {b.list.map((x) => <option key={x.name} value={x.name}>{shortDate(lang, x.name)}</option>)}
          </select>
          <Button onClick={() => { setPick(chosen); setAsking(true); }} disabled={busy || !!working}>{t("backup.restore")}</Button>
        </div>
      )}
      {busy && b && b.list.length > 0 && <p className={s.faint}>{t("backup.busy")}</p>}
      {error && <Note tone="bad">{error}</Note>}
      {asking && (
        <Dialog onClose={() => working !== "restore" && setAsking(false)}>
          <h2 className={s.cardTitle}>{t("backup.ask", { date: shortDate(lang, chosen) })}</h2>
          <p className={s.muted}>{t("backup.askBody")}</p>
          {error && <Note tone="bad">{error}</Note>}
          <div className={s.row} style={{ justifyContent: "flex-end" }}>
            <Button kind="quiet" onClick={() => setAsking(false)} disabled={working === "restore"}>{t("edit.cancel")}</Button>
            <Button kind="primary" onClick={restore} disabled={working === "restore"}>
              {working === "restore" ? t("backup.restoring") : t("backup.restoreGo")}</Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

/** The space the paper's data takes, and old files cleared now (backend/src/tidy.ts; once a day by itself). */
export function SpaceCard({ busy }: { busy: boolean }) {
  const { t, lang, toast } = useApp();
  const [x, setX] = useState<{ bytes: number; freed?: number } | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => { call<{ bytes: number }>("/api/space").then(setX).catch(() => {}); }, []);
  const gb = (b: number) => num(lang, b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
  if (!x?.bytes) return null;
  return (
    <section className={s.card}>
      <h2 className={s.cardTitle}>{t("space.title")}</h2>
      <p className={s.muted}>{t("space.body", { size: gb(x.bytes) })}</p>
      <div><Button disabled={working || busy} onClick={async () => {
        setWorking(true);
        try { const r = await call<{ bytes: number; freed: number }>("/api/space", { json: {} }); setX(r); toast(t("space.freed", { size: gb(r.freed) })); }
        catch { /* shown as it was */ }
        setWorking(false);
      }}>{working ? t("space.working") : t("space.go")}</Button></div>
    </section>
  );
}
