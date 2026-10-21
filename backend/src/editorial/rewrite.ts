// Turns the day's releases into newspaper stories.
//
// With OPENROUTER_API_KEY (backend/.env) a model on OpenRouter rewrites each
// release into the paper's style: a kicker, a headline, a deck, and the body
// at three lengths so the page planner can take whichever fits its space,
// plus a priority and a suggested page. It must not add a single fact the
// release doesn't contain; every number in its output is checked against the
// release and anything unmatched is flagged. Every story is marked for an
// editor's review either way.
//
// Without a key, the releases are used as published (they are already in
// Gujarati): headline, subheading as the deck, and the body cut to three
// lengths at paragraph boundaries.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../config.ts";
import { profile } from "../profile.ts";
import type { Release, Store, Story } from "../store.ts";

/** Chosen by backend/test/compare-models.ts on 21 Oct 2026 releases (every
 * candidate kept every number and name). Anthropic models are left out on
 * cost. GPT-6 Luna writes tight, faithful newspaper Gujarati for ~$0.0007 a
 * story -- the workhorse; Gemini 3.8 Flash (~$0.007, Google is strong in
 * regional languages) takes the day's three lead stories. About $0.04 a day.
 * Override with OPENROUTER_MODEL / OPENROUTER_LEAD_MODEL in backend/.env, or
 * --model for everything. */
export const DEFAULT_MODEL = profile.editorial.workhorseModel;
export const LEAD_MODEL = profile.editorial.leadModel;

export function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(path.join(ROOT, "backend", ".env"), "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}

// releases separate sections with rows of zeros, dashes or stars: not text to print
const filler = /^[\s0૦.\-–—*_=~•]+$/;
const paragraphs = (text: string) => text.split(/\n\s*\n/)
  .map((p) => p.replace(/[0૦]{5,}|[-–—*_=]{4,}/g, "").trim())
  .filter((p) => p && !filler.test(p));

/** The first paragraphs of `body` that add up to at most `share` of it (at least one). */
function cut(body: string, share: number): string {
  const ps = paragraphs(body);
  const total = ps.reduce((a, p) => a + p.length, 0);
  const out: string[] = [];
  let n = 0;
  for (const p of ps) {
    if (out.length && n + p.length > share * total) break;
    out.push(p);
    n += p.length;
  }
  return out.join("\n\n");
}

// Gandhinagar is the paper's home: its own and the state government's news
// lead; district news follows.
function priorityOf(r: Release): number {
  const o = r.office + " " + r.headline;
  if (/મુખ્યમંત્રી/.test(o)) return 1;
  if (/ગાંધીનગર|રાજ્યપાલ|લોકભવન|વિભાગ/.test(o)) return 2;
  if (r.photos.length) return 3;
  return 4;
}

/** A release headline as a newspaper headline: no leading "*" or stray quotes. */
const cleanHead = (h: string) => h.replace(/^[\s*]+|[\s*]+$/g, "").replace(/\s+/g, " ");

export function asIs(r: Release): Story {
  // a dateline-led first paragraph ("આણંદ, બુધવાર :: ...") is how the paper starts a story too
  const body = paragraphs(r.body).join("\n\n");
  return {
    id: `r${r.id}`, releaseId: r.id, date: r.date,
    kicker: "", headline: cleanHead(r.headline), deck: cleanHead(r.subhead),
    bodies: { long: body, medium: cut(body, 0.6), short: cut(body, 0.35) },
    priority: priorityOf(r), page: null,
    photo: r.photos[0] ?? null, caption: "",
    source: r.url, model: "as-is", needsReview: true,
  };
}

const SCHEMA = {
  name: "story",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["kicker", "headline", "deck", "body_long", "body_medium", "body_short", "caption", "priority", "page"],
    properties: {
      kicker: { type: "string", description: "A short line above the headline (4-8 words), or empty" },
      headline: { type: "string", description: "Newspaper headline, 6-14 words" },
      deck: { type: "string", description: "The sub-heading: one supporting line under the headline, 8-16 words -- always" },
      body_long: { type: "string", description: "The full story, paragraphs separated by a blank line" },
      body_medium: { type: "string", description: "About 60% of body_long" },
      body_short: { type: "string", description: "About 35% of body_long, the essentials" },
      caption: { type: "string", description: "A one-line photo caption, or empty" },
      priority: { type: "integer", minimum: 1, maximum: 5, description: "1 = lead story of the day ... 5 = filler" },
      page: { type: "integer", minimum: 1, maximum: 4, description: "Suggested page: 1 front, 2-3 state/district, 4 business/misc" },
    },
  },
};

