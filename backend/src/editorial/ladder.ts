// Each story's ladder of lengths: every length it may print at, ready before
// the layout starts, so laying out a page is choosing from them -- never
// waiting on the AI in a loop (the old gap closer asked it again and again,
// story by story, and stretched short releases until they said things twice).
//
// The rungs, longest first:
//   - a longer version, written once by the AI from the release's own facts
//     (rewrite.ts fitLength), when the release holds more than the story uses;
//   - the story's own three lengths (rewrite.ts: long, medium, short);
//   - and between and under them, each one cut by whole sentences from its
//     end, the way a desk cuts a story from the bottom (news runs most
//     important first).
// Every rung passes editorial/quality.ts (never says a thing twice, every
// letter printable) and is in the paper's language.
import { aiStalled, fitLength, paragraphs } from "./rewrite.ts";
import { repeats, settable, withoutRepeats, wordCount } from "./quality.ts";
import { inPaperLanguage } from "../layout/stories.ts";
import { profile } from "../profile.ts";
import { wordForWord, type Release, type Store, type Story } from "../store.ts";

export interface Rung {
  body: string;
  words: number;
  /** where it came from: the AI's longer version, one of the story's own lengths, or one of those cut */
  from: "longer" | "long" | "medium" | "short" | "cut";
  /** numbers in it that aren't in the release (the longer version's check) */
  factCheck?: string;
}

/** Shortest a rung may be (the profile's: a brief is about 25 words). */
export const MIN_WORDS = profile.editorial.minWords;
/** Two rungs closer than this (share of words) are one. */
const STEP = 0.03;
/** Most rungs a story keeps. */
const MOST = 28;

