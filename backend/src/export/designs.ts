// Other papers' designs for the copies (27 Oct: each copy goes to a paper of
// its own, 25 or more a day). A design is one PDF per paper, exported from
// CorelDRAW at the page's size (390 x 525 mm): page 1 with its title, the
// other pages with their headers (page numbers and all), the last with its
// footer. Each copy goes with one design: given in turn as they're added (the
// first to copy 1, ...), changed by hand; a design may go with many copies
// (27 Oct: a test, or a paper taking more than one). A copy
// opened or downloaded is printed on its design's pages -- its print PDF and
// its CorelDRAW PDF -- and copies made before (PDFs from elsewhere) can be put
// on theirs too, saved in a folder in Downloads.
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clip, endPath, PDFDocument, popGraphicsState, pushGraphicsState, rectangle } from "pdf-lib";
import { bandOf } from "../chrome/chrome.ts";
import { DATA_DIR, ROOT } from "../config.ts";
import { printedDate } from "../profile.ts";
import { redate } from "./redate.ts";

export const DESIGNS_DIR = DATA_DIR ? path.join(DATA_DIR, "designs") : path.join(ROOT, "backend", "data", "designs");
const LIST = path.join(DESIGNS_DIR, "pool.json");
const fileOf = (id: string) => path.join(DESIGNS_DIR, `${id}.pdf`);

export interface Design {
  id: string;
  /** the file it came from */
  name: string;
  pages: number;
  /** the issue numbers (અંક) the editor gave it, each counting on for the days after (14 Nov) */
  issueFrom?: { printed: string; number: number }[];
}
export interface Designs {
  designs: Design[];
  /** copy number -> design id */
  copies: Record<string, string>;
  /** the date a day's copies carry, where the editor changed it (day -> printed date, ISO; 14 Nov) */
  dates?: Record<string, string>;
}

export async function designsOf(): Promise<Designs> {
  if (!existsSync(LIST)) return { designs: [], copies: {} };
  return JSON.parse(await readFile(LIST, "utf8")) as Designs;
}
async function save(d: Designs) {
  await mkdir(DESIGNS_DIR, { recursive: true });
  await writeFile(LIST, JSON.stringify(d, null, 1));
}

/** A design added, given to the first copy that has none. Throws on a file that isn't a PDF. */
export async function addDesign(name: string, pdf: Uint8Array): Promise<Designs> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true }).catch(() => null);
  if (!doc?.getPageCount()) throw new Error(`${name}: not a PDF -- export it from CorelDRAW as a PDF`);
  const d = await designsOf();
  const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await mkdir(DESIGNS_DIR, { recursive: true });
  await writeFile(fileOf(id), pdf);
  d.designs.push({ id, name: name.slice(0, 160), pages: doc.getPageCount() });
  let n = 1;
  while (d.copies[String(n)]) n++;
  d.copies[String(n)] = id;
  await save(d);
  return d;
}

/** Design `id` taken out (null: all of them). */
export async function dropDesign(id: string | null): Promise<Designs> {
  const d = await designsOf();
  for (const x of d.designs) if (!id || x.id === id) await rm(fileOf(x.id), { force: true });
  d.designs = id ? d.designs.filter((x) => x.id !== id) : [];
  for (const [n, x] of Object.entries(d.copies)) if (!id || x === id) delete d.copies[n];
  await save(d);
  return d;
}

/** Copies `ns` go with design `id` (null: none). */
export async function assign(ns: number[], id: string | null): Promise<Designs> {
  const d = await designsOf();
  if (id && !d.designs.some((x) => x.id === id)) throw new Error("no such design");
  for (const n of ns) {
    if (id) d.copies[String(n)] = id;
    else delete d.copies[String(n)];
  }
  await save(d);
  return d;
}

/** Copy `n`'s design, if it has one. */
export async function designFor(n: number): Promise<Design | null> {
  const d = await designsOf();
  return d.designs.find((x) => x.id === d.copies[String(n)] && existsSync(fileOf(x.id))) ?? null;
}

const DAY_MS = 86_400_000;
/** The date `date`'s copies carry: the editor's, else the day's own. */
export const copiesDate = (d: Designs, date: string) => d.dates?.[date] ?? printedDate(date);
/** The issue number the editor gave `design` for `printed`, counted on from the latest given on or before it. */
function issueGiven(design: Design, printed: string): number | undefined {
  const from = (design.issueFrom ?? []).filter((x) => x.printed <= printed).sort((a, b) => a.printed.localeCompare(b.printed)).at(-1);
  return from ? Math.max(1, from.number + Math.round((Date.parse(printed) - Date.parse(from.printed)) / DAY_MS)) : undefined;
}

// (each design dated once a day: one design may go with many copies)
type Dated = { pdf: Uint8Array; issue: number | null };
const datedCache = new Map<string, Promise<Dated>>();
/** `design` dated for `date`'s copies: its dates, weekdays and issue number changed to the day they
 * carry (export/redate.ts; the developer, 6 Nov: designs made once keep an old date), or to the date and
 * number the editor gave them (14 Nov: "give the same aank no changing feature and date changing feature
 * in copies"); `auto`: as it would be without the editor's. */
