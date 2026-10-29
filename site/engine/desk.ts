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
//   4. every number is checked against the sources by code, every claim by Gemini Flash Lite; an article that passes
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
import { askGemini, askJson, geminiLeft, geminiRemaining } from "./ai.ts";
import { parseFeed, pageText } from "./feed.ts";
import { ask } from "./fetch.ts";
import { indiaDate, storePhoto } from "./publish.ts";
import { SOURCES } from "./sources.ts";
import { commonsPictures, commonsSearch, UA as WIKI_UA } from "./wikiphoto.ts";

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
Give the numbers of every item about that same subject (1 to 4 of them), the subject in one English line, and the exact titles
of the English Wikipedia articles on it (for background and free photos): the subject's own if it has one, the company, lab,
agency or mission behind it, and a broader one with good photos (the technology, the machine, the place).
Reply with JSON only: {"pick":[1],"topic":"","wiki":["","",""]} or {"pick":[]} if nothing deserves it.`;

// ---- reading a subject ----

interface Source { name: string; url: string; text: string; official: boolean }
/** A picture on offer: an official page's (stored in the site's own store, credited to its site) or a free-licence
 *  one from Wikimedia Commons (shown from Wikimedia's servers: it has its size and its credit already). */
interface Picture { n: number; url: string; alt: string; from: string; credit?: string; width?: number; height?: number }

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

/** A Wikipedia article's text, for background facts (its own photos come from commonsPictures). */
async function wikiText(title: string): Promise<{ url: string; text: string } | null> {
  const q = new URLSearchParams({ action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title, format: "json", origin: "*" });
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?${q}`, { headers: { "user-agent": WIKI_UA }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    const pg = Object.values(((await r.json()) as { query?: { pages?: Record<string, { title?: string; extract?: string }> } }).query?.pages ?? {})[0];
    if (!pg?.title || !pg.extract || pg.extract.length < 800) return null;
    const text = pg.extract.replace(/\n={2,}\s*(See also|References|External links|Notes|Further reading)\s*={2,}[\s\S]*$/, "");
    return { url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, "_"))}`, text };
  } catch {
    return null;
  }
}

export async function research(picked: Lead[], wiki: string[] = []): Promise<{ sources: Source[]; pics: Picture[] }> {
  const sources: Source[] = [];
  const raw: Omit<Picture, "n">[] = [];
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
  // Wikipedia for the background, and its free-licence photos (the user, 29 Oct: several pictures in every article)
  for (const [i, title] of wiki.slice(0, 4).entries()) {
    const w = i < 2 ? await wikiText(title) : null;
    if (w) sources.push({ name: "Wikipedia", url: w.url, text: w.text, official: false });
    raw.push(...(await commonsPictures(title, 5)).map((x) => ({ ...x, from: "Wikimedia Commons" })));
  }
  // still no picture: Wikimedia Commons searched for the subject's names (29 Oct: Dholera's chip plants had none)
  for (const q of wiki.slice(0, 3)) {
    if (raw.length) break;
    raw.push(...(await commonsSearch(q, 4)).map((x) => ({ ...x, from: "Wikimedia Commons" })));
  }
  // the primary pages first; all of them together near 30,000 letters, what the writer and the checker both read
  sources.sort((a, b) => Number(b.official) - Number(a.official));
  let room = 30_000;
  const kept = sources.map((s) => { const text = s.text.slice(0, Math.max(0, Math.min(12_000, room))); room -= text.length; return { ...s, text }; }).filter((s) => s.text.length > 200);
  const seen = new Set<string>();
  const pics = raw.filter((p) => !seen.has(p.url) && !!seen.add(p.url)).slice(0, 12).map((p, i) => ({ ...p, n: i + 1 }));
  return { sources: kept, pics };
}

/** The numbers not in the sources, leaving out small counts up to 10 ("3 steps", "4 reasons": the article's own way of
 *  explaining; 29 Oct, an article was held for a "4" and a "3"); the claim check still reads every fact. */
const unsourced = (out: string, src: string, date: string) => numbersNotIn(out, src, date).filter((n) => {
  const v = Number(n.replace(/[૦-૯]/g, (d) => String("૦૧૨૩૪૫૬૭૮૯".indexOf(d))).replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).replace(/,/g, ""));
  return !(Number.isInteger(v) && v >= 0 && v <= 10);
});

const block = (src: Source[]) => src.map((s, k) => `SOURCE ${k + 1} (${s.name}, ${s.official ? "the primary source" : "news outlet"}):\n${s.text}`).join("\n\n---\n\n");

// ---- writing (Gemini Flash) ----

const WRITE = `તમે "આવતીકાલ"ના વરિષ્ઠ લેખક છો: કેપિટલ ક્રાંતિ (ગાંધીનગર) ની AI, ટેક અને વિજ્ઞાનની ઊંડી સમજૂતી આપતી ગુજરાતી પત્રિકા.
You write ONE long explainer in Gujarati about the subject, from the sources given. The reader is an ordinary Gujarati reader
who is curious and intelligent; a technical reader must still learn something. Think of the best explainers in serious magazines.

