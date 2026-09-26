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

export const TextElementSchema = z.object({
  ...boxed,
  kind: z.literal("text"),
  // "\n" = a forced line break, a blank line ("\n\n") = a new paragraph.
  text: z.string(),
  font: z.string().min(1), // a fonts[].id
  size: len.positive(),
  lineHeight: len.positive(),
  color: color.optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  letterSpacing: num.optional(),
  // Horizontal squeeze applied to the glyphs (1 = none), e.g. to match a
  // source face's letter height at the same width.
  hScale: num.positive().optional(),
  vAlign: z.enum(["top", "middle", "bottom"]).optional(),
  // First-line indent of each paragraph.
  indent: num.optional(),
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

export const ElementSchema = z.discriminatedUnion("kind", [
  TextElementSchema,
  ImageElementSchema,
  RectElementSchema,
  LineElementSchema,
]);

export const FontSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  weight: z.number().int().min(1).max(1000).optional(),
  style: z.enum(["normal", "italic"]).optional(),
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
        if (el.kind === "text" && !fontIds.has(el.font)) {
          ctx.addIssue({ code: "custom", path: [...path, "font"], message: `font "${el.font}" is not declared in fonts[]` });
        }
      });
    });
    const numbers = issue.pages.map((p) => p.number);
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({ code: "custom", path: ["pages"], message: "duplicate page numbers" });
    }
  });

export type TextElement = z.infer<typeof TextElementSchema>;
export type ImageElement = z.infer<typeof ImageElementSchema>;
export type RectElement = z.infer<typeof RectElementSchema>;
export type LineElement = z.infer<typeof LineElementSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type Font = z.infer<typeof FontSchema>;
export type Page = z.infer<typeof PageSchema>;
export type IssueRender = z.infer<typeof IssueRenderSchema>;
