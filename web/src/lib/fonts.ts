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
