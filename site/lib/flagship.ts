// આવતીકાલ (Aavtikal), the flagship section: long articles on AI, tech, science
// and politics (docs/website/FLAGSHIP.md). Its own table (`features`), so the
// daily site's queries never see these articles and the two never tangle.
import type { Lang, Photo, StorySource } from "./types.ts";
import { db } from "./db.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sampleOn } from "./sample.ts";

export type Beat = "ai" | "tech" | "science" | "politics";
export const BEATS: Beat[] = ["ai", "tech", "science", "politics"];
export const isBeat = (k: string): k is Beat => (BEATS as string[]).includes(k);

export const BEAT_NAMES: Record<Beat, Record<Lang, string>> = {
  ai: { gu: "AI", en: "AI", hi: "AI" },
  tech: { gu: "ટેક", en: "Tech", hi: "टेक" },
  science: { gu: "વિજ્ઞાન", en: "Science", hi: "विज्ञान" },
  politics: { gu: "રાજકારણ", en: "Politics", hi: "राजनीति" },
};
export const beatName = (b: Beat, lang: Lang) => BEAT_NAMES[b][lang];

/** Who wrote it: the engine's AI desk (always checked by the editor before it goes out) or the editor. */
export type AuthorKey = "desk" | "editor";
export const AUTHORS: Record<AuthorKey, { name: Record<Lang, string>; role: Record<Lang, string> }> = {
  desk: {
    name: { gu: "આવતીકાલ AI ડેસ્ક", en: "Aavtikal AI desk", hi: "आवतीकाल AI डेस्क" },
    role: { gu: "AIએ લખેલું, સંપાદકે તપાસેલું", en: "Written by AI, checked by the editor", hi: "AI ने लिखा, संपादक ने जाँचा" },
  },
  editor: {
    name: { gu: "સંપાદક", en: "The editor", hi: "संपादक" },
    role: { gu: "કેપિટલ ક્રાંતિ", en: "Capital Kranti", hi: "कैपिटल क्रांति" },
  },
};
export const isAuthor = (k: string): k is AuthorKey => k in AUTHORS;

export interface FeatureText { headline: string; dek: string; body: string; caption: string }
/** A text in the three languages (the desk writes Gujarati; its translation adds the others). */
export interface L3 { gu: string; en: string; hi: string }
/** A graph, table, diagram or picture in an article, placed by a "[[fig N]]" paragraph (engine/desk.ts). */
export interface Figure {
  kind: "bar" | "table" | "steps" | "image";
  title: L3;
  note?: L3;
  /** bar: the measure's unit ("%", "$ per million tokens") */
  unit?: string;
  rows?: { label: L3; value: number; mark?: boolean }[];
  head?: L3[];
  cells?: L3[][];
  steps?: { title: L3; text: L3 }[];
  photo?: Photo & { credit?: string };
  /** while the desk works: the picture's number among those offered */
  pick?: number;
}
export interface Feature {
  id: string;
  beat: Beat;
  headline: string;
  dek: string;
  /** paragraphs separated by blank lines; "## " starts a subheading, "### " a smaller one */
  body: string;
  caption: string;
  photo: Photo | null;
  author: AuthorKey;
  publishedAt: string;
  updatedAt: string;
  en: FeatureText | null;
  hi: FeatureText | null;
  sources: StorySource[];
  figures: Figure[];
}

/** A feature's words in the reader's language, else the Gujarati. */
export function featureWords(f: Feature, lang: Lang): FeatureText & { translated: boolean } {
  const e = lang === "en" ? f.en : lang === "hi" ? f.hi : null;
  return { headline: e?.headline || f.headline, dek: e?.dek || f.dek, body: e?.body || f.body, caption: e?.caption || f.caption, translated: !!e };
}
/** Minutes to read, at about 180 words a minute. */
export const readMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 180));

