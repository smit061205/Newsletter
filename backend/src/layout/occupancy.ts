// White space as a reader sees it: what's actually empty on the finished
// page, wherever it is -- not just the space under each placed story (the
// old check), which missed holes beside ads or above a filler.
//
// Every element's box is marked on a grid of the page's columns by 2pt rows,
// inside the band the stories may use. A column stretch left empty for
// longer than the gap between stories plus 1.5 body lines is a gap.
import type { Element } from "@ck/shared/contract";
import type { Band } from "./pack.ts";
import { BODY, GAP, GRID, PT } from "./typography.ts";

export interface Gap { col: number; y0: number; y1: number }

const ROW = 2 * PT;

function box(e: Element): { x0: number; x1: number; y0: number; y1: number } | null {
  switch (e.kind) {
    case "line": return null; // rules separate stories; they don't fill space
    case "path": return null;
    default: return { x0: e.x, x1: e.x + e.width, y0: e.y, y1: e.y + e.height };
  }
}

/** Empty column stretches on a page, top to bottom of the band. */
export function findGaps(elements: Element[], band: Band): Gap[] {
  const rows = Math.ceil((band.bottom - band.top) / ROW);
  const gaps: Gap[] = [];
  const allowed = GAP.betweenStories + 1.5 * BODY.pitch;
  for (let c = 0; c < GRID.columns; c++) {
    const x0 = GRID.left + c * GRID.pitch;
    const x1 = x0 + GRID.column;
    const used = new Uint8Array(rows);
    for (const e of elements) {
      const b = box(e);
      if (!b || Math.min(b.x1, x1) - Math.max(b.x0, x0) <= 20) continue;
      const r0 = Math.max(0, Math.floor((b.y0 - band.top) / ROW));
      const r1 = Math.min(rows, Math.ceil((b.y1 - band.top) / ROW));
      for (let r = r0; r < r1; r++) used[r] = 1;
    }
    for (let r = 0; r < rows;) {
      if (used[r]) { r++; continue; }
      let e = r;
      while (e < rows && !used[e]) e++;
      const y0 = band.top + r * ROW;
      const y1 = Math.min(band.bottom, band.top + e * ROW);
      if (y1 - y0 > allowed) gaps.push({ col: c, y0, y1 });
      r = e;
    }
  }
  return gaps;
}
