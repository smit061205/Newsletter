// આવતીકાલ (Aavtikal), the flagship section: long articles on AI, tech, science
// and politics (docs/website/FLAGSHIP.md). Its own table (`features`), so the
// daily site's queries never see these articles and the two never tangle.
import type { Lang, Photo, StorySource } from "./types.ts";
import { db } from "./db.ts";
import { sample, sampleOn } from "./sample.ts";

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
    home: "આવતીકાલ", daily: "કેપિટલ ક્રાંતિના સમાચાર", search: "શોધો", menu: "મેનુ", close: "બંધ કરો", join: "WhatsApp",
    joinTitle: "આવતીકાલ, તમારા ફોનમાં", joinText: "નવો લેખ આવે ત્યારે WhatsApp પર. મહિને થોડા, ધ્યાનથી લખેલા.", joinSoon: "ચેનલ ટૂંક સમયમાં",
    readMore: (b: string) => `${b} પર વધુ વાંચો.`, more: "વધુ લેખો", min: "મિનિટનું વાંચન", continue: "આગળ વાંચો",
    dive: "આવતીકાલના બધા લેખો", diveSub: "બધું વાંચો", writers: "કોણ લખે છે", seeAll: "બધા જુઓ",
    searchPlaceholder: "આવતીકાલમાં શોધો…", showing: (n: number) => `છેલ્લા ${n} લેખ`, found: (n: number) => `${n} લેખ મળ્યા`, notFound: "કોઈ લેખ ન મળ્યો. બીજો શબ્દ અજમાવો.",
    empty: "આવતીકાલના પહેલા લેખો તૈયાર થઈ રહ્યા છે. ટૂંક સમયમાં અહીં આવશે.",
    share: "WhatsApp પર મોકલો", copy: "લિંક કૉપી કરો", copied: "લિંક કૉપી થઈ",
    aiNote: "આ લેખ આવતીકાલના AI ડેસ્કે લખ્યો છે અને પ્રકાશિત થતાં પહેલાં સંપાદકે વાંચીને તપાસ્યો છે. દરેક આંકડો નીચેના સ્રોતો સાથે મેળવ્યો છે.",
    sources: "સ્રોત", notTranslated: "", about: "અમારા વિશે", policy: "સંપાદકીય નીતિ", how: "અમે કેવી રીતે ચકાસીએ છીએ", contact: "સંપર્ક",
    writersText: "AI ડેસ્ક દુનિયાભરના વિશ્વસનીય સ્રોતો વાંચી લાંબા, સમજાવતા લેખ લખે છે; કોઈ પણ લેખ સંપાદકની મંજૂરી વિના પ્રકાશિત થતો નથી.",
  },
  en: {
    name: "Aavtikal", tagline: "AI, tech, science and politics: what shapes tomorrow",
    home: "Aavtikal", daily: "Capital Kranti news", search: "Search", menu: "Menu", close: "Close", join: "WhatsApp",
    joinTitle: "Aavtikal on your phone", joinText: "A message on WhatsApp when a new article is out. A few a month, written with care.", joinSoon: "Channel coming soon",
    readMore: (b: string) => `Read more on ${b}.`, more: "More articles", min: "min read", continue: "Continue reading",
    dive: "Every Aavtikal article", diveSub: "Read them all", writers: "Who writes", seeAll: "See all",
    searchPlaceholder: "Search Aavtikal…", showing: (n: number) => `The latest ${n} articles`, found: (n: number) => `${n} articles found`, notFound: "No articles found. Try another word.",
    empty: "Aavtikal's first articles are being written. They'll be here soon.",
    share: "Send on WhatsApp", copy: "Copy link", copied: "Link copied",
    aiNote: "This article was written by Aavtikal's AI desk and read and checked by the editor before it was published. Every number was matched against the sources below.",
    sources: "Sources", notTranslated: "This article isn't in English yet, so it's shown in Gujarati.", about: "About us", policy: "Editorial policy", how: "How we check", contact: "Contact",
    writersText: "The AI desk reads trusted sources from around the world and writes long explainers; nothing is published without the editor's approval.",
  },
  hi: {
    name: "आवतीकाल", tagline: "AI, टेक, विज्ञान और राजनीति: जो कल को गढ़ते हैं",
    home: "आवतीकाल", daily: "कैपिटल क्रांति समाचार", search: "खोजें", menu: "मेनू", close: "बंद करें", join: "WhatsApp",
    joinTitle: "आवतीकाल आपके फ़ोन में", joinText: "नया लेख आने पर WhatsApp पर संदेश। महीने में कुछ ही, ध्यान से लिखे हुए।", joinSoon: "चैनल जल्द ही",
    readMore: (b: string) => `${b} पर और पढ़ें।`, more: "और लेख", min: "मिनट का पाठ", continue: "आगे पढ़ें",
    dive: "आवतीकाल के सभी लेख", diveSub: "सब पढ़ें", writers: "कौन लिखता है", seeAll: "सब देखें",
    searchPlaceholder: "आवतीकाल में खोजें…", showing: (n: number) => `पिछले ${n} लेख`, found: (n: number) => `${n} लेख मिले`, notFound: "कोई लेख नहीं मिला। कोई और शब्द आज़माएँ।",
    empty: "आवतीकाल के पहले लेख लिखे जा रहे हैं। जल्द ही यहाँ होंगे।",
    share: "WhatsApp पर भेजें", copy: "लिंक कॉपी करें", copied: "लिंक कॉपी हुआ",
    aiNote: "यह लेख आवतीकाल के AI डेस्क ने लिखा है और प्रकाशन से पहले संपादक ने पढ़कर जाँचा है। हर आँकड़ा नीचे दिए स्रोतों से मिलाया गया है।",
    sources: "स्रोत", notTranslated: "यह लेख अभी हिंदी में नहीं है, इसलिए गुजराती में दिखाया गया है।", about: "हमारे बारे में", policy: "संपादकीय नीति", how: "हम कैसे जाँचते हैं", contact: "संपर्क",
    writersText: "AI डेस्क दुनिया भर के भरोसेमंद स्रोत पढ़कर लंबे, समझाने वाले लेख लिखता है; संपादक की मंज़ूरी के बिना कुछ भी प्रकाशित नहीं होता।",
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
  };
}
const COLS = `id, beat, headline, dek, body, caption, photo, author, published_at, updated_at, en, hi, sources`;

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

