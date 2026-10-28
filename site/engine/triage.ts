// Steps 2 and 4 in one pass (ROADMAP §3): a free model reads new items 12 at
// a time (one request for 12 headlines keeps hundreds of sources within the
// free allowance) and gives each its importance to Capital Kranti's readers,
// its tier and genres, whether it's sensitive, one English line naming the
// event, and English keywords. The keywords group items about one event into
// a cluster, across Gujarati, Hindi and English (cluster()).
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { askJson } from "./ai.ts";
import { sourceById } from "./sources.ts";
import type { Genre, Tier } from "../lib/types.ts";

type Sql = NeonQueryFunction<false, false>;
const BATCH = 12;
const TIERS: Tier[] = ["gujarat", "india", "world"];
const GENRES: Genre[] = ["farm", "economy", "tech", "health", "sport", "education", "entertainment"];

export interface Triage {
  score: number; tier: Tier; genres: Genre[]; sensitive: boolean; event: string; keys: string[];
  /** a fact-checker's item: the false claim it debunks, in English */
  debunk?: string;
}
export interface TriageInput { i: number; source: string; lang: string; title: string; summary: string; factcheck: boolean }

const SYSTEM = `You are the news editor of Capital Kranti, a Gujarati daily newspaper and website from Gandhinagar, Gujarat, India.
You get a numbered list of new items from news sources (Gujarati, Hindi or English). For EACH item reply with:
- score: 0-10, how much it matters to Capital Kranti's readers (Gujaratis in Gujarat and India):
  9-10 a major event (a Gujarat or national government decision affecting many people, a disaster, a big court verdict, war, an election result);
  7-8 important (state or national policy, big economy or science news, major sport results involving India);
  5-6 worth a story; 3-4 worth a short brief; 0-2 not for us (local trivia from far away, celebrity gossip, opinion, ads, live blogs, quizzes, horoscopes).
  News about Gujarat counts more; world news only when it matters to India or is globally major.
  Routine government publicity is NOT news and scores 0-3 however official: awareness campaigns ("Special Campaign", Swachhata drives),
  meetings, reviews, courtesy calls, visits without a decision, greetings and condolence messages, book fairs, exhibitions, workshops,
  webinars, newsletters, "to visit"/"to inaugurate" announcements of minor events. A decision, a new scheme, money, a result, or a number
  that affects people is news.
- tier: "gujarat" ONLY when the event happens in Gujarat or is about Gujarat's government, people or places; "india" for national news and
  for news from any other state or city (Mumbai, Delhi, Rajasthan... are "india", even when a Gujarati outlet reports them);
  "world" for other countries, or India abroad.
- genres: up to 2 of "farm","economy","tech","health","sport","education","entertainment"; [] if none fit.
- sensitive: true for deaths, accidents, crime, violence, communal matters, sexual offences, allegations against named people, health scares; else false.
- event: ONE short English line naming the specific event: who did what, where (e.g. "Gujarat cabinet approves ₹2,000 crore Narmada canal repair").
- keys: 4-8 lowercase English keywords for that event: the people, places, organisations, numbers (e.g. ["gujarat","cabinet","narmada","canal","2000 crore"]).
- debunk: ONLY for items marked factcheck: the false claim it debunks, in one English line; else "".
Reply with JSON only: {"items":[{"i":1,"score":0,"tier":"india","genres":[],"sensitive":false,"event":"","keys":[],"debunk":""}, ...]} with one entry for every item.`;

// The model sometimes files a Gujarati outlet's news from elsewhere under Gujarat (29 Oct: Mumbai's
// airport). A "gujarat" event that names a place outside Gujarat and no place in it is national news.
const GUJARAT = /\b(gujarat|ahmedabad|gandhinagar|surat|vadodara|baroda|rajkot|bhavnagar|jamnagar|junagadh|kutch|kachchh|bhuj|anand|nadiad|kheda|mehsana|patan|palanpur|banaskantha|sabarkantha|himmatnagar|panchmahal|godhra|dahod|bharuch|ankleshwar|valsad|vapi|navsari|tapi|dang|narmada|kevadia|ekta nagar|statue of unity|porbandar|dwarka|somnath|gir|amreli|botad|morbi|surendranagar|dholera|mundra|kandla|saurashtra|sabarmati|aravalli|modasa|mahisagar|chhota udepur|gift city|sanand|halol|diu|daman)\b/i;
const ELSEWHERE = /\b(maharashtra|mumbai|pune|nagpur|thane|delhi|rajasthan|jaipur|udaipur|madhya pradesh|bhopal|indore|uttar pradesh|lucknow|noida|ayodhya|varanasi|bihar|patna|karnataka|bengaluru|bangalore|tamil nadu|chennai|kerala|kochi|west bengal|kolkata|telangana|hyderabad|andhra|punjab|chandigarh|haryana|gurugram|goa|odisha|assam|jharkhand|chhattisgarh|uttarakhand|himachal|kashmir|srinagar|ladakh|manipur|mizoram|nagaland|meghalaya|tripura|sikkim|arunachal)\b/i;
export function placeTier(tier: Tier, event: string, keys: string[]): Tier {
  if (tier !== "gujarat") return tier;
  const text = `${event} ${keys.join(" ")}`;
  return ELSEWHERE.test(text) && !GUJARAT.test(text) ? "india" : tier;
}