const SYSTEM = `તમે ગાંધીનગરના ગુજરાતી દૈનિક "કેપિટલ ક્રાંતિ"ના ઉપતંત્રી છો.
You turn a Gujarat government press release into a newspaper story in clear, formal newspaper Gujarati.
Rules:
- Use ONLY facts in the release. Never add names, numbers, dates, places or quotes that are not in it.
- Keep every number, name and date exactly as in the release, written in Gujarati digits (૦-૯) -- except inside English names and codes (ATM 2026, COVID-19).
- Start body_long with the dateline the release uses (e.g. "ગાંધીનગર, મંગળવાર ::"), if it has one.
- Headline: active, specific, no exclamation marks. Always write a deck (the sub-heading: one line adding the next most important fact). The kicker may be empty.
- body_medium and body_short are shorter versions of body_long, keeping the most important facts first.
Return JSON matching the schema.`;

const digits = (s: string) => new Set((s.replace(/[૦-૯]/g, (d) => String("૦૧૨૩૪૫૬૭૮૯".indexOf(d))).match(/\d+(?:[.,]\d+)*/g) ?? []));

export async function rewriteOne(r: Release, model: string, key: string): Promise<{ story: Story; cost: number; seconds: number }> {
  const t0 = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      usage: { include: true },
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Office: ${r.office}\nHeadline: ${r.headline}\nSubheading: ${r.subhead}\n\n${paragraphs(r.body).join("\n\n")}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  // some models wrap JSON in a ```json fence despite the schema
  const out = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  // every number the story uses must be in the release
  const known = digits(`${r.headline} ${r.subhead} ${r.body}`);
  const unknown = [...digits(`${out.headline} ${out.deck} ${out.body_long}`)].filter((n) => !known.has(n));
  const story: Story = {
    id: `r${r.id}`, releaseId: r.id, date: r.date,
    kicker: out.kicker, headline: out.headline, deck: out.deck,
    bodies: { long: out.body_long, medium: out.body_medium, short: out.body_short },
    priority: out.priority, page: out.page,
    photo: r.photos[0] ?? null, caption: out.caption,
    source: r.url, model, needsReview: true,
    ...(unknown.length ? { factCheck: `numbers not in the release: ${unknown.join(", ")}` } : {}),
  };
  return { story, cost: data.usage?.cost ?? 0, seconds: (Date.now() - t0) / 1000 };
}

const gujaratiShare = (s: string) => (s.match(/[\u0A80-\u0AFF]/g)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);

export async function rewriteDay(store: Store, date: string, opts: { log: (s: string) => void; model?: string; force?: boolean }) {
  // The department issues some releases twice, in Gujarati and in English;
  // the English one is the same news -- translating it would print the
  // story twice. Only Gujarati releases become stories.
  const all = store.releases(date);
  const releases = all.filter((r) => gujaratiShare(r.headline + r.body.slice(0, 400)) > 0.5);
  for (const r of all) if (!releases.includes(r)) store.deleteStory(`r${r.id}`);
  if (all.length > releases.length) opts.log(`skipped ${all.length - releases.length} English release(s): the same news is issued in Gujarati`);
  const key = env("OPENROUTER_API_KEY");
  const workhorse = opts.model ?? env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  const lead = opts.model ?? env("OPENROUTER_LEAD_MODEL") ?? LEAD_MODEL;
  if (!key) opts.log(`no OPENROUTER_API_KEY in backend/.env: using ${releases.length} release(s) as published`);
  let spent = 0;
  let failed = 0;
  // the day's three biggest lead stories (the Chief Minister's) get the stronger writer
  const leads = new Set(releases.filter((r) => priorityOf(r) === 1)
    .sort((a, b) => b.body.length - a.body.length).slice(0, profile.editorial.leadStories).map((r) => r.id));
  const one = async (r: Release) => {
    if (!key) return asIs(r);
    // already rewritten by a model: keep it (a rebuild shouldn't pay twice)
    const have = store.story(`r${r.id}`);
    if (have && have.model !== "as-is" && !opts.force) return have;
    const model = leads.has(r.id) ? lead : workhorse;
    try {
      const got = await rewriteOne(r, model, key);
      spent += got.cost;
      if (got.story.factCheck) opts.log(`  ${r.id}: ${got.story.factCheck} -- check before printing`);
      return got.story;
    } catch (e) {
      failed++;
      opts.log(`  ${r.id}: rewrite failed (${e instanceof Error ? e.message : e}); using it as published`);
      return asIs(r);
    }
  };
  for (let i = 0; i < releases.length; i += 5) {
    for (const story of await Promise.all(releases.slice(i, i + 5).map(one))) store.putStory(story);
  }
  opts.log(`rewrite ${date}: ${releases.length} stories` +
           (key ? ` (${workhorse}; leads ${lead}), $${spent.toFixed(3)}${failed ? `, ${failed} kept as published` : ""}` : " (as published)"));
}

const FIT_SCHEMA = {
  name: "fitted_story",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["body"],
    properties: { body: { type: "string", description: "The story body, paragraphs separated by a blank line" } },
  },
};

