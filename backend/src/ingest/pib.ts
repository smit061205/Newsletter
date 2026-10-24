// Fetches a day's press releases from PIB, the Press Information Bureau
// (pib.gov.in): the central government's releases, issued for the press.
//
// PIB Ahmedabad (region 22) publishes in Gujarati (language 13) -- its own
// releases and the national ones it translates through the day; the
// national office (region 3) publishes in Hindi (language 2), which the
// paper translates when the Gujarati ones don't fill it.
//
// The pages are plain server-rendered HTML and answer ordinary requests;
// they're read politely: one at a time, a pause between them, a user agent
// naming the paper, only the day's releases, and each release once (stored
// by its PRID).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import type { Progress, Release, Store } from "../store.ts";

const SITE = "https://www.pib.gov.in";
// names the paper honestly (PIB's firewall turns away agents with an email address in them)
const UA = "CapitalKranti-news-ingest/1.0";
const PAUSE_MS = 1500;
const MAX_PAGES = 300; // a day's ceiling, whatever happens

export const FEEDS = {
  gu: { reg: 22, lang: 13, name: "PIB Ahmedabad, Gujarati" },
  hi: { reg: 3, lang: 2, name: "PIB Delhi, Hindi" },
  en: { reg: 3, lang: 1, name: "PIB Delhi, English" },
} as const;
export type FeedLang = keyof typeof FEEDS;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// HTML's named characters up to the arrows (Latin-1, accents, typographic
// marks): Malé, ₹-adjacent dashes and quotes, as PIB writes them
const NAMED: Record<string, number> = { apos: 0x27, AElig: 0xc6, Aacute: 0xc1, Acirc: 0xc2, Agrave: 0xc0, Alpha: 0x391, Aring: 0xc5, Atilde: 0xc3, Auml: 0xc4, Beta: 0x392, Ccedil: 0xc7, Chi: 0x3a7, Dagger: 0x2021, Delta: 0x394, ETH: 0xd0, Eacute: 0xc9, Ecirc: 0xca, Egrave: 0xc8, Epsilon: 0x395, Eta: 0x397, Euml: 0xcb, Gamma: 0x393, Iacute: 0xcd, Icirc: 0xce, Igrave: 0xcc, Iota: 0x399, Iuml: 0xcf, Kappa: 0x39a, Lambda: 0x39b, Mu: 0x39c, Ntilde: 0xd1, Nu: 0x39d, OElig: 0x152, Oacute: 0xd3, Ocirc: 0xd4, Ograve: 0xd2, Omega: 0x3a9, Omicron: 0x39f, Oslash: 0xd8, Otilde: 0xd5, Ouml: 0xd6, Phi: 0x3a6, Pi: 0x3a0, Prime: 0x2033, Psi: 0x3a8, Rho: 0x3a1, Scaron: 0x160, Sigma: 0x3a3, THORN: 0xde, Tau: 0x3a4, Theta: 0x398, Uacute: 0xda, Ucirc: 0xdb, Ugrave: 0xd9, Upsilon: 0x3a5, Uuml: 0xdc, Xi: 0x39e, Yacute: 0xdd, Yuml: 0x178, Zeta: 0x396, aacute: 0xe1, acirc: 0xe2, acute: 0xb4, aelig: 0xe6, agrave: 0xe0, alefsym: 0x2135, alpha: 0x3b1, amp: 0x26, aring: 0xe5, atilde: 0xe3, auml: 0xe4, bdquo: 0x201e, beta: 0x3b2, brvbar: 0xa6, bull: 0x2022, ccedil: 0xe7, cedil: 0xb8, cent: 0xa2, chi: 0x3c7, circ: 0x2c6, copy: 0xa9, crarr: 0x21b5, curren: 0xa4, dArr: 0x21d3, dagger: 0x2020, darr: 0x2193, deg: 0xb0, delta: 0x3b4, divide: 0xf7, eacute: 0xe9, ecirc: 0xea, egrave: 0xe8, emsp: 0x2003, ensp: 0x2002, epsilon: 0x3b5, eta: 0x3b7, eth: 0xf0, euml: 0xeb, euro: 0x20ac, fnof: 0x192, frac12: 0xbd, frac14: 0xbc, frac34: 0xbe, frasl: 0x2044, gamma: 0x3b3, gt: 0x3e, hArr: 0x21d4, harr: 0x2194, hellip: 0x2026, iacute: 0xed, icirc: 0xee, iexcl: 0xa1, igrave: 0xec, image: 0x2111, iota: 0x3b9, iquest: 0xbf, iuml: 0xef, kappa: 0x3ba, lArr: 0x21d0, lambda: 0x3bb, laquo: 0xab, larr: 0x2190, ldquo: 0x201c, lrm: 0x200e, lsaquo: 0x2039, lsquo: 0x2018, lt: 0x3c, macr: 0xaf, mdash: 0x2014, micro: 0xb5, middot: 0xb7, mu: 0x3bc, nbsp: 0xa0, ndash: 0x2013, not: 0xac, ntilde: 0xf1, nu: 0x3bd, oacute: 0xf3, ocirc: 0xf4, oelig: 0x153, ograve: 0xf2, oline: 0x203e, omega: 0x3c9, omicron: 0x3bf, ordf: 0xaa, ordm: 0xba, oslash: 0xf8, otilde: 0xf5, ouml: 0xf6, para: 0xb6, permil: 0x2030, phi: 0x3c6, pi: 0x3c0, piv: 0x3d6, plusmn: 0xb1, pound: 0xa3, prime: 0x2032, psi: 0x3c8, quot: 0x22, rArr: 0x21d2, raquo: 0xbb, rarr: 0x2192, rdquo: 0x201d, real: 0x211c, reg: 0xae, rho: 0x3c1, rlm: 0x200f, rsaquo: 0x203a, rsquo: 0x2019, sbquo: 0x201a, scaron: 0x161, sect: 0xa7, shy: 0xad, sigma: 0x3c3, sigmaf: 0x3c2, sup1: 0xb9, sup2: 0xb2, sup3: 0xb3, szlig: 0xdf, tau: 0x3c4, theta: 0x3b8, thetasym: 0x3d1, thinsp: 0x2009, thorn: 0xfe, tilde: 0x2dc, times: 0xd7, trade: 0x2122, uArr: 0x21d1, uacute: 0xfa, uarr: 0x2191, ucirc: 0xfb, ugrave: 0xf9, uml: 0xa8, upsih: 0x3d2, upsilon: 0x3c5, uuml: 0xfc, weierp: 0x2118, xi: 0x3be, yacute: 0xfd, yen: 0xa5, yuml: 0xff, zeta: 0x3b6, zwj: 0x200d, zwnj: 0x200c };
// (a non-breaking space reads as a plain one in a release's text)
const ENTITIES: Record<string, string> = { ...Object.fromEntries(Object.entries(NAMED).map(([k, v]) => [k, String.fromCodePoint(v)])), nbsp: " " };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m);
}
const text = (html: string) => decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** "22 OCT 2026 11:38AM by PIB Ahmedabad" -> "2026-10-22" */
export function isoFromDateLine(line: string): string | null {
  const m = line.match(/(\d{1,2})\s+([A-Z]{3})\s+(\d{4})/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toUpperCase()) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export interface ListItem { prid: number; ministry: string; headline: string }

/** A release list page: every release with its ministry, and the day it shows. */
export function parseList(html: string): { date: string | null; items: ListItem[] } {
  const sel = (name: string) => {
    const at = html.indexOf(`ContentPlaceHolder1_${name}`);
    return at < 0 ? null : html.slice(at, at + 20_000).match(/<option selected="selected" value="(\d+)"/)?.[1] ?? null;
  };
  const [d, mo, y] = [sel("ddlday"), sel("ddlMonth"), sel("ddlYear")];
  const date = d && mo && y ? `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}` : null;
  const area = html.slice(Math.max(0, html.indexOf('class="content-area"')));
  const items: ListItem[] = [];
  const seen = new Set<number>();
  // <li><h3 class='font104'>Ministry</h3><ul class='num'><li><a ... href='/PressReleaseDetail.aspx?PRID=n'>headline</a></li>...
  for (const block of area.split(/<h3 class='font104'>/).slice(1)) {
    const ministry = text(block.slice(0, block.indexOf("</h3>")));
    for (const m of block.matchAll(/<a[^>]*href='[^']*PRID=(\d+)'[^>]*>([\s\S]*?)<\/a>/g)) {
      const prid = Number(m[1]);
      if (seen.has(prid)) continue;
      seen.add(prid);
      items.push({ prid, ministry, headline: text(m[2]) });
    }
  }
  return { date, items };
}

export interface ParsedRelease {
  prid: number; ministry: string; headline: string; subhead: string; dateLine: string; date: string | null;
  office: string; paras: string[]; photos: string[]; langVersions: number[];
}

// what closes a release (the stars, the social-media line) or is only its furniture
const END = /^\*{3,}$|^(?:સોશિયલ મીડિયા|सोशल मीडिया|Follow us)|^\(?(?:રિલીઝ|रिलीज़|Release) ID/i;
const STAFF = /^\(?[A-Z]{1,5}(?:\s*\/\s*[A-Za-z.]{1,6}){1,5}\)?\.?$/;
const ICON = /twitter|fb|facebook|instagram|email|icon|logo|youtube|whatsapp|koo|threads/i;

/** One release page (PressReleaseIframePage.aspx). */
export function parseRelease(html: string, prid: number): ParsedRelease | null {
  const byId = (id: string, tag: string) => {
    const m = html.match(new RegExp(`<${tag}[^>]*id="${id}"[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? text(m[1]) : "";
  };
  const headline = byId("Titleh2", "h1") || byId("Titleh2", "h2");
  if (!headline) return null;
  const dateLine = byId("PrDateTime", "div").replace(/^[^\d]*/, "");
  const start = html.indexOf('id="PrDateTime"');
  const stop = (() => {
    const i = html.indexOf('class="ReleaseLang"', start);
    const j = html.indexOf('id="ReleaseId"', start);
    return Math.min(...[i, j].filter((x) => x > start), html.length);
  })();
  const body = start > 0 ? html.slice(start, stop) : "";
  const paras: string[] = [];
  for (const m of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const p = text(m[1]);
    if (!p) continue;
    if (END.test(p)) break;
    if (STAFF.test(p)) continue; // the staff's initials ("SM/BS/JD"), not text to print
    paras.push(p);
  }
  const photos = [...body.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi)]
    .filter((m) => !ICON.test(m[1]) && !/height:\s*\d{1,2}px|width:\s*\d{1,2}px/i.test(m[0]))
    .map((m) => m[1].replace(/^http:/, "https:"));
  const langBlock = html.slice(html.indexOf('class="ReleaseLang"'), html.indexOf('class="RelTag"'));
  const langVersions = html.includes('class="ReleaseLang"')
    ? [...new Set([...langBlock.matchAll(/PRID=(\d+)/g)].map((m) => Number(m[1])))].filter((n) => n !== prid) : [];
  return {
    prid, ministry: byId("MinistryName", "div"), headline, subhead: text(html.match(/id="ltrSubtitle"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ""),
    dateLine, date: isoFromDateLine(dateLine), office: dateLine.replace(/^.*?\bby\b/i, "").trim() || "PIB",
    paras, photos: [...new Set(photos)], langVersions,
  };
}

/** Width and height of a JPEG or PNG from its bytes (no decoding). */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { width: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], height: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

let lastRequest = 0;
let pagesToday = 0;
/** How long to wait on PIB: the day's own news waits (three tries, 45s each);
 * the Hindi top-up, only extra copy, doesn't hold the paper up (two, 20s). */
let patience = { tries: 3, seconds: 45 };
export async function withPatience<T>(p: { tries: number; seconds: number }, job: () => Promise<T>): Promise<T> {
  const was = patience;
  patience = p;
  try { return await job(); } finally { patience = was; }
}
/** One polite GET: a pause since the last one, a few tries with backoff. */
async function get(url: string, init: RequestInit = {}): Promise<Response> {
  if (++pagesToday > MAX_PAGES) throw new Error(`more than ${MAX_PAGES} PIB pages in one run: stopping`);
  let err: unknown;
  for (let attempt = 0; attempt < patience.tries; attempt++) {
    const wait = lastRequest + PAUSE_MS * (attempt + 1) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    try {
      const res = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(patience.seconds * 1000) });
      if (res.ok) return res;
      err = new Error(`PIB answered ${res.status} for ${url}`);
      if (res.status < 500) break;
    } catch (e) {
      err = e;
    }
  }
  throw err instanceof Error ? err : new Error(String(err));
}

/** A day's list as read through that day (the collector reads today's every
 * hour): an earlier day's comes from here, since PIB's date form is refused
 * to programs (24 Oct 2026). Each reading adds to what was saved. */
const listKey = (feed: FeedLang, date: string) => `pib-list/${feed}/${date}`;
export function savedList(store: Store, feed: FeedLang, date: string): ListItem[] | null {
  return store.setting<ListItem[] | null>(listKey(feed, date), null);
}
function saveList(store: Store, feed: FeedLang, date: string, items: ListItem[]) {
  const had = savedList(store, feed, date) ?? [];
  const seen = new Set(items.map((it) => it.prid));
  store.putSetting(listKey(feed, date), [...items, ...had.filter((it) => !seen.has(it.prid))]);
}

// ---- an earlier day nobody collected: read PIB's release pages by number ----
// Every release, in every language and office, takes the next number (some
// 1,000-1,500 a day), and each page says its day and office. So a missed day's
// lists are found by locating where its numbers start (a few pages, halving
// the gap) and reading on from there, one page a second, until the next day's.
const SCAN_PAUSE_MS = 1000;
const SCAN_PAGES = 4000; // a scan's ceiling, whatever happens
const MARGIN = 100; // pages past the day's edge read before stopping (a few come out of order)

type Peek = { date: string; feed: FeedLang | null; item: ListItem } | null;
let scanReads = 0;
/** One release page by number: its day and, when it is one of the feeds, which. */
async function peek(prid: number): Promise<Peek> {
  if (++scanReads > SCAN_PAGES) throw new Error(`more than ${SCAN_PAGES} PIB pages in one search: stopping`);
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastRequest + SCAN_PAUSE_MS * (attempt + 1) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    try {
      const res = await fetch(`${SITE}/PressReleaseIframePage.aspx?PRID=${prid}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) { if (res.status < 500) return null; continue; }
      const r = parseRelease(await res.text(), prid);
      if (!r?.date) return null; // no release under that number
      const words = `${r.headline} ${r.paras.slice(0, 3).join(" ")}`;
      const count = (re: RegExp) => (words.match(re) ?? []).length;
      const [gu, hi, en] = [count(/[\u0A80-\u0AFF]/g), count(/[\u0900-\u097F]/g), count(/[A-Za-z]/g)];
      const feed: FeedLang | null = /ahmedabad/i.test(r.office) && gu > hi && gu > en ? "gu"
        : /delhi/i.test(r.office) && hi > gu && hi > en ? "hi"
        : /delhi/i.test(r.office) && en > gu && en > hi ? "en" : null;
      return { date: r.date, feed, item: { prid, ministry: r.ministry, headline: r.headline } };
    } catch { /* once more */ }
  }
  throw new Error(`PIB isn't answering (release ${prid})`);
}
/** The day at `prid`, or the next number that has a release. */
async function dayAt(prid: number): Promise<{ prid: number; date: string }> {
  for (let p = prid; p < prid + 20; p++) {
    const got = await peek(p);
    if (got) return { prid: p, date: got.date };
  }
  throw new Error(`no PIB releases between ${prid} and ${prid + 20}`);
}

/** Every feed's list for `date` (before `later`, a day PIB's list showed,
 * whose releases start at `anchor`), saved: what the day's paper and its
 * Hindi top-up choose from. */
async function scanDay(store: Store, date: string, anchor: number, later: string,
                       opts: { log?: (s: string) => void; progress?: (p: Progress) => void }): Promise<void> {
  const log = opts.log ?? (() => {});
  scanReads = 0;
  const days = Math.max(1, Math.round((Date.parse(later) - Date.parse(date)) / 86_400_000));
  log(`PIB shows programs only today's list: finding ${date}'s releases by their numbers (one page a second)`);
  const report = (done: number, total: number) => opts.progress?.({ done, total, label: "recovering", item: date });
  report(0, 1);
  // where the day starts: back far enough to be before it, then halve the gap
  let hi = anchor;
  let span = days * 1500;
  let lo = Math.max(1, hi - span);
  while ((await dayAt(lo)).date >= date) {
    hi = lo;
    span *= 2;
    lo = Math.max(1, lo - span);
    if (lo === 1) break;
  }
  while (hi - lo > 8) {
    const mid = Math.floor((lo + hi) / 2);
    const at = await dayAt(mid);
    if (at.date < date) lo = at.prid; else hi = mid;
  }
  // then read out from there both ways, until a margin of pages is all the
  // day before (going back) or after (going on): the edges are a little ragged
  const found: Record<FeedLang, ListItem[]> = { gu: [], hi: [], en: [] };
  const estimate = Math.round((anchor - hi) / days) + 2 * MARGIN;
  let read = 0;
  const walk = async (from: number, step: 1 | -1, beyond: (d: string) => boolean) => {
    let past = 0;
    for (let p = from; p >= 1 && p < anchor && past < MARGIN; p += step) {
      report(read, Math.max(estimate, read + MARGIN));
      read++;
      const got = await peek(p);
      if (!got) continue;
      if (beyond(got.date)) { past++; continue; }
      if (got.date !== date) continue;
      past = 0;
      if (got.feed) found[got.feed].push(got.item);
    }
  };
  await walk(hi - 1, -1, (d) => d < date);
  await walk(hi, 1, (d) => d > date);
  for (const list of Object.values(found)) list.sort((a, b) => a.prid - b.prid);
  for (const feed of Object.keys(found) as FeedLang[]) saveList(store, feed, date, found[feed]);
  store.putSetting(`pib-scanned/${date}`, true);
  report(1, 1);
  log(`${date}: ${found.gu.length} Gujarati, ${found.hi.length} Hindi and ${found.en.length} English release(s) found in ${read} numbers`);
}

/** The list for one feed on `date`: today's straight off the page (and
 * saved); another day's as saved that day (collected, or found by number);
 * a day PIB hasn't reached by posting the page's own date form back. */
async function listFor(feed: FeedLang, date: string, store?: Store,
                       opts: { log?: (s: string) => void; progress?: (p: Progress) => void } = {}): Promise<ListItem[]> {
  const { reg, lang } = FEEDS[feed];
  const url = `${SITE}/allRel.aspx?reg=${reg}&lang=${lang}`;
  const res = await get(url);
  const cookie = res.headers.getSetCookie?.().map((c) => c.split(";")[0]).join("; ") ?? "";
  const html = await res.text();
  const first = parseList(html);
  if (store && first.date && first.items.length) saveList(store, feed, first.date, first.items);
  if (first.date === date) return first.items;
  const saved = store && savedList(store, feed, date);
  if (saved?.length) return saved;
  if (store && first.date && date < first.date && first.items.length) {
    if (!store.setting(`pib-scanned/${date}`, false)) {
      await scanDay(store, date, Math.min(...first.items.map((it) => it.prid)), first.date, opts);
    }
    return savedList(store, feed, date) ?? [];
  }
  // ASP.NET postback: every hidden field, the date chosen
  const form = new URLSearchParams();
  for (const m of html.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) form.set(m[1], decodeEntities(m[2]));
  const [y, mo, d] = date.split("-");
  form.set("__EVENTTARGET", "ctl00$ContentPlaceHolder1$ddlYear");
  form.set("__EVENTARGUMENT", "");
  form.set("ctl00$Bar1$ddlregion", String(reg));
  form.set("ctl00$Bar1$ddlLang", String(lang));
  form.set("ctl00$ContentPlaceHolder1$ddlMinistry", "0");
  form.set("ctl00$ContentPlaceHolder1$ddlday", String(Number(d)));
  form.set("ctl00$ContentPlaceHolder1$ddlMonth", String(Number(mo)));
  form.set("ctl00$ContentPlaceHolder1$ddlYear", y);
  const back = await get(url, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) } });
  const got = parseList(await back.text());
  if (got.date !== date) throw new Error(`PIB's ${FEEDS[feed].name} list wouldn't show ${date} (it showed ${got.date ?? "no date"})`);
  return got.items;
}