Depth and structure:
- The length follows the subject (decided 29 Oct): 1,200 to 1,800 words of body for a smaller development (a new
  feature, one study's result); up to 3,500 words for a big one (a major model, a space mission, a breakthrough)
  whose sources carry that much: its design, its numbers, its prices. Never pad: no repeating, no filler, every
  paragraph tells the reader something new; when the sources run out, the article ends. Use "## " subheadings (in Gujarati) to divide it, for example: what happened and why it matters;
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

Graphs, tables, diagrams and pictures (readers understand far better with them; use 4 to 8): at least two graphs or tables
whenever the sources have numbers, a "steps" diagram of how it works, and the offered PICTURES that truly show the subject
(up to 4) as "image" figures, spread through the article:
- "bar": a comparison of one measure across items, ONLY with numbers stated in the sources (benchmark scores of this model and
  others, prices per million tokens, sizes). rows: [{"label": "...", "value": 91.2, "mark": true for the subject itself}], "unit".
- "table": specifications side by side: "head": [column names], "cells": [[...row...]] (text, numbers as in the sources).
- "steps": how it works, 3 to 6 steps: "steps": [{"title": "...", "text": "one or two sentences"}].
- "image": one of the numbered PICTURES offered (only if it truly shows the subject): "pick": its number, "title": a Gujarati caption.
- Every figure has a Gujarati "title" and may have a "note" (e.g. "ઊંચું એટલે વધુ સારું", or what the numbers measure) and "source" (the SOURCE number).
- Place each figure in the body as its own paragraph "[[fig N]]" (N counts the figures from 1), right after the paragraph it explains.
- "cover": the number of the PICTURE for the top of the article (every article has one: the one that best shows the subject),
  not one of the "image" figures; "caption": its Gujarati caption.

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
function figuresOf(list: DraftFigure[]): (Figure | null)[] {
  return list.map((g): Figure | null => {
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

/** A picture made the site's: an official one stored in the site's own store, a Commons one shown from Wikimedia's. */
async function keep(sql: Sql, p: Picture, name: string): Promise<(Photo & { credit?: string }) | null> {
  if (p.width && p.height) return { url: p.url, width: p.width, height: p.height, credit: p.credit ?? p.from };
  const s = await storePhoto(sql, p.url, name);
  return s ? { ...s, credit: p.from } : null;
}

/** The draft's figures checked: graphs and tables number by number against the sources, pictures kept. */
async function checkedFigures(sql: Sql, made: (Figure | null)[], pics: Picture[], used: Set<number>, all: string, id: string, date: string, log: (s: string) => void): Promise<(Figure | null)[]> {
  const out: (Figure | null)[] = [];
  for (const g of made) {
    if (g?.kind === "image") {
      const p = pics.find((x) => x.n === g.pick);
      const kept = p && !used.has(p.n) ? await keep(sql, p, `${id}-${p.n}`) : null;
      if (kept && p) { used.add(p.n); g.photo = kept; delete g.pick; out.push(g); } else out.push(null);
    } else if (g && unsourced(figureText([g]), all, date).length) {
      log(`  a ${g.kind} left out: its numbers aren't all in the sources`);
      out.push(null);
    } else out.push(g);
  }
  return out;
}

// ---- more figures (Gemini Flash Lite), when the writer gave too few ----

const ADD = (n: number) => `You add graphs, tables, diagrams and pictures to a long Gujarati explainer from Aavtikal, so that an ordinary reader
understands it more easily. You get its paragraphs, numbered; the figures it already has; its sources; and the PICTURES on offer.
Add up to ${n} new figures, each showing something the existing ones don't:
- "bar": one measure compared across items, ONLY with numbers stated exactly in the sources: "rows": [{"label":"","value":0,"mark":false}], "unit".
- "table": facts side by side, as in the sources: "head": ["",""], "cells": [["",""]].
- "steps": how something in the article works, 3 to 6 steps: "steps": [{"title":"","text":"one or two sentences"}].
- "image": a numbered PICTURE that truly shows something the article explains: "pick": its number.
All words in Gujarati (names of models, companies and products in English letters). Every figure has a Gujarati "title" (for a
picture, its caption) and may have a "note". "after": the number of the paragraph it belongs after (never a "## " heading).
Spread them through the article. Reply with JSON only: {"figures":[{"kind":"bar","after":3,"title":"","note":"","unit":"","rows":[]}]}`;

/** Figures added until the article has enough (at least 3 graphs, tables or diagrams, and 2 pictures when there are
 *  pictures to show): their "[[fig N]]" paragraphs put in the body where they belong. Returns the new body. */
async function moreFigures(sql: Sql, body: string, figs: Figure[], src: Source[], pics: Picture[], used: Set<number>, id: string, date: string, log: (s: string) => void): Promise<string> {
  const data = figs.filter((g) => g.kind !== "image").length, images = figs.length - data;
  const free = pics.filter((p) => !used.has(p.n));
  const want = Math.max(0, 3 - data) + Math.max(0, Math.min(2, free.length) - images);
  if (!want) return body;
  const paras = body.split("\n\n");
  const res = await askGemini(sql, "lite", {
    system: ADD(want + 1),
    user: `PARAGRAPHS:\n${paras.map((p, i) => `${i + 1}. ${p.slice(0, 700)}`).join("\n")}\n\nFIGURES IT HAS:\n${figs.map((g) => `${g.kind}: ${g.title.gu}`).join("\n") || "(none)"}\n\nPICTURES:\n${free.map((p) => `${p.n}. from ${p.from}: ${p.alt || "(no description)"}`).join("\n") || "(none)"}\n\n${block(src)}`,
    maxTokens: 8000,
  }, (v) => { const x = (v as { figures?: (DraftFigure & { after?: unknown })[] })?.figures; return Array.isArray(x) ? x : null; });
  if (!res.ok) { log(`  no more figures (${res.why.slice(0, 100)})`); return body; }
  const all = src.map((s) => s.text).join("\n\n");
  const checked = await checkedFigures(sql, figuresOf(res.value), pics, used, all, id, date, log);
  const inserts: { after: number; n: number }[] = [];
  checked.forEach((g, i) => {
    if (!g) return;
    let after = Math.min(paras.length, Math.max(1, Math.round(Number(res.value[i].after) || paras.length)));
    if (paras[after - 1]?.startsWith("## ") && after < paras.length) after++;
    figs.push(g);
    inserts.push({ after, n: figs.length });
  });
  for (const x of inserts.sort((a, b) => b.after - a.after)) paras.splice(x.after, 0, `[[fig ${x.n}]]`);
  if (inserts.length) log(`  ${inserts.length} figure(s) added`);
  return paras.join("\n\n");
}

// ---- checking (Gemini Flash Lite) ----

const CHECK = `You are the fact-checking desk of Aavtikal, a Gujarati magazine. You get a long Gujarati explainer and its sources.
List the article's specific, checkable claims about its subject (names, numbers, dates, prices, specifications, benchmark results,
quotes, who did what) in English, and say for each whether the sources clearly support it. Numbers must match exactly.
General explanations of well-established concepts (how a GPU works, what an orbit is) are NOT claims to check.
Be strict about the subject's specifics: anything added, exaggerated or guessed is NOT supported.
Reply with JSON only: {"claims":[{"claim":"...","supported":true}]}`;

async function checkArticle(sql: Sql, text: string, src: Source[], date: string): Promise<string[]> {
  const all = src.map((s) => s.text).join("\n\n");
  const problems: string[] = [];
  const wrong = unsourced(text, all, date);
  if (wrong.length) problems.push(`numbers not in any source: ${wrong.slice(0, 8).join(", ")}`);
  const stray = text.match(/[ऀ-ॿঀ-੿଀-෿]+/g);
  if (stray) problems.push(`letters from another script: ${[...new Set(stray)].slice(0, 3).join(", ")}`);
  // Gemini Flash Lite: an article and its sources are more than a Gemma's 16,000 tokens a minute; a Gemma if it can't
  const ask = { system: CHECK, user: `ARTICLE:\n${text}\n\n===\n\n${block(src)}`, role: "checker" as const, maxTokens: 8000 };
  const claims = (v: unknown) => { const c = (v as { claims?: { claim?: string; supported?: boolean }[] })?.claims; return Array.isArray(c) && c.length ? c : null; };
  const res = await askGemini(sql, "lite", ask, claims).then((r) => (r.ok ? r : askJson(sql, ask, claims)));
  if (!res.ok) problems.push(`the claim check didn't answer (${res.why.slice(0, 120)})`);
  else for (const c of res.value.filter((c) => c.supported !== true)) problems.push(`not in the sources: ${String(c.claim ?? "").slice(0, 160)}`);
  return problems;
}

// ---- translating (Gemini Flash Lite), graphs included ----

const LANG = (lang: "en" | "hi") => lang === "en"
  ? "English, in the clear, precise style of a serious science and technology magazine"
  : "Hindi (Devanagari), in the clear, precise style of a serious Hindi science and technology magazine";
const TRANSLATE = (lang: "en" | "hi") => `You translate part of a long Gujarati explainer from Aavtikal into ${LANG(lang)}.
You get its paragraphs as a list. Translate each one faithfully and completely, in the same order, one for one: every fact,
name and number exactly as the Gujarati has it (numbers in ordinary digits 0-9; a "## " subheading stays a "## " subheading).
Technical terms as a careful ${lang === "en" ? "English" : "Hindi"} writer would use them; names of models, companies and
products as they are. Add nothing, leave nothing out, never join or split paragraphs.
Reply with JSON only: {"paragraphs":["",""]} with exactly as many paragraphs as you got.`;
const HEAD = (lang: "en" | "hi") => `Translate a Gujarati magazine article's headline, sub-heading and photo caption into ${LANG(lang)}:
faithfully, numbers and names exactly as they are (numbers in ordinary digits 0-9). Reply with JSON only: {"headline":"","dek":"","caption":""}`;

/** Every text in the figures, in order (and back again). */
function figureStrings(figs: Figure[]): L3[] {
  return figs.flatMap((g) => [g.title, ...(g.note ? [g.note] : []), ...(g.rows ?? []).map((r) => r.label), ...(g.head ?? []), ...(g.cells ?? []).flat(),
    ...(g.steps ?? []).flatMap((s) => [s.title, s.text])]);
}

interface Words3 { headline: string; dek: string; caption: string; body: string }

const LABELS = (lang: "en" | "hi") => `Translate each Gujarati label of a graph or table into ${lang === "en" ? "English" : "Hindi (Devanagari)"}: the same
number of them, in the same order, numbers exactly as they are (in ordinary digits 0-9), names of models, companies and products
as they are. Reply with JSON only: {"strings":[]}`;

/** The article in English or Hindi, graphs included, in pieces (29 Oct: a whole 2,000-word article with its figure
 *  markers in one request was rejected for one slip, and most articles stayed in Gujarati): the headline, then the body
 *  a few paragraphs at a time, the "[[fig N]]" markers kept out of it and put back where they were, then the graphs'
 *  labels. Every number checked; a piece that fails is asked again; a label left untranslated shows in Gujarati. */
/** Text in the language's own script with no Gujarati (or other Indian script) left in it (29 Oct: a model that handed
 *  the Gujarati back unchanged was taken for English, since anything passed as English, and the English pages showed Gujarati). */
export const inScript = (lang: "en" | "hi", t: string) =>
  !/[\u0980-\u0DFF]/.test(t) && (lang === "en" ? /[A-Za-z]/.test(t) && !/[ऀ-ॿ]/.test(t) : /[ऀ-ॿ]/.test(t));
/** A stored translation that really is one. */
const translated = (lang: "en" | "hi", w: Words3 | null | undefined) => !!w?.headline && !!w.body && inScript(lang, `${w.headline} ${w.dek} ${w.body}`);
/** The same test in SQL, for finding the articles whose translation is missing or isn't one. */
const UNTRANSLATED = (c: "en" | "hi") =>
  `(${c} is null or jsonb_typeof(${c}) <> 'object' or coalesce(${c}->>'headline', '') = '' or coalesce(${c}->>'body', '') = ''
    or concat_ws(' ', ${c}->>'headline', ${c}->>'dek', ${c}->>'body') ~ '[\u0980-\u0DFF]'${c === "hi" ? ` or (${c}->>'headline') !~ '[\u0900-\u097F]'` : ""})`;

async function translate(sql: Sql, gu: Words3, figs: Figure[], lang: "en" | "hi", date: string, log: (s: string) => void = () => {}): Promise<Words3 | null> {
  const name = lang === "en" ? "English" : "Hindi";
  const script = (t: string) => inScript(lang, t);
  // Gemini Flash Lite; a Gemma when its requests are used up (a piece is small enough for its minute)
  const ask = <T,>(a: { system: string; user: string; maxTokens: number }, check: (v: unknown) => T | null) =>
    askGemini(sql, "lite", a, check).then((r) => (r.ok || !r.stop ? r : askJson(sql, a, check)));

  // the headline, sub-heading and caption
  let head: { headline: string; dek: string; caption: string } | null = null;
  for (let k = 0; k < 2 && !head; k++) {
    const r = await ask({ system: HEAD(lang), user: JSON.stringify({ headline: gu.headline, dek: gu.dek, caption: gu.caption }), maxTokens: 2000 }, (v) => {
      const x = v as { headline?: string; dek?: string; caption?: string };
      return x?.headline && script(`${x.headline} ${x.dek ?? ""}`) && (!x.caption || script(x.caption)) ? { headline: String(x.headline), dek: String(x.dek ?? ""), caption: String(x.caption ?? "") } : null;
    });
    if (r.ok && !numbersNotIn(Object.values(r.value).join("\n"), [gu.headline, gu.dek, gu.caption].join("\n"), date).length) head = r.value;
    else if (!r.ok) log(`  ${name} headline not made: ${r.why.slice(0, 140)}`);
  }
  if (!head) return null;

  // the body: its text paragraphs in pieces of about 400 words, the figure markers left where they are
  const paras = gu.body.split("\n\n");
  const text = paras.map((p, i) => ({ p, i })).filter((x) => !/^\[\[fig \d+\]\]$/.test(x.p.trim()));
  const pieces: { p: string; i: number }[][] = [];
  for (const x of text) {
    const last = pieces.at(-1);
    if (last && last.reduce((n, y) => n + words(y.p), 0) + words(x.p) <= 400) last.push(x); else pieces.push([x]);
  }
  const out = [...paras];
  for (const [n, piece] of pieces.entries()) {
    const src = piece.map((x) => x.p);
    let done: string[] | null = null;
    let note = "";
    for (let k = 0; k < 3 && !done; k++) {
      const r = await ask({ system: TRANSLATE(lang), user: JSON.stringify({ paragraphs: src }) + note, maxTokens: 8000 }, (v) => {
        const x = (v as { paragraphs?: unknown[] })?.paragraphs;
        if (!Array.isArray(x) || x.length !== src.length) return null;
        const t = x.map((y) => String(y ?? "").trim());
        return t.every((y, m) => y && words(y) >= words(src[m]) * 0.5 && script(y)) ? t : null;
      });
      if (!r.ok) { log(`  ${name} piece ${n + 1} of ${pieces.length}: ${r.why.slice(0, 140)}`); if (r.stop) return null; continue; }
      const wrong = numbersNotIn(r.value.join("\n"), src.join("\n"), date);
      if (!wrong.length) done = r.value;
      else note = `\n\nYour last translation had numbers that are not in the Gujarati: ${wrong.join(", ")}. Translate again and keep every number exactly.`;
    }
    if (!done) { log(`  ${name} not made: piece ${n + 1} of ${pieces.length} failed three times`); return null; }
    piece.forEach((x, m) => { out[x.i] = done![m]; });
  }

  // the graphs' labels, on their own
  const labels = figureStrings(figs);
  if (labels.length) {
    let strings: string[] | null = null;
    for (let k = 0; k < 2 && !strings; k++) {
      const r = await ask({ system: LABELS(lang), user: JSON.stringify({ strings: labels.map((l) => l.gu) }), maxTokens: 8000 }, (v) => {
        const x = (v as { strings?: unknown[] })?.strings;
        return Array.isArray(x) && x.length === labels.length ? x.map(String) : null;
      });
      if (r.ok && !numbersNotIn(r.value.join("\n"), labels.map((l) => l.gu).join("\n"), date).length) strings = r.value;
    }
    if (strings) strings.forEach((x, m) => { labels[m][lang] = x; });
    else log(`  ${name}: the graphs' labels stay in Gujarati`);
  }
  return { ...head, body: out.join("\n\n") };
}

// ---- one article ----

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60).replace(/-$/, "") || "article";

/** Which beat needs an article most: the day's target shared about 4 : 3 : 3 between AI, Tech and Science. */
async function beatToday(sql: Sql, date: string, target: number): Promise<Beat | null> {
  const rows = await sql.query(
    `select beat, count(*)::int as n from features where author = 'desk' and status = 'published'
       and (created_at at time zone 'Asia/Kolkata')::date = $1::date group by beat`, [date]);
  const have = Object.fromEntries(rows.map((r) => [r.beat, r.n as number])) as Record<string, number>;
  const done = Object.values(have).reduce((a, b) => a + b, 0);
  if (done >= target) return null;
  const share: Record<Beat, number> = { ai: 0.4, tech: 0.3, science: 0.3 };
  return [...WEBSITE.deskBeats].sort((a, b) => ((have[a] ?? 0) - share[a] * target) - ((have[b] ?? 0) - share[b] * target))[0];
}

type Outcome = "published" | "held" | "skipped" | "done" | "stop";

const stateList = async (sql: Sql, key: string) =>
  String((await sql.query(`select value from state where key = $1`, [key]))[0]?.value ?? "").split("\n").filter(Boolean);
const addToList = (sql: Sql, key: string, item: string) => sql.query(
  `insert into state (key, value) values ($1, $2) on conflict (key) do update set value = (
     select string_agg(t, E'\n') from (select unnest(string_to_array($2 || E'\n' || state.value, E'\n')) as t limit 60) x)`, [key, item]);

/** The proper names and numbers in a subject's line ("Gemini", "4", "Carbon"): two subjects sharing two are compared. */
const nameWords = (t: string) => new Set((t.match(/[A-Za-z0-9][\w.+-]*/g) ?? [])
  .filter((w) => /[A-Z0-9]/.test(w) && !/^(The|A|An|In|On|Of|And|For|With|New|How|Why|What|Its|Is|To|AI)$/.test(w)));
/** names too common to tell two subjects apart */
const COMMON = new Set(["Google", "OpenAI", "Microsoft", "Amazon", "Apple", "Meta", "NVIDIA", "Nvidia", "NASA", "ISRO", "India", "Indian", "China",
  "Chinese", "American", "Gemini", "ChatGPT", "Model", "Models", "Space", "Science", "Research", "Launch", "Launches", "Explained", "Inside", "Future"]);
const SAME = `Is the NEW subject the same as one of the EARLIER ones: the same product, model, mission, study or discovery, even if worded
differently? A different version, a different product or a different event is NOT the same.
Reply with JSON only: {"same": N} with the EARLIER number, or {"same": 0}.`;

/** The earlier subject this one repeats, if any (29 Oct: "Gemini 4 Carbon" was written twice, worded differently). */
async function alreadyCovered(sql: Sql, topic: string, covered: string[]): Promise<string | null> {
  const mine = nameWords(topic);
  // two shared names, or one that names a particular thing ("GLM-5.3", "XREAL": 29 Oct, GLM-5.3 was written twice)
  const particular = (w: string) => /\d/.test(w) && /[A-Za-z]/.test(w) || /^[A-Z]{3,}$/.test(w) && !COMMON.has(w) || w.length >= 6 && !COMMON.has(w);
  const near = covered.filter((c) => { const shared = [...mine].filter((w) => nameWords(c).has(w)); return shared.length >= 2 || shared.some(particular); }).slice(0, 8);
  if (!near.length) return null;
  const res = await askJson(sql, { system: SAME, user: `NEW: ${topic}\n\nEARLIER:\n${near.map((c, i) => `${i + 1}. ${c}`).join("\n")}`, maxTokens: 60 },
    (v) => { const x = v as { same?: unknown }; return typeof x?.same === "number" ? x.same : null; });
  return res.ok && res.value >= 1 && res.value <= near.length ? near[res.value - 1] : null;
}

interface Subject { beat: Beat; topic: string; wiki: string[]; leads: Lead[] }
interface Made { gu: Words3; photo: Photo & { credit?: string }; figs: Figure[]; en: Words3 | null; hi: Words3 | null; problems: string[]; sources: Source[]; model: string; words: number }

/** One article on a subject: read, written, given its pictures and figures, checked, translated. A string when it
 *  couldn't be: "thin" (too little to read), "nophoto" (no picture to show: every article has one, the user, 29 Oct),
 *  "skipped" (not written), "stop" (no writing requests left today). */
async function make(sql: Sql, subj: Subject, id: string, date: string, log: (s: string) => void, note = ""): Promise<Made | "thin" | "nophoto" | "skipped" | "busy" | "stop"> {
  // the sources and their pictures
  const { sources, pics } = await research(subj.leads, subj.wiki);
  if (sources.reduce((n, s) => n + words(s.text), 0) < 500) { log("  too little to read about it"); return "thin"; }
  if (!pics.length) { log("  no picture to show with it"); return "nophoto"; }

  // the Gujarati article (Gemini Flash); asked once more when the answer comes back broken (29 Oct: "not JSON")
  const writeAsk = {
    system: WRITE,
    user: `SUBJECT (${subj.beat}): ${subj.topic}${note}\n\nPICTURES:\n${pics.map((p) => `${p.n}. from ${p.from}: ${p.alt || "(no description)"}`).join("\n")}\n\n${block(sources)}`,
  };
  let draft = await askGemini(sql, "writer", writeAsk, readDraft);
  if (!draft.ok && !draft.stop && !draft.busy) { log(`  written again: ${draft.why.slice(0, 120)}`); draft = await askGemini(sql, "writer", writeAsk, readDraft); }
  if (!draft.ok) { log(`  not written: ${draft.why.slice(0, 200)}`); return draft.stop ? "stop" : draft.busy ? "busy" : "skipped"; }
  const d = draft.value;

  // the picture at the top: the writer's choice, else the first that can be shown
  let photo: (Photo & { credit?: string }) | null = null;
  const used = new Set<number>();
  for (const p of [...pics.filter((x) => x.n === d.cover), ...pics.filter((x) => x.n !== d.cover)]) {
    if (d.figures.some((g) => g.kind === "image" && Number(g.pick) === p.n) && p.n !== d.cover && pics.length > 1) continue;
    photo = await keep(sql, p, `${id}-cover`);
    if (photo) { used.add(p.n); break; }
  }
  if (!photo) { log("  no picture could be kept"); return "nophoto"; }
  const caption = d.caption || d.headline;

  // the figures: graphs and tables checked number by number, pictures kept; the body's markers numbered again
  const all = sources.map((s) => s.text).join("\n\n");
  const checked = await checkedFigures(sql, figuresOf(d.figures), pics, used, all, id, date, log);
  const figs: Figure[] = [];
  const renumber = new Map<number, number>();
  checked.forEach((g, i) => { if (g) { figs.push(g); renumber.set(i + 1, figs.length); } });
  let body = d.body.split("\n\n").map((p) => {
    const m = p.trim().match(/^\[\[fig (\d+)\]\]$/);
    if (!m) return p;
    const n = renumber.get(Number(m[1]));
    return n ? `[[fig ${n}]]` : null;
  }).filter((p): p is string => p !== null).join("\n\n");
  // a figure the writer made but didn't place goes at the end of its section
  figs.forEach((_, i) => { if (!body.includes(`[[fig ${i + 1}]]`)) body += `\n\n[[fig ${i + 1}]]`; });
  body = await moreFigures(sql, body, figs, sources, pics, used, id, date, log);

  // the check, then English and Hindi
  const gu = { headline: d.headline, dek: d.dek, caption, body };
  const problems = await checkArticle(sql, [d.headline, d.dek, body, figureText(figs)].join("\n\n"), sources, date);
  const en = await translate(sql, gu, figs, "en", date, log);
  const hi = await translate(sql, gu, figs, "hi", date, log);
  return { gu, photo, figs, en, hi, problems, sources, model: draft.model, words: words(body) };
}

const sourcesJson = (src: Source[]) => JSON.stringify(src.map((s) => ({ name: s.name, url: s.url, trust: s.official ? "official" : "outlet" })));
const madeLine = (m: Made) => `${m.words} words, ${m.figs.length} figure(s) (${m.figs.filter((g) => g.kind === "image").length} pictures), a photo${m.en ? ", English" : ""}${m.hi ? ", Hindi" : ""}`;

const LASTING = (beat: Beat) => `You are the editor of Aavtikal, a Gujarati magazine of deep explainers. Today's news gave no subject for its
${beat.toUpperCase()} section (${BEAT_WORDS[beat]}), so choose ONE lasting explainer subject Indian readers would value: an important
technology, scientific idea, machine, mission, discovery or famous model, one with a solid English Wikipedia article full of facts and
numbers. Never politics, a company's business, or a subject already covered (listed under COVERED).
Give the subject in one English line and the exact titles of 1 or 2 English Wikipedia articles on it.
Reply with JSON only: {"topic":"","wiki":[""]}`;

/** Today's news subject for a beat: nothing already written about (its pages not read again, its subject not repeated). */
async function newsSubject(sql: Sql, beat: Beat, covered: string[], log: (s: string) => void): Promise<Subject | "stop" | null> {
  const usedUrls = new Set((await sql.query(
    `select jsonb_array_elements(sources)->>'url' as u from features where created_at > now() - interval '30 days' and status <> 'withdrawn'`)).map((r) => r.u as string));
  const list = (await leads(sql, beat)).filter((l) => !usedUrls.has(l.url)).map((l, i) => ({ ...l, n: i + 1 }));
  const pick = await askJson(sql, {
    system: PICK(beat),
    user: `ITEMS:\n${list.map((l) => `${l.n}. [${l.from}${l.official ? ", official" : ""}, ${l.at.slice(0, 10)}] ${l.title} -- ${l.summary}`).join("\n")}\n\nCOVERED:\n${covered.join("\n") || "(nothing yet)"}`,
    maxTokens: 600,
  }, (v) => {
    const x = v as { pick?: unknown[]; topic?: string; wiki?: unknown };
    const wiki = (Array.isArray(x?.wiki) ? x.wiki : [x?.wiki]).map((w) => String(w ?? "").trim()).filter(Boolean).slice(0, 3);
    return Array.isArray(x?.pick) ? { pick: x.pick.map(Number).filter((n) => n >= 1 && n <= list.length), topic: String(x.topic ?? ""), wiki } : null;
  });
  if (!pick.ok) { log(`${beat}: no subject picked (${pick.why.slice(0, 120)})`); return pick.stop ? "stop" : null; }
  if (!pick.value.pick.length || !pick.value.topic) { log(`${beat}: nothing in today's news deserves an explainer`); return null; }
  const topic = pick.value.topic.slice(0, 200);
  log(`${beat}: ${topic}`);
  const twin = await alreadyCovered(sql, topic, covered);
  if (twin) { log(`  already written: ${twin}`); await addToList(sql, "desk_skipped", topic); return null; }
  return { beat, topic, wiki: pick.value.wiki, leads: pick.value.pick.map((n) => list[n - 1]) };
}

/** A lasting subject from Wikipedia, when the news gave none (the user, 29 Oct: ten new articles every day, without fail). */
async function lastingSubject(sql: Sql, beat: Beat, covered: string[], log: (s: string) => void): Promise<Subject | "stop" | null> {
  const res = await askJson(sql, { system: LASTING(beat), user: `COVERED:\n${covered.join("\n") || "(nothing yet)"}`, maxTokens: 300 }, (v) => {
    const x = v as { topic?: string; wiki?: unknown[] };
    const wiki = (Array.isArray(x?.wiki) ? x.wiki : []).map((w) => String(w ?? "").trim()).filter(Boolean).slice(0, 2);
    return x?.topic && wiki.length ? { topic: String(x.topic).slice(0, 200), wiki } : null;
  });
  if (!res.ok) { log(`${beat}: no lasting subject (${res.why.slice(0, 120)})`); return res.stop ? "stop" : null; }
  log(`${beat} (a lasting subject): ${res.value.topic}`);
  const twin = await alreadyCovered(sql, res.value.topic, covered);
  if (twin) { log(`  already written: ${twin}`); await addToList(sql, "desk_skipped", res.value.topic); return null; }
  return { beat, topic: res.value.topic, wiki: res.value.wiki, leads: [] };
}

/** An article written on a subject and put in: published when it checks out, else held for the editor. */
async function writeUp(sql: Sql, subj: Subject, date: string, log: (s: string) => void): Promise<Outcome | "busy"> {
  let id = slug(subj.topic);
  if ((await sql.query(`select 1 from features where id = $1`, [id])).length) id = `${id}-${date.slice(5).replace("-", "")}`;
  const m = await make(sql, subj, id, date, log);
  if (m === "stop") return "stop";
  if (m === "busy") return "busy";
  if (typeof m === "string") { if (m === "thin" || m === "nophoto") await addToList(sql, "desk_skipped", subj.topic); return "skipped"; }
  const status = m.problems.length ? "held" : "published";
  await sql.query(
    `insert into features (id, beat, status, headline, dek, body, caption, photo, author, en, hi, sources, checks, figures, topic, published_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'desk', $9, $10, $11, $12, $13, $14, case when $3 = 'published' then now() end, now())`,
    [id, subj.beat, status, m.gu.headline, m.gu.dek, m.gu.body, m.gu.caption, JSON.stringify(m.photo),
     m.en ? JSON.stringify(m.en) : null, m.hi ? JSON.stringify(m.hi) : null, sourcesJson(m.sources),
     JSON.stringify({ problems: m.problems, writer: m.model, words: m.words }), JSON.stringify(m.figs), subj.topic]);
  await touched(sql);
  await refresh();
  log(`  ${status}: ${id} (${madeLine(m)})${m.problems.length ? `: ${m.problems.slice(0, 2).join("; ")}` : ""}`);
  return status;
}

/** How many of today's articles are still to be published (held ones don't count: the day's ten go up, 29 Oct). */
async function stillToday(sql: Sql, date: string): Promise<number> {
  const [r] = await sql.query(`select count(*)::int as n from features where author = 'desk' and status = 'published'
    and (created_at at time zone 'Asia/Kolkata')::date = $1::date`, [date]);
  return Math.max(0, (WEBSITE.deskDays[date] ?? WEBSITE.deskDaily) - (r.n as number));
}

/** One of today's articles: from the news if it has a subject worth it, else a lasting subject. */
async function oneArticle(sql: Sql, log: (s: string) => void): Promise<Outcome> {
  const date = indiaDate();
  const target = WEBSITE.deskDays[date] ?? WEBSITE.deskDaily;
  const beat = await beatToday(sql, date, target);
  if (!beat) { log(`today's ${target} articles are done`); return "done"; }
  if (!(await geminiLeft(sql, "writer"))) { log("Gemini Flash's free requests for today are used up"); return "stop"; }
  const covered = [
    ...(await sql.query(`select coalesce(topic, headline) as t from features where created_at > now() - interval '60 days' and status <> 'withdrawn' order by created_at desc limit 120`)).map((r) => r.t as string),
    ...(await stateList(sql, "desk_skipped")),
  ];
  const news = await newsSubject(sql, beat, covered, log);
  if (news === "stop") return "stop";
  const r = news ? await writeUp(sql, news, date, log) : "skipped";
  // Google too busy to write: the same subject later, not another one now (29 Oct: a busy spell sent the desk to a lasting subject)
  if (r === "busy") return "skipped";
  if (r !== "skipped") return r;
  const lasting = await lastingSubject(sql, beat, covered, log);
  if (lasting === "stop") return "stop";
  const l = lasting ? await writeUp(sql, lasting, date, log) : "skipped";
  return l === "busy" ? "skipped" : l;
}

// ---- the older articles written again to today's standard (the user, 29 Oct) ----

/** the older articles tried (a third list from 29 Oct: the first fell to Google's busy hour and a too-strict check, the
 *  second lost tries to a writer Google no longer serves) */
const REDONE = "desk_redone_3";
const WIKI = `Give the exact titles of the English Wikipedia articles for this subject (for background facts and free photos): the 1 or 2
that cover it best, then 1 or 2 broader ones with good photos (the place, the machine, the technology, the organisation).
Reply with JSON only: {"titles":["",""]}`;
const REDO = `

(This replaces an older, shorter article on the same subject. If the subject is not a fresh development, write it as a lasting
explainer: what it is, how it works, its history and numbers, where it stands now, as the sources have them.)`;

/** One published article from before the desk's standard (no photo, few figures, or written before the desk) written
 *  again. Politics is never touched. It replaces the old one only when every number and claim checks out; each is
 *  tried once. */
async function redoOne(sql: Sql, log: (s: string) => void): Promise<"none" | "rewritten" | "kept" | "stop"> {
  // each older article is tried up to three times (29 Oct: one try lost Chandrayaan to a stray Telugu word)
  const counts = new Map<string, number>();
  for (const id of await stateList(sql, REDONE)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const tried = [...counts].filter(([, n]) => n >= 3).map(([id]) => id);
  const [r] = await sql.query(
    `select id, beat, headline, topic, en, sources from features where status = 'published' and beat <> 'politics'
       and (author <> 'desk' or photo is null or jsonb_array_length(figures) < 4) and coalesce(checks->>'rewritten', '') <> 'true'
       and not (id = any($1::text[]))
     order by published_at desc nulls last limit 1`, [tried]);
  if (!r) return "none";
  if (!(await geminiLeft(sql, "writer"))) return "stop";
  const topic = String(r.topic ?? (r.en as { headline?: string } | null)?.headline ?? r.headline).slice(0, 200);
  log(`again: ${r.id} (${topic})`);
  const wiki = await askJson(sql, { system: WIKI, user: `${topic}\n${r.headline}`, maxTokens: 200 },
    (v) => { const t = (v as { titles?: unknown[] })?.titles; return Array.isArray(t) ? t.map(String).filter(Boolean).slice(0, 4) : null; });
  const leads: Lead[] = ((r.sources ?? []) as { name?: string; url?: string; trust?: string }[]).filter((s) => s.url && !/wikipedia\.org/.test(s.url))
    .slice(0, 4).map((s, i) => ({ n: i + 1, title: topic, url: s.url!, summary: "", from: s.name ?? hostOf(s.url!), official: s.trust === "official", at: "" }));
  const m = await make(sql, { beat: r.beat as Beat, topic, wiki: wiki.ok ? wiki.value : [], leads }, r.id, indiaDate(), log, REDO);
  if (m === "stop") return "stop";
  // Google too busy: tried again later, not counted as tried
  if (m === "busy") { log("  kept for now: Gemini is busy, tried again later"); return "kept"; }
  await addToList(sql, REDONE, r.id);
  if (typeof m === "string") { log(`  kept as it was (${m})`); return "kept"; }
  if (m.problems.length) { log(`  kept as it was: ${m.problems.slice(0, 2).join("; ")}`); return "kept"; }
  await sql.query(
    `update features set headline = $2, dek = $3, body = $4, caption = $5, photo = $6, en = $7, hi = $8, sources = $9, checks = $10,
       figures = $11, topic = $12, updated_at = now() where id = $1`,
    [r.id, m.gu.headline, m.gu.dek, m.gu.body, m.gu.caption, JSON.stringify(m.photo), m.en ? JSON.stringify(m.en) : null, m.hi ? JSON.stringify(m.hi) : null,
     sourcesJson(m.sources), JSON.stringify({ problems: [], writer: m.model, words: m.words, rewritten: true }), JSON.stringify(m.figs), topic]);
  await touched(sql);
  await refresh();
  log(`  rewritten: ${r.id} (${madeLine(m)})`);
  return "rewritten";
}

/** The site's kept-ready pages renewed now (29 Oct: translations sat in the database for an hour while the pages showed
 *  Gujarati, since only a publish asked for new pages); the site renews only when something changed. */
const refresh = () => fetch(`${WEBSITE.url}/api/refresh`, { method: "POST", signal: AbortSignal.timeout(30_000) }).catch(() => null);

/** Articles without a real English or Hindi (a translation that failed, or one that was the Gujarati handed back) get one. */
async function retranslate(sql: Sql, log: (s: string) => void, deadline: number) {
  const rows = await sql.query(
    `select id, headline, dek, caption, body, figures, en, hi from features where status in ('published', 'held')
       and (${UNTRANSLATED("en")} or ${UNTRANSLATED("hi")}) order by status = 'published' desc, updated_at asc limit 6`);
  for (const r of rows) {
    if (Date.now() > deadline - 3 * 60_000) return;
    const figs = (r.figures ?? []) as Figure[];
    const gu = { headline: r.headline, dek: r.dek, caption: r.caption, body: r.body };
    log(`  translating again: ${r.id}`);
    const en = translated("en", r.en) ? r.en : await translate(sql, gu, figs, "en", indiaDate(), log);
    const hi = translated("hi", r.hi) ? r.hi : await translate(sql, gu, figs, "hi", indiaDate(), log);
    await sql.query(`update features set en = $2, hi = $3, figures = $4, updated_at = now() where id = $1`,
      [r.id, en ? JSON.stringify(en) : null, hi ? JSON.stringify(hi) : null, JSON.stringify(figs)]);
    log(`  ${r.id}: translated again${en ? " (English)" : ""}${hi ? " (Hindi)" : ""}`);
    if (en || hi) { await touched(sql); await refresh(); }
  }
}

// ---- run: the older articles written again, then new ones, as long as the time allows ----

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = Date.now();
  const deadline = started + Math.max(60, Number(process.argv[2] ?? 900)) * 1000;
  if (!process.env.DATABASE_URL) { console.log("no DATABASE_URL"); process.exit(0); }
  const sql = neon(process.env.DATABASE_URL);
  // what the desk is doing, kept in its run as it goes, for the editor's page (29 Oct: a job's log can't be read while it runs)
  const lines: string[] = [];
  let runId: number | null = null;
  const log = (s: string) => {
    console.log(s);
    // India's time, as the editor reads it
    lines.push(`${new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(11, 16)} ${s}`.slice(0, 300));
    if (runId != null) sql.query(`update runs set details = coalesce(details, '{}'::jsonb) || jsonb_build_object('log', $2::jsonb) where id = $1`, [runId, JSON.stringify(lines.slice(-30))]).catch(() => null);
  };
  await ensureSchema(sql);
  const [paused] = await sql.query(`select value from state where key = 'engine_paused'`);
  if (paused?.value === "yes") { log("the engine is stopped by the editor"); process.exit(0); }
  // once: the second "Gemini 4 Carbon" of 29 Oct taken off (the subject written twice, worded differently)
  if (!(await sql.query(`select 1 from state where key = 'desk_dup_1'`)).length) {
    await sql.query(`update features set status = 'withdrawn', updated_at = now() where id = 'google-launches-gemini-4-carbon-with-significant-advancement' and author = 'desk'`);
    await sql.query(`insert into state (key, value) values ('desk_dup_1', 'done') on conflict (key) do nothing`);
    await touched(sql);
  }
  const [run] = await sql.query(`insert into runs (kind) values ('desk') returning id`);
  runId = run.id as number;
  const details: Record<string, number> = { published: 0, held: 0, skipped: 0, rewritten: 0, kept: 0 };
  try {
    // the missing English and Hindi first (29 Oct: left to the end of a round, they waited for hours)
    await retranslate(sql, log, Math.min(deadline, Date.now() + Math.min(15 * 60_000, (deadline - started) / 3)));
    let newDone = false, oldDone = false;
    // an article takes up to ten minutes (written, its figures, checked, translated in pieces): none begun in its last 15
    // (a third of a short round), so the round isn't cut off with an article half done (29 Oct)
    const margin = Math.min(15 * 60_000, (deadline - started) * 0.35);
    while (deadline - Date.now() > margin && !(newDone && oldDone)) {
      // the older articles first (the user, 29 Oct: "trigger rewriting now"), then the day's new ones
      // a rewrite only with writing requests to spare beyond today's articles (and a few for failed tries)
      if (!oldDone && (await geminiRemaining(sql, "writer")) <= (await stillToday(sql, indiaDate())) + 4) oldDone = true;
      if (!oldDone) {
        const r = await redoOne(sql, log);
        if (r === "stop") break;
        if (r === "none") oldDone = true;
        else { details[r]++; continue; }
      }
      if (!newDone && deadline - Date.now() > margin) {
        const r = await oneArticle(sql, log);
        if (r === "stop") break;
        if (r === "done") newDone = true;
        else if (++details[r] >= 4 && r === "skipped") newDone = true;
      }
    }
    // nothing more to do for now (the day's articles made, or Flash's requests used up): the job rests a while
    if (newDone && oldDone || !(await geminiLeft(sql, "writer"))) process.exitCode = 3;
    await retranslate(sql, log, deadline);
    await sql.query(`update runs set finished_at = now(), ok = true, details = $2 where id = $1`, [run.id, JSON.stringify({ ...details, log: lines.slice(-30) })]);
  } catch (e) {
    log(`failed: ${e instanceof Error ? e.stack : e}`);
    await sql.query(`update runs set finished_at = now(), ok = false, details = $2 where id = $1`, [run.id, JSON.stringify({ ...details, error: String(e).slice(0, 400), log: lines.slice(-30) })]);
  }
  await refresh();
}
