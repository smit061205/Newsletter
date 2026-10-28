// Aavtikal's pages (FLAGSHIP.md §2.4-2.10), one view per kind; the routes in
// app/(gu)/aavtikal, app/(en)/en/aavtikal and app/(hi)/hi/aavtikal only pick the language.
import Link from "next/link";
import { notFound } from "next/navigation";
import s from "@/components/flagship/fl.module.css";
import Frame, { Wordmark, fl } from "@/components/flagship/Frame.tsx";
import Share from "@/components/flagship/Share.tsx";
import { Grid, JoinBox, Lead, featureHref, gl } from "@/components/flagship/cards.tsx";
import { SearchIcon, Chev } from "@/components/icons.tsx";
import type { Lang } from "@/lib/types.ts";
import { AUTHORS, BEATS, beatName, featureById, featureWords, features, flw, isAuthor, isBeat, readMinutes, searchFeatures, type Beat } from "@/lib/flagship.ts";
import { dateText, num, paragraphs } from "@/lib/format.ts";
import { SITE_URL } from "@/lib/site.ts";
import { pageMeta } from "@/lib/meta.ts";

export async function FlFront({ lang }: { lang: Lang }) {
  const w = flw(lang);
  const all = await features({ limit: 60 });
  const [lead, ...rest] = all;
  const shown = new Set([lead, ...rest.slice(0, 5)].filter(Boolean).map((f) => f.id));
  return (
    <Frame lang={lang} path="">
      <h1 className={s.srOnly}>{w.name}: {w.tagline}</h1>
      <Wordmark lang={lang} cls={s.mast} />
      {!lead ? <p className={s.empty}>{w.empty}</p> : (
        <>
          <section className={`${s.band} ${s.bandTop}`}>
            <Lead f={lead} lang={lang} />
            <Grid items={rest.slice(0, 5)} lang={lang} dive />
          </section>
          {BEATS.map((b, i) => {
            // the beat's newest not already shown above, then those shown, so a band has its three
            const ofBeat = all.filter((f) => f.beat === b);
            const mine = [...ofBeat.filter((f) => !shown.has(f.id)), ...ofBeat.filter((f) => shown.has(f.id))].slice(0, 3);
            if (!mine.length) return null;
            return (
              <section key={b} className={`${s.band} ${i % 2 ? s.inkBand : s.beatBand} ${s[b]}`} aria-labelledby={`band-${b}`}>
                <div className={s.bandHead}>
                  <h2 id={`band-${b}`} className={s.bandName}>{beatName(b, lang)}</h2>
                  <Link className={s.seeAll} href={fl(lang, `/${b}`)}>{w.seeAll}<Chev /></Link>
                </div>
                <Grid items={mine} lang={lang} tag={false} />
                <Link className={`${s.hl} ${s.readMore}`} href={fl(lang, `/${b}`)}>{w.readMore(beatName(b, lang))}</Link>
              </section>
            );
          })}
          <Writers lang={lang} />
        </>
      )}
      <div className={s.band}><JoinBox lang={lang} /></div>
    </Frame>
  );
}

function Writers({ lang }: { lang: Lang }) {
  const w = flw(lang);
  return (
    <section className={`${s.band} ${s.softBand}`} aria-labelledby="writers-h">
      <div className={s.bandHead}><h2 id="writers-h" className={s.bandName}>{w.writers}</h2></div>
      <div className={s.writers}>
        {(Object.keys(AUTHORS) as (keyof typeof AUTHORS)[]).map((k) => (
          <Link key={k} className={s.writer} href={fl(lang, `/author/${k}`)}>
            <span className={`${s.hl} ${s.writerName}`}>{AUTHORS[k].name[lang]}</span>
            <span className={s.writerRole}>{AUTHORS[k].role[lang]}</span>
          </Link>
        ))}
        <p className={s.writersText}>{w.writersText}</p>
      </div>
    </section>
  );
}

export async function FlBeat({ lang, beat }: { lang: Lang; beat: string }) {
  if (!isBeat(beat)) notFound();
  const w = flw(lang);
  const [lead, ...rest] = await features({ beat, limit: 40 });
  return (
    <Frame lang={lang} beat={beat} path={`/${beat}`}>
      <div className={`${s.beatBand} ${s.pageHead}`}><h1 className={s.huge}>{beatName(beat, lang)}</h1></div>
      {!lead ? <p className={s.empty}>{w.empty}</p> : (
        <section className={`${s.band} ${s.bandTop}`}>
          <Lead f={lead} lang={lang} />
          <Grid items={rest} lang={lang} tag={false} />
        </section>
      )}
      <div className={s.band}><JoinBox lang={lang} /></div>
    </Frame>
  );
}

export async function FlAuthor({ lang, author }: { lang: Lang; author: string }) {
  if (!isAuthor(author)) notFound();
  const w = flw(lang);
  const mine = await features({ author, limit: 60 });
  return (
    <Frame lang={lang} path={`/author/${author}`}>
      <header className={s.authorHead}>
        <h1 className={`${s.hl} ${s.authorName}`}>{AUTHORS[author].name[lang]}</h1>
        <p className={s.authorRole}>{AUTHORS[author].role[lang]}</p>
      </header>
      {mine.length ? <Grid items={mine} lang={lang} /> : <p className={s.empty}>{w.empty}</p>}
    </Frame>
  );
}

