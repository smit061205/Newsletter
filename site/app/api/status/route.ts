// How the website is doing, in public figures only: the hourly runs (how late
// GitHub started them, whether the sources answered), today's use of the free
// plans' ceilings, and the stories waiting for their English.
import { get, head } from "@vercel/blob";
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
  // Aavtikal's desk: its last rounds (what it did, step by step) and the published articles' state, all public
  // (headlines and links are on the site already); held articles only counted
  const [deskRuns, arts, held, redone] = await Promise.all([
    sql.query(`select id, started_at, finished_at, ok, details from runs where kind = 'desk' order by id desc limit 4`).catch(() => []),
    sql.query(`select id, beat, author, en is not null and en->>'headline' <> '' and concat_ws(' ', en->>'headline', en->>'body') !~ '[\u0980-\u0DFF]' as en,
       hi is not null and (hi->>'headline') ~ '[\u0900-\u097F]' and concat_ws(' ', hi->>'headline', hi->>'body') !~ '[\u0980-\u0DFF]' as hi, photo is not null as photo, jsonb_array_length(figures)::int as figures,
                 coalesce((checks->>'rewritten')::boolean, false) as rewritten, (checks->>'words')::int as words, published_at, updated_at
               from features where status = 'published' order by published_at desc limit 60`).catch(() => []),
    sql.query(`select count(*)::int as n from features where status = 'held'`).catch(() => [{ n: null }]),
    sql.query(`select value from state where key = 'desk_redone_3'`).catch(() => []),
  ]);
  // can the site read its private photo store? (a yes/no and the library's message, never the key)
  const [one] = await sql.query(`select photo->>'url' as url from stories where photo is not null limit 1`).catch(() => []);
  const name = (one?.url as string | undefined)?.replace(/^\/media\//, "");
  const photos = { key: !!process.env.BLOB_READ_WRITE_TOKEN, name: name ?? null,
    head: name ? await head(name).then((b) => `found (${b.size} bytes)`, (e) => `failed: ${e instanceof Error ? e.message : e}`) : null,
    get: name ? await get(name, { access: "private" }).then((r) => (r ? "found" : "null"), (e) => `failed: ${e instanceof Error ? e.message : e}`) : null };
  return Response.json({
    ...counts[0], photos,
    aavtikal: {
      held: held[0]?.n ?? null, tried_again: String(redone[0]?.value ?? "").split("\n").filter(Boolean),
      articles: arts,
      desk: deskRuns.map((r) => ({ id: r.id, started_at: r.started_at, finished_at: r.finished_at, ok: r.ok,
        counts: Object.fromEntries(Object.entries(r.details ?? {}).filter(([, v]) => typeof v === "number")), error: r.details?.error ?? null, log: r.details?.log ?? [] })),
    },
    stories_by_state: waiting,
    usage,
    runs: runs.map((r) => ({
      id: r.id, kind: r.kind, ok: r.ok, scheduled_for: r.scheduled_for, started_at: r.started_at, finished_at: r.finished_at,
      late_minutes: r.scheduled_for ? Math.round((Date.parse(r.started_at) - Date.parse(r.scheduled_for)) / 60000) : null,
      sources: (r.details?.sources ?? []).map((s: { name: string; status: number; items?: number; ms: number }) => ({ name: s.name, status: s.status, items: s.items, ms: s.ms })),
      stories: r.details?.stories ?? null, done: r.details?.done, error: r.details?.error,
      ...(r.kind === "engine" ? { steps: r.details?.steps ?? null, log: (r.details?.log ?? []).slice(-40) } : {}),
    })),
  }, { headers: { "cache-control": "no-store" } });
}
