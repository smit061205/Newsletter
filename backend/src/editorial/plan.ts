// The day's editorial plan: one AI call in which the model is the news
// editor -- it reads every story's headline, sub-heading, opening, length
// and photo, and ranks them for the paper's readers: 1 the day's lead ... 5
// a brief, which picks the front page, the sizes and the order the packer
// fills the pages in. Each rank comes with a reason the newsroom shows. An
// editor's own rank (an edit) always wins. Cached per day and story set, so
// a rebuild doesn't pay twice and lays the pages out the same.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Store, Story } from "../store.ts";
import { env, openRouter } from "./rewrite.ts";
import { profile } from "../profile.ts";

export interface PlanEntry { id: string; rank: number; reason: string }

const SCHEMA = {
  name: "plan",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["stories"],
    properties: {
      stories: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["id", "rank", "reason"],
          properties: {
            id: { type: "string" },
            rank: { type: "integer", minimum: 1, maximum: 5, description: "1 = the day's lead (one or two), 2 front-page stories, 3 main inside stories, 4 standard, 5 brief" },
            reason: { type: "string", description: "Why, in a few words (English)" },
          },
        },
      },
    },
  },
};
const Answer = z.object({ stories: z.array(z.object({ id: z.string(), rank: z.number().int().min(1).max(5), reason: z.string() })) });

/** The model's ranking for `stories`, or null (no key, the tests' fake AI, or a failed call). */
export async function planDay(store: Store, date: string, stories: Story[], opts: { log?: (s: string) => void } = {}):
  Promise<{ plan: PlanEntry[]; cost: number } | null> {
  if (!stories.length || process.env.CK_FAKE_AI === "1") return null;
  const ids = stories.map((s) => s.id).sort();
  const key = `plan|${date}|${createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 12)}`;
  const cached = store.fitted(key);
  if (cached) return { plan: JSON.parse(cached.body), cost: 0 };
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const model = env("OPENROUTER_LEAD_MODEL") ?? profile.editorial.leadModel;
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0, usage: { include: true },
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: `You are the news editor of "${profile.name.split(" (")[0]}", a Gujarati daily in Gandhinagar, Gujarat. ` +
          `Rank today's stories for its readers, for a ${profile.issue.pages}-page paper. Gujarat first; then national decisions and figures ` +
          "that affect people; then the rest. One or two leads (rank 1), four or five front-page stories (rank 2). Round-ups of " +
          "greetings or congratulations are briefs (5). A story with a photo makes a better front-page story, all else equal. " +
          "Return every story id given, once." },
        { role: "user", content: stories.map((s) => `${s.id} | ${words(s.bodies.long)} words${s.photo ? " | photo" : ""}${s.translatedFrom ? " | from Hindi (national)" : ""}\n` +
          `  ${s.headline}\n  ${s.deck}\n  ${s.bodies.long.slice(0, 220).replace(/\s+/g, " ")}`).join("\n") },
      ],
    }),
  }, 150);
  if (!res.ok) {
    opts.log?.(`  editorial plan failed (OpenRouter ${res.status}): stories keep their own ranks`);
    return null;
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  let plan: PlanEntry[];
  try {
    plan = Answer.parse(JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""))).stories
      .filter((p) => ids.includes(p.id));
  } catch {
    opts.log?.("  editorial plan: unreadable answer, stories keep their own ranks");
    return null;
  }
  store.putFitted(key, { body: JSON.stringify(plan), model });
  return { plan, cost: data.usage?.cost ?? 0 };
}
