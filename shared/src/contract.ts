// The backend render contract (docs/RENDER_CONTRACT.md). The backend decides
// ALL layout: page size, every element's position, text, fonts (by URL),
// images, and the page chrome (masthead, running headers, footer). The
// frontend only validates this and plots it onto a blank page of the given
// size -- it makes no layout decisions of its own.
//
// Every length (positions, sizes, font sizes, line heights, stroke widths) is
// in px at `dpi` (300 as agreed with the backend). One unit, no conversions.
// This schema is both the runtime validator (Zod) and the TypeScript type, so
// the two can't drift apart; a response that doesn't match fails loudly in
// apiClient.ts, never as a silently broken page.

import { z } from "zod";

const num = z.number().finite();
const len = num.nonnegative();
const color = z.string().min(1);

const base = {
  id: z.string().min(1),
  // Optional grouping of elements into one story -- used for QA and review
  // only, never for layout.
  articleId: z.string().optional(),
};

const boxed = { ...base, x: num, y: num, width: len, height: len };

// A piece of text in its own style inside one text element, e.g. an English
// name in a serif within a Gujarati sentence. Unset fields take the element's.
export const TextRunSchema = z.object({
  text: z.string(),
  font: z.string().min(1).optional(), // a fonts[].id
  size: len.positive().optional(),
  color: color.optional(),
});

export const TextElementSchema = z.object({
  ...boxed,
  kind: z.literal("text"),
  // A string, or runs in different styles that flow as one text.
  // "\n" = a forced line break, a blank line ("\n\n") = a new paragraph.
  // In justified text, a line ended by "\n" is stretched to the full width
  // (so the backend can keep its own line breaks); a paragraph's last line
  // isn't, unless the text ends with "\n" (a paragraph that runs on into the
  // next column).
  text: z.union([z.string(), z.array(TextRunSchema).min(1)]),
  font: z.string().min(1), // a fonts[].id
  size: len.positive(),
  lineHeight: len.positive(),
  color: color.optional(),
  // "justify-all" also stretches each paragraph's last line, e.g. a headline
  // set flush to both edges.
  align: z.enum(["left", "center", "right", "justify", "justify-all"]).optional(),
  letterSpacing: num.optional(),
  // Extra space added to every word space (on top of the font's own).
  wordSpacing: num.optional(),
  // One line set by the backend to exactly its width (its spacing and hScale
  // already computed): it never wraps, and the plotter checks it fills the box.
  nowrap: z.boolean().optional(),
  // Horizontal squeeze applied to the glyphs (1 = none), e.g. to match a
  // source face's letter height at the same width.
  hScale: num.positive().optional(),
  vAlign: z.enum(["top", "middle", "bottom"]).optional(),
  // First-line indent of each paragraph.
  indent: num.optional(),
  // The text as Unicode, when `text` is in a legacy (pre-Unicode) font's own
  // glyph codes: what readers, search and screen readers get.
  plainText: z.string().optional(),
  // Right-to-left text (Urdu, Arabic): its words run right to left and a
  // justified line's last line sits right; and its language (BCP 47).
  direction: z.enum(["ltr", "rtl"]).optional(),
  lang: z.string().optional(),
});

export const ImageElementSchema = z.object({
  ...boxed,
  kind: z.literal("image"),
  url: z.string().min(1),
  fit: z.enum(["cover", "contain", "fill"]).optional(),
});

export const RectElementSchema = z.object({
  ...boxed,
  kind: z.literal("rect"),
  fill: color.optional(),
  stroke: color.optional(),
  strokeWidth: len.optional(),
  radius: len.optional(),
});

export const LineElementSchema = z.object({
  ...base,
  kind: z.literal("line"),
  x1: num,
  y1: num,
  x2: num,
  y2: num,
  color,
  width: len.positive(),
  dash: z.array(len).optional(),
});

// Any vector shape -- a rounded label box, an ornament -- as an SVG path:
// `d` is SVG path data in contract px, page coordinates.
export const PathElementSchema = z.object({
  ...base,
  kind: z.literal("path"),
  d: z.string().min(1),
  fill: color.optional(),
  stroke: color.optional(),
  strokeWidth: len.optional(),
});

export const ElementSchema = z.discriminatedUnion("kind", [
  TextElementSchema,
  ImageElementSchema,
  RectElementSchema,
  LineElementSchema,
  PathElementSchema,
]);

export const FontSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  weight: z.number().int().min(1).max(1000).optional(),
  style: z.enum(["normal", "italic"]).optional(),
  // The font's licence doesn't allow serving it publicly: the website shows
  // the page as an image rendered on the server instead of loading the font.
  restricted: z.boolean().optional(),
});

export const PageSchema = z.object({
  number: z.number().int().positive(),
  width: len.positive(),
  height: len.positive(),
  background: color.optional(),
  elements: z.array(ElementSchema), // drawn in order: later elements on top
});

export const IssueRenderSchema = z
  .object({
    issueDate: z.string(),
    issueNumber: z.number().int().nonnegative(),
    dpi: z.number().positive(),
    fonts: z.array(FontSchema),
    pages: z.array(PageSchema).min(1),
  })
  .superRefine((issue, ctx) => {
    const fontIds = new Set(issue.fonts.map((f) => f.id));
    const seen = new Set<string>();
    issue.pages.forEach((page, pi) => {
      page.elements.forEach((el, ei) => {
        const path = ["pages", pi, "elements", ei];
        if (seen.has(el.id)) {
          ctx.addIssue({ code: "custom", path: [...path, "id"], message: `duplicate element id "${el.id}"` });
        }
        seen.add(el.id);
        if (el.kind === "text") {
          if (!fontIds.has(el.font)) {
            ctx.addIssue({ code: "custom", path: [...path, "font"], message: `font "${el.font}" is not declared in fonts[]` });
          }
          if (Array.isArray(el.text)) {
            el.text.forEach((run, ri) => {
              if (run.font && !fontIds.has(run.font)) {
                ctx.addIssue({ code: "custom", path: [...path, "text", ri, "font"], message: `font "${run.font}" is not declared in fonts[]` });
              }
            });
          }
        }
      });
    });
    const numbers = issue.pages.map((p) => p.number);
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({ code: "custom", path: ["pages"], message: "duplicate page numbers" });
    }
  });

export type TextRun = z.infer<typeof TextRunSchema>;
export type TextElement = z.infer<typeof TextElementSchema>;
export type ImageElement = z.infer<typeof ImageElementSchema>;
export type RectElement = z.infer<typeof RectElementSchema>;
export type LineElement = z.infer<typeof LineElementSchema>;
export type PathElement = z.infer<typeof PathElementSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type Font = z.infer<typeof FontSchema>;
export type Page = z.infer<typeof PageSchema>;
export type IssueRender = z.infer<typeof IssueRenderSchema>;
