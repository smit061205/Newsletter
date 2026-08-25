#!/usr/bin/env python3
"""Phase 4 (Gujarati flow-layout engine) + Phase 5 (photo pipeline) primitives,
per docs/PRECISION_ROADMAP.md.

Phase 4: flow_gujarati_text() pours arbitrary NEW Gujarati text into a measured
frame rect, using WeasyPrint (the one engine in this stack proven to shape
Gujarati correctly -- see the roadmap's Part A) and the Phase 3 calibration
ratios (never a hand-set font size -- that class of bug, an unmeasured 12.5pt
placeholder, already cost a full session to find once).

Phase 5: place_photo_cropped() center-crops a source image to a frame's exact
aspect ratio before embedding -- never stretch-to-fit, which would be a
visible, avoidable defect.

Both are deliberately general (any frame, any text/image), not one-off code
for a specific story -- that's the actual point of Phase 4/5 over the header's
per-element approach.
"""
import json
import subprocess
import tempfile
import os
import fitz
from weasyprint import HTML
from PIL import Image

ROOT = "/Users/smitthakkar/NewsPaper_Project"
FONTS_DIR = f"{ROOT}/web/fonts"

CALIBRATION = json.load(open(f"{ROOT}/web/src/lib/calibration_ratios.json"))

LEADING_RATIO = 1.2  # gridSpec.ts GRID.LEADING_RATIO, measured exact across all sizes

# Mirrors web/src/lib/fonts.ts BHARATI_MAP -- substitute family, local font file,
# and CSS weight for each source font. Only the roles this project has local
# font files for are usable here; others fall back to a system font with a
# clear console warning rather than a silent wrong render.
FONT_ROLES = {
    "BBharatiGopikaTwo": {
        "family": "HindV", "weight": 400,
        "file": f"{FONTS_DIR}/HindVadodara-Regular.ttf",
    },
    "BBharatiGopikaTwo,Bold": {
        "family": "HindV", "weight": 700,
        "file": f"{FONTS_DIR}/HindVadodara-Bold.ttf",
    },
    # added this session, closing the gap flagged in the roadmap's Part G:
    # headline_L1/masthead-style frames set in these two source fonts were
    # previously unbuildable outright (flow_gujarati_text raised ValueError,
    # correctly refusing to render in a silently-wrong fallback font).
    # Calibration ratios for both were already computed in Phase 3
    # (calibration_ratios.json) -- only the local font files were missing.
    "BBharatiTitleTwo": {
        "family": "BalooBhai2", "weight": 700,
        "file": f"{FONTS_DIR}/BalooBhai2-Bold.ttf",
    },
    "BBharatiMaruti": {
        "family": "MuktaVaani", "weight": 700,
        "file": f"{FONTS_DIR}/MuktaVaani-Bold.ttf",
    },
}

INK_NEAR_BLACK = "rgb(35,31,32)"


def calibration_ratio(source_font, declared_size_pt):
    """Python port of fonts.ts's calibrationRatio() -- same size-banded
    override for BBharatiMaruti, same fallback to the flat median otherwise.
    Kept as a straight port (not shared code) since this is a separate Python
    runtime from the Next.js/TS side; both read the same calibration_ratios.json
    so there is exactly one source of TRUTH even though there are two
    implementations of the lookup."""
    entry = CALIBRATION.get(source_font)
    if not entry:
        return 1.0
    bands = entry.get("size_band_ratios")
    if bands:
        for band in bands:
            lo, hi = band["size_range"]
            if lo <= declared_size_pt <= hi:
                return band["ratio"]
    return entry["ratio_median"]


def calibrated_font_size(source_font, declared_size_pt):
    return declared_size_pt * calibration_ratio(source_font, declared_size_pt)


# Measured per source font (NOT a universal constant -- see below): with
# line-height:1.2, the first line's glyph-ink top sits ABOVE the nominal CSS
# line-box top by a fixed ratio of the rendered font size. Confirmed exactly
# proportional across sizes 10-50pt for every font tested (four decimal
# places stable, not just approximately close), so it's real font-metric
# behavior, not noise -- but the ratio itself is font-specific, not shared:
# Hind Vadodara measured 0.1490 (both weights, identical), while adding
# BBharatiTitleTwo/BBharatiMaruti support this session found Baloo Bhai 2 at
# 0.2110 and Mukta Vaani at 0.2310 -- an earlier version of this constant
# assumed one global ratio (0.149, derived only from Hind Vadodara, the only
# font available at the time) and silently mis-positioned the first two new
# fonts by ~1-1.5pt (caught immediately by the QA harness once real frames in
# those fonts were tested, not before). Compositing the snippet shifted down
# by the source font's own ratio aligns the actual visible glyph top with
# the frame's own y0.
TOP_LEADING_OFFSET_RATIOS = {
    "BBharatiGopikaTwo": 0.1490,
    "BBharatiGopikaTwo,Bold": 0.1490,
    "BBharatiTitleTwo": 0.2110,
    "BBharatiMaruti": 0.2310,
}
DEFAULT_TOP_LEADING_OFFSET_RATIO = 0.1490  # fallback for any future font role, flagged not measured


