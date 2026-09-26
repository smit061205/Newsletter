#!/usr/bin/env python3
"""Phase 4+5 proof: the header (already production-quality) plus one real,
freshly-flowed story -- STORY_PRAG from web/src/lib/content.ts, poured into
its measured frame group (p1-12 headline, p1-15/p1-16 photos, p1-21 subhead,
p1-20/22/23/24 body columns) via the Phase 4 layout engine and Phase 5 photo
pipeline (scripts/layout_lib.py), not reference-issue text -- proving the
pipeline handles content that didn't exist when the source PDF was made.

Usage: python3 scripts/build_page1_demo.py
"""
import fitz
import json
import sys

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import flow_gujarati_text, composite_snippet, place_photo_cropped, draw_open_photo_slot
from build_header_v2 import tx, ty, render_edition_bar_snippet

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
OUT_PDF = f"{ROOT}/out/page-1-demo.pdf"
PRAG_PHOTO = f"{ROOT}/web/public/photos/prag1.jpg"

# STORY_PRAG, transcribed from web/src/lib/content.ts (kept as one source of
# truth there; duplicated here as plain data since this is a separate Python
# runtime -- see layout_lib.py's calibration_ratio() docstring for the same
# reasoning applied to the calibration lookup).
STORY_PRAG = {
    "headline": "IIT ગાંધીનગર દ્વારા નીતિ-સંશોધન માટે 'પ્રાગ' પહેલનો પ્રારંભ",
    "subhead": "ટેકનોલોજી અને શાસનના સંગમ પર નિષ્ણાતોની ચર્ચા, ભૂતપૂર્વ મુખ્ય સચિવો પણ જોડાયા",
    "bodyColumns": [
        "ગાંધીનગર: IIT ગાંધીનગરે 11 ઓગસ્ટના રોજ 'પ્રાગ' (પોલિસી રિસર્ચ એન્ડ એનાલિટિક્સ ફોર "
        "ગવર્નન્સ) પહેલનો પ્રારંભ કર્યો, જે ટેકનોલોજી, જાહેર નીતિ અને શાસનને એક મંચ પર લાવવાનો પ્રયાસ છે.",
        "સંસ્થાના ફાઉન્ડેશન કાર્યક્રમ અંતર્ગત યોજાયેલ આ પ્રસંગે 'જાહેર નીતિમાં ટેકનોલોજી સંસ્થાઓની "
        "ભૂમિકા' વિષય પર પેનલ ચર્ચા યોજાઈ હતી.",
        "ગુજરાત સરકારના ભૂતપૂર્વ મુખ્ય સચિવ શ્રી રાજ કુમાર અને ભૂતપૂર્વ અધિક મુખ્ય સચિવ શ્રી "
        "જે.પી. ગુપ્તા સહિત અનેક નિષ્ણાતોએ ચર્ચામાં ભાગ લીધો હતો.",
        "પ્રો. પ્રહર્ષ એમ. પટેલ અને પ્રો. દીપક સિંઘાનિયા આ પહેલનું સંકલન કરી રહ્યા છે.",
    ],
    "source": "PIB Ahmedabad, 12 Aug 2026 (PRID 2298380)",
}


def main():
    tmpl = json.load(open(f"{ROOT}/web/src/lib/template.json"))
    frames = {f["id"]: f for f in tmpl["pages"]["1"]["frames"]}

    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    page = target[0]
    keep_alive = []  # show_pdf_page snippet docs must outlive page.save()

    # ---- header (unchanged, production-quality per docs/PRECISION_ROADMAP.md) ----
    src_clip = fitz.Rect(14.85, 12.064, 1091.09, 246.98)
    tgt_rect = fitz.Rect(tx(src_clip.x0), ty(src_clip.y0), tx(src_clip.x1), ty(src_clip.y1))
    page.show_pdf_page(tgt_rect, src, 0, clip=src_clip)

    edition_bg = fitz.Rect(17.002, 243.814, 1092.746, 266.054)
    tab_left = fitz.Rect(15.902, 243.664, 27.737, 267.054)
    tab_right = fitz.Rect(1081.071, 243.664, 1092.906, 267.054)
    page.draw_rect(edition_bg, color=None, fill=(255/255, 253/255, 232/255))
    page.draw_rect(tab_left, color=None, fill=(0/255, 173/255, 239/255))
    page.draw_rect(tab_right, color=None, fill=(0/255, 173/255, 239/255))
    cyan = (0/255, 174/255, 239/255)
    page.draw_line(fitz.Point(16.592, 244.074), fitz.Point(1092.616, 244.074), color=cyan, width=2.04)
    page.draw_line(fitz.Point(16.592, 266.754), fitz.Point(1092.616, 266.754), color=cyan, width=2.04)
    render_edition_bar_snippet(width_pt=edition_bg.width, height_pt=edition_bg.height)
    snippet_doc = fitz.open(f"{ROOT}/out/_edition_bar_snippet.pdf")
    page.show_pdf_page(edition_bg, snippet_doc, 0)
    keep_alive.append(snippet_doc)

    # ---- Phase 4: headline + subhead + body columns, freshly flowed ----
    f = frames["p1-12"]
    path, size, top_off, fit = flow_gujarati_text(STORY_PRAG["headline"], f, "BBharatiGopikaTwo,Bold",
                                              f["fontSizePt"], align="left")
    keep_alive.append(composite_snippet(page, f, path, top_off, fit))
    print(f"p1-12 headline: declared={f['fontSizePt']}pt -> calibrated={size:.2f}pt")

    f = frames["p1-21"]
    path, size, top_off, fit = flow_gujarati_text(STORY_PRAG["subhead"], f, "BBharatiGopikaTwo,Bold",
                                              f["fontSizePt"], align="left")
    keep_alive.append(composite_snippet(page, f, path, top_off, fit))
    print(f"p1-21 subhead:  declared={f['fontSizePt']}pt -> calibrated={size:.2f}pt")

    body_ids = ["p1-20", "p1-22", "p1-23", "p1-24"]
    for fid, text in zip(body_ids, STORY_PRAG["bodyColumns"]):
        f = frames[fid]
        path, size, top_off, fit = flow_gujarati_text(text, f, "BBharatiGopikaTwo", f["fontSizePt"], align="justify")
        keep_alive.append(composite_snippet(page, f, path, top_off, fit))
        print(f"{fid} body:     declared={f['fontSizePt']}pt -> calibrated={size:.2f}pt")

    # ---- Phase 5: real photo in p1-15 (cropped to frame aspect, never stretched);
    #      p1-16 has no second sourced photo, marked honestly rather than duplicated/faked ----
    place_photo_cropped(page, frames["p1-15"], PRAG_PHOTO)
    draw_open_photo_slot(page, frames["p1-16"])

    target.save(OUT_PDF)
    print(f"\nwrote {OUT_PDF}")


if __name__ == "__main__":
    main()
