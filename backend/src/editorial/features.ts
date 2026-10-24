// Feature articles for a short day: when the day's news doesn't fill the
// pages, the desk runs evergreen features -- the season and its coming
// festivals, health, farming, heritage, the home -- as many as the pages
// still need. Written by the AI from general knowledge only, never news: no
// events, no named living people, no quotes and no numbers at all (there's no
// release to check a number against, so any digit throws the article out).
// They print like the news (no kicker, no special title), ranked below it
// and placed on the inside pages, and are marked for an editor's review.
import { profile } from "../profile.ts";
import type { Store, Story } from "../store.ts";
import { DEFAULT_MODEL, env, openRouter } from "./rewrite.ts";
import { inPaperLanguage } from "../layout/stories.ts";


const SCHEMA = {
  name: "features",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["features"],
    properties: {
      features: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["topic", "headline", "deck", "body_long", "body_medium", "body_short"],
          properties: {
            topic: { type: "string", description: "The topic in English, a few words" },
            headline: { type: "string", description: "Headline, 5-10 words" },
            deck: { type: "string", description: "The sub-heading, one line of 8-16 words" },
            body_long: { type: "string", description: "About 500 words, paragraphs separated by a blank line" },
            body_medium: { type: "string", description: "About 60% of body_long" },
            body_short: { type: "string", description: "About 35% of body_long" },
          },
        },
      },
    },
  },
};

// (in the paper's own language: a sister paper's items came out in Gujarati, 24 Oct)
const LANG_NAME = ({ gu: "Gujarati", hi: "Hindi", ur: "Urdu" } as Record<string, string>)[profile.language.lang] ?? "English";
const SYSTEM = `${profile.language.lang === "gu" ? `તમે ગાંધીનગરના ગુજરાતી દૈનિક "${profile.name.split(" (")[0]}" માટે વિશેષ લેખ લખો છો.\n` : ""}` +
`You write evergreen feature articles in clear, formal newspaper ${LANG_NAME} for a day with little news. Write in ${LANG_NAME} only.
Rules -- these are absolute:
- General, well-established knowledge only: the season's health and safety, the season's farming, the meaning and customs of festivals near this time of year, Gujarat's culture, history and places, household tips, the environment, science explained simply.
- Suited to the time of year you are given, and useful or interesting to a Gujarati family.
- NOT news: no events, announcements, schemes, prices, dates or "today/recently".
- No named living people, no quotes, no organisations' claims.
- No numbers of any kind (no digits, no years, no statistics, no percentages). Write "many", "centuries old" and so on instead, in ${LANG_NAME}.
- No medical claims beyond common advice; say "consult a doctor" (in ${LANG_NAME}) where it fits.
- Headline active and plain, no exclamation marks; always a deck.
- Each article on a different topic, and none on a topic in the "avoid" list.
Return JSON matching the schema.`;

const hasDigit = (s: string) => /[0-9૦-૯]/.test(s);

/** Adds `count` feature articles to `date` (on top of any it already has),
 * all from one call. Returns what it cost; null without an API key. */
export async function writeFeatures(store: Store, date: string, count: number,
                                    opts: { log: (s: string) => void; model?: string }): Promise<number | null> {
  const key = env("OPENROUTER_API_KEY");
  if (!key) {
    opts.log("no OPENROUTER_API_KEY in backend/.env: no features written");
    return null;
  }
  const have = store.stories(date).filter((s) => s.id.startsWith("f-"));
  const news = store.stories(date).filter((s) => !s.id.startsWith("f-")).map((s) => s.headline);
  const model = opts.model ?? env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  const day = new Date(`${date}T12:00:00Z`).toLocaleString("en", { day: "numeric", month: "long", timeZone: "UTC" });
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0.6, usage: { include: true },
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Write ${count} feature articles for a ${LANG_NAME} daily, for ${day} (Gujarat, India): ` +
          `on different subjects (health, farming, festivals, culture, history, places, the home, science), each suited to this time of year.\n` +
          `Avoid these topics (already in the paper): ${[...have.map((s) => s.headline), ...news].join(" | ") || "none"}` },
      ],
    }),
  }, 180);
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  const out = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as
    { features: { topic: string; headline: string; deck: string; body_long: string; body_medium: string; body_short: string }[] };
  let n = have.length;
  for (const f of out.features) {
    const all = [f.headline, f.deck, f.body_long, f.body_medium, f.body_short].join(" ");
    if (hasDigit(all)) {
      opts.log(`  feature "${f.topic}" left out: it has a number, and there's no source to check it against`);
      continue;
    }
    const story: Story = {
      id: `f-${date}-${++n}`, releaseId: null, date,
      kicker: "", headline: f.headline.trim(), deck: f.deck.trim(),
      bodies: { long: f.body_long.trim(), medium: f.body_medium.trim(), short: f.body_short.trim() },
      priority: 5, page: 4, photo: null, photos: [], caption: "",
      source: `AI feature (${f.topic})`, model, needsReview: true,
    };
    store.putStory(story);
    opts.log(`  ${story.id}: ${f.topic} -- ${story.headline}`);
  }
  const cost = data.usage?.cost ?? 0;
  opts.log(`features ${date}: ${n - have.length} written (${model}), $${cost.toFixed(3)}`);
  return cost;
}

