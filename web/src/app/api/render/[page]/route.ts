// One laid-out newspaper page as standalone HTML -- the exact markup the
// print PDF is made from (scripts/layout/engine.py writes both), so the
// website view and the PDF cannot disagree. The home page shows these in
// scaled iframes.
import fs from "node:fs/promises";
import path from "node:path";
import { runEngine } from "@/lib/engine";

export async function GET(request: Request, ctx: RouteContext<"/api/render/[page]">) {
  const { page } = await ctx.params;
  const pageNo = Number(page);
  if (!Number.isInteger(pageNo) || pageNo < 1) {
    return new Response(`Not a page number: ${page}`, { status: 400 });
  }
  try {
    const result = await runEngine(new URL("/api/issue", request.url).toString());
    if (pageNo > result.pages) {
      return new Response(`This issue has ${result.pages} page(s)`, { status: 404 });
    }
    const html = await fs.readFile(path.join(result.dir, `page-${pageNo}.web.html`), "utf8");
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Layout failed:\n${message}`, { status: 500, headers: { "Content-Type": "text/plain" } });
  }
}
