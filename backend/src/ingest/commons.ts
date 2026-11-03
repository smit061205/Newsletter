// Photos for the 8-page paper's own pages (the editor, 4 Nov): a news outlet's
// photos are never printed, so a section story without one of its own (a PIB
// release's, NASA's) may be given a file photo of the one person (or named
// place) it is about -- never a search's guess: the 4 Nov test printed Irrfan
// Khan for Anil Ambani, a world map for a coral study and an old painting for
// a film. A wrong photo is worse than none, so a photo prints only when it is:
//
//   1. the person's (or place's) own photo: the one heading their Wikipedia
//      article, the article found by their exact name and confirmed by what the
//      AI that chose the news says they are ("Indian businessman"), never a
//      photo matched by words
//   2. free to print: from Wikimedia Commons, with a free licence, its author
//      and licence printed under it as the licence asks
//   3. big and recent enough: 800 pixels wide or more; a living person's taken
//      this century
//   4. looked at by an AI before it prints: a real, sharp photograph of one
//      main subject that fits the news (not a logo, seal, map, painting, poster
//      or document)
//   5. once in a paper (editorial/sections.ts)
//
// Read only where Wikimedia's robots rules allow programs: the article search
// and the file's sizes from its API site (api.wikimedia.org), the author,
// licence and date from the photo's own page (commons.wikimedia.org/wiki/File:...),
// never the /w/ pages its robots rules keep programs out of.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import { profile } from "../profile.ts";
import type { Store } from "../store.ts";
import { env, openRouter } from "../editorial/rewrite.ts";
import { decodeEntities, imageSize } from "./pib.ts";
import { allowed } from "./sections.ts";

const API = "https://api.wikimedia.org/core/v1";
const UA = "CapitalKranti-news/1.0 (https://github.com/smit061205/Newsletter)";
/** The widest it's fetched at and the size the AI looks at (Wikimedia makes its thumbnails at set widths
 * only: 640 is turned away, 4 Nov); the least it may be: a 2-column photo at 150 ppi (the layout never
 * prints it wider than it's sharp: layout/module.ts leastPpi). */
const WANT = 1280, LOOK = 500, LEAST = 542;
/** Licences that let the paper print a photo (with its credit); GODL-India: the Government of India's own photos. */
const FREE = /^(public domain|pd\b|cc0|cc[- ]by(-sa)?[- ]\d|godl)/i;

/** What the photo is to show: a person or named place, as the AI that chose the news names it. */
export interface Subject {
  /** the name, in English, as Wikipedia has it */
  name: string;
  /** what they are, as Wikipedia would say ("Indian cricketer", "cricket stadium in Ahmedabad") */
  is: string;
}
export interface FilePhoto { url: string;
  /** who took it and its licence, as Commons gives them (in English) */
  author: string; licence: string }

let queue = Promise.resolve();
/** One request at a time to Wikimedia; told to slow down (429), it waits and asks again. */
function get(url: string): Promise<Response | null> {
  const once = () => fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
  const run = queue.then(async () => {
    for (let wait = 2000; ; wait *= 2) {
      const res = await once();
      if (res?.status !== 429 && res?.status !== 503 || wait > 16_000) return res;
      await new Promise((r) => setTimeout(r, Number(res.headers.get("retry-after")) * 1000 || wait));
    }
  });
  queue = run.then(() => new Promise((r) => setTimeout(r, 500)));
  return run;
}

const plain = (html: string) => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const words = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
/** A name as compared: lower case, no accents, no "(cricketer)" after it. */
const bare = (s: string) => words(s.replace(/\(.*?\)/g, "")).join(" ");
// (words in a description that don't tell one person from another of the same name)
const COMMON = new Set(["indian", "born", "the", "and", "from", "who", "india", "former", "american", "british", "national", "since", "of"]);
/** What someone does, in kinds: "Indian politician" and "Prime Minister of India since 2014" are one kind. */
const KINDS: RegExp[] = [
  /politic|minister|prime|chief|president|governor|leader|member|parliament|mla|mp\b|mayor|speaker|official|diplomat|bureaucrat|civil servant/,
  /cricket|batter|batsman|bowler|player|athlet|footbal|hockey|tennis|badminton|boxer|wrestler|judoka|shooter|sprinter|swimmer|chess|olympi|sport|coach|captain/,
  /actor|actress|film|director|producer|singer|musician|composer|model|comedian|television|presenter|dancer|rapper|screenwriter|lyricist/,
  /business|industrialist|executive|entrepreneur|chairman|investor|banker|founder|ceo|economist|tycoon/,
  /scientist|engineer|researcher|astronaut|physicist|astronomer|technologist|computer/,
  /stadium|ground|arena|building|temple|palace|fort|bridge|dam|airport|station|monument|tower/,
];
const kindsOf = (s: string) => KINDS.flatMap((k, i) => (k.test(s.toLowerCase()) ? [i] : []));

