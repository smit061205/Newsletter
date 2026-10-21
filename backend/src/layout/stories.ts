// The day's stories before they're laid out: editors' text changes applied,
// duplicates (the same event released twice) dropped, related stories told
// apart, and the stand-in ads for days with no bookings.
import { readFileSync } from "node:fs";
import { profile, profilePath } from "../profile.ts";
import type { Ad, Edit, Story } from "../store.ts";

/** The reference issue's ads, as bookings for `date` (stand-ins until real
 * bookings are uploaded): each creative cut cleanly from the source by
 * scripts/mock_backend/chrome_assets.py, at its printed position. */
export function referenceAds(date: string): Ad[] {
  const template = JSON.parse(readFileSync(profilePath(profile.chrome), "utf8")) as
    { ads: { id: string; page: number; x: number; y: number; width: number; height: number; url: string }[] };
  return template.ads.map((a) => ({ ...a, date }));
}

/** Share of words two stories have in common (headline and opening). */
export function similarity(a: Story, b: Story): number {
  const words = (s: Story) => new Set((s.headline + " " + s.bodies.long.slice(0, 600)).split(/\s+/).filter((w) => w.length > 2));
  const wa = words(a), wb = words(b);
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(1, Math.min(wa.size, wb.size));
}
/** Two releases about the same event (the department's and the Chief
 * Minister's Office's, say): keep one. */
const sameEvent = (a: Story, b: Story) => similarity(a, b) > 0.6;
/** Related stories (the same trip, the same visitor) go on different pages. */
export const related = (a: Story, b: Story) => similarity(a, b) > 0.2;

export function dedupe(stories: Story[]): Story[] {
  const kept: Story[] = [];
  for (const s of [...stories].sort((a, b) => Number(!!b.photo) - Number(!!a.photo) || b.bodies.long.length - a.bodies.long.length)) {
    if (!kept.some((k) => sameEvent(k, s))) kept.push(s);
  }
  return stories.filter((s) => kept.includes(s));
}

const scriptShare = (s: string, re: RegExp) => (s.match(re)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);
/** Is this story in the paper's own language? */
export function inPaperLanguage(s: Story): boolean {
  const text = s.headline + s.bodies.long;
  switch (profile.language.lang) {
    case "gu": return scriptShare(text, /[઀-૿]/g) > 0.5;
    case "ur": return scriptShare(text, /[؀-ۿ]/g) > 0.5;
    default: return scriptShare(text, /[A-Za-z]/g) > 0.5;
  }
}

/** Story text an editor changed wins over the generated one. */
export function applyTextEdits(stories: Story[], edits: Edit[]): Story[] {
  return stories.map((s) => {
    const mine = edits.filter((e) => e.storyId === s.id);
    if (!mine.length) return s;
    const out: Story = { ...s, bodies: { ...s.bodies } };
    for (const { change } of mine) {
      if (typeof change.headline === "string") out.headline = change.headline;
      if (typeof change.kicker === "string") out.kicker = change.kicker;
      if (typeof change.deck === "string") out.deck = change.deck;
      if (typeof change.caption === "string") out.caption = change.caption;
      if (typeof change.photo === "string" || change.photo === null) out.photo = change.photo as string | null;
      if (typeof change.body === "string") out.bodies = { long: change.body, medium: change.body, short: change.body };
    }
    return out;
  });
}
