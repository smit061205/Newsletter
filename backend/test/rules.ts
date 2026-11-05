// The paper's own rules (CLAUDE.md, "The paper's rules"), read off the printed
// pages a second time, apart from the build's gates: a gate loosened by a
// change can't take its rule with it unseen. Each CI layout test runs it on
// its paper (pack-0808.ts, sample-english.ts); on its own it checks a saved
// day's latest issue, from a COPY of the database:
//
//   CK_PUBLICATION=capital-kranti DATA_DIR=/scratch/copy CK_ENV_FILE=/dev/null \
//     node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/rules.ts DATE
//
// Exits non-zero when a rule is broken.
import type { IssueRender } from "@ck/shared/contract";
import type { BuildReport } from "../src/build.ts";
import { profile } from "../src/profile.ts";
import type { Store } from "../src/store.ts";

type Placed = BuildReport["placed"][number];

/** What breaks the paper's rules on these pages (none: all kept). `photoOf` says
 * whether a story had a photo to print. */
export function paperRules(issue: IssueRender, report: Pick<BuildReport, "placed">, photoOf: (story: string) => boolean = () => false): string[] {
  const out: string[] = [];
  const pt = (px: number) => (px * 72) / issue.dpi;
  const { headline, deck, kicker } = profile.type;
  const placed = new Map<string, Placed>();
  for (const p of report.placed) {
    // the same news prints once
    if (placed.has(p.story)) out.push(`${p.story} printed twice`);
    placed.set(p.story, p);
  }
  const heads = report.placed.map((p) => p.headline.trim());
  for (const h of new Set(heads.filter((h, i) => heads.indexOf(h) !== i))) out.push(`two stories headed "${h}"`);

  let messages = 0;
  const houseAds = new Set<string>();
  for (const page of issue.pages) {
    // the paper's own size, every page
    if (Math.abs(pt(page.width) - profile.page.width) > 1 || Math.abs(pt(page.height) - profile.page.height) > 1)
      out.push(`page ${page.number} is ${pt(page.width).toFixed(1)} x ${pt(page.height).toFixed(1)}pt, not the paper's ${profile.page.width} x ${profile.page.height}`);
    const hasAd = page.elements.some((e) => e.articleId?.startsWith("ad-"));
    // each story's display sizes (the largest line of each), pt
    const size = new Map<string, { h: number; d: number; k: number; body: number; photo: boolean }>();
    for (const e of page.elements) {
      const id = e.articleId;
      if (!id) continue;
      if (id.startsWith("filler-")) {
        if (e.kind === "rect" && e.id.endsWith("-box")) messages++;
        else houseAds.add(id);
        continue;
      }
      if (!placed.has(id)) continue;
      const s = size.get(id) ?? { h: 0, d: 0, k: 0, body: 0, photo: false };
      size.set(id, s);
      if (e.kind === "image") s.photo = true;
      if (e.kind !== "text") continue;
      const role = e.id.slice(id.length).match(/^-([hdk])\d+$|^-c\d+l\d+$/);
      if (!role) continue;
      const key = role[1] === "h" ? "h" : role[1] === "d" ? "d" : role[1] === "k" ? "k" : "body";
      s[key] = Math.max(s[key], pt(e.size));
    }
    for (const [id, s] of size) {
      const p = placed.get(id)!;
      const name = `"${p.headline.slice(0, 40)}"`;
      // every headline big: the profile's least at the least, gap fillers too
      if (s.h && s.h < headline.min - 0.05) out.push(`${name}: headline ${s.h.toFixed(1)}pt, under the paper's ${headline.min}pt`);
      // headline > sub-heading > body, and a kicker smaller than its headline (and none where the paper prints none)
      if (s.d && s.d >= s.h) out.push(`${name}: sub-heading ${s.d.toFixed(1)}pt not smaller than its headline ${s.h.toFixed(1)}pt`);
      if (s.d && s.body >= s.d) out.push(`${name}: body ${s.body.toFixed(1)}pt not smaller than its sub-heading ${s.d.toFixed(1)}pt`);
      if (s.k && s.k >= s.h) out.push(`${name}: kicker ${s.k.toFixed(1)}pt not smaller than its headline`);
      if (s.k && kicker.none) out.push(`${name}: a kicker on a paper that prints none`);
      if (s.d && s.d < deck.min - 0.05) out.push(`${name}: sub-heading ${s.d.toFixed(1)}pt, under the paper's ${deck.min}pt`);
      // one column only where an ad leaves the strip, and never with a photo
      if (p.cols === 1 && !hasAd) out.push(`${name}: one column wide on page ${page.number}, which has no ad`);
      if (p.cols === 1 && s.photo) out.push(`${name}: a photo in a one-column story`);
      // a photo with every story that has one (two columns or wider)
      if (p.cols > 1 && !s.photo && photoOf(id) && p.page === 1 && p.rank === 1) out.push(`${name}: the front lead without its photo`);
    }
  }
  if (messages > profile.fillers.maxMessages) out.push(`${messages} message square(s), the paper allows ${profile.fillers.maxMessages}`);
  if (houseAds.size > Math.min(1, profile.fillers.maxHouseAds)) out.push(`${houseAds.size} house ads, at most ${Math.min(1, profile.fillers.maxHouseAds)} a paper`);
  return out;
}

/** The rules on a store's day: what breaks them, printed; true when all kept. */
export function checkRules(store: Store, date: string): boolean {
  const saved = store.latestIssue(date);
  if (!saved) throw new Error(`no issue saved for ${date}`);
  const stories = new Map(store.stories(date).map((s) => [s.id, s]));
  const broken = paperRules(saved.issue, saved.report as BuildReport, (id) => !!(stories.get(id)?.photo || stories.get(id)?.photos?.length));
  for (const b of broken) console.error(`RULE: ${b}`);
  console.log(broken.length ? `the paper's rules: ${broken.length} broken` : "the paper's rules: all kept");
  return !broken.length;
}

if (process.argv[1] === import.meta.filename) {
  const date = process.argv[2];
  if (!date) { console.error("usage: rules.ts DATE (with DATA_DIR on a copy of the database)"); process.exit(2); }
  const { Store } = await import("../src/store.ts");
  process.exitCode = checkRules(new Store(), date) ? 0 : 1;
}
