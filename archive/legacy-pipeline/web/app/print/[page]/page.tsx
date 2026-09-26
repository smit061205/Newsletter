import { notFound } from "next/navigation";
import { PAGE, LIVE_AREA, LEADING_RATIO } from "@/lib/gridSpec";
import { getPageFrames, PAGE_NUMBERS, type PageNumber, type Frame } from "@/lib/frames";
import { PAGE1_CONTENT, AD_PLACEHOLDER_IDS, OPEN_STORY_SLOT_IDS, CHROME, FONT_SIZE_OVERRIDES_PT } from "@/lib/content";
import { resolveFont } from "@/lib/fonts";
import headerSpec from "@/lib/header_spec.json";

// The reader-facing render: what an editor proofs and what Playwright screenshots
// for production. No debug numbers, no per-type colour coding -- see ./debug for
// that (kept for engineering verification, same underlying frame data).
export function generateStaticParams() {
  return PAGE_NUMBERS.map((page) => ({ page }));
}

const GUJARATI_FONT = "'Noto Sans Gujarati', 'Noto Sans', Arial, sans-serif";
const RULE = "#111";

// Frame ids handled by <Masthead/> instead of the generic loop -- every text span
// and background field in the header was individually re-measured from the source
// PDF (see header_spec.json), not approximated from the block-level extraction.
const MASTHEAD_FRAME_IDS = new Set([
  "p1-1", "p1-2", "p1-3", "p1-4", "p1-5", "p1-6", "p1-7", "p1-8", "p1-9", "p1-10",
]);

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
        {page === "1" && <Masthead />}
        {page !== "1" && <Rule y={LIVE_AREA.y0 + 30.5} />}

        {frames.map((f) => {
          if (page === "1" && MASTHEAD_FRAME_IDS.has(f.id)) return null;
          if (adIds.includes(f.id)) return <AdBox key={f.id} f={f} />;
          if (pendingIds.includes(f.id)) return <PendingBox key={f.id} f={f} />;
          return <FrameBox key={f.id} f={f} text={content[f.id]} />;
        })}

        {page === "4" && <FooterLegal />}
      </div>
    </>
  );
}

// Every box/text position below is `header_spec.json`'s canonical-coordinate
// re-measurement of the source PDF's actual header spans and filled rects --
// not estimated. See the extraction that produced it: every span's own bbox,
// font, size, and RGB color, and every filled rect's own bbox/fill/stroke.
type Box = { x0: number; y0: number; x1: number; y1: number };
const H = headerSpec.header_boxes_canonical_pt as Record<string, Box | number>;
const C = headerSpec.colors as Record<string, string>;
const b = (name: string) => H[name] as Box;
const w = (bx: Box) => bx.x1 - bx.x0;
const h = (bx: Box) => bx.y1 - bx.y0;

