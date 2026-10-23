"use client";
// છાપાં / Papers: first, the sister papers -- the day's paper under other
// names, in Gujarati, Hindi and Urdu, each laid out its own way with its
// masthead, page headers and footer left empty (editorial/copies.ts): make
// them, open them, rename them. Then the papers this newsroom makes -- which one it's working on
// (switch to another; the app starts its engine again for it), a test issue
// of any other -- and "Add a newspaper": upload the paper's PDF issues, the
// engine drafts its profile (page, grid, type, language, the header bands),
// check it, add its fonts and header images, save, and make a test issue.
import { Fragment, useCallback, useEffect, useState } from "react";
import { call, media, type CopiesRun, type Edition, type Settings } from "../api";
import { TopBar, useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { ck } from "../ui/desktop";
import { num, rupees, shortDate } from "../ui/format";
import { Badge, Button, Icon, Note, useApp } from "../ui/kit";
import type { StringKey } from "../ui/strings";

interface Field { kind: string; x: number; baseline: number; size: number; text: string }
interface Band { top: number; footerTop: number | null; fields: Field[] }
interface Draft {
  page: { width: number; height: number }; grid: { left: number; columns: number; column: number; gutter: number };
  body: { font: string; size: number; pitch: number }; headline: { font: string; capByColumns: number[]; min: number };
  fonts: { name: string; chars: number; sizes: number[]; roles: string[] }[];
  language: { script: string; lang: string; direction: string; encoding: string; readable: boolean };
  bands: { first: Band; inner: Band | null; last: Band | null }; pages: number; notes: string[];
}
interface Paper { id: string; name: string; lang: string; pages: number; own: boolean; test: boolean; testing: boolean; hidden?: boolean;
  issue: { date: string; version: number; ready?: boolean } | null }

const b64 = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = () => bad(new Error(`couldn't read ${f.name}`));
  r.readAsDataURL(f);
});
/** A plain masthead image from the paper's name, when it has no art to upload. */
function plainMasthead(name: string, page: Draft["page"], heightPt: number, big: boolean): string {
  const px = 300 / 72;
  const c = document.createElement("canvas");
  c.width = Math.round(page.width * px);
  c.height = Math.max(40, Math.round(heightPt * px));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#1d1a29"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `700 ${Math.round(c.height * (big ? 0.55 : 0.5))}px serif`;
  g.fillText(name, c.width / 2, c.height * (big ? 0.42 : 0.5), c.width * 0.9);
  g.fillRect(c.width * 0.02, c.height - 8, c.width * 0.96, 4);
  return c.toDataURL("image/png").split(",")[1];
}
const LANG_NAMES: Record<string, [string, string]> = { gu: ["ગુજરાતી", "Gujarati"], hi: ["હિન્દી", "Hindi"], en: ["અંગ્રેજી", "English"], ur: ["ઉર્દૂ", "Urdu"] };
const cell = (v: number) => (Math.round(v * 100) / 100).toString();
const cm = (pt: number) => cell((pt / 72) * 2.54);

/** A file input that shows the chosen file's name. */
function FilePick({ label, hint, accept, multiple, onFiles, chosen }:
  { label: string; hint?: string; accept: string; multiple?: boolean; onFiles: (f: File[]) => void; chosen: string }) {
  const { t } = useApp();
  return (
    <label className={s.field} style={{ flex: "1 1 220px" }}>
      <span className={s.label}>{label}{hint && <span className={s.hint}> · {hint}</span>}</span>
      <span className={s.filePick}>
        {Icon.download()}<span>{chosen || t("papers.choose")}</span>
        <input type="file" accept={accept} multiple={multiple} onChange={(e) => onFiles([...(e.target.files ?? [])])} />
      </span>
    </label>
  );
}

