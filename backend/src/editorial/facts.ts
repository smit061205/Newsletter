// Names, places, organisations, dates and quotations checked against the release
// (the developer, 1 Nov: stories are lengthened unattended, so what they say must be
// looked at as well as how long they run). The numbers have their own check
// (numbersNotIn in rewrite.ts); an AI reads the rest, placed stories only, and a
// story's words are read once (the answer is saved with them). A story that fails
// is written again by the paper's own mending (repair.ts).
import { createHash } from "node:crypto";
import { wordForWord, type Store, type Story } from "../store.ts";
import { DEFAULT_MODEL, env, openRouter } from "./rewrite.ts";

const SYSTEM = `You compare a newspaper story with the press release(s) it was written from. The story may be in another language than the release.
List only clear errors of these kinds:
- a person, organisation or place the story names that the release does not, or names differently (a different person, not a different spelling or translation);
- a date, day or year that differs from the release, or that the release does not give. The release's "today", "tonight" or "tomorrow" count from its date
  (given with it), and the story may be read the next morning: naming that day by its weekday or date, or as "yesterday", is right;
- words printed inside quotation marks and given to someone who did not say them in the release, or changed in meaning. A headline such as "words: a person's name" with no quotation marks is the paper's summary, not a quotation.
Do not list: numbers, general wording, translation choices, spelling or transliteration, the dateline, background every reader knows (the Prime Minister's title, the name of the state or country), or anything you are not sure of.
Return JSON {"problems": [{"kind": "name"|"place"|"date"|"quote", "says": "<the story's words>", "why": "<a few plain words>"}]}: an empty list when there is nothing wrong.`;

const SCHEMA = {
  name: "facts", strict: true,
  schema: { type: "object", additionalProperties: false, required: ["problems"], properties: {
    problems: { type: "array", items: { type: "object", additionalProperties: false, required: ["kind", "says", "why"], properties: {
      kind: { type: "string", enum: ["name", "place", "date", "quote"] }, says: { type: "string" }, why: { type: "string" } } } } } },
};

/** What the story says that its releases don't: empty when it's right, or when the AI can't be reached (the log says so). */
export async function checkFacts(store: Store, story: Story, log: (s: string) => void): Promise<{ problems: string[]; cost: number }> {
  const ids = story.mergedFrom?.length ? story.mergedFrom : story.releaseId ? [story.releaseId] : [];
  const sources = ids.map((id) => store.release(id)).filter((r) => !!r);
  const apiKey = env("OPENROUTER_API_KEY");
  if (!sources.length || !apiKey || wordForWord(story) || process.env.CK_FAKE_AI === "1") return { problems: [], cost: 0 };
  const text = `STORY:\n${story.headline}\n${story.deck}\n${story.bodies.long}`;
  const source = sources.map((r) => `RELEASE (${r.date}):\n${r.headline}\n${r.subhead}\n${r.body}`).join("\n\n");
  const key = `facts2|${story.id}|${createHash("sha256").update(text + source).digest("hex").slice(0, 24)}`;
  const saved = store.fitted(key);
  if (saved) return { problems: JSON.parse(saved.body) as string[], cost: 0 };
  try {
    const res = await openRouter({
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
      body: JSON.stringify({
        model: DEFAULT_MODEL, temperature: 0, usage: { include: true },
        response_format: { type: "json_schema", json_schema: SCHEMA },
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `${source}\n\n${text}` }],
      }),
    }, 60);
    if (!res.ok) { log(`  ${story.id}: names and dates not checked (OpenRouter ${res.status})`); return { problems: [], cost: 0 }; }
    const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
    const got = JSON.parse(data.choices[0].message.content) as { problems: { kind: string; says: string; why: string }[] };
    // (a quotation is only what the story prints in quotation marks)
    const quoted = [...text.matchAll(/["“‘'«]([^"”’'»]{4,})["”’'»]/g)].map((m) => m[1]);
    const said = (p: { kind: string; says: string }) => p.kind !== "quote" || quoted.some((q) => q.includes(p.says.slice(0, 20)) || p.says.includes(q.slice(0, 20)));
    const problems = got.problems.filter(said).map((p) => `${p.kind} "${p.says}": ${p.why}`);
    store.putFitted(key, { body: JSON.stringify(problems), model: DEFAULT_MODEL });
    return { problems, cost: data.usage?.cost ?? 0 };
  } catch (e) {
    log(`  ${story.id}: names and dates not checked (${e instanceof Error ? e.message : e})`);
    return { problems: [], cost: 0 };
  }
}

/** Stories whose length-fitted version failed the check and was dropped: the next
 * layout has them written again (repair.ts counts them as mended). */
export const toRefit = new Set<string>();

/** The paper's placed stories checked. A failing one is flagged for writing again:
 * the story itself, or the fitted version that was printed. */
export async function checkPlaced(store: Store, placed: Story[], log: (s: string) => void): Promise<{ found: { story: string; detail: string }[]; cost: number }> {
  const results = await Promise.all(placed.map(async (s) => ({ s, ...(await checkFacts(store, s, log)) })));
  const found: { story: string; detail: string }[] = [];
  for (const { s, problems } of results) {
    if (!problems.length) continue;
    const detail = `not in the release: ${problems.join("; ")}`;
    found.push({ story: s.id, detail });
    log(`  ${s.id}: ${detail}`);
    const own = store.story(s.id);
    if (own?.bodies.long === s.bodies.long) { if (!own.factCheck) store.putStory({ ...own, factCheck: detail }); continue; }
    const first = !store.fitted(`avoid|${s.id}`);
    store.forgetFitted(s.id);
    store.putFitted(`avoid|${s.id}`, { body: problems.join("; "), model: DEFAULT_MODEL });
    if (first) toRefit.add(s.id); // (once: a second failure stays for the editor)
  }
  return { found, cost: results.reduce((a, r) => a + r.cost, 0) };
}
