import type { Genre, Lang, Tier } from "./types.ts";

export const TIERS: Tier[] = ["gujarat", "india", "world"];
export const GENRES: Genre[] = ["farm", "economy", "tech", "health", "sport", "education", "entertainment"];
export const SECTIONS: (Tier | Genre)[] = [...TIERS, ...GENRES];

const NAMES: Record<Tier | Genre, Record<Lang, string>> = {
  gujarat: { gu: "ગુજરાત", en: "Gujarat", hi: "गुजरात" },
  india: { gu: "દેશ", en: "India", hi: "देश" },
  world: { gu: "વિશ્વ", en: "World", hi: "विश्व" },
  farm: { gu: "ખેતી", en: "Farming", hi: "खेती" },
  economy: { gu: "અર્થતંત્ર", en: "Economy", hi: "अर्थव्यवस्था" },
  tech: { gu: "ટેક-વિજ્ઞાન", en: "Tech & science", hi: "टेक-विज्ञान" },
  health: { gu: "આરોગ્ય", en: "Health", hi: "स्वास्थ्य" },
  sport: { gu: "રમતગમત", en: "Sport", hi: "खेल" },
  education: { gu: "શિક્ષણ", en: "Education", hi: "शिक्षा" },
  entertainment: { gu: "મનોરંજન", en: "Entertainment", hi: "मनोरंजन" },
};
export const sectionName = (key: string, lang: Lang) => NAMES[key as Tier]?.[lang] ?? key;
export const isSection = (key: string): key is Tier | Genre => key in NAMES;
