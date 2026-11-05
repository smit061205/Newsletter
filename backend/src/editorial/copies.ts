// Copies of the day's paper, and the sister papers: the same stories and the
// same ads, each one laid out its own way and worded a little differently (or
// translated into Hindi or Urdu), with the masthead, the page headers and the
// last page's footer left empty -- each gets its own paper's name and details
// by hand (in CorelDRAW). For each one:
//
//   1. every story is reworded by the AI, as much as the editor chose (the
//      headline; the headline and sub-heading; or all of it), or translated
//      whole into the copy's language. The meaning, every name and every
//      number stay; a version that changes a number is not used (a reworded
//      story keeps its own words there; a translated one is left out);
//   2. the pages are laid out again (build.ts, its copy mode) with the stories
//      in a shuffled order and a little chance in every choice, as far as the
//      editor chose: anywhere, keeping the lead on the front page; anywhere;
//      or each story on its own page;
//   3. one that comes out placed like the day's paper or one before it (or with
//      a layout check failing) is laid out again; the best of a few tries is kept.
//
// The layout engine works in one paper's script at a time, so a copy in
// another language is laid out by a process of its own (`cli.ts copies-in`)
// for that language's paper (publications/edition-hi, edition-ur), in its own
// data folder, from this day's stories, ads and edits.
//
// Copies go to out/copies/<date>/copy-N.pdf; the sister papers to
// out/editions/<date>/<id>.pdf. Neither ever becomes the day's issue.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { copyFile as copyTo, mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DB_FILE, ENV_FILE, MEDIA_DIR, OUT_DIR, outName, PAPERS_HOME, ROOT } from "../config.ts";
import { buildIssue, type CopyOpts } from "../build.ts";
import { checkFacts } from "./facts.ts";
import { browserServer, closeBrowser } from "../browser.ts";
import { profile } from "../profile.ts";
import { sisterOut, sisterStore } from "../sister.ts";
import { sectionsDay, type Ad, type Edit, type Store, type Story } from "../store.ts";
import { DEFAULT_MODEL, env, numbersNotIn, openRouter, SYSTEM } from "./rewrite.ts";
import { settable } from "./quality.ts";
import { applyTextEdits, droppedBy, foreignLetters } from "../layout/stories.ts";
import { newsOverlap } from "./translate.ts";

export type Reword = "headline" | "headlineDeck" | "all";
export type Shuffle = CopyOpts["shuffle"];
export type Lang = "gu" | "hi" | "ur";
export const LANGS: Lang[] = ["gu", "hi", "ur"];
/** The paper that lays out each language other than this one's own. */
const EDITION_OF: Record<Lang, string> = { gu: "capital-kranti", hi: "edition-hi", ur: "edition-ur" };
const LANG_NAME: Record<Lang, string> = { gu: "Gujarati", hi: "Hindi", ur: "Urdu" };

/** A sister paper: the day's paper under another name, maybe in another language. */
export interface Edition { id: string; name: string; lang: Lang }
export const DEFAULT_EDITIONS: Edition[] = [
  { id: "gu-1", name: "ગુજરાતી છાપું ૧", lang: "gu" },
  { id: "gu-2", name: "ગુજરાતી છાપું ૨", lang: "gu" },
  { id: "gu-3", name: "ગુજરાતી છાપું ૩", lang: "gu" },
  { id: "hi-1", name: "હિન્દી છાપું", lang: "hi" },
  { id: "ur-1", name: "ઉર્દૂ છાપું", lang: "ur" },
];

/** One run: the day's copies, or its sister papers. */
export interface Batch {
  kind: "copies" | "editions";
  date: string; status: "running" | "done" | "failed" | "stopped"; startedAt: string; endedAt?: string;
  /** copies: how many, what's reworded, how far stories move, the language */
  count: number; reword: Reword; shuffle: Shuffle; lang: Lang;
  /** made so far, of `count` */
  done: number;
  /** copies: n; sister papers: their id, name and language */
  files: { n: number; id?: string; name?: string; lang: Lang; ready: boolean; pages: number }[];
  /** AI spend, USD */
  cost: number;
  log: string[];
  error?: string;
  /** how far it has got, 0-1, counting each copy's pages as they're laid out */
  share?: number;
  /** each copy's own progress and what it's doing */
  parts?: Record<string, { share: number; what: string }>;
  /** the time meter: how long the wording took, and each one's layout (seconds) */
  times?: { name: string; seconds: number }[];
  /** copies: articles in every copy (a customer's), word for word */
  articles?: Article[];
  /** copies: 8, copies of the 8-page paper (4 Nov); 4 or none, of the day's */
  pages?: number;
  /** (copies made before 27 Oct: one article) */
  extra?: { body: string; titles: string[]; photos: string[]; deck?: string };
}

/** An article printed in every copy, word for word (26 Oct: an order of 25
 * copies, each with one of the customer's titles and photos; 27 Oct: any
 * number of articles, each with any number of titles, sub-headings, texts and
 * photos). The copies go through them in turn (articleFor). */
export interface Article { titles: string[]; decks: string[]; bodies: string[]; photos: string[] }

/** The n-th (from 1) of every mix of one from each list, in turn: each list
 * steps on with every copy; a mix already used gives way to the next unused
 * one (the later lists moving first), so every mix comes before any repeats
 * and any few copies in a row show every one of each list (3 titles x 3
 * photos: 1-1, 2-2, 3-3, then 1-2, 2-3, 3-1, then 1-3, 2-1, 3-2). */
export function mixFor(lengths: number[], n: number): number[] {
  const L = lengths.map((x) => Math.max(1, x));
  const all = L.reduce((a, b) => a * b, 1);
  const k = (n - 1) % all;
  const used = new Set<string>();
  let got: number[] = [];
  for (let i = 0; i <= k; i++) {
    for (let t = 0; t < all; t++) {
      // t's digits over the lists, the last list's the fastest
      let r = t;
      const d = L.map(() => 0);
      for (let j = L.length - 1; j >= 0; j--) { d[j] = r % L[j]; r = Math.floor(r / L[j]); }
      const mix = L.map((len, j) => (i + d[j]) % len);
      if (!used.has(mix.join())) { used.add(mix.join()); got = mix; break; }
    }
  }
  return got;
}

/** Copy n's title, sub-heading, text and photo of article `a`. */
export function articleFor(a: Article, n: number): { title: string; deck: string; body: string; photo: string | null } {
  const [t, d, b, p] = mixFor([a.titles.length, a.decks.length, a.bodies.length, a.photos.length], n);
  return { title: a.titles[t] ?? "", deck: a.decks[d] ?? "", body: a.bodies[b] ?? "", photo: a.photos[p] ?? null };
}

