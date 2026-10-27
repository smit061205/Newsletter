"use client";
// The articles in every copy, word for word: as many as wanted, each with as
// many titles, sub-headings, texts and photos as wanted -- the copies go
// through them in turn (backend/src/editorial/copies.ts articleFor).
import type { CopyArticle } from "../api";
import { media } from "../api";
import s from "../newsroom.module.css";
import { num } from "../ui/format";
import { Button, Icon, Note, useApp } from "../ui/kit";

/** A photo: picked here, or one the last copies used. */
export type Pic = { file: File; preview: string; small?: boolean } | { url: string };
export interface Art { titles: string[]; decks: string[]; bodies: string[]; pics: Pic[] }
export const blankArt = (): Art => ({ titles: [""], decks: [""], bodies: [""], pics: [] });
/** An article the last copies printed, ready to make them again. */
export const artOf = (a: CopyArticle): Art => ({
  titles: a.titles.length ? a.titles : [""], decks: a.decks.length ? a.decks : [""],
  bodies: a.bodies.length ? a.bodies : [""], pics: a.photos.map((url) => ({ url })),
});
const filled = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
/** How many different ways the copies can print article `a`. */
export const mixesOf = (a: Art) => [filled(a.titles).length, filled(a.decks).length, filled(a.bodies).length, a.pics.length]
  .reduce((p, k) => p * Math.max(1, k), 1);

/** Narrower than this a photo prints soft across two columns (200 ppi). */
const SHARP_WIDTH = 720;
const widthOf = (src: string) => new Promise<number>((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth); i.onerror = () => ok(0); i.src = src; });

export function Articles({ arts, onChange, disabled, count }: { arts: Art[]; onChange: (a: Art[]) => void; disabled: boolean; count: number }) {
  const { t, lang } = useApp();
  const set = (i: number, a: Art) => onChange(arts.map((x, k) => (k === i ? a : x)));

  // one list of an article (titles, sub-headings or texts): each line removable, one more added
  const list = (i: number, key: "titles" | "decks" | "bodies", label: "copies.extra.title" | "copies.extra.deck" | "copies.extra.text",
                add: "copies.extra.addTitle" | "copies.extra.addDeck" | "copies.extra.addText", least: number) => {
    const a = arts[i];
    const put = (xs: string[]) => set(i, { ...a, [key]: xs });
    return (
      <div className={s.field}>
        {a[key].map((v, k) => (
          <label key={k} className={s.field}>
            <span className={s.row} style={{ justifyContent: "space-between" }}>
              <span className={s.label}>{t(label, { n: num(lang, k + 1) })}</span>
              {a[key].length > least && <Button kind="quiet" disabled={disabled} aria-label={`${t(label, { n: num(lang, k + 1) })}: ${t("copies.extra.removeItem")}`}
                                                onClick={() => put(a[key].filter((_, j) => j !== k))}>{t("copies.extra.removeItem")}</Button>}
            </span>
            {key === "bodies"
              ? <textarea className={s.textarea} rows={8} value={v} disabled={disabled} onChange={(e) => put(a[key].map((x, j) => (j === k ? e.target.value : x)))} />
              : <input className={s.input} value={v} disabled={disabled} onChange={(e) => put(a[key].map((x, j) => (j === k ? e.target.value : x)))} />}
          </label>
        ))}
        <span><Button kind="quiet" disabled={disabled} onClick={() => put([...a[key], ""])}>+ {t(add)}</Button></span>
      </div>
    );
  };

  return (
    <div className={s.field}>
      <span className={s.hint}>{t("copies.extra.body")}</span>
      {arts.map((a, i) => {
        const mixes = mixesOf(a);
        return (
          <div key={i} className={s.field} style={{ border: "1px solid var(--hairline)", borderRadius: "var(--r)", padding: 16, marginTop: 8 }}>
            <div className={s.row} style={{ justifyContent: "space-between" }}>
              <strong>{t("copies.article", { n: num(lang, i + 1) })}</strong>
              {arts.length > 1 && <Button kind="danger" icon={Icon.trash()} disabled={disabled}
                                          onClick={() => onChange(arts.filter((_, k) => k !== i))}>{t("copies.article.remove")}</Button>}
            </div>
            <div className={s.grid2} style={{ gap: 16 }}>
              {list(i, "titles", "copies.extra.title", "copies.extra.addTitle", 1)}
              <div className={s.field}>
                <div className={s.thumbsRow}>
                  {a.pics.map((p, k) => (
                    <div key={k} className={s.field} style={{ width: 120, gap: 4 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={"url" in p ? media(p.url) : p.preview} alt={t("copies.extra.photo", { n: num(lang, k + 1) })} style={{ width: "100%" }} />
                      <Button kind="quiet" disabled={disabled} aria-label={`${t("copies.extra.photo", { n: num(lang, k + 1) })}: ${t("copies.extra.removeItem")}`}
                              onClick={() => set(i, { ...a, pics: a.pics.filter((_, j) => j !== k) })}>{t("copies.extra.removeItem")}</Button>
                    </div>
                  ))}
                  <label className={s.drop} style={{ padding: 8, width: 120 }}>
                    {Icon.image()}<div>{t("copies.extra.pick")}</div>
                    <input type="file" accept="image/jpeg,image/png" multiple disabled={disabled} aria-label={t("copies.extra.pick")}
                           onChange={async (e) => {
                             const files = [...(e.target.files ?? [])]; e.target.value = "";
                             const got: Pic[] = await Promise.all(files.map(async (f) => {
                               const preview = URL.createObjectURL(f);
                               return { file: f, preview, small: (await widthOf(preview)) < SHARP_WIDTH };
                             }));
                             set(i, { ...a, pics: [...a.pics, ...got] });
                           }} />
                  </label>
                </div>
                {a.pics.some((p) => "small" in p && p.small) && <Note tone="warn">{t("copies.extra.small")}</Note>}
              </div>
            </div>
            {list(i, "decks", "copies.extra.deck", "copies.extra.addDeck", 0)}
            {list(i, "bodies", "copies.extra.text", "copies.extra.addText", 1)}
            {filled(a.titles).length > 0 && mixes > 1 && <span className={s.faint}>{count >= mixes
              ? t("copies.extra.plan", { mixes: num(lang, mixes), count: num(lang, count), each: num(lang, Math.round(count / mixes)) })
              : t("copies.extra.planFew", { mixes: num(lang, mixes), count: num(lang, count) })}</span>}
          </div>
        );
      })}
      <span><Button icon={Icon.copies()} disabled={disabled} onClick={() => onChange([...arts, blankArt()])}>{t("copies.article.add")}</Button></span>
    </div>
  );
}