// ---- local checking (CK_SAMPLE=1): real PIB stories of 22 Oct stand in for articles ----

const SAMPLE_BEATS: Record<string, Beat> = {
  p2326691: "ai", p2326879: "science", p2326762: "science", p2326728: "science", p2326873: "tech", p2326850: "tech", p2326779: "tech",
  p2326600: "politics", p2326576: "politics", p2326774: "politics", p2326646: "politics", p2326534: "politics", p2326734: "politics",
};
let sampleCache: Feature[] | null = null;
function sampleFeatures(): Feature[] {
  if (sampleCache) return sampleCache;
  const order = Object.keys(SAMPLE_BEATS);
  sampleCache = sample().stories.filter((s) => s.id in SAMPLE_BEATS)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map((s, i): Feature => {
      const paras = s.body.split(/\n\s*\n/).filter(Boolean);
      // a subheading after the second paragraph, as long articles have
      const body = paras.length > 3 ? [...paras.slice(0, 2), `## ${s.kicker || s.deck.split(/[.,:]/)[0]}`, ...paras.slice(2)].join("\n\n") : paras.join("\n\n");
      const at = new Date(Date.parse("2026-10-27T12:00:00Z") - i * 7 * 3600_000).toISOString();
      return { id: s.id, beat: SAMPLE_BEATS[s.id], headline: s.headline, dek: s.deck, body, caption: s.caption, photo: s.photo,
               author: i % 4 === 3 ? "editor" : "desk", publishedAt: at, updatedAt: at, en: null, hi: null,
               sources: s.source ? [{ name: s.source.name, url: s.source.url, trust: "official" }] : [] };
    });
  return sampleCache;
}
