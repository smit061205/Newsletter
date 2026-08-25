#!/usr/bin/env python3
"""Phase 8 proof: a genuinely fresh, live-fetched real story (STORY_CBI_BRIBERY,
fetched from PIB this session -- see content.ts) flowed into page 2's frame
group (p2-23 headline, p2-26 kicker, p2-24/25/27/28 body columns), on top of
the Phase 6 running header. End-to-end: real content ingestion -> Phase 4
layout engine -> composited page, ready for the Phase 7 QA harness.

Usage: python3 scripts/build_page2_demo.py
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
OUT_PDF = f"{ROOT}/out/page-2-demo.pdf"

STORY_CBI_BRIBERY = {
    "kicker": "CBI કોર્ટ, અમદાવાદનો ચુકાદો; 2013ના ટ્રેપ કેસમાં 13 વર્ષે સજા",
    "headline": "લાંચ કેસમાં આવકવેરા અધિકારીને ત્રણ વર્ષની જેલ",
    "bodyColumns": [
        "અમદાવાદ: CBI કોર્ટ, અમદાવાદે 21 ઓગસ્ટના રોજ આવકવેરા અધિકારી જરનૈલ બી. સિંઘને લાંચ કેસમાં "
        "દોષિત ઠેરવી ત્રણ વર્ષની સખત કેદ અને ₹20,000ના દંડની સજા ફટકારી હતી.",
        "પ્રત્યક્ષકર ભવન, અમદાવાદ ખાતે ફરજ બજાવતા સિંઘ સામે 'શ્રીલેખા વિવિધલક્ષ્મી ચેરિટેબલ ટ્રસ્ટ'ને "
        "આવકવેરા કાયદાની કલમ 11 અને 80G હેઠળ મુક્તિ આપવા બદલ ₹10,000ની લાંચ માંગ્યાનો આરોપ હતો.",
        "CBIએ 22 ફેબ્રુઆરી, 2013ના રોજ છટકું ગોઠવી આરોપીને લાંચ સ્વીકારતા રંગેહાથ ઝડપી પાડ્યો હતો અને "
        "એ જ દિવસે ધરપકડ કરી હતી. તપાસ બાદ 31 ઓક્ટોબર, 2013ના રોજ ચાર્જશીટ દાખલ કરાઈ હતી.",
        "લગભગ 13 વર્ષની ટ્રાયલ બાદ કોર્ટે આરોપીને દોષિત ઠેરવ્યો, જે કેન્દ્ર સરકારના ભ્રષ્ટાચાર વિરોધી "
        "અભિયાનનું વધુ એક ઉદાહરણ ગણાવાઈ રહ્યું છે.",
    ],
}


def main():
    tmpl = json.load(open(f"{ROOT}/web/src/lib/template.json"))
    frames = {f["id"]: f for f in tmpl["pages"]["2"]["frames"]}

    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    page = target[1]  # page 2, 0-indexed
    keep_alive = []

    # ---- Phase 6: running header (already built/proven) ----
    keep_alive.append(build_running_header(
        page, src, 1,
        calibration_ratio_fn=lambda size: size * calibration_ratio("BBharatiGopikaTwo,Bold", size),
    ))

    # ---- Phase 4: headline + kicker + 4 body columns, real fetched content ----
    f = frames["p2-23"]
    path, size, top_off, fit = flow_gujarati_text(STORY_CBI_BRIBERY["headline"], f, "BBharatiGopikaTwo,Bold",
                                              f["fontSizePt"], align="left")
    keep_alive.append(composite_snippet(page, f, path, top_off, fit))
    print(f"p2-23 headline: declared={f['fontSizePt']}pt -> calibrated={size:.2f}pt")

    f = frames["p2-26"]
    path, size, top_off, fit = flow_gujarati_text(STORY_CBI_BRIBERY["kicker"], f, "BBharatiGopikaTwo,Bold",
                                              f["fontSizePt"], align="left")
    keep_alive.append(composite_snippet(page, f, path, top_off, fit))
    print(f"p2-26 kicker:   declared={f['fontSizePt']}pt -> calibrated={size:.2f}pt")

    body_ids = ["p2-24", "p2-25", "p2-27", "p2-28"]
    for fid, text in zip(body_ids, STORY_CBI_BRIBERY["bodyColumns"]):
        f = frames[fid]
        path, size, top_off, fit = flow_gujarati_text(text, f, "BBharatiGopikaTwo", f["fontSizePt"], align="justify")
        keep_alive.append(composite_snippet(page, f, path, top_off, fit))
        print(f"{fid} body:     declared={f['fontSizePt']}pt -> calibrated={size:.2f}pt")

    target.save(OUT_PDF)
    print(f"\nwrote {OUT_PDF}")


if __name__ == "__main__":
    main()
