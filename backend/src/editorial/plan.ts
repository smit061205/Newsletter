// The day's editorial plan: one AI call in which the model is the news
// editor -- it reads every story's headline, sub-heading, opening, length
// and photo, and ranks them for the paper's readers: 1 the day's lead ... 5
// a brief, which picks the front page, the sizes and the order the packer
// fills the pages in. Each rank comes with a reason the newsroom shows, and the
// event the story reports, so one happening prints once (build.ts), and
// whether it will read old by the time the paper is read (5 Nov: "the cabinet
// meets today" and a US election's early leads in the next morning's paper). An
// editor's own rank (an edit) always wins. Cached per day and story set, so
// a rebuild doesn't pay twice and lays the pages out the same.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Store, Story } from "../store.ts";
import { env, openRouter } from "./rewrite.ts";
import { printedDate, profile } from "../profile.ts";

export interface PlanEntry { id: string; rank: number; reason: string; event?: string; outdated?: boolean }

const SCHEMA = {
  name: "plan",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["stories"],
    properties: {
      stories: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["id", "rank", "reason", "event", "outdated"],
          properties: {
            id: { type: "string" },
            rank: { type: "integer", minimum: 1, maximum: 5, description: "1 = the day's lead (one or two), 2 front-page stories, 3 main inside stories, 4 standard, 5 brief" },
            reason: { type: "string", description: "Why, in a few words (English)" },
            event: { type: "string", description: "The one happening it reports, in a few English words; stories on the same happening, or on one visit by one person, carry exactly the same words" },
            outdated: { type: "boolean", description: "true when the story will read old by the time the paper is read" },
          },
        },
      },
    },
  },
};
const Answer = z.object({ stories: z.array(z.object({ id: z.string(), rank: z.number().int().min(1).max(5), reason: z.string(), event: z.string().optional(), outdated: z.boolean().optional() })) });

/** The model's ranking for `stories`, or null (no key, the tests' fake AI, or a failed call). */
export async function planDay(store: Store, date: string, stories: Story[], opts: { log?: (s: string) => void } = {}):
  Promise<{ plan: PlanEntry[]; cost: number } | null> {
  if (!stories.length || process.env.CK_FAKE_AI === "1") return null;
  const ids = stories.map((s) => s.id).sort();
  const key = `plan4|${date}|${createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 12)}`;
  const cached = store.fitted(key);
  if (cached) return { plan: JSON.parse(cached.body), cost: 0 };
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const model = env("OPENROUTER_LEAD_MODEL") ?? profile.editorial.leadModel;
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  // when each story's news came in (India time), and when the paper is read
  const day = date.slice(0, 10), readOn = printedDate(day);
  const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const cameIn = (s: Story) => {
    const at = (s.mergedFrom?.length ? s.mergedFrom : s.releaseId ? [s.releaseId] : []).map((id) => store.release(id)?.fetchedAt ?? "").filter(Boolean).sort().at(-1);
    return at ? ` | came in ${new Date(at).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}` : "";
  };
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
          "Say which stories report the same happening: the same speech, visit, ceremony, announcement or decision, whoever wrote it up, " +
          "even from different angles, carry exactly the same event words. One person's visit to one place on one day is one event, however many " +
          "functions, speeches or inaugurations it took in (1 Nov: the President at two functions in Kurukshetra printed twice). " +
          "Another day, another place or another decision is another event. " +
          `The paper is made on ${longDate(day)} and read ${readOn === day ? "that day" : `on the morning of ${longDate(readOn)}`}; each story says when its news came in. ` +
          `Mark a story outdated when it will read old by then: it announces as still to come something on ${longDate(day)} or earlier (a meeting, a match, ` +
          "a launch \"today\") without what came of it, or it gives early or partial results (leads, counting under way, a search still going on) that " +
          "another story in the list carries further. Of two stories on one happening, the later one, with the newer facts, ranks higher. " +
          "Return every story id given, once." },
        { role: "user", content: stories.map((s) => `${s.id} | ${words(s.bodies.long)} words${s.photo ? " | photo" : ""}${cameIn(s)}${s.translatedFrom ? ` | translated from ${s.translatedFrom === "en" ? "English" : "Hindi"}` : ""}\n` +
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
