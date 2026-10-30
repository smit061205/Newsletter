// Release gates for what a reader sees, measured on the finished issue -- the
// typographic standard of the 8 August paper, not just "nothing overflows":
//
//   S1 body spacing  -- the extra space justification put between words
//                       (word + letter spacing, in em): even across the page,
//                       holes rare. The loosest lines are listed for the editor.
//   S2 display fill  -- every headline, kicker and deck line fills its width.
//   S4 column ends   -- a story's columns end within one line of each other.
//   S6 digits        -- numbers in the paper's own digits (English ones aside).
//   S8 repetition    -- no story says the same thing twice (editorial/quality.ts).
//   S9 loose story   -- no single story set loosely (S1 is the page's average:
//                       a narrow story full of long words hid in it).
// (S3, white space, is gate 2: layout/occupancy.ts.)
import type { Element, IssueRender, TextElement } from "@ck/shared/contract";
import type { PagePlan } from "./pack.ts";
import { normalizeText } from "./text.ts";
import { BODY, GRID, PT } from "./typography.ts";
import { profile } from "../profile.ts";
import { repeats } from "../editorial/quality.ts";
import { alwaysPrinted, wordForWord } from "../store.ts";

// Hindi and Urdu lines justify in their word spaces alone (never letter-
// spaced: layout/measure.ts), so their papers set looser word spacing: their
// own limits, as such papers print; Gujarati and English keep the strict ones
const WORD_SPACED = ["hi", "ur"].includes(profile.language.lang);
/** Body lines whose extra word space (em) is past this count as loose. */
const LOOSE_EM = WORD_SPACED ? 0.9 : 0.6;
/** At most this share of body lines may be loose ... */
const LOOSE_SHARE = WORD_SPACED ? 0.06 : 0.03;
/** ... and 95% of lines must stay under this. */
const P95_EM = WORD_SPACED ? 0.85 : 0.5;
/** Every display line must fill at least this share of its width. */
const FILL = 0.97;
/** No story's loosest tenth of lines past this (em). */
export const STORY_P90_EM = LOOSE_EM;

/** A story's spacing: its loosest tenth of justified body lines (em of extra space). */
export function storyLooseness(elements: Element[]): number {
  const ems = elements.filter((e): e is TextElement => e.kind === "text" && isBodyLine(e) && e.align === "justify-all")
    .map((e) => ((e.wordSpacing ?? 0) + (e.letterSpacing ?? 0)) / e.size).sort((a, b) => a - b);
  return ems.length ? ems[Math.floor(0.9 * (ems.length - 1))] : 0;
}
/** Fillers (house ad, messages) may cover at most this share of a page's story area. */
const FILLER_SHARE = 0.12;

const isBodyLine = (e: TextElement) => /-c\d+l\d+$/.test(e.id);
const textOf = (e: TextElement) => (typeof e.text === "string" ? e.text : e.text.map((r) => r.text).join(""));

