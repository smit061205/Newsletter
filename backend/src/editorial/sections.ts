// The 8-page paper's own pages (the editor, 3 Nov): for each section (profile
// `sections`: business, tech and AI, entertainment, sports), the day's news
// chosen and written in the paper's language.
//
//   1. the candidates: the section's sources' items (ingest/sections.ts), and the
//      day's PIB releases from its ministries that the day's pages didn't print
//   2. the AI picks the page's news, most important first, each a different
//      event (Gujarat's own first), and says which items report the same news
//   3. each pick from a source is written as the paper's own story from the
//      facts of every report of it (a news outlet's words and photos are never
//      printed); the PIB ones are the day's stories as written
//
// Picks and stories are kept under the sections' own day (store.ts sectionsDay):
// a rebuild pays for nothing twice.
import { createHash } from "node:crypto";
import { profile } from "../profile.ts";
import { sectionsDay, storyIdOf, type Release, type Store, type Story } from "../store.ts";
import { DEFAULT_MODEL, env, openRouter, rewriteOne } from "./rewrite.ts";
import type { Section } from "../ingest/sections.ts";
import { creditOf, filePhoto } from "../ingest/commons.ts";

/** The caption under a file photo, before its credit. */
export const FILE_PHOTO = "ફાઇલ ફોટો: ";

/** What the AI is told when it writes a section story from a news outlet's report (and writes it again, editorial/repair.ts). */
export const OWN_WORDS = (title: string, reports: number) =>
  `\nThe text below is ${reports > 1 ? `${reports} news reports of the same news` : reports === 1 ? "a news report" : "one or more news reports of the same news"}, not a press release: write the paper's own story ` +
  `for its "${title}" page from its facts alone, in your own words -- never copy its sentences, and don't name the outlet.`;

/** The most stories chosen for a section page (it prints six or seven; the rest are its reserve). */
const MOST = 9;

const PICK_SCHEMA = {
  name: "section_picks",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["picks"],
    properties: {
      picks: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["id", "same", "photo", "photoIs"],
          properties: {
            id: { type: "string", description: "the chosen item's number" },
            same: { type: "array", items: { type: "string" }, description: "the numbers of the other items that report the same news (one event), if any" },
            photo: { type: "string", description: "the one named person the news is about (or a famous named building or stadium it happens at), exactly as their English Wikipedia article is titled, e.g. \"Glenn Maxwell\", \"Narendra Modi Stadium\"; empty for a company, organisation, team, film, country, state, ministry or idea, or when unsure" },
            photoIs: { type: "string", description: "what that person or place is, as Wikipedia's one-line description would put it, e.g. \"Australian cricketer\", \"Indian businessman\", \"cricket stadium in Ahmedabad\"; empty if photo is empty" },
          },
        },
      },
    },
  },
};

export interface SectionPick { id: string; same: string[]; photo?: string; photoIs?: string }

/** A candidate as the AI reads it. */
const line = (id: string, from: string, headline: string, body: string) => `[${id}] (${from}) ${headline}\n    ${body.replace(/\s+/g, " ").slice(0, 280)}`;

