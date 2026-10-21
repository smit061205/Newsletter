// The backend's storage: one SQLite file (Node's built-in node:sqlite, run
// with --experimental-sqlite). Releases as fetched, stories as rewritten,
// ads as booked, every built issue (draft or approved) with its render JSON,
// and editors' edits -- kept, so a rebuild never loses them.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { IssueRender } from "@ck/shared/contract";
import { ROOT } from "./config.ts";

export interface Release {
  id: number;
  date: string; // ISO day it was published
  url: string;
  office: string; // department or district office ("BY ...")
  headline: string;
  subhead: string;
  body: string; // paragraphs separated by blank lines
  photos: string[]; // local URLs under /media/
  fetchedAt: string;
}

export interface Story {
  id: string;
  releaseId: number | null;
  date: string;
  kicker: string;
  headline: string;
  deck: string;
  bodies: { short: string; medium: string; long: string };
  priority: number; // 1 = lead ... 5 = filler
  page: number | null; // suggested page
  photo: string | null;
  /** every photo the release came with, the main one first (for wider layouts) */
  photos?: string[];
  caption: string;
  source: string; // the release URL it came from
  model: string; // who wrote it ("as-is" when not rewritten)
  needsReview: boolean;
  /** Numbers in the rewrite that aren't in the release, if any. */
  factCheck?: string;
}

export interface Ad {
  id: string;
  date: string;
  page: number;
  x: number; y: number; width: number; height: number; // contract px
  url: string;
}

export interface Edit {
  issueDate: string;
  storyId: string;
  /** e.g. {"headline": "..."}, {"box": {x,y,width,height}}, {"drop": true}, {"swapWith": "<story id>"} */
  change: Record<string, unknown>;
  at: string;
}

const DB_PATH = path.join(ROOT, "backend", "data", "capital-kranti.sqlite");

export class Store {
  db: DatabaseSync;

  constructor(file = DB_PATH) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      create table if not exists releases (id integer primary key, date text, json text);
      create table if not exists stories (id text primary key, date text, json text);
      create table if not exists ads (id text primary key, date text, json text);
      create table if not exists issues (date text, version integer, status text, built_at text, json text,
                                         report text, primary key (date, version));
      create table if not exists edits (n integer primary key autoincrement, issue_date text, json text);
      create table if not exists fitted (key text primary key, json text);
    `);
  }

  private put(table: string, id: string | number, date: string, value: unknown) {
    this.db.prepare(`insert or replace into ${table} (id, date, json) values (?, ?, ?)`).run(id, date, JSON.stringify(value));
  }
  private all<T>(table: string, date: string): T[] {
    return this.db.prepare(`select json from ${table} where date = ? order by rowid`).all(date)
      .map((r) => JSON.parse((r as { json: string }).json) as T);
  }

  hasRelease(id: number) {
    return !!this.db.prepare("select 1 from releases where id = ?").get(id);
  }
  putRelease(r: Release) { this.put("releases", r.id, r.date, r); }
  releases(date: string) { return this.all<Release>("releases", date); }

  putStory(s: Story) { this.put("stories", s.id, s.date, s); }
  stories(date: string) { return this.all<Story>("stories", date); }
  deleteStory(id: string) { this.db.prepare("delete from stories where id = ?").run(id); }
  story(id: string): Story | null {
    const row = this.db.prepare("select json from stories where id = ?").get(id) as { json: string } | undefined;
    return row ? JSON.parse(row.json) : null;
  }

  putAd(a: Ad) { this.put("ads", a.id, a.date, a); }
  ads(date: string) { return this.all<Ad>("ads", date); }

  addEdit(e: Edit) {
    this.db.prepare("insert into edits (issue_date, json) values (?, ?)").run(e.issueDate, JSON.stringify(e));
  }
  edits(date: string): Edit[] {
    return this.db.prepare("select json from edits where issue_date = ? order by n").all(date)
      .map((r) => JSON.parse((r as { json: string }).json));
  }

  /** A story body rewritten to a length (cached, so a rebuild doesn't pay twice). */
  fitted(key: string): { body: string; model: string; factCheck?: string } | null {
    const row = this.db.prepare("select json from fitted where key = ?").get(key) as { json: string } | undefined;
    return row ? JSON.parse(row.json) : null;
  }
  putFitted(key: string, value: { body: string; model: string; factCheck?: string }) {
    this.db.prepare("insert or replace into fitted (key, json) values (?, ?)").run(key, JSON.stringify(value));
  }

  saveIssue(date: string, issue: IssueRender, report: unknown): number {
    const last = this.db.prepare("select max(version) v from issues where date = ?").get(date) as { v: number | null };
    const version = (last?.v ?? 0) + 1;
    this.db.prepare("insert into issues (date, version, status, built_at, json, report) values (?, ?, 'draft', ?, ?, ?)")
      .run(date, version, new Date().toISOString(), JSON.stringify(issue), JSON.stringify(report));
    return version;
  }
  latestIssue(date: string): { version: number; status: string; issue: IssueRender; report: unknown } | null {
    const row = this.db.prepare("select version, status, json, report from issues where date = ? order by version desc limit 1")
      .get(date) as { version: number; status: string; json: string; report: string } | undefined;
    return row ? { version: row.version, status: row.status, issue: JSON.parse(row.json), report: JSON.parse(row.report) } : null;
  }
  latestDate(): string | null {
    const row = this.db.prepare("select date from issues order by date desc, version desc limit 1").get() as { date: string } | undefined;
    return row?.date ?? null;
  }
  approve(date: string, version: number) {
    this.db.prepare("update issues set status = 'approved' where date = ? and version = ?").run(date, version);
  }
}
