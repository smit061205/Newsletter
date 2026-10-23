// Copies of the day's paper: the same stories, each copy laid out its own
// way and worded a little differently, with the masthead, the page headers
// and the last page's footer left empty -- each copy then gets its own paper's
// name and details by hand (in CorelDRAW). For each copy:
//
//   1. every story is reworded by the AI, as much as the editor chose: the
//      headline; the headline and sub-heading; or all of it. The meaning,
//      every name and every number stay; a version that changes a number is
//      not used (the story keeps its own words there);
//   2. the pages are laid out again (build.ts, its copy mode) with the stories
//      in a shuffled order and a little chance in every choice, as far as the
//      editor chose: anywhere, keeping the lead on the front page; anywhere;
//      or each story on its own page;
//   3. a copy that comes out placed the same as one before it is laid out
//      again, so no two copies match.
//
// The copies go to out/copies/<date>/copy-N.pdf, never into the day's issue.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile as copyTo, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUT_DIR } from "../config.ts";
import { buildIssue, type CopyOpts } from "../build.ts";
import type { Store, Story } from "../store.ts";
import { DEFAULT_MODEL, env, numbersNotIn, openRouter, SYSTEM } from "./rewrite.ts";

export type Reword = "headline" | "headlineDeck" | "all";
export type Shuffle = CopyOpts["shuffle"];
export interface CopiesRun {
  date: string; count: number; reword: Reword; shuffle: Shuffle;
  status: "running" | "done" | "failed"; startedAt: string; endedAt?: string;
  /** copies made so far */
  done: number;
  files: { n: number; ready: boolean; pages: number }[];
  /** AI spend, USD */
  cost: number;
  log: string[];
  error?: string;
}

export const copiesDir = (date: string) => path.join(OUT_DIR, "copies", date);
/** The checks a different arrangement can fix (the others come with the stories themselves). */
const LAYOUT_GATES = ["1", "2", "3", "S2", "S4", "W"];
export const copyFile = (date: string, n: number) => path.join(copiesDir(date), `copy-${n}.pdf`);

let running: CopiesRun | null = null;
/** The copies being made now, if any. */
export const currentCopies = () => running;

/** The day's copies: being made, or the last ones made (their manifest). */
export function copiesOf(date: string): CopiesRun | null {
  if (running?.date === date) return running;
  const file = path.join(copiesDir(date), "copies.json");
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")) as CopiesRun; } catch { return null; }
}

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

/** One story, worded a little differently for copy `n`: null when the model
 * couldn't (the story keeps its own words). Cached per story, copy and text. */
