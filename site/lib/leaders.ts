// The leaders list and their birthdays (ROADMAP §0.2 and §3.3; phase B, 30 Oct). The editor keeps the list on the
// editor page: each leader's name, how they're addressed, their post, birthday, official email and portrait. A leader is
// found by name on Wikidata, which gives the Gujarati name, the birthday and a free-licence portrait from Wikimedia
// Commons (credited on the greeting); the editor checks and changes anything, or puts in a photo of their own.
// On a leader's birthday the editor page shows a greeting picture in the paper's design (drawn on the editor's phone,
// app/(gu)/editor/Greeting.tsx, where Gujarati letters are shaped properly) and a Gujarati email draft. The site
// never sends an email: the editor sends it from their own mailbox. The engine's run tells the editor on Telegram
// once in the morning, from 6 AM (engine/run.ts).
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { sampleOn } from "./sample.ts";
import { prepared } from "./write.ts";

type Sql = NeonQueryFunction<false, false>;

// as engine/wikiphoto.ts has them (not imported: that file brings the engine's AI into the site's pages)
const UA = "CapitalKranti-news/1.0 (https://capital-kranti.vercel.app; leaders' birthdays from Wikidata)";
const FREE = /^(cc0|cc[ -]by(-sa)?\b|public domain|pd\b|pd-|godl)/i;
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

export interface Leader {
  id: string; nameGu: string; nameEn: string; title: string; post: string;
  /** month and day, "07-15" */
  born: string; email: string; portrait: string; credit: string;
}
/** how a leader is addressed in the greeting and the email */
export const TITLES = ["શ્રી", "શ્રીમતી", "સુશ્રી", "ડૉ."];

