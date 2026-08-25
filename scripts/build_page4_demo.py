#!/usr/bin/env python3
"""Extends coverage to page 4: STORY_SAMARTH (real, previously-sourced-but-
unbuilt) flowed into a real page-4 frame group (p4-22 headline, p4-23
kicker, p4-29/30/32/33 body columns).

Usage: python3 scripts/build_page4_demo.py
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
OUT_PDF = f"{ROOT}/out/page-4-demo.pdf"

STORY_SAMARTH = {
    "kicker": "₹190 કરોડનો પ્રોજેક્ટ, પાંચ વર્ષમાં 10 હજારથી વધુ વિદ્યાર્થીઓને તાલીમ અપાશે",
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
    frames = {f["id"]: f for f in tmpl["pages"]["4"]["frames"]}

    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    page = target[3]  # page 4, 0-indexed
    keep_alive = []

    keep_alive.append(build_running_header(
        page, src, 3,
        calibration_ratio_fn=lambda size: size * calibration_ratio("BBharatiGopikaTwo,Bold", size),
    ))

    keep_alive.append(flow_piece(page, frames, "p4-22", STORY_SAMARTH["headline"]))
    keep_alive.append(flow_piece(page, frames, "p4-23", STORY_SAMARTH["kicker"]))
    for fid, text in zip(["p4-29", "p4-30", "p4-32", "p4-33"], STORY_SAMARTH["bodyColumns"]):
        keep_alive.append(flow_piece(page, frames, fid, text, align="justify"))

    target.save(OUT_PDF)
    print(f"\nwrote {OUT_PDF}")


if __name__ == "__main__":
    main()
