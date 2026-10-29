// Aavtikal's pictures looked at before they are used (the user, 30 Oct: "the ai is selecting unrelated and very bad
// images. lead image of article should be really high quality and accurate"). Until then the writer chose them from
// their descriptions alone, and Mistral's new model got a robot hand, Google's glasses an office building, a Chinese
// chip an NVIDIA one. Now Gemini Flash Lite (it sees pictures; 500 free requests a day) looks at every picture on offer
// and says what it really shows, whether it shows the article's subject itself, and how it would do at the top. The
// top picture must show the subject itself, be a photo or an illustration (not a chart, a screenshot, a logo or words),
// score 7 of 10 or more, and be large: an official one 1200 px wide or more, a Commons one 1600 (shown 1920 wide).
// An article with no such picture isn't written (its subject is set aside); unrelated pictures are never offered.
import type { NeonQueryFunction } from "@neondatabase/serverless";
import sharp from "sharp";
import { askGemini, type GeminiImage } from "./ai.ts";
import { UA } from "./fetch.ts";
import { commonsAt, UA as WIKI_UA } from "./wikiphoto.ts";

type Sql = NeonQueryFunction<false, false>;

/** A picture on offer: an official page's (stored in the site's own store, credited to its site) or a free-licence
 *  one from Wikimedia Commons (shown from Wikimedia's servers: it has its size, its original's width and its credit). */
export interface Picture { n: number; url: string; alt: string; from: string; credit?: string; width?: number; height?: number; full?: number }

interface Seen { n: number; about: string; shows: string; kind: string; cover: number }
export interface Looked { pics: Picture[]; cover: Picture | null; why: string }

const COVER_MIN = { official: 1200, commons: 1600 };
const isCommons = (p: Picture) => !!(p.full && p.width && p.height);

const LOOK = `You are the picture editor of Aavtikal, a Gujarati magazine of long explainers on AI, technology and science.
You get an article's subject and the pictures on offer, each after a line naming it. Look at each picture itself and say:
- "about": what it actually shows, in one plain English sentence (what you see, not what its description claims);
- "shows": "subject" if it shows the article's subject itself: the very product, device or chip, the model's or company's own
  launch image for it, the mission, spacecraft or instrument, the place, the people or the phenomenon the article is about;
  "related" if it shows something the article explains or names (a part of it, the technology inside it, a person in it)
  and would help a reader understand; "unrelated" otherwise: a generic picture of the field (a robot hand or a server room
  for any AI story, a circuit board for any chip), an office building, another company's product, anything else;
- "kind": "photo", "illustration" (a drawing, render or artwork), "diagram", "chart", "screenshot", "logo" or "text" (mostly words);
- "cover": 0 to 10, how good it would be across the top of the article: 9-10 only for a sharp, well-composed, striking picture
  of the subject itself; 0-3 for anything blurry, small, cluttered, mostly words, a logo, a screenshot, a chart or a diagram,
  or not the subject itself.
Be strict: a reader must see at once that the top picture belongs to this article.
Reply with JSON only: {"pictures":[{"n":1,"about":"","shows":"subject","kind":"photo","cover":0}]}`;

/** A small copy of a picture for Gemini to look at, and its full width (a Commons one's original; an official one's own). */
async function small(p: Picture): Promise<{ jpeg: string; full: number } | null> {
  try {
    const url = isCommons(p) ? commonsAt(p as Picture & { width: number; height: number; full: number }, 960).url : p.url;
    const res = await fetch(url, { headers: { "user-agent": isCommons(p) ? WIKI_UA : UA }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const img = sharp(Buffer.from(await res.arrayBuffer())).rotate();
    const meta = await img.metadata();
    const jpeg = await img.resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    return { jpeg: jpeg.toString("base64"), full: isCommons(p) ? p.full! : meta.width ?? 0 };
  } catch {
    return null;
  }
}

/** The pictures looked at: the unrelated ones, logos and pages of words left out, the rest described as they really are,
 *  and the best one for the top (null, with the reason, when none is good enough). "busy" when Gemini can't look now. */
export async function look(sql: Sql, subject: string, pics: Picture[], log: (s: string) => void): Promise<Looked | "busy"> {
  const images: GeminiImage[] = [];
  const shown: Picture[] = [];
  for (const p of pics) {
    const s = await small(p);
    // Wikimedia asks programs not to rush it (29 Oct: bursts were refused)
    if (isCommons(p)) await new Promise((r) => setTimeout(r, 250));
    if (!s) continue;
    const q = { ...p, full: s.full };
    shown.push(q);
    images.push({ label: `PICTURE ${p.n} (from ${p.from}, ${s.full} px wide; its description: ${p.alt || "none"})`, jpeg: s.jpeg });
  }
  if (!images.length) return { pics: [], cover: null, why: "no picture could be fetched" };
  const res = await askGemini(sql, "lite", { system: LOOK, user: `SUBJECT: ${subject}`, images, maxTokens: 4000, temperature: 0.1 }, (v) => {
    const x = (v as { pictures?: Partial<Seen>[] })?.pictures;
    return Array.isArray(x) && x.length ? x.map((y) => ({ n: Number(y.n), about: String(y.about ?? "").slice(0, 200), shows: String(y.shows ?? ""), kind: String(y.kind ?? ""), cover: Number(y.cover) || 0 })) : null;
  });
  if (!res.ok) { log(`  the pictures weren't looked at (${res.why.slice(0, 120)})`); return "busy"; }
  const seen = new Map(res.value.map((x) => [x.n, x]));
  const kept: Picture[] = [];
  const tops: { p: Picture; score: number }[] = [];
  for (const p of shown) {
    const x = seen.get(p.n);
    if (!x || x.shows === "unrelated" || ["logo", "text"].includes(x.kind)) continue;
    kept.push({ ...p, alt: x.about || p.alt });
    if (x.shows === "subject" && ["photo", "illustration"].includes(x.kind) && x.cover >= 7
      && (p.full ?? 0) >= (isCommons(p) ? COVER_MIN.commons : COVER_MIN.official)) tops.push({ p: { ...p, alt: x.about || p.alt }, score: x.cover });
  }
  tops.sort((a, b) => b.score - a.score || (b.p.full ?? 0) - (a.p.full ?? 0));
  const best = [...seen.values()].filter((x) => shown.some((p) => p.n === x.n)).sort((a, b) => b.cover - a.cover)[0];
  log(`  pictures looked at: ${shown.length}, ${kept.length} fit the article${tops[0] ? `; the top one: ${tops[0].p.alt.slice(0, 90)}` : ""}`);
  return {
    pics: kept, cover: tops[0]?.p ?? null,
    why: tops[0] ? "" : best ? `the best was "${best.about.slice(0, 90)}" (${best.shows}, ${best.kind}, ${best.cover}/10)` : "none was looked at",
  };
}