async function dated(design: Design, date: string, auto = false): Promise<Dated> {
  const printed = auto ? printedDate(date) : copiesDate(await designsOf(), date);
  const issue = auto ? undefined : issueGiven(design, printed);
  const key = `${design.id}|${printed}|${issue ?? ""}|${(await stat(fileOf(design.id))).mtimeMs}`;
  let got = datedCache.get(key);
  if (!got) {
    if (datedCache.size > 100) datedCache.clear();
    got = readFile(fileOf(design.id)).then(async (b) => { const r = await redate(new Uint8Array(b), printed, { issue }); return { pdf: r.pdf, issue: r.issue }; })
      .catch(async () => ({ pdf: new Uint8Array(await readFile(fileOf(design.id))), issue: null }));
    datedCache.set(key, got);
  }
  return got;
}

/** What `date`'s copies carry on their designs' titles, and what they would without the editor's say:
 * the date, and each design's issue number (null: none found on it), with the copies it goes with. */
export async function titlesOf(date: string) {
  const d = await designsOf();
  const designs = [];
  for (const x of d.designs.filter((x) => existsSync(fileOf(x.id)))) {
    const copies = Object.entries(d.copies).filter(([, id]) => id === x.id).map(([n]) => Number(n)).sort((a, b) => a - b);
    designs.push({ id: x.id, name: x.name, copies, issue: (await dated(x, date)).issue, auto: (await dated(x, date, true)).issue });
  }
  return { date: copiesDate(d, date), auto: printedDate(date), designs };
}

/** The editor's date for `date`'s copies (that day alone) and issue numbers for designs (that day and
 * those after it) kept; why not, or null. */
export async function setTitles(date: string, want: { date?: string; issues?: Record<string, number> }): Promise<string | null> {
  const d = await designsOf();
  if (want.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(want.date)) return "not a date";
  for (const [id, n] of Object.entries(want.issues ?? {})) {
    if (!d.designs.some((x) => x.id === id)) return "no such design";
    if (!(Number.isInteger(n) && n > 0)) return "not an issue number";
  }
  if (want.date !== undefined) {
    d.dates = Object.fromEntries(Object.entries(d.dates ?? {}).filter(([day]) => day !== date));
    if (want.date !== printedDate(date)) d.dates[date] = want.date;
  }
  // (the date saved first: a design's number now is read on it)
  await save(d);
  const printed = copiesDate(d, date);
  for (const [id, n] of Object.entries(want.issues ?? {})) {
    const x = d.designs.find((y) => y.id === id)!;
    if (n === (await dated(x, date)).issue && !(x.issueFrom ?? []).some((e) => e.printed > printed)) continue;
    // (the days after count on from it: a number given for a later day before goes)
    x.issueFrom = [...(x.issueFrom ?? []).filter((e) => e.printed < printed), { printed, number: n }];
  }
  await save(d);
  return null;
}

/** `pdf` (a copy, print or CorelDRAW) with `design`'s pages laid over its own,
 * page for page: one of the page's shape over the whole page, any other fitted
 * in from the top -- shown only above and below where the copy's stories go
 * (27 Oct: a paper's PageMaker design carried a white box that, laid over the
 * copy, blanked the foot of page 3's first columns; laid under, the print PDF's
 * white page hid the design). */
export async function withDesign(pdf: Uint8Array, design: Design, date?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const src = await PDFDocument.load(date ? (await dated(design, date)).pdf : await readFile(fileOf(design.id)), { ignoreEncryption: true });
  const have = src.getPageCount(), count = doc.getPageCount();
  for (const [i, page] of doc.getPages().entries()) {
    // page for page; a 4-page design on the 8-page paper (4 Nov): its last page (the footer) on the last,
    // its first three on the first three, and the pages between left with the copy's own (no wrong page numbers)
    const at = have >= count ? i : i === count - 1 ? have - 1 : i < have - 1 ? i : -1;
    if (at < 0) continue;
    const from = src.getPage(at);
    const crop = from.getCropBox();
    const art = await doc.embedPage(from, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height });
    const { width: W, height: H } = page.getSize();
    // the room outside the stories: the band above them and the band below
    const band = bandOf(i + 1, doc.getPageCount());
    const k = H / band.page.height;
    page.pushOperators(pushGraphicsState(), rectangle(0, H - band.top * k, W, band.top * k), rectangle(0, 0, W, H - band.bottom * k), clip(), endPath());
    if (Math.abs(art.width / art.height - W / H) < 0.03) page.drawPage(art, { x: 0, y: 0, width: W, height: H });
    else {
      const s = Math.min(W / art.width, H / art.height);
      page.drawPage(art, { x: (W - art.width * s) / 2, y: H - art.height * s, width: art.width * s, height: art.height * s });
    }
    page.pushOperators(popGraphicsState());
  }
  return doc.save();
}

/** The folder in Downloads copies put on their designs are saved in. */
export function outFolder(date: string): string {
  const [y, m, d] = date.split("-");
  return path.join(os.homedir(), "Downloads", `Capital Kranti - copies with designs - ${d}-${m}-${y}`);
}

/** A copy made before (`pdf`, from file `name`) put on copy `n`'s design, saved in `date`'s folder. */
export async function stampFile(date: string, n: number, name: string, pdf: Uint8Array): Promise<string> {
  const design = await designFor(n);
  if (!design) throw new Error(`copy ${n} has no design yet`);
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true }).catch(() => null);
  if (!doc?.getPageCount()) throw new Error(`${name}: not a PDF`);
  const dir = outFolder(date);
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, path.basename(name).replace(/\.pdf$/i, "") + ".pdf");
  await writeFile(out, await withDesign(pdf, design, date));
  return out;
}