/** How many of an article's photos copy n prints: a mix of 2, 3 and 1, as many as there are (the editor, 3 Nov). */
export function photoCount(photos: number, n: number): number {
  const mix = [2, 3, 1].filter((k) => k <= photos);
  return mix.length ? mix[(n - 1) % mix.length] : 0;
}

/** The fixed article `i` as copy n prints it: a story of its own, kept whole (store.ts wordForWord).
 * Its photos: the copy's own first, then the ones after it, as many as photoCount says. */
function articleStory(a: Article, i: number, n: number, date: string): Story {
  const { title, deck, body: text, photo } = articleFor(a, n);
  const body = text.split(/\n+/).map((p) => p.trim()).filter(Boolean).join("\n\n");
  const from = photo ? a.photos.indexOf(photo) : 0;
  const photos = Array.from({ length: photoCount(a.photos.length, n) }, (_, k) => a.photos[(from + k) % a.photos.length]);
  return { id: `z-fixed-${i + 1}`, releaseId: null, date, kicker: "", headline: title.trim(), deck: deck.trim(), bodies: { long: body, medium: body, short: body },
           priority: 2, page: null, photo, photos, caption: "", source: "fixed:copy", model: "as-is", needsReview: false };
}
/** The day's stories that are the same news as one of the customer's articles (2 Nov): each copy
 * prints his article in their place, never the news twice. The AI reads them side by side (once a
 * day and set of articles, cached); two sharing most of their words are the same news anyway. */