export interface PibResult { feed: FeedLang; listed: number; fetched: number; skipped: number; releases: Release[] }

/** Fetch every release on `feed`'s list for `date` that isn't stored yet,
 * with its photos. `only` limits it to those PRIDs (a Hindi top-up fetches
 * just the ones it will translate); `listOnly` returns the list unfetched. */
export async function ingestPib(store: Store, date: string, feed: FeedLang,
                                opts: { log?: (s: string) => void; only?: Set<number>; progress?: (p: Progress) => void } = {}): Promise<PibResult> {
  const log = opts.log ?? (() => {});
  pagesToday = 0;
  const items = await listFor(feed, date, store, opts);
  log(`${FEEDS[feed].name}: ${items.length} release(s) listed for ${date}`);
  const mediaDir = path.join(MEDIA_DIR, date);
  await mkdir(mediaDir, { recursive: true });
  let fetched = 0;
  let skipped = 0;
  for (const [k, it] of items.entries()) {
    if (opts.only && !opts.only.has(it.prid)) continue;
    opts.progress?.({ done: k, total: items.length, label: "reading", item: it.headline });
    if (store.hasRelease(it.prid)) { skipped++; continue; }
    if (await readRelease(store, date, feed, it, log)) fetched++;
  }
  opts.progress?.({ done: items.length, total: items.length, label: "reading" });
  return { feed, listed: items.length, fetched, skipped, releases: store.releases(date).filter((r) => r.source === "pib" && r.lang === feed) };
}

