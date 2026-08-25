#!/usr/bin/env python3
"""Builds the running-header strip for pages 2-4 -- the 'mixed' region flagged
in Phase 2 (docs/PRECISION_ROADMAP.md) as inventoried but unbuilt. Same
two-mechanism pattern as everything else in this pipeline: vector-copy the
static majority of the strip (wordmark text x2, page-folio number, and a
dense row of ~24 decorative diamonds -- discovered this session to differ in
both count and background color from page 1's masthead treatment, so it is
copied whole rather than hand-reproduced) via show_pdf_page(), then
erase-and-repaint only the one genuinely dynamic piece: the date/day stamp.

Per-page raw geometry (issue-space) and fill colors were measured directly
off the source PDF this session -- see docs/PRECISION_ROADMAP.md Phase 6.
"""
import sys
import datetime
import fitz
from weasyprint import HTML

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from geometry import tx, ty

ROOT = "/Users/smitthakkar/NewsPaper_Project"
HIND_FONT_BOLD = f"{ROOT}/web/fonts/HindVadodara-Bold.ttf"
GUJ_DIGITS = "૦૧૨૩૪૫૬૭૮૯"


def to_guj_digits(s):
    return "".join(GUJ_DIGITS[int(c)] if c.isdigit() else c for c in str(s))


# Measured directly off the source PDF this session, all 3 pages in one
# consolidated extraction pass (out/_running_header_geometry.json) -- an
# earlier hand-copied version of this dict cross-contaminated values between
# pages (page 3's erase_x ended up under page 2's key) by pasting from
# separate script runs; loading the single verified JSON instead of
# hand-transcribing avoids that class of mistake recurring.
import json as _json
_GEO_RAW = _json.load(open(f"{ROOT}/out/_running_header_geometry.json"))
PAGE_GEOMETRY = {
    int(k): {
        "raw_clip": tuple(v["raw_clip"]),
        "fill_rgb": tuple(v["fill_rgb"]),
        "box_y": tuple(v["box_y"]),
        "erase_x": tuple(v["erase_x"]),
        "date_span": {"origin": tuple(v["date_origin"]), "size": v["date_size"]},
    }
    for k, v in _GEO_RAW.items()
}


def render_date_snippet(date_str, width_pt, height_pt, size_pt, out_path):
    html = f"""
    <html><head><meta charset="utf-8"><style>
      @font-face {{ font-family: 'HindV'; src: url('file://{HIND_FONT_BOLD}'); font-weight: 700; }}
      @page {{ size: {width_pt}pt {height_pt}pt; margin: 0; }}
      body {{ margin: 0; font-family: 'HindV', sans-serif; font-weight: 700;
              font-size: {size_pt}pt; color: rgb(255,255,255);
              display: flex; align-items: center; height: {height_pt}pt;
              white-space: nowrap; }}
    </style></head>
    <body>{date_str}</body></html>
    """
    HTML(string=html, base_url=ROOT).write_pdf(out_path)


def build_running_header(target_page, src_doc, page_idx, date=None, calibration_ratio_fn=None):
    """Vector-copies the running-header strip from src_doc page `page_idx`
    onto target_page (same canonical page), then erase-repaints the date/day
    stamp for `date` (defaults to today). Returns the snippet doc (caller
    must keep it alive until target save)."""
    geo = PAGE_GEOMETRY[page_idx]
    rx0, ry0, rx1, ry1 = geo["raw_clip"]
    src_clip = fitz.Rect(rx0, ry0, rx1, ry1)
    tgt_rect = fitz.Rect(tx(src_clip.x0), ty(src_clip.y0, page_idx),
                          tx(src_clip.x1), ty(src_clip.y1, page_idx))
    target_page.show_pdf_page(tgt_rect, src_doc, page_idx, clip=src_clip)

    # erase just the date sub-region (safely clear of the diamond decorations
    # on either side -- see docs/PRECISION_ROADMAP.md Phase 6) and repaint
    fill = tuple(c / 255 for c in geo["fill_rgb"])
    erase_rect = fitz.Rect(
        tx(geo["erase_x"][0]), ty(geo["box_y"][0], page_idx),
        tx(geo["erase_x"][1]), ty(geo["box_y"][1], page_idx),
    )
    target_page.draw_rect(erase_rect, color=None, fill=fill)

    date = date or datetime.date.today()
    days = ["સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર", "રવિવાર"]
    dow = days[date.weekday()]
    date_str = to_guj_digits(date.strftime("%d-%m-%Y"))
    text = f"તારીખ : {date_str}, {dow}"

    declared_size = geo["date_span"]["size"]
    size_pt = calibration_ratio_fn(declared_size) if calibration_ratio_fn else declared_size
    origin_x, origin_y = geo["date_span"]["origin"]
    # place using the same origin (baseline-anchor) technique established for
    # the header work, not a bbox/flex-center guess
    tx_o, ty_o = tx(origin_x), ty(origin_y, page_idx)
    date_rect = fitz.Rect(tx_o, ty_o - size_pt * 1.1, tx_o + 200, ty_o + 4)
    snippet_path = f"{ROOT}/out/_running_header_date_p{page_idx}.pdf"
    render_date_snippet(text, width_pt=date_rect.width, height_pt=date_rect.height,
                         size_pt=size_pt, out_path=snippet_path)
    snippet_doc = fitz.open(snippet_path)
    target_page.show_pdf_page(date_rect, snippet_doc, 0)
    return snippet_doc
