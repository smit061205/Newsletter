// The engine's own checks, without the network, the database or the AI (CI runs
// it: site-engine.yml): feeds read right, an event is confirmed only by an
// official source or two independent outlets, old news and debunked claims are
// stopped, copied wording is caught, and items about one event group together.
// Run: node --experimental-strip-types site/engine/selftest.ts
import assert from "node:assert/strict";
import sharp from "sharp";
import { readJson } from "./ai.ts";
import { drawCover } from "./drawn.ts";
import { ownItem } from "./collect.ts";
import { parseFeed, pageText } from "./feed.ts";
import { copiedShare, gate, importance, levelOf, type ClusterItem } from "./newsroom.ts";
import { SOURCES, sourceById } from "./sources.ts";
import { keySet, placeTier, similarity, SAME_EVENT } from "./triage.ts";
import { commonsAt } from "./wikiphoto.ts";

let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; console.log(`ok  ${name}`); };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const item = (source: string, keys: string[], h = 1, score = 7): ClusterItem => ({
  id: `${source}-${h}`, source, url: `https://${sourceById.get(source)!.hosts[0]}/a`, title: "t", summary: "", lang: "en",
  publishedAt: hoursAgo(h), seenAt: hoursAgo(h), image: null,
  triage: { score, tier: "india", genres: [], sensitive: false, event: "e", keys },
});

