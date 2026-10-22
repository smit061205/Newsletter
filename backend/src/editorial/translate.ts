// The Hindi top-up. When the day's Gujarati releases don't fill the paper,
// the desk takes PIB's Hindi releases -- the central government's national
// news -- and translates the best of them into the paper's Gujarati:
//
//   1. the day's Hindi list, less any release PIB also issued in Gujarati
//      (its language versions) and less greetings and condolences;
//   2. one cheap AI call ranks the rest for a Gujarat reader;
//   3. the best are fetched and translated one by one, each measured as it
//      would print, until the copy reaches the profile's fill target (or the
//      day's AI budget runs out).
//
// A translation adds nothing: every number in it is checked against the
// Hindi original, and each one is marked "translated from Hindi" for the
// editor, who sees the original beside it.
import { fillContext } from "../build.ts";
import { ingestPib, listPib, type ListItem } from "../ingest/pib.ts";
import { profile } from "../profile.ts";
import { storyIdOf, type Release, type Store, type Story } from "../store.ts";
import { devanagariToGujarati } from "../layout/text.ts";
import { DEFAULT_MODEL, digits, env, numbersNotIn, openRouter, releaseText, SCHEMA, SYSTEM } from "./rewrite.ts";

const unfence = (s: string) => s.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");

// The same news in Hindi and Gujarati, when PIB doesn't link the two: the
// Hindi read in Gujarati letters (names then match: अमित शाह = અમિત શાહ)
// and its figures, against each Gujarati release's opening. Tested on
// 22 Oct 2026: the same event 0.44, different news 0.23 at most.
const SAME_NEWS = 0.3;
const tokens = (t: string) => {
  const head = t.slice(0, 900);
  return new Set([...devanagariToGujarati(head).split(/[^\p{L}\p{M}]+/u).filter((w) => w.length > 3),
                  ...[...digits(head)].map((n) => `#${n.replace(/,/g, "")}`).filter((n) => n.length > 3)]);
};
/** The Gujarati release that is the same news as `r`, if any. */
export function sameNewsIn(r: Pick<Release, "headline" | "body">, gujarati: Release[]): Release | null {
  const a = tokens(`${r.headline} ${r.body}`);
  let best: { g: Release; score: number } | null = null;
  for (const g of gujarati) {
    const b = tokens(`${g.headline} ${g.body}`);
    let both = 0;
    for (const w of a) if (b.has(w)) both++;
    const score = both / Math.max(1, Math.min(a.size, b.size));
    if (score >= SAME_NEWS && (!best || score > best.score)) best = { g, score };
  }
  return best?.g ?? null;
}

// a message on an occasion, not news: a congratulation, condolence, greeting or tribute
const GREETING = /बधाई|शुभकामना|श्रद्धांजलि|शोक|नमन|स्मरण किया|पुण्यतिथि|जयंती पर|अभिनंदन|सुभाषित/;

const RANK_SCHEMA = {
  name: "ranking",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["order"],
    properties: {
      order: {
        type: "array", description: "The releases worth printing, best first; leave out the rest",
        items: { type: "integer" },
      },
    },
  },
};

