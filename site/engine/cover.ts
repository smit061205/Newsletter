// Aavtikal's pictures looked at before they are used (the user, 30 Oct: "the ai is selecting unrelated and very bad
// images. lead image of article should be really high quality and accurate"). Until then the writer chose them from
// their descriptions alone, and Mistral's new model got a robot hand, Google's glasses an office building, a Chinese
// chip an NVIDIA one. Now Gemini Flash Lite (it sees pictures; 500 free requests a day) looks at every picture on offer
// and says what it really shows, whether it shows the article's subject itself, and how it would do at the top. The
// top picture must show the subject itself, be a photo or an illustration (not a chart, a screenshot, a logo or words),
// score 7 of 10 or more, and be large.
// (Real isn't enough: a US shuttle went on an article about China's spaceplane, Nvidia's cards on a Chinese chip's, so a look-alike
// counts as unrelated. NASA's pictures are shown from NASA's servers, taking none of the day's uploads.)
// The user, 30 Oct, later: "i want real images with accuracy to the topic and high quality. not this ai generated slop".
// Covers are real pictures only: nothing drawn, nothing that looks made by an image generator. The top one is a landscape
// photo 1200 px wide or more (of the subject itself first, then of something the article names); an official launch
// image counts for its own subject. When the first pictures have none, Commons and NASA are searched more widely.
// An article with no such picture isn't written (its subject is set aside); unrelated pictures are never offered.
import type { NeonQueryFunction } from "@neondatabase/serverless";
import sharp from "sharp";
import { askGemini, askJson, type GeminiImage } from "./ai.ts";
import { UA } from "./fetch.ts";
import { commonsAt, commonsSearch, UA as WIKI_UA } from "./wikiphoto.ts";

type Sql = NeonQueryFunction<false, false>;

/** A picture on offer: an official page's (stored in the site's own store, credited to its site) or a free-licence
 *  one from Wikimedia Commons (shown from Wikimedia's servers: it has its size, its original's width and its credit). */
export interface Picture { n: number; url: string; alt: string; from: string; credit?: string; width?: number; height?: number; full?: number; official?: boolean; hotlink?: boolean }

interface Seen { n: number; about: string; shows: string; kind: string; cover: number; other: boolean }
/** `covers`: the pictures fit for the top, best first. `refused`: the addresses of those seen and found not to belong. */
export interface Looked { pics: Picture[]; covers: Picture[]; refused: string[]; why: string }

const COVER_WIDE = 1200, COVER_SHARP = 1600, COVER_RATIO = 1.2;
const isCommons = (p: Picture) => !!(p.full && p.width && p.height);

const LOOK = `You are the picture editor of Aavtikal, a Gujarati magazine of long explainers on AI, technology and science.
You get an article's subject and the pictures on offer, each after a line naming it. Look at each picture itself and say:
- "about": what it actually shows, in one plain English sentence (what you see, not what its description claims);
- "shows": "subject" if it shows the article's subject itself: the very product, device or chip, the model's or company's own
  launch image for it, the mission, spacecraft or instrument, the place, the people or the phenomenon the article is about;
  "related" only if it truly belongs to the subject and can't mislead: a part of it, the technology inside it, its own maker's
  people, lab or hardware, the rocket or site it uses; "unrelated" otherwise: anything a reader could take for the subject but
  isn't (a rival's or a similar product, another country's spacecraft, another company's chip, even one the article compares
  it with), a generic picture of the field (a robot hand or a server room for any AI story, a circuit board for any chip), an
  office building, anything else;
- "kind": "photo" (taken by a camera of something real), "illustration" (a drawing, render or artwork), "generated" (it looks
  made by an AI image generator, or is a glossy stock render: glowing brains, faces of light, robot hands, floating circuits),
  "diagram", "chart", "screenshot", "logo" or "text" (mostly words);
- "other": true if it shows anything made, flown or owned by someone else than the subject's own maker or owner, whatever the
  article says about it (Nvidia hardware for an article on Iluvatar's chip, a US shuttle for an article on China's spaceplane, a
  rival's product it is compared with), or a different product of the same kind that you can't tell is the subject's; else false;
- "cover": 0 to 10, how good it would be across the top of the article: 9-10 only for a sharp, well-composed, striking picture
  of the subject itself; 7-8 for a sharp, well-composed picture of something the article names; 0-3 for anything blurry, small,
  cluttered, mostly words, a logo, a screenshot, a chart or a diagram.
Be strict: a reader must see at once that the top picture belongs to this article.
Reply with JSON only: {"pictures":[{"n":1,"about":"","shows":"subject","kind":"photo","other":false,"cover":0}]}`;