function checkBatch(n: number) {
  return (v: unknown): Map<number, Triage> | null => {
    const list = (v as { items?: unknown[] })?.items;
    if (!Array.isArray(list)) return null;
    const out = new Map<number, Triage>();
    for (const x of list as Record<string, unknown>[]) {
      const i = Number(x.i);
      if (!Number.isInteger(i) || i < 1 || i > n) continue;
      const keys = (Array.isArray(x.keys) ? x.keys : []).map((k) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 10);
      out.set(i, {
        score: Math.max(0, Math.min(10, Number(x.score) || 0)),
        tier: placeTier(TIERS.includes(x.tier as Tier) ? (x.tier as Tier) : "india", String(x.event ?? ""), keys),
        genres: (Array.isArray(x.genres) ? x.genres : []).filter((g): g is Genre => GENRES.includes(g as Genre)).slice(0, 2),
        sensitive: x.sensitive === true,
        event: String(x.event ?? "").slice(0, 200),
        keys,
        debunk: String(x.debunk ?? "").slice(0, 300) || undefined,
      });
    }
    // most of the batch answered (a long answer cut short keeps what it finished), or it's not trusted
    return out.size >= Math.ceil(n * 0.6) ? out : null;
  };
}

/** One batch through a free model (no database). */
export async function triageBatch(sql: Sql | null, batch: TriageInput[]) {
  const user = batch.map((b) => `${b.i}. [${b.source}${b.factcheck ? ", factcheck" : ""}, ${b.lang}] ${b.title}${b.summary ? ` -- ${b.summary.slice(0, 220)}` : ""}`).join("\n");
  return askJson(sql, { system: SYSTEM, user, maxTokens: 8000 }, checkBatch(batch.length));
}

/** Every untriaged item, newest first, as far as the run's share of the allowance goes. */
export async function triage(sql: Sql, log: (s: string) => void, maxBatches: number, deadline: number) {
  let done = 0, batches = 0;
  while (batches < maxBatches && Date.now() < deadline) {
    const rows = await sql.query(`select id, source, lang, title, summary from items where triage is null order by seen_at desc limit ${BATCH}`);
    if (!rows.length) break;
    const input: TriageInput[] = rows.map((r, k) => ({ i: k + 1, source: sourceById.get(r.source as string)?.name ?? (r.source as string),
      lang: r.lang as string, title: r.title as string, summary: r.summary as string, factcheck: sourceById.get(r.source as string)?.trust === "factcheck" }));
    const res = await triageBatch(sql, input);
    batches++;
    if (!res.ok) { log(`  triage: ${res.why}`); if (res.stop) return { done, stop: true }; continue; }
    for (const [k, r] of rows.entries()) {
      const t = res.value.get(k + 1) ?? { skipped: "no answer" };
      await sql.query(`update items set triage = $2 where id = $1`, [r.id, JSON.stringify(t)]);
    }
    done += res.value.size;
  }
  log(`  triaged ${done} item(s) in ${batches} request(s)`);
  return { done, stop: false };
}

// ---- clustering: one event, however many sources and languages report it ----

const STOP = new Set(["the", "a", "of", "in", "on", "and", "to", "for", "india", "indian", "government", "govt", "says", "said", "new"]);
export const keySet = (keys: string[]) => new Set(keys.flatMap((k) => k.split(/[\s/-]+/)).map((k) => k.replace(/[^\p{L}\p{N}.]/gu, "")).filter((k) => k.length > 1 && !STOP.has(k)));
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const k of a) if (b.has(k)) both++;
  return both / Math.min(a.size, b.size);
}
/** Two items are one event when most of the shorter keyword set is shared (and at least 3 words). */
export const SAME_EVENT = 0.6;

