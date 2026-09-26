#!/usr/bin/env python3
"""QA: how closely does the rendered issue match "(196) Capital Kranti_08
august.pdf"? Turns "looks like the source" into numbers you can re-run.

For every page:
  - side-by-side and 50% overlay PNGs (out/compare/);
  - blank-area share: the page on an 8pt grid, a cell is blank when <0.5%
    of it has ink. Source vs output, target within +-3 points;
and for every article box:
  - blank-area share inside the box, source vs output (flag if >12 points apart),
  - ink ratio output/source (a proxy for text density; the substitute fonts
    are lighter than Bharati, so ~0.7-1.0 is expected, not 1.0),
  - the engine's own fill result (layout.json) and any overflow,
plus a check that no two article boxes on a page overlap.

Usage: python3 scripts/replica/compare.py [--pdf out/issue.pdf]
       [--issue web/src/mocks/replica/issue-2026-08-08.json]
"""
import argparse
import json
import os
import sys

import fitz
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "layout"))
from engine import ROOT, SRC_PDF, resolve_issue  # noqa: E402

DPI = 72
CELL = 8  # pt
PT_PER_PX = 0.24


def gray(page):
    pix = page.get_pixmap(dpi=DPI, colorspace=fitz.csGRAY)
    return Image.frombytes("L", (pix.width, pix.height), pix.samples)


def ink_stats(img, rect=None):
    """(ink share, blank-cell share) within rect (pt; pixels == pt at 72 DPI)."""
    if rect:
        img = img.crop(tuple(int(round(v)) for v in rect))
    w, h = img.size
    px = img.load()
    ink = blank = cells = 0
    for cy in range(0, h - CELL + 1, CELL):
        for cx in range(0, w - CELL + 1, CELL):
            n = sum(1 for yy in range(cy, cy + CELL) for xx in range(cx, cx + CELL) if px[xx, yy] < 200)
            ink += n
            cells += 1
            blank += n < CELL * CELL * 0.005
    return (ink / (cells * CELL * CELL) if cells else 0.0), (blank / cells if cells else 0.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", default=os.path.join(ROOT, "out", "issue.pdf"))
    ap.add_argument("--issue", default=os.path.join(ROOT, "web", "src", "mocks", "replica", "issue-2026-08-08.json"))
    args = ap.parse_args()

    issue = json.load(open(args.issue))
    layout = json.load(open(os.path.join(resolve_issue(issue, os.path.join(ROOT, "out", "engine")), "layout.json")))
    stats = layout.get("articles", {})
    src, out = fitz.open(SRC_PDF), fitz.open(args.pdf)
    os.makedirs(os.path.join(ROOT, "out", "compare"), exist_ok=True)

    failures, report = [], []
    for n in range(1, issue["pages"] + 1):
        gs, go = gray(src[n - 1]), gray(out[n - 1])
        side = Image.new("L", (gs.width * 2 + 8, gs.height), 128)
        side.paste(gs, (0, 0))
        side.paste(go, (gs.width + 8, 0))
        side.save(os.path.join(ROOT, "out", "compare", f"page-{n}-side.png"))
        Image.merge("RGB", (gs, go, go)).save(os.path.join(ROOT, "out", "compare", f"page-{n}-overlay.png"))

        _, blank_s = ink_stats(gs)
        _, blank_o = ink_stats(go)
        ok = abs(blank_s - blank_o) <= 0.03
        report.append(f"page {n}: blank area source {blank_s:.1%}  output {blank_o:.1%}  "
                      f"{'OK' if ok else 'FAIL'}")
        if not ok:
            failures.append(f"page {n} blank area differs by {abs(blank_s - blank_o):.1%}")

        arts = [a for a in issue["articles"] if a["page"] == n]
        rects = {a["id"]: fitz.Rect(a["x"] * PT_PER_PX, a["y"] * PT_PER_PX,
                                    (a["x"] + a["width"]) * PT_PER_PX, (a["y"] + a["height"]) * PT_PER_PX)
                 for a in arts}
        ids = list(rects)
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                inter = rects[a] & rects[b]
                if not inter.is_empty and inter.width > 2 and inter.height > 2:
                    failures.append(f"page {n}: boxes overlap {a} / {b}")
        for a in arts:
            r = rects[a["id"]]
            ink_s, bl_s = ink_stats(gs, r)
            ink_o, bl_o = ink_stats(go, r)
            st = stats.get(a["id"], {})
            flag = abs(bl_s - bl_o) > 0.12 or (st and not st.get("fits", True))
            report.append(f"   {a['id']:24s} {a['type']:7s} blank {bl_s:5.1%} -> {bl_o:5.1%}  "
                          f"ink x{(ink_o / ink_s if ink_s else 0):4.2f}  "
                          f"fill {st.get('fill', '-')!s:5s} {'CHECK' if flag else ''}")
            if st and not st.get("fits", True):
                failures.append(f"{a['id']}: text overflowed its box")

    print("\n".join(report))
    print(f"\nimages: out/compare/page-N-side.png, page-N-overlay.png")
    if failures:
        print(f"\n{len(failures)} failure(s):")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("\nall checks passed")


if __name__ == "__main__":
    main()
