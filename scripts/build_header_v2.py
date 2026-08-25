#!/usr/bin/env python3
"""Definitive header build, corrected: WeasyPrint for dynamic Gujarati text
(PyMuPDF's own shaping engine drops anusvara after a matra-attached consonant --
confirmed reproducible across two different fonts, so it's an engine bug, not a
font choice; WeasyPrint's Pango/HarfBuzz engine renders the identical strings
correctly, verified directly before adopting it). PyMuPDF still does everything
it's actually good at: real vector-copying the static masthead out of the
source PDF via show_pdf_page(), and compositing the WeasyPrint-generated
dynamic snippet onto the same page.

Usage: python3 scripts/build_header_v2.py
"""
import sys
import fitz
import datetime
from weasyprint import HTML

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from geometry import tx, ty  # noqa: E402 -- shared transform, see geometry.py

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
HIND_FONT = f"{ROOT}/web/fonts/HindVadodara-Bold.ttf"
OUT_PDF = f"{ROOT}/out/page-1-header-v2.pdf"
DYNAMIC_SNIPPET = f"{ROOT}/out/_edition_bar_snippet.pdf"

# NOTE: ty(y) here implicitly uses page_idx=0 (its default) -- correct for
# page 1, which is all this script builds. Any future page-N use must pass
# ty(y, page_idx) explicitly (see running_header.py for the pattern).

# calibrated below by rendering + re-measuring our own bullet glyph width
# against the source's exact 8.22pt Wingdings 'l' bullet
BULLET_SIZE_PT = 13.6  # calibrated: 8.0pt rendered only 4.84pt wide vs target 8.22pt

GUJ_DIGITS = "૦૧૨૩૪૫૬૭૮૯"
def to_guj_digits(s):
    return "".join(GUJ_DIGITS[int(c)] if c.isdigit() else c for c in str(s))

def edition_bar_parts(issue_no=212):
    today = datetime.date.today()
    days = ["સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર", "રવિવાર"]
    dow = days[today.weekday()]
    date_str = to_guj_digits(today.strftime("%d-%m-%Y"))
    return [
        f"વર્ષ : {to_guj_digits(34)}",
        f"અંક : {to_guj_digits(issue_no)}",
        f"તારીખ : {date_str}, {dow}",
        f"કિંમત : {to_guj_digits(50)} પૈસા",
        "તંત્રી : પાર્થ એમ. ઠક્કર",
        "બ્યુરો ચીફ : બિજેન કાપડિયા (અમદાવાદ)",
        "મેનેજિંગ તંત્રી : સુરેશ ચંડી",
    ]


