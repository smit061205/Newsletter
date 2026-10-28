// Aavtikal's desk (the user, 29 Oct): deep explainers for AI, Tech and Science, never Politics. The day a
// lab releases a model, the AI section explains how it is built, its numbers, its price and what it means,
// in Gujarati an ordinary reader follows and a technical one still learns from; with graphs, tables and
// diagrams drawn by the site from the sources' own numbers, and pictures (the companies' own, credited, or
// free-licence ones).
//
//   1. a free Gemma picks the day's best subject for the beat that needs one most, from the desk's feeds
//      (the labs' and agencies' own, and good outlets) and the news engine's tech and science items;
//   2. the subject's pages are read, and the primary pages they link to (the company's announcement, its
//      paper, its pricing), with their pictures;
//   3. Gemini Flash writes the article (one request: 20 free a day for each Flash; 3.6 when 3.8's are used);
//   4. every number is checked against the sources by code, every claim by a Gemma; an article that passes
//      goes up by itself (decided 29 Oct), one that doesn't waits for the editor;
//   5. Gemini Flash Lite (500 a day) translates it into English and Hindi, graphs included; a Gemma if it can't.
//
// Run: node --experimental-strip-types site/engine/desk.ts [seconds]   (the engine's job runs it after each round)
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { numbersNotIn } from "../../backend/src/editorial/rewrite.ts";
import { WEBSITE } from "../lib/config.ts";
import type { Figure, L3 } from "../lib/flagship.ts";
import { ensureSchema } from "../lib/schema.ts";
import type { Photo } from "../lib/types.ts";
import { touched } from "../lib/write.ts";
import { askGemini, askJson, geminiLeft } from "./ai.ts";
import { parseFeed, pageText } from "./feed.ts";
import { ask } from "./fetch.ts";
import { indiaDate, storePhoto } from "./publish.ts";
import { SOURCES } from "./sources.ts";
import { leadPhoto } from "./wikiphoto.ts";

type Sql = NeonQueryFunction<false, false>;
type Beat = (typeof WEBSITE.deskBeats)[number];

// ---- where subjects come from ----

interface DeskFeed { name: string; url: string; beats: Beat[]; official: boolean }
const f = (name: string, url: string, beats: Beat[], official = false): DeskFeed => ({ name, url, beats, official });
/** The labs', companies' and agencies' own (official: their pictures may be used, credited), then good outlets.
 *  (29 Oct: New Scientist's robots.txt asks programs not to read it, and Microsoft's AI feed is gone.) */
export const DESK_FEEDS: DeskFeed[] = [
  f("OpenAI", "https://openai.com/news/rss.xml", ["ai"], true),
  f("Google DeepMind", "https://deepmind.google/blog/rss.xml", ["ai", "science"], true),
  f("Google", "https://blog.google/technology/ai/rss/", ["ai", "tech"], true),
  f("Hugging Face", "https://huggingface.co/blog/feed.xml", ["ai"], true),
  f("NVIDIA", "https://blogs.nvidia.com/feed/", ["ai", "tech"], true),
  f("NASA", "https://www.nasa.gov/feed/", ["science"], true),
  f("ESA", "https://www.esa.int/rssfeed/Our_Activities/Space_Science", ["science"], true),
  f("MIT Technology Review", "https://www.technologyreview.com/feed/", ["ai", "tech", "science"]),
  f("Ars Technica", "https://feeds.arstechnica.com/arstechnica/index", ["ai", "tech", "science"]),
  f("The Verge", "https://www.theverge.com/rss/index.xml", ["ai", "tech"]),
  f("TechCrunch", "https://techcrunch.com/feed/", ["ai", "tech"]),
  f("IEEE Spectrum", "https://spectrum.ieee.org/feeds/feed.rss", ["tech", "science", "ai"]),
  f("Wired", "https://www.wired.com/feed/rss", ["tech", "ai", "science"]),
  f("Quanta Magazine", "https://www.quantamagazine.org/feed/", ["science"]),
  f("ScienceDaily", "https://www.sciencedaily.com/rss/top/science.xml", ["science"]),
  f("Nature", "https://www.nature.com/nature.rss", ["science"]),
];
/** News outlets' hosts: their words are facts to check, never theirs to reuse, and their pictures are never used. */
const OUTLETS = new Set([
  ...DESK_FEEDS.filter((d) => !d.official).map((d) => new URL(d.url).host.replace(/^(www|feeds)\./, "")),
  ...SOURCES.filter((s) => s.trust !== "official").flatMap((s) => s.hosts.map((h) => h.replace(/^www\./, ""))),
  "reuters.com", "bloomberg.com", "cnbc.com", "theguardian.com", "nytimes.com", "bbc.com", "bbc.co.uk", "ft.com", "wsj.com",
  "venturebeat.com", "zdnet.com", "engadget.com", "theregister.com", "medium.com", "x.com", "twitter.com", "linkedin.com",
  "facebook.com", "youtube.com", "instagram.com", "reddit.com", "news.ycombinator.com",
]);
const hostOf = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return ""; } };
const isOutlet = (u: string) => { const h = hostOf(u); return [...OUTLETS].some((o) => h === o || h.endsWith(`.${o}`)); };