/** A small copy of a picture for Gemini to look at, and its full width (a Commons one's original; an official one's own). */
async function small(p: Picture): Promise<{ jpeg: string; full: number; ratio: number; width: number; height: number } | null> {
  try {
    const url = isCommons(p) ? commonsAt(p as Picture & { width: number; height: number; full: number }, 960).url : p.url;
    const res = await fetch(url, { headers: { "user-agent": isCommons(p) ? WIKI_UA : UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const img = sharp(Buffer.from(await res.arrayBuffer())).rotate();
    const meta = await img.metadata();
    const jpeg = await img.resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    const ratio = isCommons(p) ? p.width! / p.height! : (meta.width ?? 0) / (meta.height || 1);
    return { jpeg: jpeg.toString("base64"), full: isCommons(p) ? p.full! : meta.width ?? 0, ratio, width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch {
    return null;
  }
}

/** How a picture does for the top: 0 not fit, else higher is better (3 a photo of the subject, 2 an official image of it, 1 a
 *  photo of something the article names). Across the top it must be landscape and large, and real. */
export function coverTier(x: { shows: string; kind: string; cover: number; other?: boolean }, p: { full: number; ratio: number; official: boolean }): number {
  if (x.other || x.cover < 7 || p.full < COVER_WIDE || p.ratio < COVER_RATIO) return 0;
  if (x.kind === "photo") return x.shows === "subject" ? 3 : x.shows === "related" ? 1 : 0;
  return x.kind === "illustration" && x.shows === "subject" && p.official ? 2 : 0;
}

/** The pictures looked at: the unrelated ones, logos and pages of words left out, the rest described as they really are,
 *  and the best one for the top (null, with the reason, when none is good enough). "busy" when Gemini can't look now. */
export async function look(sql: Sql, subject: string, pics: Picture[], log: (s: string) => void): Promise<Looked | "busy"> {
  const images: GeminiImage[] = [];
  const shown: Picture[] = [];
  const ratios = new Map<number, number>();
  for (const p of pics) {
    const s = await small(p);
    // Wikimedia asks programs not to rush it (29 Oct: bursts were refused)
    if (isCommons(p)) await new Promise((r) => setTimeout(r, 250));
    if (!s) continue;
    // (a picture shown from its own server needs its size, as a Commons one has)
    const q = p.hotlink ? { ...p, full: s.full, width: s.width, height: s.height } : { ...p, full: s.full };
    shown.push(q);
    ratios.set(p.n, s.ratio);
    images.push({ label: `PICTURE ${p.n} (from ${p.from}, ${s.full} px wide; its description: ${p.alt || "none"})`, jpeg: s.jpeg });
  }
  if (!images.length) return { pics: [], covers: [], refused: [], why: "no picture could be fetched" };
  const res = await askGemini(sql, "lite", { system: LOOK, user: `SUBJECT: ${subject}`, images, maxTokens: 4000, temperature: 0.1 }, (v) => {
    const x = (v as { pictures?: Partial<Seen>[] })?.pictures;
    return Array.isArray(x) && x.length ? x.map((y) => ({ n: Number(y.n), about: String(y.about ?? "").slice(0, 200), shows: String(y.shows ?? ""), kind: String(y.kind ?? ""), cover: Number(y.cover) || 0, other: y.other === true })) : null;
  });
  if (!res.ok) { log(`  the pictures weren't looked at (${res.why.slice(0, 120)})`); return "busy"; }
  const seen = new Map(res.value.map((x) => [x.n, x]));
  const kept: Picture[] = [];
  const refused: string[] = [];
  const tops: { p: Picture; tier: number; score: number }[] = [];
  for (const p of shown) {
    const x = seen.get(p.n);
    if (!x) continue;
    if (x.shows === "unrelated" || ["logo", "text", "generated"].includes(x.kind)) { refused.push(p.url); continue; }
    kept.push({ ...p, alt: x.about || p.alt });
    const tier = coverTier(x, { full: p.full ?? 0, ratio: ratios.get(p.n) ?? 0, official: !!p.official });
    if (tier) tops.push({ p: { ...p, alt: x.about || p.alt }, tier, score: x.cover });
  }
  // the most truly about the subject first; among those a large one, then the better one
  const large = (p: Picture) => Number((p.full ?? 0) >= COVER_SHARP);
  tops.sort((a, b) => b.tier - a.tier || large(b.p) - large(a.p) || b.score - a.score || (b.p.full ?? 0) - (a.p.full ?? 0));
  const best = [...seen.values()].filter((x) => shown.some((p) => p.n === x.n)).sort((a, b) => b.cover - a.cover)[0];
  log(`  pictures looked at: ${shown.length}, ${kept.length} fit the article${tops[0] ? `; the top one: ${tops[0].p.alt.slice(0, 90)}` : ""}`);
  return {
    pics: kept, covers: tops.map((t) => t.p), refused,
    why: tops[0] ? "" : best ? `the best was "${best.about.slice(0, 90)}" (${best.shows}, ${best.kind}, ${best.cover}/10)` : "none was looked at",
  };
}

const FIND = `You find real photographs for a magazine article, in a library searched by name. Give 6 short English search phrases, 1 to 4
words each. First the exact proper names: the product, mission or spacecraft; the company, lab or agency; its best-known leaders or
scientists by full name; the rocket, site or machine it uses. Then what a camera could photograph of it (the device, instrument or
place). Plain names work best ("OpenAI", "Sam Altman", "Dragonfly Titan rotorcraft"), never descriptions like "OpenAI office
interior", and no abstract words like "technology" or "future".
Reply with JSON only: {"phrases":["","","","","",""]}`;

/** NASA's image library (free of copyright, its own terms: no key): pictures of a space or science subject, the large copy
 *  of each, leaving out any it credits to a news agency. Shown from NASA's servers. */
export async function nasaPictures(query: string, max = 4): Promise<Omit<Picture, "n">[]> {
  const get = async (u: string) => {
    const r = await fetch(u, { headers: { "user-agent": WIKI_UA }, signal: AbortSignal.timeout(15_000) });
    return r.ok ? r.json() as Promise<unknown> : null;
  };
  try {
    const q = new URLSearchParams({ q: query, media_type: "image", page_size: "10" });
    const found = await get(`https://images-api.nasa.gov/search?${q}`) as { collection?: { items?: { href?: string; data?: { title?: string; description?: string; secondary_creator?: string }[] }[] } } | null;
    const out: Omit<Picture, "n">[] = [];
    for (const item of found?.collection?.items ?? []) {
      if (out.length >= max) break;
      const d = item.data?.[0];
      if (!d || !item.href || /getty|reuters|associated press|\bafp\b|\bap photo\b/i.test(`${d.secondary_creator} ${d.description}`)) continue;
      const files = await get(item.href) as string[] | null;
      const url = files?.find((f) => /~large\.jpe?g$/i.test(f));
      if (!url) continue;
      const who = (d.secondary_creator ?? "").slice(0, 60);
      out.push({ url: url.replace(/^http:/, "https:"), alt: (d.title ?? "").slice(0, 140), from: /nasa/i.test(who) ? who : who ? `NASA / ${who}` : "NASA", official: true, hotlink: true });
    }
    return out;
  } catch {
    return [];
  }
}

/** More pictures for a subject the first look found no cover for: Commons searched for what a camera could have taken, and
 *  NASA's library for science and space. Only large landscape ones, each search represented, numbered after those on offer. */
async function findMore(sql: Sql, subject: string, beat: string, have: Picture[], log: (s: string) => void): Promise<Picture[]> {
  const res = await askJson(sql, { system: FIND, user: subject, maxTokens: 300 }, (v) => {
    const x = (v as { phrases?: unknown[] })?.phrases;
    return Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 6) : null;
  });
  const phrases = res.ok ? res.value : [subject.split(/\s+/).slice(0, 5).join(" ")];
  log(`  looking wider for a real picture: ${phrases.join("; ")}`);
  const lists: Omit<Picture, "n">[][] = [];
  for (const q of phrases) {
    const hits = await commonsSearch(q, 20);
    lists.push(hits.filter((h) => h.full >= COVER_WIDE && h.width / h.height >= COVER_RATIO).map((h) => ({ ...h, from: "Wikimedia Commons" })));
    if (beat === "science" || beat === "tech") lists.push(await nasaPictures(q));
  }
  const seen = new Set(have.map((p) => p.url));
  const out: Omit<Picture, "n">[] = [];
  for (let i = 0; out.length < 18 && lists.some((l) => l[i]); i++) {
    for (const l of lists) if (l[i] && out.length < 18 && !seen.has(l[i].url)) { seen.add(l[i].url); out.push(l[i]); }
  }
  const last = Math.max(0, ...have.map((p) => p.n));
  return out.map((p, i) => ({ ...p, n: last + i + 1 }));
}

/** The pictures on offer looked at and, when none does for the top, a wider search looked at too. */
export async function lookWide(sql: Sql, subject: string, beat: string, pics: Picture[], log: (s: string) => void): Promise<Looked | "busy"> {
  const first = pics.length ? await look(sql, subject, pics, log) : { pics: [], covers: [], refused: [], why: "none on offer" } as Looked;
  if (first === "busy" || first.covers.length) return first;
  const more = await findMore(sql, subject, beat, pics, log);
  if (!more.length) return first;
  const next = await look(sql, subject, more, log);
  if (next === "busy") return "busy";
  return { pics: [...first.pics, ...next.pics], covers: next.covers, refused: [...first.refused, ...next.refused], why: next.why || first.why };
}
