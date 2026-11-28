// More news for a short day (28 Nov, the developer: "remove aavtikaal. i want only news. you can add
// more news sources if you want"): when the official news, the editor's Telegram news, the website's
// and the translations leave the pages short, the news outlets' Gujarat and India items (profile
// `news`, read by ingest/sections.ts ingestNews where their robots rules allow it) fill them.
//
//   1. the candidates: the day's items not written yet
//   2. the AI picks the news, Gujarat's first, each a different event, none the same news as a story
//      the paper has already (the official sources' are the record)
//   3. each pick is written as the paper's own story from the facts of every report of it -- never an
//      outlet's sentences or photos, never its name -- and checked against them as every story is
//
// The stories are the day's own (after the official news: priority 4 and 5); their reports stay
// under the outlets' day (store.ts newsDay), where the layout and the fact check find them.
import { profile } from "../profile.ts";
import { newsDay, storyIdOf, type Release, type Store, type Story } from "../store.ts";
import { DEFAULT_MODEL, env, rewriteOne } from "./rewrite.ts";
import { line, OWN_WORDS, pick } from "./sections.ts";

/** The most of the outlets' news written in one go. */
const MOST = 16;

/** Up to `want` of the outlets' news written as the day's stories. `written`: how many; null with no AI key. */
export async function writeNews(store: Store, date: string, want: number, log: (s: string) => void): Promise<{ written: number; cost: number } | null> {
  const news = profile.news;
  if (!news || want <= 0) return { written: 0, cost: 0 };
  const key = env("OPENROUTER_API_KEY");
  if (!key) return null;
  const day = store.stories(date);
  const written = new Set(day.map((s) => s.id));
  // (each item once: one already written, or named the same news as one that was, isn't a candidate)
  const merged = new Set(day.flatMap((s) => s.mergedFrom ?? []));
  const items = store.releases(newsDay(date)).filter((r) => !written.has(storyIdOf(r)) && !merged.has(r.id));
  if (!items.length) { log("  the news outlets: nothing new to write"); return { written: 0, cost: 0 }; }
  const candidates = items.map((r, k) => ({ id: storyIdOf(r), line: line(String(k + 1), r.office, r.headline, r.body) }));
  const have = day.map((s) => s.headline).filter(Boolean);
  // (a very short day wants more than a section page's nine: 28 Nov's pages were a third full)
  const got = await pick(store, date, news, candidates.map((c) => c.line), candidates.map((c) => c.id), key, log, have, Math.min(MOST, Math.max(9, want)));
  let cost = got?.cost ?? 0;
  if (!got) return { written: 0, cost };
  const picks = got.picks.slice(0, want);
  log(`  the news outlets: ${picks.length} of ${items.length} item(s) chosen`);
  const model = env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  const stories = await Promise.all(picks.map(async (p, k): Promise<Story | null> => {
    const r = items.find((x) => storyIdOf(x) === p.id);
    if (!r) return null;
    const others = p.same.map((id) => items.find((x) => storyIdOf(x) === id)).filter((x): x is Release => !!x);
    // (the day's own date, not the outlets' day: what the story says is dated by it)
    const report: Release = { ...r, date, photos: [], ...(others.length ? { body: [r.body, ...others.map((o) => o.body)].join("\n\n") } : {}) };
    try {
      let w = await rewriteOne(report, model, key, 1, OWN_WORDS(news.title, others.length + 1));
      cost += w.cost;
      // a number not in the reports: written once more without it, else left out -- there's other news,
      // and a wrong figure is worse than none (28 Nov: "31" where the report said 29)
      if (w.story.factCheck) {
        w = await rewriteOne(report, model, key, 1, OWN_WORDS(news.title, others.length + 1) +
          `\nIMPORTANT: a first version put in numbers that are not in the reports (${w.story.factCheck.replace(/^[^:]*:\s*/, "")}). Use only numbers the reports give.`);
        cost += w.cost;
        if (w.story.factCheck) { log(`  ${r.headline.slice(0, 50)}: ${w.story.factCheck}: left out`); return null; }
      }
      // (after the official news: a story the AI ranks higher still follows theirs)
      return { ...w.story, date, priority: k < 3 ? 4 : 5, page: null, photo: null, photos: [], caption: "",
               ...(others.length ? { mergedFrom: [r.id, ...others.map((o) => o.id)] } : {}) };
    } catch (e) {
      log(`  ${r.headline.slice(0, 50)}: couldn't be written (${e instanceof Error ? e.message : e})`);
      return null;
    }
  }));
  const done = stories.filter((s): s is Story => !!s);
  for (const s of done) store.putStory(s);
  for (const s of done) log(`  ${s.id}: ${s.headline.slice(0, 70)}`);
  return { written: done.length, cost };
}