export async function FlSearch({ lang, q }: { lang: Lang; q: string }) {
  const w = flw(lang);
  const query = q.trim().slice(0, 80);
  const found = await searchFeatures(query, 30);
  return (
    <Frame lang={lang} path="/search">
      <h1 className={s.huge} style={{ paddingTop: 20 }}>{w.search}</h1>
      <form className={s.searchForm} action={fl(lang, "/search")} role="search">
        <label className={s.searchBox}>
          <SearchIcon />
          <input type="search" name="q" defaultValue={query} placeholder={w.searchPlaceholder} aria-label={w.search} autoComplete="off" />
        </label>
      </form>
      <p className={s.searchNote} aria-live="polite">{query ? (found.length ? w.found(found.length) : w.notFound) : w.showing(found.length)}</p>
      <Grid items={found} lang={lang} />
    </Frame>
  );
}

/** "## " starts a subheading, "### " a smaller one; the rest are paragraphs. */
function Body({ text }: { text: string }) {
  return <>{paragraphs(text).map((p, i) => p.startsWith("### ") ? <h3 key={i}>{p.slice(4)}</h3> : p.startsWith("## ") ? <h2 key={i}>{p.slice(3)}</h2> : <p key={i}>{p}</p>)}</>;
}

export async function FlArticle({ lang, id }: { lang: Lang; id: string }) {
  const f = await featureById(id);
  if (!f) notFound();
  const w = flw(lang);
  const t = featureWords(f, lang);
  const more = (await features({ beat: f.beat, limit: 4 })).filter((x) => x.id !== f.id).slice(0, 3);
  return (
    <Frame lang={lang} beat={f.beat} path={`/p/${f.id}`}>
      <article>
        <header className={s.artHead}>
          <h1 className={`${s.hl} ${s.artTitle}`} lang={gl(lang, t.translated)}>{t.headline}</h1>
          {t.dek && <p className={`${s.artDek} ${s.serif}`}>{t.dek}</p>}
          <div className={s.artMeta}>
            <Link href={fl(lang, `/author/${f.author}`)}>{AUTHORS[f.author].name[lang]}</Link>
            <span><time dateTime={f.publishedAt}>{dateText(f.publishedAt, lang)}</time> · {num(readMinutes(t.body), lang)} {w.min}</span>
          </div>
        </header>
        {f.photo && (
          <figure className={s.hero} style={{ margin: 0 }}>
            <img src={f.photo.url} width={f.photo.width} height={f.photo.height} alt={t.caption || t.headline} />
            {t.caption && <figcaption>{t.caption}</figcaption>}
          </figure>
        )}
        <div className={s.col}>
          <Share url={`${SITE_URL}${featureHref(f, lang)}`} headline={t.headline} words={{ share: w.share, copy: w.copy, copied: w.copied }} />
          <div className={s.body}>
            {lang !== "gu" && !t.translated && <p className={s.translated}>{w.notTranslated}</p>}
            <Body text={t.body} />
            {(f.author === "desk" || f.sources.length > 0) && (
              <aside className={s.note}>
                {f.author === "desk" && <p style={{ margin: 0 }}>{w.aiNote}</p>}
                {f.sources.length > 0 && <>
                  <h4>{w.sources}</h4>
                  <ol>{f.sources.map((x) => <li key={x.url}><a href={x.url} rel="noopener" target="_blank">{x.name}</a></li>)}</ol>
                </>}
              </aside>
            )}
          </div>
        </div>
      </article>
      <JoinBox lang={lang} />
      {more.length > 0 && (
        <section className={`${s.band} ${s.beatBand} ${s[f.beat as Beat]}`} aria-labelledby="more-h">
          <div className={s.bandHead}>
            <h2 id="more-h" className={s.bandName}>{beatName(f.beat, lang)}</h2>
            <Link className={s.seeAll} href={fl(lang, `/${f.beat}`)}>{w.seeAll}<Chev /></Link>
          </div>
          <Grid items={more} lang={lang} tag={false} />
        </section>
      )}
    </Frame>
  );
}

/** A flagship page's title, description and share preview. */
export async function flMeta(lang: Lang, path: string, o: { title?: string; description?: string; image?: string | null; id?: string } = {}) {
  const w = flw(lang);
  if (o.id) {
    const f = await featureById(o.id);
    if (f) { const t = featureWords(f, lang); o = { title: t.headline, description: t.dek || t.body.slice(0, 160), image: f.photo?.url }; }
  }
  const m = pageMeta({ lang, path: `/aavtikal${path}`, title: o.title ? `${o.title} | ${w.name}` : w.name, description: o.description || w.tagline, image: o.image });
  return { ...m, alternates: { ...m.alternates, types: undefined } };
}
