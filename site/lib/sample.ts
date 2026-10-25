// Local checking only (CK_SAMPLE=1 npm run dev): 22 Oct 2026's real stories
// from the design sample stand in for the database, so pages can be looked at
// on a computer without the website's keys. Never used on the live site.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Issue, Story, Tier } from "./types.ts";

const SEC: Record<string, Tier | [Tier, string]> = {
  p2326788: "gujarat", p2326576: "world", p2326589: "world", p2326600: "world", p2326774: "world", p2326646: "world",
  p2326794: ["india", "farm"], p2326879: ["india", "farm"], p2326374: ["india", "farm"], p2326715: ["india", "farm"],
  p2326779: ["india", "economy"], p2326850: ["india", "economy"], p2326873: ["india", "economy"], p2326498: ["india", "economy"],
  p2326691: ["india", "tech"], p2326728: ["india", "tech"], p2326762: ["india", "tech"], p2326872: ["india", "health"],
  p2326743: ["india", "sport"], p2326749: ["india", "sport"],
};

let cache: { stories: Story[]; issues: Issue[] } | null = null;
export function sample() {
  if (cache) return cache;
  const root = path.join(process.cwd(), "..");
  const raw = JSON.parse(readFileSync(path.join(root, "docs/website/sample/full-img.json"), "utf8")) as
    { id: string; k: string; h: string; d: string; body: string; cap: string; src: string; img?: string }[];
  const stories = raw.map((r, i): Story => {
    const sec = SEC[r.id] ?? "india";
    const [tier, genre] = Array.isArray(sec) ? sec : [sec, undefined];
    return {
      id: r.id, issueDate: "2026-10-22", publishedAt: "2026-10-22T14:40:00.000Z", updatedAt: "2026-10-22T14:40:00.000Z",
      tier, genres: genre ? [genre as never] : [], kicker: r.k, headline: r.h, deck: r.d, body: r.body.replace(/^[^\n]*::\s*\n?/, ""), caption: r.cap,
      photo: r.img ? { url: r.img, width: 1200, height: 800 } : null,
      source: { kind: "pib", name: "પત્ર સૂચના કાર્યાલય (PIB)", url: r.src }, checked: true,
      page: Math.floor(i / 8) + 1, rank: i % 8, en: i % 3 === 0 ? null : null, corrections: [],
    };
  });
  const issues: Issue[] = [{ date: "2026-10-22", number: 271, pdf: null, publishedAt: "2026-10-22T14:40:00.000Z", storyIds: stories.map((s) => s.id),
    pages: [1, 2, 3, 4].map((n) => ({ number: n, url: `/sample-epaper/${n}.jpg`, width: 2303, height: 3100 })) }];
  cache = { stories, issues };
  return cache;
}
export const sampleOn = () => process.env.CK_SAMPLE === "1" && !process.env.DATABASE_URL;
