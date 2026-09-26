#!/usr/bin/env python3
"""Completes page 2 with four genuinely new real stories, sourced live from
PIB this session (24 Aug 2026 releases): UPI's 10th anniversary (PRID
2302670), RBI's USD-INR forex swap results (PRID 2302921), a Bhavnagar
hospital treating an adulterated-alcohol poisoning incident (PRID 2302768),
and an Aadhaar training program in Diu covering Saurashtra operators (PRID
2302740). None of these duplicate content already used on pages 1/3/4.
Photo frames with no sourced image are left as honest open slots.

Usage: python3 scripts/build_page2_full.py
"""
import sys
import json
import fitz

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import flow_gujarati_text, composite_snippet, draw_open_photo_slot, calibration_ratio
from running_header import build_running_header

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
OUT_PDF = f"{ROOT}/out/page-2-full.pdf"

UPI_EYEBROW = "ડિજિટલ ક્રાંતિ"
UPI_HEADLINE = "UPIના 10 વર્ષ પૂર્ણ"
UPI_BODY = [
    "નવી દિલ્હી: રિઝર્વ બેંક ઓફ ઇન્ડિયા (RBI)ની દેખરેખ હેઠળ નેશનલ પેમેન્ટ્સ કોર્પોરેશન ઓફ "
    "ઇન્ડિયા (NPCI) દ્વારા 25 ઓગસ્ટ, 2016ના રોજ શરૂ કરાયેલ યુનિફાઇડ પેમેન્ટ્સ ઇન્ટરફેસ (UPI)એ "
    "ડિજિટલ પેમેન્ટ ક્રાંતિના 10 વર્ષ પૂર્ણ કર્યા છે.",
    "વાર્ષિક ટ્રાન્ઝેક્શન વોલ્યુમ નાણાકીય વર્ષ 2016-17માં માત્ર 1.78 કરોડથી વધીને 2025-26માં "
    "24,162 કરોડથી વધુ થયું છે, જે લગભગ 13,000 ગણો વધારો દર્શાવે છે.",
    "ટ્રાન્ઝેક્શન મૂલ્ય પણ ₹0.07 લાખ કરોડથી વધીને લગભગ ₹314 લાખ કરોડ થયું છે, જે 4,000 "
    "ગણાથી વધુના ઉછાળા સમાન છે.",
    "UPI હાલમાં 11 દેશોમાં કાર્યરત છે અને ક્રોસ-બોર્ડર ડિજિટલ પેમેન્ટ્સ માટે વૈશ્વિક પ્લેટફોર્મ "
    "તરીકે ઉભરી આવ્યું છે. UPI સાથે જોડાયેલી બેંકોની સંખ્યા 44થી વધીને 703 થઈ છે.",
    "આંતરરાષ્ટ્રીય નાણાકીય ભંડોળ (IMF)એ UPIને ટ્રાન્ઝેક્શન વોલ્યુમની દૃષ્ટિએ વિશ્વની સૌથી "
    "મોટી રિયલ-ટાઇમ પેમેન્ટ સિસ્ટમ તરીકે માન્યતા આપી છે.",
    "નિષ્ણાતોના મતે, UPIની સફળતા સ્કેલેબલ અને સર્વસમાવેશક ડિજિટલ પબ્લિક ઇન્ફ્રાસ્ટ્રક્ચરના "
    "નિર્માણમાં ભારતના નેતૃત્વને રેખાંકિત કરે છે.",
]

RBI_PARA_1_2 = [
    "નવી દિલ્હી: રિઝર્વ બેંક ઓફ ઇન્ડિયા (RBI)ની ખાસ USD-INR ફોરેક્સ સ્વેપ સુવિધાએ દેશમાં "
    "વિદેશી હૂંડિયામણના પ્રવાહમાં અભૂતપૂર્વ ઉછાળો નોંધાવ્યો છે.",
    "8 જૂન, 2026ના રોજ શરૂ કરાયેલી આ યોજના હેઠળ 21 ઓગસ્ટ સુધીમાં કુલ 73 અબજ ડોલરનો પ્રવાહ "
    "એકત્ર થયો છે, જેમાં FCNR(B) થાપણોનો હિસ્સો 65.40 અબજ ડોલર છે.",
]
RBI_PARA_3_4 = [
    "અગિયાર સપ્તાહથી ઓછા સમયમાં આ આંકડો હાંસલ કરીને, આ કવાયતે 2013ની RBIની અગાઉની યોજના "
    "(લગભગ ત્રણ મહિનામાં 26 અબજ ડોલર)ની ઝડપ અને વ્યાપ્તિને પાછળ છોડી દીધી છે.",
    "પ્રતિસાદ એટલો મજબૂત રહ્યો કે RBIએ FCNR(B) વિન્ડો બંધ કરવાની તારીખ 30 સપ્ટેમ્બરથી વહેલી "
    "કરીને 31 ઓગસ્ટ કરી દીધી છે.",
]

