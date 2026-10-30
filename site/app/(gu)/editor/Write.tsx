"use client";
// The editor's own news, written on the phone (29 Oct: the editor at a conference): where it's from, the headline,
// sub-heading and story, photos from the phone (made smaller here, then kept by app/api/editor/photo) and the main
// photo's caption; AI help if wanted (undone with one button); "Put on the site" puts it up at once, word for word.
// The unfinished words are kept on the phone, so a lost connection or a closed page loses nothing.
// The same page writes an Aavtikal article (kind "aavtikal"): its section instead of where the news is from, "## " for
// sub-headings, and it goes into Aavtikal under the editor's name (lib/editor.ts, addFeature).
import { useEffect, useRef, useState } from "react";
import s from "./editor.module.css";
import { W } from "./words.ts";
import { aiHelp, writeFeature, writeStory } from "./actions.ts";
import type { Draft } from "@/lib/aihelp.ts";
import { GENRES, TIERS, sectionName } from "@/lib/sections.ts";
import type { Genre, Tier } from "@/lib/types.ts";

type Shot = { key: string; preview: string; state: "up" | "ok" | "bad"; url?: string; width?: number; height?: number; blob?: Blob };
type Beat = "ai" | "tech" | "science" | "politics";
type Kept = { headline: string; deck: string; body: string; caption: string; tier: Tier; genre: Genre | ""; beat?: Beat; photos: { url: string; width: number; height: number }[] };
const LONG = 1600;

/** a phone's photo made at most 1,600 pixels on its long side, as a JPEG */
export async function smaller(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, LONG / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k), height = Math.round(bmp.height * k);
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  c.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
  if (!blob) throw new Error("no JPEG");
  return { blob, width, height };
}

