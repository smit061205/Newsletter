// The top-up. When the day's Gujarati releases don't fill the paper, the desk
// takes PIB's Hindi and English releases -- the central government's national
// news -- and translates the best of them into the paper's Gujarati:
//
//   1. the day's Hindi and English lists, less any release PIB also issued in
//      Gujarati (its language versions) and less greetings and condolences;
//   2. one cheap AI call ranks the rest for a Gujarat reader, one of each
//      release PIB put out in both languages, nothing the paper already has;
//   3. the best are fetched and translated one by one, each measured as it
//      would print, until the copy reaches the profile's fill target (or the
//      profile sets a daily AI ceiling and it's spent: none by default).
//
// A translation adds nothing: every number in it is checked against the
// original, and each one is marked as translated for the editor, who sees
// the original beside it.
import { fillContext } from "../build.ts";
import { listPib, readRelease, type ListItem } from "../ingest/pib.ts";
import { profile } from "../profile.ts";
import { storyIdOf, type Progress, type Release, type Store, type Story } from "../store.ts";
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
const GREETING = /बधाई|शुभकामना|श्रद्धांजलि|शोक|नमन|स्मरण किया|पुण्यतिथि|जयंती पर|अभिनंदन|सुभाषित|congratulat|condol|greet|tribute|homage|wishes|birth anniversary|death anniversary/i;
const LANGUAGE = { hi: "HINDI", en: "ENGLISH" } as const;
type Foreign = keyof typeof LANGUAGE;

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

/** The candidates' PRIDs, best first for a Gujarati daily in Gandhinagar --
 * all of them that are news (the top-up stops when the pages are full), one
 * of each release in both languages, none the paper has (`printed`). */
async function rankForGujarat(items: (ListItem & { lang: Foreign })[], printed: string[], key: string, model: string):
  Promise<{ order: number[]; cost: number }> {
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0, usage: { include: true },
      response_format: { type: "json_schema", json_schema: RANK_SCHEMA },
      messages: [
        { role: "system", content: "You are the news editor of a Gujarati daily in Gandhinagar, Gujarat. The central government's " +
          "Hindi [HI] and English [EN] press releases are below; many are the same release in both languages. Order them best first " +
          "for Gujarat's readers: anything about Gujarat, then national decisions, schemes and figures that affect ordinary people, " +
          "then other national and international news, then the rest. Include every one that is news. Leave out only greetings, " +
          "condolences and tributes, the second language of a release already listed, and news the paper already prints (its " +
          "Gujarati headlines are given). Return JSON {order: [PRIDs]}." },
        { role: "user", content: `The paper already prints:\n${printed.join("\n") || "(nothing yet)"}\n\nReleases:\n` +
          items.map((i) => `${i.prid} | [${i.lang.toUpperCase()}] ${i.ministry} | ${i.headline}`).join("\n") },
      ],
    }),
  });
  if (!res.ok) throw new Error(`ranking failed (OpenRouter ${res.status})`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  const known = new Set(items.map((i) => i.prid));
  const order = (JSON.parse(unfence(data.choices[0].message.content)).order as number[]).filter((p) => known.has(p));
  return { order: [...new Set(order)], cost: data.usage?.cost ?? 0 };
}

/** One Hindi or English release as a Gujarati story, numbers checked against the original. */
export async function translateOne(r: Release, key: string, model = env("OPENROUTER_TRANSLATE_MODEL") ?? profile.editorial.translateModel):
  Promise<{ story: Story; cost: number }> {
  const res = await openRouter({
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
    body: JSON.stringify({
      model, temperature: 0.2, usage: { include: true },
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [
        { role: "system", content: SYSTEM + `\nThe release below is in ${LANGUAGE[(r.lang as Foreign) ?? "hi"] ?? "HINDI"}. Write the story in GUJARATI: a faithful translation into ` +
          "natural newspaper Gujarati (not word for word), adding nothing that isn't in it. Write people's and places' names as Gujarati " +
          "spells them (નરેન્દ્ર મોદી, નવી દિલ્હી). Every number stays exactly as in the release." +
          (r.lang === "en" ? " Write in Gujarati script throughout: English names, titles and phrases as Gujarati papers write them " +
            "(Viksit Bharat = વિકસિત ભારત, Ministry of Railways = રેલ મંત્રાલય); only well-known abbreviations (ISRO, AI) stay in English letters." : "") },
        { role: "user", content: releaseText(r) },
      ],
    }),
  }, 150);
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
  const out = JSON.parse(unfence(data.choices[0].message.content));
  const unknown = numbersNotIn(`${out.headline} ${out.deck} ${out.body_long}`, `${r.headline} ${r.subhead} ${r.body}`, r.date);
  const story: Story = {
    id: storyIdOf(r), releaseId: r.id, date: r.date,
    kicker: out.kicker, headline: out.headline, deck: out.deck,
    bodies: { long: out.body_long, medium: out.body_medium, short: out.body_short },
    // national news from Delhi: below the Gujarati releases unless the model rates it high
    priority: Math.max(2, out.priority), page: out.page,
    photo: r.photos[0] ?? null, caption: out.caption,
    source: r.url, model, needsReview: true, translatedFrom: r.lang ?? "hi",
    ...(unknown.length ? { factCheck: `numbers not in the ${r.lang === "en" ? "English" : "Hindi"} release: ${unknown.join(", ")}` } : {}),
  };
  return { story, cost: data.usage?.cost ?? 0 };
}

