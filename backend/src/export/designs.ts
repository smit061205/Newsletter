// Other papers' designs for the copies (27 Oct: each copy goes to a paper of
// its own, 25 or more a day). A design is one PDF per paper, exported from
// CorelDRAW at the page's size (390 x 525 mm): page 1 with its title, the
// other pages with their headers (page numbers and all), the last with its
// footer. Each design goes with one copy and each copy with one design: given
// in turn as they're added (the first to copy 1, ...), changed by hand. A copy
// opened or downloaded is printed on its design's pages -- its print PDF and
// its CorelDRAW PDF -- and copies made before (PDFs from elsewhere) can be put
// on theirs too, saved in a folder in Downloads.
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { DATA_DIR, ROOT } from "../config.ts";

export const DESIGNS_DIR = DATA_DIR ? path.join(DATA_DIR, "designs") : path.join(ROOT, "backend", "data", "designs");
const LIST = path.join(DESIGNS_DIR, "pool.json");
const fileOf = (id: string) => path.join(DESIGNS_DIR, `${id}.pdf`);

export interface Design {
  id: string;
  /** the file it came from */
  name: string;
  pages: number;
}
export interface Designs {
  designs: Design[];
  /** copy number -> design id */
  copies: Record<string, string>;
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

/** Copy `n` goes with design `id` (null: none). A design already with another
 * copy changes places: that copy takes `n`'s old one -- one design per copy. */
export async function assign(n: number, id: string | null): Promise<Designs> {
  const d = await designsOf();
  if (id && !d.designs.some((x) => x.id === id)) throw new Error("no such design");
  const had = d.copies[String(n)];
  const other = id ? Object.keys(d.copies).find((k) => d.copies[k] === id && k !== String(n)) : undefined;
  if (other) { if (had) d.copies[other] = had; else delete d.copies[other]; }
  if (id) d.copies[String(n)] = id;
  else delete d.copies[String(n)];
  await save(d);
  return d;
}

/** Copy `n`'s design, if it has one. */
export async function designFor(n: number): Promise<Design | null> {
  const d = await designsOf();
  return d.designs.find((x) => x.id === d.copies[String(n)] && existsSync(fileOf(x.id))) ?? null;
}

/** `pdf` (a copy, print or CorelDRAW) with `design`'s pages laid over its own,
 * page for page: one of the page's shape over the whole page, any other fitted
 * in from the top. */
export async function withDesign(pdf: Uint8Array, design: Design): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const src = await PDFDocument.load(await readFile(fileOf(design.id)), { ignoreEncryption: true });
  for (const [i, page] of doc.getPages().entries()) {
    if (i >= src.getPageCount()) break;
    const from = src.getPage(i);
    const crop = from.getCropBox();
    const art = await doc.embedPage(from, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height });
    const { width: W, height: H } = page.getSize();
    if (Math.abs(art.width / art.height - W / H) < 0.03) { page.drawPage(art, { x: 0, y: 0, width: W, height: H }); continue; }
    const s = Math.min(W / art.width, H / art.height);
    page.drawPage(art, { x: (W - art.width * s) / 2, y: H - art.height * s, width: art.width * s, height: art.height * s });
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
  await writeFile(out, await withDesign(pdf, design));
  return out;
}
