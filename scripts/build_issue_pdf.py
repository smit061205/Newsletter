#!/usr/bin/env python3
"""Print PDF generator for the backend-driven pipeline
(docs/FRONTEND_ROADMAP.md Part E step 8).

Fetches the SAME validated IssueResponse the website renders (via the
Next.js /api/issue route, web/src/app/api/issue/route.ts, which wraps
fetchIssue() + Zod validation -- this script trusts that validation rather
than re-checking the contract itself), then composites ONE PDF page per
entry in `pages` -- the same generic per-page loop as NewspaperPage.tsx
(Part A: "page count is backend-driven, not hardcoded" -- no
build_page1.py/build_page2.py split here).

Every article's (x, y, width, height) arrives in the SAME coordinate space
the website uses: 300-DPI pixels anchored to (196) Capital Kranti_08
august.pdf's own page geometry (Part B). This script's target PDF page is
built at that SAME native size, so the only conversion needed is px -> pt
(PT_PER_PX = 0.24, gridSpec.ts's own exact 300-DPI ratio) -- unlike the
archived pipeline (archive/legacy-pipeline), there is no separate
canonical-space reconciliation step, because the new target page IS (196)
itself.

Layout within one article's box (kicker / title / photo+caption / body,
stacked top-down) deliberately mirrors ArticleCard.tsx's fixed declared-size
house style, not a per-story hand-tuned layout -- see that file's own
comment for why this is a disclosed simplification, not an oversight.

Usage:
    python3 scripts/build_issue_pdf.py [--url URL] [--out PATH]
"""
import argparse
import json
import os
import sys
import urllib.request

import fitz

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from layout_lib import (  # noqa: E402
    flow_gujarati_text,
    place_photo_cropped,
    draw_open_photo_slot,
    calibrated_font_size,
)

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
HIND_FONT_BOLD = f"{ROOT}/web/fonts/HindVadodara-Bold.ttf"

with open(f"{ROOT}/web/src/lib/header_spec.json") as f:
    HEADER_SPEC = json.load(f)
RAW196 = HEADER_SPEC["header_boxes_raw196_pt"]
COLORS = HEADER_SPEC["colors"]

# gridSpec.ts's own exact 300-DPI ratio (72/300) -- the SAME conversion the
# website applies (see gridSpec.ts's ptToPx/pxToPt), not a separate guess.
PT_PER_PX = 0.24

# Confirmed via fitz on (196) Capital Kranti_08 august.pdf directly this
# session -- see docs/FRONTEND_ROADMAP.md Part B.
PAGE_WIDTH_PT = 1105.50
PAGE_HEIGHT_PT = 1488.20

# Mirrors ArticleCard.tsx's declared sizes exactly -- the website and the
# print PDF must agree on the house style (same reason fonts.ts and
# layout_lib.py's FONT_ROLES/calibration_ratios.json are kept in sync).
TITLE_DECLARED_PT = 34
KICKER_DECLARED_PT = 18
BODY_DECLARED_PT = 13
CAPTION_DECLARED_PT = 8.5
TITLE_FONT = "BBharatiGopikaTwo,Bold"
BODY_FONT = "BBharatiGopikaTwo"
LEADING_RATIO = 1.2  # layout_lib.py's own LEADING_RATIO -- kept in sync, not re-derived

# Lowered from 0.38: at 0.38 a photo could dominate a box that a real
# newspaper page fills mostly with dense text (confirmed by comparing a
# rendered page directly against the real source page -- the source's
# photos read as a modest fraction of each box, not more than a third).
PHOTO_HEIGHT_FRACTION = 0.30  # matches ArticleCard.tsx's own photo-height split exactly

GUJ_DIGITS = "૦૧૨૩૪૫૬૭૮૯"


def to_guj_digits(s):
    return "".join(GUJ_DIGITS[int(c)] if c.isdigit() else c for c in str(s))


def px_to_pt(px):
    return px * PT_PER_PX


def article_frame(article):
    x0 = px_to_pt(article["x"])
    y0 = px_to_pt(article["y"])
    return {
        "x0": x0,
        "y0": y0,
        "x1": x0 + px_to_pt(article["width"]),
        "y1": y0 + px_to_pt(article["height"]),
    }


def resolve_photo_path(photo_url):
    """photoUrl is a web-relative path served from web/public (e.g.
    "/photos/samarth1.jpg") -- resolve it to the same file on disk rather
    than fetching it back over HTTP, since this script already runs on the
    same machine as that public/ directory."""
    return f"{ROOT}/web/public{photo_url}"


