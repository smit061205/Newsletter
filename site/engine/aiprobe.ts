// Asks each free Gemma route a tiny question and a small ranking one, and says
// how long each took and what came back (no database): what to tune when a
// route answers errors or nothing (26 Oct: Google's Gemma gave 500s and timeouts
// on a 25-headline batch).
// Run: GOOGLE_AI_KEY=... OPENROUTER_API_KEY=... node --experimental-strip-types site/engine/aiprobe.ts
import { askJson, freeModels } from "./ai.ts";

const tiny = { system: "Reply with JSON only.", user: 'Reply with exactly {"ok": true}' };
const five = {
  system: 'You rank news for a Gujarati newspaper. Reply with JSON only: {"items":[{"i":1,"score":0}]}, score 0-10 for each item.',
  user: ["1. Gujarat declares four districts drought-hit", "2. Celebrity attends a party", "3. RBI keeps repo rate unchanged",
         "4. Cyclone to hit Andhra coast on 28 October", "5. Local cricket club elects president"].join("\n"),
};
console.log(`models: ${(await freeModels()).join(", ")}`);
for (const m of await freeModels()) {
  for (const [name, q] of [["tiny", tiny], ["five", five]] as const) {
    const t = Date.now();
    // one model at a time: the others set aside for this question
    const res = await askJson(null, { ...q, only: m, maxTokens: 800 }, (v) => v);
    console.log(`${m.padEnd(36)} ${name.padEnd(5)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s  ${res.ok ? `ok ${JSON.stringify(res.value).slice(0, 120)}` : `FAILED ${res.why.slice(0, 200)}`}`);
  }
}
