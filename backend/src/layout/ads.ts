// Where a page's ads go. A booking may pin its exact position; any other ad
// is a module the layout places: its width snapped to whole columns (the
// creative scaled to keep its shape), stacked up from the foot of the page,
// widest first, on the right where a choice is equal -- so the stories get
// one clean, unbroken area above, whatever ads the day has, instead of
// fitting around positions copied from an old issue.
import type { Ad } from "../store.ts";
import { spanWidth } from "./module.ts";
import { GAP, GRID } from "./typography.ts";
import type { Band } from "./pack.ts";

const colX = (c: number) => GRID.left + c * GRID.pitch;

export function arrangeAds(ads: Ad[], band: Band): Ad[] {
  const pinned = ads.filter((a) => a.pinned !== false);
  const free = ads.filter((a) => a.pinned === false)
    .map((a) => {
      const cols = Math.max(1, Math.min(GRID.columns, Math.round((a.width + GRID.gutter) / GRID.pitch)));
      const width = spanWidth(cols);
      return { ad: a, cols, width, height: a.height * (width / a.width) };
    })
    .sort((a, b) => b.cols - a.cols || b.height - a.height || a.ad.id.localeCompare(b.ad.id));
  // how far down each column is still free, above the pinned ads and the band foot
  const floor = Array.from({ length: GRID.columns }, (_, c) => {
    let y = band.bottom;
    for (const p of pinned) {
      const overlaps = Math.min(p.x + p.width, colX(c) + GRID.column) - Math.max(p.x, colX(c)) > 20;
      if (overlaps && p.y + p.height >= band.bottom - 1) y = Math.min(y, p.y - GAP.betweenStories);
    }
    return y;
  });
  const placed: Ad[] = [];
  for (const f of free) {
    let best: { c0: number; y: number } | null = null;
    // the columns tried in the order the editor's place prefers (the first of equals wins):
    // from the right (the default), from the left, or outward from the middle
    const span = GRID.columns - f.cols;
    const order = f.ad.place === "left" ? Array.from({ length: span + 1 }, (_, i) => i)
      : f.ad.place === "middle" ? Array.from({ length: span + 1 }, (_, i) => i).sort((a, b) => Math.abs(a - span / 2) - Math.abs(b - span / 2) || a - b)
      : Array.from({ length: span + 1 }, (_, i) => span - i);
    for (const c0 of order) {
      const y = Math.min(...floor.slice(c0, c0 + f.cols)) - f.height;
      if (y < band.top) continue;
      if (!best || y > best.y + 0.5) best = { c0, y };
    }
    if (!best) continue; // no room on the page: left out
    placed.push({ ...f.ad, x: colX(best.c0), y: best.y, width: f.width, height: f.height });
    for (let c = best.c0; c < best.c0 + f.cols; c++) floor[c] = best.y - GAP.betweenStories;
  }
  return [...pinned, ...placed];
}