export function styleChecks(issue: IssueRender, plans: PagePlan[], bands: { top: number; bottom: number }[]) {
  const extra: { em: number; page: number; id: string; text: string; story: string }[] = [];
  const columns = new Map<string, number[]>(); // story|column -> bottoms of its lines
  const latinDigits: string[] = [];
  for (const page of issue.pages) {
    for (const e of page.elements) {
      if (e.kind !== "text" || !e.articleId || e.articleId.startsWith("ad-")) continue;
      const plain = e.plainText ?? textOf(e);
      // a number left in Latin digits that the paper prints in its own
      const digits = (t: string) => t.replace(/[^0-9૦-૯۰-۹]/g, "");
      // (a number at either end of a line is read with its neighbour on the
      // next or last line -- "ACE" / "2032" -- which this one line can't see)
      const inner = plain.replace(/^[\d.,:/-]+\s*/, "").replace(/\s*[\d.,:/-]+$/, "");
      if (/[0-9]/.test(inner) && digits(normalizeText(inner)) !== digits(inner)) latinDigits.push(`p${page.number} ${e.id}`);
      if (!isBodyLine(e)) continue;
      const col = e.id.replace(/l\d+$/, "");
      columns.set(col, [...(columns.get(col) ?? []), e.y + e.height]);
      if (e.align === "justify-all") {
        extra.push({ em: ((e.wordSpacing ?? 0) + (e.letterSpacing ?? 0)) / e.size, page: page.number, id: e.id, text: plain,
                     story: e.id.replace(/-c\d+l\d+$/, "") });
      }
    }
  }
  const ems = extra.map((x) => x.em).sort((a, b) => a - b);
  const q = (p: number) => (ems.length ? ems[Math.min(ems.length - 1, Math.floor(p * (ems.length - 1)))] : 0);
  const loose = extra.filter((x) => x.em > LOOSE_EM).sort((a, b) => b.em - a.em);
  const looseShare = extra.length ? loose.length / extra.length : 0;

  // each story's own spacing: its loosest tenth of lines (a story of a few lines: its loosest)
  const byStory = new Map<string, { page: number; ems: number[] }>();
  for (const x of extra) {
    if (!byStory.has(x.story)) byStory.set(x.story, { page: x.page, ems: [] });
    byStory.get(x.story)!.ems.push(x.em);
  }
  const looseStories = [...byStory].map(([id, { page, ems }]) => {
    const sorted = [...ems].sort((a, b) => a - b);
    return { id, page, p90: sorted[Math.floor(0.9 * (sorted.length - 1))] };
  }).filter((x) => x.p90 > STORY_P90_EM).map((x) => `p${x.page} ${x.id} (${x.p90.toFixed(2)}em)`);

  // a story that says the same thing twice
  const repeating = plans.flatMap((p) => p.placed.filter((x) => repeats(x.module.story.bodies[x.module.variant]))
    .map((x) => `p${p.page} ${x.module.story.id}`));

  // a short story: the paper's shortest length is a floor (the editor, 30 Oct)
  const under = plans.flatMap((p) => p.placed.filter((x) => !alwaysPrinted(x.module.story) && !wordForWord(x.module.story)
    && x.module.story.bodies[x.module.variant].split(/\s+/).filter(Boolean).length < profile.editorial.minWords)
    .map((x) => `p${p.page} ${x.module.story.id}`));

  const column = plans.filter((p) => p.page > 1).flatMap((p) => p.placed)
    .filter((x) => x.module.story.editorsColumn && (x.col === 0 || x.col + x.module.cols === GRID.columns)).length;

  // the display lines' fill, as each module recorded it
  // (a one-column brief centres a headline too short to justify, as the paper does)
  const unfilled = plans.flatMap((p) => p.placed.filter((x) => x.module.displayFill < FILL && x.module.cols !== 1)
    .map((x) => `p${p.page} ${x.module.story.id} (${Math.round(x.module.displayFill * 100)}%)`));

  // column ends per story: the bottoms of each column's last line
  const stories = new Map<string, number[]>();
  for (const [col, bottoms] of columns) {
    const story = col.replace(/-c\d+$/, "");
    stories.set(story, [...(stories.get(story) ?? []), Math.max(...bottoms)]);
  }
  // one line apart is level enough (at the story's own pitch, up to 2% looser)
  const ragged = [...stories].filter(([, ends]) => ends.length > 1 && Math.max(...ends) - Math.min(...ends) > BODY.pitch * 1.02 + 0.5)
    .map(([id, ends]) => `${id} (${((Math.max(...ends) - Math.min(...ends)) / PT).toFixed(0)}pt)`);

  // a page mostly of fillers is a day short of news, not a layout to polish
  const short = issue.pages.map((page, i) => {
    const band = bands[i];
    const ads = page.elements.filter((e) => e.kind === "image" && e.articleId?.startsWith("ad-"))
      .reduce((a, e) => a + (e.kind === "image" ? e.width * e.height : 0), 0);
    const room = (band.bottom - band.top) * (GRID.columns * GRID.column + (GRID.columns - 1) * GRID.gutter) - ads;
    const fill = page.elements.filter((e) => e.kind === "rect" && e.articleId?.startsWith("filler-"))
      .reduce((a, e) => a + (e.kind === "rect" ? e.width * e.height : 0), 0);
    return { page: page.number, share: room > 0 ? fill / room : 0 };
  }).filter((x) => x.share > FILLER_SHARE);

  // every story: a headline, a smaller sub-heading, then smaller body text
  const structure = plans.flatMap((p) => p.placed.filter((x) => {
    const mod = x.module;
    // (a customer's article given without a sub-heading prints without one: its words are his)
    if (mod.story.editorsColumn) return !(mod.headSize > 0 && mod.bodyLines > 0); // (printed with no sub-heading)
    if (wordForWord(mod.story) && !mod.story.deck.trim()) return !(mod.headSize > 0 && mod.bodyLines > 0);
    return !(mod.headSize > 0 && mod.deckSize > 0 && mod.bodyLines > 0
             && mod.headSize >= mod.deckSize * 1.25 - 0.01 && mod.deckSize >= BODY.size * 1.15 - 0.01);
  }).map((x) => `p${p.page} ${x.module.story.id}${x.module.deckSize ? "" : " (no sub-heading)"}`));

  const gates = [
    { gate: "S1 body text evenly spaced (no holes between words)", pass: q(0.95) <= P95_EM && looseShare <= LOOSE_SHARE,
      detail: `extra word space p50 ${q(0.5).toFixed(2)}em, p95 ${q(0.95).toFixed(2)}em; ${loose.length} loose line(s) ` +
              `(${(looseShare * 100).toFixed(1)}%, allowed ${LOOSE_SHARE * 100}%)` },
    { gate: "S2 every headline, kicker and deck line fills its width", pass: unfilled.length === 0, detail: unfilled.join(", ") || "ok" },
    { gate: "S4 a story's columns end level", pass: ragged.length === 0, detail: ragged.join(", ") || "ok" },
    { gate: "S5 enough copy for the pages (fillers under 12% of a page)", pass: short.length === 0,
      detail: short.map((x) => `p${x.page} ${Math.round(x.share * 100)}% fillers -- add releases or print fewer pages`).join("; ") || "ok" },
    { gate: "S7 every story: headline, smaller sub-heading, smaller body", pass: structure.length === 0, detail: structure.join(", ") || "ok" },
    { gate: "S8 no story says the same thing twice", pass: repeating.length === 0, detail: repeating.join(", ") || "ok" },
    { gate: `S10 no story under ${profile.editorial.minWords} words`, pass: under.length === 0, detail: under.join(", ") || "ok" },
    { gate: "S11 the editor's column once, at an inside page's edge", pass: !profile.editorial.columnTitle || column === 1,
      detail: column === 1 ? "ok" : `${column} printed at an edge of pages 2 and after` },
    { gate: "S9 no story set loosely", pass: looseStories.length === 0, detail: looseStories.join(", ") || "ok" },
    { gate: "S6 numbers in the paper's digits", pass: latinDigits.length === 0, detail: latinDigits.slice(0, 8).join(", ") || "ok" },
  ];
  return {
    gates,
    stats: {
      wordSpaceEm: { p50: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), max: +q(1).toFixed(3) },
      looseLines: loose.slice(0, 12).map((x) => ({ page: x.page, id: x.id, em: +x.em.toFixed(2), text: x.text })),
    },
  };
}