BHAVNAGAR_BODY = [
    "ભાવનગર: શહેરમાં ભેળસેળયુક્ત આલ્કોહોલના સેવનથી સર્જાયેલી ગંભીર ઘટનાને પગલે કેન્દ્રીય "
    "રાજ્ય મંત્રી શ્રીમતી નિમુબેન બાંભણિયાએ સર ટી હોસ્પિટલની મુલાકાત લઈને જિલ્લા અધિકારીઓ "
    "સાથે ઉચ્ચસ્તરીય બેઠક યોજી હતી.",
    "મંત્રીશ્રીએ જણાવ્યું કે અત્યાર સુધીમાં 44 અસરગ્રસ્તો હોસ્પિટલમાં દાખલ થયા હતા, જે પૈકી "
    "29 ડિસ્ચાર્જ થયા છે અને દુ:ખદ રીતે 13 વ્યક્તિઓનાં મૃત્યુ થયાં છે, જ્યારે બે અસરગ્રસ્તોની "
    "સારવાર હજુ ચાલુ છે.",
    "પોલીસ તંત્ર અને એસ.એમ.સી. આ ઘટનાની તપાસ કરી રહ્યાં છે. નાયબ મુખ્યમંત્રી શ્રી હર્ષભાઈ "
    "સંઘવીએ ઘટનાના દિવસે જ તપાસ એસ.એમ.સી.ને સોંપી હતી.",
    "સર ટી હોસ્પિટલમાં દાખલ દર્દીઓ માટે ડાયાલિસિસ સહિતની સારવાર માટે ડોકટરોની ટીમ કાર્યરત "
    "છે. જરૂરી ઇન્જેક્શનોની વ્યવસ્થા મહારાષ્ટ્રથી કરવામાં આવી હતી.",
    "બેઠકમાં જિલ્લા કલેક્ટર ડૉ. મનીષકુમાર બંસલ, જિલ્લા વિકાસ અધિકારી શ્રી હનુલ ચૌધરી, પોલીસ "
    "અધિક્ષક શ્રી નીતેશ પાંડેય સહિતના અધિકારીઓ ઉપસ્થિત રહ્યા હતા.",
]

AADHAAR_PARA_1 = [
    "દીવ: યુનિક આઇડેન્ટિફિકેશન ઓથોરિટી ઓફ ઇન્ડિયા (UIDAI)ની મુંબઈ પ્રાદેશિક કચેરી દ્વારા "
    "દીવ ખાતે આધાર નોંધણી અને અપડેટ ઈકોસિસ્ટમ પર વિશેષ તાલીમ કાર્યક્રમ યોજાયો હતો.",
]
AADHAAR_PARA_2_3_4 = [
    "24 ઓગસ્ટે યોજાયેલી આ તાલીમમાં જૂનાગઢ, અમરેલી, ગીર-સોમનાથ અને ભાવનગરના 60થી વધુ "
    "ઓપરેટરોએ ભાગ લીધો હતો.",
    "કાર્યક્રમનું ઉદ્ઘાટન SDM શ્રી શિવમ મિશ્રા દ્વારા કરાયું. તાલીમમાં નવા ક્લાયન્ટ ફીચર્સ "
    "અને દસ્તાવેજોની યાદી આવરી લેવાઈ.",
    "કાર્યક્રમમાં પ્રશ્ન-જવાબ સત્ર પણ યોજાયું. સમાપન BDO દીવ શ્રી જિતેન્દ્ર વાળાના "
    "આભારવિધિ સાથે થયું.",
]


def flow_piece(page, frames, fid, text, align="left", font_override=None):
    f = frames[fid]
    font = font_override or f["sourceFont"]
    path, size, top_off, fit = flow_gujarati_text(text, f, font, f["fontSizePt"], align=align)
    if not fit["fits"]:
        raise RuntimeError(f"{fid} did not fit: {fit}")
    print(f"{fid}: sourceFont={font} declared={f['fontSizePt']}pt -> {size:.2f}pt (shrink={fit['shrink_ratio']})")
    return composite_snippet(page, f, path, top_off, fit)