def _flow_piece(page, text, frame, source_font, declared_pt, warnings, article_id, role, align="left"):
    """Renders `text` into `frame` via layout_lib's own auto-shrink fit
    check, but -- unlike layout_lib.composite_snippet -- does NOT refuse to
    composite a piece that still doesn't fit after shrinking to
    MIN_FIT_RATIO. This pipeline runs against MOCK fixture data whose box
    sizes are deliberately not hand-measured to fit real content (Part B),
    so a hard raise on every oversized test box would make the whole
    generator useless for exercising the render loop end to end. Instead:
    composite the best-effort (already-shrunk) result and record a warning,
    so a genuine overflow is still visible (in `warnings`, printed after the
    run) rather than silently discarded -- the same "fail loudly, don't
    silently drop" principle, just surfaced as a report instead of a crash.
    Real backend data with properly measured boxes should never hit this."""
    if frame["y1"] - frame["y0"] <= 0 or frame["x1"] - frame["x0"] <= 0 or not text:
        return
    path, size_pt, top_off, fit = flow_gujarati_text(text, frame, source_font, declared_pt, align=align)
    if not fit["fits"]:
        warnings.append(
            f"{article_id}/{role}: did not fit box even at shrink_ratio={fit['shrink_ratio']} "
            f"after {fit['attempts']} attempts -- needs a taller box or an editorial trim"
        )
    rect = fitz.Rect(frame["x0"], frame["y0"] + top_off, frame["x1"], frame["y1"] + top_off)
    snippet_doc = fitz.open(path)
    page.show_pdf_page(rect, snippet_doc, 0)


def render_article(page, article, warnings):
    frame = article_frame(article)
    box_h = frame["y1"] - frame["y0"]
    cursor_y = frame["y0"]

    if article["type"] == "ad":
        photo_url = article.get("photoUrl", "")
        if photo_url:
            try:
                place_photo_cropped(page, frame, resolve_photo_path(photo_url))
            except Exception as e:  # noqa: BLE001 -- see draw_open_photo_slot fallback below
                warnings.append(f"{article['id']}/ad-photo: failed to place ({e}), drew placeholder instead")
                draw_open_photo_slot(page, frame, label="AD PHOTO MISSING")
        else:
            draw_open_photo_slot(page, frame, label="ADVERTISEMENT")
        return

    kicker = article.get("kicker") or ""
    if kicker:
        kicker_size = calibrated_font_size(TITLE_FONT, KICKER_DECLARED_PT)
        # 1.3x, not a flat 1x line: flow_gujarati_text's own fit check adds
        # the font's TOP_LEADING_OFFSET_RATIO shift on top of the nominal
        # line box (see layout_lib.py) -- a frame sized to EXACTLY one line
        # leaves no room for that shift, so even a short one-line kicker
        # was failing the fit check every time (confirmed: every kicker in
        # the mock fixtures flagged, including visually-one-line ones).
        kh = min(kicker_size * LEADING_RATIO * 1.3, frame["y1"] - cursor_y)
        if kh > 0:
            kframe = {"x0": frame["x0"], "y0": cursor_y, "x1": frame["x1"], "y1": cursor_y + kh}
            _flow_piece(page, kicker, kframe, TITLE_FONT, KICKER_DECLARED_PT, warnings, article["id"], "kicker")
            cursor_y += kh

    title_size = calibrated_font_size(TITLE_FONT, TITLE_DECLARED_PT)
    th = min(title_size * LEADING_RATIO * 2, frame["y1"] - cursor_y)  # up to 2 lines, matching the website's visual weight
    if th > 0:
        tframe = {"x0": frame["x0"], "y0": cursor_y, "x1": frame["x1"], "y1": cursor_y + th}
        _flow_piece(page, article["title"], tframe, TITLE_FONT, TITLE_DECLARED_PT, warnings, article["id"], "title")
        cursor_y += th

    photo_url = article.get("photoUrl", "")
    if photo_url:
        ph = min(box_h * PHOTO_HEIGHT_FRACTION, frame["y1"] - cursor_y)
        if ph > 0:
            pframe = {"x0": frame["x0"], "y0": cursor_y, "x1": frame["x1"], "y1": cursor_y + ph}
            try:
                place_photo_cropped(page, pframe, resolve_photo_path(photo_url))
            except Exception as e:  # noqa: BLE001
                warnings.append(f"{article['id']}/photo: failed to place ({e})")
            cursor_y += ph
        caption = article.get("photoCaption") or ""
        if caption:
            ch = min(CAPTION_DECLARED_PT * LEADING_RATIO, frame["y1"] - cursor_y)
            if ch > 0:
                cframe = {"x0": frame["x0"], "y0": cursor_y, "x1": frame["x1"], "y1": cursor_y + ch}
                _flow_piece(page, caption, cframe, BODY_FONT, CAPTION_DECLARED_PT, warnings, article["id"], "caption")
                cursor_y += ch

    body = article.get("bodyText") or ""
    if body and cursor_y < frame["y1"]:
        bframe = {"x0": frame["x0"], "y0": cursor_y, "x1": frame["x1"], "y1": frame["y1"]}
        _flow_piece(page, body, bframe, BODY_FONT, BODY_DECLARED_PT, warnings, article["id"], "body", align="justify")


