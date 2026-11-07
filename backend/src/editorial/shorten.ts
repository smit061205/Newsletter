// A customer's article for the copies, shortened to fit (the developer, 7 Nov: fifteen
// articles of 4,840 words, each at one length, left the copies' pages white and retried;
// "don't touch titles", then "even ticked ones body can be shortened": a ticked one still
// prints in every copy, its body may be shorter).
//
// Once a day and set of articles, before any copy is laid out, each article's body (each
// of its bodies, the copies take them in turn) is written by the AI at a few shorter
// lengths; every copy reads them from the cache (store fitted), none pays again. The
// lengths sit round what suits the day: the copy's room (the day's paper's printed words),
// less the editor's Telegram news and enough of the day's news for a front page, shared
// out over the articles (never a fixed share). The layout then takes, page by page,
// whichever length fills it (editorial/ladder.ts); three fixed lengths side by side never
// end level, 7 Nov's front page came out blank of them.
//
// Its titles, sub-headings and photos are never touched. A length is kept only if it
// keeps every number, names, places, dates and quotes as the original has them
// (editorial/facts.ts checkShortened), adds nothing, and is in the paper's letters.
import { createHash } from "node:crypto";
import type { Store } from "../store.ts";
import type { Article } from "./copies.ts";
import { checkShortened } from "./facts.ts";
import { lettersNotIn, repeats, wordCount } from "./quality.ts";
import { DEFAULT_MODEL, env, numbersNotIn, openRouter, SYSTEM } from "./rewrite.ts";
import { MIN_WORDS } from "./ladder.ts";

/** The day's news a copy keeps beside the articles (share of its room): a front page's lead and a few stories. */
const NEWS_SHARE = 0.3;
/** How short an article may be made (share of its words), and the most the lengths come to. */
const LEAST = 0.4, MOST_KEPT = 0.92;
/** A day with this much room for them (share of their words): their whole text may print too. */
const WHOLE = 0.85;

const sha = (t: string) => createHash("sha1").update(t).digest("hex").slice(0, 16);
/** Where a body's shorter lengths are kept for the day (the copies' workers read it). */
export const cutsKey = (date: string, body: string) => `artcuts|${date}|${sha(body.trim())}`;

/** A body's shorter lengths for the day, longest first (none: it prints whole), and whether its
 * whole text may still print: only on a day with room for it (a crowded one keeps the room for the news). */
export function cutsOf(store: Store, date: string, body: string): { cuts: string[]; whole: boolean } {
  const got = store.fitted(cutsKey(date, body));
  if (!got) return { cuts: [], whole: true };
  try {
    const kept = JSON.parse(got.body) as { cuts: string[]; whole: boolean };
    return { cuts: kept.cuts.filter(Boolean), whole: kept.cuts.length ? kept.whole : true };
  } catch { return { cuts: [], whole: true }; }
}

