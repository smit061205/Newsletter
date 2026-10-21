// One page of the current issue, plotted as standalone HTML (shared/src/plot.ts) --
// exactly what the PDF prints. The home page shows these in scaled iframes.
//
// When the paper's fonts may not be served publicly (`restricted` in the
// issue's fonts), the page is the backend's own rendering of it, as an image:
// the browser never needs the font files.
import { fetchIssue } from "@/lib/apiClient";
import { env } from "@/lib/env";
import { plotPage } from "@ck/shared/plot";

function imagePage(src: string, pageNo: number, widthPx: number, heightPx: number, warnings: unknown[]): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>Page ${pageNo}</title>` +
    `<style>html,body{margin:0;padding:0}img{display:block;width:${widthPx}px;height:${heightPx}px}</style></head>` +
    `<body data-page="${pageNo}"><img alt="Page ${pageNo}" src="${src}">` +
    `<script>window.__plotWarnings=${JSON.stringify(warnings).replace(/</g, "\\u003c")};window.__plotDone=true;` +
    `if(window.parent!==window)window.parent.postMessage({type:"plot-warnings",page:${pageNo},warnings:window.__plotWarnings},"*");</script>` +
    `</body></html>`
  );
}

export async function GET(_request: Request, ctx: RouteContext<"/api/render/[page]">) {
  const { page } = await ctx.params;
  const pageNo = Number(page);
  try {
    const issue = await fetchIssue();
    if (!issue.pages.some((p) => p.number === pageNo)) {
      return new Response(`This issue has no page ${page}`, { status: 404 });
    }
    if (issue.fonts.some((f) => f.restricted) && env.backendMode === "live") {
      const page = issue.pages.find((p) => p.number === pageNo)!;
      const k = 96 / issue.dpi;
      // the backend's checks for this page, shown above the pages as usual
      const report = await fetch(`${env.backendApiUrl}/api/issues/${issue.issueDate}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const warnings = (report?.report?.warnings ?? []).filter((w: { page: number }) => w.page === pageNo);
      const src = `${env.backendApiUrl}/api/pages/${issue.issueDate}/${pageNo}.png`;
      return new Response(imagePage(src, pageNo, page.width * k, page.height * k, warnings),
                          { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response(plotPage(issue, pageNo), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Could not plot page ${page}:\n${message}`, {
      status: 500, headers: { "Content-Type": "text/plain" },
    });
  }
}