export default function Papers() {
  const { t, lang, toast, pdf } = useApp();
  const { status } = useStatus();
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [samples, setSamples] = useState(false);
  const [pdfs, setPdfs] = useState<File[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [issueNumber, setIssueNumber] = useState(1);
  const [pages, setPages] = useState(4);
  const [scale, setScale] = useState(1);
  const [fonts, setFonts] = useState<Record<string, File | null>>({ body: null, headline: null, deck: null, caption: null });
  const [art, setArt] = useState<Record<string, File | null>>({ first: null, inner: null, last: null, footer: null });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [log, setLog] = useState<{ id: string; lines: string[] } | null>(null);
  const desktop = !!ck()?.switchPaper;

  const load = useCallback(() => { call<Paper[]>("/api/papers").then(setPapers).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  // a test issue being made: its log, until it's done
  const testing = papers?.find((p) => p.testing)?.id ?? (busy.startsWith("test:") ? busy.slice(5) : "");
  useEffect(() => {
    if (!testing) return;
    const tick = setInterval(() => call<{ log: string[]; running: boolean }>(`/api/papers/${testing}`).then((x) => {
      setLog({ id: testing, lines: x.log });
      if (!x.running) { setBusy(""); load(); }
    }).catch(() => {}), 3000);
    return () => clearInterval(tick);
  }, [testing, load]);

  const read = async () => {
    setError(""); setBusy("read"); setDraft(null);
    try {
      const d = await call<Draft>("/api/papers/draft", { json: { pdfs: await Promise.all(pdfs.map(b64)) } });
      setDraft(d);
      setPages(d.pages || 4);
      setScale(d.language.encoding === "bharati" ? 0.8 : 1);
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  };
  const save = async () => {
    if (!draft) return;
    setError(""); setBusy("save");
    try {
      const f: Record<string, { name: string; base64: string }> = {};
      for (const [k, file] of Object.entries(fonts)) if (file) f[k] = { name: file.name, base64: await b64(file) };
      const a: Record<string, string> = {};
      for (const [k, file] of Object.entries(art)) if (file) a[k] = await b64(file);
      if (!a.first) a.first = plainMasthead(name, draft.page, draft.bands.first.top, true);
      if (!a.inner && draft.bands.inner) a.inner = plainMasthead(name, draft.page, draft.bands.inner.top, false);
      await call("/api/papers", { json: { id, name, issueNumber, issueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
                                          pages, draft, fonts: f, art: a, sizeScale: scale } });
      setSaved(id);
      toast(t("papers.saved"));
      load();
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  };
  const makeTest = async (pid: string) => {
    setError(""); setLog({ id: pid, lines: [] }); setBusy(`test:${pid}`);
    try { await call(`/api/papers/${pid}/test`, { json: {} }); load(); } catch (e) { setError((e as Error).message); setBusy(""); }
  };
  const switchTo = async (pid: string) => {
    setError(""); setBusy(`switch:${pid}`);
    try {
      await ck()!.switchPaper!(pid);
      // the engine is back, working on that paper: start over from Today
      window.location.href = "/newsroom";
    } catch (e) { setError((e as Error).message); setBusy(""); }
  };
  const langName = (l: string) => (LANG_NAMES[l] ?? [l, l])[lang === "gu" ? 0 : 1];
  const shown = (papers ?? []).filter((p) => !p.hidden && (samples || !p.test || p.own));

  return (
    <div className={s.inner}>
      <TopBar title={t("papers.title")} />
      <Editions />
      {error && <Note tone="bad">{error}</Note>}
      <section className={s.card}>
        <h2 className={s.cardTitle}>{t("papers.own")}</h2>
        <p className={s.muted} style={{ margin: 0 }}>{t("papers.body")}</p>
        <div className={s.list}>
          {shown.map((p) => (
            <div key={p.id} className={s.paperRow}>
              <div className={s.field} style={{ gap: 2 }}>
                <span className={s.listTitle}>{p.name}</span>
                <span className={s.listMeta}>{langName(p.lang)} · {t("papers.pagesLang", { pages: num(lang, p.pages) })}
                  {p.issue ? ` · ${t("papers.lastIssue", { date: shortDate(lang, p.issue.date) })}` : ""}</span>
              </div>
              <span className={s.listBadges}>
                {p.own && <Badge tone="accent" dot>{t("papers.active")}</Badge>}
                {p.test && <Badge>{t("papers.sample")}</Badge>}
                {p.issue && !p.own && <Badge tone={p.issue.ready ? "good" : "warn"}>{p.issue.ready ? t("archive.ready") : t("archive.look")}</Badge>}
                {!p.own && p.issue && (
                  <Button kind="quiet" icon={Icon.print()} onClick={() => pdf({ url: media(`/api/papers/${p.id}/pdf`), title: p.name, fileName: `${p.name} - ${p.issue!.date}.pdf` })}>PDF</Button>
                )}
                {!p.own && <Button onClick={() => makeTest(p.id)} disabled={!!testing}>{testing === p.id ? t("papers.testing") : t("papers.test")}</Button>}
                {!p.own && desktop && (
                  <Button kind="primary" onClick={() => switchTo(p.id)} disabled={!!busy || !!testing || !!status?.running}>
                    {busy === `switch:${p.id}` ? t("papers.switching") : t("papers.switch")}</Button>
                )}
              </span>
            </div>
          ))}
        </div>
        <label className={s.switch}><input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} /><span>{t("papers.showSamples")}</span></label>
        <p className={s.faint} style={{ margin: 0 }}>{desktop ? t("papers.switchNote") : t("papers.switchApp")}</p>
        {log && (
          <details className={s.details} open={!!testing}>
            <summary>{papers?.find((p) => p.id === log.id)?.name ?? log.id} · {testing ? t("papers.testing") : t("today.details")}</summary>
            <div className={s.logBox}>{log.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
          </details>
        )}
      </section>

      <section className={s.card}>
        <h2 className={s.cardTitle}>{t("papers.add")}</h2>
        <ol className={s.howto}>
          <li>{t("papers.add.1")}</li>
          <li>{t("papers.add.2")}</li>
          <li>{t("papers.add.3")}</li>
        </ol>
        <div className={s.row} style={{ alignItems: "flex-end" }}>
          <FilePick label={t("papers.pdfs")} accept="application/pdf" multiple onFiles={setPdfs}
                    chosen={pdfs.length ? t("papers.pdfsChosen", { n: num(lang, pdfs.length) }) : ""} />
          <Button kind="primary" onClick={read} disabled={!pdfs.length || busy === "read"}>{busy === "read" ? t("papers.reading") : t("papers.read")}</Button>
        </div>
      </section>

      {draft && (
        <>
          <section className={s.card}>
            <h2 className={s.cardTitle}>{t("papers.found")}</h2>
            {draft.notes.map((n) => <Note key={n} tone="warn">{n}</Note>)}
            <dl className={s.facts}>
              <dt>{t("papers.d.page")}</dt><dd>{cm(draft.page.width)} × {cm(draft.page.height)} cm · {t("papers.pagesLang", { pages: num(lang, draft.pages) })}</dd>
              <dt>{t("papers.d.columns")}</dt><dd>{num(lang, draft.grid.columns)} × {cm(draft.grid.column)} cm</dd>
              <dt>{t("papers.d.body")}</dt><dd>{draft.body.font}, {cell(draft.body.size)} pt</dd>
              <dt>{t("papers.d.headlines")}</dt><dd>{draft.headline.font}</dd>
              <dt>{t("papers.d.lang")}</dt><dd>{langName(draft.language.lang || "?")}</dd>
              {(["first", "inner", "last"] as const).map((k) => draft.bands[k] && (
                <Fragment key={k}><dt>{t(`papers.d.${k}` as StringKey)}</dt>
                  <dd>{draft.bands[k]!.fields.map((f) => f.text).filter(Boolean).join(" · ") || "—"}</dd></Fragment>
              ))}
              <dt>{t("papers.d.fonts")}</dt><dd>{draft.fonts.slice(0, 6).map((f) => f.name).join(" · ")}</dd>
            </dl>
          </section>
          <section className={s.card}>
            <h2 className={s.cardTitle}>{t("papers.details")}</h2>
            <div className={s.row}>
              <label className={s.field} style={{ flex: "2 1 240px" }}><span className={s.label}>{t("papers.name")}</span>
                <input className={s.input} value={name} onChange={(e) => { setName(e.target.value); if (!saved) setId(e.target.value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)); }} /></label>
              <label className={s.field} style={{ flex: "1 1 180px" }}><span className={s.label}>{t("papers.id")}</span>
                <input className={s.input} value={id} onChange={(e) => setId(e.target.value.toLowerCase())} /></label>
            </div>
            <div className={s.row}>
              <label className={s.field} style={{ flex: 1 }}><span className={s.label}>{t("papers.issueNo")}</span>
                <input className={s.input} type="number" min={1} value={issueNumber} onChange={(e) => setIssueNumber(Number(e.target.value))} /></label>
              <label className={s.field} style={{ flex: 1 }}><span className={s.label}>{t("papers.pages")}</span>
                <input className={s.input} type="number" min={1} max={32} value={pages} onChange={(e) => setPages(Number(e.target.value))} /></label>
              <label className={s.field} style={{ flex: 1 }}><span className={s.label}>{t("papers.scale")}</span>
                <input className={s.input} type="number" min={0.5} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
            </div>
            <div className={s.row}>
              {(["body", "headline", "deck", "caption"] as const).map((k) => (
                <FilePick key={k} label={t(`papers.font.${k}` as StringKey)} hint=".ttf / .otf" accept=".ttf,.otf"
                          onFiles={(f) => setFonts({ ...fonts, [k]: f[0] ?? null })} chosen={fonts[k]?.name ?? ""} />
              ))}
            </div>
            <div className={s.row}>
              {(["first", "inner", "last", "footer"] as const).map((k) => (
                <FilePick key={k} label={t(`papers.art.${k}` as StringKey)} hint={t("papers.art.hint")} accept="image/png"
                          onFiles={(f) => setArt({ ...art, [k]: f[0] ?? null })} chosen={art[k]?.name ?? ""} />
              ))}
            </div>
            <p className={s.faint} style={{ margin: 0 }}>{t("papers.art.note")}</p>
            <div className={s.row}>
              <Button kind="primary" icon={Icon.check()} onClick={save} disabled={!name || !id || !fonts.body || !fonts.headline || busy === "save"}>
                {busy === "save" ? t("papers.saving") : t("papers.save")}</Button>
              {saved === id && <Button onClick={() => makeTest(id)} disabled={!!testing}>{t("papers.test")}</Button>}
            </div>
            {saved === id && <Note tone="good">{t("papers.saved")}</Note>}
          </section>
        </>
      )}
    </div>
  );
}

/** The day's sister papers: each one's name (renamed here), its language,
 * whether it's made, and its PDF; make them all, or one again. */
function Editions() {
  const { t, lang, date, toast, pdf } = useApp();
  const { status } = useStatus();
  const [data, setData] = useState<{ editions: Edition[]; run: CopiesRun | null } | null>(null);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const has = !!status?.issue;
  const load = useCallback(() => {
    call<{ editions: Edition[]; run: CopiesRun | null }>(`/api/issues/${date}/editions`).then(setData).catch((e) => setError(e.message));
  }, [date]);
  useEffect(() => { setData(null); setError(""); load(); }, [load]);
  useEffect(() => { call<Settings>("/api/settings").then((x) => setAuto(x.editionsAuto)).catch(() => {}); }, []);
  const running = data?.run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(load, 3000);
    return () => clearInterval(tick);
  }, [running, load]);

  const [stopping, setStopping] = useState(false);
  useEffect(() => { if (!running) setStopping(false); }, [running]);
  const stop = async () => {
    if (!window.confirm(t("stop.confirm"))) return;
    setStopping(true);
    try { await call(`/api/issues/${date}/editions/stop`, { json: {} }); load(); } catch (e) { setError((e as Error).message); setStopping(false); }
  };
  const make = async (only?: string) => {
    setError("");
    try { setData(await call(`/api/issues/${date}/editions`, { json: only ? { only } : {} })); toast(t("eds.started")); }
    catch (e) { setError((e as Error).message); }
  };
  const rename = async () => {
    if (!renaming) return;
    try {
      const x = await call<Settings>("/api/settings", { json: { editions: [{ id: renaming.id, name: renaming.name }] } });
      setData((d) => (d ? { ...d, editions: x.editions } : d));
      setRenaming(null);
      toast(t("settings.saved"));
    } catch (e) { setError((e as Error).message); }
  };
  const setAutoOn = async (on: boolean) => {
    try { setAuto((await call<Settings>("/api/settings", { json: { editionsAuto: on } })).editionsAuto); } catch (e) { setError((e as Error).message); }
  };
  const run = data?.run;
  const open = (e: Edition) => pdf({
    url: media(`/api/issues/${date}/editions/${e.id}.pdf?t=${encodeURIComponent(run?.endedAt ?? run?.done ?? "")}`),
    title: `${e.name} · ${shortDate(lang, date)}`, fileName: `${e.name} - ${date.split("-").reverse().join("-")}.pdf`,
  });

  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <div><h2 className={s.cardTitle}>{t("eds.title")}</h2><p className={s.muted} style={{ margin: "4px 0 0" }}>{t("eds.body")}</p></div>
        <Button kind="primary" icon={Icon.copies()} onClick={() => make()} disabled={!has || running || !status?.openrouterKey || !!status?.running}>
          {running ? t("eds.making", { done: num(lang, run!.done), total: num(lang, run!.count) }) : t("eds.makeAll")}</Button>
      </div>
      {!has && <Note tone="warn">{t("copies.none")}</Note>}
      {error && <Note tone="bad">{error}</Note>}
      {running && <div className={s.row} style={{ justifyContent: "flex-end" }}>
        <Button kind="danger" onClick={stop} disabled={stopping}>{stopping ? t("stop.stopping") : t("stop.papers")}</Button></div>}
      {run?.status === "stopped" && <Note tone="warn">{t("stop.done")}</Note>}
      {run?.status === "failed" && <Note tone="bad">{t("copies.failed", { error: run.error ?? "" })}</Note>}
      <div className={s.list}>
        {(data?.editions ?? []).map((e) => {
          const f = run?.files.find((x) => x.id === e.id);
          return (
            <div key={e.id} className={s.paperRow}>
              <div className={s.field} style={{ gap: 2 }}>
                {renaming?.id === e.id ? (
                  <form className={s.row} onSubmit={(ev) => { ev.preventDefault(); rename(); }}>
                    <input className={s.input} autoFocus value={renaming.name} maxLength={60} onChange={(ev) => setRenaming({ id: e.id, name: ev.target.value })} aria-label={t("papers.name")} />
                    <Button kind="primary" type="submit" disabled={!renaming.name.trim()}>{t("settings.save")}</Button>
                    <Button kind="quiet" onClick={() => setRenaming(null)}>{t("edit.cancel")}</Button>
                  </form>
                ) : <span className={s.listTitle}>{e.name}</span>}
                <span className={s.listMeta}>{t(`lang.${e.lang}` as StringKey)}{e.lang !== "gu" ? ` · ${t("copies.translatedShort")}` : ""}</span>
              </div>
              <span className={s.listBadges}>
                {f ? <Badge tone={f.ready ? "good" : "warn"} dot>{f.ready ? t("archive.ready") : t("archive.look")}</Badge>
                  : running ? <Badge>{t("eds.waiting")}</Badge> : has ? <Badge>{t("eds.notMade")}</Badge> : null}
                {renaming?.id !== e.id && <Button kind="quiet" onClick={() => setRenaming({ id: e.id, name: e.name })}>{t("eds.rename")}</Button>}
                {f && <Button icon={Icon.print()} onClick={() => open(e)}>{t("copies.open")}</Button>}
                {f && !running && <Button kind="quiet" icon={Icon.refresh()} onClick={() => make(e.id)} disabled={!!status?.running}>{t("eds.again")}</Button>}
              </span>
            </div>
          );
        })}
      </div>
      {auto !== null && <label className={s.switch}><input type="checkbox" checked={auto} onChange={(ev) => setAutoOn(ev.target.checked)} /><span>{t("eds.auto")}</span></label>}
      <div className={s.row} style={{ justifyContent: "space-between" }}>
        <span className={s.faint}>{t("eds.cost")}</span>
        {run && <span className={s.faint}>{t("copies.cost", { cost: rupees(lang, run.cost, status?.inrPerUsd ?? 88) })}</span>}
      </div>
      {run && (
        <details className={s.details}>
          <summary>{t("today.details")}</summary>
          <div className={s.logBox}>{run.log.map((l, i) => <div key={i}>{l}</div>)}</div>
        </details>
      )}
    </section>
  );
}
