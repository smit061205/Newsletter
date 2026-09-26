#!/usr/bin/env python3
"""Completes page 1 with all four real, sourced stories in their originally-
designed frame groups (per the PAGE1_CONTENT mapping that has existed in
content.ts since early in this project): STORY_SAMARTH, STORY_PRAG,
STORY_NIFT, STORY_PM_VISIT. The ad box (p1-39/p1-40) and open story slots
(p1-42/p1-43) are left as honest placeholders per content.ts's own
AD_PLACEHOLDER_IDS/OPEN_STORY_SLOT_IDS -- that was already the correct call
when it was made, not something this build second-guesses. Photo frames
(p1-30/p1-34, NIFT's) with no sourced photo are marked open rather than
filled with an unrelated stock image.

Usage: python3 scripts/build_page1_full.py
"""
import sys
import json
import fitz

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import flow_gujarati_text, composite_snippet, place_photo_cropped, draw_open_photo_slot
from build_header_v2 import tx, ty, render_edition_bar_snippet

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
OUT_PDF = f"{ROOT}/out/page-1-full.pdf"
PRAG_PHOTO = f"{ROOT}/web/public/photos/prag1.jpg"

STORY_SAMARTH = {
    "kicker": "₹190 કરોડનો પ્રોજેક્ટ, 10,000ને તાલીમ",
    "headline": "IITGNમાં સેમિકન્ડક્ટર તાલીમ હબ 'સામર્થ્ય'નો પ્રારંભ",
    "bodyColumns": [
        "ગાંધીનગર: IIT ગાંધીનગર ખાતે શનિવારે 'સામર્થ્ય' (સિલિકોન એન્ડ એડવાન્સ્ડ સેમિકન્ડક્ટર "
        "મેન્યુફેક્ચરિંગ રિસર્ચ એન્ડ ટ્રેનિંગ હબ) પ્રોજેક્ટની પૂર્વ-શુભારંભ બેઠક યોજાઈ હતી.",
        "ગુજરાતની વિવિધ યુનિવર્સિટીઓ અને એન્જિનિયરિંગ સંસ્થાઓના પ્રતિનિધિઓએ બેઠકમાં ભાગ લઈ "
        "અભ્યાસક્રમ, તાલીમ અને સંશોધન સહયોગ અંગે પોતાના મંતવ્યો રજૂ કર્યા હતા.",
        "ઇલેક્ટ્રોનિક્સ અને ઇન્ફોર્મેશન ટેકનોલોજી મંત્રાલય, ગુજરાત સરકાર અને IITGN ના સંયુક્ત આ "
        "પ્રોજેક્ટ હેઠળ આગામી પાંચ વર્ષમાં 10,000થી વધુ વિદ્યાર્થીઓ-ટેકનિશિયનોને તાલીમ તેમજ "
        "1,000થી વધુ ઉદ્યોગ વ્યાવસાયિકોને અપસ્કિલ કરાશે.",
        "સંસ્થાના ડિરેક્ટર પ્રો. રજત મૂનાએ જણાવ્યું કે સેમિકન્ડક્ટર ક્ષેત્રે કુશળ માનવબળ તૈયાર "
        "કરવું એ ભારતની સ્પર્ધાત્મકતા માટે અનિવાર્ય છે.",
    ],
}
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
}
STORY_NIFT = {
    "subhead": "ITI તાલીમાર્થીઓ માટે નવો યુનિફોર્મ, વિજેતા ટીમને ₹1 લાખનું ઇનામ",
    "headline": "NIFT ગાંધીનગર ખાતે 24 કલાકની યુનિફોર્મ ડિઝાઇન હેકાથોન",
    "bodyColumns": [
        "ગાંધીનગર: NIFT ગાંધીનગર અને ગુજરાત સરકારના રોજગાર અને તાલીમ નિયામકની કચેરીના સંયુક્ત "
        "ઉપક્રમે 'યુનિફોર્મ ડિઝાઇન હેકાથોન 2026'નો પ્રારંભ NIFT કેમ્પસ ખાતે થયો હતો.",
        "NIFT ગાંધીનગર અને ગુજરાત યુનિવર્સિટીની કુલ ચાર વિદ્યાર્થી ટીમો રાજ્યની સરકારી ITI "
        "સંસ્થાઓ માટે કાર્યક્ષમ અને પોસાય તેવા યુનિફોર્મ ડિઝાઇન કરવા 24 કલાક સતત કામ કરી રહી છે.",
        "વિજેતા ડિઝાઇનનો ખર્ચ પ્રતિ યુનિફોર્મ ₹1,000થી વધુ ન હોવો જોઈએ. પ્રથમ ટીમને ₹50,000, "
        "બીજીને ₹30,000 અને ત્રીજીને ₹20,000નું ઇનામ અપાશે.",
    ],
}
STORY_PM_VISIT = {
    "kicker": "25-26 ઓગસ્ટે અમદાવાદમાં ₹5,400 કરોડના વિકાસ પ્રોજેક્ટ્સનું લોકાર્પણ",
    "headline": "વડાપ્રધાન મોદી 25-26 ઓગસ્ટે ગુજરાતની મુલાકાતે",
    "bodyColumns": [
        "અમદાવાદ: વડાપ્રધાન નરેન્દ્ર મોદી 25-26 ઓગસ્ટના રોજ ગુજરાતની મુલાકાતે આવશે. તેઓ 25 "
        "ઓગસ્ટે સાંજે ખોડલધામ મેદાન, અમદાવાદ ખાતે ₹5,400 કરોડથી વધુના વિવિધ વિકાસ પ્રોજેક્ટ્સનું "
        "લોકાર્પણ અને શિલાન્યાસ કરશે.",
        "26 ઓગસ્ટે તેઓ હાંસલપુર ખાતે સુઝુકીની પ્રથમ ગ્લોબલ બેટરી ઇલેક્ટ્રિક વ્હીકલ 'e VITARA'ને "
        "100થી વધુ દેશોમાં નિકાસ માટે લીલી ઝંડી આપશે તેમજ હાઇબ્રિડ બેટરી ઇલેક્ટ્રોડના સ્થાનિક "
        "ઉત્પાદનનું ઉદ્ઘાટન કરશે.",
        "કાર્યક્રમમાં ₹1,400 કરોડથી વધુના રેલવે પ્રોજેક્ટ્સ પણ રાષ્ટ્રને અર્પણ કરાશે, જેમાં "
        "મહેસાણા-પાલનપુર રેલ લાઇનનું બમણું કરણ અને કલોલ-કડી-કટોસણ તથા બેચરાજી-રાણુજ લાઇનનું "
        "ગેજ પરિવર્તન સામેલ છે.",
        "વિરમગામ-ખુડદ-રામપુરા રોડના પહોળાઈકરણનું ઉદ્ઘાટન તેમજ અમદાવાદ નજીક છ-લેન અંડરપાસના "
        "નિર્માણનું ખાતમુહૂર્ત પણ કરાશે.",
    ],
}


