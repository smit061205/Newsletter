"use client";
// સમાચાર / Stories: the day's stories (search, filter, open one to edit),
// and the press releases they came from (translate a Hindi one).
import { useCallback, useEffect, useMemo, useState } from "react";
import { call, type ReleaseRow, type StoryRow } from "../api";
import { TopBar, useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { num } from "../ui/format";
import { Badge, Button, Empty, Icon, Note, Skeleton, useApp } from "../ui/kit";
import { StoryPanel } from "../ui/StoryPanel";

type Filter = "all" | "placed" | "out";

export default function Stories() {
  const { t, lang, date, toast } = useApp();
  const { refresh } = useStatus();
  const [tab, setTab] = useState<"stories" | "sources">("stories");
  const [stories, setStories] = useState<StoryRow[] | null>(null);
  const [releases, setReleases] = useState<ReleaseRow[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<StoryRow | null>(null);
  const [openRel, setOpenRel] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try { if (new URLSearchParams(location.search).get("tab") === "sources") setTab("sources"); } catch {}
  }, []);
  const load = useCallback(() => {
    call<StoryRow[]>(`/api/stories?date=${date}`).then(setStories).catch((e) => setError(e.message));
    call<ReleaseRow[]>(`/api/releases?date=${date}`).then(setReleases).catch(() => {});
  }, [date]);
  useEffect(() => { setStories(null); setReleases(null); load(); }, [load]);

  const shown = useMemo(() => (stories ?? [])
    .filter((x) => filter === "all" || (filter === "placed" ? !!x.page && !x.dropped : x.dropped))
    .filter((x) => !q || `${x.headline} ${x.deck}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(a.dropped) - Number(b.dropped) || (a.page ?? 9) - (b.page ?? 9) || a.priority - b.priority), [stories, filter, q]);

  const translate = async (id: number) => {
    setBusy(id); setError("");
    try { await call(`/api/releases/${id}/translate`, { json: {} }); toast(t("toast.translated")); load(); }
    catch (e) { setError((e as Error).message); }
    setBusy(null);
  };

  return (
    <div className={s.inner}>
      <TopBar title={t("stories.title")} />
      <div className={s.row} style={{ justifyContent: "space-between" }}>
        <div className={s.segmented} role="tablist">
          <button role="tab" aria-pressed={tab === "stories"} onClick={() => setTab("stories")}>{t("stories.tab.stories")}</button>
          <button role="tab" aria-pressed={tab === "sources"} onClick={() => setTab("sources")}>{t("stories.tab.sources")}</button>
        </div>
        {tab === "stories" && (
          <div className={s.row}>
            <div className={s.segmented}>
              {(["all", "placed", "out"] as Filter[]).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`stories.filter.${f}`)}</button>)}
            </div>
            <input className={s.input} style={{ width: 200 }} placeholder={t("stories.search")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("stories.search")} />
          </div>
        )}
      </div>
      {error && <Note tone="bad">{error}</Note>}

      {tab === "stories" ? (
        <section className={s.card}>
          {!stories ? <>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={44} />)}</>
            : !shown.length ? <Empty icon={Icon.stories()} title={t("stories.none")} />
            : (
              <div className={s.list}>
                {shown.map((x) => (
                  <button key={x.id} className={s.listItem} data-dim={x.dropped} onClick={() => setEditing(x)}>
                    <span className={s.listTitle}>{x.headline}</span>
                    <span className={s.listMeta}>{x.deck}</span>
                    <span className={s.listBadges}>
                      {x.dropped ? <Badge tone="bad">{t("badge.out")}</Badge> : x.page ? <Badge tone="good">{t("badge.page", { n: num(lang, x.page) })}</Badge> : <Badge>{t("badge.notPlaced")}</Badge>}
                      {x.translatedFrom && <Badge tone="accent">{t(x.translatedFrom === "en" ? "badge.english" : "badge.hindi")}</Badge>}
                      {(x.mergedFrom?.length ?? 0) > 1 && <Badge tone="accent">{t("badge.roundup", { n: num(lang, x.mergedFrom!.length) })}</Badge>}
                      {x.id.startsWith("f-") && <Badge>{t("badge.feature")}</Badge>}
                      {x.factCheck && <Badge tone="warn">{t("badge.numbers")}</Badge>}
                      {x.edited && <Badge>{t("badge.edited")}</Badge>}
                    </span>
                  </button>
                ))}
              </div>
            )}
        </section>
      ) : (
        <Sources releases={releases} open={openRel} setOpen={setOpenRel} busy={busy} translate={translate} />
      )}
      {editing && <StoryPanel story={editing} onClose={() => setEditing(null)} onChanged={() => { load(); refresh(); }} />}
    </div>
  );
}

function Sources({ releases, open, setOpen, busy, translate }: { releases: ReleaseRow[] | null; open: number | null; setOpen: (n: number | null) => void;
  busy: number | null; translate: (id: number) => void }) {
  const { t } = useApp();
  if (!releases) return <section className={s.card}>{[0, 1, 2].map((i) => <Skeleton key={i} h={44} />)}</section>;
  if (!releases.length) return <section className={s.card}><Empty icon={Icon.stories()} title={t("sources.none")} /></section>;
  const groups: [string, (r: ReleaseRow) => boolean][] = [
    [t("sources.gu"), (r) => r.lang !== "hi"],
    [t("sources.hiUsed"), (r) => r.lang === "hi" && r.translated],
    [t("sources.hiUnused"), (r) => r.lang === "hi" && !r.translated],
  ];
  return (
    <>
      {groups.map(([title, test]) => {
        const list = releases.filter(test);
        if (!list.length) return null;
        return (
          <section key={title} className={s.card}>
            <div className={s.cardHead}><h2 className={s.cardTitle}>{title}</h2><span className={s.faint}>{list.length}</span></div>
            <div className={s.list}>
              {list.map((r) => (
                <div key={r.id}>
                  <button className={s.listItem} onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                    <span className={s.listTitle} lang={r.lang}>{r.headline}</span>
                    <span className={s.listMeta}>{r.ministry}</span>
                    <span className={s.listBadges}>{r.inPaper && <Badge tone="good">{t("sources.inPaper")}</Badge>}</span>
                  </button>
                  {open === r.id && (
                    <div className={s.expand}>
                      <p className={s.original} lang={r.lang}>{r.body}</p>
                      <div className={s.row}>
                        <a className={s.btn} href={r.url} target="_blank" rel="noreferrer">{Icon.external()}{t("sources.open")}</a>
                        {r.lang === "hi" && !r.translated && (
                          <Button kind="primary" onClick={() => translate(r.id)} disabled={busy === r.id}>{busy === r.id ? t("sources.translating") : t("sources.translate")}</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
