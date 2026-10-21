// The whole layout engine on real copy, without the licensed fonts or the
// day's database: the 8 August issue's stories (archive/frontend-layout-engine/
// article-level-issue-2026-08-08.json) go through the packer, the gap closer,
// the printer and every release gate, set in the free fonts of the dev-test
// profile (scripts/dev_profile.py). Each story's own text stands in as its
// release, and CK_FAKE_AI=1 stands in for the model (rewrite.ts fakeFit): the
// AI paths -- length fitting, briefs, sub-headings -- run with no network.
// Writes the PDF and page images under DATA_DIR (a fresh folder each run).
//
// Two pages by default (TEST_PAGES): the fixture's 15 stories fill two;
// on three its copy runs short, which gates 2 and S5 rightly report.
//
//   CK_PUBLICATION=dev-test DATA_DIR=/tmp/ck-test \
//     node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/pack-0808.ts
//
// Exits non-zero when the issue isn't READY.
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, PUBLIC_DIR, ROOT } from "../src/config.ts";
import { PUBLICATION } from "../src/profile.ts";
import type { Story } from "../src/store.ts";

process.env.CK_FAKE_AI = "1";
if (PUBLICATION !== "dev-test" || !DATA_DIR) {
  console.error("run with CK_PUBLICATION=dev-test and a scratch DATA_DIR (the test's database is thrown away)");
  process.exit(2);
}
rmSync(path.join(DATA_DIR, "capital-kranti.sqlite"), { force: true });
const { Store } = await import("../src/store.ts");
const { buildIssue } = await import("../src/build.ts");

interface Article { id: string; page: number; type: "news" | "article" | "ad"; title: string; kicker?: string;
                    bodyText: string; photoUrl: string; photoCaption?: string }
const src = JSON.parse(readFileSync(path.join(ROOT, "archive/frontend-layout-engine/article-level-issue-2026-08-08.json"), "utf8"));

// photos were re-cut per article when the replica moved to element level
const photo = (url: string) => {
  if (!url) return null;
  if (existsSync(path.join(PUBLIC_DIR, url))) return url;
  const alt = url.replace(/\.jpg$/, "-photo0.jpg");
  return existsSync(path.join(PUBLIC_DIR, alt)) ? alt : null;
};
// The archived data splits some paragraphs at printed line ends: join any
// paragraph that doesn't end a sentence onto the next (test-data repair).
const mend = (text: string) => {
  const out: string[] = [];
  for (const p of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    if (out.length && !/[.?!।”"’)]$/.test(out[out.length - 1])) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out.join("\n\n");
};
const cut = (body: string, share: number) => {
  const ps = body.split(/\n\n/);
  const total = ps.reduce((a, p) => a + p.length, 0);
  const out: string[] = [];
  let n = 0;
  for (const p of ps) {
    if (out.length && n + p.length > share * total) break;
    out.push(p);
    n += p.length;
  }
  return out.join("\n\n");
};

const date = "2026-08-08";
const articles = (src.articles as Article[]).filter((a) => a.type !== "ad");
const stories: Story[] = [];
for (const a of articles) {
  const parent = a.id.replace(/-cont\d*$/, "");
  const story = stories.find((s) => s.id === parent);
  if (story) {
    // a continuation: the rest of the story's text (and any extra photo)
    story.bodies.long = mend(story.bodies.long + "\n\n" + a.bodyText);
    const extra = photo(a.photoUrl);
    if (extra) story.photos = [...(story.photos ?? []), extra];
    continue;
  }
  const p = photo(a.photoUrl);
  stories.push({
    id: a.id, releaseId: null, date, kicker: a.kicker ?? "", headline: a.title, deck: "",
    bodies: { long: mend(a.bodyText), medium: "", short: "" },
    priority: stories.length < 2 ? 1 : a.page === 1 ? 2 : 3, page: null, photo: p, photos: p ? [p] : [],
    caption: a.photoCaption ?? "", source: "", model: "fixture", needsReview: false,
  });
}
const store = new Store();
for (const s of stories) {
  if (!s.headline.trim()) continue; // a continuation whose parent isn't in the data
  // the story's text as its release (the build writes the missing sub-heading)
  const releaseId = stories.indexOf(s) + 1;
  store.putRelease({ id: releaseId, date, url: "", office: s.id, headline: s.headline, subhead: "", body: s.bodies.long,
                     photos: s.photos ?? [], fetchedAt: "" });
  s.bodies.medium = cut(s.bodies.long, 0.6);
  s.bodies.short = cut(s.bodies.long, 0.35);
  store.putStory({ ...s, id: `r${releaseId}`, releaseId, source: s.id });
}
const { report } = await buildIssue(store, date, { log: (s) => console.log(s), noReview: true, images: true, pages: Number(process.env.TEST_PAGES ?? 2) });
console.log(`pages: ${path.join(DATA_DIR, "out", "pages", PUBLICATION, date)}`);
const failed = report.gates.filter((g) => !g.pass);
for (const g of failed) console.error(`FAILED: ${g.gate} -- ${g.detail}`);
process.exitCode = failed.length ? 1 : 0;
