// Print preflight: is the PDF fit to send to the printer as it is? Checked
// on every build (a release gate), from the PDF itself and the issue:
//
//   trim     every page exactly the profile's page size
//   fonts    every font in the PDF embedded (none left for the printer's RIP to substitute)
//   photos   every photo at 200 ppi or more at the size it prints
//   bounds   nothing outside the page
//
// Bleed, crop marks and CMYK/PDF-X wait for the printer's own specs.
import { readFile } from "node:fs/promises";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import type { IssueRender } from "@ck/shared/contract";
import { assetFile } from "../config.ts";
import { imageSize } from "../ingest/pib.ts";
import { profile } from "../profile.ts";

export interface Check { name: string; pass: boolean; detail: string }
const MIN_PPI = 200;

export async function preflight(pdf: Uint8Array, issue: IssueRender): Promise<Check[]> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const { width, height } = profile.page;
  const off = doc.getPages().map((p, i) => ({ i: i + 1, ...p.getSize() }))
    .filter((p) => Math.abs(p.width - width) > 0.5 || Math.abs(p.height - height) > 0.5);

  // a font with a descriptor but no font file, or a simple font with no descriptor, isn't embedded
  const unembedded = new Set<string>();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const type = obj.get(PDFName.of("Type"))?.toString();
    if (type === "/FontDescriptor" && !["FontFile", "FontFile2", "FontFile3"].some((k) => obj.get(PDFName.of(k)))) {
      unembedded.add(obj.get(PDFName.of("FontName"))?.toString() ?? "?");
    }
    const sub = obj.get(PDFName.of("Subtype"))?.toString();
    if (type === "/Font" && (sub === "/Type1" || sub === "/TrueType") && !obj.get(PDFName.of("FontDescriptor"))) {
      unembedded.add(obj.get(PDFName.of("BaseFont"))?.toString() ?? "?");
    }
  }

  const dpi = issue.dpi ?? 300;
  const soft: string[] = [];
  const outside: string[] = [];
  for (const page of issue.pages) {
    for (const e of page.elements) {
      if (e.kind === "image") {
        try {
          const size = imageSize(new Uint8Array(await readFile(assetFile(new URL(e.url, "http://x").pathname))));
          if (size) {
            // contract px per source pixel, as fitted ("cover" crops: the larger scale)
            const scale = e.fit === "contain" ? Math.min(e.width / size.width, e.height / size.height) : Math.max(e.width / size.width, e.height / size.height);
            const ppi = dpi / scale;
            if (ppi < MIN_PPI) soft.push(`p${page.number} ${e.id} ${Math.round(ppi)} ppi`);
          }
        } catch { /* a missing image is the plotter's warning */ }
      }
      const box = e.kind === "line" ? { x0: Math.min(e.x1, e.x2), y0: Math.min(e.y1, e.y2), x1: Math.max(e.x1, e.x2), y1: Math.max(e.y1, e.y2) }
        : e.kind === "path" ? null : { x0: e.x, y0: e.y, x1: e.x + e.width, y1: e.y + e.height };
      if (box && (box.x0 < -1 || box.y0 < -1 || box.x1 > page.width + 1 || box.y1 > page.height + 1)) outside.push(`p${page.number} ${e.id}`);
    }
  }
  return [
    { name: "trim", pass: !off.length, detail: off.length ? off.map((p) => `p${p.i} ${p.width.toFixed(1)}x${p.height.toFixed(1)}pt`).join(", ") : `${width}x${height}pt` },
    { name: "fonts", pass: !unembedded.size, detail: unembedded.size ? `not embedded: ${[...unembedded].join(", ")}` : "all embedded" },
    { name: "photos", pass: !soft.length, detail: soft.length ? `under ${MIN_PPI} ppi: ${soft.slice(0, 6).join(", ")}` : `all ${MIN_PPI} ppi or more` },
    { name: "bounds", pass: !outside.length, detail: outside.length ? `outside the page: ${outside.slice(0, 6).join(", ")}` : "all on the page" },
  ];
}