interface Lead { n: number; title: string; url: string; summary: string; from: string; official: boolean; at: string }

async function leads(sql: Sql, beat: Beat): Promise<Lead[]> {
  const out: Lead[] = [];
  const since = Date.now() - 4 * 86400_000;
  for (const d of DESK_FEEDS.filter((x) => x.beats.includes(beat))) {
    const a = await ask(d.url);
    if (a.status !== 200) continue;
    // the newest first (some feeds list a thousand items, oldest first)
    const items = parseFeed(a.text, a.url).map((it) => ({ it, at: it.publishedAt ? Date.parse(it.publishedAt) : 0 }))
      .filter((x) => x.at >= since).sort((x, y) => y.at - x.at).slice(0, 15);
    for (const { it, at } of items) {
      out.push({ n: 0, title: it.title, url: it.url, summary: it.summary.slice(0, 240), from: d.name, official: d.official, at: new Date(at).toISOString() });
    }
  }
  // the news engine's own tech and science items of the last three days
  const rows = await sql.query(
    `select title, url, summary, source, seen_at from items where seen_at > now() - interval '3 days' and triage is not null
       and (triage->'genres') ?| array['tech', 'health'] order by seen_at desc limit 80`);
  for (const r of rows) out.push({ n: 0, title: r.title, url: r.url, summary: String(r.summary ?? "").slice(0, 240), from: r.source, official: false, at: new Date(r.seen_at).toISOString() });
  const seen = new Set<string>();
  return out.filter((l) => !seen.has(l.url) && seen.add(l.url)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 90).map((l, i) => ({ ...l, n: i + 1 }));
}

const BEAT_WORDS: Record<Beat, string> = {
  ai: "artificial intelligence: new models and how they work, AI research, AI chips and infrastructure, what AI companies release",
  tech: "technology other than AI: chips and computers, phones and devices, the internet, software, cybersecurity, telecom, energy and EV technology",
  science: "science: space missions and astronomy, physics, biology and medicine research, climate and earth science, new discoveries",
};

const PICK = (beat: Beat) => `You are the editor of Aavtikal, a Gujarati magazine of deep explainers. Today you need ONE subject for its
${beat.toUpperCase()} section (${BEAT_WORDS[beat]}).
From the numbered list of recent items, pick the subject that most deserves a long, in-depth explainer for Indian readers:
a real, significant development with substance to explain (a new AI model and its design, a new chip, a space mission,
a discovery), with facts, numbers and specifications in the sources. Prefer what is new today and what the labs or agencies
themselves announced. Never: company deals, funding rounds, earnings and revenue results, share prices, lawsuits, opinion, product rumours, politics, celebrity news,
or a subject already covered (listed under COVERED).
Give the numbers of every item about that same subject (1 to 4 of them), the subject in one English line, and the exact title of
its English Wikipedia article if it has one (for a file photo), else "".
Reply with JSON only: {"pick":[1],"topic":"","wiki":""} or {"pick":[]} if nothing deserves it.`;

// ---- reading a subject ----

interface Source { name: string; url: string; text: string; official: boolean }
interface Picture { n: number; url: string; alt: string; from: string }

