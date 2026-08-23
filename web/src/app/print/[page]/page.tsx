import { notFound } from "next/navigation";
import { PAGE, LIVE_AREA } from "@/lib/gridSpec";
import { getPageFrames, PAGE_NUMBERS, type PageNumber } from "@/lib/frames";

// Bare export surface, one per newspaper page: no nav, no chrome. This is what
// Playwright screenshots for editor preview and what pdf-lib's export script
// (scripts/export-page1.mjs) draws directly from the same underlying data --
// see src/lib/template.json for the full 149-frame reconciled dataset.
export function generateStaticParams() {
  return PAGE_NUMBERS.map((page) => ({ page }));
}

export default async function PrintPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!PAGE_NUMBERS.includes(page as PageNumber)) notFound();
  const frames = getPageFrames(page as PageNumber);

  return (
    <>
      <style>{`
        @page { size: ${PAGE.widthPt}pt ${PAGE.heightPt}pt; margin: 0; }
        body { display: block !important; }
      `}</style>
      <div
        style={{
          position: "relative",
          width: `${PAGE.widthPt}pt`,
          height: `${PAGE.heightPt}pt`,
          background: "#fff",
          overflow: "hidden",
          margin: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: `${LIVE_AREA.x0}pt`,
            top: `${LIVE_AREA.y0}pt`,
            width: `${LIVE_AREA.x1 - LIVE_AREA.x0}pt`,
            height: `${LIVE_AREA.y1 - LIVE_AREA.y0}pt`,
            border: "0.24pt dashed #999",
          }}
        />
        {frames.map((f, i) => (
          <div
            key={f.id}
            title={f.labelHint ?? f.type}
            style={{
              position: "absolute",
              left: `${f.x0}pt`,
              top: `${f.y0}pt`,
              width: `${f.x1 - f.x0}pt`,
              height: `${f.y1 - f.y0}pt`,
              border: `1pt solid ${frameColor(f.type)}`,
              background: `${frameColor(f.type)}1a`,
              fontFamily: "Arial, sans-serif",
              fontSize: "7pt",
              color: frameColor(f.type),
              overflow: "hidden",
              boxSizing: "border-box",
              padding: "1pt 2pt",
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </>
  );
}

function frameColor(type: string): string {
  switch (type) {
    case "chrome": return "#8C1EBE";
    case "masthead":
    case "running_header": return "#C81E1E";
    case "footer": return "#787078";
    case "photo": return "#1E5ADC";
    case "headline_L1": return "#E66E00";
    case "headline_L2": return "#C89600";
    case "subhead_kicker": return "#A6862A";
    case "body_or_caption": return "#00788C";
    case "fine_print": return "#0096A0";
    case "ad_or_box": return "#8C1EBE";
    default: return "#333333";
  }
}
