// Steps 3 and 5 (ROADMAP §3, §3.1-3.2): is the event genuine, then a Gujarati
// story in the house style, checked claim by claim by a different free model,
// then English and Hindi for national and world news. Pure of the database:
// run.ts brings the cluster's items in and stores what comes out, and
// try.ts runs the same steps on live items without storing anything.
import { numbersNotIn } from "../../backend/src/editorial/rewrite.ts";
import { repeats } from "../../backend/src/editorial/quality.ts";
import { askJson } from "./ai.ts";
import { ask } from "./fetch.ts";
import { pageText } from "./feed.ts";
import { pibRelease } from "./pib.ts";
import { keySet, similarity, type Triage } from "./triage.ts";
import { sourceById, type SourceDef } from "./sources.ts";
import type { English, Tier } from "../lib/types.ts";
import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

export interface ClusterItem {
  id: string; source: string; url: string; title: string; summary: string; lang: string;
  publishedAt: string | null; seenAt: string; image: string | null; triage: Triage;
}
export interface Debunk { claim: string; keys: string[]; url: string; source: string }

// ---- §3.1: the checks before writing ----

/** How long an outlet-only event waits for a second, independent outlet. */
export const WAIT_H = 6;
/** Older than this, an item isn't today's news (old news going round again). */
const STALE_H = 48;

export type Gate =
  | { state: "confirmed"; groups: string[]; official: boolean; why: string }
  | { state: "waiting"; groups: string[]; why: string }
  | { state: "dropped" | "blocked"; why: string; debunk?: Debunk };

export function gate(items: ClusterItem[], firstSeen: string, debunks: Debunk[]): Gate {
  // step 3: only fresh items count; all stale = old news recirculating
  const fresh = items.filter((it) => Date.now() - Date.parse(it.publishedAt ?? it.seenAt) < STALE_H * 3600_000);
  if (!fresh.length) return { state: "dropped", why: "old news (every report is more than 2 days old)" };
  // step 6: already debunked by a fact-checker
  const keys = keySet(fresh.flatMap((it) => it.triage.keys));
  for (const d of debunks) {
    const s = similarity(keys, keySet(d.keys));
    if (s >= 0.6 && [...keySet(d.keys)].filter((k) => keys.has(k)).length >= 3) {
      return { state: "blocked", why: `a fact-checker (${d.source}) says this is false: ${d.claim}`, debunk: d };
    }
  }
  // steps 1 and 4: who said it, and do independent sources agree
  const defs = fresh.map((it) => sourceById.get(it.source)).filter((s): s is SourceDef => !!s);
  const official = defs.some((s) => s.trust === "official");
  const groups = [...new Set(defs.filter((s) => s.trust !== "factcheck").map((s) => s.group))];
  if (official) return { state: "confirmed", groups, official, why: "from an official source" };
  if (groups.length >= 2) return { state: "confirmed", groups, official, why: `${groups.length} independent outlets report it` };
  if (Date.now() - Date.parse(firstSeen) > WAIT_H * 3600_000) return { state: "dropped", why: `no second independent source in ${WAIT_H} hours` };
  return { state: "waiting", groups, why: "waiting for a second independent source" };
}

// ---- how big a story it is ----

export type Level = "lead" | "top" | "normal" | "brief";
export function importance(maxScore: number, tier: Tier, groups: number, official: boolean): number {
  const weight = tier === "gujarat" ? 1.15 : tier === "world" ? 0.85 : 1;
  return Math.round((maxScore * weight + Math.log2(Math.max(1, groups)) * 0.8 + (official ? 0.4 : 0)) * 10) / 10;
}
export const levelOf = (imp: number): Level | null => (imp >= 9.5 ? "lead" : imp >= 7.5 ? "top" : imp >= 5 ? "normal" : imp >= 3 ? "brief" : null);
const WORDS: Record<Level, [number, number]> = { lead: [300, 450], top: [300, 450], normal: [150, 250], brief: [60, 100] };

// ---- gathering the facts ----

export interface SourceText { source: SourceDef; url: string; title: string; text: string; image: string | null; official: boolean }

/** Each report's text: an official page in full; an outlet's article as facts
 * only (its summary, and its page where robots.txt allows). At most 5. */
