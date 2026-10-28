// The editor's own articles in the day's paper, word for word (28 Oct: the
// same as the copies' articles, editorial/copies.ts, for the paper itself).
// Each has its title, sub-heading, text and photo; given more than one of
// any, the paper prints the first. They're kept beside the day's photos
// (media/<date>/articles.json) and go into the paper as stories of their own:
// never reworded, cut, held back or left without their photo (store.ts
// wordForWord, alwaysPrinted). The copies and sister papers have their own.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MEDIA_DIR } from "../config.ts";
import type { Story } from "../store.ts";
import type { Article } from "./copies.ts";

const fileOf = (date: string) => path.join(MEDIA_DIR, date, "articles.json");

/** The day's own articles (none if the editor added none). */
export function paperArticles(date: string): Article[] {
  const file = fileOf(date);
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, "utf8")) as Article[]; } catch { return []; }
}

/** A photo as the newsroom sends it: a new one's file, or one already saved. */
export type GivenPhoto = { name: string; base64: string } | { url: string };
/** An article as the newsroom sends it. */
export interface GivenArticle { titles?: string[]; decks?: string[]; bodies?: string[]; photos?: GivenPhoto[] }

/** Articles from the newsroom, checked, their new photos saved with the day's
 * (`prefix` names the files: the copies' and the paper's apart). A string is what's wrong. */
export async function takeArticles(date: string, given: GivenArticle[], prefix: string): Promise<Article[] | string> {
  const articles: Article[] = [];
  const line = (x: string) => x.replace(/\s+/g, " ").trim();
  for (const [k, a] of given.slice(0, 10).entries()) {
    const titles = (a.titles ?? []).map(line).filter(Boolean).slice(0, 12);
    const bodies = (a.bodies ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 12);
    if (!titles.length || !bodies.length) return `article ${k + 1} needs its text and at least one title`;
    const dir = path.join(MEDIA_DIR, date);
    await mkdir(dir, { recursive: true });
    const photos: string[] = [];
    for (const [i, p] of (a.photos ?? []).slice(0, 12).entries()) {
      if ("url" in p) { if (/^\/media\/[\w./-]+$/.test(p.url) && !p.url.includes("..")) photos.push(p.url); continue; }
      const name = `${prefix}-${k + 1}-${i + 1}-${p.name.replace(/[^A-Za-z0-9._-]/g, "_")}`;
      await writeFile(path.join(dir, name), Buffer.from(p.base64, "base64"));
      photos.push(`/media/${date}/${name}`);
    }
    articles.push({ titles, decks: (a.decks ?? []).map(line).filter(Boolean).slice(0, 12), bodies, photos });
  }
  return articles;
}

/** The day's own articles saved (an empty list takes them out of the paper). */
export async function savePaperArticles(date: string, articles: Article[]): Promise<void> {
  await mkdir(path.dirname(fileOf(date)), { recursive: true });
  await writeFile(fileOf(date), JSON.stringify(articles, null, 2));
}

/** The day's own articles as the paper prints them: each a story of its own, kept whole. */
export function paperArticleStories(date: string): Story[] {
  return paperArticles(date).map((a, i) => {
    const body = (a.bodies[0] ?? "").split(/\n+/).map((p) => p.trim()).filter(Boolean).join("\n\n");
    const photo = a.photos[0] ?? null;
    return { id: `z-paper-${i + 1}`, releaseId: null, date, kicker: "", headline: (a.titles[0] ?? "").trim(), deck: (a.decks[0] ?? "").trim(),
             bodies: { long: body, medium: body, short: body }, priority: 2, page: null, photo, photos: photo ? [photo] : [], caption: "",
             source: "fixed:paper", model: "as-is", needsReview: false };
  });
}
