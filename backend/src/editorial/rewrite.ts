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
import { ENV_FILE } from "../config.ts";
import { inPaperLanguage } from "../layout/stories.ts";
import { profile } from "../profile.ts";
import { storyIdOf, type Progress, type Release, type Store, type Story } from "../store.ts";

/** Chosen by backend/test/compare-models.ts on 21 Oct 2026 releases (every
 * candidate kept every number and name). Anthropic models are left out on
 * cost. GPT-6 Luna writes tight, faithful newspaper Gujarati for ~$0.0007 a
 * story -- the workhorse; Gemini 3.8 Flash (~$0.007, Google is strong in
 * regional languages) takes the day's three lead stories. About $0.04 a day.
 * Override with OPENROUTER_MODEL / OPENROUTER_LEAD_MODEL in backend/.env, or
 * --model for everything. */
export const DEFAULT_MODEL = profile.editorial.workhorseModel;
export const LEAD_MODEL = profile.editorial.leadModel;

/** One OpenRouter call, read in full, that gives up after `seconds`: a
 * request that never answers would otherwise hold up the whole build. A
 * timeout or network failure comes back as a 504, which every caller already
 * treats as a failed call (the story keeps what it had). */
export async function openRouter(init: RequestInit, seconds = 90): Promise<Response> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", { ...init, signal: AbortSignal.timeout(seconds * 1000) });
    return new Response(await res.text(), { status: res.status });
  } catch (e) {
    return new Response(`no answer in ${seconds}s (${e instanceof Error ? e.message : e})`, { status: 504 });
  }
}

export function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(ENV_FILE, "utf8").split("\n").find((l) => l.startsWith(`${name}=`));
    return line?.slice(name.length + 1).trim() || undefined;
  } catch {
    return undefined;
  }
}

// releases separate sections with rows of zeros, dashes or stars: not text to print
const filler = /^[\s0૦.\-–—*_=~•]+$/;
export const paragraphs = (text: string) => text.split(/\n\s*\n/)
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
// lead; district news follows. From PIB: the Prime Minister and anything
// about Gujarat first, then the President's and the Cabinet's, then the rest.
export function priorityOf(r: Release): number {
  if (r.source === "pib") {
    const o = `${r.ministry ?? ""} ${r.headline}`;
    if (/ગુજરાત|ગાંધીનગર|અમદાવાદ|गुजरात|गांधीनगर|अहमदाबाद/.test(o)) return 1;
    if (/પ્રધાનમંત્રી|प्रधानमंत्री|મંત્રીમંડળ|मंत्रिमंडल/.test(o)) return 2;
    if (/રાષ્ટ્રપતિ|राष्ट्रपति/.test(o) || r.photos.length) return 3;
    return 4;
  }
  const o = r.office + " " + r.headline;
  if (/મુખ્યમંત્રી/.test(o)) return 1;
  if (/ગાંધીનગર|રાજ્યપાલ|લોકભવન|વિભાગ/.test(o)) return 2;
  if (r.photos.length) return 3;
  return 4;
}

/** A release headline as a newspaper headline: no leading "*" or stray quotes. */
export const cleanHead = (h: string) => h.replace(/^[\s*]+|[\s*]+$/g, "").replace(/\s+/g, " ");

export function asIs(r: Release): Story {
  // a dateline-led first paragraph ("આણંદ, બુધવાર :: ...") is how the paper starts a story too
  const body = paragraphs(r.body).join("\n\n");
  return {
    id: storyIdOf(r), releaseId: r.id, date: r.date,
    kicker: "", headline: cleanHead(r.headline), deck: cleanHead(r.subhead),
    bodies: { long: body, medium: cut(body, 0.6), short: cut(body, 0.35) },
    priority: priorityOf(r), page: null,
    photo: r.photos[0] ?? null, caption: "",
    source: r.url, model: "as-is", needsReview: true,
  };
}

