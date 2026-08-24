import { notFound } from "next/navigation";
import { PAGE, LIVE_AREA, LEADING_RATIO } from "@/lib/gridSpec";
import { getPageFrames, PAGE_NUMBERS, type PageNumber, type Frame } from "@/lib/frames";
import { PAGE1_CONTENT, AD_PLACEHOLDER_IDS, OPEN_STORY_SLOT_IDS, CHROME, FONT_SIZE_OVERRIDES_PT } from "@/lib/content";
import { resolveFont } from "@/lib/fonts";

// The reader-facing render: what an editor proofs and what Playwright screenshots
// for production. No debug numbers, no per-type colour coding -- see ./debug for
// that (kept for engineering verification, same underlying frame data).
export function generateStaticParams() {
  return PAGE_NUMBERS.map((page) => ({ page }));
}

const GUJARATI_FONT = "'Noto Sans Gujarati', 'Noto Sans', Arial, sans-serif";
const RULE = "#111";

export default async function PrintPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!PAGE_NUMBERS.includes(page as PageNumber)) notFound();
  const frames = getPageFrames(page as PageNumber);
  const content = page === "1" ? PAGE1_CONTENT : {};
  const adIds = page === "1" ? AD_PLACEHOLDER_IDS : [];
  const pendingIds = page === "1" ? OPEN_STORY_SLOT_IDS : [];

  return (
    <>
      <style>{`
        @page { size: ${PAGE.widthPt}pt ${PAGE.heightPt}pt; margin: 0; }
        body { display: block !important; background: #d8d8d8 !important; }
      `}</style>
      <div
        style={{
          position: "relative",
          width: `${PAGE.widthPt}pt`,
          height: `${PAGE.heightPt}pt`,
          background: "#fff",
          overflow: "hidden",
          margin: 0,
          boxShadow: "0 0 0 0.5pt #ccc",
        }}
      >
        {/* structural rules -- top masthead band + edition-bar bottom, matching the
            measured header-band positions from the source PDF */}
        <Rule y={LIVE_AREA.y0 + 30.5} />
        {page === "1" && <Rule y={266} weight={0.75} />}

        {frames.map((f) => {
          if (adIds.includes(f.id)) return <AdBox key={f.id} f={f} />;
          if (pendingIds.includes(f.id)) return <PendingBox key={f.id} f={f} />;
          return <FrameBox key={f.id} f={f} text={content[f.id]} />;
        })}

        {page === "4" && <FooterLegal />}
      </div>
    </>
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
        color: "#222",
        borderTop: `0.5pt solid ${RULE}`,
        paddingTop: "2pt",
        background: "#fff",
      }}
    >
      {CHROME.footerLegal}
    </div>
  );
}

function Rule({ y, weight = 0.5 }: { y: number; weight?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${LIVE_AREA.x0}pt`,
        top: `${y}pt`,
        width: `${LIVE_AREA.x1 - LIVE_AREA.x0}pt`,
        borderTop: `${weight}pt solid ${RULE}`,
      }}
    />
  );
}

function box(f: Frame) {
  return {
    position: "absolute" as const,
    left: `${f.x0}pt`,
    top: `${f.y0}pt`,
    width: `${f.x1 - f.x0}pt`,
    height: `${f.y1 - f.y0}pt`,
    boxSizing: "border-box" as const,
    overflow: "hidden" as const,
  };
}

function FrameBox({ f, text }: { f: Frame; text?: string }) {
  const size = FONT_SIZE_OVERRIDES_PT[f.id] ?? f.fontSizePt ?? 9;
  const font = resolveFont(f.sourceFont, f.type);
  const isPhoto = f.type === "photo";
  // chrome bars get the real masthead/edition-bar treatment instead of a generic box
  const bar = CHROME_BAR[f.id];

  if (isPhoto) {
    return (
      <div
        style={{
          ...box(f),
          background:
            "repeating-linear-gradient(135deg, #eceef1, #eceef1 3pt, #e4e7ec 3pt, #e4e7ec 6pt)",
          border: "0.5pt solid #c7ccd4",
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...box(f),
        background: bar?.background ?? "#fff",
        padding: "1pt 3pt",
        display: "flex",
        alignItems: bar ? "center" : "flex-start",
        justifyContent: bar?.center ? "center" : "flex-start",
        border: f.type === "chrome" ? "0.5pt solid #444" : undefined,
      }}
    >
      {text && (
        <span
          style={{
            fontFamily: font.family,
            fontWeight: font.weight,
            fontSize: `${size}pt`,
            lineHeight: LEADING_RATIO,
            color: bar?.color ?? "#000",
            display: "block",
            textAlign: bar?.center ? "center" : "left",
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

// Real bar treatment for the masthead-area chrome frames, matched loosely to the
// original's colour scheme (navy contact bar, pale edition-info bar) rather than
// left as bare debug boxes.
const CHROME_BAR: Record<string, { background: string; color: string; center?: boolean }> = {
  "p1-1": { background: "#132a52", color: "#fff" },
  "p1-3": { background: "#132a52", color: "#fff" },
  "p1-5": { background: "#132a52", color: "#fff" },
  "p1-9": { background: "#eef1f8", color: "#111" },
};

function AdBox({ f }: { f: Frame }) {
  return (
    <div
      style={{
        ...box(f),
        border: "0.75pt solid #999",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafafa",
      }}
    >
      <span
        style={{
          fontFamily: "Arial, sans-serif",
          fontSize: "7pt",
          letterSpacing: "0.15em",
          color: "#9a9a9a",
          textTransform: "uppercase",
        }}
      >
        Advertisement
      </span>
    </div>
  );
}

function PendingBox({ f }: { f: Frame }) {
  return (
    <div
      style={{
        ...box(f),
        border: "0.5pt dotted #bbb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ fontFamily: GUJARATI_FONT, fontSize: "7pt", color: "#bbb", fontStyle: "italic" }}>
        story slot — pending
      </span>
    </div>
  );
}
