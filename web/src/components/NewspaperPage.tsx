// One newspaper page: the masthead (page 1) or a running header (pages 2+),
// plus every article assigned to this page, positioned at its own backend
// px coordinates. Rendered at full size internally (PAGE.widthPx/heightPx)
// and scaled down as one unit for on-screen display -- everything INSIDE
// stays in real px, only the outer wrapper's CSS transform changes how big
// it looks on screen, so nothing here needs to know it's being displayed
// smaller than actual size (docs/FRONTEND_ROADMAP.md Part E step 7: "one
// page component, invoked once per entry in `pages`").

import type { ArticlePlacement } from "@/lib/contract";
import { PAGE } from "@/lib/gridSpec";
import { Masthead } from "./Masthead";
import { ArticleCard } from "./ArticleCard";

const DISPLAY_WIDTH_PX = 900; // on-screen width; internal coordinates are unaffected
const DISPLAY_SCALE = DISPLAY_WIDTH_PX / PAGE.widthPx;

export function NewspaperPage({
  pageNum,
  articles,
  issueNumber,
  issueDate,
}: {
  pageNum: number;
  articles: ArticlePlacement[];
  issueNumber: number;
  issueDate: string;
}) {
  return (
    <div
      style={{
        width: `${PAGE.widthPx * DISPLAY_SCALE}px`,
        height: `${PAGE.heightPx * DISPLAY_SCALE}px`,
        overflow: "hidden",
        boxShadow: "0 0 0 1px #ddd",
        background: "#fff",
      }}
    >
      <div
        style={{
          width: `${PAGE.widthPx}px`,
          height: `${PAGE.heightPx}px`,
          position: "relative",
          transform: `scale(${DISPLAY_SCALE})`,
          transformOrigin: "top left",
          background: "#fff",
        }}
      >
        {pageNum === 1 ? (
          <Masthead issueNumber={issueNumber} issueDate={issueDate} />
        ) : (
          // Provisional, not pixel-measured -- running_header.py's own
          // geometry (scripts/data/running_header_geometry.json) is still in
          // the old (172)-canonical space and hasn't been inverse-transformed
          // to (196) raw coordinates the way the masthead was (Masthead.tsx).
          // Flagged follow-up, not silently good-enough.
          <div
            style={{
              position: "absolute", left: 0, top: 0, width: "100%", height: `${20 * (300 / 72)}px`,
              borderBottom: "2px solid #00adef", display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "0 24px", boxSizing: "border-box",
              fontSize: "14pt", color: "#231f20",
            }}
          >
            <span>{pageNum}</span>
            <span>કેપિટલ ક્રાંતિ — દૈનિક (ગાંધીનગર)</span>
            <span>{issueDate}</span>
          </div>
        )}
        {articles.map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
      </div>
    </div>
  );
}
