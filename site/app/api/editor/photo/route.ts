// A photo for a story the editor writes (app/(gu)/editor/write): taken from the phone, made smaller in the browser
// (at most 1,600 pixels, a JPEG), and kept in the photo store with the day's live news photos, which /media serves.
// Only a signed-in editor; at most 40 a day, beside the paper's own uploads.
import { put } from "@vercel/blob";
import { cookies } from "next/headers";
import { db } from "@/lib/db.ts";
import { COOKIE, editorOf } from "@/lib/editor.ts";
import { count } from "@/lib/write.ts";

export const maxDuration = 60;
const DAILY = 40;

export async function POST(req: Request) {
  if (!editorOf((await cookies()).get(COOKIE)?.value)) return Response.json({ error: "not signed in" }, { status: 401 });
  const sql = db();
  if (!sql) return Response.json({ error: "the website has no database" }, { status: 500 });
  const q = new URL(req.url).searchParams;
  const width = Math.round(Number(q.get("w"))), height = Math.round(Number(q.get("h")));
  if (!(width > 0 && width <= 4000 && height > 0 && height <= 4000)) return Response.json({ error: "the photo's size" }, { status: 400 });
  if ((await count(sql, "upload_editor", 0)) >= DAILY) return Response.json({ error: "today's photos are used" }, { status: 429 });
  const body = await req.arrayBuffer();
  if (!body.byteLength || body.byteLength > 4_000_000) return Response.json({ error: "a photo up to 4 MB" }, { status: 413 });
  const b = new Uint8Array(body);
  if (b[0] !== 0xff || b[1] !== 0xd8) return Response.json({ error: "a JPEG" }, { status: 415 });
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const name = `live/${day}/ed-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
  await put(name, body, { access: "private", contentType: "image/jpeg", addRandomSuffix: false });
  await Promise.all([count(sql, "upload_editor"), count(sql, "upload")]);
  return Response.json({ url: `/media/${name}`, width, height });
}
