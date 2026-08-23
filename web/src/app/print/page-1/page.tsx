import { PAGE, LIVE_AREA } from "@/lib/gridSpec";
import { page1Frames } from "@/lib/frames";

// Bare export surface: no nav, no chrome, nothing but the page canvas.
// This is what Playwright screenshots for editor preview, sized 1:1 with the
// pdf-lib export target (blank master page, 1119.7 x 1584.55pt).
// NOTE: this renders inside the app's single root layout (app/layout.tsx), which
// already provides <html>/<body> -- do not redeclare them here. Keep the root
// layout free of nav/chrome so this route stays a bare export surface.
export default function PrintPage1() {
  return (
    <>
      <style>{`
        @page { size: ${PAGE.widthPt}pt ${PAGE.heightPt}pt; margin: 0; }
        body { display: block !important; }
      `}</style>
      <PageCanvas />
    </>
  );
}

function PageCanvas() {
  return (
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
      {page1Frames.map((f) => (
        <div
          key={f.id}
          title={f.label}
          style={{
            position: "absolute",
            left: `${f.x0}pt`,
            top: `${f.y0}pt`,
            width: `${f.x1 - f.x0}pt`,
            height: `${f.y1 - f.y0}pt`,
            border: `1pt solid ${frameColor(f.type)}`,
            background: `${frameColor(f.type)}22`,
            fontFamily: "Arial, sans-serif",
            fontSize: "9pt",
            color: frameColor(f.type),
            overflow: "hidden",
            boxSizing: "border-box",
            padding: "1pt 2pt",
          }}
        >
          {f.label}
        </div>
      ))}
    </div>
  );
}

function frameColor(type: string): string {
  switch (type) {
    case "chrome": return "#8C1EBE";
    case "masthead": return "#C81E1E";
    case "photo": return "#1E5ADC";
    case "headline": return "#E66E00";
    case "body": return "#00788C";
    default: return "#333";
  }
}