export async function sameAsArticles(store: Store, date: string, articles: Pick<Article, "titles" | "bodies">[], say: Say):
  Promise<{ ids: string[]; headlines: string[]; cost: number }> {
  const edits = store.edits(date);
  const dropped = droppedBy(edits);
  const stories = applyTextEdits(store.stories(date), edits).filter((s) => !dropped.has(s.id));
  const texts = articles.map((a) => ({ headline: a.titles[0] ?? "", body: a.bodies[0] ?? "" }));
  const ids = new Set(stories.filter((s) => texts.some((t) => newsOverlap(t, { headline: s.headline, body: s.bodies.long }) >= 0.4)).map((s) => s.id));
  let cost = 0;
  const apiKey = env("OPENROUTER_API_KEY");
  const key = `fixedsame|${date}|${createHash("sha1").update(JSON.stringify([texts, stories.map((s) => s.id).sort()])).digest("hex").slice(0, 12)}`;
  const cached = store.fitted(key);
  if (cached) for (const id of JSON.parse(cached.body) as string[]) ids.add(id);
  else if (apiKey && stories.length && process.env.CK_FAKE_AI !== "1") {
    const res = await openRouter({
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
      body: JSON.stringify({
        model: DEFAULT_MODEL, temperature: 0, usage: { include: true },
        response_format: { type: "json_schema", json_schema: { name: "same", strict: true, schema: {
          type: "object", additionalProperties: false, required: ["ids"],
          properties: { ids: { type: "array", items: { type: "string" }, description: "ids of the stories that report the same news as one of the articles" } } } } },
        messages: [{ role: "user", content: "A newspaper prints the ARTICLES below in its copies. Which of its STORIES report the same news as one of them " +
          "(the same event, visit, launch, announcement or ceremony, however worded)? Only those; none if none.\n\nARTICLES:\n" +
          texts.map((t, i) => `${i + 1}. ${t.headline}\n${t.body.slice(0, 700).replace(/\s+/g, " ")}`).join("\n\n") + "\n\nSTORIES:\n" +
          stories.map((s) => `${s.id} | ${s.headline}\n  ${s.bodies.long.slice(0, 220).replace(/\s+/g, " ")}`).join("\n") }],
      }),
    }, 60);
    if (res.ok) {
      try {
        const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
        const got = (JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")) as { ids: string[] }).ids
          .filter((id) => stories.some((s) => s.id === id));
        store.putFitted(key, { body: JSON.stringify(got), model: DEFAULT_MODEL });
        cost = data.usage?.cost ?? 0;
        for (const id of got) ids.add(id);
      } catch { say("couldn't read which stories are the customer's news: only those sharing most of their words left out"); }
    } else say(`couldn't ask which stories are the customer's news (OpenRouter ${res.status}): only those sharing most of their words left out`);
  }
  const out = [...ids];
  const headlines = out.map((id) => stories.find((s) => s.id === id)?.headline ?? id);
  if (out.length) say(`the same news as the fixed article(s), left out of every copy: ${headlines.map((h) => h.slice(0, 50)).join("; ")}`);
  return { ids: out, headlines, cost };
}

/** Kept for the newsroom (api.ts CopiesRun). */
export type CopiesRun = Batch;

export const copiesDir = (date: string) => path.join(OUT_DIR, "copies", date);
export const copyFile = (date: string, n: number) => path.join(copiesDir(date), `copy-${n}.pdf`);
export const editionsDir = (date: string) => path.join(OUT_DIR, "editions", date);
export const editionFile = (date: string, id: string) => path.join(editionsDir(date), `${id}.pdf`);
/** The checks a different arrangement can fix: an overflow, empty space, a
 * full-width story. (A headline that won't fill its width or a heavy one
 * came back in every arrangement on 23 Oct: retrying them only tripled the time; a lead without its photo gets another go,
 * and so does a copy missing a news the editor sent, 3 Nov.) */
const LAYOUT_GATES = ["1", "2", "W", "S13", "S14"];
/** Tries per copy when a layout check fails (a copy placed like another is always tried again). */
const TRIES = 4;
/** How far a try is from clean: each failed layout check, then what it is that failed --
 * a line over another or past its column worst, then an empty stretch, then a line a
 * hair short (26 Oct: two tries that each failed once kept the first, a line over the
 * next column's text, over the second's line 4 px short of its box). 0 is clean. */
function badness(r: Awaited<ReturnType<typeof buildIssue>>["report"]): number {
  const failed = r.gates.filter((g) => !g.pass && LAYOUT_GATES.includes(g.gate.split(" ")[0])).length;
  if (!failed) return 0;
  const how = r.warnings.reduce((a, w) => a + (w.kind === "white-space" ? 5 : w.kind === "line-fit" && !/past/.test(w.detail) ? 1 : 10), 0);
  return failed * 1000 + how;
}

let running: Batch | null = null;
/** The copies or sister papers being made now, if any. */
export const currentCopies = () => running;

/** The day's copies (or sister papers): being made, or the last ones made. */
export function batchOf(kind: Batch["kind"], date: string): Batch | null {
  if (running?.date === date && running.kind === kind) return running;
  const file = path.join(kind === "copies" ? copiesDir(date) : editionsDir(date), `${kind}.json`);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")) as Batch; } catch { return null; }
}
export const copiesOf = (date: string) => batchOf("copies", date);

/** A random number generator from a seed (mulberry32): the same copy, the same choices. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCHEMA = (fields: string[]) => ({
  name: "reworded",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: fields,
    properties: Object.fromEntries(fields.map((f) => [f, { type: "string" }])),
  },
});

/** One story, worded a little differently for copy `n` -- or, `translate`,
 * put into this paper's language (the same for every copy, cached once).
 * The story keeps its own words where the model couldn't be trusted. */
async function rewordStory(store: Store, s: Story, n: number, reword: Reword, key: string, translate: boolean):
  Promise<{ story: Story; cost: number }> {
  const fields = translate ? ["kicker", "headline", "deck", "body", "caption"].filter((f) => f === "headline" || f === "body" || (f === "kicker" ? s.kicker : f === "deck" ? s.deck : s.caption)?.trim())
    : reword === "headline" ? ["headline"] : reword === "headlineDeck" ? ["headline", "deck"] : ["headline", "deck", "body"];
  const original: Record<string, string> = { kicker: s.kicker ?? "", headline: s.headline, deck: s.deck ?? "", body: s.bodies.long, caption: s.caption ?? "" };
  const hash = createHash("sha1").update(JSON.stringify(fields.map((f) => original[f]))).digest("hex").slice(0, 12);
  const cacheKey = translate ? `translate|${profile.language.lang}|${s.id}|${hash}` : `copy|${s.id}|${n}|${reword}|${hash}`;
  const model = translate ? profile.editorial.translateModel ?? DEFAULT_MODEL : env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
  let got: Record<string, string> | null = null;
  let cost = 0;
  // (a translation with letters of another script, a name spelled in Hindi inside Urdu, done again once)
  const mixed = (g: Record<string, string> | null) => translate && !!g && fields.some((f) => foreignLetters(g[f] ?? "").length > 0);
  const cached = store.fitted(cacheKey);
  if (cached) {
    try { got = JSON.parse(cached.body); } catch { got = null; }
  }
  const tries = !cached ? 2 : mixed(got) ? 1 : 0;
  for (let t = 0; t < tries && (t === 0 || mixed(got)); t++) if (process.env.CK_FAKE_AI === "1") {
    // TESTS ONLY: Hindi "translated" letter for letter (Gujarati and Devanagari share their Unicode layout)
    const fake = (t: string) => (translate && profile.language.lang === "hi" ? t.replace(/[\u0A80-\u0AFF]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x180)) : t);
    got = Object.fromEntries(fields.map((f) => [f, fake(original[f])]));
  } else {
    const ask = translate
      ? `\nNow you are translating a finished Gujarati story into ${LANG_NAME[profile.language.lang as Lang] ?? profile.language.lang} for this paper. ` +
        "Translate it faithfully and completely into natural, formal newspaper language: the same meaning and facts, every name, number and date exactly " +
        "(numbers in Latin digits 0-9), every name spelled in this language's own letters, nothing added and nothing left out. Keep the body's paragraphs (separated by a blank line) and its dateline. " +
        `Return JSON {${fields.join(", ")}}.`
      : "\nNow you are rewording a finished story for another edition of the paper (edition " + n + "). " +
        "Say the same thing in slightly different words: the same meaning, the same facts, every name, number and date exactly as they are, " +
        "nothing added and nothing left out. Change the wording noticeably but naturally -- it must still read as good newspaper writing, " +
        "about as long as before. " +
        (fields.includes("body") ? "Keep the body's paragraphs (separated by a blank line) and its dateline at the start. " : "") +
        `Return JSON {${fields.join(", ")}}.`;
    const res = await openRouter({
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
      body: JSON.stringify({
        model, temperature: translate ? 0.2 : 0.7, usage: { include: true },
        response_format: { type: "json_schema", json_schema: SCHEMA(fields) },
        messages: [
          { role: "system", content: SYSTEM + ask },
          { role: "user", content: fields.map((f) => `${f.toUpperCase()}:\n${original[f]}`).join("\n\n") },
        ],
      }),
    }, fields.includes("body") ? 150 : 60);
    if (!res.ok) return { story: s, cost: 0 };
    try {
      const data = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { cost?: number } };
      cost = data.usage?.cost ?? 0;
      got = JSON.parse(data.choices[0].message.content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
    } catch {
      return { story: s, cost };
    }
    store.putFitted(cacheKey, { body: JSON.stringify(got), model });
  }
  if (!got) return { story: s, cost };
  // each field only if it kept every number (and, reworded, stayed about as long)
  const ok = (f: string) => {
    const v = (got![f] ?? "").trim();
    if (!v) return false;
    // letters the paper's font can't print (Gopika has no "ૅ", nor some joins): they'd fall back to a system font
    if (!settable(v)) return false;
    if (translate && foreignLetters(v).length) return false;
    const was = original[f];
    if (numbersNotIn(v, was).length || numbersNotIn(was, v).length) return false;
    if (translate) return true;
    const ratio = v.length / Math.max(1, was.length);
    return f === "body" ? ratio > 0.85 && ratio < 1.15 : ratio > 0.6 && ratio < 1.5;
  };
  const one = (v: string) => v.trim().replace(/\s+/g, " ");
  const out: Story = { ...s, bodies: { ...s.bodies } };
  if (translate) {
    // translated whole, or not at all: half a story in each language can't print
    if (!ok("headline") || !ok("body")) return { story: s, cost };
    out.headline = one(got.headline);
    out.kicker = got.kicker ? one(got.kicker) : "";
    out.deck = got.deck && ok("deck") ? one(got.deck) : "";
    out.caption = got.caption ? one(got.caption) : "";
  } else {
    if (ok("headline")) out.headline = one(got.headline);
    if (fields.includes("deck") && original.deck && ok("deck")) out.deck = one(got.deck);
  }
  if (fields.includes("body") && ok("body")) {
    const body = got.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).join("\n\n");
    // the shorter versions follow the new wording: the first paragraphs of it
    const paras = body.split("\n\n");
    const upTo = (share: number) => {
      const out: string[] = [];
      for (const p of paras) { if (out.length && (out.join(" ").length + p.length) > body.length * share) break; out.push(p); }
      return out.join("\n\n");
    };
    out.bodies = { long: body, medium: upTo(0.66), short: upTo(0.4) };
  }
  // (names, places, dates and quotes read against the release as well; a wording that
  // changes one isn't used, and a translation that does is left out)
  if (out.headline + out.bodies.long !== s.headline + s.bodies.long) {
    const read = await checkFacts(store, out, () => {});
    if (read.problems.length) return { story: s, cost: cost + read.cost };
    cost += read.cost;
  }
  return { story: out, cost };
}