/** One release page read and stored, with its photos: what the list named
 * as `it` (a top-up reads only the ones it will translate). False if it
 * couldn't be read or isn't that day's. */
export async function readRelease(store: Store, date: string, feed: FeedLang, it: ListItem, log: (s: string) => void = () => {}): Promise<boolean> {
  const mediaDir = path.join(MEDIA_DIR, date);
  await mkdir(mediaDir, { recursive: true });
  const res = await get(`${SITE}/PressReleaseIframePage.aspx?PRID=${it.prid}`).catch((e) => {
    log(`  ${it.prid}: couldn't read it (${e instanceof Error ? e.message : e})`);
    return null;
  });
  if (!res) return false;
  const r = parseRelease(await res.text(), it.prid);
  if (!r || !r.paras.length) { log(`  ${it.prid}: no text on the page`); return false; }
  if (r.date && r.date !== date) { log(`  ${it.prid}: dated ${r.date}, not ${date}`); return false; }
  const photos: string[] = [];
  for (const [k, src] of r.photos.slice(0, 4).entries()) {
    const img = await get(src).catch(() => null);
    if (!img) continue;
    const bytes = new Uint8Array(await img.arrayBuffer());
    const size = imageSize(bytes);
    if (!size || size.width < 300 || size.height < 150) continue; // an icon, a banner strip
    const name = `p${it.prid}-${k}.${bytes[0] === 0x89 ? "png" : "jpg"}`;
    await writeFile(path.join(mediaDir, name), bytes);
    photos.push(`/media/${date}/${name}`);
  }
  const release: Release = {
    id: it.prid, date, url: `${SITE}/PressReleasePage.aspx?PRID=${it.prid}`, office: r.office,
    headline: r.headline, subhead: r.subhead, body: r.paras.join("\n\n"), photos, fetchedAt: new Date().toISOString(),
    source: "pib", lang: feed, ministry: r.ministry || it.ministry, langVersions: r.langVersions,
  };
  store.putRelease(release);
  log(`  ${it.prid}  ${release.ministry!.slice(0, 26).padEnd(26)} ${r.headline.slice(0, 60)}  (${photos.length} photo${photos.length === 1 ? "" : "s"})`);
  return true;
}

/** Just the list (no release pages): what a Hindi top-up chooses from. */
export const listPib = (date: string, feed: FeedLang, store?: Store, opts: { log?: (s: string) => void; progress?: (p: Progress) => void } = {}) => {
  pagesToday = 0;
  return listFor(feed, date, store, opts);
};
