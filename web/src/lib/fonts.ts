// Loads the REAL calibrated font files this project sourced and measured
// this session (docs/PRECISION_ROADMAP.md's Phase 3) via next/font/local --
// not a Google Fonts stand-in. This matters specifically because the website
// preview needs to show the SAME typography the PDF generator (WeasyPrint,
// these same .ttf files) will actually print -- a preview built from a
// different font family would look right and still be a wrong preview.
//
// An earlier version of this file mapped to Google Fonts ('Baloo Bhai 2',
// 'Hind Vadodara', 'Mukta Vaani') as a dev-preview stand-in, predating this
// session's font-file acquisition -- replaced now that the real files exist
// locally (web/fonts/*.ttf) and the Python pipeline already depends on them
// (scripts/layout_lib.py's FONT_ROLES).
import localFont from "next/font/local";

// The `variable` option registers a CSS custom property under this exact
// name, but font.variable (below, used for ALL_FONT_VARIABLES) is a
// generated CLASS NAME that activates it -- NOT the property name itself.
// var(font.variable) therefore built an invalid reference (missing the "--"
// prefix) and silently fell back to the inherited body font. Reference the
// literal property names (FONT_VAR below) in var(...) instead; use .variable
// only as a class. next/font/local statically analyzes its `variable` option
// (must be a literal string, not a constant reference), so these names are
// necessarily duplicated between the localFont() calls and FONT_VAR -- keep
// the two in sync by hand.
const FONT_VAR = {
  hindVadodara: "--font-hind-vadodara",
  balooBhai2: "--font-baloo-bhai-2",
  muktaVaani: "--font-mukta-vaani",
  tinos: "--font-tinos",
} as const;

