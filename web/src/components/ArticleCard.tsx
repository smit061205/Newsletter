// Renders one ArticlePlacement at its backend-given (x, y, width, height) --
// all already in the same 300-DPI px system as the page canvas (gridSpec.ts),
// so no unit conversion is needed here (contrast Masthead.tsx, which DOES
// need one, converting from header_spec.json's pt data).
//
// Font sizes reuse this project's REAL calibration math (fonts.ts's
// calibratedFontSize(), reading calibration_ratios.json) at fixed declared
// sizes per role -- not a box-size heuristic. This is a deliberate, disclosed
// simplification (docs/FRONTEND_ROADMAP.md Part B: "typography is a frontend
// decision", one consistent house style rather than the old per-story font
// variation) -- true fit-to-box sizing is the PDF generator's job (Part E
// step 8, reusing layout_lib.py's proven auto-shrink), not this component's.
// overflow:hidden here is a safety net against a badly undersized box, not a
// substitute for real fitting.

import type { ArticlePlacement } from "@/lib/contract";
import { hasPhoto } from "@/lib/contract";
import { ARTICLE_FONT_ROLES, calibratedFontSize } from "@/lib/fonts";

const TITLE_DECLARED_PT = 34;
const KICKER_DECLARED_PT = 18;
const BODY_DECLARED_PT = 13;

export function ArticleCard({ article }: { article: ArticlePlacement }) {
  const box: React.CSSProperties = {
    position: "absolute",
    left: `${article.x}px`,
    top: `${article.y}px`,
    width: `${article.width}px`,
    height: `${article.height}px`,
    overflow: "hidden",
    boxSizing: "border-box",
  };

  if (article.type === "ad") {
    return (
      <div style={box}>
        {hasPhoto(article) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.photoUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "100%", height: "100%", display: "flex", alignItems: "center",
              justifyContent: "center", border: "1px dashed #9994", color: "#999",
              fontFamily: ARTICLE_FONT_ROLES.body.family, fontSize: "14pt",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}
          >
            Advertisement
          </div>
        )}
      </div>
    );
  }

  // 0.30, not 0.38 -- a real newspaper page's photos read as a modest
  // fraction of their box, kept in sync with build_issue_pdf.py's own
  // PHOTO_HEIGHT_FRACTION (confirmed by comparing a rendered page directly
  // against the real source page, not assumed).
  const photoHeight = hasPhoto(article) ? Math.round(article.height * 0.3) : 0;

  return (
    <div style={box}>
      {article.kicker && (
        <div
          style={{
            fontFamily: ARTICLE_FONT_ROLES.kicker.family,
            fontWeight: ARTICLE_FONT_ROLES.kicker.weight,
            fontSize: `${calibratedFontSize("BBharatiGopikaTwo,Bold", KICKER_DECLARED_PT)}pt`,
            lineHeight: 1.2,
            marginBottom: "4px",
          }}
        >
          {article.kicker}
        </div>
      )}
      <div
        style={{
          fontFamily: ARTICLE_FONT_ROLES.title.family,
          fontWeight: ARTICLE_FONT_ROLES.title.weight,
          fontSize: `${calibratedFontSize("BBharatiGopikaTwo,Bold", TITLE_DECLARED_PT)}pt`,
          lineHeight: 1.15,
          marginBottom: "8px",
        }}
      >
        {article.title}
      </div>
      {hasPhoto(article) && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {/* object-fit: contain, not cover -- a full-width "banner" box
              can put this photo in an extreme aspect ratio (found on the
              UPI chart: box_width / (box_height*0.38) came out ~6.8:1),
              and a cover-crop at that ratio deleted the chart's single
              tallest, most-recent bar entirely (confirmed by rendering it
              and looking, not assumed). "contain" can letterbox instead of
              filling the box edge to edge, but never discards content --
              the same tradeoff layout_lib.py's place_photo_cropped now
              makes on the PDF side (its MAX_CROP_FRACTION cap), kept in
              sync rather than diverging between the two renderers. */}
          <img
            src={article.photoUrl}
            alt=""
            style={{
              width: "100%", height: `${photoHeight}px`, objectFit: "contain",
              display: "block", marginBottom: "4px", background: "#f4f4f4",
            }}
          />
          {article.photoCaption && (
            <div style={{ fontSize: "8.5pt", lineHeight: 1.3, color: "#555", marginBottom: "8px" }}>
              {article.photoCaption}
            </div>
          )}
        </>
      )}
      <div
        style={{
          fontFamily: ARTICLE_FONT_ROLES.body.family,
          fontWeight: ARTICLE_FONT_ROLES.body.weight,
          fontSize: `${calibratedFontSize("BBharatiGopikaTwo", BODY_DECLARED_PT)}pt`,
          lineHeight: 1.2,
          textAlign: "justify",
        }}
      >
        {article.bodyText}
      </div>
    </div>
  );
}
