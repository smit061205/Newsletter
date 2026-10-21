#!/usr/bin/env python3
"""Line-by-line check of the plotted replica against the source paper.

For every printed text line in "(196) Capital Kranti_08 august.pdf" (outside
the chrome, which we copy as images), finds the same line in our PDF and
reports how far its baseline and its left/right edges moved. Both PDFs carry
real text, so PyMuPDF gives every line's baseline origin and box -- this is
a measurement, not a visual impression.

  curl -s -o out/issue.pdf http://localhost:3000/api/pdf
  python3 scripts/replica/line_diff.py [--pdf out/issue.pdf] [--baseline 0.5] [--edge 1.5] [--all]

Exit status 1 if any line is off by more than the tolerances.
"""
import argparse
import json
import os
import statistics
import sys

import fitz
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "mock_backend"))
from extract_source import CHROME_BOTTOM, CHROME_TOP  # noqa: E402
from from_source import SRC, page_lines  # noqa: E402


DPI = 200
K = DPI / 72


def ink_map(page):
    """The page as a boolean ink mask (True = ink), DPI dots per inch."""
    pix = page.get_pixmap(dpi=DPI, colorspace=fitz.csGRAY)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width) < 128


def ink_x(mask, x0, x1, y0, y1):
    """Leftmost and rightmost inked x (pt) inside a band, or None."""
    h, w = mask.shape
    a, b = max(0, int(x0 * K)), min(w, int(x1 * K) + 1)
    c, d = max(0, int(y0 * K)), min(h, int(y1 * K) + 1)
    cols = np.nonzero(mask[c:d, a:b].any(axis=0))[0]
    if not len(cols):
        return None
    return (a + cols[0]) / K, (a + cols[-1] + 1) / K


def our_spans(page):
    """Every text span in our PDF with its baseline (Chromium writes a
    justified line as several spans)."""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["text"].strip():
                    out.append({"y": s["origin"][1], "bbox": fitz.Rect(s["bbox"])})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", default=os.path.join(ROOT, "out", "issue.pdf"))
    ap.add_argument("--baseline", type=float, default=0.5, help="pt")
    ap.add_argument("--edge", type=float, default=1.5, help="pt")
    ap.add_argument("--issue", default=os.path.join(ROOT, "web", "src", "mocks", "issue-2026-08-08.json"),
                    help="the plotted JSON: lines printed inside its images (ad copy) aren't text in ours")
    ap.add_argument("--all", action="store_true", help="list every line, not just the faults")
    args = ap.parse_args()

    src, ours = fitz.open(SRC), fitz.open(args.pdf)
    issue = json.load(open(args.issue))
    images = {p["number"]: [fitz.Rect(e["x"] * 0.24, e["y"] * 0.24, (e["x"] + e["width"]) * 0.24, (e["y"] + e["height"]) * 0.24)
                            for e in p["elements"] if e["kind"] == "image"] for p in issue["pages"]}
    faults = 0
    for pno in range(1, src.page_count + 1):
        sp, op = src[pno - 1], ours[pno - 1]
        top, bottom = CHROME_TOP[pno], CHROME_BOTTOM.get(pno, sp.rect.height)
        lines = [l for l in page_lines(sp) if top <= (l["bbox"].y0 + l["bbox"].y1) / 2 <= bottom
                 and not any(r.contains(fitz.Point((l["bbox"].x0 + l["bbox"].x1) / 2, (l["bbox"].y0 + l["bbox"].y1) / 2))
                             for r in images.get(pno, []))]
        spans = our_spans(op)
        sink, oink = ink_map(sp), ink_map(op)
        dys, missing, bad = [], [], []
        for l in lines:
            sb = l["bbox"]
            # our spans on (about) the same baseline whose centres fall inside
            # this line's own x-range -- never a neighbouring column's
            near = [sp for sp in spans if abs(sp["y"] - l["origin_y"]) < 0.6 * max(l["size"], 6)
                    and sb.x0 - 4 <= (sp["bbox"].x0 + sp["bbox"].x1) / 2 <= sb.x1 + 4]
            if not near:
                missing.append(l)
                continue
            y0 = min(near, key=lambda sp: abs(sp["y"] - l["origin_y"]))["y"]
            same = [sp for sp in near if abs(sp["y"] - y0) < 0.6]
            r = {"y": y0, "bbox": fitz.Rect(same[0]["bbox"])}
            for sp in same[1:]:
                r["bbox"] |= sp["bbox"]
            dy = r["y"] - l["origin_y"]
            # edges from the ink, not from PDF text boxes (PyMuPDF misjudges
            # the width of shaped Gujarati clusters in Chromium's PDF): the
            # line's letter body (not so tall that it reaches the line above
            # or below), a little wider
            # than the printed line, in both pages -- the same band the
            # generator aligns ink in
            band = (sb.x0 - 3, sb.x1 + 3, l["origin_y"] - 0.6 * l["size"], l["origin_y"] + 0.1 * l["size"])
            si, oi = ink_x(sink, *band), ink_x(oink, *band)
            if not si or not oi:
                missing.append(l)
                continue
            dl, dr = oi[0] - si[0], oi[1] - si[1]
            dys.append(dy)
            off = abs(dy) > args.baseline or abs(dl) > args.edge or abs(dr) > args.edge
            if off or args.all:
                bad.append((l, dy, dl, dr, off))
        n_off = sum(1 for b in bad if b[4])
        faults += n_off + len(missing)
        med = statistics.median(dys) if dys else 0
        worst = max((abs(d) for d in dys), default=0)
        print(f"page {pno}: {len(lines)} lines, {len(missing)} not found, {n_off} off  "
              f"(baseline median {med:+.2f}pt, worst {worst:.2f}pt)")
        for l, dy, dl, dr, off in sorted(bad, key=lambda b: -max(abs(b[1]), abs(b[2]), abs(b[3]))):
            mark = "OFF" if off else "ok "
            print(f"   {mark} y{l['origin_y']:7.1f}  baseline {dy:+5.2f}  left {dl:+5.2f}  right {dr:+5.2f}  "
                  f"{l['size']:4.1f}pt  {l['text'][:38]}")
        for l in missing:
            print(f"   MISSING y{l['origin_y']:7.1f}  {l['text'][:50]}")
    print("all lines within tolerance" if not faults else f"{faults} line(s) need attention")
    sys.exit(1 if faults else 0)


if __name__ == "__main__":
    main()
