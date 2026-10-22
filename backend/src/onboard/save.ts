// A new paper from a reviewed draft (onboard/extract.ts): its profile, its
// chrome template and its assets, written as publications/<id>/ -- the
// engine then builds it like any other paper (CK_PUBLICATION=<id>), in its
// own data folder (papers/<id>/) so papers never share a database.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PUBLIC_DIR, ROOT } from "../config.ts";
import type { Band, Draft } from "./extract.ts";

export interface NewPaper {
  id: string; name: string;
  /** today's issue number, to count from */
  issueNumber: number; issueDate: string; pages: number;
  draft: Draft;
  /** font files by role (body, headline, deck, caption), base64 */
  fonts: Partial<Record<"body" | "headline" | "deck" | "caption", { name: string; base64: string }>>;
  /** header art by role (first, inner, last) and the footer, PNG base64 */
  art: Partial<Record<"first" | "inner" | "last" | "footer", string>>;
  /** the engine's size for the PDF's size (a legacy font's sizes may differ; 1 = as in the PDF) */
  sizeScale?: number;
}

const LANGS: Record<string, { weekdays: string[]; dateLine: string; issueLine: string }> = {
  gu: { weekdays: ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"], dateLine: "તારીખ : {dd}-{mm}-{yyyy}, {weekday}", issueLine: "અંક : {issue}" },
  hi: { weekdays: ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"], dateLine: "दिनांक : {dd}-{mm}-{yyyy}, {weekday}", issueLine: "अंक : {issue}" },
  ur: { weekdays: ["اتوار", "پیر", "منگل", "بدھ", "جمعرات", "جمعہ", "ہفتہ"], dateLine: "{weekday}، {dd}-{mm}-{yyyy}", issueLine: "شمارہ : {issue}" },
  en: { weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"], dateLine: "{weekday} {dd}.{mm}.{yyyy}", issueLine: "No. {issue}" },
};

export async function savePaper(p: NewPaper): Promise<{ id: string; dir: string }> {
  if (!/^[a-z0-9-]{2,40}$/.test(p.id)) throw new Error("the paper's id is lower-case letters, digits and dashes (e.g. gujarat-samachar)");
  if (["capital-kranti", "dev-test", "sample-english"].includes(p.id)) throw new Error(`"${p.id}" is taken`);
  for (const role of ["body", "headline"] as const) if (!p.fonts[role]) throw new Error(`the ${role} font file is needed`);
  if (!p.art.first) throw new Error("the first page's masthead image is needed");
  const d = p.draft;
  const scale = p.sizeScale ?? 1;
  const dir = path.join(ROOT, "publications", p.id);
  const fontDir = path.join(dir, "fonts");
  const artDir = path.join(PUBLIC_DIR, "chrome", p.id);
  await mkdir(fontDir, { recursive: true });
  await mkdir(artDir, { recursive: true });
  const legacy = d.language.encoding !== "unicode";

  // fonts: each role's file; a missing deck or caption font uses the headline's or the body's
  const fonts: Record<string, unknown> = {};
  const files: Record<string, string> = {};
  for (const [role, f] of Object.entries(p.fonts)) {
    if (!f) continue;
    const file = `${role}${path.extname(f.name).toLowerCase() || ".ttf"}`;
    await writeFile(path.join(fontDir, file), Buffer.from(f.base64, "base64"));
    files[role] = file;
    fonts[`${p.id}-${role}`] = { file: `/private/${p.id}/fonts/${file}`, weight: role === "body" || role === "caption" ? 400 : 700,
      encoding: legacy ? d.language.encoding : "unicode", restricted: true, ...(legacy ? { latin: "serif-regular" } : {}) };
  }
  fonts["serif-regular"] = { file: "/fonts/LiberationSerif-Regular.ttf", weight: 400 };
  const role = (r: string, fallback: string) => (files[r] ? `${p.id}-${r}` : `${p.id}-${fallback}`);

  // the art and the chrome template (contract px, 300 dpi)
  const DPI = 300, PX = DPI / 72;
  const W = Math.round(d.page.width * PX * 100) / 100, H = Math.round(d.page.height * PX * 100) / 100;
  const art: Record<string, string> = {};
  for (const [k, b64] of Object.entries(p.art)) {
    if (!b64) continue;
    await writeFile(path.join(artDir, `${k}.png`), Buffer.from(b64, "base64"));
    art[k] = `/chrome/${p.id}/${k}.png`;
  }
  const field = (f: Band["fields"][number]) => {
    const size = f.size * scale * PX;
    const lh = Math.round(size * 1.4 * 100) / 100;
    return { x: Math.round(f.x * PX * 100) / 100, y: Math.round((f.baseline * PX - size * 1.05) * 100) / 100, width: Math.round(f.width * PX * 100) / 100,
             height: lh, font: role("headline", "body"), size: Math.round(size * 100) / 100, lineHeight: lh, color: "#231f20", hScale: 1, printed: f.text };
  };
  const roleOf = (band: Band | null, which: "first" | "inner" | "last") => {
    const b = band ?? d.bands.first;
    const url = art[which] ?? art.inner ?? art.first;
    const footer = which === "last" && art.footer && b.footerTop ? { url: art.footer, x: 0, y: b.footerTop * PX, width: W, height: H - b.footerTop * PX } : undefined;
    return { art: { url, x: 0, y: 0, width: W, height: b.top * PX }, bodyTop: Math.round((b.top + 4) * PX * 100) / 100,
             ...(footer ? { footer } : {}), fields: Object.fromEntries(b.fields.map((f) => [f.kind, field(f)])) };
  };
  const chrome = { dpi: DPI, page: { width: W, height: H }, fontMap: {}, ads: [],
    roles: { first: roleOf(d.bands.first, "first"), inner: roleOf(d.bands.inner, "inner"), last: roleOf(d.bands.last, "last") } };
  await writeFile(path.join(dir, "chrome.json"), JSON.stringify(chrome, null, 1));

  // the profile: the measured grid and type, the house's usual proportions for the rest
  const lang = LANGS[d.language.lang] ?? LANGS.en;
  const body = d.body.size * scale, pitch = d.body.pitch;
  const caps = d.headline.capByColumns.map((c) => Math.round(c * scale * 10) / 10);
  for (let k = 1; k < caps.length; k++) if (!caps[k]) caps[k] = caps[k - 1] || Math.round(body * 1.8 * 10) / 10;
  const profile = {
    id: p.id, name: p.name,
    language: { lang: d.language.lang || "en", direction: d.language.direction, digits: d.language.digits === "devanagari" ? "latin" : d.language.digits, ...lang },
    issue: { referenceDate: p.issueDate, referenceNumber: p.issueNumber, pages: p.pages },
    page: d.page, grid: d.grid, ink: "#231f20", fonts,
    type: {
      body: { font: role("body", "body"), size: Math.round(body * 100) / 100, pitch, indent: Math.round(body * 1.1 * 10) / 10,
              pitches: [pitch, pitch * 1.02, pitch * 1.04, pitch * 0.98].map((x) => Math.round(x * 100) / 100), sizes: [body, body * 0.96].map((x) => Math.round(x * 100) / 100) },
      headline: { font: role("headline", "body"), leading: 1.12, capByColumns: caps, min: Math.round(Math.max(d.headline.min * scale, body * 1.6) * 10) / 10,
                  rankScale: [1.0, 0.78, 0.62, 0.5, 0.42], maxLines: [2, 3, 3, 3, 3] },
      kicker: { font: role("deck", "headline"), ratio: 0.6, min: Math.round(body * 1.08 * 10) / 10, leading: 1.15 },
      deck: { font: role("deck", "headline"), ratio: 0.45, min: Math.round((d.deck?.size ?? body * 1.2) * scale * 10) / 10, leading: 1.15 },
      caption: { font: role("caption", "body"), size: Math.round((d.caption?.size ?? body * 0.85) * scale * 10) / 10, pitch: Math.round((d.caption?.size ?? body * 0.85) * scale * 1.5 * 10) / 10 },
    },
    spacing: { top: 2, afterKicker: 2, afterHeadline: 5, afterDeck: 5, afterPhoto: 3, afterCaption: 5, betweenStories: 8, storyRule: 0.75 },
    photo: { maxCrop: 0.15, minHeight: 80, minCols: 2, minPpi: 200, maxShare: 0.45 },
    fontLicence: "The paper's own fonts: kept on this computer only.",
    chrome: "chrome.json",
    fillers: { houseAd: [{ text: p.name, role: "headline", scale: 1 }], messages: [], maxMessages: 1, maxHouseAds: 1 },
    editorial: { workhorseModel: "openai/gpt-6-luna", leadModel: "google/gemini-3.8-flash", leadStories: 3 },
  };
  await writeFile(path.join(dir, "profile.json"), JSON.stringify(profile, null, 1));
  return { id: p.id, dir };
}