def _render_edition_bar_snippet(width_pt, height_pt, issue_number, issue_date_str, out_path):
    """WeasyPrint snippet for the edition bar's dynamic text (issue number,
    date), ported from build_header_v2.py's render_edition_bar_snippet --
    same measured spacing constants (see that file's own comment for their
    provenance), just parametrized on the real issue data instead of
    hardcoding today's date."""
    from weasyprint import HTML
    import datetime

    days = ["સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર", "રવિવાર"]
    try:
        y, m, d = (int(p) for p in issue_date_str.split("-"))
        dow = days[datetime.date(y, m, d).weekday()]
        date_str = to_guj_digits(f"{d:02d}-{m:02d}-{y}")
    except Exception:  # noqa: BLE001 -- malformed date shouldn't crash the whole PDF build
        dow = ""
        date_str = to_guj_digits(issue_date_str)

    parts = [
        f"વર્ષ : {to_guj_digits(34)}",
        f"અંક : {to_guj_digits(issue_number)}",
        f"તારીખ : {date_str}" + (f", {dow}" if dow else ""),
        f"કિંમત : {to_guj_digits(50)} પૈસા",
        "તંત્રી : પાર્થ એમ. ઠક્કર",
        "બ્યુરો ચીફ : બિજેન કાપડિયા (અમદાવાદ)",
        "મેનેજિંગ તંત્રી : સુરેશ ચંડી",
    ]
    GAP_BEFORE_BULLET = 14.6 / 2  # WeasyPrint flex-item margin renders at 2x -- halved to compensate (build_header_v2.py)
    GAP_AFTER_BULLET = 7.57 / 2
    pieces = ['<span class="bullet lead">●</span>']
    for i, p in enumerate(parts):
        if i > 0:
            pieces.append('<span class="bullet">●</span>')
        pieces.append(f'<span class="seg">{p}</span>')
    spans = "".join(pieces)
    html = f"""
    <html><head><meta charset="utf-8"><style>
      @font-face {{ font-family: 'HindV'; src: url('file://{HIND_FONT_BOLD}'); }}
      @page {{ size: {width_pt}pt {height_pt}pt; margin: 0; }}
      body {{ margin: 0; font-family: 'HindV', sans-serif; font-weight: 700;
              font-size: 11.9pt; color: rgb(35,31,32);
              display: flex; align-items: center; justify-content: center;
              height: {height_pt}pt; white-space: nowrap; }}
      .seg {{ margin: 0; }}
      .bullet {{ color: rgb(154,104,55); font-size: 13.6pt;
                 margin: 0 {GAP_AFTER_BULLET}pt 0 {GAP_BEFORE_BULLET}pt; }}
      .bullet.lead {{ margin-left: 0; }}
    </style></head>
    <body>{spans}</body></html>
    """
    HTML(string=html, base_url=ROOT).write_pdf(out_path)