/** What one layout set needs: where each one goes, how to shuffle and word it. */
interface SetSpec {
  date: string;
  /** `images`: a folder for its pages as pictures (a sister paper's) */
  items: { n: number; id?: string; name?: string; pdf: string; seed: number; images?: string }[];
  reword: Reword; shuffle: Shuffle; translate: boolean;
  /** the articles in every copy, word for word */
  articles?: Article[];
  /** the day's stories that are the same news as one of them: left out */
  drop?: string[];
  /** each story's page and the lead in the day's paper */
  pageOf: [string, number][]; lead?: string;
  /** placements already used (the day's paper, earlier copies): none may repeat */
  seen: string[];
  /** copies of the 8-page paper (4 Nov): each copy's pages, then the section pages, the day's
   * paper's printed stories being the ones the section pages' choice was made beside */
  eight?: { printed: string[] };
  /** only reword (or translate) the day's stories for each item, caching them, and lay nothing out:
   * every copy's AI work done at once before the layouts, which run a couple at a time (memory) */
  prepare?: boolean;
  /** a sister paper's own day (sister.ts): its ads, the edits it's laid out with (Capital Kranti's
   * and its own, but its own text edits), and those text edits, put over its own wording after it */
  ads?: Ad[]; edits?: Edit[]; mine?: Edit[];
}
type Say = (line: string) => void;
type OnFile = (f: { n: number; ready: boolean; pages: number; cost: number; sig: string[] }) => void;

/** Lay out each of `spec.items` in this process (this paper's language). */
/** How far one copy has got (0-1), and what it's doing: rewording or
 * translating is the first 15%, each page laid out and finished the rest. */
type OnProgress = (share: number, what: string) => void;
async function layOutHere(store: Store, spec: SetSpec, say: Say, onFile: OnFile, progress: OnProgress = () => {}) {
  const key = env("OPENROUTER_API_KEY");
  if (!key && process.env.CK_FAKE_AI !== "1") throw new Error("no OpenRouter key: add it in Settings");
  const pageOf = new Map(spec.pageOf);
  const seen = new Set(spec.seen);
  for (const item of spec.items) {
    const n = item.n;
    let rewordCost = 0;
    // the stories reworded (or translated) for this one, all at once (OpenRouter retries what it turns away)
    const reword = async (pool: Story[]) => {
      const out: Story[] = new Array(pool.length);
      let cost = 0, changed = 0, done = 0;
      await Promise.all(pool.map(async (s, i) => {
        const r = key || process.env.CK_FAKE_AI === "1" ? await rewordStory(store, s, n, spec.reword, key ?? "", spec.translate) : { story: s, cost: 0 };
        out[i] = r.story;
        progress(0.15 * (++done / pool.length), spec.translate ? "translating" : "rewording");
        cost += r.cost;
        if (r.story.headline !== s.headline) changed++;
      }));
      rewordCost += cost;
      say(`  ${item.name ?? `copy ${n}`}: ${changed} of ${pool.length} stories ${spec.translate ? "translated" : "reworded"}`);
      // (a sister paper's own words for a story, typed in its language: over its wording, not reworded)
      return { pool: spec.mine?.length ? applyTextEdits(out, spec.mine) : out, cost };
    };
    if (spec.prepare) {
      // the day's stories as the build hands them to `reword` (edits applied,
      // left-out ones gone, features without a kicker): their wording cached
      const edits = store.edits(spec.date);
      const dropped = droppedBy(edits);
      const got = await reword(applyTextEdits(store.stories(spec.date), edits).filter((s) => !dropped.has(s.id))
        .map((s) => (s.id.startsWith("f-") ? { ...s, kicker: "" } : s)));
      // (what the wording cost, for the batch's total and the cost estimate)
      say(`@@cost ${JSON.stringify({ cost: got.cost, stories: got.pool.length })}`);
      continue;
    }
    // a reworded body is fitted to its space on its own (not with the day's fits); one
    // keeping the day's words starts from the day's fits, and what's written for it stays its own
    const own = Object.create(store) as Store;
    own.fitted = (k: string) => store.fitted(`copy${n}|${k}`) ?? (spec.reword === "all" ? null : store.fitted(k));
    own.putFitted = (k: string, v: Parameters<Store["putFitted"]>[1]) => store.putFitted(`copy${n}|${k}`, v);
    own.forgetFitted = (id: string) => store.forgetFitted(`copy${n}|${id}`);
    let made: { built: Awaited<ReturnType<typeof buildIssue>>; sig: string; layout: string; fails: number; attempt: number } | null = null;
    let spent = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const built = await buildIssue(store, spec.date, {
        log: (l) => { if (/^(built|  FAIL|  page \d+:|  warning|  layout:|  translated)/.test(l)) say(`  ${l.trim()}`); },
        noReview: true,
        progress: (p) => progress(0.15 + 0.85 * (p.total ? p.done / p.total : 0),
          `${attempt ? `again ${attempt + 1}: ` : ""}${p.label === "checking" ? "checking" : `${p.label} ${p.item ?? ""}`.trim()}`),
        copy: { rng: seeded(item.seed * 7919 + attempt * 104729 + 17), shuffle: spec.shuffle, pageOf, lead: spec.lead, reword, pdfPath: item.pdf,
                ...(item.images ? { images: `${item.images}-${attempt}` } : {}),
                translate: spec.translate, ...(!spec.translate ? { store: own } : {}),
                ...(spec.articles?.length ? { extras: spec.articles.map((a, i) => articleStory(a, i, n, spec.date)) } : {}),
                ...(spec.drop?.length ? { drop: spec.drop } : {}) },
      });
      spent += built.report.cost;
      const sig = built.report.placed.map((p) => `${p.story}:${p.page}:${p.cols}`).sort().join(",");
      const at = (e: object) => { const b = e as { x?: number; y?: number; x1?: number; y1?: number }; return [Math.round(b.x ?? b.x1 ?? 0), Math.round(b.y ?? b.y1 ?? 0)]; };
      const layout = JSON.stringify(built.issue.pages.map((p) => p.elements.filter((e) => e.articleId).map((e) => [e.articleId, ...at(e)])));
      const fails = badness(built.report);
      const repeat = seen.has(sig) || seen.has(layout);
      if (repeat) say(`  ${item.name ?? `copy ${n}`} came out like an earlier one: laying it out again`);
      else if (!made || fails < made.fails) {
        // the best so far: its PDF kept aside (the next try writes the same file)
        made = { built, sig, layout, fails, attempt };
        await copyTo(item.pdf, `${item.pdf}.best`);
      }
      if (!repeat && fails === 0) break;
      if (!repeat && attempt < TRIES - 1) say(`  ${item.name ?? `copy ${n}`}: a layout check needs a look: trying another arrangement`);
      else if (!repeat) break;
    }
    if (!made) throw new Error(`${item.name ?? `copy ${n}`} couldn't be laid out unlike the others`);
    await rename(`${item.pdf}.best`, item.pdf);
    // (its page pictures: the best try's)
    if (item.images) {
      await rm(item.images, { recursive: true, force: true });
      await rename(`${item.images}-${made.attempt}`, item.images);
      for (let a = 0; a < TRIES; a++) await rm(`${item.images}-${a}`, { recursive: true, force: true });
    }
    // the 8-page paper: this copy's pages, its last laid out again as an inside page, then the
    // section pages as the evening chose and wrote them (none paid for twice), each copy laid out its own way
    if (spec.eight) {
      const { writeSections } = await import("./sections.ts");
      const w = await writeSections(store, spec.date, new Set(spec.eight.printed), () => {});
      const mine = new Set(made.built.report.placed.map((p) => p.story));
      progress(0.95, "the 8 pages");
      const eight = await buildIssue(store, spec.date, {
        log: (l) => { if (/^(built|  FAIL|  page \d+:|  warning|  layout:|  translated)/.test(l)) say(`  ${l.trim()}`); },
        noReview: true, seedShift: item.seed,
        sections: { base: made.built.pages, stories: w.stories.filter((s) => !mine.has(s.id)), pdfPath: item.pdf, blank: true },
      });
      spent += w.cost + eight.report.cost;
      made = { ...made, built: eight };
    }
    // its pages as laid out, for the editable PDF (export/pdf-editable.ts)
    await writeFile(item.pdf.replace(/\.pdf$/, ".json"), JSON.stringify(made.built.issue));
    // and its report, for a sister paper's own issues (sister.ts), with each story's words as printed
    // (reworded or translated: what its editor sees and changes)
    const printed = made.built.pages.flatMap((p) => p?.placed.map(({ module: { story: x } }) => ({ id: x.id, headline: x.headline, deck: x.deck, body: x.bodies.long })) ?? []);
    await writeFile(item.pdf.replace(/\.pdf$/, ".report.json"), JSON.stringify({ ...made.built.report, printed }));
    seen.add(made.sig); seen.add(made.layout);
    onFile({ n, ready: made.built.report.ready, pages: made.built.report.pages, cost: spent, sig: [made.sig, made.layout] });
  }
}

