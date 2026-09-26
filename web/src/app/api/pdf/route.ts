// Download-PDF route (the user's original ask: "i want a download pdf
// button also which gives out print ready perfect newspaper pdf"), now
// wired to the backend-driven pipeline (docs/FRONTEND_ROADMAP.md Part E
// step 8) instead of the archived one-off page scripts. Shells out to
// scripts/build_issue_pdf.py, which fetches this SAME app's /api/issue
// route and composites the print PDF with layout_lib.py + WeasyPrint --
// the one Python/WeasyPrint dependency this frontend still has, matching
// Part G's stack decision ("frontend generates the PDF").
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ROOT = "/Users/smitthakkar/NewsPaper_Project";
const SCRIPT = path.join(ROOT, "scripts", "build_issue_pdf.py");

export async function GET(request: Request) {
  const outPath = path.join(os.tmpdir(), `capital-kranti-${randomUUID()}.pdf`);
  const issueUrl = new URL("/api/issue", request.url).toString();

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("python3", [SCRIPT, "--url", issueUrl, "--out", outPath]);
      let stderr = "";
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`build_issue_pdf.py exited ${code}\n${stderr}`));
      });
    });

    const pdfBytes = await fs.readFile(outPath);
    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="capital-kranti-issue.pdf"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`PDF generation failed:\n${message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  } finally {
    await fs.unlink(outPath).catch(() => {});
  }
}
