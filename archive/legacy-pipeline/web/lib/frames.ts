import template from "./template.json";
import { pt, type Pt } from "./gridSpec";

// Every structural type the extraction pipeline found across all 4 pages.
// See capital_kranti_zone_map.json / the roadmap artifact for how these were classified.
export type FrameType =
  | "chrome"
  | "masthead"
  | "running_header"
  | "footer"
  | "photo"
  | "body_or_caption"
  | "fine_print"
  | "headline_L1"
  | "headline_L2"
  | "subhead_kicker"
  | "ad_or_box";

export interface Frame {
  id: string;
  type: FrameType;
  x0: Pt;
  y0: Pt;
  x1: Pt;
  y1: Pt;
  w: Pt;
  h: Pt;
  fontSizePt?: Pt;
  gridSnapped: boolean;
  moduleStart: number;
  moduleEnd: number;
  labelHint: string | null;
  /** The exact font span this frame was set in, in the source PDF (e.g.
   * "BBharatiGopikaTwo,Bold"). Null for frames with no matched text span
   * (photos, ad boxes). Resolve via resolveFont() in fonts.ts. */
  sourceFont: string | null;
}

type RawFrame = {
  id: string;
  type: string;
  x0: number; y0: number; x1: number; y1: number; w: number; h: number;
  moduleStart: number; moduleEnd: number; gridSnapped: boolean;
  fontSizePt: number | null; labelHint: string | null; sourceFont?: string | null;
};

export type PageNumber = "1" | "2" | "3" | "4";

const pages = template.pages as Record<PageNumber, { frames: RawFrame[] }>;

/** All frames for one page, re-anchored onto the blank master's exact coordinate
 * system (see canonical_template.json for the full transform + provenance). */
export function getPageFrames(page: PageNumber): Frame[] {
  return pages[page].frames.map((f) => ({
    ...f,
    type: f.type as FrameType,
    x0: pt(f.x0), y0: pt(f.y0), x1: pt(f.x1), y1: pt(f.y1),
    w: pt(f.w), h: pt(f.h),
    fontSizePt: f.fontSizePt != null ? pt(f.fontSizePt) : undefined,
    sourceFont: f.sourceFont ?? null,
  }));
}

export const PAGE_NUMBERS: PageNumber[] = ["1", "2", "3", "4"];
