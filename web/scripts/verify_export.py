#!/usr/bin/env python3
"""Regression check: re-measure an exported PDF with PyMuPDF and diff every one of
its frames against src/lib/template.json -- the same extraction technique used to
measure the two source reference PDFs in the first place, run in reverse on our
own output so drift is caught automatically, not by eye.

Usage: python3 scripts/verify_export.py <1|2|3|4> [path/to/export.pdf]
"""
import json, sys, fitz, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
WEB = pathlib.Path(__file__).resolve().parents[1]

page_arg = sys.argv[1] if len(sys.argv) > 1 else "1"
pdf_path = sys.argv[2] if len(sys.argv) > 2 else str(ROOT / "out" / f"page-{page_arg}.pdf")

template = json.load(open(WEB / "src" / "lib" / "template.json"))
page_data = template["pages"][page_arg]
frames = page_data["frames"]

doc = fitz.open(pdf_path)
page = doc[0]

exp_w, exp_h = page_data["page_size_pt"]["width"], page_data["page_size_pt"]["height"]
got_w, got_h = page.rect.width, page.rect.height
print(f"page {page_arg} size: expected {exp_w} x {exp_h} pt | got {got_w:.4f} x {got_h:.4f} pt "
      f"| delta {got_w-exp_w:.4f} x {got_h-exp_h:.4f} pt")

boxes = []
for d in page.get_drawings():
    xs, ys = [], []
    for item in d["items"]:
        if item[0] == "l":
            xs += [item[1].x, item[2].x]
            ys += [item[1].y, item[2].y]
    if xs:
        boxes.append((min(xs), min(ys), max(xs), max(ys)))

worst = 0.0
worst_id = None
unmatched = 0
for f in frames:
    ex0, ey0, ex1, ey1 = f["x0"], f["y0"], f["x1"], f["y1"]
    best, bestd = None, 1e9
    for bx0, by0, bx1, by1 in boxes:
        d = max(abs(bx0-ex0), abs(by0-ey0), abs(bx1-ex1), abs(by1-ey1))
        if d < bestd:
            bestd, best = d, (bx0, by0, bx1, by1)
    if bestd > 1.0:
        unmatched += 1
    if bestd > worst:
        worst, worst_id = bestd, f["id"]

print(f"frames checked: {len(frames)}  |  boxes found in output: {len(boxes)}  |  unmatched (>1pt off): {unmatched}")
print(f"worst-case drift: {worst:.6f} pt (frame {worst_id})")
status = "PASS" if worst < 0.01 and unmatched == 0 else "CHECK"
print(f"[{status}] (threshold: 0.01pt for the pdf-lib export path)")