/** How many copies are laid out at once. The workers share one browser
 * (browser.ts), a tab each; measured on 23 Oct 2026, two copies at once
 * peaked at about 2.3 GB (each worker's engine ~0.6 GB, the browser the
 * rest). So: one on a computer of under 7 GB, two under 24 GB (an 8 GB PC
 * runs two, beside the app), three above (and never more than half its
 * cores). (Each with its own browser, three ran a 16 GB Mac out of memory.) */
function parallelism(n: number): number {
  const gb = os.totalmem() / 2 ** 30;
  const byMemory = gb < 7 ? 1 : gb < 24 ? 2 : 3;
  return Math.max(1, Math.min(n, byMemory, Math.max(1, Math.floor(os.cpus().length / 2))));
}

/** One copy to lay out, in a worker of its own. */
interface Task { lang: Lang; label: string; item: SetSpec["items"][number]; spec: Omit<SetSpec, "items" | "seen">; seen: string[] }

const workers = new Set<ChildProcess>();
/** Where each copy being made has got (set by the batch that's running). */
let partProgress: ((t: Task, share: number, what: string) => void) | null = null;
/** A batch's progress from its copies': each one's share, never going back
 * (a copy laid out again starts its pages over), and the batch's overall. */
function tracker(batch: Batch, total: number) {
  batch.parts = {};
  partProgress = (t, share, what) => {
    // a copy laid out again starts its pages over: shown as it is (with "again"), not held where it was
    batch.parts![t.label] = { share: Math.min(0.99, share), what };
    batch.share = Object.values(batch.parts!).reduce((a, p) => a + p.share, 0) / total;
  };
  return (t: Task) => {
    batch.parts![t.label] = { share: 1, what: "ready" };
    batch.share = Object.values(batch.parts!).reduce((a, p) => a + p.share, 0) / total;
  };
}
let stopping = false;
/** Stop the copies (or sister papers) being made: their workers end at once. */
export function stopCopies(): boolean {
  if (!running) return false;
  stopping = true;
  for (const w of workers) endProcess(w);
  return true;
}
/** A worker and everything it started (its browser) ended. */
function endProcess(c: ChildProcess) {
  if (c.exitCode !== null || !c.pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else process.kill(-c.pid, "SIGKILL");
  } catch { try { c.kill("SIGKILL"); } catch { /* gone */ } }
}

/** Lay out `tasks`, a few at a time, each in a worker of its own: a process
 * for the copy's language's paper (cli.ts copies-in) with a data folder of
 * its own, filled from this day's stories, ads, edits and the AI's earlier
 * work. What the AI writes there (rewordings, translations, length fits) comes
 * back into this paper's database, so the next time costs nothing. */
async function runTasks(store: Store, tasks: Task[], say: Say, onFile: (t: Task, f: Parameters<OnFile>[0]) => void) {
  const slots = parallelism(tasks.length);
  if (tasks.length > 1) say(`${tasks.length} at a time: ${slots}`);
  // one browser for every worker, a tab each
  const server = await browserServer();
  ws = server.wsEndpoint();
  const queue = [...tasks];
  const failures: string[] = [];
  await Promise.all(Array.from({ length: slots }, async (_, slot) => {
    while (queue.length && !stopping) {
      const t = queue.shift()!;
      const began = Date.now();
      // (a layout's own cost goes into the batch where its file is taken: counted once)
      try { await runWorker(store, t, slot, say, (f) => { spend(t, f.cost, 0, false); onFile(t, f); }); timeMark(t.label, (Date.now() - began) / 1000); }
      catch (e) { if (!stopping) { failures.push(`${t.label}: ${e instanceof Error ? e.message : e}`); say(`${t.label} stopped: ${e instanceof Error ? e.message : e}`); } }
    }
  }));
  ws = "";
  await server.close().catch(() => {});
  if (stopping) throw new Error("stopped by the editor");
  if (failures.length === tasks.length) throw new Error(failures[0]);
}
/** The shared browser's address while a batch runs (the workers connect to it). */
let ws = "";

