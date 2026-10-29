// The editor page's optional AI help for a story or an Aavtikal article the editor writes (29 Oct): spelling, grammar and a clearer
// headline and sub-heading, every fact, name, number and quote kept. Gemini Flash Lite, free (lib/config.ts), with
// the engine's own key: the website needs GOOGLE_AI_KEY among its settings for this, and says so when it hasn't.
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { WEBSITE } from "./config.ts";
import { count } from "./write.ts";

export interface Draft { headline: string; deck: string; body: string }
export type Help = { ok: true; draft: Draft } | { ok: false; why: "nokey" | "busy" | "numbers" | "failed" };

const ASK = `You are the copy editor of a Gujarati newspaper. The editor wrote this news report himself, at the event.
Correct its spelling, grammar and punctuation in Gujarati and make its sentences clear and newspaper-like. Give it a
strong, short headline (at most 12 words) and a one-sentence sub-heading. Keep every fact, name, number, date and quote
exactly as written; add nothing that isn't in the text and leave nothing out. Keep the paragraphs, separated by a blank line.
Reply with JSON only: {"headline":"","deck":"","body":""}`;
/** for an Aavtikal article the editor writes: a long explainer, its "## " sub-headings kept */
const ASK_ARTICLE = `You are the copy editor of a Gujarati magazine's long explainers on AI, technology, science and politics. The
editor wrote this article himself. Correct its spelling, grammar and punctuation in Gujarati and make its sentences clear and
readable. Give it a strong, short headline (at most 12 words) and a one-sentence sub-heading. Keep every fact, name, number,
date and quote exactly as written; add nothing that isn't in the text and leave nothing out. Keep the paragraphs, separated by a
blank line, and keep each line that starts with "## " (a sub-heading) as a line starting with "## ".
Reply with JSON only: {"headline":"","deck":"","body":""}`;

/** the numbers in a text, Gujarati and Devanagari digits read as ordinary ones */
const numbers = (t: string) =>
  new Set((t.replace(/[૦-૯]/g, (d) => String(d.charCodeAt(0) - 0x0ae6)).replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/(\d),(?=\d)/g, "$1").match(/\d+(?:\.\d+)?/g) ?? []));
/** Google's free day ends at midnight in California; the engine counts each model's requests by it (engine/ai.ts) */
const googleDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

export async function help(sql: NeonQueryFunction<false, false> | null, d: Draft, kind: "news" | "article" = "news"): Promise<Help> {
  const key = process.env.GOOGLE_AI_KEY;
  if (!key) return { ok: false, why: "nokey" };
  let busy = false;
  for (const { id } of WEBSITE.gemini.lite) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent`, {
        method: "POST", signal: AbortSignal.timeout(50_000),
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: kind === "article" ? ASK_ARTICLE : ASK }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(d) }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 16_000, responseMimeType: "application/json" },
        }),
      });
      if (sql) await Promise.all([count(sql, `ai_gemini:${id}:${googleDay()}`), count(sql, "ai_google")]).catch(() => null);
      if (res.status === 429 || res.status >= 500) { busy = true; continue; }
      if (!res.ok) continue;
      const g = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
      const text = (g.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      const x = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as Partial<Draft>;
      if (!x.headline || !x.body) continue;
      const out = { headline: String(x.headline).trim(), deck: String(x.deck ?? "").trim(), body: String(x.body).replace(/\r\n/g, "\n").trim() };
      // a number the editor didn't write is never put in his story
      const had = numbers(`${d.headline}\n${d.deck}\n${d.body}`);
      if ([...numbers(`${out.headline}\n${out.deck}\n${out.body}`)].some((n) => !had.has(n))) return { ok: false, why: "numbers" };
      return { ok: true, draft: out };
    } catch { continue; }
  }
  return { ok: false, why: busy ? "busy" : "failed" };
}
