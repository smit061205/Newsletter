"use client";
// The story editor, in a panel beside whatever the editor is looking at:
// headline, sub-heading, text, photo and importance, the front page's full
// width, the original release alongside. Save rebuilds the pages; Leave out
// happens at once, with Undo.
import { useEffect, useState } from "react";
import { call, media, type ReleaseRow, type StoryRow } from "../api";
import s from "../newsroom.module.css";
import { num } from "./format";
import { Badge, Button, Icon, Note, SidePanel, useApp } from "./kit";
import type { StringKey } from "./strings";

type Draft = { kicker: string; headline: string; deck: string; body: string; caption: string; priority: number; photo: string | null; fullWidth: boolean };
const draftOf = (x: StoryRow): Draft => ({ kicker: x.kicker, headline: x.headline, deck: x.deck, body: x.bodies.long, caption: x.caption,
                                          priority: x.priority, photo: x.photo, fullWidth: !!x.fullWidth });
const RANKS: StringKey[] = ["edit.rank1", "edit.rank2", "edit.rank3", "edit.rank4", "edit.rank5"];

/** Send one change to a story (the pages are laid out again). */
export async function editStory(date: string, storyId: string, change: Record<string, unknown>) {
  await call(`/api/issues/${date}/edits`, { json: { storyId, change } });
}

export function StoryPanel({ story, onClose, onChanged }: { story: StoryRow; onClose: () => void; onChanged: () => void }) {
  const { t, lang, date, toast } = useApp();
  const [draft, setDraft] = useState<Draft>(draftOf(story));
  const [originals, setOriginals] = useState<ReleaseRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(draftOf(story)); }, [story]);
  useEffect(() => {
    call<ReleaseRow[]>(`/api/releases?date=${date}`)
      .then((rs) => setOriginals(rs.filter((r) => r.id === story.releaseId || story.mergedFrom?.includes(r.id)))).catch(() => {});
  }, [date, story]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    const was = draftOf(story);
    const change = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v !== was[k as keyof Draft]));
    if (!Object.keys(change).length) return toast(t("edit.nothing"));
    if ("body" in change) change.body = draft.body;
    setSaving(true);
    try {
      await editStory(date, story.id, change);
      toast(t("toast.saved"));
      onChanged();
      onClose();
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  };
  const leaveOut = async () => {
    try {
      await editStory(date, story.id, { drop: !story.dropped });
      onChanged();
      onClose();
      if (!story.dropped) {
        toast(t("toast.out", { headline: story.headline.slice(0, 40) }), {
          label: t("toast.undo"),
          run: () => editStory(date, story.id, { drop: false }).then(() => { toast(t("toast.back")); onChanged(); }),
        });
      } else toast(t("toast.back"));
    } catch (e) { setError((e as Error).message); }
  };
  const photos = [...new Set([...(story.photos ?? []), ...originals.flatMap((o) => o.photos)])];
  const nums = story.factCheck?.split(": ").slice(1).join(": ");

  return (
    <SidePanel title={t("edit.title")} onClose={onClose} foot={
      <>
        <Button kind="danger" onClick={leaveOut}>{story.dropped ? t("edit.putBack") : t("edit.leaveOut")}</Button>
        <div className={s.row}>
          <Button kind="quiet" onClick={onClose}>{t("edit.cancel")}</Button>
          <Button kind="primary" onClick={save} disabled={saving} icon={Icon.check()}>{t("edit.save")}</Button>
        </div>
      </>
    }>
      <div className={s.row}>
        {story.page ? <Badge tone="good">{t("badge.page", { n: num(lang, story.page) })}</Badge> : story.dropped ? <Badge tone="bad">{t("badge.out")}</Badge> : <Badge>{t("badge.notPlaced")}</Badge>}
        {story.translatedFrom && <Badge tone="accent">{t("badge.hindi")}</Badge>}
        {(story.mergedFrom?.length ?? 0) > 1 && <Badge tone="accent">{t("badge.roundup", { n: num(lang, story.mergedFrom!.length) })}</Badge>}
      </div>
      {nums && <Note tone="warn">{t("edit.numbers", { nums: num(lang, nums) })}</Note>}
      {error && <Note tone="bad">{error}</Note>}

      <label className={s.field}><span className={s.label}>{t("edit.kicker")}</span>
        <input className={s.input} value={draft.kicker} onChange={(e) => set("kicker", e.target.value)} /></label>
      <label className={s.field}><span className={s.label}>{t("edit.headline")}</span>
        <textarea className={`${s.textarea} ${s.headlineInput}`} rows={2} value={draft.headline} onChange={(e) => set("headline", e.target.value)} /></label>
      <label className={s.field}><span className={s.label}>{t("edit.deck")}</span>
        <textarea className={s.textarea} rows={2} value={draft.deck} onChange={(e) => set("deck", e.target.value)} /></label>
      <label className={s.field}><span className={s.label}>{t("edit.body")}</span>
        <textarea className={s.textarea} rows={12} value={draft.body} onChange={(e) => set("body", e.target.value)} />
        <span className={s.hint}>{t("edit.bodyHint")}</span></label>

      <div className={s.field}><span className={s.label}>{t("edit.importance")}</span>
        <div className={s.segmented} role="group" aria-label={t("edit.importance")}>
          {RANKS.map((k, i) => <button key={k} aria-pressed={draft.priority === i + 1} onClick={() => set("priority", i + 1)}>{t(k)}</button>)}
        </div></div>

      {photos.length > 0 && (
        <div className={s.field}><span className={s.label}>{t("edit.photo")}</span>
          <div className={s.photoPick}>
            <button aria-pressed={draft.photo === null} onClick={() => set("photo", null)}>{t("edit.noPhoto")}</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photos.map((p) => <button key={p} aria-pressed={draft.photo === p} onClick={() => set("photo", p)}><img src={media(p)} alt="" /></button>)}
          </div>
          {draft.photo && <input className={s.input} placeholder={t("edit.caption")} value={draft.caption} onChange={(e) => set("caption", e.target.value)} />}
        </div>
      )}

      <label className={s.switch}><input type="checkbox" checked={draft.fullWidth} onChange={(e) => set("fullWidth", e.target.checked)} />
        <span>{t("edit.fullWidth")}</span></label>

      {originals.length > 0 && (
        <details className={s.details} open={!!nums || !!story.translatedFrom}>
          <summary>{story.translatedFrom ? t("edit.originalHindi") : t("edit.original")}</summary>
          {originals.map((o) => (
            <div key={o.id} className={s.field} style={{ marginTop: 10 }}>
              <strong lang={o.lang}>{o.headline}</strong>
              <p className={s.original} lang={o.lang}>{o.body}</p>
              <a href={o.url} target="_blank" rel="noreferrer">{t("sources.open")} ↗</a>
            </div>
          ))}
        </details>
      )}
    </SidePanel>
  );
}
