// A sister paper worked on as its own (the developer, 5 Nov: "entering one of the sister
// papers ... just like changing profiles in netflix"): the newsroom, on one of them, sees
// and changes that paper alone. Its news is Capital Kranti's day, read from the paper's
// own database as it is; what's its own is kept in a small database of its own:
//   - its ads: each day starts from Capital Kranti's ads for that day (and follows them)
//     until it books, moves or takes out an ad on that day; from then on that day's ads
//     are its own;
//   - its edits: Capital Kranti's edits of a story go through, unless it changed that
//     story itself; its own text edits are put over its reworded or translated words
//     (editorial/copies.ts);
//   - its issues: each time it's made, its pages, PDF and report (Past issues, Pages).
// Capital Kranti still runs the evening; one engine, one news gathering.
import { existsSync } from "node:fs";
import path from "node:path";
import { DB_FILE, OUT_DIR } from "./config.ts";
import { Store, type Ad, type Edit, type Release, type Story } from "./store.ts";

/** A sister paper's own folder (its database), beside the paper's. */
export const sisterDir = (id: string) => path.join(path.dirname(DB_FILE), "sister-papers", id);
/** Where a sister paper's PDFs and page pictures for a day are kept. */
export const sisterOut = (id: string, date: string) => path.join(OUT_DIR, "sister-papers", id, date);

/** The fields an edit changes the words of: put over a sister paper's own wording, after it. */
const TEXT = ["headline", "kicker", "deck", "caption", "body"];
export const textEdit = (e: Edit) => TEXT.some((k) => typeof e.change[k] === "string");

export class SisterStore extends Store {
  readonly main: Store;
  readonly id: string;
  constructor(main: Store, id: string) {
    super(path.join(sisterDir(id), "paper.sqlite"));
    this.main = main;
    this.id = id;
  }

  // ---- Capital Kranti's: the news, the AI's work, the runs and the settings
  inbox(unused = false) { return this.main.inbox(unused); }
  putInbox(item: Parameters<Store["putInbox"]>[0]) { this.main.putInbox(item); }
  hasRelease(id: number) { return this.main.hasRelease(id); }
  putRelease(r: Release) { this.main.putRelease(r); }
  releases(date: string) { return this.main.releases(date); }
  release(id: number) { return this.main.release(id); }
  putStory(s: Story) { this.main.putStory(s); }
  stories(date: string) { return this.main.stories(date); }
  deleteStory(id: string) { this.main.deleteStory(id); }
  deleteRelease(id: number) { this.main.deleteRelease(id); }
  story(id: string) { return this.main.story(id); }
  fitted(key: string) { return this.main.fitted(key); }
  putFitted(key: string, value: Parameters<Store["putFitted"]>[1]) { this.main.putFitted(key, value); }
  forgetFitted(story: string) { this.main.forgetFitted(story); }
  newJob(date: string, job: Parameters<Store["newJob"]>[1]) { return this.main.newJob(date, job); }
  putJob(job: Parameters<Store["putJob"]>[0]) { this.main.putJob(job); }
  job(id: number) { return this.main.job(id); }
  jobs(date?: string, limit = 20) { return this.main.jobs(date, limit); }
  // (the 8-page paper is Capital Kranti's alone: a sister paper has 4 pages)
  setting<T>(key: string, fallback: T): T { return key.startsWith("eightPages|") ? fallback : this.main.setting(key, fallback); }
  putSetting(key: string, value: unknown) { this.main.putSetting(key, value); }

  // ---- its own: ads, edits and issues (the inherited tables, in its database)
  /** The days whose ads are its own (it changed them). */
  private ownDays(): Set<string> { return new Set(super.setting<string[]>("adsOwn", [])); }

  /** Its ads brought up to Capital Kranti's on every day (or `date`) it hasn't changed. */
  syncAds(date?: string) {
    const own = this.ownDays();
    const theirs = (date ? this.main.db.prepare("select id, date, json from ads where date = ?").all(date)
      : this.main.db.prepare("select id, date, json from ads").all()) as { id: string; date: string; json: string }[];
    const mine = date ? [date] : (this.db.prepare("select distinct date from ads").all() as { date: string }[]).map((r) => r.date);
    this.db.exec("begin");
    try {
      for (const d of mine) if (!own.has(d)) this.db.prepare("delete from ads where date = ?").run(d);
      const put = this.db.prepare("insert or replace into ads (id, date, json) values (?, ?, ?)");
      for (const r of theirs) if (!own.has(r.date)) put.run(r.id, r.date, r.json);
      this.db.exec("commit");
    } catch (e) { this.db.exec("rollback"); throw e; }
  }
  /** These days' ads become its own (it's about to change them), starting from Capital Kranti's. */
  ownAds(dates: string[]) {
    const own = this.ownDays();
    const fresh = dates.filter((d) => !own.has(d));
    if (!fresh.length) return;
    for (const d of fresh) this.syncAds(d);
    super.putSetting("adsOwn", [...own, ...fresh].sort());
  }
  ads(date: string): Ad[] {
    this.syncAds(date);
    return super.ads(date);
  }
  putAd(a: Ad) {
    this.ownAds([a.date]);
    super.putAd(a);
  }

  /** Capital Kranti's edits of the stories it didn't change, then its own. */
  edits(date: string): Edit[] {
    const own = super.edits(date);
    const changed = new Set(own.map((e) => e.storyId));
    return [...this.main.edits(date).filter((e) => !changed.has(e.storyId)), ...own].sort((a, b) => a.at.localeCompare(b.at));
  }
  /** Its own edits alone. */
  ownEdits(date: string): Edit[] { return super.edits(date); }
  /** The edits it's laid out with, and its own text edits, put over its wording after it's reworded
   * or translated (editorial/copies.ts: typed in its own language, they're never reworded). */
  layoutEdits(date: string): { edits: Edit[]; mine: Edit[] } {
    const own = this.ownEdits(date);
    const changed = new Set(own.map((e) => e.storyId));
    return { edits: [...this.main.edits(date).filter((e) => !changed.has(e.storyId)), ...own.filter((e) => !textEdit(e))],
             mine: own.filter(textEdit) };
  }
}

const open = new Map<string, SisterStore>();
/** A sister paper's store (opened once). */
export function sisterStore(main: Store, id: string): SisterStore {
  let s = open.get(id);
  if (!s) { s = new SisterStore(main, id); open.set(id, s); }
  return s;
}
/** Whether a sister paper has been made or worked on (it has a database). */
export const hasSisterStore = (id: string) => open.has(id) || existsSync(path.join(sisterDir(id), "paper.sqlite"));
/** Its ads brought up to date, if it's a sister paper (the Ads screen reads the table itself). */
export function syncAds(store: Store) { if (store instanceof SisterStore) store.syncAds(); }
/** These days' ads made a sister paper's own before it changes them (nothing for Capital Kranti). */
export function ownAds(store: Store, dates: string[]) { if (store instanceof SisterStore) store.ownAds(dates); }
