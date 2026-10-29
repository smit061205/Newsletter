// Breaking-news alerts (lib/push.ts): the site's public key for a browser to sign up with, a sign-up, and a sign-off.
import { db } from "../../../lib/db.ts";
import { pushKeys, subscribe, unsubscribe } from "../../../lib/push.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = db();
  if (!sql) return Response.json({ error: "no database" }, { status: 503 });
  return Response.json({ key: (await pushKeys(sql)).publicKey });
}

export async function POST(req: Request) {
  const sql = db();
  if (!sql) return Response.json({ error: "no database" }, { status: 503 });
  const x = (await req.json().catch(() => null)) as { subscription?: unknown; lang?: string } | null;
  const lang = x?.lang === "en" || x?.lang === "hi" ? x.lang : "gu";
  return (await subscribe(sql, x?.subscription, lang)) ? Response.json({ ok: true }) : Response.json({ error: "not a subscription" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const sql = db();
  if (!sql) return Response.json({ error: "no database" }, { status: 503 });
  const x = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (typeof x?.endpoint === "string") await unsubscribe(sql, x.endpoint);
  return Response.json({ ok: true });
}