export const FL_WORDS = {
  gu: {
    name: "આવતીકાલ", tagline: "AI, ટેક, વિજ્ઞાન અને રાજકારણ: આવતીકાલને ઘડતી વાતો",
    home: "આવતીકાલ", daily: "કેપિટલ ક્રાંતિના સમાચાર", search: "શોધો", menu: "મેનુ", close: "બંધ કરો", look: "દેખાવ", editor: "સંપાદકનું પાનું", lookAuto: "ફોન પ્રમાણે", lookLight: "આછો", lookDark: "ઘેરો", join: "WhatsApp",
    joinTitle: "આવતીકાલ, તમારા ફોનમાં", joinText: "નવો લેખ આવે ત્યારે WhatsApp પર. મહિને થોડા, ધ્યાનથી લખેલા.", joinSoon: "ચેનલ ટૂંક સમયમાં",
    readMore: (b: string) => `${b} પર વધુ વાંચો.`, more: "વધુ લેખો", min: "મિનિટનું વાંચન", continue: "આગળ વાંચો",
    dive: "આવતીકાલના બધા લેખો", diveSub: "બધું વાંચો", writers: "કોણ લખે છે", seeAll: "બધા જુઓ",
    searchPlaceholder: "આવતીકાલમાં શોધો…", showing: (n: number) => `છેલ્લા ${n} લેખ`, found: (n: number) => `${n} લેખ મળ્યા`, notFound: "કોઈ લેખ ન મળ્યો. બીજો શબ્દ અજમાવો.",
    empty: "આવતીકાલના પહેલા લેખો તૈયાર થઈ રહ્યા છે. ટૂંક સમયમાં અહીં આવશે.",
    share: "WhatsApp પર મોકલો", copy: "લિંક કૉપી કરો", copied: "લિંક કૉપી થઈ",
    aiNote: "આ લેખ આવતીકાલના AI ડેસ્કે નીચેના સ્રોતો પરથી લખ્યો છે. તેનો દરેક આંકડો અને દરેક દાવો સ્રોતો સાથે મેળવ્યા પછી જ તે પ્રકાશિત થયો છે; જે લેખ એ તપાસમાં પાસ ન થાય તે સંપાદક પાસે જાય છે.",
    sources: "સ્રોત", notTranslated: "", about: "અમારા વિશે", policy: "સંપાદકીય નીતિ", how: "અમે કેવી રીતે ચકાસીએ છીએ", contact: "સંપર્ક",
    // the door into Aavtikal on Capital Kranti's front page (components/AavtikalPromo.tsx)
    promoBy: "કેપિટલ ક્રાંતિ રજૂ કરે છે", promoPitch: "સમાચારની પાછળની વાત: લાંબા, સમજાવતા લેખો, ગ્રાફ અને ચિત્રો સાથે.", promoCta: "આવતીકાલ વાંચો", promoMore: "હમણાંના લેખો",
    writersText: "AI ડેસ્ક દુનિયાભરના વિશ્વસનીય સ્રોતો, કંપનીઓ અને સંસ્થાઓની પોતાની જાહેરાતો વાંચી લાંબા, સમજાવતા લેખ લખે છે. દરેક આંકડો અને દાવો સ્રોતો સાથે મેળવાય છે; જે લેખ એ તપાસમાં પાસ ન થાય તે સંપાદક વાંચે ત્યાં સુધી પ્રકાશિત થતો નથી.",
  },
  en: {
    name: "Aavtikal", tagline: "AI, tech, science and politics: what shapes tomorrow",
    home: "Aavtikal", daily: "Capital Kranti news", search: "Search", menu: "Menu", close: "Close", look: "Appearance", editor: "Editor’s page", lookAuto: "Match phone", lookLight: "Light", lookDark: "Dark", join: "WhatsApp",
    joinTitle: "Aavtikal on your phone", joinText: "A message on WhatsApp when a new article is out. A few a month, written with care.", joinSoon: "Channel coming soon",
    readMore: (b: string) => `Read more on ${b}.`, more: "More articles", min: "min read", continue: "Continue reading",
    dive: "Every Aavtikal article", diveSub: "Read them all", writers: "Who writes", seeAll: "See all",
    searchPlaceholder: "Search Aavtikal…", showing: (n: number) => `The latest ${n} articles`, found: (n: number) => `${n} articles found`, notFound: "No articles found. Try another word.",
    empty: "Aavtikal's first articles are being written. They'll be here soon.",
    share: "Send on WhatsApp", copy: "Copy link", copied: "Link copied",
    aiNote: "This article was written by Aavtikal's AI desk from the sources below. It was published only after every number and every claim in it was matched against them; an article that fails that check goes to the editor.",
    sources: "Sources", notTranslated: "This article isn't in English yet, so it's shown in Gujarati.", about: "About us", policy: "Editorial policy", how: "How we check", contact: "Contact",
    promoBy: "Capital Kranti presents", promoPitch: "The story behind the news: long explainers, with graphs and pictures.", promoCta: "Read Aavtikal", promoMore: "Recent articles",
    writersText: "The AI desk reads trusted sources from around the world, and the companies' and agencies' own announcements, and writes long explainers. Every number and claim is matched against the sources; an article that fails that check isn't published until the editor has read it.",
  },
  hi: {
    name: "आवतीकाल", tagline: "AI, टेक, विज्ञान और राजनीति: जो कल को गढ़ते हैं",
    home: "आवतीकाल", daily: "कैपिटल क्रांति समाचार", search: "खोजें", menu: "मेनू", close: "बंद करें", look: "रूप", editor: "संपादक का पन्ना", lookAuto: "फ़ोन के अनुसार", lookLight: "हल्का", lookDark: "गहरा", join: "WhatsApp",
    joinTitle: "आवतीकाल आपके फ़ोन में", joinText: "नया लेख आने पर WhatsApp पर संदेश। महीने में कुछ ही, ध्यान से लिखे हुए।", joinSoon: "चैनल जल्द ही",
    readMore: (b: string) => `${b} पर और पढ़ें।`, more: "और लेख", min: "मिनट का पाठ", continue: "आगे पढ़ें",
    dive: "आवतीकाल के सभी लेख", diveSub: "सब पढ़ें", writers: "कौन लिखता है", seeAll: "सब देखें",
    searchPlaceholder: "आवतीकाल में खोजें…", showing: (n: number) => `पिछले ${n} लेख`, found: (n: number) => `${n} लेख मिले`, notFound: "कोई लेख नहीं मिला। कोई और शब्द आज़माएँ।",
    empty: "आवतीकाल के पहले लेख लिखे जा रहे हैं। जल्द ही यहाँ होंगे।",
    share: "WhatsApp पर भेजें", copy: "लिंक कॉपी करें", copied: "लिंक कॉपी हुआ",
    aiNote: "यह लेख आवतीकाल के AI डेस्क ने नीचे दिए स्रोतों से लिखा है। इसका हर आँकड़ा और हर दावा स्रोतों से मिलाने के बाद ही यह प्रकाशित हुआ है; जो लेख इस जाँच में पास नहीं होता, वह संपादक के पास जाता है।",
    sources: "स्रोत", notTranslated: "यह लेख अभी हिंदी में नहीं है, इसलिए गुजराती में दिखाया गया है।", about: "हमारे बारे में", policy: "संपादकीय नीति", how: "हम कैसे जाँचते हैं", contact: "संपर्क",
    promoBy: "कैपिटल क्रांति प्रस्तुत करता है", promoPitch: "ख़बर के पीछे की बात: लंबे, समझाने वाले लेख, ग्राफ़ और चित्रों के साथ।", promoCta: "आवतीकाल पढ़ें", promoMore: "हाल के लेख",
    writersText: "AI डेस्क दुनिया भर के भरोसेमंद स्रोत और कंपनियों व संस्थाओं की अपनी घोषणाएँ पढ़कर लंबे, समझाने वाले लेख लिखता है। हर आँकड़ा और दावा स्रोतों से मिलाया जाता है; जो लेख इस जाँच में पास नहीं होता, वह संपादक के पढ़ने तक प्रकाशित नहीं होता।",
  },
} as const;
export const flw = (lang: Lang) => FL_WORDS[lang];

