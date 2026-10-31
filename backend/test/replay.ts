// The engine's score: saved days laid out again from a COPY of the database,
// with what the AI wrote then and no AI now, one build each and no repairs. How
// many papers come out READY first time is the number a change must not lower
// (the developer, 1 Nov: a fix for one day was breaking others unseen). Hard days
// are the same stories under ads made up to be awkward.
//
//   DATA_DIR=/scratch/copy CK_ENV_FILE=/dev/null node --experimental-strip-types \
//     --experimental-sqlite --no-warnings backend/test/replay.ts [--out score.json] [date ...]
//
// DATA_DIR must hold a copy: builds are saved in it. Never the app's own folder.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, MEDIA_DIR } from "../src/config.ts";

if (!DATA_DIR || /Application Support/.test(DATA_DIR)) {
  console.error("run with DATA_DIR on a scratch copy of the database, never the app's own");
  process.exit(2);
}
const { Store } = await import("../src/store.ts");
const { buildIssue } = await import("../src/build.ts");
type Ad = import("../src/store.ts").Ad;

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
const store = new Store();

/** A sample ad's picture under the copy's own media: the build keeps only the
 * reference set's ads from /chrome/ads/, and each of those only under its one id. */
function pictureOf(url: string): string {
  if (!url.startsWith("/chrome/ads/")) return url;
  const name = path.basename(url);
  const to = path.join(MEDIA_DIR, "ads", `replay-${name}`);
  mkdirSync(path.dirname(to), { recursive: true });
  if (!existsSync(to)) copyFileSync(path.join(import.meta.dirname, "..", "..", "web", "public", "chrome", "ads", name), to);
  return `/media/ads/replay-${name}`;
}

/** The ads a saved issue printed (the days before their ads were kept apart). */
function printedAds(date: string): Ad[] {
  const row = store.db.prepare("select json from issues where date = ? order by version desc limit 1").get(date) as { json: string } | undefined;
  if (!row) return [];
  const issue = JSON.parse(row.json) as { pages: { number: number; elements: { id: string; x: number; y: number; width: number; height: number; url?: string }[] }[] };
  return issue.pages.flatMap((p) => p.elements.filter((e) => e.id.startsWith("ad-") && e.url).map((e) => ({
    id: `replay-${p.number}-${e.id.slice(3)}`, date, page: p.number, x: e.x, y: e.y, width: e.width, height: e.height, url: pictureOf(e.url!), pinned: false,
  })));
}

const setAds = (date: string, ads: Ad[]) => {
  store.db.prepare("delete from ads where date = ?").run(date);
  for (const a of ads) store.putAd(a);
};

/** An ad `cols` wide and `tall` px, on `page`, at its foot: the layout places it. */
const made = (date: string, name: string, page: number, cols: number, tall: number): Ad => ({
  id: `hard-${name}-${page}-${cols}-${tall}`, date, page, x: 0, y: 6100 - tall, width: 549 * cols - 34, height: tall, url: pictureOf("/chrome/ads/ad-film.png"), pinned: false,
});

const HARD: { name: string; ads: (date: string) => Ad[] }[] = [
  { name: "no ads", ads: () => [] },
  { name: "half page wide", ads: (d) => [made(d, "h", 2, 8, 2400), made(d, "h", 4, 8, 2400)] },
  { name: "tall one column", ads: (d) => [made(d, "o", 3, 1, 2600), made(d, "o", 3, 4, 1200), made(d, "o", 4, 1, 900)] },
  { name: "seven columns", ads: (d) => [made(d, "s", 2, 7, 1500), made(d, "s", 3, 7, 900)] },
  { name: "many small", ads: (d) => [2, 3, 4].flatMap((p) => [made(d, "m", p, 2, 700), made(d, "m", p, 2, 1100), made(d, "m", p, 3, 900), made(d, "m", p, 1, 600)]) },
  { name: "front page foot", ads: (d) => [made(d, "f", 1, 8, 800), made(d, "f", 3, 3, 2000), made(d, "f", 3, 2, 1500)] },
];

type Row = { day: string; ready: boolean; failing: string[]; gaps: number; blank: number; oneCol: number; placed: number; seconds: number };
const rows: Row[] = [];

async function play(day: string, date: string) {
  const blanks: number[] = [];
  const t0 = Date.now();
  const r = await buildIssue(store, date, {
    noReview: true,
    log: (s) => { if (process.env.REPLAY_LOG) console.log(s); const m = /page (\d): not laid out/.exec(s); if (m) blanks.push(+m[1]); },
  });
  const rep = r.report as unknown as { gates: { gate: string; pass: boolean }[]; whiteSpace: unknown[]; ready: boolean; placed: { story: string; cols: number }[] };
  rows.push({
    day, ready: rep.ready, failing: rep.gates.filter((g) => !g.pass && !/^[57] /.test(g.gate)).map((g) => g.gate.split(" ")[0]),
    gaps: rep.whiteSpace.length, blank: blanks.length, oneCol: rep.placed.filter((p) => p.cols === 1).length,
    placed: rep.placed.length, seconds: Math.round((Date.now() - t0) / 1000),
  });
  const x = rows[rows.length - 1];
  console.log(`${day.padEnd(30)} ${x.ready ? "READY" : "not  "} ${String(x.seconds).padStart(4)}s  ${x.placed} stories, ${x.oneCol} one-column, ${x.blank} blank, ${x.gaps} gaps  ${x.failing.join(" ")}`);
}

const days = args.length ? args : (store.db.prepare("select distinct date from issues order by date").all() as { date: string }[]).map((d) => d.date).filter((d) => d >= "2026-10-22");
for (const date of days) {
  const printed = store.ads(date).length ? store.ads(date) : printedAds(date);
  setAds(date, printed);
  await play(date, date);
}
const hardDay = days[days.length - 1];
const own = store.ads(hardDay);
for (const h of HARD) {
  setAds(hardDay, h.ads(hardDay));
  store.putSetting("samplesOn", h.name !== "no ads"); // (no ads at all: else the sample ads are placed)
  await play(`hard: ${h.name}`, hardDay);
}
setAds(hardDay, own);

const count = (f: (r: Row) => boolean, of = rows) => of.filter(f).length;
const saved = rows.filter((r) => !r.day.startsWith("hard"));
const hard = rows.filter((r) => r.day.startsWith("hard"));
// (the layout's own failures: gate 6 is what old days' stories said, not how they were set)
const layoutClean = (r: Row) => r.failing.every((g) => g === "6");
console.log(`\nscore: saved days ${count(layoutClean, saved)}/${saved.length} clean layouts first time (${count((r) => r.ready, saved)} READY); hard days ${count(layoutClean, hard)}/${hard.length}; ` +
            `${rows.reduce((a, r) => a + r.blank, 0)} blank pages; ${rows.reduce((a, r) => a + r.oneCol, 0)} one-column stories; ` +
            `longest ${Math.max(...rows.map((r) => r.seconds))}s, ${rows.reduce((a, r) => a + r.seconds, 0)}s in all`);
if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
process.exit(0);
