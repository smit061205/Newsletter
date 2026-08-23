// Canonical page + grid geometry, re-derived from the blank master "(172) PDF.pdf"
// (the confirmed target page) rather than carried over unreconciled from the issue PDF.
// Regenerate this file from capital_kranti_grid_spec.json if the source PDFs are re-measured.

/** A value in PDF/CSS points. 1pt = 1/72in, identical unit in both. Branded so a raw
 * number (e.g. an accidental px value) can't be passed where a Pt is expected. */
export type Pt = number & { readonly __unit: "pt" };
export const pt = (n: number): Pt => n as Pt;

export const PAGE = {
  widthPt: pt(1119.7),
  heightPt: pt(1584.55),
} as const;

export const LIVE_AREA = {
  x0: pt(15.51),
  y0: pt(12.064),
  x1: pt(1104.182),
  y1: pt(1575.412),
} as const;

export const GRID = {
  columns: 8,
  pitchPt: pt(136.084),
  originXPt: pt(15.51),
  singleColumnTextWidthPt: pt(124.2),
  gutterPt: pt(11.884),
  // 9 boundaries defining 8 columns, anchored to the blank master's own live-area width
  moduleBoundsXPt: [
    15.51, 151.594, 287.678, 423.762, 559.846, 695.93, 832.014, 968.098, 1104.182,
  ].map(pt),
} as const;

export const LEADING_RATIO = 1.2; // leading_pt = fontSizePt * LEADING_RATIO, measured exact across all sizes

/** Left/right edge of a 1-indexed module span, e.g. moduleSpan(1,1) = first column. */
export function moduleSpan(startModule: number, endModule: number): { x0: Pt; x1: Pt } {
  return {
    x0: GRID.moduleBoundsXPt[startModule - 1],
    x1: GRID.moduleBoundsXPt[endModule],
  };
}
