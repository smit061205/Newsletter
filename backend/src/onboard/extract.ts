// A newspaper's profile, drafted from one or more of its PDF issues (the
// "Add a newspaper" screen): page size, column grid, body size and line
// pitch, the headline ladder by column span, the fonts by role, the
// language, and the header and footer bands with their changing fields
// (date, issue number, page number). A draft for the editor to review over
// a sample page -- not a finished profile: the art for the bands and the
// font files come from the paper, and a legacy (pre-Unicode) font's text
// can't be read, so its language is asked for.
import { BharatiEncoder } from "../fonts/bharati.ts";
import { readPdfText, type PdfPage, type TextItem } from "./pdftext.ts";

export interface Draft {
  page: { width: number; height: number };
  grid: { left: number; columns: number; column: number; gutter: number };
  body: { font: string; size: number; pitch: number };
  headline: { font: string; capByColumns: number[]; min: number };
  deck: { font: string; size: number } | null;
  caption: { font: string; size: number } | null;
  fonts: { name: string; chars: number; sizes: number[]; roles: string[]; unicode: boolean }[];
  language: { script: "gujarati" | "devanagari" | "arabic" | "latin" | "unknown"; lang: string; direction: "ltr" | "rtl"; digits: string; readable: boolean; encoding: string };
  bands: { first: Band; inner: Band | null; last: Band | null };
  pages: number;
  notes: string[];
}
export interface Band { top: number; bottom: number; footerTop: number | null; fields: { kind: "date" | "issue" | "folio"; x: number; baseline: number; width: number; size: number; font: string; text: string }[] }

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** The value with most weight, values within `tol` counted together. */
function mode(pairs: [number, number][], tol: number): number {
  let best = 0, bestW = -1;
  for (const [v] of pairs) {
    const w = pairs.filter(([u]) => Math.abs(u - v) <= tol).reduce((a, [, k]) => a + k, 0);
    if (w > bestW) { bestW = w; best = v; }
  }
  return best;
}

/** Text items joined into lines: same font size, same baseline, touching. */
function lines(items: TextItem[]): TextItem[] {
  const out: TextItem[] = [];
  const sorted = [...items].sort((a, b) => a.page - b.page || a.baseline - b.baseline || a.x - b.x);
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && last.page === it.page && Math.abs(last.baseline - it.baseline) < 0.6 && Math.abs(last.size - it.size) < 0.3
        && it.x - (last.x + last.width) < it.size * 0.9 && it.x >= last.x) {
      last.width = it.x + it.width - last.x;
      last.text += (it.x - (last.x + last.width) > it.size * 0.2 ? " " : "") + it.text;
    } else out.push({ ...it });
  }
  return out;
}

