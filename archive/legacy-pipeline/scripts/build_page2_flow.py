#!/usr/bin/env python3
"""Page 2 companion to build_page1_flow.py -- same technique (one HTML
document per page's body region, real CSS flexbox reflow, WeasyPrint
renders it in a single pass), same disclosed simplification (today's actual
module shapes are staggered in a way that needs 2D grid-line placement to
replicate exactly; this uses a clean row-based layout instead -- a
reasonable variant, not a pixel-exact replica, per Phase 10's own finding
that module shapes are a day-to-day choice, not a fixed truth to preserve
forever).

Row layout: UPI's own banner row (headline + eyebrow/kicker/body + chart),
then two 2-up rows (RBI | Bhavnagar, Aadhaar | CBI) -- a straightforward
regrouping of the same 5 real stories built this session, using the same
real grid pitch/gutter and calibrated font sizes throughout.

Usage: python3 scripts/build_page2_flow.py
"""
import sys
import json
import tempfile
import fitz
from weasyprint import HTML

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import calibration_ratio, FONT_ROLES, crop_to_aspect, INK_NEAR_BLACK, draw_open_photo_slot
from daily_build import ROOT as DB_ROOT
from running_header import build_running_header

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
OUT_PDF = f"{ROOT}/out/page-2-flow.pdf"

LIVE_X0, LIVE_X1 = 15.51, 1104.182
GUTTER = 11.884
BODY_TOP = 32.0     # just below the running header's own bottom edge
BODY_BOTTOM = 1575.0  # live area bottom (no fixed ad box on this page)

MIN_FIT_RATIO = 0.85
FIT_SHRINK_STEP = 0.03
MAX_FIT_ATTEMPTS = 6


def css_font_faces():
    parts = []
    for role, spec in FONT_ROLES.items():
        parts.append(
            f"@font-face {{ font-family: '{spec['family']}'; "
            f"src: url('file://{spec['file']}'); font-weight: {spec['weight']}; }}"
        )
    return "\n".join(parts)


def sized(source_font, declared_pt, scale=1.0):
    role = FONT_ROLES[source_font]
    size = declared_pt * calibration_ratio(source_font, declared_pt) * scale
    return role["family"], role["weight"], size


def story_html(headline, kicker, body_paragraphs, *, headline_font, headline_pt,
                kicker_font=None, kicker_pt=None, photo_path=None, photo_caption=None,
                photo_aspect=1.6, scale=1.0, extra_top_html=""):
    parts = ['<div class="story">', extra_top_html]
    if kicker and kicker_font:
        fam, w, sz = sized(kicker_font, kicker_pt, scale)
        parts.append(
            f'<div class="kicker" style="font-family:\'{fam}\';font-weight:{w};'
            f'font-size:{sz:.2f}pt">{kicker}</div>'
        )
    if headline and headline_font:
        fam, w, sz = sized(headline_font, headline_pt, scale)
        parts.append(
            f'<div class="headline" style="font-family:\'{fam}\';font-weight:{w};'
            f'font-size:{sz:.2f}pt">{headline}</div>'
        )
    if photo_path:
        cropped = crop_to_aspect(photo_path, photo_aspect)
        parts.append(f'<img class="photo" src="file://{cropped}" style="aspect-ratio:{photo_aspect}">')
        if photo_caption:
            parts.append(f'<div class="caption">{photo_caption}</div>')
    body_fam, body_w, body_sz = sized("BBharatiGopikaTwo", 13.0, scale)
    for p in body_paragraphs:
        parts.append(
            f'<p class="body" style="font-family:\'{body_fam}\';font-weight:{body_w};'
            f'font-size:{body_sz:.2f}pt">{p}</p>'
        )
    parts.append("</div>")
    return "\n".join(parts)


