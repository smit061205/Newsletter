// Maps each legacy font actually used in the source PDF to a real Unicode Gujarati
// Google Font that plays the same typographic role. The originals (BBharati*) are
// pre-Unicode glyph-substitution fonts -- see gridSpec.ts / the roadmap for why they
// can't be used directly. This is the per-subgrid substitution table, derived by
// matching every text frame back to the exact font span that set it (see
// font_mapping_raw.json / the script that produced it), not a single blanket font.
//
//   BBharatiTitleTwo        -> masthead / display wordmark, very large sizes
//   BBharatiGopikaTwo       -> body copy workhorse
//   BBharatiGopikaTwo,Bold  -> headlines, subheads, kickers (same family, bold)
//   BBharatiMaruti          -> a second, distinct headline face used occasionally
//   (stray Latin fonts: Helvetica-Bold / Times-Bold / Calibri,Bold / Times-Roman --
//    short English/numeral runs inside otherwise-Gujarati frames; left as system fonts)

export interface ResolvedFont {
  family: string;
  weight: number;
  letterSpacing?: string;
}

const BHARATI_MAP: Record<string, ResolvedFont> = {
  BBharatiTitleTwo: { family: "'Baloo Bhai 2', 'Noto Sans Gujarati', sans-serif", weight: 700 },
  BBharatiGopikaTwo: { family: "'Hind Vadodara', 'Noto Sans Gujarati', sans-serif", weight: 400 },
  "BBharatiGopikaTwo,Bold": { family: "'Hind Vadodara', 'Noto Sans Gujarati', sans-serif", weight: 700 },
  BBharatiMaruti: { family: "'Mukta Vaani', 'Noto Sans Gujarati', sans-serif", weight: 700 },
};

const LATIN_MAP: Record<string, ResolvedFont> = {
  "Helvetica-Bold": { family: "Arial, Helvetica, sans-serif", weight: 700 },
  "Times-Bold": { family: "Georgia, 'Times New Roman', serif", weight: 700 },
  "Times-Roman": { family: "Georgia, 'Times New Roman', serif", weight: 400 },
  "Calibri,Bold": { family: "Arial, Helvetica, sans-serif", weight: 700 },
  // found in the Phase 3 whole-paper font survey (docs/PRECISION_ROADMAP.md) --
  // not previously mapped because only the header had been inventoried.
  Calibri: { family: "Arial, Helvetica, sans-serif", weight: 400 },
  ArialBlack: { family: "'Arial Black', Arial, sans-serif", weight: 900 },
};

// Fallback when a frame has no matched source span (e.g. the reconciliation transform
// didn't carry a font for it) -- keyed by structural type, same tiers as above.
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
  if (sourceFont) {
    if (BHARATI_MAP[sourceFont]) return BHARATI_MAP[sourceFont];
    if (LATIN_MAP[sourceFont]) return LATIN_MAP[sourceFont];
  }
  return TYPE_FALLBACK[type] ?? { family: "'Hind Vadodara', 'Noto Sans Gujarati', sans-serif", weight: 400 };
}

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
