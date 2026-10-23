"use client";
// છાપું / Paper: the pages as they'll print. Thumbnails down the side, the
// page large, and any story on it opens its editor right here.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { call, media, type IssueInfo, type StoryRow } from "../api";
import { TopBar, useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { checkName, num, problems } from "../ui/format";
import { Badge, Button, Empty, Icon, Note, Skeleton, useApp } from "../ui/kit";
import { StoryPanel } from "../ui/StoryPanel";

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

export default function Paper() {
  const { t, lang, date, toast, pdf } = useApp();
  const { status, refresh } = useStatus();
  const [info, setInfo] = useState<IssueInfo | null>(null);
  const [issue, setIssue] = useState<Issue | null>(null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [n, setN] = useState(1);
  const [editing, setEditing] = useState<StoryRow | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [error, setError] = useState("");

  const has = !!status?.issue;
  const version = status?.issue?.version;
  const load = useCallback(() => {
    if (!has) return;
    call<IssueInfo>(`/api/issues/${date}`).then(setInfo).catch((e) => setError(e.message));
    call<Issue>(`/api/issue?date=${date}`).then(setIssue).catch((e) => setError(e.message));
    call<StoryRow[]>(`/api/stories?date=${date}`).then(setStories).catch(() => {});
  }, [date, has]);
  useEffect(() => { setN(1); setInfo(null); setIssue(null); }, [date]);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => setImgFailed(false), [n, version]);

  const placed = useMemo(() => new Map((info?.report.placed ?? []).map((p) => [p.story, p])), [info]);
  const page = issue?.pages.find((p) => p.number === n);
  const boxes = page ? storyBoxes(page, new Set(placed.keys())) : new Map();
  const todo = info ? problems(lang, info.report.gates, (id) => stories.find((x) => x.id === id)?.headline) : [];
  const running = !!status?.running && status.running.date === date;

  const rebuild = async () => {
    setError("");
    try { await call(`/api/issues/${date}/build`, { json: {} }); toast(t("paper.rebuilding")); refresh(); }
    catch (e) { setError((e as Error).message); }
  };
  const open = (id: string) => setEditing(stories.find((x) => x.id === id) ?? null);
  const openPdf = () => info && pdf({ url: media(`/api/issues/${date}/pdf`), title: t("pdf.title", { issue: num(lang, info.report.issueNumber) }),
                                      fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${info.report.issueNumber} - ${date.split("-").reverse().join("-")}.pdf` });

  if (!has) {
    return (
      <div className={s.inner}>
        <TopBar title={t("paper.title")} />
        <div className={s.card}><Empty icon={Icon.paper()} title={t("paper.none")}><Link className={`${s.btn} ${s.primary}`} href="/newsroom">{t("today.make")}</Link></Empty></div>
      </div>
    );
  }
  return (
    <div className={`${s.inner} ${s.wide}`}>
      <TopBar title={t("paper.title")}>
        <Button kind="quiet" icon={Icon.refresh()} onClick={rebuild} disabled={running}>{running ? t("paper.rebuilding") : t("paper.rebuild")}</Button>
        <Button icon={Icon.print()} onClick={openPdf} disabled={!info}>{t("today.print")}</Button>
        <Button icon={Icon.download()} disabled={!info} onClick={() => info && pdf({ url: media(`/api/issues/${date}/editable.pdf`),
          title: t("corel.title", { what: t("pdf.title", { issue: num(lang, info.report.issueNumber) }) }),
          fileName: `${status?.paper.name.split(" (")[0] ?? "Capital Kranti"} ${info.report.issueNumber} - ${date.split("-").reverse().join("-")} - CorelDRAW.pdf` })}>{t("corel.pdf")}</Button>
        <Link className={`${s.btn} ${s.primary}`} href="/newsroom">{Icon.publish()}{t("today.publish")}</Link>
      </TopBar>
      {error && <Note tone="bad">{error}</Note>}
      <div className={s.paperLayout}>
        <div className={s.thumbs}>
          {(issue?.pages ?? [1, 2, 3, 4].map((k) => ({ number: k }))).map((p) => (
            <button key={p.number} className={s.thumb} aria-pressed={p.number === n} onClick={() => setN(p.number)} aria-label={t("paper.page", { n: num(lang, p.number) })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {version ? <img src={media(`/api/pages/${date}/${p.number}.png?v=${version}`)} alt="" /> : <Skeleton h={120} />}
              <span>{num(lang, p.number)}</span>
            </button>
          ))}
        </div>
        <div>
          {page ? (
            <div className={s.pageView} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media(`/api/pages/${date}/${n}.png?v=${version}`)} alt={t("paper.page", { n: num(lang, n) })} onError={() => setImgFailed(true)} />
              {[...boxes].map(([id, b]) => (
                <button key={id} className={s.storyBox} title={placed.get(id)?.headline}
                        style={{ left: `${(b.x0 / page.width) * 100}%`, top: `${(b.y0 / page.height) * 100}%`,
                                 width: `${((b.x1 - b.x0) / page.width) * 100}%`, height: `${((b.y1 - b.y0) / page.height) * 100}%` }}
                        onClick={() => open(id)} aria-label={placed.get(id)?.headline} />
              ))}
            </div>
          ) : <Skeleton h={900} />}
          {imgFailed && <Note tone="bad">{t("paper.page", { n: num(lang, n) })}: {lang === "gu" ? "ચિત્ર મળ્યું નહીં — ફરી ગોઠવો." : "its picture is missing — lay out again."}</Note>}
        </div>
        <aside className={s.paperSide}>
          <div className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>{t("paper.page", { n: num(lang, n) })}</h2>
              {info && <Badge tone={todo.length ? "warn" : "good"} dot>{todo.length ? t("check.problems", { n: num(lang, todo.length) }) : t("check.ok")}</Badge>}
            </div>
            <p className={s.faint}>{t("paper.click")}</p>
            <ul className={s.onPage}>
              {[...placed.values()].filter((p) => p.page === n).map((p) => (
                <li key={p.story}><button onClick={() => open(p.story)}>{p.headline}</button></li>
              ))}
            </ul>
          </div>
          {info && todo.length > 0 && (
            <div className={s.card}>
              <ul className={s.problemList}>
                {todo.map((p, i) => <li key={i}>{Icon.alert()}<span style={{ flex: 1 }}>{p.text}</span>
                  {p.story && <Button kind="quiet" onClick={() => open(p.story!)}>{t("issue.fix")}</Button>}</li>)}
              </ul>
            </div>
          )}
          {info && (
            <details className={`${s.card} ${s.details}`}>
              <summary>{t("today.details")}</summary>
              <ul className={s.onPage}>{info.report.gates.map((g) => <li key={g.gate} className={s.faint} style={{ padding: "4px 0" }}>{g.pass ? "✓" : "!"} {checkName(lang, g.gate)}</li>)}</ul>
            </details>
          )}
        </aside>
      </div>
      {editing && <StoryPanel story={editing} onClose={() => setEditing(null)} onChanged={() => { refresh(); load(); }} />}
    </div>
  );
}
