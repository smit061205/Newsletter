// The active paper's type and grid in contract units (px at 300 DPI), read
// from its publication profile (publications/<id>/profile.json). Nothing here
// is specific to one paper: change the profile, not this file.
import type { Font } from "@ck/shared/contract";
import { profile } from "../profile.ts";
import type { Faces } from "./measure.ts";

export const DPI = 300;
export const PT = DPI / 72; // pt -> px

const t = profile.type;

export const PAGE = { width: profile.page.width * PT, height: profile.page.height * PT };

/** The widest a front-page story may be without the editor's say-so (columns). */
/** The widest a story may be, on any page (7 of 8 columns), unless the editor
 * allows it the full width ("Allow full width"). (The profile's key keeps its
 * old name: it once held for the front page only.) */
export const MAX_STORY_COLS = profile.grid.frontPageMaxCols ?? profile.grid.columns - 1;
/** The front page's lead may run the full width without the editor's say-so. */
export const LEAD_FULL_WIDTH = !!profile.grid.leadFullWidth;

export const GRID = {
  left: profile.grid.left * PT,
  pitch: (profile.grid.column + profile.grid.gutter) * PT,
  gutter: profile.grid.gutter * PT,
  column: profile.grid.column * PT,
  columns: profile.grid.columns,
};

export const FONTS: Font[] = Object.entries(profile.fonts).map(([id, f]) => ({
  id, url: f.file, weight: f.weight, ...(f.style !== "normal" ? { style: f.style } : {}),
  ...(f.restricted ? { restricted: true } : {}),
}));

/** How each font writes its text (for the measurer). */
export const FACES: Faces = {
  encoding: Object.fromEntries(Object.entries(profile.fonts).map(([id, f]) => [id, f.encoding])),
  latin: Object.fromEntries(Object.entries(profile.fonts).flatMap(([id, f]) => (f.latin ? [[id, f.latin]] : []))),
  fallback: Object.fromEntries(Object.entries(profile.fonts).flatMap(([id, f]) => (f.fallback ? [[id, f.fallback]] : []))),
};

export const INK = profile.ink;

export const BODY = {
  font: t.body.font,
  size: t.body.size * PT,
  pitch: t.body.pitch * PT,
  indent: t.body.indent * PT,
  pitches: t.body.pitches.map((p) => p * PT),
  sizes: t.body.sizes.map((s) => s * PT),
};

export const HEADLINE = {
  font: t.headline.font,
  leading: t.headline.leading,
  /** Largest headline size by the columns it spans. */
  cap: (cols: number) => t.headline.capByColumns[Math.min(cols, t.headline.capByColumns.length - 1)] * PT,
  min: t.headline.min * PT,
  /** The headline size for a story of this rank (1 = lead) across `cols` columns. */
  sizeFor: (rank: number, cols: number) => {
    const scale = t.headline.rankScale[Math.min(rank, t.headline.rankScale.length) - 1];
    return Math.max(t.headline.min, t.headline.capByColumns[Math.min(cols, t.headline.capByColumns.length - 1)] * scale) * PT;
  },
  maxLines: (rank: number) => t.headline.maxLines[Math.min(rank, t.headline.maxLines.length) - 1],
  /** an item filling a narrow gap: its headline's band, if the profile sets one smaller than `min` */
  filler: t.headline.fillerMax ? { max: t.headline.fillerMax * PT, min: t.headline.fillerMax * PT * 0.8 } : undefined,
};

export const KICKER = { font: t.kicker.font, ratio: t.kicker.ratio, min: t.kicker.min * PT, leading: t.kicker.leading };
export const DECK = { font: t.deck.font, ratio: t.deck.ratio, min: t.deck.min * PT, leading: t.deck.leading };
export const CAPTION = { font: t.caption.font, size: t.caption.size * PT, pitch: t.caption.pitch * PT };

/** What a print desk accepts for a photo (see the profile's `photo`). */
export const PHOTO = { ...profile.photo, minHeight: profile.photo.minHeight * PT };

/** Space between the parts of a story, px. */
export const GAP = Object.fromEntries(Object.entries(profile.spacing).map(([k, v]) => [k, v * PT])) as
  Record<keyof typeof profile.spacing, number>;