def build_body_html(width_pt, height_pt, upi, rbi, bhavnagar, aadhaar, cbi):
    return f"""
    <html><head><meta charset="utf-8"><style>
      {css_font_faces()}
      @page {{ size: {width_pt}pt {height_pt}pt; margin: 0; }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; color: {INK_NEAR_BLACK}; }}
      .page-body {{ display: flex; flex-direction: column; gap: {GUTTER}pt; width: {width_pt}pt; }}
      .split-row {{ display: flex; flex-direction: row; gap: {GUTTER}pt; }}
      .split-row > .story {{ flex: 1; min-width: 0; }}
      .story {{ }}
      .kicker {{ line-height: 1.2; margin-bottom: 4pt; }}
      .headline {{ line-height: 1.15; margin-bottom: 8pt; text-wrap: balance; }}
      .body {{ line-height: 1.2; text-align: justify; margin: 0 0 8pt 0; }}
      .photo {{ width: 100%; display: block; margin-bottom: 4pt; }}
      .caption {{ font-size: 8.5pt; line-height: 1.3; color: #555; margin-bottom: 8pt; }}
      .display-en {{ font-family: 'Tinos', serif; font-weight: 700; margin-bottom: 6pt; }}
    </style></head>
    <body>
      <div class="page-body">
        {upi}
        <div class="split-row">{rbi}{bhavnagar}</div>
        <div class="split-row">{aadhaar}{cbi}</div>
      </div>
    </body></html>
    """


def render_body(build_stories):
    width_pt = LIVE_X1 - LIVE_X0
    height_pt = BODY_BOTTOM - BODY_TOP
    scale = 1.0
    for attempt in range(1, MAX_FIT_ATTEMPTS + 1):
        upi, rbi, bhavnagar, aadhaar, cbi = build_stories(scale)
        html = build_body_html(width_pt, height_pt, upi, rbi, bhavnagar, aadhaar, cbi)
        out_path = tempfile.mktemp(suffix=".pdf")
        HTML(string=html, base_url=ROOT).write_pdf(out_path)
        doc = fitz.open(out_path)
        if doc.page_count <= 1:
            return out_path, scale, {"fits": True, "shrink_ratio": scale, "attempts": attempt}
        scale -= FIT_SHRINK_STEP
        if scale < MIN_FIT_RATIO:
            return out_path, scale, {"fits": False, "shrink_ratio": scale, "attempts": attempt}
    return out_path, scale, {"fits": False, "shrink_ratio": scale, "attempts": MAX_FIT_ATTEMPTS}


