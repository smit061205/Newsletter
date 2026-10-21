// The newspaper website view: every page of the backend's issue, plotted
// exactly as positioned (/api/render/[page], shared/src/plot.ts) -- the same HTML the
// PDF prints. Page count and each page's size come from the backend.
// In static mode it shows the page images published into public/issues
// instead (src/lib/published.ts), with any published day by ?date=.

import { fetchIssue } from "@/lib/apiClient";
import { env } from "@/lib/env";
import { readIndex, readPublished } from "@/lib/published";
import { staticWarnings, type PlotWarning } from "@ck/shared/plot";
import { PlotWarnings } from "./PlotWarnings";

const DISPLAY_WIDTH = 900;

const pdfButton = {
  display: "inline-block", marginTop: 12, padding: "8px 20px",
  background: "#2e3092", color: "#fff", borderRadius: 6,
  textDecoration: "none", fontSize: 14, fontWeight: 600,
} as const;

async function PublishedIssueView({ date }: { date?: string }) {
  const [index, issue] = await Promise.all([readIndex(), readPublished(date)]);
  if (!issue) {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        No issue has been published yet.
      </main>
    );
  }
  const cssPx = (v: number) => (v * 96) / issue.dpi;
  const warnings = issue.warnings.filter((w) => w.kind !== "white-space") as PlotWarning[];
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
        <a href={issue.pdf} download={`capital-kranti-${issue.issueDate}.pdf`} style={pdfButton}>
          Download print-ready PDF
        </a>
        {index.dates.length > 1 && (
          <nav style={{ marginTop: 12, fontSize: 13, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {index.dates.map((d) => (
              <a key={d} href={d === index.latest ? "/" : `/?date=${d}`}
                 style={{ color: d === issue.issueDate ? "#1f1f24" : "#2e3092", fontWeight: d === issue.issueDate ? 700 : 400 }}>
                {d}
              </a>
            ))}
          </nav>
        )}
      </header>
      <PlotWarnings initial={warnings} />
      {issue.pages.map((page) => {
        const w = cssPx(page.width);
        const h = cssPx(page.height);
        return (
          // eslint-disable-next-line @next/next/no-img-element -- a full-size page scan, served as is
          <img
            key={page.number}
            src={page.image}
            alt={`Page ${page.number}`}
            width={DISPLAY_WIDTH}
            height={Math.round((h * DISPLAY_WIDTH) / w)}
            style={{ maxWidth: "100%", height: "auto", boxShadow: "0 0 0 1px #ddd", background: "#fff" }}
          />
        );
      })}
    </main>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  if (env.backendMode === "static") {
    const { date } = await searchParams;
    return <PublishedIssueView date={typeof date === "string" ? date : undefined} />;
  }
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
        <a href="/api/pdf" style={pdfButton}>
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
