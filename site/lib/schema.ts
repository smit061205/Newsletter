// The website's database (Neon Postgres for now; docs/website/ROADMAP.md §1.1).
// One idempotent setup, run by the hourly run and before a publish writes:
// adding a column later is another `alter table ... add column if not exists`.
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
];

export async function ensureSchema(sql: NeonQueryFunction<false, false>) {
  for (const statement of SCHEMA) await sql.query(statement);
}
