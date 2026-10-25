// One file of a published day (a story's photo, an e-paper page, the e-paper
// PDF) into the photo store, under the free plan's daily ceiling. The file's
// path names its day and content, so a republish of an unchanged photo costs nothing.
import { head, put } from "@vercel/blob";
import { authorized, refuse } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import { count } from "@/lib/write.ts";

export const maxDuration = 60;
const DAILY_UPLOADS = Number(process.env.CK_DAILY_UPLOADS ?? 50);
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };

export async function POST(req: Request) {
  if (!authorized(req)) return refuse();
  const sql = db();
  if (!sql) return Response.json({ error: "the website has no database" }, { status: 500 });
  const name = new URL(req.url).searchParams.get("path") ?? "";
  // photos/<date>/<name>.jpg, epaper/<date>/<name>.(jpg|pdf)
  const m = name.match(/^(photos|epaper)\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\.(jpg|jpeg|png|pdf)$/);
  if (!m) return Response.json({ error: "a file path like photos/2026-10-25/p2326794-1a2b3c.jpg" }, { status: 400 });
  const existing = await head(name).catch(() => null);
  if (existing) return Response.json({ url: existing.url, reused: true });
  const today = await count(sql, "upload", 0);
  if (today >= DAILY_UPLOADS) return Response.json({ error: `today's ${DAILY_UPLOADS} uploads are used (the free photo store's ceiling)` }, { status: 429 });
  const body = await req.arrayBuffer();
  if (!body.byteLength || body.byteLength > 4_000_000) return Response.json({ error: "a file between 1 byte and 4 MB" }, { status: 413 });
  const blob = await put(name, body, { access: "public", contentType: TYPES[m[2]], addRandomSuffix: false, allowOverwrite: true,
                                        cacheControlMaxAge: 31_536_000 });
  await count(sql, "upload");
  return Response.json({ url: blob.url });
}