/** The pictures in a page's main part (not logos, icons or avatars), its own og:image first. */
function pictures(html: string, base: string): { url: string; alt: string }[] {
  const out: { url: string; alt: string }[] = [];
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1];
  if (og) out.push({ url: og, alt: "" });
  const main = html.match(/<(main|article)[\s\S]*?<\/\1>/i)?.[0] ?? html;
  for (const m of main.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\bsrc=["']([^"']+)/i)?.[1] ?? tag.match(/\bdata-src=["']([^"']+)/i)?.[1];
    const alt = tag.match(/\balt=["']([^"']*)/i)?.[1] ?? "";
    if (!src || /logo|icon|avatar|sprite|favicon|badge|\.svg|data:|pixel|tracking|linkedin|youtube|twitter|facebook|email|share|\b\d{1,2}x\d{1,2}\b|[_-](16|24|32|48|64)x/i.test(`${src} ${alt}`)) continue;
    out.push({ url: src, alt });
  }
  const seen = new Set<string>();
  return out.map((p) => { try { return { url: new URL(p.url, base).toString(), alt: p.alt.slice(0, 140) }; } catch { return null; } })
    .filter((p): p is { url: string; alt: string } => !!p && /^https:/.test(p.url) && !seen.has(p.url) && !!seen.add(p.url)).slice(0, 6);
}

/** The links in an outlet's article to the primary pages: the company's own announcement, paper, code, pricing. */
function primaryLinks(html: string, base: string): string[] {
  const body = html.match(/<(main|article)[\s\S]*?<\/\1>/i)?.[0] ?? html;
  const hits: { url: string; score: number }[] = [];
  for (const m of body.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try { url = new URL(m[1], base).toString(); } catch { continue; }
    if (!/^https:/.test(url) || isOutlet(url) || hostOf(url) === hostOf(base)) continue;
    const text = m[2].replace(/<[^>]+>/g, " ");
    const score = (/arxiv|github|huggingface|blog|news|press|announce|research|docs|pricing|paper|nasa\.gov|esa\.int|isro|\.gov|\.edu/i.test(url) ? 2 : 0)
      + (/announce|paper|report|release|blog|pricing|technical|model card|study|journal/i.test(text) ? 1 : 0);
    if (score > 0) hits.push({ url, score });
  }
  const seen = new Set<string>();
  return hits.sort((a, b) => b.score - a.score).map((h) => h.url).filter((u) => !seen.has(u) && !!seen.add(u)).slice(0, 3);
}

export async function research(picked: Lead[]): Promise<{ sources: Source[]; pics: Picture[] }> {
  const sources: Source[] = [];
  const raw: { url: string; alt: string; from: string }[] = [];
  const primary: string[] = [];
  for (const l of picked) {
    const a = await ask(l.url);
    if (a.status !== 200) { if (l.summary) sources.push({ name: l.from, url: l.url, text: `${l.title}\n${l.summary}`, official: l.official }); continue; }
    const p = pageText(a.text);
    const official = l.official || !isOutlet(a.url);
    sources.push({ name: l.from, url: a.url, text: `${l.title}\n\n${p.text || l.summary}`, official });
    if (official) raw.push(...pictures(a.text, a.url).map((x) => ({ ...x, from: hostOf(a.url) })));
    else primary.push(...primaryLinks(a.text, a.url));
  }
  for (const url of [...new Set(primary)].slice(0, 3)) {
    const a = await ask(url);
    if (a.status !== 200 || !/html/i.test(a.text.slice(0, 500) + "html")) continue;
    const p = pageText(a.text);
    if (p.text.length < 400) continue;
    sources.push({ name: hostOf(a.url), url: a.url, text: p.text, official: true });
    raw.push(...pictures(a.text, a.url).map((x) => ({ ...x, from: hostOf(a.url) })));
  }
  // the primary pages first; all of them together near 26,000 letters, what the writer and the checker both read
  sources.sort((a, b) => Number(b.official) - Number(a.official));
  let room = 26_000;
  const kept = sources.map((s) => { const text = s.text.slice(0, Math.max(0, Math.min(12_000, room))); room -= text.length; return { ...s, text }; }).filter((s) => s.text.length > 200);
  const seen = new Set<string>();
  const pics = raw.filter((p) => !seen.has(p.url) && !!seen.add(p.url)).slice(0, 10).map((p, i) => ({ ...p, n: i + 1 }));
  return { sources: kept, pics };
}

const block = (src: Source[]) => src.map((s, k) => `SOURCE ${k + 1} (${s.name}, ${s.official ? "the primary source" : "news outlet"}):\n${s.text}`).join("\n\n---\n\n");

// ---- writing (Gemini Flash) ----

const WRITE = `તમે "આવતીકાલ"ના વરિષ્ઠ લેખક છો: કેપિટલ ક્રાંતિ (ગાંધીનગર) ની AI, ટેક અને વિજ્ઞાનની ઊંડી સમજૂતી આપતી ગુજરાતી પત્રિકા.
You write ONE long explainer in Gujarati about the subject, from the sources given. The reader is an ordinary Gujarati reader
who is curious and intelligent; a technical reader must still learn something. Think of the best explainers in serious magazines.

Depth and structure:
- 1,500 to 2,500 words of body. Use "## " subheadings (in Gujarati) to divide it, for example: what happened and why it matters;
  the background; how it works (the design, the architecture, the mechanism, step by step, with a good everyday analogy);
  the numbers (specifications, sizes, benchmark results, dates); what it costs or what it took; how it compares with others;
  what it means for India and for ordinary people; what is still unknown or disputed.
- Explain every technical term the first time it appears, in plain Gujarati, with the English term in brackets once,
  e.g. "ટોકન (token): શબ્દનો એક નાનો ટુકડો". Keep names of models, companies and products in English letters.
- Paragraphs of 2-5 sentences separated by a blank line. No bullet lists in the body.

Accuracy (most important):
- Every specific fact about this subject (names, numbers, dates, prices, specifications, benchmark scores, quotes, results)
  must come from the sources, exactly. Never guess or round a number differently, never invent a comparison.
  You may explain well-established general concepts (what a GPU is, how a rocket stage works) in your own words.
- Write numbers in Gujarati digits (૦-૯) in the body, as the source has them; ₹, $, %, and units as usual.
- Name your sources in the text where it matters ("કંપનીની જાહેરાત મુજબ", "Nature સામયિકના અહેવાલ મુજબ").
- Never copy a sentence from a source; never mention AI writing.

Graphs, tables, diagrams and pictures (they make it easier to understand; use 2 to 5):
- "bar": a comparison of one measure across items, ONLY with numbers stated in the sources (benchmark scores of this model and
  others, prices per million tokens, sizes). rows: [{"label": "...", "value": 91.2, "mark": true for the subject itself}], "unit".
- "table": specifications side by side: "head": [column names], "cells": [[...row...]] (text, numbers as in the sources).
- "steps": how it works, 3 to 6 steps: "steps": [{"title": "...", "text": "one or two sentences"}].
- "image": one of the numbered PICTURES offered (only if it truly shows the subject): "pick": its number, "title": a Gujarati caption.
- Every figure has a Gujarati "title" and may have a "note" (e.g. "ઊંચું એટલે વધુ સારું", or what the numbers measure) and "source" (the SOURCE number).
- Place each figure in the body as its own paragraph "[[fig N]]" (N counts the figures from 1), right after the paragraph it explains.
- "cover": the number of the best PICTURE for the top of the article, or 0; "caption": its Gujarati caption.

Reply with JSON only:
{"headline":"(Gujarati, up to 14 words, specific and inviting)","dek":"(Gujarati, one or two sentences)","body":"...",
 "cover":0,"caption":"","figures":[{"kind":"bar","title":"","note":"","unit":"","source":1,"rows":[{"label":"","value":0,"mark":false}]}]}`;

interface DraftFigure { kind: string; title?: string; note?: string; unit?: string; source?: number; pick?: number;
  rows?: { label?: string; value?: unknown; mark?: boolean }[]; head?: string[]; cells?: unknown[][]; steps?: { title?: string; text?: string }[] }
interface Draft { headline: string; dek: string; body: string; cover: number; caption: string; figures: DraftFigure[] }

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const one = (gu: string): L3 => ({ gu, en: "", hi: "" });

function readDraft(v: unknown): Draft | null {
  const x = v as Partial<Draft>;
  if (!x?.headline || typeof x.body !== "string" || words(x.body) < 700) return null;
  if ((x.body.match(/[઀-૿]/g)?.length ?? 0) < x.body.replace(/\s/g, "").length * 0.5) return null;
  return { headline: String(x.headline).trim(), dek: String(x.dek ?? "").trim(), body: x.body.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim(),
    cover: Number(x.cover) || 0, caption: String(x.caption ?? "").trim(), figures: Array.isArray(x.figures) ? (x.figures as DraftFigure[]) : [] };
}

/** The draft's figures made into the site's, in Gujarati (the translation adds English and Hindi); a broken one is left out. */
function figuresOf(d: Draft): (Figure | null)[] {
  return d.figures.map((g): Figure | null => {
    const title = one(String(g.title ?? "").trim()), note = g.note ? one(String(g.note).trim()) : undefined;
    if (g.kind === "bar") {
      const rows = (g.rows ?? []).map((r) => ({ label: one(String(r.label ?? "").trim()), value: Number(r.value), mark: r.mark === true }))
        .filter((r) => r.label.gu && Number.isFinite(r.value));
      return rows.length >= 2 ? { kind: "bar", title, note, unit: String(g.unit ?? "").slice(0, 40), rows } : null;
    }
    if (g.kind === "table") {
      const head = (g.head ?? []).map((h) => one(String(h)));
      const cells = (g.cells ?? []).filter(Array.isArray).map((r) => r.map((c) => one(String(c ?? ""))));
      return head.length >= 2 && cells.length >= 1 ? { kind: "table", title, note, head, cells: cells.map((r) => r.slice(0, head.length)) } : null;
    }
    if (g.kind === "steps") {
      const steps = (g.steps ?? []).map((s) => ({ title: one(String(s.title ?? "").trim()), text: one(String(s.text ?? "").trim()) })).filter((s) => s.title.gu);
      return steps.length >= 2 ? { kind: "steps", title, note, steps } : null;
    }
    if (g.kind === "image" && Number(g.pick) > 0) return { kind: "image", title, pick: Number(g.pick) };
    return null;
  });
}

/** The figures' numbers and words, for the number check. */
const figureText = (figs: Figure[]) => figs.map((g) => [
  ...(g.rows ?? []).map((r) => `${r.label.gu} ${r.value}`), ...(g.cells ?? []).flat().map((c) => c.gu), ...(g.steps ?? []).map((s) => `${s.title.gu} ${s.text.gu}`),
].join("\n")).join("\n");

// ---- checking (a Gemma) ----

const CHECK = `You are the fact-checking desk of Aavtikal, a Gujarati magazine. You get a long Gujarati explainer and its sources.
List the article's specific, checkable claims about its subject (names, numbers, dates, prices, specifications, benchmark results,
quotes, who did what) in English, and say for each whether the sources clearly support it. Numbers must match exactly.
General explanations of well-established concepts (how a GPU works, what an orbit is) are NOT claims to check.
Be strict about the subject's specifics: anything added, exaggerated or guessed is NOT supported.
Reply with JSON only: {"claims":[{"claim":"...","supported":true}]}`;

async function checkArticle(sql: Sql, text: string, src: Source[], date: string): Promise<string[]> {
  const all = src.map((s) => s.text).join("\n\n");
  const problems: string[] = [];
  const wrong = numbersNotIn(text, all, date);
  if (wrong.length) problems.push(`numbers not in any source: ${wrong.slice(0, 8).join(", ")}`);
  const stray = text.match(/[ऀ-ॿঀ-੿଀-෿]+/g);
  if (stray) problems.push(`letters from another script: ${[...new Set(stray)].slice(0, 3).join(", ")}`);
  const res = await askJson(sql, { system: CHECK, user: `ARTICLE:\n${text}\n\n===\n\n${block(src)}`, role: "checker", maxTokens: 8000 },
    (v) => { const c = (v as { claims?: { claim?: string; supported?: boolean }[] })?.claims; return Array.isArray(c) && c.length ? c : null; });
  if (!res.ok) problems.push(`the claim check didn't answer (${res.why.slice(0, 120)})`);
  else for (const c of res.value.filter((c) => c.supported !== true)) problems.push(`not in the sources: ${String(c.claim ?? "").slice(0, 160)}`);
  return problems;
}

// ---- translating (Gemini Flash Lite), graphs included ----

const TRANSLATE = (lang: "en" | "hi") => `You translate a long Gujarati explainer from Aavtikal into ${lang === "en"
  ? "English, in the clear, precise style of a serious science and technology magazine"
  : "Hindi (Devanagari), in the clear, precise style of a serious Hindi science and technology magazine"}.
Translate faithfully and completely: every fact, name and number exactly as the Gujarati has it (numbers in ordinary digits 0-9),
every paragraph, every "## " subheading; keep each "[[fig N]]" paragraph exactly as it is. Technical terms as a careful
${lang === "en" ? "English" : "Hindi"} writer would use them. Add nothing, leave nothing out.
"strings" are the labels of the article's graphs and tables: translate each, in the same order, the same number of them.
Reply with JSON only: {"headline":"","dek":"","caption":"","body":"","strings":[]}`;

/** Every text in the figures, in order (and back again). */
function figureStrings(figs: Figure[]): L3[] {
  return figs.flatMap((g) => [g.title, ...(g.note ? [g.note] : []), ...(g.rows ?? []).map((r) => r.label), ...(g.head ?? []), ...(g.cells ?? []).flat(),
    ...(g.steps ?? []).flatMap((s) => [s.title, s.text])]);
}

interface Words3 { headline: string; dek: string; caption: string; body: string }

async function translate(sql: Sql, gu: Words3, figs: Figure[], lang: "en" | "hi", date: string): Promise<Words3 | null> {
  const labels = figureStrings(figs);
  const source = [gu.headline, gu.dek, gu.caption, gu.body, ...labels.map((l) => l.gu)].join("\n\n");
  const marks = (s: string) => (s.match(/\[\[fig \d+\]\]/g) ?? []).join();
  let note = "";
  const take = (v: unknown) => {
    const x = v as Partial<Words3> & { strings?: unknown[] };
    if (!x?.headline || typeof x.body !== "string" || words(x.body) < words(gu.body) * 0.6) return null;
    if (marks(x.body) !== marks(gu.body) || !Array.isArray(x.strings) || x.strings.length !== labels.length) return null;
    if (lang === "hi" && !/[ऀ-ॿ]/.test(x.headline + x.body)) return null;
    return { headline: String(x.headline), dek: String(x.dek ?? ""), caption: String(x.caption ?? ""), body: x.body, strings: x.strings.map(String) };
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    // Gemini Flash Lite; a Gemma when its requests are used up
    const ask = { system: TRANSLATE(lang), user: JSON.stringify({ ...gu, strings: labels.map((l) => l.gu) }) + note, maxTokens: 20_000 };
    const res = await askGemini(sql, "lite", ask, take).then((r) => (r.ok || !r.stop ? r : askJson(sql, ask, take)));
    if (!res.ok) return null;
    const out = res.value;
    const wrong = numbersNotIn([out.headline, out.dek, out.caption, out.body, ...out.strings].join("\n"), source, date);
    if (!wrong.length) {
      out.strings.forEach((s, i) => { labels[i][lang] = s; });
      return { headline: out.headline, dek: out.dek, caption: out.caption, body: out.body };
    }
    note = `\n\nYour last translation had numbers that are not in the Gujarati: ${wrong.join(", ")}. Translate again and keep every number exactly.`;
  }
  return null;
}

// ---- one article ----

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "article";

/** Which beat needs an article most: the day's target shared about 4 : 3 : 3 between AI, Tech and Science. */
async function beatToday(sql: Sql, date: string, target: number): Promise<Beat | null> {
  const rows = await sql.query(
    `select beat, count(*)::int as n from features where author = 'desk' and (created_at at time zone 'Asia/Kolkata')::date = $1::date group by beat`, [date]);
  const have = Object.fromEntries(rows.map((r) => [r.beat, r.n as number])) as Record<string, number>;
  const done = Object.values(have).reduce((a, b) => a + b, 0);
  if (done >= target) return null;
  const share: Record<Beat, number> = { ai: 0.4, tech: 0.3, science: 0.3 };
  return [...WEBSITE.deskBeats].sort((a, b) => ((have[a] ?? 0) - share[a] * target) - ((have[b] ?? 0) - share[b] * target))[0];
}

type Outcome = "published" | "held" | "skipped" | "done" | "stop";

async function oneArticle(sql: Sql, log: (s: string) => void): Promise<Outcome> {
  const date = indiaDate();
  const target = WEBSITE.deskDays[date] ?? WEBSITE.deskDaily;
  const beat = await beatToday(sql, date, target);
  if (!beat) { log(`today's ${target} articles are done`); return "done"; }
  if (!(await geminiLeft(sql, "writer"))) { log("Gemini Flash's free requests for today are used up"); return "stop"; }

  // 1. the subject
  const list = await leads(sql, beat);
  const covered = [
    ...(await sql.query(`select coalesce(topic, headline) as t from features where created_at > now() - interval '30 days' order by created_at desc limit 80`)).map((r) => r.t as string),
    ...String((await sql.query(`select value from state where key = 'desk_skipped'`))[0]?.value ?? "").split("\n").filter(Boolean),
  ];
  const pick = await askJson(sql, {
    system: PICK(beat),
    user: `ITEMS:\n${list.map((l) => `${l.n}. [${l.from}${l.official ? ", official" : ""}, ${l.at.slice(0, 10)}] ${l.title} -- ${l.summary}`).join("\n")}\n\nCOVERED:\n${covered.join("\n") || "(nothing yet)"}`,
    maxTokens: 600,
  }, (v) => { const x = v as { pick?: unknown[]; topic?: string; wiki?: string }; return Array.isArray(x?.pick) ? { pick: x.pick.map(Number).filter((n) => n >= 1 && n <= list.length), topic: String(x.topic ?? ""), wiki: String(x.wiki ?? "") } : null; });
  if (!pick.ok) { log(`${beat}: no subject picked (${pick.why.slice(0, 120)})`); return pick.stop ? "stop" : "skipped"; }
  if (!pick.value.pick.length || !pick.value.topic) { log(`${beat}: nothing today deserves an explainer`); return "skipped"; }
  const topic = pick.value.topic.slice(0, 200);
  log(`${beat}: ${topic}`);

  // 2. the sources and their pictures
  const { sources, pics } = await research(pick.value.pick.map((n) => list[n - 1]));
  if (sources.reduce((n, s) => n + words(s.text), 0) < 500) {
    log("  too little to read about it: left for another day");
    await sql.query(`insert into state (key, value) values ('desk_skipped', $1) on conflict (key) do update set value = (
      select string_agg(t, E'\n') from (select unnest(string_to_array($1 || E'\n' || state.value, E'\n')) as t limit 40) x)`, [topic]);
    return "skipped";
  }

  // 3. the Gujarati article (Gemini Flash)
  const draft = await askGemini(sql, "writer", {
    system: WRITE,
    user: `SUBJECT (${beat}): ${topic}\n\nPICTURES:\n${pics.map((p) => `${p.n}. from ${p.from}: ${p.alt || "(no description)"}`).join("\n") || "(none)"}\n\n${block(sources)}`,
  }, readDraft);
  if (!draft.ok) { log(`  not written: ${draft.why}`); return draft.stop ? "stop" : "skipped"; }
  const d = draft.value;

  // the figures: graphs and tables checked number by number; a picture taken into the site's store, credited
  let id = slug(topic);
  if ((await sql.query(`select 1 from features where id = $1`, [id])).length) id = `${id}-${date.slice(5).replace("-", "")}`;
  const all = sources.map((s) => s.text).join("\n\n");
  const made = figuresOf(d);
  const figs: Figure[] = [];
  const renumber = new Map<number, number>();
  for (const [i, g] of made.entries()) {
    if (!g) continue;
    if (g.kind === "image") {
      const p = pics.find((x) => x.n === g.pick);
      const stored = p ? await storePhoto(sql, p.url, `${id}-${figs.length + 1}`) : null;
      if (!stored || !p) continue;
      g.photo = { ...stored, credit: p.from };
      delete g.pick;
    } else if (numbersNotIn(figureText([g]), all, date).length) {
      log(`  a ${g.kind} left out: its numbers aren't all in the sources`);
      continue;
    }
    figs.push(g);
    renumber.set(i + 1, figs.length);
  }
  const body = d.body.split("\n\n").map((p) => {
    const m = p.trim().match(/^\[\[fig (\d+)\]\]$/);
    if (!m) return p;
    const n = renumber.get(Number(m[1]));
    return n ? `[[fig ${n}]]` : null;
  }).filter((p): p is string => p !== null).join("\n\n");

  // the picture at the top: the writer's pick, else a free-licence file photo of the subject
  let photo: (Photo & { credit?: string }) | null = null;
  let caption = d.caption;
  const coverPic = pics.find((p) => p.n === d.cover);
  if (coverPic) { const s = await storePhoto(sql, coverPic.url, `${id}-cover`); if (s) photo = { ...s, credit: coverPic.from }; }
  if (!photo && pick.value.wiki) {
    const lead = await leadPhoto(pick.value.wiki).catch(() => null);
    const s = lead ? await storePhoto(sql, lead.url, `${id}-cover`) : null;
    if (s && lead) { photo = { ...s, credit: lead.credit }; caption = caption || `ફાઇલ ફોટો: ${pick.value.wiki}`; }
  }

  // 4. the check
  const gu = { headline: d.headline, dek: d.dek, caption, body };
  const problems = await checkArticle(sql, [d.headline, d.dek, body, figureText(figs)].join("\n\n"), sources, date);

  // 5. English and Hindi
  const en = await translate(sql, gu, figs, "en", date);
  const hi = await translate(sql, gu, figs, "hi", date);

  const status = problems.length ? "held" : "published";
  await sql.query(
    `insert into features (id, beat, status, headline, dek, body, caption, photo, author, en, hi, sources, checks, figures, topic, published_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'desk', $9, $10, $11, $12, $13, $14, case when $3 = 'published' then now() end, now())`,
    [id, beat, status, gu.headline, gu.dek, gu.body, gu.caption, photo ? JSON.stringify(photo) : null,
     en ? JSON.stringify(en) : null, hi ? JSON.stringify(hi) : null,
     JSON.stringify(sources.map((s) => ({ name: s.name, url: s.url, trust: s.official ? "official" : "outlet" }))),
     JSON.stringify({ problems, writer: draft.model, words: words(body) }), JSON.stringify(figs), topic]);
  await touched(sql);
  log(`  ${status}: ${id} (${words(body)} words, ${figs.length} figure(s)${photo ? ", a photo" : ""}${en ? ", English" : ""}${hi ? ", Hindi" : ""})${problems.length ? `: ${problems.slice(0, 2).join("; ")}` : ""}`);
  return status;
}

/** The desk's articles of the last week without their English or Hindi (a translation that failed) get them. */
async function retranslate(sql: Sql, log: (s: string) => void, deadline: number) {
  const rows = await sql.query(
    `select id, headline, dek, caption, body, figures, en, hi from features where author = 'desk' and status in ('published', 'held')
       and (en is null or hi is null) and created_at > now() - interval '7 days' order by created_at desc limit 3`);
  for (const r of rows) {
    if (Date.now() > deadline - 3 * 60_000) return;
    const figs = (r.figures ?? []) as Figure[];
    const gu = { headline: r.headline, dek: r.dek, caption: r.caption, body: r.body };
    const en = r.en ?? (await translate(sql, gu, figs, "en", indiaDate()));
    const hi = r.hi ?? (await translate(sql, gu, figs, "hi", indiaDate()));
    await sql.query(`update features set en = $2, hi = $3, figures = $4, updated_at = now() where id = $1`,
      [r.id, en ? JSON.stringify(en) : null, hi ? JSON.stringify(hi) : null, JSON.stringify(figs)]);
    log(`  ${r.id}: translated again${en ? " (English)" : ""}${hi ? " (Hindi)" : ""}`);
    if (en || hi) await touched(sql);
  }
}

// ---- run: as many articles as the time allows (about 8 minutes each) ----

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = Date.now();
  const deadline = started + Math.max(60, Number(process.argv[2] ?? 900)) * 1000;
  const log = (s: string) => console.log(s);
  if (!process.env.DATABASE_URL) { log("no DATABASE_URL"); process.exit(0); }
  const sql = neon(process.env.DATABASE_URL);
  await ensureSchema(sql);
  const [paused] = await sql.query(`select value from state where key = 'engine_paused'`);
  if (paused?.value === "yes") { log("the engine is stopped by the editor"); process.exit(0); }
  const [run] = await sql.query(`insert into runs (kind) values ('desk') returning id`);
  const details: Record<string, number> = { published: 0, held: 0, skipped: 0 };
  try {
    while (deadline - Date.now() > 8 * 60_000) {
      const r = await oneArticle(sql, log);
      // nothing more to do today (the day's articles made, or Flash's requests used up): the job rests a while
      if (r === "done" || r === "stop") { process.exitCode = 3; break; }
      details[r] = (details[r] ?? 0) + 1;
      if (r === "skipped" && details.skipped >= 3) break;
    }
    await retranslate(sql, log, deadline);
    await sql.query(`update runs set finished_at = now(), ok = true, details = $2 where id = $1`, [run.id, JSON.stringify(details)]);
  } catch (e) {
    log(`failed: ${e instanceof Error ? e.stack : e}`);
    await sql.query(`update runs set finished_at = now(), ok = false, details = $2 where id = $1`, [run.id, JSON.stringify({ ...details, error: String(e).slice(0, 400) })]);
  }
  if (details.published || details.held) await fetch(`${WEBSITE.url}/api/refresh`, { method: "POST", signal: AbortSignal.timeout(30_000) }).catch(() => null);
}