// ---- reading ----

type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : "");
function featureOf(r: Row): Feature {
  return {
    id: r.id as string, beat: (isBeat(r.beat as string) ? r.beat : "tech") as Beat,
    headline: r.headline as string, dek: (r.dek as string) ?? "", body: (r.body as string) ?? "", caption: (r.caption as string) ?? "",
    photo: (r.photo as Photo | null) ?? null, author: isAuthor(r.author as string) ? (r.author as AuthorKey) : "desk",
    publishedAt: iso(r.published_at), updatedAt: iso(r.updated_at),
    en: (r.en as FeatureText | null) ?? null, hi: (r.hi as FeatureText | null) ?? null, sources: (r.sources as StorySource[] | null) ?? [],
    figures: (r.figures as Figure[] | null) ?? [],
  };
}
const COLS = `id, beat, headline, dek, body, caption, photo, author, published_at, updated_at, en, hi, sources, figures`;

/** The newest published articles, of one beat or author, or all. */
export async function features(o: { beat?: Beat; author?: AuthorKey; limit?: number } = {}): Promise<Feature[]> {
  const limit = o.limit ?? 40;
  if (sampleOn()) return sampleFeatures().filter((f) => (!o.beat || f.beat === o.beat) && (!o.author || f.author === o.author)).slice(0, limit);
  const sql = db();
  if (!sql) return [];
  const rows = await sql.query(
    `select ${COLS} from features where status = 'published' and ($1::text is null or beat = $1) and ($2::text is null or author = $2)
      order by published_at desc limit $3`, [o.beat ?? null, o.author ?? null, limit]);
  return rows.map(featureOf);
}