function Masthead() {
  const tagBar = b("navy_box_tagline");
  const contactBar = b("navy_box_contact");
  const rniBar = b("navy_box_rni");
  const tagText = b("tagline_text");
  const rniText = b("rni_text");
  const wordmark = b("wordmark");
  const pOpen = b("subtitle_paren_open");
  const enBold1 = b("subtitle_en_bold1");
  const enBold2 = b("subtitle_en_bold2");
  const pClose = b("subtitle_paren_close");
  const guSub = b("subtitle_gu");
  const editionBg = b("edition_bar_bg");
  const tabL = b("edition_tab_left");
  const tabR = b("edition_tab_right");
  const contactStart = H["contact_text_start"] as number;
  const contactEnd = H["contact_text_end"] as number;

  return (
    <>
      {/* three navy fields -- tagline / contact / RNI -- separate boxes with a
          small gap between them, each with the same fill + purple stroke */}
      {[tagBar, contactBar, rniBar].map((bx, i) => (
        <div
          key={i}
          style={{
            position: "absolute", left: `${bx.x0}pt`, top: `${bx.y0}pt`,
            width: `${w(bx)}pt`, height: `${h(bx)}pt`,
            background: C.navy_fill, border: `0.96pt solid ${C.navy_stroke}`,
            boxSizing: "border-box",
          }}
        />
      ))}

      {/* tagline text, white, on the first navy field. Source font is
          BBharatiTitleTwo (the display face, not the body face) at 19pt;
          15.53pt here is that size recalibrated so Baloo Bhai 2 -- measurably
          wider per point than the original -- renders at the SAME width
          (170.17pt) rather than an eyeballed guess. */}
      <div style={{
        position: "absolute", left: `${tagText.x0}pt`, top: `${tagText.y0}pt`,
        width: `${w(tagText)}pt`, height: `${h(tagText)}pt`,
        display: "flex", alignItems: "center",
        fontFamily: "'Baloo Bhai 2', 'Noto Sans Gujarati', sans-serif", fontWeight: 700,
        fontSize: "15.53pt", color: "#fff", whiteSpace: "nowrap",
      }}>
        {CHROME.tagline}
      </div>

      {/* white decorative diamonds overlaid at the two gaps -- the source's
          "arrow" look is these, not notches cut into the boxes themselves */}
      {["diamond_gap1_a", "diamond_gap1_b", "diamond_gap2_a", "diamond_gap2_b"].map((name) => (
        <Diamond key={name} points={(headerSpec.decorative_diamonds_canonical_pt as unknown as Record<string, [number, number][]>)[name]} />
      ))}

      {/* contact info, white, on the second navy field -- bullets are small
          round dots (Wingdings "l"), light grey/white, not diamonds */}
      <div style={{
        position: "absolute", left: `${contactStart}pt`, top: `${contactBar.y0}pt`,
        width: `${contactEnd - contactStart}pt`, height: `${h(contactBar)}pt`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700,
        fontSize: "12.55pt", color: "#fff", whiteSpace: "nowrap",
      }}>
        {CHROME.contactBar.split("    •    ").map((part, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: "7pt" }}>
            {i > 0 && <span style={{ color: C.bullet_light, fontSize: "7pt" }}>●</span>}
            {part}
          </span>
        ))}
      </div>

      {/* RNI number, white, on the third navy field */}
      <div style={{
        position: "absolute", left: `${rniText.x0}pt`, top: `${rniText.y0}pt`,
        width: `${w(rniText)}pt`, height: `${h(rniText)}pt`,
        display: "flex", alignItems: "center",
        fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700,
        fontSize: "15.05pt", color: "#fff", whiteSpace: "nowrap",
      }}>
        {CHROME.rni}
      </div>

      {/* masthead brand mark -- real image extracted from the source PDF */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/photos/masthead-logo.jpg"
        alt=""
        style={{
          position: "absolute", left: "14.35pt", top: "52.73pt",
          width: "141.45pt", height: "172.95pt", objectFit: "cover",
        }}
      />

      {/* wordmark -- exact source colour. Source is BBharatiTitleTwo at 190pt;
          148.76pt is that recalibrated for Baloo Bhai 2 to fill the same
          716.89pt width the original occupied, measured via Chromium's own
          text metrics, not eyeballed (an earlier guess of 68pt left most of
          the box empty). */}
      <div style={{
        position: "absolute", left: `${wordmark.x0}pt`, top: `${wordmark.y0}pt`,
        width: `${w(wordmark)}pt`, height: `${h(wordmark)}pt`,
        display: "flex", alignItems: "center",
        fontFamily: "'Baloo Bhai 2', 'Noto Sans Gujarati', sans-serif", fontWeight: 700,
        fontSize: "148.76pt", color: C.wordmark_purple, whiteSpace: "nowrap", overflow: "hidden",
      }}>
        {CHROME.wordmark}
      </div>

      {/* "(CAPITAL KRANTI - DAILY - " -- larger, then "GANDHINAGAR)" set smaller
          to fit, exactly like the source (its own auto-condense, replicated) */}
      <div style={{
        position: "absolute", left: `${pOpen.x0}pt`, top: `${enBold1.y0}pt`,
        height: `${h(enBold1)}pt`, display: "flex", alignItems: "baseline",
        fontFamily: "Arial, Helvetica, sans-serif", color: C.ink_near_black, whiteSpace: "nowrap",
      }}>
        <span style={{ fontSize: "20.17pt", fontWeight: 400 }}>(</span>
        <span style={{ fontSize: "20.17pt", fontWeight: 900, letterSpacing: "-0.01em" }}>
          CAPITAL KRANTI - DAILY -{" "}
        </span>
        <span style={{ fontSize: "15.91pt", fontWeight: 900, letterSpacing: "-0.01em" }}>
          GANDHINAGAR
        </span>
        <span style={{ fontSize: "20.17pt", fontWeight: 400 }}>)</span>
      </div>

      {/* Gujarati subtitle -- no border in the source; a plain text run */}
      <div style={{
        position: "absolute", left: `${guSub.x0}pt`, top: `${guSub.y0}pt`,
        width: `${w(guSub)}pt`, height: `${h(guSub)}pt`,
        display: "flex", alignItems: "center",
        fontFamily: "'Baloo Bhai 2', 'Noto Sans Gujarati', sans-serif", fontWeight: 700,
        fontSize: "27.81pt", color: C.ink_near_black, whiteSpace: "nowrap",
      }}>
        {CHROME.subtitle}
      </div>

      {/* edition-info bar -- cream field with cyan accent tabs at each end */}
      <div style={{
        position: "absolute", left: `${editionBg.x0}pt`, top: `${editionBg.y0}pt`,
        width: `${w(editionBg)}pt`, height: `${h(editionBg)}pt`,
        background: C.edition_bg_cream, boxSizing: "border-box",
      }} />
      <div style={{
        position: "absolute", left: `${tabL.x0}pt`, top: `${tabL.y0}pt`,
        width: `${w(tabL)}pt`, height: `${h(tabL)}pt`, background: C.edition_tab_cyan,
      }} />
      <div style={{
        position: "absolute", left: `${tabR.x0}pt`, top: `${tabR.y0}pt`,
        width: `${w(tabR)}pt`, height: `${h(tabR)}pt`, background: C.edition_tab_cyan,
      }} />
      <div style={{
        position: "absolute", left: `${editionBg.x0 + 10}pt`, top: `${editionBg.y0}pt`,
        width: `${w(editionBg) - 20}pt`, height: `${h(editionBg)}pt`,
        display: "flex", alignItems: "center",
        fontFamily: "'Hind Vadodara', 'Noto Sans Gujarati', sans-serif", fontWeight: 700,
        fontSize: "12.5pt", color: C.ink_near_black, whiteSpace: "nowrap",
      }}>
        {PAGE1_CONTENT["p1-10"]?.split("    •    ").map((part, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: "5pt" }}>
            {i > 0 && <span style={{ color: C.bullet_gold, fontSize: "6pt" }}>●</span>}
            {part}
          </span>
        ))}
      </div>
    </>
  );
}

