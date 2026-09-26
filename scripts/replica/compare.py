#!/usr/bin/env python3
"""QA: does the plotted replica look like "(196) Capital Kranti_08 august.pdf"?

The frontend plots whatever the backend positions. For the replica fixture
the backend's positions ARE the printed ones (scripts/mock_backend/
from_source.py), so the downloaded PDF should match the source closely --
this measures how closely, page by page:

  - side-by-side and 50% overlay PNGs in out/compare/;
  - page size: the PDF must be exactly the size the JSON asked for;
  - blank area on an 8pt grid (a cell is blank when it has no ink), source vs
    output, target within +-3 points, and per article (elements grouped by
    articleId), flagged when more than 8 points apart.

Usage:
  curl -s -o out/issue.pdf http://localhost:3000/api/pdf
  python3 scripts/replica/compare.py [--pdf out/issue.pdf] [--issue web/src/mocks/issue-2026-08-08.json]
"""
import argparse
import json
import os
import sys

import fitz
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "(196) Capital Kranti_08 august.pdf")
CELL = 8


def gray(page):
    pix = page.get_pixmap(dpi=72, colorspace=fitz.csGRAY)
    return Image.frombytes("L", (pix.width, pix.height), pix.samples)


def blank_share(img, rect=None):
    if rect is not None:
        img = img.crop(tuple(int(round(v)) for v in rect))
    w, h = img.size
    px = img.load()
    cells = blank = 0
    for cy in range(0, h - CELL + 1, CELL):
        for cx in range(0, w - CELL + 1, CELL):
            cells += 1
            blank += not any(px[x, y] < 200 for y in range(cy, cy + CELL) for x in range(cx, cx + CELL))
    return blank / cells if cells else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", default=os.path.join(ROOT, "out", "issue.pdf"))
    ap.add_argument("--issue", default=os.path.join(ROOT, "web", "src", "mocks", "issue-2026-08-08.json"))
    args = ap.parse_args()
    issue = json.load(open(args.issue))
    pt = 72 / issue["dpi"]
    src, out = fitz.open(SRC), fitz.open(args.pdf)
    os.makedirs(os.path.join(ROOT, "out", "compare"), exist_ok=True)
    failures, report = [], []
    if out.page_count != len(issue["pages"]):
        failures.append(f"PDF has {out.page_count} pages, issue has {len(issue['pages'])}")

    for i, page in enumerate(sorted(issue["pages"], key=lambda p: p["number"])):
        n = page["number"]
        want = (page["width"] * pt, page["height"] * pt)
        got = (out[i].rect.width, out[i].rect.height)
        if abs(want[0] - got[0]) > 0.5 or abs(want[1] - got[1]) > 0.5:
            failures.append(f"page {n}: size {got[0]:.1f}x{got[1]:.1f}pt, JSON asked for {want[0]:.1f}x{want[1]:.1f}pt")
        gs, go = gray(src[i]), gray(out[i])
        if go.size != gs.size:
            go = go.resize(gs.size)
        side = Image.new("L", (gs.width * 2 + 8, gs.height), 128)
        side.paste(gs, (0, 0))
        side.paste(go, (gs.width + 8, 0))
        side.save(os.path.join(ROOT, "out", "compare", f"page-{n}-side.png"))
        Image.merge("RGB", (gs, go, go)).save(os.path.join(ROOT, "out", "compare", f"page-{n}-overlay.png"))

        bs, bo = blank_share(gs), blank_share(go)
        ok = abs(bs - bo) <= 0.03
        report.append(f"page {n}: size {got[0]:.1f}x{got[1]:.1f}pt  blank area source {bs:.1%} output {bo:.1%}  "
                      f"{'OK' if ok else 'FAIL'}")
        if not ok:
            failures.append(f"page {n}: blank area differs by {abs(bs - bo):.1%}")

        groups = {}
        for el in page["elements"]:
            if el.get("articleId") and el["kind"] != "line":
                r = fitz.Rect(el["x"] * pt, el["y"] * pt, (el["x"] + el["width"]) * pt, (el["y"] + el["height"]) * pt)
                groups[el["articleId"]] = groups[el["articleId"]] | r if el["articleId"] in groups else r
        for aid, r in groups.items():
            r &= fitz.Rect(0, 0, gs.width, gs.height)
            a, b = blank_share(gs, r), blank_share(go, r)
            report.append(f"   {aid:26s} blank {a:5.1%} -> {b:5.1%}  {'CHECK' if abs(a - b) > 0.08 else ''}")

    print("\n".join(report))
    print("\nimages: out/compare/page-N-side.png, page-N-overlay.png")
    if failures:
        print(f"\n{len(failures)} failure(s):")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("\nall checks passed")


if __name__ == "__main__":
    main()
