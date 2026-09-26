// One page of the current issue, plotted as standalone HTML (lib/plot.ts) --
// exactly what the PDF prints. The home page shows these in scaled iframes.
import { fetchIssue } from "@/lib/apiClient";
import { plotPage } from "@/lib/plot";

export async function GET(_request: Request, ctx: RouteContext<"/api/render/[page]">) {
  const { page } = await ctx.params;
  const pageNo = Number(page);
  try {
    const issue = await fetchIssue();
    if (!issue.pages.some((p) => p.number === pageNo)) {
      return new Response(`This issue has no page ${page}`, { status: 404 });
    }
    return new Response(plotPage(issue, pageNo), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Could not plot page ${page}:\n${message}`, {
      status: 500, headers: { "Content-Type": "text/plain" },
    });
  }
}
