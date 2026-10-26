// The website's database (Neon Postgres for now; docs/website/ROADMAP.md §1.1).
// One idempotent setup, run by the hourly run and before a publish writes:
// adding a column later is another `alter table ... add column if not exists`.
import { createHash } from "node:crypto";
import type { NeonQueryFunction } from "@neondatabase/serverless";

export const SCHEMA = [
  `create table if not exists stories (
     id text primary key,
     origin text not null default 'paper',          -- 'paper': from the evening paper's Publish
     issue_date date not null,
     published_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     tier text not null default 'india',            -- gujarat | india | world
     genres text[] not null default '{}',
     tag_status text not null default 'pending',     -- pending | done | failed
     kicker text not null default '',
     headline text not null,
     deck text not null default '',
     body text not null,                            -- paragraphs separated by blank lines
     caption text not null default '',
     photo jsonb,                                   -- {url, width, height}
     source jsonb,                                  -- {kind, name, url, office}
     checked boolean not null default false,        -- its numbers match its source
     page int,
     rank int,
     en jsonb,                                      -- {kicker, headline, deck, body, caption}
     en_status text not null default 'pending',     -- pending | done | failed
     corrections jsonb not null default '[]'        -- [{at, gu, en}]
   )`,
  `create index if not exists stories_by_day on stories (issue_date desc, page, rank)`,
  `create index if not exists stories_pending on stories (en_status, tag_status)`,
  `create table if not exists issues (
     date date primary key,
     number int not null,
     pages jsonb not null default '[]',             -- [{number, url, width, height}]
     pdf text,
     published_at timestamptz not null default now(),
     story_ids text[] not null default '{}'
   )`,
  `create table if not exists runs (
     id bigserial primary key,
     kind text not null,                            -- 'hourly'
     scheduled_for timestamptz,
     started_at timestamptz not null default now(),
     finished_at timestamptz,
     ok boolean,
     details jsonb not null default '{}'
   )`,
  // content_changed_at (a publish, new translations) and refreshed_at (/api/refresh)
  `create table if not exists state (key text primary key, value text not null)`,
  `create table if not exists usage (
     day date not null,
     kind text not null,                            -- 'upload', 'ai_free', ...
     n int not null default 0,
     primary key (day, kind)
   )`,
  // ---- the live news engine (site/engine; ROADMAP §3) ----
  // a story's place in the engine: only 'published' ones are shown
  `alter table stories add column if not exists status text not null default 'published'`,  // published | held | withdrawn
  `alter table stories add column if not exists importance real`,
  `alter table stories add column if not exists sources jsonb not null default '[]'`,  // [{name, url, trust, group}]
  `alter table stories add column if not exists checks jsonb`,                      // the verification loop's findings
  `alter table stories add column if not exists hold_reason text`,
  `alter table stories add column if not exists hi jsonb`,                          // Hindi {kicker, headline, deck, body, caption}
  `alter table stories add column if not exists hi_status text not null default 'none'`, // none | done | failed
  `create index if not exists stories_live on stories (status, published_at desc)`,
  // each watched source's last answer, so a run asks only for what changed and stops asking a site that refuses us
  `create table if not exists sources_state (
     id text primary key,
     etag text,
     last_modified text,
     checked_at timestamptz,
     ok_at timestamptz,
     status int,
     failures int not null default 0,
     refused boolean not null default false,       -- answered 401/403/451 or robots.txt says no: never worked around
     note text
   )`,
  // every item a source listed, once (by its link)
  `create table if not exists items (
     id text primary key,                           -- a hash of the link
     source text not null,
     url text not null,
     title text not null,
     summary text not null default '',
     lang text not null,
     published_at timestamptz,
     seen_at timestamptz not null default now(),
     image text,
     body text,                                     -- the full text, for official items and stories being written
     triage jsonb,                                  -- {score, tier, genres, sensitive, event, debunk}
     cluster_id text
   )`,
  `create index if not exists items_untriaged on items (seen_at) where triage is null`,
  `create index if not exists items_cluster on items (cluster_id)`,
  // one event, however many sources report it
  `create table if not exists clusters (
     id text primary key,
     event text not null,                           -- one English line naming the event (triage)
     keys text[] not null default '{}',             -- its words, for matching new items
     first_seen timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     tier text not null default 'india',
     genres text[] not null default '{}',
     sensitive boolean not null default false,
     score real not null default 0,
     state text not null default 'new',             -- new | waiting | confirmed | written | published | held | blocked | dropped
     reason text,
     story_id text
   )`,
  `create index if not exists clusters_state on clusters (state, score desc)`,
  // how many times each story was opened, per day (for "most read"; nothing about who)
  `create table if not exists reads (
     story_id text not null,
     day date not null,
     n int not null default 0,
     primary key (story_id, day)
   )`,
  // what was sent to the editor's phone, and what came back
  `create table if not exists approvals (
     story_id text primary key,
     sent_at timestamptz not null default now(),
     message_id bigint,
     decided_at timestamptz,
     decision text,                                 -- approve | reject
     decided_by text
   )`,
];

// the schema's version, kept in the database: a reader checks it with one
// query and sets the schema up only when it's behind (25 Oct: a deploy read the
// engine's new columns before any run had added them, and its build failed)
const VERSION = createHash("sha256").update(SCHEMA.join("\n")).digest("hex").slice(0, 16);

export async function ensureSchema(sql: NeonQueryFunction<false, false>) {
  for (const statement of SCHEMA) await sql.query(statement);
  await sql.query(`insert into state (key, value) values ('schema_version', $1) on conflict (key) do update set value = excluded.value`, [VERSION]);
}

/** Sets the schema up only if the database is behind this code (one query when it isn't). */
export async function schemaReady(sql: NeonQueryFunction<false, false>) {
  const rows = await sql.query(`select value from state where key = 'schema_version'`).catch(() => []);
  if (rows[0]?.value !== VERSION) await ensureSchema(sql);
}