def main():
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

    RBI_BODY = [
        "નવી દિલ્હી: રિઝર્વ બેંક ઓફ ઇન્ડિયા (RBI)ની ખાસ USD-INR ફોરેક્સ સ્વેપ સુવિધાએ દેશમાં "
        "વિદેશી હૂંડિયામણના પ્રવાહમાં અભૂતપૂર્વ ઉછાળો નોંધાવ્યો છે.",
        "8 જૂન, 2026ના રોજ શરૂ કરાયેલી આ યોજના હેઠળ 21 ઓગસ્ટ સુધીમાં કુલ 73 અબજ ડોલરનો પ્રવાહ "
        "એકત્ર થયો છે, જેમાં FCNR(B) થાપણોનો હિસ્સો 65.40 અબજ ડોલર છે.",
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

    AADHAAR_BODY = [
        "દીવ: યુનિક આઇડેન્ટિફિકેશન ઓથોરિટી ઓફ ઇન્ડિયા (UIDAI)ની મુંબઈ પ્રાદેશિક કચેરી દ્વારા "
        "દીવ ખાતે આધાર નોંધણી અને અપડેટ ઈકોસિસ્ટમ પર વિશેષ તાલીમ કાર્યક્રમ યોજાયો હતો.",
        "24 ઓગસ્ટે યોજાયેલી આ તાલીમમાં જૂનાગઢ, અમરેલી, ગીર-સોમનાથ અને ભાવનગરના 60થી વધુ "
        "ઓપરેટરોએ ભાગ લીધો હતો.",
        "કાર્યક્રમનું ઉદ્ઘાટન SDM શ્રી શિવમ મિશ્રા દ્વારા કરાયું. તાલીમમાં નવા ક્લાયન્ટ ફીચર્સ "
        "અને દસ્તાવેજોની યાદી આવરી લેવાઈ.",
        "કાર્યક્રમમાં પ્રશ્ન-જવાબ સત્ર પણ યોજાયું. સમાપન BDO દીવ શ્રી જિતેન્દ્ર વાળાના "
        "આભારવિધિ સાથે થયું.",
    ]

    CBI_BODY = [
        "અમદાવાદ: CBI કોર્ટ, અમદાવાદે 21 ઓગસ્ટના રોજ આવકવેરા અધિકારી જરનૈલ બી. સિંઘને લાંચ કેસમાં "
        "દોષિત ઠેરવી ત્રણ વર્ષની સખત કેદ અને ₹20,000ના દંડની સજા ફટકારી હતી.",
        "પ્રત્યક્ષકર ભવન, અમદાવાદ ખાતે ફરજ બજાવતા સિંઘ સામે 'શ્રીલેખા વિવિધલક્ષ્મી ચેરિટેબલ ટ્રસ્ટ'ને "
        "આવકવેરા કાયદાની કલમ 11 અને 80G હેઠળ મુક્તિ આપવા બદલ ₹10,000ની લાંચ માંગ્યાનો આરોપ હતો.",
        "CBIએ 22 ફેબ્રુઆરી, 2013ના રોજ છટકું ગોઠવી આરોપીને લાંચ સ્વીકારતા રંગેહાથ ઝડપી પાડ્યો હતો અને "
        "એ જ દિવસે ધરપકડ કરી હતી. તપાસ બાદ 31 ઓક્ટોબર, 2013ના રોજ ચાર્જશીટ દાખલ કરાઈ હતી.",
        "લગભગ 13 વર્ષની ટ્રાયલ બાદ કોર્ટે આરોપીને દોષિત ઠેરવ્યો, જે કેન્દ્ર સરકારના ભ્રષ્ટાચાર વિરોધી "
        "અભિયાનનું વધુ એક ઉદાહરણ ગણાવાઈ રહ્યું છે.",
    ]

    def build_stories(scale):
        fam, w, sz = sized("Times-Bold", 60.0, scale)
        upi_display = f'<div class="display-en" style="font-family:\'{fam}\';font-weight:{w};font-size:{sz:.2f}pt">UPI @ 10</div>'
        upi_html = story_html(
            UPI_HEADLINE, UPI_EYEBROW, UPI_BODY,
            headline_font="BBharatiMaruti", headline_pt=33.94,
            kicker_font="BBharatiTitleTwo", kicker_pt=27.44,
            photo_path=f"{ROOT}/web/public/photos/upi_chart.png", photo_aspect=2.6,
            scale=scale, extra_top_html=upi_display,
        )
        rbi_html = story_html(
            None, None, RBI_BODY,
            headline_font=None, headline_pt=0,
            photo_path=None, scale=scale,
        )
        bhavnagar_html = story_html(
            None, None, BHAVNAGAR_BODY,
            headline_font=None, headline_pt=0,
            scale=scale,
        )
        aadhaar_html = story_html(
            None, None, AADHAAR_BODY,
            headline_font=None, headline_pt=0,
            scale=scale,
        )
        cbi_html = story_html(
            "લાંચ કેસમાં આવકવેરા અધિકારીને ત્રણ વર્ષની જેલ",
            "CBI કોર્ટ, અમદાવાદનો ચુકાદો; 2013ના ટ્રેપ કેસમાં 13 વર્ષે સજા",
            CBI_BODY,
            headline_font="BBharatiGopikaTwo,Bold", headline_pt=26.0,
            kicker_font="BBharatiGopikaTwo,Bold", kicker_pt=16.0,
            scale=scale,
        )
        return upi_html, rbi_html, bhavnagar_html, aadhaar_html, cbi_html

    body_pdf_path, scale, fit = render_body(build_stories)
    print(f"page 2 body flow: scale={scale:.3f} fit={fit}")
    if not fit["fits"]:
        raise RuntimeError(f"page-2 body content did not fit even at shrink={scale}: {fit}")

    target = fitz.open(TARGET_PDF)
    page = target[1]
    keep_alive = [build_running_header(
        page, fitz.open(SRC_PDF), 1,
        calibration_ratio_fn=lambda size: size * calibration_ratio("BBharatiGopikaTwo,Bold", size),
    )]

    body_doc = fitz.open(body_pdf_path)
    keep_alive.append(body_doc)
    body_rect = fitz.Rect(LIVE_X0, BODY_TOP, LIVE_X1, BODY_BOTTOM)
    page.show_pdf_page(body_rect, body_doc, 0)

    target.save(OUT_PDF)
    print(f"wrote {OUT_PDF}")


if __name__ == "__main__":
    main()