/** The body without its last sentence (a whole paragraph goes if it's one sentence). */
export function dropLastSentence(body: string): string | null {
  const paras = body.split(/\n\s*\n/);
  const last = paras[paras.length - 1].trim();
  // a sentence ends at its stop followed by a space or the paragraph's end
  // (not at the dots inside "nmba.dosje.gov.in" or "૩.૫")
  const sentences = last.match(/[\s\S]*?[.!?।]+["'”’)]*(?:\s+|$)|[\s\S]+$/g)?.filter(Boolean) ?? [last];
  if (sentences.length > 1) paras[paras.length - 1] = sentences.slice(0, -1).join("").trim();
  else if (paras.length > 1) paras.pop();
  else return null;
  return paras.join("\n\n");
}

/** A release longer than the story by this much has facts for a longer version. */
const MORE_IN_RELEASE = 1.25;

/** The ladder of a story, longest first. `longer`: ask the AI for a longer
 * version where the release has the facts (the day's paper); "cached": only
 * one already written (a copy, a translated paper). */
export async function ladderOf(store: Store, story: Story, release: Release | undefined,
                               opts: { longer: boolean | "cached"; log?: (s: string) => void }): Promise<{ rungs: Rung[]; cost: number }> {
  // a customer's article: its own words, whole -- never cut nor lengthened
  if (wordForWord(story)) return { rungs: [{ body: story.bodies.long, words: wordCount(story.bodies.long), from: "long" }], cost: 0 };
  let cost = 0;
  const bases: Rung[] = [];
  // (a sentence said twice comes out here: 30 Oct, a story printed saying the same thing twice)
  const own = (["long", "medium", "short"] as const).map((v) => {
    const body = repeats(story.bodies[v]) ? withoutRepeats(story.bodies[v]) : story.bodies[v];
    return { body, words: wordCount(body), from: v };
  });
  const longest = Math.max(...own.map((r) => r.words));
  if (release && opts.longer) {
    const have = wordCount(paragraphs(release.body).join(" "));
    if (have >= longest * MORE_IN_RELEASE && longest < 700) {
      const target = Math.round(Math.min(have, longest * 1.6));
      // ("cached": a copy takes the day's paper's longer version, never asks for one)
      const got = opts.longer === "cached" && !store.fitted(`${story.id}|${target}`) ? null
        : await fitLength(store, story, release, target, { log: opts.log });
      if (got) {
        cost += got.cost;
        bases.push({ body: got.body, words: wordCount(got.body), from: "longer", ...(got.factCheck ? { factCheck: got.factCheck } : {}) });
      }
    }
  }
  bases.push(...own);
  bases.sort((a, b) => b.words - a.words);

  // each length, then cut a sentence at a time down to the next one (the last: down to a brief)
  const all: Rung[] = [];
  for (const [i, base] of bases.entries()) {
    const next = bases[i + 1]?.words ?? MIN_WORDS;
    all.push(base);
    for (let body = dropLastSentence(base.body); body; body = dropLastSentence(body)) {
      const words = wordCount(body);
      if (words < Math.max(MIN_WORDS, next)) break;
      all.push({ body, words, from: "cut", ...(base.factCheck ? { factCheck: base.factCheck } : {}) });
    }
  }
  const printable = (r: Rung) => r.words >= Math.min(MIN_WORDS, longest) && !repeats(r.body) && settable(r.body)
    && inPaperLanguage({ ...story, bodies: { long: r.body, medium: r.body, short: r.body } });
  // (each a step shorter than the one before)
  const steps = (list: Rung[]) => {
    const out: Rung[] = [];
    for (const r of [...list].sort((a, b) => b.words - a.words)) {
      const last = out[out.length - 1];
      if (last && last.words - r.words < Math.max(3, last.words * STEP)) continue;
      out.push(r);
    }
    return out;
  };
  const sound = steps(all.filter(printable));
  // a story whose every length failed the checks keeps all its lengths (the
  // gates report it): only its longest, a 3,060-word speech the AI couldn't
  // write up, fitted no page, and page 4 came out blank (30 Oct)
  const kept = sound.length ? sound : steps(all.filter((r) => r.words >= Math.min(MIN_WORDS, longest)));
  // at most MOST, evenly over the range (the longest and shortest kept)
  const rungs = kept.length <= MOST ? kept
    : Array.from({ length: MOST }, (_, k) => kept[Math.round(k * (kept.length - 1) / (MOST - 1))]);
  return { rungs: rungs.length ? rungs : [own[0]], cost };
}

/** A story written longer for a gap on its page (layout/engine.ts): its ladder
 * with the new length and that length's cuts added. Facts from its release only:
 * null if the release has no more to say, or the new text can't be printed. */
export async function grown(store: Store, story: Story, release: Release, ladder: Rung[], more: number,
                            log?: (s: string) => void): Promise<{ rungs: Rung[]; cost: number } | null> {
  if (wordForWord(story) || aiStalled()) return null;
  const top = ladder[0]?.words ?? 0;
  const target = Math.round(Math.min(wordCount(paragraphs(release.body).join(" ")), top + more));
  if (target < top + 10) return null;
  const got = await fitLength(store, story, release, target, { log });
  if (!got || got.factCheck) return null;
  const rungs: Rung[] = [{ body: got.body, words: wordCount(got.body), from: "longer" }];
  for (let body = dropLastSentence(got.body); body && wordCount(body) > top; body = dropLastSentence(body)) {
    rungs.push({ body, words: wordCount(body), from: "cut" });
  }
  const fine = rungs.filter((r) => r.words > top && !repeats(r.body) && settable(r.body)
                                   && inPaperLanguage({ ...story, bodies: { long: r.body, medium: r.body, short: r.body } }));
  return fine.length ? { rungs: [...fine, ...ladder], cost: got.cost } : null;
}

/** A story set at one rung. */
export const atRung = (story: Story, r: Rung): Story => ({
  ...story, bodies: { long: r.body, medium: r.body, short: r.body },
  ...(r.factCheck ? { factCheck: r.factCheck } : {}),
});
