// "Download print-ready PDF": the current issue, every page plotted exactly
// as the backend positioned it and printed by Chromium at the backend's page
// size (lib/pdf.ts). Any warnings (text overflowing its box, failed images or
// fonts, elements off the page) ride along in the X-Plot-Warnings header;
// `?warnings=1` returns them as JSON instead of the PDF.
import { fetchIssue } from "@/lib/apiClient";
import { printIssue } from "@/lib/pdf";

export async function GET(request: Request) {
  try {
    const issue = await fetchIssue();
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