/** today in India, "MM-DD", and the next days' */
const dayIn = (days: number) => new Date(Date.now() + days * 86400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(5);
const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const LAST = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const validBorn = (b: string) => {
  const m = /^(\d\d)-(\d\d)$/.exec(b);
  return !!m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= LAST[+m[1] - 1];
};
const validEmail = (e: string) => !e || /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(e);
/** a portrait only from Commons, or one the editor put in the photo store (app/api/editor/photo) */
const validPortrait = (u: string) => !u || /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/[^\s"'<>?]+$/.test(u) || /^\/media\/live\/\d{4}-\d{2}-\d{2}\/ed-[a-z0-9]+\.jpg$/.test(u);

// While developing without a database (CK_SAMPLE=1): a list kept in memory, with one birthday today.
const kept: Leader[] = [];
function sampleList() {
  if (!kept.length) kept.push(
    { id: "s1", nameGu: "ભૂપેન્દ્ર પટેલ", nameEn: "Bhupendra Patel", title: "શ્રી", post: "મુખ્યમંત્રી, ગુજરાત", born: dayIn(0), email: "cm@example.com",
      portrait: "https://upload.wikimedia.org/wikipedia/commons/0/0d/Bhupendra_PAtel_Sanskrit.jpg", credit: "NehalDaveND, CC BY-SA 4.0, Wikimedia Commons" },
    { id: "s2", nameGu: "નમૂના નેતા", nameEn: "Sample Leader", title: "શ્રીમતી", post: "સાંસદ", born: dayIn(3), email: "", portrait: "", credit: "" },
  );
  return kept;
}

const row = (r: Record<string, unknown>): Leader => ({
  id: String(r.id), nameGu: String(r.name_gu), nameEn: String(r.name_en), title: String(r.title), post: String(r.post),
  born: String(r.born), email: String(r.email), portrait: String(r.portrait), credit: String(r.credit),
});

/** every leader, by name */
export async function leaders(sql: Sql | null): Promise<Leader[]> {
  if (!sql) return sampleOn() ? [...sampleList()].sort((a, b) => a.nameGu.localeCompare(b.nameGu, "gu")) : [];
  await prepared(sql);
  return (await sql.query(`select * from leaders order by name_gu`)).map(row);
}

/** a leader added or changed; false when something given isn't right */
export async function saveLeader(sql: Sql | null, x: Leader): Promise<boolean> {
  const l: Leader = {
    id: x.id || `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nameGu: x.nameGu.trim().slice(0, 80), nameEn: x.nameEn.trim().slice(0, 80), title: TITLES.includes(x.title) ? x.title : TITLES[0],
    post: x.post.trim().slice(0, 120), born: x.born, email: x.email.trim().slice(0, 120), portrait: x.portrait.trim(), credit: x.credit.trim().slice(0, 200),
  };
  if (!l.nameGu || !validBorn(l.born) || !validEmail(l.email) || !validPortrait(l.portrait)) return false;
  if (!l.portrait) l.credit = "";
  if (!sql) {
    if (!sampleOn()) return false;
    const list = sampleList(), i = list.findIndex((y) => y.id === l.id);
    if (i >= 0) list[i] = l; else list.push(l);
    return true;
  }
  await prepared(sql);
  await sql.query(`insert into leaders (id, name_gu, name_en, title, post, born, email, portrait, credit) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (id) do update set name_gu = $2, name_en = $3, title = $4, post = $5, born = $6, email = $7, portrait = $8, credit = $9`,
    [l.id, l.nameGu, l.nameEn, l.title, l.post, l.born, l.email, l.portrait, l.credit]);
  return true;
}

export async function dropLeader(sql: Sql | null, id: string) {
  if (!sql) { const list = sampleList(), i = list.findIndex((y) => y.id === id); if (sampleOn() && i >= 0) list.splice(i, 1); return; }
  await sql.query(`delete from leaders where id = $1`, [id]);
}

/** a birthday's day this year: 29 February is kept on the 28th when the year has none */
const kept29 = (born: string) => (born === "02-29" && !leap(Number(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).slice(0, 4))) ? "02-28" : born);

/** today's birthdays (India time), and the next week's, soonest first */
export function birthdays(list: Leader[], week = 7): { today: Leader[]; soon: { leader: Leader; inDays: number }[] } {
  const today = list.filter((l) => kept29(l.born) === dayIn(0));
  const soon: { leader: Leader; inDays: number }[] = [];
  for (let d = 1; d <= week; d++) for (const l of list) if (kept29(l.born) === dayIn(d)) soon.push({ leader: l, inDays: d });
  return { today, soon };
}

/** The birthday email, in Gujarati, for the editor to read, change and send themselves. */
export function draftEmail(l: Leader): { subject: string; body: string } {
  return {
    subject: `જન્મદિવસની હાર્દિક શુભેચ્છાઓ: ${l.title} ${l.nameGu}`,
    body: [
      `આદરણીય ${l.title} ${l.nameGu},`,
      "",
      "આપના જન્મદિવસ નિમિત્તે કેપિટલ ક્રાંતિ પરિવાર તરફથી આપને હાર્દિક શુભેચ્છાઓ.",
      ...(l.post ? [`${l.post} તરીકે આપ જે સેવા કરી રહ્યા છો તે માટે અમે આપના આભારી છીએ.`] : []),
      "ઈશ્વર આપને ઉત્તમ સ્વાસ્થ્ય, દીર્ઘાયુ અને સફળતા આપે એવી પ્રાર્થના.",
      "",
      "શુભેચ્છાઓ સહિત,",
      "તંત્રી, કેપિટલ ક્રાંતિ",
    ].join("\n"),
  };
}

/** What Wikidata knows of a leader, for the editor to check: the person's names, short description, birthday (when
 *  known to the day) and free portrait. Null when nobody by that name is found. */
export interface FoundLeader { nameGu: string; nameEn: string; about: string; born: string; title: string; portrait: string; credit: string; wikidata: string }

async function get(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
  return r.ok ? r.json() : null;
}
type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
type Entity = { id: string; labels?: Record<string, { value: string }>; descriptions?: Record<string, { value: string }>; claims?: Record<string, Claim[]> };

export async function findLeader(name: string): Promise<FoundLeader | null> {
  const q = name.trim().slice(0, 80);
  if (!q) return null;
  const lang = /[઀-૿]/.test(q) ? "gu" : "en";
  const search = (await get(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: "wbsearchentities", search: q, language: lang, uselang: "en", type: "item", limit: "8", format: "json" })}`)) as
    { search?: { id: string }[] } | null;
  const ids = (search?.search ?? []).map((x) => x.id).filter((id) => /^Q\d+$/.test(id));
  if (!ids.length) return null;
  const got = (await get(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|claims", languages: "gu|en", format: "json" })}`)) as
    { entities?: Record<string, Entity> } | null;
  // the first person of those found (Wikidata's own order, best first)
  const person = ids.map((id) => got?.entities?.[id]).find((e) => e?.claims?.P31?.some((c) => (c.mainsnak?.datavalue?.value as { id?: string })?.id === "Q5"));
  if (!person) return null;
  const birth = person.claims?.P569?.[0]?.mainsnak?.datavalue?.value as { time?: string; precision?: number } | undefined;
  const born = birth?.precision === 11 ? (birth.time ?? "").slice(6, 11) : "";
  // a woman (Wikidata's "sex or gender": female) is addressed શ્રીમતી, as the editor can change
  const woman = person.claims?.P21?.some((c) => (c.mainsnak?.datavalue?.value as { id?: string })?.id === "Q6581072");
  let portrait = "", credit = "";
  const file = person.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (typeof file === "string" && /\.(jpe?g|png)$/i.test(file)) {
    const info = (await get(`https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "960", format: "json" })}`)) as
      { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; extmetadata?: Record<string, { value?: string }> }[] }> } } | null;
    const ii = Object.values(info?.query?.pages ?? {})[0]?.imageinfo?.[0];
    const licence = plain(ii?.extmetadata?.LicenseShortName?.value ?? "");
    if (ii?.thumburl && FREE.test(licence) && validPortrait(ii.thumburl.split("?")[0])) {
      portrait = ii.thumburl.split("?")[0];
      credit = `${plain(ii.extmetadata?.Artist?.value ?? "").slice(0, 80) || "Wikimedia Commons"}, ${licence}, Wikimedia Commons`;
    }
  }
  return {
    nameGu: person.labels?.gu?.value ?? "", nameEn: person.labels?.en?.value ?? q, about: person.descriptions?.en?.value ?? "",
    born: validBorn(born) ? born : "", title: woman ? "શ્રીમતી" : "શ્રી", portrait, credit, wikidata: person.id,
  };
}
