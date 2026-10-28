// A free photo for a story the official sources gave none (the user, 29 Oct: the
// front page's lead must be fresh and have a photo; the outlets' photos are theirs,
// never copied). A free model names the story's one recognisable subject (a public
// figure, a place, a thing); English Wikipedia's article on it gives its main photo,
// used only when that photo is on Wikimedia Commons under a free licence and its own
// name or description names the subject (29 Oct: "Anthropic"'s was an office building
// named for another company). It's captioned as a file photo and credited to its author.
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Photo } from "../lib/types.ts";
import { askJson } from "./ai.ts";
import type { Written } from "./newsroom.ts";
import { storePhoto } from "./publish.ts";

type Sql = NeonQueryFunction<false, false>;
// Wikimedia asks programs to name themselves and a way to reach them
const UA = "CapitalKranti-news/1.0 (https://capital-kranti.vercel.app; news photos from Wikimedia Commons)";
const FREE = /^(cc0|cc[ -]by(-sa)?( \d(\.\d)?)?|public domain|pd\b|pd-)/i;

export interface FreePhoto { photo: Photo; caption: { gu: string; en: string; hi: string } }
interface Subject { title: string; gu: string; en: string; hi: string }

const ASK = `You pick the photo subject for a news story on an Indian news website.
Name the ONE subject a reader would recognise in a photo and that the story is mainly about:
a well-known public figure (head of state or government, minister, party leader, famous sportsperson or artist),
a city or landmark, or a thing (a rocket, a ship, a train). Not a company or an organisation.
Never a private person, a victim, someone accused of a crime, a child, or a dead person's body.
Give the exact title of its English Wikipedia article, and its name in Gujarati, English and Hindi.
If the story has no such subject, or you are not sure of the article, answer {"title": ""}.
Reply with JSON only: {"title": "", "gu": "", "en": "", "hi": ""}`;

async function subjectOf(sql: Sql, w: Written): Promise<Subject | null> {
  const res = await askJson(sql, { system: ASK, user: `${w.headline}\n${w.deck}\n\n${w.body.slice(0, 1500)}`, maxTokens: 300 }, (v) => {
    const x = v as Partial<Subject>;
    if (typeof x?.title !== "string") return null;
    return { title: x.title.trim(), gu: (x.gu ?? "").trim(), en: (x.en ?? "").trim(), hi: (x.hi ?? "").trim() };
  });
  return res.ok && res.value.title && res.value.gu ? res.value : null;
}

const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** The article's main photo, when it's a free one on Commons: its address (1600 px wide) and its credit. */
export async function leadPhoto(title: string): Promise<{ url: string; credit: string } | null> {
  const get = async (u: string) => {
    const r = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
    return r.ok ? r.json() : null;
  };
  const page = (await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`)) as
    { type?: string; originalimage?: { source?: string } } | null;
  const src = page?.originalimage?.source;
  // only Commons: a photo kept on English Wikipedia itself may be someone's, used there as "fair use"
  if (!page || page.type !== "standard" || !src || !src.includes("/wikipedia/commons/")) return null;
  const file = decodeURIComponent(new URL(src).pathname.split("/").pop()!);
  if (!/\.(jpe?g|png|webp)$/i.test(file)) return null;
  const q = new URLSearchParams({ action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1600", format: "json", origin: "*" });
  const info = (await get(`https://commons.wikimedia.org/w/api.php?${q}`)) as
    { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; url?: string; extmetadata?: Record<string, { value?: string }> }[] }> } } | null;
  const ii = Object.values(info?.query?.pages ?? {})[0]?.imageinfo?.[0];
  const meta = ii?.extmetadata ?? {};
  const licence = plain(meta.LicenseShortName?.value ?? "");
  if (!ii || !FREE.test(licence)) return null;
  // the photo itself must be of the subject: a word of its name in the file's name or description
  const bare = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const about = bare(`${file} ${plain(meta.ImageDescription?.value ?? "")} ${plain(meta.ObjectName?.value ?? "")}`);
  if (!bare(title).split(/[\s_(),-]+/).some((word) => word.length >= 4 && about.includes(word))) return null;
  const artist = plain(meta.Artist?.value ?? "").slice(0, 80) || "Wikimedia Commons";
  return { url: ii.thumburl ?? ii.url!, credit: `${artist}, ${licence}, Wikimedia Commons` };
}

/** A file photo of the story's subject, stored like the official ones; null when there's no fit. */
export async function freePhoto(sql: Sql, w: Written, storyId: string): Promise<FreePhoto | null> {
  try {
    const who = await subjectOf(sql, w);
    if (!who) return null;
    const found = await leadPhoto(who.title);
    if (!found) return null;
    const stored = await storePhoto(sql, found.url, storyId, UA);
    if (!stored) return null;
    return {
      photo: { ...stored, credit: found.credit },
      caption: { gu: `ફાઇલ ફોટો: ${who.gu}`, en: `File photo: ${who.en || who.title}`, hi: `फ़ाइल फ़ोटो: ${who.hi || who.en || who.title}` },
    };
  } catch {
    return null;
  }
}