export async function gather(items: ClusterItem[]): Promise<SourceText[]> {
  const byTrust = [...items].sort((a, b) =>
    Number(sourceById.get(b.source)?.trust === "official") - Number(sourceById.get(a.source)?.trust === "official"));
  const seenGroups = new Set<string>();
  const out: SourceText[] = [];
  for (const it of byTrust) {
    const source = sourceById.get(it.source);
    if (!source || source.trust === "factcheck") continue;
    if (seenGroups.has(source.group) && out.length >= 2) continue;
    seenGroups.add(source.group);
    let text = it.summary;
    let image: string | null = null;
    if (it.url.includes("pib.gov.in")) {
      const r = await pibRelease(it.url);
      if (r) { text = r.text; image = r.photos[0] ?? null; }
    } else {
      const page = await ask(it.url);
      if (page.status === 200) {
        const p = pageText(page.text);
        if (p.text.length > text.length) text = p.text;
        image = p.image;
      }
    }
    // pictures only from official sources (§2): an outlet's photo is never used
    out.push({ source, url: it.url, title: it.title, text: text.slice(0, 5000), image: source.trust === "official" ? image : null, official: source.trust === "official" });
    if (out.length >= 5) break;
  }
  return out;
}

const sourcesBlock = (src: SourceText[]) => src.map((s, k) =>
  `SOURCE ${k + 1} (${s.source.name}, ${s.official ? "official" : "news outlet"}, ${s.source.lang}):\n${s.title}\n${s.text}`).join("\n\n---\n\n");

// ---- step 5: the Gujarati story ----

export interface Written { kicker: string; headline: string; deck: string; body: string; caption: string; model: string }

const WRITER = (level: Level) => {
  const [lo, hi] = WORDS[level];
  return `તમે ગાંધીનગરના ગુજરાતી દૈનિક "કેપિટલ ક્રાંતિ"ની વેબસાઇટના ઉપતંત્રી છો.
You write ONE news story in Gujarati from the sources given, for the website.
Rules:
- Use ONLY facts stated in the sources. Never add a fact, number, name, quote or cause that isn't in them. If sources differ, say so or use the official one.
- Write in your own words: never copy a sentence from a source. Quote people only where a source quotes them, and keep the quote's meaning exactly.
- House style: headline (active, specific, no exclamation marks, up to 12 words) > deck (one line: the next most important fact) > body.
- Body: ${lo}-${hi} words, the most important fact first, short paragraphs separated by a blank line. Plain, clear Gujarati.
- kicker: 1-3 words naming the topic or place, or "".
- caption: one line for the photo if a source has an official photo, else "".
- Numbers in Gujarati digits (૦-૯) as the paper prints them, with ₹, કરોડ and લાખ as Indian papers write them. Keep every number exactly as the source has it.
- Never mention AI, and never say "according to sources" vaguely: name the source (e.g. "PIB મુજબ", "બીબીસીના અહેવાલ મુજબ").
Reply with JSON only: {"kicker":"","headline":"","deck":"","body":"","caption":""}`;
};

const checkWritten = (v: unknown) => {
  const x = v as Partial<Written>;
  if (!x?.headline || typeof x.body !== "string" || x.body.length < 80) return null;
  const g = (s: unknown) => String(s ?? "").trim();
  const gu = (x.headline + x.body).match(/[઀-૿]/g)?.length ?? 0;
  if (gu < (x.headline + x.body).replace(/\s/g, "").length * 0.5) return null; // not in Gujarati
  return { kicker: g(x.kicker), headline: g(x.headline), deck: g(x.deck), body: g(x.body).replace(/\n{3,}/g, "\n\n"), caption: g(x.caption) };
};

/** Word runs of 7 a story shares with one Gujarati source, as a share of the story's: copied wording. */
export function copiedShare(story: string, source: string): number {
  const runs = (t: string) => { const w = t.split(/\s+/).filter(Boolean); const out = new Set<string>(); for (let i = 0; i + 7 <= w.length; i++) out.add(w.slice(i, i + 7).join(" ")); return out; };
  const a = runs(story), b = runs(source);
  if (!a.size) return 0;
  let both = 0;
  for (const r of a) if (b.has(r)) both++;
  return both / a.size;
}

export interface Claim { claim: string; supported: boolean; where: string }
export interface Checked { ok: boolean; problems: string[]; claims: Claim[]; model?: string; busy?: boolean }

const CHECKER = `You are the fact-checking desk of Capital Kranti, a Gujarati newspaper.
You get a Gujarati news story and the sources it was written from. List every checkable claim in the story
(who, what, where, when, how many, quotes) in English, and for each say whether the sources clearly support it.
A claim is supported only if a source states it (numbers must match exactly). Be strict: anything added, exaggerated, or guessed is NOT supported.
Reply with JSON only: {"claims":[{"claim":"...","supported":true,"where":"SOURCE 1"}],"all_supported":true}`;