/** A file photo of `subject` for the story headed `headline`, saved with the day's media; null when none passes. */
export async function filePhoto(store: Store, date: string, subject: Subject, headline: string, log: (s: string) => void): Promise<FilePhoto | null> {
  if (!subject.name.trim()) return null;
  // (the same person looked for again: the same answer, nothing fetched or paid for twice)
  const key = `commons3|${bare(subject.name)}|${bare(subject.is)}`;
  const had = store.fitted(key);
  if (had) return had.body ? (JSON.parse(had.body) as FilePhoto) : null;
  const got = await find(subject, headline, date).catch((e: unknown) => ({ photo: null, why: `couldn't be looked for (${e instanceof Error ? e.message : e})` }));
  log(got.photo ? `    a photo of ${subject.name}` : `    no photo of ${subject.name}: ${got.why}`);
  // (a failure to reach Wikimedia or the AI isn't kept: the next paper tries again)
  if (got.photo || !/couldn't/.test(got.why)) store.putFitted(key, { body: got.photo ? JSON.stringify(got.photo) : "", model: "commons" });
  return got.photo;
}

async function find(subject: Subject, headline: string, date: string): Promise<{ photo: FilePhoto | null; why: string }> {
  // 1. their Wikipedia article, by their exact name, and the photo heading it
  const res = await get(`${API}/wikipedia/en/search/title?q=${encodeURIComponent(subject.name)}&limit=5`);
  if (!res?.ok) return { photo: null, why: "Wikipedia couldn't be searched" };
  const pages = ((await res.json()) as { pages?: { title: string; description?: string | null; thumbnail?: { url: string } | null }[] }).pages ?? [];
  const page = pages.find((p) => bare(p.title) === bare(subject.name));
  if (!page) return { photo: null, why: "no Wikipedia article of that name" };
  // (the one meant: what Wikipedia says they are shares a telling word with what the AI says)
  const is = words(subject.is).filter((w) => !COMMON.has(w));
  const desc = words(page.description ?? "").filter((w) => !COMMON.has(w));
  const stem = (w: string) => w.slice(0, 5);
  const same = is.some((w) => desc.some((d) => stem(d) === stem(w))) || kindsOf(subject.is).some((k) => kindsOf(page.description ?? "").includes(k));
  if (!same) {
    return { photo: null, why: `Wikipedia's ${page.title} is "${page.description ?? "?"}", not "${subject.is}"` };
  }
  // (a photo on Commons: one kept on Wikipedia itself is a film poster or a logo, not free)
  const file = page.thumbnail?.url.match(/\/wikipedia\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)\//)?.[1];
  if (!file) return { photo: null, why: "its article has no free photo" };
  const title = `File:${decodeURIComponent(file)}`;
  if (!/\.(jpe?g|png)$/i.test(title)) return { photo: null, why: "its photo isn't a photograph file" };
  // 2. big enough, and free
  const info = await get(`${API}/commons/file/${encodeURIComponent(title)}`);
  const o = info?.ok ? ((await info.json()) as { original?: { url: string; width: number; height: number } }).original : undefined;
  if (!o) return { photo: null, why: "its photo's size couldn't be read" };
  if (o.width < LEAST || o.width / o.height > 2.2 || o.width / o.height < 0.55) return { photo: null, why: `its photo is ${o.width} x ${o.height}: too small or an odd shape` };
  const pageUrl = `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  if (!(await allowed(pageUrl))) return { photo: null, why: "its photo's page is closed to programs" };
  const filePage = await get(pageUrl);
  const html = filePage?.ok ? await filePage.text() : "";
  const licence = plain(html.match(/licensetpl(?:&#95;|_)short"[^>]*>([^<]*)/)?.[1] ?? "");
  if (!FREE.test(licence)) return { photo: null, why: `its photo's licence (${licence || "none given"}) doesn't let us print it` };
  const cell = (id: string) => plain(html.match(new RegExp(`fileinfotpl(?:&#95;|_)${id}"[^>]*>[\\s\\S]*?</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`))?.[1] ?? "");
  const artist = cell("aut").replace(/\s*Parent institution.*$/i, "").slice(0, 60);
  // 3. recent enough: a living person's photo of this century
  const taken = Number(cell("date").match(/\b(1[89]\d\d|20\d\d)\b/)?.[1] ?? 0);
  if (taken && taken < 2000 && !/\b(died|\d{4}\s*[-–]\s*\d{4})\b/i.test(page.description ?? "")) return { photo: null, why: `its photo was taken in ${taken}` };
  // 4. looked at before it prints
  const thumb = (w: number) => o.url.replace(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/commons)\/([0-9a-f]\/[0-9a-f]{2})\/([^?]+).*$/, `$1/thumb/$2/$3/${w}px-$3`);
  const small = await get(o.width > LOOK ? thumb(LOOK) : o.url);
  if (!small?.ok) return { photo: null, why: "its photo couldn't be fetched" };
  const verdict = await look(new Uint8Array(await small.arrayBuffer()), subject, headline);
  if (!verdict.ok) return { photo: null, why: `the AI looked at it: ${verdict.reason}` };
  const img = await get(o.width > WANT ? thumb(WANT) : o.url);
  if (!img?.ok) return { photo: null, why: "its photo couldn't be fetched" };
  const bytes = new Uint8Array(await img.arrayBuffer());
  const size = imageSize(bytes);
  if (!size || size.width < LEAST) return { photo: null, why: "its photo came smaller than it said" };
  const dir = path.join(MEDIA_DIR, date);
  await mkdir(dir, { recursive: true });
  const name = `commons-${hash(title)}.${bytes[0] === 0x89 ? "png" : "jpg"}`;
  await writeFile(path.join(dir, name), bytes);
  // (the credit the licence asks for: who took it, and the licence)
  return { photo: { url: `/media/${date}/${name}`, author: artist, licence }, why: "" };
}

/** The AI's look at a photo before it prints: a real, sharp photograph of the subject's kind, fit for the news? */
async function look(img: Uint8Array, subject: Subject, headline: string): Promise<{ ok: boolean; reason: string }> {
  const key = env("OPENROUTER_API_KEY");
  if (!key) return { ok: false, reason: "no AI key to look at it" };
  const model = env("OPENROUTER_VISION_MODEL") ?? profile.editorial.leadModel;
  const place = /stadium|building|temple|place|city|bridge|dam|airport|station|monument|palace|fort|river|lake/i.test(subject.is);
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0, usage: { include: true },
      response_format: { type: "json_schema", json_schema: { name: "photo_check", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["ok", "reason"],
        properties: { ok: { type: "boolean", description: "true only if every condition holds" },
                      reason: { type: "string", description: "in a few words, why not (or 'fine')" } },
      } } },
      messages: [{ role: "user", content: [
        { type: "text", text: `A Gujarati newspaper wants to print this file photo with a news story headed "${headline}". ` +
          `It is meant to show ${subject.name} (${subject.is}). Say ok only if ALL of these hold: ` +
          `it is a real photograph (not a logo, seal, emblem, map, chart, drawing, painting, poster, screenshot or document); ` +
          `its main subject is ${place ? "the place, as described" : "one person, the face clearly visible, consistent with the description (not a crowd or a group where it's unclear who is meant)"}; ` +
          `it is sharp, well lit and decent to print large; nothing in it would embarrass or mislead a reader of this news. ` +
          `You are not asked who the person is.` },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(img).toString("base64")}` } },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const out = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as { ok: boolean; reason: string };
  return { ok: !!out.ok, reason: out.reason || "not fit to print" };
}

/** The credit under a file photo, in the paper's language: Gujarati letters for a Gujarati paper (4 Nov: the
 * credit printed in English under a Gujarati story), the licence in its own words and the paper's digits. */
export async function creditOf(store: Store, photo: FilePhoto): Promise<string> {
  if (profile.language.lang !== "gu") return `${photo.author ? `${photo.author}, ` : ""}${photo.licence} / Wikimedia Commons`;
  const { localDigits } = await import("../chrome/chrome.ts");
  const ver = photo.licence.match(/\d+(\.\d+)?/)?.[0] ?? "";
  const licence = /^(public domain|pd\b|cc0)/i.test(photo.licence) ? "મુક્ત ઉપયોગ"
    : /^godl/i.test(photo.licence) ? "ભારત સરકારનું ઓપન ડેટા લાઇસન્સ"
    : `ક્રિએટિવ કૉમન્સ ${/-sa/i.test(photo.licence) ? "બીવાય-એસએ" : "બીવાય"} ${localDigits(ver)}`.trim();
  const author = photo.author ? await inGujarati(store, photo.author) : "";
  return `${author ? `${author}, ` : ""}${licence} / વિકિમીડિયા કૉમન્સ`;
}

/** A photographer's or an office's name in Gujarati letters (an office's translated: "Prime Minister's Office" is
 * "વડાપ્રધાન કાર્યાલય"), kept so it's asked once; as it is if the AI can't be reached. */
async function inGujarati(store: Store, name: string): Promise<string> {
  const key = `credit-gu|${name}`;
  const had = store.fitted(key);
  if (had) return had.body;
  const k = env("OPENROUTER_API_KEY");
  if (!k) return name;
  try {
    const res = await openRouter({
      method: "POST",
      headers: { authorization: `Bearer ${k}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
      body: JSON.stringify({
        model: profile.editorial.translateModel, temperature: 0,
        messages: [{ role: "user", content: `Write this photo credit in Gujarati script for a Gujarati newspaper: a person's name or a user name ` +
          `spelled out in Gujarati letters as it sounds, an organisation's name translated as Gujarati papers write it (e.g. "Prime Minister's Office" = "વડાપ્રધાન કાર્યાલય"). ` +
          `Answer with the Gujarati text alone, no Latin letters.\n\n${name}` }],
      }),
    });
    if (!res.ok) return name;
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const out = data.choices[0].message.content.trim().replace(/^["'“]|["'”]$/g, "").split("\n")[0].trim();
    // (only Gujarati letters, punctuation and spaces: anything else, kept as it was)
    if (!out || /[A-Za-z]/.test(out) || !/[\u0A80-\u0AFF]/.test(out)) return name;
    store.putFitted(key, { body: out, model: profile.editorial.translateModel });
    return out;
  } catch {
    return name;
  }
}

function hash(s: string): string {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
