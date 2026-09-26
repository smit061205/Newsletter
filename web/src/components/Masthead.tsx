// Page-1 masthead, ported from the archived /print route (see
// archive/legacy-pipeline/web/app/print/[page]/page.tsx) onto the NEW
// (196)-page-size raw coordinates (header_boxes_raw196_pt, see
// web/src/lib/header_spec.json's own coordinate-space note) and the real
// calibrated local fonts (fonts.ts), not the old Google Fonts stand-in.
//
// Deliberately narrower than the original for this first pass: the
// decorative diamond SVGs and the real masthead photo logo are left out
// (noted, not silently dropped) -- worth restoring once the core
// backend-driven render loop is proven end to end. Every box position and
// color below IS real, measured data (header_spec.json), not a guess.

import { CHROME, editionBar } from "@/lib/chrome";
import headerSpec from "@/lib/header_spec.json";
import { ARTICLE_FONT_ROLES } from "@/lib/fonts";
import { ptToPx } from "@/lib/gridSpec";

// Positions below are converted pt -> px via OUR domain's 300 DPI ratio
// (gridSpec.ts's ptToPx), NOT left as CSS's own "pt" unit -- CSS defines
// 1pt = 1/72 CSS-inch = 96/72 = 1.333px, a DIFFERENT ratio than the
// backend's 300-DPI article coordinates use. Mixing the two would misalign
// the masthead against every article box on the same page. Font SIZES
// below are deliberately left in CSS "pt" -- that unit (1/72in) is exactly
// what calibration_ratios.json's ratios were measured against (real
// typographic points), so it's the correct unit there, not a bug.
type Box = { x0: number; y0: number; x1: number; y1: number };
const H = headerSpec.header_boxes_raw196_pt as unknown as Record<string, Box | number>;
const C = headerSpec.colors as Record<string, string>;
const b = (name: string): Box => {
  const raw = H[name] as Box;
  return { x0: ptToPx(raw.x0), y0: ptToPx(raw.y0), x1: ptToPx(raw.x1), y1: ptToPx(raw.y1) };
};
const num = (name: string): number => ptToPx(H[name] as number);
const w = (bx: Box) => bx.x1 - bx.x0;
const h = (bx: Box) => bx.y1 - bx.y0;

export function Masthead({ issueNumber, issueDate }: { issueNumber: number; issueDate: string }) {
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
  const contactStart = num("contact_text_start");
  const contactEnd = num("contact_text_end");

  return (
    <>
      {[tagBar, contactBar, rniBar].map((bx, i) => (
        <div
          key={i}
          style={{
            position: "absolute", left: `${bx.x0}px`, top: `${bx.y0}px`,
            width: `${w(bx)}px`, height: `${h(bx)}px`,
            background: C.navy_fill, border: `0.96pt solid ${C.navy_stroke}`,
            boxSizing: "border-box",
          }}
        />
      ))}

      <div style={{
        position: "absolute", left: `${tagText.x0}px`, top: `${tagText.y0}px`,
        width: `${w(tagText)}px`, height: `${h(tagText)}px`,
        display: "flex", alignItems: "center",
        fontFamily: ARTICLE_FONT_ROLES.title.family, fontWeight: 700,
        fontSize: "15.53pt", color: "#fff", whiteSpace: "nowrap",
      }}>
        {CHROME.tagline}
      </div>

      <div style={{
        position: "absolute", left: `${contactStart}px`, top: `${contactBar.y0}px`,
        width: `${contactEnd - contactStart}px`, height: `${h(contactBar)}px`,
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

      <div style={{
        position: "absolute", left: `${rniText.x0}px`, top: `${rniText.y0}px`,
        width: `${w(rniText)}px`, height: `${h(rniText)}px`,
        display: "flex", alignItems: "center",
        fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700,
        fontSize: "15.05pt", color: "#fff", whiteSpace: "nowrap",
      }}>
        {CHROME.rni}
      </div>

      <div style={{
        position: "absolute", left: `${wordmark.x0}px`, top: `${wordmark.y0}px`,
        width: `${w(wordmark)}px`, height: `${h(wordmark)}px`,
        display: "flex", alignItems: "center",
        fontFamily: ARTICLE_FONT_ROLES.title.family, fontWeight: 700,
        fontSize: "148.76pt", color: C.wordmark_purple, whiteSpace: "nowrap", overflow: "hidden",
      }}>
        {CHROME.wordmark}
      </div>

      <div style={{
        position: "absolute", left: `${pOpen.x0}px`, top: `${enBold1.y0}px`,
        height: `${h(enBold1)}px`, display: "flex", alignItems: "baseline",
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

      <div style={{
        position: "absolute", left: `${guSub.x0}px`, top: `${guSub.y0}px`,
        width: `${w(guSub)}px`, height: `${h(guSub)}px`,
        display: "flex", alignItems: "center",
        fontFamily: ARTICLE_FONT_ROLES.title.family, fontWeight: 700,
        fontSize: "27.81pt", color: C.ink_near_black, whiteSpace: "nowrap",
      }}>
        {CHROME.subtitle}
      </div>

      <div style={{
        position: "absolute", left: `${editionBg.x0}px`, top: `${editionBg.y0}px`,
        width: `${w(editionBg)}px`, height: `${h(editionBg)}px`,
        background: C.edition_bg_cream, boxSizing: "border-box",
      }} />
      <div style={{
        position: "absolute", left: `${tabL.x0}px`, top: `${tabL.y0}px`,
        width: `${w(tabL)}px`, height: `${h(tabL)}px`, background: C.edition_tab_cyan,
      }} />
      <div style={{
        position: "absolute", left: `${tabR.x0}px`, top: `${tabR.y0}px`,
        width: `${w(tabR)}px`, height: `${h(tabR)}px`, background: C.edition_tab_cyan,
      }} />
      <div style={{
        position: "absolute", left: `${editionBg.x0 + 10}px`, top: `${editionBg.y0}px`,
        width: `${w(editionBg) - 20}px`, height: `${h(editionBg)}px`,
        display: "flex", alignItems: "center",
        fontFamily: ARTICLE_FONT_ROLES.body.family, fontWeight: 700,
        fontSize: "12.5pt", color: C.ink_near_black, whiteSpace: "nowrap",
      }}>
        {editionBar(new Date(issueDate), issueNumber).split("    •    ").map((part, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: "5pt" }}>
            {i > 0 && <span style={{ color: C.bullet_gold, fontSize: "6pt" }}>●</span>}
            {part}
          </span>
        ))}
      </div>
    </>
  );
}
