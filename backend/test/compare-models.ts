// Runs candidate OpenRouter models on the same few releases and saves each
// rewrite side by side, with cost, time and the automatic number check, so a
// person can judge which writes the best newspaper Gujarati.
//   node --experimental-strip-types --experimental-sqlite --no-warnings backend/test/compare-models.ts [date] [ids...]
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUT_DIR, ROOT } from "../src/config.ts";
import { rewriteOne } from "../src/editorial/rewrite.ts";
import { Store } from "../src/store.ts";

const MODELS = ["google/gemini-3.8-flash", "openai/gpt-6-luna"];
const key = readFileSync(path.join(ROOT, "backend", ".env"), "utf8").match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1].trim();
if (!key) throw new Error("no OPENROUTER_API_KEY in backend/.env");
const date = process.argv[2] ?? "2026-10-21";
const ids = process.argv.slice(3).map(Number);
const store = new Store();
const releases = store.releases(date).filter((r) => (ids.length ? ids.includes(r.id) : true)).slice(0, 3);
const rows: unknown[] = [];
for (const r of releases) {
  for (const model of MODELS) {
    try {
      const { story, cost, seconds } = await rewriteOne(r, model, key);
      rows.push({ release: r.id, model, cost, seconds, factCheck: story.factCheck ?? "ok", kicker: story.kicker, headline: story.headline,
                  deck: story.deck, body_long: story.bodies.long, short: story.bodies.short, lengths: [story.bodies.long.length, story.bodies.medium.length, story.bodies.short.length] });
      console.log(`${r.id} ${model.padEnd(30)} $${cost.toFixed(4)} ${seconds.toFixed(1)}s ${story.factCheck ?? "numbers ok"}  ${story.headline.slice(0, 50)}`);
    } catch (e) {
      console.log(`${r.id} ${model.padEnd(30)} FAILED ${e instanceof Error ? e.message.slice(0, 160) : e}`);
      rows.push({ release: r.id, model, error: String(e) });
    }
  }
}
await mkdir(OUT_DIR, { recursive: true });
await writeFile(path.join(OUT_DIR, "model-comparison.json"), JSON.stringify({ releases: releases.map((r) => ({ id: r.id, headline: r.headline, body: r.body })), rows }, null, 1));
console.log(`wrote ${path.join(OUT_DIR, "model-comparison.json")}`);