def draw_masthead(page, src_doc, issue):
    """Real vector copy of the static masthead region straight out of the
    source PDF (build_header_v2.py's own technique) -- exact, not a
    redrawn approximation like Masthead.tsx's website version needs to be
    (Masthead.tsx is CSS boxes/text because a website can't embed a PDF
    clip; this script can, and a vector copy is strictly more faithful).
    Target and source are now the SAME page space ((196) itself, Part B),
    so the copy is a straight identity-rect placement, no tx()/ty() needed.

    Excludes the edition bar's cream field (drawn+composited separately
    below with fresh dynamic text) -- the source PDF's own cream field
    still has yesterday's specific issue text baked into it as static
    content, which a vector copy would carry over verbatim."""
    x0 = RAW196["navy_box_tagline"]["x0"]
    x1 = RAW196["navy_box_rni"]["x1"]
    y0 = RAW196["navy_box_tagline"]["y0"]
    y1 = RAW196["edition_bar_bg"]["y0"]
    clip = fitz.Rect(x0, y0, x1, y1)
    page.show_pdf_page(clip, src_doc, 0, clip=clip)

    edition_bg = RAW196["edition_bar_bg"]
    tab_left = RAW196["edition_tab_left"]
    tab_right = RAW196["edition_tab_right"]

    def _rect(box):
        return fitz.Rect(box["x0"], box["y0"], box["x1"], box["y1"])

    def _rgb(name):
        r, g, b = (int(v) for v in COLORS[name][4:-1].split(","))
        return (r / 255, g / 255, b / 255)

    page.draw_rect(_rect(edition_bg), color=None, fill=_rgb("edition_bg_cream"))
    page.draw_rect(_rect(tab_left), color=None, fill=_rgb("edition_tab_cyan"))
    page.draw_rect(_rect(tab_right), color=None, fill=_rgb("edition_tab_cyan"))
    border = HEADER_SPEC["edition_border_lines_canonical_pt"]  # border y/width/color are canonical-space-invariant
    cyan = _rgb("edition_tab_cyan")
    page.draw_line(fitz.Point(edition_bg["x0"] - 0.4, edition_bg["y0"]), fitz.Point(edition_bg["x1"] + 0.4, edition_bg["y0"]),
                    color=cyan, width=border["edition_border_top"]["width"])
    page.draw_line(fitz.Point(edition_bg["x0"] - 0.4, edition_bg["y1"]), fitz.Point(edition_bg["x1"] + 0.4, edition_bg["y1"]),
                    color=cyan, width=border["edition_border_bottom"]["width"])

    snippet_path = f"{ROOT}/out/_edition_bar_snippet.pdf"
    _render_edition_bar_snippet(edition_bg["x1"] - edition_bg["x0"], edition_bg["y1"] - edition_bg["y0"],
                                 issue["issueNumber"], issue["issueDate"], snippet_path)
    snippet_doc = fitz.open(snippet_path)
    page.show_pdf_page(_rect(edition_bg), snippet_doc, 0)


def draw_running_header(page, page_num, issue_date, warnings):
    """Provisional pages-2+ header -- explicitly NOT pixel-measured, same
    disclosed limitation as NewspaperPage.tsx's website version (that
    component's own comment: running_header.py's real geometry is still in
    the old (172)-canonical space and hasn't been inverse-transformed to
    (196) raw coordinates the way the masthead was). Kept deliberately
    simple and visibly plain rather than a confident-looking guess."""
    y1 = 26.0
    frame = {"x0": 40.0, "y0": 4.0, "x1": PAGE_WIDTH_PT - 40.0, "y1": y1}
    text = f"{to_guj_digits(page_num)}    કેપિટલ ક્રાંતિ — દૈનિક (ગાંધીનગર)    {to_guj_digits(issue_date)}"
    _flow_piece(page, text, frame, BODY_FONT, 13, warnings, f"page-{page_num}-running-header", "running-header", align="center")
    cyan = tuple(int(v) / 255 for v in COLORS["edition_tab_cyan"][4:-1].split(","))
    page.draw_line(fitz.Point(0, y1 + 4), fitz.Point(PAGE_WIDTH_PT, y1 + 4), color=cyan, width=2.0)


def fetch_issue(url):
    with urllib.request.urlopen(url) as resp:
        return json.load(resp)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--url", default="http://localhost:3000/api/issue",
                     help="Next.js route that wraps fetchIssue() (default: local dev server)")
    ap.add_argument("--out", default=f"{ROOT}/out/issue.pdf")
    args = ap.parse_args()

    issue = fetch_issue(args.url)
    src = fitz.open(SRC_PDF)
    doc = fitz.open()
    warnings = []

    articles_by_page = {}
    for a in issue["articles"]:
        articles_by_page.setdefault(a["page"], []).append(a)

    for page_num in range(1, issue["pages"] + 1):
        page = doc.new_page(width=PAGE_WIDTH_PT, height=PAGE_HEIGHT_PT)
        if page_num == 1:
            draw_masthead(page, src, issue)
        else:
            draw_running_header(page, page_num, issue["issueDate"], warnings)
        for article in articles_by_page.get(page_num, []):
            render_article(page, article, warnings)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    doc.save(args.out)
    print(f"wrote {args.out} ({issue['pages']} page(s), {len(issue['articles'])} article(s))")
    if warnings:
        print(f"\n{len(warnings)} warning(s) -- review before treating this as print-ready:")
        for w in warnings:
            print(f"  - {w}")


if __name__ == "__main__":
    main()
