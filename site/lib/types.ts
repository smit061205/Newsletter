// What the website keeps and shows. Stories come from the evening paper's
// Publish (phase A); live news joins them in phase B.

export type Tier = "gujarat" | "india" | "world";
export type Genre = "farm" | "economy" | "tech" | "health" | "sport" | "education" | "entertainment";
export type Lang = "gu" | "en";

export interface Photo { url: string; width: number; height: number }
export interface Source { kind: "pib" | "cmo" | "air" | "gujinfo" | "other"; name: string; url: string; office?: string }
export interface English { kicker: string; headline: string; deck: string; body: string; caption: string }
export interface Correction { at: string; gu: string; en?: string }

export interface Story {
  id: string;
  issueDate: string;
  publishedAt: string;
  updatedAt: string;
  tier: Tier;
  genres: Genre[];
  kicker: string;
  headline: string;
  deck: string;
  body: string;
  caption: string;
  photo: Photo | null;
  source: Source | null;
  checked: boolean;
  page: number | null;
  rank: number | null;
  en: English | null;
  corrections: Correction[];
}

export interface IssuePage { number: number; url: string; width: number; height: number }
export interface Issue { date: string; number: number; pages: IssuePage[]; pdf: string | null; publishedAt: string; storyIds: string[] }

/** What the newsroom's Publish sends (backend/src/publish-site.ts). */
export interface PublishPayload {
  issue: { date: string; number: number; pages: IssuePage[]; pdf: string | null };
  stories: {
    id: string; kicker: string; headline: string; deck: string; body: string; caption: string;
    photo: Photo | null; source: Source | null; checked: boolean; page: number | null; rank: number | null;
  }[];
}