async function runWorker(store: Store, t: Task, slot: number, say: Say, onFile: OnFile, onCost?: (c: { cost: number; stories: number }) => void) {
  const paper = t.lang === profile.language.lang ? profile.id : EDITION_OF[t.lang];
  const dataDir = path.join(PAPERS_HOME, "papers", paper, `worker-${slot + 1}`);
  await mkdir(dataDir, { recursive: true });
  const specFile = path.join(dataDir, "spec.json");
  await writeFile(specFile, JSON.stringify({ ...t.spec, seen: t.seen, items: [t.item] } satisfies SetSpec));
  try {
    await new Promise<void>((ok, bad) => {
      // the same Node flags as this engine (inside the app: the hook that finds the shared code)
      const child = spawn(process.execPath, [...process.execArgv, path.join(ROOT, "backend", "src", "cli.ts"), "copies-in", "--spec", specFile], {
        cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
        env: { ...process.env, CK_PUBLICATION: paper, DATA_DIR: dataDir, CK_SOURCE_DB: DB_FILE, CK_MEDIA_DIR: MEDIA_DIR,
               CK_ENV_FILE: ENV_FILE, CK_PAPERS_HOME: PAPERS_HOME, CK_BROWSER_WS: ws },
      });
      workers.add(child);
      let buf = "", error = "";
      const line = (l: string) => {
        if (l.startsWith("@@file ")) onFile(JSON.parse(l.slice(7)));
        else if (l.startsWith("@@progress ")) { const x = JSON.parse(l.slice(11)) as { share: number; what: string }; partProgress?.(t, x.share, x.what); }
        else if (l.startsWith("@@error ")) error = l.slice(8);
        else if (/^\s*\[copies\]\s*@@cost /.test(l)) onCost?.(JSON.parse(l.replace(/^\s*\[copies\]\s*@@cost /, "")));
        else if (/^\s*\[copies\]/.test(l)) say(`[${t.label}] ${l.replace(/^\s*\[copies\] ?/, "").trim()}`);
      };
      child.stdout!.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
      child.stderr!.on("data", (d) => { error ||= String(d).split("\n").find((l) => /Error/.test(l)) ?? ""; });
      child.on("error", bad);
      child.on("exit", (code) => { workers.delete(child); code === 0 ? ok() : bad(new Error(stopping ? "stopped" : error || `the layout stopped (${code})`)); });
    });
  } finally {
    // the AI's work in the worker, kept for next time
    const db = path.join(dataDir, "capital-kranti.sqlite");
    if (existsSync(db)) {
      try {
        store.db.exec(`attach database '${db.replace(/'/g, "''")}' as w`);
        try { store.db.exec("insert or ignore into fitted select * from w.fitted"); } finally { store.db.exec("detach database w"); }
      } catch { /* the worker's database was left half-written */ }
    }
  }
}

/** Inside a worker (cli.ts copies-in): this data folder gets the day's
 * stories, releases, ads, edits and the AI's earlier work from the main
 * paper's database, then its copy is laid out here. */
export async function copiesIn(store: Store, specFile: string) {
  const spec = JSON.parse(readFileSync(specFile, "utf8")) as SetSpec;
  const src = process.env.CK_SOURCE_DB;
  try {
    if (!src || !existsSync(src)) throw new Error("no source database (CK_SOURCE_DB)");
    const d = spec.date;
    store.db.exec(`attach database '${src.replace(/'/g, "''")}' as src`);
    try {
      // (and the 8-page paper's own news, kept under a day of its own: store.ts sectionsDay)
      for (const t of ["releases", "stories", "ads"]) for (const day of t === "ads" ? [d] : [d, sectionsDay(d)]) {
        store.db.prepare(`delete from ${t} where date = ?`).run(day);
        store.db.prepare(`insert or replace into ${t} select * from src.${t} where date = ?`).run(day);
      }
      store.db.prepare("delete from edits where issue_date = ?").run(d);
      store.db.prepare("insert into edits (issue_date, json) select issue_date, json from src.edits where issue_date = ? order by n").run(d);
      // the editorial plan (the stories rank as in the day's paper), the length
      // fits, briefs, rewordings and translations: none paid for twice
      store.db.exec("insert or ignore into fitted select * from src.fitted");
      // (the day's editorial plan as the day's paper has it, over any this worker made for itself:
      // 1 Nov's second worker kept its own, which left a story out, and the same news printed twice)
      store.db.exec("insert or replace into fitted select * from src.fitted where key like 'plan%'");
      // the editor's choice of sample ads (none at all, or not these): 26 Oct's
      // copies printed seven sample ads with them switched off
      store.db.exec("insert or replace into settings select * from src.settings where key in ('samplesOn', 'samplesOff')");
    } finally { store.db.exec("detach database src"); }
    // a sister paper's own ads and edits, in place of the day's (sister.ts)
    if (spec.ads) {
      store.db.prepare("delete from ads where date = ?").run(d);
      for (const a of spec.ads) store.putAd(a);
    }
    if (spec.edits) {
      store.db.prepare("delete from edits where issue_date = ?").run(d);
      for (const e of spec.edits) store.addEdit(e);
    }
    let last = 0;
    await layOutHere(store, spec, (l) => console.log(`[copies] ${l}`), (f) => console.log(`@@file ${JSON.stringify(f)}`),
      // at most twice a second
      (share, what) => { if (Date.now() - last > 500) { last = Date.now(); console.log(`@@progress ${JSON.stringify({ share, what })}`); } });
  } catch (e) {
    console.log(`@@error ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  } finally {
    // let go of the shared browser, so this worker can end
    await closeBrowser();
  }
}

/** The day's paper as the copies start from it: its placements and lead. */
function dayOf(store: Store, date: string) {
  const got = store.latestIssue(date);
  if (!got) throw new Error(`no paper made for ${date} yet: make the day's paper first`);
  const report = got.report as { placed?: { page: number; story: string; cols: number; rank: number }[] };
  return {
    pageOf: (report.placed ?? []).map((p) => [p.story, p.page] as [string, number]),
    lead: report.placed?.find((p) => p.page === 1 && p.rank === 1)?.story,
    seen: [(report.placed ?? []).map((p) => `${p.story}:${p.page}:${p.cols}`).sort().join(",")],
  };
}

/** Run a batch (one at a time), its record kept beside its PDFs. */
// ---- the cost estimate, learned: what each kind of copy really cost per
// story (US$), and how long a copy took -- the newsroom's estimate (settings
// costRates, copyMinutes). Started from a measured run, each batch averaged in.
export type CostKind = "headline" | "headlineDeck" | "all" | "translate-hi" | "translate-ur" | "translate-gu";
/** Measured on 25 Oct 2026 against the OpenRouter key's own usage: 3 copies worded
 * whole $0.084 (55 stories), 3 Gujarati sister papers and the Hindi one $0.427. */
export const START_RATES: Record<CostKind, number> = { headline: 0.00008, headlineDeck: 0.00016, all: 0.00051, "translate-hi": 0.0073, "translate-ur": 0.0073, "translate-gu": 0.0073 };
const kindOf = (t: Task): CostKind => (t.spec.translate ? `translate-${t.lang}` : t.spec.reword) as CostKind;
/** The running batch's spend per task: its kind, US$, and the stories its wording covered. */
const ledger = new Map<Task["label"], { kind: CostKind; usd: number; stories: number }>();
function spend(t: Task, usd: number, stories: number, intoBatch = true) {
  const e = ledger.get(t.label) ?? { kind: kindOf(t), usd: 0, stories: 0 };
  e.usd += usd;
  e.stories = Math.max(e.stories, stories);
  ledger.set(t.label, e);
  if (running && usd && intoBatch) running.cost += usd;
}
/** The batch's rates, averaged into what earlier batches taught (a translation
 * is paid once a language, however many copies: its rate is per story, not per copy). */
function learn(store: Store, batch: Batch) {
  const by = new Map<CostKind, { usd: number; stories: number }>();
  for (const e of ledger.values()) {
    if (!e.stories) continue;
    const g = by.get(e.kind) ?? { usd: 0, stories: 0 };
    g.usd += e.usd;
    g.stories = e.kind.startsWith("translate") ? Math.max(g.stories, e.stories) : g.stories + e.stories;
    by.set(e.kind, g);
  }
  const rates = { ...START_RATES, ...store.setting<Partial<Record<CostKind, number>>>("costRates", {}) };
  for (const [kind, g] of by) if (g.usd > 0) rates[kind] = rates[kind] ? (rates[kind] + g.usd / g.stories) / 2 : g.usd / g.stories;
  store.putSetting("costRates", rates);
  // and the minutes a copy takes, from this one
  const secs = (Date.parse(batch.endedAt ?? new Date().toISOString()) - Date.parse(batch.startedAt)) / 1000;
  if (batch.count && secs > 0) {
    const was = store.setting<number>("copyMinutes", 0);
    const now = secs / 60 / batch.count;
    store.putSetting("copyMinutes", Math.round((was ? (was + now) / 2 : now) * 10) / 10);
  }
}

/** A part of the running batch done, for its time meter. */
function timeMark(name: string, seconds: number) {
  if (running) (running.times ??= []).push({ name, seconds: Math.round(seconds * 10) / 10 });
}

async function runBatch(batch: Batch, dir: string, work: (say: Say) => Promise<void>, log: Say): Promise<Batch> {
  if (running) throw new Error(`${running.kind === "copies" ? "copies" : "the other papers"} for ${running.date} are still being made`);
  running = batch;
  stopping = false;
  ledger.clear();
  const say = (line: string) => { batch.log.push(line); if (batch.log.length > 600) batch.log.splice(0, batch.log.length - 600); log(`  [${batch.kind}] ${line}`); };
  try {
    await work(say);
    batch.status = "done";
  } catch (e) {
    batch.status = stopping ? "stopped" : "failed";
    batch.error = stopping ? undefined : e instanceof Error ? e.message : String(e);
    say(stopping ? "stopped by the editor" : `stopped: ${batch.error}`);
  } finally {
    batch.endedAt = new Date().toISOString();
    running = null;
    stopping = false;
    partProgress = null;
    try { await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, `${batch.kind}.json`), JSON.stringify(batch, null, 1)); } catch { /* the folder went */ }
  }
  return batch;
}