def main():
    tmpl = json.load(open(f"{ROOT}/web/src/lib/template.json"))
    frames = {f["id"]: f for f in tmpl["pages"]["2"]["frames"]}

    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    page = target[1]  # page 2, 0-indexed
    keep_alive = []

    keep_alive.append(build_running_header(
        page, src, 1,
        calibration_ratio_fn=lambda size: size * calibration_ratio("BBharatiGopikaTwo,Bold", size),
    ))

    # ---- group 1: big display headline (Times-Bold, English) ----
    keep_alive.append(flow_piece(page, frames, "p2-7", "UPI @ 10"))
    draw_open_photo_slot(page, frames["p2-13"])

    # ---- group 2: UPI 10-years story (deck + headline + long body) ----
    keep_alive.append(flow_piece(page, frames, "p2-8", UPI_EYEBROW))
    keep_alive.append(flow_piece(page, frames, "p2-9", UPI_HEADLINE))
    keep_alive.append(flow_piece(page, frames, "p2-10", " ".join(UPI_BODY), align="justify"))

    # ---- group 3: RBI forex story (tall intro + photo + 2 body cols) ----
    keep_alive.append(flow_piece(page, frames, "p2-12", " ".join(RBI_PARA_1_2), align="justify"))
    draw_open_photo_slot(page, frames["p2-14"])
    keep_alive.append(flow_piece(page, frames, "p2-15", RBI_PARA_3_4[0], align="justify"))
    keep_alive.append(flow_piece(page, frames, "p2-16", RBI_PARA_3_4[1], align="justify"))

    # ---- group 4: Bhavnagar alcohol-poisoning story (tall single column + photo) ----
    # p2-11's nominal bbox genuinely overlaps THREE other frames -- p2-12
    # (36,802 sq pt), p2-14 (29,121 sq pt), and even its own group's photo
    # p2-19 (79,993 sq pt) -- found by rendering the page and seeing text
    # physically collide, not by geometry inspection alone (a first fix
    # attempt only cleared the p2-12 conflict and missed the other two).
    # Computed the actual safe sub-rectangle directly rather than guessing
    # again: for y in [245.8, 791.4) the conflict is with p2-12/p2-14's
    # shared left edge (x>=424.9), so x in [287.7, 424.9) is clear across
    # that whole band -- the largest single conflict-free rectangle
    # available, used as p2-11's effective content area instead of its
    # full nominal bbox.
    # A 0.5pt gap between the clipped edges is geometrically non-overlapping
    # but visually reads as crowded/touching at normal reading size (no
    # newspaper column runs with zero gutter) -- subtracting the grid's own
    # measured column gutter (GRID.gutterPt, gridSpec.ts) gives the two
    # columns genuine breathing room instead of a bare non-collision.
    GUTTER_PT = 11.884
    p2_11_effective = dict(frames["p2-11"])
    p2_11_effective["x1"] = frames["p2-14"]["x0"] - GUTTER_PT
    p2_11_effective["y1"] = frames["p2-14"]["y0"]
    path, size, top_off, fit = flow_gujarati_text(
        " ".join(BHAVNAGAR_BODY), p2_11_effective, p2_11_effective["sourceFont"],
        p2_11_effective["fontSizePt"], align="justify",
    )
    if not fit["fits"]:
        raise RuntimeError(f"p2-11 (clipped) did not fit: {fit}")
    print(f"p2-11 (clipped to safe rect): {size:.2f}pt (shrink={fit['shrink_ratio']})")
    keep_alive.append(composite_snippet(page, p2_11_effective, path, top_off, fit))
    draw_open_photo_slot(page, frames["p2-19"])

    # ---- group 5: Aadhaar Diu training story (body + photo + 3 body cols) ----
    keep_alive.append(flow_piece(page, frames, "p2-17", AADHAAR_PARA_1[0], align="justify"))
    draw_open_photo_slot(page, frames["p2-18"])
    for fid, text in zip(["p2-20", "p2-21", "p2-22"], AADHAAR_PARA_2_3_4):
        keep_alive.append(flow_piece(page, frames, fid, text, align="justify"))

    target.save(OUT_PDF)
    print(f"\nwrote {OUT_PDF}")


if __name__ == "__main__":
    main()
