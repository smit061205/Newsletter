"use client";
// છાપાં / Papers: the papers this newsroom makes, and "Add a newspaper":
// upload the paper's PDF issues, the engine drafts its profile (page, grid,
// type, language, the header bands and their date / issue / page fields),
// review it, add its fonts and masthead images, save, and make a test issue.
import { Fragment, useCallback, useEffect, useState } from "react";
import { call, media } from "../api";
import styles from "../newsroom.module.css";

interface Field { kind: string; x: number; baseline: number; size: number; text: string }
interface Band { top: number; footerTop: number | null; fields: Field[] }
interface Draft {
  page: { width: number; height: number }; grid: { left: number; columns: number; column: number; gutter: number };
  body: { font: string; size: number; pitch: number }; headline: { font: string; capByColumns: number[]; min: number };
  fonts: { name: string; chars: number; sizes: number[]; roles: string[] }[];
  language: { script: string; lang: string; direction: string; encoding: string; readable: boolean };
  bands: { first: Band; inner: Band | null; last: Band | null }; pages: number; notes: string[];
}
interface Paper { id: string; name: string; lang: string; pages: number; own: boolean; test: boolean; issue: { date: string; version: number; ready?: boolean } | null }

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

export default function Papers() {
  const [papers, setPapers] = useState<Paper[]>([]);
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
  const [test, setTest] = useState<{ log: string[]; issue: { date: string; version: number; ready?: boolean } | null } | null>(null);

  const load = useCallback(() => { call<Paper[]>("/api/papers").then(setPapers).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (!saved || !busy.startsWith("test")) return;
    const t = setInterval(() => call<{ log: string[]; issue: Paper["issue"] }>(`/api/papers/${saved}`).then((x) => {
      setTest(x);
      if (x.log.some((l) => /^issue \d+ v\d+: |run for .* stopped|Error/.test(l))) { setBusy(""); load(); }
    }).catch(() => {}), 4000);
    return () => clearInterval(t);
  }, [saved, busy, load]);

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
      load();
    } catch (e) { setError((e as Error).message); }
    setBusy("");
  };
  const makeTest = async (pid: string) => {
    setError(""); setTest(null); setSaved(pid); setBusy(`test:${pid}`);
    try { await call(`/api/papers/${pid}/test`, { json: {} }); } catch (e) { setError((e as Error).message); setBusy(""); }
  };

  const cell = (v: number) => (Math.round(v * 100) / 100).toString();
  return (
    <div className={styles.inner}>
      <section className={styles.card}>
        <h2>છાપાં <small>The papers · each built from the same news, in its own look</small></h2>
        <ul className={styles.list}>
          {papers.filter((p) => !p.test).map((p) => (
            <li key={p.id} className={styles.paperRow}>
              <span className={styles.listTitle}>{p.name}</span>
              <span className={styles.listMeta}>{p.id} · {p.lang} · {p.pages} pages{p.issue ? ` · last issue ${p.issue.date} v${p.issue.version}` : ""}</span>
              <span className={styles.listBadges}>
                {p.own && <span className={styles.badge} data-tone="accent">This newsroom&apos;s paper</span>}
                {p.issue && <span className={styles.badge} data-tone={p.issue.ready ? "good" : "bad"}>{p.issue.ready ? "Ready" : "Needs a look"}</span>}
                {!p.own && <button className={styles.btn} onClick={() => makeTest(p.id)} disabled={busy.startsWith("test")}>Make a test issue</button>}
                {!p.own && p.issue && <a className={styles.btn} href={media(`/api/papers/${p.id}/pdf`)} target="_blank" rel="noreferrer">PDF</a>}
              </span>
            </li>
          ))}
        </ul>
        {test && (
          <details className={styles.details} open>
            <summary>Test issue for {saved} {busy ? "(running…)" : ""}</summary>
            <div className={styles.logBox}>{test.log.map((l, i) => <div key={i}>{l}</div>)}</div>
          </details>
        )}
      </section>

      <section className={styles.card}>
        <h2>નવું છાપું ઉમેરો <small>Add a newspaper</small></h2>
        <ol className={styles.howto}>
          <li>Upload 1 to 3 recent issues as PDF, exported from the paper&apos;s layout software (not scans).</li>
          <li>Check what the engine read: page, columns, type, language, and where the date and issue number sit.</li>
          <li>Add the paper&apos;s fonts and, if you have them, its masthead images. Save, then make a test issue.</li>
        </ol>
        <div className={styles.fields}>
          <label>PDF <small>The paper&apos;s issues</small><input type="file" accept="application/pdf" multiple onChange={(e) => setPdfs([...(e.target.files ?? [])])} /></label>
          <div className={styles.row}><button className={`${styles.btn} ${styles.primary}`} onClick={read} disabled={!pdfs.length || busy === "read"}>{busy === "read" ? "Reading…" : "છાપું વાંચો · Read the paper"}</button></div>
        </div>
        {error && <p className={styles.note} data-tone="bad" role="alert">{error}</p>}
      </section>

      {draft && (
        <>
          <section className={styles.card}>
            <h2>શું વાંચ્યું <small>What the engine read · check it</small></h2>
            {draft.notes.map((n) => <p key={n} className={styles.note} data-tone="warn">{n}</p>)}
            <dl className={styles.facts}>
              <dt>Page</dt><dd>{cell(draft.page.width)} × {cell(draft.page.height)} pt ({cell(draft.page.width / 72 * 2.54)} × {cell(draft.page.height / 72 * 2.54)} cm), {draft.pages} pages</dd>
              <dt>Columns</dt><dd>{draft.grid.columns} columns of {cell(draft.grid.column)} pt, gutter {cell(draft.grid.gutter)} pt, from {cell(draft.grid.left)} pt</dd>
              <dt>Body</dt><dd>{draft.body.font}, {cell(draft.body.size)} pt on {cell(draft.body.pitch)} pt lines</dd>
              <dt>Headlines</dt><dd>{draft.headline.font}; largest by width: {draft.headline.capByColumns.slice(1).map((c, i) => `${i + 1} col ${cell(c)}`).join(", ")} pt</dd>
              <dt>Language</dt><dd>{draft.language.lang || "?"} ({draft.language.script}, {draft.language.direction}){draft.language.encoding !== "unicode" ? `, legacy ${draft.language.encoding} fonts` : ""}</dd>
              {(["first", "inner", "last"] as const).map((k) => draft.bands[k] && (
                <Fragment key={k}><dt>{k === "first" ? "Page 1 masthead" : k === "inner" ? "Inner pages' head" : "Last page"}</dt>
                  <dd>stories from {cell(draft.bands[k]!.top)} pt{draft.bands[k]!.footerTop ? `, footer from ${cell(draft.bands[k]!.footerTop!)} pt` : ""}; fields: {draft.bands[k]!.fields.map((f) => `${f.kind} at ${cell(f.x)}, ${cell(f.baseline)} pt`).join("; ") || "none found"}</dd></Fragment>
              ))}
              <dt>Fonts in the PDF</dt><dd>{draft.fonts.slice(0, 6).map((f) => `${f.name}${f.roles.length ? ` (${f.roles.join(", ")})` : ""}`).join(" · ")}</dd>
            </dl>
          </section>
          <section className={styles.card}>
            <h2>નામ, ફોન્ટ, મથાળું <small>Name, fonts, masthead</small></h2>
            <div className={styles.fields}>
              <div className={styles.row}>
                <label>Paper&apos;s name<input value={name} onChange={(e) => { setName(e.target.value); if (!saved) setId(e.target.value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)); }} /></label>
                <label>Short id <small>a-z, 0-9, -</small><input value={id} onChange={(e) => setId(e.target.value)} /></label>
              </div>
              <div className={styles.row}>
                <label>Today&apos;s issue number<input type="number" min={1} value={issueNumber} onChange={(e) => setIssueNumber(Number(e.target.value))} /></label>
                <label>Pages<input type="number" min={1} max={32} value={pages} onChange={(e) => setPages(Number(e.target.value))} /></label>
                <label>Type size scale <small>1 = as in the PDF</small><input type="number" min={0.5} max={1.5} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
              </div>
              <div className={styles.row}>
                {(["body", "headline", "deck", "caption"] as const).map((k) => (
                  <label key={k}>{k} font <small>{k === "body" || k === "headline" ? "needed" : "optional"} (.ttf / .otf)</small>
                    <input type="file" accept=".ttf,.otf" onChange={(e) => setFonts({ ...fonts, [k]: e.target.files?.[0] ?? null })} /></label>
                ))}
              </div>
              <div className={styles.row}>
                {(["first", "inner", "last", "footer"] as const).map((k) => (
                  <label key={k}>{k === "first" ? "Masthead (page 1)" : k === "inner" ? "Inner pages' head" : k === "last" ? "Last page's head" : "Footer"} <small>PNG, page width; optional</small>
                    <input type="file" accept="image/png" onChange={(e) => setArt({ ...art, [k]: e.target.files?.[0] ?? null })} /></label>
                ))}
              </div>
              <p className={styles.muted}>No masthead image? A plain one is made from the paper&apos;s name; replace it later.</p>
              <div className={styles.row}>
                <button className={`${styles.btn} ${styles.primary}`} onClick={save} disabled={!name || !id || !fonts.body || !fonts.headline || busy === "save"}>{busy === "save" ? "Saving…" : "સાચવો · Save the paper"}</button>
                {saved === id && <button className={styles.btn} onClick={() => makeTest(id)} disabled={busy.startsWith("test")}>Make a test issue</button>}
              </div>
              {saved === id && <p className={styles.note} data-tone="good">Saved as publications/{id}. Make a test issue to see it built from today&apos;s news.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
