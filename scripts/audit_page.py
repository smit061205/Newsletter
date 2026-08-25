#!/usr/bin/env python3
"""Systematic per-page audit tool: dumps EVERY text span (not block -- a block can
silently merge a headline and its deck into one bbox/font if they're visually
close, which hid real structure in page 1's first story) and EVERY vector drawing
op, both reconciled onto the canonical (blank-master) coordinate system.

This is the general-purpose version of the extraction technique that found every
real defect in the header (missing bullet, missing border lines, wrong gaps) --
promoted to a reusable tool per the roadmap (docs/PRECISION_ROADMAP.md, Part B)
instead of being re-written ad hoc for every new page/region.

Usage: python3 scripts/audit_page.py <page_index_0based> [--min-y Y]
"""
import sys
import json
import fitz

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"

ISSUE_ORIGIN, ISSUE_PITCH = 14.2076, 136.1467
CANON_ORIGIN, CANON_PITCH = 15.51, 136.084
SCALE = CANON_PITCH / ISSUE_PITCH
# Confirmed per-page (0-indexed) by deriving each from its own topmost drawn
# rect (running-header box flush to LIVE_AREA.y0=12.064) and cross-verifying
# against template.json's existing frame y-positions -- all 3 pages matched to
# within 0.01pt (see docs/PRECISION_ROADMAP.md Phase 1). Previously only page 0
# had a confirmed offset (-3.166, refined here to -3.164 from a cleaner anchor,
# 0.002pt apart -- within measurement noise, not a real correction).
Y_OFFSET = {0: -3.164, 1: -2.133, 2: -2.133, 3: -2.616}


def tx(x):
    return CANON_ORIGIN + (x - ISSUE_ORIGIN) * SCALE


def ty(y, page_idx):
    return y + Y_OFFSET.get(page_idx, 0.0)


def audit(page_idx, min_y=0.0):
    doc = fitz.open(SRC_PDF)
    page = doc[page_idx]

    spans_out = []
    tdict = page.get_text("dict")
    for block in tdict["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for sp in line.get("spans", []):
                if sp["bbox"][1] < min_y:
                    continue
                text = sp["text"]
                if not text.strip():
                    continue
                c = sp["color"]
                rgb = (c >> 16 & 255, c >> 8 & 255, c & 255) if isinstance(c, int) else c
                spans_out.append({
                    "text": text,
                    "font": sp["font"],
                    "size": round(sp["size"], 2),
                    "color_rgb": rgb,
                    "origin": [round(tx(sp["origin"][0]), 2), round(ty(sp["origin"][1], page_idx), 2)],
                    "bbox": [round(tx(sp["bbox"][0]), 2), round(ty(sp["bbox"][1], page_idx), 2),
                             round(tx(sp["bbox"][2]), 2), round(ty(sp["bbox"][3], page_idx), 2)],
                })
    spans_out.sort(key=lambda s: (s["bbox"][1], s["bbox"][0]))

    drawings_out = []
    for d in page.get_drawings():
        r = d.get("rect")
        if r is None or r.y0 < min_y:
            continue
        stroke = d.get("color")
        rgb = tuple(round(c * 255) for c in stroke) if stroke else None
        fill = d.get("fill")
        fill_rgb = tuple(round(c * 255) for c in fill) if fill else None
        drawings_out.append({
            "rect": [round(tx(r.x0), 2), round(ty(r.y0, page_idx), 2),
                     round(tx(r.x1), 2), round(ty(r.y1, page_idx), 2)],
            "stroke_rgb": rgb,
            "fill_rgb": fill_rgb,
            "width": d.get("width"),
            "items": [it[0] for it in d.get("items", [])],
        })
    drawings_out.sort(key=lambda d: (d["rect"][1], d["rect"][0]))

    images_out = []
    for im in page.get_image_info(hashes=False):
        b = im["bbox"]
        if b[1] < min_y:
            continue
        images_out.append({
            "bbox": [round(tx(b[0]), 2), round(ty(b[1], page_idx), 2),
                     round(tx(b[2]), 2), round(ty(b[3], page_idx), 2)],
        })
    images_out.sort(key=lambda i: (i["bbox"][1], i["bbox"][0]))

    return {"spans": spans_out, "drawings": drawings_out, "images": images_out}


if __name__ == "__main__":
    page_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    min_y = 0.0
    if "--min-y" in sys.argv:
        min_y = float(sys.argv[sys.argv.index("--min-y") + 1])
    result = audit(page_idx, min_y)
    print(f"page {page_idx}: {len(result['spans'])} spans, "
          f"{len(result['drawings'])} drawings, {len(result['images'])} images")
    out_path = f"{ROOT}/out/_audit_page{page_idx}.json"
    json.dump(result, open(out_path, "w"), indent=2, ensure_ascii=False)
    print(f"wrote {out_path}")