async function rewordStory(store: Store, s: Story, n: number, reword: Reword, key: string, model: string):
  Promise<{ story: Story; cost: number }> {
  const fields = reword === "headline" ? ["headline"] : reword === "headlineDeck" ? ["headline", "deck"] : ["headline", "deck", "body"];
  const original: Record<string, string> = { headline: s.headline, deck: s.deck ?? "", body: s.bodies.long };
  const hash = createHash("sha1").update(JSON.stringify(fields.map((f) => original[f]))).digest("hex").slice(0, 12);
  const cacheKey = `copy|${s.id}|${n}|${reword}|${hash}`;
  let got: Record<string, string> | null = null;
  let cost = 0;
  const cached = store.fitted(cacheKey);
  if (cached) {
    try { got = JSON.parse(cached.body); } catch { got = null; }
  } else if (process.env.CK_FAKE_AI === "1") {
    got = Object.fromEntries(fields.map((f) => [f, original[f]]));
  } else {
    const res = await openRouter({
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "x-title": "Capital Kranti backend" },
      body: JSON.stringify({
        model, temperature: 0.7, usage: { include: true },
        response_format: { type: "json_schema", json_schema: SCHEMA(fields) },
        messages: [
          { role: "system", content: SYSTEM + "\nNow you are rewording a finished story for another edition of the paper (edition " + n + "). " +
            "Say the same thing in slightly different words: the same meaning, the same facts, every name, number and date exactly as they are, " +
            "nothing added and nothing left out. Change the wording noticeably but naturally -- it must still read as good newspaper writing, " +
            "about as long as before. " +
            (fields.includes("body") ? "Keep the body's paragraphs (separated by a blank line) and its dateline at the start. " : "") +
            `Return JSON {${fields.join(", ")}}.` },
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
  // each field only if it kept every number and stayed about as long
  const ok = (f: string) => {
    const v = (got![f] ?? "").trim();
    if (!v) return false;
    const was = original[f];
    if (numbersNotIn(v, was).length || numbersNotIn(was, v).length) return false;
    const ratio = v.length / Math.max(1, was.length);
    return f === "body" ? ratio > 0.85 && ratio < 1.15 : ratio > 0.6 && ratio < 1.5;
  };
  const out: Story = { ...s, bodies: { ...s.bodies } };
  if (ok("headline")) out.headline = got.headline.trim().replace(/\s+/g, " ");
  if (fields.includes("deck") && original.deck && ok("deck")) out.deck = got.deck.trim().replace(/\s+/g, " ");
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
  return { story: out, cost };
}

/** Make `count` copies of the day's paper, one after another (in the background). */
export async function makeCopies(store: Store, date: string, opts: { count: number; reword: Reword; shuffle: Shuffle; log: (s: string) => void }):
  Promise<CopiesRun> {
  if (running) throw new Error(`copies for ${running.date} are still being made`);
  const got = store.latestIssue(date);
  if (!got) throw new Error(`no paper made for ${date} yet: make the day's paper first`);
  const run: CopiesRun = { date, count: opts.count, reword: opts.reword, shuffle: opts.shuffle, status: "running",
                           startedAt: new Date().toISOString(), done: 0, files: [], cost: 0, log: [] };
  running = run;
  const say = (line: string) => { run.log.push(line); if (run.log.length > 400) run.log.splice(0, run.log.length - 400); opts.log(`  [copies] ${line}`); };
  try {
    const key = env("OPENROUTER_API_KEY");
    if (!key && process.env.CK_FAKE_AI !== "1") throw new Error("no OpenRouter key: add it in Settings");
    const model = env("OPENROUTER_MODEL") ?? DEFAULT_MODEL;
    const report = got.report as { placed?: { page: number; story: string; cols: number; rank: number }[] };
    const pageOf = new Map((report.placed ?? []).map((p) => [p.story, p.page]));
    const lead = report.placed?.find((p) => p.page === 1 && p.rank === 1)?.story;
    const dir = copiesDir(date);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    // the day's own paper counts: no copy may be placed just like it
    const seen = new Set<string>([(report.placed ?? []).map((p) => `${p.story}:${p.page}:${p.cols}`).sort().join(",")]);
    for (let n = 1; n <= opts.count; n++) {
      say(`copy ${n} of ${opts.count}`);
      // the stories reworded for this copy, a few at a time
      const reword = async (pool: Story[]) => {
        const out: Story[] = new Array(pool.length);
        let cost = 0, changed = 0, next = 0;
        await Promise.all(Array.from({ length: 6 }, async () => {
          while (next < pool.length) {
            const i = next++;
            const r = key ? await rewordStory(store, pool[i], n, opts.reword, key, model) : { story: pool[i], cost: 0 };
            out[i] = r.story;
            cost += r.cost;
            if (r.story.headline !== pool[i].headline) changed++;
          }
        }));
        say(`  copy ${n}: ${changed} of ${pool.length} headlines reworded`);
        return { pool: out, cost };
      };
      // a reworded body is fitted to its space on its own (not with the day's fits)
      const own = Object.create(store) as Store;
      own.fitted = (k: string) => store.fitted(`copy${n}|${k}`);
      own.putFitted = (k: string, v: Parameters<Store["putFitted"]>[1]) => store.putFitted(`copy${n}|${k}`, v);
      // a copy placed like an earlier one, or with a layout check failing,
      // is laid out again another way (the best of a few tries is kept)
      let made: { built: Awaited<ReturnType<typeof buildIssue>>; sig: string; layout: string; fails: number } | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const built = await buildIssue(store, date, {
          log: (l) => { if (/^(built|gates|  (FAIL|pass)|  page \d+:)/.test(l)) say(`  ${l.trim()}`); },
          noReview: true,
          copy: { rng: seeded(n * 7919 + attempt * 104729 + 17), shuffle: opts.shuffle, pageOf, lead, reword, pdfPath: copyFile(date, n),
                  ...(opts.reword === "all" ? { store: own } : {}) },
        });
        run.cost += built.report.cost;
        const sig = built.report.placed.map((p) => `${p.story}:${p.page}:${p.cols}`).sort().join(",");
        const at = (e: object) => { const b = e as { x?: number; y?: number; x1?: number; y1?: number }; return [Math.round(b.x ?? b.x1 ?? 0), Math.round(b.y ?? b.y1 ?? 0)]; };
        const layout = JSON.stringify(built.issue.pages.map((p) => p.elements.filter((e) => e.articleId).map((e) => [e.articleId, ...at(e)])));
        const fails = built.report.gates.filter((g) => !g.pass && LAYOUT_GATES.includes(g.gate.split(" ")[0])).length;
        const repeat = seen.has(sig) || seen.has(layout);
        if (repeat) say(`  copy ${n} came out like an earlier one: laying it out again`);
        else if (!made || fails < made.fails) {
          // the best so far: its PDF is kept aside (the next try writes the same file)
          made = { built, sig, layout, fails };
          await copyTo(copyFile(date, n), `${copyFile(date, n)}.best`);
        }
        if (!repeat && fails === 0) break;
        if (!repeat && attempt < 2) say(`  copy ${n}: a layout check needs a look: trying another arrangement`);
        else if (!repeat) break;
      }
      if (!made) throw new Error(`copy ${n} couldn't be laid out unlike the others`);
      await rename(`${copyFile(date, n)}.best`, copyFile(date, n));
      seen.add(made.sig); seen.add(made.layout);
      run.files.push({ n, ready: made.built.report.ready, pages: made.built.report.pages });
      run.done = n;
      say(`  copy ${n} ready${made.built.report.ready ? "" : " (some checks need a look)"}`);
    }
    run.status = "done";
  } catch (e) {
    run.status = "failed";
    run.error = e instanceof Error ? e.message : String(e);
    say(`stopped: ${run.error}`);
  } finally {
    run.endedAt = new Date().toISOString();
    running = null;
    try { await mkdir(copiesDir(date), { recursive: true }); await writeFile(path.join(copiesDir(date), "copies.json"), JSON.stringify(run, null, 1)); } catch { /* the folder went */ }
  }
  return run;
}
