// Aavtikal's cards (FLAGSHIP.md §2.5-2.6): the lead beside its photo, the
// three-across card with the arrow square, the beat's tile where there's no photo.
import Link from "next/link";
import s from "./fl.module.css";
import { fl } from "./Frame.tsx";
import type { Lang } from "../../lib/types.ts";
import { pic, SIZES } from "../../lib/photo.ts";
import { AUTHORS, beatName, featureWords, flw, readMinutes, type Feature } from "../../lib/flagship.ts";
import { num, shortDate } from "../../lib/format.ts";

/** Gujarati words shown on an English or Hindi page are marked so, and keep the Gujarati sizes. */
export const gl = (lang: Lang, translated: boolean) => (lang !== "gu" && !translated ? "gu" : undefined);

export const featureHref = (f: Feature, lang: Lang) => fl(lang, `/p/${f.id}`);

function Go() {
  return <span className={s.go} aria-hidden="true"><i /><i /><svg viewBox="0 0 10 8"><path d="M6 0l4 4-4 4-.9-.9L7.6 4.6H0V3.4h7.6L5.1.9z" /></svg></span>;
}

function Meta({ f, lang }: { f: Feature; lang: Lang }) {
  const w = featureWords(f, lang);
  return (
    <div className={s.meta}>
      <span>{AUTHORS[f.author].name[lang]}</span>
      <span className={s.metaR}>
        <span className={s.date}>{shortDate(f.publishedAt, lang)}</span>
        <span className={`${s.sep} ${s.date}`} aria-hidden="true" />
        <span>{num(readMinutes(w.body), lang)} {flw(lang).min}</span>
        <Go />
      </span>
    </div>
  );
}

function Picture({ f, lang, cls, eager }: { f: Feature; lang: Lang; cls: string; eager?: boolean }) {
  const w = featureWords(f, lang);
  if (!f.photo) return <div className={`${s.tile} ${s[f.beat]}`} aria-hidden="true"><span>{beatName(f.beat, lang)}</span></div>;
  return <img className={cls} {...pic(f.photo, eager ? SIZES.lead : SIZES.card)} width={f.photo.width} height={f.photo.height} alt={w.caption || w.headline}
              loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} decoding="async" />;
}

export function Lead({ f, lang }: { f: Feature; lang: Lang }) {
  const w = featureWords(f, lang);
  return (
    <article className={`${s.lead} ${s[f.beat]}`}>
      <Link href={featureHref(f, lang)} tabIndex={-1} aria-hidden="true"><Picture f={f} lang={lang} cls={s.leadPh} eager /></Link>
      <Link className={s.leadText} href={featureHref(f, lang)}>
        <span className={s.beatTag} style={{ marginTop: 0, marginBottom: 14 }}>{beatName(f.beat, lang)}</span>
        <h2 className={`${s.hl} ${s.leadHl}`} lang={gl(lang, w.translated)}>{w.headline}</h2>
        {w.dek && <p className={`${s.leadDek} ${s.serif}`}>{w.dek}</p>}
        <Meta f={f} lang={lang} />
      </Link>
    </article>
  );
}

export function Card({ f, lang, tag = true }: { f: Feature; lang: Lang; tag?: boolean }) {
  const w = featureWords(f, lang);
  return (
    <article className={`${s.card} ${s[f.beat]}`}>
      <Link className={s.cardLink} href={featureHref(f, lang)}>
        <Picture f={f} lang={lang} cls={s.cardPh} />
        {tag && <span className={s.beatTag}>{beatName(f.beat, lang)}</span>}
        <h3 lang={gl(lang, w.translated)} className={`${s.hl} ${s.cardHl}`} style={tag ? { marginTop: 10 } : undefined}>{w.headline}</h3>
        {w.dek && <p className={`${s.cardDek} ${s.serif}`}>{w.dek}</p>}
        <span className={s.cardFoot}><Meta f={f} lang={lang} /></span>
      </Link>
    </article>
  );
}

/** The last tile of the front page's grid: every article. */
export function Dive({ lang }: { lang: Lang }) {
  const w = flw(lang);
  return (
    <article className={s.card}>
      <Link className={`${s.cardLink} ${s.dive}`} href={fl(lang, "/search")}>
        <h3 className={`${s.hl} ${s.diveHl}`}>{w.dive}</h3>
        <span className={s.meta}><span>{w.diveSub}</span><Go /></span>
      </Link>
    </article>
  );
}

export function Grid({ items, lang, tag = true, dive = false }: { items: Feature[]; lang: Lang; tag?: boolean; dive?: boolean }) {
  if (!items.length && !dive) return null;
  return (
    <div className={s.grid}>
      {items.map((f) => <Card key={f.id} f={f} lang={lang} tag={tag} />)}
      {dive && <Dive lang={lang} />}
    </div>
  );
}

/** The WhatsApp box (Pirate Wires' pop-up, set into the page instead). */
export function JoinBox({ lang }: { lang: Lang }) {
  const w = flw(lang);
  return (
    <section id="join" className={s.joinBox} aria-labelledby="join-h">
      <h2 id="join-h">{w.joinTitle}</h2>
      <p>{w.joinText}</p>
      <span className={s.joinBtn} aria-disabled="true">{w.joinSoon}</span>
    </section>
  );
}