// Two clusters can grow for one event when its reports share too few keywords (29 Oct: Spain's train
// crash went up twice, minutes apart). Before a cluster is written, the stories of the last two days that
// share words with it are put to a free model; when one is the same incident, the cluster joins it.
const SAME = `You compare news events. You get one NEW event and a numbered list of EARLIER events.
Answer with the number of the earlier event that is the SAME real-world incident or decision (the same crash,
the same verdict, the same announcement), even when the wording, numbers or angle differ. A different incident
on the same topic (another crash, another verdict) is NOT the same. Reply with JSON only: {"same": 0} when none is.`;

/** The published or held cluster (last 48 hours) that is the same event as this one, or null. */
export async function sameEvent(sql: Sql, c: { id: string; event: string; keys: string[]; before?: string }): Promise<{ id: string; story: string } | null> {
  const mine = keySet(c.keys);
  const rows = await sql.query(
    `select id, event, keys, story_id from clusters where id <> $1 and story_id is not null and state in ('published', 'held')
       and first_seen > now() - interval '48 hours' and ($2::timestamptz is null or first_seen < $2)`, [c.id, c.before ?? null]);
  const near = rows.map((r) => {
    let both = 0;
    for (const k of keySet(r.keys as string[])) if (mine.has(k)) both++;
    return { id: r.id as string, story: r.story_id as string, event: r.event as string, both };
  }).filter((r) => r.both >= 2).sort((a, b) => b.both - a.both).slice(0, 6);
  if (!near.length) return null;
  const res = await askJson(sql, { system: SAME, user: `NEW: ${c.event}\n\nEARLIER:\n${near.map((r, i) => `${i + 1}. ${r.event}`).join("\n")}`, maxTokens: 60 },
    (v) => { const n = Number((v as { same?: unknown })?.same); return Number.isInteger(n) && n >= 0 && n <= near.length ? n : null; });
  return res.ok && res.value > 0 ? near[res.value - 1] : null;
}

/** Triaged, unclustered news items into clusters (new ones, or joining one from the last 2 days). */
export async function cluster(sql: Sql, log: (s: string) => void) {
  const items = await sql.query(
    `select id, source, triage from items where cluster_id is null and triage is not null and not (triage ? 'skipped')
      order by seen_at asc limit 500`);
  const recent = (await sql.query(`select id, keys, state from clusters where updated_at > now() - interval '48 hours'`))
    .map((c) => ({ id: c.id as string, keys: keySet(c.keys as string[]), state: c.state as string }));
  let joined = 0, created = 0, ignored = 0;
  for (const it of items) {
    const t = it.triage as Triage;
    const src = sourceById.get(it.source as string);
    if (src?.trust === "factcheck") { await sql.query(`update items set cluster_id = 'factcheck' where id = $1`, [it.id]); continue; }
    if (t.score < 3) { await sql.query(`update items set cluster_id = 'ignored' where id = $1`, [it.id]); ignored++; continue; }
    const keys = keySet(t.keys);
    let best: { id: string; s: number; keys: Set<string> } | null = null;
    for (const c of recent) {
      const s = similarity(keys, c.keys);
      let both = 0;
      for (const k of keys) if (c.keys.has(k)) both++;
      if (s >= SAME_EVENT && both >= 3 && (!best || s > best.s)) best = { id: c.id, s, keys: c.keys };
    }
    if (best) {
      await sql.query(
        `update clusters set updated_at = now(), score = greatest(score, $2), sensitive = sensitive or $3,
           genres = (select array(select distinct unnest(genres || $4::text[]))), keys = (select array(select distinct unnest(keys || $5::text[])))[1:16]
         where id = $1`, [best.id, t.score, t.sensitive, t.genres, t.keys]);
      await sql.query(`update items set cluster_id = $2 where id = $1`, [it.id, best.id]);
      for (const k of keys) best.keys.add(k);
      joined++;
    } else {
      const id = `c${(it.id as string).slice(0, 12)}`;
      await sql.query(
        `insert into clusters (id, event, keys, tier, genres, sensitive, score) values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing`,
        [id, t.event || "(no event line)", t.keys, t.tier, t.genres, t.sensitive, t.score]);
      await sql.query(`update items set cluster_id = $2 where id = $1`, [it.id, id]);
      recent.push({ id, keys, state: "new" });
      created++;
    }
  }
  log(`  clusters: ${created} new, ${joined} item(s) joined one, ${ignored} not for us`);
}