test("RSS 2.0 with CDATA, entities and media", () => {
  const xml = `<rss><channel><item><title><![CDATA[Cabinet &amp; budget]]></title><link>https://example.com/a?x=1&amp;y=2</link>
    <description>&lt;p&gt;Summary here&lt;/p&gt;</description><pubDate>Sun, 25 Oct 2026 10:00:00 GMT</pubDate>
    <media:content url="https://example.com/p.jpg" /></item></channel></rss>`;
  const [it] = parseFeed(xml, "https://example.com/");
  assert.equal(it.title, "Cabinet & budget");
  assert.equal(it.url, "https://example.com/a?x=1&y=2");
  assert.equal(it.summary, "Summary here");
  assert.equal(it.publishedAt, "2026-10-25T10:00:00.000Z");
  assert.equal(it.image, "https://example.com/p.jpg");
});
test("Atom with alternate links", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>UK news</title><link rel="alternate" href="/gov/x"/>
    <updated>2026-10-25T09:00:00Z</updated><summary>s</summary></entry></feed>`;
  const [it] = parseFeed(xml, "https://www.gov.uk/");
  assert.equal(it.url, "https://www.gov.uk/gov/x");
});
test("RDF (RSS 1.0) items", () => {
  const xml = `<rdf:RDF><item rdf:about="https://www.dw.com/a"><title>DW item</title><link>https://www.dw.com/a</link><dc:date>2026-10-25T08:00:00Z</dc:date></item></rdf:RDF>`;
  assert.equal(parseFeed(xml, "https://rss.dw.com/").length, 1);
});
test("a page's text skips menus and keeps paragraphs", () => {
  const html = `<nav><p>Home About Contact and many other menu links here</p></nav><article><p>The cabinet approved the new canal repair plan for north Gujarat today.</p></article>
    <meta property="og:image" content="https://x/y.jpg">`;
  const p = pageText(html);
  assert.match(p.text, /cabinet approved/);
  assert.doesNotMatch(p.text, /Home About/);
  assert.equal(p.image, "https://x/y.jpg");
});
test("an item linking off the source's own site isn't its own", () => {
  const bbc = sourceById.get("bbc-world")!;
  assert.ok(ownItem(bbc, "https://www.bbc.com/news/world-1"));
  assert.ok(!ownItem(bbc, "https://evil.example/bbc.com/news"));
});
test("an official source confirms on its own", () => {
  const g = gate([item("pib-en", ["cabinet", "canal", "gujarat"])], hoursAgo(1), []);
  assert.equal(g.state, "confirmed");
});
test("one outlet waits; two outlets of one group still wait; two groups confirm", () => {
  assert.equal(gate([item("bbc-world", ["a", "b", "c"])], hoursAgo(1), []).state, "waiting");
  assert.equal(gate([item("bbc-world", ["a"]), item("bbc-hi", ["a"])], hoursAgo(1), []).state, "waiting");
  assert.equal(gate([item("bbc-world", ["a"]), item("the-hindu", ["a"])], hoursAgo(1), []).state, "confirmed");
});
test("an unconfirmed event is dropped after the wait", () => {
  assert.equal(gate([item("ndtv", ["a"], 1)], hoursAgo(7), []).state, "dropped");
});
test("old news going round again is dropped", () => {
  assert.equal(gate([item("pib-en", ["a"], 72)], hoursAgo(72), []).state, "dropped");
});
test("a debunked claim is blocked", () => {
  const keys = ["rbi", "500", "note", "ban", "withdrawn"];
  const g = gate([item("pib-en", keys)], hoursAgo(1), [{ claim: "RBI withdraws ₹500 notes", keys: ["rbi", "500", "note", "withdrawn"], url: "u", source: "altnews" }]);
  assert.equal(g.state, "blocked");
});
test("copied wording is caught, our own words aren't", () => {
  const src = "રાજ્ય સરકારે આજે નર્મદા નહેરના સમારકામ માટે બે હજાર કરોડ રૂપિયાની યોજનાને મંજૂરી આપી હતી અને કામ તરત શરૂ થશે";
  assert.ok(copiedShare(src, src) > 0.9);
  assert.ok(copiedShare("નર્મદા નહેરના સમારકામ માટે સરકારે યોજના મંજૂર કરી; કામ ઝડપથી શરૂ કરવાની વાત છે અને ખર્ચ મોટો છે", src) < 0.12);
});
test("one event across languages groups by its English keywords", () => {
  const a = keySet(["gujarat", "cabinet", "narmada canal", "2000 crore"]);
  const b = keySet(["narmada", "canal", "repair", "gujarat", "cabinet"]);
  const c = keySet(["isro", "launch", "pslv", "sriharikota"]);
  assert.ok(similarity(a, b) >= SAME_EVENT);
  assert.ok(similarity(a, c) < SAME_EVENT);
});
test("importance: Gujarat news weighs more; more independent sources raise it", () => {
  assert.ok(importance(8, "gujarat", 1, true) > importance(8, "world", 1, true));
  assert.ok(importance(6, "india", 3, false) > importance(6, "india", 1, false));
  assert.equal(levelOf(2), null);
  assert.equal(levelOf(9.6), "lead");
});
test("every source has an id, a group, and its own hosts; ids are unique", () => {
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
  for (const s of SOURCES) assert.ok(s.group && s.hosts.length && (s.url.startsWith("pib:") || s.url.startsWith("http")), s.id);
});
test("a model's JSON is read from a fence, and a cut-off list keeps its finished entries", () => {
  assert.deepEqual(readJson("```json\n{\"a\":1}\n```"), { a: 1 });
  assert.deepEqual(readJson('Here: {"items":[{"i":1},{"i":2},{"i":3,"x"'), { items: [{ i: 1 }, { i: 2 }] });
  assert.equal(readJson("no json at all"), undefined);
});
test("news from outside Gujarat isn't filed under Gujarat", () => {
  assert.equal(placeTier("gujarat", "MIAL asks airlines to submit Navi Mumbai flight shift plans by November 3"), "india");
  assert.equal(placeTier("gujarat", "એરલાઇન્સ નવી મુંબઈ એરપોર્ટ પર ફ્લાઇટ્સ શિફ્ટ કરે"), "india");
  assert.equal(placeTier("gujarat", "Mumbai-Ahmedabad bullet train reaches Surat"), "gujarat");
  assert.equal(placeTier("gujarat", "ભૂપેન્દ્ર પટેલ દિલ્હીમાં વડાપ્રધાનને મળ્યા"), "gujarat");
  assert.equal(placeTier("gujarat", "વડોદરામાં સોની પરિવારના ત્રણ સભ્યોએ આત્મહત્યા કરી"), "gujarat");
  assert.equal(placeTier("india", "Delhi air quality"), "india");
});
test("a cover from Commons is asked for at Wikimedia's own sizes, never larger than its original", () => {
  const p = { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/A.jpg/1280px-A.jpg?utm_source=x", width: 1280, height: 720, full: 4000 };
  assert.deepEqual(commonsAt(p, 1920), { url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/A.jpg/1920px-A.jpg", width: 1920, height: 1080 });
  assert.equal(commonsAt({ ...p, full: 1500 }, 1920).url, "https://upload.wikimedia.org/wikipedia/commons/c/c5/A.jpg");
});
// a drawn cover (no true picture of the subject, 30 Oct) is a 1920 × 1080 picture in every beat
for (const beat of ["ai", "tech", "science"]) {
  const meta = await sharp(await drawCover(beat, "James Webb Space Telescope", "Finding planets around other stars")).metadata();
  assert.equal(`${meta.width}x${meta.height}`, "1920x1080");
}
n++; console.log("ok  a drawn cover is drawn for every beat");
console.log(`\n${n} checks passed (${SOURCES.length} sources listed)`);
