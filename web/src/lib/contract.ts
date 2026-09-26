// The backend API contract (docs/FRONTEND_ROADMAP.md Part D) -- one
// definition that is BOTH the runtime validator (Zod) and the TypeScript
// type (z.infer), so the type and the check can never drift apart. Every
// response from apiClient.ts is parsed through IssueResponseSchema before
// anything else in this codebase touches it -- a field-name mismatch or a
// missing value fails loudly here, not as a silently broken layout three
// components downstream.
//
// This is a DRAFT to negotiate with the backend (your brother), not a spec
// he's already agreed to -- see docs/FRONTEND_ROADMAP.md Part F for the
// open items (bodyText shape, kicker field, open-slot representation, etc.)
// still to confirm.

import { z } from "zod";

// Confirmed by the user: "ad" is a real placement type alongside editorial
// content, and the field is always present (used to pick rendering/QA rules
// per box) -- not something the frontend infers. "news" vs "article" is
// still unconfirmed *why* they're distinct (open item below).
export const ArticleTypeSchema = z.enum(["news", "article", "ad"]);
export type ArticleType = z.infer<typeof ArticleTypeSchema>;

export const ArticlePlacementSchema = z.object({
  id: z.string(),
  page: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  type: ArticleTypeSchema,
  title: z.string(),
  kicker: z.string().optional(),
  bodyText: z.string(),
  // Confirmed by the user: ALWAYS present as a field -- "" means no photo,
  // not an absent/undefined field. Distinct from kicker/photoCaption, which
  // stay genuinely optional until confirmed otherwise.
  photoUrl: z.string(),
  photoCaption: z.string().optional(),
});
export type ArticlePlacement = z.infer<typeof ArticlePlacementSchema>;

/** true if this placement has a real photo to render, false for "" (no photo). */
export function hasPhoto(article: ArticlePlacement): boolean {
  return article.photoUrl.trim().length > 0;
}

export const IssueResponseSchema = z.object({
  issueDate: z.string(),
  issueNumber: z.number().int().nonnegative(),
  pages: z.number().int().positive(),
  articles: z.array(ArticlePlacementSchema),
});
export type IssueResponse = z.infer<typeof IssueResponseSchema>;
