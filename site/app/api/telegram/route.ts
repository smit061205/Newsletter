// The editor's Approve / Reject presses, as they happen (lib/telegram.ts). Telegram
// signs each delivery with the secret given when the webhook was set
// (TELEGRAM_WEBHOOK_SECRET); anything else is turned away.
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db.ts";
import { handleUpdate } from "@/lib/telegram.ts";
import { prepared } from "@/lib/write.ts";

export const dynamic = "force-dynamic";

function signed(req: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (secret.length < 24 || !got) return false;
  return timingSafeEqual(createHash("sha256").update(secret).digest(), createHash("sha256").update(got).digest());
}

export async function POST(req: Request) {
  if (!signed(req)) return Response.json({ error: "not from Telegram" }, { status: 401 });
  const sql = db();
  if (!sql) return Response.json({ error: "no database" }, { status: 500 });
  await prepared(sql);
  const result = await handleUpdate(sql, await req.json());
  if (result === "approved") for (const path of ["/", "/en"]) revalidatePath(path, "layout");
  return Response.json({ ok: true, result });
}
