import type { Genre, Lang, Tier } from "./types.ts";

export const TIERS: Tier[] = ["gujarat", "india", "world"];
export const GENRES: Genre[] = ["farm", "economy", "tech", "health", "sport", "education", "entertainment"];
export const SECTIONS: (Tier | Genre)[] = [...TIERS, ...GENRES];

const NAMES: Record<Tier | Genre, { gu: string; en: string }> = {
  gujarat: { gu: "ગુજરાત", en: "Gujarat" },
  india: { gu: "દેશ", en: "India" },
  world: { gu: "વિશ્વ", en: "World" },
  farm: { gu: "ખેતી", en: "Farming" },
  economy: { gu: "અર્થતંત્ર", en: "Economy" },
  tech: { gu: "ટેક-વિજ્ઞાન", en: "Tech & science" },
  health: { gu: "આરોગ્ય", en: "Health" },
  sport: { gu: "રમતગમત", en: "Sport" },
  education: { gu: "શિક્ષણ", en: "Education" },
  entertainment: { gu: "મનોરંજન", en: "Entertainment" },
};
export const sectionName = (key: string, lang: Lang) => NAMES[key as Tier]?.[lang] ?? key;
export const isSection = (key: string): key is Tier | Genre => key in NAMES;
