// Writing what the newsroom publishes (app/api/publish) or the hourly run
// adds (tags, translations). A story whose text changes goes back to
// "pending" for its translation, so the English never lags the Gujarati.
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { ensureSchema } from "./schema.ts";
import type { PublishPayload } from "./types.ts";

let ready = false;
export async function prepared(sql: NeonQueryFunction<false, false>) {
  if (!ready) { await ensureSchema(sql); ready = true; }
  return sql;
}

/** The day's paper in: its stories upserted (keeping their tags and
 * translations where the text is unchanged), stories the editor took out
 * removed, and the issue's pages recorded. */
export async function saveIssue(sql: NeonQueryFunction<false, false>, p: PublishPayload, publishedAt?: string) {
  await prepared(sql);
  const when = publishedAt ?? new Date().toISOString();
  for (const s of p.stories) {
    await sql.query(
      `insert into stories (id, origin, issue_date, published_at, updated_at, kicker, headline, deck, body, caption, photo, source, checked, page, rank)
       values ($1, 'paper', $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       on conflict (id) do update set
         issue_date = excluded.issue_date,
         updated_at = case when (stories.kicker, stories.headline, stories.deck, stories.body, stories.caption)
                              is distinct from (excluded.kicker, excluded.headline, excluded.deck, excluded.body, excluded.caption)
                           then now() else stories.updated_at end,
         en_status = case when (stories.kicker, stories.headline, stories.deck, stories.body, stories.caption)
                             is distinct from (excluded.kicker, excluded.headline, excluded.deck, excluded.body, excluded.caption)
                          then 'pending' else stories.en_status end,
         tag_status = case when (stories.headline, stories.body) is distinct from (excluded.headline, excluded.body)
                           then 'pending' else stories.tag_status end,
         kicker = excluded.kicker, headline = excluded.headline, deck = excluded.deck, body = excluded.body, caption = excluded.caption,
         photo = excluded.photo, source = excluded.source, checked = excluded.checked, page = excluded.page, rank = excluded.rank`,
      [s.id, p.issue.date, when, s.kicker, s.headline, s.deck, s.body, s.caption,
       s.photo ? JSON.stringify(s.photo) : null, s.source ? JSON.stringify(s.source) : null, s.checked, s.page, s.rank]);
  }
  const ids = p.stories.map((s) => s.id);
  await sql.query(`delete from stories where origin = 'paper' and issue_date = $1 and not (id = any($2::text[]))`, [p.issue.date, ids]);
  await sql.query(
    `insert into issues (date, number, pages, pdf, published_at, story_ids) values ($1, $2, $3, $4, $5, $6)
     on conflict (date) do update set number = excluded.number, pages = excluded.pages, pdf = excluded.pdf,
       published_at = excluded.published_at, story_ids = excluded.story_ids`,
    [p.issue.date, p.issue.number, JSON.stringify(p.issue.pages), p.issue.pdf, when, ids]);
  await touched(sql);
}

/** Notes that what readers see has changed, so the next /api/refresh renews the kept-ready pages. */
export async function touched(sql: NeonQueryFunction<false, false>) {
  await sql.query(`insert into state (key, value) values ('content_changed_at', now()::text)
                   on conflict (key) do update set value = excluded.value`);
}

/** Adds to today's count of something limited (uploads to the free photo
 * store, free AI requests) and returns the new total. */
export async function count(sql: NeonQueryFunction<false, false>, kind: string, n = 1): Promise<number> {
  await prepared(sql);
  const rows = await sql.query(
    `insert into usage (day, kind, n) values ((now() at time zone 'Asia/Kolkata')::date, $1, $2)
     on conflict (day, kind) do update set n = usage.n + excluded.n returning n`, [kind, n]);
  return rows[0].n as number;
}

/** This month's total of something limited (India time). */
export async function monthTotal(sql: NeonQueryFunction<false, false>, kind: string): Promise<number> {
  await prepared(sql);
  const rows = await sql.query(
    `select coalesce(sum(n), 0)::int as n from usage where kind = $1
       and date_trunc('month', day) = date_trunc('month', (now() at time zone 'Asia/Kolkata')::date)`, [kind]);
  return rows[0].n as number;
}
