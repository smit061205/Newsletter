// Canonical page + grid geometry.
//
// PAGE is now anchored to "(196) Capital Kranti_08 august.pdf" itself --
// confirmed directly (python3 -m fitz), NOT the old "(172) PDF.pdf" blank
// master this constant used to point at. See docs/FRONTEND_ROADMAP.md Part B:
// the new backend's pixel coordinates are given against the (196) page size
// at 300 DPI, so (196)'s own dimensions are the one true page size going
// forward -- there is no longer a separate "canonical target" to reconcile
// onto (that reconciliation, scripts/geometry.py's tx()/ty(), existed only
// because the old pipeline rendered onto a physically different page).
//
// LIVE_AREA and GRID.moduleBoundsXPt below are carried over UNCHANGED from
// the old (172)-space measurement and are NOT yet verified against (196)'s
// own live-area margins -- flagged, not silently reused as if re-measured.
// Positioning for real articles comes directly from the backend's own px
// coordinates regardless (Part D), so this only matters for anything that
// still wants a "which column does this roughly land on" reference.

/** A value in PDF/CSS points. 1pt = 1/72in, identical unit in both. Branded so a raw
 * number (e.g. an accidental px value) can't be passed where a Pt is expected. */
export type Pt = number & { readonly __unit: "pt" };
export const pt = (n: number): Pt => n as Pt;

/** A value in pixels, at the DPI below. Branded for the same reason as Pt. */
export type Px = number & { readonly __unit: "px" };
export const px = (n: number): Px => n as Px;

// Confirmed with the user (docs/FRONTEND_ROADMAP.md Part B): the backend's
// coordinates are pixels at this DPI, against (196)'s own page size.
export const COORDINATE_DPI = 300;
export const PX_PER_PT = COORDINATE_DPI / 72; // 4.166667
export const PT_PER_PX = 72 / COORDINATE_DPI; // 0.24 exactly

export function ptToPx(v: number): Px {
  return px(v * PX_PER_PT);
}
export function pxToPt(v: number): Pt {
  return pt(v * PT_PER_PX);
}

// Confirmed directly from the source PDF this session:
//   python3 -c "import fitz; print(fitz.open('(196) Capital Kranti_08 august.pdf')[0].rect)"
// -> 1105.50 x 1488.20 pt, identical on all 4 pages.
export const PAGE = {
  widthPt: pt(1105.5),
  heightPt: pt(1488.2),
  widthPx: ptToPx(1105.5),  // 4606.25
  heightPx: ptToPx(1488.2), // 6200.83
} as const;

/** @deprecated old (172)-space measurement, not yet re-verified for (196) -- see file header. */
export const LIVE_AREA = {
  x0: pt(15.51),
  y0: pt(12.064),
  x1: pt(1104.182),
  y1: pt(1575.412),
} as const;

/** @deprecated old (172)-space measurement, not yet re-verified for (196) -- see file header.
 * Real article positioning comes from the backend's own px coordinates (Part D), not this grid. */
export const GRID = {
  columns: 8,
  pitchPt: pt(136.084),
  originXPt: pt(15.51),
  singleColumnTextWidthPt: pt(124.2),
  gutterPt: pt(11.884),
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
