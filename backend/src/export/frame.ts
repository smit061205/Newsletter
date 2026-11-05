// A sister paper's title and footer (the developer, 5 Nov: the Urdu paper's own masthead,
// running heads and printer's line, made each day as a PDF of the paper's size with the
// rest of each page empty): drawn over its pages when its PDF is given out. Kept per day
// beside its database (sister.ts frameFile); the pages themselves are laid out as before,
// their masthead, heads and last page's foot left empty for it.
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { frameFile } from "../sister.ts";

/** The paper's PDF with the day's frame over each page (page by page; a page past the frame's last has none). */
export async function framed(pdf: Uint8Array, frame: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const src = await PDFDocument.load(frame);
  const n = Math.min(doc.getPageCount(), src.getPageCount());
  const pages = await doc.embedPdf(src, [...Array(n).keys()]);
  pages.forEach((p, i) => {
    const page = doc.getPage(i);
    page.drawPage(p, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  });
  return doc.save();
}

/** A sister paper's PDF for a day, with its frame if it has one. */
export async function withFrame(id: string, date: string, pdf: Uint8Array): Promise<Uint8Array> {
  const file = frameFile(id, date);
  return existsSync(file) ? framed(pdf, new Uint8Array(await readFile(file))) : pdf;
}

/** The day's frame: how many pages, if it has one. */
export async function frameInfo(id: string, date: string): Promise<{ pages: number } | null> {
  const file = frameFile(id, date);
  if (!existsSync(file)) return null;
  try { return { pages: (await PDFDocument.load(await readFile(file))).getPageCount() }; } catch { return null; }
}

/** The day's frame saved, checked first: a PDF of the paper's own page size (within 3pt). A string is what's wrong. */
export async function saveFrame(id: string, date: string, base64: string, size: { width: number; height: number }): Promise<string | null> {
  const bytes = Buffer.from(base64, "base64");
  let doc: PDFDocument;
  try { doc = await PDFDocument.load(bytes); } catch { return "That file isn't a PDF."; }
  const odd = doc.getPages().findIndex((p) => Math.abs(p.getWidth() - size.width) > 3 || Math.abs(p.getHeight() - size.height) > 3);
  if (odd >= 0) {
    const p = doc.getPage(odd);
    return `Page ${odd + 1} is ${Math.round(p.getWidth())} × ${Math.round(p.getHeight())} pt; the paper's pages are ${Math.round(size.width)} × ${Math.round(size.height)}.`;
  }
  await mkdir(path.dirname(frameFile(id, date)), { recursive: true });
  await writeFile(frameFile(id, date), bytes);
  return null;
}

/** The day's frame taken off. */
export const removeFrame = (id: string, date: string) => rm(frameFile(id, date), { force: true });
