// Checks every source in sources.ts from where the engine runs (GitHub's
// servers), without the database or the AI: does it answer, does it refuse
// us, how many of its own items does its feed list, and how new is the newest.
// Run: node --experimental-strip-types site/engine/probe.ts [id ...]
import { read } from "./collect.ts";
import { ask } from "./fetch.ts";
import { SOURCES } from "./sources.ts";

const only = new Set(process.argv.slice(2));
const list = SOURCES.filter((s) => !only.size || only.has(s.id));
const rows: string[] = [];
let ok = 0;
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < list.length) {
    const s = list[i++];
    const r = await read(s);
    const newest = r.items.map((x) => x.publishedAt).filter(Boolean).sort().at(-1);
    const age = newest ? `${Math.round((Date.now() - Date.parse(newest!)) / 3600_000)}h` : "-";
    const state = r.refused ? "REFUSED" : r.status === 200 && r.items.length ? "ok" : r.status === 200 ? "EMPTY" : "FAIL";
    if (state === "ok") ok++;
    // a feed listing items, none of them on the source's own site: its hosts are wrong
    const foreign = r.listed && !r.items.length ? ` (${r.listed} listed, none on its own hosts)` : "";
    let found = "";
    if (state !== "ok" && !r.refused && !s.url.startsWith("pib:")) {
      // feed discovery: the feeds the site's home page names for programs
      const home = await ask(`https://${s.hosts[0]}/`);
      const feeds = [...home.text.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
        .map((m) => m[0].match(/href=["']([^"']+)/i)?.[1]).filter(Boolean).map((h) => new URL(h!, home.url || `https://${s.hosts[0]}/`).href);
      found = feeds.length ? `\n          feeds named on ${s.hosts[0]}: ${[...new Set(feeds)].slice(0, 4).join("  ")}` : home.status !== 200 ? `\n          home page: ${home.status || home.error}` : "";
    }
    rows.push(`${state.padEnd(8)}${s.id.padEnd(20)}${String(r.status || "-").padEnd(5)}${String(r.items.length).padStart(4)} items  newest ${age.padStart(5)}  ${s.trust.padEnd(9)} ${r.error ?? ""}${foreign} ${r.items[0]?.title.slice(0, 60) ?? ""}${found}`);
  }
}));
rows.sort();
console.log(rows.join("\n"));
console.log(`\n${ok} of ${list.length} sources answer with items`);