const BRIEF_SCHEMA = {
  name: "brief",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["headline", "deck", "body"],
    properties: {
      headline: { type: "string", description: "Headline, 2-5 words" },
      deck: { type: "string", description: "The sub-heading, 4-8 words" },
      body: { type: "string", description: "One paragraph of the asked length" },
    },
  },
};

/** "Good to know", in the paper's language (a Hindi paper's briefs came out in Gujarati with the Gujarati name). */
export const BRIEF_KICKER = ({ gu: "જાણવા જેવું", hi: "जानने योग्य", ur: "جاننے کی بات" } as Record<string, string>)[profile.language.lang] ?? "Good to know";

/** A "જાણવા જેવું" item of about `words` words for a hole no story fits:
 * the same rules as a feature (general knowledge, no news, no names, no
 * numbers), on a topic not in `avoid`. Cached per `slot` and length, so a
 * rebuild sets the same words. Null without an API key, or if it can't be
 * trusted (a digit in it). */
export async function writeBrief(store: Store, date: string, slot: string, words: number, avoid: string[],
                                 opts: { log?: (s: string) => void } = {}): Promise<{ story: Story; cost: number } | null> {
  // (each paper's language its own: a Gujarati item once turned up in the Hindi paper)
  const key = `brief|${profile.language.lang}|${date}|${slot}|${words}`;
  const make = (b: { headline: string; deck: string; body: string }): Story => ({
    id: `b-${date}-${slot}`, releaseId: null, date, kicker: "", headline: b.headline.trim(), deck: b.deck.trim(),
    bodies: { long: b.body.trim(), medium: b.body.trim(), short: b.body.trim() },
    priority: 5, page: null, photo: null, photos: [], caption: "", source: "AI brief", model: "", needsReview: true,
  });
  const cached = store.fitted(key);
  if (cached) return cached.body ? { story: make(JSON.parse(cached.body)), cost: 0 } : null;
  if (process.env.CK_FAKE_AI === "1") return null;
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const model = env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0.5, usage: { include: true },
      response_format: { type: "json_schema", json_schema: BRIEF_SCHEMA },
      messages: [
        { role: "system", content: SYSTEM + `\nNow write ONE short "${BRIEF_KICKER}" item: a useful fact or tip in one paragraph of exactly about ${words} words, written in ${LANG_NAME} ` +
          "General knowledge only: no news, no named living people, and no numbers or digits at all (write any amount in words)." },
        { role: "user", content: `Avoid these topics (already in the paper): ${avoid.join(" | ") || "none"}` },
      ],
    }),
  }, 120);
  if (!res.ok) {
    opts.log?.(`  brief failed (OpenRouter ${res.status})`);
    return null;
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  let b: { headline: string; deck: string; body: string };
  try {
    b = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return null;
  }
  // no digits, and in the paper's own language
  const ok = !hasDigit(`${b.headline} ${b.deck} ${b.body}`) && inPaperLanguage(make(b));
  if (!ok) opts.log?.(`  brief not used (${hasDigit(`${b.headline} ${b.deck} ${b.body}`) ? "a number in it" : "not in the paper's language"}): ${b.headline}`);
  store.putFitted(key, { body: ok ? JSON.stringify(b) : "", model });
  return ok ? { story: make(b), cost: data.usage?.cost ?? 0 } : null;
}
