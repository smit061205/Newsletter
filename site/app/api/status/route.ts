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
  return Response.json({
    ...counts[0],
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
