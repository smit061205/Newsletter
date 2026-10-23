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
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile as copyTo, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DB_FILE, ENV_FILE, MEDIA_DIR, OUT_DIR, PAPERS_HOME, ROOT } from "../config.ts";
import { buildIssue, type CopyOpts } from "../build.ts";
import { profile } from "../profile.ts";
import type { Store, Story } from "../store.ts";
import { DEFAULT_MODEL, env, numbersNotIn, openRouter, SYSTEM } from "./rewrite.ts";

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
  date: string; status: "running" | "done" | "failed"; startedAt: string; endedAt?: string;
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
}
/** Kept for the newsroom (api.ts CopiesRun). */
export type CopiesRun = Batch;

export const copiesDir = (date: string) => path.join(OUT_DIR, "copies", date);
export const copyFile = (date: string, n: number) => path.join(copiesDir(date), `copy-${n}.pdf`);
export const editionsDir = (date: string) => path.join(OUT_DIR, "editions", date);
export const editionFile = (date: string, id: string) => path.join(editionsDir(date), `${id}.pdf`);
/** The checks a different arrangement can fix (the others come with the stories themselves). */
const LAYOUT_GATES = ["1", "2", "3", "S2", "S4", "W"];

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
  const cached = store.fitted(cacheKey);
  if (cached) {
    try { got = JSON.parse(cached.body); } catch { got = null; }
  } else if (process.env.CK_FAKE_AI === "1") {
    // TESTS ONLY: Hindi "translated" letter for letter (Gujarati and Devanagari share their Unicode layout)
    const fake = (t: string) => (translate && profile.language.lang === "hi" ? t.replace(/[\u0A80-\u0AFF]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x180)) : t);
    got = Object.fromEntries(fields.map((f) => [f, fake(original[f])]));
  } else {
    const ask = translate
      ? `\nNow you are translating a finished Gujarati story into ${LANG_NAME[profile.language.lang as Lang] ?? profile.language.lang} for this paper. ` +
        "Translate it faithfully and completely into natural, formal newspaper language: the same meaning and facts, every name, number and date exactly " +
        "(numbers in Latin digits 0-9), nothing added and nothing left out. Keep the body's paragraphs (separated by a blank line) and its dateline. " +
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
  return { story: out, cost };
}

/** What one layout set needs: where each one goes, how to shuffle and word it. */
interface SetSpec {
  date: string;
  items: { n: number; id?: string; name?: string; pdf: string; seed: number }[];
  reword: Reword; shuffle: Shuffle; translate: boolean;
  /** each story's page and the lead in the day's paper */
  pageOf: [string, number][]; lead?: string;
  /** placements already used (the day's paper, earlier copies): none may repeat */
  seen: string[];
}
type Say = (line: string) => void;
type OnFile = (f: { n: number; ready: boolean; pages: number; cost: number; sig: string[] }) => void;