function scriptOf(text: string): Draft["language"]["script"] {
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const c = { gujarati: count(/[઀-૿]/g), devanagari: count(/[ऀ-ॿ]/g), arabic: count(/[؀-ۿݐ-ݿ]/g), latin: count(/[A-Za-z]/g) };
  const best = (Object.entries(c) as [Draft["language"]["script"], number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 50 ? best[0] : "unknown";
}

export async function extractDraft(pdfs: Uint8Array[]): Promise<Draft> {
  const all: PdfPage[] = [];
  for (const b of pdfs) all.push(...await readPdfText(b));
  if (!all.length) throw new Error("no pages in the PDF");
  const notes: string[] = [];
  const page = { width: round(median(all.map((p) => p.width)), 2), height: round(median(all.map((p) => p.height)), 2) };
  const items = all.flatMap((p) => p.items.map((i) => ({ ...i })));
  const ls = lines(items);

  // body: the size most text is set in, and its font
  const bySize: [number, number][] = ls.map((l) => [round(l.size, 1), l.text.length]);
  const bodySize = mode(bySize, 0.15);
  const isBody = (l: TextItem) => Math.abs(l.size - bodySize) <= 0.3;
  const body = ls.filter(isBody);
  const fontChars = (xs: TextItem[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x.font, (m.get(x.font) ?? 0) + x.text.length);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const bodyFont = fontChars(body)[0]?.[0] ?? "";

  // the grid: where body lines start (columns' left edges) and how wide full lines run
  const starts = new Map<number, number>();
  for (const l of body) { const k = Math.round(l.x); starts.set(k, (starts.get(k) ?? 0) + 1); }
  const clusters: { x: number; n: number }[] = [];
  for (const [x, n] of [...starts].sort((a, b) => a[0] - b[0])) {
    const c = clusters[clusters.length - 1];
    if (c && x - c.x <= 4) { c.x = (c.x * c.n + x * n) / (c.n + n); c.n += n; } else clusters.push({ x, n });
  }
  const strong = clusters.filter((c) => c.n >= Math.max(6, body.length * 0.015)).map((c) => c.x);
  // full lines: within 3% of the widest line starting at that edge
  const widths = strong.flatMap((x) => {
    const at = body.filter((l) => Math.abs(l.x - x) <= 4).map((l) => l.width);
    const max = Math.max(...at);
    return at.filter((w) => w >= max * 0.97);
  });
  const column = median(widths);
  // column pitch: the most common step between neighbouring edges
  const steps = strong.slice(1).map((x, i) => x - strong[i]).filter((d) => d > column * 0.9);
  const pitchStep = steps.length ? mode(steps.map((d) => [d, 1]), 2) : column * 1.1;
  const gutter = Math.max(0, pitchStep - column);
  const left = strong[0] ?? 0;
  const columns = Math.max(1, Math.round((page.width - 2 * left + gutter) / (column + gutter)));
  if (strong.length < columns) notes.push(`only ${strong.length} column edges seen for ${columns} columns: check the grid over the sample page`);

  // line pitch: the step between baselines in one column
  const deltas: number[] = [];
  for (const x of strong) {
    const col = body.filter((l) => Math.abs(l.x - x) <= column).sort((a, b) => a.page - b.page || a.baseline - b.baseline);
    for (let k = 1; k < col.length; k++) {
      const d = col[k].baseline - col[k - 1].baseline;
      if (col[k].page === col[k - 1].page && d > bodySize * 0.9 && d < bodySize * 1.9) deltas.push(d);
    }
  }
  const pitch = mode(deltas.map((d) => [round(d, 2), 1]), 0.15) || bodySize * 1.2;

  // where stories start on each page: the first body line, or a headline
  // sitting right above body text in the same columns -- above that is the
  // header band (masthead, running head), whose text is chrome, not news
  // the faces headlines are set in: any that heads body text in the middle of
  // a page somewhere in the paper (a masthead's display faces never do)
  const columnBody = (pl: TextItem[]) => pl.filter(isBody).filter((l, _, ls2) => ls2.some((m) => Math.abs(m.baseline - l.baseline - pitch) < pitch * 0.3 && Math.abs(m.x - l.x) < column));
  const heads0 = (l: TextItem) => l.size >= bodySize * 1.5 && l.size <= bodySize * 6;
  const above = (h: TextItem, pb: TextItem[]) => pb.some((b) => b.baseline > h.baseline && b.baseline - h.baseline < h.size * 1.6 + pitch * 5 && b.x < h.x + h.width && b.x + b.width > h.x);
  const headFaces = new Set<string>();
  for (const p of all) {
    const pl = lines(p.items), pb = columnBody(pl);
    for (const h of pl.filter(heads0)) if (h.baseline > p.height * 0.3 && above(h, pb)) headFaces.add(h.font);
  }
  const storyTop = new Map<number, number>();
  for (const p of all) {
    const pl = lines(p.items);
    // body text in a column: a line with the next one a pitch below it (a
    // lone body-size line in a masthead strip doesn't start a story)
    const pb = columnBody(pl);
    let top = Math.min(...pb.map((l) => l.baseline - l.size), p.height);
    for (const h of pl.filter((l) => heads0(l) && headFaces.has(l.font))) if (above(h, pb)) top = Math.min(top, h.baseline - h.size);
    storyTop.set(p.number + all.indexOf(p) * 1000, top);
  }
  const topOf = (p: PdfPage) => storyTop.get(p.number + all.indexOf(p) * 1000) ?? 0;
  const pageOfItem = (l: TextItem) => all.find((p) => p.items.length && p.number === l.page) ?? all[0];
  const inChrome = (l: TextItem) => l.baseline < topOf(pageOfItem(l));

  // headlines: large text below the header band; the largest size for each column span
  const span = (w: number) => Math.min(columns, Math.max(1, Math.round((w + gutter) / (column + gutter))));
  const heads = ls.filter((l) => l.size >= bodySize * 1.5 && l.text.trim().length > 3 && !inChrome(l));
  // per span, a high (not the highest) headline size: one oddly large line
  // shouldn't set the ceiling; a wider story allows at least as large
  const bySpan = new Map<number, number[]>();
  for (const h of heads) { const k = span(h.width); bySpan.set(k, [...(bySpan.get(k) ?? []), h.size]); }
  const p80 = (xs: number[]) => { const t = [...xs].sort((a, b) => a - b); return t[Math.min(t.length - 1, Math.floor(t.length * 0.8))]; };
  const capByColumns = Array.from({ length: columns + 1 }, (_, k) => (bySpan.has(k) ? round(p80(bySpan.get(k)!), 1) : 0));
  for (let k = 2; k <= columns; k++) capByColumns[k] = Math.max(capByColumns[k], capByColumns[k - 1]);
  const headFont = fontChars(heads)[0]?.[0] ?? bodyFont;
  const decks = ls.filter((l) => l.size > bodySize * 1.12 && l.size < bodySize * 1.5);
  const caps = ls.filter((l) => l.size < bodySize * 0.95 && l.size > bodySize * 0.6);

  // language: from text the fonts map to Unicode -- but a legacy
  // (pre-Unicode) font maps its codes to Latin-1 junk ("Mk{ksLkku"): known
  // families are recognised (Bharati: Gujarati, which the engine can encode),
  // others are reported for the editor to choose
  const LEGACY: [RegExp, Draft["language"]["script"], string][] = [
    [/bharati|gopika|maruti|shree.?guj|lmg/i, "gujarati", "bharati"],
    [/kruti|devlys|chanakya|shusha/i, "devanagari", ""],
    [/inpage|jameel|noori.*(?!unicode)/i, "arabic", ""],
  ];
  const junk = (t: string) => (t.match(/[{|}~\u0080-\u00ff]/g) ?? []).length / Math.max(1, t.replace(/\s/g, "").length);
  const legacyOf = (font: string, sample: string) => LEGACY.find(([re]) => re.test(font)) ?? (junk(sample) > 0.08 ? [/./, "unknown", ""] as const : null);
  const bodyLegacy = legacyOf(bodyFont, body.slice(0, 200).map((l) => l.text).join(" "));
  const readable = items.filter((i) => i.unicode && !legacyOf(i.font, i.text)).map((i) => i.text).join(" ");
  const script = bodyLegacy ? bodyLegacy[1] : scriptOf(readable);
  const encoding = bodyLegacy?.[2] || "unicode";
  const LANG = { gujarati: ["gu", "ltr", "gujarati"], devanagari: ["hi", "ltr", "devanagari"], arabic: ["ur", "rtl", "arabic-indic"], latin: ["en", "ltr", "latin"], unknown: ["", "ltr", "latin"] } as const;
  if (bodyLegacy && encoding) notes.push(`the body font (${bodyFont}) is a legacy ${script} font the engine knows how to set (${encoding} encoding); its sizes as the PDF gives them may need scaling to the engine's (Capital Kranti's Gopika: x0.8)`);
  else if (bodyLegacy) notes.push(`the body font (${bodyFont}) is pre-Unicode: its text can't be read or set -- ask the paper for Unicode fonts, or choose the language and a conversion table`);

  // header and footer bands: above the first body/headline text and below the last, page by page
  // "Issue: 196" and its kin -- not a registration number ("RNI No.")
  const ISSUE = /^\s*(અંક|अंक|Issue|No\.?|Vol|شمارہ)\s*[:.]?\s*[\d૦-૯०-९۰-۹]/i;
  // the same labels in the paper's legacy encoding, when the engine knows it
  const issueLegacy: string[] = encoding === "bharati"
    ? ["અંક", "અંક :"].map((w) => { try { return new BharatiEncoder().encode(w).text; } catch { return ""; } }).filter(Boolean) : [];
  const bandOf = (p: PdfPage): Band => {
    const pl = lines(p.items);
    // the header: rows packed together from the top, up to the first real gap
    const head: TextItem[] = [];
    for (const l of pl.filter((l) => l.baseline < topOf(p)).sort((a, b) => a.baseline - b.baseline)) {
      const foot = head.length ? Math.max(...head.map((h) => h.baseline + h.size * 0.35)) : 0;
      if (head.length && l.baseline - l.size - foot > bodySize * 1.5) break;
      head.push(l);
    }
    // (the band's foot is worked out once its fields are known, below)
    // a footer: a wide line (or lines) of small print at the page foot, under the last column text
    const lastBody = Math.max(...columnBody(pl).map((l) => l.baseline), 0);
    const foot = pl.filter((l) => l.baseline > Math.max(lastBody + pitch, p.height * 0.9) && l.size < bodySize * 1.2 && l.width > p.width * 0.4);
    const footerTop = foot.length ? Math.min(...foot.map((l) => l.baseline - l.size)) - 3 : null;
    const fields: Band["fields"] = [];
    for (const l of head) {
      const t = l.text;
      const field = (kind: Band["fields"][number]["kind"]) => fields.push({ kind, x: round(l.x, 2), baseline: round(l.baseline, 2), width: round(l.width, 2), size: round(l.size, 2), font: l.font, text: t });
      if (/\d{1,2}\s*[-./]\s*\d{1,2}\s*[-./]\s*\d{2,4}|[૦-૯]{1,2}\s*[-./]\s*[૦-૯]{1,2}|[०-९]{1,2}\s*[-./]/.test(t)) field("date");
      else if (ISSUE.test(t) || issueLegacy.some((w) => t.trimStart().startsWith(w))) field("issue");
      else if (/^\s*[\d૦-૯०-९۰-۹]{1,2}\s*$/.test(t)) field("folio");
    }
    // the band ends under its own text (stories may start lower, under a
    // photo) -- under the row with its fields when it has any (a section
    // title right under a running head is content, not chrome)
    const lastFieldRow = fields.length ? Math.max(...fields.map((f) => f.baseline)) + 3 : Infinity;
    const rows = head.filter((l) => l.baseline <= lastFieldRow);
    const top = rows.length ? Math.max(...rows.map((l) => l.baseline + l.size * 0.35)) + 2 : 0;
    // top: the band's foot, where stories may start
    return { top: round(top), bottom: round(page.height), footerTop: footerTop === null ? null : round(footerTop), fields };
  };
  const pages = all.length / pdfs.length;
  const first = bandOf(all[0]);
  const inner = pages > 2 ? bandOf(all[1]) : null;
  const last = pages > 1 ? bandOf(all[pages - 1]) : null;
  if (!first.fields.length) notes.push("no date or issue number found in the masthead: place them over the sample page");

  const fonts = fontChars(ls).map(([name, chars]) => {
    const sizes = [...new Set(ls.filter((l) => l.font === name).map((l) => round(l.size, 1)))].sort((a, b) => b - a).slice(0, 8);
    const roles = [name === bodyFont ? "body" : "", name === headFont ? "headline" : "", decks.some((d) => d.font === name) ? "deck" : "",
                   caps.some((c) => c.font === name) ? "caption" : ""].filter(Boolean);
    return { name, chars, sizes, roles, unicode: items.some((i) => i.font === name && i.unicode) };
  });

  return {
    page, grid: { left: round(left, 2), columns, column: round(column, 2), gutter: round(gutter, 3) },
    body: { font: bodyFont, size: round(bodySize, 2), pitch: round(pitch, 2) },
    headline: { font: headFont, capByColumns, min: round(Math.min(...heads.map((h) => h.size), bodySize * 1.6), 1) },
    deck: decks.length ? { font: fontChars(decks)[0][0], size: round(median(decks.map((d) => d.size)), 1) } : null,
    caption: caps.length ? { font: fontChars(caps)[0][0], size: round(median(caps.map((c) => c.size)), 1) } : null,
    fonts,
    language: { script, lang: LANG[script][0], direction: LANG[script][1], digits: LANG[script][2], readable: script !== "unknown" && !bodyLegacy, encoding },
    bands: { first, inner, last },
    pages,
    notes,
  };
}
