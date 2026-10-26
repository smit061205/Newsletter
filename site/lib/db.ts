// Reading and writing the website's stories and issues. Pages read through
// here at render time; they are kept ready (ISR) and refreshed when the
// newsroom publishes (app/api/publish), so readers rarely wake the database.
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Correction, English, Genre, Issue, IssuePage, Photo, Source, Story, StorySource, Tier } from "./types.ts";
import { sample, sampleOn } from "./sample.ts";
import { schemaReady } from "./schema.ts";

let client: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;
/** The database, or null where there is none (the site's own CI build). Its
 * first query in a process waits for the schema to be current (lib/schema.ts),
 * so a deploy never reads a column no run has added yet. */
export function db(): NeonQueryFunction<false, false> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!client) {
    const raw = neon(url);
    const query = raw.query.bind(raw);
    raw.query = (async (...args: Parameters<typeof query>) => {
      ready ??= schemaReady({ query } as unknown as NeonQueryFunction<false, false>).catch((e) => { ready = null; throw e; });
      await ready;
      return query(...args);
    }) as typeof raw.query;
    client = raw;
  }
  return client;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : "");
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

type Row = Record<string, unknown>;
function storyOf(r: Row): Story {
  return {
    id: r.id as string,
    issueDate: day(r.issue_date),
    publishedAt: iso(r.published_at),
    updatedAt: iso(r.updated_at),
    tier: (r.tier as Tier) ?? "india",
    genres: (r.genres as Genre[]) ?? [],
    kicker: (r.kicker as string) ?? "",
    headline: r.headline as string,
    deck: (r.deck as string) ?? "",
    body: (r.body as string) ?? "",
    caption: (r.caption as string) ?? "",
    photo: (r.photo as Photo | null) ?? null,
    source: (r.source as Source | null) ?? null,
    checked: !!r.checked,
    page: (r.page as number | null) ?? null,
    rank: (r.rank as number | null) ?? null,
    en: r.en_status === "done" ? ((r.en as English | null) ?? null) : null,
    hi: r.hi_status === "done" ? ((r.hi as English | null) ?? null) : null,
    corrections: (r.corrections as Correction[]) ?? [],
    origin: r.origin === "live" ? "live" : "paper",
    sources: (r.sources as StorySource[] | null) ?? [],
    importance: (r.importance as number | null) ?? null,
  };
}
function issueOf(r: Row): Issue {
  return {
    date: day(r.date), number: r.number as number, pages: (r.pages as IssuePage[]) ?? [], pdf: (r.pdf as string | null) ?? null,
    publishedAt: iso(r.published_at), storyIds: (r.story_ids as string[]) ?? [],
  };
}

const COLUMNS = `id, issue_date, published_at, updated_at, tier, genres, kicker, headline, deck, body, caption, photo, source,
                 checked, page, rank, en, en_status, hi, hi_status, corrections, origin, sources, importance`;

/** The newest stories, the latest day's paper first in its printed order. */
export async function latestStories(limit = 60): Promise<Story[]> {
  if (sampleOn()) return sample().stories.slice(0, limit);
  const sql = db();
  if (!sql) return [];
  const rows = await sql.query(
    `select ${COLUMNS} from stories where status = 'published' order by issue_date desc, page asc nulls last, rank asc nulls last, published_at desc limit $1`, [limit]);
  return rows.map(storyOf);
}

export async function storyById(id: string): Promise<Story | null> {
  if (sampleOn()) return sample().stories.find((s) => s.id === id) ?? null;
  const sql = db();
  if (!sql) return null;
  const rows = await sql.query(`select ${COLUMNS} from stories where id = $1 and status = 'published'`, [id]);
  return rows[0] ? storyOf(rows[0]) : null;
}

/** A section: a tier (gujarat, india, world) or a genre. */
export async function storiesIn(key: string, limit = 40): Promise<Story[]> {
  if (sampleOn()) return sample().stories.filter((s) => s.tier === key || s.genres.includes(key as Genre)).slice(0, limit);
  const sql = db();
  if (!sql) return [];
  const rows = await sql.query(
    `select ${COLUMNS} from stories where status = 'published' and (tier = $1 or $1 = any(genres)) order by issue_date desc, published_at desc, rank asc nulls last limit $2`,
    [key, limit]);
  return rows.map(storyOf);
}

export async function storiesOn(date: string): Promise<Story[]> {
  if (sampleOn()) return sample().stories.filter((s) => s.issueDate === date);
  const sql = db();
  if (!sql) return [];
  const rows = await sql.query(`select ${COLUMNS} from stories where issue_date = $1 and status = 'published' order by page asc nulls last, rank asc nulls last`, [date]);
  return rows.map(storyOf);
}

/** Headlines, summaries and text containing the words (Gujarati has no
 * stemming in Postgres, so a plain match; English matches its translation). */
export async function search(q: string, limit = 30): Promise<Story[]> {
  if (sampleOn()) return sample().stories.filter((s) => (s.headline + s.deck + s.body).includes(q.trim())).slice(0, limit);
  const sql = db();
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!sql || !words.length) return [];
  const where = words.map((_, i) => `(headline || ' ' || deck || ' ' || body || ' ' || coalesce(en::text, '')) ilike $${i + 1}`).join(" and ");
  const rows = await sql.query(
    `select ${COLUMNS} from stories where status = 'published' and ${where} order by issue_date desc, published_at desc limit ${Math.min(limit, 50)}`,
    words.map((w) => `%${w.replace(/[%_\\]/g, (c) => "\\" + c)}%`));
  return rows.map(storyOf);
}

export async function latestIssue(): Promise<Issue | null> {
  if (sampleOn()) return sample().issues[0];
  const sql = db();
  if (!sql) return null;
  const rows = await sql.query(`select * from issues order by date desc limit 1`);
  return rows[0] ? issueOf(rows[0]) : null;
}
export async function issueOn(date: string): Promise<Issue | null> {
  if (sampleOn()) return sample().issues.find((i) => i.date === date) ?? null;
  const sql = db();
  if (!sql) return null;
  const rows = await sql.query(`select * from issues where date = $1`, [date]);
  return rows[0] ? issueOf(rows[0]) : null;
}
export async function issueDates(limit = 400): Promise<{ date: string; number: number; stories: number }[]> {
  if (sampleOn()) return sample().issues.map((i) => ({ date: i.date, number: i.number, stories: i.storyIds.length }));
  const sql = db();
  if (!sql) return [];
  const rows = await sql.query(
    `select i.date, i.number, (select count(*) from stories s where s.issue_date = i.date and s.status = 'published')::int as stories
       from issues i order by i.date desc limit $1`, [limit]);
  return rows.map((r) => ({ date: day(r.date), number: r.number as number, stories: r.stories as number }));
}

/** Every story's id and last change, for the sitemaps. */
export async function sitemapEntries(sinceDays?: number): Promise<{ id: string; updatedAt: string; publishedAt: string; headline: string; en: boolean }[]> {
  const sql = db();
  if (!sql) return [];
  const rows = sinceDays
    ? await sql.query(`select id, updated_at, published_at, headline, en_status from stories where status = 'published' and published_at > now() - make_interval(days => $1) order by published_at desc limit 1000`, [sinceDays])
    : await sql.query(`select id, updated_at, published_at, headline, en_status from stories where status = 'published' order by published_at desc limit 50000`);
  return rows.map((r) => ({ id: r.id as string, updatedAt: iso(r.updated_at), publishedAt: iso(r.published_at), headline: r.headline as string,
                            en: r.en_status === "done" }));
}
