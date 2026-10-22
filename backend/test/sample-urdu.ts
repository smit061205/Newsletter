// Right to left: "Sample Urdu Daily", a made-up Urdu tabloid
// (publications/sample-urdu: Noto Nastaliq Urdu, Urdu digits, its own
// masthead), built from PIB's 22 Oct 2026 English releases put into Urdu
// once (backend/test/fixtures/pib/urdu-2026-10-22.json), with CK_FAKE_AI=1
// standing in for the model and no network. Stories and their columns run
// right to left. Skipped where no Nastaliq font is installed.
//
//   CK_PUBLICATION=sample-urdu DATA_DIR=/tmp/ck-ur \
//     node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/sample-urdu.ts
//
// Exits non-zero when the issue isn't READY.
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../src/config.ts";
import { PUBLICATION } from "../src/profile.ts";

process.env.CK_FAKE_AI = "1";
if (PUBLICATION !== "sample-urdu" || !DATA_DIR) {
  console.error("run with CK_PUBLICATION=sample-urdu and a scratch DATA_DIR (the test's database is thrown away)");
  process.exit(2);
}
rmSync(path.join(DATA_DIR, "capital-kranti.sqlite"), { force: true });
// the Nastaliq font: the system's Noto Nastaliq Urdu (macOS), copied in -- none: skipped
const font = path.join(import.meta.dirname, "..", "..", "publications", "sample-urdu", "fonts", "noto-nastaliq-urdu.ttc");
const system = ["/System/Library/Fonts/NotoNastaliq.ttc", "/usr/share/fonts/truetype/noto/NotoNastaliqUrdu-Regular.ttf"].find((f) => existsSync(f));
if (!existsSync(font)) {
  if (!system) { console.log("sample-urdu: skipped (no Nastaliq font on this computer)"); process.exit(0); }
  copyFileSync(system, font);
}
const { Store } = await import("../src/store.ts");
const { buildIssue } = await import("../src/build.ts");

const date = "2026-10-22";
const releases = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "pib", "urdu-2026-10-22.json"), "utf8")) as
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
// (the English test's capitals; Urdu has none)
const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);
const sentence = (h: string) => (h !== h.toUpperCase() ? h : h.toLowerCase().split(" ")
  .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.replace(/^(['‘“(]?)(\p{L})/u, (_, q, c) => q + c.toUpperCase()))).join(" "));
const store = new Store();
for (const [i, r] of releases.entries()) {
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
