// A second paper with no engine changes: "The Sample Herald", a made-up
// English tabloid (publications/sample-english: its own page size, six
// columns, free fonts, its own masthead), built from PIB's English releases
// of 22 Oct 2026 (backend/test/fixtures/pib/english-2026-10-22.json), with
// CK_FAKE_AI=1 standing in for the model and no network.
//
//   CK_PUBLICATION=sample-english DATA_DIR=/tmp/ck-en \
//     node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/sample-english.ts
//
// Exits non-zero when the issue isn't READY.
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../src/config.ts";
import { PUBLICATION } from "../src/profile.ts";

process.env.CK_FAKE_AI = "1";
if (PUBLICATION !== "sample-english" || !DATA_DIR) {
  console.error("run with CK_PUBLICATION=sample-english and a scratch DATA_DIR (the test's database is thrown away)");
  process.exit(2);
}
rmSync(path.join(DATA_DIR, "capital-kranti.sqlite"), { force: true });
const { Store } = await import("../src/store.ts");
const { buildIssue } = await import("../src/build.ts");

const date = "2026-10-22";
const releases = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "pib", "english-2026-10-22.json"), "utf8")) as
  { prid: number; ministry: string; headline: string; subhead: string; paras: string[] }[];
const cut = (ps: string[], share: number) => {
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
// PIB writes some headlines in capitals: a paper sets them in title case
const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
const sentence = (h: string) => (h !== h.toUpperCase() ? h : h.toLowerCase().split(" ")
  .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^(['‘“(]?)(\p{L})/u, (_, q, c) => q + c.toUpperCase()))).join(" "));
const store = new Store();
// a release quoting Devanagari (a Sanskrit verse) can't print in these free
// fonts -- gate F stops such an issue; the test leaves it out
for (const [i, r] of releases.filter((r) => !/[\u0900-\u097F]/.test(r.headline + r.paras.join(" "))).entries()) {
  const body = r.paras.join("\n\n");
  store.putRelease({ id: r.prid, date, url: "", office: r.ministry, headline: r.headline, subhead: r.subhead, body, photos: [], fetchedAt: "",
                     source: "pib", ministry: r.ministry });
  store.putStory({
    id: `p${r.prid}`, releaseId: r.prid, date, kicker: "", headline: sentence(r.headline), deck: sentence(r.subhead),
    bodies: { long: body, medium: cut(r.paras, 0.6), short: cut(r.paras, 0.35) },
    priority: i < 2 ? 1 : i < 6 ? 2 : 3, page: null, photo: null, photos: [], caption: "",
    source: "", model: "fixture", needsReview: false,
  });
}
const { report } = await buildIssue(store, date, { log: (s) => console.log(s), noReview: true, images: true });
console.log(`pages: ${path.join(DATA_DIR, "out", "pages", PUBLICATION, date)}`);
const failed = report.gates.filter((g) => !g.pass);
for (const g of failed) console.error(`FAILED: ${g.gate} -- ${g.detail}`);
process.exitCode = failed.length ? 1 : 0;
