#!/usr/bin/env python3
"""Phase 3 prototype (docs/PRECISION_ROADMAP.md): whole-page CSS flow
composition, replacing per-frame PyMuPDF absolute placement for a page's
BODY content (masthead/edition bar stay exactly as before -- they're
genuinely static, not part of the variable-content problem this fixes).

Why this exists: Phase 1 (capacity-aware assignment) and Phase 2 (merge
unused trailing frames) each fixed a real, measured defect, but both only
ever operate WITHIN one module's own fixed rectangle -- neither can reclaim
VERTICAL space across module boundaries, because every module's height is
still a fixed number copied from template.json's one measured reference
issue. Measured directly on a real build: 4-47% of each story module's own
allotted height sat unused even after both fixes. That's a structural limit
of absolute-coordinate compositing, not something another local patch can
close.

This script proves the real fix empirically before touching the production
pipeline: build ONE HTML document for the page's body region, laid out with
real CSS flexbox (auto-height rows/columns, not fixed pt boxes), rendered by
WeasyPrint in a single pass. A story's leftover vertical space becomes
available to whatever sits below/beside it automatically -- a property of
the layout engine, not bespoke Python geometry math for each new case.

Verified empirically before designing this (see docs/PRECISION_ROADMAP.md):
a minimal WeasyPrint flexbox test with real Gujarati text confirmed intrinsic
row/column heights and independent-height siblings both work correctly.

Simplification, disclosed rather than hidden: today's real page-1 shape has
PM_VISIT's module spanning columns 3-7, straddling both the "left stack" and
"right column" zones below. Exactly replicating that stagger needs 2D
grid-line placement (CSS Grid), which WeasyPrint has known gaps in (nested
grids, auto-height rows) -- flexbox doesn't support arbitrary 2D spans, only
clean nesting. This build uses a clean 2-region top-level split (left
stack | right tall column) with NIFT/PM_VISIT sharing an even 2-up row
within the left stack, using the SAME real grid pitch/gutter throughout --
a reasonable variant of today's shape, not a pixel-exact replica of it.
Module SHAPES are a day-to-day design choice anyway (Phase 10: there is no
second reference issue to prove one exact arrangement is "correct" forever),
so this is not a loss of fidelity, just a documented simplification for this
prototype.

Usage: python3 scripts/build_page1_flow.py
"""
import sys
import json
import tempfile
import fitz
from weasyprint import HTML

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from layout_lib import calibration_ratio, FONT_ROLES, crop_to_aspect, INK_NEAR_BLACK
from daily_build import build_page1_masthead, ROOT as DB_ROOT
from layout_lib import draw_open_photo_slot

ROOT = "/Users/smitthakkar/NewsPaper_Project"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
OUT_PDF = f"{ROOT}/out/page-1-flow.pdf"

# Live-area grid (web/src/lib/gridSpec.ts) -- the one thing about the page
# that stays genuinely fixed: it's the physical paper's real column pitch,
# not a per-story layout decision.
LIVE_X0, LIVE_X1 = 15.51, 1104.182
GUTTER = 11.884
BODY_TOP = 266.054   # edition bar's own bottom edge (build_page1_masthead)
BODY_BOTTOM = 1167.8  # ad box's own top edge -- flow content must not run into it
LEFT_WIDTH = 559.846 - LIVE_X0    # columns 1-4
RIGHT_WIDTH = LIVE_X1 - 559.846   # columns 4-8

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
    """Real calibrated pt size for this source font, same lookup the
    per-frame pipeline already trusted (web/src/lib/calibration_ratios.json
    via layout_lib.calibration_ratio) -- flow composition changes WHERE text
    goes, not what size it renders at. `scale` is the auto-shrink ratio
    (see render_body) applied directly to the computed size, the same way
    layout_lib.flow_gujarati_text always shrunk an actual pt value rather
    than relying on a CSS-relative trick that only some elements would obey."""
    role = FONT_ROLES[source_font]
    size = declared_pt * calibration_ratio(source_font, declared_pt) * scale
    return role["family"], role["weight"], size


def story_html(headline, kicker, body_paragraphs, *, headline_font, headline_pt,
                kicker_font=None, kicker_pt=None, photo_path=None, photo_caption=None,
                photo_aspect=1.5, scale=1.0):
    parts = ['<div class="story">']
    if kicker and kicker_font:
        fam, w, sz = sized(kicker_font, kicker_pt, scale)
        parts.append(
            f'<div class="kicker" style="font-family:\'{fam}\';font-weight:{w};'
            f'font-size:{sz:.2f}pt">{kicker}</div>'
        )
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


