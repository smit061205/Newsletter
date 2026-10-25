// A dry run of the whole engine on real, current news, storing nothing (no
// database, no photo uploads, no Telegram): sources read, items ranked and
// grouped, the checks, and the top few events written in Gujarati, checked
// claim by claim and translated, printed for a person to read.
// Run: OPENROUTER_API_KEY=... node --experimental-strip-types site/engine/try.ts [stories=3]
import { read } from "./collect.ts";
import { freeModels, aiUsed } from "./ai.ts";
import { gate, gather, importance, levelOf, needsTranslation, translate, writeChecked, type ClusterItem } from "./newsroom.ts";
import { SOURCES } from "./sources.ts";
import { keySet, similarity, SAME_EVENT, triageBatch, type TriageInput } from "./triage.ts";

const want = Number(process.argv[2] ?? 3);
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
console.log(`free models: ${(await freeModels()).join(", ")}\n`);

// 1. a sample of sources, every trust level
const pick = SOURCES.filter((s) => ["pib-gu", "pib-en", "rbi", "un", "who", "bbc-world", "bbc-india", "bbc-gu", "the-hindu", "indian-express",
  "toi", "ndtv", "aljazeera", "guardian", "divya-bhaskar", "deshgujarat", "tv9-gu", "altnews", "factly"].includes(s.id));
const items: ClusterItem[] = [];
for (const s of pick) {
  const r = await read(s);
  const fresh = r.items.filter((it) => !it.publishedAt || Date.now() - Date.parse(it.publishedAt) < 18 * 3600_000).slice(0, 12);
  console.log(`${s.id.padEnd(16)} ${String(r.status).padEnd(4)} ${fresh.length} fresh${r.refused ? " (REFUSED)" : ""}`);
  for (const it of fresh) items.push({ id: `${s.id}-${items.length}`, source: s.id, url: it.url, title: it.title, summary: it.summary, lang: s.lang,
    publishedAt: it.publishedAt, seenAt: new Date().toISOString(), image: it.image, triage: null as never });
}

// 2. triage, 40 at a time
for (let i = 0; i < items.length; i += 40) {
  const batch = items.slice(i, i + 40);
  const input: TriageInput[] = batch.map((it, k) => ({ i: k + 1, source: it.source, lang: it.lang, title: it.title, summary: it.summary,
    factcheck: SOURCES.find((s) => s.id === it.source)?.trust === "factcheck" }));
  const res = await triageBatch(null, input);
  if (!res.ok) { console.log(`triage failed: ${res.why}`); process.exit(1); }
  batch.forEach((it, k) => { it.triage = res.value.get(k + 1) ?? { score: 0, tier: "india", genres: [], sensitive: false, event: "", keys: [] }; });
}

// 3. group into events
const groups: ClusterItem[][] = [];
for (const it of items.filter((x) => x.triage.score >= 3 && SOURCES.find((s) => s.id === x.source)?.trust !== "factcheck")) {
  const k = keySet(it.triage.keys);
  const g = groups.find((g) => similarity(k, keySet(g.flatMap((x) => x.triage.keys))) >= SAME_EVENT);
  if (g) g.push(it); else groups.push([it]);
}
const debunks = items.filter((x) => x.triage.debunk).map((x) => ({ claim: x.triage.debunk!, keys: x.triage.keys, url: x.url, source: x.source }));
const ranked = groups.map((g) => {
  const gt = gate(g, g[0].seenAt, debunks);
  const imp = importance(Math.max(...g.map((x) => x.triage.score)), g[0].triage.tier, gt.state === "confirmed" ? gt.groups.length : 1, gt.state === "confirmed" && gt.official);
  return { g, gt, imp };
}).sort((a, b) => b.imp - a.imp);
console.log(`\n${items.length} items -> ${groups.length} events; ${debunks.length} debunked claims seen\n`);
for (const r of ranked.slice(0, 25)) {
  console.log(`${r.imp.toFixed(1).padStart(5)} ${r.gt.state.padEnd(9)} ${r.g[0].triage.tier.padEnd(7)} ${r.g.length} src  ${r.g[0].triage.event}${r.g[0].triage.sensitive ? "  [sensitive]" : ""}`);
}

// 4-5. write, check, translate the top confirmed events
let done = 0;
for (const r of ranked.filter((r) => r.gt.state === "confirmed")) {
  if (done >= want) break;
  const level = levelOf(r.imp);
  if (!level) continue;
  done++;
  const src = await gather(r.g);
  console.log(`\n${"=".repeat(80)}\n${level.toUpperCase()} (${r.imp}) ${r.g[0].triage.event}\nsources: ${src.map((s) => s.source.name).join(", ")}`);
  const res = await writeChecked(null, src, level, today, r.g[0].triage.event);
  if (!res.ok && !res.written) { console.log(`not written: ${res.why}`); continue; }
  const w = res.written!;
  console.log(`\n[${w.kicker}]\n# ${w.headline}\n## ${w.deck}\n\n${w.body}\n\nwriter: ${w.model}; checker: ${res.checked!.model ?? "-"}`);
  console.log(`checks: ${res.checked!.ok ? "all passed" : res.checked!.problems.join("; ")}`);
  console.log(`claims: ${res.checked!.claims.map((c) => `${c.supported ? "✓" : "✗"} ${c.claim}`).join("\n        ")}`);
  if (r.g[0].triage.sensitive) console.log("→ would be HELD for the editor (sensitive)");
  if (needsTranslation(r.g[0].triage.tier)) {
    const en = await translate(null, w, "en", today);
    const hi = await translate(null, w, "hi", today);
    console.log(`\nEN: ${en ? `${en.headline}\n    ${en.deck}` : "(failed its number check)"}\nHI: ${hi ? `${hi.headline}\n    ${hi.deck}` : "(failed its number check)"}`);
  }
}
console.log(`\n${aiUsed()} free AI request(s) used`);