/** The candidates' PRIDs, best first for a Gujarati daily in Gandhinagar. */
async function rankForGujarat(items: ListItem[], key: string, model: string): Promise<{ order: number[]; cost: number }> {
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0, usage: { include: true },
      response_format: { type: "json_schema", json_schema: RANK_SCHEMA },
      messages: [
        { role: "system", content: "You are the news editor of a Gujarati daily in Gandhinagar, Gujarat. From the central government's " +
          "Hindi press releases below, choose the ones worth printing for Gujarat's readers, best first: anything about Gujarat, then " +
          "national decisions, schemes and figures that affect ordinary people, then major national and international events. Leave out " +
          "routine meetings, greetings, condolences, minor appointments and near-duplicates of each other. Return JSON {order: [PRIDs]}." },
        { role: "user", content: items.map((i) => `${i.prid} | ${i.ministry} | ${i.headline}`).join("\n") },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ranking failed (OpenRouter ${res.status})`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  const known = new Set(items.map((i) => i.prid));
  const order = (JSON.parse(unfence(data.choices[0].message.content)).order as number[]).filter((p) => known.has(p));
  return { order: [...new Set(order)], cost: data.usage?.cost ?? 0 };
}

/** One Hindi release as a Gujarati story, numbers checked against the Hindi. */
export async function translateOne(r: Release, key: string, model = env("OPENROUTER_TRANSLATE_MODEL") ?? profile.editorial.translateModel):
  Promise<{ story: Story; cost: number }> {
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0.2, usage: { include: true },
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM + "\nThe release below is in HINDI. Write the story in GUJARATI: a faithful translation into " +
          "natural newspaper Gujarati (not word for word), adding nothing that isn't in it. Write people's and places' names as Gujarati " +
          "spells them (નરેન્દ્ર મોદી, નવી દિલ્હી). Every number stays exactly as in the release." },
        { role: "user", content: releaseText(r) },
      ],
    }),
  }, 150);
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  const out = JSON.parse(unfence(data.choices[0].message.content));
  const unknown = numbersNotIn(`${out.headline} ${out.deck} ${out.body_long}`, `${r.headline} ${r.subhead} ${r.body}`);
  const story: Story = {
    id: storyIdOf(r), releaseId: r.id, date: r.date,
    kicker: out.kicker, headline: out.headline, deck: out.deck,
    bodies: { long: out.body_long, medium: out.body_medium, short: out.body_short },
    // national news from Delhi: below the Gujarati releases unless the model rates it high
    priority: Math.max(2, out.priority), page: out.page,
    photo: r.photos[0] ?? null, caption: out.caption,
    source: r.url, model, needsReview: true, translatedFrom: "hi",
    ...(unknown.length ? { factCheck: `numbers not in the Hindi release: ${unknown.join(", ")}` } : {}),
  };
  return { story, cost: data.usage?.cost ?? 0 };
}

/** Translate Hindi releases into `date`'s paper until its copy is enough.
 * Returns what it did; never throws for one bad release. */
export async function topUp(store: Store, date: string, opts: { log: (s: string) => void; force?: boolean }):
  Promise<{ before: number; after: number; translated: number; cost: number }> {
  const { log } = opts;
  const key = env("OPENROUTER_API_KEY");
  const target = profile.editorial.fillTarget;
  const ctx = await fillContext(store, date);
  try {
    // first, what's already in Gujarati, by every PRID it goes by
    const gujarati = store.releases(date).filter((r) => r.source === "pib" && r.lang !== "hi");
    const have = new Set(gujarati.flatMap((r) => [r.id, ...(r.langVersions ?? [])]));
    // a translation the Gujarati release (published later in the day) now covers: the Gujarati one prints
    for (const s of store.stories(date).filter((s) => s.translatedFrom === "hi")) {
      const hi = s.releaseId ? store.release(s.releaseId) : null;
      const linked = hi && gujarati.find((g) => g.id === hi.id || (g.langVersions ?? []).includes(hi.id) || (hi.langVersions ?? []).includes(g.id));
      const twin = hi && (linked ?? sameNewsIn(hi, gujarati));
      if (hi && twin) {
        store.deleteStory(s.id);
        ctx.content -= await ctx.areaOf(s);
        log(`  ${hi.id}: now in Gujarati from PIB (${twin.id}), so its translation is dropped`);
      }
    }
    const before = ctx.share();
    log(`the day's Gujarati copy fills ${(before * 100).toFixed(0)}% of the pages (wanted: ${(target * 100).toFixed(0)}%)`);
    if (before >= target && !opts.force) return { before, after: before, translated: 0, cost: 0 };
    if (!key) {
      log("no OPENROUTER_API_KEY in backend/.env: no translations");
      return { before, after: before, translated: 0, cost: 0 };
    }
    const done = new Set(store.stories(date).filter((s) => s.translatedFrom).map((s) => s.releaseId));
    const list = await listPib(date, "hi");
    const candidates = list.filter((i) => !have.has(i.prid) && !GREETING.test(i.headline));
    log(`PIB Hindi: ${list.length} listed, ${candidates.length} not in Gujarati already and not a greeting`);
    if (!candidates.length) return { before, after: before, translated: 0, cost: 0 };
    const ranked = await rankForGujarat(candidates, key, env("OPENROUTER_MODEL") ?? DEFAULT_MODEL);
    let cost = ranked.cost;
    log(`  ranked for Gujarat's readers: ${ranked.order.length} worth printing`);
    let translated = 0;
    for (const prid of ranked.order) {
      if (ctx.share() >= target) break;
      if (cost >= profile.editorial.dailyBudgetUsd) { log(`  the day's AI budget ($${profile.editorial.dailyBudgetUsd}) is spent: stopping`); break; }
      if (done.has(prid)) continue;
      // fetch it; its own page may name a Gujarati version the list didn't
      await ingestPib(store, date, "hi", { only: new Set([prid]), log: () => {} });
      const r = store.releases(date).find((x) => x.id === prid && x.lang === "hi");
      if (!r) { log(`  ${prid}: couldn't read it`); continue; }
      if ((r.langVersions ?? []).some((v) => have.has(v))) { log(`  ${prid}: already in the paper in Gujarati`); continue; }
      const twin = sameNewsIn(r, gujarati);
      if (twin) { log(`  ${prid}: the same news as Gujarati ${twin.id} (${twin.headline.slice(0, 40)}): not translated`); continue; }
      try {
        const got = await translateOne(r, key);
        cost += got.cost;
        store.putStory(got.story);
        translated++;
        ctx.content += await ctx.areaOf(got.story);
        log(`  ${prid}: translated -- ${got.story.headline.slice(0, 60)}` + (got.story.factCheck ? ` (${got.story.factCheck})` : "") +
            ` -> ${(ctx.share() * 100).toFixed(0)}%`);
      } catch (e) {
        log(`  ${prid}: translation failed (${e instanceof Error ? e.message : e})`);
      }
    }
    log(`top-up ${date}: ${translated} translated from Hindi, the copy now fills ${(ctx.share() * 100).toFixed(0)}%, $${cost.toFixed(3)}`);
    return { before, after: ctx.share(), translated, cost };
  } finally {
    await ctx.close();
  }
}
