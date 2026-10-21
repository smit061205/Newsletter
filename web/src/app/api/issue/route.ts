// The current issue exactly as the backend sent it, already validated
// against the render contract -- for tooling outside the Next.js app (e.g.
// scripts/replica/compare.py) that wants the same JSON the website plots.
// This app calling its own fetchIssue(); not the backend's endpoint.
// In static mode, the published issue's summary (public/issues).
import { fetchIssue } from "@/lib/apiClient";
import { env } from "@/lib/env";
import { readPublished } from "@/lib/published";

export async function GET() {
  if (env.backendMode === "static") {
    const published = await readPublished();
    return published ? Response.json(published) : Response.json({ error: "no issue published yet" }, { status: 404 });
  }
  const issue = await fetchIssue();
  return Response.json(issue);
}