// One decorative diamond, drawn from its 4 exact source points (already in
// canonical pt coordinates). Positioned as an inline SVG sized to the points'
// own bounding box, not approximated with a rotated square.
function Diamond({ points }: { points: [number, number][] }) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const poly = points.map(([x, y]) => `${x - x0},${y - y0}`).join(" ");
  return (
    <svg
      style={{ position: "absolute", left: `${x0}pt`, top: `${y0}pt` }}
      width={`${x1 - x0}pt`} height={`${y1 - y0}pt`}
      viewBox={`0 0 ${x1 - x0} ${y1 - y0}`}
    >
      <polygon points={poly} fill="#fff" />
    </svg>
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
  const photoSrc = PHOTO_SRC[f.id];
  // real newspaper body copy is set justified, not ragged-right; headlines/mast stay left/centre
  const justify = f.type === "body_or_caption" || f.type === "fine_print";

  if (isPhoto) {
    if (photoSrc) {
      return (
        <div style={{ ...box(f), border: "0.5pt solid #c7ccd4" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      );
    }
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
        background: "transparent",
        padding: "1pt 3pt",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-start",
      }}
    >
      {text && (
        <span
          style={{
            fontFamily: font.family,
            fontWeight: font.weight,
            fontSize: `${size}pt`,
            lineHeight: LEADING_RATIO,
            color: "#000",
            display: "block",
            textAlign: justify ? "justify" : "left",
            textAlignLast: justify ? "left" : undefined,
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

// Real PIB press photos, sourced per-story (see content.ts for provenance). Only
// wired where a genuine photo exists for that specific story -- unfilled photo
// frames stay as neutral placeholders rather than borrowing an unrelated image.
const PHOTO_SRC: Record<string, string> = {
  "p1-15": "/photos/prag1.jpg",
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
