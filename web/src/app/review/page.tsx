import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";

// Editorial review surface for scripts/daily_build.py's output (Phase 9/Part F
// in docs/PRECISION_ROADMAP.md). Reads the manifest + page images the Python
// orchestrator writes at build time (scripts/review_manifest.py) -- a static
// image + structured JSON per run, not a live PDF renderer, since this page
// only ever needs to show what a specific run already produced.

const REVIEW_DIR = path.join(process.cwd(), "public", "review");

interface RunIndexEntry {
  runName: string;
  status: "READY" | "NEEDS_REVIEW";
  builtAt: string;
}

interface FrameResult {
  status: "PASS" | "FAIL" | "WARN" | "NOT_BUILT";
  frameId: string;
  message: string;
}

interface RunLogEntry {
  kind: string;
  frameId: string;
  message: string;
}

interface PageManifest {
  pageNum: number;
  image: string;
  counts: { PASS: number; FAIL: number; WARN: number; NOT_BUILT: number };
  frameResults: FrameResult[];
}

interface RunManifest {
  runName: string;
  status: "READY" | "NEEDS_REVIEW";
  builtAt: string;
  pdfPath: string;
  runLog: RunLogEntry[];
  pages: PageManifest[];
}

function readIndex(): RunIndexEntry[] {
  const indexPath = path.join(REVIEW_DIR, "index.json");
  if (!fs.existsSync(indexPath)) return [];
  return JSON.parse(fs.readFileSync(indexPath, "utf-8"));
}