/** Lay out each of `spec.items` in this process (this paper's language). */
async function layOutHere(store: Store, spec: SetSpec, say: Say, onFile: OnFile) {
  const key = env("OPENROUTER_API_KEY");
  if (!key && process.env.CK_FAKE_AI !== "1") throw new Error("no OpenRouter key: add it in Settings");
  const pageOf = new Map(spec.pageOf);
  const seen = new Set(spec.seen);
  for (const item of spec.items) {
    const n = item.n;
    let rewordCost = 0;
    // the stories reworded (or translated) for this one, a few at a time
    const reword = async (pool: Story[]) => {
      const out: Story[] = new Array(pool.length);
      let cost = 0, changed = 0, next = 0;
      await Promise.all(Array.from({ length: 6 }, async () => {
        while (next < pool.length) {
          const i = next++;
          const r = key || process.env.CK_FAKE_AI === "1" ? await rewordStory(store, pool[i], n, spec.reword, key ?? "", spec.translate) : { story: pool[i], cost: 0 };
          out[i] = r.story;
          cost += r.cost;
          if (r.story.headline !== pool[i].headline) changed++;
        }
      }));
      rewordCost += cost;
      say(`  ${item.name ?? `copy ${n}`}: ${changed} of ${pool.length} stories ${spec.translate ? "translated" : "reworded"}`);
      return { pool: out, cost };
    };
    // a reworded body is fitted to its space on its own (not with the day's fits)
    const own = Object.create(store) as Store;
    own.fitted = (k: string) => store.fitted(`copy${n}|${k}`);
    own.putFitted = (k: string, v: Parameters<Store["putFitted"]>[1]) => store.putFitted(`copy${n}|${k}`, v);
    let made: { built: Awaited<ReturnType<typeof buildIssue>>; sig: string; layout: string; fails: number } | null = null;
    let spent = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const built = await buildIssue(store, spec.date, {
        log: (l) => { if (/^(built|  FAIL|  page \d+:)/.test(l)) say(`  ${l.trim()}`); },
        noReview: true,
        copy: { rng: seeded(item.seed * 7919 + attempt * 104729 + 17), shuffle: spec.shuffle, pageOf, lead: spec.lead, reword, pdfPath: item.pdf,
                translate: spec.translate, ...(spec.reword === "all" && !spec.translate ? { store: own } : {}) },
      });
      spent += built.report.cost;
      const sig = built.report.placed.map((p) => `${p.story}:${p.page}:${p.cols}`).sort().join(",");
      const at = (e: object) => { const b = e as { x?: number; y?: number; x1?: number; y1?: number }; return [Math.round(b.x ?? b.x1 ?? 0), Math.round(b.y ?? b.y1 ?? 0)]; };
      const layout = JSON.stringify(built.issue.pages.map((p) => p.elements.filter((e) => e.articleId).map((e) => [e.articleId, ...at(e)])));
      const fails = built.report.gates.filter((g) => !g.pass && LAYOUT_GATES.includes(g.gate.split(" ")[0])).length;
      const repeat = seen.has(sig) || seen.has(layout);
      if (repeat) say(`  ${item.name ?? `copy ${n}`} came out like an earlier one: laying it out again`);
      else if (!made || fails < made.fails) {
        // the best so far: its PDF kept aside (the next try writes the same file)
        made = { built, sig, layout, fails };
        await copyTo(item.pdf, `${item.pdf}.best`);
      }
      if (!repeat && fails === 0) break;
      if (!repeat && attempt < 2) say(`  ${item.name ?? `copy ${n}`}: a layout check needs a look: trying another arrangement`);
      else if (!repeat) break;
    }
    if (!made) throw new Error(`${item.name ?? `copy ${n}`} couldn't be laid out unlike the others`);
    await rename(`${item.pdf}.best`, item.pdf);
    seen.add(made.sig); seen.add(made.layout);
    onFile({ n, ready: made.built.report.ready, pages: made.built.report.pages, cost: spent, sig: [made.sig, made.layout] });
  }
}

/** Lay out `spec.items` in another language: a process of its own for that
 * language's paper, its data folder filled from this day's (see copiesIn). */
function layOutIn(lang: Lang, spec: SetSpec, say: Say, onFile: OnFile): Promise<void> {
  const paper = EDITION_OF[lang];
  const dataDir = path.join(PAPERS_HOME, "papers", paper);
  return (async () => {
    await mkdir(dataDir, { recursive: true });
    const specFile = path.join(dataDir, `copies-${spec.date}.json`);
    await writeFile(specFile, JSON.stringify(spec));
    await new Promise<void>((ok, bad) => {
      // the same Node flags as this engine (inside the app: the hook that finds the shared code)
      const child = spawn(process.execPath, [...process.execArgv, path.join(ROOT, "backend", "src", "cli.ts"), "copies-in", "--spec", specFile], {
        cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CK_PUBLICATION: paper, DATA_DIR: dataDir, CK_SOURCE_DB: DB_FILE, CK_MEDIA_DIR: MEDIA_DIR,
               CK_ENV_FILE: ENV_FILE, CK_PAPERS_HOME: PAPERS_HOME },
      });
      let buf = "", error = "";
      const line = (l: string) => {
        if (l.startsWith("@@file ")) onFile(JSON.parse(l.slice(7)));
        else if (l.startsWith("@@error ")) error = l.slice(8);
        else if (/^\s*\[copies\]/.test(l)) say(l.replace(/^\s*\[copies\] ?/, ""));
      };
      child.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } });
      child.stderr.on("data", (d) => { error ||= String(d).split("\n").find((l) => /Error/.test(l)) ?? ""; });
      child.on("error", bad);
      child.on("exit", (code) => (code === 0 ? ok() : bad(new Error(error || `the ${LANG_NAME[lang]} layout stopped (${code})`))));
    });
  })();
}

/** Inside the other language's process (cli.ts copies-in): this paper's data
 * folder gets the day's stories, releases, ads, edits and editorial plan from
 * the main paper's database, then the set is laid out here. */
