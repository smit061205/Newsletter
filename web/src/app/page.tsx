// The newspaper website view. The page count comes from the backend
// (IssueResponse.pages), and every page is the exact HTML the layout engine
// produced for the print PDF (/api/render/[page], scripts/layout/engine.py) --
// one engine for both, so what's on screen is what prints.

import { fetchIssue } from "@/lib/apiClient";

// The engine lays pages out at the real (196) page size: 1105.5 x 1488.2pt,
// which is 1474 x 1984.3 CSS px. Shown scaled down to DISPLAY_WIDTH.
const PAGE_W_PX = (1105.5 * 4) / 3;
const PAGE_H_PX = (1488.2 * 4) / 3;
const DISPLAY_WIDTH = 900;
const SCALE = DISPLAY_WIDTH / PAGE_W_PX;

export default async function Home() {
  const issue = await fetchIssue();
  const pageNumbers = Array.from({ length: issue.pages }, (_, i) => i + 1);

  return (
    <main
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 32, padding: "32px 16px", background: "#f0f0f0", minHeight: "100vh",
      }}
    >
      <header style={{ textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#1f1f24" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          {issue.issueDate} · Issue #{issue.issueNumber} · {issue.pages} page{issue.pages === 1 ? "" : "s"}
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
      {pageNumbers.map((n) => (
        <div
          key={n}
          style={{
            width: DISPLAY_WIDTH, height: PAGE_H_PX * SCALE, overflow: "hidden",
            boxShadow: "0 0 0 1px #ddd", background: "#fff",
          }}
        >
          <iframe
            src={`/api/render/${n}`}
            title={`Page ${n}`}
            loading={n === 1 ? "eager" : "lazy"}
            style={{
              width: PAGE_W_PX, height: PAGE_H_PX, border: 0,
              transform: `scale(${SCALE})`, transformOrigin: "top left",
            }}
          />
        </div>
      ))}
    </main>
  );
}