export const SCHEMA = {
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

// the paper's language, as the model is told it
const LANGUAGE: Record<string, { name: string; digits: string; dateline: string }> = {
  gu: { name: "Gujarati", digits: "Gujarati digits (૦-૯)", dateline: "ગાંધીનગર, મંગળવાર ::" },
  hi: { name: "Hindi", digits: "Latin digits (0-9), as Hindi papers print them", dateline: "नई दिल्ली, मंगलवार ::" },
  ur: { name: "Urdu", digits: "Latin digits (0-9)", dateline: "نئی دہلی، منگل ::" },
  en: { name: "English", digits: "Latin digits (0-9)", dateline: "NEW DELHI, Tuesday:" },
};
const paperLang = LANGUAGE[profile.language.lang] ?? LANGUAGE.en;
const paperName = profile.name.split(" (")[0];
/** The desk editor the model plays: this paper, in its own language. */
export const SYSTEM = `${profile.language.lang === "gu" ? `તમે ગાંધીનગરના ગુજરાતી દૈનિક "${paperName}"ના ઉપતંત્રી છો.\n` : ""}` +
`You are a sub-editor of the ${paperLang.name} daily "${paperName}". You turn a government press release (a state government's, or the ` +
`central government's from PIB) into a newspaper story in clear, formal newspaper ${paperLang.name}.
Rules:
- Use ONLY facts in the release. Never add names, numbers, dates, places or quotes that are not in it.
- Keep every number, name and date exactly as in the release, written in ${paperLang.digits} -- except inside English names and codes (ATM 2026, COVID-19).
- Start body_long with the dateline the release uses (e.g. "${paperLang.dateline}"), if it has one.
- Headline: active, specific, no exclamation marks. Always write a deck (the sub-heading: one line adding the next most important fact). The kicker may be empty.
- body_medium and body_short are shorter versions of body_long, keeping the most important facts first.
Return JSON matching the schema.`;

/** Every number in `s`, in Latin digits: Gujarati (૦-૯) and Devanagari (०-९) digits read as theirs. */
export const digits = (s: string) => new Set((s.replace(/[૦-૯]/g, (d) => String("૦૧૨૩૪૫૬૭૮૯".indexOf(d)))
  .replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .match(/\d+(?:[.,]\d+)*/g) ?? []));

// small numbers as the releases often spell them, 1-20 (Gujarati, then Hindi)
const NUMBER_WORDS: string[][] = [
  [], ["એક", "एक"], ["બે", "दो"], ["ત્રણ", "तीन"], ["ચાર", "चार"], ["પાંચ", "पांच", "पाँच"], ["છ", "छह", "छः"], ["સાત", "सात"],
  ["આઠ", "आठ"], ["નવ", "नौ"], ["દસ", "दस"], ["અગિયાર", "ग्यारह"], ["બાર", "बारह"], ["તેર", "तेरह"], ["ચૌદ", "चौदह"],
  ["પંદર", "पंद्रह"], ["સોળ", "सोलह"], ["સત્તર", "सत्रह"], ["અઢાર", "अठारह"], ["ઓગણીસ", "उन्नीस"], ["વીસ", "बीस"],
];
/** The numbers in `out` that aren't in `source` -- written in any digits,
 * with or without commas between them, or (up to 20) spelt out there. */
export function numbersNotIn(out: string, source: string, date?: string): string[] {
  const plain = (n: string) => n.replace(/,/g, "");
  const known = new Set([...digits(source)].map(plain));
  // the release's own date (its day, month and year): a story may say "22 October"
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split("-");
    for (const n of [y, m, d, String(Number(m)), String(Number(d))]) known.add(n);
  }
  // "9 हज़ार", "2 લાખ": the same number written out in full
  const latin = source.replace(/[૦-૯]/g, (d) => String("૦૧૨૩૪૫૬૭૮૯".indexOf(d))).replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  for (const m of latin.matchAll(/(\d+(?:\.\d+)?)\s*(हज़ार|हजार|હજાર|लाख|લાખ)/g)) {
    known.add(String(Math.round(Number(m[1]) * (/लाख|લાખ/.test(m[2]) ? 100_000 : 1000))));
  }
  const words = new Set(source.split(/[\s,.;:()'"‘’“”!?।-]+/));
  return [...digits(out)].filter((n) => {
    const v = plain(n);
    if (known.has(v)) return false;
    const k = Number(v);
    return !(Number.isInteger(k) && k >= 1 && k <= 20 && NUMBER_WORDS[k].some((w) => words.has(w) || [...words].some((x) => x.startsWith(w) && x.length <= w.length + 3)));
  });
}

/** What the model is told about a release: where it's from, then its text. */
export const releaseText = (r: Release) =>
  `${r.source === "pib" ? `Source: PIB (Press Information Bureau), ${r.ministry ?? ""}, ${r.office}` : `Office: ${r.office}`}\n` +
  `Headline: ${r.headline}\nSubheading: ${r.subhead}\n\n${paragraphs(r.body).join("\n\n")}`;

// Near-identical releases from one office on the same occasion -- PIB
// issues one "the Prime Minister congratulates ..." per medal winner -- are
// written up as one round-up, the way a desk would print them.
const headWords = (h: string) => new Set(h.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2));
function similar(a: Release, b: Release): boolean {
  if ((a.source ?? "gujinfo") !== (b.source ?? "gujinfo") || (a.ministry ?? a.office) !== (b.ministry ?? b.office)) return false;
  const x = headWords(a.headline), y = headWords(b.headline);
  const both = [...x].filter((w) => y.has(w)).length;
  return both / Math.max(1, new Set([...x, ...y]).size) >= 0.5;
}
/** The releases in groups of the same occasion (most are alone), in order. */
export function groupSimilar(releases: Release[]): Release[][] {
  const groups: Release[][] = [];
  for (const r of releases) {
    const g = groups.find((g) => g.some((m) => similar(m, r)));
    if (g) g.push(r);
    else groups.push([r]);
  }
  return groups;
}
/** A group as one release for the writer: every member's headline and text. */
function merged(group: Release[]): Release {
  if (group.length === 1) return group[0];
  return {
    ...group[0],
    headline: group.map((r) => r.headline).join(" / "),
    subhead: "",
    body: group.map((r) => `${r.headline}\n\n${paragraphs(r.body).join("\n\n")}`).join("\n\n"),
    photos: [...new Set(group.flatMap((r) => r.photos))],
  };
}

export async function rewriteOne(r: Release, model: string, key: string, together = 1): Promise<{ story: Story; cost: number; seconds: number }> {
  const t0 = Date.now();
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      usage: { include: true },
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM + (together > 1 ? `\nThe text below is ${together} releases on the same occasion: write them up as ONE combined story ` +
          "(a round-up) that names everyone and everything in them, with one headline for all." : "") },
        { role: "user", content: releaseText(r) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  // some models wrap JSON in a ```json fence despite the schema
  const out = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  // every number the story uses must be in the release
  const unknown = numbersNotIn(`${out.headline} ${out.deck} ${out.body_long}`, `${r.headline} ${r.subhead} ${r.body}`, r.date);
  const story: Story = {
    id: storyIdOf(r), releaseId: r.id, date: r.date,
    kicker: out.kicker, headline: out.headline, deck: out.deck,
    bodies: { long: out.body_long, medium: out.body_medium, short: out.body_short },
    priority: out.priority, page: out.page,
    photo: r.photos[0] ?? null, caption: out.caption,
    source: r.url, model, needsReview: true,
    ...(unknown.length ? { factCheck: `numbers not in the release: ${unknown.join(", ")}` } : {}),
  };
  return { story, cost: data.usage?.cost ?? 0, seconds: (Date.now() - t0) / 1000 };
}

const SCRIPT: Record<string, RegExp> = { gu: /[\u0A80-\u0AFF]/g, hi: /[\u0900-\u097F]/g, ur: /[\u0600-\u06FF]/g, en: /[A-Za-z]/g };
const share = (s: string, re: RegExp) => (s.match(re)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);
export const gujaratiShare = (s: string) => (s.match(/[\u0A80-\u0AFF]/g)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);

export async function rewriteDay(store: Store, date: string, opts: { log: (s: string) => void; model?: string; force?: boolean;
                                                                   progress?: (p: Progress) => void }) {
  // The department issues some releases twice, in Gujarati and in English;
  // the English one is the same news -- translating it would print the
  // story twice. Only Gujarati releases become stories.
  // (a Gujarati paper translates its Hindi releases instead: editorial/translate.ts)
  const all = store.releases(date).filter((r) => profile.language.lang !== "gu" || r.lang !== "hi");
  // releases in the paper's own script (a release issued in two languages is the same news)
  const own = SCRIPT[profile.language.lang] ?? /[A-Za-z]/g;
  const releases = all.filter((r) => share(r.headline + r.body.slice(0, 400), own) > 0.5);
  for (const r of all) if (!releases.includes(r)) store.deleteStory(storyIdOf(r));
  // a PIB release is only ever "p<PRID>" (never a state-style "r<id>" from older code)
  for (const r of all) if (r.source === "pib") store.deleteStory(`r${r.id}`);
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
  const groups = groupSimilar(releases);
  for (const g of groups) {
    if (g.length < 2) continue;
    opts.log(`  ${g.length} releases on one occasion, written up together: ${g[0].headline.slice(0, 60)}`);
    for (const r of g.slice(1)) store.deleteStory(storyIdOf(r));
  }
  const one = async (group: Release[]) => {
    const r = merged(group);
    const ids = group.map((m) => m.id);
    const withIds = (s: Story): Story => (group.length > 1 ? { ...s, mergedFrom: ids } : s);
    if (!key) return withIds(asIs(r));
    // already rewritten by a model, from the same releases: keep it (a rebuild shouldn't pay twice)
    const have = store.story(storyIdOf(r));
    if (have && have.model !== "as-is" && !opts.force && String(have.mergedFrom ?? [r.id]) === String(group.length > 1 ? ids : [r.id])) return have;
    const model = group.some((m) => leads.has(m.id)) ? lead : workhorse;
    try {
      const got = await rewriteOne(r, model, key, group.length);
      got.story = withIds(got.story);
      spent += got.cost;
      if (got.story.factCheck) opts.log(`  ${r.id}: ${got.story.factCheck} -- check before printing`);
      return got.story;
    } catch (e) {
      failed++;
      opts.log(`  ${r.id}: rewrite failed (${e instanceof Error ? e.message : e}); using it as published`);
      return withIds(asIs(r));
    }
  };
  let written = 0;
  opts.progress?.({ done: 0, total: groups.length, label: "writing" });
  for (let i = 0; i < groups.length; i += 5) {
    for (const story of await Promise.all(groups.slice(i, i + 5).map(one))) {
      store.putStory(story);
      opts.progress?.({ done: ++written, total: groups.length, label: "writing", item: story.headline });
    }
  }
  opts.log(`rewrite ${date}: ${groups.length} stories from ${releases.length} releases` +
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
  if (process.env.CK_FAKE_AI === "1") {
    const body = fakeFit(release, words);
    return inPaperLanguage({ ...story, headline: "", bodies: { long: body, medium: body, short: body } }) ? { body, cost: 0 } : null;
  }
  const apiKey = env("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const model = env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  const current = story.bodies.long;
  const now = current.split(/\s+/).filter(Boolean).length;
  const res = await openRouter({
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
  }, 150); // a long story rewritten in full can take over 90s
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
  // a fit in another language than the paper's (a translated paper's story fitted from its Gujarati release) can't print
  if (!inPaperLanguage({ ...story, headline: "", bodies: { long: body, medium: body, short: body } })) {
    opts.log?.(`  ${story.id}: length fit not in the paper's language: not used`);
    return null;
  }
  const unknown = numbersNotIn(body, `${release.headline} ${release.subhead} ${release.body}`, release.date);
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
  const res = await openRouter({
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
  if (numbersNotIn(deck, `${release.headline} ${release.subhead} ${release.body}`, release.date).length) deck = ""; // a number not in the release: not printed
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
