// Headlines for the reader's saved stories (the Saved page lists them from the browser).
import { db } from "@/lib/db.ts";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const ids = (u.searchParams.get("ids") ?? "").split(",").filter((x) => /^[a-z][a-z0-9-]{1,40}$/.test(x)).slice(0, 50);
  const en = u.searchParams.get("lang") === "en";
  const sql = db();
  if (!sql || !ids.length) return Response.json({ stories: [] });
  const rows = await sql.query(`select id, headline, en, en_status from stories where id = any($1::text[]) and status = 'published'`, [ids]);
  const byId = new Map(rows.map((r) => [r.id as string, en && r.en_status === "done" ? (r.en as { headline: string }).headline : (r.headline as string)]));
  return Response.json({ stories: ids.filter((id) => byId.has(id)).map((id) => ({ id, headline: byId.get(id) })) });
}
