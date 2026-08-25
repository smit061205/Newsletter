#!/usr/bin/env python3
"""Extends coverage to page 3: two real, previously-sourced-but-unbuilt
stories from content.ts (STORY_NIFT, STORY_PM_VISIT) flowed into real page-3
frame groups. STORY_PM_VISIT's headline lands in a BBharatiMaruti frame
(p3-20) -- the first full-story test of that font role (added this session)
beyond the isolated placeholder-text check.

Usage: python3 scripts/build_page3_demo.py
"""
import sys
import json
import fitz

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import flow_gujarati_text, composite_snippet, calibration_ratio
from running_header import build_running_header

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
OUT_PDF = f"{ROOT}/out/page-3-demo.pdf"

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
    "headline": "વડાપ્રધાન મોદી 25-26 ઓગસ્ટે ગુજરાતની મુલાકાતે",
    "bodyColumns": [
        "અમદાવાદ: વડાપ્રધાન નરેન્દ્ર મોદી 25-26 ઓગસ્ટના રોજ ગુજરાતની મુલાકાતે આવશે. તેઓ 25 "
        "ઓગસ્ટે સાંજે ખોડલધામ મેદાન, અમદાવાદ ખાતે ₹5,400 કરોડથી વધુના વિવિધ વિકાસ પ્રોજેક્ટ્સનું "
        "લોકાર્પણ અને શિલાન્યાસ કરશે.",
        "26 ઓગસ્ટે તેઓ હાંસલપુર ખાતે સુઝુકીની પ્રથમ ગ્લોબલ બેટરી ઇલેક્ટ્રિક વ્હીકલ 'e VITARA'ને "
        "100થી વધુ દેશોમાં નિકાસ માટે લીલી ઝંડી આપશે તેમજ હાઇબ્રિડ બેટરી ઇલેક્ટ્રોડના સ્થાનિક "
        "ઉત્પાદનનું ઉદ્ઘાટન કરશે.",
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
    frames = {f["id"]: f for f in tmpl["pages"]["3"]["frames"]}

    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    page = target[2]  # page 3, 0-indexed
    keep_alive = []

    keep_alive.append(build_running_header(
        page, src, 2,
        calibration_ratio_fn=lambda size: size * calibration_ratio("BBharatiGopikaTwo,Bold", size),
    ))

    # ---- STORY_NIFT: headline + subhead + 3 body columns ----
    keep_alive.append(flow_piece(page, frames, "p3-7", STORY_NIFT["headline"]))
    keep_alive.append(flow_piece(page, frames, "p3-16", STORY_NIFT["subhead"]))
    for fid, text in zip(["p3-17", "p3-18", "p3-19"], STORY_NIFT["bodyColumns"]):
        keep_alive.append(flow_piece(page, frames, fid, text, align="justify"))

    # ---- STORY_PM_VISIT: headline (BBharatiMaruti frame) + 2 body columns ----
    keep_alive.append(flow_piece(page, frames, "p3-20", STORY_PM_VISIT["headline"]))
    for fid, text in zip(["p3-21", "p3-22"], STORY_PM_VISIT["bodyColumns"]):
        keep_alive.append(flow_piece(page, frames, fid, text, align="justify"))

    target.save(OUT_PDF)
    print(f"\nwrote {OUT_PDF}")


if __name__ == "__main__":
    main()