# Phase 9 (docs/PRECISION_ROADMAP.md): WeasyPrint paginates content that
# overflows a fixed-height @page onto additional PDF pages rather than
# clipping it -- confirmed by deliberately overflowing a test frame (9 pages
# produced from one long paragraph). composite_snippet() only ever places
# page 0 of a snippet, so unchecked overflow is SILENT DATA LOSS, not a
# visible defect -- caught before it shipped anywhere by testing the
# overflow case directly rather than assuming the happy-path tests (none of
# which happened to overflow) meant this was fine. Auto-shrink is a bounded,
# measured mechanical fix (glyphs get smaller, nothing is cut); if that's not
# enough, this is an editorial decision (what to trim) that software must not
# make silently -- see MIN_FIT_RATIO.
MIN_FIT_RATIO = 0.85  # floor: below this, flag for editorial review instead of keep shrinking
FIT_SHRINK_STEP = 0.03
MAX_FIT_ATTEMPTS = 6


def flow_gujarati_text(text, frame, source_font, declared_size_pt, *,
                        align="left", color=INK_NEAR_BLACK, out_path=None):
    """Renders `text` into a WeasyPrint snippet PDF sized exactly to `frame`
    (a dict with x0,y0,x1,y1 in canonical pt), using the calibrated substitute
    font size for source_font -- auto-shrinking (down to MIN_FIT_RATIO of the
    calibrated size) if the text would otherwise overflow onto additional
    PDF pages that composite_snippet() can't see. Returns (snippet_path,
    actual_size_pt, top_offset_pt, fit_status) where fit_status is
    {"fits": bool, "shrink_ratio": float, "attempts": int} -- the caller
    (the Phase 9 orchestrator) must check fits before compositing; if False,
    this is content that needs an editorial trim, not something to ship with
    silently dropped text.
    """
    role = FONT_ROLES.get(source_font)
    if role is None:
        raise ValueError(f"no local font file registered for {source_font!r} -- "
                          f"add it to FONT_ROLES before using this source font")
    base_size_pt = calibrated_font_size(source_font, declared_size_pt)
    width_pt = frame["x1"] - frame["x0"]
    height_pt = frame["y1"] - frame["y0"]
    if out_path is None:
        out_path = tempfile.mktemp(suffix=".pdf")

    offset_ratio = TOP_LEADING_OFFSET_RATIOS.get(source_font, DEFAULT_TOP_LEADING_OFFSET_RATIO)
    shrink_ratio = 1.0
    fits = False
    attempt = 0
    size_pt = base_size_pt
    for attempt in range(1, MAX_FIT_ATTEMPTS + 1):
        size_pt = base_size_pt * shrink_ratio
        html = f"""
        <html><head><meta charset="utf-8"><style>
          @font-face {{ font-family: 'HindV'; src: url('file://{role["file"]}');
                        font-weight: {role["weight"]}; }}
          @page {{ size: {width_pt}pt {height_pt}pt; margin: 0; }}
          body {{ margin: 0; font-family: 'HindV', sans-serif; font-weight: {role["weight"]};
                  font-size: {size_pt}pt; line-height: {LEADING_RATIO};
                  color: {color}; text-align: {align};
                  width: {width_pt}pt; overflow-wrap: break-word; }}
        </style></head>
        <body>{text}</body></html>
        """
        HTML(string=html, base_url=ROOT).write_pdf(out_path)
        snippet_doc = fitz.open(out_path)
        page_count = snippet_doc.page_count
        # A page_count of 1 only means WeasyPrint's OWN pagination didn't
        # overflow -- it says nothing about composite_snippet()'s later
        # top_offset_pt shift, which translates the whole rendered block
        # down by offset_ratio * size_pt to fix the top-of-line glyph
        # overshoot (see TOP_LEADING_OFFSET_RATIOS). For a frame with little
        # vertical slack (a tight single-line headline box), that downward
        # shift can push the last line past the frame's own y1 even though
        # WeasyPrint's pagination was satisfied -- found by testing a real
        # tight frame (p2-8) with the newly-added Baloo Bhai 2 font, whose
        # 0.211 offset ratio is much larger than Hind Vadodara's 0.149, so
        # the effect that was invisible on every frame tested before this
        # session's font-role work became a real, measurable 1.15pt
        # post-shift bottom overflow. Checked here directly against the
        # actual rendered content's own bottom extent, not assumed away.
        post_shift_overflow = False
        if page_count <= 1:
            tdict = snippet_doc[0].get_text("dict")
            max_y1 = 0.0
            for block in tdict["blocks"]:
                for line in block.get("lines", []):
                    for sp in line.get("spans", []):
                        max_y1 = max(max_y1, sp["bbox"][3])
            top_offset_pt = size_pt * offset_ratio
            post_shift_overflow = (max_y1 + top_offset_pt) > height_pt
        if page_count <= 1 and not post_shift_overflow:
            fits = True
            break
        shrink_ratio -= FIT_SHRINK_STEP
        if shrink_ratio < MIN_FIT_RATIO:
            break

    top_offset_pt = size_pt * offset_ratio
    fit_status = {"fits": fits, "shrink_ratio": round(shrink_ratio, 3), "attempts": attempt}
    return out_path, size_pt, top_offset_pt, fit_status


