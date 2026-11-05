// A paper for CorelDRAW with its text editable, in a script whose letters join (Urdu, Hindi):
// the developer, 5 Nov ("i want editable urdu one"). A PDF can't carry such text so that
// CorelDRAW reads it as words (export/pdf-editable.ts draws its letters as shapes instead);
// an SVG can: every line a text line in the paper's own font, which CorelDRAW sets itself,
// joined, in the font installed on that computer (export/svg.ts). So it's saved as a folder
// in Downloads: each page an SVG to import, the fonts to install once, the title and footer
// (a PDF, its own text editable too) and a note in Gujarati on how to put it together.
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IssueRender } from "@ck/shared/contract";
import { assetFile } from "../config.ts";
import { pageSvg } from "./svg.ts";

const README = `CorelDRAW માં આ છાપું (લખાણ બદલી શકાય એવું)

૧. ફોન્ટ (એક જ વાર): આ ફોલ્ડરની .ttf ફાઈલ પર બે વાર ક્લિક કરો અને "Install" દબાવો.
   પછી CorelDRAW બંધ કરીને ફરી ખોલો.
૨. CorelDRAW માં નવો દસ્તાવેજ ખોલો: માપ 390 × 525 mm.
૩. File > Import થી "page 1.svg" ખોલો, પાનાની ઉપર ડાબે ખૂણે મૂકો. બીજાં પાનાં માટે નવું પાનું ઉમેરીને એ જ રીતે.
૪. છાપાનું નામ અને નીચેની લીટી: "title and footer.pdf" પણ File > Import થી એ જ પાનાં પર મૂકો.

લખાણ પર ક્લિક કરીને બદલી શકાય છે.
`;

/** The issue saved for CorelDRAW in a folder in Downloads (`extras`: PDFs to put beside it); the folder. */
export async function saveEditable(issue: IssueRender, label: string, extras: { name: string; pdf: Uint8Array }[] = []): Promise<string> {
  const [y, m, d] = issue.issueDate.split("-");
  const dir = path.join(os.homedir(), "Downloads", `${label.replace(/[\\/:*?"<>|]/g, "-")} - CorelDRAW - ${d}-${m}-${y}`);
  await mkdir(dir, { recursive: true });
  for (const p of [...issue.pages].sort((a, b) => a.number - b.number)) {
    await writeFile(path.join(dir, `page ${p.number}.svg`), await pageSvg(issue, p.number));
  }
  // the fonts its text is set in (each file once)
  const used = new Set(issue.pages.flatMap((p) => p.elements.flatMap((e) => (e.kind === "text" ? [e.font] : []))));
  const files = new Set(issue.fonts.filter((f) => used.has(f.id)).map((f) => assetFile(new URL(f.url, "http://x").pathname)));
  for (const f of files) await copyFile(f, path.join(dir, path.basename(f))).catch(() => {});
  for (const x of extras) await writeFile(path.join(dir, x.name), x.pdf);
  await writeFile(path.join(dir, "વાંચો - Read me.txt"), "﻿" + README.replace(/\n/g, "\r\n"));
  return dir;
}