/** The words the day's paper printed, all four pages: what a copy holds. */
export function roomInWords(store: Store, date: string): number {
  const got = store.latestIssue(date);
  const pages = (got?.issue as { pages?: { elements: { kind: string; articleId?: string; plainText?: string; text?: string }[] }[] } | undefined)?.pages ?? [];
  return pages.reduce((a, p) => a + p.elements.reduce((b, e) => b + (e.kind === "text" && e.articleId ? wordCount(e.plainText ?? "") : 0), 0), 0);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** The articles' bodies shortened for `date`, kept for the copies. */
export async function shortenArticles(store: Store, date: string, articles: Article[], say: (s: string) => void): Promise<{ cost: number }> {
  const loose = articles.filter((a) => a.bodies.some((b) => b.trim()));
  if (!loose.length) return { cost: 0 };
  const room = roomInWords(store, date);
  if (!room) { say("the articles print whole: the day's paper's room isn't known"); return { cost: 0 }; }
  const words = (a: Article) => mean(a.bodies.filter((b) => b.trim()).map(wordCount));
  const telegram = store.stories(date).filter((s) => s.source.startsWith("telegram:")).reduce((t, s) => t + wordCount(s.bodies.long), 0);
  const theirs = loose.reduce((t, a) => t + words(a), 0);
  const left = room * (1 - NEWS_SHARE) - telegram;
  const scale = Math.max(LEAST, Math.min(1, left / theirs));
  say(`the copy holds about ${Math.round(room)} words, the editor's news ${telegram} of them: the ${loose.length} article(s), ` +
      `${Math.round(theirs)} words, written to about ${Math.round(scale * 100)}% of their length, in a few lengths (their titles and photos as given)`);
  const key = env("OPENROUTER_API_KEY");
  let cost = 0, kept = 0, bodies = 0;
  await Promise.all(loose.flatMap((a) => a.bodies.filter((b) => b.trim()).map(async (body) => {
    bodies++;
    const has = wordCount(body);
    // round the day's length, a little longer and shorter (the layout picks); never past the
    // original's, never under the paper's shortest story
    const targets = [...new Set([1.2, 1, 0.8, 0.65].map((k) => Math.round(Math.min(has * MOST_KEPT, Math.max(MIN_WORDS, has * scale * k)))))]
      .filter((t, x, all) => t < has * 0.95 && all.findIndex((u) => Math.abs(u - t) < t * 0.08) === x);
    if (!targets.length || (!key && process.env.CK_FAKE_AI !== "1")) return;
    const got = await lengths(store, `z-fixed-${articles.indexOf(a) + 1}`, a.titles[0] ?? "", body, targets, key ?? "", say);
    cost += got.cost;
    // (the original stays the longest while the day has room for it: a light day may print it whole)
    if (got.bodies.length) { kept++; store.putFitted(cutsKey(date, body), { body: JSON.stringify({ cuts: got.bodies, whole: scale >= WHOLE }), model: "shorten" }); }
    else store.putFitted(cutsKey(date, body), { body: JSON.stringify({ cuts: [], whole: true }), model: "shorten" });
  })));
  say(`articles shortened: ${kept} of ${bodies} text(s) have shorter lengths`);
  return { cost };
}

/** One body at each target length (words), the ones that pass, longest first. Cached by its words and targets. */
async function lengths(store: Store, id: string, title: string, body: string, targets: number[], key: string, say: (s: string) => void):
  Promise<{ bodies: string[]; cost: number }> {
  const cacheKey = `shorten1|${sha(body.trim())}|${targets.join(",")}`;
  let versions: string[] | null = null;
  let cost = 0;
  const cached = store.fitted(cacheKey);
  if (cached) { try { versions = JSON.parse(cached.body) as string[]; } catch { versions = null; } }
  if (!versions && process.env.CK_FAKE_AI === "1") {
    // TESTS ONLY: whole paragraphs from the end, as near each length as they come
    const paras = body.split(/\n\s*\n/);
    versions = targets.map((t) => { const out: string[] = []; for (const p of paras) { if (out.length && wordCount([...out, p].join(" ")) > t) break; out.push(p); } return out.join("\n\n"); });
  }
  if (!versions) {
    const model = env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
    const res = await openRouter({
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
      body: JSON.stringify({
        model, temperature: 0.3, usage: { include: true }, reasoning: { effort: "low" },
        response_format: { type: "json_schema", json_schema: { name: "shorter", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["versions"],
          properties: { versions: { type: "array", items: { type: "string" } } } } } },
        messages: [
          { role: "system", content: SYSTEM + "\nNow you are shortening a customer's article for the paper's copies, in its own language. " +
            `Write its BODY ${targets.length} times, one version for each length asked, in that order. Each: the article's own words and order as far as ` +
            "possible, its least important sentences and details left out or said more briefly; every name, number, date and quotation you keep exactly as " +
            "it is; nothing added, nothing that isn't in it. Keep its paragraphs (separated by a blank line) and its dateline. The title is not to be changed and " +
            "is given only to show what it's about. Return JSON {versions: [the bodies]}." },
          { role: "user", content: `TITLE:\n${title}\n\nBODY (${wordCount(body)} words):\n${body}\n\nLENGTHS (words): ${targets.join(", ")}` },
        ],
      }),
    }, 150);
    if (!res.ok) { say(`  ${id}: not shortened (OpenRouter ${res.status}): it prints whole`); return { bodies: [], cost: 0 }; }
    try {
      const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
      cost += data.usage?.cost ?? 0;
      versions = (JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as { versions: string[] }).versions;
      store.putFitted(cacheKey, { body: JSON.stringify(versions), model });
    } catch { say(`  ${id}: not shortened (its answer couldn't be read): it prints whole`); return { bodies: [], cost }; }
  }
  const has = wordCount(body);
  const tidy = (v: string) => v.split(/\n\s*\n/).map((p) => p.trim().replace(/[ \t]+/g, " ")).filter(Boolean).join("\n\n");
  const out: string[] = [];
  for (const raw of versions ?? []) {
    const v = tidy(raw ?? "");
    const w = wordCount(v);
    // shorter, not a scrap; printable (letters the original has itself print as it does); no number the original hasn't
    const why = w < MIN_WORDS ? "too short" : w > has * 0.95 ? "not shorter" : lettersNotIn(v, body).length ? `letters the font can't print: ${lettersNotIn(v, body).join(" ")}`
      : repeats(v) ? "says a thing twice" : numbersNotIn(v, body).length ? `numbers not in the original: ${numbersNotIn(v, body).join(", ")}` : "";
    if (why) { say(`  ${id}: a ${w}-word length not used (${why})`); continue; }
    if (out.some((o) => Math.abs(wordCount(o) - w) < w * 0.05)) continue;
    const read = await checkShortened(store, id, { title, body }, v, say);
    cost += read.cost;
    if (read.problems.length) { say(`  ${id}: a ${w}-word length not used (${read.problems[0]})`); continue; }
    out.push(v);
  }
  return { bodies: out.sort((a, b) => wordCount(b) - wordCount(a)), cost };
}
