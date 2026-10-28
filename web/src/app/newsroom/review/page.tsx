"use client";
// જોવા જેવી બાબતો / Review: only what needs a look, one at a time --
// "Fix it" opens the story (or the page), "It's fine" moves on.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { call, type IssueInfo, type StoryRow } from "../api";
import { useStatus } from "../Shell";
import s from "../newsroom.module.css";
import { num, problems } from "../ui/format";
import { Button, Empty, Icon, Skeleton, useApp } from "../ui/kit";
import { StoryPanel } from "../ui/StoryPanel";

export default function Review() {
  const { t, lang, date } = useApp();
  const { status, refresh } = useStatus();
  const router = useRouter();
  const [info, setInfo] = useState<IssueInfo | null>(null);
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [i, setI] = useState(0);
  const [editing, setEditing] = useState<StoryRow | null>(null);
  const has = !!status?.issue;
  useEffect(() => {
    if (!has) return;
    call<IssueInfo>(`/api/issues/${date}`).then(setInfo).catch(() => {});
    call<StoryRow[]>(`/api/stories?date=${date}`).then(setStories).catch(() => {});
  }, [date, has]);
  const items = useMemo(() => (info ? problems(lang, info.report.gates, (id) => stories.find((x) => x.id === id)?.headline, info.report.whiteSpace) : []), [info, stories, lang]);
  const item = items[i];
  const fix = () => {
    if (!item) return;
    const st = item.story ? stories.find((x) => x.id === item.story) : undefined;
    if (st) setEditing(st);
    else router.push("/newsroom/pages");
  };

  return (
    <div className={s.inner} style={{ maxWidth: 680 }}>
      <div className={s.topbar}>
        <h1 className={s.pageTitle}>{t("review.title")}</h1>
        {items.length > 0 && i < items.length && <span className={s.faint}>{t("review.of", { i: num(lang, i + 1), n: num(lang, items.length) })}</span>}
      </div>
      <section className={`${s.card} ${s.hero}`}>
        {!info ? <Skeleton h={120} />
          : !item ? (
            <Empty icon={Icon.checkCircle()} title={t("review.done")}>
              <p>{t("review.doneBody")}</p>
              <div className={s.row}><Link className={s.btn} href="/newsroom/pages">{t("today.pages")}</Link><Link className={`${s.btn} ${s.primary}`} href="/newsroom">{t("today.publish")}</Link></div>
            </Empty>
          ) : (
            <>
              <div className={s.heroTop}><div className={s.state} data-tone="warn">{Icon.alert()}</div><p style={{ fontSize: 17 }}>{item.text}</p></div>
              <div className={s.heroActions}>
                <Button kind="primary" big onClick={fix}>{t("issue.fix")}</Button>
                <Button big onClick={() => setI(i + 1)}>{t("issue.fine")}</Button>
              </div>
            </>
          )}
      </section>
      {editing && <StoryPanel story={editing} onClose={() => setEditing(null)} onChanged={() => { refresh(); setI(i + 1); }} />}
    </div>
  );
}