/** Every task's AI work at once, before any layout: a light worker per task
 * (its own paper's language; no browser) rewording or translating the day's
 * stories into the shared cache, which the layout workers then read. A
 * preparation already under way for the day (started beside the evening's
 * layout, prepareEditions) is waited for, not repeated. A translated paper prepares
 * nothing: it translates only the stories its pages need, as it's laid out (build.ts). */
let preparing: { date: string; work: Promise<void> } | null = null;
async function prepareAll(store: Store, all: Task[], say: Say): Promise<void> {
  const t = Date.now();
  if (preparing?.date === all[0]?.spec.date) await preparing.work;
  const tasks = all.filter((task) => !task.spec.translate);
  if (!tasks.length) return;
  await Promise.all(tasks.map((task, i) => runWorker(store, { ...task, spec: { ...task.spec, prepare: true } }, 50 + i, () => {}, () => {},
    (c) => spend(task, c.cost, c.stories))
    .catch((e: unknown) => say(`${task.label}: couldn't prepare its wording ahead (${e instanceof Error ? e.message : e}); it words them as it's laid out`))));
  say(`wording for ${tasks.length} paper(s) ready in ${Math.round((Date.now() - t) / 1000)}s`);
  timeMark("wording", (Date.now() - t) / 1000);
}

/** The Gujarati sister papers' wording started while the day's own paper is
 * still being laid out (pipeline.ts): done by the time they're made. */
export function prepareEditions(store: Store, date: string, all: Edition[]): Promise<void> {
  // (the translated ones translate as they're laid out: prepareAll)
  const own = all.filter((e) => e.lang === profile.language.lang);
  if (!own.length) return Promise.resolve();
  const tasks: Task[] = own.map((e) => ({
    lang: e.lang, label: e.name, seen: [],
    spec: { date, reword: "headlineDeck", shuffle: "keepLead", translate: e.lang !== profile.language.lang, pageOf: [] },
    item: { n: 100 + all.indexOf(e), id: e.id, name: e.name, pdf: editionFile(date, e.id), seed: 100 + all.indexOf(e) },
  }));
  // (its cost is the evening run's: counted there, not in a batch)
  const work = Promise.all(tasks.map((task, i) => runWorker(store, { ...task, spec: { ...task.spec, prepare: true } }, 50 + i, () => {}, () => {})
    .catch(() => {}))).then(() => {});
  preparing = { date, work };
  return work.finally(() => { if (preparing?.work === work) preparing = null; });
}

/** Lay `tasks` out, then any that came out placed like another (workers run
 * side by side, so they can't see each other) once more with another seed. */
async function layOutUnique(store: Store, tasks: Task[], seen: string[], say: Say, done: (t: Task, f: Parameters<OnFile>[0]) => void) {
  // the wording first, every paper at once; then the layouts, a couple at a time
  await prepareAll(store, tasks, say);
  const results = new Map<Task, Parameters<OnFile>[0]>();
  await runTasks(store, tasks, say, (t, f) => results.set(t, f));
  const known = new Set(seen);
  const again: Task[] = [];
  for (const t of tasks) {
    const f = results.get(t);
    if (!f) continue;
    if (f.sig.some((x) => known.has(x))) again.push({ ...t, item: { ...t.item, seed: t.item.seed + 5000 }, seen: [...known] });
    else { f.sig.forEach((x) => known.add(x)); done(t, f); }
  }
  if (again.length) {
    say(`${again.map((t) => t.label).join(", ")}: came out like another: laid out again`);
    await runTasks(store, again, say, (t, f) => { f.sig.forEach((x) => known.add(x)); done(t, f); });
  }
}