def composite_snippet(target_page, frame, snippet_path, top_offset_pt=0.0, fit_status=None):
    """Composites a WeasyPrint-rendered snippet onto target_page at frame's
    exact rect, via the same show_pdf_page() mechanism used for the static
    masthead and the edition bar -- one consistent placement path for
    everything this pipeline draws, static or dynamic. `top_offset_pt`
    (from flow_gujarati_text) shifts the target rect down so the first
    line's actual glyph-ink aligns with the frame's own y0 -- see
    TOP_LEADING_OFFSET_RATIOS. In this coordinate system y increases downward
    (page-space, top-left origin) and the glyph-ink renders ABOVE the
    nominal line-box top, so aligning it means moving the target rect DOWN
    -- i.e. ADDING the offset. A first attempt here subtracted it, which
    shifted the rect further up and doubled the discrepancy instead of
    fixing it -- caught immediately by re-running the QA harness after the
    "fix" rather than assuming it worked.

    `fit_status` (from flow_gujarati_text) is checked as a second guard even
    though callers are expected to check it themselves first: compositing a
    snippet that didn't fit would only ever place its page 0, silently
    dropping the overflow content (see MIN_FIT_RATIO) -- refusing here too
    means a caller that forgets the check fails loudly instead of shipping
    truncated text."""
    if fit_status is not None and not fit_status["fits"]:
        raise ValueError(
            f"refusing to composite frame {frame.get('id','?')}: content did not fit even at "
            f"shrink_ratio={fit_status['shrink_ratio']} after {fit_status['attempts']} attempts -- "
            f"this needs an editorial trim, not a silent drop of the overflow text"
        )
    rect = fitz.Rect(frame["x0"], frame["y0"] + top_offset_pt, frame["x1"], frame["y1"] + top_offset_pt)
    snippet_doc = fitz.open(snippet_path)
    target_page.show_pdf_page(rect, snippet_doc, 0)
    return snippet_doc  # caller must keep a reference alive until page.save()


def crop_to_aspect(image_path, target_aspect, out_path=None):
    """Center-crops image_path to target_aspect (width/height) -- never
    stretches. Returns the cropped image path."""
    im = Image.open(image_path)
    w, h = im.size
    src_aspect = w / h
    if src_aspect > target_aspect:
        # source is wider than target -- crop left/right
        new_w = round(h * target_aspect)
        x0 = (w - new_w) // 2
        box = (x0, 0, x0 + new_w, h)
    else:
        # source is taller than target -- crop top/bottom
        new_h = round(w / target_aspect)
        y0 = (h - new_h) // 2
        box = (0, y0, w, y0 + new_h)
    cropped = im.crop(box)
    if out_path is None:
        out_path = tempfile.mktemp(suffix=".jpg")
    cropped.convert("RGB").save(out_path, "JPEG", quality=92)
    return out_path


def place_photo_cropped(target_page, frame, image_path):
    """Crops image_path to frame's exact aspect ratio (never stretch) and
    embeds it filling the frame rect exactly."""
    width_pt = frame["x1"] - frame["x0"]
    height_pt = frame["y1"] - frame["y0"]
    target_aspect = width_pt / height_pt
    cropped_path = crop_to_aspect(image_path, target_aspect)
    rect = fitz.Rect(frame["x0"], frame["y0"], frame["x1"], frame["y1"])
    target_page.insert_image(rect, filename=cropped_path)
    return cropped_path


def draw_open_photo_slot(target_page, frame, label="PHOTO SLOT OPEN"):
    """Honest placeholder for a photo frame with no sourced image yet --
    same spirit as the project's existing AD_PLACEHOLDER_IDS/OPEN_STORY_SLOT_IDS
    pattern (label what it is, don't fake content or leave it silently blank).
    Label is plain ASCII deliberately: PyMuPDF's own insert_textbox() uses its
    built-in font, which -- like insert_text() (see the roadmap's Part A) --
    cannot render Gujarati Unicode; it silently prints '?' glyphs instead of
    erroring. A Gujarati label here would need the same WeasyPrint-snippet
    route as real content, which is overkill for a debug/placeholder marker
    that should never actually ship to print."""
    rect = fitz.Rect(frame["x0"], frame["y0"], frame["x1"], frame["y1"])
    target_page.draw_rect(rect, color=(0.7, 0.7, 0.7), width=1.0, dashes="[4] 0")
    target_page.insert_textbox(rect, label, fontsize=10, color=(0.6, 0.6, 0.6),
                                align=fitz.TEXT_ALIGN_CENTER)