def build_body_html(width_pt, height_pt, samarth, prag, nift, pm_visit):
    return f"""
    <html><head><meta charset="utf-8"><style>
      {css_font_faces()}
      @page {{ size: {width_pt}pt {height_pt}pt; margin: 0; }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; color: {INK_NEAR_BLACK}; }}
      .page-body {{ display: flex; flex-direction: row; gap: {GUTTER}pt; width: {width_pt}pt; }}
      .left-col {{ display: flex; flex-direction: column; gap: {GUTTER}pt; width: {LEFT_WIDTH}pt; }}
      .right-col {{ width: {RIGHT_WIDTH}pt; }}
      .split-row {{ display: flex; flex-direction: row; gap: {GUTTER}pt; }}
      .split-row > .story {{ flex: 1; min-width: 0; }}
      .story {{ }}
      .kicker {{ line-height: 1.2; margin-bottom: 4pt; }}
      .headline {{ line-height: 1.15; margin-bottom: 8pt; text-wrap: balance; }}
      .body {{ line-height: 1.2; text-align: justify; margin: 0 0 8pt 0; }}
      .photo {{ width: 100%; display: block; margin-bottom: 4pt; }}
      .caption {{ font-size: 8.5pt; line-height: 1.3; color: #555; margin-bottom: 8pt; }}
    </style></head>
    <body>
      <div class="page-body">
        <div class="left-col">
          {samarth}
          <div class="split-row">
            {nift}
            {pm_visit}
          </div>
        </div>
        <div class="right-col">
          {prag}
        </div>
      </div>
    </body></html>
    """


def render_body(build_stories):
    """build_stories(scale) -> (samarth_html, prag_html, nift_html, pm_visit_html),
    regenerated at each attempt so a shrink pass actually shrinks every
    element's real pt size (see sized()), not a CSS-relative approximation
    only some of them would obey."""
    width_pt = LIVE_X1 - LIVE_X0
    height_pt = BODY_BOTTOM - BODY_TOP
    scale = 1.0
    for attempt in range(1, MAX_FIT_ATTEMPTS + 1):
        samarth, prag, nift, pm_visit = build_stories(scale)
        html = build_body_html(width_pt, height_pt, samarth, prag, nift, pm_visit)
        out_path = tempfile.mktemp(suffix=".pdf")
        HTML(string=html, base_url=ROOT).write_pdf(out_path)
        doc = fitz.open(out_path)
        page_count = doc.page_count
        if page_count <= 1:
            return out_path, scale, {"fits": True, "shrink_ratio": scale, "attempts": attempt}
        scale -= FIT_SHRINK_STEP
        if scale < MIN_FIT_RATIO:
            return out_path, scale, {"fits": False, "shrink_ratio": scale, "attempts": attempt}
    return out_path, scale, {"fits": False, "shrink_ratio": scale, "attempts": MAX_FIT_ATTEMPTS}