/** The day's section pages' stories: chosen and written. `printed`: the day's paper's story ids (not printed again). */
export async function writeSections(store: Store, date: string, printed: Set<string>, log: (s: string) => void):
  Promise<{ stories: Story[]; cost: number }> {
  const sections = profile.sections ?? [];
  const key = env("OPENROUTER_API_KEY");
  const day = sectionsDay(date);
  const own = store.releases(day);
  const pibReleases = new Map(store.releases(date).filter((r) => r.source === "pib").map((r) => [storyIdOf(r), r]));
  const dayStories = new Map(store.stories(date).map((s) => [s.id, s]));
  let cost = 0;
  const out: Story[] = [];
  const chosen: { section: Section; stories: (Story | null)[]; picks: SectionPick[] }[] = [];
  await Promise.all(sections.map(async (section) => {
    const mine = own.filter((r) => r.section === section.id);
    // (the day's PIB news from the section's ministries, written already, that the day's pages didn't print)
    const ministries = section.ministries ? new RegExp(section.ministries, "i") : null;
    const pib = ministries ? [...pibReleases].filter(([id, r]) => ministries.test(r.ministry ?? "") && dayStories.has(id) && !printed.has(id)) : [];
    // (each item numbered for the AI: it dropped the letter from ids like "s8246043990", 3 Nov's sports chose 1 of 64)
    const candidates = [...mine.map((r) => ({ id: storyIdOf(r), headline: r.headline, from: r.office, body: r.body })),
                        ...pib.map(([id]) => ({ id, headline: dayStories.get(id)!.headline, from: "PIB", body: dayStories.get(id)!.bodies.long }))]
      .map((c, k) => ({ id: c.id, line: line(String(k + 1), c.from, c.headline, c.body) }));
    if (!candidates.length) return log(`  ${section.title}: no news for the page`);
    const got = key ? await pick(store, date, section, candidates.map((c) => c.line), candidates.map((c) => c.id), key, log) : null;
    if (got) cost += got.cost;
    const picks: SectionPick[] = (got?.picks ?? candidates.map((c) => ({ id: c.id, same: [] }))).filter((p) => candidates.some((c) => c.id === p.id)).slice(0, MOST);
    log(`  ${section.title}: ${picks.length} of ${candidates.length} item(s) chosen`);
    const stories = await Promise.all(picks.map(async (p, k): Promise<Story | null> => {
      const priority = k === 0 ? 1 : k < 3 ? 2 : k < 6 ? 3 : 4;
      const pibStory = dayStories.get(p.id);
      if (pibStory && pibReleases.has(p.id)) return { ...pibStory, priority, section: section.id };
      const r = mine.find((x) => storyIdOf(x) === p.id);
      if (!r) return null;
      // (written already, from the same reports: kept)
      const have = store.story(p.id);
      const others = p.same.map((id) => mine.find((x) => storyIdOf(x) === id)).filter((x): x is Release => !!x);
      const merged: Release = others.length ? { ...r, body: [r.body, ...others.map((o) => o.body)].join("\n\n"), photos: [...new Set([...r.photos, ...others.flatMap((o) => o.photos)])] } : r;
      if (have && have.model !== "as-is" && String(have.mergedFrom ?? [r.id]) === String(others.length ? [r.id, ...others.map((o) => o.id)] : [r.id])) {
        // (a file photo is put on as the paper is made, never kept on the story: below)
        const own = have.caption?.startsWith(FILE_PHOTO) ? { ...have, photo: null, photos: [], caption: "" } : have;
        return { ...own, priority, section: section.id };
      }
      if (!key) return null;
      try {
        const w = await rewriteOne(merged, env("OPENROUTER_MODEL") ?? DEFAULT_MODEL, key, 1, OWN_WORDS(section.title, others.length + 1));
        cost += w.cost;
        const story: Story = { ...w.story, priority, section: section.id, ...(others.length ? { mergedFrom: [r.id, ...others.map((o) => o.id)] } : {}) };
        store.putStory(story);
        return story;
      } catch (e) {
        log(`  ${r.headline.slice(0, 50)}: couldn't be written (${e instanceof Error ? e.message : e})`);
        return null;
      }
    }));
    chosen.push({ section, stories, picks });
  }));
  // a story without a photo of its own: a file photo of the one person (or place) it's about, when one
  // passes every check (ingest/commons.ts, 4 Nov) -- each page's leading stories first, and none twice in the paper
  const used = new Set<string>();
  for (const c of chosen) for (const s of c.stories) if (s?.photo) used.add(s.photo);
  const order = chosen.flatMap((c) => c.stories.map((s, k) => ({ c, k, s }))).sort((a, b) => a.k - b.k);
  for (const { c, k, s } of order) {
    const p = c.picks[k];
    if (!s || s.photo || !p.photo || !p.photoIs) continue;
    const got = await filePhoto(store, date, { name: p.photo, is: p.photoIs }, s.headline, log);
    if (!got || used.has(got.url)) continue;
    used.add(got.url);
    c.stories[k] = { ...s, photo: got.url, photos: [got.url], caption: `${FILE_PHOTO}${await creditOf(store, got)}` };
  }
  for (const c of chosen) {
    const list = c.stories.filter((s): s is Story => !!s);
    // (a page leads with a story that has a photo, when one of its first few has: the editor's pages, 28 Oct)
    const lead = list.findIndex((s) => !!s.photo);
    if (lead > 0 && lead < 4) {
      const was = list[0].priority;
      list[0] = { ...list[0], priority: list[lead].priority };
      list[lead] = { ...list[lead], priority: was };
    }
    const shown = list.filter((s) => s.caption?.startsWith(FILE_PHOTO)).length;
    log(`  ${c.section.title}: ${list.filter((s) => s.photo).length} of ${list.length} with a photo${shown ? ` (${shown} file photo(s))` : ""}`);
    out.push(...list);
  }
  return { stories: out, cost };
}

