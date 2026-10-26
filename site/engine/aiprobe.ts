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

// real-sized work, three tries each, to tell a busy Google from a request it can't take:
// a 12-headline ranking, and a story written from a release's full text
if (KEY) {
  const { triageBatch } = await import("./triage.ts");
  const heads = ["Gujarat declares four districts drought-hit", "Cyclone Arnab to cross Andhra coast", "RBI keeps repo rate unchanged",
    "Celebrity attends a party", "Lok Sabha Speaker opens BRICS forum", "Silver prices fall", "Manipur violence kills 14",
    "ISRO launches PSLV", "Statue of Unity rain forest project", "Lula wins Brazil election", "Local club elects president", "Delhi bans old vehicles"];
  const release = Array.from({ length: 8 }, (_, i) => `Paragraph ${i + 1}: The Gujarat government on 26 October 2026 declared four districts drought-affected after rainfall was 40 per cent below normal. Relief of Rs 450 crore was announced for farmers; fodder depots will open in 120 villages; the Chief Minister chaired the meeting in Gandhinagar.`).join("\n\n");
  const { writeChecked } = await import("./newsroom.ts");
  const { sourceById } = await import("./sources.ts");
  for (let k = 1; k <= 3; k++) {
    let t = Date.now();
    const tr = await triageBatch(null, heads.map((h, i) => ({ i: i + 1, source: "PIB", lang: "en", title: h, summary: "", factcheck: false })));
    console.log(`ranking 12   try ${k}: ${((Date.now() - t) / 1000).toFixed(1)}s ${tr.ok ? `ok (${tr.model}, ${tr.value.size} items)` : `FAILED ${tr.why.slice(0, 160)}`}`);
    t = Date.now();
    const w = await writeChecked(null, [{ source: sourceById.get("pib-gu")!, url: "https://pib.gov.in/x", title: "Drought declared in four districts", text: release, image: null, official: true }], "normal", "2026-10-26", "Gujarat declares drought");
    console.log(`story+check  try ${k}: ${((Date.now() - t) / 1000).toFixed(1)}s ${w.ok ? `ok: ${w.written.headline}` : `FAILED ${w.why.slice(0, 160)}`}`);
  }
}
