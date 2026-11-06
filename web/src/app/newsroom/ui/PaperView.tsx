"use client";
// The pages as they'll print: thumbnails down the side, the page large, and
// any story on it opens its editor right here. On Tonight's paper under the
// day's status; the side lists the page's stories and leads to all of them.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { call, media, type IssueInfo, type StoryRow } from "../api";
import { useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { addDays, checkName, num, problems } from "./format";
import { Button, Icon, Note, Skeleton, useApp } from "./kit";
import { StoryPanel } from "./StoryPanel";

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

/** `problems`: the issue's problems listed beside the page too (where nothing above lists them).
 * `eight`: the day's 8-page paper instead, to look at (its stories are changed on the day's paper). */
export function PaperView({ problems: showProblems = false, onChanged, eight = false }: { problems?: boolean; onChanged?: () => void; eight?: boolean }) {
  const { t, lang, date } = useApp();
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
    call<Issue>(eight ? `/api/issues/${date}/pages8` : `/api/issue?date=${date}`).then(setIssue).catch((e) => setError(e.message));
    call<StoryRow[]>(`/api/stories?date=${date}`).then(setStories).catch(() => {});
  }, [date, has, eight]);
  useEffect(() => { setN(1); setInfo(null); setIssue(null); }, [date, eight]);
  const picture = (k: number) => media(eight ? `/api/issues/${date}/pages8/${k}.png?v=${version}` : `/api/pages/${date}/${k}.png?v=${version}`);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => setImgFailed(false), [n, version]);

  const placed = useMemo(() => new Map((info?.report.placed ?? []).map((p) => [p.story, p])), [info]);
  const page = issue?.pages.find((p) => p.number === n);
  const boxes = page && !eight ? storyBoxes(page, new Set(placed.keys())) : new Map();
  const todo = info && showProblems && !eight ? problems(lang, info.report.gates, (id) => stories.find((x) => x.id === id)?.headline, info.report.whiteSpace) : [];
  const open = (id: string) => setEditing(stories.find((x) => x.id === id) ?? null);
  if (!has) return null;

  return (
    <>
      {error && <Note tone="bad">{error}</Note>}
      <div className={s.paperLayout}>
        <div className={s.thumbs}>
          {(issue?.pages ?? [1, 2, 3, 4].map((k) => ({ number: k }))).map((p) => (
            <button key={p.number} className={s.thumb} aria-pressed={p.number === n} onClick={() => setN(p.number)} aria-label={t("paper.page", { n: num(lang, p.number) })}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {version ? <img src={picture(p.number)} alt="" /> : <Skeleton h={120} />}
              <span>{num(lang, p.number)}</span>
            </button>
          ))}
        </div>
        <div>
          {page ? (
            <div className={s.pageView} style={{ aspectRatio: `${page.width} / ${page.height}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picture(n)} alt={t("paper.page", { n: num(lang, n) })} onError={() => setImgFailed(true)} />
              {[...boxes].map(([id, b]) => (
                <button key={id} className={s.storyBox} title={placed.get(id)?.headline}
                        style={{ left: `${(b.x0 / page.width) * 100}%`, top: `${(b.y0 / page.height) * 100}%`,
                                 width: `${((b.x1 - b.x0) / page.width) * 100}%`, height: `${((b.y1 - b.y0) / page.height) * 100}%` }}
                        onClick={() => open(id)} aria-label={placed.get(id)?.headline} />
              ))}
            </div>
          ) : <Skeleton h={900} />}
          {/* (page pictures are cleared after 30 days: backend/src/tidy.ts) */}
          {imgFailed && <Note tone="warn">{t(date < addDays(new Date().toISOString().slice(0, 10), -30) ? "paper.noPicture" : "paper.pictureMissing")}</Note>}
        </div>
        <aside className={s.paperSide}>
          <div className={s.card}>
            <h2 className={s.cardTitle}>{t("paper.page", { n: num(lang, n) })}</h2>
            <p className={s.faint}>{t(eight ? "paper.eightLook" : "paper.click")}</p>
            {!eight && <ul className={s.onPage}>
              {[...placed.values()].filter((p) => p.page === n).map((p) => (
                <li key={p.story}><button onClick={() => open(p.story)}>{p.headline}</button></li>
              ))}
            </ul>}
            <Link className={s.btn} href="/newsroom/stories">{Icon.stories()}{t("paper.allStories")}</Link>
          </div>
          {todo.length > 0 && (
            <div className={s.card}>
              <ul className={s.problemList}>
                {todo.map((p, i) => <li key={i}>{Icon.alert()}<span style={{ flex: 1 }}>{p.text}</span>
                  {p.story && <Button kind="quiet" onClick={() => open(p.story!)}>{t("issue.fix")}</Button>}</li>)}
              </ul>
            </div>
          )}
          {info && !eight && (
            <details className={`${s.card} ${s.details}`}>
              <summary>{t("today.details")}</summary>
              <ul className={s.onPage}>{info.report.gates.map((g) => <li key={g.gate} className={s.faint} style={{ padding: "4px 0" }}>{g.pass ? "✓" : "!"} {checkName(lang, g.gate)}</li>)}</ul>
            </details>
          )}
        </aside>
      </div>
      {editing && <StoryPanel story={editing} onClose={() => setEditing(null)} onChanged={() => { refresh(); load(); onChanged?.(); }} />}
    </>
  );
}