def render_edition_bar_snippet(width_pt, height_pt, bullet_size_pt=8.0):
    """Renders the edition-bar text (only) via WeasyPrint, transparent
    background, sized to the exact target box -- correct Gujarati shaping,
    bullets included, as one small standalone PDF to be composited in.

    Every spacing value below is a MEASUREMENT taken directly off the
    source PDF's own text spans (get_text("dict") -> origin/bbox), not a
    guess:
      - the source has 7 Wingdings bullet glyphs, one BEFORE the very
        first segment ("વર્ષ") too -- an earlier version only rendered the
        6 *inter*-segment bullets and silently dropped this leading one.
      - each bullet's own glyph is a constant 8.22pt wide (Wingdings 'l'
        at size 11).
      - the space AFTER each bullet (bullet -> next segment) is a rock
        -solid constant: 7.57pt in 6 of 7 cases (7.45 in the 7th, PageMaker
        kerning noise, effectively equal).
      - the space BEFORE each bullet (previous segment -> bullet) varies
        13.06-16.96pt, averaging 14.6pt -- this is PageMaker letter/word-
        spacing jitter, not a deliberate design value, so it's averaged
        rather than reproduced span-by-span.
      - the leading bullet (before "વર્ષ") has no "space before" -- nothing
        precedes it in the field -- so only its trailing 7.57pt applies;
        overall left/right centering is handled by flexbox on the body.
    """
    # NOTE: WeasyPrint has a confirmed, reproducible bug where margins on
    # flex-item <span> children render at exactly 2x their CSS value
    # (isolated and verified directly: margin-left:20pt -> measured 40pt
    # gap, margin-right:10pt -> measured 20pt gap, ratio ~1.999 both
    # times). Halving the intended values here is the measured
    # correction, not a guess.
    GAP_BEFORE_BULLET = 14.6 / 2
    GAP_AFTER_BULLET = 7.57 / 2
    parts = edition_bar_parts()
    pieces = ['<span class="bullet lead">●</span>']
    for i, p in enumerate(parts):
        if i > 0:
            pieces.append('<span class="bullet">●</span>')
        pieces.append(f'<span class="seg">{p}</span>')
    spans = "".join(pieces)
    html = f"""
    <html><head><meta charset="utf-8"><style>
      @font-face {{ font-family: 'HindV'; src: url('file://{HIND_FONT}'); }}
      @page {{ size: {width_pt}pt {height_pt}pt; margin: 0; }}
      /* source measurement: text block is CENTERED in the cream field --
         85.20pt left margin vs 85.56pt right margin (symmetric within
         0.36pt) -- not left-aligned with a small pad, which is what an
         earlier version guessed. */
      body {{ margin: 0; font-family: 'HindV', sans-serif; font-weight: 700;
              /* 11.9pt: calibrated by rendering at 12.5pt, measuring each of
                 the 7 segments' actual widths against the source's exact
                 widths (weighted ratio 1.0505 overshoot), and rescaling --
                 not a guess. */
              font-size: 11.9pt; color: rgb(35,31,32);
              display: flex; align-items: center; justify-content: center;
              height: {height_pt}pt; white-space: nowrap; }}
      .seg {{ margin: 0; }}
      .bullet {{ color: rgb(154,104,55); font-size: {bullet_size_pt}pt;
                 margin: 0 {GAP_AFTER_BULLET}pt 0 {GAP_BEFORE_BULLET}pt; }}
      .bullet.lead {{ margin-left: 0; }}
    </style></head>
    <body>{spans}</body></html>
    """
    HTML(string=html, base_url=ROOT).write_pdf(DYNAMIC_SNIPPET)


def main():
    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    tgt_page = target[0]

    # ---- 1. static masthead: real vector copy from the source PDF ----
    src_clip = fitz.Rect(14.85, 12.064, 1091.09, 246.98)
    tgt_rect = fitz.Rect(tx(src_clip.x0), ty(src_clip.y0), tx(src_clip.x1), ty(src_clip.y1))
    tgt_page.show_pdf_page(tgt_rect, src, 0, clip=src_clip)

    # ---- 2. edition bar background: cream field + cyan tabs + full-width cyan
    #      top/bottom border lines (found via a full get_drawings() audit --
    #      these two lines were missing from every earlier version) ----
    edition_bg = fitz.Rect(17.002, 243.814, 1092.746, 266.054)
    tab_left   = fitz.Rect(15.902, 243.664, 27.737, 267.054)
    tab_right  = fitz.Rect(1081.071, 243.664, 1092.906, 267.054)
    tgt_page.draw_rect(edition_bg, color=None, fill=(255/255, 253/255, 232/255))
    tgt_page.draw_rect(tab_left, color=None, fill=(0/255, 173/255, 239/255))
    tgt_page.draw_rect(tab_right, color=None, fill=(0/255, 173/255, 239/255))
    cyan = (0/255, 174/255, 239/255)
    tgt_page.draw_line(fitz.Point(16.592, 244.074), fitz.Point(1092.616, 244.074), color=cyan, width=2.04)
    tgt_page.draw_line(fitz.Point(16.592, 266.754), fitz.Point(1092.616, 266.754), color=cyan, width=2.04)

    # ---- 3. edition bar TEXT: WeasyPrint (correct shaping) composited via PyMuPDF ----
    render_edition_bar_snippet(width_pt=edition_bg.width, height_pt=edition_bg.height,
                                bullet_size_pt=BULLET_SIZE_PT)
    snippet_doc = fitz.open(DYNAMIC_SNIPPET)
    tgt_page.show_pdf_page(edition_bg, snippet_doc, 0)

    target.save(OUT_PDF)
    print(f"wrote {OUT_PDF}")


if __name__ == "__main__":
    main()