/** The AI's choice of a section page's news, most important first (cached for the same candidates). */
async function pick(store: Store, date: string, section: Section, lines: string[], ids: string[], key: string, log: (s: string) => void):
  Promise<{ picks: SectionPick[]; cost: number } | null> {
  const cacheKey = `sections4|${date}|${section.id}|${createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 12)}`;
  const cached = store.fitted(cacheKey);
  if (cached) return { picks: JSON.parse(cached.body), cost: 0 };
  const model = env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  let cost = 0;
  // (an empty choice from a full list is the AI's slip, not the day's news: asked once more, 3 Nov)
  for (let attempt = 0; attempt < 2; attempt++) try {
    const res = await openRouter({
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
      body: JSON.stringify({
        model, temperature: 0, usage: { include: true },
        response_format: { type: "json_schema", json_schema: PICK_SCHEMA },
        messages: [
          { role: "system", content: `You are the editor of the "${section.title}" page of a Gujarati daily from Gandhinagar, Gujarat. The page is about ${section.about}. ` +
            `From the day's items below, choose ${MOST} for the page (fewer only if fewer are about its subject), the most important first: news that matters to readers in Gujarat, Gujarat's and Gandhinagar's own first, ` +
            `then India's, then the world's. Each choice a different news event; for each, list the other items that report the same event. ` +
            `Leave out items that aren't about the page's subject, gossip, rumours, quizzes, horoscopes, lists of deals or prices to buy, and anything older than the day's news. ` +
            `The items are all from the day's own news (${date}): a match, film or season they look ahead to is still the day's news. ` +
            `For each, name the one person it is about for a file photo (a player, an actor, a businessman, a minister), only when the news is plainly about that person; ` +
            `never a company, team, film or subject: a wrong photo is worse than none.` },
          { role: "user", content: lines.join("\n") },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
    // (the AI answers with the items' numbers)
    const idOf = (n: string) => ids[Number(String(n).replace(/\D/g, "")) - 1];
    const picks = (JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as { picks: SectionPick[] }).picks
      .map((p) => ({ id: idOf(p.id), same: p.same.map(idOf).filter((x): x is string => !!x), photo: p.photo?.trim() ?? "", photoIs: p.photoIs?.trim() ?? "" }))
      .filter((p, i, all) => !!p.id && all.findIndex((q) => q.id === p.id) === i);
    // (an item named as the same news as an earlier pick isn't a pick of its own)
    const seen = new Set<string>();
    const clean = picks.filter((p) => !seen.has(p.id) && (p.same.forEach((s) => seen.add(s)), seen.add(p.id), true));
    cost += data.usage?.cost ?? 0;
    // (a page wants six or more: a list that gives fewer, asked once more, 3 Nov's sports chose 1 of 64)
    if (clean.length < Math.min(6, ids.length) && attempt === 0) continue;
    if (!clean.length) continue;
    store.putFitted(cacheKey, { body: JSON.stringify(clean), model });
    return { picks: clean, cost };
  } catch (e) {
    log(`  ${section.title}: the AI couldn't choose (${e instanceof Error ? e.message : e}): the newest items`);
    return null;
  }
  log(`  ${section.title}: the AI chose nothing: the newest items`);
  return { picks: ids.map((id) => ({ id, same: [] })), cost };
}