def flow_piece(page, frames, fid, text, align="left"):
    f = frames[fid]
    path, size, top_off, fit = flow_gujarati_text(text, f, f["sourceFont"], f["fontSizePt"], align=align)
    if not fit["fits"]:
        raise RuntimeError(f"{fid} did not fit: {fit}")
    print(f"{fid}: sourceFont={f['sourceFont']} declared={f['fontSizePt']}pt -> {size:.2f}pt "
          f"(shrink={fit['shrink_ratio']})")
    return composite_snippet(page, f, path, top_off, fit)


def main():
    tmpl = json.load(open(f"{ROOT}/web/src/lib/template.json"))
    frames = {f["id"]: f for f in tmpl["pages"]["1"]["frames"]}

    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    page = target[0]
    keep_alive = []

    # ---- static masthead + edition bar (unchanged, production-quality) ----
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

    # ---- STORY_SAMARTH: p1-11 (kicker), p1-13 (headline), p1-14/17/18/19 (4 body) ----
    keep_alive.append(flow_piece(page, frames, "p1-11", STORY_SAMARTH["kicker"]))
    keep_alive.append(flow_piece(page, frames, "p1-13", STORY_SAMARTH["headline"]))
    for fid, text in zip(["p1-14", "p1-17", "p1-18", "p1-19"], STORY_SAMARTH["bodyColumns"]):
        keep_alive.append(flow_piece(page, frames, fid, text, align="justify"))

    # ---- STORY_PRAG: p1-12 (headline), p1-21 (subhead), p1-20/22/23/24 (4 body), p1-15/16 (photos) ----
    keep_alive.append(flow_piece(page, frames, "p1-12", STORY_PRAG["headline"]))
    keep_alive.append(flow_piece(page, frames, "p1-21", STORY_PRAG["subhead"]))
    for fid, text in zip(["p1-20", "p1-22", "p1-23", "p1-24"], STORY_PRAG["bodyColumns"]):
        keep_alive.append(flow_piece(page, frames, fid, text, align="justify"))
    place_photo_cropped(page, frames["p1-15"], PRAG_PHOTO)
    # p1-15/p1-16 (two photo frames) overlap by 22.6pt at their shared edge
    # (835.7 vs 813.1) -- unlike text, a placed photo fills its frame exactly,
    # so this is a real ~23pt sliver where the placeholder's dashed border
    # would cross directly over the real photo. Inset p1-16's left edge to
    # start where p1-15 actually ends.
    p1_16_effective = dict(frames["p1-16"])
    p1_16_effective["x0"] = frames["p1-15"]["x1"]
    draw_open_photo_slot(page, p1_16_effective)

    # ---- STORY_NIFT: p1-25 (headline), p1-28 (subhead), p1-35/36/37 (3 body), p1-30/34 (photos, none sourced) ----
    keep_alive.append(flow_piece(page, frames, "p1-25", STORY_NIFT["headline"]))
    keep_alive.append(flow_piece(page, frames, "p1-28", STORY_NIFT["subhead"]))
    for fid, text in zip(["p1-35", "p1-36", "p1-37"], STORY_NIFT["bodyColumns"]):
        keep_alive.append(flow_piece(page, frames, fid, text, align="justify"))
    draw_open_photo_slot(page, frames["p1-30"])
    draw_open_photo_slot(page, frames["p1-34"])

    # ---- STORY_PM_VISIT: p1-26 (kicker), p1-27 (headline), p1-29/31/32/33 (4 body) ----
    keep_alive.append(flow_piece(page, frames, "p1-26", STORY_PM_VISIT["kicker"]))
    keep_alive.append(flow_piece(page, frames, "p1-27", STORY_PM_VISIT["headline"]))
    # p1-27 (headline_L1, spans the full width of the 4 body columns below it)
    # genuinely overlaps p1-29 (7066 sq pt), p1-31 (375), and p1-33 (182) in
    # template.json's real geometry -- found by rendering the page and seeing
    # the headline's second line print directly on top of the body's first
    # lines, not by the pairwise-overlap check alone (which was run only
    # after this was visually caught -- it should have been run on every
    # group before building, the same discipline page 2 already learned the
    # hard way). Each affected body column is clipped to start a small
    # gutter below p1-27's actual bottom edge rather than its own nominal
    # (overlapping) y0.
    ROW_GUTTER_PT = 5.0
    body_ids = ["p1-29", "p1-31", "p1-32", "p1-33"]
    for fid, text in zip(body_ids, STORY_PM_VISIT["bodyColumns"]):
        f = dict(frames[fid])
        if f["y0"] < frames["p1-27"]["y1"]:
            f["y0"] = frames["p1-27"]["y1"] + ROW_GUTTER_PT
        path, size, top_off, fit = flow_gujarati_text(text, f, f["sourceFont"], f["fontSizePt"], align="justify")
        if not fit["fits"]:
            raise RuntimeError(f"{fid} (clipped) did not fit: {fit}")
        print(f"{fid} (clipped below p1-27): {size:.2f}pt (shrink={fit['shrink_ratio']})")
        keep_alive.append(composite_snippet(page, f, path, top_off, fit))

    # ---- p1-39/40 (ad box), p1-42/43 (open story slots), p1-38/41 (photos in that
    # box) -- honest placeholders, per content.ts's own AD_PLACEHOLDER_IDS /
    # OPEN_STORY_SLOT_IDS classification, not something to fake content for ----
    draw_open_photo_slot(page, frames["p1-38"])
    draw_open_photo_slot(page, frames["p1-41"])
    draw_open_photo_slot(page, frames["p1-42"], label="STORY SLOT OPEN")
    draw_open_photo_slot(page, frames["p1-43"], label="STORY SLOT OPEN")

    target.save(OUT_PDF)
    print(f"\nwrote {OUT_PDF}")


if __name__ == "__main__":
    main()
