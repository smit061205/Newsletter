// Checks every source in sources.ts from where the engine runs (GitHub's
// servers), without the database or the AI: does it answer, does it refuse
// us, how many of its own items does its feed list, and how new is the newest.
// Run: node --experimental-strip-types site/engine/probe.ts [id ...]
import { read } from "./collect.ts";
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
    rows.push(`${state.padEnd(8)}${s.id.padEnd(20)}${String(r.status || "-").padEnd(5)}${String(r.items.length).padStart(4)} items  newest ${age.padStart(5)}  ${s.trust.padEnd(9)} ${r.error ?? ""} ${r.items[0]?.title.slice(0, 60) ?? ""}`);
  }
}));
rows.sort();
console.log(rows.join("\n"));
console.log(`\n${ok} of ${list.length} sources answer with items`);
