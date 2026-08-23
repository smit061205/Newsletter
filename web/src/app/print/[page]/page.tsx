import { notFound } from "next/navigation";
import { PAGE, LIVE_AREA, LEADING_RATIO } from "@/lib/gridSpec";
import { getPageFrames, PAGE_NUMBERS, type PageNumber, type Frame } from "@/lib/frames";
import { PAGE1_CONTENT, OPEN_STORY_SLOT_IDS, CHROME, FONT_SIZE_OVERRIDES_PT } from "@/lib/content";

// Bare export surface, one per newspaper page: no nav, no chrome. This is what
// Playwright screenshots for editor preview and what pdf-lib's export script
// (scripts/export-page.mjs) draws directly from the same underlying data --
// see src/lib/template.json for the full 149-frame reconciled dataset.
export function generateStaticParams() {
  return PAGE_NUMBERS.map((page) => ({ page }));
}

const GUJARATI_FONT = "'Noto Sans Gujarati', 'Noto Sans', Arial, sans-serif";

export default async function PrintPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!PAGE_NUMBERS.includes(page as PageNumber)) notFound();
  const frames = getPageFrames(page as PageNumber);
  const content = page === "1" ? PAGE1_CONTENT : {};

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
          <FrameBox key={f.id} f={f} index={i + 1} text={content[f.id]} />
        ))}

        {page === "1" &&
          OPEN_STORY_SLOT_IDS.map((id) => {
            const f = frames.find((fr) => fr.id === id);
            if (!f) return null;
            return <OpenSlotOverlay key={id} f={f} />;
          })}

        {page === "4" && <FooterLegal />}
      </div>
    </>
  );
}

function FrameBox({ f, index, text }: { f: Frame; index: number; text?: string }) {
  const color = frameColor(f.type);
  const isPhoto = f.type === "photo";
  const size = FONT_SIZE_OVERRIDES_PT[f.id] ?? f.fontSizePt ?? 9;

  return (
    <div
      title={f.labelHint ?? f.type}
      style={{
        position: "absolute",
        left: `${f.x0}pt`,
        top: `${f.y0}pt`,
        width: `${f.x1 - f.x0}pt`,
        height: `${f.y1 - f.y0}pt`,
        border: `${text ? 0.5 : 1}pt solid ${color}`,
        background: isPhoto ? "#eef1f5" : text ? "transparent" : `${color}14`,
        overflow: "hidden",
        boxSizing: "border-box",
        padding: text ? "1pt 2pt" : 0,
      }}
    >
      {text ? (
        <span
          style={{
            fontFamily: GUJARATI_FONT,
            fontSize: `${size}pt`,
            lineHeight: LEADING_RATIO, // measured exact from the source PDF: leading = 1.2 x size
            color: "#111",
            fontWeight: f.type.startsWith("headline") ? 700 : 400,
            display: "block",
          }}
        >
          {text}
        </span>
      ) : isPhoto ? (
        <span
          style={{
            fontFamily: "Arial, sans-serif",
            fontSize: "7pt",
            color: "#8892a0",
            padding: "2pt",
            display: "block",
          }}
        >
          [Photo — {index}]
        </span>
      ) : (
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: "7pt", color, padding: "1pt 2pt" }}>
          {index}
        </span>
      )}
    </div>
  );
}

// Marks a real gap in the template -- deliberately not filled with invented content.
function OpenSlotOverlay({ f }: { f: Frame }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${f.x0}pt`,
        top: `${f.y0}pt`,
        width: `${f.x1 - f.x0}pt`,
        height: `${f.y1 - f.y0}pt`,
        border: "0.75pt dashed #999",
        background: "repeating-linear-gradient(45deg, #f4f4f4, #f4f4f4 6pt, #ececec 6pt, #ececec 12pt)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
    >
      <span style={{ fontFamily: GUJARATI_FONT, fontSize: "8pt", color: "#999" }}>
        [ story slot — pending ]
      </span>
    </div>
  );
}

function FooterLegal() {
  return (
    <div
      style={{
        position: "absolute",
        left: `${LIVE_AREA.x0}pt`,
        top: `${LIVE_AREA.y1 - 14}pt`,
        width: `${LIVE_AREA.x1 - LIVE_AREA.x0}pt`,
        fontFamily: "Arial, sans-serif",
        fontSize: "6.5pt",
        lineHeight: LEADING_RATIO,
        color: "#333",
        borderTop: "0.5pt solid #333",
        paddingTop: "2pt",
      }}
    >
      {CHROME.footerLegal}
    </div>
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