function readManifest(runName: string): RunManifest | null {
  const manifestPath = path.join(REVIEW_DIR, runName, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
}

const RUN_LOG_LABELS: Record<string, { label: string; tone: "bad" | "warn" }> = {
  CONTENT_OVERFLOW: { label: "Content overflow", tone: "bad" },
  MISSING_FONT_ASSET: { label: "Missing font asset", tone: "bad" },
  SKIPPED_ASSIGNMENT: { label: "Skipped assignment", tone: "bad" },
  SKIPPED_FRAME: { label: "Skipped frame", tone: "bad" },
  AUTO_SHRUNK: { label: "Auto-shrunk to fit", tone: "warn" },
};

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run: requestedRun } = await searchParams;
  const index = readIndex();

  if (index.length === 0) {
    return (
      <main style={{ padding: "48px", fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>No runs yet</h1>
        <p style={{ color: "#555", lineHeight: 1.6 }}>
          Nothing has been built through <code>scripts/daily_build.py</code> yet. Run it once
          from the project root — <code>python3 scripts/daily_build.py</code> — and this page
          will show the result.
        </p>
      </main>
    );
  }

  const runName = requestedRun ?? index[0].runName;
  const manifest = readManifest(runName);
  if (!manifest) notFound();

  const isReady = manifest.status === "READY";
  const totalCounts = manifest.pages.reduce(
    (acc, p) => ({
      PASS: acc.PASS + p.counts.PASS,
      FAIL: acc.FAIL + p.counts.FAIL,
      WARN: acc.WARN + p.counts.WARN,
      NOT_BUILT: acc.NOT_BUILT + p.counts.NOT_BUILT,
    }),
    { PASS: 0, FAIL: 0, WARN: 0, NOT_BUILT: 0 }
  );

  return (
    // Explicit color here, not just background: this page uses a fixed light
    // palette (it doesn't adapt to dark mode itself), so it must not inherit
    // globals.css's --foreground variable, which flips to a near-white
    // #ededed under prefers-color-scheme:dark -- found as a real bug (every
    // <code> tag rendering as light-grey-on-light-grey, functionally
    // invisible) by inspecting actual computed styles in the browser rather
    // than trusting a screenshot that happened to look fine at a glance.
    <main style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#f6f7f9", color: "#111827", minHeight: "100vh" }}>
      <style>{`
        .badge { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:999px; font-size:13px; font-weight:600; }
        .badge-ready { background:#dcfce7; color:#166534; }
        .badge-review { background:#fef3c7; color:#92400e; }
        .badge-pass { background:#dcfce7; color:#166534; }
        .badge-fail { background:#fee2e2; color:#991b1b; }
        .badge-warn { background:#fef3c7; color:#92400e; }
        .badge-notbuilt { background:#f1f5f9; color:#64748b; }
        .card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; color:#111827; }
        .run-link { display:block; padding:8px 12px; border-radius:6px; font-size:13px; color:#374151; }
        .run-link:hover { background:#f1f5f9; }
        .run-link.active { background:#eef2ff; color:#3730a3; font-weight:600; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        th { text-align:left; padding:6px 10px; color:#6b7280; font-weight:600; border-bottom:1px solid #e5e7eb; }
        td { padding:6px 10px; border-bottom:1px solid #f1f5f9; vertical-align:top; color:#111827; }
        code { background:#f1f5f9; color:#334155; padding:1px 5px; border-radius:4px; font-size:12px; }
      `}</style>

      <div style={{ display: "flex", maxWidth: 1400, margin: "0 auto" }}>
        {/* run picker sidebar */}
        <aside style={{ width: 220, padding: "24px 12px", flexShrink: 0 }}>
          <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "#6b7280", padding: "0 12px 8px" }}>
            Runs
          </h2>
          {index.map((entry) => (
            <a
              key={entry.runName}
              href={`/review?run=${entry.runName}`}
              className={`run-link ${entry.runName === runName ? "active" : ""}`}
            >
              <div>{entry.runName}</div>
              <div style={{ fontSize: 11, color: entry.status === "READY" ? "#166534" : "#92400e" }}>
                {entry.status}
              </div>
            </a>
          ))}
        </aside>

        {/* main content */}
        <div style={{ flex: 1, padding: "24px 24px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>{manifest.runName}</h1>
            <span className={`badge ${isReady ? "badge-ready" : "badge-review"}`}>
              {isReady ? "● READY TO PRINT" : "◆ NEEDS REVIEW"}
            </span>
          </div>
          <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>
            Built {new Date(manifest.builtAt).toLocaleString()} · <code>{manifest.pdfPath}</code>
          </p>

          {/* overall QA summary */}
          <div className="card" style={{ padding: "16px 20px", marginBottom: 24, display: "flex", gap: 24 }}>
            <SummaryStat label="Pass" value={totalCounts.PASS} tone="pass" />
            <SummaryStat label="Fail" value={totalCounts.FAIL} tone="fail" />
            <SummaryStat label="Warn" value={totalCounts.WARN} tone="warn" />
            <SummaryStat label="Not built" value={totalCounts.NOT_BUILT} tone="notbuilt" />
          </div>

          {/* run log: overflow, missing fonts, auto-shrink, skipped assignments */}
          {manifest.runLog.length > 0 && (
            <div className="card" style={{ padding: "16px 20px", marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Build log</h2>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Event</th>
                    <th style={{ width: 100 }}>Frame</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {manifest.runLog.map((entry, i) => {
                    const meta = RUN_LOG_LABELS[entry.kind] ?? { label: entry.kind, tone: "warn" as const };
                    return (
                      <tr key={i}>
                        <td>
                          <span className={`badge ${meta.tone === "bad" ? "badge-fail" : "badge-warn"}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td><code>{entry.frameId}</code></td>
                        <td style={{ color: "#374151" }}>{entry.message}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* per-page: image + QA results */}
          {manifest.pages.map((p) => (
            <PageSection key={p.pageNum} page={p} />
          ))}
        </div>
      </div>
    </main>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: "pass" | "fail" | "warn" | "notbuilt" }) {
  const colors: Record<string, string> = { pass: "#166534", fail: "#991b1b", warn: "#92400e", notbuilt: "#64748b" };
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: colors[tone] }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
    </div>
  );
}

function PageSection({ page }: { page: PageManifest }) {
  const failingFrames = page.frameResults.filter((f) => f.status === "FAIL");
  return (
    <div className="card" style={{ marginBottom: 24, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700 }}>Page {page.pageNum}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {page.counts.PASS > 0 && <span className="badge badge-pass">{page.counts.PASS} pass</span>}
          {page.counts.FAIL > 0 && <span className="badge badge-fail">{page.counts.FAIL} fail</span>}
          {page.counts.WARN > 0 && <span className="badge badge-warn">{page.counts.WARN} warn</span>}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px", padding: 16, borderRight: "1px solid #e5e7eb" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.image} alt={`Page ${page.pageNum}`} style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 6 }} />
        </div>
        <div style={{ flex: "1 1 320px", padding: 16, maxHeight: 500, overflowY: "auto" }}>
          {failingFrames.length > 0 ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#991b1b", marginBottom: 8 }}>Needs attention</h3>
              <table style={{ marginBottom: 16 }}>
                <tbody>
                  {failingFrames.map((f, i) => (
                    <tr key={i}>
                      <td style={{ width: 90 }}><code>{f.frameId}</code></td>
                      <td style={{ color: "#991b1b" }}>{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "#166534", marginBottom: 16 }}>All checks pass on this page.</p>
          )}
          <details>
            <summary style={{ fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
              All {page.frameResults.length} checks
            </summary>
            <table style={{ marginTop: 8 }}>
              <tbody>
                {page.frameResults.map((f, i) => (
                  <tr key={i}>
                    <td style={{ width: 60 }}>
                      <span className={`badge badge-${f.status.toLowerCase().replace("_", "")}`} style={{ fontSize: 10, padding: "2px 8px" }}>
                        {f.status}
                      </span>
                    </td>
                    <td style={{ width: 80 }}><code>{f.frameId}</code></td>
                    <td style={{ color: "#374151", fontSize: 12 }}>{f.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </div>
    </div>
  );
}
