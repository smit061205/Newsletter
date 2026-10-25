// The newsroom proves it's the newsroom with the publish key: a long random
// string kept in Vercel's settings (CK_PUBLISH_KEY) and in the app's Settings.
import { createHash, timingSafeEqual } from "node:crypto";

export function authorized(req: Request): boolean {
  const key = process.env.CK_PUBLISH_KEY;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!key || key.length < 24 || !got) return false;
  const a = createHash("sha256").update(key).digest(), b = createHash("sha256").update(got).digest();
  return timingSafeEqual(a, b);
}

export const refuse = () => Response.json({ error: "the publish key is missing or wrong" }, { status: 401 });
