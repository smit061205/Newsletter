// Asks each free Gemma route small questions and says how long each took and
// what came back (no database), then tries Google's Gemma on a story-sized task
// with each way of limiting its thinking, to find the settings that answer in
// time (26 Oct: 500s and timeouts on a 25-headline batch; a story's answer came
// back empty because the thinking used up the length).
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
    const res = await askJson(null, { ...q, only: m, maxTokens: 800 }, (v) => v);
    console.log(`${m.padEnd(36)} ${name.padEnd(5)} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s  ${res.ok ? `ok ${JSON.stringify(res.value).slice(0, 120)}` : `FAILED ${res.why.slice(0, 200)}`}`);
  }
}

// a story-sized task, straight to Google, with each thinking setting
const KEY = process.env.GOOGLE_AI_KEY;
if (KEY) {
  const story = `You write ONE news story in Gujarati for a newspaper website, 150-250 words, only from the source. Reply with JSON only: {"headline":"","deck":"","body":""}
SOURCE: The Gujarat government on 26 October 2026 declared four districts drought-affected after rainfall was 40 per cent below normal. Relief of Rs 450 crore was announced for farmers, and fodder depots will open in 120 villages. Chief Minister Bhupendra Patel chaired the meeting in Gandhinagar.`;
  const variants: [string, Record<string, unknown>][] = [
    ["default", {}], ["level low", { thinkingConfig: { thinkingLevel: "low" } }], ["level minimal", { thinkingConfig: { thinkingLevel: "minimal" } }],
    ["budget 0", { thinkingConfig: { thinkingBudget: 0 } }], ["budget 1024", { thinkingConfig: { thinkingBudget: 1024 } }],
  ];
  for (const model of ["gemma-4-26b-a4b-it", "gemma-4-31b-it"]) {
    for (const [name, extra] of variants) {
      const t = Date.now();
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", signal: AbortSignal.timeout(200_000), headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: story }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 12000, ...extra } }),
        });
        const g = await res.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; usageMetadata?: Record<string, number>; error?: { message: string } };
        const parts = g.candidates?.[0]?.content?.parts ?? [];
        const answer = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
        console.log(`${model.padEnd(22)} ${name.padEnd(14)} ${res.status} ${((Date.now() - t) / 1000).toFixed(1).padStart(6)}s  ${g.candidates?.[0]?.finishReason ?? ""}  ` +
          `thinking ${g.usageMetadata?.thoughtsTokenCount ?? 0} tokens, answer ${answer.length} chars  ${g.error ? g.error.message.slice(0, 120) : answer.slice(0, 90).replace(/\s+/g, " ")}`);
      } catch (e) {
        console.log(`${model.padEnd(22)} ${name.padEnd(14)} no answer in ${((Date.now() - t) / 1000).toFixed(0)}s`);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
