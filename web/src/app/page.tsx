// The real newspaper website view (docs/FRONTEND_ROADMAP.md Part E step 7).
// Fetches the current issue from the backend (mocked via MSW for now),
// groups articles by page, and renders ONE NewspaperPage component per
// entry in `pages` -- however many that is, not a hardcoded count (Part A:
// "page count is backend-driven, not hardcoded").

import { fetchIssue } from "@/lib/apiClient";
import { NewspaperPage } from "@/components/NewspaperPage";
import type { ArticlePlacement } from "@/lib/contract";

export default async function Home() {
  const issue = await fetchIssue();

  const articlesByPage = new Map<number, ArticlePlacement[]>();
  for (const article of issue.articles) {
    const list = articlesByPage.get(article.page) ?? [];
    list.push(article);
    articlesByPage.set(article.page, list);
  }

  const pageNumbers = Array.from({ length: issue.pages }, (_, i) => i + 1);

  return (
    <main
      style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: 32, padding: "32px 16px", background: "#f0f0f0", minHeight: "100vh",
      }}
    >
      <header style={{ textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
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
      {pageNumbers.map((pageNum) => (
        <NewspaperPage
          key={pageNum}
          pageNum={pageNum}
          articles={articlesByPage.get(pageNum) ?? []}
          issueNumber={issue.issueNumber}
          issueDate={issue.issueDate}
        />
      ))}
    </main>
  );
}
