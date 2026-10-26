// PIB as a source: today's release list in each language, then each new
// release's own page, read with the app's own parsers (imported read-only,
// CLAUDE.md). PIB answers GitHub's servers (tested 25 Oct); its date form is
// refused to programs, so only today's list is read, every run.
import { parseList, parseRelease } from "../../backend/src/ingest/pib.ts";
import { ask } from "./fetch.ts";
import type { FeedItem } from "./feed.ts";

const SITE = "https://www.pib.gov.in";
const LISTS = { gu: { reg: 22, lang: 13 }, en: { reg: 3, lang: 1 }, hi: { reg: 3, lang: 2 } } as const;
export type PibLang = keyof typeof LISTS;

export const releaseUrl = (prid: number) => `${SITE}/PressReleasePage.aspx?PRID=${prid}`;

/** Today's list: each release as a feed item (its ministry as the summary). */
export async function pibList(lang: PibLang): Promise<{ status: number; refused: boolean; items: FeedItem[]; error?: string }> {
  const { reg, lang: l } = LISTS[lang];
  const res = await ask(`${SITE}/allRel.aspx?reg=${reg}&lang=${l}`);
  if (res.status !== 200) return { status: res.status, refused: res.refused, items: [], error: res.error };
  const { items } = parseList(res.text);
  return {
    status: 200, refused: false,
    items: items.map((it) => ({ title: it.headline, url: releaseUrl(it.prid), summary: it.ministry, publishedAt: null, image: null })),
  };
}

/** One release's full text, date and official photos. */
export async function pibRelease(url: string) {
  const prid = Number(url.match(/PRID=(\d+)/)?.[1]);
  if (!prid) return null;
  const res = await ask(`${SITE}/PressReleaseIframePage.aspx?PRID=${prid}`);
  if (res.status !== 200) return null;
  const r = parseRelease(res.text, prid);
  if (!r || !r.paras.length) return null;
  return {
    text: [r.headline, r.subhead, ...r.paras].filter(Boolean).join("\n\n"),
    date: r.date, ministry: r.ministry, office: r.office,
    photos: r.photos.map((p) => new URL(p, SITE).href),
  };
}