/** Steps 5 and 7: the story's numbers by code, then every claim by a different free model. */
export async function check(sql: Sql | null, w: Written, src: SourceText[], date: string): Promise<Checked> {
  const problems: string[] = [];
  const all = src.map((s) => `${s.title}\n${s.text}`).join("\n\n");
  const text = [w.kicker, w.headline, w.deck, w.body, w.caption].join("\n\n");
  const wrong = numbersNotIn(text, all, date);
  if (wrong.length) problems.push(`numbers not in any source: ${wrong.join(", ")}`);
  if (repeats(w.body)) problems.push("says the same thing twice");
  for (const s of src.filter((s) => s.source.lang === "gu")) {
    const share = copiedShare(w.body, s.text);
    if (share > 0.12) problems.push(`copies ${Math.round(share * 100)}% of ${s.source.name}'s wording`);
  }
  const res = await askJson(sql, { system: CHECKER, user: `STORY:\n${text}\n\n===\n\n${sourcesBlock(src)}`, role: "checker", avoid: w.model, maxTokens: 4000 },
    (v) => {
      const x = v as { claims?: Claim[] };
      if (!Array.isArray(x?.claims) || !x.claims.length) return null;
      return x.claims.map((c) => ({ claim: String(c.claim ?? ""), supported: c.supported === true, where: String(c.where ?? "") }));
    });
  if (!res.ok) return { ok: false, problems: [...problems, `the second check didn't answer (${res.why})`], claims: [], busy: res.busy || /busy/.test(res.why) };
  const unsupported = res.value.filter((c) => !c.supported);
  for (const c of unsupported) problems.push(`not in the sources: ${c.claim}`);
  return { ok: problems.length === 0, problems, claims: res.value, model: res.model };
}

/** Write, check, and (once) rewrite with the problems named. */
export async function writeChecked(sql: Sql | null, src: SourceText[], level: Level, date: string, event: string) {
  let note = "";
  let last: { w: Written; c: Checked } | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await askJson(sql, { system: WRITER(level), user: `EVENT: ${event}\n\n${sourcesBlock(src)}${note}`, role: "writer", temperature: 0.3, maxTokens: 3500 },
      (v) => checkWritten(v));
    if (!res.ok) return { ok: false as const, why: res.why, stop: res.stop, retry: res.busy };
    const w = { ...res.value, model: res.model };
    const c = await check(sql, w, src, date);
    // the checker couldn't run (every Gemma busy): the event waits for the next run, not the editor
    if (c.busy) return { ok: false as const, why: c.problems.join("; "), retry: true };
    last = { w, c };
    if (c.ok) return { ok: true as const, written: w, checked: c };
    note = `\n\nYOUR LAST VERSION HAD THESE PROBLEMS -- fix every one, using only what the sources say:\n- ${c.problems.join("\n- ")}`;
  }
  return { ok: false as const, why: last!.c.problems.join("; "), written: last!.w, checked: last!.c };
}

// ---- §3.2: English and Hindi for national and world news ----

const TRANSLATE = (lang: "en" | "hi") => `You translate a Gujarati news story for Capital Kranti's website into ${lang === "en" ? "English, in the style of a careful Indian English newspaper" : "Hindi (Devanagari), in the style of a careful Hindi newspaper"}.
Keep every fact, name and number exactly; write numbers in figures as the Gujarati does (₹8,941 crore, 2.5 lakh${lang === "hi" ? "; Hindi uses करोड़ and लाख" : ""}); keep paragraphs separated by a blank line; translate an empty field as "". Add nothing, leave nothing out.
Reply with JSON only: {"kicker":"","headline":"","deck":"","body":"","caption":""}`;

export const needsTranslation = (tier: Tier) => tier !== "gujarat";

export async function translate(sql: Sql | null, w: Written, lang: "en" | "hi", date: string): Promise<English | null> {
  const source = [w.kicker, w.headline, w.deck, w.body, w.caption].join("\n\n");
  let note = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await askJson(sql, { system: TRANSLATE(lang), user: JSON.stringify({ kicker: w.kicker, headline: w.headline, deck: w.deck, body: w.body, caption: w.caption }) + note, maxTokens: 3500 },
      (v) => {
        const x = v as Partial<English>;
        if (!x?.headline || typeof x.body !== "string") return null;
        if (lang === "hi" && !/[ऀ-ॿ]/.test(x.headline + x.body)) return null;
        return { kicker: x.kicker ?? "", headline: x.headline, deck: x.deck ?? "", body: x.body, caption: x.caption ?? "" };
      });
    if (!res.ok) return null;
    const out = res.value;
    const wrong = numbersNotIn([out.kicker, out.headline, out.deck, out.body, out.caption].join("\n\n"), source, date);
    if (!wrong.length) return out;
    note = `\n\nYour last translation had numbers that are not in the Gujarati: ${wrong.join(", ")}. Translate again and keep every number exactly.`;
  }
  return null;
}
