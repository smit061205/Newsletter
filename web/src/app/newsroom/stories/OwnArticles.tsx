"use client";
// The editor's own articles in the day's paper, word for word (the copies'
// article box, one of each: backend/src/editorial/articles.ts). Saving lays
// the paper out again with them.
import { useEffect, useState } from "react";
import { call, type CopyArticle } from "../api";
import { artOf, Articles, blankArt, type Art } from "../copies/Articles";
import s from "../newsroom.module.css";
import { num } from "../ui/format";
import { Button, Empty, Icon, Note, Skeleton, useApp } from "../ui/kit";

const toBase64 = (f: File) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = () => bad(new Error("couldn't read that file"));
  r.readAsDataURL(f);
});
const lines = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

export function OwnArticles() {
  const { t, lang, date, toast } = useApp();
  const [arts, setArts] = useState<Art[] | null>(null);
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setArts(null); setChanged(false); setError("");
    call<CopyArticle[]>(`/api/issues/${date}/articles`).then((a) => setArts(a.map(artOf))).catch((e) => setError(e.message));
  }, [date]);
  const change = (a: Art[]) => { setArts(a); setChanged(true); };

  const save = async () => {
    if (!arts) return;
    const missing = arts.findIndex((a) => !lines(a.titles).length || !lines(a.bodies).length);
    if (missing >= 0) return setError(t("copies.extra.need", { n: num(lang, missing + 1) }));
    setSaving(true); setError("");
    try {
      const articles = await Promise.all(arts.map(async (a) => ({
        titles: lines(a.titles), decks: lines(a.decks), bodies: lines(a.bodies),
        photos: await Promise.all(a.pics.map(async (p) => ("url" in p ? { url: p.url } : { name: p.file.name, base64: await toBase64(p.file) }))),
      })));
      const got = await call<{ saved?: boolean; rebuilding?: string; waitingFor?: string }>(`/api/issues/${date}/articles`, { json: { articles } });
      toast(t(got.rebuilding || got.waitingFor ? "articles.savedLater" : got.saved ? "articles.savedNoPaper" : "articles.saved"));
      setChanged(false);
      // the photos as saved (their addresses on the engine)
      setArts((await call<CopyArticle[]>(`/api/issues/${date}/articles`)).map(artOf));
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  };

  return (
    <section className={s.card}>
      {!arts ? <Skeleton h={120} />
        : !arts.length ? <Empty icon={Icon.stories()} title={t("articles.none")} />
        : <Articles arts={arts} onChange={change} disabled={saving} count={1} single />}
      {error && <Note tone="bad">{error}</Note>}
      {arts && (
        <div className={s.row} style={{ justifyContent: "space-between" }}>
          {arts.length ? <span /> : <Button icon={Icon.copies()} disabled={saving} onClick={() => change([blankArt()])}>{t("articles.add")}</Button>}
          <span className={s.row}>
            {changed && <span className={s.faint}>{t("articles.changed")}</span>}
            <Button kind="primary" big disabled={saving || !changed} onClick={save}>{saving ? t("articles.saving") : t("articles.save")}</Button>
          </span>
        </div>
      )}
    </section>
  );
}