export async function featureById(id: string): Promise<Feature | null> {
  if (sampleOn()) return sampleFeatures().find((f) => f.id === id) ?? null;
  const sql = db();
  if (!sql) return null;
  const rows = await sql.query(`select ${COLS} from features where id = $1 and status = 'published'`, [id]);
  return rows[0] ? featureOf(rows[0]) : null;
}

/** Headlines, summaries and text containing every word (and their English). */
export async function searchFeatures(q: string, limit = 30): Promise<Feature[]> {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return features({ limit: 12 });
  if (sampleOn()) return sampleFeatures().filter((f) => words.every((w) => (f.headline + f.dek + f.body).includes(w))).slice(0, limit);
  const sql = db();
  if (!sql) return [];
  const where = words.map((_, i) => `(headline || ' ' || dek || ' ' || body || ' ' || coalesce(en::text, '')) ilike $${i + 1}`).join(" and ");
  const rows = await sql.query(`select ${COLS} from features where status = 'published' and ${where} order by published_at desc limit ${Math.min(limit, 50)}`,
    words.map((w) => `%${w.replace(/[%_\\]/g, (c) => "\\" + c)}%`));
  return rows.map(featureOf);
}

// ---- local checking (CK_SAMPLE=1): sample articles with freely licensed photos
// (site/pipeline/features: the articles first published, pipeline/features.ts; each caption credits its photographer) ----

let sampleCache: Feature[] | null = null;
function sampleFeatures(): Feature[] {
  if (sampleCache) return sampleCache;
  type Raw = Omit<Feature, "publishedAt" | "updatedAt" | "hi" | "en"> & { en: FeatureText };
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), "pipeline/features/2026-10-28.json"), "utf8")) as Raw[];
  // newest first, about a day apart
  sampleCache = raw.map((r, i): Feature => {
    const at = new Date(Date.parse("2026-10-28T06:00:00Z") - i * 26 * 3600_000).toISOString();
    return { ...r, publishedAt: at, updatedAt: at, hi: null };
  });
  return sampleCache;
}