def main():
    STORY_SAMARTH = {
        "kicker": "₹190 કરોડનો પ્રોજેક્ટ, 10,000ને તાલીમ",
        "headline": "IITGNમાં સેમિકન્ડક્ટર તાલીમ હબ 'સામર્થ્ય'નો પ્રારંભ",
        "body": [
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
        "photo": f"{ROOT}/web/public/photos/samarth1.jpg",
    }
    STORY_PRAG = {
        "headline": "IIT ગાંધીનગર દ્વારા નીતિ-સંશોધન માટે 'પ્રાગ' પહેલનો પ્રારંભ",
        "kicker": "ટેકનોલોજી અને શાસનના સંગમ પર નિષ્ણાતોની ચર્ચા, ભૂતપૂર્વ મુખ્ય સચિવો પણ જોડાયા",
        "body": [
            "ગાંધીનગર: IIT ગાંધીનગરે 11 ઓગસ્ટના રોજ 'પ્રાગ' (પોલિસી રિસર્ચ એન્ડ એનાલિટિક્સ ફોર "
            "ગવર્નન્સ) પહેલનો પ્રારંભ કર્યો, જે ટેકનોલોજી, જાહેર નીતિ અને શાસનને એક મંચ પર લાવવાનો પ્રયાસ છે.",
            "સંસ્થાના ફાઉન્ડેશન કાર્યક્રમ અંતર્ગત યોજાયેલ આ પ્રસંગે 'જાહેર નીતિમાં ટેકનોલોજી સંસ્થાઓની "
            "ભૂમિકા' વિષય પર પેનલ ચર્ચા યોજાઈ હતી.",
            "ગુજરાત સરકારના ભૂતપૂર્વ મુખ્ય સચિવ શ્રી રાજ કુમાર અને ભૂતપૂર્વ અધિક મુખ્ય સચિવ શ્રી "
            "જે.પી. ગુપ્તા સહિત અનેક નિષ્ણાતોએ ચર્ચામાં ભાગ લીધો હતો.",
            "પ્રો. પ્રહર્ષ એમ. પટેલ અને પ્રો. દીપક સિંઘાનિયા આ પહેલનું સંકલન કરી રહ્યા છે.",
        ],
        "photo": f"{ROOT}/web/public/photos/prag1.jpg",
        "caption": "IIT ગાંધીનગર ખાતે 'પ્રાગ' પહેલના શુભારંભ પ્રસંગે નિષ્ણાતોની પેનલ ચર્ચા.",
    }
    STORY_NIFT = {
        "kicker": "ITI તાલીમાર્થીઓ માટે નવો યુનિફોર્મ, વિજેતા ટીમને ₹1 લાખનું ઇનામ",
        "headline": "NIFT ગાંધીનગર ખાતે 24 કલાકની યુનિફોર્મ ડિઝાઇન હેકાથોન",
        "body": [
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
        "body": [
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

    def build_stories(scale):
        samarth_html = story_html(
            STORY_SAMARTH["headline"], STORY_SAMARTH["kicker"], STORY_SAMARTH["body"],
            headline_font="BBharatiMaruti", headline_pt=55.0,
            kicker_font="BBharatiGopikaTwo,Bold", kicker_pt=34.0,
            # 2.6, not the photo's own natural aspect -- SAMARTH shares its
            # column with two other stories (measured: left column needed
            # 1038pt against 901pt available, right column only 480pt of
            # 901pt -- confirmed by direct measurement, not assumed), so a
            # shorter banner treatment here is what actually balances the
            # two-column split for today's real content mix.
            photo_path=STORY_SAMARTH["photo"], photo_aspect=2.6, scale=scale,
        )
        prag_html = story_html(
            STORY_PRAG["headline"], STORY_PRAG["kicker"], STORY_PRAG["body"],
            headline_font="BBharatiGopikaTwo,Bold", headline_pt=36.0,
            kicker_font="BBharatiGopikaTwo,Bold", kicker_pt=22.0,
            photo_path=STORY_PRAG["photo"], photo_caption=STORY_PRAG["caption"],
            photo_aspect=1.5, scale=scale,
        )
        nift_html = story_html(
            STORY_NIFT["headline"], STORY_NIFT["kicker"], STORY_NIFT["body"],
            headline_font="BBharatiGopikaTwo,Bold", headline_pt=34.0,
            kicker_font="BBharatiGopikaTwo,Bold", kicker_pt=17.08, scale=scale,
        )
        pmvisit_html = story_html(
            STORY_PM_VISIT["headline"], STORY_PM_VISIT["kicker"], STORY_PM_VISIT["body"],
            headline_font="BBharatiMaruti", headline_pt=49.7,
            kicker_font="BBharatiGopikaTwo,Bold", kicker_pt=24.08, scale=scale,
        )
        return samarth_html, prag_html, nift_html, pmvisit_html

    body_pdf_path, scale, fit = render_body(build_stories)
    print(f"body flow: scale={scale:.3f} fit={fit}")
    if not fit["fits"]:
        raise RuntimeError(f"page-1 body content did not fit even at shrink={scale}: {fit}")

    target = fitz.open(TARGET_PDF)
    page = target[0]
    keep_alive = [build_page1_masthead(page)]

    body_doc = fitz.open(body_pdf_path)
    keep_alive.append(body_doc)
    body_rect = fitz.Rect(LIVE_X0, BODY_TOP, LIVE_X1, BODY_BOTTOM)
    page.show_pdf_page(body_rect, body_doc, 0)

    # ad box row -- unchanged, genuinely static advertising/open-slot space,
    # not part of the variable-content problem this rearchitecture addresses
    tmpl = json.load(open(f"{ROOT}/web/src/lib/template.json"))
    frames = {f["id"]: f for f in tmpl["pages"]["1"]["frames"]}
    draw_open_photo_slot(page, frames["p1-38"])
    draw_open_photo_slot(page, frames["p1-41"])
    draw_open_photo_slot(page, frames["p1-42"], label="STORY SLOT OPEN")
    draw_open_photo_slot(page, frames["p1-43"], label="STORY SLOT OPEN")

    target.save(OUT_PDF)
    print(f"wrote {OUT_PDF}")


if __name__ == "__main__":
    main()
