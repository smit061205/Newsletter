// The current issue exactly as the backend sent it, already validated
// against the render contract -- for tooling outside the Next.js app (e.g.
// scripts/replica/compare.py) that wants the same JSON the website plots.
// This app calling its own fetchIssue(); not the backend's endpoint.
import { fetchIssue } from "@/lib/apiClient";

export async function GET() {
  const issue = await fetchIssue();
  return Response.json(issue);
}
