// Dates, times and numbers as the site shows them: India time always (the
// page is rendered on a server abroad), Gujarati digits in Gujarati (Hindi uses
// the figures Hindi papers print: 0-9).
import type { Lang } from "./types.ts";

const GU = "૦૧૨૩૪૫૬૭૮૯";
export const num = (n: number | string, lang: Lang) => (lang === "gu" ? String(n).replace(/\d/g, (d) => GU[+d]) : String(n));

const MONTHS_GU = ["જાન્યુઆરી", "ફેબ્રુઆરી", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઓગસ્ટ", "સપ્ટેમ્બર", "ઓક્ટોબર", "નવેમ્બર", "ડિસેમ્બર"];
const DAYS_GU = ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const DAYS_HI = ["रविवार", "सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार"];

/** The moment in India: its date parts. */
function ist(iso: string) {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

/** "૨૨ ઓક્ટોબર ૨૦૨૬" / "22 October 2026" / "22 अक्टूबर 2026"; a bare YYYY-MM-DD is that day. */
export function dateText(isoOrDay: string, lang: Lang, withDay = false) {
  const t = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDay) ? ist(`${isoOrDay}T06:30:00Z`) : ist(isoOrDay);
  const body = lang === "gu" ? `${num(t.d, lang)} ${MONTHS_GU[t.m]} ${num(t.y, lang)}` : `${t.d} ${(lang === "hi" ? MONTHS_HI : MONTHS_EN)[t.m]} ${t.y}`;
  return withDay ? `${(lang === "gu" ? DAYS_GU : lang === "hi" ? DAYS_HI : DAYS_EN)[t.wd]}, ${body}` : body;
}

/** "સાંજે ૭:૩૦" / "7:30 pm". */
export function timeText(iso: string, lang: Lang) {
  const t = ist(iso);
  const h12 = ((t.h + 11) % 12) + 1, mm = String(t.min).padStart(2, "0");
  if (lang === "en") return `${h12}:${mm} ${t.h < 12 ? "am" : "pm"}`;
  if (lang === "hi") return `${t.h < 12 ? "सुबह" : t.h < 16 ? "दोपहर" : t.h < 20 ? "शाम" : "रात"} ${h12}:${mm}`;
  const part = t.h < 12 ? "સવારે" : t.h < 16 ? "બપોરે" : t.h < 20 ? "સાંજે" : "રાત્રે";
  return `${part} ${num(`${h12}:${mm}`, lang)}`;
}

/** "૧૨ મિનિટ પહેલાં" / "12 min ago" / "12 मिनट पहले" within 12 hours, "ગઈકાલે" for
 * yesterday, else the date (null: just now handled as minutes). The reader's clock decides. */
export function ago(iso: string, lang: Lang): string | null {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s) || s < -300) return null;
  const n = (x: number) => num(Math.max(1, Math.floor(x)), lang);
  if (s < 3600) return { gu: `${n(s / 60)} મિનિટ પહેલાં`, en: `${n(s / 60)} min ago`, hi: `${n(s / 60)} मिनट पहले` }[lang];
  if (s < 12 * 3600) return { gu: `${n(s / 3600)} કલાક પહેલાં`, en: `${n(s / 3600)} h ago`, hi: `${n(s / 3600)} घंटे पहले` }[lang];
  const day = (d: Date) => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const today = day(new Date()), then = day(new Date(iso));
  if (then === today) return timeText(iso, lang);
  const yesterday = day(new Date(Date.now() - 86400_000));
  if (then === yesterday) return { gu: "ગઈકાલે", en: "Yesterday", hi: "कल" }[lang];
  return shortDate(iso, lang);
}

const SHORT_GU = ["જાન્યુ.", "ફેબ્રુ.", "માર્ચ", "એપ્રિલ", "મે", "જૂન", "જુલાઈ", "ઓગ.", "સપ્ટે.", "ઓક્ટો.", "નવે.", "ડિસે."];
const SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SHORT_HI = ["जन.", "फ़र.", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अग.", "सित.", "अक्टू.", "नव.", "दिस."];
/** "૨૨ ઓક્ટો." (the year only when it isn't this one). */
export function shortDate(iso: string, lang: Lang) {
  const t = ist(iso);
  const m = (lang === "gu" ? SHORT_GU : lang === "hi" ? SHORT_HI : SHORT_EN)[t.m];
  const year = t.y !== ist(new Date().toISOString()).y ? ` ${num(t.y, lang)}` : "";
  return `${num(t.d, lang)} ${m}${year}`;
}

/** Today in India, YYYY-MM-DD. */
export const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Reading time in minutes (about 150 Gujarati words a minute). */
export const minutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).length / 150));

export const paragraphs = (body: string) => body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
