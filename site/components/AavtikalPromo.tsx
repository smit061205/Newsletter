// The door into Aavtikal on Capital Kranti's front page (the user, 29 Oct: "advertise Aavtikal on the main website"):
// Aavtikal's own look inside the daily paper (components/flagship/fl.module.css): its near-black band, the four beats'
// flat colours as a strip and as tags, its compressed headlines. Its name and what it is on one side; its newest article
// with a photo on the other, and three more beneath, of other beats where there are. Nothing shows until it has articles.
import Link from "next/link";
import type { Lang } from "../lib/types.ts";
import { BEATS, beatName, featureWords, flw, readMinutes, type Feature } from "../lib/flagship.ts";
import { href } from "../lib/i18n.ts";
import { num } from "../lib/format.ts";
import { Chev } from "./icons.tsx";

const fl = (lang: Lang, path = "") => href(lang, `/aavtikal${path}`);

/** the lead (the newest with a photo) and three more, a beat not yet shown before one already shown */
export function promoPick(list: Feature[]): Feature[] {
  const lead = list.find((f) => f.photo) ?? list[0];
  if (!lead) return [];
  const rest = list.filter((f) => f !== lead);
  const seen = new Set([lead.beat]);
  const more: Feature[] = [];
  for (const f of rest) if (more.length < 3 && !seen.has(f.beat)) { more.push(f); seen.add(f.beat); }
  for (const f of rest) if (more.length < 3 && !more.includes(f)) more.push(f);
  return [lead, ...more];
}

export default function AavtikalPromo({ lang, articles }: { lang: Lang; articles: Feature[] }) {
  const [lead, ...more] = promoPick(articles);
  if (!lead) return null;
  const w = flw(lang);
  const lw = featureWords(lead, lang);
  const minutes = (f: Feature) => `${num(readMinutes(featureWords(f, lang).body), lang)} ${w.min}`;
  return (
    <section className="ctr avp" aria-labelledby="avp-name">
      <div className="avp-strip" aria-hidden="true">{BEATS.map((b) => <i key={b} className={`b-${b}`} />)}</div>
      <div className="avp-in">
        <div className="avp-about">
          <p className="avp-by">{w.promoBy}</p>
          <h2 className="avp-name" id="avp-name"><Link href={fl(lang)}>{w.name}</Link></h2>
          <p className="avp-pitch">{w.promoPitch}</p>
          <ul className="avp-beats">
            {BEATS.map((b) => <li key={b}><Link className={`b-${b}`} href={fl(lang, `/${b}`)}>{beatName(b, lang)}</Link></li>)}
          </ul>
          <Link className="avp-cta" href={fl(lang)}>{w.promoCta} <Chev /></Link>
        </div>
        <article className="avp-lead">
          <Link href={fl(lang, `/p/${lead.id}`)}>
            {lead.photo && <span className="avp-ph"><img src={lead.photo.url} width={lead.photo.width} height={lead.photo.height} alt={lw.caption || lw.headline} loading="lazy" decoding="async" /></span>}
            <span className={`avp-tag b-${lead.beat}`}>{beatName(lead.beat, lang)}</span>
            <h3 className="avp-hl" lang={lw.translated || lang === "gu" ? lang : "gu"}>{lw.headline}</h3>
            {lw.dek && <p className="avp-dek">{lw.dek}</p>}
            <span className="avp-min">{minutes(lead)}</span>
          </Link>
        </article>
        {more.length > 0 && (
          <div className="avp-more">
            <p className="avp-label">{w.promoMore}</p>
            <ul>
              {more.map((f) => {
                const t = featureWords(f, lang);
                return (
                  <li key={f.id}>
                    <Link href={fl(lang, `/p/${f.id}`)}>
                      <span className={`avp-kick b-${f.beat}`}>{beatName(f.beat, lang)}</span>
                      <span className="avp-sh" lang={t.translated || lang === "gu" ? lang : "gu"}>{t.headline}</span>
                      <span className="avp-min">{minutes(f)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
