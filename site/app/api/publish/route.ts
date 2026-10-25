// The newsroom's Publish (backend/src/publish-site.ts): the day's stories and
// e-paper in, then every page refreshed so readers see them at once.
import { revalidatePath } from "next/cache";
import { authorized, refuse } from "@/lib/auth.ts";
import { db } from "@/lib/db.ts";
import type { PublishPayload } from "@/lib/types.ts";
import { saveIssue } from "@/lib/write.ts";

export const maxDuration = 60;

function valid(p: PublishPayload): string | null {
  if (!p?.issue || !/^\d{4}-\d{2}-\d{2}$/.test(p.issue.date) || !Number.isInteger(p.issue.number)) return "the issue needs a date and number";
  if (!Array.isArray(p.stories) || p.stories.length > 200) return "the stories are missing";
  for (const s of p.stories) {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(s.id) || !s.headline?.trim() || typeof s.body !== "string") return `story ${s.id ?? "?"} is incomplete`;
  }
  return null;
}

export async function POST(req: Request) {
  if (!authorized(req)) return refuse();
  const sql = db();
  if (!sql) return Response.json({ error: "the website has no database" }, { status: 500 });
  const p = (await req.json().catch(() => null)) as PublishPayload;
  const problem = valid(p);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  await saveIssue(sql, p);
  for (const path of ["/", "/en"]) revalidatePath(path, "layout");
  return Response.json({ ok: true, date: p.issue.date, stories: p.stories.length });
}