export default function Write({ lang, back, kind = "news", beats = [] }:
  { lang: "gu" | "en"; back: string; kind?: "news" | "aavtikal"; beats?: { key: Beat; name: string }[] }) {
  const w = W[lang];
  const av = kind === "aavtikal";
  const KEEP = av ? "ck_write_article" : "ck_write_draft";
  const [headline, setHeadline] = useState("");
  const [deck, setDeck] = useState("");
  const [body, setBody] = useState("");
  const [caption, setCaption] = useState("");
  const [tier, setTier] = useState<Tier>("gujarat");
  const [genre, setGenre] = useState<Genre | "">("");
  const [beat, setBeat] = useState<Beat>("ai");
  const [shots, setShots] = useState<Shot[]>([]);
  const [kept, setKept] = useState(false);
  const [ai, setAi] = useState<{ state: "idle" | "working" | "done" | "said"; say?: string; before?: Draft }>({ state: "idle" });
  const [putting, setPutting] = useState(false);
  const [problem, setProblem] = useState("");
  const loaded = useRef(false);
  const picker = useRef<HTMLInputElement>(null);

  // the unfinished words (and the photos already up) kept on the phone, and brought back
  useEffect(() => {
    try {
      const k = JSON.parse(localStorage.getItem(KEEP) ?? "null") as Kept | null;
      if (k && (k.headline || k.body || k.photos?.length)) {
        setHeadline(k.headline ?? ""); setDeck(k.deck ?? ""); setBody(k.body ?? ""); setCaption(k.caption ?? "");
        if (TIERS.includes(k.tier)) setTier(k.tier);
        setGenre(GENRES.includes(k.genre as Genre) ? (k.genre as Genre) : "");
        if (k.beat && beats.some((b) => b.key === k.beat)) setBeat(k.beat);
        setShots((k.photos ?? []).map((p, i) => ({ key: `kept-${i}`, preview: p.url, state: "ok", ...p })));
        setKept(true);
      }
    } catch { /* nothing kept */ }
    loaded.current = true;
  }, [KEEP, beats]);
  useEffect(() => {
    if (!loaded.current) return;
    const photos = shots.filter((x) => x.state === "ok" && x.url).map((x) => ({ url: x.url!, width: x.width!, height: x.height! }));
    try { localStorage.setItem(KEEP, JSON.stringify({ headline, deck, body, caption, tier, genre, beat, photos } satisfies Kept)); } catch { /* not kept */ }
  }, [KEEP, headline, deck, body, caption, tier, genre, beat, shots]);

  const change = (key: string, x: Partial<Shot>) => setShots((all) => all.map((y) => (y.key === key ? { ...y, ...x } : y)));
  async function send(key: string, blob: Blob, width: number, height: number) {
    change(key, { state: "up" });
    try {
      const res = await fetch(`/api/editor/photo?w=${width}&h=${height}`, { method: "POST", body: blob, headers: { "content-type": "image/jpeg" } });
      if (!res.ok) throw new Error(String(res.status));
      const got = (await res.json()) as { url: string; width: number; height: number };
      change(key, { state: "ok", url: got.url, width: got.width, height: got.height, blob: undefined });
    } catch { change(key, { state: "bad" }); }
  }
  async function add(files: FileList | null) {
    setProblem("");
    for (const file of Array.from(files ?? [])) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        const { blob, width, height } = await smaller(file);
        setShots((all) => [...all, { key, preview: URL.createObjectURL(blob), state: "up", blob, width, height }]);
        void send(key, blob, width, height);
      } catch { setProblem(w.badPhoto); }
    }
    if (picker.current) picker.current.value = "";
  }
  const toFront = (key: string) => setShots((all) => [...all.filter((x) => x.key === key), ...all.filter((x) => x.key !== key)]);
  const drop = (key: string) => setShots((all) => all.filter((x) => x.key !== key));

  async function askAi() {
    if (!body.trim()) { setAi({ state: "said", say: av ? w.avAiNeedsText : w.aiNeedsText }); return; }
    const before = { headline, deck, body };
    setAi({ state: "working" });
    try {
      const r = await aiHelp(before, av ? "article" : "news");
      if (r.ok) {
        setHeadline(r.draft.headline); setDeck(r.draft.deck); setBody(r.draft.body);
        setAi({ state: "done", before });
      } else setAi({ state: "said", say: { nokey: w.aiNoKey, busy: w.aiBusy, numbers: w.aiNumbers, failed: w.aiFailed }[r.why] });
    } catch { setAi({ state: "said", say: w.aiFailed }); }
  }
  function undoAi() {
    if (ai.before) { setHeadline(ai.before.headline); setDeck(ai.before.deck); setBody(ai.before.body); }
    setAi({ state: "idle" });
  }

  async function putUp() {
    setProblem("");
    if (!headline.trim() || !body.trim()) { setProblem(w.missing); return; }
    if (shots.some((x) => x.state === "up")) { setProblem(w.waitPhotos); return; }
    if (shots.some((x) => x.state === "bad")) { setProblem(w.photoFailed); return; }
    setPutting(true);
    try {
      const photos = shots.filter((x) => x.state === "ok" && x.url).map((x) => ({ url: x.url!, width: x.width!, height: x.height! }));
      const r = av ? await writeFeature({ headline, deck, body, caption, beat, photos })
        : await writeStory({ headline, deck, body, caption, tier, genre: genre || null, photos });
      if ("id" in r) {
        try { localStorage.removeItem(KEEP); } catch { /* gone with the page */ }
        location.assign(`/editor?${back ? `${back}&` : ""}${av ? "wrote" : "written"}=${encodeURIComponent(r.id)}#${av ? "aavtikal" : "news"}`);
        return;
      }
      setProblem(r.error === "missing" ? w.missing : av ? w.avFailedPut : w.failedPut);
    } catch { setProblem(av ? w.avFailedPut : w.failedPut); }
    setPutting(false);
  }

  return (
    <div className={s.form}>
      <p className={s.help}>{av ? w.avWriteIntro : w.writeIntro}</p>
      {kept && <p className={s.done} role="status">{w.draftKept}</p>}

      {av ? (
        <fieldset className={s.pick}>
          <legend>{w.beat}</legend>
          <div className={s.pills}>
            {beats.map((b) => (
              <label key={b.key}><input type="radio" name="beat" value={b.key} checked={beat === b.key} onChange={() => setBeat(b.key)} /><span>{b.name}</span></label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <fieldset className={s.pick}>
            <legend>{w.where}</legend>
            <div className={s.pills}>
              {TIERS.map((t) => (
                <label key={t}><input type="radio" name="tier" value={t} checked={tier === t} onChange={() => setTier(t)} /><span>{sectionName(t, lang)}</span></label>
              ))}
            </div>
          </fieldset>
          <label>{w.topic}
            <select className={s.select} value={genre} onChange={(e) => setGenre(e.target.value as Genre | "")}>
              <option value="">{w.noTopic}</option>
              {GENRES.map((g) => <option key={g} value={g}>{sectionName(g, lang)}</option>)}
            </select>
          </label>
        </>
      )}

      <label>{w.headline}<textarea rows={2} className={s.hl} value={headline} onChange={(e) => setHeadline(e.target.value)} /></label>
      <label>{w.deck}<textarea rows={2} value={deck} onChange={(e) => setDeck(e.target.value)} /></label>
      <label>{av ? w.avBody : w.body}<span className={s.help}>{av ? w.avBodyHelp : w.bodyHelp}</span>
        <textarea rows={av ? 22 : 14} className={s.bodyBox} value={body} onChange={(e) => setBody(e.target.value)} /></label>

      <div className={s.aiBox}>
        <button type="button" className={s.ghost} onClick={askAi} disabled={ai.state === "working"}>{ai.state === "working" ? w.aiWorking : w.aiHelp}</button>
        {ai.state === "done" && <p className={s.done} role="status">{w.aiDone} <button type="button" className={s.link} onClick={undoAi}>{w.aiUndo}</button></p>}
        {ai.state === "said" && <p className={s.note} role="status">{ai.say}</p>}
      </div>

      <fieldset className={s.pick}>
        <legend>{w.photos}</legend>
        <p className={s.help}>{av ? w.avPhotosHelp : w.photosHelp}</p>
        {shots.length > 0 && (
          <ul className={s.shots}>
            {shots.map((x, i) => (
              <li key={x.key} className={i === 0 ? s.main : undefined}>
                <img src={x.preview} alt="" />
                {i === 0 && <span className={s.badge}>{w.mainPhoto}</span>}
                {x.state === "up" && <span className={s.state}>{w.uploading}</span>}
                {x.state === "bad" && <span className={`${s.state} ${s.bad}`}>{w.upFailed}</span>}
                <div className={s.shotActs}>
                  {x.state === "bad" && x.blob && <button type="button" className={s.small} onClick={() => send(x.key, x.blob!, x.width!, x.height!)}>{w.retry}</button>}
                  {i > 0 && <button type="button" className={s.small} onClick={() => toFront(x.key)}>{w.makeMain}</button>}
                  <button type="button" className={s.small} onClick={() => drop(x.key)}>{w.removePhoto}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <input ref={picker} className={s.file} type="file" accept="image/*" multiple onChange={(e) => add(e.target.files)} tabIndex={-1} aria-hidden="true" />
        <button type="button" className={s.ghost} onClick={() => picker.current?.click()}>{w.addPhotos}</button>
        {shots.length > 0 && <label>{w.captionMain}<textarea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} /></label>}
      </fieldset>

      {problem && <p className={s.stopped} role="alert">{problem}</p>}
      <div className={s.buttons}>
        <button type="button" className={s.yes} onClick={putUp} disabled={putting}>{putting ? w.putting : w.putUp}</button>
      </div>
    </div>
  );
}
