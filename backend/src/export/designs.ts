// Other papers' designs for the copies: each paper's title (page 1), its page
// headers (one per page, numbers and all) and its footer (the last page), as
// PDFs exported from CorelDRAW. A copy given a paper is printed onto them when
// it's opened or downloaded -- its print PDF and its CorelDRAW PDF -- so nobody
// pastes them in by hand. Which paper each copy goes to is kept by copy number
// (copy 3 goes to the same paper every day until it's changed).
//
// A design is fitted into the room the copy left empty for it (chrome.json's
// masthead, header and footer), top-aligned (the footer bottom-aligned) and
// centred; a design the size of a whole page is laid over the whole page.
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { designRoom } from "../chrome/chrome.ts";
import { DATA_DIR, ROOT } from "../config.ts";

export const DESIGNS_DIR = DATA_DIR ? path.join(DATA_DIR, "designs") : path.join(ROOT, "backend", "data", "designs");
const LIST = path.join(DESIGNS_DIR, "designs.json");

/** "title" (page 1), "header-N" (page N's header), "footer" (the last page). */
export type Slot = string;
export const isSlot = (s: string) => s === "title" || s === "footer" || /^header-([2-9]|[1-9]\d)$/.test(s);

export interface Design {
  id: string;
  name: string;
  /** slot -> when its PDF was added */
  slots: Record<Slot, string>;
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
const slotFile = (id: string, slot: Slot) => path.join(DESIGNS_DIR, id, `${slot}.pdf`);

/** A new paper's designs (no PDFs yet), or `id`'s renamed. */
export async function nameDesign(name: string, id?: string): Promise<Design> {
  const d = await designsOf();
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) throw new Error("the paper needs a name");
  let got = id ? d.designs.find((x) => x.id === id) : undefined;
  if (id && !got) throw new Error("no such paper");
  if (got) got.name = clean;
  else d.designs.push(got = { id: `d${Date.now().toString(36)}`, name: clean, slots: {} });
  await save(d);
  return got;
}

export async function dropDesign(id: string) {
  const d = await designsOf();
  d.designs = d.designs.filter((x) => x.id !== id);
  for (const [n, x] of Object.entries(d.copies)) if (x === id) delete d.copies[n];
  await save(d);
  await rm(path.join(DESIGNS_DIR, id), { recursive: true, force: true });
}

/** `slot`'s PDF for paper `id` (null takes it away). Throws on a file that isn't a PDF. */
export async function putSlot(id: string, slot: Slot, pdf: Uint8Array | null) {
  const d = await designsOf();
  const got = d.designs.find((x) => x.id === id);
  if (!got) throw new Error("no such paper");
  if (!isSlot(slot)) throw new Error("no such part of the page");
  if (pdf) {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true }).catch(() => null);
    if (!doc?.getPageCount()) throw new Error("that file isn't a PDF: export it from CorelDRAW as a PDF");
    await mkdir(path.dirname(slotFile(id, slot)), { recursive: true });
    await writeFile(slotFile(id, slot), pdf);
    got.slots[slot] = new Date().toISOString();
  } else {
    await rm(slotFile(id, slot), { force: true });
    delete got.slots[slot];
  }
  await save(d);
}

/** Copy `n` goes to paper `id` (null: to none, its room left empty). */
export async function assign(n: number, id: string | null) {
  const d = await designsOf();
  if (id && !d.designs.some((x) => x.id === id)) throw new Error("no such paper");
  if (id) d.copies[String(n)] = id;
  else delete d.copies[String(n)];
  await save(d);
}

/** The paper copy `n` goes to, if it has one with any design added. */
export async function designFor(n: number): Promise<Design | null> {
  const d = await designsOf();
  const got = d.designs.find((x) => x.id === d.copies[String(n)]);
  return got && Object.keys(got.slots).length ? got : null;
}

/** `pdf` (a copy, print or CorelDRAW) with `design`'s title, headers and footer on its pages. */
export async function withDesign(pdf: Uint8Array, design: Design): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPages();
  for (const [i, page] of pages.entries()) {
    const n = i + 1;
    const room = designRoom(n, pages.length);
    const parts: [Slot, typeof room.head, "top" | "bottom"][] = [[n === 1 ? "title" : `header-${n}`, room.head, "top"]];
    if (room.foot) parts.push(["footer", room.foot, "bottom"]);
    const { width: W, height: H } = page.getSize();
    const k = W / room.page.width;
    for (const [slot, box, align] of parts) {
      if (!design.slots[slot] || !existsSync(slotFile(design.id, slot))) continue;
      const src = await PDFDocument.load(await readFile(slotFile(design.id, slot)), { ignoreEncryption: true });
      const first = src.getPage(0);
      const crop = first.getCropBox();
      const art = await doc.embedPage(first, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height });
      // a whole page (390 x 525 mm, its design where it belongs): over the whole page
      if (Math.abs(art.width / art.height - W / H) < 0.02 && art.width > W * 0.5) {
        page.drawPage(art, { x: 0, y: 0, width: W, height: H });
        continue;
      }
      const [bx, by, bw, bh] = [box.x * k, box.y * k, box.width * k, box.height * k];
      const s = Math.min(bw / art.width, bh / art.height);
      const [w, h] = [art.width * s, art.height * s];
      page.drawPage(art, { x: bx + (bw - w) / 2, y: align === "top" ? H - by - h : H - by - bh, width: w, height: h });
    }
  }
  return doc.save();
}
