// The paper's own chrome for any day: the masthead (page 1), running headers
// (inner pages, last page) and the legal footer, as the printed art with the
// day's parts set on it -- issue number, date and weekday, page number.
// The art and the exact position/font/baseline of every changing field come
// from the publication profile's chrome file (for Capital Kranti, made by
// scripts/mock_backend/chrome_assets.py from the 8 August issue).
import { readFileSync } from "node:fs";
import type { Element, TextElement } from "@ck/shared/contract";
import { profile, profilePath } from "../profile.ts";
import { elementText, topFor, type Measurer } from "../layout/measure.ts";
import { GAP } from "../layout/typography.ts";

interface Field {
  x: number; y: number; width: number; height: number;
  font: string; size: number; lineHeight: number; color: string; hScale: number; printed: string;
  /** as printed: the source font, its size and baseline, and the pen's start */
  printedFont?: string; printedSize?: number; baseline?: number; left?: number;
}
interface Role {
  art: { url: string; x: number; y: number; width: number; height: number };
  bodyTop: number;
  bodyBottom?: number;
  footer?: { url: string; x: number; y: number; width: number; height: number };
  /** the rule across the foot of the page, under the body (the last page's is in its footer art) */
  rule?: { x1: number; x2: number; y: number; width: number; color: string };
  fields: Record<string, Field>;
}
interface Template {
  page: { width: number; height: number };
  roles: Record<"first" | "inner" | "last", Role>;
  /** profile font for each printed source font */
  fontMap?: Record<string, string>;
}

const template: Template = JSON.parse(readFileSync(profilePath(profile.chrome), "utf8"));

const DIGITS: Record<string, string> = { gujarati: "૦૧૨૩૪૫૬૭૮૯", "arabic-indic": "۰۱۲۳۴۵۶۷۸۹", latin: "0123456789" };

/** Numbers in the paper's own digits. */
export const localDigits = (v: string | number) =>
  String(v).replace(/[0-9]/g, (d) => DIGITS[profile.language.digits][Number(d)]);

/** The paper's date line for an ISO date, from the profile's pattern. */
export function dateLine(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const pad = (n: number) => String(n).padStart(2, "0");
  return profile.language.dateLine
    .replace("{dd}", localDigits(pad(d))).replace("{mm}", localDigits(pad(m))).replace("{yyyy}", localDigits(y))
    .replace("{weekday}", profile.language.weekdays[day]);
}

export const PAGE_SIZE = template.page;

async function field(f: Field, id: string, text: string, m?: Measurer): Promise<TextElement> {
  const font = f.printedFont ? template.fontMap?.[f.printedFont] : undefined;
  if (m && font && profile.fonts[font] && f.printedSize && f.baseline !== undefined && f.left !== undefined) {
    // the paper's own font, at the printed size, on the printed baseline
    const size = f.printedSize;
    const lineHeight = Math.round(size * 1.25 * 100) / 100;
    const [ink] = await m.ink([{ text, font, size }]);
    const [lines] = await m.breakLines([{ paras: [text], width: 1e6, font, size }]);
    return {
      id, kind: "text", x: f.left, y: topFor(f.baseline, ink.fontAscent, ink.fontDescent, lineHeight),
      // room to spare: today's text (other digits, another weekday) is not the printed width
      width: Math.round(f.width * 1.6), height: lineHeight,
      ...elementText(lines, m.isLegacy(font)), font, size, lineHeight, color: f.color, align: "left",
    };
  }
  // left-aligned from the printed start, with room to spare: today's text
  // (other digits, another weekday) is not the printed width; in a legacy
  // font, in its own glyph codes like the rest of the paper
  const legacy = m && m.isLegacy(f.font) ? elementText((await m.breakLines([{ paras: [text], width: 1e6, font: f.font, size: f.size }]))[0], true) : { text };
  return {
    id, kind: "text", x: f.x, y: f.y, width: Math.round(f.width * 1.4), height: f.height,
    ...legacy, font: f.font, size: f.size, lineHeight: f.lineHeight, color: f.color, align: "left",
    ...(f.hScale !== 1 ? { hScale: f.hScale } : {}),
  };
}

export interface ChromeResult {
  elements: Element[];
  /** The band between the chrome, where stories go (contract px). */
  bodyTop: number;
  bodyBottom: number;
}

/** Chrome for page `n` of `total`: page 1 carries the masthead, the last page
 * the last-page header and the footer, every other page the inner header.
 * `blank`: the same room kept, left empty -- a copy whose masthead, page
 * headers and footer are put in by hand afterwards (editorial/copies.ts). */
export async function chromeFor(n: number, total: number, issueDate: string, issueNumber: number, m?: Measurer,
                                opts: { blank?: boolean } = {}): Promise<ChromeResult> {
  const roleName = n === 1 ? "first" : n === total ? "last" : "inner";
  const role = template.roles[roleName];
  const els: Element[] = opts.blank ? [] : [{ id: `p${n}-chrome`, kind: "image", ...role.art, fit: "fill" }];
  const f = opts.blank ? {} as Role["fields"] : role.fields;
  if (f.issue) els.push(await field(f.issue, `p${n}-issue`, profile.language.issueLine.replace("{issue}", localDigits(issueNumber)), m));
  if (f.date) els.push(await field(f.date, `p${n}-date`, dateLine(issueDate), m));
  if (f.folio) els.push(await field(f.folio, `p${n}-folio`, localDigits(n), m));
  // a one-page paper has no "last page" header; give its last page the footer anyway
  const footer = role.footer ?? (n === total ? template.roles.last.footer : undefined);
  if (footer && !opts.blank) els.push({ id: `p${n}-footer`, kind: "image", ...footer, fit: "fill" });
  else if (role.rule && !footer) {
    const r = role.rule;
    els.push({ id: `p${n}-foot-rule`, kind: "line", x1: r.x1, y1: r.y, x2: r.x2, y2: r.y, color: r.color, width: r.width });
  }
  // the template's own foot margin, else the footer's top, else the page's
  const bottom = Math.min(role.bodyBottom ?? template.page.height, footer ? footer.y : template.page.height);
  // (the stories start a little under the header: profile spacing.underHeader)
  return { elements: els, bodyTop: role.bodyTop + GAP.underHeader, bodyBottom: bottom };
}