const hindVadodara = localFont({
  src: [
    { path: "../../fonts/HindVadodara-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../fonts/HindVadodara-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-hind-vadodara",
});
const balooBhai2 = localFont({
  src: [{ path: "../../fonts/BalooBhai2-Bold.ttf", weight: "700", style: "normal" }],
  variable: "--font-baloo-bhai-2",
});
const muktaVaani = localFont({
  src: [{ path: "../../fonts/MuktaVaani-Bold.ttf", weight: "700", style: "normal" }],
  variable: "--font-mukta-vaani",
});
const tinos = localFont({
  src: [{ path: "../../fonts/Tinos-Bold.ttf", weight: "700", style: "normal" }],
  variable: "--font-tinos",
});

/** className list to put on the page root so every @font-face below is
 * available -- next/font/local only emits the font when its className (or
 * a shared variable) is actually applied somewhere in the tree. */
export const ALL_FONT_VARIABLES = [
  hindVadodara.variable,
  balooBhai2.variable,
  muktaVaani.variable,
  tinos.variable,
].join(" ");

export interface ResolvedFont {
  family: string;
  weight: number;
  letterSpacing?: string;
}

// Mirrors scripts/layout_lib.py's FONT_ROLES exactly (same source font name
// -> same substitute family/weight) so the website and the PDF never
// disagree about which typeface a given role renders in.
const BHARATI_MAP: Record<string, ResolvedFont> = {
  BBharatiTitleTwo: { family: `var(${FONT_VAR.balooBhai2})`, weight: 700 },
  BBharatiGopikaTwo: { family: `var(${FONT_VAR.hindVadodara})`, weight: 400 },
  "BBharatiGopikaTwo,Bold": { family: `var(${FONT_VAR.hindVadodara})`, weight: 700 },
  BBharatiMaruti: { family: `var(${FONT_VAR.muktaVaani})`, weight: 700 },
  "Times-Bold": { family: `var(${FONT_VAR.tinos})`, weight: 700 },
};

const TYPE_FALLBACK: Record<string, ResolvedFont> = {
  masthead: BHARATI_MAP.BBharatiTitleTwo,
  running_header: BHARATI_MAP.BBharatiTitleTwo,
  headline_L1: BHARATI_MAP["BBharatiGopikaTwo,Bold"],
  headline_L2: BHARATI_MAP["BBharatiGopikaTwo,Bold"],
  subhead_kicker: BHARATI_MAP["BBharatiGopikaTwo,Bold"],
  body_or_caption: BHARATI_MAP.BBharatiGopikaTwo,
  fine_print: BHARATI_MAP.BBharatiGopikaTwo,
  footer: { family: "Arial, Helvetica, sans-serif", weight: 400 },
};

export function resolveFont(sourceFont: string | null | undefined, type: string): ResolvedFont {
  if (sourceFont && BHARATI_MAP[sourceFont]) return BHARATI_MAP[sourceFont];
  return TYPE_FALLBACK[type] ?? BHARATI_MAP.BBharatiGopikaTwo;
}

// ---- New backend-driven article roles (docs/FRONTEND_ROADMAP.md Part B:
// "typography is a frontend decision") -- the backend sends title/kicker/
// bodyText, not a source-font name, so the frontend picks ONE consistent
// house style per role rather than replicating the old per-story font
// variation template.json happened to have. Matches the most common case
// from this session's whole-paper font survey (see the comment this
// replaced) -- a deliberate simplification, not a measurement.
export const ARTICLE_FONT_ROLES = {
  title: BHARATI_MAP["BBharatiGopikaTwo,Bold"],
  kicker: BHARATI_MAP["BBharatiGopikaTwo,Bold"],
  body: BHARATI_MAP.BBharatiGopikaTwo,
} as const;

// ---- Phase 3 calibration (docs/PRECISION_ROADMAP.md) ----
//
// calibration_ratios.json holds one measured RATIO per source font -> real
// text spans across all 4 pages of the reference issue were rendered in the
// substitute font at a reference size and back-solved for the size that
// reproduces the ORIGINAL PDF's exact measured width; ratio = that size /
// the original's own declared size. Multiplying any future declared size by
// this ratio gives the substitute-font size to use -- this is what makes the
// calibration generalize to brand-new headline/body text that doesn't exist
// in the source PDF yet, unlike the earlier per-element-only calibration.
//
// Never hand-set a substitute font-size as a guess (see the roadmap's Part B,
// technique 4: an earlier unmeasured "12.5pt" placeholder for the edition bar
// sat wrong, undetected, for the whole header build). Always go through
// calibratedFontSize().
import calibrationData from "./calibration_ratios.json";

interface CalibrationEntry {
  ratio_median: number;
  confidence: string;
  size_band_ratios?: { size_range: [number, number]; ratio: number }[];
}

const CALIBRATION = calibrationData as unknown as Record<string, CalibrationEntry>;

/** The declared-size multiplier for a source font, honoring a size-banded
 * override when one exists (currently only BBharatiMaruti, whose ratio is
 * NOT size-independent -- see calibration_ratios.json). Returns 1 (no
 * correction) for a source font with no calibration data at all, rather than
 * silently guessing. */
export function calibrationRatio(sourceFont: string | null | undefined, declaredSizePt: number): number {
  if (!sourceFont) return 1;
  const entry = CALIBRATION[sourceFont];
  if (!entry) return 1;
  if (entry.size_band_ratios) {
    for (const band of entry.size_band_ratios) {
      if (declaredSizePt >= band.size_range[0] && declaredSizePt <= band.size_range[1]) {
        return band.ratio;
      }
    }
    // outside every sampled band: fall back to the flat median rather than
    // extrapolate a size-dependent trend past where it was ever measured
  }
  return entry.ratio_median;
}

/** The actual substitute-font point size to set, given the original PDF's
 * declared size for a given source font. */
export function calibratedFontSize(sourceFont: string | null | undefined, declaredSizePt: number): number {
  return declaredSizePt * calibrationRatio(sourceFont, declaredSizePt);
}
