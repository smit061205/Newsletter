// The newspaper website view: every page of the backend's issue, plotted
// exactly as positioned (/api/render/[page], lib/plot.ts) -- the same HTML the
// PDF prints. Page count and each page's size come from the backend.

import { fetchIssue } from "@/lib/apiClient";
import { staticWarnings } from "@/lib/plot";
import { PlotWarnings } from "./PlotWarnings";

const DISPLAY_WIDTH = 900;

export default async function Home() {
  const issue = await fetchIssue();
  const cssPx = (v: number) => (v * 96) / issue.dpi;

  return (
    <main
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 32, padding: "32px 16px", background: "#f0f0f0", minHeight: "100vh",
      }}
    >
      <header style={{ textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#1f1f24" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          {issue.issueDate} · Issue #{issue.issueNumber} · {issue.pages.length} page
          {issue.pages.length === 1 ? "" : "s"}
        </h1>
        <a
          href="/api/pdf"
          style={{
            display: "inline-block", marginTop: 12, padding: "8px 20px",
            background: "#2e3092", color: "#fff", borderRadius: 6,
            textDecoration: "none", fontSize: 14, fontWeight: 600,
          }}
        >
          Download print-ready PDF
        </a>
      </header>
      <PlotWarnings initial={staticWarnings(issue)} />
      {issue.pages.map((page) => {
        const w = cssPx(page.width);
        const h = cssPx(page.height);
        const scale = DISPLAY_WIDTH / w;
        return (
          <div
            key={page.number}
            style={{ width: DISPLAY_WIDTH, height: h * scale, overflow: "hidden", boxShadow: "0 0 0 1px #ddd", background: "#fff" }}
          >
            <iframe
              src={`/api/render/${page.number}`}
              title={`Page ${page.number}`}
              style={{ width: w, height: h, border: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}
            />
          </div>
        );
      })}
    </main>
  );
}
