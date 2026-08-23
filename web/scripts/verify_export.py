#!/usr/bin/env python3
"""Regression check: re-measure an exported PDF with PyMuPDF and diff it against
the frame data + grid spec that were supposed to produce it. This is the same
extraction technique used to measure the two reference PDFs in the first place --
run it on every export, not just this once, so drift is caught in CI, not by eye.

Usage: python3 scripts/verify_export.py [path/to/export.pdf]
"""
import json, sys, fitz, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
WEB = pathlib.Path(__file__).resolve().parents[1]

pdf_path = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "out" / "page-1.pdf")
grid_spec = json.load(open(ROOT / "capital_kranti_grid_spec.json"))
frame_data = json.load(open(WEB / "src" / "lib" / "frames.json"))

doc = fitz.open(pdf_path)
page = doc[0]

exp_w, exp_h = grid_spec["page_size_pt"]["width"], grid_spec["page_size_pt"]["height"]
got_w, got_h = page.rect.width, page.rect.height
print(f"page size: expected {exp_w} x {exp_h} pt | got {got_w:.4f} x {got_h:.4f} pt "
      f"| delta {got_w-exp_w:.4f} x {got_h-exp_h:.4f} pt")

# collect all drawn rectangles (pdf-lib emits 4-line paths, not 're' primitives)
boxes = []
for d in page.get_drawings():
    xs, ys = [], []
    for item in d["items"]:
        if item[0] == "l":
            xs += [item[1].x, item[2].x]
            ys += [item[1].y, item[2].y]
    if xs:
        boxes.append((min(xs), min(ys), max(xs), max(ys)))

print(f"\n{'frame':22} {'expected (pt, top-left origin)':38} {'measured (pt)':38} {'max |delta| pt'}")
worst = 0.0
# NOTE: fitz normalizes drawing coordinates to the page's top-left display space,
# same convention as frames.json -- no manual y-flip needed here (that flip only
# happens once, inside export-page1.mjs, to satisfy the PDF content stream's own
# bottom-left coordinate system).
for f in frame_data["frames"]:
    ex0, ey0, ex1, ey1 = f["x0"], f["y0"], f["x1"], f["y1"]
    best, bestd = None, 1e9
    for bx0, by0, bx1, by1 in boxes:
        d = max(abs(bx0-ex0), abs(by0-ey0), abs(bx1-ex1), abs(by1-ey1))
        if d < bestd:
            bestd, best = d, (bx0, by0, bx1, by1)
    worst = max(worst, bestd)
    print(f"{f['id']:22} ({ex0:8.3f},{ey0:8.3f},{ex1:8.3f},{ey1:8.3f})  "
          f"({best[0]:8.4f},{best[1]:8.4f},{best[2]:8.4f},{best[3]:8.4f})  {bestd:.6f}")

print(f"\nworst-case drift across {len(frame_data['frames'])} frames: {worst:.6f} pt")
status = "PASS" if worst < 0.01 else "CHECK"
print(f"[{status}] (threshold: 0.01pt for the pdf-lib export path)")
