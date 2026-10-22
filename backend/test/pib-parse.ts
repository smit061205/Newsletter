// The PIB parser on saved pages (backend/test/fixtures/pib/, 22 Oct 2026),
// with no network:
//   node --experimental-strip-types --no-warnings backend/test/pib-parse.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { decodeEntities, isoFromDateLine, parseList, parseRelease } from "../src/ingest/pib.ts";

const fx = (f: string) => readFileSync(path.join(import.meta.dirname, "fixtures", "pib", f), "utf8");

assert.equal(isoFromDateLine("22 OCT 2026 11:38AM by PIB Ahmedabad"), "2026-10-22");
assert.equal(decodeEntities("&#39;a&rsquo; &amp;&nbsp;b"), "'a’ & b");

for (const [file, lang] of [["list-gu.html", /[઀-૿]/], ["list-hi.html", /[ऀ-ॿ]/]] as const) {
  const list = parseList(fx(file));
  assert.equal(list.date, "2026-10-22", `${file}: the day shown`);
  assert.ok(list.items.length >= 20, `${file}: ${list.items.length} releases`);
  assert.equal(new Set(list.items.map((i) => i.prid)).size, list.items.length, `${file}: each release once`);
  for (const it of list.items) {
    assert.ok(it.prid > 2_000_000 && it.ministry && lang.test(it.headline), `${file}: ${JSON.stringify(it)}`);
  }
  console.log(`${file}: ${list.items.length} releases, e.g. ${list.items[0].ministry} -- ${list.items[0].headline.slice(0, 50)}`);
}

const r = parseRelease(fx("release-gu-2326427.html"), 2326427)!;
assert.ok(r, "the release parses");
assert.equal(r.ministry, "સંચાર અને સુચના પ્રૌદ્યોગિકી મંત્રાલય");
assert.equal(r.headline, "ટપાલ વિભાગની પેન્શન સંબંધિત સમસ્યાઓના નિરાકરણ માટે 'પેન્શન અદાલત'");
assert.equal(r.date, "2026-10-22");
assert.equal(r.office, "PIB Ahmedabad");
assert.deepEqual(r.langVersions, [2326426]);
assert.ok(r.paras.length >= 3, `${r.paras.length} paragraphs`);
assert.ok(r.paras[0].startsWith("ટપાલ વિભાગ દ્વારા"), r.paras[0]);
assert.ok(!r.paras.some((p) => /\*\*\*|સોશિયલ મીડિયા|@PIB/.test(p)), "no stars or social-media line");
assert.deepEqual(r.photos, [], "share icons aren't photos");
console.log(`release 2326427: ${r.paras.length} paragraphs, ${r.paras.join(" ").split(/\s+/).length} words, versions ${r.langVersions}`);
console.log("pib-parse: ok");
