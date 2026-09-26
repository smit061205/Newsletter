// Exposes the same validated IssueResponse the website renders, as plain
// JSON over HTTP -- so the PDF generator (scripts/build_issue_pdf.py, Part E
// step 8) can fetch the exact same data the website used without either
// re-implementing fetchIssue()'s URL/auth/mock-vs-live logic in Python, or
// re-validating the contract a second time. Python trusts this route's
// output because Next has already run it through IssueResponseSchema.
//
// This is a LOCAL convenience endpoint (this app calling itself), not the
// real backend contract -- fetchIssue() still targets mock-backend.local (or
// env.backendApiUrl in live mode) exactly as before; this route just wraps
// that call for a non-browser, non-JS caller to reach.
import { fetchIssue } from "@/lib/apiClient";

export async function GET() {
  const issue = await fetchIssue();
  return Response.json(issue);
}