/** Make `count` copies of the day's paper, in `lang` (in the background). */
export async function makeCopies(store: Store, date: string, opts: { count: number; reword: Reword; shuffle: Shuffle; lang?: Lang; articles?: Article[]; pages?: number; log: Say }): Promise<Batch> {
  const lang = opts.lang ?? (profile.language.lang as Lang);
  const day = dayOf(store, date);
  const batch: Batch = { kind: "copies", date, count: opts.count, reword: opts.reword, shuffle: opts.shuffle, lang, status: "running",
                         startedAt: new Date().toISOString(), done: 0, files: [], cost: 0, log: [], ...(opts.articles?.length ? { articles: opts.articles } : {}),
                         ...(opts.pages === 8 ? { pages: 8 } : {}) };
  return runBatch(batch, copiesDir(date), async (say) => {
    await rm(copiesDir(date), { recursive: true, force: true });
    await mkdir(copiesDir(date), { recursive: true });
    const translate = lang !== profile.language.lang;
    say(`${opts.count} cop${opts.count === 1 ? "y" : "ies"} in ${LANG_NAME[lang]}${opts.pages === 8 ? ", 8 pages" : ""}`);
    const same = opts.articles?.length ? await sameAsArticles(store, date, opts.articles, say) : { ids: [], headlines: [], cost: 0 };
    batch.cost += same.cost;
    const base = { date, reword: opts.reword, shuffle: opts.shuffle, translate, pageOf: day.pageOf, lead: day.lead,
                   ...(opts.articles?.length ? { articles: opts.articles } : {}), ...(same.ids.length ? { drop: same.ids } : {}),
                   ...(opts.pages === 8 ? { eight: { printed: day.pageOf.map(([id]) => id) } } : {}) };
    for (const [i, a] of (opts.articles ?? []).entries()) {
      say(`fixed article ${i + 1} in every copy: ${a.titles.length} title(s), ${a.decks.length} sub-heading(s), ${a.bodies.length} text(s), ${a.photos.length} photo(s)${a.photos.length > 1 ? `, 1 to ${Math.min(3, a.photos.length)} to a copy` : ""}, in turn`);
    }
    const tasks: Task[] = Array.from({ length: opts.count }, (_, i) => ({
      lang, label: `copy ${i + 1}`, spec: base, seen: day.seen,
      item: { n: i + 1, pdf: copyFile(date, i + 1), seed: i + 1 + (translate ? 1000 * LANGS.indexOf(lang) : 0) },
    }));
    const finished = tracker(batch, tasks.length);
    await layOutUnique(store, tasks, day.seen, say, (t, f) => {
      finished(t);
      batch.cost += f.cost;
      batch.files = [...batch.files, { n: f.n, lang, ready: f.ready, pages: f.pages }].sort((a, b) => a.n - b.n);
      batch.done = batch.files.length;
      say(`copy ${f.n} ready${f.ready ? "" : " (some checks need a look)"}`);
    });
    learn(store, batch);
  }, opts.log);
}

/** A sister paper made: its pages, PDF and report kept as its own issue (sister.ts). */
function keepIssue(store: Store, id: string, date: string) {
  const pdf = editionFile(date, id);
  const [issue, report] = [".json", ".report.json"].map((x) => JSON.parse(readFileSync(pdf.replace(/\.pdf$/, x), "utf8")));
  const st = sisterStore(store, id);
  const version = st.saveIssue(date, issue, report);
  // (its own PDF of each version: making all the papers again clears the day's folder)
  const kept = path.join(sisterOut(id, date), `v${version}.pdf`);
  mkdirSync(path.dirname(kept), { recursive: true });
  copyFileSync(pdf, kept);
  st.updateReport(date, version, { ...report, pdf: outName(kept) });
  // (a day's earlier versions: only its latest is kept, as for the paper's, tidy.ts)
  st.db.prepare("delete from issues where date = ? and version < ?").run(date, version);
  for (let v = 1; v < version; v++) rmSync(path.join(sisterOut(id, date), `v${v}.pdf`), { force: true });
}

/** Make the day's sister papers: each its own layout, the Gujarati ones
 * reworded (headline and sub-heading), the others translated. */
export async function makeEditions(store: Store, date: string, editions: Edition[], opts: { log: Say; only?: string }): Promise<Batch> {
  const day = dayOf(store, date);
  const list = editions.filter((e) => !opts.only || e.id === opts.only);
  const previous = batchOf("editions", date);
  const batch: Batch = { kind: "editions", date, count: list.length, reword: "headlineDeck", shuffle: "keepLead", lang: "gu", status: "running",
                         startedAt: new Date().toISOString(), done: 0, cost: 0, log: [],
                         // making one again keeps the others' record
                         files: opts.only ? (previous?.files ?? []).filter((f) => f.id !== opts.only) : [] };
  return runBatch(batch, editionsDir(date), async (say) => {
    if (!opts.only) await rm(editionsDir(date), { recursive: true, force: true });
    await mkdir(editionsDir(date), { recursive: true });
    say(list.map((e) => `${e.name} (${LANG_NAME[e.lang]})`).join(", "));
    // each paper's own seed, from its place in the full list: the same paper lays out the same way each time;
    // each with its own ads and edits, its pages kept as pictures for the newsroom (sister.ts)
    const tasks: Task[] = list.map((e): Task => ({
      lang: e.lang, label: e.name, seen: day.seen,
      spec: { date, reword: "headlineDeck", shuffle: "keepLead", translate: e.lang !== profile.language.lang, pageOf: day.pageOf, lead: day.lead,
              ads: sisterStore(store, e.id).ads(date), ...sisterStore(store, e.id).layoutEdits(date) },
      item: { n: 100 + editions.indexOf(e), id: e.id, name: e.name, pdf: editionFile(date, e.id), seed: 100 + editions.indexOf(e),
              images: path.join(sisterOut(e.id, date), "pages") },
    }))
      // the Urdu paper last: it takes longest (its tall Nastaliq), the others shouldn't wait behind it
      .sort((a, b) => Number(a.lang === "ur") - Number(b.lang === "ur"));
    const finished = tracker(batch, tasks.length);
    await layOutUnique(store, tasks, day.seen, say, (t, f) => {
      finished(t);
      const e = list.find((x) => x.id === t.item.id)!;
      batch.cost += f.cost;
      batch.files = [...batch.files.filter((x) => x.id !== e.id), { n: f.n, id: e.id, name: e.name, lang: e.lang, ready: f.ready, pages: f.pages }];
      batch.done++;
      try { keepIssue(store, e.id, date); } catch (x) { say(`${e.name}: not kept in its past issues (${x instanceof Error ? x.message : x})`); }
      say(`${e.name} ready${f.ready ? "" : " (some checks need a look)"}`);
    });
    learn(store, batch);
  }, opts.log);
}