/** The story body rewritten to about `words` words, from the release's own
 * facts only -- to fill (or free) an exact number of lines on the page.
 * Numbers are checked against the release. Cached per story and length. */
export async function fitLength(store: Store, story: Story, release: Release, words: number,
                                opts: { log?: (s: string) => void } = {}): Promise<{ body: string; cost: number; factCheck?: string } | null> {
  const key = `${story.id}|${words}`;
  const cached = store.fitted(key);
  if (cached) return { body: cached.body, cost: 0, ...(cached.factCheck ? { factCheck: cached.factCheck } : {}) };
  if (process.env.CK_FAKE_AI === "1") return { body: fakeFit(release, words), cost: 0 };
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const model = env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  const current = story.bodies.long;
  const now = current.split(/\s+/).filter(Boolean).length;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0.2, usage: { include: true },
      response_format: { type: "json_schema", json_schema: FIT_SCHEMA },
      messages: [
        { role: "system", content: SYSTEM + `\nNow you are fitting a story to its space on the page: write the body in about ${words} words (it has ${now}). ` +
          (words > now ? "Add detail ONLY from the release below -- never invent anything." : "Shorten it, keeping the most important facts first.") +
          " Keep the dateline. Return JSON {body}." },
        { role: "user", content: `RELEASE:\n${paragraphs(release.body).join("\n\n")}\n\nCURRENT STORY BODY:\n${current}` },
      ],
    }),
  });
  if (!res.ok) {
    opts.log?.(`  ${story.id}: length fit failed (OpenRouter ${res.status})`);
    return null;
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  let body: string;
  try {
    body = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")).body;
  } catch {
    return null;
  }
  body = paragraphs(body).join("\n\n");
  const known = digits(`${release.headline} ${release.subhead} ${release.body}`);
  const unknown = [...digits(body)].filter((n) => !known.has(n));
  const factCheck = unknown.length ? `numbers not in the release: ${unknown.join(", ")}` : undefined;
  store.putFitted(key, { body, model, ...(factCheck ? { factCheck } : {}) });
  return { body, cost: data.usage?.cost ?? 0, ...(factCheck ? { factCheck } : {}) };
}

const DECK_SCHEMA = {
  name: "deck",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["deck"],
    properties: { deck: { type: "string", description: "The sub-heading, one line of 8-16 words" } },
  },
};

/** A sub-heading for a story that has none (every story prints headline,
 * sub-heading, body): written from the release's facts, its numbers checked,
 * cached per story. Null without an API key or when it can't be trusted. */
export async function writeDeck(store: Store, story: Story, release: Release,
                                opts: { log?: (s: string) => void } = {}): Promise<{ deck: string; cost: number } | null> {
  const key = `${story.id}|deck`;
  const cached = store.fitted(key);
  if (cached) return cached.body ? { deck: cached.body, cost: 0 } : null;
  if (process.env.CK_FAKE_AI === "1") return { deck: release.body.split(/\s+/).slice(0, 10).join(" ").replace(/[,.:;]+$/, ""), cost: 0 };
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const model = env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0.2, usage: { include: true },
      response_format: { type: "json_schema", json_schema: DECK_SCHEMA },
      messages: [
        { role: "system", content: SYSTEM + "\nNow write only the sub-heading (deck) for the story below: one line of 8-16 words that adds " +
          "the next most important fact after the headline, without repeating it. Return JSON {deck}." },
        { role: "user", content: `RELEASE:\n${paragraphs(release.body).join("\n\n")}\n\nHEADLINE: ${story.headline}` },
      ],
    }),
  });
  if (!res.ok) {
    opts.log?.(`  ${story.id}: sub-heading failed (OpenRouter ${res.status})`);
    return null;
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  let deck = "";
  try {
    deck = cleanHead(JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")).deck ?? "");
  } catch {
    return null;
  }
  const known = digits(`${release.headline} ${release.subhead} ${release.body}`);
  if ([...digits(deck)].some((n) => !known.has(n))) deck = ""; // a number not in the release: not printed
  store.putFitted(key, { body: deck, model });
  return deck ? { deck, cost: data.usage?.cost ?? 0 } : null;
}

/** TESTS ONLY (CK_FAKE_AI=1): a stand-in for the model's length fit, so the
 * layout's AI paths run with no network -- the release's own sentences, in
 * order (from the start again if it's too short), to about `words` words. */
function fakeFit(release: Release, words: number): string {
  const paras = paragraphs(release.body);
  const out: string[][] = [];
  let n = 0;
  for (let i = 0; n < words && i < 50 * paras.length; i++) {
    const p = paras[i % paras.length].split(/\s+/).filter(Boolean).slice(0, words - n);
    out.push(p);
    n += p.length;
  }
  return out.map((p) => p.join(" ")).join("\n\n").replace(/[^.!?।]$/, (c) => `${c}.`);
}
