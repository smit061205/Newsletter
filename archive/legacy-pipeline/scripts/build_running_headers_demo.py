#!/usr/bin/env python3
"""Phase 6 proof: builds the running-header strip on pages 2, 3, 4 of the
target PDF -- the last of the 5 'mixed' regions flagged in Phase 2 to still
be unbuilt (the other 4: edition bar was done earlier; p1-39/p1-40,
p2-6, p4-36 remain open, see docs/PRECISION_ROADMAP.md).

Usage: python3 scripts/build_running_headers_demo.py
"""
import sys
import fitz

sys.path.insert(0, "/Users/smitthakkar/NewsPaper_Project/scripts")
from running_header import build_running_header
from layout_lib import calibration_ratio

ROOT = "/Users/smitthakkar/NewsPaper_Project"
SRC_PDF = f"{ROOT}/(196) Capital Kranti_08 august.pdf"
TARGET_PDF = f"{ROOT}/(172) PDF.pdf"
OUT_PDF = f"{ROOT}/out/pages-2-4-running-headers-demo.pdf"


def main():
    src = fitz.open(SRC_PDF)
    target = fitz.open(TARGET_PDF)
    keep_alive = []

    for page_idx in [1, 2, 3]:
        page = target[page_idx]
        snippet = build_running_header(
            page, src, page_idx,
            calibration_ratio_fn=lambda size: size * calibration_ratio("BBharatiGopikaTwo,Bold", size),
        )
        keep_alive.append(snippet)
        print(f"page_idx={page_idx}: running header built")

    target.save(OUT_PDF)
    print(f"wrote {OUT_PDF}")


if __name__ == "__main__":
    main()
