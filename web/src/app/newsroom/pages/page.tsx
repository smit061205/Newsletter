"use client";
// પાનાં / Pages: the issue as it will print. Click a story on a page to edit
// it; build the pages again after changes; download the PDF.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { call, gateLabel, media, type IssueInfo } from "../api";
import { useDay } from "../Shell";
import styles from "../newsroom.module.css";

interface El { articleId?: string; kind: string; x?: number; y?: number; width?: number; height?: number; x1?: number; y1?: number; x2?: number; y2?: number }
interface Issue { pages: { number: number; width: number; height: number; elements: El[] }[] }

/** Each story's box on a page, from its elements. */
function storyBoxes(page: Issue["pages"][number], ids: Set<string>) {
  const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (const e of page.elements) {
    if (!e.articleId || !ids.has(e.articleId)) continue;
    const [x0, y0, x1, y1] = e.kind === "line"
      ? [Math.min(e.x1!, e.x2!), Math.min(e.y1!, e.y2!), Math.max(e.x1!, e.x2!), Math.max(e.y1!, e.y2!)]
      : [e.x ?? 0, e.y ?? 0, (e.x ?? 0) + (e.width ?? 0), (e.y ?? 0) + (e.height ?? 0)];
    const b = boxes.get(e.articleId);
    boxes.set(e.articleId, b ? { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) } : { x0, y0, x1, y1 });
  }
  return boxes;
}

export default function Pages() {
  const { date } = useDay();
  const router = useRouter();
  const [info, setInfo] = useState<IssueInfo | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [n, setN] = useState(1);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    call<IssueInfo>(`/api/issues/${date}`).then(setInfo).catch(() => setInfo(null));
    call<Issue>(`/api/issue?date=${date}`).then(setIssue).catch(() => setIssue(null));
  }, [date]);
  useEffect(() => { setN(1); load(); }, [load]);

  const placed = useMemo(() => new Map((info?.report.placed ?? []).map((p) => [p.story, p])), [info]);
  const why = useMemo(() => new Map((info?.report.plan ?? []).map((p) => [p.id, p])), [info]);
  const page = issue?.pages.find((p) => p.number === n);
  const boxes = page ? storyBoxes(page, new Set(placed.keys())) : new Map();

  const rebuild = async () => {
    setError("");
    try {
      await call(`/api/issues/${date}/build`, { json: {} });
      setNote("Laying the pages out again. Follow it on Today; this screen shows the new pages when it's done.");
    } catch (e) { setError((e as Error).message); }
  };
  const edit = (id: string) => {
    try { sessionStorage.setItem("nr-open-story", id); } catch {}
    router.push("/newsroom/stories");
  };

  if (!info || !issue) return <p className={styles.muted}>No pages for this day yet. Run the day from <b>Today</b>.</p>;
  const failing = info.report.gates.filter((g) => !g.pass);
  return (
    <div className={styles.pagesLayout}>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>પાનું {n} <small>Page {n} of {issue.pages.length} · version {info.version}</small></h2>
          <div className={styles.actions}>
            {issue.pages.map((p) => (
              <button key={p.number} onClick={() => setN(p.number)} aria-pressed={p.number === n}>{p.number}</button>
            ))}
          </div>
        </div>
        {page && (
          <div className={styles.pageView} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={media(`/api/pages/${date}/${n}.png?v=${info.version}`)} alt={`Page ${n}`} />
            {[...boxes].map(([id, b]) => (
              <button key={id} className={styles.storyBox} title={`${placed.get(id)?.headline} -- click to edit`}
                      style={{ left: `${(b.x0 / page.width) * 100}%`, top: `${(b.y0 / page.height) * 100}%`,
                               width: `${((b.x1 - b.x0) / page.width) * 100}%`, height: `${((b.y1 - b.y0) / page.height) * 100}%` }}
                      onClick={() => edit(id)} aria-label={`Edit: ${placed.get(id)?.headline}`} />
            ))}
          </div>
        )}
      </section>
      <aside className={styles.panel}>
        <h2>તપાસ <small>Checks</small></h2>
        <p><span className={styles.pill} data-tone={info.report.ready ? "good" : "bad"}>{info.report.ready ? "Ready to print" : `${failing.length} check${failing.length === 1 ? "" : "s"} to look at`}</span></p>
        <ul className={styles.gates}>
          {failing.map((g) => <li key={g.gate} data-pass="false"><span aria-hidden>!</span>{gateLabel(g.gate)}<small>{g.detail}</small></li>)}
        </ul>
        <div className={styles.actions}>
          <button onClick={rebuild}>ફરી ગોઠવો · Build again</button>
          <a className={styles.button} href={media(`/api/issues/${date}/pdf`)} target="_blank" rel="noreferrer">PDF</a>
        </div>
        {note && <p className={styles.good}>{note}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <h3>On this page</h3>
        <ol className={styles.onPage}>
          {[...placed.values()].filter((p) => p.page === n).map((p) => (
            <li key={p.story}>
              <button className={styles.link} onClick={() => edit(p.story)}>{p.headline}</button> <small>{p.cols} col</small>
              {why.get(p.story) && <small className={styles.why}>Rank {why.get(p.story)!.rank}: {why.get(p.story)!.reason}</small>}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
