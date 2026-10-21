// A publication profile: everything that makes one newspaper look like
// itself -- page, grid, fonts per role, type scale, spacing, photo rules,
// chrome templates, language, editorial settings. The engine reads this and
// holds no paper-specific constants of its own; a new paper is a new
// profile (publications/<paper>/profile.json), not new code.
//
// Lengths are in pt (1/72 inch), as a designer measures a page; the engine
// converts to contract px.

import { z } from "zod";

const pt = z.number().finite().nonnegative();

export const FontRoleSchema = z.object({
  /** Font file, relative to the profile folder (or a /fonts/... URL already served). */
  file: z.string().min(1),
  weight: z.number().int().min(1).max(1000).default(400),
  style: z.enum(["normal", "italic"]).default("normal"),
  /** "unicode", or a legacy (pre-Unicode) glyph encoding the engine converts to. */
  encoding: z.enum(["unicode", "bharati"]).default("unicode"),
  /** The licence doesn't allow serving the font publicly (e.g. a commercial
   * font licensed for print): it never gets a public URL, and the website
   * shows pages as images rendered on the server. */
  restricted: z.boolean().default(false),
  /** For a legacy font: the font (a fonts key) that sets Latin letters and digits. */
  latin: z.string().optional(),
});

const TextStyleSchema = z.object({
  font: z.string().min(1), // a fonts key
  size: pt.optional(),
  /** size of kicker/deck as a share of the story's headline size */
  ratio: z.number().positive().optional(),
  min: pt.optional(),
  /** line pitch / size */
  leading: z.number().positive().optional(),
  pitch: pt.optional(),
});

export const ProfileSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  language: z.object({
    lang: z.string().min(2), // BCP 47: gu, ur, en
    direction: z.enum(["ltr", "rtl"]).default("ltr"),
    digits: z.enum(["gujarati", "arabic-indic", "latin"]).default("latin"),
    weekdays: z.array(z.string()).length(7), // Sunday first
    /** e.g. "તારીખ : {dd}-{mm}-{yyyy}, {weekday}" */
    dateLine: z.string().min(1),
    issueLine: z.string().min(1), // e.g. "અંક : {issue}"
  }),
  issue: z.object({
    /** an issue known to exist, to count numbers from: every day is one issue */
    referenceDate: z.string(),
    referenceNumber: z.number().int().positive(),
    pages: z.number().int().positive(),
  }),
  page: z.object({ width: pt.positive(), height: pt.positive() }),
  grid: z.object({
    left: pt, // first column's left edge
    columns: z.number().int().positive(),
    column: pt.positive(),
    gutter: pt,
  }),
  ink: z.string().min(1),
  fonts: z.record(z.string(), FontRoleSchema),
  type: z.object({
    body: TextStyleSchema.extend({
      size: pt.positive(),
      pitch: pt.positive(),
      indent: pt,
      /** looser / tighter pitches allowed to fit a story, pt */
      pitches: z.array(pt.positive()).min(1),
      sizes: z.array(pt.positive()).min(1),
    }),
    headline: TextStyleSchema.extend({
      leading: z.number().positive(),
      /** largest size (pt) by column span: index = columns spanned */
      capByColumns: z.array(pt).min(2),
      min: pt.positive(),
      /** headline size by story rank (1 = lead ... 5 = brief), as a share of capByColumns */
      rankScale: z.array(z.number().positive()).min(1).default([1, 0.8, 0.66, 0.56, 0.48]),
      /** most lines a headline may take, by rank */
      maxLines: z.array(z.number().int().positive()).min(1).default([2, 2, 2, 3, 3]),
    }),
    kicker: TextStyleSchema.extend({ ratio: z.number().positive(), min: pt.positive(), leading: z.number().positive() }),
    deck: TextStyleSchema.extend({ ratio: z.number().positive(), min: pt.positive(), leading: z.number().positive() }),
    caption: TextStyleSchema.extend({ size: pt.positive(), pitch: pt.positive() }),
  }),
  spacing: z.object({
    top: pt, afterKicker: pt, afterHeadline: pt, afterDeck: pt, afterPhoto: pt, afterCaption: pt,
    /** between two stories stacked in the same columns, and the rule drawn in that gap (0 = none) */
    betweenStories: pt.default(8),
    storyRule: pt.default(0),
  }),
  photo: z.object({
    maxCrop: z.number().min(0).max(1),
    minHeight: pt,
    minCols: z.number().int().positive(),
    minPpi: z.number().positive(),
    maxShare: z.number().min(0).max(1),
  }),
  /** What the fonts' licences allow, in words (shown to whoever deploys it). */
  fontLicence: z.string().optional(),
  /** chrome templates (art + dynamic fields), relative to the profile folder */
  chrome: z.string().min(1),
  /** What fills space no story can: the paper's own house ad, line by line
   * (`role` picks the font, `scale` its share of the largest size that fits). */
  fillers: z.object({
    houseAd: z.array(z.object({ text: z.string().min(1), role: z.enum(["headline", "deck", "body"]), scale: z.number().positive() })),
  }).default({ houseAd: [] }),
  editorial: z.object({
    workhorseModel: z.string().min(1),
    leadModel: z.string().min(1),
    leadStories: z.number().int().nonnegative(),
  }),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type FontRole = z.infer<typeof FontRoleSchema>;