export async function copiesIn(store: Store, specFile: string) {
  const spec = JSON.parse(readFileSync(specFile, "utf8")) as SetSpec;
  const src = process.env.CK_SOURCE_DB;
  try {
    if (!src || !existsSync(src)) throw new Error("no source database (CK_SOURCE_DB)");
    const d = spec.date;
    store.db.exec(`attach database '${src.replace(/'/g, "''")}' as src`);
    try {
      for (const t of ["releases", "stories", "ads"]) {
        store.db.prepare(`delete from ${t} where date = ?`).run(d);
        store.db.prepare(`insert or replace into ${t} select * from src.${t} where date = ?`).run(d);
      }
      store.db.prepare("delete from edits where issue_date = ?").run(d);
      store.db.prepare("insert into edits (issue_date, json) select issue_date, json from src.edits where issue_date = ? order by n").run(d);
      // the day's editorial plan, so the stories rank as in the day's paper (and it isn't paid for twice)
      store.db.prepare("insert or replace into fitted select * from src.fitted where key like ?").run(`plan|${d}|%`);
    } finally { store.db.exec("detach database src"); }
    await layOutHere(store, spec, (l) => console.log(`[copies] ${l}`), (f) => console.log(`@@file ${JSON.stringify(f)}`));
  } catch (e) {
    console.log(`@@error ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
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
async function runBatch(batch: Batch, dir: string, work: (say: Say) => Promise<void>, log: Say): Promise<Batch> {
  if (running) throw new Error(`${running.kind === "copies" ? "copies" : "the other papers"} for ${running.date} are still being made`);
  running = batch;
  const say = (line: string) => { batch.log.push(line); if (batch.log.length > 400) batch.log.splice(0, batch.log.length - 400); log(`  [${batch.kind}] ${line}`); };
  try {
    await work(say);
    batch.status = "done";
  } catch (e) {
    batch.status = "failed";
    batch.error = e instanceof Error ? e.message : String(e);
    say(`stopped: ${batch.error}`);
  } finally {
    batch.endedAt = new Date().toISOString();
    running = null;
    try { await mkdir(dir, { recursive: true }); await writeFile(path.join(dir, `${batch.kind}.json`), JSON.stringify(batch, null, 1)); } catch { /* the folder went */ }
  }
  return batch;
}

/** Make `count` copies of the day's paper, in `lang` (in the background). */
export async function makeCopies(store: Store, date: string, opts: { count: number; reword: Reword; shuffle: Shuffle; lang?: Lang; log: Say }): Promise<Batch> {
  const lang = opts.lang ?? (profile.language.lang as Lang);
  const day = dayOf(store, date);
  const batch: Batch = { kind: "copies", date, count: opts.count, reword: opts.reword, shuffle: opts.shuffle, lang, status: "running",
                         startedAt: new Date().toISOString(), done: 0, files: [], cost: 0, log: [] };
  return runBatch(batch, copiesDir(date), async (say) => {
    await rm(copiesDir(date), { recursive: true, force: true });
    await mkdir(copiesDir(date), { recursive: true });
    const translate = lang !== profile.language.lang;
    const spec: SetSpec = { date, reword: opts.reword, shuffle: opts.shuffle, translate, ...day,
      items: Array.from({ length: opts.count }, (_, i) => ({ n: i + 1, pdf: copyFile(date, i + 1), seed: i + 1 + (translate ? 1000 * LANGS.indexOf(lang) : 0) })) };
    say(`${opts.count} cop${opts.count === 1 ? "y" : "ies"} in ${LANG_NAME[lang]}`);
    const onFile: OnFile = (f) => {
      batch.cost += f.cost;
      batch.files.push({ n: f.n, lang, ready: f.ready, pages: f.pages });
      batch.done = batch.files.length;
      say(`copy ${f.n} ready${f.ready ? "" : " (some checks need a look)"}`);
    };
    if (translate) await layOutIn(lang, spec, say, onFile);
    else await layOutHere(store, spec, say, onFile);
  }, opts.log);
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
    const seen = [...day.seen];
    for (const lang of LANGS) {
      const mine = list.filter((e) => e.lang === lang);
      if (!mine.length) continue;
      const translate = lang !== profile.language.lang;
      // each paper's own seed, from its place in the full list: the same paper lays out the same way each time it's made
      const spec: SetSpec = { date, reword: "headlineDeck", shuffle: "keepLead", translate, pageOf: day.pageOf, lead: day.lead, seen,
        items: mine.map((e) => ({ n: 100 + editions.indexOf(e), id: e.id, name: e.name, pdf: editionFile(date, e.id), seed: 100 + editions.indexOf(e) })) };
      say(`${mine.map((e) => e.name).join(", ")} (${LANG_NAME[lang]})`);
      const onFile: OnFile = (f) => {
        const e = mine.find((x) => 100 + editions.indexOf(x) === f.n)!;
        batch.cost += f.cost;
        batch.files = [...batch.files.filter((x) => x.id !== e.id), { n: f.n, id: e.id, name: e.name, lang, ready: f.ready, pages: f.pages }];
        batch.done++;
        seen.push(...f.sig);
        say(`${e.name} ready${f.ready ? "" : " (some checks need a look)"}`);
      };
      if (translate) await layOutIn(lang, spec, say, onFile);
      else await layOutHere(store, spec, say, onFile);
    }
  }, opts.log);
}
