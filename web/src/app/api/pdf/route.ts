// "Download print-ready PDF": the current issue, every page plotted exactly
// as the backend positioned it and printed by Chromium at the backend's page
// size (shared/src/pdf.ts). Any warnings (text overflowing its box, failed images or
// fonts, elements off the page) ride along in the X-Plot-Warnings header;
// `?warnings=1` returns them as JSON instead of the PDF.
import { fetchIssue } from "@/lib/apiClient";
import { env } from "@/lib/env";
import { readPublished } from "@/lib/published";
import { printIssue } from "@ck/shared/pdf";

export async function GET(request: Request) {
  try {
    if (env.backendMode === "static") {
      // the published PDF, a plain file under public/issues
      const published = await readPublished(new URL(request.url).searchParams.get("date") ?? undefined);
      if (!published) return new Response("No issue has been published yet", { status: 404 });
      return Response.redirect(new URL(published.pdf, request.url), 307);
    }
    const issue = await fetchIssue();
    if (issue.fonts.some((f) => f.restricted) && env.backendMode === "live") {
      // the paper's licensed fonts live on the backend only: hand over its PDF
      const [pdfRes, reportRes] = await Promise.all([
        fetch(`${env.backendApiUrl}/api/issues/${issue.issueDate}/pdf`, { cache: "no-store" }),
        fetch(`${env.backendApiUrl}/api/issues/${issue.issueDate}`, { cache: "no-store" }),
      ]);
      if (!pdfRes.ok) throw new Error(`the backend has no PDF for ${issue.issueDate} (${pdfRes.status})`);
      const warnings = reportRes.ok ? ((await reportRes.json()).report?.warnings ?? []) : [];
      if (new URL(request.url).searchParams.has("warnings")) {
        return Response.json({ pages: issue.pages.length, warnings });
      }
      return new Response(await pdfRes.arrayBuffer(), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="capital-kranti-${issue.issueDate}.pdf"`,
          "X-Plot-Warnings": String(warnings.length),
        },
      });
    }
    const { pdf, warnings } = await printIssue(issue, new URL(request.url).origin);
    if (new URL(request.url).searchParams.has("warnings")) {
      return Response.json({ pages: issue.pages.length, warnings });
    }
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="capital-kranti-${issue.issueDate}.pdf"`,
        "X-Plot-Warnings": String(warnings.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`PDF generation failed:\n${message}`, {
      status: 500, headers: { "Content-Type": "text/plain" },
    });
  }
}