/** The day's world news from All India Radio's English service (ingest/official.ts),
 * translated whatever the pages need -- a few big world stories belong in every
 * paper (24 Oct, the editor) -- all at once. Returns what it cost. */
async function worldNews(store: Store, date: string, key: string, log: (s: string) => void): Promise<number> {
  const done = new Set(store.stories(date).map((s) => s.id));
  const todo = store.releases(date).filter((r) => r.source === "air" && r.lang === "en" && !done.has(storyIdOf(r)));
  if (!todo.length) return 0;
  let cost = 0;
  await Promise.all(todo.map(async (r) => {
    try {
      const got = await translateOne(r, key);
      cost += got.cost;
      store.putStory(got.story);
      log(`  world news: ${got.story.headline.slice(0, 60)}`);
    } catch (e) {
      log(`  world news ${r.id}: translation failed (${e instanceof Error ? e.message : e})`);
    }
  }));
  return cost;
}

/** Translate Hindi releases into `date`'s paper until its copy is enough.
 * Returns what it did; never throws for one bad release. */
export async function topUp(store: Store, date: string, opts: { log: (s: string) => void; force?: boolean; progress?: (p: Progress) => void }):
  Promise<{ before: number; after: number; translated: number; cost: number }> {
  const { log } = opts;
  const key = env("OPENROUTER_API_KEY");
  const target = profile.editorial.fillTarget;
  const ctx = await fillContext(store, date);
  try {
    // first, what's already in Gujarati, by every PRID it goes by
    const gujarati = store.releases(date).filter((r) => r.source === "pib" && (!r.lang || r.lang === "gu"));
    const have = new Set(gujarati.flatMap((r) => [r.id, ...(r.langVersions ?? [])]));
    // a translation the Gujarati release (published later in the day) now covers: the Gujarati one prints
    for (const s of store.stories(date).filter((s) => s.translatedFrom)) {
      const hi = s.releaseId ? store.release(s.releaseId) : null;
      const linked = hi && gujarati.find((g) => g.id === hi.id || (g.langVersions ?? []).includes(hi.id) || (hi.langVersions ?? []).includes(g.id));
      const twin = hi && (linked ?? sameNewsIn(hi, gujarati));
      if (hi && twin) {
        store.deleteStory(s.id);
        ctx.content -= await ctx.areaOf(s);
        log(`  ${hi.id}: now in Gujarati from PIB (${twin.id}), so its translation is dropped`);
      }
    }
    // the day's world news first, whatever the pages need
    let worldCost = 0;
    if (key) {
      const had = store.stories(date).length;
      worldCost = await worldNews(store, date, key, log);
      for (const s of store.stories(date).slice(had)) ctx.content += await ctx.areaOf(s);
    }
    const before = ctx.share();
    log(`the day's Gujarati copy fills ${(before * 100).toFixed(0)}% of the pages (wanted: ${(target * 100).toFixed(0)}%)`);
    if (before >= target && !opts.force) return { before, after: before, translated: 0, cost: 0 };
    if (!key) {
      log("no OPENROUTER_API_KEY in backend/.env: no translations");
      return { before, after: before, translated: 0, cost: 0 };
    }
    const translations = store.stories(date).filter((s) => s.translatedFrom);
    const done = new Set(translations.map((s) => s.releaseId));
    // a release translated already, by every PRID it goes by (its Hindi and English twins)
    const taken = new Set(translations.flatMap((s) => {
      const r = s.releaseId ? store.release(s.releaseId) : null;
      return r ? [r.id, ...(r.langVersions ?? [])] : [];
    }));
    const candidates: (ListItem & { lang: Foreign })[] = [];
    for (const lang of Object.keys(LANGUAGE) as Foreign[]) {
      const list = await listPib(date, lang, store).catch((e: unknown) => {
        log(`PIB ${lang === "hi" ? "Hindi" : "English"}: couldn't read the list (${e instanceof Error ? e.message : e})`);
        return [] as ListItem[];
      });
      const fresh = list.filter((i) => !have.has(i.prid) && !GREETING.test(i.headline));
      log(`PIB ${lang === "hi" ? "Hindi" : "English"}: ${list.length} listed, ${fresh.length} not in Gujarati already and not a greeting`);
      candidates.push(...fresh.map((i) => ({ ...i, lang })));
    }
    if (!candidates.length) return { before, after: before, translated: 0, cost: 0 };
    const printed = store.stories(date).map((s) => s.headline);
    const ranked = await rankForGujarat(candidates, printed, key, env("OPENROUTER_MODEL") ?? DEFAULT_MODEL);
    let cost = ranked.cost + worldCost;
    log(`  ranked for Gujarat's readers: ${ranked.order.length} worth printing`);
    let translated = 0;
    let tried = 0;
    // as many at once as the pages still look short of (from the day's
    // average story), all translated together -- each read from PIB first
    // (one by one, politely) unless the hourly collection has it already
    const order = ranked.order.filter((prid) => !done.has(prid));
    let k = 0;
    while (k < order.length && ctx.share() < target) {
      const ceiling = profile.editorial.dailyBudgetUsd;
      if (ceiling !== undefined && cost >= ceiling) { log(`  the day's AI budget ($${ceiling}) is spent: stopping`); break; }
      const perStory = ctx.content / Math.max(1, store.stories(date).length);
      const need = Math.max(1, Math.ceil(((target - ctx.share()) * ctx.room) / Math.max(1, perStory)));
      const batch: Release[] = [];
      while (batch.length < need && k < order.length) {
        const prid = order[k++];
        const item = candidates.find((c) => c.prid === prid)!;
        opts.progress?.({ done: tried++, total: order.length, label: "translating", item: item.headline });
        if (taken.has(prid)) { log(`  ${prid}: translated already in its other language`); continue; }
        // fetch it (unless collected already); its own page may name a Gujarati version the list didn't
        if (!store.hasRelease(prid)) await readRelease(store, date, item.lang, item);
        const r = store.releases(date).find((x) => x.id === prid && x.lang === item.lang);
        if (!r) { log(`  ${prid}: couldn't read it`); continue; }
        if ((r.langVersions ?? []).some((v) => have.has(v))) { log(`  ${prid}: already in the paper in Gujarati`); continue; }
        if ((r.langVersions ?? []).some((v) => taken.has(v))) { log(`  ${prid}: translated already in its other language`); continue; }
        for (const v of [r.id, ...(r.langVersions ?? [])]) taken.add(v);
        const twin = sameNewsIn(r, gujarati);
        if (twin) { log(`  ${prid}: the same news as Gujarati ${twin.id} (${twin.headline.slice(0, 40)}): not translated`); continue; }
        batch.push(r);
      }
      const results = await Promise.all(batch.map((r) => translateOne(r, key).then((got) => ({ r, got }), (e: unknown) => ({ r, error: e }))));
      for (const x of results) {
        if ("error" in x) { log(`  ${x.r.id}: translation failed (${x.error instanceof Error ? x.error.message : x.error})`); continue; }
        cost += x.got.cost;
        // (the pages filled up with the ones before it: kept all the same, paid
        // for -- the layout's reserve for a hole or a short page)
        store.putStory(x.got.story);
        translated++;
        ctx.content += await ctx.areaOf(x.got.story);
        log(`  ${x.r.id}: translated -- ${x.got.story.headline.slice(0, 60)}` + (x.got.story.factCheck ? ` (${x.got.story.factCheck})` : "") +
            ` -> ${(ctx.share() * 100).toFixed(0)}%`);
      }
    }
    log(`top-up ${date}: ${translated} translated from Hindi and English, the copy now fills ${(ctx.share() * 100).toFixed(0)}%, $${cost.toFixed(3)}`);
    return { before, after: ctx.share(), translated, cost };
  } finally {
    await ctx.close();
  }
}
