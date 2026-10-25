// How the website is doing, in public figures only: the hourly runs (how late
// GitHub started them, whether the sources answered), today's use of the free
// plans' ceilings, and the stories waiting for their English.
import { db } from "@/lib/db.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = db();
  if (!sql) return Response.json({ error: "no database" }, { status: 500 });
  const [runs, usage, waiting, counts] = await Promise.all([
    sql.query(`select id, kind, scheduled_for, started_at, finished_at, ok, details from runs order by id desc limit 24`).catch(() => []),
    sql.query(`select day::text, kind, n from usage where day > (now() at time zone 'Asia/Kolkata')::date - 7 order by day desc, kind`).catch(() => []),
    sql.query(`select en_status, tag_status, count(*)::int as n from stories group by 1, 2`).catch(() => []),
    sql.query(`select (select count(*) from stories)::int as stories, (select count(*) from issues)::int as issues`).catch(() => [{}]),
  ]);
  // can the site read its private photo store? (a yes/no and the library's message, never the key)
  const [one] = await sql.query(`select photo->>'url' as url from stories where photo is not null limit 1`).catch(() => []);
  const name = (one?.url as string | undefined)?.replace(/^\/media\//, "");
  const photos = { key: !!process.env.BLOB_READ_WRITE_TOKEN, name: name ?? null,
    head: name ? await head(name).then((b) => `found (${b.size} bytes)`, (e) => `failed: ${e instanceof Error ? e.message : e}`) : null,
    get: name ? await get(name, { access: "private" }).then((r) => (r ? "found" : "null"), (e) => `failed: ${e instanceof Error ? e.message : e}`) : null };
  return Response.json({
    ...counts[0], photos,
    stories_by_state: waiting,
    usage,
    runs: runs.map((r) => ({
      id: r.id, kind: r.kind, ok: r.ok, scheduled_for: r.scheduled_for, started_at: r.started_at, finished_at: r.finished_at,
      late_minutes: r.scheduled_for ? Math.round((Date.parse(r.started_at) - Date.parse(r.scheduled_for)) / 60000) : null,
      sources: (r.details?.sources ?? []).map((s: { name: string; status: number; items?: number; ms: number }) => ({ name: s.name, status: s.status, items: s.items, ms: s.ms })),
      stories: r.details?.stories ?? null, done: r.details?.done, error: r.details?.error,
    })),
  }, { headers: { "cache-control": "no-store" } });
}
